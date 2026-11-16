/* A particle is linear in the light on it (core/linmemo.js, engines/scatter.js): once two polarisations of a laser have
   been solved, any other (linear at any angle, circular) and any power is the combination of their answers, with no new
   solve, and it is the answer a solve gives, to a part in 1e9 or better (Mie), or to the solver's own tolerance (the
   dipole array, run here at 1e-11). Also: answers kept by their key (a state come back to costs nothing), a rod turned
   step by step (its lattice's table kept, each step started from the nearest answer), the dipoles' sum by FFT and the
   far field by the grid's phases against the direct sums, and the trap worked out apart from the scattering. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openBench, engine } from '../../headless.mjs';
await engine();
const SC = await import('../../src/engines/scatter.js');
const D = await import('../../src/core/dda.js');
const LM = await import('../../src/core/linmemo.js');
const TR = await import('../../src/engines/trace.js');
const BT = await import('../../src/engines/beam-tree.js');
const { getEl } = await import('../../src/state/elements.js');
const { setParam } = await import('../../src/state/params.js');

const say = (...a) => { if (process.env.SHOW) console.log('#', ...a); };
/* the levitated-trap example cut to one launch: a 1550 nm fibre laser, its collimator and lens, a particle at the focus */
const demo = JSON.parse(fs.readFileSync(new URL('../../../demos/levitated-trap.jekray', import.meta.url)));
function bench(part, laser) {
  const d = JSON.parse(JSON.stringify(demo));
  d.elements = d.elements.filter(e => !['tip-b', 'coll-b', 'split', 'fpc'].includes(e.id));
  for (const e of d.elements) {
    if (e.id === 'laser') Object.assign(e, { power: 50, pol: 'linear', polAngle: 0 }, laser);
    if (e.type === 'particle') Object.assign(e, { trapR: 500, scatModel: 'mie' }, part);
  }
  d.fibres = [{ a: ['laser', 0], b: ['tip-a', 0], len: 1 }];
  return d;
}
const P = 'trapScreen';
const solve = (opts = {}) => SC.scatterNow(getEl(P), Object.assign({ trap: false }, opts));
const fresh = (opts) => { SC.linClear(); return solve(opts); };
/* the largest difference of two answers' fields and powers, against each one's own scale */
function diff(a, b) {
  const rel = (x, y) => Math.abs(x - y) / Math.max(Math.abs(y), 1e-300);
  const arr = (x, y) => { let m = 0, top = 0; for (let i = 0; i < y.length; i++) { top = Math.max(top, Math.abs(y[i])); } for (let i = 0; i < y.length; i++) m = Math.max(m, Math.abs(x[i] - y[i])); return top > 0 ? m / top : m; };
  let worst = 0;
  // (an absorption that is the difference of two near-equal powers is held against the extinction)
  worst = Math.max(worst, Math.abs(a.Pabs - b.Pabs) / Math.abs(b.Pext));
  for (const k of ['Psca', 'Pext', 'Csca', 'Cext', 'I0', 'fwd', 'back', 'gLight']) worst = Math.max(worst, Math.abs(b[k]) > 1e-30 ? rel(a[k], b[k]) : Math.abs(a[k] - b[k]));
  worst = Math.max(worst, rel(a.collect.P, b.collect.P), arr(a.cutIn.I, b.cutIn.I), arr(a.cutOut.I, b.cutOut.I), arr(a.map.I, b.map.I), arr(a.pol, b.pol));
  a.far.F.forEach((F, i) => { worst = Math.max(worst, arr(F, b.far.F[i])); });
  return worst;
}

test('linmemo: a combination is found, its answer combined, and a field off the span is not taken for one', () => {
  const r = () => Float64Array.from({ length: 40 }, () => Math.random() - 0.5);
  const A = r(), B = r(), FA = r(), FB = r(), s = LM.linStore();
  s.put('k', A, FA); s.put('k', B, FB);
  const c1 = [0.3, -1.2], c2 = [2.5, 0.7], E = LM.linCombine([A, B], [c1, c2]), want = LM.linCombine([FA, FB], [c1, c2]);
  const got = s.get('k', E);
  assert.ok(got, 'combined');
  for (let i = 0; i < 40; i++) assert.ok(Math.abs(got[i] - want[i]) < 1e-12, 'element ' + i);
  const off = Float64Array.from(E); off[3] += 1e-6;
  assert.equal(s.get('k', off), null, 'a field a little off the span is worked out, not combined');
  assert.equal(s.get('other', E), null, 'another key keeps its own');
  // one nearly along those kept is not kept (the fit would grow ill-conditioned)
  assert.equal(s.put('k', LM.linCombine([A, B], [[1, 0], [1e-5, 0]]).map((v, i) => v + (i === 0 ? 1e-9 : 0)), FA), false);
});

test('Mie: any polarisation and power is the combination of two solved ones, as a solve gives it', async () => {
  await openBench(bench({}, {}));
  SC.setScatMode('async');                 // (the trace leaves the particle to these solves)
  const at = (lp) => { const el = getEl('laser'); for (const [k, v] of Object.entries(lp)) setParam(el, k, v); TR.setLastTraceKey(null); TR.traceScene(); };
  const cases = [{ pol: 'linear', polAngle: 30 }, { pol: 'linear', polAngle: 72.5 }, { pol: 'rcp' }, { pol: 'lcp' }, { pol: 'linear', polAngle: 30, power: 80 }, { pol: 's', power: 12 }];
  // the direct answers, each worked out from nothing
  const direct = cases.map(c => { at(Object.assign({ pol: 'linear', polAngle: 0, power: 50 }, c)); return fresh(); });
  // two polarisations solved, then every case combined
  SC.linClear();
  at({ pol: 'linear', polAngle: 0, power: 50 }); solve();
  at({ pol: 'linear', polAngle: 90, power: 50 }); solve();
  const n0 = Object.assign({}, SC.LIN_STATS);
  let worst = 0;
  cases.forEach((c, i) => {
    at(Object.assign({ pol: 'linear', polAngle: 0, power: 50 }, c));
    const S = solve(), w = diff(S, direct[i]);
    worst = Math.max(worst, w);
    assert.ok(w < 1e-9, JSON.stringify(c) + ': ' + w);
  });
  assert.equal(SC.LIN_STATS.mieDone, n0.mieDone, 'no far field worked out after the two');
  assert.ok(SC.LIN_STATS.mieCombined > n0.mieCombined, 'every one combined');
  say('Mie combined against direct: worst', worst.toExponential(2));
  SC.setScatMode(null);
});

test('the dipole array: polarisation and power combined from two solves, against direct solves at 1e-11', async () => {
  await openBench(bench({ scatModel: 'dda', scatDip: 8, trapR: 300 }, {}));
  SC.setScatMode('async');
  const at = (lp) => { const el = getEl('laser'); for (const [k, v] of Object.entries(lp)) setParam(el, k, v); TR.setLastTraceKey(null); TR.traceScene(); };
  const o = { tol: 1e-11, maxIter: 2000 };
  const cases = [{ pol: 'linear', polAngle: 20 }, { pol: 'rcp' }, { pol: 'linear', polAngle: 61, power: 20 }];
  const direct = cases.map(c => { at(Object.assign({ pol: 'linear', polAngle: 0, power: 50 }, c)); return fresh(o); });
  SC.linClear();
  at({ pol: 'linear', polAngle: 0, power: 50 }); const A = solve(o);
  at({ pol: 'linear', polAngle: 90, power: 50 }); solve(o);
  assert.equal(A.model, 'dda');
  const n0 = SC.LIN_STATS.ddaSolved;
  let worst = 0;
  cases.forEach((c, i) => {
    at(Object.assign({ pol: 'linear', polAngle: 0, power: 50 }, c));
    const S = solve(o), w = diff(S, direct[i]);
    worst = Math.max(worst, w);
    assert.ok(S.dda.combined >= 1 && S.dda.runs === 0, 'combined, not solved: ' + JSON.stringify(S.dda));
    assert.ok(w < 1e-8, JSON.stringify(c) + ': ' + w);
  });
  assert.equal(SC.LIN_STATS.ddaSolved, n0, 'no dipole solve after the two');
  say('dipole array combined against direct: worst', worst.toExponential(2));
  SC.setScatMode(null);
});

test('answers kept by key: a state come back to is found, not worked out', async () => {
  await openBench(bench({}, {}));
  SC.setScatMode('async');
  const el = getEl('laser'), part = getEl(P);
  const key = () => { TR.setLastTraceKey(null); TR.traceScene(); return SC.scatterPrep(part).key; };
  setParam(el, 'polAngle', 10); const k1 = key(); const S1 = solve(); SC.scatKeep(P, k1, S1);
  setParam(el, 'polAngle', 50); const k2 = key(); const S2 = solve(); SC.scatKeep(P, k2, S2);
  setParam(el, 'polAngle', 10); const k3 = key();
  assert.equal(k3, k1);
  const c = SC.scatFind(P, k3);
  assert.ok(c && c.S === S1, 'the first answer, as it was');
  assert.equal(SC.scatterCached(part), S1);
  assert.ok(SC.scatKept.size >= 2 && SC.scatKept.size <= SC.SCAT_KEEP);
  SC.setScatMode(null);
});

test('a sweep of the polarisation: every step’s answer, combined, is a direct solve’s, and the next cycle finds them kept', async () => {
  await openBench(bench({}, {}));
  SC.setScatMode('async');
  const el = getEl('laser'), part = getEl(P), steps = [0, 22.5, 45, 67.5, 90];
  const direct = steps.map(a => { setParam(el, 'polAngle', a); TR.setLastTraceKey(null); TR.traceScene(); return fresh(); });
  SC.linClear(); SC.scatKept.clear();
  let worst = 0;
  for (const cyc of [1, 2]) {
    const before = SC.LIN_STATS.mieDone + SC.LIN_STATS.mieCombined;
    steps.forEach((a, i) => {
      setParam(el, 'polAngle', a); TR.setLastTraceKey(null); TR.traceScene();
      const J = SC.scatterPrep(part);
      let S = SC.scatFind(P, J.key);
      S = S ? S.S : solve();
      SC.scatKeep(P, J.key, S, true);
      worst = Math.max(worst, diff(S, direct[i]));
    });
    if (cyc === 2) assert.equal(SC.LIN_STATS.mieDone + SC.LIN_STATS.mieCombined, before, 'the second cycle worked nothing out');
  }
  assert.ok(worst < 1e-9, 'worst ' + worst);
  SC.setScatMode(null);
});

test('a rod turned step by step: each step from the nearest answer, as a solve from nothing gives it', async () => {
  await openBench(bench({ trapShape: 'cylinder', trapR: 60, trapLen: 600, scatModel: 'auto', scatDip: 6 }, {}));
  SC.setScatMode('async');
  const part = getEl(P), tilts = [45, 75, 105, 135];
  const at = t => { setParam(part, 'trapTilt', t); TR.setLastTraceKey(null); TR.traceScene(); };
  const direct = tilts.map(t => { at(t); return fresh({ tol: 1e-9 }); });
  SC.linClear();
  let warm = 0, it = 0, itCold = direct.reduce((a, S) => a + S.dda.iters, 0);
  tilts.forEach((t, i) => {
    at(t);
    const S = solve({ tol: 1e-9 });
    assert.equal(S.model, 'dda');
    assert.ok(Math.abs(S.Psca - direct[i].Psca) < 1e-7 * direct[i].Psca, t + '°: ' + S.Psca + ' against ' + direct[i].Psca);
    warm += S.dda.warm; it += S.dda.iters;
  });
  assert.ok(warm >= tilts.length - 1, 'every step after the first started warm: ' + warm);
  assert.ok(Math.abs(part.trapTilt - 135) < 1e-12, 'a tilt past 90° is kept');
  say('rod turned: iterations', it, 'warm against', itCold, 'cold');
  SC.setScatMode(null);
});

test('the dipoles’ sum by FFT and the far field by the grid’s phases are the direct sums', () => {
  for (const [shape, Dm, L] of [['sphere', 4e-7, 4e-7], ['cylinder', 1.2e-7, 9e-7], ['spheroid', 2e-7, 6e-7]]) {
    const k = 2 * Math.PI / 1.55e-6, lat = D.ddaPlan(shape, Dm, L, k, 1.44, { across: 8 });
    const al = D.ddaAlpha(1.44, 0, k, lat.d, 'ldr', [1, 0, 0], [0, 1, 0]);
    const A = D.ddaSolver(lat, k, al, { fftFrom: 1e9 }), B = D.ddaSolver(lat, k, al, { fftFrom: 1 });
    const p = Float64Array.from({ length: 6 * lat.N }, (_, i) => Math.sin(i * 1.7) * 1e-30 + Math.cos(i * 0.3) * 4e-31);
    const a = A.apply(p, new Float64Array(6 * lat.N)), b = B.apply(p, new Float64Array(6 * lat.N));
    let num = 0, den = 0; for (let i = 0; i < a.length; i++) { num += (a[i] - b[i]) ** 2; den += a[i] ** 2; }
    assert.ok(Math.sqrt(num / den) < 1e-12, shape + ' FFT: ' + Math.sqrt(num / den));
    const dirs = Float64Array.of(1, 0, 0, 0, 0.6, 0.8, -0.48, 0.6, 0.64), F = D.ddaFar(lat, k, p, dirs);
    const bare = Object.assign({}, lat, { ix: null }), G = D.ddaFar(bare, k, p, dirs);
    let m = 0, t = 0; for (let i = 0; i < F.length; i++) { m = Math.max(m, Math.abs(F[i] - G[i])); t = Math.max(t, Math.abs(G[i])); }
    assert.ok(m < 1e-12 * t, shape + ' far field: ' + m / t);
  }
});

test('the trap worked out apart is the one worked out with the scattering', async () => {
  await openBench(bench({ trapR: 150 }, { power: 200 }));
  SC.setScatMode('async');
  TR.setLastTraceKey(null); TR.traceScene();
  const el = getEl(P), J = SC.scatterPrep(el), R = BT.popRun(TR.lastTrace.beams, J.srcs, { keep: J.keep, bare: true });
  const without = SC.scatterRun(el, R, { trap: false }), withT = SC.scatterRun(el, R);
  assert.ok(without.trapLater && !without.trapRaw);
  assert.ok(withT.trapRaw && !withT.trapLater);
  assert.deepEqual(JSON.parse(JSON.stringify(SC.particleTrapRaw(el, R))), JSON.parse(JSON.stringify(withT.trapRaw)));
  // everything else the same
  assert.ok(diff(without, withT) === 0, 'the scattering does not depend on the trap being worked out');
  SC.setScatMode(null);
});
