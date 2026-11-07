import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { call, send, signedIn } from './helpers.js';

// Buying straight away (POST /v1/billing/checkout), signed out or in, and the way back from a guest's checkout
// (GET /auth/checkout), which signs in to the account the address paid for; and the sign-in link in the email.

const PRICES = { pro_monthly: ['price_pm', 999, 'month'], pro_yearly: ['price_py', 9900, 'year'], academic_monthly: ['price_am', 499, 'month'], academic_yearly: ['price_ay', 4900, 'year'] };
const priceObj = (key) => ({ id: PRICES[key][0], lookup_key: key, unit_amount: PRICES[key][1], currency: 'gbp', recurring: { interval: PRICES[key][2] } });
let calls, sessions, subs, mails;
function fake() {
  calls = []; sessions = {}; subs = {}; mails = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method || 'GET';
    const body = init.body instanceof URLSearchParams ? init.body : init.body && typeof init.body === 'string' && !init.body.startsWith('{') ? new URLSearchParams(init.body) : null;
    const ok = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });
    if (url.host === 'api.resend.com') { mails.push(JSON.parse(init.body)); return ok({ id: 'm' }); }
    calls.push({ method, path: url.pathname, body });
    const p = url.pathname.replace('/v1', '');
    if (p === '/prices') return ok({ data: Object.keys(PRICES).map(priceObj) });
    if (p === '/checkout/sessions' && method === 'POST') return ok({ id: 'cs_new', url: 'https://checkout.stripe.com/c/pay/cs_new' });
    let m = p.match(/^\/checkout\/sessions\/(cs_\w+)$/);
    if (m) return sessions[m[1]] ? ok(sessions[m[1]]) : new Response('{"error":{}}', { status: 404 });
    m = p.match(/^\/subscriptions\/(sub_\w+)$/);
    if (m && subs[m[1]]) {
      if (method === 'POST') for (const [k, v] of body) { const mk = k.match(/^metadata\[(\w+)\]$/); if (mk) subs[m[1]].metadata[mk[1]] = v; }
      return ok(subs[m[1]]);
    }
    return new Response('{"error":{"message":"no"}}', { status: 404 });
  });
}
beforeEach(fake);
afterEach(() => vi.restoreAllMocks());

const lastCheckout = () => calls.filter((c) => c.path === '/v1/checkout/sessions' && c.method === 'POST').pop().body;
// a guest's checkout, paid: its session and its subscription as Stripe has them
function paid(id, email, plan = 'pro') {
  subs['sub_' + id] = { id: 'sub_' + id, object: 'subscription', customer: 'cus_' + id, status: 'active', cancel_at_period_end: false, cancel_at: null,
    metadata: { guest: '1', plan }, items: { data: [{ id: 'si_' + id, quantity: 1, current_period_end: Math.floor((Date.now() + 30 * 86400000) / 1000), price: priceObj(plan + '_monthly') }] } };
  sessions['cs_' + id] = { id: 'cs_' + id, object: 'checkout.session', status: 'complete', metadata: { guest: '1', plan }, customer_details: { email }, subscription: 'sub_' + id };
}
const back = (id) => call(`/auth/checkout?session_id=cs_${id}&r=${encodeURIComponent('https://jeksys.net/jek/tools/jekray.html?x=1')}`);
const cookieOf = (res) => ((res.headers.get('Set-Cookie') || '').match(/jek_session=([0-9a-f]{64})/) || [])[1];

describe('buying JEKrayPro straight away', () => {
  it('signed out: off to Stripe at once, Stripe taking the address, coming back through the API', async () => {
    const r = await send('/v1/billing/checkout', 'POST', null, { plan: 'pro', interval: 'year', return: 'https://jeksys.net/jek/tools/jekray.html' });
    expect(r.status).toBe(200);
    expect((await r.json()).url).toBe('https://checkout.stripe.com/c/pay/cs_new');
    const b = lastCheckout();
    expect(b.get('line_items[0][price]')).toBe('price_py');
    expect(b.get('metadata[guest]')).toBe('1');
    expect(b.get('customer_email')).toBe(null);
    expect(b.get('success_url')).toBe('https://api.jeksys.net/auth/checkout?session_id={CHECKOUT_SESSION_ID}&r=' + encodeURIComponent('https://jeksys.net/jek/tools/jekray.html'));
  });

  it('the academic price needs a university address, which Stripe then uses', async () => {
    expect((await send('/v1/billing/checkout', 'POST', null, { plan: 'academic', interval: 'month' })).status).toBe(400);
    const bad = await send('/v1/billing/checkout', 'POST', null, { plan: 'academic', interval: 'month', email: 'me@gmail.com' });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe('not_academic_domain');
    const r = await send('/v1/billing/checkout', 'POST', null, { plan: 'academic', interval: 'month', email: 'Joseph.2.Kelly@kcl.ac.uk' });
    expect(r.status).toBe(200);
    expect(lastCheckout().get('customer_email')).toBe('joseph.2.kelly@kcl.ac.uk');
    expect(lastCheckout().get('line_items[0][price]')).toBe('price_am');
  });

  it('back from paying: a new account for the address, the subscription on it, signed in, once', async () => {
    paid('a1', 'New.Buyer@Example.com');
    const res = await back('a1');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://jeksys.net/jek/tools/jekray.html?x=1&jekbilling=success&jekauth=signed_in');
    const token = cookieOf(res);
    expect(token).toBeTruthy();
    const me = await (await call('/v1/me', { token })).json();
    expect(me.user.email).toBe('new.buyer@example.com');
    const ws = me.workspaces.find((w) => w.kind === 'personal');
    expect(ws.active).toBe(true);
    expect(subs.sub_a1.metadata.workspace_id).toBe(ws.id);
    // opened again: back to the page, but no second session
    const again = await back('a1');
    expect(cookieOf(again)).toBeFalsy();
  });

  it('puts the subscription on the account that address already signs in to', async () => {
    const s = await signedIn();
    await env.DB.prepare("INSERT INTO identities (provider, subject, user_id, created_at) VALUES ('email', 'had@example.com', ?, 0)").bind(s.user.id).run();
    paid('a2', 'had@example.com');
    const res = await back('a2');
    const me = await (await call('/v1/me', { token: cookieOf(res) })).json();
    expect(me.user.id).toBe(s.user.id);
    expect(subs.sub_a2.metadata.workspace_id).toBe(s.workspaceId);
  });

  it('a guest paying the academic price with a university address gets it for a year', async () => {
    paid('a3', 'student@kcl.ac.uk', 'academic');
    const res = await back('a3');
    const me = await (await call('/v1/me', { token: cookieOf(res) })).json();
    expect(me.academic).toBeTruthy();
  });

  it('an unpaid or unknown checkout signs no one in', async () => {
    paid('a4', 'x@example.com');
    sessions.cs_a4.status = 'open';
    expect((await back('a4')).headers.get('Location')).toContain('jekauth=failed');
    expect(cookieOf(await back('nope'))).toBeFalsy();
  });

  it('signed in: the account’s own checkout, the university address given taken for the academic price', async () => {
    const s = await signedIn();
    const r = await send('/v1/billing/checkout', 'POST', s.token, { plan: 'academic', interval: 'year', email: 'someone@ox.ac.uk' });
    expect(r.status).toBe(200);
    const b = lastCheckout();
    expect(b.get('subscription_data[metadata][workspace_id]')).toBe(s.workspaceId);
    expect(b.get('customer_email')).toBe('someone@ox.ac.uk');
    const u = await env.DB.prepare('SELECT academic_until, academic_via FROM users WHERE id = ?').bind(s.user.id).first();
    expect(u.academic_until).toBeGreaterThan(Date.now());
    expect(u.academic_via).toBe('checkout: ox.ac.uk');
  });
});

describe('the sign-in link in the email', () => {
  const linkOf = (mail) => mail.text.match(/Sign in to JEKray: (\S+)/)[1];
  it('signs in with one click and goes back to the page it was asked from', async () => {
    await send('/auth/email/start', 'POST', null, { email: 'clicker@example.com', return: 'https://jeksys.net/jek/tools/jekray.html?a=1' });
    const link = new URL(linkOf(mails[0]));
    expect(link.origin + link.pathname).toBe('https://api.jeksys.net/auth/email/link');
    const res = await call(link.pathname + link.search);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://jeksys.net/jek/tools/jekray.html?a=1&jekauth=signed_in');
    const me = await (await call('/v1/me', { token: cookieOf(res) })).json();
    expect(me.user.email).toBe('clicker@example.com');
    // used up: a second click says so, and signs no one in
    const again = await call(link.pathname + link.search);
    expect(again.headers.get('Location')).toContain('jekauth=link_expired');
    expect(cookieOf(again)).toBeFalsy();
  });

  it('a session now lasts a year', async () => {
    await send('/auth/email/start', 'POST', null, { email: 'long@example.com' });
    const link = new URL(linkOf(mails[0]));
    const res = await call(link.pathname + link.search);
    expect(res.headers.get('Set-Cookie')).toMatch(/Max-Age=31536000/);
  });
});
