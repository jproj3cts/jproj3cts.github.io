/* Physics regressions: the .agf Sellmeier 2 formula as OpticStudio has it; a mirror coating -√R as a mirror is, and
   beyond the critical angle too; a stack under total internal reflection all reflected, a stack of nothing bare TIR's
   phase, and a stack's phase in the tracer's e^{+ikL}; a graded gap before the stop in the pupils' first order. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const GL = await import('../../src/core/glass.js');
const FP = await import('../../src/core/face-pol.js');
const C = await import('../../src/core/coatings.js');
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const E = await import('../../src/engines/lens-engine.js');
const D = await import('../../src/engines/lens-design.js');
const a2 = a => a[0] * a[0] + a[1] * a[1];
const near = (a, b, e) => Math.hypot(a[0] - b[0], a[1] - b[1]) < (e || 1e-12);

test('agf formula 4, Sellmeier 2: n² - 1 = A + B1 λ²/(λ² - λ1²) + B2/(λ² - λ2²)', () => {
  const c = [0.02, 1.25, 0.095, 0.4, 9];
  for (const um of [0.4861, 0.5876, 0.6563, 1.064]) {
    const L2 = um * um, want = Math.sqrt(1 + c[0] + c[1] * L2 / (L2 - c[2] ** 2) + c[3] / (L2 - c[4] ** 2));
    assert.ok(Math.abs(GL.agfIndex(4, c, um) - want) < 1e-14, um + ': ' + GL.agfIndex(4, c, um) + ' against ' + want);
  }
  // with B2 = 0 and λ1 = 0 it is n² = 1 + A + B1
  assert.ok(Math.abs(GL.agfIndex(4, [0.1, 1.15, 0, 0, 0], 0.6) - Math.sqrt(2.25)) < 1e-14);
});

test('a mirror coating reflects -√R for s and p, as a mirror element does, and beyond the critical angle too', () => {
  const coat = { mode: 'mirror', metal: 'Al' }, R = C.mirrorR(coat, 633), M = FP.mirrorAmps(R, false);
  for (const [n1, n2, deg] of [[1, 1.5, 0], [1, 1.5, 30], [1.5, 1, 0], [1.5, 1, 60]]) {
    const F = FP.faceAmps({ coat }, n1, n2, Math.cos(deg * Math.PI / 180), 633);
    assert.ok(near(F.rs, M.rs) && near(F.rp, M.rp) && a2(F.ts) === 0 && a2(F.tp) === 0 && F.tir, n1 + '→' + n2 + ' ' + deg + '°: ' + JSON.stringify(F));
  }
  // an HR stack square on is nearly -1 too
  const H = FP.faceAmps({ coat: { mode: 'stack', layers: C.coatPreset('hr', 633) } }, 1, 1.5, 1, 633);
  assert.ok(H.rs[0] < -0.99 && Math.abs(H.rs[1]) < 1e-9, JSON.stringify(H.rs));
});

test('under total internal reflection a stack reflects everything, and a stack of nothing is bare TIR to the phase', () => {
  for (const deg of [45, 60, 80]) {
    const ci = Math.cos(deg * Math.PI / 180), B = FP.faceAmps({}, 1.5, 1, ci, 633), Z = FP.faceAmps({ coat: { mode: 'stack', layers: [{ n: 1.2, d: 0 }] } }, 1.5, 1, ci, 633);
    assert.ok(B.tir && Z.tir && near(Z.rs, B.rs) && near(Z.rp, B.rp), deg + '°: ' + JSON.stringify([Z.rs, Z.rp]) + ' against ' + JSON.stringify([B.rs, B.rp]));
    for (const L of [C.coatPreset('mgf2', 550), C.coatPreset('hr', 550), [{ n: 2.3, d: 80 }, { n: 1.38, d: 300 }]]) {
      const F = FP.faceAmps({ coat: { mode: 'stack', layers: L } }, 1.5, 1, ci, 633);
      assert.ok(F.tir && Math.abs(a2(F.rs) - 1) < 1e-12 && Math.abs(a2(F.rp) - 1) < 1e-12 && a2(F.ts) === 0 && a2(F.tp) === 0, deg + '°: ' + JSON.stringify(F));
    }
  }
});

test('a stack’s phase is the tracer’s e^{+ikL}: a layer of the outside medium d thick delays the reflection by 2kd', () => {
  const nm = 633, d = 50, r0 = FP.faceAmps({}, 1, 1.5, 1, nm).rs, r1 = FP.faceAmps({ coat: { mode: 'stack', layers: [{ n: 1, d }] } }, 1, 1.5, 1, nm).rs;
  const ph = 4 * Math.PI * d / nm, want = [r0[0] * Math.cos(ph), r0[0] * Math.sin(ph)];
  assert.ok(near(r1, want, 1e-12), JSON.stringify(r1) + ' against ' + JSON.stringify(want));
});

test('a graded gap before the stop: the stop’s height and the entrance pupil through the rod’s own matrix', () => {
  const rod = { type: 'lens', id: 'R', name: 'R', x: 0, y: 0, angle: 0, graded: true, diameter: 1.8, surfaces: [{ R: null }, { R: null }], gaps: [3], materials: [{ glass: 'custom', n: 1.608, grad: [-0.08545] }], group: 'g' };
  loadProject({ format: 'jekray', version: 1, elements: [rod], assemblies: [{ id: 'g', name: 'T', ref: 'R', cond: { aperture: { kind: 'epd', v: 0.5 }, fields: [{ deg: 0 }], waves: [{ nm: 633 }] }, design: { solves: { 't:image': { kind: 'focus' } } } }] });
  const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a));
  const P = D.designPrescription(a); P.stopIndex = 1;
  // the stop at the rod's back face: a ray in at height 1 is there at cos kL, one in at angle 1 at sin kL / (n k)
  const S = E.lensSystem(P, 633), n = 1.608, k = Math.sqrt(2 * 0.08545 / n), ya = Math.cos(3 * k), yb = Math.sin(3 * k) / (n * k);
  assert.ok(Math.abs(S.par.stopMag - Math.abs(ya)) < 1e-12, 'stopMag ' + S.par.stopMag + ' against ' + Math.abs(ya));
  assert.ok(Math.abs(S.par.epz - yb / ya) < 1e-12, 'epz ' + S.par.epz + ' against ' + yb / ya);
});
