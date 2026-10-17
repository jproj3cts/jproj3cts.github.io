/* The small numerics the engines share (core/numeric.js, core/sag.js, core/special.js), against closed forms:
   a linear system solved exactly and a singular one refused; Cholesky agreeing with elimination; a seeded source
   repeating and spread evenly; the sag of a sphere and of a conic; and the series J_n agreeing with J0 and J1. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
const N = await import('../../src/core/numeric.js');
const SG = await import('../../src/core/sag.js');
const SP = await import('../../src/core/special.js');

test('a small linear system is solved exactly, a singular one refused, and Cholesky agrees with elimination', () => {
  const A = [[4, 1, 2], [1, 5, 3], [2, 3, 6]], b = [1, 2, 3];
  const x = N.solveLinear(A, b);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(A[i].reduce((s, v, j) => s + v * x[j], 0) - b[i]) < 1e-12);
  assert.equal(N.solveLinear([[1, 2], [2, 4]], [1, 2]), null);
  const y = N.solveCholesky(Float64Array.from(A.flat()), b, 3);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(x[i] - y[i]) < 1e-12);
  assert.equal(N.solveCholesky(Float64Array.from([1, 2, 2, 1]), [1, 1], 2), null, 'not positive definite');
});

test('a seeded source repeats, lies in [0, 1) and is spread evenly; its normals have unit variance', () => {
  const a = N.seededRng(42), b = N.seededRng(42), c = N.seededRng(43);
  const xs = Array.from({ length: 20000 }, () => a());
  assert.ok(xs.every((v, i) => v === b() && v >= 0 && v < 1));
  assert.notEqual(xs[0], c());
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  assert.ok(Math.abs(mean - 0.5) < 0.01, 'mean ' + mean);
  const r = N.seededRng(7), gs = Array.from({ length: 20000 }, () => N.randn(r)), v = gs.reduce((s, g) => s + g * g, 0) / gs.length;
  assert.ok(Math.abs(v - 1) < 0.05, 'variance ' + v);
});

test('the sag of a sphere, of a conic, with aspheric terms; NaN or the edge beyond the sphere’s own', () => {
  const R = 50, c = 1 / R;
  for (const r of [0, 5, 10, 20]) assert.ok(Math.abs(SG.sagR2(c, 0, 0, null, null, r * r, false) - (R - Math.sqrt(R * R - r * r))) < 1e-12);
  // a paraboloid (k = -1): r² / 2R exactly
  assert.ok(Math.abs(SG.sagR2(c, -1, 0, null, null, 400, false) - 400 / (2 * R)) < 1e-12);
  assert.ok(Math.abs(SG.sagR2(c, 0, 1e-3, [1e-6, 1e-9], [1e-2], 100, false) - (R - Math.sqrt(R * R - 100) + 1e-3 * 100 + 1e-6 * 1e4 + 1e-9 * 1e6 + 1e-2 * 10)) < 1e-12);
  assert.ok(Number.isNaN(SG.sagR2(c, 0, 0, null, null, 60 * 60, false)));
  assert.ok(Math.abs(SG.sagR2(c, 0, 0, null, null, 60 * 60, true) - c * 3600) < 1e-12, 'clamped to the edge');
  // in the plane of the fields: a cylinder curved out of it is flat there
  assert.equal(SG.sagInPlane({ R: 50, cyl: 'x', A: [1e-6] }, 10), 0);
  assert.ok(Math.abs(SG.sagInPlane({ R: 50 }, 10) - (R - Math.sqrt(R * R - 100))) < 1e-12);
});

test('the series J_n agrees with J0 and J1, and J_{-n} = (-1)^n J_n', () => {
  for (const x of [0, 0.5, 2.4048255577, 5, 11.9]) {
    const [j0, j1] = SP.besselJ01(x);
    assert.ok(Math.abs(SP.besselJn(0, x) - j0) < 1e-13 && Math.abs(SP.besselJn(1, x) - j1) < 1e-13, 'at ' + x);
    assert.ok(Math.abs(SP.besselJn(-2, x) - SP.besselJn(2, x)) < 1e-15 && Math.abs(SP.besselJn(-3, x) + SP.besselJn(3, x)) < 1e-15);
  }
  assert.ok(Math.abs(SP.besselJ01(2.4048255577)[0]) < 1e-9, 'the first zero of J0');
});
