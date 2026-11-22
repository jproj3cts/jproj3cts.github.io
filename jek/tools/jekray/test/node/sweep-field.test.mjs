/* What a field sweep's rendered frames are kept under. The bench's field is keyed by the light (popKeyOf over the
   trace) and the 3D volumes by that and the board as the light meets it (volLightBox): an edit the light never reaches
   (a part off the beam, which may make the board bigger) or a change of how the field is drawn (Light › Field
   intensity) leaves every key as it was, so a sweep renders on and plays every frame; an edit in the beam changes the
   key, and the sweep renders again (ui/sweeps.js sweepBenchEdited). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBench, engine } from '../../headless.mjs';

const BENCH = { format: 'jekray', version: 1, minPower: 2, light: { rays: true, envelope: false, field: true, scale: 'lin', byPower: true }, elements: [
  { type: 'source', id: 'S', name: 'Source 1', x: -60, y: 0, angle: 0, wavelength: 633, rays: 41, width: 4, gauss: true, w0: 2, pattern: 'hex' },
  { type: 'cube', id: 'C', name: 'Beam splitter 1', x: 0, y: 0, angle: 5, size: 12.7, reflect: 50 },
  { type: 'mirror', id: 'M', name: 'Mirror off', x: -110, y: 80, angle: 0, diameter: 12.7 },
  { type: 'mirror', id: 'M2', name: 'Mirror in', x: 60, y: 0, angle: 45, diameter: 25.4 }] };

async function setup() {
  const B = await openBench(BENCH); B.trace();
  const E = await engine();
  const BT = await import('../../src/engines/beam-tree.js'), VOL = await import('../../src/engines/volume.js');
  const el = name => E.ST.project.elements.find(e => e.name === name);
  const key = () => { B.trace(); return BT.popKeyOf(E.TRACE.lastTrace.beams, BT.popSources()); };
  return { B, E, BT, VOL, el, key };
}

test('a part moved where the light never goes leaves the field key; one moved in the beam changes it', async () => {
  const { el, key } = await setup();
  const k0 = key();
  el('Mirror off').x = -160; el('Mirror off').y = 120;
  assert.equal(key(), k0, 'off the beam: the same field');
  el('Mirror in').x = 70;
  assert.notEqual(key(), k0, 'in the beam: another field');
});

test('the field intensity scale is how the field is drawn, not part of its key', async () => {
  const { E, key } = await setup();
  const k0 = key();
  for (const sc of ['log', 'log60', 'lin']) { E.ST.project.light.scale = sc; assert.equal(key(), k0, sc); }
});

test('a 3D volume is kept under the board as the light meets it, and is the same on any board that holds the light', async () => {
  const { E, BT, VOL, key } = await setup();
  key();
  const beams = E.TRACE.lastTrace.beams, srcs = BT.popSources();
  // the board grown on the side no light reaches (a part put far behind the source), and on one side the light leaves by
  const bb = [-212, -112, 163, 188], behind = [-412, -112, 163, 188], ahead = [-212, -400, 163, 400];
  assert.deepEqual(VOL.volLightBox(behind, beams, srcs), VOL.volLightBox(bb, beams, srcs), 'grown behind the source: the same key');
  assert.notDeepEqual(VOL.volLightBox(ahead, beams, srcs), VOL.volLightBox(bb, beams, srcs), 'grown where the light runs on: another key');
  const R = BT.popRun(beams, srcs, {}), tab = E.ST.project.tab;
  const a = VOL.volData(R.segs, tab, bb, null), b = VOL.volData(R.segs, tab, behind, null), c = VOL.volData(R.segs, tab, VOL.volLightBox(bb, beams, srcs), null);
  const sig = V => V.segs.map(s => [s.i, s.ts.length, s.ts[0].toFixed(6), s.ts[s.ts.length - 1].toFixed(6)].join()).join(';');
  assert.ok(a.segs.length > 0, 'there is a volume');
  assert.equal(sig(b), sig(a), 'the volume on the bigger board is the same');
  assert.equal(sig(c), sig(a), 'cutting to the light box is cutting to the board');
});

test('how a screen’s pattern is drawn (on its face in 3D, to which scale) is no part of the trace’s key or of its field’s', async () => {
  const B = await openBench(Object.assign({}, BENCH, { elements: BENCH.elements.concat([{ type: 'screen', id: 'D', name: 'Screen', x: 30, y: 0, angle: 180, length: 20 }]) })); B.trace();
  const E = await engine(), DF = await import('../../src/engines/diffraction.js');
  const scr = E.ST.project.elements.find(e => e.id === 'D');
  const keys = () => { B.trace(); const J = DF.popScreenPrep(scr); return [E.TRACE.traceKeyNow(), J && J.key]; };
  const k0 = keys();
  assert.ok(k0[1], 'the light reaches the screen');
  scr.faceMap = true; assert.deepEqual(keys(), k0, 'the pattern on its face');
  scr.mapScale = 'log'; assert.deepEqual(keys(), k0, 'its scale');
  scr.length = 22; assert.notDeepEqual(keys(), k0, 'its size is part of both');
});

test('a 3D volume’s segments carry their beams’ colours, and segments added together the colour of both by power', async () => {
  const VOL = await import('../../src/engines/volume.js');
  assert.deepEqual(VOL.volRgb('#ff8000').map(v => +v.toFixed(3)), [1, 0.502, 0]);
  assert.deepEqual(VOL.volRgb(undefined), [1, 1, 1]);
  const { E, BT } = await setup();
  const beams = E.TRACE.lastTrace.beams, srcs = BT.popSources(), R = BT.popRun(beams, srcs, {});
  const V = VOL.volData(R.segs, E.ST.project.tab, [-212, -112, 163, 188], null);
  assert.ok(V.segs.length > 0 && V.segs.every(s => Array.isArray(s.rgb) && s.rgb.length === 3 && s.rgb.every(c => c >= 0 && c <= 1)), 'each has a colour');
  // two of one shape, a red of three parts and a blue of one: three quarters red
  const seg = (rgb, cw) => ({ two: false, M: 2, o: [0, 0, 0], e: [1, 0, 0], ts: [0, 1], rmax: [1, 1], I: new Float32Array([1, 1, 1, 1]), peak: 1, coh: 0, launch: Math.random(), rgb, cw });
  const m = VOL.volMerge([seg([1, 0, 0], 3), seg([0, 0, 1], 1)]);
  assert.equal(m.segs.length, 1);
  assert.deepEqual(m.segs[0].rgb, [0.75, 0, 0.25]);
  assert.equal(m.segs[0].I[0], 2);
});
