import { gIdx } from './grid.js';
import { shapeBounds, shapeInside } from './geom.js';

/* ==========================================================================
   Painting the electrodes into the array: mask[node] is the electrode's index for a node inside one, -1 for a free
   node. A shape is tested node by node within its box; a CAD body is filled row by row along x, from where its
   triangles cross each row (an even number of crossings, inside between the first and second, the third and
   fourth…), its triangles sorted into buckets by the rows they can meet. A cylindrical array paints the (x, r)
   half plane; a planar one the plane z = 0.
   ========================================================================== */
export function newMask(g) { const m = new Int16Array(g.n); m.fill(-1); return m; }
/* the nodes of a shape: those within its box that are inside it */
export function paintShape(g, mask, el, value) {
  const [lo, hi] = shapeBounds(el), h = g.h;
  const i0 = Math.max(0, Math.ceil((lo[0] - g.x0) / h - 1e-9)), i1 = Math.min(g.nx - 1, Math.floor((hi[0] - g.x0) / h + 1e-9));
  let j0, j1, k0 = 0, k1 = 0;
  if (g.sym === 'cyl') { const rm = Math.max(Math.abs(lo[1]), Math.abs(hi[1]), Math.abs(lo[2]), Math.abs(hi[2])); j0 = 0; j1 = Math.min(g.ny - 1, Math.floor(rm / h + 1e-9)); }
  else { j0 = Math.max(0, Math.ceil((lo[1] - g.y0) / h - 1e-9)); j1 = Math.min(g.ny - 1, Math.floor((hi[1] - g.y0) / h + 1e-9)); }
  if (g.sym === '3d') { k0 = Math.max(0, Math.ceil((lo[2] - g.z0) / h - 1e-9)); k1 = Math.min(g.nz - 1, Math.floor((hi[2] - g.z0) / h + 1e-9)); }
  else if (g.sym === 'planar' && (lo[2] > 0 || hi[2] < 0)) return 0;          // the plane z = 0 misses it
  let n = 0;
  for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = g.x0 + i * h, y = g.y0 + j * h, z = g.z0 + k * h;
    if (shapeInside(el, x, y, z)) { mask[gIdx(g, i, j, k)] = value; n++; }
  }
  return n;
}
/* the nodes of a CAD body: T its triangles (9 numbers each) about the centre c */
export function paintMesh(g, mask, T, c, value) {
  const h = g.h, nT = Math.floor(T.length / 9);
  if (!nT) return 0;
  // each triangle into the buckets of the rows (j, k) its (y, z) extent covers
  const buckets = new Map();
  const jOf = y => (y - g.y0) / h, kOf = z => (g.nz === 1 ? 0 : (z - g.z0) / h);
  for (let t = 0; t < nT; t++) {
    const o = 9 * t;
    const ys = [T[o + 1] + c[1], T[o + 4] + c[1], T[o + 7] + c[1]], zs = [T[o + 2] + c[2], T[o + 5] + c[2], T[o + 8] + c[2]];
    let j0 = Math.ceil(jOf(Math.min(...ys)) - 1e-9), j1 = Math.floor(jOf(Math.max(...ys)) + 1e-9);
    let k0 = Math.ceil(kOf(Math.min(...zs)) - 1e-9), k1 = Math.floor(kOf(Math.max(...zs)) + 1e-9);
    if (g.nz === 1) { if (g.sym === 'planar' && (Math.min(...zs) > 0 || Math.max(...zs) < 0)) continue; k0 = 0; k1 = 0; }
    if (g.sym === 'cyl') { j0 = Math.max(0, j0); }
    j0 = Math.max(0, j0); j1 = Math.min(g.ny - 1, j1); k0 = Math.max(0, k0); k1 = Math.min(g.nz - 1, k1);
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) { const key = j + g.ny * k; let b = buckets.get(key); if (!b) { b = []; buckets.set(key, b); } b.push(t); }
  }
  let n = 0;
  const xs = [];
  for (const [key, tris] of buckets) {
    const j = key % g.ny, k = Math.floor(key / g.ny), y = g.y0 + j * h, z = g.nz === 1 ? 0 : g.z0 + k * h;
    xs.length = 0;
    for (const t of tris) {
      const o = 9 * t;
      const x1 = T[o] + c[0], y1 = T[o + 1] + c[1], z1 = T[o + 2] + c[2], x2 = T[o + 3] + c[0], y2 = T[o + 4] + c[1], z2 = T[o + 5] + c[2], x3 = T[o + 6] + c[0], y3 = T[o + 7] + c[1], z3 = T[o + 8] + c[2];
      // the row's line, along x at (y, z), through the triangle: barycentric in (y, z)
      const d = (y2 - y1) * (z3 - z1) - (z2 - z1) * (y3 - y1);
      if (Math.abs(d) < 1e-18) continue;
      const l2 = ((y - y1) * (z3 - z1) - (z - z1) * (y3 - y1)) / d, l3 = ((y2 - y1) * (z - z1) - (z2 - z1) * (y - y1)) / d, l1 = 1 - l2 - l3;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      xs.push(l1 * x1 + l2 * x2 + l3 * x3);
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    // crossings on an edge count twice: taken once
    const u = [xs[0]];
    for (let q = 1; q < xs.length; q++) if (xs[q] - u[u.length - 1] > 1e-7 * h) u.push(xs[q]);
    for (let q = 0; q + 1 < u.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((u[q] - g.x0) / h - 1e-9)), i1 = Math.min(g.nx - 1, Math.floor((u[q + 1] - g.x0) / h + 1e-9));
      for (let i = i0; i <= i1; i++) { mask[gIdx(g, i, j, k)] = value; n++; }
    }
  }
  return n;
}
