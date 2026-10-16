import { deg, nextName, normMat, num } from '../state/project.js';
import { normSurface } from '../state/elements.js';
import { normMount } from '../core/rf.js';
import { normOrder } from '../core/diffractive.js';

/* Lens: A lens of any number of surfaces (singlet, doublet, asphere, diffractive, cylinder, axicon) in real glass. */
export const LENS = {
  type: 'lens', label: 'Lens',
  picker: [{ key: 'lens', short: 'Lens' }, { key: 'asphere', short: 'Asphere' }, { key: 'diffractive', short: 'Diffractive lens' }, { key: 'grinrod', short: 'GRIN rod lens' }, { key: 'cylinder', short: 'Cylindrical lens' }, { key: 'axicon', short: 'Axicon' }],
  keys: ['lens', 'asphere', 'diffractive', 'grinrod', 'cylinder', 'axicon'],
  make(x, y, kind) {
    switch (kind) {
      case 'lens':
        return { type: 'lens', name: nextName('Lens'), x, y, diameter: 25.4,
          surfaces: [{ R: 51.5 }, { R: -51.5 }], gaps: [3.6], materials: [{ glass: 'N-BK7' }] };
      case 'asphere':
        return { type: 'lens', name: nextName('Asphere'), asphere: true, x, y, diameter: 12.7,
          surfaces: [{ R: 8.2, k: -0.9 }, { R: null }], gaps: [5], materials: [{ glass: 'S-LAH64' }] };
      case 'diffractive':
        // a hybrid achromat: a plano-convex lens with a diffractive face whose colour, the opposite way to
        // glass's, cancels its own (f 50 mm, C and F lines meeting)
        return { type: 'lens', name: nextName('Diffractive lens'), diffractive: true, x, y, diameter: 12.7,
          surfaces: [{ R: 27.28 }, { R: null, ph: [-5.938] }], gaps: [4], materials: [{ glass: 'N-BK7' }] };
      case 'grinrod':
        // a graded-index rod lens, a quarter of its pitch long: its index falling as a parabola from 1.608 on
        // its axis (√A = 0.326 mm⁻¹), it brings a collimated beam to a point on its back face
        return { type: 'lens', name: nextName('GRIN rod lens'), graded: true, x, y, diameter: 1.8,
          surfaces: [{ R: null }, { R: null }], gaps: [4.82], materials: [{ glass: 'custom', n: 1.608, grad: [-0.08545] }] };
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
      design: e.design > 0 ? +e.design : undefined,                      // the wavelength it was designed for, nm (from a lens file)
      mount: normMount(e.mount),                                         // a made-to-order RF lens's flange
      // an asphere: its surfaces may have conics and aspheric terms; a plain lens's are spheres. A lens from
      // before the two were told apart is an asphere if any surface has them
      asphere: e.asphere === true || (e.asphere === undefined && surfaces.some(s => s.k || s.a2 || s.A.some(a => a) || s.F)) ? true : undefined,
      // a diffractive lens: its surfaces may carry a phase, in one order of diffraction (not a cylinder's)
      diffractive: !e.cyl && (e.diffractive === true || (e.diffractive === undefined && surfaces.some(s => s.ph))) ? true : undefined,
      diffOrder: e.diffOrder !== undefined && +e.diffOrder !== 1 ? normOrder(e.diffOrder) : undefined,
      // a graded lens: its glasses may grade from its axis (core/gradient.js; not a cylinder's)
      graded: !e.cyl && (e.graded === true || (e.graded === undefined && materials.some(m => m.grad))) ? true : undefined,
    });
  },
  guide: {
    what: 'A lens of any number of surfaces (singlet, doublet, asphere, diffractive, cylinder, axicon) in real glass.',
    angle: 'the direction of its optical axis. Surface 1 is on the side the axis points away from: at angle 0 light travelling +x meets surfaces[0] first.',
    fields: { diameter: 'mm.', surfaces: 'list of surfaces in the order the light meets them at angle 0, each {"R": mm or null for flat, "k": conic, "A": [aspheric a4, a6, …], "coat": coating}. Standard sign convention: R > 0 has its centre of curvature on the far side (downstream).',
    gaps: 'mm: centre thicknesses between successive surfaces (one fewer than surfaces).', materials: 'one material per gap, e.g. {"glass": "N-BK7"}.',
    asphere: 'true for an asphere: only an asphere\u2019s surfaces take a conic ("k"), aspheric terms ("A") and freeform terms ("F": {"mn": c_mn} for c_mn x^m y^n added to the sag, x up out of the bench plane and y across it; m even; "20", "02", "21", "03", "40", "22", "04", "41", "23", "05", "60", "42", "24", "06"); a plain lens\u2019s are spheres.',
    diffractive: 'true for a diffractive lens: its surfaces may take phase terms ("ph": [c1, c2, c3, c4], radians, the phase c1 ρ² + c2 ρ⁴ + c3 ρ⁶ + c4 ρ⁸ with ρ the height on the face in mm), in the order of diffraction "diffOrder" (1 unless given); all the light is taken to go into that order. Its power there is -diffOrder λ c1 / π.',
    graded: 'true for a graded-index lens (a GRIN rod lens): each of its glasses may grade from its axis, "grad": [g2, g4, g6] in its material, the index n(r) = n + g2 r² + g4 r⁴ + g6 r⁶ with r in mm (n the glass\u2019s own); rays in it curve. A rod whose index falls as n0 (1 - A r²/2) has g2 = -n0 A / 2 and a pitch 2π/√A.',
    diffOrder: 'optional: a diffractive lens’s order of diffraction, a whole number (1 unless given).',
    cyl: 'optional: "plane" for a cylindrical lens with power in the bench plane, "out" for power out of it.',
    design: 'optional: nm, the wavelength the lens was designed for (an imported lens file\u2019s primary wavelength); for the reader only, it changes nothing in the trace.',
    mount: 'optional, a made-to-order RF lens only: {"kind": "flange", "width": mm out from the rim, "thick": mm along the axis, "holes": bolt holes (0 to 12), "hole": their diameter, mm}, on the circle through the flange\u2019s middle. Outside the lens: not traced.' },
  },
};
