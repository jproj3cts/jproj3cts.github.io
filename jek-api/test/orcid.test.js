import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { purgeOrcid } from '../src/orcid.js';
import { createSession } from '../src/sessions.js';
import { createUser } from '../src/users.js';
import { call, send } from './helpers.js';

// ORCID is off (as in production): existing ORCID accounts may sign in until
// ORCID_LEGACY_UNTIL; nothing new is made or linked with it, and nothing reads it.
const cookieValue = (res, name) => {
  const c = res.headers.getSetCookie().find((x) => x.startsWith(name + '='));
  return c && c.slice(name.length + 1).split(';')[0];
};
function orcidReplies(orcid, name = 'A Person') {
  const calls = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ access_token: 'x', orcid, name }), { headers: { 'Content-Type': 'application/json' } });
  });
  return calls;
}
async function signInWithOrcid(orcid, { link, token } = {}) {
  const start = await call(`/auth/orcid/start${link ? '?link=1' : ''}`, { origin: null, token });
  const first = new URL(start.headers.get('Location'));
  if (first.origin !== 'https://orcid.org') return { outcome: first.searchParams.get('jekauth') };
  const state = cookieValue(start, 'jek_oauth');
  orcidReplies(orcid);
  const res = await call(`/auth/orcid/callback?state=${state}&code=c`, { origin: null, headers: { Cookie: `jek_oauth=${state}` + (token ? `; jek_session=${token}` : '') } });
  vi.restoreAllMocks();
  return { outcome: new URL(res.headers.get('Location')).searchParams.get('jekauth'), session: cookieValue(res, 'jek_session') };
}
async function orcidAccount(orcid) {
  const { user } = await createUser(env, { name: 'Orcid Only', identity: { provider: 'orcid', subject: orcid } });
  return user;
}
const users = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n;
afterEach(() => vi.restoreAllMocks());

describe('ORCID, switched off', () => {
  it('makes no new account', async () => {
    const before = await users();
    const r = await signInWithOrcid('0000-0001-0000-0001');
    expect(r.outcome).toBe('orcid_closed');
    expect(r.session).toBeUndefined();
    expect(await users()).toBe(before);
  });

  it('lets an existing ORCID account sign in until the cut-off, and says when it ends', async () => {
    const u = await orcidAccount('0000-0001-0000-0002');
    const r = await signInWithOrcid('0000-0001-0000-0002');
    expect(r.outcome).toBe('signed_in');
    const me = await (await call('/v1/me', { token: r.session })).json();
    expect(me.user.id).toBe(u.id);
    expect(me.orcid_ends).toBe(Date.parse(env.ORCID_LEGACY_UNTIL));
  });

  it('links ORCID to no account', async () => {
    const { user } = await createUser(env, { name: 'G', email: 'g@example.com' });
    const { token } = await createSession(env, user.id, 'vitest');
    expect((await signInWithOrcid('0000-0001-0000-0003', { link: true, token })).outcome).toBe('unavailable');
    const ids = (await (await call('/v1/me', { token })).json()).identities;
    expect(ids).toEqual([]);
  });

  it('reads nothing from ORCID for the academic price or a university licence', async () => {
    const u = await orcidAccount('0000-0001-0000-0004');
    const { token } = await createSession(env, u.id, 'vitest');
    const calls = orcidReplies('0000-0001-0000-0004');
    const a = await call('/v1/me/academic', { method: 'POST', token });
    expect(a.status).toBe(403);
    expect((await a.json()).error.message).not.toMatch(/ORCID/);
    expect((await call('/v1/me/institution', { method: 'POST', token })).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it('closes after the cut-off, and the daily clear-out removes what came from ORCID', async () => {
    const u = await orcidAccount('0000-0001-0000-0005');
    await env.DB.prepare("UPDATE users SET academic_until = ?, academic_via = 'ORCID: A University' WHERE id = ?").bind(Date.now() + 1e10, u.id).run();
    const was = env.ORCID_LEGACY_UNTIL;
    env.ORCID_LEGACY_UNTIL = new Date(Date.now() - 1000).toISOString();
    try {
      expect((await signInWithOrcid('0000-0001-0000-0005')).outcome).toBe('orcid_closed');
      expect(await purgeOrcid(env)).toBe(true);
      expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM identities WHERE provider = 'orcid'").first()).toEqual({ n: 0 });
      expect(await env.DB.prepare('SELECT academic_until, academic_via FROM users WHERE id = ?').bind(u.id).first()).toEqual({ academic_until: null, academic_via: null });
    } finally {
      env.ORCID_LEGACY_UNTIL = was;
    }
    // and before the cut-off, the clear-out does nothing
    expect(await purgeOrcid(env)).toBe(false);
  });
});
