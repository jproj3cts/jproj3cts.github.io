import { C_NM_GHZ, RF_HORNS, RF_MAT, isMatchCoat, lensZones, metalR, rfBeam, rfTanD } from '../core/rf.js';
import { faceRNormal } from '../core/face-pol.js';
import { RF_MC_MAX, mirrorSecApply, normCond, normRfCond } from '../core/assembly.js';
import { refIndex } from '../core/glass.js';
import { getEl } from '../state/elements.js';
import { lensSystem, lensToImage, traceRay } from './lens-engine.js';
import { commitDesign, designPrescription, surfSag, surfaceParts } from './lens-design.js';
import { grMatrix } from '../core/gradient.js';
import { GRIN_LINE, grinLoss, grinSlab, normGrin } from '../core/grin.js';
import { besselJ01 } from '../core/special.js';
import { cdiv, randn, seededRng, solveLinear } from '../core/numeric.js';

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
/* the reduced beam parameter across a gap g of index n: straight, or through a graded glass (a graded-index disc's)
   by its r² term's matrix, on (y, n u): [[A, B/n], [n C, D]] */
function rfGap(q, g, n, GR) {
  if (!GR || !GR.G || !GR.G[0]) return [q[0] + g / n, q[1]];
  const m = grMatrix(GR.G[0], n, g), A = m[0], B = m[1] / n, C = m[2] * n, D = m[3];
  return cdiv([A * q[0] + B, A * q[1]], [C * q[0] + D, C * q[1]]);
}
const rfGR = (S, i) => S.GR ? S.GR[i] : null;
/* ---------- The feed off the axis ----------
   The horn moved across the axis (off, mm, in the bench plane) and aimed at the first vertex, so its beam's centre
   crosses the axis there and leaves the system the other way: a steered beam. Or pointed at a set angle (aim false,
   ang degrees), a horn moved without being re-aimed, as in tolerancing. The beam's centre is followed through the
   system as a paraxial ray beside the Gaussian beam's q: its height yc and reduced slope n dy/dz; each face refracts
   it about the face's own centre (a decentred face, in tolerancing, about its moved centre; a tilted one bends it as
   a prism). The spillover and the aperture efficiency are then those of the Gaussian off the aperture's centre, and
   the real rays start from the feed's phase centre where it stands, so the squint and the coma of a scanned lens
   are in the phase error and the beam's direction. */
function feedPoint(R) {
  const d = Math.max(1e-6, R.feed.d), off = R.feed.off || 0;
  const u = R.feed.aim === false ? Math.tan((R.feed.ang || 0) * Math.PI / 180) : -off / d;
  return { off, u, y0: off + u * d, d };
}
/* I0(x) e^-x, the scaled modified Bessel function (Abramowitz and Stegun 9.8.1, 9.8.2) */
function besselI0e(x) {
  const ax = Math.abs(x);
  if (ax < 3.75) { const t = (ax / 3.75) ** 2; return Math.exp(-ax) * (1 + t * (3.5156229 + t * (3.0899424 + t * (1.2067492 + t * (0.2659732 + t * (0.0360768 + t * 0.0045813)))))); }
  const t = 3.75 / ax;
  return (0.39894228 + t * (0.01328592 + t * (0.00225319 + t * (-0.00157565 + t * (0.00916281 + t * (-0.02057706 + t * (0.02635537 + t * (-0.01647633 + t * 0.00392377)))))))) / Math.sqrt(ax);
}
/* the share of a Gaussian beam (1/e² radius w, its centre yc off the aperture's centre) that passes a round aperture of radius a */
export function gaussPass(a, w, yc) {
  if (!isFinite(a)) return 1;
  if (!yc) return 1 - Math.exp(-2 * a * a / (w * w));
  const M = 96, dr = a / M; let s = 0;
  for (let i = 0; i < M; i++) { const r = (i + 0.5) * dr; s += r * Math.exp(-2 * (r - Math.abs(yc)) ** 2 / (w * w)) * besselI0e(4 * r * Math.abs(yc) / (w * w)); }
  return Math.min(1, 4 / (w * w) * s * dr);
}
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
/* the same with the field's centre yc off the aperture's: |∫E dA|² over the aperture against its whole power, the phase a
   sphere of radius R about the beam's own centre */
export function apertureEffOff(a, w, R, lam, yc) {
  if (!yc) return apertureEff(a, w, R, lam);
  const M = 48, K = 24, k2 = isFinite(R) ? Math.PI / (lam * R) : 0;
  let re = 0, im = 0;
  for (let i = 0; i < M; i++) {
    const r = (i + 0.5) * a / M, dA = r * (a / M) * (2 * Math.PI / K);
    for (let j = 0; j < K; j++) {
      const ph = 2 * Math.PI * (j + 0.5) / K, x = r * Math.cos(ph), y = r * Math.sin(ph) - yc, rho2 = x * x + y * y, amp = Math.exp(-rho2 / (w * w)), th = -k2 * rho2;
      re += amp * Math.cos(th) * dA; im += amp * Math.sin(th) * dA;
    }
  }
  return (re * re + im * im) / (Math.PI * a * a * Math.PI * w * w / 2);
}
/* a face's power reflection at nm, from index n0 into n2, square on: bare, through its matching layer, or through any
   stack, as the bench takes it (core/face-pol.js) */
export function faceR(n0, n2, nm, coat) { return faceRNormal(n0, n2, nm, coat); }
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
export function rfAberr(P, S, Rin, Rout, w, lam, zones, FP) {
  const N = S.N, semi = Math.min(...P.surfaces.map(s => s.semi > 0 && isFinite(s.semi) ? s.semi : Infinity)), a = isFinite(semi) ? semi : 3 * w;
  const zL = S.z[N - 1], src = isFinite(Rin) && Rin > 0 && Rin < 1e7 ? Rin : null, tgt = isFinite(Rout) && Rout < 0 && -Rout < 1e7 ? zL - Rout : null;
  const hs = [], ws = [], W = [], X = [], Y = [], R = new Float64Array(8);
  let wAll = 0, wLost = 0;
  // the feed where it stands: its beam's centre line y = y0 + u z, its phase centre Rin back along it
  const u0 = FP ? FP.u : 0, y0 = FP ? FP.y0 : 0, off = !!(FP && (FP.off || u0));
  const pz = src ? -src / Math.sqrt(1 + u0 * u0) : -1, py = y0 + u0 * pz;
  // rays at 32 heights; round the aperture too (8 ways) where the system is not symmetric about its axis (a part decentred
  // or tilted, as in tolerancing, or the feed off the axis) or has a zoned face, so skew rays meet the walls and the defocus as the in-plane ones do
  const M = (S.fr || (zones && zones.length) || off) ? 8 : 1;
  for (let k = 0; k < 32 * M; k++) {
    const h = a * ((k % 32) + 0.5) / 32, ph = 2 * Math.PI * (Math.floor(k / 32) + 0.5) / M, cx = Math.cos(ph), sy = Math.sin(ph);
    // toward the point at height h round the beam's centre on the first vertex's plane
    if (src) { const dx = h * cx, dy = y0 + h * sy - py, dz = -pz, L = Math.hypot(dx, dy, dz); R.set([0, py, pz, dx / L, dy / L, dz / L, 0, 0]); }
    else { const L = Math.sqrt(1 + u0 * u0); R.set([h * cx, y0 + h * sy - u0, -1, 0, u0 / L, 1 / L, 0, 0]); }
    const rec = zones && zones.length ? [] : null, wq = h * Math.exp(-2 * h * h / (w * w)) / M;
    traceRay(S, R, 0, N - 1, true, rec);
    wAll += wq;
    // a zoned lens's cut face is traced as cut (lens-engine.js sag): a ray that runs into a step's wall is lost, the step's shadow
    if (R[7] > 0 && zones && zones.some(({ i, Z }) => R[7] === 1 + i + Z.face)) { wLost += wq; continue; }
    if (R[7] || !isFinite(R[6])) continue;
    // a folded system: the ray taken into the frame of the axis after the last surface (its reference is square to that)
    if (S.img) lensToImage(S, R);
    let opl = R[6];
    // its path through the cut face is short by the whole layers k λz taken out where the ray met it: the whole waves at λ
    // they come to are no error, what is left of them is the phase slip away from the zone frequency
    if (rec) for (const { i, Z } of zones) { const at = rec[i + Z.face] && rec[i + Z.face].at; if (!at) continue; opl += lam * Math.round(Z.k(Math.hypot(at[0], at[1])) * Z.lam / lam); }
    // to the reference: a sphere about the outgoing beam's phase centre, or the plane a wave past the last vertex; the
    // ray's place there, for the fit
    let px, pyy;
    if (tgt !== null) { opl += Math.hypot(R[0], R[1], tgt - R[2]) * S.n[N]; px = R[0]; pyy = R[1]; }
    else { const t = (zL + 1 - R[2]) / R[5]; opl += t * S.n[N]; px = R[0] + R[3] * t; pyy = R[1] + R[4] * t; }
    hs.push(h); ws.push(h * Math.exp(-2 * h * h / (w * w))); W.push(opl); X.push(px); Y.push(pyy);
  }
  const shadow = wAll > 0 ? 1 - wLost / wAll : 1;
  if (hs.length < 4) return { sigma: 0, eff: 1, shadow, squint: 0 };
  // weighted least squares: W ≈ c0 + cx x + cy y + c2 h², the tilt over the rays' places on the reference (the beam's
  // direction: its squint when the feed is off the axis) and the defocus over their heights round the beam's centre at
  // the first surface; the constant, the tilt and the defocus are not aberration
  // (a system symmetric about its axis, its rays in one plane through it: no tilt to find, the constant and the defocus alone)
  const nT = M > 1 ? 4 : 2, basis = k => (M > 1 ? [1, X[k], Y[k], hs[k] * hs[k]] : [1, hs[k] * hs[k]]);
  const A = Array.from({ length: nT }, () => new Array(nT).fill(0)), b = new Array(nT).fill(0);
  hs.forEach((h, k) => {
    const q = ws[k], f = basis(k);
    for (let i = 0; i < nT; i++) { b[i] += q * f[i] * W[k]; for (let j = 0; j < nT; j++) A[i][j] += q * f[i] * f[j]; }
  });
  let c = solveLinear(A, b);
  if (!c || c.some(v => !isFinite(v))) { c = new Array(nT).fill(0); c[0] = b[0] / A[0][0]; }
  if (nT === 2) c = [c[0], 0, 0, c[1]];
  let v = 0, s0 = 0;
  hs.forEach((h, k) => { const e = W[k] - c[0] - c[1] * X[k] - c[2] * Y[k] - c[3] * h * h; v += ws[k] * e * e; s0 += ws[k]; });
  const sigma = Math.sqrt(v / s0);
  // the wavefront's slope across (OPL per mm) is n sin of the beam's direction
  const sl = Math.max(-1, Math.min(1, c[2] / S.n[N])), squint = Math.asin(sl) * 180 / Math.PI;
  return { sigma, eff: Math.exp(-((2 * Math.PI * sigma / lam) ** 2)), shadow, squint, tilt: [c[1], c[2]] };
}
/* the system at one frequency: the beam followed from the feed horn's aperture to the goal's plane, sampled
   along the unfolded axis (z from the first vertex, w the beam's radius); at each surface its radius, the
   aperture's, the edge taper (dB) and the share spilled; the beam leaving; and the figures for the goal */
export function rfTrace(asm, P, ghz, opts) {
  opts = opts || {};
  const R = normRfCond(asm.rf), nm = rfNm(ghz), lam = nm * 1e-6, S = lensSystem(P, nm), N = S.N;
  const B = rfBeam(R.feed, ghz), H = RF_HORNS[R.feed.kind] || RF_HORNS.corrugated;
  const steps = opts.steps || 40, samples = [], surf = [], FP = feedPoint(R);
  const push = (z, q, yc) => samples.push({ z, w: beamOf(q, lam).w, yc: yc || 0 });
  // from the horn's aperture to the first vertex, in air, the beam's centre on its line from the horn
  const z0 = -R.feed.d, qw = B.zR;
  for (let k = 0; k <= steps; k++) { const z = z0 + (0 - z0) * k / steps; push(z, [z - z0 + B.dz, qw], FP.off + FP.u * (z - z0)); }
  let q = [R.feed.d + B.dz, qw], yc = FP.y0, uc = FP.u;      // the centre: its height, and its reduced slope n dy/dz
  const sps = surfaceParts(P);
  for (let i = 0; i < N; i++) {
    const s = P.surfaces[i], w = beamOf(q, lam).w, a = s.semi > 0 && isFinite(s.semi) ? s.semi : Infinity;
    // a face moved off the axis (tolerancing; a section's centre, not its parent's vertex) and tilted (a mirror's beyond its fold)
    const dcy = s.sec ? s.sec.c[1] || 0 : s.dec ? s.dec[1] || 0 : 0, tl = (s.tilt ? s.tilt[0] || 0 : 0) - (s.mirror ? s.fold || 0 : 0);
    surf.push({ i, z: S.z[i], w, R: beamOf(q, lam).R, semi: a, yc, taper: isFinite(a) ? 8.686 * (a / w) ** 2 : Infinity, spill: isFinite(a) ? 1 - gaussPass(a, w, yc - dcy) : 0, kind: sps[i].kind, pi: sps[i].pi });
    const pc = s.pc !== undefined ? s.pc : S.c[i] + 2 * S.a2[i];
    const phi = S.mir[i] ? -2 * pc : (S.n[i + 1] - S.n[i]) * pc;
    // 1/q' = 1/q - phi, in reduced form; the centre refracted about the face's own centre, and bent by a tilted face as a prism
    const iq = cdiv([1, 0], q); q = cdiv([1, 0], [iq[0] - phi, iq[1]]);
    uc = uc - phi * (yc - dcy) + (S.mir[i] ? 2 * S.n[i] * tl : -(S.n[i + 1] - S.n[i]) * tl);
    if (i < N - 1) {
      const g = P.gaps[i], n = S.n[i + 1], n2 = 12, GR = rfGR(S, i);
      for (let k = 1; k <= n2; k++) { const t = g * k / n2; push(S.z[i] + t, rfGap(q, t, n, GR), yc + uc * t / n); }
      q = rfGap(q, g, n, GR); yc += uc * g / n;
    }
  }
  const zL = S.z[N - 1], out = beamOf(q, lam), ucOut = uc / S.n[N], ycL = yc;
  // past the last vertex, in the medium after it (air), to the goal's plane, or for a collimated beam a little past its waist
  const g = R.goal, zEnd = zL + (g.kind === 'collimate' ? Math.max(g.d, -q[0] + q[1], 50) : g.d + (g.kind === 'couple' ? rfBeam(g.rx, ghz).dz : 0));
  for (let k = 1; k <= steps; k++) { const t = (zEnd - zL) * k / steps; push(zL + t, [q[0] + t, q[1]], ycL + ucOut * t); }
  // the losses: each face's reflection, each lens's absorption over the beam, each aperture's spillover
  let refl = 1, absorb = 1, spill = 1;
  const faces = [], lenses = [], zones = [];
  const isGrin = i => P.parts[sps[i].pi].kind === 'grin';
  for (let i = 0; i < N; i++) {
    const s = P.surfaces[i];
    // a metal mirror: what its surface resistance takes a reflection (core/rf.js metalR)
    if (S.mir[i]) { const el = s.from && getEl(s.from.id); if (el && el.metal) { const Rm = metalR(el.metal, ghz); faces.push({ i, R: 1 - Rm, matched: false, mirror: true }); refl *= Rm; } continue; }
    if (s.stop || isGrin(i)) continue;
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
  // the zoned lenses' cut faces, for the rays (lens-engine.js sag): the face's steps, a wave of path deep, cut back into the lens
  if (zones.length) { S.zone = new Array(N); for (const { i, Z } of zones) if (Z.steps.length) S.zone[i + Z.face] = { k: Z.k, dz: Z.dz, steps: Z.steps, sg: Z.face === 0 ? 1 : -1 }; }
  const ab = opts.noAberr ? { sigma: 0, eff: 1, shadow: 1, squint: Math.atan(ucOut) * 180 / Math.PI } : rfAberr(P, S, surf[0].R, out.R, surf[0].w, lam, zones, FP);
  const res = { ghz, lam, samples, surf, faces, lenses, out, zL, zEnd, feed: B, g: H.g, refl, absorb, spill, sigma: ab.sigma, phaseEff: ab.eff, shadow: ab.shadow,
    // the beam steered: the feed's angle off the axis, its centre's direction leaving (paraxial) and the wavefront's (from the rays)
    steer: { feedDeg: Math.atan2(FP.off, FP.d) * 180 / Math.PI, chiefDeg: Math.atan(ucOut) * 180 / Math.PI, squint: ab.squint, yc: ycL, off: !!(FP.off || FP.u) } };
  if (g.kind === 'collimate') {
    const last = apert[apert.length - 1], a = last ? last.semi : out.w * 1.5;
    // the field at the last lens: the beam leaving it, its radius and curvature there, its centre off the aperture's
    const wl = beamOf(q, lam).w, Rl = out.R;
    res.apEff = apertureEffOff(a, wl, Rl, lam, ycL);
    res.D = 2 * a; res.apAt = { a, w: wl, R: Rl };
    res.eff = H.g * refl * absorb * spill * res.apEff * ab.eff * ab.shadow;
    res.gain = 10 * Math.log10(res.eff * (Math.PI * 2 * a / lam) ** 2);
    res.waist = { w: Math.sqrt(lam * out.zR / Math.PI), at: -out.z };
    res.theta = Math.atan(lam / (Math.PI * res.waist.w)) / Math.PI * 180;
  } else {
    const at = [q[0] + g.d + (g.kind === 'couple' ? rfBeam(g.rx, ghz).dz : 0), q[1]], bo = beamOf(at, lam);
    const wt = g.kind === 'couple' ? rfBeam(g.rx, ghz).w0 : g.w;
    res.coupling = gaussCoupling(bo.w, bo.R, wt, Infinity, lam);
    // the beam's centre off the goal's, and its direction: the coupling of misaligned Gaussians (small offsets and tilts)
    const dOff = ycL + ucOut * (g.d + (g.kind === 'couple' ? rfBeam(g.rx, ghz).dz : 0)), th = Math.atan(ucOut), ww = bo.w * bo.w + wt * wt;
    res.coupling *= Math.exp(-2 * dOff * dOff / ww) * Math.exp(-2 * (Math.PI * bo.w * wt * th / lam) ** 2 / ww);
    res.waist = { w: Math.sqrt(lam * out.zR / Math.PI), at: -out.z };
    res.target = { w: wt, at: zEnd - zL };
    res.gRx = g.kind === 'couple' ? (RF_HORNS[g.rx.kind] || RF_HORNS.corrugated).g : 1;
    res.eff = H.g * refl * absorb * spill * res.coupling * res.gRx * ab.eff * ab.shadow;
  }
  return res;
}
/* the design at the band's two edges and its own frequency */
export function rfBand(asm, P) {
  const R = normRfCond(asm.rf), out = { lo: rfTrace(asm, P, R.lo), mid: rfTrace(asm, P, R.ghz), hi: rfTrace(asm, P, R.hi) };
  // the feed off the axis: the same system with it on the axis, what the scan loss is against
  if (R.feed.off || R.feed.aim === false) out.ref = rfTrace(rfWithFeed(asm, R, { off: 0, aim: true, ang: 0 }), P, R.ghz);
  return out;
}
/* the assembly with its feed changed (the conditions copied, the parts shared) */
export function rfWithFeed(asm, R, feed) {
  const f = Object.assign({}, R.feed, feed);
  if (f.aim !== false) { delete f.aim; delete f.ang; }
  return Object.assign({}, asm, { rf: Object.assign({}, R, { feed: f }) });
}
const rfFigOf = t => (t.gain !== undefined ? t.gain : 10 * Math.log10(Math.max(1e-12, t.eff)));
/* the beam scanned by moving the feed across the axis, aimed at the first lens: at each offset the feed's angle, the
   beam's direction (from the wavefront leaving), the figure (the gain, or the efficiency in dB) and the scan loss
   against the feed on the axis, with the phase error and the spillover. To offMax (mm; to start, the feed 25° off or
   four beamwidths, whichever is less) in n steps. */
export function rfScan(asm, P, ghz, n, offMax) {
  const R = normRfCond(asm.rf), at = off => rfTrace(rfWithFeed(asm, R, { off, aim: true }), P, ghz, { steps: 2 });
  const t0 = at(0), f0 = rfFigOf(t0);
  if (!(offMax > 0)) { const D = t0.D || 2 * (isFinite(t0.surf[0].semi) ? t0.surf[0].semi : 50), bw = 1.2 * t0.lam / D; offMax = R.feed.d * Math.tan(Math.min(25 * Math.PI / 180, 4 * bw)); }
  n = n || 9;
  const rows = [];
  for (let k = 0; k < n; k++) {
    const off = offMax * k / (n - 1), t = k ? at(off) : t0, f = rfFigOf(t);
    rows.push({ off, feedDeg: Math.atan2(off, R.feed.d) * 180 / Math.PI, beamDeg: t.steer.squint, fig: f, loss: f - f0, sigma: t.sigma, lam: t.lam, spill: t.spill, apEff: t.apEff, phaseEff: t.phaseEff });
  }
  return rows;
}
/* the indices the trace used at nm for a material (exported for the lens table) */

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
    const pc = P.surfaces[i].pc !== undefined ? P.surfaces[i].pc : S.c[i] + 2 * S.a2[i], phi = S.mir[i] ? -2 * pc : (S.n[i + 1] - S.n[i]) * pc;
    const iq = cdiv([1, 0], q); q = cdiv([1, 0], [iq[0] - phi, iq[1]]);
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
      let iq = cdiv([1, 0], q); let qq = cdiv([1, 0], [iq[0] - (n - 1) * c, iq[1]]);
      qq = [qq[0] + t / n, qq[1]];
      iq = cdiv([1, 0], qq);
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
    return cdiv([1, 0], qq)[0] - want;
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
    // each face's coating, its layers listed from the outside in (so the back face's in reverse)
    const lay = c => (c && c.mode === 'stack' && c.layers && c.layers.length ? c.layers.map(L => [L.n, L.d]) : []);
    layers.push(...lay(c1));
    const Zc = rfZonesAt(P, i);
    layers.push([n, (Zc ? Zc.t(0) : P.gaps[i]) * 1e6]);
    layers.push(...lay(c2).reverse());
    out.push({ i, pi: sps[i].pi, R: rfSlabR(layers, nm) });
  }
  return out;
}
/* a stack of layers [index, thickness nm] in air at normal incidence: its power reflection at nm (the slab as one
   stack, as the bench's faces take theirs: core/face-pol.js) */
function rfSlabR(layers, nm) {
  return faceRNormal(1, 1, nm, { mode: 'stack', layers: layers.map(([n, d]) => ({ n, d })) });
}

/* ---------- Optimise ----------
   Quasi-Newton (BFGS, below) on the system's own figures: at five frequencies across the band, the efficiency short of
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
    // a mirror: its radius and conic; an offset section its offset too
    if (p.kind === 'mirror') { out.push({ key: 'c:' + i0, part: name, label: 'Radius' }, { key: 'k:' + i0, part: name, label: 'Conic' }); if (P.surfaces[i0].sec) out.push({ key: 'o:' + i0, part: name, label: 'Offset' }); }
    if (i0 + p.n - 1 < P.surfaces.length - 1) out.push({ key: 't:' + (i0 + p.n - 1), part: name, label: 'Air after' });
  });
  out.push({ key: 'feed', part: null, label: 'Feed to the first lens' });
  return out;
}
const rfGet = (P, asm, key) => { if (key === 'feed') return asm.rf.feed.d; const [q, i] = key.split(':'); const s = P.surfaces[+i]; return q === 'p' ? 1 / s.grin.f : q === 'o' ? s.sec.h || 0 : q === 'c' ? (s.R === null || !isFinite(s.R) || !s.R ? 0 : 1 / s.R) : q === 'k' ? (s.k || 0) : P.gaps[+i]; };
const rfSet = (P, asm, key, v) => {
  if (key === 'feed') { asm.rf.feed.d = v; return; }
  const [q, i] = key.split(':'), s = P.surfaces[+i];
  if (q === 'p') { const el = getEl(s.from.id); if (el && el.grin) rfGrinInto(P, +i, Object.assign({}, el.grin, { f: v > 1e-6 ? 1 / v : 1e6 }), el.length); return; }
  if (q === 'c') s.R = Math.abs(v) < 1e-9 ? null : 1 / v; else if (q === 'k') s.k = v; else if (q === 'o') s.sec = Object.assign({}, s.sec, { h: v }); else P.gaps[+i] = v;
  if (s.sec && q !== 't') mirrorSecApply(s); };
export const rfSetKey = rfSet;
/* a key with its configuration (key@ci): the active one's value is the prescription's, another's is kept on it */
const rfGetX = (P, asm, key) => {
  const [k, c] = key.split('@'), M = rfMcOf(asm);
  if (c === undefined || !M || +c === M.active) return rfGet(P, asm, k);
  const cfg = M.configs[+c];
  return k === 'feed' ? cfg.rf.feed.d : k in cfg.v ? cfg.v[k] : rfGet(P, asm, k);
};
const rfSetX = (P, asm, key, v) => {
  const [k, c] = key.split('@'), M = rfMcOf(asm);
  if (c === undefined || !M || +c === M.active) { rfSet(P, asm, k, v); return; }
  const cfg = M.configs[+c];
  if (k === 'feed') cfg.rf.feed.d = v; else cfg.v[k] = v;
};
const rfCloneP = P => Object.assign({}, P, { surfaces: P.surfaces.map(s => Object.assign({}, s)), gaps: P.gaps.slice(), materials: P.materials.map(m => Object.assign({}, m)) });

/* ---------- Configurations ----------
   The system in several states (a second band, a switched feed, another goal): each configuration has its own conditions
   (frequency and band, feed, goal) and its own values of the Element data keys listed; everything else is shared. The active
   one is the bench's: its conditions are asm.rf and its values the parts'. The merit adds the configurations up, each by its
   weight; a variable that differs between them is optimised in each. */
export const rfMcOf = asm => asm && asm.rfMc && asm.rfMc.configs && asm.rfMc.configs.length > 1 ? asm.rfMc : null;
/* the assembly as configuration ci has it: its conditions (the active one's is the assembly itself) */
export function rfCfgAsm(asm, ci) { const M = rfMcOf(asm); return !M || ci === M.active ? asm : Object.assign({}, asm, { rf: M.configs[ci].rf }); }
/* the prescription with configuration ci's own values (the active one's is P itself) */
export function rfCfgP(asm, P, ci) {
  const M = rfMcOf(asm); if (!M || ci === M.active) return P;
  const Q = rfCloneP(P), cfg = M.configs[ci];
  for (const k of M.keys) if (k in cfg.v) rfSet(Q, asm, k, cfg.v[k]);
  return Q;
}
/* the active configuration's conditions and values (from the bench) kept as its own */
export function rfMcStore(asm, P) {
  const M = rfMcOf(asm); if (!M) return;
  const cfg = M.configs[M.active];
  cfg.rf = JSON.parse(JSON.stringify(normRfCond(asm.rf)));
  for (const k of M.keys) cfg.v[k] = rfGet(P, asm, k);
}
/* another configuration made active: its conditions onto the assembly (the horns on the bench stay the same parts), its values into the parts */
export function rfMcSwitch(asm, ci) {
  const M = rfMcOf(asm); if (!M || ci === M.active || !M.configs[ci]) return false;
  rfMcStore(asm, designPrescription(asm));
  M.active = ci;
  const was = asm.rf, cfg = M.configs[ci], rf = JSON.parse(JSON.stringify(cfg.rf));
  if (was.feed.id) rf.feed.id = was.feed.id; else delete rf.feed.id;
  if (rf.goal.rx) { if (was.goal.rx && was.goal.rx.id) rf.goal.rx.id = was.goal.rx.id; else delete rf.goal.rx.id; }
  asm.rf = normRfCond(rf);
  const P = designPrescription(asm);
  for (const k of M.keys) if (k in cfg.v) rfSet(P, asm, k, cfg.v[k]);
  commitDesign(asm, P);
  rfSyncCond(asm, designPrescription(asm));
  return true;
}
/* a configuration added, a copy of the active one (the first time two: the design as it is, and its copy) */
export function rfMcAdd(asm, P) {
  let M = rfMcOf(asm);
  if (!M) asm.rfMc = M = { keys: [], configs: [{ name: 'Configuration 1', w: 1, rf: JSON.parse(JSON.stringify(normRfCond(asm.rf))), v: {} }], active: 0 };
  if (M.configs.length >= RF_MC_MAX) return 'A design has at most ' + RF_MC_MAX + ' configurations.';
  rfMcStore(asm, P || designPrescription(asm));
  const a = M.configs[M.active];
  M.configs.push({ name: 'Configuration ' + (M.configs.length + 1), w: a.w, rf: JSON.parse(JSON.stringify(a.rf)), v: Object.assign({}, a.v) });
  return true;
}
/* configuration ci taken out (the active one hands over to its neighbour); with one left, the design has none */
export function rfMcRemove(asm, ci) {
  const M = rfMcOf(asm); if (!M || !M.configs[ci]) return false;
  if (ci === M.active) rfMcSwitch(asm, ci ? ci - 1 : 1);
  M.configs.splice(ci, 1);
  if (M.active > ci) M.active--;
  if (asm.rfOpt && Array.isArray(asm.rfOpt.ops)) asm.rfOpt.ops = asm.rfOpt.ops.filter(o => o.c !== ci).map(o => o.c > ci ? Object.assign({}, o, { c: o.c - 1 }) : o);
  if (M.configs.length < 2) delete asm.rfMc;
  return true;
}
/* a key made to differ between the configurations (each starts from the value it has now), or made shared again (the active one's kept) */
export function rfMcKey(asm, P, key, on) {
  const M = rfMcOf(asm); if (!M || key === 'feed' || !rfOptVars(P).some(v => v.key === key)) return false;
  if (on) { if (M.keys.includes(key)) return false; M.keys.push(key); const v = rfGet(P, asm, key); for (const cfg of M.configs) cfg.v[key] = v; }
  else { M.keys = M.keys.filter(k => k !== key); for (const cfg of M.configs) delete cfg.v[key]; }
  return true;
}
/* one configuration's value of a key (the active one's is the bench's) */
export function rfMcValue(asm, P, ci, key) { const M = rfMcOf(asm); return !M || ci === M.active || !(key in M.configs[ci].v) ? rfGet(P, asm, key) : M.configs[ci].v[key]; }
/* ---------- The merit function ----------
   What Optimise works toward: terms, each a figure of the system measured at a frequency (or at each of the five across
   the band), with a target, a sense (at least, at most, or equal to) and a weight. With no terms, the efficiency at each
   of the five frequencies as high as it can be. A term's residual is its weight times its shortfall in its own scale (an
   efficiency in hundredths, a decibel, a tenth of a degree, a hundredth of a wave, a millimetre), and the merit is the sum
   of the squares of the residuals, the flatness term's and the boundaries'. */
export const RF_MERIT_OPS = {
  EFF: { label: 'Efficiency (%)', sense: '>=', scale: 100, def: 100, band: true },
  GAIN: { label: 'Gain (dBi)', sense: '>=', scale: 1, band: true, coll: true },
  COUP: { label: 'Coupling (%)', sense: '>=', scale: 100, def: 100, band: true, coll: false },
  TAPER: { label: 'Edge taper at the last lens (dB)', sense: '=', scale: 1, def: 11, band: true },
  PHASE: { label: 'Phase error (λ RMS)', sense: '<=', scale: 0.01, def: 0.02, band: true },
  SPILL: { label: 'Spillover on the way (dB)', sense: '<=', scale: 1, def: 0.1, band: true },
  REFL: { label: 'Reflections (dB)', sense: '<=', scale: 1, def: 0.1, band: true },
  SLL: { label: 'First sidelobe (dB)', sense: '<=', scale: 1, def: -20, coll: true },
  HPBW: { label: 'Half-power beamwidth (°)', sense: '=', scale: 0.1, coll: true },
  SQUINT: { label: 'Beam steered (°)', sense: '=', scale: 0.1, def: 0 },
  SCAN: { label: 'Scan loss at the feed’s offset (dB)', sense: '<=', scale: 0.1, def: 0.5 },
  WAIST: { label: 'Waist made (mm)', sense: '=', scale: 1, coll: false },
  THK: { label: 'Centre thickness, the thickest lens (mm)', sense: '<=', scale: 1, def: 30, fixed: true },
  FEED: { label: 'Feed to the first lens (mm)', sense: '=', scale: 1, fixed: true },
  TRACK: { label: 'Feed to the last face (mm)', sense: '<=', scale: 1, fixed: true },
};
export const RF_MERIT_SENSES = { '>=': 'at least', '<=': 'at most', '=': 'equal to' };
export function normRfMeritOps(list) {
  return (Array.isArray(list) ? list : []).filter(o => o && RF_MERIT_OPS[o.op]).slice(0, 40).map(o => ({
    op: o.op, ghz: o.ghz === null || o.ghz === undefined || o.ghz === '' || !isFinite(+o.ghz) ? null : Math.max(0.5, +o.ghz),
    target: isFinite(+o.target) ? +o.target : (RF_MERIT_OPS[o.op].def || 0), weight: isFinite(+o.weight) && +o.weight >= 0 ? +o.weight : 1,
    sense: RF_MERIT_SENSES[o.sense] ? o.sense : RF_MERIT_OPS[o.op].sense,
    ...(o.c !== undefined && o.c !== null && isFinite(+o.c) && +o.c >= 0 ? { c: Math.round(Math.min(RF_MC_MAX - 1, +o.c)) } : {}) }));
}
/* a term's value from a system's trace t at one frequency (its pattern worked out once, when asked for) */
function rfOpValue(op, t, asm, P, extra) {
  switch (op) {
    case 'EFF': return 100 * t.eff;
    case 'GAIN': return t.gain !== undefined ? t.gain : 10 * Math.log10(Math.max(1e-12, t.eff));
    case 'COUP': return 100 * (t.coupling !== undefined ? t.coupling : t.apEff);
    case 'TAPER': { const ap = t.surf.filter(s => isFinite(s.semi) && s.kind !== 'stop'); return ap.length ? ap[ap.length - 1].taper : 0; }
    case 'PHASE': return t.sigma / t.lam;
    case 'SPILL': return -10 * Math.log10(Math.max(1e-12, t.spill));
    case 'REFL': return -10 * Math.log10(Math.max(1e-12, t.refl));
    case 'SLL': case 'HPBW': {
      if (!t.apAt) return NaN;
      if (!extra.pat) extra.pat = rfPattern(t.apAt, t.lam, 30, 181);
      return op === 'SLL' ? (extra.pat.sidelobe === null ? -60 : extra.pat.sidelobe) : extra.pat.hpbw;
    }
    case 'SQUINT': return t.steer ? t.steer.squint : 0;
    case 'SCAN': { if (!extra.ref) { const R = normRfCond(asm.rf); extra.ref = rfTrace(rfWithFeed(asm, R, { off: 0, aim: true, ang: 0 }), P, t.ghz, { steps: 2 }); } return rfFigOf(extra.ref) - rfFigOf(t); }
    case 'WAIST': return t.waist ? t.waist.w : NaN;
    case 'THK': { const sps = surfaceParts(P); let m = 0; P.parts.forEach((p, pi) => { if (p.kind === 'lens' || p.kind === 'grin') { const i0 = sps.findIndex(s => s.pi === pi); m = Math.max(m, P.gaps[i0] || 0); } }); return m; }
    case 'FEED': return asm.rf.feed.d;
    case 'TRACK': return asm.rf.feed.d + P.gaps.reduce((a, b) => a + b, 0);
    default: return NaN;
  }
}
const rfResidual = (o, v) => { const d = RF_MERIT_OPS[o.op], s = d.scale || 1; if (!isFinite(v)) return o.weight; return o.sense === '=' ? o.weight * (v - o.target) / s : o.sense === '>=' ? o.weight * Math.max(0, o.target - v) / s : o.weight * Math.max(0, v - o.target) / s; };
/* the terms of a system c = { asm, P } against spec (its ops; none: the efficiency at each frequency as high as it can
   be): each term's value and residual, with the efficiencies across the band */
export function rfMeritTerms(c, spec) {
  const M = rfMcOf(c.asm);
  if (!M) return rfMeritOne(c, spec, null);
  // several configurations: each its own terms (a term set for one alone counts there only), its residuals weighed by its share
  const W = M.configs.reduce((a, q) => a + q.w, 0) || 1, out = { terms: [], effs: [], mean: 0, ops: [], own: false };
  M.configs.forEach((cfg, ci) => {
    const T = rfMeritOne({ asm: rfCfgAsm(c.asm, ci), P: rfCfgP(c.asm, c.P, ci) }, spec, ci), sq = Math.sqrt(cfg.w / W);
    T.terms.forEach(t => { t.r *= sq; t.c = ci; out.terms.push(t); });
    if (ci === M.active) { out.effs = T.effs; out.mean = T.mean; out.ops = T.ops; out.own = T.own; }
  });
  return out;
}
function rfMeritOne(c, spec, ci) {
  const R = normRfCond(c.asm.rf), fs = [0, 0.25, 0.5, 0.75, 1].map(u => R.lo + (R.hi - R.lo) * u);
  const ops = normRfMeritOps(spec.ops), terms = [], traces = new Map();
  const traceAt = f => { let t = traces.get(f); if (!t) { t = { t: rfTrace(c.asm, c.P, f, { steps: 2 }), x: {} }; traces.set(f, t); } return t; };
  const effs = fs.map(f => { const t = traceAt(f).t; return isFinite(t.eff) ? t.eff : 0; });
  const mean = effs.reduce((a, b) => a + b, 0) / effs.length;
  const list = ops.length ? ops : [{ op: 'EFF', ghz: null, target: 100, weight: 1, sense: '>=' }];
  list.forEach((o, j) => {
    if (ci !== null && o.c !== undefined && o.c !== ci) return;
    const d = RF_MERIT_OPS[o.op];
    const at = o.ghz !== null ? [o.ghz] : d.band ? fs : [R.ghz];
    for (const f of at) {
      const T = d.fixed ? null : traceAt(f), v = d.fixed ? rfOpValue(o.op, null, c.asm, c.P, {}) : rfOpValue(o.op, T.t, c.asm, c.P, T.x);
      terms.push({ j, op: o.op, ghz: f, value: v, target: o.target, weight: o.weight, sense: o.sense, r: rfResidual(o, v) });
      if (d.fixed) break;
    }
  });
  return { terms, effs, mean, ops: list, own: ops.length > 0 };
}
/* what the merit is made of, for the Merit tab: each term's share, the boundaries' */
export function rfMeritReport(asm, P, spec) {
  const prob = rfOptProblem(asm, P, Object.assign({ keys: [] }, spec)), f = prob.res(prob.x0);
  const tot = f.r.reduce((a, v) => a + v * v, 0) || 1, nT = f.terms.length;
  const byOp = f.ops.map((o, j) => { const at = f.terms.filter(t => t.j === j); return { op: o.op, ghz: o.ghz, target: o.target, weight: o.weight, sense: o.sense, ...(o.c !== undefined ? { c: o.c } : {}), at: at.map(t => ({ ghz: t.ghz, value: t.value, ...(t.c !== undefined ? { c: t.c } : {}) })), share: at.reduce((a, t) => a + t.r * t.r, 0) / tot }; });
  const flatShare = f.r.slice(nT, nT + f.effs.length).reduce((a, v) => a + v * v, 0) / tot, boundShare = f.r.slice(nT + f.effs.length).reduce((a, v) => a + v * v, 0) / tot;
  return { merit: Math.sqrt(tot === 1 && !f.r.length ? 0 : f.r.reduce((a, v) => a + v * v, 0)), ops: byOp, own: f.own, flatShare, boundShare, effs: f.effs, mean: f.mean };
}
export function rfOptProblem(asm, P, spec) {
  const sps = surfaceParts(P), MC = rfMcOf(asm);
  // a value the configurations each have their own of (the feed's distance always, with its conditions) is a variable in each: key@ci
  const keys = []; spec.keys.forEach(k => { if (MC && (k === 'feed' || MC.keys.includes(k))) MC.configs.forEach((_, ci) => keys.push(k + '@' + ci)); else keys.push(k); });
  const clone = () => ({ P: rfCloneP(P), asm: Object.assign({}, asm, { rf: JSON.parse(JSON.stringify(asm.rf)), ...(asm.rfMc ? { rfMc: JSON.parse(JSON.stringify(asm.rfMc)) } : {}) }) });
  const R = normRfCond(asm.rf), fs = [0, 0.25, 0.5, 0.75, 1].map(u => R.lo + (R.hi - R.lo) * u);
  const x0 = keys.map(k => rfGetX(P, asm, k));
  const at = x => { const c = clone(); keys.forEach((k, j) => rfSetX(c.P, c.asm, k, x[j])); return c; };
  const res = x => {
    const c = at(x), M = rfMeritTerms(c, spec), r = M.terms.map(t => t.r), { effs, mean } = M;
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
    if (MC) c.asm.rfMc.configs.forEach(q => r.push(10 * Math.max(0, 1 - q.rf.feed.d) / 10));
    // a graded-index disc its focal length can't be graded for
    r.push(c.P.surfaces.some(s => s.grin && s.grin.bad) ? 1 : 0);
    return { r, effs, mean, terms: M.terms, ops: M.ops, own: M.own };
  };
  return { keys, x0, at, res, fs };
}
/* The search: quasi-Newton (BFGS) on the merit, the sum of the squares above, each variable in its own scale (a
   curvature in 1/1000 mm, a conic in units, a length in mm, the feed's distance in 10 mm), its gradient by central
   differences, each step shortened until the merit falls enough (Armijo). The efficiency can't reach 1, so the
   merit's least is not zero, which a least-squares step assumes; this finds it all the same. */
const RF_SCALE = { c: 1e-3, p: 1e-3, k: 1, t: 1, o: 1, feed: 10 };
const rfScale = k => { k = k.split('@')[0]; return k === 'feed' ? RF_SCALE.feed : RF_SCALE[k[0]] || 1; };
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
   the band; the share that meet a specification, with its 95% interval (Wilson's). Across the axis:
     dec   a lens moved across the axis, ± v mm (both faces, in the bench plane)
     tilt  a lens tilted about its front vertex, ± v degrees (its back face carried round with it)
     fdec  the feed horn moved across the axis, ± v mm, pointed as it was
   each met by the beam's centre walking off and by the real rays through the moved faces. With the compensator on,
   the feed's distance is refocused for each built system, as it would be on the bench, before its figure is read. */
export const RF_TOL_KINDS = { eps: { label: 'Permittivity', unit: '%', v: 5 }, thk: { label: 'Centre thickness', unit: 'mm', v: 0.2 }, rad: { label: 'Face curvature', unit: '%', v: 1 }, gap: { label: 'Air gap', unit: 'mm', v: 0.5 }, feed: { label: 'Feed distance', unit: 'mm', v: 1 },
  dec: { label: 'Lens decentre', unit: 'mm', v: 0.5 }, tilt: { label: 'Lens tilt', unit: '°', v: 0.5 }, fdec: { label: 'Feed across the axis', unit: 'mm', v: 1 } };
export function normRfTol(o) {
  o = o && typeof o === 'object' ? o : {};
  const out = {};
  for (const [k, d] of Object.entries(RF_TOL_KINDS)) { const x = o[k] && typeof o[k] === 'object' ? o[k] : {}; out[k] = { on: x.on !== false, v: Math.max(0, isFinite(+x.v) && x.v !== null && x.v !== '' ? +x.v : d.v) }; }
  out.trials = Math.round(Math.min(5000, Math.max(20, isFinite(+o.trials) ? +o.trials : 200)));
  out.dist = o.dist === 'normal' ? 'normal' : 'uniform';
  out.spec = isFinite(+o.spec) && o.spec !== null && o.spec !== '' ? +o.spec : null;
  out.seed = Math.round(isFinite(+o.seed) && +o.seed > 0 ? +o.seed : 1);
  out.comp = o.comp === true;
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
    if (p.kind === 'lens' || p.kind === 'grin') {
      if (tol.dec.on) out.push({ kind: 'dec', i: i0, n: p.n, label: nm + ': decentre' });
      if (tol.tilt.on) out.push({ kind: 'tilt', i: i0, n: p.n, label: nm + ': tilt' });
    }
    // a graded-index disc: its plastic's permittivity (every density's with it) and its thickness
    if (p.kind === 'grin') {
      if (tol.eps.on) out.push({ kind: 'eps', i: i0, label: nm + ': permittivity' });
      if (tol.thk.on) out.push({ kind: 'thk', i: i0, label: nm + ': thickness' });
    }
    if (tol.gap.on && i0 + p.n - 1 < P.surfaces.length - 1) out.push({ kind: 'gap', i: i0 + p.n - 1, label: nm + ': air after' });
  });
  if (tol.feed.on) out.push({ kind: 'feed', i: -1, label: 'Feed horn: distance' });
  if (tol.fdec.on) out.push({ kind: 'fdec', i: -1, label: 'Feed horn: across the axis' });
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
    // the part moved across the axis: each of its faces, in the bench plane
    else if (e.kind === 'dec') for (let j = 0; j < (e.n || 1); j++) { const s = Q.surfaces[e.i + j], d = s.dec || [0, 0, 0]; s.dec = [d[0] || 0, (d[1] || 0) + x, d[2] || 0]; }
    // tilted about its front vertex: its back face turned the same and carried round with it
    else if (e.kind === 'tilt') {
      const t = x * Math.PI / 180;
      for (let j = 0; j < (e.n || 1); j++) {
        const s = Q.surfaces[e.i + j], tl = s.tilt || [0, 0], d = s.dec || [0, 0, 0];
        s.tilt = [(tl[0] || 0) + t, tl[1] || 0];
        if (j) { const g = Q.gaps[e.i]; s.dec = [d[0] || 0, (d[1] || 0) + g * Math.sin(t), (d[2] || 0) + g * (Math.cos(t) - 1)]; }
      }
    }
    // the feed moved across, pointed as it was (an aimed feed keeps the angle it had)
    else if (e.kind === 'fdec') { const F = A.rf.feed; if (F.aim !== false) { F.aim = false; F.ang = Math.atan2(-(F.off || 0), Math.max(1e-6, F.d)) * 180 / Math.PI; } F.off = (F.off || 0) + x; }
  });
  return { asm: A, P: Q };
}
/* the compensator: the feed's distance refocused for a built system, for the most of its figure at ghz, by golden section
   about the design's (within 15 % of it, 5 mm at least); the design's own if nothing nearer is better */
export function rfCompensate(asm, P, ghz) {
  const d0 = asm.rf.feed.d, span = Math.max(5, 0.15 * d0), gr = (Math.sqrt(5) - 1) / 2;
  const f = d => rfFigOf(rfTrace(Object.assign({}, asm, { rf: Object.assign({}, asm.rf, { feed: Object.assign({}, asm.rf.feed, { d }) }) }), P, ghz, { steps: 2 }));
  let lo = Math.max(0.5, d0 - span), hi = d0 + span, c = hi - gr * (hi - lo), d = lo + gr * (hi - lo), fc = f(c), fd = f(d);
  for (let k = 0; k < 14; k++) {
    if (fc > fd) { hi = d; d = c; fd = fc; c = hi - gr * (hi - lo); fc = f(c); }
    else { lo = c; c = d; fc = fd; d = lo + gr * (hi - lo); fd = f(d); }
  }
  const best = (lo + hi) / 2;
  return f(best) > f(d0) ? best : d0;
}
/* a built system with its compensator set, when the tolerances ask for it */
const rfBuilt = (c, tol, ghz) => { if (tol.comp) c.asm.rf.feed.d = rfCompensate(c.asm, c.P, ghz); return c; };
/* each error at its limit, either way, alone: the figure's change at the design frequency */
export function rfSensitivity(asm, P, T) {
  const tol = normRfTol(T), items = rfTolItems(asm, P, tol), R = normRfCond(asm.rf);
  // the nominal: the design as it is, or with its feed refocused too when the compensator is on
  const nom = rfBuilt({ asm, P }, tol, R.ghz), t0 = rfTrace(nom.asm, nom.P, R.ghz, { steps: 2 }), f0 = rfFigOf(t0), sq0 = t0.steer.squint;
  return { nominal: f0, comp: tol.comp, feedD: nom.asm.rf.feed.d, rows: items.map((e, k) => {
    const at = sgn => { const xs = items.map((_, j) => (j === k ? sgn * e.v : 0)), c = rfBuilt(rfTolApply(asm, P, items, xs), tol, R.ghz), t = rfTrace(c.asm, c.P, R.ghz, { steps: 2 }); return [rfFigOf(t) - f0, t.steer.squint - sq0]; };
    const [up, sqUp] = at(1), [dn, sqDn] = at(-1);
    return { label: e.label, kind: e.kind, v: e.v, up, dn, worst: Math.min(up, dn), moves: Math.max(Math.abs(sqUp), Math.abs(sqDn)) };
  }).sort((a, b) => a.worst - b.worst) };
}
/* Monte Carlo, a batch of builds at a time: plan (its state), run(n) to go on, the builds so far */
export function rfMcPlan(asm, P, T) {
  const tol = normRfTol(T), items = rfTolItems(asm, P, tol), R = normRfCond(asm.rf);
  const rnd = seededRng(tol.seed >>> 0 || 1);
  const draw = v => tol.dist === 'normal' ? (v / 2) * randn(rnd) : v * (2 * rnd() - 1);
  const nom = rfBuilt({ asm, P }, tol, R.ghz);
  const plan = { tol, items, builds: [], nominal: rfFigOf(rfTrace(nom.asm, nom.P, R.ghz, { steps: 2 })), done: false };
  plan.run = n => {
    for (let k = 0; k < n && plan.builds.length < tol.trials; k++) {
      const xs = items.map(e => draw(e.v)), c = rfBuilt(rfTolApply(asm, P, items, xs), tol, R.ghz);
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
