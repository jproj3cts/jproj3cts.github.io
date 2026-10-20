/* RF physics regressions: a wire grid's inductance as Chuss et al. give it (their Fig. 6 plots Xn = (λ/g) 2X, so
   X = (g/2λ) Xn, reflected 1/(1 + 4X²)), checked against Marcuvitz's sparse-grid ln(g/2πa); and a mixer's lower
   sideband, which comes down with its phase conjugated (the upper sideband's left as it was). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const TRACE = await import('../../src/engines/trace.js');
const C = await import('../../src/core/rf.js');
const E = await import('../../src/engines/elec.js');
const { rfCoupling } = await import('../../src/engines/fibre-face.js');
const { pkey, portsOf } = await import('../../src/engines/fibre.js');

const nm150 = C.C_NM_GHZ / 150, lam150 = nm150 * 1e-6;

test('a sparse wire grid’s inductance agrees with Marcuvitz’s (g/λ) ln(g/2πa) within a few per cent', () => {
  for (const [g, a] of [[0.1, 0.0025], [0.2, 0.0025], [0.4, 0.0025]]) {
    const G = C.gridCoef({ g, a }, nm150, 1, false), M = (g / lam150) * Math.log(g / (2 * Math.PI * a));
    assert.ok(Math.abs(G.X / M - 1) < 0.05, 'g ' + g + ', a ' + a + ': X ' + G.X + ' vs Marcuvitz ' + M);
    assert.ok(Math.abs(G.Rpar - 1 / (1 + 4 * G.X * G.X)) < 1e-15);
  }
});

test('a wire grid: X = (g/2λ) Xn(2a/g), the 25 µm / 10 µm grid at 150 GHz leaking −49.5 dB along its wires', () => {
  const g = 0.025, a = 0.005, u = Math.log(2 * Math.PI * a / g), Xn = 0.51 - 1.19 * u + 0.53 * u * u + 0.11 * u * u * u;
  const G = C.gridCoef({ g, a }, nm150, 1, false);
  assert.ok(Math.abs(G.X / (0.5 * (g / lam150) * Xn) - 1) < 1e-12, 'X ' + G.X);
  const leak = 10 * Math.log10(1 - G.Rpar);
  assert.ok(Math.abs(leak + 49.52) < 0.02, 'leak ' + leak + ' dB');
  // at 45°, wires upright (across the plane): X scales by cos θ
  const G45 = C.gridCoef({ g, a }, nm150, Math.SQRT1_2, false);
  assert.ok(Math.abs(G45.X / (G.X * Math.SQRT1_2) - 1) < 1e-12);
});

/* a 150 GHz feed horn into a mixer 120 mm off, its LO 1 GHz below (upper sideband) or above (lower): the IF at 1 GHz */
function ifTone(lo) {
  loadProject({ format: 'jekray', version: 1, name: 'mix', elements: [
    { type: 'source', id: 'H', name: 'Horn', x: 0, y: 0, angle: 0, rays: 3, mmw: { kind: 'corrugated', ghz: 150, dbm: 0, a: 7.5, L: 60 } },
    { type: 'detector', id: 'R', name: 'Rx', x: 120.37, y: 0, angle: 180, material: 'custom', resp: 0.5, gain: 1e4, mmw: { kind: 'corrugated', a: 7.5, L: 60, rx: 'mixer', lo, cl: 6, trx: 1000, tant: 295, ifbw: 5000 } },
    { type: 'elec', kind: 'scope', id: 'SC', name: 'SC', x: 200, y: 40 }],
    fibres: [{ a: ['R', 0], b: ['SC', 0], wire: true }], minPower: 1e-6 });
  TRACE.setLastTraceKey(null); TRACE.traceScene();
  const el = ST.project.elements.find(e => e.id === 'R'), X = E.elecExtra(el), k = X.findIndex(P => P.elec === 'out');
  const S = E.solve().out.get(pkey(el.id, portsOf(el).length - X.length + k)), t = S && S.tones.find(q => Math.abs(q.f - 1e9) < 1);
  return { t, ph: rfCoupling(el).lines[0].ph };
}

test('a mixer: the upper sideband comes down with the field’s phase, the lower with it conjugated', () => {
  const U = ifTone(149), L = ifTone(151);
  assert.ok(U.t && L.t, 'IF tones at 1 GHz');
  const wrap = p => Math.atan2(Math.sin(p), Math.cos(p)), phU = Math.atan2(U.t.im, U.t.re), phL = Math.atan2(L.t.im, L.t.re);
  assert.ok(Math.abs(Math.sin(U.ph)) > 0.1, 'a phase at the horn that tells the two apart: ' + U.ph);
  assert.ok(Math.abs(U.ph - L.ph) < 1e-12, 'the same field at the horn');
  // the IF band's pole at 1 GHz turns both alike: take it out
  const pole = -Math.atan(1e9 / 5e9);
  assert.ok(Math.abs(wrap(phU - pole - U.ph)) < 1e-9, 'upper: ' + phU + ' vs ' + (U.ph + pole));
  assert.ok(Math.abs(wrap(phL - pole + L.ph)) < 1e-9, 'lower: ' + phL + ' vs ' + (-L.ph + pole));
  assert.ok(Math.abs(Math.hypot(U.t.re, U.t.im) / Math.hypot(L.t.re, L.t.im) - 1) < 1e-12, 'the same amplitude');
});
