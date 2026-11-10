// A sketch's regions, as the page finds them (core/sketch.js, core/sketch-tools.js) and as the kernel makes faces of
// them: thirty sketches of shapes laid over, against and inside each other, each as drawn, turned 17°, and with
// every shape a few ten-thousandths of a millimetre out of place. Each region pushed 1 mm must be a solid of its
// own area; all of them together, and the ones an extrude takes by default, a solid of theirs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kernel, newDoc, newFeature } from './helpers.mjs';
import { slotEnts, rectEnts, polygonEnts, regionsOf, defaultRegionPts } from '../../src/core/sketch-tools.js';

let n = 0;
const id = p => p + (n++);
const L = (a, b) => ({ id: id('l'), t: 'line', a, b }), C = (c, r) => ({ id: id('c'), t: 'circle', c, r }), A = (c, r, a0, a1) => ({ id: id('a'), t: 'arc', c, r, a0, a1 });
const rect = (p, q) => rectEnts(p, q).ents, slot = (p, q, r) => slotEnts(p, q, r).ents.filter(e => !e.k), poly = (c, q, k) => polygonEnts(c, q, k).ents.filter(e => !e.k);
const CASES = {
  'two circles overlapping': [C([0, 0], 10), C([12, 0], 10)],
  'two circles touching': [C([0, 0], 10), C([20, 0], 10)],
  'circles about one centre': [C([0, 0], 10), C([0, 0], 6), C([0, 0], 2)],
  'a circle on a rectangle corner': [...rect([0, 0], [30, 20]), C([30, 20], 5)],
  'a circle inside, touching a side': [...rect([0, 0], [30, 20]), C([15, 5], 5)],
  'a circle and a chord': [C([0, 0], 10), L([-12, 4], [12, 4])],
  'a circle and a line through its centre': [C([0, 0], 10), L([-10, 0], [10, 0])],
  'a circle and a radius': [C([0, 0], 10), L([0, 0], [10, 0])],
  'two slots crossing': [...slot([-20, 0], [20, 0], 5), ...slot([0, -20], [0, 20], 5)],
  'a slot and a circle on its end': [...slot([-20, 0], [20, 0], 5), C([20, 0], 5)],
  'a slot and a hole at its end': [...slot([-20, 0], [20, 0], 5), C([20, 0], 2)],
  'slots end on end (an L)': [...slot([-20, 0], [20, 0], 5), ...slot([20, 0], [20, -30], 5)],
  'slots end on end (a square ring)': [...slot([-20, 20], [20, 20], 4), ...slot([20, 20], [20, -20], 4), ...slot([20, -20], [-20, -20], 4), ...slot([-20, -20], [-20, 20], 4)],
  'a hexagon in its circle': [...poly([0, 0], [10, 0], 6), C([0, 0], 10)],
  'a hexagon round a circle': [...poly([0, 0], [10, 0], 6), C([0, 0], 10 * Math.cos(Math.PI / 6))],
  'a rectangle cut by a line': [...rect([0, 0], [30, 20]), L([10, 0], [10, 20])],
  'a rectangle and a line along its side': [...rect([0, 0], [30, 20]), L([5, 0], [20, 0])],
  'two rectangles sharing a side': [...rect([0, 0], [30, 20]), ...rect([30, 0], [50, 20])],
  'two rectangles overlapping': [...rect([0, 0], [30, 20]), ...rect([20, 10], [50, 30])],
  'a rectangle in a rectangle, a corner shared': [...rect([0, 0], [30, 20]), ...rect([0, 0], [10, 8])],
  'a D': [A([0, 0], 10, -90, 90), L([0, -10], [0, 10])],
  'a lens of two arcs': [A([-6, 0], 10, -53.130102, 53.130102), A([6, 0], 10, 126.869898, 233.130102)],
  'three circles': [C([0, 0], 10), C([10, 0], 10), C([5, 8], 10)],
  'noughts and crosses': [...rect([0, 0], [30, 30]), L([10, 0], [10, 30]), L([20, 0], [20, 30]), L([0, 10], [30, 10]), L([0, 20], [30, 20])],
  'a rounded rectangle': [L([5, 0], [25, 0]), A([25, 5], 5, -90, 0), L([30, 5], [30, 15]), A([25, 15], 5, 0, 90), L([25, 20], [5, 20]), A([5, 15], 5, 90, 180), L([0, 15], [0, 5]), A([5, 5], 5, 180, 270)],
  'a circle in a corner, touching both sides': [...rect([0, 0], [30, 20]), C([5, 5], 5)],
  'a circle across a slot': [...slot([-20, 0], [20, 0], 5), C([0, 0], 8)],
  'a circle over a line’s end': [...rect([0, 0], [30, 20]), L([15, 0], [15, 10]), C([15, 10], 3)],
  'a keyhole': [C([0, 0], 8), ...rect([-3, -20], [3, -5])],
  'a ring of holes': [C([0, 0], 30), C([0, 0], 10), ...[0, 60, 120, 180, 240, 300].map(a => C([20 * Math.cos(a * Math.PI / 180), 20 * Math.sin(a * Math.PI / 180)], 3))],
};
const rot = (ents, deg, off) => { const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180), R = p => [p[0] * c - p[1] * s + off[0], p[0] * s + p[1] * c + off[1]]; return ents.map(e => Object.assign({}, e, e.a && e.t === 'line' ? { a: R(e.a), b: R(e.b) } : {}, e.c ? { c: R(e.c) } : {}, e.t === 'arc' ? { a0: e.a0 + deg, a1: e.a1 + deg } : {})); };
const jitter = ents => ents.map((e, i) => Object.assign({}, e, e.c ? { c: [e.c[0] + ((i * 7) % 5 - 2) * 3e-4, e.c[1] + ((i * 3) % 5 - 2) * 3e-4] } : {}, e.t === 'line' ? { a: [e.a[0] + ((i * 5) % 3 - 1) * 4e-4, e.a[1]], b: [e.b[0], e.b[1] + ((i * 2) % 3 - 1) * 4e-4] } : {}));
const vol = o => o.parts.reduce((s, p) => s + p.volume, 0);

test('regions of overlapping and touching shapes: what the page shows is what the kernel pushes', async () => {
  const K = await kernel(), fails = [];
  for (const [name, base] of Object.entries(CASES)) for (const [vn, ents] of [['', base], [' (turned 17°)', rot(base, 17, [3.3, -1.7])], [' (a hair out)', jitter(base)]]) {
    const R = regionsOf(ents), doc = newDoc(), sk = newFeature(doc, 'sketch', { plane: { std: 'top' }, ents });
    doc.features.push(sk, newFeature(doc, 'extrude', { sketch: sk.id, regions: [], op: 'new', depth: '1' }));
    if (!R.length) { fails.push(name + vn + ': no regions'); continue; }
    for (const r of R) { doc.features[1].regions = [r.pt]; const o = K.regen(doc), f = o.features[1], v = vol(o); if (f.ok === false) fails.push(name + vn + ' A=' + r.area.toFixed(2) + ': ' + f.error); else if (Math.abs(v - r.area) > 0.01 * r.area + 0.02) fails.push(name + vn + ' A=' + r.area.toFixed(2) + ' made ' + v.toFixed(2)); }
    for (const [what, pts] of [['all', R.map(r => r.pt)], ['default', defaultRegionPts(ents)]]) {
      if (!pts.length) continue;
      doc.features[1].regions = pts; const o = K.regen(doc), f = o.features[1], v = vol(o);
      const want = what === 'all' ? R.reduce((s, r) => s + r.area, 0) : R.filter(r => pts.some(q => Math.hypot(q[0] - r.pt[0], q[1] - r.pt[1]) < 1e-5)).reduce((s, r) => s + r.area, 0);
      if (f.ok === false) fails.push(name + vn + ' ' + what + ': ' + f.error); else if (Math.abs(v - want) > 0.01 * want + 0.05) fails.push(name + vn + ' ' + what + ' made ' + v.toFixed(2) + ' not ' + want.toFixed(2));
    }
  }
  assert.deepEqual(fails, []);
});

test('touching shapes make separate regions: a circle inside a hexagon, touching its six sides, leaves six corners', () => {
  const hexIn = CASES['a hexagon round a circle'];
  for (const ents of [hexIn, rot(hexIn, 17, [3.3, -1.7]), jitter(hexIn)]) {
    const A = regionsOf(ents).map(r => r.area).sort((a, b) => a - b);
    assert.equal(A.length, 7, A.map(a => a.toFixed(2)).join());
    assert.ok(A.slice(0, 6).every(a => Math.abs(a - 4.03) < 0.05) && Math.abs(A[6] - 235.6) < 0.3, A.map(a => a.toFixed(2)).join());
  }
});

test('the regions a cut takes by default take in the model’s holes; an added boss leaves them open', () => {
  // a slot round a hole of the model (a circle brought into the sketch: ref), and a circle that was drawn
  const ents = [...slot([-20, 0], [20, 0], 5), Object.assign(C([-20, 0], 2), { ref: true }), C([20, 0], 2)];
  const add = defaultRegionPts(ents), cut = defaultRegionPts(ents, true);
  assert.equal(add.length, 1, 'the slot, both circles left out');
  assert.equal(cut.length, 2, 'the slot and the model’s hole: the drawn circle is still an island');
  assert.ok(cut.some(q => Math.hypot(q[0] + 20, q[1]) < 1e-3));
});
