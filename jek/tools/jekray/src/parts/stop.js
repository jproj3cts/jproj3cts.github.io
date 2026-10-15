import { clamp } from '../core/constants.js';
import { nextName, num } from '../state/project.js';
import { STOP_SHAPES } from '../core/mask.js';

/* Stop: An aperture: iris, slit, double slit, slit comb, knife edge or beam block. */
export const STOP = {
  type: 'stop', label: 'Stop',
  picker: [{ key: 'stop', short: 'Stop' }],
  keys: ['stop'],
  make: (x, y) => ({ type: 'stop', name: nextName('Stop'), x, y, angle: 0, aperture: 5, outer: 25.4 }),
  norm(e, base) {
    return Object.assign(base, {
      aperture: Math.max(0, num(e.aperture, 5)),
      outer: Math.max(0.2, num(e.outer, 25.4)),
      shape: STOP_SHAPES.some(s => s[0] === e.shape) ? e.shape : 'round',
      sep: Math.max(0, num(e.sep, 0.5)),             // a double slit's centre-to-centre separation
      pitch: Math.max(1e-6, num(e.pitch, 0.2)),      // a comb's slit-to-slit pitch
      count: Math.round(clamp(num(e.count, 5), 2, 400)),   // and its number of slits
      offset: num(e.offset, 0),                      // along the stop, from its centre
      height: Math.max(0, num(e.height, 0)),         // a slit's height out of the plane; 0 is unlimited
      side: e.side === -1 ? -1 : 1,                  // which side of its edge a knife covers
    });
  },
  zHalf: el => el.outer / 2,
  zSquare: true,
  guide: {
    what: 'An aperture: iris, slit, double slit, slit comb, knife edge or beam block.',
    angle: 'its normal: 0 for a beam travelling ±x (the blades then lie along y).',
    fields: { shape: 'one of the stop shapes below.', aperture: 'mm: the opening (an iris’s diameter, a slit’s width).', outer: 'mm: the outer size (a beam block’s diameter).',
    sep: 'mm: a double slit’s centre-to-centre separation.', pitch: 'mm: a slit comb’s pitch.', count: 'a comb’s number of slits, 2 to 400.',
    offset: 'mm: the opening’s centre along the stop.', height: 'mm: a slit’s height out of the plane (0 unlimited).', side: '1 or −1: which side a knife edge covers.' },
  },
};
