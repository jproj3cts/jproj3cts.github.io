/* A plain lens and an asphere: only an asphere's surfaces take a conic and aspheric terms, in its
   panel and in lens design; a lens from before the two were told apart is an asphere if it has
   them. A radius of 0 written from a design is a flat surface on the bench, as typed in a panel is. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const D = await import('../../src/engines/lens-design.js');

const load = (lens, extra) => {
  loadProject({ format: 'jekray', version: 1, elements: [Object.assign({ type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, diameter: 25, gaps: [4], materials: [{ glass: 'N-BK7' }], group: 'g' }, lens)],
    assemblies: [Object.assign({ id: 'g', name: 'T', ref: 'L', cond: { aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0 }], waves: [{ nm: 587.56 }] } }, extra)] });
  return ST.project.assemblies[0];
};

test('a lens is an asphere when made one, or when an older file gives it a conic or aspheric terms', () => {
  load({ surfaces: [{ R: 50 }, { R: -50 }] });
  assert.equal(ST.project.elements[0].asphere, undefined);
  load({ surfaces: [{ R: 50, k: -0.6 }, { R: null }] });
  assert.equal(ST.project.elements[0].asphere, true);
  load({ surfaces: [{ R: 50, A: [1e-6] }, { R: null }] });
  assert.equal(ST.project.elements[0].asphere, true);
  load({ asphere: true, surfaces: [{ R: 50 }, { R: null }] });
  assert.equal(ST.project.elements[0].asphere, true);
});

test('in lens design only an asphere’s surfaces have a conic and aspheric terms to set or vary', () => {
  let a = load({ surfaces: [{ R: 50 }, { R: -50 }] }), P = D.designPrescription(a);
  assert.equal(D.editable(P, 'R', 0), true);
  assert.equal(D.editable(P, 'k', 0), false);
  assert.equal(D.editable(P, 'a4', 0), false);
  a = load({ asphere: true, surfaces: [{ R: 50 }, { R: -50 }] }); P = D.designPrescription(a);
  assert.equal(D.editable(P, 'k', 0), true);
  assert.equal(D.editable(P, 'a4', 1), true);
});

test('a radius of 0 from the design is a flat surface on the bench', () => {
  const a = load({ surfaces: [{ R: 51.5 }, { R: -51.5 }] }), P = D.designPrescription(a);
  P.surfaces[1].R = 0;
  D.commitDesign(a, P);
  assert.equal(ST.project.elements[0].surfaces[1].R, null);
});
