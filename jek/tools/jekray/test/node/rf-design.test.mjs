/* The RF designer's engine (engines/rf-design.js): a feed horn's Gaussian beam through a prescription by its
   first-order matrices, the figures an RF designer reads, and lenses designed from a spec.
   Checked against: a Gaussian beam's radius after free space, by its own formula; the aperture efficiency of a
   Gaussian over a round aperture, at most 81.5% at an edge taper near 11 dB, as Goldsmith gives it, and a flat
   phase's against a curved one; the coupling of a beam to itself, 1, and to one twice as wide, 16/25; a quarter-
   wave matching layer with no reflection at its own frequency, and Fresnel's without it; a hyperbolic lens with
   its focus at the feed's phase centre leaving the beam flat (its waist at the lens) and a two-face one coupling a
   horn's beam into an identical horn completely; a single curved face, its curvature solved for the lens's
   thickness, within a few tenths of a per cent of that. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const D = await import('../../src/engines/lens-design.js');
const RF = await import('../../src/engines/rf-design.js');
const C = await import('../../src/core/rf.js');

const feed = { kind: 'corrugated', a: 15, L: 80, d: 150 }, ghz = 24, lam = C.C_NM_GHZ / ghz * 1e-6;
function system(R1, k1, R2, k2, t, goal, mat) {
  loadProject({ format: 'jekray', version: 1, elements: [{ type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, diameter: 120, asphere: true, surfaces: [{ R: R1, k: k1 }, { R: R2, k: k2 }], gaps: [t], materials: [{ glass: mat || 'HDPE' }], mmw: { part: true }, group: 'g' }],
    assemblies: [{ id: 'g', name: 'RF', ref: 'L', kind: 'rf', rf: { ghz, feed, goal } }] });
  const a = ST.project.assemblies[0], P = D.designPrescription(a);
  RF.rfSyncCond(a, P);
  return { a, P };
}

test('a feed horn’s beam through free space and a flat window: its radius by the Gaussian formula', () => {
  const { a, P } = system(null, 0, null, 0, 5, { kind: 'collimate', d: 300 });
  const B = C.rfBeam(feed, ghz), r = RF.rfTrace(a, P, ghz);
  for (const s of r.samples.filter(s => s.z < 0)) {
    const z = s.z + feed.d + B.dz, w = B.w0 * Math.sqrt(1 + (z / B.zR) ** 2);
    assert.ok(Math.abs(s.w - w) < 1e-9 * w, s.z + ': ' + s.w + ' against ' + w);
  }
  // through 5 mm of HDPE it is as if 5/n of air
  const zOut = feed.d + B.dz + 5 / C.RF_MAT.HDPE.n, wOut = B.w0 * Math.sqrt(1 + (zOut / B.zR) ** 2);
  assert.ok(Math.abs(r.surf[1].w - wOut) < 1e-9 * wOut);
  assert.equal(a.cond.waves.length, 3);
  assert.ok(Math.abs(a.cond.waves[a.cond.primary].nm - C.C_NM_GHZ / ghz) < 1e-6);
});

test('aperture efficiency, coupling and a matched face against their formulas', () => {
  let best = 0, at = 0;
  for (let T = 1; T <= 30; T += 0.01) { const w = 1 / Math.sqrt(T / 8.686), e = RF.apertureEff(1, w, Infinity, lam); if (e > best) { best = e; at = T; } }
  assert.ok(Math.abs(best - 0.8145) < 5e-4 && Math.abs(at - 10.9) < 0.2, best + ' at ' + at + ' dB');
  assert.ok(RF.apertureEff(50, 40, 2000, lam) < RF.apertureEff(50, 40, Infinity, lam), 'a curved phase spreads the beam');
  assert.ok(Math.abs(RF.gaussCoupling(10, Infinity, 10, Infinity, lam) - 1) < 1e-12);
  assert.ok(Math.abs(RF.gaussCoupling(10, Infinity, 20, Infinity, lam) - 16 / 25) < 1e-12);
  const n = 1.526, nm = C.C_NM_GHZ / ghz, coat = { mode: 'stack', label: 'Matching layer', design: nm, layers: [{ n: Math.sqrt(n), d: nm / (4 * Math.sqrt(n)) }] };
  assert.ok(RF.faceR(1, n, nm, coat) < 1e-20);
  assert.ok(Math.abs(RF.faceR(1, n, nm, null) - ((n - 1) / (n + 1)) ** 2) < 1e-15);
  assert.ok(RF.faceR(1, n, nm * 1.2, coat) > 1e-4 && RF.faceR(1, n, nm * 1.2, coat) < RF.faceR(1, n, nm, null));
});

test('a hyperbolic lens focused on the feed’s phase centre leaves the beam flat, its waist at the lens', () => {
  const B = C.rfBeam(feed, ghz), z = feed.d + B.dz, Rg = z * (1 + (B.zR / z) ** 2), n = C.RF_MAT.HDPE.n, t = 30;
  const { a, P } = system((n - 1) * Rg, -n * n, null, 0, t, { kind: 'collimate', d: 300 });
  const r = RF.rfTrace(a, P, ghz);
  // the waist is at the curved face: seen from the flat back, t/n behind it
  assert.ok(Math.abs(r.waist.at + t / n) < 1e-6, String(r.waist.at));
  assert.ok(Math.abs(r.waist.w - B.w0 * Math.sqrt(1 + (z / B.zR) ** 2)) < 1e-6);
  assert.ok(r.gain > 20 && r.gain < 32 && r.apEff > 0.5 && r.apEff < 0.815, r.gain + ' dBi, ' + r.apEff);
});

test('lenses designed from a spec: two hyperbolic faces couple a horn into its twin completely; one face nearly', () => {
  const { a, P } = system(200, 0, null, 0, 20, { kind: 'couple', d: 300, rx: { kind: 'corrugated', a: 15, L: 80 } });
  const res = {};
  for (const type of ['biconvex', 'hyperbolic', 'planoconvex']) {
    const o = RF.rfSynth(a, P, { pi: 0, type, mat: 'HDPE', D: 120, edge: 2, place: 'match' });
    assert.ok(!o.error, o.error);
    const P2 = JSON.parse(JSON.stringify(P)); Object.assign(P2.surfaces[0], o.s1); Object.assign(P2.surfaces[1], o.s2); P2.gaps[0] = o.t;
    const a2 = Object.assign({}, a, { rf: Object.assign({}, a.rf, { feed: Object.assign({}, a.rf.feed, { d: o.feedD }) }) });
    res[type] = RF.rfTrace(a2, P2, ghz).coupling;
    if (type === 'biconvex') { assert.equal(o.s1.k, -(C.RF_MAT.HDPE.n ** 2)); assert.ok(o.s2.R < 0 && o.s1.R > 0); }
  }
  assert.ok(res.biconvex > 0.99999, String(res.biconvex));
  assert.ok(res.hyperbolic > 0.995 && res.planoconvex > 0.995, JSON.stringify(res));
  // for an edge taper: the feed moved so the beam is that much down at the lens's rim
  const o = RF.rfSynth(a, P, { pi: 0, type: 'hyperbolic', mat: 'PLA', D: 120, edge: 2, place: 'taper', taper: 11 });
  assert.ok(Math.abs(o.taper - 11) < 1e-9, String(o.taper));
});

test('the analyses: real-ray phase error, the far-field pattern and a lens as a slab, against their formulas', () => {
  const B = C.rfBeam(feed, ghz), z = feed.d + B.dz, Rg = z * (1 + (B.zR / z) ** 2), n = C.RF_MAT.HDPE.n;
  // a hyperbolic face on the beam's phase centre adds no phase error; a sphere of the same vertex radius does
  let s = system((n - 1) * Rg, -n * n, null, 0, 30, { kind: 'collimate', d: 300 }), t = RF.rfTrace(s.a, s.P, ghz);
  assert.ok(t.sigma / t.lam < 1e-9 && t.phaseEff > 1 - 1e-12, String(t.sigma));
  s = system((n - 1) * Rg, 0, null, 0, 30, { kind: 'collimate', d: 300 }); t = RF.rfTrace(s.a, s.P, ghz);
  assert.ok(t.sigma / t.lam > 0.05 && t.phaseEff < 0.9, String(t.sigma / t.lam));
  // a nearly uniform aperture: half-power beamwidth 58.9 λ/D degrees and its first sidelobe at -17.6 dB (Airy)
  const D = 300, pat = RF.rfPattern({ a: D / 2, w: 1e5, R: Infinity }, lam, 20, 2001);
  assert.ok(Math.abs(pat.hpbw - 58.93 * lam / D) < 0.01 * 58.93 * lam / D, String(pat.hpbw));
  assert.ok(Math.abs(pat.sidelobe + 17.57) < 0.1, String(pat.sidelobe));
  // a tapered aperture: a wider beam and lower sidelobes
  const tp = RF.rfPattern({ a: D / 2, w: D / 2 / Math.sqrt(11 / 8.686), R: Infinity }, lam, 20, 2001);
  assert.ok(tp.hpbw > pat.hpbw && tp.sidelobe < -24, JSON.stringify([tp.hpbw, tp.sidelobe]));
  // a plain slab: no reflection when half a wave thick inside; at a quarter, its most, ((n² - 1)/(n² + 1))²
  const half = C.C_NM_GHZ / ghz * 1e-6 / (2 * n);
  s = system(null, 0, null, 0, half, { kind: 'collimate', d: 300 });
  assert.ok(RF.rfSlabs(s.P, ghz)[0].R < 1e-20);
  s = system(null, 0, null, 0, half / 2, { kind: 'collimate', d: 300 });
  assert.ok(Math.abs(RF.rfSlabs(s.P, ghz)[0].R - ((n * n - 1) / (n * n + 1)) ** 2) < 1e-12);
});

test('optimising a spherical lens finds the hyperbola again: its phase error gone and its gain the designed lens’s', () => {
  const B = C.rfBeam(feed, ghz), z = feed.d + B.dz, Rg = z * (1 + (B.zR / z) ** 2), n = C.RF_MAT.HDPE.n;
  const ideal = (() => { const s = system((n - 1) * Rg, -n * n, null, 0, 30, { kind: 'collimate', d: 300 }); return RF.rfTrace(s.a, s.P, ghz); })();
  const { a, P } = system((n - 1) * Rg * 1.1, 0, null, 0, 30, { kind: 'collimate', d: 300 });
  const prob = RF.rfOptProblem(a, P, { keys: ['c:0', 'k:0'], flat: 0, edgeMin: 1, tMax: 0 });
  let st = RF.rfOptStart(prob);
  const before = st.mean;
  for (let i = 0; i < 200 && !st.done; i++) st = RF.rfOptStep(prob, st);
  const c = prob.at(st.x), t = RF.rfTrace(c.asm, c.P, ghz);
  assert.ok(st.mean > before + 0.05, before + ' → ' + st.mean);
  assert.ok(t.sigma / t.lam < 0.01, String(t.sigma / t.lam));
  assert.ok(Math.abs(t.gain - ideal.gain) < 0.05, t.gain + ' against ' + ideal.gain);
});

test('tolerancing: each error moves the figure as it should, Monte Carlo is repeatable, and the yield its Wilson interval', () => {
  const B = C.rfBeam(feed, ghz), z = feed.d + B.dz, Rg = z * (1 + (B.zR / z) ** 2), n = C.RF_MAT.HDPE.n;
  const { a, P } = system((n - 1) * Rg, -n * n, null, 0, 30, { kind: 'collimate', d: 300 });
  const T = { eps: { v: 5 }, thk: { v: 0.2 }, rad: { v: 1 }, gap: { v: 0.5 }, feed: { v: 1 }, trials: 60, seed: 7 };
  const S = RF.rfSensitivity(a, P, T);
  // the hyperbola is exact for its plastic's index: the permittivity off either way puts phase error in, so the gain falls
  // both ways, and it matters most; a lens's thickness, its beam flat inside, all but nothing
  const row = kd => S.rows.find(r => r.kind === kd);
  assert.equal(S.rows[0].kind, 'eps');
  assert.ok(row('eps').up < -0.01 && row('eps').dn < -0.01, JSON.stringify(row('eps')));
  assert.ok(Math.abs(row('thk').up) < 1e-3 && Math.abs(row('thk').dn) < 1e-3, JSON.stringify(row('thk')));
  // an error of nothing changes nothing
  const items = RF.rfTolItems(a, P, T), c0 = RF.rfTolApply(a, P, items, items.map(() => 0));
  assert.ok(Math.abs(RF.rfTrace(c0.asm, c0.P, ghz).gain - RF.rfTrace(a, P, ghz).gain) < 1e-12);
  // the permittivity up by 5%: the index by √1.05
  const k = items.findIndex(e => e.kind === 'eps'), c1 = RF.rfTolApply(a, P, items, items.map((_, j) => (j === k ? 5 : 0)));
  assert.ok(Math.abs((n + c1.P.materials[0].dn) / n - Math.sqrt(1.05)) < 1e-12);
  const run = () => { const p = RF.rfMcPlan(a, P, T); while (!p.done) p.run(10); return p.builds; };
  const b1 = run(), b2 = run();
  assert.equal(b1.length, 60);
  assert.deepEqual(b1, b2);
  assert.ok(b1.every(b => b.worst <= b.at + 1e-12));
  // Wilson's interval: 5 of 10 is 23.7% to 76.3%
  const Y = RF.rfYield(Array.from({ length: 10 }, (_, i) => ({ worst: i < 5 ? 1 : 0 })), 0.5);
  assert.ok(Math.abs(Y.p - 0.5) < 1e-12 && Math.abs(Y.lo - 0.2366) < 1e-3 && Math.abs(Y.hi - 0.7634) < 1e-3, JSON.stringify(Y));
});

test('a graded-index disc: its grading holds its path, and designed to collimate it leaves the beam flat', async () => {
  const G = await import('../../src/core/grin.js');
  const grin = { f: 150, ghz, mat: 'PLA', fillMax: 100, fillMin: 15, profile: 'ideal', match: true };
  // the slab's path, centre index and fitted terms, against the disc's own sqrt(r² + f²) − f over its face
  const S = G.grinSlab(grin, 120);
  let worst = 0;
  for (let r = 0; r <= 60; r += 2) { const d = -(S.grad[0] * r ** 2 + S.grad[1] * r ** 4 + S.grad[2] * r ** 6) * S.T, want = Math.sqrt(r * r + 150 * 150) - 150; worst = Math.max(worst, Math.abs(d - want)); }
  assert.ok(worst < 0.01 * lam, 'path within ' + worst + ' mm');
  loadProject({ format: 'jekray', version: 1, elements: [{ type: 'mask', id: 'L', name: 'Disc', x: 0, y: 0, angle: 0, length: 120, grin, mmw: { part: true }, group: 'g' }],
    assemblies: [{ id: 'g', name: 'RF', ref: 'L', kind: 'rf', rf: { ghz, feed, goal: { kind: 'collimate', d: 300 } } }] });
  const a = ST.project.assemblies[0], P = D.designPrescription(a);
  RF.rfSyncCond(a, P);
  assert.equal(P.parts[0].kind, 'grin');
  const o = RF.rfSynth(a, P, { pi: 0, type: 'grin', mat: 'PLA', D: 120, place: 'keep', match: true });
  assert.ok(!o.error && o.f > 0 && o.t > 0);
  RF.rfGrinInto(P, 0, o.grin, 120);
  const t = RF.rfTrace(a, P, ghz);
  assert.ok(Math.abs(t.waist.at) < 1e-6, 'waist at ' + t.waist.at);
  assert.ok(t.apEff > 0.7 && t.phaseEff > 0.999 && t.refl > 0.99, JSON.stringify({ ap: t.apEff, ph: t.phaseEff, refl: t.refl }));
  // its least density raised to hold to the top of the band
  assert.ok(G.grinDesign(o.grin, 120).ghzMax >= a.rf.hi);
});

test('a zoned lens: steps a wave deep, thinner, the same at its zone frequency and slipping away from it', () => {
  const B = C.rfBeam(feed, ghz), z = feed.d + B.dz, Rg = z * (1 + (B.zR / z) ** 2), n = C.RF_MAT.PLA.n, R1 = (n - 1) * Rg, k1 = -n * n;
  const sg = r => r * r / R1 / (1 + Math.sqrt(1 - (1 + k1) * r * r / R1 / R1)), t = 2 + sg(100);
  const make = zoned => {
    loadProject({ format: 'jekray', version: 1, elements: [{ type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, diameter: 200, asphere: true, surfaces: [{ R: R1, k: k1 }, { R: null }], gaps: [t], materials: [{ glass: 'PLA' }], mmw: { part: true }, group: 'g', zoned }],
      assemblies: [{ id: 'g', name: 'RF', ref: 'L', kind: 'rf', rf: { ghz, feed, goal: { kind: 'collimate', d: 300 } } }] });
    const a = ST.project.assemblies[0], P = D.designPrescription(a); RF.rfSyncCond(a, P);
    return { a, P, el: ST.project.elements[0] };
  };
  // the smooth lens first (each loaded in turn: the trace finds its parts on the bench)
  const s = make(undefined), a0 = RF.rfTrace(s.a, s.P, ghz), s20 = RF.rfTrace(s.a, s.P, 20);
  const zz = make({ ghz }), Z = C.lensZones(zz.el);
  // a step is a wave of path at the zone frequency; the lens as cut lies between its thinnest and that plus one step
  assert.ok(Math.abs(Z.dz * (n - 1) - lam) < 1e-12);
  assert.ok(Z.steps.length >= 1 && Z.t(0) < t);
  for (let r = 0; r <= 100; r += 0.5) assert.ok(Z.t(r) >= Z.tMin - 1e-9 && Z.t(r) < Z.tMin + Z.dz + 1e-9, 'r ' + r);
  // at its zone frequency the beam is the smooth lens's and it absorbs less; traced as cut, its steps' walls shadow a share of the
  // beam and each zone (the smooth face moved back a step) defocuses its rays a little, where the smooth lens has no error
  const a1 = RF.rfTrace(zz.a, zz.P, ghz);
  assert.ok(Math.abs(a0.apEff - a1.apEff) < 1e-12 && a1.absorb > a0.absorb + 0.05, JSON.stringify([a0.apEff, a1.apEff, a0.absorb, a1.absorb]));
  assert.ok(a0.sigma < 1e-6 * lam && a0.shadow === 1 && a1.sigma / lam > 0.005 && a1.sigma / lam < 0.05 && a1.shadow < 0.99 && a1.shadow > 0.85, JSON.stringify([a0.sigma, a1.sigma / lam, a1.shadow]));
  // away from it each step slips the phase: an error that grows with the distance from it, and none for the smooth lens
  const e = f => RF.rfTrace(zz.a, zz.P, f).sigma / RF.rfTrace(zz.a, zz.P, f).lam;
  assert.ok(e(22) > 0.01 && e(20) > e(22) && e(26) > e(24) && e(28) > e(26), [e(20), e(22), e(24), e(26), e(28)].join(', '));
  assert.ok(s20.sigma / s20.lam < 1e-3);
});

test('the feed off the axis: the beam steered the other way by about the feed’s angle, costing more the further; the offset beam’s spill and aperture efficiency agree with the formulas on the axis', () => {
  const B = C.rfBeam(feed, ghz), z = feed.d + B.dz, Rg = z * (1 + (B.zR / z) ** 2), n = C.RF_MAT.HDPE.n;
  const at = off => { loadProject({ format: 'jekray', version: 1, elements: [{ type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, diameter: 120, asphere: true, surfaces: [{ R: (n - 1) * Rg, k: -n * n }, { R: null, k: 0 }], gaps: [30], materials: [{ glass: 'HDPE' }], group: 'g' }],
    assemblies: [{ id: 'g', name: 'RF', ref: 'L', kind: 'rf', rf: { ghz, feed: Object.assign({}, feed, { off }), goal: { kind: 'collimate', d: 300 } } }] });
    const a = ST.project.assemblies[0], P = D.designPrescription(a); RF.rfSyncCond(a, P); return { a, P, t: RF.rfTrace(a, P, ghz) }; };
  const t0 = at(0).t, t1 = at(20).t, t2 = at(40).t;
  assert.ok(Math.abs(t0.steer.squint) < 1e-9 && t0.steer.feedDeg === 0);
  // steered the other way, by less than the feed's angle for a thick lens (the deviation factor under 1), and more for a feed further off
  assert.ok(t1.steer.squint < 0 && t1.steer.feedDeg > 0, JSON.stringify(t1.steer));
  const bdf = -t1.steer.squint / t1.steer.feedDeg;
  assert.ok(bdf > 0.75 && bdf < 1, 'deviation factor ' + bdf);
  assert.ok(Math.abs(t2.steer.squint) > 1.8 * Math.abs(t1.steer.squint), 'twice the offset, about twice the angle');
  // the cost: the coma of the hyperbolic lens, growing with the offset
  assert.ok(t0.gain > t1.gain && t1.gain > t2.gain && t1.sigma > 0 && t2.sigma > 2 * t1.sigma * 0.9, JSON.stringify([t0.gain, t1.gain, t2.gain]));
  // the beam's centre on the layout: on the horn at its offset, through the first vertex, and leaving on the squint's side
  const s0 = t1.samples[0], sL = t1.samples[t1.samples.length - 1];
  assert.ok(Math.abs(s0.yc - 20) < 1e-9 && sL.yc < 0, JSON.stringify([s0.yc, sL.yc]));
  // the scan: against the feed on the axis, the loss nought there and growing; the beam's angle growing with the feed's
  const sc = RF.rfScan(at(0).a, at(0).P, ghz, 5);
  assert.equal(sc.length, 5);
  assert.ok(Math.abs(sc[0].loss) < 1e-9 && sc[4].loss < sc[2].loss && sc[2].loss < -1e-4, JSON.stringify(sc.map(r => r.loss)));
  assert.ok(Math.abs(sc[4].beamDeg) > Math.abs(sc[2].beamDeg) && Math.abs(sc[4].feedDeg - 25) < 0.5, JSON.stringify(sc.map(r => [r.feedDeg, r.beamDeg])));
  // the offset Gaussian's spill and aperture efficiency: the closed forms on the axis, and less through a shifted aperture
  assert.ok(Math.abs(RF.gaussPass(60, 40, 0) - (1 - Math.exp(-2 * 3600 / 1600))) < 1e-12 && Math.abs(RF.gaussPass(60, 40, 1e-9) - RF.gaussPass(60, 40, 0)) < 1e-3 && RF.gaussPass(60, 40, 20) < RF.gaussPass(60, 40, 0) - 0.02);
  assert.ok(Math.abs(RF.apertureEffOff(60, 40, Infinity, lam, 1e-9) - RF.apertureEff(60, 40, Infinity, lam)) < 1e-3 && RF.apertureEffOff(60, 40, Infinity, lam, 20) < 0.9 * RF.apertureEff(60, 40, Infinity, lam));
});

test('tolerances across the axis, and the compensator: a decentred lens mostly steers the beam; a feed distance error is made good by refocusing', () => {
  const B = C.rfBeam(feed, ghz), z = feed.d + B.dz, Rg = z * (1 + (B.zR / z) ** 2), n = C.RF_MAT.HDPE.n;
  const { a, P } = system((n - 1) * Rg, -n * n, null, 0, 30, { kind: 'collimate', d: 300 });
  const T = { dec: { v: 2 }, tilt: { v: 2 }, fdec: { v: 2 }, feed: { v: 10 }, eps: { on: false }, thk: { on: false }, rad: { on: false }, gap: { on: false }, trials: 20, seed: 3 };
  const items = RF.rfTolItems(a, P, T);
  assert.deepEqual(items.map(e => e.kind).sort(), ['dec', 'fdec', 'feed', 'tilt']);
  // a decentred lens: its faces moved across; a tilted one: both faces turned, the back carried round
  const cd = RF.rfTolApply(a, P, items, items.map(e => (e.kind === 'dec' ? 2 : 0)));
  assert.ok(cd.P.surfaces.every(s => Math.abs(s.dec[1] - 2) < 1e-12));
  const ct = RF.rfTolApply(a, P, items, items.map(e => (e.kind === 'tilt' ? 2 : 0)));
  assert.ok(Math.abs(ct.P.surfaces[0].tilt[0] - 2 * Math.PI / 180) < 1e-12 && Math.abs(ct.P.surfaces[1].dec[1] - 30 * Math.sin(2 * Math.PI / 180)) < 1e-9);
  // the feed moved across keeps its pointing: aim off, its angle the one it had (on the axis, nought)
  const cf = RF.rfTolApply(a, P, items, items.map(e => (e.kind === 'fdec' ? 2 : 0)));
  assert.ok(cf.asm.rf.feed.aim === false && Math.abs(cf.asm.rf.feed.ang) < 1e-12 && cf.asm.rf.feed.off === 2);
  const S = RF.rfSensitivity(a, P, T), row = k => S.rows.find(r => r.kind === k);
  // the beam turns with a decentred or tilted lens and a moved feed, costing next to nothing in gain; the feed distance costs most
  assert.ok(row('dec').moves > 0.3 && row('fdec').moves > 0.3 && row('tilt').moves > 0.01, JSON.stringify(S.rows));
  assert.ok(Math.abs(row('dec').worst) < 0.05 && row('feed').worst < -0.1, JSON.stringify(S.rows));
  // the compensator: the feed refocused for each build, the distance error comes to nothing; the nominal is refocused too
  const Sc = RF.rfSensitivity(a, P, Object.assign({}, T, { comp: true }));
  assert.ok(Sc.comp && Math.abs(Sc.rows.find(r => r.kind === 'feed').worst) < 0.01, JSON.stringify(Sc.rows));
  assert.ok(Sc.nominal >= S.nominal - 1e-9);
  // the compensator finds the design's own distance better than its neighbours when the design is at its best
  const d = RF.rfCompensate(a, P, ghz);
  assert.ok(d > 0 && Math.abs(d - feed.d) < 0.15 * feed.d + 5);
  // Monte Carlo with the compensator: repeatable
  const run = () => { const p = RF.rfMcPlan(a, P, Object.assign({}, T, { comp: true })); while (!p.done) p.run(10); return p.builds; };
  assert.deepEqual(run(), run());
});

test('the merit function: no terms is the efficiency across the band; a term with a target, sense and weight is reported and optimised to', () => {
  const B = C.rfBeam(feed, ghz), z = feed.d + B.dz, Rg = z * (1 + (B.zR / z) ** 2), n = C.RF_MAT.HDPE.n;
  const { a, P } = system((n - 1) * Rg, -n * n, null, 0, 30, { kind: 'collimate', d: 300 });
  // no terms: the residuals are 1 − efficiency at five frequencies, as the old merit was
  const prob0 = RF.rfOptProblem(a, P, { keys: [], flat: 0, edgeMin: 1, tMax: 0 }), f0 = prob0.res(prob0.x0);
  assert.equal(f0.terms.length, 5);
  f0.terms.forEach((t, k) => assert.ok(t.op === 'EFF' && Math.abs(t.r - (1 - f0.effs[k])) < 1e-12));
  const R0 = RF.rfMeritReport(a, P, { keys: [], ops: [] });
  assert.ok(!R0.own && R0.ops.length === 1 && R0.ops[0].at.length === 5 && Math.abs(R0.ops[0].share + R0.boundShare - 1) < 1e-9);
  // a term met exactly has no residual; one asked for more has its shortfall over its scale, weighted
  const t = RF.rfTrace(a, P, ghz);
  const ops = [{ op: 'GAIN', ghz, target: t.gain, weight: 2, sense: '>=' }, { op: 'TAPER', ghz, target: 5, weight: 1, sense: '=' }];
  const R1 = RF.rfMeritReport(a, P, { keys: [], ops });
  assert.ok(R1.own && Math.abs(R1.ops[0].share) < 1e-12 && R1.ops[1].share > 0.5, JSON.stringify(R1.ops.map(o => o.share)));
  const pr = RF.rfOptProblem(a, P, { keys: [], ops: [{ op: 'GAIN', ghz, target: t.gain + 3, weight: 2, sense: '>=' }] }), fr = pr.res(pr.x0);
  assert.ok(Math.abs(fr.terms[0].r - 2 * 3) < 1e-9, String(fr.terms[0].r));
  // optimised to an edge taper of 14 dB with the feed distance free: the feed moves in until the taper is met
  const taper = () => { const T = RF.rfTrace(a, P, ghz); return T.surf[T.surf.length - 1].taper; };
  const t0 = taper();
  const pr2 = RF.rfOptProblem(a, P, { keys: ['feed'], ops: [{ op: 'TAPER', ghz, target: 14, weight: 1, sense: '=' }] });
  let st = RF.rfOptStart(pr2);
  for (let i = 0; i < 100 && !st.done; i++) st = RF.rfOptStep(pr2, st);
  const c = pr2.at(st.x), T2 = RF.rfTrace(c.asm, c.P, ghz), got = T2.surf[T2.surf.length - 1].taper;
  assert.ok(Math.abs(got - 14) < 0.2 && Math.abs(t0 - 14) > 1, t0 + ' → ' + got);
  // the senses: at most and equal to
  assert.ok(RF.normRfMeritOps([{ op: 'PHASE', target: 0.05, sense: '<=' }])[0].sense === '<=' && RF.normRfMeritOps([{ op: 'NOPE' }]).length === 0);
});

test('an offset reflector in the RF designer: fed from the focus of its parent paraboloid the section leaves the beam flat, the axis out along the facing, the write-back puts the part where it was, and its offset is a variable', async () => {
  const A = await import('../../src/core/assembly.js'), M = await import('../../src/core/mask.js');
  for (const [h, angle] of [[120, 180], [60, 150], [-90, 30]]) {
    const m = { type: 'mirror', id: 'M', name: 'M', x: 10, y: -5, angle, length: 160, R: 300, k: -1, offset: h, metal: 'Al', mmw: { part: true }, group: 'g' };
    const F = A.mirrorFocus(m), [fx, fy] = M.toWorld(M.frame(m), F.x, F.y), L = Math.hypot(fx - m.x, fy - m.y);
    // the horn stood so its beam's phase centre at the section is the focus: R(z) = L at the section
    const B = C.rfBeam({ kind: 'corrugated', a: 15, L: 80 }, ghz), zc = (L + Math.sqrt(L * L - 4 * B.zR * B.zR)) / 2, dF = zc - B.dz;
    loadProject({ format: 'jekray', version: 1, elements: [m], assemblies: [{ id: 'g', name: 'RF', ref: 'M', kind: 'rf', rf: { ghz, feed: { kind: 'corrugated', a: 15, L: 80, d: dF }, goal: { kind: 'collimate', d: 300 } } }] });
    const a = ST.project.assemblies[0], P = D.designPrescription(a); RF.rfSyncCond(a, P);
    const s = P.surfaces[0], beta = 2 * Math.atan(Math.abs(h) / 300);
    // the axis in from the focus; the fold half the turn, the face's own axis the whole of it from the fold; the first-order power 1/2L
    assert.ok(Math.abs(Math.hypot(P.dir[0] * L - (m.x - fx), P.dir[1] * L - (m.y - fy))) < 1e-9, 'in from the focus');
    assert.ok(Math.abs(Math.abs(s.tilt[0]) - beta / 2) < 1e-12 && Math.abs(Math.abs(s.dtilt[0]) - beta / 2) < 1e-12 && Math.abs(s.pc + 1 / (2 * L)) < 1e-15, JSON.stringify([s.tilt, s.dtilt, s.pc, L]));
    assert.ok(Math.abs(Math.hypot(s.dec[1], s.dec[2]) - Math.hypot(F.sag0, h)) < 1e-9, 'the parent vertex off by the offset and its sag');
    const out = A.asmAxisAt(P, 50);
    assert.ok(Math.abs(out.d[0] - Math.cos(angle * Math.PI / 180)) < 1e-9 && Math.abs(out.d[1] - Math.sin(angle * Math.PI / 180)) < 1e-9, 'out along the facing');
    const t = RF.rfTrace(a, P, ghz);
    assert.ok(t.sigma / t.lam < 1e-9 && Math.abs(t.steer.squint) < 1e-9 && t.eff > 0.8, JSON.stringify([t.sigma / t.lam, t.steer.squint, t.eff]));
    // written back: where it was, as it was
    A.asmApply(a, P); const el = ST.project.elements[0];
    assert.ok(Math.hypot(el.x - 10, el.y + 5) < 1e-9 && Math.abs(el.angle - ((angle % 360) + 360) % 360) < 1e-9 && el.offset === h && el.R === 300 && el.k === -1, JSON.stringify(el));
    // the offset a variable: the parent's vertex moves, the power with it; committed, the part's centre stays, its offset the new one
    const vars = RF.rfOptVars(P).map(v => v.key);
    assert.ok(vars.includes('c:0') && vars.includes('k:0') && vars.includes('o:0'), vars.join());
    const prob = RF.rfOptProblem(a, P, { keys: ['o:0'] }), c2 = prob.at([h + 20]);
    const h2 = h + 20, L2 = Math.hypot(150 - h2 * h2 / 600, h2);
    assert.ok(c2.P.surfaces[0].sec.h === h2 && P.surfaces[0].sec.h === h && Math.abs(c2.P.surfaces[0].pc + 1 / (2 * L2)) < 1e-15, 'the clone alone changed, its power 1/2L for the new section');
    A.asmApply(a, c2.P);
    assert.ok(Math.hypot(el.x - 10, el.y + 5) < 1e-9 && el.offset === h + 20, JSON.stringify(el));
  }
  // a whole mirror on its axis: radius and conic are variables, no offset
  loadProject({ format: 'jekray', version: 1, elements: [{ type: 'mirror', id: 'M', name: 'M', x: 0, y: 0, angle: 180, length: 160, R: 300, k: -1, metal: 'Al', mmw: { part: true }, group: 'g' }], assemblies: [{ id: 'g', name: 'RF', ref: 'M', kind: 'rf', rf: { ghz, feed: { kind: 'corrugated', a: 15, L: 80, d: 150 }, goal: { kind: 'collimate', d: 300 } } }] });
  const a = ST.project.assemblies[0], P = D.designPrescription(a), keys = RF.rfOptVars(P).map(v => v.key);
  assert.deepEqual(keys, ['c:0', 'k:0', 'feed']);
});

test('configurations: a second band with its own feed distance; the merit adds both by weight, switching puts the other’s conditions and values on the bench, and the optimiser finds each configuration’s own feed distance', () => {
  const { a, P } = system(104, -2.7, null, 0, 30, { kind: 'collimate', d: 300 }, 'HDPE');
  assert.equal(RF.rfMcOf(a), null);
  assert.equal(RF.rfMcAdd(a, P), true);
  const M = RF.rfMcOf(a);
  assert.ok(M && M.configs.length === 2 && M.active === 0 && M.configs[1].rf.ghz === 24, 'two, copies of the design');
  // the second at 35 GHz with its feed 20 mm further; the air after the lens its own in each
  M.configs[1].rf.ghz = 35; M.configs[1].rf.lo = 33; M.configs[1].rf.hi = 37; M.configs[1].rf.feed.d = 170;
  assert.equal(RF.rfMcKey(a, P, 't:1', true), false, 'the air after the last surface is not a key');
  const m1 = RF.rfMeritReport(a, P, { keys: [], ops: [] }), one = RF.rfMeritReport(Object.assign({}, a, { rfMc: null }), P, { keys: [], ops: [] });
  // the active configuration's five efficiencies are reported; the merit holds both configurations' terms
  assert.ok(m1.effs.length === 5 && Math.abs(m1.mean - one.mean) < 1e-12, 'the active one’s band');
  const terms = RF.rfMeritTerms({ asm: a, P }, { ops: [] }).terms;
  assert.ok(terms.length === 10 && terms.filter(t => t.c === 1).length === 5 && Math.abs(terms[5].ghz - 33) < 1e-9, JSON.stringify(terms.map(t => [t.c, t.ghz])));
  // a term for one configuration alone counts there only; the weights share the residuals
  const t2 = RF.rfMeritTerms({ asm: a, P }, { ops: [{ op: 'TAPER', target: 11, weight: 1, sense: '=', c: 1 }] }).terms;
  assert.ok(t2.length === 5 && t2.every(t => t.c === 1), 'in configuration 2 only');
  M.configs[0].w = 3; M.configs[1].w = 1;
  const t3 = RF.rfMeritTerms({ asm: a, P }, { ops: [{ op: 'TAPER', target: 0, weight: 1, sense: '=' }] }).terms, v0 = t3.filter(t => t.c === 0)[0], v1 = t3.filter(t => t.c === 1)[0];
  assert.ok(Math.abs(v0.r / v0.value - Math.sqrt(0.75)) < 1e-9 && Math.abs(v1.r / v1.value - Math.sqrt(0.25)) < 1e-9, 'weighed by share: ' + [v0.r / v0.value, v1.r / v1.value]);
  // switching: the bench takes the second's conditions; back again, the first's; the feed's horn id stays
  a.rf.feed.id = 'horn';
  assert.equal(RF.rfMcSwitch(a, 1), true);
  assert.ok(a.rf.ghz === 35 && a.rf.feed.d === 170 && a.rf.feed.id === 'horn' && M.configs[0].rf.ghz === 24 && M.configs[0].rf.feed.d === 150, JSON.stringify(a.rf));
  assert.equal(RF.rfMcSwitch(a, 0), true);
  assert.ok(a.rf.ghz === 24 && a.rf.feed.d === 150, 'back');
  // the feed distance a variable: one in each configuration; optimised, each finds its own focus (the second further out than it started: the lens's power is the same, the phase centre moves with the frequency)
  const P2 = D.designPrescription(a), prob = RF.rfOptProblem(a, P2, { keys: ['feed'] });
  assert.deepEqual(prob.keys, ['feed@0', 'feed@1']);
  assert.deepEqual(prob.x0, [150, 170]);
  let st = RF.rfOptStart(prob); for (let i = 0; i < 40 && !st.done; i++) st = RF.rfOptStep(prob, st);
  const c = prob.at(st.x), r0 = RF.rfMeritTerms({ asm: a, P: P2 }, { ops: [] }).terms.reduce((q, t) => q + t.r * t.r, 0), r1 = RF.rfMeritTerms(c, { ops: [] }).terms.reduce((q, t) => q + t.r * t.r, 0);
  assert.ok(r1 < r0 && Math.abs(c.asm.rf.feed.d - c.asm.rfMc.configs[1].rf.feed.d) > 0.5 && a.rf.feed.d === 150 && a.rfMc.configs[1].rf.feed.d === 170, JSON.stringify([r0, r1, c.asm.rf.feed.d, c.asm.rfMc.configs[1].rf.feed.d]));
  // a key of its own in each: the lens's centre thickness; the second configuration keeps its value when set apart
  assert.equal(RF.rfMcKey(a, P2, 't:0', true), true);
  M.configs[1].v['t:0'] = 40;
  assert.ok(Math.abs(RF.rfCfgP(a, P2, 1).gaps[0] - 40) < 1e-12 && Math.abs(P2.gaps[0] - 30) < 1e-12 && RF.rfMcValue(a, P2, 1, 't:0') === 40);
  // removed down to one: no configurations left
  assert.equal(RF.rfMcRemove(a, 1), true);
  assert.equal(RF.rfMcOf(a), null);
});

test('the further analyses: the phase map’s RMS is the phase error figure; the cross-polar trace gives a paraboloid on its axis none and an offset section its own, a lens a little from its faces; the beam to the goal; the design over temperature', async () => {
  const A = await import('../../src/core/assembly.js'), M = await import('../../src/core/mask.js');
  const { a, P } = system(104, -2.7, null, 0, 30, { kind: 'collimate', d: 300 }, 'HDPE');
  const t = RF.rfTrace(a, P, ghz), pm = RF.rfPhaseMap(a, P, ghz, 31);
  assert.ok(Math.abs(pm.rms - t.sigma / t.lam) < 0.15 * t.sigma / t.lam + 1e-5 && pm.pv > pm.rms && Array.from(pm.W).filter(isFinite).length > 600, JSON.stringify([pm.rms, t.sigma / t.lam, pm.pv]));
  const xp = RF.rfCrossPol(a, P, ghz, 25);
  assert.ok(xp.pol.y.frac < -30 && xp.pol.y.frac > -60 && Math.abs(xp.pol.y.frac - xp.pol.x.frac) < 0.5 && xp.horn < -100, 'a lens: a little cross-polar from Fresnel, the same either way: ' + JSON.stringify([xp.pol.y.frac, xp.pol.x.frac, xp.horn]));
  // the beam to the goal: three lines, the waist of a collimated beam behind the lens, the goal's plane at 300
  const wv = RF.rfWaistView(a, P);
  assert.ok(wv.lines.length === 3 && wv.lines[1].waist.at < 0 && wv.goal.at === 300 && wv.lines[1].ws.every((w, k) => k === 0 || w >= wv.lines[1].ws[k - 1] - 1e-9), 'the beam spreads from a virtual waist');
  // over temperature in aluminium: the gain follows the aperture (up as it warms), the drift per kelvin small; refocused against the refocused nominal
  const th = RF.rfThermal(a, P, [-20, 20, 60], 23.6e-6);
  assert.ok(th.rows.length === 3 && Math.abs(th.rows[1].dfig) < 1e-9 && th.rows[2].dfig > 0 && th.rows[0].dfig < 0 && Math.abs(th.drift) < 0.01 && Math.abs(th.rows[1].comp.dfig) < 1e-6 && th.missing.length === 0, JSON.stringify(th.rows.map(r => [r.T, r.dfig, r.comp.dfig])));
  // mirrors: a paraboloid fed on its axis by a balanced horn makes no cross-polar field; its offset section does, about −20 dB for this angle, four-lobed (its peak well above its power share)
  for (const [h, want] of [[0, null], [120, [-26, -18]]]) {
    const m = { type: 'mirror', id: 'M', name: 'M', x: 10, y: -5, angle: 180, length: 160, R: 300, k: -1, offset: h, metal: 'Al', mmw: { part: true }, group: 'g' };
    const F = A.mirrorFocus(m), [fx, fy] = M.toWorld(M.frame(m), F.x, F.y), L = Math.hypot(fx - m.x, fy - m.y);
    loadProject({ format: 'jekray', version: 1, elements: [m], assemblies: [{ id: 'g', name: 'RF', ref: 'M', kind: 'rf', rf: { ghz, feed: { kind: 'corrugated', a: 15, L: 80, d: L }, goal: { kind: 'collimate', d: 300 } } }] });
    const am = ST.project.assemblies[0], Pm = D.designPrescription(am); RF.rfSyncCond(am, Pm);
    const x = RF.rfCrossPol(am, Pm, ghz, 25), peak = Math.max(...Array.from(x.pol.y.map).filter(isFinite));
    if (!want) assert.ok(x.pol.y.frac < -90, 'none on the axis: ' + x.pol.y.frac);
    else assert.ok(x.pol.y.frac > want[0] && x.pol.y.frac < want[1] && peak > x.pol.y.frac + 3, 'the section: ' + JSON.stringify([x.pol.y.frac, peak]));
  }
});
