/* The lens engine against closed forms: a single sphere refracting an axial ray exactly as Snell's
   law and its geometry say; the ellipsoid that images collimated light perfectly into glass (no
   spot, no wavefront error); first-order figures against the bench's own paraxial trace; rays
   aimed through the stop; the symmetry a round system must have; and its speed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const E = await import('../../src/engines/lens-engine.js');
const { paraxial } = await import('../../src/engines/trace.js');
const { refIndex } = await import('../../src/core/glass.js');

const surf = (R, extra = {}) => ({ R, k: 0, a2: 0, A: [], odd: null, semi: 20, ...extra });
// the Cooke triplet (f about 50 mm), its stop between the second and third lenses
const triplet = () => ({
  surfaces: [surf(22.014), surf(-435.76), surf(-22.213), surf(20.292), surf(null, { stop: true, semi: 4.8 }), surf(79.684), surf(-18.395)],
  gaps: [3.259, 6.008, 1.0, 2.5, 2.25, 2.952],
  materials: [{ glass: 'N-SK16' }, { glass: 'AIR' }, { glass: 'F2' }, { glass: 'AIR' }, { glass: 'AIR' }, { glass: 'N-SK16' }],
  stopIndex: 4,
});

test('one sphere: an axial ray meets it and bends exactly as geometry and Snell’s law say', () => {
  const R = 30, n = 1.5, h = 9;
  const P = { surfaces: [surf(R)], gaps: [], materials: [], stopIndex: 0 };
  const S = E.lensSystem(P, 587.56, { imageMaterial: { glass: 'custom', n } });
  const r = new Float64Array([0, h, -10, 0, 0, 1, 0, 0]);
  E.traceRay(S, r, 0, 0);
  const zWant = R - Math.sqrt(R * R - h * h), i = Math.asin(h / R), rr = Math.asin(Math.sin(i) / n), dev = i - rr;
  assert.ok(Math.abs(r[2] - zWant) < 1e-12, 'meets the sphere at z ' + r[2]);
  assert.ok(Math.abs(r[4] + Math.sin(dev)) < 1e-12 && Math.abs(r[5] - Math.cos(dev)) < 1e-12, 'leaves at ' + r[4] + ', ' + r[5]);
});

test('the ellipsoid of eccentricity 1/n images collimated light into glass perfectly: no spot, no wavefront error', () => {
  const n = 1.6, R = 25;
  const P = { surfaces: [surf(R, { k: -1 / (n * n), semi: 12 })], gaps: [], materials: [], stopIndex: 0 };
  const S = E.lensSystem(P, 587.56, { imageMaterial: { glass: 'custom', n } });
  assert.ok(Math.abs(S.par.bfl - n * R / (n - 1)) < 1e-9, 'paraxial focus ' + S.par.bfl);
  const sp = E.spotOf(S, 0, E.pupilGrid(15));
  assert.ok(sp.rms < 1e-9, 'spot ' + sp.rms);
  assert.ok(sp.wfeRms < 1e-7, 'wavefront ' + sp.wfeRms + ' waves');
  // and the same surface as a sphere has the spherical aberration it should: a real spot, a real wavefront error
  const S2 = E.lensSystem({ surfaces: [surf(R, { semi: 12 })], gaps: [], materials: [], stopIndex: 0 }, 587.56, { imageMaterial: { glass: 'custom', n } });
  const sp2 = E.spotOf(S2, 0, E.pupilGrid(15));
  assert.ok(sp2.rms > 1e-3 && sp2.wfeRms > 0.1, 'sphere: ' + sp2.rms + ' mm, ' + sp2.wfeRms + ' waves');
});

test('first order: the triplet’s focal length and back focus as the bench’s own paraxial trace gives them; the pupils', () => {
  const P = triplet(), S = E.lensSystem(P, 587.56);
  const want = paraxial({ surfaces: P.surfaces, gaps: P.gaps, materials: P.materials }, 587.56);
  assert.ok(Math.abs(S.par.efl - want.efl) < 1e-9 && Math.abs(S.par.bfl - want.bfl) < 1e-9, S.par.efl + ' / ' + want.efl);
  assert.ok(Math.abs(S.par.efl - 50) < 0.1);
  // the entrance pupil is the stop seen through the first two lenses: behind the first vertex, a little larger than the stop
  assert.ok(S.par.epz > 0 && S.par.epz < 17 && S.epr > 4.8, 'entrance pupil at ' + S.par.epz + ', radius ' + S.epr);
});

test('rays are aimed: the chief ray crosses the stop at its centre and the marginal rays at its edge, off the axis too', () => {
  const P = triplet(), S = E.lensSystem(P, 587.56, { epd: 10 });
  for (const f of [0, 14, 20]) {
    const th = f * Math.PI / 180;
    for (const [px, py] of [[0, 0], [0, 1], [0, -1], [1, 0], [0.6, -0.5]]) {
      const ab = E.aimRay(S, th, px, py);
      assert.ok(ab, 'aimed at ' + f + '° ' + px + ', ' + py);
      const R = new Float64Array(8);
      // to the stop
      const sn = Math.sin(th);
      E.traceRay(S, launchFor(S, th, ab, R), 0, S.stop, true);
      assert.ok(Math.abs(R[0] - px * S.stopR) < 1e-9 && Math.abs(R[1] - py * S.stopR) < 1e-9, f + '° ' + px + ',' + py + ': at ' + R[0] + ', ' + R[1]);
      void sn;
    }
  }
});
// the same launch as the engine's (kept in step with it): the plane square to the light through the entrance pupil's centre
function launchFor(S, th, [a, b], R) {
  const sn = Math.sin(th), cs = Math.cos(th), back = 1e3 + Math.abs(S.par.epz) + Math.abs(S.z[S.N - 1]);
  R.set([a, b * cs - sn * back, S.par.epz - b * sn - cs * back, 0, sn, cs, -back, 0]);
  return R;
}

test('a round system: the wavefront is the same either side of the bench plane, the chief ray has none, and a ray turned about the axis lands turned', () => {
  const S = E.lensSystem(triplet(), 587.56, { epd: 10 });
  const F = E.traceField(S, 14, [[0, 0], [0.5, 0.3], [-0.5, 0.3], [0.7, -0.6], [-0.7, -0.6]]);
  assert.ok(Math.abs(F.rays[0].opd) < 1e-9, 'chief ' + F.rays[0].opd);
  assert.ok(Math.abs(F.rays[1].opd - F.rays[2].opd) < 1e-9 && Math.abs(F.rays[1].y - F.rays[2].y) < 1e-12 && Math.abs(F.rays[1].x + F.rays[2].x) < 1e-12);
  assert.ok(Math.abs(F.rays[3].opd - F.rays[4].opd) < 1e-9);
  // on the axis, a pupil point turned by 40 degrees lands turned by 40 degrees
  const a = 40 * Math.PI / 180, p = [0.3, 0.8], q = [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
  const G = E.traceField(S, 0, [p, q]), u = G.rays[0], v = G.rays[1];
  assert.ok(Math.abs(u.x * Math.cos(a) - u.y * Math.sin(a) - v.x) < 1e-12 && Math.abs(u.x * Math.sin(a) + u.y * Math.cos(a) - v.y) < 1e-12);
  assert.ok(Math.abs(u.opd - v.opd) < 1e-9);
});

test('rays beyond a surface’s clear radius are vignetted there; the triplet’s spot grows off the axis; it is quick', () => {
  const P = triplet();
  P.surfaces[6].semi = 6;
  const S = E.lensSystem(P, 587.56, { epd: 10 });
  const F = E.traceField(S, 20, [[0, 1], [0, -1]]);
  assert.ok(F.rays.some(r => r.lost === 'clipped' && r.at === 6), JSON.stringify(F.rays));
  const S2 = E.lensSystem(triplet(), 587.56, { epd: 10 }), ring = E.pupilRings(3, 6);
  const on = E.spotOf(S2, 0, ring), off = E.spotOf(S2, 20, ring);
  assert.ok(on.rms > 0 && off.rms > on.rms, on.rms + ' then ' + off.rms);
  // speed: rays traced (each aimed) per second
  const t0 = performance.now(), grid = E.pupilGrid(40);
  let n = 0;
  for (const f of [0, 10, 20]) n += E.traceField(S2, f, grid).rays.length;
  const per = n / ((performance.now() - t0) / 1000);
  assert.ok(per > 2e4, per.toFixed(0) + ' aimed rays a second');
});
