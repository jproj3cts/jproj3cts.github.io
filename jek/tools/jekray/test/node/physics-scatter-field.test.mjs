/* A particle's scattered field as a picture (engines/scatter-field.js, the Particle's scatField): the irradiance it draws
   is the far-field pattern over r² (against the exact Mie far field), it stops at the first part each direction meets,
   its scale is its own (the bench's field scale moves nothing of it), and with it off nothing more is probed or kept. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBench, engine } from '../../headless.mjs';
await engine();
const { mieCoeffs } = await import('../../src/core/mie.js');
const { Z0_OHM, mieFarExact } = await import('../../src/core/scatter.js');
const SC = await import('../../src/engines/scatter.js');
const SF = await import('../../src/engines/scatter-field.js');
const TR = await import('../../src/engines/trace.js');
const { getEl } = await import('../../src/state/elements.js');
const { PARTS } = await import('../../src/parts/registry.js');

const NM = 1550;
const doc = (els, light) => ({ format: 'jekray', version: 1, name: 't', maxBounces: 20, minPower: 0.0001, light: Object.assign({ rays: true, envelope: true, field: true }, light), benches: [{ id: 'b1', name: 'B' }], tab: 'b1',
  elements: els.map(e => Object.assign({ bench: 'b1', angle: 0 }, e)) });
const laser = () => ({ id: 'laser', type: 'source', name: 'Laser', x: -20, y: 0, wavelength: NM, gauss: true, w0: 0.05, z0: 20, rays: 0, traceRays: false, power: 100, pol: 's' });
const particle = (o = {}) => Object.assign({ id: 'p', type: 'particle', name: 'Particle', x: 0.001, y: 0, angle: 90, trapMat: 'Fused silica', trapR: 150, trapMed: 'vacuum', scatField: true }, o);
const det = (o = {}) => Object.assign({ id: 'det', type: 'detector', name: 'Detector', x: 20, y: 0, angle: 180, length: 10 }, o);
const open = async (els, light) => { const B = await openBench(doc(els, light)); B.trace(); return B; };
const fieldOf = () => (TR.lastTrace.scat.fans.find(F => F.part === 'p') || {}).field;
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

test('the field is the far-field pattern over r², in the plane and out of it', async () => {
  await open([laser(), particle(), det()]);
  const G = fieldOf(), S = SC.scatCache.get('p').S, P = TR.lastTrace.scat.fans[0].pos;
  assert.ok(G && G.top > 0, 'a field is kept');
  const exact = d => { const F = mieFarExact(mieCoeffs(S.x, S.m[0], S.m[1]), S.k, S.dir, S.far.refs[0].E, new Float64Array(d)); let s = 0; for (let q = 0; q < 6; q++) s += F[q] ** 2; return s / (2 * Z0_OHM / S.nMed); };
  let worst = 0;
  // directions on the ring's own nodes and between them, at distances inside the detector (20 mm along +x)
  for (const deg of [0, 30, 61.25, 90, 120.4, 180, 250, 300]) for (const r of [2, 5, 12]) {
    const a = deg * Math.PI / 180, d = [Math.cos(a), Math.sin(a), 0], got = SF.scatPlaneAt(G, r * d[0], r * d[1]), want = exact(d) / (r * r);
    worst = Math.max(worst, rel(got, want));
    assert.ok(rel(got, want) < 2e-3, deg + '°, ' + r + ' mm: ' + got + ' against ' + want);
  }
  // 1/r²: twice as far, a quarter as bright
  assert.ok(rel(SF.scatPlaneAt(G, 0, 8), SF.scatPlaneAt(G, 0, 4) / 4) < 1e-12);
  // out of the plane (the sphere's grid, 5° apart): to a per cent
  for (const [th, ph] of [[30, 10], [60, 200], [100, 95], [150, 300]]) {
    const t = th * Math.PI / 180, p = ph * Math.PI / 180, d = [Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)], r = 6;
    const got = SF.scatFieldAt(G, r * d[0], r * d[1], r * d[2]), want = exact(d) / (r * r);
    assert.ok(rel(got, want) < 0.01, th + '°/' + ph + '°: ' + got + ' against ' + want);
  }
  // the plane's ring and the grid's equator agree
  assert.ok(rel(SF.scatFieldAt(G, 0, 5, 0), SF.scatPlaneAt(G, 0, 5)) < 1e-6);
  if (process.env.SHOW) console.log('# worst in the plane', worst.toExponential(2), 'at', P);
});

test('it stops at the first part each direction meets', async () => {
  await open([laser(), particle(), det()]);
  const G = fieldOf();
  // the detector's face 20 mm along +x, 10 mm long: light before it, none past it; back along the beam, the laser's
  // body 20 mm off stops it too; across the beam nothing is in the way
  assert.ok(SF.scatPlaneAt(G, 19, 0) > 0 && SF.scatPlaneAt(G, 21, 0) === 0 && SF.scatPlaneAt(G, 21, 3) === 0);
  assert.ok(SF.scatPlaneAt(G, -15, 0) > 0 && SF.scatPlaneAt(G, -25, 0) === 0 && SF.scatPlaneAt(G, 0, 25) > 0);
  assert.ok(SF.scatFieldAt(G, 19, 0, 0) > 0 && SF.scatFieldAt(G, 22, 0, 0) === 0);
  // past the detector's edge (5 mm off the axis at 20 mm) the light goes on
  assert.ok(SF.scatPlaneAt(G, 22, 7) > 0);
  // and nothing past the field's reach (twice the farthest part that catches light, the detector's rim: 41 mm)
  assert.ok(G.R > 40 && G.R < 42, 'reach ' + G.R);
  assert.equal(SF.scatPlaneAt(G, -G.R - 1, 0), 0);
  // where the strongest direction meets its reach it is at the floor of the scale
  const jm = G.ring.indexOf(Math.max(...G.ring)), a = 2 * Math.PI * jm / G.nRing;
  const atR = SF.scatPlaneAt(G, (G.R - 1e-6) * Math.cos(a), (G.R - 1e-6) * Math.sin(a));
  assert.ok(G.ringT[jm] < G.R || Math.abs(Math.log10(atR / G.top) + G.dec) < 1e-3);
});

test('its scale is its own: the bench’s field scale and the beam’s drawing move nothing of it', async () => {
  const tops = [];
  for (const scale of ['lin', 'log', 'log60']) { await open([laser(), particle(), det()], { scale }); tops.push(fieldOf().top); }
  assert.ok(tops.every(t => t === tops[0]), tops.join());
  const G = fieldOf();
  assert.equal(SF.scatFieldLevel(G, G.top), 1);
  assert.equal(SF.scatFieldLevel(G, G.top * 10 ** -G.dec), 0);
  assert.ok(Math.abs(SF.scatFieldLevel(G, G.top / 100) - 0.5) < 1e-12);
  // the beam's own trace is the same with it on or off
  const beams = JSON.stringify(TR.lastTrace.beams.filter(b => !b.fan).map(b => [b.x0, b.y0, b.dx, b.dy, b.len, b.w]));
  await open([laser(), particle({ scatField: false }), det()], { scale: 'log60' });
  assert.equal(JSON.stringify(TR.lastTrace.beams.filter(b => !b.fan).map(b => [b.x0, b.y0, b.dx, b.dy, b.len, b.w])), beams);
});

test('off (the default): no field, and nothing more probed', async () => {
  assert.equal(PARTS.particle.norm({ type: 'particle' }, {}).scatField, false);
  assert.equal(PARTS.particle.norm({ type: 'particle', scatField: true }, {}).scatField, true);
  // (moved a little each time, so the probe is made afresh rather than kept)
  await open([laser(), particle({ scatField: undefined, x: 0.002 }), det()]);
  assert.equal(getEl('p').scatField, false);
  assert.equal(fieldOf(), undefined);
  const off = TR.lastTrace.scat.parts.p.probed;
  await open([laser(), particle({ x: 0.003 }), det()]);
  assert.equal(TR.lastTrace.scat.parts.p.probed, off + SF.SF_RING + SF.SF_NT * SF.SF_NP);
});

test('past a lens: the light the cone carries on, from its rays as tubes, joins the 1/r² picture and keeps its power', async () => {
  // an ideal lens 20 mm to the side, focal length 20 mm: the cone comes out collimated onto a detector 60 mm out
  const lens = { id: 'L', type: 'mask', name: 'L', x: 0, y: 20, angle: 90, length: 20, amp: '1', delay: '-(sqrt(r^2+400)-20)/lambda', preset: 'custom' };
  await open([laser(), particle({ scatFan: false }), lens, det({ x: 0, y: 60, angle: 270, length: 30 })]);
  const F = TR.lastTrace.scat.fans.find(f => f.part === 'p'), G = F.field;
  const C = F.through.find(c => c.rays.length > 100);
  assert.ok(C, 'the lens’s cone goes on');
  let worst = 0, flat = 0, n = 0;
  for (const r of C.rays) {
    const s = r.s, m = s.length / 5;
    // where it leaves the lens, against the 1/r² picture a hair before it, along the same direction: the tube turned by
    // the lens is cut square to its new way, so wider by 1 / cos of the turn (the irradiance across it is that much less)
    const d = [s[0] - F.pos[0], s[1] - F.pos[1], s[2] - F.pos[2]], dl = Math.hypot(...d), e = [s[5] - s[0], s[6] - s[1], s[7] - s[2]], el = Math.hypot(...e);
    const turn = (d[0] * e[0] + d[1] * e[1] + d[2] * e[2]) / (dl * el), want = turn * SF.scatFieldAt(G, 0.999 * d[0], 0.999 * d[1], 0.999 * d[2]);
    if (want > 0 && r.ri < 6) { worst = Math.max(worst, rel(s[3], want)); n++; }
    // collimated: as bright all the way on
    for (let o = 5; o < s.length; o += 5) flat = Math.max(flat, rel(s[o + 3], s[3]));
    assert.ok(m >= 2 && Math.abs(s[5 * (m - 1) + 1] - 60) < 1e-6, 'to the detector');
  }
  assert.ok(n > 50 && worst < 0.03, 'joins the 1/r² picture at the lens: ' + worst + ' over ' + n);
  assert.ok(flat < 1e-3, 'collimated, as bright all the way: ' + flat);
  // power: each tube's irradiance times its area is the power its ray carries, which add up to what the lens catches
  const caught = TR.lastTrace.scat.parts.p.rows.find(r => r.id === 'L').P;
  let P = 0; for (const r of C.rays) P += r.s[3] * Math.PI * r.s[4] * r.s[4] / 4;
  assert.ok(rel(P, caught) < 0.05, 'the tubes carry the cone’s power: ' + P + ' against ' + caught);
  // with the field off there is nothing past the lens
  await open([laser(), particle({ scatFan: false, scatField: false, x: 0.002 }), lens, det({ x: 0, y: 60, angle: 270, length: 30 })]);
  assert.equal(TR.lastTrace.scat.fans.find(f => f.part === 'p').through, undefined);
});

test('the Scale: linear from nought to the top, or logarithmic over 30, 60 or 90 dB, and older benches’ log at 40', () => {
  const G = { top: 2, dec: 4, rTop: 0.3, R: 30 };
  assert.equal(SF.scatFieldLevel(G, 1, 0), 0.5);
  assert.equal(SF.scatFieldLevel(G, 4, 0), 1);
  assert.equal(SF.scatFieldLevel(G, 0, 0), 0);
  assert.equal(SF.scatFieldLevel(G, 2e-2), 0.5);                       // the field's own 40 dB
  for (const db of [30, 60, 90]) {
    assert.ok(Math.abs(SF.scatFieldLevel(G, 2 * 10 ** (-db / 20), db) - 0.5) < 1e-12, db + ' dB: half way down is half the scale');
    assert.equal(SF.scatFieldLevel(G, 2 * 10 ** (-db / 10), db), 0);
    // the strongest direction (top at rTop) meets the floor at the reach the scale gives
    assert.ok(Math.abs(SF.scatReach(G, db) - 0.3 * 10 ** (db / 20)) < 1e-9);
  }
  assert.ok(Math.abs(SF.scatReach(G, 40) - 30) < 1e-9 && SF.scatReach(G, 0) === 30);
  assert.deepEqual(SF.SCAT_SCALES.map(q => q[0]), ['lin', 'log30', 'log', 'log60', 'log90']);
  assert.deepEqual(['lin', 'log30', 'log60', 'log90', 'log'].map(SF.scatDbOf), [0, 30, 60, 90, 40]);
  // the part keeps an older bench's 'log', and what it does not know is that
  for (const [v, want] of [['log', 'log'], ['log60', 'log60'], ['lin', 'lin'], [undefined, 'log'], ['log45', 'log']]) assert.equal(PARTS.particle.norm({ type: 'particle', scatScale: v }, {}).scatScale, want);
});

/* two glass lenses facing each other with the particle between them, as a trap is built: each face reflects a few per
   cent, so the trace keeps each scattered ray as pieces split at the faces; the light past each lens is drawn all the
   same, forward as backward: as far out from the axis, the faces taking the same share (the forward cone is in two, a
   patch about the beam's way and the rest about it) */
for (const screen of [false, true]) test('a symmetric pair of glass lenses: the light past each is drawn, forward as backward' + (screen ? ', with a screen at the particle' : ''), async () => {
  const lens = (id, x, angle) => ({ id, type: 'lens', name: id, x, y: 0, angle, length: 4.7, surfaces: [{ R: 4 }, { R: -4 }], gaps: [2], materials: [{ glass: 'N-BK7' }] });
  await open([Object.assign(laser(), { x: -40, w0: 0.6, z0: 40, pol: 'p' }), lens('A', -4.2, 0), lens('B', 4.2, 180), particle({ x: 0, scatFan: false }),
    ...(screen ? [{ id: 'scr', type: 'screen', name: 'Screen', x: 0, y: 0, angle: 0, length: 3, absorb: false }] : []),
    det({ id: 'dF', x: 30, length: 20 }), det({ id: 'dB', x: -30, angle: 0, length: 20 })]);
  const F = TR.lastTrace.scat.fans.find(f => f.part === 'p'), rows = TR.lastTrace.scat.parts.p.rows;
  // each lens's cones (forward, the patch about the beam's way too): the rays that go on past the lens, how far out from
  // the axis they go (the widest launch angle among them), and the share of their power that comes out of the glass (the
  // power their tubes carry where they leave it, the start of their second stretch, against where they enter)
  const side = sg => {
    const cs = F.through.filter(q => Math.sign(q.rays[0].s[0]) === sg);
    assert.ok(cs.length, (sg > 0 ? 'forward' : 'backward') + ': the light past the lens is drawn');
    let Pin = 0, Pout = 0, wide = 0, far = 0, n = 0;
    for (const c of cs) for (const r of c.rays) {
      const s = r.s, o = 5 * 9;
      if (s.length <= o + 5) continue;
      n++;
      Pin += s[3] * Math.PI * s[4] ** 2 / 4; Pout += s[o + 3] * Math.PI * s[o + 4] ** 2 / 4;
      wide = Math.max(wide, Math.atan2(Math.hypot(s[1] - F.pos[1], s[2] - F.pos[2]), Math.abs(s[0] - F.pos[0])) * 180 / Math.PI);
      far = Math.max(far, sg * s[s.length - 5]);
    }
    assert.ok(far > 29, 'on to the detector: ' + far);
    return { T: Pout / Pin, wide, n };
  };
  const f = side(1), b = side(-1);
  if (process.env.SHOW) console.log('# forward', f, 'backward', b);
  assert.ok(f.n > 50 && b.n > 50, 'each cone goes on: ' + f.n + ', ' + b.n);
  assert.ok(Math.abs(f.wide - b.wide) < 1, 'as far out each way: ' + f.wide + '°, ' + b.wide + '°');
  assert.ok(f.T > 0.85 && f.T < 1 && rel(f.T, b.T) < 0.03, 'the faces take the same share each way: ' + f.T + ', ' + b.T);
});

/* the same glass lens at 90° to the beam, under the particle, with a detector beyond: its light goes on too */
test('a glass lens to the side of the particle, at 90° to the beam: the light past it is drawn', async () => {
  const lens = (id, x, y, angle) => ({ id, type: 'lens', name: id, x, y, angle, length: 4.7, surfaces: [{ R: 4 }, { R: -4 }], gaps: [2], materials: [{ glass: 'N-BK7' }] });
  await open([Object.assign(laser(), { x: -40, w0: 0.6, z0: 40, pol: 's' }), lens('A', -4.2, 0, 0), lens('B', 4.2, 0, 180), lens('S', 0, -4.2, 90), particle({ x: 0, scatFan: false }),
    det({ id: 'dF', x: 30, length: 20 }), det({ id: 'dS', x: 0, y: -30, angle: 90, length: 20 })]);
  const F = TR.lastTrace.scat.fans.find(f => f.part === 'p');
  const cs = F.through.filter(q => q.rays[0].s[1] < -2);
  assert.ok(cs.length, 'the side lens’s light goes on past it');
  let Pin = 0, Pout = 0, far = 0, n = 0;
  for (const c of cs) for (const r of c.rays) {
    const s = r.s, o = 5 * 9;
    if (s.length <= o + 5) continue;
    n++; Pin += s[3] * Math.PI * s[4] ** 2 / 4; Pout += s[o + 3] * Math.PI * s[o + 4] ** 2 / 4; far = Math.max(far, -s[s.length - 4]);
  }
  assert.ok(n > 50 && far > 29, 'on to its detector: ' + n + ' rays, ' + far + ' mm');
  assert.ok(Pout / Pin > 0.85 && Pout / Pin < 1, 'the faces take their share: ' + Pout / Pin);
});
