import { refIndex } from '../core/glass.js';

/* ==========================================================================
   The lens engine: a prescription traced as a lens designer traces it
   An assembly's prescription (core/assembly.js) at one wavelength, as flat arrays: each surface's
   vertex along the axis, its shape and clear radius, the index after it. Rays are traced through it
   in order, exactly, in three dimensions: z along the axis, y across it in the bench plane (the
   meridional section, where the fields lie), x out of it (sagittal). The object is at infinity; a
   field is the angle of the incoming light in the y-z plane.

   Each surface is z = z_i + sag(rho), rho the distance from the axis, with the bench's own sag
   (core/geometry.js rawSag): a conic of curvature c and constant k, plus a2 rho^2, the even terms
   A_4 rho^4, A_6 rho^6, ... and the odd terms o_1 rho, o_2 rho^2, .... A ray meets it where Newton's
   method finds the root along the ray, and is refracted by Snell's law in vector form. A ray that
   lands outside a surface's clear radius is vignetted there; one that cannot refract is turned back
   (total internal reflection) and is lost.

   Rays are aimed: each is found that crosses the stop at the pupil point asked for (px, py, each -1
   to 1 of the stop's radius for the aperture set), by Newton's method on where it starts. Its optical
   path is counted from a plane square to the incoming light through the entrance pupil's centre, so
   every ray of a field starts on one wavefront. The wavefront error is measured on the reference
   sphere centred where the chief ray meets the image plane, through where it crosses the exit pupil.
   ========================================================================== */

/* the system at wavelength nm: P a prescription ({surfaces, gaps, materials, stopIndex}), opts:
   epd (the entrance pupil's diameter, mm; else the stop's own opening sets it), image (the image
   plane's distance after the last surface; else the paraxial focus), imageMaterial (the medium after
   the last surface, air unless given) */
export function lensSystem(P, nm, opts) {
  opts = opts || {};
  const N = P.surfaces.length, z = new Float64Array(N), c = new Float64Array(N), k = new Float64Array(N), a2 = new Float64Array(N);
  const semi = new Float64Array(N), n = new Float64Array(N + 1), A = [], odd = [];
  n[0] = 1;
  for (let i = 0; i < N; i++) {
    const s = P.surfaces[i];
    z[i] = i ? z[i - 1] + P.gaps[i - 1] : 0;
    c[i] = s.R === null || s.R === undefined || !isFinite(s.R) || !s.R ? 0 : 1 / s.R;
    k[i] = s.k || 0; a2[i] = s.a2 || 0; semi[i] = s.semi > 0 ? s.semi : Infinity;
    A.push(s.A && s.A.length ? Float64Array.from(s.A) : null);
    odd.push(s.odd && s.odd.length ? Float64Array.from(s.odd) : null);
    n[i + 1] = i < N - 1 ? refIndex(P.materials[i], nm) : opts.imageMaterial ? refIndex(opts.imageMaterial, nm) : 1;
  }
  const S = { N, z, c, k, a2, A, odd, semi, n, nm, lam: nm * 1e-6, stop: P.stopIndex >= 0 ? P.stopIndex : 0 };
  S.par = paraxialOf(S);
  // the aperture: the stop's own opening, or the entrance pupil asked for (the stop then floats to suit)
  S.epr = opts.epd > 0 ? opts.epd / 2 : P.stopIndex >= 0 && isFinite(semi[S.stop]) ? semi[S.stop] / S.par.stopMag : semi[0];
  S.stopR = S.epr * S.par.stopMag;
  S.imageZ = z[N - 1] + (isFinite(opts.image) ? opts.image : isFinite(S.par.bfl) ? S.par.bfl : 0);
  return S;
}

/* ---------- First order ----------
   y-nu traces: a ray parallel to the axis at height 1 (its focal length and back focus), and the
   chief ray, aimed at the stop's centre, which places the pupils. stopMag: the stop's radius for an
   entrance pupil of radius 1. */
function paraStep(S, y, u, i0, i1) {
  // from just before surface i0 to just after surface i1: [height at i1, angle after i1]
  for (let i = i0; i <= i1; i++) {
    if (i > i0) y += (S.z[i] - S.z[i - 1]) * u;
    const pc = S.c[i] + 2 * S.a2[i];                                    // the paraxial curvature
    u = (S.n[i] * u - (S.n[i + 1] - S.n[i]) * pc * y) / S.n[i + 1];
  }
  return [y, u];
}
export function paraxialOf(S) {
  const L = S.N - 1, st = S.stop;
  // the marginal ray of an object at infinity, height 1 at the first surface
  const [yL, uL] = paraStep(S, 1, 0, 0, L);
  const efl = Math.abs(uL) < 1e-14 ? Infinity : -1 / uL, bfl = Math.abs(uL) < 1e-14 ? Infinity : -yL / uL;
  // heights at the stop of the two rays (1, 0) and (0, 1) at the first surface
  const hs = (y, u) => (st === 0 ? y : paraStep(S, y, u, 0, st - 1)[0] + (S.z[st] - S.z[st - 1]) * paraStep(S, y, u, 0, st - 1)[1]);
  const ya = hs(1, 0), yb = hs(0, 1);
  // the chief ray: angle 1, height -yb/ya at the first surface, so none at the stop; the entrance pupil where it points from
  const hc = Math.abs(ya) < 1e-14 ? 0 : -yb / ya, epz = -hc;          // the entrance pupil's place, from the first vertex
  const [yc, uc] = paraStep(S, hc, 1, 0, L);
  const xpz = Math.abs(uc) < 1e-14 ? Infinity : S.z[L] - yc / uc;      // the exit pupil's place
  // the exit pupil's radius: the marginal ray's height there, for an entrance pupil of radius 1
  const xpr = Math.abs(yL + (xpz - S.z[L]) * uL);
  return { efl, bfl, epz, xpz, stopMag: Math.abs(ya), xpr, nImg: S.n[S.N] };
}

/* ---------- One surface ---------- */
function sag(S, i, r2) {
  const c = S.c[i];
  let v = 0;
  if (c !== 0) v = c * r2 / (1 + Math.sqrt(Math.max(0, 1 - (1 + S.k[i]) * c * c * r2)));
  v += S.a2[i] * r2;
  const A = S.A[i];
  if (A) { let p = r2 * r2; for (let j = 0; j < A.length; j++) { v += A[j] * p; p *= r2; } }
  const o = S.odd[i];
  if (o) { const r = Math.sqrt(r2); let q = r; for (let j = 0; j < o.length; j++) { v += o[j] * q; q *= r; } }
  return v;
}
/* d sag / d rho, divided by rho (finite on the axis) */
function dsagOverR(S, i, r2) {
  const c = S.c[i];
  let v = 0;
  if (c !== 0) v = c / Math.sqrt(Math.max(1e-15, 1 - (1 + S.k[i]) * c * c * r2));
  v += 2 * S.a2[i];
  const A = S.A[i];
  if (A) { let p = r2; for (let j = 0; j < A.length; j++) { v += (4 + 2 * j) * A[j] * p; p *= r2; } }
  const o = S.odd[i];
  if (o) { const r = Math.sqrt(r2); if (r > 1e-12) { let q = 1 / r; for (let j = 0; j < o.length; j++) { v += (j + 1) * o[j] * q; q *= r; } } }
  return v;
}

/* ---------- A ray ----------
   R: a Float64Array(8) [x, y, z, L, M, N, opl, flag], position, direction cosines, optical path and
   0 while alive. Traces from where it is through surfaces i0 to i1 (inclusive), in place. Flag on
   failing: 1 + the surface it was vignetted at, or -(1 + the surface) where it missed or turned back. */
export function traceRay(S, R, i0, i1, noClip) {
  let x = R[0], y = R[1], z = R[2], L = R[3], M = R[4], Nn = R[5], opl = R[6];
  for (let i = i0; i <= i1; i++) {
    const ni = S.n[i], zi = S.z[i];
    // to the vertex plane, then Newton along the ray onto the surface
    let t = (zi - z) / Nn, ok = false;
    for (let it = 0; it < 40; it++) {
      const X = x + L * t, Y = y + M * t, Z = z + Nn * t, r2 = X * X + Y * Y;
      const f = Z - zi - sag(S, i, r2), d = Nn - dsagOverR(S, i, r2) * (X * L + Y * M);
      if (!isFinite(f) || Math.abs(d) < 1e-15) break;
      const dt = f / d;
      t -= dt;
      if (Math.abs(dt) < 1e-13 * (1 + Math.abs(t))) { ok = true; break; }
    }
    if (!ok) { R[7] = -(1 + i); return R; }
    x += L * t; y += M * t; z += Nn * t; opl += ni * t;
    const r2 = x * x + y * y;
    if (!noClip && r2 > S.semi[i] * S.semi[i] * (1 + 1e-12)) { R[0] = x; R[1] = y; R[2] = z; R[6] = opl; R[7] = 1 + i; return R; }
    // the surface's normal, along +z: (-s' x / rho, -s' y / rho, 1), and Snell's law
    const g = dsagOverR(S, i, r2), nx = -g * x, ny = -g * y, nn = Math.sqrt(nx * nx + ny * ny + 1);
    const ux = nx / nn, uy = ny / nn, uz = 1 / nn;
    const mu = ni / S.n[i + 1], ci = L * ux + M * uy + Nn * uz, kk = 1 - mu * mu * (1 - ci * ci);
    if (kk < 0) { R[0] = x; R[1] = y; R[2] = z; R[6] = opl; R[7] = -(1 + i); return R; }
    const sgn = ci >= 0 ? 1 : -1, b = sgn * Math.sqrt(kk) - mu * ci;
    L = mu * L + b * ux; M = mu * M + b * uy; Nn = mu * Nn + b * uz;
  }
  R[0] = x; R[1] = y; R[2] = z; R[3] = L; R[4] = M; R[5] = Nn; R[6] = opl; R[7] = 0;
  return R;
}
/* on to the plane z = zp, in the last medium */
function toPlane(S, R, zp) {
  const t = (zp - R[2]) / R[5];
  R[0] += R[3] * t; R[1] += R[4] * t; R[2] = zp; R[6] += S.n[S.N] * t;
  return R;
}

/* ---------- Aiming ----------
   A field's ray starts on the plane square to the incoming light through the entrance pupil's centre,
   at (a, b) in it (a across the bench plane, out of it; b in it), and is moved back along the light so
   it starts before the first surface. Its path is counted from that plane. */
function launch(S, th, a, b, R) {
  const sn = Math.sin(th), cs = Math.cos(th), back = 1e3 + Math.abs(S.par.epz) + Math.abs(S.z[S.N - 1]);
  // the plane's axes: e1 = x; e2 = (0, cos th, -sin th), square to the light (0, sin th, cos th)
  const px = a, py = b * cs, pz = S.par.epz - b * sn;
  R[0] = px; R[1] = py - sn * back; R[2] = pz - cs * back; R[3] = 0; R[4] = sn; R[5] = cs; R[6] = -back; R[7] = 0;
  return R;
}
const tmp = new Float64Array(8);
function atStop(S, th, a, b, out) {
  launch(S, th, a, b, tmp);
  traceRay(S, tmp, 0, S.stop, true);
  out[0] = tmp[0]; out[1] = tmp[1];
  return tmp[7] === 0;
}
/* where the ray of field th (radians) through pupil point (px, py) starts: [a, b], or null if none can be found */
export function aimRay(S, th, px, py) {
  const want = [px * S.stopR, py * S.stopR], cur = [0, 0], d1 = [0, 0], d2 = [0, 0];
  let a = px * S.epr, b = py * S.epr;
  const h = 1e-6 * Math.max(1, S.epr);
  for (let it = 0; it < 30; it++) {
    if (!atStop(S, th, a, b, cur)) return null;
    const ex = cur[0] - want[0], ey = cur[1] - want[1];
    if (Math.hypot(ex, ey) < 1e-11 * Math.max(1, S.stopR)) return [a, b];
    if (!atStop(S, th, a + h, b, d1) || !atStop(S, th, a, b + h, d2)) return null;
    const j11 = (d1[0] - cur[0]) / h, j21 = (d1[1] - cur[1]) / h, j12 = (d2[0] - cur[0]) / h, j22 = (d2[1] - cur[1]) / h;
    const det = j11 * j22 - j12 * j21;
    if (Math.abs(det) < 1e-18) return null;
    a -= (j22 * ex - j12 * ey) / det; b -= (-j21 * ex + j11 * ey) / det;
  }
  return null;
}
/* the ray of field th through pupil point (px, py), traced to the image plane; null where it can't be aimed */
export function rayAt(S, th, px, py, R) {
  const ab = aimRay(S, th, px, py);
  if (!ab) return null;
  R = R || new Float64Array(8);
  launch(S, th, ab[0], ab[1], R);
  traceRay(S, R, 0, S.N - 1);
  if (R[7] === 0) toPlane(S, R, S.imageZ);
  return R;
}

/* ---------- A field ----------
   Its chief ray, and each pupil point's ray: where it lands on the image plane, and its wavefront
   error in waves (positive where its path to the reference sphere is longer than the chief ray's). */
export function traceField(S, fieldDeg, pts) {
  const th = fieldDeg * Math.PI / 180, C = rayAt(S, th, 0, 0);
  if (!C || C[7] !== 0) return null;
  // the reference sphere: about the chief ray's image point, through where it crosses the exit pupil's plane
  const cx = C[0], cy = C[1], cz = C[2], xpz = S.par.xpz;
  const fin = isFinite(xpz) && Math.abs(cz - xpz) > 1e-9;
  let Rref = Infinity, refOpl;
  if (fin) {
    const t = (xpz - cz) / C[5];
    Rref = Math.hypot(C[3] * t, C[4] * t, C[5] * t) * Math.sign(cz - xpz);
  }
  const nI = S.n[S.N];
  // a ray's path to the sphere: back along it from the image plane, to where it meets the sphere
  const toSphere = R => {
    if (!fin) return R[6] - nI * ((R[0] - cx) * R[3] + (R[1] - cy) * R[4]);    // a plane square to the chief ray
    const dx = R[0] - cx, dy = R[1] - cy, dz = R[2] - cz;
    // |P - t d - C| = |Rref|, the root nearer the exit pupil (t > 0 back along the ray when Rref > 0)
    const bq = dx * R[3] + dy * R[4] + dz * R[5], cq = dx * dx + dy * dy + dz * dz - Rref * Rref;
    const disc = bq * bq - cq;
    if (disc < 0) return NaN;
    const t = Rref > 0 ? bq + Math.sqrt(disc) : bq - Math.sqrt(disc);
    return R[6] - nI * t;
  };
  refOpl = toSphere(C);
  const out = { field: fieldDeg, chief: [cx, cy], rays: [] }, R = new Float64Array(8);
  for (const [px, py] of pts) {
    const r = rayAt(S, th, px, py, R);
    if (!r) { out.rays.push({ px, py, lost: 'aim' }); continue; }
    if (r[7] !== 0) { out.rays.push({ px, py, lost: r[7] > 0 ? 'clipped' : 'missed', at: Math.abs(r[7]) - 1 }); continue; }
    out.rays.push({ px, py, x: r[0], y: r[1], opd: (toSphere(r) - refOpl) / S.lam });
  }
  return out;
}

/* pupil samples: rings of Gaussian quadrature radii, each with arms, or a square grid inside the pupil */
export function pupilRings(rings, arms) {
  // Gauss-Legendre in rho^2 on [0, 1]: radii sqrt of the nodes, each ring of equal weight per arm
  const GL = { 1: [[0.5, 1]], 2: [[0.2113248654, 0.5], [0.7886751346, 0.5]], 3: [[0.1127016654, 0.2777777778], [0.5, 0.4444444444], [0.8872983346, 0.2777777778]],
    4: [[0.0694318442, 0.1739274226], [0.3300094782, 0.3260725774], [0.6699905218, 0.3260725774], [0.9305681558, 0.1739274226]] };
  const nodes = GL[Math.min(4, Math.max(1, rings))], pts = [];
  for (const [u, w] of nodes) for (let j = 0; j < arms; j++) { const t = (j + 0.5) * 2 * Math.PI / arms, r = Math.sqrt(u); pts.push([r * Math.sin(t), r * Math.cos(t), w / arms]); }
  return pts;
}
export function pupilGrid(n) {
  const pts = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const px = -1 + (2 * i + 1) / n, py = -1 + (2 * j + 1) / n;
    if (px * px + py * py <= 1) pts.push([px, py, 1]);
  }
  return pts;
}
/* a field's spot and wavefront: the rays' RMS radius about their centroid and about the chief ray, and the RMS wavefront error */
export function spotOf(S, fieldDeg, pts) {
  const F = traceField(S, fieldDeg, pts);
  if (!F) return null;
  let W = 0, sx = 0, sy = 0, sw = 0, so = 0, so2 = 0, lost = 0;
  F.rays.forEach((r, i) => {
    const w = pts[i][2] || 1;
    if (r.lost) { lost++; return; }
    W += w; sx += w * r.x; sy += w * r.y; so += w * r.opd; so2 += w * r.opd * r.opd;
  });
  if (!W) return { field: fieldDeg, lost, rms: null };
  const mx = sx / W, my = sy / W;
  let s2 = 0, c2 = 0;
  F.rays.forEach((r, i) => { if (r.lost) return; const w = pts[i][2] || 1; s2 += w * ((r.x - mx) ** 2 + (r.y - my) ** 2); c2 += w * ((r.x - F.chief[0]) ** 2 + (r.y - F.chief[1]) ** 2); });
  const om = so / W;
  return { field: fieldDeg, chief: F.chief, centroid: [mx, my], rms: Math.sqrt(s2 / W), rmsChief: Math.sqrt(c2 / W), wfeRms: Math.sqrt(Math.max(0, so2 / W - om * om)), lost, F };
}
