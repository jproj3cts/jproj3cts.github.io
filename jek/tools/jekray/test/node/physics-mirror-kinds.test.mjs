/* The mirrors the parts list offers beside the plain one. Each is the general mirror (or, for the dichroic and the
   retroreflector, the filter and the prism) begun with its kind's settings, so what is checked here is that a new one
   does what its name says: a concave one focuses at R/2, a parabola without spherical aberration, an off-axis parabola
   at a right angle and 2f away, a partial reflector halves the light, a dichroic sends one colour each way, a
   retroreflector sends a beam back parallel to itself, and a steering mirror turns by its volts. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject, makeElement } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const TRACE = await import('../../src/engines/trace.js');
const E = await import('../../src/engines/elec.js');
const { portsOf } = await import('../../src/engines/fibre.js');
const { detectorReading } = await import('../../src/engines/fibre-face.js');

const load = (elements, fibres) => { loadProject({ format: 'jekray', version: 1, name: 'mirrors', elements, fibres: fibres || [], minPower: 1e-6 }); TRACE.setLastTraceKey(null); TRACE.traceScene(); return TRACE.lastTrace; };
const byId = id => ST.project.elements.find(e => e.id === id);
const src = (o = {}) => Object.assign({ type: 'source', id: 'S', name: 'S', x: 0, y: 0, angle: 0, wavelength: 633, width: 8, divergence: 0, rays: 5, gauss: false, pol: 's' }, o);
const kind = (k, o = {}) => Object.assign(makeElement(k, 100, 0), { id: 'M' }, o);
// the last leg of each ray that carries light: where it starts and its direction
const legs = (T, min = 0.01) => T.rays.filter(r => r.w > min && r.pts.length >= 4).map(r => { const p = r.pts, n = p.length; const d = Math.hypot(p[n - 2] - p[n - 4], p[n - 1] - p[n - 3]); return { x: p[n - 4], y: p[n - 3], dx: (p[n - 2] - p[n - 4]) / d, dy: (p[n - 1] - p[n - 3]) / d, w: r.w, n }; });
// where a leg crosses the line x = X (or y = Y)
const atX = (L, X) => L.y + L.dy / L.dx * (X - L.x), atY = (L, Y) => L.x + L.dx / L.dy * (Y - L.y);

test('each kind is a mirror (or a filter, a prism) of its own settings, named for what it is', () => {
  const made = Object.fromEntries(['mirror', 'spherical', 'parabolic', 'oap', 'chirped', 'steering', 'dichroic', 'retro'].map(k => [k, makeElement(k, 0, 0)]));
  for (const k of ['mirror', 'spherical', 'parabolic', 'oap', 'chirped', 'steering', 'retro']) assert.equal(made[k].type, 'mirror', k);
  assert.equal(made.mirror.R, null); assert.equal(made.mirror.reflect, 100); assert.equal(made.mirror.steer, undefined);
  assert.ok(made.spherical.R > 0 && made.spherical.k === 0);
  for (const gone of ['concave', 'convex', 'partial']) assert.equal(makeElement(gone, 0, 0), undefined, gone + ' is no entry of its own');
  assert.ok(made.parabolic.k === -1 && made.parabolic.offset === 0);
  assert.ok(made.oap.k === -1 && made.oap.offset === made.oap.R, 'the 90° one: cut 2f off the axis, R = 2f');
  assert.ok(made.chirped.gdd < 0);
  assert.ok(made.steering.steer === true && made.steering.steerK === 1);
  assert.ok(made.dichroic.type === 'filter' && made.dichroic.reflect === true);
  assert.ok(made.retro.retro === true && made.retro.R === null && ST.typeLabel(made.retro) === 'Retroreflector');
  assert.equal(made.mirror.retro, undefined);
  assert.deepEqual(Object.values(made).map(e => e.name), ['Mirror 1', 'Spherical mirror 1', 'Parabolic mirror 1', 'Off-axis parabola 1', 'Chirped mirror 1', 'Steering mirror 1', 'Dichroic mirror 1', 'Retroreflector 1']);
});

test('a spherical mirror focuses at R/2, and with a negative radius spreads from R/2 behind it; a parabola focuses every ray at one point', () => {
  // rays 2 mm and 4 mm off the axis, back from the mirror at x = 100: they cross the axis R/2 = 100 mm before it
  const cross = k => legs(load([src(), kind(k)])).filter(L => Math.abs(L.y) > 0.5 && L.dx < 0).map(L => +(L.x - L.y * L.dx / L.dy).toFixed(4));
  const cross2 = el => legs(load([src(), el])).filter(L => Math.abs(L.y) > 0.5 && L.dx < 0).map(L => +(L.x - L.y * L.dx / L.dy).toFixed(4));
  const cc = cross('spherical'), cv = cross2(kind('spherical', { R: -200 })), pb = cross('parabolic');
  for (const x of cc) assert.ok(Math.abs(x - 0) < 0.05, 'concave, R 200: focus 100 mm before it, ' + x);
  for (const x of cv) assert.ok(Math.abs(x - 200) < 0.05, 'convex, R −200: from 100 mm behind it, ' + x);
  // the sphere's marginal rays cross short of the paraxial focus (spherical aberration); the parabola's all at f
  assert.ok(Math.max(...cc) - Math.min(...cc) > 1e-3, 'a sphere has spherical aberration: ' + cc);
  for (const x of pb) assert.ok(Math.abs(x) < 1e-6, 'a parabola has none: ' + x);
});

test('an off-axis parabola turns a beam along its axis through a right angle to a focus 2f away', () => {
  const L = legs(load([src(), kind('oap')])).filter(l => l.n >= 6 || Math.abs(l.dy) > 0.5);
  assert.equal(L.length, 5);
  const mid = L.find(l => Math.abs(l.dx) < 1e-9);
  assert.ok(mid && Math.abs(mid.x - 100) < 1e-6 && mid.dy > 0, 'the middle ray leaves square to the way it came');
  // every ray through (100, 50.8): the reflected focal length, R = 50.8 mm
  for (const l of L) assert.ok(Math.abs(atY(l, 50.8) - 100) < 1e-6, 'at the focus: ' + atY(l, 50.8));
});

test('a mirror reflecting 50 % halves the light; a dichroic mirror reflects the short wavelength and passes the long', () => {
  const P = legs(load([src({ rays: 1, width: 0 }), kind('mirror', { reflect: 50 })]));
  const on = P.find(l => l.dx > 0.99 && l.x > 99), up = P.find(l => Math.abs(l.dy) > 0.99);
  assert.ok(on && up && Math.abs(on.w - 0.5) < 1e-9 && Math.abs(up.w - 0.5) < 1e-9, 'half each way');
  const way = nm => { const D = legs(load([src({ rays: 1, width: 0, wavelength: nm }), kind('dichroic')]), 0.5).filter(l => l.x > 99); assert.equal(D.length, 1, nm + ' nm goes one way'); return D[0]; };
  assert.ok(Math.abs(way(532).dy) > 0.99, '532 nm, below the 600 nm edge, is reflected through a right angle');
  assert.ok(way(1064).dx > 0.99, '1064 nm goes on through');
});

test('a retroreflector is three mirrors square to one another: light comes back the way it came, from the point opposite across its middle, in and out of the plane', () => {
  // the last leg of the ray in 3D: where it starts, its direction, and what it carries
  const back = (o, cube = {}) => {
    load([src(Object.assign({ rays: 1, width: 0 }, o)), kind('retro', cube)]);
    const r = TRACE.lastTrace.rays.filter(q => q.w > 0.01).pop(), p = r.pts, n = p.length, z = r.zs || [];
    const v = [p[n - 2] - p[n - 4], p[n - 1] - p[n - 3], z.length ? z[(n >> 1) - 1] - z[(n >> 1) - 2] : 0], l = Math.hypot(...v);
    return { at: [p[n - 4], p[n - 3], z.length ? z[(n >> 1) - 2] : null], d: v.map(c => c / l), w: r.w };
  };
  // in the plane, at any angle: antiparallel, with nothing lost (a plain mirror would send a beam in at 15° off at 30°)
  // (each aimed to meet the face y mm from its middle)
  for (const [y, a] of [[3, 0], [-5, 0], [2, 4], [0, -6], [0, 15], [1, -12]]) {
    const r = a * Math.PI / 180, B = back({ y: y - 100 * Math.tan(r), angle: a });
    assert.ok(Math.abs(B.d[0] + Math.cos(r)) < 1e-9 && Math.abs(B.d[1] + Math.sin(r)) < 1e-9 && Math.abs(B.d[2]) < 1e-9, 'antiparallel: ' + [y, a, B.d]);
    assert.ok(Math.abs(B.w - 1) < 1e-9, 'all of it: ' + B.w);
  }
  // straight in, 3 mm to one side of the middle: back out 3 mm the other side
  load([src({ rays: 1, width: 0, y: 3 }), kind('retro'), { type: 'screen', id: 'C', name: 'C', x: 20, y: 0, angle: 0, length: 40 }]);
  const hit = TRACE.lastTrace.screens.C.filter(h => h.w > 0.5);
  assert.ok(hit.length === 1 && Math.abs(hit[0].y + 3) < 1e-9, 'mirrored about the middle: ' + hit.map(h => h.y));
  // out of the plane too, which a roof cannot do: a beam climbing 3° comes back down the same line
  const up = back({ tip: 3, z: 75 }), t = 3 * Math.PI / 180;
  assert.ok(Math.abs(up.d[0] + Math.cos(t)) < 1e-9 && Math.abs(up.d[1]) < 1e-9 && Math.abs(up.d[2] + Math.sin(t)) < 1e-9, 'antiparallel in 3D: ' + up.d);
  // and tipped or turned itself, it still does: 10° turned and 5° tipped changes nothing of the way back
  const tilted = back({ y: 2 }, { angle: 190, tip: 5 });
  assert.ok(Math.abs(tilted.d[0] + 1) < 1e-9 && Math.abs(tilted.d[1]) < 1e-9 && Math.abs(tilted.d[2]) < 1e-9, 'whatever way it faces: ' + tilted.d);
  // its path is a mirror's at its corner: the light back at a screen has gone as far as off a plane mirror set
  // length/√2 behind the face, wherever across the face it went in
  const opl = (el, y) => { load([src({ rays: 1, width: 0, y }), el, { type: 'screen', id: 'C', name: 'C', x: 20, y: 0, angle: 0, length: 40 }]); return TRACE.lastTrace.screens.C.filter(h => h.w > 0.5)[0].opl; };
  const D = 25.4 / Math.SQRT2, flat = opl({ type: 'mirror', id: 'M', name: 'M', x: 100 + D, y: 0, angle: 180, length: 25.4 }, 0);
  for (const y of [0, 3, -7]) assert.ok(Math.abs(opl(kind('retro'), y) - flat) < 1e-9, 'path at ' + y + ': ' + opl(kind('retro'), y) + ' vs ' + flat);
  // three reflections, off three faces: the ray drawn goes face to face inside it
  load([src({ rays: 1, width: 0, y: 3 }), kind('retro')]);
  assert.equal(TRACE.lastTrace.rays.filter(q => q.w > 0.5).reduce((n, q) => n + q.pts.length / 2 - 1, 0), 4, 'in, two legs between the faces, and out');
  // light on its back does not come back
  load([src({ rays: 1, width: 0 }), kind('retro', { angle: 0 })]);
  assert.ok(!TRACE.lastTrace.rays.some(q => q.w > 0.01 && q.pts[q.pts.length - 2] < -1), 'nothing comes back off its back');
  // each face reflecting 90 %, three of them: 72.9 % comes back, and nothing passes through a face
  assert.ok(Math.abs(back({ y: 3 }, { reflect: 90 }).w - 0.729) < 1e-9);
  // off ideal mirrors a linear polarisation comes back as it went in, s as s and p as p, wherever on the face
  const J = pol => { load([src({ rays: 1, width: 0, y: 4, pol }), kind('retro')]); return TRACE.lastTrace.rays.filter(q => q.w > 0.5).pop().J; };
  const Js = J('s'), Jp = J('p');
  assert.ok(Math.abs(Js[0] ** 2 + Js[1] ** 2 - 1) < 1e-9 && Math.abs(Jp[2] ** 2 + Jp[3] ** 2 - 1) < 1e-9, 's stays s, p stays p: ' + [Js, Jp]);
  // the middle ray goes into the corner itself, where the three faces meet, and still comes back
  const mid = back({});
  assert.ok(Math.abs(mid.d[0] + 1) < 1e-9 && Math.abs(mid.w - 1) < 1e-9, 'into the corner: ' + [mid.d, mid.w]);
});

test('a steering mirror turns and tips by its volts: the bench shows it where a DC drive puts it, and the file keeps it at rest', () => {
  const els = (v, extra = {}) => [src({ width: 1, rays: 11, power: 1 }), kind('steering', Object.assign({ steerK: 1 }, extra)),
    { type: 'detector', id: 'D', name: 'D', x: 100, y: 200, angle: 270, length: 2 }, { type: 'elec', kind: 'dc', id: 'V', name: 'V', x: -60, y: 40, v }];
  load(els(0));
  const M = byId('M'), X = E.elecExtra(M), k = portsOf(M).length - X.length;
  assert.deepEqual(X.map(p => [p.elec, p.name]), [['in', 'turn'], ['in', 'tip']]);
  assert.deepEqual(E.elecExtra(kind('mirror')), [], 'a plain mirror has no input');
  // the reflected ray's direction on the bench as traced, and what the photodiode reads there and through the electronics
  const shown = (v, port = 0) => {
    const T = load(els(v), [{ a: ['V', 0], b: ['M', k + port], wire: true }]), L = legs(T, 0.001).filter(l => l.x > 99 && Math.abs(l.dy) > 0.5);
    const mid = L[L.length >> 1], up = Math.max(0, ...TRACE.lastTrace.rays.filter(q => q.zs).map(q => Math.abs(q.zs[q.zs.length - 1] - q.zs[0])));
    return { deg: Math.atan2(mid.dx, mid.dy) * 180 / Math.PI, mw: detectorReading(byId('D')).mw, dc: E.ELEC.detSignalFull(byId('D')).dc, pose: E.ELEC.steerPose(byId('M')), rest: [byId('M').angle, byId('M').tip], up };
  };
  const a0 = shown(0), a1 = shown(0.1), a2 = shown(0.2), a5 = shown(0.5);
  // the mirror turns 1° a volt and the beam twice that: 0.1 V is 0.2°, which is 0.7 mm on a diode 200 mm on; 0.5 V is off it
  assert.ok(Math.abs(a0.deg) < 1e-9 && Math.abs(Math.abs(a1.deg) - 0.2) < 1e-6 && Math.abs(Math.abs(a5.deg) - 1) < 1e-6, 'the beam turns by twice the mirror: ' + [a0.deg, a1.deg, a5.deg]);
  assert.ok(a0.mw > 0 && a1.mw < a0.mw && a2.mw < a1.mw && a5.mw === 0, 'the diode on the bench reads less: ' + [a0.mw, a1.mw, a2.mw, a5.mw]);
  for (const a of [a0, a1, a2, a5]) assert.deepEqual(a.rest, [135, undefined], 'the part itself is left at rest');
  assert.deepEqual(a1.pose.map(v => +v.toFixed(9)), [0.1, 0]);
  // the electronics read the same light (worked out from the mirror at rest, with the drive on it)
  for (const a of [a0, a1, a2]) assert.ok(Math.abs(a.dc / a0.dc - a.mw / a0.mw) < 1e-9, 'the diode’s signal goes with its reading: ' + [a.dc, a.mw]);
  assert.equal(a5.dc, 0);
  assert.ok(Math.abs(shown(-0.1).mw - a1.mw) < 1e-9 * a0.mw, 'the other way round the same');
  // its tip input tips it out of the plane: the beam climbs off the diode the same
  const t1 = shown(0.1, 1), t5 = shown(0.5, 1);
  assert.deepEqual(t1.pose.map(v => +v.toFixed(9)), [0, 0.1]);
  // (0.1 V lifts it 0.7 mm, still on a diode 2 mm across; 0.5 V lifts it 3.5 mm, off it)
  assert.ok(Math.abs(t1.deg) < 1e-3 && Math.abs(t1.up) > 0.3 && t1.mw > 0 && t5.mw === 0, 'tipped, the beam climbs and leaves the diode: ' + [t1.deg, t1.up, t1.mw, t5.mw]);
  assert.deepEqual(t1.rest, [135, undefined]);
});

test('a slow drive moves the mirror on the bench at the page’s clock; a quick one leaves it at its mean for the photodiodes to follow', () => {
  const els = f => [src({ width: 1, rays: 11, power: 1 }), kind('steering', { steerK: 1 }),
    { type: 'detector', id: 'D', name: 'D', x: 100, y: 200, angle: 270, length: 2 }, { type: 'elec', kind: 'sig', id: 'G', name: 'G', x: -60, y: 40, f, amp: 0.3, offset: 0.1, wave: 'sine' }];
  load(els(1));
  const k = portsOf(byId('M')).length - E.elecExtra(byId('M')).length, wire = [{ a: ['G', 0], b: ['M', k], wire: true }];
  const at = (f, t) => { E.ELEC.setSteerTime(t); load(els(f), wire); const p = E.ELEC.steerPose(byId('M'))[0]; E.ELEC.setSteerTime(null); return p; };
  // no clock (a worker, a script): the mean
  assert.ok(Math.abs(at(1, null) - 0.1) < 1e-9);
  // 1 Hz, on the clock: over a cycle it swings 0.3° either side of 0.1°
  const P = [0, 0.125, 0.25, 0.5, 0.75].map(t => at(1, t));
  assert.ok(Math.max(...P) - Math.min(...P) > 0.55 && Math.max(...P) <= 0.4 + 1e-9 && Math.min(...P) >= -0.2 - 1e-9, 'it follows the sine: ' + P);
  assert.ok(Math.abs(at(1, 0.3) - at(1, 1.3)) < 1e-9, 'a second on, the same');
  load(els(1), wire); assert.equal(E.ELEC.steerMoving(), true); assert.equal(E.ELEC.steerTones(byId('M'), false), false);
  // 1 kHz: too quick to draw, so the bench keeps the mean whatever the clock, and says the drive is quick
  for (const t of [0, 0.0003, 0.7]) assert.ok(Math.abs(at(1000, t) - 0.1) < 1e-9);
  load(els(1000), wire); assert.equal(E.ELEC.steerMoving(), false); assert.equal(E.ELEC.steerTones(byId('M'), true), false); assert.equal(E.ELEC.steerTones(byId('M'), false), true);
  // and the photodiode's signal carries the scan: a tone at the drive, the beam swept on and off the diode
  const S = E.ELEC.detSignalFull(byId('D'));
  assert.ok(S.tones.some(t => Math.abs(t.f - 1000) < 1e-6 && Math.hypot(t.re, t.im) > 0.01 * S.dc), 'a 1 kHz tone on the diode');
});
