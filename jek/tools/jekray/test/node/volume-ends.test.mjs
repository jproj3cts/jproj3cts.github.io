/* The 3D field reaches the end of each beam: a segment's cuts run to its end, the last placed exactly there even
   when rounding the cuts to a nanometre puts it a hair past (it was dropped, and an interferometer's fringes stopped a
   block short of the screen). A Mach–Zehnder-like bench from two collimators fed by one fibre laser. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBench, engine } from '../../headless.mjs';

const BENCH = { format: 'jekray', version: 1, light: { rays: false, envelope: true, field: true, scale: 'lin' }, elements: [
  { type: 'cube', id: 'bs1', name: 'BS1', x: -60.935, y: -29.0969, angle: 90, size: 12.7, mode: 'npbs', reflect: 10 },
  { type: 'cube', id: 'bs2', name: 'BS2', x: 2.2658, y: -29.0969, angle: 0, size: 12.7, mode: 'npbs', reflect: 10 },
  { type: 'mirror', id: 'm1', name: 'M1', x: -60.935, y: -78.4166, angle: 45.1, length: 25.4 },
  { type: 'cube', id: 'bs3', name: 'BS3', x: 2.2658, y: -78.4166, angle: -90, size: 12.7, mode: 'npbs', reflect: 50 },
  { type: 'screen', id: 'scr', name: 'Screen', x: 2.2953, y: -100.3182, angle: 90, length: 25.4 },
  { type: 'fcomp', id: 'las', name: 'Laser', x: -183.8, y: -10.19, angle: 0, kind: 'laser', wavelength: 1550, power: 1, pol: 's' },
  { type: 'fcomp', id: 'spl', name: 'Splitter', x: -161.6, y: -10.58, angle: 0, kind: 'split', ways: 2, loss: 0.2 },
  { type: 'fibre', id: 'c1', name: 'C1', x: -111.379, y: -29.0969, angle: 0, coll: 11, length: 6 },
  { type: 'fibre', id: 'c2', name: 'C2', x: 60.9146, y: -29.0969, angle: -180, coll: 11, length: 6 }],
  fibres: [{ id: 'f1', a: ['las', 0], b: ['spl', 0], len: 1, loss: 0.2 }, { id: 'f2', a: ['spl', 2], b: ['c1', 0], len: 1, loss: 0.2 }, { id: 'f3', a: ['spl', 1], b: ['c2', 0], len: 1, loss: 0.2 }] };

test('every interfering segment of the 3D field is cut to its end', async () => {
  const B = await openBench(BENCH); B.trace();
  const E = await engine();
  const BT = await import('../../src/engines/beam-tree.js'), VOL = await import('../../src/engines/volume.js');
  const R = BT.popRun(E.TRACE.lastTrace.beams, BT.popSources(), {});
  const V = VOL.volData(R.segs, E.ST.project.tab, null);
  const bySeg = new Map(R.segs.map(s => [s.i, s]));
  const coh = V.segs.filter(v => v.coh);
  assert.ok(coh.length >= 2, 'the beams on to the screen interfere');
  for (const v of coh) {
    const b = bySeg.get(v.i).b, end = Math.min(b.len3 || b.len, 2000);
    assert.ok(Math.abs(v.ts[v.ts.length - 1] - end) < 1e-3, 'segment ' + v.i + ' cut to ' + v.ts[v.ts.length - 1] + ' of ' + end);
  }
});
