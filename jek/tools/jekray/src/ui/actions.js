import { EMBED, LOCKED, TEST_MODE, clamp, cloud } from '../core/constants.js';
import { asmCheck, asmKind, asmOf, asmOfSelection, normAssemblies, remapDesign } from '../core/assembly.js';
import { designOne, makeAssembly, splitAssembly } from './assembly.js';
import { openLensDesign } from './lens-workspace.js';
import { fmtLen } from '../core/format.js';
import { V, deg, extraSel, future, history, nextName, num, project, selectOne, selectedId, uid } from '../state/project.js';
import { makeElement, normElement, serialize } from '../state/elements.js';
import { onTab } from '../state/tabs.js';
import { lastTrace } from '../engines/trace.js';
import {
  H, W, canvas, ctx, fibreAtPx, getCss, halfSize, hornShape, lightLayer, removeFibre, requestRender,
  selection, setSelFibreId, setSelection, sx, sy, themeDark, worldBox, wx, wy
} from './render.js';
import { arrowAt, editText, flipEls, groupEls, groupOf, labelAt, noteAt, partsLocked, penEnded, restack, ungroupEls } from './drawings.js';
import { RIGHT, drag, hitTest, setDrag, snapVal } from './pointer.js';
import { portWorld, portsOf } from '../engines/fibre.js';
import { V3D } from './view3d.js';
import { stopSweepsFor, updateSweepButtons } from './optimise.js';
import { h, renderPanel, syncPanel } from './panel.js';
import { checkpoint, redoWords, switchTab, undoWords } from './tabs.js';
import { openProjectData, parseProjectText } from '../io/open.js';
import { saveToMine } from './myparts.js';
import { accountsOn, saveNudge } from '../io/account.js';
import { goal } from '../io/usage.js';
import { hooks } from '../core/hooks.js';
import { scheduleSave } from '../io/autosave.js';

/* ==========================================================================
   Actions
   ========================================================================== */

export function changed(rebuildPanel) {
  if (rebuildPanel) renderPanel(); else syncPanel();
  updateSweepButtons();
  updateUndoButtons();
  scheduleSave();
  requestRender();
}

export function addElement(kind) {
  checkpoint();
  const n = project.elements.length;
  const off = (n % 5) * 4;
  const el = makeElement(kind, snapVal(V().cx + off), snapVal(V().cy - off));
  el.bench = project.tab;
  project.elements.push(el);
  selectOne(el.id);
  changed(true);
}
export function duplicate(el) {
  checkpoint();
  const c = normElement(JSON.parse(JSON.stringify(el)));
  c.id = uid(); c.name = nextName(el.name.replace(/\s+\d+$/, '')); delete c.group;
  c.x += 5; c.y -= 5;
  project.elements.push(c);
  selectOne(c.id);
  changed(true);
}
/* move, turn and remove several at once (locked ones stay) */
export function moveEls(list, dx, dy) {
  const ids = new Set(list.filter(e => !e.locked).map(e => e.id));
  for (const e of list) if (!e.locked) { e.x = +(e.x + dx).toFixed(4); e.y = +(e.y + dy).toFixed(4); }
  for (const F of project.fibres || []) if (ids.has(F.a[0]) && ids.has(F.b[0])) for (const n of F.path || []) { n.x += dx; n.y += dy; }
}
/* turned by deg about their middle: each element's own angle too, and the shapes of the
   fibres between them */
export function rotateEls(list, degs) {
  const free = list.filter(e => !e.locked);
  if (!free.length) return;
  checkpoint();
  const cx = free.reduce((a, e) => a + e.x, 0) / free.length, cy = free.reduce((a, e) => a + e.y, 0) / free.length;
  const r = degs * deg, c = Math.cos(r), sn = Math.sin(r), rot = (x, y) => [cx + (x - cx) * c - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * c];
  for (const e of free) { if (free.length > 1) [e.x, e.y] = rot(e.x, e.y); e.angle = ((e.angle + degs) % 360 + 540) % 360 - 180; }
  const ids = new Set(free.map(e => e.id));
  if (free.length > 1) for (const F of project.fibres || []) if (ids.has(F.a[0]) && ids.has(F.b[0])) for (const n of F.path || []) {
    [n.x, n.y] = rot(n.x, n.y);
    for (const k of ['h1', 'h2']) n[k] = [n[k][0] * c - n[k][1] * sn, n[k][0] * sn + n[k][1] * c];
  }
  changed(true);
}
export function removeEls(list) {
  if (!list.length) return;
  checkpoint();
  const ids = new Set(list.map(e => e.id));
  for (const e of list) stopSweepsFor(e);
  project.elements = project.elements.filter(e => !ids.has(e.id));
  project.fibres = (project.fibres || []).filter(F => !ids.has(F.a[0]) && !ids.has(F.b[0]));
  selectOne(null);
  changed(true);
}
export function setLocked(list, on) { checkpoint(); for (const e of list) { if (on) e.locked = true; else delete e.locked; } changed(true); }
export function moveToTab(list, id) { checkpoint(); for (const e of list) e.bench = id; switchTab(id); setSelection(list); changed(true); }
/* line up and space out: the middles on one line, or evenly between the outermost two */
export function alignEls(list, how) {
  const free = list.filter(e => !e.locked);
  if (free.length < 2) return;
  checkpoint();
  const k = how === 'x' || how === 'dx' ? 'x' : 'y';
  if (how === 'x' || how === 'y') { const m = free.reduce((a, e) => a + e[k], 0) / free.length; for (const e of free) e[k] = snapVal(m); }
  else {
    const s2 = free.slice().sort((a, b) => a[k] - b[k]), lo = s2[0][k], hi = s2[s2.length - 1][k];
    s2.forEach((e, i) => { e[k] = +(lo + (hi - lo) * i / (s2.length - 1)).toFixed(4); });
  }
  changed(true);
}

/* ---------- Copy and paste ----------
   What is copied is the elements and the fibres between them, as JSON, on the system
   clipboard (so it pastes into another tab, or another project in another window) and kept
   here too for the menu's Paste. A paste gets new names where the old ones are taken, and
   a split source keeps pointing at its laser if that came along. */
let clipMem = null;
export function clipOf(list) {
  const ids = new Set(list.map(e => e.id));
  const asms = (project.assemblies || []).filter(a => list.some(e => e.group === a.id) && project.elements.filter(e => e.group === a.id).every(e => ids.has(e.id)));
  return { format: 'jekray-clip', version: 1, from: project.tab, elements: JSON.parse(JSON.stringify(list)), ...(asms.length ? { assemblies: JSON.parse(JSON.stringify(asms)) } : {}),
    fibres: JSON.parse(JSON.stringify((project.fibres || []).filter(F => ids.has(F.a[0]) && ids.has(F.b[0])))) };
}
export function pasteClip(clip, at) {
  if (!clip || clip.format !== 'jekray-clip' || !Array.isArray(clip.elements) || !clip.elements.length) return false;
  checkpoint();
  const map = new Map(), made = [], groups = new Map();
  const cx = clip.elements.reduce((a, e) => a + num(e.x, 0), 0) / clip.elements.length, cy = clip.elements.reduce((a, e) => a + num(e.y, 0), 0) / clip.elements.length;
  // at the point given; else on top of the originals, nudged if they are on this tab
  let dx = 0, dy = 0;
  if (at) { dx = at[0] - cx; dy = at[1] - cy; }
  else if (clip.from === project.tab && project.elements.some(e => clip.elements.some(c => c.id === e.id))) { dx = 5; dy = -5; }
  for (const c of clip.elements) {
    const e = normElement(Object.assign({}, c, { id: undefined, bench: project.tab, locked: false }));
    if (!e) continue;
    e.id = uid();
    if (e.group) { if (!groups.has(e.group)) groups.set(e.group, 'g' + uid().slice(1)); e.group = groups.get(e.group); }   // a group of its own
    if (project.elements.some(x => x.name === e.name) || made.some(x => x.name === e.name)) e.name = nextName(String(c.name).replace(/\s+\d+$/, ''));
    e.x = +(e.x + dx).toFixed(4); e.y = +(e.y + dy).toFixed(4);
    map.set(c.id, e.id); made.push(e);
    project.elements.push(e);             // at once, so the next one's name sees it
  }
  for (const e of made) if (e.splitFrom && map.has(e.splitFrom)) e.splitFrom = map.get(e.splitFrom);
  // a whole assembly copied: its record with it, for the copy's own group
  for (const a of Array.isArray(clip.assemblies) ? clip.assemblies : []) {
    if (!groups.has(a.id) || !map.has(a.ref)) continue;
    project.assemblies = (project.assemblies || []).concat(normAssemblies([Object.assign({}, a, { id: groups.get(a.id), ref: map.get(a.ref), name: String(a.name) + ' copy', design: remapDesign(a.design, map) })], made));
  }
  project.fibres = project.fibres || [];
  for (const F of clip.fibres || []) {
    if (!map.has(F.a[0]) || !map.has(F.b[0])) continue;
    const G = JSON.parse(JSON.stringify(F));
    G.id = uid(); G.a[0] = map.get(F.a[0]); G.b[0] = map.get(F.b[0]);
    for (const n of G.path || []) { n.x += dx; n.y += dy; }
    project.fibres.push(G);
  }
  setSelection(made);
  changed(true);
  return true;
}
export function duplicateSel() { const list = selection(); if (list.length) pasteClip(clipOf(list)); }
/* the Edit menu's commands: what their keys do, to the selection on this tab */
export function editCommand(k) {
  if (LOCKED) return;
  const list = selection();
  if (k === 'copy' || k === 'cut') {
    if (!list.length) return;
    clipMem = clipOf(list);
    try { navigator.clipboard.writeText(JSON.stringify(clipMem)).catch(() => {}); } catch (err) { /* kept here */ }
    if (k === 'cut') removeEls(list); else toast('Copied ' + list.length + ' element' + (list.length === 1 ? '' : 's'));
  } else if (k === 'paste') { if (clipMem) pasteClip(clipMem); }
  else if (k === 'dup') duplicateSel();
  else if (k === 'del') removeEls(list);
  else if (k === 'all') setSelection(project.elements.filter(x => onTab(x) && (!partsLocked() || x.type === 'draw')));
  else if (k === 'rot') { if (list.every(x => x.locked)) toast((list.length === 1 ? list[0].name + ' is' : 'They are') + ' locked in place'); else rotateEls(list, 90); }
  else if (k === 'group') groupEls(list);
  else if (k === 'ungroup') ungroupEls(list);
}
// which of them can be done now: none on a locked page, paste with something copied, the rest with a selection
export function editCan(k) {
  if (LOCKED) return false;
  const list = selection();
  return k === 'paste' ? !!clipMem : k === 'all' ? true : k === 'group' ? list.length > 1 : k === 'ungroup' ? list.some(e => e.group) : list.length > 0;
}
export const typingIn = t => t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
/* Browsers that do not raise copy/cut/paste with nothing selected (Safari) still get them:
   the keys set a flag, and if the event has not come in a moment the copy here is used. One
   key press pastes once: whichever of the two comes first does it, and the other is ignored
   (a paste event can come after the fallback has run); a key held down does not repeat it. */
let clipKey = null, pressV = null;               // pressV: the Ctrl+V press being answered, { t, done }
const pasteOnce = fn => {
  const P = pressV;
  if (P && performance.now() - P.t < 1500) { if (P.done) return; P.done = true; }
  fn();
};

/* ---------- The right-click menu ---------- */
export function hideCtxMenu() { const m = document.getElementById('ctxMenu'); if (m) m.hidden = true; }
export function showCtxMenu(x, y, items) {
  const m = document.getElementById('ctxMenu');
  m.replaceChildren(...items.map(it => it === '-' ? h('div', { class: 'sep' }) :
    h('button', { type: 'button', role: 'menuitem', disabled: it.off && !it.why ? '' : null, class: it.off && it.why ? 'rt-off rt-proneed' : null, 'aria-disabled': it.off && it.why ? 'true' : null, title: it.off && it.why ? it.why : null,
      onclick: () => { hideCtxMenu(); if (it.off) { if (it.why) { toast(it.why, true); hooks.proFix(); } } else it.fn(); } }, it.label, it.key && !(it.off && it.why) ? h('span', { class: 'k' }, it.key) : null)));
  m.hidden = false;
  // placed, then moved by however far off it landed: whatever box it is fixed to
  m.style.left = '0px'; m.style.top = '0px';
  const r = m.getBoundingClientRect();
  m.style.left = (Math.max(4, Math.min(x, window.innerWidth - r.width - 8)) - r.left) + 'px';
  m.style.top = (Math.max(4, Math.min(y, window.innerHeight - r.height - 8)) - r.top) + 'px';
}
/* the bench's right-click menu, for a part (or nothing) at a point: the 2D bench's and the 3D view's */
export function benchMenu(X, Y, hit, at, in3d) {
  const paste = { label: 'Paste here', key: 'Ctrl+V', off: !clipMem, fn: () => pasteClip(clipMem, at) };
  if (!hit) {
    showCtxMenu(X, Y, [paste, '-',
      { label: 'Select all on this tab', key: 'Ctrl+A', fn: () => setSelection(project.elements.filter(onTab)) },
      { label: 'Zoom to fit', key: in3d ? 'F' : null, fn: in3d ? () => V3D.fit(null, true) : fitView }, ...(in3d ? [] : [{ label: measureMode ? 'Stop measuring' : 'Measure', key: 'M', fn: () => setMeasure(!measureMode) },
        // a figure's notes, without going to the Draw palette (drawings are 2D only)
        '-', { label: 'Add a note here', fn: () => noteAt(snapVal(at[0]), snapVal(at[1])) }, { label: 'Add an arrow here', fn: () => arrowAt(snapVal(at[0]), snapVal(at[1])) }])]);
    return;
  }
  if (!(hit.id === selectedId || extraSel.has(hit.id))) { setSelection(groupOf(hit).sort((a, b) => (b === hit) - (a === hit))); }
  const list = selection(), n = list.length, locked = list.every(x => x.locked), one = n === 1 ? list[0] : null;
  const grouped = n > 1 && list.every(x => x.group && x.group === list[0].group);
  showCtxMenu(X, Y, [
    { label: n > 1 ? 'Duplicate ' + n + ' elements' : 'Duplicate', key: 'Ctrl+D', fn: duplicateSel },
    { label: 'Copy', key: 'Ctrl+C', fn: () => { clipMem = clipOf(list); try { navigator.clipboard.writeText(JSON.stringify(clipMem)); } catch (err) { /* kept here */ } toast('Copied'); } },
    { label: 'Cut', key: 'Ctrl+X', fn: () => { clipMem = clipOf(list); try { navigator.clipboard.writeText(JSON.stringify(clipMem)); } catch (err) { /* kept here */ } removeEls(list); } },
    paste,
    { label: 'Delete', key: 'Del', fn: () => removeEls(list) }, '-',
    ...(accountsOn() ? [{ label: n > 1 ? '★ Save ' + n + ' to My parts…' : '★ Save to My parts…', off: !!hooks.proWhy(), why: hooks.proWhy(), fn: () => saveToMine(list) }, '-'] : []),
    { label: 'Rotate 90\u00b0 anticlockwise', key: 'R', fn: () => rotateEls(list, 90) },
    { label: 'Rotate 90\u00b0 clockwise', key: 'Shift+R', fn: () => rotateEls(list, -90) },
    { label: 'Turn round (180\u00b0)', fn: () => rotateEls(list, 180) },
    ...(list.some(x => x.type === 'draw') ? [{ label: 'Flip horizontal', key: 'H', fn: () => flipEls(list, 'h') }, { label: 'Flip vertical', key: 'V', fn: () => flipEls(list, 'v') },
      { label: 'Raise to top', key: 'Home', fn: () => restack(list, 'top') }, { label: 'Lower to bottom', key: 'End', fn: () => restack(list, 'bottom') }] : []), '-',
    ...(n > 1 && !grouped ? [{ label: 'Group', key: 'Ctrl+G', fn: () => groupEls(list) }] : []),
    ...(n > 1 && !asmOfSelection(list) && asmCheck(list).ok ? [{ label: 'Make an assembly', fn: () => makeAssembly(list) }] : []),
    ...(n === 1 && asmOf(list[0]) && !asmOfSelection(list) ? [{ label: 'Open the assembly design\u2026', fn: () => openLensDesign(asmOf(list[0])) }] : []),
    ...(n === 1 && !list[0].group && asmKind(list[0]) && asmKind(list[0]) !== 'stop' && asmCheck(list).ok ? [{ label: 'Design as an assembly\u2026', fn: () => designOne(list[0]) }] : []),
    ...(asmOfSelection(list) ? [{ label: 'Split the assembly into parts', fn: () => splitAssembly(asmOfSelection(list)) }] : []),
    ...(list.some(x => x.group) ? [{ label: 'Ungroup', key: 'Ctrl+Shift+G', fn: () => ungroupEls(list) }] : []),
    ...(one && one.type !== 'draw' && !in3d ? [{ label: 'Edit name', fn: () => editText(one, 'name') }] : []),
    ...(one && one.type === 'draw' && one.shape === 'text' ? [{ label: 'Edit text', fn: () => editText(one, 'text') }] : []),
    ...(one && one.label ? [{ label: 'Put the name back', fn: () => { checkpoint(); delete one.label; changed(true); } }] : []),
    { label: locked ? 'Unlock' : 'Lock in place', fn: () => setLocked(list, !locked) }, '-',
    ...project.benches.filter(b => !list.every(x => x.bench === b.id)).map(b => ({ label: 'Move to ' + b.name, fn: () => moveToTab(list, b.id) })),
    { label: 'Zoom to selection', key: 'Z', fn: in3d ? () => V3D.zoomSel() : zoomToSelection }]);
}

/* ---------- Zoom to the selection, and the minimap ---------- */
function zoomTo(els) {
  if (!els.length) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const e of els) { const r = halfSize(e); x0 = Math.min(x0, e.x - r); x1 = Math.max(x1, e.x + r); y0 = Math.min(y0, e.y - r); y1 = Math.max(y1, e.y + r); }
  const pad = 1.5, sc = Math.min(W / ((x1 - x0) * pad || 1), H / ((y1 - y0) * pad || 1));
  Object.assign(V(), { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale: Math.min(200, Math.max(0.05, sc)) });
  scheduleSave(); requestRender();
}
export function zoomToSelection() { const list = selection(); if (list.length) zoomTo(list); else fitView(); }
/* The minimap: everything on this tab small, with the view as a rectangle; shown only when
   some of it is off screen. Click or drag on it to move the view there. */
let miniMap = null;
export function drawMinimap() {
  const mc = document.getElementById('minimap');
  if (!mc) return;
  const els = project.elements.filter(onTab);
  const vx0 = wx(0), vx1 = wx(W), vy0 = wy(H), vy1 = wy(0);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const e of els) { const r = halfSize(e); x0 = Math.min(x0, e.x - r); x1 = Math.max(x1, e.x + r); y0 = Math.min(y0, e.y - r); y1 = Math.max(y1, e.y + r); }
  if (!els.length || (x0 >= vx0 && x1 <= vx1 && y0 >= vy0 && y1 <= vy1)) { mc.hidden = true; miniMap = null; return; }
  mc.hidden = false;
  x0 = Math.min(x0, vx0); x1 = Math.max(x1, vx1); y0 = Math.min(y0, vy0); y1 = Math.max(y1, vy1);
  const mw = 180, mh = 120, d = window.devicePixelRatio || 1;
  if (mc.width !== mw * d) { mc.width = mw * d; mc.height = mh * d; }
  const pad = 6, k = Math.min((mw - 2 * pad) / (x1 - x0 || 1), (mh - 2 * pad) / (y1 - y0 || 1));
  const ox = pad + ((mw - 2 * pad) - (x1 - x0) * k) / 2, oy = pad + ((mh - 2 * pad) - (y1 - y0) * k) / 2;
  const MX = x => ox + (x - x0) * k, MY = y => mh - (oy + (y - y0) * k);
  miniMap = { MX, MY, k, x0, y0, ox, oy, mh };
  const g = mc.getContext('2d');
  g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, mw, mh);
  // beams, faint; then the elements as short strokes along their faces
  const dark = themeDark();               // drawn in the theme: light strokes over the dark, dark over paper
  g.strokeStyle = dark ? 'rgba(255,120,80,0.45)' : 'rgba(225,85,40,0.55)'; g.lineWidth = 1; g.beginPath();
  for (const b of lastTrace.beams || []) {
    if (b.bench !== project.tab || b.fan || b.pol) continue;
    const L = Math.min(b.len, 4 * (x1 - x0 + y1 - y0));
    g.moveTo(MX(b.x0), MY(b.y0)); g.lineTo(MX(b.x0 + b.dx * L), MY(b.y0 + b.dy * L));
  }
  g.stroke();
  for (const e of els) {
    const r = Math.max(halfSize(e), 1.5 / k), a = e.angle * deg, sel = e.id === selectedId || extraSel.has(e.id);
    g.strokeStyle = sel ? (dark ? '#ffffff' : '#1b2328') : e.type === 'source' ? (e.colour || '#ff6040') : dark ? 'rgba(210,225,232,0.85)' : 'rgba(70,80,88,0.8)'; g.lineWidth = sel ? 2 : 1.5;
    g.beginPath(); g.moveTo(MX(e.x - Math.sin(a) * r), MY(e.y + Math.cos(a) * r)); g.lineTo(MX(e.x + Math.sin(a) * r), MY(e.y - Math.cos(a) * r)); g.stroke();
  }
  g.strokeStyle = dark ? 'rgba(127,220,255,0.95)' : 'rgba(0,120,147,0.9)'; g.lineWidth = 1.2;
  g.strokeRect(MX(vx0), MY(vy1), (vx1 - vx0) * k, (vy1 - vy0) * k);
}

/* ---------- Measuring ----------
   A ruler (drag from one point to another: its length and bearing) and an angle (click
   its vertex, then a point on each arm). Ends snap to elements' middles, fibre ports and
   the beams; Shift turns snapping off. A ruler with both ends on one beam's path also gives
   the optical path between them. Measurements stay on their tab until cleared. */
export let measureMode = false, measureTool = 'ruler', measureDraft = null;
export function setMeasureDraft(v) { return (measureDraft = v); }
const addMeasure = m => { checkpoint(); (project.measures = project.measures || []).push(m); scheduleSave(); };
export function setMeasure(on) {
  measureMode = on; measureDraft = null;
  document.getElementById('btnMeasure').setAttribute('aria-pressed', on ? 'true' : 'false');
  document.getElementById('measureBar').hidden = !on;
  canvas.classList.toggle('rotate', on);
  requestRender();
}
export function measureSnap(px, py, free) {
  const P = { x: wx(px), y: wy(py) };
  if (free) return P;
  let best = null, bd = 9;
  const tryPt = (x, y, what) => { const d = Math.hypot(sx(x) - px, sy(y) - py); if (d < bd) { bd = d; best = { x, y, what }; } };
  for (const e of project.elements) {
    if (!onTab(e)) continue;
    tryPt(e.x, e.y, e.name);
    for (let i = 0; i < portsOf(e).length; i++) { const Q = portWorld(e, i); tryPt(Q.x, Q.y, e.name + ' port'); }
  }
  if (best) return best;
  // the nearest beam, and where along it
  let bb = null; bd = 8;
  (lastTrace.beams || []).forEach((b, i) => {
    if (b.bench !== project.tab || b.fan || b.pol) return;
    const t = clamp((P.x - b.x0) * b.dx + (P.y - b.y0) * b.dy, 0, b.len), x = b.x0 + b.dx * t, y = b.y0 + b.dy * t, d = Math.hypot(sx(x) - px, sy(y) - py);
    if (d < bd) { bd = d; bb = { x, y, beam: i, t, dx: b.dx, dy: b.dy, what: 'beam' }; }
  });
  return bb || P;
}
export function measureDown(px, py, e) {
  const P = measureSnap(px, py, e.shiftKey);
  if (measureTool === 'ruler') { measureDraft = { type: 'ruler', bench: project.tab, pts: [P, P] }; setDrag({ mode: 'measure' }); }
  else {
    if (!measureDraft) measureDraft = { type: 'angle', bench: project.tab, pts: [P, P] };
    else if (measureDraft.pts.length === 2) measureDraft.pts.push(P);
    else { measureDraft.pts[2] = P; addMeasure(measureDraft); measureDraft = null; }
    setDrag({ mode: 'measure', angle: true });
  }
  requestRender();
}
export function measureMove(px, py, e) {
  if (!measureDraft) return;
  const P = measureSnap(px, py, e.shiftKey);
  measureDraft.pts[measureDraft.pts.length - 1] = P;
  requestRender();
}
export function measureUp() {
  const d = drag; setDrag(null);
  if (d && !d.angle && measureDraft && measureDraft.type === 'ruler') {
    const [a, b] = measureDraft.pts;
    if (Math.hypot(sx(a.x) - sx(b.x), sy(a.y) - sy(b.y)) > 3) addMeasure(measureDraft);
    measureDraft = null;
  }
  requestRender();
}
/* the optical path between two points on beams, if one is downstream of the other */
/* a point taken on a beam, found again in the latest trace: every beam through it going its
   way (overlapping beams, like the two arms of a Michelson on its way out, give several) */
function beamsThrough(p) {
  if (p.dx === undefined) return [];
  const B = lastTrace.beams || [], tol = Math.max(1e-6, 0.5 / V().scale), out = [];
  B.forEach((b, i) => {
    if (b.bench !== project.tab || b.fan || b.pol || Math.abs(b.dx - p.dx) > 1e-6 || Math.abs(b.dy - p.dy) > 1e-6) return;
    const t = (p.x - b.x0) * b.dx + (p.y - b.y0) * b.dy;
    if (Math.abs((p.x - b.x0) * b.dy - (p.y - b.y0) * b.dx) < tol && t > -tol && t < b.len + tol) out.push({ beam: i, t });
  });
  return out;
}
/* the optical paths from one point to the other, along the light: each different one once */
export function measureOpl(a0, b0) {
  const A = beamsThrough(a0), Bs = beamsThrough(b0);
  if (!A.length || !Bs.length) return [];
  const B = lastTrace.beams, at = p => (B[p.beam].opl || 0) + B[p.beam].n * p.t;
  const up = (i, j) => { for (let k = j; k >= 0; k = B[k].parent) if (k === i) return true; return false; };
  const vals = [];
  for (const a of A) for (const b of Bs) {
    let v = null;
    if (a.beam === b.beam) v = Math.abs(at(b) - at(a));
    else if (up(a.beam, b.beam)) v = at(b) - at(a);
    else if (up(b.beam, a.beam)) v = at(a) - at(b);
    if (v !== null && !vals.some(w => Math.abs(w - v) < 1e-6)) vals.push(v);
  }
  return vals.sort((x, y) => x - y);
}
export function drawMeasures() {
  const list = (project.measures || []).filter(m => m.bench === project.tab);
  if (measureDraft && measureDraft.bench === project.tab) list.push(measureDraft);
  if (!list.length) return;
  ctx.save();
  ctx.font = '11px ' + getCss('--jek-mono'); ctx.lineWidth = 1.4;
  const label = (x, y, lines) => {
    const w = Math.max(...lines.map(t => ctx.measureText(t).width)) + 10, hh = 14 * lines.length + 6;
    ctx.fillStyle = lightLayer ? 'rgba(255,253,248,0.9)' : 'rgba(12,16,18,0.82)'; ctx.fillRect(x, y, w, hh);   // a light card, with dark words, on a light bench
    ctx.fillStyle = '#ffe28a'; ctx.textAlign = 'left';
    lines.forEach((t, i) => ctx.fillText(t, x + 5, y + 14 + 14 * i));
  };
  const dot = p => { ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), 3, 0, 2 * Math.PI); ctx.fill(); };
  for (const m of list) {
    ctx.strokeStyle = '#ffe28a'; ctx.fillStyle = '#ffe28a';
    const [a, b, c2] = m.pts;
    ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(b.x), sy(b.y)); if (c2) { ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(c2.x), sy(c2.y)); } ctx.stroke();
    m.pts.forEach(dot);
    if (m.type === 'ruler') {
      const L = Math.hypot(b.x - a.x, b.y - a.y), brg = Math.atan2(b.y - a.y, b.x - a.x) / deg, opl = measureOpl(a, b);
      const lines = [fmtLen(L) + ', at ' + brg.toFixed(2) + '\u00b0', 'across ' + fmtLen(Math.abs(b.x - a.x)) + ', up ' + fmtLen(Math.abs(b.y - a.y))];
      if (opl.length === 1) lines.push('optical path ' + fmtLen(opl[0]));
      else if (opl.length) lines.push('optical paths ' + opl.slice(0, 3).map(fmtLen).join(', ') + (opl.length > 3 ? '\u2026' : ''), '(beams overlap here: one per route)');
      label((sx(a.x) + sx(b.x)) / 2 + 8, (sy(a.y) + sy(b.y)) / 2 + 6, lines);
    } else if (c2) {
      const a1 = Math.atan2(b.y - a.y, b.x - a.x), a2 = Math.atan2(c2.y - a.y, c2.x - a.x);
      let dA = Math.abs(a2 - a1) / deg; if (dA > 180) dA = 360 - dA;
      const r = 22; ctx.beginPath(); ctx.arc(sx(a.x), sy(a.y), r, -a1, -a2, ((a2 - a1 + 2 * Math.PI) % (2 * Math.PI)) < Math.PI); ctx.stroke();
      label(sx(a.x) + 26, sy(a.y) + 6, [dA.toFixed(2) + '\u00b0']);
    }
  }
  ctx.restore();
}

export function removeEl(el) {
  checkpoint();
  stopSweepsFor(el);
  project.elements = project.elements.filter(e => e.id !== el.id);
  project.fibres = (project.fibres || []).filter(F => F.a[0] !== el.id && F.b[0] !== el.id);
  selectOne(null);
  changed(true);
}

export function fitView(quiet) {                // quiet === true: framed for a moment (a figure drawn), not kept
  const els = project.elements.filter(onTab);
  if (!els.length) { Object.assign(V(), { cx: 0, cy: 0, scale: 4 }); requestRender(); return; }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const e of els) {
    const B = worldBox(e);
    x0 = Math.min(x0, B.x0); x1 = Math.max(x1, B.x1);
    y0 = Math.min(y0, B.y0); y1 = Math.max(y1, B.y1);
    // the ports too, and the shaped fibres from them: a fibre tip's tail, a route drawn wide
    for (let i = 0; i < portsOf(e).length; i++) { const Q = portWorld(e, i); x0 = Math.min(x0, Q.x); x1 = Math.max(x1, Q.x); y0 = Math.min(y0, Q.y); y1 = Math.max(y1, Q.y); }
    // a horn reaches back to its waveguide
    if (e.mmw && !e.mmw.part && (e.type === 'source' || e.type === 'detector')) {
      const b = hornShape(e).back, a = e.angle * deg, X = e.x + b * Math.cos(a), Y = e.y + b * Math.sin(a);
      x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
    }
  }
  const ids = new Set(els.map(e => e.id));
  for (const F of project.fibres || []) {
    if (!ids.has(F.a[0]) || !ids.has(F.b[0])) continue;
    for (const n of F.path || []) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
  }
  // the stage less what lies over it: the parts rail at the left, the bench tabs above, the scale bar below
  const rail = document.getElementById('partsRail'), mL = rail && !rail.hidden ? 60 : 8, mR = 8, mT = 40, mB = 36;
  const pad = 1.2, vw = Math.max(80, W - mL - mR), vh = Math.max(80, H - mT - mB);
  const s = Math.min(200, Math.max(0.05, Math.min(vw / ((x1 - x0) * pad || 1), vh / ((y1 - y0) * pad || 1))));
  Object.assign(V(), { cx: (x0 + x1) / 2 - (mL - mR) / (2 * s), cy: (y0 + y1) / 2 + (mT - mB) / (2 * s), scale: s });
  if (quiet !== true) scheduleSave();
  requestRender();
}

export function updateUndoButtons() {
  document.getElementById('btnUndo').disabled = !history.length;
  document.getElementById('btnRedo').disabled = !future.length;
}

let statusTimer = null;
export function setStatus(t) {
  const el = document.getElementById('status');
  el.textContent = t;
}
let toastTimer = null;
export function toast(msg, bad) {
  const ws = document.getElementById('lensWs');
  const t = document.getElementById(ws && !ws.hidden ? 'lensToast' : document.getElementById('home').hidden ? 'toast' : 'homeToast');
  t.textContent = msg;
  t.classList.toggle('bad', !!bad);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), bad ? 5000 : 2500);
}

/* Save / open .jekray */
export function downloadFile(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function safeFileName(name) {
  return (name || 'bench').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'bench';
}
/* Save's dot: an edit since the bench was opened or saved (a cloud bench is saved as it goes) */
export let unsaved = false;
export function markUnsaved(on) {
  unsaved = !!on;
  const d = document.getElementById('saveDot');
  if (d) d.hidden = !on;
}
export function saveFile() {
  const name = safeFileName(project.name) + '.jekray';
  downloadFile(name, new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/x-jekray' }));
  toast('Saved ' + name);
  markUnsaved(false);
  goal('save');
  setTimeout(saveNudge, 1200);
}

/* The bench as it stands, as a picture */

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wireActions() {
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || typingIn(e.target) || (window.getSelection && String(window.getSelection()))) return;
    const k = e.key.toLowerCase();
    if (k !== 'c' && k !== 'x' && k !== 'v') return;
    if (k !== 'v' && !selection().length) return;
    if (e.repeat) { if (k === 'v') e.preventDefault(); return; }
    if (k === 'v') pressV = { t: performance.now(), done: false };
    clipKey = k;
    setTimeout(() => {
      if (clipKey !== k) return;
      clipKey = null;
      if (k === 'v') { if (clipMem) pasteOnce(() => pasteClip(clipMem)); return; }
      const list = selection(); if (!list.length) return;
      clipMem = clipOf(list);
      try { navigator.clipboard.writeText(JSON.stringify(clipMem)).catch(() => {}); } catch (err) { /* kept here */ }
      if (k === 'x') removeEls(list); else toast('Copied ' + list.length + ' element' + (list.length === 1 ? '' : 's'));
    }, 0);
  });

  document.addEventListener('copy', e => {
    clipKey = null;
    if (typingIn(e.target) || (window.getSelection && String(window.getSelection()))) return;
    const list = selection(); if (!list.length) return;
    clipMem = clipOf(list); e.clipboardData.setData('text/plain', JSON.stringify(clipMem)); e.preventDefault();
    toast('Copied ' + list.length + ' element' + (list.length === 1 ? '' : 's'));
  });

  document.addEventListener('cut', e => {
    clipKey = null;
    if (typingIn(e.target) || (window.getSelection && String(window.getSelection()))) return;
    const list = selection(); if (!list.length) return;
    clipMem = clipOf(list); e.clipboardData.setData('text/plain', JSON.stringify(clipMem)); e.preventDefault();
    removeEls(list);
  });

  document.addEventListener('paste', e => {
    if (typingIn(e.target) || LOCKED) return;
    clipKey = null;
    let clip = null;
    try { clip = JSON.parse(e.clipboardData.getData('text/plain')); } catch (err) { clip = null; }
    if (clip && clip.format === 'jekray-clip') { e.preventDefault(); clipMem = clip; pasteOnce(() => pasteClip(clip)); return; }
    // a whole project, as an assistant writes it: fences and all
    const text = e.clipboardData.getData('text/plain');
    if (!clip && /"elements"\s*:/.test(text)) { try { clip = parseProjectText(text); } catch (err) { toast('That looks like a project but ' + err.message.replace(/^The/, 'the'), true); e.preventDefault(); return; } }
    if (clip && Array.isArray(clip.elements) && clip.format !== 'jekray-clip') {
      e.preventDefault();
      try { openProjectData(clip, 'the pasted project'); } catch (err) { toast(err.message, true); }
    } else if (clipMem && !text) pasteOnce(() => pasteClip(clipMem));
  });

  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (LOCKED) return;
    if (performance.now() - penEnded < 800) return;          // that right-click ended a pen path
    if (performance.now() - RIGHT.panned < 250) return;      // that right button panned the bench (its menu comes just after the release)
    if (RIGHT.on && !RIGHT.moved) { RIGHT.menu = () => benchContext(e); return; }   // still held: the menu when it is let go, unless it drags
    if (RIGHT.on) return;
    benchContext(e);
  });
  function benchContext(e) {
    const rect = canvas.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top, at = [wx(px), wy(py)];
    const hit = hitTest(px, py) || (labelAt(px, py) || {}).el || null, fh = hit || partsLocked() ? null : fibreAtPx(px, py);
    if (fh) {
      setSelFibreId(fh.id); selectOne(null); renderPanel(); requestRender();
      showCtxMenu(e.clientX, e.clientY, [
        { label: 'Straighten', off: !((fh.path && fh.path.length) || fh.ta != null || fh.tb != null), fn: () => { checkpoint(); fh.path = []; fh.ta = null; fh.tb = null; changed(true); } },
        { label: 'Delete fibre', key: 'Del', fn: () => removeFibre(fh) }]);
      return;
    }
    benchMenu(e.clientX, e.clientY, hit, at);
  }

  document.addEventListener('pointerdown', e => { const m = document.getElementById('ctxMenu'); if (m && !m.hidden && !m.contains(e.target)) hideCtxMenu(); }, true);

  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideCtxMenu(); });

  // leaving the page with changes not saved to a file (or the cloud): the browser asks first. This browser keeps
  // the bench anyway (it opens again next time, and File › Earlier versions), so the question is only a reminder
  window.addEventListener('beforeunload', e => {
    if (TEST_MODE || EMBED || !unsaved || !project.elements.length || (cloud && !cloud.dirty)) return;
    e.preventDefault(); e.returnValue = '';
  });

  // the Edit menu, set as it opens (this runs before the menu's own opening, which focuses its first enabled item)
  const editMenu = document.getElementById('editMenu');
  document.getElementById('btnEdit').addEventListener('click', () => {
    for (const b of editMenu.querySelectorAll('[data-edit]')) b.disabled = !editCan(b.dataset.edit);
    for (const k of ['Undo', 'Redo']) document.getElementById('edit' + k).disabled = document.getElementById('btn' + k).disabled;
  });
  editMenu.addEventListener('click', e => { const b = e.target.closest('[data-edit]'); if (b && !b.disabled) editCommand(b.dataset.edit); });
  // Undo and Redo say what they would do: on the bar as they are pointed at, in the Edit menu as it opens
  const say = (k, words) => {
    const b = document.getElementById('btn' + k), w = words(), key = k === 'Undo' ? 'Ctrl+Z' : 'Ctrl+Shift+Z';
    b.title = (w ? k + ' ' + w : k) + ' (' + key + ')';
    const item = document.getElementById('edit' + k), t = item && [...item.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (t) t.textContent = w ? k + ' ' + w : k;
  };
  const sayBoth = () => { say('Undo', undoWords); say('Redo', redoWords); };
  for (const k of ['Undo', 'Redo']) for (const ev of ['pointerenter', 'focus']) document.getElementById('btn' + k).addEventListener(ev, sayBoth);
  document.getElementById('btnEdit').addEventListener('click', sayBoth);

  {
    const mc = document.getElementById('minimap');
    let on = false;
    const go = e => {
      if (!miniMap) return;
      const r = mc.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      V().cx = miniMap.x0 + (mx - miniMap.ox) / miniMap.k;
      V().cy = miniMap.y0 + (miniMap.mh - my - miniMap.oy) / miniMap.k;
      requestRender();
    };
    mc.addEventListener('pointerdown', e => { on = true; mc.setPointerCapture(e.pointerId); go(e); });
    mc.addEventListener('pointermove', e => { if (on) go(e); });
    const end = () => { if (on) { on = false; scheduleSave(); } };
    mc.addEventListener('pointerup', end); mc.addEventListener('pointercancel', end);
  }

  document.getElementById('measureBar').addEventListener('click', e => {
    const b = e.target.closest('[data-mtool]'); if (!b) return;
    const t = b.dataset.mtool;
    if (t === 'clear') { measureDraft = null; if ((project.measures || []).some(m => m.bench === project.tab)) { checkpoint(); project.measures = project.measures.filter(m => m.bench !== project.tab); scheduleSave(); } requestRender(); return; }
    if (t === 'done') { setMeasure(false); return; }
    measureTool = t; measureDraft = null;
    document.querySelectorAll('#measureBar [data-mtool]').forEach(x => x.classList.toggle('on', x.dataset.mtool === t));
    requestRender();
  });

  document.getElementById('btnMeasure').addEventListener('click', () => setMeasure(!measureMode));

  document.getElementById('btnZoomSel').addEventListener('click', zoomToSelection);

}
