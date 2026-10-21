/* A phosphor screen's glow from rays that sample the beam up and down (rings, a grid): its own shape, not a round spot as
   tall as it is wide. A beam spread into a line by a cylindrical lens glows as a thin line, across (cyl "plane") or up
   (cyl "out"), on the screen as it stands or rolled a quarter turn; a round beam stays round; rays all in one place
   still glow (the blur's floor); a fan in the bench's plane (no heights) is still taken as round. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engine, openBench } from '../../headless.mjs';
import { PHOS_N, phosphorFromRays } from '../../src/engines/phosphor.js';

const L = 20, n = PHOS_N, cell = 2 * L / n;
const bench = (cyl, roll) => ({ format: 'jekray', version: 1, elements: [
  { type: 'source', id: 'S', name: 'Source', x: 0, y: 0, angle: 0, wavelength: 635, width: 3, rays: 11, pattern: 'hex' },
  ...(cyl ? [{ type: 'lens', id: 'C', name: 'Cylinder', x: 20, y: 0, angle: 0, diameter: 10, cyl, surfaces: [{ R: 5 }, { R: null }], gaps: [4], materials: [{ glass: 'N-BK7' }] }] : []),
  { type: 'screen', id: 'P', name: 'Phosphor', x: 150, y: 0, angle: 180, length: 2 * L, phosphor: true, decay: 1, ...(roll ? { roll } : {}) }] });
async function glowOf(cyl, roll) {
  const B = await openBench(bench(cyl, roll));
  B.trace();
  const hits = (await engine()).TRACE.lastTrace.screens.P;
  return { S: phosphorFromRays(hits, L), hits: hits.filter(t => !t.chief) };
}
// the glow's full width at half its peak, across (u) and up (v), from its projections
function widths(S) {
  const pu = new Float64Array(n), pv = new Float64Array(n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { pu[i] += S[j * n + i]; pv[j] += S[j * n + i]; }
  const fw = p => { const h = Math.max(...p) / 2; let a = -1, b = -1; p.forEach((x, i) => { if (x >= h) { if (a < 0) a = i; b = i; } }); return (b - a + 1) * cell; };
  return { u: fw(pu), v: fw(pv) };
}
const range = a => Math.max(...a) - Math.min(...a);

test('a beam spread into a line across by a cylinder glows as a thin line, on the screen as it stands or rolled', async () => {
  for (const roll of [0, 90]) {
    const { S, hits } = await glowOf('plane', roll), w = widths(S);
    assert.ok(range(hits.map(t => t.y)) > 30 && range(hits.map(t => t.z)) < 4, 'spread across, not up');
    assert.ok(w.u > 25 && w.v < 4 && w.v / w.u < 0.15, 'roll ' + roll + ': ' + JSON.stringify(w));
  }
});
test('and a line up (cyl "out") the same way round', async () => {
  for (const roll of [0, 90]) {
    const w = widths((await glowOf('out', roll)).S);
    assert.ok(w.v > 25 && w.u < 4 && w.u / w.v < 0.15, 'roll ' + roll + ': ' + JSON.stringify(w));
  }
});
test('a round beam glows round, as wide up as across, and as small as the beam', async () => {
  const w = widths((await glowOf(null, 0)).S);
  assert.ok(Math.abs(w.u / w.v - 1) < 0.2 && w.u < 4.5, JSON.stringify(w));
  // rings drawn by hand: a disc 4 mm across at (2, -3)
  const ring = [];
  for (let k = 0; k <= 5; k++) for (let m = 0; m < Math.max(1, 6 * k); m++) { const r = 2 * k / 5, a = 2 * Math.PI * m / Math.max(1, 6 * k); ring.push({ y: 2 + r * Math.cos(a), z: -3 + r * Math.sin(a), dz: 0.01 * r * Math.sin(a), w: 1, sid: 'S' }); }
  const d = widths(phosphorFromRays(ring, L));
  assert.ok(Math.abs(d.u / d.v - 1) < 0.2 && d.u > 2.5 && d.u < 5, JSON.stringify(d));
});
test('rays all in one place, or one ray, still glow (the blur has a floor); a level fan in the plane is taken as round', () => {
  for (const hits of [[{ y: 1, z: 2, dz: 0, w: 1, sid: 'S' }],
    Array.from({ length: 9 }, (_, i) => ({ y: 1, z: 2, dz: (i - 4) * 0.01, w: 1, sid: 'S' })),
    Array.from({ length: 9 }, (_, i) => ({ y: 1, w: 1, sid: 'S' }))]) {
    const S = phosphorFromRays(hits, L), w = widths(S);
    assert.equal(Math.max(...S), 1);
    assert.ok(w.u >= cell && w.u < 6 * cell && w.v >= cell && w.v < 6 * cell, JSON.stringify(w));
  }
  // a fan across the face, all at one height and level (or with no heights at all): as tall as it is wide
  for (const z of [0, undefined]) {
    const fan = Array.from({ length: 11 }, (_, i) => ({ y: -2 + 0.4 * i, ...(z === undefined ? {} : { z, dz: 0 }), w: 1, sid: 'S' }));
    const w = widths(phosphorFromRays(fan, L));
    assert.ok(Math.abs(w.u / w.v - 1) < 0.35, JSON.stringify(w));
  }
  // a fan tipped out of the plane: a thin line at a slant, joined up along it
  const tilt = Array.from({ length: 11 }, (_, i) => ({ y: -5 + i, z: -5 + i, dz: 0.01 * i, w: 1, sid: 'S' }));
  const S = phosphorFromRays(tilt, L), at = (u, v) => S[Math.floor((v + L) / cell) * n + Math.floor((u + L) / cell)];
  assert.ok(at(0.5, 0.5) > 0.5 && at(2.5, 2.5) > 0.5 && at(3, -3) < 0.05 && at(-3, 3) < 0.05, 'along it lit, beside it dark');
});
