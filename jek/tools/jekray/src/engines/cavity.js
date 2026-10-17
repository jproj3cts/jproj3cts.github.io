import { gainAt, gainSmall } from '../core/crystals.js';
import { hermite, m2Of } from '../core/pulses.js';
import { fanFromGauss, modeM2 } from '../core/beams-hom.js';
import { wavelengthColour } from '../core/colour.js';
import { deg } from '../state/project.js';
import { getEl } from '../state/elements.js';
import { maskOf } from '../core/geometry.js';
import { lastTrace, vdot3 } from './trace.js';
import { popInside, popLeg, popRadii, popSurface, qdht } from './field.js';
import { beamAxes, popScreen } from './phase-screen.js';
import { fft, fieldComps, popLeg2, popSurface2 } from './field2d.js';
import { popClear } from './beam-tree.js';
import { solveLinear } from '../core/numeric.js';

/* ---------- Cavities ----------
   A cavity is found from the light's own path: along the pilot ray's tree of branches, the
   events (which surface, transmitted or reflected, coming from which way) are listed, and a
   loop is the shortest run of them that repeats twice. A Michelson comes back to its
   splitter but never repeats; a Fabry-Perot repeats "far mirror, near mirror" for ever.
   Each loop then gets its own axis (the ray that closes on itself, which the input need not
   follow), its round-trip ray matrices in and out of the bench plane, and from those its
   Gaussian mode, spectrum and losses. */
const CAV_TOL_ANGLE = 0.01;          // rad: incoming directions this close count as the same event
export let cavCache = null;
export function setCavCache(v) { return (cavCache = v); }
const surfIds = new WeakMap(); let surfNext = 1;
const surfId = s => {
  // an element and where along it: the same across reloads, so a cavity keeps its name and settings
  // faces of a block sit in frames of their own, all at z = 0: their frame tells them apart, or
  // a window's two faces met the same way read as one surface repeating (a cavity of one)
  if (s.el && s.el.id && s.z !== undefined) return s.el.id + '@' + (+s.z).toFixed(6) + (s.kind === 'split' ? 's' : '')
    + (s.lf ? '/' + s.lf.x.toFixed(4) + ',' + s.lf.y.toFixed(4) : '');
  if (!surfIds.has(s)) surfIds.set(s, surfNext++); return surfIds.get(s);
};
function cavKey(ev) {
  if (!ev) return 'src';
  // the direction by its rounded components, not its angle: an angle flips between +pi and
  // -pi on a hair's difference, and would split one event into two
  const s = ev.surf, q = v => Math.round(v / CAV_TOL_ANGLE) + 0;
  return (s ? surfId(s) : 'x' + ev.el) + ':' + ev.mode + ':' + q(ev.dIn[0]) + ',' + q(ev.dIn[1]);
}
/* The thin-element ray matrix of one event, in reduced coordinates (height, n x slope), in
   the bench plane (x) and out of it (y), from probe rays through the real surface */
export function cavEventABCD(ev, lam0) {
  const I = { x: [1, 0, 0, 1], y: [1, 0, 0, 1] };
  if (!ev || !ev.surf || ev.mode === 'P') return I;
  if (ev.mode === 'M') {
    // a mask is a thin lens of whatever curvature its delay has: in the plane the tracer
    // found it (ev.C); out of it, from the same formula across the other way
    const fn = maskOf(ev.surf), hh = 1e-4, C = ev.C || 0;
    if (!fn) return { x: [1, 0, C, 1], y: [1, 0, C, 1] };
    if (ev.surf.tilt && ev.surf.roll) {
      // rolled: its delay's curvature both ways and across, the beam's left being the mask's +u or -u
      const f = (a, b) => fn(ev.ly + a, b, lam0)[1], c0 = f(0, 0);
      const Hxx = (f(hh, 0) + f(-hh, 0) - 2 * c0) / (hh * hh), Hyy = (f(0, hh) + f(0, -hh) - 2 * c0) / (hh * hh);
      const Hxy = (f(hh, hh) - f(hh, -hh) - f(-hh, hh) + f(-hh, -hh)) / (4 * hh * hh);
      const fr = ev.surf.f, sg = (ev.dIn[0] * fr.c + ev.dIn[1] * fr.s) >= 0 ? 1 : -1, n = ev.n1 || 1;
      const cx = Hxx * lam0 / n, cy = Hyy * lam0 / n, cxy = sg * Hxy * lam0 / n;
      return { x: [1, 0, cx, 1], y: [1, 0, cy, 1], m4: { A: [[1, 0], [0, 1]], C: [[cx, cxy], [cxy, cy]] } };
    }
    const f0 = fn(ev.ly, 0, lam0), fp = fn(ev.ly, hh, lam0), fm = fn(ev.ly, -hh, lam0);
    const smooth = Math.abs(fp[1] - fm[1]) < 0.05 && Math.abs(fp[1] + fm[1] - 2 * f0[1]) < 0.05;
    return { x: [1, 0, C, 1], y: [1, 0, smooth ? (fp[1] + fm[1] - 2 * f0[1]) / (hh * hh) * lam0 : 0, 1] };
  }
  const tr = popScreen(ev, 0, 0, lam0), dO = ev.dOut || ev.dIn, exo = [-dO[1], dO[0]], n2 = ev.n2;
  const hh = 1e-4 * Math.max(1e-3, Math.min(ev.semi || 1, 1));
  // off the plane, the beam's own axes about its 3D way out (see beamAxes)
  const g3 = ev.dout3 && ev.dout3[2] ? (() => { const d = ev.dout3, l = Math.hypot(d[0], d[1], d[2]), u = [d[0] / l, d[1] / l, d[2] / l]; return [u, ...beamAxes(u)]; })() : null;
  const slope = g3 ? r => { const [u, a, b] = g3, along = r[14] * u[0] + r[15] * u[1] + r[16] * u[2]; return [(r[14] * a[0] + r[15] * a[1] + r[16] * a[2]) / along, (r[14] * b[0] + r[15] * b[1] + r[16] * b[2]) / along]; }
    : r => { const along = r[14] * dO[0] + r[15] * dO[1]; return [(r[14] * exo[0] + r[15] * exo[1]) / along, r[16] / along]; };
  const px = tr(hh, 0), mx = tr(-hh, 0), py = tr(0, hh), my = tr(0, -hh);
  if (!px[4] || !mx[4] || !py[4] || !my[4]) return null;
  const Ax = (px[1] - mx[1]) / (2 * hh), Ay = (py[2] - my[2]) / (2 * hh);
  const Cx = n2 * (slope(px)[0] - slope(mx)[0]) / (2 * hh), Cy = n2 * (slope(py)[1] - slope(my)[1]) / (2 * hh);
  // what one axis does to the other: a part rolled or tipped turns the beam's axes
  const Axy = (py[1] - my[1]) / (2 * hh), Ayx = (px[2] - mx[2]) / (2 * hh);
  const Cxy = n2 * (slope(py)[0] - slope(my)[0]) / (2 * hh), Cyx = n2 * (slope(px)[1] - slope(mx)[1]) / (2 * hh);
  const out = { x: [Ax, 0, Cx, 1 / Ax], y: [Ay, 0, Cy, 1 / Ay] };
  // an axicon's cone: the rays either side of its tip part by its angle, which these differences
  // read as a lens of no focal length; the beam's pilot ignores the tip's kink (see curvAt), so here too
  if (ev.surf && ev.surf.odd && ev.surf.odd[0]) { out.x[2] = 0; out.y[2] = 0; return out; }
  const sc = Math.abs(Ax) + Math.abs(Ay) + 1e-300, cc = Math.abs(Cx) + Math.abs(Cy) + 1e-9;
  if (Math.abs(Axy) + Math.abs(Ayx) > 1e-9 * sc || Math.abs(Cxy) + Math.abs(Cyx) > 1e-7 * cc) out.m4 = { A: [[Ax, Axy], [Ayx, Ay]], C: [[Cx, Cxy], [Cyx, Cy]] };
  return out;
}
const mmul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3]];
export const mfree = (L, n) => [1, L / n, 0, 1];
/* ---------- A Gaussian beam with its axes turned (general astigmatism) ----------
   Where a part couples the beam's two axes (a cylinder rolled, a curved mirror tipped and
   turned), the beam is no longer two q's, one across and one up: it is a complex symmetric
   2x2 matrix Q (Arnaud), its field exp(-i k r.Q^-1.r / 2) / sqrt(det Q) over r = (x, y) in the
   beam's own axes (x across, y up; see beamAxes). A part's 4x4 ray matrix [A 0; C D] (D = A^-T,
   thin) takes it to (A Q)(C Q + D)^-1, and free space adds L/n to its diagonal. Q diagonal is
   the two q's as ever. Complex numbers are [re, im]; a 2x2 complex matrix is [a, b, c, d]. */
export const cz = { m: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]], a: (a, b) => [a[0] + b[0], a[1] + b[1]], s: (a, b) => [a[0] - b[0], a[1] - b[1]],
  d: (a, b) => { const q = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / q, (a[1] * b[0] - a[0] * b[1]) / q]; },
  r: (a, k) => [a[0] * k, a[1] * k], sqrt: a => { const r = Math.hypot(a[0], a[1]), re = Math.sqrt(Math.max(0, (r + a[0]) / 2)), im = Math.sqrt(Math.max(0, (r - a[0]) / 2)); return [re, a[1] < 0 ? -im : im]; } };
// a real 2x2 [[a, b], [c, d]] times a complex 2x2
const rcMul = (R, M) => [cz.a(cz.r(M[0], R[0][0]), cz.r(M[2], R[0][1])), cz.a(cz.r(M[1], R[0][0]), cz.r(M[3], R[0][1])),
  cz.a(cz.r(M[0], R[1][0]), cz.r(M[2], R[1][1])), cz.a(cz.r(M[1], R[1][0]), cz.r(M[3], R[1][1]))];
const ccMul = (P, M) => [cz.a(cz.m(P[0], M[0]), cz.m(P[1], M[2])), cz.a(cz.m(P[0], M[1]), cz.m(P[1], M[3])), cz.a(cz.m(P[2], M[0]), cz.m(P[3], M[2])), cz.a(cz.m(P[2], M[1]), cz.m(P[3], M[3]))];
export const ccInv = M => { const det = cz.s(cz.m(M[0], M[3]), cz.m(M[1], M[2])); return [cz.d(M[3], det), cz.r(cz.d(M[1], det), -1), cz.r(cz.d(M[2], det), -1), cz.d(M[0], det)]; };
const ccDet = M => cz.s(cz.m(M[0], M[3]), cz.m(M[1], M[2]));
// through one event's matrices: its 4x4 blocks when it couples the axes, else its two planes
function QThroughEvent(m, Q) {
  const A = m.m4 ? m.m4.A : [[m.x[0], 0], [0, m.y[0]]], C = m.m4 ? m.m4.C : [[m.x[2], 0], [0, m.y[2]]];
  const dA = A[0][0] * A[1][1] - A[0][1] * A[1][0], D = [[A[1][1] / dA, -A[1][0] / dA], [-A[0][1] / dA, A[0][0] / dA]];   // A^-T
  const num = rcMul(A, Q), den = rcMul(C, Q);
  for (let i = 0; i < 4; i++) den[i] = cz.a(den[i], [[D[0][0], D[0][1], D[1][0], D[1][1]][i], 0]);
  const out = ccMul(num, ccInv(den));
  const sym = cz.r(cz.a(out[1], out[2]), 0.5); out[1] = sym; out[2] = sym;          // symmetric, as it must be
  return out;
}
export const QFree = (Q, L) => [cz.a(Q[0], [L, 0]), Q[1], Q[2], cz.a(Q[3], [L, 0])];
// its two eigenvalues: the q's along its own axes, where it has any (each with a positive imaginary part)
export function QEig(Q) {
  const tr = cz.a(Q[0], Q[3]), det = ccDet(Q), disc = cz.sqrt(cz.s(cz.m(tr, tr), cz.r(det, 4)));
  return [cz.r(cz.a(tr, disc), 0.5), cz.r(cz.s(tr, disc), 0.5)];
}
/* A beam's Q at the end of segment i, from its source through every event on its way, when
   one of them couples the axes; null when none does (the two q's then serve, as ever) */
export function beamQ(B, i, lam0) {
  const chain = [];
  for (let j = i; j >= 0; j = B[j].parent) chain.push(j);
  chain.reverse();
  const r0 = B[chain[0]], q0 = [r0.qr / r0.n, r0.qi / r0.n];
  let Q = [q0, [0, 0], [0, 0], q0], gen = false;
  for (let c = 0; c < chain.length; c++) {
    const bb = B[chain[c]];
    if (c > 0) {
      const m = cavEventABCD(bb.ev, lam0); if (!m) return null;
      // a part turned out of the plane, or the beam off it: the tracer's own q in the plane does not see it
      if (m.m4 || (bb.ev && bb.ev.surf && bb.ev.surf.tilt) || (bb.ev && bb.ev.dout3 && bb.ev.dout3[2])) gen = true;
      Q = QThroughEvent(m, Q);
    }
    Q = QFree(Q, (bb.len3 || bb.len) / bb.n);
  }
  return gen ? Q : null;
}
/* A Hermite-Gauss sum [m, n, re, im] in one frame, written in a frame turned by alpha (its
   axes x1 = x cos a + y sin a, y1 = -x sin a + y cos a): modes of one order N = m + n only mix
   among themselves, so the sum stays finite. The overlaps are worked out on a grid (the
   trapezium rule is exact to rounding for these), and kept */
const hgRotMemo = new Map();
function hgUnit(m, x) { let f = 1; for (let i = 2; i <= m; i++) f *= i; return Math.pow(2 / Math.PI, 0.25) / Math.sqrt(Math.pow(2, m) * f) * hermite(m, Math.SQRT2 * x) * Math.exp(-x * x); }
function hgRotate(comps, alpha) {
  if (!comps || Math.abs(Math.sin(alpha)) < 1e-15 && Math.cos(alpha) > 0) return comps;
  const out = new Map(), ca = Math.cos(alpha), sa = Math.sin(alpha);
  for (const [m, n, ar, ai] of comps) {
    const N = m + n, key = m + ',' + n + ',' + alpha;
    let row = hgRotMemo.get(key);
    if (!row) {
      const L = Math.sqrt(2 * N + 1) + 5, K = 2 * Math.ceil(12 * L) + 1, h = 2 * L / (K - 1), xs = Array.from({ length: K }, (_, i) => -L + i * h);
      row = [];
      for (let j = 0; j <= N; j++) {
        let s = 0;
        for (const x of xs) for (const y of xs) s += hgUnit(m, x) * hgUnit(n, y) * hgUnit(j, x * ca + y * sa) * hgUnit(N - j, -x * sa + y * ca);
        row.push(s * h * h);
      }
      if (hgRotMemo.size > 2000) hgRotMemo.clear();
      hgRotMemo.set(key, row);
    }
    row.forEach((g, j) => { if (Math.abs(g) < 1e-13) return; const k = j + ',' + (N - j), o = out.get(k) || [j, N - j, 0, 0]; o[2] += g * ar; o[3] += g * ai; out.set(k, o); });
  }
  return [...out.values()].filter(c => Math.hypot(c[2], c[3]) > 1e-12);
}
// Q in a frame turned by th (r = R r1): R^T Q R
export function QRot(Q, th) {
  const c = Math.cos(th), s = Math.sin(th), R = [[c, -s], [s, c]], RT = [[c, s], [-s, c]];
  const a = rcMul(RT, Q), b = [a[0], a[1], a[2], a[3]];
  // (R^T Q) R: by columns
  return [cz.a(cz.r(b[0], R[0][0]), cz.r(b[1], R[1][0])), cz.a(cz.r(b[0], R[0][1]), cz.r(b[1], R[1][1])),
    cz.a(cz.r(b[2], R[0][0]), cz.r(b[3], R[1][0])), cz.a(cz.r(b[2], R[0][1]), cz.r(b[3], R[1][1]))];
}
/* A higher-order beam (a Hermite-Gauss sum) along its way, as beamQ, with its modes: they are
   carried in the beam's own principal frame (th), each axis's Gouy phase psi gathered over every
   stretch of free space (what turns modes into each other in a converter). Where a part with
   axes of its own meets a beam that is round, or already lined up with it, the sum is turned
   into the part's frame, the Gouy phases so far first folded into it. A part that turns the
   image (a Dove prism) turns the frame. A beam twisted by parts at odd angles to each other
   (general astigmatism) has no such frame: it is marked, and its modes are only roughly placed */
export function beamQM(B, i, lam0, comps, th0) {
  const chain = [];
  for (let j = i; j >= 0; j = B[j].parent) chain.push(j);
  chain.reverse();
  const r0 = B[chain[0]], q0 = [r0.qr / r0.n, r0.qi / r0.n];
  let Q = [q0, [0, 0], [0, 0], q0], th = th0 || 0, C = comps, twisted = false, gen = !!th0;
  const g0 = Math.atan2(q0[1], q0[0]); let psi = [g0, g0];
  // (to a part in a million: a part's matrices come from rays traced through it, and are that good)
  const offd = (M) => Math.hypot(M[1][0], M[1][1]) <= 1e-6 * (Math.hypot(M[0][0], M[0][1]) + Math.hypot(M[3][0], M[3][1]) + 1e-300);
  const round = M => offd(M) && Math.hypot(M[0][0] - M[3][0], M[0][1] - M[3][1]) <= 1e-6 * (Math.hypot(M[0][0], M[0][1]) + 1e-300);
  const fold = () => {
    // the Gouy phases so far into the modes, (m + 1/2) psi_x + (n + 1/2) psi_y, then from nothing
    C = C.map(([m, n, a, b]) => { const p = -(m + 0.5) * psi[0] - (n + 0.5) * psi[1], c = Math.cos(p), s = Math.sin(p); return [m, n, a * c - b * s, a * s + b * c]; });
    psi = [0, 0];
  };
  for (let c = 0; c < chain.length; c++) {
    const bb = B[chain[c]];
    if (c > 0) {
      const m = cavEventABCD(bb.ev, lam0); if (!m) return null;
      const A = m.m4 ? m.m4.A : [[m.x[0], 0], [0, m.y[0]]], Cm = m.m4 ? m.m4.C : [[m.x[2], 0], [0, m.y[2]]], Qbefore = Q;
      if (m.m4 || Math.abs(m.x[0] - m.y[0]) > 1e-12 || Math.abs(m.x[2] - m.y[2]) > 1e-12 * (Math.abs(m.x[2]) + Math.abs(m.y[2]) + 1e-300) || (bb.ev && bb.ev.surf && bb.ev.surf.tilt)) gen = true;
      // the part as three steps: a stretch S along its own axes, a turn or mirror U (A = U S), then a
      // lens L = C A^-1 in the beam's new frame; the modes follow each
      const ax = M => 0.5 * Math.atan2(M[0][1] + M[1][0], M[0][0] - M[1][1]);
      const isRound = M => Math.abs(M[0][1]) + Math.abs(M[1][0]) + Math.abs(M[0][0] - M[1][1]) <= 1e-6 * (Math.abs(M[0][0]) + Math.abs(M[1][1])) + 1e-12;
      const take = phi => {
        // a beam round here, or lined up with the part already, takes the part's axes; any other is twisted
        if (Math.abs(Math.sin(2 * (phi - th))) < 1e-6) return;
        if (round(Q) || offd(QRot(Q, phi))) { fold(); C = hgRotate(C, phi - th); th = phi; }
        else twisted = true;
      };
      const AtA = [[A[0][0] ** 2 + A[1][0] ** 2, A[0][0] * A[0][1] + A[1][0] * A[1][1]], [0, A[0][1] ** 2 + A[1][1] ** 2]]; AtA[1][0] = AtA[0][1];
      const sd = Math.sqrt(Math.max(0, AtA[0][0] * AtA[1][1] - AtA[0][1] ** 2)), sn = Math.sqrt(AtA[0][0] + AtA[1][1] + 2 * sd);
      const S = [[(AtA[0][0] + sd) / sn, AtA[0][1] / sn], [AtA[0][1] / sn, (AtA[1][1] + sd) / sn]], dS = S[0][0] * S[1][1] - S[0][1] ** 2;
      const Si = [[S[1][1] / dS, -S[0][1] / dS], [-S[0][1] / dS, S[0][0] / dS]];
      const U = [[A[0][0] * Si[0][0] + A[0][1] * Si[1][0], A[0][0] * Si[0][1] + A[0][1] * Si[1][1]], [A[1][0] * Si[0][0] + A[1][1] * Si[1][0], A[1][0] * Si[0][1] + A[1][1] * Si[1][1]]];
      const sym = (M, N) => [[M[0][0] * N[0][0] + M[0][1] * N[1][0], M[0][0] * N[0][1] + M[0][1] * N[1][1]], [M[1][0] * N[0][0] + M[1][1] * N[1][0], M[1][0] * N[0][1] + M[1][1] * N[1][1]]];
      const conj = (R, Qm) => { const RT = [[R[0][0], R[1][0]], [R[0][1], R[1][1]]], a2 = rcMul(R, Qm); return [cz.a(cz.r(a2[0], RT[0][0]), cz.r(a2[1], RT[1][0])), cz.a(cz.r(a2[0], RT[0][1]), cz.r(a2[1], RT[1][1])), cz.a(cz.r(a2[2], RT[0][0]), cz.r(a2[3], RT[1][0])), cz.a(cz.r(a2[2], RT[0][1]), cz.r(a2[3], RT[1][1]))]; };
      if (!isRound(S)) take(ax(S));
      let Qs = conj(S, Q), mirrored = false;
      const dU = U[0][0] * U[1][1] - U[0][1] * U[1][0];
      if (dU > 0) th += Math.atan2(U[1][0], U[0][0]);
      else {
        // mirrored: into the bench's frame (Gouy phases folded in), flipped, its frame the mirror's
        const save = Q; Q = Qs; fold(); Q = save;
        C = hgRotate(C, -th); C = C.map(([mm, n, a2, b2]) => n % 2 ? [mm, n, -a2, -b2] : [mm, n, a2, b2]);
        th = Math.atan2(U[1][0], U[0][0]); mirrored = true;
      }
      Q = conj(U, Qs);
      const Ai = [[A[1][1] / (A[0][0] * A[1][1] - A[0][1] * A[1][0]), -A[0][1] / (A[0][0] * A[1][1] - A[0][1] * A[1][0])], [-A[1][0] / (A[0][0] * A[1][1] - A[0][1] * A[1][0]), A[0][0] / (A[0][0] * A[1][1] - A[0][1] * A[1][0])]];
      const Lm = sym(Cm, Ai), Ls = [[Lm[0][0], 0.5 * (Lm[0][1] + Lm[1][0])], [0.5 * (Lm[0][1] + Lm[1][0]), Lm[1][1]]];
      if (mirrored && !round(Q)) {
        // the beam's own axes: those of Im Q (shared with Re Q while it is not twisted)
        const phQ = 0.5 * Math.atan2(2 * Q[1][1], Q[0][1] - Q[3][1]);
        if (offd(QRot(Q, phQ))) { C = hgRotate(C, phQ - th); th = phQ; }
      }
      if (!isRound(Ls)) take(ax(Ls));
      Q = QThroughEvent(m, Qbefore);
    }
    // free space: each axis's Gouy phase, in the modes' frame, while the beam keeps to it
    const L = (bb.len3 || bb.len) / bb.n, Qa = QRot(Q, th);
    Q = QFree(Q, L);
    if (!twisted && offd(Qa)) { const Qb = QRot(Q, th); psi = [psi[0] + Math.atan2(Qb[0][1], Qb[0][0]) - Math.atan2(Qa[0][1], Qa[0][0]), psi[1] + Math.atan2(Qb[3][1], Qb[3][0]) - Math.atan2(Qa[3][1], Qa[3][0])]; }
    else if (!offd(Qa)) twisted = true;
  }
  return gen ? { Q, th, psi, comps: C, twisted } : null;
}
/* q through a reduced matrix: q is reduced too (the physical q over the index) */
export const qThrough = (m, q) => { const nr = m[0] * q[0] + m[1], ni = m[0] * q[1], dr = m[2] * q[0] + m[3], di = m[2] * q[1], den = dr * dr + di * di; return [(nr * dr + ni * di) / den, (ni * dr - nr * di) / den]; };
/* ---------- A cavity whose parts turn the beam's axes ----------
   Its round trip is a 4x4 ray matrix M (symplectic): its eigenvalues come in pairs l, 1/l, so
   with s = l + 1/l they solve s^2 - tr(M) s + (b - 2) = 0, b = (tr(M)^2 - tr(M^2)) / 2. The loop is
   stable when both s are real and inside (-2, 2): l = e^{+-i theta}, theta each axis's round-trip
   Gouy phase. Its mode is Q = X Y^-1 from one eigenvector of each pair, [X; Y] (heights over
   reduced slopes), taken so that Im Q is positive: the beam confined */
const ev4 = m => {
  const A = m.m4 ? m.m4.A : [[m.x[0], 0], [0, m.y[0]]], C = m.m4 ? m.m4.C : [[m.x[2], 0], [0, m.y[2]]];
  const d = A[0][0] * A[1][1] - A[0][1] * A[1][0], D = [[A[1][1] / d, -A[1][0] / d], [-A[0][1] / d, A[0][0] / d]];
  return [[A[0][0], A[0][1], 0, 0], [A[1][0], A[1][1], 0, 0], [C[0][0], C[0][1], D[0][0], D[0][1]], [C[1][0], C[1][1], D[1][0], D[1][1]]];
};
const free4 = L => [[1, 0, L, 0], [0, 1, 0, L], [0, 0, 1, 0], [0, 0, 0, 1]];
const mul4 = (a, b) => a.map((r, i) => [0, 1, 2, 3].map(j => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j] + r[3] * b[3][j]));
function cav4Eigen(M) {
  const tr = M[0][0] + M[1][1] + M[2][2] + M[3][3], M2 = mul4(M, M), tr2 = M2[0][0] + M2[1][1] + M2[2][2] + M2[3][3];
  const b = 0.5 * (tr * tr - tr2), disc = tr * tr - 4 * (b - 2);
  if (!(disc >= -1e-12)) return { stable: false, s: null };
  const sq = Math.sqrt(Math.max(0, disc)), s = [0.5 * (tr + sq), 0.5 * (tr - sq)];
  if (!(Math.abs(s[0]) < 2 - 1e-12 && Math.abs(s[1]) < 2 - 1e-12)) return { stable: false, s };
  // the eigenvectors of l: the null space of M - l I, by elimination with pivoting (one vector,
  // or two where both axes share l, as in a loop that is round)
  const nullOf = l => {
    const N = M.map((r, i) => r.map((v, j) => i === j ? [v - l[0], -l[1]] : [v, 0])), piv = [], scale = Math.max(...M.flat().map(Math.abs), 1);
    let row = 0;
    for (let col = 0; col < 4 && row < 4; col++) {
      let best = row; for (let i = row + 1; i < 4; i++) if (Math.hypot(...N[i][col]) > Math.hypot(...N[best][col])) best = i;
      if (Math.hypot(...N[best][col]) < 1e-8 * scale) continue;
      [N[row], N[best]] = [N[best], N[row]];
      for (let i = 0; i < 4; i++) if (i !== row) { const f = cz.d(N[i][col], N[row][col]); for (let j = 0; j < 4; j++) N[i][j] = cz.s(N[i][j], cz.m(f, N[row][j])); }
      piv.push(col); row++;
    }
    const free = [0, 1, 2, 3].filter(c => !piv.includes(c));
    return free.map(fc => { const v = [[0, 0], [0, 0], [0, 0], [0, 0]]; v[fc] = [1, 0]; piv.forEach((pc, r) => { v[pc] = cz.r(cz.d(N[r][fc], N[r][pc]), -1); }); return v; });
  };
  const lam = si => { const c = si / 2, sn = Math.sqrt(Math.max(0, 1 - c * c)); return [[c, sn], [c, -sn]]; };
  const tryQ = (v1, v2) => {
    const X = [v1[0], v2[0], v1[1], v2[1]], Y = [v1[2], v2[2], v1[3], v2[3]], dY = ccDet(Y);
    if (!(Math.hypot(dY[0], dY[1]) > 1e-300)) return null;
    const Q = ccMul(X, ccInv(Y)), im = [Q[0][1], 0.5 * (Q[1][1] + Q[2][1]), Q[3][1]];
    if (!(im[0] > 0 && im[0] * im[2] - im[1] * im[1] > 0)) return null;
    const sym = cz.r(cz.a(Q[1], Q[2]), 0.5);
    return { stable: true, s, Q: [Q[0], sym, sym, Q[3]], theta: [Math.acos(s[0] / 2), Math.acos(s[1] / 2)] };
  };
  if (Math.abs(s[0] - s[1]) < 1e-7) {
    // both axes alike: one l with a plane of eigenvectors
    for (const l of lam(s[0])) { const V = nullOf(l); if (V.length >= 2) { const r = tryQ(V[0], V[1]); if (r) return r; } }
  }
  for (const a of lam(s[0])) for (const bq of lam(s[1])) {
    const V1 = nullOf(a), V2 = nullOf(bq);
    if (!V1.length || !V2.length) continue;
    const r = tryQ(V1[0], V2[0]); if (r) return r;
  }
  return { stable: false, s };
}
// the power coupling of two beams given as Q's at one plane: sqrt(det 2A1 det 2A2) / |det G|
function QOverlap(Q1, Q2, lam0) {
  const k = 2 * Math.PI / lam0, P1 = ccInv(Q1), P2 = ccInv(Q2);
  const A = P => [[-0.5 * k * P[0][1], -0.5 * k * P[1][1]], [-0.5 * k * P[2][1], -0.5 * k * P[3][1]]], d2 = M => 4 * (M[0][0] * M[1][1] - M[0][1] * M[1][0]);
  const G = [0, 1, 2, 3].map(i => cz.m([0, 0.5 * k], cz.s(P1[i], [P2[i][0], -P2[i][1]])));
  const dG = ccDet(G);
  return Math.sqrt(Math.max(0, d2(A(P1)) * d2(A(P2)))) / Math.hypot(dG[0], dG[1]);
}
// a small real linear system, null when singular (core/numeric.js), at the threshold a round trip's (I - M) needs
const solveLin = (A, b) => solveLinear(A, b, 1e-14);
/* The power coupling of two beams given as Q's at one plane, the first (a loop's mode) sitting
   off the second by a (mm, across and up) and tilted against it by t (radians): the overlap of
   the two fields, summed on a grid wide enough for both */
function QOverlapOff(Q1, Q2, a, t, lam0) {
  const k = 2 * Math.PI / lam0, P1 = ccInv(Q1), P2 = ccInv(Q2);
  // e^{-ik r.P r / 2}: its log amplitude and its phase (Im P = -2 / k w^2 along an axis)
  const u = (P, x, y) => [0.5 * k * (P[0][1] * x * x + (P[1][1] + P[2][1]) * x * y + P[3][1] * y * y), -0.5 * k * (P[0][0] * x * x + (P[1][0] + P[2][0]) * x * y + P[3][0] * y * y)];
  const wOf = P => Math.sqrt(2 / (k * Math.max(1e-30, Math.min(Math.abs(P[0][1]), Math.abs(P[3][1])))));
  const w = Math.max(wOf(P1), wOf(P2)), L = 5 * w + Math.hypot(a[0], a[1]), N = 160, d = 2 * L / N;
  let sr = 0, si = 0, n1 = 0, n2 = 0;
  for (let j = 0; j < N; j++) {
    const y = -L + (j + 0.5) * d;
    for (let i = 0; i < N; i++) {
      const x = -L + (i + 0.5) * d, [g1, p1] = u(P1, x - a[0], y - a[1]), [g2, p2] = u(P2, x, y);
      // (the first tilted by t, its light going as e^{-ikz}: e^{-ik t.r} on it)
      const A1 = Math.exp(g1), A2 = Math.exp(g2), ph = p2 - p1 + k * (t[0] * x + t[1] * y);
      sr += A1 * A2 * Math.cos(ph); si += A1 * A2 * Math.sin(ph); n1 += A1 * A1; n2 += A2 * A2;
    }
  }
  return (sr * sr + si * si) / (n1 * n2);
}
/* The self-consistent q of a round-trip matrix, or null if the loop is not stable */
function cavEigenQ(m) {
  const [A, B, C, D] = m, h = 0.5 * (A + D);
  if (!(Math.abs(h) < 1 - 1e-12) || Math.abs(C) < 1e-15) return null;
  const s = Math.sqrt(1 - h * h);
  return [(A - D) / (2 * C), s / Math.abs(C)];
}
/* Overlap of two 1D Gaussian beams given as reduced q, with the second offset by a and
   tilted by t (reduced slope), at one plane: the power coupling between them */
function gaussOverlap1(q1, q2, a, t, lam0) {
  const k = 2 * Math.PI / lam0, u = (q, x) => { const den = q[0] * q[0] + q[1] * q[1], ir = q[0] / den, ii = -q[1] / den; return [-k * x * x * ir / 2, k * x * x * ii / 2]; };
  const w = q => Math.sqrt(-lam0 / (Math.PI * (-q[1] / (q[0] * q[0] + q[1] * q[1]))));
  const L = 6 * Math.max(w(q1), w(q2)) + Math.abs(a), N = 4000;
  let sr = 0, si = 0, n1 = 0, n2 = 0;
  for (let i = 0; i < N; i++) {
    const x = -L + 2 * L * (i + 0.5) / N;
    const [p1, g1] = u(q1, x), [p2, g2] = u(q2, x - a);
    const A1 = Math.exp(g1), A2 = Math.exp(g2), ph = p2 - p1 - k * t * x;
    sr += A1 * A2 * Math.cos(ph); si += A1 * A2 * Math.sin(ph); n1 += A1 * A1; n2 += A2 * A2;
  }
  return (sr * sr + si * si) / (n1 * n2);
}
/* Every loop, one for each pilot tree it turns up in (an unpolarised source has two) */
const GHOST_TYPES = new Set(['lens', 'window', 'filter', 'waveplate', 'polariser', 'crystal', 'cell']);
const GHOST_KEEP = 0.5;          // a round trip keeping less of its light than this, inside one part: a ghost
function thinLoop(beams, path, hit, p) {
  const ids = new Set();
  for (let j = hit; j < hit + p; j++) {
    const ev = beams[path[j]].ev, el = ev && ev.surf && ev.surf.el;
    if (!el || !GHOST_TYPES.has(el.type)) return false;
    ids.add(el.id);
  }
  if (ids.size !== 1) return false;
  const a = beams[path[hit]], b = beams[path[hit + p]];
  const keep = a && b && a.w > 0 ? b.w / a.w : 1;
  return keep < GHOST_KEEP;
}
export function cavLoops(beams) {
  const kids = new Map(), found = new Map();
  beams.forEach((b, i) => { if (b.parent !== undefined && b.parent !== null && b.parent >= 0) { if (!kids.has(b.parent)) kids.set(b.parent, []); kids.get(b.parent).push(i); } });
  beams.forEach((b, i) => {
    if (kids.has(i)) return;
    const path = []; for (let j = i; j !== null && j !== undefined && j >= 0; j = beams[j].parent) path.unshift(j);
    const keys = path.map(j => cavKey(beams[j].ev));
    for (let p = 1; 2 * p <= keys.length; p++) {
      let hit = -1;
      for (let s0 = 1; s0 + 2 * p <= keys.length && hit < 0; s0++) {
        let ok = true;
        for (let j = 0; j < p && ok; j++) if (keys[s0 + j] !== keys[s0 + p + j] || keys[s0 + j] === 'src') ok = false;
        if (ok) hit = s0;
      }
      if (hit < 0) continue;
      const cyc = keys.slice(hit, hit + p);
      // the faces of one lens or window, uncoated: the light inside comes back weaker each time
      // round, a ghost and not a resonator. Solved as a cavity its mode would stand in for the
      // beam going through (a 3 mm cavity's narrow waist after a germanium lens, say); a coated
      // solid etalon, keeping most of its light each round, is a cavity still.
      if (thinLoop(beams, path, hit, p)) break;
      let canon = null; for (let r = 0; r < p; r++) { const c = cyc.slice(r).concat(cyc.slice(0, r)).join('|'); if (canon === null || c < canon) canon = c; }
      // one loop for each way into it: a modulator's sidebands or a grating's orders each enter the
      // same cavity on a branch of their own, and each is solved on its own
      const key = canon + '#' + path[hit];
      // the path that stays in the loop longest: it has the round trips the losses are read from
      let reps = 0; while (hit + (reps + 1) * p <= keys.length && keys.slice(hit + reps * p, hit + (reps + 1) * p).join('|') === cyc.join('|')) reps++;
      const had = found.get(key);
      if (!had || reps > had.reps) found.set(key, { canon, path, s: hit, p, kids, reps });
      break;
    }
  });
  return [...found.values()];
}
export function findCavities() {
  if (cavCache && cavCache.trace === lastTrace) return cavCache.list;
  const beams = (lastTrace && lastTrace.beams) || [];
  const best = new Map();
  for (const L of cavLoops(beams)) { const had = best.get(L.canon); if (!had || L.reps > had.reps) best.set(L.canon, L); }
  const list = [];
  let letter = 0;
  for (const [canon, f] of best) {
    const c = cavAnalyse(f.path.map(j => beams[j]), f.s, f.p, beams);
    if (!c) continue;
    c.id = canon; c.name = 'Cavity ' + String.fromCharCode(65 + letter++);
    list.push(c);
  }
  cavCache = { trace: lastTrace, list };
  return list;
}
function cavAnalyse(path, s, p, beams) {
  const B = path.slice(s, s + p), lam0 = B[0].nm * 1e-6, c0 = 299792458;
  // the events that start each loop segment; the loop closes on B[0]'s own event
  const evs = B.map(b => b.ev);
  const mats = evs.map(ev => cavEventABCD(ev, lam0));
  if (mats.some(m => !m)) return null;
  // round trip from just after the first event, back to the same place
  const plane = ax => {
    let M = [1, 0, 0, 1];
    for (let j = 0; j < p; j++) {
      M = mmul(mfree(B[j].len, B[j].n), M);
      M = mmul(mats[(j + 1) % p][ax], M);
    }
    return M;
  };
  const Mx = plane('x'), My = plane('y');
  // a loop with a part turned out of the plane: its 4x4 round trip (see cav4Eigen)
  const gen4 = mats.some(m => m.m4) || evs.some(ev => ev && ev.surf && ev.surf.tilt);
  let E4 = null;
  if (gen4) {
    let M = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    for (let j = 0; j < p; j++) { M = mul4(free4((B[j].len3 || B[j].len) / B[j].n), M); M = mul4(ev4(mats[(j + 1) % p]), M); }
    E4 = Object.assign(cav4Eigen(M), { M });
  }
  const Lopt = B.reduce((a, b) => a + b.n * (b.len3 || b.len), 0), fsr = c0 / (Lopt * 1e-3);
  // the surfaces, in order, and whether it is a standing (linear) or travelling (ring) loop
  const retro = evs.filter(ev => ev && ev.dOut && ev.dIn[0] * ev.dOut[0] + ev.dIn[1] * ev.dOut[1] < -0.999).length;
  const kind = retro >= 2 ? 'linear' : 'ring';
  const names = evs.map(ev => ev ? (getEl(ev.el) || {}).name : '?');
  // losses: the pilot's own Jones vector a round trip on, which includes everything
  const pow = b => b.J[0] ** 2 + b.J[1] ** 2 + b.J[2] ** 2 + b.J[3] ** 2;
  const same = (a, b) => a && b && cavKey(a.ev) === cavKey(b.ev);
  const next = same(path[s + p], B[0]) ? path[s + p] : null, next2 = next && same(path[s + 2 * p], B[0]) ? path[s + 2 * p] : null;
  let rho = next ? Math.sqrt(pow(next) / pow(B[0])) : null;
  if (next2) rho = Math.sqrt(pow(next2) / pow(next));          // nearer the loop's own polarisation
  const finesse = rho && rho < 1 ? Math.PI * Math.sqrt(rho) / (1 - rho) : null;
  // the closed axis: the pilot misses itself by delta after one round trip; the ray that
  // does not is v = (1 - M)^-1 delta, in the bench plane (height, n x slope) at the start
  let axis = null;
  if (next) {
    const d0 = [B[0].dx, B[0].dy], ex = [-d0[1], d0[0]];
    const dxp = next.x0 - B[0].x0, dyp = next.y0 - B[0].y0;
    const dh = dxp * ex[0] + dyp * ex[1], dt = B[0].n * (d0[0] * next.dy - d0[1] * next.dx);
    const a = 1 - Mx[0], b = -Mx[1], cc = -Mx[2], d = 1 - Mx[3], det = a * d - b * cc;
    if (Math.abs(det) > 1e-12) axis = { h: (d * dh - b * dt) / det, t: (-cc * dh + a * dt) / det, miss: Math.hypot(dh, dt) };
  }
  // out of the plane (a part tipped or rolled): the closed axis from the 4x4 round trip, across
  // and up the beam (v is up), from the pilot's miss both ways
  if (E4 && next) {
    const m = cavMiss(B[0], next), n0 = B[0].n, d = [m.dx, m.dy, n0 * m.tx, n0 * m.ty];
    const A = E4.M.map((r, i) => r.map((v, j) => (i === j ? 1 : 0) - v)), v = solveLin(A, d);
    if (v) axis = { h: v[0], v: v[1], t: v[2], tv: v[3], miss: Math.hypot(d[0], d[1], d[2], d[3]) };
  } else if (axis) Object.assign(axis, { v: 0, tv: 0 });
  // alignment: how far the closed axis moves, at the loop's start, as each mirror in it is turned
  // across or tipped up. Either kicks the light leaving it by twice the angle; carried round the
  // rest of the loop, d, the axis moves by (1 - M)^-1 d
  const sens = [];
  {
    const E = mats.map(m => ev4(m)), F = B.map(b => free4((b.len3 || b.len) / b.n));
    let Mr = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    for (let j = 0; j < p; j++) { Mr = mul4(F[j], Mr); Mr = mul4(E[(j + 1) % p], Mr); }
    const I_M = Mr.map((r, i) => r.map((v, j) => (i === j ? 1 : 0) - v));
    for (let e = 0; e < p; e++) {
      const ev = evs[e], el = ev && getEl(ev.el);
      if (!el || el.type !== 'mirror') continue;
      // the rest of the loop after this event: the steps after the one that ends at it
      const jAt = (e - 1 + p) % p;
      let Rest = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
      for (let j = jAt + 1; j < p; j++) { Rest = mul4(F[j], Rest); Rest = mul4(E[(j + 1) % p], Rest); }
      const n = B[(jAt + 1) % p].n, kick = i => { const k = [0, 0, 0, 0]; k[i] = 2 * n; const d = Rest.map(r => r[0] * k[0] + r[1] * k[1] + r[2] * k[2] + r[3] * k[3]); return solveLin(I_M, d); };
      const a = kick(2), b = kick(3);
      if (a && b) sens.push({ name: el.name, turn: Math.hypot(a[0], a[1]), tip: Math.hypot(b[0], b[1]) });
    }
  }
  // the Gaussian mode in each plane, and along the loop
  const qx = cavEigenQ(Mx), qy = cavEigenQ(My);
  const wOf = q => Math.sqrt(-lam0 / (Math.PI * (-q[1] / (q[0] * q[0] + q[1] * q[1]))));
  const along = [];
  let waists = [];
  if (qx && qy) {
    let ax = qx, ay = qy;
    for (let j = 0; j < p; j++) {
      const L = B[j].len, n = B[j].n;
      along.push({ name: names[j], wx: wOf(ax), wy: wOf(ay), qx: ax, qy: ay, len: L, n, b: B[j] });
      for (const [q, pl] of [[ax, 'x'], [ay, 'y']]) {
        const t = -q[0] * n;                                  // physical distance to the waist
        if (t >= 0 && t <= L) waists.push({ plane: pl, seg: j, at: t, w0: Math.sqrt(lam0 * q[1] / Math.PI), after: names[j] });
      }
      ax = qThrough(mats[(j + 1) % p].x, qThrough(mfree(L, n), ax)); ay = qThrough(mats[(j + 1) % p].y, qThrough(mfree(L, n), ay));
    }
  }
  if (E4 && E4.stable) {
    // the mode along the loop from Q: its widths along its own axes, and the q's along them
    along.length = 0; waists = [];
    let Q = E4.Q;
    for (let j = 0; j < p; j++) {
      const L = B[j].len3 || B[j].len, n = B[j].n, [qa, qb] = QEig(Q), P = ccInv(Q), a = -P[0][1], b2 = -P[1][1], c = -P[3][1];
      const m1 = 0.5 * (a + c) + Math.hypot(0.5 * (a - c), b2), m2 = 0.5 * (a + c) - Math.hypot(0.5 * (a - c), b2), k = 2 * Math.PI / lam0;
      along.push({ name: names[j], wx: Math.sqrt(2 / (k * m2)), wy: Math.sqrt(2 / (k * m1)), qx: qa, qy: qb, Q, angle: 0.5 * Math.atan2(2 * b2, a - c), len: L, n, b: B[j] });
      for (const [q, pl] of [[qa, 'a'], [qb, 'b']]) { const t = -q[0] * n; if (t >= 0 && t <= L) waists.push({ plane: pl, seg: j, at: t, w0: Math.sqrt(lam0 * q[1] / Math.PI), after: names[j] }); }
      Q = QThroughEvent(mats[(j + 1) % p], QFree(Q, L / n));
    }
  } else if (E4) { along.length = 0; waists = []; }
  const gouy = m => { const h = 0.5 * (m[0] + m[3]); return Math.abs(h) <= 1 ? Math.sign(m[1] || 1) * Math.acos(h) : null; };
  const gx = E4 ? (E4.stable ? E4.theta[0] : null) : gouy(Mx), gy = E4 ? (E4.stable ? E4.theta[1] : null) : gouy(My);
  const tms = g => g === null ? null : ((g / (2 * Math.PI)) % 1 + 1) % 1 * fsr;
  // how the light gets in: the branch into the loop just before it starts repeating
  const entry = s >= 1 ? path[s - 1] : null, before = s >= 2 ? path[s - 2] : null;
  const Tin = entry && before && entry.ev && pow(before) > 0 ? pow(entry) / pow(before) : null;
  const buildup = Tin !== null && rho !== null ? Tin / ((1 - rho) ** 2) : null;
  // mode matching: the input beam carried to the loop by the same matrices, against the mode
  let match = null;
  if (E4 && E4.stable && entry) {
    // the input carried to the loop's start by the same matrices, against the mode there
    const root = path[0], q0 = [root.qr / root.n, root.qi / root.n];
    let Qi = [q0, [0, 0], [0, 0], q0];
    for (let j = 0; j < s && Qi; j++) {
      const b = path[j], m = cavEventABCD(path[j + 1].ev, lam0);
      Qi = m ? QThroughEvent(m, QFree(Qi, (b.len3 || b.len) / b.n)) : null;
    }
    // the input rides the pilot; the loop's mode sits on its closed axis, off it both ways
    if (Qi) { const eta = axis && axis.miss > 1e-9 ? QOverlapOff(E4.Q, Qi, [axis.h, axis.v], [axis.t / B[0].n, axis.tv / B[0].n], lam0) : QOverlap(E4.Q, Qi, lam0); match = { x: null, y: null, total: eta }; }
  } else if (!E4 && qx && qy && entry) {
    const root = path[0], q0 = [root.qr / root.n, root.qi / root.n];
    let ix = q0, iy = q0;
    for (let j = 0; j < s; j++) {
      const b = path[j];
      ix = qThrough(mfree(b.len, b.n), ix); iy = qThrough(mfree(b.len, b.n), iy);
      const m = cavEventABCD(path[j + 1].ev, lam0);
      if (!m) { ix = null; break; }
      ix = qThrough(m.x, ix); iy = qThrough(m.y, iy);
    }
    // the entry segment is the loop's last one, heading the same way: compare at its start
    if (ix) {
      const jE = p - 1, cx = along[jE] ? along[jE].qx : null, cy = along[jE] ? along[jE].qy : null;
      // back up the input one step: ix is just after the loop's first event; take it back to the entry plane
      const back = (q, m, L, n) => { const a = m[3], b = -m[1], c = -m[2], d = m[0]; return qThrough(mfree(-L, n), qThrough([a, b, c, d], q)); };
      const ex = back(ix, mats[0].x, B[jE].len, B[jE].n), ey = back(iy, mats[0].y, B[jE].len, B[jE].n);
      if (cx && cy) {
        // the input rides the pilot; the loop's axis sits off it by the closed axis, carried back
        let h = 0, t = 0;
        if (axis) { const m = mats[0].x, inv = [m[3], -m[1], -m[2], m[0]], v = [inv[0] * axis.h + inv[1] * axis.t, inv[2] * axis.h + inv[3] * axis.t]; h = v[0] - B[jE].len / B[jE].n * v[1]; t = v[1]; }
        match = { x: gaussOverlap1(cx, ex, h, t, lam0), y: gaussOverlap1(cy, ey, 0, 0, lam0) };
        match.total = match.x * match.y;
      }
    }
  }
  const stab = m => { const h = 0.5 * (m[0] + m[3]); return Math.abs(Math.abs(h) - 1) < 1e-9 ? 'marginal' : Math.abs(h) < 1 ? 'stable' : 'unstable'; };
  return {
    kind, names, surfaces: evs.map(ev => ev && ev.el), p, Mx, My, M4: E4 ? E4.M : null,
    stability: E4 ? (E4.s ? { x: Math.abs(E4.s[0]) < 2 ? 'stable' : 'unstable', y: Math.abs(E4.s[1]) < 2 ? 'stable' : 'unstable', hx: E4.s[0] / 2, hy: E4.s[1] / 2, turned: true }
      : { x: 'unstable', y: 'unstable', hx: NaN, hy: NaN, turned: true }) : { x: stab(Mx), y: stab(My), hx: 0.5 * (Mx[0] + Mx[3]), hy: 0.5 * (My[0] + My[3]) },
    Lopt, fsr, rho, finesse, linewidth: finesse ? fsr / finesse : null, buildup, Tin, sens,
    gouy: { x: gx, y: gy }, tms: { x: tms(gx), y: tms(gy) }, mode: { qx: E4 && E4.stable ? along[0] && along[0].qx : qx, qy: E4 && E4.stable ? along[0] && along[0].qy : qy, Q: E4 && E4.stable ? E4.Q : null, along, waists }, axis, match, lam0, segs: B,
  };
}

/* ---------- Cavities: the steady state ----------
   The field round a loop is the injected field plus every round trip of it: the sum is
   solved rather than added up. The round trip T is the field's own steps, surface by surface
   and leg by leg, with each surface's grid and pilot fixed from the first pass so that T is
   one linear operator on one grid. A Krylov space built from the injected field b holds the
   answer for every detuning at once: (1 - e^{i delta} T) x = b is solved in it by least
   squares, for as many detunings as a scan needs, from one set of round trips. */
export const cavSolved = new Map();          // cavity id -> its latest steady state and scan
export const cavRunCache = new WeakMap();    // trace -> solved loops, so the twin and screen runs reuse them
const cavC = { mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]], conj: a => [a[0], -a[1]], abs2: a => a[0] * a[0] + a[1] * a[1] };
export function cavWeights(F) {
  if (F.ax) return null;
  const Q = qdht(F.re.length), V = Q.S / (2 * Math.PI * F.R), w = new Float64Array(Q.N);
  for (let i = 0; i < Q.N; i++) w[i] = Q.inv[i] / (Math.PI * V * V);
  return w;
}
export function cavDot(F, G, w) {
  let r = 0, im = 0;
  if (F.ax) {
    for (const [kr, ki] of fieldComps(F)) { const a = F[kr], b = F[ki], c = G[kr], d = G[ki]; for (let i = 0; i < a.length; i++) { r += a[i] * c[i] + b[i] * d[i]; im += a[i] * d[i] - b[i] * c[i]; } }
    const dA = F.ax.d * F.ax.d === 0 ? 1 : F.ax.d * F.ay.d; return [r * dA, im * dA];
  }
  for (let i = 0; i < F.re.length; i++) { r += (F.re[i] * G.re[i] + F.im[i] * G.im[i]) * w[i]; im += (F.re[i] * G.im[i] - F.im[i] * G.re[i]) * w[i]; }
  return [r, im];
}
export function cavLin(F, terms) {                           // sum of c_k F_k, onto F's grid
  const out = Object.assign({}, F);
  for (const [kr, ki] of (F.ax ? fieldComps(F) : [['re', 'im']])) {
    const R = new Float64Array(F[kr].length), I = new Float64Array(F[kr].length);
    for (const [c, G] of terms) { const a = G[kr], b = G[ki]; for (let i = 0; i < R.length; i++) { R[i] += c[0] * a[i] - c[1] * b[i]; I[i] += c[0] * b[i] + c[1] * a[i]; } }
    out[kr] = R; out[ki] = I;
  }
  return out;
}
/* A field held against its own pilot, rewritten against another's: the same light, the
   residual carrying the difference of the two reference phases, so fields from different
   round trips live in one space and can be added */
function cavReref(G, F) {
  const k = 2 * Math.PI * G.n / G.lam0, out = Object.assign({}, G);
  if (G.ax) {
    const N = G.N, ref = (st, x) => popInside(st.z, st.zR) ? 0 : -k * x * x / (2 * st.z);
    out.ax = Object.assign({}, G.ax, { z: F.ax.z, zR: F.ax.zR }); out.ay = Object.assign({}, G.ay, { z: F.ay.z, zR: F.ay.zR });
    for (const [kr, ki] of fieldComps(G)) {
      const R = new Float64Array(G[kr]), I = new Float64Array(G[ki]);
      for (let j = 0; j < N; j++) {
        const y = (j - N / 2) * G.ay.d, py = ref(G.ay, y) - ref(F.ay, y);
        for (let i = 0; i < N; i++) {
          const o = j * N + i; if (R[o] === 0 && I[o] === 0) continue;
          const x = (i - N / 2) * G.ax.d, ph = ref(G.ax, x) - ref(F.ax, x) + py, c = Math.cos(ph), s = Math.sin(ph), a = R[o];
          R[o] = a * c - I[o] * s; I[o] = a * s + I[o] * c;
        }
      }
      out[kr] = R; out[ki] = I;
    }
    return out;
  }
  const r = popRadii(qdht(G.re.length), G.R), ref = (P, x) => P.sphere ? -k * x * x / (2 * P.z) : 0;
  const R = new Float64Array(G.re), I = new Float64Array(G.im);
  for (let i = 0; i < R.length; i++) { const ph = ref(G, r[i]) - ref(F, r[i]), c = Math.cos(ph), s = Math.sin(ph), a = R[i]; R[i] = a * c - I[i] * s; I[i] = a * s + I[i] * c; }
  return Object.assign(out, { re: R, im: I, z: F.z, zR: F.zR, sphere: F.sphere });
}
/* How far a loop's pilot misses itself after one round trip: the start of its next pass (B1)
   against its first (B0), across and up the beam (the 2D field's own axes, see beamAxes) and
   in slope, in mm. A misaligned loop's axis is not its pilot's: each round trip the light
   comes back that far off, which is how a tilted or tipped mirror walks the field. */
export function cavMiss(B0, B1) {
  if (!B0 || !B1) return null;
  const dir = b => { const d = b.d3 || [b.dx, b.dy, b.uz || 0], l = Math.hypot(d[0], d[1], d[2]); return [d[0] / l, d[1] / l, d[2] / l]; };
  const d0 = dir(B0), d1 = dir(B1), [ex, ey] = beamAxes(d0);
  const D = [B1.x0 - B0.x0, B1.y0 - B0.y0, (B1.z0 || 0) - (B0.z0 || 0)];
  // back along the ray to the first pass's plane, square to it
  const t = vdot3(D, d0), P = [D[0] - t * d1[0], D[1] - t * d1[1], D[2] - t * d1[2]];
  const m = { dx: vdot3(P, ex), dy: vdot3(P, ey), tx: vdot3(d1, ex), ty: vdot3(d1, ey) };
  m.size = Math.hypot(m.dx, m.dy) + 1e3 * Math.hypot(m.tx, m.ty);
  return m;
}
/* A 2D field moved across its grid by (dx, dy) and tilted by (tx, ty), its light going as
   e^{-ikz}: the field the next pass brings, put back into the first pass's frame */
function cavShift(G, m) {
  const N = G.N, k = 2 * Math.PI * G.n / G.lam0, out = Object.assign({}, G);
  const ref = (st, x) => popInside(st.z, st.zR) ? 0 : -k * x * x / (2 * st.z);
  // moved by the Fourier shift theorem, exact for a field well inside its grid (interpolating
  // instead loses a little each round trip, which a cavity of high finesse adds up)
  const sx = m.dx / G.ax.d, sy = m.dy / G.ay.d;
  const ramp = s0 => { const c = new Float64Array(N), sn = new Float64Array(N); for (let q = 0; q < N; q++) { const f = q < N / 2 ? q : q === N / 2 ? 0 : q - N, a = -2 * Math.PI * f * s0 / N; c[q] = Math.cos(a) / N; sn[q] = Math.sin(a) / N; } if (s0 !== Math.round(s0)) { c[N / 2] = Math.cos(Math.PI * s0) / N; sn[N / 2] = 0; } else { c[N / 2] = Math.cos(Math.PI * s0) / N; sn[N / 2] = 0; } return [c, sn]; };
  const [cx0, sx0] = ramp(sx), [cy0, sy0] = ramp(sy), lr = new Float64Array(N), li = new Float64Array(N);
  const line = (R, I, at, stride, c, sn) => {
    for (let q = 0; q < N; q++) { lr[q] = R[at + q * stride]; li[q] = I[at + q * stride]; }
    fft(lr, li, -1);
    for (let q = 0; q < N; q++) { const a = lr[q], b = li[q]; lr[q] = a * c[q] - b * sn[q]; li[q] = a * sn[q] + b * c[q]; }
    fft(lr, li, 1);
    for (let q = 0; q < N; q++) { R[at + q * stride] = lr[q]; I[at + q * stride] = li[q]; }
  };
  for (const [kr, ki] of fieldComps(G)) {
    const R = new Float64Array(G[kr]), I = new Float64Array(G[ki]);
    if (sx) for (let j = 0; j < N; j++) line(R, I, j * N, 1, cx0, sx0);
    if (sy) for (let i = 0; i < N; i++) line(R, I, i, N, cy0, sy0);
    for (let j = 0; j < N; j++) {
      const y = (j - N / 2) * G.ay.d, ys = y - m.dy;
      for (let i = 0; i < N; i++) {
        const o = j * N + i; if (R[o] === 0 && I[o] === 0) continue;
        // the stored field is the light less its reference curvature: moved, that is taken back
        // off where it came from and put on where it lands; then the tilt about where it lands
        const x = (i - N / 2) * G.ax.d, xs = x - m.dx;
        const ph = ref(G.ax, xs) - ref(G.ax, x) + ref(G.ay, ys) - ref(G.ay, y) - k * (m.tx * xs + m.ty * ys), c = Math.cos(ph), sn = Math.sin(ph), a = R[o];
        R[o] = a * c - I[o] * sn; I[o] = a * sn + I[o] * c;
      }
    }
    out[kr] = R; out[ki] = I;
  }
  return out;
}
/* v -= c q, in place (v's own arrays: v is always a fresh round trip's output) */
function cavSubInPlace(v, c, q) {
  for (const [kr, ki] of (v.ax ? fieldComps(v) : [['re', 'im']])) {
    const R = v[kr], I = v[ki], a = q[kr], b = q[ki];
    for (let i = 0; i < R.length; i++) { R[i] -= c[0] * a[i] - c[1] * b[i]; I[i] -= c[0] * b[i] + c[1] * a[i]; }
  }
}
/* The round trip, from the loop's reference plane (just after its first surface) back to it */
function* cavRoundTrip(ctx, F) {
  let cur = F;
  for (const st of ctx.steps) {
    const leg = ctx.eng === '2d' ? popLeg2(cur) : popLeg(cur), Fend = leg.at(st.len);
    let out;
    if (ctx.eng === '2d') out = popSurface2(Fend, st.ev, 1, false, st.tNext, Object.assign({}, st.pol, st.decision ? { fixed: st.decision } : {}));
    else out = popSurface(Fend, [Fend.z, Fend.zR], { A: st.ev.A, C: st.ev.C, D: st.ev.D, n2: st.ev.n2, a: popClear(st.ev), gain: 1, raw: st.ev, tNext: st.tNext,
      disc: st.ev.mask && st.ev.mask.shape === 'disc' ? st.ev.mask.a : null, fixed: st.decision || undefined });
    if (!st.decision) st.decision = out.decision;
    cur = out.field;
    yield;
  }
  cur = cavReref(cur, F);
  if (ctx.miss) cur = cavShift(cur, ctx.miss);
  const g = ctx.gamma ? [ctx.gamma[0] * (ctx.norm || 1), ctx.gamma[1] * (ctx.norm || 1)] : ctx.norm && ctx.norm !== 1 ? [ctx.norm, 0] : null;
  return g ? cavLin(cur, [[g, cur]]) : cur;
}
/* Least squares for (Ibar - z Hbar) y = beta e1, small and complex, by Givens rotations */
export function cavLS(H, m, beta, z) {
  const A = [];
  for (let i = 0; i <= m; i++) { A.push([]); for (let j = 0; j < m; j++) { const hz = cavC.mul(z, H[i][j] || [0, 0]); A[i].push([(i === j ? 1 : 0) - hz[0], -hz[1]]); } }
  const g = []; for (let i = 0; i <= m; i++) g.push([i === 0 ? beta : 0, 0]);
  for (let j = 0; j < m; j++) {
    const a = A[j][j], b = A[j + 1][j], r = Math.sqrt(cavC.abs2(a) + cavC.abs2(b));
    if (r === 0) continue;
    const c = [a[0] / r, -a[1] / r], s = [b[0] / r, -b[1] / r];         // rotation rows: [c s; -conj(s) conj(c)]
    for (let k = j; k < m; k++) {
      const u = A[j][k], v = A[j + 1][k];
      A[j][k] = [cavC.mul(c, u)[0] + cavC.mul(s, v)[0], cavC.mul(c, u)[1] + cavC.mul(s, v)[1]];
      const cs = cavC.conj(s), cc = cavC.conj(c);
      A[j + 1][k] = [-cavC.mul(cs, u)[0] + cavC.mul(cc, v)[0], -cavC.mul(cs, u)[1] + cavC.mul(cc, v)[1]];
    }
    const u = g[j], v = g[j + 1];
    g[j] = [cavC.mul(c, u)[0] + cavC.mul(s, v)[0], cavC.mul(c, u)[1] + cavC.mul(s, v)[1]];
    const cs = cavC.conj(s), cc = cavC.conj(c);
    g[j + 1] = [-cavC.mul(cs, u)[0] + cavC.mul(cc, v)[0], -cavC.mul(cs, u)[1] + cavC.mul(cc, v)[1]];
  }
  const y = new Array(m).fill(null).map(() => [0, 0]);
  for (let i = m - 1; i >= 0; i--) {
    let t = [g[i][0], g[i][1]];
    for (let k = i + 1; k < m; k++) { const p = cavC.mul(A[i][k], y[k]); t = [t[0] - p[0], t[1] - p[1]]; }
    const d = A[i][i], dd = cavC.abs2(d) || 1e-300;
    y[i] = [(t[0] * d[0] + t[1] * d[1]) / dd, (t[1] * d[0] - t[0] * d[1]) / dd];
  }
  return y;
}
/* The steady state of one loop from its injected field b, and its resonance scan */
/* the steady state's amplitudes in the Krylov space, and the circulating power, at a detuning */
export const cavAtOf = (H, m, beta) => delta => { const y = cavLS(H, m, beta, [Math.cos(delta), Math.sin(delta)]); return { y, P: y.reduce((a, c) => a + cavC.abs2(c), 0) }; };
export function* cavSteady(inst, beams, b, decision0, eng) {
  const { path, s, p } = inst;
  const steps = [];
  for (let j = 0; j < p; j++) {
    const Bj = beams[path[s + j]], nx = beams[path[s + j + 1]];
    steps.push({ len: Bj.len, ev: nx.ev, tNext: nx.len, pol: { Jin: Bj.J, Jout: nx.J, parIn: Bj.par, parOut: nx.par }, decision: j === p - 1 ? decision0 : null });
  }
  // the round engine's profile has unit power; the tracer's Jones vector carries the round
  // trip's complex factor, which the field convention takes conjugated
  let gamma = null;
  if (eng !== '2d') {
    const J0 = beams[path[s]].J, Jr = beams[path[s + p]].J, n0 = J0[0] ** 2 + J0[1] ** 2 + J0[2] ** 2 + J0[3] ** 2;
    const t = [(J0[0] * Jr[0] + J0[1] * Jr[1] + J0[2] * Jr[2] + J0[3] * Jr[3]) / n0, (J0[0] * Jr[1] - J0[1] * Jr[0] + J0[2] * Jr[3] - J0[3] * Jr[2]) / n0];
    gamma = [t[0], -t[1]];
  }
  // a loop whose pilot misses itself: the field walks with it each round trip (only the 2D field can)
  const miss = eng === '2d' ? cavMiss(beams[path[s]], beams[path[s + p]]) : null;
  const ctx = { eng, steps, gamma, miss: miss && miss.size > 1e-9 ? miss : null };
  // a first round trip settles every surface's grid
  const gSave = ctx.gamma; ctx.gamma = null;
  const Tb = yield* cavRoundTrip(ctx, b);
  ctx.gamma = gSave;
  const w = cavWeights(b), norm = F => Math.sqrt(cavDot(F, F, w)[0]);
  // Where nothing in the loop cuts the beam, the tracer knows exactly what power a round
  // trip keeps (its Jones vectors; on the round engine that is all in gamma, and the
  // profile keeps everything). Resampling at each surface is good to about 1e-4, which
  // matters once a cavity's round-trip loss is that small, so the whole operator is scaled
  // by one constant to keep exactly that power for the injected field, which is nearly the
  // cavity's own mode. Where something does cut the beam, its loss is real and is left be.
  if (steps.every(st => st.decision && !st.decision.clipped && st.ev.mode !== 'M')) {
    const got = cavDot(Tb, Tb, w)[0] / cavDot(b, b, w)[0];
    const J0 = beams[path[s]].J, Jr = beams[path[s + p]].J, pw = J => J[0] ** 2 + J[1] ** 2 + J[2] ** 2 + J[3] ** 2;
    const want = eng === '2d' ? pw(Jr) / pw(J0) : 1;
    if (got > 0 && want > 0) ctx.norm = Math.sqrt(want / got);
  }
  const beta = norm(b);
  if (!(beta > 0)) return null;
  const Q = [cavLin(b, [[[1 / beta, 0], b]])], H = [];
  // (a misaligned loop's light is spread over several of its modes: it needs more of them)
  const mMax = eng === '2d' ? (ctx.miss ? 40 : 20) : 40;
  let m = 0;
  for (let k = 0; k < mMax; k++) {
    let v = yield* cavRoundTrip(ctx, Q[k]);
    v = cavLin(v, [[[1, 0], v]]);                     // its own copy, to work on in place
    H.push(new Array(mMax).fill(null));
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i <= k; i++) {
      const hik = cavDot(Q[i], v, w);
      H[i] = H[i] || new Array(mMax).fill(null);
      H[i][k] = H[i][k] ? [H[i][k][0] + hik[0], H[i][k][1] + hik[1]] : hik;
      cavSubInPlace(v, hik, Q[i]);
    }
    const hn = norm(v);
    H[k + 1] = H[k + 1] || new Array(mMax).fill(null);
    H[k + 1][k] = [hn, 0];
    m = k + 1;
    if (hn < 1e-9 * beta) break;
    Q.push(cavLin(v, [[[1 / hn, 0], v]]));
  }
  const at = cavAtOf(H, m, beta);
  // the scan over one free spectral range, and its strongest resonance found finely
  const nS = 2048, scan = new Float64Array(nS);
  let kBest = 0;
  for (let i = 0; i < nS; i++) { scan[i] = at(-Math.PI + 2 * Math.PI * i / nS).P; if (scan[i] > scan[kBest]) kBest = i; }
  let lo = -Math.PI + 2 * Math.PI * (kBest - 1) / nS, hi = -Math.PI + 2 * Math.PI * (kBest + 1) / nS;
  for (let it = 0; it < 60; it++) { const a = lo + (hi - lo) * 0.382, c = lo + (hi - lo) * 0.618; if (at(a).P > at(c).P) hi = c; else lo = a; }
  const dLock = 0.5 * (lo + hi);
  return { ctx, Q, H, m, beta, at, scan, dLock, P0: at(0).P, Plock: at(dLock).P };
}

/* ---------- Cavities: their own modes (Fox and Li) ----------
   The Krylov space the steady state is solved in holds the round trip's leading modes: the
   eigenvalues of its small matrix H (Ritz values) are their round-trip factors (loss and
   frequency), its eigenvectors, laid over the Krylov fields, their shapes. For a cavity cut
   by its mirrors' edges this is Fox and Li's iteration, done all at once. */
export const cx = { add: (a, b) => [a[0] + b[0], a[1] + b[1]], sub: (a, b) => [a[0] - b[0], a[1] - b[1]], mul: cavC.mul,
  div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1] || 1e-300; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
  abs: a => Math.hypot(a[0], a[1]), sqrt: a => { const r = Math.hypot(a[0], a[1]), t = Math.atan2(a[1], a[0]) / 2, s = Math.sqrt(r); return [s * Math.cos(t), s * Math.sin(t)]; } };
/* Eigenvalues of a small complex upper Hessenberg matrix, by the shifted QR algorithm */
function hessEig(H0, m) {
  const A = []; for (let i = 0; i < m; i++) { A.push([]); for (let j = 0; j < m; j++) A[i].push(H0[i] && H0[i][j] ? [H0[i][j][0], H0[i][j][1]] : [0, 0]); }
  const eig = [];
  let n = m - 1, iter = 0;
  while (n >= 0) {
    if (n === 0) { eig.push(A[0][0]); break; }
    // deflate where a subdiagonal is negligible
    let l = n;
    while (l > 0 && cx.abs(A[l][l - 1]) > 1e-14 * (cx.abs(A[l][l]) + cx.abs(A[l - 1][l - 1]))) l--;
    if (l === n) { eig.push(A[n][n]); n--; iter = 0; continue; }
    if (++iter > 200) { for (let i = n; i >= 0; i--) eig.push(A[i][i]); break; }
    // Wilkinson shift from the trailing 2x2
    const a = A[n - 1][n - 1], b = A[n - 1][n], c = A[n][n - 1], d = A[n][n];
    const tr = cx.add(a, d), det = cx.sub(cx.mul(a, d), cx.mul(b, c));
    const disc = cx.sqrt(cx.sub(cx.mul(tr, tr), [4 * det[0], 4 * det[1]]));
    const e1 = [(tr[0] + disc[0]) / 2, (tr[1] + disc[1]) / 2], e2 = [(tr[0] - disc[0]) / 2, (tr[1] - disc[1]) / 2];
    const mu = iter % 11 === 10 ? cx.add(d, [cx.abs(c), 0]) : (cx.abs(cx.sub(e1, d)) < cx.abs(cx.sub(e2, d)) ? e1 : e2);
    // one QR step on the active block l..n, by Givens rotations
    for (let i = l; i <= n; i++) A[i][i] = cx.sub(A[i][i], mu);
    const rots = [];
    for (let k = l; k < n; k++) {
      const x = A[k][k], y = A[k + 1][k], r = Math.hypot(cx.abs(x), cx.abs(y)) || 1e-300;
      const cc = [x[0] / r, -x[1] / r], ss = [y[0] / r, -y[1] / r];
      rots.push([cc, ss]);
      for (let j = k; j < m; j++) {
        const u = A[k][j], v = A[k + 1][j];
        A[k][j] = cx.add(cx.mul(cc, u), cx.mul(ss, v));
        A[k + 1][j] = cx.sub(cx.mul([cc[0], -cc[1]], v), cx.mul([ss[0], -ss[1]], u));
      }
    }
    for (let k = l; k < n; k++) {
      const [cc, ss] = rots[k - l];
      for (let i = 0; i <= Math.min(k + 2, n); i++) {
        const u = A[i][k], v = A[i][k + 1];
        // times the rotation's conjugate transpose from the right
        A[i][k] = cx.add(cx.mul(u, [cc[0], -cc[1]]), cx.mul(v, [ss[0], -ss[1]]));
        A[i][k + 1] = cx.sub(cx.mul(v, cc), cx.mul(u, ss));
      }
    }
    for (let i = l; i <= n; i++) A[i][i] = cx.add(A[i][i], mu);
  }
  return eig;
}
/* An eigenvector of H for eigenvalue lam, by inverse iteration */
function hessVec(H0, m, lam) {
  const M = []; for (let i = 0; i < m; i++) { M.push([]); for (let j = 0; j < m; j++) M[i].push(H0[i] && H0[i][j] ? [H0[i][j][0], H0[i][j][1]] : [0, 0]); M[i][i] = cx.sub(M[i][i], cx.add(lam, [1e-10 * (1 + cx.abs(lam)), 0])); }
  // LU with partial pivoting, then a few solves
  const P = [...Array(m).keys()];
  for (let k = 0; k < m; k++) {
    let p = k; for (let i = k + 1; i < m; i++) if (cx.abs(M[i][k]) > cx.abs(M[p][k])) p = i;
    [M[k], M[p]] = [M[p], M[k]]; [P[k], P[p]] = [P[p], P[k]];
    if (cx.abs(M[k][k]) === 0) M[k][k] = [1e-300, 0];
    for (let i = k + 1; i < m; i++) { const f = cx.div(M[i][k], M[k][k]); M[i][k] = f; for (let j = k + 1; j < m; j++) M[i][j] = cx.sub(M[i][j], cx.mul(f, M[k][j])); }
  }
  let y = new Array(m).fill(null).map(() => [1, 0]);
  for (let it = 0; it < 3; it++) {
    const b = P.map(i => y[i]);
    for (let i = 0; i < m; i++) for (let j = 0; j < i; j++) b[i] = cx.sub(b[i], cx.mul(M[i][j], b[j]));
    for (let i = m - 1; i >= 0; i--) { for (let j = i + 1; j < m; j++) b[i] = cx.sub(b[i], cx.mul(M[i][j], b[j])); b[i] = cx.div(b[i], M[i][i]); }
    const nrm = Math.sqrt(b.reduce((a, c) => a + c[0] * c[0] + c[1] * c[1], 0)) || 1;
    y = b.map(c => [c[0] / nrm, c[1] / nrm]);
  }
  return y;
}
/* The cavity's leading modes from a solved steady state: round-trip factor, loss, frequency
   from the strongest (as the scan counts it), share of the input, and field */
export function cavModes(res, fsr, count) {
  if (!res || !res.m) return [];
  const { H, m, Q, beta } = res;
  const lams = hessEig(H, m).filter(l => cx.abs(l) > 1e-6).sort((a, b) => cx.abs(b) - cx.abs(a));
  // Ritz values the space cannot pin down (small ones, or its own edge) are left out
  const out = [];
  const w = cavWeights(Q[0]);
  // Only converged pairs are modes: an Arnoldi pair's residual |T v - lam v| is
  // |H(m+1, m)| times its eigenvector's last component; the rest are the space's own artefacts
  const hEdge = H[m] && H[m][m - 1] ? cx.abs(H[m][m - 1]) : 0;
  for (const lam of lams) {
    if (out.length >= (count || 6)) break;
    const y = hessVec(H, m, lam);
    if (hEdge * cx.abs(y[m - 1]) > 2e-3 * cx.abs(lam)) continue;
    if (out.some(md => cx.abs(cx.sub(md.lam, lam)) < 1e-6 * cx.abs(lam))) continue;
    if (out.length && cx.abs(lam) < 0.1 * out[0].abs) break;     // one that loses nearly all of itself each round trip is no mode to show
    const F = cavLin(Q[0], y.map((c, k) => [c, Q[k]]));
    const nF = cavDot(F, F, w)[0], ov = cavDot(F, Q[0], w);
    out.push({ lam, abs: cx.abs(lam), loss: 1 - cx.abs(lam) ** 2, arg: Math.atan2(lam[1], lam[0]), field: F, share: (ov[0] ** 2 + ov[1] ** 2) / (nF || 1) });
  }
  if (out.length) { const a0 = out[0].arg; for (const md of out) { let f = -(md.arg - a0) / (2 * Math.PI); f -= Math.round(f); md.offset = f * fsr; } }
  return out;
}

/* A cavity with gain in its loop, as a laser. The round trip's passive loss is what the
   pilot lost less what the gain gave it; the small-signal gain against that loss says whether
   it lases. If it does, each gain element saturates as a homogeneous medium does with every
   beam through it at once (Rigrod 1965): I+ I- is constant through it, so every pass sees the
   same gain G, ln G = ln G0 - (G - 1) S / Psat, S the power entering it summed over its passes,
   Psat = Isat pi w^2 / 2 over the cavity mode there. Walking the loop with the mirrors'
   reflectances (and the rest of the passive loss spread evenly) gives S for a power X on the
   output coupler, and X is where the round trip is one. What leaves through each partly
   transmitting mirror is the power arriving there times its transmission. */
export function laserState(c) {
  if (c.rho === null || !(c.rho > 0)) return null;
  const count = new Map();
  c.surfaces.forEach((id, j) => { const e = getEl(id); if (e && e.type === 'gain') { const k = count.get(id); count.set(id, k ? { e, k: k.k + 1, j: k.j } : { e, k: 1, j }); } });
  if (!count.size) return null;
  const nm = c.lam0 * 1e6;
  const G = [...count.values()].map(({ e, k, j }) => {
    const a = c.mode.along[j];
    const w = a ? Math.sqrt(a.wx * a.wy) : null;
    return { e, k, g0: gainSmall(e, nm), used: gainAt(e, nm), Psat: e.isat > 0 && w ? e.isat * 10 * Math.PI * w * w / 2 : 0, w };
  });
  const lnPassive = 2 * Math.log(c.rho) - G.reduce((a, g) => a + g.k * Math.log(g.used), 0);
  const lnNet0 = lnPassive + G.reduce((a, g) => a + g.k * Math.log(g.g0), 0);
  const need = Math.exp(-lnPassive / G.reduce((a, g) => a + g.k, 0) - 0) ;   // one gain element's pass gain at threshold
  const out = { nm, G, lnPassive, lnNet0, above: lnNet0 > 0, need, sat: G.every(g => g.Psat > 0) };
  if (!out.above || !out.sat) return out;
  // the partly transmitting mirrors round the loop; the walk starts at the most transmitting
  const n = c.surfaces.length, els = c.surfaces.map(getEl);
  out.outs = [];
  els.forEach((e, j) => { if (e && e.type === 'mirror' && e.reflect < 100) out.outs.push({ j, e, T: 1 - e.reflect / 100 }); });
  const oc = out.outs.length ? out.outs.reduce((a, b) => b.T > a.T ? b : a) : null, j0 = oc ? oc.j : 0;
  const Rof = (j, Roc) => { const e = els[j]; return e && e.type === 'mirror' ? (oc && j === oc.j && Roc !== undefined ? Roc : Math.min(1, e.reflect / 100)) : 1; };
  const rest = (lnPassive - els.reduce((a, e, j) => a + Math.log(Rof(j)), 0)) / n;
  const byId = new Map(G.map(g => [g.e.id, g]));
  // the loop walked from the output coupler with power X on it and gains Gv: the power arriving
  // at each surface, the power entering each gain element (summed over its passes), the return
  const walk = (X, Gv, Roc) => {
    const inc = new Array(n).fill(0), S = new Map(G.map(g => [g.e.id, 0]));
    let p = X;
    for (let i = 0; i < n; i++) {
      const j = (j0 + i) % n, e = els[j];
      inc[j] = p;
      if (e && byId.has(e.id)) { S.set(e.id, S.get(e.id) + p); p *= Gv.get(e.id); }
      else p *= Rof(j, Roc);
      p *= Math.exp(rest);
    }
    return { inc, S, ret: p / X };
  };
  // one element's gain for the power S entering it: ln G = ln G0 - (G - 1) S / Psat
  const satG = (g, S) => {
    if (!(g.g0 > 1)) return g.g0;
    let lo = 1, hi = g.g0;
    for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); Math.log(g.g0) - Math.log(m) - (m - 1) * S / g.Psat > 0 ? lo = m : hi = m; }
    return 0.5 * (lo + hi);
  };
  const lnMirD = Roc => oc && Roc !== undefined ? Math.log(Math.max(1e-12, Roc)) - Math.log(Math.max(1e-12, 1 - oc.T)) : 0;
  // the steady state whose round trip's log gain is target (0: it lases; slightly below for the tracer)
  const solve = (target, Roc) => {
    const lnP = lnPassive + lnMirD(Roc);
    if (lnP + G.reduce((a, g) => a + g.k * Math.log(g.g0), 0) <= target) return null;
    if (G.length === 1) {
      // one gain element: the round trip fixes its gain, and the power follows from it
      const g = G[0], Gs = Math.exp((target - lnP) / g.k), Gv = new Map([[g.e.id, Gs]]);
      const s1 = walk(1, Gv, Roc).S.get(g.e.id);
      const X = Gs - 1 > 1e-12 ? Math.min(1e12, g.Psat * (Math.log(g.g0) - Math.log(Gs)) / ((Gs - 1) * s1)) : 1e12;
      return Object.assign(walk(X, Gv, Roc), { X, Gv });
    }
    // several: for a power X, their gains by iteration; X where the round trip is target
    const at = X => {
      let Gv = new Map(G.map(g => [g.e.id, g.g0])), W;
      for (let it = 0; it < 200; it++) {
        W = walk(X, Gv, Roc);
        let d = 0; const nx = new Map();
        for (const g of G) { const v = Math.sqrt(Gv.get(g.e.id) * satG(g, W.S.get(g.e.id))); d = Math.max(d, Math.abs(v / Gv.get(g.e.id) - 1)); nx.set(g.e.id, v); }
        Gv = nx; if (d < 1e-12) break;
      }
      W = walk(X, Gv, Roc);
      return Object.assign(W, { X, Gv });
    };
    let hi = 1e-3; while (Math.log(at(hi).ret) > target && hi < 1e12) hi *= 4;
    let lo = 0; for (let i = 0; i < 100; i++) { const m = 0.5 * (lo + hi); Math.log(at(m).ret) > target ? lo = m : hi = m; }
    return at(0.5 * (lo + hi));
  };
  const W = solve(0);
  out.P = W ? Math.max(...W.inc) : 0;                 // the most power anywhere in the loop
  out.Gsat = G.map(g => W ? W.Gv.get(g.e.id) : g.g0);
  // the gain the tracer uses: a hair below threshold, so the seed's round trips stay finite
  const Wt = solve(Math.log(0.995));
  out.clamp = new Map(G.map(g => [g.e.id, Wt && g.g0 > 1 ? Math.log(Wt.Gv.get(g.e.id)) / Math.log(g.g0) : 1]));
  for (const o of out.outs) o.P = W ? W.inc[o.j] * o.T : 0;
  if (oc) {
    const Pof = R => { const S = solve(0, R); return S ? S.inc[oc.j] * (1 - R) : 0; };
    // most of the range is below threshold (no output at all): find the peak on a grid of
    // transmissions first, then close in on it
    let kb = 0, Tg = [];
    for (let i = 0; i <= 240; i++) Tg.push(Math.pow(10, -5 + 5 * i / 240));
    const Pg = Tg.map(T => Pof(1 - T));
    for (let i = 1; i < Pg.length; i++) if (Pg[i] > Pg[kb]) kb = i;
    let a = Tg[Math.max(0, kb - 1)], b = Tg[Math.min(Tg.length - 1, kb + 1)];
    for (let i = 0; i < 60; i++) { const m1 = a + (b - a) * 0.382, m2 = a + (b - a) * 0.618; Pof(1 - m1) < Pof(1 - m2) ? a = m1 : b = m2; }
    const Tb = 0.5 * (a + b);
    out.best = { e: oc.e, R: 1 - Tb, P: Pof(1 - Tb) };
  }
  return out;
}

/* The beams a lasing cavity sends out: from each partly transmitting mirror, the cavity mode
   as it arrives there, carried on out through the mirror with the output power */
export function laserSources() {
  const out = [];
  for (const c of findCavities()) {
    const L = laserState(c);
    if (!L || !L.P || !L.outs) continue;
    for (const o of L.outs) {
      if (!(o.P > 0)) continue;
      const p = c.p, jm = (o.j - 1 + p) % p, a = c.mode.along[jm], B = c.segs;
      if (!a || !B[jm] || !B[o.j]) continue;
      const q = qThrough(mfree(a.len, a.n), a.qx), lam = c.lam0;
      const dx = B[jm].dx, dy = B[jm].dy, off = 1e-3;
      const zR = q[1], w0 = Math.sqrt(lam * zR / Math.PI);
      const J = B[jm].J, jn = Math.hypot(...J) || 1;
      const nm = L.nm, mir = o.e;
      const v = {
        type: 'source', virtual: true, laser: true, id: 'laser~' + c.id + '~' + o.j, name: mir.name + ' (laser output)', bench: mir.bench,
        x: B[o.j].x0 + dx * off, y: B[o.j].y0 + dy * off, angle: Math.atan2(dy, dx) / deg, wavelength: nm, lines: [], colourAuto: true, colour: wavelengthColour(nm),
        gauss: true, w0, z0: -q[0] - off, m2: 1, rays: 3, traceRays: true, popN: 256, popModel: 'auto',
        pol: 's', polAngle: 0, coh: 0, lineshape: 'lorentz', power: o.P * 1000, tau: 0, pshape: 'sech2', rep: 80, gdd0: 0,
        vJ: J.map(x => x / jn), vLag: 0, vKey: 'laser~' + c.id + ':q', vFo: 0, sweeps: {},
      };
      v.vRoot = v;
      fanFromGauss(v);
      out.push(v);
    }
  }
  return out;
}

export function cavitiesOf(el) { return findCavities().filter(c => !el || c.surfaces.includes(el.id)); }

/* The ray fan and the Gaussian beam describe the same light, so keep them in step:
   the rays are the wavefront normals, and the fan's width is the beam diameter. */
export function gaussFromFan(el) {
  const lam = el.wavelength * 1e-6 * m2Of(el);    // an M^2 beam spreads as if its wavelength were M^2 times longer
  // a higher-order mode is sqrt(M^2) wider than the Gaussian it is built on, and w0 is that Gaussian's
  const fm = Math.sqrt(modeM2(el)[0]);
  const wsrc = el.width / 2 / fm;
  const half = el.divergence * deg / 2;
  if (wsrc <= 0) {                       // a point source: the divergence alone fixes the waist
    const th = Math.max(1e-9, Math.abs(Math.tan(half)));
    el.w0 = fm * lam / (Math.PI * th);
    el.z0 = 0;
    return;
  }
  const invR = half === 0 ? 0 : Math.tan(half) / (wsrc * fm);
  const invI = -lam / (Math.PI * wsrc * wsrc);
  const den = invR * invR + invI * invI;
  el.w0 = Math.sqrt(Math.max(1e-12, lam * (-invI / den) / Math.PI));
  el.z0 = -(invR / den);
}
