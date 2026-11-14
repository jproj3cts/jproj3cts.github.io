import { EPS0 } from '../core/traps.js';
import { getEl } from '../state/elements.js';
import { lastTrace, zOf } from './trace.js';
import { cavModes, cavSolved, findCavities } from './cavity.js';
import { beamFrame } from './phase-screen.js';

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

/* a mirror as its part has it: vertex V, facing n (towards the light), vertex curvature c, conic k, aspheric terms A,
   rim radius a, reflectance Rp */
function pupMirror(el) {
  const th = (el.angle || 0) * Math.PI / 180;
  return { el, V: [el.x, el.y, zOf(el)], n: [Math.cos(th), Math.sin(th), 0], c: el.R ? 1 / el.R : 0, k: el.k || 0, A: el.A || [], a: 0.5 * (el.diameter || el.length || 0),
    Rp: Math.max(0, Math.min(1, (el.reflect === undefined ? 100 : el.reflect) / 100)), psi: 0 };
}
function pupSag(m, r2) {
  const q = 1 + m.k, c = m.c;
  let s = c * r2 / (1 + Math.sqrt(Math.max(0, 1 - q * c * c * r2)));
  for (let i = 0; i < m.A.length; i++) s += Math.sign(c || 1) * (m.A[i] || 0) * Math.pow(r2, i + 2);
  return s;
}
function pupDsag(m, r2) {           // d sag / d r, over r
  const q = 1 + m.k, c = m.c;
  let s = c / Math.sqrt(Math.max(1e-30, 1 - q * c * c * r2));
  for (let i = 0; i < m.A.length; i++) s += Math.sign(c || 1) * (m.A[i] || 0) * 2 * (i + 2) * Math.pow(r2, i + 1);
  return s;
}
/* where a ray P + t u meets the mirror (t > 0, inside its rim): { t, X, N } or null */
function pupHit(m, P, u) {
  const un = dotp(u, m.n);
  if (Math.abs(un) < 1e-12) return null;
  let t = dotp(add3(m.V, P, -1), m.n) / un;
  for (let it = 0; it < 50; it++) {
    const X = add3(P, u, t), D = add3(X, m.V, -1), h = dotp(D, m.n), R = add3(D, m.n, -h), r2 = dotp(R, R);
    const g = h - pupSag(m, r2), dg = un - pupDsag(m, r2) * dotp(R, u);
    const dt = g / dg; t -= dt;
    if (Math.abs(dt) < 1e-13) break;
  }
  if (!(t > 1e-9)) return null;
  const X = add3(P, u, t), D = add3(X, m.V, -1), h = dotp(D, m.n), R = add3(D, m.n, -h), r2 = dotp(R, R);
  if (r2 > m.a * m.a) return null;
  const s = pupDsag(m, r2);
  return { t, X, N: unitp(add3(m.n, R, -s)) };
}
/* a ray from P along u through the cavity: after `refl` reflections (alternately on the mirror it meets) its direction,
   point, optical path (mm), amplitude and field matrix, or null if a rim takes it */
function pupTrace(M, P, u, refl, nMed) {
  let p = P, d = u, ell = 0, amp = 1, Mx = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  let at = dotp(d, M[1].n) < 0 ? 1 : 0;            // the mirror it goes towards: the one facing it
  for (let r = 0; r < refl; r++) {
    const H = pupHit(M[at], p, d);
    if (!H) return null;
    ell += nMed * H.t; p = H.X;
    const N = H.N, dn = dotp(d, N);
    d = unitp(add3(d, N, -2 * dn));
    const RN = [0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? -1 : 0) + 2 * N[i] * N[j]));
    Mx = RN.map(row => [0, 1, 2].map(j => row[0] * Mx[0][j] + row[1] * Mx[1][j] + row[2] * Mx[2][j]));
    amp *= Math.sqrt(M[at].Rp);
    at = 1 - at;
  }
  return { d, X: p, ell, amp, Mx, psi: 0 };
}
/* how many reflections bring the light back to a focus at the particle: the fewest after which a small fan of rays from
   it passes back within a twentieth of the spread it had at the mirror (up to 6) */
function pupPattern(M, C, axis, ex, nMed) {
  for (let refl = 1; refl <= 6; refl++) {
    let worst = 0, ok = true;
    for (const th of [2e-3, 5e-3]) for (const [a, b] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const ey = [axis[1] * ex[2] - axis[2] * ex[1], axis[2] * ex[0] - axis[0] * ex[2], axis[0] * ex[1] - axis[1] * ex[0]];
      for (const sg of [1, -1]) {
        const u = unitp([0, 1, 2].map(q => sg * axis[q] + th * (a * ex[q] + b * ey[q])));
        const R = pupTrace(M, C, u, refl, nMed);
        if (!R) { ok = false; continue; }
        const w = add3(C, R.X, -1), miss = Math.hypot(...add3(w, R.d, -dotp(w, R.d)));
        const spread = th * Math.hypot(...add3(R.X, C, -1));
        worst = Math.max(worst, miss / spread);
      }
    }
    if (ok && worst < 0.05) return refl;
  }
  return 0;
}
/* The plan for a particle at world point Cw in a degenerate (or near-degenerate) two-mirror cavity: null when it is not in
   one, { c, why } when this solve does not take it */
export function pupilPlan(TB, Cw, nMed, nm) {
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
    // the two mirrors: the far one (the forward leg's end) and the near one
    const elOf = j => { const ev = c.segs[j].ev; return ev && getEl(ev.el); }, far = elOf((lf.j + 1) % 2), near = elOf(lf.j);
    if (!far || !near || far.type !== 'mirror' || near.type !== 'mirror' || far.tip || far.roll || near.tip || near.roll) return no('parts');
    const M = [pupMirror(near), pupMirror(far)], F = beamFrame(lf.q.b), dir = F.d, ex = F.ex, ey = F.level ? [0, 0, 1] : F.ey;
    const pattern = pupPattern(M, Cw, dir, ex, nMed);
    if (!pattern) return no('noimage');
    // the caps: each mirror's rim as the particle sees it
    const capOf = m => { const rim = add3(add3(m.V, m.n, pupSag(m, m.a * m.a)), Cw, -1), along = Math.abs(dotp(rim, m.n)); return Math.atan2(m.a, along); };
    const L = Math.hypot(...add3(M[1].V, M[0].V, -1)), lamMm = nm * 1e-6 / nMed;
    const fresnel = Math.min(M[0].a, M[1].a) ** 2 / (lamMm * L);
    return { c, M, legF: lf, legB: lb, entry, dir, ex, ey, C: Cw, pattern, theta: [capOf(M[0]), capOf(M[1])], fresnel, L };
  }
  return null;
}
/* the grid: direction cosines across each cap (forward: towards the far mirror, +dir; backward: -dir); solid angles */
export function pupGrid(P, n = PUP_N) {
  const out = [], w = [];
  for (const [sg, th] of [[1, P.theta[1]], [-1, P.theta[0]]]) {
    const s = Math.min(0.999, Math.sin(th) * 1.03), h = 2 * s / (n - 1);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a = -s + i * h, b = -s + j * h, r2 = a * a + b * b;
      if (r2 >= s * s) continue;
      const uz = Math.sqrt(1 - r2);
      out.push([0, 1, 2].map(q => sg * uz * P.dir[q] + a * P.ex[q] + b * P.ey[q]));
      w.push(h * h / uz);
    }
  }
  const N = out.length, dirs = new Float64Array(3 * N), W = Float64Array.from(w);
  out.forEach((u, i) => dirs.set(u, 3 * i));
  return { N, dirs, w: W, n, P };
}
/* each grid direction's return: where its wave lands on the grid (up to four points, with weights), its factor (complex)
   and its field matrix; and the lock calibrated against the empty cavity's (h2: A to A by the far mirror; lam: the
   round trip) */
export function pupReturns(P, G, k0mm, nMed, lamM, h2, lam) {
  const { M, C, pattern } = P;
  // the axial returns, bare, A to A: -(i/lambda) (-1)^(n-1) prod sqrt(R) M e^{ik phi} (-i lambda) = (-1)^n prod sqrt(R) M e^{ik phi}
  const axial = (u, n) => {
    const R = pupTrace(M, C, u, n * pattern, nMed);
    if (!R) return null;
    const w = add3(R.X, C, -1), phi = R.ell - nMed * dotp(R.d, w), m = R.Mx;
    const e = [P.ex, P.ey], ein = e[0], v = [0, 1, 2].map(i => m[i][0] * ein[0] + m[i][1] * ein[1] + m[i][2] * ein[2]);
    const proj = dotp(v, ein), sgn = n % 2 ? -1 : 1, a = sgn * R.amp * proj;
    return [a * Math.cos(k0mm * phi), a * Math.sin(k0mm * phi)];
  };
  const cm = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cdv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const arg = z => Math.atan2(z[1], z[0]);
  M[0].psi = 0; M[1].psi = 0;
  const ax = P.dir, a2 = pattern === 1 ? axial(ax, 1) : null, arnd = pattern === 1 ? axial(ax, 2) : axial(ax, 1);
  if (!arnd) return null;
  if (a2 && h2) M[1].psi = arg(cdv(h2, a2));
  M[0].psi = arg(cdv(lam, cm(arnd, [Math.cos(M[1].psi), Math.sin(M[1].psi)])));
  // the grid's returns
  const N = G.N, tgt = new Int32Array(4 * N).fill(-1), tw = new Float64Array(4 * N), fac = new Float64Array(2 * N), Mx = new Float64Array(9 * N);
  // lookup: a cap's grid index from (a, b)
  const s1 = Math.min(0.999, Math.sin(P.theta[1]) * 1.03), s0 = Math.min(0.999, Math.sin(P.theta[0]) * 1.03), n = G.n;
  const index = new Map();
  for (let i = 0; i < N; i++) {
    const u = [G.dirs[3 * i], G.dirs[3 * i + 1], G.dirs[3 * i + 2]], sg = dotp(u, P.dir) > 0 ? 1 : 0, s = sg ? s1 : s0, h = 2 * s / (n - 1);
    index.set(sg + ':' + Math.round((dotp(u, P.ex) + s) / h) + ':' + Math.round((dotp(u, P.ey) + s) / h), i);
  }
  let lost = 0;
  for (let i = 0; i < N; i++) {
    const u = [G.dirs[3 * i], G.dirs[3 * i + 1], G.dirs[3 * i + 2]];
    // which mirrors it meets, in turn: the far one first when it goes forward
    let psi = 0, at = dotp(u, P.dir) > 0 ? 1 : 0;
    for (let r = 0; r < pattern; r++) { psi += M[at].psi; at = 1 - at; }
    const R = pupTrace(M, C, u, pattern, nMed);
    if (!R) { lost++; continue; }
    const w = add3(R.X, C, -1), phi = R.ell - nMed * dotp(R.d, w), ph = k0mm * phi + psi;
    // -(i/lambda) amp e^{i ph}, per unit solid angle the same both ways (the share split below keeps the waves' sum)
    fac[2 * i] = R.amp / lamM * Math.sin(ph); fac[2 * i + 1] = -R.amp / lamM * Math.cos(ph);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) Mx[9 * i + 3 * a + b] = R.Mx[a][b];
    // where it lands: bilinear among the four grid points round (a, b) of its cap
    const sg = dotp(R.d, P.dir) > 0 ? 1 : 0, s = sg ? s1 : s0, h = 2 * s / (n - 1);
    const fa = (dotp(R.d, P.ex) + s) / h, fb = (dotp(R.d, P.ey) + s) / h, ia = Math.floor(fa), ib = Math.floor(fb), ta = fa - ia, tb = fb - ib;
    const near = [[ia, ib, (1 - ta) * (1 - tb)], [ia + 1, ib, ta * (1 - tb)], [ia, ib + 1, (1 - ta) * tb], [ia + 1, ib + 1, ta * tb]];
    let wsum = 0;
    near.forEach(([p, q, wt], c) => { const j = index.get(sg + ':' + p + ':' + q); if (j !== undefined && wt > 0) { tgt[4 * i + c] = j; tw[4 * i + c] = wt * G.w[i] / G.w[j]; wsum += wt; } });
    // (a share that falls off the grid's edge is lost with the rim)
    if (wsum <= 0) lost++;
  }
  return { tgt, tw, fac, Mx, lost, a2, arnd, psi: [M[0].psi, M[1].psi] };
}
/* T on outgoing far fields Fo (6 N, world vectors): the returned waves A on the grid (6 N, V/m per steradian) */
export function pupApply(G, Rt, Fo, out) {
  const N = G.N, A = out || new Float64Array(6 * N);
  A.fill(0);
  for (let i = 0; i < N; i++) {
    const fr = Rt.fac[2 * i], fi = Rt.fac[2 * i + 1];
    if (fr === 0 && fi === 0) continue;
    const m = Rt.Mx, o = 9 * i, f = 6 * i, v = [0, 0, 0, 0, 0, 0];
    for (let a = 0; a < 3; a++) {
      const re = m[o + 3 * a] * Fo[f] + m[o + 3 * a + 1] * Fo[f + 2] + m[o + 3 * a + 2] * Fo[f + 4], im = m[o + 3 * a] * Fo[f + 1] + m[o + 3 * a + 1] * Fo[f + 3] + m[o + 3 * a + 2] * Fo[f + 5];
      v[2 * a] = fr * re - fi * im; v[2 * a + 1] = fr * im + fi * re;
    }
    for (let c = 0; c < 4; c++) {
      const j = Rt.tgt[4 * i + c];
      if (j < 0) continue;
      const wt = Rt.tw[4 * i + c];
      for (let q = 0; q < 6; q++) A[6 * j + q] += wt * v[q];
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
