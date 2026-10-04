// Sessions: a random token in an HttpOnly cookie on the API host only; D1
// keeps its SHA-256 hash. 30 days, renewed on use (at most once a day).

import { ApiError, cookie, newToken, now, sha256 } from './util.js';

export const COOKIE = 'jek_session';
const DAY = 24 * 60 * 60 * 1000;
export const SESSION_MS = 30 * DAY;

const setCookie = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export async function createSession(env, userId, userAgent) {
  const token = newToken();
  const t = now();
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(await sha256(token), userId, t, t + SESSION_MS, (userAgent || '').slice(0, 200))
    .run();
  return { token, cookie: setCookie(token, SESSION_MS / 1000) };
}

export const clearCookie = () => setCookie('', 0);

// The signed-in user, or null. Sets ctx.setCookie when the session is renewed.
export async function currentUser(req, env, ctx) {
  const token = cookie(req, COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT s.token_hash, s.expires_at, u.id, u.name, u.email, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND u.deleted_at IS NULL`,
  )
    .bind(hash)
    .first();
  const t = now();
  if (!row) return null;
  if (row.expires_at <= t) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
    return null;
  }
  if (row.expires_at - t < SESSION_MS - DAY) {
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?')
      .bind(t + SESSION_MS, hash)
      .run();
    ctx.setCookie = setCookie(token, SESSION_MS / 1000);
  }
  ctx.sessionHash = hash;
  return { id: row.id, name: row.name, email: row.email, created_at: row.created_at };
}

export async function requireUser(req, env, ctx) {
  const user = await currentUser(req, env, ctx);
  if (!user) throw new ApiError(401, 'signed_out', 'Sign in to use the cloud.');
  return user;
}

// Sessions are shown by a short id (the start of the hash), never the token.
export async function listSessions(env, user, ctx) {
  const { results } = await env.DB.prepare(
    'SELECT token_hash, created_at, expires_at, user_agent FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC',
  )
    .bind(user.id, now())
    .all();
  return results.map((s) => ({
    id: s.token_hash.slice(0, 16),
    created_at: s.created_at,
    expires_at: s.expires_at,
    user_agent: s.user_agent,
    current: s.token_hash === ctx.sessionHash,
  }));
}

export async function endSession(env, user, id) {
  if (!/^[0-9a-f]{16}$/.test(id)) throw new ApiError(404, 'not_found', 'No such session.');
  const r = await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND substr(token_hash, 1, 16) = ?')
    .bind(user.id, id)
    .run();
  if (!r.meta.changes) throw new ApiError(404, 'not_found', 'No such session.');
}
