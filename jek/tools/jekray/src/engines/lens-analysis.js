import { aimRay, lensLaunch, lensSystem, pupilGrid, rayAt, traceField, traceRay } from './lens-engine.js';
import { designEpd, objOpts, primaryNm } from './lens-design.js';

/* ==========================================================================
   Analyses of a lens design
   Each from the lens engine's rays, aimed through the stop and stopped by the clear radii as they
   are (vignetting counts here, unlike in optimising):
     the spot diagram: where a grid of rays across the pupil lands, each wavelength, about the
       primary wavelength's chief ray, with the RMS and largest radius about the centroid and the
       Airy disc's radius;
     ray fans: the transverse miss on the image plane, from the primary chief ray, along the
       pupil's y (tangential) and x (sagittal) diameters;
     OPD fans: the wavefront error along the same diameters, each wavelength about its own chief ray;
     field curvature: where the tangential and sagittal foci of each field lie along the axis,
       from the image plane, found from rays a little either side of the chief ray; distortion:
       the real chief ray's height against the paraxial chief ray's, in per cent;
     longitudinal aberration: where a ray from each height in the pupil crosses the axis, each
       wavelength, from the primary paraxial focus; chromatic focal shift: the paraxial focus
       over the wavelengths;
     the wavefront over the pupil and its fringe Zernike terms;
     the point spread function by FFT of the pupil function, its Strehl ratio and encircled energy;
     the diffraction MTF, tangential and sagittal, from the pupil function's autocorrelation,
       weighted over the wavelengths, with the diffraction limit;
     relative illumination: the exit pupil's projected solid angle seen from each image point;
     footprints: where each field's rays cross each surface, against its clear radius.
   ========================================================================== */
const D2R = Math.PI / 180;
/* the design's systems, one per wavelength, at its entrance pupil and image plane */
export function anaSystems(asm, P) {
  const c = asm.cond, nm0 = primaryNm(c), S0 = lensSystem(P, nm0, objOpts(c)), epd = designEpd(c, S0), o = objOpts(c, { epd, image: P.image });
  const S = c.waves.map(w => lensSystem(P, w.nm, o));
  const Sp = S[c.primary];
  // image-space NA and working F-number from the primary marginal ray
  const na = Math.abs(Sp.n[Sp.N] * Sp.epr * Sp.par.uEp), fw = na > 0 ? 1 / (2 * na) : Infinity;
  return { c, S, Sp, P, epd, na, fw, nm0, W: c.waves.reduce((a, w) => a + w.w, 0) || 1, finite: !!Sp.obj };
}
const chiefAt = (S, deg) => { const C = rayAt(S, deg * D2R, 0, 0); return C && C[7] === 0 ? [C[0], C[1]] : null; };
/* the paraxial chief ray's height on the image plane at field deg (an object height in mm, for a finite object) */
export const paraxHeight = (S, deg) => S.obj ? deg * (S.par.yChiefF + (S.imageZ - S.z[S.N - 1]) * S.par.uChiefF)
  : Math.tan(deg * D2R) * (S.par.yChief + (S.imageZ - S.z[S.N - 1]) * S.par.uChief);

/* ---------- Spot diagram ---------- */
export function spotDiagram(A, deg, n) {
  const pts = pupilGrid(n || 21), ref = chiefAt(A.Sp, deg) || [0, 0], R = new Float64Array(8);
  let sx = 0, sy = 0, sw = 0;
  const waves = A.S.map((S, wi) => {
    const out = [];
    let lost = 0;
    for (const [px, py] of pts) {
      const r = rayAt(S, deg * D2R, px, py, R);
      if (!r || r[7] !== 0) { lost++; continue; }
      out.push([r[0] - ref[0], r[1] - ref[1]]);
      const w = A.c.waves[wi].w; sx += w * (r[0] - ref[0]); sy += w * (r[1] - ref[1]); sw += w;
    }
    return { nm: S.nm, pts: out, lost };
  });
  const cx = sw ? sx / sw : 0, cy = sw ? sy / sw : 0;
  let s2 = 0, geo = 0;
  waves.forEach((w, wi) => { for (const [x, y] of w.pts) { const d2 = (x - cx) ** 2 + (y - cy) ** 2; s2 += A.c.waves[wi].w * d2; geo = Math.max(geo, Math.sqrt(d2)); } });
  return { deg, waves, centroid: [cx, cy], rms: sw ? Math.sqrt(s2 / sw) : NaN, geo, airy: 1.22 * A.nm0 * 1e-6 * A.fw, chief: ref, rays: pts.length };
}

/* ---------- Ray fans and OPD fans ---------- */
export function rayFans(A, deg, n) {
  n = n || 41;
  const ref = chiefAt(A.Sp, deg) || [0, 0], R = new Float64Array(8), p = Array.from({ length: n }, (_, i) => -1 + 2 * i / (n - 1));
  return { deg, p, waves: A.S.map(S => ({
    nm: S.nm,
    tan: p.map(v => { const r = rayAt(S, deg * D2R, 0, v, R); return r && r[7] === 0 ? r[1] - ref[1] : null; }),
    sag: p.map(v => { const r = rayAt(S, deg * D2R, v, 0, R); return r && r[7] === 0 ? r[0] - ref[0] : null; }),
  })) };
}
export function opdFans(A, deg, n) {
  n = n || 41;
  const p = Array.from({ length: n }, (_, i) => -1 + 2 * i / (n - 1));
  return { deg, p, waves: A.S.map(S => {
    const T = traceField(S, deg, p.map(v => [0, v])), Sg = traceField(S, deg, p.map(v => [v, 0]));
    const val = F => F ? F.rays.map(r => r.lost || !isFinite(r.opd) ? null : r.opd) : p.map(() => null);
    return { nm: S.nm, tan: val(T), sag: val(Sg) };
  }) };
}

/* ---------- Field curvature and distortion ----------
   The tangential focus of a field: where rays at ±d of the pupil in y cross the chief ray, in the
   y-z plane; the sagittal focus: where rays at ±d in x cross it, in the x-z plane. Each as a
   distance along the axis from the image plane (positive beyond it). */
export function fieldCurves(A, n) {
  n = n || 21;
  const fmax = Math.max(...A.c.fields.map(f => Math.abs(f.deg))), d = 1e-3, R = new Float64Array(8), Q = new Float64Array(8);
  const degs = Array.from({ length: n }, (_, i) => fmax * i / (n - 1));
  const focus = (S, th, px, py, axis) => {
    const C = rayAt(S, th, 0, 0, R);
    if (!C || C[7] !== 0) return null;
    const ca = C[axis], cs = C[axis + 3] / C[5];
    let sum = 0;
    for (const s of [1, -1]) {
      const r = rayAt(S, th, s * px, s * py, Q);
      if (!r || r[7] !== 0) return null;
      const rs = r[axis + 3] / r[5];
      if (Math.abs(rs - cs) < 1e-15) return null;
      sum += -(r[axis] - ca) / (rs - cs);
    }
    return sum / 2;
  };
  const waves = A.S.map(S => ({ nm: S.nm, tan: degs.map(g => focus(S, g * D2R, 0, d, 1)), sag: degs.map(g => focus(S, g * D2R, d, 0, 0)) }));
  const dist = degs.map(g => {
    if (!g) return 0;
    const C = chiefAt(A.Sp, g), yp = paraxHeight(A.Sp, g);
    return C && yp ? 100 * (C[1] - yp) / yp : null;
  });
  return { degs, waves, dist };
}

/* ---------- Relative illumination ----------
   How bright the image is across the field, against its centre, for a uniformly bright object (a scene, or an
   object of even radiance). Radiance is kept through a lens (over n²), so the irradiance at an image point goes as
   the projected solid angle its light arrives in: the exit pupil as the image point sees it, the area in the direction
   cosines (L, M) across the image plane of the directions from the image point (where the chief ray lands) to where
   each ray crosses the exit pupil's plane (so the bundle's own aberrations, which spread its rays' directions, do not
   count). A grid across the stop (N cells to its diameter), each cell split in two triangles, each
   triangle whose three rays all get through the stop and every clear radius counted with its area in (L, M);
   summed, at each field, over the axis's. Vignetting is the share of the stop's grid that gets through.
   With it, cos⁴ of the chief ray's angle to the image plane's normal: the natural fall-off of a lens without pupil
   aberration, to set the result against. At the primary wavelength. */
export function relIllum(A, n, N) {
  n = n || 21; N = N || 64;
  const S = A.Sp, fmax = Math.max(...A.c.fields.map(f => Math.abs(f.deg))), R = new Float64Array(8);
  const degs = Array.from({ length: n }, (_, i) => fmax * i / (n - 1));
  const xpz = S.par.xpz, tele = !isFinite(xpz);
  const one = g => {
    const th = g * D2R, G = [], C0 = rayAt(S, th, 0, 0, new Float64Array(8)), ok0 = C0 && C0[7] === 0;
    let alive = 0, inside = 0;
    for (let j = 0; j <= N; j++) {
      const row = [];
      for (let i = 0; i <= N; i++) {
        const px = -1 + 2 * i / N, py = -1 + 2 * j / N;
        if (px * px + py * py > 1 + 1e-12) { row.push(null); continue; }
        inside++;
        const r = rayAt(S, th, px, py, R);
        if (r && r[7] === 0 && isFinite(r[3]) && ok0) {
          // the direction from the image point (the chief ray's) to where this ray crosses the exit pupil's plane (an image-space
          // telecentric lens: its own direction): the exit pupil as the image point sees it, the bundle's aberrations aside
          if (tele || Math.abs(r[5]) < 1e-12) row.push([r[3], r[4]]);
          else { const t = (xpz - r[2]) / r[5], X = r[0] + r[3] * t - C0[0], Y = r[1] + r[4] * t - C0[1], Z = xpz - C0[2], l = Math.hypot(X, Y, Z); row.push([X / l, Y / l]); }
          alive++;
        } else row.push(null);
      }
      G.push(row);
    }
    const tri = (a, b, c) => (a && b && c ? Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2 : 0);
    let area = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = G[j][i], b = G[j][i + 1], c = G[j + 1][i + 1], d = G[j + 1][i];
      area += tri(a, b, c) + tri(a, c, d);
    }
    const C = rayAt(S, th, 0, 0, R), cz = C && C[7] === 0 ? Math.abs(C[5]) : null;
    return { area, vig: inside ? alive / inside : 0, cos4: cz === null ? null : cz ** 4 };
  };
  const pts = degs.map(one), a0 = pts[0].area || 1, v0 = pts[0].vig || 1;
  return { degs, ri: pts.map(p => p.area / a0), vig: pts.map(p => p.vig / v0), cos4: pts.map(p => p.cos4) };
}

/* ---------- Footprints ----------
   Where the rays of every field cross each surface, in the surface's own frame (from its vertex; a
   tilted or decentred surface's axes as it is turned), against its clear radius. A grid across the
   pupil and a ring at its edge, every wavelength. For each surface: the beam's radius there (the
   farthest any ray that reaches it lands from its vertex, the rays it stops counted), the rays it
   stops, and each field's points at the primary wavelength for drawing (those it stops apart). */
export function footprints(A, n, ring) {
  const S0 = A.Sp, N = S0.N, pts = pupilGrid(n || 15).map(p => [p[0], p[1]]);
  ring = ring || 48;
  for (let k = 0; k < ring; k++) { const a = 2 * Math.PI * k / ring; pts.push([Math.cos(a), Math.sin(a)]); }
  const surf = Array.from({ length: N }, (_, i) => ({ i, semi: S0.semi[i], beam: 0, stopped: 0, reach: 0, fields: A.c.fields.map(f => ({ deg: f.deg, pts: [], cut: [] })) }));
  const R = new Float64Array(8);
  const at = (S, i) => {
    const F = S.fr ? S.fr[i] : null;
    if (!F) return [R[0], R[1]];
    const Q = F.R, dx = R[0] - F.o[0], dy = R[1] - F.o[1], dz = R[2] - F.o[2];
    return [Q[0] * dx + Q[3] * dy + Q[6] * dz, Q[1] * dx + Q[4] * dy + Q[7] * dz];
  };
  A.S.forEach((S, wi) => {
    const prim = wi === A.c.primary;
    A.c.fields.forEach((f, fi) => {
      const th = f.deg * D2R;
      for (const [px, py] of pts) {
        const ab = aimRay(S, th, px, py);
        if (!ab) continue;
        lensLaunch(S, th, ab[0], ab[1], R);
        for (let i = 0; i < N; i++) {
          traceRay(S, R, i, i);
          const lost = R[7] !== 0;
          if (lost && R[7] !== 1 + i) break;           // it could not meet or refract at this surface: nothing to show
          const p = at(S, i), r = Math.hypot(p[0], p[1]), u = surf[i];
          u.reach++; u.beam = Math.max(u.beam, r);
          if (lost) u.stopped++;
          if (prim) (lost ? u.fields[fi].cut : u.fields[fi].pts).push(p);
          if (lost) break;
        }
      }
    });
  });
  return { surfaces: surf, rays: pts.length, nm: S0.nm };
}

/* ---------- Longitudinal aberration and chromatic focal shift ---------- */
export function longitudinal(A, n) {
  n = n || 21;
  const zp = A.Sp.z[A.Sp.N - 1] + A.Sp.par.back, R = new Float64Array(8);
  const rho = Array.from({ length: n }, (_, i) => (i + 1) / n);
  const waves = A.S.map(S => ({ nm: S.nm, dz: rho.map(p => { const r = rayAt(S, 0, 0, p, R); return r && r[7] === 0 && Math.abs(r[4]) > 1e-15 ? r[2] - r[1] * r[5] / r[4] - zp : null; }) }));
  // the paraxial focus over the wavelengths, from 10% below the shortest to 10% above the longest
  const nms = A.c.waves.map(w => w.nm), lo = Math.min(...nms) * 0.9, hi = Math.max(...nms) * 1.1, P = A.P;
  const lam = Array.from({ length: 41 }, (_, i) => lo + (hi - lo) * i / 40);
  const shift = lam.map(nm => { const S = lensSystem(P, nm, objOpts(A.c)); return S.z[S.N - 1] + S.par.back - zp; });
  return { rho, waves, lam, shift };
}

/* ---------- The pupil sampled: the wavefront on a grid ----------
   N points across the pupil's diameter (in the stop's normalised coordinates), each ray's OPD in
   waves about its chief ray, or lost */
export function pupilWave(S, deg, N) {
  const pts = [], idx = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -1 + (2 * i + 1) / N, y = -1 + (2 * j + 1) / N;
    if (x * x + y * y <= 1) { pts.push([x, y]); idx.push(j * N + i); }
  }
  const F = traceField(S, deg, pts), W = new Float64Array(N * N).fill(NaN);
  if (F) F.rays.forEach((r, k) => { if (!r.lost && isFinite(r.opd)) W[idx[k]] = r.opd; });
  return { N, W };
}
/* fringe Zernike polynomials Z1..Z16, ρ and θ from the x axis */
export const ZERNIKE_NAMES = ['Piston', 'Tilt x', 'Tilt y', 'Defocus', 'Astigmatism 0°', 'Astigmatism 45°', 'Coma x', 'Coma y', 'Spherical',
  'Trefoil x', 'Trefoil y', 'Secondary astigmatism 0°', 'Secondary astigmatism 45°', 'Secondary coma x', 'Secondary coma y', 'Secondary spherical'];
export function zernike(j, r, t) {
  const r2 = r * r, c = Math.cos, s = Math.sin;
  switch (j) {
    case 1: return 1; case 2: return r * c(t); case 3: return r * s(t); case 4: return 2 * r2 - 1;
    case 5: return r2 * c(2 * t); case 6: return r2 * s(2 * t);
    case 7: return (3 * r2 - 2) * r * c(t); case 8: return (3 * r2 - 2) * r * s(t);
    case 9: return 6 * r2 * r2 - 6 * r2 + 1;
    case 10: return r2 * r * c(3 * t); case 11: return r2 * r * s(3 * t);
    case 12: return (4 * r2 - 3) * r2 * c(2 * t); case 13: return (4 * r2 - 3) * r2 * s(2 * t);
    case 14: return (10 * r2 * r2 - 12 * r2 + 3) * r * c(t); case 15: return (10 * r2 * r2 - 12 * r2 + 3) * r * s(t);
    case 16: return 20 * r2 * r2 * r2 - 30 * r2 * r2 + 12 * r2 - 1;
  }
  return 0;
}
function solveDense(A, b, n) {
  // Gaussian elimination with partial pivoting
  const M = A.map((row, i) => row.concat([b[i]]));
  for (let k = 0; k < n; k++) {
    let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    [M[k], M[p]] = [M[p], M[k]];
    if (Math.abs(M[k][k]) < 1e-300) return null;
    for (let i = k + 1; i < n; i++) { const f = M[i][k] / M[k][k]; for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
  return x;
}
/* the wavefront's statistics and its Zernike fit by least squares over the points that came through */
export function wavefrontMap(A, deg, wi, N) {
  N = N || 48;
  const S = A.S[wi === undefined ? A.c.primary : wi], { W } = pupilWave(S, deg, N), J = 16;
  const rows = [];
  let sum = 0, cnt = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = W[j * N + i]; if (!isFinite(v)) continue;
    const x = -1 + (2 * i + 1) / N, y = -1 + (2 * j + 1) / N;
    rows.push([Math.hypot(x, y), Math.atan2(y, x), v]); sum += v; cnt++;
  }
  const mean = cnt ? sum / cnt : 0;
  let s2 = 0, mn = Infinity, mx = -Infinity;
  for (const [, , v] of rows) { s2 += (v - mean) ** 2; mn = Math.min(mn, v - mean); mx = Math.max(mx, v - mean); }
  const AtA = Array.from({ length: J }, () => new Array(J).fill(0)), Atb = new Array(J).fill(0);
  for (const [r, t, v] of rows) {
    const z = []; for (let k = 1; k <= J; k++) z.push(zernike(k, r, t));
    for (let a = 0; a < J; a++) { Atb[a] += z[a] * v; for (let b = 0; b < J; b++) AtA[a][b] += z[a] * z[b]; }
  }
  const coef = cnt > J ? solveDense(AtA, Atb, J) : null;
  return { deg, nm: S.nm, N, W, mean, rms: cnt ? Math.sqrt(s2 / cnt) : NaN, pv: cnt ? mx - mn : NaN, coef, lost: 0 };
}

/* ---------- The FFT ---------- */
export function fft1(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
export function fft2(re, im, M, inv) {
  const r = new Float64Array(M), i = new Float64Array(M);
  for (let y = 0; y < M; y++) { for (let x = 0; x < M; x++) { r[x] = re[y * M + x]; i[x] = im[y * M + x]; } fft1(r, i, inv); for (let x = 0; x < M; x++) { re[y * M + x] = r[x]; im[y * M + x] = i[x]; } }
  for (let x = 0; x < M; x++) { for (let y = 0; y < M; y++) { r[y] = re[y * M + x]; i[y] = im[y * M + x]; } fft1(r, i, inv); for (let y = 0; y < M; y++) { re[y * M + x] = r[y]; im[y * M + x] = i[y]; } }
}
/* |FFT|² of a pupil function (N across, padded to M), centred */
function psfOf(W, N, M, perfect) {
  const re = new Float64Array(M * M), im = new Float64Array(M * M), o = (M - N) >> 1;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = W[j * N + i]; if (!isFinite(v)) continue;
    const ph = perfect ? 0 : 2 * Math.PI * v;
    re[(j + o) * M + i + o] = Math.cos(ph); im[(j + o) * M + i + o] = Math.sin(ph);
  }
  fft2(re, im, M);
  const I = new Float64Array(M * M), h = M >> 1;
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) { const k = y * M + x, yy = (y + h) % M, xx = (x + h) % M; I[yy * M + xx] = re[k] * re[k] + im[k] * im[k]; }
  return I;
}
/* the PSF at one wavelength: its image (pixel dx mm), its Strehl ratio (peak against the same pupil
   without aberration) and its encircled energy about its centroid, with the diffraction limit's */
export function psfAnalysis(A, deg, wi, N, pad) {
  N = N || 64; pad = pad || 4;
  const S = A.S[wi === undefined ? A.c.primary : wi], { W } = pupilWave(S, deg, N), M = N * pad;
  const I = psfOf(W, N, M, false), I0 = psfOf(W, N, M, true);
  let pk = 0, pk0 = 0, tot = 0, cx = 0, cy = 0;
  for (let k = 0; k < M * M; k++) { pk = Math.max(pk, I[k]); pk0 = Math.max(pk0, I0[k]); tot += I[k]; cx += I[k] * (k % M); cy += I[k] * Math.floor(k / M); }
  cx /= tot; cy /= tot;
  const dx = S.lam * A.fw * N / M;                  // mm per pixel in the image
  const ee = (Im, x0, y0) => {
    const nb = M / 2, bins = new Float64Array(nb); let T = 0;
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) { const r = Math.hypot(x - x0, y - y0), b = Math.min(nb - 1, Math.floor(r)); bins[b] += Im[y * M + x]; T += Im[y * M + x]; }
    let c = 0; return Array.from(bins, v => (c += v) / T);
  };
  let c0x = 0, c0y = 0, t0 = 0;
  for (let k = 0; k < M * M; k++) { t0 += I0[k]; c0x += I0[k] * (k % M); c0y += I0[k] * Math.floor(k / M); }
  return { deg, nm: S.nm, M, dx, I, peak: pk, strehl: pk0 ? pk / pk0 : NaN, ee: ee(I, cx, cy), ee0: ee(I0, c0x / t0, c0y / t0), r: Array.from({ length: M / 2 }, (_, i) => (i + 1) * dx), airy: 1.22 * S.lam * A.fw, window: M * dx };
}

/* ---------- Huygens PSF ----------
   The PSF as the sum of Huygens wavelets on the image plane itself, not as a Fourier transform. A grid
   of rays across the pupil is traced to the reference sphere (about the chief ray's image point,
   through the exit pupil; for an image space telecentric design, through where the chief ray leaves
   the last surface); each ray's crossing is a source, its phase its optical path there, its amplitude
   from its share of the light (each ray the same share of the entrance pupil) over the area of sphere
   it covers (from its neighbours), so the pupil's own distortion counts. Each image point sums
       U(P) = (n'/iλ) Σ a_k e^{i k (L_k + n' r)} cos χ / r,
   r from the source to P, χ between the ray and r (Rayleigh-Sommerfeld). The image plane is the
   design's, square to the axis, so a beam meeting it slantwise spreads over it as it does there.
   Over several wavelengths the irradiances add, each with its weight. The Strehl ratio: the peak
   against that of the same rays with no aberration (all their phases alike), at its centre.
   Its rays are N across, so the pattern repeats N λ F away: the window is kept well inside that. Where the exit
   pupil lies beyond the image (the sphere virtual), the wavelets are run back from it, e^{-ikr}. */
export function huygensSum(src, P0, ex, ey, dx, M, kn, sgn, j0, j1, out) {
  // src: sources [x, y, z, L, M, N (the ray's direction), phase, amplitude]; P0 the grid's middle; ex, ey its axes;
  // rows j0 to j1 - 1 only, if given, into out
  sgn = sgn || 1; j0 = j0 || 0; j1 = j1 === undefined ? M : j1;
  const re = out ? out.re : new Float64Array(M * M), im = out ? out.im : new Float64Array(M * M), h = (M - 1) / 2, n = src.length / 8;
  for (let j = j0; j < j1; j++) for (let i = 0; i < M; i++) {
    const u = (i - h) * dx, v = (j - h) * dx, px = P0[0] + ex[0] * u + ey[0] * v, py = P0[1] + ex[1] * u + ey[1] * v, pz = P0[2] + ex[2] * u + ey[2] * v;
    let a = 0, b = 0;
    for (let k = 0, o = 0; k < n; k++, o += 8) {
      const X = px - src[o], Y = py - src[o + 1], Z = pz - src[o + 2], r = Math.sqrt(X * X + Y * Y + Z * Z);
      const ob = sgn * (X * src[o + 3] + Y * src[o + 4] + Z * src[o + 5]) / r, w = src[o + 7] * ob / r, ph = src[o + 6] + sgn * kn * r;
      a += w * Math.cos(ph); b += w * Math.sin(ph);
    }
    re[j * M + i] = a; im[j * M + i] = b;
  }
  return { re, im };
}
/* the same sum, one row (j) at a time and quick: along the row each wavelet's phase k r is a quadratic in u to within
   k Δ³/r² (a thousandth of a radian over a window of a few hundred λF), so from its exact value and slope at the row's
   start it is stepped pixel to pixel by multiplying phasors, no trigonometry inside; its strength (cos χ / r) is
   taken at the row's start (it changes by Δ/r across, a part in a thousand) */
export function huygensRow(src, P0, ex, ey, dx, M, kn, sgn, j, re, im) {
  const h = (M - 1) / 2, n = src.length / 8, v = (j - h) * dx, u0 = -h * dx;
  const sx = P0[0] + ex[0] * u0 + ey[0] * v, sy = P0[1] + ex[1] * u0 + ey[1] * v, sz = P0[2] + ex[2] * u0 + ey[2] * v;
  const ar = new Float64Array(M), ai = new Float64Array(M);
  for (let k = 0, o = 0; k < n; k++, o += 8) {
    const X = sx - src[o], Y = sy - src[o + 1], Z = sz - src[o + 2], r = Math.sqrt(X * X + Y * Y + Z * Z);
    const e = (X * ex[0] + Y * ex[1] + Z * ex[2]) / r;                  // the slope of r along the row, dr/du
    const ob = sgn * (X * src[o + 3] + Y * src[o + 4] + Z * src[o + 5]) / r, w = src[o + 7] * ob / r;
    // k r(u) = k r + k e u + k (1 - e²) u² / (2 r): the first step's phase and the step's own change
    const q = sgn * kn, ph = src[o + 6] + q * r, d1 = q * (e * dx + (1 - e * e) * dx * dx / (2 * r)), d2 = q * (1 - e * e) * dx * dx / r;
    let pr = w * Math.cos(ph), pi = w * Math.sin(ph), sr = Math.cos(d1), si = Math.sin(d1);
    const cr = Math.cos(d2), ci = Math.sin(d2);
    for (let i = 0; i < M; i++) {
      ar[i] += pr; ai[i] += pi;
      const t = pr * sr - pi * si; pi = pr * si + pi * sr; pr = t;
      const t2 = sr * cr - si * ci; si = sr * ci + si * cr; sr = t2;
    }
  }
  for (let i = 0; i < M; i++) { re[j * M + i] = ar[i]; im[j * M + i] = ai[i]; }
}
/* one wavelength's sources: the rays of field th through an N × N grid at the stop, on the reference sphere */
function huygensSources(S, th, N, power) {
  const C = rayAt(S, th, 0, 0, new Float64Array(8));
  if (!C || C[7] !== 0) return null;
  const nI = S.n[S.N], xpz = S.par.xpz, cx = C[0], cy = C[1], cz = C[2];
  let Rref;
  if (isFinite(xpz) && Math.abs(cz - xpz) > 1e-9) { const t = (xpz - cz) / C[5]; Rref = Math.hypot(C[3] * t, C[4] * t, C[5] * t) * Math.sign(cz - xpz); }
  else Rref = Math.abs(S.imageZ - S.z[S.N - 1]) / Math.abs(C[5]) || 1;
  const toSphere = R => {
    const dx = R[0] - cx, dy = R[1] - cy, dz = R[2] - cz, bq = dx * R[3] + dy * R[4] + dz * R[5], cq = dx * dx + dy * dy + dz * dz - Rref * Rref, disc = bq * bq - cq;
    if (disc < 0) return null;
    return Rref > 0 ? bq + Math.sqrt(disc) : bq - Math.sqrt(disc);
  };
  const tc = toSphere(C), L0 = C[6] - nI * tc, G = new Array(N * N).fill(null), R = new Float64Array(8);
  let inside = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const px = -1 + (2 * i + 1) / N, py = -1 + (2 * j + 1) / N;
    if (px * px + py * py > 1) continue;
    inside++;
    const r = rayAt(S, th, px, py, R);
    if (!r || r[7] !== 0) continue;
    const t = toSphere(r);
    if (t === null) continue;
    G[j * N + i] = [r[0] - r[3] * t, r[1] - r[4] * t, r[2] - r[5] * t, r[3], r[4], r[5], r[6] - nI * t - L0];
  }
  // each source's patch of the sphere: from its neighbours either way along the grid (one way at an edge)
  const at = (k, di, dj) => { const i = k % N + di, j = Math.floor(k / N) + dj; return i >= 0 && i < N && j >= 0 && j < N ? G[j * N + i] : null; };
  const der = (k, di, dj) => {
    const a = at(k, di, dj), b = at(k, -di, -dj), c = G[k];
    if (a && b) return [(a[0] - b[0]) / 2, (a[1] - b[1]) / 2, (a[2] - b[2]) / 2];
    if (a) return [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
    if (b) return [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    return null;
  };
  const areas = G.map((g, k) => {
    if (!g) return null;
    const u = der(k, 1, 0), v = der(k, 0, 1);
    if (!u || !v) return null;
    return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
  });
  const known = areas.filter(a => a !== null).sort((a, b) => a - b), med = known.length ? known[known.length >> 1] : 0;
  const lam = S.lam, k0 = 2 * Math.PI / lam, p = power / inside, out = [];
  let amp0 = 0;
  G.forEach((g, k) => {
    if (!g) return;
    const a = Math.sqrt(p * (areas[k] === null ? med : areas[k])) * nI / lam;
    out.push(g[0], g[1], g[2], g[3], g[4], g[5], k0 * g[6], a);
    amp0 += a / Math.abs(Rref);                       // the perfect wave at the sphere's centre: every source in phase, square on, Rref away
  });
  return { src: Float64Array.from(out), centre: [cx, cy, cz], Rref, k: k0 * nI, peak0: amp0 * amp0, n: out.length / 8, inside };
}
/* the Huygens PSF of field deg: wi, a wavelength's index, or -1 for all of them weighted; o.dx the spacing on the image (mm,
   by default λF/4), o.M the most points across (129; with both given, exactly that); o.N the rays across the pupil (by
   default enough for the pattern to repeat twice the window away, at least 64). Planned, summed a row at a time
   (huygensRows, so a page can keep live) and finished; or all at once (huygensPsf). */
export function huygensPlan(A, deg, wi, o) {
  o = o || {};
  const th = deg * D2R, all = wi < 0;
  const list = all ? A.S.map((S, i) => [S, A.c.waves[i].w / A.W]) : [[A.S[wi === undefined ? A.c.primary : wi], 1]];
  // the window: about the spot's centroid, as the image's own axes run, sampled at λF/4 (as the FFT PSF is), wide enough
  // for 8 Airy radii or 10 RMS radii of the spot but no wider than M points (32 λF at 129)
  const sp = spotDiagram(A, deg, 15), lamF = Math.max(...list.map(([S]) => S.lam)) * A.fw, lamMin = Math.min(...list.map(([S]) => S.lam)) * A.fw;
  const rms = isFinite(sp.rms) ? sp.rms : 0, dx = o.dx || lamMin / 4, Mmax = (o.M || 129) | 1;
  const want = Math.max(8 * 1.22 * lamF, 10 * rms), M = o.dx && o.M ? Mmax : Math.min(Mmax, (Math.ceil(want / dx) + 1) | 1), window = dx * (M - 1);
  // rays enough across that the pattern repeats twice the window away
  const N = o.N || Math.max(64, Math.ceil(2 * window / lamMin / 8) * 8);
  const per = list.map(([S, w]) => ({ S, w, H: huygensSources(S, th, N, w) })).filter(q => q.H);
  if (!per.length) return null;
  const ref = (per.find(q => q.S === A.Sp) || per[0]).H;
  const centre = [ref.centre[0] + (isFinite(sp.centroid[0]) ? sp.centroid[0] : 0), ref.centre[1] + (isFinite(sp.centroid[1]) ? sp.centroid[1] : 0), ref.centre[2]];
  return { deg, wi: all ? -1 : wi, nm: all ? null : per[0].S.nm, M, dx, N, per, centre, window, alias: N * lamMin, lamF, geo: isFinite(sp.geo) ? sp.geo : 0, rms,
    clipped: want > window * 1.001, I: new Float64Array(M * M), F: per.map(() => ({ re: new Float64Array(M * M), im: new Float64Array(M * M) })), next: 0, rows: M * per.length };
}
/* sum the plan's next rows (count of them, over all its wavelengths in turn); true once every row is done */
export function huygensRows(plan, count) {
  const M = plan.M;
  while (count-- > 0 && plan.next < plan.rows) {
    const w = Math.floor(plan.next / M), j = plan.next % M, q = plan.per[w], F = plan.F[w];
    huygensRow(q.H.src, plan.centre, [1, 0, 0], [0, 1, 0], plan.dx, M, q.H.k, Math.sign(q.H.Rref) || 1, j, F.re, F.im);
    for (let i = j * M; i < (j + 1) * M; i++) plan.I[i] += F.re[i] * F.re[i] + F.im[i] * F.im[i];
    plan.next++;
  }
  return plan.next >= plan.rows;
}
export function huygensFinish(plan) {
  const { M, dx, I } = plan, h = (M - 1) / 2, peak0 = plan.per.reduce((a, q) => a + q.H.peak0, 0);
  let pk = 0, at = 0, tot = 0, cx = 0, cy = 0;
  for (let k = 0; k < M * M; k++) { if (I[k] > pk) { pk = I[k]; at = k; } tot += I[k]; cx += I[k] * (k % M); cy += I[k] * Math.floor(k / M); }
  cx /= tot || 1; cy /= tot || 1;
  return { deg: plan.deg, wi: plan.wi, nm: plan.nm, M, dx, I, peak: pk, strehl: peak0 ? pk / peak0 : NaN, centre: [plan.centre[0], plan.centre[1]],
    peakAt: [((at % M) - h) * dx, (Math.floor(at / M) - h) * dx], centroid: [(cx - h) * dx, (cy - h) * dx], window: plan.window, alias: plan.alias, aliased: plan.window > 0.5 * plan.alias,
    airy: 1.22 * plan.lamF, rays: plan.per.reduce((a, q) => a + q.H.n, 0), across: plan.N, geo: plan.geo, rms: plan.rms, clipped: plan.clipped };
}
export function huygensPsf(A, deg, wi, o) {
  const plan = huygensPlan(A, deg, wi, o);
  if (!plan) return null;
  huygensRows(plan, plan.rows);
  return huygensFinish(plan);
}

/* ---------- MTF ----------
   The OTF at a shift of the pupil function against itself, k pixels along x (sagittal) or y
   (tangential): Σ U(p) U*(p - k) / Σ |U|². A shift of the whole diameter (N pixels) is the cutoff
   frequency 1/(λ F), F the working F-number. Over the wavelengths, each one's OTF at the same
   frequency in cycles per mm, weighted. */
function otf(W, N, axis, perfect) {
  const out = [], U = [];
  let norm = 0;
  for (let k = 0; k < N * N; k++) { const v = W[k]; if (isFinite(v)) { const ph = perfect ? 0 : 2 * Math.PI * v; U.push([k, Math.cos(ph), Math.sin(ph)]); norm++; } else U.push(null); }
  const at = (i, j) => (i < 0 || j < 0 || i >= N || j >= N) ? null : U[j * N + i];
  for (let s = 0; s <= N; s++) {
    let re = 0, im = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = at(i, j), b = axis === 'x' ? at(i - s, j) : at(i, j - s);
      if (!a || !b) continue;
      re += a[1] * b[1] + a[2] * b[2]; im += a[2] * b[1] - a[1] * b[2];
    }
    out.push([norm ? re / norm : 0, norm ? im / norm : 0]);
  }
  return out;
}
export function mtfAnalysis(A, deg, nu, N) {
  N = N || 48;
  const nmax = nu || 1 / (Math.min(...A.S.map(S => S.lam)) * A.fw);     // the cutoff at the shortest wavelength
  const freqs = Array.from({ length: 61 }, (_, i) => nmax * i / 60);
  const per = A.S.map((S, wi) => { const { W } = pupilWave(S, deg, N); return { w: A.c.waves[wi].w, nuc: 1 / (S.lam * A.fw), T: otf(W, N, 'y'), Sg: otf(W, N, 'x'), T0: otf(W, N, 'y', true), S0: otf(W, N, 'x', true) }; });
  const interp = (arr, s) => { if (s >= N) return [0, 0]; const k = Math.floor(s), f = s - k, a = arr[k], b = arr[Math.min(N, k + 1)]; return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])]; };
  const curve = key => freqs.map(nu2 => { let re = 0, im = 0, W = 0; for (const p of per) { const v = interp(p[key], nu2 / p.nuc * N); re += p.w * v[0]; im += p.w * v[1]; W += p.w; } return Math.hypot(re, im) / W; });
  return { deg, freqs, tan: curve('T'), sag: curve('Sg'), limT: curve('T0'), limS: curve('S0'), cutoff: 1 / (A.Sp.lam * A.fw) };
}
/* ---------- Through-focus MTF ----------
   The diffraction MTF at one frequency nu (cycles/mm), tangential and sagittal, each field, as the image plane is moved
   along the axis by dz from where the design has it, n steps over ±span (mm); over the wavelengths, weighted, as
   mtfAnalysis gives it. The best focus: where the mean over the fields of the tangential and sagittal MTF peaks; the
   depth of focus: how far either side that mean stays above 80% of its peak. */
export function throughFocusPlan(asm, P, nu, span, n, N) {
  n = n || 31; N = N || 32;
  const A0 = anaSystems(asm, P), S0 = A0.Sp, base = S0.imageZ - S0.z[S0.N - 1], fields = A0.c.fields;
  const dz = Array.from({ length: n }, (_, i) => -span + 2 * span * i / (n - 1));
  const per = fields.map(() => ({ tan: [], sag: [] }));
  let at = 0;
  return {
    steps: n,
    get done() { return at; },
    next() {
      if (at < n) {
        const A = anaSystems(asm, Object.assign({}, P, { image: base + dz[at] }));
        fields.forEach((f, k) => { const M = mtfAnalysis(A, f.deg, nu, N); per[k].tan.push(M.tan[M.tan.length - 1]); per[k].sag.push(M.sag[M.sag.length - 1]); });
        at++;
      }
      return at >= n;
    },
    result() {
      const mean = dz.map((_, i) => per.reduce((a, q) => a + q.tan[i] + q.sag[i], 0) / (2 * per.length));
      // the peak, by a parabola through the best step and its neighbours
      const peakOf = ys => {
        let b = 0; ys.forEach((v, i) => { if (v > ys[b]) b = i; });
        if (b > 0 && b < ys.length - 1) { const a = ys[b - 1], c = ys[b + 1], den = a - 2 * ys[b] + c; if (den < 0) { const t = 0.5 * (a - c) / den; return { at: dz[b] + t * (dz[1] - dz[0]), v: ys[b] - 0.25 * (a - c) * t }; } }
        return { at: dz[b], v: ys[b] };
      };
      const best = peakOf(mean);
      // the depth of focus: where the mean falls to 80% of its peak either side (interpolated)
      const cross = dir => {
        let i = Math.round((best.at + span) / (2 * span) * (n - 1));
        for (; i + dir >= 0 && i + dir < n; i += dir) {
          const a = mean[i], b = mean[i + dir], lim = 0.8 * best.v;
          if (a >= lim && b < lim) return dz[i] + (dz[i + dir] - dz[i]) * (a - lim) / (a - b);
        }
        return null;
      };
      const lo = cross(-1), hi = cross(1);
      return { nu, span, dz, fields: fields.map((f, k) => ({ deg: f.deg, tan: per[k].tan, sag: per[k].sag, best: peakOf(per[k].tan.map((v, i) => (v + per[k].sag[i]) / 2)) })), mean, best, dof: lo !== null && hi !== null ? [lo, hi] : null, base, cutoff: 1 / (S0.lam * A0.fw), lamF2: S0.lam * A0.fw * A0.fw };
    },
  };
}
export function throughFocus(asm, P, nu, span, n, N) {
  const plan = throughFocusPlan(asm, P, nu, span, n, N);
  while (!plan.next());
  return plan.result();
}

/* the OTF at one whole shift s of a sampled pupil function, along x or y: [re, im] */
function otfShift(W, N, axis, s) {
  let re = 0, im = 0, norm = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = W[j * N + i];
    if (!isFinite(a)) continue;
    norm++;
    const i2 = axis === 'x' ? i - s : i, j2 = axis === 'x' ? j : j - s;
    if (i2 < 0 || j2 < 0) continue;
    const b = W[j2 * N + i2];
    if (!isFinite(b)) continue;
    const pa = 2 * Math.PI * a, pb = 2 * Math.PI * b;
    re += Math.cos(pa - pb); im += Math.sin(pa - pb);
  }
  return norm ? [re / norm, im / norm] : [0, 0];
}
/* the diffraction MTF at one frequency nu (cycles/mm), tangential ('T', across y) or sagittal ('S', across x),
   weighted over the wavelengths as the MTF view weights it: Sw the systems at each wavelength, ws their weights,
   fw the working F-number; N points across the pupil. Cheap enough for the merit function: two shifts only */
export function mtfAt(Sw, ws, fw, deg, nu, dir, N) {
  N = N || 32;
  let re = 0, im = 0, Wt = 0;
  Sw.forEach((S, wi) => {
    const { W } = pupilWave(S, deg, N), s = nu * S.lam * fw * N;
    const add = axis => {
      if (s >= N) return [0, 0];
      const k = Math.floor(s), f = s - k, a = otfShift(W, N, axis, k), b = otfShift(W, N, axis, k + 1);
      return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
    };
    const v = dir === 'S' ? add('x') : add('y');
    re += ws[wi] * v[0]; im += ws[wi] * v[1]; Wt += ws[wi];
  });
  return Wt ? Math.hypot(re, im) / Wt : 0;
}
/* the diffraction-limited MTF of a round pupil, ν over its cutoff */
export const mtfPerfect = v => v >= 1 ? 0 : (2 / Math.PI) * (Math.acos(v) - v * Math.sqrt(1 - v * v));
