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

// ORCID is off in production (src/orcid.js); tests of what it does when on switch it on.
export function orcidOnFor(beforeEach, afterEach) {
  let was;
  beforeEach(() => { was = env.ORCID_ON; env.ORCID_ON = '1'; });
  afterEach(() => { env.ORCID_ON = was; });
}

// The rate limiters count in fixed minutes of the clock, so a burst that crosses one starts counting again. Runs
// `burst(try)` (0, then 1) and does it once more, on fresh keys, if the minute turned while it ran.
export async function inOneMinute(burst) {
  const minute = () => Math.floor(Date.now() / 60000);
  for (let t = 0; ; t++) {
    const m = minute();
    const out = await burst(t);
    if (minute() === m || t > 0) return out;
  }
}
