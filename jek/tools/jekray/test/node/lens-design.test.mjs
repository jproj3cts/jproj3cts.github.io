/* Lens design: the Seidel sums of a published Cooke triplet against an independent program's
   (theirs are of the opposite sign convention), and against the real-ray wavefront and chief ray
   in the third-order limit; solves, pickups and surfaces inserted and taken out of an assembly on
   the bench; the conditions the bench's light gives, and where they fall outside the design's. */
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

// the published triplet (f 50 mm, f/5, fields to 20°): R 22.01359 / -435.76044, 3.25896 SK16; air 6.00755;
// R -22.21328 / 20.29192, 0.99997 F2, the stop on its back; air 4.75041; R 79.68360 / -18.39533, 2.95208 SK16
const T = [3.25896, 6.00755, 0.99997, 4.75041, 2.95208];
function published() {
  const v1 = 0, v2 = T[0] + T[1], v3 = v2 + T[2] + T[3];
  const lens = (id, x, R1, R2, t, glass) => ({ type: 'lens', id, name: id, x, y: 0, angle: 0, diameter: 20, surfaces: [{ R: R1 }, { R: R2 }], gaps: [t], materials: [{ glass }], group: 'g1' });
  loadProject({ format: 'jekray', version: 1, elements: [
    lens('L1', v1 + T[0] / 2, 22.01359, -435.76044, T[0], 'N-SK16'),
    lens('L2', v2 + T[2] / 2, -22.21328, 20.29192, T[2], 'F2'),
    { type: 'stop', id: 'S', name: 'S', x: v2 + T[2], y: 0, angle: 0, aperture: 10, group: 'g1' },
    lens('L3', v3 + T[4] / 2, 79.68360, -18.39533, T[4], 'N-SK16'),
  ], assemblies: [{ id: 'g1', name: 'Cooke triplet', ref: 'L1', cond: { aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0 }, { deg: 14 }, { deg: 20 }], waves: [{ nm: 486.13 }, { nm: 587.56 }, { nm: 656.27 }], primary: 1 } }] });
  return ST.project.assemblies[0];
}
const by = id => ST.project.elements.find(e => e.id === id);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

test('the published triplet: its focal length and Seidel sums as an independent program gives them', () => {
  const asm = published(), P = D.designPrescription(asm), F = D.designFigures(asm, P);
  assert.ok(Math.abs(F.efl - 50.021349564) < 1e-6, 'EFL ' + F.efl);
  // theirs, in the opposite sign convention: SI to SV, and the axial and lateral colour from their transverse sums
  const ref = { SI: -0.007144034865382245, SII: 0.001242131665798262, SIII: 0.009038342416049658, SIV: -0.025827585117030673, SV: 0.001779312634286496 };
  for (const k in ref) assert.ok(rel(-F.seidel.sum[k], ref[k]) < 1e-6, k + ': ' + F.seidel.sum[k] + ' against ' + (-ref[k]));
  const u = -0.09995731909628705;
  assert.ok(rel(F.seidel.sum.CL, u * -0.007973256261619058) < 1e-3, 'CL ' + F.seidel.sum.CL);
  assert.ok(rel(F.seidel.sum.CT, u * -0.0009122830911606969) < 1e-3, 'CT ' + F.seidel.sum.CT);
});

test('third order is the real rays’ limit: spherical from the wavefront, distortion from the chief ray; a positive singlet has SI > 0', () => {
  const asm = published(), P = D.designPrescription(asm);
  const S10 = E.lensSystem(P, 587.56, { epd: 10 }), SI = E.seidel(S10, 0).sum.SI;
  // the edge ray's wavefront error at two small pupils, the sixth order taken out (Richardson): W = SI/8 at the edge
  const W = e => { const S = E.lensSystem(P, 587.56, { epd: e }); return E.traceField(S, 0, [[0, 1]]).rays[0].opd * S.lam; };
  const W4 = (64 * W(0.5) - W(1)) / 3 * 1e4;
  assert.ok(rel(-W4, SI / 8) < 1e-4, 'W040 ' + W4 + ' against SI/8 ' + SI / 8);
  // the chief ray at 1°: off its paraxial height by SV / (2 |u'|)
  const th = Math.PI / 180, C = E.rayAt(S10, th, 0, 0), SV = E.seidel(S10, 1).sum.SV;
  const dy = C[1] - S10.par.efl * Math.tan(th);
  assert.ok(rel(dy, -SV / (2 * 5 / S10.par.efl)) < 1e-3, 'distortion ' + dy);
  const s = (R, x) => ({ R, k: 0, a2: 0, A: [], semi: 20, ...x });
  const one = E.lensSystem({ surfaces: [s(null, { stop: true }), s(51.5), s(null)], gaps: [0, 3.6], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }], stopIndex: 0 }, 587.56, { epd: 10 });
  const sg = E.seidel(one, 5).sum;
  assert.ok(sg.SI > 0 && sg.SIV > 0, JSON.stringify(sg));
});

test('an aspheric surface’s Seidel term: the ellipsoid that images perfectly has SI = 0', () => {
  const n = 1.6, R = 25, s = { R, k: -1 / (n * n), a2: 0, A: [], semi: 10 };
  const S = E.lensSystem({ surfaces: [s], gaps: [], materials: [], stopIndex: 0 }, 587.56, { imageMaterial: { glass: 'custom', n }, epd: 10 });
  assert.ok(Math.abs(E.seidel(S, 0).sum.SI) < 1e-15, 'SI ' + E.seidel(S, 0).sum.SI);
  const S2 = E.lensSystem({ surfaces: [Object.assign({}, s, { k: 0, A: [1e-5] })], gaps: [], materials: [], stopIndex: 0 }, 587.56, { imageMaterial: { glass: 'custom', n }, epd: 10 });
  const S3 = E.lensSystem({ surfaces: [Object.assign({}, s, { k: 0 })], gaps: [], materials: [], stopIndex: 0 }, 587.56, { imageMaterial: { glass: 'custom', n }, epd: 10 });
  // A4 adds 8 (n' - n) A4 y^4
  assert.ok(Math.abs(E.seidel(S2, 0).sum.SI - E.seidel(S3, 0).sum.SI - 8 * 0.6 * 1e-5 * 625) < 1e-12);
});

test('solves: the image at focus, a radius for an F-number, a thickness for an edge; a pickup; the stop opens to the pupil', () => {
  const asm = published();
  let P = D.designPrescription(asm);
  assert.deepEqual(asm.design.solves, { 't:image': { kind: 'focus' } });
  D.commitDesign(asm, P);
  P = D.designPrescription(asm);
  assert.ok(Math.abs(P.image - E.lensSystem(P, 587.56).par.bfl) < 1e-9, 'image ' + P.image);
  assert.ok(Math.abs(by('S').aperture - 2 * D.designSystem(asm, P).stopR) < 1e-9);
  // the last radius solved for f/4 at a 10 mm pupil: a 40 mm focal length
  asm.design.solves['R:L3.1'] = { kind: 'fno', v: 4 };
  D.commitDesign(asm, P);
  P = D.designPrescription(asm);
  assert.ok(Math.abs(D.designFigures(asm, P).efl - 40) < 1e-9, 'EFL ' + D.designFigures(asm, P).efl);
  assert.ok(Math.abs(by('L3').surfaces[1].R - P.surfaces[6].R) < 1e-12 && P.surfaces[6].R !== -18.39533);
  // the first lens's edge 1.5 mm thick at its rim
  asm.design.solves['t:L1.0'] = { kind: 'edge', v: 1.5 };
  D.commitDesign(asm, P);
  P = D.designPrescription(asm);
  const edge = P.gaps[0] + D.surfSag(P.surfaces[1], 10) - D.surfSag(P.surfaces[0], 10);
  assert.ok(Math.abs(edge - 1.5) < 1e-9 && Math.abs(by('L1').gaps[0] - P.gaps[0]) < 1e-12, 'edge ' + edge);
  // the middle lens made equi-concave: its back radius picks up its front's, turned
  asm.design.pickups['R:L2.1'] = { from: 'R:L2.0', scale: -1, off: 0 };
  D.commitDesign(asm, P);
  assert.equal(by('L2').surfaces[1].R, 22.21328);
  // they all survive a save and a load
  const saved = JSON.parse(JSON.stringify(A.normAssemblies(ST.project.assemblies, ST.project.elements)));
  assert.deepEqual(saved[0].design.solves['R:L3.1'], { kind: 'fno', v: 4 });
  assert.deepEqual(saved[0].design.pickups['R:L2.1'], { from: 'R:L2.0', scale: -1, off: 0 });
  // what a file can't do: a solve where it doesn't belong, a pickup of a radius from a thickness
  const bad = A.normDesign({ solves: { 'R:L1.0': { kind: 'edge', v: 1 }, 't:image': { kind: 'fno' }, x: { kind: 'focus' } }, pickups: { 'R:L1.0': { from: 't:L1.0' } }, vars: ['R:L1.0', 'nonsense', 3] });
  assert.deepEqual(bad.solves, {}); assert.deepEqual(bad.pickups, {}); assert.deepEqual(bad.vars, ['R:L1.0']);
});

test('surfaces in and out: a cemented surface, a new singlet, each taken out again; the other parts stay put and the keys follow', () => {
  const asm = published();
  let P = D.designPrescription(asm);
  asm.design.vars = ['R:L3.0', 't:L2.1'];
  asm.design.pickups['R:L3.1'] = { from: 'R:L1.0', scale: -1, off: 0 };
  D.commitDesign(asm, P);
  const x3 = by('L3').x, x1 = by('L1').x;
  // a surface inside the first lens: it becomes a cemented doublet, nothing else moves
  P = D.designPrescription(asm);
  assert.equal(D.insertSurface(asm, P, 0), true);
  assert.equal(by('L1').surfaces.length, 3);
  assert.ok(Math.abs(by('L1').gaps[0] - T[0] / 2) < 1e-9 && Math.abs(by('L3').x - x3) < 1e-9 && Math.abs(by('L1').x - x1) < 1e-9);
  assert.deepEqual(asm.design.vars, ['R:L3.0', 't:L2.1']);
  assert.equal(asm.design.pickups['R:L3.1'].from, 'R:L1.0');
  // a singlet after the stop (in the 4.75 mm gap): the back lens stays, the stop behind it too
  P = D.designPrescription(asm);
  const el = D.insertSinglet(asm, P, P.stopIndex);
  assert.equal(typeof el, 'object');
  assert.equal(A.asmMembers(asm).length, 5);
  P = D.designPrescription(asm);
  assert.equal(P.surfaces.length, 10);
  assert.ok(Math.abs(by('L3').x - x3) < 1e-9, 'the back lens stays: ' + (by('L3').x - x3));
  assert.deepEqual(P.parts.map(p => p.id), ['L1', 'L2', 'S', el.id, 'L3']);
  // taken out again: the bench as it was
  P = D.designPrescription(asm);
  assert.equal(D.removeSurface(asm, P, P.surfaces.findIndex(s => s.from.id === el.id)), true);
  P = D.designPrescription(asm);
  assert.equal(D.removeSurface(asm, P, 1), true);
  assert.equal(by('L1').surfaces.length, 2);
  assert.ok(Math.abs(by('L1').gaps[0] - T[0]) < 1e-9 && Math.abs(by('L3').x - x3) < 1e-9 && Math.abs(by('L1').x - x1) < 1e-9);
  assert.deepEqual(asm.design.vars, ['R:L3.0', 't:L2.1']);
  // the stop stays; the last lens stays
  P = D.designPrescription(asm);
  assert.match(D.removeSurface(asm, P, P.stopIndex), /stop stays/);
});

test('the bench’s light: its fields, wavelengths and beam; outside the design, said so', () => {
  const asm = published(), P = D.designPrescription(asm);
  // two collimated beams, 8 mm wide: on the axis, and at 10° across it
  const fan = (a, src) => [-4, -2, 0, 2, 4].map(t => {
    const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), x0 = -60, y0 = x0 * Math.tan(r);
    return { bench: asm.bench, src, pts: [x0 - t * s, y0 + t * c, x0 + 80 * c - t * s, y0 + 80 * s + t * c] };
  });
  const B = D.condFromRays(asm, P, [...fan(0, 'a'), ...fan(10, 'b')], id => id === 'a' ? [1064] : [633, 1064]);
  assert.deepEqual(B.fields, [0, 10]);
  assert.deepEqual(B.waves, [633, 1064]);
  assert.ok(Math.abs(B.epd - 8) < 1e-9, 'beam ' + B.epd);
  const M = D.condMismatch(asm, B, 50);
  assert.equal(M.length, 1);
  assert.equal(M[0], '1064 nm, outside its wavelengths (486.13 to 656.27 nm)');
  const C = D.condFromBench(asm, B);
  assert.deepEqual(C.fields.map(f => f.deg), [0, 10]);
  assert.equal(C.aperture.v, 8);
  asm.cond = C;
  assert.deepEqual(D.condMismatch(asm, B, 50), []);
  const wide = D.condFromRays(asm, P, fan(25, 'a').map(r => Object.assign(r, { pts: r.pts.map(v => v * 1.5) })), () => [400]);
  const M2 = D.condMismatch(asm, wide, 50);
  assert.ok(M2.some(s => /beyond its fields/.test(s)) && M2.some(s => /400 nm/.test(s)) && M2.some(s => /wider than its entrance pupil/.test(s)), M2.join(' | '));
  assert.equal(D.condFromRays(asm, P, [], () => []), null);
});

test('the image plane held still: the image distance takes up what the gaps before it change, through a typed change and the optimiser', async () => {
  const O = await import('../../src/engines/lens-opt.js');
  const asm = published();
  let P = D.designPrescription(asm);
  D.commitDesign(asm, P);
  P = D.designPrescription(asm);
  const track = D.trackOf(P);
  asm.design.solves['t:image'] = { kind: 'hold', v: track };
  assert.deepEqual(A.normDesign(asm.design).solves['t:image'], { kind: 'hold', v: track });
  // the air between the first two lenses made 2 mm longer: the image plane does not move
  P = D.designPrescription(asm);
  const img0 = P.image;
  P.gaps[1] += 2;
  D.commitDesign(asm, P);
  P = D.designPrescription(asm);
  assert.ok(Math.abs(D.trackOf(P) - track) < 1e-9 && Math.abs(P.image - (img0 - 2)) < 1e-9, 'track ' + D.trackOf(P) + ', image ' + P.image);
  // with the focus solve, the same change moves the image plane
  asm.design.solves['t:image'] = { kind: 'focus' };
  D.commitDesign(asm, P);
  assert.ok(Math.abs(D.trackOf(D.designPrescription(asm)) - track) > 1e-3);
  // optimised with two radii and an air gap free: the image plane stays where it was held
  asm.design.solves['t:image'] = { kind: 'hold', v: track };
  asm.design.vars = ['R:L1.0', 'R:L3.1', 't:L2.1'];
  D.commitDesign(asm, D.designPrescription(asm));
  P = D.designPrescription(asm);
  const prob = O.optProblem(asm, P), out = O.optRun(prob, { mode: 'dls', iters: 6 });
  O.optApply(P, prob, out, asm.design);
  D.commitDesign(asm, P);
  P = D.designPrescription(asm);
  assert.ok(Math.abs(D.trackOf(P) - track) < 1e-9, 'held through the optimiser: ' + D.trackOf(P) + ' against ' + track);
  assert.ok(out.merit <= out.start + 1e-12);
});
