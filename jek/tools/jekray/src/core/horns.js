import { hermite } from './pulses.js';
import { besselJn } from './special.js';

/* ---------- Feed horns: the field across the aperture ----------
   A horn launches the field its waveguide mode leaves across its aperture, on a spherical
   phase front centred on its apex (Goldsmith, Quasioptical Systems, ch. 7):
     corrugated   the balanced hybrid HE11 mode, J0(2.405 r/a), zero at the wall and of one
                  polarisation: next to no cross-polar field
     smooth-wall  the TE11 mode of a round guide, J0(rho) - J2(rho) cos 2 phi along the field
                  (rho = 1.841 r/a; J1(rho)/rho in the E-plane, J1'(rho) in the H-plane, so it
                  reaches the wall in the E-plane) and J2(rho) sin 2 phi across it
     diagonal     the TE10 and TE01 modes of a square guide of side 2a, equal and polarised along
                  a diagonal: cos(pi x'/2a) + cos(pi y'/2a) along it, and their difference across
     Gaussian     the ideal, exp(-r^2 / w^2) with w the fit below, and nothing outside it
   Each is carried as a coherent sum of Hermite-Gauss modes of the Gaussian that fits it best
   (w = k a at the aperture, Goldsmith's table 7.1), found once by overlap on the aperture. The
   fundamental's share is the horn's Gaussicity; the sum stops at order 12 and what it leaves
   out (the sharp edge of the field at the wall) is lost with the cross-polar field, both
   reported. The far-field pattern is the Fourier transform of the aperture field itself. */
const CHI = 1.8411837813, J0Z = 2.4048255577;
/* the field at (x, y) in units of the aperture's radius a (half its side for a diagonal horn), as
   [along the polarisation, across it]; k is the fitted Gaussian's radius over a; ext how far out
   the field reaches along x and y, in a (1 unless given: a diagonal horn's square stands on its
   corners, half a diagonal, sqrt2 a, out along each) */
export const HORN_FIELDS = {
  corrugated: { k: 0.6435, field: (x, y) => { const r = Math.hypot(x, y); return r > 1 ? [0, 0] : [besselJn(0, J0Z * r), 0]; } },
  smooth: { k: 0.765, field: (x, y) => {
    const r = Math.hypot(x, y); if (r > 1) return [0, 0];
    const rho = CHI * r, j0 = besselJn(0, rho), j2 = besselJn(2, rho), c2 = r > 0 ? (x * x - y * y) / (r * r) : 1, s2 = r > 0 ? 2 * x * y / (r * r) : 0;
    return [j0 - j2 * c2, j2 * s2];                      // the field along y: phi from the H-plane (x)
  } },
  diagonal: { k: 0.86, ext: Math.SQRT2, field: (x, y) => {
    const u = (x + y) * Math.SQRT1_2, v = (y - x) * Math.SQRT1_2;     // the guide's sides, at 45 degrees to the field
    if (Math.abs(u) > 1 || Math.abs(v) > 1) return [0, 0];
    const cu = Math.cos(Math.PI * u / 2), cv = Math.cos(Math.PI * v / 2);
    return [0.5 * (cu + cv), 0.5 * (cv - cu)];
  } },
  gauss: { k: 0.6435, field: null },
};
const NMAX = 12;
const KC = 321;
const fact = m => { let f = 1; for (let i = 2; i <= m; i++) f *= i; return f; };
const cmemo = new Map();
/* a horn's beam as Hermite-Gauss modes of the fitted Gaussian, [m, n, re, im] of one norm summing to
   one in power: comps; the share of the power they carry (carried), in the fundamental alone
   (gauss), along the polarisation (co) and across it (cross); and the beam's M^2 each way */
export function hornComps(kind) {
  const H = HORN_FIELDS[kind] || HORN_FIELDS.corrugated;
  if (!H.field) return { comps: [[0, 0, 1, 0]], carried: 1, gauss: 1, co: 1, cross: 0, m2: [1, 1] };
  if (cmemo.has(kind)) return cmemo.get(kind);
  // over the whole aperture, at about the same spacing whatever its extent
  const ext = H.ext || 1, K = Math.ceil(KC * ext) | 1, w = H.k, h = 2 * ext / K, xs = Float64Array.from({ length: K }, (_, i) => -ext + (i + 0.5) * h);
  // the modes along one axis, of one norm on w: H_m(sqrt2 x / w) e^{-x^2/w^2} / sqrt(2^m m!) times (2 / pi w^2)^{1/4}
  const ax = [];
  for (let m = 0; m <= NMAX; m += 2) { const a = new Float64Array(K), nm = Math.sqrt(Math.pow(2, m) * fact(m)); for (let i = 0; i < K; i++) a[i] = hermite(m, Math.SQRT2 * xs[i] / w) * Math.exp(-xs[i] * xs[i] / (w * w)) / nm; ax.push(a); }
  const pairs = [];
  for (let m = 0; m <= NMAX; m += 2) for (let n = 0; m + n <= NMAX; n += 2) pairs.push([m, n]);
  const c = new Float64Array(pairs.length);
  let pt = 0, pco = 0;
  for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
    const [fc, fx] = H.field(xs[i], xs[j]);
    if (!fc && !fx) continue;
    pt += fc * fc + fx * fx; pco += fc * fc;
    for (let p = 0; p < pairs.length; p++) c[p] += fc * ax[pairs[p][0] / 2][i] * ax[pairs[p][1] / 2][j];
  }
  const norm = Math.sqrt(2 / (Math.PI * w * w)) * h * h / Math.sqrt(pt * h * h);
  let carried = 0, m2x = 0, m2y = 0;
  const comps = [];
  for (let p = 0; p < pairs.length; p++) { const v = c[p] * norm, v2 = v * v; if (v2 < 1e-7) continue; carried += v2; m2x += v2 * (2 * pairs[p][0] + 1); m2y += v2 * (2 * pairs[p][1] + 1); comps.push([pairs[p][0], pairs[p][1], v, 0]); }
  const s = 1 / Math.sqrt(carried);
  for (const q of comps) q[2] *= s;
  const R = { comps, carried, gauss: (c[0] * norm) ** 2, co: pco / pt, cross: 1 - pco / pt, m2: [m2x / carried, m2y / carried] };
  cmemo.set(kind, R);
  return R;
}
/* the far field of the aperture, at a frequency (lam, a and L in mm): cuts through the pattern in
   dB against the angle from the axis (deg), along the polarisation (E), across it (H) and the
   cross-polar field in the plane between; its directivity (dBi), half-power widths, first
   sidelobes and cross-polar peak */
const pmemo = new Map();
export function hornPattern(kind, a, L, lam) {
  const key = kind + '|' + a + '|' + L + '|' + lam;
  if (pmemo.has(key)) return pmemo.get(key);
  const H = HORN_FIELDS[kind] || HORN_FIELDS.corrugated, w = H.k;
  const field = H.field || ((x, y) => { const r2 = x * x + y * y; return r2 > 1 ? [0, 0] : [Math.exp(-r2 / (w * w)), 0]; });
  const ext = H.ext || 1, KP = Math.ceil(161 * ext) | 1, h = 2 * ext / KP, k = 2 * Math.PI / lam;
  const pts = [];
  let pt = 0;
  for (let j = 0; j < KP; j++) for (let i = 0; i < KP; i++) {
    const x = -ext + (i + 0.5) * h, y = -ext + (j + 0.5) * h, [fc, fx] = field(x, y);
    if (!fc && !fx) continue;
    const ph = -k * a * a * (x * x + y * y) / (2 * L);     // the spherical front, out from the apex
    pts.push([x * a, y * a, fc * Math.cos(ph), fc * Math.sin(ph), fx * Math.cos(ph), fx * Math.sin(ph)]);
    pt += fc * fc + fx * fx;
  }
  const dA = h * h * a * a;
  pt *= dA;
  const th0 = Math.atan(lam / (Math.PI * w * a)) * 180 / Math.PI;
  const tmax = Math.min(89, Math.max(5 * th0, 10)), N = 241;
  const th = Array.from({ length: N }, (_, i) => -tmax + 2 * tmax * i / (N - 1));
  const cut = (cx, cy, pol) => th.map(t => {
    const s = Math.sin(t * Math.PI / 180), ob = (1 + Math.cos(t * Math.PI / 180)) / 2, kx = k * s * cx, ky = k * s * cy;
    let re = 0, im = 0;
    for (const p of pts) { const ph = -(kx * p[0] + ky * p[1]), c = Math.cos(ph), sn = Math.sin(ph), fr = p[2 + pol], fi = p[3 + pol]; re += fr * c - fi * sn; im += fr * sn + fi * c; }
    return (re * re + im * im) * dA * dA * ob * ob;
  });
  const E = cut(0, 1, 0), Hc = cut(1, 0, 0), X = cut(Math.SQRT1_2, Math.SQRT1_2, 2);
  const peak = Math.max(...E, ...Hc), db = v => 10 * Math.log10(Math.max(v, 1e-30) / peak);
  const dir = 10 * Math.log10(4 * Math.PI * peak / (lam * lam * pt));
  const width = P => { const i0 = (N - 1) / 2; let i = i0; while (i < N - 1 && P[i] > peak / 2) i++; const t = (P[i - 1] - peak / 2) / (P[i - 1] - P[i]); return 2 * ((i - 1 - i0) + t) * (2 * tmax / (N - 1)); };
  const lobe = P => { let best = null; for (let i = (N + 1) / 2; i < N - 1; i++) if (P[i] > P[i - 1] && P[i] >= P[i + 1] && P[i] < peak / 2) { best = db(P[i]); break; } return best; };
  const R = { th, E: E.map(db), H: Hc.map(db), X: X.map(db), dir, hpbw: [width(E), width(Hc)], lobes: [lobe(E), lobe(Hc)], xpol: Math.max(...X.map(db)) };
  if (pmemo.size > 40) pmemo.clear();
  pmemo.set(key, R);
  return R;
}
