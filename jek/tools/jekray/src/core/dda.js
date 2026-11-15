/* ==========================================================================
   The discrete dipole approximation: a particle of any shape as point dipoles on a cubic
   lattice, each polarised by the incident field and by every other dipole's field
   (Purcell and Pennypacker 1973; Draine, Astrophys. J. 333, 848 (1988)).
   Fields go as exp(-i w t); lengths in metres; k is the wave number in the medium and
   m = n + i kappa the particle's index relative to it. Units are the Gaussian ones the
   method is written in: a dipole p = alpha E with alpha a volume, its field
     E(r) = e^{ikr}/r [ k^2 (r^ x p) x r^ + (1 - ikr)/r^2 (3 r^ (r^.p) - p) ],
   so with E in V/m a far field is F e^{ikr}/r with F = k^2 (1 - r^r^) sum p_j e^{-ik r^.r_j}
   in volts, and cross-sections come out in m^2 whatever the unit of E.
   The polarisability is the lattice dispersion relation's (Draine and Goodman, Astrophys. J.
   405, 685 (1993)): the Clausius-Mossotti value corrected to order (kd)^2 so that an infinite
   lattice of these dipoles carries a wave of the material's own index, with the radiative
   reaction -(2/3) i (kd)^3. The equations (1/alpha) p_j - sum_{k != j} G_jk p_k = E_inc,j
   are solved by BiCGStab; the product is the direct one, O(N^2), each pair's tensor read from
   a table by the pair's lattice offset.
   Pure: nothing of the bench here.
   ========================================================================== */

export const DDA_SHAPES = ['sphere', 'cylinder', 'capsule', 'spheroid'];
/* a shape's volume (m^3): D its diameter, L its whole length along its axis (a sphere has only D) */
export function ddaVolume(shape, D, L) {
  if (shape === 'cylinder') return Math.PI / 4 * D * D * L;
  if (shape === 'capsule') { const c = Math.max(0, L - D); return Math.PI / 4 * D * D * c + Math.PI / 6 * D * D * D; }
  if (shape === 'spheroid') return Math.PI / 6 * D * D * L;
  return Math.PI / 6 * D * D * D;
}
/* whether a point of the body frame (z along the axis, the origin at the centre) is inside */
export function ddaInside(shape, D, L, x, y, z) {
  const a = D / 2, r2 = x * x + y * y;
  if (shape === 'cylinder') return r2 <= a * a && Math.abs(z) <= L / 2;
  if (shape === 'capsule') { const c = Math.max(0, L - D) / 2, dz = Math.max(0, Math.abs(z) - c); return r2 + dz * dz <= a * a; }
  if (shape === 'spheroid') return r2 / (a * a) + z * z / (L * L / 4) <= 1;
  return r2 + z * z <= a * a;
}
/* The lattice. The spacing asked for is d; the sites inside the shape are kept, and the
   spacing then set so that N d^3 is the shape's true volume (the shape's outline is the
   lattice's, a little jagged; its volume is exact). Returns { N, d, nx, ny, nz, ix, iy, iz }
   with the sites' whole-number places, and x, y, z their body-frame positions (m). */
export function ddaLattice(shape, D, L, d0) {
  const Lz = shape === 'sphere' ? D : L;
  const nx = Math.max(1, Math.round(D / d0)), nz = Math.max(1, Math.round(Lz / d0));
  // the lattice is centred on the body: sites at (i + 1/2 - n/2) d, d fitted to each extent
  const dx = D / nx, dz = Lz / nz, ix = [], iy = [], iz = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) {
    const x = (i + 0.5 - nx / 2) * dx, y = (j + 0.5 - nx / 2) * dx, z = (k + 0.5 - nz / 2) * dz;
    // (dx and dz differ by a rounding only: the test is made on the shape as drawn, the lattice then made cubic)
    if (ddaInside(shape, D, Lz, x, y, z)) { ix.push(i); iy.push(j); iz.push(k); }
  }
  const N = ix.length;
  if (!N) return { N: 1, d: Math.cbrt(ddaVolume(shape, D, Lz)), nx: 1, ny: 1, nz: 1, ix: Int32Array.of(0), iy: Int32Array.of(0), iz: Int32Array.of(0), x: Float64Array.of(0), y: Float64Array.of(0), z: Float64Array.of(0) };
  const d = Math.cbrt(ddaVolume(shape, D, Lz) / N);
  const X = new Float64Array(N), Y = new Float64Array(N), Z = new Float64Array(N);
  for (let q = 0; q < N; q++) { X[q] = (ix[q] + 0.5 - nx / 2) * d; Y[q] = (iy[q] + 0.5 - nx / 2) * d; Z[q] = (iz[q] + 0.5 - nz / 2) * d; }
  return { N, d, nx, ny: nx, nz, ix: Int32Array.from(ix), iy: Int32Array.from(iy), iz: Int32Array.from(iz), x: X, y: Y, z: Z };
}
/* The spacing for a run: |m| k d <= 0.5 (the phase across a cell, inside the material), and
   at least `across` dipoles over the smallest dimension so that its outline is drawn; no
   more than nMax dipoles, the spacing opened out to hold that. Returns the lattice with
   mkd, across (as made), coarse (|m| k d above 0.5, or fewer than 6 across) and capped. */
export function ddaPlan(shape, D, L, k, mAbs, opts) {
  const o = opts || {}, across = o.across || 12, nMax = o.nMax || 12000;
  const small = Math.min(D, shape === 'sphere' ? D : L), V = ddaVolume(shape, D, shape === 'sphere' ? D : L);
  let d = Math.min(0.5 / (mAbs * k), small / across), capped = false;
  if (V / (d * d * d) > nMax) { d = Math.cbrt(V / nMax); capped = true; }
  let lat = ddaLattice(shape, D, L, d);
  // (rounding the extents to whole cells can overshoot the cap a little: open out once more)
  for (let it = 0; it < 4 && lat.N > nMax * 1.05; it++) { d *= Math.cbrt(lat.N / nMax) * 1.01; lat = ddaLattice(shape, D, L, d); capped = true; }
  const mkd = mAbs * k * lat.d, got = small / lat.d;
  return Object.assign(lat, { mkd, across: got, capped, coarse: mkd > 0.5 + 1e-9 || got < 5.5 });
}
/* The polarisability of one cell, [re, im] (m^3). how: 'ldr' the lattice dispersion relation
   (dir the light's direction and pol its polarisation, unit vectors of the body frame; pol
   may be complex, [xr, xi, yr, yi, zr, zi]), 'cm' Clausius-Mossotti with the radiative
   reaction alone */
export function ddaAlpha(mr, mi, k, d, how, dir, pol) {
  const er = mr * mr - mi * mi, ei = 2 * mr * mi;                       // eps = m^2
  // (eps - 1) / (eps + 2)
  const nr = er - 1, ni = ei, dr = er + 2, di = ei, d2 = dr * dr + di * di;
  const cr = (nr * dr + ni * di) / d2, ci = (ni * dr - nr * di) / d2;
  const f = 3 * d * d * d / (4 * Math.PI), a0r = f * cr, a0i = f * ci;
  const kd = k * d;
  let qr = 0, qi = -(2 / 3) * kd * kd * kd;                              // the bracket's correction
  if (how !== 'cm') {
    let S = 0;
    if (dir && pol) for (let c = 0; c < 3; c++) S += dir[c] * dir[c] * (pol.length === 6 ? pol[2 * c] * pol[2 * c] + pol[2 * c + 1] * pol[2 * c + 1] : pol[c] * pol[c]);
    const b1 = -1.8915316, b2 = 0.1648469, b3 = -1.7700004;
    qr += (b1 + er * (b2 + b3 * S)) * kd * kd; qi += ei * (b2 + b3 * S) * kd * kd;
  }
  // alpha = a0 / (1 + (a0 / d^3) q)
  const sr = a0r / (d * d * d), si = a0i / (d * d * d);
  const br = 1 + sr * qr - si * qi, bi = sr * qi + si * qr, b2n = br * br + bi * bi;
  return [(a0r * br + a0i * bi) / b2n, (a0i * br - a0r * bi) / b2n];
}
/* every pair's tensor by lattice offset: 12 numbers an offset (xx, xy, xz, yy, yz, zz, each
   re and im), the offset (a, b, c) at ((c + nz - 1) sy + (b + ny - 1)) sx + (a + nx - 1) */
function ddaTable(lat, k) {
  const { nx, ny, nz, d } = lat, sx = 2 * nx - 1, sy = 2 * ny - 1, sz = 2 * nz - 1;
  const T = new Float64Array(12 * sx * sy * sz);
  let o = 0;
  for (let c = 1 - nz; c < nz; c++) for (let b = 1 - ny; b < ny; b++) for (let a = 1 - nx; a < nx; a++, o += 12) {
    if (!a && !b && !c) continue;
    const x = a * d, y = b * d, z = c * d, r = Math.sqrt(x * x + y * y + z * z), ux = x / r, uy = y / r, uz = z / r;
    const kr = k * r, er = Math.cos(kr) / r, ei = Math.sin(kr) / r;
    // e^{ikr}/r [ A (1 - uu) + B (3 uu - 1) ],  A = k^2,  B = (1 - ikr) / r^2
    const A = k * k, Br = 1 / (r * r), Bi = -kr / (r * r);
    const put = (q, uu, same) => {
      const tr = (same ? A * (1 - uu) : -A * uu) + Br * (3 * uu - (same ? 1 : 0)), ti = Bi * (3 * uu - (same ? 1 : 0));
      T[o + 2 * q] = er * tr - ei * ti; T[o + 2 * q + 1] = er * ti + ei * tr;
    };
    put(0, ux * ux, true); put(1, ux * uy, false); put(2, ux * uz, false); put(3, uy * uy, true); put(4, uy * uz, false); put(5, uz * uz, true);
  }
  return { T, sx, sy, sz };
}
/* A solver for one lattice: { lat, solve*(E, opts), apply(p, out) }.
   solve is a generator (so a long run can report and be stopped between steps): it yields
   { iter, resid } each iteration and returns { p, iters, resid, converged }. E and p are
   Float64Array(6 N): each dipole's x, y, z, re then im, in the body frame. */
export function ddaSolver(lat, k, alpha) {
  const N = lat.N, { T, sx, sy } = ddaTable(lat, k);
  const lin = new Int32Array(N), c0 = ((lat.nz - 1) * sy + (lat.ny - 1)) * sx + (lat.nx - 1);
  for (let j = 0; j < N; j++) lin[j] = (lat.iz[j] * sy + lat.iy[j]) * sx + lat.ix[j];
  const a2 = alpha[0] * alpha[0] + alpha[1] * alpha[1], ir = alpha[0] / a2, ii = -alpha[1] / a2;     // 1 / alpha
  // out = (1/alpha) p - sum G p
  const apply = (p, out) => {
    for (let j = 0; j < N; j++) {
      const lj = lin[j] + c0;
      let xr = 0, xi = 0, yr = 0, yi = 0, zr = 0, zi = 0;
      for (let q = 0; q < N; q++) {
        if (q === j) continue;
        const o = 12 * (lj - lin[q]), b = 6 * q;
        const pxr = p[b], pxi = p[b + 1], pyr = p[b + 2], pyi = p[b + 3], pzr = p[b + 4], pzi = p[b + 5];
        const g0 = T[o], g1 = T[o + 1], g2 = T[o + 2], g3 = T[o + 3], g4 = T[o + 4], g5 = T[o + 5], g6 = T[o + 6], g7 = T[o + 7], g8 = T[o + 8], g9 = T[o + 9], g10 = T[o + 10], g11 = T[o + 11];
        xr += g0 * pxr - g1 * pxi + g2 * pyr - g3 * pyi + g4 * pzr - g5 * pzi;
        xi += g0 * pxi + g1 * pxr + g2 * pyi + g3 * pyr + g4 * pzi + g5 * pzr;
        yr += g2 * pxr - g3 * pxi + g6 * pyr - g7 * pyi + g8 * pzr - g9 * pzi;
        yi += g2 * pxi + g3 * pxr + g6 * pyi + g7 * pyr + g8 * pzi + g9 * pzr;
        zr += g4 * pxr - g5 * pxi + g8 * pyr - g9 * pyi + g10 * pzr - g11 * pzi;
        zi += g4 * pxi + g5 * pxr + g8 * pyi + g9 * pyr + g10 * pzi + g11 * pzr;
      }
      const b = 6 * j;
      out[b] = ir * p[b] - ii * p[b + 1] - xr; out[b + 1] = ir * p[b + 1] + ii * p[b] - xi;
      out[b + 2] = ir * p[b + 2] - ii * p[b + 3] - yr; out[b + 3] = ir * p[b + 3] + ii * p[b + 2] - yi;
      out[b + 4] = ir * p[b + 4] - ii * p[b + 5] - zr; out[b + 5] = ir * p[b + 5] + ii * p[b + 4] - zi;
    }
    return out;
  };
  // <a, b> = sum conj(a) b
  const dot = (a, b) => { let r = 0, i = 0; for (let q = 0; q < a.length; q += 2) { r += a[q] * b[q] + a[q + 1] * b[q + 1]; i += a[q] * b[q + 1] - a[q + 1] * b[q]; } return [r, i]; };
  const nrm = a => { let s = 0; for (let q = 0; q < a.length; q++) s += a[q] * a[q]; return Math.sqrt(s); };
  const axpy = (y, a, x) => { for (let q = 0; q < y.length; q += 2) { y[q] += a[0] * x[q] - a[1] * x[q + 1]; y[q + 1] += a[0] * x[q + 1] + a[1] * x[q]; } };
  const div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1] || 1e-300; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  function* solveGen(E, opts) {
    const tol = (opts && opts.tol) || 1e-5, maxIter = (opts && opts.maxIter) || 400, M = 6 * N;
    const x = new Float64Array(M), r = Float64Array.from(E), bn = nrm(E) || 1;
    // start from a given answer (opts.x0: the last one, when the field has changed a little), or from each dipole alone in the
    // field: p = alpha E
    if (opts && opts.x0 && opts.x0.length === M) x.set(opts.x0);
    else for (let q = 0; q < M; q += 2) { x[q] = alpha[0] * E[q] - alpha[1] * E[q + 1]; x[q + 1] = alpha[0] * E[q + 1] + alpha[1] * E[q]; }
    const t = new Float64Array(M);
    apply(x, t);
    for (let q = 0; q < M; q++) r[q] = E[q] - t[q];
    const r0 = Float64Array.from(r), pv = new Float64Array(M), v = new Float64Array(M), s = new Float64Array(M);
    let rho = [1, 0], al = [1, 0], om = [1, 0], resid = nrm(r) / bn, iter = 0;
    while (resid > tol && iter < maxIter) {
      iter++;
      const rho1 = dot(r0, r);
      if (rho1[0] * rho1[0] + rho1[1] * rho1[1] < 1e-300) break;
      const beta = mul(div(rho1, rho), div(al, om));
      // pv = r + beta (pv - om v)
      for (let q = 0; q < M; q += 2) {
        const ar = pv[q] - (om[0] * v[q] - om[1] * v[q + 1]), ai = pv[q + 1] - (om[0] * v[q + 1] + om[1] * v[q]);
        pv[q] = r[q] + beta[0] * ar - beta[1] * ai; pv[q + 1] = r[q + 1] + beta[0] * ai + beta[1] * ar;
      }
      apply(pv, v);
      al = div(rho1, dot(r0, v));
      s.set(r); axpy(s, [-al[0], -al[1]], v);
      if (nrm(s) / bn <= tol) { axpy(x, al, pv); r.set(s); resid = nrm(r) / bn; yield { iter, resid }; break; }
      apply(s, t);
      const tt = dot(t, t);
      om = div(dot(t, s), tt);
      axpy(x, al, pv); axpy(x, om, s);
      r.set(s); axpy(r, [-om[0], -om[1]], t);
      rho = rho1;
      resid = nrm(r) / bn;
      yield { iter, resid };
    }
    return { p: x, iters: iter, resid, converged: resid <= tol };
  }
  return { lat, k, alpha, apply, solve: solveGen };
}
/* run a solve to its end without stopping */
export function ddaSolveNow(S, E, opts) {
  const g = S.solve(E, opts);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}
/* A plane wave on the lattice: E(r) = e0 e^{ik dir.r}, e0 = [xr, xi, yr, yi, zr, zi] */
export function ddaPlaneWave(lat, k, dir, e0) {
  const E = new Float64Array(6 * lat.N);
  for (let j = 0; j < lat.N; j++) {
    const ph = k * (dir[0] * lat.x[j] + dir[1] * lat.y[j] + dir[2] * lat.z[j]), c = Math.cos(ph), s = Math.sin(ph);
    for (let q = 0; q < 3; q++) { E[6 * j + 2 * q] = e0[2 * q] * c - e0[2 * q + 1] * s; E[6 * j + 2 * q + 1] = e0[2 * q] * s + e0[2 * q + 1] * c; }
  }
  return E;
}
/* The far field's amplitude F (volts for E in V/m) in each direction: dirs = Float64Array(3 n)
   of unit vectors (body frame), out Float64Array(6 n) */
export function ddaFar(lat, k, p, dirs, out) {
  const n = dirs.length / 3, F = out || new Float64Array(6 * n), N = lat.N, k2 = k * k;
  for (let i = 0; i < n; i++) {
    const ux = dirs[3 * i], uy = dirs[3 * i + 1], uz = dirs[3 * i + 2];
    let xr = 0, xi = 0, yr = 0, yi = 0, zr = 0, zi = 0;
    for (let j = 0; j < N; j++) {
      const ph = -k * (ux * lat.x[j] + uy * lat.y[j] + uz * lat.z[j]), c = Math.cos(ph), s = Math.sin(ph), b = 6 * j;
      xr += p[b] * c - p[b + 1] * s; xi += p[b] * s + p[b + 1] * c;
      yr += p[b + 2] * c - p[b + 3] * s; yi += p[b + 2] * s + p[b + 3] * c;
      zr += p[b + 4] * c - p[b + 5] * s; zi += p[b + 4] * s + p[b + 5] * c;
    }
    const dr = ux * xr + uy * yr + uz * zr, di = ux * xi + uy * yi + uz * zi;
    F[6 * i] = k2 * (xr - ux * dr); F[6 * i + 1] = k2 * (xi - ux * di);
    F[6 * i + 2] = k2 * (yr - uy * dr); F[6 * i + 3] = k2 * (yi - uy * di);
    F[6 * i + 4] = k2 * (zr - uz * dr); F[6 * i + 5] = k2 * (zi - uz * di);
  }
  return F;
}
/* What the dipoles take from the light and what they absorb, as areas times |E|^2 (divide by
   the incident |E0|^2 for cross-sections; times 1 / (2 Z) for powers):
     ext = 4 pi k sum Im(conj(E_inc) . p),  abs = 4 pi k sum |p|^2 (-Im(1/alpha) - (2/3) k^3) */
export function ddaExtAbs(k, alpha, E, p) {
  let ext = 0, p2 = 0;
  for (let q = 0; q < p.length; q += 2) { ext += E[q] * p[q + 1] - E[q + 1] * p[q]; p2 += p[q] * p[q] + p[q + 1] * p[q + 1]; }
  const a2 = alpha[0] * alpha[0] + alpha[1] * alpha[1], imInv = -alpha[1] / a2;
  return { ext: 4 * Math.PI * k * ext, abs: 4 * Math.PI * k * p2 * (-imInv - (2 / 3) * k * k * k) };
}
