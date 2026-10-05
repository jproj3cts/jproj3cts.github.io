// Sign-in with Google, Microsoft or ORCID: OAuth 2.0 authorisation code flow, handled
// entirely here. The app sends the person to /auth/<provider>/start; the
// provider sends them back to /auth/<provider>/callback; we open a session
// and send them back to the app.
//
// The state lives in D1 for 10 minutes and is also tied to this browser by a
// short-lived cookie, so a sign-in started elsewhere (login CSRF) is refused.
// Google and Microsoft also get PKCE. Accounts are never merged on a matching email: a
// second provider is attached only by a signed-in person, from the app.

import { allowedOrigins } from './http.js';
import { createSession, currentUser } from './sessions.js';
import { orcidLegacy, orcidOn } from './orcid.js';
import { createUser } from './users.js';
import { ApiError, cookie, newToken, now, sha256 } from './util.js';

const STATE_TTL = 600; // seconds
const STATE_COOKIE = 'jek_oauth';

const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

// Microsoft's tenant for personal accounts, which never sign in here.
const MSA_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';

// A UPN as an email address, when it is one on the tenant's own domain: not a
// guest's (#EXT#) and not the tenant's built-in onmicrosoft.com name.
export function upnEmail(upn) {
  const u = String(upn || '').trim().toLowerCase();
  if (!/^[^\s@#]+@([a-z0-9-]+\.)+[a-z]{2,}$/.test(u) || u.includes('#ext#') || u.endsWith('.onmicrosoft.com')) return null;
  return u;
}

export const PROVIDERS = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    pkce: true,
    clientId: (env) => env.GOOGLE_CLIENT_ID,
    secret: (env) => env.GOOGLE_CLIENT_SECRET,
    // The ID token comes straight from Google's token endpoint over TLS, so
    // its claims can be read without checking the signature (OpenID Connect
    // Core 3.1.3.7); the issuer, audience and expiry are still checked.
    identity(tok, env) {
      const parts = (tok.id_token || '').split('.');
      if (parts.length !== 3) throw new Error('no id_token');
      const c = JSON.parse(fromB64url(parts[1]));
      if (!['accounts.google.com', 'https://accounts.google.com'].includes(c.iss)) throw new Error('iss');
      if (c.aud !== env.GOOGLE_CLIENT_ID) throw new Error('aud');
      if (!(c.exp * 1000 > now())) throw new Error('exp');
      if (!c.sub) throw new Error('sub');
      return {
        subject: String(c.sub),
        name: c.name || c.given_name || c.email || 'Google user',
        email: c.email && c.email_verified ? c.email : null,
      };
    },
  },
  // University and work accounts only (the 'organizations' endpoint), not
  // personal Microsoft accounts.
  microsoft: {
    authorize: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
    scope: 'openid email profile',
    pkce: true,
    clientId: (env) => env.MICROSOFT_CLIENT_ID,
    secret: (env) => env.MICROSOFT_CLIENT_SECRET,
    // As for Google, the ID token comes straight from the token endpoint over
    // TLS. The person is their tenant and object id. Their email is taken from
    // the sign-in name (UPN), whose domain the tenant must have proved it owns;
    // the 'email' claim is not used, as a tenant can set it to anything.
    identity(tok, env) {
      const parts = (tok.id_token || '').split('.');
      if (parts.length !== 3) throw new Error('no id_token');
      const c = JSON.parse(fromB64url(parts[1]));
      const tid = String(c.tid || '').toLowerCase(), oid = String(c.oid || '').toLowerCase();
      const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      if (!GUID.test(tid) || !GUID.test(oid)) throw new Error('tid/oid');
      if (tid === MSA_TENANT) throw new Error('personal account');
      if (c.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) throw new Error('iss');
      if (c.aud !== env.MICROSOFT_CLIENT_ID) throw new Error('aud');
      if (!(c.exp * 1000 > now())) throw new Error('exp');
      return { subject: `${tid}:${oid}`, name: c.name || c.preferred_username || 'Microsoft user', email: upnEmail(c.preferred_username) };
    },
  },
  orcid: {
    authorize: 'https://orcid.org/oauth/authorize',
    token: 'https://orcid.org/oauth/token',
    scope: '/authenticate',
    pkce: false,
    clientId: (env) => env.ORCID_CLIENT_ID,
    secret: (env) => env.ORCID_CLIENT_SECRET,
    // ORCID's token response carries the iD and the public name; the public
    // API gives no email.
    identity(tok) {
      if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(tok.orcid || '')) throw new Error('orcid');
      return { subject: tok.orcid, name: (tok.name || '').trim() || tok.orcid, email: null };
    },
  },
};

const provider = (name) => {
  const p = PROVIDERS[name];
  if (!p) throw new ApiError(404, 'not_found', 'No such sign-in provider.');
  return p;
};

// The link a university's Microsoft administrator opens to approve JEKray2D
// for everyone in their organisation, once (tenant: its id or a domain).
export const adminConsentUrl = (env, tenant) =>
  env.MICROSOFT_CLIENT_ID
    ? `https://login.microsoftonline.com/${encodeURIComponent(tenant || 'organizations')}/adminconsent?client_id=${env.MICROSOFT_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(`${env.API_URL}/auth/microsoft/callback`)}`
    : null;

// Must match the redirect address registered with the provider exactly.
const callbackUrl = (req, env, name) => `${env.API_URL || new URL(req.url).origin}/auth/${name}/callback`;

// Where to send the person afterwards: a page of an allowed origin, or the app.
export function safeReturn(env, value) {
  const fallback = env.APP_URL || `${allowedOrigins(env)[0]}/jek/tools/jekray2d.html`;
  if (!value) return fallback;
  try {
    const u = new URL(value);
    if (!allowedOrigins(env).includes(u.origin)) return fallback;
    u.hash = '';
    return u.toString();
  } catch {
    return fallback;
  }
}

// Adds jekauth=<outcome> to the return address, for the app to report.
const withOutcome = (url, outcome) => {
  const u = new URL(url);
  u.searchParams.set('jekauth', outcome);
  return u.toString();
};

const stateCookie = (value, maxAge) =>
  `${STATE_COOKIE}=${value}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}

// GET /auth/:provider/start?return=<url>&link=1
export async function start(req, env, ctx, { provider: name }) {
  const p = provider(name);
  const url = new URL(req.url);
  const ret = safeReturn(env, url.searchParams.get('return'));
  // a provider not yet set up here (no client id): back to the app, which says so
  if (!p.clientId(env) || !p.secret(env)) return redirect(withOutcome(ret, 'unavailable'));
  // ORCID, while off (src/orcid.js): never linked, and signing in only for a while, for existing accounts
  if (name === 'orcid' && !orcidOn(env)) {
    if (url.searchParams.get('link') === '1') return redirect(withOutcome(ret, 'unavailable'));
    if (!orcidLegacy(env)) return redirect(withOutcome(ret, 'orcid_closed'));
  }
  let linkUser = null;
  if (url.searchParams.get('link') === '1') {
    const user = await currentUser(req, env, ctx);
    if (!user) return redirect(withOutcome(ret, 'signed_out'));
    linkUser = user.id;
  }
  const state = newToken();
  const verifier = p.pkce ? newToken() + newToken() : null;
  await env.DB.prepare('INSERT INTO oauth_states (hash, data, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(state), JSON.stringify({ provider: name, verifier, ret, linkUser }), now() + STATE_TTL * 1000)
    .run();
  const q = new URLSearchParams({
    client_id: p.clientId(env),
    response_type: 'code',
    scope: p.scope,
    redirect_uri: callbackUrl(req, env, name),
    state,
  });
  if (p.pkce) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    q.set('code_challenge', b64url(new Uint8Array(d)));
    q.set('code_challenge_method', 'S256');
  }
  if (name === 'google' || name === 'microsoft') q.set('prompt', 'select_account');
  return redirect(`${p.authorize}?${q}`, [stateCookie(state, STATE_TTL)]);
}

// GET /auth/:provider/callback?code=…&state=…
export async function callback(req, env, ctx, { provider: name }) {
  const p = provider(name);
  const url = new URL(req.url);
  // Back from a university's IT approving the app for everyone there (the
  // admin consent link): no sign-in, just the outcome for the app to show.
  if (name === 'microsoft' && url.searchParams.has('admin_consent')) {
    const yes = url.searchParams.get('admin_consent') === 'True' && !url.searchParams.get('error');
    const back = new URL(withOutcome(safeReturn(env, null), yes ? 'consented' : 'consent_failed'));
    // Microsoft's own error code (AADSTS…), so the reason can be looked up
    const code = (url.searchParams.get('error_description') || '').match(/AADSTS\d+/);
    if (!yes && (code || url.searchParams.get('error'))) back.searchParams.set('jekauthcode', code ? code[0] : String(url.searchParams.get('error')).slice(0, 40));
    return redirect(back.toString());
  }
  const state = url.searchParams.get('state') || '';
  const clear = stateCookie('', 0);

  // The state must be one we issued, to this browser, for this provider, and is
  // used up here whatever happens next.
  const row = state && /^[0-9a-f]{64}$/.test(state)
    ? await env.DB.prepare('DELETE FROM oauth_states WHERE hash = ? RETURNING data, expires_at').bind(await sha256(state)).first()
    : null;
  const saved = row && row.expires_at > now() ? JSON.parse(row.data) : null;
  if (!saved || saved.provider !== name || cookie(req, STATE_COOKIE) !== state) {
    return redirect(withOutcome(safeReturn(env, null), 'expired'), [clear]);
  }
  const ret = saved.ret;

  if (url.searchParams.get('error') || !url.searchParams.get('code')) {
    return redirect(withOutcome(ret, 'cancelled'), [clear]);
  }

  let id;
  try {
    const body = new URLSearchParams({
      client_id: p.clientId(env),
      client_secret: p.secret(env),
      grant_type: 'authorization_code',
      code: url.searchParams.get('code'),
      redirect_uri: callbackUrl(req, env, name),
    });
    if (p.pkce) body.set('code_verifier', saved.verifier);
    const res = await fetch(p.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
    });
    if (!res.ok) throw new Error(`token ${res.status}`);
    id = p.identity(await res.json(), env);
  } catch (err) {
    console.error(`${name} sign-in failed:`, err.message);
    return redirect(withOutcome(ret, 'failed'), [clear]);
  }

  const t = now();
  const found = await env.DB.prepare(
    `SELECT u.id, u.deleted_at FROM identities i JOIN users u ON u.id = i.user_id
      WHERE i.provider = ? AND i.subject = ?`,
  )
    .bind(name, id.subject)
    .first();

  // ORCID, while off: only an account that already signs in with it, and only to sign in
  if (name === 'orcid' && !orcidOn(env) && (saved.linkUser || !found || !orcidLegacy(env))) {
    return redirect(withOutcome(ret, saved.linkUser ? 'unavailable' : 'orcid_closed'), [clear]);
  }

  let userId;
  if (saved.linkUser) {
    // Attaching a second provider to the signed-in account.
    if (found && found.id !== saved.linkUser) return redirect(withOutcome(ret, 'taken'), [clear]);
    if (!found) {
      await env.DB.prepare('INSERT INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)')
        .bind(name, id.subject, saved.linkUser, t)
        .run();
    }
    if (id.email) {
      await env.DB.prepare('UPDATE users SET email = COALESCE(email, ?) WHERE id = ?').bind(id.email, saved.linkUser).run();
    }
    return redirect(withOutcome(ret, 'linked'), [clear]);
  }

  if (found && found.deleted_at) return redirect(withOutcome(ret, 'failed'), [clear]);
  if (found) {
    userId = found.id;
    // Google's verified email (or Microsoft's sign-in name) is kept up to date; ORCID gives none.
    if (id.email) await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(id.email, userId).run();
  } else {
    try {
      const { user } = await createUser(env, {
        name: id.name.slice(0, 100),
        email: id.email,
        identity: { provider: name, subject: id.subject },
      });
      userId = user.id;
    } catch (err) {
      // Two sign-ins racing to create the same person: use the one that won.
      const again = await env.DB.prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?')
        .bind(name, id.subject)
        .first();
      if (!again) throw err;
      userId = again.user_id;
    }
  }
  const session = await createSession(env, userId, req.headers.get('User-Agent'));
  return redirect(withOutcome(ret, 'signed_in'), [clear, session.cookie]);
}

// DELETE /v1/me/identities/:provider — only while another way in remains.
export async function unlink(req, env, ctx, { provider: name }, user) {
  provider(name);
  const { results } = await env.DB.prepare('SELECT provider FROM identities WHERE user_id = ?').bind(user.id).all();
  if (!results.some((r) => r.provider === name)) throw new ApiError(404, 'not_found', 'That sign-in is not linked.');
  if (results.length < 2) throw new ApiError(409, 'last_identity', 'Link another way to sign in before removing this one.');
  await env.DB.prepare('DELETE FROM identities WHERE user_id = ? AND provider = ?').bind(user.id, name).run();
}
