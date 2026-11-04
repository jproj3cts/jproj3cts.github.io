/* ==========================================================================
   Electrode shapes: what each one is, whether a point is inside it, its extent, its section through a plane
   (for the bench), and its triangles (for the 3D view). Every shape but the box and a CAD body is a body of
   revolution about its own axis (x, y or z through its centre): a profile, the inner and outer radius along the
   axis, so one piece of code tests, cuts and tessellates them all. Positions are millimetres.
   ========================================================================== */
export const SHAPES = {
  box: { label: 'Box / plate', picker: 'A rectangular block or a flat plate: its three sizes' },
  rod: { label: 'Rod', picker: 'A solid cylinder: a quadrupole or multipole rod, a wire' },
  tube: { label: 'Tube', picker: 'A hollow cylinder: a drift tube, an einzel lens element' },
  aperture: { label: 'Aperture plate', picker: 'A round plate with a hole: an extraction or lens aperture, a skimmer' },
  cone: { label: 'Cone', picker: 'A truncated cone, solid or with a wall: a skimmer, a funnel element' },
  sphere: { label: 'Sphere', picker: 'A ball: a spherical electrode' },
  ring: { label: 'Hyperbolic ring', picker: 'A Paul trap’s ring electrode: its inner face r² − 2z² = r₀²' },
  endcap: { label: 'Hyperbolic endcap', picker: 'One of a Paul trap’s endcaps: its face 2z² − r² = 2z₀²' },
  mesh: { label: 'CAD body', picker: 'A body brought in from a STEP or STL file' },
};
export const AXES = ['x', 'y', 'z'];
/* the axis coordinate and the two across it, as indexes into [x, y, z] */
export const axisFrame = axis => (axis === 'x' ? [0, 1, 2] : axis === 'y' ? [1, 0, 2] : [2, 0, 1]);
export const isRevolved = el => !!PROFILES[el.shape];

/* the profile of a body of revolution: the span along its axis from its centre, and the inner and outer radius at
   each point of it (a solid body has rIn 0) */
const PROFILES = {
  rod: el => ({ a0: -el.L / 2, a1: el.L / 2, rIn: () => 0, rOut: () => el.r }),
  tube: el => ({ a0: -el.L / 2, a1: el.L / 2, rIn: () => el.rIn, rOut: () => el.rOut }),
  aperture: el => ({ a0: -el.L / 2, a1: el.L / 2, rIn: () => el.rIn, rOut: () => el.rOut }),
  cone: el => ({ a0: -el.L / 2, a1: el.L / 2, rOut: a => el.r1 + (el.r2 - el.r1) * (a + el.L / 2) / el.L, rIn: a => (el.wall > 0 ? Math.max(0, el.r1 + (el.r2 - el.r1) * (a + el.L / 2) / el.L - el.wall) : 0) }),
  sphere: el => ({ a0: -el.r, a1: el.r, rIn: () => 0, rOut: a => Math.sqrt(Math.max(0, el.r * el.r - a * a)) }),
  // a Paul trap's ring: inside the hyperboloid r² − 2a² = r0², out to rMax, over its height L
  ring: el => ({ a0: -el.L / 2, a1: el.L / 2, rIn: a => Math.sqrt(el.r0 * el.r0 + 2 * a * a), rOut: () => el.rMax }),
  // one endcap: the body beyond the hyperboloid 2a² − r² = 2z0² on its side, L tall
  endcap: el => { const s = el.side < 0 ? -1 : 1, z0 = el.z0, lo = s > 0 ? z0 : -(z0 + el.L), hi = s > 0 ? z0 + el.L : -z0;
    return { a0: lo, a1: hi, rIn: () => 0, rOut: a => Math.min(el.rMax, Math.sqrt(Math.max(0, 2 * a * a - 2 * z0 * z0))) }; },
};
export const profileOf = el => (PROFILES[el.shape] ? PROFILES[el.shape](el) : null);
/* the largest outer radius a profile reaches */
export function profileRMax(P) {
  let m = 0;
  for (let i = 0; i <= 32; i++) m = Math.max(m, P.rOut(P.a0 + (P.a1 - P.a0) * i / 32));
  return m;
}

/* is the point inside the electrode? null for a CAD body (its voxels say) */
export function shapeInside(el, x, y, z) {
  if (el.shape === 'mesh') return null;
  const dx = x - el.x, dy = y - el.y, dz = z - el.z;
  if (el.shape === 'box') return Math.abs(dx) <= el.sx / 2 && Math.abs(dy) <= el.sy / 2 && Math.abs(dz) <= el.sz / 2;
  const P = profileOf(el); if (!P) return false;
  const d = [dx, dy, dz], [ia, ib, ic] = axisFrame(el.axis), a = d[ia];
  if (a < P.a0 || a > P.a1) return false;
  const r2 = d[ib] * d[ib] + d[ic] * d[ic], ro = P.rOut(a), ri = P.rIn(a);
  return r2 <= ro * ro && r2 >= ri * ri;
}
/* [lo, hi] of the electrode, in bench coordinates (a CAD body from its triangles) */
export function shapeBounds(el) {
  const c = [el.x, el.y, el.z];
  if (el.shape === 'box') { const s = [el.sx / 2, el.sy / 2, el.sz / 2]; return [c.map((v, k) => v - s[k]), c.map((v, k) => v + s[k])]; }
  if (el.shape === 'mesh') {
    const T = el.meshT; if (!T || !T.length) return [c.slice(), c.slice()];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < T.length; i++) { const k = i % 3, v = T[i] + c[k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
    return [lo, hi];
  }
  const P = profileOf(el), [ia, ib, ic] = axisFrame(el.axis), rm = profileRMax(P), lo = c.slice(), hi = c.slice();
  lo[ia] += P.a0; hi[ia] += P.a1; lo[ib] -= rm; hi[ib] += rm; lo[ic] -= rm; hi[ic] += rm;
  return [lo, hi];
}

/* ---------- sections through a plane, for the bench ----------
   plane 'xy' (cut at z = slice), 'xz' (at y) or 'yz' (at x): the polygons to fill with the even-odd rule, each a
   list of [u, v] in the plane's own two coordinates; null when the plane misses the electrode */
export const PLANES = { xy: [0, 1, 2], xz: [0, 2, 1], yz: [1, 2, 0] };    // [u, v, perpendicular] as indexes into [x, y, z]
const N_ALONG = 48, N_ROUND = 72;
export function shapeSections(el, plane, slice) {
  const [iu, iv, ip] = PLANES[plane], c = [el.x, el.y, el.z];
  if (el.shape === 'box') {
    const s = [el.sx / 2, el.sy / 2, el.sz / 2];
    if (Math.abs(slice - c[ip]) > s[ip]) return null;
    const u0 = c[iu] - s[iu], u1 = c[iu] + s[iu], v0 = c[iv] - s[iv], v1 = c[iv] + s[iv];
    return [[[u0, v0], [u1, v0], [u1, v1], [u0, v1]]];
  }
  const P = profileOf(el); if (!P) return null;
  const [ia] = axisFrame(el.axis), polys = [];
  if (ia === ip) {
    // the axis stands out of the plane: rings about the centre
    const a = slice - c[ip]; if (a < P.a0 || a > P.a1) return null;
    const circle = r => { const pts = []; for (let i = 0; i < N_ROUND; i++) { const t = 2 * Math.PI * i / N_ROUND; pts.push([c[iu] + r * Math.cos(t), c[iv] + r * Math.sin(t)]); } return pts; };
    const ro = P.rOut(a), ri = P.rIn(a);
    if (!(ro > 0)) return null;
    polys.push(circle(ro));
    if (ri > 0) polys.push(circle(ri));
    return polys;
  }
  // the axis lies in the plane: the chord of each radius at the plane's distance from the axis
  const d = Math.abs(slice - c[ip]), along = ia === iu, ic = along ? iv : iu;
  const pt = (a, w) => (along ? [c[iu] + a, c[iv] + w] : [c[iu] + w, c[iv] + a]);
  const outer = [], inner = [];
  let anyIn = false;
  for (let i = 0; i <= N_ALONG; i++) {
    const a = P.a0 + (P.a1 - P.a0) * i / N_ALONG, ro = P.rOut(a), ri = P.rIn(a);
    outer.push(Math.sqrt(Math.max(0, ro * ro - d * d)));
    const wi = Math.sqrt(Math.max(0, ri * ri - d * d)); inner.push(wi); if (wi > 0) anyIn = true;
  }
  if (!outer.some(w => w > 0)) return null;
  const poly = ws => { const pts = []; for (let i = 0; i <= N_ALONG; i++) pts.push(pt(P.a0 + (P.a1 - P.a0) * i / N_ALONG, ws[i])); for (let i = N_ALONG; i >= 0; i--) pts.push(pt(P.a0 + (P.a1 - P.a0) * i / N_ALONG, -ws[i])); return pts; };
  polys.push(poly(outer));
  if (anyIn) polys.push(poly(inner));
  void ic;
  return polys;
}
/* a CAD body's section: the line segments where its triangles cross the plane, [u1, v1, u2, v2] each, in bench coordinates */
export function meshSections(T, c, plane, slice) {
  const [iu, iv, ip] = PLANES[plane], out = [];
  const n = Math.floor(T.length / 9);
  for (let t = 0; t < n; t++) {
    const o = 9 * t, p = [[T[o] + c[0], T[o + 1] + c[1], T[o + 2] + c[2]], [T[o + 3] + c[0], T[o + 4] + c[1], T[o + 5] + c[2]], [T[o + 6] + c[0], T[o + 7] + c[1], T[o + 8] + c[2]]];
    const s = p.map(q => q[ip] - slice), pts = [];
    for (let e = 0; e < 3; e++) {
      const A = p[e], B = p[(e + 1) % 3], sa = s[e], sb = s[(e + 1) % 3];
      if ((sa < 0 && sb >= 0) || (sa >= 0 && sb < 0)) { const f = sa / (sa - sb); pts.push([A[iu] + f * (B[iu] - A[iu]), A[iv] + f * (B[iv] - A[iv])]); }
    }
    if (pts.length === 2) out.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
  }
  return out;
}

/* ---------- triangles, for the 3D view ----------
   { pos: Float32Array (xyz each vertex), idx: Uint32Array } in bench coordinates */
export function shapeTriangles(el) {
  const c = [el.x, el.y, el.z];
  if (el.shape === 'mesh') {
    const T = el.meshT; if (!T) return null;
    const pos = new Float32Array(T.length);
    for (let i = 0; i < T.length; i++) pos[i] = T[i] + c[i % 3];
    const idx = new Uint32Array(T.length / 3); for (let i = 0; i < idx.length; i++) idx[i] = i;
    return { pos, idx };
  }
  if (el.shape === 'box') {
    const s = [el.sx / 2, el.sy / 2, el.sz / 2], pos = new Float32Array(24);
    for (let v = 0; v < 8; v++) { pos[3 * v] = c[0] + (v & 1 ? s[0] : -s[0]); pos[3 * v + 1] = c[1] + (v & 2 ? s[1] : -s[1]); pos[3 * v + 2] = c[2] + (v & 4 ? s[2] : -s[2]); }
    const idx = new Uint32Array([0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 5, 0, 5, 4, 2, 6, 7, 2, 7, 3, 0, 4, 6, 0, 6, 2, 1, 3, 7, 1, 7, 5]);
    return { pos, idx };
  }
  const P = profileOf(el); if (!P) return null;
  const [ia, ib, ic] = axisFrame(el.axis), nA = 40, nT = 64;
  // the outer surface along, then the inner back (a solid closes on its axis)
  const ring = [];
  for (let i = 0; i <= nA; i++) { const a = P.a0 + (P.a1 - P.a0) * i / nA; ring.push([a, P.rOut(a)]); }
  for (let i = nA; i >= 0; i--) { const a = P.a0 + (P.a1 - P.a0) * i / nA; ring.push([a, P.rIn(a)]); }
  const nR = ring.length, pos = new Float32Array(3 * nR * nT), idx = [];
  for (let r = 0; r < nR; r++) for (let t = 0; t < nT; t++) {
    const th = 2 * Math.PI * t / nT, p = [0, 0, 0];
    p[ia] = ring[r][0]; p[ib] = ring[r][1] * Math.cos(th); p[ic] = ring[r][1] * Math.sin(th);
    const o = 3 * (r * nT + t); pos[o] = p[0] + c[0]; pos[o + 1] = p[1] + c[1]; pos[o + 2] = p[2] + c[2];
  }
  for (let r = 0; r < nR; r++) for (let t = 0; t < nT; t++) {
    const r2 = (r + 1) % nR, t2 = (t + 1) % nT, A = r * nT + t, B = r * nT + t2, C = r2 * nT + t, D = r2 * nT + t2;
    idx.push(A, B, D, A, D, C);
  }
  return { pos, idx: new Uint32Array(idx) };
}
