// Teams: a workspace several people share, with one subscription paid by
// its owner for a seat each (owner, admins and editors; viewers take none).
//
// A team is a workspace of kind 'team'. Its benches, folders and parts are
// the workspace's, as a personal workspace's are; its members have roles
// (owner, admin, editor, viewer) and the usual rules: writers need an active
// plan, readers never do. People join by invitation: an email with a link
// that carries a token (hashed here; the link is the only copy), good for 14
// days, one per address per team at a time. Owners and admins invite, change
// roles and remove people; only the owner hands the team on or deletes it.
//
// Seats follow the members. The Stripe subscription's quantity is kept at
// the number of paid members (never below MIN_SEATS): when someone joins
// beyond it, a seat is added and charged for the rest of the period; when
// someone leaves, the seat comes off at the next renewal (no credit). A
// paid seat in a team whose plan is active gives that person JEKrayPro on
// their own workspace too (teamSeatActive, src/users.js).
//
// Everything that changes a team goes in its activity record (the audit
// table), which its owner and admins can read.

import { MIN_SEATS, mirror, paidMembers, stripe } from './billing.js';
import { readJson, workspaceAccess } from './benches.js';
import { mailOn, sendEmail } from './mail.js';
import { ApiError, newId, newToken, now, sha256 } from './util.js';

export { MIN_SEATS };
const MAX_TEAMS = 10;                 // owned by one person
const MAX_MEMBERS = 200;
const MAX_INVITES = 200;
const INVITE_MS = 14 * 24 * 60 * 60 * 1000;
const ROLES = new Set(['admin', 'editor', 'viewer']);
const PAID = new Set(['owner', 'admin', 'editor']);
const LIVE = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'];

const cleanName = (v) => {
  const s = String(v || '').replace(/\s+/g, ' ').trim();
  if (s.length < 1 || s.length > 60) throw new ApiError(400, 'bad_request', 'Give the team a name of up to 60 characters.');
  return s;
};
const emailOf = (v) => {
  const e = String(v || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) throw new ApiError(400, 'bad_request', 'That is not an email address.');
  return e;
};
const roleOf = (v, { admins = true } = {}) => {
  const r = String(v || 'editor').toLowerCase();
  if (!ROLES.has(r) || (!admins && r === 'admin')) throw new ApiError(400, 'bad_request', admins ? 'A role is admin, editor or viewer.' : 'A role is editor or viewer.');
  return r;
};
const seatOf = (role) => (PAID.has(role) ? 1 : 0);

const audit = (env, ws, user, action, target) =>
  env.DB.prepare('INSERT INTO audit (id, workspace_id, user_id, action, target, at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(newId(), ws, user ? user.id : null, action, target || null, now());

// The caller's standing in a team: 404 for someone who is not in it.
export async function teamAccess(env, user, id) {
  const a = await workspaceAccess(env, user, id);
  if (a.kind !== 'team') throw new ApiError(404, 'not_found', 'No such team.');
  return a;
}
const manages = (a) => a.role === 'owner' || a.role === 'admin';
const mustManage = (a) => { if (!manages(a)) throw new ApiError(403, 'forbidden', 'Only the team’s owner and admins can do that.'); };
const mustOwn = (a) => { if (a.role !== 'owner') throw new ApiError(403, 'forbidden', 'Only the team’s owner can do that.'); };

// The subscription's quantity brought to the paid members (never below
// MIN_SEATS): up at once, charged for the rest of the period; down for the
// next renewal. Nothing happens without a live Stripe subscription.
export async function syncSeats(env, ws) {
  const s = await env.DB.prepare('SELECT * FROM subscriptions WHERE workspace_id = ?').bind(ws).first();
  if (!s || s.plan !== 'team' || s.stripe_customer === 'manual' || !s.stripe_subscription || !LIVE.includes(s.status)) return null;
  const want = Math.max(MIN_SEATS, await paidMembers(env, ws));
  if (want === s.seats) return s.seats;
  const sub = await stripe(env, 'GET', `/subscriptions/${s.stripe_subscription}`);
  const item = sub.items && sub.items.data && sub.items.data[0];
  if (!item) return s.seats;
  const updated = await stripe(env, 'POST', `/subscriptions/${sub.id}`, {
    items: [{ id: item.id, quantity: want }],
    proration_behavior: want > s.seats ? 'always_invoice' : 'none',
  });
  await mirror(env, updated);
  return want;
}

// ---------- the team ----------

// POST /v1/teams  {name}
export async function create(req, env, user) {
  const body = await readJson(req);
  const name = cleanName(body && body.name);
  const owned = await env.DB.prepare("SELECT COUNT(*) AS n FROM workspaces WHERE owner_id = ? AND kind = 'team'").bind(user.id).first();
  if (owned.n >= MAX_TEAMS) throw new ApiError(409, 'too_many', `You already own ${MAX_TEAMS} teams.`);
  const id = newId(), t = now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO workspaces (id, kind, name, owner_id, created_at) VALUES (?, 'team', ?, ?, ?)").bind(id, name, user.id, t),
    env.DB.prepare("INSERT INTO members (workspace_id, user_id, role, seat, created_at) VALUES (?, ?, 'owner', 1, ?)").bind(id, user.id, t),
    audit(env, id, user, 'team.create', name),
  ]);
  return get(env, user, id);
}

// GET /v1/teams/:id — the team as its members see it; its invitations and
// activity record only for the owner and admins.
export async function get(env, user, id) {
  const a = await teamAccess(env, user, id);
  const w = await env.DB.prepare('SELECT w.id, w.name, w.owner_id, w.created_at FROM workspaces w WHERE w.id = ?').bind(id).first();
  const s = await env.DB.prepare('SELECT * FROM subscriptions WHERE workspace_id = ?').bind(id).first();
  const { results: members } = await env.DB.prepare(
    `SELECT m.user_id, m.role, m.seat, m.created_at, u.name, u.email FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = ? ORDER BY m.role = 'owner' DESC, m.role = 'admin' DESC, u.name`,
  ).bind(id).all();
  const paid = members.filter((m) => m.seat).length;
  const out = {
    id: w.id,
    name: w.name,
    role: a.role,
    active: a.active,
    plan: s ? { plan: s.plan, status: s.status, seats: s.seats, period_end: s.period_end, interval: s.interval, cancel_at: s.cancel_at, billing: s.stripe_customer !== 'manual' } : null,
    seats: { paid, min: MIN_SEATS, billed: s ? s.seats : 0 },
    members: members.map((m) => ({ user_id: m.user_id, name: m.name, email: manages(a) ? m.email : undefined, role: m.role, seat: !!m.seat, joined_at: m.created_at })),
  };
  if (manages(a)) {
    const { results: invites } = await env.DB.prepare(
      'SELECT id, email, role, created_at, expires_at FROM invitations WHERE workspace_id = ? ORDER BY created_at DESC',
    ).bind(id).all();
    const { results: activity } = await env.DB.prepare(
      `SELECT a.action, a.target, a.at, u.name AS who FROM audit a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.workspace_id = ? ORDER BY a.at DESC LIMIT 50`,
    ).bind(id).all();
    out.invites = invites.filter((i) => i.expires_at > now());
    out.activity = activity;
  }
  return out;
}

// PATCH /v1/teams/:id  {name}
export async function patch(req, env, user, id) {
  const a = await teamAccess(env, user, id);
  mustManage(a);
  const body = await readJson(req);
  const name = cleanName(body && body.name);
  await env.DB.batch([
    env.DB.prepare('UPDATE workspaces SET name = ? WHERE id = ?').bind(name, id),
    audit(env, id, user, 'team.rename', name),
  ]);
  return get(env, user, id);
}

// DELETE /v1/teams/:id — the owner only: its subscription is cancelled first
// (nothing goes if Stripe cannot be reached), then the team with its benches,
// history, folders, parts and members.
export async function remove(env, user, id) {
  const a = await teamAccess(env, user, id);
  mustOwn(a);
  const s = await env.DB.prepare('SELECT stripe_customer, stripe_subscription, status FROM subscriptions WHERE workspace_id = ?').bind(id).first();
  if (s && s.stripe_subscription && s.stripe_customer !== 'manual' && LIVE.includes(s.status)) {
    await stripe(env, 'DELETE', `/subscriptions/${s.stripe_subscription}`);
  }
  const { results: vs } = await env.DB.prepare('SELECT v.r2_key FROM bench_versions v JOIN benches b ON b.id = v.bench_id WHERE b.workspace_id = ?').bind(id).all();
  for (let i = 0; i < vs.length; i += 1000) await env.BENCHES.delete(vs.slice(i, i + 1000).map((v) => v.r2_key));
  const { results: ts } = await env.DB.prepare('SELECT thumb_key FROM benches WHERE workspace_id = ? AND thumb_key IS NOT NULL').bind(id).all();
  for (let i = 0; i < ts.length; i += 1000) await env.BENCHES.delete(ts.slice(i, i + 1000).map((x) => x.thumb_key));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM benches WHERE workspace_id = ?').bind(id),
    env.DB.prepare('DELETE FROM folders WHERE workspace_id = ?').bind(id),
    env.DB.prepare('DELETE FROM workspaces WHERE id = ?').bind(id),
  ]);
  return { ok: true };
}

// ---------- invitations ----------

function inviteEmail(env, { team, inviter, link, role }) {
  const what = role === 'viewer' ? 'to view its benches' : 'to work on its benches';
  const text = `${inviter} has invited you to join the team “${team}” in JEKray, ${what}.\n\nOpen this link, sign in with Google or Microsoft, and you are in:\n${link}\n\nThe link works for 14 days. If you were not expecting this, ignore it: nothing happens unless you open the link.\n\nJEK Systems`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<p>${esc(inviter)} has invited you to join the team <b>${esc(team)}</b> in JEKray, ${what}.</p>
<p><a href="${esc(link)}">Join ${esc(team)}</a>: sign in with Google or Microsoft, and you are in.</p>
<p>The link works for 14 days. If you were not expecting this, ignore it: nothing happens unless you open the link.</p>
<p>JEK Systems</p>`;
  return { subject: `${inviter} invited you to ${team} in JEKray`, text, html };
}

// POST /v1/teams/:id/invites  {email, role}
export async function invite(req, env, user, id) {
  const a = await teamAccess(env, user, id);
  mustManage(a);
  const body = await readJson(req);
  const email = emailOf(body && body.email), role = roleOf(body && body.role, { admins: a.role === 'owner' });
  const already = await env.DB.prepare('SELECT 1 AS y FROM members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? AND lower(u.email) = ?').bind(id, email).first();
  if (already) throw new ApiError(409, 'member', 'Someone with that address is in the team already.');
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM invitations WHERE workspace_id = ?').bind(id).first();
  if (n.n >= MAX_INVITES) throw new ApiError(409, 'too_many', `A team can have ${MAX_INVITES} open invitations; remove some first.`);
  const members = await env.DB.prepare('SELECT COUNT(*) AS n FROM members WHERE workspace_id = ?').bind(id).first();
  if (members.n >= MAX_MEMBERS) throw new ApiError(409, 'too_many', `A team can have ${MAX_MEMBERS} members.`);
  const w = await env.DB.prepare('SELECT name FROM workspaces WHERE id = ?').bind(id).first();
  const token = newToken(), t = now(), invId = newId();
  const link = `${env.APP_URL}?jekinvite=${token}`;
  // a fresh invitation to the same address replaces the old one and its link
  await env.DB.batch([
    env.DB.prepare('DELETE FROM invitations WHERE workspace_id = ? AND email = ?').bind(id, email),
    env.DB.prepare('INSERT INTO invitations (id, workspace_id, email, role, token_hash, invited_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(invId, id, email, role, await sha256(token), user.id, t, t + INVITE_MS),
    audit(env, id, user, 'invite.send', `${email} as ${role}`),
  ]);
  let sent = false;
  if (mailOn(env)) {
    try { await sendEmail(env, { to: email, ...inviteEmail(env, { team: w.name, inviter: user.name, link, role }) }); sent = true; }
    catch (err) { console.error('invite email', err.message); }
  }
  // without email (or when it failed), the link is handed to the inviter to pass on
  return { ...(await get(env, user, id)), invited: { email, role, sent, link: sent ? undefined : link, expires_at: t + INVITE_MS } };
}

// DELETE /v1/teams/:id/invites/:inv
export async function uninvite(env, user, id, inv) {
  const a = await teamAccess(env, user, id);
  mustManage(a);
  const row = await env.DB.prepare('SELECT email FROM invitations WHERE id = ? AND workspace_id = ?').bind(inv, id).first();
  if (row) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM invitations WHERE id = ?').bind(inv),
      audit(env, id, user, 'invite.withdraw', row.email),
    ]);
  }
  return get(env, user, id);
}

// GET /v1/invitations/:token — what a link is for, before accepting
export async function peek(env, token) {
  const row = await invitationByToken(env, token);
  const w = await env.DB.prepare('SELECT w.name, u.name AS inviter FROM workspaces w JOIN users u ON u.id = ? WHERE w.id = ?').bind(row.invited_by, row.workspace_id).first();
  return { team: w.name, inviter: w.inviter, role: row.role, email: row.email, expires_at: row.expires_at };
}

async function invitationByToken(env, token) {
  if (!/^[0-9a-f]{64}$/.test(String(token || ''))) throw new ApiError(404, 'not_found', 'That invitation link is not valid.');
  const row = await env.DB.prepare('SELECT * FROM invitations WHERE token_hash = ?').bind(await sha256(token)).first();
  if (!row || row.expires_at <= now()) throw new ApiError(404, 'not_found', 'That invitation has expired or was withdrawn. Ask for a new one.');
  return row;
}

// POST /v1/invitations/accept  {token} — the signed-in person joins the team.
export async function accept(req, env, user) {
  const body = await readJson(req);
  const row = await invitationByToken(env, body && body.token);
  const ws = row.workspace_id;
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM members WHERE workspace_id = ?').bind(ws).first();
  const mine = await env.DB.prepare('SELECT role FROM members WHERE workspace_id = ? AND user_id = ?').bind(ws, user.id).first();
  if (!mine && n.n >= MAX_MEMBERS) throw new ApiError(409, 'too_many', 'This team is full.');
  const t = now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM invitations WHERE id = ?').bind(row.id),
    ...(mine
      ? []
      : [env.DB.prepare('INSERT INTO members (workspace_id, user_id, role, seat, created_at) VALUES (?, ?, ?, ?, ?)').bind(ws, user.id, row.role, seatOf(row.role), t)]),
    audit(env, ws, user, mine ? 'invite.used' : 'member.join', `${user.name} as ${row.role}`),
  ]);
  if (!mine) await syncSeats(env, ws);
  const w = await env.DB.prepare('SELECT name FROM workspaces WHERE id = ?').bind(ws).first();
  return { ok: true, team: { id: ws, name: w.name, role: mine ? mine.role : row.role } };
}

// ---------- members ----------

async function memberOf(env, ws, userId) {
  const m = await env.DB.prepare('SELECT m.user_id, m.role, m.seat, u.name FROM members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? AND m.user_id = ?').bind(ws, userId).first();
  if (!m) throw new ApiError(404, 'not_found', 'No such member.');
  return m;
}

// PATCH /v1/teams/:id/members/:u  {role} — an admin sets editor or viewer;
// the owner sets admin too. The owner's role changes only by handing the team on.
export async function setRole(req, env, user, id, userId) {
  const a = await teamAccess(env, user, id);
  mustManage(a);
  const m = await memberOf(env, id, userId);
  if (m.role === 'owner') throw new ApiError(400, 'bad_request', 'To change the owner, hand the team on.');
  if (a.role === 'admin' && m.role === 'admin' && m.user_id !== user.id) throw new ApiError(403, 'forbidden', 'Only the owner changes an admin’s role.');
  const body = await readJson(req);
  const role = roleOf(body && body.role, { admins: a.role === 'owner' });
  if (role !== m.role) {
    await env.DB.batch([
      env.DB.prepare('UPDATE members SET role = ?, seat = ? WHERE workspace_id = ? AND user_id = ?').bind(role, seatOf(role), id, userId),
      audit(env, id, user, 'member.role', `${m.name}: ${m.role} to ${role}`),
    ]);
    if (seatOf(role) !== m.seat) await syncSeats(env, id);
  }
  return get(env, user, id);
}

// DELETE /v1/teams/:id/members/:u — an admin removes editors and viewers; the owner anyone but themselves.
export async function removeMember(env, user, id, userId) {
  const a = await teamAccess(env, user, id);
  mustManage(a);
  const m = await memberOf(env, id, userId);
  if (m.role === 'owner') throw new ApiError(400, 'bad_request', 'The owner cannot be removed: hand the team on, or delete it.');
  if (a.role === 'admin' && m.role === 'admin' && m.user_id !== user.id) throw new ApiError(403, 'forbidden', 'Only the owner removes an admin.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM members WHERE workspace_id = ? AND user_id = ?').bind(id, userId),
    audit(env, id, user, 'member.remove', m.name),
  ]);
  if (m.seat) await syncSeats(env, id);
  return get(env, user, id);
}

// POST /v1/teams/:id/leave — anyone but the owner.
export async function leave(env, user, id) {
  const a = await teamAccess(env, user, id);
  if (a.role === 'owner') throw new ApiError(400, 'bad_request', 'The owner cannot leave: hand the team on, or delete it.');
  const m = await memberOf(env, id, user.id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM members WHERE workspace_id = ? AND user_id = ?').bind(id, user.id),
    audit(env, id, user, 'member.leave', m.name),
  ]);
  if (m.seat) await syncSeats(env, id);
  return { ok: true };
}

// POST /v1/teams/:id/transfer  {user_id} — the owner hands the team, and its
// subscription, to another member, and stays on as an admin.
export async function transfer(req, env, user, id) {
  const a = await teamAccess(env, user, id);
  mustOwn(a);
  const body = await readJson(req);
  const to = await memberOf(env, id, String((body && body.user_id) || ''));
  if (to.user_id === user.id) return get(env, user, id);
  await env.DB.batch([
    env.DB.prepare('UPDATE workspaces SET owner_id = ? WHERE id = ?').bind(to.user_id, id),
    env.DB.prepare("UPDATE members SET role = 'owner', seat = 1 WHERE workspace_id = ? AND user_id = ?").bind(id, to.user_id),
    env.DB.prepare("UPDATE members SET role = 'admin', seat = 1 WHERE workspace_id = ? AND user_id = ?").bind(id, user.id),
    audit(env, id, user, 'team.transfer', to.name),
  ]);
  await syncSeats(env, id);
  return get(env, user, id);
}

