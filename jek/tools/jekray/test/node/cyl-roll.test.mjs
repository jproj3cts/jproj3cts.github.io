/* A cylindrical lens rolled about its axis (engines/trace.js intersectTip, intersect3, tipNormal): the rolled surface is the
   unrolled one turned about the axis, so a collimated fan through it draws the same line on a screen at every roll, turned
   by the roll. Curved in the plane ('plane') its line is across the bench at roll 0; curved out of it ('out'), up and down,
   as 'plane' rolled 90°. A lens of revolution is unchanged by a roll. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const TRACE = await import('../../src/engines/trace.js');
const SS = await import('../../src/engines/screen-stats.js');
const ST = await import('../../src/state/project.js');

// a 3 mm hexapolar fan at 635 nm through an N-BK7 plano-convex cylinder (R 5, 4 thick), onto a screen 130 mm past it
const surf = R => ({ R, k: 0, a2: 0, A: [], semi: null });
function run(lens, src) {
  loadProject({ format: 'jekray', version: 1, elements: [
    { id: 'S', type: 'source', name: 'S', x: 0, y: 0, angle: 0, wavelength: 635, width: 3, rays: 11, pattern: 'hex', divergence: 0, ...src },
    { id: 'L', type: 'lens', name: 'L', x: 20, y: 0, angle: 0, diameter: 10, surfaces: [surf(5), surf(null)], gaps: [4], materials: [{ glass: 'N-BK7' }], ...lens },
    { id: 'C', type: 'screen', name: 'C', x: 150, y: 0, angle: 180, length: 60 }] });
  TRACE.setLastTraceKey(null); TRACE.traceScene();
}
// the line on the screen: its half-length along its own direction, its half-width across, and its direction (degrees,
// 0 to 180, in the screen's own y and z)
function line(lens) {
  run(lens);
  const H = TRACE.lastTrace.screens.C.filter(t => !t.chief);
  let my = 0, mz = 0; for (const h of H) { my += h.y; mz += h.z || 0; } my /= H.length; mz /= H.length;
  let a = 0, b = 0, c = 0; for (const h of H) { const y = h.y - my, z = (h.z || 0) - mz; a += y * y; b += y * z; c += z * z; }
  const th = 0.5 * Math.atan2(2 * b, a - c), ct = Math.cos(th), st = Math.sin(th);
  let lo = Infinity, hi = -Infinity, w = 0;
  for (const h of H) { const y = h.y - my, z = (h.z || 0) - mz, s = y * ct + z * st; lo = Math.min(lo, s); hi = Math.max(hi, s); w = Math.max(w, Math.abs(-y * st + z * ct)); }
  return { n: H.length, half: (hi - lo) / 2, width: w, dir: ((th * 180 / Math.PI) % 180 + 180) % 180 };
}
const dAng = (a, b) => { const d = ((a - b) % 180 + 180) % 180; return Math.min(d, 180 - d); };
const ROLLS = [0, 0.5, 1, 2, 3, 10, 12, 15, 20, 25, 30, 45, 60, 70, 90, 100, 135, 170, 180, -40];

test('a rolled cylinder keeps its power: the same line at every roll, turned by it', () => {
  const ref = line({ cyl: 'plane' });
  // the exact marginal ray of the unrolled lens: 1.5 mm up, 19.56 mm out at the screen (paraxially 18.7, f 9.71 mm)
  assert.ok(Math.abs(ref.half - 19.56) < 0.05, 'roll 0: ' + ref.half);
  assert.ok(Math.abs(ref.dir) < 0.5 || Math.abs(ref.dir - 180) < 0.5, 'roll 0 across: ' + ref.dir);
  for (const cyl of ['plane', 'out']) for (const roll of ROLLS) {
    const L = line({ cyl, ...(roll ? { roll } : {}) });
    assert.equal(L.n, ref.n, `${cyl} roll ${roll}: every ray reaches the screen`);
    // (the hex fan's outer ring is sampled every 12°: its reach along a line turned by the roll varies by under 1%)
    assert.ok(Math.abs(L.half / ref.half - 1) < 0.015, `${cyl} roll ${roll}: half-length ${L.half} against ${ref.half}`);
    assert.ok(L.width < 1.55, `${cyl} roll ${roll}: undeflected across it (${L.width})`);
    // right-handed about the lens's axis (+x): the line turns from the bench's +y up to +z; the screen faces back, its y is -y
    const want = 180 - roll - (cyl === 'out' ? 90 : 0);
    assert.ok(dAng(L.dir, want) < 0.6, `${cyl} roll ${roll}: line at ${L.dir}°, wanted ${want}°`);
  }
});

test("'out' at a roll is 'plane' at that roll and 90° more", () => {
  for (const roll of [0, 15, 45, 100]) {
    const o = line({ cyl: 'out', ...(roll ? { roll } : {}) }), p = line({ cyl: 'plane', roll: (roll + 270) % 360 - 180 });
    assert.ok(Math.abs(o.half - p.half) < 1e-6 && dAng(o.dir, p.dir) < 1e-6, `roll ${roll}: ${JSON.stringify([o, p])}`);
  }
});

test('a rolled cylinder tipped too keeps its power', () => {
  for (const cyl of ['plane', 'out']) for (const [tip, roll] of [[10, 0], [10, 30], [-20, 45]]) {
    const L = line({ cyl, tip, ...(roll ? { roll } : {}) });
    assert.ok(L.half > 19 && L.half < 22 && L.width < 1.7, `${cyl} tip ${tip} roll ${roll}: ${JSON.stringify(L)}`);
  }
});

test('a lens of revolution is unchanged by a roll', () => {
  run({});
  const spot = () => TRACE.lastTrace.screens.C.filter(t => !t.chief).map(h => Math.hypot(h.y, h.z || 0)).sort((a, b) => a - b);
  const ref = spot();
  for (const roll of [7, 30, 77, 180]) {
    run({ roll });
    const r = spot();
    assert.equal(r.length, ref.length);
    r.forEach((v, i) => assert.ok(Math.abs(v - ref[i]) < 1e-6, `roll ${roll}: ray ${i} at ${v} against ${ref[i]}`));
  }
});

test("the beam's pilot through a rolled cylinder: cos² of its power in the plane ('out': sin²)", () => {
  const w = (cyl, roll) => {
    run({ cyl, ...(roll ? { roll } : {}) }, { gauss: true, w0: 1, z0: 0, rays: 1, pattern: 'line', width: 2 });
    return SS.screenStats(ST.project.elements.find(e => e.id === 'C')).beam.w;
  };
  const w0 = w('plane', 0);
  assert.ok(w0 > 12 && w0 < 13, 'unrolled: ' + w0);
  for (const roll of [30, 45, 60]) assert.ok(Math.abs(w('out', roll) - w('plane', roll + 90 - (roll >= 90 ? 180 : 0))) < 1e-6 * w0, 'roll ' + roll);
  assert.ok(Math.abs(w('plane', 90) - 1) < 0.01, 'rolled 90°: no power in the plane');
});
