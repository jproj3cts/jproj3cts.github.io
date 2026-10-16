/* Cylindrical lenses in an assembly: a cylinder curved in the plane of the fields has a round lens's
   focal length in it, and one curved out of the plane none; two crossed cylinders whose line foci
   meet (the weaker in front by the difference of their focal lengths) bring a beam to a point, where
   either alone leaves a line. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const E = await import('../../src/engines/lens-engine.js');
const D = await import('../../src/engines/lens-design.js');
const AN = await import('../../src/engines/lens-analysis.js');

const lens = (id, x, cyl, R) => Object.assign({ type: 'lens', id, name: id, x, y: 0, angle: 0, diameter: 25, surfaces: [{ R }, { R: null }], gaps: [3], materials: [{ glass: 'N-BK7' }], group: 'g' }, cyl ? { cyl } : {});
const load = els => {
  loadProject({ format: 'jekray', version: 1, elements: els,
    assemblies: [{ id: 'g', name: 'C', ref: els[0].id, cond: { aperture: { kind: 'epd', v: 4 }, fields: [{ deg: 0 }], waves: [{ nm: 587.56 }] }, design: { solves: { 't:image': { kind: 'focus' } } } }] });
  const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a)); return a;
};
const efl = a => E.lensSystem(D.designPrescription(a), 587.56).par.efl;
const spot = a => { const P = D.designPrescription(a); return AN.spotDiagram(AN.anaSystems(a, P), 0, 15).rms; };

test('a cylinder curved in the plane has a round lens’s focal length there; one curved out of it, none', () => {
  const round = efl(load([lens('L', 0, null, 51.5)]));
  const inPlane = load([lens('L', 0, 'plane', 51.5)]);
  assert.deepEqual(D.designPrescription(inPlane).surfaces.map(s => s.cyl || '-'), ['y', 'y']);
  assert.ok(Math.abs(efl(inPlane) - round) < 1e-9, efl(inPlane) + ' against ' + round);
  const out = load([lens('L', 0, 'out', 51.5)]);
  assert.deepEqual(D.designPrescription(out).surfaces.map(s => s.cyl || '-'), ['x', 'x']);
  assert.ok(!isFinite(efl(out)));
});

test('two crossed cylinders whose line foci meet bring a beam to a point; either alone leaves a line', () => {
  // f about 100 (out of the plane) and 50 (in it): the weaker 50 mm in front
  const f1 = efl(load([lens('A', 0, null, 51.6)])), f2 = efl(load([lens('B', 0, null, 25.8)]));
  // (each measured while it is the bench loaded)
  const pair = load([lens('A', 0, 'out', 51.6), lens('B', f1 - f2, 'plane', 25.8)]), sp = spot(pair), fp = efl(pair);
  const line = spot(load([lens('A', 0, null, 1e9), lens('B', f1 - f2, 'plane', 25.8)]));
  assert.ok(Math.abs(fp - f2) < 0.2, 'in the plane its focal length is the second’s: ' + fp);
  assert.ok(line > 0.3 && sp < line / 20, 'crossed ' + sp + ', one alone ' + line);
});
