// CORS and the origin check. The app and the API share the site jeksys.net,
// so SameSite=Lax already stops cross-site form posts; every write must also
// carry an allowed Origin, and only allowed origins get credentialed CORS.

import { ApiError } from './util.js';

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const allowedOrigins = (env) =>
  (env.APP_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

export function corsHeaders(req, env) {
  const origin = req.headers.get('Origin');
  if (!origin || !allowedOrigins(env).includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'ETag',
    Vary: 'Origin',
  };
}

export function preflight(req, env) {
  const cors = corsHeaders(req, env);
  if (!cors['Access-Control-Allow-Origin']) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, If-Match',
      'Access-Control-Max-Age': '86400',
    },
  });
}

// Writes need an allowed Origin. `exempt` covers callers that are not
// browsers, such as Stripe's webhook, which proves itself by signature.
export function checkOrigin(req, env, exempt) {
  if (!WRITE.has(req.method) || exempt) return;
  const origin = req.headers.get('Origin');
  if (!origin || !allowedOrigins(env).includes(origin)) {
    throw new ApiError(403, 'bad_origin', 'This request must come from the JEKray2D app.');
  }
}
