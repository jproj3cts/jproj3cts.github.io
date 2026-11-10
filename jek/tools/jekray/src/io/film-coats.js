import { EMBED, TEST_MODE, cloud } from '../core/constants.js';
import { hooks } from '../core/hooks.js';
import { coatFromFilm } from '../core/coatdesign.js';
import { normCoat, project } from '../state/project.js';
import { benchNms, getEl } from '../state/elements.js';
import { glassKey, refIndex } from '../core/glass.js';
import { h } from '../ui/dom.js';
import { changed, toast } from '../ui/actions.js';
import { checkpoint } from '../ui/tabs.js';
import { track } from './usage.js';
import { account, accountLoaded, accountsOn, api } from './account.js';

/* ==========================================================================
   JEKfilm's coatings on a bench's faces
   A coating designed in JEKfilm is a .jekfilm, kept in the cloud as a bench of its own (tool 'jekfilm'). A cloud
   bench's faces offer the coatings in its folder (filmFolder: listed when the bench is linked to the cloud), and any
   face can take a .jekfilm file from this computer. Either way the face keeps a copy of the stack (core/coatdesign.js
   coatFromFilm), so the bench traces, shares and opens offline as before; a coating from the cloud also keeps where it
   came from and its version (coat.src: { id, v }). When the folder's coating has moved on (on opening, or when
   JEKfilm saves it in another tab), the bench offers to update its faces: never without asking, so a saved bench does
   not change its numbers by itself.
   ========================================================================== */
export const filmFolder = { benchId: null, ws: null, folder: null, list: [] };      // the bench's folder (workspace, folder id) and its coatings: [{ id, name, version }]
const JEKFILM_TAB = '/jek/tools/jekfilm.html';
let filmUpdateAsked = new Set();                             // 'id@version' already offered this visit
const filmFaces = new Map();                                 // a face sent to JEKfilm to design for: token → { elId, i, label }
/* every coating on the bench's parts, with what holds it: [{ holder, coat }] (a lens's faces, a window's, a cube's…) */
export function benchCoats() {
  const out = [], seen = new Set();
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 4 || seen.has(o)) return;
    seen.add(o);
    if (o.coat && typeof o.coat === 'object' && o.coat.mode) out.push({ holder: o, coat: o.coat });
    for (const [k, v] of Object.entries(o)) if (k !== 'coat' && v && typeof v === 'object') walk(v, depth + 1);
  };
  for (const el of project.elements) walk(el, 0);
  return out;
}
/* the coatings in the linked cloud bench's folder, listed (none for a bench not in the cloud) */
export async function loadFilmFolder(link) {
  link = link === undefined ? cloud : link;
  Object.assign(filmFolder, { benchId: link ? link.id : null, ws: null, folder: null, list: [] });
  if (!link || !accountsOn() || !account) { hooks.renderPanel(); return filmFolder.list; }
  try {
    const meta = await api('/v1/benches/' + link.id);
    const out = await api('/v1/workspaces/' + meta.workspace_id + '/benches?tool=jekfilm&folder=' + encodeURIComponent(meta.folder_id || ''));
    if (filmFolder.benchId !== link.id) return filmFolder.list;
    Object.assign(filmFolder, { ws: meta.workspace_id, folder: meta.folder_id || null });
    filmFolder.list = (out.benches || []).filter(b => b.tool === 'jekfilm').map(b => ({ id: b.id, name: b.name, version: b.version || b.head_version || 1 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) { /* offline, or no longer ours: the faces keep their copies */ }
  hooks.renderPanel();
  filmUpdates();
  return filmFolder.list;
}
/* a cloud coating as a face's coating: its stack fetched, linked to it */
export async function filmCoat(id) {
  const b = await api('/v1/benches/' + id);
  if (b.tool !== 'jekfilm') throw new Error('“' + b.name + '” is not a JEKfilm coating');
  const d = JSON.parse(b.content);
  return normCoat(coatFromFilm(Object.assign({}, d, { name: b.name }), { id: b.id, v: b.version }));
}
/* a face takes a coating from the cloud (the list's ◆ entries): fetched, then put on, as one step of Undo */
export async function useFilmOn(holder, id) {
  try {
    const coat = await filmCoat(id);
    checkpoint(); holder.coat = coat; changed(true);
    track('designer', 'film.use');
    toast('“' + coat.label + '” is on this face: a copy, linked to the coating in JEKfilm');
  } catch (err) { toast(err.status === 401 ? 'Sign in to use the coatings in the cloud' : 'Could not fetch the coating: ' + err.message, true); hooks.renderPanel(); }
}
/* a .jekfilm file from this computer onto a face: a copy, with no link */
export function filmFileOn(holder) {
  const input = h('input', { type: 'file', accept: '.jekfilm,application/json', hidden: '' });
  document.body.append(input);
  input.addEventListener('change', () => {
    const f = input.files[0]; input.remove();
    if (!f) { hooks.renderPanel(); return; }
    const rd = new FileReader();
    rd.onload = () => {
      let d = null;
      try { d = JSON.parse(rd.result); } catch (err) { /* below */ }
      if (!d || d.format !== 'jekfilm') { toast(f.name + ' is not a JEKfilm coating (.jekfilm)', true); hooks.renderPanel(); return; }
      checkpoint(); holder.coat = normCoat(coatFromFilm(Object.assign({ name: f.name.replace(/\.jekfilm$/i, '') }, d))); changed(true);
      track('import', 'jekfilm');
      toast('“' + holder.coat.label + '” is on this face, from the file');
    };
    rd.readAsText(f);
  });
  input.addEventListener('cancel', () => { input.remove(); hooks.renderPanel(); });
  input.click();
}
/* a linked coating opened in JEKfilm, in its tab */
export function openFilm(id) {
  const w = window.open(JEKFILM_TAB + '#cloud=' + id, 'jekfilm'); if (w) w.focus();
}
/* the faces whose coating's cloud version has moved on: [{ id, name, from, to, holders }] */
export function filmStale() {
  const byId = new Map(filmFolder.list.map(f => [f.id, f])), out = new Map();
  for (const { holder, coat } of benchCoats()) {
    const f = coat.src && byId.get(coat.src.id);
    if (!f || !(f.version > coat.src.v)) continue;
    const e = out.get(f.id) || { id: f.id, name: f.name, from: coat.src.v, to: f.version, holders: [] };
    e.from = Math.min(e.from, coat.src.v); e.holders.push(holder); out.set(f.id, e);
  }
  return [...out.values()];
}
/* bring the faces up to the cloud's version of their coatings (one step of Undo) */
export async function updateFilms(stale) {
  let n = 0;
  const coats = await Promise.all(stale.map(s => filmCoat(s.id).catch(() => null)));
  checkpoint();
  stale.forEach((s, i) => { if (coats[i]) for (const holder of s.holders) { holder.coat = normCoat(coats[i]); n++; } });
  changed(true);
  toast(n ? 'Updated ' + n + (n === 1 ? ' face' : ' faces') + ' to the newest coating' + (stale.length === 1 ? '' : 's') : 'Could not fetch the newer coatings', !n);
  return n;
}
/* offered once a visit for each coating's version: update the faces, or keep the copies they have */
export function filmUpdates() {
  const stale = filmStale().filter(s => !filmUpdateAsked.has(s.id + '@' + s.to));
  if (!stale.length || TEST_MODE) return stale;
  for (const s of stale) filmUpdateAsked.add(s.id + '@' + s.to);
  let dlg = document.getElementById('filmUpdate');
  if (!dlg) { dlg = h('dialog', { class: 'rt-dialog', id: 'filmUpdate', 'aria-labelledby': 'filmUpdateTitle' }); document.body.append(dlg); }
  const close = () => dlg.close(), faces = n => n + (n === 1 ? ' face' : ' faces');
  dlg.replaceChildren(h('h2', { id: 'filmUpdateTitle' }, stale.length === 1 ? 'A newer coating' : 'Newer coatings'),
    h('p', null, 'These coatings were saved again in JEKfilm since they were put on this bench. The faces keep their copies until you update them.'),
    h('ul', null, ...stale.map(s => h('li', null, h('b', null, s.name), ': version ' + s.to + ' (this bench has version ' + s.from + ', on ' + faces(s.holders.length) + ')'))),
    h('div', { class: 'rt-actions' },
      h('button', { class: 'rt-btn', type: 'button', id: 'filmUpdateKeep', onclick: () => { close(); track('designer', 'film.keep'); } }, 'Keep these copies'),
      h('button', { class: 'rt-btn primary', type: 'button', id: 'filmUpdateGo', onclick: () => { close(); track('designer', 'film.update'); updateFilms(stale); } }, 'Update the faces')));
  dlg.showModal();
  return stale;
}
/* JEKfilm opened to design a coating, in its tab: on its own (from = null), or for a face ({ el, holder, label }),
   starting from the face's glass, the bench's wavelength and the face's stack, and offering the bench's folder to save
   it in. Saved to the cloud there, the coating comes back onto the face (wireFilmCoats hears it, by the face's token). */
export function designInFilm(from) {
  track('designer', 'coating');
  const el = from && from.el, holder = from && from.holder;
  const nm = benchNms().find(v => v >= 200 && v <= 20000) || 550, coat = holder && holder.coat;
  let hash = 'new';
  if (el && holder) {
    // the substrate: the face's glass on the glass side (a lens), or the part's own material
    const i = el.surfaces ? el.surfaces.indexOf(holder) : -1;
    const m = i >= 0 ? ((el.materials[i] && el.materials[i].glass !== 'AIR' ? el.materials[i] : el.materials[i - 1]) || { glass: 'N-BK7' }) : (el.material || { glass: 'N-BK7' });
    const key = glassKey(m.glass), design = coat && coat.mode === 'stack' && coat.design ? coat.design : Math.round(nm);
    const token = 'f' + Math.random().toString(36).slice(2, 10);
    filmFaces.set(token, { elId: el.id, i, label: from.label || el.name });
    const seed = { format: 'jekfilm', version: 1, name: (from.label || el.name) + ' coating',
      spec: { target: 'ar', sub: { glass: key || m.glass, n: +refIndex(m, design).toFixed(5) }, design, lo: Math.max(100, Math.round(design * 0.85)), hi: Math.round(design * 1.15) },
      layers: coat && coat.mode === 'stack' ? coat.layers : [{ n: 1.38, d: design / (4 * 1.38) }] };
    const pass = { seed, face: token, label: from.label || el.name, ws: filmFolder.ws, folder: filmFolder.folder };
    hash = 'design=' + btoa(unescape(encodeURIComponent(JSON.stringify(pass)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  const w = window.open(JEKFILM_TAB + '#' + hash, 'jekfilm'); if (w) w.focus();
  return hash;
}
/* a face sent to JEKfilm, found again (the part may have been replaced by an undo since: found by its id) */
function faceOf(f) {
  const el = getEl(f.elId);
  return !el ? null : f.i >= 0 ? (el.surfaces && el.surfaces[f.i]) || null : el;
}
/* the page's wiring: the folder listed with each cloud link, and JEKfilm's saves in another tab heard */
export function wireFilmCoats() {
  Object.assign(hooks, { cloudLinked: link => { if (!link || link.id !== filmFolder.benchId) loadFilmFolder(link); }, filmFolder: () => filmFolder.list, useFilmOn, filmFileOn, openFilm, updateFilms, designInFilm });
  // a cloud bench restored with the page: its folder listed once the account is known
  Promise.resolve().then(() => { if (accountLoaded) accountLoaded.then(() => { if (cloud && filmFolder.benchId !== cloud.id) loadFilmFolder(); }); });
  if (EMBED || typeof BroadcastChannel !== 'function') return;
  // JEKfilm says when it saves a coating: a coating of this folder moves on, and the faces linked to it are offered it
  const ch = new BroadcastChannel('jek-film');
  ch.addEventListener('message', e => {
    const m = e.data || {};
    if (!m.id || !(m.version > 0)) return;
    // the coating designed for a face here: on that face now
    const f = m.face && filmFaces.get(m.face), holder = f && faceOf(f);
    if (holder) { filmFaces.delete(m.face); useFilmOn(holder, m.id); if (cloud && m.ws === filmFolder.ws && (m.folder || null) === filmFolder.folder) loadFilmFolder(); return; }
    const known = filmFolder.list.find(x => x.id === m.id);
    if (known) { Object.assign(known, { version: m.version, name: m.name || known.name }); filmUpdates(); }
    else if (cloud && m.ws && m.ws === filmFolder.ws && (m.folder || null) === filmFolder.folder) loadFilmFolder();
  });
}
