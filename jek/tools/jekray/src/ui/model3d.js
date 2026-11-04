import { deg, nextName, project, selectOne } from '../state/project.js';
import { getEl, normElement } from '../state/elements.js';
import { lastTrace, setZ, zOf } from '../engines/trace.js';
import { meshCache, meshHullCache, meshOf, meshTris } from '../core/stl.js';
import {
  HOLE_SIZES, entEnds, entMap, entOutline, featPreview, inPoly, manifoldLib, manifoldNow, mirrorMap, modelId, modelToWorld, moveMap,
  newModelPart, normEnt, normModel, normPlane, parseLength, planeNormal, planeToModel, planeToWorld, partRot, partRotInv, rebuildPart, sketchLoops, stlBytes,
  turnMap, worldToModel
} from '../core/model.js';
import { V3D } from './view3d.js';
import { h, renderPanel } from './panel.js';
import { changed, downloadFile, toast } from './actions.js';
import { checkpoint } from './tabs.js';
import { exp } from './experimental.js';
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
  tool: 'line', draft: [], cursor: null, snap: null, sel: new Set(), constr: false,
  grid: 1, holeStd: 'M6 clearance', holeD: 6.6, polyN: 6,
  edit: null,                                   // { id, sk }: a part's own sketch, opened from its panel
  ex: { d: 10, both: false, through: false, op: 'new', target: null, axis: null, deg: 360 },
  typed: {}, hover: null, pickFor: null, group: null, prev: null, card: null, tip: null, btn: null, edges: null, beam: null,
  dragArrow: null, dragSel: null,
};
const kit = () => V3D.kit();
const LIFT = 0.02;                              // mm: the sketch drawn this far off its plane, over the face it is on

/* ---------- the button, and starting and stopping ---------- */
export function wireModel3d() {
  const btn = h('button', { type: 'button', class: 'rt-btn rt-mdlbtn', title: 'Model a part: sketch on a flat face, then extrude or revolve it into a beam block (Experimental)', 'aria-pressed': 'false', onclick: () => (MD.on ? stopModel() : startModel()) }, 'Model');
  btn._shown = () => exp('model') || MD.on;
  MD.btn = btn;
  V3D.addBar(btn);
}
export function startModel() {
  const K = kit(); if (!K) return false;
  MD.on = true; if (MD.btn) { MD.btn.hidden = false; MD.btn.classList.add('on'); MD.btn.setAttribute('aria-pressed', 'true'); }
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
  MD.on = false; MD.stage = 'off'; MD.edit = null; MD.draft = []; MD.ents = []; MD.sel.clear();
  if (MD.btn) { MD.btn.classList.remove('on'); MD.btn.setAttribute('aria-pressed', 'false'); MD.btn.hidden = !MD.btn._shown(); }
  if (K && MD.group) { clearGroup(); dropPrev(); K.R.scene.remove(MD.group); }
  if (MD.card) { MD.card.remove(); MD.card = null; }
  if (MD.tip) { MD.tip.remove(); MD.tip = null; }
  V3D.setTool(null);
  if (K) K.need();
}
function setStage(s) {
  MD.stage = s; MD.draft = []; MD.typed = {}; MD.pickFor = null;
  if (s !== 'extrude' && s !== 'revolve') { dropPrev(); MD.prevErr = ''; }
  if (s === 'sketch' && !MD.tool) MD.tool = 'line';
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
function enterSketch(pk, ents, edit) {
  const K = kit();
  MD.plane = pk.plane; MD.src = pk.src; MD.ents = (ents || []).map(e => Object.assign({}, e)); MD.undo = []; MD.redo = []; MD.sel.clear();
  MD.edit = edit || null; if (!edit) MD.offset = MD.offset || 0;
  MD.tool = 'line';
  const fe = MD.src && MD.src.kind === 'face' && getEl(MD.src.id);
  MD.ex = { d: 10, both: false, through: false, op: fe && fe.model ? 'add' : 'new', target: fe && fe.model ? fe.id : null, axis: null, deg: 360 };
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
function entPts(e) {
  switch (e.t) {
    case 'line': return [[e.a, 'end'], [e.b, 'end'], [[(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], 'middle']];
    case 'arc': { const [s, t] = entEnds(e), m = (e.a0 + ((e.a1 - e.a0 + 360) % 360) / 2) * deg; return [[s, 'end'], [t, 'end'], [e.c, 'centre'], [[e.c[0] + e.r * Math.cos(m), e.c[1] + e.r * Math.sin(m)], 'middle']]; }
    case 'circle': case 'hole': { const r = e.t === 'hole' ? e.d / 2 : e.r; return [[e.c, 'centre'], ...[0, 1, 2, 3].map(k => [[e.c[0] + r * Math.cos(k * Math.PI / 2), e.c[1] + r * Math.sin(k * Math.PI / 2)], 'quadrant'])]; }
    case 'rect': { const P = entOutline(Object.assign({}, e, { rad: 0 })); return [[e.c, 'centre'], ...P.map(p => [p, 'corner']), ...P.map((p, i) => [[(p[0] + P[(i + 1) % 4][0]) / 2, (p[1] + P[(i + 1) % 4][1]) / 2], 'middle'])]; }
    case 'slot': return [[e.a, 'centre'], [e.b, 'centre']];
    case 'poly': return [[e.c, 'centre'], ...entOutline(e).map(p => [p, 'corner'])];
  }
  return [];
}
// the point a new one lines up with, level or upright: the last of a line's, a slot's or an arc's (a corner of a rectangle, a
// circle's edge or a polygon's corner lined up with its first point would give it no size)
const alignFrom = () => (/^(line|slot|arc)$/.test(MD.tool) ? MD.draft[MD.draft.length - 1] : undefined);
function snapAt(e, from) {
  const raw = uvAt(e); if (!raw) return null;
  const K = kit(), tol = 10 * mmPerPx(K, raw);
  if (e.altKey) return { p: raw, kind: 'free' };
  let best = null, bd = tol;
  const consider = (p, kind) => { const d = Math.hypot(p[0] - raw[0], p[1] - raw[1]); if (d < bd) { bd = d; best = { p: p.slice(), kind }; } };
  for (const s of MD.ents) for (const [p, k] of entPts(s)) consider(p, k);
  for (const p of MD.draft) consider(p, 'end');
  consider([0, 0], 'origin');
  if (MD.beam) { for (const p of MD.beam.mids) consider(p, 'the beam’s middle'); if (!best) for (const p of MD.beam.pts) consider(p, 'a ray'); }
  // the table's holes: for what goes on one (a hole, or a circle's or polygon's centre)
  if (MD.holes && !MD.draft.length && /^(hole|circle|poly)$/.test(MD.tool)) { const P = sketchPlane(), w = fromUV(P, raw), hx = Math.round(w[0] / 25) * 25, hy = Math.round(w[1] / 25) * 25; consider(toUV(P, [hx, hy, 0]), 'a table hole'); }
  if (best) return best;
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
  // the closed regions, shaded (a hole in one left clear): what an extrude would make
  const { loops } = sketchLoops(MD.ents);
  for (const L of loops.filter(q => q.depth % 2 === 0)) {
    const sh = new K.T.Shape(L.pts.map(p => new K.T.Vector2(p[0], p[1])));
    for (const H of loops.filter(q => q.depth === L.depth + 1 && inPoly(L.pts, q.pts[0]))) sh.holes.push(new K.T.Path(H.pts.map(p => new K.T.Vector2(p[0], p[1]))));
    const m = new K.T.Mesh(new K.T.ShapeGeometry(sh), new K.T.MeshBasicMaterial({ color: COL.fill, transparent: true, opacity: 0.16, depthTest: false, side: K.T.DoubleSide }));
    m.position.z = LIFT; m.renderOrder = 18; G.add(m);
  }
  // the shapes
  for (const e of MD.ents) {
    const pts = entOutline(e), colour = MD.sel.has(e.id) ? COL.sel : e.k ? COL.constr : COL.line;
    G.add(mdLines(K, pts, colour, { closed: !(e.t === 'line' || e.t === 'arc'), dash: e.k ? 2 * mpp : 0 }));
  }
  const ends = []; for (const e of MD.ents) if (!e.k) for (const [p, k] of entPts(e)) if (k === 'end' || k === 'corner' || k === 'centre') ends.push(p);
  if (ends.length) G.add(dots(K, ends, COL.line, 4));
  // what is being drawn, to the pointer
  const dr = draftEnt();
  if (dr) G.add(mdLines(K, entOutline(dr), COL.draft, { closed: !(dr.t === 'line' || dr.t === 'arc'), dash: MD.constr ? 2 * mpp : 0 }));
  if (MD.draft.length) G.add(dots(K, MD.draft, COL.draft, 6));
  if (MD.snap && MD.stage === 'sketch') G.add(dots(K, [MD.snap.p], MD.snap.kind === 'grid' ? COL.grid : COL.sel, 8));
  // Use edges: the edge under the pointer
  if (MD.tool === 'use' && MD.hoverEdge) G.add(mdLines(K, MD.hoverEdge.map(p => toUV(P, p)), COL.edge));
  // extruding: the solid it would make, and the arrow to drag its length
  if ((MD.stage === 'extrude' || MD.stage === 'revolve') && MD.prev && !MD.prev.parent) K.R.scene.add(MD.prev);
  if (MD.stage === 'extrude') { const a = arrowGeom(); if (a) { G.add(mdLines(K, [a.base, a.tip].map(p => toUV(P, p)), COL.sel)); G.add(dots(K, [toUV(P, a.tip)], COL.sel, 10)); } }
  tipText();
  K.need();
}
const mmPerPxAt = (K, p) => 2 * K.R.camera.position.distanceTo(mdV3(K, p)) * Math.tan(K.R.camera.fov * deg / 2) / Math.max(1, K.R.h);
function planeMatrix(K, P) { const n = planeNormal(P), M = new K.T.Matrix4(); M.makeBasis(mdV3(K, P.x), mdV3(K, P.y), mdV3(K, n)); M.setPosition(mdV3(K, P.o)); return M; }

/* ---------- the shape being drawn, from its points so far and the pointer (and any size typed) ---------- */
const TOOLS = [['line', 'Line'], ['arc', 'Arc'], ['rect', 'Rectangle'], ['circle', 'Circle'], ['slot', 'Slot'], ['poly', 'Polygon'], ['hole', 'Hole'],
  ['select', 'Select'], ['use', 'Use edges']];
const NEEDS = { line: 2, arc: 3, rect: 2, circle: 2, slot: 3, poly: 2, hole: 1 };
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
const push = () => { MD.undo.push(JSON.stringify(MD.ents)); if (MD.undo.length > 200) MD.undo.shift(); MD.redo = []; };
function sketchUndo(back) {
  const from = back ? MD.undo : MD.redo, to = back ? MD.redo : MD.undo;
  if (!from.length) return;
  to.push(JSON.stringify(MD.ents)); MD.ents = JSON.parse(from.pop()); MD.sel.clear(); MD.draft = []; drawCard(); redraw();
}
/* a click with a drawing tool: a point more; the shape added once it has all it needs */
function place(p) {
  MD.cursor = p;
  if (MD.tool === 'hole') { addEnt(normEnt({ t: 'hole', c: p, d: MD.holeD, std: MD.holeStd })); drawCard(); redraw(); return; }
  if (MD.tool === 'line' && MD.draft.length === 1) {
    const e = draftEnt(true); MD.typed = {};
    if (e && e.t === 'line') { addEnt(e); const first = MD.chain0; MD.draft = [e.b];
      // back at the polyline's first point: closed, and done
      if (first && Math.hypot(e.b[0] - first[0], e.b[1] - first[1]) < 1e-9) { MD.draft = []; MD.chain0 = null; } }
    drawCard(); redraw(); return;
  }
  MD.draft.push(p);
  if (MD.tool === 'line' && MD.draft.length === 1) MD.chain0 = p;
  if (MD.draft.length >= NEEDS[MD.tool] || (MD.tool !== 'arc' && MD.tool !== 'slot' && MD.draft.length >= 2)) {
    MD.cursor = p; const e = draftEnt(true); MD.draft = []; MD.typed = {}; addEnt(e);
  }
  drawCard(); redraw();
}
function commitTyped() {
  // Enter in a size: the shape made with it, from the pointer's direction
  if (!MD.draft.length) return;
  const e = draftEnt(true); if (!e) return;
  if (MD.tool === 'line') { addEnt(e); MD.draft = [e.b]; MD.typed = {}; }
  else if (MD.tool === 'slot' && MD.draft.length === 1 && MD.typed.len !== undefined && MD.typed.wd === undefined) { MD.draft.push(e.b); MD.typed = { wd: MD.typed.wd }; }
  else { addEnt(e); MD.draft = []; MD.typed = {}; }
  drawCard(); redraw();
}

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
  return MD.stage === 'revolve' ? { t: 'revolve', axis: X.axis, deg: X.deg } : { t: 'extrude', d: X.d, both: X.both, through: X.through && X.op === 'cut' };
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
  const { el, plane } = modelFor(), sk = { id: 'psk', t: 'sketch', plane, ents: MD.ents }, f = Object.assign({ id: 'pf', sk: 'psk', op: MD.ex.op === 'cut' ? 'cut' : 'add' }, solidSpec());
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
    el = normElement(Object.assign(newModelPart(P, MD.ents, spec, nextName('Model')), { bench: project.tab }));
    const r = rebuildPart(W, el, setZ);
    if (!r.ok) { toast('That made no solid: ' + r.errors.map(q => q[1]).join('; '), true); return false; }
    project.elements.push(el);
  } else {
    el = getEl(MD.ex.target);
    const keep = JSON.stringify({ model: el.model, mesh: el.mesh, x: el.x, y: el.y, z: el.z });
    const nS = el.model.feats.filter(f => f.t === 'sketch').length + 1, nF = el.model.feats.filter(f => f.t === spec.t).length + 1;
    const sk = { id: modelId(), t: 'sketch', name: 'Sketch ' + nS, plane: planeToModel(el, P), ents: MD.ents.map(normEnt).filter(Boolean) };
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
  sk.ents = MD.ents.map(normEnt).filter(Boolean);
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
  if (!MD.on) startModel();
  const P = planeToWorld(el, sk.plane);
  MD.offset = 0;
  enterSketch({ plane: normPlane(P), p: modelToWorld(el, sk.plane.o), src: { kind: 'face', id: el.id } }, sk.ents, { id: el.id, sk: skId });
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

/* ---------- the card: what the stage offers ---------- */
const mdNum = (label, get, set, opts) => {
  opts = opts || {};
  const inp = h('input', { type: 'text', inputmode: 'decimal', spellcheck: 'false', 'aria-label': label, value: get() === undefined || get() === null ? '' : String(+(+get()).toFixed(4)), placeholder: opts.placeholder || '' });
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); const v = opts.raw ? +inp.value : parseLength(inp.value); if (v !== null && isFinite(v)) { set(v, true); } } if (e.key === 'Escape') { inp.blur(); } });
  inp.addEventListener('input', () => { const v = opts.raw ? +inp.value : parseLength(inp.value); if (v !== null && isFinite(v) && inp.value.trim() !== '') set(v, false); });
  if (opts.live) inp.dataset.live = opts.live;
  return h('label', { class: 'rt-mdlf' }, h('span', null, label), inp);
};
const btn = (label, fn, opts) => h('button', Object.assign({ type: 'button', class: 'rt-btn' + (opts && opts.on ? ' on' : ''), onclick: fn }, opts && opts.title ? { title: opts.title } : {}), label);
function drawCard() {
  const K = kit(); if (!K) return;
  if (!MD.card) { MD.card = h('div', { class: 'rt-mdlcard', role: 'region', 'aria-label': 'Model' }); K.D.stage.append(MD.card); }
  if (!MD.tip) { MD.tip = h('div', { class: 'rt-mdltip', hidden: true }); K.D.stage.append(MD.tip); }
  const C = MD.card; C.replaceChildren();
  C.hidden = !MD.on;
  if (!MD.on) return;
  if (MD.stage === 'plane') {
    C.append(h('b', null, 'Model: pick a plane'),
      h('p', null, 'Click a flat face to sketch on: a part’s, or the table. Empty space is the beam’s plane. Or:'),
      h('div', { class: 'rt-mdlrow' }, ...[['table', 'Table top'], ['beam', 'Beam plane'], ['front', 'Front (x, up)'], ['side', 'Side (y, up)']].map(([k, t]) => btn(t, () => enterSketch(namedPlane(k))))),
      h('div', { class: 'rt-mdlrow' }, mdNum('Offset (mm)', () => MD.offset, v => { MD.offset = v; })),
      h('div', { class: 'rt-mdlrow' }, btn('Close', stopModel)));
    return;
  }
  if (MD.stage === 'sketch') {
    C.append(h('b', null, MD.edit ? 'Sketch of ' + (getEl(MD.edit.id) || {}).name : 'Sketch'));
    const tb = h('div', { class: 'rt-mdltools' }, ...TOOLS.map(([k, t]) => btn(t, () => { MD.tool = k; MD.draft = []; MD.typed = {}; drawCard(); redraw(); K.hint(); }, { on: MD.tool === k })));
    C.append(tb);
    const cb = h('input', { type: 'checkbox' }); cb.checked = MD.constr;
    cb.addEventListener('change', () => { MD.constr = cb.checked; if (MD.sel.size) { push(); for (const e of mdSelected()) { if (cb.checked) e.k = true; else delete e.k; } } redraw(); });
    C.append(h('label', { class: 'rt-check', title: 'Construction shapes guide (a revolve’s axis, a mirror’s line) but make no solid' }, cb, 'Construction'));
    // the tool's own settings, and the sizes of the shape being drawn
    if (MD.tool === 'hole') {
      const sel = h('select', { 'aria-label': 'Hole size' }, ...HOLE_SIZES.map(([n, d]) => h('option', { value: n }, n + ' (' + d + ' mm)')), h('option', { value: 'custom' }, 'Custom'));
      sel.value = MD.holeStd || 'custom';
      sel.addEventListener('change', () => { const hs = HOLE_SIZES.find(q => q[0] === sel.value); MD.holeStd = hs ? hs[0] : ''; if (hs) MD.holeD = hs[1]; drawCard(); });
      C.append(h('div', { class: 'rt-mdlrow' }, sel, MD.holeStd ? null : mdNum('Diameter (mm)', () => MD.holeD, v => { MD.holeD = Math.max(0.05, v); })));
      if (MD.holes) C.append(h('p', { class: 'rt-mdlnote' }, 'On the table top it snaps to its holes, 25 mm apart.'));
    }
    if (MD.tool === 'poly') C.append(h('div', { class: 'rt-mdlrow' }, mdNum('Sides', () => MD.polyN, v => { MD.polyN = Math.max(3, Math.min(64, Math.round(v))); redraw(); }, { raw: true })));
    if (MD.draft.length) {
      const L = typedFields(); if (L.length) C.append(h('div', { class: 'rt-mdlrow rt-mdltyped' }, ...L));
    }
    // the selection: its sizes, and what can be done with it
    const S = mdSelected();
    if (MD.tool === 'select' && S.length === 1) C.append(selFields(S[0]));
    if (MD.tool === 'select' && S.length) {
      C.append(h('div', { class: 'rt-mdlrow' }, btn('Delete', () => { push(); MD.ents = MD.ents.filter(e => !MD.sel.has(e.id)); MD.sel.clear(); drawCard(); redraw(); }),
        btn(MD.pickFor === 'mirror' ? 'Click a line…' : 'Mirror', () => { MD.pickFor = 'mirror'; drawCard(); K.hint(); }, { title: 'Mirror the selected shapes across a line: click the line next' }),
        btn(MD.pickFor === 'centre' ? 'Click its centre…' : 'Circular pattern', () => { MD.pickFor = 'centre'; drawCard(); K.hint(); }, { title: 'Repeat the selected shapes round a centre: click the centre next' })));
      const P = MD.pat || (MD.pat = { n: 3, dx: 10, dy: 0, cn: 6, ang: 360 });
      C.append(h('div', { class: 'rt-mdlrow' }, mdNum('Copies', () => P.n, v => { P.n = Math.max(2, Math.min(100, Math.round(v))); }, { raw: true }), mdNum('Step x (mm)', () => P.dx, v => { P.dx = v; }), mdNum('Step y (mm)', () => P.dy, v => { P.dy = v; }),
        btn('Linear pattern', () => patternLinear(P.n, P.dx, P.dy))));
      C.append(h('div', { class: 'rt-mdlrow' }, mdNum('Round copies', () => P.cn, v => { P.cn = Math.max(2, Math.min(360, Math.round(v))); }, { raw: true }), mdNum('Over (°)', () => P.ang, v => { P.ang = Math.max(1, Math.min(360, v)); }, { raw: true })));
    }
    if (MD.tool === 'use') C.append(h('div', { class: 'rt-mdlrow' }, btn('Use the edges in this plane', useEdgesInPlane, { title: 'Bring in every edge of the parts that lies in the sketch’s plane: the outline of the face sketched on' })));
    C.append(h('div', { class: 'rt-mdlrow' }, mdNum('Grid (mm)', () => MD.grid, v => { MD.grid = Math.max(0.01, v); redraw(); }), mdNum('Offset (mm)', () => MD.offset, v => { MD.offset = v; workSnaps(); redraw(); })));
    const { loops, open } = sketchLoops(MD.ents);
    C.append(h('p', { class: 'rt-mdlnote' }, loops.length + ' closed shape' + (loops.length === 1 ? '' : 's') + (open.length ? ', ' + open.length + ' open (not made into the solid)' : '') + (MD.beam && MD.beam.mids.length ? ' · red: where the light crosses' : '')));
    const row = h('div', { class: 'rt-mdlrow' });
    if (MD.edit) row.append(btn('Finish', () => commitEdit(), { title: 'Make the part again from this sketch' }));
    else row.append(btn('Extrude…', () => { if (!loops.length) { toast('Close a shape first'); return; } setStage('extrude'); manifoldLib().then(preview); }),
      btn('Revolve…', () => { if (!loops.length) { toast('Close a shape first'); return; } const ax = MD.ents.find(e => MD.sel.has(e.id) && e.t === 'line') || MD.ents.find(e => e.k && e.t === 'line'); MD.ex.axis = ax ? ax.id : null; setStage('revolve'); manifoldLib().then(preview); }));
    row.append(btn('Undo', () => sketchUndo(true), { title: 'Undo in the sketch (Ctrl+Z)' }), btn('Cancel', () => { MD.edit = null; MD.ents = []; setStage('plane'); }));
    C.append(row);
    return;
  }
  // extrude or revolve
  const X = MD.ex, rev = MD.stage === 'revolve';
  C.append(h('b', null, rev ? 'Revolve' : 'Extrude'));
  const models = project.elements.filter(e => e.bench === project.tab && e.type === 'stl' && e.model);
  const op = h('select', { 'aria-label': 'Make' }, h('option', { value: 'new' }, 'A new part'), ...models.flatMap(m => [h('option', { value: 'add:' + m.id }, 'Add to ' + m.name), h('option', { value: 'cut:' + m.id }, 'Cut from ' + m.name)]));
  op.value = X.op === 'new' || !X.target ? 'new' : X.op + ':' + X.target;
  op.addEventListener('change', () => { const [o, id] = op.value.split(':'); X.op = o; X.target = id || null; preview(); });
  C.append(h('div', { class: 'rt-mdlrow' }, op));
  if (!rev) {
    const thr = h('input', { type: 'checkbox' }); thr.checked = X.through;
    thr.addEventListener('change', () => { X.through = thr.checked; preview(); });
    const both = h('input', { type: 'checkbox' }); both.checked = X.both;
    both.addEventListener('change', () => { X.both = both.checked; preview(); });
    C.append(h('div', { class: 'rt-mdlrow' }, X.through && X.op === 'cut' ? null : mdNum('Distance (mm)', () => X.d, (v, enter) => { if (v !== 0) X.d = v; preview(); if (enter) commitSolid(); }, { live: 'd' }),
      btn('Flip', () => { X.d = -X.d; drawCard(); preview(); }, { title: 'Extrude the other way' })),
      h('div', { class: 'rt-mdlrow' }, h('label', { class: 'rt-check' }, both, 'Both ways (symmetric)'), X.op === 'cut' ? h('label', { class: 'rt-check' }, thr, 'Through all') : null));
  } else {
    const lines0 = MD.ents.filter(e => e.t === 'line');
    const ax = h('select', { 'aria-label': 'Axis' }, h('option', { value: '' }, 'Axis: pick a line…'), ...lines0.map((e, i) => h('option', { value: e.id }, 'Line ' + (i + 1) + (e.k ? ' (construction)' : '') + ', ' + (+Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]).toFixed(2)) + ' mm')));
    ax.value = X.axis || '';
    ax.addEventListener('change', () => { X.axis = ax.value || null; preview(); });
    C.append(h('div', { class: 'rt-mdlrow' }, ax, mdNum('Angle (°)', () => X.deg, v => { X.deg = Math.max(1, Math.min(360, v)); preview(); }, { raw: true })));
  }
  if (MD.prevErr) C.append(h('p', { class: 'rt-mdlnote rt-mdlerr' }, MD.prevErr));
  C.append(h('div', { class: 'rt-mdlrow' }, btn('OK', () => commitSolid()), btn('Back to the sketch', () => { setStage('sketch'); })));
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
  const change = fn => v => { const keep = JSON.stringify(MD.ents); fn(v); MD.undo.push(keep); MD.redo = []; redraw(); };
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
const TOOL = {
  // the view closed, or another tab shown: the Model tools put away
  off() { stopModel(); },
  hintText() {
    if (MD.stage === 'plane') return 'Model: click a flat face (a part’s, or the table) to sketch on; empty space is the beam’s plane · Right-drag: turn the view · Esc: close';
    if (MD.stage === 'sketch') {
      if (MD.pickFor === 'mirror') return 'Click the line to mirror across · Esc: stop';
      if (MD.pickFor === 'centre') return 'Click the pattern’s centre · Esc: stop';
      const t = { line: 'Line: click its points; click its first again to close; Esc ends it', arc: 'Arc: click its start, its end, then a point it passes through', rect: 'Rectangle: click two corners', circle: 'Circle: its centre, then its edge',
        slot: 'Slot: its two ends, then its width', poly: 'Polygon: its centre, then a corner', hole: 'Hole: click where it goes', select: 'Select: click a shape (Shift: more); drag to move it; Delete removes it', use: 'Use edges: click a part’s edge to bring it into the sketch' }[MD.tool];
      return t + ' · Type a size as you draw · Alt: no snapping · Right-drag: turn the view';
    }
    if (MD.stage === 'extrude') return 'Extrude: drag the arrow, or type its distance · Enter or OK makes it';
    if (MD.stage === 'revolve') return 'Revolve: pick the axis (a line of the sketch) and the angle';
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
    if (MD.stage === 'extrude') {
      const a = arrowGeom(), b = K.D.cv.getBoundingClientRect();
      if (a) {
        const sc = p => { const v = mdV3(K, p).project(K.R.camera); return [(v.x + 1) / 2 * K.R.w, (1 - v.y) / 2 * K.R.h]; }, t = sc(a.tip), o = sc(a.base);
        if (Math.hypot(e.clientX - b.left - t[0], e.clientY - b.top - t[1]) < 14) {
          const one = sc([a.base[0] + a.n[0], a.base[1] + a.n[1], a.base[2] + a.n[2]]), dir = [one[0] - o[0], one[1] - o[1]];
          MD.dragArrow = { x: e.clientX, y: e.clientY, d0: MD.ex.d, dir, L2: dir[0] * dir[0] + dir[1] * dir[1] };
          return true;
        }
      }
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
    if (MD.tool === 'select') {
      const hit = entAt(q, tol);
      if (!hit) { MD.sel.clear(); drawCard(); redraw(); return true; }
      if (e.shiftKey) { if (MD.sel.has(hit.id)) MD.sel.delete(hit.id); else MD.sel.add(hit.id); }
      else if (!MD.sel.has(hit.id)) MD.sel = new Set([hit.id]);
      MD.dragSel = { q0: snapAt(e).p, moved: false, keep: JSON.stringify(MD.ents), orig: new Map(mdSelected().map(s => [s.id, JSON.stringify(s)])) };
      drawCard(); redraw(); return true;
    }
    if (MD.tool === 'use') { const s = edgeUnder(e); if (s) { useEdge(s); drawCard(); redraw(); } return true; }
    const s = snapAt(e, alignFrom()); if (!s) return true;
    place(s.p); return true;
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
    if (MD.stage !== 'sketch') return false;
    if (MD.dragSel && e.buttons & 1) {
      const s = snapAt(e); if (!s) return true;
      const D = MD.dragSel, dx = s.p[0] - D.q0[0], dy = s.p[1] - D.q0[1];
      if (dx || dy) D.moved = true;
      MD.ents = MD.ents.map(x => (D.orig.has(x.id) ? Object.assign(entMap(JSON.parse(D.orig.get(x.id)), moveMap(dx, dy)), { id: x.id }) : x));
      redraw(); return true;
    }
    if (MD.tool === 'use') { const s = edgeUnder(e); MD.hoverEdge = s; redraw(); return false; }
    MD.snap = snapAt(e, alignFrom()); MD.cursor = MD.snap ? MD.snap.p : null;
    // the shape's sizes appear in the card once it has any (its first point alone has none)
    if (MD.draft.length && MD.card && !MD.card.querySelector('.rt-mdltyped') && draftEnt()) drawCard();
    redraw(); liveFields();
    return false;
  },
  pointerup(e) {
    if (MD.dragArrow) { MD.dragArrow = null; drawCard(); return true; }
    if (MD.dragSel) { const D = MD.dragSel; MD.dragSel = null; if (D.moved) { MD.undo.push(D.keep); MD.redo = []; } drawCard(); return true; }
    return false;
  },
  dblclick(e) { if (MD.stage === 'sketch' && MD.tool === 'line') { MD.draft = []; MD.chain0 = null; redraw(); return true; } return false; },
  key(e) {
    if (!MD.on) return false;
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y') && MD.stage === 'sketch' && !typing) { sketchUndo(!(e.key === 'y' || e.shiftKey)); return true; }
    if (typing) return false;
    if (e.key === 'Escape') {
      if (MD.pickFor) { MD.pickFor = null; drawCard(); kit().hint(); return true; }
      if (MD.stage === 'sketch' && MD.draft.length) { MD.draft = []; MD.chain0 = null; MD.typed = {}; drawCard(); redraw(); return true; }
      if (MD.stage === 'extrude' || MD.stage === 'revolve') { setStage('sketch'); return true; }
      if (MD.stage === 'sketch' && MD.tool !== 'select') { MD.tool = 'select'; drawCard(); redraw(); kit().hint(); return true; }
      if (MD.stage === 'plane') { stopModel(); return true; }
      return true;
    }
    if (MD.stage === 'sketch' && (e.key === 'Delete' || e.key === 'Backspace') && MD.sel.size) { push(); MD.ents = MD.ents.filter(x => !MD.sel.has(x.id)); MD.sel.clear(); drawCard(); redraw(); return true; }
    if (MD.stage === 'extrude' && e.key === 'Enter') { commitSolid(); return true; }
    // a digit while drawing: into the shape's first size
    if (MD.stage === 'sketch' && MD.draft.length && /^[0-9.\-]$/.test(e.key) && MD.card) {
      const inp = MD.card.querySelector('.rt-mdltyped input'); if (inp) { inp.focus(); inp.value = e.key; return true; }
    }
    if (MD.stage === 'sketch' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = { l: 'line', a: 'arc', r: 'rect', c: 'circle', s: 'select', h: 'hole', p: 'poly', o: 'slot', u: 'use' }[e.key];
      if (k) { MD.tool = k; MD.draft = []; MD.typed = {}; drawCard(); redraw(); kit().hint(); return true; }
    }
    return false;
  },
};
function liveDist() { if (!MD.card) return; const inp = MD.card.querySelector('input[data-live="d"]'); if (inp && document.activeElement !== inp) inp.value = String(MD.ex.d); }

/* ---------- for the tests (J.model3d) ---------- */
export const MODEL3D_API = {
  start: () => startModel(),
  stop: () => stopModel(),
  state: () => ({ on: MD.on, stage: MD.stage, tool: MD.tool, ents: MD.ents.map(e => Object.assign({}, e)), draft: MD.draft.slice(), sel: [...MD.sel], plane: MD.plane, beam: MD.beam ? { n: MD.beam.pts.length, mids: MD.beam.mids } : null, holes: !!MD.holes, edges: (MD.edges || []).length, ex: Object.assign({}, MD.ex), err: MD.prevErr || '', last: MD.lastMade ? (getEl(MD.lastMade) || {}).name : null, card: MD.card ? MD.card.textContent : '' }),
  plane: k => { enterSketch(namedPlane(k)); return MD.plane; },
  // a plane of its own: { o, x, y }, or a part's face under a canvas point (css px)
  planeAt: (px, py) => { const K = kit(), b = K.D.cv.getBoundingClientRect(), pk = planeUnder({ clientX: b.left + px, clientY: b.top + py }); if (pk) enterSketch(pk); return pk ? { label: pk.label, src: pk.src } : null; },
  tool: k => { MD.tool = k; MD.draft = []; MD.typed = {}; drawCard(); redraw(); const K = kit(); if (K) K.hint(); },
  // a click at a sketch point (u, v mm), snapped as a click there would be unless raw
  click(u, v, raw) { if (MD.stage !== 'sketch') return; const p = raw ? [u, v] : snapPoint([u, v]); if (MD.tool === 'select') { const hit = entAt(p, 0.5); MD.sel = hit ? new Set([hit.id]) : new Set(); drawCard(); redraw(); return hit ? hit.id : null; } place(p); return p; },
  snap: (u, v, from) => snapPoint([u, v], from),
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
