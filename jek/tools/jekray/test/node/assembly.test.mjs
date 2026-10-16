/* Assemblies: lenses and stops on one axis read as one prescription and written back, and which
   parts can be one. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const { paraxial } = await import('../../src/engines/trace.js');
const A = await import('../../src/core/assembly.js');

// a Cooke triplet laid out along +x: lens, lens, stop, lens (a published prescription, f about 50 mm)
const lens = (id, x, R1, R2, t, glass, extra = {}) => ({ type: 'lens', id, name: id, x, y: 0, angle: 0, diameter: 20, surfaces: [{ R: R1 }, { R: R2 }], gaps: [t], materials: [{ glass }], group: 'g1', ...extra });
function triplet(extra) {
  // vertices: 0, 3.259 | 9.267, 10.267 | stop 15.017? (the stop at surface 4's place) | 15.017, 17.969
  loadProject({ format: 'jekray', version: 1, elements: [
    { type: 'source', id: 'src', name: 'src', x: -50, y: 0, angle: 0 },
    lens('L1', 1.6295, 22.014, -435.76, 3.259, 'N-SK16'),
    lens('L2', 9.767, -22.213, 20.292, 1.0, 'F2'),
    { type: 'stop', id: 'S', name: 'S', x: 12.767, y: 0, angle: 0, aperture: 9.6, group: 'g1' },
    lens('L3', 16.493, 79.684, -18.395, 2.952, 'N-SK16'),
    ...(extra || []),
  ], assemblies: [{ id: 'g1', name: 'Cooke triplet', ref: 'L1' }] });
  return ST.project.assemblies[0];
}
const clean = v => JSON.parse(JSON.stringify(v));

test('a triplet reads as one prescription: surfaces in order, the stop among them, the gaps between the parts', () => {
  const asm = triplet();
  assert.equal(asm.name, 'Cooke triplet');
  const P = A.asmPrescription(asm);
  assert.equal(P.surfaces.length, 7);
  assert.equal(P.stopIndex, 4);
  assert.deepEqual(P.surfaces.map(s => s.R), [22.014, -435.76, -22.213, 20.292, null, 79.684, -18.395]);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  // gaps: L1 glass, air to L2, L2 glass, air to the stop, air to L3, L3 glass
  const want = [3.259, 9.767 - 0.5 - (1.6295 + 1.6295), 1.0, 12.767 - (9.767 + 0.5), 16.493 - 1.476 - 12.767, 2.952];
  P.gaps.forEach((g, i) => assert.ok(near(g, want[i]), 'gap ' + i + ': ' + g + ' against ' + want[i]));
  assert.deepEqual(P.materials.map(m => m.glass), ['N-SK16', 'AIR', 'F2', 'AIR', 'AIR', 'N-SK16']);
  // its focal length is the same whether it is read as one prescription or traced as parts
  const f = A.asmParaxial(P, 587.56, paraxial).efl;
  assert.ok(f > 40 && f < 60, 'EFL ' + f);
});

test('written back unchanged, nothing moves; a gap changed moves the parts behind it, and a radius goes to its surface', () => {
  const asm = triplet(), before = clean(ST.project.elements);
  A.asmApply(asm, A.asmPrescription(asm));
  const after = clean(ST.project.elements);
  for (let i = 0; i < before.length; i++) for (const k of ['x', 'y']) assert.ok(Math.abs(before[i][k] - after[i][k]) < 1e-9, before[i].id + ' ' + k);
  after.forEach((e, i) => { e.x = before[i].x; e.y = before[i].y; });
  assert.deepEqual(after, before);
  const P = A.asmPrescription(asm);
  P.gaps[1] += 2; P.surfaces[2].R = -21;
  A.asmApply(asm, P);
  const by = id => ST.project.elements.find(e => e.id === id);
  assert.ok(Math.abs(by('L1').x - before[1].x) < 1e-9, 'the first part stays');
  for (const id of ['L2', 'S', 'L3']) assert.ok(Math.abs(by(id).x - before.find(e => e.id === id).x - 2) < 1e-9, id + ' moved 2 mm');
  assert.equal(by('L2').surfaces[0].R, -21);
});

test('a lens turned against the light is read face for face the other way round, and written back as it was', () => {
  const asm = triplet();
  const L3 = ST.project.elements.find(e => e.id === 'L3');
  L3.angle = 180; L3.surfaces = [{ R: 18.395, k: 0, a2: 0, A: [], semi: null }, { R: -79.684, k: 0, a2: 0, A: [], semi: null }];
  const P = A.asmPrescription(asm);
  assert.deepEqual(P.surfaces.slice(5).map(s => s.R), [79.684, -18.395]);
  const before = clean(L3);
  A.asmApply(asm, P);
  assert.deepEqual(clean(L3), before);
});

test('which parts can be one: lenses and round stops on one axis, upright and not overlapping', () => {
  triplet();
  const by = id => ST.project.elements.find(e => e.id === id), set = ['L1', 'L2', 'S', 'L3'].map(by);
  const ok = A.asmCheck(set, { sources: [by('src')] });
  assert.ok(ok.ok, ok.why);
  assert.equal(ok.rev, false);
  assert.deepEqual(ok.order, ['L1', 'L2', 'S', 'L3']);
  assert.match(A.asmCheck([...set, by('src')]).why, /only lenses, stops and windows/);
  by('L2').y = 0.5;
  assert.match(A.asmCheck(set).why, /off the axis/);
  by('L2').y = 0; by('L2').cyl = 'plane';
  assert.match(A.asmCheck(set).why, /cylindrical/);
  delete by('L2').cyl; by('L3').x = 10;
  assert.match(A.asmCheck(set).why, /overlaps/);
  by('L3').x = 16.493; by('S').angle = 90;
  assert.match(A.asmCheck(set).why, /faces another way/);
});

test('the light runs away from a source on the axis; a record whose parts are gone is dropped', () => {
  triplet([{ type: 'source', id: 'back', name: 'back', x: 200, y: 0, angle: 180 }]);
  const by = id => ST.project.elements.find(e => e.id === id), set = ['L1', 'L2', 'S', 'L3'].map(by);
  assert.equal(A.asmCheck(set, { sources: [by('back')] }).rev, true);
  assert.deepEqual(A.asmCheck(set, { sources: [by('back')] }).order, ['L3', 'S', 'L2', 'L1']);
  const kept = A.normAssemblies([{ id: 'g1', name: 'x' }, { id: 'gone', name: 'y' }], ST.project.elements);
  assert.deepEqual(kept.map(a => a.id), ['g1']);
  assert.equal(kept[0].ref, 'L1');
  assert.deepEqual(kept[0].cond, A.normCond({}));
});
