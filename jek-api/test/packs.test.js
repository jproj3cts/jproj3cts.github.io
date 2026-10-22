import { env, exports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIRM } from '../src/account.js';
import { cleanDomain } from '../src/packs.js';
import { canon, packHash, sigMessage, unb64u } from '../src/packsig.js';
import { call, send, signedIn, withPlan } from './helpers.js';

const OPS = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
// the app's TEST public key (jekray src/core/packsig.js), the pair of PACK_SIGNING_KEY in vitest.config.js
const TEST_PUBLIC = 'GHJ888iIUQbtlhN8uwy2QJv8Nzsdj-_XUKPRFUJNJqE';
const ops = (path, method = 'GET', body) =>
  call(path, { method, origin: null, body: body && JSON.stringify(body), headers: { Authorization: `Bearer ${OPS}`, 'Content-Type': 'application/json' } });
const json = async (p) => { const r = await p; return { status: r.status, body: await r.json() }; };
let n = 0;
const pack = (id, extra = {}) => ({ format: 'jekpack', version: 1, id, name: 'Pack ' + ++n, packVersion: '1', parts: [{ name: 'M', elements: [{ type: 'mirror', id: 'm', x: 0, y: 0 }] }], ...extra });
const sign = (who, p, as) => json(send('/v1/packs/sign', 'POST', who.token, as ? { pack: p, as } : { pack: p }));
const status = (q) => json(call('/v1/packs/status?' + q, { origin: null }));
const pub = () => crypto.subtle.importKey('raw', unb64u(TEST_PUBLIC), { name: 'Ed25519' }, false, ['verify']);
const checks = async (sig) => crypto.subtle.verify({ name: 'Ed25519' }, await pub(), unb64u(sig.s), sigMessage(sig));
let saved;
afterEach(() => { if (saved !== undefined) { env.PACK_SIGNING_KEY = saved; saved = undefined; } vi.restoreAllMocks(); });

describe('signing a pack', () => {
  it('needs a session, and from the app', async () => {
    expect((await call('/v1/packs/sign', { method: 'POST', body: JSON.stringify({ pack: pack('a.b') }), headers: { 'Content-Type': 'application/json' } })).status).toBe(401);
    const A = await signedIn();
    const r = await call('/v1/packs/sign', { method: 'POST', token: A.token, origin: 'https://evil.example', body: JSON.stringify({ pack: pack('a.b') }), headers: { 'Content-Type': 'application/json' } });
    expect(r.status).toBe(403);
  });

  it('signs as the account, a signature the app’s key checks, over the pack’s canonical hash', async () => {
    const A = await signedIn('Ada Lovelace');
    const p = pack('ada.lenses', { author: 'whoever', sig: { junk: 1 } });
    const r = await sign(A, p);
    expect(r.status).toBe(200);
    const { sig, hash, claimed } = r.body;
    expect(claimed).toBe(true);
    expect(sig).toMatchObject({ alg: 'Ed25519', v: 1, id: 'ada.lenses', by: { kind: 'person', id: A.user.id, name: 'Ada Lovelace' } });
    expect(typeof sig.at).toBe('number');
    // the hash leaves out any sig the pack came with, and keys' order does not matter
    expect(hash).toBe(await packHash(p));
    expect(hash).toBe(await packHash(JSON.parse(canon({ ...p, sig: undefined }))));
    expect(sig.hash).toBe(hash);
    expect(await checks(sig)).toBe(true);
    expect(await checks({ ...sig, hash: 'f'.repeat(64) })).toBe(false);
    expect(await checks({ ...sig, by: { ...sig.by, name: 'Someone else' } })).toBe(false);
    // the key the app is told of is the same
    const k = await json(call('/v1/packs/key', { origin: null }));
    expect(k.body).toEqual({ alg: 'Ed25519', key: TEST_PUBLIC, v: 1 });
    // and the API checks it for a browser that cannot
    expect((await json(send('/v1/packs/verify', 'POST', undefined, { sig }))).body).toEqual({ valid: true });
    expect((await json(send('/v1/packs/verify', 'POST', undefined, { sig: { ...sig, at: sig.at + 1 } }))).body).toEqual({ valid: false });
    expect((await json(send('/v1/packs/verify', 'POST', undefined, { sig: 'nonsense' }))).body).toEqual({ valid: false });
  });

  it('claims the id for its first signer; only they sign it again', async () => {
    const A = await signedIn(), B = await signedIn();
    expect((await sign(A, pack('lab.kit'))).body.claimed).toBe(true);
    const again = await sign(A, pack('lab.kit', { packVersion: '2' }));
    expect([again.status, again.body.claimed]).toEqual([200, false]);
    const other = await sign(B, pack('lab.kit'));
    expect([other.status, other.body.error.code]).toEqual([409, 'id_taken']);
    const s = await status('ids=lab.kit,no.such');
    expect(s.body.ids['lab.kit'].owner).toEqual({ kind: 'person', id: A.user.id, name: A.user.name });
    expect(s.body.ids['no.such']).toBeUndefined();
  });

  it('keeps jek, jekray, jeksys and the ids under them for JEK Systems and those it names', async () => {
    const B = await signedIn();
    for (const id of ['jek', 'jek.example', 'jekray', 'jekray.parts', 'jeksys', 'jeksys.lenses']) expect((await sign(B, pack(id))).body.error.code).toBe('id_reserved');
    expect((await sign(B, pack('jekyll.parts'))).status).toBe(200);   // only those names, and those with a dot after them
    expect((await sign(B, pack('jekrayfan.parts'))).status).toBe(200);
    expect((await json(ops('/ops/packs/reserve', 'POST', { user: B.user.email }))).status).toBe(200);
    expect((await sign(B, pack('jek.b-parts'))).status).toBe(200);
    const mine = await json(ops('/ops/packs/sign', 'POST', { pack: pack('jek.example', { version: 2, code: 'jek.plate("x", {})' }) }));
    expect(mine.status).toBe(200);
    expect(mine.body.sig.by).toEqual({ kind: 'org', id: 'jek', name: 'JEK Systems', domain: 'jeksys.net' });
    expect(await checks(mine.body.sig)).toBe(true);
    await ops('/ops/packs/reserve', 'POST', { user: B.user.id, on: false });
    expect((await sign(B, pack('jek.b-parts'))).body.error.code).toBe('id_reserved');
  });

  it('refuses what is not a pack, and packs too large', async () => {
    const A = await signedIn();
    for (const [p, code] of [
      [{ format: 'jekray', id: 'a.b' }, 'bad_pack'],
      [pack('Upper.Case'), 'bad_pack'],
      [pack('a'), 'bad_pack'],
      [pack('a.b', { version: 3 }), 'bad_pack'],
      [pack('a.b', { code: 'x' }), 'bad_pack'],                      // code in a version 1 pack
      [pack('a.b', { scripts: ['x.js'] }), 'bad_pack'],
      [pack('a.b', { version: 2, code: 'x'.repeat(512 * 1024 + 1) }), 'bad_pack'],
    ]) {
      const r = await sign(A, p);
      expect([r.status, r.body.error.code]).toEqual([400, code]);
    }
    // larger than the 2 MB other bodies are held to, under 8 MB: signed
    const big = await sign(A, pack('a.big', { description: 'x'.repeat(3 * 1024 * 1024) }));
    expect(big.status).toBe(200);
    const huge = await sign(A, pack('a.huge', { description: 'x'.repeat(8 * 1024 * 1024 + 70 * 1024) }));
    expect(huge.status).toBe(413);
  });

  it('says signing is off while the key is not set', async () => {
    const A = await signedIn();
    saved = env.PACK_SIGNING_KEY; env.PACK_SIGNING_KEY = '';
    const r = await sign(A, pack('off.pack'));
    expect([r.status, r.body.error.code]).toEqual([503, 'signing_off']);
    expect((await call('/v1/packs/key', { origin: null })).status).toBe(503);
    expect((await json(call('/v1/packs/signers', { token: A.token }))).body.signing).toBe(false);
  });
});

describe('taking packs down', () => {
  it('by hash: shown as revoked, and that pack cannot be signed again', async () => {
    const A = await signedIn();
    const p = pack('down.one');
    const { body: { hash } } = await sign(A, p);
    expect((await json(ops('/ops/packs/revoke', 'POST', { hash }))).status).toBe(400);   // a reason is needed
    expect((await json(ops('/ops/packs/revoke', 'POST', { hash, reason: 'Malware' }))).body.signatures).toBe(1);
    const s = await status('hashes=' + hash + ',' + 'a'.repeat(64));
    expect(s.body.packs[hash]).toMatchObject({ id: 'down.one', revoked: { reason: 'Malware' } });
    expect(s.body.packs['a'.repeat(64)]).toBeUndefined();
    expect((await sign(A, p)).body.error.code).toBe('revoked');
    expect((await sign(A, pack('down.one', { packVersion: '2' }))).status).toBe(200);   // a new version is another pack
    await ops('/ops/packs/unrevoke', 'POST', { hash });
    expect((await status('hashes=' + hash)).body.packs[hash].revoked).toBeNull();
  });

  it('by id: every version, and no more signing of it', async () => {
    const A = await signedIn();
    const h1 = (await sign(A, pack('down.two'))).body.hash, h2 = (await sign(A, pack('down.two', { packVersion: '2' }))).body.hash;
    expect((await json(ops('/ops/packs/revoke', 'POST', { id: 'down.two', reason: 'Trademark' }))).body.signatures).toBe(2);
    const s = await status(`hashes=${h1},${h2}&ids=down.two`);
    expect(s.body.packs[h1].revoked.reason).toBe('Trademark');
    expect(s.body.packs[h2].revoked.reason).toBe('Trademark');
    expect(s.body.ids['down.two'].blocked.reason).toBe('Trademark');
    expect((await sign(A, pack('down.two', { packVersion: '3' }))).body.error.code).toBe('id_blocked');
    await ops('/ops/packs/unrevoke', 'POST', { id: 'down.two' });
    expect((await sign(A, pack('down.two', { packVersion: '3' }))).status).toBe(200);
  });

  it('by account: all of its packs, and it signs no more', async () => {
    const A = await signedIn(), B = await signedIn();
    const h = (await sign(A, pack('acct.one'))).body.hash, k = (await sign(A, pack('acct.two'))).body.hash, other = (await sign(B, pack('acct.b'))).body.hash;
    expect((await json(ops('/ops/packs/revoke', 'POST', { user: A.user.id, reason: 'Spam' }))).body.signatures).toBe(2);
    const s = await status(`hashes=${h},${k},${other}`);
    expect([s.body.packs[h].revoked.reason, s.body.packs[k].revoked.reason, s.body.packs[other].revoked]).toEqual(['Spam', 'Spam', null]);
    expect((await sign(A, pack('acct.three'))).body.error.code).toBe('blocked');
    await ops('/ops/packs/unrevoke', 'POST', { user: A.user.id });
    expect((await sign(A, pack('acct.three'))).status).toBe(200);
  });

  it('the ops routes do not exist without the token; status is public and cached briefly', async () => {
    for (const [m, p] of [['GET', '/ops/packs'], ['POST', '/ops/packs/revoke'], ['POST', '/ops/packs/sign'], ['POST', '/ops/packs/org'], ['POST', '/ops/packs/reserve']]) {
      expect((await call(p, { method: m, origin: null, headers: { Authorization: 'Bearer nope' }, body: m === 'POST' ? '{}' : undefined })).status).toBe(404);
    }
    const r = await call('/v1/packs/status?hashes=' + 'b'.repeat(64), { origin: null });
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect((await call('/v1/packs/status?ids=' + Array.from({ length: 101 }, (_, i) => 'x.' + i).join(','), { origin: null })).status).toBe(400);
    const l = await json(ops('/ops/packs'));
    expect(Array.isArray(l.body.signatures)).toBe(true);
  });
});

describe('signing as an organisation', () => {
  async function team(owner, name, domain) {
    const t = (await json(send('/v1/teams', 'POST', owner.token, { name }))).body.id;
    await withPlan(t);
    return t;
  }
  it('a team with a verified domain and a plan signs as itself, through its owner and admins', async () => {
    const O = await signedIn('Olga'), E = await signedIn('Ed');
    const t = await team(O, 'Acme Optics');
    // not yet verified: only the person
    expect((await json(call('/v1/packs/signers', { token: O.token }))).body.signers).toEqual([{ kind: 'person', id: O.user.id, name: 'Olga' }]);
    expect((await sign(O, pack('acme.lenses'), t)).status).toBe(403);
    // the owner's email must be at the domain, unless checked some other way
    expect((await json(ops('/ops/packs/org', 'POST', { org: t, domain: 'acme-optics.com' }))).body.error.code).toBe('not_verified');
    expect((await json(ops('/ops/packs/org', 'POST', { org: t, domain: 'co.uk', force: true }))).status).toBe(400);
    expect((await json(ops('/ops/packs/org', 'POST', { org: t, domain: 'acme-optics.com', force: true }))).status).toBe(200);
    const sg = (await json(call('/v1/packs/signers', { token: O.token }))).body;
    expect(sg.signers[1]).toEqual({ kind: 'org', id: t, name: 'Acme Optics', domain: 'acme-optics.com' });
    const r = await sign(O, pack('acme.lenses'), t);
    expect(r.status).toBe(200);
    expect(r.body.sig.by).toEqual({ kind: 'org', id: t, name: 'Acme Optics', domain: 'acme-optics.com' });
    expect(await checks(r.body.sig)).toBe(true);
    // the id is the team's: not its owner's as a person, nor anyone else's
    expect((await sign(O, pack('acme.lenses', { packVersion: '2' }))).body.error.code).toBe('id_taken');
    expect((await sign(E, pack('acme.lenses', { packVersion: '2' }), t)).status).toBe(403);   // not in the team
    expect((await status('ids=acme.lenses')).body.ids['acme.lenses'].owner).toEqual({ kind: 'org', id: t, name: 'Acme Optics', domain: 'acme-optics.com' });
    // without an active plan it signs as itself no more
    await withPlan(t, 'canceled', Date.now() - 1000);
    expect((await sign(O, pack('acme.lenses', { packVersion: '3' }), t)).status).toBe(403);
  });

  it('a domain is one team’s; the owner’s email domain verifies it', async () => {
    const O = await signedIn(), P = await signedIn();
    const t = await team(O, 'Lab A'), u = await team(P, 'Lab B');
    const dom = O.user.email.split('@')[1];
    expect((await json(ops('/ops/packs/org', 'POST', { org: t, domain: dom }))).status).toBe(200);
    expect((await json(ops('/ops/packs/org', 'POST', { org: u, domain: dom }))).body.error.code).toBe('domain_taken');
    expect((await json(ops('/ops/packs/org', 'POST', { org: t, domain: null }))).body.domain).toBeNull();
  });
});

describe('an account’s export', () => {
  it('lists the packs it signed', async () => {
    const A = await signedIn();
    const { hash } = (await sign(A, pack('export.parts'))).body;
    const zip = new TextDecoder().decode(await (await call('/v1/me/export', { token: A.token })).arrayBuffer());
    expect(zip).toContain('Part packs signed.json');
    expect(zip).toContain(hash);
  });
});

describe('an account deleted', () => {
  it('keeps its packs’ ids claimed and their hashes listed, without its name', async () => {
    const A = await signedIn('Gone Soon'), B = await signedIn();
    const { hash } = (await sign(A, pack('gone.parts'))).body;
    expect((await send('/v1/me', 'DELETE', A.token, { confirm: CONFIRM })).status).toBe(200);
    const row = await env.DB.prepare('SELECT signer_name FROM pack_sigs WHERE hash = ?').bind(hash).first();
    expect(row.signer_name).toBeNull();
    expect((await sign(B, pack('gone.parts'))).body.error.code).toBe('id_taken');
    expect((await status('ids=gone.parts')).body.ids['gone.parts'].owner.name).toBe('Deleted user');
  });
});

describe('a team verifies its own domain', () => {
  // the DNS-over-HTTPS resolver, as Cloudflare's JSON one answers: TXT strings by name, 'fail' for a broken lookup
  let dns, asked;
  function resolver() {
    dns = {}; asked = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
      const u = new URL(typeof input === 'string' ? input : input.url);
      expect(u.origin + u.pathname).toBe(env.DOH_URL);
      expect(new Headers(init.headers).get('accept')).toBe('application/dns-json');
      const name = u.searchParams.get('name');
      asked.push(name);
      expect(u.searchParams.get('type')).toBe('TXT');
      const r = dns[name];
      if (r === 'fail') return new Response('{"Status":2}', { headers: { 'Content-Type': 'application/dns-json' } });
      if (!r) return Response.json({ Status: 3, Answer: [] });
      return Response.json({ Status: 0, Answer: r.map((t) => ({ name, type: 16, TTL: 300, data: '"' + t + '"' })) });
    });
  }
  const dom = (who, t, method = 'POST', b) => json(send(`/v1/teams/${t}/domain${method === 'VERIFY' ? '/verify' : ''}`, method === 'VERIFY' ? 'POST' : method, who.token, b));
  const unwait = (t) => env.DB.prepare('UPDATE pack_domain_checks SET checked_at = NULL WHERE workspace_id = ?').bind(t).run();
  async function team(owner, name) {
    const t = (await json(send('/v1/teams', 'POST', owner.token, { name }))).body.id;
    await withPlan(t);
    return t;
  }

  it('the domain made plain, and refused unless an organisation could own it', () => {
    expect(cleanDomain('  Acme-Optics.COM. ')).toBe('acme-optics.com');
    expect(cleanDomain('https://www.acme.com/about?x=1')).toBe('www.acme.com');
    expect(cleanDomain('@lab.example.ac.uk')).toBe('lab.example.ac.uk');
    expect(cleanDomain('bücher.de')).toBe('xn--bcher-kva.de');
    expect(cleanDomain('xn--bcher-kva.de')).toBe('xn--bcher-kva.de');
    expect(cleanDomain('example.xn--p1ai')).toBe('example.xn--p1ai');
    for (const bad of ['', 'localhost', 'com', '192.168.1.1', '[::1]', '10.0.0.1:80', 'co.uk', 'ac.jp', 'a..b.com', '-acme.com', 'acme.c', 'acme_optics.com', 'jeksys.net', 'x.jeksys.net', 'jekray.com', 'a b.com', null, 42]) {
      expect(() => cleanDomain(bad), String(bad)).toThrow(/organisation owns|JEK Systems/);
    }
  });

  it('start, the record, a check that does not find it, one that does: the team signs as itself', async () => {
    resolver();
    const O = await signedIn('Olga');
    const t = await team(O, 'Acme Photonics');
    const s = await dom(O, t, 'POST', { domain: 'Acme-Photonics.com' });
    expect(s.status).toBe(200);
    expect(s.body.domain).toBeNull();
    const { record, expires_at } = s.body.pending;
    expect(record.type).toBe('TXT');
    expect(record.name).toBe('_jekray-verify.acme-photonics.com');
    expect(record.value).toMatch(/^jekray-verify=[0-9a-f]{32}$/);
    expect(expires_at - Date.now()).toBeGreaterThan(6.9 * 86400000);
    // asked again: the same record, so one already added still counts
    expect((await dom(O, t, 'POST', { domain: 'acme-photonics.com' })).body.pending.record).toEqual(record);
    // the team's page shows its owner the same
    expect((await json(call('/v1/teams/' + t, { token: O.token }))).body.signing.pending.record).toEqual(record);
    // not there yet; another token there; then right (several strings in one record, others beside it)
    const miss = await dom(O, t, 'VERIFY');
    expect([miss.status, miss.body.error.code]).toEqual([409, 'not_found_yet']);
    expect(asked).toEqual(['_jekray-verify.acme-photonics.com']);
    // too soon after the last look
    const soon = await dom(O, t, 'VERIFY');
    expect([soon.status, soon.body.error.code]).toEqual([429, 'too_soon']);
    expect(asked.length).toBe(1);
    await unwait(t);
    dns[record.name] = ['jekray-verify=' + 'f'.repeat(32)];
    const wrong = await dom(O, t, 'VERIFY');
    expect([wrong.status, wrong.body.error.code]).toEqual([409, 'not_found_yet']);
    expect(wrong.body.error.message).toContain(record.value);
    await unwait(t);
    dns[record.name] = ['v=spf1 -all', record.value.slice(0, 20) + '" "' + record.value.slice(20)];
    const ok = await dom(O, t, 'VERIFY');
    expect(ok.status).toBe(200);
    expect(ok.body.domain).toMatchObject({ domain: 'acme-photonics.com', method: 'dns' });
    expect(ok.body.pending).toBeNull();
    const sg = (await json(call('/v1/packs/signers', { token: O.token }))).body.signers;
    expect(sg[1]).toEqual({ kind: 'org', id: t, name: 'Acme Photonics', domain: 'acme-photonics.com' });
    const r = await sign(O, pack('acmep.kit'), t);
    expect(r.body.sig.by).toEqual({ kind: 'org', id: t, name: 'Acme Photonics', domain: 'acme-photonics.com' });
    // in the team's activity
    const act = (await json(call('/v1/teams/' + t, { token: O.token }))).body.activity.map((a) => a.action + ' ' + a.target);
    expect(act).toContain('domain.verified acme-photonics.com');
    // one domain a team: another needs this one off first
    expect((await dom(O, t, 'POST', { domain: 'acme.org' })).body.error.code).toBe('has_domain');
    // taken off: signing as the team stops; its signatures stand
    const off = await dom(O, t, 'DELETE');
    expect([off.status, off.body.domain, off.body.pending]).toEqual([200, null, null]);
    expect((await sign(O, pack('acmep.kit', { packVersion: '2' }), t)).status).toBe(403);
    expect((await status('ids=acmep.kit')).body.ids['acmep.kit'].owner).toEqual({ kind: 'org', id: t, name: 'Acme Photonics' });
  });

  it('a lookup that fails, and a record that has expired', async () => {
    resolver();
    const O = await signedIn();
    const t = await team(O, 'Lab');
    const { record } = (await dom(O, t, 'POST', { domain: 'lab.example' })).body.pending;
    dns[record.name] = 'fail';
    const r = await dom(O, t, 'VERIFY');
    expect([r.status, r.body.error.code]).toEqual([503, 'dns_unavailable']);
    await env.DB.prepare('UPDATE pack_domain_checks SET expires_at = ?, checked_at = NULL WHERE workspace_id = ?').bind(Date.now() - 1, t).run();
    dns[record.name] = [record.value];
    const old = await dom(O, t, 'VERIFY');
    expect([old.status, old.body.error.code]).toEqual([410, 'expired']);
    expect((await json(call('/v1/teams/' + t, { token: O.token }))).body.signing.pending.expired).toBe(true);
    // started again: a new token
    // the daily job clears it out
    const waits = [];
    await exports.default.scheduled({ cron: '17 3 * * *', scheduledTime: Date.now() }, env, { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    expect((await json(call('/v1/teams/' + t, { token: O.token }))).body.signing.pending).toBeNull();
    const again = (await dom(O, t, 'POST', { domain: 'lab.example' })).body.pending.record;
    expect(again.value).not.toBe(record.value);
    expect((await dom(O, t, 'VERIFY')).body.error.code).toBe('not_found_yet');
    expect((await dom(O, t, 'VERIFY', undefined)).status).toBe(429);
    expect((await dom(await signedIn(), t, 'VERIFY')).status).toBe(404);
    // nothing started
    const P = await signedIn(), u = await team(P, 'Other');
    expect((await dom(P, u, 'VERIFY')).body.error.code).toBe('no_check');
  });

  it('a domain is one team’s at a time; ops can free it', async () => {
    resolver();
    const O = await signedIn(), P = await signedIn();
    const t = await team(O, 'Lab A'), u = await team(P, 'Lab B');
    const a = (await dom(O, t, 'POST', { domain: 'shared.example' })).body.pending.record;
    const b = (await dom(P, u, 'POST', { domain: 'shared.example' })).body.pending.record;
    expect(a.value).not.toBe(b.value);
    dns[a.name] = [a.value, b.value];
    expect((await dom(O, t, 'VERIFY')).status).toBe(200);
    // the other team, even with its record there: taken
    const r = await dom(P, u, 'VERIFY');
    expect([r.status, r.body.error.code]).toEqual([409, 'domain_taken']);
    expect((await dom(P, u, 'POST', { domain: 'Shared.Example' })).body.error.code).toBe('domain_taken');
    // nor by ops, until freed
    expect((await json(ops('/ops/packs/org', 'POST', { org: u, domain: 'shared.example', force: true }))).body.error.code).toBe('domain_taken');
    expect((await json(ops('/ops/packs/org', 'POST', { org: t, domain: null }))).body.domain).toBeNull();
    expect((await dom(P, u, 'POST', { domain: 'shared.example' })).status).toBe(200);
    await unwait(u);
    expect((await dom(P, u, 'VERIFY')).body.domain.domain).toBe('shared.example');
  });

  it('only the owner and admins, of a team on an active plan', async () => {
    resolver();
    const O = await signedIn(), Ad = await signedIn(), Ed = await signedIn(), X = await signedIn();
    const t = await team(O, 'Roles');
    await env.DB.batch([
      env.DB.prepare("INSERT INTO members (workspace_id, user_id, role, seat, created_at) VALUES (?, ?, 'admin', 1, 0)").bind(t, Ad.user.id),
      env.DB.prepare("INSERT INTO members (workspace_id, user_id, role, seat, created_at) VALUES (?, ?, 'editor', 1, 0)").bind(t, Ed.user.id),
    ]);
    expect((await dom(Ad, t, 'POST', { domain: 'roles.example' })).status).toBe(200);
    for (const m of ['POST', 'VERIFY', 'DELETE']) {
      expect((await dom(Ed, t, m, { domain: 'roles.example' })).body.error.code, m).toBe('forbidden');
      expect((await dom(X, t, m, { domain: 'roles.example' })).status, m).toBe(404);
    }
    // the editor does not see the record on the team's page
    expect((await json(call('/v1/teams/' + t, { token: Ed.token }))).body.signing).toBeUndefined();
    // a personal workspace is no team
    expect((await dom(O, O.workspaceId, 'POST', { domain: 'me.example' })).status).toBe(404);
    // no plan: nothing started or checked, though it can still be taken off
    await withPlan(t, 'canceled', Date.now() - 1000);
    const np = await dom(O, t, 'POST', { domain: 'roles.example' });
    expect([np.status, np.body.error.code]).toEqual([402, 'no_plan']);
    expect((await dom(O, t, 'VERIFY')).body.error.code).toBe('no_plan');
    expect((await dom(O, t, 'DELETE')).status).toBe(200);
    expect(asked).toEqual([]);
    // bad domains refused
    await withPlan(t);
    expect((await dom(O, t, 'POST', { domain: '127.0.0.1' })).body.error.code).toBe('bad_domain');
  });

  it('looked at again on signing after 30 days: still there, signing goes on; gone, it stops', async () => {
    resolver();
    const O = await signedIn();
    const t = await team(O, 'Recheck');
    const { record } = (await dom(O, t, 'POST', { domain: 'recheck.example' })).body.pending;
    dns[record.name] = [record.value];
    await dom(O, t, 'VERIFY');
    asked.length = 0;
    expect((await sign(O, pack('re.one'), t)).status).toBe(200);
    expect(asked).toEqual([], 'not looked at while the last check is fresh');
    const age = (d) => env.DB.prepare('UPDATE pack_orgs SET checked_at = ? WHERE workspace_id = ?').bind(Date.now() - d * 86400000, t).run();
    await age(31);
    expect((await sign(O, pack('re.one', { packVersion: '2' }), t)).status).toBe(200);
    expect(asked).toEqual([record.name]);
    expect((await env.DB.prepare('SELECT checked_at FROM pack_orgs WHERE workspace_id = ?').bind(t).first()).checked_at).toBeGreaterThan(Date.now() - 60000);
    // the resolver down: nothing held up
    await age(31);
    dns[record.name] = 'fail';
    expect((await sign(O, pack('re.one', { packVersion: '3' }), t)).status).toBe(200);
    // the record gone
    delete dns[record.name];
    const r = await sign(O, pack('re.one', { packVersion: '4' }), t);
    expect([r.status, r.body.error.code]).toEqual([403, 'domain_lapsed']);
    expect((await json(call('/v1/teams/' + t, { token: O.token }))).body.signing.domain).toBeNull();
    // one set by ops is never looked at
    await json(ops('/ops/packs/org', 'POST', { org: t, domain: 'recheck.example', force: true }));
    await age(400);
    asked.length = 0;
    expect((await sign(O, pack('re.one', { packVersion: '5' }), t)).status).toBe(200);
    expect(asked).toEqual([]);
  });
});
