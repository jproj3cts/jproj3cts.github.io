import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { purgeBin, BIN_MS, MAX_THUMB } from '../src/benches.js';
import { CONFIRM } from '../src/account.js';
import { bench, call, send, signedIn, withPlan } from './helpers.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 8, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38]);
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');

async function pro(name) {
  const s = await signedIn(name);
  await withPlan(s.workspaceId);
  return s;
}
async function make(s, name = 'Bench') {
  const r = await send(`/v1/workspaces/${s.workspaceId}/benches`, 'POST', s.token, { name, content: bench(name) });
  return (await r.json()).id;
}
const put = (s, id, body, type = 'image/png') =>
  call(`/v1/benches/${id}/thumb`, { method: 'PUT', token: s.token, body, headers: { 'Content-Type': type } });
const listed = async (s) => (await (await call(`/v1/workspaces/${s.workspaceId}/benches`, { token: s.token })).json()).benches;
const keys = async (prefix) => (await env.BENCHES.list({ prefix })).objects.map((o) => o.key);

afterEach(() => vi.restoreAllMocks());

describe('thumbnails', () => {
  it('stores one, lists its URL with the bench, and serves it back as an image only its people can see', async () => {
    const s = await pro('Ada');
    const id = await make(s);
    expect((await listed(s))[0].thumb).toBeNull();
    const r = await put(s, id, PNG);
    expect(r.status).toBe(200);
    const { thumb } = await r.json();
    expect(thumb).toMatch(new RegExp(`^/v1/benches/${id}/thumb\\?k=[0-9a-f]{32}$`));
    expect((await listed(s))[0].thumb).toBe(thumb);
    const got = await call(thumb, { token: s.token });
    expect(got.status).toBe(200);
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(PNG);
    expect(got.headers.get('Content-Type')).toBe('image/png');
    expect(got.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
    expect(got.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(got.headers.get('Content-Security-Policy')).toContain('sandbox');
    // someone else, and no one signed in, cannot
    const other = await pro('Eve');
    expect((await call(thumb, { token: other.token })).status).toBe(404);
    expect((await call(thumb)).status).toBe(401);
  });

  it('replaces the old one, leaving one image per bench, under a new URL', async () => {
    const s = await pro('Ada');
    const id = await make(s);
    const a = (await (await put(s, id, PNG)).json()).thumb;
    const b = (await (await put(s, id, WEBP, 'image/webp')).json()).thumb;
    expect(b).not.toBe(a);
    expect(await keys(`w/${s.workspaceId}/b/${id}/t/`)).toHaveLength(1);
    const got = await call(b, { token: s.token });
    expect(got.headers.get('Content-Type')).toBe('image/webp');
  });

  it('refuses anything that is not an image, whatever it says it is, and anything too big', async () => {
    const s = await pro('Ada');
    const id = await make(s);
    expect((await put(s, id, HTML, 'image/png')).status).toBe(415);
    expect((await put(s, id, new Uint8Array(0))).status).toBe(415);
    const big = new Uint8Array(MAX_THUMB + 1); big.set(PNG);
    expect((await put(s, id, big)).status).toBe(413);
    expect(await keys(`w/${s.workspaceId}/b/${id}/t/`)).toHaveLength(0);
  });

  it('needs an active plan and a role that may change the bench, and an allowed origin', async () => {
    const s = await signedIn('Ada');
    await withPlan(s.workspaceId);
    const id = await make(s);
    await withPlan(s.workspaceId, 'canceled', Date.now() - 1000);
    expect((await put(s, id, PNG)).status).toBe(402);
    await withPlan(s.workspaceId);
    expect((await call(`/v1/benches/${id}/thumb`, { method: 'PUT', token: s.token, body: PNG, origin: 'https://evil.example' })).status).toBe(403);
    const other = await pro('Eve');
    expect((await put(other, id, PNG)).status).toBe(404);
  });

  it('goes when the bin is emptied, and when the account is deleted', async () => {
    const s = await pro('Ada');
    const a = await make(s, 'A'), b = await make(s, 'B');
    await put(s, a, PNG); await put(s, b, PNG);
    await call(`/v1/benches/${a}`, { method: 'DELETE', token: s.token });
    await purgeBin(env, Date.now() + BIN_MS + 1000);
    expect(await keys(`w/${s.workspaceId}/b/${a}/`)).toEqual([]);
    expect(await keys(`w/${s.workspaceId}/b/${b}/t/`)).toHaveLength(1);
    // Stripe, stood in for: cancelling the subscription
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ id: 'sub', status: 'canceled' }), { headers: { 'Content-Type': 'application/json' } }));
    const r = await call('/v1/me', { method: 'DELETE', token: s.token, body: JSON.stringify({ confirm: CONFIRM }), headers: { 'Content-Type': 'application/json' } });
    expect(r.status).toBe(200);
    expect(await keys(`w/${s.workspaceId}/`)).toEqual([]);
  });

  it('leaves every other response uncached', async () => {
    const s = await pro('Ada');
    expect((await call('/v1/me', { token: s.token })).headers.get('Cache-Control')).toBe('no-store');
  });
});
