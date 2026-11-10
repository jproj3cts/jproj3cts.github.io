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

test('needle optimisation adds layers where they help, and material choice finds better materials', async () => {
  const O = await import('../../src/core/film-opt.js');
  const f = F.normFilm({ spec: { target: 'ar', lo: 400, hi: 800, design: 550 }, layers: F.filmPreset('vcoat', 550) });
  const a = await O.filmNeedle(f.layers, F.filmSpec(f));
  assert.ok(a.after < a.before / 3 && a.layers.length > 2, 'a V-coat over 400–800 nm: ' + a.before + ' to ' + a.after + ', ' + a.layers.length + ' layers');
  assert.ok(a.layers.every(L => L.d >= 1), 'no layer thinner than 1 nm');
  assert.ok(a.layers.every((L, i) => i === 0 || L.n !== a.layers[i - 1].n), 'no two neighbours of one material');
  assert.deepEqual(O.needleMaterials([{ n: 1.38, d: 1 }]), [1.38, 1.46, 2.1]);
  const g = F.normFilm({ spec: { target: 'ar', lo: 450, hi: 650, design: 550 }, layers: [{ n: 1.46, d: 94 }, { n: 1.46, d: 65 }, { n: 1.46, d: 84 }] });
  const b = await O.filmMaterials(g.layers, F.filmSpec(g));
  assert.ok(b.after < b.before / 10 && b.changed >= 1, 'three SiO2 layers: ' + b.before + ' to ' + b.after);
  const m = await O.filmNeedle([{ n: 1.46, d: 200 }, { n: 1, d: 150, metal: 'Ag' }], F.filmSpec(F.normFilm({ spec: { target: 'hr', lo: 600, hi: 700, design: 650 } })));
  assert.ok(m.layers.some(L => L.metal === 'Ag'), 'a metal layer stays');
});
test('tolerancing: no error gives the nominal coating; an error spreads it, the same seed the same runs', async () => {
  const T = await import('../../src/core/film-tol.js');
  const f = F.normFilm({ spec: { target: 'ar', lo: 450, hi: 650, design: 550 }, layers: F.filmPreset('bb3', 550) }), s = F.filmSpec(f);
  const z = T.filmTolerance(f.layers, s, { sigma: 0, runs: 20 });
  assert.ok(z.p5.every((v, i) => Math.abs(v - z.nominal[i]) < 1e-15 && Math.abs(z.p95[i] - v) < 1e-15), 'σ 0: every run the nominal');
  const a = T.filmTolerance(f.layers, s, { sigma: 3, runs: 300, seed: 7 }), b = T.filmTolerance(f.layers, s, { sigma: 3, runs: 300, seed: 7 });
  assert.deepEqual(a.merit, b.merit, 'the same seed, the same runs');
  assert.ok(a.p95.every((v, i) => v >= a.p5[i]), 'the 95th percentile above the 5th everywhere');
  assert.ok(a.merit.p90 > a.merit.nominal && a.mean.p90 > a.mean.nominal, 'errors make it worse');
  const n = T.filmTolerance(f.layers, s, { kind: 'abs', sigma: 2, runs: 50 });
  assert.equal(n.tol.kind, 'abs');
  assert.deepEqual(T.normTol({ sigma: -3, runs: 5, kind: 'x' }), { kind: 'rel', sigma: 0, runs: 10, seed: 1 });
  assert.deepEqual(F.normFilm({}).tol, T.TOL_DEFAULT);
});
test('the examples are what their descriptions say', async () => {
  const fs = await import('node:fs');
  const { FILM_EXAMPLES } = await import('../../src/io/files.js');
  const CD = await import('../../../jekray/src/core/coatdesign.js');
  const load = slug => F.normFilm(JSON.parse(fs.readFileSync(new URL('../../../demos/' + slug + '.jekfilm', import.meta.url), 'utf8')));
  const S = f => CD.coatSummary(f.layers, F.filmSpec(f)), pc = v => 100 * v;
  assert.deepEqual(FILM_EXAMPLES.map(e => e[0]), ['vcoat-1064', 'bbar-visible', 'hr-1064', 'longpass-600', 'splitter-45', 'protected-silver']);
  for (const [slug, name] of FILM_EXAMPLES) assert.equal(load(slug).name.replace(', s', ''), name.replace(', s', ''), slug);
  let s = S(load('vcoat-1064')); assert.ok(pc(s.worst) < 0.01 && load('vcoat-1064').layers.length === 2, 'V-coat');
  s = S(load('bbar-visible')); assert.ok(Math.abs(pc(s.mean) - 0.13) < 0.01 && Math.abs(pc(s.meanAt) - 0.20) < 0.01 && load('bbar-visible').layers.length === 5, 'BBAR ' + pc(s.mean) + ' ' + pc(s.meanAt));
  s = S(load('hr-1064')); assert.ok(Math.round(pc(s.mean) * 10) / 10 >= 99.9 && load('hr-1064').layers.length === 21, 'HR');
  const lp = load('longpass-600'), sp = F.filmSpec(lp), R = nm => pc(stackR(lp.layers, 1, sp.ns, 1, nm, 'avg'));
  for (const nm of [460, 500, 540]) assert.ok(R(nm) > 90, 'long-pass reflects ' + nm + ' nm: ' + R(nm));
  for (const nm of [650, 700, 740]) assert.ok(R(nm) < 10, 'long-pass passes ' + nm + ' nm: ' + R(nm));
  assert.equal(lp.layers.length, 17);
  const sp45 = load('splitter-45'), c = CD.coatCurve(sp45.layers, F.filmSpec(sp45), 40), d = CD.coatCurve(sp45.layers, F.filmSpec(sp45), 50);
  assert.ok([...c.R, ...d.R].every(v => v >= 0.45 && v <= 0.55), 'splitter: 45–55% at 40° and 50°');
  s = S(load('protected-silver')); assert.ok(Math.abs(pc(s.mean) - 98.9) < 0.05, 'protected silver ' + pc(s.mean));
});

test('the data export: the band, the angle and the layers as tables with units, written in every format', async () => {
  globalThis.document = undefined;
  const { dfWrite } = await import('../../../jekray/src/core/datafiles.js');
  // filmDataSet reads the designer's coating: built here from the same parts, without the page
  const src = (await import('node:fs')).readFileSync(new URL('../../src/io/film-data.js', import.meta.url), 'utf8');
  assert.match(src, /name: 'band'/); assert.match(src, /name: 'angle'/); assert.match(src, /name: 'layers'/);
  const f = F.normFilm({ name: 'Protected silver', spec: { target: 'hr', design: 633, lo: 600, hi: 660 }, layers: F.filmPreset('agp', 633) });
  const CD = await import('../../../jekray/src/core/coatdesign.js'), s = F.filmSpec(f), c = CD.coatCurve(f.layers, s, 0, 21);
  const set = { meta: { title: f.name, tool: 'JEKfilm' }, items: [{ kind: 'table', name: 'band', cols: [{ name: 'wavelength', unit: 'nm', values: c.nms }, { name: 'R', unit: '%', values: c.R.map(v => 100 * v) }] },
    { kind: 'table', name: 'layers', cols: [{ name: 'material', unit: '', values: ['n 1.46', 'Ag'], type: 'str' }, { name: 'QWOT', unit: '', values: [2, NaN] }] }] };
  for (const fmt of ['csv', 'json', 'xlsx', 'npz', 'mat']) { const W = await dfWrite(set, fmt); assert.ok(W.bytes.length > 100, fmt); }
});
