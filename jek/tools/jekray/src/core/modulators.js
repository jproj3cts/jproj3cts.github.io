import { clamp } from './constants.js';
import { deg, num } from '../state/project.js';
import { jonesOf } from '../engines/polarisation.js';

/* ---------- Modulators: light shifted in frequency ----------
   Light carries a frequency offset f (Hz) from its laser's own line. Light at different
   offsets makes no steady fringes (it is part of a different launch as far as adding fields
   goes: the offset is on the launch's name), but it beats on a photodiode at the difference.
   An acousto-optic modulator is a Bragg cell: a moving grating of period v / f_RF that sends
   a share of the light into order +1 (or -1), deflected by lambda f / v and shifted by
   +f (or -f); the rest carries on in order 0. An electro-optic phase modulator writes
   e^{i beta sin(Omega t)} on the light: sidebands n f_m with amplitudes J_n(beta). An
   amplitude modulator is a Mach-Zehnder of two such arms driven in opposition, biased
   at phi_0: E cos(phi_0 / 2 + (beta / 2) sin(Omega t)). */
export const C_MM = 299792458e3;               // light, mm/s
export const famAt = (fam, f) => String(fam).replace(/@[^#]*$/, '') + (f ? '@' + (+f.toPrecision(12)) : '');
/* the Bessel function J_n(x), by its series (good for the modulation depths in use here) */
function besselJ(n, x) {
  if (n < 0) return (n % 2 ? -1 : 1) * besselJ(-n, x);
  let term = 1; for (let k = 1; k <= n; k++) term *= x / 2 / k;
  let sum = term;
  for (let k = 1; k < 200; k++) { term *= -(x * x / 4) / (k * (k + n)); sum += term; if (Math.abs(term) < 1e-17 * Math.max(1e-300, Math.abs(sum))) break; }
  return sum;
}
/* an EOM's sidebands: [n, complex amplitude], those with more than 1e-5 of the power */
export function eomSidebands(el) {
  // ELEC hook: a slow drive _v (volts, set only while the electronics trace it) adds to the bias, or in phase mode a phase pi v / V_pi
  const dv = el._v ? el._v / Math.max(1e-6, num(el.vpi, 5)) : 0;
  const out = [], b = el.beta, a = Math.pow(10, -Math.max(0, el.loss || 0) / 20), ph = (el.bias || 0) * Math.PI / 180 + dv * Math.PI;
  for (let n = -40; n <= 40; n++) {
    let c;
    if (el.emode === 'amplitude') { const j = besselJ(n, b / 2) / 2, sg = n % 2 ? -1 : 1; c = [j * (Math.cos(ph / 2) + sg * Math.cos(ph / 2)), j * (Math.sin(ph / 2) - sg * Math.sin(ph / 2))]; }
    else c = [besselJ(n, b) * Math.cos(dv * Math.PI), besselJ(n, b) * Math.sin(dv * Math.PI)];
    c = [c[0] * a, c[1] * a];
    if (c[0] * c[0] + c[1] * c[1] > 1e-20) out.push([n, c]);
  }
  return out;
}
/* a grating's lines per mm; an AOM's sound makes one of period v / f */
export const linesPerMm = el => el.type === 'aom' ? el.rf * 1e6 / (el.v * 1e3) : el.lpmm;
/* an AOM's orders, as a grating's: order 0 and the Bragg order, each with its shift */
export function aomOrders(el, nm, ldy, n) {
  const G = el.rf * 1e6 / (el.v * 1e3), lam = nm * 1e-6, eta = clamp(el.eff, 0, 100) / 100, m = el.order < 0 ? -1 : 1, out = [];
  if (1 - eta > 1e-4) out.push({ m: 0, ty: ldy, eff: 1 - eta, df: 0 });
  const ty = ldy + m * lam * G / n;
  if (eta > 1e-4 && Math.abs(ty) < 1) out.push({ m, ty, eff: eta, df: m * el.rf * 1e6 });
  return out;
}

/* Jones matrices in the tracer's (p, s) basis, [[pp, ps], [sp, ss]] with entries [re, im] */
export const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
function jmul(A, B) {
  const e = (i, j) => { const x = cmul(A[i][0], B[0][j]), y = cmul(A[i][1], B[1][j]); return [x[0] + y[0], x[1] + y[1]]; };
  return [[e(0, 0), e(0, 1)], [e(1, 0), e(1, 1)]];
}
/* a polariser passing th (from p) and leaking amplitude `leak` along the crossed axis */
function jPol(th, leak) {
  const c = Math.cos(th), sn = Math.sin(th), l = leak || 0;
  return [[[c * c + l * sn * sn, 0], [c * sn * (1 - l), 0]], [[c * sn * (1 - l), 0], [sn * sn + l * c * c, 0]]];
}
const jRot = r => { const c = Math.cos(r), sn = Math.sin(r); return [[[c, 0], [-sn, 0]], [[sn, 0], [c, 0]]]; };
/* What a thin polarisation element does to one ray. Waveplates and polarisers act in the
   ray's own basis, as they always have. A Faraday rotator turns the field the same way in
   the lab whichever way light crosses it, which is what makes it non-reciprocal: in the
   ray's basis that is +rotation or -rotation, set by the direction of travel against the
   element's field (fwd) and by the parity of the ray's p axis (sg, flipped at each
   reflection). An isolator is a polariser, a 45° rotator and a second polariser at 45°,
   all in the element's own basis, met in the order the light meets them. */
export function jonesAt(el, fwd, sg) {
  if (el.type !== 'faraday' && el.type !== 'isolator') return jonesOf(el);
  const sb = sg * (fwd ? 1 : -1);
  const rot = jRot(sb * (el.type === 'faraday' ? el.rotation : 45) * deg);
  if (el.type === 'faraday') return rot;
  const leak = Math.pow(10, -el.extinction / 20), P1 = jPol(sb * el.axis * deg, leak), P2 = jPol(sb * (el.axis + 45) * deg, leak);
  return fwd ? jmul(P2, jmul(rot, P1)) : jmul(P1, jmul(rot, P2));
}
export const JONES_TYPES = new Set(['waveplate', 'polariser', 'faraday', 'isolator']);
/* Mods (see "Mods" near the end): their state is here, early, as the tracer reads it. Results
   are what mods worked out (sampled tables, matrices), by a key of the mod's code, its part,
   the settings and what was asked; rev moves on whenever one arrives, so traces and fields
   made without it are made again. */
export const MODS = { packs: new Map(), results: new Map(), waiting: new Map(), failed: new Map(), rev: 0, sent: new WeakMap(), frame: null, calls: new Map(), seq: 0, loaded: new Map(), offered: new Set() };
export const MOD_COLOURS = { grey: '#9aa5ad', blue: '#5aa9e6', green: '#5bbf7a', yellow: '#e6c45a', orange: '#f29b4b', red: '#e0605a', purple: '#a586e0', white: '#e8e8e2' };
export const modText = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '';
export const modNames = (list, n, dflt) => Array.from({ length: n }, (_, i) => modText(Array.isArray(list) ? String(list[i] === undefined ? '' : list[i]) : '', 12) || dflt(i));
/* a part's mod reference, as an element carries it: which mod and part, the code's hash it was
   made with, its settings, and enough of the part's shape (its ports) to stand in without the mod */
export function normModRef(m, type) {
  if (!m || typeof m !== 'object') return null;
  const id = modText(m.id, 64).toLowerCase(), def = modText(m.def, 40);
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(id) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(def)) return null;
  const o = { id, def, hash: /^[0-9a-f]{64}$/.test(m.hash) ? m.hash : '', p: {} };
  if (m.p && typeof m.p === 'object') for (const [k, v] of Object.entries(m.p).slice(0, 24)) if (/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(k) && (typeof v === 'string' ? v.length <= 30 : isFinite(v))) o.p[k] = typeof v === 'string' ? v : +v;
  o.name = modText(m.name, 50) || def;
  if (type === 'fcomp') o.ports = modNames(m.ports, Math.round(clamp(Array.isArray(m.ports) ? m.ports.length : 2, 1, 8)), i => String(i + 1));
  if (type === 'elec') {
    o.ins = modNames(m.ins, Math.round(clamp(Array.isArray(m.ins) ? m.ins.length : 1, 0, 4)), i => 'in' + (i + 1));
    o.outs = modNames(m.outs, Math.round(clamp(Array.isArray(m.outs) ? m.outs.length : 1, 1, 4)), i => 'out' + (i + 1));
  }
  if (MOD_COLOURS[m.colour]) o.colour = m.colour;
  if (typeof m.tag === 'string') o.tag = modText(m.tag, 8);
  return o;
}

/* Photodiode responsivity (A/W) against wavelength: typical curves for each material */

