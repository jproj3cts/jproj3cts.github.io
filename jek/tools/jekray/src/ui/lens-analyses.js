import { primaryNm, surfaceParts } from '../engines/lens-design.js';
import { ZERNIKE_NAMES, anaSystems, fieldCurves, longitudinal, mtfAnalysis, opdFans, psfAnalysis, rayFans, spotDiagram, wavefrontMap } from '../engines/lens-analysis.js';
import { h } from './panel.js';
import { drawAxes, magma, plotArea, plotCsv, plotSaveRow } from './plots.js';

/* ==========================================================================
   The workspace's Analyses: each view of the design, chosen by a row of chips, with the field
   (and wavelength) it is for. Worked out when shown and kept until the design changes.
   Wavelengths keep one colour each, in the order the conditions list them; tangential is drawn
   solid and sagittal dashed. Every plot carries a legend and saves its numbers as CSV.
   ========================================================================== */
export const WAVE_COLOURS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const waveColour = i => WAVE_COLOURS[i % WAVE_COLOURS.length];
const VIEWS = [['spot', 'Spot diagram'], ['fans', 'Ray fans'], ['opd', 'OPD fans'], ['field', 'Field curvature and distortion'], ['long', 'Longitudinal and colour'],
  ['wave', 'Wavefront'], ['psf', 'PSF'], ['mtf', 'MTF'], ['seidel', 'Seidel']];
const anFmt = (v, p) => v === null || v === undefined || !isFinite(v) ? '—' : String(+(+v).toPrecision(p || 4));
const um = v => anFmt(1000 * v, 4) + ' µm';

const anaCache = new Map();
function cached(key, fn) {
  if (anaCache.has(key)) return anaCache.get(key);
  const v = fn();
  anaCache.set(key, v);
  if (anaCache.size > 40) anaCache.delete(anaCache.keys().next().value);
  return v;
}
const designKey = (asm, P) => JSON.stringify([P.surfaces.map(s => [s.R, s.k, s.a2, s.A, s.odd, s.semi]), P.gaps, P.materials, P.image, asm.cond]);

/* st: the view's state ({ view, field, wave }), kept by the workspace; redraw: draws the workspace again */
/* a field's unit: degrees from infinity, millimetres of object height from a finite object */
let FU = '°', FU_WORD = 'degrees', FU_CSV = 'deg';
export function analysesPanel(asm, P, F, st, redraw) {
  st.view = st.view || 'spot';
  const c = asm.cond, fin = !!(c.object && c.object.kind === 'finite');
  FU = fin ? ' mm' : '°'; FU_WORD = fin ? 'object height, mm' : 'degrees'; FU_CSV = fin ? 'mm' : 'deg';
  if (!(st.field >= 0 && st.field < c.fields.length)) st.field = c.fields.length - 1;
  if (!(st.wave >= 0 && st.wave < c.waves.length)) st.wave = c.primary;
  const card = h('div', { class: 'rt-lcard rt-lana', role: 'tabpanel' });
  const chip = (on, label, fn, attrs) => h('button', Object.assign({ type: 'button', class: 'rt-lchip', 'aria-pressed': String(on), onclick: fn }, attrs || {}), label);
  card.append(h('div', { class: 'rt-lchips', role: 'group', 'aria-label': 'Analysis' }, ...VIEWS.map(([k, t]) => chip(st.view === k, t, () => { st.view = k; redraw(); }))));
  const perField = ['spot', 'fans', 'opd', 'wave', 'psf', 'mtf'].includes(st.view) && st.view !== 'spot';
  if (perField) card.append(h('div', { class: 'rt-lchips', role: 'group', 'aria-label': 'Field' }, h('span', { class: 'rt-lsub' }, 'Field'),
    ...c.fields.map((f, i) => chip(st.field === i, anFmt(f.deg, 4) + FU, () => { st.field = i; redraw(); }))));
  if (st.view === 'wave' || st.view === 'psf') card.append(h('div', { class: 'rt-lchips', role: 'group', 'aria-label': 'Wavelength' }, h('span', { class: 'rt-lsub' }, 'Wavelength'),
    ...c.waves.map((w, i) => chip(st.wave === i, anFmt(w.nm, 5) + ' nm', () => { st.wave = i; redraw(); }, { style: '--sw:' + waveColour(i) }))));
  const key = designKey(asm, P), A = cached(key + '|sys', () => anaSystems(asm, P)), deg = c.fields[st.field].deg;
  const body = h('div', { class: 'rt-lanabody' });
  card.append(body);
  const view = st.view;
  if (view === 'spot') spotView(body, A, cached(key + '|spot', () => c.fields.map(f => spotDiagram(A, f.deg, 21))));
  else if (view === 'fans') fanView(body, A, cached(key + '|fans|' + deg, () => rayFans(A, deg, 41)), false);
  else if (view === 'opd') fanView(body, A, cached(key + '|opd|' + deg, () => opdFans(A, deg, 41)), true);
  else if (view === 'field') fieldView(body, A, cached(key + '|field', () => fieldCurves(A, 21)));
  else if (view === 'long') longView(body, A, cached(key + '|long', () => longitudinal(A, 21)));
  else if (view === 'wave') waveView(body, A, cached(key + '|wave|' + deg + '|' + st.wave, () => wavefrontMap(A, deg, st.wave, 48)));
  else if (view === 'psf') psfView(body, A, cached(key + '|psf|' + deg + '|' + st.wave, () => psfAnalysis(A, deg, st.wave, 64, 4)), cached(key + '|spot', () => c.fields.map(f => spotDiagram(A, f.deg, 21)))[st.field]);
  else if (view === 'mtf') mtfView(body, A, cached(key + '|mtf|' + deg, () => mtfAnalysis(A, deg)));
  else seidelView(body, asm, P, F);
  return card;
}

/* ---------- Drawing ---------- */
function canvasIn(parent, H, label) {
  const cv = h('canvas', { role: 'img', 'aria-label': label });
  const wrap = h('div', { class: 'rt-lplot' }, cv);
  parent.append(wrap);
  return { cv, wrap, H };
}
function legend(items) {
  return h('div', { class: 'rt-llegend' }, ...items.map(([t, col, dash]) => h('span', null, h('i', { class: dash ? 'dash' : '', style: '--sw:' + col, 'aria-hidden': 'true' }), t)));
}
/* a line plot: series of { label, colour, dash, xs, ys } (null for no value); xs across, ys up; x/y specs as drawAxes takes them */
function linePlot(parent, o) {
  const { cv, wrap } = canvasIn(parent, o.H || 260, o.label);
  const read = h('div', { class: 'rt-lread mono', 'aria-live': 'off' }, ' ');
  wrap.append(read);
  let xr = o.xr, yr = o.yr;
  if (!xr || !yr) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of o.series) s.xs.forEach((x, i) => { const y = s.ys[i]; if (x === null || y === null || !isFinite(x) || !isFinite(y)) return; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
    if (!isFinite(x0)) { x0 = 0; x1 = 1; y0 = 0; y1 = 1; }
    const pad = (a, b, sym) => { if (sym) { const m = Math.max(Math.abs(a), Math.abs(b), 1e-12) * 1.08; return [-m, m]; } const d = (b - a) || Math.abs(a) || 1; return [a - 0.04 * d, b + 0.04 * d]; };
    xr = xr || pad(x0, x1, o.symX); yr = yr || pad(y0, y1, o.symY);
  }
  const draw = (hover) => {
    const dpr = window.devicePixelRatio || 1, W = Math.max(200, wrap.clientWidth || 400), H = o.H || 260;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const Ar = plotArea(g, W, H, yr, o.y);
    drawAxes(g, Ar, xr, yr, o.x, o.y);
    const X = v => Ar.l + (v - xr[0]) / (xr[1] - xr[0]) * Ar.w, Y = v => Ar.t + Ar.h - (v - yr[0]) / (yr[1] - yr[0]) * Ar.h;
    g.save(); g.beginPath(); g.rect(Ar.l, Ar.t, Ar.w, Ar.h); g.clip();
    // the zero lines, recessive
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
    if (xr[0] < 0 && xr[1] > 0) { g.beginPath(); g.moveTo(Math.round(X(0)) + 0.5, Ar.t); g.lineTo(Math.round(X(0)) + 0.5, Ar.t + Ar.h); g.stroke(); }
    if (yr[0] < 0 && yr[1] > 0) { g.beginPath(); g.moveTo(Ar.l, Math.round(Y(0)) + 0.5); g.lineTo(Ar.l + Ar.w, Math.round(Y(0)) + 0.5); g.stroke(); }
    for (const s of o.series) {
      g.strokeStyle = s.colour; g.lineWidth = 2; g.setLineDash(s.dash ? [6, 4] : []); g.lineJoin = 'round';
      g.beginPath(); let on = false;
      s.xs.forEach((x, i) => { const y = s.ys[i]; if (x === null || y === null || !isFinite(x) || !isFinite(y)) { on = false; return; } if (on) g.lineTo(X(x), Y(y)); else { g.moveTo(X(x), Y(y)); on = true; } });
      g.stroke();
    }
    g.setLineDash([]);
    if (hover) { g.strokeStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); if (o.hoverY) { g.moveTo(Ar.l, Y(hover.v) + 0.5); g.lineTo(Ar.l + Ar.w, Y(hover.v) + 0.5); } else { g.moveTo(X(hover.v) + 0.5, Ar.t); g.lineTo(X(hover.v) + 0.5, Ar.t + Ar.h); } g.stroke(); }
    g.restore();
    cv._area = Ar; cv._X = X; cv._Y = Y;
  };
  // the readout under the plot: each series' value at the sample nearest the pointer
  cv.addEventListener('pointermove', e => {
    const Ar = cv._area; if (!Ar) return;
    const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    const v = o.hoverY ? yr[0] + (Ar.t + Ar.h - py) / Ar.h * (yr[1] - yr[0]) : xr[0] + (px - Ar.l) / Ar.w * (xr[1] - xr[0]);
    const ref = o.hoverY ? o.series[0].ys : o.series[0].xs;
    let k = 0; ref.forEach((t, i) => { if (t !== null && Math.abs(t - v) < Math.abs(ref[k] - v)) k = i; });
    const at = ref[k];
    read.textContent = (o.hoverY ? o.yName : o.xName) + ' ' + anFmt(at, 4) + ': ' + o.series.map(s => s.label + ' ' + anFmt(o.hoverY ? s.xs[k] : s.ys[k], 4)).join(' · ');
    draw({ v: at });
  });
  cv.addEventListener('pointerleave', () => { read.textContent = ' '; draw(); });
  requestAnimationFrame(() => draw());
  if (o.csv) { plotCsv(cv, o.csv.name, o.csv.cols, o.csv.rows); wrap.append(plotSaveRow(cv)); }
  return cv;
}
const pair = parent => { const row = h('div', { class: 'rt-lpair' }); parent.append(row); const a = h('div'), b = h('div'); row.append(a, b); return [a, b]; };

/* ---------- The views ---------- */
function spotView(body, A, spots) {
  const c = A.c;
  // one scale for every field: the largest spot or Airy disc, about the chief ray
  let ext = 0;
  for (const s of spots) { ext = Math.max(ext, s.airy * 1.2); for (const w of s.waves) for (const [x, y] of w.pts) ext = Math.max(ext, Math.abs(x - s.centroid[0]), Math.abs(y - s.centroid[1])); }
  ext = ext * 1.1 || 1e-3;
  const row = h('div', { class: 'rt-lspots' });
  body.append(row);
  spots.forEach((s, fi) => {
    const cell = h('div', { class: 'rt-lspot' }), cv = h('canvas', { role: 'img', 'aria-label': 'Spot diagram at ' + anFmt(s.deg, 4) + FU + ': RMS radius ' + um(s.rms) });
    cell.append(cv, h('div', { class: 'rt-lsub' }, h('b', null, anFmt(s.deg, 4) + FU), ' RMS ' + um(s.rms) + ' · largest ' + um(s.geo)));
    row.append(cell);
    requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1, S = Math.max(140, Math.min(260, cell.clientWidth || 200));
      cv.width = S * dpr; cv.height = S * dpr; cv.style.width = S + 'px'; cv.style.height = S + 'px';
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(0,0,0,0.15)'; g.strokeRect(0.5, 0.5, S - 1, S - 1);
      const k = (S / 2 - 6) / ext, X = x => S / 2 + (x - s.centroid[0]) * k, Y = y => S / 2 - (y - s.centroid[1]) * k;
      // the Airy disc, about the centroid
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1; g.beginPath(); g.arc(S / 2, S / 2, s.airy * k, 0, 2 * Math.PI); g.stroke();
      s.waves.forEach((w, wi) => { g.fillStyle = waveColour(wi); for (const [x, y] of w.pts) { g.beginPath(); g.arc(X(x), Y(y), 1.6, 0, 2 * Math.PI); g.fill(); } });
    });
    if (!fi) plotCsv(cv, 'spot diagram', ['field (' + FU_CSV + ')', 'wavelength (nm)', 'x (mm)', 'y (mm)'], () => spots.flatMap(sp => sp.waves.flatMap(w => w.pts.map(([x, y]) => [sp.deg, w.nm, x, y]))));
    if (!fi) cell.append(plotSaveRow(cv));
  });
  body.append(legend(c.waves.map((w, i) => [anFmt(w.nm, 5) + ' nm', waveColour(i)]).concat([['Airy disc (' + um(spots[0].airy) + ' radius)', '#555']])));
  body.append(h('p', { class: 'rt-lsub' }, 'Each box ' + um(2 * ext) + ' across, about the centroid; ' + spots[0].rays + ' rays a wavelength across the pupil. RMS and largest radius about the centroid of all the wavelengths, weighted.'));
}
function fanView(body, A, F, opd) {
  const [a, b] = pair(body), c = A.c, xs = F.p;
  const ser = key => F.waves.map((w, i) => ({ label: anFmt(w.nm, 5) + ' nm', colour: waveColour(i), xs, ys: w[key] }));
  const y = opd ? { kind: 'plain', title: 'OPD, waves' } : { kind: 'len', title: 'Ray error' };
  const rows = () => xs.map((p, k) => [p, ...F.waves.flatMap(w => [w.tan[k], w.sag[k]])]);
  const cols = ['pupil'].concat(F.waves.flatMap(w => [w.nm + ' nm tangential', w.nm + ' nm sagittal']));
  let m = 0;
  for (const w of F.waves) for (const v of w.tan.concat(w.sag)) if (v !== null && isFinite(v)) m = Math.max(m, Math.abs(v));
  const yr = [-(m * 1.08 || 1e-6), m * 1.08 || 1e-6];
  linePlot(a, { label: 'Tangential ' + (opd ? 'OPD' : 'ray') + ' fan', x: { kind: 'plain', title: 'Pupil y' }, y, xr: [-1, 1], yr, series: ser('tan'), xName: 'pupil', H: 240, csv: { name: (opd ? 'OPD' : 'ray') + ' fans ' + F.deg + ' deg', cols, rows } });
  linePlot(b, { label: 'Sagittal ' + (opd ? 'OPD' : 'ray') + ' fan', x: { kind: 'plain', title: 'Pupil x' }, y, xr: [-1, 1], yr, series: ser('sag'), xName: 'pupil', H: 240 });
  body.append(legend(c.waves.map((w, i) => [anFmt(w.nm, 5) + ' nm', waveColour(i)])));
  body.append(h('p', { class: 'rt-lsub' }, opd ? 'The wavefront error along the pupil’s diameters, tangential (in the plane of the fields) and sagittal, each wavelength about its own chief ray.'
    : 'Where each ray lands on the image plane, from the primary wavelength’s chief ray: its error across the field (tangential, against the pupil’s y) and out of it (sagittal, against its x).'));
}
function fieldView(body, A, C) {
  const [a, b] = pair(body), c = A.c, ys = C.degs;
  const series = [];
  C.waves.forEach((w, i) => { series.push({ label: anFmt(w.nm, 5) + ' T', colour: waveColour(i), xs: w.tan, ys }); series.push({ label: anFmt(w.nm, 5) + ' S', colour: waveColour(i), dash: true, xs: w.sag, ys }); });
  linePlot(a, { label: 'Field curvature', x: { kind: 'len', title: 'Focus from the image plane' }, y: { kind: 'plain', title: 'Field, ' + FU_WORD }, yr: [0, Math.max(...ys) || 1], symX: true, series, hoverY: true, yName: 'field', H: 260,
    csv: { name: 'field curvature', cols: ['field (' + FU_CSV + ')'].concat(C.waves.flatMap(w => [w.nm + ' nm T (mm)', w.nm + ' nm S (mm)']), ['distortion (%)']), rows: () => ys.map((g, k) => [g, ...C.waves.flatMap(w => [w.tan[k], w.sag[k]]), C.dist[k]]) } });
  linePlot(b, { label: 'Distortion', x: { kind: 'plain', title: 'Distortion, %' }, y: { kind: 'plain', title: 'Field, ' + FU_WORD }, yr: [0, Math.max(...ys) || 1], symX: true,
    series: [{ label: 'Distortion %', colour: waveColour(c.primary), xs: C.dist, ys }], hoverY: true, yName: 'field', H: 260 });
  body.append(legend(c.waves.map((w, i) => [anFmt(w.nm, 5) + ' nm', waveColour(i)]).concat([['tangential', '#555'], ['sagittal', '#555', true]])));
  const k = ys.length - 1;
  body.append(h('p', { class: 'rt-lsub' }, 'At ' + anFmt(ys[k], 4) + FU + ': tangential focus ' + um(C.waves[c.primary].tan[k]) + ', sagittal ' + um(C.waves[c.primary].sag[k]) + ' from the image plane (astigmatism ' + um(C.waves[c.primary].tan[k] - C.waves[c.primary].sag[k]) + '); distortion ' + anFmt(C.dist[k], 4) + '%, the real chief ray against the paraxial.'));
}
function longView(body, A, L) {
  const [a, b] = pair(body), c = A.c;
  linePlot(a, { label: 'Longitudinal aberration', x: { kind: 'len', title: 'Focus from the paraxial focus' }, y: { kind: 'plain', title: 'Pupil height' }, yr: [0, 1], symX: true,
    series: L.waves.map((w, i) => ({ label: anFmt(w.nm, 5) + ' nm', colour: waveColour(i), xs: w.dz, ys: L.rho })), hoverY: true, yName: 'pupil', H: 260,
    csv: { name: 'longitudinal aberration', cols: ['pupil height'].concat(L.waves.map(w => w.nm + ' nm (mm)')), rows: () => L.rho.map((p, k) => [p, ...L.waves.map(w => w.dz[k])]) } });
  linePlot(b, { label: 'Chromatic focal shift', x: { kind: 'len', title: 'Paraxial focus shift' }, y: { kind: 'plain', title: 'Wavelength, nm' }, symX: true,
    series: [{ label: 'shift', colour: '#444', xs: L.shift, ys: L.lam }], hoverY: true, yName: 'nm', H: 260 });
  body.append(legend(c.waves.map((w, i) => [anFmt(w.nm, 5) + ' nm', waveColour(i)])));
  const lo = Math.min(...L.shift), hi = Math.max(...L.shift);
  body.append(h('p', { class: 'rt-lsub' }, 'Left: where rays from each height in the pupil, on the axis, cross it, from the primary wavelength’s paraxial focus. Right: the paraxial focus over the wavelengths; it spans ' + um(hi - lo) + ' here.'));
}
const DIV = [[0x2a, 0x78, 0xd6], [0xf0, 0xef, 0xec], [0xe3, 0x49, 0x48]];
const diverge = t => { t = Math.max(-1, Math.min(1, t)); const [a, b] = t < 0 ? [DIV[1], DIV[0]] : [DIV[1], DIV[2]], u = Math.abs(t); return a.map((v, i) => Math.round(v + (b[i] - v) * u)); };
function heat(parent, N, val, colour, label, size) {
  const cv = h('canvas', { role: 'img', 'aria-label': label, class: 'rt-lheat' });
  parent.append(cv);
  const img = new ImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = val(i, j), o = ((N - 1 - j) * N + i) * 4;
    if (v === null) { img.data.set([255, 255, 255, 0], o); continue; }
    const col = colour(v); img.data.set([col[0], col[1], col[2], 255], o);
  }
  cv.width = N; cv.height = N; cv.style.width = size + 'px'; cv.style.height = size + 'px';
  cv.getContext('2d').putImageData(img, 0, 0);
  return cv;
}
function waveView(body, A, M) {
  const row = h('div', { class: 'rt-lpair' }), left = h('div'), right = h('div');
  row.append(left, right); body.append(row);
  const m = Math.max(1e-6, ...Array.from(M.W).filter(isFinite).map(v => Math.abs(v - M.mean)));
  const cv = heat(left, M.N, (i, j) => { const v = M.W[j * M.N + i]; return isFinite(v) ? v - M.mean : null; }, v => diverge(v / m), 'The wavefront over the pupil: RMS ' + anFmt(M.rms, 3) + ' waves', 240);
  left.append(h('div', { class: 'rt-lkeybar' }, h('span', { class: 'mono' }, '−' + anFmt(m, 3)), h('i', { 'aria-hidden': 'true' }), h('span', { class: 'mono' }, '+' + anFmt(m, 3) + ' waves')));
  left.append(h('p', { class: 'rt-lsub' }, 'RMS ' + anFmt(M.rms, 3) + ' waves · peak to valley ' + anFmt(M.pv, 3) + ' waves at ' + anFmt(M.nm, 5) + ' nm, piston taken out. Pupil x across, y up.'));
  plotCsv(cv, 'wavefront', ['pupil x', 'pupil y', 'OPD (waves)'], () => { const out = []; for (let j = 0; j < M.N; j++) for (let i = 0; i < M.N; i++) { const v = M.W[j * M.N + i]; if (isFinite(v)) out.push([-1 + (2 * i + 1) / M.N, -1 + (2 * j + 1) / M.N, v - M.mean]); } return out; });
  left.append(plotSaveRow(cv));
  const tbl = h('table', { class: 'rt-ltable rt-lzern' });
  tbl.append(h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Z'), h('th', { scope: 'col' }, 'Term'), h('th', { scope: 'col' }, 'Waves'))));
  const tb = h('tbody');
  (M.coef || []).forEach((v, i) => tb.append(h('tr', null, h('td', { class: 'mono' }, String(i + 1)), h('td', null, ZERNIKE_NAMES[i]), h('td', { class: 'mono' }, Math.abs(v) < 5e-7 ? '0' : v.toFixed(5)))));
  tbl.append(tb);
  right.append(h('h3', null, 'Fringe Zernike terms'), tbl);
}
function psfView(body, A, F, spot) {
  const row = h('div', { class: 'rt-lpair' }), left = h('div'), right = h('div');
  row.append(left, right); body.append(row);
  // the middle of the PSF, about 8 Airy radii across (or the spot, if larger)
  const half = Math.min(F.M / 2 - 1, Math.max(12, Math.ceil(Math.max(4 * F.airy, 1.2 * (spot ? spot.geo : 0)) / F.dx))), N = 2 * half, o = F.M / 2 - half;
  let pk = 0; for (const v of F.I) pk = Math.max(pk, v);
  const cv = heat(left, N, (i, j) => F.I[(j + o) * F.M + i + o] / pk, v => magma(Math.sqrt(v)), 'The point spread function: Strehl ratio ' + anFmt(F.strehl, 3), 240);
  left.append(h('p', { class: 'rt-lsub' }, 'At ' + anFmt(F.nm, 5) + ' nm, ' + um(N * F.dx) + ' across, brightness as the square root of the irradiance. Strehl ratio ' + anFmt(F.strehl, 3) + '.'));
  if (spot && spot.geo > 0.35 * F.window) left.append(h('div', { class: 'rt-lnote' }, 'The spot is large against this PSF’s window (' + um(F.window) + '): the aberrations are too large for it to hold. See the spot diagram.'));
  plotCsv(cv, 'psf', ['x (mm)', 'y (mm)', 'irradiance (peak 1)'], () => { const out = []; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) out.push([(i - half) * F.dx, (j - half) * F.dx, F.I[(j + o) * F.M + i + o] / pk]); return out; });
  left.append(plotSaveRow(cv));
  const n = Math.min(F.r.length, Math.ceil(Math.max(6 * F.airy, 1.5 * (spot ? spot.geo : 0)) / F.dx));
  linePlot(right, { label: 'Encircled energy', x: { kind: 'len', title: 'Radius' }, y: { kind: 'plain', title: 'Encircled energy' }, xr: [0, F.r[n - 1]], yr: [0, 1.02],
    series: [{ label: 'design', colour: WAVE_COLOURS[0], xs: F.r.slice(0, n), ys: F.ee.slice(0, n) }, { label: 'diffraction limit', colour: '#666', dash: true, xs: F.r.slice(0, n), ys: F.ee0.slice(0, n) }], xName: 'radius (mm)', H: 240,
    csv: { name: 'encircled energy', cols: ['radius (mm)', 'design', 'diffraction limit'], rows: () => F.r.map((r, k) => [r, F.ee[k], F.ee0[k]]) } });
  right.append(legend([['design', WAVE_COLOURS[0]], ['diffraction limit', '#666', true]]));
}
function mtfView(body, A, M) {
  const v = M.freqs;
  linePlot(body, { label: 'MTF', x: { kind: 'plain', title: 'Spatial frequency, cycles/mm' }, y: { kind: 'plain', title: 'Modulation' }, xr: [0, v[v.length - 1]], yr: [0, 1.02],
    series: [{ label: 'tangential', colour: WAVE_COLOURS[0], xs: v, ys: M.tan }, { label: 'sagittal', colour: WAVE_COLOURS[1], dash: true, xs: v, ys: M.sag }, { label: 'diffraction limit', colour: '#666', xs: v, ys: M.limT }],
    xName: 'cycles/mm', H: 280, csv: { name: 'MTF ' + M.deg + ' deg', cols: ['cycles/mm', 'tangential', 'sagittal', 'diffraction limit (T)', 'diffraction limit (S)'], rows: () => v.map((f, k) => [f, M.tan[k], M.sag[k], M.limT[k], M.limS[k]]) } });
  body.append(legend([['tangential', WAVE_COLOURS[0]], ['sagittal', WAVE_COLOURS[1], true], ['diffraction limit', '#666']]));
  const at = f => { const k = Math.min(v.length - 1, Math.round(f / v[v.length - 1] * (v.length - 1))); return anFmt(M.tan[k], 3) + ' / ' + anFmt(M.sag[k], 3); };
  body.append(h('p', { class: 'rt-lsub' }, 'The diffraction MTF over the wavelengths, weighted, from the pupil’s autocorrelation; cutoff ' + anFmt(M.cutoff, 4) + ' cycles/mm at the primary wavelength. Tangential / sagittal at 10, 30 and 50 cycles/mm: ' + at(10) + ', ' + at(30) + ', ' + at(50) + '.'));
}
function seidelView(body, asm, P, F) {
  const sd = F.seidel, sps = surfaceParts(P), cols = ['SI', 'SII', 'SIII', 'SIV', 'SV', 'CL', 'CT'];
  body.append(h('h3', null, 'Third-order aberrations (Seidel sums, mm)'));
  body.append(h('p', { class: 'rt-lsub' }, 'At ' + anFmt(primaryNm(asm.cond), 5) + ' nm over fields to ' + anFmt(F.fmax, 3) + FU + ', the colour terms from ' + anFmt(F.lo, 5) + ' to ' + anFmt(F.hi, 5) + ' nm. ' +
    'SI spherical, SII coma, SIII astigmatism, SIV Petzval, SV distortion; CL axial and CT lateral colour. Signs as in the usual convention: an uncorrected positive singlet has SI above 0.'));
  const tbl = h('table', { class: 'rt-ltable rt-lseidel' });
  tbl.append(h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Surface'), ...cols.map(c => h('th', { scope: 'col' }, c)))));
  const tb = h('tbody'), f = v => Math.abs(v) < 5e-13 ? '0' : v.toExponential(4).replace(/e\+0$/, '').replace(/e([+-])(\d)$/, 'e$1$2');
  sd.rows.forEach((r, i) => tb.append(h('tr', null, h('td', null, sps[i].kind === 'stop' ? 'STO' : String(i + 1)), ...cols.map(c => h('td', { class: 'mono' }, f(r[c]))))));
  tb.append(h('tr', { class: 'sum' }, h('td', null, 'Sum'), ...cols.map(c => h('td', { class: 'mono' }, f(sd.sum[c])))));
  tbl.append(tb);
  body.append(h('div', { class: 'rt-ltwrap' }, tbl));
}
