import { clamp } from '../core/constants.js';
import { nextName, num } from '../state/project.js';

/* Acousto-optic modulator: A free-space acousto-optic modulator: shifts the diffracted order by the drive frequency. */
export const AOM = {
  type: 'aom', label: 'Acousto-optic modulator',
  picker: [{ key: 'aom', short: 'AOM', long: 'Acousto-optic modulator' }],
  keys: ['aom'],
  make: (x, y) => ({ type: 'aom', name: nextName('AOM'), x, y, angle: 0 }),
  norm(e, base) {
    return Object.assign(base, { length: Math.max(0.1, num(e.length, 4)), rf: Math.max(0, num(e.rf, 80)), v: Math.max(1, num(e.v, 4200)),
      eff: clamp(num(e.eff, 80), 0, 100), order: num(e.order, 1) < 0 ? -1 : 1 });
  },
  zHalf: el => (el.length || 10) / 2 * 0.6,
  zSquare: true,
  guide: {
    what: 'A free-space acousto-optic modulator: shifts the diffracted order by the drive frequency.',
    angle: 'its normal: 0 for a beam travelling ±x. Order +1 turns the beam anticlockwise by asin(λ·rf/v); order −1 clockwise.',
    fields: { length: 'mm aperture.', rf: 'MHz drive: the order is shifted by this.', v: 'm/s sound speed (4200 for TeO₂ shear is typical of fibre AOMs; 650 slow shear).',
    eff: '% into the order.', order: '+1 or −1.' },
  },
};
