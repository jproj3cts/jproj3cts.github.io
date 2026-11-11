// Tabs and assemblies (core/assembly.js, and the document's tabs in core/doc.js): the file with one Part Studio as it
// always was and with more as tabs; a connector found on a flat face and on a hole's wall of a kernel-made part; each
// kind of mate solved, and what it leaves free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kernel, rectSketch, newDoc, newFeature } from './helpers.mjs';
import { normFile, fileData, normDoc } from '../../src/core/doc.js';
import { normAsm, solveMates, faceConnector, edgeConnector, vertexConnector, pickConnector, placed, turned3, qFromEuler, qToEuler, MATE_KINDS } from '../../src/core/assembly.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, (what || '') + ' ' + a + ' is not ' + b);
const near3 = (a, b, tol, what) => a.forEach((v, i) => near(v, b[i], tol, (what || '') + ' [' + i + ']'));

test('the document: one Part Studio is written as it always was; tabs make it a version 2 file that reads back the same', () => {
  const d = newDoc(); d.name = 'Bracket'; d.features.push(rectSketch(d, 40, 20));
  const f = normFile(d);
  assert.equal(f.tabs.length, 1); assert.equal(f.tabs[0].kind, 'studio'); assert.equal(f.name, 'Bracket'); assert.equal(f.active, f.tabs[0].id);
  const out = fileData(f);
  assert.equal(out.tabs, undefined, 'no tabs in the file'); assert.equal(out.version, 1); assert.equal(out.name, 'Bracket'); assert.equal(out.features.length, 1);
  assert.equal(JSON.stringify(fileData(normFile(JSON.parse(JSON.stringify(out))))), JSON.stringify(out), 'and it reads back the same');
  // a second studio and an assembly of a part from each
  f.tabs.push(Object.assign(normDoc({}), { id: 't2', kind: 'studio', name: 'Pins' }));
  f.tabs.push(normAsm({ id: 'a1', name: 'Fit', instances: [{ id: 'i1', studio: f.tabs[0].id, part: 'p1', fixed: true }, { id: 'i2', studio: 't2', part: 'p9', p: [1, 2, 3] }, { id: 'i3', studio: 'gone', part: 'x' }],
    mates: [{ t: 'fastened', a: { inst: 'i2', o: [0, 0, 0], z: [0, 0, 2] }, b: { inst: 'i1', o: [0, 0, 10], z: [0, 0, 1] } }, { t: 'welded', a: { inst: 'i1' }, b: { inst: 'i2' } }, { t: 'planar', a: { inst: 'i1' }, b: { inst: 'i1' } }] }));
  const two = fileData(f);
  assert.equal(two.version, 2); assert.equal(two.tabs.length, 3);
  const back = normFile(JSON.parse(JSON.stringify(two)));
  assert.deepEqual(back.tabs.map(t => t.kind + ':' + t.name), ['studio:Part Studio 1', 'studio:Pins', 'assembly:Fit']);
  const A = back.tabs[2];
  assert.deepEqual(A.instances.map(I => I.id), ['i1', 'i2'], 'an instance of a studio that is not there is dropped');
  assert.equal(A.mates.length, 1, 'a mate of no known kind, or of a part with itself, is dropped');
  near3(A.mates[0].a.z, [0, 0, 1], 1e-12, 'a connector’s z is a unit');
  assert.equal(JSON.stringify(normFile(JSON.parse(JSON.stringify(fileData(back))))), JSON.stringify(back));
  // a studio deleted takes its instances and their mates
  back.tabs.splice(1, 1);
  const less = normFile(JSON.parse(JSON.stringify(back)));
  assert.equal(less.tabs[1].instances.length, 1); assert.equal(less.tabs[1].mates.length, 0);
  // a file of assemblies only is given a Part Studio
  assert.equal(normFile({ tabs: [{ kind: 'assembly', name: 'A' }] }).tabs[0].kind, 'studio');
});

test('each kind of mate holds, and leaves free what it should', () => {
  // A fixed; its connector at (20, 10, 10) looking up. B's connector at (5, 5, 0) looking down (its bottom face)
  const mk = t => normAsm({ instances: [{ id: 'A', studio: 's', part: 'p1', fixed: true }, { id: 'B', studio: 's', part: 'p2', p: [30, 5, 40], q: qFromEuler([20, -35, 60]) }],
    mates: [{ t, a: { inst: 'B', o: [5, 5, 0], z: [0, 0, -1], x: [1, 0, 0] }, b: { inst: 'A', o: [20, 10, 10], z: [0, 0, 1], x: [1, 0, 0] } }] });
  for (const t of MATE_KINDS) {
    const a = mk(t), r = solveMates(a), B = a.instances[1], m = a.mates[0], o = placed(B, m.a.o), z = turned3(B, m.a.z), x = turned3(B, m.a.x);
    assert.ok(r.ok, t + ' solves: ' + r.err);
    near3(z, [0, 0, -1], 1e-7, t + ': the faces meet head on');
    near3(a.instances[0].p, [0, 0, 0], 0, 'the fixed part stays');
    if (t === 'fastened' || t === 'revolute') near3(o, [20, 10, 10], 1e-6, t + ': the points meet');
    if (t === 'fastened' || t === 'slider') near3(x, [1, 0, 0], 1e-7, t + ': no turn about the axis');
    if (t === 'slider' || t === 'cylindrical') { near(o[0], 20, 1e-6, t + ' on the axis'); near(o[1], 10, 1e-6); }
    if (t === 'planar') near(o[2], 10, 1e-6, 'on the plane');
    if (t === 'fastened') near3(qToEuler(B.q).map(v => Math.abs(v) < 1e-6 ? 0 : v), [0, 0, 0], 1e-5, 'not turned at all');
  }
  // flip: the same way round instead (B upside down)
  const f = mk('fastened'); f.mates[0].flip = true;
  assert.ok(solveMates(f).ok); near3(turned3(f.instances[1], f.mates[0].a.z), [0, 0, 1], 1e-7, 'flipped');
  // a pull on a slider's part moves it along the axis only
  const s = mk('slider'); solveMates(s);
  solveMates(s, [{ inst: 'B', p: [50, 50, 80], w: 0.05 }]);
  const o2 = placed(s.instances[1], s.mates[0].a.o);
  near(o2[0], 20, 1e-5); near(o2[1], 10, 1e-5); assert.ok(o2[2] > 50, 'slid up towards the pull: ' + o2[2]);
  // two mates that cannot both hold: not ok
  const bad = mk('fastened'); bad.mates.push(Object.assign({}, JSON.parse(JSON.stringify(bad.mates[0])), { id: 'm2', b: { inst: 'A', o: [0, 0, 10], z: [0, 0, 1], x: [1, 0, 0] } }));
  assert.equal(solveMates(bad).ok, false);
  // three parts in a chain, none fixed: the first mate's second part is held, the others come to it
  const ch = normAsm({ instances: [{ id: 'A', studio: 's', part: 'p' }, { id: 'B', studio: 's', part: 'p', p: [9, 9, 9] }, { id: 'C', studio: 's', part: 'p', p: [-7, 3, 2], q: qFromEuler([0, 0, 90]) }],
    mates: [{ t: 'fastened', a: { inst: 'B', o: [0, 0, 0], z: [0, 0, -1] }, b: { inst: 'A', o: [0, 0, 10], z: [0, 0, 1] } }, { t: 'fastened', a: { inst: 'C', o: [0, 0, 0], z: [0, 0, -1] }, b: { inst: 'B', o: [0, 0, 10], z: [0, 0, 1] } }] });
  assert.ok(solveMates(ch).ok);
  near3(ch.instances[0].p, [0, 0, 0], 0); near3(ch.instances[1].p, [0, 0, 10], 1e-6); near3(ch.instances[2].p, [0, 0, 20], 1e-6);
});

test('connectors on a kernel-made part: a flat face’s middle and normal, a hole’s axis; a pin put in the hole by a revolute mate', async () => {
  const K = await kernel(), doc = newDoc(), sk = rectSketch(doc, 40, 20);
  sk.ents.push({ id: 'hole', t: 'circle', c: [30, 10], r: 4 });
  doc.features.push(sk, newFeature(doc, 'extrude', { sketch: sk.id, regions: [[1, 1]], depth: '10', op: 'new' }));
  const pinSk = newFeature(doc, 'sketch', { plane: { std: 'top' }, ents: [{ id: 'pc', t: 'circle', c: [80, 0], r: 4 }], cons: [], dims: [] });
  doc.features.push(pinSk, newFeature(doc, 'extrude', { sketch: pinSk.id, regions: [[80, 0]], depth: '25', op: 'new' }));
  const out = K.regen(doc);
  assert.equal(out.parts.length, 2);
  const plate = out.parts.find(p => Math.abs(p.volume - (8000 - Math.PI * 160)) < 1), pin = out.parts.find(p => p !== plate);
  // the plate's top: the face whose connector looks up at z = 10
  const tops = plate.faceKinds.map((k, i) => (k === 'plane' ? faceConnector(plate, i) : null)).filter(c => c && c.z[2] > 0.99);
  assert.equal(tops.length, 1); near(tops[0].o[2], 10, 1e-6); assert.ok(!tops[0].round);
  // the hole's wall: its axis through (30, 10), along z, half way up
  const hi = plate.faceKinds.findIndex(k => k !== 'plane'), hc = faceConnector(plate, hi);
  assert.ok(hc.round); near3(hc.o, [30, 10, 5], 1e-3, 'the hole’s axis'); near3(hc.z, [0, 0, 1], 1e-6);
  const pi = pin.faceKinds.findIndex(k => k !== 'plane'), pc = faceConnector(pin, pi);
  assert.ok(pc.round); near3(pc.o, [80, 0, 12.5], 1e-3, 'the pin’s axis'); near3(pc.z, [0, 0, 1], 1e-6);
  // the pin's side to the hole's wall, cylindrical: its axis on the hole's, wherever it started
  const asm = normAsm({ instances: [{ id: 'P', studio: 's', part: plate.id, fixed: true }, { id: 'N', studio: 's', part: pin.id, p: [3, -8, 30], q: qFromEuler([70, 20, 0]) }],
    mates: [{ t: 'cylindrical', a: Object.assign({ inst: 'N' }, pc), b: Object.assign({ inst: 'P' }, hc) }] });
  assert.ok(solveMates(asm).ok);
  const N = asm.instances[1], ax = turned3(N, pc.z), on = placed(N, pc.o);
  near3(ax, [0, 0, 1], 1e-7, 'the axes run the same way'); near(on[0], 30, 1e-6); near(on[1], 10, 1e-6);
});

test('the kernel on an assembly: its parts measured where they are put, exported as one STEP file, and found to run into each other', async () => {
  const K = await kernel(), doc = newDoc(), sk = rectSketch(doc, 40, 20);
  doc.features.push(sk, newFeature(doc, 'extrude', { sketch: sk.id, regions: [[1, 1]], depth: '10', op: 'new' }));
  const studio = Object.assign(doc, { id: 'tA', kind: 'studio' });
  const d2 = newDoc(), s2 = rectSketch(d2, 10, 10);
  d2.features.push(s2, newFeature(d2, 'extrude', { sketch: s2.id, regions: [[1, 1]], depth: '15', op: 'new' }));
  const studio2 = Object.assign(d2, { id: 'tB', kind: 'studio' });
  const big = K.regen(studio).parts[0], small = K.regen(studio2).parts[0];
  // the last studio regenerated is tB: the assembly's requests leave it so
  const item = (st, part, id, p, q) => ({ doc: st, part: part.id, id, p, q: q || [0, 0, 0, 1] });
  const onTop = [item(studio, big, 'i1', [0, 0, 0]), item(studio2, small, 'i2', [100, 0, 10])];
  // the small part's volume where it is, and its distance from the big one: 100 − 40 = 60 along x, 0 in z (it starts at z 10, the big one ends there)
  const m = K.asmMeasure([Object.assign({ kind: 'part' }, onTop[0]), Object.assign({ kind: 'part' }, onTop[1])]);
  near(m.items[0].volume, 8000, 1e-6); near(m.items[1].volume, 1500, 1e-6); near(m.distance, 60, 1e-6, 'apart');
  near3(m.items[1].centroid, [105, 5, 17.5], 1e-6, 'its middle, where it is put');
  assert.equal(K.state().parts[0].id, small.id, 'the studio in hand is still the one last regenerated');
  // turned a quarter turn about z and set into the big part: they share 10 × 10 × 5
  const s = Math.SQRT1_2, clash = K.asmClash([onTop[0], item(studio2, small, 'i2', [20, 5, 5], [0, 0, s, s])]);
  assert.equal(clash.length, 1); assert.deepEqual([clash[0].a, clash[0].b], ['i1', 'i2']); near(clash[0].volume, 500, 1e-6, 'shared');
  assert.equal(K.asmClash(onTop).length, 0, 'apart: none');
  // one STEP file of both, read back: two solids, 9500 mm³, out to x = 110
  const bytes = K.asmExport('step', onTop);
  const d3 = newDoc(); d3.features.push(newFeature(d3, 'import', { file: 'a.step', data: new TextDecoder().decode(bytes) }));
  const back = K.regen(d3);
  assert.equal(back.parts.length, 2); near(back.parts.reduce((t, p) => t + p.volume, 0), 9500, 1e-3);
  near(Math.max(...back.parts.map(p => p.bbox[1][0])), 110, 1e-6);
  assert.ok(K.asmExport('stl', onTop).length > 500);
});

test('a mate’s offset and limits; connectors on an edge and on a corner', async () => {
  const mk = (t, more) => normAsm({ instances: [{ id: 'A', studio: 's', part: 'p1', fixed: true }, { id: 'B', studio: 's', part: 'p2', p: [30, 5, 40], q: qFromEuler([20, -35, 60]) }],
    mates: [Object.assign({ t, a: { inst: 'B', o: [5, 5, 0], z: [0, 0, -1], x: [1, 0, 0] }, b: { inst: 'A', o: [20, 10, 10], z: [0, 0, 1], x: [1, 0, 0] } }, more)] });
  // fastened 3 off: the faces 3 apart, along the second face's normal
  let a = mk('fastened', { off: 3 }); assert.ok(solveMates(a).ok);
  near3(placed(a.instances[1], a.mates[0].a.o), [20, 10, 13], 1e-6, 'a gap of 3');
  a = mk('planar', { off: -2 }); assert.ok(solveMates(a).ok); near(placed(a.instances[1], a.mates[0].a.o)[2], 8, 1e-6, 'sunk 2');
  assert.equal(mk('slider', { off: 3 }).mates[0].off, undefined, 'a slider takes no offset');
  // a slider held between 0 and 12 along the axis: started 30 up, it comes down to 12; pulled below, it stops at 0
  a = mk('slider', { lo: 0, hi: 12 }); assert.ok(solveMates(a).ok);
  near(placed(a.instances[1], a.mates[0].a.o)[2], 22, 1e-5, 'at its upper limit (12 above the face at 10)');
  solveMates(a, [{ inst: 'B', p: [0, 0, -80], w: 0.05 }]);
  near(placed(a.instances[1], a.mates[0].a.o)[2], 10, 1e-4, 'stopped at its lower limit');
  // inside its limits it is left where it is
  a = mk('slider', { lo: 0, hi: 50 }); solveMates(a); near(placed(a.instances[1], a.mates[0].a.o)[2], 40, 1e-5, 'left alone inside');
  // a revolute between −30° and 30°: turned 60° about z to begin with, it comes back to 30°
  a = normAsm({ instances: [{ id: 'A', studio: 's', part: 'p1', fixed: true }, { id: 'B', studio: 's', part: 'p2', p: [20, 10, 10], q: qFromEuler([0, 0, 60]) }],
    mates: [{ t: 'revolute', lo: -30, hi: 30, flip: true, a: { inst: 'B', o: [0, 0, 0], z: [0, 0, 1], x: [1, 0, 0] }, b: { inst: 'A', o: [20, 10, 10], z: [0, 0, 1], x: [1, 0, 0] } }] });
  assert.ok(solveMates(a).ok);
  near(qToEuler(a.instances[1].q)[2], 30, 1e-3, 'turned back to its limit');
  // connectors on a kernel-made plate with a hole: a straight edge's middle and direction, the hole's rim's centre, a corner
  const K = await kernel(), doc = newDoc(), sk = rectSketch(doc, 40, 20);
  sk.ents.push({ id: 'hole', t: 'circle', c: [30, 10], r: 4 });
  doc.features.push(sk, newFeature(doc, 'extrude', { sketch: sk.id, regions: [[1, 1]], depth: '10', op: 'new' }));
  const M = K.regen(doc).parts[0], n = M.edgeGroups.length / 2, cs = [];
  for (let j = 0; j < n; j++) cs.push(edgeConnector(M, j));
  const rims = cs.filter(c => c && c.round);
  assert.equal(rims.length, 2, 'the hole’s two rims');
  for (const c of rims) { near(c.o[0], 30, 1e-3); near(c.o[1], 10, 1e-3); near3(c.z, [0, 0, 1], 1e-6, 'its axis'); assert.ok(Math.abs(c.o[2]) < 1e-6 || Math.abs(c.o[2] - 10) < 1e-6); }
  const long = cs.find(c => c && !c.round && Math.abs(Math.abs(c.z[0]) - 1) < 1e-9 && Math.abs(c.o[1]) < 1e-9 && Math.abs(c.o[2]) < 1e-9);
  assert.ok(long, 'the bottom front edge'); near3(long.o, [20, 0, 0], 1e-6, 'its middle');
  const v = vertexConnector(M, 0); assert.equal(v.on, 'vertex'); assert.ok([0, 40].includes(Math.round(v.o[0])) && [0, 20].includes(Math.round(v.o[1])));
  assert.equal(pickConnector(M, { kind: 'edge', index: 0 }).on, 'edge');
  assert.equal(normAsm({ instances: [{ id: 'A', studio: 's', part: 'p' }, { id: 'B', studio: 's', part: 'p' }], mates: [{ t: 'revolute', a: Object.assign({ inst: 'A' }, rims[0]), b: Object.assign({ inst: 'B' }, long) }] }).mates[0].a.on, 'edge');
});
