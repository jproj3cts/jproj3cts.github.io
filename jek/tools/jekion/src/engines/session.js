import { makeGrid } from '../core/grid.js';
import { newMask, paintMesh, paintShape } from '../core/voxel.js';
import { buildLevels, setElectrodeValues, solveStart } from './solve.js';
import { voltageGroups } from './fields.js';
import { electrodeBoxes } from './fly.js';

/* ==========================================================================
   A project's array, solved: the grid from its settings, the electrodes painted in, each electrode's basis
   potential solved for (the slow part, done once per geometry: the worker keeps it), and the voltage groups
   made from the basis whenever a voltage changes (quick). geometryKey says when the array must be solved
   again; voltageKey when only the groups need remaking.
   ========================================================================== */
const GEOM_KEYS = ['shape', 'x', 'y', 'z', 'axis', 'sx', 'sy', 'sz', 'r', 'L', 'rIn', 'rOut', 'r1', 'r2', 'wall', 'r0', 'rMax', 'z0', 'side'];
export function geometryKey(P) {
  const G = P.grid;
  return JSON.stringify([G.sym, G.h, G.x0, G.x1, G.y0, G.y1, G.z0, G.z1, G.bc, P.electrodes.filter(e => e.on !== false).map(e => [e.id, ...GEOM_KEYS.map(k => e[k]), e.mesh ? e.mesh.data.length + ':' + e.mesh.n : 0])]);
}
export function voltageKey(P) { return JSON.stringify(P.electrodes.filter(e => e.on !== false).map(e => [e.V, e.rf && e.rf.on ? [e.rf.amp, e.rf.mhz, e.rf.phase] : 0])); }
/* the array painted: { g, mask, els, boxes, basis: [], painted: [n nodes each] } */
export function buildArray(P) {
  const g = makeGrid(P.grid), mask = newMask(g), els = P.electrodes.filter(e => e.on !== false);
  const painted = els.map((el, k) => (el.shape === 'mesh' ? (el.meshT ? paintMesh(g, mask, el.meshT, [el.x, el.y, el.z], k) : 0) : paintShape(g, mask, el, k)));
  return { g, mask, els, boxes: electrodeBoxes(g, els), basis: new Array(els.length).fill(null), painted, levels: null };
}
/* every electrode's basis potential, as a job: step() does one V-cycle of one electrode, true when all are done;
   progress is { k, n, cycle }; result() the cycle counts. solveArray runs it straight through. */
export function solveStartArray(A) {
  if (!A.levels) A.levels = buildLevels(A.g, A.mask);
  const out = [], n = A.els.length;
  let k = 0, J = null;
  const begin = () => {
    for (; k < n; k++) {
      if (A.basis[k]) { out[k] = 0; continue; }
      if (!A.painted[k]) { A.basis[k] = new Float32Array(A.g.n); out[k] = 0; continue; }   // an electrode the grid never touches has no field
      setElectrodeValues(A.levels, A.mask, k);
      J = solveStart(A.levels);
      return;
    }
    J = null;
  };
  begin();
  return {
    get progress() { return { k, n, cycle: J ? J.cycles : 0 }; },
    step() {
      if (!J) { A.levels = null; return true; }
      if (J.step()) { const S = J.result(); A.basis[k] = S.phi; out[k] = S.cycles; k++; begin(); }
      if (!J) { A.levels = null; return true; }
      return false;
    },
    result() { return out; },
  };
}
export function solveArray(A, say, stop) {
  const J = solveStartArray(A);
  while (!J.step()) { if (say) { const p = J.progress; say(p.k, p.n, p.cycle); } if (stop && stop()) break; }
  return J.result();
}
/* the field set for the array at the project's voltages: { g, mask, els, boxes, G } */
export function fieldSetOf(A, P) {
  // the voltages as the project has them now (a fresh copy of it each job): by id, or by place for electrodes without one
  const live = P.electrodes.filter(e => e.on !== false), els = A.els.map((el, k) => (el.id && live.find(e => e.id === el.id)) || live[k] || el);
  return { g: A.g, mask: A.mask, els: A.els, boxes: A.boxes, basis: A.basis, G: voltageGroups(A.g, A.basis, els) };
}
