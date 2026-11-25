import { clamp } from '../core/constants.js';
import { nextName, num } from '../state/project.js';
import { RF_METALS } from '../core/rf.js';
import { normF } from '../core/freeform.js';

/* the mirrors the picker offers beside the plain one, each the settings a new one of its kind has. The off-axis parabola
   is the 90° one: a parent paraboloid of focal length f (R = 2f) cut 2f off its axis, where it turns a beam along the
   axis through a right angle to a focus 2f away (its reflected focal length, 50.8 mm here). */
const MIRROR_KINDS = {
  concave: () => ({ name: nextName('Concave mirror'), angle: 180, R: 200 }),
  convex: () => ({ name: nextName('Convex mirror'), angle: 180, R: -200 }),
  parabolic: () => ({ name: nextName('Parabolic mirror'), angle: 180, R: 200, k: -1 }),
  oap: () => ({ name: nextName('Off-axis parabola'), angle: 180, R: 50.8, k: -1, offset: 50.8 }),
  partial: () => ({ name: nextName('Partial reflector'), angle: 135, reflect: 50 }),
  chirped: () => ({ name: nextName('Chirped mirror'), angle: 135, gdd: -50 }),
  steering: () => ({ name: nextName('Steering mirror'), angle: 135, steer: true, steerK: 1 }),
};
/* Mirror: A mirror, flat or curved (spherical or conic), partly transmitting if reflect < 100. */
export const MIRROR = {
  type: 'mirror', label: 'Mirror',
  picker: [{ key: 'mirror', short: 'Mirror' }, { key: 'concave', short: 'Concave mirror' }, { key: 'convex', short: 'Convex mirror' },
    { key: 'parabolic', short: 'Parabolic mirror' }, { key: 'oap', short: 'Off-axis parabola', long: 'Off-axis parabolic mirror (90°)' },
    { key: 'partial', short: 'Partial reflector', long: 'Partial reflector (plate beam splitter, output coupler)' },
    { key: 'chirped', short: 'Chirped mirror', long: 'Chirped mirror (compresses a pulse)' },
    { key: 'steering', short: 'Steering mirror', long: 'Steering mirror (a galvo or piezo mirror, turned by a signal)' }],
  keys: ['mirror', 'concave', 'convex', 'parabolic', 'oap', 'partial', 'chirped', 'steering'],
  // the general mirror, and the same mirror begun as the kinds most often wanted: each is only its settings, so any can
  // be made into any other in its panel. A curved one faces a beam along +x; a flat one folds it.
  make: (x, y, kind) => Object.assign({ type: 'mirror', x, y, length: 25.4 }, MIRROR_KINDS[kind] ? MIRROR_KINDS[kind]() : { name: nextName('Mirror'), angle: 135 }),
  norm(e, base) {
    return Object.assign(base, {
      length: Math.max(0.1, num(e.length, 25)),
      reflect: clamp(num(e.reflect, 100), 0, 100),
      // % passed through (what is neither reflected nor passed is absorbed); left out: all that is not reflected
      ...(e.transmit !== undefined && e.transmit !== null && isFinite(+e.transmit) ? { transmit: clamp(+e.transmit, 0, 100 - clamp(num(e.reflect, 100), 0, 100)) } : {}),
      offset: num(e.offset, 0),
      k: num(e.k, 0),
      // even aspheric terms on the conic, A4 r⁴ … (as a lens surface's)
      ...(Array.isArray(e.A) && e.A.length ? { A: e.A.slice(0, 7).map(v => isFinite(+v) ? +v : 0) } : {}),
      // freeform terms on the sag, c_mn x^m y^n (x up, y across): core/freeform.js
      ...(normF(e.F) ? { F: normF(e.F) } : {}),
      R: (isFinite(e.R) && e.R !== 0 && e.R !== null) ? +e.R : null,
      gdd: num(e.gdd, 0),                            // fs^2 a reflection: a chirped mirror
      // steered by a signal (a galvo, a piezo mount): a tilt input for the electronics, turning it steerK degrees a volt
      ...(e.steer === true ? { steer: true, steerK: num(e.steerK, 1) } : {}),
      // a hole through its middle (mm across): light inside it goes on through, as into a cavity or a multipass cell
      ...(num(e.hole, 0) > 0 ? { hole: clamp(num(e.hole, 0), 0, 0.95 * Math.max(0.1, num(e.length, 25))) } : {}),
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
    fields: { length: 'mm: the mirror’s width across the bench.', reflect: '% reflected, 0 to 100 (the rest is transmitted, unless transmit says otherwise).', transmit: '% passed through, 0 to 100 − reflect; what is neither reflected nor passed is absorbed (a black wall: reflect 10, transmit 0). Left out: all that is not reflected passes.', hole: 'mm across: a hole through its middle that light passes through (0 or left out: none).',
    R: 'mm radius of curvature, null for flat. Positive: concave towards the light it faces (focuses, f = R/2); negative: convex.',
    k: 'conic constant (0 sphere, −1 paraboloid).', A: 'optional: even aspheric terms [A4, A6, …] (mm to the power 1 − n), added to the conic’s sag with the radius’s sign.', F: 'optional: freeform terms {"mn": c_mn}, c_mn x^m y^n added to the sag (x up out of the bench plane, y across the mirror; m even).', offset: 'mm: an off-axis segment of the parent surface, this far from its vertex.',
    gdd: 'fs² added to each reflection (a chirped mirror; negative compresses a pulse); 0 for an ordinary mirror.',
    steer: 'true: a steering mirror (a galvo or piezo mirror), with a tilt input for the electronics.', steerK: 'degrees the mirror turns in the bench plane for each volt on its tilt input (the reflected beam turns twice that); 1 when left out.',
    metal: 'an RF metal mirror: "Al", "Cu", "Au", "brass", "steel" or "ideal", for its loss by surface resistance.',
    film: 'a film beam splitter (RF): { "n": index, "t": mm thickness } of a dielectric sheet, reflecting by its two faces\u2019 interference; then reflect is ignored.',
    mapScale: '"lin" or "log": the irradiance map of the light arriving (its Diffraction tab, as a screen’s).', vectorFocus: '"auto", "on" or "off": the vector focus model for steep beams arriving.',
    mtfFreq: 'lp/mm at which its Diffraction tab quotes the MTF.' },
  },
};
