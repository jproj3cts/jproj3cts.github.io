import { clamp } from '../core/constants.js';
import { fmtFs, fmtFs2, fmtLen } from '../core/format.js';
import { project } from '../state/project.js';
import { getEl } from '../state/elements.js';
import { paraxial, traceScene, traceStoreOn } from '../engines/trace.js';
import { getCss, requestRender } from './render.js';
import { getPath, setParam } from '../state/params.js';
import {
  allSweeps, animLast, clockT, clockValueAt, fieldRendered, pauseAll, playStep, playing,
  renderedPeriod, sampleShown, setAnimFrame, setAnimLast, setClockT, setPlayStep, setStepSince,
  stepSince, stepValue
} from './sweeps.js';
import { detectorReading, fibreCoupling } from '../engines/fibre-face.js';
import { syncPanel } from './panel.js';
import { drawAxes, plotArea, plotCsv } from './plots.js';
import { blockedPct, diffraction } from '../engines/pd-cavity.js';
import { pulseReport } from '../engines/pulse.js';
import { screenStats } from '../engines/screen-stats.js';
import { changed } from './actions.js';

/* ---------- One-parameter search over a swept range ---------- */

let lastOptNm = 587.6;
/* ---------- What can be measured, and which way is "better" ----------
   One table feeds the optimiser and the tolerance study. */

export const pctTxt = v => (+v.toPrecision(4)) + '%';
const wavesTxt = v => (+v.toPrecision(4)) + ' waves';
const plainTxt = v => String(+v.toPrecision(5));

export function refNm() {
  const s0 = project.elements.find(e => e.type === 'source');
  return s0 ? s0.wavelength : 587.6;
}

export const METRICS = [
  { key: 'rms', fam: 'rays', on: 'screen', label: 'RMS spot', fmt: fmtLen, goals: ['min', 'match'], get: st => st.rms },
  { key: 'full', fam: 'rays', on: 'screen', label: 'Full width', fmt: fmtLen, goals: ['min', 'match'], get: st => st.full },
  { key: 'centroid', fam: 'rays', on: 'screen', label: 'Centroid position', fmt: fmtLen, goals: ['match', 'min'], get: st => st.centroid, absolute: true },
  { key: 'power', fam: 'rays', on: 'screen', label: 'Power received', fmt: pctTxt, goals: ['max', 'match', 'min'], get: st => st.powerPct },
  { key: 'wfRMS', fam: 'rays', on: 'screen', label: 'Wavefront RMS', fmt: wavesTxt, goals: ['min', 'match'], get: st => st.wfRMS === null ? null : st.wfRMS / (st.nm * 1e-6) },
  { key: 'wfPV', fam: 'rays', on: 'screen', label: 'Wavefront P\u2013V', fmt: wavesTxt, goals: ['min', 'match'], get: st => st.wfPV === null ? null : st.wfPV / (st.nm * 1e-6) },
  { key: 'colour', fam: 'rays', on: 'screen', label: 'Colour spread', fmt: fmtLen, goals: ['min', 'match'], get: st => {
      if (st.perNm.length < 2) return null;
      const c = st.perNm.map(q => q.centroid);
      return Math.max(...c) - Math.min(...c);
    } },
  { key: 'vis', fam: 'rays', on: 'screen', label: 'Fringe visibility', fmt: pctTxt, goals: ['max', 'min', 'match'], get: st => st.visibility === null ? null : 100 * st.visibility },
  { key: 'interf', fam: 'rays', on: 'screen', label: 'Interference vs incoherent', fmt: pctTxt, goals: ['max', 'min', 'match'], get: st => st.interference === null ? null : 100 * st.interference },
  { key: 'dop', fam: 'rays', on: 'screen', label: 'Degree of polarisation', fmt: pctTxt, goals: ['max', 'min', 'match'], get: st => st.stokes.S0 > 0 ? 100 * Math.hypot(st.stokes.S1, st.stokes.S2, st.stokes.S3) / st.stokes.S0 : null },
  { key: 'circ', fam: 'rays', on: 'screen', label: 'Circular fraction', fmt: pctTxt, goals: ['max', 'min', 'match'], get: st => st.stokes.S0 > 0 ? 100 * Math.abs(st.stokes.S3) / st.stokes.S0 : null },
  { key: 'opl', fam: 'rays', on: 'screen', label: 'Mean optical path', fmt: fmtLen, goals: ['match', 'min', 'max'], get: st => st.oplMean },
  { key: 'rt', fam: 'rays', on: 'screen', label: 'Round-trip path', fmt: fmtLen, goals: ['match', 'min'], get: st => st.roundTrip },
  { key: 'fsr', fam: 'rays', on: 'screen', label: 'Free spectral range (MHz)', fmt: plainTxt, goals: ['match', 'max', 'min'], get: st => st.roundTrip ? 299792458 / (st.roundTrip / 1000) / 1e6 : null },
  { key: 'bw', fam: 'gauss', on: 'screen', label: 'Beam radius w', fmt: fmtLen, goals: ['min', 'match', 'max'], get: st => st.beam ? st.beam.w : null },
  { key: 'bcurv', fam: 'gauss', on: 'screen', label: 'Collimation (1/R)', fmt: v => (+v.toPrecision(3)) + ' /mm', goals: ['match', 'min'], absolute: true,
    get: st => st.beam ? (isFinite(st.beam.R) ? 1 / st.beam.R : 0) : null },
  { key: 'bwaist', fam: 'gauss', on: 'screen', label: 'Distance to the waist', fmt: fmtLen, goals: ['match', 'min'], absolute: true, get: st => st.beam ? st.beam.waistDist : null },
  { key: 'bw0', fam: 'gauss', on: 'screen', label: 'Waist radius', fmt: fmtLen, goals: ['match', 'min', 'max'], get: st => st.beam ? st.beam.w0 : null },
  { key: 'strehl', fam: 'field', on: 'screen', label: 'Strehl ratio', fmt: plainTxt, goals: ['max', 'match'],
    getEl: el => { const D = diffraction(el); return D && D.strehl !== null ? D.strehl : null; } },
  { key: 'mtf', fam: 'field', on: 'screen', label: 'MTF at the quoted frequency', fmt: plainTxt, goals: ['max', 'match'],
    getEl: el => { const D = diffraction(el); return D ? D.mtfAt(el.mtfFreq) : null; } },
  { key: 'mtf50', fam: 'field', on: 'screen', label: 'Frequency where MTF falls to 0.5 (lp/mm)', fmt: plainTxt, goals: ['max', 'match'],
    getEl: el => { const D = diffraction(el); return D ? D.mtf50 : null; } },
  { key: 'ee80', fam: 'field', on: 'screen', label: 'Radius holding 80% of the light', fmt: fmtLen, goals: ['min', 'match'],
    getEl: el => { const D = diffraction(el); return D ? D.ee80 : null; } },
  { key: 'fwhm', fam: 'field', on: 'screen', label: 'PSF width at half maximum', fmt: fmtLen, goals: ['min', 'match'],
    getEl: el => { const D = diffraction(el); return D && D.fwhm !== null ? D.fwhm : null; } },
  { key: 'fpower', fam: 'field', on: 'screen', label: 'Power arriving', fmt: pctTxt, goals: ['max', 'match', 'min'],
    getEl: el => { const D = diffraction(el); return D ? 100 * D.power : null; } },
  { key: 'fpeak', fam: 'field', on: 'screen', label: 'Peak irradiance (per mm\u00b2 per unit power)', fmt: plainTxt, goals: ['max', 'match', 'min'],
    getEl: el => { const D = diffraction(el); return D ? D.peak : null; } },
  { key: 'fw', fam: 'field', on: 'screen', label: 'Beam radius w, in the bench plane', fmt: fmtLen, goals: ['min', 'match', 'max'],
    getEl: el => { const D = diffraction(el); return D ? D.wx : null; } },
  { key: 'fwy', fam: 'field', on: 'screen', label: 'Beam radius w, out of the plane', fmt: fmtLen, goals: ['min', 'match', 'max'],
    getEl: el => { const D = diffraction(el); return D ? D.wy : null; } },
  { key: 'finterf', fam: 'field', on: 'screen', label: 'Interference vs incoherent', fmt: pctTxt, goals: ['max', 'min', 'match'],
    getEl: el => { const D = diffraction(el); return D && D.interference !== null ? 100 * D.interference : null; } },
  { key: 'fvis', fam: 'field', on: 'screen', label: 'Fringe visibility', fmt: pctTxt, goals: ['max', 'min', 'match'],
    getEl: el => { const D = diffraction(el); return D && D.visibility !== null ? 100 * D.visibility : null; } },
  { key: 'blocked', fam: 'rays', on: 'stop', label: 'Power stopped', fmt: pctTxt, goals: ['min', 'max', 'match'],
    getEl: el => blockedPct(el) },
  { key: 'efl', fam: 'paraxial', on: 'lens', label: 'EFL', fmt: fmtLen, goals: ['match', 'min', 'max'], getEl: el => paraxial(el, refNm()).efl },
  { key: 'couple', fam: 'device', on: 'fibre', label: 'Coupling efficiency', fmt: pctTxt, goals: ['max', 'match', 'min'],
    getEl: el => { const r = fibreCoupling(el); return r ? 100 * r.eff : null; } },
  { key: 'fibremw', fam: 'device', on: 'fibre', label: 'Power into the fibre (mW)', fmt: plainTxt, goals: ['max', 'match', 'min'],
    getEl: el => { const r = fibreCoupling(el); return r ? r.mw : null; } },
  { key: 'dmw', fam: 'device', on: 'detector', label: 'Optical power on the diode (mW)', fmt: plainTxt, goals: ['max', 'match', 'min'],
    getEl: el => detectorReading(el).mw },
  { key: 'dvolt', fam: 'device', on: 'detector', label: 'Output voltage (V)', fmt: plainTxt, goals: ['max', 'match', 'min'],
    getEl: el => detectorReading(el).V },
  { key: 'dsnr', fam: 'device', on: 'detector', label: 'Signal to noise (dB)', fmt: plainTxt, goals: ['max', 'match'],
    getEl: el => detectorReading(el).snr },
  { key: 'pdur', fam: 'pulse', on: 'screen', label: 'Pulse duration (fs)', fmt: v => fmtFs(v), goals: ['min', 'match'], getEl: el => { const R = pulseReport(el); return R && R.dur ? R.dur : null; } },
  { key: 'pgdd', fam: 'pulse', on: 'screen', label: 'GDD of the main pulse (fs\u00b2)', fmt: v => fmtFs2(v), goals: ['match', 'min'], absolute: true, getEl: el => { const R = pulseReport(el); return R ? R.branches[R.main - 1].GDD : null; } },
  { key: 'ppk', fam: 'pulse', on: 'screen', label: 'Peak power (W)', fmt: plainTxt, goals: ['max', 'match'], getEl: el => { const R = pulseReport(el); return R ? R.peak : null; } },
  { key: 'dpdur', fam: 'pulse', on: 'detector', label: 'Pulse duration (fs)', fmt: v => fmtFs(v), goals: ['min', 'match'], getEl: el => { const R = pulseReport(el); return R && R.dur ? R.dur : null; } },
  { key: 'dpgdd', fam: 'pulse', on: 'detector', label: 'GDD of the main pulse (fs\u00b2)', fmt: v => fmtFs2(v), goals: ['match', 'min'], absolute: true, getEl: el => { const R = pulseReport(el); return R ? R.branches[R.main - 1].GDD : null; } },
  { key: 'dppk', fam: 'pulse', on: 'detector', label: 'Peak power (W)', fmt: plainTxt, goals: ['max', 'match'], getEl: el => { const R = pulseReport(el); return R ? R.peak : null; } },
  { key: 'pgd', fam: 'pulse', on: 'screen', label: 'Group delay (fs)', fmt: v => fmtFs(v), goals: ['match', 'min'], getEl: el => { const R = pulseReport(el); return R ? R.branches[R.main - 1].GD : null; } },
  { key: 'bfl', fam: 'paraxial', on: 'lens', label: 'BFL', fmt: fmtLen, goals: ['match', 'min', 'max'], getEl: el => paraxial(el, refNm()).bfl },
];
export const GOAL_LABEL = { min: 'Smallest', max: 'Largest', match: 'Match a target' };
/* What each metric is measured from: the ray fan, the Gaussian beam's envelope, the
   diffracted field, or first-order optics */
export const METRIC_FAMS = [['rays', 'Rays'], ['gauss', 'Gaussian beam'], ['field', 'Diffracted field'], ['paraxial', 'First order'], ['device', 'Fibre and detector'], ['pulse', 'Pulse']];
export const metricsFor = kind => METRICS.filter(m => m.on === kind);
/* a mirror reads the light arriving at its face as a screen does, so it is measured as one */
export const metricKind = el => el.type === 'mirror' ? 'screen' : el.type;
export const metricByKey = key => METRICS.find(m => m.key === key);
export const measurable = () => {                    // screens first: they are what most studies measure
  const rank = { screen: 0, detector: 0, fibre: 0, mirror: 1, stop: 1, lens: 2 };
  return project.elements.filter(e => rank[e.type] !== undefined).sort((a, b) => rank[a.type] - rank[b.type]);
};

export function metricRaw(el, key) {
  const m = metricByKey(key);
  if (!el || !m || m.on !== metricKind(el)) return null;
  if (m.getEl) { const v = m.getEl(el); return isFinite(v) ? v : null; }
  const st = screenStats(el);
  // a Gaussian beam's figures need no rays: with the fan hidden the beam still arrives
  if (!st || (st.empty && !(m.fam === 'gauss' && st.beam))) return null;
  const v = m.get(st);
  return (v === null || v === undefined || !isFinite(v)) ? null : v;
}
export function metricText(key, v) {
  const m = metricByKey(key);
  if (v === null || v === undefined || !isFinite(v)) return 'n/a';
  return m ? m.fmt(v) : plainTxt(v);
}
/* Everything becomes a minimisation: "match" uses the distance to the target and
   "largest" the negative, so one search routine serves them all. */
function meritFor(el, key, goal, targetVal) {
  const v = metricRaw(el, key);
  if (v === null) return Infinity;
  if (goal === 'max') return -v;
  if (goal === 'match') return Math.abs(v - targetVal);
  const m = metricByKey(key);
  return m && m.absolute ? Math.abs(v) : v;
}

export function optimise(el, path, target, key, goal, targetVal) {
  pauseAll();
  const sw = el.sweeps[path];
  const lo = Math.min(sw.min, sw.max), hi = Math.max(sw.min, sw.max);
  const start = getPath(el, path);
  const evalAt = v => { setParam(el, path, v); traceScene(); return meritFor(target, key, goal, targetVal); };
  const startMerit = evalAt(start);
  const startValue = metricRaw(target, key);
  let traces = 1;

  // coarse scan first, so a bumpy merit curve doesn't trap the search in the wrong dip
  const N = 40, scan = [];
  let bi = 0, bv = Infinity;
  for (let i = 0; i <= N; i++) {
    const v = lo + (hi - lo) * i / N;
    const m = evalAt(v); traces++;
    scan.push({ v, m, raw: metricRaw(target, key) });
    if (m < bv) { bv = m; bi = i; }
  }
  let a = lo + (hi - lo) * Math.max(0, bi - 1) / N;
  let b = lo + (hi - lo) * Math.min(N, bi + 1) / N;

  // golden-section refinement inside that bracket
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a);
  let fc = evalAt(c), fd = evalAt(d);
  traces += 2;
  for (let it = 0; it < 40 && (b - a) > Math.abs(hi - lo) * 1e-5; it++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = evalAt(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = evalAt(d); }
    traces++;
  }
  const best = (a + b) / 2;
  const bestMerit = evalAt(best);
  traces++;
  const improved = bestMerit < startMerit;
  const bestValue = metricRaw(target, key);
  if (!improved) { setParam(el, path, start); traceScene(); }
  return { best, bestMerit, startMerit, start, traces, improved, scan, bestValue, startValue };
}

/* ---------- Several parameters against several goals ----------
   vars: [[el, path]], each searched within its sweep's From-To range. terms: goals, each
   { target, key, goal, targetVal, weight }. With one goal the merit is that goal's own (as
   the one-parameter search has it); with more, each is divided by its size at the start
   (for "match", by its distance from the target then) and weighted, so goals in different
   units add up sensibly, and 1 on each means "as far from the start as it was".
   One parameter: a scan over its range and a golden-section search in the best bracket.
   More: a spread of samples across the ranges (a Latin hypercube, the start included), then
   Nelder-Mead from the best of them in the ranges scaled to 0-1, clamped to them. */
export function* optimiseGen(vars, terms, opts) {
  opts = opts || {};
  pauseAll();
  const n = vars.length;
  const rng = vars.map(([el, path]) => { const sw = el.sweeps[path]; return [Math.min(sw.min, sw.max), Math.max(sw.min, sw.max)]; });
  const start = vars.map(([el, path]) => getPath(el, path));
  const toX = u => u.map((v, i) => rng[i][0] + (rng[i][1] - rng[i][0]) * clamp(v, 0, 1));
  const toU = x => x.map((v, i) => rng[i][1] > rng[i][0] ? (v - rng[i][0]) / (rng[i][1] - rng[i][0]) : 0);
  const set = x => { vars.forEach(([el, path], i) => setParam(el, path, x[i])); traceScene(); };
  const raws = () => terms.map(t => metricRaw(t.target, t.key));
  // sizes for normalising, from the start
  set(start);
  const raw0 = raws();
  const scale = terms.map((t, i) => {
    if (terms.length === 1) return 1;
    const v = raw0[i];
    if (v === null) return 1;
    const s = t.goal === 'match' ? Math.abs(v - t.targetVal) : Math.abs(v);
    return s > 1e-12 ? s : 1;
  });
  const meritOf = rs => {
    let m = 0;
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i], v = rs[i];
      if (v === null || !isFinite(v)) return Infinity;
      const M = metricByKey(t.key);
      const f = t.goal === 'max' ? -v : t.goal === 'match' ? Math.abs(v - t.targetVal) : (M && M.absolute ? Math.abs(v) : v);
      m += (terms.length === 1 ? 1 : (t.weight > 0 ? t.weight : 1)) * f / scale[i];
    }
    return m;
  };
  let evals = 0, best = { m: Infinity, x: start.slice(), raw: raw0 };
  const history = [], scan = [];
  // asked to stop: every further evaluation is skipped, and the searches run out at once
  let stopped = false;
  const f = u => {
    if (!stopped && opts.stop && opts.stop()) { stopped = true; evals = Math.max(evals, budget); }
    if (stopped) return Infinity;
    const x = toX(u); set(x); evals++;
    const rs = raws(), m = meritOf(rs);
    if (m < best.m) best = { m, x: x.slice(), raw: rs };
    history.push(best.m);
    return m;
  };
  const startMerit = meritOf(raw0);
  best = { m: startMerit, x: start.slice(), raw: raw0 };
  history.push(startMerit);
  let budget = opts.budget || (n === 1 ? 90 : Math.min(600, 80 + 70 * n));
  if (n === 1) {
    const N = 40;
    let bi = 0, bv = Infinity;
    for (let i = 0; i <= N; i++) { const m = f([i / N]); scan.push({ v: toX([i / N])[0], m, raw: best && terms.length === 1 ? metricRaw(terms[0].target, terms[0].key) : m }); if (m < bv) { bv = m; bi = i; } yield { evals, budget, best: best.m }; }
    let a = Math.max(0, bi - 1) / N, b = Math.min(N, bi + 1) / N;
    const g = (Math.sqrt(5) - 1) / 2;
    let c = b - g * (b - a), d = a + g * (b - a), fc = f([c]), fd = f([d]);
    for (let it = 0; it < 40 && (b - a) > 1e-5 && !stopped; it++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f([c]); }
      else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f([d]); }
      yield { evals, budget, best: best.m };
    }
  } else {
    // a Latin hypercube: each range cut into S strata, one sample in each, shuffled per axis
    const S = Math.min(80, 10 + 10 * n);
    const perm = () => { const p = [...Array(S).keys()]; for (let i = S - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; };
    const P = vars.map(perm), samples = [{ u: toU(start), m: startMerit }];
    for (let s = 0; s < S; s++) { const u = P.map(p => (p[s] + Math.random()) / S); samples.push({ u, m: f(u) }); yield { evals, budget, best: best.m }; }
    samples.sort((a, b) => a.m - b.m);
    // Nelder-Mead from the best sample, then once more from where it ended with a small simplex
    const nm = function* (u0, step) {
      let simp = [u0.slice()];
      for (let i = 0; i < n; i++) { const u = u0.slice(); u[i] = u[i] + step <= 1 ? u[i] + step : u[i] - step; simp.push(u); }
      let vals = simp.map(u => f(u));
      const cl = u => u.map(v => clamp(v, 0, 1));
      while (evals < budget) {
        const o = simp.map((u, i) => i).sort((a, b) => vals[a] - vals[b]);
        simp = o.map(i => simp[i]); vals = o.map(i => vals[i]);
        const size = Math.max(...simp.slice(1).map(u => Math.max(...u.map((v, i) => Math.abs(v - simp[0][i])))));
        if (size < 1e-5 || Math.abs(vals[n] - vals[0]) < 1e-12 * (1 + Math.abs(vals[0])) && size < 1e-3) break;
        const cen = simp[0].map((_, i) => simp.slice(0, n).reduce((s, u) => s + u[i], 0) / n);
        const along = (t) => cl(cen.map((c, i) => c + t * (simp[n][i] - c)));
        const xr = along(-1), fr = f(xr);
        if (fr < vals[0]) { const xe = along(-2), fe = f(xe); if (fe < fr) { simp[n] = xe; vals[n] = fe; } else { simp[n] = xr; vals[n] = fr; } }
        else if (fr < vals[n - 1]) { simp[n] = xr; vals[n] = fr; }
        else {
          const xc = fr < vals[n] ? along(-0.5) : along(0.5), fc = f(xc);
          if (fc < Math.min(fr, vals[n])) { simp[n] = xc; vals[n] = fc; }
          else for (let i = 1; i <= n; i++) { simp[i] = cl(simp[i].map((v, k) => simp[0][k] + 0.5 * (v - simp[0][k]))); vals[i] = f(simp[i]); }
        }
        yield { evals, budget, best: best.m };
      }
    };
    yield* nm(samples[0].u, 0.08);
    if (evals < budget) yield* nm(toU(best.x), 0.01);
  }
  const improved = best.m < startMerit;
  set(improved ? best.x : start);
  return { vars, terms, start, best: best.x, startMerit, bestMerit: best.m, improved, evals: stopped ? history.length - 1 : evals, history, scan, raw0, rawBest: improved ? best.raw : raw0, scale, stopped };
}
/* the whole search at once (the tests, and a script) */
export function optimiseMany(vars, terms, opts) {
  const g = optimiseGen(vars, terms, opts);
  let r; do r = g.next(); while (!r.done);
  return r.value;
}
/* how the best merit fell, trace by trace */
export function drawConvergence(cv, hist) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, hgt = 120;
  cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hgt);
  const ys = hist.filter(isFinite);
  plotCsv(cv, 'optimiser merit', ['trace', 'best_merit'], () => hist.map((m, i) => [i, m]));
  if (ys.length < 2) return;
  let y0 = Math.min(...ys), y1 = Math.max(...ys); if (y1 - y0 < 1e-12) { y0 -= 1; y1 += 1; }
  const A = plotArea(c, w, hgt, [y0, y1], { kind: 'plain', title: 'best merit so far' }, { top: 20 });
  c.strokeStyle = getCss('--jek-cyan'); c.lineWidth = 1.5; c.beginPath();
  hist.forEach((m, i) => { if (!isFinite(m)) return; const X = A.l + i / (hist.length - 1) * A.w, Y = A.t + A.h - (m - y0) / (y1 - y0) * A.h; i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
  c.stroke();
  drawAxes(c, A, [0, hist.length - 1], [y0, y1], { kind: 'plain', title: 'trace' }, { kind: 'plain', title: 'best merit so far' });
}

/* The axis a metric's values go on: lengths get the length units, the rest their own format */
function metricAxis(key, title) {
  const m = METRICS.find(q => q.key === key);
  return m && m.fmt === fmtLen ? { kind: 'len', title } : { kind: 'plain', title, fmt: v => metricText(key, v) };
}
/* The coarse scan, drawn so a comb or a plateau is obvious at a glance */
export function drawScan(cv, scan, key, best) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, hgt = 120;
  cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, hgt);
  const pts = scan.filter(q => q.raw !== null && isFinite(q.raw));
  plotCsv(cv, 'optimiser scan', ['value_tried', key], () => pts.map(q => [q.v, q.raw]));
  if (pts.length < 2) return;
  const vs = pts.map(q => q.v), ys = pts.map(q => q.raw);
  const v0 = Math.min(...vs), v1 = Math.max(...vs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y1 - y0 < 1e-12) { y0 -= 1; y1 += 1; }
  const m = METRICS.find(q => q.key === key);
  const sx = { kind: 'plain', title: 'value tried' }, sy = metricAxis(key, m ? m.label : '');
  const A = plotArea(c, w, hgt, [y0, y1], sy, { top: 20 });
  const X = v => A.l + ((v - v0) / (v1 - v0 || 1)) * A.w;
  const Y = y => A.t + A.h - ((y - y0) / (y1 - y0)) * A.h;
  c.strokeStyle = getCss('--jek-cyan');
  c.lineWidth = 1.5;
  c.beginPath();
  pts.forEach((q, i) => i ? c.lineTo(X(q.v), Y(q.raw)) : c.moveTo(X(q.v), Y(q.raw)));
  c.stroke();
  c.strokeStyle = 'rgba(0,0,0,0.4)';
  c.setLineDash([3, 3]);
  c.beginPath(); c.moveTo(X(best), A.t); c.lineTo(X(best), A.t + A.h); c.stroke();
  c.setLineDash([]);
  drawAxes(c, A, [v0, v1], [y0, y1], sx, sy);
}

/* ---------- Monte Carlo over the swept ranges ---------- */

/* Move each parameter alone to the ends of its range and see what the metric does.
   Ranked worst first, with a root-sum-square of the individual swings. */
export function sensitivity(vars, target, key) {
  pauseAll();
  traceScene();
  const base = metricRaw(target, key);
  const rows = [];
  for (const [el, path] of vars) {
    const sw = el.sweeps[path];
    const start = getPath(el, path);
    const at = v => { setParam(el, path, v); traceScene(); return metricRaw(target, key); };
    const lo = at(Math.min(sw.min, sw.max));
    const hi = at(Math.max(sw.min, sw.max));
    setParam(el, path, start);
    const d = v => (v === null || base === null) ? null : v - base;
    const dl = d(lo), dh = d(hi);
    const worst = Math.max(Math.abs(dl === null ? 0 : dl), Math.abs(dh === null ? 0 : dh));
    rows.push({ el, path, lo, hi, dLo: dl, dHi: dh, worst, dead: lo === null || hi === null });
  }
  traceScene();
  rows.sort((a, b) => b.worst - a.worst);
  const rss = Math.sqrt(rows.reduce((a, r) => a + r.worst * r.worst, 0));
  return { base, rows, rss };
}

function randn() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* Runs in slices so the page keeps painting; `onDone` gets the sorted samples. */
export let mcJob = null;                       // { i, n } while a tolerance study runs
export function monteCarlo(vars, target, key, trials, dist, onProgress, onDone, alive) {
  pauseAll();
  const job = mcJob = { i: 0, n: trials };
  const start = vars.map(([el, path]) => getPath(el, path));
  const samples = [];
  const nominal = (traceScene(), metricRaw(target, key));
  let i = 0;
  const step = () => {
    if (!alive()) { if (mcJob === job) mcJob = null; restore(); return; }
    const until = Math.min(trials, i + 15);
    for (; i < until; i++) {
      vars.forEach(([el, path], k) => {
        const sw = el.sweeps[path];
        const lo = Math.min(sw.min, sw.max), hi = Math.max(sw.min, sw.max);
        let v;
        if (dist === 'uniform') v = lo + Math.random() * (hi - lo);
        else v = clamp(start[k] + randn() * (hi - lo) / 6, lo, hi);
        setParam(el, path, v);
      });
      traceScene();
      const m = metricRaw(target, key);
      if (m !== null && isFinite(m)) samples.push(m);
    }
    onProgress(i, trials);
    job.i = i;
    if (i < trials) requestAnimationFrame(step);
    else { if (mcJob === job) mcJob = null; restore(); samples.sort((a, b) => a - b); onDone(samples, nominal); }
  };
  const restore = () => {
    vars.forEach(([el, path], k) => setParam(el, path, start[k]));
    changed(true);
  };
  requestAnimationFrame(step);
}

export function drawHistogram(cv, samples, key) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, hgt = 120;
  cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, hgt);
  if (!samples.length) return;
  let lo = samples[0], hi = samples[samples.length - 1];
  if (!(hi > lo)) { const d = Math.abs(lo) * 1e-3 || 1e-9; lo -= d; hi += d; }
  const nb = 24, bins = new Array(nb).fill(0);
  for (const v of samples) bins[clamp(Math.floor((v - lo) / (hi - lo) * nb), 0, nb - 1)]++;
  plotCsv(cv, 'tolerance trials', ['from', 'to', 'trials'], () => bins.map((b, i) => [lo + (hi - lo) * i / nb, lo + (hi - lo) * (i + 1) / nb, b]));
  const peak = Math.max(...bins);
  const sx = metricAxis(key, ''), sy = { kind: 'plain', title: 'trials', fmt: v => Number.isInteger(v) ? String(v) : '' };
  const A = plotArea(c, w, hgt, [0, peak], sy, { top: 20 });
  const bw = A.w / nb;
  c.fillStyle = getCss('--jek-cyan');
  for (let i = 0; i < nb; i++) {
    const h0 = (bins[i] / peak) * A.h;
    c.fillRect(A.l + i * bw + 1, A.t + A.h - h0, Math.max(1, bw - 2), h0);
  }
  drawAxes(c, A, [lo, hi], [0, peak], sx, sy, { noGrid: true });
}

export function stopSweepsFor(el, prefix) {
  for (const [k, p] of playing) if (p.id === el.id && (!prefix || p.path.startsWith(prefix))) playing.delete(k);
  updateSweepButtons();
}
export function tick(t) {
  if (!playing.size) { setAnimFrame(null); return; }
  const dt = animLast === null ? 0 : Math.min(0.1, (t - animLast) / 1000);
  setAnimLast(t);
  setClockT(clockT + (dt));
  // with the field rendered ahead for exactly what is playing, step between its samples
  let tq = clockT;
  const P = renderedPeriod();
  if (P) {
    // one step at a time, and the next only once this one shows in full: a sweep played faster
    // than its steps can be drawn slows to what can be shown, rather than skipping steps or
    // showing them half worked out (a step the renderer missed is worked out live, waited for)
    const n = fieldRendered.n, want = Math.round(clockT * n / P);
    if (playStep === null) { setPlayStep(want); setStepSince(t); }
    if (want !== playStep && (sampleShown() || t - stepSince > 4000)) { setPlayStep(playStep + (Math.sign(want - playStep))); setStepSince(t); }
    if (want !== playStep) setClockT((playStep + 0.49 * Math.sign(want - playStep)) * P / n);
    // the very sample the renderer took (same arithmetic, same cycle), so the keys match exactly;
    // while the render is still filling in, the nearest step before it that is there
    tq = (((playStep % n) + n) % n);
    const D = fieldRendered.done;
    if (D && D.size) for (let k = 0; k < n && !D.has(tq); k++) tq = (tq - 1 + n) % n;
  } else setPlayStep(null);
  for (const [k, p] of playing) {
    const el = getEl(p.id);
    const sw = el && el.sweeps && el.sweeps[p.path];
    if (!sw || getPath(el, p.path) === undefined) { playing.delete(k); continue; }
    // a sweep with steps of its own, not rendered ahead: from one of its positions to the next; a
    // gliding one, where each step's trace is kept, on steps fine enough to look smooth (up to
    // about 60 a second) so that each comes round again
    const st = !P && sw.steps ? sw.steps * sw.freq : !P && traceStoreOn() ? clamp(Math.round(60 / sw.freq), 120, 600) * sw.freq : 0;
    setParam(el, p.path, P ? stepValue(sw, tq, fieldRendered.n, P) : clockValueAt(sw, st ? Math.round(clockT * st) / st : tq));
  }
  // traced before the panels look: a screen's field is found by the bench as traced, and a
  // trace a step behind its parts asks for a field no step has (worked out live, every step)
  traceScene();
  syncPanel();
  requestRender();
  setAnimFrame(requestAnimationFrame(tick));
}
export function updateSweepButtons() {
  const total = allSweeps().length;
  const canStudy = !total || !measurable().length;
  document.getElementById('btnOptimise').disabled = canStudy;
  document.getElementById('btnTol').disabled = canStudy;
  const pa = document.getElementById('btnPauseAll');
  document.getElementById('btnPlayAll').disabled = !total || playing.size >= total;
  document.getElementById('btnSync').disabled = !total;
  pa.disabled = !playing.size;
  (pa.querySelector('.lbl') || pa).textContent = playing.size ? 'Pause all (' + playing.size + ')' : 'Pause all';
  // the menu's button shows when sweeps are playing
  const sb = document.getElementById('btnSweeps');
  sb.classList.toggle('playing', playing.size > 0);
  sb.textContent = playing.size ? 'Sweeps \u25b6 ' + playing.size : 'Sweeps';
}

