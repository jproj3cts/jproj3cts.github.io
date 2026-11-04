/* The Laplace solver against closed forms: parallel plates (planar), coaxial cylinders (cylindrical), concentric
   spheres (3D), and the boundary conditions. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGrid, gIdx, gInterp } from '../../src/core/grid.js';
import { newMask, paintShape, paintMesh } from '../../src/core/voxel.js';
import { buildLevels, solveLevels, setElectrodeValues, checkResidual } from '../../src/engines/solve.js';
import { shapeTriangles } from '../../src/core/geom.js';

const solveMask = (g, mask, k) => { const L = buildLevels(g, mask); setElectrodeValues(L, mask, k); const S = solveLevels(L); return { S, L }; };

test('parallel plates: the potential is linear between them', () => {
  const g = makeGrid({ sym: 'planar', h: 0.5, x0: 0, x1: 20, y0: 0, y1: 10, bc: { ylo: 'mirror', yhi: 'mirror' } });
  const mask = newMask(g);
  paintShape(g, mask, { shape: 'box', x: 0.25, y: 5, z: 0, sx: 0.5, sy: 20, sz: 20 }, 0);
  paintShape(g, mask, { shape: 'box', x: 19.75, y: 5, z: 0, sx: 0.5, sy: 20, sz: 20 }, 1);
  const { S, L } = solveMask(g, mask, 0);
  assert.ok(S.converged, 'converged in ' + S.cycles + ' cycles, residual ' + S.residual);
  for (const x of [2, 5, 10, 15, 18]) { const v = gInterp(g, S.phi, x, 5, 0); assert.ok(Math.abs(v - (19.5 - x) / 19) < 2e-4, 'at x=' + x + ': ' + v); }
  assert.ok(checkResidual(L, S.phi) < 1e-5);
  assert.ok(S.cycles < 25, 'multigrid converges in a few cycles: ' + S.cycles);
});

test('coaxial cylinders: the potential goes as the logarithm of the radius', () => {
  // the x axis is the axis; a rod of radius 2 inside a tube of inner radius 8, both long, the ends mirrors
  const g = makeGrid({ sym: 'cyl', h: 0.1, x0: 0, x1: 4, y0: 0, y1: 9, bc: { xlo: 'mirror', xhi: 'mirror' } });
  const mask = newMask(g);
  paintShape(g, mask, { shape: 'rod', axis: 'x', x: 2, y: 0, z: 0, r: 2, L: 100 }, 0);
  paintShape(g, mask, { shape: 'tube', axis: 'x', x: 2, y: 0, z: 0, rIn: 8, rOut: 9, L: 100 }, 1);
  const { S } = solveMask(g, mask, 0);
  assert.ok(S.converged, 'residual ' + S.residual);
  for (const r of [3, 4, 5, 6, 7]) { const v = gInterp(g, S.phi, 2, r, 0), want = Math.log(8 / r) / Math.log(4); assert.ok(Math.abs(v - want) < 3e-3, 'at r=' + r + ': ' + v + ' vs ' + want); }
  // the radius is radial: the same off the plane
  assert.ok(Math.abs(gInterp(g, S.phi, 2, 3, 4) - Math.log(8 / 5) / Math.log(4)) < 3e-3);
});

test('concentric spheres in 3D: the potential goes as 1/r', () => {
  const g = makeGrid({ sym: '3d', h: 0.25, x0: -9, x1: 9, y0: -9, y1: 9, z0: -9, z1: 9, bc: {} });
  const mask = newMask(g);
  // the outer sphere as a shell: everything beyond radius 8, less the sphere of radius 8 itself
  const inner = newMask(g);
  paintShape(g, inner, { shape: 'sphere', axis: 'z', x: 0, y: 0, z: 0, r: 8 }, 0);
  paintShape(g, mask, { shape: 'sphere', axis: 'z', x: 0, y: 0, z: 0, r: 20 }, 1);
  for (let o = 0; o < g.n; o++) if (inner[o] === 0 && mask[o] === 1) mask[o] = -1;
  paintShape(g, mask, { shape: 'sphere', axis: 'z', x: 0, y: 0, z: 0, r: 3 }, 0);
  const t0 = Date.now(), { S } = solveMask(g, mask, 0), ms = Date.now() - t0;
  assert.ok(S.converged, 'residual ' + S.residual + ' after ' + S.cycles);
  console.log('    3D solve of ' + g.n + ' nodes: ' + ms + ' ms, ' + S.cycles + ' cycles');
  const want = r => (1 / r - 1 / 8) / (1 / 3 - 1 / 8);
  for (const [x, y, z] of [[4.5, 0, 0], [0, 5.5, 0], [0, 0, 6.5], [3, 3, 3]]) { const r = Math.hypot(x, y, z), v = gInterp(g, S.phi, x, y, z); assert.ok(Math.abs(v - want(r)) < 0.06 * want(r), 'at r=' + r.toFixed(2) + ': ' + v + ' vs ' + want(r)); }
});

test('a grounded boundary holds 0 V; an open one lets the potential run flat', () => {
  const g1 = makeGrid({ sym: 'planar', h: 0.5, x0: 0, x1: 10, y0: 0, y1: 10, bc: { xlo: 'ground', xhi: 'ground', ylo: 'ground', yhi: 'ground' } });
  const m1 = newMask(g1); paintShape(g1, m1, { shape: 'box', x: 5, y: 5, z: 0, sx: 2, sy: 2, sz: 2 }, 0);
  const S1 = solveMask(g1, m1, 0).S;
  assert.ok(S1.converged);
  assert.ok(gInterp(g1, S1.phi, 0, 5, 0) < 0.25 && gInterp(g1, S1.phi, 0, 5, 0) > 0, 'near the grounded edge the potential is low');
  const g2 = makeGrid({ sym: 'planar', h: 0.5, x0: 0, x1: 10, y0: 0, y1: 10, bc: { xlo: 'open', xhi: 'open', ylo: 'open', yhi: 'open' } });
  const m2 = newMask(g2); paintShape(g2, m2, { shape: 'box', x: 5, y: 5, z: 0, sx: 2, sy: 2, sz: 2 }, 0);
  const S2 = solveMask(g2, m2, 0).S;
  // the only electrode, all boundaries open: the whole array floats at 1 V
  assert.ok(Math.abs(gInterp(g2, S2.phi, 0, 5, 0) - 1) < 1e-4, 'open all round, one electrode: ' + gInterp(g2, S2.phi, 0, 5, 0));
});

test('a CAD body is painted from its triangles as its shape is', () => {
  const g = makeGrid({ sym: '3d', h: 0.5, x0: -6, x1: 6, y0: -6, y1: 6, z0: -6, z1: 6, bc: {} });
  const el = { shape: 'tube', axis: 'z', x: 0.3, y: -0.2, z: 0.1, rIn: 2, rOut: 4, L: 5 };
  const a = newMask(g); paintShape(g, a, el, 0);
  const T3 = shapeTriangles(el), T = new Float32Array(T3.idx.length * 3);
  for (let i = 0; i < T3.idx.length; i++) for (let k = 0; k < 3; k++) T[3 * i + k] = T3.pos[3 * T3.idx[i] + k] - [el.x, el.y, el.z][k];
  const b = newMask(g); const n = paintMesh(g, b, T, [el.x, el.y, el.z], 0);
  let same = 0, diff = 0;
  for (let o = 0; o < g.n; o++) { if (a[o] === b[o]) same++; else diff++; }
  assert.ok(n > 100 && diff < 0.03 * same, 'nodes differ: ' + diff + ' of ' + same);
});
