/* Limits on the values the optimiser varies: a radius's turned into curvatures on the side of its sign; a
   singlet whose best bending is out of bounds ends exactly at its limit, as well as it can do there; a
   global search that never leaves them; and the limits kept in the file, a pair given the wrong way round
   turned about. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject, serialize } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const D = await import('../../src/engines/lens-design.js');
const O = await import('../../src/engines/lens-opt.js');
const { normLims } = await import('../../src/core/assembly.js');

const singlet = lims => {
  loadProject({ format: 'jekray', version: 1, elements: [{ type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, diameter: 25, surfaces: [{ R: 80 }, { R: -80 }], gaps: [5], materials: [{ glass: 'N-BK7' }], group: 'g' }],
    assemblies: [{ id: 'g', name: 'T', ref: 'L', cond: { aperture: { kind: 'epd', v: 20 }, fields: [{ deg: 0 }], waves: [{ nm: 587.56 }] },
      design: { solves: { 't:image': { kind: 'focus' } }, vars: ['R:L.0', 'R:L.1'], merit: { ops: [{ op: 'EFL', target: 100, weight: 10 }] }, ...(lims ? { lims } : {}) } }] });
  const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a)); return a;
};
const run = (a, iters) => { const P = D.designPrescription(a), prob = O.optProblem(a, P), out = O.optRun(prob, { mode: 'dls', iters: iters || 60 }); O.optApply(P, prob, out); D.commitDesign(a, P); return out; };
const R1 = () => ST.project.elements[0].surfaces[0].R;

test('a radius’s limits as curvatures, on the side of their sign', () => {
  const a = singlet(), prob = O.optProblem(a, D.designPrescription(a)), V = O.optVars(prob);
  const lim = m => { prob.design.lims = { 'R:L.0': m }; const L = O.limitsX(prob, V); return [L.lo[0], L.hi[0]]; };
  assert.deepEqual(lim({ lo: 20, hi: 50 }), [0.02, 0.05]);
  assert.deepEqual(lim({ lo: -50, hi: -20 }), [-0.05, -0.02]);
  assert.deepEqual(lim({ lo: 20 }), [0, 0.05]);
  assert.deepEqual(lim({ hi: 20 }), [0.05, Infinity]);
  assert.deepEqual(lim({ lo: -20 }), [-Infinity, -0.05]);
  assert.deepEqual(lim({ hi: -20 }), [-0.05, 0]);
  assert.deepEqual(lim({ lo: -20, hi: 20 }), [-Infinity, Infinity]);
  assert.deepEqual(normLims({ 'R:L.0': { lo: 50, hi: 20 }, 't:L.0': { lo: '' }, 'bad key': { lo: 1 } }), { 'R:L.0': { lo: 20, hi: 50 } });
});

test('a singlet whose best bending is out of bounds ends at its limit, as well as it can do there', () => {
  // free: the front radius the focal length and least spot ask for
  const free = singlet(); run(free); const best = R1();
  // its front radius held to at least 1.5 times that: it ends on the limit
  const lo = 1.5 * best, a = singlet({ 'R:L.0': { lo } }), out = run(a);
  assert.ok(Math.abs(R1() - lo) < 1e-9 * lo, R1() + ' against ' + lo);
  assert.ok(Math.abs(D.designFigures(a, D.designPrescription(a)).efl - 100) < 1e-3);
  // nothing inside the limit does better: a little further in, the back radius optimised alone
  const b = singlet({ 'R:L.0': { lo: 1.05 * lo } }); run(b);
  const mb = O.meritReport(O.optProblem(b, D.designPrescription(b))).merit;
  assert.ok(out.merit <= mb + 1e-12, out.merit + ' against ' + mb);
});

test('a global search never leaves the limits, and they are saved with the design', () => {
  const a = singlet({ 'R:L.0': { lo: 60, hi: 120 }, 'R:L.1': { lo: -400, hi: -60 } });
  const P = D.designPrescription(a), prob = O.optProblem(a, P), out = O.optRun(prob, { mode: 'global', trials: 6, seed: 2 });
  for (const f of out.found.concat([{ x: out.x }])) { assert.ok(1 / f.x[0] >= 60 - 1e-9 && 1 / f.x[0] <= 120 + 1e-9, 'R1 ' + 1 / f.x[0]); assert.ok(1 / f.x[1] >= -400 - 1e-9 && 1 / f.x[1] <= -60 + 1e-9, 'R2 ' + 1 / f.x[1]); }
  assert.deepEqual(serialize().assemblies[0].design.lims, { 'R:L.0': { lo: 60, hi: 120 }, 'R:L.1': { lo: -400, hi: -60 } });
});
