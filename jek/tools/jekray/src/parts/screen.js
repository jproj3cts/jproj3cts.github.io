import { clamp } from '../core/constants.js';
import { glassKey } from '../core/glass.js';
import { SPHERE_DENSITY, TRAP_ATOMS } from '../core/traps.js';
import { nextName, num } from '../state/project.js';

/* Screen: A screen: records the rays and the field arriving on its face, and gives spot size, profile, PSF, MTF, Strehl and more. */
export const SCREEN = {
  type: 'screen', label: 'Screen',
  picker: [{ key: 'screen', short: 'Screen' }],
  keys: ['screen'],
  make: (x, y) => ({ type: 'screen', name: nextName('Screen'), x, y, angle: 180, length: 25.4 }),
  norm(e, base) {
    return Object.assign(base, { length: Math.max(0.1, num(e.length, 25)), absorb: e.absorb !== false,
      ...(e.faceMap === true ? { faceMap: true } : {}),             // its diffraction pattern painted on its face in the 3D view
      R: (isFinite(e.R) && e.R !== 0 && e.R !== null) ? +e.R : null,
      binWidth: Math.max(0, num(e.binWidth, 0)),
      binInterp: e.binInterp !== false,
      mapScale: e.mapScale === 'log' ? 'log' : 'lin',
      vectorFocus: ['auto', 'on', 'off'].includes(e.vectorFocus) ? e.vectorFocus : 'auto',
      trap: e.trap in TRAP_ATOMS || e.trap === 'sphere' ? e.trap : 'none',   // an atom or a sphere to read an optical trap at this focus for
      trapF: ['lo', 'hi'].includes(e.trapF) ? e.trapF : 'avg',     // atoms: the ground hyperfine level (avg: the centroid)
      trapMat: glassKey(e.trapMat) || 'Fused silica',              // the sphere's material
      trapR: Math.max(1, num(e.trapR, 100)),                       // its radius, nm
      trapRho: Math.max(1, num(e.trapRho, SPHERE_DENSITY[glassKey(e.trapMat) || 'Fused silica'] || 2200)),   // kg/m^3
      trapMed: ['bench', 'vacuum', 'air'].includes(e.trapMed) ? e.trapMed : 'bench',
      trapP: Math.max(1e-12, num(e.trapP, 1013.25)),                // mbar, for air
      trapT: Math.max(0.001, num(e.trapT, 295)),                   // K, for the depth in kT
      mtfFreq: Math.max(0, num(e.mtfFreq, 50)),
      abSrc: typeof e.abSrc === 'string' ? e.abSrc : '',          // the source the Aberrations tab sweeps ('' the first)
      abAng: clamp(num(e.abAng, 2), 0, 60),                        // its largest field angle, degrees (a collimated source)
      abH: Math.max(0, num(e.abH, 1)),                             // or object height, mm (a diverging one)
      abN: Math.round(clamp(num(e.abN, 7), 3, 21)),                // fields across, -largest to +largest
      abRays: Math.round(clamp(num(e.abRays, 61), 11, 401)) | 1 });
  },
  zSquare: true,
  guide: {
    what: 'A screen: records the rays and the field arriving on its face, and gives spot size, profile, PSF, MTF, Strehl and more.',
    angle: 'the direction its face points: towards the light it records.',
    fields: { length: 'mm: the width of its face.', absorb: 'true stops the light it records; false lets it pass (to sample a beam).',
    R: 'mm: a curved screen; negative puts its centre of curvature on the side the light comes from (like a retina); null for flat.', binWidth: 'mm for the binned intensity; 0 chooses.', binInterp: 'true interpolates the rays into the bins.',
    mapScale: '"lin" or "log" irradiance map.', vectorFocus: '"auto", "on" or "off": the vector focus model for steep beams.', trap: '"none", an atom (' + Object.keys(TRAP_ATOMS).map(k => '"' + k + '"').join(', ') + ') or "sphere" (a dielectric sphere) to read an optical trap for near this screen (the Trap tab): where it sits, depth, trap frequencies each way and scattering, from every beam through the screen\u2019s region.', trapF: 'for atoms, the ground hyperfine level they are in: "avg" (the centroid), "lo" or "hi" (F = I \u2213 1/2); it moves the lines by a few GHz, which matters close to them (the tune-out wavelength between D1 and D2 moves by picometres).', trapMat: 'the sphere\u2019s glass ("Fused silica", "Polystyrene" and so on).', trapR: 'the sphere\u2019s radius, nm.', trapRho: 'its density, kg/m\u00b3.', trapMed: '"bench" (the index where the light is: put the focus in a block of "Water" for a liquid), "vacuum" or "air" (with trapP).', trapP: 'air pressure, mbar: sets the gas damping and quality factors.', trapT: 'temperature (K): the depth in kT and the gas.', mtfFreq: 'lp/mm at which the MTF is quoted.', abSrc: 'the id of the fan source the Aberrations tab sweeps across the field ("" for the first reaching the screen).', abAng: 'its largest field angle, degrees, for a collimated source.', abH: 'its largest object height, mm, for a diverging source (a point object).', abN: 'fields across, 3 to 21.', abRays: 'rays in each field\u2019s fan, odd, 11 to 401.' },
  },
};
