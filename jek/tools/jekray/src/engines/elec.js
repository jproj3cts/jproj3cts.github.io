import { clamp } from '../core/constants.js';
import { hooks } from '../core/hooks.js';
import { fmtHz } from '../core/format.js';
import { MODS } from '../core/modulators.js';
import { hornGeom, pdResp, responsivity } from '../core/rf.js';
import { V, nextName, num, project } from '../state/project.js';
import { VSRC, benchNms, detR, getEl, normElement, setVSRC, srcBody } from '../state/elements.js';
import { makeSurf } from '../core/geometry.js';
import {
  lastTrace, lastTraceKey, lastTraceMs, setLastTrace, setLastTraceKey, setLastTraceMs, traceKeyNow,
  traceScene, traceSceneRaw
} from './trace.js';
import { detectorReading, rfCoupling } from './fibre-face.js';
import { FC_H, FC_W, netPower, pkey, portName, portsOf } from './fibre.js';
import { modBlockH, modHAt, modNAt, modStatus } from './mods.js';
import { pdNetMw, pdSignal } from './detector.js';
import { diffCache } from './diffraction.js';
import { detFieldGen, detectorFieldResult, statsCache } from './pd-cavity.js';
import { binCache } from './screen-stats.js';

export const ELEC_YELLOW = '#f2c14e';
export const DARK = '#2b2617';
export const INK = '#f7e2a6';
const W_BOX = 14;
export const PITCH = 4.5;
const choice = (...v) => v;
// each part: its label and tag, its inputs and outputs (names), its settings [key, label, default, choices]
export const ELEC_KINDS = {
  dc: { label: 'DC source', tag: 'DC', ins: [], outs: ['out'], params: [['v', 'Voltage (V)', 1]] },
  sig: { label: 'Signal generator', tag: 'SIG', ins: [], outs: ['out', 'sync'],
    params: [['wave', 'Waveform', 'sine', choice(['sine', 'Sine'], ['square', 'Square'], ['triangle', 'Triangle'], ['pulse', 'Pulse'])],
      ['f', 'Frequency (Hz)', 1000], ['amp', 'Amplitude (V)', 1], ['offset', 'Offset (V)', 0], ['phase', 'Phase (°)', 0], ['duty', 'Duty (%)', 50]] },
  noise: { label: 'Noise source', tag: 'NOISE', ins: [], outs: ['out'], params: [['psd', 'Density (nV/√Hz)', 100], ['bw', 'Bandwidth (Hz)', 1e6]] },
  amp: { label: 'Amplifier', tag: 'AMP', ins: ['in'], outs: ['out'],
    params: [['gain', 'Gain (V/V)', 10], ['bw', 'Bandwidth (Hz)', 1e6], ['en', 'Input noise (nV/√Hz)', 5], ['vmax', 'Output limit (V)', 10]] },
  tia: { label: 'Transimpedance amplifier', tag: 'TIA', ins: ['in'], outs: ['out'],
    params: [['gain', 'Gain (V/A)', 1e5], ['bw', 'Bandwidth (Hz)', 1e5], ['inoise', 'Input noise (pA/√Hz)', 1], ['vmax', 'Output limit (V)', 10]] },
  lpf: { label: 'Low-pass filter', tag: 'LPF', ins: ['in'], outs: ['out'], params: [['fc', 'Corner (Hz)', 1e4], ['order', 'Order', 1, choice([1, '1'], [2, '2'], [3, '3'], [4, '4'])]] },
  hpf: { label: 'High-pass filter', tag: 'HPF', ins: ['in'], outs: ['out'], params: [['fc', 'Corner (Hz)', 100], ['order', 'Order', 1, choice([1, '1'], [2, '2'], [3, '3'], [4, '4'])]] },
  bpf: { label: 'Band-pass filter', tag: 'BPF', ins: ['in'], outs: ['out'], params: [['f0', 'Centre (Hz)', 1000], ['bw', 'Bandwidth (Hz)', 100], ['order', 'Order', 1, choice([1, '1'], [2, '2'], [3, '3'], [4, '4'])]] },
  att: { label: 'Attenuator', tag: 'ATT', ins: ['in'], outs: ['out'], params: [['db', 'Attenuation (dB)', 10]] },
  biastee: { label: 'Bias tee', tag: 'BIAS-T', ins: ['rf', 'dc'], outs: ['rf+dc'], params: [['fc', 'Corner (Hz)', 1e4]] },
  comp: { label: 'Comparator', tag: 'COMP', ins: ['in'], outs: ['out'], params: [['thr', 'Threshold (V)', 0], ['vhi', 'Output high (V)', 5], ['vlo', 'Output low (V)', 0]] },
  mixer: { label: 'Mixer', tag: '×', ins: ['a', 'b'], outs: ['out'], params: [['k', 'Gain (1/V)', 1]] },
  sum: { label: 'Summing junction', tag: 'Σ', ins: ['a', 'b'], outs: ['out'], params: [['ga', 'Gain, a', 1], ['gb', 'Gain, b', 1]] },
  node: { label: 'Node', tag: '', ins: ['in'], outs: ['out'], params: [] },
  scope: { label: 'Oscilloscope', tag: 'SCOPE', ins: ['ch1', 'ch2'], outs: [],
    params: [['mode', 'Mode', 'normal', choice(['normal', 'Normal'], ['roll', 'Roll'])], ['span', 'Time span (s; 0: auto)', 0.005],
      ['v1div', 'Ch1 per division (0: auto)', 0], ['v1off', 'Ch1 offset', 0], ['v2div', 'Ch2 per division (0: auto)', 0], ['v2off', 'Ch2 offset', 0]] },
  spec: { label: 'Spectrum analyser', tag: 'SPEC', ins: ['in'], outs: [],
    params: [['scale', 'Frequency axis', 'log', choice(['log', 'Log'], ['linear', 'Linear'])], ['rbw', 'Resolution bandwidth (Hz)', 10],
      ['fmin', 'From (Hz; 0: auto)', 10], ['fmax', 'To (Hz; 0: auto)', 1e6], ['dbdiv', 'dB per division (0: auto)', 0], ['ref', 'Top (dB)', 0]] },
  lockin: { label: 'Lock-in amplifier', tag: 'LOCK-IN', ins: ['signal', 'ref'], outs: ['x', 'y'],
    params: [['harm', 'Harmonic', 1], ['phase', 'Phase (°)', 0], ['tau', 'Time constant (s)', 0.1],
      ['slope', 'Slope', 2, choice([1, '6 dB/oct'], [2, '12 dB/oct'], [3, '18 dB/oct'], [4, '24 dB/oct'])]] },
  // a bulkhead connector to another tab: what goes in here comes out of its partner's output, and the other way
  thru: { label: 'Electrical feedthrough', tag: '⇄', ins: ['in'], outs: ['out'], params: [] },
  daq: { label: 'DAQ (ADC)', tag: 'DAQ', ins: ['in'], outs: ['out'],
    params: [['rate', 'Sample rate (S/s)', 1e4], ['bits', 'Bits', 16], ['range', 'Range, ± (V)', 10]] },
};
const ELEC_PALETTE = [['elec:node', 'Node', 'Node: a wire junction, to route and fan out wires'], ['elec:dc', 'DC source'], ['elec:sig', 'Signal generator'], ['elec:noise', 'Noise source'], ['elec:amp', 'Amplifier'], ['elec:tia', 'TIA', 'Transimpedance amplifier'],
  ['elec:lpf', 'Low-pass', 'Low-pass filter'], ['elec:hpf', 'High-pass', 'High-pass filter'], ['elec:bpf', 'Band-pass', 'Band-pass filter'], ['elec:att', 'Attenuator'], ['elec:mixer', 'Mixer'],
  ['elec:sum', 'Summing junction'], ['elec:biastee', 'Bias tee'], ['elec:comp', 'Comparator'], ['elec:scope', 'Oscilloscope'], ['elec:spec', 'Spectrum analyser'], ['elec:lockin', 'Lock-in', 'Lock-in amplifier'],
  ['elec:daq', 'DAQ', 'DAQ (analogue-to-digital converter)'], ['elec:thru', 'Feedthrough', 'Electrical feedthrough (to another tab)']]
  .map(([k, l, t]) => [k, l, t || l]);
/* ---------- a part's box and ports ----------
   Inputs down the left, outputs down the right, at a fixed pitch; the box as tall as the
   side with more of them. Ports carry elec: 'in' or 'out'. */
const rows = K => Math.max(1, K.ins.length, K.outs.length);
export const boxH = K => Math.max(9, rows(K) * PITCH + 2.5);
const side = (n, i) => (i - (n - 1) / 2) * PITCH;
export const NODE_R = 1.2;
export const NODE_PORT = 4;                          // a node's ring (mm) and its port at the centre (px)
export const portList = el => {
  const K = ELEC_KINDS[el.kind];
  if (el.kind === 'node') return [{ x: 0, y: 0, dx: 0, dy: 0, elec: 'io' }];          // one point: a wire in, any number out
  return [...K.ins.map((nm, i) => ({ x: -W_BOX / 2, y: -side(K.ins.length, i), dx: -1, dy: 0, elec: 'in' })),
    ...K.outs.map((nm, i) => ({ x: W_BOX / 2, y: -side(K.outs.length, i), dx: 1, dy: 0, elec: 'out' }))];
};
const elecNames = el => { const K = ELEC_KINDS[el.kind]; return el.kind === 'node' ? ['node'] : [...K.ins, ...K.outs]; };
/* ---------- the element, as saved ---------- */
function elecNorm(e, base) {
  // a mod's block (see Mods): a kind of its own, its ports as the part carries them
  if (typeof e.kind === 'string' && /^mod\./.test(e.kind) && base.mod) ELEC_KINDS[e.kind] = { label: base.mod.name, tag: base.mod.tag || base.mod.name.slice(0, 8), ins: base.mod.ins, outs: base.mod.outs, params: [], mod: true };
  const K = ELEC_KINDS[e.kind];
  if (!K) return null;
  base.kind = e.kind;
  if (e.kind === 'thru') base.pair = String(e.pair || 'Feedthrough 1').slice(0, 60);
  for (const [k, , d, opts] of K.params) {
    if (opts) base[k] = opts.some(([v]) => v === e[k]) ? e[k] : d;
    else base[k] = num(e[k], d);
  }
  return base;
}
const elecMake = (kind, x, y) => makeOptic(kind, x, y) || normElement(Object.assign({ type: 'elec', kind, name: nextName(ELEC_KINDS[kind].label), x, y, angle: 0 }, kind === 'thru' ? { pair: nextPair() } : {}));
// feedthroughs pair by name, as the fibre ones and link planes do: a new one takes the first name not in use
const thrus = () => project.elements.filter(e => e.type === 'elec' && e.kind === 'thru');
const nextPair = () => { const used = new Set(thrus().map(e => e.pair)); let n = 1; while (used.has('Feedthrough ' + n)) n++; return 'Feedthrough ' + n; };
export function partner(el) { const L = thrus().filter(e => e.pair === el.pair), i = L.indexOf(el); return i === 0 && L.length > 1 ? L[1] : i === 1 ? L[0] : null; }
export const circ = (r, v) => Math.sqrt(Math.max(0, r * r - v * v));
export const line = (c, a, b, d, e) => { c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke(); };
const elecHit = (el, lx, ly, tol) => el.kind === 'node' ? Math.hypot(lx, ly) <= Math.max(NODE_R, 12 / V().scale) + tol : Math.abs(lx) <= W_BOX / 2 + tol && Math.abs(ly) <= boxH(ELEC_KINDS[el.kind]) / 2 + tol;
const elecHalfSize = el => el.kind === 'node' ? NODE_R + 0.5 : boxH(ELEC_KINDS[el.kind]) / 2 + 1;
/* What a drag between two ports makes: 'wire' between an output and an input, null (and why)
   for any other pairing that has an electrical port in it, undefined if neither is electrical */
function elecLinkKind(a, b) {
  const da = elecDirOf(a), db = elecDirOf(b);
  if (!da && !db) return undefined;
  if (da && db && (da !== db || da === 'io')) return 'wire';
  return null;
}
const elecDirOf = p => { const E = getEl(p[0]), P = E && portsOf(E)[p[1]]; return P && P.elec || null; };
/* a wire's ends put output first, input second */
// a node goes either way: it is the input to an output, the output to an input, and between two nodes the drag runs from the source
const elecOrient = (a, b) => elecDirOf(a) === 'in' || elecDirOf(b) === 'out' ? [b, a] : [a, b];
/* ---------- signals ----------
   A signal is what a block hands on, steady state: a DC level, tones (each a frequency and a
   complex amplitude c, the signal being Re(c e^{i 2 pi f t})), and noise, a one-sided power
   spectral density on a log grid of frequencies (V^2/Hz, or A^2/Hz for a current), and its
   unit. Linear blocks multiply each tone by H(f) and the density by |H(f)|^2; a mixer
   multiplies tone by tone, and moves the noise on one input by the other's tones (which is
   how a lock-in turns the noise beside its reference into noise at DC). Noise from one
   source reaching a block by two paths is added as if unrelated. */
const NF = 241;
const FLO = -2;                                   // 0.01 Hz to 10 GHz, 20 points a decade
const FG = Float64Array.from({ length: NF }, (_, i) => Math.pow(10, FLO + i / 20));
const KT = 1.380649e-23 * 295;
const zero = unit => ({ dc: 0, tones: [], psd: new Float64Array(NF), unit: unit || 'V' });
export const elecPsdAt = (S, f) => {
  const x = (Math.log10(Math.max(f, 1e-300)) - FLO) * 20;
  if (x <= 0) return S.psd[0];
  if (x >= NF - 1) return S.psd[NF - 1];
  const i = Math.floor(x), t = x - i;
  return S.psd[i] * (1 - t) + S.psd[i + 1] * t;
};
/* tones at one frequency merge; ones too weak to matter go */
// (found by an index kept on the list, to nine figures, rebuilt when the list has been changed another way)
const fkey = f => +f.toPrecision(9);
function addTone(list, f, re, im) {
  if (!(f > 0)) return;
  if (!list._ix || list._n !== list.length) { list._ix = new Map(list.map(t => [fkey(t.f), t])); list._n = list.length; }
  const q = list._ix.get(fkey(f));
  if (q) { q.re += re; q.im += im; } else { const t = { f, re, im }; list.push(t); list._ix.set(fkey(f), t); list._n = list.length; }
}
const tidy = S => { const pk = Math.max(Math.abs(S.dc), ...S.tones.map(t => Math.hypot(t.re, t.im)), 0); S.tones = S.tones.filter(t => Math.hypot(t.re, t.im) > 1e-12 * pk).sort((a, b) => a.f - b.f); return S; };
/* A mod's block: each output the sum of its inputs through the mod's responses, H(f) sampled
   on its grid and read between in log f, plus the noise it adds at its output */
function modBlock(el, K, In, set, note) {
  const R = modBlockH(el), st = modStatus(el);
  if (!R) { K.outs.forEach((_, j) => set(j, zero())); note(st ? 'Not working: ' + st : 'Working it out\u2026'); return; }
  const ni = K.ins.length;
  K.outs.forEach((_, o) => {
    let S = null;
    for (let i = 0; i < ni; i++) { const T = through(In[i], f => modHAt(R, f, o, i), 'V'); S = S ? sum(S, T, 1, 1) : T; }
    if (!S) S = zero('V');
    if (R.noise) for (let k = 0; k < NF; k++) { const n = modNAt(R, FG[k], o); S.psd[k] += n * n; }
    set(o, S);
  });
}
function through(S, H, unit, n2) {
  const out = zero(unit), H0 = H(0);
  out.dc = S.dc * H0[0];
  for (const t of S.tones) { const h = H(t.f); out.tones.push({ f: t.f, re: t.re * h[0] - t.im * h[1], im: t.re * h[1] + t.im * h[0] }); }
  for (let i = 0; i < NF; i++) { const h = H(FG[i]); out.psd[i] = (S.psd[i] + (n2 ? n2(FG[i]) : 0)) * (h[0] * h[0] + h[1] * h[1]); }
  return tidy(out);
}
/* complex helpers for the transfer functions */
const elecCmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1] || 1e-300; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
/* a Butterworth low-pass of order n, at s (normalised: s = i f / fc), as prod (-p_k) / (s - p_k) */
function butterLP(n, s) {
  let h = [1, 0];
  for (let k = 1; k <= n; k++) {
    const a = Math.PI * (2 * k + n - 1) / (2 * n), pk = [Math.cos(a), Math.sin(a)];
    h = elecCmul(h, cdiv([-pk[0], -pk[1]], [s[0] - pk[0], s[1] - pk[1]]));
  }
  return h;
}
const pole = (G, B) => f => cdiv([G, 0], [1, f / B]);       // G / (1 + i f / B)
const ELEC_FILTER = {
  lpf: el => f => butterLP(el.order, [0, f / el.fc]),
  hpf: el => f => f > 0 ? butterLP(el.order, cdiv([1, 0], [0, f / el.fc])) : [0, 0],
  // low-pass to band-pass: s -> (s^2 + 1) / (b s), s = i f / f0, b = bandwidth / f0
  bpf: el => f => { if (!(f > 0)) return [0, 0]; const s = [0, f / el.f0], b = el.bw / el.f0; return butterLP(el.order, cdiv([1 - (f / el.f0) ** 2, 0], [b * s[0], b * s[1]])); },
};
/* the generator's waveform as its Fourier series: [DC, [[n, amplitude, phase of cos(n w t + phase)], ...]] */
const NH = 99;
function series(wave, A, duty, nmax) {
  const D = clamp(duty / 100, 0.001, 0.999), out = [];
  if (wave === 'sine') return [0, [[1, A, -Math.PI / 2]]];                         // A sin = A cos(. - pi/2)
  if (wave === 'triangle') {
    // 8A/pi^2 sum (-1)^((n-1)/2) sin(n w t) / n^2, odd n: rising through zero as the sine does
    for (let n = 1; n <= nmax; n += 2) out.push([n, 8 * A / (Math.PI * Math.PI * n * n) * ((n - 1) / 2 % 2 ? -1 : 1), -Math.PI / 2]);
    return [0, out];
  }
  // a pulse train, 1 for the first duty fraction of the period and 0 after: D + sum (2/(n pi)) sin(n pi D) cos(n w (t - D T / 2));
  // a square is 2 p - 1 (A for the first part, -A after), a pulse A p
  const sq = wave === 'square', k = sq ? 2 * A : A;
  for (let n = 1; n <= nmax; n++) { const c = k * 2 / (n * Math.PI) * Math.sin(n * Math.PI * D); if (Math.abs(c) > 1e-15 * A) out.push([n, c, -n * Math.PI * D]); }
  return [sq ? A * (2 * D - 1) : A * D, out];
}
function generator(el, sync) {
  const S = zero('V'), f = el.f;
  if (!(f > 0)) return S;
  const nmax = Math.max(1, Math.min(NH, Math.floor(1e10 / f)));
  const [dc, terms] = sync ? series('square', 2.5, 50, nmax) : series(el.wave, el.amp, el.duty, nmax);
  S.dc = sync ? dc + 2.5 : dc + el.offset;
  const ph0 = el.phase * Math.PI / 180;                      // a phase shift of the whole waveform: n times it at the nth harmonic
  for (const [n, a, ph] of terms) { const p = ph + n * ph0; addTone(S.tones, n * f, a * Math.cos(p), a * Math.sin(p)); }
  return tidy(S);
}
function mixer(A, B, k) {
  const out = zero('V');
  out.dc = k * A.dc * B.dc;
  for (const a of A.tones) addTone(out.tones, a.f, k * a.re * B.dc, k * a.im * B.dc);
  for (const b of B.tones) addTone(out.tones, b.f, k * b.re * A.dc, k * b.im * A.dc);
  // Re(a e^{i w1 t}) Re(b e^{i w2 t}) = (1/2) Re(a b e^{i (w1 + w2) t}) + (1/2) Re(a conj(b) e^{i (w1 - w2) t})
  for (const a of A.tones) for (const b of B.tones) {
    const ab = elecCmul([a.re, a.im], [b.re, b.im]), ac = elecCmul([a.re, a.im], [b.re, -b.im]);
    addTone(out.tones, a.f + b.f, 0.5 * k * ab[0], 0.5 * k * ab[1]);
    const d = a.f - b.f;
    if (Math.abs(d) <= 1e-9 * Math.max(a.f, b.f)) out.dc += 0.5 * k * ac[0];
    else if (d > 0) addTone(out.tones, d, 0.5 * k * ac[0], 0.5 * k * ac[1]);
    else addTone(out.tones, -d, 0.5 * k * ac[0], -0.5 * k * ac[1]);
  }
  // the noise on each input, moved by the other's DC and tones (noise times noise left out); a
  // tone a million times weaker in power than the strongest moves too little to count
  const strong = X => { const m = X.tones.map(t => (t.re * t.re + t.im * t.im) / 4), top = Math.max(0, ...m); return X.tones.map((t, j) => [t.f, m[j]]).filter(q => q[1] > 1e-6 * top); };
  const sides = [[strong(A), B], [strong(B), A]].filter(([T, Y]) => T.length && Y.psd.some(p => p > 0));
  for (let i = 0; i < NF; i++) {
    const f = FG[i];
    let v = A.dc * A.dc * B.psd[i] + B.dc * B.dc * A.psd[i];
    for (const [T, Y] of sides) for (const [tf, m] of T) v += m * (elecPsdAt(Y, Math.abs(f - tf)) + elecPsdAt(Y, f + tf));
    out.psd[i] = k * k * v;
  }
  return tidy(out);
}
function sum(A, B, ga, gb) {
  const out = zero(A.unit === B.unit ? A.unit : 'V');
  out.dc = ga * A.dc + gb * B.dc;
  for (const t of A.tones) addTone(out.tones, t.f, ga * t.re, ga * t.im);
  for (const t of B.tones) addTone(out.tones, t.f, gb * t.re, gb * t.im);
  for (let i = 0; i < NF; i++) out.psd[i] = ga * ga * A.psd[i] + gb * gb * B.psd[i];
  return tidy(out);
}
/* the peak a signal reaches: from its waveform over one period when its tones are all
   harmonics of the lowest, or else at most its DC and every tone's amplitude together */
function peak(S) {
  const bound = Math.abs(S.dc) + S.tones.reduce((a, t) => a + Math.hypot(t.re, t.im), 0);
  if (!S.tones.length) return bound;
  const f0 = S.tones[0].f;
  if (!S.tones.every(t => Math.abs(t.f / f0 - Math.round(t.f / f0)) < 1e-6) || S.tones.length > 400) return bound;
  let pk = 0;
  for (let i = 0; i < 2048; i++) {
    const th = 2 * Math.PI * i / 2048;
    let v = S.dc; for (const t of S.tones) { const a = Math.round(t.f / f0) * th; v += t.re * Math.cos(a) - t.im * Math.sin(a); }
    pk = Math.max(pk, Math.abs(v));
  }
  return pk;
}
/* a comparator: vhi where its input is above the threshold, vlo below. For a periodic input
   (its tones all harmonics of the lowest), the crossings over one period are found on a fine
   grid and placed by interpolation, and the output's Fourier series worked out from them
   exactly (it is piecewise constant): DC and up to NH harmonics. An input whose tones share no
   period is read by its DC and strongest tone. Noise on the input, which would make the edges
   jitter, is not carried. */
function comparator(el, S, note) {
  const out = zero('V'), thr = el.thr, hi = el.vhi, lo = el.vlo;
  if (!S.tones.length) { out.dc = S.dc > thr ? hi : lo; return out; }
  let T = S.tones, f0 = T[0].f;
  if (!T.every(t => Math.abs(t.f / f0 - Math.round(t.f / f0)) < 1e-6) || T.length > 400) {
    const st = T.reduce((a, t) => Math.hypot(t.re, t.im) > Math.hypot(a.re, a.im) ? t : a);
    T = [st]; f0 = st.f;
    note('Its input has tones that share no period: worked out from its DC and strongest tone (' + fmtHz(f0) + ') alone');
  }
  const N = 4096, v = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) { const th = 2 * Math.PI * i / N; let x = S.dc; for (const t of T) { const a = Math.round(t.f / f0) * th; x += t.re * Math.cos(a) - t.im * Math.sin(a); } v[i] = x - thr; }
  // the crossings, as phases in [0, 2 pi), and the state at the start
  const cross = [];
  for (let i = 0; i < N; i++) if ((v[i] > 0) !== (v[i + 1] > 0)) cross.push(2 * Math.PI * (i + v[i] / (v[i] - v[i + 1])) / N);
  if (!cross.length) { out.dc = v[0] > 0 ? hi : lo; return out; }
  const nmax = Math.max(1, Math.min(NH, Math.floor(1e10 / f0)));
  const an = Array.from({ length: nmax + 1 }, () => [0, 0]);
  let up = v[0] > 0, a0 = 0;
  const seg = (a, b, y) => {
    out.dc += y * (b - a) / (2 * Math.PI);
    // a_n = (1/pi) int y e^{-i n th} dth = (y/pi) i (e^{-i n b} - e^{-i n a}) / n
    for (let n = 1; n <= nmax; n++) { const dr = Math.cos(n * b) - Math.cos(n * a), di = -Math.sin(n * b) + Math.sin(n * a); an[n][0] += -y / Math.PI * di / n; an[n][1] += y / Math.PI * dr / n; }
  };
  for (const c of cross) { seg(a0, c, up ? hi : lo); a0 = c; up = !up; }
  seg(a0, 2 * Math.PI, up ? hi : lo);
  for (let n = 1; n <= nmax; n++) addTone(out.tones, n * f0, an[n][0], an[n][1]);
  const sd = elecNoiseRms(S, 0.01, 1e10);
  if (sd > 1e-3 * Math.max(1e-30, peak(S))) note('Noise on its input (' + elecFmtSig(sd, S.unit) + ' rms) would make its edges jitter: that is not carried to its output');
  return tidy(out);
}
/* a bias tee: the RF input through its capacitor (a high-pass at fc), the DC through its inductor (a low-pass), added */
function biasTee(el, RF, DC) {
  const fc = Math.max(1e-6, el.fc);
  return sum(through(RF, f => cdiv([0, f / fc], [1, f / fc]), 'V'), through(DC, f => cdiv([1, 0], [1, f / fc]), 'V'), 1, 1);
}
/* a DAQ: its input sampled at fs and read with bits over +-range. Each tone lands at its alias
   in 0 to fs/2 (folded tones come back with their phase reversed; one at a multiple of fs reads
   as DC), and all the noise, with the quantisation's own (one step squared over 12), folds into
   that band, taken as flat there. Its output is the signal as read, rebuilt. */
function daq(el, S, note) {
  const fs = Math.max(1e-3, el.rate), bits = Math.round(clamp(el.bits, 1, 32)), rng = Math.max(1e-9, el.range), lsb = 2 * rng / 2 ** bits;
  const out = zero(S.unit), folded = [];
  out.dc = S.dc;
  for (const t of S.tones) {
    let fa = t.f % fs, im = t.im;
    if (fa > fs / 2) { fa = fs - fa; im = -im; }
    if (fa <= 1e-9 * fs) out.dc += t.re;
    else if (Math.abs(fa - fs / 2) <= 1e-9 * fs) addTone(out.tones, fs / 2, t.re, 0);
    else addTone(out.tones, fa, t.re, im);
    if (t.f > fs / 2 * (1 + 1e-9)) folded.push({ f: t.f, fa, amp: Math.hypot(t.re, t.im) });
  }
  const sd = elecNoiseRms(S, 0.01, 1e10), qn = lsb / Math.sqrt(12), dens = (sd * sd + qn * qn) / (fs / 2);
  for (let i = 0; i < NF; i++) out.psd[i] = FG[i] <= fs / 2 ? dens : 0;
  if (peak(S) > rng) note('Its input reaches ' + elecFmtSig(peak(S), 'V') + ', past its ±' + elecFmtSig(rng, 'V') + ' range: it would clip');
  if (folded.length) note(folded.length + ' tone' + (folded.length > 1 ? 's' : '') + ' above half its sample rate (' + fmtHz(fs / 2) + ') fold back as aliases');
  return { out: tidy(out), info: { fs, bits, lsb, qn, sd, folded: folded.sort((a, b) => b.amp - a.amp) } };
}
/* ---------- the network, solved ----------
   Every output's signal, in the order the wires need: a block is worked out once all that
   feeds it is. An input left open reads nothing; a loop is reported and its blocks read
   nothing. Returns { out: Map(pkey -> signal), warn: Map(element id -> [notes]) }. */
let memo = { key: null, R: null };
export function solve() {
  const els = project.elements.filter(e => e.type === 'elec' && ELEC_KINDS[e.kind]), wires = (project.fibres || []).filter(F => F.wire);
  // with light in it, the bench as a whole (the trace's key) decides it
  const optical = wires.some(F => [F.a, F.b].some(p => { const E = getEl(p[0]); return E && E.type !== 'elec'; })) || project.elements.some(e => e.type === 'chopper');
  // what the network is: each block's settings and the wiring, not where a block sits on the bench
  const blocks = JSON.stringify([els.map(e => { const { x, y, angle, name, bench, sweeps, ...rest } = e; return rest; }), wires.map(F => [F.a, F.b])]);
  const key = (optical ? traceKeyNow() + '|' + detFieldGen : '') + '|' + blocks + (els.some(e => e.mod) ? '|' + MODS.rev : '');   // a mod's block: as its results stand
  if (memo.key === key) return memo.R;
  const feed = new Map(wires.map(F => [pkey(...F.b), F.a]));     // an input's port, to the output wired to it
  const out = new Map(), warn = new Map(), state = new Map(), lock = new Map();
  const note = (el, msg) => { if (!warn.has(el.id)) warn.set(el.id, []); if (!warn.get(el.id).includes(msg)) warn.get(el.id).push(msg); };
  const byId = new Map(els.map(e => [e.id, e]));
  const input = (el, i) => {
    const src = feed.get(pkey(el.id, i));
    if (!src) return zero();
    const E = byId.get(src[0]);
    if (!E) return fromOptics(src);
    visit(E);
    return out.get(pkey(...src)) || zero();
  };
  // an optical part's output: a chopper's reference, or a photodiode's, which needs the light
  // worked out with every drive on the bench (once, the first time one is asked for)
  let optState = 0;
  const fromOptics = src => {
    const O = getEl(src[0]);
    if (!O) return zero();
    if (O.type === 'chopper') return chopRef(O);
    if (!isDet(O)) return zero();
    if (optState === 1) { note(O, 'Its output feeds back into the light it reads: loops through the light are not solved, so it reads nothing'); return zero(); }
    runOptics();
    return out.get(pkey(...src)) || zero();
  };
  // the light through time at every photodiode, with every drive on the bench: once, when a
  // photodiode's output is first asked for, or at the end when something drives the light
  // (so each one's own signal plot shows it, wired or not)
  let driven = false;
  const runOptics = () => {
    if (optState === 0) {
      optState = 1;
      const drives = [], dets = [];
      for (const E of project.elements) {
        if (E.type === 'elec') continue;
        if (E.type === 'chopper') drives.push({ el: E });
        const base = portsOf(E).length - elecExtra(E).length;
        elecExtra(E).forEach((P, k) => {
          if (P.elec === 'in' && feed.has(pkey(E.id, base + k))) drives.push({ el: E, port: P.name, S: input(E, base + k) });
        });
        if (isDet(E) && elecExtra(E).length) dets.push(E);
      }
      driven = drives.length > 0;
      curDrives = drives;
      const OS = opticalSignals(drives, dets);
      for (const E of dets) out.set(pkey(E.id, portsOf(E).length - 1), detOutput(E, OS.P.get(E.id), m => note(E, m)));
      for (const m of OS.notes) for (const E of dets) if (wires.some(F => F.a[0] === E.id)) note(E, m);
      optState = 2;
    }
  };
  const visit = el => {
    const st = state.get(el.id);
    if (st === 2) return;
    if (st === 1) { note(el, 'Part of a loop: loops are not solved yet, so it reads nothing'); return; }
    state.set(el.id, 1);
    const K = ELEC_KINDS[el.kind], nIn = K.ins.length, set = (j, S) => out.set(pkey(el.id, nIn + j), S);
    const In = K.ins.map((_, i) => input(el, i));
    if (K.mod) modBlock(el, K, In, set, m => note(el, m));
    else switch (el.kind) {
      case 'dc': { const S = zero(); S.dc = el.v; set(0, S); break; }
      case 'sig': set(0, generator(el, false)); set(1, generator(el, true)); break;
      case 'noise': { const S = zero(), e2 = (el.psd * 1e-9) ** 2; for (let i = 0; i < NF; i++) S.psd[i] = FG[i] <= el.bw ? e2 : 0; set(0, S); break; }
      case 'amp': {
        if (In[0].unit === 'A') note(el, 'Its input is a current: a voltage amplifier reads it as volts; a TIA turns a current into a voltage');
        const S = through(In[0], pole(el.gain, el.bw), 'V', () => (el.en * 1e-9) ** 2);
        if (peak(S) > el.vmax) note(el, 'The output would reach ' + elecFmtSig(peak(S), 'V') + ', past its ' + elecFmtSig(el.vmax, 'V') + ' limit: it would clip');
        set(0, S); break;
      }
      case 'tia': {
        if (In[0].unit !== 'A' && (In[0].dc || In[0].tones.length)) note(el, 'Its input is a voltage: a TIA takes a current (a photodiode’s), and reads this as amps');
        // input current noise, and the feedback resistor's own (4kT/R)
        const S = through(In[0], pole(el.gain, el.bw), 'V', () => (el.inoise * 1e-12) ** 2 + (el.gain > 0 ? 4 * KT / el.gain : 0));
        if (peak(S) > el.vmax) note(el, 'The output would reach ' + elecFmtSig(peak(S), 'V') + ', past its ' + elecFmtSig(el.vmax, 'V') + ' limit: it would clip');
        set(0, S); break;
      }
      case 'lpf': case 'hpf': case 'bpf': set(0, through(In[0], ELEC_FILTER[el.kind](el), In[0].unit)); break;
      case 'mixer': set(0, mixer(In[0], In[1], el.k)); break;
      case 'att': { const g = Math.pow(10, -Math.max(0, el.db) / 20); set(0, through(In[0], () => [g, 0], In[0].unit)); break; }
      case 'biastee': set(0, biasTee(el, In[0], In[1])); break;
      case 'comp': set(0, comparator(el, In[0], m => note(el, m))); break;
      case 'daq': { const D = daq(el, In[0], m => note(el, m)); lock.set(el.id, D.info); set(0, D.out); break; }
      case 'sum': set(0, sum(In[0], In[1], el.ga, el.gb)); break;
      case 'node': out.set(pkey(el.id, 0), In[0]); break;     // its one port carries on what it is given
      // out of a feedthrough: what goes into its partner on the other tab
      case 'thru': { const P = partner(el); if (!P) note(el, 'No partner: give a feedthrough on another tab the pair name ' + el.pair); set(0, P ? input(P, 0) : zero()); break; }
      case 'lockin': { const L = lockin(el, In[0], In[1]); lock.set(el.id, L); set(0, L.outX); set(1, L.outY); if (L.note) note(el, L.note); break; }
      default: K.outs.forEach((_, j) => set(j, zero()));
    }
    for (let i = 0; i < nIn; i++) if (K.ins.length && !feed.has(pkey(el.id, i)) && el.kind !== 'scope' && el.kind !== 'thru') note(el, 'Input ' + K.ins[i] + ' is not wired: it reads nothing');
    state.set(el.id, 2);
  };
  for (const el of els) visit(el);
  if (optical && optState === 0) runOptics();
  memo = { key, R: { out, warn, lock, driven } };
  return memo.R;
}
export const signalOf = (el, j) => solve().out.get(pkey(el.id, el.kind === 'node' ? 0 : ELEC_KINDS[el.kind].ins.length + j)) || null;
/* a photodiode's output as its electrical port carries it (beat notes, the bench's drives,
   its noise), for its own Signal views: what its out port would give, wired or not */
function elecDetSignalFull(el) {
  const S = elecDetSignal(el);
  if (S) return S;
  const P = zero('W'), pic = el.type === 'pic';
  P.dc = el.type === 'fcomp' ? pdNetMw(el) : pic ? pdSignal(el).dc : detectorReading(el).mw;
  return detOutput(el, P, () => {});
}
/* a photodiode's output with the bench's drives in it, for its own signal plot: null when
   nothing on the bench drives the light (its beat notes are then all there is) */
function elecDetSignal(el) {
  if (!isDet(el)) return null;
  const R = solve();
  return R.driven ? R.out.get(pkey(el.id, portsOf(el).length - 1)) || null : null;
}
/* what a part's input receives */
export function inputOf(el, i) {
  const F = (project.fibres || []).find(G => G.wire && pkey(...G.b) === pkey(el.id, i));
  const E = F && getEl(F.a[0]);
  return E ? solve().out.get(pkey(...F.a)) || null : null;          // a block's output, or an optical part's (a photodiode's)
}
/* ---------- the lock-in amplifier ----------
   Locks to its reference's fundamental (the lowest of its tones within a tenth of its
   strongest), times the harmonic asked for; zero phase is where that fundamental rises
   through zero, as a bench lock-in sets it from a TTL reference's rising edge (at harmonic
   n, a sine n times as fast rising through zero at that same edge). The signal
   is multiplied by sqrt(2) cos(w t + theta) and by sqrt(2) cos(w t + theta + 90 deg) (the
   mixer, noise and all), then filtered by n poles of time constant tau: X and Y are what
   is left at DC, in rms units, so a sine of amplitude A in phase reads X = A / sqrt(2).
   Their noise is the density beside the reference frequency times the filter's equivalent
   noise bandwidth (1/4, 1/8, 3/32 and 5/64 of 1/tau for 6 to 24 dB/oct). */
const ENBW = [0, 1 / 4, 1 / 8, 3 / 32, 5 / 64];
function lockin(el, Sig, Ref) {
  const res = { outX: zero(Sig.unit), outY: zero(Sig.unit), ok: false };
  const pk = Math.max(0, ...Ref.tones.map(t => Math.hypot(t.re, t.im)));
  const fund = Ref.tones.filter(t => Math.hypot(t.re, t.im) >= 0.1 * pk).sort((a, b) => a.f - b.f)[0];
  if (!fund) { res.note = 'Its reference input carries no tone to lock to'; return res; }
  const h = Math.max(1, Math.round(el.harm)), fd = h * fund.f, th = h * (Math.atan2(fund.im, fund.re) + Math.PI / 2) - Math.PI / 2 + el.phase * Math.PI / 180;
  const refAt = sh => { const R = zero('V'); R.tones.push({ f: fd, re: Math.SQRT2 * Math.cos(th + sh), im: Math.SQRT2 * Math.sin(th + sh) }); return R; };
  const n = Math.round(clamp(el.slope, 1, 4)), tau = Math.max(1e-9, el.tau);
  const LP = f => { let hh = [1, 0]; for (let k = 0; k < n; k++) hh = cdiv(hh, [1, 2 * Math.PI * f * tau]); return hh; };
  const mX = mixer(Sig, refAt(0), 1), mY = mixer(Sig, refAt(Math.PI / 2), 1);
  res.outX = through(mX, LP, Sig.unit); res.outY = through(mY, LP, Sig.unit);
  const enbw = ENBW[n] / tau;
  // the noise on X (and Y): the density the mixer leaves at DC, over the equivalent bandwidth
  const sigma = Math.sqrt(mX.psd[0] * enbw);
  // what the filter lets through of everything else: the largest ripple left on X
  const ripple = Math.max(0, ...res.outX.tones.map(t => Math.hypot(t.re, t.im)));
  // a signal cos(wt + phi) against the reference sqrt2 cos(wt + th) gives X = cos(phi - th)/sqrt2 and, against the
  // reference turned 90 degrees, Y = sin(phi - th)/sqrt2: theta = atan2(Y, X) is how far the signal leads the reference
  const X = res.outX.dc, Y = res.outY.dc;
  Object.assign(res, { ok: true, fref: fund.f, fd, h, X, Y, R: Math.hypot(X, Y), theta: Math.atan2(Y, X) * 180 / Math.PI, sigma, enbw, ripple, tau, n, unit: Sig.unit,
    settle: tau * [0, 5, 7, 9, 10][n] });
  if (!Sig.tones.some(t => Math.abs(t.f - fd) <= 1e-9 * fd)) res.note = 'The signal has nothing at ' + fmtHz(fd) + ': X and Y read only its noise';
  return res;
}
/* ---------- the oscilloscope and the spectrum analyser ----------
   The scope rebuilds each channel from its tones over its time span, from the moment all
   the signals share (the start of the generators' cycles), with a band of +-1 sigma for
   the noise up to its 100 MHz bandwidth. The analyser shows each tone as a peak at its rms
   level in dBV, over the noise in its resolution bandwidth. */
const SCOPE_BW = 1e8;
const CH = ['#db3550', '#0092b2'];   // Jek red, Jek blue
const INST_BW = 1e8;
const fmtSec = v => v >= 1 ? (+v.toPrecision(3)) + ' s' : v >= 1e-3 ? (+(v * 1e3).toPrecision(3)) + ' ms' : v >= 1e-6 ? (+(v * 1e6).toPrecision(3)) + ' µs' : (+(v * 1e9).toPrecision(3)) + ' ns';
/* ---------- readouts ---------- */
function elecFmtSig(v, unit) {
  const a = Math.abs(v);
  if (!(a > 0)) return '0 ' + unit;
  const [d, p] = a >= 1 ? [1, ''] : a >= 1e-3 ? [1e-3, 'm'] : a >= 1e-6 ? [1e-6, 'µ'] : a >= 1e-9 ? [1e-9, 'n'] : a >= 1e-12 ? [1e-12, 'p'] : [1e-15, 'f'];
  return (+(v / d).toPrecision(4)) + ' ' + p + unit;
}
/* rms noise from f1 to f2, from the density */
export function elecNoiseRms(S, f1, f2) {
  let v = 0;
  const n = 200, l1 = Math.log(Math.max(f1, 1e-2)), l2 = Math.log(f2);
  for (let i = 0; i < n; i++) { const f = Math.exp(l1 + (l2 - l1) * (i + 0.5) / n); v += elecPsdAt(S, f) * f * (l2 - l1) / n; }
  return Math.sqrt(v);
}
/* ---------- where light meets the electronics ----------
   Optical parts carry electrical ports too, after any fibre ports: a photodiode's or
   photodetector's output, a laser's modulation input, an AOM's RF level input, an EOM's
   modulation input and an optical chopper's reference output. Wires reach them as they
   reach any block.
   The light is worked out quasi-statically: the electronics are far slower than light
   crossing the bench, so each drive is set at levels across its swing, the bench traced
   again at each, and each photodiode's power read; the power then follows the drive through
   time by that table (exactly, by a straight line, when the table is one). A chopper is
   open or shut. With several drives each is taken alone, the others at their mean, and
   their effects multiply, as they do for parts in series on one beam. A free-space
   photodiode can be read through its diffracted field instead of the trace: slower, and
   right where rays are not (fringes, a focus smaller than the diode's edges). */
export const CHOP_HUB = 5;                                          // mm: the chopper's motor housing, beyond its blade
export function elecExtra(el) {
  const k = 1 / V().scale;
  switch (el.type) {
    case 'detector':                                         // at the back of its semicircle; a receiving horn's at its connector
      if (el.mmw && !el.mmw.part) return [{ x: hornGeom(el).back, y: 0, dx: -1, dy: 0, elec: 'out', name: el.mmw.rx === 'mixer' ? 'IF' : 'out' }];
      return [{ x: -detR(el), y: 0, dx: -1, dy: 0, elec: 'out', name: 'out' }];
    case 'source': {                                         // power and frequency modulation, on its back, when under external control
      if (el.mmw && !el.mmw.part) {                          // a feed horn: an upconverter's IF in, or its modulation inputs, at its connector
        const G = hornGeom(el), d = Math.max(1.5, 0.6 * G.rFl);
        if (el.mmw.tx === 'up') return [{ x: G.back, y: 0, dx: -1, dy: 0, elec: 'in', name: 'if' }];
        return !el.ext ? [] : [{ x: G.back, y: d, dx: -1, dy: 0, elec: 'in', name: 'mod' }, { x: G.back, y: -d, dx: -1, dy: 0, elec: 'in', name: 'fm' }];
      }
      if (!el.ext) return [];
      const { L, hw } = srcBody(el), d = hw / 2;
      return [{ x: -L, y: d, dx: -1, dy: 0, elec: 'in', name: 'mod' }, { x: -L, y: -d, dx: -1, dy: 0, elec: 'in', name: 'fm' }];
    }
    case 'aom': return [{ x: 0, y: el.length / 2 + 4 * k, dx: 0, dy: 1, elec: 'in', name: 'rf' }];
    case 'eom': return [{ x: 0, y: el.length / 2 + 2 * k, dx: 0, dy: 1, elec: 'in', name: 'mod' }];
    case 'chopper': return [{ x: 0, y: -(el.length / 2 + CHOP_HUB), dx: 0, dy: -1, elec: 'out', name: 'ref' }];
    case 'fcomp': {
      if (el.kind === 'laser') return !el.ext ? [] : [{ x: -FC_W / 4, y: FC_H / 2, dx: 0, dy: 1, elec: 'in', name: 'mod' }, { x: FC_W / 4, y: FC_H / 2, dx: 0, dy: 1, elec: 'in', name: 'fm' }];
      const n = { pd: ['out', 'out'], aom: ['in', 'rf'], eom: ['in', 'mod'], stretch: ['in', 'drive'] }[el.kind];
      return n ? [{ x: 0, y: FC_H / 2, dx: 0, dy: 1, elec: n[0], name: n[1] }] : [];
    }
    case 'pic': {                                            // PIC hook: an on-chip photodiode's output, a phase shifter's drive
      const n = { pd: ['out', 'out'], ps: ['in', 'drive'] }[el.kind];
      return n ? [{ x: 0, y: FC_H / 2, dx: 0, dy: 1, elec: n[0], name: n[1] }] : [];
    }
  }
  return [];
}
/* the settings an optical part keeps for the electronics, saved only when set */
function elecNormExtra(e, o) {
  if ((o.type === 'detector' || ((o.type === 'fcomp' || o.type === 'pic') && o.kind === 'pd')) && e.diode === true) o.diode = true;   // no amplifier: a current out
  if (o.type === 'detector' && e.fieldSample === true) o.fieldSample = true;
  if (isLaser(o) && e.ext === true) o.ext = true;            // under external control: its mod and fm inputs
  for (const k of ['modk', 'fmk', 'vsat', 'vpi']) if (e[k] !== undefined && e[k] !== null && isFinite(e[k])) o[k] = +e[k];
}
function elecNormChopper(e, base) {
  return Object.assign(base, { length: Math.max(0.1, num(e.length, 10)), f: Math.max(0, num(e.f, 1000)),
    duty: clamp(num(e.duty, 50), 0.1, 99.9), phase: num(e.phase, 0) });
}
const modk = el => num(el.modk, 100);
const fmk = el => num(el.fmk, 1);
const vsat = el => Math.max(1e-6, num(el.vsat, 1));
const vpi = el => Math.max(1e-6, num(el.vpi, 5));
export const isLaser = el => el.type === 'source' || (el.type === 'fcomp' && el.kind === 'laser');
/* is the light linear in this drive? a laser's power input (not its frequency), kept above zero
   over the swing, with nothing on the bench whose response depends on the power: no gain medium,
   amplifier, doubling crystal, vapour cell (they saturate) and no pulse (fibre nonlinearity) */
function linearDrive(d, lo, hi) {
  if (!isLaser(d.el) || d.port === 'fm' || d.port === 'if') return false;
  if (Math.min(1 + modk(d.el) / 100 * lo, 1 + modk(d.el) / 100 * hi) < 0) return false;
  return !project.elements.some(e => e.type === 'gain' || e.type === 'nlc' || e.type === 'cell' || (e.type === 'fcomp' && (e.kind === 'amp' || e.kind === 'soa')) || (isLaser(e) && e.tau > 0));
}
function applyDrive(el, v, port) {
  // a laser's frequency by fmk GHz per volt: its vacuum wavelength moves by -lambda^2 df / c
  // an upconverting horn: the carrier's power follows the square of the IF voltage into its 50 ohm, less its conversion loss
  if (isLaser(el) && port === 'if') el.power = el.mmw ? 1000 * v * v / 50 * Math.pow(10, -(el.mmw.cl || 0) / 10) : 0;
  else if (isLaser(el) && port === 'fm') { const df = fmk(el) * 1e9 * v; el.wavelength = el.wavelength / (1 + el.wavelength * 1e-9 * df / 299792458); }
  else if (isLaser(el)) el.power = el.power * Math.max(0, 1 + modk(el) / 100 * v);
  else if (el.type === 'aom') el.eff = el.eff * Math.sin(Math.PI / 2 * v / vsat(el)) ** 2;
  else if (el.type === 'fcomp' && el.kind === 'aom') el._eta = Math.sin(Math.PI / 2 * v / vsat(el)) ** 2;
  else if (el.type === 'eom' || (el.type === 'fcomp' && (el.kind === 'eom' || el.kind === 'stretch')) || (el.type === 'pic' && el.kind === 'ps')) el._v = v;
  else if (el.type === 'chopper') el._closed = !(v > 0.5);
}
/* trace the bench with something changed, read it, and put everything back as it was */
function withOptics(apply, read) {
  traceScene();
  const keep = { T: lastTrace, K: lastTraceKey, ms: lastTraceMs, V: VSRC };
  const snap = project.elements.map(e => [e, Object.assign({}, e)]);
  try { apply(); traceSceneRaw(); return read(); } finally {
    for (const [e, s] of snap) { for (const k of Object.keys(e)) if (!(k in s)) delete e[k]; Object.assign(e, s); }
    setLastTrace(keep.T); setLastTraceKey(keep.K); setLastTraceMs(keep.ms); setVSRC(keep.V);
    statsCache.clear(); diffCache.clear(); binCache.clear();
  }
}
export const isDet = el => el.type === 'detector' || ((el.type === 'fcomp' || el.type === 'pic') && el.kind === 'pd');
/* the light on a photodiode, mW, as the bench is traced now */
function readDet(el) {
  if (el.type === 'fcomp') return pdNetMw(el);
  if (el.type === 'pic') return lastTrace.net ? netPower(lastTrace.net.pd.get(el.id), lastTrace.net.keys) : 0;
  // sampled from the field: from the field worker, off the page (the last reading meanwhile)
  if (el.fieldSample && !hooks.fieldHeld()) { const r = detectorFieldResult(el); return r ? r.mw : 0; }
  return detectorReading(el).mw;
}
const scaled = (S, k, unit) => { const o = zero(unit || S.unit); o.dc = k * S.dc; o.tones = S.tones.map(t => ({ f: t.f, re: k * t.re, im: k * t.im })); for (let i = 0; i < NF; i++) o.psd[i] = k * k * S.psd[i]; return o; };
/* a drive's waveform over one period of its lowest tone, when its tones are all harmonics of
   that one; a long series smoothed by Lanczos's factors, as on the scope */
function oneCycle(S, M, fejer) {
  if (!S.tones.length || S.tones.length > 400) return null;
  const f0 = Math.min(...S.tones.map(t => t.f));
  if (!S.tones.every(t => Math.abs(t.f / f0 - Math.round(t.f / f0)) < 1e-6)) return null;
  const nmax = Math.max(...S.tones.map(t => Math.round(t.f / f0))), lz = S.tones.length >= 10 ? nmax + 1 : 0;
  const v = new Float64Array(M);
  for (const t of S.tones) {
    // Fejer's factors never overshoot (for the drive's true swing); Lanczos's follow it closer (for the waveform)
    const n = Math.round(t.f / f0), u = lz ? Math.PI * n / lz : 0, sg = !lz ? 1 : fejer ? 1 - n / lz : u ? Math.sin(u) / u : 1;
    for (let m = 0; m < M; m++) { const a = 2 * Math.PI * n * m / M; v[m] += sg * (t.re * Math.cos(a) - t.im * Math.sin(a)); }
  }
  for (let m = 0; m < M; m++) v[m] += S.dc;
  return { f0, v };
}
/* the chopper's opening, 1 open and 0 shut, as a signal: open for the first duty of each cycle from its phase */
function chopWave(el, hi) {
  const S = zero('V');
  if (!(el.f > 0)) { S.dc = hi; return S; }
  const [dc, terms] = series('pulse', hi, el.duty, Math.max(1, Math.min(NH, Math.floor(1e10 / el.f)))), ph0 = el.phase * Math.PI / 180;
  S.dc = dc;
  for (const [n, a, ph] of terms) { const p = ph - n * ph0; addTone(S.tones, n * el.f, a * Math.cos(p), a * Math.sin(p)); }
  return tidy(S);
}
const LEVELS = 21;
const CYCLE = 512;
/* a natural cubic spline's second derivatives through y on a unit grid (the tridiagonal solve) */
function spline2(y) {
  const n = y.length, M = new Float64Array(n), c = new Float64Array(n), d = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const r = 6 * (y[i + 1] - 2 * y[i] + y[i - 1]), m = 4 - (i > 1 ? c[i - 1] : 0);
    c[i] = 1 / m; d[i] = (r - (i > 1 ? d[i - 1] : 0)) / m;
  }
  for (let i = n - 2; i >= 1; i--) M[i] = d[i] - c[i] * M[i + 1];
  return M;
}
let optMemo = { key: null, R: null };
/* each photodiode's light through time, mW, given the drives: Map(id -> signal), and notes */
function opticalSignals(drives, dets) {
  const key = traceKeyNow() + '|' + JSON.stringify(drives.map(d => [d.el.id, d.port, d.S ? [d.S.dc, d.S.tones, Array.from(d.S.psd)] : 0])) + '|' + dets.map(e => e.id);
  if (optMemo.key === key) return optMemo.R;
  const analog = drives.filter(d => d.S), chops = drives.filter(d => !d.S);
  const atMean = skip => { for (const d of analog) if (d !== skip) applyDrive(d.el, d.S.dc, d.port); };
  const read = () => dets.map(readDet);
  const ref = drives.length ? withOptics(() => atMean(null), read) : read();
  const per = [], notes = [];
  for (const d of chops) {
    const shut = withOptics(() => { atMean(null); applyDrive(d.el, 0); }, read), W = chopWave(d.el, 1);
    // P = P_shut + (P_open - P_shut) w(t)
    per.push(dets.map((_, j) => { const S = scaled(W, ref[j] - shut[j], 'W'); S.dc += shut[j]; return S; }));
  }
  for (const d of analog) {
    const S = d.S, C = oneCycle(S, CYCLE), Cf = oneCycle(S, CYCLE, true);
    // the drive's swing: from its waveform without the overshoot a cut-off series has (a square's
    // Gibbs ears are not in the square), so the bench is traced only where the drive really goes
    let lo = S.dc, hi = S.dc;
    if (Cf) for (const v of Cf.v) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    else { const sw = S.tones.reduce((a, t) => a + Math.hypot(t.re, t.im), 0); lo -= sw; hi += sw; }
    const sd = Math.sqrt(S.psd.reduce((a, p, i) => a + p * (i ? FG[i] - FG[i - 1] : 0), 0));
    lo -= 3 * sd; hi += 3 * sd;
    if (!(hi - lo > 1e-12)) { lo -= 1e-3; hi += 1e-3; }
    // a laser's power, driven where it stays above zero, on a bench where nothing saturates: the
    // light everywhere is exactly in proportion to it, so its two ends give the whole straight line
    if (linearDrive(d, lo, hi)) {
      const [y0, y1] = [lo, hi].map(v => withOptics(() => { atMean(d); applyDrive(d.el, v, d.port); }, read));
      per.push(dets.map((_, j) => {
        const k = (y1[j] - y0[j]) / (hi - lo), out = zero('W');
        out.dc = y0[j] + k * (S.dc - lo);
        for (const t of S.tones) addTone(out.tones, t.f, k * t.re, k * t.im);
        for (let i = 0; i < NF; i++) out.psd[i] = k * k * S.psd[i];
        return tidy(out);
      }));
      continue;
    }
    const LV = LEVELS - 4, lv = Array.from({ length: LV }, (_, m) => lo + (hi - lo) * m / (LV - 1));
    const tab = lv.map(v => withOptics(() => { atMean(d); applyDrive(d.el, v, d.port); }, read));
    per.push(dets.map((_, j) => {
      // between levels, a natural cubic spline, its ends two levels further out by cubic extrapolation
      // of the last four (so its loose ends do not bend the curve where the drive goes)
      const y = tab.map(r => r[j]), n = LV - 1;
      const yv = [10 * y[0] - 20 * y[1] + 15 * y[2] - 4 * y[3], 4 * y[0] - 6 * y[1] + 4 * y[2] - y[3], ...y,
        4 * y[n] - 6 * y[n - 1] + 4 * y[n - 2] - y[n - 3], 10 * y[n] - 20 * y[n - 1] + 15 * y[n - 2] - 4 * y[n - 3]], M2 = spline2(yv);
      const P = v => {
        // beyond the swing (a waveform's overshoot), the end of it
        const x = clamp((v - lo) / (hi - lo) * n, 0, n) + 2, i = Math.min(LV, Math.floor(x)), t = x - i;
        return (1 - t) * yv[i] + t * yv[i + 1] + ((1 - t) ** 3 - (1 - t)) * M2[i] / 6 + (t ** 3 - t) * M2[i + 1] / 6;
      };
      const slope = (y[n] - y[0]) / (hi - lo), line = v => y[0] + slope * (v - lo);
      const straight = y.every((r, m) => Math.abs(r - line(lv[m])) <= 1e-9 * Math.max(1e-30, ...y.map(Math.abs)));
      // the noise on the drive moves the light by the local slope
      const xm = clamp((S.dc - lo) / (hi - lo) * n, 0, n), im = Math.min(n - 1, Math.floor(xm));
      const ls = (y[im + 1] - y[im]) / (lv[im + 1] - lv[im]);
      const out = zero('W');
      for (let i = 0; i < NF; i++) out.psd[i] = ls * ls * S.psd[i];
      if (straight || !C) {
        if (!straight && S.tones.length) notes.push('A drive whose tones are not harmonics of one frequency moves the light by its slope at its mean (small-signal)');
        out.dc = P(S.dc);
        for (const t of S.tones) addTone(out.tones, t.f, (straight ? slope : ls) * t.re, (straight ? slope : ls) * t.im);
        return tidy(out);
      }
      // the light through one cycle, and its harmonics
      const w = Array.from(C.v, P);
      out.dc = w.reduce((a, b) => a + b, 0) / CYCLE;
      for (let n = 1; n <= Math.min(NH, CYCLE / 2 - 1); n++) {
        let re = 0, im2 = 0;
        for (let m = 0; m < CYCLE; m++) { const a = 2 * Math.PI * n * m / CYCLE; re += w[m] * Math.cos(a); im2 += w[m] * Math.sin(a); }
        addTone(out.tones, n * C.f0, 2 * re / CYCLE, -2 * im2 / CYCLE);
      }
      return tidy(out);
    }));
  }
  const R = new Map();
  dets.forEach((el, j) => {
    let P;
    if (!per.length) { P = zero('W'); P.dc = ref[j]; }
    else if (per.length === 1) P = per[0][j];
    else if (ref[j] > 0) { P = per[0][j]; for (let i = 1; i < per.length; i++) P = mixer(P, scaled(per[i][j], 1 / ref[j]), 1); }
    else { P = zero('W'); for (const q of per) P = sum(P, q, 1, 1); P.dc -= (per.length - 1) * ref[j]; }   // none of it through: their changes add
    P.unit = 'W';
    R.set(el.id, P);
  });
  optMemo = { key, R: { P: R, notes: [...new Set(notes)] } };
  return optMemo.R;
}
/* a photodiode's output, from the light on it (mW, through time): a current for a bare
   diode, a voltage through the amplifier of a photodetector, with the beat notes the light
   carries, shot noise and the amplifier's own */
let curDrives = [];
function detOutput(el, P, note) {
  if (el.mmw && !el.mmw.part) return el.mmw.rx === 'mixer' ? rfMixerOutput(el, P, note) : rfVideoOutput(el, P, note);
  const fibre = el.type === 'fcomp' || el.type === 'pic', diode = !!el.diode, PS = pdSignal(el);
  const rd = fibre ? null : detectorReading(el);
  const R = fibre ? pdResp(el) : rd.mw > 0 ? rd.mA / rd.mw : responsivity(el, benchNms()[0]);
  const L = scaled(P, 1);
  for (const t of PS.tones) if (!t.incoh) addTone(L.tones, t.f, t.amp * Math.cos(t.ph), t.amp * Math.sin(t.ph));
  const I = scaled(L, 1e-3 * R, 'A'), q = 1.602176634e-19;
  let n2 = 2 * q * (Math.max(0, I.dc) + (el.dark || 0) * 1e-9);
  if (!diode) n2 += (el.gain > 0 ? 4 * KT / el.gain : 0) + ((el.ampNoise || 0) * 1e-12) ** 2;
  if (fibre && PS.noise && PS.B > 0) n2 += (PS.noise.parts.sigAse + PS.noise.parts.aseAse) / PS.B;
  const S = through(I, pole(diode ? 1 : el.gain, el.bandwidth), diode ? 'A' : 'V', () => n2);
  if (!diode && peak(S) > el.vmax) note('The output would reach ' + elecFmtSig(peak(S), 'V') + ', past its ' + elecFmtSig(el.vmax, 'V') + ' limit: it would clip');
  if (PS.tones.some(t => t.incoh)) note('Beat notes between different lasers are left out: their phase wanders');
  return S;
}
/* ---------- receiving horns ----------
   A video detector (a square-law diode) puts out its responsivity (V/W) times the power its
   mode takes in, with its NEP as noise, through its video bandwidth. A mixer puts out the IF:
   each feed horn's carrier comes down to |f - f_LO|, at the power it delivers less the
   conversion loss, as a tone of sqrt(2 R P) volts across 50 ohm, with the phase of the field at
   the horn (so two paths to one horn beat as they should). The receiver's noise temperature
   and what it looks into set the noise, k (T_ant + T_rx) R, referred to its input. A feed horn
   that is an upconverter sends its IF input up and this mixer brings it down: the IF out is the
   drive, scaled by the link, mixed with the difference of the two local oscillators. A carrier
   whose power the bench's drives move puts its square root on the IF (linearised about the
   mean). */
const R_IF = 50;
function rfVideoOutput(el, P, note) {
  const rf = el.mmw, L = scaled(P, 1e-3 * rf.rv, 'V'), n2 = (rf.rv * rf.nep * 1e-12) ** 2;
  const S = through(L, pole(1, rf.vbw * 1e6), 'V', () => n2);
  if (peak(S) > el.vmax) note('The output would reach ' + elecFmtSig(peak(S), 'V') + ', past its ' + elecFmtSig(el.vmax, 'V') + ' limit: it would clip');
  return S;
}
function rfMixerOutput(el, P, note) {
  const rf = el.mmw, C = rfCoupling(el), gcl = Math.pow(10, -rf.cl / 10);
  let out = zero('V');
  const tone = (f, ph) => { const T = zero('V'); if (f > 0) addTone(T.tones, f, Math.cos(ph), Math.sin(ph)); else T.dc = Math.cos(ph); return T; };
  if (C) for (const ln of C.lines) {
    const src = getEl(ln.id), fif = Math.abs(ln.ghz - rf.lo) * 1e9;
    if (fif > 1e10) { note('The IF from ' + (src ? src.name : 'a horn') + ' would be ' + fmtHz(fif) + ', past the electronics\u2019 10 GHz: left out'); continue; }
    if (src && src.mmw && src.mmw.tx === 'up') {
      const d = curDrives.find(q => q.el.id === ln.id && q.port === 'if');
      if (!d || !d.S) { note((src.name) + ' is an upconverter with nothing on its IF input: no carrier'); continue; }
      // from the IF in to the IF out: the bench, traced at the horn's nominal power, gives the link's power gain
      const G = ln.mw / Math.pow(10, src.mmw.dbm / 10) * Math.pow(10, -src.mmw.cl / 10) * gcl;
      out = sum(out, mixer(scaled(d.S, Math.sqrt(G), 'V'), tone(fif, ln.ph), 1), 1, 1);
      continue;
    }
    const Vp = Math.sqrt(2 * R_IF * ln.mw * 1e-3 * gcl), A = zero('V');
    A.dc = Vp;
    if (P && P.dc > 0) {                                   // the carrier's power moved by the bench's drives: its square root, about the mean
      for (const t of P.tones) addTone(A.tones, t.f, Vp * t.re / (2 * P.dc), Vp * t.im / (2 * P.dc));
      for (let i = 0; i < NF; i++) A.psd[i] = Vp * Vp * P.psd[i] / (4 * P.dc * P.dc);
      const sw = P.tones.reduce((a, t) => a + Math.hypot(t.re, t.im), 0);
      if (sw > 0.3 * P.dc) note('The carrier\u2019s power swings by more than 30%: the IF follows its square root, taken as a straight line about the mean');
    }
    out = sum(out, mixer(A, tone(fif, ln.ph), 1), 1, 1);
  }
  const n2 = KT / 295 * (rf.tant + rf.trx) * R_IF * gcl;
  return through(out, pole(1, rf.ifbw * 1e6), 'V', () => n2);
}
/* the chopper's reference output: 0 to 5 V, rising as it opens */
const chopRef = el => chopWave(el, 5);
const elecHitChopper = (el, lx, ly, tol) => Math.abs(lx) <= 2.5 + tol && ly >= -(el.length / 2 + CHOP_HUB) - tol && ly <= el.length / 2 + tol;
const elecChopSurfaces = el => el._closed ? [makeSurf(el, 0, 0, 0, 0, [], el.length / 2, { kind: 'absorb' })] : [];
function elecChopperReadout(el) {
  return [[['Open', (+el.duty.toPrecision(3)) + '% of each ' + fmtSec(el.f > 0 ? 1 / el.f : Infinity) + ' cycle'], ['Reference', '0 to 5 V at ' + fmtHz(el.f)]],
    'Light through it is chopped: a photodiode behind it reads the light when open, and nothing from it when shut.'];
}
/* the electrical rows added to an optical part's readout */
function elecMoreReadout(el, parts) {
  const X = elecExtra(el);
  if (!X.length) return parts;
  const base = portsOf(el).length - X.length, wires = (project.fibres || []).filter(F => F.wire);
  const rows = parts ? parts[0].slice() : [];
  X.forEach((P, k) => {
    const p = pkey(el.id, base + k), F = wires.filter(G => pkey(...G.a) === p || pkey(...G.b) === p);
    if (!F.length) return;
    const ends = F.map(G => { const o = pkey(...G.a) === p ? G.b : G.a, E = getEl(o[0]); return E ? E.name + ' ' + portName(E, o[1]) : '?'; });
    rows.push([{ out: 'Out port', mod: 'Mod in port', fm: 'FM in port', rf: 'RF in port', ref: 'Ref out port', drive: 'Drive in port', if: 'IF in port', IF: 'IF out port' }[P.name] || P.name, (P.elec === 'out' ? '→ ' : '← ') + ends.join(', ')]);
    if (P.elec === 'out' && isDet(el)) rows.push(...describe(solve().out.get(p) || zero()));
  });
  for (const w of solve().warn.get(el.id) || []) rows.push(['Note', w]);
  return [rows, parts ? parts[1] : ''];
}
function makeOptic(kind, x, y) {
  if (kind === 'chopper') return normElement({ type: 'chopper', name: nextName('Chopper'), x, y, angle: 0 });
  return null;
}
function describe(S) {
  const u = S.unit, rows = [];
  rows.push(['DC', elecFmtSig(S.dc, u)]);
  const big = S.tones.slice().sort((a, b) => Math.hypot(b.re, b.im) - Math.hypot(a.re, a.im)).slice(0, 5).sort((a, b) => a.f - b.f);
  for (const t of big) {
    const A = Math.hypot(t.re, t.im);
    rows.push([fmtHz(t.f), elecFmtSig(A, u) + ' peak (' + elecFmtSig(A / Math.SQRT2, u) + ' rms), phase ' + (+(Math.atan2(t.im, t.re) * 180 / Math.PI).toFixed(1)) + '°']);
  }
  if (S.tones.length > 5) rows.push(['', (S.tones.length - 5) + ' more tones']);
  let pk = 0, fpk = 0; for (let i = 0; i < NF; i++) if (S.psd[i] > pk) { pk = S.psd[i]; fpk = FG[i]; }
  if (pk > 0) rows.push(['Noise', elecFmtSig(Math.sqrt(elecPsdAt(S, 1000)), u) + '/√Hz at 1 kHz; ' + elecFmtSig(elecNoiseRms(S, 1, 1e9), u) + ' rms from 1 Hz to 1 GHz']);
  return rows;
}
function elecReadout(el) {
  const K = ELEC_KINDS[el.kind], R = solve(), rows = [];
  K.outs.forEach((name, j) => {
    const S = signalOf(el, j);
    if (!S || el.kind === 'scope' || el.kind === 'spec' || el.kind === 'lockin') return;
    rows.push([K.outs.length > 1 ? 'Output ' + name : 'Output', '']);
    rows.push(...describe(S));
  });
  if (el.kind === 'lockin') {
    const L = R.lock.get(el.id), u = L && L.unit || 'V';
    if (L && L.ok) {
      rows.push(['Reference', fmtHz(L.fref) + (L.h > 1 ? ', detecting its harmonic ' + L.h + ' at ' + fmtHz(L.fd) : '')],
        ['X', elecFmtSig(L.X, u) + ' rms'], ['Y', elecFmtSig(L.Y, u) + ' rms'], ['R', elecFmtSig(L.R, u) + ' rms'], ['θ', (+L.theta.toFixed(2)) + '°'],
        ['Noise on X, Y', elecFmtSig(L.sigma, u) + ' rms (noise bandwidth ' + (+L.enbw.toPrecision(3)) + ' Hz)' + (L.sigma > 0 ? ': R/σ = ' + (+(L.R / L.sigma).toPrecision(3)) : '')],
        ['Settles', 'in about ' + fmtSec(L.settle) + ' (to 99%)']);
      if (L.ripple > 1e-3 * Math.max(L.R, 1e-30)) rows.push(['Ripple', elecFmtSig(L.ripple, u) + ' left on X by the filter (lengthen the time constant or steepen the slope)']);
    }
  }
  if (el.kind === 'daq') {
    const D = R.lock.get(el.id);
    if (D) {
      rows.unshift(['Sampling', (+D.fs.toPrecision(4)) + ' S/s (up to ' + fmtHz(D.fs / 2) + '), ' + D.bits + ' bits'],
        ['One step', elecFmtSig(D.lsb, 'V') + ' (quantisation noise ' + elecFmtSig(D.qn, 'V') + ' rms)']);
      if (D.folded.length) rows.splice(2, 0, ['Aliases', D.folded.slice(0, 4).map(q => fmtHz(q.f) + ' \u2192 ' + fmtHz(q.fa)).join(', ') + (D.folded.length > 4 ? ', \u2026' : '')]);
    }
  }
  for (const w of R.warn.get(el.id) || []) rows.push(['Note', w]);
  const what = el.kind === 'daq' ? 'The signal as it reads it: tones moved to their aliases below half the sample rate, the noise and quantisation folded into that band. Its output carries it on.'
    : el.kind === 'comp' ? 'Its output switches between its two levels as its input crosses the threshold.'
    : el.kind === 'lockin' ? 'X and Y are rms, as a bench lock-in reads them: a sine of amplitude A in phase gives X = A/√2. Its outputs carry X and Y on.'
    : el.kind === 'scope' || el.kind === 'spec' ? 'What reaches its inputs, in steady state.'
    : 'Steady state: DC, the strongest tones (amplitude and phase of a cosine), and the noise density.';
  return [rows, what];
}

export const ELEC = {
  KINDS: ELEC_KINDS,
  YELLOW: ELEC_YELLOW,
  PALETTE: ELEC_PALETTE,
  norm: elecNorm,
  make: elecMake,
  hit: elecHit,
  halfSize: elecHalfSize,
  linkKind: elecLinkKind,
  dirOf: elecDirOf,
  orient: elecOrient,
  readout: elecReadout,
  extra: elecExtra,
  normExtra: elecNormExtra,
  normChopper: elecNormChopper,
  detSignal: elecDetSignal,
  detSignalFull: elecDetSignalFull,
  fmtSig: elecFmtSig,
  noiseRms: elecNoiseRms,
  psdAt: elecPsdAt,
  hitChopper: elecHitChopper,
  chopSurfaces: elecChopSurfaces,
  chopperReadout: elecChopperReadout,
  moreReadout: elecMoreReadout,
  ports: portList,
  names: elecNames,
  label: el => ELEC_KINDS[el.kind] ? ELEC_KINDS[el.kind].label : 'Electronics',
};
