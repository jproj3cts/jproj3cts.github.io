// Signed part packs: a pack made (or signed) in the app by someone signed in
// is signed here, so whoever installs it can see who made it and that it is
// as they made it. Migration 0015.
//
// - Any account may sign, as itself (its name at the time). A team on an
//   active plan with a verified domain (pack_orgs) may sign as the team, its
//   owner and admins for it. The team verifies the domain itself, with a TXT
//   record the Worker looks up over DNS-over-HTTPS (DOH_URL): POST, then POST
//   .../verify, DELETE /v1/teams/:id/domain; the record is looked at again when
//   the team signs once its last check is 30 days old. JEK Systems can also
//   set one (scripts/packs.mjs org), which is never looked at again.
// - A pack's id is claimed by the first signature of it: after that only the
//   same owner (the person, or the team) may sign that id. `jek`, `jekray`,
//   `jeksys` and ids under them (`jek.*` ...) are JEK Systems' own, and
//   accounts or teams it has flagged ('jek').
// - JEK Systems can revoke a signature (by hash, by id, or all of an
//   account's), which the app checks on installing and once a day after;
//   revoking by id or by account also stops any more signing of them.
// - Nothing of a pack is kept here but its id, hash, version and kind, who
//   signed it and when. The private key is the PACK_SIGNING_KEY secret
//   (scripts/pack-key.mjs makes one); without it signing answers 503.

import { workspaceAccess } from './benches.js';
import { requireOps } from './institutions.js';
import { canon, packHash, signingKey, signWith, verifyWith, SIG_V } from './packsig.js';
import { planActive } from './users.js';
import { ApiError, newId, now } from './util.js';

export const PACK_MAX = 8 * 1024 * 1024;
export const CODE_MAX = 512 * 1024;
// the most the sign route reads: a pack and its JSON wrapping
export const SIGN_BODY_MAX = PACK_MAX + 64 * 1024;
const ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const HASH = /^[0-9a-f]{64}$/;
export const JEK = { kind: 'org', id: 'jek', name: 'JEK Systems', domain: 'jeksys.net' };
const RESERVED = ['jek', 'jekray', 'jeksys'];
export const reservedId = (id) => RESERVED.some((r) => id === r || id.startsWith(r + '.'));
const DOMAIN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const DAY = 24 * 60 * 60 * 1000;
export const DOMAIN_CHECK_MS = 7 * DAY;     // a TXT record's token is good this long
export const DOMAIN_RECHECK_MS = 30 * DAY;  // a verified domain's record looked at again, on signing, after this
export const DOMAIN_WAIT_MS = 10 * 1000;    // lookups for one team at most this often
const DOH = 'https://cloudflare-dns.com/dns-query';

// A domain as typed, made plain: lower case, no scheme, path or final dot, an
// international name in its ASCII (punycode) form. Refused unless it looks like
// a name an organisation registers: no address, no bare suffix, not ours.
export function cleanDomain(v) {
  let d = String(v ?? '').trim().toLowerCase().replace(/^@/, '').replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '');
  const bad = () => new ApiError(400, 'bad_domain', `Not a domain an organisation owns: ${String(v ?? '').slice(0, 80) || '(none)'}. Give its name, as “acme.com”.`);
  if (/[^\x21-\x7e]/.test(d)) {
    try { d = new URL('http://' + d).hostname; } catch { throw bad(); }
  }
  if (!DOMAIN.test(d) || /^(ac|edu|co|gov|org|com|net|ltd|plc|sch|nhs|mil|gob|go|or|ne)\.[a-z]{2}$/.test(d)) throw bad();
  if (/(^|\.)(jeksys\.net|jekray\.[a-z]+)$/.test(d)) throw new ApiError(400, 'bad_domain', `${d} is JEK Systems’ own.`);
  return d;
}

// The TXT strings at `name`, looked up over DNS-over-HTTPS; [] when there are
// none (or no such name), null when the lookup itself failed.
export async function txtRecords(env, name) {
  let r;
  try {
    r = await fetch((env.DOH_URL || DOH) + '?' + new URLSearchParams({ name, type: 'TXT' }), { headers: { accept: 'application/dns-json' } });
  } catch {
    return null;
  }
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  if (!j || typeof j.Status !== 'number') return null;
  if (j.Status === 3) return [];              // NXDOMAIN: no such name
  if (j.Status !== 0) return null;
  // each record's data is its strings, quoted ("a" "b" for one longer than 255 characters), joined
  return (Array.isArray(j.Answer) ? j.Answer : []).filter((a) => a && a.type === 16).map((a) => {
    const parts = [...String(a.data).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, '$1'));
    return (parts.length ? parts.join('') : String(a.data)).trim();
  });
}
const recordOf = (d, token) => ({ type: 'TXT', name: `_jekray-verify.${d}`, value: `jekray-verify=${token}` });

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
    throw new ApiError(403, 'id_reserved', 'Ids starting "jek.", "jekray." or "jeksys." are JEKray’s own. Choose another id, as "yourname.parts".');
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
  if (by.kind === 'org') await recheckOrg(env, by, user);
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

// ---------- a team's domain, verified by the team ----------

const audit = (env, ws, user, action, target) =>
  env.DB.prepare('INSERT INTO audit (id, workspace_id, user_id, action, target, at) VALUES (?, ?, ?, ?, ?, ?)').bind(newId(), ws, user ? user.id : null, action, target || null, now());

// A domain verified by its TXT record, looked at again on signing once the last
// check is 30 days old. Gone: the team signs as itself no more until verified
// again. The lookup failing (the resolver down) holds nothing up.
async function recheckOrg(env, by, user, t = now()) {
  const o = await env.DB.prepare('SELECT domain, method, token, checked_at, verified_at FROM pack_orgs WHERE workspace_id = ?').bind(by.id).first();
  if (!o || o.method !== 'dns' || t - (o.checked_at || o.verified_at) < DOMAIN_RECHECK_MS) return;
  const recs = await txtRecords(env, recordOf(o.domain, o.token).name);
  if (recs === null) return;
  if (recs.includes(recordOf(o.domain, o.token).value)) {
    await env.DB.prepare('UPDATE pack_orgs SET checked_at = ? WHERE workspace_id = ?').bind(t, by.id).run();
    return;
  }
  await env.DB.batch([env.DB.prepare('DELETE FROM pack_orgs WHERE workspace_id = ?').bind(by.id), audit(env, by.id, user, 'domain.lapsed', o.domain)]);
  throw new ApiError(403, 'domain_lapsed', `The record _jekray-verify.${o.domain} is no longer there, so the team cannot sign as itself until it verifies the domain again (the team’s settings, under Signing packs as the team).`);
}

// The team's domain as its owner and admins see it: the one verified, and one being checked with the record to add.
export async function domainState(env, ws, t = now()) {
  const o = await env.DB.prepare('SELECT domain, verified_at, method, checked_at FROM pack_orgs WHERE workspace_id = ?').bind(ws).first();
  const p = await env.DB.prepare('SELECT domain, token, created_at, expires_at, checked_at FROM pack_domain_checks WHERE workspace_id = ?').bind(ws).first();
  return {
    domain: o ? { domain: o.domain, verified_at: o.verified_at, method: o.method, checked_at: o.checked_at } : null,
    pending: p ? { domain: p.domain, record: recordOf(p.domain, p.token), created_at: p.created_at, expires_at: p.expires_at, checked_at: p.checked_at, expired: p.expires_at <= t } : null,
  };
}

// The caller runs this team (owner or admin); with plan, it is on an active plan.
async function domainAccess(env, user, id, plan = true) {
  const a = await workspaceAccess(env, user, id);
  if (a.kind !== 'team') throw new ApiError(404, 'not_found', 'No such team.');
  if (a.role !== 'owner' && a.role !== 'admin') throw new ApiError(403, 'forbidden', 'Only the team’s owner and admins can do that.');
  if (plan && !a.active) throw new ApiError(402, 'no_plan', 'Signing packs as an organisation needs the team on an active JEKrayPro plan.');
  return a;
}
const takenBy = (env, d, ws) => env.DB.prepare('SELECT workspace_id FROM pack_orgs WHERE domain = ? AND workspace_id != ?').bind(d, ws).first();
const takenError = (d) => new ApiError(409, 'domain_taken', `${d} is verified by another team. If it is your organisation’s, write to support@jeksys.net.`);

// POST /v1/teams/:id/domain  {domain}: the TXT record to add, good for 7 days
// (the same one again while it is good, so asking twice does not undo a record added).
export async function domainStart(req, env, user, id) {
  await domainAccess(env, user, id);
  const b = await body(req);
  const d = cleanDomain(b && b.domain), t = now();
  const o = await env.DB.prepare('SELECT domain FROM pack_orgs WHERE workspace_id = ?').bind(id).first();
  if (o && o.domain !== d) throw new ApiError(409, 'has_domain', `The team’s domain is ${o.domain}: remove it first to verify another.`);
  if (await takenBy(env, d, id)) throw takenError(d);
  const p = await env.DB.prepare('SELECT domain, token, expires_at FROM pack_domain_checks WHERE workspace_id = ?').bind(id).first();
  const token = p && p.domain === d && p.expires_at > t ? p.token : newId();
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO pack_domain_checks (workspace_id, domain, token, created_at, expires_at, checked_at) VALUES (?, ?, ?, ?, ?, NULL)')
      .bind(id, d, token, t, t + DOMAIN_CHECK_MS),
    audit(env, id, user, 'domain.asked', d),
  ]);
  return domainState(env, id);
}

// POST /v1/teams/:id/domain/verify: the record looked up; found, the domain is the team's
export async function domainVerify(env, user, id) {
  await domainAccess(env, user, id);
  const t = now();
  const p = await env.DB.prepare('SELECT domain, token, expires_at, checked_at FROM pack_domain_checks WHERE workspace_id = ?').bind(id).first();
  if (!p) throw new ApiError(400, 'no_check', 'Give the domain to verify first.');
  if (p.expires_at <= t) throw new ApiError(410, 'expired', `The record for ${p.domain} was good for 7 days and has expired: start again for a new one.`);
  if (p.checked_at && t - p.checked_at < DOMAIN_WAIT_MS) throw new ApiError(429, 'too_soon', 'Checked a moment ago: wait a few seconds and check again.');
  await env.DB.prepare('UPDATE pack_domain_checks SET checked_at = ? WHERE workspace_id = ?').bind(t, id).run();
  if (await takenBy(env, p.domain, id)) throw takenError(p.domain);
  const rec = recordOf(p.domain, p.token), recs = await txtRecords(env, rec.name);
  if (recs === null) throw new ApiError(503, 'dns_unavailable', 'JEKray could not look the record up just now: try again in a minute.');
  if (!recs.includes(rec.value)) {
    const other = recs.some((r) => r.startsWith('jekray-verify='));
    throw new ApiError(409, 'not_found_yet', other
      ? `${rec.name} has a jekray-verify record, but not this one: its value must be exactly ${rec.value}.`
      : `No TXT record ${rec.name} was found yet. A new record can take a while to show (up to an hour or two): check again later.`);
  }
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO pack_orgs (workspace_id, domain, verified_at, method, token, checked_at) VALUES (?, ?, ?, 'dns', ?, ?)").bind(id, p.domain, t, p.token, t),
      env.DB.prepare('DELETE FROM pack_domain_checks WHERE workspace_id = ?').bind(id),
      audit(env, id, user, 'domain.verified', p.domain),
    ]);
  } catch (err) {
    if (/UNIQUE/.test(String(err && err.message))) throw takenError(p.domain);   // another team verified it a moment before
    throw err;
  }
  return domainState(env, id);
}

// DELETE /v1/teams/:id/domain: the verified domain, and any being checked, taken off (signatures made stand)
export async function domainRemove(env, user, id) {
  await domainAccess(env, user, id, false);
  const o = await env.DB.prepare('SELECT domain FROM pack_orgs WHERE workspace_id = ?').bind(id).first();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM pack_orgs WHERE workspace_id = ?').bind(id),
    env.DB.prepare('DELETE FROM pack_domain_checks WHERE workspace_id = ?').bind(id),
    ...(o ? [audit(env, id, user, 'domain.removed', o.domain)] : []),
  ]);
  return domainState(env, id);
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

// POST /ops/packs/reserve  {user | org, on}: may sign ids under jek., jekray. and jeksys.
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

// POST /ops/packs/org  {org, domain, force?}: the team signs as itself with that domain; domain null takes it off
// (which also frees a domain for another team). Its owner's email (verified by their sign-in provider) must be at
// the domain, unless force (checked some other way). An override of the team's own DNS check: never looked at again.
export async function opsOrg(req, env) {
  requireOps(req, env);
  const b = (await body(req)) || {};
  const w = await env.DB.prepare("SELECT w.id, w.name, u.email FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE w.id = ? AND w.kind = 'team'").bind(String(b.org || '')).first();
  if (!w) throw new ApiError(404, 'not_found', 'No such team.');
  if (b.domain === null || b.domain === '') {
    await env.DB.prepare('DELETE FROM pack_orgs WHERE workspace_id = ?').bind(w.id).run();
    return { ok: true, org: w.id, domain: null };
  }
  const d = cleanDomain(b.domain);
  const mail = String(w.email || '').toLowerCase().split('@')[1] || '';
  if (!b.force && mail !== d && !mail.endsWith('.' + d)) {
    throw new ApiError(409, 'not_verified', `The team owner’s email (${w.email || 'none'}) is not at ${d}. Check it some other way, then pass force.`);
  }
  const taken = await env.DB.prepare('SELECT workspace_id FROM pack_orgs WHERE domain = ? AND workspace_id != ?').bind(d, w.id).first();
  if (taken) throw new ApiError(409, 'domain_taken', `${d} is already another team’s.`);
  await env.DB.prepare("INSERT OR REPLACE INTO pack_orgs (workspace_id, domain, verified_at, method, token, checked_at) VALUES (?, ?, ?, 'ops', NULL, NULL)").bind(w.id, d, now()).run();
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
