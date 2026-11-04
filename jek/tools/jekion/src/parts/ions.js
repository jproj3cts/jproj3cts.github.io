import { SPECIES } from '../core/units.js';
import { num, str } from '../state/project.js';

/* ==========================================================================
   Ion groups: a bunch of particles started together, and the detectors that record them.
   ========================================================================== */
export const ION_COLOURS = ['#e8402a', '#2a7de8', '#1f9d55', '#c2399f', '#e0a020', '#17a2b8'];
export const DISTS = { point: 'A point', disc: 'A disc (across the direction)', sphere: 'A ball', line: 'A line (across the direction)', gauss: 'Gaussian cloud (σ)', grid: 'Evenly along a line' };
export function normIon(e, k) {
  e = e && typeof e === 'object' ? e : {};
  const sp = SPECIES[e.species] ? e.species : 'custom';
  const out = {
    id: str(e.id, 'i' + Math.random().toString(36).slice(2, 9), 24), name: str(e.name, 'Ions', 60), colour: /^#[0-9a-fA-F]{6}$/.test(e.colour) ? e.colour : ION_COLOURS[(k || 0) % ION_COLOURS.length],
    on: e.on !== false, locked: !!e.locked,
    n: Math.max(1, Math.min(5000, Math.round(num(e.n, 11)))),
    species: sp, mass: sp === 'custom' ? Math.max(1e-6, num(e.mass, 40)) : SPECIES[sp].mass, charge: sp === 'custom' ? num(e.charge, 1) || 1 : SPECIES[sp].charge,
    ke: Math.max(0, num(e.ke, 10)), keSpread: Math.max(0, num(e.keSpread, 0)),
    x: num(e.x, 0), y: num(e.y, 0), z: num(e.z, 0), dist: DISTS[e.dist] ? e.dist : 'line', size: Math.max(0, num(e.size, 2)),
    dirAz: num(e.dirAz, 0), dirEl: num(e.dirEl, 0), cone: Math.max(0, Math.min(180, num(e.cone, 0))),
    t0: Math.max(0, num(e.t0, 0)), tSpread: Math.max(0, num(e.tSpread, 0)), weight: Math.max(0, num(e.weight, 1)),
  };
  if (e.notes) out.notes = str(e.notes, '', 400);
  return out;
}
export function normDetector(e, k) {
  e = e && typeof e === 'object' ? e : {};
  const axis = ['x', 'y', 'z'].includes(e.axis) ? e.axis : 'x';
  const out = { id: str(e.id, 'd' + Math.random().toString(36).slice(2, 9), 24), name: str(e.name, 'Detector', 60), colour: /^#[0-9a-fA-F]{6}$/.test(e.colour) ? e.colour : '#444a52',
    on: e.on !== false, locked: !!e.locked, axis, x: num(e.x, 0), y: num(e.y, 0), z: num(e.z, 0), half: Math.max(0, num(e.half, 0)), stop: e.stop !== false };
  out.at = out[axis];
  if (e.notes) out.notes = str(e.notes, '', 400);
  return out;
}
export const ION_GUIDE = {
  what: 'An ion group: n particles of one species started from a place with an energy and a direction, flown together. Each flown particle stands for `weight` real charges when space charge is on.',
  fields: { species: 'a name from the list ("Ar+", "e-", "Cs+"…) or "custom" with mass (u) and charge (e).', n: 'how many are flown.', ke: 'kinetic energy, eV; keSpread its FWHM (Gaussian).',
    dist: '"point", "disc", "sphere", "line", "gauss" or "grid": how the starting points spread, by size (a radius, half-length or σ, mm).',
    dirAz: 'the direction’s angle in the x–y plane from +x, degrees; dirEl its elevation out of the plane; cone the half-angle of a cone about it (uniform in solid angle).',
    t0: 'when the first starts, µs; tSpread spreads the starts uniformly over that long.' },
};
export const DETECTOR_GUIDE = {
  what: 'A detector: a plane across one axis (axis "x" at x = at, etc.), square of half-width `half` (0: unbounded), recording every particle that crosses it (its position, time, energy and direction) and, with stop true, ending its flight there.',
  fields: { axis: '"x", "y" or "z".', x: 'its centre; the coordinate along its axis is where the plane is.', half: 'half-width, mm (0 for a plane without edges).', stop: 'true stops particles there; false lets them through, recorded.' },
};
