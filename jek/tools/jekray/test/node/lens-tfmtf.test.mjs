/* Through-focus MTF: a perfect lens peaks at its focus with the round pupil's MTF and falls alike either side; out of
   focus by a wave and a half it is pure defocus's MTF, worked out over the pupil's overlap with its shifted copy; and
   a lens with a little spherical aberration is best focused where its wavefront's defocus term (the Zernike's) is nil. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const D = await import('../../src/engines/lens-design.js');
const N = await import('../../src/engines/lens-analysis.js');

// the perfect lens: a paraboloid mirror, f 100 mm, its focus perfect on the axis
const asmOf = (epd, fields, nm) => ({ cond: { aperture: { kind: 'epd', v: epd }, fields: fields.map(deg => ({ deg, w: 1 })), waves: [{ nm: nm || 587.56, w: 1 }], primary: 0 } });
const surf = (R, x) => ({ R, k: 0, a2: 0, A: [], odd: null, semi: 20, ...x });
const perfect = () => ({ surfaces: [surf(-200, { mirror: true, k: -1, stop: true, semi: 20 })], gaps: [], materials: [], stopIndex: 0, image: 100 });

test('a perfect lens: the round pupil’s MTF at its focus, falling alike either side; out of focus, pure defocus’s', () => {
  const asm = asmOf(10, [0]), P = perfect();
  const A = N.anaSystems(asm, P), cut = 1 / (A.Sp.lam * A.fw), nu = 0.3 * cut;
  const T = N.throughFocus(asm, P, nu, 0.5, 31, 48);
  assert.ok(Math.abs(T.best.at) < 0.01, 'best focus ' + T.best.at);
  assert.ok(Math.abs(T.fields[0].tan[15] - N.mtfPerfect(0.3)) < 0.02, 'at focus ' + T.fields[0].tan[15] + ' against ' + N.mtfPerfect(0.3));
  for (let i = 0; i < 15; i++) assert.ok(Math.abs(T.fields[0].tan[i] - T.fields[0].tan[30 - i]) < 6e-3, 'either side ' + i);
  // out of focus by W020 = 1.5 waves: the MTF of pure defocus, (1/π) ∫ exp(i 8π W020 s x) dA over where the pupil
  // (radius 1) and its copy shifted by 2s overlap, worked out by quadrature
  const A1 = N.anaSystems(asm, P), F = A1.fw, lam = A1.Sp.lam, W = 1.5, dz = W * 8 * lam * F * F;
  const defocusMtf = (sn, W0) => {
    const M = 1600, h = 2 / M; let re = 0, im = 0;
    for (let j = 0; j < M; j++) { const y = -1 + (j + 0.5) * h; for (let i = 0; i < M; i++) { const x = -1 + (i + 0.5) * h; if ((x - sn) ** 2 + y * y > 1 || (x + sn) ** 2 + y * y > 1) continue; const ph = 8 * Math.PI * W0 * sn * x; re += Math.cos(ph); im += Math.sin(ph); } }
    return Math.hypot(re, im) * h * h / Math.PI;
  };
  for (const sn of [0.05, 0.1, 0.2, 0.35]) {
    const T2 = N.throughFocus(asm, P, sn / (lam * F), dz, 3, 64), want = defocusMtf(sn, W);
    assert.ok(Math.abs(T2.fields[0].tan[2] - want) < 0.01 && Math.abs(T2.fields[0].tan[0] - want) < 0.01, `s ${sn}: ${T2.fields[0].tan[0]}, ${T2.fields[0].tan[2]} against ${want}`);
  }
});

test('a little spherical aberration: best focused where the wavefront’s defocus term is nil', () => {
  const P = { surfaces: [surf(null, { stop: true, semi: 3 }), surf(60), surf(-200)], gaps: [2, 4], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }], stopIndex: 0 };
  const asm = asmOf(5, [0]);
  P.image = N.anaSystems(asm, P).Sp.par.back;
  const A = N.anaSystems(asm, P), Wm = N.wavefrontMap(A, 0, 0, 64), z4 = Wm.coef[3], lam = A.Sp.lam, na = A.na;
  // the Zernike defocus Z4 = 2ρ² - 1 against a shift δ of the image: Z4 = -δ NA² / (4 λ) (image in air)
  const want = 4 * lam * z4 / (na * na);
  const T = N.throughFocus(asm, P, 0.2 / (lam * A.fw), 0.4, 41, 48);
  assert.ok(Math.abs(T.best.at - want) < 0.01, `best ${T.best.at} against ${want} (Z4 ${z4})`);
});
