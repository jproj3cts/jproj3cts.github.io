import { filterT } from '../core/crystals.js';
import { deg } from '../state/project.js';
import { faceAmps, mirrorAmps } from '../core/face-pol.js';
import { benchNms } from '../state/elements.js';
import { modJonesM } from './mods.js';

/* ---------- Polarisation at a surface ----------
   A surface's s and p amplitude coefficients for one branch, in the tracer's convention
   (e^{+ikL}, p along the in-plane normal to the ray with the parity sign), as a function of
   the cosine of the local angle of incidence: the same numbers the tracer uses for its
   rays, so the field and the rays cannot disagree. Returns [s re, s im, p re, p im]. */
export function polCoeff(ev, nm) {
  const s = ev.surf, mode = ev.mode;
  if (!s || mode === 'P' || mode === 'M') return () => [1, 0, 1, 0];
  const pick = F => (mode === 'R' ? [F.rs[0], F.rs[1], F.rp[0], F.rp[1]] : [F.ts[0], F.ts[1], F.tp[0], F.tp[1]]);
  if (s.kind === 'mirror') { const F = mirrorAmps(s.el.reflect / 100, ev.back); return () => pick(F); }   // from behind, the other way up (as the tracer)
  if (s.kind === 'split') { const F = faceAmps(s, 1, 1, 1, nm); return () => pick(F); }
  if (s.kind === 'filter') {
    const T = filterT(s.el, nm), r = ev.back ? Math.sqrt(1 - T) : -Math.sqrt(1 - T);
    return mode === 'R' ? () => [r, 0, r, 0] : () => [Math.sqrt(T), 0, Math.sqrt(T), 0];
  }
  if (s.kind === 'grating') return mode === 'R' ? () => [-1, 0, -1, 0] : () => [1, 0, 1, 0];
  const n1 = ev.nIn, n2 = ev.nOut;
  if (!(n1 > 0 && n2 > 0)) return () => [1, 0, 1, 0];
  // the face's own amplitudes (core/face-pol.js), as the tracer takes them; a graded disc's matching layer at the radius met
  if (s.coatAt) return (ci, u, v) => pick(faceAmps({ coat: s.coatAt(Math.hypot(u || 0, v || 0)) }, n1, n2, ci, nm));
  return ci => pick(faceAmps(s, n1, n2, ci, nm));
}
/* A waveplate's or polariser's Jones matrix in the (p, s) basis, as the tracer applies it:
   [[pp, ps], [sp, ss]], each [re, im] */
/* A polarisation part rolled about its axis (see setRoll): its own axis turned in the beam's frame,
   by -roll for light along its +x with p = d x s, the other way for light the other way or p turned
   over by a reflection */
export function jonesRoll(el, ldx, par) { return el.roll ? -(el.roll * deg) * (ldx >= 0 ? 1 : -1) * (par ? -1 : 1) : 0; }
// a Jones matrix in (p, s), its part turned by phi: R M R^T
export function rollJones(M, phi) {
  if (!phi) return M;
  const c = Math.cos(phi), s = Math.sin(phi), R = [[c, -s], [s, c]], out = [[null, null], [null, null]];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    let re = 0, im = 0;
    for (let k = 0; k < 2; k++) for (let l = 0; l < 2; l++) { const f = R[i][k] * R[j][l]; re += f * M[k][l][0]; im += f * M[k][l][1]; }
    out[i][j] = [re, im];
  }
  return out;
}
export function jonesOf(el) {
  if (el.mod) return modJonesM(el, benchNms()[0]);
  const th = el.axis * deg, c = Math.cos(th), sn = Math.sin(th);
  if (el.type === 'polariser') return [[[c * c, 0], [c * sn, 0]], [[c * sn, 0], [sn * sn, 0]]];
  const d = 2 * Math.PI * el.retard, er = Math.cos(d), ei = Math.sin(d), cc = c * c, ss = sn * sn, cs = c * sn;
  return [[[cc + ss * er, ss * ei], [cs * (1 - er), -cs * ei]], [[cs * (1 - er), -cs * ei], [ss + cc * er, cc * ei]]];
}
/* The 2x2 that takes a sample's (s, p) before a surface to (s, p) after it, in the field's
   convention. From the sample's own ray in (d), the normal (n) and ray out (d2): its local
   s direction d x n, its p directions either side, and its own coefficients; then the
   result read off in the beam's frame on the far side. At the beam's centre this is the
   tracer's own diagonal, so the two agree there. Returns [ss, sp, ps, pp], each [re, im]. */
export function polMatrix(coef, d, nrm, d2, eIn, eOut, cIn) {
  const M = new Float64Array(8);
  polMatrixTo(M, coef, d[0], d[1], d[2], nrm[0], nrm[1], nrm[2], d2[0], d2[1], d2[2], eIn, eOut, cIn[0], cIn[1], cIn[2]);
  return [[M[0], M[1]], [M[2], M[3]], [M[4], M[5]], [M[6], M[7]]];
}
const dot3s = (a0, a1, a2, b0, b1, b2) => a0 * b0 + a1 * b1 + a2 * b2;
/* The same, into M as [ss, sp, ps, pp], each re then im, from the vectors' components: no
   arrays, as the 2D surface step works it out for every sample */
export function polMatrixTo(M, coef, d0, d1, d2, n0, n1, n2, e0, e1, e2, eIn, eOut, c0, c1, c2, su, sv) {
  // the s direction, across the plane of incidence
  let s0 = d1 * n2 - d2 * n1, s1 = d2 * n0 - d0 * n2, s2 = d0 * n1 - d1 * n0;
  const L = Math.hypot(s0, s1, s2);
  if (L > 1e-9) { s0 = s0 / L; s1 = s1 / L; s2 = s2 / L; } else { s0 = 0; s1 = 0; s2 = 1; }
  if (s2 < 0) { s0 = -s0; s1 = -s1; s2 = -s2; }
  const gi = eIn.sg, go = eOut.sg;
  const pi0 = (s1 * d2 - s2 * d1) * gi, pi1 = (s2 * d0 - s0 * d2) * gi, pi2 = (s0 * d1 - s1 * d0) * gi;
  const po0 = (s1 * e2 - s2 * e1) * go, po1 = (s2 * e0 - s0 * e2) * go, po2 = (s0 * e1 - s1 * e0) * go;
  const c = coef(Math.abs(dot3s(d0, d1, d2, n0, n1, n2)), su, sv);
  const cs0 = c[0], cs1 = -c[1], cp0 = c[2], cp1 = -c[3];          // conjugated into the field's convention
  // The field is stored as its two components across the beam's axis; a ray tilted to that
  // axis carries a small part along it too, fixed by the field being square to the ray. Put
  // it back before the surface (bS, bP: what a unit s or p stored becomes in full), so the
  // tilt is not lost twice; after it, only the two components across are kept again.
  // (s stored along the beam's up axis, u: straight up but where the beam rises or goes up itself)
  const ui = eIn.u || [0, 0, 1], uo = eOut.u || [0, 0, 1];
  const cd = dot3s(c0, c1, c2, d0, d1, d2) || 1;
  const zd = dot3s(ui[0], ui[1], ui[2], d0, d1, d2) / cd, v = eIn.v, vd = dot3s(v[0], v[1], v[2], d0, d1, d2) / cd;
  const bS0 = ui[0] - zd * c0, bS1 = ui[1] - zd * c1, bS2 = ui[2] - zd * c2;
  const bP0 = v[0] - vd * c0, bP1 = v[1] - vd * c1, bP2 = v[2] - vd * c2;
  const w = eOut.v;
  const slz = dot3s(s0, s1, s2, uo[0], uo[1], uo[2]), poz = dot3s(po0, po1, po2, uo[0], uo[1], uo[2]);
  const slw = dot3s(s0, s1, s2, w[0], w[1], w[2]), pow = dot3s(po0, po1, po2, w[0], w[1], w[2]);
  const slS = dot3s(s0, s1, s2, bS0, bS1, bS2), piS = dot3s(pi0, pi1, pi2, bS0, bS1, bS2);
  const slP = dot3s(s0, s1, s2, bP0, bP1, bP2), piP = dot3s(pi0, pi1, pi2, bP0, bP1, bP2);
  let aS = slz * slS, aP = poz * piS;
  M[0] = cs0 * aS + cp0 * aP; M[1] = cs1 * aS + cp1 * aP;
  aS = slz * slP; aP = poz * piP;
  M[2] = cs0 * aS + cp0 * aP; M[3] = cs1 * aS + cp1 * aP;
  aS = slw * slS; aP = pow * piS;
  M[4] = cs0 * aS + cp0 * aP; M[5] = cs1 * aS + cp1 * aP;
  aS = slw * slP; aP = pow * piP;
  M[6] = cs0 * aS + cp0 * aP; M[7] = cs1 * aS + cp1 * aP;
}

