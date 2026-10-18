/* Surface wedge in tolerancing: a lens surface tilted alone about its own vertex. A plano-convex lens with
   its flat back wedged by α is the lens and a thin prism: the image of a point on the axis moves by
   (n − 1) α times the back focal length, across the plane of the tilt; the tolerances listed only when
   turned on, two to a lens surface. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const E = await import('../../src/engines/lens-engine.js');
const T = await import('../../src/engines/lens-tol.js');
const { normTol } = await import('../../src/core/assembly.js');
const { refIndex } = await import('../../src/core/glass.js');

const P0 = { surfaces: [{ R: 51.5, semi: 12.7, k: 0, a2: 0, A: [] }, { R: null, semi: 12.7, k: 0, a2: 0, A: [] }], gaps: [5], materials: [{ glass: 'N-BK7' }], stopIndex: 0,
  parts: [{ id: 'L', kind: 'lens', n: 2 }] };

test('a wedged flat face moves the image by (n − 1) α BFL, across the plane of its tilt', () => {
  const nm = 587.56, n = refIndex({ glass: 'N-BK7' }, nm), S0 = E.lensSystem(P0, nm, { epd: 4 }), bfl = S0.par.bfl;
  const ops = T.tolOps(P0, normTol({ wedge: { on: true, v: 1 }, rad: { on: false }, thk: { on: false }, dec: { on: false }, tilt: { on: false }, ind: { on: false }, abbe: { on: false } }));
  assert.deepEqual(ops.map(o => o.kind + o.i + o.axis), ['wedge0x', 'wedge0y', 'wedge1x', 'wedge1y']);
  const alpha = 2 / 60 * Math.PI / 180;
  for (const [k, ax] of [[2, 'x'], [3, 'y']]) {
    const vals = ops.map((_, j) => j === k ? 2 : 0), S = E.lensSystem(T.perturb(P0, ops, vals), nm, { epd: 4, image: bfl });
    const C = E.rayAt(S, 0, 0, 0), want = (n - 1) * alpha * bfl;
    const along = ax === 'x' ? Math.abs(C[1]) : Math.abs(C[0]), across = ax === 'x' ? Math.abs(C[0]) : Math.abs(C[1]);
    assert.ok(Math.abs(along - want) < 0.01 * want, ax + ': ' + along + ' against ' + want);
    assert.ok(across < 1e-9);
  }
});

test('surface wedge is off until turned on', () => {
  assert.equal(normTol({}).wedge.on, false);
  assert.ok(!T.tolOps(P0, normTol({})).some(o => o.kind === 'wedge'));
});
