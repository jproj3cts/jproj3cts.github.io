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

/* A step's trace made by a sweep's render or scattering worker (worker/main.js stepTrace) crosses to the page as a copy, is
   kept there (keepTraceFrom), and is shown when the step plays in place of tracing it on the page: it must be the full
   recompute at that step, to the last digit, with the sources a fibre tip made pointing back to the page's own parts.
   Here the "worker" is this same engine; the copy is the structured clone postMessage makes. A copy filed under another
   bench is kept under that bench, and never taken for this one. */
const BT = await import('../../src/engines/beam-tree.js');
const FROM = [], NOT = [];
for (const f of demos) {
  test('a worker’s trace of a step, kept on the page, is the full recompute at it: ' + f, async () => {
    await openBench(JSON.parse(fs.readFileSync(new URL(f, DIR), 'utf8')));
    const P = pick();
    if (!P) return;
    const [el, path, a, b] = P, mid = (a + b) / 2;
    const was = hooks.playing;
    try {
      hooks.playing = () => false;
      // the step traced from nothing: what a worker would send (its first trace there), and the recompute to match
      setParam(el, path, mid); const want = fresh(), wantKey = BT.popKeyOf(TR.lastTrace.beams, BT.popSources());
      if (!TR.traceKeepable(TR.lastTrace)) { NOT.push(f); return; }
      const msg = structuredClone({ rest: TR.traceKeyRestNow(), T: TR.lastTrace, ms: TR.lastTraceMs, V: [...EL.VSRC.values()] });
      // the page elsewhere meanwhile, then playing: the copy kept, and the step played
      setParam(el, path, a); TR.setLastTraceKey(null); TR.traceScene();
      hooks.playing = () => true; TR.dropTraceStore();
      if (!TR.traceStoreOn()) { NOT.push(f); return; }
      const other = structuredClone(msg);
      assert.equal(TR.keepTraceFrom('{"another bench"}' + other.rest, other.T, other.ms, other.V), true);
      assert.equal(TR.keepTraceFrom(msg.rest, msg.T, msg.ms, msg.V), true, 'kept');
      const hits = TR.traceStoreHits;
      setParam(el, path, mid); TR.traceScene();
      const hit = TR.traceStoreHits > hits && TR.lastTrace === msg.T;
      if (hit) FROM.push(f); else NOT.push(f);
      assert.equal([...EL.VSRC.keys()].sort().join(), want.v, 'the sources it made');
      { const g = shown(TR.lastTrace); let i = 0; while (i < g.length && g[i] === want.s[i]) i++; assert.ok(g === want.s, 'the trace shown equals a full recompute' + (hit ? ' (the worker’s, kept)' : '') + (g === want.s ? '' : ' at ' + i + ': ' + want.s.slice(Math.max(0, i - 200), i + 80) + ' /// ' + g.slice(Math.max(0, i - 200), i + 80))); }
      assert.equal(BT.popKeyOf(TR.lastTrace.beams, BT.popSources()), wantKey, 'the field is looked up under the same key');
      for (const v of EL.VSRC.values()) if (v.vRoot && v.vRoot !== v && ST.project.elements.some(e => e.id === v.vRoot.id)) assert.ok(ST.project.elements.includes(v.vRoot), 'a fibre tip’s source points back to the page’s own laser');
    } finally { hooks.playing = was; TR.dropTraceStore(); }
  });
}
/* The same for a trace offered for the bench as it is now (offerTrace: the scattering worker's, with a particle's answer
   it has just worked out), taken by the next trace whether or not a sweep plays; one offered for another bench is not. */
const OFFERED = [];
for (const f of demos) {
  test('a trace offered from a worker for the bench as it is is the full recompute: ' + f, async () => {
    await openBench(JSON.parse(fs.readFileSync(new URL(f, DIR), 'utf8')));
    const P = pick();
    if (!P) return;
    const [el, path, a, b] = P, mid = (a + b) / 2;
    const was = hooks.playing;
    try {
      hooks.playing = () => false;
      setParam(el, path, mid); const want = fresh();
      // (a bench whose traces carry state from one to the next, a laser's gain settling, takes none: nor is its recompute
      // the same after other values)
      if (!TR.traceKeepable(TR.lastTrace) || ST.project.elements.some(e => TR.TRACE_STATEFUL.has(e.type))) return;
      const msg = structuredClone({ rest: TR.traceKeyRestNow(), T: TR.lastTrace, ms: TR.lastTraceMs, V: [...EL.VSRC.values()] });
      setParam(el, path, a); TR.setLastTraceKey(null); TR.traceScene();
      // offered for another bench: traced afresh
      TR.offerTrace('{"another bench"}' + msg.rest, structuredClone(msg.T), msg.ms, structuredClone(msg.V));
      setParam(el, path, b); TR.traceScene();
      assert.notEqual(TR.lastTrace, msg.T);
      // offered for the bench as it will be, then taken
      TR.offerTrace(msg.rest, msg.T, msg.ms, msg.V);
      setParam(el, path, mid); TR.traceScene();
      const took = TR.lastTrace === msg.T;
      if (took) OFFERED.push(f);
      assert.equal([...EL.VSRC.keys()].sort().join(), want.v, 'the sources it made');
      assert.ok(shown(TR.lastTrace) === want.s, 'the trace shown equals a full recompute' + (took ? ' (the offered one)' : ''));
    } finally { hooks.playing = was; TR.dropTraceStore(); }
  });
}
test('offered traces are taken on most benches', () => {
  assert.ok(FROM.length > 0 && OFFERED.length >= 0.7 * demos.length, OFFERED.length + ' of ' + demos.length);
});
test('the workers’ traces are taken: most benches play their steps from them', () => {
  if (process.env.SHOW) console.log('# taken', FROM.length, 'not', NOT.join(', '));
  assert.ok(FROM.length >= 0.7 * demos.length, FROM.length + ' of ' + demos.length + ' (not: ' + NOT.join(', ') + ')');
});

/* A particle's pictures (its scattered field's estimate, its 3D radiation pattern) are made with the trace but are no
   part of the light: ticking one off leaves the trace's key as it was and the trace in use; ticking one on that the
   trace was not made with traces again, once, and the trace then has it. What the bench shows of them follows its ticks. */
test('a particle’s picture ticks are no part of the trace’s key; a trace serves a bench that wants no more pictures than it has', async () => {
  const d = JSON.parse(fs.readFileSync(new URL('optical-tweezers.jekray', DIR), 'utf8'));
  await openBench(d);
  const P = ST.project.elements.find(e => e.type === 'particle');
  assert.ok(P, 'the example has a particle');
  P.scatLight = true; P.scatField = true; P.scatShape3d = false;
  TR.setLastTraceKey(null); TR.traceScene();
  const fan = () => ((TR.lastTrace.scat && TR.lastTrace.scat.fans) || []).find(F => F.part === P.id);
  assert.ok(fan(), 'the particle is in the light');
  const k0 = TR.traceKeyNow(), n0 = TR.traceCount, T0 = TR.lastTrace;
  assert.ok(fan().field, 'made with its field picture');
  P.scatField = false; TR.traceScene();
  assert.equal(TR.traceKeyNow(), k0, 'the key as it was');
  assert.equal(TR.traceCount, n0, 'nothing traced');
  assert.ok(TR.lastTrace === T0 && !fan().field && fan().fieldKept, 'the same trace, the picture not shown, kept');
  P.scatField = true; TR.traceScene();
  assert.ok(TR.traceCount === n0 && fan().field, 'shown again, nothing traced');
  P.scatShape3d = true; TR.traceScene();
  assert.equal(TR.traceCount, n0 + 1, 'a picture it was not made with: traced once');
  assert.ok(fan().lobe && fan().field, 'and it has both');
  TR.traceScene(); assert.equal(TR.traceCount, n0 + 1);
});
