/* The fibre collimator: a fibre tip with a lens of focal length f. It sends out a collimated beam of 1/e^2 radius
   lambda f / (pi w), w the fibre's mode, and takes light in by that beam's mode: Gaussian overlap, size and offset. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBench, engine } from '../../headless.mjs';

const wf = (() => { const a = 2.2, V = 2 * Math.PI * a * 0.12 / 1.55; return 1e-3 * a * (0.65 + 1.619 * V ** -1.5 + 2.879 * V ** -6); })();
const wc = 1550e-6 * 11 / (Math.PI * wf);                   // the collimated beam's radius, mm

async function coupling(w0, coll, dy = 0) {
  await openBench({ format: 'jekray', version: 1, elements: [
    { type: 'source', id: 'S', name: 'S', x: -100, y: dy, angle: 0, wavelength: 1550, gauss: true, w0, z0: 100, rays: 1, width: 2 * w0, power: 1 },
    { type: 'fibre', id: 'C', name: 'C', x: 0, y: 0, angle: 180, coll, length: 6 }] });
  const E = await engine();
  E.TRACE.setLastTraceKey(null); E.TRACE.traceScene();
  return E.FF.fibreCoupling(E.ST.project.elements.find(e => e.id === 'C')).eff;
}

test('a matched collimated beam couples fully into a collimator; a mismatch or an offset costs the Gaussian overlap', async () => {
  assert.ok(Math.abs(await coupling(wc, 11) - 1) < 1e-3, 'matched');
  assert.ok(await coupling(wc, 0) < 0.01, 'a bare tip takes almost none of a millimetre beam');
  const w1 = 0.3, size = (2 * w1 * wc / (w1 * w1 + wc * wc)) ** 2;
  assert.ok(Math.abs(await coupling(w1, 11) - size) < 0.01, 'size mismatch');
  const d = 0.3, off = Math.exp(-2 * d * d / (2 * wc * wc));
  assert.ok(Math.abs(await coupling(wc, 11, d) - off) < 0.01, 'offset');
});

test('a collimator sends out a collimated beam lambda f / (pi w) in radius, and the picker makes one', async () => {
  const E = await engine();
  const made = E.EL.makeElement ? E.EL.makeElement('collimator', 0, 0) : null;
  if (made) assert.ok(made.type === 'fibre' && made.coll === 11, JSON.stringify(made));
  const B = await openBench({ format: 'jekray', version: 1, elements: [
    { type: 'fcomp', id: 'L', name: 'Laser', x: -80, y: 20, angle: 0, kind: 'laser', wavelength: 1550, power: 1 },
    { type: 'fibre', id: 'C', name: 'C', x: 0, y: 0, angle: 0, coll: 11, length: 6 },
    { type: 'screen', id: 'S', name: 'Screen', x: 20, y: 0, angle: 180, length: 10 }],
    fibres: [{ id: 'f1', a: ['L', 0], b: ['C', 0], len: 1, loss: 0 }] });
  const s = B.screen('Screen');
  assert.ok(s.beam && Math.abs(s.beam.w - wc) / wc < 0.01, JSON.stringify(s.beam));
});
