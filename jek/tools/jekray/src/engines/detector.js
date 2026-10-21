import { cdotc } from '../core/maths.js';
import { C_MM } from '../core/modulators.js';
import { pdResp, responsivity } from '../core/rf.js';
import { cohGamma, splitRoot } from '../core/coherence.js';
import { deg } from '../state/project.js';
import { benchNms } from '../state/elements.js';
import { lastTrace } from './trace.js';
import { arrivalField, arrivalWindow, detectorReading, deviceMemo, faceArrivals } from './fibre-face.js';
import { netPower } from './fibre.js';
import { ELEC } from './elec.js';
import { detectorFieldResult, viaCavity } from './pd-cavity.js';

/* ==========================================================================
   What a photodetector reads: the tones that beat on it, its net power, the signal it puts out,
   and an optical spectrum analyser's lines. The instruments that show these: ui/instruments.js.
   ========================================================================== */

/* tones from pairs [{fo, dl, E, root, lp (its line's mW), key, nm}]: same launch pairs at different offsets, and different lasers */
function beatTones(parts) {
  const tones = new Map(), add = (f, re, im, incoh) => {
    const k = (incoh ? 'x' : '') + Math.round(f);
    const t = tones.get(k) || { f, re: 0, im: 0, incoh }; t.re += re; t.im += im; tones.set(k, t);
  };
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    let a = parts[i], b = parts[j];
    if (a.key === b.key) {
      if (a.fo === b.fo) continue;
      if (a.fo > b.fo) [a, b] = [b, a];
      // the fields go as e^{i w t}: the power holds 2 Re[conj(E_a) E_b e^{i (w_b - w_a) t}], so
      // the beat's phase is that of conj(E_a) E_b (cdotc gives E_a conj(E_b))
      const g = cohGamma(a.root), c = cdotc(a.E, b.E), w = 2 * (g ? g(a.dl - b.dl) : 1) * (a.lp || 0);
      add(b.fo - a.fo, w * c[0], -w * c[1], false);
    } else if (a.root !== b.root) {
      // two lasers: their difference in frequency, with the offsets
      let df = C_MM / (b.nm * 1e-6) + b.fo - (C_MM / (a.nm * 1e-6) + a.fo);
      if (df < 0) { [a, b] = [b, a]; df = -df; }
      if (df > 1e12) continue;
      const c = cdotc(a.E, b.E), w = 2 * Math.sqrt((a.lp || 0) * (b.lp || 0));
      add(df, w * Math.hypot(c[0], c[1]), 0, true);
    }
  }
  return [...tones.values()].map(t => ({ f: t.f, amp: Math.hypot(t.re, t.im), ph: Math.atan2(t.im, t.re), incoh: t.incoh })).filter(t => t.amp > 1e-12).sort((x, y) => x.f - y.f);
}

/* the light on a fibre photodetector, mW: a balanced one's second input taken from its first */
export function pdNetMw(el) {
  const net = lastTrace.net;
  if (!net) return 0;
  const p = netPower(net.pd.get(el.id), net.keys);
  return el.balanced ? p - netPower(net.pd.get(el.id + '~'), net.keys) : p;
}

/* a fibre photodiode's light, as parts */
function fibrePdParts(el, minus) {
  const net = lastTrace.net, out = [];
  if (!net) return out;
  const byG = net.pd.get(el.id + (minus ? '~' : ''));
  if (!byG) return out;
  // broadband light (an amplifier's ASE, an LED's slices) makes no beat notes: its noise is counted apart
  for (const K of net.keys) if (!K.root.ase && !K.root.slice) for (const w of byG.get(K.gk) || []) out.push({ fo: w.fo || 0, dl: w.dl, E: w.E, root: K.root, lp: K.lp, key: K.gk, nm: K.nm });
  return out;
}

/* a free-space photodiode's light: each arriving beam's field summed over the diode against
   each other's, a pair at a time. Its parts' E are then the pair integrals' square roots, so
   they are handled here directly */
function freePdTones(el, coarse) {
  const arr = faceArrivals(el);
  if (arr.length < 2) return [];
  const a = el.length / 2, [u0, u1, v0, v1] = arrivalWindow(arr, a);
  if (!(u1 > u0) || !(v1 > v0)) return [];
  const N = coarse ? 32 : 64, du = (u1 - u0) / N, dv = (v1 - v0) / N, pts = [];   // (coarse: meanwhile, the cavity's field on its way)
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const u = u0 + (i + 0.5) * du, v = v0 + (j + 0.5) * dv; if (u * u + v * v <= a * a) pts.push([u, v]); }
  const key = A => A.coh.replace(/@[^#]*/, ''), root = A => splitRoot(A.src), dA = du * dv;
  // beams of one fully coherent laser at one offset do not beat with each other, and every pair
  // of them across two offsets is weighted alike: their fields are summed first and the sums
  // paired (a cavity's dozens of round trips become one beam a sideband). A laser of finite
  // coherence weighs each pair by its delay, so its beams stay apart; so do pairs across lasers,
  // each adding its own magnitude
  const groups = new Map();
  arr.forEach((A, i) => {
    const k = cohGamma(root(A)) ? 'i' + i : key(A) + '|' + A.fo;
    const g = groups.get(k);
    if (g) { g.mem.push(i); return; }
    groups.set(k, { A, mem: [i] });
  });
  const Fi = arr.map(A => pts.map(([u, v]) => arrivalField(A, u, v)));
  const G = [...groups.values()];
  const F = G.map(g => g.mem.length === 1 ? Fi[g.mem[0]] : Fi[g.mem[0]].map((_, k) => { const t = [0, 0, 0, 0]; for (const m of g.mem) for (let c = 0; c < 4; c++) t[c] += Fi[m][k][c]; return t; }));
  const pairInt = (FA, FB) => { let re = 0, im = 0; for (let k = 0; k < pts.length; k++) { const c = cdotc(FA[k], FB[k]); re += c[0]; im += c[1]; } return [re * dA, im * dA]; };
  const tones = new Map(), add = (f, re, im, incoh) => {
    const k = (incoh ? 'x' : '') + Math.round(f), t = tones.get(k) || { f, re: 0, im: 0, incoh }; t.re += re; t.im += im; tones.set(k, t);
  };
  for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) {
    let A = G[i].A, B = G[j].A;
    const same = key(A) === key(B);
    if (same && A.fo === B.fo) continue;
    if (!same && root(A) === root(B)) continue;
    let re, im;
    if (same) {
      [re, im] = pairInt(F[i], F[j]);
      if (A.fo > B.fo) { [A, B] = [B, A]; im = -im; }
      // re + i im is now <E_A conj(E_B)>, A the lower: the beat's phase is its conjugate's
      const g = cohGamma(root(A)), w = 2 * (g ? g(A.gpl + A.lag - B.gpl - B.lag) : 1) * (A.b.lmw || 0);
      add(B.fo - A.fo, w * re, -w * im, false);
    } else {
      let df = C_MM / (B.nm * 1e-6) + B.fo - (C_MM / (A.nm * 1e-6) + A.fo);
      if (Math.abs(df) > 1e12) continue;
      // two lasers: each pair of their beams on its own, as before
      let m = 0;
      for (const p of G[i].mem) for (const q of G[j].mem) { const [r2, i2] = pairInt(Fi[p], Fi[q]); m += Math.hypot(r2, i2); }
      add(Math.abs(df), 2 * Math.sqrt((A.b.lmw || 0) * (B.b.lmw || 0)) * m, 0, true);
    }
  }
  return [...tones.values()].map(t => ({ f: t.f, amp: Math.hypot(t.re, t.im), ph: Math.atan2(t.im, t.re), incoh: t.incoh })).filter(t => t.amp > 1e-12).sort((x, y) => x.f - y.f);
}

/* An optical spectrum analyser's view: each launch reaching it as a line at its wavelength, as
   wide as its own line (lambda^2 / coherence length: a laser's narrow, an LED's or a slice of
   ASE broad), seen through the analyser's resolution: a Gaussian of width sqrt(line^2 + rbw^2)
   holding the line's power, so a line narrower than the resolution peaks at its power and a
   broad one at its power in a resolution bandwidth. */
export function osaLines(el) {
  const net = lastTrace.net, out = [];
  if (!net) return out;
  const byG = net.pd.get(el.id);
  for (const K of net.keys) {
    const m = netPower(byG, [K]);
    if (!(m > 1e-15)) continue;
    const w = K.root.coh > 0 ? K.nm * K.nm * 1e-6 / K.root.coh : 0, k = K.nm.toFixed(5) + '|' + w.toPrecision(4);
    const q = out.find(x => x.k === k);
    if (q) q.mw += m; else out.push({ k, nm: K.nm, mw: m, w, name: K.root.name || '' });
  }
  return out.sort((a, b) => a.nm - b.nm);
}

export function osaTrace(el, lines, lo, hi, n) {
  const rbw = Math.max(1e-6, el.rbw), xs = [], ys = [];
  for (let i = 0; i < n; i++) {
    const x = lo + (hi - lo) * i / (n - 1);
    let p = 0;
    for (const L of lines) { const W = Math.hypot(L.w, rbw); p += L.mw * rbw / W * Math.exp(-4 * Math.LN2 * ((x - L.nm) / W) ** 2); }
    xs.push(x); ys.push(p);
  }
  return { xs, ys };
}

/* its span: as set, or every line with three of its widths either side (at least 40 resolutions) */
export function osaSpan(el, lines) {
  const rbw = Math.max(1e-6, el.rbw);
  let lo = el.wmin, hi = el.wmax;
  if (lo > 0 && hi > lo) return [lo, hi];
  if (lines.length) { lo = Math.min(...lines.map(L => L.nm - 3 * Math.hypot(L.w, rbw))); hi = Math.max(...lines.map(L => L.nm + 3 * Math.hypot(L.w, rbw))); }
  else { lo = 1500; hi = 1600; }
  const mid = (lo + hi) / 2, half = Math.max((hi - lo) / 2, 20 * rbw);
  return [mid - half, mid + half];
}

/* a balanced detector's tones: the first input's less the second's, as fields at each
   frequency (a beat between unrelated lasers, with no phase to it, adds in power) */
function balancedTones(A, B) {
  const m = new Map();
  for (const [L, sg] of [[A, 1], [B, -1]]) for (const t of L) {
    const k = (t.incoh ? 'x' : '') + Math.round(t.f), q = m.get(k) || { f: t.f, re: 0, im: 0, p: 0, incoh: t.incoh };
    if (t.incoh) q.p += t.amp * t.amp; else { q.re += sg * t.amp * Math.cos(t.ph); q.im += sg * t.amp * Math.sin(t.ph); }
    m.set(k, q);
  }
  return [...m.values()].map(q => q.incoh ? { f: q.f, amp: Math.sqrt(q.p), ph: 0, incoh: true } : { f: q.f, amp: Math.hypot(q.re, q.im), ph: Math.atan2(q.im, q.re) }).filter(t => t.amp > 1e-15).sort((a, b) => a.f - b.f);
}

/* the signal: DC (mW), tones (mW of optical power swing, and V out), the mixer */
export function pdSignal(el) {
  const fibre = el.type === 'fcomp' || el.type === 'pic';                                     // PIC hook: an on-chip photodiode reads as a fibre one
  const dc = fibre ? (el.type === 'fcomp' ? pdNetMw(el) : lastTrace.net ? netPower(lastTrace.net.pd.get(el.id), lastTrace.net.keys) : 0) : detectorReading(el).mw;
  const Ff = !fibre && viaCavity(el) ? detectorFieldResult(el) : null;
  const tones = fibre ? (el.balanced ? balancedTones(beatTones(fibrePdParts(el)), beatTones(fibrePdParts(el, true))) : beatTones(fibrePdParts(el))) : Ff ? Ff.tones.map(t => Object.assign({}, t)) : deviceMemo(Object.assign({}, el, { id: el.id + (!fibre && viaCavity(el) ? '#tones~' : '#tones') }), () => freePdTones(el, !fibre && viaCavity(el)));
  // a free-space diode's responsivity is that of the light arriving (each wavelength at its own)
  const rd = fibre ? null : detectorReading(el);
  // B, the amplifier's 3 dB corner, a single pole (as elec.js filters it): tones roll off by it; white
  // noise through it integrates to its equivalent noise bandwidth, Bn = (pi/2) B
  const R = fibre ? pdResp(el) : rd.mw > 0 ? rd.mA / rd.mw : responsivity(el, benchNms()[0]), G = el.diode ? 1 : el.gain, B = el.bandwidth, Bn = Math.PI / 2 * B;
  const V = mw => mw * 1e-3 * R * G;
  for (const t of tones) { const Hm = 1 / Math.sqrt(1 + (t.f / B) ** 2); t.V = V(t.amp) * Hm; t.phV = t.ph - Math.atan(t.f / B); }
  const out = { dc, Vdc: V(dc), tones, vmax: el.vmax, B, Bn };
  if (fibre && lastTrace.net) {
    // noise: shot noise on all the light, the gain resistor's Johnson noise, and where an
    // amplifier's ASE arrives, the signal beating with the ASE of its own polarisation and
    // the ASE with itself (over the ASE's optical band Bo)
    // each input on its own (a balanced detector has two): its broadband light (an amplifier's
    // ASE, an LED, any source set incoherent), slice by slice with both polarisations together,
    // which beats with itself and with the signal, and the rest, the signal, and its wavelength
    const side = byG => {
      const sl = new Map();
      let ase = 0, tot = 0, sigNm = null, sigMw = 0;
      for (const K of lastTrace.net.keys) {
        const m = netPower(byG, [K]);
        tot += m;
        if (K.root.ase || (K.root.cmode === 'broad' && !(K.root.tau > 0) && K.root.coh > 0)) { ase += m; const k = K.nm.toFixed(6), s = sl.get(k) || { nm: K.nm, mw: 0, B: K.root.nb || C_MM / K.root.coh }; s.mw += m; sl.set(k, s); }
        else if (m > sigMw) { sigMw = m; sigNm = K.nm; }
      }
      const Ps = Math.max(0, tot - ase) * 1e-3, Pa = ase * 1e-3;
      // the signal beats with the ASE of its own polarisation at its own wavelength (spectral density there)
      let dens = 0;
      if (sigNm !== null && sl.size) { let best = null; for (const s of sl.values()) if (!best || Math.abs(s.nm - sigNm) < Math.abs(best.nm - sigNm)) best = s; dens = best.mw * 1e-3 / best.B; }
      let aa = 0; for (const s of sl.values()) aa += (s.mw * 1e-3) ** 2 / s.B;
      return { ase, Ps, Pa, sigAse: 2 * R * R * Ps * dens * Bn, aseAse: R * R * aa * Bn };
    };
    const sides = [side(lastTrace.net.pd.get(el.id))];
    if (el.balanced) sides.push(side(lastTrace.net.pd.get(el.id + '~')));
    // shot noise on all the light either side; the excess (beat) noise, a balanced detector cancels to its common-mode rejection
    const cm = el.balanced ? Math.pow(10, -(el.cmrr || 0) / 10) : 1, sum = k => sides.reduce((a, x) => a + x[k], 0);
    const q = 1.602176634e-19, kT = 1.380649e-23 * 295, amp = !el.diode && el.type === 'fcomp';
    const parts = { shot: 2 * q * (R * (sum('Ps') + sum('Pa')) + (el.dark || 0) * 1e-9) * Bn, thermal: !el.diode && G > 0 ? 4 * kT * Bn / G : 0,
      sigAse: cm * sum('sigAse'), aseAse: cm * sum('aseAse'), amp: amp ? ((el.ampNoise || 0) * 1e-12) ** 2 * Bn : 0 };
    const i2 = parts.shot + parts.thermal + parts.sigAse + parts.aseAse + parts.amp, ase = sum('ase');
    const Is = R * Math.abs(sides[0].Ps - (sides[1] ? sides[1].Ps : 0));
    out.noise = { ase, parts, i2, V: Math.sqrt(i2) * G, snr: Is > 0 && i2 > 0 ? 10 * Math.log10(Is * Is / i2) : null };
  }
  if (el.demodF > 0) {
    const fd = el.demodF * 1e6, pd = el.demodPhase * deg;
    let I = 0; for (const t of tones) if (!t.incoh && Math.abs(t.f - fd) < 1) I += 0.5 * t.V * Math.cos(t.phV - pd);
    out.mixer = I;
  }
  return out;
}

/* the signal with what drives the light on the bench in it (a chopper, a modulated laser, an
   AOM or EOM on a drive: ELEC hook), when anything does; else just its beat notes. Tones as
   pdSignal's: V the output's amplitude, amp the light's swing in mW. */
export function pdSignalAll(el) {
  const S = pdSignal(el), E = ELEC.detSignal(el);
  if (!E) return S;
  const fibre = el.type === 'fcomp' || el.type === 'pic', rd = fibre ? null : detectorReading(el);           // PIC hook: an on-chip photodiode reads as a fibre one
  const R = fibre ? pdResp(el) : rd.mw > 0 ? rd.mA / rd.mw : responsivity(el, benchNms()[0]), k = R * 1e-3 * (el.diode ? 1 : el.gain);   // output per mW
  const tones = E.tones.map(t => { const V = Math.hypot(t.re, t.im); return { f: t.f, V, phV: Math.atan2(t.im, t.re), amp: k > 0 ? V / k : 0, incoh: false }; })
    .concat(S.tones.filter(t => t.incoh)).sort((a, b) => a.f - b.f);
  return Object.assign({}, S, { Vdc: E.dc, dc: k > 0 ? E.dc / k : S.dc, tones, unit: E.unit, driven: true, vmax: el.diode ? Infinity : S.vmax });
}

/* what a photodiode's Signal views show: the signal its electrical output carries (beat notes,
   the bench's drives, its noise), with beats between different lasers as tones of no fixed phase */
export function pdInstSignal(el) {
  const S = ELEC.detSignalFull(el), inc = pdSignal(el).tones.filter(t => t.incoh);
  return inc.length ? Object.assign({}, S, { tones: S.tones.concat(inc.map(t => ({ f: t.f, re: t.V, im: 0, incoh: true }))) }) : S;
}
