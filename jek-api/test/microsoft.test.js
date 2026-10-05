import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { upnEmail } from '../src/auth.js';
import { bench, call, send } from './helpers.js';

const OPS = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TENANT = 'aaaaaaaa-1111-2222-3333-444444444444';
const b64url = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const idToken = (claims) => ['e30', b64url(JSON.stringify({
  iss: `https://login.microsoftonline.com/${TENANT}/v2.0`, aud: env.MICROSOFT_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 3600,
  tid: TENANT, oid: 'bbbbbbbb-1111-2222-3333-444444444444', name: 'Kim Student', preferred_username: 'k1234567@kcl-test.ac.uk', ...claims,
})), 'sig'].join('.');

function microsoft(token) {
  const sent = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    sent.push({ url: String(url), body: new URLSearchParams(String(init.body)) });
    return new Response(JSON.stringify({ id_token: token }), { headers: { 'Content-Type': 'application/json' } });
  });
  return sent;
}
afterEach(() => vi.restoreAllMocks());

const cookieValue = (res, name) => {
  const c = res.headers.getSetCookie().find((x) => x.startsWith(name + '='));
  return c && c.slice(name.length + 1).split(';')[0];
};
async function signIn(token) {
  const start = await call('/auth/microsoft/start', { origin: null });
  const to = new URL(start.headers.get('Location'));
  const state = cookieValue(start, 'jek_oauth');
  const sent = microsoft(token);
  const res = await call(`/auth/microsoft/callback?${new URLSearchParams({ state, code: 'c' })}`, { origin: null, headers: { Cookie: `jek_oauth=${state}` } });
  const back = new URL(res.headers.get('Location'));
  vi.restoreAllMocks();
  return { to, sent, outcome: back.searchParams.get('jekauth'), session: cookieValue(res, 'jek_session') };
}
const ops = (path, body) => call(path, { method: 'POST', origin: null, body: JSON.stringify(body), headers: { Authorization: `Bearer ${OPS}`, 'Content-Type': 'application/json' } });

describe('Sign in with Microsoft', () => {
  it('goes to the organizations endpoint with PKCE, and asks only for sign-in scopes', async () => {
    const start = await call('/auth/microsoft/start', { origin: null });
    const to = new URL(start.headers.get('Location'));
    expect(to.origin + to.pathname).toBe('https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize');
    expect(to.searchParams.get('scope')).toBe('openid email profile');
    expect(to.searchParams.get('code_challenge_method')).toBe('S256');
    expect(to.searchParams.get('client_id')).toBe(env.MICROSOFT_CLIENT_ID);
  });

  it('makes an account named by tenant and object id, with the sign-in name as its email', async () => {
    const r = await signIn(idToken());
    expect(r.outcome).toBe('signed_in');
    expect(r.sent[0].url).toBe('https://login.microsoftonline.com/organizations/oauth2/v2.0/token');
    expect(r.sent[0].body.get('code_verifier')).toMatch(/^[0-9a-f]{128}$/);
    const me = await (await call('/v1/me', { token: r.session })).json();
    expect(me.user).toMatchObject({ name: 'Kim Student', email: 'k1234567@kcl-test.ac.uk' });
    expect(me.identities).toEqual([{ provider: 'microsoft', subject: `${TENANT}:bbbbbbbb-1111-2222-3333-444444444444` }]);
    // the same person again: the same account
    const again = await signIn(idToken());
    expect((await (await call('/v1/me', { token: again.session })).json()).user.id).toBe(me.user.id);
  });

  it('refuses tokens for another app, from a mismatched issuer, expired, or from a personal account', async () => {
    for (const claims of [
      { aud: 'someone-else' },
      { iss: 'https://login.microsoftonline.com/cccccccc-1111-2222-3333-444444444444/v2.0' },
      { exp: Math.floor(Date.now() / 1000) - 10 },
      { tid: '9188040d-6c67-4c5b-b112-36a304b66dad', iss: 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0' },
      { oid: 'not-a-guid' },
    ]) expect((await signIn(idToken(claims))).outcome).toBe('failed');
  });

  it('takes an email only from a sign-in name on the tenant’s own domain', () => {
    expect(upnEmail('A.Person@KCL.ac.uk')).toBe('a.person@kcl.ac.uk');
    expect(upnEmail('someone_gmail.com#EXT#@kcl.onmicrosoft.com')).toBeNull();
    expect(upnEmail('admin@contoso.onmicrosoft.com')).toBeNull();
    expect(upnEmail('not an email')).toBeNull();
  });

  it('gives Pro to anyone from a university’s tenant, whatever their address', async () => {
    const r0 = await ops('/ops/institutions', { name: 'Tenant University', domains: ['tenant-uni.ac.uk'], tenants: [TENANT.toUpperCase()] });
    const uni = await r0.json();
    expect(uni.tenants).toEqual([TENANT]);
    await ops(`/ops/institutions/${uni.id}/manual`, { until: Date.now() + 86400000, max_users: 'unlimited' });
    const r = await signIn(idToken({ oid: 'dddddddd-1111-2222-3333-444444444444', preferred_username: 'guest-style@elsewhere.org' }));
    const me = await (await call('/v1/me', { token: r.session })).json();
    expect(me.licence).toEqual({ name: 'Tenant University', via: 'microsoft' });
    const ws = me.workspaces.find((w) => w.kind === 'personal').id;
    expect((await send(`/v1/workspaces/${ws}/benches`, 'POST', r.session, { name: 'B', content: bench('B') })).status).toBe(201);
  });

  it('sends an IT administrator back to the app with the outcome of approving it', async () => {
    const yes = await call(`/auth/microsoft/callback?admin_consent=True&tenant=${TENANT}`, { origin: null });
    expect(new URL(yes.headers.get('Location')).searchParams.get('jekauth')).toBe('consented');
    const no = await call('/auth/microsoft/callback?error=access_denied&admin_consent=False', { origin: null });
    expect(new URL(no.headers.get('Location')).searchParams.get('jekauth')).toBe('consent_failed');
    expect(yes.headers.getSetCookie().some((c) => c.startsWith('jek_session='))).toBe(false);
  });

  it('gives each university\u2019s admins the approval link for its tenant', async () => {
    const uni = await (await ops('/ops/institutions', { name: 'Approving University', tenants: ['eeeeeeee-1111-2222-3333-444444444444'] })).json();
    expect(uni.microsoft_approval).toBe(`https://login.microsoftonline.com/eeeeeeee-1111-2222-3333-444444444444/adminconsent?client_id=${env.MICROSOFT_CLIENT_ID}&redirect_uri=${encodeURIComponent('https://api.jeksys.net/auth/microsoft/callback')}`);
  });

  it('is offered back to the app as unavailable when not set up', async () => {
    const saved = env.MICROSOFT_CLIENT_ID;
    env.MICROSOFT_CLIENT_ID = '';
    try {
      const res = await call('/auth/microsoft/start', { origin: null });
      expect(new URL(res.headers.get('Location')).searchParams.get('jekauth')).toBe('unavailable');
    } finally {
      env.MICROSOFT_CLIENT_ID = saved;
    }
  });
});
