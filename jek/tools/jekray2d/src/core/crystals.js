import { deg } from '../state/project.js';

/* ==========================================================================
   Crystals, filters, gain, gratings and detectors: the numbers behind the newer elements
   ========================================================================== */

/* Uniaxial crystals: ordinary and extraordinary index, wavelength in µm */
export const CRYSTALS = {
  calcite: { name: 'Calcite',            // Ghosh 1999
    o: um => Math.sqrt(1.73358749 + 0.96464345 * um * um / (um * um - 0.0194325203) + 1.82831454 * um * um / (um * um - 120)),
    e: um => Math.sqrt(1.35859695 + 0.82427830 * um * um / (um * um - 0.0106689543) + 0.14429128 * um * um / (um * um - 120)) },
  yvo4: { name: 'YVO₄',             // Shi et al. 2001
    o: um => Math.sqrt(3.77834 + 0.069736 / (um * um - 0.04724) - 0.0108133 * um * um),
    e: um => Math.sqrt(4.59905 + 0.110534 / (um * um - 0.04813) - 0.0122676 * um * um) },
  abbo: { name: 'α-BBO',             // Eimerl et al. 1987
    o: um => Math.sqrt(2.7471 + 0.01878 / (um * um - 0.01822) - 0.01354 * um * um),
    e: um => Math.sqrt(2.37153 + 0.01224 / (um * um - 0.01667) - 0.01516 * um * um) },
};
export const CRYSTAL_SHAPES = { displacer: 'Beam displacer', wollaston: 'Wollaston prism', glan: 'Glan–Taylor polariser' };
/* A crystal region's material. Rays inside a crystal are split into their s and p parts
   (tag), and each sees its own index: ePol names the one polarised along the optic axis.
   walk, where set, is the optic axis's angle from the face normal in the bench plane: the
   extraordinary ray then sees an index between n_o and n_e and its energy walks off. */
export const bireMat = (crystal, ePol, walk) => ({ glass: 'bire', bire: crystal, ePol, walk: walk || 0, abs: 0 });
// a crystal region's optic axis in its part's frame (beam along +x): out of the plane for s,
// across the beam for p, or turned from the beam by its walk angle in the plane
export const bireAxis = m => m.ePol === 's' ? [0, 0, 1] : m.walk ? [Math.cos(m.walk * deg), Math.sin(m.walk * deg), 0] : [0, 1, 0];
export function birefIndex(m, tag, nm, th) {
  const C = CRYSTALS[m.bire] || CRYSTALS.calcite, um = nm / 1000, no = C.o(um), ne = C.e(um);
  if (tag !== m.ePol) return no;
  if (th === undefined) { if (!m.walk) return ne; th = m.walk * deg; }   // (th: the wave normal's angle to the axis, where the trace knows it)
  return 1 / Math.sqrt(Math.cos(th) ** 2 / (no * no) + Math.sin(th) ** 2 / (ne * ne));
}
/* the angle the extraordinary ray's energy leaves its wave normal by, signed in the bench
   plane: away from the optic axis in a negative crystal, towards it in a positive one. Given
   th, the wave normal's angle to the axis (0 to 180°), it is signed towards the axis. */
export function walkOff(m, nm, th) {
  const C = CRYSTALS[m.bire] || CRYSTALS.calcite, um = nm / 1000, no = C.o(um), ne = C.e(um);
  if (th === undefined) th = m.walk * deg;
  return -Math.atan((no * no - ne * ne) * Math.sin(th) * Math.cos(th) / (ne * ne * Math.cos(th) ** 2 + no * no * Math.sin(th) ** 2));
}

/* A filter's power transmission. Edges are logistic, their 10–90% width given in nm; a band
   is flat-topped (an eighth-order Butterworth) with its FWHM between the half points. */
export const FILTER_TYPES = { longpass: 'Long-pass', shortpass: 'Short-pass', bandpass: 'Band-pass', nd: 'Neutral density' };
export function filterT(el, nm) {
  if (el.ftype === 'nd') return Math.pow(10, -el.od);
  const t = el.tmax / 100, w = el.slope / 4.394;
  if (el.ftype === 'longpass') return t / (1 + Math.exp(-(nm - el.edge) / w));
  if (el.ftype === 'shortpass') return t / (1 + Math.exp((nm - el.edge) / w));
  const u = 2 * (nm - el.centre) / el.fwhm;
  return t / (1 + Math.pow(u * u, 4));
}
/* A gain sheet's single-pass power gain: g0 at its centre, falling to 1 with a Lorentzian line.
   That is its small-signal gain; in a cavity that lases, saturation holds the round trip at
   one, and the gain the light sees is the small-signal gain's logarithm scaled down to the
   saturated gain's (laserState), across the whole line (a homogeneous line) */
let gainSat = new Map();             // gain element id -> that scale, while its cavity lases
export function gainSmall(el, nm) {
  const u = 2 * (nm - el.centre) / el.fwhm;
  return 1 + (el.g0 - 1) / (1 + u * u);
}
export function gainAt(el, nm) {
  const g = gainSmall(el, nm), s = gainSat.get(el.id);
  return s === undefined || !(g > 0) ? g : Math.exp(s * Math.log(g));
}

