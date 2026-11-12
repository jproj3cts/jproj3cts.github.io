import { mieS } from './mie.js';

/* ==========================================================================
   Scattered light in the far field: the pieces the three particle models share
   A far field is E = F(r^) e^{ikr} / r, F in volts for E in V/m, fields as exp(-i w t);
   the power into a solid angle is |F|^2 / (2 Z) with Z the medium's impedance.
   The incident light is a set of plane waves, E_o e^{i k d_o.r} about the particle's centre:
   one for a wide beam, a pupil's worth for a tight focus (engines/scatter.js makes them).
   Pure: nothing of the bench here.
   ========================================================================== */

export const Z0_OHM = 376.730313668;
/* Gauss-Legendre nodes and weights on [-1, 1] */
export function gaussLegendre(n) {
  const x = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < (n + 1) >> 1; i++) {
    let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), dp = 1;
    for (let it = 0; it < 60; it++) {
      let p0 = 1, p1 = z;
      for (let j = 2; j <= n; j++) { const p2 = ((2 * j - 1) * z * p1 - (j - 1) * p0) / j; p0 = p1; p1 = p2; }
      dp = n * (z * p1 - p0) / (z * z - 1);
      const dz = p1 / dp; z -= dz;
      if (Math.abs(dz) < 1e-15) break;
    }
    {
      let p0 = 1, p1 = z;
      for (let j = 2; j <= n; j++) { const p2 = ((2 * j - 1) * z * p1 - (j - 1) * p0) / j; p0 = p1; p1 = p2; }
      dp = n * (z * p1 - p0) / (z * z - 1);
    }
    x[i] = -z; x[n - 1 - i] = z;
    w[i] = w[n - 1 - i] = 2 / ((1 - z * z) * dp * dp);
  }
  return { x, w };
}
/* Directions over the whole sphere for integrals and the map: nT Gauss-Legendre nodes in
   mu = cos(theta) about ez and nP even steps of phi from ex towards ey (ex, ey, ez a right-
   handed frame). dirs[3 (iT nP + iP)], and w the solid angle each stands for. */
export function sphereGrid(nT, nP, ex, ey, ez) {
  const g = gaussLegendre(nT), dirs = new Float64Array(3 * nT * nP), w = new Float64Array(nT * nP), phi = new Float64Array(nP);
  for (let j = 0; j < nP; j++) phi[j] = 2 * Math.PI * j / nP;
  for (let i = 0; i < nT; i++) {
    const mu = g.x[i], s = Math.sqrt(1 - mu * mu);
    for (let j = 0; j < nP; j++) {
      const c = Math.cos(phi[j]) * s, sn = Math.sin(phi[j]) * s, o = i * nP + j;
      for (let q = 0; q < 3; q++) dirs[3 * o + q] = c * ex[q] + sn * ey[q] + mu * ez[q];
      w[o] = g.w[i] * 2 * Math.PI / nP;
    }
  }
  return { nT, nP, mu: g.x, phi, dirs, w };
}
/* Directions over a cone of half-angle `half` about a unit axis, with their solid angles */
export function coneGrid(axis, half, nT = 14, nP = 28) {
  const g = gaussLegendre(nT), c0 = Math.cos(half), dirs = new Float64Array(3 * nT * nP), w = new Float64Array(nT * nP);
  const t = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let ex = [t[1] * axis[2] - t[2] * axis[1], t[2] * axis[0] - t[0] * axis[2], t[0] * axis[1] - t[1] * axis[0]];
  const l = Math.hypot(ex[0], ex[1], ex[2]); ex = ex.map(v => v / l);
  const ey = [axis[1] * ex[2] - axis[2] * ex[1], axis[2] * ex[0] - axis[0] * ex[2], axis[0] * ex[1] - axis[1] * ex[0]];
  for (let i = 0; i < nT; i++) {
    const mu = c0 + (1 - c0) * 0.5 * (g.x[i] + 1), s = Math.sqrt(Math.max(0, 1 - mu * mu));
    for (let j = 0; j < nP; j++) {
      const ph = 2 * Math.PI * (j + 0.5) / nP, c = Math.cos(ph) * s, sn = Math.sin(ph) * s, o = i * nP + j;
      for (let q = 0; q < 3; q++) dirs[3 * o + q] = c * ex[q] + sn * ey[q] + mu * axis[q];
      w[o] = g.w[i] * 0.5 * (1 - c0) * 2 * Math.PI / nP;
    }
  }
  return { dirs, w };
}
/* A sphere's far field in a set of plane waves, each wave's Mie field turned to its own
   direction and polarisation and all added as fields (Bohren and Huffman's eq. 4.74 for one):
     F(r^) = (i / k) sum_o [ S2 (E_o . e_par,i) e_par,s + S1 (E_o . e_perp) e_perp ],
   e_perp = r^ x d_o / |r^ x d_o| square to the plane of d_o and r^, e_par,i = d_o x e_perp,
   e_par,s = r^ x e_perp. A wave's phase at the sphere's centre is in its E_o, so a sphere off
   the focus needs nothing more. tab: mieTable's S1, S2 by angle. waves: { n, d (3 n), E (6 n) }.
   dirs: 3 n unit vectors. Returns F, 6 numbers a direction (x, y, z, each re and im). */
export function mieFarWaves(tab, k, waves, dirs, out) {
  const nd = dirs.length / 3, F = out || new Float64Array(6 * nd), nw = waves.n, D = waves.d, E = waves.E, T = tab.t, inv = 1 / tab.d, last = tab.n - 2;
  for (let i = 0; i < nd; i++) {
    const rx = dirs[3 * i], ry = dirs[3 * i + 1], rz = dirs[3 * i + 2];
    let fxr = 0, fxi = 0, fyr = 0, fyi = 0, fzr = 0, fzi = 0;
    for (let o = 0; o < nw; o++) {
      const dx = D[3 * o], dy = D[3 * o + 1], dz = D[3 * o + 2], b = 6 * o;
      const c = Math.max(-1, Math.min(1, rx * dx + ry * dy + rz * dz));
      // S1, S2 at this angle, between the table's rows
      const u = Math.acos(c) * inv, i0 = Math.min(last, u | 0), f = u - i0, q = 4 * i0;
      const s1r = T[q] + f * (T[q + 4] - T[q]), s1i = T[q + 1] + f * (T[q + 5] - T[q + 1]), s2r = T[q + 2] + f * (T[q + 6] - T[q + 2]), s2i = T[q + 3] + f * (T[q + 7] - T[q + 3]);
      let px = ry * dz - rz * dy, py = rz * dx - rx * dz, pz = rx * dy - ry * dx;      // r x d
      const s2 = px * px + py * py + pz * pz;
      if (s2 < 1e-18) {
        // straight on or straight back: any e_perp does, and both give S1 E
        fxr += s1r * E[b] - s1i * E[b + 1]; fxi += s1r * E[b + 1] + s1i * E[b];
        fyr += s1r * E[b + 2] - s1i * E[b + 3]; fyi += s1r * E[b + 3] + s1i * E[b + 2];
        fzr += s1r * E[b + 4] - s1i * E[b + 5]; fzi += s1r * E[b + 5] + s1i * E[b + 4];
        continue;
      }
      const is = 1 / Math.sqrt(s2); px *= is; py *= is; pz *= is;
      const ax = dy * pz - dz * py, ay = dz * px - dx * pz, az = dx * py - dy * px;      // d x e_perp
      const gx = ry * pz - rz * py, gy = rz * px - rx * pz, gz = rx * py - ry * px;      // r x e_perp
      const ear = E[b] * ax + E[b + 2] * ay + E[b + 4] * az, eai = E[b + 1] * ax + E[b + 3] * ay + E[b + 5] * az;
      const epr = E[b] * px + E[b + 2] * py + E[b + 4] * pz, epi = E[b + 1] * px + E[b + 3] * py + E[b + 5] * pz;
      const ar = s2r * ear - s2i * eai, ai = s2r * eai + s2i * ear, br = s1r * epr - s1i * epi, bi = s1r * epi + s1i * epr;
      fxr += ar * gx + br * px; fxi += ai * gx + bi * px;
      fyr += ar * gy + br * py; fyi += ai * gy + bi * py;
      fzr += ar * gz + br * pz; fzi += ai * gz + bi * pz;
    }
    // times i / k
    F[6 * i] = -fxi / k; F[6 * i + 1] = fxr / k; F[6 * i + 2] = -fyi / k; F[6 * i + 3] = fyr / k; F[6 * i + 4] = -fzi / k; F[6 * i + 5] = fzr / k;
  }
  return F;
}
/* one plane wave's Mie far field, summed in full at each direction (no table): for checks */
export function mieFarExact(C, k, d, E, dirs) {
  const n = dirs.length / 3, F = new Float64Array(6 * n), S = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const r = [dirs[3 * i], dirs[3 * i + 1], dirs[3 * i + 2]], c = Math.max(-1, Math.min(1, r[0] * d[0] + r[1] * d[1] + r[2] * d[2]));
    mieS(C, c, S);
    let p = [r[1] * d[2] - r[2] * d[1], r[2] * d[0] - r[0] * d[2], r[0] * d[1] - r[1] * d[0]];
    const l = Math.hypot(p[0], p[1], p[2]);
    if (l < 1e-9) { const t = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; p = [t[1] * d[2] - t[2] * d[1], t[2] * d[0] - t[0] * d[2], t[0] * d[1] - t[1] * d[0]]; const l2 = Math.hypot(p[0], p[1], p[2]); p = p.map(v => v / l2); }
    else p = p.map(v => v / l);
    const a = [d[1] * p[2] - d[2] * p[1], d[2] * p[0] - d[0] * p[2], d[0] * p[1] - d[1] * p[0]], g = [r[1] * p[2] - r[2] * p[1], r[2] * p[0] - r[0] * p[2], r[0] * p[1] - r[1] * p[0]];
    const ea = [E[0] * a[0] + E[2] * a[1] + E[4] * a[2], E[1] * a[0] + E[3] * a[1] + E[5] * a[2]], ep = [E[0] * p[0] + E[2] * p[1] + E[4] * p[2], E[1] * p[0] + E[3] * p[1] + E[5] * p[2]];
    const A = [S[2] * ea[0] - S[3] * ea[1], S[2] * ea[1] + S[3] * ea[0]], B = [S[0] * ep[0] - S[1] * ep[1], S[0] * ep[1] + S[1] * ep[0]];
    for (let q = 0; q < 3; q++) { const re = A[0] * g[q] + B[0] * p[q], im = A[1] * g[q] + B[1] * p[q]; F[6 * i + 2 * q] = -im / k; F[6 * i + 2 * q + 1] = re / k; }
  }
  return F;
}
/* a point dipole's far field, F = k^2 (p - r^ (r^.p)): p = [xr, xi, yr, yi, zr, zi] in the
   Gaussian measure of core/dda.js (p = alpha E, alpha a volume) */
export function dipoleFar(k, p, dirs, out) {
  const n = dirs.length / 3, F = out || new Float64Array(6 * n), k2 = k * k;
  for (let i = 0; i < n; i++) {
    const ux = dirs[3 * i], uy = dirs[3 * i + 1], uz = dirs[3 * i + 2];
    const dr = ux * p[0] + uy * p[2] + uz * p[4], di = ux * p[1] + uy * p[3] + uz * p[5];
    F[6 * i] = k2 * (p[0] - ux * dr); F[6 * i + 1] = k2 * (p[1] - ux * di);
    F[6 * i + 2] = k2 * (p[2] - uy * dr); F[6 * i + 3] = k2 * (p[3] - uy * di);
    F[6 * i + 4] = k2 * (p[4] - uz * dr); F[6 * i + 5] = k2 * (p[5] - uz * di);
  }
  return F;
}
/* A small particle's polarisability (the Rayleigh level), a volume, along its axis and
   across it: [[re, im] along, [re, im] across]. A spheroid's is exact in the static limit
   (its depolarisation factors); a cylinder or capsule is taken as the spheroid of its volume
   and aspect. Each with the radiative reaction, alpha / (1 - (2/3) i k^3 alpha), which gives
   it the scattering it must have. V the volume (m^3), aspect = length / diameter. */
export function smallAlpha(V, aspect, mr, mi, k) {
  let Lz = 1 / 3;
  if (aspect > 1 + 1e-9) { const e = Math.sqrt(1 - 1 / (aspect * aspect)); Lz = (1 - e * e) / (e * e) * (Math.log((1 + e) / (1 - e)) / (2 * e) - 1); }
  else if (aspect < 1 - 1e-9) { const e = Math.sqrt(1 - aspect * aspect); Lz = (1 - Math.sqrt(1 - e * e) / e * Math.asin(e)) / (e * e); }
  const er = mr * mr - mi * mi - 1, ei = 2 * mr * mi;                    // eps - 1
  const one = L => {
    // (V / 4 pi) (eps - 1) / (1 + L (eps - 1))
    const dr = 1 + L * er, di = L * ei, d2 = dr * dr + di * di, f = V / (4 * Math.PI);
    const ar = f * (er * dr + ei * di) / d2, ai = f * (ei * dr - er * di) / d2;
    // over 1 - (2/3) i k^3 alpha
    const g = (2 / 3) * k * k * k, br = 1 + g * ai, bi = -g * ar, b2 = br * br + bi * bi;
    return [(ar * br + ai * bi) / b2, (ai * br - ar * bi) / b2];
  };
  return [one(Lz), one((1 - Lz) / 2)];
}
/* a dipole's cross-sections in a plane wave it answers with p = alpha E (alpha [re, im] along the field) */
export const dipoleCross = (k, alpha) => {
  const sca = 8 * Math.PI / 3 * k ** 4 * (alpha[0] * alpha[0] + alpha[1] * alpha[1]), ext = 4 * Math.PI * k * alpha[1];
  return { sca, ext, abs: ext - sca };
};
/* |F|^2 of each direction, summed over the fields given (launches add as powers) */
export function farPower(Fs, n, out) {
  const I = out || new Float64Array(n);
  for (const F of Fs) for (let i = 0; i < n; i++) { const o = 6 * i; I[i] += F[o] * F[o] + F[o + 1] * F[o + 1] + F[o + 2] * F[o + 2] + F[o + 3] * F[o + 3] + F[o + 4] * F[o + 4] + F[o + 5] * F[o + 5]; }
  return I;
}
/* the part of it polarised along a fixed unit vector */
export function farPowerAlong(Fs, n, v) {
  const I = new Float64Array(n);
  for (const F of Fs) for (let i = 0; i < n; i++) { const o = 6 * i, re = F[o] * v[0] + F[o + 2] * v[1] + F[o + 4] * v[2], im = F[o + 1] * v[0] + F[o + 3] * v[1] + F[o + 5] * v[2]; I[i] += re * re + im * im; }
  return I;
}
/* Over a sphereGrid: the whole (sum |F|^2 dOmega), the mean cosine about the grid's axis,
   and the shares forward and back of it */
export function sphereTotals(G, I) {
  let tot = 0, mu1 = 0, fwd = 0;
  for (let i = 0; i < G.nT; i++) for (let j = 0; j < G.nP; j++) { const o = i * G.nP + j, v = I[o] * G.w[o]; tot += v; mu1 += v * G.mu[i]; if (G.mu[i] > 0) fwd += v; }
  return { total: tot, g: tot > 0 ? mu1 / tot : 0, fwd: tot > 0 ? fwd / tot : 0, back: tot > 0 ? 1 - fwd / tot : 0 };
}
