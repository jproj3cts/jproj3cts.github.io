// Cloud benches: the current .jekray (the head) in D1, earlier versions in R2.
//
// Every save carries the version it was based on (If-Match); a save based on
// an older one gets 409 with the newer number, so two tabs or two devices
// never silently overwrite each other. The head's version goes up by one on
// every save; a copy is cut into R2 on create, on an explicit Save, at most
// every 10 minutes of editing, and before a restore. History keeps the last
// 50 copies plus one a day for 90 days.
//
// Reading and exporting always work. Saving needs an active plan on the
// workspace (or its grace period) and a role of editor or above.

import { licenceFor } from './institutions.js';
import { planActive } from './users.js';
import { ApiError, newId, now } from './util.js';

export const MAX_BENCH = 2 * 1024 * 1024;
export const QUOTA = { personal: 1024 ** 3, team: 10 * 1024 ** 3, institution: 10 * 1024 ** 3 };
const CUT_EVERY = 10 * 60 * 1000;
const KEEP_RECENT = 50;
const KEEP_DAILY_MS = 90 * 24 * 60 * 60 * 1000;
export const BIN_MS = 30 * 24 * 60 * 60 * 1000;
const WRITERS = new Set(['owner', 'admin', 'editor']);

const r2Key = (ws, bench, version) => `w/${ws}/b/${bench}/v/${version}.jekray`;
const bytes = (s) => new TextEncoder().encode(s).length;

// ---------- access ----------

// A workspace's plan counts, or, for a personal one, a university's licence
// covers its owner (the only member a personal workspace has).
async function activeFor(env, user, row) {
  if (planActive(row.status && row)) return true;
  if (row.kind !== 'personal') return false;
  const lic = await licenceFor(env, user);
  return !!lic && !lic.full;
}

// The caller's role in a workspace, and whether its plan is active.
export async function workspaceAccess(env, user, wsId) {
  const row = await env.DB.prepare(
    `SELECT w.id, w.kind, m.role, s.plan, s.status, s.period_end, s.past_due_since, s.stripe_customer
       FROM workspaces w JOIN members m ON m.workspace_id = w.id AND m.user_id = ?
       LEFT JOIN subscriptions s ON s.workspace_id = w.id
      WHERE w.id = ?`,
  )
    .bind(user.id, wsId)
    .first();
  // Someone else's workspace looks the same as one that does not exist.
  if (!row) throw new ApiError(404, 'not_found', 'No such workspace.');
  return { ws: row.id, kind: row.kind, role: row.role, active: await activeFor(env, user, row) };
}

async function benchAccess(env, user, benchId, { bin = false } = {}) {
  const row = await env.DB.prepare(
    `SELECT b.id, b.workspace_id, b.folder_id, b.name, b.head_version, b.size_bytes, b.created_at,
            b.updated_at, b.deleted_at, u.name AS updated_by_name, b.updated_by, b.thumb_key,
            b.forked_from, b.forked_version, b.forked_name, w.kind, m.role, s.plan, s.status, s.period_end, s.past_due_since, s.stripe_customer
       FROM benches b
       JOIN workspaces w ON w.id = b.workspace_id
       JOIN members m ON m.workspace_id = b.workspace_id AND m.user_id = ?
       LEFT JOIN subscriptions s ON s.workspace_id = b.workspace_id
       LEFT JOIN users u ON u.id = b.updated_by
      WHERE b.id = ?`,
  )
    .bind(user.id, benchId)
    .first();
  if (!row || (row.deleted_at && !bin)) throw new ApiError(404, 'not_found', 'No such bench.');
  return { bench: row, role: row.role, active: await activeFor(env, user, row), kind: row.kind };
}

function canWrite(a, { plan = true } = {}) {
  // a university's licence is not a place for benches
  if (a.kind === 'institution') throw new ApiError(403, 'forbidden', 'Benches cannot be saved to a university licence.');
  if (!WRITERS.has(a.role)) throw new ApiError(403, 'forbidden', 'Your role in this workspace cannot change benches.');
  if (plan && !a.active) throw new ApiError(402, 'no_plan', 'Saving to the cloud needs JEKrayPro.');
}

const meta = (b) => ({
  id: b.id,
  workspace_id: b.workspace_id,
  folder_id: b.folder_id,
  name: b.name,
  version: b.head_version,
  size_bytes: b.size_bytes,
  created_at: b.created_at,
  updated_at: b.updated_at,
  updated_by: b.updated_by ? { id: b.updated_by, name: b.updated_by_name } : null,
  deleted_at: b.deleted_at,
  thumb: thumbPath(b.id, b.thumb_key),
  forked_from: b.forked_from ? { id: b.forked_from, version: b.forked_version, name: b.forked_name } : null,
});

// ---------- input ----------

async function readJson(req) {
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > MAX_BENCH + 64 * 1024) throw new ApiError(413, 'too_large', 'A bench can be at most 2 MB.');
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, 'bad_request', 'The request body is not valid JSON.');
  }
}

// The .jekray text, checked to be a JSON object of at most 2 MB.
function benchContent(body) {
  const c = body && body.content;
  if (typeof c !== 'string') throw new ApiError(400, 'bad_request', 'content must be the .jekray text.');
  if (bytes(c) > MAX_BENCH) throw new ApiError(413, 'too_large', 'A bench can be at most 2 MB.');
  let data;
  try {
    data = JSON.parse(c);
  } catch {
    throw new ApiError(400, 'bad_bench', 'That is not a .jekray bench.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.format === undefined) {
    throw new ApiError(400, 'bad_bench', 'That is not a .jekray bench.');
  }
  return c;
}

function cleanName(v, fallback) {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120) : '';
  if (s) return s;
  if (fallback !== undefined) return fallback;
  throw new ApiError(400, 'bad_request', 'A name is needed.');
}

async function folderIn(env, ws, folderId) {
  if (folderId === null || folderId === undefined || folderId === '') return null;
  const f = await env.DB.prepare('SELECT id FROM folders WHERE id = ? AND workspace_id = ?').bind(folderId, ws).first();
  if (!f) throw new ApiError(400, 'bad_folder', 'No such folder in this workspace.');
  return f.id;
}

// ---------- quota ----------

export async function usage(env, ws) {
  const r = await env.DB.prepare(
    `SELECT (SELECT COALESCE(SUM(size_bytes), 0) FROM benches WHERE workspace_id = ?1)
          + (SELECT COALESCE(SUM(v.size_bytes), 0) FROM bench_versions v JOIN benches b ON b.id = v.bench_id WHERE b.workspace_id = ?1) AS n`,
  )
    .bind(ws)
    .first();
  return r.n;
}

async function checkQuota(env, ws, kind, adding) {
  const limit = QUOTA[kind] || QUOTA.personal;
  if ((await usage(env, ws)) + adding > limit) {
    throw new ApiError(413, 'quota', `This workspace has used its ${limit / 1024 ** 3} GB of cloud storage.`);
  }
}

// ---------- versions ----------

async function cutVersion(env, ws, bench, version, content, userId, label = null) {
  const key = r2Key(ws, bench, version);
  await env.BENCHES.put(key, content, { httpMetadata: { contentType: 'application/json' } });
  await env.DB.prepare(
    `INSERT OR REPLACE INTO bench_versions (bench_id, version, r2_key, size_bytes, created_at, created_by, label)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(bench, version, key, bytes(content), now(), userId, label)
    .run();
  await prune(env, bench);
}

// Keep the newest 50, then the newest of each UTC day for 90 days.
export async function prune(env, bench, t = now()) {
  const { results } = await env.DB.prepare(
    'SELECT version, r2_key, created_at FROM bench_versions WHERE bench_id = ? ORDER BY version DESC',
  )
    .bind(bench)
    .all();
  const days = new Set();
  const drop = [];
  results.forEach((v, i) => {
    if (i < KEEP_RECENT) return;
    const day = Math.floor(v.created_at / 86400000);
    if (t - v.created_at < KEEP_DAILY_MS && !days.has(day)) days.add(day);
    else drop.push(v);
  });
  if (!drop.length) return;
  await env.BENCHES.delete(drop.map((v) => v.r2_key));
  await env.DB.batch(
    drop.map((v) => env.DB.prepare('DELETE FROM bench_versions WHERE bench_id = ? AND version = ?').bind(bench, v.version)),
  );
}

async function lastCut(env, bench) {
  const r = await env.DB.prepare('SELECT MAX(created_at) AS t FROM bench_versions WHERE bench_id = ?').bind(bench).first();
  return r.t || 0;
}

const audit = (env, ws, user, action, target) =>
  env.DB.prepare('INSERT INTO audit (id, workspace_id, user_id, action, target, at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(newId(), ws, user, action, target, now())
    .run();

// ---------- handlers ----------

// GET /v1/workspaces/:w/benches?folder=&q=&bin=1
export async function list(req, env, user, wsId) {
  const a = await workspaceAccess(env, user, wsId);
  const url = new URL(req.url);
  const bin = url.searchParams.get('bin') === '1';
  const q = (url.searchParams.get('q') || '').trim();
  const folder = url.searchParams.get('folder');
  let sql = `SELECT b.id, b.workspace_id, b.folder_id, b.name, b.head_version, b.size_bytes, b.created_at,
                    b.updated_at, b.deleted_at, b.updated_by, u.name AS updated_by_name, b.thumb_key,
                    b.forked_from, b.forked_version, b.forked_name
               FROM benches b LEFT JOIN users u ON u.id = b.updated_by
              WHERE b.workspace_id = ? AND b.deleted_at IS ${bin ? 'NOT NULL' : 'NULL'}`;
  const args = [a.ws];
  if (q) {
    sql += " AND b.name LIKE ? ESCAPE '\\'";
    args.push('%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%');
  } else if (folder !== null && !bin) {
    if (folder === '') sql += ' AND b.folder_id IS NULL';
    else {
      sql += ' AND b.folder_id = ?';
      args.push(folder);
    }
  }
  sql += bin ? ' ORDER BY b.deleted_at DESC' : ' ORDER BY b.updated_at DESC';
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  const used = await usage(env, a.ws);
  return {
    benches: results.map(meta),
    role: a.role,
    active: a.active,
    usage: { bytes: used, quota: QUOTA[a.kind] || QUOTA.personal },
  };
}

// POST /v1/workspaces/:w/benches  {name, folder_id?, content}
export async function create(req, env, user, wsId) {
  const a = await workspaceAccess(env, user, wsId);
  canWrite(a);
  const body = await readJson(req);
  const content = benchContent(body);
  const name = cleanName(body.name, 'Untitled bench');
  const folder = await folderIn(env, a.ws, body.folder_id);
  await checkQuota(env, a.ws, a.kind, 2 * bytes(content));
  const id = newId();
  const t = now();
  await env.DB.prepare(
    `INSERT INTO benches (id, workspace_id, folder_id, name, head_json, head_version, size_bytes,
                          created_at, created_by, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
  )
    .bind(id, a.ws, folder, name, content, bytes(content), t, user.id, t, user.id)
    .run();
  await cutVersion(env, a.ws, id, 1, content, user.id, body.label ? cleanName(body.label, null) : null);
  const { bench } = await benchAccess(env, user, id);
  return meta(bench);
}

// GET /v1/benches/:b
export async function get(env, user, benchId) {
  const { bench } = await benchAccess(env, user, benchId, { bin: true });
  const row = await env.DB.prepare('SELECT head_json FROM benches WHERE id = ?').bind(bench.id).first();
  return { ...meta(bench), content: row.head_json };
}

// PUT /v1/benches/:b  If-Match: <version>  {content, name?, checkpoint?, label?}
// The name travels with the content, so a save that is the last thing a
// closing page does still renames the bench.
export async function save(req, env, user, benchId) {
  const a = await benchAccess(env, user, benchId);
  canWrite(a);
  const match = Number((req.headers.get('If-Match') || '').replace(/[W/"]/g, ''));
  if (!Number.isInteger(match) || match < 1) {
    throw new ApiError(428, 'version_needed', 'Say which version this save is based on (If-Match).');
  }
  const body = await readJson(req);
  const content = benchContent(body);
  const b = a.bench;
  const growth = bytes(content) - b.size_bytes;
  if (growth > 0) await checkQuota(env, b.workspace_id, a.kind, growth);
  const t = now();
  const next = b.head_version + 1;
  // Only succeeds if nobody saved since the version the app started from.
  const r = await env.DB.prepare(
    `UPDATE benches SET head_json = ?, head_version = ?, size_bytes = ?, updated_at = ?, updated_by = ?, name = ?
      WHERE id = ? AND head_version = ? AND deleted_at IS NULL`,
  )
    .bind(content, next, bytes(content), t, user.id, cleanName(body.name, b.name), b.id, match)
    .run();
  if (!r.meta.changes) {
    const cur = await env.DB.prepare('SELECT head_version FROM benches WHERE id = ?').bind(b.id).first();
    throw new ApiError(409, 'conflict', 'This bench was saved somewhere else since you opened it.', {
      version: cur ? cur.head_version : null,
    });
  }
  const label = typeof body.label === 'string' ? cleanName(body.label, null) : null;
  if (body.checkpoint || label || t - (await lastCut(env, b.id)) >= CUT_EVERY) {
    await cutVersion(env, b.workspace_id, b.id, next, content, user.id, label);
  }
  return { id: b.id, version: next, updated_at: t, size_bytes: bytes(content), name: cleanName(body.name, b.name) };
}

// PATCH /v1/benches/:b  {name?, folder_id?}
export async function patch(req, env, user, benchId) {
  const a = await benchAccess(env, user, benchId);
  canWrite(a);
  const body = await readJson(req);
  const sets = [];
  const args = [];
  if (body.name !== undefined) {
    sets.push('name = ?');
    args.push(cleanName(body.name));
  }
  if (body.folder_id !== undefined) {
    sets.push('folder_id = ?');
    args.push(await folderIn(env, a.bench.workspace_id, body.folder_id));
  }
  if (!sets.length) throw new ApiError(400, 'bad_request', 'Nothing to change.');
  await env.DB.prepare(`UPDATE benches SET ${sets.join(', ')} WHERE id = ?`).bind(...args, a.bench.id).run();
  const { bench } = await benchAccess(env, user, benchId);
  return meta(bench);
}

// DELETE /v1/benches/:b — to the bin. Allowed without a plan, so a lapsed
// subscriber can still tidy up.
export async function remove(env, user, benchId) {
  const a = await benchAccess(env, user, benchId);
  canWrite(a, { plan: false });
  await env.DB.prepare('UPDATE benches SET deleted_at = ? WHERE id = ?').bind(now(), a.bench.id).run();
  await audit(env, a.bench.workspace_id, user.id, 'bench.delete', a.bench.id);
}

// POST /v1/benches/:b/undelete — back from the bin.
export async function undelete(env, user, benchId) {
  const a = await benchAccess(env, user, benchId, { bin: true });
  canWrite(a, { plan: false });
  if (!a.bench.deleted_at) throw new ApiError(409, 'not_deleted', 'That bench is not in the bin.');
  await env.DB.prepare('UPDATE benches SET deleted_at = NULL WHERE id = ?').bind(a.bench.id).run();
  await audit(env, a.bench.workspace_id, user.id, 'bench.undelete', a.bench.id);
  const { bench } = await benchAccess(env, user, benchId);
  return meta(bench);
}

// GET /v1/benches/:b/versions: the bench, where it was forked from, its forks, and its kept versions
export async function versions(env, user, benchId) {
  const { bench } = await benchAccess(env, user, benchId, { bin: true });
  const { results } = await env.DB.prepare(
    `SELECT v.version, v.size_bytes, v.created_at, v.label, v.created_by, u.name AS created_by_name
       FROM bench_versions v LEFT JOIN users u ON u.id = v.created_by
      WHERE v.bench_id = ? ORDER BY v.version DESC`,
  )
    .bind(bench.id)
    .all();
  return {
    bench: meta(bench),
    forked_from: meta(bench).forked_from,
    forks: await forksOf(env, user, bench.id),
    versions: results.map((v) => ({
      version: v.version,
      size_bytes: v.size_bytes,
      created_at: v.created_at,
      label: v.label,
      created_by: v.created_by ? { id: v.created_by, name: v.created_by_name } : null,
    })),
  };
}

async function versionContent(env, benchId, version) {
  const v = await env.DB.prepare('SELECT r2_key FROM bench_versions WHERE bench_id = ? AND version = ?')
    .bind(benchId, version)
    .first();
  const obj = v && (await env.BENCHES.get(v.r2_key));
  if (!obj) throw new ApiError(404, 'not_found', 'No such version.');
  return obj.text();
}

// GET /v1/benches/:b/versions/:v
export async function version(env, user, benchId, v) {
  const { bench } = await benchAccess(env, user, benchId, { bin: true });
  return { id: bench.id, version: Number(v), content: await versionContent(env, bench.id, Number(v)) };
}

// POST /v1/benches/:b/versions/:v/restore — the old version becomes the head,
// after the current head is kept as a version of its own.
export async function restore(env, user, benchId, v) {
  const a = await benchAccess(env, user, benchId);
  canWrite(a);
  const b = a.bench;
  const old = await versionContent(env, b.id, Number(v));
  const head = await env.DB.prepare('SELECT head_json FROM benches WHERE id = ?').bind(b.id).first();
  const cut = await env.DB.prepare('SELECT 1 FROM bench_versions WHERE bench_id = ? AND version = ?')
    .bind(b.id, b.head_version)
    .first();
  if (!cut) await cutVersion(env, b.workspace_id, b.id, b.head_version, head.head_json, b.updated_by);
  const next = b.head_version + 1;
  const t = now();
  const r = await env.DB.prepare(
    `UPDATE benches SET head_json = ?, head_version = ?, size_bytes = ?, updated_at = ?, updated_by = ?
      WHERE id = ? AND head_version = ?`,
  )
    .bind(old, next, bytes(old), t, user.id, b.id, b.head_version)
    .run();
  if (!r.meta.changes) throw new ApiError(409, 'conflict', 'This bench was saved somewhere else meanwhile; try again.');
  await cutVersion(env, b.workspace_id, b.id, next, old, user.id, `Restored from version ${Number(v)}`);
  await audit(env, b.workspace_id, user.id, 'bench.restore', `${b.id}@${Number(v)}`);
  return { id: b.id, version: next, updated_at: t, size_bytes: bytes(old) };
}

// ---------- forks ----------
//
// A fork is a new bench made from another's current state or one of its
// versions, that remembers where it came from (its parent only, as in git).
// The original is untouched. Reading the original is all it takes; the fork
// goes where the caller may save.

// POST /v1/benches/:b/fork  {version?, name?, workspace_id?, folder_id?}
export async function fork(req, env, user, benchId) {
  const src = (await benchAccess(env, user, benchId)).bench;
  const body = await readJson(req);
  const ws = body.workspace_id || src.workspace_id;
  const a = await workspaceAccess(env, user, ws);
  canWrite(a);
  const v = body.version === undefined || body.version === null ? null : Number(body.version);
  if (v !== null && !(Number.isInteger(v) && v >= 1)) throw new ApiError(400, 'bad_request', 'version must be a version number.');
  let content;
  if (v === null) content = (await env.DB.prepare('SELECT head_json FROM benches WHERE id = ?').bind(src.id).first()).head_json;
  else content = await versionContent(env, src.id, v);
  const from = v || src.head_version;
  const folder = body.folder_id === undefined && a.ws === src.workspace_id ? src.folder_id : await folderIn(env, a.ws, body.folder_id);
  const name = cleanName(body.name, cleanName(`${src.name} (fork)`));
  await checkQuota(env, a.ws, a.kind, 2 * bytes(content));
  const id = newId();
  const t = now();
  await env.DB.prepare(
    `INSERT INTO benches (id, workspace_id, folder_id, name, head_json, head_version, size_bytes,
                          created_at, created_by, updated_at, updated_by, forked_from, forked_version, forked_name)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, a.ws, folder, name, content, bytes(content), t, user.id, t, user.id, src.id, from, src.name)
    .run();
  await cutVersion(env, a.ws, id, 1, content, user.id, `Forked from “${src.name}”, version ${from}`);
  // the original's picture, when the fork is of how it is now
  if (v === null && src.thumb_key) {
    const obj = await env.BENCHES.get(src.thumb_key);
    if (obj) {
      const key = `w/${a.ws}/b/${id}/t/${newId()}`;
      await env.BENCHES.put(key, await obj.arrayBuffer(), { httpMetadata: obj.httpMetadata });
      await env.DB.prepare('UPDATE benches SET thumb_key = ? WHERE id = ?').bind(key, id).run();
    }
  }
  await audit(env, a.ws, user.id, 'bench.fork', `${id}<${src.id}@${from}`);
  return meta((await benchAccess(env, user, id)).bench);
}

// The forks of a bench that the caller can see (in workspaces they belong to).
async function forksOf(env, user, benchId) {
  const { results } = await env.DB.prepare(
    `SELECT b.id, b.workspace_id, b.name, b.forked_version, b.updated_at
       FROM benches b JOIN members m ON m.workspace_id = b.workspace_id AND m.user_id = ?
      WHERE b.forked_from = ? AND b.deleted_at IS NULL
      ORDER BY b.created_at DESC LIMIT 100`,
  )
    .bind(user.id, benchId)
    .all();
  return results.map((f) => ({ id: f.id, workspace_id: f.workspace_id, name: f.name, version: f.forked_version, updated_at: f.updated_at }));
}

// ---------- thumbnails ----------
//
// A small picture of the bench, drawn by the app after a save and shown in
// My benches. One per bench, in R2 under a fresh name each time, so its URL
// changes when it does and the browser can keep each one for good.

export const MAX_THUMB = 128 * 1024;
const thumbPath = (id, key) => (key ? `/v1/benches/${id}/thumb?k=${key.slice(key.lastIndexOf('/') + 1)}` : null);

// The image's type from its first bytes; anything else is refused, so what
// is served back can only ever be one of these.
function imageType(b) {
  const at = (i, ...xs) => xs.every((x, j) => b[i + j] === x);
  if (b.length > 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  if (b.length > 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (b.length > 3 && at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  return null;
}

// PUT /v1/benches/:b/thumb  with the image itself as the body
export async function putThumb(req, env, user, benchId) {
  const a = await benchAccess(env, user, benchId);
  canWrite(a);
  if (Number(req.headers.get('Content-Length') || 0) > MAX_THUMB) throw new ApiError(413, 'too_large', 'A thumbnail can be at most 128 KB.');
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length > MAX_THUMB) throw new ApiError(413, 'too_large', 'A thumbnail can be at most 128 KB.');
  const type = imageType(body);
  if (!type) throw new ApiError(415, 'bad_image', 'A thumbnail must be a WebP, PNG or JPEG image.');
  const b = a.bench;
  const key = `w/${b.workspace_id}/b/${b.id}/t/${newId()}`;
  await env.BENCHES.put(key, body, { httpMetadata: { contentType: type } });
  // Only replaces the one this request saw: of two at once, the loser's image is dropped.
  const r = await env.DB.prepare('UPDATE benches SET thumb_key = ? WHERE id = ? AND thumb_key IS ?').bind(key, b.id, b.thumb_key).run();
  if (!r.meta.changes) {
    await env.BENCHES.delete(key);
    throw new ApiError(409, 'conflict', 'Another thumbnail was saved at the same time.');
  }
  if (b.thumb_key) await env.BENCHES.delete(b.thumb_key);
  return { thumb: thumbPath(b.id, key) };
}

// GET /v1/benches/:b/thumb
export async function getThumb(env, user, benchId) {
  const { bench } = await benchAccess(env, user, benchId, { bin: true });
  const obj = bench.thumb_key && (await env.BENCHES.get(bench.thumb_key));
  if (!obj) throw new ApiError(404, 'not_found', 'This bench has no thumbnail yet.');
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata.contentType,
      'Content-Length': String(obj.size),
      // its URL names this image alone, and only this person may see it
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-site',
    },
  });
}

// ---------- folders ----------

export async function folders(env, user, wsId) {
  const a = await workspaceAccess(env, user, wsId);
  const { results } = await env.DB.prepare(
    'SELECT id, parent_id, name, created_at FROM folders WHERE workspace_id = ? ORDER BY name COLLATE NOCASE',
  )
    .bind(a.ws)
    .all();
  return { folders: results };
}

export async function createFolder(req, env, user, wsId) {
  const a = await workspaceAccess(env, user, wsId);
  canWrite(a);
  const body = await readJson(req);
  const parent = await folderIn(env, a.ws, body.parent_id);
  const f = { id: newId(), parent_id: parent, name: cleanName(body.name), created_at: now() };
  await env.DB.prepare('INSERT INTO folders (id, workspace_id, parent_id, name, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(f.id, a.ws, f.parent_id, f.name, f.created_at)
    .run();
  return f;
}

export async function patchFolder(req, env, user, wsId, folderId) {
  const a = await workspaceAccess(env, user, wsId);
  canWrite(a);
  const id = await folderIn(env, a.ws, folderId);
  if (!id) throw new ApiError(404, 'not_found', 'No such folder.');
  const body = await readJson(req);
  if (body.name !== undefined) {
    await env.DB.prepare('UPDATE folders SET name = ? WHERE id = ?').bind(cleanName(body.name), id).run();
  }
  if (body.parent_id !== undefined) {
    const parent = await folderIn(env, a.ws, body.parent_id);
    // A folder cannot go inside itself or one of its own subfolders.
    for (let p = parent; p; ) {
      if (p === id) throw new ApiError(400, 'bad_folder', 'A folder cannot go inside itself.');
      p = (await env.DB.prepare('SELECT parent_id FROM folders WHERE id = ?').bind(p).first()).parent_id;
    }
    await env.DB.prepare('UPDATE folders SET parent_id = ? WHERE id = ?').bind(parent, id).run();
  }
  return env.DB.prepare('SELECT id, parent_id, name, created_at FROM folders WHERE id = ?').bind(id).first();
}

// Only an empty folder goes (no benches, deleted ones included, no subfolders).
export async function deleteFolder(env, user, wsId, folderId) {
  const a = await workspaceAccess(env, user, wsId);
  canWrite(a, { plan: false });
  const id = await folderIn(env, a.ws, folderId);
  if (!id) throw new ApiError(404, 'not_found', 'No such folder.');
  const r = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM benches WHERE folder_id = ?1 AND deleted_at IS NULL)
          + (SELECT COUNT(*) FROM folders WHERE parent_id = ?1) AS n`,
  )
    .bind(id)
    .first();
  if (r.n) throw new ApiError(409, 'not_empty', 'Empty the folder first.');
  await env.DB.batch([
    env.DB.prepare('UPDATE benches SET folder_id = NULL WHERE folder_id = ?').bind(id),
    env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(id),
  ]);
}

// ---------- the bin, emptied daily ----------

export async function purgeBin(env, t = now()) {
  const { results } = await env.DB.prepare('SELECT id, thumb_key FROM benches WHERE deleted_at IS NOT NULL AND deleted_at < ?')
    .bind(t - BIN_MS)
    .all();
  for (const { id, thumb_key } of results) {
    if (thumb_key) await env.BENCHES.delete(thumb_key);
    const { results: vs } = await env.DB.prepare('SELECT r2_key FROM bench_versions WHERE bench_id = ?').bind(id).all();
    for (let i = 0; i < vs.length; i += 1000) await env.BENCHES.delete(vs.slice(i, i + 1000).map((v) => v.r2_key));
    await env.DB.prepare('DELETE FROM benches WHERE id = ?').bind(id).run(); // versions go with it
  }
  return results.length;
}
