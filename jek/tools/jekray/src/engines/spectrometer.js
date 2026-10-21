import { splitRoot } from '../core/coherence.js';
import { getEl } from '../state/elements.js';
import { lastTrace, sourceLines } from './trace.js';
import { arrivalField, arrivalWindow, deviceMemo, erfA, faceArrivals, groupsOf } from './fibre-face.js';
import { SPEC_SENSORS } from '../parts/spectrometer.js';

/* ==========================================================================
   A spectrometer's reading. The light through its entrance (the part of each beam or ray on the slit, or a fibre entrance's core,
   and within its NA) arrives as lines: one for each source and wavelength, as wide as the source's own line (its coherence length's,
   or a pulse's bandwidth at its transform limit). On the array each line is spread by the instrument's resolution, a Gaussian
   whose width is the entrance's image and two pixels added in quadrature, times the dispersion (the range over the array's
   length), and each pixel takes what falls on it. Counts are its photoelectrons over the integration time (the sensor's quantum
   efficiency at the pixel's wavelength), with shot, dark and read noise, and the full well where it saturates.
   ========================================================================== */
const H_C = 6.62607015e-34 * 2.99792458e8;          // J m
const C_NMS = 2.99792458e17;                         // nm/s

/* the sensor's quantum efficiency at a wavelength, nm */
export function specQE(el, nm) {
  const S = SPEC_SENSORS[el.sensor], wl = S.wl, q = S.qe;
  if (nm <= wl[0]) return nm < wl[0] - 1 ? 0 : q[0];
  for (let i = 1; i < wl.length; i++) if (nm <= wl[i]) return q[i - 1] + (q[i] - q[i - 1]) * (nm - wl[i - 1]) / (wl[i] - wl[i - 1]);
  return 0;
}
/* the dispersion, nm per µm along the array, and the resolution (FWHM, nm) */
export const specDispersion = el => (el.wmax - el.wmin) / (el.pixels * el.pitch);
export const specEntranceW = el => (el.entrance === 'fibre' ? el.core : el.slit);
export const specResolution = el => specDispersion(el) * Math.hypot(specEntranceW(el), 2 * el.pitch);

/* a source's own linewidth, nm (FWHM): its coherence length's, or a pulse's at its transform limit */
function lineWidth(src, nm) {
  if (src.coh > 0) return nm * nm * 1e-6 / src.coh;
  if (src.tau > 0) return nm * nm * 0.441 / (src.tau * 1e-15) / C_NMS;
  return 0;
}
/* is a point of the face (u across the bench, v up, mm) in the entrance? */
const inEntrance = (el, u, v) => el.entrance === 'fibre' ? Math.hypot(u, v) <= el.core / 2000 : Math.abs(u) <= el.slit / 2000 && Math.abs(v) <= el.slitH / 2;

/* the light through the entrance as lines: [{nm, mw, w, name}], with the power arriving on the face and through the entrance */
export function specLines(el) {
  return deviceMemo(el, () => {
    const lines = [], add = (src, nm, mw) => {
      if (!(mw > 0)) return;
      const w = lineWidth(src, nm), k = nm.toFixed(5) + '|' + w.toPrecision(4) + '|' + src.id, q = lines.find(x => x.k === k);
      if (q) q.mw += mw; else lines.push({ k, nm, mw, w, name: src.name || '' });
    };
    let face = 0, thru = 0;
    const sinNA = el.na;
    // Gaussian launches: |E|^2 over the entrance, the beam's fields added within each launch, if it comes within the NA
    for (const G of groupsOf(faceArrivals(el))) {
      const root = splitRoot(G[0].src), P0 = G[0].b.lmw || 0;
      const W = arrivalWindow(G, Infinity), sinA = Math.sqrt(Math.max(0, 1 - G[0].ldx * G[0].ldx));
      const integrate = (u0, u1, v0, v1, keep) => {
        if (!(u1 > u0) || !(v1 > v0)) return 0;
        const N = 96, du = (u1 - u0) / N, dv = (v1 - v0) / N;
        let pw = 0;
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          const u = u0 + (i + 0.5) * du, v = v0 + (j + 0.5) * dv;
          if (keep && !keep(u, v)) continue;
          let e0 = 0, e1 = 0, e2 = 0, e3 = 0;
          for (const A of G) { const E = arrivalField(A, u, v); e0 += E[0]; e1 += E[1]; e2 += E[2]; e3 += E[3]; }
          pw += e0 * e0 + e1 * e1 + e2 * e2 + e3 * e3;
        }
        return pw * du * dv * P0;
      };
      const half = el.length / 2;
      face += integrate(Math.max(W[0], -half), Math.min(W[1], half), Math.max(W[2], -half), Math.min(W[3], half));
      const hu = el.entrance === 'fibre' ? el.core / 2000 : el.slit / 2000, hv = el.entrance === 'fibre' ? el.core / 2000 : el.slitH / 2;
      const p = sinA <= sinNA + 1e-9 ? integrate(Math.max(W[0], -hu), Math.min(W[1], hu), Math.max(W[2], -hv), Math.min(W[3], hv), (u, v) => inEntrance(el, u, v)) : 0;
      thru += p; add(root, G[0].nm, p);
    }
    // ray fans, ray by ray: each launched ray carries its share of its source's power
    for (const t of (lastTrace.screens[el.id] || [])) {
      if (t.chief) continue;
      const src = getEl(t.id.split(':')[0]);
      if (!src || src.gauss) continue;
      const root = splitRoot(src), mw = t.w * (root.power || 0) / (Math.max(1, src.rays) * sourceLines(src).length);
      face += mw;
      const sz = t.dz ? t.dz / Math.hypot(1, t.dz) : 0, sinA = Math.hypot(t.dly || 0, sz);
      if (!inEntrance(el, t.y, t.z || 0) || sinA > sinNA + 1e-9) continue;
      thru += mw; add(root, t.nm, mw);
    }
    return { lines: lines.sort((a, b) => a.nm - b.nm), face, thru };
  }, 'spec');
}

/* the array's reading: each pixel's wavelength, power (mW), electrons, and its noise; with what it saturates at */
export function specTrace(el, L = specLines(el)) {
  return deviceMemo(el, () => {
    const n = el.pixels, d = (el.wmax - el.wmin) / n, R = specResolution(el), t = el.tint * 1e-3;
    const nm = new Float64Array(n), mw = new Float64Array(n), e = new Float64Array(n), raw = new Float64Array(n), sd = new Float64Array(n);
    for (let i = 0; i < n; i++) nm[i] = el.wmin + (i + 0.5) * d;
    for (const ln of L.lines) {
      const W = Math.hypot(ln.w, R), s = W / (2 * Math.sqrt(2 * Math.LN2));
      const i0 = Math.max(0, Math.floor((ln.nm - 6 * s - el.wmin) / d)), i1 = Math.min(n - 1, Math.ceil((ln.nm + 6 * s - el.wmin) / d));
      for (let i = i0; i <= i1; i++) {
        const a = (el.wmin + i * d - ln.nm) / (s * Math.SQRT2), b = (el.wmin + (i + 1) * d - ln.nm) / (s * Math.SQRT2);
        mw[i] += ln.mw * 0.5 * (erfA(b) - erfA(a));
      }
    }
    let sat = false;
    for (let i = 0; i < n; i++) {
      const photons = mw[i] * 1e-3 * t / (H_C / (nm[i] * 1e-9));
      const el0 = photons * specQE(el, nm[i]), dk = el.dark * t;
      raw[i] = el0; e[i] = Math.min(el.well, el0);
      if (el0 + dk > el.well) sat = true;
      sd[i] = Math.sqrt(el0 + dk + el.read * el.read);
    }
    return { nm, mw, e, raw, sd, sat, R, d };
  }, 'spect');
}

/* what the panel and the scripts read: the strongest peak's wavelength and width (FWHM, from the trace), the
   resolution, the power through the entrance and its share of what reaches the face, and the signal-to-noise at the peak */
export function specReading(el) {
  const L = specLines(el), T = specTrace(el, L), n = T.nm.length;
  // the peak and its width from the light itself, saturated or not (a saturated array's flat top would widen it); the counts as read
  const E = T.raw;
  let k = -1, best = 0;
  for (let i = 0; i < n; i++) if (E[i] > best) { best = E[i]; k = i; }
  const out = { R: T.R, mw: L.thru, face: L.face, share: L.face > 0 ? L.thru / L.face : null, sat: T.sat, lines: L.lines, peak: null, fwhm: null, snr: null, counts: Math.min(el.well, best) };
  if (k < 0 || !(best > 0)) return out;
  const half = best / 2;
  let a = k, b = k;
  while (a > 0 && E[a] > half) a--;
  while (b < n - 1 && E[b] > half) b++;
  const xa = E[a] > half ? T.nm[a] : T.nm[a] + (half - E[a]) / (E[a + 1] - E[a]) * T.d;
  const xb = E[b] > half ? T.nm[b] : T.nm[b] - (half - E[b]) / (E[b - 1] - E[b]) * T.d;
  // the peak: a Gaussian through the highest pixel and its two neighbours (a parabola in the log), else the highest pixel
  let peak = T.nm[k];
  if (k > 0 && k < n - 1 && E[k - 1] > 0 && E[k + 1] > 0) {
    const l0 = Math.log(E[k - 1]), l1 = Math.log(E[k]), l2 = Math.log(E[k + 1]), dn = l0 - 2 * l1 + l2;
    if (dn < 0) peak += 0.5 * (l0 - l2) / dn * T.d;
  }
  // (saturated, the signal-to-noise is not a reading: the counts are the full well's)
  return Object.assign(out, { peak, fwhm: xb - xa, snr: T.sat ? null : best / T.sd[k] });
}
