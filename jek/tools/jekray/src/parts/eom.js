import { nextName, num } from '../state/project.js';

/* Electro-optic modulator: A free-space electro-optic modulator: phase (sidebands) or amplitude modulation. */
export const EOM = {
  type: 'eom', label: 'Electro-optic modulator',
  picker: [{ key: 'eom', short: 'EOM', long: 'Electro-optic modulator' }],
  keys: ['eom'],
  make: (x, y) => ({ type: 'eom', name: nextName('EOM'), x, y, angle: 0 }),
  norm(e, base) {
    return Object.assign(base, { length: Math.max(0.1, num(e.length, 4)), fm: Math.max(0, num(e.fm, 20)), beta: Math.max(0, num(e.beta, 1.08)),
      emode: e.emode === 'amplitude' ? 'amplitude' : 'phase', bias: num(e.bias, 90), loss: Math.max(0, num(e.loss, 0)) });
  },
  zHalf: el => Math.max(1.5, (el.length || 10) / 4),
  zSquare: true,
  guide: {
    what: 'A free-space electro-optic modulator: phase (sidebands) or amplitude modulation.',
    angle: 'its normal: 0 for a beam travelling ±x.',
    fields: { length: 'mm aperture.', fm: 'MHz drive.', beta: 'modulation depth in radians.', emode: '"phase" (sidebands) or "amplitude".', bias: 'degrees, for "amplitude".', loss: 'dB insertion loss.' },
  },
};
