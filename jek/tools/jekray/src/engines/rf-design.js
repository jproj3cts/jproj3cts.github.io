import { C_NM_GHZ, RF_HORNS, RF_MAT, isMatchCoat, lensZones, rfBeam, rfTanD } from '../core/rf.js';
import { normCond, normRfCond } from '../core/assembly.js';
import { refIndex } from '../core/glass.js';
import { getEl } from '../state/elements.js';
import { lensSystem, traceRay } from './lens-engine.js';
import { besselJ01 } from './field.js';
import { surfSag, surfaceParts } from './lens-design.js';
import { grMatrix } from '../core/gradient.js';
import { GRIN_LINE, grinLoss, grinSlab, normGrin } from '../core/grin.js';

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
/* the reduced beam parameter across a gap g of index n: straight, or through a graded glass (a graded-index disc's)
   by its r² term's matrix, on (y, n u): [[A, B/n], [n C, D]] */
function rfGap(q, g, n, GR) {
  if (!GR || !GR.G || !GR.G[0]) return [q[0] + g / n, q[1]];
  const m = grMatrix(GR.G[0], n, g), A = m[0], B = m[1] / n, C = m[2] * n, D = m[3];
  return rfCdiv([A * q[0] + B, A * q[1]], [C * q[0] + D, C * q[1]]);
}
const rfGR = (S, i) => S.GR ? S.GR[i] : null;
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
/* the phase error the parts add beyond what the Gaussian beam's first order holds: real rays (meridional, exact)
   from the incoming beam's phase centre through every surface, their optical paths to the sphere about the
   outgoing beam's phase centre (or to a plane, for a beam leaving flat), the piston and the defocus taken out by a
   least-squares fit in h², and the rest's RMS over the beam's power (h e^{-2h²/w²}); its loss exp(-(2πσ/λ)²) */
/* a zoned lens in prescription P, its first face at i: its zones as the prescription's own faces and thickness make them
   (so a trial design's are its own, not the part's), or null */
export function rfZonesAt(P, i) {
  const sps = surfaceParts(P), sp = sps[i];
  if (!sp || sp.kind !== 'lens' || sp.n !== 2 || sp.j !== 0) return null;
  const el = getEl(sp.id);
  if (!el || !el.zoned) return null;
  return lensZones({ type: 'lens', zoned: el.zoned, surfaces: [P.surfaces[i], P.surfaces[i + 1]], gaps: [P.gaps[i]], materials: [P.materials[i]], diameter: 2 * Math.min(P.surfaces[i].semi, P.surfaces[i + 1].semi) });
}
export function rfAberr(P, S, Rin, Rout, w, lam, zones) {
  const N = S.N, semi = Math.min(...P.surfaces.map(s => s.semi > 0 && isFinite(s.semi) ? s.semi : Infinity)), a = isFinite(semi) ? semi : 3 * w;
  const zL = S.z[N - 1], src = isFinite(Rin) && Rin > 0 && Rin < 1e7 ? Rin : null, tgt = isFinite(Rout) && Rout < 0 && -Rout < 1e7 ? zL - Rout : null;
  const hs = [], ws = [], W = [], R = new Float64Array(8);
  for (let k = 0; k < 32; k++) {
    const h = a * (k + 0.5) / 32;
    if (src) { const L = Math.hypot(h, src); R.set([0, 0, -src, 0, h / L, src / L, 0, 0]); }
    else R.set([0, h, -1, 0, 0, 1, 0, 0]);
    const rec = zones && zones.length ? [] : null;
    traceRay(S, R, 0, N - 1, true, rec);
    if (R[7] || !isFinite(R[6])) continue;
    let opl = R[6];
    // a zoned lens: its whole layers k λz taken out where the ray met it, less the whole waves at λ they come to
    if (rec) for (const { i, Z } of zones) { const at = rec[i] && rec[i].at; if (!at) continue; const kl = Z.k(Math.hypot(at[0], at[1])) * Z.lam; opl -= kl - lam * Math.round(kl / lam); }
    if (tgt !== null) opl += Math.hypot(R[1], tgt - R[2]) * S.n[N]; else opl += (zL + 1 - R[2]) / R[5] * S.n[N];
    hs.push(h); ws.push(h * Math.exp(-2 * h * h / (w * w))); W.push(opl);
  }
  if (hs.length < 4) return { sigma: 0, eff: 1 };
  // weighted least squares: W ≈ c0 + c2 h²
  let s0 = 0, s1 = 0, s2 = 0, t0 = 0, t1 = 0;
  hs.forEach((h, k) => { const u = h * h, q = ws[k]; s0 += q; s1 += q * u; s2 += q * u * u; t0 += q * W[k]; t1 += q * u * W[k]; });
  const det = s0 * s2 - s1 * s1, c2 = det ? (s0 * t1 - s1 * t0) / det : 0, c0 = (t0 - c2 * s1) / s0;
  let v = 0; hs.forEach((h, k) => { const e = W[k] - c0 - c2 * h * h; v += ws[k] * e * e; });
  const sigma = Math.sqrt(v / s0);
  return { sigma, eff: Math.exp(-((2 * Math.PI * sigma / lam) ** 2)) };
}
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
      const g = P.gaps[i], n = S.n[i + 1], n2 = 12, GR = rfGR(S, i);
      for (let k = 1; k <= n2; k++) { const t = g * k / n2; push(S.z[i] + t, rfGap(q, t, n, GR)); }
      q = rfGap(q, g, n, GR);
    }
  }
  const zL = S.z[N - 1], out = beamOf(q, lam);
  // past the last vertex, in the medium after it (air), to the goal's plane, or for a collimated beam a little past its waist
  const g = R.goal, zEnd = zL + (g.kind === 'collimate' ? Math.max(g.d, -q[0] + q[1], 50) : g.d + (g.kind === 'couple' ? rfBeam(g.rx, ghz).dz : 0));
  for (let k = 1; k <= steps; k++) { const t = (zEnd - zL) * k / steps; push(zL + t, [q[0] + t, q[1]]); }
  // the losses: each face's reflection, each lens's absorption over the beam, each aperture's spillover
  let refl = 1, absorb = 1, spill = 1;
  const faces = [], lenses = [], zones = [];
  const isGrin = i => P.parts[sps[i].pi].kind === 'grin';
  for (let i = 0; i < N; i++) {
    const s = P.surfaces[i];
    if (S.mir[i] || s.stop || isGrin(i)) continue;
    const before = i ? P.materials[i - 1] : null, after = i < N - 1 ? P.materials[i] : null;
    if (!isGlass(before) && !isGlass(after)) continue;
    const el = s.from && getEl(s.from.id), coat = el && el.surfaces && el.surfaces[s.from.i] ? el.surfaces[s.from.i].coat : null;
    const Rf = faceR(S.n[i], S.n[i + 1], nm, coat);
    faces.push({ i, R: Rf, matched: isMatchCoat(coat) }); refl *= 1 - Rf;
  }
  for (let i = 0; i < N - 1; i++) {
    const m = P.materials[i];
    if (!isGlass(m)) continue;
    // a graded-index disc: its faces and its plastic by its own design (each density's index and loss), over the beam
    if (isGrin(i) && sps[i + 1].pi === sps[i].pi) {
      const el = getEl(sps[i].id), G = el && el.grin ? grinSlab(el.grin, el.length) : null;
      if (!G) continue;
      const L = grinLoss(G.D, ghz, (surf[i].w + surf[i + 1].w) / 2), rf = 1 - Math.sqrt(L.refl);
      faces.push({ i, R: rf, matched: !!G.D.match }, { i: i + 1, R: rf, matched: !!G.D.match }); refl *= L.refl;
      lenses.push({ i, alpha: 0, T: L.absorb, mat: m.glass, grin: true }); absorb *= L.absorb;
      continue;
    }
    const M = RF_MAT[m.glass], alpha = M ? 2 * Math.PI * M.n * rfTanD(M, ghz) / lam : 0;
    // the beam's profile at the lens (its radius on the two faces' mean): the share of power through each ring
    const w = (surf[i].w + surf[i + 1].w) / 2, a = Math.min(surf[i].semi, surf[i + 1].semi), Z = rfZonesAt(P, i);
    if (Z) zones.push({ i, Z });
    let num = 0, den = 0;
    for (let k = 0; k < 48; k++) {
      const r = (k + 0.5) / 48 * (isFinite(a) ? a : 3 * w), wt = r * Math.exp(-2 * r * r / (w * w));
      const t = Z ? Z.t(r) : P.gaps[i] + surfSag(P.surfaces[i + 1], r) - surfSag(P.surfaces[i], r);
      num += wt * Math.exp(-alpha * Math.max(0, t)); den += wt;
    }
    const T = den ? num / den : 1;
    lenses.push({ i, alpha, T, mat: m.glass }); absorb *= T;
  }
  const apert = surf.filter(s => isFinite(s.semi) && s.kind !== 'stop');
  // the apertures the beam passes through on the way; for a collimated beam the last is the antenna's own, counted in its efficiency
  // each part's spillover once (the beam hardly changes across a lens: its widest loss); for a collimated beam the
  // last part's is in its aperture efficiency
  const lastPi = apert.length ? apert[apert.length - 1].pi : -1, byPart = new Map();
  for (const s of apert) byPart.set(s.pi, Math.max(byPart.get(s.pi) || 0, s.spill));
  for (const [pi, sp] of byPart) if (!(g.kind === 'collimate' && pi === lastPi)) spill *= 1 - sp;
  // the phase error beyond first order, from real rays (not when asked for the beam alone)
  const ab = opts.noAberr ? { sigma: 0, eff: 1 } : rfAberr(P, S, surf[0].R, out.R, surf[0].w, lam, zones);
  const res = { ghz, lam, samples, surf, faces, lenses, out, zL, zEnd, feed: B, g: H.g, refl, absorb, spill, sigma: ab.sigma, phaseEff: ab.eff };
  if (g.kind === 'collimate') {
    const last = apert[apert.length - 1], a = last ? last.semi : out.w * 1.5;
    // the field at the last lens: the beam leaving it, its radius and curvature there
    const wl = beamOf(q, lam).w, Rl = out.R;
    res.apEff = apertureEff(a, wl, Rl, lam);
    res.D = 2 * a; res.apAt = { a, w: wl, R: Rl };
    res.eff = H.g * refl * absorb * spill * res.apEff * ab.eff;
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
    res.eff = H.g * refl * absorb * spill * res.coupling * res.gRx * ab.eff;
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
    q = rfGap(q, P.gaps[i], S.n[i + 1], rfGR(S, i));
  }
  return q;
}
/* a graded-index disc of design g and diameter dia written into prescription P at its first face i: its thickness,
   its graded plastic and its focal length (marked bad, and left as it was, where it can't be graded) */
export function rfGrinInto(P, i, g, dia) {
  const G = grinSlab(g, dia);
  if (!G) { P.surfaces[i] = Object.assign({}, P.surfaces[i], { grin: { f: g.f, bad: true } }); return false; }
  P.surfaces[i] = Object.assign({}, P.surfaces[i], { grin: { f: g.f }, semi: dia / 2 });
  P.surfaces[i + 1] = Object.assign({}, P.surfaces[i + 1], { semi: dia / 2 });
  P.gaps[i] = G.T; P.materials[i] = { glass: g.mat, dn: G.dn, grad: G.grad.slice(), gh: P.materials[i] && P.materials[i].gh || 0.05 };
  return true;
}
export const RF_LENS_TYPES = { hyperbolic: 'Hyperbolic, flat back', biconvex: 'Two hyperbolic faces', planoconvex: 'Plano-convex, spherical', grin: 'Graded-index disc (flat)' };
export function rfSynth(asm, P, spec) {
  const R = normRfCond(asm.rf), ghz = R.ghz, lam = rfNm(ghz) * 1e-6, notes = [];
  const sps = surfaceParts(P), part = P.parts[spec.pi];
  if (!part || !((part.kind === 'lens' || part.kind === 'grin') && part.n === 2)) return { error: 'Pick a lens of two faces, or a graded-index disc, to design.' };
  let i0 = 0; for (let k = 0; k < spec.pi; k++) i0 += P.parts[k].n;
  const M = RF_MAT[spec.mat];
  if (!M) return { error: 'Pick a material for the lens.' };
  const n = M.n, a = spec.D / 2, B = rfBeam(R.feed, ghz);
  const focusing = p => p.kind === 'mirror' || p.kind === 'lens' || p.kind === 'grin';
  const isFirst = !P.parts.slice(0, spec.pi).some(focusing), isLast = !P.parts.slice(spec.pi + 1).some(focusing);
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
  if (spec.type === 'grin') return rfSynthGrin(Object.assign({}, spec, { ghz, hi: R.hi }), M, q, i0, { F1, F2, d2, zRt, feedD, w: bin.w, a, notes });
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

/* A graded-index disc to suit the beam: its focal length the thin lens's between the beam's phase centre before it and
   the one wanted after it, then solved through the disc's own thickness and grading (a thick disc's focus is nearer
   than its focal length) so the beam leaves it with the phase radius the goal asks for. Its density runs from spec.fillMax
   at the centre to spec.fillMin at the edge (no lower than the frequency allows), its profile the ideal lens's. */
function rfSynthGrin(spec, M, q, i0, o) {
  if (!M.print) return { error: M.name + ' is not one of the plastics a graded-index disc is made in: PLA, ABS, PETG, ASA or polypropylene.' };
  const { F1, F2, d2, zRt, feedD, a, notes } = o;
  // its least density no lower than the top of the band allows (its structure fine against the shortest wavelength)
  const fillAsked = spec.fillMin === undefined ? 15 : spec.fillMin, fillTop = spec.hi > spec.ghz ? 100 * GRIN_LINE / (C_NM_GHZ / spec.hi * 1e-6 / (4 * M.n)) * 1.001 : 0;
  const fillMin = Math.max(fillAsked, fillTop);
  if (fillMin > fillAsked) notes.push('Its lowest density is raised to ' + fillMin.toFixed(0) + '%, so its structure stays fine against the wavelength to the top of the band, ' + (+spec.hi.toPrecision(4)) + ' GHz.');
  const grin = f => normGrin({ f, ghz: spec.ghz, mat: spec.mat, fillMax: spec.fillMax === undefined ? 100 : spec.fillMax, fillMin, profile: 'ideal', match: spec.match ? true : undefined });
  const want = isFinite(F2) ? -d2 / (d2 * d2 + zRt * zRt) : 0;
  // the beam leaving the disc of focal length f: 1/q̂'s real part, short of what is wanted
  const miss = f => {
    const G = grinSlab(grin(f), spec.D);
    if (!G) return NaN;
    const n = G.n0, qq = rfGap(q, G.T, n, { G: G.grad });
    return rfCdiv([1, 0], qq)[0] - want;
  };
  let f0 = 1 / (1 / F1 + (isFinite(F2) ? 1 / F2 : 0));
  if (!(f0 > 0) || !isFinite(f0)) return { error: 'The beam reaching it and the goal after it need no focusing a disc can give.' };
  let f1 = f0 * 0.97, m0 = miss(f0), m1 = miss(f1);
  if (!isFinite(m0)) return { error: 'A disc ' + spec.D + ' mm across of this focal length can’t be graded: widen its density range, or lower its frequency.' };
  for (let k = 0; k < 40 && isFinite(m0) && isFinite(m1) && Math.abs(m1) > 1e-13 && m1 !== m0; k++) { const f2 = f1 - m1 * (f1 - f0) / (m1 - m0); f0 = f1; m0 = m1; f1 = Math.max(1, f2); m1 = miss(f1); }
  const f = isFinite(m1) && Math.abs(m1) < 1e-9 ? f1 : 1 / (1 / F1 + (isFinite(F2) ? 1 / F2 : 0));
  const g = grin(f), G = grinSlab(g, spec.D), Dg = G.D, taper = 8.686 * (a / o.w) ** 2;
  if (!(isFinite(m1) && Math.abs(m1) < 1e-9)) notes.push('Its focal length could not be solved through its thickness: the thin disc’s is used.');
  for (const c of Dg.checks) notes.push(c);
  if (taper < 10) notes.push('The beam at the disc is ' + (+(2 * o.w).toPrecision(3)) + ' mm across (1/e²), so its edge is only ' + taper.toFixed(1) + ' dB down and ' + (100 * Math.exp(-2 * (a / o.w) ** 2)).toFixed(1) + '% of the power spills past it.');
  return { kind: 'grin', i0, grin: g, f, t: G.T, n: G.n0, F1, F2, feedD, w: o.w, taper, nHi: Dg.nHi, nLo: Dg.nLo, grams: Dg.grams, ghzMax: Dg.ghzMax, notes };
}

/* ---------- Analyses over the band ----------
   The figures at n frequencies across the band and a tenth beyond each edge; the far-field pattern of the last
   lens's aperture; each lens's reflection as a slab (its two faces, with their layers, and the plastic between,
   coherently: the ripple a plain lens shows across a band); and each aperture's beam, taper and spillover. */
export function rfBandSweep(asm, P, n) {
  const R = normRfCond(asm.rf), lo = R.lo - 0.1 * (R.hi - R.lo), hi = R.hi + 0.1 * (R.hi - R.lo), out = [];
  n = n || 41;
  for (let k = 0; k < n; k++) {
    const ghz = Math.max(0.5, lo + (hi - lo) * k / (n - 1)), t = rfTrace(asm, P, ghz, { steps: 4 });
    out.push({ ghz, eff: t.eff, coupling: t.coupling, gain: t.gain, apEff: t.apEff, refl: t.refl, absorb: t.absorb, spill: t.spill, phaseEff: t.phaseEff, sigma: t.sigma, lam: t.lam, slab: rfSlabs(P, ghz) });
  }
  return out;
}
/* the far field of a Gaussian field over a round aperture (radius a, its radius w and phase radius R there):
   E(θ) ∝ (1 + cos θ)/2 ∫ exp(-r²/w² - iπr²/(λR)) J0(k r sin θ) r dr; in dB against the axis, from 0 to th1 degrees;
   with the half-power beamwidth and the first sidelobe */
export function rfPattern(ap, lam, th1, n) {
  n = n || 361; th1 = th1 || 30;
  const k = 2 * Math.PI / lam, M = 160, dr = ap.a / M, rs = [], er = [], ei = [];
  for (let i = 0; i < M; i++) {
    const r = (i + 0.5) * dr, ph = isFinite(ap.R) ? -Math.PI * r * r / (lam * ap.R) : 0, amp = Math.exp(-r * r / (ap.w * ap.w)) * r * dr;
    rs.push(r); er.push(amp * Math.cos(ph)); ei.push(amp * Math.sin(ph));
  }
  const E = s => { let re = 0, im = 0; for (let i = 0; i < M; i++) { const J = besselJ01(k * rs[i] * s)[0]; re += er[i] * J; im += ei[i] * J; } return re * re + im * im; };
  const p0 = E(0), th = [], db = [];
  for (let j = 0; j < n; j++) {
    const t = th1 * j / (n - 1), c = Math.cos(t * Math.PI / 180), ob = (1 + c) / 2;
    th.push(t); db.push(10 * Math.log10(Math.max(1e-12, E(Math.sin(t * Math.PI / 180)) * ob * ob / p0)));
  }
  let hp = NaN, null1 = -1, side = -Infinity;
  for (let j = 1; j < n; j++) if (db[j] <= -3.0103) { hp = th[j - 1] + (th[j] - th[j - 1]) * (-3.0103 - db[j - 1]) / (db[j] - db[j - 1]); break; }
  for (let j = 1; j < n - 1; j++) if (db[j] < db[j - 1] && db[j] <= db[j + 1]) { null1 = j; break; }
  if (null1 > 0) for (let j = null1; j < n; j++) side = Math.max(side, db[j]);
  return { th, db, hpbw: 2 * hp, sidelobe: isFinite(side) ? side : null };
}
/* each lens as a slab at normal incidence: air, its first face's layer, the plastic (its centre thickness), its
   second face's layer, air; its power reflection by the characteristic matrices */
export function rfSlabs(P, ghz) {
  const nm = rfNm(ghz), sps = surfaceParts(P), out = [];
  for (let i = 0; i < P.surfaces.length - 1; i++) {
    const m = P.materials[i];
    if (!isGlass(m) || sps[i].pi !== sps[i + 1].pi) continue;
    const n = refIndex(m, nm) + (m.dn || 0), layers = [];
    // a graded-index disc at its centre: its core, and its layers if it has them
    if (P.parts[sps[i].pi].kind === 'grin') {
      const el = getEl(sps[i].id), G = el && el.grin ? grinSlab(el.grin, el.length) : null;
      if (!G) continue;
      const D = G.D, Ls = D.match ? [[D.nmAt(0), D.tm * 1e6], [D.nHi, D.t * 1e6], [D.nmAt(0), D.tm * 1e6]] : [[D.nHi, D.t * 1e6]];
      out.push({ i, pi: sps[i].pi, R: rfSlabR(Ls, nm) });
      continue;
    }
    const coatOf = s => { const el = s.from && getEl(s.from.id); return el && el.surfaces && el.surfaces[s.from.i] ? el.surfaces[s.from.i].coat : null; };
    const c1 = coatOf(P.surfaces[i]), c2 = coatOf(P.surfaces[i + 1]);
    if (isMatchCoat(c1)) layers.push([c1.layers[0].n, c1.layers[0].d]);
    const Zc = rfZonesAt(P, i);
    layers.push([n, (Zc ? Zc.t(0) : P.gaps[i]) * 1e6]);
    if (isMatchCoat(c2)) layers.push([c2.layers[0].n, c2.layers[0].d]);
    out.push({ i, pi: sps[i].pi, R: rfSlabR(layers, nm) });
  }
  return out;
}
/* a stack of layers [index, thickness nm] in air at normal incidence: its power reflection at nm */
function rfSlabR(layers, nm) {
  // M = Π [[cos δ, i sin δ / n], [i n sin δ, cos δ]], δ = 2π n d / λ; r = (M11 + M12 - M21 - M22) / (M11 + M12 + M21 + M22) for air either side
  let a = [1, 0], b = [0, 0], c = [0, 0], d = [1, 0];
  const mul = (x, y) => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]], add = (x, y) => [x[0] + y[0], x[1] + y[1]];
  for (const [nl, dl] of layers) {
    const del = 2 * Math.PI * nl * dl / nm, cs = Math.cos(del), sn = Math.sin(del);
    const A = [cs, 0], B = [0, sn / nl], C = [0, nl * sn], Dm = [cs, 0];
    [a, b, c, d] = [add(mul(a, A), mul(b, C)), add(mul(a, B), mul(b, Dm)), add(mul(c, A), mul(d, C)), add(mul(c, B), mul(d, Dm))];
  }
  const num = [a[0] + b[0] - c[0] - d[0], a[1] + b[1] - c[1] - d[1]], den = [a[0] + b[0] + c[0] + d[0], a[1] + b[1] + c[1] + d[1]];
  const r = rfCdiv(num, den);
  return r[0] * r[0] + r[1] * r[1];
}

/* ---------- Optimise ----------
   Damped least squares on the system's own figures: at five frequencies across the band, the efficiency short of
   1 (for a collimated beam that is the gain at its diameter; for the others the coupling and the losses), and, if
   asked, how far each is from their mean (flatness). Each lens keeps its centre no thicker than a limit (if set),
   its edge no thinner than one, and the air between parts open. The variables: each face's curvature (so a face
   may pass through flat) and conic, each lens's centre thickness, each air gap after a part, and the feed's
   distance. */
export function rfOptVars(P) {
  const sps = surfaceParts(P), out = [];
  P.parts.forEach((p, pi) => {
    const i0 = sps.findIndex(s => s.pi === pi), name = p.id;
    if (p.kind === 'lens' && p.n === 2) {
      out.push({ key: 'c:' + i0, part: name, label: 'Front radius' }, { key: 'k:' + i0, part: name, label: 'Front conic' },
        { key: 'c:' + (i0 + 1), part: name, label: 'Back radius' }, { key: 'k:' + (i0 + 1), part: name, label: 'Back conic' }, { key: 't:' + i0, part: name, label: 'Centre thickness' });
    }
    if (p.kind === 'grin') out.push({ key: 'p:' + i0, part: name, label: 'Focal length' });
    if (i0 + p.n - 1 < P.surfaces.length - 1) out.push({ key: 't:' + (i0 + p.n - 1), part: name, label: 'Air after' });
  });
  out.push({ key: 'feed', part: null, label: 'Feed to the first lens' });
  return out;
}
const rfGet = (P, asm, key) => { if (key === 'feed') return asm.rf.feed.d; const [q, i] = key.split(':'); const s = P.surfaces[+i]; return q === 'p' ? 1 / s.grin.f : q === 'c' ? (s.R === null || !isFinite(s.R) || !s.R ? 0 : 1 / s.R) : q === 'k' ? (s.k || 0) : P.gaps[+i]; };
const rfSet = (P, asm, key, v) => {
  if (key === 'feed') { asm.rf.feed.d = v; return; }
  const [q, i] = key.split(':'), s = P.surfaces[+i];
  if (q === 'p') { const el = getEl(s.from.id); if (el && el.grin) rfGrinInto(P, +i, Object.assign({}, el.grin, { f: v > 1e-6 ? 1 / v : 1e6 }), el.length); return; }
  if (q === 'c') s.R = Math.abs(v) < 1e-9 ? null : 1 / v; else if (q === 'k') s.k = v; else P.gaps[+i] = v; };
export function rfOptProblem(asm, P, spec) {
  const keys = spec.keys.slice(), sps = surfaceParts(P);
  const clone = () => ({ P: Object.assign({}, P, { surfaces: P.surfaces.map(s => Object.assign({}, s)), gaps: P.gaps.slice(), materials: P.materials.map(m => Object.assign({}, m)) }), asm: Object.assign({}, asm, { rf: JSON.parse(JSON.stringify(asm.rf)) }) });
  const R = normRfCond(asm.rf), fs = [0, 0.25, 0.5, 0.75, 1].map(u => R.lo + (R.hi - R.lo) * u);
  const x0 = keys.map(k => rfGet(P, asm, k));
  const at = x => { const c = clone(); keys.forEach((k, j) => rfSet(c.P, c.asm, k, x[j])); return c; };
  const res = x => {
    const c = at(x), r = [];
    const effs = fs.map(f => { const t = rfTrace(c.asm, c.P, f, { steps: 2 }); return isFinite(t.eff) ? t.eff : 0; });
    effs.forEach(e => r.push(1 - e));
    const mean = effs.reduce((a, b) => a + b, 0) / effs.length;
    effs.forEach(e => r.push((spec.flat || 0) * (e - mean)));
    // the bounds: each lens's edge and centre, the air between parts, the feed's distance
    for (let i = 0; i < c.P.surfaces.length - 1; i++) {
      const g = c.P.gaps[i], a = c.P.surfaces[i], b = c.P.surfaces[i + 1], glass = isGlass(c.P.materials[i]);
      const hh = Math.min(a.semi, b.semi), edge = g + surfSag(b, hh) - surfSag(a, hh);
      if (glass && sps[i].pi === sps[i + 1].pi) {
        r.push(10 * Math.max(0, (spec.edgeMin || 0) - (isFinite(edge) ? edge : -10)));
        r.push(spec.tMax > 0 ? 10 * Math.max(0, g - spec.tMax) / spec.tMax : 0);
      } else r.push(10 * Math.max(0, 0.5 - (isFinite(edge) ? Math.min(edge, g) : -10)));
    }
    r.push(10 * Math.max(0, 1 - c.asm.rf.feed.d) / 10);
    // a graded-index disc its focal length can't be graded for
    r.push(c.P.surfaces.some(s => s.grin && s.grin.bad) ? 1 : 0);
    return { r, effs, mean };
  };
  return { keys, x0, at, res, fs };
}
/* The search: quasi-Newton (BFGS) on the merit, the sum of the squares above, each variable in its own scale (a
   curvature in 1/1000 mm, a conic in units, a length in mm, the feed's distance in 10 mm), its gradient by central
   differences, each step shortened until the merit falls enough (Armijo). The efficiency can't reach 1, so the
   merit's least is not zero, which a least-squares step assumes; this finds it all the same. */
const RF_SCALE = { c: 1e-3, p: 1e-3, k: 1, t: 1, feed: 10 };
const rfScale = k => k === 'feed' ? RF_SCALE.feed : RF_SCALE[k[0]] || 1;
export function rfOptStart(prob) {
  const sc = prob.keys.map(rfScale), u = prob.x0.map((v, j) => v / sc[j]);
  const st = { sc, u, n: u.length, H: null, iter: 0, done: false };
  rfOptEval(prob, st);
  st.m0 = st.m;
  return st;
}
function rfOptEval(prob, st) {
  const x = st.u.map((v, j) => v * st.sc[j]), f = prob.res(x);
  st.m = f.r.reduce((a, v) => a + v * v, 0); st.mean = f.mean; st.effs = f.effs; st.x = x;
  const g = [];
  for (let j = 0; j < st.n; j++) {
    const h = 1e-4, up = st.u.slice(), dn = st.u.slice(); up[j] += h; dn[j] -= h;
    const mu = prob.res(up.map((v, k) => v * st.sc[k])).r.reduce((a, v) => a + v * v, 0), md = prob.res(dn.map((v, k) => v * st.sc[k])).r.reduce((a, v) => a + v * v, 0);
    g.push((mu - md) / (2 * h));
  }
  st.g = g;
}
export function rfOptStep(prob, st) {
  if (st.done) return st;
  const n = st.n;
  if (!st.H) st.H = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, k) => (i === k ? 1 / Math.max(1e-6, Math.abs(st.g[i]) * 10 + 1e-3) : 0)));
  const d = st.H.map(row => -row.reduce((a, v, k) => a + v * st.g[k], 0));
  const slope = d.reduce((a, v, k) => a + v * st.g[k], 0);
  if (!(slope < 0)) { st.H = null; st.stall = (st.stall || 0) + 1; if (st.stall > 2) st.done = true; return st; }
  const u0 = st.u.slice(), m0 = st.m, g0 = st.g.slice();
  let t = 1, ok = false;
  for (let k = 0; k < 30; k++) {
    st.u = u0.map((v, j) => v + t * d[j]);
    const m = prob.res(st.u.map((v, j) => v * st.sc[j])).r.reduce((a, v) => a + v * v, 0);
    if (isFinite(m) && m <= m0 + 1e-4 * t * slope) { ok = true; break; }
    t *= 0.4;
  }
  if (!ok) { st.u = u0; st.H = null; st.stall = (st.stall || 0) + 1; if (st.stall > 2) st.done = true; return st; }
  rfOptEval(prob, st);
  st.iter++; st.stall = 0;
  // the inverse Hessian, updated by the step and the change of gradient
  const s = st.u.map((v, j) => v - u0[j]), y = st.g.map((v, j) => v - g0[j]), sy = s.reduce((a, v, j) => a + v * y[j], 0);
  if (sy > 1e-16) {
    const Hy = st.H.map(row => row.reduce((a, v, k) => a + v * y[k], 0)), yHy = y.reduce((a, v, j) => a + v * Hy[j], 0);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) st.H[i][k] += ((sy + yHy) * s[i] * s[k]) / (sy * sy) - (Hy[i] * s[k] + s[i] * Hy[k]) / sy;
  }
  if (m0 - st.m < 1e-10 * Math.max(1, m0)) st.done = true;
  return st;
}

/* ---------- Tolerancing ----------
   A printed lens is not made exactly: its plastic's permittivity is known to a few per cent until measured (and the
   printer's flow moves it the same way), its thickness and its faces' curvature to the printer's accuracy, and it is
   mounted only so near where it was designed. Each error, for each lens (each face, for a radius) or each air gap:
     eps   the lens's permittivity, ± v %  (its index by √(1 + v/100))
     thk   its centre thickness, ± v mm
     rad   each face's curvature, ± v %
     gap   the air after it, ± v mm
     feed  the feed horn's distance, ± v mm
   The figure: to collimate, the gain (dBi); otherwise the efficiency (dB). Sensitivity: each error at its limit, either
   way, alone, at the design frequency. Monte Carlo: builds with every error drawn at once, uniform within its limits
   or normal with its limit at two standard deviations, each build's figure at the design frequency and its worst over
   the band; the share that meet a specification, with its 95% interval (Wilson's). Off-axis errors (a lens decentred
   or tilted, the feed moved across) are not in it: the Gaussian beam here is on its axis. */
export const RF_TOL_KINDS = { eps: { label: 'Permittivity', unit: '%', v: 5 }, thk: { label: 'Centre thickness', unit: 'mm', v: 0.2 }, rad: { label: 'Face curvature', unit: '%', v: 1 }, gap: { label: 'Air gap', unit: 'mm', v: 0.5 }, feed: { label: 'Feed distance', unit: 'mm', v: 1 } };
export function normRfTol(o) {
  o = o && typeof o === 'object' ? o : {};
  const out = {};
  for (const [k, d] of Object.entries(RF_TOL_KINDS)) { const x = o[k] && typeof o[k] === 'object' ? o[k] : {}; out[k] = { on: x.on !== false, v: Math.max(0, isFinite(+x.v) && x.v !== null && x.v !== '' ? +x.v : d.v) }; }
  out.trials = Math.round(Math.min(5000, Math.max(20, isFinite(+o.trials) ? +o.trials : 200)));
  out.dist = o.dist === 'normal' ? 'normal' : 'uniform';
  out.spec = isFinite(+o.spec) && o.spec !== null && o.spec !== '' ? +o.spec : null;
  out.seed = Math.round(isFinite(+o.seed) && +o.seed > 0 ? +o.seed : 1);
  return out;
}
/* the errors a system can have: each { kind, i (the surface or gap it is on), label } */
export function rfTolItems(asm, P, T) {
  const sps = surfaceParts(P), out = [], tol = normRfTol(T);
  P.parts.forEach((p, pi) => {
    const i0 = sps.findIndex(s => s.pi === pi), el = getEl(p.id), nm = el ? el.name : 'Part ' + (pi + 1);
    if (p.kind === 'lens') {
      if (tol.eps.on) out.push({ kind: 'eps', i: i0, label: nm + ': permittivity' });
      if (tol.thk.on && p.n === 2) out.push({ kind: 'thk', i: i0, label: nm + ': centre thickness' });
      if (tol.rad.on) for (let j = 0; j < p.n; j++) if (P.surfaces[i0 + j].R !== null && isFinite(P.surfaces[i0 + j].R)) out.push({ kind: 'rad', i: i0 + j, label: nm + ': ' + (j ? 'back' : 'front') + ' face' });
    }
    // a graded-index disc: its plastic's permittivity (every density's with it) and its thickness
    if (p.kind === 'grin') {
      if (tol.eps.on) out.push({ kind: 'eps', i: i0, label: nm + ': permittivity' });
      if (tol.thk.on) out.push({ kind: 'thk', i: i0, label: nm + ': thickness' });
    }
    if (tol.gap.on && i0 + p.n - 1 < P.surfaces.length - 1) out.push({ kind: 'gap', i: i0 + p.n - 1, label: nm + ': air after' });
  });
  if (tol.feed.on) out.push({ kind: 'feed', i: -1, label: 'Feed horn: distance' });
  return out.map(e => Object.assign(e, { v: tol[e.kind].v }));
}
/* the system with errors e (each item with its value x, in its own unit) */
export function rfTolApply(asm, P, items, xs) {
  const Q = Object.assign({}, P, { surfaces: P.surfaces.map(s => Object.assign({}, s)), gaps: P.gaps.slice(), materials: P.materials.map(m => Object.assign({}, m)) });
  const A = Object.assign({}, asm, { rf: JSON.parse(JSON.stringify(asm.rf)) });
  items.forEach((e, k) => {
    const x = xs[k];
    if (!x) return;
    if (e.kind === 'eps' && Q.materials[e.i].grad) {
      // a graded disc: the plastic's permittivity scaled, every density's eps − 1 with it (the mean by volume), so its
      // grading (its power) scales as well as its centre's index
      const m = Q.materials[e.i], M = RF_MAT[m.glass], em = M ? M.n * M.n : 2.5, k = (em * Math.max(0.01, 1 + x / 100) - 1) / (em - 1);
      const n0 = refIndex(m, rfNm(A.rf.ghz)) + (m.dn || 0), n1 = Math.sqrt(1 + k * (n0 * n0 - 1));
      m.dn = (m.dn || 0) + n1 - n0; m.grad = m.grad.map(v => v * k * n0 / n1);
    } else if (e.kind === 'eps') { const m = Q.materials[e.i], n = refIndex(m, rfNm(A.rf.ghz)); m.dn = (m.dn || 0) + n * (Math.sqrt(Math.max(0.01, 1 + x / 100)) - 1); }
    else if (e.kind === 'thk' || e.kind === 'gap') Q.gaps[e.i] = Math.max(0, Q.gaps[e.i] + x);
    else if (e.kind === 'rad') { const s = Q.surfaces[e.i]; if (s.R) s.R = s.R / (1 + x / 100); }
    else if (e.kind === 'feed') A.rf.feed.d = Math.max(0, A.rf.feed.d + x);
  });
  return { asm: A, P: Q };
}
const rfFigOf = t => t.gain !== undefined ? t.gain : 10 * Math.log10(Math.max(1e-12, t.eff));
/* each error at its limit, either way, alone: the figure's change at the design frequency */
export function rfSensitivity(asm, P, T) {
  const items = rfTolItems(asm, P, T), R = normRfCond(asm.rf), f0 = rfFigOf(rfTrace(asm, P, R.ghz, { steps: 2 }));
  return { nominal: f0, rows: items.map((e, k) => {
    const at = sgn => { const xs = items.map((_, j) => (j === k ? sgn * e.v : 0)), c = rfTolApply(asm, P, items, xs); return rfFigOf(rfTrace(c.asm, c.P, R.ghz, { steps: 2 })) - f0; };
    const up = at(1), dn = at(-1);
    return { label: e.label, kind: e.kind, v: e.v, up, dn, worst: Math.min(up, dn) };
  }).sort((a, b) => a.worst - b.worst) };
}
/* Monte Carlo, a batch of builds at a time: plan (its state), run(n) to go on, the builds so far */
export function rfMcPlan(asm, P, T) {
  const tol = normRfTol(T), items = rfTolItems(asm, P, tol), R = normRfCond(asm.rf);
  let s = tol.seed >>> 0 || 1;
  const rnd = () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; s ^= s >>> 13; return ((s >>> 0) + 0.5) / 4294967296; };
  const draw = v => tol.dist === 'normal' ? (v / 2) * Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd()) : v * (2 * rnd() - 1);
  const plan = { tol, items, builds: [], nominal: rfFigOf(rfTrace(asm, P, R.ghz, { steps: 2 })), done: false };
  plan.run = n => {
    for (let k = 0; k < n && plan.builds.length < tol.trials; k++) {
      const xs = items.map(e => draw(e.v)), c = rfTolApply(asm, P, items, xs);
      const figs = [R.lo, R.ghz, R.hi].map(g => rfFigOf(rfTrace(c.asm, c.P, g, { steps: 2 })));
      plan.builds.push({ at: figs[1], worst: Math.min(...figs) });
    }
    plan.done = plan.builds.length >= tol.trials;
    return plan;
  };
  return plan;
}
/* the share of builds meeting a specification (the figure at least spec, over the whole band), with its 95% interval */
export function rfYield(builds, spec) {
  const n = builds.length, k = builds.filter(b => b.worst >= spec).length, z = 1.959964;
  if (!n) return { k, n, p: NaN, lo: NaN, hi: NaN };
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, w = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return { k, n, p, lo: Math.max(0, c - w), hi: Math.min(1, c + w) };
}
