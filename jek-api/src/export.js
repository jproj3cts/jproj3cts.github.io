// GET /v1/me/export: everything we hold about the person, as a zip — their
// account as JSON, and the current version of every bench in every workspace
// they belong to, in its folders. Works with or without a plan.

import { me } from './users.js';
import { zip } from './zip.js';

// A file or folder name that every unzip tool keeps inside the folder it
// unzips into: no slashes or reserved characters, and no leading dots (so
// never '.' or '..').
const safe = (s) =>
  String(s || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').trim().slice(0, 80) || 'Untitled';

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
    for (const b of benches) {
      const dir = [top, path(b.folder_id)].filter(Boolean).join('/');
      let name = `${dir}/${safe(b.name)}.jekray`;
      for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${dir}/${safe(b.name)} (${i}).jekray`;
      taken.add(name.toLowerCase());
      files.push({ name, data: b.head_json });
    }
  }
  const { results: sessions } = await env.DB.prepare(
    'SELECT created_at, expires_at, user_agent FROM sessions WHERE user_id = ?',
  )
    .bind(user.id)
    .all();
  files.unshift({ name: 'account.json', data: JSON.stringify({ ...account, sessions, exported_at: new Date().toISOString() }, null, 2) });
  return zip(files);
}
