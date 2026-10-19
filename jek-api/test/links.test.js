import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { call, send, signedIn, withPlan } from './helpers.js';

const json = async (res) => ({ status: res.status, body: await res.json() });
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// a bench as the app puts it in a link: "z" then its JSON deflated, in base64url
async function linkData(bench = { format: 'jek-raytracer', version: 1, name: 'Shared', elements: [{ id: 'l', type: 'lens', name: 'L', x: 1, y: 2 }] }) {
  const raw = new TextEncoder().encode(JSON.stringify(bench));
  return 'z' + b64u(new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()));
}
async function pro(name) {
  const s = await signedIn(name);
  await withPlan(s.workspaceId);
  return s;
}
const make = async (s, body) => json(await send('/v1/links', 'POST', s.token, body));

afterEach(() => vi.restoreAllMocks());

describe('share links', () => {
  it('a plan makes a short link; anyone opens it without signing in, and it counts its opens', async () => {
    const s = await pro('Ada');
    const data = await linkData();
    const r = await make(s, { name: 'Michelson', data });
    expect(r.status).toBe(201);
    expect(r.body.id).toMatch(/^[A-Z2-7]{10}$/);
    expect(r.body).toMatchObject({ name: 'Michelson', size_bytes: data.length, opens: 0 });
    const o = await json(await call(`/v1/links/${r.body.id}`));
    expect(o.status).toBe(200);
    expect(o.body).toMatchObject({ id: r.body.id, name: 'Michelson', data });
    // the id is read whatever its case, as a QR code's capitals or a typed lower case
    expect((await call(`/v1/links/${r.body.id.toLowerCase()}`)).status).toBe(200);
    const l = (await json(await call('/v1/me/links', { token: s.token }))).body.links;
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ id: r.body.id, opens: 2 });
    expect(l[0].data).toBeUndefined();
  });

  it('without a plan, no link is made; signed out, neither; a link made before still opens after the plan ends', async () => {
    const free = await signedIn('Bo');
    const r = await make(free, { name: 'x', data: await linkData() });
    expect([r.status, r.body.error.code]).toEqual([402, 'no_plan']);
    expect((await call('/v1/links', { method: 'POST', body: JSON.stringify({ data: await linkData() }), headers: { 'Content-Type': 'application/json' } })).status).toBe(401);
    const s = await pro('Cy');
    const id = (await make(s, { name: 'Kept', data: await linkData() })).body.id;
    await env.DB.prepare("UPDATE subscriptions SET status = 'canceled', period_end = 0 WHERE workspace_id = ?").bind(s.workspaceId).run();
    expect((await make(s, { name: 'New', data: await linkData() })).status).toBe(402);
    expect((await call(`/v1/links/${id}`)).status).toBe(200);
    // the list and deleting need no plan
    expect((await json(await call('/v1/me/links', { token: s.token }))).body.links).toHaveLength(1);
    expect((await call(`/v1/links/${id}`, { method: 'DELETE', token: s.token })).status).toBe(200);
  });

  it('a paid seat in a team makes links too; a team’s free viewer does not', async () => {
    const owner = await signedIn('Owner');
    const team = await json(await send('/v1/teams', 'POST', owner.token, { name: 'Lab' }));
    await withPlan(team.body.id);
    // the owner of a team with a plan has a plan through it
    expect((await make(owner, { name: 'Team link', data: await linkData() })).status).toBe(201);
    const join = async (name, role, seat) => {
      const s = await signedIn(name);
      await env.DB.prepare('INSERT INTO members (workspace_id, user_id, role, seat, created_at) VALUES (?, ?, ?, ?, 0)').bind(team.body.id, s.user.id, role, seat).run();
      return s;
    };
    // an editor takes a paid seat
    expect((await make(await join('Editor', 'editor', 1), { name: 'Editor link', data: await linkData() })).status).toBe(201);
    // a viewer takes none: belonging to a team with a plan is not a plan
    const r = await make(await join('Viewer', 'viewer', 0), { name: 'Free ride', data: await linkData() });
    expect([r.status, r.body.error.code]).toEqual([402, 'no_plan']);
  });

  it('refuses what is not a link’s bench, and anything over 1 MB', async () => {
    const s = await pro('Di');
    for (const data of [undefined, 42, '', 'x123', 'z<script>', 'p' + 'A'.repeat(10)]) {
      expect((await make(s, { name: 'x', data })).body.error.code).toBe('bad_link');
    }
    expect((await make(s, { name: 'x', data: 'z' + 'A'.repeat(1024 * 1024 + 10) })).status).toBe(413);
    expect((await json(await call('/v1/me/links', { token: s.token }))).body.links).toEqual([]);
  });

  it('only its maker can delete a link; then it no longer opens', async () => {
    const a = await pro('Ed'), b = await pro('Flo');
    const id = (await make(a, { name: 'Mine', data: await linkData() })).body.id;
    expect((await call(`/v1/links/${id}`, { method: 'DELETE', token: b.token })).status).toBe(404);
    expect((await json(await call('/v1/me/links', { token: b.token }))).body.links).toEqual([]);
    expect((await call(`/v1/links/${id}`, { method: 'DELETE', token: a.token })).status).toBe(200);
    const o = await json(await call(`/v1/links/${id}`));
    expect([o.status, o.body.error.code]).toEqual([404, 'not_found']);
    // an id that is not one is not found either, without a lookup
    expect((await call('/v1/links/not-an-id')).status).toBe(404);
  });

  it('go with the account, and come with its export', async () => {
    const s = await pro('Gil');
    const id = (await make(s, { name: 'Exported', data: await linkData() })).body.id;
    const zip = new Uint8Array(await (await call('/v1/me/export', { token: s.token })).arrayBuffer());
    const text = new TextDecoder('latin1').decode(zip);
    expect(text).toContain(`Share links/Exported (${id}).jekray`);
    expect(text).toContain('Share links/links.json');
    const key = (await env.DB.prepare('SELECT r2_key FROM share_links WHERE id = ?').bind(id).first()).r2_key;
    // Stripe, asked to cancel the plan, answers as it would
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ id: 'sub', status: 'canceled' }), { headers: { 'Content-Type': 'application/json' } }));
    expect((await call('/v1/me', { method: 'DELETE', token: s.token, body: JSON.stringify({ confirm: 'delete my account' }), headers: { 'Content-Type': 'application/json' } })).status).toBe(200);
    expect((await call(`/v1/links/${id}`)).status).toBe(404);
    expect(await env.BENCHES.get(key)).toBeNull();
  });
});
