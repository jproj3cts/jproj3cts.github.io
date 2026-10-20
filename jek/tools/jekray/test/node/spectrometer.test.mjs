/* The free-space spectrometer: its resolution from the array and the entrance, the light through a slit, the peak and its width,
   counts, saturation and the signal-to-noise; its kinds; and the Czerny–Turner example built from parts, whose lines land apart. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBench, openFile, engine } from '../../headless.mjs';
const DEMO = new URL('../../../demos/czerny-turner.jekray', import.meta.url).pathname;

// a HeNe focused by an f 100 mm lens onto the entrance; mW, and the spectrometer's own fields
const bench = (spec = {}, src = {}) => openBench({ format: 'jekray', version: 1, elements: [
  { type: 'source', id: 'S', name: 'HeNe', x: 0, y: 0, angle: 0, wavelength: 632.8, power: 1e-8, gauss: true, w0: 0.5, z0: 0, rays: 1, width: 1, ...src },
  { type: 'lens', id: 'L', name: 'L', x: 50, y: 0, angle: 0, diameter: 25.4, surfaces: [{ R: 51.5 }, { R: null }], gaps: [3.6], materials: [{ glass: 'N-BK7' }] },
  { type: 'spectrometer', id: 'P', name: 'Spec', x: 149.9, y: 0, angle: 180, preset: 'compact', ...spec }] });
const read = async (spec, src) => (await bench(spec, src)).spectrometer('Spec');

test('resolution is the entrance and two pixels, times the dispersion; a narrower slit sharpens the line and lets less in', async () => {
  const a = await read(), D = 900 / (2048 * 14);
  assert.ok(Math.abs(a.resolution / (D * Math.hypot(25, 28)) - 1) < 1e-5, JSON.stringify(a));       // to the reading's six figures
  assert.ok(Math.abs(a.peak - 632.8) < 0.01, 'peak ' + a.peak);
  assert.ok(Math.abs(a.fwhm - a.resolution) / a.resolution < 0.12, 'a laser line is as wide as the resolution: ' + a.fwhm);
  const b = await read({ slit: 10 });
  assert.ok(b.resolution < a.resolution && b.fwhm < a.fwhm && b.mw < a.mw && b.share < a.share, JSON.stringify([a, b]));
  const c = await read({ preset: 'hires' });
  assert.ok(c.resolution < 0.07 && Math.abs(c.peak - 632.8) < 0.005, JSON.stringify(c));
});

test('counts, saturation and the signal-to-noise; light outside the range shows nothing', async () => {
  const a = await read();
  assert.equal(a.saturated, false);
  const t = 10e-3, s = Math.sqrt(a.counts + 50 * t + 30 * 30);
  assert.ok(Math.abs(a.snr - a.counts / s) / a.snr < 0.01, JSON.stringify(a));
  const b = await read({}, { power: 1e-6 });
  assert.ok(b.saturated && b.snr === null && b.counts === 60000 && Math.abs(b.peak - 632.8) < 0.01, JSON.stringify(b));
  assert.ok(Math.abs(b.fwhm - a.fwhm) < 0.05, 'saturation does not widen the measured line');
  // a tenth of the light, a tenth of the counts
  const c = await read({}, { power: 1e-9 });
  assert.ok(Math.abs(c.counts / a.counts - 0.1) < 0.005, JSON.stringify([a.counts, c.counts]));
  const d = await read({ preset: 'nir' });
  assert.ok(d.peak === null && d.mw > 0, JSON.stringify(d));
});

test('a source’s own linewidth and its extra lines', async () => {
  const a = await read(), p = await read({}, { tau: 100 });
  assert.ok(p.fwhm > 3 * a.fwhm && Math.abs(p.peak - 632.8) < 0.02, 'a 100 fs pulse is a few nm wide: ' + p.fwhm);
  const two = await read({ preset: 'hires', tint: 10 }, { power: 1e-9, lines: [633.8] });
  assert.equal(two.lines.length, 2);
  assert.ok(two.lines.some(L => Math.abs(L.nm - 633.8) < 1e-9), JSON.stringify(two.lines));
});

test('the kind is what its values are; the integration time does not change it', async () => {
  const B = await bench({ preset: 'hires', tint: 7 });
  const E = await engine(), el = E.ST.project.elements.find(e => e.id === 'P');
  assert.equal(el.preset, 'hires');
  assert.equal(el.pixels, 3648);
  const C = await bench({ preset: 'hires', slit: 12 });
  assert.equal((await engine()).ST.project.elements.find(e => e.id === 'P').preset, 'custom');
  assert.ok(B && C);
});

test('the Czerny–Turner example: each mercury line sharp on the detector plane, the yellow doublet resolved; the part reads all four', async () => {
  const B = await openFile(DEMO);
  B.trace();
  const E = await engine(), hits = E.TRACE.lastTrace.screens[E.ST.project.elements.find(e => e.name === 'Detector plane').id] || [];
  const at = {};
  for (const h of hits) (at[h.nm] ||= []).push(h.y);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length, spread = a => Math.max(...a) - Math.min(...a);
  assert.deepEqual(Object.keys(at).map(Number).sort((a, b) => a - b), [435.8, 546.1, 577, 579.1]);
  for (const k in at) assert.ok(spread(at[k]) < 0.15, k + ' nm spot ' + spread(at[k]));
  const gap = Math.abs(mean(at['579.1']) - mean(at['577']));
  assert.ok(gap > 0.3 && gap < 0.4 && gap > 2 * Math.max(spread(at['577']), spread(at['579.1'])), 'doublet ' + gap);
  const S = B.spectrometer('Spectrometer');
  assert.ok(S.lines.length === 4 && !S.saturated && S.snr > 50, JSON.stringify(S));
});
