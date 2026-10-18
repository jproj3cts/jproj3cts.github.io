/* The MTF as a merit term: at one frequency, from two shifts of the sampled pupil function, the same as the
   MTF view's curve and, for a perfect lens, the round pupil's own; and the optimiser, asked for the most
   MTF at a frequency, putting the image plane where that MTF is highest, not at the paraxial focus. */
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
const AN = await import('../../src/engines/lens-analysis.js');

test('the MTF at one frequency: the round pupil’s own for a perfect mirror, and the MTF view’s curve for a real lens', () => {
  const par = { surfaces: [{ R: -200, k: -1, a2: 0, A: [], odd: null, semi: 20, mirror: true, stop: true }], gaps: [], materials: [], stopIndex: 0 };
  const S = E.lensSystem(par, 587.56, { epd: 20 }), fw = 1 / (2 * S.epr * Math.abs(S.par.uEp)), nuc = 1 / (S.lam * fw);
  for (const r of [0.2, 0.5, 0.8]) {
    const m = AN.mtfAt([S], [1], fw, 0, r * nuc, 'T', 48);
    assert.ok(Math.abs(m - AN.mtfPerfect(r)) < 0.02, r + ': ' + m + ' against ' + AN.mtfPerfect(r));
  }
  loadProject({ format: 'jekray', version: 1, elements: [{ type: 'lens', id: 'L', name: 'L', x: 2, y: 0, angle: 0, diameter: 25, surfaces: [{ R: 40 }, { R: -200 }], gaps: [4], materials: [{ glass: 'N-BK7' }], group: 'g' }],
    assemblies: [{ id: 'g', name: 'S', ref: 'L', cond: { aperture: { kind: 'epd', v: 12 }, fields: [{ deg: 0 }, { deg: 3 }], waves: [{ nm: 587.56 }] }, design: { solves: { 't:image': { kind: 'focus' } } } }] });
  const asm = ST.project.assemblies[0], P = D.designPrescription(asm), An = AN.anaSystems(asm, P), M = AN.mtfAnalysis(An, 3, undefined, 48);
  const k = 12, at = AN.mtfAt(An.S, [1], An.fw, 3, M.freqs[k], 'T', 48);
  assert.ok(Math.abs(at - M.tan[k]) < 1e-9, at + ' against ' + M.tan[k]);
});

test('the most MTF at 20 cycles/mm, the image plane free: a focus where it is highest, better than the paraxial focus', () => {
  loadProject({ format: 'jekray', version: 1, elements: [{ type: 'lens', id: 'L', name: 'L', x: 2, y: 0, angle: 0, diameter: 25, surfaces: [{ R: 40 }, { R: -200 }], gaps: [4], materials: [{ glass: 'N-BK7' }], group: 'g' }],
    assemblies: [{ id: 'g', name: 'S', ref: 'L', cond: { aperture: { kind: 'epd', v: 16 }, fields: [{ deg: 0 }], waves: [{ nm: 587.56 }] },
      design: { solves: { 't:image': { kind: 'focus' } }, merit: { ops: [{ op: 'MTFA', target: 1, weight: 1e4, f: 0, v: 20 }] } } }] });
  const asm = ST.project.assemblies[0];
  const mtf = () => { const P = D.designPrescription(asm), prob = O.optProblem(asm, P); return O.meritTerms(prob, P).ops[0].value; };
  const m0 = mtf(), img0 = D.designPrescription(asm).image;
  // the image distance freed from the focus solve and marked V
  asm.design = A.normDesign(Object.assign({}, asm.design, { solves: {}, image: img0, vars: ['t:image'] }));
  const P = D.designPrescription(asm), prob = O.optProblem(asm, P), out = O.optRun(prob, { mode: 'dls', iters: 40 });
  O.optApply(P, prob, out); D.commitDesign(asm, P);
  const img = D.designPrescription(asm).image, m1 = mtf();
  assert.ok(m1 > m0 + 0.05 && Math.abs(img - img0) > 0.05, 'MTF ' + m0 + ' at the paraxial focus to ' + m1 + ', the image moved ' + (img - img0));
  // a maximum: a little either way is no better
  for (const d of [-0.02, 0.02]) { asm.design.image = img + d; const md = mtf(); assert.ok(md <= m1 + 1e-6, 'at ' + d + ': ' + md + ' against ' + m1); }
});
