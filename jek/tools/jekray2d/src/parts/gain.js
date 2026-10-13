import { clamp } from '../core/constants.js';
import { nextName, num } from '../state/project.js';

/* Gain medium: A thin gain medium with a Lorentzian gain line that saturates: in a cavity above threshold the laser settles at its output power and the output leaves each partly transmitting mirror as a beam. */
export const GAIN = {
  type: 'gain', label: 'Gain medium',
  picker: [{ key: 'gain', short: 'Gain medium' }],
  keys: ['gain'],
  make: (x, y) => ({ type: 'gain', name: nextName('Gain medium'), x, y, angle: 0 }),
  norm(e, base) {
    return Object.assign(base, {
      length: Math.max(0.1, num(e.length, 6)),
      g0: clamp(num(e.g0, 1.2), 0, 1000),
      isat: Math.max(0, num(e.isat, 2.9)),                // saturation intensity, kW/cm^2 (Nd:YAG 2.9); 0: it does not saturate
      centre: clamp(num(e.centre, 1064), 100, 20000), fwhm: Math.max(0.01, num(e.fwhm, 30)),
    });
  },
  guide: {
    what: 'A thin gain medium with a Lorentzian gain line that saturates: in a cavity above threshold the laser settles at its output power and the output leaves each partly transmitting mirror as a beam.',
    angle: 'its normal: 0 for a beam travelling ±x.',
    fields: { length: 'mm: its aperture across the beam (it is a thin sheet).', g0: 'small-signal single-pass power gain at the line centre (×); the pump sets it.', centre: 'nm line centre.', fwhm: 'nm line width.',
    isat: 'kW/cm² saturation intensity (Nd:YAG 2.9, Ti:sapphire 200, Yb:YAG 10); 0: no saturation. Above threshold the cavity settles at the power where the saturated gain balances the loss, and the output leaves each partly transmitting mirror as a beam.' },
  },
};
