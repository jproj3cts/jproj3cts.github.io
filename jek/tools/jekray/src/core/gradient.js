/* ==========================================================================
   A graded glass: its index falling (or rising) from the axis of the part it is in
   n(r) = n_g(λ) + g₂ r² + g₄ r⁴ + g₆ r⁶, n_g the glass's own index, r the distance from the axis in
   mm. A ray in it bends toward the higher index along d/ds (n t) = ∇n; it is traced by the
   fourth-order Runge–Kutta method in its length, with p = n t carried, in steps short against the
   distance over which its path curves. A rod whose index falls as a parabola (g₂ < 0) is the
   graded-index rod lens: a ray in it swings about the axis with the period 2π/√(-2g₂/n₀) (its pitch).
   ========================================================================== */
export const GR_N = 3;
export const grLabel = j => 'r' + ['²', '⁴', '⁶'][j];
/* the step a ray takes in a part's graded glass: short against its width (diameter, mm), so the curve is
   followed and no face is stepped past unseen; the bench and the lens engine take the same */
export const grH = dia => Math.max(0.002, Math.min(0.1, dia / 80));
// a face within this many steps along the ray's line is met straight (a step would land on it, or just short of it)
export const GR_REACH = 1.5;
/* the terms kept on a glass: up to three finite numbers, trailing zeros dropped; none when all are 0 */
export function normGrad(G) {
  if (!Array.isArray(G)) return undefined;
  const out = G.slice(0, GR_N).map(v => (v === null || v === '' || !isFinite(+v) ? 0 : +v));
  while (out.length && !out[out.length - 1]) out.pop();
  return out.length ? out : undefined;
}
export const grOn = G => !!G && G.some(v => v);
/* the index added at r² = r2, and dn/dr over r */
export function grDelta(G, r2) { let v = 0, p = r2; for (let j = 0; j < G.length; j++) { v += G[j] * p; p *= r2; } return v; }
export function grSlopeOverR(G, r2) { let v = 0, p = 1; for (let j = 0; j < G.length; j++) { v += 2 * (j + 1) * G[j] * p; p *= r2; } return v; }
/* One step of length h along a ray in a medium: X its point, P = n t (t its unit way), nAt(X) the index
   there and gradAt(X) its gradient. X and P are moved in place; the optical path of the step is returned
   (Simpson's rule on n along it). */
export function grStep(X, P, h, nAt, gradAt) {
  const f = (x, p) => { const n = nAt(x), g = gradAt(x); return [p[0] / n, p[1] / n, p[2] / n, g[0], g[1], g[2]]; };
  const add = (x, p, k, s) => [[x[0] + k[0] * s, x[1] + k[1] * s, x[2] + k[2] * s], [p[0] + k[3] * s, p[1] + k[4] * s, p[2] + k[5] * s]];
  const n0 = nAt(X);
  const k1 = f(X, P), [x2, p2] = add(X, P, k1, h / 2), k2 = f(x2, p2), [x3, p3] = add(X, P, k2, h / 2), k3 = f(x3, p3), [x4, p4] = add(X, P, k3, h), k4 = f(x4, p4);
  const nm = nAt(x2);
  for (let q = 0; q < 3; q++) {
    X[q] += h / 6 * (k1[q] + 2 * k2[q] + 2 * k3[q] + k4[q]);
    P[q] += h / 6 * (k1[q + 3] + 2 * k2[q + 3] + 2 * k3[q + 3] + k4[q + 3]);
  }
  // p's length is the index where the ray is: held to it, so the step's errors do not build up
  const n1 = nAt(X), pl = Math.hypot(P[0], P[1], P[2]) || 1;
  for (let q = 0; q < 3; q++) P[q] *= n1 / pl;
  return h / 6 * (n0 + 4 * nm + n1);
}
/* the paraxial matrix of a length L of it, its r² term alone, n0 the index on the axis: [A, B, C, D] on
   (height, slope) — a ray swings with k² = -2 g₂ / n₀ */
export function grMatrix(g2, n0, L) {
  const k2 = -2 * g2 / n0;
  if (Math.abs(k2) * L * L < 1e-12) return [1, L, 0, 1];
  if (k2 > 0) { const k = Math.sqrt(k2), c = Math.cos(k * L), s = Math.sin(k * L); return [c, s / k, -k * s, c]; }
  const k = Math.sqrt(-k2), c = Math.cosh(k * L), s = Math.sinh(k * L);
  return [c, s / k, k * s, c];
}
