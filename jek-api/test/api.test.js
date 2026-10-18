import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { planActive } from '../src/users.js';
import { sha256 } from '../src/util.js';
import { APP, call, signedIn } from './helpers.js';

const DAY = 24 * 60 * 60 * 1000;

describe('basics', () => {
  it('reports health', async () => {
    const res = await call('/v1/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('answers unknown paths and wrong methods with JSON errors', async () => {
    let res = await call('/v1/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: expect.any(String) } });
    res = await call('/v1/health', { method: 'DELETE' });
    expect(res.status).toBe(405);
  });
});

describe('CORS and origin', () => {
  it('allows credentialed CORS for the app only', async () => {
    let res = await call('/v1/health');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    res = await call('/v1/health', { origin: 'https://evil.example' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('answers preflights for the app and refuses others', async () => {
    let res = await call('/v1/me', { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'PUT' } });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('If-Match');
    res = await call('/v1/me', { method: 'OPTIONS', origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });

  it('refuses writes from another origin or none, even when signed in', async () => {
    const { token } = await signedIn();
    for (const origin of ['https://evil.example', null]) {
      const res = await call('/auth/signout', { method: 'POST', origin, token });
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe('bad_origin');
    }
    // The session survived both attempts.
    expect((await call('/v1/me', { token })).status).toBe(200);
  });
});

describe('sessions', () => {
  it('needs a session for /me', async () => {
    for (const token of [undefined, 'garbage', 'a'.repeat(64)]) {
      const res = await call('/v1/me', { token });
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe('signed_out');
    }
  });

  it('returns the user and their personal workspace', async () => {
    const { user, workspaceId, token } = await signedIn('Grace');
    const res = await call('/v1/me', { token });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ id: user.id, name: 'Grace' });
    expect(body.identities).toEqual([]);
    expect(body.workspaces).toEqual([
      { id: workspaceId, kind: 'personal', name: 'Grace', role: 'owner', plan: null, active: false },
    ]);
  });

  it('shows a mirrored subscription as active', async () => {
    const { workspaceId, token } = await signedIn();
    await env.DB.prepare("INSERT INTO subscriptions (workspace_id, stripe_customer, stripe_subscription, plan, seats, status, period_end, updated_at) VALUES (?, 'cus_1', 'sub_1', 'individual', 1, 'active', ?, 0)")
      .bind(workspaceId, Date.now() + 30 * DAY).run();
    const ws = (await (await call('/v1/me', { token })).json()).workspaces[0];
    expect(ws.plan).toMatchObject({ plan: 'individual', status: 'active', seats: 1 });
    expect(ws.active).toBe(true);
  });

  it('stores only the hash of the token', async () => {
    const { user, token } = await signedIn();
    const row = await env.DB.prepare('SELECT token_hash FROM sessions WHERE user_id = ?').bind(user.id).first();
    expect(row.token_hash).toBe(await sha256(token));
    expect(row.token_hash).not.toBe(token);
  });

  it('refuses and removes an expired session', async () => {
    const { user, token } = await signedIn();
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?').bind(Date.now() - 1, user.id).run();
    expect((await call('/v1/me', { token })).status).toBe(401);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').bind(user.id).first();
    expect(n.n).toBe(0);
  });

  it('renews a session that is more than a day old', async () => {
    const { user, token } = await signedIn();
    const old = Date.now() + 20 * DAY;
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?').bind(old, user.id).run();
    const res = await call('/v1/me', { token });
    const set = res.headers.get('Set-Cookie');
    expect(set).toContain(`jek_session=${token}`);
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/Secure/);
    expect(set).toMatch(/SameSite=Lax/);
    expect(set).not.toMatch(/Domain=/i); // host-only
    const row = await env.DB.prepare('SELECT expires_at FROM sessions WHERE user_id = ?').bind(user.id).first();
    expect(row.expires_at).toBeGreaterThan(old + 9 * DAY);
    // A fresh session is not rewritten on every call.
    const fresh = await signedIn();
    expect((await call('/v1/me', { token: fresh.token })).headers.get('Set-Cookie')).toBeNull();
  });

  it('does not let a deleted user in', async () => {
    const { user, token } = await signedIn();
    await env.DB.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').bind(Date.now(), user.id).run();
    expect((await call('/v1/me', { token })).status).toBe(401);
  });

  it('signs out: deletes the session and clears the cookie', async () => {
    const { token } = await signedIn();
    const other = await signedIn();
    const res = await call('/auth/signout', { method: 'POST', token });
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toMatch(/jek_session=;.*Max-Age=0/);
    expect((await call('/v1/me', { token })).status).toBe(401);
    // Other people's sessions are untouched.
    expect((await call('/v1/me', { token: other.token })).status).toBe(200);
  });
});

describe('plan state', () => {
  const t = 1_000_000_000_000;
  it('counts active and trialing, and past_due within 7 days of period end', () => {
    expect(planActive(null, t)).toBe(false);
    expect(planActive({ status: 'active' }, t)).toBe(true);
    expect(planActive({ status: 'trialing' }, t)).toBe(true);
    expect(planActive({ status: 'past_due', period_end: t - 6 * DAY }, t)).toBe(true);
    expect(planActive({ status: 'past_due', period_end: t - 8 * DAY }, t)).toBe(false);
    expect(planActive({ status: 'canceled', period_end: t + DAY }, t)).toBe(false);
  });
});
