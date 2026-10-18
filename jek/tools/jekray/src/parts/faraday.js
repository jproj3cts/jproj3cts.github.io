import { nextName, num } from '../state/project.js';

/* Faraday rotator: A Faraday rotator (non-reciprocal). */
export const FARADAY = {
  type: 'faraday', label: 'Faraday rotator',
  picker: [{ key: 'faraday', short: 'Faraday rotator' }],
  keys: ['faraday'],
  make: (x, y) => ({ type: 'faraday', name: nextName('Faraday rotator'), x, y, angle: 0 }),
  norm(e, base) {
    return Object.assign(base, { length: Math.max(0.1, num(e.length, 5)), rotation: num(e.rotation, 45) });
  },
  guide: {
    what: 'A Faraday rotator (non-reciprocal).',
    angle: 'its normal, and the direction of its magnetic field: the sense of rotation depends on the direction of travel against it.',
    fields: { length: 'mm aperture.', rotation: 'degrees of rotation.' },
  },
};
