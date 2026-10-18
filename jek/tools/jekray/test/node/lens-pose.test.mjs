/* A part's tilt and decentre as design values: set in the prescription, written to the bench and read
   back the same, every surface carried round its first vertex; a mirror's tilt turning the fold and the
   parts after it; and the optimiser bringing a lens knocked out of line back on the axis. */
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
const AN = await import('../../src/engines/lens-analysis.js');

function load(elements, design, fields) {
  loadProject({ format: 'jekray', version: 1, elements, assemblies: [{ id: 'g', name: 'A', ref: 'L1', cond: { aperture: { kind: 'epd', v: 8 }, fields: fields || [{ deg: 0 }, { deg: 2 }], waves: [{ nm: 587.56 }] }, design }] });
  const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a)); return a;
}
const lens = (id, x, y, ang, R1, R2, t) => ({ type: 'lens', id, name: id, x, y, angle: ang, diameter: 20, surfaces: [{ R: R1 }, { R: R2 }], gaps: [t], materials: [{ glass: 'N-BK7' }], group: 'g' });
const near = (a, b, e) => Math.abs(a - b) < e;

test('a lens tilted and decentred in the prescription: written to the bench and read back the same, surface by surface', () => {
  const asm = load([lens('L1', 0, 0, 0, 40, -40, 4), lens('L2', 20, 0, 0, 30, null, 3)], { solves: { 't:image': { kind: 'focus' } } });
  const P = D.designPrescription(asm);
  D.setV(P, D.posOf(P, 'T:L2.0'), 3); D.setV(P, D.posOf(P, 'D:L2.0'), 0.4);
  assert.ok(near(D.getV(P, D.posOf(P, 'T:L2.0')), 3, 1e-12) && near(D.getV(P, D.posOf(P, 'D:L2.0')), 0.4, 1e-12));
  A.asmApply(asm, P);
  const Q = A.asmPrescription(asm);
  for (let i = 0; i < P.surfaces.length; i++) {
    const a = P.surfaces[i], b = Q.surfaces[i];
    for (let j = 0; j < 3; j++) assert.ok(near((a.dec || [0, 0, 0])[j], (b.dec || [0, 0, 0])[j], 1e-9), 'dec ' + i + ' ' + j);
    assert.ok(near((a.tilt || [0])[0], (b.tilt || [0])[0], 1e-12), 'tilt ' + i);
  }
  P.gaps.forEach((g, i) => assert.ok(near(g, Q.gaps[i], 1e-9), 'gap ' + i));
  // on the bench: the lens turned 3° and its first vertex 0.4 mm across
  const e = ST.project.elements.find(x => x.id === 'L2');
  assert.ok(near(e.angle, 3, 1e-9) || near(e.angle, 363, 1e-9), 'angle ' + e.angle);
  assert.ok(!D.editable(P, 'T', 1) && D.editable(P, 'T', 2) && !D.editable(P, 'D', 3));
});

test('a lens knocked 0.3 mm across and 2° round, its tilt and decentre varied: the optimiser puts it back', () => {
  // on the axis alone, where the centred lens is best by symmetry (with a field to one side only, a tilt can rightly
  // trade its coma); a biconvex lens of unlike radii (a plano-convex one turned about its sphere's centre is nearly unchanged)
  // the image distance free too: held at the paraxial focus, a little astigmatism from a tilt rightly helps a spot
  // that spherical aberration has moved off it
  const mk = (y, a) => load([lens('L1', 0, 0, 0, 40, -40, 4), lens('L2', 20, y, a, 30, -80, 4)], { image: 25, vars: ['T:L2.0', 'D:L2.0', 't:image'] }, [{ deg: 0 }]);
  const spot = asm => { const P = D.designPrescription(asm), An = AN.anaSystems(asm, P); return AN.spotDiagram(An, 0, 15).rms; };
  const c0 = mk(0, 0); { const P = D.designPrescription(c0), prob = O.optProblem(c0, P); prob.design = Object.assign({}, prob.design, { vars: ['t:image'] }); const o = O.optRun(prob, { mode: 'dls', iters: 40 }); O.optApply(P, prob, o); D.commitDesign(c0, P); }
  const centred = spot(c0), asm = mk(0.3, 2), s0 = spot(asm);
  const P = D.designPrescription(asm), prob = O.optProblem(asm, P), out = O.optRun(prob, { mode: 'dls', iters: 60 });
  O.optApply(P, prob, out); D.commitDesign(asm, P);
  const P1 = D.designPrescription(asm), t = D.getV(P1, D.posOf(P1, 'T:L2.0')), d = D.getV(P1, D.posOf(P1, 'D:L2.0'));
  // as good as the centred lens at its best focus; what is left of the tilt and decentre turns it about a point well
  // behind it, which on the axis changes next to nothing
  assert.ok(spot(asm) < centred * (1 + 1e-4), spot(asm) + ' from ' + s0 + ', centred ' + centred);
  assert.ok(Math.abs(t) < 0.3 && Math.abs(d) < 0.1, 'tilt ' + t + ', decentre ' + d);
});

test('a fold mirror’s tilt as a design value: the fold turns, and the parts after it go round with the axis', () => {
  loadProject({ format: 'jekray', version: 1, elements: [lens('L1', 0, 0, 0, 40, -40, 4), { type: 'mirror', id: 'M', name: 'M', x: 30, y: 0, angle: 135, length: 30, group: 'g' }, lens('L2', 30, 25, 90, 30, null, 3)],
    assemblies: [{ id: 'g', name: 'F', ref: 'L1', cond: {} }] });
  const asm = ST.project.assemblies[0], P = D.designPrescription(asm), at = D.posOf(P, 'T:M.0');
  const t0 = D.getV(P, at);
  assert.ok(near(Math.abs(t0), 45, 1e-9), 'fold ' + t0);
  D.setV(P, at, t0 + Math.sign(t0) * 5);
  A.asmApply(asm, P);
  const m = ST.project.elements.find(x => x.id === 'M'), l2 = ST.project.elements.find(x => x.id === 'L2');
  // the axis after the fold turns by twice the mirror's turn: 100° from the first run instead of 90°
  const dir = Math.atan2(l2.y - 0, l2.x - 30) * 180 / Math.PI;
  assert.ok(near(Math.abs(dir), 100, 1e-6) || near(Math.abs(dir), 80, 1e-6), 'axis after the fold at ' + dir + '°; mirror ' + m.angle);
  assert.ok(A.asmCheck(A.asmMembers(asm), { ref: asm.ref, rev: asm.rev }).ok);
});

test('a lens tilted and decentred out of the plane: its tip and height on the bench, read back the same; the assembly’s axis height kept', () => {
  const asm = load([lens('L1', 0, 0, 0, 40, -40, 4), lens('L2', 20, 0, 0, 30, null, 3)], { solves: { 't:image': { kind: 'focus' } } });
  const P = D.designPrescription(asm);
  D.setV(P, D.posOf(P, 'U:L2.0'), 2.5); D.setV(P, D.posOf(P, 'X:L2.0'), 0.35); D.setV(P, D.posOf(P, 'T:L2.0'), -1);
  assert.ok(near(D.getV(P, D.posOf(P, 'U:L2.0')), 2.5, 1e-12) && near(D.getV(P, D.posOf(P, 'X:L2.0')), 0.35, 1e-12) && near(D.getV(P, D.posOf(P, 'T:L2.0')), -1, 1e-12));
  A.asmApply(asm, P);
  const e = ST.project.elements.find(x => x.id === 'L2');
  // tipped up 2.5° about its centre, which is half its thickness on from the first vertex: raised 0.35 + 1.5 sin 2.5°
  assert.ok(near(e.tip, 2.5, 1e-9) && near(e.z, 75 + 0.35 + 1.5 * Math.sin(2.5 * Math.PI / 180), 1e-9), 'tip ' + e.tip + ', z ' + e.z);
  assert.equal(asm.z, 75);
  const Q = A.asmPrescription(asm);
  for (let i = 0; i < P.surfaces.length; i++) {
    const a = P.surfaces[i], b = Q.surfaces[i];
    for (let j = 0; j < 3; j++) assert.ok(near((a.dec || [0, 0, 0])[j], (b.dec || [0, 0, 0])[j], 1e-9), 'dec ' + i + ' ' + j);
    for (let j = 0; j < 2; j++) assert.ok(near((a.tilt || [0, 0])[j], (b.tilt || [0, 0])[j], 1e-12), 'tilt ' + i + ' ' + j);
  }
  P.gaps.forEach((g, i) => assert.ok(near(g, Q.gaps[i], 1e-9), 'gap ' + i));
  // a mirror is not tipped out of the plane in a design; a lens may be, a stop not
  assert.ok(D.editable(Q, 'U', 2) && D.editable(Q, 'X', 2) && !D.editable(Q, 'U', 1));
});

test('a lens knocked 0.25 mm up and 1.5° out of the plane, those varied: the optimiser puts it back', () => {
  const mk = (z, tip) => load([lens('L1', 0, 0, 0, 40, -40, 4), Object.assign(lens('L2', 20, 0, 0, 30, -80, 4), { z: 75 + z, tip })], { image: 25, vars: ['U:L2.0', 'X:L2.0', 't:image'] }, [{ deg: 0 }]);
  const spot = asm => { const P = D.designPrescription(asm), An = AN.anaSystems(asm, P); return AN.spotDiagram(An, 0, 15).rms; };
  const c0 = mk(0, 0); { const P = D.designPrescription(c0), prob = O.optProblem(c0, P); prob.design = Object.assign({}, prob.design, { vars: ['t:image'] }); const o = O.optRun(prob, { mode: 'dls', iters: 40 }); O.optApply(P, prob, o); D.commitDesign(c0, P); }
  const centred = spot(c0), asm = mk(0.25, 1.5), s0 = spot(asm);
  const P = D.designPrescription(asm), prob = O.optProblem(asm, P), out = O.optRun(prob, { mode: 'dls', iters: 60 });
  O.optApply(P, prob, out); D.commitDesign(asm, P);
  const P1 = D.designPrescription(asm), u = D.getV(P1, D.posOf(P1, 'U:L2.0')), x = D.getV(P1, D.posOf(P1, 'X:L2.0'));
  assert.ok(s0 > 2 * centred && spot(asm) < centred * (1 + 1e-4), spot(asm) + ' from ' + s0 + ', centred ' + centred);
  assert.ok(Math.abs(u) < 0.3 && Math.abs(x) < 0.1, 'tip ' + u + ', decentre ' + x);
  const e = ST.project.elements.find(q => q.id === 'L2');
  assert.ok(Math.abs(e.z - 75) < 0.1 && Math.abs(e.tip || 0) < 0.3, 'on the bench: z ' + e.z + ', tip ' + e.tip);
});
