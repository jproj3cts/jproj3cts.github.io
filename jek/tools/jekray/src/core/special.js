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


/* J_n(x) for integer n, to about 1e-11 for x to a few hundred and n to a few hundred: up from
   J0 and J1 by the recurrence J_{k+1} = (2k / x) J_k - J_{k-1} where n < |x| (stable going up
   there), and below it by Miller's: down from far above both n and x, where J_k dies away, and
   scaled to J0 or J1 (whichever is the larger, the two never both small). A power series, as
   this was, cancels away at large x: J10(40) came out 0.0918 for 0.1194 and J0(50) 655. */
export function besselJn(n, x) {
  if (n < 0) return (n % 2 ? -1 : 1) * besselJn(-n, x);
  if (x < 0) return (n % 2 ? -1 : 1) * besselJn(n, -x);
  if (x === 0) return n === 0 ? 1 : 0;
  const [j0, j1] = besselJ01(x);
  if (n === 0) return j0;
  if (n === 1) return j1;
  if (x > n) {
    let a = j0, b = j1;
    for (let k = 1; k < n; k++) { const c = 2 * k / x * b - a; a = b; b = c; }
    return b;
  }
  // from an even order well past n and x, so the terms there are negligible against those wanted
  const top = Math.max(n, x), m = 2 * Math.ceil((top + 20 + 4 * Math.sqrt(top)) / 2);
  let hi = 0, lo = 1e-300, want = 0, at0 = 0, at1 = 0;
  for (let k = m; k > 0; k--) {
    const c = 2 * k / x * lo - hi; hi = lo; lo = c;        // lo is now J_{k-1}, hi J_k (unscaled)
    if (Math.abs(lo) > 1e250) { lo *= 1e-250; hi *= 1e-250; want *= 1e-250; }
    if (k - 1 === n) want = lo;
    if (k === 1) { at0 = lo; at1 = hi; }
  }
  return Math.abs(j0) >= Math.abs(j1) ? want * j0 / at0 : want * j1 / at1;
}
