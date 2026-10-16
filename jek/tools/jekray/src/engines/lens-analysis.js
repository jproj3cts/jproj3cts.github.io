import { lensSystem, pupilGrid, rayAt, traceField } from './lens-engine.js';
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
       weighted over the wavelengths, with the diffraction limit.
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
function fft1(re, im, inv) {
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
function fft2(re, im, M) {
  const r = new Float64Array(M), i = new Float64Array(M);
  for (let y = 0; y < M; y++) { for (let x = 0; x < M; x++) { r[x] = re[y * M + x]; i[x] = im[y * M + x]; } fft1(r, i); for (let x = 0; x < M; x++) { re[y * M + x] = r[x]; im[y * M + x] = i[x]; } }
  for (let x = 0; x < M; x++) { for (let y = 0; y < M; y++) { r[y] = re[y * M + x]; i[y] = im[y * M + x]; } fft1(r, i); for (let y = 0; y < M; y++) { re[y * M + x] = r[y]; im[y * M + x] = i[y]; } }
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
/* the diffraction-limited MTF of a round pupil, ν over its cutoff */
export const mtfPerfect = v => v >= 1 ? 0 : (2 / Math.PI) * (Math.acos(v) - v * Math.sqrt(1 - v * v));
