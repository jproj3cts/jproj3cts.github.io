import { clamp } from '../core/constants.js';
import { FILTER_TYPES } from '../core/crystals.js';
import { nextName, num } from '../state/project.js';

/* Filter: A filter: long-pass, short-pass, band-pass or neutral density, optionally reflecting what it rejects (a dichroic). */
export const FILTER = {
  type: 'filter', label: 'Filter',
  picker: [{ key: 'filter', short: 'Filter' }],
  keys: ['filter'],
  make: (x, y) => ({ type: 'filter', name: nextName('Filter'), x, y, angle: 0 }),
  norm(e, base) {
    return Object.assign(base, {
      length: Math.max(0.1, num(e.length, 25)),
      ftype: FILTER_TYPES[e.ftype] ? e.ftype : 'longpass',
      edge: clamp(num(e.edge, 600), 100, 20000), slope: Math.max(0.1, num(e.slope, 10)),
      centre: clamp(num(e.centre, 550), 100, 20000), fwhm: Math.max(0.1, num(e.fwhm, 10)),
      od: clamp(num(e.od, 1), 0, 10), tmax: clamp(num(e.tmax, 95), 0, 100),
      reflect: e.reflect === true,
    });
  },
  guide: {
    what: 'A filter: long-pass, short-pass, band-pass or neutral density, optionally reflecting what it rejects (a dichroic).',
    angle: 'its normal: 0 for a beam travelling ±x.',
    fields: { length: 'mm aperture.', ftype: 'one of the filter types below.', edge: 'nm: the edge of a long- or short-pass.', slope: 'nm: the 10–90% width of the edge.',
    centre: 'nm: a band-pass centre.', fwhm: 'nm: a band-pass width.', od: 'optical density of an "nd" filter: it transmits 10^−od.', tmax: '% peak transmission.',
    reflect: 'true: what it rejects is reflected (a dichroic) rather than absorbed.' },
  },
};
