/* A lens's own two faces: uncoated, the light bouncing between them is a ghost, weaker each
   time round, and not a cavity (solved as one, its narrow mode stood in for the beam going
   through: the field after a germanium lens collapsed to a thread). Coated to reflect most of
   the light, the same part is a solid etalon, and a cavity it stays. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const TRACE = await import('../../src/engines/trace.js');
const { findCavities } = await import('../../src/engines/cavity.js');

const bench = coat => ({
  format: 'jekray', version: 1, name: 't', tab: 'b1', fibres: [], minPower: 0.001, maxBounces: 40,
  benches: [{ id: 'b1', name: 'Bench 1', view: { cx: 0, cy: 0, scale: 4 } }],
  elements: [
    { id: 's', type: 'source', name: 'Laser', x: -60, y: 0, angle: 0, bench: 'b1', wavelength: 10600, gauss: true, w0: 3, z0: 0, rays: 5, power: 1, width: 2, divergence: 0, sweeps: {} },
    { id: 'l', type: 'lens', name: 'Ge PCX', x: 0, y: 0, angle: 0, bench: 'b1', diameter: 25, gaps: [3], materials: [{ glass: 'Germanium', abs: 0 }], sweeps: {},
      surfaces: [{ R: 150.19, k: 0, a2: 0, A: [], semi: null, coat }, { R: null, k: 0, a2: 0, A: [], semi: null, coat }] },
    { id: 'sc', type: 'screen', name: 'Screen', x: 120, y: 0, angle: 0, bench: 'b1', length: 25, sweeps: {} },
  ],
});
const cavities = coat => { loadProject(bench(coat)); TRACE.setLastTraceKey(null); TRACE.traceScene(); return findCavities(); };

test('an uncoated germanium lens is not a cavity', () => {
  assert.equal(cavities({ mode: 'bare', R: 4 }).length, 0);
});
test('the same lens coated to reflect 95% is a solid etalon, a cavity', () => {
  assert.equal(cavities({ mode: 'band', R: 95, lo: 8000, hi: 12000 }).length, 1);
});
