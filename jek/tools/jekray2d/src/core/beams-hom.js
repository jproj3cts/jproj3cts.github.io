import { clamp } from './constants.js';
import { gsmModes, hermite, laguerre, m2Of } from './pulses.js';
import { deg } from '../state/project.js';

/* ---------- Higher-order beams ----------
   A Gaussian source can launch a Hermite-Gauss mode HG_mn (m nodes across the bench plane, n
   out of it) or a Laguerre-Gauss mode LG_pl (p rings, and for l != 0 a vortex of charge l, its
   phase a delay of l theta / 2 pi waves, as a vortex mask of charge l writes it), of a Gaussian
   of waist w0. Every such beam is carried as a coherent sum of Hermite-Gauss modes of that
   Gaussian: LG_pl is a sum of the HG modes of order 2p + |l|, found once by overlap on the
   waist. Each mode then keeps its own Gouy phase, so a cylindrical lens pair turns LG into HG
   as it does in the lab. Its M^2 is 2m + 1 (and 2n + 1 out of the plane), or 2p + |l| + 1. */
export const isHigherMode = src => !!(src && src.gauss && !src.fibre && (src.tem === 'hg' || src.tem === 'lg'));
export const modeM2 = src => !isHigherMode(src) ? [1, 1]
  : src.tem === 'hg' ? [2 * src.hm + 1, 2 * src.hn + 1] : [2 * src.lp + Math.abs(src.ll) + 1, 2 * src.lp + Math.abs(src.ll) + 1];
/* the width factor the beam's envelope is drawn with, in the bench plane: its M^2 */
export const m2Env = src => m2Of(src) * modeM2(src)[0];
const lgMemo = new Map();
export function lgComps(p, l) {
  const key = p + ',' + l;
  if (lgMemo.has(key)) return lgMemo.get(key);
  const al = Math.abs(l), N = 2 * p + al, K = 241, h = 12 / (K - 1);
  // on a waist of w = 1: HG_mn = H_m(sqrt2 x) H_n(sqrt2 y) e^{-r^2} / sqrt(2^(m+n) m! n!), all of one norm
  const fact = m => { let f = 1; for (let i = 2; i <= m; i++) f *= i; return f; };
  const H = [];
  for (let m = 0; m <= N; m++) { const a = new Float64Array(K), nm = Math.sqrt(Math.pow(2, m) * fact(m)); for (let i = 0; i < K; i++) a[i] = hermite(m, Math.SQRT2 * (-6 + i * h)) / nm; H.push(a); }
  const cr = new Float64Array(N + 1), ci = new Float64Array(N + 1);
  for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
    const x = -6 + i * h, y = -6 + j * h, r2 = x * x + y * y, g = Math.exp(-2 * r2);
    if (g < 1e-30) continue;
    // LG on the waist: (sqrt2 r)^|l| L_p^|l|(2 r^2) e^{-r^2} e^{-i l theta}, in the field's e^{-ikz} convention
    const A = Math.pow(2 * r2, al / 2) * laguerre(p, al, 2 * r2) * g, th = Math.atan2(y, x);
    const ur = A * Math.cos(l * th), ui = -A * Math.sin(l * th);
    for (let k = 0; k <= N; k++) { const hv = H[N - k][i] * H[k][j]; cr[k] += hv * ur; ci[k] += hv * ui; }
  }
  let t = 0; for (let k = 0; k <= N; k++) t += cr[k] * cr[k] + ci[k] * ci[k];
  const out = [];
  for (let k = 0; k <= N; k++) { const a = cr[k] / Math.sqrt(t), b = ci[k] / Math.sqrt(t); if (a * a + b * b > 1e-12) out.push([N - k, k, a, b]); }
  lgMemo.set(key, out);
  return out;
}
/* The parts a source's beam is launched as, added as powers: each { w, c }, its share of the
   power and its coherent sum of Hermite-Gauss modes [m, n, re, im] (the amplitudes of modes of
   one norm, summing to 1 in power). A plain Gaussian is one part of one mode; a beam of M^2
   above 1, one part per mode (gsmModes); a higher-order mode, one part of one or several. */
export function srcModes(src) {
  if (isHigherMode(src)) return [{ w: 1, c: src.tem === 'hg' ? [[src.hm, src.hn, 1, 0]] : lgComps(src.lp, src.ll) }];
  return gsmModes(m2Of(src)).map(([m, n, w]) => ({ w, c: [[m, n, 1, 0]] }));
}
/* A cavity driven by a laser with a line of its own: the circulating power averaged over
   the line. The line is Lc wide in path, 2 pi Lopt / Lc in round-trip phase; the solve's
   power against detuning is sampled over one free spectral range, more finely round each
   resonance, and the line (repeated every free spectral range) weights it. */
export function cavLine(res, Lopt, src) {
  if (!res || !(src && src.coh > 0)) return null;
  const G = 2 * Math.PI * Lopt / src.coh;
  if (!(G > 1e-7)) return null;
  const key = G + '|' + src.lineshape;
  if (res._line && res._line.key === key) return res._line;
  const nodes = new Set();
  const n0 = 4096;
  for (let i = 0; i < n0; i++) nodes.add(-Math.PI + 2 * Math.PI * i / n0);
  // each resonance: find its half width, and sample finely across it
  const sc = res.scan, nS = sc.length, mx = Math.max(...sc);
  for (let i = 0; i < nS; i++) {
    const a = sc[(i - 1 + nS) % nS], b = sc[i], c = sc[(i + 1) % nS];
    if (!(b >= a && b > c && b > 1e-4 * mx)) continue;
    const d0 = -Math.PI + 2 * Math.PI * i / nS, h = res.at(d0).P / 2;
    let lo = 0, hi = Math.PI;
    for (let it = 0; it < 50; it++) { const m = 0.5 * (lo + hi); if (res.at(d0 + m).P > h) lo = m; else hi = m; }
    const hw = Math.max(1e-9, lo);
    for (let k = -64; k <= 64; k++) nodes.add(((d0 + k * hw / 8 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
  }
  const ds = [...nodes].sort((a, b) => a - b), N = ds.length, P = new Float64Array(N), wt = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    P[i] = res.at(ds[i]).P;
    const prev = i ? ds[i - 1] : ds[N - 1] - 2 * Math.PI, next = i < N - 1 ? ds[i + 1] : ds[0] + 2 * Math.PI;
    wt[i] = 0.5 * (next - prev);
  }
  const gauss = src.lineshape === 'gauss', sg = G / (2 * Math.sqrt(2 * Math.LN2));
  const a2 = G / 2, ea = Math.exp(-a2), e2a = ea * ea;
  const shape = x => {                       // the line, repeated every 2 pi
    // a Lorentzian's repeats sum in closed form: sinh a / (2a (cosh a - cos x))
    if (!gauss) return (1 - e2a) / (2 * a2 * (1 + e2a - 2 * ea * Math.cos(x)));
    const k0 = Math.ceil((-x - 8 * sg) / (2 * Math.PI)), k1 = Math.min(k0 + 40, Math.floor((-x + 8 * sg) / (2 * Math.PI)));
    let v = 0;
    for (let k = k0; k <= k1; k++) { const u = x + 2 * Math.PI * k; v += Math.exp(-u * u / (2 * sg * sg)); }
    return v;
  };
  const avg = d => { let a = 0, b = 0; for (let i = 0; i < N; i++) { const w = shape(ds[i] - d) * wt[i]; a += w * P[i]; b += w; } return b > 0 ? a / b : 0; };
  res._line = { key, avg, G };
  return res._line;
}

export function fanFromGauss(el) {
  const lam = el.wavelength * 1e-6 * m2Of(el);
  const qr = -el.z0, qi = Math.PI * el.w0 * el.w0 / lam;
  const den = qr * qr + qi * qi;
  if (!den) return;
  const invR = qr / den, invI = -qi / den;
  const wsrc = Math.sqrt(Math.max(0, -lam / (Math.PI * invI))) * Math.sqrt(modeM2(el)[0]);
  el.width = 2 * wsrc;
  el.divergence = clamp(2 * Math.atan(wsrc * invR) / deg, -179, 179);
}

/* Beam radius, wavefront radius and waist from the complex parameter q */
export function beamAt(qr, qi, n, nm, M2) {
  const den = qr * qr + qi * qi;
  if (!den) return null;
  const invR = qr / den, invI = -qi / den;          // 1/q
  const lam = nm * 1e-6;                             // mm, in vacuum
  const M = Math.sqrt(M2 || 1);                      // q is the embedded Gaussian's; the beam is M times wider
  const w = M * Math.sqrt(Math.max(0, -lam / (Math.PI * n * invI)));
  const zR = qi;
  return {
    w, zR,
    R: Math.abs(invR) < 1e-12 ? Infinity : 1 / invR,
    waistDist: -qr,                                  // positive: the waist is still ahead
    w0: M * Math.sqrt(Math.max(0, lam * qi / (Math.PI * n))),
  };
}
