/* The sweeps' one store (engines/sweep-store.js): what a sweep keeps for its steps (traces, field frames, 3D volumes,
   particles' answers, built 3D light) in layers under one owner, each entry its step's, kept or let go by one rule.
   Here: the run and its steps; what is loose and what is the run's; the budget (loose first, then whole steps, never
   the one just kept); the ways things are let go; and, on the examples, that a cycle played over what is kept shows at
   every step what a fresh run gives: the trace, the bench's field and the 3D volume, to the last digit. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openBench, engine } from '../../headless.mjs';
const E = await engine();
const SS = await import('../../src/engines/sweep-store.js');
const TR = E.TRACE, BT = await import('../../src/engines/beam-tree.js'), VOL = await import('../../src/engines/volume.js');
const { hooks } = await import('../../src/core/hooks.js');
const { setParam } = E.PRM;

const BENCH = { format: 'jekray', version: 1, light: { rays: true, field: true, scale: 'lin' }, elements: [
  { type: 'source', id: 'S', name: 'S', x: -60, y: 0, angle: 0, wavelength: 633, rays: 11, width: 4, gauss: true, w0: 1 },
  { type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, f: 50, length: 20 }, { type: 'mirror', id: 'M', name: 'M', x: 60, y: 0, angle: 30, length: 20 }] };
const clear = () => { for (const m of Object.values(SS.stepMaps)) m.clear(); SS.stepInvalidate('run'); SS.setStepBudget(0); };
const run = (n, a = 0, b = 1) => SS.stepRunBegin([['L', 'y']], n, (k, i) => a + (b - a) * i / n, 'shape ' + a + ' ' + b);
const key = v => SS.stepKeyOf([['L', 'y', v]]);
const MB = 1e6, val = () => ({});

test('a run’s steps are its own; the same run begun again is the same generation, another takes over the steps it shares', async () => {
  await openBench(BENCH); clear();
  const g = run(4);
  assert.equal(run(4), g, 'begun again: the same run');
  SS.stepKeep('bench', 'k0', val(), { bytes: MB, step: key(0) });
  SS.stepKeep('bench', 'k1', val(), { bytes: MB, step: key(0.5) });
  SS.stepKeep('bench', 'kx', val(), { bytes: MB, step: key(0.123) });          // (no step of the run: loose)
  assert.deepEqual(SS.stepRunEntries('bench').map(e => e[0]), ['k0', 'k1']);
  const g2 = run(2);                                                          // steps 0 and 0.5
  assert.ok(g2 > g);
  assert.deepEqual(SS.stepRunEntries('bench').map(e => e[0]), ['k0', 'k1'], 'both steps are the new run’s too');
  run(3);                                                                     // steps 0, 1/3, 2/3
  assert.deepEqual(SS.stepRunEntries('bench').map(e => e[0]), ['k0'], 'only the step it shares');
  assert.equal(SS.stepMaps.bench.size, 3, 'the rest stay under their own keys, loose');
});

test('the step the bench is at is the step an entry is kept for, when none is given', async () => {
  await openBench(BENCH); clear(); run(4);
  const el = E.ST.project.elements.find(e => e.id === 'L');
  setParam(el, 'y', 0.25); assert.equal(SS.stepNow(), key(0.25));
  const a = SS.stepKeep('vol', 'v', val(), { bytes: 10 });
  assert.ok(SS.stepInRun(a));
  setParam(el, 'y', 0.3); assert.equal(SS.stepNow(), null);
  assert.ok(!SS.stepInRun(SS.stepKeep('vol', 'w', val(), { bytes: 10 })));
  setParam(el, 'y', 0);
});

test('loose entries are held to the layer’s own few; the run’s steps are not', async () => {
  await openBench(BENCH); clear(); run(100);
  for (let i = 0; i < 100; i++) SS.stepKeep('scat', 'a' + i, val(), { bytes: 10, step: key(i / 100), loose: { count: 8 } });
  assert.equal(SS.stepMaps.scat.size, 100, 'every step of the run kept');
  for (let i = 0; i < 20; i++) SS.stepKeep('scat', 'l' + i, val(), { bytes: 10, step: null, loose: { count: 8 } });
  assert.equal(SS.stepMaps.scat.size, 108);
  assert.deepEqual([...SS.stepMaps.scat.keys()].filter(k => k[0] === 'l'), [12, 13, 14, 15, 16, 17, 18, 19].map(i => 'l' + i), 'the newest loose ones');
  // by a layer's own unit (a trace's rays), one always left
  clear();
  for (let i = 0; i < 5; i++) SS.stepKeep('trace', 't' + i, val(), { n: 300, loose: { n: 1000 } });
  assert.deepEqual([...SS.stepMaps.trace.keys()], ['t2', 't3', 't4']);
  SS.stepKeep('trace', 'big', val(), { n: 5000, loose: { n: 1000 } });
  assert.deepEqual([...SS.stepMaps.trace.keys()], ['big']);
});

test('past the budget: loose entries first, then the run’s steps whole, the longest unused first, never the step just kept', async () => {
  await openBench(BENCH); clear(); run(4);
  const el = E.ST.project.elements.find(e => e.id === 'L');
  try {
    setParam(el, 'y', 0.9);                  // (the bench at no step: the step on show is never let go, below)
    SS.setStepBudget(7.5 * MB);
    SS.stepKeep('screens', 'old', val(), { bytes: MB, step: null });
    for (let i = 0; i < 3; i++) for (const layer of ['bench', 'vol']) SS.stepKeep(layer, layer + i, val(), { bytes: MB, step: key(i / 4) });
    assert.equal(SS.stepBytes(), 7 * MB);
    SS.stepKeep('bench', 'bench3', val(), { bytes: MB, step: key(0.75) });
    assert.ok(!SS.stepMaps.screens.has('old'), 'the loose one went');
    assert.equal(SS.stepBytes(), 7 * MB);
    SS.stepKeep('vol', 'vol3', val(), { bytes: MB, step: key(0.75) });
    assert.ok(!SS.stepMaps.bench.has('bench0') && !SS.stepMaps.vol.has('vol0'), 'the oldest step went whole');
    assert.deepEqual([[...SS.stepMaps.bench.keys()], [...SS.stepMaps.vol.keys()]], [['bench1', 'bench2', 'bench3'], ['vol1', 'vol2', 'vol3']]);
    // a step used again is the last to go
    SS.stepTouch('bench', 'bench1');
    SS.stepKeep('scat', 's', val(), { bytes: 2 * MB, step: null });
    assert.ok(SS.stepMaps.bench.has('bench1') && !SS.stepMaps.bench.has('bench2') && SS.stepMaps.scat.has('s'), 'the one just kept stays, the step longest unused goes');
    // the step on show stays, whatever its age
    setParam(el, 'y', 0.25); SS.stepKeep('scat', 's2', val(), { bytes: 4 * MB, step: null });
    assert.ok(SS.stepMaps.bench.has('bench1') && !SS.stepMaps.bench.has('bench3'), 'the step the bench is at is kept');
    setParam(el, 'y', 0.9);
    SS.setStepBudget(0.5 * MB); SS.stepKeep('closeup', 'c', val(), { bytes: MB, step: null });
    assert.deepEqual(Object.values(SS.stepMaps).map(m => m.size), [0, 0, 0, 1, 0, 0, 0]);
  } finally { SS.setStepBudget(0); }
});

test('the ways kept things are let go', async () => {
  await openBench(BENCH); clear(); run(4);
  let dropped = 0; SS.stepOnDrop('light3d', () => dropped++);
  const fill = () => { for (const layer of Object.keys(SS.stepMaps)) SS.stepKeep(layer, 'x', val(), { bytes: 100, step: key(0) }); };
  fill();
  SS.stepInvalidate('stopped');
  assert.deepEqual([SS.stepMaps.trace.size, SS.stepMaps.light3d.size, SS.stepMaps.bench.size, SS.stepMaps.scat.size, dropped], [0, 0, 1, 1, 1], 'stopped: the traces and the built light');
  const g = SS.stepStore.gen;
  SS.stepInvalidate('run');
  assert.ok(SS.stepStore.gen > g && SS.stepStore.run === null && SS.stepRunEntries('bench').length === 0 && SS.stepMaps.bench.size === 1, 'run: kept, loose');
  run(4);
  assert.equal(SS.stepRunEntries('bench').length, 1, 'the same steps begun again take it over');
  SS.stepInvalidate('bench'); run(4);
  assert.equal(SS.stepRunEntries('bench').length, 0, 'bench: another bench’s, never this run’s');
  assert.equal(SS.stepMaps.bench.size, 1);
  fill(); SS.stepInvalidate('file');
  assert.deepEqual([SS.stepMaps.trace.size, SS.stepMaps.light3d.size, SS.stepMaps.vol.size, SS.stepStore.run], [0, 0, 1, null]);
  SS.stepOnDrop('light3d', null); clear();
});

/* a cycle of a sweep on the examples, through the store as the page fills and reads it: each step traced, its field run
   and its volume made, all kept as the step's; then the cycle again, every layer taken from the store by the key the
   bench gives, against the same worked out from nothing */
const DIR = new URL('../../../demos/', import.meta.url);
const num = (k, v) => (typeof v === 'function' ? undefined : v instanceof Map ? [...v.entries()] : ArrayBuffer.isView(v) ? Array.from(v) : v && typeof v === 'object' && typeof v.type === 'string' && typeof v.id === 'string' && k !== '' ? 'el:' + v.id : v);
const shownT = T => JSON.stringify({ rays: T.rays, beams: T.beams, screens: T.screens, blocked: T.blocked, absorbed: T.absorbed, emitted: T.emitted, scat: T.scat && T.scat.parts }, num);
const shownF = R => JSON.stringify(R.segs.map(s => [s.i, s.eng, s.F0]), num), shownV = V => JSON.stringify(V.segs.map(s => [s.i, s.ts, s.I]), num);
for (const f of ['michelson', 'mach-zehnder', 'fabry-perot', 'optical-tweezers', 'levitated-nanoparticle']) {
  test('a cycle played over what the store keeps is the fresh cycle: ' + f, async () => {
    const d = JSON.parse(fs.readFileSync(new URL(f + '.jekray', DIR), 'utf8'));
    d.light = Object.assign({}, d.light, { field: true });
    await openBench(d); clear();
    let el = null, path = 'x', a, b;
    for (const e of E.ST.project.elements) for (const [p, sw] of Object.entries(e.sweeps || {})) if (!el && typeof E.PRM.getPath(e, p) === 'number') { el = e; path = p; a = sw.min; b = sw.max; }
    if (!el) { el = E.ST.project.elements.find(e => typeof e.x === 'number' && e.type !== 'source' && e.type !== 'draw'); a = el.x - 0.5; b = el.x + 0.5; }
    const n = 5, at = i => a + (b - a) * i / n, bb = [-300, -300, 300, 300], tab = E.ST.project.tab;
    const was = hooks.playing;
    try {
      // from nothing, nothing kept
      hooks.playing = () => false;
      const want = [];
      for (let i = 0; i < n; i++) {
        setParam(el, path, at(i)); TR.setLastTraceKey(null); TR.traceScene();
        const srcs = BT.popSources(), R = srcs.length ? BT.popRun(TR.lastTrace.beams, srcs, {}) : null;
        want.push({ t: shownT(TR.lastTrace), f: R && shownF(R), v: R && shownV(VOL.volData(R.segs, tab, bb, null)) });
      }
      // the sweep: its run, a cycle that fills the store, another that reads it
      hooks.playing = () => true; TR.setTraceStoreTest(true);
      SS.stepRunBegin([[el.id, path]], n, (k, i) => at(i), f);
      const keys = i => { const srcs = BT.popSources(), pk = srcs.length ? BT.popKeyOf(TR.lastTrace.beams, srcs) : null; return { srcs, pk, vk: pk && pk + '|' + tab + '|' + bb.join() }; };
      for (let i = 0; i < n; i++) {
        setParam(el, path, at(i)); TR.traceScene();
        const { srcs, pk, vk } = keys(i);
        if (!pk) continue;
        const R = BT.popRun(TR.lastTrace.beams, srcs, {});
        SS.stepKeep('bench', pk, R, { bytes: 1000 }); SS.stepKeep('vol', vk, VOL.volData(R.segs, tab, bb, null), { bytes: 1000 });
      }
      const can = TR.traceStoreOn(), hits0 = TR.traceStoreHits;
      for (const i of [3, 0, 4, 1, 2]) {
        setParam(el, path, at(i)); TR.traceScene();
        assert.equal(SS.stepNow(), SS.stepKeyOf([[el.id, path, at(i)]]));
        assert.ok(shownT(TR.lastTrace) === want[i].t, 'step ' + i + ': the trace');
        const { pk, vk } = keys(i);
        if (!pk) continue;
        assert.ok(SS.stepMaps.bench.has(pk) && SS.stepInRun(SS.stepMaps.bench.get(pk)), 'step ' + i + ': its field is kept, as the run’s');
        assert.ok(shownF(SS.stepMaps.bench.get(pk)) === want[i].f, 'step ' + i + ': the field');
        assert.ok(shownV(SS.stepMaps.vol.get(vk)) === want[i].v, 'step ' + i + ': the volume');
      }
      if (can && SS.stepMaps.trace.size) assert.ok(TR.traceStoreHits > hits0, 'the traces were taken as kept');
      if (can) for (const x of SS.stepMaps.trace.values()) assert.ok(SS.stepInRun(x), 'each kept trace is a step’s');
    } finally { hooks.playing = was; TR.setTraceStoreTest(false); clear(); }
  });
}

/* a sine's or a triangle's steps on the way down are its steps on the way up, to the last digit: half the states to work
   out (ui/sweeps.js stepValue); a ramp's are all its own; with a phase too, where it is a whole number of half steps */
test('a sine or triangle sweep’s cycle is half as many states as steps; a ramp’s is all of them', async () => {
  const SW = await import('../../src/ui/sweeps.js');
  const states = (sw, n) => new Set(Array.from({ length: n }, (_, i) => SW.stepValue(sw, i, n, 1 / sw.freq))).size;
  const sw = (wave, phase = 0) => ({ min: -3.7, max: 11.3, freq: 0.25, phase, wave });
  for (const n of [7, 12, 18, 48, 60, 600]) {
    assert.equal(states(sw('sine'), n), Math.floor(n / 2) + 1, 'sine ' + n);
    assert.equal(states(sw('triangle'), n), Math.floor(n / 2) + 1, 'triangle ' + n);
    assert.equal(states(sw('ramp'), n), n, 'ramp ' + n);
  }
  // a phase of a whole number of half steps: still half; the values are the wave's own
  assert.ok(states(sw('sine', 90), 12) <= 7); assert.ok(states(sw('triangle', 30), 12) <= 7);
  for (const [wave, phase, n] of [['sine', 0, 12], ['sine', 90, 12], ['triangle', 45, 16], ['sine', 37, 12]]) for (let i = 0; i < n; i++) {
    const s = sw(wave, phase), u = i / n + phase / 360, f = u - Math.floor(u), want = s.min + (s.max - s.min) * (wave === 'triangle' ? (f < 0.5 ? 2 * f : 2 - 2 * f) : (1 - Math.cos(2 * Math.PI * f)) / 2);
    assert.ok(Math.abs(SW.stepValue(s, i, n, 4) - want) < 1e-9, wave + ' ' + phase + ' step ' + i);
  }
});
