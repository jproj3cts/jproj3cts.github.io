/* Polarisation through a lens design, against closed forms: a bare face passes 1 - R by Fresnel, s and p alike square
   on; at Brewster's angle p passes whole and s 1 - Rs, the diattenuation between them; a quarter-wave MgF2 layer
   passes 1 - ((ns - nc²)/(ns + nc²))²; every face passes what it does not reflect, s and p, bare or coated, at any
   angle; a glass that absorbs takes exp(-α L); a stack at a slant gives the retardance and diattenuation its own s
   and p amplitudes have; and a round lens, on its axis, unpolarised, passes the same at each pupil point as its turn
   by 90° does. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const E = await import('../../src/engines/lens-engine.js');
const PL = await import('../../src/engines/lens-pol.js');
const C = await import('../../src/core/coatings.js');

const surf = (R, x) => ({ R, k: 0, a2: 0, A: [], odd: null, semi: 20, ...x });
const sys = (P, fields, nm, epd) => { const S = E.lensSystem(P, nm || 587.56, { epd: epd || 2, image: P.image }); return { c: { fields: fields.map(deg => ({ deg })), waves: [{ nm: nm || 587.56, w: 1 }], primary: 0 }, S: [S], Sp: S, P }; };
const glass = n => ({ glass: 'custom', n });

test('a bare face passes 1 - R square on, and at Brewster’s angle p whole and s 1 - Rs', () => {
  const n = 1.5, P = { surfaces: [surf(null, { stop: true, semi: 1 }), surf(null, { semi: 100 })], gaps: [10], materials: [{ glass: 'AIR' }], stopIndex: 0, image: 10, parts: [] };
  // a flat face into glass, after an air gap; the image in the glass
  const S0 = E.lensSystem(P, 587.56, { epd: 0.2, image: 10, imageMaterial: glass(n) });
  const A = { c: { fields: [{ deg: 0 }], waves: [{ nm: 587.56, w: 1 }], primary: 0 }, S: [S0], Sp: S0, P };
  const r0 = PL.polRay(S0, P, null, 0, 0, 0), f0 = PL.jonesFigures(r0.J);
  assert.ok(Math.abs(f0.T - (1 - ((n - 1) / (n + 1)) ** 2)) < 1e-12 && f0.D < 1e-12 && f0.ret < 1e-6, JSON.stringify(f0));
  const thB = Math.atan(n), r = PL.polRay(S0, P, null, thB, 0, 0);
  const Ty = PL.jonesFigures(r.J, PL.POL_IN.y).T, Tx = PL.jonesFigures(r.J, PL.POL_IN.x).T, Rs = ((n * n - 1) / (n * n + 1)) ** 2;
  assert.ok(Math.abs(Ty - 1) < 1e-9, 'p ' + Ty);
  assert.ok(Math.abs(Tx - (1 - Rs)) < 1e-9, 's ' + Tx + ' against ' + (1 - Rs));
  const f = PL.jonesFigures(r.J);
  assert.ok(Math.abs(f.D - Rs / (2 - Rs)) < 1e-9 && f.ret < 1e-6, JSON.stringify(f));
});

test('a quarter-wave MgF2 layer passes as its closed form; every face passes what it does not reflect', () => {
  const ns = 1.5, nc = 1.38, nm = 550, coat = { mode: 'stack', layers: C.coatPreset('mgf2', nm) };
  const a = PL.faceAmps(coat, 1, ns, 1, nm), want = 1 - ((ns - nc * nc) / (ns + nc * nc)) ** 2;
  assert.ok(Math.abs((a.ts[0] ** 2 + a.ts[1] ** 2) - want) < 1e-12 && Math.abs((a.tp[0] ** 2 + a.tp[1] ** 2) - want) < 1e-12, JSON.stringify(a));
  const coats = [null, coat, { mode: 'stack', layers: C.coatPreset('vcoat', nm) }, { mode: 'stack', layers: C.coatPreset('bs5050', nm) }, { mode: 'stack', layers: C.coatPreset('hr', nm) }];
  for (const ct of coats) for (const [n1, n2] of [[1, 1.52], [1.52, 1], [1, 1.8]]) for (const deg of [0, 20, 40]) {
    const c1 = Math.cos(deg * Math.PI / 180);
    if (n1 > n2 && n1 * Math.sin(deg * Math.PI / 180) >= n2) continue;
    const f = PL.faceAmps(ct, n1, n2, c1, nm), Ts = f.ts[0] ** 2 + f.ts[1] ** 2, Tp = f.tp[0] ** 2 + f.tp[1] ** 2;
    assert.ok(Math.abs(Ts + f.Rs - 1) < 1e-9 && Math.abs(Tp + f.Rp - 1) < 1e-9, `${JSON.stringify(ct && ct.layers.length)} ${n1}→${n2} at ${deg}°: s ${Ts + f.Rs}, p ${Tp + f.Rp}`);
  }
});

test('a glass that absorbs takes exp(-α L)', () => {
  const al = 0.05, t = 8, P = { surfaces: [surf(null, { stop: true, semi: 2 }), surf(null, { semi: 2 })], gaps: [t], materials: [{ glass: 'custom', n: 1.5, abs: al }], stopIndex: 0, image: 5 };
  const A = sys(P, [0]), r = PL.polRay(A.Sp, P, null, 0, 0, 0), T = PL.jonesFigures(r.J).T, fres = (1 - 0.04) ** 2;
  assert.ok(Math.abs(T - fres * Math.exp(-al * t)) < 1e-12, T + ' against ' + fres * Math.exp(-al * t));
});

test('a stack at a slant: the retardance and diattenuation its own s and p amplitudes give', () => {
  const nm = 587.56, coat = { mode: 'stack', layers: C.coatPreset('bs5050', 550) }, n = 1.52, th = 35 * Math.PI / 180;
  const P = { surfaces: [surf(null, { stop: true, semi: 1 }), surf(null, { semi: 100 })], gaps: [10], materials: [{ glass: 'AIR' }], stopIndex: 0, image: 10 };
  const S = E.lensSystem(P, nm, { epd: 0.2, image: 10, imageMaterial: glass(n) }), r = PL.polRay(S, P, [null, coat], th, 0, 0), f = PL.jonesFigures(r.J);
  const a = PL.faceAmps(coat, 1, n, Math.cos(th), nm), Ts = a.ts[0] ** 2 + a.ts[1] ** 2, Tp = a.tp[0] ** 2 + a.tp[1] ** 2;
  let dph = Math.abs(Math.atan2(a.tp[1], a.tp[0]) - Math.atan2(a.ts[1], a.ts[0])); if (dph > Math.PI) dph = 2 * Math.PI - dph;
  assert.ok(Math.abs(f.D - Math.abs(Ts - Tp) / (Ts + Tp)) < 1e-9, `D ${f.D} against ${Math.abs(Ts - Tp) / (Ts + Tp)}`);
  assert.ok(dph > 0.05 && Math.abs(f.ret - dph) < 1e-6, `retardance ${f.ret} against ${dph}`);
});

test('a round lens on its axis, unpolarised: the same at each pupil point as at its turn by 90°', () => {
  const P = { surfaces: [surf(null, { stop: true, semi: 6 }), surf(40), surf(-60)], gaps: [2, 5], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }], stopIndex: 0 };
  P.image = E.lensSystem(P, 587.56).par.bfl;
  const A = sys(P, [0], 587.56, 12), coats = [null, { mode: 'stack', layers: C.coatPreset('mgf2', 550) }, null], R = PL.polAnalysis(A, coats, 0, 0, 'none', 21);
  const at = (i, j) => R.grid[j * 21 + i];
  let worst = 0;
  for (let j = 0; j < 21; j++) for (let i = 0; i < 21; i++) { const a = at(i, j), b = at(20 - j, i); if (a && b) worst = Math.max(worst, Math.abs(a.T - b.T), Math.abs(a.D - b.D), Math.abs(a.ret - b.ret)); }
  assert.ok(worst < 1e-9, 'worst ' + worst);
  // the middle passes as the two faces square on do; the edge, slanted more, differently
  const mid = at(10, 10), edge = at(10, 0), Tmid = (1 - C.coatR(coats[1], 1, 1.5168, 587.56)) * (1 - ((1.5168 - 1) / 2.5168) ** 2);
  assert.ok(Math.abs(mid.T - Tmid) < 2e-4 && mid.D < 1e-9 && edge.D > 1e-4, `${mid.T} against ${Tmid}, D ${mid.D}, ${edge.D}`);
});

test('faces that reflect nothing: a meridional ray’s matrix the identity, a skew ray’s a pure rotation (skew aberration)', () => {
  const P = { surfaces: [surf(null, { stop: true, semi: 6 }), surf(40), surf(-60)], gaps: [2, 5], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }], stopIndex: 0 };
  P.image = E.lensSystem(P, 587.56).par.bfl;
  const A = sys(P, [0, 10], 587.56, 12), none = { mode: 'custom', R: 0 };
  for (const [px, py] of [[0, 0], [0, 0.9], [0, -0.9], [0.9, 0], [0.6, 0.6], [-0.5, 0.7]]) {
    const r = PL.polRay(A.Sp, P, [none, none, none], 10 * Math.PI / 180, px, py), [a, b, c, d] = r.J, f = PL.jonesFigures(r.J);
    // real, a rotation: [[cos, -sin], [sin, cos]]
    const rot = Math.max(Math.abs(a[1]), Math.abs(b[1]), Math.abs(c[1]), Math.abs(d[1]), Math.abs(a[0] - d[0]), Math.abs(b[0] + c[0]), Math.abs(a[0] * a[0] + c[0] * c[0] - 1));
    assert.ok(rot < 1e-9 && Math.abs(f.T - 1) < 1e-9 && f.D < 1e-9, `${px}, ${py}: ${JSON.stringify(r.J)}`);
    if (px === 0) assert.ok(Math.abs(c[0]) < 1e-9, `meridional ${py}: turned ${c[0]}`);
    else assert.ok(Math.abs(c[0]) > 1e-4, `skew ${px}, ${py}: turned only ${c[0]}`);
  }
});
