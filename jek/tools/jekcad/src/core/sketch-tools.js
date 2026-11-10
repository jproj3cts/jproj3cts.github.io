import { ENT_KINDS, hpt, inRegion, inside, lineDir, sketchId, sketchRegions } from './sketch.js';

/* ==========================================================================
   A sketch's shapes checked as a file is read, their outlines, the regions found for features, and the sketch
   tools that make or change shapes: trim, fillet, offset, mirror. Pure: the page's sketcher and the kernel worker
   both use them.
   ========================================================================== */
const DEG = Math.PI / 180;
const fin = (v, d) => { const x = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(x) ? x : d; };
const pt2 = (v, d) => (Array.isArray(v) && v.length >= 2 ? [fin(v[0], d[0]), fin(v[1], d[1])] : d.slice());
/* a sketch's shapes, checked: an unknown kind is dropped, a missing number given its default */
export function normEnts(ents) {
  const out = [], ids = new Set();
  for (const e of Array.isArray(ents) ? ents.slice(0, 4000) : []) {
    if (!e || !ENT_KINDS.includes(e.t)) continue;
    const id = typeof e.id === 'string' && e.id.length < 30 && !ids.has(e.id) ? e.id : sketchId(e.t[0]);
    ids.add(id);
    const n = { id, t: e.t };
    if (e.t === 'line') { n.a = pt2(e.a, [0, 0]); n.b = pt2(e.b, [10, 0]); }
    else if (e.t === 'arc') { n.c = pt2(e.c, [0, 0]); n.r = Math.abs(fin(e.r, 5)) || 5; n.a0 = fin(e.a0, 0); n.a1 = fin(e.a1, 90); }
    else if (e.t === 'circle') { n.c = pt2(e.c, [0, 0]); n.r = Math.abs(fin(e.r, 5)) || 5; }
    else if (e.t === 'ellipse') { n.c = pt2(e.c, [0, 0]); n.rx = Math.abs(fin(e.rx, 10)) || 10; n.ry = Math.abs(fin(e.ry, 5)) || 5; n.rot = fin(e.rot, 0); }
    else if (e.t === 'spline') { n.pts = (Array.isArray(e.pts) ? e.pts : []).slice(0, 200).map(q => pt2(q, [0, 0])); if (n.pts.length < 2) continue; if (e.cv) n.cv = true; if (e.closed) n.closed = true; }
    else n.c = pt2(e.c, [0, 0]);
    if (e.k) n.k = true;            // construction
    if (e.ref) n.ref = true;        // projected from the model (Use)
    // the model edge it came from (the kernel's ref for it), so it can follow the edge when the model changes
    const sr = e.ref && e.src;
    if (sr && sr.kind === 'edge' && typeof sr.part === 'string' && sr.part.length < 80 && Array.isArray(sr.faces) && sr.faces.length >= 1 && sr.faces.length <= 2 && sr.faces.every(x => typeof x === 'string' && x.length < 120) && Array.isArray(sr.pt) && sr.pt.length === 3 && sr.pt.every(Number.isFinite)) n.src = { kind: 'edge', part: sr.part, faces: sr.faces.slice(), pt: sr.pt.slice() };
    else if (sr && sr.kind === 'vertex' && e.t === 'point' && typeof sr.part === 'string' && sr.part.length < 80 && Array.isArray(sr.faces) && sr.faces.length >= 1 && sr.faces.length <= 6 && sr.faces.every(x => typeof x === 'string' && x.length < 120) && Array.isArray(sr.pt) && sr.pt.length === 3 && sr.pt.every(Number.isFinite)) n.src = { kind: 'vertex', part: sr.part, faces: sr.faces.slice(), pt: sr.pt.slice() };
    out.push(n);
  }
  return out;
}
/* an arc's sweep, degrees, in (0, 360] */
export const arcSweep = e => { let s = (e.a1 - e.a0) % 360; if (s < 0) s += 360; if (s <= 1e-9) s += 360; return s; };
/* an ellipse or a spline as points along it (an ellipse all the way round, its first point not said again; a
   spline from its first point to its last, or round to its first again when it is closed). A spline goes through
   its points, each stretch a cubic that leaves a point the way the points either side of it lie (Catmull and
   Rom's); with cv its points are one Bézier curve's control points. step, degrees, sets how fine. */
export function curvePts(e, step) {
  const fine = Math.max(1, Math.min(8, Math.round(6 / (step || 6) * 2)));
  if (e.t === 'ellipse') {
    const n = 48 * fine, a = e.rot * DEG, ca = Math.cos(a), sa = Math.sin(a), out = [];
    for (let i = 0; i < n; i++) { const t = 2 * Math.PI * i / n, x = e.rx * Math.cos(t), y = e.ry * Math.sin(t); out.push([e.c[0] + x * ca - y * sa, e.c[1] + x * sa + y * ca]); }
    return out;
  }
  const P = e.pts, out = [];
  if (e.cv) {
    // de Casteljau's steps down the control points
    const n = 16 * fine * Math.max(1, P.length - 1);
    for (let i = 0; i <= n; i++) { const t = i / n; let Q = P.map(q => q.slice()); while (Q.length > 1) Q = Q.slice(1).map((q, j) => [Q[j][0] + (q[0] - Q[j][0]) * t, Q[j][1] + (q[1] - Q[j][1]) * t]); out.push(Q[0]); }
    return out;
  }
  const m = P.length, cl = !!e.closed && m > 2, at = i => (cl ? P[((i % m) + m) % m] : P[Math.max(0, Math.min(m - 1, i))]), per = 8 * fine, spans = cl ? m : m - 1;
  for (let s = 0; s < spans; s++) {
    const p0 = at(s - 1), p1 = at(s), p2 = at(s + 1), p3 = at(s + 2);
    for (let i = 0; i < per; i++) { const t = i / per, t2 = t * t, t3 = t2 * t; out.push([0, 1].map(k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3))); }
  }
  if (!cl) out.push(P[m - 1].slice());
  return out;
}
const isCurve = e => e.t === 'ellipse' || e.t === 'spline';
const curveClosed = e => e.t === 'ellipse' || (e.t === 'spline' && !!e.closed);
/* a shape's outline as points: arcs and circles in steps of at most `step` degrees */
export function entOutline(e, step) {
  step = step || 6;
  if (e.t === 'line') return [e.a, e.b];
  if (e.t === 'point') return [e.c];
  if (e.t === 'ellipse' || e.t === 'spline') return curvePts(e, step);
  const circ = e.t === 'circle', sw = circ ? 360 : arcSweep(e), a0 = circ ? 0 : e.a0, n = Math.max(circ ? 24 : 2, Math.ceil(sw / step));
  const out = [];
  for (let i = 0; i <= (circ ? n - 1 : n); i++) { const a = (a0 + sw * i / n) * DEG; out.push([e.c[0] + e.r * Math.cos(a), e.c[1] + e.r * Math.sin(a)]); }
  return out;
}
/* a sketch's shapes with what is all but the same made the same: ends and centres within a few thousandths of a
   millimetre of each other set to one place, and circles and arcs about one centre with all but the same radius
   given one radius. Shapes drawn over each other by eye (one slot's end on another's) are a hair apart, and that
   hair cuts the plane into slivers that are no use as regions and that the kernel cannot make faces of. */
export const WELD = 0.005;
export function weldEnts(ents, tol = WELD) {
  const out = ents.map(e => Object.assign({}, e, e.a ? { a: e.a.slice(), b: e.b.slice() } : {}, e.c ? { c: e.c.slice() } : {})), reps = [];
  const snap = p => { for (const q of reps) if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol) return q.slice(); reps.push(p.slice()); return p; };
  // centres first, so an end that is all but on a centre goes to it
  for (const e of out) if (e.c) e.c = snap(e.c);
  for (const e of out) if (e.a) { e.a = snap(e.a); e.b = snap(e.b); }
  const round = out.filter(e => e.t === 'arc' || e.t === 'circle');
  // an arc's ends turned onto the place its neighbours' ends were set to
  // (and an end all but on another arc's end is drawn to that end: w0, w1, where its outline starts and stops)
  const arcEnds = [];
  for (const e of out) if (e.t === 'arc') for (const k of ['a0', 'a1']) {
    const an = e[k] * Math.PI / 180, p = [e.c[0] + e.r * Math.cos(an), e.c[1] + e.r * Math.sin(an)], q = reps.find(z => Math.hypot(p[0] - z[0], p[1] - z[1]) <= tol && Math.hypot(z[0] - e.c[0], z[1] - e.c[1]) > tol);
    if (q) { e[k] = Math.atan2(q[1] - e.c[1], q[0] - e.c[0]) * 180 / Math.PI; continue; }
    const o = arcEnds.find(z => Math.hypot(p[0] - z[0], p[1] - z[1]) <= tol);
    if (o) { if (Math.hypot(p[0] - o[0], p[1] - o[1]) > 1e-12) e[k === 'a0' ? 'w0' : 'w1'] = o; } else arcEnds.push(p);
  }
  for (let i = 0; i < round.length; i++) for (let j = 0; j < i; j++) if (round[i].c[0] === round[j].c[0] && round[i].c[1] === round[j].c[1] && Math.abs(round[i].r - round[j].r) <= tol) { round[i].r = round[j].r; break; }
  // and a line's end that is all but on a circle or an arc set onto it (where the arc's own end was just turned to)
  for (const e of out) if (e.t === 'line') for (const k of ['a', 'b']) for (const c of round) { const d = Math.hypot(e[k][0] - c.c[0], e[k][1] - c.c[1]); if (d > tol && Math.abs(d - c.r) <= tol) { e[k] = [c.c[0] + (e[k][0] - c.c[0]) / d * c.r, c.c[1] + (e[k][1] - c.c[1]) / d * c.r]; break; } }
  return unionEnts(out, tol);
}
/* shapes that lie along each other made one: arcs on one circle that overlap or meet become the arc that covers them
   (a circle, if they go right round, or if one of them is a circle), and lines along one line that overlap become
   one line. Two curves laid one on the other are one boundary, and a face cannot be made with both. */
function unionEnts(ents, tol) {
  const out = [], done = new Set();
  ents.forEach((e, i) => {
    if (done.has(i)) return;
    if (e.t === 'arc' || e.t === 'circle') {
      const same = ents.map((o, j) => j).filter(j => !done.has(j) && (ents[j].t === 'arc' || ents[j].t === 'circle') && ents[j].c[0] === e.c[0] && ents[j].c[1] === e.c[1] && ents[j].r === e.r);
      for (const j of same) done.add(j);
      if (same.length === 1) { out.push(e); return; }
      // the circle cut at every arc's end, and each piece that some arc (or a circle) covers kept once: the pieces
      // meet end to end where the arcs did, so what was drawn to an arc's end still meets an end
      const eps = Math.max(1e-7, tol / e.r * 180 / Math.PI), m360 = v => ((v % 360) + 360) % 360, whole = same.some(j => ents[j].t === 'circle');
      const arcs = same.filter(j => ents[j].t === 'arc').map(j => [m360(ents[j].a0), arcSweep(ents[j])]);
      const cuts = [];
      for (const [a0, sw] of arcs) for (const v of [a0, m360(a0 + sw)]) if (!cuts.some(c => Math.abs(c - v) <= eps || Math.abs(Math.abs(c - v) - 360) <= eps)) cuts.push(v);
      if (!cuts.length) { out.push(Object.assign({}, e, { t: 'circle' })); return; }
      cuts.sort((p, q) => p - q);
      const covered = v => whole || arcs.some(([a0, sw]) => m360(v - a0) <= sw);
      let k = 0;
      cuts.forEach((c0, i) => { const c1 = i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + 360; if (c1 - c0 > eps && covered(m360((c0 + c1) / 2))) { out.push({ id: k ? e.id + '~' + k : e.id, t: 'arc', c: e.c, r: e.r, a0: c0, a1: c1 }); k++; } });
      return;
    }
    if (e.t !== 'line') { done.add(i); out.push(e); return; }
    const d = [e.b[0] - e.a[0], e.b[1] - e.a[1]], L = Math.hypot(d[0], d[1]);
    if (L < 1e-12) { done.add(i); return; }
    const u = [d[0] / L, d[1] / L], along = p => (p[0] - e.a[0]) * u[0] + (p[1] - e.a[1]) * u[1], off = p => Math.abs((p[0] - e.a[0]) * u[1] - (p[1] - e.a[1]) * u[0]);
    const same = ents.map((o, j) => j).filter(j => !done.has(j) && ents[j].t === 'line' && off(ents[j].a) <= tol && off(ents[j].b) <= tol);
    for (const j of same) done.add(j);
    const spans = same.map(j => [along(ents[j].a), along(ents[j].b)].sort((p, q) => p - q)).sort((p, q) => p[0] - q[0]), U = [];
    for (const sp of spans) { const M = U[U.length - 1]; if (M && sp[0] < M[1] - tol) M[1] = Math.max(M[1], sp[1]); else U.push(sp.slice()); }
    U.forEach((sp, k) => out.push(spans.length === 1 ? e : { id: k ? e.id + '~' + k : e.id, t: 'line', a: [e.a[0] + u[0] * sp[0], e.a[1] + u[1] * sp[0]], b: [e.a[0] + u[0] * sp[1], e.a[1] + u[1] * sp[1]] }));
  });
  return out;
}
/* the regions a feature can use: the plane cut by every shape that is not construction (slivers left out: the thin
   scraps between two curves that all but coincide, or between the straight steps two arcs on one circle are drawn in) */
/* a circle's or an arc's outline for finding regions: its steps, and a corner besides wherever another shape crosses
   it or only just touches it. Where a line or a circle touches it (or misses, or overlaps, by a hair) the corner is
   put on the line, or midway between the two circles, so both outlines pass through the one point and the regions
   either side of the touch are two regions, as they are in truth, not one joined through a gap too thin to see. */
function roundOutline(e, all, tol) {
  const circ = e.t === 'circle', sw = circ ? 360 : arcSweep(e), a0 = circ ? 0 : e.a0, m360 = v => ((v % 360) + 360) % 360;
  const at = [];                                          // [degrees round from a0, the point (null: on the circle)]
  const add = (p, q) => { const d = m360(Math.atan2(p[1] - e.c[1], p[0] - e.c[0]) * 180 / Math.PI - a0); if (d <= sw + 1e-9) at.push([Math.min(d, sw), q || null]); };
  for (const o of all) {
    if (o === e || o.t === 'point') continue;
    if (o.t === 'line') {
      const d = lineDir(o), L2 = d[0] * d[0] + d[1] * d[1] || 1e-12, t = ((e.c[0] - o.a[0]) * d[0] + (e.c[1] - o.a[1]) * d[1]) / L2, F = [o.a[0] + d[0] * t, o.a[1] + d[1] * t], dist = Math.hypot(F[0] - e.c[0], F[1] - e.c[1]);
      if (t > -1e-9 && t < 1 + 1e-9 && Math.abs(dist - e.r) <= tol && dist > tol) { add(F, F); continue; }
    } else if (o.c) {
      const dx = o.c[0] - e.c[0], dy = o.c[1] - e.c[1], D = Math.hypot(dx, dy);
      if (D > tol && (Math.abs(D - (e.r + o.r)) <= tol || Math.abs(D - Math.abs(e.r - o.r)) <= tol)) {
        // touching: outside each other, or one inside the other; the point between the two circles' own points
        const u = [dx / D, dy / D], inside = D < Math.max(e.r, o.r), sE = !inside || e.r > o.r ? 1 : -1, sO = !inside ? -1 : o.r > e.r ? 1 : -1;
        const pE = [e.c[0] + u[0] * e.r * sE, e.c[1] + u[1] * e.r * sE], pO = [o.c[0] + u[0] * o.r * sO, o.c[1] + u[1] * o.r * sO], M = [(pE[0] + pO[0]) / 2, (pE[1] + pO[1]) / 2];
        if (distToEnt(o, pO) < 1e-6) { add(M, M); continue; }
      }
    }
    for (const p of entCross(e, o)) add(p);
  }
  const n = Math.max(circ ? 24 : 2, Math.ceil(sw / 3));
  for (let i = 0; i <= n; i++) if (!circ || i < n) at.push([sw * i / n, i === 0 && e.w0 ? e.w0.slice() : i === n && e.w1 ? e.w1.slice() : null]);
  at.sort((p, q) => p[0] - q[0] || (p[1] ? -1 : 1));
  const out = [];
  for (const [d, q] of at) {
    const prev = out[out.length - 1], an = (a0 + d) * Math.PI / 180, p = q || [e.c[0] + e.r * Math.cos(an), e.c[1] + e.r * Math.sin(an)];
    // a step that all but repeats the corner before it gives way to that corner
    if (prev && Math.abs(d - prev.d) < 1e-6) { if (q && !prev.q) { p.d = d; p.q = true; out[out.length - 1] = p; } continue; }
    p.d = d; p.q = !!q; out.push(p);
  }
  if (circ && out.length > 1 && Math.abs(out[out.length - 1].d - 360) < 1e-6) out.pop();
  return out;
}
export function regionsOf(ents) {
  const W = weldEnts(ents.filter(e => !e.k && e.t !== 'point'));
  return sketchRegions(W, e => (e.t === 'circle' || e.t === 'arc' ? roundOutline(e, W, WELD) : entOutline(e, 3))).filter(r => { const A = Math.abs(r.area); if (A < 1e-3) return false; let P = 0; for (let i = 0; i < r.outer.length; i++) { const p = r.outer[i], q = r.outer[(i + 1) % r.outer.length]; P += Math.hypot(q[0] - p[0], q[1] - p[1]); } return !(A < 0.2 && A / (P * P || 1) < 0.002); });
}
/* the regions an extrude takes by default: those not inside another (a ring's hole stays a hole), by their points */
export function defaultRegionPts(ents, fill) {
  const R = regionsOf(ents), out = R.filter(r => R.filter(o => o !== r && inside(o.outer, r.pt)).length % 2 === 0);
  // fill (a cut): the holes of the model brought into the sketch are taken too, where they lie in what is taken. Left
  // out of a cut, a hole's region leaves a thin tube standing wherever the hole below is any narrower than its rim.
  if (fill) for (const r of R) if (!out.includes(r) && r.outer.src && r.outer.src.every(e => e.ref) && out.some(o => inside(o.outer, r.pt))) out.push(r);
  return out.map(r => r.pt.map(v => +v.toFixed(6)));
}
/* a point of a sketch as it was, carried to the sketch as it is now: it keeps its place beside the shape it was
   nearest to (along a line and off it; round a circle and out from its centre), so a region's point follows the
   region when its shapes move */
export function carryPt(was, now, q) {
  let best = null, bd = Infinity;
  for (const e of was) { if (e.t === 'point' || e.k || isCurve(e)) continue; const d = distToEnt(e, q); if (d < bd) { bd = d; best = e; } }
  const n = best && now.find(x => x.id === best.id && x.t === best.t);
  if (!n) return q;
  if (best.t === 'line') {
    const d = lineDir(best), L = Math.hypot(d[0], d[1]) || 1e-12, u = ((q[0] - best.a[0]) * d[0] + (q[1] - best.a[1]) * d[1]) / (L * L), v = ((q[0] - best.a[0]) * -d[1] + (q[1] - best.a[1]) * d[0]) / L;
    const d2 = lineDir(n), L2 = Math.hypot(d2[0], d2[1]) || 1e-12;
    return [n.a[0] + d2[0] * u - d2[1] / L2 * v, n.a[1] + d2[1] * u + d2[0] / L2 * v];
  }
  const a = Math.atan2(q[1] - best.c[1], q[0] - best.c[0]), rho = Math.hypot(q[0] - best.c[0], q[1] - best.c[1]) / (best.r || 1e-12);
  return [n.c[0] + rho * n.r * Math.cos(a), n.c[1] + rho * n.r * Math.sin(a)];
}
/* every feature's chosen regions of a sketch that changed, carried to it as it is now (where the carried point is
   in a region; else left as they were) */
export function carryRegions(doc, id, was, now) {
  const R = regionsOf(now), carry = pts => (pts || []).map(q => { const c = carryPt(was, now, q); return regionAt(R, c) ? c.map(v => +v.toFixed(6)) : q; });
  for (const f of doc.features) {
    if (f.sketch === id && Array.isArray(f.regions)) f.regions = carry(f.regions);
    for (const s of f.sections || []) if (s.sketch === id) s.regions = carry(s.regions);
  }
}
/* the region a point is in (the smallest that holds it) */
export function regionAt(R, q) {
  let best = null;
  for (const r of R) if (inRegion(r, q) && (!best || Math.abs(r.area) < Math.abs(best.area))) best = r;
  return best;
}
const onArcAt = (e, p) => e.t !== 'arc' || ((Math.atan2(p[1] - e.c[1], p[0] - e.c[0]) / DEG - e.a0) % 360 + 360) % 360 <= arcSweep(e) + 1e-6;
const endOf = (e, k) => hpt(new Map([[e.id, e]]), { e: e.id, k });
/* how far a point is from a shape (for picking and inference) */
export function distToEnt(e, q) {
  if (e.t === 'point') return Math.hypot(q[0] - e.c[0], q[1] - e.c[1]);
  if (isCurve(e)) { const P = curvePts(e, 3), n = P.length, last = curveClosed(e) ? n : n - 1; let bd = Infinity; for (let i = 0; i < last; i++) { const a = P[i], b = P[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-12, t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)); bd = Math.min(bd, Math.hypot(a[0] + dx * t - q[0], a[1] + dy * t - q[1])); } return bd; }
  if (e.t === 'line') { const d = lineDir(e), L2 = d[0] * d[0] + d[1] * d[1] || 1e-12, t = Math.max(0, Math.min(1, ((q[0] - e.a[0]) * d[0] + (q[1] - e.a[1]) * d[1]) / L2)); return Math.hypot(e.a[0] + d[0] * t - q[0], e.a[1] + d[1] * t - q[1]); }
  const rr = Math.hypot(q[0] - e.c[0], q[1] - e.c[1]);
  if (e.t === 'circle' || onArcAt(e, q)) return Math.abs(rr - e.r);
  return Math.min(...['p0', 'p1'].map(k => { const p = endOf(e, k); return Math.hypot(p[0] - q[0], p[1] - q[1]); }));
}
/* where two shapes cross: points */
export function entCross(e1, e2) {
  const out = [];
  if (e1.t === 'point' || e2.t === 'point') return out;
  // an ellipse or a spline: where the short steps it is drawn in cross the other shape's
  if (isCurve(e1) || isCurve(e2)) {
    const segs = e => { const P = isCurve(e) ? curvePts(e, 2) : entOutline(e, 2), n = P.length, cl = isCurve(e) ? curveClosed(e) : e.t === 'circle', S = []; for (let i = 0; i < (cl ? n : n - 1); i++) S.push([P[i], P[(i + 1) % n]]); return S; };
    for (const [p, p2] of segs(e1)) for (const [q, q2] of segs(e2)) {
      const r = [p2[0] - p[0], p2[1] - p[1]], s2 = [q2[0] - q[0], q2[1] - q[1]], den = r[0] * s2[1] - r[1] * s2[0];
      if (Math.abs(den) < 1e-14) continue;
      const t = ((q[0] - p[0]) * s2[1] - (q[1] - p[1]) * s2[0]) / den, u = ((q[0] - p[0]) * r[1] - (q[1] - p[1]) * r[0]) / den;
      if (t >= 0 && t < 1 && u >= 0 && u < 1) out.push([p[0] + r[0] * t, p[1] + r[1] * t]);
    }
    return out;
  }
  if (e1.t === 'line' && e2.t === 'line') {
    const r = lineDir(e1), s = lineDir(e2), den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) return out;
    const t = ((e2.a[0] - e1.a[0]) * s[1] - (e2.a[1] - e1.a[1]) * s[0]) / den, u = ((e2.a[0] - e1.a[0]) * r[1] - (e2.a[1] - e1.a[1]) * r[0]) / den;
    if (t > -1e-9 && t < 1 + 1e-9 && u > -1e-9 && u < 1 + 1e-9) out.push([e1.a[0] + r[0] * t, e1.a[1] + r[1] * t]);
    return out;
  }
  if (e1.t === 'line' || e2.t === 'line') {
    const L = e1.t === 'line' ? e1 : e2, C = L === e1 ? e2 : e1, d = lineDir(L);
    const fx = L.a[0] - C.c[0], fy = L.a[1] - C.c[1], A = d[0] * d[0] + d[1] * d[1], B = 2 * (fx * d[0] + fy * d[1]), Cc = fx * fx + fy * fy - C.r * C.r, disc = B * B - 4 * A * Cc;
    if (disc < 0 || A < 1e-18) return out;
    for (const t of [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)]) { const p = [L.a[0] + d[0] * t, L.a[1] + d[1] * t]; if (t > -1e-9 && t < 1 + 1e-9 && onArcAt(C, p)) out.push(p); }
    return out;
  }
  const dx = e2.c[0] - e1.c[0], dy = e2.c[1] - e1.c[1], D = Math.hypot(dx, dy);
  if (D < 1e-12 || D > e1.r + e2.r + 1e-9 || D < Math.abs(e1.r - e2.r) - 1e-9) return out;
  const a = (e1.r * e1.r - e2.r * e2.r + D * D) / (2 * D), hh = Math.sqrt(Math.max(0, e1.r * e1.r - a * a));
  const mx = e1.c[0] + dx * a / D, my = e1.c[1] + dy * a / D;
  for (const s of hh < 1e-12 ? [0] : [-1, 1]) { const p = [mx - s * hh * dy / D, my + s * hh * dx / D]; if (onArcAt(e1, p) && onArcAt(e2, p)) out.push(p); }
  return out;
}
/* ---------- trim: the piece of a shape between its nearest crossings either side of q, taken away ----------
   sk ({ ents, cons, dims }) is changed: refs to the trimmed shape's far end move to the piece that keeps it, and
   refs that no longer mean anything go. Returns false when there is nothing to trim. */
export function trimEnt(sk, id, q) {
  const e = sk.ents.find(x => x.id === id);
  if (!e || e.t === 'point') return false;
  const cuts = [];
  for (const o of sk.ents) if (o !== e) for (const p of entCross(e, o)) cuts.push(p);
  const ents = sk.ents.filter(x => x !== e);
  const keepRefs = (ok, move) => {
    for (const list of [sk.cons, sk.dims]) for (const c of list) c.r = c.r.map(move);
    sk.cons = sk.cons.filter(c => c.r.every(ok)); sk.dims = sk.dims.filter(d => d.r.every(ok));
  };
  if (e.t === 'line') {
    const d = lineDir(e), L2 = d[0] * d[0] + d[1] * d[1] || 1e-12, tOf = p => ((p[0] - e.a[0]) * d[0] + (p[1] - e.a[1]) * d[1]) / L2;
    const ts = cuts.map(tOf).filter(t => t > 1e-7 && t < 1 - 1e-7), tq = tOf(q);
    const lo = Math.max(0, ...ts.filter(t => t < tq)), hi = Math.min(1, ...ts.filter(t => t > tq));
    const P = t => [e.a[0] + d[0] * t, e.a[1] + d[1] * t], keepA = lo > 1e-7, keepB = hi < 1 - 1e-7;
    let bId = null;
    if (keepA) ents.push(Object.assign({}, e, { a: e.a.slice(), b: P(lo) }));
    if (keepB) { bId = keepA ? sketchId('l') : e.id; ents.push(Object.assign({}, e, { id: bId, a: P(hi), b: e.b.slice() })); }
    sk.ents = ents;
    const whole = r => r.k === undefined || r.k === 'm';
    keepRefs(r => r.e !== e.id || (r.k === 'a' ? keepA : r.k === 'b' ? keepB || bId === e.id : whole(r) && keepA !== keepB),
      r => (r.e === e.id && r.k === 'b' && bId && bId !== e.id ? { e: bId, k: 'b' } : r));
    sk.dims = sk.dims.filter(dd => dd.t !== 'len' || (dd.r[0].e !== e.id && dd.r[0].e !== bId));
    return true;
  }
  const circ = e.t === 'circle', a0 = circ ? Math.atan2(q[1] - e.c[1], q[0] - e.c[0]) / DEG : e.a0, sw = circ ? 360 : arcSweep(e);
  const angOf = p => ((Math.atan2(p[1] - e.c[1], p[0] - e.c[0]) / DEG - a0) % 360 + 360) % 360;
  const as = cuts.map(angOf).filter(a => a > 1e-6 && a < sw - 1e-6).sort((x, y) => x - y);
  if (circ) {
    sk.ents = ents;
    // a circle crossed twice or more becomes the arc from the first crossing after q round to the last before it
    if (as.length >= 2) sk.ents.push(Object.assign({ id: e.id, t: 'arc', c: e.c.slice(), r: e.r, a0: a0 + as[0], a1: a0 + as[as.length - 1] }, e.k ? { k: true } : {}));
    keepRefs(r => r.e !== e.id || (as.length >= 2 && (r.k === 'c' || r.k === undefined)), r => r);
    return true;
  }
  const aq = angOf(q), lo = Math.max(0, ...as.filter(a => a < aq)), hi = Math.min(sw, ...as.filter(a => a > aq));
  const keep0 = lo > 1e-6, keep1 = hi < sw - 1e-6;
  let id1 = null;
  if (keep0) ents.push(Object.assign({}, e, { c: e.c.slice(), a0: e.a0, a1: e.a0 + lo }));
  if (keep1) { id1 = keep0 ? sketchId('a') : e.id; ents.push(Object.assign({}, e, { id: id1, c: e.c.slice(), a0: e.a0 + hi, a1: e.a0 + sw })); }
  sk.ents = ents;
  keepRefs(r => r.e !== e.id || r.k === 'c' || (r.k === 'p0' ? keep0 : r.k === 'p1' ? keep1 || id1 === e.id : keep0 || keep1),
    r => (r.e === e.id && r.k === 'p1' && id1 && id1 !== e.id ? { e: id1, k: 'p1' } : r));
  return true;
}
/* ---------- fillet: two lines meeting at q rounded with an arc of radius r, tangent to both ---------- */
export function filletCorner(sk, q, r, tol) {
  tol = tol || 1e-6;
  const E = new Map(sk.ents.map(e => [e.id, e])), near = [];
  for (const e of sk.ents) if (e.t === 'line' && !e.k) for (const k of ['a', 'b']) { const p = e[k]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol) near.push({ e, k }); }
  if (near.length !== 2) return null;
  const [A, B] = near, P = A.e[A.k].slice(), oa = A.e[A.k === 'a' ? 'b' : 'a'], ob = B.e[B.k === 'a' ? 'b' : 'a'];
  const u = [oa[0] - P[0], oa[1] - P[1]], w = [ob[0] - P[0], ob[1] - P[1]], lu = Math.hypot(...u), lw = Math.hypot(...w);
  if (lu < 1e-9 || lw < 1e-9) return null;
  const uu = [u[0] / lu, u[1] / lu], ww = [w[0] / lw, w[1] / lw], th = Math.acos(Math.max(-1, Math.min(1, uu[0] * ww[0] + uu[1] * ww[1])));
  if (th < 1e-3 || th > Math.PI - 1e-3) return null;
  const d = r / Math.tan(th / 2);
  if (d >= lu - 1e-9 || d >= lw - 1e-9) return null;
  const ta = [P[0] + uu[0] * d, P[1] + uu[1] * d], tb = [P[0] + ww[0] * d, P[1] + ww[1] * d];
  const bis = [uu[0] + ww[0], uu[1] + ww[1]], lb = Math.hypot(...bis), cd = r / Math.sin(th / 2), C = [P[0] + bis[0] / lb * cd, P[1] + bis[1] / lb * cd];
  let a0 = Math.atan2(ta[1] - C[1], ta[0] - C[0]) / DEG, a1 = Math.atan2(tb[1] - C[1], tb[0] - C[0]) / DEG, first = A, second = B;
  if (((a1 - a0) % 360 + 360) % 360 > 180) { [a0, a1] = [a1, a0]; [first, second] = [B, A]; }
  A.e[A.k] = ta; B.e[B.k] = tb;
  const arc = { id: sketchId('a'), t: 'arc', c: C, r, a0, a1 };
  sk.ents.push(arc);
  // the corner's coincident and anything else on that point go; the arc's ends meet the lines, tangent there, its radius dimensioned
  const atCorner = x => (x.e === A.e.id && x.k === A.k) || (x.e === B.e.id && x.k === B.k);
  // what else held or measured the corner (a polygon's circle, a dimension to it) holds a construction point left
  // where the corner was, on both lines; the lines are shorter now, so "equal" and their lengths no longer apply
  const other = x => x.r.some(atCorner) && !(x.t === 'coincident' && x.r.every(atCorner));
  if (sk.cons.some(other) || sk.dims.some(other)) {
    const V = { id: sketchId('p'), t: 'point', c: P.slice(), k: true }, to = x => (atCorner(x) ? { e: V.id, k: 'c' } : x);
    sk.ents.push(V);
    sk.cons = sk.cons.filter(c => !(c.t === 'coincident' && c.r.every(atCorner))).map(c => (c.r.some(atCorner) ? Object.assign({}, c, { r: c.r.map(to) }) : c));
    sk.dims = sk.dims.map(dd => (dd.r.some(atCorner) ? Object.assign({}, dd, { r: dd.r.map(to) }) : dd));
    sk.cons.push({ id: sketchId('c'), t: 'oncurve', r: [{ e: V.id, k: 'c' }, { e: A.e.id }] }, { id: sketchId('c'), t: 'oncurve', r: [{ e: V.id, k: 'c' }, { e: B.e.id }] });
  } else sk.cons = sk.cons.filter(c => !c.r.some(atCorner));
  const whole = x => x.r.some(y => !y.k && (y.e === A.e.id || y.e === B.e.id));
  sk.cons = sk.cons.filter(c => !(c.t === 'equal' && whole(c)));
  sk.dims = sk.dims.filter(dd => !(dd.t === 'len' && whole(dd)));
  sk.cons.push({ id: sketchId('c'), t: 'coincident', r: [{ e: arc.id, k: 'p0' }, { e: first.e.id, k: first.k }] }, { id: sketchId('c'), t: 'coincident', r: [{ e: arc.id, k: 'p1' }, { e: second.e.id, k: second.k }] },
    { id: sketchId('c'), t: 'tangent', r: [{ e: first.e.id }, { e: arc.id }], at: 'p0' }, { id: sketchId('c'), t: 'tangent', r: [{ e: second.e.id }, { e: arc.id }], at: 'p1' });
  sk.dims.push({ id: sketchId('d'), t: 'rad', r: [{ e: arc.id }], v: r, x: String(+r.toFixed(6)) });
  void E;
  return arc;
}
/* ---------- offset: copies of shapes a distance d to one side (lines' copies joined where their shapes met) ---------- */
export function offsetEnts(sk, ids, d) {
  ids = ids.filter(id => { const e = sk.ents.find(x => x.id === id); return e && !isCurve(e); });      // (an ellipse or a spline is not offset)
  const src = sk.ents.filter(e => ids.includes(e.id) && e.t !== 'point'), made = new Map();
  for (const e of src) {
    if (e.t === 'line') { const v = lineDir(e), L = Math.hypot(...v) || 1, n = [-v[1] / L * d, v[0] / L * d]; made.set(e.id, { id: sketchId('l'), t: 'line', a: [e.a[0] + n[0], e.a[1] + n[1]], b: [e.b[0] + n[0], e.b[1] + n[1]] }); }
    else { const r = e.r + d; if (r > 1e-6) made.set(e.id, Object.assign({}, e, { id: sketchId(e.t[0]), c: e.c.slice(), r })); }
  }
  // two lines whose originals shared an end: both copies run to where they cross
  const lines = src.filter(e => e.t === 'line' && made.has(e.id));
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) for (const ka of ['a', 'b']) for (const kb of ['a', 'b']) {
    const p = lines[i][ka], p2 = lines[j][kb];
    if (Math.hypot(p[0] - p2[0], p[1] - p2[1]) > 1e-6) continue;
    const m1 = made.get(lines[i].id), m2 = made.get(lines[j].id), r1 = lineDir(m1), r2 = lineDir(m2), den = r1[0] * r2[1] - r1[1] * r2[0];
    if (Math.abs(den) < 1e-12) continue;
    const t = ((m2.a[0] - m1.a[0]) * r2[1] - (m2.a[1] - m1.a[1]) * r2[0]) / den, X = [m1.a[0] + r1[0] * t, m1.a[1] + r1[1] * t];
    m1[ka] = X.slice(); m2[kb] = X.slice();
    sk.cons.push({ id: sketchId('c'), t: 'coincident', r: [{ e: m1.id, k: ka }, { e: m2.id, k: kb }] });
  }
  for (const [from, m] of made) { sk.ents.push(m); const o = src.find(e => e.id === from); sk.cons.push({ id: sketchId('c'), t: o.t === 'line' ? 'parallel' : 'concentric', r: [{ e: from }, { e: m.id }] }); }
  return [...made.values()];
}
/* ---------- mirror: copies of shapes reflected in a line, each point held symmetric to its original ---------- */
export function mirrorEnts(sk, ids, lineId) {
  const L = sk.ents.find(e => e.id === lineId);
  if (!L || L.t !== 'line') return [];
  const d = lineDir(L), n2 = d[0] * d[0] + d[1] * d[1] || 1e-12, la = Math.atan2(d[1], d[0]) / DEG;
  const ref = p => { const t = ((p[0] - L.a[0]) * d[0] + (p[1] - L.a[1]) * d[1]) / n2, f = [L.a[0] + d[0] * t, L.a[1] + d[1] * t]; return [2 * f[0] - p[0], 2 * f[1] - p[1]]; };
  const out = [];
  for (const e of sk.ents.filter(x => ids.includes(x.id) && x.id !== lineId)) {
    let m;
    if (e.t === 'line') m = { id: sketchId('l'), t: 'line', a: ref(e.a), b: ref(e.b) };
    else if (e.t === 'point') m = { id: sketchId('p'), t: 'point', c: ref(e.c) };
    else if (e.t === 'circle') m = { id: sketchId('c'), t: 'circle', c: ref(e.c), r: e.r };
    else if (e.t === 'ellipse') m = { id: sketchId('e'), t: 'ellipse', c: ref(e.c), rx: e.rx, ry: e.ry, rot: 2 * la - e.rot };
    else if (e.t === 'spline') m = Object.assign({ id: sketchId('s'), t: 'spline', pts: e.pts.map(ref) }, e.cv ? { cv: true } : {}, e.closed ? { closed: true } : {});
    else m = { id: sketchId('a'), t: 'arc', c: ref(e.c), r: e.r, a0: 2 * la - e.a1, a1: 2 * la - e.a0 };
    if (e.k) m.k = true;
    out.push(m);
    const pairs = e.t === 'line' ? [['a', 'a'], ['b', 'b']] : e.t === 'arc' ? [['c', 'c'], ['p0', 'p1'], ['p1', 'p0']] : e.t === 'spline' ? e.pts.map((q, i) => ['q' + i, 'q' + i]) : [['c', 'c']];
    for (const [k1, k2] of pairs) sk.cons.push({ id: sketchId('c'), t: 'symmetric', r: [{ e: e.id, k: k1 }, { e: m.id, k: k2 }, { e: lineId }] });
    if (e.t === 'circle') sk.cons.push({ id: sketchId('c'), t: 'equal', r: [{ e: e.id }, { e: m.id }] });
  }
  sk.ents.push(...out);
  return out;
}
/* ---------- shapes made by the drawing tools: each a few lines and arcs, with the constraints that keep them so ---------- */
const con = (t, ...r) => ({ id: sketchId('c'), t, r });
/* a corner rectangle from p to q (or about a centre p to the corner q): four lines, joined, two horizontal and two vertical */
export function rectEnts(p, q, centred) {
  const a = centred ? [2 * p[0] - q[0], 2 * p[1] - q[1]] : p;
  const P = [[a[0], a[1]], [q[0], a[1]], [q[0], q[1]], [a[0], q[1]]];
  const L = [0, 1, 2, 3].map(i => ({ id: sketchId('l'), t: 'line', a: P[i].slice(), b: P[(i + 1) % 4].slice() }));
  const cons = [0, 1, 2, 3].map(i => con('coincident', { e: L[i].id, k: 'b' }, { e: L[(i + 1) % 4].id, k: 'a' }));
  cons.push(con('horizontal', { e: L[0].id }), con('horizontal', { e: L[2].id }), con('vertical', { e: L[1].id }), con('vertical', { e: L[3].id }));
  const ents = L.slice();
  if (centred) {
    // a construction diagonal, its middle on the centre
    const dg = { id: sketchId('l'), t: 'line', a: P[0].slice(), b: P[2].slice(), k: true };
    ents.push(dg);
    cons.push(con('coincident', { e: dg.id, k: 'a' }, { e: L[0].id, k: 'a' }), con('coincident', { e: dg.id, k: 'b' }, { e: L[2].id, k: 'a' }));
    const cp = { id: sketchId('p'), t: 'point', c: p.slice(), k: true };
    ents.push(cp); cons.push(con('midpoint', { e: cp.id }, { e: dg.id }));
  }
  return { ents, cons };
}
/* a slot: two parallel lines and two half-circle ends, from the centre of one end p to the other q, half-width r */
export function slotEnts(p, q, r) {
  const d = [q[0] - p[0], q[1] - p[1]], L = Math.hypot(...d) || 1, n = [-d[1] / L * r, d[0] / L * r], ang = Math.atan2(d[1], d[0]) / DEG;
  const l1 = { id: sketchId('l'), t: 'line', a: [p[0] - n[0], p[1] - n[1]], b: [q[0] - n[0], q[1] - n[1]] };
  const l2 = { id: sketchId('l'), t: 'line', a: [q[0] + n[0], q[1] + n[1]], b: [p[0] + n[0], p[1] + n[1]] };
  const a1 = { id: sketchId('a'), t: 'arc', c: q.slice(), r, a0: ang - 90, a1: ang + 90 };
  const a2 = { id: sketchId('a'), t: 'arc', c: p.slice(), r, a0: ang + 90, a1: ang + 270 };
  const ax = { id: sketchId('l'), t: 'line', a: p.slice(), b: q.slice(), k: true };
  const cons = [con('coincident', { e: l1.id, k: 'b' }, { e: a1.id, k: 'p0' }), con('coincident', { e: a1.id, k: 'p1' }, { e: l2.id, k: 'a' }),
    con('coincident', { e: l2.id, k: 'b' }, { e: a2.id, k: 'p0' }), con('coincident', { e: a2.id, k: 'p1' }, { e: l1.id, k: 'a' }),
    { id: sketchId('c'), t: 'tangent', r: [{ e: l1.id }, { e: a1.id }], at: 'p0' }, { id: sketchId('c'), t: 'tangent', r: [{ e: l2.id }, { e: a1.id }], at: 'p1' },
    { id: sketchId('c'), t: 'tangent', r: [{ e: l2.id }, { e: a2.id }], at: 'p0' }, { id: sketchId('c'), t: 'tangent', r: [{ e: l1.id }, { e: a2.id }], at: 'p1' },
    con('equal', { e: a1.id }, { e: a2.id }), con('coincident', { e: ax.id, k: 'a' }, { e: a2.id, k: 'c' }), con('coincident', { e: ax.id, k: 'b' }, { e: a1.id, k: 'c' })];
  return { ents: [l1, a1, l2, a2, ax], cons };
}
/* a regular polygon of n sides about centre c, its first corner at q: lines, equal and joined, round a construction circle */
export function polygonEnts(c, q, n, circum) {
  n = Math.max(3, Math.min(64, Math.round(n) || 6));
  // (circum: q is the middle of a side, so the circle through q is inside the polygon, touching every side)
  const R = (Math.hypot(q[0] - c[0], q[1] - c[1]) || 1) / (circum ? Math.cos(Math.PI / n) : 1), a0 = Math.atan2(q[1] - c[1], q[0] - c[0]) + (circum ? Math.PI / n : 0);
  const P = Array.from({ length: n }, (_, i) => [c[0] + R * Math.cos(a0 + 2 * Math.PI * i / n), c[1] + R * Math.sin(a0 + 2 * Math.PI * i / n)]);
  const L = P.map((p, i) => ({ id: sketchId('l'), t: 'line', a: p.slice(), b: P[(i + 1) % n].slice() }));
  const circ = { id: sketchId('c'), t: 'circle', c: c.slice(), r: R, k: true };
  const cons = L.map((l, i) => con('coincident', { e: l.id, k: 'b' }, { e: L[(i + 1) % n].id, k: 'a' }));
  for (const l of L) cons.push(con('oncurve', { e: l.id, k: 'a' }, { e: circ.id }));
  for (let i = 1; i < n; i++) cons.push(con('equal', { e: L[0].id }, { e: L[i].id }));
  return { ents: [...L, circ], cons };
}
/* an arc through three points (the ends p, q and a point m on it), or null if they are in a line */
export function arc3(p, q, m) {
  const ax = p[0], ay = p[1], bx = m[0], by = m[1], cx = q[0], cy = q[1], d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy), A = Math.atan2(ay - uy, ax - ux) / DEG, B = Math.atan2(cy - uy, cx - ux) / DEG, M = Math.atan2(by - uy, bx - ux) / DEG;
  const ccw = ((M - A) % 360 + 360) % 360 < ((B - A) % 360 + 360) % 360;
  return ccw ? { c: [ux, uy], r, a0: A, a1: B, rev: false } : { c: [ux, uy], r, a0: B, a1: A, rev: true };
}
/* an arc from p tangent to the direction t there, ending at q (the tangent arc after a line) */
export function tangentArc(p, t, q) {
  const tl = Math.hypot(...t) || 1, tt = [t[0] / tl, t[1] / tl], n = [-tt[1], tt[0]], v = [q[0] - p[0], q[1] - p[1]], vn = v[0] * n[0] + v[1] * n[1];
  if (Math.abs(vn) < 1e-9) return null;
  const r = (v[0] * v[0] + v[1] * v[1]) / (2 * vn), c = [p[0] + n[0] * r, p[1] + n[1] * r], A = Math.atan2(p[1] - c[1], p[0] - c[0]) / DEG, B = Math.atan2(q[1] - c[1], q[0] - c[0]) / DEG;
  return r > 0 ? { c, r, a0: A, a1: B, rev: false } : { c, r: -r, a0: B, a1: A, rev: true };
}

/* ---------- more shapes and changes: the rectangle on a slope, the arc about a centre, chamfer, extend, split,
   patterns, and moving, turning and sizing what is selected ---------- */
/* a rectangle by three points: p to q is one side, r says how far across it goes */
export function alignedRectEnts(p, q, r) {
  const d = [q[0] - p[0], q[1] - p[1]], L = Math.hypot(d[0], d[1]) || 1, n = [-d[1] / L, d[0] / L], w = (r[0] - p[0]) * n[0] + (r[1] - p[1]) * n[1];
  const P = [p, q, [q[0] + n[0] * w, q[1] + n[1] * w], [p[0] + n[0] * w, p[1] + n[1] * w]];
  const Ls = [0, 1, 2, 3].map(i => ({ id: sketchId('l'), t: 'line', a: P[i].slice(), b: P[(i + 1) % 4].slice() }));
  const cons = [0, 1, 2, 3].map(i => con('coincident', { e: Ls[i].id, k: 'b' }, { e: Ls[(i + 1) % 4].id, k: 'a' }));
  cons.push(con('perpendicular', { e: Ls[0].id }, { e: Ls[1].id }), con('parallel', { e: Ls[0].id }, { e: Ls[2].id }), con('parallel', { e: Ls[1].id }, { e: Ls[3].id }));
  return { ents: Ls, cons };
}
/* an arc about a centre c from p round to where q lies (anticlockwise, or clockwise with cw) */
export function centreArc(c, p, q, cw) {
  const r = Math.hypot(p[0] - c[0], p[1] - c[1]), ap = Math.atan2(p[1] - c[1], p[0] - c[0]) / DEG, aq = Math.atan2(q[1] - c[1], q[0] - c[0]) / DEG;
  if (r < 1e-9) return null;
  return cw ? { c: c.slice(), r, a0: aq, a1: ap, rev: true } : { c: c.slice(), r, a0: ap, a1: aq };
}
/* a corner of two lines cut off square: each line shortened by d, a line across */
export function chamferCorner(sk, q, d, tol) {
  tol = tol || 1e-6;
  const near = [];
  for (const e of sk.ents) if (e.t === 'line' && !e.k) for (const k of ['a', 'b']) { const p = e[k]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol) near.push({ e, k }); }
  if (near.length !== 2) return null;
  const [A, B] = near, P = A.e[A.k].slice(), oa = A.e[A.k === 'a' ? 'b' : 'a'], ob = B.e[B.k === 'a' ? 'b' : 'a'];
  const lu = Math.hypot(oa[0] - P[0], oa[1] - P[1]), lw = Math.hypot(ob[0] - P[0], ob[1] - P[1]);
  if (!(d > 0) || d >= lu - 1e-9 || d >= lw - 1e-9) return null;
  const ta = [P[0] + (oa[0] - P[0]) / lu * d, P[1] + (oa[1] - P[1]) / lu * d], tb = [P[0] + (ob[0] - P[0]) / lw * d, P[1] + (ob[1] - P[1]) / lw * d];
  A.e[A.k] = ta; B.e[B.k] = tb;
  const ln = { id: sketchId('l'), t: 'line', a: ta.slice(), b: tb.slice() };
  sk.ents.push(ln);
  const atCorner = x => (x.e === A.e.id && x.k === A.k) || (x.e === B.e.id && x.k === B.k), whole = x => x.r.some(y => !y.k && (y.e === A.e.id || y.e === B.e.id));
  sk.cons = sk.cons.filter(c => !c.r.some(atCorner) && !(c.t === 'equal' && whole(c)));
  sk.dims = sk.dims.filter(dd => !dd.r.some(atCorner) && !(dd.t === 'len' && whole(dd)));
  sk.cons.push(con('coincident', { e: ln.id, k: 'a' }, { e: A.e.id, k: A.k }), con('coincident', { e: ln.id, k: 'b' }, { e: B.e.id, k: B.k }));
  // each cut the same length along its line: the two corners d from where the corner was
  sk.dims.push({ id: sketchId('d'), t: 'len', r: [{ e: ln.id }], v: Math.hypot(tb[0] - ta[0], tb[1] - ta[1]), x: String(+Math.hypot(tb[0] - ta[0], tb[1] - ta[1]).toFixed(6)) });
  return ln;
}
/* a line's end nearest q carried on, the way the line goes, to the first shape it meets */
export function extendEnt(sk, id, q) {
  const e = sk.ents.find(x => x.id === id);
  if (!e || e.t !== 'line') return false;
  const k = Math.hypot(q[0] - e.a[0], q[1] - e.a[1]) < Math.hypot(q[0] - e.b[0], q[1] - e.b[1]) ? 'a' : 'b', from = e[k], other = e[k === 'a' ? 'b' : 'a'];
  const d = [from[0] - other[0], from[1] - other[1]], L = Math.hypot(d[0], d[1]) || 1, far = 1e5, ray = { t: 'line', a: from, b: [from[0] + d[0] / L * far, from[1] + d[1] / L * far] };
  let best = null, bd = Infinity;
  for (const o of sk.ents) { if (o === e || o.t === 'point') continue; for (const p of entCross(ray, o)) { const dist = Math.hypot(p[0] - from[0], p[1] - from[1]); if (dist > 1e-7 && dist < bd) { bd = dist; best = { p, o }; } } }
  if (!best) return false;
  e[k] = best.p.slice();
  sk.cons = sk.cons.filter(c => !(c.r.some(x => x.e === id && x.k === k) && (c.t === 'coincident' || c.t === 'oncurve' || c.t === 'midpoint' || c.t === 'fix')));
  sk.dims = sk.dims.filter(dd => !(dd.t === 'len' && dd.r[0].e === id));
  if (best.o.t === 'line' || best.o.t === 'circle' || best.o.t === 'arc') sk.cons.push(con('oncurve', { e: id, k }, { e: best.o.id }));
  return true;
}
/* a line or an arc cut in two at the point of it nearest q; the two halves stay joined (and in line, or on one circle) */
export function splitEnt(sk, id, q) {
  const e = sk.ents.find(x => x.id === id);
  if (!e) return false;
  if (e.t === 'line') {
    const d = lineDir(e), L2 = d[0] * d[0] + d[1] * d[1] || 1e-12, t = ((q[0] - e.a[0]) * d[0] + (q[1] - e.a[1]) * d[1]) / L2;
    if (t < 0.02 || t > 0.98) return false;
    const m = [e.a[0] + d[0] * t, e.a[1] + d[1] * t], n2 = Object.assign({ id: sketchId('l'), t: 'line', a: m.slice(), b: e.b.slice() }, e.k ? { k: true } : {});
    // what held the far end holds the new line's far end
    for (const x of sk.cons.concat(sk.dims)) x.r = x.r.map(r => (r.e === id && r.k === 'b' ? { e: n2.id, k: 'b' } : r));
    sk.dims = sk.dims.filter(dd => !(dd.t === 'len' && dd.r[0].e === id));
    e.b = m.slice();
    sk.ents.push(n2);
    sk.cons.push(con('coincident', { e: id, k: 'b' }, { e: n2.id, k: 'a' }), con('parallel', { e: id }, { e: n2.id }));
    return true;
  }
  if (e.t === 'arc') {
    const sw = arcSweep(e), at = (((Math.atan2(q[1] - e.c[1], q[0] - e.c[0]) / DEG - e.a0) % 360) + 360) % 360;
    if (at < sw * 0.02 || at > sw * 0.98) return false;
    const n2 = Object.assign({ id: sketchId('a'), t: 'arc', c: e.c.slice(), r: e.r, a0: e.a0 + at, a1: e.a0 + sw }, e.k ? { k: true } : {});
    for (const x of sk.cons.concat(sk.dims)) x.r = x.r.map(r => (r.e === id && r.k === 'p1' ? { e: n2.id, k: 'p1' } : r));
    e.a1 = e.a0 + at;
    sk.ents.push(n2);
    sk.cons.push(con('coincident', { e: id, k: 'p1' }, { e: n2.id, k: 'p0' }), con('concentric', { e: id }, { e: n2.id }), con('equal', { e: id }, { e: n2.id }));
    return true;
  }
  return false;
}
/* a shape moved by f (a point to a point), turned by rot degrees and sized by scale, as a new shape or in place */
function mapEnt(e, f, rot, scale, fresh) {
  const m = fresh ? Object.assign(JSON.parse(JSON.stringify(e)), { id: sketchId(e.t[0]) }) : e;
  delete m.ref; delete m.src;
  if (m.t === 'line') { m.a = f(e.a); m.b = f(e.b); }
  else if (m.t === 'spline') m.pts = e.pts.map(f);
  else { m.c = f(e.c); if (m.t === 'arc') { m.a0 = e.a0 + rot; m.a1 = e.a1 + rot; } if (m.t === 'ellipse') { m.rx = e.rx * scale; m.ry = e.ry * scale; m.rot = e.rot + rot; } else if (m.r !== undefined) m.r = e.r * scale; }
  return m;
}
/* copies in a row: count in all, each a step [dx, dy] on from the last; the constraints among the shapes copied with them */
function copyGroup(sk, ids, f, rot) {
  const map = new Map(), made = [];
  for (const e of sk.ents.filter(x => ids.includes(x.id))) { const m = mapEnt(e, f, rot, 1, true); map.set(e.id, m.id); made.push(m); }
  const inside = x => x.r.every(r => map.has(r.e));
  const cons = sk.cons.filter(c => c.t !== 'fix' && c.t !== 'horizontal' && c.t !== 'vertical' && inside(c)).map(c => Object.assign({}, c, { id: sketchId('c'), r: c.r.map(r => Object.assign({}, r, { e: map.get(r.e) })) }));
  const dims = sk.dims.filter(d => !d.dir && inside(d)).map(d => Object.assign({}, d, { id: sketchId('d'), r: d.r.map(r => Object.assign({}, r, { e: map.get(r.e) })) }));
  // (turned copies lose "horizontal" and "vertical"; copies moved straight keep them)
  if (!rot) cons.push(...sk.cons.filter(c => (c.t === 'horizontal' || c.t === 'vertical') && inside(c)).map(c => Object.assign({}, c, { id: sketchId('c'), r: c.r.map(r => Object.assign({}, r, { e: map.get(r.e) })) })));
  sk.ents.push(...made); sk.cons.push(...cons); sk.dims.push(...dims);
  return made;
}
export function linearPattern(sk, ids, step, count) {
  const out = [];
  for (let k = 1; k < Math.max(2, Math.min(200, Math.round(count))); k++) out.push(...copyGroup(sk, ids, p => [p[0] + step[0] * k, p[1] + step[1] * k], 0));
  return out;
}
export function circularPattern(sk, ids, about, count, total) {
  const n = Math.max(2, Math.min(200, Math.round(count))), full = Math.abs(Math.abs(total) - 360) < 1e-9, out = [];
  for (let k = 1; k < n; k++) {
    const deg2 = total * k / (full ? n : n - 1), a = deg2 * DEG, ca = Math.cos(a), sa = Math.sin(a);
    out.push(...copyGroup(sk, ids, p => [about[0] + (p[0] - about[0]) * ca - (p[1] - about[1]) * sa, about[1] + (p[0] - about[0]) * sa + (p[1] - about[1]) * ca], deg2));
  }
  return out;
}
/* what is selected moved by [dx, dy], turned rot degrees and sized by scale about a point: the shapes themselves
   changed, and what would hold them where they were (fixes, horizontals and verticals, dimensions of their sizes
   when sized) let go */
export function transformEnts(sk, ids, T) {
  const a = (T.rot || 0) * DEG, ca = Math.cos(a), sa = Math.sin(a), sc = T.scale || 1, o = T.about || [0, 0], dx = T.dx || 0, dy = T.dy || 0;
  const f = p => { const x = (p[0] - o[0]) * sc, y = (p[1] - o[1]) * sc; return [o[0] + x * ca - y * sa + dx, o[1] + x * sa + y * ca + dy]; };
  const set = new Set(ids);
  for (const e of sk.ents) if (set.has(e.id)) mapEnt(e, f, T.rot || 0, sc, false);
  const touches = x => x.r.some(r => set.has(r.e)), all = x => x.r.every(r => set.has(r.e) );
  sk.cons = sk.cons.filter(c => !(touches(c) && (c.t === 'fix' || (!all(c) && c.t !== 'equal') || ((T.rot || 0) && (c.t === 'horizontal' || c.t === 'vertical')))));
  sk.dims = sk.dims.filter(d => !(touches(d) && (!all(d) || sc !== 1 || ((T.rot || 0) && d.dir))));
  return true;
}
/* ---------- a DXF drawing's lines, circles, arcs and polylines as sketch shapes (millimetres as written) ---------- */
export function dxfEnts(text) {
  const L = String(text).split(/\r?\n/), out = [], pairs = [];
  for (let i = 0; i + 1 < L.length; i += 2) pairs.push([parseInt(L[i], 10), L[i + 1].trim()]);
  let i = pairs.findIndex((p, k) => p[0] === 2 && p[1] === 'ENTITIES' && k > 0 && pairs[k - 1][1] === 'SECTION');
  if (i < 0) i = 0;
  const num = v => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
  for (i++; i < pairs.length; i++) {
    if (pairs[i][0] !== 0) continue;
    const kind = pairs[i][1];
    if (kind === 'ENDSEC' || kind === 'EOF') break;
    const g = {}, vs = [];
    let j = i + 1;
    for (; j < pairs.length && pairs[j][0] !== 0; j++) { const [c, v] = pairs[j]; if (kind === 'LWPOLYLINE' && (c === 10 || c === 20 || c === 42)) { if (c === 10) vs.push({ x: num(v), y: 0, b: 0 }); else if (c === 20 && vs.length) vs[vs.length - 1].y = num(v); else if (vs.length) vs[vs.length - 1].b = num(v); } else if (!(c in g)) g[c] = v; }
    if (kind === 'LINE') out.push({ t: 'line', a: [num(g[10]), num(g[20])], b: [num(g[11]), num(g[21])] });
    else if (kind === 'CIRCLE') out.push({ t: 'circle', c: [num(g[10]), num(g[20])], r: num(g[40]) });
    else if (kind === 'ARC') out.push({ t: 'arc', c: [num(g[10]), num(g[20])], r: num(g[40]), a0: num(g[50]), a1: num(g[51]) });
    else if (kind === 'POINT') out.push({ t: 'point', c: [num(g[10]), num(g[20])] });
    else if (kind === 'ELLIPSE') { const mx = num(g[11]), my = num(g[21]), rx = Math.hypot(mx, my); if (rx > 0 && Math.abs(num(g[42]) - num(g[41]) - 2 * Math.PI) < 1e-6) out.push({ t: 'ellipse', c: [num(g[10]), num(g[20])], rx, ry: rx * num(g[40]), rot: Math.atan2(my, mx) / DEG }); }
    else if (kind === 'LWPOLYLINE') {
      const closed = (parseInt(g[70], 10) || 0) & 1, n = vs.length;
      for (let k = 0; k < (closed ? n : n - 1); k++) {
        const p = vs[k], q = vs[(k + 1) % n], a = [p.x, p.y], b = [q.x, q.y], ch = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (ch < 1e-9) continue;
        if (Math.abs(p.b) < 1e-9) { out.push({ t: 'line', a, b }); continue; }
        // a bulge: the tangent of a quarter of the arc's angle, anticlockwise when positive
        const th = 4 * Math.atan(p.b), r = ch / (2 * Math.sin(Math.abs(th) / 2)), h2 = r * Math.cos(th / 2) * Math.sign(p.b), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, c = [mx - (b[1] - a[1]) / ch * h2, my + (b[0] - a[0]) / ch * h2];
        const aa = Math.atan2(a[1] - c[1], a[0] - c[0]) / DEG, ab = Math.atan2(b[1] - c[1], b[0] - c[0]) / DEG;
        out.push(p.b > 0 ? { t: 'arc', c, r: Math.abs(r), a0: aa, a1: ab } : { t: 'arc', c, r: Math.abs(r), a0: ab, a1: aa });
      }
    }
    i = j - 1;
  }
  return out.filter(e => (e.r === undefined || e.r > 0)).map(e => Object.assign({ id: sketchId(e.t[0]) }, e));
}
