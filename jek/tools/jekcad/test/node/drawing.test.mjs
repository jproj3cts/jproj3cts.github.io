// Drawings (core/drawing.js, and the kernel's views): a block with a hole seen from the front, the top and the right
// with its hidden lines taken out; the views laid out third angle at a scale that fits the sheet; dimensions that
// measure the model and follow it; the sheet as a PDF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kernel, rectSketch, newDoc, newFeature } from './helpers.mjs';
import { normFile, fileData } from '../../src/core/doc.js';
import { VIEW_DIRS, newDrawing, normDrawing, layoutOf, viewBox, viewPoint, dimGeom, drawSheet, pdfOfSheet, scaleText } from '../../src/core/drawing.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, (what || '') + ' ' + a + ' is not ' + b);
/* a 40 × 20 plate, 10 thick, with a hole of radius 4 at (30, 10), as a Part Studio's tab */
function plate(w = 40) {
  const doc = newDoc(), sk = rectSketch(doc, w, 20);
  sk.ents.push({ id: 'hole', t: 'circle', c: [30, 10], r: 4 });
  doc.features.push(sk, newFeature(doc, 'extrude', { sketch: sk.id, regions: [[1, 1]], depth: '10', op: 'new' }));
  return Object.assign(doc, { id: 'tA', kind: 'studio' });
}
const viewsOf = D => D.views.map(v => ({ id: v.id, n: VIEW_DIRS[v.dir].n, x: VIEW_DIRS[v.dir].x }));
const dataOf = (D, got) => ({ views: Object.fromEntries(got.map(g => [g.id, g])) });

test('the kernel’s views of a plate with a hole: each the size the plate is that way, the hole a circle from above and hidden lines from the side', async () => {
  const K = await kernel(), st = plate(), part = K.regen(st).parts[0];
  const D = newDrawing('tA', 1), items = [{ doc: st, part: part.id, id: part.id, p: [0, 0, 0], q: [0, 0, 0, 1] }];
  const got = K.drawingViews(items, viewsOf(D)), by = dir => got[D.views.findIndex(v => v.dir === dir)];
  const size = g => { const b = viewBox(g); return [b[2] - b[0], b[3] - b[1]]; };
  near(size(by('front'))[0], 40, 1e-6, 'front across'); near(size(by('front'))[1], 10, 1e-6, 'front up');
  near(size(by('top'))[0], 40, 1e-6); near(size(by('top'))[1], 20, 1e-6, 'top up');
  near(size(by('right'))[0], 20, 1e-6); near(size(by('right'))[1], 10, 1e-6);
  // from above the hole shows as a round run of points 4 from (30, 10); from the front its walls are hidden lines at x = 26 and 34
  const round = by('top').vis.filter(r => r.length > 8);
  assert.ok(round.length >= 1, 'the hole’s rim');
  for (const r of round) for (let i = 0; i + 1 < r.length; i += 2) near(Math.hypot(r[i] - 30, r[i + 1] - 10), 4, 1e-4, 'on the rim');
  const hx = by('front').hid.filter(r => Math.abs(r[0] - r[r.length - 2]) < 1e-6).map(r => +r[0].toFixed(3));
  assert.ok(hx.includes(26) && hx.includes(34), 'the hole’s walls, hidden: ' + hx);
  assert.equal(by('front').vis.filter(r => Math.abs(r[0] - 26) < 1e-6 && Math.abs(r[r.length - 2] - 26) < 1e-6).length, 0, 'and not among what shows');
  // the isometric view shows three of the plate's faces: more lines than a side view
  assert.ok(by('iso').vis.length >= 9, 'iso lines ' + by('iso').vis.length);
  // the views laid out: at 2:1 on A4 (the largest usual scale that fits), top above front, right beside it
  const L = layoutOf(D, dataOf(D, got)), at = dir => L.views.find(v => v.dir === dir).at;
  assert.equal(scaleText(L.s), '2:1');
  near(at('top')[0], at('front')[0], 1e-9, 'top over front'); assert.ok(at('top')[1] < at('front')[1]);
  near(at('right')[1], at('front')[1], 1e-9, 'right beside front'); assert.ok(at('right')[0] > at('front')[0]);
  for (const v of L.views) { const hw = v.w * L.s / 2, hh = v.h * L.s / 2; assert.ok(v.at[0] - hw > L.m && v.at[0] + hw < L.W - L.m && v.at[1] - hh > L.m && v.at[1] + hh < L.H - L.m, v.dir + ' is on the sheet'); }
  // a set scale is used as it is
  near(layoutOf(Object.assign({}, D, { scale: 0.5 }), dataOf(D, got)).s, 0.5, 0);
});

test('dimensions: the view’s whole size, a length between two corners and a hole’s diameter measure the model, and follow it when it changes', async () => {
  const K = await kernel(), st = plate(), part = K.regen(st).parts[0];
  const D = newDrawing('tA', 1), fv = D.views.find(v => v.dir === 'front'), tv = D.views.find(v => v.dir === 'top');
  // the two corners at the ends of the plate's bottom front edge, and the hole's top rim, as the kernel refers to them
  const vi = (x, y, z) => { for (let i = 0; i < part.verts.length / 3; i++) if (Math.hypot(part.verts[3 * i] - x, part.verts[3 * i + 1] - y, part.verts[3 * i + 2] - z) < 1e-6) return i; return -1; };
  const rim = (() => { for (let j = 0; j < part.edgeGroups.length / 2; j++) { if (part.edgeKinds[j] !== 'circle') continue; const k = part.edgeGroups[2 * j]; if (Math.abs(part.seg[k * 6 + 2] - 10) < 1e-6) return j; } return -1; })();
  const base = { doc: st, part: part.id, p: [0, 0, 0], q: [0, 0, 0, 1] };
  const refs = K.drawLocate([Object.assign({ pick: { part: part.id, kind: 'vertex', index: vi(0, 0, 0) } }, base), Object.assign({ pick: { part: part.id, kind: 'vertex', index: vi(40, 0, 0) } }, base), Object.assign({ pick: { part: part.id, kind: 'edge', index: rim } }, base)]);
  assert.ok(refs.every(r => r && r.ref), 'refs for the picks');
  const Dn = normDrawing(Object.assign({}, D, { dims: [{ id: 'w', view: fv.id, t: 'ext', axis: 'x' }, { id: 'h', view: fv.id, t: 'ext', axis: 'y', off: -10 },
    { id: 'l', view: fv.id, t: 'lin', dir: 'h', off: 14, a: { ref: refs[0].ref }, b: { ref: refs[1].ref } }, { id: 'd', view: tv.id, t: 'dia', ang: 30, off: 8, a: { ref: refs[2].ref } }] }));
  assert.equal(Dn.dims.length, 4);
  const measure = stNow => {
    const p = K.regen(stNow).parts[0], it = [{ doc: stNow, part: p.id, id: p.id, p: [0, 0, 0], q: [0, 0, 0, 1] }];
    const data = dataOf(Dn, K.drawingViews(it, viewsOf(Dn))), L = layoutOf(Dn, data);
    const where = K.drawLocate(Dn.dims.filter(d => d.t !== 'ext').flatMap(d => [d.a, d.b].filter(Boolean).map(r => ({ doc: stNow, part: p.id, p: [0, 0, 0], q: [0, 0, 0, 1], ref: r.ref }))));
    const located = { l: { a: where[0], b: where[1] }, d: { a: where[2] } };
    return { data, L, located, g: Object.fromEntries(Dn.dims.map(d => [d.id, dimGeom(L, d, located[d.id])])) };
  };
  let m = measure(st);
  for (const k of ['w', 'h', 'l', 'd']) assert.ok(m.g[k], 'the dimension ' + k + ' can be drawn');
  near(m.g.w.value, 40, 1e-6, 'width'); near(m.g.h.value, 10, 1e-6, 'height'); near(m.g.l.value, 40, 1e-6, 'between the corners'); near(m.g.d.value, 8, 1e-6, 'the hole');
  assert.equal(m.g.d.text, 'Ø8'); assert.equal(m.g.w.text, '40');
  // the dimension line is as long on the sheet as the model is at the sheet's scale, and off the view by its offset
  near(Math.abs(m.g.w.B[0] - m.g.w.A[0]), 40 * m.L.s, 1e-6);
  // the plate made 55 long: every dimension that measured 40 reads 55; the hole is where it was
  const longer = JSON.parse(JSON.stringify(st)); longer.features[0].dims[0].x = '55';
  m = measure(longer);
  near(m.g.w.value, 55, 1e-6); near(m.g.l.value, 55, 1e-6, 'the corner followed'); near(m.g.d.value, 8, 1e-6);
  near(viewPoint('top', m.located.d.a.c)[0], 30, 1e-6, 'the hole’s centre');
  // the sheet drawn through a pen: lines for the border, the title block and the views; four dimensions' texts
  const texts = [], lines = { n: 0 };
  const pen = { line() { lines.n++; }, poly() { lines.n++; }, fill() {}, text(x, y, s) { texts.push(s); } };
  const drawn = drawSheet(pen, Object.assign({}, Dn, { title: { title: 'Plate', by: 'JK', material: 'Aluminium 6061' } }), m.data, { located: m.located, date: '12 Nov 2026', source: 'Part Studio 1' });
  assert.equal(drawn.dims.length, 4);
  for (const t of ['Plate', 'JK', 'Aluminium 6061', '12 Nov 2026', '55', 'Ø8', 'FRONT', 'TOP', 'RIGHT', 'ISOMETRIC']) assert.ok(texts.includes(t), 'the sheet says ' + t + ': ' + texts.join('|'));
  assert.ok(lines.n > 30);
  // the PDF: one page of A4 landscape in points, with the title and a dimension in it
  const pdf = new TextDecoder('latin1').decode(pdfOfSheet(Object.assign({}, Dn, { title: { title: 'Plate (rev A)' } }), m.data, { located: m.located, date: '12 Nov 2026' }));
  assert.match(pdf, /^%PDF-1\.4/); assert.match(pdf, /%%EOF\n$/);
  assert.match(pdf, /\/MediaBox \[0 0 841\.89 595\.276\]/);
  assert.match(pdf, /\(Plate \\\(rev A\\\)\) Tj/); assert.match(pdf, /\(\\330(8)\) Tj/, 'the diameter sign in the PDF’s own encoding');
  const xref = +pdf.match(/startxref\n(\d+)/)[1]; assert.equal(pdf.slice(xref, xref + 4), 'xref', 'the cross-reference table is where the file says');
  const len = +pdf.match(/\/Length (\d+)/)[1], s0 = pdf.indexOf('stream\n') + 7; assert.equal(pdf.slice(s0 + len, s0 + len + 9), 'endstream', 'the stream is as long as it says');
});

test('a drawing is a tab of the document: kept in the file, of a tab that is there', () => {
  const st = plate(), f = normFile({ name: 'Doc', tabs: [st, newDrawing('tA', 1), Object.assign(newDrawing('gone', 2), { dims: [{ view: 'x', t: 'ext' }] })] });
  assert.deepEqual(f.tabs.map(t => t.kind), ['studio', 'drawing', 'drawing']);
  assert.equal(f.tabs[1].of, f.tabs[0].id); assert.equal(f.tabs[2].of, f.tabs[0].id, 'a drawing of a tab that is gone is of the first Part Studio');
  assert.deepEqual(f.tabs[1].views.map(v => v.dir), ['front', 'top', 'right', 'iso']);
  const back = normFile(JSON.parse(JSON.stringify(fileData(f))));
  assert.equal(JSON.stringify(back), JSON.stringify(f)); assert.equal(fileData(f).version, 2);
});
