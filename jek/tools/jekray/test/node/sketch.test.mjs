/* The parametric sketch (core/sketch.js): constraints and dimensions kept by its solver (a rectangle drawn roughly made
   square and sized; a dimension changed; fully defined only once tied to the origin; a constraint that conflicts
   refused; tangency, a fillet's ends), and its regions (the plane cut by every curve, lines across shapes included),
   chosen by a point in each and made into solids (core/model.js) by volume. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const S = await import('../../src/core/sketch.js');
const M = await import('../../src/core/model.js');
M.setManifoldDir(new URL('../../../../assets/vendor/manifold-3d/3.5.4/', import.meta.url).href);
const W = await M.manifoldLib();
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, what + ': ' + a + ' against ' + b);
const L = (id, a, b, k) => M.normEnt({ id, t: 'line', a, b, k });
const C = (t, ...r) => ({ t, r });
const vol = T => { let v = 0; for (let i = 0; i < T.length; i += 9) { const a = [T[i], T[i + 1], T[i + 2]], b = [T[i + 3], T[i + 4], T[i + 5]], c = [T[i + 6], T[i + 7], T[i + 8]]; v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; } return v; };
// a rectangle as a CAD program draws one: four lines, their corners coincident, two horizontal and two vertical
function rectangle(jitter) {
  const j = jitter ? 1 : 0;
  const ents = [L('l1', [0, 0], [10.3 * j || 10, 0.4 * j]), L('l2', [10.3 * j || 10, 0.4 * j], [10, 5.2 * j || 5]), L('l3', [10, 5.2 * j || 5], [-0.2 * j, 5]), L('l4', [-0.2 * j, 5], [0, 0])];
  const cons = S.normCons([C('coincident', { e: 'l1', k: 'b' }, { e: 'l2', k: 'a' }), C('coincident', { e: 'l2', k: 'b' }, { e: 'l3', k: 'a' }), C('coincident', { e: 'l3', k: 'b' }, { e: 'l4', k: 'a' }), C('coincident', { e: 'l4', k: 'b' }, { e: 'l1', k: 'a' }),
    C('horizontal', { e: 'l1' }), C('horizontal', { e: 'l3' }), C('vertical', { e: 'l2' }), C('vertical', { e: 'l4' })], ents);
  return { ents, cons };
}

test('a rectangle drawn roughly: its constraints and two dimensions make it square and sized; fully defined only once a corner is at the origin', () => {
  const { ents, cons } = rectangle(true), dims = S.normDims([{ t: 'len', r: [{ e: 'l1' }], v: 40 }, { t: 'len', r: [{ e: 'l2' }], v: 20 }], ents);
  const r = S.solveSketch(ents, cons, dims);
  assert.ok(r.ok, 'solved');
  const len = e => Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
  near(len(ents[0]), 40, 1e-7, 'its width'); near(len(ents[1]), 20, 1e-7, 'its height'); near(ents[0].a[1], ents[0].b[1], 1e-9, 'its bottom level');
  near(ents[1].a[0], ents[1].b[0], 1e-9, 'its side upright'); near(ents[0].b[0], ents[1].a[0], 1e-9, 'its corner shared');
  assert.equal(S.definedEnts(ents, cons, dims).size, 0, 'free to move: not fully defined');
  cons.push(...S.normCons([C('coincident', { e: 'l1', k: 'a' }, { e: 'origin' })], ents));
  S.solveSketch(ents, cons, dims);
  assert.equal(S.definedEnts(ents, cons, dims).size, 4, 'a corner at the origin: all four lines fully defined');
  // a dimension changed: the far side moves, the corner at the origin stays
  dims[0].v = 55; assert.ok(S.solveSketch(ents, cons, dims).ok);
  near(ents[0].b[0], 55, 1e-7, 'the far corner'); near(ents[0].a[0], 0, 1e-9, 'the corner at the origin');
});

test('a constraint that conflicts cannot be met: the solver says so (and the sketch’s own copy is left to be put back)', () => {
  const { ents, cons } = rectangle(false), dims = S.normDims([{ t: 'len', r: [{ e: 'l1' }], v: 40 }], ents);
  const bad = cons.concat(S.normCons([C('vertical', { e: 'l1' })], ents));
  const r = S.solveSketch(ents, bad, dims);
  assert.equal(r.ok, false); assert.ok(r.err > 1, 'left far from holding');
});

test('tangency, equal, midpoint, symmetric and an angle, each held by the solver', () => {
  const { ents, cons } = rectangle(false);
  ents.push(M.normEnt({ id: 'c1', t: 'circle', c: [20, 8], r: 3 }), M.normEnt({ id: 'c2', t: 'circle', c: [-5, 9], r: 1 }), M.normEnt({ id: 'p', t: 'point', c: [3, 1] }), L('x', [2, 2], [7, 4]), L('y', [1, -3], [3, -8]));
  const more = S.normCons([C('coincident', { e: 'l1', k: 'a' }, { e: 'origin' }), C('tangent', { e: 'l1' }, { e: 'c1' }), C('equal', { e: 'c1' }, { e: 'c2' }), C('midpoint', { e: 'p', k: 'c' }, { e: 'l3' }),
    C('symmetric', { e: 'x', k: 'a' }, { e: 'x', k: 'b' }, { e: 'l2' })], ents);
  const dims = S.normDims([{ t: 'len', r: [{ e: 'l1' }], v: 30 }, { t: 'len', r: [{ e: 'l2' }], v: 12 }, { t: 'rad', r: [{ e: 'c1' }], v: 4 }, { t: 'ang', r: [{ e: 'l1' }, { e: 'y' }], v: 60 }], ents);
  const all = cons.concat(more), r = S.solveSketch(ents, all, dims);
  assert.ok(r.ok, 'solved: ' + r.err);
  const E = new Map(ents.map(e => [e.id, e]));
  near(E.get('c1').c[1], 4, 1e-6, 'the circle tangent to the bottom, its radius above it');
  near(E.get('c2').r, 4, 1e-6, 'equal radii');
  near(E.get('p').c[0], 15, 1e-6, 'the point at the top’s middle (across)'); near(E.get('p').c[1], 12, 1e-6, '(and up)');
  near((E.get('x').a[0] + E.get('x').b[0]) / 2, 30, 1e-6, 'the line’s ends symmetric about the right side');
  const y = E.get('y'); near(Math.abs(Math.atan2(y.b[1] - y.a[1], y.b[0] - y.a[0]) * 180 / Math.PI), 60, 1e-4, 'sixty degrees from the bottom');
});

test('a fillet’s arc tangent at its ends to both lines is fully defined (its tangency at the end, not the distance form)', () => {
  const ents = [L('h', [0, 10], [6, 10]), L('v', [10, 6], [10, 0]), M.normEnt({ id: 'a', t: 'arc', c: [6, 6], r: 4, a0: 0, a1: 90 })];
  const cons = S.normCons([C('fix', { e: 'h', k: 'a' }), C('fix', { e: 'v', k: 'b' }), C('horizontal', { e: 'h' }), C('vertical', { e: 'v' }),
    C('coincident', { e: 'h', k: 'b' }, { e: 'a', k: 'p1' }), C('coincident', { e: 'v', k: 'a' }, { e: 'a', k: 'p0' }),
    Object.assign(C('tangent', { e: 'h' }, { e: 'a' }), { at: 'p1' }), Object.assign(C('tangent', { e: 'v' }, { e: 'a' }), { at: 'p0' })], ents);
  cons.forEach(c => { if (c.t === 'fix') c.at = c.r[0].k === 'a' ? [0, 10] : [10, 0]; });
  const dims = S.normDims([{ t: 'rad', r: [{ e: 'a' }], v: 4 }], ents);
  assert.equal(cons.filter(c => c.at === 'p0' || c.at === 'p1').length, 2, 'the tangencies keep where they hold');
  assert.ok(S.solveSketch(ents, cons, dims).ok);
  assert.equal(S.definedEnts(ents, cons, dims).size, 3, 'both lines and the arc fully defined');
});

test('constraints and dimensions kept with a sketch: through a model’s checks, those naming a shape not there dropped', () => {
  const m = M.normModel({ feats: [{ id: 's', t: 'sketch', plane: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0] }, ents: [{ id: 'a', t: 'line', a: [0, 0], b: [5, 0] }],
    cons: [{ t: 'horizontal', r: [{ e: 'a' }] }, { t: 'horizontal', r: [{ e: 'gone' }] }, { t: 'nonsense', r: [{ e: 'a' }] }], dims: [{ t: 'len', r: [{ e: 'a' }], v: 5 }, { t: 'len', r: [{ e: 'zz' }], v: 5 }] }] });
  const sk = m.feats[0];
  assert.deepEqual(sk.cons.map(c => c.t), ['horizontal']); assert.deepEqual(sk.dims.map(d => d.t + d.v), ['len5']);
  // a sketch saved before constraints has none, and is as it was
  const old = M.normModel({ feats: [{ id: 's', t: 'sketch', plane: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0] }, ents: [{ id: 'a', t: 'line', a: [0, 0], b: [5, 0] }] }] });
  assert.equal(old.feats[0].cons, undefined); assert.equal(old.feats[0].dims, undefined);
});

test('regions: a line across a rectangle cuts it in two, a circle in it is its own region (and a hole in its half), two circles that overlap make three', () => {
  const ents = [M.normEnt({ t: 'rect', c: [0, 0], w: 40, h: 20, rot: 0 }), M.normEnt({ t: 'line', a: [0, -15], b: [0, 15] }), M.normEnt({ t: 'circle', c: [10, 0], r: 3 })];
  const R = S.sketchRegions(ents, M.entOutline).sort((a, b) => a.area - b.area);
  assert.equal(R.length, 3);
  const disc = M.loopArea(M.entOutline(ents[2]));
  near(R[0].area, disc, 1e-6, 'the disc'); near(R[1].area, 400 - disc, 1e-6, 'its half, round the hole'); near(R[2].area, 400, 1e-6, 'the other half');
  assert.ok(R.every(q => S.inRegion(q, q.pt)), 'each one’s point is inside it');
  const two = S.sketchRegions([M.normEnt({ t: 'circle', c: [0, 0], r: 5 }), M.normEnt({ t: 'circle', c: [6, 0], r: 5 })], M.entOutline);
  assert.equal(two.length, 3, 'two crescents and the lens between');
  // construction shapes and points cut nothing
  assert.equal(S.sketchRegions([M.normEnt({ t: 'circle', c: [0, 0], r: 5 }), M.normEnt({ t: 'line', a: [-9, 0], b: [9, 0], k: true }), M.normEnt({ t: 'point', c: [1, 1] })], M.entOutline).length, 1);
});

test('an extrude of the regions chosen: by default the closed shapes as before; chosen, any of them, by a point in each', () => {
  const ents = [{ id: 'r', t: 'rect', c: [0, 0], w: 40, h: 20, rot: 0 }, { id: 'x', t: 'line', a: [0, -15], b: [0, 15] }, { id: 'c', t: 'circle', c: [10, 0], r: 3 }];
  const sk = { id: 's', t: 'sketch', plane: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0] }, ents };
  const disc = M.loopArea(M.entOutline(M.normEnt(ents[2])));
  let r = M.buildModel(W, M.normModel({ feats: [sk, { t: 'extrude', sk: 's', d: 2 }] }));
  near(vol(r.T), (800 - disc) * 2, 0.02, 'as before: the rectangle, the circle a hole in it (the line across it no matter)');
  r = M.buildModel(W, M.normModel({ feats: [sk, { t: 'extrude', sk: 's', d: 2, regions: [[-10, 0]] }] }));
  near(vol(r.T), 400 * 2, 0.02, 'the left half alone');
  r = M.buildModel(W, M.normModel({ feats: [sk, { t: 'extrude', sk: 's', d: 2, regions: [[-10, 0], [15, 5], [10, 0]] }] }));
  near(vol(r.T), 800 * 2, 0.05, 'all three: the whole rectangle, the disc filled');
  r = M.buildModel(W, M.normModel({ feats: [sk, { t: 'extrude', sk: 's', d: 2, regions: [[500, 500]] }] }));
  assert.equal(r.n, 0); assert.match(r.errors[0][1], /regions it was made of are gone/);
});

test('a dimension measures what it names (to start one at its present size)', () => {
  const { ents } = rectangle(false);
  near(S.dimMeasure(ents, { t: 'len', r: [{ e: 'l1' }] }), 10, 1e-9, 'a length');
  near(S.dimMeasure(ents, { t: 'dist', r: [{ e: 'l1', k: 'a' }, { e: 'l2', k: 'b' }] }), Math.hypot(10, 5), 1e-9, 'between two points');
  near(Math.abs(S.dimMeasure(ents, { t: 'pl', r: [{ e: 'l3', k: 'a' }, { e: 'l1' }] })), 5, 1e-9, 'a point from a line');
  near(Math.abs(S.dimMeasure(ents, { t: 'ang', r: [{ e: 'l1' }, { e: 'l2' }] })), 90, 1e-9, 'an angle');
});
