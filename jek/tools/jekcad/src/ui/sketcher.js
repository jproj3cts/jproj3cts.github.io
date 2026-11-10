import { STD_PLANES, appliedCount } from '../core/doc.js';
import { definedEnts, dimMeasure, entKeys, hpt, lineDir, sketchId, solveNear, solveSketch } from '../core/sketch.js';
import { arc3, arcSweep, carryRegions, distToEnt, entOutline, filletCorner, mirrorEnts, offsetEnts, polygonEnts, rectEnts, regionAt, regionsOf, slotEnts, tangentArc, trimEnt } from '../core/sketch-tools.js';
import { evalExpr, fmtNum } from '../core/units.js';
import { toWorld } from '../engines/kernel.js';
import { app, changed, checkpoint, emit, isDark, on, regenDone, regenNow, toast } from './app.js';
import { V, fit, normalTo, pickAt, project, pxToMm, rayAt, rayPlane, redraw } from './view3d.js';
import { kernelAsk } from '../page/kernel.js';
import { h } from '../../../jekray/src/ui/dom.js';

/* ==========================================================================
   The sketcher, and the overlay it shares with the model view: the standard and datum planes, every visible
   sketch (its regions lit when they can be chosen), and the sketch being edited, all drawn on a 2D canvas over the
   3D view through the view's camera.
   Editing a sketch: the view turns normal to its plane; the tools draw lines (chained), rectangles (corner or
   centre), circles, arcs (three-point or tangent), slots, polygons and points, inferring constraints as they go
   (coincident, on a curve, a line's middle, horizontal, vertical, tangent, perpendicular: shown as glyphs by the
   pointer). Constraints are added to what is selected from the bar; the dimension tool measures a line, the
   distance between points, a point from a line, a radius or diameter, or an angle, and takes a value or an
   expression typed in place. Free shapes are blue, fully defined ones in ink. Dragging a point or a shape solves
   the sketch as it moves. Trim, fillet, offset, mirror, Use (model edges projected) and construction too.
   The model is inferred from as well: a point drawn on one of its corners or edges is held there (the corner or
   edge comes into the sketch as a fixed construction shape, as Use would bring it). While a shape is drawn its
   size shows by the pointer; a number typed straight after a line, circle or arc dimensions it.
   ========================================================================== */
export const SK = { tool: 'select', draft: null, sel: [], hover: null, uv: null, snap: null, constr: false, undo: [], redoStack: [], clip: null, defined: new Set(), drag: null, box: null, polySides: 6, filletR: '2', offsetD: '2', dimInput: null, model: null, last: [], lineK: false, variant: {} };
const SNAP_PX = 10, ON_PX = 8;
/* ---------- the sketch being edited ---------- */
const S = () => app.sketch;
const ents = () => S().f.ents;
const entById = id => ents().find(e => e.id === id);
export const toScreen = uv => project(toWorld(S().F, uv));
const uvAt = (sx, sy) => rayPlane(rayAt(sx, sy), S().F);
/* ---------- starting and ending ---------- */
export async function startSketch(f, at, isNew) {
  app.sel = []; app.hover = null; emit('sel');
  app.sketch = { f: JSON.parse(JSON.stringify(f)), at, isNew, F: null, orig: JSON.stringify(f) };
  Object.assign(SK, { tool: 'line', draft: null, sel: [], hover: null, undo: [], redoStack: [], constr: false, drag: null, box: null, model: null, last: [], dimPick: null, lineK: false });
  // the plane's frame: a standard plane's at once; a face's or a datum plane's from the kernel
  let F = f.plane && f.plane.std ? STD_PLANES[f.plane.std] : null;
  const out = await regenNow();
  if (!F) F = out && out.preview && out.preview.frame;
  if (!F) { const why = out && out.preview && out.preview.rep && out.preview.rep.error; toast('The sketch’s plane is not there' + (why ? ': ' + why : ''), true); app.sketch = null; emit('sketch'); regenNow(); return false; }
  app.sketch.F = F;
  normalTo(F);
  resolve();
  emit('sketch');
  sketchBar();
  return true;
}
/* the holes of the face sketched on that lie inside what was drawn (round edges of the model in the sketch's
   plane, wholly inside a region and touching no shape): brought into the sketch as Use would bring them, so the
   region round each is its own and an extrude of the shape leaves the holes open */
function useHoles() {
  const f = S().f, M = modelGeom(), own = f.ents.filter(e => !e.k && e.t !== 'point');
  if (!own.length) return 0;
  const R = regionsOf(f.ents);
  let n = 0;
  for (const g of M.edges) {
    if (g.t !== 'circle' || g.off > 1e-6 || !regionAt(R, g.c)) continue;
    if (f.ents.some(e => e.t === 'circle' && Math.hypot(e.c[0] - g.c[0], e.c[1] - g.c[1]) < 1e-6 && Math.abs(e.r - g.r) < 1e-6)) continue;
    // clear of every shape drawn: the whole circle inside one region
    if (own.some(e => distToEnt(e, g.c) <= g.r + 1e-9)) continue;
    refEnt(g, true); n++;
  }
  return n;
}
export function finishSketch() {
  const s = S();
  if (!s) return;
  cancelDraft();
  const holes = s.f.plane && s.f.plane.kind === 'face' ? useHoles() : 0;
  if (holes) toast((holes === 1 ? 'A hole of the face is' : holes + ' holes of the face are') + ' inside what you drew: brought into the sketch, so an extrude leaves ' + (holes === 1 ? 'it' : 'them') + ' open (delete ' + (holes === 1 ? 'it' : 'them') + ' from the sketch to fill ' + (holes === 1 ? 'it' : 'them') + ')');
  checkpoint();
  if (s.isNew) app.doc.features.splice(s.at, 0, s.f);
  else { carryRegions(app.doc, s.f.id, app.doc.features[s.at].ents, s.f.ents); app.doc.features[s.at] = s.f; }
  if (app.doc.rollback !== null && s.isNew) app.doc.rollback = Math.min(app.doc.features.length, app.doc.rollback + 1);
  if (app.doc.rollback !== null && app.doc.rollback >= app.doc.features.length) app.doc.rollback = null;
  app.sketch = null;
  emit('sketch'); sketchBar();
  changed();
}
export function cancelSketch() {
  if (!S()) return;
  app.sketch = null; dimInputClose();
  emit('sketch'); sketchBar();
  regenNow();
}
/* the sketch solved again, and which shapes are fully defined */
export function resolve() {
  const f = S().f;
  solveSketch(f.ents, f.cons, f.dims, null, { iters: 80 });
  SK.defined = definedEnts(f.ents, f.cons, f.dims);
  // a chain of lines carries on from where its last line ends now (a dimension typed may have moved it)
  const d = SK.draft;
  if (d && d.chainFrom && entById(d.chainFrom.e)) { const q = hpt(new Map(f.ents.map(e => [e.id, e])), d.chainFrom).slice(); d.pts = [q]; d.snaps = [{ p: q }]; }
  redraw(); drawOverlay();
}
function keep() { SK.undo.push(JSON.stringify({ ents: ents(), cons: S().f.cons, dims: S().f.dims })); if (SK.undo.length > 200) SK.undo.shift(); SK.redoStack.length = 0; }
export function sketchUndo() { if (!SK.undo.length) return false; SK.redoStack.push(JSON.stringify({ ents: ents(), cons: S().f.cons, dims: S().f.dims })); Object.assign(S().f, JSON.parse(SK.undo.pop())); SK.sel = []; resolve(); return true; }
export function sketchRedo() { if (!SK.redoStack.length) return false; SK.undo.push(JSON.stringify({ ents: ents(), cons: S().f.cons, dims: S().f.dims })); Object.assign(S().f, JSON.parse(SK.redoStack.pop())); SK.sel = []; resolve(); return true; }
/* ---------- inference: what the pointer is near ---------- */
function snapPoints() {
  const out = [{ r: { e: 'origin' }, p: [0, 0] }];
  for (const e of ents()) {
    for (const k of entKeys(e)) out.push({ r: { e: e.id, k }, p: hpt(new Map([[e.id, e]]), { e: e.id, k }) });
    if (e.t === 'line') out.push({ r: { e: e.id, k: 'm' }, p: [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], mid: true });
  }
  return out;
}
/* ---------- the model, as the sketch sees it: its corners and edges flattened onto the sketch's plane ---------- */
function edgeShape(P) {
  const pts = [];
  for (const q of P) if (!pts.length || Math.hypot(q[0] - pts[pts.length - 1][0], q[1] - pts[pts.length - 1][1]) > 1e-7) pts.push(q);
  if (pts.length < 2) return null;                       // an edge seen end on
  const a = pts[0], b = pts[pts.length - 1], closed = Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6, n = pts.length;
  let size = 0; for (const q of pts) size = Math.max(size, Math.hypot(q[0] - a[0], q[1] - a[1]));
  if (size < 1e-6) return null;
  if (!closed) { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L > 1e-6 && pts.every(q => Math.abs((q[0] - a[0]) * dy - (q[1] - a[1]) * dx) / L < 1e-6 * Math.max(1, L))) return { t: 'line', a, b }; }
  if (n >= 4) {
    // a circle through three of its points, if every point is on it
    const p = a, q = pts[closed ? Math.floor(n / 3) : Math.floor(n / 2)], r = closed ? pts[Math.floor(2 * n / 3)] : b;
    const D = 2 * (p[0] * (q[1] - r[1]) + q[0] * (r[1] - p[1]) + r[0] * (p[1] - q[1]));
    if (Math.abs(D) > 1e-9) {
      const pp = p[0] * p[0] + p[1] * p[1], qq = q[0] * q[0] + q[1] * q[1], rr = r[0] * r[0] + r[1] * r[1];
      const c = [(pp * (q[1] - r[1]) + qq * (r[1] - p[1]) + rr * (p[1] - q[1])) / D, (pp * (r[0] - q[0]) + qq * (p[0] - r[0]) + rr * (q[0] - p[0])) / D], R = Math.hypot(p[0] - c[0], p[1] - c[1]);
      if (pts.every(z => Math.abs(Math.hypot(z[0] - c[0], z[1] - c[1]) - R) < 1e-5 * Math.max(1, R))) {
        if (closed) return { t: 'circle', c, r: R };
        const ang = z => Math.atan2(z[1] - c[1], z[0] - c[0]) * 180 / Math.PI, m360 = v => ((v % 360) + 360) % 360;
        let a0 = ang(a), a1 = ang(b);
        if (m360(ang(q) - a0) > m360(a1 - a0)) [a0, a1] = [a1, a0];
        return { t: 'arc', c, r: R, a0, a1 };
      }
    }
  }
  return { t: 'poly', pts };
}
export function modelGeom() {
  const s = S();
  if (!s || !s.F) return { pts: [], edges: [] };
  if (SK.model && SK.model.n === app.regenCount && SK.model.parts === V.parts.size) return SK.model;
  const F = s.F, to = (A, i) => { const d = [A[i] - F.o[0], A[i + 1] - F.o[1], A[i + 2] - F.o[2]]; return [d[0] * F.x[0] + d[1] * F.x[1] + d[2] * F.x[2], d[0] * F.y[0] + d[1] * F.y[1] + d[2] * F.y[2]]; };
  const pts = [], edges = [], seen = new Set(), offPlane = (A, i) => Math.abs((A[i] - F.o[0]) * F.n[0] + (A[i + 1] - F.o[1]) * F.n[1] + (A[i + 2] - F.o[2]) * F.n[2]);
  for (const o of V.parts.values()) {
    const p = o.userData.p;
    for (let i = 0; i < p.verts.length; i += 3) { const q = to(p.verts, i), key = q.map(v => v.toFixed(5)).join(','); if (!seen.has(key)) { seen.add(key); q.from = { part: p.id, kind: 'vertex', index: i / 3 }; pts.push(q); } }
    for (let j = 0; j < p.edgeGroups.length / 2; j++) {
      const a = p.edgeGroups[2 * j], n = p.edgeGroups[2 * j + 1], P = [];
      let off = 0;
      for (let k = a; k < a + n; k++) { if (k === a) P.push(to(p.seg, 6 * k)); P.push(to(p.seg, 6 * k + 3)); off = Math.max(off, offPlane(p.seg, 6 * k), offPlane(p.seg, 6 * k + 3)); }
      const g = edgeShape(P);
      if (g) { g.from = { part: p.id, kind: 'edge', index: j }; g.off = off; edges.push(g); }
    }
  }
  return (SK.model = { n: app.regenCount, parts: V.parts.size, pts, edges });
}
/* the nearest point of a model edge to q, and how far it is */
function nearOnEdge(g, q) {
  const onSeg = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)); return [a[0] + dx * t, a[1] + dy * t]; };
  let p;
  if (g.t === 'line') p = onSeg(g.a, g.b);
  else if (g.t === 'poly') { let bd = Infinity; for (let i = 1; i < g.pts.length; i++) { const z = onSeg(g.pts[i - 1], g.pts[i]), d = Math.hypot(z[0] - q[0], z[1] - q[1]); if (d < bd) { bd = d; p = z; } } }
  else {
    const a = Math.atan2(q[1] - g.c[1], q[0] - g.c[0]);
    p = [g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)];
    if (g.t === 'arc' && distToEnt(g, p) > 1e-6) { const e0 = [g.c[0] + g.r * Math.cos(g.a0 * Math.PI / 180), g.c[1] + g.r * Math.sin(g.a0 * Math.PI / 180)], e1 = [g.c[0] + g.r * Math.cos(g.a1 * Math.PI / 180), g.c[1] + g.r * Math.sin(g.a1 * Math.PI / 180)]; p = Math.hypot(e0[0] - q[0], e0[1] - q[1]) < Math.hypot(e1[0] - q[0], e1[1] - q[1]) ? e0 : e1; }
  }
  return { p, d: Math.hypot(p[0] - q[0], p[1] - q[1]) };
}
/* a corner or an edge of the model brought into the sketch to be held to: a fixed construction shape, made once */
function refEnt(g, solid) {
  const f = S().f, near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
  const same = e => e.ref && e.t === g.t && (g.t === 'point' ? near(e.c, g.c) : g.t === 'line' ? (near(e.a, g.a) && near(e.b, g.b)) || (near(e.a, g.b) && near(e.b, g.a)) : near(e.c, g.c) && Math.abs(e.r - g.r) < 1e-6 && (g.t === 'circle' || (Math.abs(e.a0 - g.a0) < 1e-6 && Math.abs(e.a1 - g.a1) < 1e-6)));
  const had = f.ents.find(same);
  if (had) return had.id;
  const e = JSON.parse(JSON.stringify(g));
  delete e.from; delete e.off;
  e.id = sketchId(e.t[0]); e.ref = true; if (!solid) e.k = true;
  // which edge or corner of the model it is, asked of the kernel, so the sketch follows the edge when the model changes
  if (g.from) kernelAsk('refs', { picks: [g.from] }).then(rs => { const r = rs && rs[0], sk = S() && S().f.id === f.id ? S().f : app.doc.features.find(x => x.id === f.id), en = sk && sk.ents.find(x => x.id === e.id); if (en && r && (r.kind === 'edge' || (r.kind === 'vertex' && r.faces && r.faces.length))) en.src = { kind: r.kind, part: r.part, faces: r.faces, pt: r.pt }; }).catch(() => {});
  f.ents.push(e);
  const Em = new Map([[e.id, e]]);
  for (const k of entKeys(e)) f.cons.push({ id: sketchId('c'), t: 'fix', r: [{ e: e.id, k }], at: hpt(Em, { e: e.id, k }).slice() });
  if (e.t === 'circle' || e.t === 'arc') f.dims.push({ id: sketchId('d'), t: 'rad', r: [{ e: e.id }], v: e.r, x: fmtNum(e.r, 6) });
  return e.id;
}
/* the point the pointer gives, with the constraints it implies: from is where the shape being drawn starts */
function snap(sx, sy, from, skipIds) {
  const uv = uvAt(sx, sy);
  if (!uv) return null;
  if (SK.free) return { p: uv, ref: null };            // Shift held: the point is where the pointer is, nothing inferred
  const skip = new Set(skipIds || []);
  let best = null, bd = SNAP_PX;
  for (const c of snapPoints()) { if (skip.has(c.r.e)) continue; const s = toScreen(c.p), d = Math.hypot(s[0] - sx, s[1] - sy); if (d < bd) { bd = d; best = c; } }
  // (a line that ends on a point dead level with, or straight above, where it began is horizontal or vertical too)
  const hvOf = q => (from && Math.abs(q[1] - from[1]) < 1e-6 && Math.abs(q[0] - from[0]) > 1e-6 ? 'horizontal' : from && Math.abs(q[0] - from[0]) < 1e-6 && Math.abs(q[1] - from[1]) > 1e-6 ? 'vertical' : null);
  if (best) return { p: best.p.slice(), ref: best.r, glyph: best.mid ? 'M' : '●', kind: best.mid ? 'midpoint' : 'coincident', hv: hvOf(best.p) };
  // a corner of the model
  const M = modelGeom();
  let mp = null;
  for (const q of M.pts) { const s = toScreen(q), d = Math.hypot(s[0] - sx, s[1] - sy); if (d < bd) { bd = d; mp = q; } }
  if (mp) return { p: mp.slice(), ref: null, mref: { t: 'point', c: mp.slice(), from: mp.from }, glyph: '●', kind: 'coincident', hv: hvOf(mp) };
  // the middle of a straight edge of the model, or the centre of a round one
  let mm = null;
  for (const g of M.edges) { const q = g.t === 'line' ? [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2] : g.t === 'circle' || g.t === 'arc' ? g.c : null; if (!q) continue; const s = toScreen(q), d = Math.hypot(s[0] - sx, s[1] - sy); if (d < bd) { bd = d; mm = { g, q }; } }
  if (mm) return Object.assign({ p: mm.q.slice(), ref: null, hv: hvOf(mm.q) }, mm.g.t === 'line' ? { mmid: mm.g, glyph: 'M', kind: 'midpoint' } : { mcen: mm.g, glyph: '◎', kind: 'coincident' });
  let onEnt = null, od = ON_PX;
  for (const e of ents()) { if (skip.has(e.id) || e.t === 'point') continue; const d = distToEnt(e, uv) / pxToMm(1); if (d < od) { od = d; onEnt = e; } }
  const out = { p: uv, ref: null };
  if (onEnt) {
    // onto the curve
    const E1 = onEnt;
    if (E1.t === 'line') { const d = lineDir(E1), L2 = d[0] * d[0] + d[1] * d[1] || 1, t = ((uv[0] - E1.a[0]) * d[0] + (uv[1] - E1.a[1]) * d[1]) / L2; out.p = [E1.a[0] + d[0] * t, E1.a[1] + d[1] * t]; }
    else { const a = Math.atan2(uv[1] - E1.c[1], uv[0] - E1.c[0]); out.p = [E1.c[0] + E1.r * Math.cos(a), E1.c[1] + E1.r * Math.sin(a)]; }
    out.on = E1.id; out.glyph = '⌒'; out.kind = 'oncurve';
  } else {
    // an edge of the model
    let me = null, md = ON_PX * pxToMm(1);
    for (const g of M.edges) { const r = nearOnEdge(g, uv); if (r.d < md) { md = r.d; me = { g, p: r.p }; } }
    if (me) { out.p = me.p; out.mon = me.g; out.glyph = '⌒'; out.kind = 'oncurve'; }
  }
  // a line that comes to a circle or an arc nearly touching it: ended where it touches, and held tangent
  const round = out.on ? entById(out.on) : out.mon;
  if (from && round && (round.t === 'circle' || round.t === 'arc')) {
    const dx = from[0] - round.c[0], dy = from[1] - round.c[1], dd = Math.hypot(dx, dy);
    if (dd > round.r * 1.0001) {
      const base = Math.atan2(dy, dx), al = Math.acos(round.r / dd);
      let tp = null, td = 10 * pxToMm(1);
      for (const sg of [1, -1]) { const q = [round.c[0] + round.r * Math.cos(base + sg * al), round.c[1] + round.r * Math.sin(base + sg * al)], d = Math.hypot(q[0] - uv[0], q[1] - uv[1]); if (d < td && (round.t === 'circle' || distToEnt(round, q) < 1e-6)) { td = d; tp = q; } }
      if (tp) { out.p = tp; out.tan = true; out.glyph = 'T'; return out; }
    }
  }
  if (from) {
    const fs = toScreen(from), ps = toScreen(out.p);
    if (Math.abs(ps[1] - fs[1]) < 6 && Math.abs(ps[0] - fs[0]) > 4) { out.p = [out.p[0], from[1]]; out.hv = 'horizontal'; out.glyph = 'H'; }
    else if (Math.abs(ps[0] - fs[0]) < 6 && Math.abs(ps[1] - fs[1]) > 4) { out.p = [from[0], out.p[1]]; out.hv = 'vertical'; out.glyph = 'V'; }
  }
  // level with, or straight above or below, a point already there (the origin among them): held so, one each way
  if (!out.on && !out.mon) {
    const ps = toScreen(out.p), al = [];
    for (const [t, i] of [['horizontal', 1], ['vertical', 0]]) {
      if (out.hv === t) continue;
      let pick = null, pd = Infinity;
      for (const c of snapPoints()) {
        if (c.mid || skip.has(c.r.e) || (from && Math.hypot(c.p[0] - from[0], c.p[1] - from[1]) < 1e-9)) continue;
        const z = toScreen(c.p), off = Math.abs(ps[i] - z[i]), along = Math.abs(ps[1 - i] - z[1 - i]);
        if (off < 5 && along > 12 && along < pd) { pd = along; pick = c; }
      }
      if (pick) { al.push({ t, ref: pick.r, p: pick.p.slice() }); out.p = i ? [out.p[0], pick.p[1]] : [pick.p[0], out.p[1]]; }
    }
    if (al.length) { out.al = al; if (!out.glyph) out.glyph = al[0].t === 'horizontal' ? 'H' : 'V'; }
  }
  return out;
}
const mkCon = (t, ...r) => ({ id: sketchId('c'), t, r });
/* the constraints a snapped point brings to a shape's point (e, k) */
function snapCons(sn, e, k) {
  if (!sn) return [];
  if (sn.ref) return [sn.kind === 'midpoint' ? mkCon('midpoint', { e, k }, { e: sn.ref.e }) : mkCon('coincident', { e, k }, sn.ref)];
  if (sn.on) return [mkCon('oncurve', { e, k }, { e: sn.on })];
  if (sn.mref) return [mkCon('coincident', { e, k }, { e: refEnt(sn.mref), k: 'c' })];
  if (sn.mmid) return [mkCon('midpoint', { e, k }, { e: refEnt(sn.mmid) })];
  if (sn.mcen) return [mkCon('coincident', { e, k }, { e: refEnt(sn.mcen), k: 'c' })];
  if (sn.mon && sn.mon.t !== 'poly') return [mkCon('oncurve', { e, k }, { e: refEnt(sn.mon) })];
  return (sn.al || []).map(a => mkCon(a.t, { e, k }, a.ref));
}
/* ---------- drawing tools ---------- */
const TOOL_STEPS = { line: 2, mline: 2, rect: 2, crect: 2, circle: 2, circle3: 3, arc3: 3, tarc: 2, slot: 3, polygon: 2, point: 1 };
/* the tools whose second point is inferred level with, or straight above, their first */
const FROM_TOOLS = { line: 1, mline: 1, rect: 1, polygon: 1 };
export function setTool(t) {
  cancelDraft();
  if (t === 'construct') { toggleConstruction(); return; }
  if (t === 'use' && app.sel.length) { useEdges(app.sel.filter(s => s.kind === 'edge' || s.kind === 'face')); }
  if (t === 'offset' || t === 'mirror') {
    const picked = SK.sel.filter(x => x.t === 'ent').map(x => x.id);
    if (t === 'offset') {
      if (!picked.length) { toast('Select the shapes to offset, then Offset'); SK.tool = 'select'; sketchBar(); return; }
      let d; try { d = evalExpr(SK.offsetD, app.result ? app.result.vars : {}, 'len'); } catch (err) { toast('Offset: ' + err.message, true); return; }
      keep(); offsetEnts(S().f, picked, d); resolve(); toast('Offset by ' + fmtNum(d) + ' mm (a negative distance goes the other way)'); SK.tool = 'select'; sketchBar(); return;
    }
    // Mirror has a small panel: the shapes to mirror (what is selected to begin with), then the line to mirror them in
    SK.sel = SK.sel.filter(x => x.t === 'ent');
    SK.mirror = { line: null, field: 'shapes' };
  }
  // a centre line is the line tool drawing construction lines
  SK.lineK = t === 'cline';
  if (t === 'cline') t = 'line';
  SK.tool = t; SK.draft = null;
  for (const g of SK_GROUPS) if (g.includes(SK.lineK ? 'cline' : t)) SK.variant[g[0]] = SK.lineK ? 'cline' : t;
  sketchBar(); drawOverlay();
}
function cancelDraft() { SK.draft = null; SK.snap = null; dimInputClose(); typeClose(); }
function addEnts(es, cs) {
  for (const e of es) if (SK.constr && e.t !== 'point') e.k = true;
  S().f.ents.push(...es); S().f.cons.push(...(cs || []));
}
function toolClick(sx, sy, forced) {
  const t = SK.tool, d = SK.draft, from = d && d.pts.length ? d.pts[d.pts.length - 1] : null;
  const sn = forced || snap(sx, sy, FROM_TOOLS[t] ? from : null);
  if (!sn) return;
  const pts = d ? d.pts.concat([sn.p]) : [sn.p], snaps = d ? d.snaps.concat([sn]) : [sn];
  if (pts.length < TOOL_STEPS[t]) { SK.draft = { pts, snaps }; drawOverlay(); return; }
  const [p0, p1, p2] = pts;
  if (t === 'line' && Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < pxToMm(2)) return;
  keep();
  SK.last = [];
  if (t === 'point') { const e = { id: sketchId('p'), t: 'point', c: p0 }; addEnts([e], snapCons(snaps[0], e.id, 'c')); }
  else if (t === 'line') {
    const e = Object.assign({ id: sketchId('l'), t: 'line', a: p0, b: p1 }, SK.lineK ? { k: true } : {}), cs = [...(d && d.chainFrom ? [mkCon('coincident', { e: e.id, k: 'a' }, d.chainFrom)] : snapCons(snaps[0], e.id, 'a')), ...snapCons(snaps[1], e.id, 'b')];
    if (snaps[1].hv) cs.push(mkCon(snaps[1].hv, { e: e.id }));
    if (snaps[1].tan) cs.push(mkCon('tangent', { e: e.id }, { e: snaps[1].on || refEnt(snaps[1].mon) }));
    // (nothing is inferred that was not shown by the pointer as it was drawn)
    addEnts([e], cs); SK.last = [e.id];
    // chained: the next line starts here, unless this one closed the chain on a point already there
    // (only there: a line that lands on some other point carries on, as a profile often runs through points already drawn)
    const first = d && d.first ? d.first : p0, closed = Math.hypot(p1[0] - first[0], p1[1] - first[1]) < 1e-9;
    SK.draft = closed ? null : { pts: [p1], snaps: [{ p: p1 }], chainFrom: { e: e.id, k: 'b' }, prev: e.id, first };
    resolve(); return;
  }
  else if (t === 'mline') {
    // a line from its middle: the first click is the middle (held there), the second an end
    if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < pxToMm(2)) { SK.undo.pop(); return; }
    const e = { id: sketchId('l'), t: 'line', a: [2 * p0[0] - p1[0], 2 * p0[1] - p1[1]], b: p1 }, s0 = snaps[0], cs = snapCons(snaps[1], e.id, 'b');
    if (s0.ref && s0.kind !== 'midpoint') cs.push(mkCon('midpoint', s0.ref, { e: e.id }));
    else if (s0.mref) cs.push(mkCon('midpoint', { e: refEnt(s0.mref), k: 'c' }, { e: e.id }));
    else if (s0.mcen) cs.push(mkCon('midpoint', { e: refEnt(s0.mcen), k: 'c' }, { e: e.id }));
    if (snaps[1].hv) cs.push(mkCon(snaps[1].hv, { e: e.id }));
    addEnts([e], cs); SK.last = [e.id];
  }
  else if (t === 'circle3') {
    const a = arc3(p0, p1, p2); if (!a) { toast('The three points are in a line: no circle', true); SK.draft = null; SK.undo.pop(); return; }
    const e = { id: sketchId('c'), t: 'circle', c: a.c, r: a.r };
    // a point already in the sketch that it was drawn through stays on it
    addEnts([e], snaps.filter(x => x.ref && x.kind === 'coincident' && x.ref.e !== 'origin').map(x => mkCon('oncurve', x.ref, { e: e.id }))); SK.last = [e.id];
  }
  else if (t === 'rect' || t === 'crect') { const r = rectEnts(p0, p1, t === 'crect'); addEnts(r.ents, r.cons.concat(snapCons(snaps[0], t === 'crect' ? r.ents[5].id : r.ents[0].id, t === 'crect' ? 'c' : 'a'), snapCons(snaps[1], r.ents[2].id, 'a'))); SK.last = [r.ents[0].id, r.ents[1].id]; }
  else if (t === 'circle') { const e = { id: sketchId('c'), t: 'circle', c: p0, r: Math.max(pxToMm(2), Math.hypot(p1[0] - p0[0], p1[1] - p0[1])) }; addEnts([e], snapCons(snaps[0], e.id, 'c')); SK.last = [e.id]; }
  else if (t === 'arc3') {
    const a = arc3(p0, p1, p2); if (!a) { toast('The three points are in a line: no arc', true); SK.draft = null; return; }
    const e = { id: sketchId('a'), t: 'arc', c: a.c, r: a.r, a0: a.a0, a1: a.a1 };
    addEnts([e], [...snapCons(snaps[0], e.id, a.rev ? 'p1' : 'p0'), ...snapCons(snaps[1], e.id, a.rev ? 'p0' : 'p1')]); SK.last = [e.id];
  } else if (t === 'tarc') {
    // from the end of a line or arc, along it
    const r0 = snaps[0].ref, E0 = r0 && entById(r0.e);
    if (!E0 || !(E0.t === 'line' || E0.t === 'arc') || !/^(a|b|p0|p1)$/.test(r0.k)) { toast('A tangent arc starts at the end of a line or an arc', true); SK.draft = null; return; }
    let tdir;
    if (E0.t === 'line') { const dd = lineDir(E0); tdir = r0.k === 'b' ? dd : [-dd[0], -dd[1]]; }
    else { const ang = (r0.k === 'p1' ? E0.a0 + arcSweep(E0) : E0.a0) * Math.PI / 180; tdir = r0.k === 'p1' ? [-Math.sin(ang), Math.cos(ang)] : [Math.sin(ang), -Math.cos(ang)]; }
    const a = tangentArc(p0, tdir, p1); if (!a) { toast('That end is straight on: draw a line instead', true); SK.draft = null; return; }
    const e = { id: sketchId('a'), t: 'arc', c: a.c, r: a.r, a0: a.a0, a1: a.a1 }, start = a.rev ? 'p1' : 'p0', end = a.rev ? 'p0' : 'p1';
    addEnts([e], [mkCon('coincident', { e: e.id, k: start }, r0), { id: sketchId('c'), t: 'tangent', r: [{ e: E0.id }, { e: e.id }], at: start }, ...snapCons(snaps[1], e.id, end)]); SK.last = [e.id];
  } else if (t === 'slot') { const r = slotEnts(p0, p1, Math.max(pxToMm(2), Math.abs(distToEnt({ t: 'line', a: p0, b: p1 }, p2)))); addEnts(r.ents, r.cons); }
  else if (t === 'polygon') { const r = polygonEnts(p0, p1, SK.polySides); const cid = r.ents[r.ents.length - 1].id; addEnts(r.ents, r.cons.concat(snapCons(snaps[0], cid, 'c'), snaps[1].hv ? [mkCon(snaps[1].hv, { e: cid, k: 'c' }, { e: r.ents[0].id, k: 'a' })] : [])); SK.last = [cid]; }
  SK.draft = null;
  resolve();
}
/* the shape being drawn, as it would be made now */
function draftShapes() {
  const d = SK.draft, sn = SK.snap;
  if (!d || !sn) return [];
  const pts = d.pts.concat([sn.p]), [p0, p1, p2] = pts, t = SK.tool;
  if (t === 'line') return [{ t: 'line', a: p0, b: p1, k: SK.lineK }];
  if (t === 'mline') return [{ t: 'line', a: [2 * p0[0] - p1[0], 2 * p0[1] - p1[1]], b: p1 }];
  if (t === 'circle3') { if (!p2) return [{ t: 'line', a: p0, b: p1, k: true }]; const a = arc3(p0, p1, p2); return a ? [{ t: 'circle', c: a.c, r: a.r }] : []; }
  if (t === 'rect' || t === 'crect') return rectEnts(p0, p1, t === 'crect').ents;
  if (t === 'circle') return [{ t: 'circle', c: p0, r: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) }];
  if (t === 'arc3') { if (!p2) return [{ t: 'line', a: p0, b: p1, k: true }]; const a = arc3(p0, p1, p2); return a ? [{ t: 'arc', ...a }] : []; }
  if (t === 'tarc') { const r0 = d.snaps[0].ref, E0 = r0 && entById(r0.e); if (!E0 || E0.t !== 'line') return [{ t: 'line', a: p0, b: p1, k: true }]; const dd = lineDir(E0), a = tangentArc(p0, r0.k === 'b' ? dd : [-dd[0], -dd[1]], p1); return a ? [{ t: 'arc', ...a }] : []; }
  if (t === 'slot') { if (!p2) return [{ t: 'line', a: p0, b: p1, k: true }]; return slotEnts(p0, p1, Math.max(1e-3, distToEnt({ t: 'line', a: p0, b: p1 }, p2))).ents; }
  if (t === 'polygon') return polygonEnts(p0, p1, SK.polySides).ents;
  return [];
}
function toggleConstruction() {
  const ids = SK.sel.filter(x => x.t === 'ent').map(x => x.id);
  if (ids.length) { keep(); for (const id of ids) { const e = entById(id); if (e && e.t !== 'point') { if (e.k) delete e.k; else e.k = true; } } resolve(); return; }
  SK.constr = !SK.constr; sketchBar();
  toast(SK.constr ? 'New shapes are construction (they make no regions)' : 'New shapes are ordinary');
}
/* ---------- Use: model edges projected into the sketch, held where they are ---------- */
async function useEdges(picks) {
  if (!picks.length) return;
  const out = await kernelAsk('project', { picks, frame: S().F });
  if (!out || !out.length) { toast('Nothing to use there', true); return; }
  keep();
  for (const e of out) {
    e.id = sketchId(e.t[0]); e.ref = true;
    S().f.ents.push(e);
    for (const k of entKeys(e)) S().f.cons.push({ id: sketchId('c'), t: 'fix', r: [{ e: e.id, k }], at: hpt(new Map([[e.id, e]]), { e: e.id, k }).slice() });
    if (e.t !== 'line') S().f.dims.push({ id: sketchId('d'), t: 'rad', r: [{ e: e.id }], v: e.r, x: fmtNum(e.r, 6) });
  }
  resolve();
  toast('Used ' + out.length + ' edge' + (out.length === 1 ? '' : 's') + ' of the model, fixed where they are');
}
/* ---------- picking in the sketch ---------- */
function sketchPick(sx, sy) {
  const s = S(), E = new Map(ents().map(e => [e.id, e]));
  // a dimension's label or a constraint's glyph
  // (a constraint's glyph only with the select tool: it must not hide the line under it from the others)
  for (const b of SK.labels || []) if (sx >= b.x0 && sx <= b.x1 && sy >= b.y0 && sy <= b.y1 && (b.item.t !== 'con' || SK.tool === 'select')) return b.item;
  let best = null, bd = 7;
  for (const e of ents()) for (const k of entKeys(e)) { const p = toScreen(hpt(E, { e: e.id, k })), d = Math.hypot(p[0] - sx, p[1] - sy); if (d < bd) { bd = d; best = { t: 'pt', e: e.id, k }; } }
  if (best) return best;
  // the origin: a point like any other to dimension from and constrain to
  { const o = toScreen([0, 0]); if (Math.hypot(o[0] - sx, o[1] - sy) < 7) return { t: 'pt', e: 'origin' }; }
  const uv = uvAt(sx, sy);
  if (!uv) return null;
  bd = 6;
  for (const e of ents()) { if (e.t === 'point') continue; const d = distToEnt(e, uv) / pxToMm(1); if (d < bd) { bd = d; best = { t: 'ent', id: e.id }; } }
  void s;
  if (best || SK.tool !== 'dim') return best;
  // the dimension tool reaches the model too: a corner or an edge of it (brought into the sketch when clicked)
  const M = modelGeom();
  bd = 8;
  for (const q of M.pts) { const z = toScreen(q), d = Math.hypot(z[0] - sx, z[1] - sy); if (d < bd) { bd = d; best = { t: 'mpt', c: q.slice(), from: q.from }; } }
  if (best) return best;
  bd = 6 * pxToMm(1);
  for (const g of M.edges) { if (g.t === 'poly') continue; const r = nearOnEdge(g, uv); if (r.d < bd) { bd = r.d; best = { t: 'ment', g }; } }
  return best;
}
const sameItem = (a, b) => a && b && a.t === b.t && a.id === b.id && a.e === b.e && a.k === b.k;
/* ---------- the pointer in the sketch ---------- */
export function sketchDown(e, sx, sy) {
  if (e.button !== 0) return false;
  if (SK.dimInput) dimInputCommit();
  typeClose();
  const t = SK.tool;
  if (t === 'select' || t === 'dim' || t === 'trim' || t === 'fillet' || t === 'mirror' || t === 'use') {
    const it = sketchPick(sx, sy);
    if (t === 'use') { const p = pickAt(sx, sy, 'edge'); if (p) useEdges([p]); return true; }
    if (t === 'trim') { if (it && it.t === 'ent') { keep(); if (trimEnt(S().f, it.id, uvAt(sx, sy))) resolve(); else SK.undo.pop(); } return true; }
    if (t === 'fillet') {
      const sn = snap(sx, sy);
      let r; try { r = evalExpr(SK.filletR, app.result ? app.result.vars : {}, 'len'); } catch (err) { toast('Fillet radius: ' + err.message, true); return true; }
      if (sn && sn.ref && sn.ref.e !== 'origin') { keep(); const arc = filletCorner(S().f, sn.p, r, pxToMm(1)); if (arc) resolve(); else { SK.undo.pop(); toast('Click a corner where two lines meet (the radius must fit them)', true); } }
      else toast('Click a corner where two lines meet');
      return true;
    }
    if (t === 'mirror') {
      const M = SK.mirror;
      if (M.field === 'line') { if (it && it.t === 'ent' && entById(it.id).t === 'line') { M.line = it.id; SK.sel = SK.sel.filter(x => x.id !== it.id); } else toast('The mirror line is a line of the sketch: click one (a construction line will do)'); }
      else if (it && it.t === 'ent') { const i = SK.sel.findIndex(x => sameItem(x, it)); if (i >= 0) SK.sel.splice(i, 1); else if (it.id !== M.line) SK.sel.push(it); }
      else if (!it) SK.box = { x0: sx, y0: sy, x1: sx, y1: sy };
      mirrorPanel(); drawOverlay(); return true;
    }
    if (t === 'dim') { dimClick(it, sx, sy); return true; }
    // select: a click picks; a drag on a point or shape moves it, solving as it goes; on nothing, a box
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    if (it) {
      if (add) { const i = SK.sel.findIndex(x => sameItem(x, it)); if (i >= 0) SK.sel.splice(i, 1); else SK.sel.push(it); }
      else if (!SK.sel.some(x => sameItem(x, it))) SK.sel = [it];
      if ((it.t === 'pt' && it.e !== 'origin') || it.t === 'ent' || it.t === 'dim') SK.drag = { it, sx, sy, moved: false, start: uvAt(sx, sy) };
    } else { if (!add) SK.sel = []; SK.box = { x0: sx, y0: sy, x1: sx, y1: sy }; }
    drawOverlay(); emit('sketchsel');
    return true;
  }
  SK.free = !!e.shiftKey;
  toolClick(sx, sy);
  return true;
}
export function sketchMove(e, sx, sy) {
  SK.uv = uvAt(sx, sy); SK.free = !!(e && e.shiftKey) && !!TOOL_STEPS[SK.tool];
  if (SK.drag) {
    const d = SK.drag;
    if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
    if (!d.moved) { keep(); d.moved = true; }
    const uv = uvAt(sx, sy), f = S().f;
    if (!uv) return;
    // a dimension dragged: its value goes where the pointer is (kept as an offset from what it measures)
    if (d.it.t === 'dim') { const dm = f.dims.find(x => x.id === d.it.id), base = dm && dimBase(dm, new Map(f.ents.map(e => [e.id, e]))); if (base) dm.off = [uv[0] - base[0], uv[1] - base[1]]; drawOverlay(); return; }
    let extra;
    if (d.it.t === 'pt') extra = [{ r: { e: d.it.e, k: d.it.k }, to: uv }];
    else { const en = entById(d.it.id), dv = [uv[0] - d.start[0], uv[1] - d.start[1]]; d.start = uv; extra = entKeys(en).map(k => { const p = hpt(new Map([[en.id, en]]), { e: en.id, k }); return { r: { e: en.id, k }, to: [p[0] + dv[0], p[1] + dv[1]] }; }); }
    solveSketch(f.ents, f.cons, f.dims, extra, { iters: 30 });
    solveSketch(f.ents, f.cons, f.dims, null, { iters: 30 });
    drawOverlay();
    return;
  }
  if (SK.box) { Object.assign(SK.box, { x1: sx, y1: sy }); drawOverlay(); return; }
  if (SK.tool === 'select' || SK.tool === 'dim' || SK.tool === 'trim' || SK.tool === 'mirror') SK.hover = sketchPick(sx, sy);
  else if (SK.tool === 'use') { app.hover = pickAt(sx, sy, 'edge'); emit('hover'); }
  else { const d = SK.draft, from = d && d.pts.length ? d.pts[d.pts.length - 1] : null; SK.snap = snap(sx, sy, FROM_TOOLS[SK.tool] ? from : null); }
  drawOverlay();
}
/* a double-click: a dimension's value to type again; a line, circle or arc dimensioned; a chain of lines ended */
export function sketchDbl(sx, sy) {
  if (TOOL_STEPS[SK.tool]) { if (SK.draft) { cancelDraft(); drawOverlay(); } return true; }
  if (SK.tool !== 'select') return false;
  const it = sketchPick(sx, sy);
  if (it && it.t === 'dim') { dimEdit(S().f.dims.find(d => d.id === it.id)); return true; }
  if (it && it.t === 'ent') return dimShape(it.id);
  return false;
}
/* a right-click (the button let go where it went down): the chain of lines, or the shape half drawn, ends; with
   nothing being drawn, the tool is put down */
export function sketchRight() {
  if (SK.dimInput) { dimInputClose(true); return; }
  if (SK.draft) { cancelDraft(); drawOverlay(); return; }
  if (SK.tool !== 'select') setTool('select');
}
/* ---------- sizes typed as a shape is drawn: a line's length (along the way the pointer gives), a circle's
   diameter, a rectangle's width and then its height. Enter makes the shape that size and dimensions it. ---------- */
const TYPED = { line: ['Length'], mline: ['Length'], circle: ['Diameter'], rect: ['Width', 'Height'], crect: ['Width', 'Height'] };
function typeSize(seed) {
  typeClose();
  const names = TYPED[SK.tool], vals = [], q = toScreen(SK.snap.p);
  const inp = h('input', { type: 'text', class: 'cad-diminput', id: 'sizeInput', value: seed, spellcheck: 'false', placeholder: names[0], 'aria-label': names[0], title: names.join(', then ') + ' (Enter)' });
  inp.style.left = Math.max(4, Math.min(V.w - 110, q[0] + 14)) + 'px'; inp.style.top = Math.max(4, Math.min(V.h - 30, q[1] + 12)) + 'px';
  document.getElementById('stage').append(inp);
  SK.sizeInput = inp;
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { typeClose(); return; }
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    e.preventDefault();
    const txt = inp.value.trim();
    let v; try { v = evalExpr(txt, app.result ? app.result.vars : {}, 'len'); } catch (err) { toast('That value: ' + err.message, true); return; }
    if (!(v > 0)) { toast('A size must be more than 0', true); return; }
    vals.push([v, txt]);
    if (vals.length < names.length) { inp.value = ''; inp.placeholder = names[vals.length]; inp.setAttribute('aria-label', names[vals.length]); return; }
    typeClose(); typeMake(vals);
  });
  inp.focus(); inp.setSelectionRange(seed.length, seed.length);
}
function typeClose() { if (SK.sizeInput) { SK.sizeInput.remove(); SK.sizeInput = null; } }
function typeMake(vals) {
  const d = SK.draft, sn = SK.snap, t = SK.tool;
  if (!d || !sn) return;
  const p0 = d.pts[d.pts.length - 1], dx = sn.p[0] - p0[0], dy = sn.p[1] - p0[1], L = Math.hypot(dx, dy) || 1, sg = v => (v < 0 ? -1 : 1);
  let p1;
  if (t === 'line') p1 = [p0[0] + dx / L * vals[0][0], p0[1] + dy / L * vals[0][0]];
  else if (t === 'mline') p1 = [p0[0] + dx / L * vals[0][0] / 2, p0[1] + dy / L * vals[0][0] / 2];
  else if (t === 'circle') p1 = [p0[0] + vals[0][0] / 2, p0[1]];
  else { const k = t === 'crect' ? 0.5 : 1; p1 = [p0[0] + sg(dx) * vals[0][0] * k, p0[1] + sg(dy) * vals[1][0] * k]; }
  // the shape made as a click there would make it (what the pointer inferred of its direction kept), then dimensioned
  const n0 = ents().length;
  toolClick(0, 0, { p: p1, ref: null, hv: t === 'line' || t === 'mline' ? sn.hv : null });
  if (ents().length === n0) return;
  const ids = SK.last.splice(0);
  ids.forEach((id, i) => { const e = entById(id), k = e && SHAPE_DIM[e.t]; if (k && vals[i]) S().f.dims.push({ id: sketchId('d'), t: k, r: [{ e: id }], v: vals[i][0], x: vals[i][1] }); });
  resolve();
}
/* a line's length, a circle's diameter or an arc's radius: its dimension made (or the one it has opened), to type */
const SHAPE_DIM = { line: 'len', circle: 'dia', arc: 'rad' };
function dimShape(id, seed) {
  const e = entById(id), t = e && SHAPE_DIM[e.t];
  if (!t || e.ref) return false;
  const had = S().f.dims.find(d => d.r.length === 1 && d.r[0].e === id && (d.t === t || (d.t === 'rad' && t === 'dia') || (d.t === 'dia' && t === 'rad')));
  if (had) dimEdit(had, false, seed); else makeDim({ t, r: [{ e: id }] }, seed);
  return true;
}
export function sketchUp() {
  if (SK.drag) { const d = SK.drag; SK.drag = null; if (d.moved) resolve(); return; }
  if (SK.box) {
    const b = SK.box; SK.box = null;
    if (Math.abs(b.x1 - b.x0) > 3 || Math.abs(b.y1 - b.y0) > 3) {
      const lo = [Math.min(b.x0, b.x1), Math.min(b.y0, b.y1)], hi = [Math.max(b.x0, b.x1), Math.max(b.y0, b.y1)];
      for (const e of ents()) if (entOutline(e, 20).every(p => { const s = toScreen(p); return s[0] >= lo[0] && s[0] <= hi[0] && s[1] >= lo[1] && s[1] <= hi[1]; }) && !SK.sel.some(x => x.t === 'ent' && x.id === e.id)) SK.sel.push({ t: 'ent', id: e.id });
    }
    if (SK.tool === 'mirror') mirrorPanel();
    drawOverlay(); emit('sketchsel');
  }
}
export function sketchKey(e) {
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && k === 'c') { copySel(); return true; }
  if (ctrl && k === 'v') { pasteClip(); return true; }
  if (ctrl && k === 'z') { if (e.shiftKey) sketchRedo(); else sketchUndo(); return true; }
  if (ctrl && k === 'y') { sketchRedo(); return true; }
  if (ctrl) return false;
  if (e.key === 'Escape') { if (SK.dimInput) dimInputClose(); else if (SK.draft) { SK.draft = null; drawOverlay(); } else if (SK.tool !== 'select') setTool('select'); else { SK.sel = []; drawOverlay(); } return true; }
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSel(); return true; }
  if (e.key === 'Enter' && !SK.dimInput && SK.tool === 'mirror') { mirrorApply(); return true; }
  if (e.key === 'Enter' && !SK.dimInput) { finishSketch(); return true; }
  // a number typed while a line, circle or rectangle is being drawn: its size, there and then
  if (/^[0-9.]$/.test(e.key) && !SK.dimInput && SK.draft && SK.snap && TYPED[SK.tool] && SK.draft.pts.length === TOOL_STEPS[SK.tool] - 1 && Math.hypot(SK.snap.p[0] - SK.draft.pts[SK.draft.pts.length - 1][0], SK.snap.p[1] - SK.draft.pts[SK.draft.pts.length - 1][1]) > pxToMm(3)) { typeSize(e.key); return true; }
  // a number typed straight after a line, circle or arc is drawn: its length, diameter or radius
  if (/^[0-9.]$/.test(e.key) && !SK.dimInput) { while (SK.last.length) { if (dimShape(SK.last.shift(), e.key)) return true; } }
  const keys = { l: 'line', r: 'rect', c: 'circle', a: 'arc3', t: 'tarc', s: 'select', d: 'dim', p: 'point', q: 'construct', m: 'trim', o: 'offset', u: 'use', g: 'polygon' };
  if (keys[k]) { setTool(keys[k]); return true; }
  return false;
}
/* ---------- selection's actions ---------- */
function deleteSel() {
  if (!SK.sel.length) return;
  keep();
  const f = S().f, gone = new Set(SK.sel.filter(x => x.t === 'ent').map(x => x.id)), pts = SK.sel.filter(x => x.t === 'pt');
  // a point selected alone deletes its shape if it is a point shape
  for (const p of pts) { const e = entById(p.e); if (e && e.t === 'point') gone.add(e.id); }
  const cg = new Set(SK.sel.filter(x => x.t === 'con').map(x => x.id)), dg = new Set(SK.sel.filter(x => x.t === 'dim').map(x => x.id));
  f.ents = f.ents.filter(e => !gone.has(e.id));
  f.cons = f.cons.filter(c => !cg.has(c.id) && !c.r.some(r => gone.has(r.e)));
  f.dims = f.dims.filter(d => !dg.has(d.id) && !d.r.some(r => gone.has(r.e)));
  SK.sel = []; resolve();
}
function copySel() {
  const ids = new Set(SK.sel.filter(x => x.t === 'ent').map(x => x.id));
  if (!ids.size) return;
  const f = S().f;
  SK.clip = JSON.stringify({ ents: f.ents.filter(e => ids.has(e.id)), cons: f.cons.filter(c => c.t !== 'fix' && c.r.every(r => ids.has(r.e))), dims: f.dims.filter(d => d.r.every(r => ids.has(r.e))) });
  try { if (navigator.clipboard) navigator.clipboard.writeText(SK.clip).catch(() => {}); } catch (err) { /* only here */ }
  toast('Copied ' + ids.size + ' shape' + (ids.size === 1 ? '' : 's'));
}
function pasteClip() {
  if (!SK.clip) return;
  const c = JSON.parse(SK.clip), map = new Map();
  for (const e of c.ents) { const n = sketchId(e.t[0]); map.set(e.id, n); e.id = n; }
  const re = r => (r.e === 'origin' ? r : Object.assign({}, r, { e: map.get(r.e) }));
  for (const x of c.cons.concat(c.dims)) { x.id = sketchId('c'); x.r = x.r.map(re); }
  // placed with their middle at the pointer (or moved a little, if the pointer is not on the sketch)
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const e of c.ents) for (const p of entOutline(e, 30)) { lo = [Math.min(lo[0], p[0]), Math.min(lo[1], p[1])]; hi = [Math.max(hi[0], p[0]), Math.max(hi[1], p[1])]; }
  const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], to = SK.uv || [mid[0] + pxToMm(30), mid[1] - pxToMm(30)], dv = [to[0] - mid[0], to[1] - mid[1]];
  const mv = p => [p[0] + dv[0], p[1] + dv[1]];
  for (const e of c.ents) { if (e.a) { e.a = mv(e.a); e.b = mv(e.b); } if (e.c) e.c = mv(e.c); delete e.ref; delete e.src; }
  keep();
  S().f.ents.push(...c.ents); S().f.cons.push(...c.cons); S().f.dims.push(...c.dims);
  SK.sel = c.ents.map(e => ({ t: 'ent', id: e.id }));
  resolve();
}
/* a constraint from the bar, on what is selected */
export function addConstraint(t) {
  const sel = SK.sel, E = id => entById(id), entsSel = sel.filter(x => x.t === 'ent'), ptsSel = sel.filter(x => x.t === 'pt');
  const lines = entsSel.filter(x => E(x.id).t === 'line'), curves = entsSel.filter(x => E(x.id).t === 'circle' || E(x.id).t === 'arc');
  const made = [], P = x => ({ e: x.e, k: x.k });
  if (t === 'coincident') {
    if (ptsSel.length >= 2) for (let i = 1; i < ptsSel.length; i++) made.push(mkCon('coincident', P(ptsSel[0]), P(ptsSel[i])));
    else if (ptsSel.length === 1 && entsSel.length === 1) made.push(mkCon('oncurve', P(ptsSel[0]), { e: entsSel[0].id }));
  } else if (t === 'horizontal' || t === 'vertical') {
    for (const l of lines) made.push(mkCon(t, { e: l.id }));
    if (!lines.length && ptsSel.length === 2) made.push(mkCon(t, P(ptsSel[0]), P(ptsSel[1])));
  } else if (t === 'parallel' || t === 'perpendicular') { if (lines.length >= 2) for (let i = 1; i < lines.length; i++) made.push(mkCon(t, { e: lines[0].id }, { e: lines[i].id })); }
  else if (t === 'equal') { const g = lines.length >= 2 ? lines : curves; for (let i = 1; i < g.length; i++) made.push(mkCon('equal', { e: g[0].id }, { e: g[i].id })); }
  else if (t === 'tangent') { if (entsSel.length === 2 && curves.length >= 1) made.push(mkCon('tangent', { e: entsSel[0].id }, { e: entsSel[1].id })); }
  else if (t === 'concentric') { if (curves.length >= 2) for (let i = 1; i < curves.length; i++) made.push(mkCon('concentric', { e: curves[0].id }, { e: curves[i].id })); }
  else if (t === 'midpoint') { if (ptsSel.length === 1 && lines.length === 1) made.push(mkCon('midpoint', P(ptsSel[0]), { e: lines[0].id })); }
  else if (t === 'symmetric') { if (ptsSel.length === 2 && lines.length === 1) made.push(mkCon('symmetric', P(ptsSel[0]), P(ptsSel[1]), { e: lines[0].id })); }
  else if (t === 'fix') {
    const all = ptsSel.map(P).concat(...entsSel.map(x => entKeys(E(x.id)).map(k => ({ e: x.id, k }))));
    const Em = new Map(ents().map(e => [e.id, e]));
    for (const r of all) made.push(Object.assign(mkCon('fix', r), { at: hpt(Em, r).slice() }));
  }
  const HELP = { coincident: 'two points, or a point and a curve', horizontal: 'lines, or two points', vertical: 'lines, or two points', parallel: 'two lines or more', perpendicular: 'two lines', equal: 'two lines, or two circles or arcs', tangent: 'a line or curve and a circle or arc', concentric: 'two circles or arcs', midpoint: 'a point and a line', symmetric: 'two points and the line between them', fix: 'points or shapes' };
  if (!made.length) { toast('Select ' + HELP[t] + ' first'); return; }
  keep();
  S().f.cons.push(...made);
  const before = JSON.stringify(ents());
  const r = solveSketch(S().f.ents, S().f.cons, S().f.dims, null, { iters: 80 });
  if (!r.ok) { Object.assign(S().f, JSON.parse(SK.undo.pop())); toast('That constraint cannot hold with the others (over-constrained)', true); void before; }
  resolve();
}
/* ---------- dimensions ---------- */
function dimClick(it, sx, sy) {
  // a line clicked, then somewhere off it: its length
  if (!it) { const was = SK.dimPick; SK.dimPick = null; if (was && was.t === 'ent' && entById(was.id) && entById(was.id).t === 'line') makeDim({ t: 'len', r: [{ e: was.id }] }); else drawOverlay(); return; }
  // a corner or an edge of the model: brought into the sketch as a fixed construction shape, and measured from
  if (it.t === 'mpt') it = { t: 'pt', e: refEnt({ t: 'point', c: it.c, from: it.from }), k: 'c' };
  else if (it.t === 'ment') it = { t: 'ent', id: refEnt(it.g) };
  const E = new Map(ents().map(e => [e.id, e]));
  if (it.t === 'dim') { dimEdit(S().f.dims.find(d => d.id === it.id)); return; }
  const prev = SK.dimPick;
  if (!prev) {
    if (it.t === 'ent') { const e = E.get(it.id); if (e.t === 'circle') return makeDim({ t: 'dia', r: [{ e: e.id }] }); if (e.t === 'arc') return makeDim({ t: 'rad', r: [{ e: e.id }] }); }
    SK.dimPick = it; SK.dimAt = [sx, sy]; drawOverlay(); return;
  }
  SK.dimPick = null;
  const a = prev, b = it;
  if (a.t === 'ent' && b.t === 'ent' && sameItem(a, b)) { const e = E.get(a.id); if (e.t === 'line') return makeDim({ t: 'len', r: [{ e: e.id }] }); }
  if (a.t === 'pt' && b.t === 'pt') {
    const p = hpt(E, a), q = hpt(E, b), sp = toScreen(p), sq = toScreen(q);
    const dir = Math.abs(sp[0] - sq[0]) < 4 ? 'v' : Math.abs(sp[1] - sq[1]) < 4 ? 'h' : null;
    const d = { t: 'dist', r: [{ e: a.e, k: a.k }, { e: b.e, k: b.k }] };
    if (dir) { d.dir = dir; d.s = (dir === 'h' ? q[0] - p[0] : q[1] - p[1]) < 0 ? -1 : 1; }
    return makeDim(d);
  }
  const pt = a.t === 'pt' ? a : b.t === 'pt' ? b : null, ln = [a, b].find(x => x.t === 'ent' && E.get(x.id).t === 'line');
  if (pt && ln) { const d = { t: 'pl', r: [{ e: pt.e, k: pt.k }, { e: ln.id }] }; d.s = dimMeasure(ents(), d) < 0 ? -1 : 1; return makeDim(d); }
  if (a.t === 'ent' && b.t === 'ent' && E.get(a.id).t === 'line' && E.get(b.id).t === 'line') {
    const d = { t: 'ang', r: [{ e: a.id }, { e: b.id }] };
    {
      // the angle inside the corner where the lines meet; if they do not meet, the acute one
      const l1 = E.get(a.id), l2 = E.get(b.id), nr = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6, u = lineDir(l1), w = lineDir(l2);
      const f1 = nr(l1.b, l2.a) || nr(l1.b, l2.b), f2 = nr(l2.b, l1.a) || nr(l2.b, l1.b), meet = nr(l1.a, l2.a) || nr(l1.a, l2.b) || f1;
      if (meet ? f1 !== f2 : u[0] * w[0] + u[1] * w[1] < 0) d.rev = true;
    }
    const m = dimMeasure(ents(), d);
    if (Math.abs(Math.sin(m * Math.PI / 180)) < 1e-6) { const d2 = { t: 'pl', r: [{ e: b.id, k: 'a' }, { e: a.id }] }; d2.s = dimMeasure(ents(), d2) < 0 ? -1 : 1; return makeDim(d2); }
    d.s = m < 0 ? -1 : 1; return makeDim(d);
  }
  if (a.t === 'ent' && b.t === 'ent') {
    // two curves: the distance between their centres
    const ea = E.get(a.id), eb = E.get(b.id);
    if (ea.c && eb.c) return makeDim({ t: 'dist', r: [{ e: ea.id, k: 'c' }, { e: eb.id, k: 'c' }] });
  }
  toast('Dimension: click a line, a circle or arc, two points, a point and a line, or two lines');
}
function makeDim(d, seed) {
  d.id = sketchId('d');
  const v = dimMeasure(ents(), d);
  d.v = d.t === 'ang' ? Math.abs(v) : Math.abs(v); d.x = fmtNum(d.v, 4);
  keep();
  S().f.dims.push(d);
  drawOverlay();
  dimEdit(d, true, seed);
}
/* the value of a dimension typed in place: a number, a unit, an expression or a #variable */
function dimEdit(d, isNew, seed) {
  if (!d) return;
  dimInputClose();
  const pos = SK.dimPos && SK.dimPos.get(d.id) || [V.w / 2, V.h / 2];
  const inp = h('input', { type: 'text', class: 'cad-diminput', id: 'dimInput', value: seed || d.x || fmtNum(d.v), spellcheck: 'false', 'aria-label': 'The dimension’s value' });
  inp.style.left = Math.max(4, pos[0] - 50) + 'px'; inp.style.top = Math.max(4, pos[1] - 13) + 'px';
  document.getElementById('stage').append(inp);
  SK.dimInput = { d, inp, isNew };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') dimInputCommit(); else if (e.key === 'Escape') dimInputClose(true); });
  // typed: the key that began it is in the box already; clicked: the view takes the focus first, so wait for it
  if (seed) { inp.focus(); inp.setSelectionRange(seed.length, seed.length); } else setTimeout(() => { inp.focus(); inp.select(); }, 0);
}
function dimInputCommit() {
  const D = SK.dimInput;
  if (!D) return;
  const { d, inp } = D, txt = inp.value.trim();
  let v;
  try { v = evalExpr(txt, app.result ? app.result.vars : {}, d.t === 'ang' ? 'ang' : 'len'); }
  catch (err) { toast('That value: ' + err.message, true); inp.focus(); return; }
  if (d.t !== 'ang' && !(v > 0) && !(d.t === 'dist' && v === 0)) { toast('A dimension must be more than 0', true); inp.focus(); return; }
  const before = JSON.stringify({ ents: ents(), cons: S().f.cons, dims: S().f.dims });
  if (!D.isNew) keep();
  d.v = v; d.x = txt;
  const r = solveNear(S().f.ents, S().f.cons, S().f.dims, dimMoves(S().f, d), { iters: 100 });
  if (!r.ok) { Object.assign(S().f, JSON.parse(before)); if (D.isNew) { S().f.dims = S().f.dims.filter(x => x.id !== d.id); } toast('That dimension cannot hold with the others (over-constrained): taken back', true); }
  inp.remove(); SK.dimInput = null;
  resolve();
}
function dimInputClose(cancel) {
  const D = SK.dimInput;
  if (!D) return;
  D.inp.remove(); SK.dimInput = null;
  // Esc on a new dimension takes it away; otherwise it stays as it was
  if (cancel && D.isNew) { S().f.dims = S().f.dims.filter(x => x.id !== D.d.id); resolve(); return; }
  drawOverlay();
}
/* ---------- the overlay ---------- */
const regionCache = new Map();
export function regionsCached(f) { const key = f.id + ':' + JSON.stringify(f.ents); let R = regionCache.get(key); if (!R) { R = regionsOf(f.ents); regionCache.set(key, R); if (regionCache.size > 60) regionCache.delete(regionCache.keys().next().value); } return R; }
/* the sketches the overlay shows (and can be picked in): applied, visible, with a frame */
export function shownSketches() {
  const out = [], frames = app.result ? app.result.frames : {}, n = app.sketch ? app.sketch.at : app.editing ? app.editing.at : appliedCount(app.doc);
  const want = app.editing && app.editing.field && /^(regions|sketch|sketchLine|sections)$/.test(app.editing.field.kind);
  app.doc.features.forEach((f, i) => { if (f.type === 'sketch' && i < n && !f.suppressed && (!f.hide || want || (app.editing && app.editing.f.sketch === f.id)) && frames[f.id]) out.push({ f, F: frames[f.id] }); });
  return out;
}
/* the planes the overlay shows: the three standard ones and the Plane features before the bar */
export function shownPlanes() {
  const out = [], frames = app.result ? app.result.frames : {}, n = app.sketch ? app.sketch.at : app.editing ? app.editing.at : appliedCount(app.doc);
  const hide = app.doc.hide || {};
  for (const [k, P] of Object.entries(STD_PLANES)) if (!hide[k]) out.push({ key: { std: k }, F: P, name: P.name, std: true });
  app.doc.features.forEach((f, i) => { if (f.type === 'plane' && i < n && !f.suppressed && !f.hide && frames[f.id]) out.push({ key: { feature: f.id }, F: frames[f.id], name: f.name }); });
  return out;
}
const planeSize = () => { let s = 0; for (const o of V.parts.values()) { const b = o.userData.p.bbox; s = Math.max(s, ...b[1].map((v, i) => Math.abs(v - b[0][i]))); } return s ? Math.max(10, s * 0.3) : 30; };
export function planeCorners(P) { const s = P.std ? planeSize() : planeSize() * 0.8; return [[-s, -s], [s, -s], [s, s], [-s, s]].map(q => toWorld(P.F, q)); }
const inPoly = (P, q) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
/* what of the overlay is under a screen point: a plane, or a sketch's region, shape or point */
export function overlayPick(sx, sy, want) {
  if (want === 'plane' || want === 'any') {
    // anywhere in a plane counts; where planes overlap on screen, the one in front there (nearest the eye)
    let best = null, bz = -Infinity;
    const r = rayAt(sx, sy);
    for (const P of shownPlanes()) {
      const cs = planeCorners(P).map(project), inside = inPoly(cs, [sx, sy]);
      if (!inside && edgeNear(cs, sx, sy) >= 8) continue;
      const uv = rayPlane(r, P.F), z = uv ? project(toWorld(P.F, uv))[2] : -Infinity, zz = inside ? z : -1e30;   // (a plane seen edge on: by its line, behind any plane the pointer is in)
      if (zz > bz || !best) { bz = zz; best = P; }
    }
    if (best) return { kind: 'plane', ...best.key, name: best.name };
  }
  for (const { f, F } of shownSketches().reverse()) {
    const uv = rayPlane(rayAt(sx, sy), F);
    if (!uv) continue;
    if (want === 'sketchLine' || want === 'sketch' || want === 'sketchPoint') {
      let best = null, bd = 6;
      for (const e of f.ents) { const d = e.t === 'point' ? Math.hypot(...project(toWorld(F, e.c)).slice(0, 2).map((v, i) => v - [sx, sy][i])) : distToEnt(e, uv) / pxToMm(1); if (d < bd && (want !== 'sketchLine' || e.t === 'line')) { bd = d; best = e; } }
      if (best) return { kind: 'sketchEnt', sketch: f.id, ent: best.id };
      continue;
    }
    if (want === 'regions' || want === 'any' || want === 'region') { const R = regionsCached(f), r = regionAt(R, uv); if (r) return { kind: 'region', sketch: f.id, pt: r.pt.map(v => +v.toFixed(6)) }; }
  }
  return null;
}
function edgeNear(cs, sx, sy) { let d = Infinity; for (let i = 0; i < cs.length; i++) { const a = cs[i], b = cs[(i + 1) % cs.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((sx - a[0]) * dx + (sy - a[1]) * dy) / L2)); d = Math.min(d, Math.hypot(a[0] + dx * t - sx, a[1] + dy * t - sy)); } return d; }
const COLS = () => (isDark() ? { ink: '#e9e6df', free: '#4f9ef0', con: '#9aa3ae', sel: '#f0a040', hov: '#f7c27a', plane: 'rgba(120,170,220,', glyph: '#1c1f24', glyphBg: '#cfd6de', dim: '#f2d27a', sk: '#7fb2e8', region: 'rgba(224,137,46,' }
  : { ink: '#1f232a', free: '#1f6fd0', con: '#7c8591', sel: '#d0701a', hov: '#e9a14a', plane: 'rgba(60,110,170,', glyph: '#fff', glyphBg: '#4a5360', dim: '#8a5a00', sk: '#3d6fa8', region: 'rgba(224,137,46,' });
export function drawOverlay() {
  const cv = document.getElementById('over');
  if (!cv) return;
  const c = cv.getContext('2d'), pr = cv.width / Math.max(1, V.w), C = COLS();
  c.setTransform(pr, 0, 0, pr, 0, 0);
  c.clearRect(0, 0, V.w, V.h);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const ed = app.editing, field = ed && ed.field, selKey = x => JSON.stringify(x);
  const selected = new Set(app.sel.filter(s => s.kind === 'plane' || s.kind === 'region').map(selKey));
  // planes
  if (!app.sketch) for (const P of shownPlanes()) {
    const cs = planeCorners(P).map(project), key = selKey(Object.assign({ kind: 'plane' }, P.key, { name: P.name }));
    const isSel = selected.has(key) || (ed && fieldHasPlane(ed, P.key)), isHov = app.hover && app.hover.kind === 'plane' && selKey(app.hover) === key;
    c.beginPath(); cs.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    c.fillStyle = C.plane + (isSel ? '0.28)' : isHov ? '0.2)' : '0.04)'); c.fill();
    c.strokeStyle = isSel ? C.sel : isHov ? C.hov : C.plane + '0.45)'; c.lineWidth = isSel || isHov ? 2 : 1; c.stroke();
    c.fillStyle = isSel ? C.sel : C.plane + '0.9)'; c.font = '11px system-ui, sans-serif'; c.fillText(P.name, cs[3][0] + 4, cs[3][1] + 13);
  }
  // sketches not being edited: their shapes, and their regions lit when they can be chosen
  for (const { f, F } of shownSketches()) {
    if (app.sketch && app.sketch.f.id === f.id) continue;
    const P = uv => project(toWorld(F, uv)), regionsOn = !field || field.kind === 'regions' || field.kind === 'sections';
    if (regionsOn) for (const r of regionsCached(f)) {
      const key = selKey({ kind: 'region', sketch: f.id, pt: r.pt.map(v => +v.toFixed(6)) });
      const chosen = selected.has(key) || (ed && fieldHasRegion(ed, f.id, r.pt)), hov = app.hover && app.hover.kind === 'region' && selKey(app.hover) === key;
      if (!chosen && !hov) continue;
      c.beginPath();
      for (const ring of [r.outer, ...r.holes]) ring.forEach((p, i) => { const s = P(p); if (i) c.lineTo(s[0], s[1]); else c.moveTo(s[0], s[1]); });
      c.fillStyle = C.region + (chosen ? '0.45)' : '0.25)'); c.fill('evenodd');
    }
    for (const e of f.ents) {
      const hl = app.hover && app.hover.kind === 'sketchEnt' && app.hover.ent === e.id;
      c.strokeStyle = hl ? C.hov : C.sk; c.lineWidth = hl ? 2.5 : 1.3; c.setLineDash(e.k ? [5, 4] : []);
      strokeEnt(c, e, P);
    }
    c.setLineDash([]);
  }
  // the origin: a dot and the three axes
  if (!app.sketch && !(app.doc.hide || {}).origin) {
    const o = project([0, 0, 0]), L = pxToMm(26);
    c.lineWidth = 1.5; c.font = '10px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const [ax, col, nm] of [[[L, 0, 0], '#d04a3a', 'x'], [[0, L, 0], '#3a9a4a', 'y'], [[0, 0, L], '#3a6fd0', 'z']]) { const q = project(ax); c.strokeStyle = col; c.beginPath(); c.moveTo(o[0], o[1]); c.lineTo(q[0], q[1]); c.stroke(); c.fillStyle = col; c.fillText(nm, o[0] + (q[0] - o[0]) * 1.25, o[1] + (q[1] - o[1]) * 1.25); }
    c.fillStyle = C.ink; c.beginPath(); c.arc(o[0], o[1], 2.5, 0, 7); c.fill();
    c.textAlign = 'start'; c.textBaseline = 'alphabetic';
  }
  SK.mlabels = [];
  if (app.sketch && app.sketch.F) drawSketch(c, C);
  else { SK.labels = []; if (!V.fly) modelDims(c, C); }
  if (SK.box || boxSel) { const b = SK.box || boxSel; c.setLineDash([4, 3]); c.strokeStyle = C.sel; c.lineWidth = 1; c.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); c.setLineDash([]); }
  // what overlays add to the view's bounds (so Fit takes them in)
  V.overlays = [];
  for (const { f, F } of shownSketches()) for (const e of f.ents) for (const p of entOutline(e, 45)) V.overlays.push(toWorld(F, p));
  if (app.sketch && app.sketch.F) for (const e of ents()) for (const p of entOutline(e, 45)) V.overlays.push(toWorld(app.sketch.F, p));
}
/* ---------- dimensions on the model: a sketch's, shown without opening it, and changed by a double-click ---------- */
const DIMS_KEY = 'jekcad-dims';
export const dimsShown = () => { try { return localStorage.getItem(DIMS_KEY) !== 'off'; } catch (err) { return true; } };
export function setDimsShown(v) { try { if (v) localStorage.removeItem(DIMS_KEY); else localStorage.setItem(DIMS_KEY, 'off'); } catch (err) { /* this visit */ } drawOverlay(); }
/* the sketches of the feature picked in the list: itself, or what it was made from */
function pickedSketches() {
  const f = app.picked && app.doc.features.find(x => x.id === app.picked);
  if (!f) return [];
  return f.type === 'sketch' ? [f.id] : [f.sketch, f.path, ...(f.sections || []).map(x => x.sketch)].filter(x => typeof x === 'string');
}
function dimText(d) { return (d.t === 'dia' ? 'Ø ' : d.t === 'rad' ? 'R ' : '') + fmtNum(d.v, 3) + (d.t === 'ang' ? '°' : '') + (d.x && /[#a-z(]/i.test(d.x.replace(/\b(mm|cm|in|m|deg|rad)\b/g, '')) ? ' (' + d.x + ')' : ''); }
function drawDim(c, C, d, at, sel, hov) {
  c.strokeStyle = C.dim; c.lineWidth = 1; c.font = '11px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const ln of at.lines) { c.beginPath(); c.moveTo(ln[0][0], ln[0][1]); c.lineTo(ln[1][0], ln[1][1]); c.stroke(); }
  // arrowheads: each a tip and the point it points away from (a length's line has one at each end by default)
  c.fillStyle = C.dim;
  for (const [tip, from] of at.arrows || (at.lines.length === 3 ? [[at.lines[2][0], at.lines[2][1]], [at.lines[2][1], at.lines[2][0]]] : [])) {
    const dx = tip[0] - from[0], dy = tip[1] - from[1], L = Math.hypot(dx, dy); if (L < 14) continue;
    const ux = dx / L, uy = dy / L; c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(tip[0] - ux * 8 - uy * 3, tip[1] - uy * 8 + ux * 3); c.lineTo(tip[0] - ux * 8 + uy * 3, tip[1] - uy * 8 - ux * 3); c.closePath(); c.fill();
  }
  c.font = '600 12px system-ui, sans-serif';
  const txt = dimText(d), w = c.measureText(txt).width + 10;
  c.fillStyle = sel ? C.sel : hov ? C.hov : isDark() ? 'rgba(28,31,36,0.85)' : 'rgba(255,255,255,0.88)';
  c.fillRect(at.p[0] - w / 2, at.p[1] - 8, w, 16);
  c.fillStyle = d.err ? '#d04040' : sel ? '#fff' : hov ? '#1f232a' : C.dim; c.fillText(txt, at.p[0], at.p[1] + 0.5);
  return { x0: at.p[0] - w / 2, x1: at.p[0] + w / 2, y0: at.p[1] - 8, y1: at.p[1] + 8 };
}
function modelDims(c, C) {
  const picked = new Set(pickedSketches()), frames = app.result ? app.result.frames : {}, n = app.editing ? app.editing.at : appliedCount(app.doc), all = dimsShown();
  app.doc.features.forEach((f, i) => {
    if (f.type !== 'sketch' || i >= n || f.suppressed || !frames[f.id]) return;
    const isPicked = picked.has(f.id);
    if (!isPicked && (f.hide || !all)) return;
    const F = frames[f.id], P = uv => project(toWorld(F, uv)), E = new Map(f.ents.map(e => [e.id, e]));
    // a picked sketch that is hidden shows its shapes too, so its dimensions have something to measure
    if (isPicked) { for (const e of f.ents) { c.strokeStyle = C.sel; c.lineWidth = 1.6; c.setLineDash(e.k ? [5, 4] : []); strokeEnt(c, e, P); } c.setLineDash([]); }
    for (const d of f.dims) {
      if (d.r.some(r => { const e = E.get(r.e); return e && e.ref; })) continue;
      const at = dimPlace(d, E, P);
      if (!at) continue;
      const hov = SK.mhover && SK.mhover.dim === d.id;
      SK.mlabels.push(Object.assign(drawDim(c, C, d, at, false, hov), { sketch: f.id, dim: d.id, p: at.p }));
    }
  });
  c.textAlign = 'start'; c.textBaseline = 'alphabetic';
}
export function modelDimAt(sx, sy) { return (SK.mlabels || []).find(b => sx >= b.x0 && sx <= b.x1 && sy >= b.y0 && sy <= b.y1) || null; }
export function modelDimHover(L) { if ((SK.mhover && SK.mhover.dim) !== (L && L.dim)) { SK.mhover = L; drawOverlay(); } }
/* the shapes a dimension is let move when its value is typed: of those it measures, the one least held by
   everything else (so an angle turns the loose line, not the shape it leans on) */
function dimMoves(f, d) {
  const ids = [...new Set(d.r.map(x => x.e).filter(id => id !== 'origin'))];
  const held = id => { const e = f.ents.find(x => x.id === id); return (e && e.ref ? 1000 : 0) + f.cons.filter(c => c.r.some(x => x.e === id)).length + f.dims.filter(x => x !== d && x.id !== d.id && x.r.some(y => y.e === id)).length; };
  const n = ids.map(held), least = Math.min(...n);
  // (equally held: the one picked last, so the first stays as the thing measured from)
  const pick = ids.filter((id, i) => n[i] === least);
  return pick.slice(-1);
}
/* a sketch's dimension typed again from the model view: the sketch is solved with it, and the model follows */
export function modelDimEdit(L) {
  const f = app.doc.features.find(x => x.id === L.sketch), d = f && f.dims.find(x => x.id === L.dim);
  if (!d) return false;
  const old = document.getElementById('dimInput'); if (old) old.remove();
  const inp = h('input', { type: 'text', class: 'cad-diminput', id: 'dimInput', value: d.x || fmtNum(d.v), spellcheck: 'false', 'aria-label': 'The dimension’s value' });
  inp.style.left = Math.max(4, L.p[0] - 50) + 'px'; inp.style.top = Math.max(4, L.p[1] - 13) + 'px';
  document.getElementById('stage').append(inp);
  let done = false;
  const close = () => { if (done) return; done = true; inp.remove(); };
  const commit = () => {
    if (done) return;
    const txt = inp.value.trim();
    if (txt === (d.x || fmtNum(d.v))) { close(); return; }
    let v;
    try { v = evalExpr(txt, app.result ? app.result.vars : {}, d.t === 'ang' ? 'ang' : 'len'); }
    catch (err) { toast('That value: ' + err.message, true); inp.focus(); return; }
    if (d.t !== 'ang' && !(v > 0) && !(d.t === 'dist' && v === 0)) { toast('A dimension must be more than 0', true); inp.focus(); return; }
    const g = JSON.parse(JSON.stringify(f)), gd = g.dims.find(x => x.id === d.id);
    gd.v = d.t === 'ang' ? v : Math.abs(v); gd.x = txt;
    const r = solveNear(g.ents, g.cons, g.dims, dimMoves(g, gd), { iters: 100 });
    close();
    if (!r.ok) { toast('That dimension cannot hold with the others (over-constrained): left as it was', true); return; }
    checkpoint();
    carryRegions(app.doc, f.id, f.ents, g.ents);
    f.ents = g.ents; f.dims = g.dims;
    changed();
    // the part grown past the edge of the view: fitted again, so its other dimensions can still be reached
    regenDone().then(() => {
      if (app.sketch || V.fly) return;
      for (const o of V.parts.values()) { const b = o.userData.p.bbox; for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) { const q = project([b[x][0], b[y][1], b[z][2]]); if (q[0] < 0 || q[0] > V.w || q[1] < 0 || q[1] > V.h) { fit(); return; } } }
    });
  };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') commit(); else if (e.key === 'Escape') close(); });
  inp.addEventListener('blur', () => setTimeout(commit, 0));
  setTimeout(() => { inp.focus(); inp.select(); }, 0);
  return true;
}
let boxSel = null;
export function setBoxSel(b) { boxSel = b; drawOverlay(); }
function fieldHasPlane(ed, key) { const f = ed.f, fk = ed.field && ed.field.key; const v = fk ? f[fk] : null; return v && !Array.isArray(v) && ((key.std && v.std === key.std) || (key.feature && v.feature === key.feature)); }
function fieldHasRegion(ed, sk, pt) {
  const f = ed.f, near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-5;
  const R = regionsCached(app.doc.features.find(x => x.id === sk) || { id: sk, ents: [] });
  const regionOf = q => regionAt(R, q);
  const mine = regionOf(pt);
  if (f.sketch === sk && (f.regions || []).some(q => regionOf(q) === mine || near(q, pt))) return true;
  return (f.sections || []).some(s => s.sketch === sk && (s.regions || []).some(q => regionOf(q) === mine));
}
function strokeEnt(c, e, P) {
  c.beginPath();
  if (e.t === 'point') { const s = P(e.c); c.rect(s[0] - 2.5, s[1] - 2.5, 5, 5); c.stroke(); return; }
  entOutline(e, 4).forEach((p, i) => { const s = P(p); if (i) c.lineTo(s[0], s[1]); else c.moveTo(s[0], s[1]); });
  if (e.t === 'circle') c.closePath();
  c.stroke();
}
const GLYPH = { horizontal: 'H', vertical: 'V', parallel: '∥', perpendicular: '⊥', equal: '=', tangent: 'T', midpoint: 'M', concentric: '◎', symmetric: '⇋', fix: '⚓', oncurve: '⌒' };
function drawSketch(c, C) {
  const s = S(), f = s.f, E = new Map(f.ents.map(e => [e.id, e])), P = toScreen;
  const isSel = it => SK.sel.some(x => sameItem(x, it)), isHov = it => sameItem(SK.hover, it);
  // the origin and the sketch's axes
  const o = P([0, 0]), L = pxToMm(24);
  c.strokeStyle = C.con; c.lineWidth = 1; c.setLineDash([2, 3]);
  for (const ax of [[[-L, 0], [L, 0]], [[0, -L], [0, L]]]) { const a = P(ax[0]), b = P(ax[1]); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  c.setLineDash([]); c.fillStyle = C.ink; c.beginPath(); c.arc(o[0], o[1], 3, 0, 7); c.fill();
  // regions, faintly, so the closed ones show
  c.fillStyle = C.region + '0.10)';
  for (const r of regionsOf(f.ents)) { c.beginPath(); for (const ring of [r.outer, ...r.holes]) ring.forEach((p, i) => { const q = P(p); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.fill('evenodd'); }
  // shapes: ink when fully defined, blue while free; construction dashed
  for (const e of f.ents) {
    const it = { t: 'ent', id: e.id }, sel = isSel(it), hov = isHov(it);
    const axis = SK.tool === 'mirror' && SK.mirror && SK.mirror.line === e.id;
    c.strokeStyle = axis ? '#3aa860' : sel ? C.sel : hov ? C.hov : e.ref ? C.con : SK.defined.has(e.id) ? C.ink : C.free;
    c.lineWidth = sel || hov ? 2.6 : 1.7; c.setLineDash(e.k ? [6, 4] : []);
    strokeEnt(c, e, P);
  }
  c.setLineDash([]);
  // points
  for (const e of f.ents) for (const k of entKeys(e)) {
    const it = { t: 'pt', e: e.id, k }, q = P(hpt(E, it)), sel = isSel(it), hov = isHov(it);
    c.fillStyle = sel ? C.sel : hov ? C.hov : SK.defined.has(e.id) ? C.ink : C.free;
    const r = sel || hov ? 3.5 : k === 'c' && e.t !== 'point' ? 1.8 : 2.6;
    c.fillRect(q[0] - r, q[1] - r, 2 * r, 2 * r);
  }
  if (isSel({ t: 'pt', e: 'origin' }) || isHov({ t: 'pt', e: 'origin' })) { c.fillStyle = isSel({ t: 'pt', e: 'origin' }) ? C.sel : C.hov; c.fillRect(o[0] - 4, o[1] - 4, 8, 8); }
  if (SK.hover && SK.hover.t === 'mpt') { const q = P(SK.hover.c); c.strokeStyle = C.hov; c.lineWidth = 2; c.beginPath(); c.arc(q[0], q[1], 5, 0, 7); c.stroke(); }
  if (SK.hover && SK.hover.t === 'ment') { c.strokeStyle = C.hov; c.lineWidth = 2.6; strokeEnt(c, SK.hover.g, P); }
  SK.labels = [];
  // constraint glyphs, stacked by where they are
  const slots = new Map();
  const anchor = x => { const e = E.get(x.e); if (!e) return [0, 0]; if (x.k) return P(hpt(E, x)); if (e.t === 'line') return P([(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]); if (e.t === 'arc') { const a = (e.a0 + arcSweep(e) / 2) * Math.PI / 180; return P([e.c[0] + e.r * Math.cos(a), e.c[1] + e.r * Math.sin(a)]); } if (e.t === 'circle') return P([e.c[0] + e.r * 0.7071, e.c[1] + e.r * 0.7071]); return P(e.c); };
  c.font = 'bold 10px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const k of f.cons) {
    if (k.t === 'coincident') { const q = anchor(k.r[0]); c.strokeStyle = C.con; c.lineWidth = 1; c.beginPath(); c.arc(q[0], q[1], 4.5, 0, 7); c.stroke(); continue; }
    const g = GLYPH[k.t]; if (!g) continue;
    for (const r of k.t === 'symmetric' ? [k.r[2]] : k.r.slice(0, k.t === 'midpoint' || k.t === 'oncurve' ? 1 : 2)) {
      if (r.e === 'origin') continue;
      const q = anchor(r), key = Math.round(q[0] / 14) + ',' + Math.round(q[1] / 14), n = slots.get(key) || 0; slots.set(key, n + 1);
      const x = q[0] + 10 + n * 14, y = q[1] + 10, it = { t: 'con', id: k.id }, sel = isSel(it);
      c.fillStyle = sel ? C.sel : isHov(it) ? C.hov : C.glyphBg; c.fillRect(x - 6, y - 6, 12, 12);
      c.fillStyle = C.glyph; c.fillText(g, x, y + 0.5);
      SK.labels.push({ x0: x - 6, x1: x + 6, y0: y - 6, y1: y + 6, item: it });
    }
  }
  // dimensions: a leader and the value
  SK.dimPos = new Map();
  for (const d of f.dims) {
    const it = { t: 'dim', id: d.id }, sel = isSel(it), hov = isHov(it), at = dimPlace(d, E, P);
    if (!at) continue;
    SK.labels.push(Object.assign(drawDim(c, C, d, at, sel, hov), { item: it }));
    SK.dimPos.set(d.id, at.p);
  }
  // the shape being drawn, and what the pointer infers
  const dr = draftShapes();
  c.strokeStyle = C.sel; c.lineWidth = 1.5; c.setLineDash([4, 3]);
  for (const e of dr) strokeEnt(c, e, P);
  c.setLineDash([]);
  const sn = SK.snap;
  // its size as it is drawn, by the pointer
  if (dr.length && sn && SK.draft && !SK.sizeInput) {
    const p0 = SK.draft.pts[0], p1 = SK.draft.pts[1] || sn.p, t = SK.tool, mm = v => fmtNum(v, 2), far = Math.hypot(sn.p[0] - p0[0], sn.p[1] - p0[1]);
    const txt = t === 'line' ? mm(far) + ' mm' : t === 'mline' ? mm(2 * far) + ' mm' : t === 'circle3' && dr[0].t === 'circle' ? 'Ø' + mm(2 * dr[0].r) + ' mm' : t === 'rect' ? mm(Math.abs(sn.p[0] - p0[0])) + ' × ' + mm(Math.abs(sn.p[1] - p0[1])) + ' mm' : t === 'crect' ? mm(2 * Math.abs(sn.p[0] - p0[0])) + ' × ' + mm(2 * Math.abs(sn.p[1] - p0[1])) + ' mm' : t === 'circle' ? 'Ø' + mm(2 * far) + ' mm' : t === 'polygon' ? 'R' + mm(far) + ' mm'
      : (t === 'arc3' || t === 'tarc') && dr[0].t === 'arc' ? 'R' + mm(dr[0].r) + ' mm' : t === 'slot' && SK.draft.pts.length > 1 ? mm(Math.hypot(p1[0] - p0[0], p1[1] - p0[1])) + ' × ' + mm(2 * distToEnt({ t: 'line', a: p0, b: p1 }, sn.p)) + ' mm' : mm(far) + ' mm';
    const q = P(sn.p); c.font = '11px system-ui, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    const w = c.measureText(txt).width + 8;
    c.fillStyle = isDark() ? 'rgba(28,31,36,0.85)' : 'rgba(255,255,255,0.9)'; c.fillRect(q[0] + 12, q[1] + 10, w, 16);
    c.fillStyle = C.dim; c.fillText(txt, q[0] + 16, q[1] + 18.5);
    c.textAlign = 'center';
  }
  if (sn && SK.tool !== 'select') {
    const q = P(sn.p);
    c.fillStyle = C.sel; c.fillRect(q[0] - 3, q[1] - 3, 6, 6);
    // what it is level with: a dashed line to that point
    c.strokeStyle = C.sel; c.lineWidth = 1; c.setLineDash([3, 4]);
    for (const a of sn.al || []) { const z = P(a.p); c.beginPath(); c.moveTo(z[0], z[1]); c.lineTo(q[0], q[1]); c.stroke(); }
    c.setLineDash([]);
    if (sn.glyph) { c.fillStyle = C.glyphBg; c.fillRect(q[0] + 8, q[1] - 22, 14, 14); c.fillStyle = C.glyph; c.font = 'bold 10px system-ui, sans-serif'; c.fillText(sn.glyph, q[0] + 15, q[1] - 14.5); }
  }
  if (SK.dimPick) { const it = SK.dimPick, q = it.t === 'pt' ? P(hpt(E, it)) : SK.dimAt; c.strokeStyle = C.sel; c.lineWidth = 2; c.beginPath(); c.arc(q[0], q[1], 6, 0, 7); c.stroke(); }
}
/* the middle of what a dimension measures (its value's place is kept as an offset from here, when it has been dragged) */
function dimBase(d, E) {
  const e0 = E.get(d.r[0].e);
  if (d.t === 'len') return e0 ? [(e0.a[0] + e0.b[0]) / 2, (e0.a[1] + e0.b[1]) / 2] : null;
  if (d.t === 'rad' || d.t === 'dia') return e0 && e0.c ? e0.c.slice() : null;
  if (d.t === 'ang') { const l2 = E.get(d.r[1].e); return e0 && l2 ? [(e0.a[0] + e0.b[0] + l2.a[0] + l2.b[0]) / 4, (e0.a[1] + e0.b[1] + l2.a[1] + l2.b[1]) / 4] : null; }
  const a = hpt(E, d.r[0]);
  let b;
  if (d.t === 'pl') { const L = E.get(d.r[1].e); if (!L) return null; const dd = lineDir(L), L2 = dd[0] * dd[0] + dd[1] * dd[1] || 1, t = ((a[0] - L.a[0]) * dd[0] + (a[1] - L.a[1]) * dd[1]) / L2; b = [L.a[0] + dd[0] * t, L.a[1] + dd[1] * t]; }
  else b = hpt(E, d.r[1]);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}
/* where a dimension's value goes, and its leader lines (screen) */
function dimPlace(d, E, P) {
  const at = dimPlace0(d, E, P), base = at && d.off ? dimBase(d, E) : null;
  if (!base) return at;
  // dragged: the value where it was put; a length's line goes out to it, a radius's leader points at it
  const Ls = P([base[0] + d.off[0], base[1] + d.off[1]]);
  if (at.lines.length === 3) {
    const [A, B] = [at.lines[0][0], at.lines[1][0]], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, n = [-dy / L, dx / L], hgt = (Ls[0] - A[0]) * n[0] + (Ls[1] - A[1]) * n[1];
    const A2 = [A[0] + n[0] * hgt, A[1] + n[1] * hgt], B2 = [B[0] + n[0] * hgt, B[1] + n[1] * hgt];
    return { p: [Ls[0], Ls[1]], lines: [[A, A2], [B, B2], [A2, B2], [[(A2[0] + B2[0]) / 2, (A2[1] + B2[1]) / 2], [Ls[0], Ls[1]]]], arrows: [[A2, B2], [B2, A2]] };
  }
  if (d.t === 'ang') return angDim(d, E, P, [base[0] + d.off[0], base[1] + d.off[1]]) || at;
  if (d.t === 'rad' || d.t === 'dia') { const L = Math.hypot(d.off[0], d.off[1]); return roundDim(d, E.get(d.r[0].e), L > 1e-9 ? [d.off[0] / L, d.off[1] / L] : [1, 0], Ls, P); }
  return { p: [Ls[0], Ls[1]], lines: at.lines };
}
/* an angle: an arc about the point where the two lines cross, from one to the other, an arrow at each end, the
   value at its middle (at: where the value was dragged to, in the sketch, which sets the arc's radius) */
function angDim(d, E, P, at) {
  const l1 = E.get(d.r[0].e), l2 = E.get(d.r[1].e);
  if (!l1 || !l2 || l1.t !== 'line' || l2.t !== 'line') return null;
  const u = lineDir(l1), w = lineDir(l2), den = u[0] * w[1] - u[1] * w[0], mid = l => [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2], m1 = mid(l1), m2 = mid(l2);
  if (Math.abs(den) < 1e-9 * (Math.hypot(...u) * Math.hypot(...w) || 1)) { const a = P(m1), b = P(m2); return { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 10], lines: [[a, b]], arrows: [] }; }
  const t = ((l2.a[0] - l1.a[0]) * w[1] - (l2.a[1] - l1.a[1]) * w[0]) / den, X = [l1.a[0] + u[0] * t, l1.a[1] + u[1] * t];
  // each line's side of the crossing: towards its far end; the second turned round if that is the angle the value is
  const farOf = l => (Math.hypot(l.a[0] - X[0], l.a[1] - X[1]) > Math.hypot(l.b[0] - X[0], l.b[1] - X[1]) ? l.a : l.b), f1 = farOf(l1), f2 = farOf(l2);
  const a1 = Math.atan2(f1[1] - X[1], f1[0] - X[0]);
  let a2 = Math.atan2(f2[1] - X[1], f2[0] - X[0]);
  const between = (p, q) => { let x = Math.abs(p - q) % (2 * Math.PI); if (x > Math.PI) x = 2 * Math.PI - x; return x; };
  if (Math.abs(between(a1, a2 + Math.PI) * 180 / Math.PI - d.v) < Math.abs(between(a1, a2) * 180 / Math.PI - d.v)) a2 += Math.PI;
  let sweep = (a2 - a1) % (2 * Math.PI); if (sweep > Math.PI) sweep -= 2 * Math.PI; if (sweep < -Math.PI) sweep += 2 * Math.PI;
  const reach = Math.min(Math.hypot(f1[0] - X[0], f1[1] - X[1]), Math.hypot(f2[0] - X[0], f2[1] - X[1]));
  const R = at ? Math.max(pxToMm(12), Math.hypot(at[0] - X[0], at[1] - X[1])) : Math.max(pxToMm(26), Math.min(reach * 0.45, pxToMm(70)));
  const pt = a => P([X[0] + R * Math.cos(a), X[1] + R * Math.sin(a)]), n = 24, pts = Array.from({ length: n + 1 }, (_, i) => pt(a1 + sweep * i / n)), lines = [];
  for (let i = 0; i < n; i++) lines.push([pts[i], pts[i + 1]]);
  // a line that stops short of the arc is carried out to it, faintly, by the same stroke
  for (const [f, a] of [[f1, a1], [f2, a2]]) if (Math.hypot(f[0] - X[0], f[1] - X[1]) < R) lines.push([P(f), pt(a)]);
  const lab = P([X[0] + (R + pxToMm(16)) * Math.cos(a1 + sweep / 2), X[1] + (R + pxToMm(16)) * Math.sin(a1 + sweep / 2)]);
  return { p: [lab[0], lab[1]], lines, arrows: [[pts[0], pts[2]], [pts[n], pts[n - 2]]] };
}
function roundDim(d, e0, u, Ls, P) {
  const cs = P(e0.c), B = P([e0.c[0] + e0.r * u[0], e0.c[1] + e0.r * u[1]]), A = d.t === 'dia' ? P([e0.c[0] - e0.r * u[0], e0.c[1] - e0.r * u[1]]) : cs;
  const dx = B[0] - cs[0], dy = B[1] - cs[1], L = Math.hypot(dx, dy) || 1, out = Ls || [B[0] + dx / L * 30, B[1] + dy / L * 30];
  return { p: [out[0], out[1]], lines: [[A, B], [B, [out[0], out[1]]]], arrows: d.t === 'dia' ? [[A, B], [B, A]] : [[B, A]] };
}
function dimPlace0(d, E, P) {
  const e0 = E.get(d.r[0].e);
  // the side of a line a dimension goes: away from the middle of the sketch, so it sits outside the shape
  let mid = E.mid;
  if (!mid) { let n = 0; const m = [0, 0]; for (const e of E.values()) for (const q of e.t === 'line' ? [e.a, e.b] : [e.c]) { m[0] += q[0]; m[1] += q[1]; n++; } mid = E.mid = n ? [m[0] / n, m[1] / n] : [0, 0]; }
  const out = (a, b, n) => { const c = P(mid), s = (((a[0] + b[0]) / 2 - c[0]) * n[0] + ((a[1] + b[1]) / 2 - c[1]) * n[1]) < -1e-6 ? -1 : 1; return [n[0] * s, n[1] * s]; };
  if (d.t === 'len' && e0) { const a = P(e0.a), b = P(e0.b), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, n = out(a, b, [-dy / L * 24, dx / L * 24]); const A = [a[0] + n[0], a[1] + n[1]], B = [b[0] + n[0], b[1] + n[1]]; return { p: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], lines: [[a, A], [b, B], [A, B]] }; }
  // a diameter: a line right across the circle through its centre, an arrow at each side, the value beyond one; a
  // radius: from the centre to the curve, one arrow (circles about one centre each at their own angle, clear of each other)
  if ((d.t === 'rad' || d.t === 'dia') && e0 && e0.c) { let turn = 0; if (e0.t === 'circle') for (const o of E.values()) { if (o === e0) break; if (o.t === 'circle' && Math.hypot(o.c[0] - e0.c[0], o.c[1] - e0.c[1]) < 1e-6) turn++; } const ang = e0.t === 'arc' ? (e0.a0 + arcSweep(e0) / 2) * Math.PI / 180 : Math.PI / 4 - turn * Math.PI / 6; return roundDim(d, e0, [Math.cos(ang), Math.sin(ang)], null, P); }
  if (d.t === 'dist' || d.t === 'pl') {
    const a = hpt(E, d.r[0]);
    let b;
    if (d.t === 'pl') { const L = E.get(d.r[1].e); if (!L) return null; const dd = lineDir(L), L2 = dd[0] * dd[0] + dd[1] * dd[1] || 1, t = ((a[0] - L.a[0]) * dd[0] + (a[1] - L.a[1]) * dd[1]) / L2; b = [L.a[0] + dd[0] * t, L.a[1] + dd[1] * t]; }
    else b = hpt(E, d.r[1]);
    if (d.dir === 'h') b = [b[0], a[1]]; else if (d.dir === 'v') b = [a[0], b[1]];
    const A = P(a), B = P(b), dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, n = out(A, B, [-dy / L * 24, dx / L * 24]);
    const A2 = [A[0] + n[0], A[1] + n[1]], B2 = [B[0] + n[0], B[1] + n[1]];
    return { p: [(A2[0] + B2[0]) / 2, (A2[1] + B2[1]) / 2], lines: [[A, A2], [B, B2], [A2, B2]] };
  }
  if (d.t === 'ang') return angDim(d, E, P, null);
  return null;
}
/* ---------- Mirror's panel: what to mirror, and in which line; nothing is made until Mirror is pressed ---------- */
function mirrorApply() {
  const M = SK.mirror, ids = SK.sel.filter(x => x.t === 'ent' && x.id !== (M && M.line)).map(x => x.id);
  if (!M || !ids.length) { toast('Click the shapes to mirror first'); if (M) { M.field = 'shapes'; mirrorPanel(); } return; }
  if (!M.line) { toast('Now click the line to mirror them in'); M.field = 'line'; mirrorPanel(); return; }
  keep(); mirrorEnts(S().f, ids, M.line); SK.sel = []; resolve();
  setTool('select');
}
export function mirrorPanel() {
  const old = document.getElementById('skPanel'), on = app.sketch && SK.tool === 'mirror' && SK.mirror;
  if (!on) { if (old) old.remove(); return; }
  const M = SK.mirror, n = SK.sel.filter(x => x.t === 'ent' && x.id !== M.line).length;
  const box = (key, label, text, empty) => h('div', { class: 'cad-frow sel' }, h('label', null, label), h('div', { class: 'cad-selwrap' },
    h('div', { class: 'cad-selbox' + (M.field === key ? ' on' : '') + (empty ? ' empty' : ''), role: 'button', tabindex: '0', 'data-mirror': key, 'aria-pressed': String(M.field === key), onclick: () => { M.field = key; mirrorPanel(); } }, text),
    empty ? null : h('button', { type: 'button', class: 'cad-selclear', title: 'Clear', 'aria-label': 'Clear ' + label, onclick: () => { if (key === 'line') M.line = null; else SK.sel = []; M.field = key; mirrorPanel(); drawOverlay(); } }, '×')));
  const panel = h('div', { class: 'cad-dialog', id: 'skPanel', role: 'group', 'aria-label': 'Mirror' },
    h('div', { class: 'cad-fhead' }, h('span', { class: 'cad-fkind', 'data-icon': 'mirror' }, 'Mirror')),
    h('div', { class: 'cad-fbody' },
      box('shapes', 'Shapes to mirror', n ? n + (n === 1 ? ' shape' : ' shapes') : M.field === 'shapes' ? 'Click shapes in the sketch, or drag a box round them' : 'Nothing chosen', !n),
      box('line', 'Mirror line', M.line ? 'A line of the sketch' : M.field === 'line' ? 'Click the line to mirror in' : 'Nothing chosen', !M.line)),
    h('div', { class: 'cad-factions' }, h('button', { type: 'button', class: 'rt-btn', id: 'mirrorCancel', onclick: () => { SK.sel = []; setTool('select'); } }, 'Cancel'), h('button', { type: 'button', class: 'rt-btn primary', id: 'mirrorOk', disabled: n && M.line ? null : true, onclick: mirrorApply }, '✓ Mirror')));
  if (old) old.replaceWith(panel); else document.getElementById('stage').append(panel);
  emit('icons', panel);
}
/* ---------- the sketch's bar of tools ---------- */
const SK_TOOLS = [['select', 'Select (S)', 'select'], ['line', 'Line (L)', 'line'], ['cline', 'Centre line: a construction line', 'construct'], ['mline', 'Midpoint line: its middle, then an end', 'mline'], ['rect', 'Corner rectangle (R)', 'rect'], ['crect', 'Centre rectangle', 'crect'], ['circle', 'Centre circle (C)', 'circle'], ['circle3', '3-point circle', 'circle3'], ['arc3', '3-point arc (A)', 'arc3'], ['tarc', 'Tangent arc (T)', 'tarc'], ['slot', 'Slot', 'slot'], ['polygon', 'Polygon (G)', 'polygon'], ['point', 'Point (P)', 'point'],
  'sep', ['construct', 'Construction (Q)', 'construct'], ['use', 'Use model edges (U)', 'use'], ['trim', 'Trim (M)', 'trim'], ['fillet', 'Sketch fillet', 'fillet'], ['offset', 'Offset (O)', 'offset'], ['mirror', 'Mirror', 'mirror'], 'sep', ['dim', 'Dimension (D)', 'dim']];
/* the tools that share a button: it shows the one last used, and the arrow beside it lists them all */
const SK_GROUPS = [['line', 'cline', 'mline'], ['rect', 'crect'], ['circle', 'circle3'], ['arc3', 'tarc']];
const SK_CONS = [['coincident', 'Coincident', '●'], ['horizontal', 'Horizontal', 'H'], ['vertical', 'Vertical', 'V'], ['parallel', 'Parallel', '∥'], ['perpendicular', 'Perpendicular', '⊥'], ['tangent', 'Tangent', 'T'], ['equal', 'Equal', '='], ['midpoint', 'Midpoint', 'M'], ['concentric', 'Concentric', '◎'], ['symmetric', 'Symmetric', '⇋'], ['fix', 'Fix', '⚓']];
export function sketchBar() {
  const bar = document.getElementById('sketchBar');
  if (!bar) return;
  bar.hidden = !app.sketch;
  document.getElementById('featureBar').hidden = !!app.sketch;
  mirrorPanel();
  if (!app.sketch) return;
  const btn = (id, title, icon, on) => h('button', { type: 'button', class: 'rt-btn rt-icon quiet cad-tool' + (on ? ' on' : ''), 'data-sktool': id, 'data-icon': icon, title, 'aria-label': title, 'aria-pressed': String(!!on), onclick: () => setTool(id) });
  const num = (label, key, title) => h('label', { class: 'cad-skin', title }, label, h('input', { type: 'text', value: String(SK[key]), size: '4', 'data-skopt': key, onchange: e => { SK[key] = key === 'polySides' ? Math.max(3, Math.min(64, parseInt(e.target.value, 10) || 6)) : e.target.value; } }));
  bar.replaceChildren(...[h('span', { class: 'cad-skname' }, app.sketch.f.name),
    ...SK_TOOLS.map(t => {
      if (t === 'sep') return h('span', { class: 'rt-qsep' });
      const g = SK_GROUPS.find(x => x.includes(t[0])), now = SK.lineK ? 'cline' : SK.tool;
      if (!g) return btn(t[0], t[1], t[2], SK.tool === t[0] || (t[0] === 'construct' && SK.constr));
      if (t[0] !== g[0]) return null;
      // the group's button is the tool last used of it; the arrow opens the rest
      const cur = SK_TOOLS.find(x => x[0] === (g.includes(now) ? now : SK.variant[g[0]] || g[0])), menu = h('div', { class: 'rt-menu rt-imenu cad-toolmenu', role: 'menu', hidden: '', id: 'skMenu-' + g[0] },
        ...g.map(id => { const x = SK_TOOLS.find(y => y[0] === id); return h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(now === id), 'data-skpick': id, 'data-icon': x[2], onclick: () => setTool(id) }, x[1]); }));
      const caret = h('button', { type: 'button', class: 'rt-btn quiet cad-caret', 'data-skgroup': g[0], title: 'More ' + ({ line: 'lines', rect: 'rectangles', circle: 'circles', arc3: 'arcs' })[g[0]], 'aria-label': 'More ' + ({ line: 'lines', rect: 'rectangles', circle: 'circles', arc3: 'arcs' })[g[0]], 'aria-haspopup': 'true', 'aria-expanded': 'false',
        onclick: e => { e.stopPropagation(); const open = menu.hidden; for (const m of bar.querySelectorAll('.cad-toolmenu')) m.hidden = true; menu.hidden = !open; caret.setAttribute('aria-expanded', String(open)); } }, '▾');
      return h('span', { class: 'rt-more cad-toolgroup' }, btn(cur[0], cur[1], cur[2], g.includes(now)), caret, menu);
    }),
    h('span', { class: 'rt-qsep' }),
    ...SK_CONS.map(([t, title, g]) => h('button', { type: 'button', class: 'rt-btn quiet cad-con', 'data-con': t, title: title + ' (on what is selected)', 'aria-label': title, onclick: () => addConstraint(t) }, g)),
    h('span', { class: 'rt-qsep' }),
    SK.tool === 'polygon' ? num('Sides ', 'polySides', 'The polygon’s sides') : null, SK.tool === 'fillet' ? num('R ', 'filletR', 'The fillet’s radius') : null, SK.tool === 'select' || SK.tool === 'offset' ? num('Offset ', 'offsetD', 'The distance Offset copies shapes by (negative: the other side)') : null,
    h('span', { class: 'cad-grow' }),
    h('button', { type: 'button', class: 'rt-btn', id: 'sketchCancel', onclick: cancelSketch }, 'Cancel'),
    h('button', { type: 'button', class: 'rt-btn primary', id: 'sketchOk', onclick: finishSketch, title: 'Finish the sketch (Enter)' }, '✓ Finish')].filter(Boolean));
  for (const n of bar.querySelectorAll('[data-icon]')) if (!n.querySelector('svg')) { /* icons drawn by the caller */ }
  emit('icons', bar);
}
export function wireSketcher() {
  on('view', drawOverlay); on('model', drawOverlay); on('sel', drawOverlay); on('hover', drawOverlay); on('theme', drawOverlay); on('editing', drawOverlay);
}

