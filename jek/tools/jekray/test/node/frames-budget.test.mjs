/* A field sweep's rendered frames are kept within a budget of memory (ui/sweeps.js FRAME_BUDGET): a frame's size is its
   typed arrays (each buffer once) and pictures, not the trace it points at (frameBytes); a render whose cycle would not
   fit renders every so many steps (renderStride), so that what it keeps fits. The levitated-trap example's sweep (240
   steps of a 2D field over 59 segments, about 140 MB each) kept whole ran the page out of memory. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBench, engine } from '../../headless.mjs';
await engine();
const SW = await import('../../src/ui/sweeps.js');
const BT = await import('../../src/engines/beam-tree.js');
const TR = await import('../../src/engines/trace.js');

test('a frame’s bytes: its typed arrays once each, not the beams and sources it points at', () => {
  const buf = new Float64Array(1000), beam = { pts: new Float64Array(5000) };
  const F = { segs: [{ b: beam, src: { big: new Float64Array(9000) }, F0: { re: buf, im: new Float64Array(1000) }, draw: { lin: new Float32Array(10) } },
    { b: beam, F0: { re: buf, im: buf.subarray(0, 10) } }] };
  assert.equal(SW.frameBytes(F), 8000 + 8000 + 40);
  assert.equal(SW.frameBytes({ packed: F }), 8000 + 8000 + 40);
});

test('a 2D field run’s frame counts every segment’s starting field', async () => {
  const bench = { format: 'jekray', version: 1, light: { rays: true, field: true, scale: 'lin' }, elements: [
    { type: 'source', id: 'S', name: 'S', x: -60, y: 0, angle: 0, wavelength: 633, rays: 11, width: 4, gauss: true, w0: 1, popModel: '2d', popN: 64 },
    { type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, f: 50, length: 20 }, { type: 'mirror', id: 'M', name: 'M', x: 60, y: 0, angle: 30, length: 20 }] };
  const B = await openBench(bench); B.trace();
  const R = BT.popRun(TR.lastTrace.beams, BT.popSources(), {});
  let want = 0; const seen = new Set();
  for (const sg of R.segs) for (const v of Object.values(sg.F0)) if (ArrayBuffer.isView(v) && !seen.has(v.buffer)) { seen.add(v.buffer); want += v.buffer.byteLength; }
  assert.ok(R.segs.length >= 2 && want > 0);
  assert.ok(SW.frameBytes(R) >= want, SW.frameBytes(R) + ' < ' + want);
});

test('a cycle too large to keep whole is rendered every so many steps, and what is kept then fits', () => {
  const B = SW.FRAME_BUDGET;
  assert.ok(B >= 384e6 && B <= 1.5e9);
  assert.equal(SW.renderStride(48, 1e6), 1, 'a small field: every step');
  assert.equal(SW.renderStride(240, 0), 1);
  for (const [n, s] of [[240, 140e6], [48, 60e6], [600, 3e6], [17, 0.2 * B], [5, 2 * B]]) {
    const k = SW.renderStride(n, s), kept = Math.ceil(n / k);
    assert.ok(k >= 1 && Number.isInteger(k));
    assert.ok(kept === 1 || kept * s <= B, n + ' steps of ' + s + ': every ' + k + 'th, ' + kept + ' kept');
    if (k > 1) assert.ok(Math.ceil(n / (k - 1)) * s > 0.85 * B, 'no closer spacing would fit');
  }
  // the levitated-trap example's own sweep: 240 steps of about 140 MB
  const k = SW.renderStride(240, 140e6);
  assert.ok(k > 1 && Math.ceil(240 / k) * 140e6 <= B);
  SW.setFrameBudget(10e9); assert.equal(SW.renderStride(48, 140e6), 1, 'a larger budget keeps every step'); SW.setFrameBudget(0);
});
