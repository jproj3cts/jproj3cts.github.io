// Signed part packs: a pack made (or signed) in the app by someone signed in
// is signed here, so whoever installs it can see who made it and that it is
// as they made it. Migration 0015.
//
// - Any account may sign, as itself (its name at the time). A team on an
//   active plan whose domain JEK Systems has verified (pack_orgs, set with
//   scripts/packs.mjs org) may sign as the team, its owner and admins for it.
// - A pack's id is claimed by the first signature of it: after that only the
//   same owner (the person, or the team) may sign that id. `jek` and `jek.*`
//   are JEK Systems' own, and accounts or teams it has flagged ('jek').
// - JEK Systems can revoke a signature (by hash, by id, or all of an
//   account's), which the app checks on installing and once a day after;
//   revoking by id or by account also stops any more signing of them.
// - Nothing of a pack is kept here but its id, hash, version and kind, who
//   signed it and when. The private key is the PACK_SIGNING_KEY secret
//   (scripts/pack-key.mjs makes one); without it signing answers 503.

import { requireOps } from './institutions.js';
import { canon, packHash, signingKey, signWith, verifyWith, SIG_V } from './packsig.js';
import { planActive } from './users.js';
import { ApiError, now } from './util.js';

export const PACK_MAX = 8 * 1024 * 1024;
export const CODE_MAX = 512 * 1024;
// the most the sign route reads: a pack and its JSON wrapping
export const SIGN_BODY_MAX = PACK_MAX + 64 * 1024;
const ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const HASH = /^[0-9a-f]{64}$/;
export const JEK = { kind: 'org', id: 'jek', name: 'JEK Systems', domain: 'jeksys.net' };
export const reservedId = (id) => id === 'jek' || id.startsWith('jek.');
const DOMAIN = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const off = () => new ApiError(503, 'signing_off', 'Signing packs is not set up on this server yet.');

async function body(req) {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, 'bad_request', 'The request body is not valid JSON.');
  }
}

// The pack, checked to be one the app would read; its kind ('parts' or 'module').
export function checkPack(p) {
  const bad = (m) => new ApiError(400, 'bad_pack', m);
  if (!p || typeof p !== 'object' || Array.isArray(p) || p.format !== 'jekpack') throw bad('That is not a part pack.');
  if (p.version !== 1 && p.version !== 2) throw bad('A pack’s "version" is 1, or 2 for a module.');
  if (typeof p.id !== 'string' || !ID.test(p.id)) throw bad('A pack’s "id" is 2 to 64 lower-case letters, digits, dots, dashes or underscores.');
  if (p.scripts !== undefined) throw bad('A pack has no "scripts": a module’s code goes in "code".');
  if (p.code !== undefined) {
    if (p.version !== 2) throw bad('Only a version 2 pack (a module) has code.');
    if (typeof p.code !== 'string' || !p.code.trim()) throw bad('Its "code" is not a script.');
    if (p.code.length > CODE_MAX) throw bad('A module’s code can be at most 512 KB.');
  }
  if (canon(p).length > PACK_MAX) throw new ApiError(413, 'too_large', 'A pack can be at most 8 MB.');
  return p.code !== undefined ? 'module' : 'parts';
}

async function flagsOf(env, kind, id) {
  const { results } = await env.DB.prepare('SELECT flag, reason FROM pack_flags WHERE owner_kind = ? AND owner_id = ?').bind(kind, id).all();
  return new Map(results.map((r) => [r.flag, r.reason]));
}

// Who the caller may sign as: themselves, and each verified team they run on an active plan.
export async function signersOf(env, user, t = now()) {
  const { results } = await env.DB.prepare(
    `SELECT w.id, w.name, o.domain, s.plan, s.status, s.period_end, s.past_due_since, s.stripe_customer
       FROM members m JOIN workspaces w ON w.id = m.workspace_id AND w.kind = 'team'
       JOIN pack_orgs o ON o.workspace_id = w.id
       LEFT JOIN subscriptions s ON s.workspace_id = w.id
      WHERE m.user_id = ? AND m.role IN ('owner', 'admin')
      ORDER BY w.name`,
  ).bind(user.id).all();
  return [
    { kind: 'person', id: user.id, name: user.name },
    ...results.filter((r) => planActive(r.plan && r, t)).map((r) => ({ kind: 'org', id: r.id, name: r.name, domain: r.domain })),
  ];
}

// Sign the pack as `by`, under the claim rules. `user` is who asked (null for JEK Systems' own).
async function signAs(env, by, pack, user) {
  const key = await signingKey(env);
  if (!key) throw off();
  const kind = checkPack(pack);
  const flags = await flagsOf(env, by.kind, by.id);
  // someone whose own packs were taken down cannot sign for a team either
  if (user && by.kind === 'org' && !flags.has('blocked')) {
    const mine = await flagsOf(env, 'person', user.id);
    if (mine.has('blocked')) flags.set('blocked', mine.get('blocked'));
  }
  if (flags.has('blocked')) {
    throw new ApiError(403, 'blocked', `Packs from ${by.kind === 'org' ? 'this team' : 'your account'} can no longer be signed${flags.get('blocked') ? ': ' + flags.get('blocked') : ''}. Write to support@jeksys.net if you think this is wrong.`);
  }
  const id = pack.id;
  if (reservedId(id) && !(by.kind === JEK.kind && by.id === JEK.id) && !flags.has('jek')) {
    throw new ApiError(403, 'id_reserved', 'Ids starting "jek." are JEKray’s own. Choose another id, as "yourname.parts".');
  }
  const claim = await env.DB.prepare('SELECT owner_kind, owner_id, blocked_at, reason FROM pack_ids WHERE id = ?').bind(id).first();
  if (claim && claim.blocked_at) throw new ApiError(403, 'id_blocked', `The id ${id} has been taken down${claim.reason ? ': ' + claim.reason : ''}.`);
  if (claim && (claim.owner_kind !== by.kind || claim.owner_id !== by.id)) {
    throw new ApiError(409, 'id_taken', `The id ${id} belongs to another maker’s pack. Choose another id.`);
  }
  const hash = await packHash(pack);
  const was = await env.DB.prepare('SELECT revoked_at FROM pack_sigs WHERE hash = ?').bind(hash).first();
  if (was && was.revoked_at) throw new ApiError(409, 'revoked', 'This pack’s signature was revoked, so it cannot be signed again.');
  const sig = { alg: 'Ed25519', v: SIG_V, id, hash, by, at: now() };
  sig.s = await signWith(key, sig);
  // the claim and the signature together, the signature only while the claim is this owner's (two at once: one wins)
  const [, put] = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO pack_ids (id, owner_kind, owner_id, created_at) VALUES (?, ?, ?, ?)').bind(id, by.kind, by.id, sig.at),
    env.DB.prepare(
      `INSERT OR REPLACE INTO pack_sigs (hash, id, pack_version, kind, signer_kind, signer_id, signer_name, domain, asked_by, signed_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM pack_ids WHERE id = ? AND owner_kind = ? AND owner_id = ? AND blocked_at IS NULL)`,
    ).bind(hash, id, String(pack.packVersion || '').slice(0, 20), kind, by.kind, by.id, by.name, by.domain || null, user ? user.id : null, sig.at, id, by.kind, by.id),
  ]);
  if (!put.meta.changes) throw new ApiError(409, 'id_taken', `The id ${id} belongs to another maker’s pack. Choose another id.`);
  return { sig, hash, claimed: !claim };
}

// POST /v1/packs/sign  {pack, as?}  as: a team's workspace id to sign as the team
export async function sign(req, env, user) {
  const b = await body(req);
  if (!b || typeof b !== 'object') throw new ApiError(400, 'bad_request', 'Send {pack}.');
  const by = b.as ? (await signersOf(env, user)).find((s) => s.kind === 'org' && s.id === b.as) : { kind: 'person', id: user.id, name: user.name };
  if (!by) throw new ApiError(403, 'forbidden', 'You cannot sign for that team: it needs a verified domain and an active plan, and you its owner or an admin.');
  return signAs(env, by, b.pack, user);
}

// GET /v1/packs/signers
export async function signers(env, user) {
  return { signers: await signersOf(env, user), signing: !!env.PACK_SIGNING_KEY };
}

// GET /v1/packs/key: the public key the app checks signatures with
export async function publicKey(env) {
  const key = await signingKey(env);
  if (!key) throw off();
  return { alg: 'Ed25519', key: key.publicKey, v: SIG_V };
}

// POST /v1/packs/verify  {sig}: for a browser whose WebCrypto has no Ed25519. The app checks the hash itself.
export async function verify(req, env) {
  const key = await signingKey(env);
  if (!key) throw off();
  const b = await body(req);
  const s = b && b.sig;
  const ok = !!s && typeof s === 'object' && typeof s.id === 'string' && HASH.test(s.hash || '') && Number.isFinite(s.at) && s.by && typeof s.by === 'object'
    && await verifyWith(key, s);
  return { valid: ok };
}

const list = (v, re) => [...new Set(String(v || '').split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 101).filter((x) => re.test(x));

async function ownerOf(env, kind, id) {
  if (kind === JEK.kind && id === JEK.id) return { ...JEK };
  if (kind === 'org') {
    const w = await env.DB.prepare('SELECT w.name, o.domain FROM workspaces w LEFT JOIN pack_orgs o ON o.workspace_id = w.id WHERE w.id = ?').bind(id).first();
    return { kind, id, name: w ? w.name : 'A team no longer here', ...(w && w.domain ? { domain: w.domain } : {}) };
  }
  const u = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(id).first();
  return { kind, id, name: u ? u.name : 'Deleted user' };
}

// GET /v1/packs/status?hashes=h1,h2&ids=a.b,c.d — public, cached for a few minutes
export async function status(req, env) {
  const url = new URL(req.url);
  const hashes = list(url.searchParams.get('hashes'), HASH), ids = list(url.searchParams.get('ids'), ID);
  if (hashes.length > 100 || ids.length > 100) throw new ApiError(400, 'bad_request', 'At most 100 hashes and 100 ids at once.');
  const packs = {}, owners = {};
  if (hashes.length) {
    const { results } = await env.DB.prepare(`SELECT hash, id, revoked_at, reason FROM pack_sigs WHERE hash IN (${hashes.map(() => '?').join(', ')})`).bind(...hashes).all();
    for (const r of results) packs[r.hash] = { id: r.id, revoked: r.revoked_at ? { at: r.revoked_at, reason: r.reason || '' } : null };
  }
  if (ids.length) {
    const { results } = await env.DB.prepare(`SELECT id, owner_kind, owner_id, blocked_at, reason FROM pack_ids WHERE id IN (${ids.map(() => '?').join(', ')})`).bind(...ids).all();
    for (const r of results) owners[r.id] = { owner: await ownerOf(env, r.owner_kind, r.owner_id), blocked: r.blocked_at ? { at: r.blocked_at, reason: r.reason || '' } : null };
  }
  return { packs, ids: owners, at: now() };
}

// ---------- operations: JEK Systems only (scripts/packs.mjs) ----------

// {user: id or email} or {org: team workspace id} or {jek: true}: the owner it names
async function target(env, b) {
  if (b.jek) return { kind: JEK.kind, id: JEK.id };
  if (b.org) {
    const w = await env.DB.prepare("SELECT id FROM workspaces WHERE id = ? AND kind = 'team'").bind(String(b.org)).first();
    if (!w) throw new ApiError(404, 'not_found', 'No such team.');
    return { kind: 'org', id: w.id };
  }
  if (b.user) {
    const v = String(b.user).trim();
    const u = await env.DB.prepare('SELECT id FROM users WHERE (id = ? OR lower(email) = lower(?)) AND deleted_at IS NULL').bind(v, v).first();
    if (!u) throw new ApiError(404, 'not_found', 'No such account.');
    return { kind: 'person', id: u.id };
  }
  return null;
}

// GET /ops/packs?id=&hash=&user=&org=  signatures (newest first) and the claims they name
export async function opsList(req, env) {
  requireOps(req, env);
  const q = new URL(req.url).searchParams, where = [], args = [];
  if (q.get('id')) { where.push('s.id = ?'); args.push(q.get('id')); }
  if (q.get('hash')) { where.push('s.hash = ?'); args.push(q.get('hash')); }
  const who = await target(env, { user: q.get('user'), org: q.get('org') });
  if (who) { where.push('s.signer_kind = ? AND s.signer_id = ?'); args.push(who.kind, who.id); }
  const { results } = await env.DB.prepare(
    `SELECT s.*, i.owner_kind, i.owner_id, i.blocked_at FROM pack_sigs s LEFT JOIN pack_ids i ON i.id = s.id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.signed_at DESC LIMIT 200`,
  ).bind(...args).all();
  const { results: flags } = await env.DB.prepare('SELECT * FROM pack_flags ORDER BY created_at').all();
  const { results: orgs } = await env.DB.prepare('SELECT o.*, w.name FROM pack_orgs o JOIN workspaces w ON w.id = o.workspace_id ORDER BY w.name').all();
  return { signatures: results, flags, orgs };
}

// POST /ops/packs/revoke  {hash | id | user | org, reason}   and /unrevoke (no reason)
export async function opsRevoke(req, env, undo = false) {
  requireOps(req, env);
  const b = (await body(req)) || {};
  const reason = String(b.reason || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!undo && !reason) throw new ApiError(400, 'bad_request', 'Give a reason: it is shown to whoever has the pack.');
  const t = now(), at = undo ? null : t, why = undo ? null : reason, st = [];
  if (b.hash) {
    if (!HASH.test(b.hash)) throw new ApiError(400, 'bad_request', 'Not a pack hash.');
    st.push(env.DB.prepare('UPDATE pack_sigs SET revoked_at = ?, reason = ? WHERE hash = ?').bind(at, why, b.hash));
  } else if (b.id) {
    st.push(env.DB.prepare('UPDATE pack_sigs SET revoked_at = ?, reason = ? WHERE id = ?').bind(at, why, b.id));
    st.push(env.DB.prepare('UPDATE pack_ids SET blocked_at = ?, reason = ? WHERE id = ?').bind(at, why, b.id));
  } else {
    const who = await target(env, b);
    if (!who) throw new ApiError(400, 'bad_request', 'Name a hash, an id, a user or an org.');
    st.push(env.DB.prepare('UPDATE pack_sigs SET revoked_at = ?, reason = ? WHERE signer_kind = ? AND signer_id = ?').bind(at, why, who.kind, who.id));
    st.push(undo
      ? env.DB.prepare("DELETE FROM pack_flags WHERE owner_kind = ? AND owner_id = ? AND flag = 'blocked'").bind(who.kind, who.id)
      : env.DB.prepare("INSERT OR REPLACE INTO pack_flags (owner_kind, owner_id, flag, reason, created_at) VALUES (?, ?, 'blocked', ?, ?)").bind(who.kind, who.id, reason, t));
  }
  const out = await env.DB.batch(st);
  return { ok: true, signatures: out[0].meta.changes };
}

// POST /ops/packs/reserve  {user | org, on}: may sign ids under jek.
export async function opsReserve(req, env) {
  requireOps(req, env);
  const b = (await body(req)) || {};
  const who = await target(env, b);
  if (!who) throw new ApiError(400, 'bad_request', 'Name a user or an org.');
  await (b.on === false
    ? env.DB.prepare("DELETE FROM pack_flags WHERE owner_kind = ? AND owner_id = ? AND flag = 'jek'").bind(who.kind, who.id)
    : env.DB.prepare("INSERT OR REPLACE INTO pack_flags (owner_kind, owner_id, flag, reason, created_at) VALUES (?, ?, 'jek', NULL, ?)").bind(who.kind, who.id, now())
  ).run();
  return { ok: true, ...who, jek: b.on !== false };
}

// POST /ops/packs/org  {org, domain, force?}: the team signs as itself with that domain; domain null takes it off.
// Its owner's email (verified by their sign-in provider) must be at the domain, unless force (checked some other way).
export async function opsOrg(req, env) {
  requireOps(req, env);
  const b = (await body(req)) || {};
  const w = await env.DB.prepare("SELECT w.id, w.name, u.email FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE w.id = ? AND w.kind = 'team'").bind(String(b.org || '')).first();
  if (!w) throw new ApiError(404, 'not_found', 'No such team.');
  if (b.domain === null || b.domain === '') {
    await env.DB.prepare('DELETE FROM pack_orgs WHERE workspace_id = ?').bind(w.id).run();
    return { ok: true, org: w.id, domain: null };
  }
  const d = String(b.domain).trim().toLowerCase().replace(/^@/, '');
  if (!DOMAIN.test(d) || /^(ac|edu|co|gov|org|com)\.[a-z]{2}$/.test(d)) throw new ApiError(400, 'bad_domain', `Not a domain an organisation owns: ${d}`);
  const mail = String(w.email || '').toLowerCase().split('@')[1] || '';
  if (!b.force && mail !== d && !mail.endsWith('.' + d)) {
    throw new ApiError(409, 'not_verified', `The team owner’s email (${w.email || 'none'}) is not at ${d}. Check it some other way, then pass force.`);
  }
  const taken = await env.DB.prepare('SELECT workspace_id FROM pack_orgs WHERE domain = ? AND workspace_id != ?').bind(d, w.id).first();
  if (taken) throw new ApiError(409, 'domain_taken', `${d} is already another team’s.`);
  await env.DB.prepare('INSERT OR REPLACE INTO pack_orgs (workspace_id, domain, verified_at) VALUES (?, ?, ?)').bind(w.id, d, now()).run();
  return { ok: true, org: w.id, name: w.name, domain: d };
}

// POST /ops/packs/release  {id}: an id's claim dropped (a dispute settled); its signatures stand
export async function opsRelease(req, env) {
  requireOps(req, env);
  const b = (await body(req)) || {};
  const r = await env.DB.prepare('DELETE FROM pack_ids WHERE id = ?').bind(String(b.id || '')).run();
  return { ok: true, released: r.meta.changes };
}

// POST /ops/packs/sign  {pack}: signed as JEK Systems (the example module, our own packs)
export async function opsSign(req, env) {
  requireOps(req, env);
  const b = (await body(req)) || {};
  return signAs(env, { ...JEK }, b.pack, null);
}
