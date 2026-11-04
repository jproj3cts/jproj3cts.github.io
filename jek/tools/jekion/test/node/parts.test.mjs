/* Normalising: every shape, ion group and detector made, normalised again, is unchanged; every example loads and
   normalises to itself; a file from the future or the past still loads. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normElectrode, makeElectrode, SHAPE_ORDER } from '../../src/parts/electrodes.js';
import { normIon, normDetector } from '../../src/parts/ions.js';
import { normProject } from '../../src/state/elements.js';
import { shapeBounds, shapeInside, shapeSections, shapeTriangles } from '../../src/core/geom.js';

const strip = e => JSON.parse(JSON.stringify(Object.assign({}, e, { meshT: undefined })));

test('every shape normalises to itself, has a box, a section and triangles', () => {
  for (const s of SHAPE_ORDER) {
    const el = makeElectrode(s, 1, 2, 0, []);
    assert.deepEqual(strip(normElectrode(el, 0)), strip(el), s);
    const [lo, hi] = shapeBounds(el);
    assert.ok(lo.every((v, k) => v < hi[k]), s + ' has a box');
    assert.ok(shapeInside(el, el.x + (s === 'endcap' ? el.z0 + 1 : s === 'ring' ? 0 : 0), el.y + (s === 'ring' ? el.r0 + 1 : s === 'tube' || s === 'aperture' ? (el.rIn + el.rOut) / 2 : 0), el.z), s + ' contains a point of itself');
    assert.ok(shapeSections(el, 'xy', el.z), s + ' has a section through its centre');
    const T = shapeTriangles(el); assert.ok(T && T.idx.length >= 12, s + ' has triangles');
  }
});
test('ion groups and detectors normalise to themselves', () => {
  const g = normIon({ species: 'Ar+', n: 7, ke: 12, dist: 'disc', size: 1 }, 0); assert.deepEqual(normIon(g, 0), g);
  const d = normDetector({ axis: 'y', y: 5 }, 0); assert.deepEqual(normDetector(d, 0), d); assert.equal(d.at, 5);
});
test('every example loads and normalises to itself', () => {
  const dir = new URL('../../../demos/', import.meta.url);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jekion'));
  assert.ok(files.length >= 7);
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
    const P = normProject(d), Q = normProject(JSON.parse(JSON.stringify(Object.assign({}, P, { electrodes: P.electrodes.map(strip) }))));
    assert.deepEqual(Q.electrodes.map(strip), P.electrodes.map(strip), f);
    assert.deepEqual(Q.ions, P.ions, f); assert.deepEqual(Q.grid, P.grid, f);
    assert.ok(d.notes && d.notes.length > 80, f + ' has notes');
  }
});
test('a strange file still loads: unknown shapes become boxes, bad numbers their defaults, the node count is capped', () => {
  const P = normProject({ electrodes: [{ shape: 'teapot', x: 'a', V: null }], ions: [{ species: 'unobtainium', n: -4 }], grid: { sym: '3d', h: 0.01, x0: 0, x1: 100, y0: 0, y1: 100, z0: 0, z1: 100 } });
  assert.equal(P.electrodes[0].shape, 'box'); assert.equal(P.electrodes[0].x, 0); assert.equal(P.electrodes[0].V, 0);
  assert.equal(P.ions[0].species, 'custom'); assert.equal(P.ions[0].n, 1);
  assert.ok(P.grid.h > 0.01, 'the spacing grew to keep the nodes within the limit: ' + P.grid.h);
});
