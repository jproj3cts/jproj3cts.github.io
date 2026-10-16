import { fft2, paraxHeight, psfAnalysis, relIllum, spotDiagram } from './lens-analysis.js';
import { rayAt } from './lens-engine.js';

/* ==========================================================================
   Image simulation: a picture as the design would form it
   The picture is the object, placed so that its paraxial image fills the field (its half-diagonal the largest
   field's paraxial image height), or a patch of it at a chosen pitch about a chosen point. In linear light, each
   colour channel at the design wavelength nearest it (R 640, G 550, B 460 nm):
     1. distortion: each image point is moved to where the real chief ray of that wavelength lands, so lateral
        colour shows; the picture is sampled backwards from the image, so nothing is left out;
     2. relative illumination: each point dimmed by the exit pupil's projected solid angle against the axis's,
        the vignetting in it;
     3. blur: the PSF (by FFT, or from the rays where the spot is too large for its window) at a grid of points
        over the image, each turned to its point's azimuth (the design being round, the PSF along +y turned),
        convolved with the whole image by FFT, and blended between the grid's points.
   ========================================================================== */
const IM_D2R = Math.PI / 180;
const TARGETS = [640, 550, 460];

/* a design the simulation can take: round about its axis (no tilts or decentres, cylinders or freeforms) */
export const imsimTraceable = P => !P.surfaces.some(s => s.tilt || s.dtilt || s.dec || s.cyl || (s.F && s.F.length));

/* the work, a step at a time: next() does one and says when all are done; result() then gives the image.
   src: { w, h, ch: [R, G, B] Float32Arrays of linear light, 0 to 1, row 0 at the top }.
   o: { mode: 'whole' | 'patch', at: the patch's middle, the paraxial image of the picture's middle (mm, [x, y]; the patch
   is drawn about where its real chief ray lands), pitch (mm; patch), grid (PSFs a side) } */
export function imsimPlan(A, src, o) {
  o = o || {};
  const S0 = A.Sp, W = src.w, H = src.h, fmax = Math.max(...A.c.fields.map(f => Math.abs(f.deg))) || 1e-9;
  const nmOf = i => A.S[i].nm;
  // each channel's wavelength: the design's nearest its colour
  const pick = t => A.S.reduce((b, S, i) => Math.abs(S.nm - t) < Math.abs(nmOf(b) - t) ? i : b, 0);
  const chW = TARGETS.map(pick), uniq = [...new Set(chW)], tabled = [...new Set(chW.concat([A.c.primary]))];
  // the paraxial image height of field f, and its inverse
  const par = f => paraxHeight(S0, f), k1 = Math.abs(A.finite ? par(1) : par(45)), rmax = Math.abs(par(fmax));
  const fOf = r => A.finite ? r / k1 : Math.atan(r / k1) / IM_D2R;
  // the real chief ray's height of wavelength wi against the paraxial height, along the field
  const K = 64, fs = Array.from({ length: K + 1 }, (_, i) => fmax * i / K);
  const dist = {};
  for (const wi of tabled) {
    const R = new Float64Array(8), d = fs.map(f => {
      const g = f || fmax * 1e-3, C = rayAt(A.S[wi], g * IM_D2R, 0, 0, R);
      return C && C[7] === 0 ? C[1] / par(g) : NaN;
    });
    for (let i = 0; i <= K; i++) if (!isFinite(d[i])) d[i] = i ? d[i - 1] : 1;
    dist[wi] = d;
  }
  const ri = relIllum(A, 17, 32).ri;
  // a table along the field, from the axis to the largest field, read between its points
  const lerpF = (tab, f) => { const n = tab.length - 1, t = Math.min(n, Math.max(0, f / fmax * n)), i = Math.min(n - 1, Math.floor(t)), u = t - i; return tab[i] + (tab[i + 1] - tab[i]) * u; };
  // where an ideal image radius r lands, for wavelength wi; and back (by a table, the map increasing)
  const T = 1024, back = {};
  for (const wi of uniq) {
    const rq = Float64Array.from({ length: T + 1 }, (_, i) => rmax * i / T), g = rq.map(r => lerpF(dist[wi], fOf(r)) * r);
    back[wi] = r => {
      if (r > g[T] * (1 + 1e-12)) return null;
      let lo = 0, hi = T;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g[m] <= r) lo = m; else hi = m; }
      const u = g[hi] > g[lo] ? (r - g[lo]) / (g[hi] - g[lo]) : 0;
      return rq[lo] + (rq[hi] - rq[lo]) * Math.max(0, Math.min(1, u));
    };
  }
  // the image's pixels on the image plane: x right, y up, row 0 at the top
  // a patch: the picture's middle at the ideal point at, the image's where that point's real chief ray (primary) lands
  const whole = o.mode !== 'patch', p = whole ? rmax / (0.5 * Math.hypot(W - 1, H - 1)) : o.pitch, at = whole ? [0, 0] : (o.at || [0, 0]);
  const rAt = Math.hypot(at[0], at[1]), dAt = rAt > 0 ? lerpF(dist[A.c.primary], fOf(rAt)) : 1, atOut = [at[0] * dAt, at[1] * dAt];
  const X = i => atOut[0] + (i - (W - 1) / 2) * p, Y = j => atOut[1] + ((H - 1) / 2 - j) * p;
  // the picture's value at an image point (bilinear; nothing outside it)
  const sample = (c, x, y) => {
    const fi = (x - at[0]) / p + (W - 1) / 2, fj = (H - 1) / 2 - (y - at[1]) / p;
    if (fi < -0.5 || fj < -0.5 || fi > W - 0.5 || fj > H - 0.5) return 0;
    const i0 = Math.max(0, Math.min(W - 2, Math.floor(fi))), j0 = Math.max(0, Math.min(H - 2, Math.floor(fj))), u = Math.max(0, Math.min(1, fi - i0)), v = Math.max(0, Math.min(1, fj - j0));
    const a = src.ch[c], q = j0 * W + i0, w1 = W > 1 ? 1 : 0, h1 = H > 1 ? W : 0;
    return (a[q] * (1 - u) + a[q + w1] * u) * (1 - v) + (a[q + h1] * (1 - u) + a[q + h1 + w1] * u) * v;
  };
  const G = Math.max(1, o.grid || 4), nodes = [];
  for (let b = 0; b < G; b++) for (let a = 0; a < G; a++) nodes.push([X((a + 0.5) / G * W - 0.5), Y((b + 0.5) / G * H - 0.5)]);
  const L = (() => { let n = 1; while (n < Math.max(W, H) + 2 * 64) n <<= 1; return n; })();
  const sgn = Math.sign(par(fmax)) || 1;
  const out = [0, 1, 2].map(() => new Float32Array(W * H));
  const D = {}, Dk = {}, done = {};

  // 1. each wavelength's image moved and dimmed, and its spectrum
  const distort = (c, wi) => () => {
    const img = new Float64Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = X(i), y = Y(j), r = Math.hypot(x, y), rq = back[wi](r);
      if (rq === null) continue;
      const s = r > 0 ? rq / r : 1, f = fOf(rq);
      img[j * W + i] = sample(c, x * s, y * s) * lerpF(ri, f);
    }
    D[c] = img;
    const re = new Float64Array(L * L), im = new Float64Array(L * L);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) re[j * L + i] = img[j * W + i];
    fft2(re, im, L);
    Dk[c] = [re, im];
  };
  // 2. the PSF at a grid point, turned and laid on the image's pixels: a kernel, its middle at [0, 0]
  const kernelAt = (wi, P) => {
    const r = Math.hypot(P[0], P[1]), rq = back[wi](r), f = Math.min(fmax, fOf(rq === null ? rmax : rq));
    const al = r > 0 ? Math.atan2(P[1], P[0]) - Math.atan2(sgn, 0) : 0, ca = Math.cos(al), sa = Math.sin(al);
    const half = 64, n = 2 * half + 1, Kr = new Float64Array(n * n);
    const put = (u, v, w) => {
      // turned to the point's azimuth, in pixels (rows down)
      const a = (u * ca - v * sa) / p + half, b = -(u * sa + v * ca) / p + half, a0 = Math.floor(a), b0 = Math.floor(b), fa = a - a0, fb = b - b0;
      if (a0 < 0 || b0 < 0 || a0 >= n - 1 || b0 >= n - 1) return;
      Kr[b0 * n + a0] += w * (1 - fa) * (1 - fb); Kr[b0 * n + a0 + 1] += w * fa * (1 - fb); Kr[(b0 + 1) * n + a0] += w * (1 - fa) * fb; Kr[(b0 + 1) * n + a0 + 1] += w * fa * fb;
    };
    const F = psfAnalysis(A, f, wi, 64, 4), sp = spotDiagram(A, f, 21), w = sp.waves[wi];
    const geometric = sp.geo > 0.35 * F.window;
    if (!geometric) {
      const M = F.M, hM = M / 2;
      for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) { const v = F.I[y * M + x]; if (v > 0) put((x - hM) * F.dx, (y - hM) * F.dx, v); }
    } else {
      // the spot itself, about this wavelength's own chief ray
      const C = rayAt(A.S[wi], f * IM_D2R, 0, 0), ref = sp.chief;
      const ox = C && C[7] === 0 ? C[0] - ref[0] : 0, oy = C && C[7] === 0 ? C[1] - ref[1] : 0;
      for (const [x, y] of w.pts) put(x - ox, y - oy, 1);
    }
    let t = 0; for (const v of Kr) t += v;
    if (t > 0) for (let q = 0; q < Kr.length; q++) Kr[q] /= t;
    return { Kr, n, half, f, geometric };
  };
  // 3. each grid point's kernel convolved with the whole image, kept where that point weighs
  const weight = (i, j, b, a) => {
    const tx = Math.max(0, Math.min(G - 1, (i + 0.5) / W * G - 0.5)), ty = Math.max(0, Math.min(G - 1, (j + 0.5) / H * G - 0.5));
    const wx = Math.max(0, 1 - Math.abs(tx - a)), wy = Math.max(0, 1 - Math.abs(ty - b));
    return wx * wy;
  };
  const used = [];
  const convolve = (c, wi, nIdx) => () => {
    const P = nodes[nIdx], K0 = kernelAt(wi, P), { Kr, n, half } = K0;
    used.push({ c, at: P, f: K0.f, geometric: K0.geometric });
    const re = new Float64Array(L * L), im = new Float64Array(L * L);
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) { const v = Kr[b * n + a]; if (!v) continue; const y = (b - half + L) % L, x = (a - half + L) % L; re[y * L + x] += v; }
    fft2(re, im, L);
    const [dr, di] = Dk[c];
    for (let q = 0; q < L * L; q++) { const r0 = re[q] * dr[q] - im[q] * di[q], i0 = re[q] * di[q] + im[q] * dr[q]; re[q] = r0; im[q] = i0; }
    fft2(re, im, L, true);
    const s = 1 / (L * L), a = nIdx % G, b = Math.floor(nIdx / G), O = out[c];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const w = weight(i, j, b, a); if (w > 0) O[j * W + i] += w * re[j * L + i] * s; }
  };
  const steps = [];
  for (let c = 0; c < 3; c++) {
    const wi = chW[c], twin = chW.indexOf(wi);
    if (twin < c) { steps.push(() => { done[c] = twin; }); continue; }
    steps.push(distort(c, wi));
    for (let k = 0; k < nodes.length; k++) steps.push(convolve(c, wi, k));
  }
  let at0 = 0;
  return {
    steps: steps.length,
    get done() { return at0; },
    next() { if (at0 < steps.length) steps[at0++](); return at0 >= steps.length; },
    result() {
      for (const c in done) out[c].set(out[done[c]]);
      return { W, H, pitch: p, at, atOut, whole, ch: out, nm: chW.map(nmOf), mono: uniq.length === 1, nodes: used, grid: G, rmax, ideal: D };
    },
  };
}
export function imsimRun(A, src, o) {
  const plan = imsimPlan(A, src, o);
  while (!plan.next());
  return plan.result();
}
