/* The lens antenna's figures against closed forms: a uniformly lit round aperture (its
   directivity 4 pi A / lambda^2, half-power width 1.029 lambda / D, first sidelobe -17.57 dB),
   the Gaussian-lit aperture's best taper and spillover efficiency (81.5% at about an 11 dB edge
   taper), and a curved wavefront's loss of directivity. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { lensAntenna, steerField } = await import('../../src/core/antenna.js');

test('a uniformly lit aperture: the most directivity, its beamwidth and its first sidelobe', () => {
  const lam = 12.5, a = 60, A = lensAntenna({ w: 1e6, R: Infinity, a, lam });
  assert.ok(Math.abs(A.eta.ap - 1) < 1e-3, 'aperture efficiency ' + A.eta.ap);
  const want = 1.029 * lam / (2 * a) * 180 / Math.PI;
  assert.ok(Math.abs(A.hpbw / want - 1) < 0.01, 'half-power width ' + A.hpbw + ' against ' + want);
  assert.ok(Math.abs(A.sll + 17.57) < 0.1, 'first sidelobe ' + A.sll);
});

test('a Gaussian-lit aperture: taper times spillover is best, about 81.5%, near an 11 dB edge taper', () => {
  const lam = 12.5, a = 60;
  let best = { e: 0 };
  for (let te = 4; te <= 20; te += 0.1) {
    const w = a / Math.sqrt(te / 8.686), A = lensAntenna({ w, R: Infinity, a, lam }), e = A.eta.taper * A.eta.spill;
    if (e > best.e) best = { e, te, A };
  }
  assert.ok(Math.abs(best.e - 0.8145) < 0.003, 'best efficiency ' + best.e);
  assert.ok(Math.abs(best.te - 10.9) < 0.6, 'at an edge taper of ' + best.te.toFixed(1) + ' dB');
  // and the gain is the directivity less spillover (no lens loss here)
  assert.ok(Math.abs(best.A.G / (best.A.D * best.A.eta.spill) - 1) < 1e-9);
});

test('a wavefront left curved costs directivity; the lens’s loss costs gain, not directivity', () => {
  const lam = 12.5, a = 60, w = 40, flat = lensAntenna({ w, R: Infinity, a, lam });
  // a quarter wave of curvature at the rim: R = a^2 / (2 x lambda/4)
  const bent = lensAntenna({ w, R: a * a / (lam / 2), a, lam });
  assert.ok(bent.eta.phase < 0.95 && bent.D < flat.D && Math.abs(flat.eta.phase - 1) < 1e-9, 'phase efficiency ' + bent.eta.phase);
  const lossy = lensAntenna({ w, R: Infinity, a, lam, T: () => 0.5 });
  assert.ok(Math.abs(lossy.D / flat.D - 1) < 1e-9 && Math.abs(lossy.G / flat.G - 0.5) < 1e-9, 'a uniform loss halves the gain only');
});

/* steering: the aperture field across the whole disc, from the horn's spherical wavefront */
const hyper = f => r => -(Math.sqrt(r * r + f * f) - f);          // an ideal thin lens's path, focus f
test('steering on the axis: the whole-disc field agrees with the round model, and a tilted plane wave leaves at its tilt', () => {
  const lam = 12.5, a = 60, f = 120, w = 40;
  const S = steerField({ w, R: f, yh: 0, sb: 0, a, lam, path: hyper(f) });
  // the round model takes the wavefront to second order only; the disc's exact sphere flattens a little better
  const A = lensAntenna({ w, R: f, a, lam, P: hyper(f), gainOnly: true });
  assert.ok(Math.abs(10 * Math.log10(S.G / A.G)) < 0.1, 'on the axis ' + (10 * Math.log10(S.G)).toFixed(3) + ' against ' + A.Gdbi.toFixed(3));
  assert.ok(Math.abs(S.beam) < 1e-6, 'pointing ' + S.beam);
  // a uniform plane wave arriving 10 degrees off leaves at 10 degrees, its gain down by its projected area and obliquity
  const flat = steerField({ w: 1e6, R: Infinity, yh: 0, sb: 0, a, lam, path: () => 0 });
  const tilt = steerField({ w: 1e6, R: Infinity, yh: 0, sb: Math.sin(10 * Math.PI / 180), a, lam, path: () => 0 });
  assert.ok(Math.abs(tilt.beam - 10) < 0.05, 'beam at ' + tilt.beam);
  const c = Math.cos(10 * Math.PI / 180), want = 10 * Math.log10(c * ((1 + c) / 2) ** 2);
  assert.ok(Math.abs(10 * Math.log10(tilt.G / flat.G) - want) < 0.02, 'tilt loss ' + 10 * Math.log10(tilt.G / flat.G) + ' against ' + want);
});

test('a feed off the axis steers the beam the other way, a little less far; a faster lens loses more and its coma lobe rises', () => {
  const lam = 12.5, a = 150, w = 100;
  const scan = (f, deg) => {
    const ref = steerField({ w, R: f, yh: 0, sb: 0, a, lam, path: hyper(f) });
    const S = steerField({ w, R: f, yh: 0, sb: -Math.sin(deg * Math.PI / 180), a, lam, path: hyper(f) });
    return { beam: -S.beam, loss: 10 * Math.log10(S.G / ref.G), lobe: S.lobe, ref: ref.lobe };
  };
  const slow = scan(300, 10), fast = scan(150, 10), far = scan(300, 20);
  assert.ok(slow.beam > 8.5 && slow.beam < 10, 'beam deviation ' + slow.beam / 10);
  assert.ok(fast.beam < slow.beam, 'a faster lens deviates less');
  assert.ok(fast.loss < slow.loss - 0.3 && far.loss < slow.loss - 0.5, 'scan loss ' + [slow.loss, fast.loss, far.loss]);
  assert.ok(fast.lobe > fast.ref + 10, 'coma lobe ' + fast.lobe + ' against ' + fast.ref + ' on the axis');
});
