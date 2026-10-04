// jek-api: accounts, workspaces and cloud benches for JEKray2D.
// The app (https://jeksys.net) is the only browser caller; see README.md.

import { checkOrigin, corsHeaders, preflight } from './http.js';
import { Router } from './router.js';
import { clearCookie, requireUser } from './sessions.js';
import { me } from './users.js';
import { ApiError, errorResponse, json } from './util.js';

export const VERSION = '0.1.0';

export const router = new Router()
  .on('GET', '/v1/health', async (req, env) => {
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true, version: VERSION });
  })
  .on('GET', '/v1/me', async (req, env, ctx) => json(await me(env, await requireUser(req, env, ctx))))
  .on('POST', '/auth/signout', async (req, env, ctx) => {
    await requireUser(req, env, ctx);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(ctx.sessionHash).run();
    ctx.setCookie = clearCookie();
    return json({ ok: true });
  });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return preflight(req, env);
    const ctx = {};
    let res;
    try {
      const url = new URL(req.url);
      const hit = router.match(req.method, url.pathname);
      if (!hit) throw new ApiError(404, 'not_found', 'No such endpoint.');
      if (hit.allow) throw new ApiError(405, 'method_not_allowed', `Use ${hit.allow.join(' or ')}.`);
      checkOrigin(req, env, hit.route.opts.anyOrigin);
      res = await hit.route.handler(req, env, ctx, hit.params);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        console.error(err);
        err = new ApiError(500, 'internal', 'Something went wrong on our side.');
      }
      res = errorResponse(err);
    }
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders(req, env))) headers.set(k, v);
    if (ctx.setCookie) headers.append('Set-Cookie', ctx.setCookie);
    headers.set('Cache-Control', 'no-store');
    return new Response(res.body, { status: res.status, headers });
  },
};
