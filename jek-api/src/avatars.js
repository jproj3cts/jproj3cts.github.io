// Profile pictures: a small WebP, PNG or JPEG the app resizes before sending,
// kept in R2 under the person and shown beside their name to the people they
// share a workspace with (a team's members, or themselves). Its URL names
// the image, so a new picture is a new URL and the old one can be cached.

import { avatarPath, imageType } from './benches.js';
import { ApiError, newId } from './util.js';

export const MAX_AVATAR = 64 * 1024;

// PUT /v1/me/avatar  with the image itself as the body
export async function putAvatar(req, env, user) {
  if (Number(req.headers.get('Content-Length') || 0) > MAX_AVATAR) throw new ApiError(413, 'too_large', 'A picture can be at most 64 KB.');
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length > MAX_AVATAR) throw new ApiError(413, 'too_large', 'A picture can be at most 64 KB.');
  const type = imageType(body);
  if (!type) throw new ApiError(415, 'bad_image', 'A picture must be a WebP, PNG or JPEG image.');
  const key = `u/${user.id}/a/${newId()}`;
  await env.BENCHES.put(key, body, { httpMetadata: { contentType: type } });
  const prev = await env.DB.prepare('SELECT avatar_key FROM users WHERE id = ?').bind(user.id).first();
  await env.DB.prepare('UPDATE users SET avatar_key = ? WHERE id = ?').bind(key, user.id).run();
  if (prev && prev.avatar_key) await env.BENCHES.delete(prev.avatar_key);
  return { avatar: avatarPath(user.id, key) };
}

// DELETE /v1/me/avatar
export async function deleteAvatar(env, user) {
  const prev = await env.DB.prepare('SELECT avatar_key FROM users WHERE id = ?').bind(user.id).first();
  await env.DB.prepare('UPDATE users SET avatar_key = NULL WHERE id = ?').bind(user.id).run();
  if (prev && prev.avatar_key) await env.BENCHES.delete(prev.avatar_key);
  return { avatar: null };
}

// GET /v1/users/:u/avatar — their own, or someone they share a workspace with
export async function getAvatar(env, user, userId) {
  const row = await env.DB.prepare(
    `SELECT u.avatar_key FROM users u WHERE u.id = ? AND u.deleted_at IS NULL AND (u.id = ?2 OR EXISTS (
       SELECT 1 FROM members a JOIN members b ON b.workspace_id = a.workspace_id WHERE a.user_id = u.id AND b.user_id = ?2))`,
  ).bind(userId, user.id).first();
  const obj = row && row.avatar_key && (await env.BENCHES.get(row.avatar_key));
  if (!obj) throw new ApiError(404, 'not_found', 'No picture.');
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata.contentType,
      'Content-Length': String(obj.size),
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-site',
    },
  });
}
