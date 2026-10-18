/* A mirror's aspheric terms: carried into the prescription with the sign its radius takes there and
   written back the same; a concave sphere at f/2.5 made aspheric by the optimiser images a star as
   a paraboloid does, its terms those of the paraboloid's sag less the sphere's (−1/(8R³) r⁴ …). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const A = await import('../../src/core/assembly.js');
const D = await import('../../src/engines/lens-design.js');
const O = await import('../../src/engines/lens-opt.js');
const AN = await import('../../src/engines/lens-analysis.js');

const load = (mirror, design) => {
  loadProject({ format: 'jekray', version: 1, elements: [Object.assign({ type: 'mirror', id: 'M', name: 'M', x: 0, y: 0, angle: 180, length: 40, R: 200, group: 'g' }, mirror)],
    assemblies: [{ id: 'g', name: 'T', ref: 'M', cond: { aperture: { kind: 'epd', v: 40 }, fields: [{ deg: 0 }], waves: [{ nm: 587.56 }] }, design: Object.assign({ solves: { 't:image': { kind: 'focus' } } }, design) }] });
  const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a)); return a;
};

test('a mirror’s aspheric terms: in the prescription with its radius’s sign, and written back the same', () => {
  const a = load({ A: [2e-7, -3e-11] }), P = D.designPrescription(a);
  assert.equal(P.surfaces[0].R, -200);
  assert.deepEqual(P.surfaces[0].A, [-2e-7, 3e-11]);
  assert.ok(D.editable(P, 'a4', 0) && D.editable(P, 'k', 0));
  D.setV(P, D.posOf(P, 'a6:M.0'), 5e-11);
  D.commitDesign(a, P);
  assert.deepEqual(ST.project.elements[0].A, [2e-7, -5e-11]);
});

test('a concave sphere at f/2.5 made aspheric by the optimiser images a star as a paraboloid does', () => {
  const spot = asm => { const P = D.designPrescription(asm), An = AN.anaSystems(asm, P); return AN.spotDiagram(An, 0, 15).rms; };
  const para = spot(load({ k: -1 })), a = load({}, { vars: ['a4:M.0', 'a6:M.0', 'a8:M.0'] }), s0 = spot(a);
  const P = D.designPrescription(a), prob = O.optProblem(a, P), out = O.optRun(prob, { mode: 'dls', iters: 60 });
  O.optApply(P, prob, out); D.commitDesign(a, P);
  const s1 = spot(a), A4 = ST.project.elements[0].A[0], R = 200;
  assert.ok(s0 > 1e-3 && s1 < s0 / 100 && para < 1e-9, 'sphere ' + s0 + ' → ' + s1 + ' (paraboloid ' + para + ')');
  // the paraboloid's sag less the sphere's: −r⁴ / (8 R³) to first order, the mirror concave toward the light (R > 0 on the bench)
  assert.ok(Math.abs(A4 - (-1 / (8 * R ** 3))) < 0.02 * (1 / (8 * R ** 3)), 'A4 ' + A4 + ' against ' + (-1 / (8 * R ** 3)));
});
