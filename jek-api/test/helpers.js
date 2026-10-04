import { env, exports } from 'cloudflare:workers';
import { createSession } from '../src/sessions.js';
import { createUser } from '../src/users.js';

export const APP = 'https://jeksys.net';
export const API = 'https://api.jeksys.net';

export function call(path, { method = 'GET', origin = APP, token, headers = {}, body } = {}) {
  const h = { ...headers };
  if (origin) h.Origin = origin;
  if (token) h.Cookie = `jek_session=${token}`;
  return exports.default.fetch(new Request(API + path, { method, headers: h, body }));
}

let n = 0;
export async function signedIn(name = `Tester ${++n}`) {
  const { user, workspaceId } = await createUser(env, { name, email: `t${n}@example.com` });
  const { token } = await createSession(env, user.id, 'vitest');
  return { user, workspaceId, token };
}
