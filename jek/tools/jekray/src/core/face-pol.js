import { filmBC, stackAmp, mirrorR } from './coatings.js';
import { cabs2 } from './numeric.js';

/* ==========================================================================
   One face: what it does to light's two polarisations
   The bench's rays, its diffracted field and focus, the optical lens designer's polarisation trace and the RF
   designer's losses all take a face's amplitudes from here, so none of them can disagree with another.
   The tracer's convention throughout: fields as e^{+ikL}; s across the plane of incidence; p the in-plane
   normal to the ray with the parity sign, turned over at each reflection, so that r_p = r_s at normal incidence
   and a mirror is -√R for both. Transmitted amplitudes are normalised to power: |t|² is the share of the
   power the face passes (the field's t times √(n' cos θ' / n cos θ)), so |r|² + |t|² = 1 where nothing is
   absorbed. Each amplitude is [re, im].
   ========================================================================== */


/* a thin-film stack's amplitude transmission (the field's, not yet normalised to power), for s or p, light from
   n0 into ns at cosine c0; the layers as stackAmp takes them (index n, thickness d in nm, outside in) */
export function stackT(layers, n0, ns, c0, nm, pol) {
  const { Br, Bi, Cr, Ci, e0, es } = filmBC(layers, n0, ns, c0, nm, pol);
  const dr = e0 * Br + Cr, di = e0 * Bi + Ci, dd = dr * dr + di * di;
  if (!dd) return [0, 0];
  const t = [2 * e0 * dr / dd, -2 * e0 * di / dd];
  // p: the field's ratio, not the tangential component's (c0 over the cosine beyond, imaginary where the wave there is evanescent)
  if (pol === 's') return t;
  if (!es[3]) { const k = c0 / es[2]; return [t[0] * k, t[1] * k]; }
  const k = -c0 / es[3];
  return [-t[1] * k, t[0] * k];
}

/* A refracting face (bare, coated, a film splitter): light from index n1 into n2 meeting it at cosine ci (> 0) at
   nm. face: { coat } and, for a film splitter, { kind: 'split', Rs, Rp } (as the tracer's surfaces have them).
   Returns { rs, rp, ts, tp, tir }: tir when everything comes back (total internal reflection, or a splitter that
   passes nothing). Each case as the tracer has always traced it, and a coating's stack now passes its own phase. */
export function faceAmps(face, n1, n2, ci, nm) {
  const coat = face && face.coat, k = 1 - (n1 / n2) * (n1 / n2) * (1 - ci * ci);
  if (k < 0) {
    // total internal reflection: everything comes back, each component with its own phase
    const b = Math.sqrt(-k), phs = -2 * Math.atan2(n2 * b, n1 * ci), php = -2 * Math.atan2(n1 * b, n2 * ci) + Math.PI;
    return { rs: [Math.cos(phs), Math.sin(phs)], rp: [Math.cos(php), Math.sin(php)], ts: [0, 0], tp: [0, 0], tir: true };
  }
  const ct = Math.sqrt(k), norm = Math.sqrt(n2 * ct / (n1 * ci));
  // known by its reflectance alone: the reflected field leads the transmitted by a quarter wave, nothing absorbed
  const byR = (Rs, Rp) => ({ rs: [0, Math.sqrt(Rs)], rp: [0, Math.sqrt(Rp)], ts: [Math.sqrt(Math.max(0, 1 - Rs)), 0], tp: [Math.sqrt(Math.max(0, 1 - Rp)), 0], tir: Rs >= 1 && Rp >= 1 });
  if (face && face.kind === 'split') return byR(face.Rs, face.Rp);
  // bare: Fresnel's, real, so a sign change is half a wave (p in the parity convention, so r_p = r_s square on)
  const bare = () => ({
    rs: [(n1 * ci - n2 * ct) / (n1 * ci + n2 * ct), 0], rp: [(n1 * ct - n2 * ci) / (n2 * ci + n1 * ct), 0],
    ts: [2 * n1 * ci / (n1 * ci + n2 * ct) * norm, 0], tp: [2 * n1 * ci / (n2 * ci + n1 * ct) * norm, 0], tir: false });
  if (!coat || coat.mode === 'bare') return bare();
  // a mirror coating: reflected with its reflectance, nothing passed (the rest absorbed), a quarter wave on reflection as byR has it
  if (coat.mode === 'mirror') { const R = mirrorR(coat, nm), a = Math.sqrt(R); return { rs: [0, a], rp: [0, a], ts: [0, 0], tp: [0, 0], tir: true }; }
  if (coat.mode === 'band') { if (!(nm >= coat.lo && nm <= coat.hi)) return bare(); const R = coat.R / 100; return byR(R, R); }
  if (coat.mode === 'stack') {
    if (!coat.layers || !coat.layers.length) return bare();
    // the layers are listed from the outside in, so light through the substrate meets them in reverse
    const L = n1 > n2 ? coat.layers.slice().reverse() : coat.layers;
    const rs = stackAmp(L, n1, n2, ci, nm, 's'), rp = stackAmp(L, n1, n2, ci, nm, 'p');
    const ts = stackT(L, n1, n2, ci, nm, 's'), tp = stackT(L, n1, n2, ci, nm, 'p');
    // stackAmp's p is already the parity convention's: r_p = r_s square on, and a layer of nothing is a bare face
    return { rs, rp, ts: [ts[0] * norm, ts[1] * norm], tp: [tp[0] * norm, tp[1] * norm], tir: false };
  }
  const R = Math.max(0, Math.min(1, (coat.R || 0) / 100));
  return byR(R, R);
}

/* A mirror of reflectance R (0 to 1): -√R for s and p alike (the parity convention), √R met from behind (the
   other way up); what it does not reflect passes, as the tracer has it */
export function mirrorAmps(R, back) {
  const r = back ? Math.sqrt(R) : -Math.sqrt(R), t = Math.sqrt(Math.max(0, 1 - R));
  return { rs: [r, 0], rp: [r, 0], ts: [t, 0], tp: [t, 0], tir: false };
}

/* a face's power reflection square on (s and p alike there), as the RF designer and a graded disc count it */
export const faceRNormal = (n1, n2, nm, coat) => cabs2(faceAmps({ coat }, n1, n2, 1, nm).rs);
