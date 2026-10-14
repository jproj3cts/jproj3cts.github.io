import { EMBED, TEST_MODE } from '../core/constants.js';
import { packText } from '../core/format.js';
import { V, normMat, num, project, typeLabel, uid } from '../state/project.js';
import { PACKS } from '../state/packs.js';
import { normElement } from '../state/elements.js';
import { canvas, selection, wx, wy } from '../ui/render.js';
import { snapVal } from '../ui/pointer.js';
import { MOD_CODE_MAX } from '../engines/mods.js';
import { V3D } from '../ui/view3d.js';
import { h } from '../ui/panel.js';
import { clipOf, downloadFile, pasteClip, saveFile, toast } from '../ui/actions.js';
import { PART_DRAG, exp } from '../ui/experimental.js';
import { fillPicker, picker } from '../ui/picker.js';
import { clipIcon, palOf } from '../ui/myparts.js';
import { startTour } from '../ui/tours.js';
import { modConfirmText, modPrepare, modsSync } from './mods.js';

/* ==========================================================================
   Part packs: sets of parts and glasses made by others (a maker's catalogue, a course's kit),
   as data only. A pack is a JSON file:
     { "format": "jekpack", "version": 1, "id": "maker.lenses", "name", "author",
       "packVersion", "description", "homepage", "licence",
       "glasses": [{ "glass": name, "table": { "wl": [µm], "n": [], "k": [] } } or { "glass", "nd", "vd" }],
       "parts": [{ "name", "summary", "group", "icon": "data:image/png;base64,...",
                   "elements": [ ...as in a .jekray file... ], "fibres": [ ... ] }] }
   Everything in it goes through the same checks as a bench opened from a file; nothing in it
   runs. A part's glasses are written into it, so once placed it needs nothing from its pack,
   and a bench made with packs opens anywhere. Packs are installed from a file or a link, always
   after showing what is in them, and kept in this browser (IndexedDB). A "code" entry is kept
   for mods that run code, in a sandbox, which this version does not: such a pack is refused.
   ========================================================================== */
export const PACK_FORMAT = 'jekpack', PACK_VERSION = 2, PACK_MAX = 8 * 1024 * 1024;
/* a pack as found, checked and tidied: { pack, notes } or throws with why it cannot be used */
export function normPack(raw, sizeHint) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('it is not a part pack');
  if (raw.format !== PACK_FORMAT) throw new Error(raw.format === 'jekray' ? 'it is a bench, not a part pack: open it with Open a .jekray file' : 'it is not a part pack (its "format" is not "' + PACK_FORMAT + '")');
  if (!(num(raw.version, 0) >= 1)) throw new Error('its "version" is missing');
  if (raw.version > PACK_VERSION) throw new Error('it is for a newer JEKray2D (pack version ' + raw.version + '); reload the page to update');
  if (raw.scripts !== undefined) throw new Error('it has "scripts" in it: a module\u2019s code goes in "code"');
  // a mod: its code (run only in the sandbox, once installed); only a version 2 pack has any
  if (raw.code !== undefined) {
    if (raw.version < 2) throw new Error('it has code in it, which a version 1 pack cannot: a module is a version 2 pack');
    if (typeof raw.code !== 'string' || !raw.code.trim()) throw new Error('its "code" is not a script');
    if (raw.code.length > MOD_CODE_MAX) throw new Error('its code is larger than ' + (MOD_CODE_MAX >> 10) + ' KB');
    if (!exp('mods')) throw new Error('it is a module (it has code), and modules are an experimental feature: turn them on under Help \u203a Experimental features first');
  }
  if ((sizeHint || JSON.stringify(raw).length) > PACK_MAX) throw new Error('it is larger than ' + (PACK_MAX >> 20) + ' MB');
  const id = packText(raw.id, 64).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(id)) throw new Error('its "id" should be 2 to 64 letters, digits, dots, dashes or underscores, as "maker.lenses"');
  const notes = [];
  const pack = { format: PACK_FORMAT, version: raw.code !== undefined ? 2 : 1, id, name: packText(raw.name, 60) || id, author: packText(raw.author, 80), packVersion: packText(String(raw.packVersion || '1'), 20),
    description: packText(raw.description, 600), licence: packText(raw.licence || raw.license, 60), glasses: [], parts: [] };
  if (typeof raw.homepage === 'string' && /^https:\/\/[^\s"<>]{3,200}$/.test(raw.homepage)) pack.homepage = raw.homepage;
  if (raw.code !== undefined) { pack.code = raw.code; pack.rawParts = Array.isArray(raw.parts) ? JSON.parse(JSON.stringify(raw.parts.slice(0, 500))) : []; return { pack, notes: [] }; }   // a mod's parts once its code is read (modPrepare)
  // its glasses: measured n (and k) by wavelength, or an Abbe pair
  for (const g of Array.isArray(raw.glasses) ? raw.glasses.slice(0, 200) : []) {
    const name = packText(g && g.glass, 40);
    if (!name) { notes.push('A glass with no name: left out.'); continue; }
    const m = normMat(Object.assign({}, g, { glass: name }));
    if (!m.table && !(isFinite(m.nd) && isFinite(m.vd))) { notes.push('Glass ' + name + ' has neither a table nor nd and vd: left out.'); continue; }
    if (m.table && (m.table.wl.length !== m.table.n.length || m.table.wl.some(v => !isFinite(v)) || m.table.n.some(v => !isFinite(v)))) { notes.push('Glass ' + name + ': its table does not line up: left out.'); continue; }
    pack.glasses.push(m);
  }
  const glassBy = new Map(pack.glasses.map(m => [m.glass, m]));
  // a material naming one of the pack's glasses gets its data, so the part stands on its own
  const fill = o => {
    if (Array.isArray(o)) { o.forEach(fill); return; }
    if (!o || typeof o !== 'object') return;
    if (typeof o.glass === 'string' && glassBy.has(o.glass) && !o.table && !isFinite(o.nd)) Object.assign(o, JSON.parse(JSON.stringify(glassBy.get(o.glass))), { abs: o.abs || 0 });
    for (const v of Object.values(o)) if (v && typeof v === 'object') fill(v);
  };
  const parts = Array.isArray(raw.parts) ? raw.parts : [];
  if (parts.length > 500) notes.push('Only the first 500 of its ' + parts.length + ' parts are kept.');
  parts.slice(0, 500).forEach((P, i) => {
    const pname = packText(P && P.name, 60) || 'Part ' + (i + 1);
    const els = [], ids = new Set();
    for (const e of Array.isArray(P && P.elements) ? P.elements : []) {
      const c = JSON.parse(JSON.stringify(e || {}));
      fill(c);
      const n = normElement(c);
      if (!n) { notes.push(pname + ': an element of type ' + JSON.stringify(e && e.type) + ' is not one JEKray2D has: left out.'); continue; }
      if (ids.has(n.id)) n.id = uid();
      ids.add(n.id); els.push(n);
    }
    if (!els.length) { notes.push(pname + ': nothing in it JEKray2D can use: left out.'); return; }
    const fibres = (Array.isArray(P.fibres) ? P.fibres : []).filter(F => F && Array.isArray(F.a) && Array.isArray(F.b) && ids.has(F.a[0]) && ids.has(F.b[0])).map(F => JSON.parse(JSON.stringify(F)));
    const part = { name: pname, summary: packText(P.summary, 120) || (els.length === 1 ? typeLabel(els[0]) : els.length + ' parts'), group: packText(P.group, 40), palette: palOf(els[0]),
      clip: { format: 'jekray-clip', version: 1, from: null, elements: els, fibres } };
    if (typeof P.icon === 'string' && P.icon.length <= 32 * 1024 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(P.icon)) part.icon = P.icon;
    pack.parts.push(part);
  });
  if (!pack.parts.length && !pack.glasses.length) throw new Error('it has no parts or glasses JEKray2D can use');
  return { pack, notes };
}
/* kept in this browser: IndexedDB, a store of packs by id (in the tests, in memory only) */
let packDb = null;
function packStore(mode) {
  if (TEST_MODE || typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!packDb) packDb = new Promise((res, rej) => {
    const rq = indexedDB.open('jekray2d', 1);
    rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains('packs')) rq.result.createObjectStore('packs', { keyPath: 'id' }); };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => { packDb = null; rej(rq.error); };
  });
  return packDb.then(db => db.transaction('packs', mode).objectStore('packs'));
}
const idbDo = rq => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
async function packsLoad() {
  try { const st = await packStore('readonly'); if (st) PACKS.list = (await idbDo(st.getAll())).filter(p => p && p.format === PACK_FORMAT).sort((a, b) => a.name.localeCompare(b.name)); }
  catch (err) { console.warn('JEKray2D: part packs could not be read', err); }
  PACKS.ready = true;
  packsChanged();
}
export async function packPut(pack) {
  PACKS.list = PACKS.list.filter(p => p.id !== pack.id).concat(pack).sort((a, b) => a.name.localeCompare(b.name));
  PACKS.icons.clear();
  const st = await packStore('readwrite'); if (st) await idbDo(st.put(pack));
  packsChanged();
}
export async function packRemove(id) {
  PACKS.list = PACKS.list.filter(p => p.id !== id);
  const st = await packStore('readwrite'); if (st) await idbDo(st.delete(id));
  packsChanged();
}
function packsChanged() { modsSync(); if (!picker.hidden) fillPicker(''); const d = document.getElementById('packDialog'); if (d && d.open) packDialogFill(); }
/* a part of a pack onto the bench: where it was dropped, or in the middle of the view */
export function placePackPart(pk, i, at) {
  const P = pk && pk.parts[i];
  if (!P) return;
  let pt = [V().cx, V().cy];
  if (at) { const r = canvas.getBoundingClientRect(), q = V3D.active() ? V3D.tablePoint(at[0], at[1]) : [wx(at[0] - r.left), wy(at[1] - r.top)]; if (q) pt = [snapVal(q[0]), snapVal(q[1])]; }
  if (!pasteClip(JSON.parse(JSON.stringify(P.clip)), pt)) toast('Could not add ' + P.name, true);
}
const packIcon = (pk, i) => {
  const P = pk.parts[i], k = pk.id + '#' + i;
  if (P.icon) return P.icon;
  if (!PACKS.icons.has(k)) { let u = ''; try { u = clipIcon(P.clip.elements) || ''; } catch (err) { /* a blank tile */ } PACKS.icons.set(k, u); }
  return PACKS.icons.get(k);
};
export function packTile(pk, i, after) {
  const P = pk.parts[i], img = h('img', { alt: '', src: packIcon(pk, i), width: '48', height: '48' });
  const b = h('button', { type: 'button', class: 'rt-ptile ' + P.palette, 'data-pack': pk.id + ':' + i, title: P.name + ' (' + P.summary + '), from ' + pk.name, draggable: 'true' },
    img, h('span', null, P.name, h('small', null, P.summary)));
  b.addEventListener('click', e => { e.stopPropagation(); placePackPart(pk, i); if (after) after(e); });
  b.addEventListener('dragstart', e => { e.dataTransfer.setData(PART_DRAG, 'pack:' + pk.id + ':' + i); e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setDragImage(img, 24, 24); });
  return b;
}
// the Packs tab of the picker: each pack, its parts by group
export function packsBody(after) {
  if (!PACKS.list.length) return [h('p', { class: 'rt-pnone' }, 'No part packs or modules installed. File › Part packs and modules… installs one from a file or a link.')];
  const out = [];
  for (const pk of PACKS.list) {
    if (!pk.parts.length) continue;
    out.push(h('h4', null, pk.name, pk.author ? h('small', { class: 'rt-pby' }, ' by ' + pk.author) : null));
    const groups = new Map();
    pk.parts.forEach((P, i) => { const g = P.group || ''; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); });
    for (const [g, idx] of groups) { if (g && groups.size > 1) out.push(h('h5', null, g)); out.push(h('div', { class: 'rt-pgrid' }, ...idx.map(i => packTile(pk, i, after)))); }
  }
  return out;
}
export const packHits = words => PACKS.list.flatMap(pk => pk.parts.map((P, i) => ({ pk, i, P }))).filter(({ pk, P }) => words.every(w => (P.name + ' ' + P.summary + ' ' + P.group + ' ' + pk.name).toLowerCase().includes(w)));
/* ---------- installing ---------- */
async function packFromText(txt, where) {
  let raw;
  try { raw = JSON.parse(txt); } catch (err) { throw new Error((where || 'It') + ' is not JSON'); }
  const r = normPack(raw, txt.length);
  if (r.pack.code) await modPrepare(r.pack, r.notes);
  return r;
}
// what is in it, and Install or Cancel; resolves true when installed
export function packConfirm(pack, notes, from) {
  return new Promise(resolve => {
    const old = PACKS.list.find(p => p.id === pack.id);
    const dlg = h('dialog', { class: 'rt-dialog rt-packconfirm' });
    const done = ok => { dlg.close(); dlg.remove(); resolve(ok); };
    const nG = pack.glasses.length, nP = pack.parts.length;
    dlg.append(h('h2', null, (old ? 'Update ' : 'Install ') + pack.name + '?'),
      h('p', null, (pack.author ? 'By ' + pack.author + '. ' : '') + 'Version ' + pack.packVersion + (old ? ' (installed: ' + old.packVersion + ')' : '') + (pack.licence ? '. Licence: ' + pack.licence : '') + '.'),
      pack.description ? h('p', null, pack.description) : '',
      pack.code ? modConfirmText(pack, from) : h('p', null, nP + ' part' + (nP === 1 ? '' : 's') + (nG ? ' and ' + nG + ' glass' + (nG === 1 ? '' : 'es') : '') + '. ' + (from ? 'From ' + from + '. ' : '') +
        'A pack holds parts and data only, never code. Its parts appear under + Add part, in the Packs tab, and its glasses in each lens’s material menu.'),
      pack.homepage ? h('p', { class: 'rt-hint' }, 'Its home page: ', h('a', { href: pack.homepage, target: '_blank', rel: 'noopener noreferrer' }, pack.homepage)) : '',
      notes.length ? h('details', null, h('summary', null, notes.length + ' thing' + (notes.length === 1 ? '' : 's') + ' left out'), h('ul', null, ...notes.slice(0, 50).map(n => h('li', null, n)))) : '',
      h('div', { class: 'rt-actions' }, h('button', { class: 'rt-btn', type: 'button', onclick: () => done(false) }, 'Cancel'),
        h('button', { class: 'rt-btn primary', type: 'button', onclick: async () => { await packPut(pack); done(true); toast('Installed ' + pack.name + ': find its parts under + Add part › Packs'); } }, (old ? 'Update' : 'Install') + (pack.code ? ' module' : ''))));
    dlg.addEventListener('cancel', e => { e.preventDefault(); done(false); });
    document.body.append(dlg); dlg.showModal();
  });
}
export async function packInstallText(txt, from) {
  try { const { pack, notes } = await packFromText(txt, from); return await packConfirm(pack, notes, from); }
  catch (err) { toast('Could not use that pack: ' + err.message + '.', true); return false; }
}
async function packInstallUrl(url) {
  let u;
  try { u = new URL(url, location.href); } catch (err) { toast('That is not a link', true); return false; }
  if (!/^https?:$/.test(u.protocol)) { toast('A pack link starts https://', true); return false; }
  try {
    const r = await fetch(u.href, { credentials: 'omit' });
    if (!r.ok) throw new Error('the link answered ' + r.status);
    const len = +(r.headers.get('Content-Length') || 0);
    if (len > PACK_MAX) throw new Error('it is larger than ' + (PACK_MAX >> 20) + ' MB');
    return await packInstallText(await r.text(), u.host);
  } catch (err) { toast('Could not fetch that pack: ' + err.message + ' (its site may not let other pages read it).', true); return false; }
}
/* ---------- making one: each selected part (or group of them) one part of the pack ---------- */
export function packFromSelection(meta) {
  const sel = selection();
  if (!sel.length) throw new Error('select the parts to put in it first');
  const byGroup = new Map();
  for (const e of sel) { const k = e.group || e.id; if (!byGroup.has(k)) byGroup.set(k, []); byGroup.get(k).push(e); }
  const parts = [...byGroup.values()].map(list => {
    const C = clipOf(list), cx = list.reduce((a, e) => a + e.x, 0) / list.length, cy = list.reduce((a, e) => a + e.y, 0) / list.length;
    for (const e of C.elements) { e.x = +(e.x - cx).toFixed(4); e.y = +(e.y - cy).toFixed(4); delete e.bench; delete e.locked; }
    const P = { name: list.length === 1 ? list[0].name : list[0].name + ' and ' + (list.length - 1) + ' more', summary: list.length === 1 ? typeLabel(list[0]) : list.length + ' parts', elements: C.elements };
    if (C.fibres.length) P.fibres = C.fibres;
    try { const ic = clipIcon(list); if (ic && ic.length <= 32 * 1024) P.icon = ic; } catch (err) { /* drawn when shown */ }
    return P;
  });
  const glasses = [], seen = new Set();
  JSON.stringify(parts, (k, v) => { if (v && typeof v === 'object' && v.table && typeof v.glass === 'string' && !seen.has(v.glass)) { seen.add(v.glass); glasses.push({ glass: v.glass, table: v.table }); } return v; });
  return Object.assign({ format: PACK_FORMAT, version: PACK_VERSION }, meta, glasses.length ? { glasses } : {}, { parts });
}
/* ---------- the dialog: File > Part packs ---------- */
function packDialogFill() {
  const list = document.getElementById('packList');
  list.replaceChildren();
  if (!PACKS.list.length) { list.append(h('p', { class: 'rt-hint' }, 'None installed yet.')); return; }
  for (const pk of PACKS.list) {
    const rm = h('button', { type: 'button', class: 'rt-btn danger', onclick: async () => { if (!confirm('Remove ' + pk.name + '? Parts already on your benches stay as they are.')) return; await packRemove(pk.id); toast('Removed ' + pk.name); } }, 'Remove');
    list.append(h('div', { class: 'rt-packrow' }, h('div', null, h('b', null, pk.name), ' ', h('small', null, 'v' + pk.packVersion + (pk.author ? ', by ' + pk.author : '')), pk.code ? h('span', { class: 'rt-exp', title: 'It has code, run in a sandbox' + (exp('mods') ? '' : ': modules are off, so its parts stand in') }, 'Mod') : null,
      h('div', { class: 'rt-hint' }, pk.parts.length + ' part' + (pk.parts.length === 1 ? '' : 's') + (pk.glasses.length ? ', ' + pk.glasses.length + ' glass' + (pk.glasses.length === 1 ? '' : 'es') : '') + (pk.description ? ': ' + pk.description.slice(0, 140) : ''))), rm));
  }
}
/* the menus: File (by the bench's name), View, Sweeps and Help */
/* the menus' icons: small line drawings on a 16 px square, in the text's colour, as a drawing
   program's menus have them; and a tick for an option that is on */
export const MENU_ICONS = {
  book: 'M2 3H6.5Q8 3 8 4.5V14Q8 12.5 6.5 12.5H2Z M14 3H9.5Q8 3 8 4.5V14Q8 12.5 9.5 12.5H14Z',
  new: 'M4 1.5h5.5L12.5 4.5V14.5H4Z M9.5 1.5V4.5H12.5', open: 'M1.5 4.5V13.5H13L14.5 7.5H4L2.5 13 M1.5 4.5V2.5H6L7.5 4H12.5V7.5',
  paste: 'M5 2.5H3.5V14.5H12.5V2.5H11 M5.5 1.5H10.5V3.5H5.5Z', history: 'M8 2.5A5.5 5.5 0 1 1 2.6 7 M2.5 3V7H6.5 M8 5V8.5L10.5 10',
  save: 'M2.5 2.5H11.5L13.5 4.5V13.5H2.5Z M5 2.5V6H10.5V2.5 M5 13.5V9.5H11V13.5', import: 'M8 1.5V10 M4.5 6.5L8 10L11.5 6.5 M2.5 10.5V14H13.5V10.5',
  export: 'M8 10.5V2 M4.5 5.5L8 2L11.5 5.5 M2.5 10.5V14H13.5V10.5', image: 'M2 3H14V13H2Z M2 11L6 7L9 10L11 8L14 11 M10.5 5.6A0.9 0.9 0 1 0 10.49 5.6',
  vector: 'M3 13C5 4 11 12 13 3 M2 12H4V14H2Z M12 2H14V4H12Z', pdf: 'M4 1.5H9.5L12.5 4.5V14.5H4Z M6 9H10 M6 11.5H10 M6 6.5H8',
  gallery: 'M2 2H7V7H2Z M9 2H14V7H9Z M2 9H7V14H2Z M9 9H14V14H9Z', link: 'M6.5 9.5L9.5 6.5 M7 4.5L8.5 3A2.5 2.5 0 0 1 13 6.5L11.5 8 M9 11.5L7.5 13A2.5 2.5 0 0 1 3 9.5L4.5 8',
  fit: 'M2 5.5V2H5.5 M10.5 2H14V5.5 M14 10.5V14H10.5 M5.5 14H2V10.5', zoom: 'M7 2.5A4.5 4.5 0 1 1 6.99 2.5 M10.3 10.3L14 14 M5 7H9 M7 5V9',
  ruler: 'M1.5 10.5L10.5 1.5L14.5 5.5L5.5 14.5Z M4.5 7.5L6 9 M6.5 5.5L8.5 7.5 M8.5 3.5L10 5', parts: 'M8 2V14 M2 8H14',
  check: 'M3 8.5L6.5 12L13 4.5', play: 'M4.5 2.5L13 8L4.5 13.5Z', pause: 'M4.5 2.5V13.5 M11.5 2.5V13.5',
  sync: 'M13 6A5.2 5.2 0 0 0 3.4 4.6 M3 2V5H6 M3 10A5.2 5.2 0 0 0 12.6 11.4 M13 14V11H10', target: 'M8 1.5A6.5 6.5 0 1 1 7.99 1.5 M8 4.5A3.5 3.5 0 1 1 7.99 4.5 M8 7.5A0.5 0.5 0 1 1 7.99 7.5',
  dice: 'M2.5 2.5H13.5V13.5H2.5Z M5.5 5.5H5.6 M10.5 5.5H10.6 M8 8H8.1 M5.5 10.5H5.6 M10.5 10.5H10.6', keyboard: 'M1.5 4H14.5V12H1.5Z M4 6.5H4.1 M6.5 6.5H6.6 M9 6.5H9.1 M11.5 6.5H11.6 M4.5 9.5H11.5',
  flag: 'M3 14.5V2 M3 2.5H12L10 5.5L12 8.5H3', cube: 'M8 1.5L14 4.5V11.5L8 14.5L2 11.5V4.5Z M2 4.5L8 7.5L14 4.5 M8 7.5V14.5', beam: 'M1.5 8H6 M6 8L14 4 M6 8L14 12 M5.5 5V11', split: 'M1.5 8H14.5 M8 1.5V14.5 M5 5L11 11',
  star: 'M8 1.5L9.9 5.6L14.3 6L11 9L12 13.5L8 11.2L4 13.5L5 9L1.7 6L6.1 5.6Z', quote: 'M3 4H7V8H5L3.5 12 M9 4H13V8H11L9.5 12',
  bug: 'M5 6.5A3 3.5 0 0 1 11 6.5V10A3 3.5 0 0 1 5 10Z M8 6.5V13 M5 8.5H2 M11 8.5H14 M5.5 5L3.5 3 M10.5 5L12.5 3 M5 11.5L3 13.5 M11 11.5L13 13.5',
  flask: 'M6 1.5H10 M6.5 1.5V6L2.5 13.5H13.5L9.5 6V1.5 M4.3 10H11.7',
  user: 'M8 2A3 3 0 1 1 7.99 2 M2.5 14.5A5.5 5 0 0 1 13.5 14.5',
  users: 'M6 2.5A2.5 2.5 0 1 1 5.99 2.5 M1.5 13.5A4.5 4.5 0 0 1 10.5 13.5 M10.5 3A2.5 2.5 0 0 1 11 8 M11.5 9.5A4 4 0 0 1 14.5 13.5', signin: 'M9.5 2.5H13.5V13.5H9.5 M2 8H10 M7 5L10 8L7 11',
  signout: 'M6.5 2.5H2.5V13.5H6.5 M6 8H14 M11 5L14 8L11 11',
  card: 'M1.5 3.5H14.5V12.5H1.5Z M1.5 6.5H14.5 M4 10H7',
  trash: 'M2.5 4H13.5 M6 4V2.5H10V4 M3.5 4L4.5 14H11.5L12.5 4 M6.5 6.5V11.5 M9.5 6.5V11.5',
  info: 'M8 1.5A6.5 6.5 0 1 1 7.99 1.5 M8 7V11.5 M8 4.6V4.7', home: 'M2 7.5L8 2.5L14 7.5 M3.5 6.5V13.5H12.5V6.5 M6.5 13.5V9.5H9.5V13.5',
  fork: 'M4.5 1.5A1.5 1.5 0 1 1 4.49 1.5 M11.5 1.5A1.5 1.5 0 1 1 11.49 1.5 M4.5 11.5A1.5 1.5 0 1 1 4.49 11.5 M4.5 4.5V11.5 M11.5 4.5V6A2 2 0 0 1 9.5 8H6.5A2 2 0 0 0 4.5 10',
  cloud: 'M4.5 12.5H12A2.75 2.75 0 0 0 12.2 7A4 4 0 0 0 4.4 6.6A3 3 0 0 0 4.5 12.5Z', upload: 'M4.5 12.5H12A2.75 2.75 0 0 0 12.2 7A4 4 0 0 0 4.4 6.6A3 3 0 0 0 4.5 12.5 M8 11V6.5 M6 8.5L8 6.5L10 8.5', devices: 'M1.5 3H11.5V10H1.5Z M4 13H9 M6.5 10V13 M12.5 6H14.5V13H12.5Z',
};
export function menuIcons(root) {
  for (const n of root.querySelectorAll('.rt-imenu [data-icon], .rt-barlink[data-icon]')) {
    if (n.querySelector(':scope > svg.ic')) continue;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', MENU_ICONS[n.dataset.icon] || '');
    svg.append(p); n.prepend(svg);
  }
}

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wirePacks() {
  {
    const dlg = h('dialog', { class: 'rt-dialog', id: 'packDialog' });
    const fi = h('input', { type: 'file', accept: '.jekpack,.json,application/json', hidden: true });
    fi.addEventListener('change', async () => { const f = fi.files[0]; fi.value = ''; if (f) await packInstallText(await f.text(), f.name); });
    const make = () => {
      const sel = selection();
      if (!sel.length) { toast('Select the parts to put in the pack first (each part, or each group, becomes one part of it)', true); return; }
      const name = prompt('A name for the pack', project.name ? project.name + ' parts' : 'My parts pack'); if (name === null) return;
      const author = prompt('Who made it (shown to those who install it)', '') ; if (author === null) return;
      const id = (author ? author + '.' : '') + name;
      const pack = packFromSelection({ id: id.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'pack', name: name.trim().slice(0, 60), author: author.trim().slice(0, 80), packVersion: '1' });
      try { normPack(pack); } catch (err) { toast('Could not make the pack: ' + err.message, true); return; }
      downloadFile(pack.id + '.jekpack', new Blob([JSON.stringify(pack, null, 1)], { type: 'application/json' }));
      toast('Saved ' + pack.parts.length + ' part' + (pack.parts.length === 1 ? '' : 's') + ' as ' + pack.id + '.jekpack: share the file, or put it online and share its link');
    };
    dlg.append(h('h2', null, 'Part packs and modules'),
      h('p', null, 'Sets of parts and glasses made by others: a maker’s catalogue, a course’s kit. They hold data; a module is a pack that carries code as well (an experimental feature), run in a sandbox. Both are kept in this browser. Their parts appear under + Add part › Packs; once on a bench, a part needs nothing from its pack.'),
      h('div', { id: 'packList', class: 'rt-packlist' }),
      h('div', { class: 'rt-actions', style: 'flex-wrap:wrap' },
        h('button', { type: 'button', class: 'rt-btn', onclick: () => fi.click() }, 'Install a pack/module from a file…'),
        h('button', { type: 'button', class: 'rt-btn', onclick: () => { const u = prompt('The link to a part pack or module (https://…)'); if (u) packInstallUrl(u.trim()); } }, 'Install a pack/module from a link…'),
        h('button', { type: 'button', class: 'rt-btn', title: 'Each selected part, or group of parts, becomes one part of a new pack, saved as a file', onclick: make }, 'Make a pack from the selection…'),
        h('a', { class: 'rt-link', href: '/jek/docs/jekray2d/part-packs/', target: '_blank', rel: 'noopener' }, 'How to make one'),
        h('button', { type: 'button', class: 'rt-btn primary', onclick: () => dlg.close() }, 'Close')), fi);
    document.body.append(dlg);
    document.getElementById('btnPacks').addEventListener('click', () => { packDialogFill(); dlg.showModal(); });
    // a link with ?pack=...: offered, never installed without asking
    const q = new URLSearchParams(location.search).get('pack');
    if (q && !TEST_MODE && !EMBED) setTimeout(() => packInstallUrl(q), 800);
    if (!TEST_MODE) packsLoad(); else PACKS.ready = true;
  }

  for (const [bId, mId] of [['btnFile', 'fileMenu'], ['btnView', 'viewMenu'], ['btnSweeps', 'sweepsMenu'], ['btnHelpMenu', 'helpMenu'], ['btnAcct', 'acctMenu']]) {
    const btn = document.getElementById(bId), menu = document.getElementById(mId);
    const show = on => {
      menu.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (!on) return;
      // kept on the screen: a menu set against its button's right edge would run off a phone's left
      menu.style.translate = '';
      const r = menu.getBoundingClientRect(), vw = document.documentElement.clientWidth, pad = 8;
      const dx = r.left < pad ? pad - r.left : r.right > vw - pad ? Math.max(pad - r.left, vw - pad - r.right) : 0;
      if (dx) menu.style.translate = dx + 'px 0';
      const f = menu.querySelector('button:not(:disabled)'); if (f) f.focus();
    };
    btn.addEventListener('click', e => { e.stopPropagation(); show(menu.hidden); });
    menu.addEventListener('click', e => { if (e.target.closest('button')) show(false); });
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) show(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { show(false); btn.focus(); } });
  }

  document.getElementById('helpMenu').addEventListener('click', e => { const b = e.target.closest('[data-tour]'); if (b) startTour(b.dataset.tour); });

  // the menus' stand-ins for the bar's own buttons (a phone hides those)
  for (const m of ['fileMenu', 'viewMenu', 'sweepsMenu', 'helpMenu']) document.getElementById(m).addEventListener('click', e => { const b = e.target.closest('[data-click]'); if (b) setTimeout(() => document.getElementById(b.dataset.click).click()); });

  // Cite and Report a bug on the bar too, where there is room: they open what the Help menu's do
  for (const b of document.querySelectorAll('.rt-barlink, .rt-beta-pill')) b.addEventListener('click', e => { e.stopPropagation(); document.getElementById(b.dataset.click).click(); });

  menuIcons(document);

  // the experimental features' box opens from the Help menu, which closes as it does
  document.getElementById('btnExp').addEventListener('click', () => { document.getElementById('helpMenu').hidden = true; document.getElementById('btnHelpMenu').setAttribute('aria-expanded', 'false'); });

  document.getElementById('btnSave').addEventListener('click', saveFile);

}
