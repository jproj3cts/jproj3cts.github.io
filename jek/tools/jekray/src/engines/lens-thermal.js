import { glassKey, refIndex } from '../core/glass.js';
import { THERMAL } from '../core/glass-thermal.js';
import { designEpd, objOpts, primaryNm } from './lens-design.js';
import { lensSystem } from './lens-engine.js';
import { spotDiagram } from './lens-analysis.js';

/* ==========================================================================
   A lens design at another temperature and pressure
   The catalogue indices are relative to air at the glass's own reference temperature (20 °C, or 25 °C for some
   makers) and one atmosphere. At temperature T and pressure p:
     - each glass's absolute index changes by the makers' formula,
         Δn_abs = (n² - 1)/(2n) (D0 ΔT + D1 ΔT² + D2 ΔT³ + (E0 ΔT + E1 ΔT²)/(λ² - λtk²)),   ΔT from its reference;
       a crystal or plastic without those coefficients by its dn/dT; a glass with neither keeps its index against the air;
     - the air's index by n_air = 1 + (n_ref - 1) p / (1 + 3.4785e-3 (T - 15)), n_ref the standard air's
       (1 + [6432.8 + 2949810 λ²/(146 λ² - 1) + 25540 λ²/(41 λ² - 1)] 1e-8, λ in µm), and the glass's index in the
       design is its absolute index over that;
     - each lens grows with its glass's expansion: its radii, aspheric terms, thicknesses and clear radii;
       the air gaps (the spacers), the stop, the image distance (the detector's mount) and any decentre grow with
       the housing's.
   The design is taken to be at 20 °C and one atmosphere, so the changes are against the same model there.
   ========================================================================== */
export const HOUSINGS = [['al', 'Aluminium', 23.6e-6], ['ss', 'Stainless steel', 17.3e-6], ['brass', 'Brass', 19.0e-6], ['ti', 'Titanium', 8.6e-6], ['invar', 'Invar', 1.3e-6]];
export const T_NOMINAL = 20;
// crystals and plastics the makers' catalogues do not hold: dn/dT (absolute, at room temperature, in the visible;
// silicon, germanium and ZnSe in their infrared bands) and expansion, as their makers and the literature give them
const OTHERS = {
  'Fused silica': { dndt: 9.6e-6, cte: 0.55e-6 }, 'CaF2': { dndt: -10.6e-6, cte: 18.9e-6 }, 'Sapphire': { dndt: 13.1e-6, cte: 5.3e-6 },
  'ZnSe': { dndt: 61e-6, cte: 7.1e-6 }, 'Silicon': { dndt: 160e-6, cte: 2.6e-6 }, 'Germanium': { dndt: 396e-6, cte: 6.1e-6 },
  'PMMA': { dndt: -105e-6, cte: 68e-6 }, 'Polystyrene': { dndt: -120e-6, cte: 70e-6 },
};

/* the air's index at nm, T (°C), p (atmospheres) */
export function nAir(nm, T, p) {
  const l2 = (nm / 1000) ** 2, nref = 1 + (6432.8 + 2949810 * l2 / (146 * l2 - 1) + 25540 * l2 / (41 * l2 - 1)) * 1e-8;
  return 1 + (nref - 1) * p / (1 + 3.4785e-3 * (T - 15));
}
/* what is known of a material's behaviour with temperature: { T0, D (the makers' six), dndt, cte }, each null if not */
export function thermalOf(mat) {
  if (!mat || mat.glass === 'AIR') return null;
  const out = { T0: T_NOMINAL, D: null, dndt: isFinite(mat.dndt) ? +mat.dndt : null, cte: isFinite(mat.cte) ? +mat.cte : null };
  const key = mat.glass === 'custom' ? null : glassKey(mat.glass);
  const t = key && THERMAL[key];
  if (t) {
    out.T0 = t[0];
    if (t[8] & 1) out.D = t.slice(1, 7);
    if ((t[8] & 2) && out.cte === null) out.cte = t[7];
  } else if (key && OTHERS[key]) {
    if (out.dndt === null) out.dndt = OTHERS[key].dndt;
    if (out.cte === null) out.cte = OTHERS[key].cte;
  }
  return out;
}
/* a material's index relative to the air about it, at nm, T (°C) and p (atmospheres) */
export function nRelAt(mat, nm, T, p) {
  if (!mat || mat.glass === 'AIR') return 1;
  const n0 = refIndex(mat, nm), th = thermalOf(mat);
  // with nothing known of how its index changes, its index against the air is kept as it is
  if (!th || (!th.D && th.dndt === null)) return n0;
  const na = n0 * nAir(nm, th.T0, 1), dT = T - th.T0;
  let dn = 0;
  if (th.D) {
    const [D0, D1, D2, E0, E1, ltk] = th.D, l2 = (nm / 1000) ** 2;
    dn = (na * na - 1) / (2 * na) * (D0 * dT + D1 * dT * dT + D2 * dT ** 3 + (E0 * dT + E1 * dT * dT) / (l2 - ltk * ltk));
  } else if (th.dndt !== null) dn = th.dndt * dT;
  return (na + dn) / nAir(nm, T, p);
}
/* the prescription at T and p in a housing of expansion cteH: its geometry grown, and a function giving its
   materials at a wavelength (each glass as its index there); and what was taken as not changing */
export function thermalPrescription(P, T, p, cteH) {
  const dT = T - T_NOMINAL, grow = a => 1 + a * dT, missing = new Set();
  const glassy = m => m && m.glass !== 'AIR';
  const cteOf = m => { const th = thermalOf(m); if (!th || th.cte === null) { missing.add(m.glass === 'custom' ? 'n = ' + m.n : m.glass); return 0; } return th.cte; };
  const surfaces = P.surfaces.map((s, i) => {
    const after = P.materials[i], before = i ? P.materials[i - 1] : null;
    const a = glassy(after) ? cteOf(after) : glassy(before) ? cteOf(before) : cteH, g = grow(a);
    const t = Object.assign({}, s);
    if (t.R !== null && t.R !== undefined && isFinite(t.R)) t.R = t.R * g;
    if (t.a2) t.a2 = t.a2 / g;
    if (t.A && t.A.length) t.A = t.A.map((v, q) => v * Math.pow(g, -(2 * (q + 2) - 1)));
    if (t.odd && t.odd.length) t.odd = t.odd.map((v, q) => v * Math.pow(g, -q));
    if (t.semi > 0 && isFinite(t.semi)) t.semi = t.semi * (s.stop || !glassy(after) && !glassy(before) ? grow(cteH) : g);
    if (t.dec) t.dec = t.dec.map(v => v * grow(cteH));
    return t;
  });
  const gaps = P.gaps.map((d, i) => d * (glassy(P.materials[i]) ? grow(cteOf(P.materials[i])) : grow(cteH)));
  P.materials.forEach(m => { if (glassy(m)) { const th = thermalOf(m); if (!th || (!th.D && th.dndt === null)) missing.add(m.glass === 'custom' ? 'n = ' + m.n : m.glass); } });
  const image = isFinite(P.image) ? P.image * grow(cteH) : P.image;
  const at = nm => Object.assign({}, P, { surfaces, gaps, image, materials: P.materials.map(m => glassy(m) ? { glass: 'custom', n: nRelAt(m, nm, T, p) } : m) });
  return { at, image, missing };
}
/* the design's systems at T and p, as anaSystems makes them at the nominal */
export function thermalSystems(asm, P, T, p, cteH) {
  const c = asm.cond, nm0 = primaryNm(c), TP = thermalPrescription(P, T, p, cteH), P0 = TP.at(nm0);
  const S0 = lensSystem(P0, nm0, objOpts(c)), epd = designEpd(c, S0), o = objOpts(c, { epd, image: TP.image });
  const S = c.waves.map(w => lensSystem(TP.at(w.nm), w.nm, o)), Sp = S[c.primary];
  const na = Math.abs(Sp.n[Sp.N] * Sp.epr * Sp.par.uEp), fw = na > 0 ? 1 / (2 * na) : Infinity;
  return { A: { c, S, Sp, P: P0, epd, na, fw, nm0, W: c.waves.reduce((a, w) => a + w.w, 0) || 1, finite: !!Sp.obj }, missing: TP.missing, image: TP.image };
}
/* over temperatures temps (°C), at p: the focal length, where the paraxial focus is against the detector (its
   change from the nominal: + beyond it), and the RMS spot of each field on the detector; and the focus's drift
   per kelvin at the nominal */
export function thermalAnalysis(asm, P, temps, p, cteH) {
  const fields = asm.cond.fields;
  const one = T => {
    const { A, missing, image } = thermalSystems(asm, P, T, p, cteH), S = A.Sp;
    return { T, efl: S.par.efl, focus: S.par.back - (isFinite(image) ? image : S.par.back), rms: fields.map(f => spotDiagram(A, f.deg, 15).rms), missing };
  };
  const nom = one(T_NOMINAL), rows = temps.map(one);
  rows.forEach(r => { r.defocus = r.focus - nom.focus; r.defl = r.efl - nom.efl; });
  const h = 1, up = one(T_NOMINAL + h), dn = one(T_NOMINAL - h);
  const missing = new Set(); [nom, ...rows].forEach(r => r.missing.forEach(m => missing.add(m)));
  return { p, cteH, nominal: nom, rows, drift: (up.focus - dn.focus) / (2 * h), eflDrift: (up.efl - dn.efl) / (2 * h), missing: [...missing] };
}
