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
  const n = 1.526, nm = C.C_NM_GHZ / ghz, coat = { label: 'Matching layer', design: nm, layers: [{ n: Math.sqrt(n), d: nm / (4 * Math.sqrt(n)) }] };
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
