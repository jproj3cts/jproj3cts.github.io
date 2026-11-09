/* The designers' optimisers pushed at their edges (the slower sweep of many more cases is test/optimise-stress.mjs):
   the coating designer from random starts never hands back a stack worse than it was given, judged on the sampling it
   reports, and keeps each thickness within its bounds, a blank thickness starting at a quarter wave; the Optical
   designer's global search from a design outside the limits set on its values brings it within them (as damped least
   squares does) rather than handing back the start, and repeats with its seed; damped least squares from random spoilt
   triplets always ends finite and better; the RF designer's search, from 5 to 300 GHz with every value free, ends
   finite, its merit never rising, and settles within the 200 steps the workspace allows. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const D = await import('../../src/engines/lens-design.js');
const O = await import('../../src/engines/lens-opt.js');
const RF = await import('../../src/engines/rf-design.js');
const C = await import('../../src/core/rf.js');
const CD = await import('../../src/core/coatdesign.js');
const { qwot } = await import('../../src/core/coatings.js');
const { seededRng } = await import('../../src/core/numeric.js');
const fin = v => typeof v === 'number' && isFinite(v);

test('coatings: from random starts never worse than given, every thickness within its bounds; a blank one starts at a quarter wave', () => {
  const R = seededRng(11), idx = [1.38, 1.46, 1.63, 2.1, 2.3];
  const specs = [{ target: 'ar', ns: 1.5168, lo: 450, hi: 650, theta: 20 }, { target: 'ar', ns: 3.48, lo: 1300, hi: 1700 }, { target: 'split', ns: 1.5168, lo: 500, hi: 600, R: 30 },
    { target: 'hr', ns: 1.5168, lo: 600, hi: 700 }, { target: 'edge', ns: 1.5168, lo: 400, hi: 800, edge: 600, passBelow: false }, { target: 'rf', ns: 1.643, lo: 299792458 / 26, hi: 299792458 / 22 }, { target: 'ar', ns: 1.5168, lo: 550, hi: 550 }];
  for (const o of specs) {
    const spec = CD.coatSpec(o);
    for (const nL of [1, 3]) {
      const L = []; for (let i = 0; i < nL; i++) { const n = idx[i % idx.length]; L.push({ n, d: qwot(n, spec.design) * (0.2 + 2 * R()) }); }
      const out = CD.coatOptimise(L, spec), m0 = CD.coatMerit(L, spec), m1 = CD.coatMerit(out.layers, spec);
      assert.ok(fin(m1) && m1 <= m0 * (1 + 1e-12), o.target + ' ' + nL + ': ' + m0 + ' to ' + m1);
      assert.ok(Math.abs(out.before - m0) < 1e-15 && Math.abs(out.after - m1) < 1e-15, 'before and after on the sampling the designer shows');
      for (const l of out.layers) assert.ok(l.d >= 0.01 * qwot(l.n, spec.design) - 1e-3 && l.d <= 16 * qwot(l.n, spec.design) + 1e-3, JSON.stringify(l));
    }
  }
  const spec = CD.coatSpec({ target: 'ar', ns: 1.5168, lo: 540, hi: 560 }), o = CD.coatOptimise([{ n: 1.38, d: NaN }], spec);
  assert.ok(fin(o.layers[0].d) && Math.abs(o.layers[0].d / qwot(1.38, 550) - 1) < 0.05, JSON.stringify(o));
});

function load(elements, asm) { loadProject({ format: 'jekray', version: 1, elements, assemblies: [asm] }); const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a)); return a; }
const lens = (id, x, R1, R2, t, glass, d) => ({ type: 'lens', id, name: id, x, y: 0, angle: 0, diameter: d || 25, surfaces: [{ R: R1 }, { R: R2 }], gaps: [t], materials: [{ glass }], group: 'g' });
const stop = (x, ap) => ({ type: 'stop', id: 'S', name: 'S', x, y: 0, angle: 0, aperture: ap, group: 'g' });
const singlet = lims => load([stop(-1, 10), lens('L', 1.5, 100, -100, 3, 'N-BK7', 14)], { id: 'g', name: 'A', ref: 'L', cond: { aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0 }, { deg: 5 }], waves: [{ nm: 587.56 }] },
  design: { solves: { 't:image': { kind: 'focus' } }, vars: ['R:L.0', 'R:L.1'], merit: { ops: [{ op: 'EFL', target: 100, weight: 10 }] }, ...(lims ? { lims } : {}) } });
const probOf = a => O.optProblem(a, D.designPrescription(a));

test('the global search from a design outside its limits brings it within them, as damped least squares does; inside them it is never worse, and repeats', () => {
  // the start's front radius, 100, is outside 40 to 60: no design within the limits is as good, but the limits hold
  const a = singlet({ 'R:L.0': { lo: 40, hi: 60 }, 'R:L.1': { lo: -300, hi: -80 } }), prob = probOf(a), V = O.optVars(prob), L = O.limitsX(prob, V);
  for (const args of [{ mode: 'global', trials: 3, seed: 2 }, { mode: 'dls', iters: 20 }]) {
    const out = O.optRun(prob, args);
    assert.ok(out.x.every((v, j) => v >= L.lo[j] - 1e-12 && v <= L.hi[j] + 1e-12), args.mode + ': ' + out.x);
    assert.equal(out.outside, true, args.mode);
    assert.ok(fin(out.merit));
  }
  const b = singlet({ 'R:L.0': { lo: 40, hi: 200 } }), pb = probOf(b), g1 = O.optRun(pb, { mode: 'global', trials: 3, seed: 4 }), g2 = O.optRun(pb, { mode: 'global', trials: 3, seed: 4 });
  assert.ok(g1.merit <= g1.start && !g1.outside, g1.start + ' to ' + g1.merit);
  assert.deepEqual(g1.x, g2.x);
});

const TT = [3.25896, 6.00755, 0.99997, 4.75041, 2.95208], PUB = [22.01359, -435.76044, -22.21328, 20.29192, 79.68360, -18.39533];
function triplet(Rs) {
  const v2 = TT[0] + TT[1], v3 = v2 + TT[2] + TT[3];
  return load([lens('L1', TT[0] / 2, Rs[0], Rs[1], TT[0], 'N-SK16', 18), lens('L2', v2 + TT[2] / 2, Rs[2], Rs[3], TT[2], 'F2', 14), stop(v2 + TT[2], 10), lens('L3', v3 + TT[4] / 2, Rs[4], Rs[5], TT[4], 'N-SK16', 15)],
    { id: 'g', name: 'Triplet', ref: 'L1', cond: { aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0 }, { deg: 14 }, { deg: 20 }], waves: [{ nm: 486.13 }, { nm: 587.56 }, { nm: 656.27 }], primary: 1 },
      design: { solves: { 't:image': { kind: 'focus' }, 'R:L3.1': { kind: 'fno', v: 5 } }, vars: ['R:L1.0', 'R:L1.1', 'R:L2.0', 'R:L2.1', 'R:L3.0', 't:L1.1', 't:S.0'], merit: { bounds: { glassMin: 0.9, edgeMin: 0.3, airMin: 0.1 } } } });
}

test('damped least squares from random spoilt triplets, and from every radius turned over: finite, never worse', () => {
  const R = seededRng(5);
  const starts = [0, 1, 2].map(() => PUB.map(r => r * (0.75 + 0.5 * R()))).concat([PUB.map(r => -r)]);
  for (const Rs of starts) {
    const out = O.optRun(probOf(triplet(Rs)), { mode: 'dls', iters: 12 });
    assert.ok(out.x.every(fin) && fin(out.merit) && out.merit <= out.start, Rs.map(r => r.toFixed(1)) + ': ' + out.start + ' to ' + out.merit);
  }
});

test('the RF designer from 5 to 300 GHz, every value free: finite, its merit never rising, settled within 200 steps', () => {
  for (const ghz of [5, 100, 300]) {
    const lam = C.C_NM_GHZ / ghz * 1e-6, aH = Math.max(3, 2 * lam), feed = { kind: 'corrugated', a: aH, L: 5 * aH, d: 150 };
    loadProject({ format: 'jekray', version: 1, elements: [{ type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, diameter: 120, asphere: true, surfaces: [{ R: 120, k: 0 }, { R: -400, k: 0 }], gaps: [30], materials: [{ glass: 'HDPE' }], mmw: { part: true }, group: 'g' }],
      assemblies: [{ id: 'g', name: 'RF', ref: 'L', kind: 'rf', rf: { ghz, feed, goal: { kind: 'focus', d: 200, w: 10 } } }] });
    const a = ST.project.assemblies[0], P = D.designPrescription(a);
    RF.rfSyncCond(a, P);
    const prob = RF.rfOptProblem(a, P, { keys: ['c:0', 'k:0', 'c:1', 'k:1', 't:0', 'feed'], flat: 0, edgeMin: 1, tMax: 0 });
    let st = RF.rfOptStart(prob), last = st.m, i = 0;
    for (; i < 200 && !st.done; i++) { st = RF.rfOptStep(prob, st); assert.ok(fin(st.m) && st.m <= last * (1 + 1e-12), ghz + ' GHz step ' + i + ': ' + last + ' to ' + st.m); last = st.m; }
    assert.ok(st.done && st.x.every(fin) && st.m < st.m0, ghz + ' GHz: ' + st.m0 + ' to ' + st.m + ' in ' + i);
  }
});
