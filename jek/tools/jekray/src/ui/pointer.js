import { EMBED, LOCKED, ZOOM_MAX, clamp } from '../core/constants.js';
import { V, deg, extraSel, project, selectOne, selectedId, uid } from '../state/project.js';
import { selected } from '../state/elements.js';
import { onTab } from '../state/tabs.js';
import { frame, toLocal } from '../core/mask.js';
import {
  H, W, canvas, fibreAtPx, fibreGrip, fibreNearest, fibreSplit, handlePos, moveGrip, portAt,
  removeFibre, requestRender, selFibre, selFibreId, selection, setSelFibreId, setSelection, sx, sy, wx,
  wy
} from './render.js';
import {
  DRAW_DRAGS, alignBox, alignShown, drawDblClick, drawDown, drawKey, drawMove, drawTool, drawUp,
  finishPen, groupEls, groupOf, labelAt, partsLocked, penDraft, scaleDrawing, scaleGrips, setPenCursor,
  setPenEnded, setXformMode, snap15, ungroupEls, xformMode
} from './drawings.js';
import { pkey } from '../engines/fibre.js';
import { PIC } from '../engines/pic.js';
import { ELEC } from '../engines/elec.js';
import { hitSurface } from './parts/hits.js';
import { PART_UI } from './parts/registry.js';
import { renderPanel, syncPanel } from './panel.js';
import {
  changed, duplicateSel, hideCtxMenu, measureDown, measureDraft, measureMode, measureMove, measureUp,
  moveEls, removeEl, removeEls, rotateEls, saveFile, setMeasure, setMeasureDraft, toast,
  zoomToSelection
} from './actions.js';
import { checkpoint, redo, undo } from './tabs.js';
import { palette } from './experimental.js';
import { setPalette } from './rail.js';
import { scheduleSave } from '../io/autosave.js';
import { fwPump, midDrag } from '../page/workers.js';
import { asmOf } from '../core/assembly.js';
import { openLensDesign } from './lens-workspace.js';

/* ==========================================================================
   Hit testing and pointer interaction
   ========================================================================== */

export function hitTest(px, py) {
  const tol = 7 / V().scale;
  const x = wx(px), y = wy(py);
  // a drawing over the light is met first, one under it last; the parts in their own order (PART_UI)
  const rank = e => e.type === 'draw' ? (e.layer === 'over' ? -1 : 9) : PART_UI[e.type] ? PART_UI[e.type].rank : 9;
  const at = new Map(project.elements.map((e, i) => [e, i]));
  // in the Draw palette only drawings are picked on the bench (a part by its name, for moving that)
  const els = project.elements.filter(e => onTab(e) && (!partsLocked() || e.type === 'draw')).sort((a, b) => rank(a) - rank(b) || (a.type === 'draw' && b.type === 'draw' ? at.get(b) - at.get(a) : 0));
  for (const el of els) {
    const f = frame(el);
    const [lx, ly] = toLocal(f, x, y);
    const U = PART_UI[el.type];
    if ((U ? U.hit : hitSurface)(el, lx, ly, tol)) return el;
  }
  return null;
}

export function inPolygon(V, x, y, tol) {
  let inside = false;
  for (let i = 0, j = V.length - 1; i < V.length; j = i++) {
    const [xi, yi] = V[i], [xj, yj] = V[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    // near an edge counts too
    const ex = xj - xi, ey = yj - yi, L2 = ex * ex + ey * ey;
    const t = clamp(((x - xi) * ex + (y - yi) * ey) / L2, 0, 1);
    if (Math.hypot(x - xi - t * ex, y - yi - t * ey) <= tol) return true;
  }
  return inside;
}

const pointers = new Map();
export let drag = null;   // {mode:'move'|'rotate'|'pan'|'pinch', ...}
export function setDrag(v) { return (drag = v); }

export function snapVal(v, e) {
  const st = project.snap;
  if (!st || (e && e.shiftKey)) return +v.toFixed(4);
  return Math.round(v / st) * st;
}

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (!drag) return;
  setTimeout(() => { if (!midDrag()) fwPump(); }, 0);    // what the drag held back
  if (drag.mode === 'pinch') { if (pointers.size === 0) { drag = null; scheduleSave(); } return; }
  if (DRAW_DRAGS.has(drag.mode)) { drawUp(e); return; }
  if (drag.mode === 'grip' || drag.mode === 'bend') {
    const moved = drag.mode === 'grip' && drag.started;
    drag = null; canvas.classList.remove('dragging');
    if (moved) changed(); else requestRender();
    return;
  }
  if (drag.mode === 'fibre') {
    const rect = canvas.getBoundingClientRect(), to = drag.cur ? portAt(e.clientX - rect.left, e.clientY - rect.top) : null;
    const d = drag, F = d.fib;
    drag = null; canvas.classList.remove('dragging');
    if (!d.cur) {                              // a click on a port: select its fibre
      if (F) { setSelFibreId(F.id); selectOne(null); renderPanel(); }
      requestRender(); return;
    }
    // ELEC hook: a wire joins an output to an input; an output may have several, an input one
    const ek = to ? ELEC.linkKind(d.from, to) : undefined;
    if (to && ek === null && pkey(...to) !== pkey(...d.from)) {
      toast(ELEC.dirOf(d.from) && ELEC.dirOf(to) ? 'A wire joins an output to an input' : 'A wire joins electrical ports only; a fibre or waveguide cannot end on one', true);
      requestRender(); return;
    }
    if (to && ek === 'wire') {
      const [a, b] = ELEC.orient(d.from, to);
      const taken = (project.fibres || []).some(G => G !== F && G.wire && pkey(...G.b) === pkey(...b));
      if (taken) { toast('That input already has a wire: an input takes one', true); requestRender(); return; }
      checkpoint();
      if (F) { F.a = a; F.b = b; }
      else { project.fibres = project.fibres || []; const G = { id: uid(), a, b, wire: true, path: [] }; project.fibres.push(G); setSelFibreId(G.id); selectOne(null); }
      changed(true);
      return;
    }
    const busy = to && (project.fibres || []).some(G => G !== F && (pkey(...G.a) === pkey(...to) || pkey(...G.b) === pkey(...to)));
    const lk = to ? PIC.linkKind(d.from, to) : null;             // PIC hook: a waveguide between chip ports, a fibre off the chip
    if (to && !busy && pkey(...to) !== pkey(...d.from) && (!lk || (F && !!F.wg !== (lk === 'wg')))) {
      toast(lk ? (F && F.wg ? 'A waveguide joins two ports on a chip' : 'A fibre cannot end on a chip port: join it to a grating coupler\u2019s fibre side') : 'A fibre cannot end on a chip port: join it to a grating coupler\u2019s fibre side', true);
      requestRender(); return;
    }
    if (to && !busy && pkey(...to) !== pkey(...d.from)) {
      checkpoint();
      if (F) { if (pkey(...F.a) === pkey(...d.from)) F.b = to; else F.a = to; }
      else { project.fibres = project.fibres || []; const G = { id: uid(), a: d.from, b: to, len: 1, loss: 0.2 }; if (lk === 'wg') G.wg = PIC.normWg({}); project.fibres.push(G); setSelFibreId(G.id); selectOne(null); }
      changed(true);
    } else if (F && !to) removeFibre(F);        // pulled off its port: the fibre goes
    else requestRender();
    return;
  }
  if (drag.mode === 'box') {
    const d = drag;
    drag = null; canvas.classList.remove('dragging');
    if (!d.cur) { if (selectedId || selFibreId || extraSel.size) { selectOne(null); setSelFibreId(null); renderPanel(); } requestRender(); return; }
    const X0 = wx(Math.min(d.px0, d.cur[0])), X1 = wx(Math.max(d.px0, d.cur[0])), Y0 = wy(Math.max(d.py0, d.cur[1])), Y1 = wy(Math.min(d.py0, d.cur[1]));
    const inside = [...new Set(project.elements.filter(el => onTab(el) && (!partsLocked() || el.type === 'draw') && el.x >= X0 && el.x <= X1 && el.y >= Y0 && el.y <= Y1).flatMap(groupOf))].filter(el => !partsLocked() || el.type === 'draw');
    const cur = d.add ? selection() : [];
    setSelection([...cur, ...inside.filter(el => !cur.includes(el))]);
    return;
  }
  if (drag.mode === 'measure') { measureUp(); return; }
  if (drag.mode === 'pan' && !drag.moved && (selectedId || selFibreId)) { selectOne(null); setSelFibreId(null); renderPanel(); }
  if (drag.mode === 'move' && !drag.started && drag.wasSel && drag.el.type === 'draw' && drawTool === 'select') setXformMode(xformMode === 'scale' ? 'rotate' : 'scale');
  if ((drag.mode === 'move' || drag.mode === 'rotate') && drag.started) changed();
  else scheduleSave();
  drag = null;
  canvas.classList.remove('dragging');
  requestRender();
}
/* on the selected fibre: double-click a node to take it out, the curve to put one in */

/* Keyboard */
let spaceDown = false;

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wirePointer() {
  canvas.addEventListener('pointerdown', e => {
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    pointers.set(e.pointerId, { px, py });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      drag = { mode: 'pinch', d0: Math.hypot(a.px - b.px, a.py - b.py), s0: V().scale,
        cxw: wx((a.px + b.px) / 2), cyw: wy((a.py + b.py) / 2) };
      return;
    }
    hideCtxMenu();
    if (e.button === 2 && penDraft) { finishPen(); setPenEnded(performance.now()); return; }   // the pen's right-click ends its path
    if (e.button === 2) return;                          // the right button opens the menu instead
    // the middle button, Space held, or a finger on empty bench: pan
    const panNow = e.button === 1 || spaceDown || LOCKED;            // a locked embed: every press pans
    if (panNow) { e.preventDefault(); drag = { mode: 'pan', px0: px, py0: py, cx0: V().cx, cy0: V().cy, moved: true }; canvas.classList.add('dragging'); return; }
    if (measureMode) { measureDown(px, py, e); return; }
    if (!EMBED && e.button === 0 && drawDown(px, py, e)) return;
    const sel = selected();
    if (sel && !extraSel.size && onTab(sel) && sel.type !== 'draw' && !partsLocked()) {
      const [hx, hy] = handlePos(sel);
      if (Math.hypot(px - hx, py - hy) < 11 && !sel.locked) {
        drag = { mode: 'rotate', el: sel, started: false };
        return;
      }
    }
    // the selected fibre's nodes and handles
    const SF = partsLocked() ? null : selFibre();
    if (SF) {
      const g = fibreGrip(SF, px, py);
      if (g) { drag = { mode: 'grip', F: SF, g, started: false, px0: px, py0: py }; return; }
    }
    // a port: draw a fibre from it, or take up the end of the one already there
    const port = partsLocked() ? null : portAt(px, py);
    if (port) {
      // ELEC hook: an electrical output feeds any number of wires, so a drag from it always draws a new one
      const F = ELEC.dirOf(port) === 'out' || ELEC.dirOf(port) === 'io' ? null : (project.fibres || []).find(G => pkey(...G.a) === pkey(...port) || pkey(...G.b) === pkey(...port));
      drag = { mode: 'fibre', from: F ? (pkey(...F.a) === pkey(...port) ? F.b : F.a) : port, fib: F || null, grabbed: port, px0: px, py0: py, cur: null };
      return;
    }
    const hit = hitTest(px, py);
    const fh = hit || partsLocked() ? null : fibreAtPx(px, py);
    if (fh) {
      // the selected fibre's curve: pulled, it gives up a node there to drag
      if (fh === SF) { drag = { mode: 'bend', F: SF, px0: px, py0: py, started: false }; return; }
      setSelFibreId(fh.id); selectOne(null); renderPanel(); requestRender();
      drag = { mode: 'pan', px0: px, py0: py, cx0: V().cx, cy0: V().cy, moved: true };
      return;
    }
    if (hit) {
      setSelFibreId(null);
      const mates = groupOf(hit).filter(m => !partsLocked() || m.type === 'draw');     // a group is picked whole (in Draw, its drawings)
      // Shift or Ctrl: in or out of the selection; Ctrl on a group that is the selection: just that one of it
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const cur = selection();
        if (!e.shiftKey && mates.length > 1 && cur.length === mates.length && mates.every(m => cur.includes(m))) { setSelection([hit]); return; }
        setSelection(cur.some(x => x.id === hit.id) ? cur.filter(x => !mates.includes(x)) : [...cur, ...mates.filter(m => !cur.includes(m))]);
        return;
      }
      const wasSel = hit.id === selectedId && !extraSel.size;
      if (!(hit.id === selectedId || extraSel.has(hit.id))) { if (mates.length > 1) setSelection([hit, ...mates.filter(m => m !== hit)]); else { selectOne(hit.id); renderPanel(); } }
      // the whole selection moves with it; fibres between its members bring their shapes along
      const group = selection().filter(x => !x.locked), ids = new Set(group.map(x => x.id));
      const fibres = (project.fibres || []).filter(F => ids.has(F.a[0]) && ids.has(F.b[0]));
      drag = { mode: 'move', wasSel, el: hit, group, ids, starts: group.map(x => [x.x, x.y]), nodes: fibres.flatMap(F => (F.path || []).map(n => [n, n.x, n.y])),
        ox: wx(px) - hit.x, oy: wy(py) - hit.y, px0: px, py0: py, started: false, x0: hit.x, y0: hit.y };
    } else if (e.pointerType === 'touch') {
      drag = { mode: 'pan', px0: px, py0: py, cx0: V().cx, cy0: V().cy, moved: false };
    } else {
      // empty bench: a box to select with
      drag = { mode: 'box', px0: px, py0: py, cur: null, add: e.shiftKey || e.ctrlKey || e.metaKey };
    }
    canvas.classList.add('dragging');
    requestRender();
  });

  canvas.addEventListener('pointermove', e => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    document.getElementById('coords').textContent =
      (d => 'x ' + wx(px).toFixed(d) + '  y ' + wy(py).toFixed(d) + ' mm')(clamp(Math.ceil(Math.log10(V().scale)) + 1, 2, 7));
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { px, py });

    if (!drag && measureMode && measureDraft && measureDraft.type === 'angle') { measureMove(px, py, e); return; }
    if (!drag && penDraft) {
      setPenCursor([px, py]);
      const N = penDraft.nodes, last = N[N.length - 1];
      if (last && (e.ctrlKey || e.metaKey)) { const [X, Y] = snap15(last.x, last.y, wx(px), wy(py)); setPenCursor([sx(X), sy(Y)]); }
      requestRender(); return;
    }
    if (drag && DRAW_DRAGS.has(drag.mode)) { drawMove(px, py, e); return; }
    if (!drag) {
      const sel = selected();
      let cls = '';
      if (sel && !extraSel.size && !sel.locked && sel.type !== 'draw' && !partsLocked()) { const [hx, hy] = handlePos(sel); if (Math.hypot(px - hx, py - hy) < 11) cls = 'rotate'; }
      const sd = scaleDrawing();
      if (!cls && (hitTest(px, py) || labelAt(px, py) || (sd && scaleGrips(sd).some(q => Math.hypot(px - q.at[0], py - q.at[1]) <= 7)) || (!partsLocked() && (portAt(px, py) || (selFibre() && (fibreGrip(selFibre(), px, py) || fibreAtPx(px, py) === selFibre())))))) cls = 'over';
      canvas.classList.toggle('rotate', cls === 'rotate');
      canvas.classList.toggle('over', cls === 'over');
      return;
    }
    if (drag.mode === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.px - b.px, a.py - b.py);
      const s = Math.min(ZOOM_MAX, Math.max(0.05, drag.s0 * d / drag.d0));
      const mx = (a.px + b.px) / 2, my = (a.py + b.py) / 2;
      V().scale = s;
      V().cx = drag.cxw - (mx - W / 2) / s;
      V().cy = drag.cyw + (my - H / 2) / s;
      requestRender();
      return;
    }
    if (drag.mode === 'bend') {
      if (Math.hypot(px - drag.px0, py - drag.py0) < 3) return;
      const q = fibreNearest(drag.F, drag.px0, drag.py0);
      checkpoint();
      const i = fibreSplit(drag.F, q.k, clamp(q.t, 0.02, 0.98));
      drag = { mode: 'grip', F: drag.F, g: { type: 'node', i }, started: true, px0: px, py0: py };
    }
    if (drag.mode === 'grip') {
      if (!drag.started) { if (Math.hypot(px - drag.px0, py - drag.py0) < 2) return; checkpoint(); drag.started = true; }
      moveGrip(drag.F, drag.g, wx(px), wy(py), e.shiftKey);
      requestRender();
      return;
    }
    if (drag.mode === 'fibre') {
      if (!drag.cur && Math.hypot(px - drag.px0, py - drag.py0) < 3) return;
      drag.cur = [px, py];
      requestRender();
      return;
    }
    if (drag.mode === 'pan') {
      if (Math.hypot(px - drag.px0, py - drag.py0) > 3) drag.moved = true;
      V().cx = drag.cx0 - (px - drag.px0) / V().scale;
      V().cy = drag.cy0 + (py - drag.py0) / V().scale;
      requestRender();
      return;
    }
    if (drag.mode === 'box') {
      if (!drag.cur && Math.hypot(px - drag.px0, py - drag.py0) < 3) return;
      drag.cur = [px, py]; requestRender();
      return;
    }
    if (drag.mode === 'measure') { measureMove(px, py, e); return; }
    if (drag.mode === 'move') {
      if (drag.el.locked || !drag.group.length) return;
      if (!drag.started) {
        if (Math.hypot(px - drag.px0, py - drag.py0) < 3) return;
        checkpoint(); drag.started = true;
      }
      // the grabbed element snaps; the rest keep their places against it
      const nx = snapVal(wx(px) - drag.ox, e), ny = snapVal(wy(py) - drag.oy, e), dx = nx - drag.x0, dy = ny - drag.y0;
      drag.group.forEach((g, i) => { g.x = drag.starts[i][0] + dx; g.y = drag.starts[i][1] + dy; });
      for (const [n, x0, y0] of drag.nodes) { n.x = x0 + dx; n.y = y0 + dy; }
      syncPanel(); requestRender();
      return;
    }
    if (drag.mode === 'rotate') {
      if (!drag.started) { checkpoint(); drag.started = true; }
      let a = Math.atan2(-(py - sy(drag.el.y)), px - sx(drag.el.x)) / deg;
      a = e.shiftKey ? Math.round(a / 15) * 15 : Math.round(a * 10) / 10;
      drag.el.angle = a;
      syncPanel(); requestRender();
    }
  });

  canvas.addEventListener('pointerup', endPointer);

  canvas.addEventListener('dblclick', e => {
    if (LOCKED) return;
    if (drawTool === 'node') { const r = canvas.getBoundingClientRect(); if (drawDblClick(e.clientX - r.left, e.clientY - r.top)) return; }
    const F = selFibre();
    if (!F) {
      // an assembly: into its design workspace
      const r0 = canvas.getBoundingClientRect(), hit = hitTest(e.clientX - r0.left, e.clientY - r0.top), A = hit && asmOf(hit);
      if (A && !e.ctrlKey && !e.metaKey) openLensDesign(A);
      return;
    }
    const rect = canvas.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
    const g = fibreGrip(F, px, py);
    if (g && g.type === 'node') { checkpoint(); F.path.splice(g.i, 1); changed(); return; }
    const q = fibreNearest(F, px, py);
    if (q && q.d < 6) { checkpoint(); fibreSplit(F, q.k, clamp(q.t, 0.02, 0.98)); changed(); }
  });

  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('pointerleave', () => { document.getElementById('coords').textContent = ''; });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const bx = wx(px), by = wy(py);
    const s = Math.min(ZOOM_MAX, Math.max(0.05, V().scale * Math.exp(-e.deltaY * 0.0015)));
    V().scale = s;
    V().cx = bx - (px - W / 2) / s;
    V().cy = by + (py - H / 2) / s;
    scheduleSave();
    requestRender();
  }, { passive: false });

  document.addEventListener('keyup', e => { if (e.key === ' ' && spaceDown) { spaceDown = false; canvas.classList.remove('dragging'); } });

  window.addEventListener('blur', () => { spaceDown = false; });

  document.addEventListener('keydown', e => {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(); return; }
    if (typing) return;
    if (LOCKED && e.key !== ' ') return;                                  // a locked embed: Space pans, nothing else
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelection(project.elements.filter(x => onTab(x) && (!partsLocked() || x.type === 'draw'))); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'a') { e.preventDefault(); if (palette !== 'draw') setPalette('draw'); alignShown(!alignBox || alignBox.hidden); return; }
    if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); if (e.shiftKey) ungroupEls(selection()); else groupEls(selection()); return; }
    if (!mod && !e.altKey && !EMBED && drawKey(e)) return;
    if (!mod && e.key === ' ') { e.preventDefault(); if (!spaceDown) { spaceDown = true; canvas.classList.add('dragging'); } return; }
    if (!mod && (e.key === 'z' || e.key === 'Z')) { zoomToSelection(); return; }
    if (!mod && (e.key === 'm' || e.key === 'M')) { setMeasure(!measureMode); return; }
    // R turns the selection 90 degrees anticlockwise, Shift+R clockwise
    if (!mod && !e.altKey && (e.key === 'r' || e.key === 'R')) {
      const list = selection();
      if (!list.length) return;
      e.preventDefault();
      if (list.every(x => x.locked)) { toast((list.length === 1 ? list[0].name + ' is' : 'They are') + ' locked in place'); return; }
      rotateEls(list, e.shiftKey ? -90 : 90);
      return;
    }
    if (e.key === 'Escape' && measureMode) { if (measureDraft) { setMeasureDraft(null); requestRender(); } else setMeasure(false); return; }
    if (measureMode && (e.key === 'Delete' || e.key === 'Backspace')) {
      // the last one on this tab
      e.preventDefault();
      const M = project.measures || [], i = M.map(m => m.bench).lastIndexOf(project.tab);
      if (i >= 0) { checkpoint(); M.splice(i, 1); scheduleSave(); requestRender(); }
      return;
    }
    const group = selection();
    if (group.length > 1) {
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeEls(group); return; }
      if (e.key === 'Escape') { selectOne(null); renderPanel(); requestRender(); return; }
      const step = e.shiftKey ? 10 : (project.snap || 0.1);
      const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (mv) { e.preventDefault(); checkpoint(); moveEls(group, mv[0] * step, mv[1] * step); changed(false); }
      return;
    }
    const el = selected();
    if (!el) {
      const F = selFibre();
      if (F && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); removeFibre(F); }
      if (F && e.key === 'Escape') { setSelFibreId(null); renderPanel(); requestRender(); }
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeEl(el); return; }
    if (e.key === 'Escape') { selectOne(null); renderPanel(); requestRender(); return; }
    const step = e.shiftKey ? 10 : (project.snap || 0.1);
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (mv && el.locked) { e.preventDefault(); toast(el.name + ' is locked in place'); return; }
    if (mv) {
      e.preventDefault();
      checkpoint();
      el.x = +(el.x + mv[0] * step).toFixed(4);
      el.y = +(el.y + mv[1] * step).toFixed(4);
      changed();
    }
  });

}
