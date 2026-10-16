/* Diffractive surfaces: a phase written on a lens's face, in one order of diffraction. Kept on the part
   and read into the prescription and back, the same whichever way the lens faces; a diffractive lens's
   focal length from its first term, and growing as 1/λ; its spherical aberration, as Seidel's sum has
   it, against the traced path, and taken out by the fourth-order term an ideal lens has; a hybrid
   achromat, its glass's colour cancelled by the face's, found by the optimiser from a plain singlet. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const E = await import('../../src/engines/lens-engine.js');
const D = await import('../../src/engines/lens-design.js');
const O = await import('../../src/engines/lens-opt.js');
const { PART_BY_KEY } = await import('../../src/parts/registry.js');

const LAM = 587.56e-6;
const load = (els, design, waves) => {
  loadProject({ format: 'jekray', version: 1, elements: els.map(e => Object.assign({ group: 'g' }, e)),
    assemblies: [{ id: 'g', name: 'T', ref: els[0].id, cond: { aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0 }], waves: waves || [{ nm: 587.56 }], primary: waves ? 1 : 0 },
      design: Object.assign({ solves: { 't:image': { kind: 'focus' } } }, design) }] });
  const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a)); return a;
};
const plate = (ph, extra) => E.lensSystem({ surfaces: [{ R: null, semi: 15, stop: true }, { R: null, semi: 15, ph }], gaps: [3], materials: [{ glass: 'N-BK7' }], stopIndex: 0 }, 587.56, Object.assign({ epd: 20 }, extra));

test('a diffractive lens keeps its phase terms, read into the prescription and back the same whichever way it faces', () => {
  for (const angle of [0, 180]) {
    // the first lens sets the way the light runs; the diffractive one faces along it, or back against it
    const a = load([{ type: 'lens', id: 'B', name: 'B', x: -20, y: 0, angle: 0, diameter: 20, surfaces: [{ R: 60 }, { R: -60 }], gaps: [3], materials: [{ glass: 'F2' }] },
      { type: 'lens', id: 'L', name: 'L', diffractive: true, diffOrder: 2, x: 0, y: 0, angle, diameter: 20, surfaces: [{ R: 40 }, { R: null, ph: [-3, 0.01] }], gaps: [4], materials: [{ glass: 'N-BK7' }] }]);
    const P = D.designPrescription(a), i = angle ? 2 : 3;
    // facing back, the phase is met first, and is the same: it bends light toward its axis whichever way it comes
    assert.deepEqual(P.surfaces[i].ph, [-3, 0.01, 0, 0]);
    assert.equal(P.surfaces[i].dm, 2);
    assert.equal(D.getV(P, D.posOf(P, 'p4:L.1')), 0.01);
    D.setV(P, D.posOf(P, 'p6:L.1'), -2e-5);
    D.commitDesign(a, P);
    assert.deepEqual(ST.project.elements[1].surfaces[1].ph, [-3, 0.01, -2e-5]);
  }
  // a plain lens has no phase to set, nor a cylinder
  const p = load([{ type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, diameter: 20, surfaces: [{ R: 40 }, { R: null }], gaps: [4], materials: [{ glass: 'N-BK7' }] }]);
  assert.equal(D.editable(D.designPrescription(p), 'p2', 1), false);
  const c = PART_BY_KEY.lens.norm({ type: 'lens', cyl: 'plane', diffractive: true, surfaces: [{ R: 20 }, { R: null, ph: [-1] }] }, {});
  assert.equal(c.diffractive, undefined);
});

test('its focal length from its first term, -m λ c₁ / π, and as 1/λ; Seidel’s spherical against the traced path, and none with the ideal fourth-order term', () => {
  const f = 100, c1 = -Math.PI / (LAM * f);
  const S = plate([c1]);
  assert.ok(Math.abs(S.par.efl - f) < 1e-9, 'efl ' + S.par.efl);
  // in order 2 it has twice the power
  assert.ok(Math.abs(E.lensSystem({ surfaces: [{ R: null, semi: 15, stop: true }, { R: null, semi: 15, ph: [c1], dm: 2 }], gaps: [3], materials: [{ glass: 'N-BK7' }], stopIndex: 0 }, 587.56, { epd: 20 }).par.efl - f / 2) < 1e-9);
  for (const nm of [486.13, 656.27]) {
    const e = E.lensSystem({ surfaces: [{ R: null, semi: 15, stop: true }, { R: null, semi: 15, ph: [c1] }], gaps: [3], materials: [{ glass: 'N-BK7' }], stopIndex: 0 }, nm, { epd: 20 }).par.efl;
    assert.ok(Math.abs(e - f * 587.56 / nm) < 1e-9, nm + ': ' + e);
  }
  // the wavefront at the pupil's edge (10 mm, f/5) against its centre, at the paraxial focus: -SI / 8
  const W = S2 => { const o = h => { const R = E.traceRay(S2, Float64Array.from([0, h, -1, 0, 0, 1, 0, 0]), 0, 1, true); return R[6] + Math.hypot(R[0], R[1], S2.imageZ - R[2]); }; return o(10) - o(0); };
  const SI = E.seidel(S, 0).sum.SI;
  assert.ok(SI > 0 && Math.abs(W(S) + SI / 8) < 0.01 * SI / 8, 'traced ' + W(S) + ', Seidel ' + (-SI / 8));
  // a perfect lens's phase, -(2π/λ)(√(ρ² + f²) - f), has c₂ = π / (4 λ f³): no third-order spherical, and a hundredth of the path left
  const S2 = plate([c1, Math.PI / (4 * LAM * f ** 3)]);
  assert.ok(Math.abs(E.seidel(S2, 0).sum.SI) < 1e-9 && Math.abs(W(S2)) < 0.01 * Math.abs(W(S)), 'SI ' + E.seidel(S2, 0).sum.SI + ', path ' + W(S2));
});

test('a hybrid achromat: Seidel’s axial colour taken out by the optimiser with a diffractive face cancels the singlet’s traced colour', () => {
  const waves = [{ nm: 486.13 }, { nm: 587.56 }, { nm: 656.27 }];
  const els = [{ type: 'lens', id: 'L', name: 'L', diffractive: true, x: 0, y: 0, angle: 0, diameter: 12.7, surfaces: [{ R: 25.84 }, { R: null }], gaps: [4], materials: [{ glass: 'N-BK7' }] }];
  const colour = a => { const P = D.designPrescription(a), b = nm => E.lensSystem(P, nm, { epd: 10 }).par.bfl; return b(486.13) - b(656.27); };
  const CL = a => { const P = D.designPrescription(a), s = nm => E.lensSystem(P, nm, { epd: 10 }); return E.seidel(s(587.56), 0, s(486.13), s(656.27)).sum.CL; };
  const a0 = load(els, {}, waves), c0 = colour(a0), cl0 = CL(a0);
  // the phase's first term free, the radius as it is (the glass's power, f 50 mm), Seidel's axial colour aimed at none
  const a = load(els, { vars: ['p2:L.1'], merit: { ops: [{ op: 'CL', target: 0, weight: 1e6 }] } }, waves);
  const P = D.designPrescription(a), prob = O.optProblem(a, P), out = O.optRun(prob, { mode: 'dls', iters: 60 });
  O.optApply(P, prob, out); D.commitDesign(a, P);
  const ph = ST.project.elements[0].surfaces[1].ph, c1 = colour(a);
  assert.ok(Math.abs(c0) > 0.7 && Math.abs(c1) < 0.02 * Math.abs(c0), 'colour ' + c0 + ' → ' + c1);
  // where the F and C lines' paraxial foci meet, found on its own by bisection (a thin achromat's -5.75, the face's
  // power the glass's times 3.45 / 64.2, is a tenth short: the marginal ray is lower at the back face)
  const gap = c => { const P = { surfaces: [{ R: 25.84, semi: 6.35, stop: true }, { R: null, semi: 6.35, ph: [c] }], gaps: [4], materials: [{ glass: 'N-BK7' }], stopIndex: 0 };
    const b = nm => E.lensSystem(P, nm, { epd: 10 }).par.bfl; return b(486.13) - b(656.27); };
  let lo = -10, hi = 0;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (gap(m) > 0) lo = m; else hi = m; }
  assert.ok(ph && Math.abs(ph[0] - lo) < 0.01, 'c₁ ' + (ph && ph[0]) + ' against ' + lo);
  assert.ok(cl0 > 0 && Math.abs(CL(a)) < 1e-3 * cl0, 'CL ' + cl0 + ' → ' + CL(a));
});

test('the preset diffractive lens is a hybrid achromat: f 50 mm, its F and C lines at one focus', () => {
  const e = PART_BY_KEY.diffractive.make(0, 0, 'diffractive');
  const a = load([Object.assign({ id: 'L', angle: 0 }, e)]), P = D.designPrescription(a), sys = nm => E.lensSystem(P, nm, { epd: 10 }).par;
  assert.equal(ST.project.elements[0].diffractive, true);
  assert.ok(Math.abs(sys(587.56).efl - 50) < 0.01, 'efl ' + sys(587.56).efl);
  assert.ok(Math.abs(sys(486.13).bfl - sys(656.27).bfl) < 0.001, 'F ' + sys(486.13).bfl + ', C ' + sys(656.27).bfl);
});
