/* A phosphor screen's glow: lit where the rays land (round, as wide up as across), or from the field's map; it follows
   the light up at once and fades to 1/e in the decay time once the light moves on. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHOS_N, phosphorFromMap, phosphorFromRays, phosphorStep } from '../../src/engines/phosphor.js';

const L = 10, n = PHOS_N, cell = 2 * L / n;
const fan = (y0, half = 1, k = 11, w = 1) => Array.from({ length: k }, (_, i) => ({ y: y0 - half + 2 * half * i / (k - 1), w, sid: 'S' }));
const centroid = S => { let su = 0, sv = 0, sw = 0; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const b = S[j * n + i]; su += b * (-L + (i + 0.5) * cell); sv += b * (-L + (j + 0.5) * cell); sw += b; } return [su / sw, sv / sw]; };
const rms = (S, across) => { const [cu, cv] = centroid(S); let s = 0, sw = 0; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const b = S[j * n + i], d = across ? -L + (i + 0.5) * cell - cu : -L + (j + 0.5) * cell - cv; s += b * d * d; sw += b; } return Math.sqrt(s / sw); };

test('rays light a round spot where they land, its peak 1; a chief ray and dark rays light nothing', () => {
  const S = phosphorFromRays([...fan(3), { y: -8, w: 1, chief: true, sid: 'S' }, { y: -6, w: 0, sid: 'S' }], L);
  assert.equal(Math.max(...S), 1);
  const [cu, cv] = centroid(S);
  assert.ok(Math.abs(cu - 3) < 0.05 && Math.abs(cv) < 0.05, [cu, cv]);
  const a = rms(S, true), b = rms(S, false);
  assert.ok(Math.abs(a / b - 1) < 0.25, 'round: ' + a + ' across, ' + b + ' up');
  assert.equal(S[Math.round(n / 2) * n + Math.floor((-8 + L) / cell)], 0);
});
test('rays at a height land there; each source by the power it carries', () => {
  const S = phosphorFromRays(fan(0).map(t => ({ ...t, z: 4 })), L);
  assert.ok(Math.abs(centroid(S)[1] - 4) < 0.05);
  const two = phosphorFromRays([...fan(-5, 0.5, 11, 1), ...fan(5, 0.5, 11, 0.25).map(t => ({ ...t, sid: 'T' }))], L);
  const [cu] = centroid(two);
  assert.ok(Math.abs(cu - (-5 * 1 + 5 * 0.25) / 1.25) < 0.1, 'weighted ' + cu);
});
test('the field’s map, sampled onto the face; outside it nothing', () => {
  const m = 8, v = new Float32Array(m * m);
  v[3 * m + 5] = 2;                       // one bright pixel: up row 3, across column 5
  const M = { n: m, u0: -4, u1: 4, v0: -4, v1: 4, v };
  const S = phosphorFromMap(M, L);
  const [cu, cv] = centroid(S);
  assert.equal(Math.max(...S), 1);
  assert.ok(Math.abs(cu - 1.5) < 0.6 && Math.abs(cv - (-0.5)) < 0.6, [cu, cv]);
  assert.equal(S[2 * n + 2], 0);
});
test('the glow follows the light up at once, and fades to 1/e in the decay time after it moves on', () => {
  const B = new Float32Array(4), on = new Float32Array([1, 0, 0, 0]), moved = new Float32Array([0, 1, 0, 0]);
  assert.equal(phosphorStep(B, on, 0.016, 2), false);
  assert.equal(B[0], 1);
  assert.equal(phosphorStep(B, moved, 0.5, 0.5), true);
  assert.ok(Math.abs(B[0] - Math.exp(-1)) < 1e-6 && B[1] === 1, [...B]);
  for (let i = 0; i < 20; i++) phosphorStep(B, moved, 0.5, 0.5);
  assert.equal(B[0], 0);
  assert.equal(phosphorStep(B, moved, 0.1, 0.5), false, 'settled');
  phosphorStep(B, null, 1, 1);
  assert.ok(Math.abs(B[1] - Math.exp(-1)) < 1e-6, 'the light gone: all of it fades');
});
