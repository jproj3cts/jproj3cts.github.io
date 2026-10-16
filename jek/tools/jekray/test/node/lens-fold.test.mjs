/* Mirrors and folds in the lens engine: a 45° fold changes nothing but the light's way; a concave
   mirror focuses at half its radius; a paraboloid images a star perfectly, folded or not; a sphere's
   spherical aberration is the closed form's, 2 y⁴ / |R|³, from the Seidel sum and from the real rays. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const E = await import('../../src/engines/lens-engine.js');

const surf = (R, x) => ({ R, k: 0, a2: 0, A: [], odd: null, semi: 30, ...x });
const sys = (P, nm, epd, image) => E.lensSystem(P, nm || 587.56, { epd: epd || 10, image });

test('a flat mirror at 45° folds a singlet’s light and changes nothing else: focal length, spots and wavefronts as unfolded', () => {
  const lens = [surf(null, { stop: true, semi: 5 }), surf(51.5), surf(-51.5)];
  const flat = { surfaces: lens, gaps: [2, 3.6], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }], stopIndex: 0 };
  const fold = { surfaces: [...lens, surf(null, { mirror: true, tilt: [Math.PI / 4, 0], semi: 40 })], gaps: [2, 3.6, 20], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }, { glass: 'AIR' }], stopIndex: 0 };
  const A = sys(flat), Bf = sys(fold);
  assert.ok(Math.abs(A.par.efl - Bf.par.efl) < 1e-12 && Math.abs(A.par.bfl - (Bf.par.bfl + 20)) < 1e-9, A.par.efl + ' ' + Bf.par.efl);
  for (const f of [0, 3]) {
    const a = E.spotOf(A, f, E.pupilRings(3, 8)), b = E.spotOf(Bf, f, E.pupilRings(3, 8));
    assert.ok(Math.abs(a.rms - b.rms) < 1e-12 && Math.abs(a.wfeRms - b.wfeRms) < 1e-9 && Math.abs(Math.abs(a.chief[1]) - Math.abs(b.chief[1])) < 1e-12, f + '°: ' + a.rms + ' / ' + b.rms);
  }
  // the light after the fold runs across the bench: the image plane is 20 mm on and the rest of the back focus across
  assert.ok(Math.abs(Math.abs(Bf.img.d[1]) - 1) < 1e-12 && Math.abs(Bf.img.p[2] - (5.6 + 20)) < 1e-9 && Math.abs(Math.abs(Bf.img.p[1]) - Bf.par.bfl) < 1e-9);
});

test('a concave mirror: its focus at half its radius; a paraboloid images a star perfectly, folded or not', () => {
  const R = -200;
  const sph = { surfaces: [surf(R, { mirror: true, stop: true, semi: 20 })], gaps: [], materials: [], stopIndex: 0 };
  const S = sys(sph, 587.56, 20);
  assert.ok(Math.abs(S.par.efl - 100) < 1e-12 && Math.abs(S.par.bfl - 100) < 1e-12, S.par.efl);
  const par = { surfaces: [surf(R, { mirror: true, stop: true, semi: 20, k: -1 })], gaps: [], materials: [], stopIndex: 0 };
  const sp = E.spotOf(sys(par, 587.56, 20), 0, E.pupilGrid(15));
  assert.ok(sp.rms < 1e-10 && sp.wfeRms < 1e-7, 'paraboloid: ' + sp.rms + ', ' + sp.wfeRms);
  // a Newtonian: the paraboloid, then a flat at 45° 70 mm before its focus
  const newt = { surfaces: [surf(R, { mirror: true, stop: true, semi: 20, k: -1 }), surf(null, { mirror: true, tilt: [Math.PI / 4, 0], semi: 15 })], gaps: [70], materials: [{ glass: 'AIR' }], stopIndex: 0 };
  const N = sys(newt, 587.56, 20), sn = E.spotOf(N, 0, E.pupilGrid(15));
  assert.ok(Math.abs(N.par.bfl - 30) < 1e-9 && sn.rms < 1e-10 && sn.wfeRms < 1e-7, 'Newtonian: ' + N.par.bfl + ', ' + sn.rms);
});

test('a spherical mirror’s spherical aberration: 2 y⁴ / |R|³ from the Seidel sum and from the real rays', () => {
  const R = -200, sph = { surfaces: [surf(R, { mirror: true, stop: true, semi: 20 })], gaps: [], materials: [], stopIndex: 0 };
  const S10 = sys(sph, 587.56, 10), SI = E.seidel(S10, 0).sum.SI, y = 5;
  assert.ok(Math.abs(Math.abs(SI) - 2 * y ** 4 / Math.abs(R) ** 3) < 1e-12 * Math.abs(SI) + 1e-15, 'SI ' + SI + ' against ' + 2 * y ** 4 / Math.abs(R) ** 3);
  // the real rays: the edge ray's wavefront error at small pupils, the sixth order taken out, is SI / 8 (our OPD of the other sign)
  const W = e => { const S = sys(sph, 587.56, e); return E.traceField(S, 0, [[0, 1]]).rays[0].opd * S.lam; };
  const W4 = (64 * W(2) - W(4)) / 3 * 1e4 / 256;
  assert.ok(Math.abs(-W4 - SI / 8) < 1e-4 * Math.abs(SI / 8), 'W040 ' + W4 + ' against SI/8 ' + SI / 8);
  // a paraboloid's is nil
  const par = { surfaces: [surf(R, { mirror: true, stop: true, semi: 20, k: -1 })], gaps: [], materials: [], stopIndex: 0 };
  assert.ok(Math.abs(E.seidel(sys(par, 587.56, 10), 0).sum.SI) < 1e-15);
});
