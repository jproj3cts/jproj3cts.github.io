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
/* the nodes of a CAD body: T its triangles (9 numbers each) about the centre c. Rows of nodes are cast along each axis in
   turn; along a row the triangles' crossings are counted with their facing (the winding number), so a doubled face or a
   shared edge does not break the fill, and the rows run a hair off the nodes so a face or an edge lying exactly on them
   is not met head on. A node is inside when the casts along two of the three axes say so (a planar array has one
   axis across it; a cylindrical one paints its half plane). */
export function paintMesh(g, mask, T, c, value) {
  const nT = Math.floor(T.length / 9);
  if (!nT) return 0;
  const dims = g.nz === 1 ? [0, 1] : [0, 1, 2], votes = new Uint8Array(g.n);
  for (const ax of dims) castAlong(g, votes, T, c, ax);
  const need = g.nz === 1 ? 1 : 2;
  let n = 0;
  for (let o = 0; o < g.n; o++) if (votes[o] >= need) { mask[o] = value; n++; }
  return n;
}
/* one vote for every node a cast along axis ax finds inside: the rows at the nodes of the other two axes */
function castAlong(g, votes, T, c, ax) {
  const h = g.h, nT = Math.floor(T.length / 9), N = [g.nx, g.ny, g.nz], O = [g.x0, g.y0, g.z0];
  const bx = (ax + 1) % 3, cx = (ax + 2) % 3;           // the row's two fixed coordinates
  const stride = [1, g.nx, g.nx * g.ny];
  // the rows a hair off the nodes, so a face or an edge on a node is not met head on
  const eb = 0.37e-3 * h, ec = 0.61e-3 * h;
  const buckets = new Map(), nb = N[bx], nc = N[cx];
  for (let t = 0; t < nT; t++) {
    const o = 9 * t, lo = [1e300, 1e300, 1e300], hi = [-1e300, -1e300, -1e300];
    for (let v = 0; v < 3; v++) for (let q = 0; q < 3; q++) { const x = T[o + 3 * v + q] + c[q]; if (x < lo[q]) lo[q] = x; if (x > hi[q]) hi[q] = x; }
    if (g.nz === 1 && g.sym === 'planar' && (lo[2] > 0 || hi[2] < 0)) continue;
    let j0 = Math.ceil((lo[bx] - O[bx] - eb) / h - 1e-9), j1 = Math.floor((hi[bx] - O[bx] - eb) / h + 1e-9), k0 = Math.ceil((lo[cx] - O[cx] - ec) / h - 1e-9), k1 = Math.floor((hi[cx] - O[cx] - ec) / h + 1e-9);
    if (N[cx] === 1) { k0 = 0; k1 = 0; }
    j0 = Math.max(0, j0); j1 = Math.min(nb - 1, j1); k0 = Math.max(0, k0); k1 = Math.min(nc - 1, k1);
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) { const key = j + nb * k; let b = buckets.get(key); if (!b) { b = []; buckets.set(key, b); } b.push(t); }
  }
  const xs = [], ws = [];
  for (const [key, tris] of buckets) {
    const j = key % nb, k = Math.floor(key / nb), yb = O[bx] + j * h + eb, zc = N[cx] === 1 ? (g.sym === 'planar' ? 0 : 0) + ec : O[cx] + k * h + ec;
    xs.length = 0; ws.length = 0;
    for (const t of tris) {
      const o = 9 * t, P = [[T[o] + c[0], T[o + 1] + c[1], T[o + 2] + c[2]], [T[o + 3] + c[0], T[o + 4] + c[1], T[o + 5] + c[2]], [T[o + 6] + c[0], T[o + 7] + c[1], T[o + 8] + c[2]]];
      const y1 = P[0][bx], z1 = P[0][cx], y2 = P[1][bx], z2 = P[1][cx], y3 = P[2][bx], z3 = P[2][cx];
      const d = (y2 - y1) * (z3 - z1) - (z2 - z1) * (y3 - y1);
      if (Math.abs(d) < 1e-18) continue;
      const l2 = ((yb - y1) * (z3 - z1) - (zc - z1) * (y3 - y1)) / d, l3 = ((y2 - y1) * (zc - z1) - (z2 - z1) * (yb - y1)) / d, l1 = 1 - l2 - l3;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      xs.push(l1 * P[0][ax] + l2 * P[1][ax] + l3 * P[2][ax]); ws.push(d > 0 ? 1 : -1);    // the facing: the triangle's normal along the row
    }
    if (xs.length < 2) continue;
    const idx = xs.map((x, q) => q).sort((a, b) => xs[a] - xs[b]);
    let w = 0;
    for (let q = 0; q + 1 < idx.length; q++) {
      w += ws[idx[q]];
      if (w === 0) continue;
      const a = xs[idx[q]], b = xs[idx[q + 1]];
      const i0 = Math.max(0, Math.ceil((a - O[ax]) / h - 1e-9)), i1 = Math.min(N[ax] - 1, Math.floor((b - O[ax]) / h + 1e-9));
      for (let i = i0; i <= i1; i++) {
        const node = ax === 0 ? i + stride[1] * j + stride[2] * k : ax === 1 ? j + stride[1] * i + stride[2] * k : j + stride[1] * k + stride[2] * i;
        votes[node]++;
      }
    }
  }
}
