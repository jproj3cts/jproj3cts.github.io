/* What a lens or window is made to (core/part-make.js) and how its drawing says it: only what is set is kept, so a part
   saved before has none; a value not set follows the tolerance settings, else the commercial grade; the drawing takes
   the part's own values over the tolerance settings', a fine-ground face has no form or surface quality, and a JEKfilm
   coating on a face is built into the same specification pages JEKfilm writes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { PART_MAKE_DEFAULT, normPartMake, partMakeOf, sdValid } = await import('../../src/core/part-make.js');
const { drawingData } = await import('../../src/engines/lens-drawing.js');
const { PARTS } = await import('../../src/parts/registry.js');

const surf = (R, semi) => ({ R, k: 0, a2: 0, A: [], odd: null, semi });
const lensP = (R1, R2, t, glass, semi) => ({ surfaces: [surf(R1, semi), surf(R2, semi)], gaps: [t], materials: [{ glass }], stopIndex: -1, parts: [{ id: 'L', kind: 'lens', flip: false, n: 2 }] });

test('make settings: only what is set is kept, clamped; nothing set is no field at all', () => {
  assert.equal(normPartMake(undefined, 2), undefined);
  assert.equal(normPartMake({}, 2), undefined);
  assert.equal(normPartMake({ faces: [{}, {}] }, 2), undefined);
  assert.deepEqual(normPartMake({ qty: 24.6, diaTol: -1, faces: [{ sd: ' 10-5 ', finish: 'ground', chamfer: 99 }, { sd: '60/40', finish: 'shiny' }] }, 2),
    { qty: 25, diaTol: 0, faces: [{ sd: '10-5', finish: 'ground', chamfer: 10 }, {}] });
  assert.ok(sdValid('60-40') && sdValid('10-5') && !sdValid('60/40') && !sdValid('a-b'));
});

test('a value not set follows the tolerance settings, else the commercial grade; the part’s own wins', () => {
  const T = { thk: { on: true, v: 0.05 }, rad: { on: true, v: 2 }, irr: { on: false, v: 0.5 }, tilt: { on: true, v: 1 } };
  const M = partMakeOf({ qty: 3, faces: [{ form: 1 }] }, 2, T);
  assert.equal(M.qty, 3); assert.equal(M.from.qty, 'set');
  assert.equal(M.ctTol, 0.05); assert.equal(M.from.ctTol, 'tol');
  assert.equal(M.diaTol, PART_MAKE_DEFAULT.diaTol); assert.equal(M.from.diaTol, 'default');
  assert.equal(M.faces[0].form, 1); assert.equal(M.faces[0].from.form, 'set');
  assert.equal(M.faces[1].form, 2); assert.equal(M.faces[1].from.form, 'tol');
  assert.equal(M.faces[1].irr, PART_MAKE_DEFAULT.irr, 'irregularity off in the tolerance settings: the commercial grade');
  assert.equal(M.cent, 1); assert.equal(M.from.cent, 'tol');
});

test('the drawing: the part’s tolerances in place of the settings’, a ground face with no form or scratch-dig, the diameter’s tolerance', () => {
  const make = partMakeOf({ ctTol: 0.02, cent: 2, diaTol: 0.05, faces: [{ sd: '10-5', chamfer: 0.3 }, { finish: 'ground' }] }, 2, { thk: { on: true, v: 0.1 }, rad: { on: true, v: 3 } });
  const D = drawingData(lensP(null, null, 2, 'Fused silica', 6), 0, { name: 'BS', dia: 12.7, T: { thk: { on: true, v: 0.1 }, rad: { on: true, v: 3 } }, make, coats: ['Splitter 50:50', ''] });
  assert.equal(D.elements[0].ctTol, 0.02, 'the part’s thickness tolerance, not the settings’');
  assert.equal(D.diaTol, 0.05); assert.ok(D.made && D.toleranced);
  assert.deepEqual(D.surfaces.map(s => [s.finish, s.form, s.sd, s.chamfer, s.centring]), [['polished', 3, '10-5', 0.3, 2], ['ground', undefined, null, PART_MAKE_DEFAULT.chamfer, 2]]);
  assert.equal(D.surfaces[0].coat, 'Splitter 50:50');
  // with no make settings the drawing is as it was
  const D0 = drawingData(lensP(null, null, 2, 'Fused silica', 6), 0, { dia: 12.7 });
  assert.ok(!D0.made && D0.surfaces.every(s => s.finish === undefined && s.sd === undefined));
});

test('a lens and a window keep their make settings; one saved without them loads as it was', () => {
  const lens = PARTS.lens.norm({ surfaces: [{ R: 20 }, { R: null }], gaps: [3], materials: [{ glass: 'N-BK7' }], make: { qty: 5, faces: [{}, { finish: 'ground' }] } }, {});
  assert.deepEqual(lens.make, { qty: 5, faces: [{}, { finish: 'ground' }] });
  assert.equal(PARTS.lens.norm({ surfaces: [{ R: 20 }, { R: null }], gaps: [3], materials: [{ glass: 'N-BK7' }] }, {}).make, undefined);
  assert.deepEqual(PARTS.prism.norm({ shape: 'window', make: { faces: [{ sd: '20-10' }] } }, {}).make, { faces: [{ sd: '20-10' }, {}] });
  assert.equal(PARTS.prism.norm({ shape: 'right', make: { qty: 2 } }, {}).make, undefined, 'only a window');
});
