import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createSession } from '../src/sessions.js';
import { createUser } from '../src/users.js';
import { monthOf } from '../src/institutions.js';
import { bench, call, send } from './helpers.js';

const OPS = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const DAY = 86400000;
const ops = (path, body) => call(path, { method: body ? 'POST' : 'GET', origin: null, body: body && JSON.stringify(body), headers: { Authorization: `Bearer ${OPS}`, 'Content-Type': 'application/json' } });
let n = 0;
async function person(email) {
  const { user, workspaceId } = await createUser(env, { name: `P${++n}`, email });
  const { token } = await createSession(env, user.id, 'vitest');
  return { user, workspaceId, token };
}
const me = async (p) => (await call('/v1/me', { token: p.token })).json();
const post = (p, path, body) => send(path, 'POST', p.token, body);
let u = 0;
async function setup({ max = 'unlimited' } = {}) {
  const d = `adm${++u}.ac.uk`;
  const uni = await (await ops('/ops/institutions', { name: `Admin University ${u}`, domains: [d] })).json();
  await ops(`/ops/institutions/${uni.id}/manual`, { until: Date.now() + 30 * DAY, max_users: max });
  const admin = await person(`boss@${d}`);
  const r = await ops(`/ops/institutions/${uni.id}/admins`, { email: `boss@${d}` });
  expect((await r.json()).admins).toEqual([{ name: admin.user.name, email: `boss@${d}` }]);
  return { uni, d, admin };
}

describe('a university’s administrator', () => {
  it('sees the licence, its tier and monthly counts, and what it covers, but never who uses it', async () => {
    const { uni, d, admin } = await setup({ max: 50 });
    await me(await person(`a@${d}`)); await me(await person(`b@${d}`));
    const m = await me(admin);
    const ws = m.workspaces.find((w) => w.id === uni.id);
    expect(ws).toMatchObject({ kind: 'institution', role: 'admin' });
    const r = await call(`/v1/institutions/${uni.id}`, { token: admin.token });
    expect(r.status).toBe(200);
    const g = await r.json();
    expect(g).toMatchObject({ name: uni.name, licence: { active: true, max_users: 50, invoiced: false }, domains: [d], invites: [] });
    // the admin's own use counts as well: they are at the university
    expect(g.months).toEqual([{ month: monthOf(), users: 3 }]);
    expect(g.users_12_months).toBe(3);
    expect(JSON.stringify(g)).not.toContain(`a@${d}`);
  });

  it('is the only one who can: anyone else, at the university or not, gets nothing', async () => {
    const { uni, d } = await setup();
    for (const p of [await person(`x@${d}`), await person('y@gmail.com')]) {
      expect((await call(`/v1/institutions/${uni.id}`, { token: p.token })).status).toBe(404);
      expect((await post(p, `/v1/institutions/${uni.id}/invites`, { email: 'z@gmail.com' })).status).toBe(404);
      expect((await post(p, `/v1/institutions/${uni.id}/remove`, { email: `x@${d}` })).status).toBe(404);
    }
    expect((await call(`/v1/institutions/${uni.id}`)).status).toBe(401);
  });

  it('invites someone without a university address, who is covered when they sign in with it, until uninvited', async () => {
    const { uni, admin } = await setup();
    const vis = await person('Visitor@Gmail.com');
    expect((await me(vis)).licence).toBeNull();
    const r = await post(admin, `/v1/institutions/${uni.id}/invites`, { email: ' visitor@gmail.com ' });
    expect((await r.json()).invites.map((i) => i.email)).toEqual(['visitor@gmail.com']);
    expect((await me(vis)).licence).toEqual({ name: uni.name, via: 'invite' });
    expect((await post(admin, `/v1/institutions/${uni.id}/invites`, { email: 'nope' })).status).toBe(400);
    const del = await call(`/v1/institutions/${uni.id}/invites/${encodeURIComponent('visitor@gmail.com')}`, { method: 'DELETE', token: admin.token });
    expect((await del.json()).invites).toEqual([]);
    expect((await me(vis)).licence).toBeNull();
  });

  it('removes someone by email, with the same answer whether or not they have an account, and can restore them', async () => {
    const { uni, d, admin } = await setup();
    const leaver = await person(`leaver@${d}`);
    expect((await me(leaver)).licence).toMatchObject({ via: 'email' });
    const a = await post(admin, `/v1/institutions/${uni.id}/remove`, { email: `leaver@${d}` });
    const b = await post(admin, `/v1/institutions/${uni.id}/remove`, { email: `never-signed-up@${d}` });
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await a.json()).toEqual(await b.json());
    expect((await me(leaver)).licence).toBeNull();
    expect((await send(`/v1/workspaces/${leaver.workspaceId}/benches`, 'POST', leaver.token, { name: 'B', content: bench('B') })).status).toBe(402);
    await post(admin, `/v1/institutions/${uni.id}/restore`, { email: `leaver@${d}` });
    expect((await me(leaver)).licence).toMatchObject({ via: 'email' });
  });

  it('cannot save benches into the licence itself', async () => {
    const { uni, admin } = await setup();
    const r = await send(`/v1/workspaces/${uni.id}/benches`, 'POST', admin.token, { name: 'B', content: bench('B') });
    expect(r.status).toBe(403);
  });

  it('is appointed and stood down by JEK Systems, and must have an account first', async () => {
    const { uni, d, admin } = await setup();
    expect((await ops(`/ops/institutions/${uni.id}/admins`, { email: 'nobody@nowhere.ac.uk' })).status).toBe(404);
    await ops(`/ops/institutions/${uni.id}/admins`, { email: `boss@${d}`, remove: true });
    expect((await call(`/v1/institutions/${uni.id}`, { token: admin.token })).status).toBe(404);
  });
});
