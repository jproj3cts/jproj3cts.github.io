import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { LEASE_MS, purgeLeases } from '../src/benches.js';
import { bench, call, send, signedIn, withPlan } from './helpers.js';

async function pro(name) { const s = await signedIn(name); await withPlan(s.workspaceId); return s; }
// a team of `owner` and the others as editors (the last a viewer when `viewer`), on a plan
async function team(owner, others, viewer = null) {
  const id = 'team' + Math.random().toString(16).slice(2);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO workspaces (id, kind, name, owner_id, created_at) VALUES (?, 'team', 'Lab', ?, 0)").bind(id, owner.user.id),
    env.DB.prepare("INSERT INTO members VALUES (?, ?, 'owner', 1, 0)").bind(id, owner.user.id),
    ...others.map((m) => env.DB.prepare("INSERT INTO members VALUES (?, ?, 'editor', 1, 0)").bind(id, m.user.id)),
    ...(viewer ? [env.DB.prepare("INSERT INTO members VALUES (?, ?, 'viewer', 0, 0)").bind(id, viewer.user.id)] : []),
  ]);
  await withPlan(id);
  return id;
}
const make = async (s, ws, name = 'Bench') => (await (await send(`/v1/workspaces/${ws}/benches`, 'POST', s.token, { name, content: bench(name) })).json()).id;
const lease = (s, id, body = {}) => send(`/v1/benches/${id}/lease`, 'POST', s.token, body);
const save = (s, id, v, name = 'Bench') => send(`/v1/benches/${id}`, 'PUT', s.token, { content: bench(name, { x: Math.random() }), name }, { 'If-Match': `"${v}"` });
const json = async (r) => ({ status: r.status, body: await r.json() });

describe('editing leases', () => {
  it('are taken on open, renewed, and tell the next person who is editing', async () => {
    const a = await pro('Ada'), b = await pro('Ben');
    const ws = await team(a, [b]);
    const id = await make(a, ws);
    let r = await json(await lease(a, id));
    expect(r.status).toBe(200);
    expect(r.body.held).toBe(true);
    expect(r.body.editing).toMatchObject({ id: a.user.id, name: 'Ada', avatar: null });
    expect(r.body.until).toBeGreaterThan(Date.now() + LEASE_MS - 5000);
    expect(r.body.version).toBe(1);
    const since = r.body.editing.since;
    // renewed: the same lease, later end
    r = await json(await lease(a, id));
    expect(r.body.editing.since).toBe(since);
    // Ben sees Ada editing and does not get it
    r = await json(await lease(b, id));
    expect(r.body.held).toBe(false);
    expect(r.body.editing).toMatchObject({ id: a.user.id, name: 'Ada' });
    // the bench list and the bench say so too
    const listed = (await (await call(`/v1/workspaces/${ws}/benches`, { token: b.token })).json()).benches[0];
    expect(listed.editing).toMatchObject({ id: a.user.id, name: 'Ada' });
    expect((await (await call(`/v1/benches/${id}`, { token: b.token })).json()).editing.name).toBe('Ada');
  });

  it('refuse a save against someone else’s lease, and allow it after a takeover', async () => {
    const a = await pro('Ada'), b = await pro('Ben');
    const ws = await team(a, [b]);
    const id = await make(a, ws);
    await lease(a, id);
    let r = await json(await save(b, id, 1));
    expect(r.status).toBe(423);
    expect(r.body.error.code).toBe('locked');
    expect(r.body.error.editing.name).toBe('Ada');
    expect((await save(a, id, 1)).status).toBe(200);
    // Ben takes over: he holds it, Ada's next save is refused, and the takeover is recorded
    r = await json(await lease(b, id, { take: true }));
    expect(r.body.held).toBe(true);
    expect(r.body.editing.name).toBe('Ben');
    expect(r.body.version).toBe(2);
    expect((await save(b, id, 2)).status).toBe(200);
    r = await json(await save(a, id, 3));
    expect(r.status).toBe(423);
    r = await json(await lease(a, id));
    expect(r.body.held).toBe(false);
    expect(r.body.editing.name).toBe('Ben');
    const audit = await env.DB.prepare("SELECT user_id FROM audit WHERE workspace_id = ? AND action = 'bench.takeover'").bind(ws).first();
    expect(audit.user_id).toBe(b.user.id);
  });

  it('expire, are released, and are purged', async () => {
    const a = await pro('Ada'), b = await pro('Ben');
    const ws = await team(a, [b]);
    const id = await make(a, ws);
    await lease(a, id);
    await env.DB.prepare('UPDATE bench_leases SET until = ? WHERE bench_id = ?').bind(Date.now() - 1, id).run();
    expect((await (await lease(b, id)).json()).held).toBe(true);
    expect((await save(b, id, 1)).status).toBe(200);
    // Ada cannot release Ben's; Ben can
    await send(`/v1/benches/${id}/lease`, 'DELETE', a.token, {});
    expect((await (await lease(a, id)).json()).held).toBe(false);
    await send(`/v1/benches/${id}/lease`, 'DELETE', b.token, {});
    expect((await (await lease(a, id)).json()).held).toBe(true);
    await env.DB.prepare('UPDATE bench_leases SET until = ? WHERE bench_id = ?').bind(Date.now() - 2 * 86400000, id).run();
    await purgeLeases(env);
    expect(await env.DB.prepare('SELECT 1 AS y FROM bench_leases WHERE bench_id = ?').bind(id).first()).toBeNull();
  });

  it('are not taken by viewers, by people without a plan, or by outsiders', async () => {
    const a = await pro('Ada'), v = await signedIn('Vic'), o = await signedIn('Out');
    const ws = await team(a, [], v);
    const id = await make(a, ws);
    let r = await json(await lease(v, id));
    expect(r.status).toBe(200);
    expect(r.body.held).toBe(false);
    expect(r.body.editing).toBeNull();
    expect((await lease(o, id)).status).toBe(404);
    // the plan ends: an editor only looks
    await env.DB.prepare("UPDATE subscriptions SET status = 'canceled', period_end = 0 WHERE workspace_id = ?").bind(ws).run();
    r = await json(await lease(a, id));
    expect(r.body.held).toBe(false);
  });

  it('a conflict says who saved and when', async () => {
    const a = await pro('Ada'), b = await pro('Ben');
    const ws = await team(a, [b]);
    const id = await make(a, ws);
    expect((await save(b, id, 1)).status).toBe(200);
    const r = await json(await save(a, id, 1));
    expect(r.status).toBe(409);
    expect(r.body.error.version).toBe(2);
    expect(r.body.error.updated_by).toMatchObject({ id: b.user.id, name: 'Ben' });
    expect(r.body.error.updated_at).toBeGreaterThan(0);
  });
});
