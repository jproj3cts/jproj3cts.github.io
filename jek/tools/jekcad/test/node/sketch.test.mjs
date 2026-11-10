// The sketch solver and tools (core/sketch.js, core/sketch-tools.js), the numbers people type (core/units.js), and
// the document model (core/doc.js): pure, no kernel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definedEnts, solveSketch, dimMeasure, sketchId, normDims } from '../../src/core/sketch.js';
import { rectEnts, regionsOf, defaultRegionPts, trimEnt, filletCorner, offsetEnts, mirrorEnts, slotEnts, polygonEnts, arc3, tangentArc, entCross, carryPt, carryRegions } from '../../src/core/sketch-tools.js';
import { evalExpr, evalVars } from '../../src/core/units.js';
import { normDoc, newDoc, newFeature, prepareDoc, canMove, CAD_FORMAT } from '../../src/core/doc.js';

const near = (a, b, t = 1e-6) => assert.ok(Math.abs(a - b) <= t, a + ' is not ' + b);
const dimRect = () => {
  const r = rectEnts([1, 1], [9, 6]), [l0, l1] = r.ents;
  r.cons.push({ id: 'o', t: 'coincident', r: [{ e: l0.id, k: 'a' }, { e: 'origin' }] });
  const dims = [{ id: 'd1', t: 'len', r: [{ e: l0.id }], v: 40 }, { id: 'd2', t: 'len', r: [{ e: l1.id }], v: 20 }];
  return { ents: r.ents, cons: r.cons, dims };
};

test('a rectangle, pinned at the origin and dimensioned, solves to 40 × 20 and is fully defined', () => {
  const s = dimRect();
  assert.ok(!definedEnts(s.ents, s.cons, []).size, 'undimensioned: free');
  const r = solveSketch(s.ents, s.cons, s.dims);
  assert.ok(r.ok, 'solved, err ' + r.err);
  near(s.ents[0].b[0], 40); near(s.ents[1].b[1], 20); near(s.ents[2].b[0], 0);
  assert.equal(definedEnts(s.ents, s.cons, s.dims).size, 4, 'every side defined');
  // a dimension changed: the rectangle follows
  s.dims[0].v = 55; solveSketch(s.ents, s.cons, s.dims);
  near(dimMeasure(s.ents, { t: 'len', r: [{ e: s.ents[2].id }] }), 55);
});

test('drag-solve: a corner dragged moves an under-defined rectangle, its constraints kept', () => {
  const r = rectEnts([0, 0], [10, 5]);
  const extra = [{ r: { e: r.ents[1].id, k: 'b' }, to: [14, 8] }];
  solveSketch(r.ents, r.cons, [], extra);
  near(r.ents[1].b[0], 14, 1e-5); near(r.ents[1].b[1], 8, 1e-5);
  near(r.ents[0].a[1], r.ents[0].b[1]); near(r.ents[1].a[0], r.ents[1].b[0]);
});

test('constraints: tangent, perpendicular, equal, concentric, symmetric and midpoint hold once solved', () => {
  const ents = [{ id: 'l1', t: 'line', a: [0, 0], b: [10, 1] }, { id: 'l2', t: 'line', a: [10, 1], b: [11, 8] }, { id: 'c1', t: 'circle', c: [5, 6], r: 2 }, { id: 'c2', t: 'circle', c: [5.5, 6.2], r: 3 }, { id: 'p', t: 'point', c: [4, 4] }, { id: 'q', t: 'point', c: [7, 3] }];
  const cons = [{ id: 'a', t: 'perpendicular', r: [{ e: 'l1' }, { e: 'l2' }] }, { id: 'b', t: 'tangent', r: [{ e: 'l1' }, { e: 'c1' }] }, { id: 'c', t: 'concentric', r: [{ e: 'c1' }, { e: 'c2' }] },
    { id: 'd', t: 'symmetric', r: [{ e: 'p', k: 'c' }, { e: 'q', k: 'c' }, { e: 'l2' }] }, { id: 'e', t: 'horizontal', r: [{ e: 'l1' }] }, { id: 'f', t: 'equal', r: [{ e: 'l1' }, { e: 'l2' }] }];
  const r = solveSketch(ents, cons, []);
  assert.ok(r.ok, 'err ' + r.err);
  const [l1, l2, c1, c2] = ents;
  near((l1.b[0] - l1.a[0]) * (l2.b[0] - l2.a[0]) + (l1.b[1] - l1.a[1]) * (l2.b[1] - l2.a[1]), 0, 1e-6);
  near(Math.abs(c1.c[1] - l1.a[1]), c1.r, 1e-6);
  near(c1.c[0], c2.c[0]); near(Math.hypot(l1.b[0] - l1.a[0], l1.b[1] - l1.a[1]), Math.hypot(l2.b[0] - l2.a[0], l2.b[1] - l2.a[1]));
});

test('regions: a ring is one region and its hole another; the default takes the ring alone', () => {
  const r = rectEnts([0, 0], [40, 20]);
  const ents = r.ents.concat([{ id: 'c', t: 'circle', c: [20, 10], r: 3 }]);
  const R = regionsOf(ents);
  assert.equal(R.length, 2);
  const pts = defaultRegionPts(ents);
  assert.equal(pts.length, 1);
  near(R.find(x => x.holes.length).area, 800 - Math.PI * 9, 0.05);
  // construction shapes make no region
  assert.equal(regionsOf(ents.map(e => Object.assign({}, e, { k: true }))).length, 0);
});

test('trim, fillet, offset and mirror', () => {
  // two crossing lines: trimming one end of the first leaves the part past the crossing
  const sk = { ents: [{ id: 'a', t: 'line', a: [0, 0], b: [10, 0] }, { id: 'b', t: 'line', a: [5, -5], b: [5, 5] }], cons: [], dims: [] };
  assert.ok(trimEnt(sk, 'a', [8, 0]));
  const a = sk.ents.find(e => e.id === 'a');
  near(a.b[0], 5); near(a.a[0], 0);
  // a circle cut by a line becomes an arc
  const sk2 = { ents: [{ id: 'c', t: 'circle', c: [0, 0], r: 5 }, { id: 'l', t: 'line', a: [-10, 3], b: [10, 3] }], cons: [], dims: [] };
  trimEnt(sk2, 'c', [0, 5]);
  assert.equal(sk2.ents.find(e => e.id === 'c').t, 'arc');
  // a corner rounded: the lines shortened by r, the arc tangent, its radius dimensioned
  const r = rectEnts([0, 0], [20, 10]);
  const sk3 = { ents: r.ents, cons: r.cons, dims: [] };
  const arc = filletCorner(sk3, [20, 10], 2);
  assert.ok(arc);
  near(arc.r, 2); near(arc.c[0], 18); near(arc.c[1], 8);
  assert.ok(solveSketch(sk3.ents, sk3.cons, sk3.dims).ok);
  assert.equal(regionsOf(sk3.ents).length, 1);
  near(regionsOf(sk3.ents)[0].area, 200 - (4 - Math.PI), 0.02);
  // offset a rectangle's sides out by 1: the copies meet at the corners
  const r2 = rectEnts([0, 0], [10, 10]);
  const sk4 = { ents: r2.ents, cons: r2.cons, dims: [] };
  offsetEnts(sk4, r2.ents.map(e => e.id), -1);
  const R = regionsOf(sk4.ents);
  assert.ok(R.some(x => Math.abs(Math.abs(x.area) - 144 + 100) < 1e-6) || R.some(x => Math.abs(x.area - 44) < 1e-6), JSON.stringify(R.map(x => x.area)));
  // mirror a circle in a vertical line
  const sk5 = { ents: [{ id: 'm', t: 'line', a: [0, -5], b: [0, 5], k: true }, { id: 'k', t: 'circle', c: [3, 1], r: 1 }], cons: [], dims: [] };
  const [mc] = mirrorEnts(sk5, ['k'], 'm');
  near(mc.c[0], -3); near(mc.c[1], 1);
  assert.ok(solveSketch(sk5.ents, sk5.cons, []).ok);
});

test('the drawing tools’ shapes: slot, polygon, three-point and tangent arcs', () => {
  const s = slotEnts([0, 0], [20, 0], 3);
  assert.ok(solveSketch(s.ents, s.cons, []).ok);
  near(regionsOf(s.ents)[0].area, 20 * 6 + Math.PI * 9, 0.05);
  const p = polygonEnts([0, 0], [10, 0], 6);
  assert.ok(solveSketch(p.ents, p.cons, []).ok);
  near(regionsOf(p.ents)[0].area, 3 * Math.sqrt(3) / 2 * 100, 0.05);
  const a = arc3([10, 0], [-10, 0], [0, 10]);
  near(a.r, 10); near(a.c[0], 0); near(a.c[1], 0);
  const t = tangentArc([0, 0], [1, 0], [10, 10]);
  near(t.r, 10); near(t.c[1], 10);
  assert.equal(entCross({ t: 'circle', c: [0, 0], r: 5 }, { t: 'line', a: [-9, 0], b: [9, 0] }).length, 2);
});

test('numbers with units and expressions; the Variables table', () => {
  near(evalExpr('12', {}, 'len'), 12);
  near(evalExpr('0.5 in', {}, 'len'), 12.7);
  near(evalExpr('2 cm + 3 mm', {}, 'len'), 23);
  near(evalExpr('(1 + 2) * 3 ^ 2', {}, 'num'), 27);
  near(evalExpr('#w / 2 + 1', { w: 10 }, 'len'), 6);
  near(evalExpr('1 rad', {}, 'ang'), 180 / Math.PI);
  near(evalExpr('sqrt(2) * cos(60)', {}, 'num'), Math.SQRT2 / 2);
  assert.throws(() => evalExpr('#nope', {}, 'len'), /no variable/);
  assert.throws(() => evalExpr('3 +', {}, 'len'), /unfinished/);
  const v = evalVars([{ name: 'a', expr: '10 mm' }, { name: 'b', expr: '#a * 2' }, { name: 'c', expr: '#z' }]);
  near(v.values.b, 20); assert.ok(v.errors.c);
});

test('the document: defaults for what an old file lacks, prepared dimensions, reordering rules', () => {
  const d = normDoc({ features: [{ type: 'sketch', ents: [{ t: 'line', a: [0, 0], b: [5, 0] }, { t: 'bogus' }] }, { type: 'extrude', depth: 7 }, { type: 'nonsense' }] });
  assert.equal(d.format, CAD_FORMAT);
  assert.equal(d.features.length, 2);
  assert.equal(d.features[0].ents.length, 1);
  assert.equal(d.features[1].op, 'new'); assert.equal(d.features[1].depth, '7'); assert.equal(d.features[1].end, 'blind');
  assert.equal(d.rollback, null);
  // a dimension's expression, from a variable, solved into the sketch
  const doc = newDoc(), r = rectEnts([0, 0], [5, 5]);
  const sk = newFeature(doc, 'sketch', { ents: r.ents, cons: r.cons, dims: [{ id: sketchId('d'), t: 'len', r: [{ e: r.ents[0].id }], v: 5, x: '#len * 3' }] });
  doc.variables.push({ name: 'len', expr: '4', kind: 'len' });
  doc.features.push(sk);
  prepareDoc(doc);
  near(Math.hypot(sk.ents[0].b[0] - sk.ents[0].a[0], sk.ents[0].b[1] - sk.ents[0].a[1]), 12, 1e-6);
  // an extrude cannot move above its sketch
  doc.features.push(newFeature(doc, 'extrude', { sketch: sk.id }));
  assert.equal(canMove(doc, 1, 0), false);
  assert.equal(canMove(doc, 0, 1), false);
});

test('a region’s point is carried with its shapes: beside the line or circle it was nearest to', () => {
  const was = [{ id: 'c1', t: 'circle', c: [30, 15], r: 3 }, { id: 'l1', t: 'line', a: [0, 0], b: [40, 0] }, { id: 'l2', t: 'line', a: [40, 0], b: [40, 20] }, { id: 'l3', t: 'line', a: [40, 20], b: [0, 20] }, { id: 'l4', t: 'line', a: [0, 20], b: [0, 0] }];
  const now = JSON.parse(JSON.stringify(was));
  now[0].c = [50, 15]; now[1].b = [60, 0]; now[2].a = [60, 0]; now[2].b = [60, 20]; now[3].a = [60, 20];
  // the hole's own point goes with the hole; a point in the plate keeps its place along and off its nearest line
  const h = carryPt(was, now, [30, 15]);
  near(h[0], 50, 1e-9); near(h[1], 15, 1e-9);
  const q = carryPt(was, now, [20, 2]);
  near(q[0], 30, 1e-9); near(q[1], 2, 1e-9);
  // and a feature's chosen regions with them
  const doc = { features: [{ id: 'sk', type: 'sketch', ents: was }, { id: 'ex', type: 'extrude', sketch: 'sk', regions: [[30, 15]] }] };
  carryRegions(doc, 'sk', was, now);
  near(doc.features[1].regions[0][0], 50, 1e-6);
});

test('an angle dimension with rev measures inside the corner two chained lines make', () => {
  // a base to the right, then a side back up to the left: the lines' directions are 148° apart, the corner 32°
  const ents = [{ id: 'l1', t: 'line', a: [0, 0], b: [40, 0] }, { id: 'l2', t: 'line', a: [40, 0], b: [0, 25] }];
  near(Math.abs(dimMeasure(ents, { t: 'ang', r: [{ e: 'l1' }, { e: 'l2' }] })), 147.9946, 1e-3);
  const d = { id: 'd', t: 'ang', r: [{ e: 'l1' }, { e: 'l2' }], rev: true };
  const m = dimMeasure(ents, d);
  near(Math.abs(m), 32.0054, 1e-3);
  d.s = m < 0 ? -1 : 1; d.v = 30;
  const cons = [{ id: 'c1', t: 'coincident', r: [{ e: 'l1', k: 'a' }, { e: 'origin' }] }, { id: 'c2', t: 'horizontal', r: [{ e: 'l1' }] }, { id: 'c3', t: 'coincident', r: [{ e: 'l1', k: 'b' }, { e: 'l2', k: 'a' }] }];
  const r = solveSketch(ents, cons, [d, { id: 'd2', t: 'len', r: [{ e: 'l1' }], v: 40 }], null, { iters: 100 });
  assert.ok(r.ok);
  near(Math.atan2(ents[1].b[1] - ents[1].a[1], ents[1].a[0] - ents[1].b[0]) * 180 / Math.PI, 30, 1e-4);
  assert.equal(normDims([d], ents)[0].rev, true);
});
