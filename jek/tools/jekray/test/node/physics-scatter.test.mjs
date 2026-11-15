/* Light scattered by one particle: Lorenz-Mie for a sphere (core/mie.js) against published values (Bohren and
   Huffman's Appendix A; Wiscombe's test cases), its limits and its sum rules; the dipole array (core/dda.js) against
   Mie for a sphere, its reciprocity and its energy balance for a rod; a tight focus as a set of plane waves
   (core/scatter.js, engines/scatter.js) against the plane wave it tends to and against the dipole of the local
   field; and the bench's own run (a screen's particle in a focused beam). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBench, engine } from '../../headless.mjs';
const E = await engine();                                       // first: the page's stand-ins, then the modules in order
const { mieCoeffs, mieQ, mieS, mieTable, mieTerms } = await import('../../src/core/mie.js');
const { ddaAlpha, ddaExtAbs, ddaFar, ddaLattice, ddaPlan, ddaPlaneWave, ddaSolveNow, ddaSolver, ddaVolume } = await import('../../src/core/dda.js');
const { coneGrid, dipoleFar, farPower, gaussLegendre, mieFarExact, mieFarWaves, smallAlpha, sphereGrid, sphereTotals } = await import('../../src/core/scatter.js');
const { particleDom, scatterModel, scatterNow, scatterPrep, scatterWaves } = await import('../../src/engines/scatter.js');
const { popRun } = await import('../../src/engines/beam-tree.js');
const { trapBeams } = await import('../../src/engines/diffraction.js');
const { vfAt } = await import('../../src/engines/vector-focus.js');
const { particleOf, sphereAlpha } = await import('../../src/core/traps.js');

const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const near = (a, b, tol, msg) => assert.ok(rel(a, b) <= tol, (msg || '') + ': ' + a + ' against ' + b + ' (' + rel(a, b).toExponential(2) + ', allowed ' + tol + ')');
const EX = [1, 0, 0], EY = [0, 1, 0], EZ = [0, 0, 1];

/* ---------- Lorenz-Mie ---------- */
test('Mie: Bohren and Huffman’s test case, and Wiscombe’s', () => {
  // Appendix A of Absorption and Scattering of Light by Small Particles: radius 0.525 um, n = 1.55, 0.6328 um
  const Q = mieQ(mieCoeffs(2 * Math.PI * 0.525 / 0.6328, 1.55, 0));
  assert.ok(Math.abs(Q.Qext - 3.10543) < 6e-6 && Math.abs(Q.Qsca - 3.10543) < 6e-6 && Math.abs(Q.Qback - 2.92534) < 6e-6, JSON.stringify(Q));
  // Wiscombe's test cases for his Mie code, as Mie codes' own tests quote them: [m re, m im, x, Q_ext, g], to the figures given
  // (each good to half a unit of its last figure)
  const half = s => 0.5001 * 10 ** -((s.split('e')[0].split('.')[1] || '').length - (+(s.split('e')[1] || 0)));
  for (const [mr, mi, x, qe, g] of [[0.75, 0, 0.099, '7.417859e-6', '0.001448'], [0.75, 0, 0.101, '8.033538e-6', '0.001507'], [0.75, 0, 10, '2.232265', '0.896473'], [0.75, 0, 1000, '1.997908', '0.844944'],
    [1.33, 1e-5, 100, '2.101321', null], [1.33, 1e-5, 10000, '2.004089', '0.907840'],
    [1.5, 1, 0.055, '0.101491', '0.000491'], [1.5, 1, 0.056, '0.103347', '0.000509'], [1.5, 1, 1, '2.336321', '0.192136'], [1.5, 1, 100, '2.097502', '0.850252'], [1.5, 1, 10000, '2.004368', '0.846309']]) {
    const q = mieQ(mieCoeffs(x, mr, mi));
    assert.ok(Math.abs(q.Qext - qe) < half(qe), 'Q_ext, m = ' + mr + ' + ' + mi + 'i, x = ' + x + ': ' + q.Qext + ' against ' + qe);
    if (g !== null) assert.ok(Math.abs(q.g - g) < 2 * half(g), 'g, m = ' + mr + ' + ' + mi + 'i, x = ' + x + ': ' + q.g + ' against ' + g);
  }
});
test('Mie: the Rayleigh limit as the sphere shrinks', () => {
  for (const [mr, mi] of [[1.444, 0], [1.5, 0.3], [0.8, 0]]) {
    const er = mr * mr - mi * mi, ei = 2 * mr * mi, d2 = (er + 2) ** 2 + ei * ei, cm = [((er - 1) * (er + 2) + ei * ei) / d2, 3 * ei / d2], cm2 = cm[0] ** 2 + cm[1] ** 2;
    let last = Infinity;
    for (const x of [0.2, 0.05, 0.01, 0.001]) {
      const C = mieCoeffs(x, mr, mi), Q = mieQ(C), ray = 8 / 3 * x ** 4 * cm2;
      const err = rel(Q.Qsca, ray);
      assert.ok(err < 3 * x * x && err < last, 'Q_sca at x = ' + x + ': ' + err);          // the first correction is of order x^2
      last = err;
      if (mi > 0) near(Q.Qabs, 4 * x * cm[1], 3 * x * x + 1e-9, 'Q_abs at x = ' + x);
      if (x <= 0.01) {
        // S1 = -i x^3 (m^2 - 1)/(m^2 + 2), S2 = S1 cos(theta); and as much back as forward
        const S0 = mieS(C, 1), S60 = mieS(C, 0.5), Sb = mieS(C, -1);
        near(Math.hypot(S0[0], S0[1]), x ** 3 * Math.sqrt(cm2), 2 * x * x, '|S1(0)|');
        near(Math.hypot(S60[2], S60[3]) / Math.hypot(S60[0], S60[1]), 0.5, 2 * x * x, 'S2/S1 at 60 degrees');
        near(Math.hypot(Sb[0], Sb[1]), Math.hypot(S0[0], S0[1]), 2 * x * x, 'back against forward');
        assert.ok(Math.abs(Q.g) < x * x);
      }
    }
  }
  // tiny spheres lose nothing to rounding: a sphere a millionth of a wavelength round
  const Q = mieQ(mieCoeffs(1e-6, 1.5, 0));
  near(Q.Qsca, 8 / 3 * 1e-24 * (1.25 / 4.25) ** 2, 1e-9, 'x = 1e-6');
});
test('Mie: no absorption means Q_ext = Q_sca; the optical theorem; the pattern integrates to Q_sca and g', () => {
  for (const [x, mr, mi] of [[0.608, 1.444, 0], [3, 1.33, 0], [5.2128, 1.55, 0], [25, 1.5, 0], [100, 1.33, 0], [300, 2.4, 0], [4, 1.5, 0.2], [30, 1.33, 0.01], [2, 0.5, 10]]) {
    const C = mieCoeffs(x, mr, mi), Q = mieQ(C);
    assert.equal(C.n, mieTerms(x));
    if (mi === 0) assert.ok(Math.abs(Q.Qext - Q.Qsca) < 1e-11 * Q.Qext, 'lossless at x = ' + x + ': ' + (Q.Qext - Q.Qsca));
    else assert.ok(Q.Qabs > 0);
    // Q_ext = (4 / x^2) Re S(0); Q_back = 4 |S(180)|^2 / x^2
    const S0 = mieS(C, 1), Sb = mieS(C, -1);
    near(4 / (x * x) * S0[0], Q.Qext, 1e-11, 'optical theorem at x = ' + x);
    assert.ok(Math.abs(S0[0] - S0[2]) < 1e-9 * Math.abs(S0[0]) && Math.abs(Sb[0] + Sb[2]) < 1e-9 * Math.hypot(Sb[0], Sb[1]) + 1e-12, 'S1 = S2 forward, -S2 back');
    near(4 * (Sb[0] ** 2 + Sb[1] ** 2) / (x * x), Q.Qback, 1e-10, 'back at x = ' + x);
    // Q_sca = (1 / x^2) int (|S1|^2 + |S2|^2) sin(theta) dtheta, g its mean cosine
    const G = gaussLegendre(Math.max(48, 2 * C.n + 16));
    let s = 0, sg = 0;
    for (let i = 0; i < G.x.length; i++) { const S = mieS(C, G.x[i]), v = (S[0] ** 2 + S[1] ** 2 + S[2] ** 2 + S[3] ** 2) * G.w[i]; s += v; sg += v * G.x[i]; }
    near(s / (x * x), Q.Qsca, 1e-10, 'integrated pattern at x = ' + x);
    near(sg / s, Q.g, 1e-9, 'asymmetry at x = ' + x);
  }
});
test('Mie: the far field for any direction of the light and any polarisation', () => {
  const x = 2.3, k = 4.2e6, C = mieCoeffs(x, 1.59, 0.02), Q = mieQ(C), tab = mieTable(C), area = Math.PI * (x / k) ** 2;
  const G = sphereGrid(40, 80, EX, EY, EZ), n = 40 * 80;
  // a wave along an odd direction, elliptically polarised
  const d = [0.36, -0.48, 0.8], e1 = [0.8, 0, -0.36].map(v => v / Math.hypot(0.8, 0.36)), e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
  const Ew = [0, 1, 2].flatMap(q => [0.6 * e1[q], 0.8 * e2[q]]);                    // 0.6 e1 + 0.8 i e2, |E| = 1
  const waves = { n: 1, d: Float64Array.from(d), E: Float64Array.from(Ew) };
  const F = mieFarWaves(tab, k, waves, G.dirs), Fx = mieFarExact(C, k, d, Ew, G.dirs);
  let dmax = 0, fmax = 0; for (let i = 0; i < F.length; i++) { dmax = Math.max(dmax, Math.abs(F[i] - Fx[i])); fmax = Math.max(fmax, Math.abs(Fx[i])); }
  assert.ok(dmax < 2e-4 * fmax, 'the table against the full sum: ' + dmax / fmax);
  // transverse, and the cross-section whatever the direction and polarisation
  for (let i = 0; i < n; i += 37) { const o = 6 * i, r = G.dirs.subarray(3 * i, 3 * i + 3); assert.ok(Math.hypot(Fx[o] * r[0] + Fx[o + 2] * r[1] + Fx[o + 4] * r[2], Fx[o + 1] * r[0] + Fx[o + 3] * r[1] + Fx[o + 5] * r[2]) < 1e-12 * fmax); }
  const T = sphereTotals(sphereGrid(40, 80, e1, e2, d), farPower([mieFarExact(C, k, d, Ew, sphereGrid(40, 80, e1, e2, d).dirs)], n));
  near(T.total, Q.Qsca * area, 1e-8, 'C_sca from the far field');
  near(T.g, Q.g, 1e-7, 'g from the far field');
  // straight on: F = (i / k) S(0) E, so the optical theorem in the vector form, C_ext = (4 pi / k) Im(conj(E) . F)
  const F0 = mieFarExact(C, k, d, Ew, Float64Array.from(d));
  let im = 0; for (let q = 0; q < 6; q += 2) im += Ew[q] * F0[q + 1] - Ew[q + 1] * F0[q];
  near(4 * Math.PI / k * im, Q.Qext * area, 1e-10, 'C_ext from the forward amplitude');
});

/* ---------- The dipole array ---------- */
// a particle in a plane wave: { Cext, Cabs, Csca (the far field integrated), far(dirs), lat, iters }
function ddaRun(shape, D, L, lam, m, o = {}) {
  const k = 2 * Math.PI / lam, dir = o.dir || EZ, e0 = o.e0 || [1, 0, 0, 0, 0, 0];
  const lat = ddaPlan(shape, D, L, k, Math.hypot(m[0], m[1]), { across: o.across || 10, nMax: o.nMax || 20000 });
  const alpha = ddaAlpha(m[0], m[1], k, lat.d, o.how || 'ldr', dir, e0), S = ddaSolver(lat, k, alpha), E = ddaPlaneWave(lat, k, dir, e0);
  const r = ddaSolveNow(S, E, { tol: o.tol || 1e-5 }), X = ddaExtAbs(k, alpha, E, r.p);
  const G = sphereGrid(32, 64, EX, EY, EZ), T = sphereTotals(G, farPower([ddaFar(lat, k, r.p, G.dirs)], 32 * 64));
  return { k, lat, iters: r.iters, converged: r.converged, Cext: X.ext, Cabs: X.abs, Csca: T.total, far: dirs => ddaFar(lat, k, r.p, Float64Array.from(dirs)) };
}
test('dipole array: a sphere against Mie, within 2% at 300 nm and 3% at 1 µm (silica, 1550 nm)', () => {
  const lam = 1.55e-6, m = [1.444, 0];
  for (const [D, across, tol] of [[300e-9, 10, 0.02], [1000e-9, 16, 0.03]]) {
    const R = ddaRun('sphere', D, D, lam, m, { across }), x = R.k * D / 2, C = mieCoeffs(x, m[0], 0), Q = mieQ(C), A = Math.PI * D * D / 4;
    assert.ok(R.converged && !R.lat.coarse && !R.lat.capped && R.lat.mkd <= 0.5);
    near(R.Cext, Q.Qext * A, tol, 'C_ext, ' + D * 1e9 + ' nm (' + R.lat.N + ' dipoles)');
    near(R.Csca, Q.Qsca * A, tol, 'C_sca, ' + D * 1e9 + ' nm');
    assert.ok(Math.abs(R.Cabs) < 1e-9 * R.Cext, 'a lossless sphere absorbs nothing: ' + R.Cabs / R.Cext);
    // the amplitude straight on and at 90 degrees in the plane square to the polarisation: (i / k) S1
    const F = R.far([0, 0, 1, 0, 1, 0]), S0 = mieS(C, 1), S90 = mieS(C, 0);
    assert.ok(Math.hypot(F[0] * R.k + S0[1], F[1] * R.k - S0[0]) < tol * Math.hypot(S0[0], S0[1]), 'forward amplitude');
    assert.ok(Math.hypot(F[6] * R.k + S90[1], F[7] * R.k - S90[0]) < 1.5 * tol * Math.hypot(S90[0], S90[1]), 'amplitude at 90 degrees');
  }
  // an absorbing sphere: C_abs too
  const R = ddaRun('sphere', 300e-9, 300e-9, lam, [1.5, 0.5], { across: 12 }), Q = mieQ(mieCoeffs(R.k * 150e-9, 1.5, 0.5)), A = Math.PI * 150e-9 ** 2;
  near(R.Cext, Q.Qext * A, 0.03, 'C_ext, absorbing'); near(R.Cabs, Q.Qabs * A, 0.03, 'C_abs, absorbing');
});
test('dipole array: the lattice keeps the shape’s volume, and says when it is coarse or held back', () => {
  for (const [shape, D, L] of [['sphere', 300e-9, 300e-9], ['cylinder', 200e-9, 1000e-9], ['capsule', 200e-9, 1000e-9], ['spheroid', 200e-9, 1000e-9], ['spheroid', 600e-9, 150e-9]]) {
    const lat = ddaLattice(shape, D, L, Math.min(D, L) / 12);
    near(lat.N * lat.d ** 3, ddaVolume(shape, D, L), 1e-12, shape + ' volume');
    // a lattice whose centre is the particle's
    let sx = 0, sy = 0, sz = 0; for (let j = 0; j < lat.N; j++) { sx += lat.x[j]; sy += lat.y[j]; sz += lat.z[j]; }
    assert.ok(Math.hypot(sx, sy, sz) / lat.N < 1e-9 * D);
  }
  near(ddaVolume('capsule', 200e-9, 200e-9), ddaVolume('sphere', 200e-9, 200e-9), 1e-12, 'a capsule no longer than it is wide is a sphere');
  const k = 2 * Math.PI / 1.55e-6;
  const fine = ddaPlan('cylinder', 200e-9, 1000e-9, k, 1.444);
  assert.ok(!fine.coarse && !fine.capped && fine.across > 9.5 && fine.mkd < 0.5, JSON.stringify([fine.N, fine.across, fine.mkd]));
  // a big sphere within a small budget: the spacing opens out, |m|kd goes past 0.5, and both are said
  const big = ddaPlan('sphere', 4000e-9, 4000e-9, k, 3.5, { nMax: 2000 });
  assert.ok(big.capped && big.coarse && big.mkd > 0.5 && big.N <= 2100, JSON.stringify([big.N, big.mkd]));
  // few dipoles across is coarse however small |m|kd
  assert.ok(ddaPlan('cylinder', 20e-9, 1000e-9, k, 1.444, { nMax: 300 }).coarse);
});
test('dipole array: a rod’s energy balance, symmetries and reciprocity', () => {
  const lam = 1.55e-6, D = 200e-9, L = 1000e-9;
  // lossless: what it takes from the wave is what it scatters; absorbing: C_ext = C_sca + C_abs
  for (const [m, dir, e0] of [[[1.444, 0], EX, [0, 0, 0, 0, 1, 0]], [[1.444, 0], EX, [0, 0, 1, 0, 0, 0]], [[1.444, 0], EZ, [1, 0, 0, 0, 0, 0]], [[1.6, 0.2], EX, [0, 0, 0, 0, 1, 0]]]) {
    const R = ddaRun('cylinder', D, L, lam, m, { dir, e0, across: 8 });
    assert.ok(R.converged);
    near(R.Csca + R.Cabs, R.Cext, 5e-3, 'C_ext = C_sca + C_abs, m = ' + m + ', along ' + dir);
    if (!m[1]) assert.ok(Math.abs(R.Cabs) < 1e-8 * R.Cext); else assert.ok(R.Cabs > 0.1 * R.Cext);
  }
  // the wave along the axis: either polarisation the same (the lattice has the rod's fourfold symmetry)
  const ax = ddaRun('cylinder', D, L, lam, [1.444, 0], { dir: EZ, e0: [1, 0, 0, 0, 0, 0], across: 8 }), ay = ddaRun('cylinder', D, L, lam, [1.444, 0], { dir: EZ, e0: [0, 0, 1, 0, 0, 0], across: 8 });
  near(ax.Cext, ay.Cext, 1e-6, 'x against y polarisation along the axis');
  // square to the axis: the field along the rod is taken up more than the field across it, and from either side alike
  const par = ddaRun('cylinder', D, L, lam, [1.444, 0], { dir: EX, e0: [0, 0, 0, 0, 1, 0], across: 8 }), perp = ddaRun('cylinder', D, L, lam, [1.444, 0], { dir: EX, e0: [0, 0, 1, 0, 0, 0], across: 8 });
  assert.ok(par.Cext > 1.5 * perp.Cext, 'along ' + par.Cext + ' across ' + perp.Cext);
  near(ddaRun('cylinder', D, L, lam, [1.444, 0], { dir: [-1, 0, 0], e0: [0, 0, 0, 0, 1, 0], across: 8 }).Cext, par.Cext, 1e-6, 'from the other side');
  // reciprocity: e2 . F(k2; k1, e1) = e1 . F(-k1; -k2, e2), for a wave and a direction both oblique to the rod
  const k1 = [0.6, 0, 0.8], e1 = [0, 1, 0], k2 = [0, 0.6, -0.8], e2 = [1, 0, 0];
  const A = ddaRun('cylinder', D, L, lam, [1.444, 0], { dir: k1, e0: [0, 0, 1, 0, 0, 0], across: 8, how: 'cm', tol: 1e-8 }).far(k2);
  const B = ddaRun('cylinder', D, L, lam, [1.444, 0], { dir: k2.map(v => -v), e0: [1, 0, 0, 0, 0, 0], across: 8, how: 'cm', tol: 1e-8 }).far(k1.map(v => -v));
  const a = [A[0] * e2[0] + A[2] * e2[1] + A[4] * e2[2], A[1] * e2[0] + A[3] * e2[1] + A[5] * e2[2]], b = [B[0] * e1[0] + B[2] * e1[1] + B[4] * e1[2], B[1] * e1[0] + B[3] * e1[1] + B[5] * e1[2]];
  assert.ok(Math.hypot(a[0], a[1]) > 0 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6 * Math.hypot(a[0], a[1]), 'reciprocity: ' + a + ' against ' + b);
  // a small spheroid is the Rayleigh ellipsoid: its static polarisability along and across
  const sm = ddaRun('spheroid', 20e-9, 60e-9, lam, [1.444, 0], { dir: EX, e0: [0, 0, 0, 0, 1, 0], across: 10 }), al = smallAlpha(ddaVolume('spheroid', 20e-9, 60e-9), 3, 1.444, 0, sm.k);
  near(sm.Cext, 8 * Math.PI / 3 * sm.k ** 4 * (al[0][0] ** 2 + al[0][1] ** 2), 0.03, 'a small prolate spheroid, the field along it');
});

/* ---------- A focus as plane waves ---------- */
// the plane waves of an ideal lens focusing x-polarised light (Richards and Wolf's rays), a Gaussian across the pupil, to numerical aperture NA
function lensWaves(NA, M, off) {
  const d = [], E = [], smax = NA, k = off ? off.k : 0;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const sx = ((i + 0.5) / M * 2 - 1) * smax, sy = ((j + 0.5) / M * 2 - 1) * smax, s2 = sx * sx + sy * sy;
    if (s2 >= smax * smax) continue;
    const cz = Math.sqrt(1 - s2), s = Math.sqrt(s2), ph = Math.atan2(sy, sx), amp = Math.exp(-s2 / (0.7 * smax) ** 2) / Math.sqrt(cz);
    // x-polarised before the lens, turned with the ray
    const cp = Math.cos(ph), sp = Math.sin(ph), ex = cz * cp * cp + sp * sp, ey = (cz - 1) * cp * sp, ez = -s * cp;
    const dv = [sx, sy, cz], pd = off ? k * (dv[0] * off.r[0] + dv[1] * off.r[1] + dv[2] * off.r[2]) : 0, c = Math.cos(pd) * amp, sn = Math.sin(pd) * amp;
    d.push(...dv); E.push(ex * c, ex * sn, ey * c, ey * sn, ez * c, ez * sn);
  }
  return { n: d.length / 3, d: Float64Array.from(d), E: Float64Array.from(E) };
}
const sumE = W => { const e = [0, 0, 0, 0, 0, 0]; for (let o = 0; o < W.n; o++) for (let q = 0; q < 6; q++) e[q] += W.E[6 * o + q]; return e; };
test('a sphere at the focus of a low-NA beam scatters as in the plane wave', () => {
  const x = 2.4, k = 5e6, C = mieCoeffs(x, 1.444, 0), tab = mieTable(C), G = sphereGrid(36, 72, EX, EY, EZ), n = 36 * 72;
  let last = Infinity;
  for (const NA of [0.2, 0.1, 0.03]) {
    const W = lensWaves(NA, 24), E0 = sumE(W), F = mieFarWaves(tab, k, W, G.dirs), F1 = mieFarExact(C, k, EZ, E0, G.dirs);
    let dmax = 0, fmax = 0; for (let i = 0; i < F.length; i++) { dmax = Math.max(dmax, Math.abs(F[i] - F1[i])); fmax = Math.max(fmax, Math.abs(F1[i])); }
    assert.ok(dmax / fmax < last, 'NA ' + NA + ' is nearer the plane wave than the last: ' + dmax / fmax);
    last = dmax / fmax;
    const T = sphereTotals(G, farPower([F], n)), Q = mieQ(C), want = Q.Qsca * Math.PI * (x / k) ** 2 * E0.reduce((a, v) => a + v * v, 0);
    if (NA === 0.03) { assert.ok(last < 2e-3, 'the pattern at NA 0.03: ' + last); near(T.total, want, 2e-3, 'the scattered power at NA 0.03'); near(T.g, Q.g, 5e-3, 'g at NA 0.03'); }
  }
});
test('a Rayleigh sphere in a tight focus radiates as the dipole of the field where it sits', () => {
  const k = 5e6, a = 8e-9, x = k * a, C = mieCoeffs(x, 1.444, 0), tab = mieTable(C), G = sphereGrid(24, 48, EX, EY, EZ), n = 24 * 48;
  const al = smallAlpha(4 / 3 * Math.PI * a ** 3, 1, 1.444, 0, k)[0];
  // at the focus, and a third of a wavelength off it sideways and along (the field there has a part along the axis)
  for (const r of [[0, 0, 0], [0.42e-6, 0.1e-6, 0.25e-6]]) {
    const W = lensWaves(0.9, 28, { k, r }), E0 = sumE(W), p = [0, 1, 2].flatMap(q => [al[0] * E0[2 * q] - al[1] * E0[2 * q + 1], al[0] * E0[2 * q + 1] + al[1] * E0[2 * q]]);
    const F = mieFarWaves(tab, k, W, G.dirs), Fd = dipoleFar(k, p, G.dirs);
    let dmax = 0, fmax = 0; for (let i = 0; i < F.length; i++) { dmax = Math.max(dmax, Math.abs(F[i] - Fd[i])); fmax = Math.max(fmax, Math.abs(Fd[i])); }
    assert.ok(dmax < 3e-3 * fmax, 'the pattern, the sphere at ' + r + ': ' + dmax / fmax);       // corrections of order x^2 = 1.6e-3
    if (r[0]) assert.ok(Math.hypot(E0[4], E0[5]) > 0.05 * Math.hypot(E0[0], E0[1]), 'off the axis the field has a part along it');
  }
});

/* ---------- On the bench ---------- */
const bench = (name, elements) => ({ format: 'jekray', version: 1, name, view: { cx: 0, cy: 0, scale: 6 }, snap: 0, maxBounces: 400, minPower: 1e-6, ghosts: false, elements });
const laser = o => Object.assign({ type: 'source', name: 'L', x: -20, y: 0, angle: 0, wavelength: 1550, gauss: true, w0: 0.8, z0: 0, width: 1.6, rays: 1, pol: 's', power: 100, popN: 256 }, o);
const objective = { type: 'mask', name: 'Obj', x: 0, y: 0, angle: 0, length: 4.13, amp: '1', delay: '-(sqrt(r^2+1)-1)/lambda' };         // an ideal lens, f = 1 mm
// (a Particle part; its axis direction is its angle, as a screen's particle's trapAz was)
const particle = ({ trapAz, length, ...o }) => Object.assign({ type: 'particle', name: 'S', x: 1, y: 0, angle: trapAz === undefined ? 90 : trapAz, trapMat: 'Fused silica', trapR: 150, trapMed: 'vacuum' }, o);
async function scat(els) { const B = await openBench(bench('scatter', els)); B.trace(); return scatterNow(E.ST.project.elements.find(e => e.name === 'S')); }

test('bench: a file from before the particle had a shape loads as the sphere it was', async () => {
  await openBench(bench('old', [laser({}), objective, { type: 'screen', name: 'S', x: 1, y: 0, angle: 180, length: 0.02, absorb: false, trap: 'sphere', trapMat: 'Fused silica', trapR: 75, trapMed: 'air', trapP: 5 }]));
  // (a screen's particle opens as a Particle part of its own)
  const el = E.ST.project.elements.find(e => e.name === 'S particle'), P = particleOf(el);
  assert.deepEqual([el.trapShape, el.scatModel, el.scatAt, el.scatDip, el.scatDx, el.trapMed, el.trapR], ['sphere', 'auto', 'part', 0, 0, 'air', 75]);
  assert.equal(P.rEq, 75); assert.equal(P.shape, 'sphere');
  // and the trap's sphere is what it was: Clausius-Mossotti with the radiation reaction, real for a glass
  const S = sphereAlpha('Fused silica', 75, 1064, 1);
  assert.ok(S.re > 0 && S.im > 0 && S.im < 0.05 * S.re && !('kap' in S));
  // gold absorbs: a complex polarisability, more absorbed than scattered at this size
  const Au = sphereAlpha('Au', 20, 1064, 1);
  assert.ok(Au.kap > 5 && Au.im > 0 && Au.re > 0);
  // no particle, no scattering
  el.trap = 'none'; assert.equal(scatterPrep(el), null);
});
test('bench: Auto takes Mie for a sphere, the dipole array for a rod, one dipole only when tiny', () => {
  const k = 2 * Math.PI / 1.55e-6, pick = o => scatterModel(Object.assign({ scatModel: 'auto' }, o), particleOf(Object.assign({ trapR: 150, trapLen: 1000, trapShape: 'sphere' }, o)), k, 1.444).model;
  assert.equal(pick({}), 'mie'); assert.equal(pick({ trapShape: 'cylinder', trapR: 100 }), 'dda'); assert.equal(pick({ trapShape: 'capsule', trapR: 100 }), 'dda');
  assert.equal(pick({ trapR: 5 }), 'rayleigh'); assert.equal(pick({ trapShape: 'spheroid', trapR: 2, trapLen: 20 }), 'rayleigh');
  assert.equal(pick({ scatModel: 'dda' }), 'dda'); assert.equal(pick({ trapR: 5, scatModel: 'mie' }), 'mie');
});
test('bench: a collimated beam is one plane wave, and the sphere’s powers are its cross-section times the light there', async () => {
  const S = await scat([laser({ w0: 0.5 }), particle({})]);
  assert.equal(S.model, 'mie'); assert.ok(S.single && S.waves === 1 && S.plane === 1 && !S.pupils);
  const Q = mieQ(mieCoeffs(S.x, S.m[0], 0));
  near(S.x, 2 * Math.PI * 150 / 1550, 1e-12, 'size parameter');
  near(S.Csca, Q.Qsca * Math.PI * 150e-9 ** 2, 1e-12, 'C_sca'); near(S.g, Q.g, 1e-12, 'g');
  // the light: 100 mW in a 0.5 mm waist a little past it, 2P / (pi w^2) on the axis
  near(S.I0, 2 * 0.1 / (Math.PI * 0.5e-3 ** 2), 2e-3, 'irradiance at the particle');
  near(S.Psca, S.Csca * S.I0, 1e-6, 'scattered power'); near(S.Pext, S.Psca, 1e-5, 'extinction, no absorption');
  near(S.fwd + S.back, 1, 1e-12, 'forward and back'); near(S.gLight, Q.g, 1e-6, 'g in this light');
  assert.ok(S.fwd > 0.53 && S.fwd < 0.57, 'a little more forward than back: ' + S.fwd);
  // s light (out of the plane): the same every way in the bench plane to within the forward lean, nothing straight up
  assert.ok(S.cutIn.I[0] > S.cutIn.I[90] && S.cutIn.I[90] > S.cutIn.I[180] && S.cutOut.I[90] < 1e-3 * S.cutOut.I[0]);
  near(S.cutIn.Is[45], S.cutIn.I[45], 1e-9, 'polarised out of the plane');
  // how far Rayleigh is off at this size (the user's 300 nm sphere at 1550 nm): under 1% in the cross-section
  assert.ok(Math.abs(S.rayleigh.Csca / S.Csca - 1) < 0.01 && S.rayleigh.Csca > S.Csca, 'Rayleigh: ' + (S.rayleigh.Csca / S.Csca - 1));
  // collected: the whole sphere of directions is everything; a narrow cone straight ahead, the differential cross-section
  const all = await scat([laser({ w0: 0.5 }), particle({ scatNA: 1, scatDir: 'fwd' })]);
  near(all.collect.frac, all.fwd, 1e-3, 'NA 1 ahead is the forward half');
  const few = await scat([laser({ w0: 0.5 }), particle({ scatNA: 0.05, scatDir: 'back' })]);
  near(few.collect.P, few.cutIn.I[180] * Math.PI * 0.05 ** 2, 2e-3, 'a narrow cone looking back');
  // p light: the dipole's null sideways in the bench plane
  const P = await scat([laser({ w0: 0.5, pol: 'p' }), particle({})]);
  assert.ok(P.cutIn.I[90] < 1e-3 * P.cutIn.I[0] && P.cutOut.I[90] > 0.8 * P.cutOut.I[180]);
});
test('bench: the tight focus’s plane waves add up to its vector field, and a sphere there scatters by Mie', async () => {
  const B = await openBench(bench('tight', [laser({}), objective, particle({})])); B.trace();
  const el = E.ST.project.elements.find(e => e.name === 'S'), job = scatterPrep(el), R = popRun(E.TRACE.lastTrace.beams, job.srcs, { keep: job.keep });
  // (as scatterGen takes a Particle: the strongest beam near it, and a region three of its radii either side)
  const sd = particleDom(el, R), { dom, len } = sd, TB = trapBeams(Object.assign(Object.create(el), { length: 2 * Math.max(0.02, 3 * sd.w) }), R, dom, len, { reach: 3.2, M: 64 });
  assert.ok(TB.parts.length === 1 && TB.parts[0].P && TB.parts[0].P.NA > 0.6, 'a steep focus, by its pupil');
  // at the focus and 0.4 um off it: the waves' sum is vfAt's field there (scaled to V/m and conjugated)
  for (const off of [[0, 0, 0], [3e-4, 2e-4, -4e-4]]) {
    const q = TB.parts[0], b = q.b, Cw = [TB.P0[0] + off[2] * b.dx - off[0] * b.dy, TB.P0[1] + off[2] * b.dy + off[0] * b.dx, off[1]];
    const W = scatterWaves(TB.parts, Cw, 1, 0).launches[0], e = sumE(W);
    const v = vfAt(q.P, off[0], off[1], len + off[2]), s = Math.sqrt(2 * q.Pw * 1e6 / (8.8541878128e-12 * 299792458));
    // beam frame (x across, y up, z along +x of the bench here) to the world: X = z, Y = x, Z = y
    const want = [s * v[4], -s * v[5], s * v[0], -s * v[1], s * v[2], -s * v[3]], nrm = Math.hypot(...want);
    assert.ok(Math.hypot(...want.map((w, i) => w - e[i])) < 2e-3 * nrm, 'the waves’ sum at ' + off + ': ' + e + ' against ' + want);
    // each wave square to its own direction
    for (let o = 0; o < W.n; o += 97) assert.ok(Math.hypot(W.E[6 * o] * W.d[3 * o] + W.E[6 * o + 2] * W.d[3 * o + 1] + W.E[6 * o + 4] * W.d[3 * o + 2]) < 1e-9 * nrm);
  }
  const S = scatterNow(el);
  assert.ok(S.model === 'mie' && S.pupils === 1 && S.waves > 500 && !S.single && !S.flags.length, JSON.stringify([S.model, S.waves, S.flags]));
  // a sphere well inside the focal spot takes nearly its plane-wave cross-section of the light at its centre: within 2%
  near(S.Psca, S.Csca * S.I0, 0.02, 'scattered power in the focus');
  near(S.Pext, S.Psca, 2e-3, 'what it takes from the light is what it scatters');
  assert.ok(S.fwd > 0.52 && S.fwd < S.mieEq.g * 0 + 0.56 && S.gLight < S.g, 'the focus’s spread of directions lowers the lean forward: ' + S.gLight + ' against ' + S.g);
  // Rayleigh for the same sphere: as much back as forward, and within 1% in power
  const Ry = await scat([laser({}), objective, particle({ scatModel: 'rayleigh' })]);
  assert.ok(Ry.model === 'rayleigh' && Math.abs(Ry.fwd - 0.5) < 1e-6 && Math.abs(Ry.Psca / S.Psca - 1) < 0.01 && Ry.flags.includes('rayleighBig'));
  // a truly small sphere: Mie in the focus and the dipole of the local field agree
  const m = await scat([laser({}), objective, particle({ trapR: 10, scatModel: 'mie' })]), r = await scat([laser({}), objective, particle({ trapR: 10 })]);
  assert.equal(r.model, 'rayleigh');
  near(m.Psca, r.Psca, 2e-3, 'a 20 nm sphere in the focus');
  let dmax = 0, imax = 0; for (let i = 0; i < 361; i++) { dmax = Math.max(dmax, Math.abs(m.cutOut.I[i] - r.cutOut.I[i]), Math.abs(m.cutIn.I[i] - r.cutIn.I[i])); imax = Math.max(imax, r.cutIn.I[i]); }
  assert.ok(dmax < 3e-3 * imax, 'its pattern: ' + dmax / imax);
  // moved a wavelength off the axis the sphere is in the dark: far less scattered
  const offAxis = await scat([laser({}), objective, particle({ scatDx: 1.6 })]);
  assert.ok(offAxis.Psca < 0.05 * S.Psca && Math.abs(offAxis.at.x - 1.6e-3) < 1e-12, 'off the axis: ' + offAxis.Psca / S.Psca);
  // the dipole array for the same sphere in the same focus: within 2% of Mie
  const D = await scat([laser({}), objective, particle({ scatModel: 'dda' })]);
  assert.ok(D.model === 'dda' && D.dda.converged && D.dda.runs === 2 && !D.flags.length);
  near(D.Psca, S.Psca, 0.02, 'the dipole array in the focus'); near(D.Csca, S.Csca, 0.02, 'its plane-wave cross-section'); near(D.fwd, S.fwd, 0.01, 'its forward share');
});
test('bench: two beams of one laser add as fields, and a rod runs as a dipole array', async () => {
  // a 20 nm sphere where two counter-propagating beams of one laser meet: its dipole in the standing wave's field, whatever that is there
  const two = [laser({ name: 'A', id: 'A', x: -20, w0: 0.5 }), laser({ name: 'B', id: 'B', x: 22, angle: 180, w0: 0.5, splitFrom: 'A' }), particle({ trapR: 10, length: 0.2 })];
  const S = await scat(two);
  assert.ok(S.beams === 2 && S.launches === 1 && S.model === 'rayleigh', JSON.stringify([S.beams, S.launches, S.model]));
  near(S.Psca, S.Csca * S.I0, 1e-6, 'a small sphere in a standing wave');
  // the rod: 1 um by 200 nm of silica, standing up out of the bench in s light (the field along it), then lying across the beam
  const up = await scat([laser({ w0: 0.5 }), particle({ trapShape: 'cylinder', trapR: 100, trapLen: 1000, trapTilt: 90, scatDip: 8 })]);
  assert.ok(up.model === 'dda' && up.auto && up.dda.converged && up.dda.N > 1500 && up.dda.mkd < 0.2 && !up.flags.length, JSON.stringify(up.dda));
  near(up.Cext, up.Csca, 5e-3, 'a lossless rod'); near(up.Psca, up.Csca * up.I0, 1e-6, 'its power in the beam');
  const flat = await scat([laser({ w0: 0.5 }), particle({ trapShape: 'cylinder', trapR: 100, trapLen: 1000, trapAz: 90, trapTilt: 0, scatDip: 8 })]);
  assert.ok(up.Csca > 2 * flat.Csca, 'the field along the rod is scattered more: ' + up.Csca + ' against ' + flat.Csca);
  // lying across the beam it sends its light into the plane square to its axis: little along the axis
  assert.ok(flat.cutIn.I[90] < 0.3 * flat.cutIn.I[0] && Math.abs(flat.cutIn.I[90] / flat.cutIn.I[270] - 1) < 1e-6);
  near(particleOf({ trapShape: 'cylinder', trapR: 100, trapLen: 1000 }).rEq, Math.cbrt(0.75 * 100 * 100 * 1000), 1e-12, 'the sphere of its volume');
  // Mie asked of a rod is the sphere of its volume, and says so
  const eq = await scat([laser({ w0: 0.5 }), particle({ trapShape: 'cylinder', trapR: 100, trapLen: 1000, scatModel: 'mie' })]);
  assert.ok(eq.flags.includes('mieNotSphere') && Math.abs(eq.x - eq.k * eq.rEq * 1e-9) < 1e-12);
});
