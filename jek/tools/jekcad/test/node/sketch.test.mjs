// The sketch solver and tools (core/sketch.js, core/sketch-tools.js), the numbers people type (core/units.js), and
// the document model (core/doc.js): pure, no kernel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definedEnts, solveSketch, solveNear, dimMeasure, sketchId, normDims, curvePts, splineEnd } from '../../src/core/sketch.js';
import { rectEnts, regionsOf, defaultRegionPts, trimEnt, filletCorner, offsetEnts, mirrorEnts, slotEnts, polygonEnts, arc3, tangentArc, entCross, carryPt, carryRegions, alignedRectEnts, centreArc, chamferCorner, extendEnt, splitEnt, linearPattern, circularPattern, transformEnts, dxfEnts, normEnts, distToEnt } from '../../src/core/sketch-tools.js';
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

test('a dimension typed moves the shape it measures, and a loose shape it touches stays where it is', () => {
  // a loose rectangle (nothing holds it to the origin), and a line from its corner; the line's length set to 30
  const r = rectEnts([-30, 13], [30, 27]), line = { id: 'ln', t: 'line', a: [-30, 13], b: [10, -10] };
  const ents = [...r.ents, line], cons = [...r.cons, { id: 'cj', t: 'coincident', r: [{ e: 'ln', k: 'a' }, { e: r.ents[0].id, k: 'a' }] }];
  const before = JSON.stringify(r.ents.map(e => [e.a, e.b]));
  const out = solveNear(ents, cons, [{ id: 'd', t: 'len', r: [{ e: 'ln' }], v: 30 }], ['ln'], { iters: 100 });
  assert.ok(out.ok);
  near(Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]), 30, 1e-6);
  const after = r.ents.map(e => [e.a, e.b]).flat(2), was = JSON.parse(before).flat(2);
  assert.ok(Math.max(...after.map((v, i) => Math.abs(v - was[i]))) < 1e-6, 'the rectangle has not moved');
  near(line.a[0], -30, 1e-6); near(line.a[1], 13, 1e-6);
});

test('more sketch shapes: an aligned rectangle, a centre-point arc, a circumscribed polygon, an ellipse and splines', () => {
  const r = alignedRectEnts([0, 0], [10, 10], [0, 10]);
  near(regionsOf(r.ents)[0].area, 100, 1e-6);
  assert.deepEqual(r.cons.slice(-3).map(c => c.t), ['perpendicular', 'parallel', 'parallel']);
  const a = centreArc([0, 0], [10, 0], [0, 7]), b = centreArc([0, 0], [10, 0], [0, 7], true);
  near(a.r, 10); near(a.a0, 0); near(a.a1, 90); near(b.a0, 90); near(b.a1, 0);
  // a hexagon by the middle of a side: the circle through that point touches every side
  const pg = polygonEnts([0, 0], [8, 0], 6, true), circ = pg.ents[6];
  near(circ.r, 8 / Math.cos(Math.PI / 6), 1e-9);
  near((pg.ents[5].a[0] + pg.ents[5].b[0]) / 2, 8, 1e-9);
  // an ellipse: its area, its points, and its size set by a dimension to the end of a half-width
  const el = { id: 'e', t: 'ellipse', c: [0, 0], rx: 10, ry: 5, rot: 30 };
  near(regionsOf([el])[0].area, Math.PI * 50, 0.1);
  const out = solveSketch([el], [{ id: 'c1', t: 'coincident', r: [{ e: 'e', k: 'c' }, { e: 'origin' }] }, { id: 'c2', t: 'horizontal', r: [{ e: 'e', k: 'c' }, { e: 'e', k: 'pa' }] }], [{ id: 'd1', t: 'dist', r: [{ e: 'e', k: 'c' }, { e: 'e', k: 'pa' }], v: 14 }], null, { iters: 100 });
  assert.ok(out.ok); near(el.rx, 14, 1e-6); near(Math.sin(el.rot * Math.PI / 180), 0, 1e-6);
  // a spline through its points; a Bézier curve from its first to its last; kept by normEnts, dropped when too short
  const sp = { id: 's', t: 'spline', pts: [[0, 0], [5, 6], [12, 7], [20, 0]] }, P = curvePts(sp, 3);
  for (const q of sp.pts) assert.ok(distToEnt(sp, q) < 1e-9, 'the spline goes through its points');
  near(P[0][0], 0); near(P[P.length - 1][0], 20);
  const bz = { id: 'b', t: 'spline', cv: true, pts: [[0, 0], [5, 12], [15, 12], [20, 0]] };
  near(regionsOf([bz, { id: 'l', t: 'line', a: [20, 0], b: [0, 0] }])[0].area, 126, 0.05);      // a cubic's area: 3/20 of the control polygon's cross products
  assert.equal(normEnts([el, sp, bz, { id: 'x', t: 'spline', pts: [[0, 0]] }]).length, 3);
});

test('sketch edits: chamfer, extend, split, patterns, transform; a line normal to a circle; a DXF read', () => {
  const sk = { ents: rectEnts([0, 0], [20, 10]).ents, cons: rectEnts([0, 0], [20, 10]).cons.slice(0, 0), dims: [] };
  assert.ok(chamferCorner(sk, [20, 10], 3));
  near(regionsOf(sk.ents)[0].area, 200 - 4.5, 1e-6);
  const s2 = { ents: [{ id: 'a', t: 'line', a: [0, 0], b: [5, 0] }, { id: 'b', t: 'line', a: [10, -5], b: [10, 5] }, { id: 'c', t: 'arc', c: [0, 20], r: 5, a0: 0, a1: 180 }], cons: [], dims: [] };
  assert.ok(extendEnt(s2, 'a', [5, 0])); near(s2.ents[0].b[0], 10); assert.equal(s2.cons[0].t, 'oncurve');
  assert.ok(splitEnt(s2, 'b', [10, 1])); assert.ok(splitEnt(s2, 'c', [0, 25]));
  assert.equal(s2.ents.length, 5); near(s2.ents[2].a1, 90, 1e-9); near(s2.ents[4].a0, 90, 1e-9);
  assert.equal(extendEnt(s2, 'c', [5, 20]), false);
  const s3 = { ents: [{ id: 'c', t: 'circle', c: [10, 0], r: 2 }], cons: [], dims: [{ id: 'd', t: 'dia', r: [{ e: 'c' }], v: 4, x: '4' }] };
  assert.equal(circularPattern(s3, ['c'], [0, 0], 6, 360).length, 5);
  near(s3.ents[3].c[0], -10, 1e-9); assert.equal(s3.dims.length, 6, 'each copy keeps the diameter');
  assert.equal(linearPattern(s3, ['c'], [0, 30], 3).length, 2); near(s3.ents[7].c[1], 60, 1e-9);
  transformEnts(s3, ['c'], { dx: 1, rot: 90, scale: 2, about: [0, 0] });
  near(s3.ents[0].c[0], 1, 1e-9); near(s3.ents[0].c[1], 20, 1e-9); near(s3.ents[0].r, 4); assert.equal(s3.dims.some(d => d.r[0].e === 'c'), false, 'sized: its old diameter is let go');
  // normal: the line turned to point at the circle's centre
  const ln = { id: 'l', t: 'line', a: [0, 12], b: [6, 9] }, ci = { id: 'k', t: 'circle', c: [10, 0], r: 6 };
  const r = solveSketch([ln, ci], [{ id: 'n', t: 'normal', r: [{ e: 'l' }, { e: 'k' }] }], [], null, { iters: 100 });
  assert.ok(r.ok);
  near(((ci.c[0] - ln.a[0]) * (ln.b[1] - ln.a[1]) - (ci.c[1] - ln.a[1]) * (ln.b[0] - ln.a[0])), 0, 1e-6);
  // a DXF: a line, a circle, and a closed polyline of two bulges that is a circle of radius 5
  const dxf = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '10', '0', '20', '0', '11', '10', '21', '0', '0', 'CIRCLE', '10', '5', '20', '5', '40', '2', '0', 'LWPOLYLINE', '90', '2', '70', '1', '10', '0', '20', '0', '42', '1', '10', '10', '20', '0', '42', '1', '0', 'ENDSEC', '0', 'EOF'].join('\r\n');
  const d = dxfEnts(dxf);
  assert.equal(d.map(e => e.t).join(), 'line,circle,arc,arc');
  near(regionsOf(d.slice(2))[0].area, Math.PI * 25, 0.05);
});

test('constraints on curves: a point held on an ellipse and on a spline, a line touching an ellipse, a spline’s end leaving along a line and bending as an arc does; a conic', () => {
  const fix = (e, k, at) => ({ id: sketchId('c'), t: 'fix', r: [{ e, k }], at });
  // a point on an ellipse (20 × 10 about the origin)
  let ents = [{ id: 'e', t: 'ellipse', c: [0, 0], rx: 20, ry: 10, rot: 0 }, { id: 'p', t: 'point', c: [15, 9] }];
  let cons = [fix('e', 'c', [0, 0]), fix('e', 'pa', [20, 0]), fix('e', 'pb', [0, 10]), { id: 'c1', t: 'oncurve', r: [{ e: 'p', k: 'c' }, { e: 'e' }] }];
  let r = solveSketch(ents, cons, []);
  assert.ok(r.ok, 'on an ellipse'); let p = ents[1].c;
  assert.ok(Math.abs((p[0] / 20) ** 2 + (p[1] / 10) ** 2 - 1) < 1e-6, 'on the ellipse: ' + p);
  // a horizontal line touching it: at y = ±10
  ents = [{ id: 'e', t: 'ellipse', c: [0, 0], rx: 20, ry: 10, rot: 0 }, { id: 'l', t: 'line', a: [-5, 12.5], b: [8, 12.5] }];
  cons = [fix('e', 'c', [0, 0]), fix('e', 'pa', [20, 0]), fix('e', 'pb', [0, 10]), { id: 'h', t: 'horizontal', r: [{ e: 'l' }] }, { id: 't', t: 'tangent', r: [{ e: 'l' }, { e: 'e' }] }];
  r = solveSketch(ents, cons, []);
  assert.ok(r.ok && Math.abs(ents[1].a[1] - 10) < 1e-6 && Math.abs(ents[1].b[1] - 10) < 1e-6, 'touching: ' + JSON.stringify(ents[1]));
  // a point on a spline
  const sp = () => ({ id: 's', t: 'spline', pts: [[0, 0], [10, 8], [20, 3], [30, 10]] });
  ents = [sp(), { id: 'p', t: 'point', c: [14, 9] }];
  cons = [0, 1, 2, 3].map(i => fix('s', 'q' + i, ents[0].pts[i].slice())).concat({ id: 'c1', t: 'oncurve', r: [{ e: 'p', k: 'c' }, { e: 's' }] });
  r = solveSketch(ents, cons, []);
  const dmin = Math.min(...curvePts(ents[0], 1).map(q => Math.hypot(q[0] - ents[1].c[0], q[1] - ents[1].c[1])));
  assert.ok(r.ok && dmin < 0.05, 'on the spline: ' + dmin);
  // a spline's first end leaving along a line that ends there
  ents = [sp(), { id: 'l', t: 'line', a: [-10, -10], b: [0, 0] }];
  cons = [fix('l', 'a', [-10, -10]), fix('l', 'b', [0, 0]), fix('s', 'q0', [0, 0]), fix('s', 'q3', [30, 10]), { id: 't', t: 'tangent', r: [{ e: 's', k: 'q0' }, { e: 'l' }] }];
  r = solveSketch(ents, cons, []);
  let A = splineEnd(ents[0], true);
  assert.ok(r.ok && Math.abs(A.t[0] - A.t[1]) < 1e-6, 'leaves at 45°: ' + A.t);
  // a Bézier curve's last end running into an arc of radius 10: leaving the same way, bending the same
  ents = [{ id: 'b', t: 'spline', cv: true, pts: [[-30, 5], [-20, 12], [-8, 14], [0, 10]] }, { id: 'a', t: 'arc', c: [0, 0], r: 10, a0: 0, a1: 90 }];
  cons = [fix('a', 'c', [0, 0]), fix('a', 'p0', [10, 0]), fix('a', 'p1', [0, 10]), fix('b', 'q0', [-30, 5]), fix('b', 'q3', [0, 10]), { id: 't', t: 'tangent', r: [{ e: 'b', k: 'q3' }, { e: 'a' }] }, { id: 'k', t: 'curvature', r: [{ e: 'b', k: 'q3' }, { e: 'a' }] }];
  r = solveSketch(ents, cons, [], null, { iters: 200 });
  A = splineEnd(ents[0], false);
  assert.ok(r.ok, 'curvature solves');
  assert.ok(Math.abs(A.t[1]) < 1e-5 && Math.abs(Math.abs(A.k) - 0.1) < 1e-5, 'arrives level, bending 1/10: ' + JSON.stringify(A));
  // the curve bends towards the arc's centre (downwards as it travels +x): to the right, so negative
  assert.ok(A.k < 0, 'the same way as the arc');
  // a conic with rho 0.5 is a parabola: its middle is half way from the chord to the steering point
  const cn = normEnts([{ id: 'c', t: 'spline', pts: [[0, 0], [10, 12], [20, 0]], cn: 0.5 }])[0], Q = curvePts(cn, 1), mid = Q[(Q.length - 1) / 2];
  assert.ok(Math.abs(mid[0] - 10) < 1e-9 && Math.abs(mid[1] - 6) < 1e-9, 'parabola: ' + mid);
  // and rho 0.75 comes three quarters of the way
  const c2 = normEnts([{ id: 'c', t: 'spline', pts: [[0, 0], [10, 12], [20, 0]], cn: 0.75 }])[0], Q2 = curvePts(c2, 1), m2 = Q2[(Q2.length - 1) / 2];
  assert.ok(Math.abs(m2[1] - 9) < 1e-9, 'rho 0.75: ' + m2);
  // its ends leave towards the steering point
  const e0 = splineEnd(cn, true); assert.ok(Math.abs(e0.t[0] * 12 - e0.t[1] * 10) < 1e-9);
});

test('trim on an ellipse and a spline leaves the same curve with a range along it, its constraints kept; offset makes a spline', () => {
  // an ellipse 20 × 10 cut by a vertical line at x = 5: the right-hand part clicked away
  const fx = (e, k, at) => ({ id: sketchId('c'), t: 'fix', r: [{ e, k }], at });
  const sk = { ents: [{ id: 'e', t: 'ellipse', c: [0, 0], rx: 20, ry: 10, rot: 0 }, { id: 'l', t: 'line', a: [5, -30], b: [5, 30] }], cons: [fx('e', 'c', [0, 0])], dims: [] };
  assert.ok(trimEnt(sk, 'e', [20, 0]));
  const s = sk.ents.find(x => x.t === 'ellipse');
  assert.ok(s && s.id === 'e' && s.u0 !== undefined && s.u1 > s.u0, 'still the ellipse, with a range: ' + JSON.stringify(s));
  assert.equal(sk.cons.length, 1, 'what held it still holds it');
  const Q = curvePts(s, 1), y5 = 10 * Math.sqrt(1 - 25 / 400);
  for (const p of [Q[0], Q[Q.length - 1]]) assert.ok(Math.abs(p[0] - 5) < 0.02 && Math.abs(Math.abs(p[1]) - y5) < 0.02, 'ends on the line: ' + p);
  for (const p of Q) { assert.ok(Math.abs(Math.hypot(p[0] / 20, p[1] / 10) - 1) < 1e-12, 'exactly on the ellipse'); assert.ok(p[0] < 5.02); }
  assert.ok(normEnts(sk.ents).find(x => x.t === 'ellipse').u1 === s.u1, 'the range is kept in a file');
  // the region between it and the line: the ellipse's area left of x = 5
  const R = regionsOf(sk.ents);
  const whole = Math.PI * 200, right = 200 * (Math.acos(0.25) - 0.25 * Math.sqrt(1 - 0.0625));
  assert.equal(R.length, 1); assert.ok(Math.abs(Math.abs(R[0].area) - (whole - right)) < 0.6, 'area ' + R[0].area + ' for ' + (whole - right));
  // an open spline cut by a line: the end beyond it goes; cut in the middle, it is two with their points held together
  const s2 = { ents: [{ id: 's', t: 'spline', pts: [[0, 0], [10, 8], [20, 3], [30, 10]] }, { id: 'l', t: 'line', a: [15, -10], b: [15, 20] }], cons: [], dims: [] };
  assert.ok(trimEnt(s2, 's', [28, 9]));
  const k = s2.ents.filter(x => x.t === 'spline'); assert.equal(k.length, 1); assert.equal(k[0].pts.length, 4);
  const Q2 = curvePts(k[0], 1);
  assert.ok(Math.abs(Q2[0][0]) < 1e-9 && Math.abs(Q2[Q2.length - 1][0] - 15) < 0.02, JSON.stringify(Q2.slice(-1)));
  const s3 = { ents: [{ id: 's', t: 'spline', pts: [[0, 0], [10, 8], [20, 3], [30, 10]] }, { id: 'l1', t: 'line', a: [12, -10], b: [12, 20] }, { id: 'l2', t: 'line', a: [18, -10], b: [18, 20] }], cons: [], dims: [] };
  assert.ok(trimEnt(s3, 's', [15, 6]));
  const two = s3.ents.filter(x => x.t === 'spline'); assert.equal(two.length, 2);
  assert.equal(s3.cons.filter(c => c.t === 'coincident').length, 4, 'the second piece’s points are held on the first’s');
  assert.ok(Math.abs(curvePts(two[0], 1).slice(-1)[0][0] - 12) < 0.02 && Math.abs(curvePts(two[1], 1)[0][0] - 18) < 0.02);
  // offsets: an ellipse 2 out is everywhere 2 from it; a spline's offset 2 to its left
  const o = { ents: [{ id: 'e', t: 'ellipse', c: [0, 0], rx: 20, ry: 10, rot: 0 }, { id: 's', t: 'spline', pts: [[0, 30], [10, 38], [20, 33], [30, 40]] }], cons: [], dims: [] };
  const made = offsetEnts(o, ['e', 's'], 2);
  assert.equal(made.length, 2); assert.ok(made[0].closed && !made[1].closed);
  for (const m of made) { const base = o.ents.find(x => x.id === (m.closed ? 'e' : 's')); for (const p of m.pts) assert.ok(Math.abs(distToEnt(base, p) - 2) < 0.05, 'off by 2: ' + distToEnt(base, p)); }
  assert.ok(made[0].pts.every(p => Math.hypot(p[0] / 20, p[1] / 10) > 1), 'outwards');
  // each stays an offset of its curve: the ellipse made 30 × 10, its offset is 2 off the new ellipse; and it has
  // no numbers of its own (dragging the offset is dragging nothing), and is kept so in a file
  assert.deepEqual(made[0].of, { e: 'e', d: 2 });
  o.ents[0].rx = 30;
  solveSketch(o.ents, o.cons, o.dims);
  for (const p of made[0].pts) assert.ok(Math.abs(distToEnt(o.ents[0], p) - 2) < 0.05, 'follows: ' + distToEnt(o.ents[0], p));
  assert.ok(Math.max(...made[0].pts.map(p => p[0])) > 31.9);
  const kept = normEnts(o.ents).find(x => x.id === made[0].id);
  assert.deepEqual(kept.of, { e: 'e', d: 2 });
  // its curve deleted: a spline of its own, where it was
  assert.equal(normEnts(o.ents.filter(x => x.id !== 'e')).find(x => x.id === made[0].id).of, undefined);
  // the distance changed: it moves
  const y0 = made[1].pts[0][1];
  made[1].of.d = -1; solveSketch(o.ents, o.cons, o.dims);
  for (const p of made[1].pts) assert.ok(Math.abs(distToEnt(o.ents[1], p) - 1) < 0.05, 'the other side, 1 off: ' + distToEnt(o.ents[1], p));
  assert.ok(Math.abs(made[1].pts[0][1] - y0) > 1, 'it moved across the curve');
});

test('DXF: a spline by its fit points and by its control points and knots, an old POLYLINE, part of an ellipse, a drawing in inches', () => {
  const dxf = rows => rows.flat().join('\n');
  const head = unit => ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', String(unit), '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  // a quarter circle of radius 10 as a rational quadratic (control points (10,0), (10,10), (0,10); the middle weight √½)
  const nurbs = ['0', 'SPLINE', '70', '4', '71', '2', '40', '0', '40', '0', '40', '0', '40', '1', '40', '1', '40', '1', '41', '1', '41', String(Math.SQRT1_2), '41', '1', '10', '10', '20', '0', '10', '10', '20', '10', '10', '0', '20', '10'];
  const fit = ['0', 'SPLINE', '70', '0', '71', '3', '11', '0', '21', '0', '11', '5', '21', '4', '11', '10', '21', '0'];
  const poly = ['0', 'POLYLINE', '70', '1', '0', 'VERTEX', '10', '0', '20', '0', '0', 'VERTEX', '10', '4', '20', '0', '0', 'VERTEX', '10', '4', '20', '3', '0', 'SEQEND'];
  const ell = ['0', 'ELLIPSE', '10', '0', '20', '0', '11', '20', '21', '0', '40', '0.5', '41', '0', '42', String(Math.PI)];
  const es = dxfEnts(dxf([head(4), nurbs, fit, poly, ell, ['0', 'ENDSEC', '0', 'EOF']]));
  const sp = es.filter(e => e.t === 'spline');
  assert.equal(sp.length, 3);
  for (const q of sp[0].pts) assert.ok(Math.abs(Math.hypot(q[0], q[1]) - 10) < 1e-9, 'on the circle: ' + q);
  assert.deepEqual(sp[1].pts, [[0, 0], [5, 4], [10, 0]]);
  assert.equal(es.filter(e => e.t === 'line').length, 3, 'the closed polyline’s three sides');
  for (const q of sp[2].pts) assert.ok(Math.abs((q[0] / 20) ** 2 + (q[1] / 10) ** 2 - 1) < 1e-9 && q[1] > -1e-9, 'the upper half of the ellipse');
  // inches
  const inch = dxfEnts(dxf([head(1), ['0', 'CIRCLE', '10', '1', '20', '2', '40', '0.5', '0', 'ENDSEC', '0', 'EOF']]));
  assert.ok(Math.abs(inch[0].c[0] - 25.4) < 1e-9 && Math.abs(inch[0].c[1] - 50.8) < 1e-9 && Math.abs(inch[0].r - 12.7) < 1e-9);
});

test('a circle touching an ellipse, a line and a circle touching a spline part-way along it, and a text mirrored', () => {
  const fix = (e, k, at) => ({ id: sketchId('c'), t: 'fix', r: [{ e, k }], at });
  // a circle of radius 5 whose centre is held on the x axis, outside a 20 × 10 ellipse: it comes to x = 25
  let ents = [{ id: 'e', t: 'ellipse', c: [0, 0], rx: 20, ry: 10, rot: 0 }, { id: 'c', t: 'circle', c: [31, 0], r: 5 }];
  let cons = [fix('e', 'c', [0, 0]), fix('e', 'pa', [20, 0]), fix('e', 'pb', [0, 10]), { id: 'h', t: 'horizontal', r: [{ e: 'c', k: 'c' }, { e: 'origin' }] }, { id: 't', t: 'tangent', r: [{ e: 'e' }, { e: 'c' }], s: 1 }];
  let dims = [{ id: 'd', t: 'dia', r: [{ e: 'c' }], v: 10, x: '10' }];
  let r = solveSketch(ents, cons, dims);
  assert.ok(r.ok && Math.abs(ents[1].c[0] - 25) < 1e-6 && Math.abs(ents[1].c[1]) < 1e-6, 'outside: ' + JSON.stringify(ents[1]));
  // the ellipse inside a circle about (2, 0), touching it from within: the far end of the ellipse is 22 away
  ents = [{ id: 'e', t: 'ellipse', c: [0, 0], rx: 20, ry: 10, rot: 0 }, { id: 'c', t: 'circle', c: [2, 0], r: 30 }];
  cons = [fix('e', 'c', [0, 0]), fix('e', 'pa', [20, 0]), fix('e', 'pb', [0, 10]), fix('c', 'c', [2, 0]), { id: 't', t: 'tangent', r: [{ e: 'e' }, { e: 'c' }], s: -1 }];
  r = solveSketch(ents, cons, []);
  assert.ok(r.ok && Math.abs(ents[1].r - 22) < 1e-6, 'round it: ' + ents[1].r);
  // a horizontal line above a spline's hump comes down onto the top of the hump
  const hump = () => ({ id: 's', t: 'spline', pts: [[0, 0], [10, 8], [20, 0]] });
  ents = [hump(), { id: 'l', t: 'line', a: [-5, 14], b: [25, 14] }];
  cons = [0, 1, 2].map(i => fix('s', 'q' + i, ents[0].pts[i].slice())).concat({ id: 'h', t: 'horizontal', r: [{ e: 'l' }] }, { id: 't', t: 'tangent', r: [{ e: 's' }, { e: 'l' }] });
  r = solveSketch(ents, cons, []);
  const top = Math.max(...curvePts(hump(), 0.5).map(q => q[1]));
  assert.ok(r.ok && Math.abs(ents[1].a[1] - top) < 2e-3, 'on the hump’s top: ' + ents[1].a[1] + ' for ' + top);
  // a circle of radius 3 held above the hump at x = 10 sits on it
  ents = [hump(), { id: 'c', t: 'circle', c: [10, 15], r: 3 }];
  cons = [0, 1, 2].map(i => fix('s', 'q' + i, ents[0].pts[i].slice())).concat({ id: 'v', t: 'vertical', r: [{ e: 'c', k: 'c' }, { e: 's', k: 'q1' }] }, { id: 't', t: 'tangent', r: [{ e: 's' }, { e: 'c' }], s: 1 });
  r = solveSketch(ents, cons, [{ id: 'd', t: 'dia', r: [{ e: 'c' }], v: 6, x: '6' }]);
  assert.ok(r.ok && Math.abs(ents[1].c[1] - (top + 3)) < 5e-3, 'sat on the hump: ' + ents[1].c[1]);
  // a text mirrored in the y axis: placed at its reflection, turned and flipped, its letters the mirror images
  const sk = { ents: [{ id: 't', t: 'text', c: [5, 2], s: 'F', h: 10, rot: 0 }, { id: 'm', t: 'line', a: [0, -10], b: [0, 30] }], cons: [], dims: [] };
  mirrorEnts(sk, ['t'], 'm');
  const mt = sk.ents.find(e => e.t === 'text' && e.id !== 't');
  assert.ok(mt && mt.my && Math.abs(mt.c[0] + 5) < 1e-9 && Math.abs(mt.c[1] - 2) < 1e-9, JSON.stringify(mt));
  const R0 = regionsOf([sk.ents[0]]), R1 = regionsOf([mt]);
  assert.equal(R1.length, R0.length);
  assert.ok(Math.abs(Math.abs(R0[0].area) - Math.abs(R1[0].area)) < 1e-9 && Math.abs(R0[0].pt[0] + R1[0].pt[0]) < 1e-6 && Math.abs(R0[0].pt[1] - R1[0].pt[1]) < 1e-6, 'the mirror image');
  assert.ok(normEnts([mt])[0].my, 'kept in a file');
});

test('DXF: text, a block put in twice (moved, turned and scaled), and a hatch’s outlines', () => {
  const dxf = rows => rows.flat().join('\n');
  const blocks = ['0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '2', 'HOLE', '10', '0', '20', '0', '0', 'CIRCLE', '10', '0', '20', '0', '40', '2', '0', 'LINE', '10', '0', '20', '0', '11', '2', '21', '0', '0', 'ENDBLK', '0', 'ENDSEC'];
  const ents = ['0', 'SECTION', '2', 'ENTITIES',
    '0', 'TEXT', '10', '5', '20', '6', '40', '3', '1', 'JEK 42', '50', '90',
    '0', 'MTEXT', '10', '0', '20', '20', '40', '2', '1', '{\\fArial|b0;Two\\Plines}',
    '0', 'INSERT', '2', 'HOLE', '10', '10', '20', '0',
    '0', 'INSERT', '2', 'HOLE', '10', '30', '20', '0', '41', '2', '42', '2', '50', '90',
    // a hatch of two outlines: a closed polyline (a 10 × 5 box), and edges (a line and a half circle, drawn clockwise)
    '0', 'HATCH', '2', 'SOLID', '91', '2',
    '92', '2', '72', '0', '73', '1', '93', '4', '10', '0', '20', '0', '10', '10', '20', '0', '10', '10', '20', '5', '10', '0', '20', '5', '97', '0',
    '92', '1', '93', '2', '72', '1', '10', '20', '20', '0', '11', '30', '21', '0', '72', '2', '10', '25', '20', '0', '40', '5', '50', '180', '51', '360', '73', '0', '97', '0',
    '0', 'ENDSEC', '0', 'EOF'];
  const es = dxfEnts(dxf([blocks, ents]));
  const tx = es.filter(e => e.t === 'text');
  assert.deepEqual(tx.map(e => [e.s, e.h, e.rot, e.c]), [['JEK 42', 3, 90, [5, 6]], ['Two lines', 2, 0, [0, 20]]]);
  const cs = es.filter(e => e.t === 'circle');
  assert.deepEqual(cs.map(e => [e.c.map(v => +v.toFixed(6)), e.r]), [[[10, 0], 2], [[30, 0], 4]]);
  // the second block's line, turned a quarter turn and doubled: from (30, 0) up to (30, 4)
  const bl = es.filter(e => e.t === 'line' && Math.abs(e.a[0] - 30) < 1e-9 && Math.abs(e.b[0] - 30) < 1e-9);
  assert.ok(bl.some(e => Math.abs(e.b[1] - 4) < 1e-9 && Math.abs(e.a[1]) < 1e-9), 'the block’s line turned: ' + JSON.stringify(bl));
  // the hatch: the box's four sides; the line and the arc over y ≥ 0 (clockwise from 180° to 360° is the upper half)
  const R = regionsOf(es.filter(e => e.t !== 'text' && e.t !== 'circle' && !(Math.abs((e.a || [0])[0] - 30) < 1e-9 && Math.abs((e.b || [1])[0] - 30) < 1e-9) && !(e.t === 'line' && e.a[0] === 10 && e.b[0] === 12)));
  const areas = R.map(r => Math.abs(r.area)).sort((x, y) => x - y);
  assert.ok(areas.some(a => Math.abs(a - 50) < 1e-6), 'the box: ' + areas);
  assert.ok(areas.some(a => Math.abs(a - Math.PI * 25 / 2) < 0.05), 'the half disc: ' + areas);
  const arc = es.find(e => e.t === 'arc');
  assert.ok(arc && Math.abs(arc.a0) < 1e-9 && Math.abs(arc.a1 - 180) < 1e-9, 'the arc, anticlockwise: ' + JSON.stringify(arc));
});
