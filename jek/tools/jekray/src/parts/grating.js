import { clamp } from '../core/constants.js';
import { nextName, num } from '../state/project.js';

/* Grating: A diffraction grating, reflecting or transmitting. */
export const GRATING = {
  type: 'grating', label: 'Grating',
  picker: [{ key: 'grating', short: 'Grating' }],
  keys: ['grating'],
  make: (x, y) => ({ type: 'grating', name: nextName('Grating'), x, y, angle: 180, length: 25, lpmm: 600, blaze: 500 }),
  norm(e, base) {
    return Object.assign(base, {
      length: Math.max(0.1, num(e.length, 25)),
      lpmm: clamp(num(e.lpmm, 600), 1, 10000),
      mode: e.mode === 'transmit' ? 'transmit' : 'reflect',
      blaze: clamp(num(e.blaze, 500), 100, 20000),
      eff: clamp(num(e.eff, 80), 0, 100),
    });
  },
  zSquare: true,
  guide: {
    what: 'A diffraction grating, reflecting or transmitting.',
    angle: 'the direction its ruled face points (like a mirror for mode "reflect").',
    fields: { length: 'mm.', lpmm: 'lines per mm.', mode: '"reflect" or "transmit".', blaze: 'nm blaze wavelength.', eff: '% into the first order at the blaze.' },
  },
};
