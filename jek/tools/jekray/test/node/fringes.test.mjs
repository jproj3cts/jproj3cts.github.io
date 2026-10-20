/* Fringe visibility on a screen's rays: only light of one launch that meets itself by two paths makes fringes. Two separate
   lasers crossing on a screen, brighter where they overlap, make none; one laser split and recombined does. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBench } from '../../headless.mjs';
const hene = (id, y, angle, extra = {}) => ({ type: 'source', id, name: id, x: -60, y, angle, wavelength: 632.8, width: 10, rays: 15, power: 1, pol: 'unpolarised', ...extra });
const screen = { type: 'screen', id: 'scr', name: 'Screen', x: -25, y: 11, angle: 180, length: 25.4 };

test('two separate lasers overlapping on a screen show no fringes, though the overlap is brighter', async () => {
  const B = await openBench({ format: 'jekray', version: 1, elements: [hene('A', 0, 16.2), { ...hene('B', 20, -15.9), x: -58 }, screen] });
  const s = B.screen('Screen');
  assert.ok(s.count === 60, JSON.stringify(s.count));
  assert.equal(s.visibility, null, 'no fringe visibility between separate lasers');
  const one = await openBench({ format: 'jekray', version: 1, elements: [hene('A', 0, 16.2), screen] });
  assert.equal(one.screen('Screen').visibility, null, 'nor across one beam’s own profile');
});

test('one laser split and recombined does show fringes', async () => {
  // a Michelson: the beam splitter sends half to each mirror, the screen sees both returns
  const B = await openBench({ format: 'jekray', version: 1, elements: [
    { type: 'source', id: 'L', name: 'L', x: -40, y: 0, angle: 0, wavelength: 632.8, width: 2, rays: 11, power: 1 },
    { type: 'cube', id: 'bs', name: 'BS', x: 0, y: 0 },
    { type: 'mirror', id: 'm1', name: 'M1', x: 30, y: 0, angle: 180.05, length: 12.7 },
    { type: 'mirror', id: 'm2', name: 'M2', x: 0, y: 30, angle: -90, length: 12.7 },
    { type: 'screen', id: 'scr', name: 'Screen', x: 0, y: -30, angle: 90, length: 25.4 }] });
  const s = B.screen('Screen');
  assert.ok(s.visibility > 0.5, JSON.stringify({ vis: s.visibility, n: s.count }));
});

test('two beams split from one laser, crossing at a small angle, show full fringes on the rays; unbalanced, less', async () => {
  const pair = (deg, p2 = 1) => openBench({ format: 'jekray', version: 1, elements: [
    { type: 'source', id: 'A', name: 'A', x: -60, y: 0, angle: 0, wavelength: 1550, width: 4, rays: 11, power: 1, gauss: true, w0: 2 },
    { type: 'source', id: 'B', name: 'B', x: -60, y: 0.1, angle: deg, wavelength: 1550, width: 4, rays: 11, power: p2, gauss: true, w0: 2, splitFrom: 'A' },
    { type: 'screen', id: 'scr', name: 'Screen', x: 0, y: 0, angle: 180, length: 25.4 }] });
  for (const deg of [0.5, 2]) {
    const v = (await pair(deg)).screen('Screen').visibility;
    assert.ok(v > 0.95, deg + '°: ' + v);
  }
  // a quarter of the power in one beam: 2√(I₁I₂)/(I₁ + I₂) = 0.8
  const u = (await pair(0.5, 0.25)).screen('Screen').visibility;
  assert.ok(Math.abs(u - 0.8) < 0.05, 'unbalanced ' + u);
});
