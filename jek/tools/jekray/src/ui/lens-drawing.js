import { project } from '../state/project.js';
import { getEl } from '../state/elements.js';
import { designPrescription } from '../engines/lens-design.js';
import { drawableParts, drawingData, drawSag } from '../engines/lens-drawing.js';
import { VecCtx, layoutSvg, pdfDoc } from '../io/layout.js';
import { downloadFile, safeFileName, toast } from './actions.js';
import { h } from './panel.js';

/* ==========================================================================
   Lens drawings: each lens of a design on an A4 sheet, landscape, to be made from
   The sheet is drawn with the canvas's own calls (points, 842 by 595), so the same drawing is shown
   in the workspace and written out as SVG or PDF: on the left the lens in section, to a standard
   scale, with its diameter, its thicknesses at the centre and its edge thickness dimensioned; on the
   right a table of its surfaces and its glass, with the tolerances in ISO 10110's notation; notes,
   and a title block.
   ========================================================================== */
const SHEET_W = 842, SHEET_H = 595, PT = 72 / 25.4;
const SH_INK = '#1b1f24', SH_SOFT = '#5b6570', SH_GLASS = '#dbe9ef';
const SH_SCALES = [[10, 1], [5, 1], [4, 1], [2, 1], [1, 1], [1, 2], [1, 5], [1, 10]];
const dfmt = (v, p) => !isFinite(v) ? '—' : String(+(+v).toFixed(p === undefined ? 3 : p));
const sgn = v => (v < 0 ? '−' : '') + dfmt(Math.abs(v));

/* the drawing data of each drawable part of the assembly, in order */
export function lensDrawings(asm) {
  const P = designPrescription(asm), T = asm.design && asm.design.tol;
  return drawableParts(P).map(pi => {
    const e = getEl(P.parts[pi].id);
    return drawingData(P, pi, { name: e ? e.name : 'Lens', dia: e ? (e.type === 'lens' ? e.diameter : e.size) : 0, T });
  });
}

function arrowLine(g, x0, y0, x1, y1) {
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  const head = (x, y, ux, uy) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6 * ux - 2.2 * uy, y + 6 * uy + 2.2 * ux); g.lineTo(x + 6 * ux + 2.2 * uy, y + 6 * uy - 2.2 * ux); g.closePath(); g.fill(); };
  const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  if (L >= 16) { head(x0, y0, ux, uy); head(x1, y1, -ux, -uy); return; }
  // too short for the heads between: outside, pointing in
  g.beginPath(); g.moveTo(x0 - 12 * ux, y0 - 12 * uy); g.lineTo(x0, y0); g.moveTo(x1, y1); g.lineTo(x1 + 12 * ux, y1 + 12 * uy); g.stroke();
  head(x0, y0, -ux, -uy); head(x1, y1, ux, uy);
}
function text(g, t, x, y, o) {
  o = o || {};
  g.font = (o.bold ? '600 ' : '') + (o.size || 8) + 'px ' + (o.mono ? 'Courier, monospace' : 'Helvetica, Arial, sans-serif');
  g.fillStyle = o.ink || SH_INK; g.textAlign = o.align || 'left'; g.textBaseline = o.base || 'alphabetic';
  g.fillText(t, x, y);
}

/* the sheet, drawn into g (a canvas context or a VecCtx); meta { assembly, sheet, of, date } */
export function drawSheet(g, D, meta) {
  meta = meta || {};
  g.save();
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, SHEET_W, SHEET_H);
  g.strokeStyle = SH_INK; g.lineWidth = 1.2; g.strokeRect(18, 18, SHEET_W - 36, SHEET_H - 36);
  g.lineWidth = 0.5; g.strokeRect(22, 22, SHEET_W - 44, SHEET_H - 44);
  // ---- the section, to scale ----
  const box = { x: 40, y: 50, w: 400, h: 330 }, r = D.dia / 2;
  const span = D.length + 2 * Math.max(0, ...D.surfaces.map(s => isFinite(s.sagRim) ? Math.abs(s.sagRim) : 0));
  const [sa, sb] = SH_SCALES.find(([a, b]) => D.dia * a / b * PT <= box.h - 90 && span * a / b * PT <= box.w - 140) || SH_SCALES[SH_SCALES.length - 1];
  const k = sa / sb * PT, cx = box.x + box.w / 2 - D.length * k / 2, cy = box.y + box.h / 2;
  const zs = [0]; D.elements.forEach(e => zs.push(zs[zs.length - 1] + e.ct));
  const X = (j, y) => { const s = D.surfaces[j]; let z = drawSag(s, y); if (!isFinite(z)) z = s.R ? Math.sign(s.R) * Math.abs(s.R) : 0; return cx + (zs[j] + z) * k; };
  const Y = y => cy - y * k;
  // each glass between its two surfaces, the rim straight across
  const prof = j => { const out = [], rr = s => s.R ? Math.min(r, Math.abs(s.R)) : r, h0 = rr(D.surfaces[j]); for (let q = 0; q <= 40; q++) { const y = -h0 + 2 * h0 * q / 40; out.push([X(j, y), Y(y)]); } return out; };
  D.elements.forEach((e, i) => {
    if (e.air) return;
    const a = prof(i), b = prof(i + 1).reverse();
    g.beginPath(); a.forEach(([x, y], q) => q ? g.lineTo(x, y) : g.moveTo(x, y)); b.forEach(([x, y]) => g.lineTo(x, y)); g.closePath();
    g.fillStyle = SH_GLASS; g.fill(); g.strokeStyle = SH_INK; g.lineWidth = 1.1; g.stroke();
  });
  // the axis, dash-dot
  g.strokeStyle = SH_SOFT; g.lineWidth = 0.5; g.setLineDash([14, 3, 2, 3]);
  g.beginPath(); g.moveTo(cx - 30, cy); g.lineTo(cx + D.length * k + 30, cy); g.stroke(); g.setLineDash([]);
  // the clear apertures: a short tick at each surface's edge of use
  g.strokeStyle = '#2f7d95'; g.lineWidth = 0.8;
  D.surfaces.forEach((s, j) => { const hh = s.clear / 2; if (hh >= r - 1e-9) return; for (const y of [hh, -hh]) { const x = X(j, y); g.beginPath(); g.moveTo(x - 4, Y(y)); g.lineTo(x + 4, Y(y)); g.stroke(); } });
  // dimensions: the diameter on the left; each centre thickness below; each edge thickness above
  g.strokeStyle = SH_INK; g.fillStyle = SH_INK; g.lineWidth = 0.5;
  const xl = Math.min(...D.surfaces.map((s, j) => Math.min(X(j, r), X(j, 0)))) - 26;
  for (const y of [r, -r]) { g.beginPath(); g.moveTo(X(0, y) - 3, Y(y)); g.lineTo(xl - 5, Y(y)); g.stroke(); }
  arrowLine(g, xl, Y(r), xl, Y(-r));
  g.save(); g.translate(xl - 5, cy); g.rotate(-Math.PI / 2); text(g, 'Ø ' + dfmt(D.dia), 0, 0, { align: 'center', size: 9 }); g.restore();
  D.elements.forEach((e, i) => {
    if (e.air) return;
    const xa = X(i, 0), xb = X(i + 1, 0), yb = Y(-r) + 22 + 14 * (i % 2), yt = Y(r) - 22 - 14 * (i % 2);
    for (const x of [xa, xb]) { g.beginPath(); g.moveTo(x, cy + 3); g.lineTo(x, yb + 4); g.stroke(); }
    arrowLine(g, xa, yb, xb, yb);
    text(g, dfmt(e.ct) + (e.ctTol ? ' ± ' + dfmt(e.ctTol) : ''), (xa + xb) / 2, yb + 11, { align: 'center', size: 8.5 });
    if (isFinite(e.et)) {
      const ea = X(i, r), eb = X(i + 1, r);
      for (const x of [ea, eb]) { g.beginPath(); g.moveTo(x, Y(r) - 3); g.lineTo(x, yt - 4); g.stroke(); }
      arrowLine(g, ea, yt, eb, yt);
      text(g, '(' + dfmt(e.et) + ')', (ea + eb) / 2, yt - 5, { align: 'center', size: 8.5 });
    }
  });
  // each surface's number on its face
  D.surfaces.forEach((s, j) => text(g, 'S' + s.n, X(j, 0) + (j === 0 ? -4 : 4), cy - 4, { align: j === 0 ? 'right' : 'left', size: 7, ink: SH_SOFT }));
  text(g, 'Light from the left. Scale ' + sa + ':' + sb + '.', box.x, box.y + box.h + 6, { size: 7.5, ink: SH_SOFT });

  // ---- the table ----
  const tx = 462, tw = SHEET_W - 40 - tx, cols = D.surfaces.length, c0 = 104, cw = (tw - c0) / cols;
  let ty = 56;
  const row = (label, vals, o) => {
    o = o || {};
    text(g, label, tx, ty, { size: 8, ink: o.head ? SH_INK : SH_SOFT, bold: o.head });
    vals.forEach((v, j) => text(g, v, tx + c0 + j * cw, ty, { size: 8, mono: !o.head, bold: o.head }));
    ty += 4; g.strokeStyle = '#c8ced4'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + tw, ty); g.stroke(); ty += 10;
  };
  text(g, 'Surfaces', tx, ty - 10, { size: 9.5, bold: true }); ty += 4;
  row('', D.surfaces.map(s => 'S' + s.n), { head: true });
  row('Radius R', D.surfaces.map(s => s.R === null ? 'Flat' : sgn(s.R) + (s.face ? ' ' + s.face : '')));
  if (D.surfaces.some(s => s.dR !== undefined)) row('  tolerance', D.surfaces.map(s => s.dR === null || s.dR === undefined ? '—' : '± ' + dfmt(s.dR, 4)));
  row('Clear aperture Øe', D.surfaces.map(s => dfmt(s.clear)));
  if (D.surfaces.some(s => s.k)) row('Conic k', D.surfaces.map(s => dfmt(s.k, 6)));
  if (D.surfaces.some(s => s.A.length || s.a2 || s.odd)) row('Aspheric', D.surfaces.map(s => s.A.length || s.a2 || s.odd ? 'see note' : '—'));
  if (D.surfaces.some(s => s.form !== undefined)) row('3/ Surface form', D.surfaces.map(s => s.form === undefined ? '—' : '3/' + dfmt(s.form, 2) + '(-)'));
  if (D.surfaces.some(s => s.centring !== undefined)) row('4/ Centring', D.surfaces.map(s => s.centring === undefined ? '—' : '4/ ' + dfmt(s.centring, 2) + '′'));
  ty += 10;
  text(g, D.elements.filter(e => !e.air).length > 1 ? 'Glasses' : 'Glass', tx, ty, { size: 9.5, bold: true }); ty += 14;
  const gl = D.elements.filter(e => !e.air), gw = (tw - c0) / Math.max(1, gl.length);
  const grow = (label, f) => { text(g, label, tx, ty, { size: 8, ink: SH_SOFT }); gl.forEach((e, q) => text(g, f(e), tx + c0 + q * gw, ty, { size: 8, mono: true })); ty += 4; g.strokeStyle = '#c8ced4'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + tw, ty); g.stroke(); ty += 10; };
  grow('Between', e => 'S' + D.surfaces[e.from].n + '–S' + D.surfaces[e.from + 1].n);
  grow('Material', e => e.glass);
  grow('Index nd', e => dfmt(e.nd, 5) + (e.ndTol ? ' ± ' + dfmt(e.ndTol, 4) : ''));
  grow('Abbe number Vd', e => dfmt(e.vd, 2) + (e.vdTol ? ' ± ' + dfmt(e.vdTol, 2) : ''));
  grow('Centre thickness', e => dfmt(e.ct) + (e.ctTol ? ' ± ' + dfmt(e.ctTol) : ''));
  grow('Edge thickness', e => '(' + dfmt(e.et) + ')');

  // ---- notes ----
  ty += 8;
  text(g, 'Notes', tx, ty, { size: 9.5, bold: true }); ty += 13;
  const notes = ['Dimensions in millimetres. Light from the left: a radius is positive with its centre of curvature to the right.',
    'Edge thickness, in brackets, is a reference dimension at the full diameter.',
    D.toleranced ? 'Surface form (3/): fringes of power at 632.8 nm over the clear aperture. Centring (4/): surface tilt in arcminutes.' : 'No tolerances are set in the design’s tolerance settings.'];
  D.surfaces.forEach(s => {
    if (!(s.A.length || s.a2 || s.odd)) return;
    const terms = [];
    if (s.a2) terms.push('A2 ' + s.a2.toExponential(5));
    s.A.forEach((a, q) => { if (a) terms.push('A' + (4 + 2 * q) + ' ' + a.toExponential(5)); });
    if (s.odd) s.odd.forEach((a, q) => { if (a) terms.push('B' + (q + 1) + ' ' + a.toExponential(5)); });
    notes.push('S' + s.n + ' aspheric sag adds ' + terms.join(', ') + ' (ρ in mm).');
  });
  notes.push(...D.notes);
  const wrap = (t, n) => { const out = []; let line = ''; for (const w of t.split(' ')) { if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); } if (line) out.push(line); return out; };
  notes.forEach((t, i) => wrap(t, 72).forEach((ln, q) => { text(g, (q ? '    ' : (i + 1) + '. ') + ln, tx, ty, { size: 7.5 }); ty += 10; }));

  // ---- the title block ----
  const bx = SHEET_W - 22 - 330, by = SHEET_H - 22 - 92;
  g.strokeStyle = SH_INK; g.lineWidth = 0.8; g.strokeRect(bx, by, 330, 92);
  g.lineWidth = 0.5;
  g.beginPath(); g.moveTo(bx, by + 40); g.lineTo(bx + 330, by + 40); g.moveTo(bx, by + 66); g.lineTo(bx + 330, by + 66);
  g.moveTo(bx + 110, by + 40); g.lineTo(bx + 110, by + 92); g.moveTo(bx + 220, by + 40); g.lineTo(bx + 220, by + 92); g.stroke();
  text(g, D.name, bx + 8, by + 18, { size: 14, bold: true });
  text(g, (D.kind === 'window' ? 'Window' : 'Lens') + (meta.assembly ? ' in ' + meta.assembly : ''), bx + 8, by + 32, { size: 8.5, ink: SH_SOFT });
  const cell = (x, y, label, v) => { text(g, label, x + 6, y + 10, { size: 6.5, ink: SH_SOFT }); text(g, v, x + 6, y + 21, { size: 8.5 }); };
  cell(bx, by + 40, 'Scale', sa + ':' + sb); cell(bx + 110, by + 40, 'Units', 'mm'); cell(bx + 220, by + 40, 'Sheet', (meta.sheet || 1) + ' of ' + (meta.of || 1));
  cell(bx, by + 66, 'Date', meta.date || new Date().toISOString().slice(0, 10)); cell(bx + 110, by + 66, 'Bench', meta.bench || project.name || '');
  cell(bx + 220, by + 66, 'Drawn with', 'JEKray');
  g.restore();
}

/* the sheets as records, for SVG or PDF */
function sheetRecs(asm, which) {
  const all = lensDrawings(asm), pick = which === undefined ? all.map((_, i) => i) : [which];
  return pick.map((i, q) => { const rec = new VecCtx(SHEET_W, SHEET_H, { plain: true }); drawSheet(rec, all[i], { assembly: asm.name, sheet: q + 1, of: pick.length }); return { rec, D: all[i] }; });
}
export function saveDrawingSvg(asm, i) {
  const [{ rec, D }] = sheetRecs(asm, i), name = safeFileName(asm.name + ' - ' + D.name) + '.svg';
  downloadFile(name, new Blob([layoutSvg(rec, D.name)], { type: 'image/svg+xml' }));
  toast('Saved ' + name);
  return name;
}
export function drawingsPdfBlob(asm, i) { return pdfDoc(sheetRecs(asm, i).map(s => s.rec), asm.name + ' drawings'); }
export async function saveDrawingsPdf(asm, i) {
  const all = lensDrawings(asm), name = safeFileName(asm.name + (i === undefined ? ' - drawings' : ' - ' + all[i].name)) + '.pdf';
  downloadFile(name, await drawingsPdfBlob(asm, i));
  toast('Saved ' + name);
  return name;
}
/* the SVG text of one sheet, for the tests */
export function drawingSvgText(asm, i) { return layoutSvg(sheetRecs(asm, i)[0].rec); }

/* the Drawings tab: a sheet shown for the lens chosen, and the ways to save it */
export function drawingsCard(asm, state) {
  const all = lensDrawings(asm), card = h('div', { class: 'rt-lcard rt-ldraw', role: 'tabpanel' });
  if (!all.length) { card.append(h('p', { class: 'rt-lnote' }, 'This assembly has no lens or window to draw: its mirrors and stop are made to the parts’ own drawings.')); return card; }
  const i = Math.min(state.drawing || 0, all.length - 1);
  const sel = h('select', { 'aria-label': 'Lens to draw', onchange: e => { state.drawing = +e.target.value; state.redraw(); } }, ...all.map((D, q) => h('option', { value: String(q), selected: q === i ? '' : null }, D.name)));
  card.append(h('div', { class: 'rt-lbar' }, h('label', null, 'Drawing of ', sel),
    h('button', { class: 'rt-btn', type: 'button', onclick: () => saveDrawingSvg(asm, i) }, 'Save as SVG'),
    h('button', { class: 'rt-btn', type: 'button', onclick: () => saveDrawingsPdf(asm, i) }, 'Save as PDF'),
    all.length > 1 ? h('button', { class: 'rt-btn', type: 'button', title: 'Every lens of the assembly, a sheet each', onclick: () => saveDrawingsPdf(asm) }, 'All ' + all.length + ' as one PDF') : ''));
  const cv = h('canvas', { class: 'rt-lsheet', role: 'img', 'aria-label': 'Drawing of ' + all[i].name + ': its section dimensioned, its surfaces and glass tabled with their tolerances' });
  card.append(h('div', { class: 'rt-lsheetwrap' }, cv));
  requestAnimationFrame(() => {
    const dpr = window.devicePixelRatio || 1, W = Math.min(cv.parentNode ? cv.parentNode.clientWidth : 900, 1100) || 900, s = W / SHEET_W;
    cv.width = W * dpr; cv.height = SHEET_H * s * dpr; cv.style.width = W + 'px'; cv.style.height = SHEET_H * s + 'px';
    const g = cv.getContext('2d'); g.scale(dpr * s, dpr * s);
    drawSheet(g, all[i], { assembly: asm.name, sheet: 1, of: 1 });
  });
  return card;
}
