/* Beams that rise or descend out of the bench plane, onto a particle and into a trap: each pair built level and rising
   must agree once the frame is turned. Tolerances written before the first run
   (scratchpad tolerances.md, "Beams that rise or descend onto a Particle"). SHOW=1 prints the margins. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBench, engine } from '../../headless.mjs';

await engine();
const TR = await import('../../src/engines/trace.js');
const PS = await import('../../src/engines/phase-screen.js');
const say = (...a) => { if (process.env.SHOW) console.log('#', ...a); };
const doc = els => ({ format: 'jekray', version: 1, name: 't', maxBounces: 20, minPower: 0.0001, light: { rays: true, envelope: true, field: true }, benches: [{ id: 'b1', name: 'B' }], tab: 'b1',
  elements: els.map(e => Object.assign({ bench: 'b1', angle: 0 }, e)) });
const laser = (o = {}) => Object.assign({ id: 'laser', type: 'source', name: 'Laser', x: -20, y: 0, wavelength: 1550, gauss: true, w0: 0.05, z0: 20, rays: 0, traceRays: false, power: 100, pol: 'p' }, o);

test('B1: a level beam’s frame is the level frame every reading has used', async () => {
  const B = await openBench(doc([laser({}), { id: 'm', type: 'mirror', name: 'M', x: 10, y: 0, angle: 135, length: 10 },
    { id: 's', type: 'screen', name: 'S', x: 10, y: 30, angle: 270, length: 10 }])); B.trace();
  const beams = TR.lastTrace.beams;
  assert.ok(beams.length >= 2);
  for (const b of beams) {
    const F = PS.beamFrame(b), z0 = b.z0 !== undefined ? b.z0 : 75;
    const want = { P0: [b.x0, b.y0, z0], d: [b.dx, b.dy, 0], ex: [-b.dy, b.dx, 0], ey: [0, 0, 1] };
    for (const k of Object.keys(want)) want[k].forEach((v, i) => assert.ok(Math.abs(F[k][i] - v) <= 1e-15, k + '[' + i + '] ' + F[k][i] + ' against ' + v));
    assert.equal(F.L, b.len); assert.equal(F.level, true);
  }
  say('B1', beams.length, 'level legs: exact');
});
test('a rising beam’s frame: its way, its axes square to it and to each other, ey upward', async () => {
  const B = await openBench(doc([laser({ tip: 30 })])); B.trace();
  const b = TR.lastTrace.beams.find(q => q.d3);
  assert.ok(b, 'a rising leg');
  const F = PS.beamFrame(b), dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
  assert.ok(Math.abs(Math.hypot(...F.d) - 1) < 1e-12 && Math.abs(dot(F.d, F.ex)) < 1e-12 && Math.abs(dot(F.d, F.ey)) < 1e-12 && Math.abs(dot(F.ex, F.ey)) < 1e-12 && F.ey[2] > 0 && !F.level);
  assert.ok(Math.abs(F.d[2] - Math.sin(30 * Math.PI / 180)) < 1e-9, 'rises at 30 deg: ' + F.d);
});

/* B2: a screen's atom trap fed by a rising beam. The screen used to take the beam's 3D length as its run across the bench,
   so its trap was looked for past where the beam meets it (screenDom against trapBeams). */
const SS = await import('../../src/engines/screen-stats.js');
const PD = await import('../../src/engines/pd-cavity.js');
const ST = await import('../../src/state/project.js');
const T30 = 30 * Math.PI / 180;
const atomTrap = async tip => {
  const z = tip ? { x: -20 + 20 * Math.cos(T30), z: 75 + 20 * Math.sin(T30), tip: -30 } : { x: 0 };
  const B = await openBench(doc([laser({ tip: tip ? 30 : 0, pol: 's', power: 1000 }), Object.assign({ id: 's', type: 'screen', name: 'S', y: 0, angle: 180, length: 0.2, absorb: false, trap: 'Rb87' }, z)]));
  B.trace();
  const el = ST.project.elements.find(e => e.id === 's'), D = PD.diffraction(el);
  return D && D.trap ? SS.trapReport(el, D.trap) : null;
};
test('B2: a screen’s atom trap in a rising beam is the level one', async () => {
  const L = await atomTrap(false), R = await atomTrap(true);
  assert.ok(L && L.trap && R && !R.error, 'traps: ' + JSON.stringify([L && L.trap, R && (R.error || R.trap)]));
  const rel = (a, b) => Math.abs(a / b - 1);
  for (const q of ['U', 'fx', 'fy', 'fz']) assert.ok(rel(R[q], L[q]) <= 1e-4, q + ': ' + R[q] + ' rising against ' + L[q] + ' level');
  say('B2 U', rel(R.U, L.U).toExponential(2), 'fx', rel(R.fx, L.fx).toExponential(2), 'fy', rel(R.fy, L.fy).toExponential(2), 'fz', rel(R.fz, L.fz).toExponential(2));
});
