/* Modelled parts (core/model.js): sketches made into solids by Manifold (the vendored copy, its Node build), checked by
   volume against the shapes' own areas; the sketch's outlines (lines and arcs joined end to end, shapes inside shapes,
   the Hole tool's holes); the part placed where it was sketched and kept there when made again; shapes mirrored, turned
   and moved; lengths typed in other units; the .stl written; and a bench with a modelled part tracing it as a beam block
   with no Manifold at all. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const M = await import('../../src/core/model.js');
const { normElement, loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');          // project is reassigned as one loads: read it live
const { meshRay, parseSTL } = await import('../../src/core/stl.js');
const TR = await import('../../src/engines/trace.js');

M.setManifoldDir(new URL('../../../../assets/vendor/manifold-3d/3.5.4/', import.meta.url).href);
const W = await M.manifoldLib();
const vol = T => { let v = 0; for (let i = 0; i < T.length; i += 9) { const a = [T[i], T[i + 1], T[i + 2]], b = [T[i + 3], T[i + 4], T[i + 5]], c = [T[i + 6], T[i + 7], T[i + 8]]; v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; } return v; };
const box = T => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < T.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], T[i]); hi[k] = Math.max(hi[k], T[i]); } return { lo, hi }; };
const XY = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0] };
const sk = (id, ents, plane) => ({ id, t: 'sketch', plane: plane || XY, ents });
const build = feats => M.buildModel(W, M.normModel({ feats }));
// a circle of radius r as Manifold is given it (a polygon of that many sides): its area
const circA = (r, n) => 0.5 * n * r * r * Math.sin(2 * Math.PI / n);
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, what + ': ' + a + ' against ' + b);

test('a model as kept: bad shapes dropped, every shape given an id (none, or one that is not text, is not one), a solid without its sketch dropped', () => {
  const m = M.normModel({ feats: [sk('s1', [{ t: 'line', a: [0, 0], b: [0, 0] }, { t: 'nope' }, { t: 'circle', c: [1, 2], r: -3 }, { t: 'rect', c: [0, 0], w: 10, h: 4, rad: 9 }, { id: 7, t: 'hole', c: [0, 0], d: 3 }]),
    { t: 'extrude', sk: 's1', d: 0 }, { t: 'extrude', sk: 'gone', d: 5 }, { t: 'revolve', sk: 's1', deg: 999 }] });
  const ents = m.feats[0].ents;
  assert.deepEqual(ents.map(e => e.t), ['circle', 'rect', 'hole']);
  assert.ok(ents.every(e => typeof e.id === 'string' && e.id.length > 2), 'each has an id');
  assert.ok(ents[0].r > 0, 'a radius is never below zero');
  assert.ok(ents[1].rad < 2, 'corners no rounder than half the shorter side');
  assert.deepEqual(m.feats.map(f => f.t), ['sketch', 'extrude', 'revolve']);
  assert.equal(m.feats[1].d, 10, 'a distance of 0 is taken as the default');
  assert.equal(m.feats[2].deg, 360, 'an angle of more than a turn is a turn');
});

test('the sketch’s outlines: lines and an arc joined end to end are one loop, an open chain is counted, a shape inside a shape is one deep', () => {
  const D = M.sketchLoops([{ t: 'line', a: [0, 0], b: [10, 0] }, { t: 'arc', c: [10, 5], r: 5, a0: -90, a1: 90 }, { t: 'line', a: [10, 10], b: [0, 10] }, { t: 'line', a: [0, 10], b: [0, 0] },
    { t: 'line', a: [30, 0], b: [40, 0] }, { t: 'line', a: [40, 0], b: [40, 9] }, { t: 'rect', c: [5, 5], w: 2, h: 2, rot: 0 }].map(M.normEnt));
  assert.equal(D.loops.length, 2); assert.equal(D.open.length, 1);
  const outer = D.loops.find(q => q.ids.length === 4), inner = D.loops.find(q => q.ids.length === 1);
  near(M.loopArea(outer.pts), 100 + Math.PI * 25 / 2, 0.2, 'the D’s area');
  assert.equal(outer.depth, 0); assert.equal(inner.depth, 1);
  // construction shapes are not part of it
  assert.equal(M.sketchLoops([M.normEnt({ t: 'circle', c: [0, 0], r: 3, k: true })]).loops.length, 0);
});

test('extrudes by volume: a plate with a circle in it (a hole), a negative distance, both ways, and the Hole tool’s hole never made solid', () => {
  const plate = [{ t: 'rect', c: [0, 0], w: 40, h: 20, rot: 0 }, { t: 'circle', c: [10, 0], r: 4 }];
  let r = build([sk('s', plate), { t: 'extrude', sk: 's', d: 5 }]);
  const n = M.normEnt({ t: 'circle', c: [0, 0], r: 4 });
  near(vol(r.T), (800 - circA(4, M.entOutline(n).length)) * 5, 0.05, 'plate with a hole');
  assert.deepEqual(r.errors, []);
  let b = box(r.T); near(b.lo[2], 0, 1e-6, 'from its sketch'); near(b.hi[2], 5, 1e-6, 'up to its distance');
  r = build([sk('s', plate), { t: 'extrude', sk: 's', d: -5 }]); b = box(r.T); near(b.hi[2], 0, 1e-6, 'a negative distance goes the other way'); near(b.lo[2], -5, 1e-6, '...as far');
  r = build([sk('s', plate), { t: 'extrude', sk: 's', d: 6, both: true }]); b = box(r.T); near(b.lo[2], -3, 1e-6, 'both ways: half each'); near(b.hi[2], 3, 1e-6, 'both ways');
  // holes outside the rectangle stay holes (not pins), and one inside it is a hole in it
  r = build([sk('s', [{ t: 'rect', c: [0, 0], w: 40, h: 20, rot: 0 }, { t: 'hole', c: [0, 0], d: 6.6 }, { t: 'hole', c: [60, 0], d: 6.6 }]), { t: 'extrude', sk: 's', d: 5 }]);
  const hn = M.entOutline(M.normEnt({ t: 'hole', c: [0, 0], d: 6.6 })).length;
  near(vol(r.T), (800 - circA(3.3, hn)) * 5, 0.05, 'the plate, its hole taken out and the hole outside it made nothing');
  assert.ok(box(r.T).hi[0] < 21, 'no pin out at x = 60');
});

test('cuts: holes alone on a face drill it, through all goes right through, a cut with nothing before it says so', () => {
  const base = [sk('s', [{ t: 'rect', c: [0, 0], w: 40, h: 20, rot: 0 }]), { t: 'extrude', sk: 's', d: 8 }];
  const hn = M.entOutline(M.normEnt({ t: 'hole', c: [0, 0], d: 4 })).length;
  // two holes sketched on the top face, cut 3 mm down into it
  let r = build([...base, sk('t', [{ t: 'hole', c: [-10, 0], d: 4 }, { t: 'hole', c: [10, 0], d: 4 }], { o: [0, 0, 8], x: [1, 0, 0], y: [0, 1, 0] }), { t: 'extrude', sk: 't', d: -3, op: 'cut' }]);
  near(vol(r.T), 800 * 8 - 2 * circA(2, hn) * 3, 0.05, 'two blind holes');
  // through all: whichever way, all through
  r = build([...base, sk('t', [{ t: 'hole', c: [0, 0], d: 4 }], { o: [0, 0, 8], x: [1, 0, 0], y: [0, 1, 0] }), { t: 'extrude', sk: 't', d: 1, op: 'cut', through: true }]);
  near(vol(r.T), 800 * 8 - circA(2, hn) * 8, 0.05, 'a hole right through');
  r = build([sk('s', [{ t: 'circle', c: [0, 0], r: 3 }]), { t: 'extrude', sk: 's', d: 5, op: 'cut' }]);
  assert.equal(r.n, 0); assert.match(r.errors[0][1], /nothing before it to cut/);
  r = build([sk('s', [{ t: 'line', a: [0, 0], b: [5, 0] }]), { t: 'extrude', sk: 's', d: 5 }]);
  assert.match(r.errors[0][1], /no closed shape/);
});

test('revolves: a ring about a construction line (by volume), half a turn half of it, the profile on either side of the axis, an axis that is not there said so', () => {
  const ents = [{ id: 'ax', t: 'line', a: [0, 0], b: [0, 10], k: true }, { t: 'rect', c: [11.5, 5], w: 3, h: 10, rot: 0 }];
  const front = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 0, 1] };
  let r = build([sk('s', ents, front), { t: 'revolve', sk: 's', axis: 'ax', deg: 360 }]);
  near(vol(r.T), Math.PI * (13 * 13 - 10 * 10) * 10, 15, 'a ring 10 to 13 mm, 10 high');
  let b = box(r.T); near(b.hi[2], 10, 1e-6, 'along its axis, up'); near(b.hi[0], 13, 0.01, 'out to its radius');
  const full = vol(r.T);
  r = build([sk('s', ents, front), { t: 'revolve', sk: 's', axis: 'ax', deg: 180 }]);
  near(vol(r.T), full / 2, full * 0.01, 'half a turn');
  r = build([sk('s', [ents[0], { t: 'rect', c: [-11.5, 5], w: 3, h: 10, rot: 0 }], front), { t: 'revolve', sk: 's', axis: 'ax', deg: 360 }]);
  near(vol(r.T), full, full * 0.001, 'the profile on the axis’s other side');
  r = build([sk('s', ents, front), { t: 'revolve', sk: 's', axis: 'zz', deg: 360 }]);
  assert.match(r.errors[0][1], /axis/);
});

test('a new part where it was sketched: placed at its box’s middle, a ray stopped on its face, and made again (turned, taller) its base kept on the table', () => {
  const el = normElement(M.newModelPart({ o: [100, 50, 0], x: [1, 0, 0], y: [0, 1, 0] }, [{ t: 'rect', c: [0, 0], w: 20, h: 10, rot: 0 }], { t: 'extrude', d: 30 }));
  assert.equal(el.type, 'stl'); assert.ok(el.model, 'it keeps its model');
  const r = M.rebuildPart(W, el);
  assert.ok(r.ok); assert.deepEqual([el.x, el.y, el.z], [100, 50, 15]); assert.deepEqual(el.model.c, [0, 0, 15]);
  near(meshRay(el, [0, 50, 10], [1, 0, 0], 0), 90, 1e-3, 'a ray along x meets its face at x = 90');
  el.angle = 90; el.model.feats[1].d = 40; M.rebuildPart(W, el);
  near(el.z, 20, 1e-9, 'taller, its base still on the table');
  // its own frame and the bench: there and back
  const p = M.modelToWorld(el, [3, -4, 5]), q = M.worldToModel(el, p);
  q.forEach((v, i) => near(v, [3, -4, 5][i], 1e-9, 'there and back'));
  // a sketch on it: the plane into its frame and back
  const P = M.planeToModel(el, { o: [100, 50, 40], x: [0, 1, 0], y: [0, 0, 1] }), P2 = M.planeToWorld(el, P);
  P2.o.forEach((v, i) => near(v, [100, 50, 40][i], 1e-9, 'the plane’s origin'));
});

test('an extrude made longer: the sketch on its end (a boss on its top face) moves with it, and what is on that one too', () => {
  const model = M.normModel({ feats: [sk('a', [{ t: 'rect', c: [0, 0], w: 40, h: 30, rot: 0 }]), { id: 'e1', t: 'extrude', sk: 'a', d: 8 },
    sk('b', [{ t: 'circle', c: [5, 5], r: 3 }], { o: [0, 0, 8], x: [1, 0, 0], y: [0, 1, 0] }), { id: 'e2', t: 'extrude', sk: 'b', d: 6 },
    sk('c', [{ t: 'circle', c: [5, 5], r: 1 }], { o: [0, 0, 14], x: [1, 0, 0], y: [0, 1, 0] }), { id: 'e3', t: 'extrude', sk: 'c', d: 2 },
    sk('d', [{ t: 'circle', c: [-10, 0], r: 2 }], { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0] }), { id: 'e4', t: 'extrude', sk: 'd', d: -3 }] });
  M.extrudeTo(model, 'e1', 10);
  const P = id => model.feats.find(f => f.id === id).plane.o[2];
  assert.equal(P('b'), 10, 'the boss\u2019s sketch on the top face, moved up with it');
  assert.equal(P('c'), 16, 'and the sketch on the boss\u2019s top, as much again');
  assert.equal(P('d'), 0, 'a sketch on the bottom face stays');
  const r = M.buildModel(W, model); near(box(r.T).hi[2], 18, 1e-6, 'all of it 2 mm taller');
});

test('shapes mirrored, turned and moved: an arc stays an arc the right way round, a rectangle and a polygon keep their turn', () => {
  const arc = M.normEnt({ t: 'arc', c: [5, 0], r: 2, a0: 0, a1: 90 });
  const m = M.entMap(arc, M.mirrorMap([0, 0], [0, 1]));
  near(m.c[0], -5, 1e-9, 'mirrored across x = 0'); near(m.a0, 90, 1e-9, 'its start'); near(m.a1, 180, 1e-9, 'its end');
  const rect = M.normEnt({ t: 'rect', c: [10, 0], w: 4, h: 2, rot: 10 });
  const t = M.entMap(rect, M.turnMap([0, 0], 90)); near(t.c[0], 0, 1e-9, 'turned about the origin'); near(t.c[1], 10, 1e-9, 'a quarter turn'); near(t.rot, 100, 1e-9, 'its own turn');
  const r = M.entMap(rect, M.mirrorMap([0, 0], [1, 1])); near(r.rot, 80, 1e-9, 'mirrored across y = x: 90 less its turn');
  const mv = M.entMap(M.normEnt({ t: 'slot', a: [0, 0], b: [10, 0], r: 2 }), M.moveMap(3, 4)); assert.deepEqual(mv.a, [3, 4]); assert.deepEqual(mv.b, [13, 4]);
  assert.notEqual(mv.id, 'x', 'a copy is a new shape');
});

test('lengths typed: millimetres unless said, inches and centimetres; not a length, null', () => {
  assert.equal(M.parseLength('3'), 3); assert.equal(M.parseLength('1in'), 25.4); assert.equal(M.parseLength('0.5"'), 12.7); assert.equal(M.parseLength('2.5 cm'), 25);
  assert.equal(M.parseLength('-4 mm'), -4); assert.equal(M.parseLength('ten'), null);
  assert.ok(M.HOLE_SIZES.every(([n, d]) => typeof n === 'string' && d > 1 && d < 10), 'the usual holes, in mm');
});

test('the part as a .stl file: its triangles, read back as written', () => {
  const r = build([sk('s', [{ t: 'rect', c: [0, 0], w: 10, h: 10, rot: 0 }]), { t: 'extrude', sk: 's', d: 2 }]);
  const bytes = M.stlBytes(r.T, 'Plate');
  assert.equal(bytes.length, 84 + 50 * r.n);
  const T = parseSTL(bytes);
  assert.equal(T.length, r.T.length); near(vol(T), 200, 1e-3, 'its volume');
});

test('a bench with a modelled part traces it as a beam block, with no Manifold at all', () => {
  const el = normElement(M.newModelPart({ o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0] }, [{ t: 'rect', c: [0, 0], w: 4, h: 40, rot: 0 }], { t: 'extrude', d: 150 }));
  M.rebuildPart(W, el);
  const saved = JSON.parse(JSON.stringify(Object.assign({}, el, { name: 'Wall', id: 'W' })));
  loadProject({ format: 'jekray', version: 1, elements: [{ type: 'source', id: 'S', name: 'Laser', x: -60, y: 0, angle: 0, wavelength: 633, width: 2, rays: 5 }, saved, { type: 'screen', id: 'A', name: 'Screen', x: 60, y: 0, angle: 180, length: 40 }] });
  const W2 = ST.project.elements.find(e => e.id === 'W');
  assert.ok(W2.model && W2.mesh && W2.mesh.n > 0, 'it loads with its model and its triangles');
  TR.setLastTraceKey(null); TR.traceScene();
  const hits = (TR.lastTrace.screens.A || []).filter(t => !t.chief);
  assert.equal(hits.length, 0, 'the wall stops the beam');
});
