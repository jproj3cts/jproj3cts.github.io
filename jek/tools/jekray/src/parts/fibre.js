import { clamp } from '../core/constants.js';
import { nextName, num } from '../state/project.js';
import { RAY_PATTERNS } from '../engines/trace.js';

/* Fibre: A fibre tip: takes free-space light into a fibre by mode overlap, and sends a fibre network’s light out. */
export const FIBRE = {
  type: 'fibre', label: 'Fibre',
  picker: [{ key: 'fibre', short: 'Fibre tip' }],
  keys: ['fibre'],
  make: (x, y) => ({ type: 'fibre', name: nextName('Fibre'), x, y, angle: 180 }),
  norm(e, base) {
    return Object.assign(base, {
      length: Math.max(0.1, num(e.length, 2.5)),       // the ferrule's face
      core: Math.max(0.5, num(e.core, 4.4)),           // core diameter, µm
      na: clamp(num(e.na, 0.12), 0.01, 0.9),
      emitRays: Math.round(clamp(num(e.emitRays, 5), 0, 51)),
      // what the light it sends out is drawn and worked out as, as a source's ticks: the ray fan, the Gaussian beam (its field)
      ...(e.emitTraceRays === false ? { emitTraceRays: false } : {}),
      ...(e.emitGauss === false ? { emitGauss: false } : {}),
      ...(RAY_PATTERNS.some(([k]) => k === e.emitPattern) && e.emitPattern !== 'line' ? { emitPattern: e.emitPattern } : {}),   // its rays across the beam, as a source's
      mm: e.mm === true,                               // multimode: takes light in by its core and NA, sends out a multimode beam
      // how the field of the beam it sends out is worked out, as a source's
      popN: [128, 256, 512, 1024].includes(+e.popN) ? +e.popN : 256,
      popModel: e.popModel === '2d' ? '2d' : 'auto',
      absorb: true,
    });
  },
  guide: {
    what: 'A fibre tip: takes free-space light into a fibre by mode overlap, and sends a fibre network’s light out.',
    angle: 'the direction its face points: towards the light it takes in, and the way it sends light out. Its fibre port is on the back.',
    fields: { length: 'mm: the ferrule face width.', core: 'µm core diameter (mode field set from core and NA).', na: 'numerical aperture.',
    emitRays: 'rays in the fan it sends out, 0 to 51.', emitTraceRays: 'false: no ray fan is traced from it (the Gaussian beam still is).', emitGauss: 'false: no Gaussian beam or field is propagated from it, rays only (nothing downstream can then couple or interfere with its light).', emitPattern: '"line" (the default, in the bench plane), "cross", "grid" or "hex": its rays across the beam, up and down it too, as a source\'s pattern.',
    popN: 'grid points for the field of the beam it sends out: 128, 256, 512 or 1024.', popModel: '"auto" (round when it can be) or "2d" (always 2D, with polarisation).',
    mm: 'true for a multimode fibre (give it core 50 or 62.5 and na 0.22): it takes in what lands on its core inside its NA, and sends out a beam filling core and NA.' },
  },
};
