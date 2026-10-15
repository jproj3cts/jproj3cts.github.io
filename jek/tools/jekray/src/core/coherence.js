import { getEl } from '../state/elements.js';

/* ---------- Coherence ----------
   A source's coherence length Lc (c over its linewidth) sets how well two branches of its
   light interfere after paths that differ by dL: |gamma| = exp(-pi |dL| / Lc) for a
   Lorentzian line (a laser), exp(-(pi dL / Lc)^2 / 4 ln 2) for a Gaussian one (an LED, a
   Doppler-broadened line). Wherever fields of one launch add, the cross term of each pair is
   weighted by it. Lc = 0 means a single frequency: every cross term counts in full.
   A beam with M^2 above 1 is a Gaussian Schell-model beam: an incoherent sum of the
   Hermite-Gauss modes of its embedded Gaussian (the one whose width is 1/M of the real
   beam's), weighted (1 - k) k^m in each direction with k = (M^2 - 1)/(M^2 + 1), which
   makes its M^2 exactly M^2. */
export function cohGamma(src) {
  if (!src || !(src.coh > 0)) return null;
  const Lc = src.coh, gauss = src.lineshape === 'gauss';
  return dL => { const x = Math.abs(dL) / Lc; return gauss ? Math.exp(-((Math.PI * x) ** 2) / (4 * Math.LN2)) : Math.exp(-Math.PI * x); };
}
/* the gamma between every pair of parts of one launch, from their optical paths; null when
   they all cohere in full */
function cohMatrix(src, Ls) {
  const f = cohGamma(src);
  if (!f || Ls.length < 2) return null;
  const n = Ls.length, G = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) G[i * n + j] = f(Ls[i] - Ls[j]);
  return G;
}
/* |sum of v|^2 with each cross term weighted by G; each v a flat [re, im, re, im, ...] */
function pcIntensity(vs, G) {
  const n = vs.length, c = vs.length ? vs[0].length : 0;
  let I = 0;
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
    const a = vs[i], b = vs[j];
    let d = 0;
    for (let k = 0; k < c; k++) d += a[k] * b[k];
    I += (i === j ? 1 : 2 * G[i * n + j]) * d;
  }
  return I;
}
/* The same weighting as a sum of intensities: gamma's eigenvectors split one launch into
   mutually incoherent parts, each a coherent sum of the launch's fields with weights of its
   own. Returns those weights, one array per part, or null when the launch coheres in full.
   Gamma is positive semi-definite (the Fourier transform of a line), so this is exact. */
export function cohModes(src, Ls) {
  const G = cohMatrix(src, Ls);
  if (!G) return null;
  const n = Ls.length, A = Float64Array.from(G), V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {           // Jacobi rotations
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] ** 2;
    if (off < 1e-26) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = A[p * n + q];
      if (Math.abs(apq) < 1e-300) continue;
      const th = (A[q * n + q] - A[p * n + p]) / (2 * apq);
      const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let k = 0; k < n; k++) { const a = A[k * n + p], b = A[k * n + q]; A[k * n + p] = c * a - sn * b; A[k * n + q] = sn * a + c * b; }
      for (let k = 0; k < n; k++) { const a = A[p * n + k], b = A[q * n + k]; A[p * n + k] = c * a - sn * b; A[q * n + k] = sn * a + c * b; }
      for (let k = 0; k < n; k++) { const a = V[k * n + p], b = V[k * n + q]; V[k * n + p] = c * a - sn * b; V[k * n + q] = sn * a + c * b; }
    }
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    const lam = A[k * n + k];
    if (!(lam > 1e-10 * n)) continue;
    const r = Math.sqrt(lam), c = new Float64Array(n);
    for (let i = 0; i < n; i++) c[i] = V[i * n + k] * r;
    out.push(c);
  }
  return out;
}
/* Sources split from one laser (two fibre launches off one coupler, say) are one launch:
   their fields add wherever they meet. Each copy keeps its own power, place, beam and
   polarisation; its wavelength and line are the laser's. It carries a phase against the
   one it is split from, and the extra path its light took before the launch (a length of
   fibre, counted at the group index, which is what sets how the line washes the fringes).
   Its amplitude is taken against the laser's own source, sqrt(P / P_laser), so every power
   worked out for the launch is in the laser source's units. */
export const FIBRE_NG = 1.468;                  // group index of silica fibre near 1 um
export function splitChain(src) {
  if (src.virtual) return [src, src.vRoot];              // from a fibre tip: the laser behind it
  const out = [src], seen = new Set([src.id]);
  let s = src;
  while (s.splitFrom) {
    const p = getEl(s.splitFrom);
    if (!p || p.type !== 'source' || seen.has(p.id)) break;
    seen.add(p.id); out.push(p); s = p;
  }
  return out;
}
export const splitRoot = src => { const c = splitChain(src); return c[c.length - 1]; };
/* extra optical path before the launch against the laser's source, and the phase, radians */
export function splitOffset(src) {
  if (src.virtual) return { lag: src.vLag, ph: 0 };      // its phase is in its amplitudes
  const c = splitChain(src);
  let lag = 0, ph = 0;
  for (let i = 0; i < c.length - 1; i++) { lag += FIBRE_NG * (c[i].splitPath || 0); ph += (c[i].splitPhase || 0) * Math.PI / 180; }
  return { lag, ph };
}
export const lagOf = src => src ? splitOffset(src).lag : 0;

