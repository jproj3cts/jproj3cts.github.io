/* ==========================================================================
   The file system's arithmetic, with no page in it: the folders as a tree, what each holds (its folders inside it
   counted too), whether a folder may go into another, the benches in the order asked for, and the run of benches a
   Shift-click picks. home.js draws from these; test/node/files.test.mjs checks them.
   ========================================================================== */

/* each folder's own folders, by name: Map(parent id or null -> [folder]) */
export function folderKids(folders) {
  const ids = new Set(folders.map(f => f.id)), kids = new Map();
  for (const f of folders) { const p = f.parent_id && ids.has(f.parent_id) ? f.parent_id : null; if (!kids.has(p)) kids.set(p, []); kids.get(p).push(f); }
  for (const list of kids.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return kids;
}
/* a folder's path from the top, itself last (a loop in the data ends the walk) */
export function folderPath(folders, id) {
  const byId = new Map(folders.map(f => [f.id, f])), out = [], seen = new Set();
  for (let f = byId.get(id); f && !seen.has(f.id); f = byId.get(f.parent_id)) { seen.add(f.id); out.unshift(f); }
  return out;
}
/* what each folder holds, the folders inside it counted too: Map(id -> { n, apps: { app: n } }); only one app's
   benches when app is given */
export function folderCounts(folders, benches, app) {
  const out = new Map();
  for (const b of benches || []) {
    const tool = b.tool || 'jekray';
    if (!b.folder_id || (app && tool !== app)) continue;
    for (const f of folderPath(folders, b.folder_id)) {
      const c = out.get(f.id) || { n: 0, apps: {} };
      c.n++; c.apps[tool] = (c.apps[tool] || 0) + 1; out.set(f.id, c);
    }
  }
  return out;
}
/* may this folder be put in that one (null: the top)? Not in itself, nor in a folder inside it */
export function folderFits(folders, id, into) {
  if (!into) return true;
  return !folderPath(folders, into).some(f => f.id === id);
}
/* the benches in an order: 'changed' and 'size' largest first, 'name', 'app' and 'folder' by the alphabet; flip
   turns it round. where(b) is the bench's folder as text */
export const SORTS = { name: 'Name', app: 'App', folder: 'Folder', changed: 'Last changed', size: 'Size' };
export function sortBenches(benches, key, flip, where) {
  const name = (a, b) => a.name.localeCompare(b.name);
  const by = {
    name,
    app: (a, b) => (a.tool || 'jekray').localeCompare(b.tool || 'jekray') || name(a, b),
    folder: (a, b) => (where ? where(a).localeCompare(where(b)) : 0) || name(a, b),
    changed: (a, b) => b.updated_at - a.updated_at,
    size: (a, b) => b.size_bytes - a.size_bytes,
  }[key] || ((a, b) => b.updated_at - a.updated_at);
  const out = benches.slice().sort(by);
  return flip ? out.reverse() : out;
}
/* the ids from one to another in a list, both included, whichever comes first (the one alone if the other is gone) */
export function runOf(ids, from, to) {
  const a = ids.indexOf(from), b = ids.indexOf(to);
  if (b < 0) return [];
  if (a < 0) return [to];
  return ids.slice(Math.min(a, b), Math.max(a, b) + 1);
}
/* '1 bench', '3 benches', '2 coatings' */
export const countOf = (n, thing) => n + ' ' + thing + (n === 1 ? '' : /(ch|s|x)$/.test(thing) ? 'es' : 's');
