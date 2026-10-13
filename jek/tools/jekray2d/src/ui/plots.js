import { clamp } from '../core/constants.js';
import { fmtGHz, fmtLen } from '../core/format.js';
import { GLASS, glassKey, matLabel, refIndex } from '../core/glass.js';
import { RF_MAT } from '../core/rf.js';
import { deg, normMat, project } from '../state/project.js';
import { PACKS } from '../state/packs.js';
import { benchNms, getEl } from '../state/elements.js';
import { getCss, niceStep } from './render.js';
import { playing } from './sweeps.js';
import { pctTxt, stopSweepsFor } from './optimise.js';
import { bindSync, fid, h, numInput, panel, param, selectField, setFid, vs } from './panel.js';
import { coatingRows } from './panels.js';
import { diffractionLater } from '../engines/pd-cavity.js';
import { changed, downloadFile, safeFileName, toast } from './actions.js';
import { checkpoint } from './tabs.js';

/* ---------- Zooming a panel plot ----------
   Each plot of each element keeps its own window: a zoom factor and a centre for each
   axis, the centre as a fraction of the plot's full range. The wheel zooms about the
   cursor (Shift: across only, Alt: up and down only), dragging pans, a double click
   resets, and the buttons under the plot zoom one axis about the middle of the view. */
/* ---------- Axes: ticks and labels, shared by every plot ----------
   An axis is described by { kind, title, fmt }: kind 'len' (mm, shown in m, mm, µm or nm to
   suit the span), 'hz' (shown in GHz to Hz) or 'plain'; title names what is plotted, and fmt,
   if given, writes each tick's label itself. */
export const axisFont = () => '10px ' + getCss('--jek-mono');
function axisScale(kind, a, b) {
  const m = Math.max(Math.abs(a), Math.abs(b), Math.abs(b - a));
  if (kind === 'len') return m >= 2000 ? [1e-3, 'm'] : m >= 0.5 ? [1, 'mm'] : m >= 5e-4 ? [1e3, 'µm'] : [1e6, 'nm'];
  if (kind === 'hz') return m >= 1e9 ? [1e-9, 'GHz'] : m >= 1e6 ? [1e-6, 'MHz'] : m >= 1e3 ? [1e-3, 'kHz'] : [1, 'Hz'];
  if (kind === 's') return m >= 1 ? [1, 's'] : m >= 1e-3 ? [1e3, 'ms'] : m >= 1e-6 ? [1e6, '\u00b5s'] : [1e9, 'ns'];
  return [1, ''];
}
/* round-number ticks over [a, b], about `target` of them */
function axisTicks(a, b, spec, target) {
  const [k, unit] = axisScale(spec.kind, a, b);
  const A = a * k, B = b * k, span = B - A, ticks = [];
  if (!(span > 0) || !isFinite(span)) return { ticks, unit };
  const step = niceStep(span / Math.max(1, target)), dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  for (let i = Math.ceil(A / step - 1e-9); i * step <= B + step * 1e-9; i++) {
    const v = Math.abs(i) < 1e-9 ? 0 : i * step;
    ticks.push({ at: v / k, text: spec.fmt ? spec.fmt(v / k) : v.toFixed(dec) });
  }
  return { ticks, unit };
}
const axisTitle = (spec, unit) => [spec.title, unit].filter(Boolean).join(', ');
/* The plotting area inside a w x hgt canvas: room on the left for the up axis's labels,
   under it for the across axis's, and above it for the up axis's title, with the top right
   corner kept clear for the button that matches plots to each other */
export function plotArea(c, w, hgt, yr, sy, opt = {}) {
  c.font = axisFont();
  // measured over the ticks drawAxes will draw (as many as the height takes)
  const t = opt.top !== undefined ? opt.top : 26, b = 18;
  let lw = 0;
  for (const k of axisTicks(yr[0], yr[1], sy, Math.max(4, Math.floor((hgt - t - b) / 20))).ticks) lw = Math.max(lw, c.measureText(k.text).width);
  const l = Math.ceil(lw) + 8;
  return { l, t, w: Math.max(10, w - l - (opt.right !== undefined ? opt.right : 6)), h: Math.max(10, hgt - t - b) };
}
export function drawAxes(c, A, xr, yr, sx, sy, opt = {}) {
  c.save();
  c.font = axisFont(); c.lineWidth = 1; c.setLineDash([]);
  const ink = getCss('--jek-ink-soft'), right = A.l + A.w, bottom = A.t + A.h;
  const X = v => A.l + (v - xr[0]) / ((xr[1] - xr[0]) || 1) * A.w;
  const Y = v => bottom - (v - yr[0]) / ((yr[1] - yr[0]) || 1) * A.h;
  const tx = axisTicks(xr[0], xr[1], sx, Math.max(2, Math.floor(A.w / 60)));
  const ty = axisTicks(yr[0], yr[1], sy, Math.max(4, Math.floor(A.h / 20)));
  // faint grid at the ticks, then the axis lines and the ticks themselves
  if (!opt.noGrid) {
    c.strokeStyle = 'rgba(0,0,0,0.06)'; c.beginPath();
    for (const t of tx.ticks) { const p = Math.round(X(t.at)) + 0.5; if (p > A.l + 1 && p < right - 1) { c.moveTo(p, A.t); c.lineTo(p, bottom); } }
    for (const t of ty.ticks) { const p = Math.round(Y(t.at)) + 0.5; if (p > A.t + 1 && p < bottom - 1) { c.moveTo(A.l, p); c.lineTo(right, p); } }
    c.stroke();
  }
  const x0 = Math.round(A.l) - 0.5, yB = Math.round(bottom) + 0.5;
  c.strokeStyle = 'rgba(0,0,0,0.4)'; c.beginPath();
  c.moveTo(x0, A.t); c.lineTo(x0, yB); c.lineTo(right, yB);
  for (const t of tx.ticks) { const p = Math.round(X(t.at)) + 0.5; if (p >= A.l - 1 && p <= right + 1) { c.moveTo(p, yB); c.lineTo(p, yB + 4); } }
  for (const t of ty.ticks) { const p = Math.round(Y(t.at)) + 0.5; if (p >= A.t - 1 && p <= bottom + 1) { c.moveTo(x0, p); c.lineTo(x0 - 4, p); } }
  c.stroke();
  c.fillStyle = ink;
  // across: the title at the right end, tick labels wherever they fit clear of it and each other
  const titleX = axisTitle(sx, tx.unit), tw = titleX ? c.measureText(titleX).width : 0;
  c.textBaseline = 'alphabetic';
  if (titleX) { c.textAlign = 'right'; c.fillText(titleX, right, yB + 14); }
  const limit = titleX ? right - tw - 8 : c.canvas.clientWidth || right + 6;
  let last = -Infinity; c.textAlign = 'center';
  for (const t of tx.ticks) {
    const p = X(t.at), half = c.measureText(t.text).width / 2;
    if (p < A.l - 1 || p > right + 1 || p - half < 0 || p + half > limit || p - half < last + 6) continue;
    c.fillText(t.text, p, yB + 14); last = p + half;
  }
  // up: labels to the left of the axis, the title above it
  c.textAlign = 'right'; c.textBaseline = 'middle'; last = Infinity;
  for (const t of ty.ticks) {
    const p = Y(t.at);
    if (p < A.t - 1 || p > bottom + 1 || p + 5 > last - 2) continue;
    c.fillText(t.text, x0 - 5, p); last = p - 5;
  }
  const titleY = axisTitle(sy, ty.unit);
  if (titleY && A.t >= 16) {
    // clear of the top tick's label, and of the sync button in the corner: a long title shrinks, then is cut short
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    const room = (c.canvas.clientWidth || right + 6) - 30;
    let t = titleY, px = parseFloat(c.font) || 11;
    while (c.measureText(t).width > room && px > 8.5) { px -= 0.5; c.font = c.font.replace(/[\d.]+px/, px + 'px'); }
    while (c.measureText(t + '\u2026').width > room && t.length > 4) t = t.slice(0, -1);
    c.fillText(t === titleY ? t : t.trimEnd() + '\u2026', 2, A.t - 8);
  }
  c.restore();
}

/* ---------- Matching one plot's axes on the others like it ----------
   A plot's canvas carries _sync (what it shows, its zoom, how to redraw it) and, once drawn
   with data, _full: the whole range of each axis in the units its ticks show. The window of
   one plot is then copied, in those units, to every other open plot of the same kind, which
   may mean zooming a small pattern out past its own data so both show the same span. */
const SYNC_SVG = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.2 6.3A5.3 5.3 0 0 0 3.6 4.4L2.4 5.6"/><path d="M2.4 2.4v3.2h3.2"/><path d="M2.8 9.7a5.3 5.3 0 0 0 9.6 1.9l1.2-1.2"/><path d="M13.6 13.6v-3.2h-3.2"/></svg>';
const SYNC_NAMES = { 'diff-map': 'irradiance maps', 'diff-psf': 'profiles', 'diff-mtf': 'MTF plots', 'diff-ee': 'enclosed energy plots',
  'cav-scan': 'resonance scans', 'ray-power': 'ray power plots', 'ray-phase': 'phase plots',
  'ray-wave': 'wavefront plots', 'ray-fan': 'ray fans', 'ray-angle': 'arrival angle plots', 'ray-opl': 'optical path plots',
  'aber-spots': 'spot diagrams', 'aber-fan': 'ray fans across the field', 'aber-wave': 'wavefronts across the field', 'aber-curv': 'field curves', 'aber-dist': 'distortion plots', 'aber-rms': 'RMS wavefront plots' };
export function plotFrame(cv, getKey, getZ, redraw) {
  cv._sync = { getKey, getZ, redraw };
  const btn = h('button', { class: 'rt-sync', type: 'button', onclick: () => syncFrom(cv) });
  btn.hidden = true;
  btn.innerHTML = SYNC_SVG;
  cv._syncBtn = btn;
  // Freeze: the axes keep the ranges they have now, so a plot holds still while a sweep plays
  // instead of fitting itself to every step; zoom and pan still work within them
  const fz = h('button', { class: 'rt-sync rt-freeze', type: 'button' });
  fz.innerHTML = LOCK_SVG;
  const showFz = () => {
    const Z = getZ(), on = !!(Z && Z.freeze);
    fz.setAttribute('aria-pressed', on ? 'true' : 'false');
    fz.title = on ? 'Unfreeze the axes: fit them to the plot again' : 'Freeze the axes: keep this scale while sweeps play';
  };
  fz.addEventListener('click', () => {
    const Z = getZ();
    if (!Z) return;
    if (Z.freeze) delete Z.freeze;
    // with the brightness scale too, where the plot has one (a map's colours, a profile's peak)
    else if (cv._full) Z.freeze = { x: cv._full.x.slice(), y: cv._full.y.slice(), pk: cv._full.pk, top: cv._full.top };
    else return;
    showFz(); redraw();
  });
  bindSync(fz, showFz);
  cv._fzSync = showFz;                  // and after each draw: the plot may now be another view
  const box = h('div', { class: 'rt-plot' }, cv, h('div', { class: 'rt-plot-tools' }, btn, fz));
  // a plot is drawn to the width it had then; when a panel is pinned, unpinned or resized
  // that width changes, and a canvas left at the old one is stretched to fit
  let drawnW = -1;
  new ResizeObserver(() => {
    const w = cv.clientWidth;
    if (w && Math.abs(w - drawnW) > 0.5) { drawnW = w; redraw(); }
  }).observe(box);
  return box;
}
const plotCanvases = () => [...document.querySelectorAll('.rt-panel canvas')].filter(c => c._sync && c.offsetParent !== null);
function syncFrom(cv) {
  const key = cv._sync.getKey(), F = cv._full, Z = cv._sync.getZ();
  if (!F || !Z) return;
  const [xa, xb] = zoomRange(Z, 'x', F.x[0], F.x[1]), [ya, yb] = zoomRange(Z, 'y', F.y[0], F.y[1]);
  let n = 0;
  for (const o of plotCanvases()) {
    if (o === cv || !o._full || o._sync.getKey() !== key) continue;
    const P = o._full, Zo = o._sync.getZ();
    if (!Zo) continue;
    const fit = (lo, hi, a, b, ax) => {
      if (!(hi > lo) || !(b > a)) return;
      Zo['k' + ax] = clamp((hi - lo) / (b - a), 1 / ZOOM_MAXK, ZOOM_MAXK);
      Zo['c' + ax] = ((a + b) / 2 - lo) / (hi - lo);
    };
    const Px = Zo.freeze ? Zo.freeze.x : P.x, Py = Zo.freeze ? Zo.freeze.y : P.y;
    fit(Px[0], Px[1], xa, xb, 'x'); fit(Py[0], Py[1], ya, yb, 'y');
    o._sync.redraw(); n++;
  }
  if (n) toast('Matched ' + n + ' other plot' + (n > 1 ? 's' : '') + ' to this one’s axes');
}
/* the button shows on a plot only while another open panel shows the same kind of plot */
let syncBtnsQueued = false;
export function updateSyncButtons() {
  if (syncBtnsQueued) return;
  syncBtnsQueued = true;
  requestAnimationFrame(() => {
    syncBtnsQueued = false;
    const all = plotCanvases(), count = new Map();
    for (const c of all) { const k = c._full && c._sync.getKey(); if (k) count.set(k, (count.get(k) || 0) + 1); }
    for (const c of all) {
      if (c._fzSync) c._fzSync();
      const k = c._sync.getKey(), on = !!c._full && count.get(k) > 1;
      c._syncBtn.hidden = !on;
      if (on) c._syncBtn.title = 'Match the other open ' + (SYNC_NAMES[k] || 'plots like this') + ' to this one’s axes';
    }
  });
}

const ZOOM_MAXK = 1000;
const LOCK_SVG = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/></svg>';
export function plotZoom(el, plot) {
  const s = vs(el), z = s.zoom || (s.zoom = {});
  return z[plot] || (z[plot] = { kx: 1, ky: 1, cx: 0.5, cy: 0.5 });
}
/* The visible part of [lo, hi] on one axis, keeping the window inside the full range */
export function zoomRange(Z, axis, lo, hi) {
  // frozen axes keep the range they had when frozen, whatever the data does now
  if (Z.freeze && Z.freeze[axis]) [lo, hi] = Z.freeze[axis];
  // below 1 the window is wider than the data (a plot matched to a bigger one): it then
  // keeps all of the data in view rather than all of the view on the data
  const k = Z['k' + axis], half = 0.5 / k;
  Z['c' + axis] = clamp(Z['c' + axis], Math.min(half, 1 - half), Math.max(half, 1 - half));
  const c = Z['c' + axis], r = hi - lo;
  return [lo + (c - half) * r, lo + (c + half) * r];
}
const zoomed = Z => Z.kx !== 1 || Z.ky !== 1;
/* Zoom one axis by f, keeping the point at fraction p of the view where it is */
function zoomAxis(Z, axis, f, p) {
  const k0 = Z['k' + axis], k1 = clamp(k0 * f, Math.min(1, k0), ZOOM_MAXK);
  const at = Z['c' + axis] - 0.5 / k0 + p / k0;        // that point, as a fraction of the full range
  Z['k' + axis] = k1;
  Z['c' + axis] = at - p / k1 + 0.5 / k1;
}
/* Wheel, drag and double click on a plot canvas, plus the buttons under it. getZ gives the
   zoom state of whatever the canvas is showing now; the drawing code leaves the plot's
   area in cv._area as { l, t, w, h } in CSS pixels. */
/* Every plot saves as a picture, and as the numbers behind it: each draw leaves them on the
   canvas (a function, so they are only worked out when asked for) */
export function plotCsv(cv, name, cols, rows) { cv._csv = { name, cols, rows }; if (cv._saveRow) cv._saveRow.hidden = false; }
function csvText(D) {
  const cell = v => typeof v === 'number' ? (isFinite(v) ? String(+v.toPrecision(10)) : '') : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const rows = typeof D.rows === 'function' ? D.rows() : D.rows;
  return [D.cols.map(cell).join(','), ...rows.map(r => r.map(cell).join(','))].join('\n') + '\n';
}
function savePlot(cv, kind) {
  const D = cv._csv, base = safeFileName(project.name) + ' - ' + safeFileName(D ? D.name : 'plot');
  if (kind === 'csv') {
    if (!D) { toast('That plot has no numbers to save yet.', true); return; }
    downloadFile(base + '.csv', new Blob([csvText(D)], { type: 'text/csv' }));
    toast('Saved ' + base + '.csv');
    return;
  }
  // on the panel's own colour: the plot itself is drawn on nothing
  const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
  const g = c.getContext('2d'); g.fillStyle = getCss('--jek-panel') || '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(cv, 0, 0);
  c.toBlob(b => { if (!b) { toast('The plot could not be saved here.', true); return; } downloadFile(base + '.png', b); toast('Saved ' + base + '.png'); }, 'image/png');
}
function plotSaveBtns(cv) {
  const b = (t, k, title) => h('button', { class: 'rt-zb', type: 'button', title, onclick: () => savePlot(cv, k) }, t);
  return h('span', { class: 'rt-save' }, b('PNG', 'png', 'Save this plot as a picture'), b('CSV', 'csv', 'Save the numbers behind this plot'));
}
export function plotSaveRow(cv, hidden) { const r = h('div', { class: 'rt-zoom rt-saverow' }, plotSaveBtns(cv)); r.hidden = !!hidden; cv._saveRow = r; return r; }
export function zoomControls(cv, getZ, redraw, yFromBase) {
  // curves that rise from zero stretch up and down from their baseline, wherever the cursor is
  const yAt = p => yFromBase && yFromBase() ? 0 : p;
  const area = () => cv._area || { l: 0, t: 0, w: cv.clientWidth || 1, h: cv.clientHeight || 1 };
  cv.style.cursor = 'crosshair';
  cv.addEventListener('wheel', e => {
    const Z = getZ(); if (!Z) return;
    e.preventDefault();
    const A = area(), r = cv.getBoundingClientRect();
    const px = clamp((e.clientX - r.left - A.l) / A.w, 0, 1), py = clamp(1 - (e.clientY - r.top - A.t) / A.h, 0, 1);
    const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
    if (!e.altKey) zoomAxis(Z, 'x', f, px);
    if (!e.shiftKey) zoomAxis(Z, 'y', f, yAt(py));
    redraw();
  }, { passive: false });
  let drag = null;
  cv.addEventListener('pointerdown', e => {
    const Z = getZ(); if (!Z || !zoomed(Z)) return;
    drag = { x: e.clientX, y: e.clientY, cx: Z.cx, cy: Z.cy };
    cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing';
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const Z = getZ(), A = area();
    Z.cx = drag.cx - (e.clientX - drag.x) / (A.w * Z.kx);
    Z.cy = drag.cy + (e.clientY - drag.y) / (A.h * Z.ky);
    redraw();
  });
  const end = () => { drag = null; cv.style.cursor = 'crosshair'; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('dblclick', () => { const Z = getZ(); if (!Z) return; Object.assign(Z, { kx: 1, ky: 1, cx: 0.5, cy: 0.5 }); redraw(); });
  const btn = (text, title, fn) => h('button', { class: 'rt-zb', type: 'button', title, onclick: () => { const Z = getZ(); if (Z) { fn(Z); redraw(); } } }, text);
  return h('div', { class: 'rt-zoom', title: 'Scroll on the plot to zoom about the cursor (Shift: across only, Alt: up and down only), drag to pan, double-click to reset' },
    h('span', null, 'Across'),
    btn('\u2212', 'Zoom out across', Z => zoomAxis(Z, 'x', 1 / 1.5, 0.5)),
    btn('+', 'Zoom in across', Z => zoomAxis(Z, 'x', 1.5, 0.5)),
    h('span', null, 'Up'),
    btn('\u2212', 'Zoom out up and down', Z => zoomAxis(Z, 'y', 1 / 1.5, yAt(0.5))),
    btn('+', 'Zoom in up and down', Z => zoomAxis(Z, 'y', 1.5, yAt(0.5))),
    btn('Reset', 'Show the whole plot', Z => Object.assign(Z, { kx: 1, ky: 1, cx: 0.5, cy: 0.5 })),
    plotSaveBtns(cv));
}

const MAGMA = [[0, 0, 0, 4], [0.13, 28, 16, 68], [0.25, 79, 18, 123], [0.38, 129, 37, 129], [0.5, 181, 54, 122],
  [0.63, 229, 80, 100], [0.75, 251, 135, 97], [0.88, 254, 194, 135], [1, 252, 253, 191]];
export function magma(v) {
  v = Math.min(1, Math.max(0, v));
  let i = 1; while (i < MAGMA.length - 1 && MAGMA[i][0] < v) i++;
  const [a, ...c0] = MAGMA[i - 1], [b, ...c1] = MAGMA[i], t = (v - a) / (b - a);
  return c0.map((c, k) => Math.round(c + (c1[k] - c) * t));
}
/* While sweeps play, a screen's irradiance keeps the brightest scale it has shown, so light
   that dims across the whole spot (a Michelson's port going dark) dims on the plot rather
   than being scaled back up to fill it; once they stop, each plot scales to itself again */
function holdScale(el, which, v) {
  const st = vs(el);
  if (!playing.size) { st.hold = null; return v; }
  st.hold = st.hold || {};
  st.hold[which] = Math.max(st.hold[which] || 0, v);
  return st.hold[which];
}
export function diffractionSection(el) {
  panel.append(h('h3', null, 'Diffraction'));
  const tabs = h('div', { class: 'rt-inline', style: 'margin-bottom:0.4rem;flex-wrap:wrap;column-gap:0.8rem;row-gap:0.2rem' });
  const cv = h('canvas', { style: 'width:100%;display:block' });
  const scaleRow = h('div', { class: 'rt-rows', style: 'margin-bottom:0.4rem' },
    selectField('Map scale', [['lin', 'Linear'], ['log', 'Logarithmic, 30 dB']], () => el.mapScale, v => { el.mapScale = v; }, { rebuild: false }));
  const box = h('div', { class: 'rt-readout' });
  const views = [['map', 'Irradiance'], ['phase', 'Phase'], ['pol', 'Polarisation'], ['psf', 'Profiles'], ['mtf', 'MTF'], ['ee', 'Enclosed energy']];
  for (const [key, text] of views) tabs.append(h('button', { class: 'rt-link', type: 'button', onclick: () => { vs(el).diffView = key; refresh(); } }, text));
  const keyBox = h('div', { class: 'rt-diffkey' });
  const refresh = () => {
    const pv = vs(el).diffView === 'phase' || vs(el).diffView === 'pol';
    keyBox.style.display = pv ? '' : 'none';
    const { D, busy } = diffractionLater(el);
    views.forEach(([key], i) => {
      tabs.children[i].style.fontWeight = vs(el).diffView === key ? '700' : '600';
      tabs.children[i].style.textDecoration = vs(el).diffView === key ? 'underline' : 'none';
    });
    scaleRow.style.display = vs(el).diffView === 'map' ? '' : 'none';
    cv.style.opacity = busy && !playing.size ? '0.5' : '1';      // while sweeps play, each field shows as it arrives
    if (!D) {
      drawDiff(cv, null, el);
      box.replaceChildren(h('p', { class: 'note' }, busy ? 'Computing the field\u2026' :
        'No beam reaches the front of this screen. The field comes from Gaussian sources and from ray fans with a width or a divergence: a single ray has no aperture to diffract.'));
      return;
    }
    drawDiff(cv, D, el);
    const two = !D.symmetric;
    const rows2 = [];
    if (pv) keyBox.replaceChildren(...diffKey(vs(el).diffView));
    if (vs(el).diffView === 'phase') {
      rows2.push(['Phase of', D.launches > 1 ? 'the strongest beam\u2019s laser' : 'the light'], ['Along', 'its polarisation at its brightest point']);
    }
    if (D.NA) rows2.push(['Numerical aperture', (+D.NA.toPrecision(4)) + ' (f/' + (+(1 / (2 * D.NA)).toPrecision(3)) + ')']);
    rows2.push(['Strehl ratio', D.strehl === null ? 'n/a' : String(+D.strehl.toPrecision(4))]);
    rows2.push(['Peak irradiance', (+D.peak.toPrecision(4)) + ' /mm\u00b2 per unit power' + (D.lasers > 1 && D.laser ? ' of ' + D.laser.name : '')]);
    rows2.push(['Power arriving', pctTxt(100 * D.power)]);
    if (D.interference !== null) rows2.push(['Interference', (+(100 * D.interference).toPrecision(4)) + '% of the incoherent sum']);
    if (D.visibility !== null) rows2.push(['Fringe visibility', String(+D.visibility.toPrecision(3))]);
    if (D.vector) {
      rows2.push(['Vector focus at NA', String(+D.vector.NA.toPrecision(3)) + (D.vector.route.includes('traced') ? ', pupil traced' : ', pupil from the field')]);
      rows2.push(['Energy along the axis', (100 * D.vector.axialShare).toPrecision(3) + '%']);
    }
    if (D.stokes) {
      const f = v => (v >= 0 ? '+' : '\u2212') + Math.abs(v).toFixed(3);
      rows2.push(['Degree of polarisation', String(+D.dop.toPrecision(4))]);
      rows2.push(['Stokes S1, S2, S3 / S0', f(D.stokes[1]) + ', ' + f(D.stokes[2]) + ', ' + f(D.stokes[3])]);
    }
    rows2.push(two ? ['Beam radius w (in, out of plane)', fmtLen(D.wx) + ', ' + fmtLen(D.wy)] : ['Beam radius w', fmtLen(D.wx)]);
    if (D.airy) rows2.push(['Airy radius', fmtLen(D.airy)]);
    rows2.push(two ? ['Width at half maximum', fmtLen(D.fwhmX) + ', ' + fmtLen(D.fwhmY)] : ['Width at half maximum', D.fwhm ? fmtLen(D.fwhm) : 'n/a']);
    rows2.push(['Radius holding 80%', fmtLen(D.ee80)]);
    const f = el.mtfFreq;
    rows2.push(['MTF at ' + (+f.toPrecision(4)) + ' lp/mm', two ? (+D.mtfAt(f).toPrecision(3)) + ', ' + (+D.mtfAtY(f).toPrecision(3)) : String(+D.mtfAt(f).toPrecision(3))]);
    rows2.push(['MTF drops to 0.5 at', two ? (+D.mtf50.toPrecision(4)) + ', ' + (+D.mtf50Y.toPrecision(4)) + ' lp/mm' : (+D.mtf50.toPrecision(4)) + ' lp/mm']);
    if (D.cutoff) rows2.push(['Cut-off frequency', (+D.cutoff.toPrecision(4)) + ' lp/mm']);
    const notes = [];
    if (D.vector) notes.push('The focus is steep, so these figures come from the vector field there: the Rayleigh\u2013Sommerfeld integral from the light leaving the last surface, taken ray by ray through that surface (or from the field after a flat one), with the part of the field along the axis included. The paraxial step\u2019s quadratic is not the sphere the light converges on beyond NA 0.3 or so. The Strehl ratio is against the same pupil with its wavefront made perfect.');
    notes.push(two ? 'A 2D field, carrying its polarisation at every point: pairs of figures are in the bench plane, then out of it, and the MTF is from the line spread in each direction. S1 is the bench-plane polarisation against the out-of-plane, S2 the same at 45\u00b0, S3 the circular part, positive right-handed.'
      : 'A round field, so these are the full two-dimensional figures. Its polarisation is the same across the beam; choose \u201cAlways 2D\u201d on the source to follow polarisation point by point.');
    if (D.fan) notes.push('The source is a ray fan, taken as a uniform pupil.');
    if (D.lasers > 1 && D.laser) notes.push('Light from ' + D.lasers + ' lasers arrives here, each weighed by its power: the map and figures are per unit power of ' + D.laser.name + ' (' + (+D.laser.mW.toPrecision(4)) + ' mW), the strongest here, the others in proportion to theirs.');
    if (D.arrivals > 1) notes.push(D.arrivals + ' beams arrive here. ' + (D.coherent
      ? 'Those from the same launch add as fields, with their phases, so the map shows their interference' + (D.launches > 1 ? '; separate launches (another source, wavelength or an unpolarised beam\u2019s other half) add as intensities' : '') + '. The profiles, Strehl ratio and MTF are for the strongest beam alone.'
      : 'They come from separate launches, so the map adds their intensities; the figures are for the strongest.'));
    if (D.fine) notes.push('Some fringes here are finer than three map pixels, so the map can alias them: the powers stay right, the picture may not.');
    if (D.tilt > 1) notes.push('The screen is tilted ' + (+D.tilt.toPrecision(3)) + '\u00b0 to the beam: the map is the beam\u2019s cross-section projected onto it, without the extra spread along the tilt.');
    if (el.type === 'mirror') notes.push('The field is the light arriving, on the plane where it meets the mirror: before it reflects, and without the mirror\u2019s curvature.');
    else if (D.curved) notes.push('The screen\u2019s curvature is not included in the field.');
    if (D.coarse.length) notes.push(D.coarse.map(id => (getEl(id) || {}).name).join(', ') + ' has detail finer than three grid samples, so its diffraction here is only roughly right: raise the source\u2019s grid points.');
    if (D.steep.length) notes.push('The wavefront after ' + D.steep.map(id => (getEl(id) || {}).name).join(', ') + ' turns faster than the grid can follow: raise the source\u2019s grid points.');
    if (vs(el).diffView === 'phase') notes.unshift('The phase of the field across the screen, \u2212\u03c0 to \u03c0 as hue, brightness by its amplitude: taken along the polarisation of its brightest point, whose phase is zero. A beam meeting the screen at an angle shows tilt fringes; a diverging or converging one, rings of its curvature; a vortex, its turns of phase round a dark core.' + (D.launches > 1 ? ' Only the strongest laser\u2019s light has a phase here; the others add to the irradiance alone.' : ''));
    if (vs(el).diffView === 'pol') notes.unshift('The polarisation at each point: the colour is how circular it is (S3/S0: red right-handed, blue left-handed, white linear), its brightness the irradiance, and each ellipse the shape the field traces there, its long axis the direction of the polarisation (across the map is in the bench plane, p; up it, out of the plane, s). Separate lasers add as Stokes parameters, so where they overlap the light is partly polarised and the ellipses shrink by its degree of polarisation.');
    if (busy) notes.push('Updating\u2026');
    box.replaceChildren(h('dl', null, ...rows2.flatMap(([a, b2]) => [h('dt', null, a), h('dd', null, b2)])),
      ...notes.map(t => h('p', { class: 'note' }, t)));
  };
  const getZ = () => plotZoom(el, vs(el).diffView), redraw = () => drawDiff(cv, diffractionLater(el).D, el);
  panel.append(tabs, scaleRow, plotFrame(cv, () => 'diff-' + vs(el).diffView, getZ, redraw), keyBox,
    zoomControls(cv, getZ, redraw, () => !['map', 'phase', 'pol'].includes(vs(el).diffView)), box);
  bindSync(cv, refresh);
}

/* phase as hue round the circle, amplitude as brightness */
function phaseRgb(ph, a) {
  const h = (ph / (2 * Math.PI) + 1) % 1, f = k => { const t = (k + h * 6) % 6; return Math.max(0, Math.min(1, Math.min(t, 4 - t))); };
  const v = Math.max(0, Math.min(1, a));
  return [f(5), f(3), f(1)].map(x => Math.round(255 * v * (0.15 + 0.85 * x)));
}
/* how circular the light is (S3/S0: -1 blue, left-handed; 0 white, linear; +1 red, right-handed), by its brightness */
function polRgb(c, a) {
  c = Math.max(-1, Math.min(1, c || 0)); const v = Math.max(0, Math.min(1, a));
  const rgb = c >= 0 ? [235, 235 - 175 * c, 235 - 195 * c] : [235 + 190 * c, 235 + 120 * c, 235];
  return rgb.map(x => Math.round(x * v));
}
/* the key under the phase and polarisation maps */
function diffKey(view) {
  const bar = document.createElement('canvas'); bar.width = 240; bar.height = 1;
  const g = bar.getContext('2d'), im = g.createImageData(240, 1);
  for (let i = 0; i < 240; i++) { const t = i / 239, q = view === 'phase' ? phaseRgb(-Math.PI + 2 * Math.PI * t, 1) : polRgb(2 * t - 1, 1); im.data.set([q[0], q[1], q[2], 255], i * 4); }
  g.putImageData(im, 0, 0);
  const ticks = view === 'phase' ? [[0, '\u2212\u03c0'], [0.5, '0'], [1, '+\u03c0']] : [[0, 'left circular'], [0.5, 'linear'], [1, 'right circular']];
  return [bar, h('div', { class: 'tk' }, ...ticks.map(([f, t]) => h('span', { style: 'left:' + (100 * f) + '%' }, t)))];
}
function drawDiff(cv, D, el) {
  const dpr = window.devicePixelRatio || 1, view = vs(el).diffView, Z = plotZoom(el, view);
  const w = cv.clientWidth || 280, square = ['map', 'phase', 'pol'].includes(view);
  const c = cv.getContext('2d');
  cv._full = null; cv._csv = null;
  updateSyncButtons();
  const size = hgt => {
    cv.style.height = hgt + 'px';
    cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, hgt);
  };
  if (!D) { size(square ? Math.round(w) : 150); return; }
  if (square) {
    // irradiance on the screen: along it (in the bench plane) across, out of the plane up,
    // both from the middle of the map
    const half = 0.5 * (D.map.u1 - D.map.u0), vh = 0.5 * (D.map.v1 - D.map.v0);
    const [xa, xb] = zoomRange(Z, 'x', -half, half), [ya, yb] = zoomRange(Z, 'y', -vh, vh);
    const sx = { kind: 'len', title: 'along' }, sy = { kind: 'len', title: 'out of the plane' };
    const A0 = plotArea(c, w, 100, [ya, yb], sy);
    const side = Math.max(40, w - A0.l - 6), hgt = side + A0.t + 18;
    size(hgt);
    const A = { l: A0.l, t: A0.t, w: side, h: side };
    cv._area = A; cv._full = { x: [-half, half], y: [-vh, vh] };
    const M = D.map.n, img = c.createImageData(M, M);
    plotCsv(cv, el.name + ' irradiance map', ['along_mm', 'out_of_plane_mm', 'irradiance', 'incoherent'], () => {
      const r = [];
      for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) r.push([-half + (i + 0.5) * 2 * half / M, -vh + (j + 0.5) * 2 * vh / M, D.map.v[j * M + i], D.map.inc[j * M + i]]);
      return r;
    });
    // scaled to its own peak, but never above what the beams would give without interfering,
    // so a dark port shows dark rather than its rounding error blown up
    let pk = 0, pi = 0; for (let i = 0; i < D.map.v.length; i++) { pk = Math.max(pk, D.map.v[i]); pi = Math.max(pi, D.map.inc[i]); }
    pk = holdScale(el, 'map', Math.max(pk, 0.02 * pi));
    if (Z.freeze && Z.freeze.pk) pk = Z.freeze.pk;
    cv._full.pk = pk;
    const log = el.mapScale === 'log', P = D.map;
    let pa = 0; if (view === 'phase' && P.pa) for (let i = 0; i < P.pa.length; i++) pa = Math.max(pa, P.pa[i]);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const q = j * M + i, o = ((M - 1 - j) * M + i) * 4;
      let rgb;
      if (view === 'phase' && P.ph) rgb = phaseRgb(P.ph[q], Math.sqrt(P.pa[q] / (pa || 1)));
      else if (view === 'pol' && P.s3) rgb = polRgb(P.s3[q] / (P.v[q] || 1), Math.sqrt(P.v[q] / (pk || 1)));
      else {
        let v = P.v[q] / (pk || 1);
        if (log) v = Math.max(0, 1 + Math.log10(Math.max(v, 1e-12)) / 3);
        rgb = magma(v);
      }
      img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255;
    }
    const off = document.createElement('canvas'); off.width = M; off.height = M;
    off.getContext('2d').putImageData(img, 0, 0);
    // the window in fractions of the map; past its edges (a map matched to a bigger one) is
    // outside the field computed, drawn as its darkest colour with the map's edge dashed
    const ua = (xa + half) / (2 * half), ub = (xb + half) / (2 * half), va = (ya + vh) / (2 * vh), vb = (yb + vh) / (2 * vh);
    const U0 = Math.max(0, ua), U1 = Math.min(1, ub), V0 = Math.max(0, va), V1 = Math.min(1, vb);
    const dx = u => A.l + (u - ua) / (ub - ua) * side, dy = v => A.t + (vb - v) / (vb - va) * side;
    c.fillStyle = 'rgb(' + magma(0).join(',') + ')';
    c.fillRect(A.l, A.t, side, side);
    c.imageSmoothingEnabled = !zoomed(Z) || M / Z.kx > side / 3;     // show the samples once they are big
    if (U1 > U0 && V1 > V0) c.drawImage(off, U0 * M, (1 - V1) * M, (U1 - U0) * M, (V1 - V0) * M, dx(U0), dy(V1), dx(U1) - dx(U0), dy(V0) - dy(V1));
    if (ua < 0 || ub > 1 || va < 0 || vb > 1) {
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.setLineDash([3, 3]);
      c.strokeRect(dx(U0) + 0.5, dy(V1) + 0.5, dx(U1) - dx(U0) - 1, dy(V0) - dy(V1) - 1); c.setLineDash([]);
    }
    if (view === 'pol' && D.map.s1) {
      // an ellipse every few pixels where there is light: the shape the field traces there
      const P = D.map, step = Math.max(1, Math.round(M * Math.min(1, ub - ua) / 14)), cell = side / (M * (ub - ua)) * step;
      c.save(); c.beginPath(); c.rect(A.l, A.t, side, side); c.clip();
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.1;
      for (let j = Math.floor(step / 2); j < M; j += step) for (let i = Math.floor(step / 2); i < M; i += step) {
        const q = j * M + i, S0 = P.v[q];
        if (!(S0 > 0.04 * pk)) continue;
        const S1 = P.s1[q], S2 = P.s2[q], S3 = P.s3[q], Sp = Math.hypot(S1, S2, S3), dop = Math.min(1, Sp / S0);
        const psi = 0.5 * Math.atan2(S2, S1), chi = 0.5 * Math.asin(clamp(S3 / (Sp || 1), -1, 1));
        const a = 0.42 * cell * dop * Math.sqrt(Math.min(1, S0 / pk) * 0.6 + 0.4), x = dx((i + 0.5) / M), y = dy((j + 0.5) / M);
        c.beginPath(); c.ellipse(x, y, Math.max(0.6, a * Math.cos(chi)), Math.max(0.6, a * Math.abs(Math.sin(chi))), -psi, 0, 2 * Math.PI); c.stroke();
      }
      c.restore();
    }
    drawAxes(c, A, [xa, xb], [ya, yb], sx, sy, { noGrid: true });
    updateSyncButtons();
    return;
  }
  const hgt = 150;
  size(hgt);
  const series = [];
  let xs0, xs1, sx = { kind: 'len' }, top = 1, marker = null, yName = 'of the peak';
  if (view === 'mtf') {
    series.push({ x: D.freq, y: D.mtf, name: D.symmetric ? 'MTF' : 'MTF in the plane' });
    if (!D.symmetric) series.push({ x: D.freq, y: D.mtfY, dash: true, name: 'MTF out of the plane' });
    if (D.cutoff) {
      const ana = D.freq.map(v => { const x = v / D.cutoff; return x >= 1 ? 0 : (2 / Math.PI) * (Math.acos(x) - x * Math.sqrt(1 - x * x)); });
      series.push({ x: D.freq, y: ana, faint: true, name: 'diffraction limit' });
    }
    xs0 = 0; xs1 = D.freq[D.freq.length - 1]; sx = { kind: 'plain', title: 'lp/mm' }; yName = 'MTF';
  } else if (view === 'ee') {
    series.push({ x: D.rho, y: D.ee, name: 'enclosed energy' });
    xs0 = 0; xs1 = D.rho[D.rho.length - 1]; marker = D.airy; yName = 'of the light'; sx.title = 'radius';
  } else if (D.symmetric) {
    series.push({ x: D.rho, y: D.psf, name: 'irradiance' });
    xs0 = 0; xs1 = D.rho[D.rho.length - 1]; top = Math.max(...D.psf); marker = D.airy; sx.title = 'radius';
  } else {
    series.push({ x: D.cutX.x, y: D.cutX.I, name: 'in the plane' }, { x: D.cutY.x, y: D.cutY.I, dash: true, name: 'out of the plane' });
    xs1 = D.rho[D.rho.length - 1]; xs0 = -xs1; top = Math.max(...D.cutX.I, ...D.cutY.I);
  }
  if (view !== 'mtf' && view !== 'ee') top = holdScale(el, 'psf', top);
  if (Z.freeze && Z.freeze.top) top = Z.freeze.top;
  plotCsv(cv, el.name + ' ' + ({ mtf: 'MTF', ee: 'enclosed energy' }[view] || 'profile'),
    ['series', view === 'mtf' ? 'lp_per_mm' : 'position_mm', view === 'mtf' ? 'MTF' : view === 'ee' ? 'share_of_the_light' : 'irradiance'],
    () => series.flatMap(S => Array.from(S.x, (x, i) => [S.name, x, S.y[i]])));
  // up is always a share of the full scale, so plots of different screens compare by shape
  const [xa, xb] = zoomRange(Z, 'x', xs0, xs1), [fa, fb] = zoomRange(Z, 'y', 0, 1);
  const sy = { kind: 'plain', title: yName };
  const A = plotArea(c, w, hgt, [fa, fb], sy);
  cv._area = A; cv._full = { x: [xs0, xs1], y: [0, 1], top };
  const X = v => A.l + (v - xa) / ((xb - xa) || 1) * A.w;
  const Y = v => A.t + A.h - (v / (top || 1) - fa) / ((fb - fa) || 1) * A.h;
  c.save();
  c.beginPath(); c.rect(A.l, A.t - 2, A.w + 2, A.h + 4); c.clip();
  if (marker) {
    c.strokeStyle = 'rgba(0,0,0,0.18)'; c.setLineDash([3, 3]); c.beginPath();
    c.moveTo(X(marker), A.t); c.lineTo(X(marker), A.t + A.h); c.stroke(); c.setLineDash([]);
  }
  for (const S of series) {
    c.strokeStyle = S.faint ? 'rgba(0,0,0,0.25)' : getCss('--jek-cyan');
    c.lineWidth = S.faint ? 1 : 1.5;
    c.setLineDash(S.dash ? [4, 3] : S.faint ? [1, 3] : []);
    c.beginPath();
    for (let i = 0; i < S.x.length; i++) { const px = X(S.x[i]), py = Y(S.y[i]); i ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.stroke();
  }
  c.restore();
  c.setLineDash([]);
  drawAxes(c, A, [xa, xb], [fa, fb], sx, sy);
  if (!D.symmetric && view !== 'ee') {
    // clear of the sync button in the corner
    c.fillStyle = getCss('--jek-ink-soft'); c.font = axisFont();
    c.textAlign = 'right'; c.fillText('solid: in the plane, dashed: out', w - 28, A.t - 8);
  }
  updateSyncButtons();
}

export function pickMaterial(v, old) {
  if (v === 'custom') return normMat({ glass: 'custom', n: +refIndex(old, 587.6).toFixed(4) });
  if (v.startsWith('lib:')) return normMat(project.library[+v.slice(4)]);
  // a pack's glass: its data written into the part, which then needs nothing from the pack
  if (v.startsWith('pack:')) { const m = /^pack:(.+):(\d+)$/.exec(v), pk = m && PACKS.list.find(p => p.id === m[1]), g = pk && pk.glasses[+m[2]]; if (g) return normMat(g); }
  return v === old.glass ? old : normMat({ glass: v });
}

export let materialWanted = null;
export function setMaterialWanted(v) { return (materialWanted = v); }
export function askForMaterial(apply) {
  materialWanted = apply;
  document.getElementById('matNote').textContent = '';
  document.getElementById('matDialog').showModal();
}

/* a material menu: an optical part's glasses, or an RF lens's dielectrics (each kept to its own) */
/* a glass the tracer does not know, with no index given for it: it traces as n = 1.5, which the
   panel says plainly (an imported part's glass from another catalogue, often) */
export const unknownGlass = m => !!m && !m.table && !m.nlc && m.glass !== 'AIR' && m.glass !== 'custom' &&
  !glassKey(m.glass) && !RF_MAT[m.glass] && !isFinite(m.nd);
export const unknownGlassNote = m => h('p', { class: 'rt-glasswarn wide' }, m.glass + ' is not in the glass catalogue and no index came with it, so it traces as n = 1.5. Choose it, or its equivalent, under Material, or set a constant index.');
/* everything a part's import assumed, and any glass it has that traces as n = 1.5 */
export function partAssumptions(el) {
  const out = [...(el.assumed || [])];
  const mats = el.type === 'lens' ? el.materials || [] : el.material ? [el.material] : [];
  for (const m of mats) if (unknownGlass(m)) out.push(m.glass + ' is not in the glass catalogue and no index came with it, so it traces as n = 1.5: choose it under Material.');
  return [...new Set(out)];
}
/* the red box at the top of its panel */
export function assumedBox(el) {
  const list = partAssumptions(el);
  if (!list.length) return null;
  const box = h('div', { class: 'rt-assumed', role: 'note' },
    h('strong', null, 'Imported with assumptions'),
    h('ul', null, ...list.map(t => h('li', null, t))));
  if (el.assumed && el.assumed.length) box.append(h('button', { type: 'button', class: 'rt-link', title: 'Clear the import\u2019s notes once you have checked them (a glass with no index stays flagged until it is chosen)',
    onclick: () => { checkpoint(); delete el.assumed; changed(true); } }, 'Dismiss'));
  return box;
}
export function materialOptions(mat, rf) {
  // the RF dielectrics: by their index at the bench's frequency, when it is an RF bench
  const nm = benchNms()[0], at = nm > 1e5 ? ' at ' + fmtGHz(nm) : ' (RF)';
  const rfOpts = Object.entries(RF_MAT).map(([k, v]) => [k, v.name + ', n = ' + v.n + at]);
  if (rf) {
    const opts = rfOpts.slice();
    if (!RF_MAT[mat.glass] && mat.glass !== 'custom') opts.unshift([mat.glass, matLabel(mat) + ' (not an RF dielectric)']);
    opts.push(['custom', 'Constant index']);
    return opts;
  }
  const opts = Object.keys(GLASS).map(k => [k, k]);
  for (const [i, m] of (project.library || []).entries()) opts.push(['lib:' + i, m.glass + ' (imported)']);
  for (const pk of PACKS.list) pk.glasses.forEach((m, i) => opts.push(['pack:' + pk.id + ':' + i, m.glass + ' (' + pk.name + ')']));
  if (RF_MAT[mat.glass]) opts.push(rfOpts.find(o => o[0] === mat.glass));
  const known = glassKey(mat.glass) || RF_MAT[mat.glass];
  if (!known && !mat.table && mat.glass !== 'custom' && mat.glass !== 'AIR') opts.unshift([mat.glass, mat.glass + (isFinite(mat.nd) ? ' (from file)' : ' (unknown: n = 1.5)')]);
  if (mat.table) opts.unshift([mat.glass, mat.glass + ' (measured data)']);
  opts.push(['AIR', 'Air gap'], ['custom', 'Constant index'], ['import', 'Import a material\u2026']);
  return opts;
}

/* Numbers from refractiveindex.info: a CSV or a pasted block of wavelength and index,
   optionally followed by a second block of the absorption index k. */
export function parseNK(text) {
  const wl = [], n = [], kk = [];
  let section = 'n';
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^wl\s*[,;\t]\s*k/i.test(line)) { section = 'k'; continue; }
    if (/^wl\s*[,;\t]\s*n/i.test(line) || /^[a-z]/i.test(line)) { if (/^wl/i.test(line)) { section = 'n'; continue; } continue; }
    const parts = line.split(/[,;\t\s]+/).map(Number).filter(v => isFinite(v));
    if (parts.length < 2) continue;
    if (section === 'n') { wl.push(parts[0]); n.push(parts[1]); if (parts.length > 2) kk.push(parts[2]); }
    else {
      // a k block: match it onto the wavelengths already read where we can
      const i = wl.indexOf(parts[0]);
      if (i >= 0) { while (kk.length < i) kk.push(0); kk[i] = parts[1]; }
    }
  }
  if (wl.length < 2) throw new Error('No wavelength and index pairs were found. Expect two columns: wavelength in micrometres, then index.');
  // sort and tidy
  const order = wl.map((v, i) => i).sort((a, b) => wl[a] - wl[b]);
  const table = { wl: order.map(i => wl[i]), n: order.map(i => n[i]), k: kk.length ? order.map(i => kk[i] || 0) : [] };
  if (table.n.some(v => !isFinite(v) || v <= 0)) throw new Error('Some index values could not be read.');
  return table;
}

export function removeSweeps(el, prefix) {
  stopSweepsFor(el, prefix);
  if (el.sweeps) for (const k of Object.keys(el.sweeps)) if (k.startsWith(prefix)) delete el.sweeps[k];
}

export function lensPanel(el) {
  panel.append(h('h3', null, el.mmw ? 'RF lens' : 'Lens'));
  panel.append(h('div', { class: 'rt-rows' }, param('Diameter (mm)', el, 'diameter', { wide: true }),
    selectField('Shape', [['round', 'Round'], ['plane', 'Cylinder, power in the bench plane'], ['out', 'Cylinder, power out of the plane']],
      () => el.cyl || 'round', v => { el.cyl = v === 'round' ? undefined : v; }, { wide: true })));

  const N = el.surfaces.length;
  for (let i = 0; i < N; i++) {
    const s = el.surfaces[i];
    panel.append(h('h3', null, 'Surface ' + (i + 1)));
    const rows = h('div', { class: 'rt-rows' },
      param('Radius (mm)', el, `surfaces.${i}.R`, { blank: null, placeholder: 'flat' }),
      param('Conic k', el, `surfaces.${i}.k`, { blank: 0 }),
    );
    if (s.a2 !== 0) rows.append(param('A2 (mm⁻¹)', el, `surfaces.${i}.a2`, { blank: 0 }));
    if (s.odd && s.odd[0]) {
      // an axicon's cone, given as its base angle; stored as the odd r^1 sag term
      const cid = 'rtf' + (setFid(fid + 1));
      const cone = numInput(cid, () => +(Math.atan(s.odd[0]) / deg).toPrecision(6), v => { if (Math.abs(v) < 80) s.odd[0] = Math.tan(v * deg); });
      rows.append(h('div', { class: 'rt-f wide' }, h('label', { for: cid }, 'Cone angle (°)'), cone));
    }
    s.A.forEach((_, j) => rows.append(param('A' + (4 + 2 * j), el, `surfaces.${i}.A.${j}`, { blank: 0 })));
    rows.append(h('div', { class: 'rt-inline wide' },
      h('button', { class: 'rt-link', type: 'button', onclick: () => { checkpoint(); s.A.push(0); changed(true); } },
        s.A.length ? 'Add A' + (4 + 2 * s.A.length) + ' term' : 'Add aspheric terms'),
      s.A.length ? h('button', { class: 'rt-link', type: 'button', onclick: () => {
        checkpoint(); removeSweeps(el, `surfaces.${i}.A.${s.A.length - 1}`); s.A.pop(); changed(true);
      } }, 'Remove A' + (2 + 2 * s.A.length)) : null,
    ));
    panel.append(rows);
    panel.append(coatingRows(el, s));

    if (i < N - 1) {
      const m = el.materials[i];
      const mrows = h('div', { class: 'rt-rows', style: 'margin-top:0.6rem' },
        param(i === 0 && N === 2 ? 'Centre thickness (mm)' : 'Thickness to ' + (i + 2) + ' (mm)', el, `gaps.${i}`),
        selectField('Material', materialOptions(m, !!el.mmw), () => glassKey(m.glass) || m.glass, v => {
          const old = el.materials[i];
          if (v === 'import') { askForMaterial(mm => { el.materials[i] = mm; changed(true); }); return; }
          removeSweeps(el, `materials.${i}.`);
          el.materials[i] = pickMaterial(v, old);
        }),
      );
      if (m.glass === 'custom') mrows.append(param('Index n', el, `materials.${i}.n`, { wide: true }));
      if (unknownGlass(m)) mrows.append(unknownGlassNote(m));
      if (m.glass !== 'AIR') mrows.append(param('Absorption (per mm)', el, `materials.${i}.abs`, { wide: true }));
      panel.append(mrows);
    }
  }
  panel.append(h('div', { class: 'rt-readout', 'data-readout': 'lens' }));
  panel.append(h('div', { class: 'rt-actions' },
    h('button', { class: 'rt-btn', onclick: () => { checkpoint(); flipLens(el); changed(true); } }, 'Flip'),
  ));
}

function flipLens(el) {
  // surface-specific sweeps don't survive the reversal
  for (const pre of ['surfaces.', 'gaps.', 'materials.']) removeSweeps(el, pre);
  el.surfaces = el.surfaces.slice().reverse().map(s => ({
    R: s.R === null ? null : -s.R, k: s.k, a2: -s.a2, A: s.A.map(v => -v),
    odd: s.odd ? s.odd.map(v => -v) : undefined, semi: s.semi,
  }));
  el.gaps = el.gaps.slice().reverse();
  el.materials = el.materials.slice().reverse();
}

