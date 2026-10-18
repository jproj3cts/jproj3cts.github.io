/* Aspheric terms in a lens design: a key for each coefficient, kept and moved with its surface; a fast
   plano-convex singlet's spherical aberration taken out by varying them, to well within the Airy disc;
   the departure bound holding; the irregularity tolerance a form error of the fringes asked for with no
   sag at the clear radius. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const A = await import('../../src/core/assembly.js');
const D = await import('../../src/engines/lens-design.js');
const O = await import('../../src/engines/lens-opt.js');
const Tl = await import('../../src/engines/lens-tol.js');
const AN = await import('../../src/engines/lens-analysis.js');

function load(elements, asm) { loadProject({ format: 'jekray', version: 1, elements, assemblies: [asm] }); const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a)); return a; }
function run(asm, args) { const P = D.designPrescription(asm), prob = O.optProblem(asm, P), out = O.optRun(prob, args); O.optApply(P, prob, out); D.commitDesign(asm, P); return out; }
// a plano-convex N-BK7 lens, 50 mm, at f/2: its curved side to the light
const pcx = (bounds, vars) => load([{ type: 'stop', id: 'S', name: 'S', x: -1, y: 0, angle: 0, aperture: 25, group: 'g' },
  { type: 'lens', id: 'L', name: 'L', asphere: true, x: 3, y: 0, angle: 0, diameter: 26, surfaces: [{ R: 25.8 }, { R: null }], gaps: [6], materials: [{ glass: 'N-BK7' }], group: 'g' }],
  { id: 'g', name: 'Asphere', ref: 'L', cond: { aperture: { kind: 'epd', v: 25 }, fields: [{ deg: 0 }], waves: [{ nm: 587.56 }] },
    design: { solves: { 't:image': { kind: 'focus' } }, vars, merit: { rings: 4, bounds: Object.assign({ glassMin: 0, glassMax: 0, edgeMin: 0, airMin: 0 }, bounds) } } });
const spot = asm => { const P = D.designPrescription(asm); return AN.spotDiagram(AN.anaSystems(asm, P), 0, 21); };

test('aspheric keys: each coefficient named by its surface and order, read and set, kept by the design and moved with a copy', () => {
  const asm = pcx({}, ['a4:L.0', 'a6:L.0']), P = D.designPrescription(asm);
  const at = D.posOf(P, 'a6:L.0');
  assert.deepEqual([at.q, at.i], ['a6', 1]);
  D.setV(P, at, 2e-9);
  assert.deepEqual(P.surfaces[1].A, [0, 2e-9]);
  assert.equal(D.getV(P, D.posOf(P, 'a4:L.0')), 0);
  D.setV(P, at, 0);
  assert.deepEqual(P.surfaces[1].A, []);
  assert.ok(!D.editable(P, 'a4', 0) && D.editable(P, 'a4', 1) && D.editable(P, 'a16', 2));
  assert.deepEqual(A.normDesign(asm.design).vars, ['a4:L.0', 'a6:L.0']);
  const m = A.remapDesign(asm.design, new Map([['L', 'L2']]));
  assert.deepEqual(m.vars, ['a4:L2.0', 'a6:L2.0']);
  assert.ok(m.merit && m.merit.rings === 4 && m.tol, 'merit and tolerances go with a copy');
});

test('a fast plano-convex singlet: its spherical aberration taken out by A4 to A10 on its curved side, to well within the Airy disc', () => {
  const asm = pcx({ aspMax: 0 }, ['a4:L.0', 'a6:L.0', 'a8:L.0', 'a10:L.0']);
  const s0 = spot(asm);
  const out = run(asm, { mode: 'dls', iters: 60 });
  const s1 = spot(asm);
  assert.ok(s0.rms > 0.02, 'spherical: ' + s0.rms);
  assert.ok(s1.rms < 0.1 * s1.airy && s1.rms < s0.rms / 100, 'RMS ' + s1.rms * 1000 + ' µm (Airy ' + s1.airy * 1000 + ', from ' + s0.rms * 1000 + ')');
  // the coefficients are on the lens on the bench
  const e = ST.project.elements.find(x => x.id === 'L');
  assert.ok(e.surfaces[0].A.length >= 3 && e.surfaces[0].A[0] !== 0 && out.merit < out.start);
});

test('the departure bound: the aspheric terms’ sag kept within the limit set, the design as good as that allows', () => {
  const lim = 0.02, asm = pcx({ aspMax: lim }, ['a4:L.0', 'a6:L.0']);
  run(asm, { mode: 'dls', iters: 60 });
  const P = D.designPrescription(asm), s = P.surfaces[1], h = s.semi;
  let dep = 0;
  for (let q = 1; q <= 50; q++) { const r = h * q / 50; dep = Math.max(dep, Math.abs(s.A.reduce((a, c, j) => a + c * r ** (4 + 2 * j), 0))); }
  assert.ok(dep < lim * 1.02, 'departure ' + dep + ' against ' + lim);
});

test('the irregularity tolerance: a fourth-order form error N fringes peak to valley, none at the clear radius, none on the axis', () => {
  const asm = pcx({}, []), P = D.designPrescription(asm), h = P.surfaces[1].semi;
  const T = A.normTol({ irr: { on: true, v: 2 } });
  assert.equal(A.normTol({}).irr.on, false, 'off until turned on');
  const ops = Tl.tolOps(P, T).filter(o => o.kind === 'irr');
  assert.equal(ops.length, 2);
  const Q = Tl.perturb(P, ops, ops.map((o, k) => k === 0 ? 2 : 0)), s0 = P.surfaces[1], s1 = Q.surfaces[1];
  let lo = Infinity, hi = -Infinity;
  for (let q = 0; q <= 400; q++) { const r = h * q / 400, d = D.surfSag(s1, r) - D.surfSag(s0, r); lo = Math.min(lo, d); hi = Math.max(hi, d); }
  assert.ok(Math.abs((hi - lo) - 2 * 632.8e-6 / 2) < 1e-8, 'PV ' + (hi - lo));        // sampled: the peak itself between two samples
  assert.ok(Math.abs(D.surfSag(s1, h) - D.surfSag(s0, h)) < 1e-15);
});
