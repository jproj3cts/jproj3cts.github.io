// Round 4: mirrors of 99 %, 5 mm across, 50 um short of concentric; the single dipole at the cavity's middle.
// The mode solve (what JEKray uses here) and the pupil solve made to run (the scratch copy exp/, patched by mkexp.sh and
// expatch.py), each alone; their locks; and the bench's numbers the Python reference takes (h2, lam, f, b).
// node r4.mjs [reflect %] [short mm] [write]   (write: the case's bench numbers as JSON on the last line)
const R = './exp/jek/tools/jekray/';
const { openBench, engine } = await import(R + 'headless.mjs');
await engine();
const SC = await import(R + 'src/engines/scatter.js');
const { getEl } = await import(R + 'src/state/elements.js');
const refl = +(process.argv[2] || 99), short = +(process.argv[3] || 0.05);
const LASER = { id: 'laser', type: 'source', name: 'Laser', x: -40, y: 0, angle: 0, wavelength: 1550, gauss: true, w0: 0.02, z0: 40, rays: 0, traceRays: false, power: 1, pol: 's' };
const doc = { format: 'jekray', version: 1, name: 't', maxBounces: 60, minPower: 1e-6, benches: [{ id: 'b1', name: 'B' }], tab: 'b1', elements: [LASER,
  { id: 'm1', type: 'mirror', name: 'M1', x: -10, y: 0, angle: 0, length: 5, reflect: refl, transmit: 100 - refl, R: 10 }, { id: 'm2', type: 'mirror', name: 'M2', x: 10 - short, y: 0, angle: 180, length: 5, reflect: refl, transmit: 100 - refl, R: 10 },
  { id: 'p', type: 'particle', name: 'P', x: -short / 2, y: 0, angle: 90, trapMat: 'Fused silica', trapR: 50, trapMed: 'vacuum', scatModel: 'rayleigh' }].map(e => Object.assign({ bench: 'b1' }, e)) };
const c2 = z => z && z.map(v => v.toExponential(6)).join(' ');
let bench = null;
for (const force of [false, true]) {
  globalThis.PUP_FORCE = force;
  const B = await openBench(doc);
  B.trace();
  const t0 = Date.now(), S = SC.scatterNow(getEl('p')), C = S.cav || {};
  if (!force) console.log('mode solve : E2-1', (C.E2mode - 1).toExponential(6), '| modes kept', C.modes, 'finesse', C.finesse.toFixed(1), 'round-trip Gouy', C.gouy, 'lock detuning dLock', C.dLock, 'lam00', c2(C.lam00), 'shift/linewidth', C.shiftLw, 'widen/linewidth', C.widenLw, 'I0', S.I0, 'flags', S.flags.join(','), (Date.now() - t0) + ' ms');
  else {
    console.log('pupil solve: E2-1', (C.E2ratio - 1).toExponential(6), '| returns', C.terms, 'longest chain', C.longest, 'lock', C.lamHow, 'dLock', C.dLock, 'lam (the ray\'s round trip)', c2(C.lam00), 'arg', Math.atan2(C.lam00[1], C.lam00[0]), 'Ritz (TEM00)', c2(C.ritz), 'back (returned field over the light)', c2(C.back), 'h2', c2(C.h2), 'f', c2(C.f0), 'b', c2(C.b0), 'I0', S.I0, 'Fresnel', C.fresnel, (Date.now() - t0) + ' ms');
    bench = { kind: 'concentric', delta_m: short * 1e-3, rp_m: [0, 0, -short / 2 * 1e-3], Rp: refl / 100, trips: 4000, h2: C.h2, lam: C.lam00, lam_how: C.lamHow, ritz: C.ritz, f: C.f0, b: C.b0, mie: false };
  }
}
console.log(JSON.stringify(bench));
