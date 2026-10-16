/* Inverse sensitivity: for each tolerance alone, the limit at which the image is worse than nominal by
   the worsening allowed. At that limit Sensitivity's own run finds the worsening allowed (to the part in a
   hundred the search stops at); twice the worsening allows between √2 and 2 times the limit (between a
   quadratic and a linear effect); an amount allowed works as a share does; a tolerance that cannot worsen
   the image that much is reported as beyond a thousand times its limit; a gap closed on its − side before its + side worsens
   the image enough is marked. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const E = await import('../../src/engines/lens-engine.js');
const T = await import('../../src/engines/lens-tol.js');
const A = await import('../../src/core/assembly.js');

const surf = (R, x) => ({ R, k: 0, a2: 0, A: [], odd: null, semi: 20, ...x });
const singlet = () => ({ surfaces: [surf(null, { stop: true, semi: 5 }), surf(51.5, { semi: 12.7 }), surf(-51.5, { semi: 12.7 })], gaps: [2, 3.6], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }], stopIndex: 0,
  parts: [{ id: 'S', kind: 'stop', n: 1 }, { id: 'L', kind: 'lens', n: 2 }] });
const prob = tol => {
  const P = singlet(); P.image = E.lensSystem(P, 587.56).par.bfl;
  return { P, cond: A.normCond({ aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0 }, { deg: 5 }], waves: [{ nm: 587.56 }] }), design: Object.assign(A.normDesign({}), { tol: A.normTol(tol) }) };
};
const only = { rad: { on: false }, ind: { on: false }, abbe: { on: false }, tilt: { on: false } };

test('at the limit found, Sensitivity finds the worsening allowed; twice the worsening allows √2 to 2 times as much', () => {
  const pr = prob(Object.assign({ inv: { by: 'pct', v: 10 } }, only));
  const I = T.tolInverse(pr, pr.design.tol);
  assert.equal(I.rows.length, I.count);
  assert.ok(Math.abs(I.target - 0.1 * I.nominal) < 1e-15);
  // the gap between the stop and the lens (2 mm) moves the image linearly: closed (its − side gone), that side has not worsened it 10%,
  // and its + side does so only with the stop tens of millimetres away
  const gap = I.rows.find(r => r.label === 'Air gap after surface 1');
  assert.ok(!gap.beyond && gap.closes && gap.inv > 20, JSON.stringify(gap));
  for (const r of I.rows) {
    assert.ok(!r.beyond && !r.below, r.label);
    // Sensitivity with this one tolerance's limit set to what was found
    const ops = T.tolOps(pr.P, pr.design.tol), worse = v => Math.max(...[-1, 1].map(s => T.compensated(pr, T.perturb(pr.P, ops, ops.map((_, j) => j === r.k ? s * v : 0)), true).crit - I.nominal));
    assert.ok(worse(r.inv) < I.target && worse(1.011 * r.inv) >= I.target * 0.999, r.label + ': ' + worse(r.inv) + ' at ' + r.inv + ' against ' + I.target);
  }
  const pr2 = prob(Object.assign({ inv: { by: 'pct', v: 20 } }, only)), I2 = T.tolInverse(pr2, pr2.design.tol);
  // (but where twice the worsening is not reached before the glass or gap closes)
  I.rows.forEach((r, i) => { if (r === gap || I2.rows[i].beyond) return; const q = I2.rows[i].inv / r.inv; assert.ok(q > Math.SQRT2 * 0.98 && q < 2 * 1.02, r.label + ': ' + q); });
  // an amount allowed, the same as that share of the nominal
  const pr3 = prob(Object.assign({ inv: { by: 'abs', v: 0.1 * I.nominal } }, only)), I3 = T.tolInverse(pr3, pr3.design.tol);
  I.rows.forEach((r, i) => assert.ok(Math.abs(I3.rows[i].inv - r.inv) < 1e-12 * r.inv));
});

test('a tolerance that cannot worsen the image that much is beyond a thousand times its limit', () => {
  // a glass's Abbe number, with one wavelength: nothing at all
  const pr = prob({ rad: { on: false }, thk: { on: false }, dec: { on: false }, tilt: { on: false }, ind: { on: false }, abbe: { on: true, v: 0.5 } });
  const I = T.tolInverse(pr, pr.design.tol);
  assert.equal(I.rows.length, 1);
  assert.ok(I.rows[0].beyond && I.rows[0].inv === 500);
});
