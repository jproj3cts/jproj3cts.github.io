import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { call, send, signedIn, withPlan } from './helpers.js';

const json = async (res) => ({ status: res.status, body: await res.json() });
const clip = (n = 1, extra = {}) => JSON.stringify({ format: 'jekray-clip', version: 1, from: 'b1',
  elements: Array.from({ length: n }, (_, i) => ({ id: 'e' + i, type: 'lens', name: 'Lens ' + i, x: i * 10, y: 0 })), fibres: [], ...extra });
const ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
async function pro(name) {
  const s = await signedIn(name);
  await withPlan(s.workspaceId);
  return s;
}
const save = async (s, body) => json(await send(`/v1/workspaces/${s.workspaceId}/parts`, 'POST', s.token, body));
const lib = async (s) => (await json(await call(`/v1/workspaces/${s.workspaceId}/parts`, { token: s.token }))).body;

describe('My parts', () => {
  it('keeps a part, lists it with its picture but not its content, and gives it back whole', async () => {
    const s = await pro('Ada');
    const r = await save(s, { name: 'f = 75 mm, AR coated', summary: 'Lens', palette: 'free', content: clip(), icon: ICON });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ name: 'f = 75 mm, AR coated', summary: 'Lens', palette: 'free', icon: ICON });
    const l = await lib(s);
    expect(l.parts).toHaveLength(1);
    expect(l.parts[0].content).toBeUndefined();
    const got = (await json(await call(`/v1/parts/${r.body.id}`, { token: s.token }))).body;
    expect(got.content).toBe(clip());
  });

  it('counts parts against the storage quota', async () => {
    const s = await pro('Ada');
    await save(s, { name: 'P', content: clip(3) });
    const u = (await json(await call(`/v1/workspaces/${s.workspaceId}/benches`, { token: s.token }))).body.usage.bytes;
    expect(u).toBe(new TextEncoder().encode(clip(3)).length);
  });

  it('refuses what is not a part, a picture that is not a small PNG, and anything over 256 KB', async () => {
    const s = await pro('Ada');
    for (const content of ['nope', JSON.stringify({ format: 'jek-raytracer', elements: [] }), JSON.stringify({ format: 'jekray-clip', elements: [] }),
      JSON.stringify({ format: 'jekray-clip', elements: [1] }), 42]) {
      expect((await save(s, { name: 'x', content })).status).toBe(400);
    }
    expect((await save(s, { name: 'x', content: clip(), icon: 'data:image/svg+xml;base64,PHN2Zz4=' })).body.error.code).toBe('bad_icon');
    expect((await save(s, { name: 'x', content: clip(), icon: 'javascript:alert(1)' })).body.error.code).toBe('bad_icon');
    expect((await save(s, { name: 'x', content: clip(), icon: 'data:image/png;base64,' + 'A'.repeat(30000) })).body.error.code).toBe('bad_icon');
    expect((await save(s, { name: 'x', content: clip(1, { pad: 'x'.repeat(270000) }) })).status).toBe(413);
    expect((await lib(s)).parts).toEqual([]);
  });

  it('keeping needs a plan; listing, using and deleting do not', async () => {
    const s = await pro('Ada');
    const p = (await save(s, { name: 'Kept', content: clip() })).body;
    await env.DB.prepare("UPDATE subscriptions SET status = 'canceled', period_end = 0 WHERE workspace_id = ?").bind(s.workspaceId).run();
    expect((await save(s, { name: 'New', content: clip() })).status).toBe(402);
    expect((await json(await send(`/v1/parts/${p.id}`, 'PATCH', s.token, { name: 'Renamed' }))).status).toBe(402);
    const l = await lib(s);
    expect([l.parts.length, l.active]).toEqual([1, false]);
    expect((await call(`/v1/parts/${p.id}`, { token: s.token })).status).toBe(200);
    expect((await call(`/v1/parts/${p.id}`, { method: 'DELETE', token: s.token })).status).toBe(200);
    expect((await lib(s)).parts).toEqual([]);
  });

  it('renames, cleaning the name', async () => {
    const s = await pro('Ada');
    const p = (await save(s, { name: 'A', content: clip() })).body;
    const r = await json(await send(`/v1/parts/${p.id}`, 'PATCH', s.token, { name: '  Telescope\u0007 ×3 ' }));
    expect(r.body.name).toBe('Telescope ×3');
    expect((await json(await send(`/v1/parts/${p.id}`, 'PATCH', s.token, { name: '' }))).status).toBe(400);
  });

  it('holds at most 500', async () => {
    const s = await pro('Ada');
    const stmt = env.DB.prepare("INSERT INTO parts (id, workspace_id, name, summary, palette, content, size_bytes, created_at, created_by, updated_at) VALUES (?, ?, 'p', 'Part', 'free', '{}', 2, 0, ?, 0)");
    await env.DB.batch(Array.from({ length: 500 }, (_, i) => stmt.bind(s.workspaceId.slice(0, 26) + String(i).padStart(6, '0'), s.workspaceId, s.user.id)));
    expect((await save(s, { name: 'One more', content: clip() })).body.error.code).toBe('too_many');
  });

  it('are nobody else’s to see, use, rename or delete', async () => {
    const a = await pro('Ada'), e = await pro('Eve');
    const p = (await save(a, { name: 'Secret part', content: clip() })).body;
    expect((await call(`/v1/workspaces/${a.workspaceId}/parts`, { token: e.token })).status).toBe(404);
    expect((await save({ ...e, workspaceId: a.workspaceId }, { name: 'x', content: clip() })).status).toBe(404);
    for (const [m, body] of [['GET'], ['PATCH', { name: 'x' }], ['DELETE']]) {
      const r = await call(`/v1/parts/${p.id}`, { method: m, token: e.token, body: body && JSON.stringify(body), headers: body ? { 'Content-Type': 'application/json' } : {} });
      expect([m, r.status]).toEqual([m, 404]);
      expect(await r.text()).not.toContain('Secret');
    }
    // signed out, and from another website
    expect((await call(`/v1/parts/${p.id}`)).status).toBe(401);
    expect((await call(`/v1/parts/${p.id}`, { method: 'DELETE', token: a.token, origin: 'https://evil.example' })).status).toBe(403);
    expect((await lib(a)).parts.map((x) => x.name)).toEqual(['Secret part']);
  });

  it('go with the account’s export, and with the account', async () => {
    const s = await pro('Ada');
    await save(s, { name: 'Telescope', summary: '2 parts', content: clip(2) });
    const zip = new Uint8Array(await (await call('/v1/me/export', { token: s.token })).arrayBuffer());
    const text = new TextDecoder('latin1').decode(zip);
    expect(text).toContain('My benches/My parts/Telescope.jekpart');
    expect(text).toContain('"summary":"2 parts"');
    await env.DB.prepare('DELETE FROM workspaces WHERE id = ?').bind(s.workspaceId).run();
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM parts WHERE workspace_id = ?').bind(s.workspaceId).first()).n).toBe(0);
  });
});
