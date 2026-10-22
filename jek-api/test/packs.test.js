import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIRM } from '../src/account.js';
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
afterEach(() => { if (saved !== undefined) { env.PACK_SIGNING_KEY = saved; saved = undefined; } });

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

  it('keeps jek and jek.* for JEK Systems and those it names', async () => {
    const B = await signedIn();
    for (const id of ['jek', 'jek.example', 'jek.anything']) expect((await sign(B, pack(id))).body.error.code).toBe('id_reserved');
    expect((await sign(B, pack('jekyll.parts'))).status).toBe(200);   // only "jek" and "jek." are kept
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
