import { ci } from '../engines/fibre.js';

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
