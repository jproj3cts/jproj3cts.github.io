import { faceRNormal } from './face-pol.js';
import { clamp } from './constants.js';
import { C_NM_GHZ, PRINTER, RF_MAT, mixA, mixEps, mixFill } from './rf.js';
import { solveLinear } from './numeric.js';

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
   lowest index. On the bench it is traced as a slab of graded plastic between two flat faces
   (grinSlab, below), as the RF designer and the lens engine take it; its thin-plate formulas
   (applyGrin) stay on the part for its paraxial focal length and the closed forms. */
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
  // a face square on, as the bench takes it (core/face-pol.js): bare, or with a layer of index nm, tm thick (mm), at
  // the wavelength lamX (mm)
  const refl = n => faceRNormal(1, n, 1, null);
  const reflM = (n, nm, lamX) => faceRNormal(1, n, lamX * 1e6, { mode: 'stack', layers: [{ n: nm, d: tm * 1e6 }] });
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
  // the highest frequency it holds to: where its least density's lines come a quarter wave in the
  // plastic apart (above it the structure is coarse enough to scatter, and is no longer a material)
  const ghzMax = usable ? C_NM_GHZ / (4 * M.n * GRIN_LINE * 100 / fillLo * 1e6) : 0;
  // the band its matching layers work over: where the centre's face reflects under 1%
  let band = null;
  if (match) {
    const n0 = nHi, nm0 = nmOf(nHi), R1 = f => reflM(n0, nm0, C_NM_GHZ / f * 1e-6);
    const edge = dir => { let f = g.ghz; for (let k = 0; k < 400 && R1(f) < 0.01; k++) f *= 1 + dir * 0.005; return f; };
    if (R1(g.ghz) < 0.01) band = [edge(-1), Math.min(edge(1), ghzMax)];
  }
  const checks = [];
  if (!usable) checks.push('The density range leaves nothing to grade: at ' + fmt(g.ghz) + ' GHz the lowest density is ' + fillLo.toFixed(0) + '%, so the density at the centre must be well above it.');
  else {
    if (dia > PRINTER.maxDia || tTot > PRINTER.maxHeight) checks.push('Too large to make in one piece: up to ' + PRINTER.maxDia + ' mm across and ' + PRINTER.maxHeight + ' mm thick can be made.');
    if (tTot / g.f > 0.3) checks.push('The disc is thick against its focal length (' + (tTot / g.f).toFixed(2) + ' of it): its focus is where the bench\u2019s rays through the graded slab put it, not quite its design focal length from its centre. A longer focal length, or a wider density range, makes it thinner.');
    if (dia / lam < 5) checks.push('It is only ' + (dia / lam).toFixed(1) + ' wavelengths across: the Gaussian-beam picture is rough at this size.');
  }
  return { M, eps, lam, a, t, tm, tTot, match, ghzMax, band, nmAt, layerFillAt, rMatch, reflM, nHi, nLo, fillHi, fillLo, fillFreq, raised: fillFreq > g.fillMin, usable, nAt, fillAt, lossDb, vol, grams, checks,
    opdExpr: g.profile === 'parabolic' ? 'r^2/(2*' + fmt(g.f) + ')' : '(sqrt(r^2+' + fmt(g.f * g.f) + ')-' + fmt(g.f) + ')' };
}
/* the disc on the bench: a mask with the delay and amplitude its design gives. nAs: the plastic's
   index as it was printed, when that differs from the design's (a tolerance check): the disc keeps
   its design (its densities and thickness), and its delay is what that plastic gives them */
export function applyGrin(el, nAs) {
  el.grin = normGrin(el.grin);
  // the bench's slab (grinSlab) takes the as-printed index from here while a tolerance check holds it
  if (nAs) el.nAs = nAs; else delete el.nAs;
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
  if (nAs) {
    // each part's permittivity by the mixing rule at the same density: eps'^a - 1 = (eps^a - 1) s
    const em = D.eps, sA = (Math.pow(nAs * nAs, a) - 1) / (Math.pow(em, a) - 1);
    const as = X => '(1+(' + X + '^' + fmt(2 * a) + '-1)*' + fmt(sA) + ')^' + fmt(1 / (2 * a)), asN = x => Math.pow(1 + (Math.pow(x, 2 * a) - 1) * sA, 1 / (2 * a));
    const Nm = 'max(sqrt(' + N + '),' + fmt(D.nLo) + ')';
    const path = fmt(D.t) + '*' + as(N) + (D.match ? '+' + fmt(2 * D.tm) + '*' + as(Nm) : '');
    const p0 = D.t * asN(D.nHi) + (D.match ? 2 * D.tm * asN(Math.max(Math.sqrt(D.nHi), D.nLo)) : 0);
    el.delay = '(' + path + '-' + fmt(p0) + ')/lambda';
  }
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

/* ---------- The disc as a slab: on the bench, in the RF designer and in the lens engine ----------
   A slab between two flat faces, as thick as the whole disc (its layers with it), of the plastic graded from the
   axis so its optical path at r is the disc's own, n(r) = n₀ − opd(r)/T: n₀ the centre's mean index through the
   slab (core and layers), held as the plastic's index plus dn, and the fall fitted over the disc as
   g₂r² + g₄r⁴ + g₆r⁶ (the graded glass the bench's rays and the lens engine trace, so the bench, the designer
   and the engine agree by construction). With it, for the bench: alpha(r, lam), the power the slab absorbs per
   mm at r (the core's and the layers' loss at their densities, through the slab's thickness), and coat(r), the
   matching layer a face carries at r (null for a bare disc). nAs: the plastic's index as printed, when that
   differs from the design's (a tolerance check: the densities and thickness stay the design's, the indices are
   what that plastic gives them). Null when the disc cannot be made. */
export function grinSlab(g, dia, nAs) {
  const D = grinDesign(g, dia);
  if (!D.usable || !isFinite(D.t)) return null;
  const M = D.M, T = D.tTot, a = D.a, mA = mixA(M);
  // each part's index as printed: the mixing rule at the same density with the plastic's permittivity as it is
  const sA = nAs ? (Math.pow(nAs * nAs, mA) - 1) / (Math.pow(D.eps, mA) - 1) : 1;
  const asN = n => (nAs ? Math.pow(1 + (Math.pow(n * n, mA) - 1) * sA, 1 / (2 * mA)) : n);
  const nCore = r => asN(D.nAt(r)), nLay = r => (D.match ? asN(D.nmAt(r)) : 0);
  const pathAt = r => D.t * nCore(r) + 2 * D.tm * nLay(r);
  const p0 = pathAt(0), n0 = p0 / T;
  // least squares in r², r⁴, r⁶ (scaled by a, so the sums stay well conditioned), weighted by the area at r
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0], K = 64;
  for (let k = 0; k < K; k++) {
    const u = (k + 0.5) / K, r = u * a, w = u, y = (pathAt(r) - p0) / T, ph = [u * u, u ** 4, u ** 6];
    for (let i = 0; i < 3; i++) { b[i] += w * ph[i] * y; for (let j = 0; j < 3; j++) A[i][j] += w * ph[i] * ph[j]; }
  }
  const c = solveLinear(A, b) || [NaN, NaN, NaN], grad = [c[0] / a ** 2, c[1] / a ** 4, c[2] / a ** 6];
  // the loss at r: each part's density gives its loss (core/rf.js mixEps), the plastic's loss tangent as designed
  const alphaOf = (n, lam) => { const f = mixFill(M, n * n); return 2 * Math.PI * mixEps(M, f).epsI / (n * lam); };
  const alpha = (r, lam) => { r = Math.min(Math.abs(r), a); return (alphaOf(D.nAt(r), lam) * D.t + (D.match ? alphaOf(D.nmAt(r), lam) * 2 * D.tm : 0)) / T; };
  const coat = D.match ? r => ({ mode: 'stack', layers: [{ n: asN(D.nmAt(Math.min(Math.abs(r), a))), d: D.tm * 1e6 }] }) : null;
  return { D, T, n0, dn: n0 - M.n, grad, a, alpha, coat };
}
/* the disc's losses at ghz over a beam of radius w (power weighted): its two faces' reflection (bare, or through its
   layers at that frequency) and its absorption, core and layers, as the share of power each lets through */
export function grinLoss(D, ghz, w) {
  const lam = C_NM_GHZ / ghz * 1e-6, M = D.M;
  const alpha = n => { const f = mixFill(M, n * n); return 2 * Math.PI * mixEps(M, f).epsI / (n * lam); };
  let num = 0, numA = 0, den = 0;
  for (let k = 0; k < 48; k++) {
    const r = (k + 0.5) / 48 * D.a, wt = r * Math.exp(-2 * r * r / (w * w)), n = D.nAt(r);
    let R, A = Math.exp(-alpha(n) * D.t);
    if (D.match) { const nm = D.nmAt(r); R = D.reflM(n, nm, lam); A *= Math.exp(-alpha(nm) * 2 * D.tm); }
    else R = ((n - 1) / (n + 1)) ** 2;
    num += wt * (1 - R) * (1 - R); numA += wt * A; den += wt;
  }
  return { refl: den ? num / den : 1, absorb: den ? numA / den : 1 };
}
