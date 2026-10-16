/* Optimising a lens design: damped least squares finds the bending of a singlet that the third-order
   closed form gives, and the bottom of a scan of its merit; it takes a spoilt Cooke triplet back to a
   design at least as good as the published one, keeping its focal length; the global search repeats
   with its seed and never does worse; model glasses make an achromat and find their nearest real
   glasses; boundaries hold. */
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
const { glassInfo } = await import('../../src/core/glass.js');

function load(elements, asm) { loadProject({ format: 'jekray', version: 1, elements, assemblies: [asm] }); const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a)); return a; }
function run(asm, args) {
  const P = D.designPrescription(asm), prob = O.optProblem(asm, P), out = O.optRun(prob, args);
  O.optApply(P, prob, out); D.commitDesign(asm, P);
  return out;
}
const merit = asm => O.meritReport(O.optProblem(asm, D.designPrescription(asm))).merit;
const lens = (id, x, R1, R2, t, glass, d) => ({ type: 'lens', id, name: id, x, y: 0, angle: 0, diameter: d || 25, surfaces: [{ R: R1 }, { R: R2 }], gaps: [t], materials: [typeof glass === 'string' ? { glass } : glass], group: 'g' });
const stop = (x, ap) => ({ type: 'stop', id: 'S', name: 'S', x, y: 0, angle: 0, aperture: ap, group: 'g' });
const noBounds = { glassMin: 0, glassMax: 0, edgeMin: 0, airMin: 0 };

test('a singlet bent for the least spherical aberration: the closed form’s shape, and the bottom of a scan of the merit', () => {
  // f/20 so the third order rules; thin (0.5 mm) so the thin-lens closed form holds
  const asm = load([stop(-1, 5), lens('L', 0.25, 100, -100, 0.5, { glass: 'custom', n: 1.5 }, 6)],
    { id: 'g', name: 'A', ref: 'L', cond: { aperture: { kind: 'epd', v: 5 }, fields: [{ deg: 0 }], waves: [{ nm: 587.56 }] },
      design: { solves: { 't:image': { kind: 'focus' }, 'R:L.1': { kind: 'fno', v: 20 } }, vars: ['R:L.0'], merit: { bounds: noBounds } } });
  const out = run(asm, { mode: 'dls', iters: 40 });
  assert.ok(out.merit < out.start, out.start + ' to ' + out.merit);
  const P = D.designPrescription(asm), R1 = P.surfaces[1].R, R2 = P.surfaces[2].R, n = 1.5;
  const X = (R2 + R1) / (R2 - R1), want = 2 * (n * n - 1) / (n + 2);
  assert.ok(Math.abs(X - want) < 0.03, 'shape ' + X + ' against ' + want);
  assert.ok(Math.abs(D.designFigures(asm, P).efl - 100) < 1e-6);
  // no curvature on a fine scan does better
  const prob = O.optProblem(asm, P);
  for (let c = 0.5 / R1; c < 2 / R1; c += 0.01 / R1) assert.ok(O.optRun(prob, { mode: 'dls', iters: 0, x: [c] }).start >= out.merit * (1 - 1e-9), 'at R ' + 1 / c);
});

// the published Cooke triplet, f 50 mm at f/5, fields to 20°
const T = [3.25896, 6.00755, 0.99997, 4.75041, 2.95208];
function triplet(R, extra) {
  const v2 = T[0] + T[1], v3 = v2 + T[2] + T[3];
  return load([lens('L1', T[0] / 2, R[0], R[1], T[0], 'N-SK16', 18), lens('L2', v2 + T[2] / 2, R[2], R[3], T[2], 'F2', 14), stop(v2 + T[2], 10), lens('L3', v3 + T[4] / 2, R[4], R[5], T[4], 'N-SK16', 15)],
    Object.assign({ id: 'g', name: 'Triplet', ref: 'L1', cond: { aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0 }, { deg: 14 }, { deg: 20 }], waves: [{ nm: 486.13 }, { nm: 587.56 }, { nm: 656.27 }], primary: 1 },
      design: { solves: { 't:image': { kind: 'focus' }, 'R:L3.1': { kind: 'fno', v: 5 } }, vars: ['R:L1.0', 'R:L1.1', 'R:L2.0', 'R:L2.1', 'R:L3.0', 't:L1.1', 't:S.0'], merit: { bounds: { glassMin: 0.9, edgeMin: 0.3, airMin: 0.1 } } } }, extra));
}
const PUB = [22.01359, -435.76044, -22.21328, 20.29192, 79.68360, -18.39533];

test('a spoilt Cooke triplet optimised: back to at least as good as the published design, its focal length kept, its boundaries kept', () => {
  const ref = merit(triplet(PUB));
  const asm = triplet(PUB.map((r, i) => r * [1.08, 0.7, 0.93, 1.1, 0.85, 1][i]));
  const spoilt = merit(asm);
  assert.ok(spoilt > 1.5 * ref, 'spoilt ' + spoilt + ' against ' + ref);
  let out;
  for (let k = 0; k < 6; k++) { out = run(asm, { mode: 'dls', iters: 15 }); if (out.done) break; }
  const P = D.designPrescription(asm), F = D.designFigures(asm, P), now = merit(asm);
  assert.ok(now <= ref * 1.001, 'optimised ' + now + ' against the published ' + ref);
  assert.ok(Math.abs(F.efl - 50) < 1e-6, 'EFL ' + F.efl);
  const R = O.meritReport(O.optProblem(asm, P));
  assert.ok(R.bounds.broken.every(b => b.over < 0.01), JSON.stringify(R.bounds.broken));
});

test('the global search repeats with its seed, and is never worse than where it starts', () => {
  const a1 = triplet(PUB.map(r => r * 1.05)), p1 = O.optProblem(a1, D.designPrescription(a1));
  const g1 = O.optRun(p1, { mode: 'global', trials: 2, seed: 7 }), g2 = O.optRun(p1, { mode: 'global', trials: 2, seed: 7 });
  assert.deepEqual(g1.x, g2.x);
  assert.ok(g1.merit <= g1.start + 1e-15, g1.start + ' to ' + g1.merit);
  assert.equal(g1.tried, 2);
});

test('model glasses: an achromatic doublet found by varying its two glasses, then their nearest real glasses', () => {
  // a cemented doublet, both glasses the same model to start: no colour correction at all
  const doublet = { type: 'lens', id: 'L', name: 'L', x: 4, y: 0, angle: 0, diameter: 25, surfaces: [{ R: 60 }, { R: -45 }, { R: -200 }], gaps: [5, 3],
    materials: [{ glass: 'Model', nd: 1.6, vd: 50 }, { glass: 'Model', nd: 1.6, vd: 50 }], group: 'g' };
  const asm = load([stop(0, 20), doublet], { id: 'g', name: 'D', ref: 'L', cond: { aperture: { kind: 'epd', v: 20 }, fields: [{ deg: 0 }], waves: [{ nm: 486.13 }, { nm: 587.56 }, { nm: 656.27 }], primary: 1 },
    design: { solves: { 't:image': { kind: 'focus' }, 'R:L.2': { kind: 'fno', v: 5 } }, vars: ['R:L.0', 'R:L.1', 'g:L.0', 'g:L.1'] } });
  const P0 = D.designPrescription(asm), cl0 = D.designFigures(asm, P0).seidel.sum.CL;
  for (let k = 0; k < 6; k++) { if (run(asm, { mode: 'dls', iters: 15 }).done) break; }
  const P = D.designPrescription(asm), cl = D.designFigures(asm, P).seidel.sum.CL, [m1, m2] = P.materials.filter(O.isModel);
  assert.ok(Math.abs(cl) < 0.05 * Math.abs(cl0), 'axial colour ' + cl0 + ' to ' + cl);
  // a crown in front of a flint: the first glass less dispersive than the second
  assert.ok(m1.vd > m2.vd + 10, m1.vd + ' and ' + m2.vd);
  for (const m of [m1, m2]) { const k = O.nearestGlass(m.nd, m.vd), I = glassInfo(k); assert.ok(k && Math.abs(I.nd - m.nd) < 0.025 && Math.abs(I.vd - m.vd) < 2.5, k + ' for ' + m.nd + '/' + m.vd); }
  assert.equal(O.modelOf({ glass: 'N-BK7' }).glass, 'Model');
  assert.ok(Math.abs(O.modelOf({ glass: 'N-BK7' }).nd - 1.5168) < 1e-4);
});

test('boundaries hold: a lens let thin keeps its least thickness; merit settings are checked when read', () => {
  const asm = load([stop(-1, 10), lens('L', 1.5, 50, -50, 3, 'N-BK7', 10)], { id: 'g', name: 'A', ref: 'L', cond: { aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0 }], waves: [{ nm: 587.56 }] },
    design: { solves: { 't:image': { kind: 'focus' } }, vars: ['t:L.0'], merit: { bounds: { glassMin: 2.5, edgeMin: 0 }, ops: [{ op: 'TTL', target: 0, weight: 1e-2 }] } } });
  for (let k = 0; k < 4; k++) run(asm, { mode: 'dls', iters: 15 });
  const t = ST.project.elements.find(e => e.id === 'L').gaps[0];
  assert.ok(t > 2.5 - 0.01 && t < 2.6, 'thickness ' + t);
  const m = A.normMerit({ crit: 'x', rings: 9, arms: 5, ops: [{ op: 'EFL', target: 50, weight: 2 }, { op: 'nope' }], bounds: { glassMin: -1 } });
  assert.deepEqual(m, { crit: 'spot', rings: 4, arms: 6, bounds: { glassMin: 0, glassMax: 0, edgeMin: 0.5, airMin: 0.1, aspMax: 0.5, slopeMax: 0 }, ops: [{ op: 'EFL', target: 50, weight: 2 }] });
});
