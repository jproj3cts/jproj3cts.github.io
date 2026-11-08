/* The tracer against closed forms: energy gained across a gap, the cyclotron orbit, the time of flight, a Paul
   trap's Mathieu parameters from its hyperbolic electrodes, and ions held or lost by it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildArray, solveArray, fieldSetOf } from '../../src/engines/session.js';
import { flyAll } from '../../src/engines/fly.js';
import { trapAnalysis } from '../../src/engines/trap.js';
import { potentialAt } from '../../src/engines/fields.js';
import { speedOfKE, properSpeedOfKE, keOfProper, QE, AMU } from '../../src/core/units.js';
import { makeGrid, gGrad, gNodePos } from '../../src/core/grid.js';

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

test('the trap analysis takes its axes from the field: a quadrupole on the diagonals reads the same as one on the axes', () => {
  const rods = (turn, amp) => { const a = 8 / Math.SQRT2, pos = turn ? [[a, a], [-a, -a], [a, -a], [-a, a]] : [[8, 0], [-8, 0], [0, 8], [0, -8]];
    return pos.map(([x, y], k) => el({ id: 'r' + k, shape: 'rod', axis: 'z', x, y, r: 3, L: 40, V: 0, rf: { on: true, amp, mhz: 1, phase: k < 2 ? 0 : 180 } })); };
  const P = turn => ({ grid: { sym: 'planar', h: 0.25, x0: -16, x1: 16, y0: -16, y1: 16, bc: { xlo: 'ground', xhi: 'ground', ylo: 'ground', yhi: 'ground' } }, electrodes: rods(turn, 50), ions: [], detectors: [] });
  const A = trapAnalysis(solved(P(false)), P(false), [0, 0, 0], { mass: 100, charge: 1 }), B = trapAnalysis(solved(P(true)), P(true), [0, 0, 0], { mass: 100, charge: 1 });
  assert.equal(A.axes.length, 2); assert.equal(B.axes.length, 2);
  const qA = A.axes.map(x => Math.abs(x.q)).sort(), qB = B.axes.map(x => Math.abs(x.q)).sort();
  assert.ok(qA[1] > 0.1 && Math.abs(qA[0] - qA[1]) < 0.03 * qA[1], 'on the axes: ' + qA);
  assert.ok(Math.abs(qB[1] - qA[1]) < 0.03 * qA[1], 'turned 45°, the same q: ' + qB + ' vs ' + qA);
  assert.ok(B.axes.every(x => /^\(/.test(x.axis)), 'the turned axes are named by direction: ' + B.axes.map(x => x.axis));
  assert.ok(A.axes.every(x => x.axis === 'x' || x.axis === 'y'), 'the aligned ones by name: ' + A.axes.map(x => x.axis));
});

test('the field between the nodes is continuous and exact for a quadratic potential: a quadrupole\'s null is a null', () => {
  // a quadrupole potential sampled on the nodes: the field is its exact gradient anywhere inside, including at a node
  const g = makeGrid({ sym: '3d', h: 0.25, x0: -2, x1: 2, y0: -2, y1: 2, z0: -2, z1: 2 }), A = new Float64Array(g.n);
  const phi = (x, y, z) => 100 * (x * x - y * y) + 7 * (x + 2 * y - z) + 3;
  for (let o = 0; o < g.n; o++) { const [x, y, z] = gNodePos(g, o); A[o] = phi(x, y, z); }
  const E = [0, 0, 0];
  for (const [x, y, z] of [[0, 0, 0], [0.1, -0.2, 0.3], [0.5, 0.5, 0], [0.37, 1.12, -0.81], [-1.5, 0.25, 1]]) {
    assert.ok(gGrad(g, A, x, y, z, E));
    const ex = [200 * x + 7, -200 * y + 14, -7];
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(E[i] - ex[i]) < 1e-9, 'at ' + [x, y, z] + ': ' + E + ' vs ' + ex);
  }
  // the null of the quadrupole part alone is a null, and the field is continuous across a cell face
  for (let o = 0; o < g.n; o++) { const [x, y] = gNodePos(g, o); A[o] = 100 * (x * x - y * y); }
  gGrad(g, A, 0, 0, 0, E); assert.ok(Math.hypot(...E) < 1e-9, 'the null: ' + E);
  const a = [0, 0, 0], b = [0, 0, 0]; gGrad(g, A, 0.25 - 1e-9, 0.1, 0.1, a); gGrad(g, A, 0.25 + 1e-9, 0.1, 0.1, b);
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6, 'across a face: ' + a + ' vs ' + b);
});

test('a heavy particle at thermal energy moves: the speed is taken in KE / mc², not from γ rounded to 1', () => {
  // a 300 nm silica sphere, 1.87e10 u, at 0.026 eV: 16 mm/s, and the energy comes back from the proper speed
  const m = 1.873e10, ke = 0.026, u = properSpeedOfKE(ke, m), v = speedOfKE(ke, m);
  const want = Math.sqrt(2 * ke * QE / (m * AMU)) * 1e-3;    // mm/µs, non-relativistic
  assert.ok(u > 0 && Math.abs(u - want) < 1e-9 * want, 'proper speed ' + u + ' vs ' + want);
  assert.ok(Math.abs(v - want) < 1e-9 * want, 'speed ' + v + ' vs ' + want);
  assert.ok(Math.abs(keOfProper(u, m) - ke) < 1e-9 * ke, 'energy back: ' + keOfProper(u, m));
  // and the relativistic end is unchanged: an electron at 100 keV moves at 0.548 c
  const ve = speedOfKE(1e5, 5.48579909065e-4) / 299792.458;
  assert.ok(Math.abs(ve - 0.5482) < 5e-4, 'electron: ' + ve);
});
