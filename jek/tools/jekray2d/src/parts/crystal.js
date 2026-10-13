import { clamp } from '../core/constants.js';
import { CRYSTALS, CRYSTAL_SHAPES } from '../core/crystals.js';
import { nextName, num } from '../state/project.js';

/* Crystal: A birefringent crystal: beam displacer, Wollaston prism or Glan–Taylor polariser. */
export const CRYSTAL = {
  type: 'crystal', label: 'Crystal',
  picker: [{ key: 'crystal', short: 'Crystal', long: 'Crystal: displacer, Wollaston, Glan–Taylor' }],
  keys: ['crystal'],
  make: (x, y) => ({ type: 'crystal', name: nextName('Crystal'), x, y, angle: 0, shape: 'displacer' }),
  norm(e, base) {
    return Object.assign(base, {
      shape: CRYSTAL_SHAPES[e.shape] ? e.shape : 'displacer',
      crystal: CRYSTALS[e.crystal] ? e.crystal : 'calcite',
      size: Math.max(0.1, num(e.size, 10)),
      length: Math.max(0.1, num(e.length, 10)),
      axisAngle: clamp(num(e.axisAngle, 45), -89, 89),
      wedge: clamp(num(e.wedge, 30), 5, 60),
    });
  },
  zSquare: true,
  guide: {
    what: 'A birefringent crystal: beam displacer, Wollaston prism or Glan–Taylor polariser.',
    angle: 'the direction of its entrance face’s normal (0 for light travelling ±x).',
    fields: { shape: 'one of the crystal shapes below.', crystal: 'one of the crystals below.', size: 'mm aperture.', length: 'mm length along the beam.',
    axisAngle: 'degrees: the optic axis from the normal, for a displacer.', wedge: 'degrees: the wedge angle, for Wollaston and Glan–Taylor.' },
  },
};
