import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bench, call, send, signedIn, withPlan } from './helpers.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const SECRET = 'Ada-secret-bench-7f3a';
afterEach(() => vi.restoreAllMocks());

// Ada's workspace, with a bench (two versions, a thumbnail), a folder and a session.
async function ada() {
  const a = await signedIn('Ada');
  await withPlan(a.workspaceId);
  const f = await (await send(`/v1/workspaces/${a.workspaceId}/folders`, 'POST', a.token, { name: 'Private' })).json();
  const b = await (await send(`/v1/workspaces/${a.workspaceId}/benches`, 'POST', a.token, { name: SECRET, folder_id: f.id, content: bench(SECRET) })).json();
  await send(`/v1/benches/${b.id}`, 'PUT', a.token, { content: bench(SECRET + ' v2'), checkpoint: true }, { 'If-Match': '"1"' });
  await call(`/v1/benches/${b.id}/thumb`, { method: 'PUT', token: a.token, body: PNG, headers: { 'Content-Type': 'image/png' } });
  const sid = (await (await call('/v1/me/sessions', { token: a.token })).json()).sessions[0].id;
  return { ...a, bench: b.id, folder: f.id, sid };
}

// Every route that names something of Ada's.
const routes = (A) => [
  ['GET', `/v1/workspaces/${A.workspaceId}/benches`],
  ['POST', `/v1/workspaces/${A.workspaceId}/benches`, { name: 'x', content: bench('x') }],
  ['GET', `/v1/benches/${A.bench}`],
  ['PUT', `/v1/benches/${A.bench}`, { content: bench('overwritten') }, { 'If-Match': '"2"' }],
  ['PATCH', `/v1/benches/${A.bench}`, { name: 'renamed' }],
  ['DELETE', `/v1/benches/${A.bench}`],
  ['POST', `/v1/benches/${A.bench}/undelete`],
  ['GET', `/v1/benches/${A.bench}/versions`],
  ['GET', `/v1/benches/${A.bench}/versions/1`],
  ['POST', `/v1/benches/${A.bench}/versions/1/restore`],
  ['PUT', `/v1/benches/${A.bench}/thumb`, PNG, { 'Content-Type': 'image/png' }],
  ['GET', `/v1/benches/${A.bench}/thumb`],
  ['GET', `/v1/workspaces/${A.workspaceId}/folders`],
  ['POST', `/v1/workspaces/${A.workspaceId}/folders`, { name: 'x' }],
  ['PATCH', `/v1/workspaces/${A.workspaceId}/folders/${A.folder}`, { name: 'renamed' }],
  ['DELETE', `/v1/workspaces/${A.workspaceId}/folders/${A.folder}`],
  ['POST', `/v1/workspaces/${A.workspaceId}/billing/checkout`, { plan: 'pro', interval: 'month' }],
  ['POST', `/v1/workspaces/${A.workspaceId}/billing/portal`, {}],
  ['POST', `/v1/workspaces/${A.workspaceId}/billing/interval`, { interval: 'year' }],
  ['DELETE', `/v1/me/sessions/${A.sid}`],
];

const hit = (token, [method, path, body, headers = {}], origin) =>
  call(path, {
    method, token, origin,
    body: body instanceof Uint8Array ? body : body && JSON.stringify(body),
    headers: { ...(body && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}), ...headers },
  });

// Ada's bench as it was: the same name, content, version, folder, thumbnail, history and session.
async function untouched(A) {
  const r = await call(`/v1/benches/${A.bench}`, { token: A.token });
  expect(r.status).toBe(200);
  const b = await r.json();
  expect(b).toMatchObject({ name: SECRET, version: 2, folder_id: A.folder, deleted_at: null });
  expect(b.content).toBe(bench(SECRET + ' v2'));
  expect((await (await call(`/v1/benches/${A.bench}/versions`, { token: A.token })).json()).versions.map((v) => v.version)).toEqual([2, 1]);
  expect((await call(`/v1/benches/${A.bench}/thumb`, { token: A.token })).status).toBe(200);
  const folders = (await (await call(`/v1/workspaces/${A.workspaceId}/folders`, { token: A.token })).json()).folders;
  expect(folders.map((f) => f.name)).toEqual(['Private']);
  const list = (await (await call(`/v1/workspaces/${A.workspaceId}/benches`, { token: A.token })).json()).benches;
  expect(list.map((x) => x.name)).toEqual([SECRET]);
}

describe('one account cannot reach another’s data', () => {
  it('by any route that names it, signed in as someone else with a plan of their own', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 500 })); // never Stripe
    const A = await ada(), E = await signedIn('Eve');
    await withPlan(E.workspaceId);
    for (const r of routes(A)) {
      const res = await hit(E.token, r);
      const text = await res.text();
      expect([r[0] + ' ' + r[1], res.status]).toEqual([r[0] + ' ' + r[1], 404]);
      expect(text).not.toContain(SECRET);
    }
    await untouched(A);
  });

  it('signed out', async () => {
    const A = await ada();
    for (const r of routes(A)) {
      const res = await hit(undefined, r);
      expect([r[0] + ' ' + r[1], res.status]).toEqual([r[0] + ' ' + r[1], 401]);
      expect(await res.text()).not.toContain(SECRET);
    }
    await untouched(A);
  });

  it('from another website, even with Ada’s own cookie: no change goes through, and no answer is readable there', async () => {
    const A = await ada();
    for (const r of routes(A)) {
      const res = await hit(A.token, r, 'https://evil.example');
      if (r[0] !== 'GET') expect([r[0] + ' ' + r[1], res.status]).toEqual([r[0] + ' ' + r[1], 403]);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
    await untouched(A);
  });

  it('nor by guessing: made-up ids answer exactly as someone else’s do', async () => {
    const E = await signedIn('Eve');
    const fake = 'f'.repeat(32);
    const a = await call(`/v1/benches/${fake}`, { token: E.token });
    const A = await ada();
    const b = await call(`/v1/benches/${A.bench}`, { token: E.token });
    expect([a.status, await a.json()]).toEqual([b.status, await b.json()]);
  });

  it('a viewer in a shared workspace can read but not change, and a member never reaches the owner’s personal benches', async () => {
    const A = await ada(), V = await signedIn('Vic');
    const team = 't'.repeat(31) + '1';
    await env.DB.batch([
      env.DB.prepare("INSERT INTO workspaces (id, kind, name, owner_id, created_at) VALUES (?, 'team', 'Lab', ?, 0)").bind(team, A.user.id),
      env.DB.prepare("INSERT INTO members (workspace_id, user_id, role, seat, created_at) VALUES (?, ?, 'owner', 1, 0)").bind(team, A.user.id),
      env.DB.prepare("INSERT INTO members (workspace_id, user_id, role, seat, created_at) VALUES (?, ?, 'viewer', 0, 0)").bind(team, V.user.id),
    ]);
    await withPlan(team);
    const tb = await (await send(`/v1/workspaces/${team}/benches`, 'POST', A.token, { name: 'Team bench', content: bench('Team bench') })).json();
    expect((await call(`/v1/benches/${tb.id}`, { token: V.token })).status).toBe(200);
    expect((await send(`/v1/benches/${tb.id}`, 'PUT', V.token, { content: bench('x') }, { 'If-Match': '"1"' })).status).toBe(403);
    expect((await call(`/v1/benches/${tb.id}`, { method: 'DELETE', token: V.token })).status).toBe(403);
    expect((await send(`/v1/workspaces/${team}/benches`, 'POST', V.token, { name: 'x', content: bench('x') })).status).toBe(403);
    expect((await call(`/v1/benches/${A.bench}`, { token: V.token })).status).toBe(404);
    await untouched(A);
  });
});
