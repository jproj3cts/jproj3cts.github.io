import { clamp } from '../core/constants.js';
import { nextName, normCoat, normMat, num } from '../state/project.js';

/* Beam splitter cube: A beam-splitter cube: non-polarising ("npbs", reflect %) or polarising ("pbs", reflectS/reflectP %). */
export const CUBE = {
  type: 'cube', label: 'Beam splitter cube',
  picker: [{ key: 'cube', short: 'Beam splitter' }],
  keys: ['cube'],
  make: (x, y) => ({ type: 'cube', name: nextName('Beam splitter'), x, y, size: 12.7, reflect: 50, material: { glass: 'N-BK7' } }),
  norm(e, base) {
    return Object.assign(base, {
      size: Math.max(0.1, num(e.size, 12.7)),
      mode: e.mode === 'pbs' ? 'pbs' : 'npbs',
      reflect: clamp(num(e.reflect, 50), 0, 100),
      reflectS: clamp(num(e.reflectS, 99), 0, 100),
      reflectP: clamp(num(e.reflectP, 1), 0, 100),
      material: normMat(e.material),
      coat: normCoat(e.coat),
      source: typeof e.source === 'string' ? e.source : undefined,
    });
  },
  zHalf: el => el.size / 2,
  zSquare: true,
  guide: {
    what: 'A beam-splitter cube: non-polarising ("npbs", reflect %) or polarising ("pbs", reflectS/reflectP %).',
    angle: 'turns its internal diagonal. At 0 the diagonal runs like "/": light travelling +x reflects to +y, travelling −x reflects to −y, and it transmits straight on. At 90 the diagonal is "\\": +x reflects to −y.',
    fields: { size: 'mm edge length.', mode: '"npbs" or "pbs".', reflect: '% reflected, for "npbs".', reflectS: '% of s reflected, for "pbs".', reflectP: '% of p reflected, for "pbs".',
    material: 'e.g. {"glass": "N-BK7"}.', coat: 'coating on its outer faces (see Coatings).' },
  },
};
