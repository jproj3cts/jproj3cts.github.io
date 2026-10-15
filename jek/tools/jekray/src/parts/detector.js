import { DETECTOR_MATERIALS } from '../core/rf.js';
import { nextName, num } from '../state/project.js';

/* Photodetector: A free-space photodiode with an amplifier: DC, beat notes, RF spectrum, oscilloscope trace and a mixer output. */
export const DETECTOR = {
  type: 'detector', label: 'Photodetector',
  picker: [{ key: 'detector', short: 'Photodetector' }],
  keys: ['detector'],
  make: (x, y) => ({ type: 'detector', name: nextName('Detector'), x, y, angle: 180 }),
  norm(e, base) {
    return Object.assign(base, {
      length: Math.max(0.01, num(e.length, 3.6)),      // active area's diameter
      material: DETECTOR_MATERIALS[e.material] ? e.material : 'si',
      resp: Math.max(0, num(e.resp, 0.5)),             // A/W, for a fixed responsivity
      gain: Math.max(0, num(e.gain, 1e4)),             // transimpedance, V/A
      bandwidth: Math.max(1, num(e.bandwidth, 1e6)),   // Hz
      dark: Math.max(0, num(e.dark, 1)),               // nA
      ampNoise: Math.max(0, num(e.ampNoise, 2)),       // input current noise, pA/rtHz
      vmax: Math.max(0.01, num(e.vmax, 10)),           // output swing, V
      demodF: Math.max(0, num(e.demodF, 0)),           // mixer frequency, MHz (0: none)
      demodPhase: num(e.demodPhase, 0),                // and its phase, degrees
      absorb: true,
    });
  },
  guide: {
    what: 'A free-space photodiode with an amplifier: DC, beat notes, RF spectrum, oscilloscope trace and a mixer output.',
    angle: 'the direction its face points: towards the light.',
    fields: { length: 'mm: the active area’s diameter.', material: 'one of the detector materials below.', resp: 'A/W, used when material is "custom".', gain: 'V/A transimpedance.',
    bandwidth: 'Hz.', dark: 'nA dark current.', ampNoise: 'pA/√Hz input noise.', vmax: 'V output limit.',
    demodF: 'MHz: mix the output down at this frequency (0: no mixer). With an EOM at fm, this gives a PDH error signal.', demodPhase: 'degrees: the mixer’s phase.' },
  },
};
