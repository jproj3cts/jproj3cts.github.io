/* Every example bench, traced in Node and held against a snapshot of what it traced to: the
   beams (where each starts, its way, length and power), the rays' count and power, each
   photodiode's reading and each cavity's figures. A change to the physics shows here as the
   demo it moved and the number that moved. When a change is meant, regenerate the snapshot:
     UPDATE_SNAPSHOT=1 node --test test/node/demos.test.mjs
   and read the diff of demos.snapshot.json before committing it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const STATE = await import('../../src/state/project.js');
const { loadProject } = await import('../../src/state/elements.js');
const TRACE = await import('../../src/engines/trace.js');
const { pdNetMw } = await import('../../src/engines/detector.js');
const { detectorReading } = await import('../../src/engines/fibre-face.js');
const { findCavities } = await import('../../src/engines/cavity.js');

const DEMOS = new URL('../../../demos/', import.meta.url), SNAP = new URL('./demos.snapshot.json', import.meta.url);
const names = fs.readdirSync(DEMOS).filter(f => f.endsWith('.jekray')).map(f => f.slice(0, -7)).sort();
const r4 = v => +(+v).toFixed(4), r6 = v => +(+v).toPrecision(6);
function signature(name) {
  loadProject(JSON.parse(fs.readFileSync(new URL(name + '.jekray', DEMOS), 'utf8')));
  TRACE.setLastTraceKey(null); TRACE.traceScene();
  const T = TRACE.lastTrace, P = STATE.project;
  const out = {
    elements: P.elements.length,
    beams: T.beams.map(b => [r4(b.x0), r4(b.y0), r4(b.dx), r4(b.dy), r4(b.len), r6(b.w)]),
    rays: T.rays.length,
    rayPower: r6(T.rays.reduce((a, r) => a + r.w, 0)),
    detectors: Object.fromEntries(P.elements.filter(e => e.type === 'detector' || (e.type === 'fcomp' && e.kind === 'pd')).map(e => [e.name, r6(e.type === 'detector' ? (detectorReading(e).mw || 0) : pdNetMw(e))])),
  };
  try { out.cavities = findCavities().map(c => [c.surfaces.length, r6(c.fsr || 0), r6(c.finesse || 0)]); } catch (err) { out.cavities = 'error: ' + err.message; }
  return out;
}
const snapshot = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : {};
const fresh = {};
const close = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 1e-3 * Math.max(1, Math.abs(a), Math.abs(b)) : JSON.stringify(a) === JSON.stringify(b);
for (const name of names) {
  test('demo ' + name + ' traces as the snapshot has it', () => {
    const got = signature(name);
    fresh[name] = got;
    if (process.env.UPDATE_SNAPSHOT) return;
    const want = snapshot[name];
    assert.ok(want, 'no snapshot for ' + name + ': run with UPDATE_SNAPSHOT=1');
    assert.equal(got.elements, want.elements, 'element count');
    assert.equal(got.beams.length, want.beams.length, 'beam count');
    got.beams.forEach((b, i) => b.forEach((v, k) => assert.ok(close(v, want.beams[i][k]), 'beam ' + i + ' ' + ['x0', 'y0', 'dx', 'dy', 'len', 'w'][k] + ': ' + v + ' vs ' + want.beams[i][k])));
    assert.equal(got.rays, want.rays, 'ray count');
    assert.ok(close(got.rayPower, want.rayPower), 'ray power ' + got.rayPower + ' vs ' + want.rayPower);
    for (const [k, v] of Object.entries(got.detectors)) assert.ok(close(v, want.detectors[k]), 'detector ' + k + ': ' + v + ' vs ' + want.detectors[k]);
    assert.ok(close(got.cavities, want.cavities) || JSON.stringify(got.cavities) === JSON.stringify(want.cavities), 'cavities ' + JSON.stringify(got.cavities) + ' vs ' + JSON.stringify(want.cavities));
  });
}
test('snapshot written when asked', () => {
  if (process.env.UPDATE_SNAPSHOT) fs.writeFileSync(SNAP, JSON.stringify(fresh, null, 0).replace(/\],\[/g, '],\n['));
});
