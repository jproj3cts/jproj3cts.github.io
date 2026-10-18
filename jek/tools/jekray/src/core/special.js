/* ==========================================================================
   Special functions, written once: Bessel functions of the first kind. The diffracted field, the horns, the
   modulators' sidebands and the antenna patterns all take them from here.
   ========================================================================== */

/* J0 and J1 to about 1e-12: power series below 12, Hankel asymptotics above */
export function besselJ01(x) {
  const ax = Math.abs(x);
  if (ax < 12) {
    const q = -0.25 * ax * ax;
    let t0 = 1, s0 = 1, t1 = 0.5 * ax, s1 = t1;
    for (let k = 1; k < 60; k++) {
      t0 *= q / (k * k); s0 += t0;
      t1 *= q / (k * (k + 1)); s1 += t1;
      if (Math.abs(t0) < 1e-17 * Math.abs(s0) && Math.abs(t1) < 1e-17 * (Math.abs(s1) + 1e-300)) break;
    }
    return [s0, x < 0 ? -s1 : s1];
  }
  // P and Q for orders 0 and 1, summed until the terms stop shrinking
  const z8 = 8 * ax;
  const pq = mu => {
    let P = 1, Q = 0, term = 1, k = 1;
    for (; k < 40; k++) {
      term *= (mu - (2 * k - 1) ** 2) / (k * z8);
      const next = Math.abs(term);
      if (k % 2) Q += term * (k % 4 === 1 ? 1 : -1);
      else P += term * (k % 4 === 2 ? -1 : 1);
      if (next < 1e-17) break;
      if (k > 2 && next > Math.abs(term / ((mu - (2 * k - 1) ** 2) / (k * z8)))) break;
    }
    return [P, Q];
  };
  const [P0, Q0] = pq(0), [P1, Q1] = pq(4);
  const a = Math.sqrt(2 / (Math.PI * ax));
  const c0 = ax - Math.PI / 4, c1 = ax - 3 * Math.PI / 4;
  const J0 = a * (P0 * Math.cos(c0) - Q0 * Math.sin(c0));
  const J1 = a * (P1 * Math.cos(c1) - Q1 * Math.sin(c1));
  return [J0, x < 0 ? -J1 : J1];
}

/* The first n positive zeros of J0: McMahon's expansion polished by Newton */
export function besselZerosJ0(n) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const b = (i + 0.75) * Math.PI, b8 = 8 * b;
    let x = b + 1 / b8 - 124 / (3 * b8 ** 3) + 120928 / (15 * b8 ** 5);
    for (let it = 0; it < 6; it++) {
      const [j0, j1] = besselJ01(x);
      const dx = j0 / j1;                  // J0' = -J1, so Newton adds J0/J1
      x += dx;
      if (Math.abs(dx) < 1e-14 * x) break;
    }
    out[i] = x;
  }
  return out;
}


/* J_n(x) for integer n by its power series, summed until the terms stop mattering (fine for the arguments the
   horns' aperture fields and a modulator's sidebands need: a few tens at most) */
export function besselJn(n, x) {
  if (n < 0) return (n % 2 ? -1 : 1) * besselJn(-n, x);
  let term = 1; for (let k = 1; k <= n; k++) term *= x / 2 / k;
  let sum = term;
  for (let k = 1; k < 300; k++) { term *= -(x * x / 4) / (k * (k + n)); sum += term; if (Math.abs(term) < 1e-17 * Math.max(1e-300, Math.abs(sum))) break; }
  return sum;
}
