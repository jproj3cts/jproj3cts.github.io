/* Configurations: one design in several states. Two identical configurations measure as one; a lens
   refocused for two object distances keeps each one's image at its own paraxial focus; two singlets
   whose spacing differs between two configurations reach a focal length in each (a two-position zoom),
   the spacings worked out separately and the shared radii once; switching puts each configuration's
   values on the bench; inserting a surface keeps the merit function and the configurations. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const A = await import('../../src/core/assembly.js');
const E = await import('../../src/engines/lens-engine.js');
const D = await import('../../src/engines/lens-design.js');
const O = await import('../../src/engines/lens-opt.js');

function load(els, design, cond) {
  loadProject({ format: 'jekray', version: 1, elements: els.map(e => Object.assign({ group: 'g' }, e)),
    assemblies: [{ id: 'g', name: 'T', ref: els.find(e => e.type === 'lens').id, cond: cond || { aperture: { kind: 'epd', v: 6 }, fields: [{ deg: 0 }, { deg: 1 }], waves: [{ nm: 587.56 }] }, design }] });
  const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a)); return a;
}
const singlet = [{ type: 'lens', id: 'L', name: 'L', x: 2.5, y: 0, angle: 0, diameter: 30, surfaces: [{ R: 50 }, { R: -50 }], gaps: [5], materials: [{ glass: 'N-BK7' }] }];
const pair = [
  { type: 'stop', id: 'S', name: 'S', x: -5, y: 0, angle: 0, aperture: 6 },
  { type: 'lens', id: 'L1', name: 'L1', x: 1.5, y: 0, angle: 0, diameter: 25, surfaces: [{ R: 103 }, { R: -103 }], gaps: [3], materials: [{ glass: 'N-BK7' }] },
  { type: 'lens', id: 'L2', name: 'L2', x: 31.5, y: 0, angle: 0, diameter: 25, surfaces: [{ R: 103 }, { R: -103 }], gaps: [3], materials: [{ glass: 'N-BK7' }] }];
const efl = asm => E.lensSystem(D.designPrescription(asm), 587.56).par.efl;

test('the configurations are kept as data: normalised, and their keys follow parts pasted as copies', () => {
  const mc = A.normMc({ keys: ['t:L.1', 'g:L.0', 'bad'], configs: [{ name: 'Far', v: { 't:L.1': 90, 'x': 1 }, obj: 1e4 }, { v: { 't:L.1': '95' }, w: 2 }], active: 5 });
  assert.deepEqual(mc.keys, ['t:L.1']);
  assert.deepEqual(mc.configs[0], { name: 'Far', w: 1, v: { 't:L.1': 90 }, obj: 1e4 });
  assert.deepEqual(mc.configs[1], { name: 'Configuration 2', w: 2, v: { 't:L.1': 95 } });
  assert.equal(mc.active, 1);
  assert.equal(A.normMc({ keys: [], configs: [{}] }), null);
  const r = A.remapDesign({ mc, vars: [] }, new Map([['L', 'M']]));
  assert.deepEqual(r.mc.keys, ['t:M.1']);
  assert.equal(r.mc.configs[1].v['t:M.1'], 95);
  // an operand set for one configuration keeps it
  assert.equal(A.normMerit({ ops: [{ op: 'EFL', c: 1 }, { op: 'EFL' }] }).ops.map(o => o.c).join(), '1,');
});

test('two identical configurations measure as the design does alone', () => {
  const asm = load(singlet, { solves: { 't:image': { kind: 'focus' } }, merit: { ops: [{ op: 'EFL', target: 40, weight: 1 }] } });
  const P = D.designPrescription(asm), m0 = O.meritReport(O.optProblem(asm, P)).merit;
  assert.equal(D.mcAdd(asm), true);
  const m2 = O.meritReport(O.optProblem(asm, D.designPrescription(asm)));
  assert.ok(Math.abs(m2.merit - m0) < 1e-12, m2.merit + ' against ' + m0);
  assert.equal(m2.ops.length, 2);
  assert.deepEqual(m2.configs, ['Configuration 1', 'Configuration 2']);
});

test('a lens refocused for two object distances: each configuration’s image at its own paraxial focus', () => {
  const cond = { object: { kind: 'finite', d: 200 }, aperture: { kind: 'epd', v: 4 }, fields: [{ deg: 0 }], waves: [{ nm: 587.56 }] };
  const asm = load(singlet, { solves: { 't:image': { kind: 'focus' } } }, cond);
  D.mcAdd(asm);
  const M = D.mcOf(D.designOf(asm));
  D.mcKey(asm, D.designPrescription(asm), 't:image', true);
  // the second configuration's object moved to 1000 mm: switching to it puts that in the conditions and refocuses
  M.configs[1].obj = 1000;
  D.commitDesign(asm, D.designPrescription(asm));
  const back = d => E.lensSystem(D.designPrescription(asm), 587.56, { object: d }).par.back;
  const near = D.designPrescription(asm).image;
  assert.ok(Math.abs(near - back(200)) < 1e-9);
  assert.ok(Math.abs(M.configs[1].v['t:image'] - back(1000)) < 1e-9, 'kept for the far object: ' + M.configs[1].v['t:image']);
  assert.equal(D.mcSwitch(asm, 1), true);
  assert.equal(asm.cond.object.d, 1000);
  assert.ok(Math.abs(D.designPrescription(asm).image - back(1000)) < 1e-9);
  assert.ok(Math.abs(M.configs[0].v['t:image'] - near) < 1e-9 && M.configs[0].obj === 200);
  D.mcSwitch(asm, 0);
  assert.equal(asm.cond.object.d, 200);
  assert.ok(Math.abs(D.designPrescription(asm).image - near) < 1e-9);
});

test('a two-position zoom: the spacing optimised in each configuration to its own focal length, the radii shared', () => {
  const asm = load(pair, { solves: { 't:image': { kind: 'focus' } }, vars: ['t:L1.1'],
    merit: { ops: [{ op: 'EFL', target: 60, weight: 1e3, c: 0 }, { op: 'EFL', target: 75, weight: 1e3, c: 1 }] } });
  D.mcAdd(asm);
  D.mcKey(asm, D.designPrescription(asm), 't:L1.1', true);
  const P = D.designPrescription(asm), prob = O.optProblem(asm, P), V = O.optVars(prob);
  assert.deepEqual(V.map(v => v.cfg), [0, 1]);
  const out = O.optRun(prob, { mode: 'dls', iters: 40 });
  assert.ok(out.merit < out.start);
  O.optApply(P, prob, out, D.designOf(asm)); D.commitDesign(asm, P);
  const M = D.mcOf(D.designOf(asm)), g0 = M.configs[0].v['t:L1.1'], g1 = M.configs[1].v['t:L1.1'];
  assert.ok(Math.abs(efl(asm) - 60) < 0.05, 'first: ' + efl(asm));
  D.mcSwitch(asm, 1);
  assert.ok(Math.abs(efl(asm) - 75) < 0.05, 'second: ' + efl(asm));
  assert.ok(g0 < g1, 'the longer focal length the wider spacing: ' + g0 + ', ' + g1);
  assert.ok(Math.abs(D.designPrescription(asm).gaps[2] - g1) < 1e-9);
  // the merit report names each operand's configuration
  const R = O.meritReport(O.optProblem(asm, D.designPrescription(asm)));
  assert.deepEqual(R.ops.map(o => o.cfg), [0, 1]);
  assert.ok(R.fields.length === 4 && R.fields[2].cfg === 1);
});

test('inserting a surface keeps the merit function and the configurations’ keys; a configuration taken out takes its operands', () => {
  const asm = load(pair, { solves: { 't:image': { kind: 'focus' } }, merit: { ops: [{ op: 'EFL', target: 60, weight: 1, c: 1 }, { op: 'TTL', target: 80, weight: 1 }] } });
  D.mcAdd(asm);
  D.mcKey(asm, D.designPrescription(asm), 't:L1.1', true);
  D.mcOf(D.designOf(asm)).configs[1].v['t:L1.1'] = 40;
  assert.equal(D.insertSurface(asm, D.designPrescription(asm), 1), true);
  const De = D.designOf(asm);
  assert.equal(De.merit.ops.length, 2);
  assert.deepEqual(De.mc.keys, ['t:L1.2']);           // the key followed its surface, now L1's third
  assert.equal(De.mc.configs[1].v['t:L1.2'], 40);
  D.mcRemove(asm, 1);
  assert.equal(De.mc, undefined);
  assert.deepEqual(De.merit.ops.map(o => o.op), ['TTL']);
});
