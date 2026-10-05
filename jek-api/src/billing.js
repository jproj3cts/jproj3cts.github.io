// Subscriptions through Stripe. Stripe holds prices, cards, invoices and tax;
// this mirrors each workspace's subscription from Stripe's webhooks, and
// never sets plan state from anything the app sends.
//
// Prices are found by lookup key (pro_monthly, pro_yearly, academic_monthly,
// academic_yearly), so no Stripe ids live in this code. Every webhook event
// about a subscription is answered by fetching the subscription afresh, so
// events arriving out of order cannot leave stale state behind.

import { workspaceAccess } from './benches.js';
import { ApiError, now } from './util.js';

const STRIPE = 'https://api.stripe.com/v1';
export const STRIPE_VERSION = '2026-08-26.dahlia';
const PRICE_KEYS = ['pro_monthly', 'pro_yearly', 'academic_monthly', 'academic_yearly'];
const PLAN_OF = { pro: 'individual', academic: 'academic' };
const SIG_TOLERANCE = 300; // seconds
const EVENT_TTL = 7 * 24 * 3600;

// Stripe's form encoding: nested keys as a[b][c], arrays as a[0][b].
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe(env, method, path, params) {
  if (!env.STRIPE_SECRET_KEY) throw new ApiError(503, 'billing_off', 'Subscriptions are not open yet.');
  const url = `${STRIPE}${path}${method === 'GET' && params ? '?' + form(params) : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': STRIPE_VERSION,
      ...(method === 'GET' ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }),
    },
    body: method === 'GET' || !params ? undefined : form(params),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Stripe', method, path, res.status, body.error && body.error.message);
    throw new ApiError(502, 'stripe', 'The payment service did not answer as expected. Please try again.');
  }
  return body;
}

// ---------- prices ----------

// { pro_monthly: { id, amount, currency, interval }, ... }, cached for an hour.
export async function prices(env) {
  const cached = await env.AUTH.get('stripe:prices', 'json');
  if (cached) return cached;
  const list = await stripe(env, 'GET', '/prices', { active: 'true', lookup_keys: PRICE_KEYS, limit: 10 });
  const out = {};
  for (const p of list.data || []) {
    out[p.lookup_key] = { id: p.id, amount: p.unit_amount, currency: p.currency, interval: p.recurring && p.recurring.interval };
  }
  await env.AUTH.put('stripe:prices', JSON.stringify(out), { expirationTtl: 3600 });
  return out;
}

// What the app shows: amounts in pence, never the ids.
export async function priceList(env) {
  const p = await prices(env);
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { amount: v.amount, currency: v.currency, interval: v.interval }]));
}

// ---------- checkout and portal ----------

async function sub(env, ws) {
  return env.DB.prepare('SELECT * FROM subscriptions WHERE workspace_id = ?').bind(ws).first();
}

function returnUrl(env, value, outcome) {
  const base = env.APP_URL;
  let u;
  try {
    u = new URL(value || base);
    const allowed = (env.APP_ORIGINS || '').split(',').map((s) => s.trim());
    if (!allowed.includes(u.origin)) u = new URL(base);
  } catch {
    u = new URL(base);
  }
  u.hash = '';
  if (outcome) u.searchParams.set('jekbilling', outcome);
  return u.toString();
}

// POST /v1/workspaces/:w/billing/checkout  {plan: 'pro'|'academic', interval: 'month'|'year', return?}
export async function checkout(req, env, user, wsId) {
  const a = await workspaceAccess(env, user, wsId);
  if (!['owner', 'admin'].includes(a.role)) throw new ApiError(403, 'forbidden', 'Only the workspace owner can subscribe.');
  if (a.kind !== 'personal') throw new ApiError(400, 'bad_request', 'Team subscriptions are not open yet.');
  const body = await req.json().catch(() => ({}));
  const tier = body.plan === 'academic' ? 'academic' : body.plan === 'pro' ? 'pro' : null;
  const interval = body.interval === 'year' ? 'year' : body.interval === 'month' ? 'month' : null;
  if (!tier || !interval) throw new ApiError(400, 'bad_request', 'Choose a plan and monthly or yearly.');
  if (tier === 'academic') {
    const u = await env.DB.prepare('SELECT academic_until FROM users WHERE id = ?').bind(user.id).first();
    if (!(u && u.academic_until > now())) throw new ApiError(403, 'not_academic', 'Check that you qualify for the academic price first.');
  }
  const current = await sub(env, a.ws);
  // A real subscription that still counts is changed in Billing, not bought twice.
  if (current && current.stripe_customer !== 'manual' && ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(current.status)) {
    throw new ApiError(409, 'subscribed', 'This workspace already has a subscription. Use Billing to change it.');
  }
  const price = (await prices(env))[`${tier}_${interval === 'year' ? 'yearly' : 'monthly'}`];
  if (!price) throw new ApiError(503, 'billing_off', 'That price is not available yet.');
  const u = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(user.id).first();
  const customer = current && current.stripe_customer !== 'manual' ? current.stripe_customer : null;
  const session = await stripe(env, 'POST', '/checkout/sessions', {
    mode: 'subscription',
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: a.ws,
    metadata: { workspace_id: a.ws, user_id: user.id },
    subscription_data: { metadata: { workspace_id: a.ws, user_id: user.id } },
    customer: customer || undefined,
    customer_email: customer ? undefined : u && u.email ? u.email : undefined,
    allow_promotion_codes: 'true',
    consent_collection: { terms_of_service: 'required' },
    success_url: returnUrl(env, body.return, 'success'),
    cancel_url: returnUrl(env, body.return, 'cancelled'),
  });
  return { url: session.url };
}

// POST /v1/workspaces/:w/billing/portal  {return?}
export async function portal(req, env, user, wsId) {
  const a = await workspaceAccess(env, user, wsId);
  if (!['owner', 'admin'].includes(a.role)) throw new ApiError(403, 'forbidden', 'Only the workspace owner can manage billing.');
  const current = await sub(env, a.ws);
  if (!current || current.stripe_customer === 'manual') throw new ApiError(404, 'no_billing', 'There is no billing account for this workspace yet.');
  const body = await req.json().catch(() => ({}));
  const session = await stripe(env, 'POST', '/billing_portal/sessions', {
    customer: current.stripe_customer,
    return_url: returnUrl(env, body.return, null),
  });
  return { url: session.url };
}

// POST /v1/workspaces/:w/billing/interval  {interval: 'month'|'year'} — the
// same tier, billed the other way, with proration.
export async function switchInterval(req, env, user, wsId) {
  const a = await workspaceAccess(env, user, wsId);
  if (!['owner', 'admin'].includes(a.role)) throw new ApiError(403, 'forbidden', 'Only the workspace owner can manage billing.');
  const body = await req.json().catch(() => ({}));
  const interval = body.interval === 'year' ? 'year' : body.interval === 'month' ? 'month' : null;
  if (!interval) throw new ApiError(400, 'bad_request', 'Choose monthly or yearly.');
  const current = await sub(env, a.ws);
  if (!current || !current.stripe_subscription || current.stripe_customer === 'manual') {
    throw new ApiError(404, 'no_billing', 'There is no subscription to change.');
  }
  const s = await stripe(env, 'GET', `/subscriptions/${current.stripe_subscription}`);
  const item = s.items && s.items.data && s.items.data[0];
  const tier = item && item.price && item.price.lookup_key && item.price.lookup_key.startsWith('academic') ? 'academic' : 'pro';
  const price = (await prices(env))[`${tier}_${interval === 'year' ? 'yearly' : 'monthly'}`];
  if (!price) throw new ApiError(503, 'billing_off', 'That price is not available yet.');
  if (item.price.id === price.id) return { ok: true, unchanged: true };
  const updated = await stripe(env, 'POST', `/subscriptions/${s.id}`, {
    items: [{ id: item.id, price: price.id }],
    proration_behavior: 'create_prorations',
  });
  await mirror(env, updated);
  return { ok: true };
}

// ---------- the webhook ----------

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Constant-time comparison of two hex strings.
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function verifySignature(secret, header, payload, t = now()) {
  if (!secret || !header) return false;
  let ts = null;
  const sigs = [];
  for (const kv of header.split(',')) {
    const [k, v] = kv.split('=');
    if (k === 't') ts = Number(v);
    if (k === 'v1' && v) sigs.push(v);
  }
  if (!ts || !sigs.length || Math.abs(t / 1000 - ts) > SIG_TOLERANCE) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${payload}`)));
  return sigs.some((s) => same(s, mac));
}

const ms = (s) => (s ? s * 1000 : null);

// The subscription as Stripe has it now, written to its workspace.
export async function mirror(env, s) {
  const ws = s.metadata && s.metadata.workspace_id;
  if (!ws) return false;
  const exists = await env.DB.prepare('SELECT id FROM workspaces WHERE id = ?').bind(ws).first();
  if (!exists) return false;
  const item = (s.items && s.items.data && s.items.data[0]) || {};
  const key = (item.price && item.price.lookup_key) || '';
  const plan = PLAN_OF[key.split('_')[0]] || 'individual';
  const interval = (item.price && item.price.recurring && item.price.recurring.interval) || null;
  // Since the 2025 API versions the period lives on the item.
  const periodEnd = ms(item.current_period_end || s.current_period_end);
  const cancelAt = s.cancel_at ? ms(s.cancel_at) : s.cancel_at_period_end ? periodEnd : null;
  const prev = await env.DB.prepare('SELECT status, past_due_since, stripe_subscription FROM subscriptions WHERE workspace_id = ?')
    .bind(ws)
    .first();
  // Another, newer subscription for the same workspace wins over a stale one ending.
  if (prev && prev.stripe_subscription && prev.stripe_subscription !== s.id && s.status === 'canceled') return false;
  const pastDueSince = s.status === 'past_due' ? (prev && prev.status === 'past_due' && prev.past_due_since) || now() : null;
  await env.DB.prepare(
    `INSERT INTO subscriptions (workspace_id, stripe_customer, stripe_subscription, plan, seats, status, period_end, interval, cancel_at, past_due_since, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (workspace_id) DO UPDATE SET stripe_customer = excluded.stripe_customer,
       stripe_subscription = excluded.stripe_subscription, plan = excluded.plan, seats = excluded.seats,
       status = excluded.status, period_end = excluded.period_end, interval = excluded.interval,
       cancel_at = excluded.cancel_at, past_due_since = excluded.past_due_since, updated_at = excluded.updated_at`,
  )
    .bind(ws, typeof s.customer === 'string' ? s.customer : s.customer && s.customer.id, s.id, plan, item.quantity || 1,
      s.status, periodEnd, interval, cancelAt, pastDueSince, now())
    .run();
  return true;
}

// The subscription an event is about, if any.
function subscriptionOf(event) {
  const o = event.data && event.data.object;
  if (!o) return null;
  if (o.object === 'subscription') return o.id;
  if (o.object === 'checkout.session') return typeof o.subscription === 'string' ? o.subscription : o.subscription && o.subscription.id;
  if (o.object === 'invoice') {
    const p = o.parent && o.parent.subscription_details && o.parent.subscription_details.subscription;
    const s = p || o.subscription;
    return typeof s === 'string' ? s : s && s.id;
  }
  return null;
}

// POST /stripe/webhook
export async function webhook(req, env) {
  const payload = await req.text();
  const ok = await verifySignature(env.STRIPE_WEBHOOK_SECRET, req.headers.get('Stripe-Signature'), payload);
  if (!ok) throw new ApiError(400, 'bad_signature', 'Signature check failed.');
  const event = JSON.parse(payload);
  const seen = `stripe:event:${event.id}`;
  if (await env.AUTH.get(seen)) return { received: true, duplicate: true };
  const id = subscriptionOf(event);
  if (id) {
    // Fetched afresh: the newest state, whatever order events arrive in.
    const s = await stripe(env, 'GET', `/subscriptions/${id}`);
    await mirror(env, s);
  }
  // Marked only once handled, so a failure is retried by Stripe.
  await env.AUTH.put(seen, '1', { expirationTtl: EVENT_TTL });
  return { received: true };
}
