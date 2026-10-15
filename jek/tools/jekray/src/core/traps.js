import { refIndex } from './glass.js';
import { AMU, ATOMS, ATOM_ISO, C_SI, HPL, KB } from './cells.js';

/* ---------- Dipole traps ----------
   Atoms for a trap readout: their D lines (Steck's data), each as a two-level line of its own
   decay rate, the D2 line holding 2/3 of the strength and D1 1/3 (linear polarisation, the
   ground state J = 1/2). The polarisability, with the counter-rotating terms that matter far
   from resonance (Grimm, Weidemueller and Ovchinnikov 2000):
     alpha / eps0 = sum 6 pi c^3 f (Gamma / w_i^2) / (w_i^2 - w^2 - i (w^3 / w_i^2) Gamma),
   so the potential is U = -Re(alpha) I / (2 eps0 c) and the photon scattering rate
   Im(alpha) I / (hbar eps0 c), plus the ion core's own static polarisability (Safronova's,
   atomic units). The ground state's hyperfine level can be chosen: from the lower F the lines
   sit higher in frequency by that level's offset from the centroid (hf: the splitting in Hz
   and the nuclear spin I), which moves the tune-out wavelength between the D lines by
   picometres; the excited states' hyperfine structure, the vector light shift of circular
   light and the higher transitions (a few tenths of a percent at 1064 nm) are left out. */
export const TRAP_ATOMS = {
  Rb87: { name: 'Rubidium 87', m: 86.909180527, core: 9.1, D2: [384.2304844685e12, 26.2348], D1: [377.107463380e12, 27.679], hf: [6.834682610904e9, 1.5] },
  Rb85: { name: 'Rubidium 85', m: 84.911789738, core: 9.1, D2: [384.2304063727e12, 26.2348], D1: [377.107385690e12, 27.679], hf: [3.035732439e9, 2.5] },
  Cs133: { name: 'Caesium 133', m: 132.905451931, core: 15.8, D2: [351.72571850e12, 30.473], D1: [335.116048807e12, 34.894], hf: [9.192631770e9, 3.5] },
  K39: { name: 'Potassium 39', m: 38.9637064864, core: 5.46, D2: [391.01617003e12, 26.37], D1: [389.286058716e12, 26.72], hf: [461.7197202e6, 1.5] },
  Na23: { name: 'Sodium 23', m: 22.9897692807, core: 0.95, D2: [508.8487162e12, 16.2492], D1: [508.3324657e12, 16.2992], hf: [1.7716261288e9, 1.5] },
};
export const HBAR = HPL / (2 * Math.PI);
/* the ground state's hyperfine level, 'lo' or 'hi' (F = I -/+ 1/2), as its offset from the
   centroid in Hz; 'avg' the centroid */
function trapGroundShift(atom, F) {
  const [dE, I] = TRAP_ATOMS[atom].hf;
  return F === 'hi' ? dE * I / (2 * I + 1) : F === 'lo' ? -dE * (I + 1) / (2 * I + 1) : 0;
}
export const trapFLabel = (atom, F) => { const I = TRAP_ATOMS[atom].hf[1]; return 'F = ' + (F === 'hi' ? I + 0.5 : I - 0.5); };
/* alpha / eps0 (m^3) at vacuum wavelength nm, as [re, im], from ground level F ('avg', 'lo', 'hi') */
export function trapAlpha(atom, nm, F) {
  const A = TRAP_ATOMS[atom], w = 2 * Math.PI * C_SI / (nm * 1e-9), g = trapGroundShift(atom, F);
  let re = 0, im = 0;
  for (const [key, f] of [['D2', 2 / 3], ['D1', 1 / 3]]) {
    const wi = 2 * Math.PI * (A[key][0] - g), G = 1e9 / A[key][1], num = 6 * Math.PI * C_SI ** 3 * f * G / (wi * wi);
    const dr = wi * wi - w * w, di = -(w ** 3 / (wi * wi)) * G, den = dr * dr + di * di;
    re += num * dr / den; im += -num * di / den;
  }
  re += A.core * 1.64877727436e-41 / 8.8541878128e-12;      // atomic units to alpha / eps0
  return [re, im];
}
/* Dielectric spheres: a Rayleigh particle (radius well under the wavelength in the medium).
   Its polarisability in a medium of index nm (SI), Clausius-Mossotti with the relative index
   m = np / nm, and the radiation reaction that gives it the scattering it must have:
     alpha0 = 4 pi eps0 nm^2 a^3 (m^2 - 1) / (m^2 + 2),  alpha = alpha0 / (1 - i k^3 alpha0 / (6 pi eps0 nm^2)),
   k = 2 pi nm / lambda. The force in a field E (V/m, the physicists' convention) is then
   F = Re(alpha sum_j E_j grad E_j*) / 2: its real part the gradient force, its imaginary
   part the scattering force (radiation pressure, and none in a standing wave's balance). */
export const EPS0 = 8.8541878128e-12;
export const SPHERE_DENSITY = { 'Fused silica': 2200, 'Polystyrene': 1050, 'N-BK7': 2510, 'Sapphire': 3980, 'CaF2': 3180, 'Silicon': 2330, 'Germanium': 5323, 'ZnSe': 5270, 'MgF2': 3170 };
export function sphereAlpha(glass, radiusNm, nm, nMed) {
  const np = refIndex({ glass }, nm), m = np / nMed, a = radiusNm * 1e-9, cm = (m * m - 1) / (m * m + 2);
  const a0 = 4 * Math.PI * EPS0 * nMed * nMed * a ** 3 * cm, k = 2 * Math.PI * nMed / (nm * 1e-9);
  const g = k ** 3 * a0 / (6 * Math.PI * EPS0 * nMed * nMed);                     // alpha = a0 / (1 - i g)
  return { re: a0 / (1 + g * g), im: a0 * g / (1 + g * g), a0, np, m, cm, sigma: k ** 4 * (a0 / (EPS0 * nMed * nMed)) ** 2 / (6 * Math.PI), ka: k * a };
}
/* Air's index at a pressure (mbar) and temperature (K): n - 1 = 2.74e-4 at 1013.25 mbar and
   15 C in the near infrared, in proportion to the density */
export const airIndex = (mbar, T) => 1 + 2.74e-4 * (mbar / 1013.25) * (288.15 / T);
/* A sphere's damping by the medium, the rate G in x'' + G x' + W^2 x = 0 (1/s): in air, Gieseler
   et al.'s interpolation (PRL 109, 103603, 2012) from the viscous (Stokes) limit to the free-
   molecular one, through the Knudsen number; in water, Stokes */
export function gasDamping(radiusNm, mass, mbar, T) {
  const a = radiusNm * 1e-9, eta = 18.27e-6, dm = 0.372e-9, P = mbar * 100;
  const l = KB * T / (Math.SQRT2 * Math.PI * dm * dm * P), Kn = l / a, ck = 0.31 * Kn / (0.785 + 1.152 * Kn + Kn * Kn);
  return { G: 6 * Math.PI * eta * a / mass * 0.619 / (0.619 + Kn) * (1 + ck), l, Kn };
}
/* water's viscosity, Pa s (Vogel's fit, good from 0 to 100 C), and Stokes damping in it */
export const waterViscosity = T => 2.414e-5 * Math.pow(10, 247.8 / (T - 140));
export const waterDamping = (radiusNm, mass, T) => 6 * Math.PI * waterViscosity(T) * radiusNm * 1e-9 / mass;
/* A trap at peak intensity I (W/m^2) whose intensity falls off as I (1 - c x^2 / 2) across it
   and along it (c in 1/mm^2): depth, scattering, heating and trap frequencies */
export function trapPhysics(atom, nm, I, cx, cy, cz, F) {
  const A = TRAP_ATOMS[atom], m = A.m * AMU, [ar, ai] = trapAlpha(atom, nm, F);
  const U = -ar * I / (2 * C_SI), sc = ai * I / (HBAR * C_SI);
  const k = 2 * Math.PI / (nm * 1e-9), Erec = HBAR * HBAR * k * k / (2 * m);
  // U(x) = U I(x) / I: a trap (U < 0) has springs -U c; a barrier none
  const f = c => U < 0 && c > 0 ? Math.sqrt(-U * c * 1e6 / m) / (2 * Math.PI) : null;
  const heat = (2 * Erec / KB) * sc / 3;            // K/s, recoil heating in three dimensions
  const dD = Math.min(...['D1', 'D2'].map(q => Math.abs(C_SI / (nm * 1e-9) - A[q][0])));
  return { U, depthK: -U / KB, depthHz: -U / HPL, sc, heat, fx: f(cx), fy: f(cy), fz: f(cz), trap: U < 0, near: dD < 1e12, alpha: ar };
}

/* Wigner 6j symbol, by the Racah formula (arguments may be half-integers) */
export const FACT = [1]; for (let i = 1; i < 60; i++) FACT.push(FACT[i - 1] * i);
function sixj(a, b, c, d, e, f) {
  const tri = (x, y, z) => { const s = [x + y - z, x - y + z, -x + y + z, x + y + z + 1].map(v => Math.round(v));
    return s.slice(0, 3).some(v => v < 0) ? null : Math.sqrt(FACT[s[0]] * FACT[s[1]] * FACT[s[2]] / FACT[s[3]]); };
  const t1 = tri(a, b, c), t2 = tri(a, e, f), t3 = tri(d, b, f), t4 = tri(d, e, c);
  if (t1 === null || t2 === null || t3 === null || t4 === null) return 0;
  const lo = Math.round(Math.max(a + b + c, a + e + f, d + b + f, d + e + c)), hi = Math.round(Math.min(a + b + d + e, b + c + e + f, c + a + f + d));
  let sum = 0;
  for (let z = lo; z <= hi; z++) sum += (z % 2 ? -1 : 1) * FACT[z + 1] / (FACT[z - Math.round(a + b + c)] * FACT[z - Math.round(a + e + f)] * FACT[z - Math.round(d + b + f)] *
    FACT[z - Math.round(d + e + c)] * FACT[Math.round(a + b + d + e) - z] * FACT[Math.round(b + c + e + f) - z] * FACT[Math.round(c + a + f + d) - z]);
  return t1 * t2 * t3 * t4 * sum;
}
/* a hyperfine level's shift from its fine-structure centroid, MHz */
function hfsShift(F, I, J, A, B) {
  const K = F * (F + 1) - I * (I + 1) - J * (J + 1);
  let E = 0.5 * A * K;
  if (B && I >= 1 && J >= 1) E += B * (1.5 * K * (K + 1) - 2 * I * (I + 1) * J * (J + 1)) / (4 * I * (2 * I - 1) * J * (2 * J - 1));
  return E;
}
/* every hyperfine transition of a cell's line: absolute frequency, the share of all atoms in
   its lower level, its relative strength S, and the numbers its profile needs */
const atomLineCache = new Map();
export function atomLines(atom, line) {
  const key = atom + '|' + line;
  if (atomLineCache.has(key)) return atomLineCache.get(key);
  const out = [], Jp = line === 'D1' ? 0.5 : 1.5, J = 0.5;
  for (const [isoName, ab] of ATOMS[atom].iso) {
    const X = ATOM_ISO[isoName], L = X[line], I = X.I, A = 1e9 / L.tau;
    for (let Fg = Math.abs(I - J); Fg <= I + J + 1e-9; Fg++) for (let Fe = Math.abs(I - Jp); Fe <= I + Jp + 1e-9; Fe++) {
      if (Math.abs(Fe - Fg) > 1.01) continue;
      const S = (2 * Fe + 1) * (2 * J + 1) * sixj(J, Jp, 1, Fe, Fg, I) ** 2;
      if (S < 1e-9) continue;
      const nu = L.nu + 1e6 * (hfsShift(Fe, I, Jp, L.Ae, L.Be) - hfsShift(Fg, I, J, X.Ag, 0));
      const lam = C_SI / L.nu;
      out.push({ iso: isoName, Fg, Fe, nu, S, share: ab * (2 * Fg + 1) / ((2 * J + 1) * (2 * I + 1)), m: X.m * AMU, A, lam,
        // integrated cross-section of the whole F -> all F' line, m^2 Hz, before S
        sInt: lam * lam / (8 * Math.PI) * (2 * Jp + 1) / (2 * J + 1) * A,
        // two-level saturation intensity of a cycling transition, W/m^2
        Isat: Math.PI * HPL * C_SI * A / (3 * lam ** 3) });
    }
  }
  atomLineCache.set(key, out);
  return out;
}
