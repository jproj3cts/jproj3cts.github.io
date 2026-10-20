/* First-order and thin-film physics checks: an odd r² term is a power and an odd r⁴ term a fourth-order asphere, as
   their even twins are; a ray past the edge of a surface's sphere misses it rather than meeting a sag clamped there;
   an evanescent layer in a stack is a complex cosine (frustrated total internal reflection), not a clamped real one;
   the Gaussian pilot sees a face curved by a2 alone; the RSS estimate takes a cut normal's true variance. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const E = await import('../../src/engines/lens-engine.js');
const C = await import('../../src/core/coatings.js');
const FP = await import('../../src/core/face-pol.js');
const G = await import('../../src/core/geometry.js');
const T = await import('../../src/engines/lens-tol.js');
const TR = await import('../../src/engines/trace.js');
const { seededRng } = await import('../../src/core/numeric.js');

const a2 = a => a[0] * a[0] + a[1] * a[1];
// a flat-backed N-BK7 plate, its front face given
const plate = (front, opts) => E.lensSystem({ surfaces: [Object.assign({ R: null, semi: 5 }, front), { R: null, semi: 5 }], gaps: [5],
  materials: [{ glass: 'N-BK7' }], stopIndex: 0 }, 587.56, Object.assign({ epd: 6 }, opts));
const realBack = S => { const R = new Float64Array(8); R.set([0, 0.01, -1, 0, 0, 1, 0, 0]); E.traceRay(S, R, 0, S.N - 1, true); return -R[1] / R[4] * R[5]; };

test('an odd r² term is paraxial power as a2 is, and an odd r⁴ term a fourth-order asphere as A4 is', () => {
  const ev = plate({ a2: 0.025 }), od = plate({ odd: [0, 0.025] });
  assert.ok(isFinite(od.par.back), 'paraxial BFL ' + od.par.back);
  assert.ok(Math.abs(od.par.back - ev.par.back) < 1e-12 && Math.abs(od.par.efl - ev.par.efl) < 1e-12);
  assert.ok(Math.abs(od.par.back - realBack(od)) < 1e-4, od.par.back + ' against the real ray’s ' + realBack(od));
  // a cone's r term is no paraxial power, and does not break the first order
  const ax = plate({ odd: [0.01, 0.025] });
  assert.ok(Math.abs(ax.par.back - ev.par.back) < 1e-12);
  // the bench's paraxial of the element
  const el = { surfaces: [{ R: null, a2: 0, odd: [0, 0.025] }, { R: null, a2: 0 }], gaps: [5], materials: [{ glass: 'N-BK7' }] };
  assert.ok(Math.abs(TR.paraxial(el, 587.56).bfl - ev.par.back) < 1e-9, 'bench paraxial ' + TR.paraxial(el, 587.56).bfl);
  // Seidel: the same sums for the even and odd forms of each term
  for (const [e, o] of [[{ a2: 0.025 }, { odd: [0, 0.025] }], [{ R: 30, A: [2e-5] }, { R: 30, odd: [0, 0, 0, 2e-5] }]]) {
    const se = E.seidel(plate(e), 2).sum, so = E.seidel(plate(o), 2).sum;
    assert.ok(se.SI !== 0);
    for (const k in se) assert.ok(Math.abs(se[k] - so[k]) < 1e-12 * (1 + Math.abs(se[k])), k + ' ' + se[k] + ' ' + so[k]);
  }
});

test('a ray past the edge of a surface’s sphere misses it, clipped or not', () => {
  const S = E.lensSystem({ surfaces: [{ R: 10 }, { R: null }], gaps: [3], materials: [{ glass: 'N-BK7' }], stopIndex: 0 }, 587.56, {});
  for (const noClip of [true, false]) {
    const R = new Float64Array(8); R.set([0, 12, -1, 0, 0, 1, 0, 0]); E.traceRay(S, R, 0, 0, noClip);
    assert.equal(R[7], -1, 'flag ' + R[7] + ' at z ' + R[2]);
    // inside the edge it meets the sphere where it is
    R.set([0, 8, -1, 0, 0, 1, 0, 0]); E.traceRay(S, R, 0, 0, noClip);
    assert.equal(R[7], 0);
  }
});

/* an independent single-layer reflectance: Airy's sum over Fresnel's coefficients, every cosine complex */
const cx = { mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]], div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
  add: (a, b) => [a[0] + b[0], a[1] + b[1]], sub: (a, b) => [a[0] - b[0], a[1] - b[1]], exp: a => [Math.exp(a[0]) * Math.cos(a[1]), Math.exp(a[0]) * Math.sin(a[1])] };
function airyR(n0, n1, d, n2, deg, nm, pol) {
  const s0 = n0 * Math.sin(deg * Math.PI / 180), cs = n => { const q = 1 - (s0 / n) ** 2; return q >= 0 ? [Math.sqrt(q), 0] : [0, -Math.sqrt(-q)]; };
  const fr = (na, nb) => { const ca = cs(na), cb = cs(nb); const A = pol === 's' ? [na * ca[0], na * ca[1]] : [nb * ca[0], nb * ca[1]], B = pol === 's' ? [nb * cb[0], nb * cb[1]] : [na * cb[0], na * cb[1]]; return cx.div(cx.sub(A, B), cx.add(A, B)); };
  const r01 = fr(n0, n1), r12 = fr(n1, n2), c1 = cs(n1), dl = [2 * Math.PI * n1 * d * c1[0] / nm, 2 * Math.PI * n1 * d * c1[1] / nm];
  const ph = cx.exp([2 * dl[1], -2 * dl[0]]), q = cx.mul(r12, ph);
  return a2(cx.div(cx.add(r01, q), cx.add([1, 0], cx.mul(r01, q))));
}

test('an evanescent layer: complex cosines, as Airy’s sum has it, and nothing lost (frustrated total internal reflection)', () => {
  const L = [{ n: 1.38, d: 100 }], ci = Math.cos(58 * Math.PI / 180);
  const Rs = a2(C.stackAmp(L, 1.7, 1.5, ci, 550, 's')), Rp = a2(C.stackAmp(L, 1.7, 1.5, ci, 550, 'p'));
  assert.ok(Math.abs(Rs - 0.3242) < 1e-3 && Math.abs(Rp - 0.2510) < 1e-3, Rs + ' ' + Rp);
  assert.ok(Math.abs(Rs - airyR(1.7, 1.38, 100, 1.5, 58, 550, 's')) < 1e-12 && Math.abs(Rp - airyR(1.7, 1.38, 100, 1.5, 58, 550, 'p')) < 1e-12);
  // a propagating layer agrees with Airy too
  assert.ok(Math.abs(a2(C.stackAmp(L, 1.7, 1.5, Math.cos(0.5), 550, 'p')) - airyR(1.7, 1.38, 100, 1.5, 0.5 * 180 / Math.PI, 550, 'p')) < 1e-12);
  // energy, through the face as the tracer takes it: an air gap between glasses past the critical angle, thin to thick
  for (const d of [20, 100, 300, 1000]) for (const deg of [45, 60, 75]) {
    const F = FP.faceAmps({ coat: { mode: 'stack', layers: [{ n: 1, d }] } }, 1.5, 1.5, Math.cos(deg * Math.PI / 180), 633);
    assert.ok(Math.abs(a2(F.rs) + a2(F.ts) - 1) < 1e-12 && Math.abs(a2(F.rp) + a2(F.tp) - 1) < 1e-12, d + ' nm, ' + deg + '°');
    assert.ok(Math.abs(a2(F.rs) - airyR(1.5, 1, d, 1.5, deg, 633, 's')) < 1e-12);
  }
  // and the thicker the gap the more comes back
  const rAt = d => a2(FP.faceAmps({ coat: { mode: 'stack', layers: [{ n: 1, d }] } }, 1.5, 1.5, Math.cos(Math.PI / 4), 633).rs);
  assert.ok(rAt(20) < rAt(100) && rAt(100) < rAt(300) && rAt(1000) > 0.998);
  // a substrate past its critical angle: everything comes back
  for (const p of ['s', 'p']) assert.ok(Math.abs(a2(C.stackAmp(L, 1.7, 1, ci, 550, p)) - 1) < 1e-12);
});

test('the Gaussian pilot sees the power of a face curved by a2 or an odd r² term alone', () => {
  const s = G.makeSurf({}, 0, 0, 0, 0.02, [], 5, {}), o = G.makeSurf({}, 0, 0, 0, 0, [], 5, { odd: [0, 0.02] });
  assert.ok(Math.abs(G.kapIn(s, 0) - 0.04) < 1e-6, G.kapIn(s, 0));
  assert.ok(Math.abs(G.kapIn(o, 0) - 0.04) < 1e-6, G.kapIn(o, 0));
  assert.ok(Math.abs(G.kapIn(G.makeSurf({}, 0, 0.04, 0, 0, [], 5, {}), 0) - 0.04) < 1e-6);
  assert.equal(G.kapIn(G.makeSurf({}, 0, 0, 0, 0, [], 5, { odd: [0.05] }), 1), 0);
});

test('the RSS estimate takes the variance of a normal cut at two deviations', () => {
  // one tolerance whose criterion squared grows as the square of the error: the estimate's mean square over the limit's
  const est = T.rssEstimate(0, [{ minus: 1, plus: 1 }], 'normal') ** 2;
  let s = 0, n = 0;
  const R = seededRng(7);
  for (let i = 0; i < 200000; i++) { let g; do { g = Math.sqrt(-2 * Math.log(R() + 1e-15)) * Math.cos(2 * Math.PI * R()); } while (Math.abs(g) > 2); s += (g / 2) ** 2; n++; }
  assert.ok(Math.abs(est - s / n) < 0.003, est + ' against ' + s / n);
  assert.ok(Math.abs(T.rssEstimate(0, [{ minus: 1, plus: 1 }], 'uniform') ** 2 - 1 / 3) < 1e-12);
});
