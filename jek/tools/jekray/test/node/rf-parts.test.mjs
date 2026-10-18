/* The RF palette's offset reflector and radome (parts/rf.js): a reflector fed from the focus its panel names collimates
   the bench's rays exactly; a radome sheet a half-wave thick passes everything but what it absorbs, and off that
   thickness reflects (core/face-pol.js, the sheet as one stack). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const TRACE = await import('../../src/engines/trace.js');
const C = await import('../../src/core/rf.js');
const { frame, toWorld } = await import('../../src/core/mask.js');
const { mirrorFocus } = await import('../../src/core/assembly.js');
const { faceAmps } = await import('../../src/core/face-pol.js');
const { cabs2 } = await import('../../src/core/numeric.js');
const { absorbAt, refIndex } = await import('../../src/core/glass.js');
const nm24 = C.C_NM_GHZ / 24;

test('an offset reflector fed from the focus its panel names sends the rays out parallel, turned by 2 atan(h/2f)', () => {
  for (const [h, angle] of [[120, 180], [60, 150], [0, 180]]) {
    const m = { type: 'mirror', id: 'M', name: 'M', x: 10, y: -5, angle, length: 160, R: 300, k: -1, offset: h, metal: 'Al', mmw: { part: true } };
    const F = mirrorFocus(m), [fx, fy] = toWorld(frame(m), F.x, F.y);
    assert.ok(Math.abs(F.f - 150) < 1e-12 && Math.abs(F.sag0 - h * h / 600) < 1e-9, 'f and the parent sag at the offset');
    const aim = Math.atan2(m.y - fy, m.x - fx) / Math.PI * 180;
    loadProject({ format: 'jekray', version: 1, elements: [
      { type: 'source', id: 'S', name: 'S', x: fx, y: fy, angle: aim, rays: 41, width: 0, divergence: 40, wavelength: nm24 },
      m, { type: 'screen', id: 'T', name: 'T', x: m.x + 400 * Math.cos(angle * Math.PI / 180), y: m.y + 400 * Math.sin(angle * Math.PI / 180), angle: angle + 180, length: 600 }] });
    TRACE.setLastTraceKey(null); TRACE.traceScene();
    const hits = TRACE.lastTrace.screens.T.filter(x => !x.chief);
    assert.ok(hits.length > 30, 'rays reach the screen: ' + hits.length);
    const spread = Math.max(...hits.map(x => x.dly)) - Math.min(...hits.map(x => x.dly));
    assert.ok(spread < 1e-9, 'parallel after the mirror (h ' + h + '): spread ' + spread);
    // the turn from the feed's way in to the beam's way out
    const turn = 180 - Math.abs(((aim - angle) % 360 + 540) % 360 - 180), want = 2 * Math.atan(h / 300) / Math.PI * 180;   // the feed off the beam sent out
    assert.ok(Math.abs(turn - want) < 1e-9, 'turned ' + turn + ', 2 atan(h/2f) = ' + want);
  }
});

test('a radome a half-wave thick passes all but its absorption; off that thickness its faces reflect', () => {
  const mat = { glass: 'HDPE' }, n = refIndex(mat, nm24), alpha = absorbAt(mat, nm24), lam = nm24 * 1e-6, half = lam / (2 * n);
  const through = (t, ci) => { const F = faceAmps({ coat: { mode: 'stack', layers: [{ n, d: t * 1e6 }] } }, 1, 1, ci, nm24); return { s: cabs2(F.ts), p: cabs2(F.tp) }; };
  const T1 = through(half, 1), T2 = through(2 * half, 1), Toff = through(1.5 * half, 1), bare = ((n - 1) / (n + 1)) ** 2;
  assert.ok(Math.abs(T1.s - 1) < 1e-9 && Math.abs(T2.s - 1) < 1e-9, 'a half-wave and a full wave pass everything: ' + T1.s + ', ' + T2.s);
  // a quarter-wave sheet reflects the most: 4R/(1+R)² of a bare face's R
  const Rq = 4 * bare / (1 + bare) ** 2;
  assert.ok(Math.abs(1 - Toff.s - Rq) < 1e-9, 'a quarter wave off: reflects ' + (1 - Toff.s) + ' against ' + Rq);
  // at an angle, s and p part, and the half-wave thickness grows as 1/cos of the angle in the sheet
  const th = 30 * Math.PI / 180, ci = Math.cos(th), ct = Math.sqrt(1 - Math.sin(th) ** 2 / (n * n)), Ta = through(half / ct, ci);
  assert.ok(Math.abs(Ta.s - 1) < 1e-9 && Math.abs(Ta.p - 1) < 1e-9, 'a half wave at the angle passes everything: ' + Ta.s + ', ' + Ta.p);
  const Tb = through(half, ci);
  assert.ok(Tb.s < 1 - 1e-4 && Tb.p > Tb.s, 'square-on half wave at 30°: reflects a little, less for p: ' + Tb.s + ', ' + Tb.p);
  // the plastic's loss over the sheet, as the panel counts it
  assert.ok(alpha > 0 && Math.exp(-alpha * 3) > 0.99, 'HDPE 3 mm absorbs under 1% at 24 GHz');
});
