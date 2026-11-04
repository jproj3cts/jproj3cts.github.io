/* ==========================================================================
   JEKion's units and constants. Lengths are millimetres, times microseconds (so a speed is mm/µs, which is
   km/s), potentials volts, energies electronvolts, masses atomic mass units, charges elementary charges,
   magnetic fields gauss, pressures pascals, temperatures kelvin, frequencies megahertz. The file format and
   the browser's store have names of their own, apart from JEKray's (whose constants module is shared).
   ========================================================================== */
export const ION_FORMAT = 'jekion', ION_VERSION = 1;
export const ION_STORE_KEY = 'jek-ion-session-v1';
export const QE = 1.602176634e-19;            // C
export const AMU = 1.66053906660e-27;         // kg
export const ME_U = 5.48579909065e-4;         // the electron's mass, u
export const C_MMUS = 299792.458;             // mm/µs
export const KB = 1.380649e-23;               // J/K
export const KCOUL = 8.9875517923e9;          // N m² / C²
/* charge over mass, C/kg, for a charge in e and a mass in u */
export const qmOf = (charge, massU) => charge * QE / (Math.max(1e-12, massU) * AMU);
/* the rest energy, eV */
export const restEv = massU => massU * AMU * (C_MMUS * 1e3) ** 2 / QE;
/* a kinetic energy as a speed, mm/µs, relativistically (an electron at 100 keV: 0.55 c) */
export function speedOfKE(keEv, massU) {
  const g = 1 + Math.max(0, keEv) / restEv(massU);
  return C_MMUS * Math.sqrt(Math.max(0, 1 - 1 / (g * g)));
}
/* the proper speed u = γv of that kinetic energy, mm/µs: what the tracer integrates */
export function properSpeedOfKE(keEv, massU) {
  const g = 1 + Math.max(0, keEv) / restEv(massU);
  return C_MMUS * Math.sqrt(Math.max(0, g * g - 1));
}
/* the kinetic energy, eV, of a proper speed u (mm/µs) */
export function keOfProper(u, massU) {
  const g = Math.sqrt(1 + (u / C_MMUS) ** 2);
  return (g - 1) * restEv(massU);
}
export const gammaOfProper = u => Math.sqrt(1 + (u / C_MMUS) ** 2);
/* a few particles people fly, by name: mass in u, charge in e */
export const SPECIES = {
  'e-': { mass: ME_U, charge: -1, label: 'Electron' }, 'H+': { mass: 1.00728, charge: 1, label: 'Proton' },
  'He+': { mass: 4.00206, charge: 1, label: 'Helium ion' }, 'Be+': { mass: 9.01163, charge: 1, label: 'Beryllium ion' },
  'N2+': { mass: 28.0056, charge: 1, label: 'Nitrogen molecular ion' }, 'Ar+': { mass: 39.9619, charge: 1, label: 'Argon ion' },
  'Ca+': { mass: 39.9620, charge: 1, label: 'Calcium ion' }, 'Rb+': { mass: 86.9086, charge: 1, label: 'Rubidium ion' },
  'Sr+': { mass: 87.9051, charge: 1, label: 'Strontium ion' }, 'Cs+': { mass: 132.9049, charge: 1, label: 'Caesium ion' },
  'Yb+': { mass: 173.9383, charge: 1, label: 'Ytterbium ion' }, 'Hg+': { mass: 201.9703, charge: 1, label: 'Mercury ion' },
};
/* a number in a few figures, as the panels show it */
export const nf = (v, p = 4) => (v === null || v === undefined || !isFinite(v) ? '—' : String(+(+v).toPrecision(p)));
export function fmtEv(v) {
  const a = Math.abs(v);
  return a >= 1e6 ? nf(v / 1e6) + ' MeV' : a >= 1e3 ? nf(v / 1e3) + ' keV' : a >= 0.1 || a === 0 ? nf(v) + ' eV' : nf(v * 1e3) + ' meV';
}
export function fmtMm(v) {
  const a = Math.abs(v);
  return a >= 1000 ? nf(v / 1000) + ' m' : a >= 0.1 || a === 0 ? nf(v) + ' mm' : nf(v * 1e3) + ' µm';
}
export function fmtUs(v) {
  const a = Math.abs(v);
  return a >= 1e3 ? nf(v / 1e3) + ' ms' : a >= 0.1 || a === 0 ? nf(v) + ' µs' : a >= 1e-4 ? nf(v * 1e3) + ' ns' : nf(v * 1e6) + ' ps';
}
export function fmtMHz(v) {
  const a = Math.abs(v);
  return a >= 1e3 ? nf(v / 1e3) + ' GHz' : a >= 1 ? nf(v) + ' MHz' : a >= 1e-3 ? nf(v * 1e3) + ' kHz' : nf(v * 1e6) + ' Hz';
}
/* the unit an RF frequency is shown in, by its size: [key, mhz a unit, label] */
export const FREQ_UNITS = [['hz', 1e-6, 'Hz'], ['khz', 1e-3, 'kHz'], ['mhz', 1, 'MHz'], ['ghz', 1e3, 'GHz']];
export const freqUnitOf = mhz => (mhz >= 1e3 ? 'ghz' : mhz >= 1 ? 'mhz' : mhz >= 1e-3 ? 'khz' : 'hz');
export function fmtVolt(v) {
  const a = Math.abs(v);
  return a >= 1e3 ? nf(v / 1e3) + ' kV' : a >= 0.1 || a === 0 ? nf(v) + ' V' : nf(v * 1e3) + ' mV';
}
export const fmtGauss = v => (Math.abs(v) >= 1e4 ? nf(v / 1e4) + ' T' : nf(v) + ' G');
