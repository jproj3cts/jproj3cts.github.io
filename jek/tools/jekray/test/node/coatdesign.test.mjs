/* Designing a coating (core/coatdesign.js): the reflectance comes from the one stack model the bench traces with; a
   quarter-wave MgF2 layer on BK7 reflects what the textbook says; the optimiser brings a two- and a three-layer stack
   to a broadband anti-reflection coating, a splitter to its reflectance, and an RF matching layer to nothing reflected. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
const CD = await import('../../src/core/coatdesign.js');
const { coatR } = await import('../../src/core/coatings.js');
const { qwot } = await import('../../src/core/coatings.js');

test('a quarter-wave MgF2 layer on BK7: 1.26% at the design wavelength, the bench’s own stack model', () => {
  const spec = CD.coatSpec({ target: 'ar', ns: 1.5168, lo: 450, hi: 650, design: 550 }), L = [{ n: 1.38, d: qwot(1.38, 550) }];
  const R = CD.stackR(L, 1, 1.5168, 1, 550, 'avg'), want = ((1.38 * 1.38 - 1.5168) / (1.38 * 1.38 + 1.5168)) ** 2;
  assert.ok(Math.abs(R - want) < 1e-9, R + ' against ' + want);
  assert.ok(Math.abs(R - coatR({ mode: 'stack', layers: L }, 1, 1.5168, 550)) < 1e-12, 'as the bench reads a stack');
  const S = CD.coatSummary(L, spec);
  assert.ok(S.bare > 0.04 && S.mean < 0.02 && S.design < 0.013, JSON.stringify(S));
});

test('the optimiser: a three-layer stack brought to a broadband AR under 0.5% mean, a splitter to 50%, an RF layer to nothing', () => {
  const spec = CD.coatSpec({ target: 'ar', ns: 1.5168, lo: 450, hi: 650, theta: 20 });
  const start = [{ n: 1.38, d: 80 }, { n: 2.10, d: 60 }, { n: 1.63, d: 60 }];
  const o = CD.coatOptimise(start, spec), S = CD.coatSummary(o.layers, spec);
  assert.ok(o.after < o.before && S.mean < 0.005 && S.worst < 0.012, JSON.stringify({ before: o.before, after: o.after, S }));
  const sp = CD.coatSpec({ target: 'split', ns: 1.5168, lo: 540, hi: 560, R: 50, design: 550 });
  const s = CD.coatOptimise([{ n: 2.10, d: 60 }, { n: 1.46, d: 90 }, { n: 2.10, d: 60 }], sp), Ss = CD.coatSummary(s.layers, sp);
  assert.ok(Math.abs(Ss.design - 0.5) < 0.02, 'splitter ' + Ss.design);
  // an RF lens face in PLA at 24 GHz: one layer of index √n, a quarter wave thick, reflects nothing; found from a poor start
  const nm = 299792458 / 24, n = 1.643, rf = CD.coatSpec({ target: 'rf', ns: n, lo: nm * 0.95, hi: nm * 1.05, design: nm });
  const r = CD.coatOptimise([{ n: Math.sqrt(n), d: 0.5 * qwot(Math.sqrt(n), nm) }], rf);
  assert.ok(Math.abs(r.layers[0].d - qwot(Math.sqrt(n), nm)) < 0.02 * qwot(Math.sqrt(n), nm) && CD.coatSummary(r.layers, rf).design < 1e-4, JSON.stringify(r));
  const c = CD.coatToStack(r.layers, rf);
  assert.ok(c.mode === 'stack' && c.label === 'Matching layer' && c.layers.length === 1 && c.design === Math.round(nm));
  // an edge: a quarter-wave stack of 8 pairs reflects its design wavelength and passes well away from it
  const ed = CD.coatSpec({ target: 'edge', ns: 1.5168, lo: 450, hi: 750, edge: 600, passBelow: true, design: 650 });
  const pairs = []; for (let i = 0; i < 8; i++) pairs.push({ n: 2.3, d: qwot(2.3, 660) }, { n: 1.46, d: qwot(1.46, 660) });
  const cv = CD.coatCurve(pairs, ed, 0);
  const at = w => cv.R[cv.nms.findIndex(v => v >= w)];
  assert.ok(at(660) > 0.95 && at(470) < 0.5, 'reflects ' + at(660) + ' at 660, ' + at(470) + ' at 470');
  const A = CD.coatAngles(pairs, ed);
  assert.ok(A.degs.length === 91 && A.s[0] > 0.9 && Math.abs(A.s[0] - A.p[0]) < 1e-9, 'square on, s and p alike');
});
