import { hooks } from '../../../jekray/src/core/hooks.js';
import { h } from '../../../jekray/src/ui/dom.js';
import { appliedCount, newDoc, normDoc } from '../core/doc.js';
import { kernelAsk } from '../page/kernel.js';

/* ==========================================================================
   The page's state, in one object every module reads and changes (so none needs another's setter): the document,
   what is selected and hovered, the selection filter, undo and redo, the last regeneration's result, the feature
   dialog open, the sketch being edited. A small bus tells the modules what changed: 'model' (a regeneration came
   back), 'sel' (the selection), 'doc' (the document, before a regeneration), 'view' (the camera).
   ========================================================================== */
export const app = {
  doc: newDoc(), sel: [], hover: null, filter: 'any', history: [], future: [], result: null, error: null,
  editing: null,          // the feature dialog: { f (the feature as edited), at (its place), isNew, field (the active selection field) }
  sketch: null,           // the sketch being edited: see ui/sketcher.js
  unsaved: false, regenAt: 0, regenMs: 0, regenCount: 0, busy: false,
};
const BUS = {};
export function on(ev, fn) { (BUS[ev] || (BUS[ev] = [])).push(fn); }
export function emit(ev, x) { for (const fn of BUS[ev] || []) { try { fn(x); } catch (err) { console.error(err); } } }
/* ---------- undo and redo: whole documents, as JSON ---------- */
const HISTORY_MAX = 200;
export function checkpoint() {
  app.history.push(JSON.stringify(app.doc));
  if (app.history.length > HISTORY_MAX) app.history.shift();
  app.future.length = 0;
  emit('history');
}
export function undo() { if (!app.history.length) return false; app.future.push(JSON.stringify(app.doc)); app.doc = normDoc(JSON.parse(app.history.pop())); afterHistory(); return true; }
export function redo() { if (!app.future.length) return false; app.history.push(JSON.stringify(app.doc)); app.doc = normDoc(JSON.parse(app.future.pop())); afterHistory(); return true; }
function afterHistory() { app.sel = []; emit('history'); emit('sel'); changed(); }
/* the document changed: kept (autosave), told about, and regenerated soon */
export function changed(opts) {
  app.unsaved = true;
  emit('doc', opts);
  if (hooks.cadSaveLater) hooks.cadSaveLater();
  if (hooks.cadCloudChanged) hooks.cadCloudChanged();
  regenSoon();
}
let regenTimer = null;
export function regenSoon(ms) { clearTimeout(regenTimer); regenTimer = setTimeout(regenNow, ms === undefined ? 20 : ms); }
/* what is shown: up to the rollback bar, or up to the feature being edited (with its preview), or the sketch's place */
export function regenOpts() {
  const E = app.editing, S = app.sketch;
  if (S) return { upto: S.at, preview: { at: S.at, feature: S.f } };
  if (E) return { upto: E.at, preview: { at: E.at, feature: E.f } };
  return {};
}
let regenWaiters = [];
/* a promise of the next regeneration's result (the tests wait on it) */
export const regenDone = () => new Promise(res => regenWaiters.push(res));
export async function regenNow() {
  clearTimeout(regenTimer);
  const t0 = performance.now(), opts = regenOpts();
  app.busy = true; emit('busy');
  let out;
  try { out = await kernelAsk('regen', { doc: app.doc, opts }, 'regen'); }
  catch (err) { app.error = err.message; app.busy = false; emit('busy'); toast('The model could not be made: ' + err.message, true); const w = regenWaiters; regenWaiters = []; for (const r of w) r(null); return null; }
  if (!out) return null;                 // replaced by a newer request
  app.result = out; app.error = null; app.busy = false; app.regenMs = performance.now() - t0; app.regenCount++;
  // a selection of parts, faces or edges no longer there goes
  app.sel = app.sel.filter(s => !s.part || out.parts.some(p => p.id === s.part && (s.kind === 'part' || (s.kind === 'face' ? s.index < p.faceGroups.length / 2 : s.kind === 'edge' ? s.index < p.edgeGroups.length / 2 : s.index < p.verts.length / 3))));
  emit('busy'); emit('model', out);
  const w = regenWaiters; regenWaiters = []; for (const r of w) r(out);
  return out;
}
export const applied = () => appliedCount(app.doc);
/* ---------- the toast ---------- */
let toastTimer = null;
export function toast(msg, bad) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), bad ? 6000 : 3000);
}
export function setStatus(text) { const s = document.getElementById('status'); if (s) s.textContent = text || ''; }
/* ---------- a file to save ---------- */
export function downloadFile(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  if (hooks.cadSaved) hooks.cadSaved(name);
}
export const safeName = s => (String(s || 'part-studio').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80) || 'part-studio');
/* ---------- the menus in the bar: a button opens its menu; a click anywhere else, or Escape, closes it ---------- */
export function closeMenus(except) {
  for (const m of document.querySelectorAll('.rt-toolbar .rt-menu:not([hidden]), .cad-pop:not([hidden])')) if (m !== except && !m.contains(except)) { m.hidden = true; const b = document.querySelector('[aria-controls="' + m.id + '"]'); if (b) b.setAttribute('aria-expanded', 'false'); }
}
export function wireMenus() {
  for (const b of document.querySelectorAll('.rt-toolbar [aria-controls]')) {
    const m = document.getElementById(b.getAttribute('aria-controls'));
    if (!m) continue;
    b.addEventListener('click', e => { e.stopPropagation(); const open = m.hidden; closeMenus(); m.hidden = !open; b.setAttribute('aria-expanded', String(open)); if (open && hooks.cadMenuOpened) hooks.cadMenuOpened(m); });
  }
  document.addEventListener('click', e => { if (!e.target.closest('.rt-menu .rt-sub, .cad-pop')) closeMenus(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
  // a menu item that stands for a button elsewhere
  for (const it of document.querySelectorAll('[data-click]')) it.addEventListener('click', () => { const t = document.getElementById(it.dataset.click); if (t) t.click(); });
}
/* the icons, drawn in front of each [data-icon] */
export const CAD_ICONS = {
  new: 'M4 1.5h5.5L12.5 4.5V14.5H4Z M9.5 1.5V4.5H12.5', open: 'M1.5 4.5V13.5H13L14.5 7.5H4L2.5 13 M1.5 4.5V2.5H6L7.5 4H12.5V7.5', save: 'M2.5 2.5H11L13.5 5V13.5H2.5Z M5 2.5V6H10V2.5 M5 13.5V9.5H11V13.5',
  export: 'M8 1.5V10 M5 7L8 10L11 7 M2.5 11V14H13.5V11', import: 'M8 10V1.5 M5 4.5L8 1.5L11 4.5 M2.5 11V14H13.5V11', undo: 'M5.5 3.5L2.5 6.5L5.5 9.5 M2.5 6.5H10Q13.5 6.5 13.5 10Q13.5 13.5 10 13.5H6', redo: 'M10.5 3.5L13.5 6.5L10.5 9.5 M13.5 6.5H6Q2.5 6.5 2.5 10Q2.5 13.5 6 13.5H10',
  trash: 'M2.5 4H13.5 M5.5 4V2.5H10.5V4 M4 4L4.5 14H11.5L12 4', fit: 'M2 6V2H6 M10 2H14V6 M14 10V14H10 M6 14H2V10', check: 'M3 8.5L6.5 12L13 4', cube: 'M8 1.5L14 5V11L8 14.5L2 11V5Z M8 8L14 5 M8 8V14.5 M8 8L2 5',
  sketch: 'M2 14L3 10.5L11 2.5L13.5 5L5.5 13Z M9.5 4L12 6.5', extrude: 'M3 11H11V14H3Z M3 11L6 8H14L11 11 M14 8V11L11 14 M8.5 6.5V1.5 M6.5 3.5L8.5 1.5L10.5 3.5', revolve: 'M8 1.5V14.5 M4 4Q1 8 4 12 M12 4Q15 8 12 12 M10.5 11.5L12 12L12.5 10.5',
  sweep: 'M2 13Q6 13 8 8T14 3 M2 11V15 M4 11V15', loft: 'M3 13H9 M6 3H13 M3 13L6 3 M9 13L13 3', fillet: 'M2 14V7Q2 2 7 2H14', chamfer: 'M2 14V7L7 2H14', shell: 'M2 4H14V14H2Z M4 4V12H12V4',
  hole: 'M8 3A5 2 0 1 0 8.01 3 M3 3V12A5 2 0 0 0 13 12V3', lpattern: 'M2 6H5V9H2Z M6.5 6H9.5V9H6.5Z M11 6H14V9H11Z', cpattern: 'M8 1.5A1.5 1.5 0 1 0 8.01 1.5 M13 6A1.5 1.5 0 1 0 13.01 6 M11 12A1.5 1.5 0 1 0 11.01 12 M5 12A1.5 1.5 0 1 0 5.01 12 M3 6A1.5 1.5 0 1 0 3.01 6',
  mirror: 'M8 1.5V14.5 M6 4L2 12H6Z M10 4L14 12H10Z', boolean: 'M6 3A4 4 0 1 0 6.01 3 M10 5A4 4 0 1 0 10.01 5', plane: 'M1.5 11L5 4H14.5L11 11Z', variables: 'M3 2Q1.5 8 3 14 M13 2Q14.5 8 13 14 M5.5 5L10.5 11 M10.5 5L5.5 11',
  measure: 'M1.5 10.5L10.5 1.5L14.5 5.5L5.5 14.5Z M4 8L5.5 9.5 M6.5 5.5L8 7 M9 3L10.5 4.5', section: 'M2 2H14V14H2Z M2 8H14', eye: 'M1.5 8Q8 1.5 14.5 8Q8 14.5 1.5 8Z M8 6A2 2 0 1 1 8 10A2 2 0 1 1 8 6',
  theme: 'M8 1.5A6.5 6.5 0 1 0 8 14.5Z', book: 'M2 3H6.5Q8 3 8 4.5V14Q8 12.5 6.5 12.5H2Z M14 3H9.5Q8 3 8 4.5V14Q8 12.5 9.5 12.5H14Z', info: 'M8 1.5A6.5 6.5 0 1 0 8 14.5A6.5 6.5 0 1 0 8 1.5 M8 7V11.5 M8 4.5V5',
  home: 'M2 8L8 2.5L14 8 M4 7V13.5H12V7', cloud: 'M4.5 12.5H12A2.75 2.75 0 0 0 12.2 7A4 4 0 0 0 4.4 6.6A3 3 0 0 0 4.5 12.5Z', upload: 'M4.5 12.5H12A2.75 2.75 0 0 0 12.2 7A4 4 0 0 0 4.4 6.6A3 3 0 0 0 4.5 12.5Z M8 11V7 M6.5 8.5L8 7L9.5 8.5',
  fork: 'M4.5 1.5A1.5 1.5 0 1 1 4.49 1.5 M11.5 1.5A1.5 1.5 0 1 1 11.49 1.5 M4.5 11.5A1.5 1.5 0 1 1 4.49 11.5 M4.5 4.5V11.5 M11.5 4.5V6A2 2 0 0 1 9.5 8H6.5A2 2 0 0 0 4.5 10',
  user: 'M8 2A3 3 0 1 0 8 8A3 3 0 1 0 8 2 M2.5 14Q2.5 9.5 8 9.5Q13.5 9.5 13.5 14', users: 'M6 2.5A2.5 2.5 0 1 1 5.99 2.5 M1.5 13.5A4.5 4.5 0 0 1 10.5 13.5 M10.5 3A2.5 2.5 0 0 1 11 8 M11.5 9.5A4 4 0 0 1 14.5 13.5',
  star: 'M8 1.5L9.9 6.1L14.5 6.5L11 9.6L12.1 14.5L8 12L3.9 14.5L5 9.6L1.5 6.5L6.1 6.1Z', card: 'M1.5 3.5H14.5V12.5H1.5Z M1.5 6.5H14.5 M4 10H7', sync: 'M13 6A5.2 5.2 0 0 0 3.4 4.6 M3 2V5H6 M3 10A5.2 5.2 0 0 0 12.6 11.4 M13 14V11H10',
  signin: 'M6 2.5H13.5V13.5H6 M2 8H9.5 M7 5.5L9.5 8L7 10.5', signout: 'M10 2.5H2.5V13.5H10 M14 8H6.5 M11.5 5.5L14 8L11.5 10.5', keyboard: 'M1.5 4H14.5V12H1.5Z M4 6.5H5 M7 6.5H8 M10 6.5H11 M4 9.5H12',
  pdf: 'M4 1.5h5.5L12.5 4.5V14.5H4Z', beam: 'M1.5 8H14.5 M10.5 4.5L14.5 8L10.5 11.5', ion: 'M8 1.5A6.5 6.5 0 1 1 7.99 1.5 M5 8H11 M8 5V11', link: 'M6.5 9.5L9.5 6.5 M7 11L5.5 12.5A2.1 2.1 0 0 1 2.5 9.5L4.5 7.5A2.1 2.1 0 0 1 7.5 7.5 M9 5L10.5 3.5A2.1 2.1 0 0 1 13.5 6.5L11.5 8.5A2.1 2.1 0 0 1 8.5 8.5',
  line: 'M2 14L14 2', rect: 'M2 4H14V12H2Z', crect: 'M2 4H14V12H2Z M8 8H8.1', circle: 'M8 2A6 6 0 1 0 8.01 2', arc3: 'M2 12A7 7 0 0 1 14 12', tarc: 'M2 13H7A6 6 0 0 0 13 7', slot: 'M5 4H11A4 4 0 0 1 11 12H5A4 4 0 0 1 5 4Z',
  polygon: 'M8 1.5L14 5V11L8 14.5L2 11V5Z', point: 'M8 6.5A1.5 1.5 0 1 0 8.01 6.5', construct: 'M2 14L4 12 M6 10L8 8 M10 6L12 4', use: 'M2 12H14 M8 2V9 M5.5 6.5L8 9L10.5 6.5', trim: 'M3 3L13 13 M3 13L7 9 M9 7L13 3',
  offset: 'M2 11H10V3 M5 14H13V6', dim: 'M2 12V5 M14 12V5 M2 8.5H14 M4.5 6.5L2 8.5L4.5 10.5 M11.5 6.5L14 8.5L11.5 10.5', select: 'M3 2L3 13L6 10L8.5 14.5L10.5 13.5L8 9H12.5Z',
};
export function cadIcons(root) {
  for (const n of root.querySelectorAll('[data-icon]')) {
    if (n.querySelector(':scope > svg.ic')) continue;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', CAD_ICONS[n.dataset.icon] || '');
    svg.append(p); n.prepend(svg);
  }
}
/* ---------- the theme: JEKray's, kept as 'jekray-theme', so every app looks alike ---------- */
const THEME_KEY = 'jekray-theme';
export function cadTheme() { try { const v = localStorage.getItem(THEME_KEY); return v === 'light' || v === 'system' ? v : 'dark'; } catch (err) { return 'dark'; } }
export function themeNow() {
  const v = cadTheme(), dark = v === 'dark' || (v === 'system' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.rtTheme = dark ? 'dark' : 'light';
  emit('theme');
}
export function setCadTheme(v) { try { if (v === 'dark') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, v); } catch (err) { /* this visit */ } themeNow(); }
export const isDark = () => document.documentElement.dataset.rtTheme === 'dark';
