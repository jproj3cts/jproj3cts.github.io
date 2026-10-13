import { IN_WORKER, TEST_MODE } from './constants.js';
import { C_MM } from './modulators.js';
import { splitRoot } from './coherence.js';
import { wavelengthColour } from './colour.js';
import { setLastTraceKey } from '../engines/trace.js';
import { requestRender } from '../ui/render.js';
import { clamp } from '../ui/params.js';
import { applyFibre } from '../engines/fibre-face.js';
import { setFibreNetMemo } from '../engines/fibre.js';
import { fanFromGauss } from '../ui/panel-cavity.js';
import { cdft } from '../engines/field2d.js';
import { fieldWorker, fwRequest } from '../worker/field-worker.js';

/* ---------- Short pulses ----------
   A mode-locked laser's pulse is its spectrum with a spectral phase. The duration given is
   the intensity FWHM of the pulse at its transform limit; the time-bandwidth product of the
   shape sets its bandwidth, and that bandwidth its coherence length (c over the line, Gaussian,
   so white-light fringes come out right). What the optics do to the pulse is worked out from
   reference rays traced at wavelengths across that spectrum: their optical paths are its
   spectral phase. */
const PULSE_TBP = { gauss: 0.4413, sech2: 0.3148 };
export const PULSE_SAMPLES = 33;                 // wavelengths traced across the spectrum
/* out to this many FWHM each side of the centre: a sech² spectrum's wings fall slowly, and
   cutting them at 2.5 would lengthen the pulse by 5% */
const pulseSpan = P => P.pshape === 'gauss' ? 2.5 : 4;
export const C_FS = 299.792458;                  // light, nm per fs (so also um per ps)
export const pulseDnu = src => PULSE_TBP[src.pshape === 'gauss' ? 'gauss' : 'sech2'] / (src.tau * 1e-15);   // Hz, FWHM
/* the pulse a source launches: its own, or the laser's it is split from */
export function pulseOf(src) {
  if (!src) return null;
  const r = src.virtual ? src : splitRoot(src);
  return r && r.tau > 0 ? r : null;
}
/* A source's coherence, one of three: a single frequency (every path interferes in full), a
   line of its own (a coherence length, Lorentzian or Gaussian), or broadband, incoherent light
   (an LED, a lamp through a filter) given by its bandwidth in nm: a Gaussian line whose
   coherence length lambda^2 / bandwidth is a few wavelengths, so only near-equal paths still
   make fringes (white-light fringes) and its own light adds as powers everywhere else.
   A pulse sets the line itself. */
export const CMODES = ['single', 'line', 'broad'];
export const isLaserLike = e => e && (e.type === 'source' || (e.type === 'fcomp' && e.kind === 'laser'));
export function syncLine(el) {
  if (el.tau > 0 || el.splitFrom) return;
  if (el.cmode === 'single') el.coh = 0;
  else if (el.cmode === 'broad') { el.coh = el.wavelength * el.wavelength * 1e-6 / Math.max(1e-3, el.bw); el.lineshape = 'gauss'; }
}
export function applyPulse(src) {
  if (!(src.tau > 0)) return;
  src.coh = C_MM / pulseDnu(src);        // mm: the pulse's own coherence length
  src.lineshape = 'gauss';
}
/* the spectrum's samples as offsets from the centre, rad/fs, with the relative spectral
   intensity of the shape at each */
export function pulseGrid(src) {
  const P = pulseOf(src);
  if (!P) return null;
  const w0 = 2 * Math.PI * C_FS / P.wavelength, dW = 2 * Math.PI * pulseDnu(P) * 1e-15;   // rad/fs
  const out = [];
  for (let j = 0; j < PULSE_SAMPLES; j++) {
    const d = (j / (PULSE_SAMPLES - 1) * 2 - 1) * pulseHalf(P);
    out.push({ j, d, nm: 2 * Math.PI * C_FS / (w0 + d), S: pulseSpectrum(P, d) });
  }
  return { w0, dW, samples: out, src: P };
}
/* how far out the spectrum reaches each side, rad/fs: its shape's span, or where a spectrum
   reshaped by a fibre's nonlinearity (P.spec) still carries light */
export const pulseHalf = P => P.spec ? P.spec.half : pulseSpan(P) * 2 * Math.PI * pulseDnu(P) * 1e-15;
/* a reshaped spectrum's complex amplitude at d (rad/fs), [re, im], its peak 1 */
export function specAt(sp, d) {
  const x = (d - sp.d0) / sp.dd, i = Math.floor(x);
  if (i < 0 || i >= sp.re.length - 1) return [0, 0];
  const u = x - i;
  return [sp.re[i] * (1 - u) + sp.re[i + 1] * u, sp.im[i] * (1 - u) + sp.im[i + 1] * u];
}
/* spectral intensity at an offset d (rad/fs) from the centre, 1 at the centre */
export function pulseSpectrum(P, d) {
  if (P.spec) { const a = specAt(P.spec, d); return a[0] * a[0] + a[1] * a[1]; }
  const dW = 2 * Math.PI * pulseDnu(P) * 1e-15;
  if (P.pshape === 'gauss') return Math.exp(-4 * Math.LN2 * (d / dW) ** 2);
  const x = 0.8814 * 2 * d / dW;            // sech^2 with this FWHM
  const c = Math.cosh(x);
  return 1 / (c * c);
}
/* a chirped mirror's extra path at nm, for a pulse centred at nm0: GDD (fs^2) / 2 times the
   squared offset, as an optical path */
export function gddPath(gdd, nm, nm0) {
  if (!gdd || !nm0) return 0;
  const d = 2 * Math.PI * C_FS * (1 / nm - 1 / nm0);        // rad/fs
  return 0.5 * gdd * d * d * nm * 1e-6 / (2 * Math.PI);     // mm: phase over k
}
/* a fibre's dispersion, ps/(nm km): its own if set, else standard single-mode fibre
   (zero dispersion at 1313 nm, slope 0.092 ps/(nm^2 km)) */
export const fibreDisp = (F, nm) => F && F.disp !== null && F.disp !== undefined && isFinite(F.disp) ? +F.disp : 0.092 / 4 * (nm - 1313 ** 4 / nm ** 3);
/* its group-delay dispersion, fs^2, over len metres: beta2 L = -D lambda^2 L / (2 pi c) */
export const fibreGDD = (F, nm, len) => -fibreDisp(F, nm) * 1e-3 * (nm * nm) * len / (2 * Math.PI * C_FS) * 1e3;
/* A fibre's Kerr nonlinearity, gamma = 2 pi n2 / (lambda A_eff), 1/(W km): its own if set, else
   fused silica's n2 (2.6e-20 m^2/W) over the mode area of standard single-mode fibre (80 um^2),
   or a multimode core's (about 2000 um^2) */
export const fibreGamma = (F, nm) => F && F.gamma !== null && F.gamma !== undefined && isFinite(F.gamma) ? +F.gamma : 2 * Math.PI * 2.6e-20 / (nm * 1e-9 * (F && F.ftype === 'mm' ? 2000e-12 : 80e-12)) * 1e3;
/* Self-phase modulation: a pulse through len metres of fibre, by the nonlinear Schroedinger
   equation, split-step Fourier (symmetric), with the fibre's loss, dispersion (beta2) and its
   slope (beta3) and its Kerr nonlinearity gamma:
     dA/dz = -alpha/2 A + i (beta2/2 w^2 + beta3/6 w^3) A (in frequency) + i gamma |A|^2 A (in time).
   The pulse comes in as the laser's (P: its shape, duration and chirp) with the GDD gathered
   since, or as the spectrum an earlier fibre left (sp); Pavg is its average power (W). Returns
   the spectrum it leaves with (its peak 1, and the B-integral it took, rad), or null where the
   nonlinear phase would stay under 0.01 rad, which leaves the pulse to the linear model. */
/* The pulse through a fibre with its nonlinearity, as the network asks for it: each answer kept
   by what it was worked out from, so none is worked out twice; on the page, worked out in the
   field worker, the fibre's last answer standing meanwhile (none the first time: the pulse is
   taken through linearly), and the bench traced again when it comes */
export const spmCache = new Map(), spmLast = new Map(), spmAsked = new Set();
export function fibreSPMLater(F, nm, len, P, Pavg, gdd, sp) {
  const key = JSON.stringify([F, nm, len, [P.tau, P.pshape, P.rep, P.gdd0, P.spec ? P.spec.key || P.spec.half : null], Pavg, gdd, sp ? sp.key || [sp.half, sp.d0, sp.dd] : null]);
  if (spmCache.has(key)) return spmCache.get(key);
  const keep = r => {
    if (r) r.key = key;
    spmCache.set(key, r || null); spmLast.set(F.id, r || null);
    while (spmCache.size > 200) spmCache.delete(spmCache.keys().next().value);
    return r || null;
  };
  if (TEST_MODE || IN_WORKER || !fieldWorker()) return keep(fibreSPM(F, nm, len, P, Pavg, gdd, sp));
  if (!spmAsked.has(key)) {
    spmAsked.add(key);
    fwRequest('spm', 'spm:' + key, { F, nm, len, P, Pavg, gdd, sp })
      .then(r => { keep(r); }, () => { keep(fibreSPM(F, nm, len, P, Pavg, gdd, sp)); })
      .then(() => { spmAsked.delete(key); setFibreNetMemo({ key: null, net: null }); setLastTraceKey(null); requestRender(); });
  }
  return spmLast.has(F.id) ? spmLast.get(F.id) : null;
}
export function fibreSPM(F, nm, len, P, Pavg, gdd, sp) {
  const g = fibreGamma(F, nm) * 1e-3, Ep = Pavg / (P.rep * 1e6);                 // 1/(W m); J a pulse
  const dW0 = 2 * Math.PI * pulseDnu(P) * 1e-15, tl = P.tau;                   // rad/fs; fs
  const alpha = (F.loss || 0) * Math.LN10 / 10 / 1000, Leff = alpha > 0 ? (1 - Math.exp(-alpha * len)) / alpha : len;
  // the most it could be: the pulse at its transform limit all the way
  if (!(g > 0) || g * (Ep / (tl * 1e-15)) * Leff < 0.01) return null;
  const w0 = 2 * Math.PI * C_FS / nm, b2 = fibreGDD(F, nm, 1), hW = 1e-3 * w0;
  const b3 = (fibreGDD(F, 2 * Math.PI * C_FS / (w0 + hW), 1) - fibreGDD(F, 2 * Math.PI * C_FS / (w0 - hW), 1)) / (2 * hW);   // fs^3/m
  // the grid: wide enough in frequency for the spectrum it will broaden to, long enough in
  // time for the pulse it will spread to
  const Bmax = g * (Ep / (tl * 1e-15)) * Leff, half0 = sp ? sp.half : pulseSpan(P) * dW0;
  const Dmax = Math.max(half0, 8 * dW0) * Math.min(40, 1.5 + Bmax), dt = Math.PI / Dmax;
  // (a pulse spreads by its GDD times its bandwidth, which the nonlinearity widens)
  const spread = (Math.abs(b2 * len) + Math.abs(gdd)) * 4 * Math.max(sp ? sp.half / 3 : dW0, dW0) * (1 + Bmax) + 20 * tl;
  let N = 1024; while (N * dt < 2 * spread && N < 32768) N *= 2;
  const dw = 2 * Math.PI / (N * dt);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let m = 0; m < N; m++) {
    const d = (m - N / 2) * dw;
    let a;
    if (sp) a = specAt(sp, d);
    else { const S = pulseSpectrum(P, d); a = [Math.sqrt(S), 0]; }
    const ph = 0.5 * ((sp ? 0 : P.gdd0 || 0) + gdd) * d * d, c = Math.cos(ph), sn = Math.sin(ph);
    re[m] = a[0] * c - a[1] * sn; im[m] = a[0] * sn + a[1] * c;
  }
  const toTime = () => cdft(re, im, -1), toFreq = () => { cdft(re, im, 1); for (let i = 0; i < N; i++) { re[i] /= N; im[i] /= N; } };
  toTime();
  // in watts: the pulse's energy over it
  let e = 0; for (let i = 0; i < N; i++) e += re[i] * re[i] + im[i] * im[i];
  const k0 = Math.sqrt(Ep / (e * dt * 1e-15));
  for (let i = 0; i < N; i++) { re[i] *= k0; im[i] *= k0; }
  let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, re[i] * re[i] + im[i] * im[i]);
  const Bnow = g * peak * Leff;
  if (Bnow < 0.01) return null;
  // steps: a small fraction of a radian of nonlinear phase, and of the dispersion length
  const LD = tl * tl / Math.max(1e-9, Math.abs(b2)), steps = Math.round(clamp(Math.max(20 * Bnow, 8 * len / LD), 20, 4000)), dz = len / steps;
  const lin = new Float64Array(2 * N);
  for (let m = 0; m < N; m++) { const d = (m - N / 2) * dw, ph = (0.5 * b2 * d * d + b3 / 6 * d * d * d) * dz / 2; lin[2 * m] = Math.cos(ph) * Math.exp(-alpha * dz / 4); lin[2 * m + 1] = Math.sin(ph) * Math.exp(-alpha * dz / 4); }
  const linStep = () => { toFreq(); for (let m = 0; m < N; m++) { const c = lin[2 * m], sn = lin[2 * m + 1], x = re[m] * c - im[m] * sn; im[m] = re[m] * sn + im[m] * c; re[m] = x; } toTime(); };
  let B = 0;
  for (let st = 0; st < steps; st++) {
    linStep();
    let pk = 0;
    for (let i = 0; i < N; i++) { const I = re[i] * re[i] + im[i] * im[i], ph = g * I * dz, c = Math.cos(ph), sn = Math.sin(ph), x = re[i] * c - im[i] * sn; im[i] = re[i] * sn + im[i] * c; re[i] = x; if (I > pk) pk = I; }
    B += g * pk * dz;
    linStep();
  }
  toFreq();
  // kept where it carries light, its peak 1
  let mx = 0; for (let m = 0; m < N; m++) mx = Math.max(mx, re[m] * re[m] + im[m] * im[m]);
  let lo = N, hi = -1; for (let m = 0; m < N; m++) if (re[m] * re[m] + im[m] * im[m] > 1e-7 * mx) { lo = Math.min(lo, m); hi = Math.max(hi, m); }
  lo = Math.max(0, lo - 2); hi = Math.min(N - 1, hi + 2);
  const n = hi - lo + 1, a = 1 / Math.sqrt(mx), out = { d0: (lo - N / 2) * dw, dd: dw, re: new Float64Array(n), im: new Float64Array(n), B };
  for (let m = lo; m <= hi; m++) { out.re[m - lo] = re[m] * a; out.im[m - lo] = im[m] * a; }
  out.half = Math.max(Math.abs(out.d0), Math.abs(out.d0 + (n - 1) * dw));
  // its width against the pulse's own (rms)
  const rms = (f, x0, dx) => { let s0 = 0, s1 = 0, s2 = 0; for (let i = 0; i < f.length; i++) { const x = x0 + i * dx; s0 += f[i]; s1 += f[i] * x; s2 += f[i] * x * x; } return Math.sqrt(Math.max(0, s2 / s0 - (s1 / s0) ** 2)); };
  const Iout = Array.from(out.re, (v, i) => v * v + out.im[i] ** 2);
  const w0s = []; for (let m = -200; m <= 200; m++) w0s.push(pulseSpectrum(P, m * 4 * dW0 / 200));
  out.broad = rms(Iout, out.d0, dw) / Math.max(1e-30, rms(w0s, -4 * dW0, 4 * dW0 / 200));
  out.peakIn = peak; out.N = N; out.steps = steps;
  return out;
}
/* a split copy takes the laser's wavelengths and line */
export function syncSplit(src) {
  const r = splitRoot(src);
  if (r === src || src.virtual) return;
  const moved = src.wavelength !== r.wavelength;
  src.wavelength = r.wavelength; src.lines = (r.lines || []).slice(); src.coh = r.coh; src.lineshape = r.lineshape;
  src.tau = r.tau; src.pshape = r.pshape; src.rep = r.rep; src.gdd0 = r.gdd0;
  if (moved) {
    if (src.colourAuto) src.colour = wavelengthColour(src.wavelength);
    if (src.fibre) applyFibre(src); else if (src.gauss) fanFromGauss(src);
  }
}
export const m2Of = src => src && src.gauss && src.m2 > 1 && !(src.tem === 'hg' || src.tem === 'lg') ? src.m2 : 1;
/* The Hermite-Gauss modes a beam of this M^2 is summed over, as [m, n, weight], strongest
   first: those above 0.2% of the power, at most 36, the rest shared out among them */
export function gsmModes(m2) {
  if (!(m2 > 1)) return [[0, 0, 1]];
  const k = (m2 - 1) / (m2 + 1), per = [];
  for (let m = 0; m < 16; m++) per.push((1 - k) * Math.pow(k, m));
  const all = [];
  for (let m = 0; m < per.length; m++) for (let n = 0; n < per.length; n++) { const w = per[m] * per[n]; if (w >= 2e-3) all.push([m, n, w]); }
  all.sort((a, b) => b[2] - a[2]);
  const kept = all.slice(0, 36);
  // the modes left out are the widest: the kept ones are re-weighted, (1 - k') k'^(m + n)
  // with k' found so that their mean of 2m + 1 (the second moment's share) is M^2 exactly
  const mean = k => { let s = 0, t = 0; for (const [m, n] of kept) { const w = Math.pow(k, m + n); s += w * (2 * m + 1); t += w; } return s / t; };
  let lo = 0, hi = 0.999;
  if (mean(hi) > m2) for (let it = 0; it < 60; it++) { const mid = 0.5 * (lo + hi); if (mean(mid) < m2) lo = mid; else hi = mid; }
  const kk = 0.5 * (lo + hi), ws = kept.map(([m, n]) => Math.pow(kk, m + n)), tot = ws.reduce((a, v) => a + v, 0);
  return kept.map((v, i) => [v[0], v[1], ws[i] / tot]);
}
/* the physicists' Hermite polynomial H_n(u) */
export function hermite(n, u) {
  if (n === 0) return 1;
  let a = 1, b = 2 * u;
  for (let k = 1; k < n; k++) { const c = 2 * u * b - 2 * k * a; a = b; b = c; }
  return b;
}
/* the generalised Laguerre polynomial L_p^a(x) */
export function laguerre(p, a, x) {
  if (p === 0) return 1;
  let l0 = 1, l1 = 1 + a - x;
  for (let k = 1; k < p; k++) { const l2 = ((2 * k + 1 + a - x) * l1 - (k + a) * l0) / (k + 1); l0 = l1; l1 = l2; }
  return l1;
}
