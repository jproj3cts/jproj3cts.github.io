// jek-api: accounts, workspaces and cloud benches for JEKray2D.
// The app (https://jeksys.net) is the only browser caller; see README.md.

import { checkOrigin, corsHeaders, preflight } from './http.js';
import { Router } from './router.js';
import { deleteAccount } from './account.js';
import { callback, start, unlink } from './auth.js';
import * as B from './benches.js';
import { exportAll } from './export.js';
import * as I from './institutions.js';
import { verify as verifyAcademic } from './academic.js';
import { checkout, portal, priceList, switchInterval, webhook } from './billing.js';
import { clearCookie, endSession, listSessions, requireUser } from './sessions.js';
import { me } from './users.js';
import { ApiError, errorResponse, json } from './util.js';

const VERSION = '0.1.0';

const router = new Router()
  .on('GET', '/v1/health', async (req, env) => {
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true, version: VERSION });
  })
  .on('GET', '/v1/me', async (req, env, ctx) => json(await me(env, await requireUser(req, env, ctx))))
  .on('DELETE', '/v1/me', async (req, env, ctx) => {
    const out = await deleteAccount(req, env, await requireUser(req, env, ctx));
    ctx.setCookie = clearCookie();
    return json(out);
  })
  .on('DELETE', '/v1/me/identities/:provider', async (req, env, ctx, params) => {
    await unlink(req, env, ctx, params, await requireUser(req, env, ctx));
    return json({ ok: true });
  })
  .on('GET', '/v1/me/sessions', async (req, env, ctx) =>
    json({ sessions: await listSessions(env, await requireUser(req, env, ctx), ctx) }),
  )
  .on('DELETE', '/v1/me/sessions/:id', async (req, env, ctx, { id }) => {
    const user = await requireUser(req, env, ctx);
    await endSession(env, user, id);
    if (ctx.sessionHash.startsWith(id)) ctx.setCookie = clearCookie();
    return json({ ok: true });
  })
  .on('GET', '/v1/me/export', async (req, env, ctx) => {
    const user = await requireUser(req, env, ctx);
    return new Response(await exportAll(env, user), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="jekray2d-export-${new Date().toISOString().slice(0, 10)}.zip"`,
      },
    });
  })
  // benches
  .on('GET', '/v1/workspaces/:w/benches', async (req, env, ctx, { w }) => json(await B.list(req, env, await requireUser(req, env, ctx), w)))
  .on('POST', '/v1/workspaces/:w/benches', async (req, env, ctx, { w }) =>
    json(await B.create(req, env, await requireUser(req, env, ctx), w), 201),
  )
  .on('GET', '/v1/benches/:b', async (req, env, ctx, { b }) => {
    const out = await B.get(env, await requireUser(req, env, ctx), b);
    return json(out, 200, { ETag: `"${out.version}"` });
  })
  .on('PUT', '/v1/benches/:b', async (req, env, ctx, { b }) => {
    const out = await B.save(req, env, await requireUser(req, env, ctx), b);
    return json(out, 200, { ETag: `"${out.version}"` });
  })
  .on('PATCH', '/v1/benches/:b', async (req, env, ctx, { b }) => json(await B.patch(req, env, await requireUser(req, env, ctx), b)))
  .on('DELETE', '/v1/benches/:b', async (req, env, ctx, { b }) => {
    await B.remove(env, await requireUser(req, env, ctx), b);
    return json({ ok: true });
  })
  .on('POST', '/v1/benches/:b/undelete', async (req, env, ctx, { b }) => json(await B.undelete(env, await requireUser(req, env, ctx), b)))
  .on('PUT', '/v1/benches/:b/thumb', async (req, env, ctx, { b }) => json(await B.putThumb(req, env, await requireUser(req, env, ctx), b)))
  .on('GET', '/v1/benches/:b/thumb', async (req, env, ctx, { b }) => B.getThumb(env, await requireUser(req, env, ctx), b))
  .on('GET', '/v1/benches/:b/versions', async (req, env, ctx, { b }) => json(await B.versions(env, await requireUser(req, env, ctx), b)))
  .on('GET', '/v1/benches/:b/versions/:v', async (req, env, ctx, { b, v }) =>
    json(await B.version(env, await requireUser(req, env, ctx), b, v)),
  )
  .on('POST', '/v1/benches/:b/versions/:v/restore', async (req, env, ctx, { b, v }) =>
    json(await B.restore(env, await requireUser(req, env, ctx), b, v)),
  )
  // folders
  .on('GET', '/v1/workspaces/:w/folders', async (req, env, ctx, { w }) => json(await B.folders(env, await requireUser(req, env, ctx), w)))
  .on('POST', '/v1/workspaces/:w/folders', async (req, env, ctx, { w }) =>
    json(await B.createFolder(req, env, await requireUser(req, env, ctx), w), 201),
  )
  .on('PATCH', '/v1/workspaces/:w/folders/:f', async (req, env, ctx, { w, f }) =>
    json(await B.patchFolder(req, env, await requireUser(req, env, ctx), w, f)),
  )
  .on('DELETE', '/v1/workspaces/:w/folders/:f', async (req, env, ctx, { w, f }) => {
    await B.deleteFolder(env, await requireUser(req, env, ctx), w, f);
    return json({ ok: true });
  })
  // billing
  .on('GET', '/v1/billing/prices', async (req, env) => json(await priceList(env)))
  .on('POST', '/v1/me/institution', async (req, env, ctx) => json(await I.checkInstitution(env, await requireUser(req, env, ctx))))
  .on('POST', '/v1/me/academic', async (req, env, ctx) => json(await verifyAcademic(env, await requireUser(req, env, ctx))))
  .on('POST', '/v1/workspaces/:w/billing/checkout', async (req, env, ctx, { w }) =>
    json(await checkout(req, env, await requireUser(req, env, ctx), w)),
  )
  .on('POST', '/v1/workspaces/:w/billing/portal', async (req, env, ctx, { w }) =>
    json(await portal(req, env, await requireUser(req, env, ctx), w)),
  )
  .on('POST', '/v1/workspaces/:w/billing/interval', async (req, env, ctx, { w }) =>
    json(await switchInterval(req, env, await requireUser(req, env, ctx), w)),
  )
  // JEK Systems' own operations: a bearer token, never a browser (scripts/institutions.mjs)
  .on('GET', '/ops/institutions', async (req, env) => json(await I.opsList(req, env)), { anyOrigin: true })
  .on('POST', '/ops/institutions', async (req, env) => json(await I.opsCreate(req, env), 201), { anyOrigin: true })
  .on('GET', '/ops/institutions/:id', async (req, env, ctx, { id }) => json(await I.opsGet(req, env, id)), { anyOrigin: true })
  .on('PATCH', '/ops/institutions/:id', async (req, env, ctx, { id }) => json(await I.opsPatch(req, env, id)), { anyOrigin: true })
  .on('POST', '/ops/institutions/:id/pilot', async (req, env, ctx, { id }) => json(await I.opsPilot(req, env, id)), { anyOrigin: true })
  .on('POST', '/ops/institutions/:id/invoice', async (req, env, ctx, { id }) => json(await I.opsInvoice(req, env, id)), { anyOrigin: true })
  // Stripe proves itself by signature, not by Origin.
  .on('POST', '/stripe/webhook', async (req, env) => json(await webhook(req, env)), { anyOrigin: true })
  .on('GET', '/auth/:provider/start', start)
  .on('GET', '/auth/:provider/callback', callback)
  .on('POST', '/auth/signout', async (req, env, ctx) => {
    await requireUser(req, env, ctx);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(ctx.sessionHash).run();
    ctx.setCookie = clearCookie();
    return json({ ok: true });
  });

export default {
  // daily: empty the bin of benches deleted more than 30 days ago
  async scheduled(event, env, ctx) {
    ctx.waitUntil(B.purgeBin(env));
  },
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
    if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');   // a thumbnail says otherwise
    return new Response(res.body, { status: res.status, headers });
  },
};
