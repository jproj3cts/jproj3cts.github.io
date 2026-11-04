import { ION_FORMAT, ION_VERSION } from '../core/units.js';
import { SYMS, BCS, FACES, MAX_NODES } from '../core/grid.js';
import { meshNorm, meshUnpack } from '../core/mesh.js';
import { normElectrode } from '../parts/electrodes.js';
import { normDetector, normIon } from '../parts/ions.js';
import { future, history, num, project, setFuture, setProject, setSelectedId, str } from './project.js';

/* ==========================================================================
   The project as a whole: a saved one read in with every field checked (normProject), the one on the bench
   written out (serialize), and the bench a new visit starts with (demoProject).
   ========================================================================== */
export const POT_SHOWS = { none: 'Not drawn', map: 'Colour map', contours: 'Equipotentials', both: 'Map and equipotentials' };
export const COLOUR_BYS = { group: 'Ion group', ke: 'Kinetic energy', time: 'Time' };
export function normGrid(G) {
  G = G && typeof G === 'object' ? G : {};
  const sym = SYMS[G.sym] ? G.sym : 'cyl';
  const out = { sym, h: Math.max(1e-4, num(G.h, 0.5)), x0: num(G.x0, -40), x1: num(G.x1, 40), y0: num(G.y0, -20), y1: num(G.y1, 20), z0: num(G.z0, -20), z1: num(G.z1, 20), bc: {} };
  if (out.x1 <= out.x0) out.x1 = out.x0 + 10; if (out.y1 <= out.y0) out.y1 = out.y0 + 10; if (out.z1 <= out.z0) out.z1 = out.z0 + 10;
  for (const f of FACES) out.bc[f] = BCS[G.bc && G.bc[f]] ? G.bc[f] : 'open';
  // never more nodes than the browser can hold: the spacing grows until they fit
  for (let k = 0; k < 40 && gridNodes(out) > MAX_NODES; k++) out.h = +(out.h * 1.25).toPrecision(3);
  return out;
}
export function gridNodes(G) {
  const n = (a, b) => Math.max(2, Math.round((b - a) / G.h) + 1);
  return G.sym === 'planar' ? n(G.x0, G.x1) * n(G.y0, G.y1) : G.sym === 'cyl' ? n(G.x0, G.x1) * (Math.round(Math.max(G.y1, -G.y0) / G.h) + 1) : n(G.x0, G.x1) * n(G.y0, G.y1) * n(G.z0, G.z1);
}
export function normProject(d) {
  d = d && typeof d === 'object' ? d : {};
  const P = {
    format: ION_FORMAT, version: ION_VERSION, name: str(d.name, 'Untitled', 80),
    view: { cx: num(d.view && d.view.cx, 0), cy: num(d.view && d.view.cy, 0), scale: Math.min(1e4, Math.max(0.05, num(d.view && d.view.scale, 8))), plane: ['xy', 'xz', 'yz'].includes(d.view && d.view.plane) ? d.view.plane : 'xy', slice: num(d.view && d.view.slice, 0) },
    grid: normGrid(d.grid),
    electrodes: (Array.isArray(d.electrodes) ? d.electrodes : []).slice(0, 400).map((e, k) => normElectrode(e, k)),
    ions: (Array.isArray(d.ions) ? d.ions : []).slice(0, 50).map((e, k) => normIon(e, k)),
    detectors: (Array.isArray(d.detectors) ? d.detectors : []).slice(0, 50).map((e, k) => normDetector(e, k)),
    gas: { on: !!(d.gas && d.gas.on), mass: Math.max(1e-3, num(d.gas && d.gas.mass, 4.0026)), pressure: Math.max(0, num(d.gas && d.gas.pressure, 1)), temp: Math.max(1, num(d.gas && d.gas.temp, 300)), sigma: Math.max(0, num(d.gas && d.gas.sigma, 30)) },
    bfield: { bx: num(d.bfield && d.bfield.bx, 0), by: num(d.bfield && d.bfield.by, 0), bz: num(d.bfield && d.bfield.bz, 0) },
    fly: { tMax: Math.max(1e-6, num(d.fly && d.fly.tMax, 100)), quality: Math.min(2, Math.max(0.05, num(d.fly && d.fly.quality, 0.5))), maxPts: Math.max(200, Math.min(20000, num(d.fly && d.fly.maxPts, 3000))), spaceCharge: !!(d.fly && d.fly.spaceCharge), seed: Math.max(1, Math.round(num(d.fly && d.fly.seed, 1))), auto: !(d.fly && d.fly.auto === false) },
    show: { pot: POT_SHOWS[d.show && d.show.pot] ? d.show.pot : 'map', contours: Math.max(2, Math.min(200, Math.round(num(d.show && d.show.contours, 24)))), traj: !(d.show && d.show.traj === false), colourBy: COLOUR_BYS[d.show && d.show.colourBy] ? d.show.colourBy : 'group', grid: !(d.show && d.show.grid === false), efield: !!(d.show && d.show.efield) },
    point: Array.isArray(d.point) && d.point.length === 3 && d.point.every(v => typeof v === 'number' && isFinite(v)) ? d.point.slice() : null,
    species: { mass: Math.max(1e-6, num(d.species && d.species.mass, 40)), charge: num(d.species && d.species.charge, 1) || 1, name: str(d.species && d.species.name, 'Ca+', 12) },
    notes: str(d.notes, '', 4000),
  };
  // ids unique
  const seen = new Set();
  for (const list of [P.electrodes, P.ions, P.detectors]) for (const e of list) { while (seen.has(e.id)) e.id = e.id.slice(0, 1) + Math.random().toString(36).slice(2, 9); seen.add(e.id); }
  for (const e of P.electrodes) if (e.shape === 'mesh') { e.mesh = meshNorm(e.mesh); e.meshT = e.mesh ? meshUnpack(e.mesh) : new Float32Array(0); }
  return P;
}
/* the project as saved: the triangles stay packed, the view with it */
export function serialize() {
  const P = project, strip = e => { const o = Object.assign({}, e); delete o.meshT; return o; };
  return { format: ION_FORMAT, version: ION_VERSION, name: P.name, view: Object.assign({}, P.view), grid: JSON.parse(JSON.stringify(P.grid)),
    electrodes: P.electrodes.map(strip), ions: P.ions.map(e => Object.assign({}, e)), detectors: P.detectors.map(e => Object.assign({}, e)),
    gas: Object.assign({}, P.gas), bfield: Object.assign({}, P.bfield), fly: Object.assign({}, P.fly), show: Object.assign({}, P.show), point: P.point ? P.point.slice() : null, species: Object.assign({}, P.species), notes: P.notes };
}
export function loadProject(d) {
  setProject(normProject(d));
  setSelectedId(null);
  return project;
}
/* a new bench: an einzel lens in cylindrical symmetry, a beam through it, a detector past it */
export function demoProject() {
  return normProject({
    name: 'Einzel lens', grid: { sym: 'cyl', h: 0.25, x0: -30, x1: 70, y0: 0, y1: 20, bc: { xlo: 'open', xhi: 'open', yhi: 'ground' } },
    electrodes: [
      { name: 'Entrance tube', shape: 'tube', axis: 'x', x: -8, rIn: 5, rOut: 7, L: 14, V: 0 },
      { name: 'Focus tube', shape: 'tube', axis: 'x', x: 8, rIn: 5, rOut: 7, L: 14, V: -1400 },
      { name: 'Exit tube', shape: 'tube', axis: 'x', x: 24, rIn: 5, rOut: 7, L: 14, V: 0 },
    ],
    ions: [{ name: 'Ar+ beam', species: 'Ar+', n: 11, ke: 2000, x: -28, y: 0, dist: 'grid', size: 3, dirAz: 0, cone: 0 }],
    detectors: [{ name: 'Screen', axis: 'x', x: 65, y: 0, z: 0, half: 0, stop: true }],
    view: { cx: 20, cy: 0, scale: 9 },
  });
}
/* the undo history: a snapshot before a change, and back and forth */
export function checkpoint() {
  history.push(JSON.stringify(serialize()));
  if (history.length > 100) history.shift();
  setFuture([]);
}
export function undoStep() {
  if (!history.length) return false;
  future.push(JSON.stringify(serialize()));
  loadProject(JSON.parse(history.pop()));
  return true;
}
export function redoStep() {
  if (!future.length) return false;
  history.push(JSON.stringify(serialize()));
  loadProject(JSON.parse(future.pop()));
  return true;
}
