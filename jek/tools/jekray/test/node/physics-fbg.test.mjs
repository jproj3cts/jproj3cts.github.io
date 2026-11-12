/* The fibre Bragg grating (core/fbg.js) against coupled-mode theory's closed forms (Erdogan 1997): the peak
   tanh^2(kappa L), the first zeros, no loss, reciprocity, the delay at the band's centre, the piecewise-uniform
   matrices against the closed form, apodised and chirped gratings, the grating in a fibre network (both ports, the
   delay as a modulation's phase reads it), and a bench from before the grating had a length. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/core/constants.js';                              // first, before any stand-in: Node is not a page
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const STATE = await import('../../src/state/project.js');
const { loadProject } = await import('../../src/state/elements.js');
const TRACE = await import('../../src/engines/trace.js');
const { pdNetMw, pdSignal } = await import('../../src/engines/detector.js');
const { fbgRT, fbgAt, fbgBand, fbgProfile } = await import('../../src/core/fbg.js');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' vs ' + b);
const P = z => z[0] * z[0] + z[1] * z[1];
const LB = 1550, N = 1.468, C_MM_PS = 0.299792458;
// a grating of length L (mm) with kappa L at the Bragg wavelength
const grating = (kL, L, o) => Object.assign({ centre: LB, len: L, dn: kL * LB * 1e-6 / (Math.PI * L), vis: 1, neff: N }, o || {});

const fc = (kind, name, o) => Object.assign({ type: 'fcomp', kind, name, id: name, x: 0, y: 0, angle: 0 }, o || {});
const fnet = (els, fibres) => ({ format: 'jekray', version: 1, name: 'fbg', elements: els, fibres: fibres.map(([a, pa, b, pb]) => ({ a: [a, pa], b: [b, pb], len: 1, loss: 0 })) });
const el = name => STATE.project.elements.find(e => e.name === name);
const run = data => { loadProject(JSON.parse(JSON.stringify(data))); TRACE.setLastTraceKey(null); TRACE.traceScene(); };
// a laser into a circulator, the grating on its port 2 (turned round: flip), a photodiode behind the grating (T) and on port 3 (R)
const onCirc = (G, nm, flip, extra) => fnet([fc('laser', 'L', { power: 1, wavelength: nm }), ...(extra || []), fc('circ', 'C', { loss: 0, iso: 200 }), G, fc('pd', 'T'), fc('pd', 'R')],
  [extra ? ['L', 0, extra[0].name, 0] : ['L', 0, 'C', 0], ...(extra ? [[extra[0].name, 1, 'C', 0]] : []), ['C', 1, 'G', flip ? 1 : 0], ['G', flip ? 0 : 1, 'T', 0], ['C', 2, 'R', 0]]);

test('peak reflectance is tanh^2(kappa L), from weak to strong', () => {
  for (const kL of [0.1, 0.5, 1, 2, 4, 8]) for (const L of [2, 10]) {
    const G = grating(kL, L), want = Math.tanh(kL) ** 2;
    near(P(fbgRT(G, LB).r1), want, 1e-13, 'kL ' + kL);
    near(P(fbgRT(G, LB).t), 1 / Math.cosh(kL) ** 2, 1e-13 / Math.cosh(kL) ** 2 + 1e-18, 'transmitted, kL ' + kL);
    near(fbgBand(G).kL, kL, 1e-12, 'the readout’s kL'); near(fbgBand(G).peak, want, 1e-13, 'the readout’s peak');
  }
  // however strong: no overflow
  const S = fbgRT(grating(2000, 1000), LB);
  near(P(S.r1), 1, 1e-15, 'kL 2000'); assert.ok(S.t.every(Number.isFinite));
  // and through a bench: the reflected light on the circulator's third port
  run(onCirc(fc('fbg', 'G', grating(2, 10)), LB));
  near(pdNetMw(el('R')), Math.tanh(2) ** 2, 1e-13, 'on the bench');
  assert.equal(el('G').model, 'cmt');
});

test('the first zeros are where gamma L = i pi, and the band between them', () => {
  for (const kL of [0.5, 2, 8]) {
    const L = 10, G = grating(kL, L);
    // sigma^2 = kappa^2 + (pi / L)^2, with kappa = pi dn / lambda: by bisection either side
    const f = nm => { const lam = nm * 1e-6, s = 2 * Math.PI * N * (1 / lam - 1 / (LB * 1e-6)), k = Math.PI * G.dn / lam; return s * s - k * k - (Math.PI / L) ** 2; };
    const root = (a, b) => { for (let i = 0; i < 200; i++) { const m = 0.5 * (a + b); if (f(a) * f(m) <= 0) b = m; else a = m; } return 0.5 * (a + b); };
    const B = fbgBand(G), lo = root(LB - B.zeros, LB), hi = root(LB, LB + B.zeros);
    assert.ok(P(fbgRT(G, lo).r1) < 1e-20 && P(fbgRT(G, hi).r1) < 1e-20, 'nothing reflected at the zeros, kL ' + kL);
    near(P(fbgRT(G, lo).t), 1, 1e-12, 'all of it through');
    // the panel's figure, lambda^2 sqrt(kL^2 + pi^2) / (pi n L), is the band to first order in its width
    near(B.zeros, hi - lo, 1e-6 * (hi - lo), 'band between first zeros, kL ' + kL);
    // halfway in from the zero even the weakest reflects a good part of its peak (sinc^2(pi/2) = 0.405); just outside the zero it rises again
    assert.ok(P(fbgRT(G, lo + 0.5 * (LB - lo)).r1) > 0.4 * Math.tanh(kL) ** 2);
    assert.ok(P(fbgRT(G, lo - 0.2 * (LB - lo)).r1) > 1e-4);
    // the width at half the peak lies inside the zeros and is where the reflectance is half
    assert.ok(B.fwhm > 0 && B.fwhm < B.zeros);
  }
  const G = grating(2, 10), B = fbgBand(G);
  near(P(fbgRT(G, LB + B.fwhm / 2).r1), B.peak / 2, 2e-4, 'half the peak at half the width');
});

test('no loss and reciprocal: uniform, apodised and chirped, across the band', () => {
  const kinds = [{}, { apod: 'gauss' }, { apod: 'cos' }, { chirp: 0.5 }, { chirp: -2, apod: 'gauss' }];
  for (const o of kinds) for (const kL of [0.5, 2, 6]) {
    const G = grating(kL, 10, o);
    let worst = 0, off = 0;
    for (let i = 0; i <= 400; i++) {
      const nm = LB - 0.8 + 1.6 * i / 400, S = fbgRT(G, nm);
      worst = Math.max(worst, Math.abs(P(S.r1) + P(S.t) - 1), Math.abs(P(S.r2) + P(S.t) - 1));
      // S = [[r1, t], [t, r2]] is symmetric as written (one t both ways); unitary too if r1 t* + t r2* = 0
      off = Math.max(off, Math.hypot(S.r1[0] * S.t[0] + S.r1[1] * S.t[1] + S.t[0] * S.r2[0] + S.t[1] * S.r2[1], S.r1[1] * S.t[0] - S.r1[0] * S.t[1] + S.t[1] * S.r2[0] - S.t[0] * S.r2[1]));
    }
    assert.ok(worst < 1e-11, 'power kept: ' + JSON.stringify(o) + ' kL ' + kL + ': ' + worst);
    assert.ok(off < 1e-11, 'unitary: ' + JSON.stringify(o) + ' kL ' + kL + ': ' + off);
  }
  // a symmetric grating reflects the same from both ends; a chirped one the same power, with another phase
  const U = fbgRT(grating(2, 10, { apod: 'cos' }), LB + 0.03), Ch = fbgRT(grating(2, 10, { chirp: 1 }), LB + 0.03);
  near(Math.hypot(U.r1[0] - U.r2[0], U.r1[1] - U.r2[1]), 0, 1e-12, 'symmetric');
  near(P(Ch.r1), P(Ch.r2), 1e-12, 'chirped: the same reflectance');
  assert.ok(Math.hypot(Ch.r1[0] - Ch.r2[0], Ch.r1[1] - Ch.r2[1]) > 1e-3, 'chirped: not the same phase');
  // on a bench, either way round: the same transmitted and reflected power, and all of it accounted for
  for (const o of [{}, { chirp: 1, apod: 'gauss' }]) for (const nm of [LB, LB + 0.04, LB - 0.11]) {
    const G = fc('fbg', 'G', grating(1.5, 10, o)), out = [];
    for (const flip of [false, true]) { run(onCirc(G, nm, flip)); out.push([pdNetMw(el('R')), pdNetMw(el('T'))]); }
    near(out[0][1], out[1][1], 1e-13, 'T either way');
    near(out[0][0], out[1][0], 1e-12, 'R either way');
    near(out[0][0] + out[0][1], 1, 1e-12, 'R + T'); near(out[1][0] + out[1][1], 1, 1e-12, 'R + T, turned round');
  }
});

test('sections of a uniform grating multiply to the closed form', () => {
  for (const kL of [0.5, 2, 8]) for (const d of [-0.3, -0.07, 0, 0.02, 0.15]) {
    const A = fbgRT(grating(kL, 10), LB + d), B = fbgRT(grating(kL, 10, { chirp: 1e-13 }), LB + d);
    for (const k of ['r1', 'r2', 't']) near(Math.hypot(A[k][0] - B[k][0], A[k][1] - B[k][1]), 0, 1e-9, k + ' kL ' + kL + ' at ' + d);
  }
});

test('group delay: n tanh(kappa L) / (kappa c) at the centre, a length of fibre far from the band', () => {
  for (const kL of [0.2, 1, 2, 5]) {
    const L = 10, G = grating(kL, L), A = fbgAt(G, LB), want = N * Math.tanh(kL) / (kL / L);       // mm of path
    for (const k of ['r1', 'r2', 't']) near(A[k].dl, want, 1e-6 * want, k + ' delay, kL ' + kL);
    near(fbgBand(G).delay, want / C_MM_PS, 1e-6 * want / C_MM_PS, 'the readout’s delay (ps)');
  }
  // a weak grating reflects from all along it: half its length there and back, n L
  near(fbgAt(grating(0.01, 10), LB).r1.dl, N * 10, 1e-3);
  // far off the band it is a length of fibre: delay n L, and of dispersion only the ripple of what little it
  // still reflects, (kappa / 2 sigma)^2 (2 n L / c)^2, a thousandth of the dispersion at the band's edge
  const F = fbgAt(grating(1, 10), LB + 40).t, sg = 2 * Math.PI * N * (1 / (LB + 40) - 1 / LB) * 1e6, ripple = (0.1 / (2 * sg)) ** 2 * (2 * N * 10 / (C_MM_PS * 1e-3)) ** 2;
  near(F.dl, N * 10, 1e-3); assert.ok(Math.abs(F.gdd) < 2 * ripple && ripple < 2000, 'little dispersion off the band: ' + F.gdd + ' fs^2 against ' + ripple);
  assert.ok(Math.abs(fbgAt(grating(1, 10), LB + 0.07).t.gdd) > 1e6);
  // the dispersion is the delay's slope: against the delay either side
  const G = grating(2, 10), nm = LB + 0.05, w = 2 * Math.PI * 299.792458 / nm, dw = 1e-7 * w;       // rad/fs
  const tau = x => fbgAt(G, 2 * Math.PI * 299.792458 / x).r1.dl / (C_MM_PS * 1e-3);                  // fs
  const gdd = (tau(w + dw) - tau(w - dw)) / (2 * dw), got = fbgAt(G, nm).r1.gdd;
  near(got, gdd, 1e-4 * Math.abs(gdd), 'GDD');
});

test('apodised and chirped gratings', () => {
  // unchirped, the sections' couplings add at the centre: tanh^2 of the summed kappa
  for (const apod of ['gauss', 'cos']) {
    const G = grating(3, 10, { apod }), B = fbgBand(G);
    let m = 0; for (let i = 0; i < 100; i++) m += fbgProfile(apod, (i + 0.5) / 100 - 0.5) / 100;
    near(B.kL, 3 * m, 1e-12); near(P(fbgRT(G, LB).r1), Math.tanh(B.kL) ** 2, 1e-12, apod + ' peak');
    assert.equal(B.zeros, null);
    // side lobes: the uniform grating of the same summed coupling has far higher ones
    const lobes = H => { let top = 0; for (let i = 0; i <= 2000; i++) { const nm = LB + 0.25 + 0.75 * i / 2000; top = Math.max(top, P(fbgRT(H, nm).r1)); } return top; };
    assert.ok(lobes(G) < 0.02 * lobes(grating(B.kL, 10)), apod + ' side lobes ' + lobes(G) + ' against ' + lobes(grating(B.kL, 10)));
  }
  near(fbgProfile('cos', 0.5), 0, 1e-15); near(fbgProfile('gauss', 0.25), 0.5, 1e-15); near(fbgProfile('none', 0.3), 1, 0);
  // a chirp of 2 nm/cm over 20 mm spreads the Bragg wavelength over 4 nm: the band is about that wide,
  // and light is reflected where its own wavelength is the local one, so the delay runs across the band:
  // from one end the long wavelengths come back late, from the other early, by about 2 n L between the band's ends
  const G = grating(12, 20, { chirp: 2, apod: 'cos' }), B = fbgBand(G);
  assert.ok(B.fwhm > 1.5 && B.fwhm < 4.5, 'chirped width ' + B.fwhm);
  const a = fbgAt(G, LB - 0.8), b = fbgAt(G, LB + 0.8);
  // the reflecting point moves 1.6 nm / (2 nm/cm) = 8 mm: 2 n 8 mm of path
  near(b.r1.dl - a.r1.dl, 2 * N * 8, 0.15 * 2 * N * 8, 'delay across the band, from the short-wavelength end');
  near(b.r2.dl - a.r2.dl, -2 * N * 8, 0.15 * 2 * N * 8, 'and from the other end');
});

test('a sideband meets the grating at its own frequency: the delay, read as a modulation’s phase', () => {
  // amplitude modulation at 10 MHz, reflected by the grating and by a mirror in its place: the beat is later by the grating's delay
  const G = grating(2, 10), E = [fc('eom', 'E', { fm: 10, beta: 0.1, emode: 'amplitude', bias: 90, loss: 0 })];
  for (const nm of [LB, LB + 0.05, LB - 0.07]) {
    const ph = part => { run(onCirc(part, nm, false, E)); return pdSignal(el('R')).tones.find(t => Math.abs(t.f - 1e7) < 1).ph; };
    const tau = -(ph(fc('fbg', 'G', G)) - ph(fc('fmir', 'G', { rmax: 100 }))) / (2 * Math.PI * 1e7) * 1e12, want = fbgAt(G, nm).r1.dl / C_MM_PS;
    near(tau, want, 1e-4 * want, 'delay (ps) at ' + nm);
  }
});

test('a bench from before the grating had a length keeps its Gaussian band', () => {
  const band = d => 0.9 * Math.exp(-4 * Math.LN2 * (d / 0.5) ** 2);
  // as such a file gives it: the band's width and peak, no length or index modulation
  for (const old of [{ centre: 1550, fwhm: 0.5, rmax: 90 }, { rmax: 90 }, { fwhm: 0.5 }]) for (const d of [0, 0.2, -0.35]) {
    run(onCirc(fc('fbg', 'G', old), 1550 + d));
    assert.equal(el('G').model, 'band');
    near(pdNetMw(el('R')), band(d), 1e-12, 'reflected ' + d + ' nm off');
    near(pdNetMw(el('T')), 1 - band(d), 1e-12, 'transmitted');
  }
  // saved again and reopened, it is still the band; its grating settings are there at their defaults for a change of model
  const saved = JSON.parse(JSON.stringify(el('G')));
  assert.equal(saved.model, 'band'); assert.equal(saved.len, 5); assert.equal(saved.apod, 'none');
  run(onCirc(saved, 1550.2)); assert.equal(el('G').model, 'band'); assert.deepEqual(JSON.parse(JSON.stringify(el('G'))), saved);
  // a new grating, or a file naming a length or an index modulation, is the grating model; a model named is kept
  for (const [o, m] of [[{}, 'cmt'], [{ len: 8 }, 'cmt'], [{ dn: 1e-4, rmax: 50 }, 'cmt'], [{ model: 'band' }, 'band'], [{ model: 'cmt', fwhm: 0.5, rmax: 90 }, 'cmt'], [{ model: 'other', fwhm: 1 }, 'band']]) {
    run(onCirc(fc('fbg', 'G', o), 1550)); assert.equal(el('G').model, m, JSON.stringify(o));
  }
  // the default grating: 5 mm, dn 1.8e-4, about 90% at 1550 nm
  run(onCirc(fc('fbg', 'G'), 1550));
  near(pdNetMw(el('R')), Math.tanh(Math.PI * 1.8e-4 * 5 / 1550e-6) ** 2, 1e-13); near(pdNetMw(el('R')), 0.9, 2e-3);
  // out-of-range settings are brought in
  run(onCirc(fc('fbg', 'G', { len: -3, dn: 9, vis: 4, neff: 0.2, chirp: 1e9, apod: 'x' }), 1550));
  const g = el('G'); assert.deepEqual([g.len, g.dn, g.vis, g.neff, g.chirp, g.apod], [0.01, 0.05, 1, 1, 100, 'none']);
});
