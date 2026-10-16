import { refIndex, matLabel } from '../core/glass.js';
import { surfaceParts } from './lens-design.js';

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
  const c = s.R ? 1 / s.R : 0, r2 = y * y;
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
  S.forEach((s, j) => { if (s.F && Object.values(s.F).some(v => v)) notes.push('Surface ' + (k0 + j + 1) + ' is a freeform: the section drawn is in the plane of the fields; its terms are given in the lens data.'); });
  surfaces.forEach(s => { if (!isFinite(s.sagRim)) notes.push('Surface ' + s.n + ' does not reach the lens’s full diameter: its sphere is smaller.'); });
  elements.forEach(e => { if (!e.air && isFinite(e.et) && e.et < 0.5) notes.push('The glass after surface ' + surfaces[e.from].n + ' is ' + (e.et <= 0 ? 'nothing' : 'only ' + (+e.et.toFixed(3)) + ' mm') + ' thick at its edge.'); });
  return { name: opts.name || 'Lens', kind: part.kind, dia, surfaces, elements, length: G.reduce((a, b) => a + b, 0), toleranced: !!T && [fr, thk, dec, tilt, dn, dv, irr].some(v => v !== null), notes };
}
