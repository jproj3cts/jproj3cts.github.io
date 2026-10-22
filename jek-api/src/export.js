// GET /v1/me/export: everything we hold about the person, as a zip — their
// account as JSON, the current version of every bench in every workspace
// they belong to, in its folders, their saved parts, and the benches in their
// share links (with a list of the links), and the part packs they signed.
// Works with or without a plan.

import { me } from './users.js';
import { zip } from './zip.js';

// A file or folder name that every unzip tool keeps inside the folder it
// unzips into: no slashes or reserved characters, and no leading dots (so
// never '.' or '..').
const safe = (s) =>
  String(s || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').trim().slice(0, 80) || 'Untitled';

// a share link's bench as JSON text: its text is "z" then base64url of deflated JSON, or "j" then base64url of JSON
async function linkBench(t) {
  try {
    const b = atob(t.slice(1).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length - 1 + 3) % 4));
    let bytes = Uint8Array.from(b, (c) => c.charCodeAt(0));
    if (t[0] === 'z') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    const json = new TextDecoder().decode(bytes);
    JSON.parse(json);
    return json;
  } catch {
    return null;
  }
}

export async function exportAll(env, user) {
  const account = await me(env, user);
  const files = [];
  for (const w of account.workspaces) {
    const top = w.kind === 'personal' ? 'My benches' : safe(w.name);
    const { results: folders } = await env.DB.prepare('SELECT id, parent_id, name FROM folders WHERE workspace_id = ?')
      .bind(w.id)
      .all();
    const byId = new Map(folders.map((f) => [f.id, f]));
    const path = (id) => {
      const parts = [];
      for (let f = byId.get(id), n = 0; f && n < 50; f = byId.get(f.parent_id), n++) parts.unshift(safe(f.name));
      return parts.join('/');
    };
    const { results: benches } = await env.DB.prepare(
      'SELECT folder_id, name, head_json FROM benches WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY name',
    )
      .bind(w.id)
      .all();
    const taken = new Set();
    // My parts, each as a .jekpart file (a part as the app copies it, with its name)
    const { results: parts } = await env.DB.prepare('SELECT name, summary, content FROM parts WHERE workspace_id = ? ORDER BY name')
      .bind(w.id)
      .all();
    for (const p of parts) {
      let name = `${top}/My parts/${safe(p.name)}.jekpart`;
      for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${top}/My parts/${safe(p.name)} (${i}).jekpart`;
      taken.add(name.toLowerCase());
      files.push({ name, data: JSON.stringify({ ...JSON.parse(p.content), name: p.name, summary: p.summary }) });
    }
    for (const b of benches) {
      const dir = [top, path(b.folder_id)].filter(Boolean).join('/');
      let name = `${dir}/${safe(b.name)}.jekray`;
      for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${dir}/${safe(b.name)} (${i}).jekray`;
      taken.add(name.toLowerCase());
      files.push({ name, data: b.head_json });
    }
  }
  // share links: each link's bench as a .jekray file, and the links themselves listed
  const { results: links } = await env.DB.prepare('SELECT id, name, r2_key, created_at, opens, opened_at FROM share_links WHERE user_id = ? ORDER BY created_at')
    .bind(user.id)
    .all();
  const site = String(env.APP_ORIGINS || 'https://jeksys.net').split(',')[0].trim();
  for (const l of links) {
    const obj = await env.BENCHES.get(l.r2_key);
    const text = obj && (await linkBench(await obj.text()));
    if (text) files.push({ name: `Share links/${safe(l.name)} (${l.id}).jekray`, data: text });
  }
  if (links.length) {
    files.push({ name: 'Share links/links.json', data: JSON.stringify(links.map((l) => ({ url: `${site}/s/${l.id}`, name: l.name, created_at: l.created_at, opens: l.opens, opened_at: l.opened_at })), null, 2) });
  }
  const { results: sessions } = await env.DB.prepare(
    'SELECT created_at, expires_at, user_agent FROM sessions WHERE user_id = ?',
  )
    .bind(user.id)
    .all();
  // part packs signed with the account (only their record is kept: id, hash, version, when)
  const { results: packs } = await env.DB.prepare(
    "SELECT id, pack_version, kind, hash, signer_name, signed_at, revoked_at, reason FROM pack_sigs WHERE (signer_kind = 'person' AND signer_id = ?) OR asked_by = ? ORDER BY signed_at",
  ).bind(user.id, user.id).all();
  if (packs.length) files.push({ name: 'Part packs signed.json', data: JSON.stringify(packs, null, 2) });
  files.unshift({ name: 'account.json', data: JSON.stringify({ ...account, sessions, exported_at: new Date().toISOString() }, null, 2) });
  return zip(files);
}
