import { nextName, num } from '../state/project.js';

/* Waveplate: A waveplate (retardance in waves). */
export const WAVEPLATE = {
  type: 'waveplate', label: 'Waveplate',
  picker: [{ key: 'waveplate', short: 'Waveplate' }],
  keys: ['waveplate'],
  make: (x, y) => ({ type: 'waveplate', name: nextName('Waveplate'), x, y, angle: 0, retard: 0.25, axis: 45 }),
  norm(e, base) {
    return Object.assign(base, {
      length: Math.max(0.1, num(e.length, 25.4)),
      retard: num(e.retard, 0.25),
      retardCustom: e.retardCustom === true || ![0.25, 0.5].includes(num(e.retard, 0.25)),
      axis: num(e.axis, 45),
    });
  },
  guide: {
    what: 'A waveplate (retardance in waves).',
    angle: 'its normal: 0 for a beam travelling ±x.',
    fields: { length: 'mm aperture.', retard: 'retardance in waves (0.25 quarter-wave, 0.5 half-wave, or any value).', axis: 'degrees: the fast axis from p.' },
  },
};
