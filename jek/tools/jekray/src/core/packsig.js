import { TEST_MODE } from './constants.js';

/* ==========================================================================
   Signed part packs: who made a pack, and that it is as they made it.
   A pack made (or signed) in JEKray by someone signed in is signed by the API (jek-api src/packs.js)
   with an Ed25519 key whose public half is here. Its "sig":
     { alg: 'Ed25519', v: 1, id, hash, by: { kind: 'person' | 'org', id, name, domain? }, at, s }
   hash is the SHA-256 of the pack's canonical JSON (keys sorted, no whitespace) without its sig; s is
   the signature over the canonical JSON of { v, id, hash, by, at }. Checked here with WebCrypto;
   a browser without Ed25519 there asks the API (io/packs.js). The API's copy of canon() and the
   message is jek-api src/packsig.js (test/node/packsig.test.mjs checks they agree).
   ========================================================================== */
export const PACK_SIG_V = 1;
/* TEST key: its private half is in jek-api's test config (vitest.config.js), so anyone can sign with
   it. It is taken only in the tests and on this computer (localhost), never on jeksys.net. Before
   signing goes live, PACK_PUBLIC_KEY becomes the key jek-api/scripts/pack-key.mjs prints. */
export const PACK_TEST_KEY = 'GHJ888iIUQbtlhN8uwy2QJv8Nzsdj-_XUKPRFUJNJqE';
export const PACK_PUBLIC_KEY = PACK_TEST_KEY;
/* the key signatures are checked with on this host, or null when none may be (the test key on the site) */
export const packKeyFor = (host, test = TEST_MODE, key = PACK_PUBLIC_KEY) =>
  key !== PACK_TEST_KEY || test || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host || '') ? key : null;

/* JSON with every object's keys sorted and no whitespace, written out as text (a "__proto__" key stays a key) */
export function packCanon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(x => x === undefined || typeof x === 'function' ? 'null' : packCanon(x)).join(',') + ']';
  const keys = Object.keys(v).filter(k => v[k] !== undefined && typeof v[k] !== 'function').sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + packCanon(v[k])).join(',') + '}';
}
export function packUnsigned(raw) {
  const o = {};
  for (const k of Object.keys(raw)) if (k !== 'sig') Object.defineProperty(o, k, { value: raw[k], enumerable: true });
  return o;
}
export async function packHashOf(raw) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(packCanon(packUnsigned(raw))));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}
export const packSigMessage = s => new TextEncoder().encode(packCanon({ v: s.v, id: s.id, hash: s.hash, by: s.by, at: s.at }));
const packUnb64 = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
/* a signer as kept: kind, id, name and (an organisation's) domain, all short plain text; null if it is not one */
export function packSigner(by) {
  if (!by || typeof by !== 'object' || (by.kind !== 'person' && by.kind !== 'org') || typeof by.id !== 'string' || typeof by.name !== 'string') return null;
  const o = { kind: by.kind, id: by.id.slice(0, 64), name: by.name.replace(/\s+/g, ' ').trim().slice(0, 80) };
  if (by.kind === 'org' && typeof by.domain === 'string' && /^[a-z0-9.-]{3,253}$/.test(by.domain)) o.domain = by.domain;
  return o;
}
export const packSameSigner = (a, b) => !!(a && b && a.kind === b.kind && a.id === b.id);

/* What a pack's signature says, checked here: { state, by, hash }. state: 'unsigned'; 'changed' (edited after
   it was signed); 'bad' (not our signature, or not this pack's); 'nokey' (none may be checked on this page);
   'unsupported' (this browser's WebCrypto has no Ed25519: the API is asked); 'verified'. */
export async function packVerify(raw, key) {
  const hash = await packHashOf(raw), s = raw.sig;
  if (s === undefined) return { state: 'unsigned', by: null, hash };
  const by = s && typeof s === 'object' ? packSigner(s.by) : null;
  if (!by || s.alg !== 'Ed25519' || s.v !== PACK_SIG_V || typeof s.s !== 'string' || !Number.isFinite(s.at) || !/^[0-9a-f]{64}$/.test(s.hash || '')) return { state: 'bad', by: null, hash };
  if (s.hash !== hash) return { state: 'changed', by, hash };       // its id among what changed, if it did
  if (s.id !== raw.id) return { state: 'bad', by: null, hash };
  if (!key) return { state: 'nokey', by, hash };
  let k;
  try { k = await crypto.subtle.importKey('raw', packUnb64(key), { name: 'Ed25519' }, false, ['verify']); }
  catch (err) { return { state: 'unsupported', by, hash }; }
  let ok = false;
  try { ok = await crypto.subtle.verify({ name: 'Ed25519' }, k, packUnb64(s.s), packSigMessage(s)); } catch (err) { ok = false; }
  return { state: ok ? 'verified' : 'bad', by, hash };
}

/* Whether a pack may be installed, and as what. o: { id, module, v (packVerify's, the API's answer filled in),
   st (the API's word on it, null when it could not be asked: { revoked, blocked, owner }), old (the installed
   pack's trust, or null), oldName, test (the tests: nothing asked of the API) }.
   Returns { ok, code, why, notes, update }. */
export function packDecide(o) {
  const v = o.v, st = o.st, verified = v.state === 'verified', notes = [];
  const no = (code, why) => ({ ok: false, code, why, notes, update: false });
  if (st && st.revoked) return no('revoked', 'It has been revoked by JEK Systems: ' + (st.revoked.reason || 'no reason given') + '.');
  if (st && st.blocked) return no('revoked', 'Packs with the id ' + o.id + ' have been taken down by JEK Systems: ' + (st.blocked.reason || 'no reason given') + '.');
  if (o.module && !verified) {
    return no('unverified', 'A module runs code, so JEKray installs one only when it is verified: signed by its maker’s JEKray account and unchanged since. ' +
      { unsigned: 'This one is not signed.', changed: 'This one was changed after it was signed.', nokey: 'Signatures cannot be checked on this page yet.', unknown: 'Its signature could not be checked just now (you may be offline): try again later.' }[v.state] || 'Its signature does not check out.');
  }
  if (o.module && !st && !o.test) return no('unchecked', 'A module is installed only once JEKray has checked it has not been revoked, and that could not be done just now (you may be offline, or the service is unavailable). Try again later.');
  const old = o.old, owner = st && st.owner;
  if (old) {
    const oldSigned = old.state === 'verified' && old.by;
    const ok = oldSigned ? verified && packSameSigner(old.by, v.by) : verified && (!owner || packSameSigner(owner, v.by));
    if (!ok) {
      return no('other_maker', oldSigned
        ? 'A different maker’s pack uses this id (' + o.id + '): ' + (o.oldName || 'the one installed') + ', by ' + old.by.name + ', is installed here, and this one is ' + (verified ? 'by ' + v.by.name : 'not signed by them') + '. Remove the installed one first (File › Part packs and modules…) if you want this one instead.'
        : 'A pack with this id (' + o.id + ') is installed here already, and JEKray cannot tell this one is by the same maker' + (verified ? ' (its id is registered to ' + (owner ? owner.name : 'someone else') + ')' : ': ' + (o.oldName || 'the installed one') + ' is unverified, and so is this one') + '. Remove the installed one first (File › Part packs and modules…) if you want this one instead.');
    }
  }
  if (!verified && owner) notes.push('Its id, ' + o.id + ', is registered to ' + owner.name + (owner.domain ? ' (' + owner.domain + ')' : '') + ', and this copy is not signed by them.');
  if (!st && !o.test) notes.push('JEKray could not check whether it has been revoked (you may be offline, or the service is unavailable).');
  return { ok: true, code: '', why: '', notes, update: !!old };
}

/* how a pack's standing reads: { cls: 'ok' | 'warn' | 'bad', short, text, by } (trust as io/packs.js keeps it, or
   none: a pack installed before signing, taken as unsigned); by: who made it, as said ('' if no one is named) */
export function packTrustLabel(t, author) {
  const signed = t && t.state === 'verified' && t.by;
  const who = signed ? t.by.name + (t.by.kind === 'org' && t.by.domain ? ' (' + t.by.domain + ')' : '') : '';
  const by = signed ? (t.by.kind === 'org' ? who : 'Made by ' + who) : author ? 'By ' + author + ' (unverified)' : '';
  if (t && t.revoked) return { cls: 'bad', short: 'Revoked', text: 'Revoked: ' + (t.revoked.reason || 'taken down by JEK Systems'), by };
  if (signed) return { cls: 'ok', short: '\u2713 Verified', text: t.by.kind === 'org' ? '\u2713 Verified: ' + who : '\u2713 Verified: made by ' + who, by };
  const why = { changed: 'changed after it was signed', bad: 'its signature does not check out', nokey: 'signatures cannot be checked on this page yet', unknown: 'its signature could not be checked just now' }[t && t.state];
  return { cls: 'warn', short: 'Unverified', text: 'Unverified' + (why ? ': ' + why : ''), by };
}
