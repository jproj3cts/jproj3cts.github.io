/* ==========================================================================
   Small numerics the engines share, written once: complex numbers as [re, im], 3-vectors, small linear
   systems, and a seeded random source. The bench's trace, the lens designer, the RF designer, the
   electronics and the chip solver all draw on these, so none keeps a copy of its own.
   ========================================================================== */

/* ---------- complex numbers, [re, im] ---------- */
export const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const cabs2 = a => a[0] * a[0] + a[1] * a[1];
/* a / b; a denominator of nought is taken as the least there is, so a division never gives NaN */
export const cdiv = (a, b) => { const d = cabs2(b) || 1e-300; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };

/* ---------- 3-vectors ---------- */
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/* ---------- small linear systems ---------- */
/* A x = b for a small real A (rows of arrays), by elimination with partial pivoting on a copy; null when a pivot
   falls below tol (singular) */
export function solveLinear(A0, b0, tol = 1e-300) {
  const n = b0.length, M = A0.map((r, i) => Array.from(r).concat([b0[i]]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    if (!(Math.abs(M[p][c]) >= tol) || !(Math.abs(M[p][c]) > 0)) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let i = c + 1; i < n; i++) { const f = M[i][c] / M[c][c]; if (f) for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j]; }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
  return x;
}
/* A x = b for a symmetric positive-definite A, flat and row-major (n x n), by Cholesky; null if it is not */
export function solveCholesky(A, b, n) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i * n + j];
    for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
    if (i === j) { if (!(s > 0)) return null; L[i * n + i] = Math.sqrt(s); } else L[i * n + j] = s / L[j * n + j];
  }
  const y = new Float64Array(n), x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return x;
}

/* ---------- random numbers ---------- */
/* a seeded source of uniform numbers in [0, 1) (mulberry32), so a Monte Carlo run or a search repeats exactly */
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* a standard normal from a uniform source (Box-Muller) */
export const randn = rnd => Math.sqrt(-2 * Math.log(rnd() || 1e-300)) * Math.cos(2 * Math.PI * rnd());
