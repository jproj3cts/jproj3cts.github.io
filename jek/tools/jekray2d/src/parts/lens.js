import { deg, nextName, normMat, num } from '../state/project.js';
import { normSurface } from '../state/elements.js';

/* Lens: A lens of any number of surfaces (singlet, doublet, asphere, cylinder, axicon) in real glass. */
export const LENS = {
  type: 'lens', label: 'Lens',
  picker: [{ key: 'lens', short: 'Lens' }, { key: 'asphere', short: 'Asphere' }, { key: 'cylinder', short: 'Cylindrical lens' }, { key: 'axicon', short: 'Axicon' }],
  keys: ['lens', 'asphere', 'cylinder', 'axicon'],
  make(x, y, kind) {
    switch (kind) {
      case 'lens':
        return { type: 'lens', name: nextName('Lens'), x, y, diameter: 25.4,
          surfaces: [{ R: 51.5 }, { R: -51.5 }], gaps: [3.6], materials: [{ glass: 'N-BK7' }] };
      case 'asphere':
        return { type: 'lens', name: nextName('Asphere'), x, y, diameter: 12.7,
          surfaces: [{ R: 8.2, k: -0.9 }, { R: null }], gaps: [5], materials: [{ glass: 'S-LAH64' }] };
      case 'cylinder':
        return { type: 'lens', name: nextName('Cylindrical lens'), x, y, diameter: 25.4, cyl: 'plane',
          surfaces: [{ R: 25.8 }, { R: null }], gaps: [5], materials: [{ glass: 'N-BK7' }] };
      case 'axicon':
        return { type: 'lens', name: nextName('Axicon'), x, y, diameter: 25.4,
          surfaces: [{ R: null, odd: [Math.tan(10 * deg)] }, { R: null }], gaps: [5], materials: [{ glass: 'Fused silica' }] };
    }
  },
  norm(e, base) {
    const surfaces = (Array.isArray(e.surfaces) && e.surfaces.length >= 2 ? e.surfaces : [{}, {}]).map(normSurface);
    const gaps = surfaces.slice(1).map((_, i) => Math.max(0, num(e.gaps && e.gaps[i], 3)));
    const materials = surfaces.slice(1).map((_, i) => normMat(e.materials && e.materials[i]));
    return Object.assign(base, {
      diameter: Math.max(0.1, num(e.diameter, 25.4)),
      surfaces, gaps, materials,
      cyl: e.cyl === 'plane' || e.cyl === 'out' ? e.cyl : undefined,    // cylindrical: power in the bench plane, or out of it
      source: typeof e.source === 'string' ? e.source : undefined,
    });
  },
  guide: {
    what: 'A lens of any number of surfaces (singlet, doublet, asphere, cylinder, axicon) in real glass.',
    angle: 'the direction of its optical axis. Surface 1 is on the side the axis points away from: at angle 0 light travelling +x meets surfaces[0] first.',
    fields: { diameter: 'mm.', surfaces: 'list of surfaces in the order the light meets them at angle 0, each {"R": mm or null for flat, "k": conic, "A": [aspheric a4, a6, …], "coat": coating}. Standard sign convention: R > 0 has its centre of curvature on the far side (downstream).',
    gaps: 'mm: centre thicknesses between successive surfaces (one fewer than surfaces).', materials: 'one material per gap, e.g. {"glass": "N-BK7"}.',
    cyl: 'optional: "plane" for a cylindrical lens with power in the bench plane, "out" for power out of it.' },
  },
};
