/* The engines in Node, with no browser: the demo benches traced and read as the page reads
   them. core/, state/ and engines/ reach the page only through core/hooks.js (the build's lint
   holds them to it), so here the hooks stay the no-ops they are born with. The electronics and
   photonic-circuit modules still carry their panels, which bring the ui/ modules in with them;
   until stage 5 of the split takes those out, the worker's stand-ins for the page are set up
   before the modules load, as they are in the field worker. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TEST_MODE, IN_PAGE } from '../../src/core/constants.js';   // first, before any stand-in: Node is not a page
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };   // a worker has one; the shim leaves it
workerShim();
const { refIndex } = await import('../../src/core/glass.js');
const STATE = await import('../../src/state/project.js');          // project is reassigned as one loads: read it live
const { loadProject, serialize } = await import('../../src/state/elements.js');
const TRACE = await import('../../src/engines/trace.js');          // lastTrace is reassigned: read it live
const { metricRaw } = await import('../../src/ui/optimise.js');
const { hooks } = await import('../../src/core/hooks.js');

const demo = name => JSON.parse(fs.readFileSync(new URL('../../../demos/' + name + '.jekray', import.meta.url), 'utf8'));
const byName = name => STATE.project.elements.find(e => e.name === name);
function trace(name) { loadProject(demo(name)); TRACE.setLastTraceKey(null); TRACE.traceScene(); return TRACE.lastTrace; }
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' vs ' + b);

test('Node is not a page: test mode, no page hooks installed', () => {
  assert.equal(IN_PAGE, false);
  assert.equal(TEST_MODE, true);
  assert.equal(hooks.playing(), false);
  assert.equal(hooks.fieldWorker(), null);
});
test('glass: N-BK7 at the d line, by its Sellmeier terms', () => {
  near(refIndex({ glass: 'N-BK7' }, 587.6), 1.5168, 2e-4);
  near(refIndex({ glass: 'BK7' }, 587.6), 1.5168, 2e-4);          // an alias
  assert.equal(refIndex({ glass: 'AIR' }, 633), 1);
});
test('michelson: traced as the page traces it', () => {
  const T = trace('michelson');
  assert.equal(T.beams.length, 19);
  assert.equal(T.rays.length, 21);
  near(metricRaw(byName('Output port'), 'rms'), 0.8164965809277259, 1e-9, 'rms spot at the output port');
  near(metricRaw(byName('Output port'), 'power'), 50, 1e-9, 'power at the output port, %');
});
test('other demo benches trace to the same counts as in the browser', () => {
  assert.equal(trace('plano-convex').beams.length, 6);
  assert.equal(trace('plano-convex').rays.length, 246);
  assert.equal(trace('fabry-perot').beams.length, 78);
  const T = trace('lens-aberrations');
  assert.equal(T.beams.length, 4); assert.equal(T.rays.length, 63);
});
test('a project survives serialize and loadProject', () => {
  loadProject(demo('michelson'));
  const a = serialize();
  loadProject(JSON.parse(JSON.stringify(a)));
  const b = serialize();
  assert.deepEqual(b.elements, a.elements);
  assert.equal(b.elements.length, 6);
});
