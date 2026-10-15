import { ELEC } from '../engines/elec.js';

/* Optical chopper: An optical chopper: a slotted wheel across the beam, open for the first part of each cycle; photodetectors behind it see the chopped light (the bench draws it open). */
export const CHOPPER = {
  type: 'chopper', label: 'Optical chopper',
  picker: [{ key: 'elec:chopper', short: 'Chopper', long: 'Optical chopper' }],
  norm(e, base) {
    return ELEC.normChopper(e, base);
  },
  zHalf: el => el.length,
  zSquare: true,
  guide: {
    what: 'An optical chopper: a slotted wheel across the beam, open for the first part of each cycle; photodetectors behind it see the chopped light (the bench draws it open).',
    angle: 'its blade\u2019s normal: 0 (or 180) across a beam travelling along x, as a stop.',
    fields: { length: 'mm aperture across the beam.', f: 'Hz, the chopping frequency.', duty: '% of each cycle open.', phase: 'degrees: when in the cycle it opens, against t = 0 (0: opens at t = 0).' },
  },
};
