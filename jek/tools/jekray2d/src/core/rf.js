import { num } from '../state/project.js';
import { clamp } from '../ui/params.js';
import { netPower } from '../engines/fibre.js';
import { fanFromGauss } from '../ui/panel-cavity.js';
// Shared mutable state read or set here, not yet imported (see state/shared.md): H, W, lastTrace

/* ---------- RF: millimetre-wave and terahertz quasi-optics ----------
   Above about 30 GHz a beam through lenses, mirrors and horns is a Gaussian beam that
   diffracts strongly, which the field engine already follows. What RF adds is its sources and
   receivers (feed horns, by their Gaussian beam: Goldsmith, Quasioptical Systems, 1998, ch. 7),
   the dielectrics lenses are made of at these frequencies, and units of GHz and dBm. */
export const C_NM_GHZ = 299792458;                                   // wavelength (nm) x frequency (GHz)
/* dielectrics near 100 to 300 GHz: index and loss tangent (Lamb, Int. J. IR MM Waves 17, 1997, and makers' data) */
export const RF_MAT = {
  'HDPE': { n: 1.526, tand: 3.1e-4, name: 'HDPE (polyethylene)' },
  'PTFE': { n: 1.44, tand: 3e-4, name: 'PTFE (Teflon)' },
  'Rexolite': { n: 1.59, tand: 6.6e-4, name: 'Rexolite (polystyrene)' },
  'TPX': { n: 1.46, tand: 6e-4, name: 'TPX (polymethylpentene)' },
  'HR silicon': { n: 3.4175, tand: 1e-5, name: 'High-resistivity silicon' },
  'Fused quartz (RF)': { n: 1.952, tand: 1e-4, name: 'Fused quartz' },
  'Alumina': { n: 3.13, tand: 2e-4, name: 'Alumina' },
  'Nylon': { n: 1.73, tand: 1.1e-2, name: 'Nylon' },
};
/* feed horns: the Gaussian that fits the aperture field (w = k a, a the aperture's radius, or half
   its side for a diagonal horn), and the share of the power in that Gaussian (Goldsmith table 7.1) */
export const RF_HORNS = {
  corrugated: { name: 'Corrugated conical', k: 0.6435, g: 0.98 },
  smooth: { name: 'Smooth-wall conical', k: 0.765, g: 0.91 },
  diagonal: { name: 'Diagonal', k: 0.86, g: 0.84 },
  gauss: { name: 'Ideal Gaussian', k: 0.6435, g: 1 },
};
/* a horn's beam at a frequency (GHz): its aperture's Gaussian (wa, its phase radius the slant length
   L), and the waist it comes from, w0, dz behind the aperture (Goldsmith 7.6) */
export function rfBeam(rf, ghz) {
  const lam = C_NM_GHZ / ghz * 1e-6, H = RF_HORNS[rf.kind] || RF_HORNS.corrugated, wa = H.k * rf.a;
  const x = Math.PI * wa * wa / (lam * rf.L);
  const w0 = wa / Math.sqrt(1 + x * x), dz = rf.L / (1 + 1 / (x * x)), zR = Math.PI * w0 * w0 / lam;
  return { lam, wa, w0, dz, zR, g: H.g, theta: Math.atan(lam / (Math.PI * w0)), R: rf.L };
}
export function normRf(r, type) {
  if (type !== 'source' && type !== 'detector') return { part: true };
  const o = { kind: RF_HORNS[r.kind] ? r.kind : 'corrugated', a: clamp(num(r.a, 7.5), 0.05, 2000), L: clamp(num(r.L, 60), 0.5, 1e5) };
  if (type === 'source') { o.ghz = clamp(num(r.ghz, 100), 1, 3000); o.dbm = clamp(num(r.dbm, 0), -120, 60); }
  return o;
}
/* a horn sets its own beam: a source its wavelength, waist, power (the share in the Gaussian) and
   rays; a receiver its aperture */
export function applyRf(el) {
  const rf = el.mmw;
  if (!rf || rf.part) return;
  if (el.type === 'detector') { el.length = 2 * rf.a; return; }
  const B = rfBeam(rf, rf.ghz);
  el.wavelength = C_NM_GHZ / rf.ghz;
  el.gauss = true; el.w0 = B.w0; el.z0 = -B.dz; el.m2 = 1; el.tem = 'gauss';
  el.power = Math.pow(10, rf.dbm / 10) * B.g;
  el.colourAuto = false; el.colour = '#e0a030';
  fanFromGauss(el);
}
export const fmtGHz = nm => { const f = C_NM_GHZ / nm; return f >= 1000 ? +(f / 1000).toPrecision(4) + ' THz' : +f.toPrecision(4) + ' GHz'; };
/* a wavelength as a readout says it: in nm, or for an RF beam as its frequency */
export const fmtWl = nm => nm > 1e5 ? fmtGHz(nm) : nm + ' nm';
export const fmtDbm = mw => mw > 0 ? (10 * Math.log10(mw)).toFixed(2) + ' dBm' : '\u2212\u221e dBm';
export const DETECTOR_MATERIALS = {
  si: { name: 'Silicon', wl: [350, 400, 500, 600, 700, 800, 900, 960, 1000, 1050, 1100, 1150], r: [0.08, 0.12, 0.26, 0.36, 0.45, 0.53, 0.60, 0.62, 0.55, 0.35, 0.12, 0.02] },
  ingaas: { name: 'InGaAs', wl: [800, 900, 1000, 1100, 1300, 1550, 1600, 1650, 1700, 1750], r: [0.2, 0.55, 0.65, 0.75, 0.9, 1.0, 1.0, 0.9, 0.4, 0.05] },
  ge: { name: 'Germanium', wl: [800, 900, 1000, 1200, 1400, 1550, 1600, 1700, 1800], r: [0.3, 0.4, 0.5, 0.65, 0.8, 0.85, 0.7, 0.2, 0.02] },
  custom: { name: 'Fixed responsivity' },
};
/* a fibre photodetector's wavelength: the strongest light reaching it (not an amplifier's ASE) */
export function fibrePdNm(el) {
  const net = lastTrace.net;
  if (!net) return 1550;
  let best = null, bm = 0;
  for (const K of net.keys) { if (K.root.ase) continue; const m = netPower(net.pd.get(el.id), [K]); if (m > bm) { bm = m; best = K.nm; } }
  return best || 1550;
}
/* a fibre or on-chip photodiode's responsivity, A/W: a fibre one's from its material, as in free space */
export const pdResp = el => el.type === 'fcomp' ? responsivity(el, fibrePdNm(el)) : el.resp;
export function responsivity(el, nm) {
  const M = DETECTOR_MATERIALS[el.material];
  if (!M || !M.wl) return el.resp;
  const W = M.wl, R = M.r;
  if (nm <= W[0] || nm >= W[W.length - 1]) return 0;
  let i = 1; while (W[i] < nm) i++;
  return R[i - 1] + (R[i] - R[i - 1]) * (nm - W[i - 1]) / (W[i] - W[i - 1]);
}

