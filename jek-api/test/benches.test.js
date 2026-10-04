import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { prune, purgeBin, BIN_MS } from '../src/benches.js';
import { crc32 } from '../src/zip.js';
import { bench, call, send, signedIn, withPlan } from './helpers.js';

const DAY = 86400000;
const json = async (res) => ({ status: res.status, body: await res.json(), etag: res.headers.get('ETag') });

async function pro(name) {
  const s = await signedIn(name);
  await withPlan(s.workspaceId);
  return s;
}
async function make(s, name = 'Bench', extra = {}) {
  const r = await json(await send(`/v1/workspaces/${s.workspaceId}/benches`, 'POST', s.token, { name, content: bench(name), ...extra }));
  expect(r.status).toBe(201);
  return r.body;
}
const put = (s, id, version, content, extra = {}) =>
  send(`/v1/benches/${id}`, 'PUT', s.token, { content, ...extra }, { 'If-Match': `"${version}"` });
const versionsOf = async (s, id) => (await json(await call(`/v1/benches/${id}/versions`, { token: s.token }))).body.versions;

describe('creating and reading', () => {
  it('creates a bench, lists it, and returns its content and version', async () => {
    const s = await pro('Ada');
    const b = await make(s, 'Michelson');
    expect(b).toMatchObject({ name: 'Michelson', version: 1, folder_id: null, updated_by: { id: s.user.id, name: 'Ada' } });
    const list = (await json(await call(`/v1/workspaces/${s.workspaceId}/benches`, { token: s.token }))).body;
    expect(list.benches.map((x) => x.id)).toEqual([b.id]);
    expect(list).toMatchObject({ role: 'owner', active: true });
    expect(list.usage.quota).toBe(1024 ** 3);
    expect(list.usage.bytes).toBe(2 * bench('Michelson').length); // the head and version 1
    const got = await json(await call(`/v1/benches/${b.id}`, { token: s.token }));
    expect(got.body.content).toBe(bench('Michelson'));
    expect(got.etag).toBe('"1"');
    // Version 1 is in R2.
    const v = await versionsOf(s, b.id);
    expect(v.map((x) => x.version)).toEqual([1]);
    expect(await (await env.BENCHES.get(`w/${s.workspaceId}/b/${b.id}/v/1.jekray`)).text()).toBe(bench('Michelson'));
  });

  it('needs a plan to create, but not to read', async () => {
    const s = await signedIn();
    const r = await json(await send(`/v1/workspaces/${s.workspaceId}/benches`, 'POST', s.token, { name: 'x', content: bench() }));
    expect(r.status).toBe(402);
    expect(r.body.error.code).toBe('no_plan');
    expect((await call(`/v1/workspaces/${s.workspaceId}/benches`, { token: s.token })).status).toBe(200);
  });

  it('refuses what is not a bench, and anything over 2 MB', async () => {
    const s = await pro();
    const url = `/v1/workspaces/${s.workspaceId}/benches`;
    for (const content of [undefined, 42, 'not json', '[1,2]', '{"no":"format"}']) {
      const r = await json(await send(url, 'POST', s.token, { name: 'x', content }));
      expect(r.status).toBe(400);
    }
    const big = bench('big', { notes: 'x'.repeat(2 * 1024 * 1024) });
    expect((await send(url, 'POST', s.token, { name: 'x', content: big })).status).toBe(413);
  });

  it('cleans names: control characters out, blank becomes Untitled', async () => {
    const s = await pro();
    expect((await make(s, '  Two\u0000 lenses\n ')).name).toBe('Two lenses');
    const r = await json(await send(`/v1/workspaces/${s.workspaceId}/benches`, 'POST', s.token, { name: '   ', content: bench() }));
    expect(r.body.name).toBe('Untitled bench');
  });

  it('searches by name, treating % and _ as plain characters', async () => {
    const s = await pro();
    await make(s, 'Laser 100% power');
    await make(s, 'Laser_A');
    await make(s, 'Telescope');
    const q = async (t) => (await json(await call(`/v1/workspaces/${s.workspaceId}/benches?q=${encodeURIComponent(t)}`, { token: s.token }))).body.benches.map((b) => b.name).sort();
    expect(await q('laser')).toEqual(['Laser 100% power', 'Laser_A']);
    expect(await q('%')).toEqual(['Laser 100% power']);
    expect(await q('_')).toEqual(['Laser_A']);
  });
});

describe('saving', () => {
  it('saves on top of the version it was based on', async () => {
    const s = await pro();
    const b = await make(s);
    const r = await json(await put(s, b.id, 1, bench('Bench', { notes: 'v2' })));
    expect(r.status).toBe(200);
    expect(r.body.version).toBe(2);
    expect(r.etag).toBe('"2"');
    expect((await json(await call(`/v1/benches/${b.id}`, { token: s.token }))).body.content).toContain('v2');
  });

  it('refuses a save based on an older version, saying which is newer', async () => {
    const s = await pro();
    const b = await make(s);
    await put(s, b.id, 1, bench('Bench', { notes: 'tab A' }));
    const r = await json(await put(s, b.id, 1, bench('Bench', { notes: 'tab B' })));
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'conflict', version: 2 });
    expect((await json(await call(`/v1/benches/${b.id}`, { token: s.token }))).body.content).toContain('tab A');
  });

  it('renames with the save when a name comes with it', async () => {
    const s = await pro();
    const b = await make(s, 'Before');
    const r = await json(await put(s, b.id, 1, bench('After'), { name: 'After' }));
    expect(r.body).toMatchObject({ version: 2, name: 'After' });
    expect((await json(await put(s, b.id, 2, bench('x')))).body.name).toBe('After'); // no name: kept
  });

  it('needs If-Match', async () => {
    const s = await pro();
    const b = await make(s);
    const r = await send(`/v1/benches/${b.id}`, 'PUT', s.token, { content: bench() });
    expect(r.status).toBe(428);
  });

  it('cuts a version on Save, and otherwise at most every 10 minutes', async () => {
    const s = await pro();
    const b = await make(s);
    await put(s, b.id, 1, bench('a'));                       // autosave: too soon after version 1
    await put(s, b.id, 2, bench('b'), { checkpoint: true }); // Save
    await put(s, b.id, 3, bench('c'));                       // autosave: too soon
    expect((await versionsOf(s, b.id)).map((v) => v.version)).toEqual([3, 1]);
    await env.DB.prepare('UPDATE bench_versions SET created_at = created_at - 11 * 60000 WHERE bench_id = ?').bind(b.id).run();
    await put(s, b.id, 4, bench('d'));                       // autosave, 11 minutes on
    const v = await versionsOf(s, b.id);
    expect(v.map((x) => x.version)).toEqual([5, 3, 1]);
    expect(v[0].created_by).toEqual({ id: s.user.id, name: s.user.name });
  });

  it('stops saving when the plan lapses, but reading, deleting and export carry on', async () => {
    const s = await pro();
    const b = await make(s);
    await withPlan(s.workspaceId, 'canceled', Date.now() - DAY);
    expect((await put(s, b.id, 1, bench('x'))).status).toBe(402);
    expect((await call(`/v1/benches/${b.id}`, { token: s.token })).status).toBe(200);
    expect((await call(`/v1/benches/${b.id}/versions/1`, { token: s.token })).status).toBe(200);
    expect((await call('/v1/me/export', { token: s.token })).status).toBe(200);
    expect((await call(`/v1/benches/${b.id}`, { method: 'DELETE', token: s.token })).status).toBe(200);
  });

  it('keeps saving through 7 days of grace after a failed payment', async () => {
    const s = await pro();
    const b = await make(s);
    await withPlan(s.workspaceId, 'past_due', Date.now() - 2 * DAY);
    expect((await put(s, b.id, 1, bench('x'))).status).toBe(200);
    await withPlan(s.workspaceId, 'past_due', Date.now() - 8 * DAY);
    expect((await put(s, b.id, 2, bench('y'))).status).toBe(402);
  });

  it('refuses to go over the workspace quota', async () => {
    const s = await pro();
    const b = await make(s);
    await env.DB.prepare("INSERT INTO bench_versions VALUES (?, 999, 'none', ?, 0, ?, 'filler')").bind(b.id, 1024 ** 3, s.user.id).run();
    const r = await json(await put(s, b.id, 1, bench('Bench', { notes: 'grow' })));
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe('quota');
  });
});

describe('other people’s benches', () => {
  it('cannot be listed, read, saved, renamed, deleted or restored', async () => {
    const owner = await pro('Owner');
    const b = await make(owner, 'Private');
    const other = await pro('Other');
    const tries = [
      call(`/v1/workspaces/${owner.workspaceId}/benches`, { token: other.token }),
      send(`/v1/workspaces/${owner.workspaceId}/benches`, 'POST', other.token, { name: 'x', content: bench() }),
      call(`/v1/workspaces/${owner.workspaceId}/folders`, { token: other.token }),
      call(`/v1/benches/${b.id}`, { token: other.token }),
      put(other, b.id, 1, bench('hijack')),
      send(`/v1/benches/${b.id}`, 'PATCH', other.token, { name: 'mine' }),
      call(`/v1/benches/${b.id}`, { method: 'DELETE', token: other.token }),
      call(`/v1/benches/${b.id}/versions`, { token: other.token }),
      call(`/v1/benches/${b.id}/versions/1`, { token: other.token }),
      call(`/v1/benches/${b.id}/versions/1/restore`, { method: 'POST', token: other.token }),
      call(`/v1/benches/${b.id}/undelete`, { method: 'POST', token: other.token }),
    ];
    for (const res of await Promise.all(tries)) expect(res.status).toBe(404);
    const exported = await (await call('/v1/me/export', { token: other.token })).arrayBuffer();
    expect(new TextDecoder().decode(exported)).not.toContain('Private');
    const still = (await json(await call(`/v1/benches/${b.id}`, { token: owner.token }))).body;
    expect(still).toMatchObject({ name: 'Private', version: 1, deleted_at: null });
  });

  it('cannot be moved into a folder of another workspace', async () => {
    const a = await pro();
    const b = await pro();
    const f = (await json(await send(`/v1/workspaces/${b.workspaceId}/folders`, 'POST', b.token, { name: 'Theirs' }))).body;
    const mine = await make(a);
    const r = await send(`/v1/benches/${mine.id}`, 'PATCH', a.token, { folder_id: f.id });
    expect(r.status).toBe(400);
  });

  it('viewers can read but not change a team’s benches', async () => {
    const owner = await pro();
    const b = await make(owner);
    const viewer = await signedIn();
    await env.DB.prepare("INSERT INTO members VALUES (?, ?, 'viewer', 0, 0)").bind(owner.workspaceId, viewer.user.id).run();
    expect((await call(`/v1/benches/${b.id}`, { token: viewer.token })).status).toBe(200);
    for (const res of [
      await put(viewer, b.id, 1, bench('x')),
      await send(`/v1/benches/${b.id}`, 'PATCH', viewer.token, { name: 'y' }),
      await call(`/v1/benches/${b.id}`, { method: 'DELETE', token: viewer.token }),
    ]) expect(res.status).toBe(403);
  });
});

describe('rename, folders and the bin', () => {
  it('renames and moves between folders, and lists by folder', async () => {
    const s = await pro();
    const ws = `/v1/workspaces/${s.workspaceId}`;
    const optics = (await json(await send(`${ws}/folders`, 'POST', s.token, { name: 'Optics' }))).body;
    const lasers = (await json(await send(`${ws}/folders`, 'POST', s.token, { name: 'Lasers', parent_id: optics.id }))).body;
    const b = await make(s, 'Old name');
    const p = (await json(await send(`/v1/benches/${b.id}`, 'PATCH', s.token, { name: 'New name', folder_id: lasers.id }))).body;
    expect(p).toMatchObject({ name: 'New name', folder_id: lasers.id });
    const inFolder = async (f) => (await json(await call(`${ws}/benches?folder=${f}`, { token: s.token }))).body.benches.length;
    expect(await inFolder(lasers.id)).toBe(1);
    expect(await inFolder('')).toBe(0);
    expect((await json(await call(`${ws}/folders`, { token: s.token }))).body.folders.map((f) => f.name)).toEqual(['Lasers', 'Optics']);
    // A folder cannot go inside its own subfolder; a non-empty folder stays.
    expect((await send(`${ws}/folders/${optics.id}`, 'PATCH', s.token, { parent_id: lasers.id })).status).toBe(400);
    expect((await call(`${ws}/folders/${optics.id}`, { method: 'DELETE', token: s.token })).status).toBe(409);
    expect((await call(`${ws}/folders/${lasers.id}`, { method: 'DELETE', token: s.token })).status).toBe(409);
    await send(`/v1/benches/${b.id}`, 'PATCH', s.token, { folder_id: null });
    expect((await call(`${ws}/folders/${lasers.id}`, { method: 'DELETE', token: s.token })).status).toBe(200);
    expect((await send(`${ws}/folders/${optics.id}`, 'PATCH', s.token, { name: 'Optics 2' })).status).toBe(200);
  });

  it('deletes to the bin and brings back', async () => {
    const s = await pro();
    const b = await make(s);
    const ws = `/v1/workspaces/${s.workspaceId}/benches`;
    await call(`/v1/benches/${b.id}`, { method: 'DELETE', token: s.token });
    expect((await json(await call(ws, { token: s.token }))).body.benches).toEqual([]);
    const bin = (await json(await call(`${ws}?bin=1`, { token: s.token }))).body.benches;
    expect(bin.map((x) => x.id)).toEqual([b.id]);
    expect(bin[0].deleted_at).toBeGreaterThan(0);
    expect((await put(s, b.id, 1, bench('x'))).status).toBe(404);
    expect((await call(`/v1/benches/${b.id}/undelete`, { method: 'POST', token: s.token })).status).toBe(200);
    expect((await json(await call(ws, { token: s.token }))).body.benches.map((x) => x.id)).toEqual([b.id]);
    const log = await env.DB.prepare('SELECT action FROM audit WHERE target = ? ORDER BY at').bind(b.id).all();
    expect(log.results.map((r) => r.action)).toEqual(['bench.delete', 'bench.undelete']);
  });

  it('empties the bin after 30 days, history included', async () => {
    const s = await pro();
    const old = await make(s, 'Old');
    const recent = await make(s, 'Recent');
    const t = Date.now();
    await env.DB.prepare('UPDATE benches SET deleted_at = ? WHERE id = ?').bind(t - BIN_MS - DAY, old.id).run();
    await env.DB.prepare('UPDATE benches SET deleted_at = ? WHERE id = ?').bind(t - BIN_MS + DAY, recent.id).run();
    expect(await purgeBin(env, t)).toBeGreaterThanOrEqual(1);
    expect(await env.DB.prepare('SELECT id FROM benches WHERE id = ?').bind(old.id).first()).toBeNull();
    expect(await env.DB.prepare('SELECT 1 FROM bench_versions WHERE bench_id = ?').bind(old.id).first()).toBeNull();
    expect(await env.BENCHES.get(`w/${s.workspaceId}/b/${old.id}/v/1.jekray`)).toBeNull();
    expect(await env.DB.prepare('SELECT id FROM benches WHERE id = ?').bind(recent.id).first()).not.toBeNull();
  });
});

describe('history', () => {
  it('restores an old version, keeping the current one first', async () => {
    const s = await pro();
    const b = await make(s, 'R');
    await put(s, b.id, 1, bench('R', { notes: 'second' }));  // version 2, not cut
    const r = await json(await call(`/v1/benches/${b.id}/versions/1/restore`, { method: 'POST', token: s.token }));
    expect(r.status).toBe(200);
    expect(r.body.version).toBe(3);
    const head = (await json(await call(`/v1/benches/${b.id}`, { token: s.token }))).body;
    expect(head.content).toBe(bench('R'));
    const v = await versionsOf(s, b.id);
    expect(v.map((x) => [x.version, x.label])).toEqual([[3, 'Restored from version 1'], [2, null], [1, null]]);
    expect((await json(await call(`/v1/benches/${b.id}/versions/2`, { token: s.token }))).body.content).toContain('second');
    expect((await call(`/v1/benches/${b.id}/versions/9`, { token: s.token })).status).toBe(404);
  });

  it('keeps the last 50, then one a day for 90 days', async () => {
    const s = await pro();
    const b = await make(s);
    const t = Date.now();
    // 120 more versions: 60 in the last hour, then two a day going back 30 days.
    const rows = [];
    for (let i = 0; i < 60; i++) rows.push([1000 - i, t - i * 60000]);
    for (let d = 1; d <= 30; d++) for (const h of [2, 14]) rows.push([900 - d * 2 - (h === 14 ? 0 : 1), t - d * DAY - h * 3600000]);
    rows.push([10, t - 100 * DAY]); // older than 90 days
    for (const [v, at] of rows) {
      await env.BENCHES.put(`k${b.id}${v}`, 'x');
      await env.DB.prepare("INSERT OR REPLACE INTO bench_versions VALUES (?, ?, ?, 1, ?, ?, NULL)").bind(b.id, v, `k${b.id}${v}`, at, s.user.id).run();
    }
    await prune(env, b.id, t);
    const kept = (await env.DB.prepare('SELECT version, created_at FROM bench_versions WHERE bench_id = ? ORDER BY version DESC').bind(b.id).all()).results;
    expect(kept.slice(0, 50).map((v) => v.version)).toEqual(rows.slice(0, 50).map((r) => r[0]));
    const older = kept.slice(50);
    const days = older.map((v) => Math.floor(v.created_at / DAY));
    expect(new Set(days).size).toBe(days.length);            // at most one a day
    expect(older.every((v) => t - v.created_at < 90 * DAY)).toBe(true);
    expect(await env.BENCHES.get(`k${b.id}10`)).toBeNull();   // removed from R2 too
  });
});

describe('export', () => {
  // Reads a stored zip's entries back.
  function unzip(buf) {
    const d = new DataView(buf), out = {};
    let p = 0;
    while (d.getUint32(p, true) === 0x04034b50) {
      const crc = d.getUint32(p + 14, true), size = d.getUint32(p + 18, true), nl = d.getUint16(p + 26, true);
      const name = new TextDecoder().decode(new Uint8Array(buf, p + 30, nl));
      const data = new Uint8Array(buf, p + 30 + nl, size);
      expect(crc32(data)).toBe(crc);
      out[name] = new TextDecoder().decode(data);
      p += 30 + nl + size;
    }
    return out;
  }

  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('gives the account and every current bench, in folders, as a zip', async () => {
    const s = await pro('Exporter');
    const f = (await json(await send(`/v1/workspaces/${s.workspaceId}/folders`, 'POST', s.token, { name: 'Lasers' }))).body;
    await make(s, 'Same');
    await make(s, 'Same');
    await make(s, 'In / folder', { folder_id: f.id });
    const gone = await make(s, 'Deleted one');
    await call(`/v1/benches/${gone.id}`, { method: 'DELETE', token: s.token });
    const res = await call('/v1/me/export', { token: s.token });
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="jekray2d-export-\d{4}-\d\d-\d\d\.zip"/);
    const files = unzip(await res.arrayBuffer());
    expect(Object.keys(files).sort()).toEqual([
      'My benches/Lasers/In folder.jekray', 'My benches/Same (2).jekray', 'My benches/Same.jekray', 'account.json',
    ]);
    expect(JSON.parse(files['account.json']).user.name).toBe('Exporter');
    expect(files['My benches/Same.jekray']).toBe(bench('Same'));
  });
});
