// Round 6: JEKray's mode solve as it is in the worktree, with the returns followed for the orders past its list and without:
// node r6.mjs <reflect %> <short of concentric mm> <mirror across mm> [rayleigh|mie] [R mm]
// the last line (when the returns are off) is the bench's numbers for the Python reference (TEM00's round trip and b/f)
const R = '../../../../../jek/tools/jekray/';
const { openBench, engine } = await import(R + 'headless.mjs');
await engine();
const SC = await import(R + 'src/engines/scatter.js'), CV = await import(R + 'src/engines/scatter-cavity.js');
const { getEl } = await import(R + 'src/state/elements.js');
const refl = +(process.argv[2] || 90), short = +(process.argv[3] || 0.6), mlen = +(process.argv[4] || 2), model = process.argv[5] || 'rayleigh', Rm = +(process.argv[6] || 10);
const LASER = { id: 'laser', type: 'source', name: 'Laser', x: -40, y: 0, angle: 0, wavelength: 1550, gauss: true, w0: 0.02, z0: 40, rays: 0, traceRays: false, power: 1, pol: 's' };
const doc = { format: 'jekray', version: 1, name: 't', maxBounces: 60, minPower: 1e-6, benches: [{ id: 'b1', name: 'B' }], tab: 'b1', elements: [LASER,
  { id: 'm1', type: 'mirror', name: 'M1', x: -Rm, y: 0, angle: 0, length: mlen, reflect: refl, transmit: 100 - refl, R: Rm }, { id: 'm2', type: 'mirror', name: 'M2', x: Rm - short, y: 0, angle: 180, length: mlen, reflect: refl, transmit: 100 - refl, R: Rm },
  { id: 'p', type: 'particle', name: 'P', x: -short / 2, y: 0, angle: 90, trapMat: 'Fused silica', trapR: model === 'rayleigh' ? 50 : 150, trapMed: 'vacuum', scatModel: model }].map(e => Object.assign({ bench: 'b1' }, e)) };
let bench = null;
for (const on of [true, false]) {
  CV.CAV_TAIL.on = on;
  const B = await openBench(doc);
  const t0 = Date.now(); B.trace(); const t1 = Date.now();
  const S = SC.scatterNow(getEl('p')), C = S.cav || {}, t2 = Date.now();
  getEl('p').trapR += 1e-7; B.trace(); const t3 = Date.now(); SC.scatterNow(getEl('p')); const t4 = Date.now();
  console.log(on ? 'returns followed:' : 'the list alone  :', 'solved', C.solved, C.method || 'modes', C.why || '', '| E2-1', C.E2ratio === undefined ? null : (C.E2ratio - 1).toExponential(6), '| shift/linewidth', C.shiftLw, 'widening/linewidth', C.widenLw, 'shift Hz', C.shiftHz, 'widen Hz', C.widenHz,
    '| modes', C.modes, 'Gouy', C.gouy && C.gouy.x, 'tail', JSON.stringify(C.tail || null), '| Psca', S.Psca, 'Pext', S.Pext, 'flags', (S.flags || []).join(','), '| first trace', t1 - t0, 'ms, solve', t2 - t1, 'ms; again: trace', t3 - t2, 'solve', t4 - t3);
  if (!on && C.solved && !C.method) bench = { kind: 'concentric', delta_m: short * 1e-3, rp_m: [0, 0, -short / 2 * 1e-3], Rp: refl / 100, a_m: mlen / 2 * 1e-3, trips: 4000, h2: C.rho200, bf_mode: true, lam: [1, 0], lam_how: 'mode', ritz: C.lam00, f: [1, 0], b: C.rho200, mie: false };
}
console.log(JSON.stringify(bench));
