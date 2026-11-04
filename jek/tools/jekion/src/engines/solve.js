/* ==========================================================================
   The Laplace solver: the potential through the array when one electrode is at 1 V and the rest at 0, which,
   scaled by each electrode's voltage and added, is the potential for any set of voltages (superposition). Finite
   differences on the grid (core/grid.js), solved by geometric multigrid: red-black Gauss–Seidel smooths each
   level, the residual goes down to a grid twice as coarse, whose correction comes back up (a V-cycle), and the
   first guess comes from solving the coarsest grids first (full multigrid). A coarse node is fixed when any fine
   node it stands for is, so no electrode goes missing on the way down, however thin. Boundaries: 'ground' puts
   0 V beyond the edge, 'open' and 'mirror' reflect (∂φ/∂n = 0). In a cylindrical array the radial differences
   carry the 1/r term, and the axis its regular form. Everything here is pure: the worker and the Node tests run it.
   ========================================================================== */
const SWEEPS_PRE = 3, SWEEPS_POST = 3, SWEEPS_COARSEST = 60;
export const SOLVE_TOL = 2e-6, SOLVE_CYCLES = 60;

/* a level of the hierarchy: its grid, which nodes are fixed, and its scratch arrays */
function mkLevel(nx, ny, nz, sym, bc, fixed) {
  const n = nx * ny * nz;
  return { nx, ny, nz, sym, bc, fixed, n, phi: new Float64Array(n), rhs: new Float64Array(n), res: new Float64Array(n), fixVal: new Float64Array(n) };
}
const coarseN = n => (n > 3 ? ((n + 1) >> 1) : n);
/* the level twice as coarse: a coarse node is fixed when any fine node within one step of its position is */
function coarsen(L) {
  const nx = coarseN(L.nx), ny = coarseN(L.ny), nz = coarseN(L.nz), cx = nx < L.nx, cy = ny < L.ny, cz = nz < L.nz;
  const fixed = new Uint8Array(nx * ny * nz);
  for (let K = 0; K < nz; K++) for (let J = 0; J < ny; J++) for (let I = 0; I < nx; I++) {
    const i0 = cx ? Math.max(0, 2 * I - 1) : I, i1 = cx ? Math.min(L.nx - 1, 2 * I + 1) : I;
    const j0 = cy ? Math.max(0, 2 * J - 1) : J, j1 = cy ? Math.min(L.ny - 1, 2 * J + 1) : J;
    const k0 = cz ? Math.max(0, 2 * K - 1) : K, k1 = cz ? Math.min(L.nz - 1, 2 * K + 1) : K;
    let f = 0;
    for (let k = k0; k <= k1 && !f; k++) for (let j = j0; j <= j1 && !f; j++) for (let i = i0; i <= i1; i++) if (L.fixed[i + L.nx * (j + L.ny * k)]) { f = 1; break; }
    fixed[I + nx * (J + ny * K)] = f;
  }
  const C = mkLevel(nx, ny, nz, L.sym, L.bc, fixed);
  C.cx = cx; C.cy = cy; C.cz = cz;
  return C;
}
/* the hierarchy for a grid and its mask (electrode index, or -1): finest first */
export function buildLevels(g, mask) {
  const fixed = new Uint8Array(g.n);
  for (let i = 0; i < g.n; i++) fixed[i] = mask[i] >= 0 ? 1 : 0;
  const levels = [mkLevel(g.nx, g.ny, g.nz, g.sym, g.bc, fixed)];
  for (;;) {
    const L = levels[levels.length - 1];
    if (L.n <= 400 || (coarseN(L.nx) === L.nx && coarseN(L.ny) === L.ny && coarseN(L.nz) === L.nz)) break;
    levels.push(coarsen(L));
    if (levels.length > 12) break;
  }
  return levels;
}

/* one red-black Gauss–Seidel sweep of A φ = rhs on a level: A φ = Σ c_n (φ_n − φ), the h-free Laplacian */
function relax(L, phi, rhs) {
  const { nx, ny, nz, fixed } = L, cyl = L.sym === 'cyl', bc = L.bc;
  const gxlo = bc.xlo === 'ground', gxhi = bc.xhi === 'ground', gylo = bc.ylo === 'ground', gyhi = bc.yhi === 'ground', gzlo = bc.zlo === 'ground', gzhi = bc.zhi === 'ground';
  const nxy = nx * ny, hasZ = nz > 1;
  for (let colour = 0; colour < 2; colour++) {
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
      // radial coefficients for this row (unit for planar and 3D)
      let cp = 1, cm = 1;
      if (cyl) { if (j === 0) { cp = 4; cm = 0; } else { cp = 1 + 0.5 / j; cm = 1 - 0.5 / j; } }
      const row = nx * (j + ny * k);
      for (let i = (j + k + colour) & 1; i < nx; i += 2) {
        const o = row + i;
        if (fixed[o]) continue;
        let s = 0, cs = 0;
        // x
        if (i > 0) { s += phi[o - 1]; cs += 1; } else if (gxlo) cs += 1; else { s += phi[o + 1]; cs += 1; }
        if (i < nx - 1) { s += phi[o + 1]; cs += 1; } else if (gxhi) cs += 1; else { s += phi[o - 1]; cs += 1; }
        // y (the radius, in a cylindrical array: the axis at j = 0 has no inner neighbour)
        if (j > 0) { s += cm * phi[o - nx]; cs += cm; } else if (!cyl) { if (gylo) cs += 1; else { s += phi[o + nx]; cs += 1; } }
        if (j < ny - 1) { s += cp * phi[o + nx]; cs += cp; } else if (gyhi) cs += cp; else { s += cp * phi[o - nx]; cs += cp; }
        // z
        if (hasZ) {
          if (k > 0) { s += phi[o - nxy]; cs += 1; } else if (gzlo) cs += 1; else { s += phi[o + nxy]; cs += 1; }
          if (k < nz - 1) { s += phi[o + nxy]; cs += 1; } else if (gzhi) cs += 1; else { s += phi[o - nxy]; cs += 1; }
        }
        phi[o] = (s - rhs[o]) / cs;
      }
    }
  }
}
/* the residual rhs − A φ into res (0 at fixed nodes); returns its largest magnitude */
function residual(L, phi, rhs, res) {
  const { nx, ny, nz, fixed } = L, cyl = L.sym === 'cyl', bc = L.bc;
  const gxlo = bc.xlo === 'ground', gxhi = bc.xhi === 'ground', gylo = bc.ylo === 'ground', gyhi = bc.yhi === 'ground', gzlo = bc.zlo === 'ground', gzhi = bc.zhi === 'ground';
  const nxy = nx * ny, hasZ = nz > 1;
  let worst = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    let cp = 1, cm = 1;
    if (cyl) { if (j === 0) { cp = 4; cm = 0; } else { cp = 1 + 0.5 / j; cm = 1 - 0.5 / j; } }
    const row = nx * (j + ny * k);
    for (let i = 0; i < nx; i++) {
      const o = row + i;
      if (fixed[o]) { res[o] = 0; continue; }
      let s = 0, cs = 0;
      if (i > 0) { s += phi[o - 1]; cs += 1; } else if (gxlo) cs += 1; else { s += phi[o + 1]; cs += 1; }
      if (i < nx - 1) { s += phi[o + 1]; cs += 1; } else if (gxhi) cs += 1; else { s += phi[o - 1]; cs += 1; }
      if (j > 0) { s += cm * phi[o - nx]; cs += cm; } else if (!cyl) { if (gylo) cs += 1; else { s += phi[o + nx]; cs += 1; } }
      if (j < ny - 1) { s += cp * phi[o + nx]; cs += cp; } else if (gyhi) cs += cp; else { s += cp * phi[o - nx]; cs += cp; }
      if (hasZ) {
        if (k > 0) { s += phi[o - nxy]; cs += 1; } else if (gzlo) cs += 1; else { s += phi[o + nxy]; cs += 1; }
        if (k < nz - 1) { s += phi[o + nxy]; cs += 1; } else if (gzhi) cs += 1; else { s += phi[o - nxy]; cs += 1; }
      }
      const r = rhs[o] - (s - cs * phi[o]);
      res[o] = r;
      const a = r < 0 ? -r : r; if (a > worst) worst = a;
    }
  }
  return worst;
}
/* the fine residual onto the coarse grid, full weighting (and ×4: the coarse operator is for twice the spacing) */
function restrict(F, res, C, rhs) {
  const { nx, ny, nz } = C, cx = C.cx, cy = C.cy, cz = C.cz, fnx = F.nx, fny = F.ny, fnz = F.nz, fnxy = fnx * fny;
  const wx = cx ? [0.25, 0.5, 0.25] : [0, 1, 0], wy = cy ? [0.25, 0.5, 0.25] : [0, 1, 0], wz = cz ? [0.25, 0.5, 0.25] : [0, 1, 0];
  for (let K = 0; K < nz; K++) for (let J = 0; J < ny; J++) for (let I = 0; I < nx; I++) {
    const O = I + nx * (J + ny * K);
    if (C.fixed[O]) { rhs[O] = 0; continue; }
    const ci = cx ? 2 * I : I, cj = cy ? 2 * J : J, ck = cz ? 2 * K : K;
    let s = 0, w = 0;
    for (let dk = -1; dk <= 1; dk++) { const k = ck + dk; if (wz[dk + 1] === 0 || k < 0 || k >= fnz) continue;
      for (let dj = -1; dj <= 1; dj++) { const j = cj + dj; if (wy[dj + 1] === 0 || j < 0 || j >= fny) continue;
        for (let di = -1; di <= 1; di++) { const i = ci + di; if (wx[di + 1] === 0 || i < 0 || i >= fnx) continue;
          const ww = wx[di + 1] * wy[dj + 1] * wz[dk + 1]; s += ww * res[i + fnx * j + fnxy * k]; w += ww; } } }
    rhs[O] = w > 0 ? 4 * s / w : 0;
  }
}
/* the coarse correction (or solution) onto the fine grid, linear interpolation, into the free fine nodes (added, or set) */
function prolong(C, e, F, phi, set) {
  const { nx, ny, nz, fixed } = F, cnx = C.nx, cny = C.ny, cnz = C.nz, cnxy = cnx * cny;
  const sx = C.cx ? 0.5 : 1, sy = C.cy ? 0.5 : 1, sz = C.cz ? 0.5 : 1;
  for (let k = 0; k < nz; k++) {
    const wk = k * sz, k0 = Math.min(cnz - 1, Math.floor(wk)), k1 = Math.min(cnz - 1, k0 + 1), fk = wk - Math.floor(wk);
    for (let j = 0; j < ny; j++) {
      const wj = j * sy, j0 = Math.min(cny - 1, Math.floor(wj)), j1 = Math.min(cny - 1, j0 + 1), fj = wj - Math.floor(wj);
      const row = nx * (j + ny * k);
      for (let i = 0; i < nx; i++) {
        const o = row + i;
        if (fixed[o]) continue;
        const wi = i * sx, i0 = Math.min(cnx - 1, Math.floor(wi)), i1 = Math.min(cnx - 1, i0 + 1), fi = wi - Math.floor(wi);
        const a = (1 - fi) * e[i0 + cnx * j0 + cnxy * k0] + fi * e[i1 + cnx * j0 + cnxy * k0], b = (1 - fi) * e[i0 + cnx * j1 + cnxy * k0] + fi * e[i1 + cnx * j1 + cnxy * k0];
        let v = (1 - fj) * a + fj * b;
        if (fk > 0) { const c2 = (1 - fi) * e[i0 + cnx * j0 + cnxy * k1] + fi * e[i1 + cnx * j0 + cnxy * k1], d = (1 - fi) * e[i0 + cnx * j1 + cnxy * k1] + fi * e[i1 + cnx * j1 + cnxy * k1]; v = (1 - fk) * v + fk * ((1 - fj) * c2 + fj * d); }
        if (set) phi[o] = v; else phi[o] += v;
      }
    }
  }
}
/* one V-cycle on level l of the hierarchy, improving phi for the given rhs; returns the residual before it */
function vcycle(levels, l, phi, rhs) {
  const L = levels[l];
  if (l === levels.length - 1) { for (let s = 0; s < SWEEPS_COARSEST; s++) relax(L, phi, rhs); return 0; }
  for (let s = 0; s < SWEEPS_PRE; s++) relax(L, phi, rhs);
  const worst = residual(L, phi, rhs, L.res);
  const C = levels[l + 1];
  restrict(L, L.res, C, C.rhs);
  C.phi.fill(0);
  vcycle(levels, l + 1, C.phi, C.rhs);
  if (l + 1 < levels.length - 1) vcycle(levels, l + 1, C.phi, C.rhs);     // twice below the top: a W-cycle, which takes the embedded electrodes better
  prolong(C, C.phi, L, phi, false);
  for (let s = 0; s < SWEEPS_POST; s++) relax(L, phi, rhs);
  return worst;
}
/* the fixed nodes' values on each coarse level: the mean of the fine fixed nodes each stands for */
function fixValsDown(levels) {
  for (let l = 1; l < levels.length; l++) {
    const F = levels[l - 1], C = levels[l], { nx, ny, nz } = C, fnx = F.nx, fny = F.ny, fnz = F.nz;
    for (let K = 0; K < nz; K++) for (let J = 0; J < ny; J++) for (let I = 0; I < nx; I++) {
      const O = I + nx * (J + ny * K);
      if (!C.fixed[O]) { C.fixVal[O] = 0; continue; }
      const i0 = C.cx ? Math.max(0, 2 * I - 1) : I, i1 = C.cx ? Math.min(fnx - 1, 2 * I + 1) : I, j0 = C.cy ? Math.max(0, 2 * J - 1) : J, j1 = C.cy ? Math.min(fny - 1, 2 * J + 1) : J, k0 = C.cz ? Math.max(0, 2 * K - 1) : K, k1 = C.cz ? Math.min(fnz - 1, 2 * K + 1) : K;
      let s = 0, n = 0;
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const o = i + fnx * (j + fny * k); if (F.fixed[o]) { s += F.fixVal[o]; n++; } }
      C.fixVal[O] = n ? s / n : 0;
    }
  }
}
/* The potential with the finest level's fixed nodes at fixVal (1 on the electrode solved for, 0 on the others), as a
   job that steps: solveStart does the full multigrid from the coarsest level up, then each step() is a V-cycle, true
   when the residual is within tol (or the cycles run out); result() gives { phi: Float32Array, cycles, residual,
   converged }. solveLevels runs it straight through. */
export function solveStart(levels, opts = {}) {
  const tol = opts.tol || SOLVE_TOL, maxCycles = opts.cycles || SOLVE_CYCLES;
  fixValsDown(levels);
  const top = levels.length - 1;
  for (let l = top; l >= 0; l--) {
    const L = levels[l];
    L.rhs.fill(0);
    if (l === top) { for (let o = 0; o < L.n; o++) L.phi[o] = L.fixed[o] ? L.fixVal[o] : 0; for (let s = 0; s < SWEEPS_COARSEST * 4; s++) relax(L, L.phi, L.rhs); continue; }
    const C = levels[l + 1];
    prolong(C, C.phi, L, L.phi, true);
    for (let o = 0; o < L.n; o++) if (L.fixed[o]) L.phi[o] = L.fixVal[o];
    if (l > 0) vcycle(levels, l, L.phi, L.rhs);
  }
  const F = levels[0], phi = F.phi;
  // FMG filled every level's phi on the way: the finest keeps its own, the coarser ones are scratch from here
  let r = residual(F, phi, F.rhs, F.res), cycles = 0;
  return {
    get residual() { return r; }, get cycles() { return cycles; },
    step() {
      if (r <= tol || cycles >= maxCycles) return true;
      vcycle(levels, 0, phi, F.rhs);
      r = residual(F, phi, F.rhs, F.res);
      cycles++;
      return r <= tol || cycles >= maxCycles;
    },
    result() { return { phi: Float32Array.from(phi), cycles, residual: r, converged: r <= tol }; },
  };
}
export function solveLevels(levels, opts = {}) {
  const J = solveStart(levels, opts);
  while (!J.step()) if (opts.onCycle && opts.onCycle(J.residual, J.cycles) === false) break;
  return J.result();
}
/* the finest level's fixed values set for electrode k of the mask */
export function setElectrodeValues(levels, mask, k) {
  const F = levels[0];
  for (let o = 0; o < F.n; o++) F.fixVal[o] = mask[o] === k ? 1 : 0;
}
/* the largest residual of a solution on the finest level (the tests read it) */
export function checkResidual(levels, phi) {
  const F = levels[0], p = Float64Array.from(phi); F.rhs.fill(0);
  return residual(F, p, F.rhs, F.res);
}
