import { clamp } from './constants.js';
import { fanFromGauss } from './beams-hom.js';
import { hornComps } from './horns.js';
import { num } from '../state/project.js';
import { benchNms } from '../state/elements.js';
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
/* each dielectric's linear expansion (per kelvin, room temperature; typical of the plastics, which vary by grade) is its cte: the
   designer's thermal analysis grows a lens by it. Its permittivity is taken as not changing with temperature: for these plastics
   the measured change is a few parts in ten thousand per kelvin, within the spread between grades, and small beside the expansion */
export const RF_MAT = {
  'HDPE': { cte: 1.3e-4, n: 1.526, tand: 3.1e-4, f0: 150, beta: 1, name: 'HDPE (polyethylene)' },
  'PTFE': { cte: 1.35e-4, n: 1.44, tand: 3e-4, f0: 150, beta: 1, name: 'PTFE (Teflon)' },
  'Polypropylene': { cte: 1.5e-4, n: 1.502, tand: 2.5e-4, f0: 150, beta: 1, name: 'Polypropylene' },
  'Rexolite': { cte: 7.0e-5, n: 1.59, tand: 6.6e-4, f0: 150, beta: 1, name: 'Rexolite (polystyrene)' },
  'TPX': { cte: 1.17e-4, n: 1.46, tand: 6e-4, f0: 150, beta: 1, name: 'TPX (polymethylpentene)' },
  'HR silicon': { cte: 2.6e-6, n: 3.4175, tand: 1e-5, f0: 150, beta: 0, name: 'High-resistivity silicon' },
  'Fused quartz (RF)': { cte: 5.5e-7, n: 1.952, tand: 1e-4, f0: 150, beta: 0.5, name: 'Fused quartz' },
  'Alumina': { cte: 7.2e-6, n: 3.13, tand: 2e-4, f0: 150, beta: 1, name: 'Alumina' },
  'Nylon': { cte: 8.0e-5, n: 1.73, tand: 1.1e-2, f0: 100, beta: 1, name: 'Nylon' },
  // the plastics RF lenses are made to order in, solid: typical values from published measurements at 10 to
  // 40 GHz. Each brand and colour differs, and they take up water: until measured, these
  // stand for a range, and the panels say so
  'PLA': { cte: 6.8e-5, n: 1.643, tand: 1.0e-2, f0: 30, beta: 0, name: 'PLA', print: true, density: 1.24 },
  'ABS': { cte: 9.0e-5, n: 1.581, tand: 6e-3, f0: 30, beta: 0, name: 'ABS', print: true, density: 1.04 },
  'PETG': { cte: 6.0e-5, n: 1.612, tand: 1.3e-2, f0: 30, beta: 0, name: 'PETG', print: true, density: 1.27 },
  'ASA': { cte: 9.0e-5, n: 1.628, tand: 9e-3, f0: 30, beta: 0, name: 'ASA', print: true, density: 1.07 },
  'PP': { cte: 1.5e-4, n: 1.483, tand: 8e-4, f0: 30, beta: 0, name: 'Polypropylene (PP)', print: true, density: 0.9 },
};
/* Plastic and air mixed finer than the wavelength (a printed part's infill at density F, 0 to 1):
   its permittivity by the power-law mixing rule eps^a = F eps_m^a + (1 - F), and its loss by how
   much of the plastic's that rule passes on, eps'' = F (eps / eps_m)^(1-a) eps_m tan delta.
   a = 1 (the default) is the mean by volume, the most the mix can be for fields along the lines;
   a = 1/3 is Looyenga's rule; smaller is lower still. A material's own a (mix), and its solid
   index, come from measuring printed tiles of it (the density coupon): until then, a = 1. */
export const mixA = M => (M && isFinite(M.mix) && M.mix > 0 ? M.mix : 1);
export function mixEps(M, F) {
  const em = M.n * M.n, a = mixA(M), f = Math.min(1, Math.max(0, F));
  const eps = Math.pow(f * Math.pow(em, a) + (1 - f), 1 / a);
  return { eps, epsI: f * Math.pow(eps / em, 1 - a) * em * (M.tand || 0) };
}
/* the density (0 to 1) that gives permittivity eps */
export function mixFill(M, eps) {
  const em = M.n * M.n, a = mixA(M);
  return (Math.pow(Math.max(1, eps), a) - 1) / (Math.pow(em, a) - 1);
}
/* A face's matching layer made in a made-to-order plastic: the face's coating (a quarter wave of
   index n1, as panels.js matchLayer sets it) printed as a skin of the lens's own plastic at the
   density that gives n1. It can be made while that density is no lower than the frequency allows
   (lines 0.45 mm wide a quarter wave in the plastic apart, as for a graded-index lens).
   Null for a face with no such coating. */
export const isMatchCoat = c => !!(c && c.label === 'Matching layer' && Array.isArray(c.layers) && c.layers.length === 1 && c.design > 0);
export function printedMatch(M, coat) {
  if (!isMatchCoat(coat) || !M) return null;
  const L = coat.layers[0], lam = coat.design * 1e-6, fill = 100 * mixFill(M, L.n * L.n);
  const least = 100 * 0.45 / (lam / (4 * M.n));
  // the least density allowed grows with the frequency: this skin's own holds up to ghzMax
  return { n: L.n, thick: L.d * 1e-6, fill, least, ok: fill >= least && fill <= 100, ghz: C_NM_GHZ / coat.design, ghzMax: C_NM_GHZ / coat.design * fill / least };
}
/* A made-to-order lens's mounting: a flange round its rim, width mm out from it and thick mm
   along the axis, with holes of diameter hole on the circle through the flange's middle. It is
   outside the lens, so the beam is not traced through it (light past the rim would pass it). */
export function normMount(m) {
  if (!m || typeof m !== 'object' || m.kind !== 'flange') return undefined;
  const n = (v, d) => (isFinite(v) && v !== null && v !== '' ? +v : d);
  const width = clamp(n(m.width, 10), 3, 40), hole = clamp(n(m.hole, 3.4), 1, Math.max(1, width - 1.6));
  return { kind: 'flange', width, thick: clamp(n(m.thick, 4), 1, 20), holes: Math.round(clamp(n(m.holes, 4), 0, 12)), hole };
}
/* a flange's plastic, mm^3: its ring less its holes */
export const mountVolume = (dia, m) => m && m.kind === 'flange'
  ? Math.PI * (((dia / 2 + m.width) ** 2 - (dia / 2) ** 2) - m.holes * (m.hole / 2) ** 2) * m.thick : 0;
/* the outside diameter of a lens with its mounting */
export const mountedDia = (dia, m) => dia + (m && m.kind === 'flange' ? 2 * m.width : 0);
/* what an RF lens can be made as, in one piece: its largest size, and its thinnest wall (mm) */
export const PRINTER = { bed: [250, 220], height: 270, maxDia: 210, maxHeight: 260, minWall: 0.45 };
/* a dielectric's loss tangent at a frequency (GHz) */
export const rfTanD = (M, ghz) => M.tand * Math.pow(Math.max(1e-3, ghz) / (M.f0 || 150), M.beta || 0);
/* metals, by their conductivity (S/m, room temperature): a mirror's loss by its surface resistance */
export const RF_METALS = {
  Al: { name: 'Aluminium', sigma: 3.5e7, cte: 23.6e-6 }, Cu: { name: 'Copper', sigma: 5.8e7, cte: 16.5e-6 }, Au: { name: 'Gold', sigma: 4.1e7, cte: 14.2e-6 },
  brass: { name: 'Brass', sigma: 1.5e7, cte: 19.0e-6 }, steel: { name: 'Stainless steel', sigma: 1.4e6, cte: 17.3e-6 }, ideal: { name: 'Perfect conductor', sigma: Infinity, cte: 0 },
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
   inductance X = (g/2λ) Xn, Xn = (λ/g) 2X the grid's doubled normalised inductance as a function
   of its filling 2a/g (Chuss et al., Appl. Opt. 51, 197 (2012), Fig. 6, an interpolation of
   full-wave simulations that agrees with Marcuvitz's X = (g/λ) ln(g/2πa) for sparse grids and holds
   to 2a/g = 1), which reflects R = 1/(1 + 4X²) (their eq. 14, 1/(1 + (2X)²)); across the wires a capacitance B = 4 (g/λ) ln sec(πw/2g), w = 4a the wires'
   width as strips (Marcuvitz, capacitive strips, by Babinet), which leaks R = B²/(4 + B²). Met at
   an angle θ, a sheet's reactance seen by the wave scales with the wave impedance: by cos θ for
   wires across the plane of incidence, 1/cos θ for wires in it. Valid while g < λ (no diffraction):
   past that the grid is a grating, and the figures are marked. Lossless: the wires' ohmic loss, a
   few parts in a thousand at most, is left out. */
export function gridCoef(grid, nm, cth, inPlane) {
  const lam = nm * 1e-6, g = grid.g, a = grid.a, c = Math.max(0.05, Math.abs(cth) || 1);
  const u = Math.log(2 * Math.PI * a / g), Xn = Math.max(0.02, 0.51 - 1.19 * u + 0.53 * u * u + 0.11 * u * u * u);
  const X = 0.5 * (g / lam) * Xn * (inPlane ? 1 / c : c);
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
   its side for a diagonal horn; Goldsmith table 7.1). The field itself, and its Hermite-Gauss
   modes, are in horns.js: g is the share of the power the modes carried hold */
export const RF_HORNS = {
  corrugated: { name: 'Corrugated conical', k: 0.6435, get g() { return hornComps('corrugated').carried; } },
  smooth: { name: 'Smooth-wall conical', k: 0.765, get g() { return hornComps('smooth').carried; } },
  diagonal: { name: 'Diagonal', k: 0.86, get g() { return hornComps('diagonal').carried; } },
  gauss: { name: 'Ideal Gaussian', k: 0.6435, g: 1 },
};
/* a receiving horn's front end, and a feed horn's drive (see elec.js for what they do with the electronics) */
export const RF_RX = { video: 'Video detector (square law)', mixer: 'Mixer: IF out' };
export const RF_TX = { cw: 'Carrier at its power', up: 'Upconverter: IF in' };
/* a horn's beam at a frequency (GHz): its aperture's Gaussian (wa, its phase radius the slant length
   L), and the waist it comes from, w0, dz behind the aperture (Goldsmith 7.6) */
export function rfBeam(rf, ghz) {
  const lam = C_NM_GHZ / ghz * 1e-6, H = RF_HORNS[rf.kind] || RF_HORNS.corrugated, wa = H.k * rf.a;
  const x = Math.PI * wa * wa / (lam * rf.L);
  const w0 = wa / Math.sqrt(1 + x * x), dz = rf.L / (1 + 1 / (x * x)), zR = Math.PI * w0 * w0 / lam;
  return { lam, wa, w0, dz, zR, g: H.g, theta: Math.atan(lam / (Math.PI * w0)), R: rf.L };
}
/* the wavelength a horn is built for, mm: a feed horn's own; a receiver's, the bench's RF beam (3 mm without one) */
export function hornLam(el) {
  if (el.type === 'source') return C_NM_GHZ / el.mmw.ghz * 1e-6;
  const nm = benchNms().find(v => v > 1e5);
  return nm ? nm * 1e-6 : 3;
}
/* a horn's build in its own frame (x along its beam, the aperture at 0, the rest behind): the flare
   is the cone whose slant length L runs from the apex to the aperture's rim (half-angle asin(a / L)),
   narrowing to a waveguide sized for one mode (r = 0.36 lambda: TE11 alone), then two wavelengths of
   guide and a flange; back is where it ends, where its connector and electrical ports sit */
export function hornGeom(el) {
  const { a, L } = el.mmw, lam = hornLam(el);
  const Lax = Math.sqrt(Math.max(1e-6, L * L - a * a)), tanA = a / Lax;
  const rg = Math.min(0.36 * lam, 0.9 * a), Lf = (a - rg) / tanA;
  const xb = -Lf - 2 * lam, rFl = Math.max(2.2 * rg, rg + 1), back = xb - Math.max(0.4 * lam, 0.5);
  return { a, lam, Lax, tanA, rg, Lf, xb, rFl, back };
}
export function normRf(r, type) {
  if (type !== 'source' && type !== 'detector') return { part: true };
  const o = { kind: RF_HORNS[r.kind] ? r.kind : 'corrugated', a: clamp(num(r.a, 7.5), 0.05, 2000), L: clamp(num(r.L, 60), 0.5, 1e5) };
  if (type === 'source') {
    o.ghz = clamp(num(r.ghz, 100), 1, 3000); o.dbm = clamp(num(r.dbm, 0), -120, 60);
    o.tx = RF_TX[r.tx] ? r.tx : 'cw';
    if (o.tx === 'up') o.cl = clamp(num(r.cl, 6), 0, 60);                                   // the upconverter's conversion loss, dB, from its 50 ohm IF input
  }
  if (type === 'detector') {
    o.span = clamp(num(r.span, 40), 1, 190); o.points = clamp(Math.round(num(r.points, 61)), 5, 401);   // its frequency sweep: % of the frequency, and points
    o.pol = r.pol === 's' || r.pol === 'p' ? r.pol : 'both';                                 // the polarisation its mode takes in: s (out of the bench plane), p, or both
    o.rx = RF_RX[r.rx] ? r.rx : 'video';
    o.tant = clamp(num(r.tant, 295), 0, 1e5);                                                // what it looks into, K
    if (o.rx === 'video') { o.rv = clamp(num(r.rv, 1000), 1e-3, 1e7); o.nep = clamp(num(r.nep, 5), 1e-4, 1e6); o.vbw = clamp(num(r.vbw, 1), 1e-6, 1e5); }   // V/W, pW/rtHz, MHz
    else { o.lo = clamp(num(r.lo, 100), 1, 3000); o.cl = clamp(num(r.cl, 6), 0, 60); o.trx = clamp(num(r.trx, 1000), 0, 1e6); o.ifbw = clamp(num(r.ifbw, 1000), 1e-3, 1e5);   // GHz, dB, K, MHz
      o.sideband = r.sideband === 'dsb' ? 'dsb' : 'ssb'; }   // 'ssb': trx an SSB temperature, the image terminated cold (as files before it read); 'dsb': trx DSB, the antenna's noise in both sidebands
  }
  return o;
}
/* a horn sets its own beam: a source its wavelength, waist, power (the share its modes carry) and
   rays; a receiver its aperture */
export function applyRf(el) {
  const rf = el.mmw;
  if (!rf || rf.part) return;
  if (el.type === 'detector') { el.length = 2 * rf.a; return; }
  const B = rfBeam(rf, rf.ghz);
  el.wavelength = C_NM_GHZ / rf.ghz;
  el.gauss = true; el.w0 = B.w0; el.z0 = -B.dz; el.m2 = 1; el.tem = rf.kind === 'gauss' ? 'gauss' : 'horn';
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


/* ---------- A zoned lens ----------
   A made-to-order lens made thinner by taking out of it, where it is thick, whole layers a wave of path deep at its
   zone frequency: each dz = λz / (n − 1) of plastic delays the wave by exactly λz, so at that frequency the zoned lens
   and the smooth one it is cut from bend the wave alike. Its thickness at r is the smooth lens's less k(r) dz, k the
   whole layers it is thicker there than at its thinnest, so it lies between its thinnest and that plus dz: lighter,
   and less lossy. The steps are cut in its curved face (the front, or the back if the front is flat). Away from the
   zone frequency each step delays the wave by k λz, not k λ: the phase slips by k (λz − λ) across the zones, which
   narrows its band. The bench traces the smooth lens (the same at the zone frequency); the RF designer the zoned. */
export function normZoned(z) { return z && typeof z === 'object' && isFinite(+z.ghz) && +z.ghz > 0 ? { ghz: clamp(+z.ghz, 1, 1000) } : undefined; }
const zSag = (s, r) => {
  const asph = (s.a2 || 0) * r * r + (s.A || []).reduce((a, c, j) => a + c * r ** (4 + 2 * j), 0);
  if (s.R === null || s.R === undefined || !isFinite(s.R) || !s.R) return asph;
  const c = 1 / s.R, q = 1 - (1 + (s.k || 0)) * c * c * r * r;
  return (q > 0 ? c * r * r / (1 + Math.sqrt(q)) : Math.sign(c) * Math.abs(s.R)) + asph;
};
export function lensZones(el) {
  if (!el || el.type !== 'lens' || !el.zoned || el.surfaces.length !== 2) return null;
  const M = RF_MAT[el.materials[0] && el.materials[0].glass];
  if (!M || !(M.n > 1)) return null;
  const S = el.surfaces, T = el.gaps[0], a = el.diameter / 2, lam = C_NM_GHZ / el.zoned.ghz * 1e-6, dz = lam / (M.n - 1);
  const face = S[0].R !== null && S[0].R ? 0 : 1, ts = r => T + zSag(S[1], r) - zSag(S[0], r);
  let tMin = Infinity;
  for (let i = 0; i <= 400; i++) tMin = Math.min(tMin, ts(a * i / 400));
  const k = r => Math.max(0, Math.floor((ts(Math.min(r, a)) - tMin) / dz + 1e-9));
  // the radii the steps stand at: where the whole layers taken out change
  const steps = [];
  for (let i = 1, kp = k(0); i <= 2000; i++) {
    const r1 = a * i / 2000, k1 = k(r1);
    if (k1 !== kp) { let lo = a * (i - 1) / 2000, hi = r1; for (let q = 0; q < 40; q++) { const m = (lo + hi) / 2; if (k(m) === kp) lo = m; else hi = m; } steps.push((lo + hi) / 2); kp = k1; }
  }
  return { ghz: el.zoned.ghz, lam, dz, face, n: M.n, tMin, steps, k, ts, t: r => ts(r) - k(r) * dz, kMax: k(0) };
}
