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
   directions (a cavity near degeneracy: the return drifts) its share goes to the four round it. That form is for a
   return into the solid angle it left in, an exact re-image; short of it each return carries the weight its change of
   solid angle asks for, with the focal lines it has passed counted along the ray (pupChains). A wave that came back
   passes the particle and goes on, F = -i lambda A, to come back again. The cavity's lock is the empty cavity's own: the
   axial half trip by the far mirror is the empty cavity's backward wave over its forward one at the particle, the
   round trip its steady state's (the TEM00 Ritz value with the lock's detuning), and the mirrors' phases are set to them
   (a field's trips carry a Gouy phase a ray's do not: taken off each, engines/scatter.js).
   With the particle's answer to the light, linear (Mie, the dipole array, the single dipole): the returned waves x
   on the grid satisfy x = T(-i lambda x + F0 + P x), F0 the particle's far field in the empty cavity's light and P its
   answer to x, solved by GMRES (all round trips at once; the cost does not grow with the finesse). Rays are taken with
   their phase between the mirrors, the rims as hard edges: good while the Fresnel number a^2 / (lambda L) is large
   (PUP_FRESNEL); under it the Scattering tab says so. */
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
  if (map.grid) return map.grid;          // (the map's own: kept with it while the cavity stays as it is)
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
  // each cell's numbers laid flat for pupMapAt (PUP_CD each): where it lands q (3), its way d (3), its phase ell - d.q,
  // its field matrix (18), and across the particle's plane the first differences of q and d (ex, ey: 6 + 6) and the
  // second (ex ex, ey ey, ex ey: 9 + 9)
  const cd = new Float64Array(map.cell.length * PUP_CD), dx2 = 2 * map.dx, dxx = map.dx * map.dx;
  map.cell.forEach((c, r) => {
    if (!c) return;
    const o = r * PUP_CD;
    cd.set(c.q, o); cd.set(c.d, o + 3); cd[o + 6] = c.ell - dotp(c.d, c.q); cd.set(c.M, o + 7);
    for (let t = 0; t < 2; t++) {
      const A = c.jac[2 * t], B = c.jac[2 * t + 1];
      if (!A || !B) continue;
      for (let x = 0; x < 3; x++) {
        cd[o + 25 + 3 * t + x] = (A.q[x] - B.q[x]) / dx2; cd[o + 31 + 3 * t + x] = (A.d[x] - B.d[x]) / dx2;
        cd[o + 37 + 3 * t + x] = (A.q[x] + B.q[x] - 2 * c.q[x]) / dxx; cd[o + 46 + 3 * t + x] = (A.d[x] + B.d[x] - 2 * c.d[x]) / dxx;
      }
    }
    if (c.jac[0] && c.jac[2] && c.jac[4]) for (let x = 0; x < 3; x++) {
      cd[o + 43 + x] = (c.jac[4].q[x] - c.jac[0].q[x] - c.jac[2].q[x] + c.q[x]) / dxx;
      cd[o + 52 + x] = (c.jac[4].d[x] - c.jac[0].d[x] - c.jac[2].d[x] + c.d[x]) / dxx;
    }
    // the mirrors' points along the axis (55, 56) and the stretch between two mirrors (57..74: its crossing, its way, and
    // their first differences across the plane)
    cd[o + 55] = c.zl; cd[o + 56] = c.z1;
    if (c.mid) {
      cd.set(c.mid.q, o + 57); cd.set(c.mid.d, o + 60);
      for (let t = 0; t < 2; t++) {
        const A = c.jacm[2 * t], B = c.jacm[2 * t + 1];
        if (!A || !B) continue;
        for (let x = 0; x < 3; x++) { cd[o + 63 + 3 * t + x] = (A.q[x] - B.q[x]) / dx2; cd[o + 69 + 3 * t + x] = (A.d[x] - B.d[x]) / dx2; }
      }
    }
  });
  return (map.grid = { N, dirs, w: W, n: map.caps[0].n, P, node, rec, cd });
}
const PUP_CD = 75, PUP_ACC = new Float64Array(PUP_CD), PUP_GA = new Float64Array(PUP_CD), PUP_GB = new Float64Array(PUP_CD);
// (what the weight needs the slope of across directions: q, d, their first differences across the plane, the middle stretch's q and d)
const PUP_GI = [0, 1, 2, 3, 4, 5, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 57, 58, 59, 60, 61, 62];
const pupCrD = (t, o) => { const t2 = t * t; o[0] = (-3 * t2 + 4 * t - 1) / 2; o[1] = (9 * t2 - 10 * t) / 2; o[2] = (-9 * t2 + 8 * t + 1) / 2; o[3] = (3 * t2 - 2 * t) / 2; return o; };
const PUP_DA = new Float64Array(4), PUP_DB = new Float64Array(4);
const pupCr = (t, o) => { const t2 = t * t, t3 = t2 * t; o[0] = (-t3 + 2 * t2 - t) / 2; o[1] = (3 * t3 - 5 * t2 + 2) / 2; o[2] = (-3 * t3 + 4 * t2 + t) / 2; o[3] = (t3 - t2) / 2; return o; };
const PUP_WA = new Float64Array(4), PUP_WB = new Float64Array(4);
/* a polynomial's value at the origin from samples at (x, y) (least squares, degree 1 or 2), as weights on the samples:
   null when the samples do not fix it */
function pupFitWeights(xy, deg) {
  const m = deg === 2 ? 6 : 3, n = xy.length, row = ([x, y]) => (deg === 2 ? [1, x, y, x * x, x * y, y * y] : [1, x, y]);
  // solve (A^T A) z = e0, weights = A z
  const N = Array.from({ length: m }, () => new Float64Array(m + 1));
  const rows = xy.map(row);
  for (const r of rows) for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) N[a][b] += r[a] * r[b];
  N[0][m] = 1;
  for (let c = 0; c < m; c++) {
    let pv = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(N[r][c]) > Math.abs(N[pv][c])) pv = r;
    if (!(Math.abs(N[pv][c]) > 1e-9)) return null;
    [N[c], N[pv]] = [N[pv], N[c]];
    for (let r = 0; r < m; r++) { if (r === c) continue; const f = N[r][c] / N[c][c]; if (f) for (let b = c; b <= m; b++) N[r][b] -= f * N[c][b]; }
  }
  const z = N.map((r, a) => r[m] / r[a]), w = new Float64Array(n);
  for (let k = 0; k < n; k++) for (let a = 0; a < m; a++) w[k] += rows[k][a] * z[a];
  return w;
}
/* the same fit's slopes at the origin along x and along y, as weights on the samples (its second and third coefficients) */
function pupFitSlopes(xy, deg) {
  const m = deg === 2 ? 6 : 3, n = xy.length, row = ([x, y]) => (deg === 2 ? [1, x, y, x * x, x * y, y * y] : [1, x, y]);
  const N = Array.from({ length: m }, () => new Float64Array(m + 2));
  const rows = xy.map(row);
  for (const r of rows) for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) N[a][b] += r[a] * r[b];
  N[1][m] = 1; N[2][m + 1] = 1;
  for (let c = 0; c < m; c++) {
    let pv = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(N[r][c]) > Math.abs(N[pv][c])) pv = r;
    if (!(Math.abs(N[pv][c]) > 1e-9)) return null;
    [N[c], N[pv]] = [N[pv], N[c]];
    for (let r = 0; r < m; r++) { if (r === c) continue; const f = N[r][c] / N[c][c]; if (f) for (let b = c; b <= m + 1; b++) N[r][b] -= f * N[c][b]; }
  }
  const wx = new Float64Array(n), wy = new Float64Array(n);
  for (let k = 0; k < n; k++) for (let a = 0; a < m; a++) { wx[k] += rows[k][a] * N[a][m] / N[a][a]; wy[k] += rows[k][a] * N[a][m + 1] / N[a][a]; }
  return [wx, wy];
}
/* 2 x 2 matrices, row by row [m00, m01, m10, m11] */
const m2mul = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
const m2add = (A, B) => [A[0] + B[0], A[1] + B[1], A[2] + B[2], A[3] + B[3]];
/* how many s in (lo, hi] make det(B + s S) nought: the focal lines on a free stretch, B a neighbouring ray's distance
   across (per unit of the direction it left the particle by) where the stretch crosses the particle's plane, S its change
   with the distance s along the axis */
function pupFocal(B, S, lo, hi) {
  const c0 = B[0] * B[3] - B[1] * B[2], c1 = B[0] * S[3] + S[0] * B[3] - B[1] * S[2] - S[1] * B[2], c2 = S[0] * S[3] - S[1] * S[2];
  const scale = Math.abs(c0) + Math.abs(c1) + Math.abs(c2) + 1e-300, inside = r => (r > lo && r <= hi ? 1 : 0);
  if (Math.abs(c2) > 1e-9 * scale) { const sq = Math.sqrt(Math.max(0, c1 * c1 - 4 * c0 * c2)); return inside((-c1 - sq) / (2 * c2)) + inside((-c1 + sq) / (2 * c2)); }
  return Math.abs(c1) > 1e-9 * scale ? inside(-c0 / c1) : 0;
}
/* a stretch's S: the slope across the axis, (a, b) / c for direction cosines (a, b) across and c along it, as it changes
   with the direction the light left by, D = d(a, b)/d(a0, b0); per unit distance along the axis the way the light goes */
function pupSlope(P, d, D) {
  const c = dotp(d, P.dir), ma = dotp(d, P.ex) / c, mb = dotp(d, P.ey) / c, f = 1 / Math.abs(c);
  return m2mul([f * (1 + ma * ma), f * ma * mb, f * ma * mb, f * (1 + mb * mb)], D);
}
/* the map at any direction d and crossing q of the particle's plane: { q, d, ell, M } or null. Among the cells round d:
   Catmull-Rom over the 4 x 4 where all of them bring light back; near a rim a surface of second degree through those
   of them that do (of first degree under nine of them), so the map is carried to the rim as it runs, not held level.
   Across the plane: where the ray lands and its way to second order in q (the offsets' first and second differences),
   and the phase it brings, ell - d'.q', from those by the rays' own law (the path between two points changes by
   d'.dq' - d.dq: Hamilton), which gives it to third order with no difference of the paths themselves taken. */
export function pupMapAt(P, G, d, q, jac) {
  const { map } = P, ci = dotp(d, P.dir) > 0 ? 0 : 1, cap = map.caps[ci], n = cap.n, h = cap.h, rec = G.rec[ci], cd = G.cd, acc = PUP_ACC, ga = PUP_GA, gb = PUP_GB;
  const fa = (dotp(d, P.ex) + cap.s) / h, fb = (dotp(d, P.ey) + cap.s) / h, ia = Math.floor(fa), ib = Math.floor(fb);
  const wa = pupCr(fa - ia, PUP_WA), wb = pupCr(fb - ib, PUP_WB);
  acc.fill(0);
  if (jac) { ga.fill(0); gb.fill(0); }
  let all = ia >= 1 && ib >= 1 && ia + 2 < n && ib + 2 < n;
  for (let u = 0; u < 4 && all; u++) for (let v = 0; v < 4; v++) if (rec[(ia - 1 + u) * n + ib - 1 + v] < 0) { all = false; break; }
  if (all) {
    const da = jac ? pupCrD(fa - ia, PUP_DA) : null, db = jac ? pupCrD(fb - ib, PUP_DB) : null;
    for (let u = 0; u < 4; u++) for (let v = 0; v < 4; v++) {
      const o = rec[(ia - 1 + u) * n + ib - 1 + v] * PUP_CD, wt = wa[u] * wb[v];
      for (let x = 0; x < PUP_CD; x++) acc[x] += wt * cd[o + x];
      if (jac) { const w1 = da[u] * wb[v] / h, w2 = wa[u] * db[v] / h; for (const x of PUP_GI) { const val = cd[o + x]; ga[x] += w1 * val; gb[x] += w2 * val; } }
    }
  } else {
    const have = [];
    for (let u = 0; u < 4; u++) for (let v = 0; v < 4; v++) {
      const a = ia - 1 + u, b = ib - 1 + v;
      if (a < 0 || b < 0 || a >= n || b >= n || rec[a * n + b] < 0) continue;
      have.push([a, b]);
    }
    if (!have.length) return null;
    const xy = have.map(([a, b]) => [a - fa, b - fb]);
    let w = (have.length >= 9 && pupFitWeights(xy, 2)) || (have.length >= 3 && pupFitWeights(xy, 1));
    if (!w) { const d2 = xy.map(([x, y]) => x * x + y * y); w = new Float64Array(have.length); w[d2.indexOf(Math.min(...d2))] = 1; }
    const sl = jac ? (have.length >= 9 && pupFitSlopes(xy, 2)) || (have.length >= 3 && pupFitSlopes(xy, 1)) : null;
    for (let k = 0; k < have.length; k++) {
      const o = rec[have[k][0] * n + have[k][1]] * PUP_CD, wt = w[k];
      if (wt) for (let x = 0; x < PUP_CD; x++) acc[x] += wt * cd[o + x];
      if (sl) { const w1 = sl[0][k] / h, w2 = sl[1][k] / h; for (const x of PUP_GI) { const val = cd[o + x]; ga[x] += w1 * val; gb[x] += w2 * val; } }
    }
  }
  const qx = dotp(q, P.ex), qy = dotp(q, P.ey), xx = qx * qx, yy = qy * qy, xy2 = 2 * qx * qy;
  // a = Jq q, b = Hq[q, q], c = Jd q, e = Hd[q, q]; phi(q) = phi(0) - d.q - the sum along s q of q'.dd'
  const qo = [0, 0, 0], dO = [0, 0, 0];
  let sum = 0;
  for (let x = 0; x < 3; x++) {
    const a = acc[25 + x] * qx + acc[28 + x] * qy, c = acc[31 + x] * qx + acc[34 + x] * qy;
    const b = acc[37 + x] * xx + acc[40 + x] * yy + acc[43 + x] * xy2, e = acc[46 + x] * xx + acc[49 + x] * yy + acc[52 + x] * xy2;
    qo[x] = acc[x] + a + 0.5 * b; dO[x] = acc[3 + x] + c + 0.5 * e;
    sum += acc[x] * (c + 0.5 * e) + a * (0.5 * c + e / 3) + b * (c / 6 + e / 8);
  }
  const l = Math.hypot(dO[0], dO[1], dO[2]) || 1;
  dO[0] /= l; dO[1] /= l; dO[2] /= l;
  const out = { q: qo, d: dO, ell: acc[6] - dotp(d, q) - sum + dotp(dO, qo), M: acc.slice(7, 25) };
  if (jac) {
    // how the return moves with where the ray crossed the plane (A: its crossing, C: its way) and with the way it came
    // (B, D), across the axis (ex, ey); and the same for the stretch between two mirrors
    const ex = P.ex, ey = P.ey;
    const two = (f0, f1) => { const o = [0, 0, 0, 0]; for (let x = 0; x < 3; x++) { const v0 = f0(x), v1 = f1(x); o[0] += ex[x] * v0; o[1] += ex[x] * v1; o[2] += ey[x] * v0; o[3] += ey[x] * v1; } return o; };
    out.J = {
      A: two(x => acc[25 + x] + acc[37 + x] * qx + acc[43 + x] * qy, x => acc[28 + x] + acc[40 + x] * qy + acc[43 + x] * qx),
      C: two(x => acc[31 + x] + acc[46 + x] * qx + acc[52 + x] * qy, x => acc[34 + x] + acc[49 + x] * qy + acc[52 + x] * qx),
      B: two(x => ga[x] + ga[25 + x] * qx + ga[28 + x] * qy, x => gb[x] + gb[25 + x] * qx + gb[28 + x] * qy),
      D: two(x => ga[3 + x] + ga[31 + x] * qx + ga[34 + x] * qy, x => gb[3 + x] + gb[31 + x] * qx + gb[34 + x] * qy),
      zl: acc[55], z1: acc[56], mid: null,
    };
    if (map.pattern === 2 && (acc[60] !== 0 || acc[61] !== 0 || acc[62] !== 0)) out.J.mid = {
      A: two(x => acc[63 + x], x => acc[66 + x]), C: two(x => acc[69 + x], x => acc[72 + x]),
      B: two(x => ga[57 + x], x => gb[57 + x]), D: two(x => ga[60 + x], x => gb[60 + x]), d: unitp([acc[60], acc[61], acc[62]]),
    };
  }
  return out;
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
   it comes back near it a plane wave there,
       A_n(d_n) dOmega_n = -(i/lambda) X_n e^{i psi} M_n e^{ik (ell_n - d_n . q_n)} F(u_i) dOmega_i,
   M_n the product of the map's field matrices (the tracer's amplitudes, its mirrors' coefficients and coatings), ell_n
   the path to where the ray crosses the particle's plane, q_n that crossing; until it has faded or a rim has taken it.
   X_n = sqrt(dOmega_n / dOmega_i) (-i)^kappa is the weight a return's change of solid angle asks for (its energy is
   kept: |A|^2 dOmega_n = |F|^2 dOmega_i), kappa the focal lines counted along the ray: those on the free stretches it
   has finished, less those the present stretch left its mirror already past. For an exactly concentric or confocal
   cavity it is (-1)^(n-1), each return a focus passed; short of that the returns come back spread (by cos(n psi) for a
   stable cavity), and the cavity's resonance is in the sum only with it. The map's change with the direction (between
   its cells) and with the crossing (its offsets) is carried along the chain for it: B, a neighbouring ray's distance
   across where the ray crosses the plane, and D, its direction's change, per unit of the direction it left by.
   Each wave is put on the grid once, at the four directions round d_n, its value at the particle kept. The sum over the
   returns is kept as a sparse map from each source direction to the grid points its returns land on, a 3 x 3 complex
   block each: S = sum_n C^n T, the empty cavity's every return of the particle's light at once. */
export function pupChains(P, G, Rt, k0mm, nMed, lamM, tol = 1e-9) {
  // (kept with the map: the same cavity, particle's place, light and lock give the same returns, whatever the particle
  // is; a solve that only changes the particle, or is asked again, takes them as they are)
  const had = P.map.chains, sig = [Rt.psi[0], Rt.psi[1], k0mm, nMed, lamM, tol];
  if (had && had.sig.every((v, x) => Math.abs(v - sig[x]) <= 1e-12 * Math.max(1, Math.abs(v)))) return Object.assign({}, had.S, { kept: true });
  const N = G.N, rows = [];
  let total = 0, longest = 0;
  // C = A B, 3 x 3 complex, into C (not A or B)
  const mulM = (A, B, C) => { for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) { let r = 0, im = 0; for (let z = 0; z < 3; z++) { const ar = A[2 * (3 * x + z)], ai = A[2 * (3 * x + z) + 1], br = B[2 * (3 * z + y)], bi = B[2 * (3 * z + y) + 1]; r += ar * br - ai * bi; im += ar * bi + ai * br; } C[2 * (3 * x + y)] = r; C[2 * (3 * x + y) + 1] = im; } };
  const Ma = new Float64Array(18), Mc = new Float64Array(18);
  const I3 = Float64Array.from([1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0]);
  for (let i = 0; i < N; i++) {
    const blocks = new Map();
    let d = [G.dirs[3 * i], G.dirs[3 * i + 1], G.dirs[3 * i + 2]], q = [0, 0, 0], ell = 0, psi = 0, Mx = Ma, Mb = Mc;
    Mx.set(I3);
    let Bm = [0, 0, 0, 0], Dm = [1, 0, 0, 1], mu = 0, sa = 0;
    const c0 = dotp(d, P.dir), h0 = P.map.caps[c0 > 0 ? 0 : 1].h;
    for (let ret = 1; ret < 100000; ret++) {
      const fwd = dotp(d, P.dir) > 0;
      // the mirrors' phases (the lock) for the reflections of this return
      psi += P.pattern === 1 ? Rt.psi[fwd ? 1 : 0] : Rt.psi[0] + Rt.psi[1];
      const R = pupMapAt(P, G, d, q, true);
      if (!R) break;
      // the focal lines: on the stretch that crossed the plane coming in, now finished at this return's first mirror; on
      // the stretch between two mirrors (two reflections a return); then the state where this return crosses the plane
      const J = R.J, sb = Math.abs(J.z1);
      mu += pupFocal(Bm, pupSlope(P, d, Dm), ret === 1 ? 1e-9 * sb : -sa, sb);
      if (J.mid) {
        const Bq = m2add(m2mul(J.mid.A, Bm), m2mul(J.mid.B, Dm)), Dq = m2add(m2mul(J.mid.C, Bm), m2mul(J.mid.D, Dm)), sg = dotp(J.mid.d, P.dir) > 0 ? 1 : -1;
        mu += pupFocal(Bq, pupSlope(P, J.mid.d, Dq), Math.min(J.z1 * sg, J.zl * sg), Math.max(J.z1 * sg, J.zl * sg));
      }
      { const Bn = m2add(m2mul(J.A, Bm), m2mul(J.B, Dm)), Dn = m2add(m2mul(J.C, Bm), m2mul(J.D, Dm)); Bm = Bn; Dm = Dn; }
      mulM(R.M, Mx, Mb); { const t = Mx; Mx = Mb; Mb = t; }
      ell += R.ell; d = R.d; q = R.q;
      let amp2 = 0; for (let x = 0; x < 18; x++) amp2 += Mx[x] * Mx[x];
      if (amp2 < tol * tol) break;
      sa = Math.abs(J.zl);
      const kap = (((mu - pupFocal(Bm, pupSlope(P, d, Dm), -Infinity, -sa)) % 4) + 4) % 4;
      const size = Math.sqrt(Math.abs((Dm[0] * Dm[3] - Dm[1] * Dm[2]) * c0 / dotp(d, P.dir)));
      // The return's phase is taken at the cell's middle; across the cell (h each way in the direction left by) it runs
      // on, by -k q_n . d(d_n) (the rays' own law again: the path changes by d'.dq'), fast where the return crosses the
      // plane far from the particle. The cell's share is its mean over the cell: a sinc each way
      const qa = dotp(q, P.ex), qb = dotp(q, P.ey), hh = 0.5 * h0 * k0mm, sinc = v => (Math.abs(v) < 1e-6 ? 1 : Math.sin(v) / v);
      const mean = size * sinc(hh * (qa * Dm[0] + qb * Dm[2])) * sinc(hh * (qa * Dm[1] + qb * Dm[3]));
      const xr = kap === 0 ? mean : kap === 2 ? -mean : 0, xi = kap === 1 ? -mean : kap === 3 ? mean : 0;
      // -(i/lambda) X e^{i ph}
      const ph = k0mm * (ell - dotp(d, q)) + psi, zr = Math.sin(ph) / lamM, zi = -Math.cos(ph) / lamM;
      const fr = zr * xr - zi * xi, fi = zr * xi + zi * xr;
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
  const S = { rows, returns: total, longest };
  P.map.chains = { sig, S };
  return S;
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
  let iters = 0, resid = 1, comb = null;
  for (let cyc = 0; cyc < PUP_ITERS / PUP_RESTART; cyc++) {
    // (from nothing, B(x) is nothing: not asked for)
    const Bx = cyc === 0 && !x0 ? null : yield* B(x), r = new Float64Array(n);
    for (let q = 0; q < n; q++) r[q] = rhs[q] - (x[q] - (Bx ? Bx[q] : 0));
    comb = null;
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
    // (found in one go from nothing: x is this sum of the vectors B was asked for, in order; so anything linear in x
    // is the same sum of what was worked out for each)
    if (cyc === 0 && !x0) comb = y;
    if (resid < PUP_TOL) break;
  }
  return { x, iters, resid, comb };
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
