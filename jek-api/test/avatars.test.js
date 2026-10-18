import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { CONFIRM } from '../src/account.js';
import { bench, call, send, signedIn, withPlan } from './helpers.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');
const put = (s, body, type = 'image/png') => call('/v1/me/avatar', { method: 'PUT', token: s.token, body, headers: { 'Content-Type': type } });
const me = async (s) => (await call('/v1/me', { token: s.token })).json();
const keys = async (prefix) => (await env.BENCHES.list({ prefix })).objects.map((o) => o.key);

describe('profile pictures', () => {
  it('are stored, named in /v1/me, served to the person and those they share a workspace with, and replaced', async () => {
    const s = await signedIn('Ada'), mate = await signedIn('Ben'), other = await signedIn('Out');
    expect((await me(s)).user.avatar).toBeNull();
    let r = await put(s, PNG);
    expect(r.status).toBe(200);
    const { avatar } = await r.json();
    expect(avatar).toMatch(new RegExp(`^/v1/users/${s.user.id}/avatar\\?k=[0-9a-f]{32}$`));
    expect((await me(s)).user.avatar).toBe(avatar);
    const got = await call(avatar, { token: s.token });
    expect(got.status).toBe(200);
    expect(got.headers.get('Content-Type')).toBe('image/png');
    expect(got.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(PNG);
    // a stranger cannot see it; a workspace mate can
    expect((await call(avatar, { token: other.token })).status).toBe(404);
    expect((await call(avatar)).status).toBe(401);
    await env.DB.prepare("INSERT INTO members VALUES (?, ?, 'viewer', 0, 0)").bind(s.workspaceId, mate.user.id).run();
    expect((await call(avatar, { token: mate.token })).status).toBe(200);
    // replaced: one object in R2, the old URL gone
    r = await put(s, PNG);
    const { avatar: next } = await r.json();
    expect(next).not.toBe(avatar);
    expect(await keys(`u/${s.user.id}/`)).toHaveLength(1);
    // removed
    expect((await send('/v1/me/avatar', 'DELETE', s.token, {})).status).toBe(200);
    expect((await me(s)).user.avatar).toBeNull();
    expect(await keys(`u/${s.user.id}/`)).toHaveLength(0);
  });

  it('must be a small image', async () => {
    const s = await signedIn();
    expect((await put(s, HTML, 'image/png')).status).toBe(415);
    expect((await put(s, new Uint8Array(70 * 1024))).status).toBe(413);
    expect(await keys(`u/${s.user.id}/`)).toHaveLength(0);
  });

  it('show beside the people on a bench, and go with a deleted account', async () => {
    const s = await signedIn('Ada');
    await withPlan(s.workspaceId);
    await env.DB.prepare("UPDATE subscriptions SET stripe_customer = 'manual', stripe_subscription = NULL WHERE workspace_id = ?").bind(s.workspaceId).run();
    const { avatar } = await (await put(s, PNG)).json();
    const b = await (await send(`/v1/workspaces/${s.workspaceId}/benches`, 'POST', s.token, { name: 'B', content: bench() })).json();
    const listed = (await (await call(`/v1/workspaces/${s.workspaceId}/benches`, { token: s.token })).json()).benches[0];
    expect(listed.updated_by).toEqual({ id: s.user.id, name: 'Ada', avatar });
    expect(b.id).toBeTruthy();
    expect((await send('/v1/me', 'DELETE', s.token, { confirm: CONFIRM })).status).toBe(200);
    expect(await keys(`u/${s.user.id}/`)).toHaveLength(0);
  });

  it('the name can be changed', async () => {
    const s = await signedIn('Ada');
    const r = await send('/v1/me', 'PATCH', s.token, { name: '  Ada   Lovelace ' });
    expect(r.status).toBe(200);
    expect((await r.json()).user.name).toBe('Ada Lovelace');
    expect((await send('/v1/me', 'PATCH', s.token, { name: '' })).status).toBe(400);
  });
});
