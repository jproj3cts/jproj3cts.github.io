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

test('a Gaussian beam is focused where the graded slab’s own paraxial matrix puts it, near a thin lens of its focal length', async () => {
  const { grinSlab } = await import('../../src/core/grin.js'), { grMatrix } = await import('../../src/core/gradient.js');
  const lam = C_NM_GHZ / 24 * 1e-6, w0 = 40, zR = Math.PI * w0 * w0 / lam, f = 150, d0 = 200;
  const grin = { f, ghz: 24, mat: 'ABS', fillMin: 15 }, G = grinSlab(normGrin(grin), 200);
  loadProject({ format: 'jekray', version: 1, minPower: 1e-6, elements: [
    // an ideal Gaussian feed horn, its waist w0 at its aperture (a very long horn: no curvature), 200 mm before the disc's centre
    { type: 'source', name: 'S', x: -d0, y: 0, angle: 0, rays: 1, mmw: { kind: 'gauss', ghz: 24, dbm: 0, a: w0 / 0.6435, L: 1e9 } },
    { type: 'mask', name: 'G', x: 0, y: 0, angle: 0, length: 200, mmw: { part: true }, grin },
    { type: 'screen', name: 'T', x: 400, y: 0, angle: 180, length: 200 }] });
  TRACE.setLastTraceKey(null); TRACE.traceScene();
  const Ge = STATE.project.elements.find(e => e.name === 'G');
  // the beam leaving the disc's back face (the one inside it is in the plastic)
  const b = TRACE.lastTrace.beams.find(x => x.ev && x.ev.surf && x.ev.surf.el && x.ev.surf.el.id === Ge.id && x.qi > 0 && x.n <= 1.0001);
  assert.ok(b, 'a beam leaves the lens');
  // the slab's paraxial matrix on the beam's q (real height and slope): free space to the front face, in through a flat face
  // (q scaled by the index), the graded slab's r² term (core/gradient.js grMatrix), out through the back face
  let q = [d0 - G.T / 2, zR];
  q = [q[0] * G.n0, q[1] * G.n0];
  const [A, B, C, D] = grMatrix(G.grad[0], G.n0, G.T), nr = C * q[0] + D, ni = C * q[1], den = nr * nr + ni * ni, ar = A * q[0] + B, ai = A * q[1];
  q = [(ar * nr + ai * ni) / den / G.n0, (ai * nr - ar * ni) / den / G.n0];
  const want = -q[0], got = -b.qr;
  assert.ok(Math.abs(got - want) < 0.02 * want, 'waist ' + got.toFixed(1) + ' mm after the back face, the slab’s matrix puts it at ' + want.toFixed(1));
  // and near where a thin lens of the focal length would, measured from the disc's centre: within the disc's own thickness
  const u = d0, thin = 1 / (1 / f - 1 / u) ;                     // the image of the waist's place, u before the lens (the beam is nearly collimated: zR ≫ f)
  const thinWaist = f / (1 + (f / zR) ** 2);
  assert.ok(Math.abs(got + G.T / 2 - thinWaist) < G.T && isFinite(thin), 'the waist ' + (got + G.T / 2).toFixed(1) + ' mm from the centre, a thin lens ' + thinWaist.toFixed(1) + ', the disc ' + G.T.toFixed(1) + ' thick');
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

test('matching layers: no reflection at the centre at the design frequency, the focus kept, the plate carrying it', () => {
  const bare = grinDesign(normGrin({ f: 150, ghz: 24, mat: 'PLA' }), 120), g = normGrin({ f: 150, ghz: 24, mat: 'PLA', match: true }), D = grinDesign(g, 120);
  const lam = C_NM_GHZ / 24 * 1e-6;
  assert.ok(D.match && Math.abs(D.tm - lam / (4 * Math.sqrt(D.nHi))) < 1e-12 && Math.abs(D.tTot - D.t - 2 * D.tm) < 1e-12, 'a quarter wave each side');
  assert.ok(D.lossDb(0).refl < 1e-6, 'centre reflection ' + D.lossDb(0).refl + ' dB');
  assert.ok(D.lossDb(0).refl + D.lossDb(0).abs < bare.lossDb(0).refl + bare.lossDb(0).abs, 'less lost at the centre than bare');
  // the path through the whole disc, layers and all, short of the centre's by the profile's: the same focal length
  const path = r => D.t * D.nAt(r) + 2 * D.tm * D.nmAt(r);
  for (const r of [10, 30, 50, 60]) {
    const want = Math.sqrt(r * r + 150 * 150) - 150;
    assert.ok(Math.abs(path(0) - path(r) - want) < 1e-6, 'path at ' + r + ': ' + (path(0) - path(r)) + ' against ' + want);
  }
  assert.ok(D.rMatch > 0 && D.rMatch <= 60, 'matched fully out to ' + D.rMatch.toFixed(1) + ' mm');
  // the plate: its amplitude the design's loss within a little (its core index is the linear grade's), and the match a band
  loadProject({ format: 'jekray', version: 1, elements: [{ type: 'mask', name: 'G', x: 0, y: 0, angle: 0, length: 120, mmw: { part: true }, grin: { f: 150, ghz: 24, mat: 'PLA', match: true } }] });
  const fn = maskFns(STATE.project.elements[0]).fn;
  for (const r of [0, 30]) {
    const L = D.lossDb(r), want = Math.sqrt(10 ** (-L.abs / 10)) * 10 ** (-L.refl / 20);
    assert.ok(Math.abs(fn(r, 0, lam)[0] / want - 1) < 0.01, 'amplitude at ' + r + ': ' + fn(r, 0, lam)[0] + ' against ' + want);
  }
  assert.ok(fn(0, 0, lam / 1.3)[0] < fn(0, 0, lam)[0] - 0.01, 'away from the design frequency the faces reflect again');
});

test('the highest frequency: where its least density is as coarse as the frequency allows; matching layers have a band about the design', () => {
  // its least density raised for 24 GHz: it holds to 24 GHz exactly; set well above that, to higher
  const raised = grinDesign(normGrin({ f: 150, ghz: 24, mat: 'PLA', fillMin: 15 }), 120);
  assert.ok(raised.raised && Math.abs(raised.ghzMax - 24) < 1e-6, 'raised: ' + raised.ghzMax);
  const low = grinDesign(normGrin({ f: 150, ghz: 10, mat: 'PLA', fillMin: 30 }), 120);
  assert.ok(!low.raised && Math.abs(low.ghzMax / (10 * 30 / low.fillFreq) - 1) < 1e-9 && low.ghzMax > 10, 'not raised: ' + low.ghzMax);
  const m = grinDesign(normGrin({ f: 150, ghz: 10, mat: 'PLA', fillMin: 30, match: true }), 120);
  assert.ok(m.band && m.band[0] < 10 && m.band[1] > 10 && m.band[1] <= m.ghzMax, 'band ' + m.band);
  assert.ok(m.reflM(m.nHi, Math.sqrt(m.nHi), C_NM_GHZ / m.band[0] * 1e-6) > 0.009, 'about 1% at its lower edge');
});
