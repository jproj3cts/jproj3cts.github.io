import { clamp } from '../core/constants.js';
import { SPHERE_DENSITY, particleMat } from '../core/traps.js';
import { nextName, num } from '../state/project.js';

/* Particle: one small particle (a sphere, a rod or a spheroid) at a point of the bench, in whatever light reaches it.
   Its Trap and Scattering tabs read the trap the light makes for it and the light it scatters, and the scattered
   light is put back on the bench (engines/scatter-light.js). It is a point: no surface, so the trace never meets it.
   Its fields are the ones a screen's particle has (trapShape, trapR, ... scat*), so the engines take either. */
export const PARTICLE = {
  type: 'particle', label: 'Particle',
  picker: [{ key: 'particle', short: 'Particle', long: 'Particle (a sphere or rod that scatters the light)' }],
  keys: ['particle'],
  // its angle is the direction of its axis in the bench plane (a rod's or spheroid's; a sphere has none)
  make: (x, y) => ({ type: 'particle', name: nextName('Particle'), x, y, angle: 90 }),
  norm(e, base) {
    return Object.assign(base, {
      trap: 'sphere',
      trapMat: particleMat(e.trapMat),                             // its material: a glass, or Au, Ag, Al
      trapR: Math.max(1, num(e.trapR, 150)),                       // its radius, nm (half its diameter)
      trapRho: Math.max(1, num(e.trapRho, SPHERE_DENSITY[particleMat(e.trapMat)] || 2200)),   // kg/m^3
      trapMed: ['bench', 'vacuum', 'air', 'water'].includes(e.trapMed) ? e.trapMed : 'bench',
      trapShape: ['cylinder', 'capsule', 'spheroid'].includes(e.trapShape) ? e.trapShape : 'sphere',
      trapLen: Math.max(1, num(e.trapLen, 1000)),
      trapTilt: clamp(num(e.trapTilt, 0), -90, 90),
      trapP: Math.max(1e-12, num(e.trapP, 1013.25)),                // mbar, for air
      trapT: Math.max(0.001, num(e.trapT, 295)),                   // K, for the depth in kT
      scatModel: ['rayleigh', 'mie', 'dda'].includes(e.scatModel) ? e.scatModel : 'auto',
      scatDip: Math.round(clamp(num(e.scatDip, 0), 0, 64)),
      scatAt: e.scatAt === 'trap' ? 'trap' : 'part',               // where it is: at the part, or where the trap near it holds it
      scatDx: num(e.scatDx, 0), scatDy: num(e.scatDy, 0), scatDz: num(e.scatDz, 0),
      scatNA: clamp(num(e.scatNA, 0.5), 0.001, 4),
      scatDir: ['back', 'side', 'up', 'angle'].includes(e.scatDir) ? e.scatDir : 'fwd',
      scatAng: num(e.scatAng, 0),
      scatScale: e.scatScale === 'lin' ? 'lin' : 'log',
      scatView: ['out', 'map'].includes(e.scatView) ? e.scatView : 'in',
      scatLight: e.scatLight !== false,                            // its scattered light on the bench, to the parts that catch it
      scatFan: e.scatFan !== false,                                // and the faint fan in every direction (a picture only)
    });
  },
  guide: {
    what: 'One small particle at a point of the bench: a sphere, a rod or a spheroid, in whatever light reaches it. Its Scattering tab gives its cross-sections and the light it scatters (Lorenz–Mie for a sphere, a dipole array for a rod), its Trap tab the optical trap the light makes for it. The scattered light goes to the parts that catch it, as light of the laser that drives the particle: a lens collimates it, a photodetector reads it with the unscattered beam as fields. The light itself passes the particle untouched.',
    angle: 'the direction of a rod’s or spheroid’s axis in the bench plane (a sphere has none).',
    fields: { trap: 'always "sphere": the part is a particle (the field a screen\u2019s particle is told by).', trapMat: 'the particle’s material: a glass ("Fused silica", "Polystyrene" and so on), or "Au", "Ag", "Al" (metals, which absorb: their measured complex index).', trapR: 'the particle’s radius, nm: half its diameter (for a rod or spheroid, half the diameter across its axis).', trapRho: 'its density, kg/m³.',
      trapMed: '"bench" (the index where the light is), "vacuum", "air" (with trapP) or "water".', trapShape: '"sphere", "cylinder" (a rod with flat ends), "capsule" (a rod with round ends) or "spheroid".', trapLen: 'nm: a rod’s or spheroid’s whole length along its axis.', trapTilt: 'degrees: its axis tilted up out of the bench plane (90: straight up).',
      trapP: 'mbar: the air’s pressure, for trapMed "air".', trapT: 'K: the temperature the trap’s depth is compared with.',
      scatModel: '"auto" (Mie for a sphere, a dipole array for other shapes, Rayleigh when tiny), "rayleigh", "mie" or "dda".', scatDip: 'dipoles across the smallest dimension of a dipole array (0 chooses).',
      scatAt: '"part": the particle is where the part is; "trap": where the optical trap nearest the part holds it.', scatDx: 'µm: moved from there across the strongest beam, in the bench plane.', scatDy: 'µm: moved up out of the plane.', scatDz: 'µm: moved along the beam.',
      scatNA: 'the numerical aperture of the cone the Scattering tab’s Collected figure is for.', scatDir: 'that cone’s direction: "fwd", "back", "side", "up" or "angle" (with scatAng).', scatAng: 'degrees: the cone’s direction on the bench, for scatDir "angle".',
      scatScale: '"log" or "lin": the pattern plots’ scale.', scatView: '"in" (the bench plane), "out" (the plane out of it through the beam) or "map" (every direction).',
      scatLight: 'true puts the scattered light on the bench: a cone to each part with a clear line to the particle, with the far field’s amplitude, phase and polarisation, coherent with the driving laser. false leaves the bench as it is without it.',
      scatFan: 'true draws a faint fan of the scattered light in every direction, as bright as the pattern is; a picture only, never part of a reading.' },
  },
};
