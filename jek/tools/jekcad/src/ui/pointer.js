import { app, emit, redo, toast, undo } from './app.js';
import { V, fit, normalTo, orbit, pan, pickAt, pickBox, viewFrom, zoomAt } from './view3d.js';
import { drwDown, drwKey, drwMove, drwUp, drwWheel } from './drawing.js';
import { AS, asmDragEnd, asmDragMove, asmDragStart, deleteInstance, matePick, triadAt } from './assembly.js';
import { modelDimAt, modelDimEdit, modelDimHover, overlayPick, setBoxSel, sketchDbl, sketchDown, sketchKey, sketchMove, sketchRight, sketchUp } from './sketcher.js';
import { closeDialog, editFeature, fieldPick, fieldWants, okDialog, openFeature } from './dialog.js';
import { kernelAsk } from '../page/kernel.js';
import { deletePart } from './panel.js';

/* ==========================================================================
   The pointer and the keys on the view. Right-drag orbits (in a sketch too: N looks straight at it again), middle-drag (or Shift with the right button) pans, the
   wheel zooms about the pointer. A left click picks: into the feature dialog's active field when one is open,
   else into the selection: each click adds what it picks or, if it is chosen already, takes it out, and a click on nothing empties it; a left drag from nothing selects by a box. In a sketch the
   left button belongs to the sketcher, and a right-click (no drag) ends what is being drawn. What a click would
   pick is lit as the pointer moves over it. A double-click on a plane starts a sketch on it; on a sketch's dimension shown on the model types it
   again; on a face, it opens the feature that made the face.
   ========================================================================== */
const MODEL_KINDS = { edges: 'any', faces: 'face', face: 'face', edge: 'edge', parts: 'part', plane: 'face' };
/* what is under the pointer, for what is wanted now */
export function pickHere(sx, sy) {
  const want = fieldWants();
  // (an extrude takes a sketch's region or, where there is none under the pointer, a face of the model)
  if (want === 'regions' && app.editing && app.editing.f.type === 'extrude') return overlayPick(sx, sy, 'regions') || pickAt(sx, sy, 'face');
  if (want === 'regions' || want === 'sections') return overlayPick(sx, sy, 'regions');
  if (want === 'sketchLine') return overlayPick(sx, sy, 'sketchLine');
  if (want === 'sketch') return overlayPick(sx, sy, 'sketch') || overlayPick(sx, sy, 'regions');
  if (want === 'features') return null;
  if (want === 'plane') return pickAt(sx, sy, 'face') || overlayPick(sx, sy, 'plane');
  if (want === 'edges') return pickAt(sx, sy, 'edge') || pickAt(sx, sy, 'face');
  if (want) return pickAt(sx, sy, MODEL_KINDS[want] || 'any');
  const f = app.filter;
  if (f === 'plane') return overlayPick(sx, sy, 'plane');
  if (f === 'region') return overlayPick(sx, sy, 'regions');
  // anything: a model vertex or edge first, then a sketch's region, then a face, then a plane
  const m = pickAt(sx, sy, f);
  if (m && m.kind !== 'face' && m.kind !== 'part') return m;
  if (f === 'any') { const r = overlayPick(sx, sy, 'regions'); if (r) return r; }
  if (m) return m;
  return f === 'any' ? overlayPick(sx, sy, 'any') : null;
}
const sameSel = (a, b) => a && b && a.kind === b.kind && a.part === b.part && a.index === b.index && a.std === b.std && a.feature === b.feature && a.sketch === b.sketch && JSON.stringify(a.pt) === JSON.stringify(b.pt);
export function selectPick(p, add) {
  if (!p) { if (!add) app.sel = []; emit('sel'); return; }
  const i = app.sel.findIndex(s => sameSel(s, p));
  // a click adds what it picks to the selection, or takes it out if it is in it; a click on nothing empties it
  void add;
  if (i >= 0) app.sel.splice(i, 1); else app.sel.push(p);
  emit('sel');
}
export function wirePointer() {
  const stage = document.getElementById('stage'), over = document.getElementById('over');
  let drag = null, hoverRaf = 0, lastXY = null;
  const xy = e => { const r = over.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  over.addEventListener('contextmenu', e => e.preventDefault());
  over.addEventListener('pointerdown', e => {
    const [sx, sy] = xy(e);
    over.setPointerCapture(e.pointerId);
    if (app.drw) { drwDown(e, sx, sy); drag = { mode: 'drw' }; return; }
    if (e.button === 2 || e.button === 1) { drag = { mode: e.button === 1 || e.shiftKey ? 'pan' : 'orbit', x: sx, y: sy, moved: false, travel: 0, button: e.button }; return; }
    if (app.sketch && sketchDown(e, sx, sy)) { drag = { mode: 'sketch' }; return; }
    // in an assembly a part is dragged about by its own faces (Ctrl: turned about the line of sight)
    if (app.asm && !AS.mate && !e.shiftKey) { const p0 = pickAt(sx, sy, 'face'); if ((p0 || triadAt(sx, sy)) && asmDragStart(p0, sx, sy, e.ctrlKey || e.metaKey)) { drag = { mode: 'asm', x: sx, y: sy, add: false }; return; } }
    drag = { mode: 'pick', x: sx, y: sy, moved: false, add: e.ctrlKey || e.shiftKey || e.metaKey };
  });
  over.addEventListener('pointermove', e => {
    const [sx, sy] = xy(e);
    lastXY = [sx, sy];
    if (app.drw) { drwMove(e, sx, sy); return; }
    if (drag && (drag.mode === 'orbit' || drag.mode === 'pan')) {
      const dx = sx - drag.x, dy = sy - drag.y; drag.x = sx; drag.y = sy; drag.moved = true; drag.travel += Math.abs(dx) + Math.abs(dy);
      if (drag.travel < 4) return;
      if (drag.mode === 'orbit') orbit(dx, dy); else pan(dx, dy);
      return;
    }
    if (drag && drag.mode === 'sketch') { sketchMove(e, sx, sy); return; }
    if (drag && drag.mode === 'asm') { asmDragMove(sx, sy); return; }
    if (drag && drag.mode === 'pick') {
      if (!drag.moved && Math.hypot(sx - drag.x, sy - drag.y) > 4 && !fieldWants()) drag.moved = true;
      if (drag.moved) setBoxSel({ x0: drag.x, y0: drag.y, x1: sx, y1: sy });
      return;
    }
    if (app.sketch) { sketchMove(e, sx, sy); return; }
    if (!hoverRaf) hoverRaf = requestAnimationFrame(() => { hoverRaf = 0; if (!lastXY) return; const md = app.editing ? null : modelDimAt(...lastXY); modelDimHover(md); over.style.cursor = md ? 'text' : ''; const p = md ? null : pickHere(...lastXY); if (JSON.stringify(p) !== JSON.stringify(app.hover)) { app.hover = p; emit('hover'); emit('sel'); } });
  });
  over.addEventListener('pointerup', async e => {
    const [sx, sy] = xy(e), d = drag;
    drag = null;
    if (app.drw) { await drwUp(e, sx, sy); return; }
    if (!d) return;
    if (d.mode === 'sketch') { sketchUp(e, sx, sy); return; }
    // the right button let go where it went down: in a sketch, what is being drawn ends
    if (d.mode !== 'pick' && d.mode !== 'asm') { if (d.button === 2 && d.travel < 4 && app.sketch) sketchRight(); return; }
    if (d.moved) {
      setBoxSel(null);
      const got = pickBox(d.x, d.y, sx, sy, app.filter === 'any' ? 'edge' : app.filter);
      if (!d.add) app.sel = [];
      for (const p of got) if (!app.sel.some(s => sameSel(s, p))) app.sel.push(p);
      emit('sel'); return;
    }
    // an assembly: a drag that moved a part is done; a click picks (a face into a mate being made)
    if (d.mode === 'asm') { if (asmDragEnd()) return; }
    let p = pickHere(sx, sy);
    if (app.asm && AS.mate) { matePick(p); return; }
    if (fieldWants()) { if (p) await fieldPick(p); return; }
    // a plane lies behind most of the view: with other things chosen, a click that lands only on a plane is a click on
    // nothing, and empties the selection (a plane joins a selection from its row in the list)
    if (p && p.kind === 'plane' && app.sel.some(x => x.kind !== 'plane')) p = null;
    // (a click on nothing also lets go of the feature picked in the list, unless it is on one of its dimensions)
    if (!p && !d.add && app.picked && !modelDimAt(sx, sy)) { app.picked = null; emit('picked'); }
    selectPick(p, d.add);
  });
  over.addEventListener('pointerleave', () => { if (app.hover) { app.hover = null; emit('hover'); emit('sel'); } });
  over.addEventListener('wheel', e => { e.preventDefault(); const [sx, sy] = xy(e); if (app.drw) { drwWheel(sx, sy, Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * (e.deltaMode ? 0.05 : 0.0015))))); return; } zoomAt(sx, sy, Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * (e.deltaMode ? 0.05 : 0.0015))))); }, { passive: false });
  over.addEventListener('dblclick', async e => {
    const [sx, sy] = xy(e);
    if (app.drw) return;
    if (app.sketch) { sketchDbl(sx, sy); return; }
    if (app.editing) return;
    if (app.asm) { fit(); return; }
    const md = modelDimAt(sx, sy);
    if (md) { app.sel = []; emit('sel'); modelDimEdit(md); return; }
    // a sketch (a shape of it, or one of its regions): opened to edit
    const se = overlayPick(sx, sy, 'sketch') || (!pickAt(sx, sy, 'face') ? overlayPick(sx, sy, 'regions') : null);
    if (se && se.sketch) { const i = app.doc.features.findIndex(f => f.id === se.sketch); if (i >= 0) { app.sel = []; emit('sel'); editFeature(i); return; } }
    // a plane (by its border, or anywhere in it once it is the one selected): a sketch started on it
    const sel0 = app.sel.length === 1 && app.sel[0].kind === 'plane' ? app.sel[0] : null, pl = overlayPick(sx, sy, 'any'), inPl = sel0 && overlayPick(sx, sy, 'plane');
    const plane = pl && pl.kind === 'plane' ? pl : inPl && inPl.kind === 'plane' && (inPl.std ? inPl.std === sel0.std : inPl.feature === sel0.feature) && !pickAt(sx, sy, 'face') ? inPl : null;
    if (plane) { app.sel = []; emit('sel'); openFeature('sketch', { plane: plane.std ? { std: plane.std } : { feature: plane.feature } }); return; }
    const p = pickAt(sx, sy, 'face');
    if (!p) { fit(); return; }
    // the feature that made the face (its names begin with the feature's id), opened to edit
    try {
      const [r] = await kernelAsk('refs', { picks: [p] });
      const ids = (r && r.names || []).map(nm => String(nm).split('~').pop().split('.')[0].replace(/'+$/, ''));
      const i = app.doc.features.findIndex(f => ids.includes(f.id));
      if (i >= 0 && !app.sketch && !app.editing) { app.sel = []; emit('sel'); toast('Editing ' + app.doc.features[i].name + ' (it made this face)'); editFeature(i); }
    } catch (err) { /* nothing to open */ }
  });
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (document.querySelector('dialog[open]')) return;
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (app.sketch && sketchKey(e)) { e.preventDefault(); return; }
    if (ctrl && k === 'z') { e.preventDefault(); if (app.editing) return; if (e.shiftKey) redo(); else undo(); return; }
    if (ctrl && k === 'y') { e.preventDefault(); if (!app.editing) redo(); return; }
    if (ctrl) return;
    // (a drawing open: its own keys, and none of the Part Studio's)
    if (app.drw) { if (drwKey(k)) e.preventDefault(); return; }
    if (k === 'escape') { if (app.editing) closeDialog(); else if (app.sel.length || app.picked) { app.sel = []; app.picked = null; emit('sel'); emit('picked'); } return; }
    if (k === 'enter' && app.editing && !app.editing.sketchPlane) { okDialog(); return; }
    // Delete, with whole parts selected (the Parts filter, or their rows): they are deleted
    if ((k === 'delete' || k === 'backspace') && app.asm) { for (const id of new Set(app.sel.map(s => s.part).filter(Boolean))) deleteInstance(id); return; }
    if ((k === 'delete' || k === 'backspace') && !app.editing && app.sel.length && app.sel.every(s => s.kind === 'part')) { for (const s of app.sel.slice()) deletePart(s.part); return; }
    if (k === 'f') { fit(); return; }
    if (k === 'n') { normalToSel(); return; }
    const views = { 1: 'front', 2: 'back', 3: 'left', 4: 'right', 5: 'top', 6: 'bottom', 7: 'iso' };
    if (views[k]) viewFrom(views[k]);
  });
  void stage; void V;
}
/* look straight at the plane or flat face chosen (or the sketch being edited) */
export async function normalToSel() {
  if (app.sketch && app.sketch.F) { normalTo(app.sketch.F); return; }
  const s = app.sel[0];
  if (!s) return;
  if (s.kind === 'plane') { const F = s.std ? { top: { x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] }, front: { x: [1, 0, 0], y: [0, 0, 1], n: [0, -1, 0] }, right: { x: [0, 1, 0], y: [0, 0, 1], n: [1, 0, 0] } }[s.std] : app.result.frames[s.feature]; if (F) normalTo(F); return; }
  if (s.kind === 'region') { const F = app.result.frames[s.sketch]; if (F) normalTo(F); return; }
  if (s.kind === 'face') {
    try { const [r] = await kernelAsk('refs', { picks: [s] }); if (r.type !== 'plane') return; const m = await kernelAsk('measure', { picks: [s], doc: app.doc }); const n = m.items[0].normal; if (!n) return; const up = Math.abs(n[2]) < 0.99 ? [0, 0, 1] : [0, 1, 0], x = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]], L = Math.hypot(...x); normalTo({ x: x.map(v => v / L), y: [n[1] * x[2] / L - n[2] * x[1] / L, n[2] * x[0] / L - n[0] * x[2] / L, n[0] * x[1] / L - n[1] * x[0] / L], n }); } catch (err) { /* not flat */ }
  }
}
