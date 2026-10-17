import { primaryNm, surfaceParts } from '../engines/lens-design.js';
import { ZERNIKE_NAMES, anaSystems, fieldCurves, paraxHeight, footprints, huygensFinish, huygensPlan, huygensRows, longitudinal, throughFocusPlan, mtfAnalysis, opdFans, psfAnalysis, rayFans, relIllum, spotDiagram, wavefrontMap } from '../engines/lens-analysis.js';
import { ghostAnalysis, ghostsTraceable } from '../engines/lens-ghost.js';
import { imsimPlan, imsimTraceable } from '../engines/lens-imsim.js';
import { polAnalysis } from '../engines/lens-pol.js';
import { HOUSINGS, T_NOMINAL, thermalAnalysis } from '../engines/lens-thermal.js';
import { coatPreset } from '../core/coatings.js';
import { normCoat } from '../state/project.js';
import { changed } from './actions.js';
import { checkpoint } from './tabs.js';
import { getEl } from '../state/elements.js';
import { helpLine, h } from './panel.js';
import { drawAxes, magma, plotArea, plotCsv, plotSaveRow } from './plots.js';
import { fmtSig } from '../core/format.js';

/* ==========================================================================
   The workspace's Analyses: each view of the design, chosen by a row of chips, with the field
   (and wavelength) it is for. Worked out when shown and kept until the design changes.
   Wavelengths keep one colour each, in the order the conditions list them; tangential is drawn
   solid and sagittal dashed. Every plot carries a legend and saves its numbers as CSV.
   ========================================================================== */
export const WAVE_COLOURS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const waveColour = i => WAVE_COLOURS[i % WAVE_COLOURS.length];
const VIEWS = [['spot', 'Spot diagram'], ['fans', 'Ray fans'], ['opd', 'OPD fans'], ['field', 'Field curvature and distortion'], ['long', 'Longitudinal and colour'],
  ['wave', 'Wavefront'], ['psf', 'PSF'], ['mtf', 'MTF'], ['tfm', 'Through-focus MTF'], ['ri', 'Relative illumination'], ['foot', 'Footprints'], ['seidel', 'Seidel'], ['ghost', 'Ghosts'], ['pol', 'Polarisation'], ['therm', 'Thermal'], ['imsim', 'Image simulation']];
const anFmt = (v, p) => fmtSig(v, p || 4);
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
  const huy = st.view === 'psf' && st.psfm === 'huy';
  if (!(st.wave >= 0 && st.wave < c.waves.length) && !(huy && st.wave === -1)) st.wave = c.primary;
  const card = h('div', { class: 'rt-lcard rt-lana', role: 'tabpanel' });
  const chip = (on, label, fn, attrs) => h('button', Object.assign({ type: 'button', class: 'rt-lchip', 'aria-pressed': String(on), onclick: fn }, attrs || {}), label);
  card.append(h('div', { class: 'rt-lchips', role: 'group', 'aria-label': 'Analysis' }, ...VIEWS.map(([k, t]) => chip(st.view === k, t, () => { st.view = k; redraw(); }))));
  const perField = ['fans', 'opd', 'wave', 'psf', 'mtf', 'ghost', 'pol'].includes(st.view);
  if (perField) card.append(h('div', { class: 'rt-lchips', role: 'group', 'aria-label': 'Field' }, h('span', { class: 'rt-lsub' }, 'Field'),
    ...c.fields.map((f, i) => chip(st.field === i, anFmt(f.deg, 4) + FU, () => { st.field = i; redraw(); }))));
  if (st.view === 'psf') card.append(h('div', { class: 'rt-lchips', role: 'group', 'aria-label': 'PSF method' }, h('span', { class: 'rt-lsub' }, 'Method'),
    chip(!huy, 'FFT', () => { st.psfm = 'fft'; redraw(); }, { title: 'The Fourier transform of the pupil function: quick; the image square to the chief ray' }),
    chip(huy, 'Huygens', () => { st.psfm = 'huy'; redraw(); }, { title: 'Huygens wavelets from the reference sphere summed on the image plane itself: slower; right for a beam meeting the image slantwise, and over all the wavelengths' })));
  if (st.view === 'wave' || st.view === 'psf' || st.view === 'pol') card.append(h('div', { class: 'rt-lchips', role: 'group', 'aria-label': 'Wavelength' }, h('span', { class: 'rt-lsub' }, 'Wavelength'),
    ...c.waves.map((w, i) => chip(st.wave === i, anFmt(w.nm, 5) + ' nm', () => { st.wave = i; redraw(); }, { style: '--sw:' + waveColour(i) })),
    ...(huy && c.waves.length > 1 ? [chip(st.wave === -1, 'All, weighted', () => { st.wave = -1; redraw(); })] : [])));
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
  else if (view === 'psf' && huy) {
    const hk = key + '|huy|' + deg + '|' + st.wave;
    if (anaCache.has(hk)) huyView(body, A, anaCache.get(hk));
    else huyPending(body, hk, () => huygensPlan(A, deg, st.wave), redraw);
  }
  else if (view === 'psf') psfView(body, A, cached(key + '|psf|' + deg + '|' + st.wave, () => psfAnalysis(A, deg, st.wave, 64, 4)), cached(key + '|spot', () => c.fields.map(f => spotDiagram(A, f.deg, 21)))[st.field]);
  else if (view === 'ri') riView(body, A, cached(key + '|ri', () => relIllum(A, 21, 64)));
  else if (view === 'foot') footView(body, A, P, cached(key + '|foot', () => footprints(A, 15)), st, redraw);
  else if (view === 'pol') polView(body, A, P, st, cached(key + '|pol|' + deg + '|' + st.wave + '|' + (st.polIn || 'none') + '|' + coatKey(P), () => polAnalysis(A, coatsOf(P), deg, st.wave, st.polIn || 'none', 25)), redraw);
  else if (view === 'tfm') tfmView(body, A, asm, P, key, st, redraw);
  else if (view === 'therm') thermView(body, A, asm, P, key, st, redraw);
  else if (view === 'imsim') imsimView(body, A, P, st, key, redraw);
  else if (view === 'mtf') mtfView(body, A, cached(key + '|mtf|' + deg, () => mtfAnalysis(A, deg)));
  else if (view === 'ghost') ghostView(body, A, P, cached(key + '|ghost|' + deg + '|' + coatKey(P), () => ghostAnalysis(A, coatsOf(P), deg, 15)), st, redraw);
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
export function linePlot(parent, o) {
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
  body.append(helpLine('Longitudinal aberration (left) and the focus over the wavelengths (right).', ['Left: where rays from each height in the pupil, on the axis, cross it, from the primary wavelength’s paraxial focus. Right: the paraxial focus over the wavelengths; it spans ' + um(hi - lo) + ' here.'], 'rt-lsub'));
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
/* the Huygens PSF is summed a few rows at a time, the page kept live, and drawn when done; one at a time */
let huyJob = null;
function huyPending(body, key, plan, redraw) {
  const el = h('p', { class: 'rt-lsub', role: 'status' }, 'Summing the wavelets…');
  body.append(el);
  if (huyJob && huyJob.key === key) { huyJob.el = el; return; }
  if (huyJob) huyJob.cancelled = true;
  const job = huyJob = { key, el, cancelled: false };
  const finish = v => {
    if (job.cancelled) return;
    anaCache.set(key, v);
    if (anaCache.size > 40) anaCache.delete(anaCache.keys().next().value);
    huyJob = null;
    if (job.el.isConnected) redraw();
  };
  setTimeout(() => {
    if (job.cancelled) return;
    const P = plan();
    if (!P) { finish(null); return; }
    const step = () => {
      if (job.cancelled) return;
      const t = performance.now();
      let done = false;
      while (!done && performance.now() - t < 30) done = huygensRows(P, 1);
      if (done) { finish(huygensFinish(P)); return; }
      job.el.textContent = 'Summing the wavelets… ' + Math.floor(100 * P.next / P.rows) + '% (' + P.N + ' rays across, ' + P.per.length + (P.per.length > 1 ? ' wavelengths)' : ' wavelength)');
      setTimeout(step, 0);
    };
    step();
  }, 0);
}
function huyView(body, A, H) {
  if (!H) { body.append(h('p', { class: 'rt-lsub' }, 'The chief ray of this field does not reach the image.')); return; }
  const row = h('div', { class: 'rt-lpair' }), left = h('div'), right = h('div');
  row.append(left, right); body.append(row);
  const M = H.M, c = (M - 1) / 2, wl = H.nm ? anFmt(H.nm, 5) + ' nm' : 'all the wavelengths, weighted';
  const cv = heat(left, M, (i, j) => H.I[j * M + i] / H.peak, v => magma(Math.sqrt(v)), 'The Huygens point spread function: Strehl ratio ' + anFmt(H.strehl, 3), 240);
  left.append(h('p', { class: 'rt-lsub' }, 'At ' + wl + ', ' + um(H.window) + ' across on the image plane, brightness as the square root of the irradiance. Strehl ratio ' + anFmt(H.strehl, 3) + '; ' + H.across + ' rays across the pupil (' + H.rays + ' in all).'));
  if (H.clipped || H.aliased) left.append(h('div', { class: 'rt-lnote' }, 'The spot (RMS radius ' + um(H.rms) + ') is wider than this window, ' + anFmt(H.M, 3) + ' points at λF/4: it shows the middle of it, where the peak is. See the spot diagram for the whole of it.'));
  plotCsv(cv, 'huygens psf', ['x (mm)', 'y (mm)', 'irradiance (peak 1)'], () => { const out = []; for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) out.push([H.centre[0] + (i - c) * H.dx, H.centre[1] + (j - c) * H.dx, H.I[j * M + i] / H.peak]); return out; });
  left.append(plotSaveRow(cv));
  // sections through the peak, across (x) and along the plane of the fields (y)
  const pi = Math.round(H.peakAt[0] / H.dx + c), pj = Math.round(H.peakAt[1] / H.dx + c), xs = Array.from({ length: M }, (_, i) => (i - c) * H.dx);
  linePlot(right, { label: 'Sections through the peak', x: { kind: 'len', title: 'From the middle of the window' }, y: { kind: 'plain', title: 'Irradiance, peak 1' }, xr: [xs[0], xs[M - 1]], yr: [0, 1.02],
    series: [{ label: 'x (sagittal)', colour: WAVE_COLOURS[1], dash: true, xs, ys: xs.map((_, i) => H.I[pj * M + i] / H.peak) }, { label: 'y (tangential)', colour: WAVE_COLOURS[0], xs, ys: xs.map((_, j) => H.I[j * M + pi] / H.peak) }], xName: 'mm', H: 240,
    csv: { name: 'huygens psf sections', cols: ['position (mm)', 'x section', 'y section'], rows: () => xs.map((v, k) => [v, H.I[pj * M + k] / H.peak, H.I[k * M + pi] / H.peak]) } });
  right.append(legend([['y (tangential)', WAVE_COLOURS[0]], ['x (sagittal)', WAVE_COLOURS[1], true]]));
  right.append(helpLine('The point spread function, summed from each ray’s wavelet.', ['Each ray’s crossing of the reference sphere sends a wavelet, its phase the ray’s path, its strength its share of the light over the sphere it covers; their sum on the image plane is the PSF, the plane as it is, square to the axis. The Airy disc’s radius here: ' + um(H.airy) + '.'], 'rt-lsub'));
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
function riView(body, A, I) {
  const g = I.degs, top = Math.max(...g) || 1, k = g.length - 1;
  linePlot(body, { label: 'Relative illumination', x: { kind: 'plain', title: 'Field, ' + FU_WORD }, y: { kind: 'plain', title: 'Against the axis' }, xr: [0, top], yr: [0, 1.05],
    series: [{ label: 'relative illumination', colour: WAVE_COLOURS[0], xs: g, ys: I.ri }, { label: 'unvignetted', colour: WAVE_COLOURS[1], dash: true, xs: g, ys: I.vig }, { label: 'cos⁴', colour: '#666', xs: g, ys: I.cos4 }],
    xName: 'field', H: 280, csv: { name: 'relative illumination', cols: ['field (' + FU_CSV + ')', 'relative illumination', 'unvignetted share', 'cos4 of chief ray'], rows: () => g.map((v, j) => [v, I.ri[j], I.vig[j], I.cos4[j]]) } });
  body.append(legend([['relative illumination', WAVE_COLOURS[0]], ['unvignetted share of the pupil', WAVE_COLOURS[1], true], ['cos⁴ of the chief ray', '#666']]));
  body.append(helpLine('The image’s brightness across the field, against its centre.', ['The image’s brightness across the field against its centre: the solid angle the exit pupil fills, seen from where the chief ray lands, projected on the image plane, with the vignetted rays left out. ' +
    'At ' + anFmt(g[k], 4) + FU + ' it is ' + anFmt(100 * I.ri[k], 3) + '%; ' + anFmt(100 * I.vig[k], 3) + '% of the pupil gets through, and cos⁴ of the chief ray’s angle in image space is ' + anFmt(I.cos4[k] === null ? null : 100 * I.cos4[k], 3) + '%.'], 'rt-lsub'));
}
function footView(body, A, P, F, st, redraw) {
  const sps = surfaceParts(P), name = i => sps[i].kind === 'stop' ? 'STO' : String(i + 1), L = F.surfaces, fin = v => isFinite(v) && v > 0;
  if (!(st.surf >= 0 && st.surf < L.length)) st.surf = L.reduce((b, u, i) => fin(u.semi) && (!fin(L[b].semi) || u.beam / u.semi > L[b].beam / L[b].semi) ? i : b, 0);
  body.append(h('h3', null, 'Footprints: where the beam crosses each surface'));
  body.append(helpLine('Each surface’s beam footprint against its clear radius.', ['Every field and wavelength, ' + F.rays + ' rays each (a grid across the pupil and a ring at its edge). The beam: the farthest any ray lands from the surface’s vertex, in its own frame; the margin, its clear radius less that. ' +
    'Choose a surface to see each field’s rays on it at ' + anFmt(F.nm, 5) + ' nm, those it stops as crosses.'], 'rt-lsub'));
  const tbl = h('table', { class: 'rt-ltable rt-lghost rt-lfoot' });
  tbl.append(h('thead', null, h('tr', null, ...[['Surface', 'Choose one to draw its footprint'], ['Clear radius', 'The surface’s clear (semi-) diameter'], ['Beam', 'The farthest any ray lands from its vertex'], ['Margin', 'The clear radius less the beam; below 0 it stops rays'], ['Used', 'The beam over the clear radius'], ['Rays stopped', 'Of those reaching it, over every field and wavelength']].map(([t, tip]) => h('th', { scope: 'col', title: tip }, t)))));
  const tb = h('tbody');
  L.forEach((u, i) => {
    const on = st.surf === i, m = fin(u.semi) ? u.semi - u.beam : Infinity;
    tb.append(h('tr', { class: on ? 'on' : '' },
      h('td', null, h('button', { type: 'button', class: 'rt-link', 'aria-pressed': String(on), 'aria-label': 'Show the footprint on surface ' + name(i), onclick: () => { st.surf = i; redraw(); } }, name(i))),
      h('td', { class: 'mono' }, fin(u.semi) ? anFmt(u.semi, 4) + ' mm' : '—'), h('td', { class: 'mono' }, u.reach ? anFmt(u.beam, 4) + ' mm' : '—'),
      h('td', { class: 'mono' + (m < 0 ? ' warn' : '') }, isFinite(m) ? anFmt(m, 3) + ' mm' : '—'), h('td', { class: 'mono' }, fin(u.semi) && u.reach ? anFmt(100 * u.beam / u.semi, 3) + '%' : '—'),
      h('td', { class: 'mono' + (u.stopped ? ' warn' : '') }, u.reach ? (u.stopped ? anFmt(100 * u.stopped / u.reach, 3) + '%' : '0') : '—')));
  });
  tbl.append(tb);
  body.append(h('div', { class: 'rt-ltwrap' }, tbl));
  const u = L[st.surf], col = fi => WAVE_COLOURS[fi % WAVE_COLOURS.length];
  const cell = h('div', { class: 'rt-lspot rt-lfootcell' }), cv = h('canvas', { role: 'img', 'aria-label': 'The footprint on surface ' + name(st.surf) + ': beam radius ' + anFmt(u.beam, 4) + ' mm' + (fin(u.semi) ? ', clear radius ' + anFmt(u.semi, 4) + ' mm' : '') });
  cell.append(cv, h('div', { class: 'rt-lsub' }, h('b', null, 'Surface ' + name(st.surf)), fin(u.semi) ? ', its clear radius dashed' : '', '; x across, y up, from its vertex'));
  body.append(h('div', { class: 'rt-lfootwrap' }, cell));
  body.append(legend(u.fields.map((f, fi) => [anFmt(f.deg, 4) + FU, col(fi)]).concat(u.stopped ? [['stopped here', '#888']] : [])));
  plotCsv(cv, 'footprint surface ' + name(st.surf), ['field (' + FU_CSV + ')', 'x (mm)', 'y (mm)', 'stopped'], () => u.fields.flatMap(f => f.pts.map(p => [f.deg, p[0], p[1], 0]).concat(f.cut.map(p => [f.deg, p[0], p[1], 1]))));
  cell.append(plotSaveRow(cv));
  requestAnimationFrame(() => {
    const dpr = window.devicePixelRatio || 1, S = Math.max(220, Math.min(380, cell.clientWidth || 340));
    cv.width = S * dpr; cv.height = S * dpr; cv.style.width = S + 'px'; cv.style.height = S + 'px';
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = '#fff'; x.fillRect(0, 0, S, S); x.strokeStyle = 'rgba(0,0,0,0.15)'; x.strokeRect(0.5, 0.5, S - 1, S - 1);
    let ext = Math.max(fin(u.semi) ? u.semi : 0, u.beam, 1e-6) * 1.08;
    const k = (S / 2 - 8) / ext, X = v => S / 2 + v * k, Y = v => S / 2 - v * k;
    // the axes through the vertex, recessive
    x.strokeStyle = 'rgba(0,0,0,0.12)'; x.beginPath(); x.moveTo(S / 2 + 0.5, 4); x.lineTo(S / 2 + 0.5, S - 4); x.moveTo(4, S / 2 + 0.5); x.lineTo(S - 4, S / 2 + 0.5); x.stroke();
    if (fin(u.semi)) { x.setLineDash([5, 4]); x.strokeStyle = '#555'; x.lineWidth = 1.5; x.beginPath(); x.arc(S / 2, S / 2, u.semi * k, 0, 2 * Math.PI); x.stroke(); x.setLineDash([]); }
    u.fields.forEach((f, fi) => {
      x.fillStyle = col(fi);
      for (const p of f.pts) { x.beginPath(); x.arc(X(p[0]), Y(p[1]), 1.6, 0, 2 * Math.PI); x.fill(); }
      x.strokeStyle = '#888'; x.lineWidth = 1;
      for (const p of f.cut) { const a = X(p[0]), b = Y(p[1]); x.beginPath(); x.moveTo(a - 2.5, b - 2.5); x.lineTo(a + 2.5, b + 2.5); x.moveTo(a + 2.5, b - 2.5); x.lineTo(a - 2.5, b + 2.5); x.stroke(); }
    });
    x.fillStyle = '#555'; x.font = '11px ui-monospace, monospace'; x.fillText('±' + anFmt(ext, 3) + ' mm', 8, S - 8);
  });
}
/* ---------- Through-focus MTF ---------- */
const numIn = (label, value, set, attrs) => h('label', { class: 'rt-lsub rt-limpitch' }, label + ' ', h('input', Object.assign({ type: 'number', step: 'any', value: String(value), 'aria-label': label, onchange: e => { const v = +e.target.value; if (isFinite(v)) set(v); } }, attrs || {})));
function tfmView(body, A, asm, P, key, st, redraw) {
  const lamF = A.Sp.lam * A.fw, cut = 1 / lamF;
  if (!(st.tfNu > 0)) st.tfNu = +(cut / 4).toPrecision(2);
  // the range: eight λF² either way, or wide enough that the largest spot's own blur changes by a few times its size
  if (!(st.tfSpan > 0)) { const rms = Math.max(0, ...A.c.fields.map(f => { const v = spotDiagram(A, f.deg, 11).rms; return isFinite(v) ? v : 0; })); st.tfSpan = +Math.max(8 * lamF * A.fw, 6 * A.fw * rms).toPrecision(2); }
  body.append(h('div', { class: 'rt-lchips' }, numIn('Frequency, cycles/mm', st.tfNu, v => { if (v > 0) { st.tfNu = v; redraw(); } }, { min: '0' }),
    numIn('Focus over ± mm', st.tfSpan, v => { if (v > 0) { st.tfSpan = v; redraw(); } }, { min: '0' })));
  const k = key + '|tfm|' + st.tfNu + '|' + st.tfSpan;
  if (!anaCache.has(k)) { imPending(body, k, () => throughFocusPlan(asm, P, st.tfNu, st.tfSpan, 31, 32), redraw, 'Tracing through focus'); return; }
  const T = anaCache.get(k), xs = T.dz, series = [];
  T.fields.forEach((f, i) => { series.push({ label: anFmt(f.deg, 4) + FU + ' T', colour: waveColour(i), xs, ys: f.tan }); series.push({ label: anFmt(f.deg, 4) + FU + ' S', colour: waveColour(i), dash: true, xs, ys: f.sag }); });
  linePlot(body, { label: 'Through-focus MTF', x: { kind: 'len', title: 'Image plane moved from where the design has it' }, y: { kind: 'plain', title: 'Modulation at ' + anFmt(T.nu, 4) + ' cycles/mm' }, xr: [-T.span, T.span], yr: [0, 1.02],
    series, xName: 'focus', H: 280, csv: { name: 'through-focus MTF', cols: ['focus shift (mm)'].concat(T.fields.flatMap(f => [f.deg + ' ' + FU_CSV + ' T', f.deg + ' ' + FU_CSV + ' S'])), rows: () => xs.map((d, i) => [d, ...T.fields.flatMap(f => [f.tan[i], f.sag[i]])]) } });
  body.append(legend(T.fields.map((f, i) => [anFmt(f.deg, 4) + FU, waveColour(i)]).concat([['tangential', '#555'], ['sagittal', '#555', true]])));
  const fb = T.fields.map(f => anFmt(f.deg, 4) + FU + ' ' + ghLen(f.best.at)).join(', ');
  body.append(helpLine('Best focus ' + ghLen(T.best.at) + ' from the design’s image plane.', ['The diffraction MTF at ' + anFmt(T.nu, 4) + ' cycles/mm (cutoff ' + anFmt(T.cutoff, 4) + '), over the wavelengths, weighted, as the image plane is moved along the axis. ' +
    'Best focus, the mean over the fields of tangential and sagittal at its peak (' + anFmt(T.best.v, 3) + '): ' + ghLen(T.best.at) + ' from the design’s image plane' +
    (T.dof ? '; it stays above 80% of that from ' + ghLen(T.dof[0]) + ' to ' + ghLen(T.dof[1]) + ' (' + ghLen(T.dof[1] - T.dof[0]) + ' deep)' : '') + '. Each field’s own best: ' + fb + '.'], 'rt-lsub'));
  if (T.fields.some(f => Math.abs(Math.abs(f.best.at) - T.span) < 1e-9 * T.span) || Math.abs(Math.abs(T.best.at) - T.span) < 1e-9 * T.span) body.append(h('div', { class: 'rt-lnote' }, 'A best focus is at an end of the range: it may lie beyond it. Widen the range to find it.'));
}

/* ---------- Thermal ---------- */
function thermView(body, A, asm, P, key, st, redraw) {
  if (!HOUSINGS.some(x => x[0] === st.thH)) st.thH = 'al';
  if (!(st.thP >= 0)) st.thP = 1;
  if (!isFinite(st.thLo)) st.thLo = -20;
  if (!isFinite(st.thHi)) st.thHi = 60;
  const H = HOUSINGS.find(x => x[0] === st.thH);
  body.append(h('div', { class: 'rt-lchips' },
    h('label', { class: 'rt-lsub rt-limpitch' }, 'Housing ', h('select', { 'aria-label': 'Housing', onchange: e => { st.thH = e.target.value; redraw(); } }, ...HOUSINGS.map(([k, t, a]) => h('option', { value: k, selected: k === st.thH }, t + ' (' + anFmt(a * 1e6, 3) + ' ppm/K)')))),
    numIn('From °C', st.thLo, v => { st.thLo = Math.max(-200, Math.min(v, st.thHi - 1)); redraw(); }),
    numIn('To °C', st.thHi, v => { st.thHi = Math.min(400, Math.max(v, st.thLo + 1)); redraw(); }),
    numIn('Pressure, atm', st.thP, v => { if (v >= 0) { st.thP = v; redraw(); } }, { min: '0' })));
  const temps = Array.from({ length: 9 }, (_, i) => st.thLo + (st.thHi - st.thLo) * i / 8);
  const R = cached(key + '|therm|' + st.thH + '|' + st.thP + '|' + st.thLo + '|' + st.thHi, () => thermalAnalysis(asm, P, temps, st.thP, H[2]));
  const xs = R.rows.map(r => r.T), [a, b] = pair(body);
  linePlot(a, { label: 'Focus against the detector', x: { kind: 'plain', title: 'Temperature, °C' }, y: { kind: 'len', title: 'Focus beyond the detector' }, symY: true,
    series: [{ label: 'focus', colour: WAVE_COLOURS[0], xs, ys: R.rows.map(r => r.defocus) }], xName: '°C', H: 240,
    csv: { name: 'thermal', cols: ['temperature (C)', 'EFL (mm)', 'focus beyond the detector (mm)'].concat(asm.cond.fields.map(f => 'RMS spot ' + f.deg + ' ' + FU_CSV + ' (mm)')), rows: () => R.rows.map(r => [r.T, r.efl, r.defocus, ...r.rms]) } });
  linePlot(b, { label: 'RMS spot on the detector', x: { kind: 'plain', title: 'Temperature, °C' }, y: { kind: 'len', title: 'RMS spot radius' },
    series: asm.cond.fields.map((f, i) => ({ label: anFmt(f.deg, 4) + FU, colour: waveColour(i), xs, ys: R.rows.map(r => r.rms[i]) })), xName: '°C', H: 240 });
  b.append(legend(asm.cond.fields.map((f, i) => [anFmt(f.deg, 4) + FU, waveColour(i)])));
  const tbl = h('table', { class: 'rt-ltable rt-lghost rt-ltherm' });
  tbl.append(h('thead', null, h('tr', null, ...['Temperature', 'Focal length', 'Change', 'Focus beyond the detector', ...asm.cond.fields.map(f => 'RMS spot ' + anFmt(f.deg, 4) + FU)].map(t => h('th', { scope: 'col' }, t)))));
  const tb = h('tbody');
  for (const r of R.rows) tb.append(h('tr', { class: Math.abs(r.T - T_NOMINAL) < 1e-9 ? 'on' : '' }, h('td', null, anFmt(r.T, 4) + ' °C'), h('td', { class: 'mono' }, anFmt(r.efl, 6) + ' mm'), h('td', { class: 'mono' }, ghLen(r.defl)), h('td', { class: 'mono' }, ghLen(r.defocus)), ...r.rms.map(v => h('td', { class: 'mono' }, um(v)))));
  tbl.append(tb);
  body.append(h('div', { class: 'rt-ltwrap' }, tbl));
  body.append(helpLine('The focus moves ' + ghLen(R.drift) + ' per kelvin against the detector.', ['Against the design at ' + T_NOMINAL + ' °C and one atmosphere, here at ' + anFmt(R.p, 3) + ' atm in ' + H[1].toLowerCase() + ': the focus moves ' + ghLen(R.drift) + ' per kelvin against the detector (' + (Math.abs(R.drift) < 1e-4 ? 'near athermal' : R.drift > 0 ? 'beyond it as it warms' : 'short of it as it warms') + '), the focal length ' + ghLen(R.eflDrift) + ' per kelvin. ' +
    'Each glass’s index by its maker’s formula and the air’s at that temperature and pressure; the lenses grow with their glasses, the spacers, the stop and the detector’s distance with the housing.' +
    (R.missing.length ? ' No data for ' + R.missing.join(', ') + ': taken as not changing.' : '')], 'rt-lsub'));
}

/* ---------- Polarisation ---------- */
const POL_CHOICES = [['none', 'Unpolarised'], ['x', 'x'], ['y', 'y'], ['d45', '45°'], ['rcp', 'Circular']];
// the coatings that can be chosen here for a lens face; any other the face has is kept as it is
const COAT_CHOICES = [['bare', 'Bare (Fresnel)'], ['ar', 'AR, 0.5%'], ['mgf2', 'MgF₂, λ/4'], ['vcoat', 'V-coat (MgF₂ on 1.70)']];
const coatChoice = c => {
  if (!c || c.mode === 'bare') return 'bare';
  if (c.mode === 'ar' && Math.abs((c.R || 0) - 0.5) < 1e-9) return 'ar';
  if (c.mode === 'stack' && c.layers && c.layers.length === 1 && Math.abs(c.layers[0].n - 1.38) < 1e-9) return 'mgf2';
  if (c.mode === 'stack' && c.layers && c.layers.length === 2 && Math.abs(c.layers[0].n - 1.38) < 1e-9 && Math.abs(c.layers[1].n - 1.70) < 1e-9) return 'vcoat';
  return 'other';
};
const coatName = c => !c || c.mode === 'bare' ? 'Bare' : c.mode === 'stack' ? 'Thin-film stack, ' + (c.layers || []).length + ' layer' + ((c.layers || []).length === 1 ? '' : 's') : c.mode === 'band' ? 'Coated ' + c.lo + '–' + c.hi + ' nm, ' + c.R + '%' : 'Reflects ' + (c.R || 0) + '%';
function setCoat(P, i, kind, nm, redraw) {
  const s = P.surfaces[i], e = s.from && getEl(s.from.id);
  if (!e || !e.surfaces || !e.surfaces[s.from.i]) return;
  checkpoint();
  const design = Math.round(nm);
  e.surfaces[s.from.i].coat = kind === 'bare' ? normCoat({ mode: 'bare' }) : kind === 'ar' ? normCoat({ mode: 'ar', R: 0.5 }) : normCoat({ mode: 'stack', design, layers: coatPreset(kind, design) });
  changed(false);
  redraw();
}
const polMap = (M, n, key) => { const out = new Float64Array(n * n).fill(NaN); M.grid.forEach((g, k) => { if (g) out[k] = g[key]; }); return out; };
function polView(body, A, P, st, R, redraw) {
  const sps = surfaceParts(P), name = i => sps[i].kind === 'stop' ? 'STO' : String(i + 1), coats = coatsOf(P), nm = R.nm;
  body.append(h('div', { class: 'rt-lchips', role: 'group', 'aria-label': 'Polarisation in' }, h('span', { class: 'rt-lsub' }, 'In'),
    ...POL_CHOICES.map(([k, t]) => h('button', { type: 'button', class: 'rt-lchip', 'aria-pressed': String((st.polIn || 'none') === k), onclick: () => { st.polIn = k; redraw(); } }, t))));
  const pin = R.pin, deg = d => anFmt(d * 180 / Math.PI, 3) + '°';
  body.append(helpLine(anFmt(100 * R.T, 4) + '% of the light reaches the image; mean diattenuation ' + anFmt(R.D, 3) + ', mean retardance ' + deg(R.ret) + '.', ['At ' + anFmt(nm, 5) + ' nm, ' + (A.finite ? 'object height ' : 'field ') + anFmt(R.deg, 4) + FU + ', ' + (pin === 'none' ? 'unpolarised' : POL_CHOICES.find(c => c[0] === pin)[1] + ' polarised') + ' light in: ' +
    anFmt(100 * R.T, 4) + '% of it reaches the image, over the rays that get there (' + anFmt(100 * R.reach, 3) + '% of the pupil); mean diattenuation ' + anFmt(R.D, 3) + ', mean retardance ' + deg(R.ret) + '. ' +
    'Each ray traced with its polarisation through every face (its coating’s s and p amplitudes, or Fresnel’s) and the glass between (its absorption), read in x and y each side.'], 'rt-lsub'));
  const row = h('div', { class: 'rt-lpolmaps' });
  body.append(row);
  const n = R.n, size = 170;
  const mapCell = (title, vals, lo, hi, fmt, ramp) => {
    const cell = h('div', { class: 'rt-lspot' }), fin = Array.from(vals).filter(isFinite), a = lo === null ? Math.min(...fin) : lo, b = hi === null ? Math.max(...fin) : hi;
    const cv = heat(cell, n, (i, j) => { const v = vals[j * n + i]; return isFinite(v) ? (b > a ? (v - a) / (b - a) : 0.5) : null; }, ramp, title + ': ' + fmt(a) + ' to ' + fmt(b), size);
    cell.append(h('div', { class: 'rt-lsub' }, h('b', null, title), ' ' + fmt(a) + ' to ' + fmt(b)));
    row.append(cell);
    return cv;
  };
  const pct = v => Math.abs(v) < 1e-12 ? '0' : anFmt(100 * v, 4) + '%';
  mapCell('Transmission', polMap(R, n, 'T'), null, null, pct, v => magma(v));
  mapCell('Diattenuation', polMap(R, n, 'D'), 0, null, v => anFmt(v, 3), v => magma(v));
  mapCell('Retardance', polMap(R, n, 'ret'), 0, null, deg, v => magma(v));
  if (pin !== 'none') {
    // the polarisation out across the pupil: an ellipse at every other ray
    const cell = h('div', { class: 'rt-lspot' }), cv = h('canvas', { role: 'img', 'aria-label': 'The polarisation leaving each part of the pupil' });
    cell.append(cv, h('div', { class: 'rt-lsub' }, h('b', null, 'Polarisation out'), ' across the pupil'));
    row.append(cell);
    requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1, S = size;
      cv.width = S * dpr; cv.height = S * dpr; cv.style.width = S + 'px'; cv.style.height = S + 'px';
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
      g.strokeStyle = 'rgba(0,0,0,0.15)'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 2 * Math.PI); g.stroke();
      g.strokeStyle = WAVE_COLOURS[0]; g.lineWidth = 1.2;
      const step = 2, cellPx = (S - 4) / n;
      R.grid.forEach((q, k) => {
        if (!q || !q.out) return;
        const i = k % n, j = Math.floor(k / n);
        if (i % step || j % step) return;
        const cx = 2 + (i + 0.5) * cellPx, cy = S - 2 - (j + 0.5) * cellPx, a = cellPx * step * 0.45, b = a * Math.abs(Math.tan(q.out.chi));
        g.save(); g.translate(cx, cy); g.rotate(-q.out.psi); g.beginPath(); g.ellipse(0, 0, a, Math.max(b, 0.01), 0, 0, 2 * Math.PI); g.stroke(); g.restore();
      });
    });
  }
  // the faces: each one's coating (to choose here), what it passes and reflects, and what the glass after it absorbs
  const tbl = h('table', { class: 'rt-ltable rt-lghost rt-lpol' });
  tbl.append(h('thead', null, h('tr', null, ...[['Surface', ''], ['Coating', 'A lens face’s coating can be chosen here (λ/4 at the primary wavelength); others are set on the part'], ['Passes', 'The mean over the rays of the share it passes, s and p averaged'], ['s / p', 'The share it passes of each, the mean over the rays'], ['Reflects', 'The mean share it sends back'], ['Glass after absorbs', 'The mean share the glass after it takes']].map(([t, tip]) => h('th', { scope: 'col', title: tip }, t)))));
  const tb = h('tbody'), primary = A.Sp.nm;
  R.faces.forEach((F, i) => {
    const s = P.surfaces[i], e = s.from && getEl(s.from.id), lensFace = !!(e && e.type === 'lens' && e.surfaces && e.surfaces[s.from.i]) && !s.mirror;
    const cur = coatChoice(coats[i]);
    const coatCell = lensFace ? h('select', { 'aria-label': 'Coating of surface ' + name(i), onchange: ev => setCoat(P, i, ev.target.value, primary, redraw) },
      ...COAT_CHOICES.map(([k, t]) => h('option', { value: k, selected: cur === k }, t)), ...(cur === 'other' ? [h('option', { value: 'other', selected: true, disabled: true }, coatName(coats[i]))] : []))
      : h('span', null, s.mirror ? 'Mirror (all of it)' : coats[i] ? coatName(coats[i]) : sps[i].kind === 'stop' ? 'Stop (no face)' : 'Bare');
    tb.append(h('tr', null, h('td', null, name(i)), h('td', null, coatCell), h('td', { class: 'mono' }, pct(F.T)), h('td', { class: 'mono' }, pct(F.Ts) + ' / ' + pct(F.Tp)),
      h('td', { class: 'mono' }, s.mirror ? '—' : pct(F.R)), h('td', { class: 'mono' }, F.absorbed > 0 ? pct(F.absorbed) : '0')));
  });
  tbl.append(tb);
  body.append(h('div', { class: 'rt-ltwrap' }, tbl));
}

/* ---------- Image simulation ----------
   The picture: a test chart drawn here, or one of the user's own (kept in this tab only, never saved or sent) */
const IM_W = 256, IM_H = 192;
let imOwn = null, imOwnId = 0;
const toLin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = v => { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)); };
function pictureOf(cv) {
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, n = cv.width * cv.height, ch = [0, 1, 2].map(() => new Float32Array(n));
  for (let q = 0; q < n; q++) for (let c = 0; c < 3; c++) ch[c][q] = toLin(d[q * 4 + c]);
  return { w: cv.width, h: cv.height, ch };
}
function chartCanvas() {
  const cv = document.createElement('canvas'); cv.width = IM_W; cv.height = IM_H;
  const g = cv.getContext('2d'), W = IM_W, H = IM_H;
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  // a grid, to show the distortion
  g.strokeStyle = '#9aa0a6'; g.lineWidth = 1;
  for (let x = 0.5; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0.5; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // a star in the middle
  g.fillStyle = '#000';
  const cx = W / 2, cy = H / 2, R = H * 0.28, sp = 36;
  for (let k = 0; k < sp; k += 2) { const a0 = 2 * Math.PI * k / sp, a1 = 2 * Math.PI * (k + 1) / sp; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a0, a1); g.closePath(); g.fill(); }
  // bars, three of each, at the corners and the middles of the sides, finer towards the corners
  const bars = (x, y, w, vertical) => { for (let b = 0; b < 3; b++) { if (vertical) g.fillRect(x + 2 * b * w, y, w, 6 * w); else g.fillRect(x, y + 2 * b * w, 6 * w, w); } };
  [[8, 8, 2], [W - 8 - 10, 8, 2], [8, H - 8 - 12, 2], [W - 8 - 10, H - 8 - 12, 2]].forEach(([x, y, w]) => { bars(x, y, w, true); bars(x + 12, y, w - 1, true); });
  [[W / 2 - 9, 6, 3], [W / 2 - 9, H - 6 - 18, 3], [6, H / 2 - 9, 3], [W - 6 - 18, H / 2 - 9, 3]].forEach(([x, y, w], i) => bars(x, y, w, i < 2));
  // colour squares: lateral colour shows at their edges
  [['#e34948', 0.2, 0.2], ['#1baf7a', 0.8, 0.2], ['#2a78d6', 0.2, 0.8], ['#eda100', 0.8, 0.8]].forEach(([c, u, v]) => { g.fillStyle = c; g.fillRect(u * W - 9, v * H - 9, 18, 18); });
  return cv;
}
function picturePlan(own) {
  if (own && imOwn) return imOwn;
  return pictureOf(chartCanvas());
}
function drawPicture(parent, pic, label) {
  const cv = h('canvas', { role: 'img', 'aria-label': label, class: 'rt-limsim' }), w = pic.w || pic.W, ht = pic.h || pic.H;
  cv.width = w; cv.height = ht;
  const img = new ImageData(w, ht);
  for (let q = 0; q < w * ht; q++) { img.data[q * 4] = toSrgb(pic.ch[0][q]); img.data[q * 4 + 1] = toSrgb(pic.ch[1][q]); img.data[q * 4 + 2] = toSrgb(pic.ch[2][q]); img.data[q * 4 + 3] = 255; }
  cv.getContext('2d').putImageData(img, 0, 0);
  parent.append(cv);
  return cv;
}
let imJob = null;
function imPending(body, key, start, redraw, label) {
  label = label || 'Forming the image';
  const el = h('p', { class: 'rt-lsub', role: 'status' }, label + '…');
  body.append(el);
  if (imJob && imJob.key === key) { imJob.el = el; return; }
  if (imJob) imJob.cancelled = true;
  const job = imJob = { key, el, cancelled: false };
  setTimeout(() => {
    if (job.cancelled) return;
    const plan = start();
    const step = () => {
      if (job.cancelled) return;
      const t = performance.now();
      let done = false;
      while (!done && performance.now() - t < 40) done = plan.next();
      if (done) {
        anaCache.set(key, plan.result());
        if (anaCache.size > 40) anaCache.delete(anaCache.keys().next().value);
        imJob = null;
        if (job.el.isConnected) redraw();
        return;
      }
      job.el.textContent = label + '… ' + Math.floor(100 * plan.done / plan.steps) + '%';
      setTimeout(step, 0);
    };
    step();
  }, 0);
}
function imsimView(body, A, P, st, key, redraw) {
  const c = A.c, chip = (on, label, fn, attrs) => h('button', Object.assign({ type: 'button', class: 'rt-lchip', 'aria-pressed': String(on), onclick: fn }, attrs || {}), label);
  if (!imsimTraceable(P)) { body.append(h('p', { class: 'rt-lsub' }, 'Image simulation takes a design round about its axis; this one has tilts, decentres, cylinders or freeforms.')); return; }
  const own = st.imPic === 'own' && !!imOwn;
  // where the picture goes: the whole field, or a patch about one of the design's fields
  if (!(st.imAt === 'whole' || (st.imAt >= 0 && st.imAt < c.fields.length))) st.imAt = 'whole';
  const whole = st.imAt === 'whole', S0 = A.Sp, rmsAt = f => { const sp = spotDiagram(A, f, 11); return isFinite(sp.rms) ? sp.rms : 0; };
  const lamF = S0.lam * A.fw, defPitch = f => Math.max(lamF / 2, rmsAt(f) / 3);
  if (!whole && !(st.imPitch > 0)) st.imPitch = +(1000 * defPitch(c.fields[st.imAt].deg)).toPrecision(2);
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
    const f = file.files && file.files[0]; if (!f) return;
    try {
      const bm = await createImageBitmap(f), cv = document.createElement('canvas'); cv.width = IM_W; cv.height = IM_H;
      const g = cv.getContext('2d'), s = Math.max(IM_W / bm.width, IM_H / bm.height);
      g.drawImage(bm, (IM_W - bm.width * s) / 2, (IM_H - bm.height * s) / 2, bm.width * s, bm.height * s);
      imOwn = pictureOf(cv); imOwnId++; st.imPic = 'own'; redraw();
    } catch (e) { st.imPic = 'chart'; redraw(); }
  } });
  body.append(h('div', { class: 'rt-lchips', role: 'group', 'aria-label': 'Picture' }, h('span', { class: 'rt-lsub' }, 'Picture'),
    chip(!own, 'Test chart', () => { st.imPic = 'chart'; redraw(); }),
    chip(own, imOwn ? 'Your picture' : 'Your picture…', () => { if (imOwn && !own) { st.imPic = 'own'; redraw(); } else file.click(); }, { title: 'Kept in this tab only: never saved with the bench or sent anywhere' }),
    ...(imOwn ? [h('button', { type: 'button', class: 'rt-link', onclick: () => file.click() }, 'Choose another')] : []), file));
  body.append(h('div', { class: 'rt-lchips', role: 'group', 'aria-label': 'Covers' }, h('span', { class: 'rt-lsub' }, 'Covers'),
    chip(whole, 'The whole field', () => { st.imAt = 'whole'; redraw(); }),
    ...c.fields.map((f, i) => chip(st.imAt === i, 'A patch at ' + anFmt(f.deg, 4) + FU, () => { st.imAt = i; st.imPitch = +(1000 * defPitch(f.deg)).toPrecision(2); redraw(); })),
    ...(whole ? [] : [h('label', { class: 'rt-lsub rt-limpitch' }, 'Pixel ', h('input', { type: 'number', min: String(+(1000 * lamF / 4).toPrecision(2)), step: 'any', value: String(st.imPitch), 'aria-label': 'Pixel size on the image, micrometres',
      onchange: e => { const v = +e.target.value; if (v > 0) { st.imPitch = Math.max(v, +(1000 * lamF / 4).toPrecision(2)); redraw(); } } }), ' µm')])));
  // a patch about the field point's image, moved in as far as it must be to lie within the largest field
  const pic = picturePlan(own), fAt = whole ? 0 : c.fields[st.imAt].deg, fmax = Math.max(...c.fields.map(f => Math.abs(f.deg)));
  const yAt = Math.abs(paraxHeight(S0, fAt)), rM = Math.abs(paraxHeight(S0, fmax)), hw = (IM_W - 1) / 2 * st.imPitch / 1000, hh = (IM_H - 1) / 2 * st.imPitch / 1000;
  const yIn = whole ? 0 : Math.min(yAt, Math.max(0, Math.sqrt(Math.max(0, rM * rM - hw * hw)) - hh));      // its far corners on the largest field
  const at = [0, (Math.sign(paraxHeight(S0, fmax)) || 1) * yIn], moved = !whole && yIn < yAt - 1e-9;
  const o = whole ? { grid: 4 } : { mode: 'patch', at, pitch: st.imPitch / 1000, grid: 3 };
  const k = key + '|imsim|' + (own ? 'own' + imOwnId : 'chart') + '|' + st.imAt + '|' + (whole ? '' : st.imPitch);
  if (!anaCache.has(k)) { imPending(body, k, () => imsimPlan(A, pic, o), redraw); return; }
  const R = anaCache.get(k), row = h('div', { class: 'rt-lpair' }), left = h('div'), right = h('div');
  row.append(left, right); body.append(row);
  left.append(h('h3', null, 'The picture'));
  drawPicture(left, pic, 'The picture, as the object');
  right.append(h('h3', null, 'As the design forms it'));
  const cv = drawPicture(right, R, 'The picture as the design forms it');
  plotCsv(cv, 'image simulation', ['x (mm)', 'y (mm)', 'R', 'G', 'B'], () => { const out = []; for (let j = 0; j < R.H; j++) for (let i = 0; i < R.W; i++) { const q = j * R.W + i; out.push([R.atOut[0] + (i - (R.W - 1) / 2) * R.pitch, R.atOut[1] + ((R.H - 1) / 2 - j) * R.pitch, R.ch[0][q], R.ch[1][q], R.ch[2][q]]); } return out; });
  right.append(plotSaveRow(cv));
  const geo = R.nodes.some(n => n.geometric), cols = ['R', 'G', 'B'].map((t, i) => t + ' ' + anFmt(R.nm[i], 5) + ' nm').join(', ');
  body.append(helpLine('The test chart as the design images it.', [(whole ? 'The picture fills the field: its corners at ' + anFmt(Math.max(...c.fields.map(f => Math.abs(f.deg))), 4) + FU + ', '
    : 'A patch about the image of ' + anFmt(fAt, 4) + FU + (moved ? ', moved in to lie within the largest field, ' : ', ')) + R.W + ' × ' + R.H + ' pixels of ' + um(R.pitch) + ' on the image. ' +
    (R.mono ? 'One wavelength, ' + anFmt(R.nm[0], 5) + ' nm, for every colour. ' : 'Each colour at the design’s wavelength nearest it: ' + cols + '. ') +
    'Moved by the distortion of each wavelength (lateral colour shows), dimmed by the relative illumination, and blurred by the PSF at ' + R.grid * R.grid + ' points, each turned to its place about the axis and blended between them' +
    (geo ? '; where a spot is too large for the PSF’s window, by the spot itself' : '') + '. In linear light, shown as sRGB; the CSV gives it in linear light, 1 the picture\u2019s white.'], 'rt-lsub'));
}
function seidelView(body, asm, P, F) {
  const sd = F.seidel, sps = surfaceParts(P), cols = ['SI', 'SII', 'SIII', 'SIV', 'SV', 'CL', 'CT'];
  body.append(h('h3', null, 'Third-order aberrations (Seidel sums, mm)'));
  body.append(helpLine('Seidel sums, surface by surface.', ['At ' + anFmt(primaryNm(asm.cond), 5) + ' nm over fields to ' + anFmt(F.fmax, 3) + FU + ', the colour terms from ' + anFmt(F.lo, 5) + ' to ' + anFmt(F.hi, 5) + ' nm. ' +
    'SI spherical, SII coma, SIII astigmatism, SIV Petzval, SV distortion; CL axial and CT lateral colour. Signs as in the usual convention: an uncorrected positive singlet has SI above 0.'], 'rt-lsub'));
  const tbl = h('table', { class: 'rt-ltable rt-lseidel' });
  tbl.append(h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Surface'), ...cols.map(c => h('th', { scope: 'col' }, c)))));
  const tb = h('tbody'), f = v => Math.abs(v) < 5e-13 ? '0' : v.toExponential(4).replace(/e\+0$/, '').replace(/e([+-])(\d)$/, 'e$1$2');
  sd.rows.forEach((r, i) => tb.append(h('tr', null, h('td', null, sps[i].kind === 'stop' ? 'STO' : String(i + 1)), ...cols.map(c => h('td', { class: 'mono' }, f(r[c]))))));
  tb.append(h('tr', { class: 'sum' }, h('td', null, 'Sum'), ...cols.map(c => h('td', { class: 'mono' }, f(sd.sum[c])))));
  tbl.append(tb);
  body.append(h('div', { class: 'rt-ltwrap' }, tbl));
}

/* ---------- Ghosts ---------- */
// each surface's coating, from its part (a lens's faces; any other surface bare)
function coatsOf(P) {
  // a mirror: its reflectance, as the bench takes it
  return P.surfaces.map(s => { const e = s.from && getEl(s.from.id); return e && s.mirror ? { mode: 'mirror', R: e.reflect === undefined ? 100 : e.reflect } : e && e.surfaces && e.surfaces[s.from.i] ? e.surfaces[s.from.i].coat || null : null; });
}
const coatKey = P => JSON.stringify(coatsOf(P));
const ghPct = v => v >= 0.01 ? anFmt(100 * v, 3) + '%' : v >= 1e-5 ? anFmt(1e6 * v, 3) + ' ppm' : v > 0 ? v.toExponential(2) : '0';
const ghLen = v => !isFinite(v) ? '∞' : Math.abs(v) < 1 ? um(v) : anFmt(v, 4) + ' mm';
function ghostView(body, A, P, G, st, redraw) {
  const sps = surfaceParts(P), name = i => sps[i].kind === 'stop' ? 'STO' : String(i + 1);
  body.append(h('h3', null, 'Ghosts: light reflected by one surface and back by an earlier one'));
  if (!G.ok) {
    body.append(h('p', { class: 'rt-lsub' }, ghostsTraceable(P) ? 'There are no two surfaces here to reflect between.' : 'Ghosts are followed in a centred design without mirrors, tilts or decentres; this one has some. On the bench, tick Follow weak reflections (ghosts) in the bench settings to follow every reflection there.'));
    return;
  }
  const L = G.ghosts.filter(g => g.R > 0);
  body.append(helpLine(L.length + (L.length === 1 ? ' ghost' : ' ghosts') + ' at ' + anFmt(G.nm, 5) + ' nm, the brightest first.', ['At ' + anFmt(G.nm, 5) + ' nm, ' + (A.finite ? 'object height ' : 'field ') + anFmt(G.deg, 4) + FU + ': ' + L.length + ' ghosts, the brightest against the image first. ' +
    'The image\u2019s own spot: RMS ' + um(G.main.rms) + ', the Airy disc ' + um(G.main.airy) + '. Each surface reflects as its coating does, square to it (bare glass by Fresnel). ' +
    'Against the image: the ghost\u2019s light over its area on the image, over the image\u2019s over its spot (each as an even disc), an estimate. Choose a ghost to see its rays in the layout.'], 'rt-lsub'));
  if (!L.length) return;
  if (!st.ghost || !L.some(g => g.a === st.ghost[0] && g.b === st.ghost[1])) st.ghost = [L[0].a, L[0].b];
  const tbl = h('table', { class: 'rt-ltable rt-lghost' });
  tbl.append(h('thead', null, h('tr', null, ...[['Off', 'The surface that reflects first, then the one that sends it on'], ['Reflects', 'Each surface\u2019s reflectance'], ['Reaching the image', 'The share of the light through the pupil that reaches the image this way'],
    ['Focus', 'Where it comes to a focus, from the image plane (paraxial; + beyond it)'], ['RMS on the image', 'Its rays\u2019 RMS radius on the image plane'], ['Against the image', 'Its irradiance on the image over the image\u2019s own'], ['Focus inside', 'Where it focuses within the design, if it does']].map(([t, tip]) => h('th', { scope: 'col', title: tip }, t)))));
  const tb = h('tbody');
  for (const g of L) {
    const on = st.ghost[0] === g.a && st.ghost[1] === g.b;
    const near = g.near ? (g.near.after ? anFmt(g.near.d, 3) + ' mm after ' + name(g.near.surf) : anFmt(g.near.d, 3) + ' mm from ' + name(g.near.surf) + (g.near.glass ? ', in glass' : '')) : '—';
    const warn = g.near && g.near.d < 1;
    tb.append(h('tr', { class: on ? 'on' : '' },
      h('td', null, h('button', { type: 'button', class: 'rt-link', 'aria-pressed': String(on), 'aria-label': 'Show the ghost off surface ' + name(g.a) + ' then ' + name(g.b) + ' in the layout', onclick: () => { st.ghost = [g.a, g.b]; redraw(); } }, name(g.a) + ' then ' + name(g.b))),
      h('td', { class: 'mono' }, ghPct(g.Ra) + ' × ' + ghPct(g.Rb)), h('td', { class: 'mono' }, ghPct(g.R * g.reach)), h('td', { class: 'mono' }, ghLen(g.focus)),
      h('td', { class: 'mono' }, g.n ? ghLen(g.rms) : '—'), h('td', { class: 'mono' }, g.rel > 0 ? g.rel.toExponential(2) : '—'), h('td', { class: warn ? 'warn' : '' }, near)));
  }
  tbl.append(tb);
  const wrap = h('div', { class: 'rt-ltwrap' }, tbl);
  body.append(wrap);
  // the chosen ghost on the image plane, with the image's own spot
  const g = L.find(q => q.a === st.ghost[0] && q.b === st.ghost[1]);
  const cell = h('div', { class: 'rt-lspot' }), cv = h('canvas', { role: 'img', 'aria-label': 'The ghost off surface ' + name(g.a) + ' then ' + name(g.b) + ' on the image plane: RMS radius ' + ghLen(g.rms) });
  cell.append(cv, h('div', { class: 'rt-lsub' }, h('b', null, name(g.a) + ' then ' + name(g.b)), ' on the image, ' + g.n + ' rays; the image\u2019s spot in grey'));
  body.append(h('div', { class: 'rt-lspots' }, cell));
  requestAnimationFrame(() => {
    const dpr = window.devicePixelRatio || 1, S = Math.max(160, Math.min(280, cell.clientWidth || 220));
    cv.width = S * dpr; cv.height = S * dpr; cv.style.width = S + 'px'; cv.style.height = S + 'px';
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = '#fff'; x.fillRect(0, 0, S, S); x.strokeStyle = 'rgba(0,0,0,0.15)'; x.strokeRect(0.5, 0.5, S - 1, S - 1);
    const c0 = G.main.c[0] || 0, c1 = G.main.c[1] || 0;
    let ext = Math.max(G.main.airy, Math.SQRT2 * G.main.rms) * 1.2;
    for (const [px, py] of g.pts) ext = Math.max(ext, Math.abs(px - c0), Math.abs(py - c1));
    ext *= 1.1;
    const k = (S / 2 - 6) / ext, X = v => S / 2 + (v - c0) * k, Y = v => S / 2 - (v - c1) * k;
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.arc(S / 2, S / 2, Math.max(1.5, Math.max(G.main.airy, Math.SQRT2 * G.main.rms) * k), 0, 2 * Math.PI); x.fill();
    x.fillStyle = WAVE_COLOURS[6];
    for (const [px, py] of g.pts) { x.beginPath(); x.arc(X(px), Y(py), 1.6, 0, 2 * Math.PI); x.fill(); }
  });
  plotCsv(cv, 'ghosts', ['first surface', 'second surface', 'reflectance first', 'reflectance second', 'share reaching the image', 'focus from image (mm)', 'paraxial height on image (mm)', 'RMS on image (mm)', 'against the image', 'focus inside, from surface', 'distance (mm)'],
    () => L.map(q => [name(q.a), name(q.b), q.Ra, q.Rb, q.R * q.reach, q.focus, q.yImg, q.rms, q.rel, q.near ? name(q.near.surf) : '', q.near ? q.near.d : '']));
  cell.append(plotSaveRow(cv));
  body.append(helpLine('Scaled to the ghost; one that focuses near a surface is marked.', ['The box is scaled to the ghost, about the image\u2019s centroid. A ghost that focuses within a millimetre of a surface is marked: its light is concentrated there, on a coating or a cement, and in a laser system can damage it.'], 'rt-lsub'));
}
