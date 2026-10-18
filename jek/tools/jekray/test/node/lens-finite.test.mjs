/* An object at a finite distance: the paraxial image distance and magnification of a thick lens against
   its principal planes and Newton's imaging equation; an ellipsoidal mirror imaging one focus on the other
   with no spot and no wavefront error; real rays from a near object point landing, at a small aperture, at
   the paraxial height; the Seidel spherical term from the real rays' wavefront. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const E = await import('../../src/engines/lens-engine.js');

const surf = (R, x) => ({ R, k: 0, a2: 0, A: [], odd: null, semi: 30, ...x });
const D2R = Math.PI / 180;

test('a thick lens with an object 150 mm before it: image distance and magnification from its principal planes', () => {
  const n = 1.6, R1 = 60, R2 = -90, t = 8, d = 150;
  const P = { surfaces: [surf(R1, { stop: true }), surf(R2)], gaps: [t], materials: [{ glass: 'custom', n }], stopIndex: 0 };
  const S = E.lensSystem(P, 587.56, { object: d, epd: 4 });
  const phi = (n - 1) * (1 / R1 - 1 / R2 + (n - 1) * t / (n * R1 * R2)), f = 1 / phi;
  const d1 = -f * (n - 1) * t / (n * R2), d2 = -f * (n - 1) * t / (n * R1);       // the principal planes from each vertex
  const s = d + d1, s1 = 1 / (1 / f - 1 / s);
  assert.ok(Math.abs(S.par.back - (s1 + d2)) < 1e-9, S.par.back + ' against ' + (s1 + d2));
  assert.ok(Math.abs(S.par.mag - (-s1 / s)) < 1e-12, S.par.mag + ' against ' + (-s1 / s));
  // a small pupil and a small object: the real chief ray lands at the paraxial height
  const Sm = E.lensSystem(P, 587.56, { object: d, epd: 0.2 }), h = 0.05, C = E.rayAt(Sm, h * D2R, 0, 0);
  assert.ok(C && C[7] === 0 && Math.abs(C[1] - Sm.par.mag * h) < 2e-7, C[1] + ' against ' + Sm.par.mag * h);
});

test('an ellipsoidal mirror images one focus on the other: no spot, no wavefront error, magnification −d2/d1', () => {
  const d1 = 100, d2 = 300, R = 2 * d1 * d2 / (d1 + d2), e = (d2 - d1) / (d2 + d1);
  const P = { surfaces: [surf(-R, { mirror: true, stop: true, k: -e * e, semi: 40 })], gaps: [], materials: [], stopIndex: 0 };
  const S = E.lensSystem(P, 587.56, { object: d1, epd: 50 });
  assert.ok(Math.abs(S.par.back - d2) < 1e-9 && Math.abs(S.par.mag + d2 / d1) < 1e-12, S.par.back + ' ' + S.par.mag);
  const sp = E.spotOf(S, 0, E.pupilGrid(15));
  assert.ok(sp.rms < 1e-9 && sp.wfeRms < 1e-6, 'spot ' + sp.rms + ', wavefront ' + sp.wfeRms);
  // a sphere about the object point images it back on itself, as perfectly
  const C = { surfaces: [surf(-120, { mirror: true, stop: true, semi: 40 })], gaps: [], materials: [], stopIndex: 0 };
  const Sc = E.lensSystem(C, 587.56, { object: 120, epd: 60 }), sc = E.spotOf(Sc, 0, E.pupilGrid(15));
  assert.ok(Math.abs(Sc.par.back - 120) < 1e-9 && sc.rms < 1e-9 && Math.abs(Sc.par.mag + 1) < 1e-12, sc.rms);
});

test('the Seidel spherical term of a lens imaging a near object, from the real rays’ wavefront at small pupils', () => {
  const P = { surfaces: [surf(40, { stop: true }), surf(-40)], gaps: [5], materials: [{ glass: 'N-BK7' }], stopIndex: 0 };
  const sys = epd => E.lensSystem(P, 587.56, { object: 80, epd });
  const SI = E.seidel(sys(4), 0).sum.SI;
  const W = e => { const S = sys(e); return E.traceField(S, 0, [[0, 1]]).rays[0].opd * S.lam; };
  // the edge ray's wavefront error at pupils 2 and 4 across, W = a e⁴ + b e⁶: the fourth-order part at 4, (64 W(2) − W(4)) / 3, is SI / 8 (our OPD of the other sign)
  const W040 = (64 * W(2) - W(4)) / 3;
  assert.ok(Math.abs(-W040 - SI / 8) < 2e-3 * Math.abs(SI / 8), 'W040 ' + -W040 + ' against SI/8 ' + SI / 8);
});
