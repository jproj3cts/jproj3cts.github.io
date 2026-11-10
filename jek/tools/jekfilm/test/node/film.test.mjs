/* A JEKfilm coating (core/film.js): any file opens, with defaults and limits; the substrates' dispersion is JEKray's
   own; the spec handed to JEKray's coat designer is the one the file holds; the optimiser takes a stack to its target;
   and the coating handed to a JEKray face is one its normCoat keeps as it is. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
const F = await import('../../src/core/film.js');
const { GLASS, refIndex } = await import('../../../jekray/src/core/glass.js');
const { normCoat } = await import('../../../jekray/src/state/project.js');
const CD = await import('../../../jekray/src/core/coatdesign.js');
const { coatOptimise, coatSummary, stackR } = CD;
const { qwot } = await import('../../../jekray/src/core/coatings.js');

test('anything opens: no file, an old one, nonsense values', () => {
  const a = F.normFilm(null);
  assert.equal(a.format, 'jekfilm'); assert.equal(a.version, 1); assert.equal(a.spec.target, 'ar'); assert.deepEqual(a.spec.sub, { glass: 'N-BK7' }); assert.deepEqual(a.layers, []);
  const b = F.normFilm({ spec: { target: 'rf', lo: 900, hi: 400, theta: 120, pol: 'x', sub: { glass: 'Unobtainium' } }, layers: [{ n: 0.5, d: -3 }, null, { n: 'a' }] });
  assert.equal(b.spec.target, 'ar', 'RF’s matching layer is the RF designer’s, not JEKfilm’s');
  assert.equal(b.spec.hi, 900, 'the band’s top is at least its bottom'); assert.equal(b.spec.theta, 89); assert.equal(b.spec.pol, 'avg');
  assert.deepEqual(b.spec.sub, { glass: 'N-BK7' });
  assert.deepEqual(b.layers, [{ n: 1, d: 0 }, { n: 1.38, d: 100 }]);
  assert.deepEqual(F.normFilm({ spec: { sub: { n: 1.7 } } }).spec.sub, { n: 1.7 });
  assert.deepEqual(F.normFilm(F.normFilm(b)), F.normFilm(b), 'normalising twice changes nothing');
});
test('the substrates are JEKray’s glasses, with the same index at every wavelength', () => {
  for (const [name, c] of Object.entries(F.FILM_GLASSES)) {
    assert.deepEqual(c, GLASS[name], name + ': the coefficients are JEKray’s');
    for (const nm of [400, 550, 1064, 1550, 5000]) {
      const a = F.filmGlassIndex(name, nm), b = refIndex({ glass: name }, nm);
      assert.ok(Number.isNaN(a) ? Number.isNaN(b) : Math.abs(a - b) < 1e-12, name + ' at ' + nm + ' nm');
    }
  }
  assert.ok(Math.abs(F.subIndex({ glass: 'N-BK7' }, 587.6) - 1.5168) < 1e-4, 'N-BK7 at the d line');
  assert.equal(F.subIndex({ n: 1.62 }, 500), 1.62);
  assert.equal(F.subClear({ glass: 'Germanium' }, 550), false, 'germanium is opaque in the visible');
  assert.equal(F.subClear({ glass: 'Germanium' }, 3000), true);
});
test('the angles: up to a largest (from square on), or a band of them; the merit and the figures over that band', () => {
  const up = F.normFilm({ spec: { angles: 'upto', theta0: 30, theta: 50 } }).spec;
  assert.equal(up.angles, 'upto'); assert.equal(up.theta0, 0, 'up to: from square on, whatever was kept');
  const band = F.normFilm({ spec: { angles: 'band', theta0: 60, theta: 50 } }).spec;
  assert.deepEqual([band.angles, band.theta0, band.theta], ['band', 50, 50], 'a band’s start is no more than its end');
  const L = F.filmPreset('vcoat', 550), at45 = F.normFilm({ spec: { angles: 'band', theta0: 40, theta: 50 }, layers: L }), upto = F.normFilm({ spec: { theta: 50 }, layers: L });
  const s45 = F.filmSpec(at45), sUp = F.filmSpec(upto);
  assert.equal(s45.theta0, 40); assert.equal(sUp.theta0, 0);
  assert.ok(coatSummary(L, s45).merit > coatSummary(L, sUp).merit, 'a V-coat for square on does worse judged only at 40–50°');
  const sum = coatSummary(L, s45), R40 = stackR(L, 1, s45.ns, Math.cos(40 * Math.PI / 180), 550, 'avg');
  assert.ok(Math.abs(sum.design - R40) < 1e-12, 'R at λ₀ is at the band’s smallest angle');
  // JEKray's own specs, with no theta0, are judged from square on as before
  assert.equal(CD.coatSpec({ theta: 30 }).theta0, 0);
});
test('the spec handed to the coat designer is the file’s, the substrate at the design wavelength', () => {
  const f = F.normFilm({ spec: { target: 'split', sub: { glass: 'Fused silica' }, lo: 500, hi: 600, design: 532, theta: 45, pol: 's', R: 30 } });
  const s = F.filmSpec(f);
  assert.equal(s.target, 'split'); assert.equal(s.lo, 500); assert.equal(s.hi, 600); assert.equal(s.design, 532); assert.equal(s.theta, 45); assert.equal(s.pol, 's'); assert.equal(s.R, 30);
  assert.ok(Math.abs(s.ns - refIndex({ glass: 'Fused silica' }, 532)) < 1e-12);
});
test('a new coating: a quarter-wave MgF2 layer on N-BK7, reflecting about 1.3% at 550 nm (the textbook figure)', () => {
  const f = F.newFilm(), s = F.filmSpec(f);
  assert.equal(f.layers.length, 1);
  assert.ok(Math.abs(f.layers[0].d - qwot(1.38, 550)) < 1e-9);
  const R = stackR(f.layers, 1, s.ns, 1, 550, 'avg'), want = ((1.38 * 1.38 - s.ns) / (1.38 * 1.38 + s.ns)) ** 2;
  assert.ok(Math.abs(R - want) < 1e-9, R + ' vs ' + want);
});
test('the optimiser takes a three-layer stack to a broadband AR well under the single layer', () => {
  const f = F.normFilm({ spec: { target: 'ar', lo: 450, hi: 650, design: 550 }, layers: F.filmPreset('bb3', 550) });
  const one = coatSummary(F.newFilm().layers, F.filmSpec(F.newFilm())).mean;
  const o = coatOptimise(f.layers, F.filmSpec(f));
  assert.ok(o.after < o.before, 'the merit falls');
  assert.ok(coatSummary(o.layers, F.filmSpec(f)).mean < one / 2, 'under half the single layer’s mean reflectance');
});
test('the coating a JEKray face takes: a named stack that its normCoat keeps as it is', () => {
  const f = F.normFilm({ name: 'BBAR 450–650', spec: { lo: 450, hi: 650, design: 550 }, layers: F.filmPreset('vcoat', 550) });
  const c = F.filmToCoat(f);
  assert.equal(c.mode, 'stack'); assert.equal(c.label, 'BBAR 450–650'); assert.equal(c.design, 550);
  const n = normCoat(c);
  assert.deepEqual([n.mode, n.design, n.label, n.layers], [c.mode, c.design, c.label, c.layers]);
});
test('the file’s text is the coating, normalised, and reads back the same', () => {
  const f = F.normFilm({ name: 'HR 1064', spec: { target: 'hr', lo: 1000, hi: 1120, design: 1064 }, layers: F.filmPreset('hr', 1064) });
  assert.deepEqual(F.normFilm(JSON.parse(F.filmText(f))), f);
});
test('figures: to their decimals, and a very small one as three significant figures times a power of ten', () => {
  assert.equal(F.dsFix(0.12049, 3), '0.120');
  assert.equal(F.dsFix(3.369, 3), '3.369');
  assert.equal(F.dsFix(0.0123, 3), '0.012');
  assert.equal(F.dsFix(0.0012, 3), '1.20×10⁻³', 'below 0.01, three decimals would keep one figure');
  assert.equal(F.dsFix(0.000193, 3), '1.93×10⁻⁴');
  assert.equal(F.dsFix(0.00000193, 3), '1.93×10⁻⁶');
  assert.equal(F.dsFix(0, 3), '0.000');
  assert.equal(F.dsFix(NaN, 3), '—');
  assert.equal(F.dsSci(12300), '1.23×10⁴');
});
test('a metal layer: kept by the file and by a JEKray face; the protected-silver preset reflects as silver does at 633 nm', async () => {
  const { coatFromFilm } = await import('../../../jekray/src/core/coatdesign.js');
  const f = F.normFilm({ name: 'Protected silver', spec: { target: 'hr', design: 633, lo: 600, hi: 660 }, layers: F.filmPreset('agp', 633) });
  assert.equal(f.layers[1].metal, 'Ag'); assert.equal(f.layers[1].d, 150);
  assert.equal(F.normFilm({ layers: [{ n: 1, d: 50, metal: 'Unobtainium' }] }).layers[0].metal, undefined, 'only a metal of the tables');
  const face = normCoat(coatFromFilm(f));
  assert.equal(face.layers[1].metal, 'Ag');
  const R = stackR(f.layers, 1, F.filmSpec(f).ns, 1, 633, 'avg');
  assert.ok(R > 0.95 && R < 0.99, 'protected silver at 633 nm: ' + R.toFixed(4));
});
