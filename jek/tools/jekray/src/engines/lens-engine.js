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

/* a glass's index, offset as a tolerance has it: dn added, its dispersion about the d line divided by (1 + dv) */
function indexOf(m, nm) {
  const n = refIndex(m, nm);
  if (!m || (!m.dn && !m.dv)) return n;
  const nd = m.dv ? refIndex(m, 587.56) : n;
  return (m.dv ? nd + (n - nd) / (1 + m.dv) : n) + (m.dn || 0);
}
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
    n[i + 1] = s.mirror ? n[i] : i < N - 1 ? indexOf(P.materials[i], nm) : opts.imageMaterial ? refIndex(opts.imageMaterial, nm) : 1;
  }
  const S = { N, z, c, k, a2, A, odd, semi, n, nm, lam: nm * 1e-6, stop: P.stopIndex >= 0 ? P.stopIndex : 0 };
  S.mir = Uint8Array.from(P.surfaces, s => s.mirror ? 1 : 0);
  if (P.surfaces.some(s => s.mirror || s.tilt || s.dtilt || s.dec)) geometry(S, P, opts);
  S.par = paraxialOf(S);
  // the aperture: the stop's own opening, or the entrance pupil asked for (the stop then floats to suit)
  S.epr = opts.epd > 0 ? opts.epd / 2 : P.stopIndex >= 0 && isFinite(semi[S.stop]) ? semi[S.stop] / S.par.stopMag : semi[0];
  S.stopR = S.epr * S.par.stopMag;
  S.imageZ = z[N - 1] + (isFinite(opts.image) ? opts.image : isFinite(S.par.bfl) ? S.par.bfl : 0);
  if (S.ax) { const a = S.ax[N - 1], g = S.imageZ - z[N - 1]; S.img = { p: [a.p[0] + a.d[0] * g, a.p[1] + a.d[1] * g, a.p[2] + a.d[2] * g], e1: a.e1, e2: a.e2, d: a.d }; }
  return S;
}

/* ---------- Surfaces off the axis, and folds ----------
   Each surface may be tilted (tilt [about x, about y], radians: about x turns it in the plane of the
   fields, its local z toward +y) and decentred (dec [x, y, along]) from the axis, and may be a mirror.
   The axis is walked from the first vertex, each gap along it; at a mirror it is reflected about the
   mirror's normal, and with it the axis's own x and y. Each surface then has its frame: its vertex o
   and its rotation R (local to global, row by row), which traceRay uses. The image plane is square
   to the axis after the last surface, the image distance along it. A surface's dtilt turns its face
   alone, the axis folding as without it: a fold mirror made tilted, the parts after it where they were. */
const ladd3 = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const ldot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lrefl3 = (v, m) => { const k = 2 * ldot3(v, m); return [v[0] - k * m[0], v[1] - k * m[1], v[2] - k * m[2]]; };
function geometry(S, P) {
  let p = [0, 0, 0], e1 = [1, 0, 0], e2 = [0, 1, 0], d = [0, 0, 1];
  S.fr = []; S.ax = [];
  for (let i = 0; i < S.N; i++) {
    if (i) p = ladd3(p, d, P.gaps[i - 1]);
    const s = P.surfaces[i], t = s.tilt || [0, 0], dt = s.dtilt || [0, 0], dc = s.dec || [0, 0, 0];
    const toG = v => [e1[0] * v[0] + e2[0] * v[1] + d[0] * v[2], e1[1] * v[0] + e2[1] * v[1] + d[1] * v[2], e1[2] * v[0] + e2[2] * v[1] + d[2] * v[2]];
    // the local axes in the axis's own: Rx(tx) Ry(ty), Rx taking z toward +y
    const axes = (ta, tb) => {
      const cx = Math.cos(ta), sx = Math.sin(ta), cy = Math.cos(tb), sy = Math.sin(tb);
      return [toG([cy, -sx * sy, -cx * sy]), toG([0, cx, -sx]), toG([sy, sx * cy, cx * cy])];
    };
    const [gx, gy, gz] = axes(t[0] + dt[0], t[1] + dt[1]);
    const o = ladd3(ladd3(ladd3(p, e1, dc[0]), e2, dc[1]), d, dc[2] || 0);
    S.fr.push({ o, R: [gx[0], gy[0], gz[0], gx[1], gy[1], gz[1], gx[2], gy[2], gz[2]] });
    // a mirror folds the axis by its tilt as designed (dtilt, an error in making it, moves the face alone)
    if (s.mirror) { const nz = dt[0] || dt[1] ? axes(t[0], t[1])[2] : gz; e1 = lrefl3(e1, nz); e2 = lrefl3(e2, nz); d = lrefl3(d, nz); }
    S.ax.push({ p, d, e1, e2 });
  }
}
/* a point and a direction in the image's frame: x and y across the image plane, z the unfolded
   distance along the axis (the image plane at S.imageZ) */
function toImageFrame(S, R) {
  const I = S.img, v = [R[0] - I.p[0], R[1] - I.p[1], R[2] - I.p[2]], q = [R[3], R[4], R[5]];
  R[0] = ldot3(v, I.e1); R[1] = ldot3(v, I.e2); R[2] = S.imageZ + ldot3(v, I.d);
  R[3] = ldot3(q, I.e1); R[4] = ldot3(q, I.e2); R[5] = ldot3(q, I.d);
  return R;
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
    // a mirror, unfolded: the light carries on, bent as by a lens of power -2 n c
    if (S.mir && S.mir[i]) u += 2 * pc * y;
    else u = (S.n[i] * u - (S.n[i + 1] - S.n[i]) * pc * y) / S.n[i + 1];
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
  return { efl, bfl, epz, xpz, stopMag: Math.abs(ya), xpr, nImg: S.n[S.N], yMarg: yL, uMarg: uL, yChief: yc, uChief: uc };
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
  // a surface moved off the axis (decentred or tilted, as in tolerancing): traced in its own frame,
  // its vertex at the origin, and taken back after
  let F = null;
  const local = () => {
    const o = F.o, Q = F.R, dx = x - o[0], dy = y - o[1], dz = z - o[2];
    x = Q[0] * dx + Q[3] * dy + Q[6] * dz; y = Q[1] * dx + Q[4] * dy + Q[7] * dz; z = Q[2] * dx + Q[5] * dy + Q[8] * dz;
    const l = Q[0] * L + Q[3] * M + Q[6] * Nn, m = Q[1] * L + Q[4] * M + Q[7] * Nn, nn = Q[2] * L + Q[5] * M + Q[8] * Nn;
    L = l; M = m; Nn = nn;
  };
  const global = () => {
    const o = F.o, Q = F.R, lx = x, ly = y, lz = z;
    x = o[0] + Q[0] * lx + Q[1] * ly + Q[2] * lz; y = o[1] + Q[3] * lx + Q[4] * ly + Q[5] * lz; z = o[2] + Q[6] * lx + Q[7] * ly + Q[8] * lz;
    const l = Q[0] * L + Q[1] * M + Q[2] * Nn, m = Q[3] * L + Q[4] * M + Q[5] * Nn, nn = Q[6] * L + Q[7] * M + Q[8] * Nn;
    L = l; M = m; Nn = nn;
  };
  const stop = flag => { if (F) global(); R[0] = x; R[1] = y; R[2] = z; R[3] = L; R[4] = M; R[5] = Nn; R[6] = opl; R[7] = flag; return R; };
  for (let i = i0; i <= i1; i++) {
    F = S.fr ? S.fr[i] : null;
    if (F) local();
    const ni = S.n[i], zi = F ? 0 : S.z[i];
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
    if (!ok) return stop(-(1 + i));
    x += L * t; y += M * t; z += Nn * t; opl += ni * t;
    const r2 = x * x + y * y;
    if (!noClip && r2 > S.semi[i] * S.semi[i] * (1 + 1e-12)) return stop(1 + i);
    // the surface's normal, along +z: (-s' x / rho, -s' y / rho, 1), and Snell's law
    const g = dsagOverR(S, i, r2), nx = -g * x, ny = -g * y, nn = Math.sqrt(nx * nx + ny * ny + 1);
    const ux = nx / nn, uy = ny / nn, uz = 1 / nn;
    const ci = L * ux + M * uy + Nn * uz;
    if (S.mir && S.mir[i]) { L -= 2 * ci * ux; M -= 2 * ci * uy; Nn -= 2 * ci * uz; }
    else {
      const mu = ni / S.n[i + 1], kk = 1 - mu * mu * (1 - ci * ci);
      if (kk < 0) return stop(-(1 + i));
      const sgn = ci >= 0 ? 1 : -1, b = sgn * Math.sqrt(kk) - mu * ci;
      L = mu * L + b * ux; M = mu * M + b * uy; Nn = mu * Nn + b * uz;
    }
    if (F) { global(); F = null; }
  }
  return stop(0);
}
/* on to the plane z = zp, in the last medium */
function toPlane(S, R, zp) {
  if (S.img) {
    // the image plane square to the folded axis
    const I = S.img, t = ((I.p[0] - R[0]) * I.d[0] + (I.p[1] - R[1]) * I.d[1] + (I.p[2] - R[2]) * I.d[2]) / (R[3] * I.d[0] + R[4] * I.d[1] + R[5] * I.d[2]);
    R[0] += R[3] * t; R[1] += R[4] * t; R[2] += R[5] * t; R[6] += S.n[S.N] * t;
    return R;
  }
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
  if (S.fr) {
    // in the stop's own frame
    const F = S.fr[S.stop], Q = F.R, dx = tmp[0] - F.o[0], dy = tmp[1] - F.o[1], dz = tmp[2] - F.o[2];
    out[0] = Q[0] * dx + Q[3] * dy + Q[6] * dz; out[1] = Q[1] * dx + Q[4] * dy + Q[7] * dz;
  } else { out[0] = tmp[0]; out[1] = tmp[1]; }
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
export function rayAt(S, th, px, py, R, noClip) {
  const ab = aimRay(S, th, px, py);
  if (!ab) return null;
  R = R || new Float64Array(8);
  launch(S, th, ab[0], ab[1], R);
  traceRay(S, R, 0, S.N - 1, noClip);
  if (R[7] === 0) { toPlane(S, R, S.imageZ); if (S.img) toImageFrame(S, R); }
  return R;
}

/* a ray's path through the system, for drawing: [y, z] where it starts (on the launch plane), at
   each surface and on the image plane, in the global frame (folds and all); lost: the surface it was
   stopped at, or -1 */
export function rayPath(S, th, px, py) {
  const ab = aimRay(S, th, px, py);
  if (!ab) return null;
  const R = launch(S, th, ab[0], ab[1], new Float64Array(8)), pts = [[R[1], R[2]]];
  for (let i = 0; i < S.N; i++) {
    traceRay(S, R, i, i);
    pts.push([R[1], R[2]]);
    if (R[7] !== 0) return { pts, lost: i };
  }
  toPlane(S, R, S.imageZ);
  pts.push([R[1], R[2]]);
  return { pts, lost: -1 };
}

/* ---------- A field ----------
   Its chief ray, and each pupil point's ray: where it lands on the image plane, and its wavefront
   error in waves (positive where its path to the reference sphere is longer than the chief ray's). */
export function traceField(S, fieldDeg, pts, noClip) {
  const th = fieldDeg * Math.PI / 180, C = rayAt(S, th, 0, 0, null, noClip);
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
    const r = rayAt(S, th, px, py, R, noClip);
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

/* ---------- Third order: the Seidel sums ----------
   From two paraxial rays: the marginal ray (height the entrance pupil's radius, parallel to the
   axis) and the chief ray (through the entrance pupil's centre at the largest field's angle, its
   paraxial slope the tangent of that angle). At each surface, A = n i and Ā = n ī are the two rays'
   refraction invariants, Δ(u/n) the change in u/n across the surface, H the Lagrange invariant:
     SI = -A² y Δ(u/n), SII = -A Ā y Δ(u/n), SIII = -Ā² y Δ(u/n), SIV = -H² c Δ(1/n),
     SV = (Ā/A)(SIII + SIV), written -Ā³ y Δ(1/n²) + c Δ(1/n) Ā ȳ (Ā y + H) so it holds where A is 0,
     CL = A y Δ(δn/n), CT = Ā y Δ(δn/n), δn the index at the shortest wavelength less that at the longest.
   An aspheric surface adds 8 (n' - n) G y⁴ to SI, G its fourth-order sag beyond the sphere of its
   paraxial curvature, and the same times ȳ/y, (ȳ/y)², (ȳ/y)³ to SII, SIII and SV. The sums are
   wavefront coefficients in mm, in the usual sign convention: an uncorrected positive singlet has
   SI > 0. A surface's odd terms have no third-order part and are left out. S at the primary
   wavelength, Sshort and Slong at the shortest and longest (or null). */
export function seidel(S, fieldDeg, Sshort, Slong) {
  const N = S.N, ub0 = Math.tan(Math.abs(fieldDeg || 0) * Math.PI / 180);
  let y = S.epr, u = 0, yb = -ub0 * S.par.epz, ub = ub0;
  const H = S.n[0] * (ub * y - u * yb), rows = [], sum = { SI: 0, SII: 0, SIII: 0, SIV: 0, SV: 0, CL: 0, CT: 0 };
  // a mirror is a refraction into -n, the light then running back along the axis: after each one the
  // indices, gaps and curvatures (as seen along the fixed axis) change sign
  let sg = 1;
  for (let i = 0; i < N; i++) {
    if (i) { const t = sg * (S.z[i] - S.z[i - 1]); y += t * u; yb += t * ub; }
    const sg1 = S.mir && S.mir[i] ? -sg : sg;
    const n = sg * S.n[i], n1 = sg1 * S.n[i + 1], c = sg * (S.c[i] + 2 * S.a2[i]);
    const A = n * (u + y * c), Ab = n * (ub + yb * c);
    const u1 = (n * u - (n1 - n) * c * y) / n1, ub1 = (n * ub - (n1 - n) * c * yb) / n1;
    const d = u1 / n1 - u / n;
    const r = { SI: -A * A * y * d, SII: -A * Ab * y * d, SIII: -Ab * Ab * y * d, SIV: -H * H * c * (1 / n1 - 1 / n),
      SV: -Ab * Ab * Ab * y * (1 / (n1 * n1) - 1 / (n * n)) + c * (1 / n1 - 1 / n) * Ab * yb * (Ab * y + H), CL: 0, CT: 0 };
    // the aspheric part: fourth-order sag beyond the paraxial sphere
    const c0 = sg * S.c[i], A4 = S.A[i] ? sg * S.A[i][0] : 0, G = ((1 + S.k[i]) * c0 * c0 * c0 - c * c * c) / 8 + A4;
    if (G) {
      const a = 8 * (n1 - n) * G * y * y * y * y, q = Math.abs(y) > 1e-14 ? yb / y : 0;
      r.SI += a; r.SII += a * q; r.SIII += a * q * q; r.SV += a * q * q * q;
    }
    if (Sshort && Slong) {
      const dn = sg * (Sshort.n[i] - Slong.n[i]), dn1 = sg1 * (Sshort.n[i + 1] - Slong.n[i + 1]), dd = dn1 / n1 - dn / n;
      r.CL = A * y * dd; r.CT = Ab * y * dd;
    }
    for (const k in sum) sum[k] += r[k];
    rows.push(r);
    u = u1; ub = ub1; sg = sg1;
  }
  return { rows, sum, H, u: u, nImg: S.n[N] };
}
