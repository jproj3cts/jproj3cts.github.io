// Subscriptions through Stripe. Stripe holds prices, cards, invoices and tax;
// this mirrors each workspace's subscription from Stripe's webhooks, and
// never sets plan state from anything the app sends.
//
// Prices are found by lookup key (pro_monthly, pro_yearly, academic_monthly,
// academic_yearly, team_monthly, team_yearly), so no Stripe ids live in this
// code. A team's price is for one seat; its quantity is the seats. Every webhook event
// about a subscription is answered by fetching the subscription afresh, so
// events arriving out of order cannot leave stale state behind.

import { workspaceAccess } from './benches.js';
import { academicEmail } from './academic.js';
import { redirect, withOutcome } from './auth.js';
import { createSession, currentUser } from './sessions.js';
import { createUser } from './users.js';
import { ApiError, now } from './util.js';

const STRIPE = 'https://api.stripe.com/v1';
export const STRIPE_VERSION = '2026-08-26.dahlia';
const PRICE_KEYS = ['pro_monthly', 'pro_yearly', 'academic_monthly', 'academic_yearly', 'team_monthly', 'team_yearly'];
const PLAN_OF = { pro: 'individual', academic: 'academic', team: 'team' };
const TIERS = ['pro', 'academic', 'team'];
// A team pays for at least this many seats (jek/terms.html).
export const MIN_SEATS = 3;
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

// With allow404, a missing object is null rather than an error.
export async function stripe(env, method, path, params, { allow404 = false } = {}) {
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
  if (allow404 && res.status === 404) return null;
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

// How many members of a team take a seat (its owner, admins and editors).
export async function paidMembers(env, ws) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM members WHERE workspace_id = ? AND seat = 1').bind(ws).first();
  return r.n;
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

// POST /v1/workspaces/:w/billing/checkout  {plan: 'pro'|'academic'|'team', interval: 'month'|'year', seats?, return?}
// A team's owner buys 'team' for it: a seat each for its paid members (at
// least MIN_SEATS, or the seats asked for if more).
export async function checkout(req, env, user, wsId) {
  const a = await workspaceAccess(env, user, wsId);
  if (a.kind === 'team' ? a.role !== 'owner' : !['owner', 'admin'].includes(a.role)) {
    throw new ApiError(403, 'forbidden', a.kind === 'team' ? 'Only the team’s owner can subscribe for it.' : 'Only the workspace owner can subscribe.');
  }
  if (a.kind !== 'personal' && a.kind !== 'team') throw new ApiError(400, 'bad_request', 'A university licence is arranged with JEK Systems.');
  const body = await req.json().catch(() => ({}));
  const tier = TIERS.includes(body.plan) ? body.plan : null;
  const interval = body.interval === 'year' ? 'year' : body.interval === 'month' ? 'month' : null;
  if (!tier || !interval) throw new ApiError(400, 'bad_request', 'Choose a plan and monthly or yearly.');
  if ((tier === 'team') !== (a.kind === 'team')) {
    throw new ApiError(400, 'bad_request', tier === 'team' ? 'The team plan is for a team: create one first.' : 'A team takes the team plan.');
  }
  let quantity = 1;
  if (tier === 'team') {
    const asked = Math.min(200, Math.max(0, parseInt(body.seats, 10) || 0));
    quantity = Math.max(MIN_SEATS, await paidMembers(env, a.ws), asked);
  }
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
    line_items: [{ price: price.id, quantity }],
    client_reference_id: a.ws,
    metadata: { workspace_id: a.ws, user_id: user.id },
    subscription_data: { metadata: { workspace_id: a.ws, user_id: user.id } },
    customer: customer || undefined,
    customer_email: customer ? undefined : body.email || (u && u.email) || undefined,
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
  const key = (item && item.price && item.price.lookup_key) || '';
  // (a price whose key has moved to a newer one: the tier is the plan the subscription is recorded with)
  const tierOfPlan = Object.keys(PLAN_OF).find((t) => PLAN_OF[t] === current.plan);
  const tier = TIERS.includes(key.split('_')[0]) ? key.split('_')[0] : tierOfPlan || 'pro';
  const price = (await prices(env))[`${tier}_${interval === 'year' ? 'yearly' : 'monthly'}`];
  if (!price) throw new ApiError(503, 'billing_off', 'That price is not available yet.');
  if (item.price.id === price.id) return { ok: true, unchanged: true };
  const updated = await stripe(env, 'POST', `/subscriptions/${s.id}`, {
    items: [{ id: item.id, price: price.id, quantity: item.quantity || 1 }],
    proration_behavior: 'create_prorations',
  });
  await mirror(env, updated);
  return { ok: true };
}

// POST /v1/workspaces/:w/billing/cancel  {resume?: true} — the subscription
// ends at the end of its period (or, with resume, carries on after all): for
// someone whose own JEKrayPro is now covered by a seat in a team.
export async function cancelAtPeriodEnd(req, env, user, wsId) {
  const a = await workspaceAccess(env, user, wsId);
  if (!['owner', 'admin'].includes(a.role)) throw new ApiError(403, 'forbidden', 'Only the workspace owner can manage billing.');
  const body = await req.json().catch(() => ({}));
  const current = await sub(env, a.ws);
  if (!current || !current.stripe_subscription || current.stripe_customer === 'manual' || !['active', 'trialing', 'past_due'].includes(current.status)) {
    throw new ApiError(404, 'no_billing', 'There is no subscription to change.');
  }
  const updated = await stripe(env, 'POST', `/subscriptions/${current.stripe_subscription}`, { cancel_at_period_end: body.resume ? 'false' : 'true' });
  await mirror(env, updated);
  const item = (updated.items && updated.items.data && updated.items.data[0]) || {};
  return { ok: true, cancel_at: updated.cancel_at ? ms(updated.cancel_at) : updated.cancel_at_period_end ? ms(item.current_period_end || updated.current_period_end) : null };
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

function ms(s) { return s ? s * 1000 : null; }

// The subscription as Stripe has it now, written to its workspace.
export async function mirror(env, s) {
  const ws = s.metadata && s.metadata.workspace_id;
  if (!ws) return false;
  const exists = await env.DB.prepare('SELECT id FROM workspaces WHERE id = ?').bind(ws).first();
  if (!exists) return false;
  const item = (s.items && s.items.data && s.items.data[0]) || {};
  const key = (item.price && item.price.lookup_key) || '';
  const interval = (item.price && item.price.recurring && item.price.recurring.interval) || null;
  // Since the 2025 API versions the period lives on the item.
  const periodEnd = ms(item.current_period_end || s.current_period_end);
  const cancelAt = s.cancel_at ? ms(s.cancel_at) : s.cancel_at_period_end ? periodEnd : null;
  const prev = await env.DB.prepare('SELECT status, past_due_since, stripe_subscription, plan FROM subscriptions WHERE workspace_id = ?')
    .bind(ws)
    .first();
  // a university licence is priced for each institution, so it has no lookup key. A plan's price is known by its key
  // (pro_…, academic_…, team_…); a price whose key has been moved to a newer price (new prices are made that way:
  // README, Changing prices) says nothing, so the subscription keeps the plan it was recorded with.
  const plan = s.metadata.plan === 'institution' ? 'institution'
    : PLAN_OF[key.split('_')[0]] || (prev && prev.stripe_subscription === s.id && prev.plan !== 'institution' && prev.plan) || 'individual';
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
    // a university's tier (its most people in 12 months; 0 for no limit) travels in the metadata
    .bind(ws, typeof s.customer === 'string' ? s.customer : s.customer && s.customer.id, s.id, plan,
      plan === 'institution' ? Math.max(0, parseInt(s.metadata.max_users, 10) || 0) : item.quantity || 1,
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
  const o = event.data && event.data.object;
  if (event.type === 'checkout.session.completed' && o && o.metadata && o.metadata.guest === '1') await attachGuest(env, o);
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

// ---------- buying straight away: signed in or not ----------
// The plans page's Continue goes here. Signed in, it is the account's own checkout. Signed out, Stripe takes the
// address with the card, and on the way back (or on Stripe's webhook, whichever comes first) the account for that
// address is found or made, the subscription put on it, and the person signed in. The academic price is for a
// university address, given here and paid with (the receipt goes to it); no code is sent to prove it.

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const QUICK_TIERS = ['pro', 'academic'];
const EMAIL_OK = /^[^\s@<>()",;:]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$/;

async function personalWorkspace(env, userId) {
  const w = await env.DB.prepare("SELECT id FROM workspaces WHERE owner_id = ? AND kind = 'personal' ORDER BY created_at LIMIT 1").bind(userId).first();
  return w && w.id;
}

// the academic price, by the university address given at checkout: a year, as a confirmed one gives
async function markAcademic(env, userId, email) {
  const domain = academicEmail(email);
  if (!domain) return;
  await env.DB.prepare('UPDATE users SET academic_until = ?, academic_via = ? WHERE id = ?').bind(now() + YEAR_MS, `checkout: ${domain}`, userId).run();
}

// POST /v1/billing/checkout  {plan: 'pro'|'academic', interval: 'month'|'year', email?, return?}
export async function quickCheckout(req, env, ctx) {
  const body = await req.json().catch(() => ({}));
  const tier = QUICK_TIERS.includes(body.plan) ? body.plan : null;
  const interval = body.interval === 'year' ? 'year' : body.interval === 'month' ? 'month' : null;
  if (!tier || !interval) throw new ApiError(400, 'bad_request', 'Choose a plan and monthly or yearly.');
  const email = String(body.email || '').trim().toLowerCase();
  if (email && (email.length > 254 || !EMAIL_OK.test(email))) throw new ApiError(400, 'bad_email', 'That does not look like an email address.');
  const user = await currentUser(req, env, ctx);
  if (tier === 'academic') {
    // a university address given, or (signed in) the one they sign in with, or the academic price already confirmed
    const had = user && await env.DB.prepare('SELECT academic_until FROM users WHERE id = ?').bind(user.id).first();
    const ok = academicEmail(email) || (user && !email && (academicEmail(user.email) || (had && had.academic_until > now())));
    if (!ok) {
      throw new ApiError(400, 'not_academic_domain', email
        ? 'That address is not at a university we recognise. If it should be, email support@jeksys.net from it and we will add your university.'
        : 'Give your university email address for the academic price.');
    }
  }
  if (user) {
    // signed in: their own workspace's checkout, the university address (if any) taken as their academic one
    if (tier === 'academic') await markAcademic(env, user.id, email || user.email);
    const ws = await personalWorkspace(env, user.id);
    const inner = new Request(req.url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: tier, interval, return: body.return, email: email || undefined }) });
    return checkout(inner, env, user, ws);
  }
  const price = (await prices(env))[`${tier}_${interval === 'year' ? 'yearly' : 'monthly'}`];
  if (!price) throw new ApiError(503, 'billing_off', 'That price is not available yet.');
  const ret = returnUrl(env, body.return, null);
  const api = env.API_URL || new URL(req.url).origin;
  const session = await stripe(env, 'POST', '/checkout/sessions', {
    mode: 'subscription',
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { guest: '1', plan: tier },
    subscription_data: { metadata: { guest: '1', plan: tier } },
    customer_email: email || undefined,
    allow_promotion_codes: 'true',
    consent_collection: { terms_of_service: 'required' },
    // (Stripe fills in {CHECKOUT_SESSION_ID}: the braces must stay as they are)
    success_url: `${api}/auth/checkout?session_id={CHECKOUT_SESSION_ID}&r=${encodeURIComponent(ret)}`,
    cancel_url: returnUrl(env, body.return, 'cancelled'),
  });
  return { url: session.url };
}

// A guest's paid checkout put on an account: the one its address signs in to, or has as its email, or a new one.
// Returns the user's id, or null while it is not paid. Done once; later calls find the subscription already there.
export async function attachGuest(env, cs) {
  if (!cs || !cs.metadata || cs.metadata.guest !== '1' || cs.status !== 'complete') return null;
  const email = String((cs.customer_details && cs.customer_details.email) || cs.customer_email || '').trim().toLowerCase();
  if (!EMAIL_OK.test(email)) return null;
  const subId = typeof cs.subscription === 'string' ? cs.subscription : cs.subscription && cs.subscription.id;
  let s = subId ? await stripe(env, 'GET', `/subscriptions/${subId}`) : null;
  let userId = null;
  if (s && s.metadata && s.metadata.user_id) {
    const u = await env.DB.prepare('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL').bind(s.metadata.user_id).first();
    if (u) userId = u.id;
  }
  if (!userId) {
    const byIdentity = await env.DB.prepare(
      "SELECT u.id FROM identities i JOIN users u ON u.id = i.user_id WHERE i.provider = 'email' AND i.subject = ? AND u.deleted_at IS NULL",
    ).bind(email).first();
    const byEmail = byIdentity || await env.DB.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL ORDER BY created_at LIMIT 1').bind(email).first();
    if (byEmail) userId = byEmail.id;
    else {
      const name = email.split('@')[0].split(/[._\-+]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ').slice(0, 100) || 'JEKray user';
      try { userId = (await createUser(env, { name, email, identity: { provider: 'email', subject: email } })).user.id; }
      catch (err) {
        const again = await env.DB.prepare("SELECT user_id FROM identities WHERE provider = 'email' AND subject = ?").bind(email).first();
        if (!again) throw err;
        userId = again.user_id;
      }
    }
  }
  if (cs.metadata.plan === 'academic') await markAcademic(env, userId, email);
  if (s && !(s.metadata && s.metadata.workspace_id)) {
    const ws = await personalWorkspace(env, userId);
    s = await stripe(env, 'POST', `/subscriptions/${s.id}`, { metadata: { workspace_id: ws, user_id: userId, guest: '1', plan: cs.metadata.plan } });
  }
  if (s) await mirror(env, s);
  return userId;
}

// GET /auth/checkout?session_id=<cs_…>&r=<return> — back from a guest's checkout: signed in to the account it paid
// for (once; the link opened again only goes back to the page)
export async function checkoutReturn(req, env) {
  const url = new URL(req.url);
  const ret = returnUrl(env, url.searchParams.get('r'), null);
  const back = (outcome, cookies = []) => redirect(withOutcome(returnUrl(env, ret, outcome), outcome === 'success' ? 'signed_in' : 'failed'), cookies);
  const id = String(url.searchParams.get('session_id') || '');
  if (!/^cs_[A-Za-z0-9_]{1,250}$/.test(id)) return back('failed');
  const cs = await stripe(env, 'GET', `/checkout/sessions/${id}`, null, { allow404: true });
  const userId = await attachGuest(env, cs);
  if (!userId) return back('failed');
  const used = `checkout:signin:${id}`;
  if (await env.AUTH.get(used)) return redirect(returnUrl(env, ret, 'success'));
  await env.AUTH.put(used, '1', { expirationTtl: 30 * 24 * 3600 });
  const session = await createSession(env, userId, req.headers.get('User-Agent'));
  return back('success', [session.cookie]);
}
