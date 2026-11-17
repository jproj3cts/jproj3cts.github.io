/* An arrival's field on a face (engines/fibre-face.js arrivalField) is sampled at thousands of points by an overlap (a
   receiving horn's, a fibre's, a detector's): what is the same at every point is worked out once an arrival, and the
   Hermite polynomials of every mode at a point in one pass. Both must give the field exactly as before: the polynomials
   by the same recurrence as core/pulses.js hermite, to the last digit, and an arrival changed in place worked out again. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engine } from '../../headless.mjs';
await engine();
const FF = await import('../../src/engines/fibre-face.js');
const { hermite } = await import('../../src/core/pulses.js');

test('the Hermite polynomials in one pass are each the same as on their own, to the last digit', () => {
  const T = { a: new Float64Array(2) };
  for (const u of [0, 1e-9, -0.3, 0.7071067811865476, 1.5, -2.25, 4.9, 12.5]) {
    for (const n of [0, 1, 2, 5, 13, 30]) {
      const H = FF.hermites(T, n, u);
      for (let k = 0; k <= n; k++) assert.ok(Object.is(H[k], hermite(k, u)), 'H_' + k + '(' + u + '): ' + H[k] + ' against ' + hermite(k, u));
    }
  }
});

test('an arrival’s field at a point is the same whether its constants are kept or worked out afresh; one changed in place is worked out again', () => {
  const mk = () => ({ u0: 0.1, v0: -0.05, ldx: 0.96, ldy: 0.28, vs: 0.05, lam0: 1.55e-3, opl: 12.5, qx: [-3.2, 4.1], qy: [1.7, 3.9], J: [0.8, 0.1, 0.3, -0.2],
    comps: [[0, 0, 0.9, 0.1], [1, 0, 0.2, -0.1], [0, 2, 0.05, 0.02], [3, 1, 0.01, 0.0]] });
  const pts = []; for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) pts.push([0.1 + 0.37 * i, -0.05 + 0.29 * j]);
  const A = mk();
  const first = pts.map(([u, v]) => FF.arrivalField(A, u, v)), again = pts.map(([u, v]) => FF.arrivalField(A, u, v)), fresh = pts.map(([u, v]) => FF.arrivalField(mk(), u, v));
  assert.deepEqual(again, first); assert.deepEqual(fresh, first);
  // its q changed in place (and its slope): the field follows, as a new arrival's would
  A.qx[1] = 5.3; A.ldx = 0.9;
  const B = Object.assign(mk(), { qx: [-3.2, 5.3], ldx: 0.9 });
  assert.deepEqual(pts.map(([u, v]) => FF.arrivalField(A, u, v)), pts.map(([u, v]) => FF.arrivalField(B, u, v)));
  assert.notDeepEqual(pts.map(([u, v]) => FF.arrivalField(A, u, v)), first);
  // a plain Gaussian (no modes)
  const G = Object.assign(mk(), { comps: undefined }), G2 = Object.assign(mk(), { comps: undefined });
  assert.deepEqual(pts.map(([u, v]) => FF.arrivalField(G, u, v)), pts.map(([u, v]) => FF.arrivalField(G2, u, v)));
});
