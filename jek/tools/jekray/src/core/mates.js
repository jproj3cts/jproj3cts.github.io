import { clamp } from './constants.js';
import { deg, num, project, uid } from '../state/project.js';
import { NET_3D, getEl } from '../state/elements.js';
import { meshOf } from './stl.js';
import { cross3, dot3, unit3 } from './numeric.js';
import { setRoll, setTip, setZ, tippable, zOf } from '../engines/trace.js';

/* ---------- Parts turned and moved as solid bodies, and mates between them ----------
   A part's pose is where it stands (x, y and its height) and how it is turned: its Angle on the bench, then Tip and
   Roll out of it, as the trace and the 3D view turn it (a point of its own frame turned by its roll about its x, its tip
   about its y, then its angle about the vertical: Rz(angle) Ry(-tip) Rx(roll)). Here that is a matrix, so a set of parts
   can be turned together about any axis and each part's three angles found again.

   A mate holds two parts' bodies together: a face, a round face's axis or a straight edge of one (the first picked, which
   stays put) against one of the other's (moved, with its group and whatever is mated to it). Each face is kept in its
   part's own frame (mm), so it goes where the part goes: { k: 'plane' (a flat face: a point on it and its outward
   normal), 'axis' (a round face: a point on its axis, the axis, its radius r) or 'edge' (a straight edge: its middle and
   its direction), p, d }. The kinds:
     coincident  flat faces flush (normals opposed; flip: the same way), an axis or edge on a face, two axes in line;
     concentric  two axes (round faces, edges) in one line; flip turns the second end for end;
     parallel    faces (or axes) parallel, nothing moved along them;
     distance    faces facing each other this far apart (offset, mm), or an axis this far from a face or another axis;
     angle       the faces' normals (or the axes) at this angle (degrees).
   A mate kept on the bench is { id, type, a: { el, f }, b: { el, f }, flip, offset, angle }; mated parts move together,
   as a group does, until it is deleted. */

export const MATE_TYPES = { coincident: 'Coincident', concentric: 'Concentric', parallel: 'Parallel', distance: 'Distance', angle: 'Angle' };
export const MATE_KINDS = { plane: 'Flat face', axis: 'Round face (its axis)', edge: 'Straight edge' };

/* ---------- 3-vectors and 3×3 matrices (rows) ---------- */
const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], vMul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vLen = a => Math.hypot(a[0], a[1], a[2]);
// a's part square to the unit d
const vPerp = (a, d) => vSub(a, vMul(d, dot3(a, d)));
const mMul = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const mVec = (A, v) => A.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const mT = A => [0, 1, 2].map(i => [A[0][i], A[1][i], A[2][i]]);
const M_I = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
// a unit vector square to the unit u (as near the vertical's square as can be: a horizontal one where u is not upright)
const anyPerp = u => { const c = cross3(u, [0, 0, 1]); return vLen(c) > 1e-6 ? unit3(c) : unit3(cross3(u, [1, 0, 0])); };
/* turned by theta (radians) about the unit k (Rodrigues) */
export function axisRot(k, theta) {
  const c = Math.cos(theta), s = Math.sin(theta), C = 1 - c, [x, y, z] = k;
  return [[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]];
}
/* the smallest turn that takes the unit u to the unit v */
export function rotBetween(u, v) {
  const c = clamp(dot3(u, v), -1, 1), ax = cross3(u, v), s = vLen(ax);
  if (s < 1e-12) return c > 0 ? M_I() : axisRot(anyPerp(u), Math.PI);
  return axisRot(vMul(ax, 1 / s), Math.atan2(s, c));
}
// how far a turn turns (radians)
export const rotAngle = R => Math.acos(clamp((R[0][0] + R[1][1] + R[2][2] - 1) / 2, -1, 1));

/* ---------- a part's pose ---------- */
export const posOf = el => [el.x, el.y, NET_3D.has(el.type) ? 0 : zOf(el)];
export function poseRot(el) {
  const a = (el.angle || 0) * deg, t = (el.tip || 0) * deg, r = (el.roll || 0) * deg;
  const ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(t), st = Math.sin(t), cr = Math.cos(r), sr = Math.sin(r);
  return [[ca * ct, -ca * st * sr - sa * cr, -ca * st * cr + sa * sr], [sa * ct, -sa * st * sr + ca * cr, -sa * st * cr - ca * sr], [st, ct * sr, ct * cr]];
}
/* a turn as a part's angle, tip and roll (degrees); straight up or down, its roll put into its angle */
export function poseAngles(M) {
  const t = Math.asin(clamp(M[2][0], -1, 1));
  if (Math.cos(t) > 1e-9) return [Math.atan2(M[1][0], M[0][0]) / deg, t / deg, Math.atan2(M[2][1], M[2][2]) / deg];
  return [Math.atan2(-M[0][1], M[1][1]) / deg, t / deg, 0];
}
const angNorm = v => { const w = ((v % 360) + 540) % 360 - 180; return +(Math.abs(w + 180) < 1e-9 ? 180 : w).toFixed(9); };
export function setPoseRot(el, M) {
  const [a, t, r] = poseAngles(M);
  if (!tippable(el)) { el.angle = angNorm(a); return; }
  el.angle = angNorm(a); setTip(el, t); setRoll(el, r);
}
/* what a part is now, to come back to, or to move from */
export const poseSnap = el => ({ p: posOf(el), M: poseRot(el), raw: { x: el.x, y: el.y, z: el.z, angle: el.angle, tip: el.tip, roll: el.roll } });
export function poseRestore(el, s) {
  for (const k of ['x', 'y', 'z', 'angle', 'tip', 'roll']) { if (s.raw[k] === undefined) delete el[k]; else el[k] = s.raw[k]; }
}
/* the parts moved as one solid body from where they were (starts: poseSnap each): turned by R about pivot, then moved by t */
export function poseMove(els, starts, R, pivot, t) {
  els.forEach((el, i) => {
    const s = starts[i], p = vAdd(vAdd(pivot, mVec(R, vSub(s.p, pivot))), t || [0, 0, 0]);
    el.x = +p[0].toFixed(6); el.y = +p[1].toFixed(6);
    if (!NET_3D.has(el.type)) setZ(el, p[2]);
    setPoseRot(el, mMul(R, s.M));
  });
}
/* why a turn cannot be given to these parts ('' when it can): a network's parts and some others turn only on the table */
export function turnWhy(els, R) {
  const flat = Math.abs(R[2][2] - 1) < 1e-9 && Math.abs(R[0][2]) < 1e-9 && Math.abs(R[1][2]) < 1e-9;
  if (flat) return '';
  const no = els.find(e => !tippable(e) || NET_3D.has(e.type));
  return no ? no.name + ' turns only on the table, so it cannot be tipped or rolled' : '';
}
/* the others moved with a part that was moved and turned (from lead0: its poseSnap): as one body with it */
export function poseCarry(lead, lead0, others, starts) {
  if (!others.length) return;
  const R = mMul(poseRot(lead), mT(lead0.M));
  poseMove(others, starts, R, lead0.p, vSub(posOf(lead), lead0.p));
}
/* parts turned together by deg about an axis through pivot */
export function poseTurn(els, starts, axis, degs, pivot) { poseMove(els, starts, axisRot(unit3(axis), degs * deg), pivot, [0, 0, 0]); }
/* the middle of where the parts stand (of their box) */
export function poseMiddle(els) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const e of els) { const p = posOf(e); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } }
  return lo.map((v, k) => (v + hi[k]) / 2);
}

/* ---------- a part's faces, from its triangles ----------
   T: triangles in the part's own frame (mm, 9 numbers each). A face picked at triangle t0 (the point q on it) is
   the flat region it is in (its neighbours within 2° of it and in its plane), or, where its neighbours curve away
   smoothly about one axis (a hole, a shaft, a lens's rim), the round face they make, fitted as a cylinder: its axis
   square to their normals, its centre where their normals meet, kept only where each triangle fits it. A press close to
   a sharp edge (opts.edgeTol, mm) takes the straight edge, as long as it runs straight. */
const TOPO = new WeakMap();
function meshTopo(T) {
  let G = TOPO.get(T); if (G) return G;
  const n = Math.floor(T.length / 9), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 9 * n; i++) { const k = i % 3; if (T[i] < lo[k]) lo[k] = T[i]; if (T[i] > hi[k]) hi[k] = T[i]; }
  const L = Math.max(1e-6, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])), q = L * 2e-6;
  const vid = new Map(), P = [], V = new Int32Array(3 * n), N = new Float64Array(3 * n), A = new Float64Array(n), C = new Float64Array(3 * n);
  for (let t = 0; t < n; t++) {
    for (let j = 0; j < 3; j++) {
      const o = 9 * t + 3 * j, key = Math.round(T[o] / q) + ',' + Math.round(T[o + 1] / q) + ',' + Math.round(T[o + 2] / q);
      let v = vid.get(key); if (v === undefined) { v = P.length; vid.set(key, v); P.push([T[o], T[o + 1], T[o + 2]]); }
      V[3 * t + j] = v;
    }
    const a = P[V[3 * t]], b = P[V[3 * t + 1]], c = P[V[3 * t + 2]], cr = cross3(vSub(b, a), vSub(c, a)), l = vLen(cr);
    A[t] = l / 2;
    for (let k = 0; k < 3; k++) { N[3 * t + k] = l > 0 ? cr[k] / l : 0; C[3 * t + k] = (a[k] + b[k] + c[k]) / 3; }
  }
  const edges = new Map();
  for (let t = 0; t < n; t++) for (let j = 0; j < 3; j++) {
    const a = V[3 * t + j], b = V[3 * t + (j + 1) % 3]; if (a === b) continue;
    const key = a < b ? a + ',' + b : b + ',' + a; let E = edges.get(key); if (!E) edges.set(key, (E = { a: Math.min(a, b), b: Math.max(a, b), t: [] })); E.t.push(t);
  }
  const nb = Array.from({ length: n }, () => []);
  for (const E of edges.values()) for (const t of E.t) for (const u of E.t) if (t !== u) nb[t].push(u);
  G = { n, P, V, N, A, C, L, edges, nb };
  TOPO.set(T, G);
  return G;
}
const triN = (G, t) => [G.N[3 * t], G.N[3 * t + 1], G.N[3 * t + 2]], triC = (G, t) => [G.C[3 * t], G.C[3 * t + 1], G.C[3 * t + 2]];
const COS_FLAT = Math.cos(2 * deg), COS_SMOOTH = Math.cos(35 * deg);
function flatRegion(G, t0) {
  const n0 = triN(G, t0), c0 = triC(G, t0), tol = G.L * 2e-4 + 1e-4, seen = new Set([t0]), stack = [t0];
  let area = 0; const nsum = [0, 0, 0], csum = [0, 0, 0];
  while (stack.length) {
    const t = stack.pop(), a = G.A[t], nt = triN(G, t), ct = triC(G, t);
    area += a; for (let k = 0; k < 3; k++) { nsum[k] += nt[k] * a; csum[k] += ct[k] * a; }
    for (const u of G.nb[t]) if (!seen.has(u) && dot3(triN(G, u), n0) > COS_FLAT && Math.abs(dot3(vSub(triC(G, u), c0), n0)) < tol) { seen.add(u); stack.push(u); }
  }
  return { tris: [...seen], area, n: unit3(nsum), p: area > 0 ? vMul(csum, 1 / area) : c0 };
}
// the point nearest, in the least-squares sense, to lines through each triangle's centre along its normal, seen along a
function axisPoint(G, tris, a) {
  const e1 = anyPerp(a), e2 = cross3(a, e1);
  let s11 = 0, s12 = 0, s22 = 0, b1 = 0, b2 = 0;
  for (const t of tris) {
    const nt = triN(G, t), ct = triC(G, t), nx = dot3(nt, e1), ny = dot3(nt, e2), l = Math.hypot(nx, ny); if (l < 1e-9) continue;
    const ux = nx / l, uy = ny / l, cx = dot3(ct, e1), cy = dot3(ct, e2), m11 = 1 - ux * ux, m12 = -ux * uy, m22 = 1 - uy * uy;
    s11 += m11; s12 += m12; s22 += m22; b1 += m11 * cx + m12 * cy; b2 += m12 * cx + m22 * cy;
  }
  const det = s11 * s22 - s12 * s12; if (!(Math.abs(det) > 1e-12 * Math.max(1, s11 * s22))) return null;
  const qx = (b1 * s22 - b2 * s12) / det, qy = (s11 * b2 - s12 * b1) / det;
  return vAdd(vMul(e1, qx), vMul(e2, qy));
}
// the axis square to the triangles' normals (the least of their spread), from a first guess
function axisOf(G, tris, a0) {
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const t of tris) { const nt = triN(G, t), w = G.A[t]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] += w * nt[i] * nt[j]; }
  const tr = S[0][0] + S[1][1] + S[2][2], M = S.map((r, i) => r.map((v, j) => (i === j ? tr : 0) - v));
  let a = a0;
  for (let it = 0; it < 60; it++) { const b = unit3(mVec(M, a)); if (dot3(b, a) > 1 - 1e-15) { a = b; break; } a = b; }
  return a;
}
function roundRegion(G, t0, F) {
  // the neighbour of the flat region that curves away from it most, smoothly
  const n0 = triN(G, t0), inF = new Set(F.tris);
  let t1 = -1, c1 = 1;
  for (const t of F.tris) for (const u of G.nb[t]) {
    if (inF.has(u)) continue;
    const c = dot3(triN(G, u), triN(G, t)); if (c > COS_SMOOTH && c < COS_FLAT) { const cc = dot3(triN(G, u), n0); if (cc < c1) { c1 = cc; t1 = u; } }
  }
  if (t1 < 0) return null;
  let a = unit3(cross3(n0, triN(G, t1))), fit = null;
  const fits = (t, o, r, sgn) => {
    const nt = triN(G, t); if (Math.abs(dot3(nt, a)) > Math.sin(3 * deg)) return false;
    const rv = vPerp(vSub(triC(G, t), o), a), d = vLen(rv); if (d < 1e-9) return false;
    return Math.abs(d - r) < 0.07 * r + 0.02 && sgn * dot3(nt, rv) / d > Math.cos(12 * deg);
  };
  let tris = [...new Set([...F.tris, t1])];
  for (let pass = 0; pass < 3; pass++) {
    if (pass) a = axisOf(G, tris, a);
    const o = axisPoint(G, tris, a); if (!o) return null;
    // the radius at the triangles' corners (their centres sit inside a faceted circle)
    let rs = 0, rn = 0;
    for (const t of tris) for (let j = 0; j < 3; j++) { rs += vLen(vPerp(vSub(G.P[G.V[3 * t + j]], o), a)); rn++; }
    const r = rs / rn; if (!(r > 1e-6) || r > 50 * G.L) return null;
    const sgn = dot3(n0, vPerp(vSub(triC(G, t0), o), a)) >= 0 ? 1 : -1;      // out of a shaft, or into a hole
    if (!fits(t0, o, r, sgn)) return null;
    const seen = new Set([t0]), stack = [t0];
    while (stack.length) { const t = stack.pop(); for (const u of G.nb[t]) if (!seen.has(u) && dot3(triN(G, u), triN(G, t)) > COS_SMOOTH && fits(u, o, r, sgn)) { seen.add(u); stack.push(u); } }
    tris = [...seen]; fit = { o, r };
  }
  if (tris.length < 3) return null;
  let spread = 1, area = 0, csum = [0, 0, 0];
  for (const t of tris) { spread = Math.min(spread, dot3(triN(G, t), n0)); area += G.A[t]; csum = vAdd(csum, vMul(triC(G, t), G.A[t])); }
  if (spread > Math.cos(20 * deg)) return null;                     // hardly curved: not a round face
  // the point on the axis level with the face's middle
  const mid = vMul(csum, 1 / area), p = vAdd(fit.o, vMul(a, dot3(vSub(mid, fit.o), a)));
  return { k: 'axis', p, d: a, r: fit.r, tris, area, sweep: Math.acos(clamp(spread, -1, 1)) / deg };
}
// a sharp edge of triangle t0 within tol of q, run on as far as it goes straight
function sharpEdge(G, t0, q, tol) {
  let best = null, bd = tol;
  for (let j = 0; j < 3; j++) {
    const a = G.V[3 * t0 + j], b = G.V[3 * t0 + (j + 1) % 3], E = G.edges.get(a < b ? a + ',' + b : b + ',' + a); if (!E) continue;
    const other = E.t.find(u => u !== t0);
    if (other !== undefined && dot3(triN(G, other), triN(G, t0)) > Math.cos(30 * deg)) continue;    // a smooth or flat join, not an edge
    const A = G.P[a], B = G.P[b], ab = vSub(B, A), l2 = dot3(ab, ab); if (!(l2 > 0)) continue;
    const s = clamp(dot3(vSub(q, A), ab) / l2, 0, 1), d = vLen(vSub(q, vAdd(A, vMul(ab, s))));
    if (d < bd) { bd = d; best = { a, b }; }
  }
  if (!best) return null;
  const dir = unit3(vSub(G.P[best.b], G.P[best.a]));
  // on along the sharp edges in line with it, from both ends
  const sharp = E => { if (E.t.length !== 2) return E.t.length === 1; return dot3(triN(G, E.t[0]), triN(G, E.t[1])) < Math.cos(30 * deg); };
  const byV = new Map();
  for (const E of G.edges.values()) { for (const v of [E.a, E.b]) { let l = byV.get(v); if (!l) byV.set(v, (l = [])); l.push(E); } }
  const along = v => dot3(vSub(G.P[v], G.P[best.a]), dir);
  let lo = Math.min(along(best.a), along(best.b)), hi = Math.max(along(best.a), along(best.b));
  const walk = start => {
    let v = start, guard = 0;
    for (;;) {
      if (++guard > 10000) break;
      const next = (byV.get(v) || []).map(E => (E.a === v ? E.b : E.a)).find(w => {
        const e = vSub(G.P[w], G.P[v]), l = vLen(e); if (!(l > 0)) return false;
        const E = G.edges.get(v < w ? v + ',' + w : w + ',' + v), x = along(w);
        return E && sharp(E) && Math.abs(dot3(e, dir)) / l > Math.cos(1 * deg) && (x > hi + 1e-9 || x < lo - 1e-9);
      });
      if (next === undefined) break;
      const x = along(next); lo = Math.min(lo, x); hi = Math.max(hi, x); v = next;
    }
  };
  walk(best.a); walk(best.b);
  const A = G.P[best.a], p0 = vSub(A, vMul(dir, along(best.a)));
  return { k: 'edge', p: vAdd(p0, vMul(dir, (lo + hi) / 2)), d: dir, len: hi - lo, seg: [vAdd(p0, vMul(dir, lo)), vAdd(p0, vMul(dir, hi))] };
}
/* the face (or edge) of a part's triangles at triangle t0, point q: { k, p, d, r?, tris?, seg? } or { error } */
export function meshFeature(T, t0, q, opts = {}) {
  const G = meshTopo(T);
  if (!(t0 >= 0 && t0 < G.n)) return { error: 'There is no face there' };
  if (opts.edgeTol > 0 && q) { const E = sharpEdge(G, t0, q, opts.edgeTol); if (E) return E; }
  const F = flatRegion(G, t0), R = roundRegion(G, t0, F);
  if (R && R.area > F.area) return R;
  // a sliver of a curved face that is not round (a sphere, a freeform): no plane or axis to hold to
  const curved = F.tris.some(t => G.nb[t].some(u => { const c = dot3(triN(G, u), triN(G, t)); return c > COS_SMOOTH && c < COS_FLAT; }));
  if (curved && F.area < 0.02 * G.L * G.L) return { error: 'That face is curved but not round: pick a flat face, a round one (a hole, a shaft, a rim) or a straight edge' };
  return { k: 'plane', p: F.p, d: F.n, tris: F.tris, area: F.area };
}
/* an STL object's triangles in its own frame, in mm */
export function partTris(el) {
  const M = meshOf(el); if (!M || !M.n) return null;
  const sc = el.scale || 1; if (sc === 1) return M.T;
  if (M.mm && M.mmSc === sc) return M.mm;
  const T = new Float32Array(M.T.length); for (let i = 0; i < T.length; i++) T[i] = M.T[i] * sc;
  M.mm = T; M.mmSc = sc; return T;
}
/* a face as kept with the mate (its triangles and the rest left behind) */
const r6 = v => v.map(x => +x.toFixed(6));
export const featKeep = F => Object.assign({ k: F.k, p: r6(F.p), d: r6(unit3(F.d)) }, F.r > 0 ? { r: +F.r.toFixed(6) } : {});
/* a face of a part, where it is now on the bench */
export function featWorld(el, f) { const M = poseRot(el); return { k: f.k, p: vAdd(posOf(el), mVec(M, f.p)), d: unit3(mVec(M, f.d)), r: f.r }; }

/* ---------- solving a mate ----------
   The second part (B) is turned about its face's point by R and then moved by t: { R, pivot, t } or { error }. */
const line = f => f.k !== 'plane';
export function mateWhy(type, ka, kb) {
  const la = ka !== 'plane', lb = kb !== 'plane';
  if (type === 'concentric' && !(la && lb)) return 'Concentric needs two round faces (or edges): pick a hole, a shaft or a rim on each';
  return '';
}
export function mateSolve(m, A, B) {
  const why = mateWhy(m.type, A.k, B.k); if (why) return { error: why };
  const fl = m.flip ? -1 : 1, pv = B.p, nA = A.d, nB = B.d, gap = vSub(A.p, B.p);
  let R = M_I(), t = [0, 0, 0];
  // a line's direction turned into a plane (square to n), the least it can be; flip: the other way along it
  const intoPlane = (d, n) => { const q = vPerp(d, n); return vLen(q) > 1e-9 ? vMul(unit3(q), fl) : anyPerp(n); };
  const sameWay = (u, v) => (dot3(u, v) >= 0 ? 1 : -1) * fl;
  if (m.type === 'angle') {
    const vA = vMul(nA, fl), c = cross3(vA, nB), k = vLen(c) > 1e-9 ? unit3(c) : anyPerp(vA);
    R = rotBetween(nB, mVec(axisRot(k, clamp(num(m.angle, 90), 0, 180) * deg), vA));
    return { R, pivot: pv, t };
  }
  const off = m.type === 'distance' ? num(m.offset, 0) : 0, along = m.type !== 'parallel';
  if (!line(A) && !line(B)) {
    R = rotBetween(nB, m.type === 'parallel' ? vMul(nA, sameWay(nA, nB)) : vMul(nA, -fl));
    if (along) t = vMul(nA, dot3(gap, nA) + off);
  } else if (line(A) && line(B)) {
    R = rotBetween(nB, vMul(nA, sameWay(nA, nB)));
    if (along) {
      t = vPerp(gap, nA);
      if (off) { let w = vPerp(vMul(gap, -1), nA); w = vLen(w) > 1e-9 ? unit3(w) : anyPerp(nA); t = vAdd(t, vMul(w, off)); }
    }
  } else if (!line(A)) {
    // B's axis or edge onto (or along) A's face
    R = rotBetween(nB, intoPlane(nB, nA));
    if (along) t = vMul(nA, dot3(gap, nA) + off);
  } else {
    // B's face onto A's axis or edge: its normal square to it
    const n2 = intoPlane(nB, nA);
    R = rotBetween(nB, n2);
    if (along) t = vMul(n2, dot3(gap, n2) - off);
  }
  return { R, pivot: pv, t };
}
/* how far a mate is from met: the turn and the move solving it again would take (radians, mm) */
export function mateResidual(m) {
  const a = getEl(m.a.el), b = getEl(m.b.el); if (!a || !b) return null;
  const S = mateSolve(m, featWorld(a, m.a.f), featWorld(b, m.b.f)); if (S.error) return null;
  return { ang: rotAngle(S.R), dist: vLen(S.t) };
}

/* ---------- mates kept with the bench ---------- */
const v3 = v => (Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number' && isFinite(x)) ? v.map(Number) : null);
export function normMateFeat(f) {
  if (!f || typeof f !== 'object' || !MATE_KINDS[f.k]) return null;
  const p = v3(f.p), d = v3(f.d); if (!p || !d || !(vLen(d) > 1e-9)) return null;
  return Object.assign({ k: f.k, p, d: unit3(d) }, f.k === 'axis' && f.r > 0 ? { r: +f.r } : {});
}
export function normMates(list, els) {
  const ids = new Set((els || []).map(e => e.id)), out = [], seen = new Set();
  for (const m of Array.isArray(list) ? list.slice(0, 500) : []) {
    if (!m || typeof m !== 'object' || !MATE_TYPES[m.type] || !m.a || !m.b) continue;
    const a = { el: String(m.a.el), f: normMateFeat(m.a.f) }, b = { el: String(m.b.el), f: normMateFeat(m.b.f) };
    if (!ids.has(a.el) || !ids.has(b.el) || a.el === b.el || !a.f || !b.f || mateWhy(m.type, a.f.k, b.f.k)) continue;
    const id = typeof m.id === 'string' && /^[\w-]{1,24}$/.test(m.id) && !seen.has(m.id) ? m.id : 'm' + uid().slice(1);
    seen.add(id);
    const o = { id, type: m.type, a, b };
    if (m.flip === true) o.flip = true;
    if (m.type === 'distance') o.offset = clamp(num(m.offset, 0), -1e5, 1e5);
    if (m.type === 'angle') o.angle = clamp(num(m.angle, 90), 0, 180);
    out.push(o);
  }
  return out;
}
/* the mates that still hold two parts on one tab (a part deleted, or moved to another tab, takes its mates with it) */
export function liveMates() {
  const M = project && project.mates; if (!M || !M.length) return [];
  return M.filter(m => { const a = getEl(m.a.el), b = getEl(m.b.el); return a && b && a.bench === b.bench && project.elements.includes(a) && project.elements.includes(b); });
}
export const matesOf = el => liveMates().filter(m => m.a.el === el.id || m.b.el === el.id);
/* the parts that move with these: their mates, the mates' groups, and on (skip: a mate left out) */
export function mateCluster(seed, skip) {
  // (a part reached through a mate brings its group; the parts given keep to themselves, as a selection does)
  const M = liveMates().filter(m => m.id !== skip), out = new Map(), stack = seed.map(e => [e, false]);
  while (stack.length) {
    const [e, viaMate] = stack.pop(); if (!e || out.has(e.id)) continue;
    out.set(e.id, e);
    if (viaMate && e.group) for (const o of project.elements) if (o.group === e.group && o.bench === e.bench && !out.has(o.id)) stack.push([o, true]);
    for (const m of M) {
      const o = m.a.el === e.id ? m.b.el : m.b.el === e.id ? m.a.el : null, g = o && getEl(o);
      if (g && g.bench === e.bench && !out.has(g.id)) stack.push([g, true]);
    }
  }
  return [...out.values()];
}
/* a selection with whatever is mated to it (as is when nothing in it is mated) */
export function mateSpread(list) {
  const M = liveMates(); if (!M.length) return list;
  const ids = new Set(list.map(e => e.id));
  return M.some(m => ids.has(m.a.el) || ids.has(m.b.el)) ? mateCluster(list) : list;
}
/* the mate met: the second part, its group and what is mated to it (not through this mate) moved so that it holds.
   { moved } or { error } (nothing moved) */
export function mateRun(m) {
  const A = getEl(m.a.el), B = getEl(m.b.el);
  if (!A || !B) return { error: 'One of its parts is gone' };
  const seed = B.group ? project.elements.filter(e => e.group === B.group && e.bench === B.bench) : [B];
  const side = mateCluster(seed, m.id);
  if (side.includes(A)) return { error: A.name + ' and ' + B.name + ' are already held together another way (a group or another mate): ungroup them or delete that mate first' };
  const locked = side.find(e => e.locked); if (locked) return { error: locked.name + ' is locked in place' };
  const S = mateSolve(m, featWorld(A, m.a.f), featWorld(B, m.b.f)); if (S.error) return { error: S.error };
  const why = turnWhy(side, S.R); if (why) return { error: why };
  const starts = side.map(poseSnap);
  poseMove(side, starts, S.R, S.pivot, S.t);
  const r = mateResidual(m);
  if (!r || r.ang > 1e-5 || r.dist > 1e-3) {
    side.forEach((e, i) => poseRestore(e, starts[i]));
    const low = side.some((e, i) => !NET_3D.has(e.type) && vAdd(vAdd(S.pivot, mVec(S.R, vSub(starts[i].p, S.pivot))), S.t)[2] < 0);
    return { error: low ? 'Held that way, ' + B.name + ' would go below the table' : 'That mate cannot be met: ' + B.name + ' cannot turn that way' };
  }
  return { moved: side };
}
/* a new mate (a: the part that stays, b: the part moved), met and kept: { mate } or { error } */
export function mateAdd(spec) {
  const [m] = normMates([spec], project.elements);
  if (!m) return { error: 'Those two faces cannot be mated that way' };
  const r = mateRun(m); if (r.error) return r;
  (project.mates = project.mates || []).push(m);
  return { mate: m, moved: r.moved };
}
export function mateDelete(id) { if (project.mates) project.mates = project.mates.filter(m => m.id !== id); }
/* the copies of mates between parts copied (ids: old part id to new) */
export function matesCopied(list, map) {
  return (list || []).filter(m => map.has(m.a.el) && map.has(m.b.el)).map(m => Object.assign(JSON.parse(JSON.stringify(m)), { id: 'm' + uid().slice(1), a: { el: map.get(m.a.el), f: m.a.f }, b: { el: map.get(m.b.el), f: m.b.f } }));
}
