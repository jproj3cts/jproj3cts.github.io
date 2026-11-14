import { EPS0 } from '../core/traps.js';
import { getEl } from '../state/elements.js';
import { lastTrace } from './trace.js';
import { cavModes, cavSolved, findCavities } from './cavity.js';
import { beamFrame } from './phase-screen.js';
import { PUP_MAPS, pmapDir } from './scatter-pupil-map.js';

/* ---------- A particle inside a degenerate cavity, solved in the pupil ----------
   In a concentric or confocal cavity (or one near them) the light a particle sends onto a mirror comes back to it
   re-imaged: every direction of it, not a mode or two. So the basis is the directions themselves: a square grid of
   direction cosines over each mirror's cap as the particle sees it (pupGrid). Each direction is traced round the cavity
   once, on the mirrors' own surfaces (their radius, conic and aspheric terms, their rims, their reflectance, where they
   stand), to its first return to a focus at the particle: one reflection for a concentric pair, two for a confocal one
   (pupPattern finds it from a fan of rays). There it is a converging wave, and as plane waves at the particle
       A(u') dOmega' = -(i/lambda) prod(sqrt(R)) M F(u) e^{ik phi} dOmega,
   F the far field that left along u, M the mirrors' action on the field vector (E -> -E + 2 (E.N) N each), phi the
   optical path to the last mirror less the plane wave's own path back from there. Where u' falls between grid
   directions (a cavity near degeneracy: the return drifts) its share goes to the four round it. A wave that came back
   passes the particle and goes on, F = -i lambda A, to come back again. The cavity's lock is the empty cavity's own: the
   axial half trip by the far mirror is the empty cavity's backward wave over its forward one at the particle, the
   round trip its steady state's (the TEM00 Ritz value with the lock's detuning), and the mirrors' phases are set to them.
   With the particle's answer to the light, linear (Mie, the dipole array, the single dipole): the returned waves x
   on the grid satisfy x = T(-i lambda x + F0 + P x), F0 the particle's far field in the empty cavity's light and P its
   answer to x, solved by GMRES (all round trips at once; the cost does not grow with the finesse). Rays are taken with
   their phase between the mirrors, the rims as hard edges: good while the Fresnel number a^2 / (lambda L) is large
   (PUP_FRESNEL); under it the Scattering tab says so. */
export const PUP_N = 64;                 // grid points across each cap
export const PUP_FRESNEL = 10;
const PUP_TOL = 1e-8, PUP_RESTART = 40, PUP_ITERS = 200;

const add3 = (a, b, s = 1) => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];
const dotp = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unitp = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/* The plan for a particle at world point Cw in a degenerate (or near-degenerate) two-mirror cavity, from the tracer's
   one-pass map of it (engines/scatter-pupil-map.js): null when it is not in one, { c, why } when this solve does not take it */
export function pupilPlan(TB, Cw, nMed, nm, el) {
  let cs;
  try { cs = findCavities(); } catch (err) { return null; }
  for (const c of cs) {
    const legs = [];
    c.segs.forEach((b, j) => { const q = TB.parts.find(p => p.b === b); if (q) legs.push({ j, q }); });
    if (!legs.length) continue;
    const no = why => ({ c, why });
    if (c.kind !== 'linear' || c.p !== 2 || legs.length !== 2) return no(c.kind !== 'linear' ? 'ring' : 'legs');
    const d0 = beamFrame(legs[0].q.b).d;
    if (dotp(beamFrame(legs[1].q.b).d, d0) > -0.999) return no('legs');
    const loopB = new Set(c.segs), entry = TB.parts.filter(q => !loopB.has(q.b) && q.coh === legs[0].q.coh && Math.abs(dotp(beamFrame(q.b).d, d0)) > 0.999);
    if (!entry.length) return no('entry');
    const fd = beamFrame(entry[0].b).d, [lf, lb] = dotp(beamFrame(legs[0].q.b).d, fd) > 0 ? legs : [legs[1], legs[0]];
    const map = el && PUP_MAPS.get(el.id);
    if (!map || !map.C || Math.hypot(map.C[0] - Cw[0], map.C[1] - Cw[1], map.C[2] - Cw[2]) > 1e-9) return no('probe');
    if (map.why) return no(map.why);
    const far = getEl(map.far), near = getEl(map.near), lamMm = nm * 1e-6 / nMed;
    const fresnel = Math.min(0.5 * (far.diameter || far.length || 0), 0.5 * (near.diameter || near.length || 0)) ** 2 / (lamMm * map.L);
    return { c, map, legF: lf, legB: lb, entry, dir: map.axis, ex: map.ex, ey: map.ey, C: Cw, pattern: map.pattern, fresnel, L: map.L, M: [{ el: near }, { el: far }] };
  }
  return null;
}
/* the grid: the map's cells (forward cap: towards the far mirror, +dir; backward: -dir) that bring light back, a rim cell
   taken for the share of it that does and at their mean direction; solid angles */
export function pupGrid(P) {
  const { map } = P, out = [], w = [], at = [];
  const capCells = [0, 1].map(ci => new Map());
  map.cell.forEach((c, i) => { if (c) capCells[c.ci].set(c.k, i); });
  map.caps.forEach((cap, ci) => cap.cells.forEach((cl, k) => {
    const uz = Math.sqrt(1 - cl.a * cl.a - cl.b * cl.b);
    if (cl.edge) {
      const A = map.rim.get(ci + ':' + k);
      if (!A || !A.k) return;
      const a = A.sa / A.sw, b = A.sb / A.sw;
      out.push(pmapDir(P, cap.sg, a, b)); w.push(A.sw * cap.h * cap.h / A.n); at.push([ci, cl.i, cl.j]);
      return;
    }
    if (!capCells[ci].has(k)) return;
    out.push(pmapDir(P, cap.sg, cl.a, cl.b)); w.push(cap.h * cap.h / uz); at.push([ci, cl.i, cl.j]);
  }));
  const N = out.length, dirs = new Float64Array(3 * N), W = Float64Array.from(w);
  out.forEach((u, i) => dirs.set(u, 3 * i));
  // each cap's cells by (i, j): their grid node and their map record
  const node = map.caps.map(cap => new Int32Array(cap.n * cap.n).fill(-1)), rec = map.caps.map(cap => new Int32Array(cap.n * cap.n).fill(-1));
  at.forEach(([ci, i, j], k) => { node[ci][i * map.caps[ci].n + j] = k; });
  map.cell.forEach((c, k) => { if (c) { const cl = map.caps[c.ci].cells[c.k]; rec[c.ci][cl.i * map.caps[c.ci].n + cl.j] = k; } });
  return { N, dirs, w: W, n: map.caps[0].n, P, node, rec };
}
/* the map at any direction d and crossing q of the particle's plane: bilinear among the four cells round d (those that
   bring light back, their weights made up), moved by the offsets' derivatives for q. { q, d, ell, M } or null */
function pupMapAt(P, G, d, q) {
  const { map } = P, ci = dotp(d, P.dir) > 0 ? 0 : 1, cap = map.caps[ci], n = cap.n, h = cap.h;
  const fa = (dotp(d, P.ex) + cap.s) / h, fb = (dotp(d, P.ey) + cap.s) / h, ia = Math.floor(fa), ib = Math.floor(fb), ta = fa - ia, tb = fb - ib;
  let W = 0;
  const acc = { q: [0, 0, 0], d: [0, 0, 0], ell: 0, M: new Float64Array(18), jq: [[0, 0, 0], [0, 0, 0]], jd: [[0, 0, 0], [0, 0, 0]], je: [0, 0], he: [0, 0, 0] };
  const dx2 = 2 * map.dx;
  // Catmull-Rom over the 4 x 4 cells round d where all of them bring light back (fourth order: the paths' phase, k ell,
  // is interpolated to well under a hundredth of a radian), bilinear among the four nearest near a rim
  const cr = t => [(-t * t * t + 2 * t * t - t) / 2, (3 * t * t * t - 5 * t * t + 2) / 2, (-3 * t * t * t + 4 * t * t + t) / 2, (t * t * t - t * t) / 2];
  let pts = [];
  {
    const wa = cr(ta), wb = cr(tb);
    let all = true;
    for (let u = 0; u < 4 && all; u++) for (let v = 0; v < 4 && all; v++) { const a = ia - 1 + u, b = ib - 1 + v; if (a < 0 || b < 0 || a >= n || b >= n || G.rec[ci][a * n + b] < 0) all = false; else pts.push([a, b, wa[u] * wb[v]]); }
    if (!all) pts = [[ia, ib, (1 - ta) * (1 - tb)], [ia + 1, ib, ta * (1 - tb)], [ia, ib + 1, (1 - ta) * tb], [ia + 1, ib + 1, ta * tb]].filter(([, , wt]) => wt > 0);
  }
  for (const [a, b, wt] of pts) {
    if (a < 0 || b < 0 || a >= n || b >= n) continue;
    const r = G.rec[ci][a * n + b];
    if (r < 0) continue;
    const c = map.cell[r];
    W += wt;
    for (let x = 0; x < 3; x++) { acc.q[x] += wt * c.q[x]; acc.d[x] += wt * c.d[x]; }
    acc.ell += wt * c.ell;
    for (let x = 0; x < 18; x++) acc.M[x] += wt * c.M[x];
    // the derivatives across the plane, from the offsets either side (across: ex, then ey)
    for (let t = 0; t < 2; t++) {
      const A = c.jac[2 * t], B = c.jac[2 * t + 1];
      if (!A || !B) continue;
      for (let x = 0; x < 3; x++) { acc.jq[t][x] += wt * (A.q[x] - B.q[x]) / dx2; acc.jd[t][x] += wt * (A.d[x] - B.d[x]) / dx2; }
      acc.je[t] += wt * (A.ell - B.ell) / dx2;
      // the path's curvature across the plane (the mirrors' focusing): second differences, and the cross term
      acc.he[t] += wt * (A.ell + B.ell - 2 * c.ell) / (map.dx * map.dx);
    }
    if (c.jac[0] && c.jac[2] && c.jac[4]) acc.he[2] += wt * (c.jac[4].ell - c.jac[0].ell - c.jac[2].ell + c.ell) / (map.dx * map.dx);
  }
  if (!(W > 0)) return null;
  const s = 1 / W, qx = dotp(q, P.ex), qy = dotp(q, P.ey);
  const qo = [0, 1, 2].map(x => s * (acc.q[x] + acc.jq[0][x] * qx + acc.jq[1][x] * qy));
  const dO = unitp([0, 1, 2].map(x => s * (acc.d[x] + acc.jd[0][x] * qx + acc.jd[1][x] * qy)));
  const ell = s * (acc.ell + acc.je[0] * qx + acc.je[1] * qy + 0.5 * (acc.he[0] * qx * qx + acc.he[1] * qy * qy) + acc.he[2] * qx * qy);
  for (let x = 0; x < 18; x++) acc.M[x] *= s;
  return { q: qo, d: dO, ell, M: acc.M };
}
/* The lock: the axial returns (the map at the axis each way), calibrated to the empty cavity's own (h2: A to A by the far
   mirror; lam: the round trip), as a phase on each mirror. Returns the two mirrors' phases */
export function pupReturns(P, G, k0mm, nMed, lamM, h2, lam) {
  const { pattern } = P, es = P.ey;
  const step = (d, q) => pupMapAt(P, G, d, q);
  // the bare A-to-A factor of n returns along the axis: (-1)^n (e_s . M e_s) e^{ik (ell - d.q)} per return, chained
  const axial = n => {
    let d = P.dir, q = [0, 0, 0], ell = 0, f = [1, 0];
    for (let r = 0; r < n; r++) {
      const R = step(d, q);
      if (!R) return null;
      const M = R.M; let mr = 0, mi = 0;
      for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) { mr += es[x] * M[2 * (3 * x + y)] * es[y]; mi += es[x] * M[2 * (3 * x + y) + 1] * es[y]; }
      ell += R.ell; const ph = k0mm * (ell - dotp(R.d, R.q)) ;
      f = [f[0] * mr - f[1] * mi, f[0] * mi + f[1] * mr];
      d = R.d; q = R.q;
      if (r === n - 1) { const c = Math.cos(ph), sn = Math.sin(ph), sg = n % 2 ? -1 : 1; return [sg * (f[0] * c - f[1] * sn), sg * (f[0] * sn + f[1] * c)]; }
      ell -= 0;     // (the path carries on from the crossing)
    }
    return null;
  };
  const cm = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cdv = (a, b) => { const dd = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / dd, (a[1] * b[0] - a[0] * b[1]) / dd]; };
  const arg = z => Math.atan2(z[1], z[0]);
  const a2 = pattern === 1 ? axial(1) : null, arnd = pattern === 1 ? axial(2) : axial(1);
  if (!arnd) return null;
  const psi = [0, 0];
  if (a2 && h2) psi[1] = arg(cdv(h2, a2));
  psi[0] = arg(cdv(lam, cm(arnd, [Math.cos(psi[1]), Math.sin(psi[1])])));
  return { psi, a2, arnd, lost: 0, index: null };
}
/* Every return of every grid direction, followed through the map: from the particle along u_i, round and round, each time
   it comes back to a focus near it a plane wave there,
       A_n(d_n) dOmega = -(i/lambda) (-1)^(n-1) e^{i psi} M_n e^{ik (ell_n - d_n . q_n)} F(u_i) dOmega_i,
   M_n the product of the map's field matrices (the tracer's amplitudes, its mirrors' coefficients and coatings), ell_n
   the path to where the ray crosses the particle's plane, q_n that crossing; until it has faded or a rim has taken it.
   Each wave is put on the grid once, at the four directions round d_n, its value at the particle kept. The sum over the
   returns is kept as a sparse map from each source direction to the grid points its returns land on, a 3 x 3 complex
   block each: S = sum_n C^n T, the empty cavity's every return of the particle's light at once. */
export function pupChains(P, G, Rt, k0mm, nMed, lamM, tol = 1e-9) {
  const N = G.N, rows = [];
  let total = 0, longest = 0;
  const mulM = (A, B) => { const C = new Float64Array(18); for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) { let r = 0, im = 0; for (let z = 0; z < 3; z++) { const ar = A[2 * (3 * x + z)], ai = A[2 * (3 * x + z) + 1], br = B[2 * (3 * z + y)], bi = B[2 * (3 * z + y) + 1]; r += ar * br - ai * bi; im += ar * bi + ai * br; } C[2 * (3 * x + y)] = r; C[2 * (3 * x + y) + 1] = im; } return C; };
  const I3 = Float64Array.from([1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0]);
  for (let i = 0; i < N; i++) {
    const blocks = new Map();
    let d = [G.dirs[3 * i], G.dirs[3 * i + 1], G.dirs[3 * i + 2]], q = [0, 0, 0], ell = 0, Mx = I3, psi = 0;
    for (let ret = 1; ret < 100000; ret++) {
      const fwd = dotp(d, P.dir) > 0;
      // the mirrors' phases (the lock) for the reflections of this return
      psi += P.pattern === 1 ? Rt.psi[fwd ? 1 : 0] : Rt.psi[0] + Rt.psi[1];
      const R = pupMapAt(P, G, d, q);
      if (!R) break;
      Mx = mulM(R.M, Mx); ell += R.ell; d = R.d; q = R.q;
      let amp2 = 0; for (let x = 0; x < 18; x++) amp2 += Mx[x] * Mx[x];
      if (amp2 < tol * tol) break;
      const ph = k0mm * (ell - dotp(d, q)) + psi, sgn = ret % 2 ? 1 : -1;
      const fr = sgn / lamM * Math.sin(ph), fi = -sgn / lamM * Math.cos(ph);
      const ci = dotp(d, P.dir) > 0 ? 0 : 1, cap = P.map.caps[ci], n = cap.n, h = cap.h;
      const fa = (dotp(d, P.ex) + cap.s) / h, fb = (dotp(d, P.ey) + cap.s) / h, ia = Math.floor(fa), ib = Math.floor(fb), ta = fa - ia, tb = fb - ib;
      let wsum = 0;
      const near = [[ia, ib, (1 - ta) * (1 - tb)], [ia + 1, ib, ta * (1 - tb)], [ia, ib + 1, (1 - ta) * tb], [ia + 1, ib + 1, ta * tb]];
      for (const [pa, pb, wt] of near) { if (pa >= 0 && pb >= 0 && pa < n && pb < n && wt > 0 && G.node[ci][pa * n + pb] >= 0) wsum += wt; }
      if (!(wsum > 0)) break;
      for (const [pa, pb, wt] of near) {
        if (pa < 0 || pb < 0 || pa >= n || pb >= n || !(wt > 0)) continue;
        const j = G.node[ci][pa * n + pb];
        if (j < 0) continue;
        // (its value at the particle is what the particle answers to: kept as it is, the shares summing to it)
        const a = (wt / wsum) * G.w[i] / G.w[j], cr = a * fr, cim = a * fi;
        let B = blocks.get(j);
        if (!B) { B = new Float64Array(18); blocks.set(j, B); }
        for (let x = 0; x < 9; x++) { const mr = Mx[2 * x], mi = Mx[2 * x + 1]; B[2 * x] += cr * mr - cim * mi; B[2 * x + 1] += cr * mi + cim * mr; }
      }
      total++; longest = Math.max(longest, ret);
    }
    const js = Int32Array.from(blocks.keys()), bl = new Float64Array(18 * js.length);
    js.forEach((j, k) => bl.set(blocks.get(j), 18 * k));
    rows.push({ js, bl });
  }
  return { rows, returns: total, longest };
}
/* S on outgoing far fields Fo (6 N): every return of them, as plane waves on the grid (6 N) */
export function pupApplyChains(G, S, Fo, out) {
  const N = G.N, A = out || new Float64Array(6 * N);
  A.fill(0);
  for (let i = 0; i < N; i++) {
    const { js, bl } = S.rows[i], f = 6 * i;
    if (!js.length) continue;
    const x0 = Fo[f], x1 = Fo[f + 1], y0 = Fo[f + 2], y1 = Fo[f + 3], z0 = Fo[f + 4], z1 = Fo[f + 5];
    for (let k = 0; k < js.length; k++) {
      const b = 18 * k, o = 6 * js[k];
      for (let a = 0; a < 3; a++) {
        const q = b + 6 * a;
        const re = bl[q] * x0 - bl[q + 1] * x1 + bl[q + 2] * y0 - bl[q + 3] * y1 + bl[q + 4] * z0 - bl[q + 5] * z1;
        const im = bl[q] * x1 + bl[q + 1] * x0 + bl[q + 2] * y1 + bl[q + 3] * y0 + bl[q + 4] * z1 + bl[q + 5] * z0;
        A[o + 2 * a] += re; A[o + 2 * a + 1] += im;
      }
    }
  }
  return A;
}
/* complex vectors as interleaved reals: GMRES for x - B(x) = rhs, B linear, given as a generator function (so a dipole
   array's solves inside it can report and be stopped) */
const cdotv = (a, b) => { let r = 0, i = 0; for (let q = 0; q < a.length; q += 2) { r += a[q] * b[q] + a[q + 1] * b[q + 1]; i += a[q] * b[q + 1] - a[q + 1] * b[q]; } return [r, i]; };
const nrm = a => Math.sqrt(cdotv(a, a)[0]);
export function* pupGmres(B, rhs, x0) {
  const n = rhs.length, x = x0 ? Float64Array.from(x0) : new Float64Array(n), bn = nrm(rhs) || 1;
  let iters = 0, resid = 1;
  for (let cyc = 0; cyc < PUP_ITERS / PUP_RESTART; cyc++) {
    const Bx = yield* B(x), r = new Float64Array(n);
    for (let q = 0; q < n; q++) r[q] = rhs[q] - (x[q] - Bx[q]);
    const beta = nrm(r);
    resid = beta / bn;
    if (resid < PUP_TOL) break;
    const V = [r.map(v => v / beta)], H = [], cs = [], sn = [], g = [[beta, 0]];
    let m = 0;
    for (; m < PUP_RESTART; m++) {
      const Bv = yield* B(V[m]), w = new Float64Array(n);
      for (let q = 0; q < n; q++) w[q] = V[m][q] - Bv[q];
      iters++;
      H.push(new Array(m + 2).fill(null).map(() => [0, 0]));
      for (let i = 0; i <= m; i++) {
        const h = cdotv(V[i], w);
        H[m][i] = h;
        for (let q = 0; q < n; q += 2) { w[q] -= h[0] * V[i][q] - h[1] * V[i][q + 1]; w[q + 1] -= h[0] * V[i][q + 1] + h[1] * V[i][q]; }
      }
      const hn = nrm(w);
      H[m][m + 1] = [hn, 0];
      // the Givens rotations so far, then a new one for this column
      for (let i = 0; i < m; i++) {
        const a = H[m][i], b = H[m][i + 1], c = cs[i], s = sn[i];
        H[m][i] = [c * a[0] + (s[0] * b[0] - s[1] * b[1]), c * a[1] + (s[0] * b[1] + s[1] * b[0])];
        H[m][i + 1] = [-(s[0] * a[0] + s[1] * a[1]) + c * b[0], -(s[0] * a[1] - s[1] * a[0]) + c * b[1]];
      }
      const a = H[m][m], b = H[m][m + 1], na = Math.hypot(a[0], a[1]), den = Math.hypot(na, b[0], b[1]) || 1;
      const c = na / den, s = na > 0 ? [(a[0] * b[0] + a[1] * b[1]) / (na * den), (a[0] * b[1] - a[1] * b[0]) / (na * den)] : [1, 0];
      // s = (a / |a|) conj(b) / den, so that [c s; -conj(s) c] [a; b] = [r; 0]
      const sc = na > 0 ? [(a[0] * b[0] + a[1] * b[1]) / (na * den), (a[1] * b[0] - a[0] * b[1]) / (na * den)] : [b[0] / den, -b[1] / den];
      cs.push(c); sn.push(sc);
      H[m][m] = [c * a[0] + (sc[0] * b[0] - sc[1] * b[1]), c * a[1] + (sc[0] * b[1] + sc[1] * b[0])];
      H[m][m + 1] = [0, 0];
      const gm = g[m];
      g.push([-(sc[0] * gm[0] + sc[1] * gm[1]), -(sc[0] * gm[1] - sc[1] * gm[0])]);
      g[m] = [c * gm[0], c * gm[1]];
      void s;
      resid = Math.hypot(g[m + 1][0], g[m + 1][1]) / bn;
      if (resid < PUP_TOL || !(hn > 0)) { m++; break; }
      V.push(w.map(v => v / hn));
    }
    // back substitution
    const y = new Array(m).fill(null).map(() => [0, 0]);
    for (let i = m - 1; i >= 0; i--) {
      let t = [g[i][0], g[i][1]];
      for (let j = i + 1; j < m; j++) { const h = H[j][i]; t = [t[0] - (h[0] * y[j][0] - h[1] * y[j][1]), t[1] - (h[0] * y[j][1] + h[1] * y[j][0])]; }
      const d = H[i][i], dd = d[0] * d[0] + d[1] * d[1] || 1e-300;
      y[i] = [(t[0] * d[0] + t[1] * d[1]) / dd, (t[1] * d[0] - t[0] * d[1]) / dd];
    }
    for (let i = 0; i < m; i++) for (let q = 0; q < n; q += 2) { x[q] += y[i][0] * V[i][q] - y[i][1] * V[i][q + 1]; x[q + 1] += y[i][0] * V[i][q + 1] + y[i][1] * V[i][q]; }
    if (resid < PUP_TOL) break;
  }
  return { x, iters, resid };
}
/* the empty cavity's lock, from its steady state: the round trip (A to A, physicists' convention) */
export function pupLock(P) {
  const SV = cavSolved.get(P.c.id);
  if (!SV || !SV.res || SV.trace !== lastTrace) return null;
  const md = cavModes(SV.res, P.c.fsr, 8);
  if (!md.length) return null;
  const m0 = md.reduce((a, v) => (v.share > a.share ? v : a)), c = Math.cos(SV.delta), s = Math.sin(SV.delta);
  const l = [m0.lam[0] * c - m0.lam[1] * s, m0.lam[0] * s + m0.lam[1] * c];
  return { lam: [l[0], -l[1]], delta: SV.delta };
}
export const PUP_EPS0 = EPS0;
