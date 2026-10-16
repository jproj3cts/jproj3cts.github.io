/* Yield: the share of Monte Carlo's builds meeting a specification, with the Wilson interval at 95% confidence.
   The interval against its textbook values; the yield and each part's share counted from builds made up; a singlet's
   builds, each with its merit operands' values as compensated (its focal length the lens engine's own on the nominal),
   a criterion at most the 90% point passing at least 90% of them, and the yield worked out again for a new
   specification from the same builds. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const E = await import('../../src/engines/lens-engine.js');
const T = await import('../../src/engines/lens-tol.js');
const A = await import('../../src/core/assembly.js');

test('the Wilson interval, as the tables give it', () => {
  const [a, b] = T.wilson(5, 10), [c, d] = T.wilson(0, 10), [e, f] = T.wilson(95, 100);
  assert.ok(Math.abs(a - 0.2366) < 1e-4 && Math.abs(b - 0.7634) < 1e-4, a + ' ' + b);
  assert.ok(c === 0 && Math.abs(d - 0.2775) < 1e-4, d);
  assert.ok(Math.abs(e - 0.8883) < 1e-4 && Math.abs(f - 0.9785) < 1e-4, e + ' ' + f);
});

test('the yield and each part’s share, counted', () => {
  const trials = [{ crit: 1, ops: [10] }, { crit: 2, ops: [11] }, { crit: 3, ops: [12] }, { crit: 4, ops: [13] }];
  const Y = T.yieldOf(trials, { crit: 3, specs: [{ j: 0, lo: 11, hi: null }] });
  assert.equal(Y.k, 2); assert.equal(Y.rate, 0.5);
  assert.deepEqual(Y.per.map(q => q.k), [3, 3]);
  assert.equal(T.yieldOf(trials, null), null);
  assert.deepEqual(A.normTol({ yield: { crit: 0.01, specs: [{ j: 0, lo: 5, hi: 2 }, { j: 1 }, { j: 0, lo: 1 }] } }).yield, { crit: 0.01, specs: [{ j: 0, lo: 2, hi: 5 }] });
});

test('a singlet’s builds carry their operands; at most the 90% point passes 90% of them', () => {
  const surf = (R, x) => ({ R, k: 0, a2: 0, A: [], odd: null, semi: 12.7, ...x });
  const P = { surfaces: [surf(null, { stop: true, semi: 5 }), surf(51.5), surf(-51.5)], gaps: [2, 3.6], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }], stopIndex: 0,
    parts: [{ id: 'S', kind: 'stop', n: 1 }, { id: 'L', kind: 'lens', n: 2 }] };
  P.image = E.lensSystem(P, 587.56).par.bfl;
  const prob = { P, cond: A.normCond({ aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0 }, { deg: 5 }], waves: [{ nm: 587.56 }] }),
    design: Object.assign(A.normDesign({}), { merit: A.normMerit({ ops: [{ op: 'EFL', target: 50, weight: 1 }] }), tol: A.normTol({ trials: 60 }) }) };
  const trials = T.tolMonteCarlo(prob, prob.design.tol, 0, 60);
  assert.ok(trials.every(t => t.ops && t.ops.length === 1 && isFinite(t.ops[0])));
  // the nominal's focal length as the merit has it, and as the lens engine does
  const nomOps = T.opValues(prob, P);
  assert.ok(Math.abs(nomOps[0] - E.lensSystem(P, 587.56).par.efl) < 1e-9);
  const st = T.mcStats(trials.map(t => t.crit)), Y = T.yieldOf(trials, { crit: st.p90, specs: [] });
  assert.ok(Y.rate >= 0.9 && Y.lo < Y.rate && Y.hi > Y.rate);
  // a new specification, from the same builds: the focal length within ±0.2% of nominal
  const f0 = nomOps[0], Y2 = T.yieldOf(trials, { crit: null, specs: [{ j: 0, lo: 0.998 * f0, hi: 1.002 * f0 }] });
  assert.equal(Y2.k, trials.filter(t => Math.abs(t.ops[0] - f0) <= 0.002 * f0 + 1e-12).length);
});
