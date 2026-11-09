import { coatPreset, qwot } from '../../../jekray/src/core/coatings.js';
import { coatSpec, coatToStack } from '../../../jekray/src/core/coatdesign.js';

/* ==========================================================================
   A coating, as JEKfilm keeps it: a .jekfilm file, one design to a file.
     { format: 'jekfilm', version: 1, name,
       spec: { target, sub: { glass } | { n }, n0, lo, hi, design, angles: 'upto' | 'band', theta0, theta, pol, R, edge, passBelow },
       layers: [{ n, d }] }        // from the outside in; d in nm
   What the stack is for and what it is judged in (the spec) travels with the layers, so a coating opened again is
   judged as it was designed. The physics is JEKray's, shared as it is (core/coatings.js for the stack,
   core/coatdesign.js for the targets, the merit and the optimiser), so what is designed here is what JEKray traces.
   normFilm takes anything and gives a coating that opens: there are no format migrations, an old file gets defaults.
   ========================================================================== */
export const FILM_FORMAT = 'jekfilm';
export const FILM_VERSION = 1;
export const FILM_STORE_KEY = 'jek-film-v1';
/* what a coating can be for: JEKray's targets but RF's matching layer (the RF designer keeps that) */
export const FILM_TARGETS = { ar: 'Anti-reflection', hr: 'High reflector', split: 'Beam splitter', edge: 'Dichroic edge' };
/* the substrates offered, with their dispersion: JEKray's Sellmeier coefficients (core/glass.js GLASS, B1..B3 then
   C1..C3 in µm²; B270 a Cauchy fit), copied so JEKfilm need not load the whole glass catalogue; a test checks they are
   JEKray's own */
export const FILM_GLASSES = {
  'N-BK7': [1.03961212, 0.231792344, 1.01046945, 0.00600069867, 0.0200179144, 103.560653],
  'Fused silica': [0.6961663, 0.4079426, 0.8974794, 0.00467914826, 0.0135120631, 97.9340025],
  'B270': { cauchy: [2.279137203, 0.013667078, 8.4343511e-5] },
  'N-SF11': [1.73759695, 0.313747346, 1.89878101, 0.013188707, 0.0623068142, 155.23629],
  'N-SF6': [1.77931763, 0.338149866, 2.08734474, 0.0133714182, 0.0617533621, 174.01759],
  'N-LAK22': [1.14229781, 0.535138441, 1.04088385, 0.00585778594, 0.0198546147, 100.834017],
  'F2': [1.34533359, 0.209073176, 0.937357162, 0.00997743871, 0.0470450767, 111.886764],
  'CaF2': [0.5675888, 0.4710914, 3.8484723, 0.00252643, 0.0100783, 1200.556],
  'MgF2': [0.48755108, 0.39875031, 2.3120353, 0.001882178, 0.008951888, 566.13559],
  'Sapphire': [1.4313493, 0.65054713, 5.3414021, 0.0052799261, 0.0142382647, 325.017834],
  'ZnSe': [4.45813734, 0.467216334, 2.8956629, 0.0403446215, 0.153171194, 2221.82944],
  'Silicon': [10.6684293, 0.0030434748, 1.54133408, 0.0909120621, 1.28765977, 1218816],
  'Germanium': [0.4886331, 14.5142535, 0.0091224, 1.393959, 0.1626427, 752.19],
};
/* a glass's index at nm, as JEKray's core/glass.js works it out */
export function filmGlassIndex(name, nm) {
  const c = FILM_GLASSES[name];
  if (!c) return 1.5;
  const um = nm / 1000, l2 = um * um;
  if (c.cauchy) { const a = c.cauchy; return Math.sqrt(a[0] + a[1] / l2 + a[2] / (l2 * l2)); }
  let n2 = 1;
  for (let i = 0; i < 3; i++) n2 += c[i] * l2 / (l2 - c[3 + i]);
  return Math.sqrt(n2);
}
/* the substrate's index at nm: a glass of the list, or an index of the person's own */
export const subIndex = (sub, nm) => (sub && sub.glass ? filmGlassIndex(sub.glass, nm) : sub && isFinite(sub.n) ? +sub.n : 1.5);
/* where the infrared materials let light through (nm): outside it their Sellmeier fit means nothing, or fails */
export const FILM_CLEAR = { Germanium: [1800, 23000], Silicon: [1200, 14000], ZnSe: [550, 18000] };
/* whether the substrate is clear at nm, so its index there means something */
export const subClear = (sub, nm) => { const r = sub && sub.glass && FILM_CLEAR[sub.glass]; return isFinite(subIndex(sub, nm)) && (!r || (nm >= r[0] && nm <= r[1])); };

const fnum = (v, lo, hi, d) => (v === null || v === undefined || v === '' || !isFinite(+v) ? d : Math.min(hi, Math.max(lo, +v)));
/* a coating that opens, from whatever was given */
export function normFilm(d) {
  d = d && typeof d === 'object' ? d : {};
  const s = d.spec && typeof d.spec === 'object' ? d.spec : {};
  const target = FILM_TARGETS[s.target] ? s.target : 'ar';
  const lo = fnum(s.lo, 100, 20000, 450), hi = Math.max(lo, fnum(s.hi, 100, 20000, 650));
  const sub = s.sub && typeof s.sub === 'object' && FILM_GLASSES[s.sub.glass] ? { glass: s.sub.glass }
    : s.sub && typeof s.sub === 'object' && isFinite(+s.sub.n) ? { n: fnum(s.sub.n, 1, 10, 1.5) } : { glass: 'N-BK7' };
  const design = fnum(s.design, 100, 20000, Math.round((lo + hi) / 2));
  // the angles judged: from square on up to theta, or a band of them, theta0 to theta
  const theta = fnum(s.theta, 0, 89, 0), angles = s.angles === 'band' ? 'band' : 'upto';
  const spec = { target, sub, n0: fnum(s.n0, 1, 10, 1), lo, hi, design, angles, theta0: angles === 'band' ? Math.min(theta, fnum(s.theta0, 0, 89, 0)) : 0, theta, pol: ['s', 'p'].includes(s.pol) ? s.pol : 'avg',
    R: fnum(s.R, 0, 100, 50), edge: fnum(s.edge, 100, 20000, design), passBelow: s.passBelow !== false };
  const layers = (Array.isArray(d.layers) ? d.layers : []).slice(0, 200).filter(L => L && typeof L === 'object')
    .map(L => ({ n: fnum(L.n, 1, 10, 1.38), d: fnum(L.d, 0, 1e6, 100) }));
  return { format: FILM_FORMAT, version: FILM_VERSION, name: String(d.name || 'Untitled coating').slice(0, 120), spec, layers };
}
/* a new coating: a single MgF2 layer on N-BK7, anti-reflection over the visible */
export function newFilm(name) {
  return normFilm({ name: name || 'Untitled coating', spec: { target: 'ar', lo: 450, hi: 650, design: 550 }, layers: coatPreset('mgf2', 550) });
}
/* the spec as JEKray's coat designer takes it (core/coatdesign.js coatSpec), the substrate's index at the design wavelength */
export function filmSpec(f) {
  const s = f.spec;
  return coatSpec({ target: s.target, n0: s.n0, ns: subIndex(s.sub, s.design), lo: s.lo, hi: s.hi, theta0: s.theta0, theta: s.theta, pol: s.pol, design: s.design, R: s.R, edge: s.edge, passBelow: s.passBelow });
}
/* the presets: a starting stack for the design wavelength */
export const FILM_PRESETS = [['mgf2', 'MgF2 single layer'], ['vcoat', 'Two-layer V-coat'], ['bb3', 'Three-layer broadband AR'], ['bs5050', 'Three-layer 50:50 splitter'], ['hr', 'HR stack, 6 pairs']];
export function filmPreset(kind, design) {
  if (kind === 'bb3') return [{ n: 1.38, d: qwot(1.38, design) }, { n: 2.10, d: qwot(2.10, design) / 2 }, { n: 1.63, d: qwot(1.63, design) }];
  return coatPreset(kind, design);
}
/* the coating as a JEKray face takes it (state/project.js normCoat, mode 'stack'), named */
export const filmToCoat = f => coatToStack(f.layers, filmSpec(f), f.name);
/* a small figure as three significant figures times a power of ten (1.93×10⁻⁶), so it is no longer than the rest */
const FILM_SUPER = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const dsSci = v => { const [m, e] = v.toExponential(2).split('e'); return m + '×10' + String(+e).replace(/./g, c => FILM_SUPER[c] || c); };
/* a figure to dp decimals, or, below 10^(1-dp) (where those decimals would keep fewer than two figures), as above */
export const dsFix = (v, dp) => (!isFinite(v) ? '—' : v === 0 || Math.abs(v) >= Math.pow(10, 1 - dp) ? v.toFixed(dp) : dsSci(v));
/* the file's text */
export const filmText = f => JSON.stringify(normFilm(f), null, 2);
