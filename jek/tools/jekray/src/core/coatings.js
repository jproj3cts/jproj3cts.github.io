/* ---------- Thin-film stacks ----------
   Characteristic matrix method: each layer contributes a 2x2 matrix in its tilted
   admittance, and the stack gives the complex amplitude reflection for s and p. */
export const COAT_MATERIALS = [
  ['1.38', 'MgF2 (1.38)'], ['1.46', 'SiO2 (1.46)'], ['1.63', 'Al2O3 (1.63)'],
  ['1.70', 'Mid index (1.70)'], ['2.05', 'ZrO2 (2.05)'], ['2.10', 'Ta2O5 (2.10)'], ['2.30', 'TiO2 (2.30)'],
];
export function qwot(n, design) { return design / (4 * n); }
export function coatPreset(kind, design) {
  const q = n => ({ n, d: qwot(n, design) });
  if (kind === 'mgf2') return [q(1.38)];
  if (kind === 'vcoat') return [q(1.38), q(1.70)];        // low index outermost
  if (kind === 'bs5050') return [q(2.10), q(1.46), q(2.10)];
  if (kind === 'hr') {
    const out = [];
    for (let i = 0; i < 6; i++) { out.push(q(2.10), q(1.46)); }
    out.push(q(2.10));
    return out;
  }
  return [];
}
/* A layer's characteristic matrix, [[C, i X], [i Y, C]] with C, X and Y real, for index n and thickness d (nm) at
   nm, n0 sin(theta0) = sin0 given: [cos d, sin d / eta, eta sin d] where the wave runs through it; beyond its critical
   angle its cosine is imaginary (the wave evanescent), d = i b and eta imaginary, and the matrix [cosh b, ±sinh b / |eta|,
   ∓|eta| sinh b] (the same on either branch of the cosine) */
export function filmLayer(n, d, sin0, nm, pol) {
  const q = 1 - (sin0 / n) * (sin0 / n);
  if (q >= 0) {
    const ct = Math.sqrt(Math.max(1e-12, q)), e = pol === 's' ? n * ct : n / ct;
    const ph = 2 * Math.PI * n * d * ct / nm, sn = Math.sin(ph);           // layer thickness in nm, like the wavelength
    return [Math.cos(ph), sn / e, e * sn];
  }
  const b = Math.sqrt(-q), sh = Math.sinh(2 * Math.PI * n * d * b / nm), g = pol === 's' ? n * b : n / b;
  return [Math.cosh(2 * Math.PI * n * d * b / nm), pol === 's' ? sh / g : -sh / g, pol === 's' ? -g * sh : g * sh];
}
/* a medium's tilted admittance, [re, im], and its cosine of angle: real where the wave runs in it, else imaginary on
   the branch whose field decays away from the stack (the matrix's convention, e^{-ikz}: cos = -i |cos|) */
export function filmAdmit(n, sin0, pol) {
  const q = 1 - (sin0 / n) * (sin0 / n);
  if (q >= 0) { const ct = Math.sqrt(Math.max(1e-12, q)); return [pol === 's' ? n * ct : n / ct, 0, ct, 0]; }
  const b = Math.sqrt(-q);
  return pol === 's' ? [0, -n * b, 0, -b] : [0, n / b, 0, -b];
}
/* the stack's matrix times [1, eta_s]: [B, C], each [re, im], and the two media's admittances */
export function filmBC(layers, n0, ns, ci, nmWave, pol) {
  const sin0 = Math.sqrt(Math.max(0, 1 - ci * ci)) * n0;   // n0 sin(theta0), invariant
  let m11r = 1, m11i = 0, m12r = 0, m12i = 0, m21r = 0, m21i = 0, m22r = 1, m22i = 0;
  for (const L of layers) {
    // times the layer's [[c, i x], [i y, c]]
    const [c, x, y] = filmLayer(L.n, L.d, sin0, nmWave, pol);
    const n11r = m11r * c - m12i * y, n11i = m11i * c + m12r * y;
    const n12r = -m11i * x + m12r * c, n12i = m11r * x + m12i * c;
    const n21r = m21r * c - m22i * y, n21i = m21i * c + m22r * y;
    const n22r = -m21i * x + m22r * c, n22i = m21r * x + m22i * c;
    m11r = n11r; m11i = n11i; m12r = n12r; m12i = n12i; m21r = n21r; m21i = n21i; m22r = n22r; m22i = n22i;
  }
  const es = filmAdmit(ns, sin0, pol), e0 = filmAdmit(n0, sin0, pol);
  const Br = m11r + m12r * es[0] - m12i * es[1], Bi = m11i + m12i * es[0] + m12r * es[1];
  const Cr = m21r + m22r * es[0] - m22i * es[1], Ci = m21i + m22i * es[0] + m22r * es[1];
  return { Br, Bi, Cr, Ci, e0: e0[0], es };
}
/* Complex amplitude reflection of a stack, for one polarisation.
   n0 is the medium the ray is in (the wave running in it), ns the one beyond, ci the cosine of incidence. */
export function stackAmp(layers, n0, ns, ci, nmWave, pol) {
  const { Br, Bi, Cr, Ci, e0 } = filmBC(layers, n0, ns, ci, nmWave, pol);
  const numR = e0 * Br - Cr, numI = e0 * Bi - Ci;
  const denR = e0 * Br + Cr, denI = e0 * Bi + Ci;
  const dd = denR * denR + denI * denI;
  if (!dd) return [0, 0];
  return [(numR * denR + numI * denI) / dd, (numI * denR - numR * denI) / dd];
}
/* ---------- Mirror coatings ----------
   A mirror-coated face reflects and passes nothing: an ideal mirror reflects all of it; a metal reflects as its
   kind does by wavelength (typical protected coatings: aluminium's dip near 850 nm, silver's fall below 400 nm,
   gold's below 600 nm), the rest absorbed. Reflectance by wavelength in nm, interpolated. */
export const MIRROR_METALS = { ideal: 'Ideal (100%)', Al: 'Aluminium', Ag: 'Silver', Au: 'Gold' };
const METAL_R = {
  Al: [[200, 0.92], [400, 0.92], [500, 0.915], [600, 0.91], [700, 0.89], [800, 0.865], [850, 0.86], [900, 0.89], [1000, 0.94], [1200, 0.96], [1550, 0.97], [2000, 0.975], [5000, 0.98], [20000, 0.985]],
  Ag: [[300, 0.15], [320, 0.3], [350, 0.75], [400, 0.93], [450, 0.96], [500, 0.97], [600, 0.98], [700, 0.985], [1000, 0.99], [1550, 0.99], [20000, 0.99]],
  Au: [[300, 0.3], [400, 0.38], [450, 0.4], [500, 0.5], [550, 0.8], [600, 0.92], [650, 0.95], [700, 0.97], [800, 0.98], [1000, 0.985], [1550, 0.99], [20000, 0.99]],
};
export function mirrorR(coat, nm) {
  const T = coat && METAL_R[coat.metal];
  if (!T) return 1;
  if (nm <= T[0][0]) return T[0][1]; if (nm >= T[T.length - 1][0]) return T[T.length - 1][1];
  for (let i = 1; i < T.length; i++) if (nm <= T[i][0]) { const [a, ra] = T[i - 1], [b, rb] = T[i]; return ra + (rb - ra) * (nm - a) / (b - a); }
  return 1;
}
/* a surface's reflectance square to it (0 to 1), light going from index n1 into n2 at nm, its coating as the
   bench traces it: bare glass by Fresnel, a stack by its layers (met in reverse from the glass side), a band
   coating its R inside its band and bare outside, any other its R */
export function coatR(coat, n1, n2, nm) {
  const bare = ((n1 - n2) / (n1 + n2)) ** 2;
  if (!coat || coat.mode === 'bare') return bare;
  if (coat.mode === 'mirror') return mirrorR(coat, nm);
  if (coat.mode === 'band') return nm >= coat.lo && nm <= coat.hi ? coat.R / 100 : bare;
  if (coat.mode === 'stack') {
    if (!coat.layers || !coat.layers.length) return bare;
    const r = stackAmp(n1 > n2 ? coat.layers.slice().reverse() : coat.layers, n1, n2, 1, nm, 's');
    return r[0] * r[0] + r[1] * r[1];
  }
  return (coat.R || 0) / 100;
}
