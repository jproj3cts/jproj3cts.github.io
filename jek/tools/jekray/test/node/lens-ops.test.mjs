/* More terms for the merit function: each one's value what the system gives, and the optimiser meeting a
   target with one. A singlet made telecentric in image space (its chief ray's angle at the image held at 0)
   puts its stop at its front focal point, as its principal planes and focal length have it. */
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

function load(design, cond) {
  loadProject({ format: 'jekray', version: 1, elements: [
    { type: 'stop', id: 'S', name: 'S', x: -30, y: 0, angle: 0, aperture: 4, group: 'g' },
    { type: 'lens', id: 'L', name: 'L', x: 2.5, y: 0, angle: 0, diameter: 30, surfaces: [{ R: 50 }, { R: -50 }], gaps: [5], materials: [{ glass: 'N-BK7' }], group: 'g' }],
    assemblies: [{ id: 'g', name: 'T', ref: 'L', cond: cond || { aperture: { kind: 'epd', v: 4 }, fields: [{ deg: 0 }, { deg: 1 }], waves: [{ nm: 587.56 }] }, design }] });
  const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a)); return a;
}
const value = (asm, op, extra) => { const P = D.designPrescription(asm), prob = O.optProblem(asm, P); prob.design = Object.assign({}, prob.design, { merit: A.normMerit({ ops: [Object.assign({ op, target: 0, weight: 1 }, extra)] }) }); return O.meritTerms(prob, P).ops[0].value; };

test('the new terms read what the system gives: back focus, image distance, magnification, NA, exit pupil, real ray heights and angles', () => {
  const asm = load({ solves: { 't:image': { kind: 'focus' } } }), P = D.designPrescription(asm), S = E.lensSystem(P, 587.56, { epd: 4, image: P.image });
  assert.ok(Math.abs(value(asm, 'BFL') - S.par.bfl) < 1e-12 && Math.abs(value(asm, 'IMD') - S.par.back) < 1e-12);
  assert.equal(value(asm, 'MAG'), 0);
  assert.ok(Math.abs(value(asm, 'NA') - S.epr * Math.abs(S.par.uEp)) < 1e-12);
  assert.ok(Math.abs(value(asm, 'XPD') - (S.imageZ - S.par.xpz)) < 1e-12);
  const th = Math.PI / 180, C = E.rayAt(S, th, 0, 0), M = E.rayAt(S, th, 0, 1);
  assert.ok(Math.abs(value(asm, 'IMH', { f: 1 }) - C[1]) < 1e-12 && Math.abs(value(asm, 'CRA', { f: 1 }) - Math.atan2(C[4], C[5]) * 180 / Math.PI) < 1e-12);
  assert.ok(Math.abs(value(asm, 'RAYY', { f: 1, p: 1 }) - M[1]) < 1e-12);
  // a finite object: the magnification
  const fin = load({ solves: { 't:image': { kind: 'focus' } } }, { object: { kind: 'finite', d: 150 }, aperture: { kind: 'epd', v: 4 }, fields: [{ deg: 0 }], waves: [{ nm: 587.56 }] });
  const Sf = E.lensSystem(D.designPrescription(fin), 587.56, { object: 150 });
  assert.ok(Math.abs(value(fin, 'MAG') - Sf.par.mag) < 1e-12 && Sf.par.mag < 0);
});

test('a singlet made telecentric in image space: its stop at its front focal point', () => {
  const asm = load({ solves: { 't:image': { kind: 'focus' } }, vars: ['t:S.0'], merit: { ops: [{ op: 'CRA', target: 0, weight: 1e4, f: 1 }] } });
  const P = D.designPrescription(asm), prob = O.optProblem(asm, P), out = O.optRun(prob, { mode: 'dls', iters: 60 });
  O.optApply(P, prob, out); D.commitDesign(asm, P);
  const P1 = D.designPrescription(asm), g = P1.gaps[0];
  // the front focal distance: the focal length beyond the front principal plane, δ1 = −f (n − 1) t / (n R2) from the first vertex
  const S = E.lensSystem(P1, 587.56), n = S.n[2], f = S.par.efl, d1 = -f * (n - 1) * 5 / (n * -50);
  assert.ok(Math.abs(g - (f - d1)) < 2e-3 * f, 'stop ' + g + ' before the lens; front focus ' + (f - d1));
  assert.ok(Math.abs(value(asm, 'CRA', { f: 1 })) < 1e-3);
});
