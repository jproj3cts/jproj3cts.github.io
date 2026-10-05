import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { safeReturn } from '../src/auth.js';
import { sha256 } from '../src/util.js';
import { API, APP, call, signedIn, orcidOnFor } from './helpers.js';

const APP_URL = 'https://jeksys.net/jek/tools/jekray2d.html';

const b64url = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const idToken = (claims) =>
  ['e30', b64url(JSON.stringify({
    iss: 'https://accounts.google.com',
    aud: env.GOOGLE_CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  })), 'sig'].join('.');

// Stands in for the provider's token endpoint; records what was sent to it.
function provider(reply, status = 200) {
  const sent = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    sent.push({ url: String(url), body: new URLSearchParams(String(init.body)) });
    return new Response(JSON.stringify(reply), { status, headers: { 'Content-Type': 'application/json' } });
  });
  return sent;
}

const cookies = (res) => res.headers.getSetCookie();
const cookieValue = (res, name) => {
  const c = cookies(res).find((x) => x.startsWith(name + '='));
  return c && c.slice(name.length + 1).split(';')[0];
};

// Runs /start, returning the provider redirect, the state and its cookie.
async function begin(name, { ret, token, link } = {}) {
  const q = new URLSearchParams();
  if (ret) q.set('return', ret);
  if (link) q.set('link', '1');
  const res = await call(`/auth/${name}/start?${q}`, { origin: null, token });
  return { res, to: new URL(res.headers.get('Location')), state: cookieValue(res, 'jek_oauth') };
}

async function finish(name, state, { code = 'the-code', jar = state, error, token } = {}) {
  const q = new URLSearchParams({ state });
  if (code) q.set('code', code);
  if (error) q.set('error', error);
  const headers = {};
  const parts = [];
  if (jar) parts.push(`jek_oauth=${jar}`);
  if (token) parts.push(`jek_session=${token}`);
  if (parts.length) headers.Cookie = parts.join('; ');
  const res = await call(`/auth/${name}/callback?${q}`, { origin: null, headers });
  const to = new URL(res.headers.get('Location'));
  return { res, to, outcome: to.searchParams.get('jekauth'), session: cookieValue(res, 'jek_session') };
}

afterEach(() => vi.restoreAllMocks());

describe('start', () => {
  it('sends the person to Google with state, PKCE and the exact callback', async () => {
    const { res, to, state } = await begin('google');
    expect(res.status).toBe(302);
    expect(to.origin + to.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const q = to.searchParams;
    expect(q.get('client_id')).toBe(env.GOOGLE_CLIENT_ID);
    expect(q.get('redirect_uri')).toBe(`${API}/auth/google/callback`);
    expect(q.get('scope')).toBe('openid email profile');
    expect(q.get('state')).toBe(state);
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const set = cookies(res).find((c) => c.startsWith('jek_oauth='));
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Lax/);
    expect(set).toMatch(/Path=\/auth/);
    // Only the hash of the state is used as the key.
    const has = async (h) => (await env.DB.prepare('SELECT COUNT(*) AS n FROM oauth_states WHERE hash = ?').bind(h).first()).n;
    expect(await has(state)).toBe(0);
    expect(await has(await sha256(state))).toBe(1);
  });

  it('sends the person to ORCID with the authenticate scope', async () => {
    const { to } = await begin('orcid');
    expect(to.origin + to.pathname).toBe('https://orcid.org/oauth/authorize');
    expect(to.searchParams.get('client_id')).toBe(env.ORCID_CLIENT_ID);
    expect(to.searchParams.get('scope')).toBe('/authenticate');
    expect(to.searchParams.get('redirect_uri')).toBe(`${API}/auth/orcid/callback`);
  });

  it('refuses unknown providers', async () => {
    expect((await call('/auth/github/start', { origin: null })).status).toBe(404);
  });

  it('only returns to pages of the app', () => {
    expect(safeReturn(env, null)).toBe(APP_URL);
    expect(safeReturn(env, 'https://jeksys.net/jek/tools/jekray2d.html?x=1#p=abc')).toBe(
      'https://jeksys.net/jek/tools/jekray2d.html?x=1',
    );
    for (const bad of ['https://evil.example/', '//evil.example', 'javascript:alert(1)', '/relative', 'https://jeksys.net.evil.example/']) {
      expect(safeReturn(env, bad)).toBe(APP_URL);
    }
  });
});

describe('Google sign-in', () => {
  it('creates an account on first sign-in and signs the person in', async () => {
    const { state, to: auth } = await begin('google', { ret: `${APP}/jek/tools/jekray2d.html?embed=0` });
    const sent = provider({ id_token: idToken({ sub: 'g-100', name: 'Ada Lovelace', email: 'ada@example.ac.uk', email_verified: true }) });
    const { res, to, outcome, session } = await finish('google', state);
    expect(res.status).toBe(302);
    expect(outcome).toBe('signed_in');
    expect(to.origin + to.pathname).toBe(`${APP}/jek/tools/jekray2d.html`);
    expect(to.searchParams.get('embed')).toBe('0');
    // The code was exchanged with the secret, the verifier and the same callback.
    expect(sent[0].url).toBe('https://oauth2.googleapis.com/token');
    expect(sent[0].body.get('client_secret')).toBe('test-google-secret');
    expect(sent[0].body.get('code')).toBe('the-code');
    expect(sent[0].body.get('redirect_uri')).toBe(auth.searchParams.get('redirect_uri'));
    const challenge = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sent[0].body.get('code_verifier'))));
    expect(btoa(String.fromCharCode(...challenge)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')).toBe(
      auth.searchParams.get('code_challenge'),
    );
    // The state cookie is cleared and the session works.
    expect(cookies(res).some((c) => /^jek_oauth=;.*Max-Age=0/.test(c))).toBe(true);
    const me = await (await call('/v1/me', { token: session })).json();
    expect(me.user).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.ac.uk' });
    expect(me.identities).toEqual([{ provider: 'google', subject: 'g-100' }]);
    expect(me.workspaces).toHaveLength(1);
  });

  it('signs the same person into the same account next time', async () => {
    const tok = idToken({ sub: 'g-200', name: 'Grace', email: 'grace@example.com', email_verified: true });
    let { state } = await begin('google');
    provider({ id_token: tok });
    const first = await finish('google', state);
    ({ state } = await begin('google'));
    provider({ id_token: tok });
    const second = await finish('google', state);
    const a = await (await call('/v1/me', { token: first.session })).json();
    const b = await (await call('/v1/me', { token: second.session })).json();
    expect(b.user.id).toBe(a.user.id);
    expect(first.session).not.toBe(second.session);
  });

  it('keeps an unverified email out', async () => {
    const { state } = await begin('google');
    provider({ id_token: idToken({ sub: 'g-300', name: 'X', email: 'x@example.com', email_verified: false }) });
    const { session } = await finish('google', state);
    expect((await (await call('/v1/me', { token: session })).json()).user.email).toBeNull();
  });

  it('rejects an ID token for another app, issuer or time', async () => {
    for (const claims of [{ aud: 'someone-else' }, { iss: 'https://evil.example' }, { exp: 1 }, { sub: '' }]) {
      const { state } = await begin('google');
      provider({ id_token: idToken({ sub: 'g-400', name: 'X', ...claims }) });
      const { outcome, session } = await finish('google', state);
      expect(outcome).toBe('failed');
      expect(session).toBeUndefined();
    }
  });

  it('reports a refused token exchange as failed', async () => {
    const { state } = await begin('google');
    provider({ error: 'invalid_grant' }, 400);
    expect((await finish('google', state)).outcome).toBe('failed');
  });

  it('reports a cancelled sign-in without calling the provider', async () => {
    const { state } = await begin('google', { ret: `${APP}/jek/tools/jekray2d.html` });
    const sent = provider({});
    const { outcome, session } = await finish('google', state, { code: null, error: 'access_denied' });
    expect(outcome).toBe('cancelled');
    expect(session).toBeUndefined();
    expect(sent).toHaveLength(0);
  });
});

describe('state checks', () => {
  it('refuses a callback without the state cookie from this browser', async () => {
    const { state } = await begin('google');
    const sent = provider({ id_token: idToken({ sub: 'g-500' }) });
    for (const jar of [null, 'f'.repeat(64)]) {
      const { outcome, session } = await finish('google', state, { jar });
      expect(outcome).toBe('expired');
      expect(session).toBeUndefined();
    }
    expect(sent).toHaveLength(0);
  });

  it('refuses an unknown, reused or cross-provider state', async () => {
    provider({ id_token: idToken({ sub: 'g-600' }), orcid: '0000-0002-1825-0097', name: 'Y' });
    const fake = 'a'.repeat(64);
    expect((await finish('google', fake)).outcome).toBe('expired');
    const { state } = await begin('google');
    expect((await finish('orcid', state)).outcome).toBe('expired');
    const { state: s2 } = await begin('google');
    expect((await finish('google', s2)).outcome).toBe('signed_in');
    expect((await finish('google', s2)).outcome).toBe('expired');
  });
});

describe('ORCID sign-in', () => {
  orcidOnFor(beforeEach, afterEach);
  it('creates an account from the iD and name, with no email', async () => {
    const { state } = await begin('orcid');
    const sent = provider({ access_token: 'x', orcid: '0000-0002-1825-0097', name: 'Josiah Carberry' });
    const { outcome, session } = await finish('orcid', state);
    expect(outcome).toBe('signed_in');
    expect(sent[0].url).toBe('https://orcid.org/oauth/token');
    expect(sent[0].body.get('client_secret')).toBe('test-orcid-secret');
    expect(sent[0].body.get('code_verifier')).toBeNull();
    const me = await (await call('/v1/me', { token: session })).json();
    expect(me.user).toMatchObject({ name: 'Josiah Carberry', email: null });
    expect(me.identities).toEqual([{ provider: 'orcid', subject: '0000-0002-1825-0097' }]);
  });

  it('falls back to the iD when the name is private, and rejects a malformed iD', async () => {
    let { state } = await begin('orcid');
    provider({ orcid: '0000-0001-5109-370X', name: '' });
    const { session } = await finish('orcid', state);
    expect((await (await call('/v1/me', { token: session })).json()).user.name).toBe('0000-0001-5109-370X');
    ({ state } = await begin('orcid'));
    provider({ orcid: 'not-an-id', name: 'Z' });
    expect((await finish('orcid', state)).outcome).toBe('failed');
  });
});

describe('linking a second sign-in', () => {
  orcidOnFor(beforeEach, afterEach);
  it('attaches ORCID to the signed-in account', async () => {
    const { user, token } = await signedIn();
    const { state } = await begin('orcid', { token, link: true });
    provider({ orcid: '0000-0003-0000-0001', name: 'Someone' });
    const { outcome, session } = await finish('orcid', state, { token });
    expect(outcome).toBe('linked');
    expect(session).toBeUndefined(); // the existing session carries on
    const me = await (await call('/v1/me', { token })).json();
    expect(me.user.id).toBe(user.id);
    expect(me.identities).toEqual([{ provider: 'orcid', subject: '0000-0003-0000-0001' }]);
    // Signing in with that ORCID later reaches the same account.
    const { state: s2 } = await begin('orcid');
    provider({ orcid: '0000-0003-0000-0001', name: 'Someone' });
    const later = await finish('orcid', s2);
    expect((await (await call('/v1/me', { token: later.session })).json()).user.id).toBe(user.id);
  });

  it('refuses to link a sign-in that belongs to someone else', async () => {
    let { state } = await begin('orcid');
    provider({ orcid: '0000-0003-0000-0002', name: 'Owner' });
    await finish('orcid', state);
    const other = await signedIn();
    ({ state } = await begin('orcid', { token: other.token, link: true }));
    provider({ orcid: '0000-0003-0000-0002', name: 'Owner' });
    expect((await finish('orcid', state, { token: other.token })).outcome).toBe('taken');
    expect((await (await call('/v1/me', { token: other.token })).json()).identities).toEqual([]);
  });

  it('needs a session to start linking', async () => {
    const { to } = await begin('orcid', { link: true });
    expect(to.origin).toBe(APP);
    expect(to.searchParams.get('jekauth')).toBe('signed_out');
  });

  it('never merges accounts on a matching email', async () => {
    let { state } = await begin('google');
    provider({ id_token: idToken({ sub: 'g-700', name: 'A', email: 'same@example.com', email_verified: true }) });
    const a = await finish('google', state);
    ({ state } = await begin('google'));
    provider({ id_token: idToken({ sub: 'g-701', name: 'B', email: 'same@example.com', email_verified: true }) });
    const b = await finish('google', state);
    const ida = (await (await call('/v1/me', { token: a.session })).json()).user.id;
    const idb = (await (await call('/v1/me', { token: b.session })).json()).user.id;
    expect(ida).not.toBe(idb);
  });

  it('unlinks only while another sign-in remains', async () => {
    const { token } = await signedIn();
    await env.DB.prepare("INSERT INTO identities SELECT 'google', 'g-800', user_id, 0 FROM sessions WHERE token_hash = ?")
      .bind(await sha256(token)).run();
    let res = await call('/v1/me/identities/google', { method: 'DELETE', token });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('last_identity');
    await env.DB.prepare("INSERT INTO identities SELECT 'orcid', '0000-0003-0000-0003', user_id, 0 FROM sessions WHERE token_hash = ?")
      .bind(await sha256(token)).run();
    res = await call('/v1/me/identities/google', { method: 'DELETE', token });
    expect(res.status).toBe(200);
    expect((await (await call('/v1/me', { token })).json()).identities).toEqual([{ provider: 'orcid', subject: '0000-0003-0000-0003' }]);
    expect((await call('/v1/me/identities/google', { method: 'DELETE', token })).status).toBe(404);
  });
});

describe('sessions list', () => {
  it('lists this person’s sessions by short id and ends one', async () => {
    const { user, token } = await signedIn();
    const other = await signedIn();
    // A second session for the same person.
    const { createSession } = await import('../src/sessions.js');
    const second = await createSession(env, user.id, 'Firefox on a laptop');
    const list = (await (await call('/v1/me/sessions', { token })).json()).sessions;
    expect(list).toHaveLength(2);
    expect(list.filter((s) => s.current)).toHaveLength(1);
    for (const s of list) expect(s.id).toMatch(/^[0-9a-f]{16}$/);
    const theirs = list.find((s) => !s.current);
    // Someone else cannot end it.
    expect((await call(`/v1/me/sessions/${theirs.id}`, { method: 'DELETE', token: other.token })).status).toBe(404);
    expect((await call(`/v1/me/sessions/${theirs.id}`, { method: 'DELETE', token })).status).toBe(200);
    expect((await call('/v1/me', { token: second.token })).status).toBe(401);
    expect((await call('/v1/me', { token })).status).toBe(200);
  });

  it('clears the cookie when ending the current session', async () => {
    const { token } = await signedIn();
    const mine = (await (await call('/v1/me/sessions', { token })).json()).sessions[0];
    const res = await call(`/v1/me/sessions/${mine.id}`, { method: 'DELETE', token });
    expect(res.headers.get('Set-Cookie')).toMatch(/jek_session=;.*Max-Age=0/);
    expect((await call('/v1/me', { token })).status).toBe(401);
  });
});
