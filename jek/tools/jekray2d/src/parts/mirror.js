import { clamp } from '../core/constants.js';
import { nextName, num } from '../state/project.js';

/* Mirror: A mirror, flat or curved (spherical or conic), partly transmitting if reflect < 100. */
export const MIRROR = {
  type: 'mirror', label: 'Mirror',
  picker: [{ key: 'mirror', short: 'Mirror' }],
  keys: ['mirror'],
  make: (x, y) => ({ type: 'mirror', name: nextName('Mirror'), x, y, angle: 135, length: 25.4 }),
  norm(e, base) {
    return Object.assign(base, {
      length: Math.max(0.1, num(e.length, 25)),
      reflect: clamp(num(e.reflect, 100), 0, 100),
      offset: num(e.offset, 0),
      k: num(e.k, 0),
      R: (isFinite(e.R) && e.R !== 0 && e.R !== null) ? +e.R : null,
      gdd: num(e.gdd, 0),                            // fs^2 a reflection: a chirped mirror
      // its readouts of the light arriving, as a screen's
      mapScale: e.mapScale === 'log' ? 'log' : 'lin',
      vectorFocus: ['auto', 'on', 'off'].includes(e.vectorFocus) ? e.vectorFocus : 'auto',
      mtfFreq: Math.max(0, num(e.mtfFreq, 50)),
    });
  },
  guide: {
    what: 'A mirror, flat or curved (spherical or conic), partly transmitting if reflect < 100.',
    angle: 'the direction its reflecting face points (its normal, towards the light it reflects).',
    fields: { length: 'mm: the mirror’s width across the bench.', reflect: '% reflected, 0 to 100 (the rest is transmitted).',
    R: 'mm radius of curvature, null for flat. Positive: concave towards the light it faces (focuses, f = R/2); negative: convex.',
    k: 'conic constant (0 sphere, −1 paraboloid).', offset: 'mm: an off-axis segment of the parent surface, this far from its vertex.',
    gdd: 'fs² added to each reflection (a chirped mirror; negative compresses a pulse); 0 for an ordinary mirror.',
    mapScale: '"lin" or "log": the irradiance map of the light arriving (its Diffraction tab, as a screen’s).', vectorFocus: '"auto", "on" or "off": the vector focus model for steep beams arriving.',
    mtfFreq: 'lp/mm at which its Diffraction tab quotes the MTF.' },
  },
};
