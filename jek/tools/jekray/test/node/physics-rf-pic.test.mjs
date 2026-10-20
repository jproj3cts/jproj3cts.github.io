/* Two physics regressions. A photonic chip's group delay comes out as a positive path, n_g L
   for a bare waveguide, as a fibre adds its own (fibre.js adds FIBRE_NG L): the phase goes as
   e^{-i 2 pi n L / lambda}, which rises with lambda. And a diagonal horn's aperture field is
   integrated over the whole of its square, which stands on its corners, sqrt2 a out along x
   and y: its aperture efficiency is the textbook 81%, its Gaussicity 84.3% (Johansson and
   Whyborn), the other horns' figures as they were. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const STATE = await import('../../src/state/project.js');          // project is reassigned as one loads: read it live
const { loadProject } = await import('../../src/state/elements.js');
const { PIC } = await import('../../src/engines/pic.js');
const { hornPattern, hornComps } = await import('../../src/core/horns.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' vs ' + b);
const byId = id => STATE.project.elements.find(e => e.id === id);
// light into one grating coupler's fibre side, through len um of waveguide, to the far end
function chip(len, far, wg) {
  loadProject({ format: 'jekray', version: 1, name: 't', elements: [
    { type: 'pic', kind: 'gc', id: 'gin', name: 'In', x: -40, y: 0, angle: 180 },
    { type: 'pic', kind: far, id: 'far', name: 'Far', x: 40, y: 0, angle: 0 }],
  fibres: [{ a: ['gin', 0], b: ['far', 0], wg: Object.assign({ preset: 'si', len }, wg) }] });
  return PIC.scatter(byId('gin'), 1, 1550, 0);
}

test('a bare silicon waveguide delays the light by n_g L, a positive path, as a fibre does', () => {
  const a = chip(100, 'gc'), b = chip(200, 'gc');
  assert.equal(a.length, 1);
  assert.ok(a[0].ddl > 0, 'delay ' + a[0].ddl);
  // 4.2 x 100 um = 0.420 mm (the grating couplers' response is flat in phase: they add none)
  near(b[0].ddl - a[0].ddl, 4.2 * 0.1, 1e-4, 'per 100 um');
  near(a[0].ddl, 4.2 * 0.1, 1e-4, 'whole chip');
  // silicon nitride, n_g 2.0
  near(chip(1000, 'gc', { preset: 'sin' })[0].ddl - chip(500, 'gc', { preset: 'sin' })[0].ddl, 2.0 * 0.5, 1e-4, 'nitride per 500 um');
});

test('to an on-chip photodiode the delay is positive too', () => {
  const a = chip(100, 'pd'), b = chip(300, 'pd'), s = a.find(o => o.sink), t = b.find(o => o.sink);
  assert.ok(s && t, 'the photodiode takes the light in');
  assert.ok(s.ddl > 0, 'delay ' + s.ddl);
  near(t.ddl - s.ddl, 4.2 * 0.2, 1e-4, 'per 200 um');
});

const physEff = (kind, a, lam, area) => Math.pow(10, hornPattern(kind, a, 1e9, lam).dir / 10) * lam * lam / (4 * Math.PI * area);
test('a diagonal horn: the whole square aperture, 81% aperture efficiency, 84.3% Gaussicity', () => {
  const a = 7.5, lam = 3, side = 2 * a;
  near(physEff('diagonal', a, lam, side * side), 0.810, 0.005, 'aperture efficiency');
  const M = hornComps('diagonal');
  near(M.gauss, 0.843, 0.003, 'Gaussicity');
  const P = hornPattern('diagonal', a, 1e9, lam);
  near(P.hpbw[0], P.hpbw[1], 0.05, 'a symmetric beam');
});

test('the round horns are as they were', () => {
  const a = 7.5, lam = 3, D = k => hornPattern(k, a, 1e6, lam).dir;
  near(D('corrugated'), 22.32, 0.01, 'corrugated');
  near(D('smooth'), 23.15, 0.01, 'smooth');
  near(hornComps('corrugated').gauss, 0.9808, 1e-4, 'corrugated Gaussicity');
  near(hornComps('smooth').gauss, 0.8666, 1e-4, 'smooth Gaussicity');
  // the corrugated horn's aperture efficiency, against its circle: the closed form for J0(2.405 r/a), 0.692
  near(physEff('corrugated', a, lam, Math.PI * a * a), 0.692, 0.003, 'corrugated aperture efficiency');
});
