import { env, exports } from 'cloudflare:workers';
import { createSession } from '../src/sessions.js';
import { createUser } from '../src/users.js';

export const APP = 'https://jeksys.net';
export const API = 'https://api.jeksys.net';

export function call(path, { method = 'GET', origin = APP, token, headers = {}, body } = {}) {
  // each call from its own address, so the per-address limits only bite where a test means them to
  const h = { 'CF-Connecting-IP': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...headers };
  if (origin) h.Origin = origin;
  if (token) h.Cookie = `jek_session=${token}`;
  return exports.default.fetch(new Request(API + path, { method, headers: h, body, redirect: 'manual' }));
}

let n = 0;
export async function signedIn(name = `Tester ${++n}`) {
  const { user, workspaceId } = await createUser(env, { name, email: `t${n}@example.com` });
  const { token } = await createSession(env, user.id, 'vitest');
  return { user, workspaceId, token };
}

// An active subscription on a workspace, as Stripe's webhook would leave it.
export async function withPlan(workspaceId, status = 'active', periodEnd = Date.now() + 30 * 86400000) {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO subscriptions (workspace_id, stripe_customer, stripe_subscription, plan, seats, status, period_end, updated_at) VALUES (?, 'cus_test', ?, 'individual', 1, ?, ?, 0)",
  ).bind(workspaceId, 'sub_' + workspaceId, status, periodEnd).run();
}

export const bench = (name = 'A bench', extra = {}) =>
  JSON.stringify({ format: 'jek-raytracer', version: 1, name, elements: [], ...extra });

export const send = (path, method, token, body, headers = {}) =>
  call(path, { method, token, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } });
