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

/* ---------- the makers' glass catalogues ---------- */
const GL = await import('../../src/core/glass.js');
const { CATALOG } = await import('../../src/core/glass-catalog.js');
test('glass catalogues: every glass gives its stated nd and Vd by its formula', () => {
  let n = 0;
  for (const [k, row] of Object.entries(CATALOG)) {
    const [, , nd, vd] = row;
    if (!(nd > 1)) continue;
    const m = { glass: k }, d = GL.refIndex(m, 587.5618), F = GL.refIndex(m, 486.1327), C = GL.refIndex(m, 656.2725);
    near(d, nd, 6e-4, k + ' nd');                                   // (the database rounds a few to three places)
    if (vd > 10) near((d - 1) / (F - C), vd, 0.7, k + ' Vd');
    n++;
  }
  assert.ok(n > 1100, 'glasses checked: ' + n);
});
test('glass names: the makers’ spellings, the lens files’ and the aliases all resolve', () => {
  assert.equal(GL.glassKey('N-BK7_SCHOTT'), 'N-BK7');
  assert.equal(GL.glassKey('nbk7'), 'N-BK7');
  assert.equal(GL.glassKey('S-LAH64'), 'S-LAH64');
  assert.equal(GL.glassKey('SLAH64'), 'S-LAH64');
  assert.equal(GL.glassKey('H-K9L'), 'H-K9L');                   // CDGM's own, not an alias of N-BK7 any more
  assert.equal(GL.glassKey('M-TAF1'), 'M-TAF1');
  assert.equal(GL.glassKey('K-VC89'), 'K-VC89');
  assert.equal(GL.glassKey('L-BAL35'), 'L-BAL35');
  assert.equal(GL.glassKey('H-LAK54_MOLD'), 'H-LAK54M');
  assert.equal(GL.glassKey('ZEONEX_E48R'), 'Zeonex E48R');
  assert.equal(GL.glassKey('ACRYLIC'), 'PMMA');
  assert.equal(GL.glassKey('B 270'), 'B270');
  assert.equal(GL.glassKey('XYZ-123'), null);
  near(GL.refIndex({ glass: 'B270' }, 587.56), 1.5230, 2e-4);
  near(GL.refIndex({ glass: 'M-TAF1' }, 587.56), 1.7725, 2e-4);     // Hoya's polynomial formula
  near(GL.refIndex({ glass: 'PMMA' }, 587.56), 1.4906, 3e-4);      // Sultanova's fit
  assert.ok(GL.glassSearch('LAH').length > 40 && GL.glassSearch('LAH').every(([k]) => /LAH/i.test(k)));
});
test('a lens file’s own catalogue: the dispersion formulas as the program numbers them', () => {
  // Sellmeier 1 (2): N-BK7's own coefficients
  near(GL.agfIndex(2, [1.03961212, 0.00600069867, 0.231792344, 0.0200179144, 1.01046945, 103.560653], 0.5875618), 1.5168, 1e-4);
  // Schott (1) and Extended (10): a constant alone is sqrt
  near(GL.agfIndex(1, [2.25, 0, 0, 0, 0, 0], 0.6), 1.5, 1e-12);
  near(GL.agfIndex(10, [2.25, 0, 0, 0, 0, 0, 0, 0], 0.6), 1.5, 1e-12);
  // Conrady (5): n0 + A / l + B / l^3.5
  near(GL.agfIndex(5, [1.5, 0.01, 0.001], 1), 1.511, 1e-12);
  // Herzberger (3): a constant alone
  near(GL.agfIndex(3, [1.6, 0, 0, 0, 0, 0], 0.5), 1.6, 1e-12);
});
