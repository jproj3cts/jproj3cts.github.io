/* ==========================================================================
   A surface's sag, written once
   A rotationally symmetric surface: a conic of curvature c and constant k, an r² term a2, even aspheric
   terms A (r⁴, r⁶, ...) and odd ones (r, r², r³, ...). The bench's tracer, the lens engine, the element data,
   the drawings and the CAD export all take it from here, so a surface term added later is added in one place.
   ========================================================================== */

/* the sag at r² = r2. Beyond the edge of the conic's own sphere: clamped to the edge (clampEdge, as a tracer
   feeling for a surface needs: a Newton step may land past it on the way to a root inside), or NaN (as a drawing or a
   thickness wants). A root the tracer settles on past the edge is no meeting with the surface (pastEdge) */
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

/* r² = r2 beyond the edge of the conic's own sphere (of curvature c and constant k), where it has no surface: a ray
   whose search settles there (on the clamped sag) has missed it */
export const pastEdge = (c, k, r2) => c !== 0 && 1 - (1 + k) * c * c * r2 < -1e-12;

/* a prescription surface's sag at height h in the plane of the fields: a cylinder curved out of that plane is flat
   in it (its aspheric terms along its curved axis too), and a freeform's terms along the section count; NaN beyond
   a sphere's edge */
export function sagInPlane(s, h) {
  let v = 0;
  if (s.cyl !== 'x') v = sagR2(s.R ? 1 / s.R : 0, s.k || 0, s.a2 || 0, s.A || null, s.odd || null, h * h, false);
  if (s.F) for (const k in s.F) if (k[0] === '0') v += s.F[k] * Math.pow(h, +k[1]);
  return v;
}

/* Stacked surfaces (a gap of 0) that both reach a height: which is the surface there. The one with the smaller clear radius,
   the piece set into the other (a mirror spot on a face, a window in a primary's hole whose own radius is set to the hole);
   where both reach as far, the one with the narrower ring (a primary round a window that has no radius of its own). As a
   sort comparator over the members holding the height: the first is the surface met. */
export const stackOrder = (a, b) => Math.abs(a.semi - b.semi) > 1e-9 ? a.semi - b.semi : (a.semi - (a.hole || 0)) - (b.semi - (b.hole || 0));
/* two stacked surfaces over the same ring (the same clear radius and hole): layers, both met where they apply, one straight after
   the other in the order the light comes to them (a coating's face over a mirror, a cemented interface on a face) */
export const sameRing = (a, b) => Math.abs(a.semi - b.semi) <= 1e-9 && Math.abs((a.hole || 0) - (b.hole || 0)) <= 1e-9;
/* the members of a stack met at radius r, of those given (in their order along the axis): the one stackOrder picks, with the
   layers over its same ring; none where every member's hole or edge leaves the height out. at(q): q's semi and hole, as given */
export function stackMet(list, r, at = q => q) {
  const hold = list.filter(q => { const o = at(q); return r >= (o.hole || 0) - 1e-9 && r <= o.semi + 1e-9; });
  if (!hold.length) return hold;
  const best = hold.slice().sort((a, b) => stackOrder(at(a), at(b)))[0];
  return hold.filter(q => sameRing(at(q), at(best)));
}
