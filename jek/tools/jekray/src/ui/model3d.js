import { deg, nextName, project, selectOne } from '../state/project.js';
import { getEl, normElement } from '../state/elements.js';
import { lastTrace, setZ, zOf } from '../engines/trace.js';
import { meshCache, meshHullCache, meshOf, meshTris } from '../core/stl.js';
import {
  HOLE_SIZES, entEnds, entMap, entOutline, featPreview, manifoldLib, manifoldNow, mirrorMap, modelId, modelToWorld, moveMap,
  newModelPart, normEnt, normModel, normPlane, parseLength, planeNormal, planeToModel, planeToWorld, partRot, partRotInv, rebuildPart, sketchLoops, stlBytes,
  turnMap, worldToModel
} from '../core/model.js';
import { definedEnts, dimMeasure, entKeys, hpt, inRegion, normCons, normDims, sketchId, solveSketch } from '../core/sketch.js';
import { sketchChosen } from '../core/model.js';
import { V3D } from './view3d.js';
import { getCss } from './render.js';
import { renderPanel } from './panel.js';
import { h } from './dom.js';
import { changed, downloadFile, toast } from './actions.js';
import { checkpoint } from './tabs.js';
import { accountGate } from './pro.js';

/* ==========================================================================
   Model: parts made in the 3D view, as in a CAD program
   ==========================================================================
   The 3D view's Model button: pick a flat plane (the table, a part's flat face, the beam's plane,
   a plane of the bench's own, any of them offset), sketch on it seen square on (lines, arcs,
   rectangles, circles, slots, polygons, holes of the usual sizes; snapping to the grid, the
   shapes' points, the table's holes and where the light crosses the plane; sizes typed as they
   are drawn), then extrude or revolve the sketch into a part of its own, or add it to a modelled
   part or cut it from one. The part is an STL object that keeps its features (core/model.js), so
   it traces as a beam block; its panel changes them, and it is made again. */

const MD = {
  on: false, stage: 'off',                      // 'plane' (choosing one), 'sketch', 'extrude', 'revolve'
  plane: null, src: null, offset: 0,            // the sketch's plane on the bench ({ o, x, y }), what it was taken from, and how far it is moved off it
  ents: [], undo: [], redo: [],                 // the sketch's shapes, and its own undo
  tool: 'line', draft: [], draftSnaps: [], cursor: null, snap: null, sel: new Set(), constr: false,
  cons: [], dims: [], selP: new Set(), selC: new Set(), selD: new Set(), defined: new Set(), pickCon: null, dimPick: [], dimEdit: null, filletR: 2, tanFrom: null, tanDir: null,
  grid: 1, holeStd: 'M6 clearance', holeD: 6.6, polyN: 6,
  edit: null,                                   // { id, sk }: a part's own sketch, opened from its panel
  ex: { d: 10, both: false, through: false, op: 'new', target: null, axis: null, deg: 360 },
  typed: {}, hover: null, pickFor: null, group: null, prev: null, card: null, tip: null, btn: null, edges: null, beam: null,
  dragArrow: null, dragSel: null,
};
const kit = () => V3D.kit();
const LIFT = 0.02;                              // mm: the sketch drawn this far off its plane, over the face it is on

/* ---------- the button, and starting and stopping ---------- */
// what to do once the tools are put away (the rail: back to the free-space palette)
let modelExit = () => {}, modelEnter = () => startModel();
export function setModelExit(exit, enter, rail) { modelExit = exit; if (enter) modelEnter = enter; if (rail) modelRailSync = rail; }
let modelRailSync = () => {};
/* the features, down the rail under the Model palette's button (ui/rail.js draws them): Sketch, Extrude, Revolve */
export function modelRailItems() {
  const st = MD.stage, on = MD.on, loops = on && st !== 'plane' ? sketchLoops(MD.ents).loops : [], can = on && !!loops.length && !MD.edit;
  return [
    { k: 'sketch', name: 'Sketch', title: st === 'plane' ? 'Sketch: click a flat face, or pick a plane in the bar' : st === 'sketch' ? 'Sketch: its tools in the bar' : 'Sketch: back to the sketch', on: on && (st === 'plane' || st === 'sketch'),
      run: () => { if (st === 'extrude' || st === 'revolve') setStage('sketch'); else if (st === 'plane') toast('Click a flat face to sketch on, or pick a plane from the bar'); }, icon: icon('sketch') },
    { k: 'extrude', name: 'Extrude', title: MD.edit ? 'Extrude: finish editing the sketch first' : can ? 'Extrude the sketch\u2019s regions' : 'Extrude: sketch a closed shape first', on: st === 'extrude', disabled: !can, run: startExtrude, icon: icon('extrude') },
    { k: 'revolve', name: 'Revolve', title: MD.edit ? 'Revolve: finish editing the sketch first' : can ? 'Revolve the sketch about one of its lines' : 'Revolve: sketch a closed shape first', on: st === 'revolve', disabled: !can, run: startRevolve, icon: icon('revolve') },
  ];
}
export function wireModel3d() { /* the tools are opened from the rail's palettes (Model, in 3D) */ }
export function startModel() {
  const K = kit(); if (!K) return false;
  if (MD.on) return true;
  MD.on = true;
  manifoldLib().catch(() => toast('The modelling library could not be loaded', true));
  if (!MD.group) { MD.group = new K.T.Group(); MD.group.matrixAutoUpdate = false; }
  if (!MD.group.parent) K.R.scene.add(MD.group);
  selectOne(null); renderPanel();
  V3D.setTool(TOOL);
  setStage('plane');
  return true;
}
export function stopModel() {
  const K = kit();
  if (!MD.on) return;
  MD.on = false; MD.stage = 'off'; MD.edit = null; MD.draft = []; MD.draftSnaps = []; MD.ents = []; MD.sel.clear();
  if (K && MD.group) { clearGroup(); dropPrev(); K.R.scene.remove(MD.group); }
  if (MD.card) { MD.card.remove(); MD.card = null; }
  if (MD.tip) { MD.tip.remove(); MD.tip = null; }
  if (MD.ann) { MD.ann.remove(); MD.ann = null; MD.annKey = null; }
  closeMdMenu(); if (K) K.D.stage.classList.remove('rt-mdlon');
  V3D.setTool(null);
  if (K) K.need();
  modelExit();
}
function setStage(s) {
  const back = s === 'sketch' && (MD.stage === 'extrude' || MD.stage === 'revolve');
  MD.stage = s; MD.draft = []; MD.draftSnaps = []; MD.typed = {}; MD.pickFor = null;
  // sketching, the view is flat (orthographic) and square on, as a CAD program's sketch is; else as it was
  const K0 = kit(); if (K0 && K0.setFlat) K0.setFlat(s === 'sketch');
  if (s !== 'extrude' && s !== 'revolve') { dropPrev(); MD.prevErr = ''; }
  if (s === 'sketch' && !MD.tool) MD.tool = 'line';
  // back from the extrude (where the view may have turned): square on again, as the sketch is kept
  if (back && K0 && MD.plane) { const P = sketchPlane(), n = planeNormal(P), c = fromUV(P, toUV(P, K0.R.target.toArray())), dist = Math.max(120, K0.R.camera.position.distanceTo(K0.R.target));
    K0.go(mdV3(K0, [0, 1, 2].map(i => c[i] + n[i] * dist - P.y[i] * dist * 1e-4)), mdV3(K0, c), true); }
  drawCard(); redraw();
  const K = kit(); if (K) K.hint();
}

/* ---------- planes ---------- */
const mdV3 = (K, a) => new K.T.Vector3(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const L = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / L, a[1] / L, a[2] / L]; };
/* a plane through point p with normal n, its axes as a sketch wants them: on a level face x and y as the bench's (so the
   picture is the bench's from above), on an upright one x across and y up; its origin where the origin (or the part's
   own) meets it, so its grid lines up with the bench's or the part's */
export function planeAt(p, n, el) {
  if (el && el.model) {
    // in the part's own frame, then onto the bench: so a part turned keeps its sketches square to it
    const nm = unit(partRotInv(el, n)), pm = worldToModel(el, p);
    const P = axesFor(pm, nm);
    return planeToWorld(el, P);
  }
  return axesFor(p, n);
}
function axesFor(p, n) {
  n = unit(n);
  let x, y;
  if (Math.abs(n[2]) > 0.999) { x = [1, 0, 0]; y = n[2] > 0 ? [0, 1, 0] : [0, -1, 0]; }
  else { y = unit([-n[0] * n[2], -n[1] * n[2], 1 - n[2] * n[2]]); x = crs(y, n); }
  const r6 = v => Math.round(v * 1e6) / 1e6, o = [r6(n[0] * dot(n, p)), r6(n[1] * dot(n, p)), r6(n[2] * dot(n, p))];
  return normPlane({ o, x, y });
}
// the plane the sketch is on, moved off by its offset
const sketchPlane = () => { const P = MD.plane, n = planeNormal(P); return { o: [P.o[0] + n[0] * MD.offset, P.o[1] + n[1] * MD.offset, P.o[2] + n[2] * MD.offset], x: P.x, y: P.y }; };
const toUV = (P, p) => { const d = [p[0] - P.o[0], p[1] - P.o[1], p[2] - P.o[2]]; return [dot(d, P.x), dot(d, P.y)]; };
const fromUV = (P, q) => [P.o[0] + P.x[0] * q[0] + P.y[0] * q[1], P.o[1] + P.x[1] * q[0] + P.y[1] * q[1], P.o[2] + P.x[2] * q[0] + P.y[2] * q[1]];
/* what is under the pointer to sketch on: a modelled or STL part's flat face, the table, else the beam's plane */
function planeUnder(e) {
  const K = kit(), hit = K.pick(e);
  if (!hit) return null;
  const p = hit.point.toArray();
  if (hit.object && hit.face) {
    const id = hit.object.userData.id, el = id && getEl(id);
    if (el && el.type !== 'stl') return { plane: axesFor(p, [0, 0, 1]), p, src: { kind: 'beam' }, label: 'The plane level through ' + el.name };
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).toArray();
    if (el) return { plane: planeAt(p, n, el), p, src: { kind: 'face', id: el.id }, label: 'A face of ' + el.name };
    return { plane: axesFor(p, n), p, src: { kind: 'table' }, label: Math.abs(n[2]) > 0.99 ? 'The table top' : 'The table’s side' };
  }
  return { plane: axesFor(p, [0, 0, 1]), p, src: { kind: 'beam' }, label: 'The beam’s plane (' + (+p[2].toFixed(2)) + ' mm up)' };
}
/* a plane of the bench's own, through the point the view looks at: 'table', 'beam', 'front' (x and up), 'side' (y and up) */
function namedPlane(k) {
  const K = kit(), t = K.R.target.toArray();
  if (k === 'table') return { plane: axesFor([t[0], t[1], 0], [0, 0, 1]), p: [t[0], t[1], 0], src: { kind: 'table' } };
  if (k === 'beam') return { plane: axesFor([t[0], t[1], K.BEAM_H], [0, 0, 1]), p: [t[0], t[1], K.BEAM_H], src: { kind: 'beam' } };
  if (k === 'front') return { plane: axesFor(t, [0, -1, 0]), p: t, src: { kind: 'ref' } };
  return { plane: axesFor(t, [1, 0, 0]), p: t, src: { kind: 'ref' } };
}
/* into the sketch: the camera square on to the plane, the shapes there are and the snaps worked out */
function enterSketch(pk, ents, edit, cons, dims) {
  const K = kit();
  MD.plane = pk.plane; MD.src = pk.src; MD.ents = JSON.parse(JSON.stringify(ents || [])); MD.undo = []; MD.redo = []; MD.sel.clear(); MD.selP.clear(); MD.selC.clear(); MD.selD.clear();
  MD.cons = normCons(JSON.parse(JSON.stringify(cons || [])), MD.ents); MD.dims = normDims(JSON.parse(JSON.stringify(dims || [])), MD.ents); MD.pickCon = null; MD.dimPick = []; MD.dimEdit = null; MD.draftSnaps = [];
  if (MD.cons.length || MD.dims.length) solveNow();
  workDefined();
  MD.edit = edit || null; if (!edit) MD.offset = MD.offset || 0;
  MD.tool = 'line';
  const fe = MD.src && MD.src.kind === 'face' && getEl(MD.src.id);
  MD.ex = { d: 10, both: false, through: false, op: fe && fe.model ? 'add' : 'new', target: fe && fe.model ? fe.id : null, axis: null, deg: 360, regions: null };
  workSnaps();
  // the camera looking square on, from as far as it is now (at least 120 mm), the plane's y up the screen
  const P = sketchPlane(), n = planeNormal(P), c = fromUV(P, toUV(P, pk.p || P.o));
  const dist = Math.max(120, K.R.camera.position.distanceTo(K.R.target));
  const eye = [c[0] + n[0] * dist - P.y[0] * dist * 1e-4, c[1] + n[1] * dist - P.y[1] * dist * 1e-4, c[2] + n[2] * dist - P.y[2] * dist * 1e-4];
  K.go(mdV3(K, eye), mdV3(K, c), true);
  setStage('sketch');
}

/* ---------- snaps: the light crossing the plane, the table's holes, the edges of parts ---------- */
function workSnaps() {
  const P = sketchPlane(), n = planeNormal(P), beam = [], chief = [];
  for (const r of (lastTrace && lastTrace.rays) || []) {
    if (r.bench !== project.tab || !r.pts || r.pts.length < 4) continue;
    const p = r.pts, zs = r.zs, Z = i => (zs ? zs[i] : 75);
    for (let i = 2; i < p.length; i += 2) {
      const a = [p[i - 2], p[i - 1], Z((i >> 1) - 1)], b = [p[i], p[i + 1], Z(i >> 1)];
      const da = dot([a[0] - P.o[0], a[1] - P.o[1], a[2] - P.o[2]], n), db = dot([b[0] - P.o[0], b[1] - P.o[1], b[2] - P.o[2]], n);
      if ((da > 0) === (db > 0) || da === db) continue;
      const t = da / (da - db), q = toUV(P, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      (r.chief ? chief : beam).push(q);
      if (beam.length + chief.length > 4000) break;
    }
  }
  // the beam's middle where it crosses: its chief rays', else the middle of all its rays' crossings
  const mids = chief.length ? chief.slice(0, 50) : beam.length ? [[beam.reduce((s, q) => s + q[0], 0) / beam.length, beam.reduce((s, q) => s + q[1], 0) / beam.length]] : [];
  MD.beam = { pts: beam, mids };
  // the table's holes, when the sketch is on its top: every hole's pitch (25 mm), from the bench's origin
  MD.holes = Math.abs(n[2]) > 0.999 && Math.abs(P.o[2]) < 1e-6;
  // the parts' edges (where their faces meet at more than 25 degrees), on the bench, for Use edges
  const K = kit(), E = [];
  for (const el of project.elements) {
    if (el.bench !== project.tab || el.type !== 'stl' || !el.mesh) continue;
    const M = meshOf(el); if (!M || !M.n) continue;
    const geo = new K.T.BufferGeometry(); geo.setAttribute('position', new K.T.BufferAttribute(M.T, 3));
    const eg = new K.T.EdgesGeometry(geo, 25), A = eg.attributes.position.array, sc = el.scale || 1;
    for (let i = 0; i < A.length && E.length < 60000; i += 6) {
      const w = j => { const r = partRot(el, [A[j] * sc, A[j + 1] * sc, A[j + 2] * sc]); return [r[0] + el.x, r[1] + el.y, r[2] + zOf(el)]; };
      E.push([w(i), w(i + 3), el.id]);
    }
    geo.dispose(); eg.dispose();
  }
  MD.edges = E;
}
// mm across a pixel of the screen, at a point of the plane
function mmPerPx(K, q) {
  const p = fromUV(sketchPlane(), q || [0, 0]), d = K.R.camera.position.distanceTo(mdV3(K, p));
  return 2 * d * Math.tan(K.R.camera.fov * deg / 2) / Math.max(1, K.R.h);
}
function uvAt(e) {
  const K = kit(), P = sketchPlane(), n = planeNormal(P), N = K.ndc(e), rc = new K.T.Raycaster(); rc.setFromCamera(N, K.R.camera);
  const out = new K.T.Vector3();
  if (!rc.ray.intersectPlane(new K.T.Plane(mdV3(K, n), -dot(n, P.o)), out)) return null;
  return toUV(P, out.toArray());
}
/* the points a shape offers to snap to */
/* the points a shape offers to snap to: [point, what it is, what a point snapped there is constrained to] */
function entPts(e) {
  const H = k => ({ e: e.id, k }), C = { curve: e.id };
  switch (e.t) {
    case 'line': return [[e.a, 'end', H('a')], [e.b, 'end', H('b')], [[(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], 'middle', { mid: e.id }]];
    case 'arc': { const [s0, t] = entEnds(e), m = (e.a0 + ((e.a1 - e.a0 + 360) % 360) / 2) * deg; return [[s0, 'end', H('p0')], [t, 'end', H('p1')], [e.c, 'centre', H('c')], [[e.c[0] + e.r * Math.cos(m), e.c[1] + e.r * Math.sin(m)], 'on the arc', C]]; }
    case 'circle': case 'hole': { const r = e.t === 'hole' ? e.d / 2 : e.r; return [[e.c, 'centre', H('c')], ...[0, 1, 2, 3].map(k => [[e.c[0] + r * Math.cos(k * Math.PI / 2), e.c[1] + r * Math.sin(k * Math.PI / 2)], 'quadrant', C])]; }
    case 'rect': { const P = entOutline(Object.assign({}, e, { rad: 0 })); return [[e.c, 'centre', H('c')], ...P.map((p, i) => [p, 'corner', H('p' + i)]), ...P.map((p, i) => [[(p[0] + P[(i + 1) % 4][0]) / 2, (p[1] + P[(i + 1) % 4][1]) / 2], 'middle', null])]; }
    case 'slot': return [[e.a, 'centre', H('a')], [e.b, 'centre', H('b')]];
    case 'poly': return [[e.c, 'centre', H('c')], ...entOutline(e).map(p => [p, 'corner', null])];
    case 'point': return [[e.c, 'point', H('c')]];
  }
  return [];
}
// the nearest point on a line, circle or arc (its foot), or null
function footOn(e, q) {
  if (e.t === 'line') { const d = [e.b[0] - e.a[0], e.b[1] - e.a[1]], L2 = d[0] * d[0] + d[1] * d[1]; if (!L2) return null; const t = ((q[0] - e.a[0]) * d[0] + (q[1] - e.a[1]) * d[1]) / L2; if (t < 0 || t > 1) return null; return [e.a[0] + d[0] * t, e.a[1] + d[1] * t]; }
  if (e.t === 'circle' || e.t === 'hole' || e.t === 'arc') {
    const r = e.t === 'hole' ? e.d / 2 : e.r, a = Math.atan2(q[1] - e.c[1], q[0] - e.c[0]);
    if (e.t === 'arc') { const rel = ((a / deg - e.a0) % 360 + 360) % 360, sw = ((e.a1 - e.a0) % 360 + 360) % 360 || 360; if (rel > sw) return null; }
    return [e.c[0] + r * Math.cos(a), e.c[1] + r * Math.sin(a)];
  }
  return null;
}
// the point a new one lines up with, level or upright: the last of a line's, a slot's or an arc's (a corner of a rectangle, a
// circle's edge or a polygon's corner lined up with its first point would give it no size)
const alignFrom = () => (/^(line|slot|arc)$/.test(MD.tool) ? MD.draft[MD.draft.length - 1] : undefined);
function snapAt(e, from) {
  const raw = uvAt(e); if (!raw) return null;
  const K = kit(), tol = 10 * mmPerPx(K, raw);
  if (e.altKey) return { p: raw, kind: 'free' };
  let best = null, bd = tol;
  const consider = (p, kind, ref) => { const d = Math.hypot(p[0] - raw[0], p[1] - raw[1]); if (d < bd) { bd = d; best = { p: p.slice(), kind, ref: ref || null }; } };
  for (const s of MD.ents) for (const [p, k, r] of entPts(s)) consider(p, k, r);
  // (of the shape being drawn, only a polyline's first point: to close it on; its others would make it nothing)
  if (MD.tool === 'line' && MD.chain0 && MD.draft.length) consider(MD.chain0, 'its start', MD.chainRef || null);
  consider([0, 0], 'origin', { e: 'origin' });
  if (MD.beam) { for (const p of MD.beam.mids) consider(p, 'the beam’s middle'); if (!best) for (const p of MD.beam.pts) consider(p, 'a ray'); }
  // the table's holes: for what goes on one (a hole, or a circle's or polygon's centre)
  if (MD.holes && !MD.draft.length && /^(hole|circle|poly)$/.test(MD.tool)) { const P = sketchPlane(), w = fromUV(P, raw), hx = Math.round(w[0] / 25) * 25, hy = Math.round(w[1] / 25) * 25; consider(toUV(P, [hx, hy, 0]), 'a table hole'); }
  if (best) return best;
  // on a curve: its nearest point on it, constrained to it
  for (const s of MD.ents) { if (s.k && s.t !== 'line') continue; const f = footOn(s, raw); if (f) consider(f, 'on the ' + (s.t === 'line' ? 'line' : s.t === 'arc' ? 'arc' : 'circle'), { curve: s.id }); }
  if (best) { best.p = best.p.map(v => v); return best; }
  // level or upright from the point drawn from; else on the grid
  const g = MD.grid > 0 ? MD.grid : 1, q = [Math.round(raw[0] / g) * g, Math.round(raw[1] / g) * g];
  let kind = 'grid';
  if (from) { if (Math.abs(raw[1] - from[1]) < tol) { q[1] = from[1]; kind = 'level'; } else if (Math.abs(raw[0] - from[0]) < tol) { q[0] = from[0]; kind = 'upright'; } }
  return { p: q, kind };
}

/* ---------- drawing the sketch ---------- */
function clearGroup() {
  const G = MD.group; if (!G) return;
  for (const o of [...G.children]) { G.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }
}
// the extrude's preview taken down
function dropPrev() { if (!MD.prev) return; if (MD.prev.parent) MD.prev.parent.remove(MD.prev); MD.prev.geometry.dispose(); MD.prev.material.dispose(); MD.prev = null; }
const COL = { line: 0x1d6fd8, sel: 0xf28a1a, draft: 0x4fa3ff, constr: 0x7a8a99, grid: 0x8899aa, beam: 0xe0312f, hole: 0x5b6670, fill: 0x1d6fd8, edge: 0xf28a1a };
function mdLines(K, pts, colour, opts) {
  opts = opts || {};
  const P = []; for (let i = 0; i + 1 < pts.length; i++) P.push(pts[i][0], pts[i][1], LIFT, pts[i + 1][0], pts[i + 1][1], LIFT);
  if (opts.closed && pts.length > 2) { const a = pts[pts.length - 1], b = pts[0]; P.push(a[0], a[1], LIFT, b[0], b[1], LIFT); }
  const geo = new K.T.BufferGeometry(); geo.setAttribute('position', new K.T.Float32BufferAttribute(P, 3));
  const mat = opts.dash ? new K.T.LineDashedMaterial({ color: colour, dashSize: opts.dash, gapSize: opts.dash, depthTest: false, transparent: true, opacity: opts.opacity || 1 })
    : new K.T.LineBasicMaterial({ color: colour, depthTest: false, transparent: true, opacity: opts.opacity || 1 });
  const L = new K.T.LineSegments(geo, mat); if (opts.dash) L.computeLineDistances(); L.renderOrder = 20; return L;
}
function dots(K, pts, colour, size) {
  const geo = new K.T.BufferGeometry(); geo.setAttribute('position', new K.T.Float32BufferAttribute(pts.flatMap(p => [p[0], p[1], LIFT]), 3));
  const P = new K.T.Points(geo, new K.T.PointsMaterial({ color: colour, size: size || 6, sizeAttenuation: false, depthTest: false, transparent: true })); P.renderOrder = 21; return P;
}
function redraw() {
  const K = kit(); if (!K || !MD.group) return;
  clearGroup();
  const G = MD.group;
  if (MD.stage === 'plane' || MD.stage === 'off') {
    // the plane a click would sketch on, as a square under the pointer
    if (MD.stage === 'plane' && MD.hover) {
      const P = MD.hover.plane, c = toUV(P, MD.hover.p), s = 30 * mmPerPxAt(K, MD.hover.p);
      G.matrix.copy(planeMatrix(K, P)); G.matrixWorldNeedsUpdate = true;
      const sq = [[c[0] - s, c[1] - s], [c[0] + s, c[1] - s], [c[0] + s, c[1] + s], [c[0] - s, c[1] + s]];
      G.add(mdLines(K, sq, COL.sel, { closed: true }));
      const fill = new K.T.Mesh(new K.T.ShapeGeometry(new K.T.Shape(sq.map(p => new K.T.Vector2(p[0], p[1])))), new K.T.MeshBasicMaterial({ color: COL.sel, transparent: true, opacity: 0.15, depthTest: false, side: K.T.DoubleSide }));
      fill.position.z = LIFT; fill.renderOrder = 19; G.add(fill);
    }
    K.need(); return;
  }
  const P = sketchPlane();
  G.matrix.copy(planeMatrix(K, P)); G.matrixWorldNeedsUpdate = true;
  // the grid, about the point the view looks at, fine enough to see and no finer
  const c = toUV(P, K.R.target.toArray()), mpp = mmPerPx(K, c);
  const g0 = MD.grid > 0 ? MD.grid : 1;
  let g = g0; for (let k = 0; g / mpp < 7 && k < 40; k++) g = g0 * [1, 2, 5][(k + 1) % 3] * Math.pow(10, Math.floor((k + 1) / 3));
  const ext = mpp * Math.max(K.R.w, K.R.h) * 0.7, u0 = Math.floor((c[0] - ext) / g) * g, v0 = Math.floor((c[1] - ext) / g) * g, gl = [], gm = [];
  for (let u = u0; u <= c[0] + ext; u += g) (Math.abs(Math.round(u / (10 * g)) * 10 * g - u) < g / 2 ? gm : gl).push([[u, c[1] - ext], [u, c[1] + ext]]);
  for (let v = v0; v <= c[1] + ext; v += g) (Math.abs(Math.round(v / (10 * g)) * 10 * g - v) < g / 2 ? gm : gl).push([[c[0] - ext, v], [c[0] + ext, v]]);
  // (while extruding or revolving, the solid shows instead)
  const sk = MD.stage === 'sketch';
  if (sk && gl.length < 1200) for (const s of gl) G.add(mdLines(K, s, COL.grid, { opacity: 0.18 }));
  if (sk) for (const s of gm) G.add(mdLines(K, s, COL.grid, { opacity: 0.4 }));
  // the table's holes, the light crossing the plane, and the beam's middle there
  if (MD.holes && sk) {
    const pts = []; const w0 = fromUV(P, [c[0] - ext, c[1] - ext]), w1 = fromUV(P, [c[0] + ext, c[1] + ext]);
    for (let x = Math.ceil(Math.min(w0[0], w1[0]) / 25) * 25; x <= Math.max(w0[0], w1[0]); x += 25) for (let y = Math.ceil(Math.min(w0[1], w1[1]) / 25) * 25; y <= Math.max(w0[1], w1[1]); y += 25) pts.push(toUV(P, [x, y, 0]));
    if (pts.length < 3000) G.add(dots(K, pts, COL.hole, 5));
  }
  if (MD.beam && MD.beam.pts.length) G.add(dots(K, MD.beam.pts, COL.beam, 3));
  if (MD.beam) for (const m of MD.beam.mids) { const r = 4 * mpp, ring = []; for (let i = 0; i <= 24; i++) ring.push([m[0] + r * Math.cos(i * Math.PI / 12), m[1] + r * Math.sin(i * Math.PI / 12)]); G.add(mdLines(K, ring, COL.beam)); G.add(mdLines(K, [[m[0] - 2 * r, m[1]], [m[0] + 2 * r, m[1]]], COL.beam)); G.add(mdLines(K, [[m[0], m[1] - 2 * r], [m[0], m[1] + 2 * r]], COL.beam)); }
  // the regions: in the sketch, those an extrude would take (as it would by default); extruding, each, chosen or not
  const exting = MD.stage === 'extrude' || MD.stage === 'revolve', cutting = MD.ex.op === 'cut';
  const RG = sketchChosen(MD.ents.filter(e => !(exting && MD.stage === 'revolve' && e.id === MD.ex.axis)), cutting, exting ? MD.ex.regions : null);
  MD.regs = RG;
  for (const R of RG.regions) {
    const on = RG.chosen.includes(R), hov = exting && MD.hoverReg === R;
    if (!exting && !on) continue;
    const sh = new K.T.Shape(R.outer.map(p => new K.T.Vector2(p[0], p[1])));
    for (const H of R.holes) sh.holes.push(new K.T.Path(H.map(p => new K.T.Vector2(p[0], p[1]))));
    const colour = !exting ? COL.fill : on ? (cutting ? 0xe0312f : 0x2fa35a) : 0x8899aa;
    const m = new K.T.Mesh(new K.T.ShapeGeometry(sh), new K.T.MeshBasicMaterial({ color: colour, transparent: true, opacity: !exting ? 0.14 : on ? (hov ? 0.5 : 0.32) : (hov ? 0.3 : 0.1), depthTest: false, side: K.T.DoubleSide }));
    m.position.z = LIFT; m.renderOrder = 18; G.add(m);
  }
  // the shapes: fully defined in ink, not yet in blue, selected in orange, construction dashed
  const ink = inkCol(K);
  for (const e of MD.ents) {
    const pts = entOutline(e), colour = MD.sel.has(e.id) ? COL.sel : e.k ? COL.constr : MD.defined.has(e.id) ? ink : COL.line;
    if (e.t === 'point') continue;
    G.add(mdLines(K, pts, colour, { closed: !(e.t === 'line' || e.t === 'arc'), dash: e.k ? 2 * mpp : 0 }));
  }
  const ends = [], endsDef = [], selDots = [];
  for (const e of MD.ents) for (const [p, k, r] of entPts(e)) {
    if (!r || !r.e) continue;
    if (MD.selP.has(r.e + '|' + r.k)) selDots.push(p); else if (e.k && e.t !== 'point') continue; else (MD.defined.has(e.id) ? endsDef : ends).push(p);
  }
  if (MD.selP.has('origin|')) selDots.push([0, 0]);
  if (ends.length) G.add(dots(K, ends, COL.line, 5));
  if (endsDef.length) G.add(dots(K, endsDef, ink, 5));
  if (selDots.length) G.add(dots(K, selDots, COL.sel, 9));
  // the sketch's origin, and its axes, faint
  G.add(dots(K, [[0, 0]], COL.constr, 6));
  // the dimensions' leader lines
  for (const d of MD.dims) {
    const E = new Map(MD.ents.map(e => [e.id, e])), q = dimAnchor(d); if (!q) continue;
    const colour = MD.selD.has(d.id) ? COL.sel : 0x5b6670;
    if (d.t === 'dist') G.add(mdLines(K, [hpt(E, d.r[0]), hpt(E, d.r[1])], colour, { dash: 1.2 * mpp, opacity: 0.8 }));
    else if (d.t === 'pl' && d._ends) G.add(mdLines(K, d._ends, colour, { dash: 1.2 * mpp, opacity: 0.8 }));
    else if (d.t === 'rad' || d.t === 'dia') { const e = E.get(d.r[0].e); if (e && e.c) G.add(mdLines(K, [e.c, q], colour, { opacity: 0.8 })); }
  }
  // what is being drawn, to the pointer
  const dr = draftEnt();
  if (dr) G.add(mdLines(K, entOutline(dr), COL.draft, { closed: !(dr.t === 'line' || dr.t === 'arc'), dash: MD.constr ? 2 * mpp : 0 }));
  if (MD.draft.length) G.add(dots(K, MD.draft, COL.draft, 6));
  if (MD.snap && MD.stage === 'sketch' && NEEDS[MD.tool]) G.add(dots(K, [MD.snap.p], MD.snap.kind === 'grid' ? COL.grid : COL.sel, 8));
  // Use edges: the edge under the pointer
  if (MD.tool === 'use' && MD.hoverEdge) G.add(mdLines(K, MD.hoverEdge.map(p => toUV(P, p)), COL.edge));
  // extruding: the solid it would make, and the arrow to drag its length
  if ((MD.stage === 'extrude' || MD.stage === 'revolve') && MD.prev && !MD.prev.parent) K.R.scene.add(MD.prev);
  if (MD.stage === 'extrude') { const a = arrowGeom(); if (a) { G.add(mdLines(K, [a.base, a.tip].map(p => toUV(P, p)), COL.sel)); G.add(dots(K, [toUV(P, a.tip)], COL.sel, 10)); } }
  tipText(); annots();
  K.need();
}
const mmPerPxAt = (K, p) => 2 * K.R.camera.position.distanceTo(mdV3(K, p)) * Math.tan(K.R.camera.fov * deg / 2) / Math.max(1, K.R.h);
// the bench's ink as a colour three.js takes (black on paper, near white on a dark bench)
let inkCache = null;
function inkCol(K) { const c = getCss('--jek-ink') || '#1d2327'; if (!inkCache || inkCache[0] !== c) { try { inkCache = [c, new K.T.Color(c).getHex()]; } catch (err) { inkCache = [c, 0x1d2327]; } } return inkCache[1]; }
function planeMatrix(K, P) { const n = planeNormal(P), M = new K.T.Matrix4(); M.makeBasis(mdV3(K, P.x), mdV3(K, P.y), mdV3(K, n)); M.setPosition(mdV3(K, P.o)); return M; }

/* ---------- the shape being drawn, from its points so far and the pointer (and any size typed) ---------- */
const TOOLS = [['line', 'Line'], ['arc', 'Arc'], ['rect', 'Rectangle'], ['circle', 'Circle'], ['slot', 'Slot'], ['poly', 'Polygon'], ['hole', 'Hole'],
  ['select', 'Select'], ['use', 'Use edges']];
const NEEDS = { line: 2, arc: 3, carc: 3, tarc: 2, rect: 2, crect: 2, circle: 2, slot: 3, poly: 2, hole: 1, point: 1 };
function draftEnt(final) {
  const D = MD.draft, c = MD.cursor, T = MD.typed;
  if (!D.length || !c || !NEEDS[MD.tool]) return null;
  const p0 = D[0], k = MD.constr ? { k: true } : {};
  const dir = (a, b) => { const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]); return L > 1e-9 ? [d[0] / L, d[1] / L, L] : [1, 0, 0]; };
  switch (MD.tool) {
    case 'line': {
      let [dx, dy, L] = dir(p0, c);
      if (T.angle !== undefined) { dx = Math.cos(T.angle * deg); dy = Math.sin(T.angle * deg); }
      if (T.len !== undefined) L = T.len;
      return normEnt(Object.assign({ t: 'line', a: p0, b: [p0[0] + dx * L, p0[1] + dy * L] }, k));
    }
    case 'rect': {
      const sx = c[0] >= p0[0] ? 1 : -1, sy = c[1] >= p0[1] ? 1 : -1;
      const w = T.w !== undefined ? T.w : Math.abs(c[0] - p0[0]), hh = T.h !== undefined ? T.h : Math.abs(c[1] - p0[1]);
      if (!(w > 0 && hh > 0)) return null;
      return normEnt(Object.assign({ t: 'rect', c: [p0[0] + sx * w / 2, p0[1] + sy * hh / 2], w, h: hh, rot: 0 }, k));
    }
    case 'circle': { const r = T.d !== undefined ? T.d / 2 : Math.hypot(c[0] - p0[0], c[1] - p0[1]); return r > 0 ? normEnt(Object.assign({ t: 'circle', c: p0, r }, k)) : null; }
    case 'poly': {
      const [dx, dy, L] = dir(p0, c), r = T.r !== undefined ? T.r : L;
      return r > 0 ? normEnt(Object.assign({ t: 'poly', c: p0, r, n: MD.polyN, rot: Math.atan2(dy, dx) / deg }, k)) : null;
    }
    case 'slot': {
      const p1 = D.length > 1 ? D[1] : c;
      let [dx, dy, L] = dir(p0, p1); if (T.len !== undefined) L = T.len;
      const b = D.length > 1 && T.len === undefined ? p1 : [p0[0] + dx * L, p0[1] + dy * L];
      if (!(L > 0)) return null;
      const r = T.wd !== undefined ? T.wd / 2 : D.length > 1 ? Math.max(0.05, Math.abs((c[0] - p0[0]) * -dy + (c[1] - p0[1]) * dx)) : Math.max(0.5, L / 6);
      return normEnt(Object.assign({ t: 'slot', a: p0, b, r }, k));
    }
    case 'arc': {
      if (D.length < 2) return normEnt(Object.assign({ t: 'line', a: p0, b: c }, k));
      return arc3(p0, D[1], c, k);
    }
    case 'crect': {
      const w = T.w !== undefined ? T.w : 2 * Math.abs(c[0] - p0[0]), hh = T.h !== undefined ? T.h : 2 * Math.abs(c[1] - p0[1]);
      return w > 0 && hh > 0 ? normEnt(Object.assign({ t: 'rect', c: p0, w, h: hh, rot: 0 }, k)) : null;
    }
    case 'carc': {
      // a centre-point arc: its centre, its start (its radius), then its end's angle, anticlockwise
      if (D.length < 2) return normEnt(Object.assign({ t: 'circle', c: p0, r: Math.max(1e-3, Math.hypot(c[0] - p0[0], c[1] - p0[1])) }, k));
      const r = Math.hypot(D[1][0] - p0[0], D[1][1] - p0[1]), a0 = Math.atan2(D[1][1] - p0[1], D[1][0] - p0[0]) / deg, a1 = Math.atan2(c[1] - p0[1], c[0] - p0[0]) / deg;
      return r > 0 ? normEnt(Object.assign({ t: 'arc', c: p0, r, a0, a1 }, k)) : null;
    }
    case 'tarc': {
      // a tangent arc: from the line's end, along it, to the pointer
      const d = MD.tanDir ? (() => { const L = Math.hypot(...MD.tanDir) || 1; return [MD.tanDir[0] / L, MD.tanDir[1] / L]; })() : [1, 0];
      const n = [-d[1], d[0]], q = [c[0] - p0[0], c[1] - p0[1]], den = 2 * (q[0] * n[0] + q[1] * n[1]);
      if (Math.abs(den) < 1e-9) return normEnt(Object.assign({ t: 'line', a: p0, b: c }, k));
      const t = (q[0] * q[0] + q[1] * q[1]) / den, cc = [p0[0] + n[0] * t, p0[1] + n[1] * t], r = Math.abs(t);
      const as = Math.atan2(p0[1] - cc[1], p0[0] - cc[0]) / deg, ae = Math.atan2(c[1] - cc[1], c[0] - cc[0]) / deg;
      return normEnt(Object.assign(t > 0 ? { t: 'arc', c: cc, r, a0: as, a1: ae } : { t: 'arc', c: cc, r, a0: ae, a1: as }, k));
    }
    case 'hole': return normEnt({ t: 'hole', c: p0, d: MD.holeD, std: MD.holeStd || undefined });
    case 'point': return normEnt({ t: 'point', c: p0 });
  }
  return null;
}
// the arc from s to t through m
function arc3(s, t, m, k) {
  const ax = s[0], ay = s[1], bx = t[0], by = t[1], cx = m[0], cy = m[1], d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return null;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d, uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy), A = q => Math.atan2(q[1] - uy, q[0] - ux) / deg, as = A(s), at = A(t), am = A(m);
  const ccw = (a0, a1, x) => ((x - a0 + 720) % 360) < ((a1 - a0 + 720) % 360);
  return normEnt(Object.assign(ccw(as, at, am) ? { t: 'arc', c: [ux, uy], r, a0: as, a1: at } : { t: 'arc', c: [ux, uy], r, a0: at, a1: as }, k || {}));
}
function addEnt(e) {
  if (!e) return;
  push(); MD.ents.push(e);
}
/* the sketch as it stands (its shapes, constraints and dimensions), for its own undo */
const sketchState = () => JSON.stringify({ ents: MD.ents, cons: MD.cons, dims: MD.dims });
function sketchRestore(s) {
  const o = JSON.parse(s);
  if (Array.isArray(o)) { MD.ents = o; return; }         // (a step kept before constraints)
  MD.ents = o.ents; MD.cons = o.cons || []; MD.dims = o.dims || [];
}
const push = () => { MD.undo.push(sketchState()); if (MD.undo.length > 200) MD.undo.shift(); MD.redo = []; };
function sketchUndo(back) {
  const from = back ? MD.undo : MD.redo, to = back ? MD.redo : MD.undo;
  if (!from.length) return;
  to.push(sketchState()); sketchRestore(from.pop()); MD.sel.clear(); MD.selP.clear(); MD.selC.clear(); MD.selD.clear(); MD.draft = []; MD.draftSnaps = [];
  workDefined(); drawCard(); redraw();
}

/* ---------- the sketch kept true: solved after every change; what is fully defined ---------- */
function solveNow(extra) {
  const r = solveSketch(MD.ents, MD.cons, MD.dims, extra);
  return r;
}
function workDefined() {
  // (worked out for a sketch of a reasonable size; a bigger one shows nothing as fully defined)
  const nv = MD.ents.reduce((s, e) => s + ({ line: 4, arc: 5, circle: 3, hole: 3, slot: 5, poly: 4, rect: 5, point: 2 }[e.t] || 0), 0);
  MD.defined = nv && nv <= 160 ? definedEnts(MD.ents, MD.cons, MD.dims) : new Set();
}
/* a change to the sketch, made and solved; undone if the sketch can no longer hold (a constraint that conflicts) */
function changeSketch(fn, why) {
  const keep = sketchState();
  fn();
  const r = solveNow();
  if (!r.ok) { sketchRestore(keep); toast((why || 'That') + ' conflicts with the sketch’s other constraints and dimensions', true); return false; }
  MD.undo.push(keep); if (MD.undo.length > 200) MD.undo.shift(); MD.redo = [];
  workDefined(); drawCard(); redraw();
  return true;
}
const mkCon = (t, ...r) => ({ id: sketchId('c'), t, r });
/* what a point snapped to becomes, as a CAD program infers it: on a point, coincident with it; on a curve, on it; at a
   line's middle, its midpoint */
function inferCon(h0, s) {
  const r = s && s.ref; if (!r) return null;
  if (r.e) return mkCon('coincident', h0, r.e === 'origin' ? { e: 'origin' } : { e: r.e, k: r.k });
  if (r.curve) return mkCon('oncurve', h0, { e: r.curve });
  if (r.mid) return mkCon('midpoint', h0, { e: r.mid });
  return null;
}
/* the shape being drawn made: its shapes (a rectangle is four lines), the constraints that make it what it is, those
   its snaps infer, and the dimensions of sizes typed */
function shapeParts() {
  const e = draftEnt(true); if (!e) return null;
  const S = MD.draftSnaps, last = MD.snap, T = MD.typed, k = MD.constr ? { k: true } : {};
  const ents = [], cons = [], dims = [], add = c => { if (c) cons.push(c); };
  if (MD.tool === 'rect' || MD.tool === 'crect') {
    const w = e.w / 2, hh = e.h / 2, c = e.c, P = [[c[0] - w, c[1] - hh], [c[0] + w, c[1] - hh], [c[0] + w, c[1] + hh], [c[0] - w, c[1] + hh]];
    const L = [0, 1, 2, 3].map(i => normEnt(Object.assign({ t: 'line', a: P[i], b: P[(i + 1) % 4] }, k)));
    ents.push(...L);
    for (let i = 0; i < 4; i++) cons.push(mkCon('coincident', { e: L[i].id, k: 'b' }, { e: L[(i + 1) % 4].id, k: 'a' }));
    cons.push(mkCon('horizontal', { e: L[0].id }), mkCon('horizontal', { e: L[2].id }), mkCon('vertical', { e: L[1].id }), mkCon('vertical', { e: L[3].id }));
    // which corner the first click was, and the last: inferred there
    const corner = q => { let bi = 0, bd = Infinity; P.forEach((p, i) => { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; bi = i; } }); return { e: L[bi].id, k: 'a' }; };
    if (MD.tool === 'rect') { add(inferCon(corner(MD.draft[0]), S[0])); add(inferCon(corner(MD.cursor), last)); }
    else {
      // a centre rectangle: its centre a point, at the middle of a construction diagonal
      const dg = normEnt({ t: 'line', a: P[0], b: P[2], k: true }), cp = normEnt({ t: 'point', c: c.slice() });
      ents.push(dg, cp);
      cons.push(mkCon('coincident', { e: dg.id, k: 'a' }, { e: L[0].id, k: 'a' }), mkCon('coincident', { e: dg.id, k: 'b' }, { e: L[2].id, k: 'a' }), mkCon('midpoint', { e: cp.id, k: 'c' }, { e: dg.id }));
      add(inferCon({ e: cp.id, k: 'c' }, S[0]));
    }
    if (T.w !== undefined) dims.push({ id: sketchId('d'), t: 'len', r: [{ e: L[0].id }], v: e.w });
    if (T.h !== undefined) dims.push({ id: sketchId('d'), t: 'len', r: [{ e: L[1].id }], v: e.h });
    return { ents, cons, dims };
  }
  ents.push(e);
  switch (MD.tool) {
    case 'line':
      add(inferCon({ e: e.id, k: 'a' }, S[0])); add(inferCon({ e: e.id, k: 'b' }, last));
      if (last && last.kind === 'level') add(mkCon('horizontal', { e: e.id })); else if (last && last.kind === 'upright') add(mkCon('vertical', { e: e.id }));
      if (T.len !== undefined) dims.push({ id: sketchId('d'), t: 'len', r: [{ e: e.id }], v: T.len });
      break;
    case 'circle': add(inferCon({ e: e.id, k: 'c' }, S[0])); if (T.d !== undefined) dims.push({ id: sketchId('d'), t: 'dia', r: [{ e: e.id }], v: T.d }); break;
    case 'poly': add(inferCon({ e: e.id, k: 'c' }, S[0])); if (T.r !== undefined) dims.push({ id: sketchId('d'), t: 'rad', r: [{ e: e.id }], v: T.r }); break;
    case 'hole': case 'point': add(inferCon({ e: e.id, k: 'c' }, last)); break;
    case 'slot': add(inferCon({ e: e.id, k: 'a' }, S[0])); add(inferCon({ e: e.id, k: 'b' }, S[1]));
      if (T.len !== undefined) dims.push({ id: sketchId('d'), t: 'len', r: [{ e: e.id }], v: T.len }); if (T.wd !== undefined) dims.push({ id: sketchId('d'), t: 'dia', r: [{ e: e.id }], v: T.wd }); break;
    case 'arc': case 'carc': case 'tarc': {
      // which end is which: the arc runs anticlockwise from p0 to p1
      const p0 = hpt(new Map([[e.id, e]]), { e: e.id, k: 'p0' });
      const first = MD.tool === 'carc' ? MD.draft[1] : MD.draft[0], end = MD.tool === 'arc' ? MD.draft[1] : MD.cursor;
      const startIsP0 = Math.hypot(p0[0] - first[0], p0[1] - first[1]) < 1e-6;
      const kS = startIsP0 ? 'p0' : 'p1', kE = startIsP0 ? 'p1' : 'p0';
      if (MD.tool === 'carc') { add(inferCon({ e: e.id, k: 'c' }, S[0])); add(inferCon({ e: e.id, k: kS }, S[1])); add(inferCon({ e: e.id, k: kE }, last)); }
      else if (MD.tool === 'tarc') { add(inferCon({ e: e.id, k: kS }, S[0])); if (MD.tanFrom) add(Object.assign(mkCon('tangent', { e: MD.tanFrom }, { e: e.id }), { at: kS })); add(inferCon({ e: e.id, k: kE }, last)); }
      else { add(inferCon({ e: e.id, k: kS }, S[0])); add(inferCon({ e: e.id, k: kE }, S[1])); }
      void end;
      break;
    }
  }
  return { ents, cons, dims };
}
/* the shape made, with its constraints, and the sketch solved */
function commitShape() {
  const parts = shapeParts(); if (!parts) return null;
  const ok = changeSketch(() => { MD.ents.push(...parts.ents); MD.cons.push(...parts.cons); MD.dims.push(...parts.dims); }, 'That shape');
  return ok ? parts.ents[0] : null;
}
/* a click with a drawing tool: a point more; the shape made once it has all it needs */
function place(p, s) {
  MD.cursor = p; s = s || { p, kind: 'grid' }; MD.snap = s;
  if (MD.tool === 'hole' || MD.tool === 'point') { MD.draft = [p]; MD.draftSnaps = [s]; commitShape(); MD.draft = []; MD.draftSnaps = []; drawCard(); redraw(); return; }
  if (MD.tool === 'tarc' && !MD.draft.length) {
    // a tangent arc starts at a line's end, along it
    const r = s.ref; const ln = r && r.e && r.e !== 'origin' && MD.ents.find(q => q.id === r.e && q.t === 'line' && (r.k === 'a' || r.k === 'b'));
    if (!ln) { toast('A tangent arc starts at the end of a line: click one'); return; }
    MD.tanFrom = ln.id; MD.tanDir = r.k === 'b' ? [ln.b[0] - ln.a[0], ln.b[1] - ln.a[1]] : [ln.a[0] - ln.b[0], ln.a[1] - ln.b[1]];
  }
  if (MD.tool === 'line' && MD.draft.length === 1) {
    const e = commitShape(); MD.typed = {};
    if (e && e.t === 'line') {
      const first = MD.chain0;
      if (!MD.chainRef) MD.chainRef = { e: e.id, k: 'a' };
      MD.draft = [e.b]; MD.draftSnaps = [{ p: e.b, kind: 'end', ref: { e: e.id, k: 'b' } }];
      // back at the polyline's first point: closed, and done
      if (first && Math.hypot(e.b[0] - first[0], e.b[1] - first[1]) < 1e-9) { MD.draft = []; MD.draftSnaps = []; MD.chain0 = null; }
    }
    drawCard(); redraw(); return;
  }
  MD.draft.push(p); MD.draftSnaps.push(s);
  if (MD.tool === 'line' && MD.draft.length === 1) { MD.chain0 = p; MD.chainRef = null; }
  if (MD.draft.length >= NEEDS[MD.tool]) { MD.cursor = p; commitShape(); MD.draft = []; MD.draftSnaps = []; MD.typed = {}; }
  drawCard(); redraw();
}
function commitTyped() {
  // Enter in a size: the shape made with it (its size a dimension), from the pointer's direction
  if (!MD.draft.length) return;
  if (MD.tool === 'slot' && MD.draft.length === 1 && MD.typed.len !== undefined && MD.typed.wd === undefined) { const e = draftEnt(true); if (e) { MD.draft.push(e.b); MD.draftSnaps.push({ p: e.b, kind: 'free' }); } drawCard(); redraw(); return; }
  const e = commitShape(); if (!e) return;
  if (MD.tool === 'line') { MD.draft = [e.b]; MD.draftSnaps = [{ p: e.b, kind: 'end', ref: { e: e.id, k: 'b' } }]; MD.typed = {}; }
  else { MD.draft = []; MD.draftSnaps = []; MD.typed = {}; }
  drawCard(); redraw();
}

/* ---------- constraints, from what is selected ----------
   As a CAD program's: points and shapes selected, then the constraint; or the constraint, then what it is between, clicked */
const ROUND = new Set(['circle', 'arc', 'hole']);
const CONS_UI = [
  ['coincident', 'Coincident: two points together, a point on a curve, or two circles’ centres', 'I'], ['concentric', 'Concentric: circles and arcs about one centre', 'N'],
  ['parallel', 'Parallel: lines', 'P'], ['tangent', 'Tangent: a line and a circle or arc, or two of those', 'T'], ['horizontal', 'Horizontal: lines, or two points level', 'H'],
  ['vertical', 'Vertical: lines, or two points one above the other', 'V'], ['perpendicular', 'Perpendicular: two lines', 'B'], ['equal', 'Equal: lines’ lengths, or circles’ and arcs’ radii', 'E'],
  ['midpoint', 'Midpoint: a point at a line’s middle', 'M'], ['fix', 'Fix: points (or shapes) where they are', 'F'], ['symmetric', 'Symmetric: two points about a line', 'Y'],
];
function selRefs() {
  const pts = [...MD.selP].map(s => { const [e, k] = s.split('|'); return e === 'origin' ? { e: 'origin' } : { e, k }; });
  const ents = MD.ents.filter(e => MD.sel.has(e.id));
  return { pts, ents };
}
/* the constraints a kind makes of what is selected, or why it cannot */
function consFor(kind) {
  const { pts, ents } = selRefs(), lines = ents.filter(e => e.t === 'line'), rounds = ents.filter(e => ROUND.has(e.t));
  const out = [], pairs = (L, t) => { for (let i = 1; i < L.length; i++) out.push(mkCon(t, { e: L[0].id }, { e: L[i].id })); };
  switch (kind) {
    case 'coincident':
      if (pts.length >= 2) { for (let i = 1; i < pts.length; i++) out.push(mkCon('coincident', pts[0], pts[i])); break; }
      if (pts.length === 1 && ents.length === 1 && (ents[0].t === 'line' || ROUND.has(ents[0].t))) { out.push(mkCon('oncurve', pts[0], { e: ents[0].id })); break; }
      if (rounds.length >= 2) { pairs(rounds, 'concentric'); break; }
      return 'two points, a point and a curve, or two circles';
    case 'concentric': { const C = ents.filter(e => ROUND.has(e.t) || e.t === 'poly'); if (C.length >= 2) pairs(C, 'concentric'); else return 'two circles or arcs'; break; }
    case 'parallel': case 'perpendicular': if (lines.length >= 2) pairs(lines, kind); else return 'two lines'; break;
    case 'equal': if (lines.length >= 2) pairs(lines, 'equal'); else if (rounds.length >= 2) pairs(rounds, 'equal'); else return 'two lines, or two circles or arcs'; break;
    case 'horizontal': case 'vertical':
      if (lines.length) { for (const l of lines) out.push(mkCon(kind, { e: l.id })); break; }
      if (pts.length === 2) { out.push(mkCon(kind, pts[0], pts[1])); break; }
      return 'lines, or two points';
    case 'tangent': {
      if (ents.length !== 2 || !ents.every(e => e.t === 'line' || ROUND.has(e.t)) || ents.every(e => e.t === 'line')) return 'a line and a circle or arc, or two circles or arcs';
      const c = mkCon('tangent', { e: ents[0].id }, { e: ents[1].id });
      if (rounds.length === 2) { const d = Math.hypot(rounds[0].c[0] - rounds[1].c[0], rounds[0].c[1] - rounds[1].c[1]), r0 = rounds[0].t === 'hole' ? rounds[0].d / 2 : rounds[0].r, r1 = rounds[1].t === 'hole' ? rounds[1].d / 2 : rounds[1].r; c.s = d > Math.abs(r0 - r1) + 1e-9 && d >= Math.max(r0, r1) ? 1 : -1; }
      out.push(c); break;
    }
    case 'midpoint': if (pts.length === 1 && lines.length === 1) out.push(mkCon('midpoint', pts[0], { e: lines[0].id })); else return 'a point and a line'; break;
    case 'fix': {
      const E = new Map(MD.ents.map(e => [e.id, e]));
      for (const p of pts) if (p.e !== 'origin') out.push(Object.assign(mkCon('fix', p), { at: hpt(E, p).slice() }));
      for (const e of ents) for (const k of entKeys(e)) out.push(Object.assign(mkCon('fix', { e: e.id, k }), { at: hpt(E, { e: e.id, k }).slice() }));
      if (!out.length) return 'points or shapes';
      break;
    }
    case 'symmetric': if (pts.length === 2 && lines.length === 1) out.push(mkCon('symmetric', pts[0], pts[1], { e: lines[0].id })); else return 'two points and a line'; break;
  }
  return out;
}
/* a constraint applied: to what is selected, or (nothing apt selected) once what it needs is clicked */
function applyCon(kind, quiet) {
  const c = consFor(kind);
  if (typeof c === 'string') { if (!quiet) { MD.pickCon = kind; drawCard(); kit().hint(); } return false; }
  const ok = changeSketch(() => MD.cons.push(...c), CONS_UI.find(q => q[0] === kind)[1].split(':')[0]);
  if (ok) { MD.pickCon = null; MD.sel.clear(); MD.selP.clear(); drawCard(); redraw(); kit().hint(); }
  return ok;
}
/* ---------- dimensions: picked, then their value typed ---------- */
function dimFromPicks(P) {
  const E = new Map(MD.ents.map(e => [e.id, e])), ent = r => r.k === undefined && r.e !== 'origin' ? E.get(r.e) : null;
  let d = null;
  if (P.length === 1) {
    const e = ent(P[0]); if (!e) return null;
    if (e.t === 'line' || e.t === 'slot') d = { t: 'len', r: [{ e: e.id }] };
    else if (e.t === 'circle' || e.t === 'hole') d = { t: 'dia', r: [{ e: e.id }] };
    else if (e.t === 'arc' || e.t === 'poly') d = { t: 'rad', r: [{ e: e.id }] };
  } else if (P.length === 2) {
    const [a, b] = P, ea = ent(a), eb = ent(b);
    if (!ea && !eb) d = { t: 'dist', r: [a, b] };
    else if (!ea && eb && eb.t === 'line') d = { t: 'pl', r: [a, { e: eb.id }] };
    else if (ea && !eb && ea.t === 'line') d = { t: 'pl', r: [b, { e: ea.id }] };
    else if (!ea && eb) d = { t: 'dist', r: [a, { e: eb.id, k: 'c' }] };
    else if (ea && !eb) d = { t: 'dist', r: [{ e: ea.id, k: 'c' }, b] };
    else if (ea.t === 'line' && eb.t === 'line') {
      const u = [ea.b[0] - ea.a[0], ea.b[1] - ea.a[1]], w = [eb.b[0] - eb.a[0], eb.b[1] - eb.a[1]], cr = (u[0] * w[1] - u[1] * w[0]) / ((Math.hypot(...u) * Math.hypot(...w)) || 1);
      d = Math.abs(cr) < 1e-6 ? { t: 'pl', r: [{ e: eb.id, k: 'a' }, { e: ea.id }] } : { t: 'ang', r: [{ e: ea.id }, { e: eb.id }] };
    } else d = { t: 'dist', r: [{ e: ea.id, k: ea.t === 'line' ? 'm' : 'c' }, { e: eb.id, k: eb.t === 'line' ? 'm' : 'c' }] };
  }
  if (!d) return null;
  d.id = sketchId('d');
  const m = dimMeasure(MD.ents, d);
  if ((d.t === 'pl' || d.t === 'ang') && m < 0) d.s = -1;
  d.v = Math.abs(m);
  return d;
}
function addDim(P) {
  const d = dimFromPicks(P); if (!d) { toast('That cannot be dimensioned: pick a line, a circle, two points, a point and a line, or two lines'); return null; }
  if (!changeSketch(() => MD.dims.push(d), 'That dimension')) return null;
  MD.dimEdit = d.id; drawCard(); redraw();
  return d;
}
function setDimValue(id, v) {
  const d = MD.dims.find(q => q.id === id); if (!d || !(Number.isFinite(v))) return false;
  if (d.t !== 'ang' && !(v > 0)) { toast('A size above nothing, please'); return false; }
  return changeSketch(() => { d.v = v; }, 'That size');
}
const DIM_NAMES = { dist: 'Distance', len: 'Length', pl: 'Distance', rad: 'Radius', dia: 'Diameter', ang: 'Angle' };
const dimText = d => (d.t === 'dia' ? '⌀' : d.t === 'rad' ? 'R' : '') + (+d.v.toFixed(3)) + (d.t === 'ang' ? '°' : '');
// where a dimension's label goes, in the sketch: by what it measures
function dimAnchor(d) {
  const E = new Map(MD.ents.map(e => [e.id, e])), P = r => hpt(E, r), off = d.off || [0, 0];
  let q;
  switch (d.t) {
    case 'len': { const e = E.get(d.r[0].e); if (!e) return null; const a = e.a, b = e.b, n = [-(b[1] - a[1]), b[0] - a[0]], L = Math.hypot(...n) || 1; q = [(a[0] + b[0]) / 2 + n[0] / L * 0.06 * L + 0, (a[1] + b[1]) / 2 + n[1] / L * 0.06 * L]; break; }
    case 'dist': { const a = P(d.r[0]), b = P(d.r[1]); q = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; break; }
    case 'pl': { const p = P(d.r[0]), e = E.get(d.r[1].e); if (!e) return null; const u = [e.b[0] - e.a[0], e.b[1] - e.a[1]], L2 = u[0] * u[0] + u[1] * u[1] || 1, t = ((p[0] - e.a[0]) * u[0] + (p[1] - e.a[1]) * u[1]) / L2, f = [e.a[0] + u[0] * t, e.a[1] + u[1] * t]; q = [(p[0] + f[0]) / 2, (p[1] + f[1]) / 2]; d._ends = [p, f]; break; }
    case 'rad': case 'dia': { const e = E.get(d.r[0].e); if (!e) return null; const r = e.t === 'hole' ? e.d / 2 : e.r; q = [e.c[0] + r * 0.72, e.c[1] + r * 0.72]; break; }
    case 'ang': { const e1 = E.get(d.r[0].e), e2 = E.get(d.r[1].e); if (!e1 || !e2) return null; q = [(e1.a[0] + e1.b[0] + e2.a[0] + e2.b[0]) / 4, (e1.a[1] + e1.b[1] + e2.a[1] + e2.b[1]) / 4]; break; }
  }
  return q && [q[0] + off[0], q[1] + off[1]];
}

/* ---------- the sketch's dimensions and constraints, labelled over the view ----------
   Each dimension a label with its value (click: selected; double-click: its value typed); each constraint but a
   coincidence a small sign by the shape it holds (H, V, ∥, ⊥, =, T, M, ◎, ⚓, ⇋; click: selected, Delete takes it off) */
const GLYPH = { horizontal: 'H', vertical: 'V', parallel: '∥', perpendicular: '⊥', equal: '=', tangent: 'T', midpoint: 'M', concentric: '◎', fix: '⚓', symmetric: '⇋', oncurve: '•' };
// a shape's middle, for its signs
function entMid(e) {
  if (!e) return null;
  if (e.t === 'line' || e.t === 'slot') return [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
  if (e.t === 'arc') { const m = (e.a0 + (((e.a1 - e.a0) % 360 + 360) % 360) / 2) * deg; return [e.c[0] + e.r * Math.cos(m), e.c[1] + e.r * Math.sin(m)]; }
  if (e.t === 'circle' || e.t === 'hole') { const r = e.t === 'hole' ? e.d / 2 : e.r; return [e.c[0], e.c[1] + r]; }
  return e.c;
}
function annots() {
  const K = kit(); if (!K) return;
  if (!MD.ann) { MD.ann = h('div', { class: 'rt-mdlann' }); K.D.stage.append(MD.ann); }
  const show = MD.on && MD.stage === 'sketch';
  MD.ann.hidden = !show;
  if (!show) return;
  const key = JSON.stringify([MD.dims.map(d => [d.id, d.v, MD.selD.has(d.id), MD.dimEdit === d.id]), MD.cons.map(c => [c.id, c.t, MD.selC.has(c.id)])]);
  if (key !== MD.annKey) {
    MD.annKey = key; MD.ann.replaceChildren();
    for (const d of MD.dims) {
      if (MD.dimEdit === d.id) {
        const inp = h('input', { type: 'text', class: 'rt-dimin', value: String(+d.v.toFixed(4)), 'aria-label': DIM_NAMES[d.t] + ' (' + (d.t === 'ang' ? '°' : 'mm') + ')' });
        inp.dataset.dim = d.id;
        inp.addEventListener('keydown', e => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); const v = d.t === 'ang' ? +inp.value : parseLength(inp.value); MD.dimEdit = null; if (v !== null && setDimValue(d.id, v)) { /* made */ } else { MD.annKey = null; redraw(); } }
          if (e.key === 'Escape') { MD.dimEdit = null; MD.annKey = null; redraw(); }
        });
        inp.addEventListener('blur', () => { if (MD.dimEdit === d.id) { MD.dimEdit = null; MD.annKey = null; redraw(); } });
        MD.ann.append(inp); setTimeout(() => { inp.focus(); inp.select(); }, 0);
        continue;
      }
      const lb = h('button', { type: 'button', class: 'rt-dimlbl' + (MD.selD.has(d.id) ? ' on' : ''), title: DIM_NAMES[d.t] + ': double-click to change it' }, dimText(d));
      lb.dataset.dim = d.id;
      lb.addEventListener('pointerdown', e => e.stopPropagation());
      lb.addEventListener('click', e => { e.stopPropagation(); if (!e.shiftKey) { MD.sel.clear(); MD.selP.clear(); MD.selC.clear(); MD.selD.clear(); } if (MD.selD.has(d.id)) MD.selD.delete(d.id); else MD.selD.add(d.id); drawCard(); redraw(); });
      lb.addEventListener('dblclick', e => { e.stopPropagation(); MD.dimEdit = d.id; redraw(); });
      MD.ann.append(lb);
    }
    for (const c of MD.cons) {
      if (!GLYPH[c.t]) continue;
      const g = h('button', { type: 'button', class: 'rt-conglyph' + (MD.selC.has(c.id) ? ' on' : ''), title: c.t[0].toUpperCase() + c.t.slice(1) + ' (click, then Delete, to take it off)' }, GLYPH[c.t]);
      g.dataset.con = c.id;
      g.addEventListener('pointerdown', e => e.stopPropagation());
      g.addEventListener('click', e => { e.stopPropagation(); if (!e.shiftKey) { MD.sel.clear(); MD.selP.clear(); MD.selC.clear(); MD.selD.clear(); } if (MD.selC.has(c.id)) MD.selC.delete(c.id); else MD.selC.add(c.id); drawCard(); redraw(); });
      MD.ann.append(g);
    }
  }
  // each put where it belongs on the screen, now
  const P = sketchPlane(), E = new Map(MD.ents.map(e => [e.id, e])), cb = K.D.cv.getBoundingClientRect(), sb = K.D.stage.getBoundingClientRect();
  const scr = q => { const v = mdV3(K, fromUV(P, q)).project(K.R.camera); return [(v.x + 1) / 2 * K.R.w + cb.left - sb.left, (1 - v.y) / 2 * K.R.h + cb.top - sb.top]; };
  const stack = new Map();
  for (const n of MD.ann.children) {
    let q = null, dx = 0, dy = 0;
    if (n.dataset.dim) { const d = MD.dims.find(x => x.id === n.dataset.dim); q = d && dimAnchor(d); }
    else if (n.dataset.con) {
      const c = MD.cons.find(x => x.id === n.dataset.con); if (!c) continue;
      const r = c.r.find(x => x.e !== 'origin' && !x.k) || c.r.find(x => x.e !== 'origin'), e = r && E.get(r.e);
      q = r && r.k ? hpt(E, r) : entMid(e);
      const k = r ? r.e : '', i = stack.get(k) || 0; stack.set(k, i + 1); dx = 10 + 15 * i; dy = -14;
    }
    if (!q) { n.hidden = true; continue; }
    const [x, y] = scr(q); n.hidden = false; n.style.left = (x + dx) + 'px'; n.style.top = (y + dy) + 'px';
  }
}

/* ---------- trim and fillet ---------- */
// where the other shapes cross a line (its t from a to b) or a circle or arc (angles, degrees)
function crossings(e) {
  const out = [];
  const segs = []; for (const o of MD.ents) { if (o.id === e.id || o.k || o.t === 'point') continue; const P = entOutline(o), closed = !(o.t === 'line' || o.t === 'arc'); for (let i = 0; i + 1 < P.length; i++) segs.push([P[i], P[i + 1]]); if (closed && P.length > 2) segs.push([P[P.length - 1], P[0]]); }
  const own = entOutline(e), ownSegs = []; for (let i = 0; i + 1 < own.length; i++) ownSegs.push([own[i], own[i + 1]]); if (e.t === 'circle' && own.length > 2) ownSegs.push([own[own.length - 1], own[0]]);
  for (const [p, p2] of ownSegs) for (const [q, q2] of segs) {
    const r = [p2[0] - p[0], p2[1] - p[1]], s = [q2[0] - q[0], q2[1] - q[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-14) continue;
    const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den, u = ((q[0] - p[0]) * r[1] - (q[1] - p[1]) * r[0]) / den;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) continue;
    const x = [p[0] + r[0] * t, p[1] + r[1] * t];
    if (e.t === 'line') { const d = [e.b[0] - e.a[0], e.b[1] - e.a[1]]; out.push(((x[0] - e.a[0]) * d[0] + (x[1] - e.a[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1])); }
    else out.push(((Math.atan2(x[1] - e.c[1], x[0] - e.c[0]) / deg) % 360 + 360) % 360);
  }
  return out;
}
const dropRefs = (id, keys) => { MD.cons = MD.cons.filter(c => !c.r.some(r => r.e === id && (keys ? keys.includes(r.k) : true))); MD.dims = MD.dims.filter(d => !d.r.some(r => r.e === id && (keys ? keys.includes(r.k) || r.k === undefined : true))); };
/* the piece of a line, circle or arc clicked, between where other shapes cross it, taken away */
function trimAt(q, tol) {
  const e = entAt(q, tol); if (!e) return false;
  if (!(e.t === 'line' || e.t === 'circle' || e.t === 'arc')) { toast('Trim works on lines, circles and arcs'); return false; }
  const X = crossings(e);
  return changeSketch(() => {
    if (e.t === 'line') {
      const d = [e.b[0] - e.a[0], e.b[1] - e.a[1]], tc = ((q[0] - e.a[0]) * d[0] + (q[1] - e.a[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]);
      const ts = X.filter(t => t > 1e-6 && t < 1 - 1e-6), t0 = Math.max(0, ...ts.filter(t => t < tc)), t1 = Math.min(1, ...ts.filter(t => t > tc));
      const P = t => [e.a[0] + d[0] * t, e.a[1] + d[1] * t];
      if (t0 === 0 && t1 === 1) { MD.ents = MD.ents.filter(x => x !== e); dropRefs(e.id); return; }
      if (t0 === 0) { dropRefs(e.id, ['a', 'm']); e.a = P(t1); return; }
      if (t1 === 1) { dropRefs(e.id, ['b', 'm']); e.b = P(t0); return; }
      // the middle out: two lines, the second taking the first's far end (and what was at it)
      const n = normEnt({ t: 'line', a: P(t1), b: e.b.slice(), k: e.k });
      for (const c of MD.cons) for (const r of c.r) if (r.e === e.id && r.k === 'b') r.e = n.id;
      for (const c of MD.cons.filter(c => c.r.length === 1 && c.r[0].e === e.id && !c.r[0].k)) MD.cons.push(mkCon(c.t, { e: n.id }));
      dropRefs(e.id, ['m']); MD.dims = MD.dims.filter(dd => !dd.r.some(r => r.e === e.id));
      e.b = P(t0); MD.ents.push(n);
      return;
    }
    const ac = ((Math.atan2(q[1] - e.c[1], q[0] - e.c[0]) / deg) % 360 + 360) % 360;
    if (e.t === 'circle') {
      if (X.length < 2) { MD.ents = MD.ents.filter(x => x !== e); dropRefs(e.id); return; }
      const A = [...new Set(X.map(a => +a.toFixed(9)))].sort((a, b) => a - b), rel = a => (a - ac + 360) % 360;
      const lo = A.reduce((b, a) => (rel(a) > rel(b) ? a : b)), hi = A.reduce((b, a) => (rel(a) < rel(b) ? a : b));
      Object.assign(e, { t: 'arc', a0: hi, a1: lo }); return;
    }
    // an arc: by its angle from its start
    const sw = ((e.a1 - e.a0) % 360 + 360) % 360 || 360, rel = a => ((a - e.a0) % 360 + 360) % 360, tc = rel(ac);
    const ts = X.map(rel).filter(t => t > 1e-6 && t < sw - 1e-6), t0 = Math.max(0, ...ts.filter(t => t < tc)), t1 = Math.min(sw, ...ts.filter(t => t > tc));
    if (t0 === 0 && t1 === sw) { MD.ents = MD.ents.filter(x => x !== e); dropRefs(e.id); return; }
    if (t0 === 0) { dropRefs(e.id, ['p0']); e.a0 = e.a0 + t1; return; }
    if (t1 === sw) { dropRefs(e.id, ['p1']); e.a1 = e.a0 + t0; return; }
    const n = normEnt({ t: 'arc', c: e.c.slice(), r: e.r, a0: e.a0 + t1, a1: e.a1, k: e.k });
    for (const c of MD.cons) for (const r of c.r) if (r.e === e.id && r.k === 'p1') r.e = n.id;
    MD.dims = MD.dims.filter(dd => !dd.r.some(r => r.e === e.id));
    e.a1 = e.a0 + t0; MD.ents.push(n);
  }, 'That trim');
}
/* a corner where two lines meet rounded: an arc tangent to both, its radius a dimension */
function filletAt(q, tol) {
  const ends = [];
  for (const e of MD.ents) if (e.t === 'line' && !e.k) for (const k of ['a', 'b']) if (Math.hypot(e[k][0] - q[0], e[k][1] - q[1]) < tol) ends.push({ e, k });
  if (ends.length < 2) { toast('Click a corner where two lines meet'); return false; }
  const [A, B] = ends, P = A.e[A.k], other = x => x.e[x.k === 'a' ? 'b' : 'a'];
  const u1 = unit2([other(A)[0] - P[0], other(A)[1] - P[1]]), u2 = unit2([other(B)[0] - P[0], other(B)[1] - P[1]]);
  const cosT = u1[0] * u2[0] + u1[1] * u2[1], th = Math.acos(Math.max(-1, Math.min(1, cosT))) / 2;
  if (!(th > 1e-3 && th < Math.PI / 2 - 1e-3)) { toast('Those lines do not make a corner to round'); return false; }
  const r = MD.filletR > 0 ? MD.filletR : 2, t = r / Math.tan(th), bis = unit2([u1[0] + u2[0], u1[1] + u2[1]]), cc = [P[0] + bis[0] * r / Math.sin(th), P[1] + bis[1] * r / Math.sin(th)];
  const L1 = Math.hypot(other(A)[0] - P[0], other(A)[1] - P[1]), L2 = Math.hypot(other(B)[0] - P[0], other(B)[1] - P[1]);
  if (t >= Math.min(L1, L2)) { toast('That radius is too big for these lines'); return false; }
  const T1 = [P[0] + u1[0] * t, P[1] + u1[1] * t], T2 = [P[0] + u2[0] * t, P[1] + u2[1] * t];
  const a1 = Math.atan2(T1[1] - cc[1], T1[0] - cc[0]) / deg, a2 = Math.atan2(T2[1] - cc[1], T2[0] - cc[0]) / deg;
  const sw = ((a2 - a1) % 360 + 360) % 360, arc = normEnt(sw <= 180 ? { t: 'arc', c: cc, r, a0: a1, a1: a2 } : { t: 'arc', c: cc, r, a0: a2, a1: a1 });
  const k1 = sw <= 180 ? 'p0' : 'p1', k2 = sw <= 180 ? 'p1' : 'p0';
  return changeSketch(() => {
    MD.cons = MD.cons.filter(c => !(c.t === 'coincident' && c.r.some(x => x.e === A.e.id && x.k === A.k) && c.r.some(x => x.e === B.e.id && x.k === B.k)));
    // the corner kept as a point (its "virtual sharp", on both lines): the lines' lengths measured to it, so the
    // dimensions mean what they did
    const vs = normEnt({ t: 'point', c: P.slice(), k: true });
    MD.ents.push(vs);
    MD.cons.push(mkCon('oncurve', { e: vs.id, k: 'c' }, { e: A.e.id }), mkCon('oncurve', { e: vs.id, k: 'c' }, { e: B.e.id }));
    for (const X of [A, B]) for (const d of MD.dims) if (d.t === 'len' && d.r[0].e === X.e.id) { d.t = 'dist'; d.r = [{ e: X.e.id, k: X.k === 'a' ? 'b' : 'a' }, { e: vs.id, k: 'c' }]; }
    A.e[A.k] = T1; B.e[B.k] = T2; MD.ents.push(arc);
    MD.cons.push(mkCon('coincident', { e: A.e.id, k: A.k }, { e: arc.id, k: k1 }), mkCon('coincident', { e: B.e.id, k: B.k }, { e: arc.id, k: k2 }),
      Object.assign(mkCon('tangent', { e: A.e.id }, { e: arc.id }), { at: k1 }), Object.assign(mkCon('tangent', { e: B.e.id }, { e: arc.id }), { at: k2 }));
    MD.dims.push({ id: sketchId('d'), t: 'rad', r: [{ e: arc.id }], v: r });
  }, 'That fillet');
}
const unit2 = v => { const L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L]; };

/* ---------- selecting and changing what is drawn ---------- */
function segDist(p, a, b) { const d = [b[0] - a[0], b[1] - a[1]], L2 = d[0] * d[0] + d[1] * d[1], t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]); }
function entAt(q, tol) {
  let best = null, bd = tol;
  for (const e of MD.ents) {
    const P = entOutline(e), closed = !(e.t === 'line' || e.t === 'arc');
    for (let i = 0; i + (closed ? 0 : 1) < P.length; i++) { const d = segDist(q, P[i], P[(i + 1) % P.length]); if (d < bd) { bd = d; best = e; } }
  }
  return best;
}
function mdSelected() { return MD.ents.filter(e => MD.sel.has(e.id)); }
function mapSel(f, copy) {
  const S = mdSelected(); if (!S.length) { toast('Select shapes first (the Select tool)'); return; }
  push();
  const made = S.map(e => entMap(e, f)).filter(Boolean);
  if (copy) { MD.ents.push(...made); MD.sel = new Set(made.map(e => e.id)); }
  else { const by = new Map(S.map((e, i) => [e.id, made[i]])); MD.ents = MD.ents.map(e => (by.has(e.id) && by.get(e.id) ? Object.assign(by.get(e.id), { id: e.id }) : e)); }
  drawCard(); redraw();
}
function patternLinear(n, dx, dy) {
  const S = mdSelected(); if (!S.length) { toast('Select shapes first (the Select tool)'); return; }
  push();
  for (let i = 1; i < n; i++) for (const e of S) { const m = entMap(e, moveMap(dx * i, dy * i)); if (m) MD.ents.push(m); }
  drawCard(); redraw();
}
function patternCircular(n, total, c) {
  const S = mdSelected(); if (!S.length) { toast('Select shapes first (the Select tool)'); return; }
  push();
  const step = Math.abs(total - 360) < 1e-9 ? 360 / n : total / Math.max(1, n - 1);
  for (let i = 1; i < n; i++) for (const e of S) { const m = entMap(e, turnMap(c, step * i)); if (m) MD.ents.push(m); }
  drawCard(); redraw();
}
function useEdge(seg) {
  const P = sketchPlane(), a = toUV(P, seg[0]), b = toUV(P, seg[1]);
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) { toast('That edge points straight through the plane: it has no length on it'); return; }
  addEnt(normEnt({ t: 'line', a, b, k: MD.constr }));
}
// the edges lying in the plane (a face's outline, from the face picked): all brought in
function useEdgesInPlane() {
  const P = sketchPlane(), n = planeNormal(P), near = p => Math.abs(dot([p[0] - P.o[0], p[1] - P.o[1], p[2] - P.o[2]], n)) < 0.02;
  const E = (MD.edges || []).filter(s => near(s[0]) && near(s[1]));
  if (!E.length) { toast('No part has edges in this plane'); return; }
  push();
  for (const s of E) { const a = toUV(P, s[0]), b = toUV(P, s[1]); if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6) MD.ents.push(normEnt({ t: 'line', a, b })); }
  toast('Brought in ' + E.length + ' edges'); drawCard(); redraw();
}
function edgeUnder(e) {
  const K = kit(), b = K.D.cv.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top;
  let best = null, bd = 8;
  const scr = p => { const v = mdV3(K, p).project(K.R.camera); return [(v.x + 1) / 2 * K.R.w, (1 - v.y) / 2 * K.R.h, v.z]; };
  for (const s of MD.edges || []) { const a = scr(s[0]), c = scr(s[1]); if (a[2] > 1 || c[2] > 1) continue; const d = segDist([mx, my], a, c); if (d < bd) { bd = d; best = s; } }
  return best;
}

/* ---------- extrude and revolve: the solid it would make, and making it ---------- */
function solidSpec() {
  const X = MD.ex;
  const reg = X.regions && X.regions.length ? { regions: X.regions } : {};
  return Object.assign(MD.stage === 'revolve' ? { t: 'revolve', axis: X.axis, deg: X.deg } : { t: 'extrude', d: X.d, both: X.both, through: X.through && X.op === 'cut' }, reg);
}
// the model the solid goes into, and the sketch in its frame: a new part's (the bench's axes), or the target's
function modelFor() {
  const X = MD.ex, el = X.op !== 'new' && X.target && getEl(X.target);
  const P = sketchPlane();
  if (el) return { el, plane: planeToModel(el, P) };
  return { el: null, plane: { o: P.o, x: P.x, y: P.y } };
}
let prevBusy = 0;
function preview() {
  const K = kit(), W = manifoldNow();
  if (!K || !W || (MD.stage !== 'extrude' && MD.stage !== 'revolve')) return;
  const id = ++prevBusy;
  const { el, plane } = modelFor(), sk = { id: 'psk', t: 'sketch', plane, ents: MD.ents, cons: MD.cons, dims: MD.dims }, f = Object.assign({ id: 'pf', sk: 'psk', op: MD.ex.op === 'cut' ? 'cut' : 'add' }, solidSpec());
  let r;
  try { r = featPreview(W, { feats: [sk] }, Object.assign(f, f.t === 'extrude' && f.through ? { through: false, both: true, d: 400 } : {})); } catch (err) { r = { error: String(err.message || err) }; }
  if (id !== prevBusy) return;
  dropPrev();
  MD.prevErr = r.error || '';
  if (r.T && r.T.length) {
    const T2 = new Float32Array(r.T.length);
    for (let i = 0; i < r.T.length; i += 3) { const w = el ? modelToWorld(el, [r.T[i], r.T[i + 1], r.T[i + 2]]) : [r.T[i], r.T[i + 1], r.T[i + 2]]; T2[i] = w[0]; T2[i + 1] = w[1]; T2[i + 2] = w[2]; }
    const geo = new K.T.BufferGeometry(); geo.setAttribute('position', new K.T.BufferAttribute(T2, 3)); geo.computeVertexNormals();
    MD.prev = new K.T.Mesh(geo, new K.T.MeshStandardMaterial({ color: MD.ex.op === 'cut' ? 0xe0312f : 0x2fa35a, transparent: true, opacity: 0.45, roughness: 0.6, depthWrite: false, side: K.T.DoubleSide }));
    MD.prev.renderOrder = 15;
  }
  drawCard(); redraw();
}
// the arrow to drag an extrude's length: from the middle of its regions, along the plane's normal, as long as it
function arrowGeom() {
  const { loops } = sketchLoops(MD.ents); if (!loops.length) return null;
  const outer = loops.filter(q => q.depth === 0); let su = 0, sv = 0, n = 0;
  for (const L of outer) for (const p of L.pts) { su += p[0]; sv += p[1]; n++; }
  const P = sketchPlane(), nn = planeNormal(P), base = fromUV(P, [su / n, sv / n]), d = MD.ex.both ? MD.ex.d / 2 : MD.ex.d;
  return { base, tip: [base[0] + nn[0] * d, base[1] + nn[1] * d, base[2] + nn[2] * d], n: nn };
}
/* the sketch and its solid made into a part: a new one, or the target's next features */
export async function commitSolid() {
  const W = await manifoldLib();
  if (!sketchLoops(MD.ents).loops.length) { toast('The sketch has no closed shape: close a loop of lines, or draw a rectangle or circle', true); return false; }
  const spec = solidSpec();
  if (spec.t === 'revolve' && !MD.ents.some(e => e.id === spec.axis && e.t === 'line')) { toast('Pick the line to revolve about (its axis)', true); return false; }
  const P = sketchPlane();
  checkpoint();
  let el;
  if (MD.ex.op === 'new' || !MD.ex.target || !getEl(MD.ex.target)) {
    el = normElement(Object.assign(newModelPart(P, MD.ents, spec, nextName('Model'), { cons: MD.cons, dims: MD.dims }), { bench: project.tab }));
    const r = rebuildPart(W, el, setZ);
    if (!r.ok) { toast('That made no solid: ' + r.errors.map(q => q[1]).join('; '), true); return false; }
    project.elements.push(el);
  } else {
    el = getEl(MD.ex.target);
    const keep = JSON.stringify({ model: el.model, mesh: el.mesh, x: el.x, y: el.y, z: el.z });
    const nS = el.model.feats.filter(f => f.t === 'sketch').length + 1, nF = el.model.feats.filter(f => f.t === spec.t).length + 1;
    const sk = { id: modelId(), t: 'sketch', name: 'Sketch ' + nS, plane: planeToModel(el, P), ents: MD.ents.map(normEnt).filter(Boolean), cons: MD.cons, dims: MD.dims };
    const f = Object.assign({ id: modelId(), name: (spec.t === 'revolve' ? 'Revolve ' : 'Extrude ') + nF, sk: sk.id, op: MD.ex.op === 'cut' ? 'cut' : 'add' }, spec);
    el.model.feats.push(sk, f);
    el.model = normModel(el.model);
    const r = rebuildPart(W, el, setZ);
    if (!r.ok || r.errors.length) { Object.assign(el, JSON.parse(keep)); toast('That did not work: ' + (r.errors.map(q => q[1]).join('; ') || 'no solid left'), true); return false; }
  }
  meshCache.delete(el.id); meshHullCache.delete(el.id);
  changed(true);
  toast((MD.ex.op === 'cut' ? 'Cut from ' : MD.ex.op === 'add' ? 'Added to ' : 'Made ') + el.name + ': ' + el.mesh.n + ' triangles');
  MD.lastMade = el.id;
  MD.ents = []; MD.edit = null;
  setStage('plane');
  return true;
}
/* a part's sketch, changed: the part made again (left as it was if it cannot be) */
async function commitEdit() {
  const W = await manifoldLib(), el = getEl(MD.edit.id); if (!el) { stopModel(); return false; }
  const sk = el.model.feats.find(f => f.id === MD.edit.sk); if (!sk) { stopModel(); return false; }
  checkpoint();
  const keep = JSON.stringify({ model: el.model, mesh: el.mesh, x: el.x, y: el.y, z: el.z });
  sk.ents = MD.ents.map(normEnt).filter(Boolean); sk.cons = MD.cons; sk.dims = MD.dims;
  Object.assign(sk, normModel({ feats: [sk] }).feats[0]);
  if (MD.offset) { const n = planeNormal(sk.plane); sk.plane.o = sk.plane.o.map((v, i) => v + n[i] * MD.offset); }
  const r = rebuildPart(W, el, setZ);
  if (!r.ok || r.errors.length) { Object.assign(el, JSON.parse(keep)); toast('The part could not be made from that sketch: ' + (r.errors.map(q => q[1]).join('; ') || 'nothing left'), true); return false; }
  meshCache.delete(el.id); meshHullCache.delete(el.id);
  changed(true); toast(el.name + ' made again: ' + el.mesh.n + ' triangles');
  MD.edit = null; MD.ents = []; MD.offset = 0;
  setStage('plane');
  return true;
}
/* a part's sketch opened from its panel: the 3D view on, the Model tools on, in the sketch */
export async function editSketch(el, skId) {
  const sk = el.model && el.model.feats.find(f => f.id === skId); if (!sk) return;
  if (!V3D.active()) await V3D.setOn(true);
  if (!kit()) return;
  if (!MD.on) modelEnter();
  const P = planeToWorld(el, sk.plane);
  MD.offset = 0;
  enterSketch({ plane: normPlane(P), p: modelToWorld(el, sk.plane.o), src: { kind: 'face', id: el.id } }, sk.ents, { id: el.id, sk: skId }, sk.cons, sk.dims);
}

/* ---------- a modelled part made again after its panel changes it ---------- */
export async function rebuildLater(el) {
  let W;
  try { W = await manifoldLib(); } catch (err) { toast('The modelling library could not be loaded', true); return; }
  const keep = JSON.stringify({ model: el.model, mesh: el.mesh, x: el.x, y: el.y, z: el.z });
  const r = rebuildPart(W, el, setZ);
  if (!r.ok) { Object.assign(el, JSON.parse(keep)); toast('That leaves no solid: ' + r.errors.map(q => q[1]).join('; '), true); }
  else if (r.errors.length) toast('Made, but: ' + r.errors.map(q => q[1]).join('; '));
  meshCache.delete(el.id); meshHullCache.delete(el.id);
  changed(true);
}
/* the part's triangles as a .stl file, in its own frame (mm): to make it */
export function exportModelStl(el) {
  if (!accountGate('export an STL')) return;
  const M = el && el.mesh; if (!M) return;
  const T = meshTris(M), name = (el.name || 'model').replace(/[^\w.-]+/g, '_') + '.stl';
  downloadFile(name, new Blob([stlBytes(T, el.name)], { type: 'model/stl' }));
  toast('Exported ' + name + ' (' + Math.floor(T.length / 9) + ' triangles, mm)');
}

/* ---------- the toolbar across the top, as a CAD program's: icons, menus, and a strip under it ----------
   The bar: what the stage offers (picking a plane, sketching, an extrude or a revolve), each tool an icon with its name
   on hover, some with a menu (▾); under it, a strip with what the moment needs (a shape's sizes as it is drawn, the
   selection's sizes, a pattern's counts, the sketch's closed shapes) */
const mdNum = (label, get, set, opts) => {
  opts = opts || {};
  const inp = h('input', { type: 'text', inputmode: 'decimal', spellcheck: 'false', 'aria-label': label, value: get() === undefined || get() === null ? '' : String(+(+get()).toFixed(4)), placeholder: opts.placeholder || '' });
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); const v = opts.raw ? +inp.value : parseLength(inp.value); if (v !== null && isFinite(v)) { set(v, true); } } if (e.key === 'Escape') { inp.blur(); } });
  inp.addEventListener('input', () => { const v = opts.raw ? +inp.value : parseLength(inp.value); if (v !== null && isFinite(v) && inp.value.trim() !== '') set(v, false); });
  if (opts.live) inp.dataset.live = opts.live;
  return h('label', { class: 'rt-mdlf' }, h('span', null, label), inp);
};
// the icons: 20 px line drawings in the ink's colour
const ICO = {
  sketch: '<path d="M3 17h14M4 13l8.5-8.5 3 3L7 16H4z"/><path d="M11 6l3 3"/>',
  line: '<path d="M4 16L16 4"/><circle cx="4" cy="16" r="1.6"/><circle cx="16" cy="4" r="1.6"/>',
  arc: '<path d="M4 15a8 8 0 0 1 12-10"/><circle cx="4" cy="15" r="1.6"/><circle cx="16" cy="5" r="1.6"/>',
  rect: '<rect x="3.5" y="5.5" width="13" height="9" rx="0.5"/>',
  circle: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="0.9" fill="currentColor"/>',
  slot: '<rect x="2.5" y="6.5" width="15" height="7" rx="3.5"/><circle cx="6" cy="10" r="0.8" fill="currentColor"/><circle cx="14" cy="10" r="0.8" fill="currentColor"/>',
  poly: '<path d="M10 3l6 3.5v7L10 17l-6-3.5v-7z"/>',
  hole: '<circle cx="10" cy="10" r="5"/><path d="M10 2.5v4M10 13.5v4M2.5 10h4M13.5 10h4"/>',
  select: '<path d="M5 3l10 6.5-4.5 1L13 16l-2 1-2.5-5.5L5 15z"/>',
  use: '<rect x="3.5" y="3.5" width="13" height="13" stroke-dasharray="2 2"/><path d="M3.5 16.5h13" stroke-width="2.4"/>',
  mirror: '<path d="M10 2.5v15" stroke-dasharray="2 1.6"/><path d="M8 5L3 14h5zM12 5l5 9h-5z"/>',
  pattern: '<rect x="3" y="3" width="4" height="4"/><rect x="13" y="3" width="4" height="4"/><rect x="3" y="13" width="4" height="4"/><rect x="13" y="13" width="4" height="4"/>',
  constr: '<path d="M3 17L17 3" stroke-dasharray="2.5 2"/>',
  grid: '<path d="M3 7h14M3 13h14M7 3v14M13 3v14"/>',
  undo: '<path d="M7 5L3 9l4 4"/><path d="M3 9h9a4.5 4.5 0 0 1 0 9H8"/>',
  redo: '<path d="M13 5l4 4-4 4"/><path d="M17 9H8a4.5 4.5 0 0 0 0 9h4"/>',
  extrude: '<path d="M4 15l6 3 6-3-6-3z"/><path d="M10 12V3M7 6l3-3 3 3"/>',
  revolve: '<path d="M10 2v16" stroke-dasharray="2 1.6"/><path d="M5 7a6 3 0 1 0 10 0"/><path d="M13 4l2 3-3 1"/>',
  ok: '<path d="M4 10.5l4 4 8-9" stroke-width="2.2"/>',
  cancel: '<path d="M5 5l10 10M15 5L5 15" stroke-width="2"/>',
  flip: '<path d="M7 3v14M4 6l3-3 3 3M13 17V3M10 14l3 3 3-3"/>',
  both: '<path d="M10 2v16M7 5l3-3 3 3M7 15l3 3 3-3M4 10h12"/>',
  through: '<path d="M3 10h14M14 7l3 3-3 3"/><path d="M8 4v12M12 4v12" stroke-dasharray="1.6 1.6"/>',
  plane: '<path d="M2.5 13l5-6h10l-5 6z"/>',
  carc: '<path d="M4 15a8 8 0 0 1 12-10"/><circle cx="12" cy="14" r="1.3" fill="currentColor"/><circle cx="4" cy="15" r="1.4"/><circle cx="16" cy="5" r="1.4"/>',
  tarc: '<path d="M2 15h6"/><path d="M8 15a6 6 0 0 0 8-8"/><circle cx="8" cy="15" r="1.4"/>',
  crect: '<rect x="3.5" y="5.5" width="13" height="9"/><circle cx="10" cy="10" r="1" fill="currentColor"/>',
  point: '<circle cx="10" cy="10" r="2.2" fill="currentColor"/>',
  dim: '<path d="M3 6v8M17 6v8M3 10h14"/><path d="M5.5 8L3 10l2.5 2M14.5 8l2.5 2-2.5 2"/>',
  trim: '<path d="M3 16L17 4" stroke-dasharray="2 2"/><path d="M3 4l5 5M8 4L3 9"/>',
  fillet: '<path d="M4 17V9a5 5 0 0 1 5-5h8"/>',
  coincident: '<circle cx="8" cy="10" r="4"/><circle cx="12" cy="10" r="4"/><circle cx="10" cy="10" r="1" fill="currentColor"/>',
  concentric: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3.5"/>',
  parallel: '<path d="M6 16L12 4M10 16l6-12"/>',
  tangent: '<circle cx="10" cy="11" r="5"/><path d="M2 6h16"/>',
  horizontal: '<path d="M3 10h14"/><text x="10" y="7" font-size="6" text-anchor="middle" fill="currentColor" stroke="none">H</text>',
  vertical: '<path d="M10 3v14"/><text x="14" y="12" font-size="6" fill="currentColor" stroke="none">V</text>',
  perpendicular: '<path d="M4 16h12M10 16V4"/><path d="M10 13h3v3"/>',
  equal: '<path d="M4 8h12M4 12h12"/>',
  midpoint: '<path d="M3 15L17 5"/><circle cx="10" cy="10" r="2" fill="currentColor"/>',
  fix: '<path d="M10 3v8M6 7h8"/><path d="M5 12a5 5 0 0 0 10 0"/>',
  symmetric: '<path d="M10 3v14" stroke-dasharray="2 1.6"/><circle cx="5" cy="10" r="1.6"/><circle cx="15" cy="10" r="1.6"/>',
};
const icon = k => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 20 20'); s.setAttribute('width', '20'); s.setAttribute('height', '20'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.5'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.innerHTML = ICO[k] || ''; return s; };
// a tool's button: its icon (and its word, where it helps), its name on hover; on, pressed
function tbtn(ic, title, fn, o) {
  o = o || {};
  const b = h('button', { type: 'button', class: 'rt-tb' + (o.on ? ' on' : '') + (o.cls ? ' ' + o.cls : '') + (o.text ? ' wide' : ''), title, 'aria-label': title, 'aria-pressed': o.on === undefined ? undefined : String(!!o.on), onclick: fn }, icon(ic), o.text ? h('span', null, o.text) : null);
  if (o.disabled) b.disabled = true;
  return b;
}
// a menu under a button (▾): its items [label, do, on?]; one open at a time, closed by a click anywhere else
let mdMenuOpen = null;
function closeMdMenu() { if (mdMenuOpen) { mdMenuOpen.remove(); mdMenuOpen = null; } }
function tmenu(ic, title, items, o) {
  o = o || {};
  const main = o.main ? tbtn(ic, title, o.main, { on: o.on, text: o.text }) : null;
  const car = h('button', { type: 'button', class: 'rt-tb rt-tbcar' + (!main && o.on ? ' on' : '') + (!main && o.text ? ' wide' : ''), title: main ? title + ': more' : title, 'aria-label': main ? title + ': more' : title, 'aria-haspopup': 'true' },
    main ? null : icon(ic), !main && o.text ? h('span', null, o.text) : null, h('span', { class: 'rt-car', 'aria-hidden': 'true' }, '▾'));
  car.addEventListener('click', e => {
    e.stopPropagation();
    if (mdMenuOpen && mdMenuOpen._for === car) { closeMdMenu(); return; }
    closeMdMenu();
    const m = h('div', { class: 'rt-tbmenu', role: 'menu' }, ...items.map(([label, fn, on]) => label === '-' ? h('hr') : h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': on ? 'true' : 'false', class: on ? 'on' : '', onclick: ev => { ev.stopPropagation(); closeMdMenu(); fn(); } }, label)));
    m._for = car;
    const K = kit(), r = car.getBoundingClientRect(), sr = K.D.stage.getBoundingClientRect();
    m.style.left = (r.left - sr.left) + 'px'; m.style.top = (r.bottom - sr.top + 2) + 'px';
    K.D.stage.append(m); mdMenuOpen = m;
  });
  return h('div', { class: 'rt-tbgrp' }, main, car);
}
// Extrude, Revolve: from the sketch (or the one to the other)
function startExtrude() { const { loops } = sketchLoops(MD.ents); if (!loops.length) { toast('Close a shape first'); return; } setStage('extrude'); manifoldLib().then(preview); }
function startRevolve() { const { loops } = sketchLoops(MD.ents); if (!loops.length) { toast('Close a shape first'); return; } const ax = MD.ents.find(e => MD.sel.has(e.id) && e.t === 'line') || MD.ents.find(e => e.k && e.t === 'line'); MD.ex.axis = ax ? ax.id : null; setStage('revolve'); manifoldLib().then(preview); }
const sep = () => h('span', { class: 'rt-tbsep', 'aria-hidden': 'true' });
const setTool = k => { MD.tool = k; MD.draft = []; MD.draftSnaps = []; MD.typed = {}; MD.pickFor = null; drawCard(); redraw(); const K = kit(); if (K) K.hint(); };
function drawCard() {
  const K = kit(); if (!K) return;
  if (!MD.card) {
    MD.card = h('div', { class: 'rt-mdltop', role: 'toolbar', 'aria-label': 'Model' });
    K.D.stage.append(MD.card);
    // a click away from an open menu closes it, and only that (on the 3D view it draws nothing)
    document.addEventListener('pointerdown', e => {
      if (!mdMenuOpen || mdMenuOpen.contains(e.target) || (mdMenuOpen._for && mdMenuOpen._for.contains(e.target))) return;
      closeMdMenu();
      const K2 = kit(); if (K2 && e.target === K2.D.cv) { e.stopPropagation(); e.preventDefault(); }
    }, true);
  }
  if (!MD.tip) { MD.tip = h('div', { class: 'rt-mdltip', hidden: true }); K.D.stage.append(MD.tip); }
  closeMdMenu();
  const C = MD.card; C.replaceChildren();
  C.hidden = !MD.on; K.D.stage.classList.toggle('rt-mdlon', MD.on);
  if (!MD.on) return;
  // three rows, as in Onshape: the features (Sketch ▾, Extrude, Revolve), under it the tools of the one in hand, then
  // a strip with what the moment needs
  // the features (Sketch, Extrude, Revolve) go down the rail; here, the tools of the one in hand, then a strip with what
  // the moment needs
  const tools = h('div', { class: 'rt-tbar rt-tbtools' }), sub = h('div', { class: 'rt-tbsub' });
  // (what is not there, null, is left out: append would write it as text)
  for (const box of [tools, sub]) { const add = box.append.bind(box); box.append = (...n) => add(...n.flat().filter(x => x !== null && x !== undefined && x !== false)); }
  C.append(tools, sub);
  modelRailSync();
  const planes = [['Table top', () => enterSketch(namedPlane('table'))], ['Beam plane', () => enterSketch(namedPlane('beam'))], ['Front plane (x, up)', () => enterSketch(namedPlane('front'))], ['Side plane (y, up)', () => enterSketch(namedPlane('side'))]];
  const st = MD.stage;
  if (st === 'plane') {
    tools.append(h('b', { class: 'rt-tbname' }, 'Sketch'), sep(),
      tmenu('sketch', 'A plane of the bench\u2019s own, through the point the view looks at', planes, { text: 'Plane' }),
      mdNum('Offset (mm)', () => MD.offset, v => { MD.offset = v; }), sep(),
      tbtn('cancel', 'Close the Model tools (Esc)', stopModel, { cls: 'rt-tbno' }));
    sub.append(h('span', { class: 'rt-mdlnote' }, 'Click a flat face to sketch on (a part\u2019s, or the table); empty space is the beam\u2019s plane. Or pick a plane.'));
    return;
  }
  if (st === 'sketch') {
    const T = MD.tool, on = k => T === k;
    const holeItems = HOLE_SIZES.map(([n, d]) => [n + ' (' + d + ' mm)', () => { MD.holeStd = n; MD.holeD = d; setTool('hole'); }, MD.holeStd === n]).concat([['-'], ['A diameter of my own…', () => { MD.holeStd = ''; setTool('hole'); }, !MD.holeStd]]);
    const polyItems = [3, 4, 5, 6, 8, 10, 12].map(n => [n + ' sides', () => { MD.polyN = n; setTool('poly'); }, MD.polyN === n]);
    const gridItems = [0.1, 0.5, 1, 2, 5, 10, 25].map(g => [g + ' mm', () => { MD.grid = g; drawCard(); redraw(); }, MD.grid === g]);
    const selN = MD.sel.size;
    tools.append(MD.edit ? [h('b', { class: 'rt-tbname' }, 'Editing: ' + ((getEl(MD.edit.id) || {}).name || '')), sep()] : null,
      tbtn('line', 'Line (L): click its points; its first again closes it', () => setTool('line'), { on: on('line') }),
      tmenu(T === 'carc' ? 'carc' : T === 'tarc' ? 'tarc' : 'arc', 'Arc (A): 3-point, centre-point or tangent', [['3-point arc', () => setTool('arc'), on('arc')], ['Centre-point arc', () => setTool('carc'), on('carc')], ['Tangent arc (from a line\u2019s end)', () => setTool('tarc'), on('tarc')]],
        { main: () => setTool(/^(arc|carc|tarc)$/.test(T) ? T : 'arc'), on: /^(arc|carc|tarc)$/.test(T) }),
      tmenu(T === 'crect' ? 'crect' : 'rect', 'Rectangle (R): corner or centre', [['Corner rectangle', () => setTool('rect'), on('rect')], ['Centre rectangle', () => setTool('crect'), on('crect')]], { main: () => setTool(T === 'crect' ? 'crect' : 'rect'), on: on('rect') || on('crect') }),
      tbtn('circle', 'Circle (C): its centre, then its edge', () => setTool('circle'), { on: on('circle') }),
      tbtn('slot', 'Slot (O): its two ends, then its width', () => setTool('slot'), { on: on('slot') }),
      tmenu('poly', 'Polygon (P): its centre, then a corner', polyItems, { main: () => setTool('poly'), on: on('poly') }),
      tmenu('hole', 'Hole (H): where it goes; its size from the menu', holeItems, { main: () => setTool('hole'), on: on('hole') }),
      tbtn('point', 'Point: a point to dimension and constrain from', () => setTool('point'), { on: on('point') }), sep(),
      tbtn('dim', 'Dimension (D): a line\u2019s length, a circle\u2019s diameter, between two points, a point and a line, or two lines; double-click one to change it', () => setTool('dim'), { on: on('dim') }), sep(),
      ...CONS_UI.map(([k, tip, key]) => tbtn(k, tip + ' (Shift+' + key + ')', () => applyCon(k), { on: MD.pickCon === k })), sep(),
      tbtn('select', 'Select (S): click points and shapes (Shift: more), drag to move them, Delete to remove', () => setTool('select'), { on: on('select') }),
      tbtn('trim', 'Trim (T): click the piece of a line, circle or arc to take away', () => setTool('trim'), { on: on('trim') }),
      tbtn('fillet', 'Fillet (F): click a corner where two lines meet, to round it', () => setTool('fillet'), { on: on('fillet') }),
      tmenu('use', 'Use edges (U): bring parts\u2019 edges into the sketch', [['Click an edge to bring it in', () => setTool('use'), on('use')], ['All the edges in this plane', useEdgesInPlane]], { main: () => setTool('use'), on: on('use') }),
      tbtn('mirror', 'Mirror the selected shapes: then click the line to mirror across', () => { if (!selN) { toast('Select shapes first'); return; } MD.pickFor = 'mirror'; drawCard(); K.hint(); }, { on: MD.pickFor === 'mirror', disabled: !selN }),
      tmenu('pattern', 'Pattern the selected shapes', [['Linear pattern\u2026', () => { MD.patMode = 'linear'; drawCard(); }], ['Circular pattern\u2026', () => { MD.patMode = 'circular'; drawCard(); }]], { disabled: !selN }),
      tbtn('constr', 'Construction: new shapes (and the selected ones) guide, and make no solid', () => { MD.constr = !MD.constr; if (MD.sel.size) changeSketch(() => { for (const e of mdSelected()) { if (MD.constr) e.k = true; else delete e.k; } }); drawCard(); redraw(); }, { on: MD.constr }), sep(),
      tmenu('grid', 'Grid: the step points snap to (now ' + MD.grid + ' mm)', gridItems, {}),
      tbtn('undo', 'Undo in the sketch (Ctrl+Z)', () => sketchUndo(true), { disabled: !MD.undo.length }),
      tbtn('redo', 'Redo (Ctrl+Y)', () => sketchUndo(false), { disabled: !MD.redo.length }), sep());
    const { loops, open } = sketchLoops(MD.ents);
    tools.append(MD.edit ? tbtn('ok', 'Finish: make the part again from this sketch', () => commitEdit(), { cls: 'rt-tbok', text: 'Finish' }) : null,
      tbtn('cancel', 'Leave the sketch, making nothing', () => { MD.edit = null; MD.ents = []; setStage('plane'); }, { cls: 'rt-tbno' }));
    // the strip: what the moment needs
    if (MD.draft.length) { const L = typedFields(); if (L.length) sub.append(h('div', { class: 'rt-mdlrow rt-mdltyped' }, ...L)); }
    if (T === 'hole') sub.append(h('span', { class: 'rt-mdlnote' }, 'Hole: ' + (MD.holeStd ? MD.holeStd + ', ' + MD.holeD + ' mm' : 'its diameter') + (MD.holes ? ' · snaps to the table’s holes' : '')), MD.holeStd ? null : mdNum('Diameter (mm)', () => MD.holeD, v => { MD.holeD = Math.max(0.05, v); }));
    if (T === 'select' && selN === 1 && !MD.selP.size) sub.append(selFields(mdSelected()[0]));
    if (MD.selD.size === 1) {
      const d = MD.dims.find(x => MD.selD.has(x.id));
      if (d) sub.append(h('div', { class: 'rt-mdlrow' }, mdNum(DIM_NAMES[d.t] + (d.t === 'ang' ? ' (\u00b0)' : ' (mm)'), () => d.v, (v, enter) => { if (enter) setDimValue(d.id, v); }, { raw: d.t === 'ang' }),
        d.t === 'dist' ? tmenu('dim', 'Measured: aligned, across or up', [['Aligned', () => changeSketch(() => { delete d.dir; delete d.s; d.v = Math.abs(dimMeasure(MD.ents, d)); }), !d.dir], ['Across (horizontal)', () => changeSketch(() => { d.dir = 'h'; delete d.s; const m = dimMeasure(MD.ents, d); if (m < 0) d.s = -1; d.v = Math.abs(m); }), d.dir === 'h'], ['Up (vertical)', () => changeSketch(() => { d.dir = 'v'; delete d.s; const m = dimMeasure(MD.ents, d); if (m < 0) d.s = -1; d.v = Math.abs(m); }), d.dir === 'v']], { text: d.dir === 'h' ? 'Across' : d.dir === 'v' ? 'Up' : 'Aligned' }) : null,
        tbtn('cancel', 'Delete this dimension', deleteSelected, { cls: 'rt-tbno' })));
    }
    if (MD.selC.size) sub.append(h('span', { class: 'rt-mdlnote' }, MD.selC.size + ' constraint' + (MD.selC.size > 1 ? 's' : '') + ' selected: Delete takes ' + (MD.selC.size > 1 ? 'them' : 'it') + ' off'));
    if (T === 'fillet') sub.append(mdNum('Fillet radius (mm)', () => MD.filletR, v => { if (v > 0) MD.filletR = v; }));
    if (MD.pickCon) sub.append(h('span', { class: 'rt-mdlnote' }, (CONS_UI.find(q => q[0] === MD.pickCon) || [0, ''])[1] + ': click them'));
    if (selN && MD.patMode) {
      const P = MD.pat || (MD.pat = { n: 3, dx: 10, dy: 0, cn: 6, ang: 360 });
      if (MD.patMode === 'linear') sub.append(h('div', { class: 'rt-mdlrow' }, h('b', null, 'Linear pattern'), mdNum('Copies', () => P.n, v => { P.n = Math.max(2, Math.min(100, Math.round(v))); }, { raw: true }), mdNum('Step x (mm)', () => P.dx, v => { P.dx = v; }), mdNum('Step y (mm)', () => P.dy, v => { P.dy = v; }),
        tbtn('ok', 'Make the copies', () => { patternLinear(P.n, P.dx, P.dy); MD.patMode = null; drawCard(); }, { cls: 'rt-tbok' }), tbtn('cancel', 'No pattern', () => { MD.patMode = null; drawCard(); })));
      else sub.append(h('div', { class: 'rt-mdlrow' }, h('b', null, 'Circular pattern'), mdNum('Copies', () => P.cn, v => { P.cn = Math.max(2, Math.min(360, Math.round(v))); }, { raw: true }), mdNum('Over (°)', () => P.ang, v => { P.ang = Math.max(1, Math.min(360, v)); }, { raw: true }),
        tbtn('ok', 'Then click its centre', () => { MD.pickFor = 'centre'; MD.patMode = null; drawCard(); K.hint(); }, { cls: 'rt-tbok', text: 'Pick centre' }), tbtn('cancel', 'No pattern', () => { MD.patMode = null; drawCard(); })));
    }
    const drawn = MD.ents.filter(e => !e.k), undef = drawn.filter(e => !MD.defined.has(e.id)).length;
    sub.append(mdNum('Offset (mm)', () => MD.offset, v => { MD.offset = v; workSnaps(); redraw(); }),
      h('span', { class: 'rt-mdlnote' + (drawn.length && !undef ? ' rt-mdldef' : '') }, (drawn.length ? (undef ? undef + ' of ' + drawn.length + ' shapes not yet fully defined (blue)' : 'Fully defined') + ' \u00b7 ' : '') + loops.length + ' closed shape' + (loops.length === 1 ? '' : 's') + (open.length ? ', ' + open.length + ' open' : '') + (MD.beam && MD.beam.mids.length ? ' \u00b7 red: where the light crosses' : '')));
    return;
  }
  // extrude or revolve: the feature's own bar
  const X = MD.ex, rev = MD.stage === 'revolve';
  const models = project.elements.filter(e => e.bench === project.tab && e.type === 'stl' && e.model);
  const target = X.target && getEl(X.target), opText = X.op === 'new' || !target ? 'New part' : (X.op === 'cut' ? 'Cut from ' : 'Add to ') + target.name;
  const opItems = [['A new part', () => { X.op = 'new'; X.target = null; preview(); }, X.op === 'new']].concat(models.length ? [['-']] : [],
    models.flatMap(m => [['Add to ' + m.name, () => { X.op = 'add'; X.target = m.id; preview(); }, X.op === 'add' && X.target === m.id], ['Cut from ' + m.name, () => { X.op = 'cut'; X.target = m.id; preview(); }, X.op === 'cut' && X.target === m.id]]));
  tools.append(h('b', { class: 'rt-tbname' }, rev ? 'Revolve' : 'Extrude'), sep(), tmenu(X.op === 'cut' ? 'through' : 'extrude', 'What it makes', opItems, { text: opText }), sep());
  if (!rev) {
    if (!(X.through && X.op === 'cut')) tools.append(mdNum('Distance (mm)', () => X.d, (v, enter) => { if (v !== 0) X.d = v; preview(); if (enter) commitSolid(); }, { live: 'd' }));
    tools.append(tbtn('flip', 'Flip: the other way', () => { X.d = -X.d; drawCard(); preview(); }),
      tbtn('both', 'Both ways: as far each side of the sketch', () => { X.both = !X.both; preview(); }, { on: X.both }),
      X.op === 'cut' ? tbtn('through', 'Through all: right through the part', () => { X.through = !X.through; preview(); }, { on: X.through }) : null);
  } else {
    const lines0 = MD.ents.filter(e => e.t === 'line'), axis = lines0.find(e => e.id === X.axis);
    tools.append(tmenu('constr', 'Axis: the line to revolve about', lines0.map((e, i) => ['Line ' + (i + 1) + (e.k ? ' (construction)' : '') + ', ' + (+Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]).toFixed(2)) + ' mm', () => { X.axis = e.id; preview(); }, X.axis === e.id]), { text: axis ? 'Axis: line ' + (lines0.indexOf(axis) + 1) : 'Pick an axis' }),
      mdNum('Angle (°)', () => X.deg, v => { X.deg = Math.max(1, Math.min(360, v)); preview(); }, { raw: true }));
  }
  tools.append(sep(), tbtn('ok', 'OK: make it (Enter)', () => commitSolid(), { cls: 'rt-tbok', text: 'OK' }), tbtn('cancel', 'Back to the sketch (Esc)', () => setStage('sketch'), { cls: 'rt-tbno' }));
  sub.append(h('span', { class: 'rt-mdlnote' + (MD.prevErr ? ' rt-mdlerr' : '') }, MD.prevErr || (rev ? 'Click the sketch\u2019s regions to take or leave out · green adds, red cuts' : 'Click the sketch\u2019s regions to take or leave out · drag the arrow, or type the distance (mm, or 1in) · green adds, red cuts')));
}
// the sizes of the shape being drawn: shown as the pointer moves, typed to set
function typedFields() {
  const e = draftEnt(), T = MD.typed, set = k => (v, enter) => { T[k] = v; if (enter) commitTyped(); else redraw(); };
  const live = (k, v) => (T[k] !== undefined ? T[k] : v);
  if (!e) return [];
  switch (MD.tool) {
    case 'line': { const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), a = Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]) / deg; return [mdNum('Length (mm)', () => live('len', L), set('len'), { live: 'len' }), mdNum('Angle (°)', () => live('angle', a), set('angle'), { raw: true, live: 'angle' })]; }
    case 'rect': return [mdNum('Width (mm)', () => live('w', e.w), set('w'), { live: 'w' }), mdNum('Height (mm)', () => live('h', e.h), set('h'), { live: 'h' })];
    case 'circle': return [mdNum('Diameter (mm)', () => live('d', 2 * e.r), set('d'), { live: 'd' })];
    case 'poly': return [mdNum('Radius (mm)', () => live('r', e.r), set('r'), { live: 'r' })];
    case 'slot': return e.t === 'slot' ? [mdNum('Length (mm)', () => live('len', Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1])), set('len'), { live: 'len' }), mdNum('Width (mm)', () => live('wd', 2 * e.r), set('wd'), { live: 'wd' })] : [];
  }
  return [];
}
// the selected shape's own sizes
function selFields(e) {
  const box = h('div', { class: 'rt-mdlrow' });
  const change = fn => v => changeSketch(() => fn(v));
  switch (e.t) {
    case 'line': {
      const L = () => Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), A = () => Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
      box.append(mdNum('Length (mm)', L, change(v => { if (v > 0) { const a = A(); e.b = [e.a[0] + v * Math.cos(a), e.a[1] + v * Math.sin(a)]; } })), mdNum('Angle (°)', () => A() / deg, change(v => { const l = L(); e.b = [e.a[0] + l * Math.cos(v * deg), e.a[1] + l * Math.sin(v * deg)]; }), { raw: true }));
      break;
    }
    case 'circle': box.append(mdNum('Diameter (mm)', () => 2 * e.r, change(v => { if (v > 0) e.r = v / 2; })), mdNum('Centre x', () => e.c[0], change(v => { e.c[0] = v; })), mdNum('Centre y', () => e.c[1], change(v => { e.c[1] = v; }))); break;
    case 'hole': box.append(mdNum('Diameter (mm)', () => e.d, change(v => { if (v > 0) { e.d = v; delete e.std; } })), mdNum('Centre x', () => e.c[0], change(v => { e.c[0] = v; })), mdNum('Centre y', () => e.c[1], change(v => { e.c[1] = v; }))); break;
    case 'rect': box.append(mdNum('Width (mm)', () => e.w, change(v => { if (v > 0) e.w = v; })), mdNum('Height (mm)', () => e.h, change(v => { if (v > 0) e.h = v; })), mdNum('Corners (mm)', () => e.rad || 0, change(v => { e.rad = Math.max(0, Math.min(v, Math.min(e.w, e.h) / 2 - 1e-6)); if (!(e.rad > 0)) delete e.rad; })), mdNum('Angle (°)', () => e.rot, change(v => { e.rot = v; }), { raw: true })); break;
    case 'slot': box.append(mdNum('Width (mm)', () => 2 * e.r, change(v => { if (v > 0) e.r = v / 2; }))); break;
    case 'poly': box.append(mdNum('Radius (mm)', () => e.r, change(v => { if (v > 0) e.r = v; })), mdNum('Sides', () => e.n, change(v => { e.n = Math.max(3, Math.min(64, Math.round(v))); }), { raw: true }), mdNum('Angle (°)', () => e.rot, change(v => { e.rot = v; }), { raw: true })); break;
    case 'arc': box.append(mdNum('Radius (mm)', () => e.r, change(v => { if (v > 0) e.r = v; }))); break;
  }
  return box;
}
// the live sizes in the card follow the pointer (a field being typed in keeps what is typed)
function liveFields() {
  if (!MD.card) return;
  const e = draftEnt(); if (!e) return;
  const vals = { len: e.t === 'line' || e.t === 'slot' ? Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) : undefined, angle: e.t === 'line' ? Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]) / deg : undefined, w: e.w, h: e.h, d: e.t === 'circle' ? 2 * e.r : undefined, r: e.t === 'poly' ? e.r : undefined, wd: e.t === 'slot' ? 2 * e.r : undefined };
  const inputs = MD.card.querySelectorAll('input[data-live]');
  for (const inp of inputs) { const k = inp.dataset.live, v = vals[k]; if (document.activeElement !== inp && v !== undefined && MD.typed[k] === undefined) inp.value = String(+v.toFixed(3)); }
}
// the pointer's tip: what it snaps to
function tipText() {
  if (!MD.tip) return;
  const s = MD.snap, show = MD.stage === 'sketch' && s && s.kind !== 'free' && s.kind !== 'grid' && MD.tipAt;
  MD.tip.hidden = !show;
  if (show) { MD.tip.textContent = s.kind; MD.tip.style.left = (MD.tipAt[0] + 14) + 'px'; MD.tip.style.top = (MD.tipAt[1] + 10) + 'px'; }
}

/* ---------- the pointer and the keys, in the 3D view ---------- */
/* what a click in the sketch lands on: a point (a shape's end, centre or corner, or the origin) before a shape */
function pickAt(q, tol) {
  let best = null, bd = tol;
  for (const e of MD.ents) for (const [p, , r] of entPts(e)) { if (!r || !r.e) continue; const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = { pt: r }; } }
  if (Math.hypot(q[0], q[1]) < bd) best = { pt: { e: 'origin' } };
  if (best) return best;
  const e = entAt(q, tol);
  return e ? { ent: e } : null;
}
const refKey = r => r.e + '|' + (r.k || '');
function selectPick(pk, add) {
  if (!add) { MD.sel.clear(); MD.selP.clear(); MD.selC.clear(); MD.selD.clear(); }
  if (!pk) return;
  if (pk.pt) { const k = refKey(pk.pt); if (MD.selP.has(k) && add) MD.selP.delete(k); else MD.selP.add(k); }
  else if (MD.sel.has(pk.ent.id) && add) MD.sel.delete(pk.ent.id); else MD.sel.add(pk.ent.id);
}
// what a drag moves: a point, or a shape's points (each to where it was, moved as far as the pointer)
function dragTargets(D, dq) { return D.pts.map(([r, p]) => ({ r, to: [p[0] + dq[0], p[1] + dq[1]] })); }
const TOOL = {
  // the view closed, or another tab shown: the Model tools put away
  off() { stopModel(); },
  // sketching, the view stays square on (it moves and zooms, it does not turn); and the bench's parts are not taken
  // hold of, selected or given their arrows while the Model tools are out
  lockView() { return MD.on && MD.stage === 'sketch'; },
  noParts() { return MD.on; },
  // each frame drawn: the labels where the picture now has them
  frame() { if (MD.on && MD.ann && !MD.ann.hidden) annots(); },
  hintText() {
    if (MD.stage === 'plane') return 'Model: click a flat face (a part’s, or the table) to sketch on; empty space is the beam’s plane · Right-drag: turn the view · Esc: close';
    if (MD.stage === 'sketch') {
      if (MD.pickFor === 'mirror') return 'Click the line to mirror across · Esc: stop';
      if (MD.pickFor === 'centre') return 'Click the pattern’s centre · Esc: stop';
      if (MD.pickCon) return (CONS_UI.find(q => q[0] === MD.pickCon) || [0, ''])[1] + ' · click them · Esc: stop';
      const t = { line: 'Line: click its points; click its first again to close; Esc ends it', arc: 'Arc: its start, its end, then a point it passes through', carc: 'Centre-point arc: its centre, its start, its end',
        tarc: 'Tangent arc: from a line’s end, then its end', rect: 'Rectangle: two corners', crect: 'Centre rectangle: its centre, then a corner', circle: 'Circle: its centre, then its edge',
        slot: 'Slot: its two ends, then its width', poly: 'Polygon: its centre, then a corner', hole: 'Hole: click where it goes', point: 'Point: click where it goes',
        select: 'Select: click points and shapes (Shift: more); drag to move them; Delete removes; then a constraint', use: 'Use edges: click a part’s edge to bring it into the sketch',
        dim: 'Dimension: click a line, a circle, two points, a point and a line, or two lines; then type its value', trim: 'Trim: click the piece of a line, circle or arc to take away', fillet: 'Fillet: click a corner where two lines meet' }[MD.tool];
      return t + ' · Snaps make constraints · Alt: no snapping · Right-drag: move the view, the wheel zooms';
    }
    if (MD.stage === 'extrude') return 'Extrude: click the regions to take (or leave out) · drag the arrow, or type its distance · Enter or OK makes it';
    if (MD.stage === 'revolve') return 'Revolve: click the regions to take · pick the axis and the angle';
    return '';
  },
  pointerdown(e) {
    if (e.button !== 0 || MD.stage === 'off') return false;
    const K = kit(); if (!K || K.inCube(e)) return false;
    try { K.D.cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    if (MD.stage === 'plane') {
      const pk = planeUnder(e); if (!pk) return true;
      if (MD.offset) pk.p = pk.p.map((v, i) => v + planeNormal(pk.plane)[i] * MD.offset);
      enterSketch(pk); return true;
    }
    if (MD.stage === 'extrude' || MD.stage === 'revolve') {
      const a = MD.stage === 'extrude' ? arrowGeom() : null, b = K.D.cv.getBoundingClientRect();
      if (a) {
        const sc = p => { const v = mdV3(K, p).project(K.R.camera); return [(v.x + 1) / 2 * K.R.w, (1 - v.y) / 2 * K.R.h]; }, t = sc(a.tip), o = sc(a.base);
        if (Math.hypot(e.clientX - b.left - t[0], e.clientY - b.top - t[1]) < 14) {
          const one = sc([a.base[0] + a.n[0], a.base[1] + a.n[1], a.base[2] + a.n[2]]), dir = [one[0] - o[0], one[1] - o[1]];
          MD.dragArrow = { x: e.clientX, y: e.clientY, d0: MD.ex.d, dir, L2: dir[0] * dir[0] + dir[1] * dir[1] };
          return true;
        }
      }
      // a region clicked: taken, or left out
      const q = uvAt(e), R = q && MD.regs && MD.regs.regions.find(x => inRegion(x, q));
      if (R) { toggleRegion(R); return true; }
      return false;
    }
    if (MD.stage !== 'sketch') return false;
    const q = uvAt(e); if (!q) return true;
    const tol = 8 * mmPerPx(K, q);
    if (MD.pickFor) {
      if (MD.pickFor === 'mirror') { const ln = entAt(q, tol); if (ln && ln.t === 'line') { MD.pickFor = null; mapSel(mirrorMap(ln.a, ln.b), true); K.hint(); } else toast('Click a line'); }
      else if (MD.pickFor === 'centre') { const s = snapAt(e); MD.pickFor = null; const P = MD.pat; patternCircular(P.cn, P.ang, s ? s.p : q); K.hint(); }
      return true;
    }
    if (MD.pickCon) { const pk = pickAt(q, tol); if (pk) { selectPick(pk, true); if (!applyCon(MD.pickCon, true)) { drawCard(); redraw(); } } return true; }
    if (MD.tool === 'dim') {
      const pk = pickAt(q, tol);
      if (!pk) { if (MD.dimPick.length === 1 && !MD.dimPick[0].k) addDim(MD.dimPick); MD.dimPick = []; MD.sel.clear(); MD.selP.clear(); drawCard(); redraw(); return true; }
      const r = pk.pt || { e: pk.ent.id };
      MD.dimPick.push(r); selectPick(pk, true);
      if (MD.dimPick.length === 2) { addDim(MD.dimPick); MD.dimPick = []; MD.sel.clear(); MD.selP.clear(); }
      drawCard(); redraw(); return true;
    }
    if (MD.tool === 'trim') { trimAt(q, tol); return true; }
    if (MD.tool === 'fillet') { filletAt(q, 2 * tol); return true; }
    if (MD.tool === 'select') {
      const pk = pickAt(q, tol);
      if (!pk) { selectPick(null, false); drawCard(); redraw(); return true; }
      const was = pk.pt ? MD.selP.has(refKey(pk.pt)) : MD.sel.has(pk.ent.id);
      if (e.shiftKey || !was) selectPick(pk, e.shiftKey);
      // a drag: the points under the pointer (a point, or the shapes selected)
      const E = new Map(MD.ents.map(x => [x.id, x])), pts = [];
      if (pk.pt && pk.pt.e !== 'origin') pts.push([pk.pt, hpt(E, pk.pt).slice()]);
      else if (pk.ent) for (const x of MD.ents.filter(x => MD.sel.has(x.id))) for (const k of entKeys(x)) if (!(x.t === 'arc' && k === 'c') && !(x.t === 'rect' && k === 'c')) pts.push([{ e: x.id, k }, hpt(E, { e: x.id, k }).slice()]);
      MD.dragSel = { q0: q, moved: false, keep: sketchState(), pts };
      drawCard(); redraw(); return true;
    }
    if (MD.tool === 'use') { const s = edgeUnder(e); if (s) { useEdge(s); drawCard(); redraw(); } return true; }
    const s = snapAt(e, alignFrom()); if (!s) return true;
    place(s.p, s); return true;
  },
  pointermove(e) {
    const K = kit(); if (!K) return false;
    const b = K.D.cv.getBoundingClientRect(); MD.tipAt = [e.clientX - b.left, e.clientY - b.top];
    if (MD.dragArrow) {
      const A = MD.dragArrow, dx = e.clientX - A.x, dy = e.clientY - A.y, mm = (dx * A.dir[0] + dy * A.dir[1]) / (A.L2 || 1);
      let d = A.d0 + (MD.ex.both ? 2 : 1) * mm; d = Math.round(d * 10) / 10; if (Math.abs(d) < 0.1) d = d < 0 ? -0.1 : 0.1;
      if (d !== MD.ex.d) { MD.ex.d = d; liveDist(); preview(); }
      return true;
    }
    if (MD.stage === 'plane') { if (e.buttons) return false; MD.hover = planeUnder(e); redraw(); return false; }
    if (MD.stage === 'extrude' || MD.stage === 'revolve') {
      if (e.buttons) return false;
      const q = uvAt(e), R = q && MD.regs && MD.regs.regions.find(x => inRegion(x, q)) || null;
      if (R !== MD.hoverReg) { MD.hoverReg = R; redraw(); }
      return false;
    }
    if (MD.stage !== 'sketch') return false;
    if (MD.dragSel && e.buttons & 1) {
      const D = MD.dragSel, q = uvAt(e); if (!q || !D.pts.length) return true;
      const dq = [q[0] - D.q0[0], q[1] - D.q0[1]];
      if (Math.hypot(...dq) > 0) D.moved = true;
      // dragged: the sketch solved with the points held where the pointer takes them (or as near as its constraints let)
      sketchRestore(D.keep);
      let r = solveNow(dragTargets(D, dq));
      if (!r.ok) { sketchRestore(D.keep); solveNow(dragTargets(D, dq).map(x => Object.assign(x, { w: 0.05 }))); solveNow(); }
      redraw(); return true;
    }
    if (MD.tool === 'use') { const s = edgeUnder(e); MD.hoverEdge = s; redraw(); return false; }
    MD.snap = snapAt(e, alignFrom()); MD.cursor = MD.snap ? MD.snap.p : null;
    // the shape's sizes appear in the strip once it has any (its first point alone has none)
    if (MD.draft.length && MD.card && !MD.card.querySelector('.rt-mdltyped') && draftEnt()) drawCard();
    redraw(); liveFields();
    return false;
  },
  pointerup(e) {
    if (MD.dragArrow) { MD.dragArrow = null; drawCard(); return true; }
    if (MD.dragSel) { const D = MD.dragSel; MD.dragSel = null; if (D.moved) { MD.undo.push(D.keep); MD.redo = []; workDefined(); } drawCard(); redraw(); return true; }
    return false;
  },
  dblclick(e) {
    if (MD.stage !== 'sketch') return false;
    if (MD.tool === 'line') { MD.draft = []; MD.draftSnaps = []; MD.chain0 = null; redraw(); return true; }
    return false;
  },
  key(e) {
    if (!MD.on) return false;
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y') && MD.stage === 'sketch' && !typing) { sketchUndo(!(e.key === 'y' || e.shiftKey)); return true; }
    if (typing) return false;
    if (e.key === 'Escape') {
      if (mdMenuOpen) { closeMdMenu(); return true; }
      if (MD.pickFor || MD.pickCon) { MD.pickFor = null; MD.pickCon = null; drawCard(); kit().hint(); return true; }
      if (MD.stage === 'sketch' && (MD.draft.length || MD.dimPick.length)) { MD.draft = []; MD.draftSnaps = []; MD.dimPick = []; MD.chain0 = null; MD.typed = {}; drawCard(); redraw(); return true; }
      if (MD.stage === 'extrude' || MD.stage === 'revolve') { setStage('sketch'); return true; }
      if (MD.stage === 'sketch' && MD.tool !== 'select') { MD.tool = 'select'; drawCard(); redraw(); kit().hint(); return true; }
      if (MD.stage === 'plane') { stopModel(); return true; }
      return true;
    }
    if (MD.stage === 'sketch' && (e.key === 'Delete' || e.key === 'Backspace') && (MD.sel.size || MD.selC.size || MD.selD.size)) { deleteSelected(); return true; }
    if ((MD.stage === 'extrude' || MD.stage === 'revolve') && e.key === 'Enter') { commitSolid(); return true; }
    // a digit while drawing: into the shape's first size
    if (MD.stage === 'sketch' && MD.draft.length && /^[0-9.\-]$/.test(e.key) && MD.card) {
      const inp = MD.card.querySelector('.rt-mdltyped input'); if (inp) { inp.focus(); inp.value = e.key; return true; }
    }
    if (MD.stage === 'sketch' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.shiftKey) { const c = CONS_UI.find(q => q[2] === e.key.toUpperCase()); if (c) { applyCon(c[0]); return true; } return false; }
      const k = { l: 'line', a: 'arc', r: 'rect', c: 'circle', s: 'select', h: 'hole', p: 'poly', o: 'slot', u: 'use', d: 'dim', t: 'trim', f: 'fillet' }[e.key];
      if (k) { setTool(k); return true; }
    }
    return false;
  },
};
/* the selected shapes (with what holds them), constraints and dimensions taken away */
function deleteSelected() {
  changeSketch(() => {
    const gone = new Set(MD.sel);
    MD.ents = MD.ents.filter(x => !gone.has(x.id));
    MD.cons = MD.cons.filter(c => !MD.selC.has(c.id) && !c.r.some(r => gone.has(r.e)));
    MD.dims = MD.dims.filter(d => !MD.selD.has(d.id) && !d.r.some(r => gone.has(r.e)));
    MD.sel.clear(); MD.selP.clear(); MD.selC.clear(); MD.selD.clear();
  }, 'That');
}
/* a region taken or left out of an extrude or revolve (the choice then kept with it, by a point in each region taken) */
function toggleRegion(R) {
  const X = MD.ex, chosen = MD.regs.chosen;
  let pts = X.regions && X.regions.length ? X.regions.slice() : chosen.map(c => c.pt);
  if (chosen.includes(R)) pts = pts.filter(p => !inRegion(R, p)); else pts.push(R.pt);
  X.regions = pts.length ? pts : [[1e9, 1e9]];      // (none taken: a point in no region, so the extrude says so)
  preview();
}
function liveDist() { if (!MD.card) return; const inp = MD.card.querySelector('input[data-live="d"]'); if (inp && document.activeElement !== inp) inp.value = String(MD.ex.d); }

/* ---------- for the tests (J.model3d) ---------- */
export const MODEL3D_API = {
  start: () => { modelEnter(); return MD.on; },
  stop: () => stopModel(),
  state: () => ({ on: MD.on, stage: MD.stage, tool: MD.tool, ents: JSON.parse(JSON.stringify(MD.ents)), cons: JSON.parse(JSON.stringify(MD.cons)), dims: JSON.parse(JSON.stringify(MD.dims)), defined: [...MD.defined],
    regions: MD.regs ? MD.regs.regions.map(r => ({ pt: r.pt, area: r.area, chosen: MD.regs.chosen.includes(r) })) : null, draft: MD.draft.slice(), sel: [...MD.sel], plane: MD.plane, beam: MD.beam ? { n: MD.beam.pts.length, mids: MD.beam.mids } : null, holes: !!MD.holes, edges: (MD.edges || []).length, ex: Object.assign({}, MD.ex), err: MD.prevErr || '', last: MD.lastMade ? (getEl(MD.lastMade) || {}).name : null, card: MD.card ? MD.card.textContent : '' }),
  plane: k => { enterSketch(namedPlane(k)); return MD.plane; },
  // a plane of its own: { o, x, y }, or a part's face under a canvas point (css px)
  planeAt: (px, py) => { const K = kit(), b = K.D.cv.getBoundingClientRect(), pk = planeUnder({ clientX: b.left + px, clientY: b.top + py }); if (pk) enterSketch(pk); return pk ? { label: pk.label, src: pk.src } : null; },
  tool: k => { MD.tool = k; MD.draft = []; MD.draftSnaps = []; MD.typed = {}; drawCard(); redraw(); const K = kit(); if (K) K.hint(); },
  // a click at a sketch point (u, v mm), snapped as a click there would be unless raw
  click(u, v, raw) { if (MD.stage !== 'sketch') return; const p = raw ? [u, v] : snapPoint([u, v]); if (MD.tool === 'select') { const hit = entAt(p, 0.5); MD.sel = hit ? new Set([hit.id]) : new Set(); drawCard(); redraw(); return hit ? hit.id : null; } place(p); return p; },
  snap: (u, v, from) => snapPoint([u, v], from),
  // a click as the pointer would make it, snapped (constraints inferred from what it snaps to)
  clickSnapped(u, v) { const K = kit(), P = sketchPlane(), w = fromUV(P, [u, v]), q = mdV3(K, w).project(K.R.camera), b = K.D.cv.getBoundingClientRect(), e = { clientX: b.left + (q.x + 1) / 2 * K.R.w, clientY: b.top + (1 - q.y) / 2 * K.R.h, altKey: false };
    const s = snapAt(e, alignFrom()); if (s) place(s.p, s); return s; },
  // constraints and dimensions: on points ("id|key", "origin|") and shapes (ids) selected
  selectRefs(pts, ents) { MD.selP = new Set(pts || []); MD.sel = new Set(ents || []); drawCard(); redraw(); },
  con: kind => applyCon(kind, true),
  dim: picks => addDim(picks),
  setDim: (id, v) => setDimValue(id, v),
  drag(ref, to) { const E = new Map(MD.ents.map(x => [x.id, x])), D = { q0: hpt(E, ref).slice(), pts: [[ref, hpt(E, ref).slice()]], keep: sketchState() }; const dq = [to[0] - D.q0[0], to[1] - D.q0[1]];
    sketchRestore(D.keep); let r = solveNow(dragTargets(D, dq)); if (!r.ok) { sketchRestore(D.keep); solveNow(dragTargets(D, dq).map(x => Object.assign(x, { w: 0.05 }))); r = solveNow(); } MD.undo.push(D.keep); workDefined(); redraw(); return r.ok; },
  trim: (u, v) => trimAt([u, v], 0.5),
  fillet: (u, v, r) => { MD.filletR = r || MD.filletR; return filletAt([u, v], 0.5); },
  toggleRegion: (u, v) => { const R = MD.regs && MD.regs.regions.find(x => inRegion(x, [u, v])); if (R) toggleRegion(R); return !!R; },
  redrawNow: () => redraw(),
  type(k, v) { MD.typed[k] = v; },
  enter: () => commitTyped(),
  add: e => { const n = normEnt(e); addEnt(n); drawCard(); redraw(); return n && n.id; },
  select: ids => { MD.sel = new Set(ids); drawCard(); redraw(); },
  mirror: lineId => { const ln = MD.ents.find(e => e.id === lineId); if (ln) mapSel(mirrorMap(ln.a, ln.b), true); },
  linear: (n, dx, dy) => patternLinear(n, dx, dy),
  circular: (n, ang, c) => patternCircular(n, ang, c),
  useInPlane: () => useEdgesInPlane(),
  undo: () => sketchUndo(true),
  extrude(o) { setStage('extrude'); Object.assign(MD.ex, o || {}); return manifoldLib().then(() => preview()).then(() => ({ err: MD.prevErr, prev: !!MD.prev })); },
  revolve(o) { setStage('revolve'); Object.assign(MD.ex, o || {}); return manifoldLib().then(() => preview()).then(() => ({ err: MD.prevErr, prev: !!MD.prev })); },
  ok: () => commitSolid(),
  finish: () => commitEdit(),
  edit: (name, i) => { const el = project.elements.find(e => e.name === name); const sk = el && el.model.feats.filter(f => f.t === 'sketch')[i || 0]; return sk ? editSketch(el, sk.id) : null; },
  rebuild: name => { const el = project.elements.find(e => e.name === name); return el ? rebuildLater(el) : null; },
  stlBytes: name => { const el = project.elements.find(e => e.name === name); return el && el.mesh ? stlBytes(meshTris(el.mesh), name).length : 0; },
};
// a sketch point snapped as the pointer there would be, without a pointer (for the tests)
function snapPoint(q, from) {
  const K = kit(), P = sketchPlane(), w = fromUV(P, q), v = mdV3(K, w).project(K.R.camera), b = K.D.cv.getBoundingClientRect();
  const s = snapAt({ clientX: b.left + (v.x + 1) / 2 * K.R.w, clientY: b.top + (1 - v.y) / 2 * K.R.h, altKey: false }, from);
  return s ? s.p : q;
}
