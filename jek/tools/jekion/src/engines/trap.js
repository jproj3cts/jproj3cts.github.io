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
export function trapAnalysis(F, S, p, species) {
  const g = F.g, q = species.charge, m = species.mass, qm = qmOf(q, m);   // C/kg
  const C = curvatures(F.G, g, p[0], p[1], p[2]), E = [0, 0, 0];
  if (!C) return null;
  eFieldAt(F.G, g, C.at[0], C.at[1], C.at[2], 0, E);
  const B = S.bfield || { bx: 0, by: 0, bz: 0 }, Bmag = Math.hypot(B.bx || 0, B.by || 0, B.bz || 0);
  // a planar array has no z; a cylindrical one's y is the radius, and z is the same
  const names = g.sym === 'cyl' ? ['x (axial)', 'r (radial)', 'z'] : ['x', 'y', 'z'], axes = [];
  for (let i = 0; i < (g.sym === '3d' ? 3 : 2); i++) {
    const dc = C.dc[i] * 1e6;                       // V/m²
    const ax = { axis: names[i], dc: C.dc[i], a: null, q: null, beta: null, secMHz: null, harmMHz: null, stable: null };
    if (C.rf.length) {
      // the groups at one frequency add as phasors (rods at 0° and 180° are one quadrupole): the in-phase and
      // quadrature parts of the curvature, its size with the in-phase sign; the strongest frequency sets Ω
      const byF = new Map();
      for (const R of C.rf) { const ph = (R.ph || 0); let e = byF.get(R.mhz); if (!e) { e = { mhz: R.mhz, w: R.w, A: 0, B: 0 }; byF.set(R.mhz, e); } e.A += R.f[i] * Math.cos(ph); e.B += R.f[i] * Math.sin(ph); }
      const R = [...byF.values()].map(e => ({ mhz: e.mhz, w: e.w, f: (e.A < 0 ? -1 : 1) * Math.hypot(e.A, e.B) })).reduce((a, b) => (Math.abs(b.f) > Math.abs(a.f) ? b : a));
      const W = R.w * 1e6;   // rad/s
      ax.rfMHz = R.mhz;
      ax.a = 4 * qm * dc / (W * W);
      ax.q = -2 * qm * R.f * 1e6 / (W * W);
      const b2 = ax.a + ax.q * ax.q / 2;
      ax.beta = b2 > 0 ? Math.sqrt(b2) : 0;
      ax.stable = b2 > 0 && ax.beta < 1 && Math.abs(ax.q) < 0.908;
      ax.secMHz = ax.beta * R.mhz / 2;
    } else {
      const w2 = qm * dc;                           // rad²/s²
      ax.harmMHz = w2 > 0 ? Math.sqrt(w2) / (2 * Math.PI) / 1e6 : null;
      ax.stable = w2 > 0;
    }
    axes.push(ax);
  }
  let penning = null;
  if (Bmag > 0 && !C.rf.length) {
    const bhat = [B.bx / Bmag, B.by / Bmag, B.bz / Bmag], wc = qm * Bmag * 1e-4;   // rad/s
    let fz = 0; for (let i = 0; i < 3; i++) fz += bhat[i] * bhat[i] * (C.dc[i] || 0) * 1e6;
    const wz2 = qm * fz, disc = wc * wc / 4 - wz2 / 2;
    penning = { cyclMHz: Math.abs(wc) / (2 * Math.PI) / 1e6, axialMHz: wz2 > 0 ? Math.sqrt(wz2) / (2 * Math.PI) / 1e6 : null, stable: wz2 > 0 && disc > 0,
      plusMHz: disc > 0 ? (Math.abs(wc) / 2 + Math.sqrt(disc)) / (2 * Math.PI) / 1e6 : null, minusMHz: disc > 0 ? (Math.abs(wc) / 2 - Math.sqrt(disc)) / (2 * Math.PI) / 1e6 : null };
  }
  // the RF pseudopotential's depth is not known from the centre alone; the field there should be small
  return { point: C.at, E: E.slice(), Emag: Math.hypot(...E), axes, penning, rf: C.rf.map(R => R.mhz), species: { mass: m, charge: q }, massKg: m * AMU, chargeC: q * QE };
}
