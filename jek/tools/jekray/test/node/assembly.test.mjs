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
  assert.match(A.asmCheck([...set, by('src')]).why, /only lenses, mirrors, stops and windows/);
  // a lens a little off the axis is decentred; past its half-width it is off it
  by('L2').y = 0.5;
  assert.ok(A.asmCheck(set).ok);
  by('L2').y = 15;
  assert.match(A.asmCheck(set).why, /off the axis/);
  // a cylindrical lens may be one of them, as its Shape sets it; not one rolled about its axis
  by('L2').y = 0; by('L2').cyl = 'plane';
  assert.equal(A.asmCheck(set).ok, true);
  by('L2').roll = 30;
  assert.match(A.asmCheck(set).why, /cylindrical/);
  delete by('L2').cyl; delete by('L2').roll; by('L3').x = 10;
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

test('a fold: lens, mirror at 45°, lens read as one prescription along the folded axis, written back as it was, and as the straight system it unfolds to', async () => {
  const L = (id, x, y, ang, R1, R2) => ({ type: 'lens', id, name: id, x, y, angle: ang, diameter: 20, surfaces: [{ R: R1 }, { R: R2 }], gaps: [4], materials: [{ glass: 'N-BK7' }], group: 'g' });
  loadProject({ format: 'jekray', version: 1, elements: [L('L1', 0, 0, 0, 60, -60), { type: 'mirror', id: 'M', name: 'M', x: 30, y: 0, angle: 135, length: 30, group: 'g' }, L('L2', 30, 40, 90, 80, null)],
    assemblies: [{ id: 'g', name: 'Fold', ref: 'L1' }] });
  const asm = ST.project.assemblies[0], els = ST.project.elements, before = clean(els);
  const C = A.asmCheck(els, { ref: 'L1', rev: false });
  assert.ok(C.ok && C.folded, C.why);
  assert.deepEqual(C.order, ['L1', 'M', 'L2']);
  const P = A.asmPrescription(asm);
  assert.deepEqual(P.parts.map(p => p.kind), ['lens', 'mirror', 'lens']);
  // L1's back vertex at 2, the mirror at 30, L2's front vertex 38 on: gaps 28 and 38
  assert.ok(Math.abs(P.gaps[1] - 28) < 1e-9 && Math.abs(P.gaps[2] - 38) < 1e-9, JSON.stringify(P.gaps));
  assert.ok(P.surfaces[2].mirror && Math.abs(Math.abs(P.surfaces[2].tilt[0]) - Math.PI / 4) < 1e-12);
  A.asmApply(asm, P);
  clean(els).forEach((e, i) => { for (const k of ['x', 'y', 'angle']) assert.ok(Math.abs(e[k] - before[i][k]) < 1e-9, e.id + ' ' + k + ' ' + e[k] + ' / ' + before[i][k]); });
  // a gap after the fold moves L2 up the bench; one before it moves the mirror and L2 along it
  const P2 = A.asmPrescription(asm); P2.gaps[2] += 5; A.asmApply(asm, P2);
  assert.ok(Math.abs(els[2].y - 45) < 1e-9 && Math.abs(els[2].x - 30) < 1e-9);
  const P3 = A.asmPrescription(asm); P3.gaps[1] += 3; A.asmApply(asm, P3);
  assert.ok(Math.abs(els[1].x - 33) < 1e-9 && Math.abs(els[2].x - 33) < 1e-9 && Math.abs(els[2].y - 45) < 1e-9 && Math.abs(els[1].angle - 135) < 1e-9);
  // the same as the straight system it unfolds to
  const E = await import('../../src/engines/lens-engine.js');
  const Pf = A.asmPrescription(asm), Sf = E.lensSystem(Pf, 587.56, { epd: 8 });
  loadProject({ format: 'jekray', version: 1, elements: [L('L1', 0, 0, 0, 60, -60), L('L2', 78, 0, 0, 80, null)], assemblies: [{ id: 'g', name: 'Straight', ref: 'L1' }] });
  const Ss = E.lensSystem(A.asmPrescription(ST.project.assemblies[0]), 587.56, { epd: 8 });
  assert.ok(Math.abs(Sf.par.efl - Ss.par.efl) < 1e-9, Sf.par.efl + ' / ' + Ss.par.efl);
  const a = E.spotOf(Sf, 2, E.pupilRings(3, 6)), b = E.spotOf(Ss, 2, E.pupilRings(3, 6));
  assert.ok(Math.abs(a.rms - b.rms) < 1e-12 && Math.abs(a.wfeRms - b.wfeRms) < 1e-8, a.rms + ' / ' + b.rms);
});

test('a lens tilted and decentred from the axis: read with its tilt and decentre, and written back as it was', () => {
  const asm = triplet(), by = id => ST.project.elements.find(e => e.id === id);
  // L2 turned 3° and moved 0.4 mm across
  const c = Math.cos(3 * Math.PI / 180), s = Math.sin(3 * Math.PI / 180);
  by('L2').angle = 3; by('L2').y = 0.4;
  const C = A.asmCheck(A.asmMembers(asm), { ref: 'L1', rev: false });
  assert.ok(C.ok, C.why);
  const P = A.asmPrescription(asm);
  assert.ok(Math.abs(P.surfaces[2].tilt[0] - 3 * Math.PI / 180) < 1e-12, JSON.stringify(P.surfaces[2]));
  // its first vertex half its thickness back along its own axis: 0.4 - 0.5 sin 3° across
  assert.ok(Math.abs(P.surfaces[2].dec[1] - (0.4 - 0.5 * s)) < 1e-12 && Math.abs(P.surfaces[3].dec[1] - (0.4 - 0.5 * s + 1.0 * s)) < 1e-12 && Math.abs(P.surfaces[3].dec[2] - (c - 1)) < 1e-12);
  const before = clean(ST.project.elements);
  A.asmApply(asm, P);
  clean(ST.project.elements).forEach((e, i) => { for (const k of ['x', 'y', 'angle']) if (e[k] !== undefined) assert.ok(Math.abs(e[k] - before[i][k]) < 1e-9, e.id + ' ' + k); });
});
