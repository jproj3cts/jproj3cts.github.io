// Signed part packs (core/packsig.js): the canonical form and hash, the same as the API's; signatures checked
// with the test key (valid, changed, forged, another key's); which key a host may check with; whether a pack
// may be installed (a module only verified and not revoked, an id kept to its maker); and how each standing reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PACK_PUBLIC_KEY, PACK_TEST_KEY, packCanon, packDecide, packHashOf, packKeyFor, packSigMessage, packTrustHelp, packTrustLabel, packVerify } from '../../src/core/packsig.js';
import * as API from '../../../../../jek-api/src/packsig.js';

// the test key's private half is kept in the API's test config alone; read from there
const cfg = readFileSync(new URL('../../../../../jek-api/vitest.config.js', import.meta.url), 'utf8');
const TEST_PRIVATE = cfg.match(/PACK_SIGNING_KEY: '([A-Za-z0-9+/=]+)'/)[1];
const keyOf = async pkcs8 => API.signingKey({ PACK_SIGNING_KEY: pkcs8 });
const pack = (o = {}) => ({ format: 'jekpack', version: 1, id: 'ada.lenses', name: 'Ada’s lenses', author: 'Ada', packVersion: '1', parts: [{ name: 'L', elements: [{ type: 'lens', x: 0, y: 0, surfaces: [{ R: 41 }, { R: -41 }] }] }], ...o });
const ADA = { kind: 'person', id: 'a'.repeat(32), name: 'Ada Lovelace' };
async function signed(p, by = ADA, pkcs8 = TEST_PRIVATE) {
  const key = await keyOf(pkcs8), q = JSON.parse(JSON.stringify(p));
  const sig = { alg: 'Ed25519', v: 1, id: q.id, hash: await API.packHash(q), by, at: Date.UTC(2026, 9, 22) };
  sig.s = await API.signWith(key, sig);
  return Object.assign(q, { sig });
}

test('the canonical form: keys sorted at every depth, no whitespace, the same as the API’s', async () => {
  assert.equal(packCanon({ b: 1, a: [3, { d: null, c: 'x' }], e: undefined }), '{"a":[3,{"c":"x","d":null}],"b":1}');
  assert.equal(packCanon([undefined, 1.5e-7, 'é\n']), '[null,1.5e-7,"é\\n"]');
  const odd = JSON.parse('{"__proto__": {"x": 1}, "constructor": 2, "z": [true, false]}');
  assert.equal(packCanon(odd), '{"__proto__":{"x":1},"constructor":2,"z":[true,false]}');
  const objs = [pack(), pack({ glasses: [{ glass: 'G', table: { wl: [0.4, 0.6], n: [1.7, 1.69] } }], description: 'µ “quotes”  ' }), odd, { n: [0.1 + 0.2, -0, 1e21, 5e-324] }];
  for (const o of objs) {
    assert.equal(packCanon(o), API.canon(o));
    assert.equal(await packHashOf(o), await API.packHash(o));
  }
  // the hash leaves out the sig, and the order the keys were written in
  const p = pack();
  const reordered = Object.fromEntries(Object.entries(p).reverse());
  assert.equal(await packHashOf(reordered), await packHashOf(p));
  assert.equal(await packHashOf({ ...p, sig: { anything: 1 } }), await packHashOf(p));
  assert.notEqual(await packHashOf({ ...p, name: 'Other' }), await packHashOf(p));
  // the message signed: v, id, hash, by and at, in that canonical order
  assert.equal(new TextDecoder().decode(packSigMessage({ at: 5, by: { name: 'A', kind: 'person', id: 'x' }, hash: 'h', id: 'i', v: 1, s: 'zzz', alg: 'Ed25519' })),
    '{"at":5,"by":{"id":"x","kind":"person","name":"A"},"hash":"h","id":"i","v":1}');
});

test('a signature checks with the key it was made with, and fails once anything in it or the pack changes', async () => {
  const K = PACK_TEST_KEY;
  const ok = await signed(pack());
  assert.deepEqual(await packVerify(ok, K), { state: 'verified', by: ADA, hash: await packHashOf(pack()) });
  assert.equal((await packVerify(pack(), K)).state, 'unsigned');
  // edited after it was signed: a part's radius, a glass added, the author
  for (const edit of [p => { p.parts[0].elements[0].surfaces[0].R = 40; }, p => { p.glasses = [{ glass: 'X', nd: 1.5, vd: 60 }]; }, p => { p.author = 'Eve'; }]) {
    const p = JSON.parse(JSON.stringify(ok)); edit(p);
    const v = await packVerify(p, K);
    assert.equal(v.state, 'changed');
    assert.deepEqual(v.by, ADA, 'who it says signed it is still told');
  }
  // the signature itself altered: another name, another time, another id, another hash, junk
  const alt = f => { const p = JSON.parse(JSON.stringify(ok)); f(p.sig, p); return p; };
  assert.equal((await packVerify(alt(s => { s.by.name = 'Eve'; }), K)).state, 'bad');
  assert.equal((await packVerify(alt(s => { s.at += 1; }), K)).state, 'bad');
  assert.equal((await packVerify(alt((s, p) => { s.id = 'eve.lenses'; p.id = 'eve.lenses'; s.hash = 'x'; }), K)).state, 'bad');
  assert.equal((await packVerify(alt((s, p) => { p.id = 'eve.lenses'; }), K)).state, 'changed', 'its id changed by hand');
  assert.equal((await packVerify(alt(s => { s.id = 'eve.lenses'; }), K)).state, 'bad', 'the signature’s id changed');
  assert.equal((await packVerify(alt(s => { s.s = s.s.slice(0, -4) + 'AAAA'; }), K)).state, 'bad');
  for (const junk of [null, 'sig', [], { alg: 'RSA' }, { ...ok.sig, v: 2 }, { ...ok.sig, by: { kind: 'robot', id: 'x', name: 'y' } }]) assert.equal((await packVerify({ ...pack(), sig: junk }, K)).state, 'bad');
  // a pack signed with someone else's key (not ours): not verified
  const other = Buffer.from(await crypto.subtle.exportKey('pkcs8', (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign'])).privateKey)).toString('base64');
  assert.equal((await packVerify(await signed(pack(), ADA, other), K)).state, 'bad');
  // a signature moved onto another pack
  const moved = { ...pack({ name: 'Eve’s' }), sig: ok.sig };
  assert.equal((await packVerify(moved, K)).state, 'changed');
  // no key to check with on this page
  assert.equal((await packVerify(ok, null)).state, 'nokey');
  // an organisation, with its domain
  const ORG = { kind: 'org', id: 'b'.repeat(32), name: 'Acme Optics', domain: 'acme.com' };
  assert.deepEqual((await packVerify(await signed(pack(), ORG), K)).by, ORG);
});

test('the test key is taken only in the tests and on this computer; the live one on the site', () => {
  assert.equal(packKeyFor('jeksys.net', false, PACK_TEST_KEY), null, 'the site never trusts the test key');
  assert.equal(packKeyFor('localhost', false, PACK_TEST_KEY), PACK_TEST_KEY);
  assert.equal(packKeyFor('127.0.0.1', false, PACK_TEST_KEY), PACK_TEST_KEY);
  assert.equal(packKeyFor('jeksys.net', true), PACK_TEST_KEY, 'the test suite signs with the test key, whatever the live one');
  assert.equal(packKeyFor('jeksys.net', false), PACK_PUBLIC_KEY, 'the site checks with the live key');
  assert.equal(packKeyFor('localhost', false, 'REALKEY'), 'REALKEY');
  // the live key is set, a 32-byte Ed25519 key, and is not the test one
  assert.notEqual(PACK_PUBLIC_KEY, PACK_TEST_KEY);
  assert.equal(Buffer.from(PACK_PUBLIC_KEY, 'base64url').length, 32);
});

test('whether a pack installs: modules only verified and checked; an id kept to its maker, installed or not', () => {
  const ADA2 = { ...ADA, name: 'Ada (renamed)' }, EVE = { kind: 'person', id: 'e'.repeat(32), name: 'Eve' };
  const V = by => ({ state: 'verified', by }), U = { state: 'unsigned', by: null }, C = { state: 'changed', by: ADA };
  const st = (o = {}) => ({ revoked: null, blocked: null, owner: null, ...o });
  const d = o => packDecide({ id: 'ada.lenses', module: false, v: U, st: st(), old: null, oldName: 'Old', test: false, ...o });
  // a parts pack: unsigned or changed installs, labelled by the caller; offline, with a note
  assert.deepEqual([d({}).ok, d({}).notes], [true, []]);
  assert.equal(d({ v: C }).ok, true);
  assert.equal(d({ v: V(ADA) }).update, false);
  const off = d({ st: null });
  assert.equal(off.ok, true);
  assert.match(off.notes[0], /could not check whether it has been revoked, or who its id is registered to/);
  // revoked (by hash, or its id taken down): refused, whatever it is
  assert.equal(d({ v: V(ADA), st: st({ revoked: { reason: 'Malware' } }) }).code, 'revoked');
  assert.match(d({ v: V(ADA), st: st({ revoked: { reason: 'Malware' } }) }).why, /Malware/);
  assert.equal(d({ st: st({ blocked: { reason: 'Trademark' } }) }).code, 'revoked');
  // a module: never unsigned, changed or unchecked; only verified and asked about
  for (const v of [U, C, { state: 'bad', by: null }, { state: 'nokey', by: ADA }, { state: 'unknown', by: ADA }]) assert.equal(d({ module: true, v }).code, 'unverified', v.state);
  assert.match(d({ module: true, v: C }).why, /changed after it was signed/);
  assert.equal(d({ module: true, v: V(ADA), st: null }).code, 'unchecked');
  assert.equal(d({ module: true, v: V(ADA), st: null, test: true }).ok, true, 'the tests do not ask the API');
  assert.equal(d({ module: true, v: V(ADA) }).ok, true);
  assert.equal(d({ module: true, v: V(ADA), st: st({ revoked: { reason: 'x' } }) }).ok, false);
  // updates: from the same maker (by account, whatever its name now)
  const oldAda = { state: 'verified', by: ADA };
  assert.deepEqual([d({ v: V(ADA2), old: oldAda }).ok, d({ v: V(ADA2), old: oldAda }).update], [true, true]);
  for (const v of [V(EVE), U, C]) {
    const r = d({ v, old: oldAda });
    assert.equal(r.code, 'other_maker');
    assert.match(r.why, /different maker’s pack uses this id \(ada\.lenses\): Old, by Ada Lovelace/);
  }
  assert.equal(d({ module: true, v: V(EVE), old: oldAda }).code, 'other_maker');
  // the installed one unsigned (made before signing): updated only by a signed one from the id's owner
  const oldU = { state: 'unsigned', by: null };
  assert.equal(d({ v: V(ADA), old: oldU, st: st({ owner: ADA }) }).ok, true);
  assert.equal(d({ v: V(ADA), old: oldU, st: null }).ok, true, 'offline: the signature alone (it was the owner when it signed)');
  assert.equal(d({ v: V(EVE), old: oldU, st: st({ owner: ADA }) }).code, 'other_maker');
  assert.equal(d({ v: U, old: oldU }).code, 'other_maker', 'two unsigned: no telling they are the same maker');
  assert.equal(d({ v: C, old: oldU }).code, 'other_maker');
  // nothing installed, but the id is someone's: only a pack they signed installs; unsigned, changed or another's is refused
  const ACME = { kind: 'org', id: 'o', name: 'Acme Optics', domain: 'acme.com' };
  const claimed = d({ v: U, st: st({ owner: ACME }) });
  assert.deepEqual([claimed.ok, claimed.code], [false, 'other_maker']);
  assert.match(claimed.why, /^Its id, ada\.lenses, is registered to Acme Optics \(acme\.com\), and this copy is not signed by them, so it could pose as their pack/);
  assert.equal(d({ v: C, st: st({ owner: ACME }) }).code, 'other_maker');
  const eves = d({ v: V(EVE), st: st({ owner: ACME }) });
  assert.equal(eves.code, 'other_maker');
  assert.match(eves.why, /this copy is signed by Eve instead/);
  assert.equal(d({ module: true, v: V(EVE), st: st({ owner: ADA }) }).code, 'other_maker');
  assert.deepEqual([d({ v: V(ADA2), st: st({ owner: ADA }) }).ok, d({ v: V(ADA2), st: st({ owner: ADA }) }).notes], [true, []], 'its owner’s, renamed since');
  assert.equal(d({ v: V({ ...ACME }), st: st({ owner: ACME }) }).ok, true);
  // installed and signed by the same maker, but the id is now someone else's (a claim released and taken): refused too
  assert.equal(d({ v: V(ADA), old: oldAda, st: st({ owner: EVE }) }).code, 'other_maker');
  // the API out of reach: whose the id is cannot be known, so a parts pack installs as before, saying so; a module waits
  const unk = d({ v: U, st: null });
  assert.deepEqual([unk.ok, unk.notes.length], [true, 1]);
  assert.equal(d({ v: V(EVE), st: null }).ok, true);
  assert.equal(d({ module: true, v: V(EVE), st: null }).code, 'unchecked');
});

test('each standing reads plainly: Verified only for an organisation’s checked domain, a person’s account plainly Signed', () => {
  const L = packTrustLabel, ada = { state: 'verified', by: { kind: 'person', id: 'x', name: 'Ada' } }, acme = { state: 'verified', by: { kind: 'org', id: 'x', name: 'Acme Optics', domain: 'acme.com' } };
  assert.deepEqual(L(ada), { cls: 'signed', short: '✓ Signed', text: '✓ Signed by the JEKray account ‘Ada’', by: 'By the JEKray account ‘Ada’' });
  assert.match(packTrustHelp(ada), /The name is the one the account gives itself: no one has checked who is behind it\./);
  assert.deepEqual(L(acme), { cls: 'ok', short: '✓ Verified', text: '✓ Verified: Acme Optics (acme.com)', by: 'Acme Optics (acme.com)' });
  assert.match(packTrustHelp(acme), /organisation Acme Optics, which has shown that the web domain acme\.com is its own/);
  // an organisation with no domain to show is not Verified: it reads as the account it is
  assert.equal(L({ state: 'verified', by: { kind: 'org', id: 'x', name: 'Acme Optics' } }).cls, 'signed');
  // a name that claims to be checked is still only a name
  assert.equal(L({ state: 'verified', by: { kind: 'person', id: 'x', name: 'Acme Optics (acme.com)' } }).text, '✓ Signed by the JEKray account ‘Acme Optics (acme.com)’');
  assert.equal(packTrustHelp({ state: 'unsigned' }), '');
  assert.deepEqual(L({ state: 'unsigned' }, 'Acme'), { cls: 'warn', short: 'Unverified', text: 'Unverified', by: 'By Acme (unverified)' });
  assert.deepEqual(L(undefined, ''), { cls: 'warn', short: 'Unverified', text: 'Unverified', by: '' }, 'a pack installed before signing');
  assert.equal(L({ state: 'changed', by: { kind: 'person', id: 'x', name: 'Ada' } }, 'Ada').text, 'Unverified: changed after it was signed');
  assert.equal(L({ state: 'bad' }).text, 'Unverified: its signature does not check out');
  assert.deepEqual(L({ state: 'verified', by: { kind: 'person', id: 'x', name: 'Ada' }, revoked: { reason: 'Malware' } }).text, 'Revoked: Malware');
  assert.equal(L({ state: 'verified', by: { kind: 'person', id: 'x', name: 'Ada' }, revoked: { reason: 'Malware' } }).cls, 'bad');
});

test('the page sends only to the API what it must, and installs a module only through the checks', () => {
  const src = readFileSync(new URL('../../src/io/packs.js', import.meta.url), 'utf8'), mods = readFileSync(new URL('../../src/io/mods.js', import.meta.url), 'utf8');
  const boot = readFileSync(new URL('../../src/ui/boot.js', import.meta.url), 'utf8');
  // every way in (a file, a link, a drop, a bench's modules) goes through packInstallRaw, which assesses before the code runs
  const raw = src.slice(src.indexOf('export async function packInstallRaw'), src.indexOf('export async function packInstallText'));
  assert.ok(raw.indexOf('packAssess(') > 0 && raw.indexOf('packAssess(') < raw.indexOf('modPrepare('), 'assessed before its code is read in the sandbox');
  assert.match(raw, /if \(!d\.ok\) \{[^}]*packRefused/);
  assert.match(mods, /await packInstallRaw\(raw, 'this bench'\)/);
  assert.doesNotMatch(mods, /packConfirm\(/, 'a bench’s module is not offered round the checks');
  // the status asked without credentials; a revoked module left out of those that run
  assert.match(src, /\/v1\/packs\/status\?' \+ new URLSearchParams\(\{ hashes: hashes\.join\(','\), ids: ids\.join\(','\) \}\), \{ credentials: 'omit' \}/);
  assert.match(mods, /PACKS\.list\.filter\(p => p\.code && p\.hash && !\(p\.trust && p\.trust\.revoked\)\)/);
  // a script on the page installs only what the dialog would
  assert.match(boot, /const d = await packAssess\(raw, pack\);\s+if \(!TEST_MODE && !d\.ok\) throw new Error\(d\.why\);/);
});

test('a pack the API signs checks here (its canon and message are the page’s)', async () => {
  const key = await keyOf(TEST_PRIVATE);
  assert.equal(key.publicKey, PACK_TEST_KEY, 'the test config’s key is the one the page carries as its test key');
  const p = pack({ version: 2, code: 'jek.plate("x", {});', id: 'ada.mod' });
  const sig = { alg: 'Ed25519', v: 1, id: p.id, hash: await API.packHash(p), by: ADA, at: 1 };
  sig.s = await API.signWith(key, sig);
  assert.equal((await packVerify({ ...p, sig }, PACK_TEST_KEY)).state, 'verified');
  assert.equal(await API.verifyWith(key, sig), true);
  assert.equal(await API.verifyWith(key, { ...sig, id: 'eve.mod' }), false);
});
