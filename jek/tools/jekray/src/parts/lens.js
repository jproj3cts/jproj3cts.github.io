import { deg, nextName, normCoat, normMat, num } from '../state/project.js';
import { normMirror, normSurface } from '../state/elements.js';
import { normMount, normZoned } from '../core/rf.js';
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
    let surfaces = (Array.isArray(e.surfaces) && e.surfaces.length >= 2 ? e.surfaces : [{}, {}]).map(normSurface);
    let gaps = surfaces.slice(1).map((_, i) => Math.max(0, num(e.gaps && e.gaps[i], 3)));
    let materials = surfaces.slice(1).map((_, i) => normMat(e.materials && e.materials[i]));
    // a lens saved before surfaces had holes and stacks: a face's "mirror" zone becomes the surfaces it stood for, stacked
    // on the face (a gap of 0): a spot is a small mirror-coated surface on a face with a hole; an annulus a mirror-coated face
    // with a hole and a plain surface in its middle; a shaped centre a surface of its own in a hole; a whole face its coating
    if (Array.isArray(e.surfaces) && e.surfaces.some(s => s && s.mirror)) {
      let S = [], G = [], M = []; const MIRROR = { mode: 'mirror', metal: 'ideal' };
      surfaces.forEach((f, i) => {
        const m = normMirror(e.surfaces[i] && e.surfaces[i].mirror), after = i < materials.length ? materials[i] : materials[materials.length - 1];
        S.push(f);
        if (m && m.zone === 'all') f.coat = normCoat(MIRROR);
        else if (m && m.r > 0 && (m.zone !== 'none' || m.R !== undefined)) {
          const r = Math.min(m.r, f.semi || base.diameter / 2 || m.r);
          const centre = Object.assign({}, f, { semi: r, hole: 0, A: f.A.slice(), coat: normCoat(f.coat) });
          if (m.R !== undefined) Object.assign(centre, { R: m.R, k: m.k || 0, a2: 0, A: [], odd: undefined, F: undefined, ph: undefined });
          if (m.zone === 'in') centre.coat = normCoat(MIRROR);
          if (m.zone === 'out') f.coat = normCoat(MIRROR);
          f.hole = r;
          G.push(0); M.push(normMat(after)); S.push(centre);
        }
        if (i < gaps.length) { G.push(gaps[i]); M.push(materials[i]); }
      });
      // faces the old file had at one vertex (a gap of 0 between them) now share a stack with the surfaces made from their
      // zones, and may overlap: a narrower member wins where two reach, the wider one holed or clipped back to it, and a member
      // left with nothing is dropped
      const dia2 = base.diameter / 2 || 12.7, outer = s => (s.semi || dia2), width = s => outer(s) - (s.hole || 0);
      const stacks = []; S.forEach((s, i) => { if (!i || G[i - 1] !== 0) stacks.push([i]); else stacks[stacks.length - 1].push(i); });
      const drop = new Set();
      for (const st of stacks) {
        const order = st.slice().sort((a, b) => width(S[a]) - width(S[b]));
        for (let q = 1; q < order.length; q++) {
          const w = S[order[q]];
          for (let n = 0; n < q; n++) {
            const m = S[order[n]]; if (drop.has(order[n])) continue;
            const lo = Math.max(m.hole || 0, w.hole || 0), hi = Math.min(outer(m), outer(w));
            if (hi - lo <= 1e-9) continue;                                              // no overlap
            if ((m.hole || 0) <= (w.hole || 0) + 1e-9) w.hole = outer(m);               // the narrow one at the wide one's inside: holed to it
            else if (outer(m) >= outer(w) - 1e-9) w.semi = m.hole;                      // at its outside: clipped to it
            else { w.semi = m.hole; }                                                   // in its middle: the wide one keeps its inside
          }
          if (width(w) <= 1e-9) drop.add(order[q]);
        }
      }
      if (drop.size) {
        const S2 = [], G2 = [], M2 = [];
        S.forEach((s, i) => { if (drop.has(i)) { if (i < G.length && G[i] !== 0 && G2.length) G2[G2.length - 1] += G[i]; return; } S2.push(s); if (i < G.length) { G2.push(G[i]); M2.push(M[i]); } });
        while (G2.length >= S2.length) { G2.pop(); M2.pop(); }
        S = S2; G = G2; M = M2;
      }
      surfaces = S; gaps = G; materials = M;
    }
    // a hole as wide as the surface's own face would leave no surface at all: no hole, then (the Optical designer refuses one)
    const half = Math.max(0.1, num(e.diameter, 25.4)) / 2;
    for (const s of surfaces) if (s.hole >= (s.semi || half) - 1e-9) s.hole = 0;
    return Object.assign(base, {
      diameter: Math.max(0.1, num(e.diameter, 25.4)),
      surfaces, gaps, materials,
      cyl: e.cyl === 'plane' || e.cyl === 'out' ? e.cyl : undefined,    // cylindrical: power in the bench plane, or out of it
      source: typeof e.source === 'string' ? e.source : undefined,
      design: e.design > 0 ? +e.design : undefined,                      // the wavelength it was designed for, nm (from a lens file)
      mount: normMount(e.mount),                                         // a made-to-order RF lens's flange
      zoned: normZoned(e.zoned),                                         // a made-to-order RF lens cut in zones (core/rf.js lensZones)
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
    fields: { diameter: 'mm.', surfaces: 'list of surfaces in the order the light meets them at angle 0, each {"R": mm or null for flat, "k": conic, "A": [aspheric a4, a6, …], "coat": coating ({"mode": "bare" | "ar" | "custom" | "band" | "stack" | "mirror"}; a mirror coating reflects all it can and passes nothing, "metal": "ideal" | "Al" | "Ag" | "Au" for its reflectance), "semi": optional clear radius, mm (the lens\u2019s own unless given), "hole": optional, mm: a hole about the axis where there is no surface, so the light meets the next surface stacked on this one, or goes on}. A gap of 0 stacks the next surface on this one at the same vertex: each then applies between its hole and its clear radius (a spot mirror in a hole, a flat ground into a face\u2019s middle, a mirrored annulus round a clear centre). Standard sign convention: R > 0 has its centre of curvature on the far side (downstream).',
    gaps: 'mm: centre thicknesses between successive surfaces (one fewer than surfaces); 0 stacks the next surface on this one (the two share a vertex, each applying between its hole and its clear radius).', materials: 'one material per gap, e.g. {"glass": "N-BK7"}.',
    asphere: 'true for an asphere: only an asphere\u2019s surfaces take a conic ("k"), aspheric terms ("A") and freeform terms ("F": {"mn": c_mn} for c_mn x^m y^n added to the sag, x up out of the bench plane and y across it; m even; "20", "02", "21", "03", "40", "22", "04", "41", "23", "05", "60", "42", "24", "06"); a plain lens\u2019s are spheres.',
    diffractive: 'true for a diffractive lens: its surfaces may take phase terms ("ph": [c1, c2, c3, c4], radians, the phase c1 ρ² + c2 ρ⁴ + c3 ρ⁶ + c4 ρ⁸ with ρ the height on the face in mm), in the order of diffraction "diffOrder" (1 unless given); all the light is taken to go into that order. Its power there is -diffOrder λ c1 / π.',
    graded: 'true for a graded-index lens (a GRIN rod lens): each of its glasses may grade from its axis, "grad": [g2, g4, g6] in its material, the index n(r) = n + g2 r² + g4 r⁴ + g6 r⁶ with r in mm (n the glass\u2019s own); rays in it curve. A rod whose index falls as n0 (1 - A r²/2) has g2 = -n0 A / 2 and a pitch 2π/√A.',
    diffOrder: 'optional: a diffractive lens’s order of diffraction, a whole number (1 unless given).',
    cyl: 'optional: "plane" for a cylindrical lens with power in the bench plane, "out" for power out of it.',
    design: 'optional: nm, the wavelength the lens was designed for (an imported lens file\u2019s primary wavelength); for the reader only, it changes nothing in the trace.',
    mount: 'optional, a made-to-order RF lens only: {"kind": "flange", "width": mm out from the rim, "thick": mm along the axis, "holes": bolt holes (0 to 12), "hole": their diameter, mm}, on the circle through the flange\u2019s middle. Outside the lens: not traced.',
    zoned: 'optional, a made-to-order RF lens of two faces only: {"ghz": its zone frequency} to have it cut in zones, whole layers a wave of path deep at that frequency taken out of its curved face where it is thick. The bench traces it as cut (a ray meeting a step\u2019s wall is lost); the RF designer, its weight and its quote take it as cut too.' },
  },
};
