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
/* Complex amplitude reflection of a stack, for one polarisation.
   n0 is the medium the ray is in, ns the one beyond, ci the cosine of incidence. */
export function stackAmp(layers, n0, ns, ci, nmWave, pol) {
  const sin0 = Math.sqrt(Math.max(0, 1 - ci * ci)) * n0;   // n0 sin(theta0), invariant
  const cosIn = n => Math.sqrt(Math.max(1e-12, 1 - (sin0 / n) * (sin0 / n)));
  const eta = n => (pol === 's' ? n * cosIn(n) : n / cosIn(n));
  let m11r = 1, m11i = 0, m12r = 0, m12i = 0, m21r = 0, m21i = 0, m22r = 1, m22i = 0;
  for (const L of layers) {
    const ct = cosIn(L.n);
    const d = 2 * Math.PI * L.n * L.d * ct / nmWave;       // layer thickness in nm, like the wavelength
    const c = Math.cos(d), sn = Math.sin(d), e = eta(L.n);
    // layer matrix [[c, i sn/e], [i e sn, c]]
    const a11r = c, a11i = 0, a12r = 0, a12i = sn / e, a21r = 0, a21i = e * sn, a22r = c, a22i = 0;
    const n11r = m11r * a11r - m11i * a11i + m12r * a21r - m12i * a21i;
    const n11i = m11r * a11i + m11i * a11r + m12r * a21i + m12i * a21r;
    const n12r = m11r * a12r - m11i * a12i + m12r * a22r - m12i * a22i;
    const n12i = m11r * a12i + m11i * a12r + m12r * a22i + m12i * a22r;
    const n21r = m21r * a11r - m21i * a11i + m22r * a21r - m22i * a21i;
    const n21i = m21r * a11i + m21i * a11r + m22r * a21i + m22i * a21r;
    const n22r = m21r * a12r - m21i * a12i + m22r * a22r - m22i * a22i;
    const n22i = m21r * a12i + m21i * a12r + m22r * a22i + m22i * a22r;
    m11r = n11r; m11i = n11i; m12r = n12r; m12i = n12i;
    m21r = n21r; m21i = n21i; m22r = n22r; m22i = n22i;
  }
  const es = eta(ns), e0 = eta(n0);
  const Br = m11r + m12r * es, Bi = m11i + m12i * es;
  const Cr = m21r + m22r * es, Ci = m21i + m22i * es;
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
