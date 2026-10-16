/* Tolerancing: the lens engine traces a decentred surface exactly as the centred one with the light
   moved across, and a tilted plate shifts a ray as its closed form says; a radius's fringes change
   its sag as they should, an index change its focal length; the compensator finds the best focus a
   scan finds; a round system's decentres and tilts are alike either way; Monte Carlo repeats with its
   seed however it is cut up, and its mean agrees with the sensitivities' estimate. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const E = await import('../../src/engines/lens-engine.js');
const T = await import('../../src/engines/lens-tol.js');
const A = await import('../../src/core/assembly.js');

const surf = (R, x) => ({ R, k: 0, a2: 0, A: [], odd: null, semi: 20, ...x });

test('a decentred surface traces as the centred one with the light moved across; a tilted plate shifts a ray as its closed form says', () => {
  const n = { glass: 'custom', n: 1.6 };
  const P0 = { surfaces: [surf(30)], gaps: [], materials: [], stopIndex: 0, parts: [{ id: 'L', kind: 'lens', n: 1 }] };
  const P1 = { surfaces: [surf(30, { dec: [0.2, 0.3, 0] })], gaps: [], materials: [], stopIndex: 0 };
  const S0 = E.lensSystem(P0, 587.56, { imageMaterial: n }), S1 = E.lensSystem(P1, 587.56, { imageMaterial: n });
  for (const [x, y, l, m] of [[1, 2, 0.05, -0.1], [-3, 0.5, 0, 0.2]]) {
    const N = Math.sqrt(1 - l * l - m * m), a = new Float64Array([x, y, -5, l, m, N, 0, 0]), b = new Float64Array([x - 0.2, y - 0.3, -5, l, m, N, 0, 0]);
    E.traceRay(S1, a, 0, 0); E.traceRay(S0, b, 0, 0);
    assert.ok(Math.abs(a[0] - b[0] - 0.2) < 1e-12 && Math.abs(a[1] - b[1] - 0.3) < 1e-12 && Math.abs(a[2] - b[2]) < 1e-12 && Math.abs(a[4] - b[4]) < 1e-14 && Math.abs(a[6] - b[6]) < 1e-12);
  }
  // a plate 5 mm thick tilted 10° about x: a ray along the axis leaves parallel, shifted by t sin α (1 - cos α / √(n² - sin² α))
  const t = 5, al = 10 * Math.PI / 180, ng = 1.5;
  const W = { surfaces: [surf(null), surf(null)], gaps: [t], materials: [{ glass: 'custom', n: ng }], stopIndex: -1, parts: [{ id: 'W', kind: 'window', n: 2 }], image: 10 };
  const Wt = T.perturb(W, [{ kind: 'tilt', i: 0, axis: 'x', lim: 600 }], [600]);
  const S = E.lensSystem(Wt, 587.56), r = new Float64Array([0, 0, -5, 0, 0, 1, 0, 0]);
  E.traceRay(S, r, 0, 1);
  const want = t * Math.sin(al) * (1 - Math.cos(al) / Math.sqrt(ng * ng - Math.sin(al) ** 2));
  assert.ok(Math.abs(Math.abs(r[1]) - want) < 1e-12 && Math.abs(r[4]) < 1e-14 && Math.abs(r[5] - 1) < 1e-14, r[1] + ' against ' + want);
});

const singlet = () => ({ surfaces: [surf(null, { stop: true, semi: 5 }), surf(51.5, { semi: 12.7 }), surf(-51.5, { semi: 12.7 })], gaps: [2, 3.6], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }], stopIndex: 0,
  parts: [{ id: 'S', kind: 'stop', n: 1 }, { id: 'L', kind: 'lens', n: 2 }] });
const prob = (P, fields) => {
  P.image = E.lensSystem(P, 587.56).par.bfl;
  return { P, cond: A.normCond({ aperture: { kind: 'epd', v: 10 }, fields: (fields || [0]).map(deg => ({ deg })), waves: [{ nm: 587.56 }] }), design: A.normDesign({}) };
};

test('a radius’s fringes change its sag over the clear aperture by half a wavelength each; an index change moves the focal length as the lensmaker’s equation does', () => {
  const P = singlet(), ops = [{ kind: 'rad', i: 1, lim: 2 }, { kind: 'ind', i: 1, lim: 0.001 }];
  const Pr = T.perturb(P, ops, [2, 0]), sag = (R, h) => R - Math.sqrt(R * R - h * h);
  assert.ok(Math.abs(sag(Pr.surfaces[1].R, 12.7) - sag(51.5, 12.7) - 632.8e-6) < 1e-12 && Pr.surfaces[1].R < 51.5, 'sag change ' + (sag(Pr.surfaces[1].R, 12.7) - sag(51.5, 12.7)));
  const f0 = E.lensSystem(P, 587.56).par.efl, f1 = E.lensSystem(T.perturb(P, ops, [0, 0.001]), 587.56).par.efl, nd = E.lensSystem(P, 587.56).n[2];
  assert.ok(Math.abs((f1 - f0) / f0 + 0.001 / (nd - 1)) < 2e-5, (f1 - f0) / f0 + ' against ' + -0.001 / (nd - 1));
});

test('the compensator finds the focus a scan does; a round system’s decentres and tilts are alike in x and y and at either limit', () => {
  const pr = prob(singlet());
  const Pp = T.perturb(pr.P, [{ kind: 'thk', i: 1, lim: 0.3 }], [0.3]);
  const best = T.compensated(pr, Pp, true);
  let scan = Infinity;
  for (let dz = -0.5; dz <= 0.5; dz += 0.001) { const Q = Object.assign({}, Pp, { image: pr.P.image + dz }); scan = Math.min(scan, T.compensated(pr, Q, false).crit); }
  assert.ok(best.crit <= scan + 1e-9, best.crit + ' against the scan’s ' + scan);
  const tol = A.normTol({ rad: { on: false }, thk: { on: false }, ind: { on: false }, abbe: { on: false } });
  const S = T.tolSensitivity(pr, tol);
  assert.equal(S.count, 4);
  const [dx, dy, tx, ty] = S.rows;
  for (const r of S.rows) assert.ok(Math.abs(r.minus - r.plus) < 1e-9 && r.plus > 0, r.label + ': ' + r.minus + ', ' + r.plus);
  assert.ok(Math.abs(dx.plus - dy.plus) < 1e-9 && Math.abs(tx.plus - ty.plus) < 1e-9);
});

test('Monte Carlo repeats with its seed however it is cut up, and its mean agrees with the sensitivities’ estimate', () => {
  const pr = prob(singlet(), [0, 3]);
  // tolerances loose enough that their effect, not the nominal, is what is measured
  pr.design.tol = A.normTol({ trials: 200, seed: 5, rad: { v: 20 }, thk: { v: 0.3 }, dec: { v: 0.2 }, tilt: { v: 20 }, ind: { v: 0.005 }, abbe: { v: 2 } });
  const whole = T.tolMonteCarlo(pr, pr.design.tol, 0, 40), parts = T.tolMonteCarlo(pr, pr.design.tol, 0, 25).concat(T.tolMonteCarlo(pr, pr.design.tol, 25, 40));
  assert.deepEqual(whole.map(t => t.crit), parts.map(t => t.crit));
  const S = T.tolSensitivity(pr, pr.design.tol), est = T.rssEstimate(S.nominal, S.rows, 'uniform');
  // the mean square criterion over 1000 builds against the estimate, to four of its standard errors
  const mc = T.tolMonteCarlo(pr, pr.design.tol, 0, 1000), c2 = mc.map(t => t.crit * t.crit), m = c2.reduce((a, b) => a + b, 0) / c2.length;
  const se = Math.sqrt(c2.reduce((a, b) => a + (b - m) ** 2, 0) / c2.length / c2.length);
  assert.ok(Math.abs(m - est * est) < 4 * se && est * est - S.nominal ** 2 > 5 * se, 'Monte Carlo ' + m + ' ± ' + se + ', estimate ' + est * est + ', nominal ' + S.nominal ** 2);
  const st = T.mcStats(mc.map(t => t.crit));
  assert.ok(st.p50 <= st.p90 && st.p90 <= st.p98 && st.best >= S.nominal * 0.5);
});
