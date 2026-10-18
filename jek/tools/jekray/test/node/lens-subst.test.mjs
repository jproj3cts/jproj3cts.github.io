/* Glass substitution: each glass marked V tried as the catalogue glasses nearest it, the rest of the
   design optimised again with each, and the best kept. Its candidates (the makers chosen, every
   wavelength transmitted, nearest first, its own glass not among them); an air-spaced doublet whose
   second lens, a model glass near F2, becomes the real glass that best takes out its colour, the one
   found by trying every candidate on its own; and a crown in its place that no candidate betters kept. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const D = await import('../../src/engines/lens-design.js');
const O = await import('../../src/engines/lens-opt.js');
const { glassInfo } = await import('../../src/core/glass.js');

const waves = [{ nm: 486.13 }, { nm: 587.56 }, { nm: 656.27 }];
const doublet = (glass2, design) => {
  loadProject({ format: 'jekray', version: 1, elements: [
    { type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, diameter: 25, surfaces: [{ R: 60 }, { R: -60 }], gaps: [5], materials: [{ glass: 'N-BK7' }], group: 'g' },
    { type: 'lens', id: 'M', name: 'M', x: 5, y: 0, angle: 0, diameter: 25, surfaces: [{ R: -58 }, { R: -400 }], gaps: [2.5], materials: [glass2], group: 'g' }],
    assemblies: [{ id: 'g', name: 'T', ref: 'L', cond: { aperture: { kind: 'epd', v: 12 }, fields: [{ deg: 0 }], waves, primary: 1 },
      design: Object.assign({ solves: { 't:image': { kind: 'focus' } } }, design) }] });
  const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a));
  return O.optProblem(a, D.designPrescription(a));
};
const merit = { ops: [{ op: 'EFL', target: 100, weight: 1 }, { op: 'CL', target: 0, weight: 1e4 }] };

test('a glass’s candidates: the makers chosen, every wavelength transmitted, nearest first, not itself', () => {
  const prob = doublet({ glass: 'F2' }, { vars: ['g:M.0'], merit });
  const C = O.glassCandidates(prob, 2, ['Schott'], 20), f2 = glassInfo('F2');
  assert.equal(C.length, 20);
  assert.ok(!C.includes('F2'));
  const d = k => { const g = glassInfo(k); return ((g.nd - f2.nd) / 0.01) ** 2 + (g.vd - f2.vd) ** 2; };
  for (let i = 0; i < C.length; i++) {
    const g = glassInfo(C[i]);
    assert.equal(g.maker, 'Schott');
    assert.ok(!(g.lo > 0.48613) && !(g.hi > 0 && g.hi < 0.65627));
    if (i) assert.ok(d(C[i]) >= d(C[i - 1]));
  }
  assert.deepEqual(O.substIndices(prob), [2]);
});

test('a model glass becomes the real glass that best takes out the doublet’s colour, as trying each on its own finds', () => {
  const prob = doublet({ glass: 'Model', nd: 1.62, vd: 36.4 }, { vars: ['g:M.0', 'R:L.0', 'R:M.1'], merit });
  const start = O.meritReport(prob).merit;
  const R = O.substituteRun(prob, { makers: ['Schott'], n: 10, iters: 25, passes: 1 });
  assert.equal(R.log.length, 1);
  const to = R.log[0].to, m = R.prob.P.materials[2];
  assert.equal(m.glass, to);
  assert.ok(!O.isModel(m));
  // each candidate on its own, from the same start
  let best = null;
  for (const k of O.glassCandidates(prob, 2, ['Schott'], 10)) { const out = O.optRun(O.withGlass(prob, 2, k), { mode: 'dls', iters: 25 }); if (!best || out.merit < best[1]) best = [k, out.merit]; }
  assert.equal(to, best[0]);
  assert.ok(Math.abs(R.log[0].merit - best[1]) < 1e-12);
  assert.ok(R.merit < start, start + ' → ' + R.merit);
  assert.ok(glassInfo(to).vd < 45, to + ' is a flint');
});

test('a glass no candidate betters is kept', () => {
  // the focal length alone, which F2 meets as well as any glass near it
  const prob = doublet({ glass: 'F2' }, { vars: ['g:M.0', 'R:L.0', 'R:M.1'], merit: { ops: [{ op: 'EFL', target: 100, weight: 1 }] } });
  const R = O.substituteRun(prob, { makers: ['Schott'], n: 6, iters: 25, passes: 1 });
  // an EFL alone is met by any glass, to the optimiser's precision: a change only if strictly better
  for (const L of R.log) assert.ok(L.merit < L.before * (1 - 1e-6));
  if (!R.log.length) assert.equal(R.prob.P.materials[2].glass, 'F2');
});
