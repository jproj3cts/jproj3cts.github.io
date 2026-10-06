import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { bench, call, send, signedIn, withPlan } from './helpers.js';

const json = async (res) => ({ status: res.status, body: await res.json() });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);

async function pro(name) {
  const s = await signedIn(name);
  await withPlan(s.workspaceId);
  return s;
}
async function make(s, name, extra = {}) {
  return (await json(await send(`/v1/workspaces/${s.workspaceId}/benches`, 'POST', s.token, { name, content: bench(name), ...extra }))).body;
}
const put = (s, id, version, name) => send(`/v1/benches/${id}`, 'PUT', s.token, { content: bench(name), checkpoint: true }, { 'If-Match': `"${version}"` });
const fork = async (s, id, body = {}) => json(await send(`/v1/benches/${id}/fork`, 'POST', s.token, body));
const content = async (s, id) => (await json(await call(`/v1/benches/${id}`, { token: s.token }))).body;
const history = async (s, id) => (await json(await call(`/v1/benches/${id}/versions`, { token: s.token }))).body;

describe('forks', () => {
  it('copies the bench as it is now, into the same folder, remembering where it came from', async () => {
    const s = await pro('Ada');
    const f = await (await send(`/v1/workspaces/${s.workspaceId}/folders`, 'POST', s.token, { name: 'Lasers' })).json();
    const b = await make(s, 'Michelson', { folder_id: f.id });
    await put(s, b.id, 1, 'Michelson v2');
    await call(`/v1/benches/${b.id}/thumb`, { method: 'PUT', token: s.token, body: PNG, headers: { 'Content-Type': 'image/png' } });
    const r = await fork(s, b.id);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ name: 'Michelson (fork)', version: 1, folder_id: f.id, forked_from: { id: b.id, version: 2, name: 'Michelson' } });
    expect(r.body.thumb).toMatch(/^\/v1\/benches\/[0-9a-f]{32}\/thumb\?k=/);
    expect((await call(r.body.thumb, { token: s.token })).status).toBe(200);
    expect((await content(s, r.body.id)).content).toBe(bench('Michelson v2'));
    const h = await history(s, r.body.id);
    expect(h.forked_from).toEqual({ id: b.id, version: 2, name: 'Michelson' });
    expect(h.bench).toMatchObject({ id: r.body.id, name: 'Michelson (fork)', version: 1, thumb: r.body.thumb });
    expect(h.versions).toMatchObject([{ version: 1, label: 'Forked from “Michelson”, version 2' }]);
    // the original is untouched, and lists its fork
    expect(await content(s, b.id)).toMatchObject({ version: 2, content: bench('Michelson v2'), forked_from: null });
    expect((await history(s, b.id)).forks).toMatchObject([{ id: r.body.id, name: 'Michelson (fork)', version: 2 }]);
  });

  it('forks from an earlier version, with a name and folder of its own', async () => {
    const s = await pro('Ada');
    const b = await make(s, 'Cavity');
    await put(s, b.id, 1, 'Cavity v2');
    const r = await fork(s, b.id, { version: 1, name: 'Cavity, other mirror', folder_id: null });
    expect(r.body).toMatchObject({ name: 'Cavity, other mirror', folder_id: null, thumb: null, forked_from: { id: b.id, version: 1 } });
    expect((await content(s, r.body.id)).content).toBe(bench('Cavity'));
    // a fork of a fork names its own parent
    const r2 = await fork(s, r.body.id);
    expect(r2.body.forked_from).toEqual({ id: r.body.id, version: 1, name: 'Cavity, other mirror' });
  });

  it('keeps the origin’s name after the original is renamed or deleted', async () => {
    const s = await pro('Ada');
    const b = await make(s, 'Original');
    const r = await fork(s, b.id);
    await send(`/v1/benches/${b.id}`, 'PATCH', s.token, { name: 'Renamed' });
    await call(`/v1/benches/${b.id}`, { method: 'DELETE', token: s.token });
    expect((await content(s, r.body.id)).forked_from).toEqual({ id: b.id, version: 1, name: 'Original' });
    // a deleted bench is not forked again
    expect((await fork(s, b.id)).status).toBe(404);
  });

  it('refuses a version that is not kept, or not a number', async () => {
    const s = await pro('Ada');
    const b = await make(s, 'B');
    expect((await fork(s, b.id, { version: 7 })).status).toBe(404);
    expect((await fork(s, b.id, { version: 'x' })).status).toBe(400);
    expect((await fork(s, b.id, { version: 0 })).status).toBe(400);
  });

  it('needs a plan where the fork goes, and counts it against that quota', async () => {
    const s = await pro('Ada');
    const b = await make(s, 'B');
    await env.DB.prepare("UPDATE subscriptions SET status = 'canceled', period_end = 0 WHERE workspace_id = ?").bind(s.workspaceId).run();
    const r = await fork(s, b.id);
    expect([r.status, r.body.error.code]).toEqual([402, 'no_plan']);
  });

  it('cannot fork someone else’s bench, nor put a fork in their workspace or folder', async () => {
    const a = await pro('Ada'), e = await pro('Eve');
    const b = await make(a, 'Secret');
    const mine = await make(e, 'Mine');
    const fa = await (await send(`/v1/workspaces/${a.workspaceId}/folders`, 'POST', a.token, { name: 'Private' })).json();
    expect((await fork(e, b.id)).status).toBe(404);
    expect((await fork(e, mine.id, { workspace_id: a.workspaceId })).status).toBe(404);
    expect((await fork(e, mine.id, { folder_id: fa.id })).status).toBe(400);
    expect((await history(a, b.id)).forks).toEqual([]);
  });

  it('lists only the forks the caller can see', async () => {
    const a = await pro('Ada'), v = await pro('Vic');
    const team = 't'.repeat(31) + '2';
    await env.DB.batch([
      env.DB.prepare("INSERT INTO workspaces (id, kind, name, owner_id, created_at) VALUES (?, 'team', 'Lab', ?, 0)").bind(team, a.user.id),
      env.DB.prepare("INSERT INTO members (workspace_id, user_id, role, seat, created_at) VALUES (?, ?, 'owner', 1, 0)").bind(team, a.user.id),
      env.DB.prepare("INSERT INTO members (workspace_id, user_id, role, seat, created_at) VALUES (?, ?, 'editor', 1, 0)").bind(team, v.user.id),
    ]);
    await withPlan(team);
    const tb = await (await send(`/v1/workspaces/${team}/benches`, 'POST', a.token, { name: 'Shared', content: bench('Shared') })).json();
    // Vic forks the team's bench into their own benches; Ada cannot see that fork
    const r = await fork(v, tb.id, { workspace_id: v.workspaceId });
    expect(r.body).toMatchObject({ workspace_id: v.workspaceId, folder_id: null, forked_from: { id: tb.id } });
    expect((await history(v, tb.id)).forks.map((f) => f.id)).toEqual([r.body.id]);
    expect((await history(a, tb.id)).forks).toEqual([]);
  });
});
