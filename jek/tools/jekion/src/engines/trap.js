import { AMU, QE, qmOf } from '../core/units.js';
import { curvatures, eFieldAt } from './fields.js';

/* ==========================================================================
   What a trap does to an ion at a point, from the curvature of the potentials there (engines/fields.js
   curvatures): the static potential's second derivatives give the Mathieu a parameters and, with no RF, the
   harmonic (or anti-trapping) frequencies; each RF group's amplitude array gives the q parameters; together
   the first-region stability and the secular frequencies, β ≈ √(a + q²/2) and ω = βΩ/2 (good for small a
   and q, as traps are run). With a magnetic field and no RF, the Penning frequencies: the cyclotron
   ω_c = qB/m, the axial ω_z from the curvature along B, the modified cyclotron and magnetron
   ω± = ω_c/2 ± √(ω_c²/4 − ω_z²/2), stable while ω_c² > 2ω_z². In planar symmetry there is nothing along z.
   ========================================================================== */
/* a symmetric 3×3 [xx, yy, zz, xy, xz, yz] diagonalised by Jacobi rotations: { vals, vecs } (vecs[i] the unit vector of vals[i]) */
export function eigSym3(H) {
  const M = [[H[0], H[3], H[4]], [H[3], H[1], H[5]], [H[4], H[5], H[2]]], V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0; for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += M[p][q] * M[p][q];
    if (off < 1e-30) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(M[p][q]) < 1e-300) continue;
      const th = (M[q][q] - M[p][p]) / (2 * M[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const a = M[k][p], b = M[k][q]; M[k][p] = c * a - s * b; M[k][q] = s * a + c * b; }
      for (let k = 0; k < 3; k++) { const a = M[p][k], b = M[q][k]; M[p][k] = c * a - s * b; M[q][k] = s * a + c * b; }
      for (let k = 0; k < 3; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; }
    }
  }
  return { vals: [M[0][0], M[1][1], M[2][2]], vecs: [0, 1, 2].map(i => [V[0][i], V[1][i], V[2][i]]) };
}
const quad = (H, v) => H[0] * v[0] * v[0] + H[1] * v[1] * v[1] + H[2] * v[2] * v[2] + 2 * (H[3] * v[0] * v[1] + H[4] * v[0] * v[2] + H[5] * v[1] * v[2]);
/* an axis's name: x, y or z when it lies along one, else its direction */
export function axisName(v, cyl) {
  const n = cyl ? ['x (axial)', 'r (radial)', 'z'] : ['x', 'y', 'z'];
  for (let i = 0; i < 3; i++) if (Math.abs(v[i]) > 0.98) return n[i];
  return '(' + v.map(c => (Math.abs(c) < 0.005 ? '0' : (+c.toFixed(2)).toString())).join(', ') + ')';
}
export function trapAnalysis(F, S, p, species, opts = {}) {
  const g = F.g, q = species.charge, m = species.mass, qm = qmOf(q, m);   // C/kg
  const C = curvatures(F.G, g, p[0], p[1], p[2]), E = [0, 0, 0];
  if (!C) return null;
  eFieldAt(F.G, g, C.at[0], C.at[1], C.at[2], 0, E);
  const B = S.bfield || { bx: 0, by: 0, bz: 0 }, Bmag = Math.hypot(B.bx || 0, B.by || 0, B.bz || 0);
  // the axes: with RF, the RF curvature's principal axes (the groups at one frequency added as phasors, in-phase
  // and quadrature, the larger taken with the in-phase sign); without, the static potential's. A planar array has
  // no z; a cylindrical one's y is the radius, and z is the same.
  const cyl = g.sym === 'cyl', dims = g.sym === '3d' ? 3 : 2;
  let rfH = null, rfW = 0, rfMHz = null;
  if (C.rf.length) {
    const byF = new Map();
    for (const R of C.rf) { let e = byF.get(R.mhz); if (!e) { e = { mhz: R.mhz, w: R.w, A: [0, 0, 0, 0, 0, 0], B: [0, 0, 0, 0, 0, 0] }; byF.set(R.mhz, e); } for (let i = 0; i < 6; i++) { e.A[i] += R.f[i] * Math.cos(R.ph || 0); e.B[i] += R.f[i] * Math.sin(R.ph || 0); } }
    const norm = H => Math.hypot(...H), best = [...byF.values()].reduce((a, b) => (Math.max(norm(b.A), norm(b.B)) > Math.max(norm(a.A), norm(a.B)) ? b : a));
    rfH = norm(best.A) >= norm(best.B) ? best.A : best.B.map((v, i) => (best.A[i] < 0 ? -v : v)); rfW = best.w * 1e6; rfMHz = best.mhz;
  }
  // along the trap's principal axes (the Hessian's eigenvectors), or along x, y and z as asked (a trap turned
  // against them then reads the curvature on each coordinate axis, which is what a drive set up along them sees)
  const xyz = (opts.axes || S.trapAxes) === 'xyz';
  const basis = xyz ? { vecs: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] } : eigSym3(rfH || C.dc), axes = [];
  for (let i = 0; i < 3; i++) {
    const v = basis.vecs[i];
    if (dims === 2 && Math.abs(v[2]) > 0.5) continue;            // the axis out of a planar or cylindrical array
    const dc = quad(C.dc, v) * 1e6;                               // V/m²
    const ax = { axis: axisName(v, cyl), dir: v, dc: quad(C.dc, v), a: null, q: null, beta: null, secMHz: null, harmMHz: null, stable: null };
    if (rfH) {
      ax.rfMHz = rfMHz;
      ax.a = 4 * qm * dc / (rfW * rfW);
      ax.q = -2 * qm * quad(rfH, v) * 1e6 / (rfW * rfW);
      const b2 = ax.a + ax.q * ax.q / 2;
      ax.beta = b2 > 0 ? Math.sqrt(b2) : 0;
      ax.stable = b2 > 0 && ax.beta < 1 && Math.abs(ax.q) < 0.908;
      ax.secMHz = ax.beta * rfMHz / 2;
    } else {
      const w2 = qm * dc;
      ax.harmMHz = w2 > 0 ? Math.sqrt(w2) / (2 * Math.PI) / 1e6 : null;
      ax.stable = w2 > 0;
    }
    axes.push(ax);
  }
  // in the order x-like, y-like, z-like, as the panels list them
  axes.sort((a, b) => [0, 1, 2].findIndex(i => Math.abs(a.dir[i]) === Math.max(...a.dir.map(Math.abs))) - [0, 1, 2].findIndex(i => Math.abs(b.dir[i]) === Math.max(...b.dir.map(Math.abs))));
  let penning = null;
  if (Bmag > 0 && !C.rf.length) {
    const bhat = [B.bx / Bmag, B.by / Bmag, B.bz / Bmag], wc = qm * Bmag * 1e-4;   // rad/s
    const fz = quad(C.dc, bhat) * 1e6;
    const wz2 = qm * fz, disc = wc * wc / 4 - wz2 / 2;
    penning = { cyclMHz: Math.abs(wc) / (2 * Math.PI) / 1e6, axialMHz: wz2 > 0 ? Math.sqrt(wz2) / (2 * Math.PI) / 1e6 : null, stable: wz2 > 0 && disc > 0,
      plusMHz: disc > 0 ? (Math.abs(wc) / 2 + Math.sqrt(disc)) / (2 * Math.PI) / 1e6 : null, minusMHz: disc > 0 ? (Math.abs(wc) / 2 - Math.sqrt(disc)) / (2 * Math.PI) / 1e6 : null };
  }
  // the RF pseudopotential's depth is not known from the centre alone; the field there should be small
  return { point: C.at, E: E.slice(), Emag: Math.hypot(...E), axes, penning, rf: C.rf.map(R => R.mhz), species: { mass: m, charge: q }, massKg: m * AMU, chargeC: q * QE };
}
