/* The graded-index RF lens: its design (thickness, index and density from centre to edge, the
   lowest density a frequency allows), the plate it puts on the bench (its delay a thin lens's
   of the design focal length, near the axis), and a Gaussian beam focused where a thin lens of
   that focal length focuses it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { normGrin, grinDesign, GRIN_LINE } = await import('../../src/core/grin.js');
const { RF_MAT, C_NM_GHZ } = await import('../../src/core/rf.js');
const { loadProject } = await import('../../src/state/elements.js');
const TRACE = await import('../../src/engines/trace.js');
const { maskFns } = await import('../../src/core/mask.js');
const { beamAt } = await import('../../src/core/beams-hom.js');
const STATE = await import('../../src/state/project.js');

test('the design: thickness, index and density from centre to edge', () => {
  const g = normGrin({ f: 150, ghz: 24, mat: 'PLA', fillMax: 100, fillMin: 15 }), D = grinDesign(g, 120);
  const n = RF_MAT.PLA.n, lam = C_NM_GHZ / 24 * 1e-6;
  assert.ok(Math.abs(D.nHi - n) < 1e-12, 'solid at the centre: the material’s own index');
  // the lowest density at 24 GHz: 0.45 mm lines a quarter wavelength in the plastic apart
  const floor = 100 * GRIN_LINE / (lam / (4 * n));
  assert.ok(Math.abs(D.fillLo - floor) < 1e-9 && D.raised, 'raised to ' + floor.toFixed(1) + '%');
  assert.ok(Math.abs(D.nLo - Math.sqrt(1 + floor / 100 * (n * n - 1))) < 1e-12);
  // the thickness the ideal profile's path needs between the two
  const want = (Math.sqrt(60 * 60 + 150 * 150) - 150) / (D.nHi - D.nLo);
  assert.ok(Math.abs(D.t - want) < 1e-9, 'thickness ' + D.t);
  assert.ok(Math.abs(D.nAt(0) - D.nHi) < 1e-12 && Math.abs(D.nAt(60) - D.nLo) < 1e-12);
  assert.ok(D.fillAt(0) > D.fillAt(30) && D.fillAt(30) > D.fillAt(60), 'densest at the centre');
  // at 10 GHz the 15% asked for stands
  const D10 = grinDesign(normGrin({ f: 250, ghz: 10, mat: 'PLA' }), 200);
  assert.ok(!D10.raised && D10.fillLo === 15);
});

test('its plate: a thin lens of the design focal length near the axis', () => {
  const el = { type: 'mask', length: 120, grin: { f: 150, ghz: 24, mat: 'PLA' } };
  loadProject({ format: 'jekray', version: 1, elements: [Object.assign({ name: 'G', x: 0, y: 0, angle: 0, mmw: { part: true } }, el)] });
  const G = STATE.project.elements[0], fn = maskFns(G).fn, lam = C_NM_GHZ / 24 * 1e-6;
  assert.ok(G.grin && G.preset === 'grin');
  // delay in waves at small r: -r^2 / (2 f lambda)
  const r = 2, d = fn(r, 0, lam)[1];
  assert.ok(Math.abs(d / (-r * r / (2 * 150 * lam)) - 1) < 1e-3, 'paraxial delay ' + d);
  assert.ok(fn(70, 0, lam)[0] === 0 && fn(0, 0, lam)[0] > 0.8, 'clear inside, opaque outside');
});

test('a Gaussian beam is focused where a thin lens of that focal length focuses it', () => {
  const lam = C_NM_GHZ / 24 * 1e-6, w0 = 40, zR = Math.PI * w0 * w0 / lam, f = 150;
  loadProject({ format: 'jekray', version: 1, minPower: 1e-6, elements: [
    // an ideal Gaussian feed horn, its waist w0 at its aperture (a very long horn: no curvature)
    { type: 'source', name: 'S', x: -1, y: 0, angle: 0, rays: 1, mmw: { kind: 'gauss', ghz: 24, dbm: 0, a: w0 / 0.6435, L: 1e9 } },
    { type: 'mask', name: 'G', x: 0, y: 0, angle: 0, length: 200, mmw: { part: true }, grin: { f, ghz: 24, mat: 'ABS', fillMin: 15 } },
    { type: 'screen', name: 'T', x: 400, y: 0, angle: 180, length: 200 }] });
  TRACE.setLastTraceKey(null); TRACE.traceScene();
  const G = STATE.project.elements.find(e => e.name === 'G');
  const b = TRACE.lastTrace.beams.find(x => x.ev && x.ev.surf && x.ev.surf.el && x.ev.surf.el.id === G.id && x.qi > 0);
  assert.ok(b, 'a beam leaves the lens');
  // the waist after a thin lens, for a waist (nearly) at it: f / (1 + (f / zR)^2)
  const want = f / (1 + (f / zR) ** 2), got = -b.qr;
  assert.ok(Math.abs(got - want) < 0.02 * want, 'waist ' + got.toFixed(1) + ' mm after the lens, a thin lens puts it at ' + want.toFixed(1));
});

test('a measured mixing rule: the density for an index inverts it, the default is the mean by volume, and the plate carries its loss', async () => {
  const { mixEps, mixFill } = await import('../../src/core/rf.js');
  const lin = { n: 1.643, tand: 0.01 }, loo = { n: 1.643, tand: 0.01, mix: 1 / 3 };
  for (const F of [0, 0.2, 0.5, 0.8, 1]) {
    assert.ok(Math.abs(mixEps(lin, F).eps - (1 + F * (lin.n ** 2 - 1))) < 1e-12, 'a = 1 is the mean by volume');
    for (const M of [lin, loo]) assert.ok(Math.abs(mixFill(M, mixEps(M, F).eps) - F) < 1e-12, 'inverse at ' + F);
  }
  assert.ok(mixEps(loo, 0.5).eps < mixEps(lin, 0.5).eps, 'Looyenga lower than the mean by volume');
  assert.ok(Math.abs(mixEps(loo, 1).epsI - lin.n ** 2 * lin.tand) < 1e-12 && mixEps(loo, 0).epsI === 0, 'loss from none to the plastic’s');
  // a lens of a material with a measured rule: the edge's least density gives a lower index, so a wider range and a
  // thinner disc for the same focal length; and the
  // plate's amplitude carrying the design's loss at the centre and the edge
  const was = RF_MAT.PLA.mix;
  RF_MAT.PLA.mix = 0.5;
  try {
    const g = normGrin({ f: 150, ghz: 24, mat: 'PLA' }), D = grinDesign(g, 120);
    RF_MAT.PLA.mix = undefined; const D1 = grinDesign(g, 120); RF_MAT.PLA.mix = 0.5;
    assert.ok(D.t < D1.t && D.nLo < D1.nLo && Math.abs(D.nHi - D1.nHi) < 1e-12, 'thinner: ' + D1.t.toFixed(2) + ' -> ' + D.t.toFixed(2));
    loadProject({ format: 'jekray', version: 1, elements: [{ type: 'mask', name: 'G', x: 0, y: 0, angle: 0, length: 120, mmw: { part: true }, grin: { f: 150, ghz: 24, mat: 'PLA' } }] });
    const fn = maskFns(STATE.project.elements[0]).fn, lam = C_NM_GHZ / 24 * 1e-6;
    for (const r of [0, 59]) {
      const A = fn(r, 0, lam)[0], L = D.lossDb(r), want = Math.sqrt(10 ** (-L.abs / 10)) * (1 - ((D.nAt(r) - 1) / (D.nAt(r) + 1)) ** 2);
      assert.ok(Math.abs(A / want - 1) < 1e-5, 'amplitude at r = ' + r + ': ' + A + ' against ' + want);
    }
  } finally { RF_MAT.PLA.mix = was; }
});
