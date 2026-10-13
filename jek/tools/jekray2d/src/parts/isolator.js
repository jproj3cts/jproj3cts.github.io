import { clamp } from '../core/constants.js';
import { nextName, num } from '../state/project.js';

/* Optical isolator: An optical isolator (polariser, 45° Faraday rotator, polariser). */
export const ISOLATOR = {
  type: 'isolator', label: 'Optical isolator',
  picker: [{ key: 'isolator', short: 'Isolator' }],
  keys: ['isolator'],
  make: (x, y) => ({ type: 'isolator', name: nextName('Isolator'), x, y, angle: 0 }),
  norm(e, base) {
    return Object.assign(base, { length: Math.max(0.1, num(e.length, 5)), axis: num(e.axis, 0), extinction: clamp(num(e.extinction, 40), 0, 80) });
  },
  guide: {
    what: 'An optical isolator (polariser, 45° Faraday rotator, polariser).',
    angle: 'its forward direction: light travelling along the angle passes, light travelling against it is blocked.',
    fields: { length: 'mm aperture.', axis: 'degrees: the input polariser from p.', extinction: 'dB, 0 to 80.' },
  },
};
