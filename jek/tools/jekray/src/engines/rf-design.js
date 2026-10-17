import { C_NM_GHZ, RF_HORNS, RF_MAT, isMatchCoat, rfBeam, rfTanD } from '../core/rf.js';
import { normCond, normRfCond } from '../core/assembly.js';
import { refIndex } from '../core/glass.js';
import { getEl } from '../state/elements.js';
import { lensSystem } from './lens-engine.js';
import { surfSag, surfaceParts } from './lens-design.js';

/* ==========================================================================
   An RF system as its designer sees it: a feed horn's Gaussian beam through the lenses and mirrors
   At millimetre waves a lens is tens of wavelengths across, so the beam is followed as a Gaussian beam
   (Goldsmith, Quasioptical Systems, 1998, ch. 2 to 4) rather than as rays. Its complex beam parameter q is
   carried in reduced form (q/n) through the prescription's first-order matrices: a gap of glass d of index n
   adds d/n; a surface of paraxial curvature c between indices n and n' takes 1/q to 1/q - (n' - n) c; a
   mirror, unfolded, to 1/q + 2c. The beam's radius anywhere is then w² = λ |q|² / (π Im q), λ in vacuum,
   whatever glass it is in.

   The feed horn's beam is its own (core/rf.js rfBeam: its aperture field's best Gaussian, the waist dz behind
   the aperture). What it is for:
     - collimate: the beam leaves the last lens as wide and as flat as it can; measured by the aperture
       efficiency of the last lens, its Gaussian field with its curvature over its aperture against a uniform
       one, 2 |1 - exp(-t (1 + iψ))|² / (t |1 + iψ|²), t = a²/w², ψ = π w² / (λ R), and the gain that gives;
     - focus: to a waist of radius w at a distance; measured by the coupling of the beam to that waist's
       Gaussian, 4 / ((w1/w2 + w2/w1)² + (π w1 w2 / λ)² (1/R1 - 1/R2)²) at its plane;
     - couple: into a receiving horn; the same coupling to its beam, times the share of its power its mode takes.
   The losses on the way: each face's reflection (Fresnel, or through its quarter-wave matching layer at the
   frequency, as a thin film), each lens's absorption (its plastic's loss tangent, through its thickness, over
   the beam's profile), and the power past each aperture (spillover, exp(-2 a²/w²)).
   ========================================================================== */
export const rfNm = ghz => C_NM_GHZ / ghz;
const rfCdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
/* a beam parameter's radius and phase radius (mm; R Infinity at a waist) */
export function beamOf(q, lam) {
  const m = q[0] * q[0] + q[1] * q[1];
  return { w: Math.sqrt(lam * m / (Math.PI * q[1])), R: Math.abs(q[0]) < 1e-12 ? Infinity : m / q[0], z: q[0], zR: q[1] };
}
/* the coupling of two Gaussian beams on one axis, at one plane */
export function gaussCoupling(w1, R1, w2, R2, lam) {
  const k = 1 / (isFinite(R1) ? R1 : Infinity) - 1 / (isFinite(R2) ? R2 : Infinity), p = Math.PI * w1 * w2 / lam;
  return 4 / ((w1 / w2 + w2 / w1) ** 2 + (p * (isFinite(k) ? k : 0)) ** 2);
}
/* a Gaussian field's aperture efficiency over a round aperture of radius a, with its phase radius R */
export function apertureEff(a, w, R, lam) {
  const t = a * a / (w * w), psi = isFinite(R) ? Math.PI * w * w / (lam * R) : 0;
  const ex = Math.exp(-t), re = 1 - ex * Math.cos(t * psi), im = ex * Math.sin(t * psi);
  return 2 * (re * re + im * im) / (t * (1 + psi * psi));
}
/* a face's power reflection at nm, from index n0 into n2: Fresnel, or through a single layer (n1, d nm) */
export function faceR(n0, n2, nm, coat) {
  if (!isMatchCoat(coat)) { const r = (n0 - n2) / (n0 + n2); return r * r; }
  const L = coat.layers[0], n1 = L.n, r01 = (n0 - n1) / (n0 + n1), r12 = (n1 - n2) / (n1 + n2), d = 4 * Math.PI * n1 * L.d / nm;
  const e = [Math.cos(d), -Math.sin(d)];
  const num = [r01 + r12 * e[0], r12 * e[1]], den = [1 + r01 * r12 * e[0], r01 * r12 * e[1]];
  const r = rfCdiv(num, den);
  return r[0] * r[0] + r[1] * r[1];
}
/* the RF conditions as the shared lens conditions have them: the band's wavelengths, the design's primary, an
   object at the feed's phase centre, the first lens's aperture */
export function rfSyncCond(asm, P) {
  const R = asm.rf = normRfCond(asm.rf), B = rfBeam(R.feed, R.ghz), semi = P && P.surfaces.length ? P.surfaces[0].semi : 50;
  asm.cond = normCond({ object: { kind: 'finite', d: R.feed.d + B.dz }, aperture: { kind: 'epd', v: 2 * semi },
    fields: [{ deg: 0, w: 1 }], waves: [R.lo, R.ghz, R.hi].map(g => ({ nm: rfNm(g), w: 1 })), primary: 1 });
}
const isGlass = m => m && m.glass !== 'AIR';
/* the system at one frequency: the beam followed from the feed horn's aperture to the goal's plane, sampled
   along the unfolded axis (z from the first vertex, w the beam's radius); at each surface its radius, the
   aperture's, the edge taper (dB) and the share spilled; the beam leaving; and the figures for the goal */
export function rfTrace(asm, P, ghz, opts) {
  opts = opts || {};
  const R = normRfCond(asm.rf), nm = rfNm(ghz), lam = nm * 1e-6, S = lensSystem(P, nm), N = S.N;
  const B = rfBeam(R.feed, ghz), H = RF_HORNS[R.feed.kind] || RF_HORNS.corrugated;
  const steps = opts.steps || 40, samples = [], surf = [];
  const push = (z, q) => samples.push({ z, w: beamOf(q, lam).w });
  // from the horn's aperture to the first vertex, in air
  const z0 = -R.feed.d, qw = B.zR;
  for (let k = 0; k <= steps; k++) { const z = z0 + (0 - z0) * k / steps; push(z, [z - z0 + B.dz, qw]); }
  let q = [R.feed.d + B.dz, qw];
  const sps = surfaceParts(P);
  for (let i = 0; i < N; i++) {
    const s = P.surfaces[i], w = beamOf(q, lam).w, a = s.semi > 0 && isFinite(s.semi) ? s.semi : Infinity;
    surf.push({ i, z: S.z[i], w, R: beamOf(q, lam).R, semi: a, taper: isFinite(a) ? 8.686 * (a / w) ** 2 : Infinity, spill: isFinite(a) ? Math.exp(-2 * (a / w) ** 2) : 0, kind: sps[i].kind, pi: sps[i].pi });
    const pc = S.c[i] + 2 * S.a2[i];
    const phi = S.mir[i] ? -2 * pc : (S.n[i + 1] - S.n[i]) * pc;
    // 1/q' = 1/q - phi, in reduced form
    const iq = rfCdiv([1, 0], q); q = rfCdiv([1, 0], [iq[0] - phi, iq[1]]);
    if (i < N - 1) {
      const g = P.gaps[i], n = S.n[i + 1], n2 = 12;
      for (let k = 1; k <= n2; k++) { const t = g * k / n2; push(S.z[i] + t, [q[0] + t / n, q[1]]); }
      q = [q[0] + g / n, q[1]];
    }
  }
  const zL = S.z[N - 1], out = beamOf(q, lam);
  // past the last vertex, in the medium after it (air), to the goal's plane, or for a collimated beam a little past its waist
  const g = R.goal, zEnd = zL + (g.kind === 'collimate' ? Math.max(g.d, -q[0] + q[1], 50) : g.d + (g.kind === 'couple' ? rfBeam(g.rx, ghz).dz : 0));
  for (let k = 1; k <= steps; k++) { const t = (zEnd - zL) * k / steps; push(zL + t, [q[0] + t, q[1]]); }
  // the losses: each face's reflection, each lens's absorption over the beam, each aperture's spillover
  let refl = 1, absorb = 1, spill = 1;
  const faces = [], lenses = [];
  for (let i = 0; i < N; i++) {
    const s = P.surfaces[i];
    if (S.mir[i] || s.stop) continue;
    const before = i ? P.materials[i - 1] : null, after = i < N - 1 ? P.materials[i] : null;
    if (!isGlass(before) && !isGlass(after)) continue;
    const el = s.from && getEl(s.from.id), coat = el && el.surfaces && el.surfaces[s.from.i] ? el.surfaces[s.from.i].coat : null;
    const Rf = faceR(S.n[i], S.n[i + 1], nm, isGlass(after) ? coat : null);
    faces.push({ i, R: Rf, matched: isMatchCoat(coat) }); refl *= 1 - Rf;
  }
  for (let i = 0; i < N - 1; i++) {
    const m = P.materials[i];
    if (!isGlass(m)) continue;
    const M = RF_MAT[m.glass], alpha = M ? 2 * Math.PI * M.n * rfTanD(M, ghz) / lam : 0;
    // the beam's profile at the lens (its radius on the two faces' mean): the share of power through each ring
    const w = (surf[i].w + surf[i + 1].w) / 2, a = Math.min(surf[i].semi, surf[i + 1].semi);
    let num = 0, den = 0;
    for (let k = 0; k < 48; k++) {
      const r = (k + 0.5) / 48 * (isFinite(a) ? a : 3 * w), wt = r * Math.exp(-2 * r * r / (w * w));
      const t = P.gaps[i] + surfSag(P.surfaces[i + 1], r) - surfSag(P.surfaces[i], r);
      num += wt * Math.exp(-alpha * Math.max(0, t)); den += wt;
    }
    const T = den ? num / den : 1;
    lenses.push({ i, alpha, T, mat: m.glass }); absorb *= T;
  }
  const apert = surf.filter(s => isFinite(s.semi) && s.kind !== 'stop');
  // the apertures the beam passes through on the way; for a collimated beam the last is the antenna's own, counted in its efficiency
  for (const s of apert) if (!(g.kind === 'collimate' && s === apert[apert.length - 1])) spill *= 1 - s.spill;
  const res = { ghz, lam, samples, surf, faces, lenses, out, zL, zEnd, feed: B, g: H.g, refl, absorb, spill };
  if (g.kind === 'collimate') {
    const last = apert[apert.length - 1], a = last ? last.semi : out.w * 1.5;
    // the field at the last lens: the beam leaving it, its radius and curvature there
    const wl = beamOf(q, lam).w, Rl = out.R;
    res.apEff = apertureEff(a, wl, Rl, lam);
    res.D = 2 * a;
    res.eff = H.g * refl * absorb * spill * res.apEff;
    res.gain = 10 * Math.log10(res.eff * (Math.PI * 2 * a / lam) ** 2);
    res.waist = { w: Math.sqrt(lam * out.zR / Math.PI), at: -out.z };
    res.theta = Math.atan(lam / (Math.PI * res.waist.w)) / Math.PI * 180;
  } else {
    const at = [q[0] + g.d + (g.kind === 'couple' ? rfBeam(g.rx, ghz).dz : 0), q[1]], bo = beamOf(at, lam);
    const wt = g.kind === 'couple' ? rfBeam(g.rx, ghz).w0 : g.w;
    res.coupling = gaussCoupling(bo.w, bo.R, wt, Infinity, lam);
    res.waist = { w: Math.sqrt(lam * out.zR / Math.PI), at: -out.z };
    res.target = { w: wt, at: zEnd - zL };
    res.gRx = g.kind === 'couple' ? (RF_HORNS[g.rx.kind] || RF_HORNS.corrugated).g : 1;
    res.eff = H.g * refl * absorb * spill * res.coupling * res.gRx;
  }
  return res;
}
/* the design at the band's two edges and its own frequency */
export function rfBand(asm, P) {
  const R = normRfCond(asm.rf);
  return { lo: rfTrace(asm, P, R.lo), mid: rfTrace(asm, P, R.ghz), hi: rfTrace(asm, P, R.hi) };
}
/* the indices the trace used at nm for a material (exported for the lens table) */
export const rfIndex = (m, ghz) => refIndex(m, rfNm(ghz));

/* ---------- Design from a spec ----------
   A lens of the system made to suit the beam that reaches it and what it is for, as a millimetre-wave lens is
   designed: each curved face a hyperbola of eccentricity n (conic -n²), which turns a point source at its focus
   into a plane wave in the glass (radius (n - 1) F), or a plane wave in the glass into a point in air. The point
   is the beam's phase centre: F the incoming beam's phase radius at the lens, and for a beam focused onward the
   phase radius the outgoing beam must have to make its waist where it is wanted. So the faces suit the Gaussian
   beam, not only the rays. Inside the lens the beam is flat, so the two faces are independent and the thickness
   changes nothing but the loss.
     hyperbolic: the curved face to the feed, the back flat (collimating; to focus it takes the power of both);
     biconvex: both faces hyperbolic, the beam focused from one phase centre to the other;
     planoconvex: a sphere and a flat, the thin lens's focal length (simplest, with the sphere's aberration).
   Where it stands: the first lens can be put where the feed's beam has the edge taper asked for, or (to focus or
   couple) where its width matches the width the target's beam has there, the coupling's best; any other is kept
   where it is. The thickness: the centre's, so the edge is as thick as asked. */
/* the beam parameter (reduced) just before surface idx, from the feed at its distance d */
export function rfQBefore(asm, P, ghz, idx, feedD) {
  const R = normRfCond(asm.rf), nm = rfNm(ghz), S = lensSystem(P, nm), B = rfBeam(R.feed, ghz);
  let q = [(feedD === undefined ? R.feed.d : feedD) + B.dz, B.zR];
  for (let i = 0; i < idx; i++) {
    const pc = S.c[i] + 2 * S.a2[i], phi = S.mir[i] ? -2 * pc : (S.n[i + 1] - S.n[i]) * pc;
    const iq = rfCdiv([1, 0], q); q = rfCdiv([1, 0], [iq[0] - phi, iq[1]]);
    q = [q[0] + P.gaps[i] / S.n[i + 1], q[1]];
  }
  return q;
}
export const RF_LENS_TYPES = { hyperbolic: 'Hyperbolic, flat back', biconvex: 'Two hyperbolic faces', planoconvex: 'Plano-convex, spherical' };
export function rfSynth(asm, P, spec) {
  const R = normRfCond(asm.rf), ghz = R.ghz, lam = rfNm(ghz) * 1e-6, notes = [];
  const sps = surfaceParts(P), part = P.parts[spec.pi];
  if (!part || part.kind !== 'lens' || part.n !== 2) return { error: 'Pick a lens of two faces to design.' };
  let i0 = 0; for (let k = 0; k < spec.pi; k++) i0 += P.parts[k].n;
  const M = RF_MAT[spec.mat];
  if (!M) return { error: 'Pick a material for the lens.' };
  const n = M.n, a = spec.D / 2, B = rfBeam(R.feed, ghz);
  const lensIdx = P.parts.map((p, k) => p.kind === 'lens' ? k : -1).filter(k => k >= 0);
  const isFirst = lensIdx[0] === spec.pi && !P.parts.slice(0, spec.pi).some(p => p.kind === 'mirror' || p.kind === 'lens');
  const isLast = lensIdx[lensIdx.length - 1] === spec.pi && !P.parts.slice(spec.pi + 1).some(p => p.kind === 'mirror' || p.kind === 'lens');
  // what the beam leaving it is for: the goal if it is the last; collimated between lenses
  const goal = isLast ? R.goal : { kind: 'collimate' };
  let d2 = null, wt = null;
  if (goal.kind !== 'collimate') { d2 = goal.d + (goal.kind === 'couple' ? rfBeam(goal.rx, ghz).dz : 0); wt = goal.kind === 'couple' ? rfBeam(goal.rx, ghz).w0 : goal.w; }
  const zRt = wt ? Math.PI * wt * wt / lam : 0;
  // where it stands: the feed's distance for the beam width wanted at the lens
  let feedD = R.feed.d;
  if (spec.place !== 'keep' && isFirst) {
    let want = null;
    if (spec.place === 'taper') want = a / Math.sqrt(Math.max(0.1, spec.taper) / 8.686);
    else if (spec.place === 'match' && d2 !== null) want = wt * Math.sqrt(1 + (d2 / zRt) ** 2);
    if (want !== null) {
      if (want <= B.w0) notes.push('The feed’s beam is never as narrow as ' + (+want.toPrecision(3)) + ' mm: the lens stays where it is.');
      else { const z = B.zR * Math.sqrt((want / B.w0) ** 2 - 1); if (z - B.dz < 1) notes.push('That would put the lens inside the feed horn: it stays where it is.'); else feedD = z - B.dz; }
    }
  } else if (spec.place !== 'keep') notes.push('Only the first lens is placed by its taper; this one stays where it is.');
  const q = rfQBefore(asm, P, ghz, i0, feedD), bin = beamOf(q, lam);
  if (!(bin.R > 0) || !isFinite(bin.R)) return { error: 'The beam reaching this lens is not diverging from a phase centre before it, so a lens can’t be made to suit it.' };
  const F1 = bin.R, F2 = d2 === null ? Infinity : (d2 * d2 + zRt * zRt) / d2;
  let s1, s2;
  if (spec.type === 'biconvex' && isFinite(F2)) { s1 = { R: (n - 1) * F1, k: -n * n }; s2 = { R: -(n - 1) * F2, k: -n * n }; }
  else if (spec.type === 'planoconvex') { const f = 1 / (1 / F1 + (isFinite(F2) ? 1 / F2 : 0)); s1 = { R: (n - 1) * f, k: 0 }; s2 = { R: null, k: 0 }; }
  else {
    if (spec.type === 'biconvex') notes.push('To collimate, the back face is flat: a hyperbolic lens.');
    const f = 1 / (1 / F1 + (isFinite(F2) ? 1 / F2 : 0)); s1 = { R: (n - 1) * f, k: -n * n }; s2 = { R: null, k: 0 };
    if (isFinite(F2)) notes.push('The Gaussian beam is focused where it should be; for its rays, one hyperbolic face is free of aberration only when it collimates. Two hyperbolic faces focus without it.');
  }
  const sag = s => surfSag({ R: s.R, k: s.k, a2: 0, A: [], odd: null }, a);
  // one curved face focusing onward: its curvature solved so the beam leaving the flat back, through the lens's own
  // thickness, has the phase radius the target asks for (the thin lens's focal length is only the start)
  if (isFinite(F2) && s2.R === null) {
    const want = -d2 / (d2 * d2 + zRt * zRt);
    const miss = c => {
      const sc = { R: 1 / c, k: s1.k }, t = Math.max(0, spec.edge) + sag(sc);
      let iq = rfCdiv([1, 0], q); let qq = rfCdiv([1, 0], [iq[0] - (n - 1) * c, iq[1]]);
      qq = [qq[0] + t / n, qq[1]];
      iq = rfCdiv([1, 0], qq);
      // the flat back: 1/q̂ unchanged in reduced form
      return isFinite(t) ? iq[0] - want : NaN;
    };
    let c0 = 1 / s1.R, c1 = c0 * 1.02, m0 = miss(c0), m1 = miss(c1);
    for (let k = 0; k < 30 && isFinite(m0) && isFinite(m1) && Math.abs(m1) > 1e-12 && m1 !== m0; k++) { const c2 = c1 - m1 * (c1 - c0) / (m1 - m0); c0 = c1; m0 = m1; c1 = c2; m1 = miss(c1); }
    if (isFinite(m1) && Math.abs(m1) < 1e-9) s1.R = 1 / c1;
  }
  const s1a = sag(s1), s2a = sag(s2);
  if (!isFinite(s1a) || !isFinite(s2a)) return { error: 'The faces don’t reach a diameter of ' + spec.D + ' mm at this focal length: make it smaller, or the lens further from the feed.' };
  const t = Math.max(0, spec.edge) + s1a - s2a;
  const taper = 8.686 * (a / bin.w) ** 2;
  // a lens narrow for its beam: what spills past it, and the diameter that would hold it (a 20 dB edge)
  if (taper < 10) notes.push('The beam at the lens is ' + (+(2 * bin.w).toPrecision(3)) + ' mm across (1/e²), so its edge is only ' + taper.toFixed(1) + ' dB down and ' + (100 * Math.exp(-2 * (a / bin.w) ** 2)).toFixed(1) + '% of the power spills past it. A lens about ' + Math.ceil(2 * bin.w * Math.sqrt(20 / 8.686)) + ' mm across would hold it (a 20 dB edge); or bring the goal nearer.');
  return { i0, s1, s2, t, n, F1, F2, feedD, w: bin.w, taper, notes };
}
