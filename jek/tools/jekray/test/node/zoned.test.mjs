/* A zoned RF lens on the bench (core/rf.js lensZones, core/geometry.js zoneHit): its cut face is the smooth face
   stepped back by the whole layers taken out, each step a sheer wall; a ray meeting a wall is lost, one meeting the
   face between the walls is bent as the smooth lens bends it; the lens as cut passes fewer rays than the smooth one,
   and only those that would have run into a wall are missing. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const TRACE = await import('../../src/engines/trace.js');
const C = await import('../../src/core/rf.js');
const GEO = await import('../../src/core/geometry.js');
const { elementSurfaces } = await import('../../src/core/stl.js');

// the RF designer test's 200 mm hyperbolic PLA lens, collimating a corrugated horn 150 mm away at 24 GHz
const feed = { kind: 'corrugated', a: 15, L: 80, d: 150 }, ghz = 24, lam = C.C_NM_GHZ / ghz * 1e-6;
const B = C.rfBeam(feed, ghz), zf = feed.d + B.dz, Rg = zf * (1 + (B.zR / zf) ** 2), n = C.RF_MAT.PLA.n, R1 = (n - 1) * Rg, k1 = -n * n;
const sg = r => r * r / R1 / (1 + Math.sqrt(1 - (1 + k1) * r * r / R1 / R1)), t = 2 + sg(100);
const make = (zoned, rays) => {
  loadProject({ format: 'jekray', version: 1, elements: [
    { type: 'source', id: 'S', name: 'S', x: -feed.d, y: 0, angle: 0, rays, width: 0, divergence: 60, wavelength: C.C_NM_GHZ / ghz },
    { type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, diameter: 200, asphere: true, surfaces: [{ R: R1, k: k1 }, { R: null }], gaps: [t], materials: [{ glass: 'PLA' }], mmw: { part: true }, zoned },
    { type: 'screen', id: 'T', name: 'T', x: 300, y: 0, angle: 180, length: 300 }] });
  TRACE.setLastTraceKey(null); TRACE.traceScene();
  return { el: ST.project.elements[1], rays: TRACE.lastTrace.rays.map(r => r.pts) };
};
// a traced ray's way after the lens, from the last two points of the polyline that reaches the screen
const exitDir = pts => { const m = pts.length; return Math.atan2(pts[m - 1] - pts[m - 3], pts[m - 2] - pts[m - 4]); };
const reaching = rays => rays.filter(p => p[p.length - 2] > 299);

test('the cut face: the smooth face stepped back by whole layers, its walls sheer, met as walls by rays through them', () => {
  const { el } = make({ ghz }, 11), Z = C.lensZones(el), [s0, s1] = elementSurfaces(el), sm = Object.assign(Object.create(s0), { zone: undefined });
  assert.ok(Z && Z.steps.length === 1 && Z.face === 0 && s0.zone && !s1.zone && !s0.conicOnly, 'one step on the curved front face');
  for (let r = 0; r <= 100; r += 0.5) assert.ok(Math.abs(GEO.sagFn(s0, r) - GEO.sagFn(sm, r) - Z.k(r) * Z.dz) < 1e-12, 'stepped back by k dz at ' + r);
  assert.ok(Math.abs(Z.dz * (n - 1) - lam) < 1e-12, 'a step is a wave of path');
  // the face's depth on the bench spans the cut: from the stepped vertex to the uncut edge
  assert.ok(s0.xmax - s0.xmin > Z.dz, 'the surface box covers the step');
  const rs = Z.steps[0], lo = GEO.sagFn(s0, rs + 1e-7), hi = GEO.sagFn(s0, rs - 1e-7);
  assert.ok(Math.abs(hi - lo - Z.dz) < 1e-6, 'the wall is a step deep');
  // a ray from the feed through the middle of the wall: lost at it; one well inside the step: on the face, off the wall
  const from = (y0, x0) => { const L = Math.hypot(x0 + feed.d, y0); return [-feed.d, 0, (x0 + feed.d) / L, y0 / L]; };
  const [px, py, dx, dy] = from(rs, s0.z + (lo + hi) / 2), W = GEO.zoneHit(s0, px - s0.z, py, 0, dx, dy, 0, 0, 400);
  assert.ok(W && W.wall && Math.abs(Math.abs(py + W.t * dy) - rs) < 1e-6, 'a ray through the wall meets the wall: ' + JSON.stringify(W));
  const [qx, qy, ex, ey] = from(40, 0), H = GEO.zoneHit(s0, qx - s0.z, qy, 0, ex, ey, 0, 0, 400);
  assert.ok(H && !H.wall && Math.abs(qx - s0.z + H.t * ex - GEO.sagFn(s0, qy + H.t * ey)) < 1e-9, 'a ray clear of the wall meets the face');
});

test('traced: the lens as cut loses the rays that run into its wall, and bends the rest as the smooth lens does', () => {
  const smooth = make(undefined, 401), zoned = make({ ghz }, 401), Z = C.lensZones(zoned.el);
  const rs = Z.steps[0], [s0] = elementSurfaces(zoned.el), lo = s0.z + GEO.sagFn(s0, rs + 1e-7), hi = s0.z + GEO.sagFn(s0, rs - 1e-7);   // the wall, in the world
  const n0 = reaching(smooth.rays).length, n1 = reaching(zoned.rays).length;
  assert.ok(n0 > 300 && n1 < n0 - 4, 'the cut lens passes fewer rays: ' + n1 + ' of the smooth lens’s ' + n0);
  // every ray lost ends on the wall: at the step's radius, within the wall's depth
  const lost = zoned.rays.filter(p => p[p.length - 2] < 19 && Math.abs(p[p.length - 1]) < 150 && Math.abs(Math.abs(p[p.length - 1]) - rs) < 1e-6);
  assert.ok(lost.length >= n0 - n1 && lost.every(p => p[p.length - 2] > lo - 1e-6 && p[p.length - 2] < hi + 1e-6), 'the lost rays end on the wall: ' + lost.length);
  // the rays that reach the screen, matched by their place in the fan (the screen's record of each): nearly the smooth lens's way
  // out (each zone is the smooth face moved back a step, so its rays are bent a little differently: a small defocus the smooth lens
  // has not), and a path shorter by the plastic taken out, up to a wave; exactly a wave on the axis, where a whole layer came out
  const hits = rays => new Map(TRACE.lastTrace.screens.T.filter(h => !h.chief).map(h => [h.k, h]));
  make(undefined, 401); const Hs = hits(); make({ ghz }, 401); const Hz = hits();
  let matched = 0;
  for (const [k, h] of Hz) {
    const g = Hs.get(k); if (!g) continue; matched++;
    assert.ok(Math.abs(h.dly - g.dly) < 0.05, 'nearly the same way out for ray ' + k + ': ' + h.dly + ' against ' + g.dly);
    assert.ok(g.opl - h.opl > -0.05 * lam && g.opl - h.opl < (Z.kMax + 0.25) * lam, 'a path shorter by up to ' + Z.kMax + ' waves for ray ' + k + ': ' + ((g.opl - h.opl) / lam).toFixed(3));
  }
  assert.ok(matched > 0.9 * Hz.size && Hz.size < Hs.size, 'matched ' + matched + ' of ' + Hz.size + ' (the smooth lens: ' + Hs.size + ')');
  const axis = [...Hz.values()].reduce((b, h) => (Math.abs(h.y) < Math.abs(b.y) ? h : b)), axis0 = Hs.get(axis.k);
  assert.ok(Math.abs(axis0.opl - axis.opl - Z.kMax * lam) < 1e-6 * lam, 'on the axis a whole wave less: ' + ((axis0.opl - axis.opl) / lam));
});

test('tipped out of the plane, the cut face is still met with its steps: rays run into the wall in 3D too', () => {
  const tipped = (zoned, tip) => {
    loadProject({ format: 'jekray', version: 1, elements: [
      { type: 'source', id: 'S', name: 'S', x: -feed.d, y: 0, angle: 0, rays: 401, width: 0, divergence: 60, wavelength: C.C_NM_GHZ / ghz },
      { type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, tip, diameter: 200, asphere: true, surfaces: [{ R: R1, k: k1 }, { R: null }], gaps: [t], materials: [{ glass: 'PLA' }], mmw: { part: true }, zoned },
      { type: 'screen', id: 'T', name: 'T', x: 300, y: 0, angle: 180, length: 300 }] });
    TRACE.setLastTraceKey(null); TRACE.traceScene();
    return reaching(TRACE.lastTrace.rays.map(r => r.pts)).length;
  };
  const n0 = tipped(undefined, 8), n1 = tipped({ ghz }, 8);
  assert.ok(n0 > 300 && n1 < n0 - 4, 'the tipped cut lens passes fewer rays: ' + n1 + ' of the smooth lens’s ' + n0);
});
