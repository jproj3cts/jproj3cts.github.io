// Rate limits, with Cloudflare's rate limiting bindings (counted per
// Cloudflare location, so they hold back floods rather than count exactly).
//
//   RL_AUTH   sign-in, per network address      60 a minute
//   RL_OPS    JEK Systems' /ops, per address     30 a minute
//   RL_SLOW   slow or costly actions, per person 10 a minute
//   RL_WRITE  other changes, per person         120 a minute
//
// A person is their session (its hash), or their address when signed out. A
// university's people may share one address, hence the generous sign-in
// limit. Without the bindings (a test or local run that leaves them out),
// nothing is limited.

import { COOKIE } from './sessions.js';
import { cookie, sha256 } from './util.js';

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// The actions that call ORCID or Stripe, build a zip, or delete an account.
const SLOW = [
  ['POST', /^\/v1\/me\/(academic|institution)$/],
  ['GET', /^\/v1\/me\/export$/],
  ['POST', /^\/v1\/workspaces\/[^/]+\/billing\//],
  ['DELETE', /^\/v1\/me$/],
  ['POST', /^\/v1\/institutions\/[^/]+\/(invites|remove|restore)$/],
];

// The binding and key for this request, or null for none.
async function bucket(req, env, path) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (path.startsWith('/auth/')) return [env.RL_AUTH, `ip:${ip}`];
  if (path.startsWith('/ops/')) return [env.RL_OPS, `ip:${ip}`];
  if (path.startsWith('/stripe/')) return null; // Stripe's own retries; the signature is the guard
  const token = cookie(req, COOKIE);
  const who = token && /^[0-9a-f]{64}$/.test(token) ? `s:${(await sha256(token)).slice(0, 32)}` : `ip:${ip}`;
  if (SLOW.some(([m, re]) => m === req.method && re.test(path))) return [env.RL_SLOW, who];
  if (WRITES.has(req.method)) return [env.RL_WRITE, who];
  return null;
}

// True when this request is over its limit.
export async function overLimit(req, env, path) {
  const b = await bucket(req, env, path);
  if (!b || !b[0]) return false;
  const { success } = await b[0].limit({ key: b[1] });
  return !success;
}

// A request body of at most `max` bytes, whatever Content-Length says (or
// whether it says anything); null when it is longer.
export async function readCapped(req, max) {
  if (Number(req.headers.get('Content-Length') || 0) > max) return null;
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}
