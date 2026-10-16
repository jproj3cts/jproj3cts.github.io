import { stackAmp } from '../core/coatings.js';
import { absorbAt } from '../core/glass.js';
import { aimRay, lensLaunch, traceRay } from './lens-engine.js';

/* ==========================================================================
   Polarisation through a lens design
   Each ray carries a 3 x 3 complex matrix (a polarisation ray trace): at each face, with k the ray's direction either
   side, s square to the plane of incidence and p = k x s on each side,
       P_face = τs s sᵀ + τp p' pᵀ + k' kᵀ,
   τ the amplitude transmission of that face for s and p, scaled by √(n' cos θ' / n cos θ) so that |τ|² is the share of
   the power it passes. A face's τ: a bare face by Fresnel; a thin-film stack by its characteristic matrix (tilted
   admittances; t = 2η₀ / (η₀B + C), and for p times cos θ₀ / cos θ'); a coating given only by its reflectance
   passes 1 - R, s and p alike, with no change of phase. A mirror reflects all of it, s with -1 and p with +1 (no
   change of polarisation from its own). The glass between faces takes exp(-α L / 2) of the amplitude, α its absorption.
   The product over the faces, between the ray's directions in object and image space, is read as a Jones matrix
   in the bases x and y each side (the double-pole basis: the axis's x turned along the great circle to the ray): its transmission for any polarisation in, its
   diattenuation (from the eigenvalues of J†J) and its retardance (from the unitary part of its polar decomposition).
   ========================================================================== */
const plCmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const plAbs2 = a => a[0] * a[0] + a[1] * a[1];
const plDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const plCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const plUnit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/* a thin-film stack's complex amplitude transmission (the whole E field), for s or p, from n0 into ns at cosine c0 */
export function stackT(layers, n0, ns, c0, nm, pol) {
  const sin0 = Math.sqrt(Math.max(0, 1 - c0 * c0)) * n0;
  const cosIn = n => Math.sqrt(Math.max(1e-12, 1 - (sin0 / n) * (sin0 / n)));
  const eta = n => (pol === 's' ? n * cosIn(n) : n / cosIn(n));
  let m11 = [1, 0], m12 = [0, 0], m21 = [0, 0], m22 = [1, 0];
  for (const L of layers) {
    const d = 2 * Math.PI * L.n * L.d * cosIn(L.n) / nm, c = Math.cos(d), sn = Math.sin(d), e = eta(L.n);
    const a11 = [c, 0], a12 = [0, sn / e], a21 = [0, e * sn], a22 = [c, 0];
    const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
    [m11, m12, m21, m22] = [add(plCmul(m11, a11), plCmul(m12, a21)), add(plCmul(m11, a12), plCmul(m12, a22)), add(plCmul(m21, a11), plCmul(m22, a21)), add(plCmul(m21, a12), plCmul(m22, a22))];
  }
  const es = eta(ns), e0 = eta(n0), B = [m11[0] + m12[0] * es, m11[1] + m12[1] * es], C = [m21[0] + m22[0] * es, m21[1] + m22[1] * es];
  const den = [e0 * B[0] + C[0], e0 * B[1] + C[1]], dd = plAbs2(den);
  const t = [2 * e0 * den[0] / dd, -2 * e0 * den[1] / dd];
  if (pol === 's') return t;
  const k = c0 / cosIn(ns);
  return [t[0] * k, t[1] * k];
}
/* a face's power-normalised amplitude transmissions [τs, τp] (complex), and its reflectances [Rs, Rp], light from
   index n1 into n2 meeting it at cosine c1 (> 0) */
export function faceAmps(coat, n1, n2, c1, nm) {
  const s1 = Math.sqrt(Math.max(0, 1 - c1 * c1)), s2 = n1 / n2 * s1, c2 = Math.sqrt(Math.max(0, 1 - s2 * s2)), norm = Math.sqrt(n2 * c2 / (n1 * c1));
  const bare = () => {
    const ts = 2 * n1 * c1 / (n1 * c1 + n2 * c2), tp = 2 * n1 * c1 / (n2 * c1 + n1 * c2);
    const rs = (n1 * c1 - n2 * c2) / (n1 * c1 + n2 * c2), rp = (n2 * c1 - n1 * c2) / (n2 * c1 + n1 * c2);
    return { ts: [ts * norm, 0], tp: [tp * norm, 0], Rs: rs * rs, Rp: rp * rp };
  };
  if (!coat || coat.mode === 'bare') return bare();
  if (coat.mode === 'band' && !(nm >= coat.lo && nm <= coat.hi)) return bare();
  if (coat.mode === 'stack') {
    if (!coat.layers || !coat.layers.length) return bare();
    const L = n1 > n2 ? coat.layers.slice().reverse() : coat.layers;
    const ts = stackT(L, n1, n2, c1, nm, 's'), tp = stackT(L, n1, n2, c1, nm, 'p'), rs = stackAmp(L, n1, n2, c1, nm, 's'), rp = stackAmp(L, n1, n2, c1, nm, 'p');
    return { ts: [ts[0] * norm, ts[1] * norm], tp: [tp[0] * norm, tp[1] * norm], Rs: plAbs2(rs), Rp: plAbs2(rp) };
  }
  // a coating known by its reflectance alone: 1 - R through, s and p alike
  const R = Math.max(0, Math.min(1, (coat.R || 0) / 100)), t = Math.sqrt(1 - R);
  return { ts: [t, 0], tp: [t, 0], Rs: R, Rp: R };
}

/* 3 x 3 complex matrices, row-major, [re, im] pairs */
const plEye = () => Array.from({ length: 9 }, (_, k) => [k % 4 === 0 ? 1 : 0, 0]);
const plMul = (A, B) => { const C = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let re = 0, im = 0; for (let k = 0; k < 3; k++) { const a = A[i * 3 + k], b = B[k * 3 + j]; re += a[0] * b[0] - a[1] * b[1]; im += a[0] * b[1] + a[1] * b[0]; } C.push([re, im]); } return C; };
const plMv = (A, v) => [0, 1, 2].map(i => { let re = 0, im = 0; for (let k = 0; k < 3; k++) { const a = A[i * 3 + k], b = v[k]; re += a[0] * b[0] - a[1] * b[1]; im += a[0] * b[1] + a[1] * b[0]; } return [re, im]; });
// the face's matrix: τs s sᵀ + τp p' pᵀ + k' kᵀ
function faceMatrix(kIn, kOut, nrm, ts, tp) {
  let s = plCross(kIn, nrm);
  if (Math.hypot(s[0], s[1], s[2]) < 1e-9) s = plCross(kIn, Math.abs(kIn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  s = plUnit(s);
  const p = plCross(kIn, s), q = plCross(kOut, s), P = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) P.push([ts[0] * s[i] * s[j] + tp[0] * q[i] * p[j] + kOut[i] * kIn[j], ts[1] * s[i] * s[j] + tp[1] * q[i] * p[j]]);
  return P;
}
/* the polarisation trace of one ray, field th (radians), pupil point (px, py): its Jones matrix and each face's share */
export function polRay(S, P, coats, th, px, py) {
  const ab = aimRay(S, th, px, py);
  if (!ab) return null;
  const R = lensLaunch(S, th, ab[0], ab[1], new Float64Array(8)), k0 = [R[3], R[4], R[5]], rec = [];
  traceRay(S, R, 0, S.N - 1, false, rec);
  if (R[7] !== 0) return null;
  let Mx = plEye();
  const faces = [];
  for (let i = 0; i < S.N; i++) {
    const r = rec[i];
    let ts, tp, Rs, Rp;
    const c1 = Math.abs(plDot(r.kIn, r.n));
    if (r.mirror) { ts = [-1, 0]; tp = [1, 0]; Rs = Rp = 1; }
    else ({ ts, tp, Rs, Rp } = faceAmps(coats && coats[i], r.nIn, r.nOut, Math.min(1, c1), S.nm));
    // the glass after this face, up to the next: its absorption over the ray's path in it
    let a = 1;
    if (i < S.N - 1 && P.materials[i]) { const al = absorbAt(P.materials[i], S.nm); if (al > 0) { const q = rec[i + 1].at, o = r.at; a = Math.exp(-al * Math.hypot(q[0] - o[0], q[1] - o[1], q[2] - o[2]) / 2); } }
    Mx = plMul(faceMatrix(r.kIn, r.kOut, r.n, [ts[0] * a, ts[1] * a], [tp[0] * a, tp[1] * a]), Mx);
    faces.push({ T: (plAbs2(ts) + plAbs2(tp)) / 2, Ts: plAbs2(ts), Tp: plAbs2(tp), Rs, Rp, absorbed: 1 - a * a, mirror: r.mirror });
  }
  // each side's x and y: the axis's own (the image's, after a fold) turned along the great circle from the axis to the
  // ray (the double-pole basis: round about the axis, and an ideal lens's matrix the identity)
  const kN = rec[S.N - 1].kOut, I = S.img || { e1: [1, 0, 0], d: [0, 0, 1] };
  const basis = (k, ex, ez) => {
    const w = plCross(ez, k), c = plDot(ez, k), wx = plCross(w, ex), wwx = plCross(w, wx), f = 1 / (1 + c);
    const x = plUnit([ex[0] + wx[0] + wwx[0] * f, ex[1] + wx[1] + wwx[1] * f, ex[2] + wx[2] + wwx[2] * f]);
    return [x, plCross(k, x)];
  };
  const [xi, yi] = basis(k0, [1, 0, 0], [0, 0, 1]), [xo, yo] = basis(kN, I.e1, I.d);
  const cvec = v => v.map(c => [c, 0]), cdot = (u, w) => [u[0] * w[0][0] + u[1] * w[1][0] + u[2] * w[2][0], u[0] * w[0][1] + u[1] * w[1][1] + u[2] * w[2][1]];
  const Px = plMv(Mx, cvec(xi)), Py = plMv(Mx, cvec(yi));
  const J = [cdot(xo, Px), cdot(xo, Py), cdot(yo, Px), cdot(yo, Py)];
  return { px, py, J, faces, x: R[0], y: R[1] };
}

/* what a Jones matrix does: transmission for a polarisation in (or unpolarised), diattenuation, retardance (radians) */
export function jonesFigures(J, E) {
  const [a, b, c, d] = J;
  // J†J: Hermitian [[p, q], [q*, r]]
  const p = plAbs2(a) + plAbs2(c), r = plAbs2(b) + plAbs2(d);
  const q = [a[0] * b[0] + a[1] * b[1] + c[0] * d[0] + c[1] * d[1], a[0] * b[1] - a[1] * b[0] + c[0] * d[1] - c[1] * d[0]];
  const tr = p + r, det = p * r - plAbs2(q), disc = Math.sqrt(Math.max(0, tr * tr / 4 - det)), lmax = tr / 2 + disc, lmin = Math.max(0, tr / 2 - disc);
  const D = lmax + lmin > 0 ? (lmax - lmin) / (lmax + lmin) : 0;
  // the unitary part U = J H⁻¹, H = √(J†J) = (J†J + √det I) / √(tr + 2√det)
  const sd = Math.sqrt(Math.max(0, det)), k = Math.sqrt(tr + 2 * sd);
  let ret = 0;
  if (sd > 1e-30 && k > 0) {
    // H = [[h11, h12], [h12*, h22]]; H⁻¹ = [[h22, -h12], [-h12*, h11]] / det H, det H = sd (as √det(J†J))
    const h11 = (p + sd) / k, h22 = (r + sd) / k, h12 = [q[0] / k, q[1] / k], dh = h11 * h22 - plAbs2(h12);
    const i11 = [h22 / dh, 0], i12 = [-h12[0] / dh, -h12[1] / dh], i21 = [-h12[0] / dh, h12[1] / dh], i22 = [h11 / dh, 0];
    const u11 = [plCmul(a, i11)[0] + plCmul(b, i21)[0], plCmul(a, i11)[1] + plCmul(b, i21)[1]], u22 = [plCmul(c, i12)[0] + plCmul(d, i22)[0], plCmul(c, i12)[1] + plCmul(d, i22)[1]];
    const trU = Math.hypot(u11[0] + u22[0], u11[1] + u22[1]);
    ret = 2 * Math.acos(Math.min(1, trU / 2));
  }
  let T = tr / 2, out = null;
  if (E) {
    const ex = [plCmul(a, E[0])[0] + plCmul(b, E[1])[0], plCmul(a, E[0])[1] + plCmul(b, E[1])[1]], ey = [plCmul(c, E[0])[0] + plCmul(d, E[1])[0], plCmul(c, E[0])[1] + plCmul(d, E[1])[1]];
    T = plAbs2(ex) + plAbs2(ey);
    // the polarisation out: its Stokes parameters, the ellipse's tilt and ellipticity
    const S0 = T, S1 = plAbs2(ex) - plAbs2(ey), S2 = 2 * (ex[0] * ey[0] + ex[1] * ey[1]), S3 = 2 * (ex[0] * ey[1] - ex[1] * ey[0]);
    out = { ex, ey, psi: 0.5 * Math.atan2(S2, S1), chi: S0 > 0 ? 0.5 * Math.asin(Math.max(-1, Math.min(1, S3 / S0))) : 0 };
  }
  return { T, D, ret, out, Tmax: lmax, Tmin: lmin };
}
export const POL_IN = {
  none: null, x: [[1, 0], [0, 0]], y: [[0, 0], [1, 0]], d45: [[Math.SQRT1_2, 0], [Math.SQRT1_2, 0]], rcp: [[Math.SQRT1_2, 0], [0, -Math.SQRT1_2]],
};
/* a field's polarisation over the pupil: an n x n grid of rays at wavelength wi, polarisation in pin (POL_IN's key);
   each ray's figures, their means over the rays that reach the image, and each face's mean share */
export function polAnalysis(A, coats, deg, wi, pin, n) {
  n = n || 21;
  const S = A.S[wi === undefined ? A.c.primary : wi], E = POL_IN[pin || 'none'] || null, th = deg * Math.PI / 180, grid = [];
  let sT = 0, sD = 0, sR = 0, cnt = 0, inside = 0;
  const faces = Array.from({ length: S.N }, () => ({ T: 0, Ts: 0, Tp: 0, absorbed: 0, R: 0 }));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const px = -1 + (2 * i + 1) / n, py = -1 + (2 * j + 1) / n;
    if (px * px + py * py > 1) { grid.push(null); continue; }
    inside++;
    const r = polRay(S, A.P, coats, th, px, py);
    if (!r) { grid.push(null); continue; }
    const f = jonesFigures(r.J, E);
    grid.push(Object.assign({ px, py }, f));
    sT += f.T; sD += f.D; sR += f.ret; cnt++;
    r.faces.forEach((q, k) => { const F = faces[k]; F.T += q.T; F.Ts += q.Ts; F.Tp += q.Tp; F.absorbed += q.absorbed; F.R += (q.Rs + q.Rp) / 2; });
  }
  faces.forEach(F => { for (const k in F) F[k] /= cnt || 1; });
  return { deg, nm: S.nm, n, grid, pin: pin || 'none', T: cnt ? sT / cnt : NaN, D: cnt ? sD / cnt : NaN, ret: cnt ? sR / cnt : NaN, reach: inside ? cnt / inside : 0, faces };
}
