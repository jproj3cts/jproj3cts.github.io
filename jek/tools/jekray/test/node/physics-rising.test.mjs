/* Beams that rise or descend out of the bench plane, onto a particle and into a trap: each pair built level and rising
   must agree once the frame is turned. Tolerances written before the first run
   (scratchpad tolerances.md, "Beams that rise or descend onto a Particle"). SHOW=1 prints the margins. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openBench, engine } from '../../headless.mjs';

await engine();
const TR = await import('../../src/engines/trace.js');
const PS = await import('../../src/engines/phase-screen.js');
const say = (...a) => { if (process.env.SHOW) console.log('#', ...a); };
const doc = els => ({ format: 'jekray', version: 1, name: 't', maxBounces: 20, minPower: 0.0001, light: { rays: true, envelope: true, field: true }, benches: [{ id: 'b1', name: 'B' }], tab: 'b1',
  elements: els.map(e => Object.assign({ bench: 'b1', angle: 0 }, e)) });
const laser = (o = {}) => Object.assign({ id: 'laser', type: 'source', name: 'Laser', x: -20, y: 0, wavelength: 1550, gauss: true, w0: 0.05, z0: 20, rays: 0, traceRays: false, power: 100, pol: 'p' }, o);

test('B1: a level beam’s frame is the level frame every reading has used', async () => {
  const B = await openBench(doc([laser({}), { id: 'm', type: 'mirror', name: 'M', x: 10, y: 0, angle: 135, length: 10 },
    { id: 's', type: 'screen', name: 'S', x: 10, y: 30, angle: 270, length: 10 }])); B.trace();
  const beams = TR.lastTrace.beams;
  assert.ok(beams.length >= 2);
  for (const b of beams) {
    const F = PS.beamFrame(b), z0 = b.z0 !== undefined ? b.z0 : 75;
    const want = { P0: [b.x0, b.y0, z0], d: [b.dx, b.dy, 0], ex: [-b.dy, b.dx, 0], ey: [0, 0, 1] };
    for (const k of Object.keys(want)) want[k].forEach((v, i) => assert.ok(Math.abs(F[k][i] - v) <= 1e-15, k + '[' + i + '] ' + F[k][i] + ' against ' + v));
    assert.equal(F.L, b.len); assert.equal(F.level, true);
  }
  say('B1', beams.length, 'level legs: exact');
});
test('a rising beam’s frame: its way, its axes square to it and to each other, ey upward', async () => {
  const B = await openBench(doc([laser({ tip: 30 })])); B.trace();
  const b = TR.lastTrace.beams.find(q => q.d3);
  assert.ok(b, 'a rising leg');
  const F = PS.beamFrame(b), dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
  assert.ok(Math.abs(Math.hypot(...F.d) - 1) < 1e-12 && Math.abs(dot(F.d, F.ex)) < 1e-12 && Math.abs(dot(F.d, F.ey)) < 1e-12 && Math.abs(dot(F.ex, F.ey)) < 1e-12 && F.ey[2] > 0 && !F.level);
  assert.ok(Math.abs(F.d[2] - Math.sin(30 * Math.PI / 180)) < 1e-9, 'rises at 30 deg: ' + F.d);
});

/* B2: a screen's atom trap fed by a rising beam. The screen used to take the beam's 3D length as its run across the bench,
   so its trap was looked for past where the beam meets it (screenDom against trapBeams). */
const SS = await import('../../src/engines/screen-stats.js');
const PD = await import('../../src/engines/pd-cavity.js');
const ST = await import('../../src/state/project.js');
const T30 = 30 * Math.PI / 180;
const atomTrap = async tip => {
  const z = tip ? { x: -20 + 20 * Math.cos(T30), z: 75 + 20 * Math.sin(T30), tip: -30 } : { x: 0 };
  const B = await openBench(doc([laser({ tip: tip ? 30 : 0, pol: 's', power: 1000 }), Object.assign({ id: 's', type: 'screen', name: 'S', y: 0, angle: 180, length: 0.2, absorb: false, trap: 'Rb87' }, z)]));
  B.trace();
  const el = ST.project.elements.find(e => e.id === 's'), D = PD.diffraction(el);
  return D && D.trap ? SS.trapReport(el, D.trap) : null;
};
test('B2: a screen’s atom trap in a rising beam is the level one', async () => {
  const L = await atomTrap(false), R = await atomTrap(true);
  assert.ok(L && L.trap && R && !R.error, 'traps: ' + JSON.stringify([L && L.trap, R && (R.error || R.trap)]));
  const rel = (a, b) => Math.abs(a / b - 1);
  for (const q of ['U', 'fx', 'fy', 'fz']) assert.ok(rel(R[q], L[q]) <= 1e-4, q + ': ' + R[q] + ' rising against ' + L[q] + ' level');
  say('B2 U', rel(R.U, L.U).toExponential(2), 'fx', rel(R.fx, L.fx).toExponential(2), 'fy', rel(R.fy, L.fy).toExponential(2), 'fz', rel(R.fz, L.fz).toExponential(2));
});

/* B3: a gentle Gaussian, level and tipped up 30 deg, the particle on its axis at the same distance along it */
const SC = await import('../../src/engines/scatter.js');
const tipped = (tip, extra = []) => {
  const c = Math.cos(tip * Math.PI / 180), s = Math.sin(tip * Math.PI / 180);
  return [laser({ tip, pol: 's', w0: 0.05, z0: 20 }), { id: 'p', type: 'particle', name: 'P', x: -20 + 20 * c, y: 0, z: 75 + 20 * s, angle: 90, trapMat: 'Fused silica', trapR: 150, trapMed: 'vacuum', scatNA: 0.3 }, ...extra];
};
const runP = async els => { const B = await openBench(doc(els)); B.trace(); const el = ST.project.elements.find(e => e.id === 'p'); return { S: SC.scatterPlain(SC.scatterNow(el)), el }; };
test('B3: a gentle Gaussian tipped up 30 deg scatters and traps as the level one does', async () => {
  const A = await runP(tipped(0)), R = await runP(tipped(30));
  const rel = (a, b) => Math.abs(a / b - 1), got = {}, lim = {};
  assert.ok(R.S && !R.S.error, 'the rising beam reaches the particle: ' + (R.S && R.S.error));
  for (const q of ['Csca', 'Cext']) { got[q] = rel(R.S[q], A.S[q]); lim[q] = 1e-9; }
  for (const q of ['Psca', 'Pext', 'I0']) { got[q] = rel(R.S[q], A.S[q]); lim[q] = 1e-4; }
  got.collect = rel(R.S.collect.frac, A.S.collect.frac); lim.collect = 1e-4;
  // (the solver's own stiffnesses: there is no trap in this gentle beam, so the report gives none)
  const TA = A.S.trapRaw, TR2 = R.S.trapRaw;
  say('B3 traps', TA.trap, TR2.trap, JSON.stringify(TA.k), JSON.stringify(TR2.k));
  TA.k.forEach((v, i) => { got['k' + i] = rel(TR2.k[i], v); lim['k' + i] = 1e-4; });
  // the far field in each one's own frame (far.axes: across, up, along), at the same grid point
  const own = (S, i) => { const F = S.far.F[0], ax = S.far.axes; return ax.map(a => [0, 1].map(ri => a[0] * F[6 * i + ri] + a[1] * F[6 * i + 2 + ri] + a[2] * F[6 * i + 4 + ri])); };
  // (its largest value as a vector's size: a component on the world's axes turns with the frame)
  const big = S => { const F = S.far.F[0]; let m = 0; for (let i = 0; i < F.length; i += 6) m = Math.max(m, Math.hypot(F[i], F[i + 1], F[i + 2], F[i + 3], F[i + 4], F[i + 5])); return m; };
  const n = A.S.far.F[0].length / 6, top = big(A.S);
  got.Fmax = rel(big(R.S), top); lim.Fmax = 1e-4;
  let worst = 0;
  for (const i of [0, Math.floor(n / 3), Math.floor(2 * n / 3)]) { const a = own(A.S, i), b = own(R.S, i); for (let m = 0; m < 3; m++) for (let r = 0; r < 2; r++) worst = Math.max(worst, Math.abs(a[m][r] - b[m][r]) / top); }
  got.turned = worst; lim.turned = 1e-4;
  say('B3', JSON.stringify(Object.fromEntries(Object.entries(got).map(([k, v]) => [k, +v.toExponential(2)]))));
  for (const k of Object.keys(lim)) assert.ok(got[k] <= lim[k], k + ': ' + got[k] + ' (allowed ' + lim[k] + ')');
});

/* B6: a detector after the particle, at the rotated place: its reading and the particle's part in it */
const FF = await import('../../src/engines/fibre-face.js');
const SE = await import('../../src/state/elements.js');
test('B6: a detector beyond the particle reads the same, level or tipped up 30 deg', async () => {
  const det = tip => { const c = Math.cos(tip * Math.PI / 180), s = Math.sin(tip * Math.PI / 180); return { id: 'det', type: 'detector', name: 'D', x: -20 + 50 * c, y: 0, z: 75 + 50 * s, angle: 180, length: 10, ...(tip ? { tip: -tip } : {}) }; };
  const read = async tip => { const B = await openBench(doc(tipped(tip, [det(tip)]))); B.trace(); return FF.detectorReading(SE.getEl('det')); };
  const A = await read(0), R = await read(30), rel = (a, b) => Math.abs(a / b - 1);
  assert.ok(A.scat && A.scat.cones > 0 && R.scat && R.scat.cones > 0, 'the scattered light reaches both: ' + JSON.stringify([A.scat, R.scat]));
  const m = rel(R.mw, A.mw), x = rel(R.scat.cross, A.scat.cross), o = rel(R.scat.mw - R.scat.cross, A.scat.mw - A.scat.cross);
  say('B6 total', R.mw, A.mw, m.toExponential(2), '; interference', R.scat.cross, A.scat.cross, x.toExponential(2), '; own', o.toExponential(2));
  assert.ok(m <= 1e-4, 'reading ' + R.mw + ' against ' + A.mw);
  assert.ok(x <= 1e-4, 'interference ' + R.scat.cross + ' against ' + A.scat.cross);
});

/* B4: a steep focus (NA 0.8 thin-mask lens), the laser and the lens tipped up 30 deg together, the particle at the focus */
const steep = tip => {
  const c = Math.cos(tip * Math.PI / 180), s = Math.sin(tip * Math.PI / 180), at = L => ({ x: -30 + L * c, y: 0, z: 75 + L * s });
  return [laser({ x: -30, tip, pol: 's', w0: 1.5, z0: 0 }), Object.assign({ id: 'obj', type: 'mask', name: 'obj', angle: 0, length: 5.333, amp: '1', delay: '-(sqrt(r^2+4)-2)/lambda', preset: 'custom' }, at(30), tip ? { tip } : {}),
    Object.assign({ id: 'p', type: 'particle', name: 'P', angle: 90, trapMat: 'Fused silica', trapR: 150, trapMed: 'vacuum', scatLight: false }, at(32))];
};
test('B4: a steep focus tipped up 30 deg with its laser scatters and traps as the level one does', async () => {
  const A = await runP(steep(0)), R = await runP(steep(30)), rel = (a, b) => Math.abs(a / b - 1), got = {};
  assert.ok(R.S && !R.S.error, 'the rising focus reaches the particle: ' + (R.S && R.S.error));
  assert.deepEqual([R.S.routes, R.S.pupils], [A.S.routes, A.S.pupils]);
  for (const q of ['I0', 'Psca', 'Pext']) got[q] = rel(R.S[q], A.S[q]);
  got.collect = rel(R.S.collect.frac, A.S.collect.frac);
  const TA = SS.trapReport(A.el, A.S.trapRaw), TB = SS.trapReport(R.el, R.S.trapRaw);
  for (const q of ['fx', 'fy', 'fz']) got[q] = rel(TB[q], TA[q]);
  say('B4 routes', JSON.stringify(R.S.routes), 'pupils', R.S.pupils, JSON.stringify(Object.fromEntries(Object.entries(got).map(([k, v]) => [k, +v.toExponential(2)]))));
  for (const k of Object.keys(got)) assert.ok(got[k] <= 1e-3, k + ': ' + got[k]);
});

/* B5: a vertical trap. A level beam folded straight up by a mirror tipped 45 deg (a periscope's first mirror), focused upward by
   the real asphere of the real-lens check turned to face up (the traced route) onto the particle above it; against the same
   lens level, the same distances along the beam */
const LENS5 = JSON.parse(fs.readFileSync(new URL('../../../validation/ref/scatter-real-lens.json', import.meta.url), 'utf8')).prescription;
const vertical = up => {
  const Tk = LENS5.thickness_mm, semi = LENS5.semi_aperture_mm, F0 = Tk / 2 + LENS5.vertex_to_focus_mm, coat = { mode: 'custom', R: 0 };
  const lens = Object.assign({ id: 'obj', type: 'lens', name: 'obj', y: 0, angle: 0, diameter: +(2 * semi + 0.2).toFixed(4), surfaces: [{ R: null, coat, semi }, { R: LENS5.R_mm, k: LENS5.k, coat, semi }], gaps: [Tk], materials: [{ glass: 'N-BK7' }] },
    up ? { x: -10, z: 95, tip: 90 } : { x: 10 });
  return [laser({ x: -30, pol: 's', w0: 1.7, z0: 0 }), ...(up ? [{ id: 'm', type: 'mirror', name: 'M', x: -10, y: 0, angle: 180, tip: 45, length: 12 }] : []), lens,
    // (a 100 nm sphere: the 300 nm one is not held at this NA in vacuum, radiation pressure winning, level or vertical)
    Object.assign({ id: 'p', type: 'particle', name: 'P', y: 0, angle: 90, trapMat: 'Fused silica', trapR: 50, trapMed: 'vacuum', scatLight: false }, up ? { x: -10, z: 95 + F0 } : { x: 10 + F0 })];
};
test('B5: a vertical trap through a 45 deg fold and a real asphere facing up is the level one', async () => {
  const A = await runP(vertical(false)), R = await runP(vertical(true)), rel = (a, b) => Math.abs(a / b - 1), got = {};
  assert.ok(R.S && !R.S.error, 'the vertical focus reaches the particle: ' + (R.S && R.S.error));
  assert.deepEqual([R.S.routes, R.S.pupils], [A.S.routes, A.S.pupils]);
  for (const q of ['I0', 'Psca']) got[q] = rel(R.S[q], A.S[q]);
  const TA = SS.trapReport(A.el, A.S.trapRaw), TB = SS.trapReport(R.el, R.S.trapRaw);
  assert.ok(TA.trap && TB.trap, 'a trap both ways');
  // (across the beam the two axes may swap with the fold: compared as a pair)
  const [a1, a2] = [TA.fx, TA.fy].sort((x, y) => x - y), [b1, b2] = [TB.fx, TB.fy].sort((x, y) => x - y);
  got.f1 = rel(b1, a1); got.f2 = rel(b2, a2); got.fz = rel(TB.fz, TA.fz);
  say('B5 routes', JSON.stringify(R.S.routes), JSON.stringify(Object.fromEntries(Object.entries(got).map(([k, v]) => [k, +v.toExponential(2)]))));
  for (const k of Object.keys(got)) assert.ok(got[k] <= 1e-3, k + ': ' + got[k]);
});
