/* What the reels asked for, in the engines: a Fresnel lens collimating as the solid lens it is cut from, a lamp all
   round, a source with an angular size, a mirror that absorbs, a group spun about its pivot, and which way the light
   arrives at a screen. Run as engines.test.mjs runs the engines, with the worker's stand-ins for the page. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const STATE = await import('../../src/state/project.js');
const { loadProject, serialize } = await import('../../src/state/elements.js');
const TRACE = await import('../../src/engines/trace.js');
const { metricRaw } = await import('../../src/ui/optimise.js');
const { fresnelZone } = await import('../../src/core/geometry.js');
const { detectorReading } = await import('../../src/engines/fibre-face.js');

const byName = n => STATE.project.elements.find(e => e.name === n);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' vs ' + b);
function run(elements, fibres) { loadProject({ format: 'jekray', version: 1, elements, fibres: fibres || [] }); TRACE.setLastTraceKey(null); TRACE.traceScene(); return TRACE.lastTrace; }

test('a Fresnel lens: rings of the pitch, each the face’s slope brought back to its base, and it collimates as the solid lens', () => {
  const Z = fresnelZone({ R: -40, fresnel: 4 }, -1 / 40, 35);
  assert.deepEqual(Z.steps, [4, 8, 12, 16, 20, 24, 28, 32]);
  near(Z.off(2), 0, 1e-12, 'the middle ring is the face itself');
  near(Z.off(9), -(-40 + Math.sqrt(1600 - 64)) * -1 * -1, 1e-9, 'the third ring brought back by the sag at 8 mm');
  // a point lamp, the flat face towards it; one screen near and one far, in turn: a collimated beam is as wide at both
  const bench = (fres, T, xs, sx) => run([{ type: 'source', id: 'S', name: 'Lamp', x: xs, y: 0, angle: 0, wavelength: 587.6, width: 0, divergence: 36, rays: 61 },
    { type: 'lens', id: 'L', name: 'Lens', x: 0, y: 0, angle: 0, diameter: 70, surfaces: [{ R: null }, { R: -40, ...(fres ? { fresnel: fres } : {}) }], gaps: [T], materials: [{ glass: 'N-BK7' }] },
    { type: 'screen', id: 'A', name: 'Scr', x: sx, y: 0, angle: 180, length: 800 }]);
  const spread = (fres, T, xs) => { bench(fres, T, xs, 60); const a = metricRaw(byName('Scr'), 'rms'); bench(fres, T, xs, 400); return metricRaw(byName('Scr'), 'rms') - a; };
  const solid = spread(0, 8, -82.5), fresnel = spread(4, 3, -87);
  assert.ok(Math.abs(solid) < 0.05 && Math.abs(fresnel) < 0.05, 'both collimate: ' + solid + ', ' + fresnel);
  // and a Fresnel face loses a little at its risers, as a real one does
  bench(4, 3, -87, 60); const pF = metricRaw(byName('Scr'), 'power'); bench(0, 8, -82.5, 60); const pS = metricRaw(byName('Scr'), 'power');
  assert.ok(pF <= pS + 0.5 && pF > pS - 5, 'riser loss small: ' + pF + ' vs ' + pS);
  // kept in a file
  bench(4, 3, -87, 60);
  assert.equal(serialize().elements.find(e => e.name === 'Lens').surfaces[1].fresnel, 4);
});

test('a lamp shines all round: 360° of rays evenly spaced, none doubled', () => {
  const T = run([{ type: 'source', id: 'S', name: 'Lamp', x: 0, y: 0, angle: 0, wavelength: 550, width: 0, divergence: 360, rays: 12, pol: 's' }]);
  const dirs = T.rays.filter(r => r.src === 'S').map(r => Math.round(Math.atan2(r.pts[3] - r.pts[1], r.pts[2] - r.pts[0]) * 180 / Math.PI));
  const norm = dirs.map(a => ((a % 360) + 360) % 360).sort((a, b) => a - b);
  assert.equal(new Set(norm).size, 12, 'twelve directions');
  const gaps = norm.map((a, i) => ((norm[(i + 1) % 12] - a) + 360) % 360);
  for (const g of gaps) near(g, 30, 1, 'evenly 30° apart');
});

test('a Lamp is its own part: written as type lamp it opens as one, a point all round whatever it was given', () => {
  run([{ type: 'lamp', id: 'S', name: 'Bulb', x: 0, y: 0, wavelength: 580, rays: 36, width: 9, divergence: 10, gauss: true }]);
  const L = byName('Bulb');
  assert.equal(L.lamp, true); assert.equal(L.width, 0); assert.equal(L.divergence, 360); assert.equal(L.gauss, false);
  assert.equal(STATE.typeLabel(L), 'Lamp');
  assert.equal(TRACE.lastTrace.rays.filter(r => r.src === 'S').length, 72, 'unpolarised: two halves of each of 36 rays');
  const f = serialize().elements[0];
  assert.equal(f.lamp, true);
  run([f]); assert.equal(byName('Bulb').lamp, true, 'and opens again as one');
});

test('a source with an angular size: rays across that angle from each point, the power shared', () => {
  run([{ type: 'source', id: 'S', name: 'Sun', x: 0, y: 0, angle: 0, wavelength: 550, width: 10, divergence: 0, rays: 5, angularSize: 0.53, pol: 's' },
    { type: 'screen', id: 'A', name: 'Far', x: 1000, y: 0, angle: 180, length: 100 }]);
  const hits = TRACE.lastTrace.screens.A.filter(t => !t.chief);
  assert.equal(hits.length, 25, 'five points, five directions each');
  const W = hits.reduce((a, t) => a + t.w, 0);
  near(W, 5, 1e-6, 'the same power as five rays');
  // at 1 m, the image of each point is 1000 tan(0.53°) = 9.25 mm wide
  near(metricRaw(byName('Far'), 'full'), 10 + 1000 * Math.tan(0.53 * Math.PI / 180), 1e-3);
});

test('a mirror that absorbs: what it neither reflects nor passes is lost', () => {
  const at = (m) => { run([{ type: 'source', id: 'S', name: 'L', x: -50, y: 0, angle: 0, wavelength: 633, width: 1, rays: 1, power: 1 },
    Object.assign({ type: 'mirror', id: 'M', name: 'M', x: 0, y: 0, angle: 135, length: 10 }, m),
    { type: 'screen', id: 'T', name: 'Through', x: 40, y: 0, angle: 180, length: 20 }, { type: 'screen', id: 'R', name: 'Up', x: 0, y: 40, angle: 270, length: 20 }]);
    return [metricRaw(byName('Up'), 'power') || 0, metricRaw(byName('Through'), 'power') || 0]; };
  const [r1, t1] = at({ reflect: 90 }); near(r1, 90, 1e-6); near(t1, 10, 1e-6, 'left out: the rest passes');
  const [r2, t2] = at({ reflect: 10, transmit: 0 }); near(r2, 10, 1e-6); near(t2, 0, 1e-6, 'a black wall');
  const [, t3] = at({ reflect: 50, transmit: 20 }); near(t3, 20, 1e-6, '30% absorbed');
  // transmit cannot be more than what is not reflected
  run([{ type: 'mirror', id: 'M', name: 'M', x: 0, y: 0, angle: 0, length: 10, reflect: 80, transmit: 50 }]);
  assert.equal(byName('M').transmit, 20);
});

test('a group turns about its pivot by its spin, angles and all, and a file keeps where it is', () => {
  run([{ type: 'source', id: 'P', name: 'Lamp', x: 10, y: 0, angle: 0, wavelength: 550, rays: 1, group: 'g', pivot: true, spin: 0 },
    { type: 'mirror', id: 'A', name: 'A', x: 30, y: 0, angle: 180, length: 10, group: 'g' }]);
  byName('Lamp').spin = 90; TRACE.traceScene();
  near(byName('A').x, 10, 1e-9); near(byName('A').y, 20, 1e-9); near(byName('A').angle, -90, 1e-9);
  near(byName('Lamp').x, 10, 1e-9, 'the pivot stays'); assert.equal(byName('Lamp').angle, 0);
  // saved and opened again: where it is, not turned a second time
  const f = JSON.parse(JSON.stringify(serialize()));
  loadProject(f); TRACE.setLastTraceKey(null); TRACE.traceScene();
  near(byName('A').x, 10, 1e-9); near(byName('A').y, 20, 1e-9);
  byName('Lamp').spin = 0; TRACE.traceScene();
  near(byName('A').x, 30, 1e-9, 'turned back'); near(byName('A').y, 0, 1e-9);
});

test('which way the light arrives at a screen: its direction on the bench, and off the normal', () => {
  const at = a => { run([{ type: 'source', id: 'S', name: 'L', x: 0, y: 0, angle: a, wavelength: 633, width: 1, rays: 3 },
    { type: 'screen', id: 'A', name: 'Scr', x: 100, y: 0, angle: 180, length: 200 }]); return [metricRaw(byName('Scr'), 'dir'), metricRaw(byName('Scr'), 'tilt')]; };
  const [d0, t0] = at(0); near(d0, 0, 1e-9); near(t0, 0, 1e-9);
  const [d1, t1] = at(10); near(d1, 10, 1e-6, 'up 10°'); near(Math.abs(t1), 10, 1e-6, '10° off the normal');
  const [d2] = at(-20); near(d2, -20, 1e-6);
});

test('a source’s power is its power whatever its pattern: a detector reads 1 mW of a 1 mW hexapolar, grid or cross fan', () => {
  for (const pattern of ['line', 'hex', 'grid', 'cross']) {
    run([{ type: 'source', id: 'S', name: 'L', x: 0, y: 0, angle: 0, wavelength: 633, width: 0, divergence: 38, rays: 11, power: 1, ...(pattern === 'line' ? {} : { pattern }) },
      { type: 'detector', id: 'D', name: 'D', x: 100, y: 0, angle: 180, length: 600 }]);
    near(detectorReading(byName('D')).mw, 1, 1e-9, pattern);
  }
});

test('a Lamp with a size sends its light from its surface, its body takes light back, and its size spreads a beam', () => {
  // a sphere 10 mm across: every ray starts 5 mm from its centre, going outward
  const T = run([{ type: 'lamp', id: 'S', name: 'Bulb', x: 0, y: 0, wavelength: 580, rays: 24, lampD: 10, pol: 's' }]);
  const R = T.rays.filter(r => r.src === 'S');
  assert.equal(R.length, 24, 'its rays in all');
  // each from across its face as seen its way: not all along the radius (a point's would be)
  assert.ok(R.some(r => Math.abs((r.pts[0] * (r.pts[3] - r.pts[1]) - r.pts[1] * (r.pts[2] - r.pts[0])) / Math.hypot(r.pts[2] - r.pts[0], r.pts[3] - r.pts[1])) > 1), 'rays start across the face');
  for (const r of R) { near(Math.hypot(r.pts[0], r.pts[1]), 5, 1e-5); assert.ok(r.pts[0] * (r.pts[2] - r.pts[0]) + r.pts[1] * (r.pts[3] - r.pts[1]) > 0, 'outward'); }
  // a tube lying along x, 30 by 4: its rays start on the rectangle
  const T2 = run([{ type: 'lamp', id: 'S', name: 'Tube', x: 0, y: 0, angle: 0, wavelength: 580, rays: 40, lampD: 4, lampL: 30, lampShape: 'tube', pol: 's' }]);
  for (const r of T2.rays.filter(q => q.src === 'S')) { const x = Math.abs(r.pts[0]), y = Math.abs(r.pts[1]); assert.ok(Math.abs(x - 15) < 1e-5 || Math.abs(y - 2) < 1e-5, 'on its outline'); assert.ok(x <= 15 + 1e-5 && y <= 2 + 1e-5); }
  // a mirror behind it sends the light back into it, and the screen beyond sees none; a point lamp lets it through
  const behind = D => { run([{ type: 'lamp', id: 'S', name: 'L', x: 0, y: 0, angle: 180, wavelength: 580, rays: 1, lampD: D, pol: 's' },
    { type: 'mirror', id: 'M', name: 'M', x: -20, y: 0, angle: 0, length: 10 }, { type: 'screen', id: 'B', name: 'Behind', x: 30, y: 0, angle: 180, length: 10 }]);
    return (TRACE.lastTrace.screens.B || []).filter(t => !t.chief).length; };
  assert.equal(behind(4), 0); assert.equal(behind(0), 1);
  // a Fresnel panel's beam from a bigger lamp spreads more
  const spread = D => { run([{ type: 'lamp', id: 'S', name: 'Lamp', x: 0, y: 0, wavelength: 580, rays: 240, lampD: D, pol: 's' },
    { type: 'lens', id: 'L', name: 'Panel', x: 87, y: 0, angle: 0, diameter: 70, surfaces: [{ R: null }, { R: -40, fresnel: 4 }], gaps: [3], materials: [{ glass: 'N-BK7' }] },
    { type: 'screen', id: 'A', name: 'Far', x: 1000, y: 0, angle: 180, length: 300 }]); return metricRaw(byName('Far'), 'rms'); };
  assert.ok(spread(10) > spread(0) + 5, 'a 10 mm lamp’s beam wider than a point’s');
  // a lamp saved before it had a size is still a point; a new one from the picker is 1 mm
  run([{ type: 'source', id: 'S', name: 'Old', lamp: true, x: 0, y: 0, wavelength: 580, rays: 12, divergence: 360, width: 0 }]);
  assert.equal(byName('Old').lampD, 0);
});

test('a Lamp’s light up and down: rings above and below the plane, the same power; a flat Lamp as before', async () => {
  const flat = run([{ type: 'lamp', id: 'S', name: 'L', x: 0, y: 0, wavelength: 580, rays: 12, pol: 's' }]).rays.map(r => r.pts.slice(0, 4).map(v => +v.toFixed(9)));
  const flat0 = run([{ type: 'lamp', id: 'S', name: 'L', x: 0, y: 0, wavelength: 580, rays: 12, pol: 's', elev: 0 }]).rays.map(r => r.pts.slice(0, 4).map(v => +v.toFixed(9)));
  assert.deepEqual(flat0, flat, 'elev 0 is the flat fan');
  const T = run([{ type: 'lamp', id: 'S', name: 'L', x: 0, y: 0, wavelength: 580, rays: 240, pol: 's', elev: 20, rings: 3 }]);
  const hits = T.rays.filter(r => r.src === 'S');
  assert.equal(hits.length, 240, 'its rays in all, spread over the rings');
  // seven rings, each with rays by its share of the sphere, every other one turned half a step
  const { lampRaysOf } = await import('../../src/state/elements.js');
  const L = lampRaysOf(byName('L')), byEl = new Map();
  for (const [, , az, e] of L) { const k = e.toFixed(6); if (!byEl.has(k)) byEl.set(k, []); byEl.get(k).push(az); }
  assert.equal(byEl.size, 7);
  const ring = e => byEl.get((e * Math.PI / 180).toFixed(6));
  assert.ok(ring(0).length > ring(20).length, 'the plane’s ring has more rays than the top one');
  const step = 2 * Math.PI / ring(20 / 3).length;
  near(((ring(20 / 3)[0] % step) + step) % step, step / 2, 1e-9, 'the first ring up turned half a step');
  near(ring(0)[0], 0, 1e-12, 'the plane’s not');
  const read = elev => { run([{ type: 'lamp', id: 'S', name: 'L', x: 0, y: 0, wavelength: 580, rays: 240, pol: 's', power: 1, elev, rings: 3 },
    { type: 'detector', id: 'D', name: 'D', x: 100, y: 0, angle: 180, length: 2000 }]); return detectorReading(byName('D')).mw; };
  near(read(20), read(0), 0.02 * read(0), 'the power the same, but for how the rings round their rays');
});
