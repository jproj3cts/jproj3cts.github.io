import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { academicEmail, currentAcademic } from '../src/academic.js';
import { verifySignature } from '../src/billing.js';
import { bench, call, send, signedIn, withPlan } from './helpers.js';

const DAY = 86400000;
const PRICES = {
  pro_monthly: ['price_pm', 999, 'month'], pro_yearly: ['price_py', 9900, 'year'],
  academic_monthly: ['price_am', 499, 'month'], academic_yearly: ['price_ay', 4900, 'year'],
};
const priceObj = (key) => ({ id: PRICES[key][0], lookup_key: key, unit_amount: PRICES[key][1], currency: 'gbp', recurring: { interval: PRICES[key][2] } });

// A stand-in for Stripe (and ORCID): records calls, keeps subscriptions.
let calls, subs, orcid;
function fake() {
  calls = []; subs = {}; orcid = { employments: [], educations: [] };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    const url = new URL(String(input));
    const body = init.body ? new URLSearchParams(String(init.body)) : null;
    calls.push({ method: init.method || 'GET', path: url.pathname, query: url.searchParams, body, headers: init.headers || {} });
    const ok = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });
    if (url.host === 'orcid.org') return ok({ access_token: 'orcid-read' });
    if (url.host === 'pub.orcid.org') {
      const kind = url.pathname.split('/').pop();
      return ok({ 'affiliation-group': orcid[kind].map((s) => ({ summaries: [{ [kind === 'employments' ? 'employment-summary' : 'education-summary']: s }] })) });
    }
    const p = url.pathname.replace('/v1', '');
    if (p === '/prices') { const keys = [...url.searchParams].filter(([k]) => /^lookup_keys\[\d+\]$/.test(k)).map(([, v]) => v); return ok({ data: keys.filter((k) => PRICES[k]).map(priceObj) }); }
    if (p === '/checkout/sessions') return ok({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    if (p === '/billing_portal/sessions') return ok({ id: 'bps_1', url: 'https://billing.stripe.com/p/session/1' });
    const m = p.match(/^\/subscriptions\/(.+)$/);
    if (m && subs[m[1]]) {
      if ((init.method || 'GET') === 'POST') {
        const price = body.get('items[0][price]');
        const key = Object.keys(PRICES).find((k) => PRICES[k][0] === price);
        subs[m[1]].items.data[0].price = priceObj(key);
      }
      return ok(subs[m[1]]);
    }
    return new Response(JSON.stringify({ error: { message: 'no such thing' } }), { status: 404 });
  });
}
beforeEach(fake);
afterEach(() => vi.restoreAllMocks());

const makeSub = (id, ws, { key = 'pro_monthly', status = 'active', end = Date.now() + 30 * DAY, cancelAtEnd = false, meta = true } = {}) =>
  (subs[id] = {
    id, object: 'subscription', customer: 'cus_' + id, status, cancel_at_period_end: cancelAtEnd, cancel_at: null,
    metadata: meta ? { workspace_id: ws } : {},
    items: { data: [{ id: 'si_' + id, quantity: 1, current_period_end: Math.floor(end / 1000), price: priceObj(key) }] },
  });

async function sign(payload, secret = 'whsec_test', t = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${mac}`;
}
let evn = 0;
async function deliver(type, object, { sig, id = 'evt_' + ++evn, origin = null } = {}) {
  const payload = JSON.stringify({ id, type, data: { object } });
  return call('/stripe/webhook', { method: 'POST', origin, body: payload, headers: { 'Stripe-Signature': sig || (await sign(payload)), 'Content-Type': 'application/json' } });
}
const row = (ws) => env.DB.prepare('SELECT * FROM subscriptions WHERE workspace_id = ?').bind(ws).first();
const me = async (token) => (await call('/v1/me', { token })).json();
const checkoutBody = () => calls.find((c) => c.path === '/v1/checkout/sessions').body;

describe('prices', () => {
  it('shows amounts by lookup key, without Stripe ids, and caches them', async () => {
    await env.AUTH.delete('stripe:prices');
    const r = await (await call('/v1/billing/prices')).json();
    expect(r.pro_monthly).toEqual({ amount: 999, currency: 'gbp', interval: 'month' });
    expect(r.academic_yearly).toEqual({ amount: 4900, currency: 'gbp', interval: 'year' });
    expect(JSON.stringify(r)).not.toContain('price_');
    const before = calls.length;
    await call('/v1/billing/prices');
    expect(calls.length).toBe(before);
    expect(calls[0].headers['Stripe-Version']).toBe('2026-08-26.dahlia');
  });
});

describe('checkout', () => {
  it('opens Stripe Checkout for the chosen price, tied to the workspace', async () => {
    const s = await signedIn();
    const r = await send(`/v1/workspaces/${s.workspaceId}/billing/checkout`, 'POST', s.token, { plan: 'pro', interval: 'year', return: 'https://jeksys.net/jek/tools/jekray2d.html?x=1#p=abc' });
    expect(r.status).toBe(200);
    expect((await r.json()).url).toBe('https://checkout.stripe.com/c/pay/cs_1');
    const b = checkoutBody();
    expect(b.get('mode')).toBe('subscription');
    expect(b.get('line_items[0][price]')).toBe('price_py');
    expect(b.get('client_reference_id')).toBe(s.workspaceId);
    expect(b.get('subscription_data[metadata][workspace_id]')).toBe(s.workspaceId);
    expect(b.get('customer_email')).toBe(s.user.email);
    expect(b.get('consent_collection[terms_of_service]')).toBe('required');
    expect(b.get('success_url')).toBe('https://jeksys.net/jek/tools/jekray2d.html?x=1&jekbilling=success');
    expect(b.get('cancel_url')).toBe('https://jeksys.net/jek/tools/jekray2d.html?x=1&jekbilling=cancelled');
  });

  it('only returns to the app', async () => {
    const s = await signedIn();
    await send(`/v1/workspaces/${s.workspaceId}/billing/checkout`, 'POST', s.token, { plan: 'pro', interval: 'month', return: 'https://evil.example/' });
    expect(checkoutBody().get('success_url')).toBe('https://jeksys.net/jek/tools/jekray2d.html?jekbilling=success');
  });

  it('needs a valid plan, the owner, and someone’s own workspace', async () => {
    const s = await signedIn();
    expect((await send(`/v1/workspaces/${s.workspaceId}/billing/checkout`, 'POST', s.token, { plan: 'gold', interval: 'month' })).status).toBe(400);
    const other = await signedIn();
    expect((await send(`/v1/workspaces/${s.workspaceId}/billing/checkout`, 'POST', other.token, { plan: 'pro', interval: 'month' })).status).toBe(404);
    await env.DB.prepare("INSERT INTO members VALUES (?, ?, 'editor', 1, 0)").bind(s.workspaceId, other.user.id).run();
    expect((await send(`/v1/workspaces/${s.workspaceId}/billing/checkout`, 'POST', other.token, { plan: 'pro', interval: 'month' })).status).toBe(403);
  });

  it('refuses a second subscription, but replaces a hand-given plan', async () => {
    const s = await signedIn();
    await withPlan(s.workspaceId);
    expect((await send(`/v1/workspaces/${s.workspaceId}/billing/checkout`, 'POST', s.token, { plan: 'pro', interval: 'month' })).status).toBe(409);
    await env.DB.prepare("UPDATE subscriptions SET stripe_customer = 'manual', stripe_subscription = NULL WHERE workspace_id = ?").bind(s.workspaceId).run();
    expect((await send(`/v1/workspaces/${s.workspaceId}/billing/checkout`, 'POST', s.token, { plan: 'pro', interval: 'month' })).status).toBe(200);
    expect(checkoutBody().get('customer')).toBeNull();
  });

  it('reuses the Stripe customer of a past subscription', async () => {
    const s = await signedIn();
    await withPlan(s.workspaceId, 'canceled', Date.now() - DAY);
    await send(`/v1/workspaces/${s.workspaceId}/billing/checkout`, 'POST', s.token, { plan: 'pro', interval: 'month' });
    expect(checkoutBody().get('customer')).toBe('cus_test');
    expect(checkoutBody().get('customer_email')).toBeNull();
  });

  it('gives the academic price only once verified', async () => {
    const s = await signedIn();
    const url = `/v1/workspaces/${s.workspaceId}/billing/checkout`;
    let r = await send(url, 'POST', s.token, { plan: 'academic', interval: 'month' });
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe('not_academic');
    await env.DB.prepare("UPDATE users SET email = 'ada@cam.ac.uk' WHERE id = ?").bind(s.user.id).run();
    expect((await call('/v1/me/academic', { method: 'POST', token: s.token })).status).toBe(200);
    r = await send(url, 'POST', s.token, { plan: 'academic', interval: 'year' });
    expect(r.status).toBe(200);
    expect(checkoutBody().get('line_items[0][price]')).toBe('price_ay');
  });
});

describe('webhook', () => {
  it('refuses a missing, wrong or old signature', async () => {
    const s = await signedIn();
    const sub = makeSub('sub_a', s.workspaceId);
    for (const sig of ['', 't=1,v1=00', await sign('{"x":1}'), await sign('anything', 'whsec_other')]) {
      expect((await deliver('customer.subscription.updated', sub, { sig: sig || 'none' })).status).toBe(400);
    }
    const payload = JSON.stringify({ id: 'evt_old', type: 'customer.subscription.updated', data: { object: sub } });
    const old = await call('/stripe/webhook', { method: 'POST', origin: null, body: payload, headers: { 'Stripe-Signature': await sign(payload, 'whsec_test', Math.floor(Date.now() / 1000) - 600) } });
    expect(old.status).toBe(400);
    expect(await row(s.workspaceId)).toBeNull();
  });

  it('checks signatures in constant form against every v1', async () => {
    const t = Math.floor(Date.now() / 1000);
    const good = (await sign('p', 's', t)).split('v1=')[1];
    expect(await verifySignature('s', `t=${t},v1=bad,v1=${good}`, 'p')).toBe(true);
    expect(await verifySignature('s', `t=${t},v0=${good}`, 'p')).toBe(false);
  });

  it('mirrors a new subscription from Checkout, fetched afresh from Stripe', async () => {
    const s = await signedIn();
    const end = Date.now() + 365 * DAY;
    makeSub('sub_b', s.workspaceId, { key: 'pro_yearly', end });
    const r = await deliver('checkout.session.completed', { object: 'checkout.session', subscription: 'sub_b', client_reference_id: s.workspaceId });
    expect(r.status).toBe(200);
    expect(await row(s.workspaceId)).toMatchObject({
      stripe_customer: 'cus_sub_b', stripe_subscription: 'sub_b', plan: 'individual', interval: 'year', status: 'active',
      period_end: Math.floor(end / 1000) * 1000, cancel_at: null,
    });
    const w = (await me(s.token)).workspaces[0];
    expect(w.active).toBe(true);
    expect(w.plan).toMatchObject({ plan: 'individual', interval: 'year', billing: true });
    // and saving to the cloud now works
    expect((await send(`/v1/workspaces/${s.workspaceId}/benches`, 'POST', s.token, { name: 'x', content: bench() })).status).toBe(201);
  });

  it('comes from Stripe, not the app: any Origin is fine once signed', async () => {
    const s = await signedIn();
    makeSub('sub_o', s.workspaceId);
    expect((await deliver('customer.subscription.created', subs.sub_o, { origin: 'https://evil.example' })).status).toBe(200);
  });

  it('handles each event once', async () => {
    const s = await signedIn();
    makeSub('sub_c', s.workspaceId);
    await deliver('customer.subscription.created', subs.sub_c, { id: 'evt_same' });
    const n = calls.length;
    expect((await (await deliver('customer.subscription.created', subs.sub_c, { id: 'evt_same' })).json()).duplicate).toBe(true);
    expect(calls.length).toBe(n);
  });

  it('ignores subscriptions with no workspace, or an unknown one', async () => {
    makeSub('sub_d', 'x', { meta: false });
    expect((await deliver('customer.subscription.updated', subs.sub_d)).status).toBe(200);
    makeSub('sub_e', 'no-such-workspace');
    expect((await deliver('customer.subscription.updated', subs.sub_e)).status).toBe(200);
    expect(await env.DB.prepare("SELECT 1 FROM subscriptions WHERE stripe_subscription IN ('sub_d', 'sub_e')").first()).toBeNull();
  });

  it('gives 7 days’ grace from a failed payment, then stops saving', async () => {
    const s = await signedIn();
    makeSub('sub_f', s.workspaceId);
    await deliver('customer.subscription.created', subs.sub_f);
    subs.sub_f.status = 'past_due';
    subs.sub_f.items.data[0].current_period_end = Math.floor((Date.now() + 30 * DAY) / 1000); // Stripe moved the period on
    await deliver('invoice.payment_failed', { object: 'invoice', parent: { subscription_details: { subscription: 'sub_f' } } });
    const r = await row(s.workspaceId);
    expect(r.status).toBe('past_due');
    expect(Date.now() - r.past_due_since).toBeLessThan(60000);
    expect((await me(s.token)).workspaces[0].active).toBe(true);
    // a second failure keeps the original start of the grace
    await env.DB.prepare('UPDATE subscriptions SET past_due_since = ? WHERE workspace_id = ?').bind(Date.now() - 8 * DAY, s.workspaceId).run();
    await deliver('invoice.payment_failed', { object: 'invoice', subscription: 'sub_f' });
    expect((await row(s.workspaceId)).past_due_since).toBeLessThan(Date.now() - 7 * DAY);
    expect((await me(s.token)).workspaces[0].active).toBe(false);
    // paid at last
    subs.sub_f.status = 'active';
    await deliver('invoice.paid', { object: 'invoice', parent: { subscription_details: { subscription: 'sub_f' } } });
    expect(await row(s.workspaceId)).toMatchObject({ status: 'active', past_due_since: null });
  });

  it('shows a cancellation at the period end, then ends', async () => {
    const s = await signedIn();
    const end = Date.now() + 10 * DAY;
    makeSub('sub_g', s.workspaceId, { end, cancelAtEnd: true });
    await deliver('customer.subscription.updated', subs.sub_g);
    const w = (await me(s.token)).workspaces[0];
    expect(w.active).toBe(true);
    expect(w.plan.cancel_at).toBe(Math.floor(end / 1000) * 1000);
    subs.sub_g.status = 'canceled';
    await deliver('customer.subscription.deleted', subs.sub_g);
    expect((await me(s.token)).workspaces[0].active).toBe(false);
  });

  it('does not let an old subscription ending undo a newer one', async () => {
    const s = await signedIn();
    makeSub('sub_new', s.workspaceId);
    await deliver('customer.subscription.created', subs.sub_new);
    makeSub('sub_old', s.workspaceId, { status: 'canceled' });
    await deliver('customer.subscription.deleted', subs.sub_old);
    expect(await row(s.workspaceId)).toMatchObject({ stripe_subscription: 'sub_new', status: 'active' });
  });

  it('records the academic plan from the price', async () => {
    const s = await signedIn();
    makeSub('sub_h', s.workspaceId, { key: 'academic_monthly' });
    await deliver('customer.subscription.created', subs.sub_h);
    expect(await row(s.workspaceId)).toMatchObject({ plan: 'academic', interval: 'month' });
  });
});

describe('billing portal and switching', () => {
  it('opens the portal for a Stripe customer only', async () => {
    const s = await signedIn();
    const url = `/v1/workspaces/${s.workspaceId}/billing/portal`;
    expect((await call(url, { method: 'POST', token: s.token })).status).toBe(404);
    await env.DB.prepare("INSERT INTO subscriptions (workspace_id, stripe_customer, plan, status, updated_at) VALUES (?, 'manual', 'individual', 'active', 0)").bind(s.workspaceId).run();
    expect((await call(url, { method: 'POST', token: s.token })).status).toBe(404);
    makeSub('sub_p', s.workspaceId);
    await deliver('customer.subscription.created', subs.sub_p);
    const r = await call(url, { method: 'POST', token: s.token });
    expect((await r.json()).url).toBe('https://billing.stripe.com/p/session/1');
    expect(calls.find((c) => c.path === '/v1/billing_portal/sessions').body.get('customer')).toBe('cus_sub_p');
  });

  it('switches monthly to yearly in the same tier', async () => {
    const s = await signedIn();
    makeSub('sub_s', s.workspaceId, { key: 'academic_monthly' });
    await deliver('customer.subscription.created', subs.sub_s);
    const r = await send(`/v1/workspaces/${s.workspaceId}/billing/interval`, 'POST', s.token, { interval: 'year' });
    expect(r.status).toBe(200);
    const upd = calls.find((c) => c.method === 'POST' && c.path === '/v1/subscriptions/sub_s');
    expect(upd.body.get('items[0][price]')).toBe('price_ay');
    expect(upd.body.get('items[0][id]')).toBe('si_sub_s');
    expect(upd.body.get('proration_behavior')).toBe('create_prorations');
    expect(await row(s.workspaceId)).toMatchObject({ plan: 'academic', interval: 'year' });
  });
});

describe('academic verification', () => {
  it('recognises academic email domains', () => {
    for (const e of ['a@cam.ac.uk', 'a@physics.ox.ac.uk', 'a@mit.edu', 'a@sydney.edu.au', 'a@u-tokyo.ac.jp', 'a@ethz.ch', 'a@phys.ethz.ch', 'a@uni-heidelberg.de']) {
      expect(academicEmail(e)).toBeTruthy();
    }
    for (const e of ['a@gmail.com', 'a@education.com', 'a@notethz.ch', 'a@ac.uk.evil.com', '', null]) expect(academicEmail(e)).toBeNull();
  });

  it('reads a current university affiliation from ORCID, not an ended one', () => {
    const org = (name, end) => ({ organization: { name }, 'end-date': end || null });
    expect(currentAcademic({ 'affiliation-group': [{ summaries: [{ 'employment-summary': org('University of Bath') }] }] })).toBe('University of Bath');
    expect(currentAcademic({ 'affiliation-group': [{ summaries: [{ 'employment-summary': org('Acme Lasers Ltd') }] }] })).toBeNull();
    expect(currentAcademic({ 'affiliation-group': [{ summaries: [{ 'education-summary': org('Imperial College London', { year: { value: '2019' } }) }] }] })).toBeNull();
  });

  it('verifies by ORCID when the email does not show it', async () => {
    const s = await signedIn();
    await env.DB.prepare("UPDATE users SET email = 'someone@gmail.com' WHERE id = ?").bind(s.user.id).run();
    let r = await call('/v1/me/academic', { method: 'POST', token: s.token });
    expect(r.status).toBe(403);
    await env.DB.prepare("INSERT INTO identities VALUES ('orcid', '0000-0002-0000-0001', ?, 0)").bind(s.user.id).run();
    orcid.educations = [{ organization: { name: 'Heriot-Watt University' }, 'end-date': null }];
    r = await call('/v1/me/academic', { method: 'POST', token: s.token });
    expect(r.status).toBe(200);
    expect((await r.json()).via).toBe('ORCID: Heriot-Watt University');
    const m = await me(s.token);
    expect(m.academic.via).toBe('ORCID: Heriot-Watt University');
    expect(m.academic.until).toBeGreaterThan(Date.now() + 360 * DAY);
    const read = calls.find((c) => c.path.endsWith('/educations'));
    expect(read.headers.Authorization).toBe('Bearer orcid-read');
  });
});
