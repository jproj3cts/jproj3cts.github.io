

export function polyFit(xs, ys, deg) {
  // least squares by the normal equations, in a scaled variable (well conditioned for deg <= 6)
  const n = deg + 1, A = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (let i = 0; i < xs.length; i++) {
    const p = [1]; for (let k = 1; k < 2 * n; k++) p.push(p[k - 1] * xs[i]);
    for (let r = 0; r < n; r++) { for (let c = 0; c < n; c++) A[r][c] += p[r + c]; A[r][n] += p[r] * ys[i]; }
  }
  for (let c = 0; c < n; c++) {
    let m = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
    [A[c], A[m]] = [A[m], A[c]];
    if (!A[c][c]) return null;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  return A.map((row, r) => row[n] / row[r]);
}

/* the FWHM of a sampled curve, interpolated at both half points; null if it does not fall to half */
export function fwhmOf(xs, ys) {
  let k = 0; for (let i = 1; i < ys.length; i++) if (ys[i] > ys[k]) k = i;
  const h2 = ys[k] / 2;
  let a = k; while (a > 0 && ys[a] > h2) a--;
  let b = k; while (b < ys.length - 1 && ys[b] > h2) b++;
  if (ys[a] > h2 || ys[b] > h2) return null;
  const xa = xs[a] + (xs[a + 1] - xs[a]) * (h2 - ys[a]) / (ys[a + 1] - ys[a]);
  const xb = xs[b - 1] + (xs[b] - xs[b - 1]) * (h2 - ys[b - 1]) / (ys[b] - ys[b - 1]);
  return xb - xa;
}

/* ---------- A photodiode's signal: its DC and the beat notes in it ----------
   Light of one laser at two offsets f_a and f_b beats at f_b - f_a: the power carries
   2 Re(E_a . E_b* e^{i 2 pi (f_b - f_a) t}), E the fields summed over the diode (for a fibre
   photodiode, the fibre's two polarisations), each pair of paths weighted by the laser's
   gamma of their delay. Two different lasers beat at the difference of their frequencies,
   but with a phase that wanders and a line as wide as both of theirs: those are listed as
   such. The amplifier passes each tone through its bandwidth, a single pole. */
export const cdotc = (A, B) => [A[0] * B[0] + A[1] * B[1] + A[2] * B[2] + A[3] * B[3], A[1] * B[0] - A[0] * B[1] + A[3] * B[2] - A[2] * B[3]];   // A . conj(B)
