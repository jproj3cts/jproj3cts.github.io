import { randn, seededRng } from '../../../jekray/src/core/numeric.js';
import { coatCurve, coatMerit } from '../../../jekray/src/core/coatdesign.js';

/* ==========================================================================
   Tolerancing: how a coating fares as made. Each run gives every layer a thickness error drawn from a normal
   distribution, σ as a share of the layer (kind 'rel', σ in %) or in nanometres (kind 'abs'), the same seed giving the
   same runs; the curve square on (at the smallest angle judged) and the merit of each run are kept. Returned: the
   nominal curve, the 5th, 50th and 95th percentiles at each wavelength, and the merit and the band's mean and largest
   reflectance as nominal, median and 90th percentile; and each run's stack (stacks), for the yield (core/film-make.js).
   ========================================================================== */
export const TOL_DEFAULT = { kind: 'rel', sigma: 1, runs: 200, seed: 1 };
export function normTol(t) {
  t = t && typeof t === 'object' ? t : {};
  const num = (v, lo, hi, d) => (isFinite(+v) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, +v)) : d);
  return { kind: t.kind === 'abs' ? 'abs' : 'rel', sigma: num(t.sigma, 0, 50, 1), runs: Math.round(num(t.runs, 10, 2000, 200)), seed: Math.round(num(t.seed, 1, 1e9, 1)) };
}
const pct = (sorted, p) => { if (!sorted.length) return NaN; const x = (sorted.length - 1) * p, i = Math.floor(x), f = x - i; return sorted[i] + (sorted[Math.min(sorted.length - 1, i + 1)] - sorted[i]) * f; };
export function filmTolerance(layers, spec, tol) {
  const T = normTol(tol), rnd = seededRng(T.seed), N = 81, a0 = spec.theta0 || 0;
  const stat = R => { let m = 0, w = 0; for (const r of R) { m += r; w = Math.max(w, r); } return [m / R.length, w]; };
  const nom = coatCurve(layers, spec, a0, N), nomMerit = coatMerit(layers, spec), [nomMean, nomWorst] = stat(nom.R);
  const cols = nom.nms.map(() => []), merits = [], means = [], worsts = [], stacks = [];
  for (let r = 0; r < T.runs; r++) {
    const L = layers.map(x => ({ ...x, d: Math.max(0, T.kind === 'rel' ? x.d * (1 + T.sigma / 100 * randn(rnd)) : x.d + T.sigma * randn(rnd)) }));
    stacks.push(L);
    const c = coatCurve(L, spec, a0, N);
    c.R.forEach((v, i) => cols[i].push(v));
    const [m, w] = stat(c.R);
    means.push(m); worsts.push(w); merits.push(coatMerit(L, spec, 21, spec.theta > a0 ? 3 : 1));
  }
  for (const c of cols) c.sort((a, b) => a - b);
  for (const a of [merits, means, worsts]) a.sort((x, y) => x - y);
  const three = (nominal, s) => ({ nominal, median: pct(s, 0.5), p90: pct(s, 0.9) });
  return { tol: T, nms: nom.nms, nominal: nom.R, p5: cols.map(c => pct(c, 0.05)), p50: cols.map(c => pct(c, 0.5)), p95: cols.map(c => pct(c, 0.95)),
    merit: three(nomMerit, merits), mean: three(nomMean, means), worst: three(nomWorst, worsts), stacks };
}
