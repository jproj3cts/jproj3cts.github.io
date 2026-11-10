/* Mates (core/mates.js): a part's pose as a matrix and back; faces found in a mesh's triangles (a box's flat faces, a
   cylinder's axis and radius, a straight edge); a face-to-face mate putting the second part flush against the first, its
   flip, a distance and an angle; concentric round faces on one axis; mated parts moving together; and a mate kept
   through save and load. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject, serialize } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');          // project is reassigned as one loads: read it live
const { meshEncode } = await import('../../src/core/stl.js');
const M = await import('../../src/core/mates.js');

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, what + ': ' + a + ' against ' + b);
const nearV = (a, b, tol, what) => a.forEach((v, i) => near(v, b[i], tol, what + '[' + i + ']'));
// a box's triangles, centred (each face two triangles, wound outwards)
function boxTris(sx, sy, sz) {
  const x = sx / 2, y = sy / 2, z = sz / 2, out = [];
  const quad = (a, b, c, d) => out.push(...a, ...b, ...c, ...a, ...c, ...d);
  quad([x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]); quad([-x, y, -z], [-x, -y, -z], [-x, -y, z], [-x, y, z]);
  quad([x, y, -z], [-x, y, -z], [-x, y, z], [x, y, z]); quad([-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]);
  quad([-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]); quad([-x, y, -z], [x, y, -z], [x, -y, -z], [-x, -y, -z]);
  return new Float32Array(out);
}
// a closed cylinder along z, radius r, length L, n sides
function cylTris(r, L, n) {
  const out = [], z = L / 2;
  for (let i = 0; i < n; i++) {
    const a0 = 2 * Math.PI * i / n, a1 = 2 * Math.PI * (i + 1) / n, p = a => [r * Math.cos(a), r * Math.sin(a)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    out.push(x0, y0, -z, x1, y1, -z, x1, y1, z, x0, y0, -z, x1, y1, z, x0, y0, z);
    out.push(0, 0, z, x0, y0, z, x1, y1, z, 0, 0, -z, x1, y1, -z, x0, y0, -z);
  }
  return new Float32Array(out);
}
const stl = (id, T, pose) => Object.assign({ type: 'stl', id, name: id, x: 0, y: 0, angle: 0, units: 'mm', mesh: meshEncode(T, id + '.stl') }, pose);
const bench = (els, mates) => loadProject({ format: 'jekray', version: 1, elements: els, ...(mates ? { mates } : {}) });
const el = name => ST.project.elements.find(e => e.name === name);
// the triangle of a mesh whose normal is nearest n (its index, and its middle)
function triFacing(T, n) {
  let best = -1, bd = -2, mid = null;
  for (let t = 0; t < T.length / 9; t++) {
    const a = [T[9 * t], T[9 * t + 1], T[9 * t + 2]], b = [T[9 * t + 3], T[9 * t + 4], T[9 * t + 5]], c = [T[9 * t + 6], T[9 * t + 7], T[9 * t + 8]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...cr);
    const d = (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2]) / l;
    if (d > bd) { bd = d; best = t; mid = [0, 1, 2].map(k => (a[k] + b[k] + c[k]) / 3); }
  }
  return { t: best, q: mid };
}
const faceOf = (e, n) => { const T = M.partTris(e), { t, q } = triFacing(T, n); return M.meshFeature(T, t, q); };

test('a pose as a matrix and back: angle, tip and roll found again, and a matrix turned as the trace turns a point', () => {
  for (const [a, t, r] of [[0, 0, 0], [30, 10, 5], [-170, -45, 120], [90, 89, -60], [12.5, -3, 179]]) {
    const e = { type: 'mirror', x: 0, y: 0, angle: a, tip: t, roll: r };
    const [a2, t2, r2] = M.poseAngles(M.poseRot(e));
    near(a2, a, 1e-9, 'angle'); near(t2, t, 1e-9, 'tip'); near(r2, r, 1e-9, 'roll');
  }
  // the part's own +x is the way it faces: its angle across, its tip up
  const R = M.poseRot({ angle: 90, tip: 30 }), f = R.map(row => row[0]);
  nearV(f, [0, Math.cos(Math.PI / 6), 0.5], 1e-12, 'facing');
});

test('faces in a mesh: a box’s flat face (its middle and outward normal), a cylinder’s axis and radius, a straight edge', () => {
  const B = boxTris(20, 10, 6);
  const { t, q } = triFacing(B, [1, 0, 0]), F = M.meshFeature(B, t, q);
  assert.equal(F.k, 'plane'); nearV(F.d, [1, 0, 0], 1e-6, 'normal'); near(F.p[0], 10, 1e-6, 'on the face'); near(F.p[1], 0, 1e-6, 'its middle');
  assert.equal(F.tris.length, 2, 'both triangles of the face');
  const C = cylTris(5, 30, 48), side = triFacing(C, [Math.cos(0.07), Math.sin(0.07), 0]), A = M.meshFeature(C, side.t, side.q);
  assert.equal(A.k, 'axis', 'the side is a round face');
  near(Math.abs(A.d[2]), 1, 1e-6, 'its axis along z'); near(Math.hypot(A.p[0], A.p[1]), 0, 1e-4, 'through the middle'); near(A.r, 5, 1e-3, 'its radius');
  assert.ok(A.tris.length >= 90, 'the whole side: ' + A.tris.length);
  // the cylinder's end is flat
  const end = triFacing(C, [0, 0, 1]), E = M.meshFeature(C, end.t, end.q);
  assert.equal(E.k, 'plane'); nearV(E.d, [0, 0, 1], 1e-6, 'the end');
  // pressed beside the box's edge (x = 10, z = 3): the edge, along y, its whole length
  const top = triFacing(B, [0, 0, 1]), G = M.meshFeature(B, top.t, [9.9, 0, 3], { edgeTol: 0.3 });
  assert.equal(G.k, 'edge'); near(Math.abs(G.d[1]), 1, 1e-6, 'along y'); near(G.len, 10, 1e-4, 'its length'); nearV(G.p, [10, 0, 3], 1e-4, 'its middle');
  // a sphere's facet is neither flat nor round
  assert.ok(!M.meshFeature(new Float32Array(0), 0, [0, 0, 0]).k);
});

test('a face-to-face mate: the second part turned and moved so its face lies flush on the first’s, facing it; flip, distance and angle', () => {
  bench([stl('A', boxTris(20, 10, 6), { x: 0, y: 0, z: 50 }), stl('B', boxTris(8, 8, 8), { x: 40, y: 15, z: 70, angle: 30, tip: 10, roll: 5 })]);
  const A = el('A'), B = el('B');
  const fa = M.featKeep(faceOf(A, [1, 0, 0])), fb = M.featKeep(faceOf(B, [0, 1, 0]));
  const r = M.mateAdd({ type: 'coincident', a: { el: 'A', f: fa }, b: { el: 'B', f: fb } });
  assert.ok(!r.error, r.error);
  const wa = M.featWorld(A, fa), wb = M.featWorld(B, fb);
  nearV(wb.d, [-1, 0, 0], 1e-9, 'B’s face turned to face A');
  near(wb.p[0], 10, 1e-6, 'on A’s face plane (x = 10)');
  nearV(wa.p, [10, 0, 50], 1e-9, 'A has not moved');
  const res = M.mateResidual(r.mate); near(res.ang, 0, 1e-9, 'met: turn'); near(res.dist, 0, 1e-6, 'met: move');
  // B's centre is half its width out from A's face, level with B's face point
  near(B.x, 14, 1e-6, 'B’s middle 4 mm out');
  // flipped: facing the same way (B's face against A's, but turned through)
  const m = r.mate; m.flip = true; assert.ok(!M.mateRun(m).error);
  nearV(M.featWorld(B, fb).d, [1, 0, 0], 1e-9, 'flipped'); near(B.x, 6, 1e-6, 'B now inside A’s face, its back to it');
  delete m.flip;
  // a distance: 12 mm apart
  m.type = 'distance'; m.offset = 12; assert.ok(!M.mateRun(m).error);
  near(M.featWorld(B, fb).p[0], 22, 1e-6, '12 mm off A’s face'); near(B.x, 26, 1e-6, '...and its middle 4 more');
  // an angle: the normals 90° apart
  m.type = 'angle'; m.angle = 90; delete m.offset; assert.ok(!M.mateRun(m).error);
  near(M.featWorld(B, fb).d[0] * M.featWorld(A, fa).d[0], 0, 1e-9, 'square to it');
});

test('concentric: a tipped shaft turned onto the other’s axis, its own axis kept in line through a move of the first', () => {
  bench([stl('Tube', cylTris(6, 40, 48), { x: 0, y: 0, z: 60, angle: 10 }), stl('Pin', cylTris(3, 20, 32), { x: 25, y: -12, z: 80, angle: 40, tip: 20 })]);
  const A = el('Tube'), B = el('Pin');
  const side = (e, n) => { const T = M.partTris(e), s = triFacing(T, n); return M.featKeep(M.meshFeature(T, s.t, s.q)); };
  const fa = side(A, [1, 0, 0]), fb = side(B, [1, 0, 0]);
  assert.equal(fa.k, 'axis'); assert.equal(fb.k, 'axis');
  const r = M.mateAdd({ type: 'concentric', a: { el: 'Tube', f: fa }, b: { el: 'Pin', f: fb } });
  assert.ok(!r.error, r.error);
  const wa = M.featWorld(A, fa), wb = M.featWorld(B, fb);
  near(Math.abs(wa.d[2]), 1, 1e-9, 'the tube stands up (its axis its own z)'); near(Math.abs(wb.d[0] * wa.d[0] + wb.d[1] * wa.d[1] + wb.d[2] * wa.d[2]), 1, 1e-9, 'axes parallel');
  near(Math.hypot(wb.p[0] - wa.p[0], wb.p[1] - wa.p[1]), 0, 1e-5, 'on one axis (x, y)');
  near(Math.hypot(B.x, B.y), 0, 1e-5, 'the pin’s middle on the tube’s axis');
  // concentric needs round faces
  assert.match(M.mateSolve({ type: 'concentric' }, { k: 'plane', p: [0, 0, 0], d: [0, 0, 1] }, wb).error, /round faces/);
  // the tube moved and turned by itself (as its panel does): the pin goes with it
  const H = M.mateHold(A); A.x += 10; A.angle = 25; M.mateFollow(H);
  const r2 = M.mateResidual(r.mate); near(r2.ang, 0, 1e-9, 'still in line'); near(r2.dist, 0, 1e-6, 'still on its axis');
  assert.deepEqual(M.mateSpread([A]).map(e => e.name).sort(), ['Pin', 'Tube'], 'they move as one');
});

test('a mate kept through save and load: the same faces, still met; a part deleted takes its mates; a locked part is refused', () => {
  bench([stl('A', boxTris(20, 10, 6), { z: 50 }), stl('B', boxTris(8, 8, 8), { x: 40, z: 70, angle: 20 }), stl('C', boxTris(4, 4, 4), { x: -30, z: 30 })]);
  const fa = M.featKeep(faceOf(el('A'), [0, 0, 1])), fb = M.featKeep(faceOf(el('B'), [0, 0, -1]));
  const r = M.mateAdd({ type: 'distance', offset: 2.5, flip: false, a: { el: 'A', f: fa }, b: { el: 'B', f: fb } });
  assert.ok(!r.error, r.error);
  near(el('B').z, 50 + 3 + 2.5 + 4, 1e-6, 'B sits 2.5 mm over A’s top');
  const text = JSON.stringify(serialize());
  bench([]);
  loadProject(JSON.parse(text));
  assert.equal(ST.project.mates.length, 1);
  const m = ST.project.mates[0];
  assert.equal(m.type, 'distance'); assert.equal(m.offset, 2.5); assert.equal(m.a.el, 'A'); assert.deepEqual(m.b.f, fb);
  const res = M.mateResidual(m); near(res.dist, 0, 1e-6, 'met after loading');
  assert.equal(M.matesOf(el('A')).length, 1); assert.equal(M.matesOf(el('C')).length, 0);
  // a file without mates, or with one naming a part that is not there, loads
  assert.deepEqual(loadProject({ format: 'jekray', version: 1, elements: [stl('A', boxTris(2, 2, 2))], mates: [{ type: 'coincident', a: { el: 'A', f: fa }, b: { el: 'nope', f: fb } }, { type: 'odd' }] }).mates, []);
  // a part deleted: its mate is no longer live (nor saved)
  loadProject(JSON.parse(text));
  ST.project.elements = ST.project.elements.filter(e => e.name !== 'B');
  assert.equal(M.liveMates().length, 0); assert.ok(!('mates' in serialize()));
  // a part locked in place is not moved to meet a mate
  loadProject(JSON.parse(text)); ST.project.mates = [];
  el('C').locked = true;
  const fc = M.featKeep(faceOf(el('C'), [0, 0, -1]));
  assert.match(M.mateAdd({ type: 'coincident', a: { el: 'A', f: fa }, b: { el: 'C', f: fc } }).error, /locked/);
});

test('several parts turned together about their middle keep their places against each other', () => {
  bench([stl('A', boxTris(4, 4, 4), { x: 10, y: 0, z: 50 }), stl('B', boxTris(4, 4, 4), { x: -10, y: 0, z: 50, angle: 15, tip: 5 })]);
  const els = [el('A'), el('B')], c = M.poseMiddle(els);
  nearV(c, [0, 0, 50], 1e-12, 'their middle');
  M.poseTurn(els, els.map(M.poseSnap), [0, 0, 1], 90, c);
  near(el('A').x, 0, 1e-6, 'A turned round'); near(el('A').y, 10, 1e-6, '...to +y'); near(el('A').angle, 90, 1e-6, 'its facing too');
  near(el('B').angle, 105, 1e-6, 'B’s facing'); near(el('B').tip, 5, 1e-6, 'B’s tip kept');
  M.poseTurn(els, els.map(M.poseSnap), [1, 0, 0], 90, c);
  near(el('A').z, 60, 1e-6, 'turned about x: A up'); near(el('A').y, 0, 1e-6, '...and over the middle');
});
