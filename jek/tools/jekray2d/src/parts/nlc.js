import { clamp } from '../core/constants.js';
import { NLC } from '../core/nlc.js';
import { nextName, num } from '../state/project.js';

/* Nonlinear crystal: A periodically poled nonlinear crystal (MgO:PPLN or PPKTP) that doubles the frequency of light polarised along its z axis: the second harmonic leaves as a beam of its own, from Boyd and Kleinman’s theory for the focusing, the poling period and the temperature, and the fundamental leaves depleted. Put a lens before it so the beam focuses in its middle. */
export const NLC_PART = {
  type: 'nlc', label: 'Nonlinear crystal',
  picker: [{ key: 'nlc', short: 'Nonlinear crystal', long: 'Nonlinear crystal (second harmonic: PPLN, PPKTP)' }],
  keys: ['nlc'],
  make: (x, y) => ({ type: 'nlc', name: nextName('Nonlinear crystal'), x, y, angle: 0 }),
  norm(e, base) {
    return Object.assign(base, {
      length: Math.max(0.1, num(e.length, 3)),              // aperture across, mm
      nlLen: clamp(num(e.nlLen, 20), 0.1, 200),             // along the beam, mm
      material: NLC[e.material] ? e.material : 'ppln',
      period: Math.max(0, num(e.period, 0)),                // poling period, um; 0: the best for the beam through it
      temp: clamp(num(e.temp, 40), -50, 250),               // deg C
      axis: e.axis === 'p' ? 'p' : 's',                     // the crystal's z axis: out of the bench plane (s) or in it (p)
      faces: e.faces === 'bare' ? 'bare' : 'ar',            // its end faces: anti-reflection coated (0.1%) or bare
    });
  },
  zHalf: el => Math.max(0.5, (el.length || 10) / 2 * 0.3),
  zSquare: true,
  guide: {
    what: 'A periodically poled nonlinear crystal (MgO:PPLN or PPKTP) that doubles the frequency of light polarised along its z axis: the second harmonic leaves as a beam of its own, from Boyd and Kleinman\u2019s theory for the focusing, the poling period and the temperature, and the fundamental leaves depleted. Put a lens before it so the beam focuses in its middle.',
    angle: 'its axis: 0 for a beam travelling ±x (the crystal lies along x).',
    fields: { length: 'mm: the aperture across the beam.', nlLen: 'mm along the beam (10 to 50 is usual).', material: '"ppln" (MgO:PPLN, d_eff 14 pm/V) or "ppktp" (d_eff 9.5 pm/V).', period: 'poling period, µm; 0 (the default) picks the best period for the beam through it.', temp: '°C: tunes the phase matching (PPLN is usually run hot, 40 to 200).', axis: '"s" (z axis out of the bench plane: s light converts) or "p".', faces: '"ar" (end faces anti-reflection coated, 0.1%; the default) or "bare".' },
  },
};
