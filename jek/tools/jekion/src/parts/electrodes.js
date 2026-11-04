import { SHAPES } from '../core/geom.js';
import { num, str } from '../state/project.js';

/* ==========================================================================
   Electrodes: what each shape's fields are, their defaults (so a file from any version loads: there are no
   format migrations), how a new one is made, and what the guide says of each. The shapes themselves (inside
   tests, sections, triangles) are core/geom.js.
   ========================================================================== */
export const ELECTRODE_COLOURS = ['#5b8def', '#e0742f', '#3aa66a', '#c04fb0', '#d9b32a', '#2aa7b8', '#8f5fd6', '#b8513d'];
/* the fields a shape has beyond the common ones, with their defaults and limits: [key, default, min, max, label, unit] */
export const SHAPE_FIELDS = {
  box: [['sx', 10, 1e-4, 1e5, 'Size along x', 'mm'], ['sy', 10, 1e-4, 1e5, 'Size along y', 'mm'], ['sz', 10, 1e-4, 1e5, 'Size along z', 'mm']],
  rod: [['r', 2, 1e-4, 1e5, 'Radius', 'mm'], ['L', 40, 1e-4, 1e5, 'Length', 'mm']],
  tube: [['rIn', 5, 0, 1e5, 'Inner radius', 'mm'], ['rOut', 7, 1e-4, 1e5, 'Outer radius', 'mm'], ['L', 20, 1e-4, 1e5, 'Length', 'mm']],
  aperture: [['rIn', 2, 0, 1e5, 'Hole radius', 'mm'], ['rOut', 15, 1e-4, 1e5, 'Plate radius', 'mm'], ['L', 1, 1e-4, 1e5, 'Thickness', 'mm']],
  cone: [['r1', 2, 0, 1e5, 'Radius at the start', 'mm'], ['r2', 8, 0, 1e5, 'Radius at the end', 'mm'], ['L', 10, 1e-4, 1e5, 'Length', 'mm'], ['wall', 0, 0, 1e5, 'Wall (0: solid)', 'mm']],
  sphere: [['r', 3, 1e-4, 1e5, 'Radius', 'mm']],
  ring: [['r0', 7.07, 1e-4, 1e5, 'r₀ (inner radius at the midplane)', 'mm'], ['rMax', 15, 1e-4, 1e5, 'Outer radius', 'mm'], ['L', 12, 1e-4, 1e5, 'Height', 'mm']],
  endcap: [['z0', 5, 1e-4, 1e5, 'z₀ (distance to the tip)', 'mm'], ['rMax', 12, 1e-4, 1e5, 'Outer radius', 'mm'], ['L', 8, 1e-4, 1e5, 'Height', 'mm'], ['side', 1, -1, 1, 'Side (+1 or −1)', '']],
  mesh: [],
};
export const SHAPE_ORDER = ['box', 'rod', 'tube', 'aperture', 'cone', 'sphere', 'ring', 'endcap'];
/* a saved electrode as the tool takes it: every field checked and given its default */
export function normElectrode(e, k) {
  e = e && typeof e === 'object' ? e : {};
  const shape = SHAPES[e.shape] ? e.shape : 'box';
  const out = {
    id: str(e.id, 'e' + Math.random().toString(36).slice(2, 9), 24), name: str(e.name, SHAPES[shape].label, 60), shape,
    colour: /^#[0-9a-fA-F]{6}$/.test(e.colour) ? e.colour : ELECTRODE_COLOURS[(k || 0) % ELECTRODE_COLOURS.length],
    x: num(e.x, 0), y: num(e.y, 0), z: num(e.z, 0), axis: ['x', 'y', 'z'].includes(e.axis) ? e.axis : 'x',
    V: num(e.V, 0), on: e.on !== false, locked: !!e.locked, transparent: !!e.transparent,
    rf: { on: !!(e.rf && e.rf.on), amp: Math.max(0, num(e.rf && e.rf.amp, 100)), mhz: Math.max(1e-9, num(e.rf && e.rf.mhz, 1)), phase: num(e.rf && e.rf.phase, 0) },
  };
  for (const [key, d, lo, hi] of SHAPE_FIELDS[shape]) out[key] = Math.min(hi, Math.max(lo, num(e[key], d)));
  if (shape === 'endcap') out.side = out.side < 0 ? -1 : 1;
  if (shape === 'tube' || shape === 'aperture') { if (out.rOut <= out.rIn) out.rOut = out.rIn + 0.5; }
  if (shape === 'ring' && out.rMax <= out.r0) out.rMax = out.r0 * 2;
  if (shape === 'mesh') out.mesh = e.mesh || null;
  if (e.notes) out.notes = str(e.notes, '', 400);
  return out;
}
export function makeElectrode(shape, x, y, k, names) {
  const el = normElectrode({ shape, x, y, z: 0 }, k);
  el.name = nextOf(SHAPES[shape].label, names);
  return el;
}
const nextOf = (prefix, names) => { const used = new Set(names || []); let i = 1; while (used.has(prefix + ' ' + i)) i++; return prefix + ' ' + i; };
export const ELECTRODE_GUIDE = {
  what: 'An electrode: a conductor held at a voltage (and, with "rf" on, swinging about it at a frequency). Its shape and place set the geometry; the solver works out the potential everywhere from all of them together.',
  fields: { V: 'its voltage, volts (the static part).', rf: '{ on, amp, mhz, phase }: an RF swing of amp volts (amplitude, not peak to peak) at mhz megahertz, phase degrees, added to V.',
    axis: '"x", "y" or "z": the axis a body of revolution is made about (a box ignores it).', x: 'the centre, mm (a hyperbolic ring and endcap: the trap’s centre).', y: 'the centre, mm.', z: 'the centre, mm (0 in a planar or cylindrical array).',
    on: 'false leaves it out of the array (kept in the file).', transparent: 'true makes it a grid: it shapes the field as any electrode, but particles pass through it (a mesh of high transmission; the extraction grids of a time-of-flight source, a reflectron\u2019s entrance grid).', colour: '"#rrggbb" as drawn.' },
};
