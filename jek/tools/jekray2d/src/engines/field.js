import { maskOf } from '../core/geometry.js';
import { MASK_EDGE_SHARE, maskFootprint, maskJumps } from '../core/mask.js';
import { V, sx, sy, wx, wy } from '../ui/render.js';
import { ci } from './fibre.js';
import { h } from '../ui/panel.js';
import { popScreen } from './phase-screen.js';
import { fieldComps, interp2 } from './field2d.js';
// Shared mutable state read or set here, not yet imported (see state/shared.md): W

/* ---------- Physical optics propagation ----------
   The bench is the meridional slice of a round system, so a beam on axis is a
   figure of revolution: its field is a radial profile E(r). Diffraction of such a
   field is a Hankel transform, done here with the quasi-discrete Hankel transform
   (Guizar-Sicairos and Gutierrez-Vega, JOSA A 21, 53, 2004) on the zeros of J0.

   As is usual in physical optics propagation, a pilot Gaussian beam travels with the field. Inside its
   Rayleigh range the field is held against a plane and moved with the angular
   spectrum; outside it the field is held against a sphere centred on the pilot
   waist and moved through the waist with a single Fresnel transform, which
   rescales the grid. Only the residual phase is sampled, so a tight focus and a
   long collimated leg both fit on a few hundred points.

   Sign convention: fields go as exp(-ikz) (Siegman), so a Gaussian is
   exp(-ik r^2 / 2q) with q = z + i zR, and a diverging reference is
   exp(-ik r^2 / 2z). Lengths are in mm. */

/* J0 and J1 to about 1e-12: power series below 12, Hankel asymptotics above */
export function besselJ01(x) {
  const ax = Math.abs(x);
  if (ax < 12) {
    const q = -0.25 * ax * ax;
    let t0 = 1, s0 = 1, t1 = 0.5 * ax, s1 = t1;
    for (let k = 1; k < 60; k++) {
      t0 *= q / (k * k); s0 += t0;
      t1 *= q / (k * (k + 1)); s1 += t1;
      if (Math.abs(t0) < 1e-17 * Math.abs(s0) && Math.abs(t1) < 1e-17 * (Math.abs(s1) + 1e-300)) break;
    }
    return [s0, x < 0 ? -s1 : s1];
  }
  // P and Q for orders 0 and 1, summed until the terms stop shrinking
  const z8 = 8 * ax;
  const pq = mu => {
    let P = 1, Q = 0, term = 1, k = 1;
    for (; k < 40; k++) {
      term *= (mu - (2 * k - 1) ** 2) / (k * z8);
      const next = Math.abs(term);
      if (k % 2) Q += term * (k % 4 === 1 ? 1 : -1);
      else P += term * (k % 4 === 2 ? -1 : 1);
      if (next < 1e-17) break;
      if (k > 2 && next > Math.abs(term / ((mu - (2 * k - 1) ** 2) / (k * z8)))) break;
    }
    return [P, Q];
  };
  const [P0, Q0] = pq(0), [P1, Q1] = pq(4);
  const a = Math.sqrt(2 / (Math.PI * ax));
  const c0 = ax - Math.PI / 4, c1 = ax - 3 * Math.PI / 4;
  const J0 = a * (P0 * Math.cos(c0) - Q0 * Math.sin(c0));
  const J1 = a * (P1 * Math.cos(c1) - Q1 * Math.sin(c1));
  return [J0, x < 0 ? -J1 : J1];
}

/* The first n positive zeros of J0: McMahon's expansion polished by Newton */
export function besselZerosJ0(n) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const b = (i + 0.75) * Math.PI, b8 = 8 * b;
    let x = b + 1 / b8 - 124 / (3 * b8 ** 3) + 120928 / (15 * b8 ** 5);
    for (let it = 0; it < 6; it++) {
      const [j0, j1] = besselJ01(x);
      const dx = j0 / j1;                  // J0' = -J1, so Newton adds J0/J1
      x += dx;
      if (Math.abs(dx) < 1e-14 * x) break;
    }
    out[i] = x;
  }
  return out;
}

/* Transform kernel for N points, cached: C[m][n] = J0(j_m j_n / S) */
const qdhtCache = new Map();
export function qdht(N) {
  if (qdhtCache.has(N)) return qdhtCache.get(N);
  const z = besselZerosJ0(N + 1);
  const j = z.subarray(0, N), S = z[N];
  const C = new Float64Array(N * N), inv = new Float64Array(N);
  for (let m = 0; m < N; m++) {
    inv[m] = 1 / besselJ01(j[m])[1] ** 2;
    for (let n = m; n < N; n++) {
      const v = besselJ01(j[m] * j[n] / S)[0];
      C[m * N + n] = v; C[n * N + m] = v;
    }
  }
  const Q = { N, j, S, C, inv };
  qdhtCache.set(N, Q);
  return Q;
}

/* Sample radii of a grid whose outer radius is R */
export function popRadii(Q, R) {
  const r = new Float64Array(Q.N);
  for (let i = 0; i < Q.N; i++) r[i] = Q.j[i] * R / Q.S;
  return r;
}

/* F(nu) = 2 pi Int f(r) J0(2 pi nu r) r dr on the grid of outer radius R. The result sits
   at nu_m = j_m / (2 pi R); the inverse is the same sum with R and V swapped. */
function hankelCore(Q, re, im, scale) {
  const { N, C, inv } = Q;
  const gr = new Float64Array(N), gi = new Float64Array(N);
  for (let n = 0; n < N; n++) { gr[n] = re[n] * inv[n]; gi[n] = im[n] * inv[n]; }
  const or = new Float64Array(N), oi = new Float64Array(N);
  for (let m = 0; m < N; m++) {
    let sr = 0, si = 0;
    const row = m * N;
    for (let n = 0; n < N; n++) { const c = C[row + n]; sr += c * gr[n]; si += c * gi[n]; }
    or[m] = sr * scale; oi[m] = si * scale;
  }
  return [or, oi];
}
export function hankel(Q, R, re, im) {
  const V = Q.S / (2 * Math.PI * R);
  return hankelCore(Q, re, im, 1 / (Math.PI * V * V));
}
export function ihankel(Q, R, re, im) {           // R: outer radius of the spatial grid wanted
  return hankelCore(Q, re, im, 1 / (Math.PI * R * R));
}

/* Power, 2 pi Int |E|^2 r dr, from the grid samples */
export function popPower(F) {
  const Q = qdht(F.re.length);
  const V = Q.S / (2 * Math.PI * F.R), k = 1 / (Math.PI * V * V);
  let p = 0;
  for (let i = 0; i < Q.N; i++) p += (F.re[i] ** 2 + F.im[i] ** 2) * Q.inv[i];
  return p * k;
}

/* A field: residual samples u on a grid of outer radius R, held against a plane or
   against a sphere of radius z, at signed distance z past the pilot waist.
   Pilot: complex q = z + i zR in a medium of index n; lam0 in mm. */
function popField(N, R, re, im, q, n, lam0) {
  const zR = q[1];
  return { R, re, im, z: q[0], zR, n, lam0, sphere: Math.abs(q[0]) > zR };
}
export const popInside = (z, zR) => Math.abs(z) <= zR;
const popK = F => 2 * Math.PI * F.n / F.lam0;
const popLam = F => F.lam0 / F.n;
export const popW = (z, zR, lam) => Math.sqrt(lam * zR / Math.PI * (1 + (z / zR) ** 2));

/* Grid oversize: the square root of the transform's space-bandwidth product. With it a
   beam sits the same fraction of the grid at the waist and in the far field. */
export const popGuard = N => Math.sqrt(qdht(N).S / 2);

/* The full field at the samples, reference phase put back */
function popFull(F) {
  const Q = qdht(F.re.length), r = popRadii(Q, F.R);
  const re = new Float64Array(Q.N), im = new Float64Array(Q.N);
  const a = F.sphere ? -popK(F) / (2 * F.z) : 0;
  for (let i = 0; i < Q.N; i++) {
    const ph = a * r[i] * r[i], c = Math.cos(ph), s = Math.sin(ph);
    re[i] = F.re[i] * c - F.im[i] * s; im[i] = F.re[i] * s + F.im[i] * c;
  }
  return { re, im, r };
}
/* Take a full field back to residual form against the reference for (z, zR) */
export function popResidual(re, im, r, z, zR, k) {
  const sphere = !popInside(z, zR);
  if (sphere) {
    const a = k / (2 * z);                 // divide out exp(-ik r^2 / 2z)
    for (let i = 0; i < r.length; i++) {
      const ph = a * r[i] * r[i], c = Math.cos(ph), s = Math.sin(ph);
      const x = re[i] * c - im[i] * s, y = re[i] * s + im[i] * c;
      re[i] = x; im[i] = y;
    }
  }
  return sphere;
}

/* Angular spectrum over distance d; both planes held against planes */
function popAngular(F, spec, d) {
  const Q = qdht(F.re.length);
  const [Sr, Si] = spec || hankel(Q, F.R, F.re, F.im);
  const nu = 1 / (2 * Math.PI * F.R), lam = popLam(F), k = popK(F);
  const tr = new Float64Array(Q.N), ti = new Float64Array(Q.N);
  for (let m = 0; m < Q.N; m++) {
    const v = Q.j[m] * nu, s = 1 - (lam * v) ** 2;
    let ar = 0, ai = 0;
    if (s >= 0) { const ph = -k * d * Math.sqrt(s); ar = Math.cos(ph); ai = Math.sin(ph); }
    else { ar = Math.exp(-k * Math.abs(d) * Math.sqrt(-s)); }   // evanescent
    tr[m] = Sr[m] * ar - Si[m] * ai; ti[m] = Sr[m] * ai + Si[m] * ar;
  }
  const [re, im] = ihankel(Q, F.R, tr, ti);
  return { R: F.R, re, im, z: F.z + d, zR: F.zR, n: F.n, lam0: F.lam0, sphere: false };
}

/* From a sphere-referenced plane at z to the waist plane (z = 0): one transform */
function popToWaist(F) {
  const Q = qdht(F.re.length), lam = popLam(F), k = popK(F);
  const [Hr, Hi] = hankel(Q, F.R, F.re, F.im);
  const d = -F.z, Rw = lam * Math.abs(d) * Q.S / (2 * Math.PI * F.R);
  const rho = popRadii(Q, Rw);
  const re = new Float64Array(Q.N), im = new Float64Array(Q.N);
  // (i / lam d) exp(-ikd) exp(-ik rho^2 / 2d) H
  const base = -k * d;
  for (let m = 0; m < Q.N; m++) {
    const ph = base - k * rho[m] * rho[m] / (2 * d) + Math.PI / 2;
    const c = Math.cos(ph) / (lam * d), s = Math.sin(ph) / (lam * d);
    re[m] = Hr[m] * c - Hi[m] * s; im[m] = Hr[m] * s + Hi[m] * c;
  }
  return { R: Rw, re, im, z: 0, zR: F.zR, n: F.n, lam0: F.lam0, sphere: false };
}

/* From the waist plane to a sphere-referenced plane at z: one transform */
function popFromWaist(Fw, z) {
  const Q = qdht(Fw.re.length), lam = popLam(Fw), k = popK(Fw);
  const r = popRadii(Q, Fw.R);
  const gr = new Float64Array(Q.N), gi = new Float64Array(Q.N);
  const a = -k / (2 * z);
  for (let i = 0; i < Q.N; i++) {
    const ph = a * r[i] * r[i], c = Math.cos(ph), s = Math.sin(ph);
    gr[i] = Fw.re[i] * c - Fw.im[i] * s; gi[i] = Fw.re[i] * s + Fw.im[i] * c;
  }
  const [Hr, Hi] = hankel(Q, Fw.R, gr, gi);
  const R2 = lam * Math.abs(z) * Q.S / (2 * Math.PI * Fw.R);
  const re = new Float64Array(Q.N), im = new Float64Array(Q.N);
  const ph0 = -k * z + Math.PI / 2;
  const c0 = Math.cos(ph0) / (lam * z), s0 = Math.sin(ph0) / (lam * z);
  for (let m = 0; m < Q.N; m++) { re[m] = Hr[m] * c0 - Hi[m] * s0; im[m] = Hr[m] * s0 + Hi[m] * c0; }
  return { R: R2, re, im, z, zR: Fw.zR, n: Fw.n, lam0: Fw.lam0, sphere: true };
}

/* Propagates one field to many distances, keeping the intermediate transforms */
export function popLeg(F0) {
  const L = popLegCore(F0);
  if (F0.bab) {
    // behind a disc: the free beam's and the opening's legs, worked out when first asked for
    const Lf = popLegCore(F0.bab.free), Lh = popLegCore(F0.bab.hole), at0 = L.at;
    L.at = t => {
      const G = at0(t);
      if (t !== 0 && !Object.prototype.hasOwnProperty.call(G, 'bab')) {
        let v = null;
        Object.defineProperty(G, 'bab', { get: () => v || (v = { free: Lf.at(t), hole: Lh.at(t) }), enumerable: false });
      }
      return G;
    };
  }
  L.stats = t => popStats(L.at(t));
  L.cut = t => {
    const G = L.at(t), Q = qdht(G.re.length), I = new Float64Array(Q.N);
    for (let i = 0; i < Q.N; i++) I[i] = G.re[i] ** 2 + G.im[i] ** 2;
    return { x: popRadii(Q, G.R), I, sym: true, w: popW(G.z, G.zR, G.lam0 / G.n), half: G.R };
  };
  L.cutC = t => {
    const G = L.at(t), k = 2 * Math.PI * G.n / G.lam0;
    return { x: popRadii(qdht(G.re.length), G.R), re: G.re, im: G.im, sym: true, b: G.sphere ? -k / (2 * G.z) : 0,
      w: popW(G.z, G.zR, G.lam0 / G.n), half: G.R, k };
  };
  return L;
}
function popLegCore(F0) {
  let spec0 = null, Fw = null, specW = null;
  const waist = () => {
    if (Fw) return Fw;
    if (F0.sphere) Fw = popToWaist(F0);
    else { spec0 = spec0 || hankel(qdht(F0.re.length), F0.R, F0.re, F0.im); Fw = popAngular(F0, spec0, -F0.z); }
    return Fw;
  };
  return {
    field: F0,
    at(t) {
      if (t === 0) return F0;
      const z2 = F0.z + t;
      if (popInside(z2, F0.zR)) {
        if (!F0.sphere) {
          spec0 = spec0 || hankel(qdht(F0.re.length), F0.R, F0.re, F0.im);
          return popAngular(F0, spec0, t);
        }
        const W = waist();
        specW = specW || hankel(qdht(W.re.length), W.R, W.re, W.im);
        return popAngular(W, specW, z2);
      }
      return popFromWaist(waist(), z2);
    },
  };
}

/* Resampling of a smooth residual: cubic in r, even through the axis, zero outside */
function popResample(r0, re0, im0, r1) {
  const N0 = r0.length, re = new Float64Array(r1.length), im = new Float64Array(r1.length);
  const cub = (y0, y1, y2, y3, t) => y1 + 0.5 * t * (y2 - y0 + t * (2 * y0 - 5 * y1 + 4 * y2 - y3 + t * (3 * (y1 - y2) + y3 - y0)));
  // extend with the mirror images at -r0[0], -r0[1] so the axis needs no special case
  const xs = [-r0[1], -r0[0]], ys = [1, 0];
  let j = 0;
  for (let i = 0; i < r1.length; i++) {
    const x = r1[i];
    if (x > r0[N0 - 1]) break;
    let i0, i1, i2, i3, x1, x2;
    if (x <= r0[0]) { i0 = 0; i1 = 0; i2 = 0; i3 = 1; x1 = -r0[0]; x2 = r0[0]; }
    else {
      while (j < N0 - 2 && r0[j + 1] < x) j++;
      i0 = j > 0 ? j - 1 : 0; i1 = j; i2 = j + 1; i3 = j + 2 < N0 ? j + 2 : j + 1;
      x1 = r0[j]; x2 = r0[j + 1];
    }
    void xs; void ys;
    const t = (x - x1) / (x2 - x1);
    re[i] = cub(re0[i0], re0[i1], re0[i2], re0[i3], t);
    im[i] = cub(im0[i0], im0[i1], im0[i2], im0[i3], t);
  }
  return [re, im];
}

/* Second-moment beam radius, sqrt(2 <r^2>): the 1/e^2 radius for a Gaussian */
export function popStats(F) {
  const Q = qdht(F.re.length), r = popRadii(Q, F.R);
  let p = 0, m2 = 0, peak = 0;
  for (let i = 0; i < Q.N; i++) {
    const I = F.re[i] ** 2 + F.im[i] ** 2, w = I * Q.inv[i];
    p += w; m2 += w * r[i] * r[i];
    if (I > peak) peak = I;
  }
  const V = Q.S / (2 * Math.PI * F.R);
  const [c0] = popAxis(F);
  return { power: p / (Math.PI * V * V), w: Math.sqrt(2 * m2 / (p || 1)), peak, axis: c0, R: F.R };
}
/* Intensity on the axis. The field is even in r and smooth there, so fit it (not |E|^2,
   which can dip to zero) as a + b r^2 + c r^4 through the innermost samples. */
export function popAxis(F) {
  const Q = qdht(F.re.length), r = popRadii(Q, F.R);
  const x = [0, 1, 2].map(i => r[i] * r[i]);
  let er = 0, ei = 0;
  for (let i = 0; i < 3; i++) {
    let l = 1;
    for (let j = 0; j < 3; j++) if (j !== i) l *= (0 - x[j]) / (x[i] - x[j]);
    er += F.re[i] * l; ei += F.im[i] * l;
  }
  return [er * er + ei * ei];
}

/* A round field between its samples, exactly as the grid holds it: its Hankel spectrum summed
   back at any radius. Returns r -> intensity. (Linear interpolation of the intensity samples
   misplaces a sharp core's half-height by as much as a tenth of its width.) */
export function popIntensityAt(F) {
  const f = popFieldSeries(F);
  return r => { const [a, b] = f(r); return a * a + b * b; };
}
/* the same, the residual field itself, [re, im] */
export function popFieldSeries(F) {
  if (F._series) return F._series;
  if (F.bab) {
    // the free beam less the opening's field, each by its own series, each put against this
    // field's reference: a residual times exp(i b r^2) is the full field, b = -k / 2z on a sphere
    const ref = G => G.sphere ? -popK(G) / (2 * G.z) : 0, b0 = ref(F);
    const parts = [[F.bab.free, 1], [F.bab.hole, -1]].map(([G, sg]) => [popFieldSeries(G), ref(G) - b0, sg]);
    const f = r => {
      let a = 0, b = 0;
      for (const [g, db, sg] of parts) { const [x, y] = g(r), ph = db * r * r, c = Math.cos(ph), sn = Math.sin(ph); a += sg * (x * c - y * sn); b += sg * (x * sn + y * c); }
      return [a, b];
    };
    Object.defineProperty(F, '_series', { value: f, enumerable: false });
    return f;
  }
  const Q = qdht(F.re.length), [sr, si] = hankel(Q, F.R, F.re, F.im), V = Q.S / (2 * Math.PI * F.R), k = 1 / (Math.PI * F.R * F.R);
  const nu = new Float64Array(Q.N), wr = new Float64Array(Q.N), wi = new Float64Array(Q.N);
  for (let m = 0; m < Q.N; m++) { nu[m] = Q.j[m] * V / Q.S; wr[m] = sr[m] * Q.inv[m] * k; wi[m] = si[m] * Q.inv[m] * k; }
  const f = r => { let a = 0, b = 0; for (let m = 0; m < Q.N; m++) { const j = besselJ01(2 * Math.PI * nu[m] * r)[0]; a += wr[m] * j; b += wi[m] * j; } return [a, b]; };
  Object.defineProperty(F, '_series', { value: f, enumerable: false });
  return f;
}
/* A 2D grid's field at (x, y) by high-order interpolation (eight samples each way), smooth
   enough that curvatures taken from it are the field's, not the interpolation's */
export function interpL(F, x, y, RE, IM) {
  RE = RE || F.re; IM = IM || F.im;
  const N = F.N, fx = x / F.ax.d + N / 2, fy = y / F.ay.d + N / 2, A = 4;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  if (ix < A || iy < A || ix > N - A - 1 || iy > N - A - 1) return interp2(F, x, y, RE, IM);
  // Lagrange weights over the 2A nearest samples: a polynomial between them, its curvature (a
  // trap's stiffness) the field's to order (d/w)^2A, where a windowed sinc ripples
  const lag = u => { const w = []; for (let j = -A + 1; j <= A; j++) { let l = 1; for (let m = -A + 1; m <= A; m++) if (m !== j) l *= (u - m) / (j - m); w.push(l); } return w; };
  const wx = lag(fx - ix), wy = lag(fy - iy), sx = 1, sy = 1;
  let r = 0, i = 0;
  for (let b = 0; b < 2 * A; b++) {
    const row = (iy - A + 1 + b) * N + ix - A + 1;
    let rr = 0, ri = 0;
    for (let a = 0; a < 2 * A; a++) { rr += wx[a] * RE[row + a]; ri += wx[a] * IM[row + a]; }
    r += wy[b] * rr; i += wy[b] * ri;
  }
  return [r / (sx * sy), i / (sx * sy)];
}
/* A 2D field between its samples along a row (axis 'x', row j) or a column ('y', column i),
   by the trigonometric interpolation its periodic grid implies; both polarisations. Returns
   offset (in grid steps from the grid's centre) -> intensity. */
export function field2LineAt(F, axis, idx) {
  const N = F.N, comps = fieldComps(F).map(([kr, ki]) => [F[kr], F[ki]]);
  const at = n => axis === 'x' ? idx * N + n : n * N + idx;
  return u => {                                   // u in samples, the grid's index space
    let I = 0;
    for (const [R, Im] of comps) {
      let a = 0, b = 0;
      for (let n = 0; n < N; n++) {
        const t = u - n; let w;
        if (Math.abs(t) < 1e-9) w = 1;
        else { const s1 = Math.sin(Math.PI * t); w = Math.abs(s1) < 1e-12 ? 0 : s1 / (N * Math.tan(Math.PI * t / N)); }
        a += w * R[at(n)]; b += w * Im[at(n)];
      }
      I += a * a + b * b;
    }
    return I;
  };
}
/* The half width at half maximum of a peaked curve f about its peak near x0, found by
   bisection on each side within [x0 - span, x0 + span]; the peak refined first. */
export function halfWidthOf(f, x0, step, span) {
  // the peak: a golden-section search within a step either side
  let a = x0 - step, b = x0 + step;
  for (let it = 0; it < 40; it++) { const m1 = a + 0.382 * (b - a), m2 = a + 0.618 * (b - a); if (f(m1) > f(m2)) b = m2; else a = m1; }
  const xp = 0.5 * (a + b), h = 0.5 * f(xp);
  const side = dir => {
    let lo = xp, hi = xp;
    for (let x = xp + dir * step / 4; Math.abs(x - xp) <= span; x += dir * step / 4) { if (f(x) <= h) { hi = x; break; } lo = x; }
    if (hi === xp) return null;
    for (let it = 0; it < 40; it++) { const m = 0.5 * (lo + hi); if (f(m) > h) lo = m; else hi = m; }
    return Math.abs(0.5 * (lo + hi) - xp);
  };
  const l = side(-1), r = side(1);
  return { xp, peak: 2 * h, hw: l === null || r === null ? (l ?? r) : 0.5 * (l + r) };
}

/* A Gaussian beam as a field: q is the complex beam parameter at this plane */
export function popGaussian(N, q, n, lam0, power) {
  const k = 2 * Math.PI * n / lam0, lam = lam0 / n;
  const [z, zR] = q;
  const R = popGuard(N) * popW(z, zR, lam);
  const Q = qdht(N), r = popRadii(Q, R);
  const re = new Float64Array(N), im = new Float64Array(N);
  const den = z * z + zR * zR, ir = z / den, ii = -zR / den;       // 1/q
  for (let i = 0; i < N; i++) {
    // exp(-ik r^2 / 2q) = exp(-ik r^2 ir / 2) exp(k r^2 ii / 2)
    const r2 = r[i] * r[i], amp = Math.exp(0.5 * k * r2 * ii), ph = -0.5 * k * r2 * ir;
    re[i] = amp * Math.cos(ph); im[i] = amp * Math.sin(ph);
  }
  const sphere = popResidual(re, im, r, z, zR, k);
  const F = { R, re, im, z, zR, n, lam0, sphere };
  const s = Math.sqrt((power === undefined ? 1 : power) / popPower(F));
  for (let i = 0; i < N; i++) { re[i] *= s; im[i] *= s; }
  return F;
}

/* Phase of a wavefront along a plane: exact, for a sphere (or, with different curvatures in
   and out of the bench plane, the ellipsoid with those two), and its paraxial parabola.
   iRx, iRy are the curvatures, positive diverging; the form is the stable one near the axis. */
export function popPhiExact(k, iRx, iRy, x, y) {
  const s = x * x * iRx + y * y * iRy;
  if (iRx * iRy >= 0) {
    const iRm = 0.5 * (iRx + iRy);
    return -k * s / (1 + Math.sqrt(Math.max(0, 1 + iRm * s)));
  }
  const one = (iR, u) => -k * iR * u * u / (1 + Math.sqrt(Math.max(0, 1 + iR * iR * u * u)));
  return one(iRx, x) + one(iRy, y);
}
export const popPhiPar = (k, iRx, iRy, x, y) => -0.5 * k * (x * x * iRx + y * y * iRy);
export const popInvR = q => q[0] / (q[0] * q[0] + q[1] * q[1]);

/* Open fraction of each sample's annular cell for a hard edge at radius a, so the edge
   need not fall on a sample: power and the effective radius come out right. */
function popMask(r, a) {
  const N = r.length, m = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const lo = i ? 0.5 * (r[i - 1] + r[i]) : 0;
    const hi = i < N - 1 ? 0.5 * (r[i] + r[i + 1]) : r[i] + 0.5 * (r[i] - r[i - 1]);
    m[i] = a >= hi ? 1 : a <= lo ? 0 : (a * a - lo * lo) / (hi * hi - lo * lo);
  }
  return m;
}

/* Through one surface. ev: { A, C, D, n2, a (clear radius in the incoming beam frame,
   or Infinity), gain (power ratio) }. q: the pilot arriving. The surface is paraxial
   for now: tangential magnification A and the quadratic phase exp(-i k2 (C/A) r^2 / 2);
   the ray-traced phase takes its place later. Only residuals are ever interpolated,
   and every reference phase is put back analytically. */
let BAB_N = 1024;                       // samples for the light a disc takes out (see popSurface)
export function popSurface(F, q, ev) {
  // Behind an obscuring disc the light is the free beam less what a round opening of the
  // disc's size would pass (Babinet). Its grid, sized to hold the whole beam, cannot also hold
  // the light the disc's edge bends through a/z, which meets on the axis in Poisson's spot;
  // the opening's field, on a grid sized to the disc, can. Both go on as legs of their own
  // beside this field, which still serves for everything taken from its samples; the field
  // between samples (the profile near the axis, the close-up) is taken from the two.
  let bab = null;
  if (ev.disc && !ev.noBab) {
    const sub = Object.assign({}, ev, { disc: null, fixed: undefined, noBab: true });
    // the opening's grid, spacing d over N samples: wide enough that the light its edge bends
    // to the grid's limit, lambda / 2d, is still on it t along (N d >= a + t lambda / 2d), so
    // none folds back onto the axis; that leaves room for the angles a / t that make the spot
    // many times over. Never coarser than a twentieth of the disc.
    // on more samples than the beam's own: the incoming field is smooth, so it resamples well
    const nS = BAB_N, ad = ev.disc * Math.abs(ev.A || 1), lamB = F.lam0 / (ev.n2 || F.n);
    const rF = popRadii(qdht(F.re.length), F.R), [hr, hi] = popResample(rF, F.re, F.im, popRadii(qdht(nS), F.R));
    const Fh = Object.assign({}, F, { re: hr, im: hi });
    const tB = ev.tNext > 0 && isFinite(ev.tNext) ? ev.tNext : 1e12;
    const dB = Math.min((ad + Math.sqrt(ad * ad + 2 * nS * lamB * tB)) / (2 * nS), ad / 20);
    const holeRn = Math.max(1.5 * ad, nS * dB);
    const free = popSurface(F, q, sub), hole = popSurface(Fh, q, Object.assign({}, sub, { a: Math.min(isFinite(ev.a) ? ev.a : Infinity, ev.disc), holeRn }));
    bab = { free: free.field, hole: hole.field };
  }
  const N = F.re.length, Q = qdht(N), G = popGuard(N), lam0 = F.lam0;
  const kIn = 2 * Math.PI * F.n / lam0, lamIn = lam0 / F.n;
  const r = popRadii(Q, F.R);
  let clipped = false, wFitIn = 0, m2In = 1, qr = q[0], qi = q[1];
  const aIn = isFinite(ev.a) ? ev.a : Infinity;
  // a round opening passes inside its edge; an obscuring disc passes outside it
  const maskOf = rr => ev.disc !== null && ev.disc !== undefined ? popMask(rr, ev.disc).map(v => 1 - v)
    : isFinite(aIn) ? popMask(rr, aIn) : null;
  if (aIn < r[N - 1] || (ev.disc && ev.disc < r[N - 1])) {
    // what gets through, measured on a grid that resolves the edge
    const R1 = G * Math.min(popW(qr, qi, lamIn), aIn), r1 = popRadii(Q, R1);
    const [re, im] = popResample(r, F.re, F.im, r1);
    const m = maskOf(r1);
    let p = 0, m2 = 0;
    for (let i = 0; i < N; i++) {
      const w = (re[i] ** 2 + im[i] ** 2) * m[i] * m[i] * Q.inv[i];
      p += w; m2 += w * r1[i] * r1[i];
    }
    const V = Q.S / (2 * Math.PI * R1);
    clipped = p / (Math.PI * V * V) < popPower(F) * (1 - 1e-4);
    wFitIn = Math.sqrt(2 * m2 / p);
    // and how fast it spreads: its spectrum, the pilot's curvature taken off (see the 2D step)
    if (clipped) {
      const b = 0.5 * kIn * (popInvR([qr, qi]) - (F.sphere ? 1 / F.z : 0));
      const cr = new Float64Array(N), ci = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const ph = b * r1[i] * r1[i], c = Math.cos(ph), s = Math.sin(ph), a = m[i];
        cr[i] = (re[i] * c - im[i] * s) * a; ci[i] = (re[i] * s + im[i] * c) * a;
      }
      const [Hr, Hi] = hankel(Q, R1, cr, ci);
      let s0 = 0, s2 = 0;
      for (let k = 0; k < N; k++) { const nu = Q.j[k] / (2 * Math.PI * R1), P = (Hr[k] ** 2 + Hi[k] ** 2) * Q.inv[k]; s0 += P; s2 += P * nu * nu; }
      // for a Gaussian <r^2><nu^2> = 1/(4 pi^2): M^2 = 2 pi sqrt(<r^2><nu^2>)
      m2In = Math.max(1, 2 * Math.PI * Math.sqrt((m2 / p) * (s2 / s0)));
    }
  }
  // pilot through the surface: q' = A q / (C q + D)
  const A = ev.A, aA = Math.abs(A), C = ev.C, D = ev.D;
  {
    const dr = C * qr + D, di = C * qi, nr = A * qr, ni = A * qi, den = dr * dr + di * di;
    const tr = (nr * dr + ni * di) / den, ti = (ni * dr - nr * di) / den;
    qr = tr; qi = ti;
  }
  const qAB = [qr, qi];
  const n2 = ev.n2, k2 = 2 * Math.PI * n2 / lam0, lam2 = lam0 / n2;
  if (ev.fixed) clipped = ev.fixed.clipped;
  if (clipped && ev.fixed) { qr = ev.fixed.q[0]; qi = ev.fixed.q[1]; }
  else if (clipped) {
    // recompute the pilot from what got through, the usual way: its curvature from the
    // pilot, its width from the second moment of the clipped field
    const wFit = aA * wFitIn;
    const den = qr * qr + qi * qi, invRe = qr / den, invIm = -m2In * lam2 / (Math.PI * wFit * wFit);
    const d2 = invRe * invRe + invIm * invIm;
    qr = invRe / d2; qi = -invIm / d2;
  }
  // the new grid, sized to the new pilot and to the slope of the aberration (see the 2D
  // step for why one limit serves both ends), and the quadratic phase left over:
  // incoming reference at x = rho / A, the surface, and the new reference removed
  const raw = ev.raw, traced = raw && raw.surf && raw.mode !== 'P' && !ev.paraxial;
  const k0 = 2 * Math.PI / lam0, iRi = popInvR(q), iRo = popInvR(qAB);
  const tr = traced ? popScreen(raw, popInvR(q), popInvR(q), lam0) : null;
  const abAt = (xx, r) => -k0 * r[0] + 0.5 * k2 * C * A * xx * xx
    + popPhiExact(kIn, iRi, iRi, xx, 0) - popPhiPar(kIn, iRi, iRi, xx, 0)
    - popPhiExact(k2, iRo, iRo, Math.abs(r[1]), 0) + popPhiPar(k2, iRo, iRo, aA * xx, 0);
  let steep = 0;
  const wOut = popW(qr, qi, lam2);
  let Rn = G * wOut;
  if (tr) {
    let g = 0, prev = null;
    const wIn0 = popW(q[0], q[1], lamIn);
    for (let i = 0; i <= 40; i++) {
      const u = i / 40 * 2.5 * wIn0, r = tr(u, 0);
      if (!r[4] || r[3] < 0) { prev = null; continue; }
      const v = abAt(u, r);
      if (prev !== null) g = Math.max(g, Math.abs(v - prev[1]) / (u - prev[0]));
      prev = [u, v];
    }
    g /= aA;
    if (g > 0) Rn = Math.min(Rn, Q.N * Math.PI / (2 * g));
    if (Rn < 3 * wOut) { steep = 1; Rn = 3 * wOut; }
  }
  {
    // and the slope the incoming light already carries, where it has any
    const rIn = popRadii(Q, F.R);
    let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, F.re[i] ** 2 + F.im[i] ** 2);
    let gIn = 0;
    for (let i = 0; i < N - 1; i++) {
      const a = F.re[i] ** 2 + F.im[i] ** 2, b = F.re[i + 1] ** 2 + F.im[i + 1] ** 2;
      if (a < 1e-8 * pk || b < 1e-8 * pk) continue;
      const dph = Math.atan2(F.im[i + 1] * F.re[i] - F.re[i + 1] * F.im[i], F.re[i + 1] * F.re[i] + F.im[i + 1] * F.im[i]);
      gIn = Math.max(gIn, Math.abs(dph) / (rIn[i + 1] - rIn[i]));
    }
    gIn /= aA;
    if (gIn > 0 && Q.N * Math.PI / (2 * gIn) < Rn) { Rn = Math.max(3 * wOut, Q.N * Math.PI / (2 * gIn)); if (Rn === 3 * wOut) steep = 1; }
  }
  // a round edge that cuts the beam: sample for its fringes at the next surface (see the 2D step)
  const maskEdge = raw && raw.surf && raw.surf.maskFn && maskJumps(raw.surf.maskFn, raw.ly, 0, 3 * wOut, 0, lam0);
  if (ev.tNext > 0 && isFinite(ev.tNext) && (clipped || ev.disc || maskEdge)) {
    const C = 3.5 * wOut, t = ev.tNext;
    const dHold = (C + Math.sqrt(C * C + N * lam2 * t)) / (2 * N);
    const d = Math.max(Math.sqrt(lam2 * t) / 8, dHold);
    Rn = Math.min(Rn, Math.max(N * d, 1.2 * aA * (isFinite(aIn) ? aIn : 0)));
  }
  if (ev.holeRn) Rn = ev.holeRn;
  if (ev.fixed) Rn = ev.fixed.Rn;
  const rn = popRadii(Q, Rn);
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = rn[i] / aA;
  const [ure, uim] = popResample(r, F.re, F.im, x);
  const mask = maskOf(x);
  const sphereIn = F.sphere, sphereOut = !popInside(qr, qi);
  let b = -0.5 * k2 * C / A;
  if (sphereIn) b += -kIn / (2 * F.z * A * A);
  if (sphereOut) b += k2 / (2 * qr);
  const g = Math.sqrt(ev.gain === undefined ? 1 : ev.gain) / aA;
  // the real surface, by tracing rays in the plane: what it adds beyond the paraxial
  // quadratic above is the aberration. Only meaningful while the beam stays round.
  let pArea = 0, pAmp = 0, pAreaM = 0, pAmpM = 0, pEdgeM = 0;
  const maskFnR = raw && raw.surf && raw.surf.maskFn && !ev.paraxial ? raw.surf.maskFn : null;
  for (let i = 0; i < N; i++) {
    if (mask) { const I = (ure[i] ** 2 + uim[i] ** 2) * Q.inv[i]; pArea += I * mask[i]; pAmp += I * mask[i] * mask[i]; }
    let gm = mask ? g * mask[i] : g;
    let ab = 0;
    if (tr && gm) {
      const r = tr(x[i], 0);
      if (!r[4]) { ure[i] = 0; uim[i] = 0; continue; }
      // the traced phase and the incoming wave, less the outgoing reference sphere at
      // where each ray really lands: smooth, so it can sit on the grid point. The
      // paraxial parts are already in b; swap them for the exact spheres here.
      ab = abAt(x[i], r);
      let fr = r[5], fi = 0;                               // a mask element's amplitude
      if (maskFnR) {
        const lo = i ? 0.5 * (x[i - 1] + x[i]) : 0, hi = i < N - 1 ? 0.5 * (x[i] + x[i + 1]) : x[i] + 0.5 * (x[i] - x[i - 1]);
        const fp = maskFootprint(maskFnR, r[6] - x[i] + 0.5 * (lo + hi), 0, hi - lo, 0, lam0, true);
        if (fp) {
          const ph0 = 2 * Math.PI * maskFnR(r[6], 0, lam0)[1], c0 = Math.cos(ph0), s0 = Math.sin(ph0);
          fr = fp[0] * c0 - fp[1] * s0; fi = fp[0] * s0 + fp[1] * c0;
          pAreaM += (ure[i] ** 2 + uim[i] ** 2) * Q.inv[i] * fp[2]; pEdgeM += (ure[i] ** 2 + uim[i] ** 2) * Q.inv[i] * fp[2]; pAmpM += (ure[i] ** 2 + uim[i] ** 2) * Q.inv[i] * (fr * fr + fi * fi);
        } else { const I0 = (ure[i] ** 2 + uim[i] ** 2) * Q.inv[i] * fr * fr; pAreaM += I0; pAmpM += I0; }
      }
      const xr0 = ure[i] * fr - uim[i] * fi, yi0 = ure[i] * fi + uim[i] * fr;
      ure[i] = xr0; uim[i] = yi0;
    }
    const ph = b * rn[i] * rn[i] + ab, c = Math.cos(ph), s = Math.sin(ph);
    const xr = (ure[i] * c - uim[i] * s) * gm, yi = (ure[i] * s + uim[i] * c) * gm;
    ure[i] = xr; uim[i] = yi;
  }
  const areaScale = ev.fixed ? ev.fixed.areaScale
    : (pAmp > 0 && pArea > pAmp ? Math.sqrt(pArea / pAmp) : 1) * (pAmpM > 0 && pAreaM > pAmpM ? Math.sqrt(pAreaM / pAmpM) : 1);
  if (areaScale !== 1) for (let i = 0; i < N; i++) { ure[i] *= areaScale; uim[i] *= areaScale; }
  const field = { R: Rn, re: ure, im: uim, z: qr, zR: qi, n: n2, lam0, sphere: sphereOut };
  // A surface that cuts nothing passes all the profile's power (its coefficients live in the
  // Jones vector): what resampling onto the new grid gains or loses is only interpolation,
  // and is taken back out. A cavity's round trips replay the factor, so the round trip stays
  // linear. Amplitude masks and cut beams keep what they are given.
  let resScale = ev.fixed ? ev.fixed.resScale || 1 : 1;
  if (!ev.fixed && !clipped && !(raw && raw.mode === 'M')) { const pO = popStats(field).power, pI = popStats(F).power; if (pO > 0 && pI > 0) resScale = Math.sqrt(pI / pO); }
  if (resScale !== 1) for (let i = 0; i < N; i++) { ure[i] *= resScale; uim[i] *= resScale; }
  // a mask formula that changes inside a sample is averaged over it; when that averaging throws
  // away a noticeable share of the light, the formula has detail the grid cannot hold
  // Behind an obscuring disc of radius a the light its edge bends meets on the axis in Poisson's
  // spot, 0.38 lambda t / a in radius at the next surface t along: narrower than three samples
  // (the grid, sized to hold the whole beam, spaced about Rn / N) and its height comes out low
  // (without the two fields beside it, as when a sweep replays a decision, it would come out low)
  const discSpot = !bab && ev.disc && ev.tNext > 0 && isFinite(ev.tNext) ? 0.38 * lam2 * ev.tNext / (aA * ev.disc) : Infinity;
  const coarse = !ev.fixed && (pAreaM > 0 && pEdgeM > MASK_EDGE_SHARE * pAreaM || discSpot < 3 * Rn / N) ? 1 : 0;
  if (bab) field.bab = bab;
  return { field, q: [qr, qi], clipped, steep, coarse,
    decision: { Rn, clipped, q: [qr, qi], areaScale, resScale } };
}

