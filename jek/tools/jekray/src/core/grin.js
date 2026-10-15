import { clamp } from './constants.js';
import { C_NM_GHZ, PRINTER, RF_MAT } from './rf.js';

/* ---------- A graded-index RF lens, printed ----------
   A flat disc whose index falls from its centre to its edge: printed in one material, the
   index set by how dense each part of it is printed. Its design is a focal length, a diameter,
   a material, the highest and lowest density it may use and the frequency it is made for; from
   these come its index profile, its thickness, its loss and its weight.

   The effective permittivity of plastic and air mixed finer than the wavelength is taken as
   their mean by volume, eps = 1 + density (eps_m - 1), and its loss the plastic's share of it,
   eps'' = density eps_m tan(delta). The mixing holds while the printed structure is well under
   a wavelength across: lines 0.45 mm wide at density F lie about 0.45 / F mm apart, so the
   lowest density is raised, at a given frequency, until that is a quarter of the wavelength
   in the plastic or less.

   The index profile makes the disc's optical path fall from its centre as an ideal lens's
   does, sqrt(r^2 + f^2) - f (no spherical aberration for a collimated beam), or as a
   parabola, r^2 / 2f. The disc's thickness is what that fall needs between its highest and
   lowest index. On the bench it is a thin plate (a mask) with that delay and the amplitude
   its loss and its faces' reflection leave: a disc thin against its focal length is modelled
   well; the panel says when it is not. */
export const GRIN_LINE = 0.45;            // mm, an extrusion line's width (0.4 mm nozzle)
export const GRIN_FLOOR = 10;             // %: the lowest density that still holds together
export const GRIN_PROFILES = { ideal: 'Ideal lens (no spherical aberration)', parabolic: 'Parabolic' };
const fmt = v => +(+v).toPrecision(7);

export function normGrin(g) {
  g = g && typeof g === 'object' ? g : {};
  const m0 = g.mat === 'PP (printed)' ? 'PP' : g.mat, mat = RF_MAT[m0] && RF_MAT[m0].print ? m0 : 'PLA';
  const fillMax = clamp(isFinite(g.fillMax) ? +g.fillMax : 100, 20, 100);
  return {
    f: clamp(isFinite(g.f) ? +g.f : 150, 5, 1e5),
    ghz: clamp(isFinite(g.ghz) ? +g.ghz : 24, 1, 300),
    mat,
    fillMax,
    fillMin: clamp(isFinite(g.fillMin) ? +g.fillMin : 15, GRIN_FLOOR, fillMax - 1),
    profile: GRIN_PROFILES[g.profile] ? g.profile : 'ideal',
  };
}
/* the design: dia the disc's diameter (mm) */
export function grinDesign(g, dia) {
  const M = RF_MAT[g.mat], eps = M.n * M.n, lam = C_NM_GHZ / g.ghz * 1e-6, a = dia / 2;
  const nOf = fill => Math.sqrt(1 + fill / 100 * (eps - 1)), fillOf = n => 100 * (n * n - 1) / (eps - 1);
  const fillFreq = 100 * GRIN_LINE / (lam / (4 * M.n));                    // the lowest density the frequency allows
  const fillLo = Math.max(g.fillMin, fillFreq), fillHi = g.fillMax;
  const nHi = nOf(fillHi), nLo = nOf(Math.min(fillLo, fillHi));
  const opd = g.profile === 'parabolic' ? r => r * r / (2 * g.f) : r => Math.sqrt(r * r + g.f * g.f) - g.f;
  const usable = fillLo < fillHi - 2;
  const t = usable ? opd(a) / (nHi - nLo) : Infinity;
  const nAt = r => nHi - opd(Math.min(r, a)) / t, fillAt = r => fillOf(nAt(r));
  // loss: absorbed (power per mm, 2 pi eps'' / (n lambda)), and reflected at the two faces
  const alpha = r => 2 * Math.PI * (fillAt(r) / 100) * eps * M.tand / (nAt(r) * lam);
  const refl = n => ((n - 1) / (n + 1)) ** 2;
  const lossDb = r => ({ abs: 4.343 * alpha(r) * t, refl: -20 * Math.log10(1 - refl(nAt(r))) });
  // the plastic it takes, and its weight
  let vol = 0;
  if (usable) for (let i = 0; i < 200; i++) { const r = (i + 0.5) * a / 200; vol += fillAt(r) / 100 * 2 * Math.PI * r * (a / 200) * t; }
  const grams = vol / 1000 * (M.density || 1.2);
  const checks = [];
  if (!usable) checks.push('The density range leaves nothing to grade: at ' + fmt(g.ghz) + ' GHz the lowest density is ' + fillLo.toFixed(0) + '%, so the density at the centre must be well above it.');
  else {
    if (dia > PRINTER.maxDia || t > PRINTER.maxHeight) checks.push('Too large to make in one piece: up to ' + PRINTER.maxDia + ' mm across and ' + PRINTER.maxHeight + ' mm thick can be made.');
    if (t / g.f > 0.3) checks.push('The disc is thick against its focal length (' + (t / g.f).toFixed(2) + ' of it): modelled as a thin plate, its focus is only roughly placed. A longer focal length, or a wider density range, makes it thinner.');
    if (dia / lam < 5) checks.push('It is only ' + (dia / lam).toFixed(1) + ' wavelengths across: the Gaussian-beam picture is rough at this size.');
  }
  return { M, eps, lam, a, t, nHi, nLo, fillHi, fillLo, fillFreq, raised: fillFreq > g.fillMin, usable, nAt, fillAt, lossDb, vol, grams, checks,
    opdExpr: g.profile === 'parabolic' ? 'r^2/(2*' + fmt(g.f) + ')' : '(sqrt(r^2+' + fmt(g.f * g.f) + ')-' + fmt(g.f) + ')' };
}
/* the disc on the bench: a mask with the delay and amplitude its design gives */
export function applyGrin(el) {
  el.grin = normGrin(el.grin);
  const D = grinDesign(el.grin, el.length);
  if (!D.usable) { el.amp = 'circ(r/' + fmt(D.a) + ')'; el.delay = '0'; el.preset = 'grin'; return D; }
  const N = '(' + fmt(D.nHi) + '-' + D.opdExpr + '/' + fmt(D.t) + ')';
  const F = '((' + N + '^2-1)/' + fmt(D.eps - 1) + ')';
  el.delay = '-' + D.opdExpr + '/lambda';
  el.amp = 'circ(r/' + fmt(D.a) + ')*(1-((' + N + '-1)/(' + N + '+1))^2)*exp(-pi*' + F + '*' + fmt(D.eps * D.M.tand) + '*' + fmt(D.t) + '/(' + N + '*lambda))';
  el.preset = 'grin';
  return D;
}
