/* Freeform surfaces: XY terms on the sag. Kept on a part and read into the prescription and back the
   same, a lens's turned with it when it faces the other way; the lens engine's trace of a freeform
   surface against the closed form of where a ray meets it; and a concave mirror tilted 10°, whose
   astigmatism a sphere cannot lose, made a toroid by its x² and y² terms so it images a star again. */
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
const FF = await import('../../src/core/freeform.js');

const load = (els, design, cond) => {
  loadProject({ format: 'jekray', version: 1, elements: els.map(e => Object.assign({ group: 'g' }, e)),
    assemblies: [{ id: 'g', name: 'T', ref: els[0].id, cond: cond || { aperture: { kind: 'epd', v: 20 }, fields: [{ deg: 0 }], waves: [{ nm: 587.56 }] }, design: Object.assign({ solves: { 't:image': { kind: 'focus' } } }, design) }] });
  const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a)); return a;
};

test('freeform terms: kept to the fourteen allowed, read into the prescription and written back the same', () => {
  assert.deepEqual(FF.normF({ '21': 2e-5, '11': 1, '02': 'x', '40': 0 }), { '21': 2e-5, '40': 0 });
  assert.equal(FF.ffLabel('23'), 'x²y³');
  const F = { '20': 0.002, '03': 2e-5, '21': -3e-5 };
  for (const angle of [0, 180]) {
    // the first lens sets the way the light runs; the freeform one faces along it, or back against it
    const a = load([{ type: 'lens', id: 'B', name: 'B', x: -20, y: 0, angle: 0, diameter: 20, surfaces: [{ R: 60 }, { R: -60 }], gaps: [3], materials: [{ glass: 'F2' }] },
      { type: 'lens', id: 'L', name: 'L', asphere: true, x: 0, y: 0, angle, diameter: 20, surfaces: [{ R: 40, F }, { R: -200 }], gaps: [4], materials: [{ glass: 'N-BK7' }] }]);
    const P = D.designPrescription(a), i = angle ? 3 : 2;
    // facing back: the face meets the light second, its sag the other sign and y turned over (x² y³: odd in y keeps its sign)
    assert.deepEqual(P.surfaces[i].F, angle ? { '20': -0.002, '03': 2e-5, '21': -3e-5 } : F);
    assert.equal(D.getV(P, D.posOf(P, 'f20:L.0')), angle ? -0.002 : 0.002);
    assert.ok(D.editable(P, 'f03', i));
    D.setV(P, D.posOf(P, 'f22:L.0'), 1e-6);
    D.commitDesign(a, P);
    assert.deepEqual(ST.project.elements[1].surfaces[0].F, Object.assign({}, F, { '22': angle ? -1e-6 : 1e-6 }));
  }
  // a plain lens has none to set
  const p = load([{ type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, diameter: 20, surfaces: [{ R: 40 }, { R: -200 }], gaps: [4], materials: [{ glass: 'N-BK7' }] }]);
  assert.equal(D.editable(D.designPrescription(p), 'f20', 0), false);
});

test('a ray through a freeform face meets it where the sag says, and leaves by Snell’s law about its normal', () => {
  const F = { '20': 0.004, '02': -0.002, '03': 1e-4, '21': -2e-4 };
  const P = { surfaces: [{ R: null, k: 0, a2: 0, A: [], odd: null, F, semi: 20, stop: true }, { R: null, k: 0, a2: 0, A: [], odd: null, semi: 20 }], gaps: [5], materials: [{ glass: 'custom', n: 1.5 }], stopIndex: 0 };
  const S = E.lensSystem(P, 587.56, { epd: 10, image: 50 });
  for (const [x, y] of [[0, 3], [2, -4], [-3, 1.5]]) {
    const R = E.traceRay(S, Float64Array.from([x, y, -10, 0, 0, 1, 0, 0]), 0, 0, true);
    const L = FF.ffList(F), z = FF.ffSag(L, x, y), [gx, gy] = FF.ffGrad(L, x, y);
    assert.ok(Math.abs(R[0] - x) < 1e-12 && Math.abs(R[1] - y) < 1e-12 && Math.abs(R[2] - z) < 1e-12, 'met at ' + R[2] + ' against ' + z);
    // along the normal (-gx, -gy, 1): the tangential parts of n d are kept, 1 × (0, 0, 1) → 1.5 × d'
    const nn = Math.hypot(gx, gy, 1), n = [-gx / nn, -gy / nn, 1 / nn], d = [R[3], R[4], R[5]];
    const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const before = cr(n, [0, 0, 1]), after = cr(n, d).map(v => 1.5 * v);
    for (let q = 0; q < 3; q++) assert.ok(Math.abs(before[q] - after[q]) < 1e-12, 'Snell ' + q);
  }
});

test('a concave mirror tilted 10°: its astigmatism taken out by x² and y² terms (a toroid), the two unlike', () => {
  const spot = asm => { const P = D.designPrescription(asm), An = AN.anaSystems(asm, P); return AN.spotDiagram(An, 0, 15).rms; };
  const mk = vars => {
    // its focal length held at 200 mm, so the terms cannot just make it a stronger mirror
    // a stop in front sets the axis; the mirror turned 10° from it
    const a = load([{ type: 'stop', id: 'S', name: 'S', x: -50, y: 0, angle: 0, aperture: 20 }, { type: 'mirror', id: 'M', name: 'M', x: 0, y: 0, angle: 180, length: 40, R: 400 }], { vars, solves: {}, image: 200, merit: { ops: [{ op: 'EFL', target: 200, weight: 1e4 }] } });
    // (the image distance free, not at the paraxial focus: that does not see the tilt)
    const P = D.designPrescription(a); D.setV(P, D.posOf(P, 'T:M.0'), 10); D.commitDesign(a, P);
    return a;
  };
  const sphere = mk(['t:image']);
  { const P = D.designPrescription(sphere), prob = O.optProblem(sphere, P), out = O.optRun(prob, { mode: 'dls', iters: 40 }); O.optApply(P, prob, out); D.commitDesign(sphere, P); }
  const a = mk(['f20:M.0', 'f02:M.0', 't:image']);
  const s0 = spot(sphere);
  const P = D.designPrescription(a), prob = O.optProblem(a, P), out = O.optRun(prob, { mode: 'dls', iters: 60 });
  O.optApply(P, prob, out); D.commitDesign(a, P);
  const s1 = spot(a), F = ST.project.elements[1].F;
  // a toroid takes out the astigmatism; the coma a tilted mirror also has is left, near θ f / (16 N²) = 0.022 mm at f/10
  assert.ok(s0 > 0.08 && s1 < s0 / 4 && s1 < 0.03, 'sphere at its best focus ' + s0 + ', toroid ' + s1);
  assert.ok(F && Math.abs(F['20'] - F['02']) > 1e-5, 'x² ' + (F && F['20']) + ', y² ' + (F && F['02']));
});
