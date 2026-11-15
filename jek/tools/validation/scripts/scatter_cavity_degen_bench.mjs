// The benches of scatter_cavity_degen.py as JEKray has them empty: for each, the two numbers of the cavity's lock (the
// axial half trip by the far mirror, h2, and the round trip, lam, both as the empty cavity's waves give them) and the
// standing wave the laser makes at the particle (forward f and backward b along its polarisation). The reference takes
// these and nothing else from JEKray. Run from jek/tools/jekray: node ../validation/scripts/scatter_cavity_degen_bench.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const R = new URL('../../jekray/', import.meta.url).pathname;
const { openBench, engine } = await import(R + 'headless.mjs');
await engine();
const SC = await import(R + 'src/engines/scatter.js');
const { getEl } = await import(R + 'src/state/elements.js');
export const LASER = { id: 'laser', type: 'source', name: 'Laser', x: -40, y: 0, angle: 0, wavelength: 1550, gauss: true, w0: 0.02, z0: 40, rays: 0, traceRays: false, power: 1, pol: 's' };
export const mirrors = (kind, d = 0, len = 5) => {
  const [R2, k] = kind === 'concentric' ? [10, 0] : [20, -1];
  return [{ id: 'm1', type: 'mirror', name: 'M1', x: -10, y: 0, angle: 0, length: len, reflect: 90, transmit: 10, R: R2, k },
    { id: 'm2', type: 'mirror', name: 'M2', x: 10 - d, y: 0, angle: 180, length: len, reflect: 90, transmit: 10, R: R2, k }];
};
// the cases: the particle's place (bench mm: x along the axis, y across in the plane), the far mirror moved in (mm)
export const CASES = {
  'concentric': { kind: 'concentric', x: 0, y: 0, mie: true },
  'concentric-along': { kind: 'concentric', x: 2e-4, y: 0 },
  'concentric-across': { kind: 'concentric', x: 0, y: 2e-4 },
  'concentric-2um': { kind: 'concentric', x: 0, y: 0, d: 2e-3 },
  'concentric-10um': { kind: 'concentric', x: 0, y: 0, d: 1e-2 },
  'concentric-50um': { kind: 'concentric', x: 0, y: 0, d: 5e-2 },
  'confocal': { kind: 'confocal', x: 0, y: 0, mie: true },
  'confocal-across': { kind: 'confocal', x: 0, y: 2e-3, mie: true },
  // further short of concentric, mirrors 2 mm across: not degenerate by JEKray's test, so solved in the cavity's modes
  // (modes: true), the particle at the cavity's middle
  'short-0.6mm': { kind: 'concentric', x: -0.3, y: 0, d: 0.6, len: 2, modes: true },
  'short-0.8mm': { kind: 'concentric', x: -0.4, y: 0, d: 0.8, len: 2, modes: true },
  'short-1.0mm': { kind: 'concentric', x: -0.5, y: 0, d: 1.0, len: 2, modes: true },
};
// node scatter_cavity_degen_bench.mjs [case ...]: only those, the others kept as the file has them
const only = process.argv.slice(2), file = new URL('../ref/scatter-cavity-degen-bench.json', import.meta.url);
const doc = els => ({ format: 'jekray', version: 1, name: 't', maxBounces: 60, minPower: 1e-6, benches: [{ id: 'b1', name: 'B' }], tab: 'b1', elements: els.map(e => Object.assign({ bench: 'b1' }, e)) });
const out = { note: 'From JEKray’s empty cavities (the particle’s own run takes the empty cavity’s light): the lock and the standing wave at the particle. Reference axes: z the cavity’s axis (bench x), x the polarisation (up), y across in the bench plane.', cases: {} };
if (only.length && existsSync(file)) Object.assign(out.cases, JSON.parse(readFileSync(file, 'utf8')).cases);
for (const [name, C] of Object.entries(CASES)) {
  if (only.length && !only.includes(name)) continue;
  (await openBench(doc([LASER, ...mirrors(C.kind, C.d || 0, C.len), { id: 'p', type: 'particle', name: 'P', x: C.x, y: C.y, angle: 90, trapMat: 'Fused silica', trapR: 50, trapMed: 'vacuum', scatModel: 'rayleigh' }]))).trace();
  const S = SC.scatterNow(getEl('p')), K = S.cav;
  if (C.modes) {
    // the mode solve's own two field numbers: TEM00's round trip (the lock) and its backward wave over its forward one
    // at the particle. (No standing wave of the whole light is taken: only the change of |E|^2 is compared, which is its ratio)
    if (!K || !K.solved || K.method) throw new Error(name + ': not solved in the modes: ' + JSON.stringify(K));
    out.cases[name] = { kind: C.kind, delta_m: C.d * 1e-3, rp_m: [0, C.y * 1e-3, C.x * 1e-3], a_m: C.len / 2 * 1e-3, h2: K.rho200, bf_mode: true, lam: [1, 0], lam_how: 'mode', ritz: K.lam00, f: [1, 0], b: K.rho200, mie: false, modes: true };
    console.log(name, JSON.stringify(out.cases[name]));
    continue;
  }
  if (!K || K.method !== 'pupil') throw new Error(name + ': not solved in the pupil: ' + JSON.stringify(K));
  out.cases[name] = { kind: C.kind, delta_m: (C.d || 0) * 1e-3, rp_m: [0, C.y * 1e-3, C.x * 1e-3], h2: K.h2, lam: K.lam00, lam_how: K.lamHow, ritz: K.ritz, f: K.f0, b: K.b0, mie: !!C.mie };
  console.log(name, JSON.stringify(out.cases[name]));
}
writeFileSync(file, JSON.stringify(out, null, 1));
