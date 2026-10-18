/* Relative illumination, from the projected solid angle the exit pupil fills as each image point sees it (image space),
   against the flux from an object of even radiance counted ray by ray in object space (each ray's pupil area over its own
   Jacobian onto the image), both on the axis's: to 1%. A singlet behind its stop, with no vignetting, and with a lens
   small enough to clip the oblique beams. (Taking the chief ray's map for every ray instead, y y′/sin θ, is good unvignetted
   but 3.5% out at 20° vignetted: the per-ray sum is the reference.) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const D = await import('../../src/engines/lens-design.js');
const E = await import('../../src/engines/lens-engine.js');
const AN = await import('../../src/engines/lens-analysis.js');

const design = dia => {
  loadProject({ format: 'jekray', version: 1, elements: [
    { type: 'stop', id: 'S', name: 'S', x: 0, y: 0, angle: 0, aperture: 10, outer: 40, group: 'g' },
    { type: 'lens', id: 'L', name: 'L', x: 15, y: 0, angle: 0, diameter: dia, surfaces: [{ R: 60 }, { R: -200 }], gaps: [5], materials: [{ glass: 'N-BK7' }], group: 'g' }],
    assemblies: [{ id: 'g', name: 'T', ref: 'S', cond: { aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0 }, { deg: 20 }], waves: [{ nm: 587.56 }] }, design: { solves: { 't:image': { kind: 'focus' } } } }] });
  const a = ST.project.assemblies[0], P = D.designPrescription(a); D.commitDesign(a, P);
  return AN.anaSystems(a, D.designPrescription(a));
};
// from object space, ray by ray: for an object of even radiance, the flux reaching the image round a point is the sum over
// the pupil (square to the light) of each ray's own share, the pupil area over how much image area that ray's landing point
// sweeps per solid angle of the object (its own Jacobian, by finite differences in two directions)
const perRay = (A, degs) => {
  const S = A.Sp, R = new Float64Array(8), M = 110, Lm = 9, h = 1e-5;
  const land = (thy, thx, a, b) => {
    const d = [Math.sin(thx), Math.sin(thy) * Math.cos(thx), Math.cos(thy) * Math.cos(thx)], e1 = [Math.cos(thx), -Math.sin(thy) * Math.sin(thx), -Math.cos(thy) * Math.sin(thx)], e2 = [0, Math.cos(thy), -Math.sin(thy)];
    const p = [e1[0] * a + e2[0] * b - d[0] * 1000, e1[1] * a + e2[1] * b - d[1] * 1000, S.par.epz + e1[2] * a + e2[2] * b - d[2] * 1000];
    R.set([p[0], p[1], p[2], d[0], d[1], d[2], 0, 0]); E.traceRay(S, R, 0, S.N - 1);
    if (R[7] !== 0) return null;
    const t = (S.imageZ - R[2]) / R[5]; return [R[0] + R[3] * t, R[1] + R[4] * t];
  };
  const flux = g => {
    const th = g * Math.PI / 180; let sum = 0;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const a = -Lm + 2 * Lm * (i + 0.5) / M, b = -Lm + 2 * Lm * (j + 0.5) / M, p0 = land(th, 0, a, b); if (!p0) continue;
      const py = land(th + h, 0, a, b), px = land(th, h, a, b); if (!py || !px) continue;
      sum += (h * h) / Math.abs((px[0] - p0[0]) * (py[1] - p0[1]) - (px[1] - p0[1]) * (py[0] - p0[0]));
    }
    return sum;
  };
  const f0 = flux(0);
  return degs.map(g => flux(g) / f0);
};

test('relative illumination: the exit pupil’s projected solid angle against the flux ray by ray, unvignetted and vignetted', () => {
  for (const dia of [30, 13]) {
    const A = design(dia), RI = AN.relIllum(A, 3, 120), want = perRay(A, RI.degs);
    RI.ri.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 0.01, dia + ' mm, ' + RI.degs[i] + '°: ' + v + ' against ' + want[i]));
    if (dia === 13) assert.ok(RI.vig[2] < 0.6 && RI.ri[2] < 0.6 * RI.cos4[2], 'vignetted: ' + RI.vig[2]);
    else { assert.ok(RI.vig.every(v => v > 0.999)); assert.ok(Math.abs(RI.ri[2] - RI.cos4[2]) < 0.1); }
  }
});
