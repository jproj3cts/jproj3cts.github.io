/* The Huygens PSF: a perfect lens gives the Airy pattern, (2 J1(v)/v)², at f/10 and f/2.6 into glass, and a Strehl ratio of 1;
   out of focus its Strehl ratio is the FFT PSF's (and the closed form's, sinc² of the defocus); a perfect wave meeting the
   image plane at 30° spreads over it 1/cos 30° wider along the slant and no wider across; several wavelengths' irradiances
   add, each with its weight; and off the axis, at a small field, its Strehl ratio is the FFT's. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const N = await import('../../src/engines/lens-analysis.js');
const E = await import('../../src/engines/lens-engine.js');

const surf = (R, x) => ({ R, k: 0, a2: 0, A: [], odd: null, semi: 20, ...x });
const cond = (fields, nms, epd) => ({ aperture: { kind: 'epd', v: epd }, fields: fields.map(deg => ({ deg, w: 1 })), waves: nms.map((nm, i) => ({ nm, w: i + 1 })), primary: 0 });
function systems(P, c, imageMaterial) {
  const S = c.waves.map(w => E.lensSystem(P, w.nm, { epd: c.aperture.v, image: P.image, imageMaterial }));
  const Sp = S[c.primary], na = Math.abs(Sp.n[Sp.N] * Sp.epr * Sp.par.uMarg);
  return { c, S, Sp, P, epd: c.aperture.v, na, fw: 1 / (2 * na), nm0: c.waves[c.primary].nm, W: c.waves.reduce((a, w) => a + w.w, 0) };
}
const n = 1.6, R = 25, glass = { glass: 'custom', n };
const perfect = dz => { const P = { surfaces: [surf(R, { k: -1 / (n * n), semi: 12 })], gaps: [], materials: [], stopIndex: 0 }; P.image = n * R / (n - 1) + (dz || 0); return P; };
const J1 = x => { let s = 0; for (let k = 0; k < 400; k++) { const th = Math.PI * (k + 0.5) / 400; s += Math.cos(th - x * Math.sin(th)); } return s / 400; };

test('a perfect lens: the Airy pattern and a Strehl ratio of 1', () => {
  for (const [epd, tol] of [[4, 0.003], [16, 0.012]]) {
    const A = systems(perfect(), cond([0], [587.56], epd), glass), H = N.huygensPsf(A, 0, 0), M = H.M, c = (M - 1) / 2, lamF = 587.56e-6 * A.fw;
    assert.ok(Math.abs(H.strehl - 1) < 1e-5, 'Strehl ' + H.strehl);
    for (let i = 0; i < M; i++) {
      const v = Math.PI * (i - c) * H.dx / lamF, air = v ? (2 * J1(v) / v) ** 2 : 1, got = H.I[c * M + i] / H.peak, got2 = H.I[i * M + c] / H.peak;
      assert.ok(Math.abs(got - air) < tol && Math.abs(got2 - air) < tol, `f/${(A.fw).toFixed(1)} at v ${v.toFixed(2)}: ${got}, ${got2} against ${air}`);
    }
  }
});

test('out of focus: the Strehl ratio the FFT PSF and the closed form give', () => {
  const lam = 587.56e-6, A0 = systems(perfect(), cond([0], [587.56], 4), glass);
  for (const rms of [0.05, 0.1]) {
    const W020 = rms * Math.sqrt(12), dz = W020 * 2 * n * lam / (A0.na * A0.na), A = systems(perfect(dz), cond([0], [587.56], 4), glass);
    const H = N.huygensPsf(A, 0, 0), F = N.psfAnalysis(A, 0, 0, 64), x = Math.PI * W020, closed = (Math.sin(x) / x) ** 2;
    assert.ok(Math.abs(H.strehl - F.strehl) < 0.002 && Math.abs(H.strehl - closed) < 0.004, `${H.strehl}, FFT ${F.strehl}, closed ${closed}`);
  }
});

test('a perfect wave meeting the image plane at 30° spreads 1/cos 30° wider along the slant, no wider across', () => {
  const lam = 5e-4, k = 2 * Math.PI / lam, Rs = 50, na = 0.1, th = 30 * Math.PI / 180, G = 48, src = [];
  // the wave's axis tipped about x; sources on the sphere about the focus, in phase, evenly spread in direction cosines
  const d0 = [0, Math.sin(th), Math.cos(th)], e1 = [1, 0, 0], e2 = [0, Math.cos(th), -Math.sin(th)];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const a = na * (-1 + (2 * i + 1) / G), b = na * (-1 + (2 * j + 1) / G);
    if (a * a + b * b > na * na) continue;
    const c = Math.sqrt(1 - a * a - b * b), d = [0, 1, 2].map(q => e1[q] * a + e2[q] * b + d0[q] * c);
    src.push(-Rs * d[0], -Rs * d[1], -Rs * d[2], d[0], d[1], d[2], 0, 1);
  }
  const M = 61, dx = 0.04 * lam / na, { re, im } = N.huygensSum(Float64Array.from(src), [0, 0, 0], [1, 0, 0], [0, 1, 0], dx, M, k, 1);
  const I = Array.from(re, (v, q) => v * v + im[q] * im[q]), c = (M - 1) / 2, pk = I[c * M + c];
  // where it first falls to half its peak, out along x and along y (interpolated)
  const half = (step) => { for (let s = 1; s <= c; s++) { const a = I[c * M + c + (s - 1) * step] / pk, b = I[c * M + c + s * step] / pk; if (b < 0.5) return (s - 1 + (a - 0.5) / (a - b)) * dx; } return NaN; };
  const wx = half(1), wy = half(M), want = 0.5145 * lam / na / 2;    // half the Airy pattern's full width at half its peak, 1.029 λ/(2 NA)
  assert.ok(Math.abs(wx - want) < 0.01 * want, 'across ' + wx + ' against ' + want);
  assert.ok(Math.abs(wy / wx - 1 / Math.cos(th)) < 0.01, 'along the slant ' + wy / wx + ' against ' + 1 / Math.cos(th));
});

test('summed a row at a time, quickly, as the exact sum gives it', () => {
  // the triplet-like singlet off the axis, defocused: the quick rows against every wavelet summed exactly
  const P = { surfaces: [surf(null, { stop: true, semi: 5 }), surf(51.5), surf(null)], gaps: [0, 3.6], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }], stopIndex: 0 };
  P.image = E.lensSystem(P, 587.56).par.bfl - 0.12;
  const A = systems(P, cond([0, 10], [587.56], 8)), plan = N.huygensPlan(A, 10, 0, { M: 41, dx: 2e-3 }), q = plan.per[0];
  N.huygensRows(plan, plan.rows);
  const { re, im } = N.huygensSum(q.H.src, plan.centre, [1, 0, 0], [0, 1, 0], plan.dx, plan.M, q.H.k, Math.sign(q.H.Rref) || 1);
  let worst = 0, pk = 0;
  for (let k = 0; k < re.length; k++) pk = Math.max(pk, re[k] ** 2 + im[k] ** 2);
  for (let k = 0; k < re.length; k++) worst = Math.max(worst, Math.abs(plan.I[k] - (re[k] ** 2 + im[k] ** 2)) / pk);
  assert.ok(worst < 2e-3, 'worst ' + worst);
});

test('several wavelengths’ irradiances add, each with its weight', () => {
  const P = { surfaces: [surf(null, { stop: true, semi: 5 }), surf(51.5), surf(null)], gaps: [0, 3.6], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }], stopIndex: 0 };
  P.image = E.lensSystem(P, 587.56).par.bfl;
  const A = systems(P, cond([0], [486.13, 587.56, 656.27], 3));
  A.c.primary = 1; A.Sp = A.S[1];
  const o = { dx: 2e-3, M: 33, N: 32 }, all = N.huygensPsf(A, 0, -1, o), one = [0, 1, 2].map(i => N.huygensPsf(A, 0, i, o));
  let worst = 0;
  for (let q = 0; q < all.I.length; q++) worst = Math.max(worst, Math.abs(all.I[q] - one.reduce((s, h, i) => s + A.c.waves[i].w / A.W * h.I[q], 0)) / all.peak);
  assert.ok(worst < 1e-9, 'worst ' + worst);
});

test('off the axis at a small field its Strehl ratio is the FFT PSF’s', () => {
  const P = { surfaces: [surf(null, { stop: true, semi: 5 }), surf(51.5), surf(null)], gaps: [0, 3.6], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }], stopIndex: 0 };
  P.image = E.lensSystem(P, 587.56).par.bfl - 0.12;
  const A = systems(P, cond([0, 3], [587.56], 8));
  const H = N.huygensPsf(A, 3, 0), F = N.psfAnalysis(A, 3, 0, 64);
  assert.ok(H.strehl < 0.9 && H.strehl > 0.3 && Math.abs(H.strehl - F.strehl) < 0.01, `${H.strehl} against ${F.strehl}`);
});

test('the published Cooke triplet: within 1% of the FFT PSF on the axis and at 14°; at 20° under the sum on the plane square to the chief ray', async () => {
  const { loadProject } = await import('../../src/state/elements.js');
  const ST = await import('../../src/state/project.js');
  const D = await import('../../src/engines/lens-design.js');
  const T = [3.25896, 6.00755, 0.99997, 4.75041, 2.95208], v2 = T[0] + T[1], v3 = v2 + T[2] + T[3];
  const lens = (id, x, R1, R2, t, glass) => ({ type: 'lens', id, name: id, x, y: 0, angle: 0, diameter: 20, surfaces: [{ R: R1 }, { R: R2 }], gaps: [t], materials: [{ glass }], group: 'g1' });
  loadProject({ format: 'jekray', version: 1, elements: [lens('L1', T[0] / 2, 22.01359, -435.76044, T[0], 'N-SK16'), lens('L2', v2 + T[2] / 2, -22.21328, 20.29192, T[2], 'F2'),
    { type: 'stop', id: 'S', name: 'S', x: v2 + T[2], y: 0, angle: 0, aperture: 10, group: 'g1' }, lens('L3', v3 + T[4] / 2, 79.68360, -18.39533, T[4], 'N-SK16')],
    assemblies: [{ id: 'g1', name: 'Cooke triplet', ref: 'L1', cond: { aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0 }, { deg: 14 }, { deg: 20 }], waves: [{ nm: 486.13 }, { nm: 587.56 }, { nm: 656.27 }], primary: 1 }, design: { solves: { 't:image': { kind: 'focus' } } } }] });
  const a = ST.project.assemblies[0], P = D.designPrescription(a); D.commitDesign(a, P);
  const A = N.anaSystems(a, D.designPrescription(a));
  for (const deg of [0, 14]) {
    const H = N.huygensPsf(A, deg, 1), F = N.psfAnalysis(A, deg, 1, 128, 4);
    assert.ok(Math.abs(H.strehl / F.strehl - 1) < 0.01, `${deg}°: ${H.strehl} against ${F.strehl}`);
  }
  const plan = N.huygensPlan(A, 20, 1), q = plan.per[0], C = E.rayAt(A.S[1], 20 * Math.PI / 180, 0, 0), M = plan.M;
  const peak = ey => { const re = new Float64Array(M * M), im = new Float64Array(M * M); for (let j = 0; j < M; j++) N.huygensRow(q.H.src, plan.centre, [1, 0, 0], ey, plan.dx, M, q.H.k, 1, j, re, im); let p = 0; for (let k = 0; k < M * M; k++) p = Math.max(p, re[k] ** 2 + im[k] ** 2); return p / q.H.peak0; };
  const flat = peak([0, 1, 0]), square = peak([0, C[5], -C[4]]);
  assert.ok(flat < square * 0.97 && flat > square * 0.9, `${flat} against ${square}`);
});
