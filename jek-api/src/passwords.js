// Passwords: an account's own, beside its email sign-in. The address is the
// identity ('email' in identities); the password is a second way to prove it,
// kept as a salted PBKDF2-HMAC-SHA-256 hash (WebCrypto's; Workers have no
// bcrypt or Argon2), compared in constant time. A forgotten password is
// replaced by signing in with a code to the address and setting a new one.
//
// Every hash also takes PASSWORD_PEPPER, a secret of the Worker's that is not
// in the database: a stolen copy of the database cannot be cracked without it.
// That lets the round count stay modest (about 5 ms of CPU; a Worker on the
// free plan has 10 ms a request), where 200,000 rounds took 40 ms and were cut
// off. Each row keeps its own round count, so older hashes still verify.
// Wrong passwords are counted per address and per network address: ten in a
// quarter of an hour locks that key for a quarter of an hour.

import { readCapped } from './limits.js';
import { createSession } from './sessions.js';
import { ApiError, hex, now, sha256 } from './util.js';

export const PBKDF2_ITERS = 20000;
const MIN_LEN = 10, MAX_LEN = 200;
const FAILS = 10, FAIL_WINDOW = 15 * 60 * 1000;
const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$/;

async function body(req) {
  const buf = await readCapped(req, 4096);
  if (!buf) throw new ApiError(413, 'too_large', 'That is too much.');
  try { return JSON.parse(new TextDecoder().decode(buf)) || {}; } catch (err) { throw new ApiError(400, 'bad_json', 'The body is not JSON.'); }
}

export function passwordsReady(env) {
  if (!env.PASSWORD_PEPPER || env.PASSWORD_PEPPER.length < 32) throw new ApiError(503, 'passwords_off', 'Passwords are not set up here yet. Sign in with a code sent to your address.');
  return env.PASSWORD_PEPPER;
}
const pepper = passwordsReady;
export async function pbkdf2(env, password, salt, iters) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pepper(env) + '\n' + password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: iters }, key, 256);
  return hex(new Uint8Array(bits));
}
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

// The rules a password keeps to: long enough, not the address, not all one character.
export function checkPassword(pw, email) {
  if (typeof pw !== 'string' || pw.length < MIN_LEN) throw new ApiError(400, 'weak_password', `A password is at least ${MIN_LEN} characters: a phrase of a few words is easy to remember and hard to guess.`);
  if (pw.length > MAX_LEN) throw new ApiError(400, 'weak_password', `A password is at most ${MAX_LEN} characters.`);
  if (email && pw.toLowerCase().includes(String(email).toLowerCase())) throw new ApiError(400, 'weak_password', 'The password must not contain your email address.');
  if (/^(.)\1*$/.test(pw)) throw new ApiError(400, 'weak_password', 'That password is one character repeated.');
}

// The hash stored for a person, replacing any before.
export async function storePassword(env, userId, pw) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await pbkdf2(env, pw, salt, PBKDF2_ITERS);
  await env.DB.prepare(
    `INSERT INTO passwords (user_id, hash, salt, iters, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET hash = excluded.hash, salt = excluded.salt, iters = excluded.iters, updated_at = excluded.updated_at`,
  ).bind(userId, hash, salt, PBKDF2_ITERS, now()).run();
}
export async function verifyPassword(env, userId, pw) {
  const row = await env.DB.prepare('SELECT hash, salt, iters FROM passwords WHERE user_id = ?').bind(userId).first();
  if (!row) return false;
  return same(await pbkdf2(env, pw, row.salt, row.iters), row.hash);
}
export const hasPassword = async (env, userId) => !!(await env.DB.prepare('SELECT 1 AS y FROM passwords WHERE user_id = ?').bind(userId).first());

// the lock on wrong passwords, per key
async function locked(env, key, t) {
  const r = await env.DB.prepare('SELECT n, until FROM password_fails WHERE key = ?').bind(key).first();
  return r && r.n >= FAILS && r.until > t;
}
async function failed(env, key, t) {
  await env.DB.prepare(
    `INSERT INTO password_fails (key, n, until) VALUES (?, 1, ?)
     ON CONFLICT (key) DO UPDATE SET n = CASE WHEN password_fails.until > ? THEN password_fails.n + 1 ELSE 1 END, until = ?`,
  ).bind(key, t + FAIL_WINDOW, t, t + FAIL_WINDOW).run();
}

// POST /auth/password  {email, password} — a session for the address's account
export async function passwordSignIn(req, env, ctx) {
  const b = await body(req);
  const email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new ApiError(400, 'bad_email', 'That does not look like an email address.');
  if (!pw) throw new ApiError(400, 'bad_password', 'Give the password.');
  pepper(env);
  const t = now();
  const ipKey = 'ip:' + (await sha256(req.headers.get('CF-Connecting-IP') || 'unknown')).slice(0, 24), emKey = 'email:' + email;
  if ((await locked(env, emKey, t)) || (await locked(env, ipKey, t))) {
    throw new ApiError(429, 'locked', 'Too many wrong passwords. Wait a quarter of an hour, or sign in with a code sent to your address.');
  }
  const found = await env.DB.prepare(
    `SELECT u.id, u.deleted_at FROM identities i JOIN users u ON u.id = i.user_id WHERE i.provider = 'email' AND i.subject = ?`,
  ).bind(email).first();
  // one answer whether the address or the password is wrong, and the same work either way
  const ok = found && !found.deleted_at && (await verifyPassword(env, found.id, pw));
  if (!ok) {
    if (!found) await pbkdf2(env, pw, 'none', PBKDF2_ITERS);
    await Promise.all([failed(env, emKey, t), failed(env, ipKey, t)]);
    throw new ApiError(401, 'wrong_password', 'That address and password do not match. Forgotten it? Sign in with a code sent to your address instead, then set a new one.');
  }
  await env.DB.prepare('DELETE FROM password_fails WHERE key = ?').bind(emKey).run();
  const session = await createSession(env, found.id, req.headers.get('User-Agent'));
  ctx.setCookie = session.cookie;
  return { signed_in: true, email };
}

// PUT /v1/me/password  {password, current?} — set or change; the current one is asked for when there is
// one, and a change ends every other session (this one stays), in case the old password had leaked
export async function setPassword(req, env, ctx, user) {
  const b = await body(req);
  const pw = String(b.password || '');
  const has = await hasPassword(env, user.id);
  if (has && !(await verifyPassword(env, user.id, String(b.current || '')))) throw new ApiError(401, 'wrong_password', 'The current password is not right.');
  if (!(await env.DB.prepare("SELECT 1 AS y FROM identities WHERE user_id = ? AND provider = 'email'").bind(user.id).first())) {
    throw new ApiError(409, 'no_email_identity', 'Link an email address first (account menu): the password goes with it.');
  }
  checkPassword(pw, user.email);
  await storePassword(env, user.id, pw);
  if (has) await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, ctx.sessionHash || '').run();
  return { set: true };
}
// DELETE /v1/me/password — the address alone signs in afterwards, by a code
export async function removePassword(env, user) {
  await env.DB.prepare('DELETE FROM passwords WHERE user_id = ?').bind(user.id).run();
  return { set: false };
}
