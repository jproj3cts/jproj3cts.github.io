import { clamp } from './constants.js';
import { fanFromGauss } from './beams-hom.js';
import { num } from '../state/project.js';
import { lastTrace } from '../engines/trace.js';
import { netPower } from '../engines/fibre.js';

/* ---------- RF: millimetre-wave and terahertz quasi-optics ----------
   Above about 30 GHz a beam through lenses, mirrors and horns is a Gaussian beam that
   diffracts strongly, which the field engine already follows. What RF adds is its sources and
   receivers (feed horns, by their Gaussian beam: Goldsmith, Quasioptical Systems, 1998, ch. 7),
   the dielectrics lenses are made of at these frequencies, and units of GHz and dBm. */
export const C_NM_GHZ = 299792458;                                   // wavelength (nm) x frequency (GHz)
/* Dielectrics for millimetre waves: index, and loss tangent at a reference frequency f0 (GHz) with
   the power it grows by (tan δ ∝ f^β: about 1 for the polymers, whose absorption goes as f², about
   0 for silicon and the crystals). Lamb, Int. J. IR MM Waves 17, 1997, and makers' data; the index
   is taken constant over the band, which holds to a few parts in a thousand for these */
export const RF_MAT = {
  'HDPE': { n: 1.526, tand: 3.1e-4, f0: 150, beta: 1, name: 'HDPE (polyethylene)' },
  'PTFE': { n: 1.44, tand: 3e-4, f0: 150, beta: 1, name: 'PTFE (Teflon)' },
  'Polypropylene': { n: 1.502, tand: 2.5e-4, f0: 150, beta: 1, name: 'Polypropylene' },
  'Rexolite': { n: 1.59, tand: 6.6e-4, f0: 150, beta: 1, name: 'Rexolite (polystyrene)' },
  'TPX': { n: 1.46, tand: 6e-4, f0: 150, beta: 1, name: 'TPX (polymethylpentene)' },
  'HR silicon': { n: 3.4175, tand: 1e-5, f0: 150, beta: 0, name: 'High-resistivity silicon' },
  'Fused quartz (RF)': { n: 1.952, tand: 1e-4, f0: 150, beta: 0.5, name: 'Fused quartz' },
  'Alumina': { n: 3.13, tand: 2e-4, f0: 150, beta: 1, name: 'Alumina' },
  'Nylon': { n: 1.73, tand: 1.1e-2, f0: 100, beta: 1, name: 'Nylon' },
};
/* a dielectric's loss tangent at a frequency (GHz) */
export const rfTanD = (M, ghz) => M.tand * Math.pow(Math.max(1e-3, ghz) / (M.f0 || 150), M.beta || 0);
/* metals, by their conductivity (S/m, room temperature): a mirror's loss by its surface resistance */
export const RF_METALS = {
  Al: { name: 'Aluminium', sigma: 3.5e7 }, Cu: { name: 'Copper', sigma: 5.8e7 }, Au: { name: 'Gold', sigma: 4.1e7 },
  brass: { name: 'Brass', sigma: 1.5e7 }, steel: { name: 'Stainless steel', sigma: 1.4e6 }, ideal: { name: 'Perfect conductor', sigma: Infinity },
};
/* a metal mirror's reflectance at a frequency (GHz): 1 − 4 Rs / Z0 at normal incidence, Rs = √(π f μ0 / σ)
   the surface resistance (the skin-depth loss; at an angle, within a few parts in ten thousand of this) */
export function metalR(key, ghz) {
  const M = RF_METALS[key] || RF_METALS.Al;
  if (!isFinite(M.sigma)) return 1;
  const Rs = Math.sqrt(Math.PI * ghz * 1e9 * 4e-7 * Math.PI / M.sigma);
  return Math.max(0, 1 - 4 * Rs / 376.73);
}
/* ---------- A wire grid: wires of radius a (mm) at pitch g (mm), E along the wires reflected ----------
   The grid is a sheet reactance across a transmission line: for the field along the wires an
   inductance X = (g/λ) Xn, Xn the quasi-static inductance of the grid as a function of its filling
   2a/g (Chuss et al., Appl. Opt. 51, 197 (2012), an interpolation of full-wave simulations that
   agrees with Marcuvitz's ln(g/2πa) for sparse grids and holds to 2a/g = 1), which reflects
   R = 1/(1 + 4X²); across the wires a capacitance B = 4 (g/λ) ln sec(πw/2g), w = 4a the wires'
   width as strips (Marcuvitz, capacitive strips, by Babinet), which leaks R = B²/(4 + B²). Met at
   an angle θ, a sheet's reactance seen by the wave scales with the wave impedance: by cos θ for
   wires across the plane of incidence, 1/cos θ for wires in it. Valid while g < λ (no diffraction):
   past that the grid is a grating, and the figures are marked. Lossless: the wires' ohmic loss, a
   few parts in a thousand at most, is left out. */
export function gridCoef(grid, nm, cth, inPlane) {
  const lam = nm * 1e-6, g = grid.g, a = grid.a, c = Math.max(0.05, Math.abs(cth) || 1);
  const u = Math.log(2 * Math.PI * a / g), Xn = Math.max(0.02, 0.51 - 1.19 * u + 0.53 * u * u + 0.11 * u * u * u);
  const X = (g / lam) * Xn * (inPlane ? 1 / c : c);
  const Rpar = 1 / (1 + 4 * X * X);
  const w = Math.min(4 * a, 0.9 * g), B = 4 * (g / lam) * Math.log(1 / Math.cos(Math.PI * w / (2 * g))) * (inPlane ? 1 / c : c);
  const Rperp = B * B / (4 + B * B);
  return { Rpar, Rperp, X, B, grating: g >= lam };
}
/* ---------- A film beam splitter: a dielectric sheet of index n and thickness t (mm) ----------
   Its two faces interfere (an etalon): r = r12 (1 − e^{−2iδ}) / (1 − r12² e^{−2iδ}), δ = 2π n t cos θt / λ,
   with Fresnel's r12 for s and p at the angle of incidence. Lossless. */
export function filmCoef(film, nm, cth) {
  const lam = nm * 1e-6, n = film.n, ci = Math.max(1e-6, Math.min(1, Math.abs(cth) || 1)), si = Math.sqrt(1 - ci * ci);
  const ct = Math.sqrt(Math.max(0, 1 - (si / n) * (si / n)));
  const rs = (ci - n * ct) / (ci + n * ct), rp = (n * ci - ct) / (n * ci + ct);
  const d = 2 * Math.PI * n * film.t * ct / lam, c2 = Math.cos(2 * d), s2 = Math.sin(2 * d);
  const one = r => {
    // r (1 − e^{−2iδ}) / (1 − r² e^{−2iδ})
    const nr = r * (1 - c2), ni = r * s2, dr = 1 - r * r * c2, di = r * r * s2, den = dr * dr + di * di;
    return ((nr * dr + ni * di) ** 2 + (ni * dr - nr * di) ** 2) / (den * den);
  };
  return { Rs: Math.min(1, one(rs)), Rp: Math.min(1, one(rp)) };
}
/* ---------- Metal meshes: filters for millimetre waves (Ulrich, Infrared Phys. 7, 37 (1967)) ----------
   In the non-diffracting region (g < λ) a mesh of period g with lines (or gaps) of width 2a is a
   lumped element across the line, in the normalised frequency ω = g/λ: an inductive mesh (a grid of
   square holes) a shunt inductance L = ln csc(πa/g), which passes |t|² = 1 / (1 + 1/(4ω²L²)), the
   long waves reflected; a capacitive mesh (free-standing squares) a shunt capacitance C = 4 ln csc(πa/g),
   |t|² = 1 / (1 + ω²C²/4), the short waves reflected; a resonant mesh (crosses, or cross-shaped slots)
   a tuned circuit, band-stop or band-pass about f0 with a quality factor Q: |t|² = 1 / (1 + Q²(f/f0 − f0/f)²)
   for the band-pass, one less that for the band-stop. What a mesh does not pass it reflects, but for
   its loss. */
export const MESH_TYPES = { inductive: 'Inductive (high-pass)', capacitive: 'Capacitive (low-pass)', bandpass: 'Resonant, band-pass (cross slots)', bandstop: 'Resonant, band-stop (crosses)' };
export function meshT(el, nm) {
  const ghz = C_NM_GHZ / nm, loss = Math.pow(10, -(el.meshLoss || 0) / 10);
  let T;
  if (el.mesh === 'bandpass' || el.mesh === 'bandstop') {
    const u = el.meshQ * (ghz / el.meshF0 - el.meshF0 / ghz), bp = 1 / (1 + u * u);
    T = el.mesh === 'bandpass' ? bp : 1 - bp;
  } else {
    const lam = nm * 1e-6, om = el.meshG / lam, lc = Math.log(1 / Math.sin(Math.PI * Math.min(0.499, el.meshA / el.meshG) / 1));
    if (el.mesh === 'capacitive') { const C = 4 * lc; T = 1 / (1 + om * om * C * C / 4); }
    else { const L = lc; T = 1 / (1 + 1 / (4 * om * om * L * L)); }
  }
  return Math.max(0, Math.min(1, T * loss));
}
export const meshGrating = (el, nm) => (el.mesh === 'inductive' || el.mesh === 'capacitive') && el.meshG >= nm * 1e-6;
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
  if (type === 'detector') { o.span = clamp(num(r.span, 40), 1, 190); o.points = clamp(Math.round(num(r.points, 61)), 5, 401); }   // its frequency sweep: % of the frequency, and points
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

