/* ==========================================================================
   Lorenz-Mie scattering by a homogeneous sphere in a plane wave
   The notation and the sign of time are Bohren and Huffman's (Absorption and Scattering of
   Light by Small Particles, 1983, chapter 4): fields go as exp(-i w t), the relative index is
   m = n + i kappa with kappa >= 0 for an absorber, the size parameter x = k a with k the wave
   number in the medium. The coefficients
     a_n = ((D_n/m + n/x) psi_n - psi_{n-1}) / ((D_n/m + n/x) xi_n - xi_{n-1}),
     b_n = ((m D_n + n/x) psi_n - psi_{n-1}) / ((m D_n + n/x) xi_n - xi_{n-1}),
   are summed to Wiscombe's cutoff (Appl. Opt. 19, 1505 (1980)). The logarithmic derivative
   D_n(m x) is carried downward from well above the cutoff and |m x|, where any start is forgotten; the
   Riccati-Bessel psi_n(x) likewise downward (Miller's way) and scaled to psi_0 or psi_1, so
   nothing is lost for a tiny sphere; chi_n upward, the way it grows.
   Pure: nothing of the bench here.
   ========================================================================== */

/* how many terms: Wiscombe's criterion */
export function mieTerms(x) {
  const c = Math.cbrt(x);
  return Math.max(1, Math.ceil(x < 8 ? x + 4 * c + 1 : x < 4200 ? x + 4.05 * c + 2 : x + 4 * c + 2));
}
/* the coefficients of a sphere of size parameter x and relative index mr + i mi:
   { n, x, ar, ai, br, bi }, the arrays indexed 1..n */
export function mieCoeffs(x, mr, mi = 0) {
  if (!(x > 0)) throw new Error('mieCoeffs: the size parameter must be positive');
  const n = mieTerms(x), zr = mr * x, zi = mi * x;
  // D_n(z) downward: D_{n-1} = n/z - 1/(D_n + n/z). The start's error dies away only while the order is above |z|,
  // and slowly just above it (by exp(-(4 sqrt 2 / 3) |z| e^1.5) over orders up to |z| (1 + e)): starting 8 |z|^(1/3) + 16
  // orders up leaves none of it. (Bohren and Huffman's 15 orders leave 1e-6 to 1e-4 of the efficiencies for a large
  // sphere that absorbs little, which the validation's independent reference showed.)
  const za = Math.hypot(zr, zi), nmx = Math.ceil(Math.max(n, za) + 8 * Math.cbrt(za)) + 16, z2 = zr * zr + zi * zi;
  const Dr = new Float64Array(n + 1), Di = new Float64Array(n + 1);
  let dr = 0, di = 0;
  for (let j = nmx; j >= 1; j--) {
    const qr = j * zr / z2, qi = -j * zi / z2;                // j / z
    const sr = dr + qr, si = di + qi, s2 = sr * sr + si * si;
    dr = qr - sr / s2; di = qi + si / s2;
    if (j - 1 <= n) { Dr[j - 1] = dr; Di[j - 1] = di; }
  }
  // psi_n(x) downward, unnormalised, then scaled by whichever of psi_0, psi_1 is the larger
  const N = n + 16 + Math.ceil(x), psi = new Float64Array(n + 1);
  {
    let p1 = 0, p0 = 1e-200;                                  // p_{j+1}, p_j
    const raw = new Float64Array(n + 2);
    for (let j = N; j >= 1; j--) {
      const pm = (2 * j + 1) / x * p0 - p1;                   // p_{j-1}
      p1 = p0; p0 = pm;
      if (Math.abs(p0) > 1e250) { p0 *= 1e-250; p1 *= 1e-250; for (let q = j; q <= n + 1; q++) raw[q] *= 1e-250; }
      if (j - 1 <= n + 1) raw[j - 1] = p0;
    }
    const s0 = Math.sin(x), s1 = Math.sin(x) / x - Math.cos(x);
    const sc = Math.abs(raw[0]) >= Math.abs(raw[1]) ? s0 / raw[0] : s1 / raw[1];
    for (let j = 0; j <= n; j++) psi[j] = raw[j] * sc;
  }
  // chi_n(x) = -x y_n(x) upward; xi_n = psi_n - i chi_n
  const chi = new Float64Array(n + 1);
  chi[0] = Math.cos(x);
  if (n >= 1) chi[1] = Math.cos(x) / x + Math.sin(x);
  for (let j = 2; j <= n; j++) chi[j] = (2 * j - 1) / x * chi[j - 1] - chi[j - 2];
  const ar = new Float64Array(n + 1), ai = new Float64Array(n + 1), br = new Float64Array(n + 1), bi = new Float64Array(n + 1);
  const m2 = mr * mr + mi * mi;
  for (let j = 1; j <= n; j++) {
    // D/m + j/x and m D + j/x
    const ur = (Dr[j] * mr + Di[j] * mi) / m2 + j / x, ui = (Di[j] * mr - Dr[j] * mi) / m2;
    const vr = mr * Dr[j] - mi * Di[j] + j / x, vi = mr * Di[j] + mi * Dr[j];
    const p = psi[j], p0 = psi[j - 1], c = -chi[j], c0 = -chi[j - 1];   // xi = p + i c
    const one = (wr, wi) => {
      const nr = wr * p - p0, ni = wi * p;
      const er = wr * p - wi * c - p0, ei = wr * c + wi * p - c0, e2 = er * er + ei * ei;
      return [(nr * er + ni * ei) / e2, (ni * er - nr * ei) / e2];
    };
    const A = one(ur, ui), B = one(vr, vi);
    ar[j] = A[0]; ai[j] = A[1]; br[j] = B[0]; bi[j] = B[1];
  }
  return { n, x, ar, ai, br, bi };
}
/* the efficiencies (cross-sections over pi a^2) and the asymmetry g = <cos theta>.
   back is Bohren and Huffman's backscattering efficiency, 4 pi dC/dOmega(180) / (pi a^2) */
export function mieQ(C) {
  const { n, x, ar, ai, br, bi } = C;
  let ext = 0, sca = 0, gs = 0, bkr = 0, bki = 0;
  for (let j = 1; j <= n; j++) {
    const f = 2 * j + 1;
    ext += f * (ar[j] + br[j]);
    sca += f * (ar[j] * ar[j] + ai[j] * ai[j] + br[j] * br[j] + bi[j] * bi[j]);
    gs += f / (j * (j + 1)) * (ar[j] * br[j] + ai[j] * bi[j]);
    if (j < n) gs += j * (j + 2) / (j + 1) * (ar[j] * ar[j + 1] + ai[j] * ai[j + 1] + br[j] * br[j + 1] + bi[j] * bi[j + 1]);
    const s = j % 2 ? -1 : 1;
    bkr += s * f * (ar[j] - br[j]); bki += s * f * (ai[j] - bi[j]);
  }
  const q = 2 / (x * x), Qsca = q * sca, Qext = q * ext;
  return { Qext, Qsca, Qabs: Qext - Qsca, Qback: (bkr * bkr + bki * bki) / (x * x), g: Qsca > 0 ? 2 * q * gs / Qsca : 0 };
}
/* the amplitude functions at cos(theta) = mu: [S1 re, S1 im, S2 re, S2 im] */
export function mieS(C, mu, out) {
  const { n, ar, ai, br, bi } = C;
  let s1r = 0, s1i = 0, s2r = 0, s2i = 0, pi0 = 0, pi1 = 1;
  for (let j = 1; j <= n; j++) {
    const tau = j * mu * pi1 - (j + 1) * pi0, f = (2 * j + 1) / (j * (j + 1));
    s1r += f * (ar[j] * pi1 + br[j] * tau); s1i += f * (ai[j] * pi1 + bi[j] * tau);
    s2r += f * (ar[j] * tau + br[j] * pi1); s2i += f * (ai[j] * tau + bi[j] * pi1);
    const pn = ((2 * j + 1) * mu * pi1 - (j + 1) * pi0) / j;
    pi0 = pi1; pi1 = pn;
  }
  const o = out || [0, 0, 0, 0];
  o[0] = s1r; o[1] = s1i; o[2] = s2r; o[3] = s2i;
  return o;
}
/* S1 and S2 on an even grid of the angle, for sums over many plane waves: { n, d, t } with
   t[4 i] the four numbers at theta = i d */
export function mieTable(C, nAng) {
  const n = nAng || Math.max(2881, 96 * C.n + 1), d = Math.PI / (n - 1), t = new Float64Array(4 * n), o = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) { mieS(C, Math.cos(i * d), o); t[4 * i] = o[0]; t[4 * i + 1] = o[1]; t[4 * i + 2] = o[2]; t[4 * i + 3] = o[3]; }
  return { n, d, t };
}
