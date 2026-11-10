/* Metal layers in a thin-film stack (core/metals.js, core/coatings.js filmLayerC): the measured tables as published, a
   thick film reflecting as the bulk metal does by Fresnel with a complex index (square on and at 45°, s and p), a film
   of no thickness the bare face, a film's absorption (what it neither reflects nor passes), a thin film passing light,
   and the optimiser on a metal's thickness in nanometres. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { METAL_NK, metalNK, metalCovers } = await import('../../src/core/metals.js');
const { stackAmp, coatR } = await import('../../src/core/coatings.js');
const { faceAmps } = await import('../../src/core/face-pol.js');
const { coatOptimise, coatSpec } = await import('../../src/core/coatdesign.js');
const c = { mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]], div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
  add: (a, b) => [a[0] + b[0], a[1] + b[1]], sub: (a, b) => [a[0] - b[0], a[1] - b[1]], abs2: a => a[0] * a[0] + a[1] * a[1],
  sqrt: a => { const r = Math.hypot(a[0], a[1]); return [Math.sqrt((r + a[0]) / 2), Math.sign(a[1] || 1) * Math.sqrt((r - a[0]) / 2)]; } };

test('the tables are the published ones: Johnson and Christy’s silver and gold, Rakić’s aluminium, at their own points', () => {
  const at = (m, nm) => { const i = METAL_NK[m].nm.indexOf(nm); return [METAL_NK[m].n[i], METAL_NK[m].k[i]]; };
  assert.deepEqual(at('Ag', 1937), [0.24, 14.08]);
  assert.deepEqual(at('Au', 1937), [0.92, 13.78]);
  assert.deepEqual(metalNK('Ag', 1937), [0.24, 14.08]);
  const ag = metalNK('Ag', 632.8);
  assert.ok(Math.abs(ag[0] - 0.056) < 0.01 && Math.abs(ag[1] - 4.28) < 0.05, 'silver at 632.8 nm, n 0.056 k 4.28: ' + ag);
  assert.equal(metalCovers('Ag', 550), true); assert.equal(metalCovers('Ag', 5000), false); assert.equal(metalCovers('Al', 10000), true);
});
test('a thick film reflects as the bulk metal does: Fresnel with N = n − ik, square on and at 45° for s and p', () => {
  for (const [m, nm] of [['Ag', 633], ['Al', 550], ['Au', 1064]]) {
    const [n, k] = metalNK(m, nm), N = [n, -k], one = [1, 0];
    const L = [{ n: 1, d: 400, metal: m }];
    // square on: ((1 − N) / (1 + N))², whatever is behind it
    const R0 = c.abs2(c.div(c.sub(one, N), c.add(one, N)));
    for (const ns of [1, 1.5168]) assert.ok(Math.abs(c.abs2(stackAmp(L, 1, ns, 1, nm, 's')) - R0) < 1e-9, m + ' square on, behind ' + ns);
    // at 45°: cos θ in the metal from Snell's law, then s and p by Fresnel
    const s0 = Math.SQRT1_2, c0 = Math.SQRT1_2, sN = c.div([s0, 0], N), ct = c.sqrt(c.sub(one, c.mul(sN, sN)));
    const Nc = c.mul(N, ct), rs = c.div(c.sub([c0, 0], Nc), c.add([c0, 0], Nc));
    const rp = c.div(c.sub(c.mul(N, [c0, 0]), ct), c.add(c.mul(N, [c0, 0]), ct));
    assert.ok(Math.abs(c.abs2(stackAmp(L, 1, 1.5, c0, nm, 's')) - c.abs2(rs)) < 1e-9, m + ' s at 45°');
    assert.ok(Math.abs(c.abs2(stackAmp(L, 1, 1.5, c0, nm, 'p')) - c.abs2(rp)) < 1e-9, m + ' p at 45°');
  }
});
test('a film of no thickness is the bare face, and a lossless stack is unchanged by the metal path', () => {
  const bare = ((1 - 1.5) / (1 + 1.5)) ** 2;
  assert.ok(Math.abs(c.abs2(stackAmp([{ n: 1, d: 0, metal: 'Ag' }], 1, 1.5, 1, 550, 's')) - bare) < 1e-12);
  const L = [{ n: 1.38, d: 99.6 }, { n: 2.1, d: 65.5 }];
  assert.deepEqual(stackAmp(L, 1, 1.52, 0.9, 550, 'p'), stackAmp(L.map(x => ({ ...x })), 1, 1.52, 0.9, 550, 'p'));
});
test('a metal absorbs: thick, nothing passes and R + A = 1; 20 nm of silver passes light and absorbs some', () => {
  const thick = faceAmps({ coat: { mode: 'stack', layers: [{ n: 1, d: 300, metal: 'Al' }] } }, 1, 1.5, 1, 550);
  assert.ok(c.abs2(thick.ts) < 1e-9 && c.abs2(thick.rs) > 0.9 && c.abs2(thick.rs) < 0.93, 'aluminium at 550 nm: about 91.5%, nothing through');
  const thin = faceAmps({ coat: { mode: 'stack', layers: [{ n: 1, d: 20, metal: 'Ag' }] } }, 1, 1.5, 1, 550);
  const R = c.abs2(thin.rs), T = c.abs2(thin.ts), A = 1 - R - T;
  assert.ok(T > 0.1 && R > 0.3 && A > 0.005 && A < 0.3, '20 nm of silver: R ' + R.toFixed(3) + ', T ' + T.toFixed(3) + ', A ' + A.toFixed(3));
  // a lossless stack passes what it does not reflect
  const ar = faceAmps({ coat: { mode: 'stack', layers: [{ n: 1.38, d: 99.6 }] } }, 1, 1.5, 1, 550);
  assert.ok(Math.abs(c.abs2(ar.rs) + c.abs2(ar.ts) - 1) < 1e-12);
  // coatR reads the same stack
  assert.ok(Math.abs(coatR({ mode: 'stack', layers: [{ n: 1, d: 300, metal: 'Al' }] }, 1, 1.5, 550) - c.abs2(thick.rs)) < 1e-12);
});
test('the optimiser takes a metal’s thickness in nanometres: a silver layer on glass for most light at 633 nm, held under 320 nm', () => {
  const spec = coatSpec({ target: 'hr', ns: 1.5, lo: 600, hi: 660, design: 633 });
  const o = coatOptimise([{ n: 1, d: 15, metal: 'Ag' }], spec);
  assert.equal(o.layers[0].metal, 'Ag');
  assert.ok(o.after < o.before && o.layers[0].d > 40 && o.layers[0].d <= 320, 'from 15 nm to ' + o.layers[0].d + ' nm');
});
