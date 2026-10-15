/* ---------- Atomic vapour cells ----------
   A cell of alkali vapour: each hyperfine transition of the D line absorbs with its own Voigt
   profile (the Doppler spread of the vapour at its temperature, the natural width of the
   excited state), weighted by the ground level's share of the atoms and the transition's
   relative strength. The field through it is exp(-alpha L / 2) with the matching phase, the
   refractive index of the same lines (the Faddeeva function carries both).
   Numbers: D. A. Steck, Rubidium 85 / 87 and Cesium D Line Data; T. G. Tiecke, Properties
   of Potassium. Vapour pressures from Alcock, Itkin and Horrigan (1984), as quoted there. */
export const ATOM_ISO = {
  Rb85: { I: 2.5, m: 84.911789738, Ag: 1011.910813, D2: { nu: 384.2304063727e12, Ae: 25.0020, Be: 25.790, tau: 26.2348 }, D1: { nu: 377.107385690e12, Ae: 120.527, Be: 0, tau: 27.679 } },
  Rb87: { I: 1.5, m: 86.909180527, Ag: 3417.341305452, D2: { nu: 384.2304844685e12, Ae: 84.7185, Be: 12.4965, tau: 26.2348 }, D1: { nu: 377.107463380e12, Ae: 408.328, Be: 0, tau: 27.679 } },
  Cs133: { I: 3.5, m: 132.905451931, Ag: 2298.1579425, D2: { nu: 351.72571850e12, Ae: 50.28827, Be: -0.4934, tau: 30.473 }, D1: { nu: 335.116048807e12, Ae: 291.9201, Be: 0, tau: 34.894 } },
  K39: { I: 1.5, m: 38.9637064864, Ag: 230.8598601, D2: { nu: 391.01617003e12, Ae: 6.093, Be: 2.786, tau: 26.37 }, D1: { nu: 389.286058716e12, Ae: 27.775, Be: 0, tau: 26.72 } },
};
// log10 of the vapour pressure in torr, from C. B. Alcock, V. P. Itkin and M. K. Horrigan,
// Can. Metall. Q. 23, 309 (1984): the solid below the melting point, the liquid above
// (as ElecSus uses, and as Steck's tabulated room-temperature values agree with; log10 760
// turns atmospheres into torr)
const LOG_ATM = Math.log10(760);
export const VAPOUR = {
  Rb: T => LOG_ATM + (T < 312.46 ? 4.857 - 4215 / T : 8.316 - 4275 / T - 1.3102 * Math.log10(T)),
  Cs: T => LOG_ATM + (T < 301.65 ? 4.711 - 3999 / T : 8.232 - 4062 / T - 1.3359 * Math.log10(T)),
  K: T => LOG_ATM + (T < 336.8 ? 4.961 - 4646 / T : 8.233 - 4693 / T - 1.2403 * Math.log10(T)),
};
export const ATOMS = {
  Rb: { name: 'Rubidium, natural', el: 'Rb', iso: [['Rb85', 0.7217], ['Rb87', 0.2783]] },
  Rb85: { name: 'Rubidium 85, enriched', el: 'Rb', iso: [['Rb85', 1]] },
  Rb87: { name: 'Rubidium 87, enriched', el: 'Rb', iso: [['Rb87', 1]] },
  Cs: { name: 'Caesium', el: 'Cs', iso: [['Cs133', 1]] },
  K: { name: 'Potassium, natural (³⁹K)', el: 'K', iso: [['K39', 0.932581]] },
};
export const KB = 1.380649e-23, AMU = 1.66053906660e-27, HPL = 6.62607015e-34, C_SI = 299792458;
