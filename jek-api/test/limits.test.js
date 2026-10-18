import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { bench, call, send, signedIn, withPlan } from './helpers.js';

const OPS = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('rate limits', () => {
  it('hold back a flood of sign-ins from one address, and no one else', async () => {
    const ip = { 'CF-Connecting-IP': '192.0.2.1' };
    const codes = [];
    for (let i = 0; i < 65; i++) codes.push((await call('/auth/google/start', { origin: null, headers: ip })).status);
    expect(codes.slice(0, 60).every((c) => c === 302)).toBe(true);
    expect(codes.slice(60)).toEqual([429, 429, 429, 429, 429]);
    const last = await call('/auth/google/start', { origin: null, headers: ip });
    expect(last.headers.get('Retry-After')).toBe('60');
    expect((await call('/auth/google/start', { origin: null, headers: { 'CF-Connecting-IP': '192.0.2.2' } })).status).toBe(302);
  });

  it('hold back the operations routes per address, even with the right token', async () => {
    const h = { 'CF-Connecting-IP': '192.0.2.3', Authorization: `Bearer ${OPS}` };
    let last;
    for (let i = 0; i < 31; i++) last = await call('/ops/institutions', { origin: null, headers: h });
    expect(last.status).toBe(429);
  });

  it('give each person their own allowance for slow actions', async () => {
    const a = await signedIn('Ada'), b = await signedIn('Bea');
    const go = (s) => call('/v1/me/export', { token: s.token });
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await go(a)).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
    expect((await go(b)).status).toBe(200);
  });

  it('cap a request body however it is sent', async () => {
    const s = await signedIn('Ada');
    await withPlan(s.workspaceId);
    const big = JSON.stringify({ name: 'B', content: bench('B', { pad: 'x'.repeat(2.5 * 1024 * 1024) }) });
    // a streamed body says no length
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
    const r = await call(`/v1/workspaces/${s.workspaceId}/benches`, { method: 'POST', token: s.token, body: stream, headers: { 'Content-Type': 'application/json' } });
    expect(r.status).toBe(413);
    expect((await send(`/v1/workspaces/${s.workspaceId}/benches`, 'POST', s.token, { name: 'B', content: bench('B') })).status).toBe(201);
  });

  it('send headers that keep API answers from being treated as pages', async () => {
    const r = await call('/v1/health');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(r.headers.get('X-Frame-Options')).toBe('DENY');
    expect(r.headers.get('Strict-Transport-Security')).toMatch(/max-age=/);
  });

  it('let a sign-in state be used once only', async () => {
    const start = await call('/auth/orcid/start', { origin: null });
    const state = start.headers.getSetCookie().find((c) => c.startsWith('jek_oauth=')).split(';')[0].slice(10);
    const n = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM oauth_states').first()).n;
    const before = await n();
    await call(`/auth/orcid/callback?state=${state}&error=access_denied`, { origin: null, headers: { Cookie: `jek_oauth=${state}` } });
    expect(await n()).toBe(before - 1);
    const again = await call(`/auth/orcid/callback?state=${state}&code=x`, { origin: null, headers: { Cookie: `jek_oauth=${state}` } });
    expect(new URL(again.headers.get('Location')).searchParams.get('jekauth')).toBe('expired');
  });
});
