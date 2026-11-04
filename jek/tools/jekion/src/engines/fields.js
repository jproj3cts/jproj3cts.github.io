import { gGrad, gInterp, gNode } from '../core/grid.js';

/* ==========================================================================
   The fields from the solved arrays. Each electrode has its basis array (its potential at 1 V, the rest at 0);
   the electrodes' voltages, added up, are summed once into one static array, and the RF electrodes' amplitudes
   into one array for each frequency and phase in use, so the field at a point and time is the gradient of a
   few arrays rather than of every electrode's: E(p, t) = −∇Φ₀(p) − Σ cos(ω t + φ) ∇Φ_g(p), in V/mm.
   ========================================================================== */
/* the arrays for a set of electrodes' voltages: { stat, rf: [{ w, ph, A, mhz }] } (w in rad/µs) */
export function voltageGroups(g, basis, els) {
  const n = g.n, stat = new Float32Array(n), rf = new Map();
  els.forEach((el, k) => {
    const B = basis[k]; if (!B) return;
    if (el.V) for (let o = 0; o < n; o++) stat[o] += el.V * B[o];
    if (el.rf && el.rf.on && el.rf.amp) {
      const key = el.rf.mhz + '|' + el.rf.phase;
      let G = rf.get(key);
      if (!G) { G = { mhz: el.rf.mhz, w: 2 * Math.PI * el.rf.mhz, ph: el.rf.phase * Math.PI / 180, A: new Float32Array(n) }; rf.set(key, G); }
      for (let o = 0; o < n; o++) G.A[o] += el.rf.amp * B[o];
    }
  });
  return { stat, rf: [...rf.values()] };
}
/* the potential at a point and time, volts; NaN outside the array */
export function potentialAt(G, g, x, y, z, t) {
  let v = gInterp(g, G.stat, x, y, z);
  for (const R of G.rf) v += Math.cos(R.w * t + R.ph) * gInterp(g, R.A, x, y, z);
  return v;
}
const GR = [0, 0, 0];
/* the electric field at a point and time, V/mm, into out[0..2]; false outside the array */
export function eFieldAt(G, g, x, y, z, t, out) {
  if (!gGrad(g, G.stat, x, y, z, GR)) return false;
  out[0] = -GR[0]; out[1] = -GR[1]; out[2] = -GR[2];
  for (const R of G.rf) { const c = Math.cos(R.w * t + R.ph); gGrad(g, R.A, x, y, z, GR); out[0] -= c * GR[0]; out[1] -= c * GR[1]; out[2] -= c * GR[2]; }
  return true;
}
/* the static potential's and each RF group's second derivatives at the node nearest a point, by the five-point
   difference along each axis (an axis of symmetry reflects): { at: [x, y, z] of the node, dc: [fxx, fyy, fzz],
   rf: [{ mhz, w, f: [fxx, fyy, fzz] }] }, in V/mm²; a planar array has none along z */
export function curvatures(G, g, x, y, z) {
  const o = gNode(g, x, y, z);
  if (o < 0) return null;
  const i = o % g.nx, j = Math.floor(o / g.nx) % g.ny, k = Math.floor(o / (g.nx * g.ny)), h2 = g.h * g.h;
  const at = [g.x0 + i * g.h, g.y0 + j * g.h, g.z0 + k * g.h];
  if (g.sym === 'cyl') { at[1] = (g.y0 + j * g.h) * (y >= 0 ? 1 : -1); at[2] = 0; }
  const d2 = (A, ax) => {
    const n = [g.nx, g.ny, g.nz][ax], c = [i, j, k][ax], stride = [1, g.nx, g.nx * g.ny][ax];
    if (n === 1) return 0;
    const refl = ax === 1 && g.sym === 'cyl';
    const val = m => { let q = c + m; if (q < 0) q = refl ? -q : 0; if (q > n - 1) q = n - 1; return A[o + (q - c) * stride]; };
    if (n < 5) return (val(1) - 2 * val(0) + val(-1)) / h2;
    return (-val(-2) + 16 * val(-1) - 30 * val(0) + 16 * val(1) - val(2)) / (12 * h2);
  };
  return { at, dc: [0, 1, 2].map(ax => d2(G.stat, ax)), rf: G.rf.map(R => ({ mhz: R.mhz, w: R.w, ph: R.ph, f: [0, 1, 2].map(ax => d2(R.A, ax)) })) };
}
/* the potential along a line of n points from a to b (bench points), at time t */
export function potentialAlong(G, g, a, b, n, t) {
  const xs = [], vs = [];
  for (let i = 0; i < n; i++) { const f = i / (n - 1), p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; xs.push(f * Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])); vs.push(potentialAt(G, g, p[0], p[1], p[2], t)); }
  return { s: xs, v: vs };
}
