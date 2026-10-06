// My parts: parts and assemblies kept to use on any bench (see migration 0007).
//
// A part is what the app copies: one or more elements and the fibres between
// them, checked here only for its shape and size, as a bench is (the app reads
// it as it reads a pasted clip). Listing and using parts needs no plan, as
// reading benches does not; keeping a new one, renaming and deleting need the
// rights that saving a bench needs.

import { canWrite, checkQuota, cleanName, readJson, workspaceAccess } from './benches.js';
import { ApiError, newId, now } from './util.js';

export const MAX_PART = 256 * 1024;
export const MAX_ICON = 24 * 1024;
export const MAX_PARTS = 500;
const PALETTES = new Set(['free', 'fibre', 'elec', 'pic']);
const bytes = (s) => new TextEncoder().encode(s).length;

function partContent(c) {
  if (typeof c !== 'string') throw new ApiError(400, 'bad_request', 'content must be the part, as JSON text.');
  if (bytes(c) > MAX_PART) throw new ApiError(413, 'too_large', 'A part can be at most 256 KB.');
  let d;
  try {
    d = JSON.parse(c);
  } catch {
    throw new ApiError(400, 'bad_part', 'That is not a part.');
  }
  if (!d || d.format !== 'jekray-clip' || !Array.isArray(d.elements) || !d.elements.length || d.elements.length > 200 ||
      !d.elements.every((e) => e && typeof e === 'object' && !Array.isArray(e)) || (d.fibres !== undefined && !Array.isArray(d.fibres))) {
    throw new ApiError(400, 'bad_part', 'That is not a part.');
  }
  return c;
}

// only a small PNG, as a data: URL; anything else is dropped rather than kept
function partIcon(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || v.length > MAX_ICON || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v)) {
    throw new ApiError(400, 'bad_icon', 'A part’s picture must be a PNG of at most 24 KB.');
  }
  return v;
}

const meta = (p) => ({
  id: p.id, workspace_id: p.workspace_id, name: p.name, summary: p.summary, palette: p.palette,
  size_bytes: p.size_bytes, icon: p.icon, created_at: p.created_at, updated_at: p.updated_at,
});

async function partAccess(env, user, partId) {
  const p = await env.DB.prepare('SELECT * FROM parts WHERE id = ?').bind(partId).first();
  if (!p) throw new ApiError(404, 'not_found', 'No such part.');
  let a;
  try {
    a = await workspaceAccess(env, user, p.workspace_id);
  } catch {
    throw new ApiError(404, 'not_found', 'No such part.'); // someone else's looks like none
  }
  return { part: p, a };
}

// GET /v1/workspaces/:w/parts — the library, without the parts themselves
export async function list(env, user, wsId) {
  const a = await workspaceAccess(env, user, wsId);
  const { results } = await env.DB.prepare(
    'SELECT id, workspace_id, name, summary, palette, size_bytes, icon, created_at, updated_at FROM parts WHERE workspace_id = ? ORDER BY name COLLATE NOCASE',
  )
    .bind(a.ws)
    .all();
  return { parts: results.map(meta), role: a.role, active: a.active };
}

// POST /v1/workspaces/:w/parts  {name, summary?, palette?, content, icon?}
export async function create(req, env, user, wsId) {
  const a = await workspaceAccess(env, user, wsId);
  canWrite(a);
  const body = await readJson(req);
  const content = partContent(body.content);
  const icon = partIcon(body.icon);
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM parts WHERE workspace_id = ?').bind(a.ws).first()).n;
  if (n >= MAX_PARTS) throw new ApiError(409, 'too_many', `A library can hold ${MAX_PARTS} parts; delete some first.`);
  await checkQuota(env, a.ws, a.kind, bytes(content));
  const t = now();
  const p = {
    id: newId(), workspace_id: a.ws, name: cleanName(body.name, 'My part'), summary: cleanName(body.summary, 'Part').slice(0, 60),
    palette: PALETTES.has(body.palette) ? body.palette : 'free', size_bytes: bytes(content), icon, created_at: t, updated_at: t,
  };
  await env.DB.prepare(
    `INSERT INTO parts (id, workspace_id, name, summary, palette, content, size_bytes, icon, created_at, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(p.id, p.workspace_id, p.name, p.summary, p.palette, content, p.size_bytes, p.icon, t, user.id, t)
    .run();
  return p;
}

// GET /v1/parts/:p — the part itself
export async function get(env, user, partId) {
  const { part } = await partAccess(env, user, partId);
  return { ...meta(part), content: part.content };
}

// PATCH /v1/parts/:p  {name}
export async function patch(req, env, user, partId) {
  const { part, a } = await partAccess(env, user, partId);
  canWrite(a);
  const body = await readJson(req);
  const name = cleanName(body.name);
  const t = now();
  await env.DB.prepare('UPDATE parts SET name = ?, updated_at = ? WHERE id = ?').bind(name, t, part.id).run();
  return meta({ ...part, name, updated_at: t });
}

// DELETE /v1/parts/:p — gone at once (the app asks first); allowed without a plan, to tidy up
export async function remove(env, user, partId) {
  const { part, a } = await partAccess(env, user, partId);
  canWrite(a, { plan: false });
  await env.DB.prepare('DELETE FROM parts WHERE id = ?').bind(part.id).run();
}
