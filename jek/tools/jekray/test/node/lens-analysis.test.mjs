/* Analyses of a lens design against closed forms: a perfect lens (the ellipsoid that images into
   glass without aberration) has no spot, the diffraction-limited MTF, a Strehl ratio of 1 and the
   Airy pattern's encircled energy; its image moved off focus gives the defocus Zernike term and the
   Strehl ratio Maréchal's rule gives; a sphere with its stop at its centre has its foci on a
   sphere about that centre and no distortion; a singlet's longitudinal aberration grows as the
   square of the pupil height; the fans and spots keep a round system's symmetry. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const N = await import('../../src/engines/lens-analysis.js');
const E = await import('../../src/engines/lens-engine.js');

const surf = (R, x) => ({ R, k: 0, a2: 0, A: [], odd: null, semi: 20, ...x });
const cond = (fields, nms, epd) => ({ aperture: { kind: 'epd', v: epd }, fields: fields.map(deg => ({ deg, w: 1 })), waves: nms.map(nm => ({ nm, w: 1 })), primary: 0 });
// the analyses on a bare prescription: its systems built as the design's would be
function systems(P, c, imageMaterial) {
  const S = c.waves.map(w => E.lensSystem(P, w.nm, { epd: c.aperture.v, image: P.image, imageMaterial }));
  const Sp = S[c.primary], na = Math.abs(Sp.n[Sp.N] * Sp.epr * Sp.par.uMarg);
  return { c, S, Sp, P, epd: c.aperture.v, na, fw: 1 / (2 * na), nm0: c.waves[c.primary].nm, W: c.waves.length };
}
const n = 1.6, R = 25, glass = { glass: 'custom', n };
const perfect = (dz) => { const P = { surfaces: [surf(R, { k: -1 / (n * n), semi: 12 })], gaps: [], materials: [], stopIndex: 0 }; P.image = n * R / (n - 1) + (dz || 0); return P; };

test('a perfect lens: no spot, the diffraction-limited MTF, a Strehl ratio of 1, the Airy encircled energy', () => {
  // f/10 into glass, a small enough NA for the pupil to be sampled well
  const A = systems(perfect(), cond([0], [587.56], 4), glass);
  const sp = N.spotDiagram(A, 0, 21);
  assert.ok(sp.rms < 1e-9 && sp.geo < 1e-8, 'spot ' + sp.rms);
  const M = N.mtfAnalysis(A, 0);
  for (const f of [0.25, 0.5, 0.75]) {
    const k = Math.round(f * 60), v = M.freqs[k] / M.cutoff, want = N.mtfPerfect(v);
    assert.ok(Math.abs(M.tan[k] - want) < 0.02 && Math.abs(M.sag[k] - want) < 0.02, 'MTF at ' + v + ': ' + M.tan[k] + ', ' + M.sag[k] + ' against ' + want);
  }
  const F = N.psfAnalysis(A, 0);
  assert.ok(Math.abs(F.strehl - 1) < 1e-9, 'Strehl ' + F.strehl);
  // encircled energy within the first dark ring: 83.8%
  const k = F.r.findIndex(r => r >= F.airy);
  assert.ok(Math.abs(F.ee[k - 1] + (F.ee[k] - F.ee[k - 1]) * (F.airy - F.r[k - 1]) / (F.r[k] - F.r[k - 1]) - 0.838) < 0.03, 'EE at the first dark ring ' + F.ee[k]);
});

test('the perfect lens out of focus: the defocus Zernike term, and Maréchal’s Strehl ratio', () => {
  const lam = 587.56e-6, P0 = perfect(), A0 = systems(P0, cond([0], [587.56], 4), glass);
  // a defocus of a twentieth of a wave rms: W020 = δ NA² / (2 n') waves at the edge, rms W020/√12
  const dz = 0.05 * Math.sqrt(12) * 2 * n * lam / (A0.na * A0.na);
  const A = systems(perfect(dz), cond([0], [587.56], 4), glass);
  const Wm = N.wavefrontMap(A, 0, 0, 64), z4 = Wm.coef[3], want = dz * A.na * A.na / (4 * n * lam);
  assert.ok(Math.abs(Math.abs(z4) - want) < 0.03 * want, 'Z4 ' + z4 + ' against ' + want);
  assert.ok(Wm.coef.every((c, i) => i === 0 || i === 3 || i === 8 || Math.abs(c) < 1e-3 * Math.abs(z4)), JSON.stringify(Wm.coef));
  assert.ok(Math.abs(Wm.rms - 0.05) < 0.003, 'rms ' + Wm.rms);
  const F = N.psfAnalysis(A, 0, 0, 64);
  const mar = Math.exp(-((2 * Math.PI * Wm.rms) ** 2));
  assert.ok(Math.abs(F.strehl - mar) < 0.01, 'Strehl ' + F.strehl + ' against ' + mar);
});

test('a sphere with its stop at its centre: foci on a sphere about the centre, tangential and sagittal alike, and no distortion', () => {
  // into glass; the stop flat at the centre of curvature, in the glass
  const P = { surfaces: [surf(R, { semi: 30 }), surf(null, { stop: true, semi: 2 })], gaps: [R], materials: [glass], stopIndex: 1 };
  const s1 = n * R / (n - 1);
  P.image = s1 - R;
  const A = systems(P, cond([0, 10], [587.56], 1), glass);
  const C = N.fieldCurves(A, 11);
  C.degs.forEach((g, i) => {
    const want = (s1 - R) * (Math.cos(g * Math.PI / 180) - 1);
    assert.ok(Math.abs(C.waves[0].tan[i] - want) < 2e-4 && Math.abs(C.waves[0].sag[i] - want) < 2e-4, g + '°: ' + C.waves[0].tan[i] + ', ' + C.waves[0].sag[i] + ' against ' + want);
    assert.ok(Math.abs(C.dist[i]) < 1e-9, 'distortion ' + C.dist[i]);
  });
});

test('a singlet: its longitudinal aberration grows as the square of the pupil height; its fans and spot keep a round system’s symmetry', () => {
  const P = { surfaces: [surf(null, { stop: true, semi: 5 }), surf(51.5), surf(null)], gaps: [0, 3.6], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }], stopIndex: 0 };
  P.image = E.lensSystem(P, 587.56).par.bfl;
  const A = systems(P, cond([0, 5], [486.13, 587.56, 656.27], 10));
  A.c.primary = 1; A.Sp = A.S[1];
  const L = N.longitudinal(A, 20);
  const d = L.waves[1].dz, a = d[1], b = d[3];                // at 0.1 and 0.2 of the pupil
  assert.ok(Math.abs(b / a - 4) < 0.02, 'ratio ' + b / a);
  assert.ok(d[19] < 0, 'an uncorrected singlet focuses its marginal rays short');
  assert.ok(Math.abs(L.shift[L.lam.findIndex((x, i) => i === 0)] ) > 0 && L.shift.some(v => Math.abs(v) < 0.05), 'chromatic shift');
  const F = N.rayFans(A, 0, 21);
  F.waves[1].tan.forEach((v, i) => { assert.ok(Math.abs(v + F.waves[1].tan[20 - i]) < 1e-12); assert.ok(Math.abs(v - F.waves[1].sag[i]) < 1e-12); });
  const sp = N.spotDiagram(A, 0, 21), one = E.spotOf(A.S[1], 0, E.pupilGrid(21));
  const sp1 = N.spotDiagram(Object.assign({}, A, { S: [A.S[1]], c: Object.assign({}, A.c, { waves: [A.c.waves[1]], primary: 0 }) }), 0, 21);
  assert.ok(Math.abs(sp1.rms - one.rms) < 1e-12, sp1.rms + ' against ' + one.rms);
  assert.ok(sp.rms > sp1.rms, 'colour adds to the spot');
  const O = N.opdFans(A, 5, 21);
  assert.ok(Math.abs(O.waves[1].tan[10]) < 1e-9, 'the chief ray has no OPD');
});
