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
