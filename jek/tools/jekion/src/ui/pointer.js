import { EMBED, ZOOM_MAX } from '../../../jekray/src/core/constants.js';
import { nf } from '../core/units.js';
import { PLANES, shapeInside, shapeSections } from '../core/geom.js';
import { project, selectedId, setSelectedId, V } from '../state/project.js';
import { checkpoint } from '../state/elements.js';
import { canvas, H, W, pointOf, requestRender, uvOf, wx, wy } from './render.js';
import { renderPanel, syncPanel } from './panel.js';
import { benchMenu, changed, hideCtxMenu, snapTo } from './actions.js';
import { SIM } from './sim.js';
import { openDropped, scheduleSave } from '../io/open.js';

/* ==========================================================================
   The pointer on the bench: a click selects what is under it, a drag moves it in the cut plane, the wheel zooms,
   the right or middle button (or Space) pans, files are dropped, and the coordinates (and the potential there)
   are shown as the pointer moves.
   ========================================================================== */
export let drag = null;
let spaceDown = false;
/* a tool that takes points clicked on the bench: { n, pts, done(pts) }; set by a panel, cleared when done or on Escape */
export let pointTool = null;
export function setPointTool(v) { pointTool = v; canvas.classList.toggle('picking', !!v); return v; }
/* what is at a bench point (in the plane): an electrode (its section), an ion group's start or a detector's line */
export function hitTest(px, py) {
  const u = wx(px), v = wy(py), tol = 7 / V().scale, p = pointOf(u, v), G = project.grid, [iu, iv, ip] = PLANES[V().plane];
  for (const g of project.ions) { if (g.on === false) continue; const [a, b] = uvOf([g.x, g.y, g.z]); if (Math.hypot(a - u, b - v) < tol * 1.3) return g; }
  for (const d of project.detectors) {
    if (d.on === false) continue;
    const ax = d.axis === 'x' ? 0 : d.axis === 'y' ? 1 : 2, c = uvOf([d.x, d.y, d.z]), hw = d.half > 0 ? d.half : 1e4;
    if (ax === ip) { if (Math.abs(Math.abs(u - c[0]) - hw) < tol && Math.abs(v - c[1]) <= hw + tol) return d; if (Math.abs(Math.abs(v - c[1]) - hw) < tol && Math.abs(u - c[0]) <= hw + tol) return d; continue; }
    if (ax === iu ? Math.abs(u - d.at) < tol && Math.abs(v - c[1]) <= hw : Math.abs(v - d.at) < tol && Math.abs(u - c[0]) <= hw) return d;
  }
  const q = G.sym === 'cyl' ? [p[0], Math.abs(p[1]), 0] : G.sym === 'planar' ? [p[0], p[1], 0] : p;
  for (let k = project.electrodes.length - 1; k >= 0; k--) {
    const el = project.electrodes[k];
    if (el.on === false) continue;
    if (el.shape === 'mesh') {
      // a CAD body: by its voxels on the cut
      const S = SIM.slice;
      if (S && S.plane === V().plane) {
        const a = Math.round((u - S.u0) / S.h), b = Math.round(((G.sym === 'cyl' ? Math.abs(v) : v) - S.v0) / S.h);
        if (a >= 0 && a < S.nu && b >= 0 && b < S.nv && S.mask[a + S.nu * b] === project.electrodes.filter(e => e.on !== false).indexOf(el)) return el;
      }
      continue;
    }
    if (shapeInside(el, q[0], q[1], q[2])) return el;
    // a thin plate seen edge on: within a few pixels of its section
    const polys = shapeSections(el, V().plane, G.sym === 'cyl' ? 0 : V().slice);
    if (polys) for (const P of polys) if (nearPolygon(P, u, G.sym === 'cyl' ? Math.abs(v) : v, tol)) return el;
  }
  return null;
}
function nearPolygon(P, u, v, tol) {
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-30, t = Math.max(0, Math.min(1, ((u - a[0]) * dx + (v - a[1]) * dy) / L2));
    if (Math.hypot(u - a[0] - t * dx, v - a[1] - t * dy) < tol) return true;
  }
  return false;
}
function endPointer(e) {
  if (!drag) return;
  if (drag.mode === 'move' && drag.started) { changed(true); }
  else if (drag.mode === 'pan') scheduleSave();
  drag = null;
  canvas.classList.remove('dragging', 'over');
  try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* fine */ }
  requestRender();
}
export function wirePointer() {
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    hideCtxMenu();
    canvas.focus({ preventScroll: true });
    const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer */ }
    if (e.button === 1 || e.button === 2 || spaceDown || (e.pointerType === 'touch' && false)) { drag = { mode: 'pan', x0: px, y0: py, cx: V().cx, cy: V().cy, button: e.button, moved: 0 }; canvas.classList.add('dragging'); return; }
    if (e.button !== 0) return;
    if (pointTool) { pointTool.pts.push(pointOf(snapTo(wx(px), e), snapTo(wy(py), e))); if (pointTool.pts.length >= pointTool.n) { const T = pointTool; setPointTool(null); T.done(T.pts); } else requestRender(); drag = { mode: 'none' }; return; }
    const hit = hitTest(px, py);
    if (hit) {
      if (hit.id !== selectedId) { setSelectedId(hit.id); renderPanel(); requestRender(); }
      if (EMBED || hit.locked) { drag = { mode: 'none' }; return; }
      const [iu, iv] = PLANES[V().plane], keys = ['x', 'y', 'z'];
      drag = { mode: 'move', el: hit, x0: wx(px), y0: wy(py), u0: hit[keys[iu]], v0: hit[keys[iv]], ku: keys[iu], kv: keys[iv], started: false };
      canvas.classList.add('over');
    } else {
      if (selectedId) { setSelectedId(null); renderPanel(); requestRender(); }
      drag = { mode: 'pan', x0: px, y0: py, cx: V().cx, cy: V().cy, button: 0, moved: 0 };
    }
  });
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    coordsShow(px, py);
    if (!drag) { const hit = hitTest(px, py); canvas.classList.toggle('over', !!hit && !hit.locked); return; }
    if (drag.mode === 'pan') {
      drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      V().cx = drag.cx - (px - drag.x0) / V().scale; V().cy = drag.cy + (py - drag.y0) / V().scale;
      requestRender();
      return;
    }
    if (drag.mode !== 'move') return;
    const du = wx(px) - drag.x0, dv = wy(py) - drag.y0;
    if (!drag.started) { if (Math.hypot(du, dv) * V().scale < 3) return; drag.started = true; checkpoint(); }
    const el = drag.el, G = project.grid;
    el[drag.ku] = snapTo(drag.u0 + du, e);
    if (!(G.sym === 'cyl' && drag.kv === 'y' && !project.ions.includes(el) && !project.detectors.includes(el))) el[drag.kv] = snapTo(drag.v0 + dv, e);
    if (G.sym !== '3d') el.z = 0;
    if (G.sym === 'cyl' && project.electrodes.includes(el)) el.y = 0;
    if (project.detectors.includes(el)) el.at = el[el.axis];
    syncPanel(); requestRender();
    SIM.stale = true;
  });
  canvas.addEventListener('pointerup', e => {
    if (drag && drag.mode === 'pan' && drag.button === 2 && drag.moved < 4) {
      const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      drag = null; canvas.classList.remove('dragging');
      benchMenu(e.clientX, e.clientY, hitTest(px, py), pointOf(wx(px), wy(py)));
      return;
    }
    endPointer(e);
  });
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { document.getElementById('coords').textContent = ''; });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, bx = wx(px), by = wy(py);
    const s = Math.min(ZOOM_MAX, Math.max(0.05, V().scale * Math.exp(-e.deltaY * 0.0015)));
    V().scale = s; V().cx = bx - (px - W / 2) / s; V().cy = by + (py - H / 2) / s;
    scheduleSave(); requestRender();
  }, { passive: false });
  document.addEventListener('keydown', e => { if (e.key === ' ' && !(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) && !document.querySelector('dialog[open]')) { spaceDown = true; } });
  document.addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; canvas.classList.remove('dragging'); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pointTool) { setPointTool(null); requestRender(); } });
  window.addEventListener('blur', () => { spaceDown = false; });
  // files dropped on the bench
  const stage = document.getElementById('stage');
  stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('drop'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('drop'));
  stage.addEventListener('drop', e => {
    e.preventDefault(); stage.classList.remove('drop');
    const r = canvas.getBoundingClientRect(), at = pointOf(wx(e.clientX - r.left), wy(e.clientY - r.top));
    for (const f of e.dataTransfer.files) openDropped(f, at);
  });
}
/* the pointer's bench position (and the potential there, from the cut) */
function coordsShow(px, py) {
  const u = wx(px), v = wy(py), box = document.getElementById('coords'), S = SIM.slice, [iu, iv] = PLANES[V().plane], names = ['x', 'y', 'z'];
  let txt = names[iu] + ' ' + nf(u, 4) + '  ' + names[iv] + ' ' + nf(v, 4) + ' mm';
  if (S && S.plane === V().plane) {
    const a = Math.round((u - S.u0) / S.h), vv = project.grid.sym === 'cyl' ? Math.abs(v) : v, b = Math.round((vv - S.v0) / S.h);
    if (a >= 0 && a < S.nu && b >= 0 && b < S.nv) { const q = a + S.nu * b; if (S.mask[q] >= 0) { const el = project.electrodes.filter(e => e.on !== false)[S.mask[q]]; if (el) txt += '  ' + el.name; } else { const p = S.pot[q]; if (p === p) txt += '  ' + nf(p, 4) + ' V'; if (S.emag && S.emag[q] === S.emag[q]) txt += '  |E| ' + nf(S.emag[q], 3) + ' V/mm'; } }
  }
  box.textContent = txt;
}
