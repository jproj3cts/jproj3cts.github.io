// The kernel (engines/kernel.js) on the vendored OpenCascade build, in Node: each feature's solid against the volume
// worked out by hand, names that survive a parametric edit, a variable driving a dimension, STEP out and back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kernel, rectSketch, circleSketch, pointsSketch, newDoc, newFeature, okAll, errorsOf } from './helpers.mjs';
import { slotEnts, regionsOf, defaultRegionPts } from '../../src/core/sketch-tools.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, (what || '') + ' ' + a + ' is not ' + b);
/* a 40 × 20 block, 10 high, on the Top plane from the origin */
function block(w = 40, h = 20, d = 10) {
  const doc = newDoc(), sk = rectSketch(doc, w, h);
  doc.features.push(sk);
  doc.features.push(newFeature(doc, 'extrude', { sketch: sk.id, regions: [[1, 1]], depth: String(d) }));
  return doc;
}
const vol = out => out.parts.reduce((s, p) => s + p.volume, 0);
/* the pick of the edge (or face) of a part nearest a point, from the meshes the page is sent */
function edgeNear(out, q) {
  let best = null, bd = Infinity;
  for (const p of out.parts) for (let j = 0; j < p.edgeGroups.length / 2; j++) {
    const s = p.edgeGroups[2 * j], c = p.edgeGroups[2 * j + 1];
    for (let k = s; k < s + c; k++) for (const o of [0, 3]) { const x = p.seg.slice(k * 6 + o, k * 6 + o + 3), d = Math.hypot(x[0] - q[0], x[1] - q[1], x[2] - q[2]); }
    // the edge's middle segment's middle
    const m = s + Math.floor(c / 2), a = p.seg.slice(m * 6, m * 6 + 3), b = p.seg.slice(m * 6 + 3, m * 6 + 6), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], d = Math.hypot(mid[0] - q[0], mid[1] - q[1], mid[2] - q[2]);
    if (d < bd) { bd = d; best = { part: p.id, kind: 'edge', index: j }; }
  }
  return best;
}
function faceNear(out, q, K) {
  const st = K.state();
  let best = null, bd = Infinity;
  for (const p of out.parts) for (let i = 0; i < p.faceGroups.length / 2; i++) {
    const r = K.refs([{ part: p.id, kind: 'face', index: i }])[0], d = Math.hypot(r.pt[0] - q[0], r.pt[1] - q[1], r.pt[2] - q[2]);
    if (d < bd) { bd = d; best = { part: p.id, kind: 'face', index: i }; }
  }
  void st;
  return best;
}

test('extrude: a 40 × 20 rectangle, 10 deep, is 8000 mm³; symmetric and two-way extrudes too', async () => {
  const K = await kernel(), doc = block();
  let out = K.regen(doc);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  assert.equal(out.parts.length, 1);
  near(vol(out), 8000, 1e-6, 'volume');
  near(out.parts[0].bbox[1][2], 10, 1e-6, 'top');
  doc.features[1].end = 'symmetric';
  out = K.regen(doc);
  near(out.parts[0].bbox[0][2], -5, 1e-6, 'symmetric bottom');
  doc.features[1].end = 'blind'; doc.features[1].second = true; doc.features[1].depth2 = '4 mm';
  out = K.regen(doc);
  near(vol(out), 40 * 20 * 14, 1e-6, 'both ways');
  assert.equal(out.parts[0].faceGroups.length / 2, 6, 'one solid of six faces');
});

test('extrude: remove, through all, and a region chosen inside a ring', async () => {
  const K = await kernel(), doc = block();
  const c = circleSketch(doc, [20, 10], 3, { std: 'top' });
  doc.features.push(c, newFeature(doc, 'extrude', { sketch: c.id, regions: [[20, 10]], op: 'remove', end: 'through', flip: true }));
  let out = K.regen(doc);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  near(vol(out), 8000 - Math.PI * 9 * 10, 1e-6, 'with a hole');
  // the same sketch with both rectangle and circle: the ring alone
  const d2 = newDoc(), sk = rectSketch(d2, 40, 20);
  sk.ents.push({ id: 'cc', t: 'circle', c: [20, 10], r: 3 });
  d2.features.push(sk, newFeature(d2, 'extrude', { sketch: sk.id, regions: [[1, 1]], depth: '10' }));
  out = K.regen(d2);
  near(vol(out), 8000 - Math.PI * 9 * 10, 1e-6, 'ring');
});

test('fillet: one vertical edge of the block, r = 2, takes (4 − π)·10 mm³', async () => {
  const K = await kernel(), doc = block();
  let out = K.regen(doc);
  const pick = edgeNear(out, [40, 20, 5]), [ref] = K.refs([pick]);
  assert.equal(ref.kind, 'edge'); assert.equal(ref.faces.length, 2);
  doc.features.push(newFeature(doc, 'fillet', { edges: [ref], radius: '2 mm' }));
  out = K.regen(doc);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  near(vol(out), 8000 - (4 - Math.PI) * 10, 1e-6, 'filleted');
  // a parametric edit: the block made 60 long, the fillet follows the same edge (now at x = 60)
  doc.features[0].dims[0].x = '60';
  out = K.regen(doc);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  near(vol(out), 60 * 20 * 10 - (4 - Math.PI) * 10, 1e-6, 'after the edit');
  near(out.parts[0].bbox[1][0], 60, 1e-6, 'longer');
  // a tangent chain: a fillet of the top's edge round a filleted corner runs all the way round
  const doc2 = block(); out = K.regen(doc2);
  const e4 = ['x', 'y'].map(() => null);
  void e4;
  const vrefs = K.refs([[0, 0, 5], [40, 0, 5], [40, 20, 5], [0, 20, 5]].map(q => edgeNear(out, q)));
  doc2.features.push(newFeature(doc2, 'fillet', { edges: vrefs, radius: '3' }));
  out = K.regen(doc2);
  const top = K.refs([edgeNear(out, [20, 0, 10])]);
  doc2.features.push(newFeature(doc2, 'fillet', { edges: top, radius: '1' }));
  out = K.regen(doc2);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  const one = 8000 - 4 * (9 - Math.PI * 9 / 4) * 10;
  assert.ok(vol(out) < one - 1, 'the round chain took material all round: ' + vol(out) + ' < ' + one);
});

test('chamfer and shell: volumes by hand', async () => {
  const K = await kernel(), doc = block();
  let out = K.regen(doc);
  doc.features.push(newFeature(doc, 'chamfer', { edges: K.refs([edgeNear(out, [40, 20, 5])]), distance: '2' }));
  out = K.regen(doc);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  near(vol(out), 8000 - 2 * 10, 1e-6, 'chamfered');
  const d2 = block(); out = K.regen(d2);
  const topFace = faceNear(out, [20, 10, 10], K);
  d2.features.push(newFeature(d2, 'shell', { faces: K.refs([topFace]), thickness: '1' }));
  out = K.regen(d2);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  near(vol(out), 8000 - 38 * 18 * 9, 1e-6, 'shelled');
});

test('hole: through, blind with its tip, counterbore and countersink, from sketch points', async () => {
  const K = await kernel(), base = () => { const d = block(); const p = pointsSketch(d, [[10, 10], [30, 10]], { std: 'top' }); p.plane = { std: 'top' }; d.features.push(p); return [d, p]; };
  // the points' sketch on the block's top face
  let [doc, p] = base();
  let out = K.regen(doc);
  p.plane = K.refs([faceNear(out, [20, 10, 10], K)])[0];
  doc.features.push(newFeature(doc, 'hole', { sketch: p.id, dia: '4', end: 'through' }));
  out = K.regen(doc);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  near(vol(out), 8000 - 2 * Math.PI * 4 * 10, 1e-6, 'two through holes');
  doc.features[3].end = 'blind'; doc.features[3].depth = '6'; doc.features[3].tip = false;
  out = K.regen(doc);
  near(vol(out), 8000 - 2 * Math.PI * 4 * 6, 1e-6, 'blind');
  doc.features[3].tip = true;
  out = K.regen(doc);
  near(vol(out), 8000 - 2 * (Math.PI * 4 * 6 + Math.PI * 4 * (2 / Math.tan(59 * Math.PI / 180)) / 3), 1e-6, 'blind, 118° tip');
  doc.features[3] = newFeature(doc, 'hole', { id: doc.features[3].id, sketch: p.id, kind: 'cbore', dia: '4', end: 'through', cbDia: '8', cbDepth: '3' });
  out = K.regen(doc);
  near(vol(out), 8000 - 2 * (Math.PI * 4 * 7 + Math.PI * 16 * 3), 1e-6, 'counterbored');
  doc.features[3] = newFeature(doc, 'hole', { id: doc.features[3].id, sketch: p.id, kind: 'csink', dia: '4', end: 'through', csDia: '8', csAngle: '90' });
  out = K.regen(doc);
  // a 90° cone from r 4 at the top to r 2, 2 deep, then the bore for the other 8
  const cone = Math.PI * 2 / 3 * (16 + 8 + 4);
  near(vol(out), 8000 - 2 * (cone + Math.PI * 4 * 8), 1e-6, 'countersunk');
});

test('patterns and mirror: of a feature, and of a part', async () => {
  const K = await kernel(), doc = block(100, 20, 10);
  const c = circleSketch(doc, [10, 10], 3);
  doc.features.push(c, newFeature(doc, 'extrude', { sketch: c.id, regions: [[10, 10]], op: 'remove', end: 'through', flip: true }));
  doc.features.push(newFeature(doc, 'lpattern', { items: [doc.features[3].id], dir: 'x', count: '4', spacing: '20 mm' }));
  let out = K.regen(doc);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  near(vol(out), 100 * 20 * 10 - 4 * Math.PI * 9 * 10, 1e-6, 'four holes');
  // circular: six bosses round z
  const d2 = newDoc(), b = circleSketch(d2, [30, 0], 4);
  d2.features.push(b, newFeature(d2, 'extrude', { sketch: b.id, regions: [[30, 0]], depth: '5' }));
  d2.features.push(newFeature(d2, 'cpattern', { of: 'parts', items: [d2.features[1].id], axis: 'z', count: '6', angle: '360' }));
  out = K.regen(d2);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  assert.equal(out.parts.length, 6);
  near(vol(out), 6 * Math.PI * 16 * 5, 1e-6, 'six bosses');
  // mirror a part in the Right plane
  const d3 = block(20, 10, 5);
  d3.features.push(newFeature(d3, 'mirror', { of: 'parts', items: [d3.features[1].id], plane: { std: 'right' } }));
  out = K.regen(d3);
  assert.equal(out.parts.length, 2);
  near(out.parts[1].bbox[0][0], -20, 1e-6, 'mirrored to −x');
});

test('a variable drives a dimension; the rollback bar and suppression; an error does not stop what follows', async () => {
  const K = await kernel(), doc = block();
  doc.variables.push({ name: 'w', expr: '50 mm', kind: 'len' });
  doc.features[0].dims[0].x = '#w + 10';
  let out = K.regen(doc);
  near(vol(out), 60 * 20 * 10, 1e-6, 'from #w');
  doc.variables[0].expr = '2 in';
  out = K.regen(doc);
  near(vol(out), (50.8 + 10) * 20 * 10, 1e-6, 'inches');
  // a feature that fails (a fillet too big) is shown failed, the extrude after it still made
  out = K.regen(doc);
  doc.features.push(newFeature(doc, 'fillet', { edges: K.refs([edgeNear(out, [0, 0, 5])]), radius: '50' }));
  const c = circleSketch(doc, [5, 5], 2);
  doc.features.push(c, newFeature(doc, 'extrude', { sketch: c.id, regions: [[5, 5]], op: 'add', depth: '15' }));
  out = K.regen(doc);
  assert.equal(out.features[2].ok, false);
  assert.match(out.features[2].error, /fillet/);
  assert.ok(out.features[4].ok, out.features[4].error);
  near(vol(out), 60.8 * 20 * 10 + Math.PI * 4 * 5, 1e-6, 'boss added above the block');
  // rolled back to before the boss
  doc.rollback = 2;
  out = K.regen(doc);
  near(vol(out), 60.8 * 20 * 10, 1e-6, 'rolled back');
  assert.ok(out.features[3].rolledBack);
  doc.rollback = null; doc.features[1].suppressed = true;
  out = K.regen(doc);
  assert.ok(out.features[1].suppressed);
  near(vol(out), Math.PI * 4 * 15, 1e-6, 'block suppressed: the boss alone is a new part');
});

test('revolve, sweep and loft; boolean of parts', async () => {
  const K = await kernel(), doc = newDoc();
  // a 10 × 20 rectangle at x 10..20 on Front, revolved about z: a tube
  const sk = rectSketch(doc, 10, 20, { std: 'front' }, [10, 0]);
  sk.ents.push({ id: 'ax', t: 'line', a: [0, 0], b: [0, 10], k: true });
  doc.features.push(sk, newFeature(doc, 'revolve', { sketch: sk.id, regions: [[15, 10]], axis: { e: 'ax' }, kind: 'full' }));
  let out = K.regen(doc);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  near(vol(out), Math.PI * (400 - 100) * 20, 1e-2, 'tube');
  doc.features[1].kind = 'one'; doc.features[1].angle = '90 deg';
  out = K.regen(doc);
  near(vol(out), Math.PI * (400 - 100) * 20 / 4, 1e-2, 'a quarter');
  // loft a square 20 at z 0 to a square 10 at z 10: a frustum (h/3)(A1 + A2 + √(A1 A2))
  const d2 = newDoc(), s1 = rectSketch(d2, 20, 20);
  const pl = newFeature(d2, 'plane', { ref: { std: 'top' }, offset: '10' });
  const s2 = rectSketch(d2, 10, 10, { feature: pl.id }, [5, 5]);
  d2.features.push(s1, pl, s2, newFeature(d2, 'loft', { sections: [{ sketch: s1.id, regions: [[1, 1]] }, { sketch: s2.id, regions: [[10, 10]] }] }));
  out = K.regen(d2);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  near(vol(out), 10 / 3 * (400 + 100 + 200), 1e-4, 'frustum');
  // sweep a circle r 2 on Front along a straight path up z of 30
  const d3 = newDoc(), prof = circleSketch(d3, [0, 0], 2, { std: 'top' });
  const path = newFeature(d3, 'sketch', { plane: { std: 'front' }, ents: [{ id: 'p1', t: 'line', a: [0, 0], b: [0, 30] }] });
  d3.features.push(prof, path, newFeature(d3, 'sweep', { sketch: prof.id, regions: [[0, 0]], path: path.id }));
  out = K.regen(d3);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  near(vol(out), Math.PI * 4 * 30, 1e-4, 'swept rod');
  // two blocks, one subtracted from the other
  const d4 = block(20, 20, 10), sb = rectSketch(d4, 10, 10, { std: 'top' }, [15, 5]);
  d4.features.push(sb, newFeature(d4, 'extrude', { sketch: sb.id, regions: [[20, 10]], depth: '10', op: 'new' }));
  out = K.regen(d4);
  assert.equal(out.parts.length, 2);
  d4.features.push(newFeature(d4, 'boolean', { op: 'subtract', targets: [out.parts[0].id], tools: [out.parts[1].id] }));
  out = K.regen(d4);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  assert.equal(out.parts.length, 1);
  near(vol(out), 4000 - 500, 1e-6, 'subtracted');
});

test('STEP out and back in; STL out; measure of a part’s mass', async () => {
  const K = await kernel(), doc = block();
  doc.parts = {};
  let out = K.regen(doc);
  const pid = out.parts[0].id;
  doc.parts[pid] = { name: 'Plate', material: 'Aluminium 6061' };
  const step = K.exportStep();
  const text = new TextDecoder().decode(step);
  assert.match(text, /^ISO-10303-21/);
  const stl = K.exportStl();
  assert.equal(stl.length, 84 + 50 * new DataView(stl.buffer, stl.byteOffset).getUint32(80, true), 'binary STL length');
  const d2 = newDoc();
  d2.features.push(newFeature(d2, 'import', { file: 'plate.step', data: text }));
  out = K.regen(d2);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  near(vol(out), 8000, 1e-6, 'read back');
  out = K.regen(doc);
  const m = K.measure([{ part: pid, kind: 'part' }], doc);
  near(m.items[0].volume, 8000, 1e-6);
  near(m.items[0].mass, 8000 / 1000 * 2.70, 1e-9, 'mass, g');
  const two = K.measure([faceNear(out, [20, 10, 10], K), faceNear(out, [20, 10, 0], K)], doc);
  near(two.distance, 10, 1e-9, 'top to bottom');
  near(two.angle, 0, 1e-6, 'parallel faces');
});

test('a sketch held to an edge of the model follows the edge: a hole 10 from the block’s end moves when the block grows, and its cut with it', async () => {
  const K = await kernel(), doc = block(40, 20, 10);
  let out = K.regen(doc);
  // the block's far end, on its top face (x 40, z 10): Use brings it into a sketch on that face, with the edge's ref
  const top = K.refs([faceNear(out, [20, 10, 10], K)])[0], F = { o: [0, 0, 10], x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] };
  const [line] = K.project([edgeNear(out, [40, 10, 10])], F);
  assert.equal(line.t, 'line');
  assert.ok(line.src && line.src.kind === 'edge' && line.src.faces.length === 2, 'the projected edge carries its ref');
  Object.assign(line, { id: 'lref', ref: true, k: true });
  const hole = { id: 'chole', t: 'circle', c: [30, 10], r: 3 };
  const sk = newFeature(doc, 'sketch', { plane: top, ents: [line, hole],
    cons: [{ id: 'cf1', t: 'fix', r: [{ e: 'lref', k: 'a' }], at: line.a.slice() }, { id: 'cf2', t: 'fix', r: [{ e: 'lref', k: 'b' }], at: line.b.slice() }],
    dims: [{ id: 'd1', t: 'dia', r: [{ e: 'chole' }], v: 6, x: '6' }, { id: 'd2', t: 'pl', r: [{ e: 'chole', k: 'c' }, { e: 'lref' }], v: 10, x: '10', s: line.a[1] < line.b[1] ? 1 : -1 }] });
  doc.features.push(sk);
  doc.features.push(newFeature(doc, 'extrude', { sketch: sk.id, regions: [[30, 10]], op: 'remove', depth: '10' }));
  out = K.regen(doc);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  near(vol(out), 8000 - Math.PI * 9 * 10, 0.5, 'the block with its hole');
  // the block made 60 long: the edge is at x 60 now, the hole 10 from it at x 50, the cut still there
  doc.features[0].dims[0].x = '60';
  out = K.regen(doc);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  const rep = out.features.find(f => f.id === sk.id);
  assert.ok(rep.info.ents, 'the sketch that moved is sent back, for the document to take up');
  const c = rep.info.ents.find(e => e.id === 'chole').c;
  near(c[0], 50, 1e-5, 'the hole’s centre');
  near(vol(out), 12000 - Math.PI * 9 * 10, 0.5, 'the longer block with its hole');
});

test('a sketch point held to a corner of the model follows the corner; a revolved solid sends no seam as an edge', async () => {
  const K = await kernel(), doc = block(40, 20, 10);
  let out = K.regen(doc);
  // the corner at (40, 20, 10), by the page's pick of it, as a ref with the faces that meet there
  const part = out.parts[0];
  let vi = -1; for (let i = 0; i < part.verts.length / 3; i++) if (Math.hypot(part.verts[3 * i] - 40, part.verts[3 * i + 1] - 20, part.verts[3 * i + 2] - 10) < 1e-6) vi = i;
  const top = K.refs([faceNear(out, [20, 10, 10], K)])[0], vr = K.refs([{ part: part.id, kind: 'vertex', index: vi }])[0];
  assert.equal(vr.faces.length, 3, 'three faces meet at a block’s corner');
  const sk = newFeature(doc, 'sketch', { plane: top, ents: [{ id: 'pref', t: 'point', c: [40, 20], ref: true, k: true, src: vr }, { id: 'ch', t: 'circle', c: [35, 15], r: 2 }],
    cons: [{ id: 'cf', t: 'fix', r: [{ e: 'pref', k: 'c' }], at: [40, 20] }],
    dims: [{ id: 'd1', t: 'dia', r: [{ e: 'ch' }], v: 4, x: '4' }, { id: 'd2', t: 'dist', r: [{ e: 'ch', k: 'c' }, { e: 'pref', k: 'c' }], v: 5, x: '5', dir: 'h', s: 1 }, { id: 'd3', t: 'dist', r: [{ e: 'ch', k: 'c' }, { e: 'pref', k: 'c' }], v: 5, x: '5', dir: 'v', s: 1 }] });
  doc.features.push(sk);
  out = K.regen(doc);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  doc.features[0].dims[0].x = '70'; doc.features[0].dims[1].x = '30';
  out = K.regen(doc);
  const ents = out.features.find(f => f.id === sk.id).info.ents;
  assert.deepEqual(ents.find(e => e.id === 'pref').c.map(v => +v.toFixed(6)), [70, 30]);
  assert.deepEqual(ents.find(e => e.id === 'ch').c.map(v => +v.toFixed(5)), [65, 25]);
  // a cylinder: its two round edges, and no seam along it
  const d2 = newDoc(), cs = circleSketch(d2, [0, 0], 5);
  d2.features.push(cs, newFeature(d2, 'extrude', { sketch: cs.id, regions: [[0, 0]], depth: '10' }));
  const o2 = K.regen(d2), p2 = o2.parts[0];
  let drawn = 0; for (let j = 0; j < p2.edgeGroups.length / 2; j++) if (p2.edgeGroups[2 * j + 1] > 0) drawn++;
  assert.equal(drawn, 2, 'only the two circles are edges to see');
});

test('extrude: a new one adds to the part it meets (a new part where it meets none); a depth below 0 goes the other way', async () => {
  const K = await kernel(), doc = block(40, 20, 10);
  assert.equal(newFeature(doc, 'extrude').op, 'add');
  // a boss on the top face, 5 up: one part, the block and the boss
  const top = K.refs([faceNear(K.regen(doc), [20, 10, 10], K)])[0], sk = circleSketch(doc, [20, 10], 4, top);
  doc.features.push(sk, newFeature(doc, 'extrude', { sketch: sk.id, regions: [[20, 10]], depth: '5' }));
  let out = K.regen(doc);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  assert.equal(out.parts.length, 1);
  near(vol(out), 8000 + Math.PI * 16 * 5, 0.5, 'the block with its boss');
  near(out.parts[0].bbox[1][2], 15, 1e-6, 'the boss stands 5 above the block');
  // −5: the other way, into the block, where adding changes nothing
  doc.features[3].depth = '-5';
  out = K.regen(doc);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  near(vol(out), 8000, 0.5, 'the boss turned into the block');
  // a first extrude of −10 hangs below its plane
  const d2 = newDoc(), s2 = rectSketch(d2, 10, 10);
  d2.features.push(s2, newFeature(d2, 'extrude', { sketch: s2.id, regions: [[1, 1]], depth: '-10' }));
  const o2 = K.regen(d2);
  assert.ok(okAll(o2), errorsOf(o2).join('; '));
  near(o2.parts[0].bbox[0][2], -10, 1e-6); near(o2.parts[0].bbox[1][2], 0, 1e-6); near(vol(o2), 1000, 1e-3);
});

test('three slots laid end on end by eye (their ends a hair apart), round holes at the ends: nine regions, any of them cut, and the five of the U cut as one', async () => {
  const K = await kernel(), doc = block(100, 80, 10);
  let out = K.regen(doc);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  const v0 = vol(out), top = K.refs([faceNear(out, [50, 40, 10], K)])[0], O = [50, 40], at = q => [q[0] + O[0], q[1] + O[1]];
  // across the top, then down each side: each drawn onto the last one's end, not quite on it
  const ents = [...slotEnts(at([-32, 27.5]), at([32, 27.5]), 5).ents, ...slotEnts(at([-32.0000005, 27.5016]), at([-32.0000003, -27.496]), 5).ents, ...slotEnts(at([32.0000002, 27.4985]), at([32, -27.4972]), 5).ents,
    ...[[-32, 27.5], [32, 27.5], [-32, -27.5], [32, -27.5]].map((c, i) => ({ id: 'hole' + i, t: 'circle', c: at(c), r: 1.65 }))];
  const R = regionsOf(ents), big = R.filter(r => r.area > 50);
  assert.equal(R.length, 9, 'the two corners, the three bars between them and the four holes: ' + R.map(r => r.area.toFixed(2)).join());
  assert.equal(defaultRegionPts(ents).length, 5, 'the U, its holes left out');
  const sk = newFeature(doc, 'sketch', { plane: top, ents });
  doc.features.push(sk, newFeature(doc, 'extrude', { sketch: sk.id, regions: [], op: 'remove', depth: '5' }));
  for (const r of big) {
    doc.features[3].regions = [r.pt];
    out = K.regen(doc);
    assert.ok(okAll(out), errorsOf(out).join('; '));
    near(v0 - vol(out), r.area * 5, 0.02 * r.area * 5 + 0.5, 'the region of ' + r.area.toFixed(1) + ' mm², cut 5 deep:');
  }
  for (const pick of [[0, 1], [1, 2], big.map((r, i) => i)]) {
    doc.features[3].regions = pick.map(i => big[i].pt);
    out = K.regen(doc);
    assert.ok(okAll(out), errorsOf(out).join('; '));
    assert.equal(out.parts.length, 1);
    const want = pick.reduce((t, i) => t + big[i].area * 5, 0);
    near(v0 - vol(out), want, 0.01 * want + 0.5, 'regions ' + pick.join() + ' cut together:');
  }
});

test('a cut over holes of the model brought into its sketch takes them in where they are empty, and goes round them where they are not', async () => {
  const K = await kernel(), O = [50, 40], at = q => [q[0] + O[0], q[1] + O[1]], centres = [[-32, 27.5], [32, 27.5], [-32, -27.5], [32, -27.5]];
  // the edges of the model as the sketcher brings them in: fixed shapes marked ref, a hair off the true hole
  const slots = [...slotEnts(at([-32, 27.5]), at([32, 27.5]), 5).ents, ...slotEnts(at([-32.0000005, 27.5016]), at([-32.0000003, -27.496]), 5).ents, ...slotEnts(at([32.0000002, 27.4985]), at([32, -27.4972]), 5).ents];
  const refs = centres.map((c, i) => ({ id: 'rim' + i, t: 'circle', c: at([c[0] + 1e-13, c[1] - 1e-13]), r: 1.6499999999999926, ref: true }));
  const big = regionsOf([...slots, ...refs]).filter(r => r.area > 50), want = big.reduce((t, r) => t + r.area, 0) * 3;
  assert.equal(big.length, 5);
  for (const drilled of [true, false]) {
    const doc = block(100, 80, 10);
    let out = K.regen(doc);
    const top = K.refs([faceNear(out, [50, 40, 10], K)])[0];
    if (drilled) {
      const hs = newFeature(doc, 'sketch', { plane: top, ents: centres.map((c, i) => ({ id: 'h' + i, t: 'circle', c: at(c), r: 1.65 })) });
      doc.features.push(hs, newFeature(doc, 'extrude', { sketch: hs.id, regions: centres.map(at), op: 'remove', depth: '10' }));
    }
    out = K.regen(doc);
    assert.ok(okAll(out), errorsOf(out).join('; '));
    const v0 = vol(out), n0 = out.parts[0].faceNames.length;
    const sk = newFeature(doc, 'sketch', { plane: top, ents: [...slots, ...refs] }), cut = newFeature(doc, 'extrude', { sketch: sk.id, regions: big.map(r => r.pt), op: 'remove', depth: '3' });
    doc.features.push(sk, cut);
    out = K.regen(doc);
    assert.ok(okAll(out), errorsOf(out).join('; '));
    const names = out.parts[0].faceNames.map(nm => (Array.isArray(nm) ? nm[0] : nm)), rims = names.filter(nm => /\.rim\d$/.test(nm)).length;
    near(v0 - vol(out), want, 0.01 * want, drilled ? 'over the holes:' : 'round the bosses:');
    if (drilled) {
      // the floor, and a wall for each of the U's ten sides: nothing where the holes were
      assert.equal(rims, 0, 'no wall of the cut on a hole’s own wall: ' + names.filter(nm => nm.startsWith(cut.id)).join());
      assert.equal(names.length, n0 + 11, 'faces: ' + names.join());
    } else assert.equal(rims, 4, 'a boss left standing in each: ' + names.join());
  }
});

test('a fillet’s faces are named after the edges they round, the same whatever order the edges come in', async () => {
  const K = await kernel(), doc = block(40, 20, 10);
  let out = K.regen(doc);
  const top = K.refs([faceNear(out, [20, 10, 10], K)])[0];
  doc.features.push(newFeature(doc, 'fillet', { edges: [top], radius: '2' }));
  out = K.regen(doc);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  const names = out.parts[0].faceNames.filter(n => n.startsWith(doc.features[2].id + '.r'));
  assert.equal(names.length, 4);
  assert.equal(new Set(names).size, 4, 'four fillet faces, four names');
  assert.ok(names.every(n => !/\.r\d$/.test(n)), 'none named by its place in a list: ' + names.join());
});

test('Delete part: a feature that takes whole parts away; suppressed, they are back', async () => {
  const K = await kernel(), doc = block(40, 20, 10), s2 = circleSketch(doc, [100, 0], 5);
  doc.features.push(s2, newFeature(doc, 'extrude', { sketch: s2.id, regions: [[100, 0]], depth: '10', op: 'new' }));
  let out = K.regen(doc);
  assert.equal(out.parts.length, 2);
  const del = newFeature(doc, 'delete', { targets: [out.parts[1].id] });
  doc.features.push(del);
  out = K.regen(doc);
  assert.ok(okAll(out), errorsOf(out).join('; '));
  assert.equal(out.parts.length, 1); near(vol(out), 8000, 1e-3);
  del.suppressed = true;
  assert.equal(K.regen(doc).parts.length, 2);
  delete del.suppressed; del.targets = ['nothing'];
  assert.match(K.regen(doc).features[4].error, /not there/);
});

test('extrude from a face of the model: the top of the block pushed out, a side pushed out, the top cut in; a round face refused', async () => {
  const K = await kernel(), doc = block();
  let out = await K.regen(doc);
  const top = K.refs([faceNear(out, [20, 10, 10], K)])[0], side = K.refs([faceNear(out, [40, 10, 5], K)])[0];
  // the top, 5 further up: 40 × 20 × 15, still one part
  doc.features.push(newFeature(doc, 'extrude', { faces: [top], depth: '5' }));
  out = await K.regen(doc); okAll(out);
  assert.equal(out.parts.length, 1); near(vol(out), 12000, 1e-6, 'top out');
  // a side, 4 out along its own way: x from 0 to 44
  doc.features.push(newFeature(doc, 'extrude', { faces: [side], depth: '4' }));
  out = await K.regen(doc); okAll(out);
  near(vol(out), 12000 + 4 * 20 * 15, 1e-6, 'side out (the side is 15 high by now)'); near(out.parts[0].bbox[1][0], 44, 1e-6, 'x');
  // Remove goes into the part: the new top, 3 down, over all of it
  const top2 = K.refs([faceNear(out, [10, 10, 15], K)])[0];
  doc.features.push(newFeature(doc, 'extrude', { faces: [top2], op: 'remove', depth: '3' }));
  out = await K.regen(doc); okAll(out);
  near(out.parts[0].bbox[1][2], 12, 1e-6, 'cut top');
  // a cylinder's round face cannot be pushed
  const d2 = newDoc(), c = circleSketch(d2, [0, 0], 10);
  d2.features.push(c, newFeature(d2, 'extrude', { sketch: c.id, regions: [[0, 0]], depth: '10' }));
  let o2 = await K.regen(d2);
  const round = K.refs([faceNear(o2, [10, 0, 5], K)])[0];
  d2.features.push(newFeature(d2, 'extrude', { faces: [round], depth: '5' }));
  o2 = await K.regen(d2);
  assert.match(errorsOf(o2).join(' '), /flat face/);
});
