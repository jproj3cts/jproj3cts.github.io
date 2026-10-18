import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIRM } from '../src/account.js';
import { bench, call, send, signedIn, withPlan } from './helpers.js';

const DAY = 86400000;
const PRICES = {
  pro_monthly: ['price_pm', 999, 'month'], pro_yearly: ['price_py', 9900, 'year'],
  academic_monthly: ['price_am', 499, 'month'], academic_yearly: ['price_ay', 4900, 'year'],
  team_monthly: ['price_tm', 999, 'month'], team_yearly: ['price_ty', 9900, 'year'],
};
const priceObj = (key) => ({ id: PRICES[key][0], lookup_key: key, unit_amount: PRICES[key][1], currency: 'gbp', recurring: { interval: PRICES[key][2] } });

// Stripe and Resend stood in for: Stripe keeps subscriptions and applies
// quantity changes; Resend keeps the emails.
let calls, subs, mails, mailOff;
function fake() {
  calls = []; subs = {}; mails = []; mailOff = false;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    const url = new URL(String(input));
    const ok = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });
    if (url.host === 'api.resend.com') {
      if (mailOff) return new Response('down', { status: 500 });
      mails.push(JSON.parse(init.body)); return ok({ id: 'em_1' });
    }
    const body = init.body ? new URLSearchParams(String(init.body)) : null;
    calls.push({ method: init.method || 'GET', path: url.pathname, body });
    const p = url.pathname.replace('/v1', '');
    if (p === '/prices') { const keys = [...url.searchParams].filter(([k]) => /^lookup_keys\[\d+\]$/.test(k)).map(([, v]) => v); return ok({ data: keys.filter((k) => PRICES[k]).map(priceObj) }); }
    if (p === '/checkout/sessions') return ok({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    const m = p.match(/^\/subscriptions\/(.+)$/);
    if (m && subs[m[1]]) {
      const s = subs[m[1]];
      if (init.method === 'POST') {
        const q = body.get('items[0][quantity]'), price = body.get('items[0][price]');
        if (q) s.items.data[0].quantity = Number(q);
        if (body.has('cancel_at_period_end')) s.cancel_at_period_end = body.get('cancel_at_period_end') === 'true';
        if (price) s.items.data[0].price = priceObj(Object.keys(PRICES).find((k) => PRICES[k][0] === price));
      }
      if (init.method === 'DELETE') s.status = 'canceled';
      return ok(s);
    }
    return new Response(JSON.stringify({ error: { message: 'no such thing' } }), { status: 404 });
  });
}
beforeEach(fake);
afterEach(() => vi.restoreAllMocks());

const json = async (r) => ({ status: r.status, body: await r.json() });
const linkOf = () => mails[mails.length - 1].text.match(/jekinvite=([0-9a-f]{64})/)[1];

async function team(name = 'Lab') {
  const owner = await signedIn();
  const r = await json(await send('/v1/teams', 'POST', owner.token, { name }));
  expect(r.status).toBe(201);
  return { owner, id: r.body.id };
}
// invite `who` (a signed-in person) and have them accept
async function join(t, who, role = 'editor', by = t.owner) {
  const r = await json(await send(`/v1/teams/${t.id}/invites`, 'POST', by.token, { email: who.user.email, role }));
  expect(r.status).toBe(201);
  const a = await json(await send('/v1/invitations/accept', 'POST', who.token, { token: linkOf() }));
  expect(a.status).toBe(200);
  return a.body;
}
// a live team subscription in Stripe and mirrored here, with `seats` seats
async function teamPlan(t, seats = 3, key = 'team_monthly') {
  const id = 'sub_' + t.id;
  subs[id] = {
    id, object: 'subscription', customer: 'cus_' + t.id, status: 'active', cancel_at_period_end: false, cancel_at: null,
    metadata: { workspace_id: t.id },
    items: { data: [{ id: 'si_' + t.id, quantity: seats, current_period_end: Math.floor((Date.now() + 30 * DAY) / 1000), price: priceObj(key) }] },
  };
  await env.DB.prepare(
    "INSERT OR REPLACE INTO subscriptions (workspace_id, stripe_customer, stripe_subscription, plan, seats, status, period_end, interval, updated_at) VALUES (?, ?, ?, 'team', ?, 'active', ?, 'month', 0)",
  ).bind(t.id, 'cus_' + t.id, id, seats, Date.now() + 30 * DAY).run();
  return id;
}
const seatsRow = async (ws) => (await env.DB.prepare('SELECT seats FROM subscriptions WHERE workspace_id = ?').bind(ws).first()).seats;
const me = async (s) => (await call('/v1/me', { token: s.token })).json();

describe('a team', () => {
  it('is created by its owner, who takes the first seat', async () => {
    const t = await team('Optics group');
    const r = await json(await call(`/v1/teams/${t.id}`, { token: t.owner.token }));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ name: 'Optics group', role: 'owner', active: false, plan: null, seats: { paid: 1, min: 3, billed: 0 } });
    expect(r.body.members).toHaveLength(1);
    expect(r.body.members[0]).toMatchObject({ user_id: t.owner.user.id, role: 'owner', seat: true, email: t.owner.user.email });
    expect(r.body.activity[0]).toMatchObject({ action: 'team.create', target: 'Optics group', who: t.owner.user.name });
    expect((await me(t.owner)).workspaces.map((w) => w.kind)).toEqual(['personal', 'team']);
  });

  it('needs a name, and is not seen by outsiders', async () => {
    expect((await send('/v1/teams', 'POST', (await signedIn()).token, { name: '' })).status).toBe(400);
    const t = await team();
    const other = await signedIn();
    expect((await call(`/v1/teams/${t.id}`, { token: other.token })).status).toBe(404);
    expect((await send(`/v1/teams/${t.id}`, 'PATCH', other.token, { name: 'Mine' })).status).toBe(404);
    expect((await call(`/v1/teams/${t.id}`, { method: 'DELETE', token: other.token })).status).toBe(404);
    // a personal workspace is not a team
    expect((await call(`/v1/teams/${t.owner.workspaceId}`, { token: t.owner.token })).status).toBe(404);
  });

  it('is renamed by its owner or an admin', async () => {
    const t = await team();
    const r = await json(await send(`/v1/teams/${t.id}`, 'PATCH', t.owner.token, { name: '  New  name ' }));
    expect(r.body.name).toBe('New name');
    const v = await signedIn(); await join(t, v, 'viewer');
    expect((await send(`/v1/teams/${t.id}`, 'PATCH', v.token, { name: 'X' })).status).toBe(403);
  });
});

describe('invitations', () => {
  it('go by email with a link; accepting joins with the role and a seat', async () => {
    const t = await team('Lab');
    const ed = await signedIn();
    const r = await json(await send(`/v1/teams/${t.id}/invites`, 'POST', t.owner.token, { email: ed.user.email.toUpperCase(), role: 'editor' }));
    expect(r.status).toBe(201);
    expect(r.body.invited).toMatchObject({ email: ed.user.email, role: 'editor', sent: true });
    expect(r.body.invited.link).toBeUndefined();
    expect(r.body.invites).toHaveLength(1);
    expect(mails[0].to).toEqual([ed.user.email]);
    expect(mails[0].subject).toContain('Lab');
    const token = linkOf();
    // the link says what it is for, to anyone holding it
    const peek = await json(await call(`/v1/invitations/${token}`));
    expect(peek.body).toMatchObject({ team: 'Lab', inviter: t.owner.user.name, role: 'editor', email: ed.user.email });
    // only its hash is stored
    expect(await env.DB.prepare('SELECT 1 AS y FROM invitations WHERE token_hash = ?').bind(token).first()).toBeNull();
    const a = await json(await send('/v1/invitations/accept', 'POST', ed.token, { token }));
    expect(a.body).toEqual({ ok: true, team: { id: t.id, name: 'Lab', role: 'editor' } });
    const g = await json(await call(`/v1/teams/${t.id}`, { token: ed.token }));
    expect(g.body.role).toBe('editor');
    expect(g.body.seats.paid).toBe(2);
    expect(g.body.invites).toBeUndefined();        // not for editors
    expect(g.body.members.find((m) => m.user_id === t.owner.user.id).email).toBeUndefined();
    // used once
    expect((await send('/v1/invitations/accept', 'POST', (await signedIn()).token, { token })).status).toBe(404);
  });

  it('hand the link to the inviter when no email goes', async () => {
    const t = await team();
    mailOff = true;
    const r = await json(await send(`/v1/teams/${t.id}/invites`, 'POST', t.owner.token, { email: 'new@example.com' }));
    expect(r.status).toBe(201);
    expect(r.body.invited.sent).toBe(false);
    expect(r.body.invited.link).toMatch(/^https:\/\/jeksys\.net\/jek\/tools\/jekray\.html\?jekinvite=[0-9a-f]{64}$/);
    // anyone signed in may use it, whatever their address
    const who = await signedIn();
    const a = await json(await send('/v1/invitations/accept', 'POST', who.token, { token: r.body.invited.link.split('=')[1] }));
    expect(a.status).toBe(200);
    expect(a.body.team.role).toBe('editor');
  });

  it('viewers take no seat; a fresh invitation replaces the old; withdrawn and expired ones fail', async () => {
    const t = await team();
    const v = await signedIn();
    await join(t, v, 'viewer');
    let g = await json(await call(`/v1/teams/${t.id}`, { token: t.owner.token }));
    expect(g.body.seats.paid).toBe(1);
    expect(g.body.members.find((m) => m.user_id === v.user.id).seat).toBe(false);
    await send(`/v1/teams/${t.id}/invites`, 'POST', t.owner.token, { email: 'a@example.com' });
    const first = linkOf();
    const r = await json(await send(`/v1/teams/${t.id}/invites`, 'POST', t.owner.token, { email: 'a@example.com', role: 'viewer' }));
    expect(r.body.invites).toHaveLength(1);
    expect((await call(`/v1/invitations/${first}`)).status).toBe(404);
    const second = linkOf();
    expect((await call(`/v1/invitations/${second}`)).status).toBe(200);
    g = await json(await send(`/v1/teams/${t.id}/invites/${r.body.invites[0].id}`, 'DELETE', t.owner.token, {}));
    expect(g.body.invites).toHaveLength(0);
    expect((await call(`/v1/invitations/${second}`)).status).toBe(404);
    await send(`/v1/teams/${t.id}/invites`, 'POST', t.owner.token, { email: 'b@example.com' });
    await env.DB.prepare('UPDATE invitations SET expires_at = ? WHERE workspace_id = ?').bind(Date.now() - 1, t.id).run();
    expect((await call(`/v1/invitations/${linkOf()}`)).status).toBe(404);
    expect((await send('/v1/invitations/accept', 'POST', v.token, { token: linkOf() })).status).toBe(404);
    expect((await send('/v1/invitations/accept', 'POST', v.token, { token: 'zz' })).status).toBe(404);
  });

  it('are sent by the owner and admins; only the owner makes admins', async () => {
    const t = await team();
    const ad = await signedIn(), ed = await signedIn();
    await join(t, ad, 'admin');
    await join(t, ed, 'editor');
    expect((await send(`/v1/teams/${t.id}/invites`, 'POST', ed.token, { email: 'x@example.com' })).status).toBe(403);
    expect((await send(`/v1/teams/${t.id}/invites`, 'POST', ad.token, { email: 'x@example.com', role: 'admin' })).status).toBe(400);
    expect((await send(`/v1/teams/${t.id}/invites`, 'POST', ad.token, { email: 'x@example.com', role: 'editor' })).status).toBe(201);
    expect((await send(`/v1/teams/${t.id}/invites`, 'POST', t.owner.token, { email: 'not an address' })).status).toBe(400);
    expect((await send(`/v1/teams/${t.id}/invites`, 'POST', t.owner.token, { email: 'x@example.com', role: 'god' })).status).toBe(400);
    // someone already in
    expect((await send(`/v1/teams/${t.id}/invites`, 'POST', t.owner.token, { email: ed.user.email })).status).toBe(409);
  });
});

describe('members', () => {
  it('change role (seat follows), are removed, and leave', async () => {
    const t = await team();
    const ad = await signedIn(), ed = await signedIn(), v = await signedIn();
    await join(t, ad, 'admin'); await join(t, ed); await join(t, v, 'viewer');
    // an admin promotes a viewer to editor: a seat
    let r = await json(await send(`/v1/teams/${t.id}/members/${v.user.id}`, 'PATCH', ad.token, { role: 'editor' }));
    expect(r.status).toBe(200);
    expect(r.body.seats.paid).toBe(4);
    // but not to admin, nor touches another admin or the owner
    expect((await send(`/v1/teams/${t.id}/members/${v.user.id}`, 'PATCH', ad.token, { role: 'admin' })).status).toBe(400);
    const ad2 = await signedIn(); await join(t, ad2, 'admin');
    expect((await send(`/v1/teams/${t.id}/members/${ad2.user.id}`, 'PATCH', ad.token, { role: 'viewer' })).status).toBe(403);
    expect((await send(`/v1/teams/${t.id}/members/${t.owner.user.id}`, 'PATCH', ad.token, { role: 'viewer' })).status).toBe(400);
    expect((await send(`/v1/teams/${t.id}/members/${ad2.user.id}`, 'DELETE', ad.token, {})).status).toBe(403);
    // the owner may
    r = await json(await send(`/v1/teams/${t.id}/members/${ad2.user.id}`, 'PATCH', t.owner.token, { role: 'viewer' }));
    expect(r.body.members.find((m) => m.user_id === ad2.user.id)).toMatchObject({ role: 'viewer', seat: false });
    expect((await send(`/v1/teams/${t.id}/members/${ed.user.id}`, 'DELETE', ad.token, {})).status).toBe(200);
    expect((await call(`/v1/teams/${t.id}`, { token: ed.token })).status).toBe(404);
    expect((await send(`/v1/teams/${t.id}/members/nobody`, 'DELETE', t.owner.token, {})).status).toBe(404);
    expect((await send(`/v1/teams/${t.id}/members/${t.owner.user.id}`, 'DELETE', t.owner.token, {})).status).toBe(400);
    // editors manage nothing; anyone but the owner leaves
    expect((await send(`/v1/teams/${t.id}/members/${v.user.id}`, 'PATCH', v.token, { role: 'admin' })).status).toBe(403);
    expect((await send(`/v1/teams/${t.id}/leave`, 'POST', v.token, {})).status).toBe(200);
    expect((await send(`/v1/teams/${t.id}/leave`, 'POST', t.owner.token, {})).status).toBe(400);
    r = await json(await call(`/v1/teams/${t.id}`, { token: t.owner.token }));
    expect(r.body.members.map((m) => m.role).sort()).toEqual(['admin', 'owner', 'viewer']);
    expect(r.body.activity.map((a) => a.action)).toContain('member.leave');
  });

  it('the owner hands the team on and stays as admin', async () => {
    const t = await team();
    const ed = await signedIn();
    await join(t, ed);
    expect((await send(`/v1/teams/${t.id}/transfer`, 'POST', ed.token, { user_id: ed.user.id })).status).toBe(403);
    expect((await send(`/v1/teams/${t.id}/transfer`, 'POST', t.owner.token, { user_id: 'nobody' })).status).toBe(404);
    const r = await json(await send(`/v1/teams/${t.id}/transfer`, 'POST', t.owner.token, { user_id: ed.user.id }));
    expect(r.body.role).toBe('admin');
    expect(r.body.members.find((m) => m.user_id === ed.user.id).role).toBe('owner');
    expect((await env.DB.prepare('SELECT owner_id FROM workspaces WHERE id = ?').bind(t.id).first()).owner_id).toBe(ed.user.id);
    expect((await send(`/v1/teams/${t.id}/transfer`, 'POST', t.owner.token, { user_id: t.owner.user.id })).status).toBe(403);
  });
});

describe('seats and billing', () => {
  it('the owner buys the team plan for at least three seats, or the members, or the seats asked for', async () => {
    const t = await team();
    const url = `/v1/workspaces/${t.id}/billing/checkout`;
    let r = await json(await send(url, 'POST', t.owner.token, { plan: 'team', interval: 'month' }));
    expect(r.status).toBe(200);
    let b = calls.find((c) => c.path === '/v1/checkout/sessions').body;
    expect(b.get('line_items[0][price]')).toBe('price_tm');
    expect(b.get('line_items[0][quantity]')).toBe('3');
    expect(b.get('subscription_data[metadata][workspace_id]')).toBe(t.id);
    calls = [];
    await send(url, 'POST', t.owner.token, { plan: 'team', interval: 'year', seats: 5 });
    b = calls.find((c) => c.path === '/v1/checkout/sessions').body;
    expect(b.get('line_items[0][price]')).toBe('price_ty');
    expect(b.get('line_items[0][quantity]')).toBe('5');
    for (let i = 0; i < 3; i++) await join(t, await signedIn());
    calls = [];
    await send(url, 'POST', t.owner.token, { plan: 'team', interval: 'month', seats: 2 });
    expect(calls.find((c) => c.path === '/v1/checkout/sessions').body.get('line_items[0][quantity]')).toBe('4');
    // a team takes the team plan, a person never does; only the owner buys
    expect((await send(url, 'POST', t.owner.token, { plan: 'pro', interval: 'month' })).status).toBe(400);
    expect((await send(`/v1/workspaces/${t.owner.workspaceId}/billing/checkout`, 'POST', t.owner.token, { plan: 'team', interval: 'month' })).status).toBe(400);
    const ad = await signedIn(); await join(t, ad, 'admin');
    expect((await send(url, 'POST', ad.token, { plan: 'team', interval: 'month' })).status).toBe(403);
  });

  it('follow the paid members: up at once with an invoice, down for the next renewal', async () => {
    const t = await team();
    const sid = await teamPlan(t, 3);
    const a = await signedIn(), b = await signedIn(), c = await signedIn();
    await join(t, a); await join(t, b);
    expect(calls.filter((x) => x.method === 'POST' && x.path.includes('/subscriptions/'))).toHaveLength(0);   // within the minimum
    await join(t, c);
    let up = calls.filter((x) => x.method === 'POST' && x.path === `/v1/subscriptions/${sid}`);
    expect(up).toHaveLength(1);
    expect(up[0].body.get('items[0][quantity]')).toBe('4');
    expect(up[0].body.get('proration_behavior')).toBe('always_invoice');
    expect(await seatsRow(t.id)).toBe(4);
    const g = await json(await call(`/v1/teams/${t.id}`, { token: t.owner.token }));
    expect(g.body.seats).toEqual({ paid: 4, min: 3, billed: 4 });
    expect(g.body.active).toBe(true);
    // a viewer is free
    await join(t, await signedIn(), 'viewer');
    expect(calls.filter((x) => x.method === 'POST' && x.path === `/v1/subscriptions/${sid}`)).toHaveLength(1);
    // down, without a credit
    calls = [];
    await send(`/v1/teams/${t.id}/members/${c.user.id}`, 'PATCH', t.owner.token, { role: 'viewer' });
    up = calls.filter((x) => x.method === 'POST' && x.path === `/v1/subscriptions/${sid}`);
    expect(up[0].body.get('items[0][quantity]')).toBe('3');
    expect(up[0].body.get('proration_behavior')).toBe('none');
    expect(await seatsRow(t.id)).toBe(3);
    // never below the minimum
    calls = [];
    await send(`/v1/teams/${t.id}/leave`, 'POST', a.token, {});
    expect(calls.filter((x) => x.method === 'POST')).toHaveLength(0);
    expect(await seatsRow(t.id)).toBe(3);
  });

  it('switching the interval keeps the seats', async () => {
    const t = await team();
    const sid = await teamPlan(t, 4);
    const r = await json(await send(`/v1/workspaces/${t.id}/billing/interval`, 'POST', t.owner.token, { interval: 'year' }));
    expect(r.status).toBe(200);
    const up = calls.find((x) => x.method === 'POST' && x.path === `/v1/subscriptions/${sid}`);
    expect(up.body.get('items[0][price]')).toBe('price_ty');
    expect(up.body.get('items[0][quantity]')).toBe('4');
    expect((await env.DB.prepare('SELECT plan, interval, seats FROM subscriptions WHERE workspace_id = ?').bind(t.id).first())).toEqual({ plan: 'team', interval: 'year', seats: 4 });
  });

  it('a paid seat gives Pro on the member’s own workspace; a viewer’s does not', async () => {
    const t = await team();
    const ed = await signedIn(), v = await signedIn();
    await join(t, ed); await join(t, v, 'viewer');
    let m = await me(ed);
    expect(m.team_seat).toBe(false);
    expect(m.workspaces.find((w) => w.kind === 'personal').active).toBe(false);
    expect((await send(`/v1/workspaces/${ed.workspaceId}/benches`, 'POST', ed.token, { name: 'B', content: bench() })).status).toBe(402);
    await teamPlan(t, 3);
    m = await me(ed);
    expect(m.team_seat).toBe(true);
    expect(m.workspaces.find((w) => w.kind === 'personal').active).toBe(true);
    expect(m.workspaces.find((w) => w.kind === 'team').active).toBe(true);
    expect((await send(`/v1/workspaces/${ed.workspaceId}/benches`, 'POST', ed.token, { name: 'B', content: bench() })).status).toBe(201);
    expect((await send(`/v1/workspaces/${t.id}/benches`, 'POST', ed.token, { name: 'T', content: bench() })).status).toBe(201);
    m = await me(v);
    expect(m.team_seat).toBe(false);
    expect(m.workspaces.find((w) => w.kind === 'personal').active).toBe(false);
    expect((await send(`/v1/workspaces/${t.id}/benches`, 'POST', v.token, { name: 'T', content: bench() })).status).toBe(403);
    expect((await call(`/v1/workspaces/${t.id}/benches`, { token: v.token })).status).toBe(200);
    // the plan lapses: so does the seat's Pro
    await env.DB.prepare("UPDATE subscriptions SET status = 'canceled', period_end = ? WHERE workspace_id = ?").bind(Date.now() - DAY, t.id).run();
    expect((await me(ed)).team_seat).toBe(false);
  });

  it('deleting the team cancels its subscription and takes its benches', async () => {
    const t = await team();
    const sid = await teamPlan(t, 3);
    const ed = await signedIn(); await join(t, ed);
    const r = await json(await send(`/v1/workspaces/${t.id}/benches`, 'POST', t.owner.token, { name: 'T', content: bench() }));
    expect(r.status).toBe(201);
    expect((await call(`/v1/teams/${t.id}`, { method: 'DELETE', token: ed.token })).status).toBe(403);
    expect((await call(`/v1/teams/${t.id}`, { method: 'DELETE', token: t.owner.token })).status).toBe(200);
    expect(calls.find((x) => x.method === 'DELETE' && x.path === `/v1/subscriptions/${sid}`)).toBeTruthy();
    expect(await env.DB.prepare('SELECT 1 AS y FROM workspaces WHERE id = ?').bind(t.id).first()).toBeNull();
    expect(await env.DB.prepare('SELECT 1 AS y FROM members WHERE workspace_id = ?').bind(t.id).first()).toBeNull();
    expect(await env.DB.prepare('SELECT 1 AS y FROM benches WHERE id = ?').bind(r.body.id).first()).toBeNull();
    expect((await me(ed)).workspaces).toHaveLength(1);
  });

  it('a member deleting their account frees their seat', async () => {
    const t = await team();
    const sid = await teamPlan(t, 3);
    const a = await signedIn(), b = await signedIn(), c = await signedIn();
    await join(t, a); await join(t, b); await join(t, c);
    expect(await seatsRow(t.id)).toBe(4);
    calls = [];
    expect((await send('/v1/me', 'DELETE', c.token, { confirm: CONFIRM })).status).toBe(200);
    const up = calls.find((x) => x.method === 'POST' && x.path === `/v1/subscriptions/${sid}`);
    expect(up.body.get('items[0][quantity]')).toBe('3');
    expect(await seatsRow(t.id)).toBe(3);
    // an owner with others in the team cannot delete their account
    expect((await send('/v1/me', 'DELETE', t.owner.token, { confirm: CONFIRM })).status).toBe(409);
  });

  it('a personal subscription now covered by a seat can be stopped at the end of its period, and resumed', async () => {
    const t = await team();
    await teamPlan(t, 3);
    const sid = 'sub_' + t.owner.workspaceId;
    subs[sid] = { id: sid, object: 'subscription', customer: 'cus_p', status: 'active', cancel_at_period_end: false, cancel_at: null, metadata: { workspace_id: t.owner.workspaceId },
      items: { data: [{ id: 'si_p', quantity: 1, current_period_end: Math.floor((Date.now() + 20 * DAY) / 1000), price: priceObj('pro_monthly') }] } };
    await withPlan(t.owner.workspaceId);
    let r = await json(await send(`/v1/workspaces/${t.owner.workspaceId}/billing/cancel`, 'POST', t.owner.token, {}));
    expect(r.status).toBe(200);
    expect(r.body.cancel_at).toBeGreaterThan(Date.now());
    const up = calls.find((x) => x.method === 'POST' && x.path === `/v1/subscriptions/${sid}`);
    expect(up.body.get('cancel_at_period_end')).toBe('true');
    let row = await env.DB.prepare('SELECT cancel_at, status FROM subscriptions WHERE workspace_id = ?').bind(t.owner.workspaceId).first();
    expect(row.cancel_at).toBe(r.body.cancel_at);
    expect(row.status).toBe('active');
    expect((await me(t.owner)).workspaces.find((w) => w.kind === 'personal').plan.cancel_at).toBe(r.body.cancel_at);
    r = await json(await send(`/v1/workspaces/${t.owner.workspaceId}/billing/cancel`, 'POST', t.owner.token, { resume: true }));
    expect(r.body.cancel_at).toBeNull();
    row = await env.DB.prepare('SELECT cancel_at FROM subscriptions WHERE workspace_id = ?').bind(t.owner.workspaceId).first();
    expect(row.cancel_at).toBeNull();
    const other = await signedIn();
    expect((await send(`/v1/workspaces/${t.owner.workspaceId}/billing/cancel`, 'POST', other.token, {})).status).toBe(404);
    await env.DB.prepare("UPDATE subscriptions SET stripe_customer = 'manual' WHERE workspace_id = ?").bind(t.owner.workspaceId).run();
    expect((await send(`/v1/workspaces/${t.owner.workspaceId}/billing/cancel`, 'POST', t.owner.token, {})).status).toBe(404);
  });

  it('personal subscriptions are unchanged', async () => {
    const s = await signedIn();
    await withPlan(s.workspaceId);
    expect((await me(s)).workspaces[0].active).toBe(true);
    expect((await send(`/v1/workspaces/${s.workspaceId}/billing/checkout`, 'POST', s.token, { plan: 'pro', interval: 'month' })).status).toBe(409);
  });
});
