import { stackAmp, qwot } from './coatings.js';
import { cabs2 } from './numeric.js';

/* ==========================================================================
   Designing a thin-film coating
   A stack of layers (index n, thickness d in nm, listed from the outside in) on a substrate, judged against what it is
   for: an anti-reflection coating (nothing reflected over a band of wavelengths and a range of angles), a high reflector,
   a beam splitter of a chosen reflectance, a dichroic edge (reflecting one side of a wavelength, passing the other), or an
   RF matching layer (a lens face passing everything at its frequency). Its reflectance comes from the one stack model the
   bench, the lens designer and the RF designer trace with (core/coatings.js stackAmp), so what is designed here is what
   is traced. The merit is the mean square of the reflectance against its target over the band and the angles, each
   polarisation as asked; the thicknesses are searched by Nelder–Mead from where they stand.
   ========================================================================== */
export const COAT_TARGETS = { ar: 'Anti-reflection', hr: 'High reflector', split: 'Beam splitter', edge: 'Dichroic edge', rf: 'Matching layer (RF)' };
const clampN = (v, lo, hi, d) => (isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
/* the specification, normalised: the medium's index n0, the substrate's ns, the band lo to hi (nm), the angles 0 to
   theta (degrees), the polarisation judged ('avg' of s and p, 's' or 'p'), the design wavelength (nm; the band's middle
   when left out), and for a splitter its reflectance (%), for an edge the wavelength it turns at and which side passes */
export function coatSpec(o) {
  o = o || {};
  const target = COAT_TARGETS[o.target] ? o.target : 'ar';
  const lo = clampN(o.lo, 100, 1e9, target === 'rf' ? 11.5e6 : 450), hi = Math.max(lo, clampN(o.hi, 100, 1e9, target === 'rf' ? 13.5e6 : 650));
  return { target, n0: clampN(o.n0, 1, 20, 1), ns: clampN(o.ns, 1, 20, 1.5168), lo, hi, theta: clampN(o.theta, 0, 89, 0), pol: ['s', 'p'].includes(o.pol) ? o.pol : 'avg',
    design: clampN(o.design, 100, 1e9, (lo + hi) / 2), R: clampN(o.R, 0, 100, 50), edge: clampN(o.edge, 100, 1e9, (lo + hi) / 2), passBelow: o.passBelow !== false };
}
/* the stack's power reflectance from n0 into ns at cosine ci and wavelength nm, for the polarisation asked */
export function stackR(layers, n0, ns, ci, nm, pol) {
  const r = p => cabs2(stackAmp(layers, n0, ns, ci, nm, p));
  return pol === 's' ? r('s') : pol === 'p' ? r('p') : (r('s') + r('p')) / 2;
}
/* what the reflectance should be at nm, for the target */
export function coatWant(spec, nm) {
  switch (spec.target) {
    case 'hr': return 1;
    case 'split': return spec.R / 100;
    case 'edge': return (nm < spec.edge) === spec.passBelow ? 0 : 1;
    default: return 0;
  }
}
/* the sample points the stack is judged at: wavelengths across the band and angles from 0 to theta */
function samples(spec, nW, nA) {
  const nms = [], cis = [];
  for (let i = 0; i < nW; i++) nms.push(spec.lo + (spec.hi - spec.lo) * (nW > 1 ? i / (nW - 1) : 0.5));
  for (let j = 0; j < nA; j++) cis.push(Math.cos((spec.theta * (nA > 1 ? j / (nA - 1) : 0)) * Math.PI / 180));
  return { nms, cis };
}
/* the merit: the mean square of R − target over the band and the angles (an edge's own wavelength ± 2% left out, as no
   stack turns in no width) */
export function coatMerit(layers, spec, nW = 41, nA = 5) {
  const { nms, cis } = samples(spec, nW, spec.theta > 0 ? nA : 1);
  let sum = 0, cnt = 0;
  for (const nm of nms) {
    if (spec.target === 'edge' && Math.abs(nm - spec.edge) < 0.02 * spec.edge) continue;
    const want = coatWant(spec, nm);
    for (const ci of cis) { const e = stackR(layers, spec.n0, spec.ns, ci, nm, spec.pol) - want; sum += e * e; cnt++; }
  }
  return cnt ? sum / cnt : 0;
}
/* the reflectance across the band at an angle (degrees), N points: { nms, R } */
export function coatCurve(layers, spec, deg, N = 121) {
  const ci = Math.cos((deg || 0) * Math.PI / 180), nms = [], R = [];
  for (let i = 0; i < N; i++) { const nm = spec.lo + (spec.hi - spec.lo) * i / (N - 1); nms.push(nm); R.push(stackR(layers, spec.n0, spec.ns, ci, nm, spec.pol)); }
  return { nms, R };
}
/* the reflectance against the angle at the design wavelength, s and p: { degs, s, p } */
export function coatAngles(layers, spec, N = 91) {
  const degs = [], s = [], p = [];
  for (let i = 0; i < N; i++) { const d = 89 * i / (N - 1), ci = Math.cos(d * Math.PI / 180); degs.push(d); s.push(stackR(layers, spec.n0, spec.ns, ci, spec.design, 's')); p.push(stackR(layers, spec.n0, spec.ns, ci, spec.design, 'p')); }
  return { degs, s, p };
}
/* the figures a designer reads: the mean and worst reflectance over the band square on and at the largest angle, the
   reflectance at the design wavelength, and the merit */
export function coatSummary(layers, spec) {
  const at = deg => { const c = coatCurve(layers, spec, deg, 61); let m = 0, w = 0; for (const r of c.R) { m += r; w = Math.max(w, r); } return { mean: m / c.R.length, worst: w }; };
  const c0 = at(0), ct = spec.theta > 0 ? at(spec.theta) : c0;
  return { mean: c0.mean, worst: c0.worst, meanAt: ct.mean, worstAt: ct.worst, design: stackR(layers, spec.n0, spec.ns, 1, spec.design, spec.pol), merit: coatMerit(layers, spec), bare: ((spec.n0 - spec.ns) / (spec.n0 + spec.ns)) ** 2 };
}
/* ---------- Optimising the thicknesses ----------
   Nelder–Mead on the layers' thicknesses (each held between a hundredth of a quarter wave and four waves of optical
   thickness at the design wavelength), from where they stand, with restarts. Returns the layers as improved, and the
   merit before and after; the indices are left as they are (choose them, then let the thicknesses settle). */
export function coatOptimise(layers, spec, opts) {
  opts = opts || {};
  const n = layers.length;
  if (!n) return { layers: [], before: coatMerit(layers, spec), after: coatMerit(layers, spec), evals: 0 };
  const lo = layers.map(L => 0.01 * qwot(L.n, spec.design)), hi = layers.map(L => 16 * qwot(L.n, spec.design));
  const clampD = x => x.map((v, i) => Math.min(hi[i], Math.max(lo[i], v)));
  let evals = 0;
  const f = x => { evals++; return coatMerit(layers.map((L, i) => ({ n: L.n, d: x[i] })), spec, opts.nW || 25, opts.nA || 3); };
  let best = clampD(layers.map(L => L.d)), fBest = f(best);
  const before = fBest;
  const rounds = opts.rounds || 3, maxIt = opts.maxIt || 150 * n;
  for (let round = 0; round < rounds; round++) {
    // the simplex: the best so far and one point per thickness, stepped by a tenth of a quarter wave (more each restart)
    const step = (0.3 + 0.3 * round);
    let S = [best].concat(best.map((_, i) => { const x = best.slice(); x[i] = Math.min(hi[i], x[i] + step * qwot(layers[i].n, spec.design)); return clampD(x); }));
    let F = S.map(f);
    for (let it = 0; it < maxIt; it++) {
      const ord = F.map((v, i) => i).sort((a, b) => F[a] - F[b]);
      S = ord.map(i => S[i]); F = ord.map(i => F[i]);
      if (F[n] - F[0] < 1e-12 * (1 + F[0])) break;
      const c = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) c[k] += S[i][k] / n;
      const xr = clampD(c.map((v, k) => v + (v - S[n][k]))), fr = f(xr);
      if (fr < F[0]) {
        const xe = clampD(c.map((v, k) => v + 2 * (v - S[n][k]))), fe = f(xe);
        if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; }
      } else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
      else {
        const xc = clampD(c.map((v, k) => v + 0.5 * (S[n][k] - v))), fc = f(xc);
        if (fc < F[n]) { S[n] = xc; F[n] = fc; }
        else for (let i = 1; i <= n; i++) { S[i] = clampD(S[i].map((v, k) => S[0][k] + 0.5 * (v - S[0][k]))); F[i] = f(S[i]); }
      }
    }
    const i0 = F.indexOf(Math.min(...F));
    if (F[i0] < fBest) { fBest = F[i0]; best = S[i0]; }
  }
  const out = layers.map((L, i) => ({ n: L.n, d: +best[i].toFixed(3) }));
  return { layers: out, before, after: coatMerit(out, spec), evals };
}
/* the stack as a part's coating (state/project.js normCoat takes it): a single RF matching layer keeps the label the
   quote and the manufacturable check look for */
export function coatToStack(layers, spec, label) {
  const one = layers.length === 1 && spec.target === 'rf';
  return { mode: 'stack', design: Math.round(spec.design), layers: layers.map(L => ({ n: +L.n, d: +L.d })), ...(one ? { label: 'Matching layer' } : label ? { label: String(label).slice(0, 40) } : {}) };
}
