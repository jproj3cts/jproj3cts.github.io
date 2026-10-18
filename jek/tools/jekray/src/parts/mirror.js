import { clamp } from '../core/constants.js';
import { nextName, num } from '../state/project.js';
import { RF_METALS } from '../core/rf.js';
import { normF } from '../core/freeform.js';

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
      // even aspheric terms on the conic, A4 r⁴ … (as a lens surface's)
      ...(Array.isArray(e.A) && e.A.length ? { A: e.A.slice(0, 7).map(v => isFinite(+v) ? +v : 0) } : {}),
      // freeform terms on the sag, c_mn x^m y^n (x up, y across): core/freeform.js
      ...(normF(e.F) ? { F: normF(e.F) } : {}),
      R: (isFinite(e.R) && e.R !== 0 && e.R !== null) ? +e.R : null,
      gdd: num(e.gdd, 0),                            // fs^2 a reflection: a chirped mirror
      // a metal mirror (RF): its conductor, for its loss; a film beam splitter: a dielectric sheet, index and thickness (mm)
      ...(RF_METALS[e.metal] ? { metal: e.metal } : {}),
      ...(e.film && typeof e.film === 'object' ? { film: { n: clamp(num(e.film.n, 1.73), 1, 20), t: clamp(num(e.film.t, 0.1), 1e-4, 100) } } : {}),
      // its readouts of the light arriving, as a screen's
      mapScale: e.mapScale === 'log' ? 'log' : 'lin',
      vectorFocus: ['auto', 'on', 'off'].includes(e.vectorFocus) ? e.vectorFocus : 'auto',
      mtfFreq: Math.max(0, num(e.mtfFreq, 50)),
    });
  },
  guide: {
    what: 'A mirror, flat or curved (spherical, conic or aspheric), partly transmitting if reflect < 100.',
    angle: 'the direction its reflecting face points (its normal, towards the light it reflects).',
    fields: { length: 'mm: the mirror’s width across the bench.', reflect: '% reflected, 0 to 100 (the rest is transmitted).',
    R: 'mm radius of curvature, null for flat. Positive: concave towards the light it faces (focuses, f = R/2); negative: convex.',
    k: 'conic constant (0 sphere, −1 paraboloid).', A: 'optional: even aspheric terms [A4, A6, …] (mm to the power 1 − n), added to the conic’s sag with the radius’s sign.', F: 'optional: freeform terms {"mn": c_mn}, c_mn x^m y^n added to the sag (x up out of the bench plane, y across the mirror; m even).', offset: 'mm: an off-axis segment of the parent surface, this far from its vertex.',
    gdd: 'fs² added to each reflection (a chirped mirror; negative compresses a pulse); 0 for an ordinary mirror.',
    metal: 'an RF metal mirror: "Al", "Cu", "Au", "brass", "steel" or "ideal", for its loss by surface resistance.',
    film: 'a film beam splitter (RF): { "n": index, "t": mm thickness } of a dielectric sheet, reflecting by its two faces\u2019 interference; then reflect is ignored.',
    mapScale: '"lin" or "log": the irradiance map of the light arriving (its Diffraction tab, as a screen’s).', vectorFocus: '"auto", "on" or "off": the vector focus model for steep beams arriving.',
    mtfFreq: 'lp/mm at which its Diffraction tab quotes the MTF.' },
  },
};
