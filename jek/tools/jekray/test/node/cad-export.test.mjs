/* CAD export: a design of a stop, a cemented doublet, an asphere, a fold mirror and a lens tilted and decentred after it.
   As STEP: one solid each (the doublet two), every reference to an entity one that exists, the conic-and-asphere face a
   B-spline profile within 10⁻⁶ mm of the sag; as STL: each solid closed (every edge met by two triangles, once each
   way) and of the volume its profile turned about the axis has, to the facets' error. (Read back by OpenCascade, the
   STEP's solids are valid and their volumes those same volumes to 10⁻⁸: see the docs.) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const D = await import('../../src/engines/lens-design.js');
const A = await import('../../src/core/assembly.js');
const CAD = await import('../../src/io/cad-export.js');

const lens = (id, x, y, ang, surfaces, gaps, materials, dia) => ({ type: 'lens', id, name: id, x, y, angle: ang, diameter: dia || 20, surfaces, gaps, materials, group: 'g' });
function design() {
  loadProject({ format: 'jekray', version: 1, elements: [
    { type: 'stop', id: 'S', name: 'Stop', x: -6, y: 0, angle: 0, aperture: 8, outer: 30, group: 'g' },
    lens('D', 0, 0, 0, [{ R: 50 }, { R: -30 }, { R: -120 }], [5, 2], [{ glass: 'N-BK7' }, { glass: 'F2' }], 22),
    lens('Asph', 12, 0, 0, [{ R: 30, k: -1.2, A: [2e-6, -1e-9] }, { R: null }], [4], [{ glass: 'N-BK7' }], 18),
    { type: 'mirror', id: 'M', name: 'Fold', x: 30, y: 0, angle: 135, length: 30, group: 'g' },
    lens('L2', 30, 20, 90, [{ R: 40 }, { R: -40 }], [3], [{ glass: 'N-BK7' }], 16)],
    assemblies: [{ id: 'g', name: 'CAD test', ref: 'S', cond: { aperture: { kind: 'epd', v: 6 }, fields: [{ deg: 0 }, { deg: 2 }], waves: [{ nm: 587.56 }] }, design: { solves: { 't:image': { kind: 'focus' } } } }] });
  const asm = ST.project.assemblies[0], P = D.designPrescription(asm);
  D.setV(P, D.posOf(P, 'T:L2.0'), 2); D.setV(P, D.posOf(P, 'D:L2.0'), 0.3);
  A.asmApply(asm, P); D.commitDesign(asm, D.designPrescription(asm));
  return asm;
}

test('STEP: a solid each, every reference resolved, the asphere’s profile within 10⁻⁶ mm of its sag', () => {
  const asm = design(), out = CAD.cadSTEP(asm, { date: '2026-01-01T00:00:00' });
  const ent = new Map();
  for (const line of out.text.split('\n')) { const m = line.match(/^#(\d+)=(.*);$/); if (m) ent.set(+m[1], m[2]); }
  const refs = [...out.text.matchAll(/#(\d+)/g)].map(m => +m[1]);
  assert.ok(refs.every(r => ent.has(r)), 'a reference to nothing');
  const solids = [...ent.values()].filter(v => v.startsWith('MANIFOLD_SOLID_BREP'));
  assert.deepEqual(solids.map(v => v.match(/'([^']*)'/)[1]), ['Stop', 'D 1', 'D 2', 'Asph', 'Fold', 'L2']);
  assert.ok([...ent.values()].some(v => v.startsWith('SURFACE_OF_REVOLUTION')) && [...ent.values()].filter(v => v.startsWith('SPHERICAL_SURFACE')).length >= 5);
  assert.ok(/^ISO-10303-21;/.test(out.text) && /AUTOMOTIVE_DESIGN/.test(out.text) && /END-ISO-10303-21;\n$/.test(out.text));
  // the asphere's profile: each B-spline span (a cubic Bezier) against the sag between its ends
  const C = CAD.cadSolids(asm), as = C.solids.find(s => s.name === 'Asph'), cap = as.profile[0], F = as.frame;
  const bs = [...ent.values()].find(v => v.startsWith('B_SPLINE_CURVE_WITH_KNOTS'));
  const pts = bs.match(/,3,\((#[\d,#]+)\)/)[1].split(',').map(r => ent.get(+r.slice(1)).match(/,\(([^)]*)\)\)$/)[1].split(',').map(Number));
  let worst = 0;
  for (let j = 0; j + 3 < pts.length; j += 3) for (let q = 1; q < 10; q++) {
    const t = q / 10, b = [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3], p = [0, 1, 2].map(c => b.reduce((a, w, k) => a + w * pts[j + k][c], 0));
    const d = [p[0] - F.o[0], p[1] - F.o[1], p[2] - F.o[2]], r = Math.hypot(d[0] * F.X[0] + d[1] * F.X[1] + d[2] * F.X[2], d[0] * F.Y[0] + d[1] * F.Y[1] + d[2] * F.Y[2]), z = d[0] * F.Z[0] + d[1] * F.Z[1] + d[2] * F.Z[2];
    worst = Math.max(worst, Math.abs(z - cap.sg.f(r)));
  }
  assert.ok(worst < 1e-6, 'profile off its sag by ' + worst);
});

test('STL: each solid closed, and of its profile’s volume', () => {
  const asm = design(), C = CAD.cadSolids(asm);
  for (const sol of C.solids) {
    const T = CAD.cadTriangles(sol, 96, 192), key = p => p.map(v => v.toFixed(7)).join(','), edges = new Map();
    let V = 0;
    for (const t of T) {
      for (let k = 0; k < 3; k++) { const a = key(t[k]), b = key(t[(k + 1) % 3]); edges.set(a + '>' + b, (edges.get(a + '>' + b) || 0) + 1); }
      V += (t[0][0] * (t[1][1] * t[2][2] - t[1][2] * t[2][1]) - t[0][1] * (t[1][0] * t[2][2] - t[1][2] * t[2][0]) + t[0][2] * (t[1][0] * t[2][1] - t[1][1] * t[2][0])) / 6;
    }
    let open = 0;
    for (const [k, n] of edges) { const [a, b] = k.split('>'); if (n !== 1 || edges.get(b + '>' + a) !== 1) open++; }
    assert.equal(open, 0, sol.name + ': ' + open + ' edges not closed');
    // its volume: the profile, finely, turned about the axis (π ∮ r² dz)
    const fine = CAD.cadTriangles(sol, 2000, 4);
    let W = 0;
    if (sol.washer) { const w = sol.washer; W = Math.PI * (w.ro ** 2 - w.ri ** 2) * (w.z1 - w.z0); }
    else {
      const pts = [];
      for (const g of sol.profile) {
        if (g.face === 'cap' && g.out < 0) for (let j = 0; j <= 4000; j++) { const r = g.r1 * j / 4000; pts.push([r, g.sg.f(r) + (g.dz || 0)]); }
        else if (g.face === 'ann') pts.push(g.out < 0 ? [g.r1, g.z] : [g.r0, g.z]);
        else if (g.face === 'cyl') pts.push([g.r, g.z0], [g.r, g.z1]);
        else if (g.face === 'cap') for (let j = 4000; j >= 0; j--) { const r = g.r1 * j / 4000; pts.push([r, g.sg.f(r) + (g.dz || 0)]); }
        else if (g.face === 'flat') pts.push([g.r1, g.z], [0, g.z]);
      }
      for (let j = 0; j < pts.length; j++) { const [r0, z0] = pts[j], [r1, z1] = pts[(j + 1) % pts.length]; W += Math.PI * (r0 * r0 + r0 * r1 + r1 * r1) / 3 * (z1 - z0); }
      W = Math.abs(W);
    }
    // 192 facets round: a polygon's area against the circle's, (192/2π) sin(2π/192)
    const k = 192 / (2 * Math.PI) * Math.sin(2 * Math.PI / 192);
    assert.ok(V > 0 && Math.abs(V / (W * k) - 1) < 2e-4, sol.name + ': ' + V + ' against ' + W * k);
    assert.ok(fine.length > 0);
  }
});
