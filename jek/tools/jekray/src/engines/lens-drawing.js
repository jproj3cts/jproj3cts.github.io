import { refIndex, matLabel } from '../core/glass.js';
import { surfaceParts } from './lens-design.js';
import { dpPhase, dpSlopeOverR } from '../core/diffractive.js';
import { C_NM_GHZ, RF_MAT, lensZones, mountedDia, normMount, printedMatch } from '../core/rf.js';
import { grinDesign } from '../core/grin.js';

/* ==========================================================================
   A lens drawn to be made: what its drawing says
   Each lens (or window) of a design, as an optical drawing in the manner of ISO 10110 gives it:
   its surfaces' radii, clear apertures and conics, each glass's thickness at the centre, its edge
   thickness at its full diameter (a reference dimension, from the sags), its glass with its index
   and Abbe number, and the tolerances the design's tolerance settings give, written as the
   standard writes them:
     3/ A(B)  surface form: A fringes of power at 632.8 nm over the clear aperture, B of irregularity
              (or -, where none is set); the radius's own
              tolerance follows from it (near A λ R² / h² for clear radius h; exactly, the spheres whose
              sags there differ by A λ / 2, the larger change);
     4/ σ     centring: each surface's tilt to the lens's reference axis, in arcminutes: the lens's
              tilt tolerance plus its decentre over the surface's radius;
     the thickness ± mm; the glass's nd ± Δn and νd ± per cent.
   The light runs left to right, as on the lens data: a radius is positive with its centre to the right.
   ========================================================================== */
const DRAW_LAMBDA = 632.8e-6, DRAW_ARCMIN = 180 * 60 / Math.PI;

export function drawSag(s, y) {
  // (the section drawn is in the plane of the fields: a cylinder curved out of it is flat there)
  const c = s.R && s.cyl !== 'x' ? 1 / s.R : 0, r2 = y * y;
  const q = 1 - (1 + (s.k || 0)) * c * c * r2;
  if (q < 0) return NaN;
  let v = c ? c * r2 / (1 + Math.sqrt(q)) : 0;
  v += (s.a2 || 0) * r2;
  let p = r2 * r2;
  for (const a of s.A || []) { v += a * p; p *= r2; }
  if (s.odd) { let r = Math.abs(y); for (const a of s.odd) { v += a * r; r *= Math.abs(y); } }
  // a freeform's terms along the section drawn (the plane of the fields)
  if (s.F) for (const k in s.F) if (k[0] === '0') v += s.F[k] * Math.pow(y, +k[1]);
  return v;
}
const vdOf = m => { const nd = refIndex(m, 587.56), nF = refIndex(m, 486.13), nC = refIndex(m, 656.27); return nF !== nC ? (nd - 1) / (nF - nC) : Infinity; };

/* the parts of P a drawing can be made of: its lenses and windows, by index into P.parts */
/* an RF design's: its lenses and windows, and its graded-index discs */
export function rfDrawableParts(P) { return P.parts.map((p, pi) => p.kind === 'lens' || p.kind === 'window' || p.kind === 'grin' ? pi : -1).filter(pi => pi >= 0); }
export function drawableParts(P) { return P.parts.map((p, pi) => p.kind === 'lens' || p.kind === 'window' ? pi : -1).filter(pi => pi >= 0); }

/* the drawing's content for part pi of P: opts { name, dia (its full diameter, mm), T (the tolerance
   settings, or none) } */
export function drawingData(P, pi, opts) {
  opts = opts || {};
  const sps = surfaceParts(P), k0 = sps.findIndex(s => s.pi === pi), part = P.parts[pi], n = part.n, T = opts.T || null;
  const S = P.surfaces.slice(k0, k0 + n), G = P.gaps.slice(k0, k0 + n - 1), M = P.materials.slice(k0, k0 + n - 1);
  const dia = opts.dia > 0 ? opts.dia : 2 * Math.max(...S.map(s => s.semi || 0)), rim = dia / 2;
  const on = k => T && T[k] && T[k].on && T[k].v > 0 ? T[k].v : null;
  const fr = on('rad'), thk = on('thk'), dec = on('dec'), tilt = on('tilt'), dn = on('ind'), dv = on('abbe'), irr = on('irr');
  const surfaces = S.map((s, j) => {
    const h = isFinite(s.semi) && s.semi > 0 ? s.semi : rim, R = s.R;
    const out = { n: k0 + j + 1, R, k: s.k || 0, A: (s.A || []).filter(a => a), a2: s.a2 || 0, odd: s.odd && s.odd.some(a => a) ? s.odd.slice() : null, clear: 2 * h,
      sagClear: drawSag(s, h), sagRim: drawSag(s, rim) };
    // convex or concave as the glass sees it: a front face (glass after it) convex with its centre behind it
    const glassAfter = j < n - 1 && M[j].glass !== 'AIR', glassBefore = j > 0 && M[j - 1].glass !== 'AIR';
    out.face = R === null ? 'flat' : glassAfter && !glassBefore ? (R > 0 ? 'CX' : 'CC') : glassBefore && !glassAfter ? (R < 0 ? 'CX' : 'CC') : '';
    // the radius's tolerance: the spheres whose sags at the clear radius are A λ / 2 more and less (as tolerancing makes them)
    if (fr !== null) {
      out.form = fr;
      const c0 = R ? 1 / R : 0, s0 = c0 ? c0 * h * h / (1 + Math.sqrt(Math.max(0, 1 - c0 * c0 * h * h))) : 0;
      out.dR = R === null ? null : Math.max(...[1, -1].map(q => { const s1 = s0 + q * Math.sign(c0) * fr * DRAW_LAMBDA / 2, c = 2 * s1 / (s1 * s1 + h * h); return Math.abs(1 / c - R); }));
    }
    if (irr !== null) out.irr = irr;
    // the aspheric terms' sag at the clear radius, beyond the conic
    if (out.A.length) { let d = 0, p = h * h * h * h; for (const a of s.A || []) { d += a * p; p *= h * h; } out.asphDep = d; }
    if (tilt !== null || dec !== null) out.centring = (tilt || 0) + (dec && R ? dec / Math.abs(R) * DRAW_ARCMIN : 0);
    return out;
  });
  const elements = [];
  for (let j = 0; j < n - 1; j++) {
    const m = M[j], ct = G[j], et = ct + surfaces[j + 1].sagRim - surfaces[j].sagRim;
    if (m.glass === 'AIR') { elements.push({ air: true, ct, et, from: j }); continue; }
    const nd = refIndex(m, 587.56), vd = vdOf(m);
    elements.push({ from: j, glass: m.glass === 'Model' ? 'Model glass' : matLabel(m), model: m.glass === 'Model', nd, vd, ct, et,
      ctTol: thk, ndTol: dn, vdTol: dv !== null && isFinite(vd) ? vd * dv / 100 : null });
  }
  const notes = [];
  if (S.some(s => s.cyl)) notes.push('A cylindrical lens: its radii are of its curve ' + (S.find(s => s.cyl).cyl === 'y' ? 'in the section drawn; it is flat at right angles to it.' : 'at right angles to the section drawn, which is flat.'));
  S.forEach((s, j) => { if (s.F && Object.values(s.F).some(v => v)) notes.push('Surface ' + (k0 + j + 1) + ' is a freeform: the section drawn is in the plane of the fields; its terms are given in the lens data.'); });
  // a diffractive face: its phase, and what its zones come to over the clear radius (each a wrap of 2π in φ, m waves deep)
  S.forEach((s, j) => {
    if (!s.ph || !s.ph.some(v => v)) return;
    const fmtE = v => +v.toPrecision(6), h = s.semi, terms = s.ph.map((c, q) => (c ? fmtE(c) + ' ρ' + ['²', '⁴', '⁶', '⁸'][q] : '')).filter(Boolean).join(' + ').replace(/\+ -/g, '− ');
    const zones = Math.abs(dpPhase(s.ph, h * h)) / (2 * Math.PI), g = Math.abs(dpSlopeOverR(s.ph, h * h) * h);
    notes.push('Surface ' + (k0 + j + 1) + ' is diffractive, in order ' + (s.dm || 1) + ': phase φ(ρ) = ' + terms + ' rad (ρ in mm), ' + Math.round(zones) + ' zones to its clear radius' +
      (g > 0 ? ', the last ' + (2 * Math.PI / g * 1000).toPrecision(3) + ' µm wide' : '') + '; the surface drawn is its substrate.');
  });
  // a graded glass: its index's terms from the axis
  M.forEach((m, j) => {
    if (!m.grad || !m.grad.some(v => v)) return;
    const terms = m.grad.map((g, q) => (g ? (+g.toPrecision(6)) + ' r' + ['²', '⁴', '⁶'][q] : '')).filter(Boolean).join(' + ').replace(/\+ -/g, '− ');
    notes.push('The glass between surfaces ' + (k0 + j + 1) + ' and ' + (k0 + j + 2) + ' is graded: n(r) = n + ' + terms + ' (r in mm from the axis, n its index on the axis).');
  });
  surfaces.forEach(s => { if (!isFinite(s.sagRim)) notes.push('Surface ' + s.n + ' does not reach the lens’s full diameter: its sphere is smaller.'); });
  elements.forEach(e => { if (!e.air && isFinite(e.et) && e.et < 0.5) notes.push('The glass after surface ' + surfaces[e.from].n + ' is ' + (e.et <= 0 ? 'nothing' : 'only ' + (+e.et.toFixed(3)) + ' mm') + ' thick at its edge.'); });
  return { name: opts.name || 'Lens', kind: part.kind, dia, surfaces, elements, length: G.reduce((a, b) => a + b, 0), toleranced: !!T && [fr, thk, dec, tilt, dn, dv, irr].some(v => v !== null), notes };
}

/* An RF lens's drawing: the same sheet, with what an RF lens is made to in place of an optical shop's terms.
   opts as drawingData's, with rf (the RF designer's conditions), tol (its tolerance settings) and mount (the
   lens's flange, if any) and coats (its faces' coatings, front first). In place of fringes, nd and νd:
     the plastic's permittivity εr and loss tangent at the design frequency (± the permittivity tolerance);
     each face's radius ± the face-curvature tolerance (as a share of its curvature), and a profile
       tolerance t: the face may lie anywhere within a zone t wide about its true form, t chosen so that the
       path through the lens changes by no more than λ/8 at the top of the band, t (n − 1) ≤ λ/8, and no more
       than 0.5 mm however long the wavelength;
     each face's matching layer, if it has one: its permittivity and thickness;
     the flange, if any, drawn in the section, with its outside diameter, thickness and bolt holes.
   It is a drawing of the design, not a file to make it from: how the plastic is laid down is the maker's. */
export function rfDrawingData(P, pi, opts) {
  const D = drawingData(P, pi, Object.assign({}, opts, { T: null }));
  if (P.parts[pi].kind === 'grin' && opts.grin) return rfGrinDrawing(D, opts);
  const R = opts.rf, tol = opts.tol || {}, on = k => tol[k] && tol[k].on && tol[k].v > 0 ? tol[k].v : null;
  const sps = surfaceParts(P), k0 = sps.findIndex(s => s.pi === pi), S = P.surfaces.slice(k0, k0 + P.parts[pi].n);
  const glass = D.elements.find(e => !e.air), m = glass ? P.materials[k0 + glass.from] : null, M = m && RF_MAT[m.glass];
  const nm = C_NM_GHZ / R.ghz, n = m ? refIndex(m, nm) : NaN, lamHi = C_NM_GHZ / R.hi * 1e-6;
  const prof = isFinite(n) && n > 1 ? Math.min(0.5, Math.floor(lamHi / (8 * (n - 1)) / 0.05) * 0.05) : null;
  const rad = on('rad'), thk = on('thk'), eps = on('eps');
  D.surfaces.forEach((s, j) => {
    s.dR = rad !== null && s.R !== null ? Math.abs(s.R) * rad / 100 : undefined;
    s.profile = prof;
    const mk = M ? printedMatch(M, (opts.coats && opts.coats[j]) || S[j].coat) : null;
    if (mk) s.match = { eps: mk.n * mk.n, thick: mk.thick };
  });
  D.elements.forEach(e => { if (!e.air) e.ctTol = thk; });
  // a zoned lens: drawn as cut, its centre thickness the cut one's; its zones given
  const Z = opts.zoned && S.length === 2 ? lensZones({ type: 'lens', zoned: opts.zoned, surfaces: S, gaps: P.gaps.slice(k0, k0 + 1), materials: [m], diameter: D.dia }) : null;
  if (Z && Z.steps.length) { D.elements[0].ct = Z.t(0); D.zones = { face: Z.face, dz: Z.dz, ghz: Z.ghz, steps: Z.steps, k: Z.k }; }
  const mount = normMount(opts.mount);
  D.rf = { ghz: R.ghz, lo: R.lo, hi: R.hi, lamHi, material: M ? M.name : glass ? glass.glass : '—', eps: n * n, epsTol: eps, tand: M ? M.tand : NaN,
    mount, outer: mountedDia(D.dia, mount) };
  D.toleranced = [rad, thk, eps].some(v => v !== null) || prof !== null;
  return D;
}

/* a graded-index disc's drawing: a flat disc, its permittivity falling from its centre to its edge as its design grades
   it (given at five radii, for its focal length and profile), its layers' at the centre, and the RF sheet's tolerances
   (its thickness, its plastic's permittivity, its faces' flatness by the same λ/8 rule) */
function rfGrinDrawing(D, opts) {
  const R = opts.rf, tol = opts.tol || {}, on = k => tol[k] && tol[k].on && tol[k].v > 0 ? tol[k].v : null;
  const g = opts.grin, Dg = grinDesign(g, D.dia), lamHi = C_NM_GHZ / R.hi * 1e-6, n0 = Dg.nHi;
  const prof = Dg.usable ? Math.min(0.5, Math.floor(lamHi / (8 * (n0 - 1)) / 0.05) * 0.05) : null;
  D.surfaces.forEach(s => { s.profile = prof; if (Dg.match) s.match = { eps: Dg.nmAt(0) ** 2, thick: Dg.tm, centre: true }; });
  D.elements.forEach(e => { if (!e.air) { e.ctTol = on('thk'); e.et = e.ct; } });
  const mount = normMount(opts.mount);
  D.rf = { ghz: R.ghz, lo: R.lo, hi: R.hi, lamHi, material: Dg.M.name, eps: n0 * n0, epsTol: on('eps'), tand: Dg.M.tand, mount, outer: mountedDia(D.dia, mount),
    grin: { f: g.f, profile: g.profile, match: !!Dg.match, rows: [0, 0.25, 0.5, 0.75, 1].map(u => [u * Dg.a, Dg.usable ? Dg.nAt(u * Dg.a) ** 2 : NaN]) } };
  D.toleranced = true;
  // its grading is given as permittivity across it, not as the engine's fit of its index
  D.notes = [];
  return D;
}
