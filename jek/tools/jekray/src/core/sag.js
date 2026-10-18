/* ==========================================================================
   A surface's sag, written once
   A rotationally symmetric surface: a conic of curvature c and constant k, an r² term a2, even aspheric
   terms A (r⁴, r⁶, ...) and odd ones (r, r², r³, ...). The bench's tracer, the lens engine, the element data,
   the drawings and the CAD export all take it from here, so a surface term added later is added in one place.
   ========================================================================== */

/* the sag at r² = r2. Beyond the edge of the conic's own sphere: clamped to the edge (clampEdge, as a tracer
   feeling for a surface needs), or NaN (as a drawing or a thickness wants) */
export function sagR2(c, k, a2, A, odd, r2, clampEdge) {
  let v = 0;
  if (c) {
    const arg = 1 - (1 + k) * c * c * r2;
    if (arg < 0 && !clampEdge) return NaN;
    v = c * r2 / (1 + Math.sqrt(Math.max(0, arg)));
  }
  if (a2) v += a2 * r2;
  if (A) { let p = r2 * r2; for (let j = 0; j < A.length; j++) { v += A[j] * p; p *= r2; } }
  if (odd) { const r = Math.sqrt(r2); let q = r; for (let j = 0; j < odd.length; j++) { v += odd[j] * q; q *= r; } }
  return v;
}

/* a prescription surface's sag at height h in the plane of the fields: a cylinder curved out of that plane is flat
   in it (its aspheric terms along its curved axis too), and a freeform's terms along the section count; NaN beyond
   a sphere's edge */
export function sagInPlane(s, h) {
  let v = 0;
  if (s.cyl !== 'x') v = sagR2(s.R ? 1 / s.R : 0, s.k || 0, s.a2 || 0, s.A || null, s.odd || null, h * h, false);
  if (s.F) for (const k in s.F) if (k[0] === '0') v += s.F[k] * Math.pow(h, +k[1]);
  return v;
}
