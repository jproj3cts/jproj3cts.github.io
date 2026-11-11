// The measure readout (core/measure.js) on the kernel's measurements of a plate with two holes: what it leads with
// (parallel faces: how far apart; a hole: its diameter; two holes: their centres) and the rest of the list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kernel, rectSketch, newDoc, newFeature } from './helpers.mjs';
import { measureReadout } from '../../src/core/measure.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, (what || '') + ' ' + a + ' is not ' + b);
const row = (R, label) => R.rows.find(r => r[0] === label);

test('the readout: parallel distance between faces, a hole’s diameter, centres of two holes, an angle, totals', async () => {
  const K = await kernel(), doc = newDoc(), sk = rectSketch(doc, 40, 20);
  sk.ents.push({ id: 'h1', t: 'circle', c: [10, 10], r: 3 }, { id: 'h2', t: 'circle', c: [30, 10], r: 4 });
  doc.features.push(sk, newFeature(doc, 'extrude', { sketch: sk.id, regions: [[1, 1]], depth: '10', op: 'new' }));
  const out = K.regen(doc), M = out.parts[0], face = i => ({ part: M.id, kind: 'face', index: i });
  // the faces, told apart by what the kernel says of each
  const info = M.faceKinds.map((k, i) => K.measure([face(i)], doc).items[0]);
  const plane = n => info.findIndex(it => it.type === 'plane' && it.normal && Math.abs(it.normal[0] - n[0]) + Math.abs(it.normal[1] - n[1]) + Math.abs(it.normal[2] - n[2]) < 1e-6);
  const left = plane([-1, 0, 0]), right = plane([1, 0, 0]), top = plane([0, 0, 1]), bottom = plane([0, 0, -1]), front = plane([0, -1, 0]);
  const cyl = info.map((it, i) => (it.type === 'cylinder' ? i : -1)).filter(i => i >= 0);
  assert.equal(cyl.length, 2); assert.ok(left >= 0 && right >= 0 && top >= 0 && bottom >= 0 && front >= 0);
  // two opposite faces: it leads with how far apart they are
  let R = measureReadout(K.measure([face(left), face(right)], doc));
  assert.equal(R.head[0], 'Parallel distance'); near(R.head[2], 40, 1e-9);
  near(row(R, 'Minimum distance')[2], 40, 1e-9); near(row(R, 'dX')[2], 40, 1e-9); near(row(R, 'dY')[2], 0, 1e-9);
  near(row(R, 'Total area')[2], 2 * 20 * 10, 1e-6);
  R = measureReadout(K.measure([face(top), face(bottom)], doc)); near(R.head[2], 10, 1e-9, 'the plate’s thickness');
  // two faces that meet: no parallel distance, an angle of 90°, 0 apart
  R = measureReadout(K.measure([face(top), face(front)], doc));
  assert.equal(row(R, 'Parallel distance'), undefined); near(row(R, 'Angle')[2], 90, 1e-6); assert.equal(R.head[0], 'Minimum distance'); near(R.head[2], 0, 1e-9);
  // a hole's wall alone: its diameter
  const small = cyl.find(i => Math.abs(info[i].radius - 3) < 1e-9), big = cyl.find(i => Math.abs(info[i].radius - 4) < 1e-9);
  R = measureReadout(K.measure([face(small)], doc));
  assert.equal(R.head[0], 'Diameter'); near(R.head[2], 6, 1e-9); near(row(R, 'Radius')[2], 3, 1e-9);
  // two holes: the distance between their centres leads (20), and the least distance between their walls (20 − 3 − 4)
  R = measureReadout(K.measure([face(small), face(big)], doc));
  assert.equal(R.head[0], 'Centre distance'); near(R.head[2], 20, 1e-9); near(row(R, 'Minimum distance')[2], 13, 1e-6);
  // a hole and a flat face its axis runs along: how far the axis is from the face (the small hole is 10 from the left)
  R = measureReadout(K.measure([face(small), face(left)], doc));
  assert.equal(R.head[0], 'Parallel distance'); near(R.head[2], 10, 1e-9); near(row(R, 'Minimum distance')[2], 7, 1e-6);
  // edges: one straight edge leads with its length; two parallel ones with how far apart; three total their lengths
  const n = M.edgeGroups.length / 2, es = [];
  for (let j = 0; j < n; j++) es.push(K.measure([{ part: M.id, kind: 'edge', index: j }], doc).items[0]);
  const along = (ax, len) => es.map((e, j) => (e.type === 'line' && Math.abs(Math.abs(e.dir[ax]) - 1) < 1e-9 && Math.abs(e.length - len) < 1e-9 ? j : -1)).filter(j => j >= 0);
  const xs = along(0, 40); assert.equal(xs.length, 4);
  R = measureReadout(K.measure([{ part: M.id, kind: 'edge', index: xs[0] }], doc)); assert.equal(R.head[0], 'Length'); near(R.head[2], 40, 1e-9);
  const pair = [xs[0], xs.find(j => j !== xs[0] && Math.abs(es[j].at[2] - es[xs[0]].at[2]) < 1e-9)];
  R = measureReadout(K.measure(pair.map(j => ({ part: M.id, kind: 'edge', index: j })), doc));
  assert.equal(R.head[0], 'Parallel distance'); near(R.head[2], 20, 1e-9); near(row(R, 'Total length')[2], 80, 1e-9);
  R = measureReadout(K.measure(xs.slice(0, 3).map(j => ({ part: M.id, kind: 'edge', index: j })), doc));
  assert.equal(R.head[0], 'Total length'); near(R.head[2], 120, 1e-9);
  // a round edge: its diameter; a corner and a face: how far the corner is from the face
  const rim = es.findIndex(e => e.type === 'circle' && Math.abs(e.radius - 4) < 1e-9);
  R = measureReadout(K.measure([{ part: M.id, kind: 'edge', index: rim }], doc)); assert.equal(R.head[0], 'Diameter'); near(R.head[2], 8, 1e-9);
  R = measureReadout(K.measure([{ part: M.id, kind: 'vertex', index: 0 }, face(top)], doc));
  assert.equal(R.head[0], 'Parallel distance'); assert.ok(Math.abs(R.head[2]) < 1e-9 || Math.abs(R.head[2] - 10) < 1e-9);
  // the part alone: its volume
  R = measureReadout(K.measure([{ part: M.id, kind: 'part' }], doc)); assert.equal(R.head[0], 'Volume'); near(R.head[2], 8000 - Math.PI * (9 + 16) * 10, 1e-6);
  assert.equal(measureReadout({ items: [] }), null);
});
