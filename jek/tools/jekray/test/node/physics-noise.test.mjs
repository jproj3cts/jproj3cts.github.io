/* Noise and power bookkeeping regressions. The electronics filter a detector's noise through a single
   pole at its bandwidth (elec.js), so white noise through it integrates to the equivalent noise
   bandwidth (pi/2) B: the static readouts (a photodiode's, a fibre photodetector's, a video
   detector's, a mixer's) count the same, and agree with the rms of the electronics' own output. A
   feed horn's beam carries only its modes' share g of its power: an upconverter's drive, S21 and the
   link budget count it. A mixer's noise is a sideband's (SSB) or both sidebands' (DSB). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const TRACE = await import('../../src/engines/trace.js');
const C = await import('../../src/core/rf.js');
const E = await import('../../src/engines/elec.js');
const { detectorReading, rfCoupling } = await import('../../src/engines/fibre-face.js');
const { pdSignal } = await import('../../src/engines/detector.js');
const { rfSweep, linkBudget } = await import('../../src/engines/rf-sweep.js');
const { portsOf } = await import('../../src/engines/fibre.js');

const kB = 1.380649e-23, q = 1.602176634e-19;
const load = (elements, fibres) => { loadProject({ format: 'jekray', version: 1, name: 'noise', elements, fibres: fibres || [], minPower: 1e-6 }); TRACE.setLastTraceKey(null); TRACE.traceScene(); };
const byId = id => ST.project.elements.find(e => e.id === id);
const rms = S => E.elecNoiseRms(S, 1e-2, 1e10);              // the electronics' own output noise, over their whole grid
const near = (a, b, tol, what) => assert.ok(Math.abs(a / b - 1) < tol, what + ': ' + a + ' vs ' + b);

test('a free-space photodiode: its noise over (pi/2) B, as the electronics’ single pole gives it', () => {
  load([
    { type: 'source', id: 'L', name: 'Laser', x: 0, y: 0, angle: 0, wavelength: 1064, power: 1, gauss: true, w0: 0.3 },
    { type: 'detector', id: 'D', name: 'PD', x: 50, y: 0, angle: 180, material: 'custom', resp: 0.5, gain: 1e4, bandwidth: 1e6, dark: 1, ampNoise: 2 }]);
  const el = byId('D'), r = detectorReading(el), Bn = Math.PI / 2 * el.bandwidth, I = r.mA * 1e-3;
  assert.ok(I > 1e-4, 'light on it: ' + I);
  const i2 = 2 * q * (I + el.dark * 1e-9) * Bn + 4 * kB * 295 * Bn / el.gain + (el.ampNoise * 1e-12) ** 2 * Bn;
  near(r.noiseI, Math.sqrt(i2), 1e-12, 'noise current');
  near(r.noiseV, Math.sqrt(i2) * el.gain, 1e-12, 'noise volts');
  // the electronics' output, integrated: the same figure (to the grid's accuracy)
  near(rms(E.ELEC.detSignalFull(el)), r.noiseV, 0.02, 'static against the electronics');
});

test('a fibre photodetector behind an amplifier: shot, thermal and ASE beat noise over (pi/2) B, agreeing with the electronics', () => {
  const demo = fs.readFileSync(new URL('../../../demos/fibre-amplifier.jekray', import.meta.url), 'utf8');
  loadProject(JSON.parse(demo)); TRACE.setLastTraceKey(null); TRACE.traceScene();
  const el = ST.project.elements.find(e => e.type === 'fcomp' && e.kind === 'pd');
  el.bandwidth = 1e7;                                       // well inside the electronics' 10 GHz grid, so their integral misses no tail
  TRACE.setLastTraceKey(null); TRACE.traceScene();
  const S = pdSignal(el), N = S.noise;
  assert.ok(N && N.ase > 0, 'ASE reaches it');
  near(S.Bn, Math.PI / 2 * el.bandwidth, 1e-15, 'Bn');
  assert.ok(N.parts.sigAse > 0 && N.parts.aseAse > 0, 'beat noise');
  if (!el.diode) near(N.parts.thermal, 4 * kB * 295 * S.Bn / el.gain, 1e-12, 'thermal');
  near(rms(E.ELEC.detSignalFull(el)), N.V, 0.03, 'static against the electronics');
});

/* a horn into a receiver 120 mm off, as the RF suite sets it */
const horn = (mmw) => ({ type: 'source', id: 'H', name: 'Horn', x: 0, y: 0, angle: 0, rays: 3, mmw: Object.assign({ kind: 'smooth', ghz: 150, dbm: 0, a: 7.5, L: 60 }, mmw || {}) });
const rx = mmw => ({ type: 'detector', id: 'R', name: 'Rx', x: 120.37, y: 0, angle: 180, material: 'custom', resp: 0.5, gain: 1e4, vmax: 1e3, mmw: Object.assign({ kind: 'corrugated', a: 7.5, L: 60 }, mmw) });

test('a video detector: NEP over (pi/2) vbw, agreeing with the electronics', () => {
  load([horn(), rx({ rx: 'video', rv: 1000, nep: 5, vbw: 1 })]);
  const el = byId('R'), r = detectorReading(el), Bn = Math.PI / 2 * 1e6;
  near(r.noiseV, 1000 * 5e-12 * Math.sqrt(Bn), 1e-12, 'noise volts');
  near(r.mds, 5e-12 * Math.sqrt(Bn) * 1e3, 1e-12, 'mds');
  near(rms(E.ELEC.detSignalFull(el)), r.noiseV, 0.02, 'static against the electronics');
});

test('a mixer: k Tsys over (pi/2) ifbw, an rms noise voltage, DSB counting both sidebands', () => {
  const m = { rx: 'mixer', lo: 149, cl: 6, trx: 1000, tant: 295, ifbw: 10 }, g = Math.pow(10, -0.6), Bn = Math.PI / 2 * 10e6;
  load([horn(), rx(m)]);
  const el = byId('R');
  assert.equal(el.mmw.sideband, 'ssb', 'SSB by default');
  const s = detectorReading(el), Pn = kB * 1295 * Bn * 1e3;
  near(s.mds, Pn, 1e-12, 'SSB mds');
  near(s.noiseV, Math.sqrt(50 * Pn * 1e-3 * g), 1e-12, 'SSB noise, V rms');
  near(s.V, Math.sqrt(2 * 50 * s.mw * 1e-3 * g), 1e-12, 'the IF tone, V peak');
  const So = E.ELEC.detSignalFull(el);
  near(rms(So), s.noiseV, 0.02, 'SSB static against the electronics');
  load([horn(), rx(Object.assign({ sideband: 'dsb' }, m))]);
  const d = detectorReading(byId('R')), Do = E.ELEC.detSignalFull(byId('R'));
  near(d.mds, 2 * s.mds, 1e-12, 'DSB mds');
  assert.ok(Math.abs(d.floor - s.floor - 10 * Math.log10(2)) < 1e-9, 'floor +3 dB');
  assert.ok(Math.abs(s.snr - d.snr - 10 * Math.log10(2)) < 1e-9, 'a line in one sideband: 3 dB less SNR');
  near(d.mw, s.mw, 1e-12, 'the signal alike');
  near(rms(Do), d.noiseV, 0.02, 'DSB static against the electronics');
  near(rms(Do), Math.SQRT2 * rms(So), 1e-9, 'the electronics’ DSB noise, twice the power');
});

test('an upconverter sends the IF power times its modes’ share g, as a carrier at its power', () => {
  // the same carrier power two ways: an upconverter driven by 1 V DC into 50 ohm less 6 dB, and a horn set to that power
  const P = 1000 / 50 * Math.pow(10, -0.6), vid = { rx: 'video', rv: 1000, nep: 5, vbw: 1 };
  const out = () => E.ELEC.detSignalFull(byId('R')).dc;
  const els = [horn({ tx: 'up', cl: 6, dbm: 10 * Math.log10(P) }), rx(vid), { type: 'elec', kind: 'dc', id: 'V', name: 'V', x: -60, y: 40, v: 1 }];
  load(els);
  const H = byId('H'), k = portsOf(H).length - E.elecExtra(H).length;     // its IF in, after any other ports
  load(els, [{ a: ['V', 0], b: ['H', k], wire: true }]);
  const up = out();
  load([horn({ dbm: 10 * Math.log10(P) }), rx(vid)]);
  const cw = out();
  assert.ok(C.RF_HORNS.smooth.g < 0.95, 'a smooth-wall horn loses some: g ' + C.RF_HORNS.smooth.g);
  near(up, cw, 1e-6, 'video volts, upconverter against a carrier');
});

test('S21 and the link budget start from the power the horn is set to: the horn’s mode share is a row', () => {
  load([horn(), rx({ rx: 'video', span: 10, points: 5 })]);
  const el = byId('R'), Cp = rfCoupling(el), g = C.RF_HORNS.smooth.g;
  const S = rfSweep(el), mid = S.ghz.findIndex(f => Math.abs(f - 150) < 1e-9);
  assert.ok(Math.abs(S.s21[mid] - 10 * Math.log10(Cp.mw / 1)) < 1e-6, 'S21 at 150 GHz over the 0 dBm set: ' + S.s21[mid]);
  const L = linkBudget(el), hm = L.rows.find(r => r.note === 'horn mode');
  assert.ok(hm && Math.abs(hm.db - 10 * Math.log10(g)) < 1e-12, 'a horn mode row of 10 log g');
  near(L.inMw, 1, 1e-12, 'launched: the set power');
  assert.ok(Math.abs(L.total - 10 * Math.log10(Cp.mw)) < 1e-9, 'the whole: ' + L.total);
  // the rows add up to the whole
  const sum = L.rows.reduce((a, r) => a + r.db, 0);
  assert.ok(Math.abs(sum - L.total) < 0.05, 'rows ' + sum + ' against the whole ' + L.total);
});
