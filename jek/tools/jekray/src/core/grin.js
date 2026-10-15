import { clamp } from './constants.js';
import { C_NM_GHZ, PRINTER, RF_MAT, mixA, mixEps, mixFill } from './rf.js';

/* ---------- A graded-index RF lens, printed ----------
   A flat disc whose index falls from its centre to its edge: printed in one material, the
   index set by how dense each part of it is printed. Its design is a focal length, a diameter,
   a material, the highest and lowest density it may use and the frequency it is made for; from
   these come its index profile, its thickness, its loss and its weight.

   The effective permittivity of plastic and air mixed finer than the wavelength follows the
   material's mixing rule (core/rf.js mixEps): their mean by volume, eps = 1 + density (eps_m - 1),
   until printed tiles of it have been measured, and its loss the plastic's share of it. The mixing holds while the printed structure is well under
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
    match: g.match ? true : undefined,                       // a quarter-wave matching layer on each face
  };
}
/* the design: dia the disc's diameter (mm) */
export function grinDesign(g, dia) {
  const M = RF_MAT[g.mat], eps = M.n * M.n, lam = C_NM_GHZ / g.ghz * 1e-6, a = dia / 2;
  const nOf = fill => Math.sqrt(mixEps(M, fill / 100).eps), fillOf = n => 100 * mixFill(M, n * n);
  const fillFreq = 100 * GRIN_LINE / (lam / (4 * M.n));                    // the lowest density the frequency allows
  const fillLo = Math.max(g.fillMin, fillFreq), fillHi = g.fillMax;
  const nHi = nOf(fillHi), nLo = nOf(Math.min(fillLo, fillHi));
  const opd = g.profile === 'parabolic' ? r => r * r / (2 * g.f) : r => Math.sqrt(r * r + g.f * g.f) - g.f;
  const usable = fillLo < fillHi - 2;
  // Matching layers: on each face a layer a quarter wave thick at the centre, its index sqrt(n) of
  // the core behind it (no lower than the least density that can be made: beyond rMatch the match
  // is partial). They add path of their own, 2 tm (nm - 1), so the core is graded to make up only
  // the rest of the profile, and the disc as a whole keeps the design's focal length.
  const match = !!g.match && usable, tm = match ? lam / (4 * Math.sqrt(nHi)) : 0;
  const nmOf = n => Math.max(Math.sqrt(n), nLo), Lp = n => (match ? 2 * tm * (nmOf(n) - 1) : 0);
  const t = usable ? (opd(a) - (Lp(nHi) - Lp(nLo))) / (nHi - nLo) : Infinity;
  const nAt = !match ? r => nHi - opd(Math.min(r, a)) / t : r => {
    const want = opd(Math.min(r, a));
    let lo = nLo, hi = nHi;                                     // the core's path short of the centre's, layers and all, is the profile's
    for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (t * (nHi - m) + Lp(nHi) - Lp(m) > want) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  const fillAt = r => fillOf(nAt(r)), nmAt = r => nmOf(nAt(r)), layerFillAt = r => (match ? fillOf(nmAt(r)) : 0);
  const tTot = t + 2 * tm;
  let rMatch = a;
  if (match && Math.sqrt(nLo) < nLo) { let lo = 0, hi = a; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (Math.sqrt(nAt(m)) >= nLo) lo = m; else hi = m; } rMatch = lo; }
  // loss: absorbed (power per mm, 2 pi eps'' / (n lambda)) in the core and the layers, and reflected at the two faces
  const alpha = (n, fill) => 2 * Math.PI * mixEps(M, fill / 100).epsI / (n * lam);
  const refl = n => ((n - 1) / (n + 1)) ** 2;
  // a face with a layer of index nm, tm thick, between air and n: the single-layer film's reflectance at lambda
  const reflM = (n, nm, lamX) => {
    const r1 = (1 - nm) / (1 + nm), r2 = (nm - n) / (nm + n), c = Math.cos(4 * Math.PI * nm * tm / lamX);
    return (r1 * r1 + r2 * r2 + 2 * r1 * r2 * c) / (1 + r1 * r1 * r2 * r2 + 2 * r1 * r2 * c);
  };
  const lossDb = r => {
    const n = nAt(r), core = 4.343 * alpha(n, fillOf(n)) * t;
    if (!match) return { abs: core, refl: -20 * Math.log10(1 - refl(n)) };
    const nm = nmOf(n);
    return { abs: core + 4.343 * alpha(nm, fillOf(nm)) * 2 * tm, refl: -20 * Math.log10(1 - reflM(n, nm, lam)) };
  };
  // the plastic it takes, and its weight
  let vol = 0;
  if (usable) for (let i = 0; i < 200; i++) { const r = (i + 0.5) * a / 200; vol += (fillAt(r) * t + layerFillAt(r) * 2 * tm) / 100 * 2 * Math.PI * r * (a / 200); }
  const grams = vol / 1000 * (M.density || 1.2);
  const checks = [];
  if (!usable) checks.push('The density range leaves nothing to grade: at ' + fmt(g.ghz) + ' GHz the lowest density is ' + fillLo.toFixed(0) + '%, so the density at the centre must be well above it.');
  else {
    if (dia > PRINTER.maxDia || tTot > PRINTER.maxHeight) checks.push('Too large to make in one piece: up to ' + PRINTER.maxDia + ' mm across and ' + PRINTER.maxHeight + ' mm thick can be made.');
    if (tTot / g.f > 0.3) checks.push('The disc is thick against its focal length (' + (tTot / g.f).toFixed(2) + ' of it): modelled as a thin plate, its focus is only roughly placed. A longer focal length, or a wider density range, makes it thinner.');
    if (dia / lam < 5) checks.push('It is only ' + (dia / lam).toFixed(1) + ' wavelengths across: the Gaussian-beam picture is rough at this size.');
  }
  return { M, eps, lam, a, t, tm, tTot, match, nmAt, layerFillAt, rMatch, reflM, nHi, nLo, fillHi, fillLo, fillFreq, raised: fillFreq > g.fillMin, usable, nAt, fillAt, lossDb, vol, grams, checks,
    opdExpr: g.profile === 'parabolic' ? 'r^2/(2*' + fmt(g.f) + ')' : '(sqrt(r^2+' + fmt(g.f * g.f) + ')-' + fmt(g.f) + ')' };
}
/* the disc on the bench: a mask with the delay and amplitude its design gives */
export function applyGrin(el) {
  el.grin = normGrin(el.grin);
  const D = grinDesign(el.grin, el.length);
  if (!D.usable) { el.amp = 'circ(r/' + fmt(D.a) + ')'; el.delay = '0'; el.preset = 'grin'; return D; }
  // the core's index at r: exact without matching layers; with them, the linear grade across the
  // same range (within a hundredth of the core's), for the loss and reflection only (the delay is the design's)
  const N = '(' + fmt(D.nHi) + '-' + D.opdExpr + '/' + fmt(D.match ? D.t + 2 * D.tm * (D.nmAt(0) - D.nmAt(D.a)) / (D.nHi - D.nLo) : D.t) + ')';
  // the density there, and the loss it brings (core/rf.js mixEps), as the bench's formulas
  const a = mixA(D.M), lossOf = X => a === 1
    ? '((' + X + '^2-1)/' + fmt(D.eps - 1) + ')*' + fmt(D.eps * D.M.tand)
    : '((' + X + '^' + fmt(2 * a) + '-1)/' + fmt(Math.pow(D.eps, a) - 1) + ')*(' + X + '^2/' + fmt(D.eps) + ')^' + fmt(1 - a) + '*' + fmt(D.eps * D.M.tand);
  el.delay = '-' + D.opdExpr + '/lambda';
  if (!D.match) el.amp = 'circ(r/' + fmt(D.a) + ')*(1-((' + N + '-1)/(' + N + '+1))^2)*exp(-pi*' + lossOf(N) + '*' + fmt(D.t) + '/(' + N + '*lambda))';
  else {
    // each face a quarter-wave layer of index Nm (sqrt of the core's, no lower than can be made): its reflectance at lambda
    const Nm = 'max(sqrt(' + N + '),' + fmt(D.nLo) + ')', r1 = '((1-' + Nm + ')/(1+' + Nm + '))', r2 = '((' + Nm + '-' + N + ')/(' + Nm + '+' + N + '))';
    const c = 'cos(4*pi*' + Nm + '*' + fmt(D.tm) + '/lambda)';
    const R = '((' + r1 + '^2+' + r2 + '^2+2*' + r1 + '*' + r2 + '*' + c + ')/(1+' + r1 + '^2*' + r2 + '^2+2*' + r1 + '*' + r2 + '*' + c + '))';
    el.amp = 'circ(r/' + fmt(D.a) + ')*(1-' + R + ')*exp(-pi*' + lossOf(N) + '*' + fmt(D.t) + '/(' + N + '*lambda))*exp(-pi*' + lossOf(Nm) + '*' + fmt(2 * D.tm) + '/(' + Nm + '*lambda))';
  }
  el.preset = 'grin';
  return D;
}
