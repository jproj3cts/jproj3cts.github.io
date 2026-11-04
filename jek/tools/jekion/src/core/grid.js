/* ==========================================================================
   The potential array's grid: nodes h apart, over a box of the bench, in one of three symmetries. 'planar': the
   x–y plane, everything the same along z (electrodes extruded without end); 'cyl': the x axis is an axis of
   symmetry, y is the radius (nodes from r = 0 out to the array's edge); '3d': all three. Node (i, j, k) is at
   (x0 + ih, y0 + jh, z0 + kh) and index i + nx (j + ny k). Each face of the box has a boundary condition: 'open'
   (the field runs straight out: ∂φ/∂n = 0), 'ground' (φ = 0 there) or 'mirror' (a symmetry plane, ∂φ/∂n = 0;
   the same as open to the solver, named for what it means).
   ========================================================================== */
export const SYMS = { planar: 'Planar (x, y; the same along z)', cyl: 'Cylindrical (x the axis, y the radius)', '3d': 'Three dimensions' };
export const BCS = { open: 'Open (field continues)', ground: 'Grounded (0 V)', mirror: 'Mirror plane' };
export const FACES = ['xlo', 'xhi', 'ylo', 'yhi', 'zlo', 'zhi'];
export const MAX_NODES = 4e6;
/* the grid for the project's array settings: { sym, h, x0, x1, y0, y1, z0, z1, bc } */
export function makeGrid(G) {
  const h = Math.max(1e-4, G.h), nOf = (a, b) => Math.max(2, Math.round((b - a) / h) + 1);
  const sym = G.sym, nx = nOf(G.x0, G.x1);
  let ny, nz, y0 = G.y0, z0 = G.z0;
  if (sym === 'cyl') { ny = Math.max(2, Math.round(Math.max(G.y1, Math.abs(G.y0)) / h) + 1); nz = 1; y0 = 0; z0 = 0; }
  else if (sym === 'planar') { ny = nOf(G.y0, G.y1); nz = 1; z0 = 0; }
  else { ny = nOf(G.y0, G.y1); nz = nOf(G.z0, G.z1); }
  return { sym, h, nx, ny, nz, x0: G.x0, y0, z0, bc: Object.assign({ xlo: 'open', xhi: 'open', ylo: 'open', yhi: 'open', zlo: 'open', zhi: 'open' }, G.bc || {}), n: nx * ny * nz };
}
export const gIdx = (g, i, j, k) => i + g.nx * (j + g.ny * k);
/* the point in the grid's own coordinates: (x, y, z) for a 3D array, (x, y) for a planar one, (x, r) for a cylindrical */
export function gLocal(g, x, y, z, out) {
  out[0] = x;
  if (g.sym === 'cyl') { out[1] = Math.hypot(y, z); out[2] = 0; } else if (g.sym === 'planar') { out[1] = y; out[2] = 0; } else { out[1] = y; out[2] = z; }
  return out;
}
const L = [0, 0, 0];
/* is the point within the array? */
export function gInside(g, x, y, z) {
  gLocal(g, x, y, z, L);
  const u = (L[0] - g.x0) / g.h, v = (L[1] - g.y0) / g.h, w = (L[2] - g.z0) / g.h;
  return u >= 0 && u <= g.nx - 1 && v >= 0 && v <= g.ny - 1 && (g.nz === 1 || (w >= 0 && w <= g.nz - 1));
}
/* the nearest node's index, or -1 outside */
export function gNode(g, x, y, z) {
  gLocal(g, x, y, z, L);
  const i = Math.round((L[0] - g.x0) / g.h), j = Math.round((L[1] - g.y0) / g.h), k = g.nz === 1 ? 0 : Math.round((L[2] - g.z0) / g.h);
  if (i < 0 || i >= g.nx || j < 0 || j >= g.ny || k < 0 || k >= g.nz) return -1;
  return gIdx(g, i, j, k);
}
/* the cell a point is in and its place within it: the lower corner (i, j, k) and the fractions; null outside */
const CELL = { i: 0, j: 0, k: 0, fx: 0, fy: 0, fz: 0 };
export function gCell(g, x, y, z) {
  gLocal(g, x, y, z, L);
  const u = (L[0] - g.x0) / g.h, v = (L[1] - g.y0) / g.h, w = g.nz === 1 ? 0 : (L[2] - g.z0) / g.h;
  if (!(u >= 0 && u <= g.nx - 1 && v >= 0 && v <= g.ny - 1 && w >= 0 && w <= g.nz - 1)) return null;
  let i = Math.floor(u), j = Math.floor(v), k = Math.floor(w);
  if (i >= g.nx - 1) i = g.nx - 2; if (j >= g.ny - 1) j = g.ny - 2; if (g.nz > 1 && k >= g.nz - 1) k = g.nz - 2;
  CELL.i = i; CELL.j = j; CELL.k = k; CELL.fx = u - i; CELL.fy = v - j; CELL.fz = g.nz === 1 ? 0 : w - k;
  return CELL;
}
/* the array's value at a point, interpolated linearly in the cell; NaN outside */
export function gInterp(g, A, x, y, z) {
  const c = gCell(g, x, y, z); if (!c) return NaN;
  const o = gIdx(g, c.i, c.j, c.k), nx = g.nx, nxy = g.nx * g.ny, fx = c.fx, fy = c.fy;
  const a00 = A[o] + (A[o + 1] - A[o]) * fx, a10 = A[o + nx] + (A[o + nx + 1] - A[o + nx]) * fx, a0 = a00 + (a10 - a00) * fy;
  if (g.nz === 1) return a0;
  const q = o + nxy, b00 = A[q] + (A[q + 1] - A[q]) * fx, b10 = A[q + nx] + (A[q + nx + 1] - A[q + nx]) * fx, a1 = b00 + (b10 - b00) * fy;
  return a0 + (a1 - a0) * c.fz;
}
/* the gradient of the array at a point (the interpolant's own slope within the cell), per mm, as bench components
   in out[0..2]; false outside. A cylindrical array's radial slope is turned into y and z components. */
export function gGrad(g, A, x, y, z, out) {
  const c = gCell(g, x, y, z); if (!c) return false;
  const o = gIdx(g, c.i, c.j, c.k), nx = g.nx, nxy = g.nx * g.ny, fx = c.fx, fy = c.fy, fz = c.fz, h = g.h;
  const a = A[o], b = A[o + 1], cc = A[o + nx], d = A[o + nx + 1];
  let gx, gy, gz = 0;
  if (g.nz === 1) {
    gx = ((b - a) * (1 - fy) + (d - cc) * fy) / h;
    gy = ((cc - a) * (1 - fx) + (d - b) * fx) / h;
  } else {
    const q = o + nxy, e = A[q], f = A[q + 1], gg = A[q + nx], hh = A[q + nx + 1];
    gx = (((b - a) * (1 - fy) + (d - cc) * fy) * (1 - fz) + ((f - e) * (1 - fy) + (hh - gg) * fy) * fz) / h;
    gy = (((cc - a) * (1 - fx) + (d - b) * fx) * (1 - fz) + ((gg - e) * (1 - fx) + (hh - f) * fx) * fz) / h;
    const lo = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + cc * (1 - fx) * fy + d * fx * fy, hi = e * (1 - fx) * (1 - fy) + f * fx * (1 - fy) + gg * (1 - fx) * fy + hh * fx * fy;
    gz = (hi - lo) / h;
  }
  if (g.sym === 'cyl') {
    const r = Math.hypot(y, z);
    if (r > 1e-12) { out[0] = gx; out[1] = gy * y / r; out[2] = gy * z / r; } else { out[0] = gx; out[1] = 0; out[2] = 0; }
  } else { out[0] = gx; out[1] = gy; out[2] = gz; }
  return true;
}
/* a node's bench position (a cylindrical array's on the x–y plane, z = 0) */
export function gNodePos(g, idx) {
  const i = idx % g.nx, j = Math.floor(idx / g.nx) % g.ny, k = Math.floor(idx / (g.nx * g.ny));
  return [g.x0 + i * g.h, g.y0 + j * g.h, g.z0 + k * g.h];
}
