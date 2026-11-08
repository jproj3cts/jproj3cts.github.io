import { EMBED } from '../../../jekray/src/core/constants.js';
import { hooks } from '../../../jekray/src/core/hooks.js';
import { goal, track } from '../../../jekray/src/io/usage.js';
import { SHAPES } from '../core/geom.js';
import { project, selectedId, setSelectedId, V, selectedItem, kindOf, nextName, uid } from '../state/project.js';
import { checkpoint, redoStep, undoStep } from '../state/elements.js';
import { makeElectrode } from '../parts/electrodes.js';
import { normDetector, normIon } from '../parts/ions.js';
import { h, renderPanel, setPanelClosed, syncPanel } from './panel.js';
import { fitView, requestRender, pointOf } from './render.js';
import { simChanged, flyNow } from './sim.js';
import { scheduleSave } from '../io/open.js';
import { cloudChanged } from '../io/cloud.js';

/* ==========================================================================
   What the page does: toasts and status, the changed() everything funnels through, undo and redo, adding,
   duplicating, mirroring and removing things, the right-click menu, the menus' wiring and the keyboard.
   ========================================================================== */
export function setStatus(t) { const el = document.getElementById('status'); if (el) el.textContent = t; }
let toastTimer = null;
export function toast(msg, bad) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), bad ? 5000 : 2500);
}
export function downloadFile(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export const safeFileName = name => (name || 'bench').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'bench';
export let unsaved = false;
export function markUnsaved(on) { unsaved = !!on; const d = document.getElementById('saveDot'); if (d) d.hidden = !on; }
/* after any change: the panel (rebuilt or refreshed), the buttons, the autosave, a redraw, and the simulation told */
/* the bench's name field is as wide as its text (within the bar's room), so a long name is read whole */
let nameCtx = null;
export function fitName() {
  const inp = document.getElementById('projName'); if (!inp) return;
  nameCtx = nameCtx || document.createElement('canvas').getContext('2d');
  nameCtx.font = getComputedStyle(inp).font;
  const w = nameCtx.measureText(inp.value || inp.placeholder || '').width + 28;
  const px = Math.max(96, Math.min(w, Math.max(160, window.innerWidth * 0.34))) + 'px';
  inp.style.width = px; inp.style.flexBasis = px;
}
/* fit whichever view is showing: the 3D view when it is on (through its hook), else the bench */
export function fitAny() { if (!(hooks.ionFit3d && hooks.ionFit3d())) fitView(); }
/* cut through another plane; a cut outside the array is brought inside by the slice request */
export function setPlane(plane) { V().plane = plane; viewMenuShown(); changed(false); }
export function changed(rebuildPanel) {
  if (rebuildPanel) renderPanel(); else syncPanel();
  updateUndoButtons();
  scheduleSave();
  markUnsaved(true);
  cloudChanged();
  requestRender();
  simChanged();
  goal('edit');
}
export function updateUndoButtons() {
  const { history, future } = hooks.ionHistory();
  for (const id of ['btnUndo', 'editUndo']) { const b = document.getElementById(id); if (b) b.disabled = !history.length; }
  for (const id of ['btnRedo', 'editRedo']) { const b = document.getElementById(id); if (b) b.disabled = !future.length; }
}
export function undo() { if (undoStep()) { changed(true); toast('Undone'); } }
export function redo() { if (redoStep()) { changed(true); toast('Redone'); } }
export function selectOne(id) { setSelectedId(id); setPanelClosed(false); renderPanel(); requestRender(); }
/* a new electrode of a shape, at the view's centre (or a point), named and coloured for its place in the list */
export function addElectrode(shape, at) {
  checkpoint();
  const p = at || pointOf(V().cx, V().cy), G = project.grid;
  const el = makeElectrode(shape, snapTo(p[0]), G.sym === 'cyl' ? 0 : snapTo(p[1]), project.electrodes.length, project.electrodes.map(e => e.name));
  el.z = G.sym === '3d' ? snapTo(p[2]) : 0;
  if (G.sym === 'cyl') { el.y = 0; el.axis = 'x'; }
  project.electrodes.push(el);
  selectOne(el.id); changed(true); track('part', 'ion-' + shape);
  return el;
}
export function addIon(at) {
  checkpoint();
  const p = at || pointOf(V().cx, V().cy), G = project.grid;
  const g = normIon({ name: nextName('Ions', project.ions), x: snapTo(p[0]), y: G.sym === 'cyl' ? 0 : snapTo(p[1]), z: G.sym === '3d' ? snapTo(p[2]) : 0, species: project.species.name, mass: project.species.mass, charge: project.species.charge }, project.ions.length);
  project.ions.push(g);
  selectOne(g.id); changed(true); track('part', 'ion-group');
  return g;
}
export function addDetector(at) {
  checkpoint();
  const p = at || pointOf(V().cx, V().cy);
  const d = normDetector({ name: nextName('Detector', project.detectors), axis: 'x', x: snapTo(p[0]), y: 0, z: 0, half: 0, stop: true }, project.detectors.length);
  project.detectors.push(d);
  selectOne(d.id); changed(true); track('part', 'ion-detector');
  return d;
}
export const snapTo = (v, e) => (e && e.shiftKey ? v : Math.round(v / project.grid.h) * project.grid.h);
export const listOf = kind => (kind === 'electrode' ? project.electrodes : kind === 'ion' ? project.ions : project.detectors);
export function removeSel() {
  const s = selectedItem(); if (!s) return;
  checkpoint();
  const list = listOf(s.kind); list.splice(list.indexOf(s.el), 1);
  setSelectedId(null); changed(true); toast('Removed ' + s.el.name);
}
export function duplicateSel(mirrorX) {
  const s = selectedItem(); if (!s) return null;
  checkpoint();
  const list = listOf(s.kind), copy = JSON.parse(JSON.stringify(Object.assign({}, s.el, { meshT: undefined })));
  copy.id = uid(); copy.name = nextName(s.el.name.replace(/\s+\d+$/, ''), list);
  if (mirrorX) { copy.x = -copy.x; if (copy.shape === 'endcap') copy.side = -copy.side; if (s.kind === 'ion') copy.dirAz = 180 - copy.dirAz; if (s.kind === 'detector' && copy.axis === 'x') copy.at = copy.x; }
  else { const d = project.grid.h * 4; copy[s.kind === 'detector' && copy.axis !== 'x' ? 'y' : 'x'] += d; if (s.kind === 'detector') copy.at = copy[copy.axis]; }
  if (s.el.meshT) copy.meshT = s.el.meshT;
  list.push(copy);
  selectOne(copy.id); changed(true);
  return copy;
}
/* ---------- the right-click menu ---------- */
export function hideCtxMenu() { const m = document.getElementById('ctxMenu'); if (m) m.hidden = true; }
export function showCtxMenu(x, y, items) {
  const m = document.getElementById('ctxMenu');
  m.replaceChildren(...items.map(it => it === '-' ? h('div', { class: 'sep' }) : h('button', { type: 'button', role: 'menuitem', disabled: it.off ? '' : null, onclick: () => { hideCtxMenu(); it.fn(); } }, it.label, it.key ? h('span', { class: 'k' }, it.key) : null)));
  m.hidden = false;
  m.style.left = '0px'; m.style.top = '0px';
  const r = m.getBoundingClientRect();
  m.style.left = (Math.max(4, Math.min(x, window.innerWidth - r.width - 8)) - r.left) + 'px';
  m.style.top = (Math.max(4, Math.min(y, window.innerHeight - r.height - 8)) - r.top) + 'px';
}
export function benchMenu(X, Y, hit, at) {
  const point = { label: 'Analysis point here', fn: () => { checkpoint(); project.point = at.map(v => snapTo(v)); changed(true); toast('The trap analysis is done at this point'); } };
  if (!hit) {
    showCtxMenu(X, Y, [{ label: 'Insert here…', fn: () => hooks.ionAddMenu(at) }, { label: 'Add an ion group here', fn: () => addIon(at) }, { label: 'Add a detector here', fn: () => addDetector(at) }, '-', point,
      { label: 'Clear the analysis point', off: !project.point, fn: () => { checkpoint(); project.point = null; changed(true); } }, '-', { label: 'Fit the view', key: 'F', fn: fitAny }, { label: 'Fly the ions', key: 'Space', fn: () => flyNow() }]);
    return;
  }
  if (hit.id !== selectedId) selectOne(hit.id);
  const kind = kindOf(hit);
  showCtxMenu(X, Y, [{ label: 'Duplicate', key: 'Ctrl+D', fn: () => duplicateSel(false) }, { label: 'Duplicate mirrored in x', fn: () => duplicateSel(true) },
    { label: hit.on === false ? 'Put back in the array' : 'Leave out of the array', fn: () => { checkpoint(); hit.on = hit.on === false; changed(true); } },
    { label: hit.locked ? 'Unlock' : 'Lock in place', fn: () => { checkpoint(); hit.locked = !hit.locked; changed(true); } }, '-',
    ...(kind === 'electrode' ? [{ label: 'Voltage 0 V', fn: () => { checkpoint(); hit.V = 0; changed(true); } }, '-'] : []), point, '-',
    { label: 'Delete', key: 'Del', fn: removeSel }]);
}
export const typingIn = t => !!(t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable));
/* ---------- the menus and the keyboard ---------- */
export function wireActions() {
  // the menu bar: one open at a time, pointing opens the next (as a desktop menu bar)
  const shows = new Map();
  for (const [bId, mId] of [['btnFile', 'fileMenu'], ['btnEdit', 'editMenu'], ['btnView', 'viewMenu'], ['btnTools', 'toolsMenu'], ['btnHelpMenu', 'helpMenu'], ['btnAcct', 'acctMenu'], ['btnMore', 'moreMenu'], ['btnAdd', 'addMenu']]) {
    const btn = document.getElementById(bId), menu = document.getElementById(mId);
    if (!btn || !menu) continue;
    const show = on => {
      menu.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (!on) return;
      for (const [b, sh] of shows) if (b !== btn && b.getAttribute('aria-expanded') === 'true') sh(false);
      menu.style.translate = '';
      const r = menu.getBoundingClientRect(), vw = document.documentElement.clientWidth, pad = 8;
      const dx = r.left < pad ? pad - r.left : r.right > vw - pad ? Math.max(pad - r.left, vw - pad - r.right) : 0;
      if (dx) menu.style.translate = dx + 'px 0';
      const f = menu.querySelector('button:not(:disabled)'); if (f) f.focus();
    };
    btn.addEventListener('click', e => { e.stopPropagation(); show(menu.hidden); });
    shows.set(btn, show);
    if (btn.closest('.rt-menubar')) btn.addEventListener('pointerenter', e => { if (e.pointerType !== 'mouse' || !menu.hidden) return; if (document.querySelectorAll('.rt-menubar .rt-mbar[aria-expanded="true"]').length) btn.click(); });
    menu.addEventListener('click', e => { if (e.target.closest('button') && !e.target.closest('.rt-sub')) show(false); });
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) show(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { show(false); btn.focus(); } });
  }
  for (const m of ['fileMenu', 'editMenu', 'viewMenu', 'toolsMenu', 'helpMenu', 'moreMenu']) document.getElementById(m).addEventListener('click', e => { const b = e.target.closest('[data-click]'); if (b) setTimeout(() => document.getElementById(b.dataset.click).click()); });
  for (const b of document.querySelectorAll('.rt-bar > [data-click], .rt-quick [data-click]')) b.addEventListener('click', e => { e.stopPropagation(); document.getElementById(b.dataset.click).click(); });
  document.getElementById('btnUndo').addEventListener('click', undo);
  document.getElementById('btnRedo').addEventListener('click', redo);
  document.getElementById('editMenu').addEventListener('click', e => {
    const b = e.target.closest('[data-edit]'); if (!b) return;
    if (b.dataset.edit === 'dup') duplicateSel(false); else if (b.dataset.edit === 'mirror') duplicateSel(true); else if (b.dataset.edit === 'del') removeSel();
  });
  document.getElementById('btnFit').addEventListener('click', fitAny);
  document.getElementById('btnShowPanel').addEventListener('click', () => { setPanelClosed(false); renderPanel(); });
  document.getElementById('btnSideTab').addEventListener('click', () => { const open = document.getElementById('panel').style.display !== 'none'; if (open) { setSelectedId(null); setPanelClosed(true); } else { setSelectedId(null); setPanelClosed(false); } renderPanel(); requestRender(); });
  document.getElementById('viewMenu').addEventListener('click', e => {
    const p = e.target.closest('[data-plane]'), q = e.target.closest('[data-pot]'), r = e.target.closest('[data-colour]');
    if (p) { setPlane(p.dataset.plane); }
    if (q) { checkpoint(); project.show.pot = q.dataset.pot; viewMenuShown(); changed(false); }
    if (r) { checkpoint(); project.show.colourBy = r.dataset.colour; viewMenuShown(); requestRender(); }
  });
  document.getElementById('btnEfield').addEventListener('click', () => { checkpoint(); project.show.efield = !project.show.efield; viewMenuShown(); changed(false); });
  document.getElementById('btnTraj').addEventListener('click', () => { checkpoint(); project.show.traj = !project.show.traj; viewMenuShown(); requestRender(); });
  document.getElementById('btnGridShow').addEventListener('click', () => { checkpoint(); project.show.grid = !project.show.grid; viewMenuShown(); requestRender(); });
  document.getElementById('btnAuto').addEventListener('click', () => { project.fly.auto = !project.fly.auto; viewMenuShown(); scheduleSave(); if (project.fly.auto) simChanged(); });
  document.getElementById('projName').addEventListener('input', e => { project.name = e.target.value.slice(0, 80); fitName(); scheduleSave(); markUnsaved(true); });
  // the keyboard
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); hooks.ionSave(); return; }
    if (typingIn(e.target) || EMBED) return;
    if (document.querySelector('dialog[open]')) return;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(false); return; }
    if (mod) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedId) { e.preventDefault(); removeSel(); } return; }
    if (e.key === 'Escape') { if (hooks.ionBusy()) hooks.ionStop(); else { setSelectedId(null); renderPanel(); requestRender(); } return; }
    if (e.key === ' ') { e.preventDefault(); flyNow(); return; }
    if (e.key === 'f' || e.key === 'F') { fitAny(); return; }
    if (e.key === 'a' || e.key === 'A') { document.getElementById('btnAdd').click(); return; }
    if (e.key === '?') { document.getElementById('btnHelp').click(); return; }
    if (e.key === '1' || e.key === '2' || e.key === '3') { setPlane(['xy', 'xz', 'yz'][+e.key - 1]); return; }
    if (e.key === 'PageUp' || e.key === 'PageDown') { V().slice = +(V().slice + (e.key === 'PageUp' ? 1 : -1) * project.grid.h).toPrecision(8); changed(false); return; }
    if (/^Arrow/.test(e.key) && selectedId) {
      const s = selectedItem(); if (!s || s.el.locked) return;
      e.preventDefault();
      const d = project.grid.h * (e.shiftKey ? 10 : 1), [iu, iv] = [['x', 'y', 'z'][['xy', 'xz', 'yz'].indexOf(V().plane) === 2 ? 1 : 0], V().plane === 'xy' ? 'y' : 'z'];
      checkpoint();
      if (e.key === 'ArrowLeft') s.el[iu] -= d; if (e.key === 'ArrowRight') s.el[iu] += d; if (e.key === 'ArrowUp') s.el[iv] += d; if (e.key === 'ArrowDown') s.el[iv] -= d;
      if (s.kind === 'detector') s.el.at = s.el[s.el.axis];
      changed(false);
    }
  });
  viewMenuShown();
}
/* the View and Tools menus' ticks, as the project has them */
export function viewMenuShown() {
  if (!project) return;
  for (const b of document.querySelectorAll('[data-plane]')) b.setAttribute('aria-checked', String(b.dataset.plane === V().plane));
  for (const b of document.querySelectorAll('[data-pot]')) b.setAttribute('aria-checked', String(b.dataset.pot === project.show.pot));
  for (const b of document.querySelectorAll('[data-colour]')) b.setAttribute('aria-checked', String(b.dataset.colour === project.show.colourBy));
  document.getElementById('btnEfield').setAttribute('aria-checked', String(!!project.show.efield));
  document.getElementById('btnTraj').setAttribute('aria-checked', String(!!project.show.traj));
  document.getElementById('btnGridShow').setAttribute('aria-checked', String(!!project.show.grid));
  document.getElementById('btnAuto').setAttribute('aria-checked', String(!!project.fly.auto));
  const name = document.getElementById('projName'); if (name && name.value !== project.name) name.value = project.name; fitName();
  const cyl = project.grid.sym !== '3d';
  for (const b of document.querySelectorAll('[data-plane]')) b.disabled = cyl && b.dataset.plane !== 'xy';
}
export const shapeLabel = shape => (SHAPES[shape] || SHAPES.box).label;
