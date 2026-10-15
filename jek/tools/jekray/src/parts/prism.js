import { PRISM_SHAPES, nextName, normCoat, normMat, num } from '../state/project.js';

/* Prism: A glass prism or window. */
export const PRISM = {
  type: 'prism', label: 'Prism',
  picker: [{ key: 'prism', short: 'Prism' }],
  keys: ['prism'],
  make: (x, y) => ({ type: 'prism', name: nextName('Prism'), x, y, shape: 'right', size: 20, material: { glass: 'N-BK7' } }),
  norm(e, base) {
    return Object.assign(base, {
      shape: PRISM_SHAPES[e.shape] ? e.shape : 'right',
      size: Math.max(0.1, num(e.size, 20)),
      thickness: Math.max(0.1, num(e.thickness, 5)),
      material: normMat(e.material),
      coat: normCoat(e.coat),
      source: typeof e.source === 'string' ? e.source : undefined,
    });
  },
  zHalf: el => el.size / 2,
  zSquare: true,
  guide: {
    what: 'A glass prism or window.',
    angle: 'rotates the prism about its centre; check the result on the bench.',
    fields: { shape: 'one of the prism shapes below.', size: 'mm.', thickness: 'mm (for a window).', material: 'e.g. {"glass": "N-BK7"}.', coat: 'coating on its faces.' },
  },
};
