import { clamp } from '../core/constants.js';
import { SPHERE_DENSITY, TRAP_ATOMS, particleMat } from '../core/traps.js';
import { nextName, num } from '../state/project.js';

export const PHOSPHOR_GLOW = '#4dff7a';           // a green phosphor's glow, the usual

/* Screen: A screen: records the rays and the field arriving on its face, and gives spot size, profile, PSF, MTF, Strehl and more. */
export const SCREEN = {
  type: 'screen', label: 'Screen',
  picker: [{ key: 'screen', short: 'Screen' }, { key: 'phosphor', short: 'Phosphor', long: 'Phosphor screen (glows, with a fading trail)' }],
  keys: ['screen', 'phosphor'],
  // a phosphor screen: a screen whose face glows where the light lands and fades after it, shown on its face in 3D
  make: (x, y, kind) => kind === 'phosphor'
    ? { type: 'screen', name: nextName('Phosphor screen'), x, y, angle: 180, length: 25.4, phosphor: true, decay: 1, glow: PHOSPHOR_GLOW }
    : { type: 'screen', name: nextName('Screen'), x, y, angle: 180, length: 25.4 },
  norm(e, base) {
    return Object.assign(base, { length: Math.max(0.1, num(e.length, 25)), absorb: e.absorb !== false,
      ...(e.phosphor === true ? { phosphor: true,
        decay: clamp(num(e.decay, 1), 0.01, 120),                  // s: the glow falls to 1/e this long after the light moves on
        glow: /^#[0-9a-f]{6}$/i.test(e.glow) ? e.glow.toLowerCase() : PHOSPHOR_GLOW } : {}),
      ...(e.faceMap === true ? { faceMap: true } : {}),             // its diffraction pattern painted on its face in the 3D view
      R: (isFinite(e.R) && e.R !== 0 && e.R !== null) ? +e.R : null,
      binWidth: Math.max(0, num(e.binWidth, 0)),
      binInterp: e.binInterp !== false,
      mapScale: e.mapScale === 'log' ? 'log' : 'lin',
      vectorFocus: ['auto', 'on', 'off'].includes(e.vectorFocus) ? e.vectorFocus : 'auto',
      trap: e.trap in TRAP_ATOMS || e.trap === 'sphere' ? e.trap : 'none',   // an atom or a sphere to read an optical trap at this focus for
      trapF: ['lo', 'hi'].includes(e.trapF) ? e.trapF : 'avg',     // atoms: the ground hyperfine level (avg: the centroid)
      trapMat: particleMat(e.trapMat),                             // the particle's material: a glass, or Au, Ag, Al
      trapR: Math.max(1, num(e.trapR, 100)),                       // its radius, nm (half its diameter)
      trapRho: Math.max(1, num(e.trapRho, SPHERE_DENSITY[particleMat(e.trapMat)] || 2200)),   // kg/m^3
      trapMed: ['bench', 'vacuum', 'air', 'water'].includes(e.trapMed) ? e.trapMed : 'bench',
      // the particle's shape (a sphere unless said), its whole length along its axis (nm), and where the axis points:
      // its direction in the bench plane (degrees, as parts' angles) and its tilt up out of it
      trapShape: ['cylinder', 'capsule', 'spheroid'].includes(e.trapShape) ? e.trapShape : 'sphere',
      trapLen: Math.max(1, num(e.trapLen, 1000)),
      trapAz: num(e.trapAz, 90), trapTilt: clamp(num(e.trapTilt, 0), -90, 90),
      // the Scattering tab: the model, dipoles across the smallest dimension (0 chooses), where the particle is
      // ('screen': where the strongest beam meets the screen; 'trap': where the trap holds it) and its offset from
      // there (µm: across the beam in the plane, out of the plane, along the beam), and the detector's cone
      scatModel: ['rayleigh', 'mie', 'dda'].includes(e.scatModel) ? e.scatModel : 'auto',
      scatDip: Math.round(clamp(num(e.scatDip, 0), 0, 64)),
      scatAt: e.scatAt === 'trap' ? 'trap' : 'screen',
      scatDx: num(e.scatDx, 0), scatDy: num(e.scatDy, 0), scatDz: num(e.scatDz, 0),
      scatNA: clamp(num(e.scatNA, 0.5), 0.001, 4),
      scatDir: ['back', 'side', 'up', 'angle'].includes(e.scatDir) ? e.scatDir : 'fwd',
      scatAng: num(e.scatAng, 0),
      scatScale: e.scatScale === 'lin' ? 'lin' : 'log',
      scatView: ['out', 'map'].includes(e.scatView) ? e.scatView : 'in',
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
    fields: { length: 'mm: the width of its face.', phosphor: 'true: a phosphor screen, whose face glows where the light lands and fades after the light moves on, leaving a trail (from the rays, or the diffracted field when it is shown); its face shows the glow in 3D. Made by the picker\u2019s Phosphor.', decay: 'a phosphor screen\u2019s decay time, s: the glow falls to 1/e of its brightness this long after the light leaves (0.01 to 120).', glow: 'a phosphor screen\u2019s glow colour, "#rrggbb".', absorb: 'true stops the light it records; false lets it pass (to sample a beam).',
    R: 'mm: a curved screen; negative puts its centre of curvature on the side the light comes from (like a retina); null for flat.', binWidth: 'mm for the binned intensity; 0 chooses.', binInterp: 'true interpolates the rays into the bins.',
    mapScale: '"lin" or "log" irradiance map.', vectorFocus: '"auto", "on" or "off": the vector focus model for steep beams.', trap: '"none", an atom (' + Object.keys(TRAP_ATOMS).map(k => '"' + k + '"').join(', ') + ') or "sphere" (a dielectric sphere) to read an optical trap for near this screen (the Trap tab): where it sits, depth, trap frequencies each way and scattering, from every beam through the screen\u2019s region.', trapF: 'for atoms, the ground hyperfine level they are in: "avg" (the centroid), "lo" or "hi" (F = I \u2213 1/2); it moves the lines by a few GHz, which matters close to them (the tune-out wavelength between D1 and D2 moves by picometres).', trapMat: 'the particle\u2019s material: a glass ("Fused silica", "Polystyrene" and so on), or "Au", "Ag", "Al" (metals, which absorb: their measured complex index).', trapR: 'the particle\u2019s radius, nm: half its diameter (for a rod or spheroid, half the diameter across its axis).', trapRho: 'its density, kg/m\u00b3.', trapMed: '"bench" (the index where the light is: put the focus in a block of "Water" for a liquid), "vacuum", "air" (with trapP) or "water" (water\u2019s index for the particle, the bench\u2019s focus left as it is).', trapShape: 'the particle\u2019s shape: "sphere", "cylinder" (a rod with flat ends), "capsule" (a rod with round ends) or "spheroid". The Scattering tab takes the shape as it is; the Trap tab takes the sphere of the same volume.', trapLen: 'nm: a rod\u2019s or spheroid\u2019s whole length along its axis (a capsule\u2019s includes its caps; a spheroid shorter than its diameter is oblate).', trapAz: 'degrees: the direction of the particle\u2019s axis in the bench plane, as parts\u2019 angles.', trapTilt: 'degrees: its axis tilted up out of the bench plane (90: straight up).', scatModel: 'the Scattering tab\u2019s model: "auto" (Mie for a sphere, a dipole array for other shapes, one dipole when tiny), "rayleigh", "mie" or "dda".', scatDip: 'dipoles across the particle\u2019s smallest dimension in a dipole-array run; 0 chooses (10, and no spacing above 0.5/(|m|k)).', scatAt: 'where the particle is: "screen" (where the strongest beam meets the screen) or "trap" (where the Trap tab finds it held).', scatDx: '\u00b5m: the particle moved from there across the beam in the bench plane.', scatDy: '\u00b5m: out of the plane.', scatDz: '\u00b5m: along the beam.', scatNA: 'the numerical aperture (in the medium) of the cone the collected fraction is taken over.', scatDir: 'that cone\u2019s direction: "fwd" (along the strongest beam), "back", "side" (across it in the plane), "up" or "angle" (scatAng).', scatAng: 'degrees: the cone\u2019s direction on the bench when scatDir is "angle".', scatScale: '"log" or "lin": the scattering plots\u2019 scale.', scatView: 'the scattering plot shown: "in" (the bench plane), "out" (the plane out of it) or "map".', trapP: 'air pressure, mbar: sets the gas damping and quality factors.', trapT: 'temperature (K): the depth in kT and the gas.', mtfFreq: 'lp/mm at which the MTF is quoted.', abSrc: 'the id of the fan source the Aberrations tab sweeps across the field ("" for the first reaching the screen).', abAng: 'its largest field angle, degrees, for a collimated source.', abH: 'its largest object height, mm, for a diverging source (a point object).', abN: 'fields across, 3 to 21.', abRays: 'rays in each field\u2019s fan, odd, 11 to 401.' },
  },
};
