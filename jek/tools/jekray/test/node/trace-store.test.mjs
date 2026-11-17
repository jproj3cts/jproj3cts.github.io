/* A sweep's traces kept while it plays (engines/trace.js traceStore) are shown in place of tracing the bench again, so a
   kept trace must be the trace a full recompute gives at that step, whatever the bench went through before it. For every
   example bench: a parameter (the bench's own sweep, or the first part's x) at one value traced from nothing, against
   the trace kept for that value while a sweep plays after other values: the same rays, beams, detectors' light, fibre
   network and particles' scattered light, to the last digit. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openBench, engine } from '../../headless.mjs';
await engine();
const TR = await import('../../src/engines/trace.js');
const { hooks } = await import('../../src/core/hooks.js');
const { getPath, setParam } = await import('../../src/state/params.js');
const ST = await import('../../src/state/project.js');
const EL = await import('../../src/state/elements.js');

const DIR = new URL('../../../demos/', import.meta.url);
const demos = fs.readdirSync(DIR).filter(f => f.endsWith('.jekray')).sort();
/* what a trace shows, as plain numbers (functions and the trace's own caches left out) */
const shown = T => JSON.stringify({ rays: T.rays, beams: T.beams, screens: T.screens, blocked: T.blocked, absorbed: T.absorbed, emitted: T.emitted, scat: T.scat && T.scat.parts,
  net: T.net && T.net.pd ? [...T.net.pd.entries()] : null }, (k, v) => (typeof v === 'function' ? undefined : v instanceof Map ? [...v.entries()] : ArrayBuffer.isView(v) ? Array.from(v) : v));
const fresh = () => { TR.dropTraceStore(); TR.setLastTraceKey(null); TR.traceScene(); return { s: shown(TR.lastTrace), v: [...EL.VSRC.keys()].sort().join() }; };
/* the parameter to move: the bench's first sweep, else the first part's x */
function pick() {
  for (const el of ST.project.elements) for (const [path, sw] of Object.entries(el.sweeps || {})) if (typeof getPath(el, path) === 'number') return [el, path, sw.min, sw.max];
  const el = ST.project.elements.find(e => typeof e.x === 'number' && e.type !== 'source' && e.type !== 'draw');
  return el ? [el, 'x', el.x - 0.5, el.x + 0.5] : null;
}
const KEPT = [], MISSED = [];
for (const f of demos) {
  test('a kept trace is the full recompute at its step: ' + f, async () => {
    await openBench(JSON.parse(fs.readFileSync(new URL(f, DIR), 'utf8')));
    const P = pick();
    if (!P) return;
    const [el, path, a, b] = P, mid = (a + b) / 2;
    const was = hooks.playing;
    try {
      // the step traced from nothing, with nothing kept
      hooks.playing = () => false;
      setParam(el, path, mid); const want = fresh();
      // a sweep playing: other steps first, then this one (traced and kept), others, and this one again (taken as kept)
      hooks.playing = () => true; TR.dropTraceStore();
      if (!TR.traceStoreOn()) return;                          // (a bench whose traces carry state from one to the next keeps none)
      for (const v of [a, mid, b, a]) { setParam(el, path, v); TR.traceScene(); }
      const hits = TR.traceStoreHits;
      setParam(el, path, mid); TR.traceScene();
      const gotHit = TR.traceStoreHits > hits; if (gotHit) KEPT.push(f); else MISSED.push(f);
      const got = { s: shown(TR.lastTrace), v: [...EL.VSRC.keys()].sort().join() };
      assert.equal(got.v, want.v, 'the sources it made');
      assert.ok(got.s === want.s, 'the trace shown equals a full recompute' + (gotHit ? ' (kept)' : ''));
    } finally { hooks.playing = was; TR.dropTraceStore(); }
  });
}
test('the examples’ sweeps are kept: most benches take their steps’ traces as kept', () => {
  if (process.env.SHOW) console.log('# kept', KEPT.length, 'not', MISSED.join(', '));
  assert.ok(KEPT.length >= 0.75 * demos.length, KEPT.length + ' of ' + demos.length + ' (not: ' + MISSED.join(', ') + ')');
});
