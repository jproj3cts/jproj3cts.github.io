import { deg, num } from '../state/project.js';
import { meshEncode } from './stl.js';
import { zOf } from '../engines/trace.js';
import { cross3, dot3, unit3 } from './numeric.js';

/* ---------- Modelled parts: sketches on flat planes, extruded and revolved into solids ----------
   A modelled part is an STL object (type 'stl') that keeps how it was made beside its triangles: its
   features in order, each a sketch on a plane (lines, arcs, circles, rectangles, slots, polygons, holes)
   or a solid made from one (an extrude or a revolve) added to the part or cut from it. Its triangles are
   made again from them by Manifold (vendored, loaded the first time a part is rebuilt) and kept as an
   STL object's are, so a bench with one loads, traces and runs in Node with no Manifold at all.

   The part's own frame ("model" coordinates, mm): where its sketches' planes are given. Its mesh is kept
   centred on its box, as any STL object's; model.c is the model point at that centre, which is where the
   part stands on the bench (x, y, z, turned by its angle, tip and roll). Made again, its box moves, and
   the part moves by as much, so its shape stays where it was. */

export let MANIFOLD_DIR = '../assets/vendor/manifold-3d/3.5.4/';
export function setManifoldDir(d) { MANIFOLD_DIR = d; MF = null; mfLoading = null; }
let MF = null, mfLoading = null;
export const manifoldNow = () => MF;
/* Manifold, loaded once: its module and its WebAssembly beside it */
export function manifoldLib() {
  if (MF) return Promise.resolve(MF);
  if (!mfLoading) {
    const url = /^(file|https?):/.test(MANIFOLD_DIR) ? MANIFOLD_DIR : new URL(MANIFOLD_DIR, typeof location !== 'undefined' ? location.href : 'file:///').href;
    mfLoading = import(url + 'manifold.js').then(m => m.default()).then(w => { w.setup(); MF = w; return w; });
    mfLoading.catch(() => { mfLoading = null; });
  }
  return mfLoading;
}

/* ---------- the model as kept with the bench ---------- */
export const MODEL_MAX_FEATS = 64, MODEL_MAX_ENTS = 600;
const mfin = (v, d) => { const x = num(v, d); return Number.isFinite(x) ? x : d; };
const p2 = (v, d) => (Array.isArray(v) && v.length === 2 ? [mfin(v[0], d ? d[0] : 0), mfin(v[1], d ? d[1] : 0)] : (d || [0, 0]).slice());
const p3 = (v, d) => (Array.isArray(v) && v.length === 3 ? [mfin(v[0], d[0]), mfin(v[1], d[1]), mfin(v[2], d[2])] : d.slice());
const ID_RE = /^[A-Za-z0-9_-]{1,24}$/, mIdOk = v => typeof v === 'string' && ID_RE.test(v);   // (a test of undefined would read "undefined")
let idN = 0;
export const modelId = () => 'f' + Date.now().toString(36).slice(-4) + (idN++).toString(36) + Math.floor(Math.random() * 1296).toString(36);
/* a sketch's shapes, each checked: { id, t, k (construction) , ...its own } */
export const ENT_KINDS = ['line', 'arc', 'circle', 'rect', 'slot', 'poly', 'hole'];
export function normEnt(e) {
  if (!e || typeof e !== 'object' || !ENT_KINDS.includes(e.t)) return null;
  const o = { id: mIdOk(e.id) ? e.id : modelId(), t: e.t };
  if (e.k) o.k = true;
  const pos = (v, d, lo) => Math.max(lo === undefined ? 1e-4 : lo, Math.min(1e5, mfin(v, d)));
  switch (e.t) {
    case 'line': o.a = p2(e.a); o.b = p2(e.b); if (o.a[0] === o.b[0] && o.a[1] === o.b[1]) return null; break;
    case 'arc': o.c = p2(e.c); o.r = pos(e.r, 1); o.a0 = mfin(e.a0, 0); o.a1 = mfin(e.a1, 90); break;
    case 'circle': o.c = p2(e.c); o.r = pos(e.r, 1); break;
    case 'rect': o.c = p2(e.c); o.w = pos(e.w, 1); o.h = pos(e.h, 1); o.rot = mfin(e.rot, 0); o.rad = Math.min(pos(e.rad, 0, 0), Math.min(o.w, o.h) / 2 - 1e-6); if (!(o.rad > 0)) delete o.rad; break;
    case 'slot': o.a = p2(e.a); o.b = p2(e.b); o.r = pos(e.r, 1); break;
    case 'poly': o.c = p2(e.c); o.r = pos(e.r, 1); o.n = Math.max(3, Math.min(64, Math.round(mfin(e.n, 6)))); o.rot = mfin(e.rot, 0); break;
    case 'hole': o.c = p2(e.c); o.d = pos(e.d, 3); if (typeof e.std === 'string' && e.std.length < 24) o.std = e.std; break;
  }
  return o;
}
export const madd3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], msub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mmul3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
/* a plane: its origin o and two directions in it, x and y, made square to each other (y kept as near as it was) */
export function normPlane(P) {
  const o = p3(P && P.o, [0, 0, 0]);
  let x = unit3(p3(P && P.x, [1, 0, 0]));
  let y = p3(P && P.y, [0, 1, 0]);
  let n = cross3(x, y);
  if (Math.hypot(...n) < 1e-9) { y = Math.abs(x[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]; n = cross3(x, y); }
  n = unit3(n); y = cross3(n, x);
  return { o, x, y: unit3(y) };
}
export const planeNormal = P => unit3(cross3(P.x, P.y));
export function normFeat(f) {
  if (!f || typeof f !== 'object') return null;
  const id = mIdOk(f.id) ? f.id : modelId(), name = typeof f.name === 'string' ? f.name.slice(0, 40) : '';
  if (f.t === 'sketch') {
    const ents = (Array.isArray(f.ents) ? f.ents : []).slice(0, MODEL_MAX_ENTS).map(normEnt).filter(Boolean);
    return { id, t: 'sketch', name, plane: normPlane(f.plane), ents };
  }
  if (f.t === 'extrude' || f.t === 'revolve') {
    const o = { id, t: f.t, name, sk: mIdOk(f.sk) ? f.sk : '', op: f.op === 'cut' ? 'cut' : 'add' };
    if (f.t === 'extrude') {
      o.d = Math.max(-1e4, Math.min(1e4, mfin(f.d, 10))); if (o.d === 0) o.d = 10;
      if (f.both) o.both = true;
      if (f.through) o.through = true;
    } else {
      o.axis = mIdOk(f.axis) ? f.axis : '';
      o.deg = Math.max(1, Math.min(360, mfin(f.deg, 360)));
    }
    return o;
  }
  return null;
}
export function normModel(m) {
  if (!m || typeof m !== 'object' || !Array.isArray(m.feats)) return null;
  const feats = m.feats.slice(0, MODEL_MAX_FEATS).map(normFeat).filter(Boolean);
  // a solid made from a sketch that is not there is dropped (it could be made from nothing)
  const sk = new Set(feats.filter(f => f.t === 'sketch').map(f => f.id));
  const kept = feats.filter(f => f.t === 'sketch' || sk.has(f.sk));
  return { feats: kept, c: p3(m.c, [0, 0, 0]) };
}

/* ---------- a sketch's shapes as outlines ---------- */
const TAU = 2 * Math.PI;
const segsFor = (r, sweep) => Math.max(4, Math.min(180, Math.ceil(Math.abs(sweep) / TAU * Math.max(24, Math.min(180, 2 * Math.PI * r / 0.6)))));
function arcPts(c, r, a0, a1, endpoints) {
  // a0 to a1 anticlockwise, radians
  let sw = a1 - a0; while (sw <= 0) sw += TAU; if (sw > TAU) sw = TAU;
  const n = segsFor(r, sw), out = [];
  for (let i = 0; i <= n; i++) { if (!endpoints && (i === 0 || i === n)) continue; const a = a0 + sw * i / n; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
  return out;
}
const rotPt = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
/* a closed shape's outline, anticlockwise; or an open shape's points along it (a line, an arc) */
export function entOutline(e) {
  switch (e.t) {
    case 'line': return [e.a, e.b];
    case 'arc': return arcPts(e.c, e.r, e.a0 * deg, e.a1 * deg, true);
    case 'circle': case 'hole': { const r = e.t === 'hole' ? e.d / 2 : e.r; return arcPts(e.c, r, 0, TAU, true).slice(0, -1); }
    case 'poly': { const out = []; for (let i = 0; i < e.n; i++) { const a = e.rot * deg + TAU * i / e.n; out.push([e.c[0] + e.r * Math.cos(a), e.c[1] + e.r * Math.sin(a)]); } return out; }
    case 'rect': {
      const w = e.w / 2, hh = e.h / 2, r = e.rad || 0, a = e.rot * deg, pts = [];
      if (r > 0) {
        const corners = [[w - r, -hh + r, -Math.PI / 2], [w - r, hh - r, 0], [-w + r, hh - r, Math.PI / 2], [-w + r, -hh + r, Math.PI]];
        for (const [cx, cy, s] of corners) pts.push(...arcPts([cx, cy], r, s, s + Math.PI / 2, true));
      } else pts.push([w, -hh], [w, hh], [-w, hh], [-w, -hh]);
      return pts.map(p => { const q = rotPt(p, a); return [q[0] + e.c[0], q[1] + e.c[1]]; });
    }
    case 'slot': {
      const d = [e.b[0] - e.a[0], e.b[1] - e.a[1]], ang = Math.atan2(d[1], d[0]);
      return [...arcPts(e.b, e.r, ang - Math.PI / 2, ang + Math.PI / 2, true), ...arcPts(e.a, e.r, ang + Math.PI / 2, ang + 1.5 * Math.PI, true)];
    }
  }
  return [];
}
export const entClosed = e => !(e.t === 'line' || e.t === 'arc');
/* an open shape's two ends */
export function entEnds(e) {
  if (e.t === 'line') return [e.a, e.b];
  if (e.t === 'arc') return [[e.c[0] + e.r * Math.cos(e.a0 * deg), e.c[1] + e.r * Math.sin(e.a0 * deg)], [e.c[0] + e.r * Math.cos(e.a1 * deg), e.c[1] + e.r * Math.sin(e.a1 * deg)]];
  return null;
}
const area2 = P => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
export const loopArea = P => Math.abs(area2(P));
export function inPoly(P, q) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
const JOIN = 1e-3;                 // mm: two ends this close are one corner
/* the sketch's closed outlines (each anticlockwise, with the shapes it is made of) and how many chains are left open:
   a closed shape is one by itself; lines and arcs joined end to end are one when they come back to where they began */
export function sketchLoops(ents) {
  const loops = [], open = [];
  for (const e of ents) if (!e.k && entClosed(e)) { const P = entOutline(e); if (P.length >= 3 && loopArea(P) > 1e-9) loops.push(Object.assign({ pts: area2(P) < 0 ? P.reverse() : P, ids: [e.id] }, e.t === 'hole' ? { hole: true } : {})); }
  // the ends of the lines and arcs, joined where they meet
  const edges = ents.filter(e => !e.k && !entClosed(e)), nodes = [];
  const node = p => { for (let i = 0; i < nodes.length; i++) if (Math.hypot(nodes[i].p[0] - p[0], nodes[i].p[1] - p[1]) < JOIN) return i; nodes.push({ p, e: [] }); return nodes.length - 1; };
  const E = edges.map((e, i) => { const [a, b] = entEnds(e), na = node(a), nb = node(b); nodes[na].e.push(i); nodes[nb].e.push(i); return { e, na, nb, used: false }; });
  for (let s = 0; s < E.length; s++) {
    if (E[s].used) continue;
    // walk from this edge's start along unused edges until back at the start, or stuck
    const path = [], start = E[s].na;
    let at = start, cur = s, ok = false;
    while (cur >= 0) {
      const ed = E[cur]; ed.used = true;
      const fwd = ed.na === at, nxt = fwd ? ed.nb : ed.na;
      let pts = entOutline(ed.e); if (!fwd) pts = pts.slice().reverse();
      path.push({ pts, id: ed.e.id });
      at = nxt;
      if (at === start) { ok = true; break; }
      cur = nodes[at].e.find(j => !E[j].used); if (cur === undefined) cur = -1;
    }
    if (ok) {
      const P = [];
      for (const seg of path) for (let i = 0; i < seg.pts.length - 1; i++) P.push(seg.pts[i]);
      if (P.length >= 3 && loopArea(P) > 1e-9) loops.push({ pts: area2(P) < 0 ? P.reverse() : P, ids: path.map(q => q.id) });
    } else open.push(path.map(q => q.id));
  }
  // each loop's depth: inside how many others (a loop inside one is a hole in it; inside two, an island again)
  for (const L of loops) {
    const q = L.pts[0], mid = [(L.pts[0][0] + L.pts[Math.floor(L.pts.length / 2)][0]) / 2, (L.pts[0][1] + L.pts[Math.floor(L.pts.length / 2)][1]) / 2];
    const probe = inPoly(L.pts, mid) ? mid : q;
    L.depth = loops.filter(M => M !== L && loopArea(M.pts) > loopArea(L.pts) && inPoly(M.pts, probe)).length;
  }
  return { loops, open };
}

/* ---------- solids, with Manifold ---------- */
// a plane as a matrix (column-major 4x4): its x, y and normal, then its origin
const planeMat = P => { const n = planeNormal(P); return [P.x[0], P.x[1], P.x[2], 0, P.y[0], P.y[1], P.y[2], 0, n[0], n[1], n[2], 0, P.o[0], P.o[1], P.o[2], 1]; };
/* the sketch's region as a cross-section: its outer loops, less the holes in them, with islands in the holes again; and
   its holes (the Hole tool's) never material: taken out of what is added, or (cut) what is cut */
export function sketchSection(W, ents, cut) {
  const { CrossSection } = W, { loops } = sketchLoops(ents), out = { cs: null, loops: loops.length };
  const holes = loops.filter(q => q.hole), L = loops.filter(q => !q.hole).sort((a, b) => a.depth - b.depth);
  let cs = null;
  const union = q => { const piece = new CrossSection([q.pts], 'NonZero'); const nx = cs ? cs.add(piece) : piece; if (cs) { cs.delete(); piece.delete(); } cs = nx; };
  if (cut) {
    // a cut: its shapes as drawn, and its holes, all cut
    for (const q of L) { if (q.depth % 2 === 0) union(q); else if (cs) { const piece = new CrossSection([q.pts], 'NonZero'), nx = cs.subtract(piece); cs.delete(); piece.delete(); cs = nx; } }
    for (const q of holes) union(q);
    out.cs = cs; return out;
  }
  for (const q of holes) q.depth = 1;
  for (const q of L.concat(holes)) {
    if (q.hole) { if (cs) { const piece = new CrossSection([q.pts], 'NonZero'), nx = cs.subtract(piece); cs.delete(); piece.delete(); cs = nx; } continue; }
    const piece = new CrossSection([q.pts], 'NonZero');
    if (q.depth % 2 === 0) { const nx = cs ? cs.add(piece) : piece; if (cs) { cs.delete(); piece.delete(); } cs = nx; }
    else if (cs) { const nx = cs.subtract(piece); cs.delete(); piece.delete(); cs = nx; }
    else piece.delete();
  }
  out.cs = cs;
  return out;
}
/* a feature's solid, in the part's frame, or { error } */
function featSolid(W, f, sk, sizeNow) {
  if (!sk) return { error: 'its sketch is missing' };
  if (f.t === 'extrude') {
    const S = sketchSection(W, sk.ents, f.op === 'cut');
    if (!S.cs || S.cs.isEmpty()) { if (S.cs) S.cs.delete(); return { error: 'its sketch has no closed shape to extrude' }; }
    let h = Math.abs(f.d), z0 = f.d < 0 ? -h : 0;
    if (f.both) z0 = -h / 2;
    if (f.through) { const L = 2 * (sizeNow + Math.hypot(...sk.plane.o)) + 100; h = 2 * L; z0 = -L; }
    const s0 = S.cs.extrude(h); S.cs.delete();
    const s1 = s0.translate([0, 0, z0]); s0.delete();
    const s2 = s1.transform(planeMat(sk.plane)); s1.delete();
    return { solid: s2 };
  }
  // a revolve: the profile turned about a line of its sketch (its axis), by deg
  const ax = sk.ents.find(e => e.id === f.axis && e.t === 'line');
  if (!ax) return { error: 'its axis (a line in its sketch) is missing' };
  const rest = sk.ents.filter(e => e.id !== f.axis);
  const A = ax.a, D0 = [ax.b[0] - ax.a[0], ax.b[1] - ax.a[1]], dl = Math.hypot(...D0), D = [D0[0] / dl, D0[1] / dl];
  let P = [D[1], -D[0]];
  const S = sketchSection(W, rest, f.op === 'cut');
  if (!S.cs || S.cs.isEmpty()) { if (S.cs) S.cs.delete(); return { error: 'its sketch has no closed shape to revolve' }; }
  // the profile on the axis's +x side (Manifold turns only that half): the side most of it is on
  const bb = S.cs.bounds(), cx = (bb.min[0] + bb.max[0]) / 2, cy = (bb.min[1] + bb.max[1]) / 2;
  let Dv = D;
  if ((cx - A[0]) * P[0] + (cy - A[1]) * P[1] < 0) { P = [-P[0], -P[1]]; Dv = [-D[0], -D[1]]; }
  // into the axis's frame: x across it (P), y along it (Dv)
  const toAx = S.cs.translate([-A[0], -A[1]]); S.cs.delete();
  const m2 = [P[0], Dv[0], 0, P[1], Dv[1], 0, 0, 0, 1];        // (2D: column-major 3x3, rows x' = P·q, y' = Dv·q)
  const cs2 = toAx.transform(m2); toAx.delete();
  const r0 = cs2.revolve(Math.max(24, Math.min(180, Math.round(f.deg / 3))), f.deg); cs2.delete();
  // the revolved solid's x is P, y the sketch's normal, z the axis: into the sketch's plane, then the part's frame
  const pl = sk.plane, n = planeNormal(pl);
  const P3 = madd3(mmul3(pl.x, P[0]), mmul3(pl.y, P[1])), D3 = madd3(mmul3(pl.x, Dv[0]), mmul3(pl.y, Dv[1])), O3 = madd3(pl.o, madd3(mmul3(pl.x, A[0]), mmul3(pl.y, A[1])));
  const M = [P3[0], P3[1], P3[2], 0, n[0], n[1], n[2], 0, D3[0], D3[1], D3[2], 0, O3[0], O3[1], O3[2], 1];
  const s = r0.transform(M); r0.delete();
  return { solid: s };
}
/* the part's solid from its features, as triangles in its own frame: { T, n, errors: [[feature id, why]] } */
export function buildModel(W, model, upTo) {
  const sk = new Map(), errors = [];
  let acc = null;
  const feats = upTo ? model.feats.slice(0, model.feats.findIndex(f => f.id === upTo) + 1) : model.feats;
  for (const f of feats) {
    if (f.t === 'sketch') { sk.set(f.id, f); continue; }
    let size = 0;
    if (acc) { const b = acc.boundingBox(); size = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]); }
    const r = featSolid(W, f, sk.get(f.sk), size);
    if (r.error) { errors.push([f.id, r.error]); continue; }
    if (f.op === 'cut') {
      if (!acc) { errors.push([f.id, 'there is nothing before it to cut from']); r.solid.delete(); continue; }
      const nx = acc.subtract(r.solid); acc.delete(); r.solid.delete(); acc = nx;
    } else {
      const nx = acc ? acc.add(r.solid) : r.solid; if (acc) { acc.delete(); r.solid.delete(); } acc = nx;
    }
  }
  if (!acc) return { T: new Float32Array(0), n: 0, errors };
  const T = solidTris(acc); acc.delete();
  return { T, n: T.length / 9, errors };
}
/* a solid's triangles, 9 numbers each */
export function solidTris(s) {
  const M = s.getMesh(), np = M.numProp, V = M.vertProperties, I = M.triVerts, T = new Float32Array(3 * I.length);
  for (let j = 0; j < I.length; j++) { const v = I[j] * np; T[3 * j] = V[v]; T[3 * j + 1] = V[v + 1]; T[3 * j + 2] = V[v + 2]; }
  return T;
}
/* one feature's solid alone, as triangles in the part's frame (a preview while it is set up), or { error } */
export function featPreview(W, model, f) {
  const sk = new Map(model.feats.filter(q => q.t === 'sketch').map(q => [q.id, q]));
  const r = featSolid(W, f, sk.get(f.sk), 200);
  if (r.error) return r;
  const T = solidTris(r.solid); r.solid.delete();
  return { T };
}

/* ---------- the part on the bench: its frame, and its triangles made again ---------- */
// a point or direction of the part's own frame (as its mesh is kept: centred) onto the bench, and back: turned by its
// roll, then tip, then angle (as the trace and the 3D view turn it), scaled, and moved to where it stands
export function partRot(el, v) {
  const a = (el.angle || 0) * deg, t = (el.tip || 0) * deg, r = (el.roll || 0) * deg;
  let [x, y, z] = v;
  [y, z] = [y * Math.cos(r) - z * Math.sin(r), y * Math.sin(r) + z * Math.cos(r)];
  [x, z] = [x * Math.cos(t) - z * Math.sin(t), x * Math.sin(t) + z * Math.cos(t)];
  [x, y] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  return [x, y, z];
}
export function partRotInv(el, v) {
  const a = (el.angle || 0) * deg, t = (el.tip || 0) * deg, r = (el.roll || 0) * deg;
  let [x, y, z] = v;
  [x, y] = [x * Math.cos(a) + y * Math.sin(a), -x * Math.sin(a) + y * Math.cos(a)];
  [x, z] = [x * Math.cos(t) + z * Math.sin(t), -x * Math.sin(t) + z * Math.cos(t)];
  [y, z] = [y * Math.cos(r) + z * Math.sin(r), -y * Math.sin(r) + z * Math.cos(r)];
  return [x, y, z];
}
const partC = el => (el.model && el.model.c) || [0, 0, 0];
export const modelToWorld = (el, p) => madd3([el.x, el.y, zOf(el)], partRot(el, mmul3(msub3(p, partC(el)), el.scale || 1)));
export const worldToModel = (el, p) => madd3(partC(el), mmul3(partRotInv(el, msub3(p, [el.x, el.y, zOf(el)])), 1 / (el.scale || 1)));
export const planeToWorld = (el, P) => ({ o: modelToWorld(el, P.o), x: partRot(el, P.x), y: partRot(el, P.y) });
export const planeToModel = (el, P) => normPlane({ o: worldToModel(el, P.o), x: partRotInv(el, P.x), y: partRotInv(el, P.y) });
/* the part made again from its model: its triangles, and where it stands so that its shape stays put. Returns
   { ok, n, errors } (its mesh untouched when nothing could be made) */
export function rebuildPart(W, el, setZ) {
  const r = buildModel(W, el.model);
  if (!r.n) return { ok: false, n: 0, errors: r.errors.length ? r.errors : [['', 'nothing to make: no extrude or revolve yet']] };
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < r.T.length; i++) { const k = i % 3; if (r.T[i] < lo[k]) lo[k] = r.T[i]; if (r.T[i] > hi[k]) hi[k] = r.T[i]; }
  const c1 = lo.map((v, k) => (v + hi[k]) / 2), shift = partRot(el, mmul3(msub3(c1, partC(el)), el.scale || 1));
  const zNew = zOf(el) + shift[2];
  el.x = +(el.x + shift[0]).toFixed(6); el.y = +(el.y + shift[1]).toFixed(6);
  if (setZ) setZ(el, zNew); else el.z = +zNew.toFixed(6);
  el.model.c = c1.map(v => +v.toFixed(6));
  el.mesh = meshEncode(r.T, 'model');
  return { ok: true, n: el.mesh.n, errors: r.errors };
}
/* a new modelled part from a sketch on a plane of the bench: its frame the bench's axes, from the sketch plane's
   origin; with its first solid (an extrude or a revolve) of that sketch */
export function newModelPart(planeWorld, ents, solid, name) {
  const P = normPlane(planeWorld), sk = { id: modelId(), t: 'sketch', name: 'Sketch 1', plane: { o: [0, 0, 0], x: P.x, y: P.y }, ents: ents.map(normEnt).filter(Boolean) };
  const f = normFeat(Object.assign({ id: modelId(), name: (solid.t === 'revolve' ? 'Revolve' : 'Extrude') + ' 1' }, solid, { sk: sk.id, op: 'add' }));
  return { type: 'stl', name: name || 'Model', x: P.o[0], y: P.o[1], z: P.o[2], angle: 0, units: 'mm', colour: '#7d8794', model: { feats: [sk, f], c: [0, 0, 0] } };
}

/* ---------- an extrude made longer or shorter: the sketches on its end move with it ----------
   A sketch made on a part's face lies on the plane of an extrude's end. Changed, that end moves, and so does every later
   sketch on it (and, in turn, what is made from those, and the sketches on their ends): as a sketch on a face would. */
export function extrudeTo(model, id, d) {
  const f = model.feats.find(q => q.id === id && q.t === 'extrude'); if (!f) return;
  const sk = model.feats.find(q => q.id === f.sk);
  const d0 = f.d; f.d = d;
  if (!sk || f.through || d === d0) return;
  const n = planeNormal(sk.plane), moves = [];
  const capAt = (P, nn, dd, both) => (both ? [[madd3(P.o, mmul3(nn, dd / 2)), 1 / 2], [madd3(P.o, mmul3(nn, -dd / 2)), -1 / 2]] : [[madd3(P.o, mmul3(nn, dd)), 1]]);
  for (const [o, k] of capAt(sk.plane, n, d0, f.both)) moves.push({ o, n, v: mmul3(n, (d - d0) * k) });
  const from = model.feats.indexOf(f);
  for (const S of model.feats.slice(from + 1)) {
    if (S.t !== 'sketch') continue;
    const nS = planeNormal(S.plane);
    const m = moves.find(q => Math.hypot(...cross3(q.n, nS)) < 1e-6 && Math.abs(dot3(msub3(S.plane.o, q.o), q.n)) < 1e-6);
    if (!m) continue;
    // the sketch moved; the ends of what is made from it move as much (for the sketches after it)
    const oldO = S.plane.o; S.plane = Object.assign({}, S.plane, { o: madd3(S.plane.o, m.v) });
    for (const g of model.feats) if (g.t === 'extrude' && g.sk === S.id && !g.through) for (const [o] of capAt({ o: oldO }, nS, g.d, g.both)) moves.push({ o, n: nS, v: m.v });
  }
}

/* ---------- a sketch's shapes moved, turned and mirrored (patterns, mirror) ----------
   f: { m: [a, b, c, d] (x' = a x + b y, y' = c x + d y), t: [tx, ty] } */
const mapP = (f, p) => [f.m[0] * p[0] + f.m[1] * p[1] + f.t[0], f.m[2] * p[0] + f.m[3] * p[1] + f.t[1]];
export function entMap(e, f) {
  const det = f.m[0] * f.m[3] - f.m[1] * f.m[2], phi = Math.atan2(f.m[2], f.m[0]) / deg, o = Object.assign({}, e, { id: modelId() });
  const rot = r => (det >= 0 ? r + phi : phi - r);
  switch (e.t) {
    case 'line': o.a = mapP(f, e.a); o.b = mapP(f, e.b); break;
    case 'slot': o.a = mapP(f, e.a); o.b = mapP(f, e.b); break;
    case 'circle': case 'hole': o.c = mapP(f, e.c); break;
    case 'rect': case 'poly': o.c = mapP(f, e.c); o.rot = rot(e.rot); break;
    case 'arc': {
      o.c = mapP(f, e.c);
      const [s, t] = entEnds(e).map(p => mapP(f, p));
      const [p0, p1] = det >= 0 ? [s, t] : [t, s];
      o.a0 = Math.atan2(p0[1] - o.c[1], p0[0] - o.c[0]) / deg; o.a1 = Math.atan2(p1[1] - o.c[1], p1[0] - o.c[0]) / deg;
      break;
    }
  }
  return normEnt(o);
}
// mirrored across the line through a, b
export function mirrorMap(a, b) {
  const th = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(2 * th), s = Math.sin(2 * th);
  const m = [c, s, s, -c], t = [a[0] - (m[0] * a[0] + m[1] * a[1]), a[1] - (m[2] * a[0] + m[3] * a[1])];
  return { m, t };
}
export const moveMap = (dx, dy) => ({ m: [1, 0, 0, 1], t: [dx, dy] });
// turned by angle (degrees) about c
export function turnMap(c, angle) {
  const a = angle * deg, co = Math.cos(a), si = Math.sin(a), m = [co, -si, si, co];
  return { m, t: [c[0] - (m[0] * c[0] + m[1] * c[1]), c[1] - (m[2] * c[0] + m[3] * c[1])] };
}

/* ---------- holes of the usual sizes: a screw's clearance, or its tapping drill (mm) ---------- */
export const HOLE_SIZES = [
  ['M2 clearance', 2.4], ['M2.5 clearance', 2.9], ['M3 clearance', 3.4], ['M4 clearance', 4.5], ['M5 clearance', 5.5], ['M6 clearance', 6.6], ['M8 clearance', 9],
  ['M3 tapped', 2.5], ['M4 tapped', 3.3], ['M5 tapped', 4.2], ['M6 tapped', 5], ['M8 tapped', 6.8],
  ['4-40 clearance', 2.95], ['8-32 clearance', 4.3], ['1/4-20 clearance', 6.8], ['4-40 tapped', 2.26], ['8-32 tapped', 3.45], ['1/4-20 tapped', 5.1],
];

/* a length as typed: mm unless it says otherwise (25.4mm, 1in, 1", 2.5 cm); null when it is not one */
export function parseLength(s) {
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(mm|cm|m|in|inch|inches|"|”|thou|mil)?\s*$/i.exec(String(s));
  if (!m) return null;
  const v = +m[1], u = (m[2] || 'mm').toLowerCase();
  const k = { mm: 1, cm: 10, m: 1000, in: 25.4, inch: 25.4, inches: 25.4, '"': 25.4, '”': 25.4, thou: 0.0254, mil: 0.0254 }[u];
  return Number.isFinite(v) ? v * k : null;
}

/* ---------- a mesh as a binary .stl file (its triangles in its own frame, mm) ---------- */
export function stlBytes(T, name) {
  const n = Math.floor(T.length / 9), buf = new ArrayBuffer(84 + 50 * n), dv = new DataView(buf);
  const head = ('JEKray ' + (name || 'model')).slice(0, 79);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 127);
  dv.setUint32(80, n, true);
  for (let i = 0; i < n; i++) {
    const o = 84 + 50 * i, t = 9 * i;
    const e1 = [T[t + 3] - T[t], T[t + 4] - T[t + 1], T[t + 5] - T[t + 2]], e2 = [T[t + 6] - T[t], T[t + 7] - T[t + 1], T[t + 8] - T[t + 2]];
    const nn = unit3(cross3(e1, e2));
    for (let k = 0; k < 3; k++) dv.setFloat32(o + 4 * k, nn[k] || 0, true);
    for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + 4 * k, T[t + k], true);
    dv.setUint16(o + 48, 0, true);
  }
  return new Uint8Array(buf);
}
