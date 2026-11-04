/* The tracer against closed forms: energy gained across a gap, the cyclotron orbit, the time of flight, a Paul
   trap's Mathieu parameters from its hyperbolic electrodes, and ions held or lost by it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildArray, solveArray, fieldSetOf } from '../../src/engines/session.js';
import { flyAll } from '../../src/engines/fly.js';
import { trapAnalysis } from '../../src/engines/trap.js';
import { potentialAt } from '../../src/engines/fields.js';
import { speedOfKE, QE, AMU } from '../../src/core/units.js';

const ion = o => Object.assign({ id: 'i1', name: 'ions', colour: '#f00', n: 1, mass: 39.962, charge: 1, ke: 10, keSpread: 0, x: 0, y: 0, z: 0, dist: 'point', size: 0, dirAz: 0, dirEl: 0, cone: 0, t0: 0, tSpread: 0, weight: 1 }, o);
const el = o => Object.assign({ id: 'e', name: 'E', colour: '#888', V: 0, rf: { on: false, amp: 0, mhz: 1, phase: 0 }, axis: 'x', x: 0, y: 0, z: 0 }, o);
function solved(P) { const A = buildArray(P); solveArray(A); return fieldSetOf(A, P); }

test('an ion gains the gap voltage in energy, and arrives when it should', () => {
  const P = { grid: { sym: 'planar', h: 0.25, x0: -5, x1: 45, y0: -10, y1: 10, bc: { ylo: 'mirror', yhi: 'mirror' } },
    electrodes: [el({ id: 'a', shape: 'box', x: -4, y: 0, sx: 1, sy: 30, sz: 30, V: 100 }), el({ id: 'b', shape: 'aperture', axis: 'x', x: 10, y: 0, rIn: 2, rOut: 15, L: 1, V: 0 })],
    ions: [ion({ x: -3, ke: 1 })], detectors: [{ id: 'd', axis: 'x', at: 40, x: 40, y: 0, z: 0, half: 0, stop: true, on: true }], fly: { tMax: 200 } };
  const F = solved(P), R = flyAll(F, P);
  const p = R.particles[0];
  assert.equal(p.end.why, 'det');
  // it starts half a millimetre off the plate, part way down the gap: it gains the potential there
  const phi0 = potentialAt(F.G, F.g, -3, 0, 0, 0);
  assert.ok(phi0 > 90 && phi0 < 99 && Math.abs(p.end.ke - (1 + phi0)) < 0.5, 'KE at the detector: ' + p.end.ke + ' eV from ' + phi0 + ' V');
  // after the aperture, 30 mm of drift at the full speed
  const v = speedOfKE(p.end.ke, 39.962), tDrift = 30 / v, h2 = p.hits[0];
  assert.ok(h2 && Math.abs(h2.ke - p.end.ke) < 1e-6);
  const tAt10 = p.pts.length ? (() => { for (let i = 0; i + 4 < p.pts.length; i += 4) if (p.pts[i] <= 10.5 && p.pts[i + 4] > 10.5) return p.pts[i + 3] + (10.5 - p.pts[i]) / (p.pts[i + 4] - p.pts[i]) * (p.pts[i + 7] - p.pts[i + 3]); return null; })() : null;
  assert.ok(tAt10 !== null && Math.abs(p.end.t - tAt10 - 29.5 / v) < 0.02 * tDrift, 'drift time ' + (p.end.t - tAt10) + ' vs ' + 29.5 / v);
});

test('an electron in a uniform magnetic field circles at the cyclotron radius', () => {
  const P = { grid: { sym: '3d', h: 1, x0: -20, x1: 20, y0: -20, y1: 20, z0: -5, z1: 5, bc: {} }, electrodes: [],
    ions: [ion({ mass: 5.48579909065e-4, charge: -1, ke: 1000, x: 0, y: -10, dirAz: 0 })], detectors: [], bfield: { bx: 0, by: 0, bz: 100 }, fly: { tMax: 0.01 } };
  const F = solved(P), R = flyAll(F, P), p = R.particles[0];
  // r = m v / (q B): 1 keV electron in 100 G
  const m = 5.48579909065e-4 * AMU, v = speedOfKE(1000, 5.48579909065e-4) * 1e3, rWant = m * v / (QE * 100e-4) * 1e3;
  let rMax = 0, rMin = Infinity;
  for (let i = 0; i < p.pts.length; i += 4) { const r = Math.hypot(p.pts[i], p.pts[i + 1] + 10 - rWant); rMax = Math.max(rMax, r); rMin = Math.min(rMin, r); }
  assert.ok(rWant > 5 && rWant < 15, 'a radius within the array: ' + rWant);
  assert.ok(Math.abs(rMax - rWant) < 0.02 * rWant && Math.abs(rMin - rWant) < 0.02 * rWant, 'orbit radius ' + rMin + '..' + rMax + ' vs ' + rWant);
  assert.equal(p.end.why, 'time');
});

test('a Paul trap: the ring and endcaps give the hyperbolic potential, the Mathieu parameters follow, and ions are held or lost', () => {
  // r0² = 2 z0² = 50 mm²: φ = (r² − 2z² + 2z0²)/(r0² + 2z0²) with the ring at 1 V, the caps at 0; the x axis is the trap axis
  const r0 = Math.sqrt(50), z0 = 5;
  const P = { grid: { sym: 'cyl', h: 0.2, x0: -16, x1: 16, y0: 0, y1: 16, bc: {} },
    electrodes: [el({ id: 'ring', shape: 'ring', axis: 'x', r0, rMax: 15, L: 20, V: 0, rf: { on: true, amp: 100, mhz: 1, phase: 0 } }),
      el({ id: 'capA', shape: 'endcap', axis: 'x', z0, rMax: 12, L: 8, side: 1, V: 0 }), el({ id: 'capB', shape: 'endcap', axis: 'x', z0, rMax: 12, L: 8, side: -1, V: 0 })],
    ions: [ion({ mass: 40, ke: 0.1, x: 0.5, y: 0.3, dirAz: 30 })], detectors: [], fly: { tMax: 60 } };
  const F = solved(P);
  const T = trapAnalysis(F, P, [0, 0, 0], { mass: 40, charge: 1 });
  const ax = T.axes[0], ay = T.axes[1];
  // the ring's own basis curvature: φ_xx = −4/100 /mm², φ_rr = +2/100: q = −2 (q/m) V φ_ii / Ω²
  const qm = QE / (40 * AMU), W = 2 * Math.PI * 1e6, qxWant = -2 * qm * 100 * (-0.04e6) / (W * W), qyWant = -2 * qm * 100 * (0.02e6) / (W * W);
  assert.ok(Math.abs(ax.q - qxWant) < 0.05 * Math.abs(qxWant), 'q along the axis ' + ax.q + ' vs ' + qxWant);
  assert.ok(Math.abs(ay.q - qyWant) < 0.05 * Math.abs(qyWant), 'q across ' + ay.q + ' vs ' + qyWant);
  assert.ok(ax.stable && ay.stable && ax.secMHz > 0.05 && ax.secMHz < 0.5, 'secular ' + ax.secMHz + ' MHz, stable');
  // held: the ion stays within a few mm for 60 µs (60 RF cycles)
  const R = flyAll(F, P), p = R.particles[0];
  assert.equal(p.end.why, 'time', 'held: ' + p.end.why);
  let far = 0; for (let i = 0; i < p.pts.length; i += 4) far = Math.max(far, Math.hypot(p.pts[i], p.pts[i + 1], p.pts[i + 2]));
  assert.ok(far < 4, 'stays near the centre: ' + far + ' mm');
  // the secular motion is at the predicted frequency: count the axial crossings
  let cross = 0; for (let i = 4; i < p.pts.length; i += 4) if ((p.pts[i] > 0) !== (p.pts[i - 4] > 0)) cross++;
  const fMeas = cross / 2 / (p.end.t - p.t0);
  assert.ok(Math.abs(fMeas - ax.secMHz) < 0.15 * ax.secMHz, 'axial crossings give ' + fMeas + ' MHz vs ' + ax.secMHz);
  // the RF too strong: q beyond 0.908 along the axis, the ion is lost
  P.electrodes[0].rf.amp = 100 * 1.3 / Math.abs(qxWant);
  const F2 = fieldSetOf(solvedArray(P), P), T2 = trapAnalysis(F2, P, [0, 0, 0], { mass: 40, charge: 1 });
  assert.ok(!T2.axes[0].stable);
  const p2 = flyAll(F2, P).particles[0];
  assert.notEqual(p2.end.why, 'time', 'lost: ' + p2.end.why);
});
function solvedArray(P) { const A = buildArray(P); solveArray(A); return A; }

test('a background gas slows ions: collisions happen and energy comes down', () => {
  const P = { grid: { sym: '3d', h: 1, x0: -30, x1: 30, y0: -30, y1: 30, z0: -30, z1: 30, bc: {} }, electrodes: [],
    ions: [ion({ n: 20, mass: 40, ke: 100, x: -25, dirAz: 0 })], detectors: [], gas: { on: true, mass: 4, pressure: 50, temp: 300, sigma: 30 }, fly: { tMax: 50, seed: 3 } };
  const F = solved(P), R = flyAll(F, P);
  const coll = R.particles.reduce((a, p) => a + (p.collisions || 0), 0), keEnd = R.particles.reduce((a, p) => a + p.end.ke, 0) / R.particles.length;
  assert.ok(coll > 20, 'collisions: ' + coll);
  assert.ok(keEnd < 95, 'mean energy at the end ' + keEnd + ' eV');
});

test('space charge flies the particles together and pushes them apart; a transparent grid shapes the field but is not in the way', () => {
  const P = { grid: { sym: '3d', h: 0.5, x0: -10, x1: 10, y0: -10, y1: 10, z0: -10, z1: 10, bc: {} }, electrodes: [],
    ions: [ion({ n: 2, ke: 0, dist: 'grid', size: 0.5, weight: 1e7 })], detectors: [], fly: { tMax: 1, spaceCharge: true } };
  const F = solved(P), R = flyAll(F, P);
  assert.equal(R.particles.length, 2, 'flown once together');
  const a = R.particles[0].end, b = R.particles[1].end;
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 3, 'pushed apart: ' + Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
  // a solid plate stops the ion; the same plate as a transparent grid lets it through, the field the same
  const Q = { grid: { sym: 'planar', h: 0.25, x0: -5, x1: 30, y0: -10, y1: 10, bc: { ylo: 'mirror', yhi: 'mirror' } },
    electrodes: [el({ id: 'a', shape: 'box', x: -4, y: 0, sx: 1, sy: 30, sz: 30, V: 100 }), el({ id: 'g', shape: 'box', x: 10, y: 0, sx: 0.5, sy: 30, sz: 30, V: 0 })],
    ions: [ion({ x: -3, ke: 1 })], detectors: [{ id: 'd', axis: 'x', at: 25, x: 25, y: 0, z: 0, half: 0, stop: true, on: true }], fly: { tMax: 100 } };
  const F1 = solved(Q), R1 = flyAll(F1, Q);
  assert.equal(R1.particles[0].end.why, 'splat');
  Q.electrodes[1].transparent = true;
  const F2 = solved(Q), R2 = flyAll(F2, Q);
  assert.equal(R2.particles[0].end.why, 'det');
  assert.ok(Math.abs(R2.particles[0].end.ke - R1.particles[0].end.ke) < 2, 'the same field either side of the grid: ' + R1.particles[0].end.ke + ' vs ' + R2.particles[0].end.ke);
});
