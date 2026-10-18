import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIRM } from '../src/account.js';
import { bench, call, send, signedIn, withPlan } from './helpers.js';

const json = async (res) => ({ status: res.status, body: await res.json(), cookie: res.headers.get('Set-Cookie') });
const count = async (sql, ...args) => (await env.DB.prepare(sql).bind(...args).first()).n;

// A stand-in for Stripe that records what it is asked, and can be down.
let calls, stripeDown;
function fakeStripe() {
  calls = []; stripeDown = false;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    calls.push({ method: init.method || 'GET', path: new URL(String(input)).pathname, auth: (init.headers || {}).Authorization });
    if (stripeDown) return new Response(JSON.stringify({ error: { message: 'down' } }), { status: 500 });
    return new Response(JSON.stringify({ id: 'sub', status: 'canceled' }), { headers: { 'Content-Type': 'application/json' } });
  });
}
afterEach(() => vi.restoreAllMocks());

async function pro(name) {
  const s = await signedIn(name);
  await withPlan(s.workspaceId);
  await env.DB.prepare("INSERT INTO identities (provider, subject, user_id, created_at) VALUES ('google', ?, ?, 0)").bind('g-' + s.user.id, s.user.id).run();
  return s;
}
async function make(s, ws, name = 'Bench') {
  const r = await send(`/v1/workspaces/${ws}/benches`, 'POST', s.token, { name, content: bench(name) });
  expect(r.status).toBe(201);
  return (await r.json()).id;
}
// A team workspace owned by `owner`, with the others as editors, on a plan.
async function team(owner, ...others) {
  const id = 'team' + Math.random().toString(16).slice(2);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO workspaces (id, kind, name, owner_id, created_at) VALUES (?, 'team', 'Lab', ?, 0)").bind(id, owner.user.id),
    ...[owner, ...others].map((m, i) => env.DB.prepare('INSERT INTO members (workspace_id, user_id, role, seat, created_at) VALUES (?, ?, ?, 1, 0)')
      .bind(id, m.user.id, i ? 'editor' : 'owner')),
  ]);
  await withPlan(id);
  return id;
}
const del = (s, confirm = CONFIRM, origin) => call('/v1/me', { method: 'DELETE', token: s.token, origin,
  body: JSON.stringify({ confirm }), headers: { 'Content-Type': 'application/json' } });

describe('deleting an account', () => {
  it('needs the words typed out, and changes nothing without them', async () => {
    fakeStripe();
    const s = await pro('Ada');
    await make(s, s.workspaceId);
    const r = await json(await del(s, 'yes'));
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('confirm');
    expect(await count('SELECT COUNT(*) AS n FROM benches WHERE workspace_id = ?', s.workspaceId)).toBe(1);
    expect((await call('/v1/me', { token: s.token })).status).toBe(200);
    expect(calls).toEqual([]);
  });

  it('is refused from another site', async () => {
    fakeStripe();
    const s = await pro('Ada');
    expect((await del(s, CONFIRM, 'https://evil.example')).status).toBe(403);
    expect((await call('/v1/me', { token: s.token })).status).toBe(200);
  });

  it('deletes the personal workspace, its benches and their history, sign-ins and sessions', async () => {
    fakeStripe();
    const s = await pro('Ada');
    const b = await make(s, s.workspaceId, 'Michelson');
    expect(await env.BENCHES.get(`w/${s.workspaceId}/b/${b}/v/1.jekray`)).not.toBeNull();
    const r = await json(await del(s));
    expect(r.status).toBe(200);
    expect(r.cookie).toMatch(/jek_session=;.*Max-Age=0/);
    expect(await env.BENCHES.get(`w/${s.workspaceId}/b/${b}/v/1.jekray`)).toBeNull();
    for (const [sql, arg] of [
      ['SELECT COUNT(*) AS n FROM workspaces WHERE owner_id = ?', s.user.id],
      ['SELECT COUNT(*) AS n FROM benches WHERE workspace_id = ?', s.workspaceId],
      ['SELECT COUNT(*) AS n FROM bench_versions WHERE bench_id = ?', b],
      ['SELECT COUNT(*) AS n FROM subscriptions WHERE workspace_id = ?', s.workspaceId],
      ['SELECT COUNT(*) AS n FROM members WHERE user_id = ?', s.user.id],
      ['SELECT COUNT(*) AS n FROM identities WHERE user_id = ?', s.user.id],
      ['SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', s.user.id],
    ]) expect(await count(sql, arg), sql).toBe(0);
    // nothing personal is left, and the old cookie no longer signs in
    const u = await env.DB.prepare('SELECT name, email, academic_until, deleted_at FROM users WHERE id = ?').bind(s.user.id).first();
    expect(u).toMatchObject({ name: 'Deleted user', email: null, academic_until: null });
    expect(u.deleted_at).toBeGreaterThan(0);
    expect((await call('/v1/me', { token: s.token })).status).toBe(401);
  });

  it('cancels a live subscription at Stripe first, and deletes nothing if Stripe cannot be reached', async () => {
    fakeStripe();
    const s = await pro('Ada');
    await make(s, s.workspaceId);
    stripeDown = true;
    expect((await del(s)).status).toBe(502);
    expect(await count('SELECT COUNT(*) AS n FROM benches WHERE workspace_id = ?', s.workspaceId)).toBe(1);
    expect((await call('/v1/me', { token: s.token })).status).toBe(200);
    stripeDown = false; calls = [];
    expect((await del(s)).status).toBe(200);
    expect(calls).toEqual([{ method: 'DELETE', path: '/v1/subscriptions/sub_' + s.workspaceId, auth: 'Bearer rk_test_x' }]);
  });

  it('does not call Stripe for a subscription that has already ended', async () => {
    fakeStripe();
    const s = await signedIn('Ada');
    await withPlan(s.workspaceId, 'canceled', Date.now() - 1000);
    expect((await del(s)).status).toBe(200);
    expect(calls).toEqual([]);
  });

  it('asks for a new owner first for a team with other people in it', async () => {
    fakeStripe();
    const a = await pro('Ada'), b = await pro('Bea');
    const t = await team(a, b);
    const r = await json(await del(a));
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('owns_team');
    expect(await count('SELECT COUNT(*) AS n FROM workspaces WHERE owner_id = ?', a.user.id)).toBe(2);
    expect(await count('SELECT COUNT(*) AS n FROM members WHERE workspace_id = ?', t)).toBe(2);
    expect(calls).toEqual([]);
  });

  it('deletes a team with no one else in it, along with the personal workspace', async () => {
    fakeStripe();
    const a = await pro('Ada');
    const t = await team(a);
    await make(a, t, 'Team bench');
    expect((await del(a)).status).toBe(200);
    expect(await count('SELECT COUNT(*) AS n FROM workspaces WHERE id = ?', t)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM benches WHERE workspace_id = ?', t)).toBe(0);
    expect(calls.map((c) => c.path).sort()).toEqual(['/v1/subscriptions/sub_' + a.workspaceId, '/v1/subscriptions/sub_' + t].sort());
  });

  it('leaves benches saved in someone else’s team with the team, by a deleted user', async () => {
    fakeStripe();
    const a = await pro('Ada'), b = await pro('Bea');
    const t = await team(a, b);
    const tb = await make(b, t, 'Bea’s team bench');
    expect((await del(b)).status).toBe(200);
    const list = await (await call(`/v1/workspaces/${t}/benches`, { token: a.token })).json();
    expect(list.benches.map((x) => [x.id, x.updated_by.name])).toEqual([[tb, 'Deleted user']]);
    expect((await call(`/v1/benches/${tb}`, { token: a.token })).status).toBe(200);
    expect(await count('SELECT COUNT(*) AS n FROM members WHERE workspace_id = ?', t)).toBe(1);
    // the team's own subscription is the owner's, and stays
    expect(calls.map((c) => c.path)).toEqual(['/v1/subscriptions/sub_' + b.workspaceId]);
  });

  it('lets the same Google account sign up afresh afterwards, with nothing of the old account', async () => {
    fakeStripe();
    const s = await pro('Ada');
    await make(s, s.workspaceId);
    expect((await del(s)).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM identities WHERE subject = ?", 'g-' + s.user.id)).toBe(0);
  });
});
