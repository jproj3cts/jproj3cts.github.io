// Share links: a bench as a short link that anyone can open (see migration 0013).
//
// Making one needs a plan (the person's own JEKrayPro, a paid seat in a team,
// or a university's licence): that is what makes sharing JEKrayPro's. Opening
// one needs nothing, not even signing in. The bench is kept as the app wrote
// it, compressed (the same text an old long link carried after #p=), and the
// app reads it as it reads any shared bench: nothing here runs it or trusts
// it. The person who made a link can list and delete theirs, and their links
// go with their account.

import { cleanName, readJson, workspaceAccess } from './benches.js';
import { ApiError, now } from './util.js';

export const MAX_LINK = 1024 * 1024;       // the compressed bench, as text
export const MAX_LINKS = 1000;             // links one person may keep
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ID = /^[A-Z2-7]{10}$/;
const DATA = /^[zj][A-Za-z0-9_-]+$/;

// 10 base-32 capitals (50 random bits): short, read aloud or typed without
// mistaking 0 for O, and all in a QR code's alphanumeric set
export const newLinkId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => B32[b & 31]).join('');
const idOf = (v) => {
  const id = String(v || '').toUpperCase();
  if (!ID.test(id)) throw new ApiError(404, 'not_found', 'No such link.');
  return id;
};
const meta = (r) => ({ id: r.id, name: r.name, size_bytes: r.size_bytes, created_at: r.created_at, opens: r.opens, opened_at: r.opened_at });

// Whether any workspace the person belongs to has an active plan.
export async function hasPlan(env, user) {
  const { results } = await env.DB.prepare('SELECT workspace_id FROM members WHERE user_id = ?').bind(user.id).all();
  for (const m of results) if ((await workspaceAccess(env, user, m.workspace_id)).active) return true;
  return false;
}

// POST /v1/links  {name, data}: a new link to the bench given
export async function create(req, env, user) {
  if (!(await hasPlan(env, user))) throw new ApiError(402, 'no_plan', 'Share links need JEKrayPro.');
  const body = await readJson(req);
  const data = body.data;
  if (typeof data !== 'string' || !DATA.test(data)) throw new ApiError(400, 'bad_link', 'That is not a bench from JEKray.');
  if (data.length > MAX_LINK) throw new ApiError(413, 'too_large', 'A shared bench can be at most 1 MB compressed: save it as a .jekray file instead.');
  const name = cleanName(body.name, 'Untitled bench');
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM share_links WHERE user_id = ?').bind(user.id).first()).n;
  if (n >= MAX_LINKS) throw new ApiError(409, 'too_many', `You can keep ${MAX_LINKS} share links; delete some old ones first.`);
  let id;
  for (let i = 0; i < 5 && !id; i++) {
    const c = newLinkId();
    if (!(await env.DB.prepare('SELECT 1 FROM share_links WHERE id = ?').bind(c).first())) id = c;
  }
  if (!id) throw new ApiError(500, 'internal', 'Something went wrong on our side.');
  const key = `l/${user.id}/${id}`, t = now();
  await env.BENCHES.put(key, data, { httpMetadata: { contentType: 'text/plain' } });
  await env.DB.prepare('INSERT INTO share_links (id, user_id, name, r2_key, size_bytes, created_at, opens) VALUES (?, ?, ?, ?, ?, ?, 0)')
    .bind(id, user.id, name, key, data.length, t)
    .run();
  return meta({ id, name, size_bytes: data.length, created_at: t, opens: 0, opened_at: null });
}

// GET /v1/links/:id: the bench, for anyone with the link
export async function open(env, rawId) {
  const id = idOf(rawId);
  const r = await env.DB.prepare('SELECT * FROM share_links WHERE id = ?').bind(id).first();
  if (!r) throw new ApiError(404, 'not_found', 'No such link: it may have been deleted by the person who shared it.');
  const obj = await env.BENCHES.get(r.r2_key);
  if (!obj) throw new ApiError(404, 'not_found', 'No such link: it may have been deleted by the person who shared it.');
  const data = await obj.text();
  await env.DB.prepare('UPDATE share_links SET opens = opens + 1, opened_at = ? WHERE id = ?').bind(now(), id).run();
  return { id, name: r.name, data, created_at: r.created_at };
}

// GET /v1/me/links: the person's own links, newest first (no plan needed)
export async function list(env, user) {
  const { results } = await env.DB.prepare('SELECT * FROM share_links WHERE user_id = ? ORDER BY created_at DESC').bind(user.id).all();
  return { links: results.map(meta) };
}

// DELETE /v1/links/:id: only its maker; anyone else's looks like none (no plan needed)
export async function remove(env, user, rawId) {
  const id = idOf(rawId);
  const r = await env.DB.prepare('SELECT r2_key FROM share_links WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!r) throw new ApiError(404, 'not_found', 'No such link.');
  await env.BENCHES.delete(r.r2_key);
  await env.DB.prepare('DELETE FROM share_links WHERE id = ?').bind(id).run();
}

// all of a person's links, with their account (src/account.js)
export async function removeAll(env, userId) {
  const { results } = await env.DB.prepare('SELECT r2_key FROM share_links WHERE user_id = ?').bind(userId).all();
  for (let i = 0; i < results.length; i += 1000) await env.BENCHES.delete(results.slice(i, i + 1000).map((r) => r.r2_key));
  await env.DB.prepare('DELETE FROM share_links WHERE user_id = ?').bind(userId).run();
}
