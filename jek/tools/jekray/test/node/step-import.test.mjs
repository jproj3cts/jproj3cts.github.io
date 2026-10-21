/* STEP import: files written by JEKray's own CAD export (a lens and a fold mirror, two solids; the lens alone, one) read
   back by OpenCascade (the vendored occt-import-js, its Node build) as the page reads them: the bodies, each one's box
   against the exported solid's (to the tessellation's error), the file's unit (millimetres, and the same file declared in
   inches and in centimetres), the triangle budget and the coarser passes, one object against separate parts (how many, where,
   grouped), and the object made a working beam block. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const CAD = await import('../../src/io/cad-export.js');
const SC = await import('../../src/core/step.js');
const { STL_KEEP, meshTris } = await import('../../src/core/stl.js');
const { openBench, occtReader } = await import('../../headless.mjs');

const lens = { type: 'lens', id: 'L', name: 'Lens', x: 0, y: 0, angle: 0, diameter: 25, surfaces: [{ R: 50 }, { R: -50 }], gaps: [5], materials: [{ glass: 'N-BK7' }], group: 'g' };
const mirror = { type: 'mirror', id: 'M', name: 'Fold', x: 40, y: 0, angle: 135, length: 25, group: 'g' };
/* an assembly of these parts, exported: the STEP text and the solids it was made from (their exact boxes, from a fine STL of each) */
function exported(els, name) {
  loadProject({ format: 'jekray', version: 1, elements: JSON.parse(JSON.stringify(els)),
    assemblies: [{ id: 'g', name, ref: els[0].id, cond: { aperture: { kind: 'epd', v: 6 }, fields: [{ deg: 0 }], waves: [{ nm: 587.56 }] } }] });
  const asm = ST.project.assemblies[0], out = CAD.cadSTEP(asm, { date: '2026-01-01T00:00:00' });
  const boxes = CAD.cadSolids(asm).solids.map(s => SC.trisBox(Float32Array.from(CAD.cadTriangles(s, 256, 512).flat(2))));
  return { text: out.text, boxes };
}
const TWO = exported([lens, mirror], 'Lens and mirror'), ONE = exported([lens], 'Lens alone');
const bytesOf = t => new TextEncoder().encode(t);
/* the same file declared in another unit: its numbers as they are, its length unit a centimetre or an inch */
const inUnit = (text, u) => u === 'cm' ? text.replace('SI_UNIT(.MILLI.,.METRE.)', 'SI_UNIT(.CENTI.,.METRE.)')
  : text.replace(/^#(\d+)=\( LENGTH_UNIT\(\) NAMED_UNIT\(\*\) SI_UNIT\(\.MILLI\.,\.METRE\.\) \);$/m, (all, n) =>
    '#' + n + "=( CONVERSION_BASED_UNIT('INCH',#9001) LENGTH_UNIT() NAMED_UNIT(#9002) );\n#9001=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4),#9003);\n#9002=DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.);\n#9003=( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );");
const occt = await occtReader();
const read = (text, name) => { const b = bytesOf(text); return SC.stepRead(b, name, p => occt.ReadStepFile(b, p)); };
const near = (a, b, tol) => a.every((v, k) => Math.abs(v - b[k]) <= tol);

test('the units a STEP file declares: millimetres, centimetres, inches, or millimetres when it says none', () => {
  assert.deepEqual(SC.stepUnit(TWO.text), { units: 'mm', linearUnit: 'millimeter', declared: true });
  assert.equal(SC.stepUnit(inUnit(TWO.text, 'cm')).units, 'cm');
  assert.deepEqual(SC.stepUnit(inUnit(TWO.text, 'in')), { units: 'in', linearUnit: 'inch', declared: true });
  assert.deepEqual(SC.stepUnit('ISO-10303-21;\nDATA;\nENDSEC;'), { units: 'mm', linearUnit: 'millimeter', declared: false });
  // its size sets the chord: a thousandth of the largest spread of its points (the mirror's 40 mm from the lens, and more)
  const p = SC.stepParams(TWO.text, 0), ext = SC.stepExtent(TWO.text);
  assert.ok(ext > 40 && ext < 80, 'extent ' + ext);
  assert.equal(p.linearDeflectionType, 'absolute_value'); assert.ok(Math.abs(p.linearDeflection - ext * 1e-3) < 1e-12);
  assert.ok(SC.STEP_PASSES.every((q, i) => !i || (q.lin > SC.STEP_PASSES[i - 1].lin && q.ang > SC.STEP_PASSES[i - 1].ang)), 'each pass coarser');
});

test('two solids come back as two bodies, each in the box of the solid exported, well inside the budget', async () => {
  const t0 = Date.now(), r = await read(TWO.text, 'two.step'), ms = Date.now() - t0;
  assert.equal(r.bodies.length, 2); assert.equal(r.units, 'mm'); assert.equal(r.declared, true); assert.equal(r.pass, 0);
  assert.ok(r.tris > 200 && r.tris < SC.STEP_TARGET, r.tris + ' triangles');
  r.bodies.forEach((b, i) => {
    const [lo, hi] = SC.trisBox(b.T), [Lo, Hi] = TWO.boxes[i];
    assert.ok(b.T instanceof Float32Array && b.T.length % 9 === 0);
    // the tessellation's points lie on the surfaces: the box is within its chord (and the fine STL's) of the solid's
    assert.ok(near(lo, Lo, 0.15) && near(hi, Hi, 0.15), 'body ' + i + ': ' + lo + ' ' + hi + ' against ' + Lo + ' ' + Hi);
    assert.ok(/^Lens and mirror [12]$/.test(b.name), b.name);
  });
  console.log('# two solids: ' + r.tris + ' triangles, read in ' + ms + ' ms');
  const one = await read(ONE.text, 'lens.step');
  assert.equal(one.bodies.length, 1);
  assert.ok(near(SC.trisBox(one.bodies[0].T)[0], ONE.boxes[0][0], 0.15));
});

test('a file in inches or centimetres is read in its own unit, and the object scaled so', async () => {
  const mm = await read(TWO.text, 'mm.step'), inch = await read(inUnit(TWO.text, 'in'), 'in.step'), cm = await read(inUnit(TWO.text, 'cm'), 'cm.step');
  assert.equal(inch.units, 'in'); assert.equal(cm.units, 'cm');
  const box = r => SC.trisBox(r.bodies[0].T);
  // the numbers come back as written (OpenCascade asked for the file's own unit), so the object's scale makes them millimetres
  for (const r of [inch, cm]) assert.ok(near(box(r)[0], box(mm)[0], 0.2) && near(box(r)[1], box(mm)[1], 0.2), r.units);
  const B = await openBench({ format: 'jekray', version: 1, elements: [] });
  await B.step(bytesOf(inUnit(ONE.text, 'in')), 'lens-in.step', 0, 0);
  const e = B.serialize().elements[0];
  assert.equal(e.units, 'in'); assert.equal(e.scale, 25.4);
  assert.ok(Math.abs(e.z - e.mesh.size[2] * 25.4 / 2) < 1e-9, 'resting on the breadboard, in millimetres');
});

test('one object, or separate parts grouped in place: the same shape on the bench either way', async () => {
  const B = await openBench({ format: 'jekray', version: 1, elements: [] });
  const parts = await B.step(bytesOf(TWO.text), 'two.step', 100, 50, { as: 'parts' });
  const one = await B.step(bytesOf(TWO.text), 'two.step', 100, 50, { as: 'one' });
  assert.equal(parts.names.length, 2); assert.deepEqual(one.names, ['two']);
  const els = B.serialize().elements, P = els.slice(0, 2), O = els[2];
  assert.ok(P[0].group && P[0].group === P[1].group, 'the parts are one group'); assert.ok(!O.group);
  // each element's box on the bench (its centre is its place: x, y and height), the parts' together against the one's
  const world = e => { const T = meshTris(e.mesh), [lo, hi] = SC.trisBox(T); return [lo.map((v, k) => v + [e.x, e.y, e.z][k]), hi.map((v, k) => v + [e.x, e.y, e.z][k])]; };
  const W = P.map(world), U = [[0, 1, 2].map(k => Math.min(W[0][0][k], W[1][0][k])), [0, 1, 2].map(k => Math.max(W[0][1][k], W[1][1][k]))], WO = world(O);
  assert.ok(near(U[0], WO[0], 0.01) && near(U[1], WO[1], 0.01), JSON.stringify([U, WO]));
  assert.ok(Math.abs(WO[0][2]) < 0.01 && Math.abs((WO[0][0] + WO[1][0]) / 2 - 100) < 0.01 && Math.abs((WO[0][1] + WO[1][1]) / 2 - 50) < 0.01, 'centred where it was put, on the breadboard');
  // and the parts sit apart as the file has them: the mirror's centre from the lens's as the solids' boxes have it
  const c = b => b[0].map((v, k) => (v + b[1][k]) / 2), d = c(W[1]).map((v, k) => v - c(W[0])[k]), D = c(TWO.boxes[1]).map((v, k) => v - c(TWO.boxes[0])[k]);
  assert.ok(near(d, D, 0.1), JSON.stringify([d, D]));
  // a single solid needs no choice: one object either way
  const B1 = await openBench({ format: 'jekray', version: 1, elements: [] });
  assert.equal((await B1.step(bytesOf(ONE.text), 'lens.step', 0, 0, { as: 'parts' })).names.length, 1);
});

test('the object it makes is a beam block: raised to the beam, the rays that meet it stop', async () => {
  const bench = { format: 'jekray', version: 1, elements: [
    { type: 'source', id: 'S', name: 'S', x: -60, y: 0, angle: 0, wavelength: 633, rays: 5, width: 30, pol: 's' },
    { type: 'screen', id: 'Sc', name: 'Sc', x: 60, y: 0, angle: 180, length: 100 }] };
  const B = await openBench(bench), r = await B.step(bytesOf(ONE.text), 'lens.step', 0, 0);
  assert.equal(B.screen('Sc').count, 5, 'on the breadboard, under the beam, it stops none');
  B.set(r.names[0], 'z', 75);
  // the lens lies on its face (its axis is the file's z, up): a 25 mm disc across the beam stops the three within ±10 mm
  assert.equal(B.screen('Sc').count, 2);
});

test('too many triangles: read again more coarsely, pass by pass; a file that is not STEP, or is broken, is refused', async () => {
  const calls = [], big = n => ({ success: true, root: { name: '', meshes: [0], children: [] }, meshes: [{ name: 'm', attributes: { position: { array: [0, 0, 0, 1, 0, 0, 0, 1, 0] } }, index: { array: new Array(3 * n).fill(0).map((v, i) => i % 3) } }] });
  const r = await SC.stepRead(bytesOf(TWO.text), 'x.step', p => { calls.push(p); return big(calls.length < 3 ? 50000 : 1000); });
  assert.equal(r.pass, 2); assert.equal(calls.length, 3); assert.ok(calls[2].linearDeflection > calls[1].linearDeflection && calls[1].linearDeflection > calls[0].linearDeflection);
  const stuck = await SC.stepRead(bytesOf(TWO.text), 'x.step', () => big(60000));
  assert.equal(stuck.pass, SC.STEP_PASSES.length - 1, 'after the last pass it is left to meshEncode');
  // which then keeps the parts within STL_KEEP between them, by size
  const plan = SC.stepPlan([{ name: 'a', T: new Float32Array(9 * 60000) }, { name: 'b', T: new Float32Array(9 * 20000) }], 'x.step', 'parts', 'mm', 1);
  assert.deepEqual(plan.map(p => p.budget), [30000, 10000]);
  await assert.rejects(SC.stepRead(bytesOf('solid cube\nendsolid'), 'cube.step', () => null), /not a STEP file/);
  await assert.rejects(read(TWO.text.slice(0, 2000), 'broken.step'), /could not read|no solids/);
});

test('bodies are named from the file’s parts, numbered where a part has several or a name comes twice', () => {
  const M = () => ({ name: '', attributes: { position: { array: [0, 0, 0, 1, 0, 0, 0, 1, 0] } }, index: { array: [0, 1, 2] } });
  const res = { success: true, meshes: [M(), M(), M(), Object.assign(M(), { name: 'Screw', color: [1, 0, 0] }), Object.assign(M(), { name: 'Screw' })],
    root: { name: '', meshes: [], children: [{ name: 'Post', meshes: [0], children: [] }, { name: 'Clamp', meshes: [1, 2], children: [] }, { name: '', meshes: [3, 4], children: [] }] } };
  const B = SC.stepBodies(res, 'mount.step');
  assert.deepEqual(B.map(b => b.name), ['Post', 'Clamp 1', 'Clamp 2', 'Screw', 'Screw (2)']);
  assert.equal(B[3].colour, '#ff0000');
  assert.deepEqual(SC.stepBodies({ success: true, meshes: [M()], root: { name: '', meshes: [0], children: [] } }, 'mount.stp').map(b => b.name), ['mount part 1']);
  assert.ok(STL_KEEP === 40000);
});
