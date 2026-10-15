import { clamp } from '../core/constants.js';
import { ATOMS } from '../core/cells.js';
import { nextName, num } from '../state/project.js';

/* Vapour cell: An atomic vapour cell (Rb, Cs or K; D1 or D2): Doppler-broadened hyperfine absorption and dispersion at the light’s frequency, and saturated absorption (Lamb dips and crossovers) for a weak beam crossing a strong one going the other way. Set a source’s wavelength to the line in vacuum nm (Rb D2 780.24, Cs D2 852.35). */
export const CELL = {
  type: 'cell', label: 'Vapour cell',
  picker: [{ key: 'cell', short: 'Vapour cell', long: 'Atomic vapour cell (Rb, Cs, K)' }],
  keys: ['cell'],
  make: (x, y) => ({ type: 'cell', name: nextName('Vapour cell'), x, y, angle: 0 }),
  norm(e, base) {
    return Object.assign(base, {
      length: Math.max(0.1, num(e.length, 25)),            // window diameter, mm
      cellLen: Math.max(1, num(e.cellLen, 75)),            // along the beam, mm
      atom: ATOMS[e.atom] ? e.atom : 'Rb',
      line: e.line === 'D1' ? 'D1' : 'D2',
      temp: clamp(num(e.temp, 25), -20, 250),              // deg C
      bField: clamp(num(e.bField, 0), -20000, 20000),      // gauss, along the cell's axis (+x of its frame)
    });
  },
  guide: {
    what: 'An atomic vapour cell (Rb, Cs or K; D1 or D2): Doppler-broadened hyperfine absorption and dispersion at the light\u2019s frequency, and saturated absorption (Lamb dips and crossovers) for a weak beam crossing a strong one going the other way. Set a source\u2019s wavelength to the line in vacuum nm (Rb D2 780.24, Cs D2 852.35).',
    angle: 'its axis: 0 for a beam travelling ±x (the cell lies along x).',
    fields: { length: 'mm: the window diameter.', cellLen: 'mm along the beam (75 is usual).', atom: '"Rb" (natural), "Rb85", "Rb87", "Cs" or "K".', line: '"D2" or "D1".',
    temp: '°C: sets the vapour density (25 for room temperature; heat a potassium cell to about 60).', bField: 'gauss, a magnetic field along the cell (+ along its angle): Zeeman-split sigma+ and sigma- lines, so circular dichroism (DAVLL) and Faraday rotation (Faraday filters). 0 for none.' },
  },
};
