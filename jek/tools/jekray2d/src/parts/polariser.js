import { nextName, num } from '../state/project.js';

/* Polariser: A linear polariser. */
export const POLARISER = {
  type: 'polariser', label: 'Polariser',
  picker: [{ key: 'polariser', short: 'Polariser' }],
  keys: ['polariser'],
  make: (x, y) => ({ type: 'polariser', name: nextName('Polariser'), x, y, angle: 0, axis: 0 }),
  norm(e, base) {
    return Object.assign(base, {
      length: Math.max(0.1, num(e.length, 25.4)),
      axis: num(e.axis, 0),
      // a wire grid (RF): pitch g and wire radius a, mm; its axis 0 for wires across the bench (upright), 90 for wires in its plane
      ...(e.grid && typeof e.grid === 'object' ? { grid: { g: Math.max(1e-4, num(e.grid.g, 0.025)), a: Math.max(1e-5, num(e.grid.a, 0.005)) } } : {}),
    });
  },
  guide: {
    what: 'A linear polariser.',
    angle: 'its normal: 0 for a beam travelling ±x.',
    fields: { length: 'mm aperture.', axis: 'degrees: the transmission axis from p (0 passes p, 90 passes s).',
      grid: 'a wire grid (RF): { "g": mm pitch, "a": mm wire radius }; it then reflects the field along its wires (axis 0: wires upright, reflecting s; 90: wires in the bench plane, reflecting p) by its pitch and wire size, and leaks a little of the other.' },
  },
};
