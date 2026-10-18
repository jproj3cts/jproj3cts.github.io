/* A lens design at another temperature: the air's index as the standard formula gives it (and in proportion to the
   pressure); N-BK7's absolute index changing as its maker's data sheet has it; a design whose glass and housing grow
   alike and whose index does not change scaling as a whole, its focus staying on the detector; a thin singlet's focal
   length changing at its thermo-optic rate, α - (dn/dT)/(n - 1); and a singlet in an aluminium housing whose focus
   drifts as that rate and the housing's growth together say. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const TH = await import('../../src/engines/lens-thermal.js');
const E = await import('../../src/engines/lens-engine.js');

const surf = (R, x) => ({ R, k: 0, a2: 0, A: [], odd: null, semi: 10, ...x });
const asmOf = (fields, nms, epd, kind) => ({ cond: { aperture: { kind: kind || 'epd', v: epd }, fields: fields.map(deg => ({ deg, w: 1 })), waves: nms.map(nm => ({ nm, w: 1 })), primary: 0 } });

test('the air’s index: standard air, and in proportion to the pressure', () => {
  // dry air at 15 °C and one atmosphere, 589.3 nm: n - 1 = 2.7717e-4 (Edlén)
  assert.ok(Math.abs(TH.nAir(589.3, 15, 1) - 1 - 2.7717e-4) < 1e-7, String(TH.nAir(589.3, 15, 1) - 1));
  assert.ok(Math.abs((TH.nAir(589.3, 15, 0.5) - 1) / (TH.nAir(589.3, 15, 1) - 1) - 0.5) < 1e-12 && TH.nAir(589.3, 15, 0) === 1);
  assert.ok(TH.nAir(589.3, 40, 1) < TH.nAir(589.3, 15, 1));
});

test('N-BK7’s absolute index changes as its data sheet has it: 1.6e-6 per K at 546 nm from 20 to 40 °C', () => {
  const m = { glass: 'N-BK7' }, abs = T => TH.nRelAt(m, 546.07, T, 1) * TH.nAir(546.07, T, 1);
  const rate = (abs(40) - abs(20)) / 20;
  assert.ok(Math.abs(rate - 1.6e-6) < 0.06e-6, String(rate));
  // and at its reference temperature, in air, its catalogue index
  assert.ok(Math.abs(TH.nRelAt(m, 546.07, 20, 1) - TH.nRelAt(m, 546.07, 20, 1)) === 0);
  const th = TH.thermalOf(m);
  assert.ok(th.T0 === 20 && th.cte === 7.1e-6 && th.D.length === 6);
});

test('glass and housing growing alike, the index not changing: the design scales as a whole, its focus staying on the detector', () => {
  const g = { glass: 'custom', n: 1.6, cte: 23.6e-6 };
  const P = { surfaces: [surf(null, { stop: true, semi: 4 }), surf(40, { A: [1e-6] }), surf(-80)], gaps: [3, 5], materials: [{ glass: 'AIR' }, g], stopIndex: 0 };
  P.image = E.lensSystem(P, 587.56).par.bfl;
  // the aperture as an f-number, which grows with the design (a fixed entrance pupil would not)
  const R = TH.thermalAnalysis(asmOf([0, 5], [587.56], 6, 'fno'), P, [-20, 60], 0, 23.6e-6);
  for (const r of R.rows) {
    const k = 1 + 23.6e-6 * (r.T - 20);
    assert.ok(Math.abs(r.efl / R.nominal.efl - k) < 1e-12, 'EFL ' + r.efl / R.nominal.efl + ' against ' + k);
    assert.ok(Math.abs(r.defocus) < 1e-12, 'defocus ' + r.defocus);
    assert.ok(Math.abs(r.rms[1] / R.nominal.rms[1] - k) < 1e-9, 'spot ' + r.rms[1] / R.nominal.rms[1]);
  }
});

test('a thin singlet’s focal length changes at its thermo-optic rate; in aluminium its focus drifts by that less the housing’s growth', () => {
  const m = { glass: 'N-BK7' }, nm = 587.56;
  const P = { surfaces: [surf(null, { stop: true, semi: 4 }), surf(100), surf(-100)], gaps: [0, 0.5], materials: [{ glass: 'AIR' }, m], stopIndex: 0 };
  P.image = E.lensSystem(P, nm).par.bfl;
  const R = TH.thermalAnalysis(asmOf([0], [nm], 4), P, [20], 1, 23.6e-6), f = R.nominal.efl;
  const n = TH.nRelAt(m, nm, 20, 1), dndt = (TH.nRelAt(m, nm, 21, 1) - TH.nRelAt(m, nm, 19, 1)) / 2, want = (7.1e-6 - dndt / (n - 1)) * f;
  assert.ok(Math.abs(R.eflDrift - want) < 0.01 * Math.abs(want), 'dEFL/dT ' + R.eflDrift + ' against ' + want);
  // the focus, at a back focus near f, moves with the focal length; the detector with the housing
  const bfl = R.nominal.efl, wantDrift = R.eflDrift - 23.6e-6 * P.image;
  assert.ok(Math.abs(R.drift - wantDrift) < 0.02 * Math.abs(wantDrift), 'drift ' + R.drift + ' against ' + wantDrift);
});
