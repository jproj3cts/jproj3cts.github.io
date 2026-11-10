/* A bench saved with a part made in the 3D view's old Model tools (model-body.fixture.json: a 40 × 20 × 5 mm plate with
   a hole, sketched on a plane 30 mm up, extruded, then turned; written by that code before it was taken out) loads as a
   fixed STL object: its triangles as they were, in millimetres, where it stood and turned as it was, with no "model"
   left to make it again; and it traces as a beam block. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject, serialize } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const { meshOf, meshRay } = await import('../../src/core/stl.js');

const saved = JSON.parse(readFileSync(new URL('./model-body.fixture.json', import.meta.url), 'utf8'));
const old = saved.elements.find(e => e.type === 'stl');

test('an old modelled part loads as a fixed STL object, in the same place and pose, its triangles kept', () => {
  assert.ok(old.model && old.model.feats.length === 2, 'the fixture holds a modelled part (a sketch and an extrude)');
  loadProject(JSON.parse(JSON.stringify(saved)));
  const el = ST.project.elements.find(e => e.id === 'mdl1');
  assert.equal(el.type, 'stl');
  assert.ok(!('model' in el), 'no features left to edit');
  for (const k of ['x', 'y', 'z', 'angle', 'tip', 'roll']) assert.equal(el[k], old[k], k);
  assert.equal(el.units, 'mm'); assert.equal(el.scale, 1);
  assert.equal(el.mesh.data, old.mesh.data, 'its triangles as saved');
  assert.deepEqual(el.mesh.size, [40, 20, 5]);
  assert.equal(meshOf(el).n, old.mesh.n);
  assert.equal(el.mesh.file, 'a part modelled in JEKray');
  // saved again, it is an STL object like any other
  const again = serialize().elements.find(e => e.id === 'mdl1');
  assert.ok(!('model' in again));
  // a ray straight down onto it, 10 mm from its middle (clear of the hole), meets it near its top
  const t = meshRay(el, [el.x - 10 * Math.cos(30 * Math.PI / 180), el.y - 10 * Math.sin(30 * Math.PI / 180), 100], [0, 0, -1], 0);
  assert.ok(t > 60 && t < 70, 'met near its top, 67.5 mm down: ' + t);
});
