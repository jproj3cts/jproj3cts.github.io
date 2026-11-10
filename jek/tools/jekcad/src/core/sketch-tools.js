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
/* a shape's outline as points: arcs and circles in steps of at most `step` degrees */
export function entOutline(e, step) {
  step = step || 6;
  if (e.t === 'line') return [e.a, e.b];
  if (e.t === 'point') return [e.c];
  const circ = e.t === 'circle', sw = circ ? 360 : arcSweep(e), a0 = circ ? 0 : e.a0, n = Math.max(circ ? 24 : 2, Math.ceil(sw / step));
  const out = [];
  for (let i = 0; i <= (circ ? n - 1 : n); i++) { const a = (a0 + sw * i / n) * DEG; out.push([e.c[0] + e.r * Math.cos(a), e.c[1] + e.r * Math.sin(a)]); }
  return out;
}
/* the regions a feature can use: the plane cut by every shape that is not construction */
export const regionsOf = ents => sketchRegions(ents.filter(e => !e.k && e.t !== 'point'), e => entOutline(e, 3));
/* the regions an extrude takes by default: those not inside another (a ring's hole stays a hole), by their points */
export function defaultRegionPts(ents) {
  const R = regionsOf(ents);
  return R.filter(r => R.filter(o => o !== r && inside(o.outer, r.pt)).length % 2 === 0).map(r => r.pt.map(v => +v.toFixed(6)));
}
/* a point of a sketch as it was, carried to the sketch as it is now: it keeps its place beside the shape it was
   nearest to (along a line and off it; round a circle and out from its centre), so a region's point follows the
   region when its shapes move */
export function carryPt(was, now, q) {
  let best = null, bd = Infinity;
  for (const e of was) { if (e.t === 'point' || e.k) continue; const d = distToEnt(e, q); if (d < bd) { bd = d; best = e; } }
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
  if (e.t === 'line') { const d = lineDir(e), L2 = d[0] * d[0] + d[1] * d[1] || 1e-12, t = Math.max(0, Math.min(1, ((q[0] - e.a[0]) * d[0] + (q[1] - e.a[1]) * d[1]) / L2)); return Math.hypot(e.a[0] + d[0] * t - q[0], e.a[1] + d[1] * t - q[1]); }
  const rr = Math.hypot(q[0] - e.c[0], q[1] - e.c[1]);
  if (e.t === 'circle' || onArcAt(e, q)) return Math.abs(rr - e.r);
  return Math.min(...['p0', 'p1'].map(k => { const p = endOf(e, k); return Math.hypot(p[0] - q[0], p[1] - q[1]); }));
}
/* where two shapes cross: points */
export function entCross(e1, e2) {
  const out = [];
  if (e1.t === 'point' || e2.t === 'point') return out;
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
    else m = { id: sketchId('a'), t: 'arc', c: ref(e.c), r: e.r, a0: 2 * la - e.a1, a1: 2 * la - e.a0 };
    if (e.k) m.k = true;
    out.push(m);
    const pairs = e.t === 'line' ? [['a', 'a'], ['b', 'b']] : e.t === 'arc' ? [['c', 'c'], ['p0', 'p1'], ['p1', 'p0']] : [['c', 'c']];
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
export function polygonEnts(c, q, n) {
  n = Math.max(3, Math.min(64, Math.round(n) || 6));
  const R = Math.hypot(q[0] - c[0], q[1] - c[1]) || 1, a0 = Math.atan2(q[1] - c[1], q[0] - c[0]);
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
