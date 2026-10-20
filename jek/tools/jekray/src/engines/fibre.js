import { clamp } from '../core/constants.js';
import { C_SI, HPL } from '../core/cells.js';
import { C_MM, MODS, eomSidebands, famAt } from '../core/modulators.js';
import { FIBRE_NG, cohGamma, splitRoot } from '../core/coherence.js';
import { fibreGDD, fibreSPMLater } from '../core/pulses.js';
import { fanFromGauss } from '../core/beams-hom.js';
import { wavelengthColour } from '../core/colour.js';
import { V, deg, project } from '../state/project.js';
import { getEl } from '../state/elements.js';
import { frame, toWorld, toWorldDir } from '../core/mask.js';
import { arrivalField, faceArrivals, fanFromFibre, fibreMode, mmShare } from './fibre-face.js';
import { PIC } from './pic.js';
import { ELEC } from './elec.js';
import { modS } from './mods.js';
import { cmul } from '../core/numeric.js';

/* ==========================================================================
   Fibre subsystems
   Fibre components sit on the bench as boxes with ports; fibres join ports and are drawn
   as splines. Their lengths are properties, not what the drawing shows. A single-mode
   fibre carries one mode, so what travels along it is two complex amplitudes, s and p
   (s out of the bench plane where a fibre tip meets free space), in the field's
   convention, in units of the laser's own amplitude (the square is a share of that laser's
   power). Fibres here keep polarisation (as polarisation-maintaining fibre does, or
   standard fibre held still); a polarisation controller sets it.

   The network is solved by following the light: every wave leaving a port goes down its
   fibre (loss, phase k n L, group delay n_g L) to the next component, which scatters it
   out of its ports by its 2x2 Jones matrices; waves meeting at one port with one delay add
   as fields. Loops (rings, reflections, circulators) are followed round until what is left
   is negligible. Keeping each wave's delay makes coherence exact: what reaches a
   photodiode adds pairwise, weighted by the laser's gamma of the delay between each pair.
   Light arriving at a fibre tip from free space is taken in by its overlap with the tip's
   mode; light the network sends to a tip leaves it into free space as a source split from
   the same laser (a "virtual" source), so it interferes with the rest of that laser's
   light. That light is not taken back into the fibres a second time: a loop that runs
   fibre, free space, fibre is followed one way round.
   ========================================================================== */
export const FIBRE_N = 1.468;                  // phase and group index of the fibre
export const ci = { mul: (a, b) => cmul(a, b), add: (a, b) => [a[0] + b[0], a[1] + b[1]], sc: (a, s) => [a[0] * s, a[1] * s], e: ph => [Math.cos(ph), Math.sin(ph)] };
/* 2x2 complex matrices on (s, p): [[ss, sp], [ps, pp]] */
const J2 = {
  I: s => [[[s, 0], [0, 0]], [[0, 0], [s, 0]]],
  mul(A, B) { const e = (i, j) => ci.add(cmul(A[i][0], B[0][j]), cmul(A[i][1], B[1][j])); return [[e(0, 0), e(0, 1)], [e(1, 0), e(1, 1)]]; },
  T: A => [[A[0][0], A[1][0]], [A[0][1], A[1][1]]],
  sc: (A, z) => A.map(r => r.map(v => cmul(v, z))),
  app: (A, E) => {                       // A on [sr, si, pr, pi]
    const s = [E[0], E[1]], p = [E[2], E[3]];
    const o0 = ci.add(cmul(A[0][0], s), cmul(A[0][1], p)), o1 = ci.add(cmul(A[1][0], s), cmul(A[1][1], p));
    return [o0[0], o0[1], o1[0], o1[1]];
  },
  // a waveplate of retardance r waves, fast axis at th from s; a polariser at th, leaking amplitude l
  plate(th, r) {
    const c = Math.cos(th), sn = Math.sin(th), d = 2 * Math.PI * r, e = [Math.cos(d), Math.sin(d)];
    const a = ci.add([c * c, 0], ci.sc(e, sn * sn)), b = ci.sc(ci.add([1, 0], ci.sc(e, -1)), c * sn), dd = ci.add([sn * sn, 0], ci.sc(e, c * c));
    return [[a, b], [b, dd]];
  },
  pol(th, l) { const c = Math.cos(th), sn = Math.sin(th); return [[[c * c + l * sn * sn, 0], [c * sn * (1 - l), 0]], [[c * sn * (1 - l), 0], [sn * sn + l * c * c, 0]]]; },
};
const dBa = dB => Math.pow(10, -Math.max(0, dB) / 20);
/* a fibre's ends: what each reflects back into it (return loss, dB) */
export const CONNS = { splice: { name: 'Spliced (no reflection)', rl: Infinity }, pc: { name: 'PC connectors (45 dB return loss)', rl: 45 },
  apc: { name: 'APC connectors (65 dB)', rl: 65 }, flat: { name: 'Flat cleaves (4%, 14 dB)', rl: 10 * Math.log10(25) } };
const connR = F => { const c = CONNS[F.conn || 'splice']; return c && isFinite(c.rl) ? Math.pow(10, -c.rl / 10) : 0; };          // a loss in dB, as an amplitude
/* What a fibre does to polarisation, a to b (b to a is the transpose: it is reciprocal).
   PM fibre: its slow axis at the key angle from s, the two axes a retardance L/L_b apart at
   1550 nm (scaled for the wavelength), and a coupling between them of amplitude
   10^(-PER/20). Random: two waveplates at angles and retardances drawn from the fibre's seed,
   the retardance scaling with length and wavelength (a beat length of 10 m), so the state out
   drifts as the laser tunes. Multimode: the same, far stronger. */
function fibreJones(F, nm) {
  if (!F || !F.ftype || F.ftype === 'smf') return null;
  const Lmm = Math.max(0, F.len) * 1000;
  const rot = th => [[[Math.cos(th), 0], [-Math.sin(th), 0]], [[Math.sin(th), 0], [Math.cos(th), 0]]];
  if (F.ftype === 'pm') {
    const r = Lmm * 1550 / (F.beat * nm), c = Math.pow(10, -F.per / 20), k = Math.sqrt(1 - c * c), th = F.key * deg;
    const D = [[ci.sc(ci.e(Math.PI * r), k), [0, c]], [[0, c], ci.sc(ci.e(-Math.PI * r), k)]];
    return J2.mul(rot(th), J2.mul(D, rot(-th)));
  }
  // a fixed pseudo-random draw from the fibre's id and seed
  let h = 2166136261;
  for (const ch of String(F.id) + ':' + F.seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  const Lb = F.ftype === 'mm' ? 0.2 : 10000;       // mm
  const r1 = Lmm * 1550 / (Lb * nm) * (0.5 + rnd()), r2 = rnd(), a1 = Math.PI * rnd(), a2 = Math.PI * rnd();
  return J2.mul(J2.plate(a2, r2), J2.plate(a1, r1));
}
/* A fibre amplifier's gain at nm: the small-signal gain (dB) across a flat-topped band,
   scaled in the log by its saturation (1 until the network has been solved once) */
let ampSat = new Map();
export function ampGain(el, nm, small) {
  const u = (nm - el.centre) / Math.max(0.1, el.bw / 2), G0 = Math.pow(10, el.g0 / 10 / (1 + u ** 6));
  const s = small ? 1 : (ampSat.has(el.id) ? ampSat.get(el.id) : 1);
  return Math.exp(s * Math.log(G0));
}
/* its amplified spontaneous emission, each way, each polarisation: n_sp h nu (G - 1) per Hz,
   n_sp from the noise figure (NF = 2 n_sp at high gain), in slices across the band so that a
   filter after it takes its share. Returns the slices { nm, W (per polarisation), B (Hz) } */
const ASE_SLICES = 25;
export function ampASE(el) {
  const nsp = Math.max(1, Math.pow(10, el.nf / 10) / 2), span = 1.6 * el.bw, slices = [];
  let perPol = 0;
  for (let i = 0; i < ASE_SLICES; i++) {
    const nm = el.centre + (i / (ASE_SLICES - 1) - 0.5) * span, lam = nm * 1e-9;
    const B = C_SI * (span / (ASE_SLICES - 1)) * 1e-9 / (lam * lam), W = nsp * HPL * C_SI / lam * Math.max(0, ampGain(el, nm) - 1) * B;
    slices.push({ nm, W, B }); perPol += W;
  }
  return { perPol, slices, G: ampGain(el, el.centre) };
}
/* The kinds of fibre component: their ports (local position and outward direction, mm),
   their numbers, and what they do. S(el, nm) lists [from port, to port, 2x2]. */
export const FC_W = 14, FC_H = 9, SPLIT_P = 4.5;
const C_MM_PS = 0.299792458;                               // light, mm per ps                // a splitter's branches, mm apart
const fcPorts = sides => sides.map(([x, y]) => ({ x: x * FC_W / 2, y: y * FC_H / 2, dx: Math.abs(x) >= 1 ? Math.sign(x) : 0, dy: Math.abs(x) >= 1 ? 0 : Math.sign(y) }));
export const FC = {
  laser: { label: 'Fibre laser', tag: 'LASER', ports: [[1, 0]], names: ['out'],
    params: [['wavelength', 'Wavelength (nm)', 1550], ['power', 'Power (mW)', 1], ['coh', 'Coherence length (mm)', 0], ['polAngle', 'Polarisation angle from s (°), for pol "linear"', 0],
      ['tau', 'Pulse duration (fs; 0: continuous)', 0], ['rep', 'Repetition rate (MHz)', 80], ['gdd0', 'Chirp at the laser (fs\u00b2)', 0]],
    S: () => [] },
  // a 1xN splitter, or the same part the other way round, an Nx1 combiner: port 0 the common
  // port, 1 to N the branches; each branch takes 1/N of the power (less the excess loss), in
  // phase, and light into a branch reaches the common port at 1/N too (so N unrelated inputs
  // each lose 10 log N dB, as in a single-mode combiner)
  split: { label: 'Splitter', tag: el => el.combine ? el.ways + '\u00d71' : '1\u00d7' + el.ways, ports: [[-1, 0], [1, 0.5], [1, -0.5]], names: ['common', '1', '2'],
    params: [['ways', 'Branches', 2], ['loss', 'Excess loss (dB)', 0.2]],
    portsOf: el => { const N = el.ways, sd = el.combine ? -1 : 1;
      return [{ x: -sd * FC_W / 2, y: 0, dx: -sd, dy: 0 }, ...Array.from({ length: N }, (_, i) => ({ x: sd * FC_W / 2, y: ((N - 1) / 2 - i) * SPLIT_P, dx: sd, dy: 0 }))]; },
    namesOf: el => ['common', ...Array.from({ length: el.ways }, (_, i) => String(i + 1))],
    hOf: el => Math.max(FC_H, el.ways * SPLIT_P),
    S: el => { const M = J2.I(dBa(el.loss) / Math.sqrt(el.ways)), out = []; for (let i = 1; i <= el.ways; i++) out.push([0, i, M], [i, 0, M]); return out; } },
  coupler: { label: '2×2 coupler', tag: el => Math.round(100 - el.ratio) + ':' + Math.round(el.ratio), ports: [[-1, 0.5], [-1, -0.5], [1, 0.5], [1, -0.5]], names: ['1', '2', '3', '4'],
    params: [['ratio', 'Coupled across (%)', 50], ['loss', 'Excess loss (dB)', 0]],
    S: el => {
      const k = clamp(el.ratio, 0, 100) / 100, a = dBa(el.loss), t = J2.I(a * Math.sqrt(1 - k)), x = J2.sc(J2.I(a * Math.sqrt(k)), [0, 1]);
      return [[0, 2, t], [0, 3, x], [1, 2, x], [1, 3, t], [2, 0, t], [3, 0, x], [2, 1, x], [3, 1, t]];
    } },
  // a polarisation beam splitter: the common port's light along its axis to one branch, across
  // it to the other (each leaking its extinction of the other); backwards it combines them
  pbs: { label: 'Polarisation beam splitter', tag: 'PBS', ports: [[-1, 0], [1, 0.5], [1, -0.5]], names: ['common', 'along', 'across'],
    params: [['axis', 'Axis (\u00b0 from s)', 0], ['extinction', 'Extinction (dB)', 25], ['loss', 'Insertion loss (dB)', 0.5]],
    S: el => { const a = [dBa(el.loss), 0], A = J2.sc(J2.pol(el.axis * deg, dBa(el.extinction)), a), B = J2.sc(J2.pol(el.axis * deg + Math.PI / 2, dBa(el.extinction)), a);
      return [[0, 1, A], [1, 0, A], [0, 2, B], [2, 0, B]]; } },
  // a partly reflecting mirror in the fibre: r back from either side (the opposite sign from the
  // second, as a lossless mirror's), the rest through
  fmir: { label: 'Fibre mirror', tag: el => (+el.rmax.toPrecision(3)) + '%', ports: [[-1, 0], [1, 0]], names: ['1', '2'],
    params: [['rmax', 'Reflectance (%)', 50], ['loss', 'Excess loss (dB)', 0]],
    S: el => { const R = clamp(el.rmax, 0, 100) / 100, a = dBa(el.loss), r = J2.I(a * Math.sqrt(R)), t = J2.I(a * Math.sqrt(1 - R));
      return [[0, 0, r], [1, 1, J2.sc(r, [-1, 0])], [0, 1, t], [1, 0, t]]; } },
  // a 2x2 optical switch: bar (1 to 3, 2 to 4) or cross (1 to 4, 2 to 3), the other way leaking its crosstalk
  switch: { label: 'Optical switch', tag: el => el.cross >= 0.5 ? 'CROSS' : 'BAR', ports: [[-1, 0.5], [-1, -0.5], [1, 0.5], [1, -0.5]], names: ['1', '2', '3', '4'],
    params: [['cross', 'State (0 bar, 1 cross)', 0], ['loss', 'Insertion loss (dB)', 0.8], ['xt', 'Crosstalk (dB)', 50]],
    S: el => { const x = el.cross >= 0.5, on = J2.I(dBa(el.loss)), off = J2.I(dBa(el.loss + el.xt)), A = x ? off : on, B = x ? on : off;
      return [[0, 2, A], [2, 0, A], [1, 3, A], [3, 1, A], [0, 3, B], [3, 0, B], [1, 2, B], [2, 1, B]]; } },
  // a variable delay line (free space inside, so its group and phase delays are one): a delay
  // in ps, its path c tau in mm, and the phase that path gives at the light's wavelength
  delay: { label: 'Variable delay line', tag: el => (+el.delay.toPrecision(4)) + ' ps', ports: [[-1, 0], [1, 0]], names: ['1', '2'],
    params: [['delay', 'Delay (ps)', 0], ['loss', 'Insertion loss (dB)', 1]],
    S: (el, nm) => { const L = el.delay * C_MM_PS, M = J2.sc(J2.I(dBa(el.loss)), ci.e(-2 * Math.PI * L / (nm * 1e-6))); return [[0, 1, M, 0, L], [1, 0, M, 0, L]]; } },
  // a piezo fibre stretcher: a phase, set and driven (pi radians for Vpi volts on its input)
  stretch: { label: 'Fibre stretcher', tag: 'PZT', ports: [[-1, 0], [1, 0]], names: ['1', '2'],
    params: [['phase', 'Phase (\u00b0)', 0], ['vpi', 'V\u03c0 (V)', 2], ['loss', 'Insertion loss (dB)', 0.1]],
    S: el => { const ph = el.phase * deg + Math.PI * (el._v || 0) / Math.max(1e-9, el.vpi), M = J2.sc(J2.I(dBa(el.loss)), ci.e(-ph)); return [[0, 1, M], [1, 0, M]]; } },
  // a tunable band-pass filter: a Gaussian pass band, what it does not pass lost
  tbf: { label: 'Tunable filter', tag: el => (+el.centre.toPrecision(6)) + '', ports: [[-1, 0], [1, 0]], names: ['1', '2'],
    params: [['centre', 'Centre (nm)', 1550], ['fwhm', 'Width (nm)', 1], ['loss', 'Insertion loss (dB)', 1]],
    S: (el, nm) => { const T = Math.exp(-4 * Math.LN2 * ((nm - el.centre) / Math.max(1e-4, el.fwhm)) ** 2), M = J2.I(dBa(el.loss) * Math.sqrt(T)); return [[0, 1, M], [1, 0, M]]; } },
  // a Lyot depolariser: two birefringent sections, the second's axes at 45 degrees to the first's and
  // twice as long, so any polarisation in leaves as four parts each a delay apart (0, 1, 2, 3 times
  // its DGD); for light whose coherence length is shorter, they add as powers: unpolarised. Light
  // narrower in its line (most lasers) stays polarised, as through a real one
  depol: { label: 'Depolariser', tag: 'DEPOL', ports: [[-1, 0], [1, 0]], names: ['1', '2'],
    params: [['dgd', 'Delay between axes (ps)', 5], ['loss', 'Insertion loss (dB)', 0.3]],
    S: (el, nm) => {
      const L = Math.max(0, el.dgd) * C_MM_PS, k = 2 * Math.PI / (nm * 1e-6), a = dBa(el.loss), out = [];
      for (const [i, P1] of [[0, J2.pol(Math.PI / 4, 0)], [1, J2.pol(-Math.PI / 4, 0)]]) for (const [j, P2] of [[0, J2.pol(0, 0)], [1, J2.pol(Math.PI / 2, 0)]]) {
        const dl = (i + 2 * j) * L, z = [a * Math.cos(-k * dl), a * Math.sin(-k * dl)];
        out.push([0, 1, J2.sc(J2.mul(P2, P1), z), 0, dl], [1, 0, J2.sc(J2.mul(P1, P2), z), 0, dl]);
      }
      return out;
    } },
  // an MxN star coupler: each input to each output, an M x N corner of a K-point discrete Fourier
  // transform (K the larger), so with M = N it is lossless and each output takes 1/N of each input
  star: { label: 'Star coupler', tag: el => el.ins + '\u00d7' + el.outs, ports: [[-1, 0.5], [-1, -0.5], [1, 0.5], [1, -0.5]], names: ['in 1', 'in 2', 'out 1', 'out 2'],
    params: [['ins', 'Inputs', 2], ['outs', 'Outputs', 4], ['loss', 'Excess loss (dB)', 0.3]],
    portsOf: el => [...Array.from({ length: el.ins }, (_, i) => ({ x: -FC_W / 2, y: ((el.ins - 1) / 2 - i) * SPLIT_P, dx: -1, dy: 0 })),
      ...Array.from({ length: el.outs }, (_, j) => ({ x: FC_W / 2, y: ((el.outs - 1) / 2 - j) * SPLIT_P, dx: 1, dy: 0 }))],
    namesOf: el => [...Array.from({ length: el.ins }, (_, i) => 'in ' + (i + 1)), ...Array.from({ length: el.outs }, (_, j) => 'out ' + (j + 1))],
    hOf: el => Math.max(FC_H, Math.max(el.ins, el.outs) * SPLIT_P),
    S: el => {
      const M = el.ins, N = el.outs, K = Math.max(M, N), a = dBa(el.loss) / Math.sqrt(K), out = [];
      for (let i = 0; i < M; i++) for (let j = 0; j < N; j++) { const T = J2.sc(J2.I(a), ci.e(2 * Math.PI * i * j / K)); out.push([i, M + j, T], [M + j, i, T]); }
      return out;
    } },
  // an optical spectrum analyser: it takes the light in and shows it against wavelength
  osa: { label: 'Optical spectrum analyser', tag: 'OSA', ports: [[-1, 0]], names: ['in'],
    params: [['rbw', 'Resolution (nm)', 0.1], ['wmin', 'From (nm; 0: auto)', 0], ['wmax', 'To (nm; 0: auto)', 0], ['ref', 'Top (dBm)', 10], ['dbdiv', 'dB per division', 10]],
    S: () => [] },
  wdm: { label: 'WDM', tag: 'WDM', ports: [[-1, 0], [1, 0.5], [1, -0.5]], names: ['common', 'pass', 'rest'],
    params: [['centre', 'Pass band centre (nm)', 1550], ['fwhm', 'Pass band width (nm)', 20], ['loss', 'Insertion loss (dB)', 0.3]],
    S: (el, nm) => {
      const T = Math.exp(-Math.LN2 * Math.pow(2 * Math.abs(nm - el.centre) / Math.max(1e-3, el.fwhm), 6)), a = dBa(el.loss);
      const P = J2.I(a * Math.sqrt(T)), R = J2.I(a * Math.sqrt(1 - T));
      return [[0, 1, P], [1, 0, P], [0, 2, R], [2, 0, R]];
    } },
  circ: { label: 'Circulator', tag: 'CIRC', ports: [[-1, 0], [1, 0], [0, -1]], names: ['1', '2', '3'],
    params: [['loss', 'Insertion loss (dB)', 0.8], ['iso', 'Isolation (dB)', 40]],
    S: el => { const t = J2.I(dBa(el.loss)), l = J2.I(dBa(el.iso)); return [[0, 1, t], [1, 2, t], [1, 0, l], [2, 1, l]]; } },
  iso: { label: 'Isolator', tag: 'ISO →', ports: [[-1, 0], [1, 0]], names: ['in', 'out'],
    params: [['loss', 'Insertion loss (dB)', 0.5], ['iso', 'Isolation (dB)', 40]],
    S: el => [[0, 1, J2.I(dBa(el.loss))], [1, 0, J2.I(dBa(el.iso))]] },
  voa: { label: 'Attenuator', tag: el => (+el.att.toPrecision(3)) + ' dB', ports: [[-1, 0], [1, 0]], names: ['1', '2'],
    params: [['att', 'Attenuation (dB)', 3]],
    S: el => { const t = J2.I(dBa(el.att)); return [[0, 1, t], [1, 0, t]]; } },
  pc: { label: 'Polarisation controller', tag: 'PC', ports: [[-1, 0], [1, 0]], names: ['1', '2'],
    params: [['a1', 'Paddle 1, λ/4 (°)', 0], ['a2', 'Paddle 2, λ/2 (°)', 0], ['a3', 'Paddle 3, λ/4 (°)', 0]],
    S: el => {
      const M = J2.mul(J2.plate(el.a3 * deg, 0.25), J2.mul(J2.plate(el.a2 * deg, 0.5), J2.plate(el.a1 * deg, 0.25)));
      return [[0, 1, M], [1, 0, J2.T(M)]];             // reciprocal: back through it, the transpose
    } },
  pol: { label: 'In-line polariser', tag: 'POL', ports: [[-1, 0], [1, 0]], names: ['1', '2'],
    params: [['axis', 'Axis (° from s)', 0], ['extinction', 'Extinction (dB)', 30], ['loss', 'Insertion loss (dB)', 0.5]],
    S: el => { const M = J2.sc(J2.pol(el.axis * deg, dBa(el.extinction)), [dBa(el.loss), 0]); return [[0, 1, M], [1, 0, J2.T(M)]]; } },
  fm: { label: 'Faraday mirror', tag: 'FM', ports: [[-1, 0]], names: ['in'],
    params: [['rmax', 'Reflectance (%)', 99], ['loss', 'Extra loss (dB)', 0]],
    // a 45 degree rotator and a mirror: back out orthogonal to what came in, whatever went
    // before it, since M^T J M = det(M) J for J = [[0, 1], [-1, 0]]
    S: el => { const r = Math.sqrt(clamp(el.rmax, 0, 100) / 100) * dBa(el.loss); return [[0, 0, [[[0, 0], [r, 0]], [[-r, 0], [0, 0]]]]]; } },
  fbg: { label: 'Fibre Bragg grating', tag: 'FBG', ports: [[-1, 0], [1, 0]], names: ['1', '2'],
    params: [['centre', 'Bragg wavelength (nm)', 1550], ['fwhm', 'Bandwidth (nm)', 0.5], ['rmax', 'Peak reflectance (%)', 90]],
    S: (el, nm) => {
      const R = clamp(el.rmax, 0, 100) / 100 * Math.exp(-4 * Math.LN2 * ((nm - el.centre) / Math.max(1e-4, el.fwhm)) ** 2);
      const r = J2.I(Math.sqrt(R)), t = J2.I(Math.sqrt(1 - R));
      return [[0, 0, r], [1, 1, r], [0, 1, t], [1, 0, t]];
    } },
  term: { label: 'Terminator', tag: 'TERM', ports: [[-1, 0]], names: ['in'],
    params: [['rl', 'Return loss (dB)', 60]],
    S: el => [[0, 0, J2.I(dBa(el.rl))]] },
  pd: { label: 'Fibre photodetector', tag: 'PD', ports: [[-1, 0]], names: ['in'],
    // balanced: two inputs, the second's light taken from the first's
    portsOf: el => el.balanced ? BAL_PORTS : FC.pd.portList, namesOf: el => el.balanced ? ['in +', 'in \u2212'] : ['in'],
    params: [['resp', 'Responsivity (A/W)', 1], ['gain', 'Gain (V/A)', 1e4], ['vmax', 'Output limit (V)', 10], ['bandwidth', 'Bandwidth (Hz)', 1e9],
      ['dark', 'Dark (nA)', 1], ['ampNoise', 'Noise (pA/\u221aHz)', 2], ['demodF', 'Demod. at (MHz)', 0], ['demodPhase', 'Demod. phase (\u00b0)', 0]],
    S: () => [] },
  thru: { label: 'Feedthrough', tag: '⇄', ports: [[1, 0]], names: ['port'],
    params: [], S: () => [] },
  amp: { label: 'Fibre amplifier', tag: 'AMP ▷', ports: [[-1, 0], [1, 0]], names: ['in', 'out'],
    params: [['g0', 'Small-signal gain (dB)', 20], ['psat', 'Saturated output (dBm)', 17], ['nf', 'Noise figure (dB)', 5], ['centre', 'Band centre (nm)', 1545],
      ['bw', 'Band width (nm)', 35], ['iso', 'Isolation backwards (dB)', 40]],
    // forward: the saturated gain; back: an isolator's worth. A semiconductor amplifier (soa) has no
    // isolator, so gains both ways, and gains less for p than s by its polarisation-dependent gain
    S: (el, nm) => {
      const g = Math.sqrt(ampGain(el, nm));
      if (!el.soa) return [[0, 1, J2.I(g)], [1, 0, J2.I(dBa(el.iso))]];
      const G = [[[g, 0], [0, 0]], [[0, 0], [g * dBa(el.pdg), 0]]];
      return [[0, 1, G], [1, 0, G]];
    } },
  aom: { label: 'Fibre AOM', tag: 'AOM', ports: [[-1, 0], [1, 0]], names: ['in', 'out'],
    params: [['rf', 'Drive (MHz)', 80], ['order', 'Order (+1 or \u22121)', 1], ['loss', 'Insertion loss (dB)', 2.5]],
    // the shifted order is what the output fibre takes; order 0 is dumped. Back through it the
    // light is shifted the same way again (it takes up another phonon), so a double pass shifts by 2f, as in free space
    S: el => { const t = J2.I(dBa(el.loss) * Math.sqrt(el._eta === undefined ? 1 : el._eta)), f = (el.order < 0 ? -1 : 1) * el.rf * 1e6; return [[0, 1, t, f], [1, 0, t, f]]; } },   // ELEC hook: _eta, an RF level
  eom: { label: 'Fibre EOM', tag: 'EOM', ports: [[-1, 0], [1, 0]], names: ['in', 'out'],
    params: [['fm', 'Drive (MHz)', 1000], ['beta', 'Depth \u03b2 (rad)', 1.08], ['bias', 'Bias (\u00b0, amplitude mode)', 90], ['loss', 'Insertion loss (dB)', 3]],
    S: el => eomSidebands(el).flatMap(([n, c]) => [[0, 1, J2.sc(J2.I(1), c), n * el.fm * 1e6], [1, 0, J2.sc(J2.I(1), c), n * el.fm * 1e6]]) },
  // a mod's component (see Mods): its ports, the first half down the left and the rest down the
  // right, and its matrix as the mod gives it at each wavelength
  mod: { label: 'Module component', tag: el => el.mod ? el.mod.tag || el.mod.name.slice(0, 8) : 'MODULE', ports: [[-1, 0], [1, 0]], names: ['1', '2'], params: [],
    portsOf: el => { const n = el.mod ? el.mod.ports.length : 2, L = n === 1 ? 1 : Math.ceil(n / 2), R = n - L;
      return [...Array.from({ length: L }, (_, i) => ({ x: -FC_W / 2, y: ((L - 1) / 2 - i) * SPLIT_P, dx: -1, dy: 0 })), ...Array.from({ length: R }, (_, j) => ({ x: FC_W / 2, y: ((R - 1) / 2 - j) * SPLIT_P, dx: 1, dy: 0 }))]; },
    namesOf: el => el.mod ? el.mod.ports : ['1', '2'],
    hOf: el => Math.max(FC_H, Math.ceil((el.mod ? el.mod.ports.length : 2) / 2) * SPLIT_P),
    S: (el, nm) => modS(el, nm) },
};
for (const k of Object.keys(FC)) FC[k].portList = fcPorts(FC[k].ports);
const BAL_PORTS = fcPorts([[-1, 0.5], [-1, -0.5]]);
/* a component's ports, names and height: most are fixed by their kind, a splitter's by its branches */
export const fcPortsOf = el => FC[el.kind].portsOf ? FC[el.kind].portsOf(el) : FC[el.kind].portList;
export const fcNames = el => FC[el.kind].namesOf ? FC[el.kind].namesOf(el) : FC[el.kind].names;
export const fcH = el => FC[el.kind] && FC[el.kind].hOf ? FC[el.kind].hOf(el) : FC_H;
/* A fibre laser's field in the fibre, [s re, s im, p re, p im]: s, p, linear at polAngle from s,
   or circular with p a quarter wave behind s (rcp) or ahead of it (lcp), right- and
   left-handed as the screens' Stokes S3 counts them */
export const FIBRE_POLS = ['s', 'p', 'linear', 'rcp', 'lcp', 'unpolarised'];
function fibreLaserField(el) {
  const r2 = Math.SQRT1_2, th = el.polAngle * deg;
  switch (el.pol) {
    case 's': return [1, 0, 0, 0];
    case 'p': return [0, 0, 1, 0];
    case 'rcp': return [r2, 0, 0, -r2];
    case 'lcp': return [r2, 0, 0, r2];
    default: return [Math.cos(th), 0, Math.sin(th), 0];
  }
}
export const FC_ORDER = ['laser', 'coupler', 'split', 'star', 'pbs', 'depol', 'fmir', 'switch', 'delay', 'stretch', 'tbf', 'osa', 'wdm', 'circ', 'iso', 'voa', 'pc', 'pol', 'fm', 'fbg', 'term', 'pd', 'thru', 'aom', 'eom', 'amp'];

/* A component's ports, local: a fibre tip has one at the end of its tail */
export function portsOf(el) {
  const X = ELEC.extra(el);                                                                  // ELEC hook: electrical ports after the fibre ones
  return X.length ? portsOfOptic(el).concat(X) : portsOfOptic(el);
}
export function portsOfOptic(el) {
  if (el.type === 'fcomp') return fcPortsOf(el);
  if (el.type === 'pic') return PIC.ports(el);                                                // PIC hook
  if (el.type === 'elec') return ELEC.ports(el);                                              // ELEC hook
  if (el.type === 'fibre') { const L = fibreTail(el); return [{ x: -L, y: 0, dx: -1, dy: 0 }]; }
  return [];
}
const fibreTail = el => Math.max(8, 30 / V().scale) + Math.max(10, 40 / V().scale);
export const portName = (el, p) => (portsOf(el)[p] || {}).name || (el.type === 'fcomp' ? fcNames(el)[p] : el.type === 'pic' ? PIC.names(el)[p] : el.type === 'elec' ? ELEC.names(el)[p] : 'fibre');   // ELEC hook
export function portWorld(el, p) {
  const P = portsOf(el)[p], f = frame(el);
  const [x, y] = toWorld(f, P.x, P.y), [dx, dy] = toWorldDir(f, P.dx, P.dy);
  return { x, y, dx, dy };
}
export const pkey = (id, p) => id + '#' + p;
/* feedthroughs pair by name, like link planes */
export function thruPartner(el) {
  const L = project.elements.filter(e => e.type === 'fcomp' && e.kind === 'thru' && e.pair === el.pair);
  const i = L.indexOf(el);
  return i === 0 && L.length > 1 ? L[1] : i === 1 ? L[0] : null;
}

/* What light from free space a fibre tip takes in: each arrival's overlap with the tip's
   mode, s and p, in the field's convention, with the arrival's own delay (its optical path,
   plus the path before its source's launch). Arrivals of one launch keep their own delays,
   so the network weighs them against each other by gamma. */
function tipInputs(el) {
  const out = [];
  // multimode: each beam's own polarisation, scaled to the share it gets in
  if (el.mm) {
    for (const A of faceArrivals(el)) { const f = Math.sqrt(mmShare(el, A)); out.push({ E: A.J.map(v => v * f), key: A.coh, nm: A.nm, dl: A.gpl + A.lag, root: splitRoot(A.src) }); }
    return out;
  }
  for (const A of faceArrivals(el)) {
    const mode = fibreMode(el.core, el.na, A.nm), wf = mode.w, L = 3.5 * wf, N = 64, d = 2 * L / N;
    const mAmp = Math.sqrt(2 / (Math.PI * wf * wf));
    let s0 = 0, s1 = 0, p0 = 0, p1 = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const u = -L + (i + 0.5) * d, v = -L + (j + 0.5) * d, M = mAmp * Math.exp(-(u * u + v * v) / (wf * wf));
      const E = arrivalField(A, u, v);
      s0 += E[0] * M; s1 += E[1] * M; p0 += E[2] * M; p1 += E[3] * M;
    }
    const dd = d * d;
    out.push({ E: [s0 * dd, s1 * dd, p0 * dd, p1 * dd], key: A.coh, nm: A.nm, dl: A.gpl + A.lag, root: splitRoot(A.src) });
  }
  return out;
}

/* The network: every source of light in it, followed round. Returns what each port sends
   and receives (for the readouts and the drawing), what each photodiode reads, and what
   each tip sends back out into free space. */
/* the network again only when something it depends on has changed */
export let fibreNetMemo = { key: null, net: null };
export function setFibreNetMemo(v) { return (fibreNetMemo = v); }
export function fibreNetCached() {
  const fels = project.elements.filter(e => e.type === 'fcomp' || e.type === 'fibre' || e.type === 'pic');   // PIC hook
  if (!fels.length) { fibreNetMemo = { key: null, net: null }; return null; }
  const conn = new Set((project.fibres || []).filter(F => !F.wire).flatMap(F => [F.a[0], F.b[0]]));
  const arr = fels.filter(e => e.type === 'fibre' && conn.has(e.id)).map(e => faceArrivals(e).map(A => [A.qx, A.qy, A.u0, A.v0, A.vs, A.ldx, A.ldy, A.J, A.coh, A.opl, A.gpl, A.lag, A.nm, A.src.id, A.comps || 0]));
  const srcs = project.elements.filter(e => e.type === 'source').map(e => [e.id, e.power, e.coh, e.lineshape]);
  const key = JSON.stringify([fels, project.fibres || [], arr, srcs, fels.some(e => e.mod) ? MODS.rev : 0]);   // a mod's component: as its results stand
  if (fibreNetMemo.key !== key) {
    // amplifiers saturate on the total power reaching them: solve, set each one's gain from
    // what arrived, solve again; G = G0 exp(-(G - 1) Pin / Ps) at the band centre (a homogeneous
    // medium's, its added power G Pin - Pin = Ps ln(G0 / G)), Ps = Psat / ln G0 so that a hard
    // drive adds at most the rated saturated output; the ratio of logs then applying across the band
    const amps = fels.filter(e => e.type === 'fcomp' && e.kind === 'amp');
    ampSat = new Map();
    let net = fibreNet();
    for (let it = 0; it < 6 && amps.length && net; it++) {
      let moved = 0;
      for (const A of amps) {
        const Pin = netPower(net.inn.get(pkey(A.id, 0)), net.keys) * 1e-3, Ps = Math.pow(10, A.psat / 10) * 1e-3;
        const G0 = ampGain(A, A.centre, true), x = G0 > 1 ? Pin / Ps * Math.log(G0) : 0;
        let y = Math.log(Math.max(1, G0));                 // ln G, by Newton from ln G0 (f convex: it comes down to the root)
        if (x > 1e-12) for (let i = 0; i < 60; i++) { const f = y - Math.log(G0) + (Math.exp(y) - 1) * x, d = f / (1 + x * Math.exp(y)); y -= d; if (Math.abs(d) < 1e-12) break; }
        const G = Math.exp(Math.max(0, y));
        const s = G0 > 1 ? Math.log(Math.max(1, G)) / Math.log(G0) : 1, was = ampSat.has(A.id) ? ampSat.get(A.id) : 1;
        ampSat.set(A.id, 0.5 * (s + was) * (it === 0 ? 0 : 1) + (it === 0 ? s : 0));
        moved = Math.max(moved, Math.abs(s - was));
      }
      net = fibreNet();
      if (moved < 1e-5) break;
    }
    fibreNetMemo = { key, net, sat: new Map(ampSat) };
  } else if (fibreNetMemo.sat) ampSat = new Map(fibreNetMemo.sat);
  return fibreNetMemo.net;
}
/* A broadband source's band as slices: 21 or more across +-3 sigma of its Gaussian (sigma its FWHM
   over 2.355), close enough that the narrowest filter in the fibres (a tunable filter, Bragg
   grating or WDM band) spans twelve (up to 801 slices), each itself a Gaussian line 1.5 slices wide (so a comb of them shows no coherence
   revivals: they would come where the slices' own lines have faded to exp(-8)), their weights a
   Gaussian narrower by the slices' own width, so together they are the source's spectrum. Each
   carries its share of the band for the noise its light makes beating with itself (nb, Hz). */
const BROAD_N = 21, BROAD_MAX = 801;
function broadSlices(el, feat) {
  const sg = Math.max(1e-6, el.bw) / 2.3548;
  const N = Math.min(BROAD_MAX, Math.max(BROAD_N, 2 * Math.ceil(3 * sg / (feat > 0 ? feat / 12 : Infinity)) + 1));
  // the weights' Gaussian narrower by a slice's own line (1.5 spacings, as the analyser draws it too, smooth to 1e-3), so together they are the spectrum
  const d = 6 * sg / (N - 1), ss = 1.5 * d / 2.3548, sw = Math.sqrt(Math.max(1e-12, sg * sg - ss * ss));
  const out = [];
  for (let i = 0; i < N; i++) { const x = (i - (N - 1) / 2) * d; out.push({ nm: el.wavelength + x, w: Math.exp(-x * x / (2 * sw * sw)) }); }
  const W = out.reduce((a, q) => a + q.w, 0), lam = el.wavelength * 1e-9;
  // the band each slice stands for: chosen so the sum of P_i^2 / nb is the integral of S^2 over the
  // source's Gaussian spectrum, 1 / (2 sigma_nu sqrt(pi)) of P^2, which sets its beat noise
  const sgHz = 299792458 * sg * 1e-9 / (lam * lam), nb = out.reduce((a, q) => a + (q.w / W) ** 2, 0) * 2 * sgHz * Math.sqrt(Math.PI);
  return out.map(q => ({ nm: q.nm, w: q.w / W, coh: q.nm * q.nm * 1e-6 / (1.5 * d), nb, slice: true, d }));
}
export function fibreNet() {
  const comps = project.elements.filter(e => e.type === 'fcomp' || e.type === 'fibre');
  const fibres = (project.fibres || []).filter(F => getEl(F.a[0]) && getEl(F.b[0]));
  if (!fibres.length && !comps.some(e => e.type === 'fcomp' && e.kind === 'laser')) return null;
  // where each port's fibre goes, with its transfer
  const to = new Map();
  for (const F of fibres) {
    if (F.wg || F.wire) continue;                                // PIC hook: a waveguide is inside its chip; ELEC hook: a wire carries no light
    const Lmm = Math.max(0, F.len) * 1000, a = dBa(F.loss * F.len / 1000);
    to.set(pkey(...F.a), { port: F.b, Lmm, a, F, end: 'a' });
    to.set(pkey(...F.b), { port: F.a, Lmm, a, F, end: 'b' });
  }
  // the light put in: lasers, and tips taking in free-space light
  const inputs = [];
  // the narrowest band a filter in the fibres passes or reflects, for how finely broadband light is sliced
  const feat = Math.min(Infinity, ...comps.filter(e => e.type === 'fcomp' && (e.kind === 'tbf' || e.kind === 'fbg' || e.kind === 'wdm')).map(e => e.fwhm));
  for (const el of comps) {
    if (el.type === 'fcomp' && el.kind === 'laser') {
      // unpolarised: s and p halves as launches of their own, so they add as powers
      const halves = el.pol === 'unpolarised' ? [[[Math.SQRT1_2, 0, 0, 0], ''], [[0, 0, Math.SQRT1_2, 0], '~p']] : [[fibreLaserField(el), '']];
      // broadband light across its band, in slices (each its own launch), so what passes and reflects
      // it is worked out wavelength by wavelength
      const sl = el.cmode === 'broad' && !(el.tau > 0) ? broadSlices(el, feat) : null;
      for (const [E, k] of halves) {
        if (sl) sl.forEach((S, i) => inputs.push({ port: [el.id, 0], E, key: el.id + k + '~b' + i + ':0:q0', nm: S.nm, dl: 0, fo: 0,
          root: Object.assign({}, S, { id: el.id + k + '~b' + i, of: el, half: k, name: el.name, power: el.power * S.w, lineshape: 'gauss', cmode: 'broad', wavelength: S.nm }) }));
        else inputs.push({ port: [el.id, 0], E, key: el.id + k + ':0:q0', nm: el.wavelength, dl: 0, root: el, fo: 0 });
      }
    }
    if (el.type === 'fibre' && to.has(pkey(el.id, 0))) for (const I of tipInputs(el)) inputs.push(Object.assign(I, { port: [el.id, 0] }));
    // an amplifier's spontaneous emission: broadband light of its own, unpolarised (s and p
    // apart, so they add as powers), out of both ports
    if (el.type === 'fcomp' && el.kind === 'amp') {
      const A = ampASE(el);
      A.slices.forEach((S, i) => { if (S.W > 0) for (const [port, dir] of [[1, 'f'], [0, 'b']]) for (const [pol, E] of [['s', [1, 0, 0, 0]], ['p', [0, 0, 1, 0]]]) {
        const id = 'ase~' + el.id + '~' + dir + pol + i;
        inputs.push({ port: [el.id, port], E, key: id + ':0:q0', nm: S.nm, dl: 0, fo: 0,
          root: { id, ase: true, amp: el.id, name: el.name + ' ASE', power: S.W * 1e3, coh: C_MM / S.B, lineshape: 'gauss', wavelength: S.nm } });
      } });
    }
  }
  // one group per launch (its offset aside: light at every offset of one laser is followed
  // together, as it beats with itself)
  const groups = new Map();
  for (const I of inputs) {
    const base = famAt(I.key, 0), g = base + '|' + I.nm;
    if (!groups.has(g)) groups.set(g, { key: base, nm: I.nm, root: I.root, list: [] });
    groups.get(g).list.push(I);
  }
  const res = { out: new Map(), inn: new Map(), pd: new Map(), tips: new Map(), spm: new Map(), truncated: false, keys: [] };
  const rec = (map, k, g, w) => { if (!map.has(k)) map.set(k, new Map()); const m = map.get(k); if (!m.has(g)) m.set(g, []); m.get(g).push(w); };
  for (const [gk, G] of groups) {
    res.keys.push({ gk, key: G.key, nm: G.nm, root: G.root });
    const k0 = 2 * Math.PI / (G.nm * 1e-6), P0 = G.list.reduce((s, I) => s + I.E.reduce((a, v) => a + v * v, 0), 0);
    const floor = 1e-20 * Math.max(P0, 1e-30);
    const Smemo = new Map(), Sof = el => { if (!Smemo.has(el.id)) Smemo.set(el.id, el.type === 'fcomp' ? FC[el.kind].S(el, G.nm) : []); return Smemo.get(el.id); };
    const Jm = new Map(), Jmemo = f => { const k = f.F.id + f.end; if (!Jm.has(k)) { const M = fibreJones(f.F, G.nm); Jm.set(k, M && f.end === 'b' ? J2.T(M) : M); } return Jm.get(k); };
    // waves leaving components into fibres, keyed by port and delay (added as fields there)
    let wave = new Map();
    // (inside: already past the connector at that end, as light its connector reflected back is)
    const emit = (map, port, dl, E, fo, gdd, sp, inside) => {
      const k = pkey(...port) + '|' + Math.round(dl * 1e6) + '|' + fo + (inside ? '|i' : '');
      const w = map.get(k);
      if (w) { for (let i = 0; i < 4; i++) w.E[i] += E[i]; } else map.set(k, { port, dl, E: E.slice(), fo, gdd: gdd || 0, sp: sp || null, inside: !!inside });
    };
    const pulsed = G.root && G.root.tau > 0 && !G.root.ase ? G.root : null;
    for (const I of G.list) emit(wave, I.port, I.dl, I.E, I.fo || 0, I.gdd || 0);
    let gen = 0;
    // light arriving at a port q from its fibre: into the component, and on (or to a photodiode, a tip, a chip)
    const arrive = (next, q, E, dl, fo, gdd, sp) => {
      const el = getEl(q[0]);
      rec(res.inn, pkey(...q), gk, { dl, E, fo, gdd, sp });
      if (!el) return;
      if (el.type === 'fibre') { rec(res.tips, el.id, gk, { dl, E, fo, gdd, sp }); return; }        // out into free space
      if (el.type === 'pic') {                                     // PIC hook: through the chip, solved whole
        for (const o of PIC.scatter(el, q[1], G.nm, fo)) { const E2 = J2.app(o.M, E), dl2 = dl + o.ddl; if (o.sink) rec(res.pd, o.to[0], gk, { dl: dl2, E: E2, fo, gdd, sp }); else emit(next, o.to, dl2, E2, fo, gdd, sp); }
        return;
      }
      if (el.kind === 'pd' || el.kind === 'osa') { rec(res.pd, el.balanced && q[1] === 1 ? el.id + '~' : el.id, gk, { dl, E, fo, gdd, sp }); return; }
      if (el.kind === 'thru') { const P = thruPartner(el); if (P) emit(next, [P.id, 0], dl, E, fo, gdd, sp); return; }
      for (const [a, b, M, df, ddl] of Sof(el)) if (a === q[1]) emit(next, [el.id, b], dl + (ddl || 0), J2.app(M, E), fo + (df || 0), gdd, sp);
    };
    while (wave.size && gen++ < 20000) {
      const next = new Map();
      for (const w of wave.values()) {
        const pw = w.E[0] ** 2 + w.E[1] ** 2 + w.E[2] ** 2 + w.E[3] ** 2;
        if (pw < floor) continue;
        rec(res.out, pkey(...w.port), gk, { dl: w.dl, E: w.E, fo: w.fo });
        const f = to.get(pkey(...w.port));
        if (!f) continue;                              // an open port: the light leaves the network
        // a connector at this end (its ends reflect from either side): some straight back into the port, the rest on
        const Rc = connR(f.F), rc = Math.sqrt(Rc), tc = w.inside ? 1 : Math.sqrt(1 - Rc);
        if (Rc > 0 && !w.inside) arrive(next, w.port, w.E.map(v => v * rc), w.dl, w.fo, w.gdd, w.sp);
        // the phase at this light's own frequency: the laser's, plus its offset
        const z = ci.sc(ci.e(-(k0 + 2 * Math.PI * w.fo / C_MM) * FIBRE_N * f.Lmm), f.a * tc);
        let E = [w.E[0] * z[0] - w.E[1] * z[1], w.E[0] * z[1] + w.E[1] * z[0], w.E[2] * z[0] - w.E[3] * z[1], w.E[2] * z[1] + w.E[3] * z[0]];
        const FJ = Jmemo(f);
        if (FJ) E = J2.app(FJ, E);
        const dl = w.dl + FIBRE_NG * f.Lmm, q = f.port, fo = w.fo;
        // the connector where it arrives sends some straight back down the fibre (from this side of it, the
        // opposite sign, as a lossless interface reflects), and passes the rest
        if (Rc > 0) { emit(next, q, dl, E.map(v => -v * rc), fo, w.gdd, w.sp, true); E = E.map(v => v * Math.sqrt(1 - Rc)); }
        // for a pulse: the fibre's dispersion, and where its peak power is high enough, its
        // nonlinearity too (the pulse then carries the spectrum it leaves with)
        let gdd = (w.gdd || 0) + fibreGDD(f.F, G.nm, f.Lmm / 1000), sp = w.sp || null;
        if (pulsed && f.Lmm > 0) {
          const r = fibreSPMLater(f.F, G.nm, f.Lmm / 1000, pulsed, pw * (pulsed.power || 0) * 1e-3, w.gdd || 0, w.sp || null);
          if (r) { sp = r; gdd = 0; const o = res.spm.get(f.F.id); if (!o || r.B > o.B) res.spm.set(f.F.id, { B: r.B, broad: r.broad, peak: r.peakIn, nm: G.nm }); }
        }
        arrive(next, q, E, dl, fo, gdd, sp);
      }
      wave = next;
      if (wave.size > 20000) { res.truncated = true; break; }
    }
    if (wave.size && gen >= 20000) res.truncated = true;
  }
  return res;
}
/* The power in a set of waves of one launch, in mW: pairwise, weighted by gamma */
export function netPower(byGroup, keys) {
  let mw = 0;
  if (!byGroup) return 0;
  for (const K of keys) {
    const ws = byGroup.get(K.gk);
    if (!ws) continue;
    const g = cohGamma(K.root);
    let s = 0;
    for (let i = 0; i < ws.length; i++) for (let j = i; j < ws.length; j++) {
      if ((ws[i].fo || 0) !== (ws[j].fo || 0)) continue;        // light at different offsets beats, averaging to nothing
      const A = ws[i].E, B = ws[j].E, d = A[0] * B[0] + A[1] * B[1] + A[2] * B[2] + A[3] * B[3];
      s += (i === j ? 1 : 2 * (g ? g(ws[i].dl - ws[j].dl) : 1)) * d;
    }
    mw += s * (K.root.power || 0);
  }
  return mw;
}
/* The light a tip sends into free space, as sources split from each laser: one per launch,
   or, for a laser with a line of its own, one per group of delays close enough (a fiftieth
   of the coherence length) to count as one; at most six, the weakest folded into the
   nearest in delay */
/* What reaches a tip, launch by launch, with a broadband source's slices (each polarisation half on
   its own) put back together as one: the strongest slice's light carrying all their power, at their
   power-weighted wavelength, its line as wide as their spread with the slices' own width (free space
   follows a broadband beam at one wavelength, so it is not traced once for every slice) */
function tipLaunches(net, byG) {
  const out = [], grp = new Map(), pw = ws => ws.reduce((a, w) => a + w.E[0] ** 2 + w.E[1] ** 2 + w.E[2] ** 2 + w.E[3] ** 2, 0);
  for (const K of net.keys) {
    const ws = byG.get(K.gk);
    if (!ws || !ws.length) continue;
    if (!K.root.slice) { out.push([K, ws]); continue; }
    const g = K.root.of.id + K.root.half;
    if (!grp.has(g)) grp.set(g, []);
    grp.get(g).push({ K, ws, p: pw(ws) * (K.root.power || 0) });
  }
  for (const L of grp.values()) {
    const P = L.reduce((a, q) => a + q.p, 0);
    if (!(P > 0)) continue;
    const rep = L.reduce((a, q) => q.p > a.p ? q : a), lc = L.reduce((a, q) => a + q.p * q.K.nm, 0) / P;
    const sw = Math.sqrt(L.reduce((a, q) => a + q.p * (q.K.nm - lc) ** 2, 0) / P + (rep.K.nm * rep.K.nm * 1e-6 / rep.K.root.coh / 2.3548) ** 2), fw = 2.3548 * sw;
    const k = Math.sqrt(P / rep.p);
    const root = Object.assign({}, rep.K.root, { slice: false, nb: undefined, wavelength: lc, coh: lc * lc * 1e-6 / fw });
    out.push([Object.assign({}, rep.K, { nm: lc, root }), rep.ws.map(w => Object.assign({}, w, { E: w.E.map(v => v * k) }))]);
  }
  return out;
}
export function tipSources(net) {
  const out = [];
  if (!net) return out;
  for (const [tipId, byG] of net.tips) {
    const tip = getEl(tipId);
    if (!tip) continue;
    for (const [K, ws] of tipLaunches(net, byG)) {
      const Lc = K.root.coh > 0 ? K.root.coh : Infinity;
      const sorted = ws.slice().sort((a, b) => (a.fo || 0) - (b.fo || 0) || a.dl - b.dl);
      let cl = [];
      for (const w of sorted) {
        const last = cl[cl.length - 1];
        const pw0 = w.E[0] ** 2 + w.E[1] ** 2 + w.E[2] ** 2 + w.E[3] ** 2;
        if (last && last.fo === (w.fo || 0) && w.dl - last.d0 <= Lc / 50) { for (let i = 0; i < 4; i++) last.E[i] += w.E[i]; last.dw += w.dl * pw0; last.gw += (w.gdd || 0) * pw0; last.pw += pw0; if (w.sp && pw0 > last.spw) { last.sp = w.sp; last.spw = pw0; } }
        else cl.push({ d0: w.dl, fo: w.fo || 0, E: w.E.slice(), dw: w.dl * pw0, gw: (w.gdd || 0) * pw0, pw: pw0, sp: w.sp || null, spw: w.sp ? pw0 : 0 });
      }
      const pw = c => c.E[0] ** 2 + c.E[1] ** 2 + c.E[2] ** 2 + c.E[3] ** 2;
      while (cl.length > 6) {
        let k = 0; for (let i = 1; i < cl.length; i++) if (pw(cl[i]) < pw(cl[k])) k = i;
        const c = cl.splice(k, 1)[0];
        const same = cl.map((x, i) => i).filter(i => cl[i].fo === c.fo);
        if (!same.length) continue;                    // alone at its offset: dropped, it is the weakest
        let n = same[0]; for (const i of same) if (Math.abs(cl[i].d0 - c.d0) < Math.abs(cl[n].d0 - c.d0)) n = i;
        for (let i = 0; i < 4; i++) cl[n].E[i] += c.E[i];
      }
      cl.forEach((c, n) => {
        const P = pw(c);
        if (!(P > 1e-12)) return;
        const nm = K.nm, v = {
          type: 'source', virtual: true, id: tipId + '~' + out.length, name: tip.name, bench: tip.bench,
          x: tip.x, y: tip.y, ...(tip.z !== undefined ? { z: tip.z } : {}), ...(tip.tip ? { tip: tip.tip } : {}), ...(tip.roll ? { roll: tip.roll } : {}), angle: tip.angle, wavelength: nm, lines: [], colourAuto: true, colour: wavelengthColour(nm),
          // single mode: the fibre's mode; multimode: a filled core, waist the core's radius
          // and M^2 = pi a NA / lambda so it leaves at the NA (partly coherent across itself)
          gauss: tip.emitGauss !== false, w0: tip.mm ? tip.core / 2e3 : fibreMode(tip.core, tip.na, nm).w, z0: 0,
          m2: tip.mm ? clamp(Math.PI * tip.core / 2e3 * tip.na / (nm * 1e-6), 1, 30) : 1, rays: tip.emitRays, traceRays: tip.emitTraceRays !== false && tip.emitRays > 0, ...(tip.emitPattern ? { pattern: tip.emitPattern } : {}),
          popN: tip.popN || 256, popModel: tip.popModel || 'auto', pol: 's', polAngle: 0,
          coh: K.root.coh || 0, lineshape: K.root.lineshape || 'lorentz', power: P * (K.root.power || 0),
          // a pulsed fibre laser's pulse, chirped by the fibres it came through
          tau: K.root.tau || 0, pshape: K.root.pshape || 'sech2', rep: K.root.rep || 80, gdd0: (c.sp ? 0 : K.root.gdd0 || 0) + (c.pw > 0 ? c.gw / c.pw : 0),
          // a spectrum a fibre's nonlinearity reshaped (its chirp at the laser already in it)
          spec: c.sp || null,
          // the tracer's amplitudes are the field's, conjugated
          vJ: [c.E[0], -c.E[1], c.E[2], -c.E[3]], vRoot: K.root, vLag: c.dw / P, vKey: famAt(K.key, c.fo), vFo: c.fo, sweeps: {},
        };
        fanFromGauss(v); fanFromFibre(v, tip.mm ? tip.na : 0);
        out.push(v);
      });
    }
  }
  return out;
}

