/* ==========================================================================
   A diffractive surface: a phase written on a lens's face (a kinoform, its zones
   blazed so the light goes into one order)
   φ(ρ) = Σ c_j ρ^(2j), j = 1 to 4, in radians, ρ the height on the face in mm. In its order m
   it adds m λ φ / 2π of optical path, and bends a ray as a grating of that local pitch would:
   along the face, n' d' = n d + (m λ / 2π) ∇φ, the rest of d' made up to a unit vector on the
   far side. All the light is taken to go into order m (a blaze's efficiency is not modelled).
   Its power in that order, -m λ c₁ / π, grows with the wavelength: the other way to glass,
   which is what lets one correct a refracting lens's colour.
   ========================================================================== */
export const DP_KEYS = ['p2', 'p4', 'p6', 'p8'];
export const DP_N = DP_KEYS.length;
export const dpLabel = j => 'ρ' + ['²', '⁴', '⁶', '⁸'][j];
/* the terms kept on a face: up to four finite numbers, trailing zeros dropped; none when all are 0 */
export function normPh(ph) {
  if (!Array.isArray(ph)) return undefined;
  const out = ph.slice(0, DP_N).map(v => (v === null || v === '' || !isFinite(+v) ? 0 : +v));
  while (out.length && !out[out.length - 1]) out.pop();
  return out.length ? out : undefined;
}
export const dpOn = ph => !!ph && ph.some(v => v);
/* the order: a whole number other than 0, 1 unless given */
export const normOrder = m => (Number.isInteger(+m) && +m !== 0 && Math.abs(+m) <= 10 ? +m : 1);
/* φ at ρ² = r2, in radians */
export function dpPhase(ph, r2) { let v = 0, p = r2; for (let j = 0; j < ph.length; j++) { v += ph[j] * p; p *= r2; } return v; }
/* dφ/dρ over ρ (finite on the axis) */
export function dpSlopeOverR(ph, r2) { let v = 0, p = 1; for (let j = 0; j < ph.length; j++) { v += 2 * (j + 1) * ph[j] * p; p *= r2; } return v; }
/* its paraxial power, 1/mm, at the wavelength lam (mm) in order m */
export const dpPower = (ph, m, lam) => (ph && ph[0] ? -m * lam * ph[0] / Math.PI : 0);
/* A ray's way d (unit) through a face of normal u (unit, either sense), from index n1 into n2,
   given the momentum G (m λ / 2π ∇φ, a 3-vector across the axis) along the face: Snell's law with
   it. Into out (a 3-array); false if it cannot leave (past grazing). */
export function dpBend(d, u, n1, n2, G, out) {
  const ci = d[0] * u[0] + d[1] * u[1] + d[2] * u[2], gu = G[0] * u[0] + G[1] * u[1] + G[2] * u[2];
  const t0 = n1 * (d[0] - ci * u[0]) + G[0] - gu * u[0], t1 = n1 * (d[1] - ci * u[1]) + G[1] - gu * u[1], t2 = n1 * (d[2] - ci * u[2]) + G[2] - gu * u[2];
  const k = n2 * n2 - (t0 * t0 + t1 * t1 + t2 * t2);
  if (k < 0) return false;
  const s = (ci < 0 ? -1 : 1) * Math.sqrt(k);
  out[0] = (t0 + s * u[0]) / n2; out[1] = (t1 + s * u[1]) / n2; out[2] = (t2 + s * u[2]) / n2;
  return true;
}
