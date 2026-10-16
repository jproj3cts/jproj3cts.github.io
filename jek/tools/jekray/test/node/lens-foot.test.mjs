/* Footprints: where each field's rays cross each surface, against its clear radius. On the axis the beam on each surface is
   the marginal ray's height (the paraxial one's, at a slow aperture); off it the footprint's centre is where the chief ray
   crosses; a lens narrowed so it clips: the rays it stops lie outside its clear radius, the rest within; a decentred surface
   sees the beam moved the other way across it; a 45° fold mirror sees a round beam stretched by √2 along its tilt. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const D = await import('../../src/engines/lens-design.js');
const E = await import('../../src/engines/lens-engine.js');
const AN = await import('../../src/engines/lens-analysis.js');

const design = (dia, epd, fields) => {
  loadProject({ format: 'jekray', version: 1, elements: [
    { type: 'stop', id: 'S', name: 'S', x: 0, y: 0, angle: 0, aperture: 10, outer: 40, group: 'g' },
    { type: 'lens', id: 'L', name: 'L', x: 15, y: 0, angle: 0, diameter: dia, surfaces: [{ R: 60 }, { R: -200 }], gaps: [5], materials: [{ glass: 'N-BK7' }], group: 'g' }],
    assemblies: [{ id: 'g', name: 'T', ref: 'S', cond: { aperture: { kind: 'epd', v: epd }, fields: fields.map(deg => ({ deg })), waves: [{ nm: 587.56 }] }, design: { solves: { 't:image': { kind: 'focus' } } } }] });
  const a = ST.project.assemblies[0], P = D.designPrescription(a); D.commitDesign(a, P);
  return AN.anaSystems(a, D.designPrescription(a));
};
const rad = p => Math.hypot(p[0], p[1]);

test('on the axis each surface’s beam is the marginal ray’s height', () => {
  const A = design(30, 2, [0]), F = AN.footprints(A, 15), S = A.Sp;
  for (let i = 0; i < S.N; i++) {
    const y = Math.abs(E.lensParaStep(S, S.epr, 0, 0, i)[0]);
    assert.ok(Math.abs(F.surfaces[i].beam - y) < 1e-3 * y, `surface ${i}: ${F.surfaces[i].beam} against ${y}`);
    assert.equal(F.surfaces[i].stopped, 0);
  }
});

test('off the axis the footprint is centred where the chief ray crosses', () => {
  const A = design(30, 4, [0, 15]), F = AN.footprints(A, 21), S = A.Sp, th = 15 * Math.PI / 180;
  const path = E.rayPath(S, th, 0, 0).pts;
  for (const i of [1, 2]) {
    const P = F.surfaces[i].fields[1].pts, cy = P.reduce((u, p) => u + p[1], 0) / P.length, cx = P.reduce((u, p) => u + p[0], 0) / P.length;
    const chief = path[i + 1][0];
    assert.ok(Math.abs(cx) < 1e-9, 'x centred');
    assert.ok(Math.abs(cy - chief) < 0.02, `surface ${i}: centre ${cy} against the chief ray’s ${chief}`);
  }
});

test('a lens that clips: the rays it stops lie outside its clear radius, the rest within', () => {
  const A = design(13, 10, [0, 20]), F = AN.footprints(A, 15), u = F.surfaces[1], semi = A.Sp.semi[1];
  assert.ok(Math.abs(semi - 6.5) < 1e-9);
  assert.ok(u.stopped > 0 && u.fields[1].cut.length > 0 && u.fields[0].cut.length === 0);
  assert.ok(u.fields.every(f => f.pts.every(p => rad(p) <= semi * (1 + 1e-9)) && f.cut.every(p => rad(p) > semi)));
  assert.ok(u.beam > semi);
  // rays stopped at the front surface never reach the back
  assert.ok(F.surfaces[2].reach === u.reach - u.stopped);
});

const surf = (R, x) => ({ R, k: 0, a2: 0, A: [], odd: null, semi: 20, ...x });
const sys = (P, fields) => { const S = E.lensSystem(P, 587.56, { epd: 10 }); return { S: [S], Sp: S, c: { fields: fields.map(deg => ({ deg })), primary: 0 } }; };

test('a decentred surface sees the beam moved the other way; a 45° fold mirror sees it stretched by √2 along its tilt', () => {
  const dec = sys({ surfaces: [surf(null, { semi: 5 }), surf(80, { dec: [0.3, 0.2, 0] })], gaps: [10], materials: [{ glass: 'N-BK7' }], stopIndex: 0, image: 50 }, [0]);
  const Pd = AN.footprints(dec, 15).surfaces[1].fields[0].pts, m = i => Pd.reduce((u, p) => u + p[i], 0) / Pd.length;
  assert.ok(Math.abs(m(0) + 0.3) < 1e-6 && Math.abs(m(1) + 0.2) < 1e-6, `centre ${m(0)}, ${m(1)}`);
  const fold = sys({ surfaces: [surf(null, { semi: 5 }), surf(null, { mirror: true, tilt: [Math.PI / 4, 0], semi: 20 })], gaps: [10], materials: [{ glass: 'AIR' }], stopIndex: 0, image: 30 }, [0]);
  const u = AN.footprints(fold, 15).surfaces[1], P = u.fields[0].pts;
  const X = Math.max(...P.map(p => Math.abs(p[0]))), Y = Math.max(...P.map(p => Math.abs(p[1])));
  assert.ok(Math.abs(X - 5) < 1e-9 && Math.abs(Y - 5 * Math.SQRT2) < 1e-9 && Math.abs(u.beam - 5 * Math.SQRT2) < 1e-9, `${X}, ${Y}, ${u.beam}`);
});
