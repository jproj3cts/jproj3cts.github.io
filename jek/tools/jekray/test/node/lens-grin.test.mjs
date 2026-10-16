/* Graded glass in lenses and assemblies: n(r) = n + g₂r² + g₄r⁴ + g₆r⁶ from the lens's axis. Kept on a
   graded lens's glass and read into the prescription and back; a rod's focal length and back focus
   against their closed forms, in a glass that focuses (g₂ < 0) and one that spreads; the GRIN rod
   lens preset, a quarter of its pitch long, bringing a collimated beam to its back face on the bench;
   and the optimiser finding the gradient that gives a rod a focal length asked for. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject, makeElement } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const TRACE = await import('../../src/engines/trace.js');
const E = await import('../../src/engines/lens-engine.js');
const D = await import('../../src/engines/lens-design.js');
const O = await import('../../src/engines/lens-opt.js');
const { PART_BY_KEY } = await import('../../src/parts/registry.js');

const rod = (L, g2, extra) => Object.assign({ type: 'lens', id: 'R', name: 'R', x: 0, y: 0, angle: 0, graded: true, diameter: 1.8, surfaces: [{ R: null }, { R: null }], gaps: [L], materials: [{ glass: 'custom', n: 1.608, grad: [g2] }], group: 'g' }, extra);
const load = (els, design) => {
  loadProject({ format: 'jekray', version: 1, elements: els,
    assemblies: [{ id: 'g', name: 'T', ref: els[0].id, cond: { aperture: { kind: 'epd', v: 0.5 }, fields: [{ deg: 0 }], waves: [{ nm: 633 }] }, design: Object.assign({ solves: { 't:image': { kind: 'focus' } } }, design) }] });
  const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a)); return a;
};
// a rod of length L in a glass n0 + g2 r²: its focal length and back focus, closed form
const closed = (g2, L, n0 = 1.608) => {
  const k2 = -2 * g2 / n0;
  if (k2 > 0) { const k = Math.sqrt(k2); return { efl: 1 / (n0 * k * Math.sin(k * L)), bfl: Math.cos(k * L) / (n0 * k * Math.sin(k * L)) }; }
  const k = Math.sqrt(-k2); return { efl: -1 / (n0 * k * Math.sinh(k * L)), bfl: -Math.cosh(k * L) / (n0 * k * Math.sinh(k * L)) };
};

test('a graded lens keeps its glass’s terms, read into the prescription and written back; a plain lens or a cylinder has none to set', () => {
  const a = load([rod(3, -0.08, { materials: [{ glass: 'custom', n: 1.608, grad: [-0.08, 0.001] }] })]);
  const P = D.designPrescription(a);
  assert.deepEqual(P.materials[0].grad, [-0.08, 0.001]);
  assert.ok(P.materials[0].gh > 0);
  assert.equal(D.getV(P, D.posOf(P, 'n4:R.0')), 0.001);
  D.setV(P, D.posOf(P, 'n6:R.0'), -2e-5);
  D.commitDesign(a, P);
  assert.deepEqual(ST.project.elements[0].materials[0].grad, [-0.08, 0.001, -2e-5]);
  assert.equal(ST.project.elements[0].materials[0].gh, undefined);
  const p = load([rod(3, -0.08, { graded: undefined, materials: [{ glass: 'N-BK7' }] })]);
  assert.equal(D.editable(D.designPrescription(p), 'n2', 0), false);
  assert.equal(PART_BY_KEY.lens.norm({ type: 'lens', cyl: 'plane', graded: true, surfaces: [{ R: 20 }, { R: null }], materials: [{ glass: 'N-BK7', grad: [-0.01] }] }, {}).graded, undefined);
});

test('a rod’s focal length and back focus are their closed forms, focusing and spreading', () => {
  for (const [L, g2] of [[4.82, -0.08545], [3, -0.08545], [2, 0.03]]) {
    const a = load([rod(L, g2)]), S = E.lensSystem(D.designPrescription(a), 633), c = closed(g2, L);
    assert.ok(Math.abs(S.par.efl - c.efl) < 1e-9 * Math.abs(c.efl), L + ': efl ' + S.par.efl + ' against ' + c.efl);
    assert.ok(Math.abs(S.par.bfl - c.bfl) < 1e-9 * (1 + Math.abs(c.bfl)), L + ': bfl ' + S.par.bfl + ' against ' + c.bfl);
  }
});

test('the GRIN rod lens preset, a quarter of its pitch, brings a collimated beam to its back face on the bench', () => {
  loadProject({ format: 'jekray', version: 1, elements: [] });
  const r = Object.assign(makeElement('grinrod', 0, 0), { name: 'Rod' });
  // its back face at x = 2.41; a screen a hair beyond it
  loadProject({ format: 'jekray', version: 1, elements: [{ type: 'source', name: 'S', x: -10, y: 0, angle: 0, wavelength: 633, width: 0.4, rays: 5, divergence: 0 }, r,
    { type: 'screen', name: 'Sc', x: 2.4101, y: 0, angle: 180, length: 4 }] });
  TRACE.setLastTraceKey(null); TRACE.traceScene();
  const hits = Object.values(TRACE.lastTrace.screens)[0];
  assert.ok(hits.length >= 5);
  // from up to 0.2 mm off the axis to within a micron of it (what is left is its third-order aberration)
  const worst = Math.max(...hits.map(h => Math.abs(h.y)));
  assert.ok(worst < 1e-3, 'the widest ray lands ' + worst + ' mm off the axis');
});

test('the optimiser finds the gradient that gives a rod the focal length asked for', () => {
  const a = load([rod(3, -0.05)], { vars: ['n2:R.0'], merit: { ops: [{ op: 'EFL', target: 2.5, weight: 1 }] } });
  const P = D.designPrescription(a), prob = O.optProblem(a, P), out = O.optRun(prob, { mode: 'dls', iters: 40 });
  O.optApply(P, prob, out); D.commitDesign(a, P);
  const g2 = ST.project.elements[0].materials[0].grad[0];
  // the closed form's own answer, by bisection on its focal length
  let lo = -0.2, hi = -0.01;
  for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (closed(m, 3).efl > 2.5) hi = m; else lo = m; }
  assert.ok(Math.abs(g2 - lo) < 1e-6, 'g₂ ' + g2 + ' against ' + lo);
});
