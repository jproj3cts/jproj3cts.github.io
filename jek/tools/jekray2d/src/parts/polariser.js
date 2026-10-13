import { nextName, num } from '../state/project.js';

/* Polariser: A linear polariser. */
export const POLARISER = {
  type: 'polariser', label: 'Polariser',
  picker: [{ key: 'polariser', short: 'Polariser' }],
  keys: ['polariser'],
  make: (x, y) => ({ type: 'polariser', name: nextName('Polariser'), x, y, angle: 0, axis: 0 }),
  norm(e, base) {
    return Object.assign(base, {
      length: Math.max(0.1, num(e.length, 25.4)),
      axis: num(e.axis, 0),
    });
  },
  guide: {
    what: 'A linear polariser.',
    angle: 'its normal: 0 for a beam travelling ±x.',
    fields: { length: 'mm aperture.', axis: 'degrees: the transmission axis from p (0 passes p, 90 passes s).' },
  },
};
