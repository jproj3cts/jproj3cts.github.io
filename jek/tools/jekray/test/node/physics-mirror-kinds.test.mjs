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

const load = (elements, fibres) => { loadProject({ format: 'jekray', version: 1, name: 'mirrors', elements, fibres: fibres || [], minPower: 1e-6 }); TRACE.setLastTraceKey(null); TRACE.traceScene(); return TRACE.lastTrace; };
const byId = id => ST.project.elements.find(e => e.id === id);
const src = (o = {}) => Object.assign({ type: 'source', id: 'S', name: 'S', x: 0, y: 0, angle: 0, wavelength: 633, width: 8, divergence: 0, rays: 5, gauss: false, pol: 's' }, o);
const kind = (k, o = {}) => Object.assign(makeElement(k, 100, 0), { id: 'M' }, o);
// the last leg of each ray that carries light: where it starts and its direction
const legs = (T, min = 0.01) => T.rays.filter(r => r.w > min && r.pts.length >= 4).map(r => { const p = r.pts, n = p.length; const d = Math.hypot(p[n - 2] - p[n - 4], p[n - 1] - p[n - 3]); return { x: p[n - 4], y: p[n - 3], dx: (p[n - 2] - p[n - 4]) / d, dy: (p[n - 1] - p[n - 3]) / d, w: r.w, n }; });
// where a leg crosses the line x = X (or y = Y)
const atX = (L, X) => L.y + L.dy / L.dx * (X - L.x), atY = (L, Y) => L.x + L.dx / L.dy * (Y - L.y);

test('each kind is a mirror (or a filter, a prism) of its own settings, named for what it is', () => {
  const made = Object.fromEntries(['mirror', 'concave', 'convex', 'parabolic', 'oap', 'partial', 'chirped', 'steering', 'dichroic', 'retro'].map(k => [k, makeElement(k, 0, 0)]));
  for (const k of ['mirror', 'concave', 'convex', 'parabolic', 'oap', 'partial', 'chirped', 'steering']) assert.equal(made[k].type, 'mirror', k);
  assert.equal(made.mirror.R, null); assert.equal(made.mirror.reflect, 100); assert.equal(made.mirror.steer, undefined);
  assert.ok(made.concave.R > 0 && made.concave.k === 0); assert.ok(made.convex.R < 0);
  assert.ok(made.parabolic.k === -1 && made.parabolic.offset === 0);
  assert.ok(made.oap.k === -1 && made.oap.offset === made.oap.R, 'the 90° one: cut 2f off the axis, R = 2f');
  assert.equal(made.partial.reflect, 50); assert.ok(made.chirped.gdd < 0);
  assert.ok(made.steering.steer === true && made.steering.steerK === 1);
  assert.ok(made.dichroic.type === 'filter' && made.dichroic.reflect === true);
  assert.ok(made.retro.type === 'prism' && made.retro.shape === 'right');
  assert.deepEqual(Object.values(made).map(e => e.name), ['Mirror 1', 'Concave mirror 1', 'Convex mirror 1', 'Parabolic mirror 1', 'Off-axis parabola 1', 'Partial reflector 1', 'Chirped mirror 1', 'Steering mirror 1', 'Dichroic mirror 1', 'Retroreflector 1']);
});

test('a concave mirror focuses at R/2 and a convex one spreads from R/2 behind it; a parabola focuses every ray at one point', () => {
  // rays 2 mm and 4 mm off the axis, back from the mirror at x = 100: they cross the axis R/2 = 100 mm before it
  const cross = k => legs(load([src(), kind(k)])).filter(L => Math.abs(L.y) > 0.5 && L.dx < 0).map(L => +(L.x - L.y * L.dx / L.dy).toFixed(4));
  const cc = cross('concave'), cv = cross('convex'), pb = cross('parabolic');
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

test('a partial reflector halves the light; a dichroic mirror reflects the short wavelength and passes the long', () => {
  const P = legs(load([src({ rays: 1, width: 0 }), kind('partial')]));
  const on = P.find(l => l.dx > 0.99 && l.x > 99), up = P.find(l => Math.abs(l.dy) > 0.99);
  assert.ok(on && up && Math.abs(on.w - 0.5) < 1e-9 && Math.abs(up.w - 0.5) < 1e-9, 'half each way');
  const way = nm => { const D = legs(load([src({ rays: 1, width: 0, wavelength: nm }), kind('dichroic')]), 0.5).filter(l => l.x > 99); assert.equal(D.length, 1, nm + ' nm goes one way'); return D[0]; };
  assert.ok(Math.abs(way(532).dy) > 0.99, '532 nm, below the 600 nm edge, is reflected through a right angle');
  assert.ok(way(1064).dx > 0.99, '1064 nm goes on through');
});

test('a retroreflector sends a beam back parallel to itself, as far the other side of its middle, at any angle in the plane', () => {
  for (const [y, deg] of [[3, 0], [-5, 0], [2, 4], [0, -4]]) {
    const a = deg * Math.PI / 180, L = legs(load([src({ rays: 1, width: 0, y, angle: deg }), kind('retro')]), 0.5);
    const back = L[L.length - 1];
    assert.ok(Math.abs(back.dx + Math.cos(a)) < 1e-9 && Math.abs(back.dy + Math.sin(a)) < 1e-9, 'antiparallel: ' + [y, deg, back.dx, back.dy]);
    assert.ok(back.w > 0.8, 'by total internal reflection: only its two passes of the entry face lost, ' + back.w);
  }
  // past about 5.7° one way, N-BK7 no longer reflects totally at the first short face, and light leaks out of it
  const far = legs(load([src({ rays: 1, width: 0, angle: -8 }), kind('retro')]), 0.3).pop();
  assert.ok(far.w < 0.8, 'beyond its acceptance some is lost: ' + far.w);
  // straight in, 3 mm above the middle: back 3 mm below it
  const L = legs(load([src({ rays: 1, width: 0, y: 3 }), kind('retro')]), 0.5), back = L[L.length - 1];
  assert.ok(Math.abs(back.y + 3) < 1e-9, 'mirrored about the middle: ' + back.y);
});

test('a steering mirror turns by its volts: the beam on a small photodiode leaves it as the drive rises, and the bench stays at rest', () => {
  const els = v => [src({ width: 1, rays: 11, power: 1 }), kind('steering', { steerK: 1 }),
    { type: 'detector', id: 'D', name: 'D', x: 100, y: 200, angle: 270, length: 2 }, { type: 'elec', kind: 'dc', id: 'V', name: 'V', x: -60, y: 40, v }];
  load(els(0));
  const M = byId('M'), X = E.elecExtra(M), k = portsOf(M).length - X.length;
  assert.deepEqual(X.map(p => [p.elec, p.name]), [['in', 'tilt']]);
  assert.deepEqual(E.elecExtra(kind('mirror')), [], 'a plain mirror has no input');
  const out = v => { load(els(v), [{ a: ['V', 0], b: ['M', k], wire: true }]); return E.ELEC.detSignalFull(byId('D')).dc; };
  const v0 = out(0), v1 = out(0.1), v2 = out(0.2), v3 = out(0.5);
  // 200 mm on, the beam moves 2 × 200 × tan(θ): 0.1° is 0.7 mm, 0.5° is 3.5 mm, off a 2 mm diode
  assert.ok(v0 > 0 && v1 < v0 && v2 < v1 && v3 === 0, 'the reading falls: ' + [v0, v1, v2, v3]);
  assert.equal(byId('M').angle, 135, 'the mirror is left as it stood');
  // the other way round the same, by symmetry
  assert.ok(Math.abs(out(-0.1) - v1) < 1e-9 * v0);
});
