import { accountGate, acctMark } from '../../../jekray/src/ui/pro.js';
import { nf } from '../core/units.js';
import { h } from './panel.js';
import { getCss, inkA, niceStep, themeDark } from './render.js';
import { downloadFile, safeFileName, toast } from './actions.js';

/* ==========================================================================
   Small plots for the panels: a histogram, a line, a scatter, each on its own canvas with axes, and under it the
   buttons that save it as a PNG or its numbers as CSV (an account's, as every export is).
   ========================================================================== */
const font = () => '10px ' + getCss('--jek-mono');
function ticks(a, b, n) {
  const span = b - a, out = [];
  if (!(span > 0) || !isFinite(span)) return out;
  const st = niceStep(span / Math.max(1, n)), dec = Math.max(0, -Math.floor(Math.log10(st) + 1e-9));
  for (let i = Math.ceil(a / st - 1e-9); i * st <= b + st * 1e-9; i++) out.push({ at: i * st, text: (Math.abs(i) < 1e-9 ? 0 : i * st).toFixed(dec) });
  return out;
}
/* axes over [x0, x1] × [y0, y1] in a canvas w × hgt; returns the mapping { X, Y, l, t, w, h } */
function axes(c, w, hgt, xr, yr, xl, yl) {
  c.font = font();
  const ty = ticks(yr[0], yr[1], Math.max(3, Math.floor((hgt - 36) / 22)));
  let lw = 0; for (const t of ty) lw = Math.max(lw, c.measureText(t.text).width);
  const l = Math.ceil(lw) + 8, tp = 16, b = 20, pw = Math.max(10, w - l - 8), ph = Math.max(10, hgt - tp - b);
  const X = v => l + (v - xr[0]) / ((xr[1] - xr[0]) || 1) * pw, Y = v => tp + ph - (v - yr[0]) / ((yr[1] - yr[0]) || 1) * ph;
  const tx = ticks(xr[0], xr[1], Math.max(2, Math.floor(pw / 60)));
  c.strokeStyle = inkA(0.08); c.lineWidth = 1; c.beginPath();
  for (const t of tx) { const p = Math.round(X(t.at)) + 0.5; c.moveTo(p, tp); c.lineTo(p, tp + ph); }
  for (const t of ty) { const p = Math.round(Y(t.at)) + 0.5; c.moveTo(l, p); c.lineTo(l + pw, p); }
  c.stroke();
  c.strokeStyle = inkA(0.45); c.beginPath(); c.moveTo(l - 0.5, tp); c.lineTo(l - 0.5, tp + ph + 0.5); c.lineTo(l + pw, tp + ph + 0.5); c.stroke();
  c.fillStyle = getCss('--jek-ink-soft'); c.textAlign = 'center'; c.textBaseline = 'top';
  for (const t of tx) c.fillText(t.text, X(t.at), tp + ph + 4);
  c.textAlign = 'right'; c.textBaseline = 'middle';
  for (const t of ty) c.fillText(t.text, l - 4, Y(t.at));
  c.textAlign = 'right'; c.textBaseline = 'bottom'; c.fillText(xl, l + pw, hgt - 1);
  c.textAlign = 'left'; c.fillText(yl, 2, tp - 3);
  return { X, Y, l, t: tp, w: pw, h: ph };
}
function canvasFor() {
  const cv = h('canvas', { class: 'ion-plot' });
  return cv;
}
function sized(cv) {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, w = Math.max(60, Math.round(r.width || 300)), hgt = Math.max(60, Math.round(r.height || 150));
  cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr);
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = themeDark() ? '#242a2e' : '#fff'; c.fillRect(0, 0, w, hgt);
  return { c, w, hgt };
}
/* the buttons under a plot: PNG and CSV, and a line of words */
function plotBar(cv, name, csvRows, note) {
  const png = h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => { if (!accountGate('save a plot as a picture')) return; cv.toBlob(b => { downloadFile(safeFileName(name) + '.png', b); toast('Saved ' + name + '.png'); }); } }, 'PNG');
  const csv = h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => { if (!accountGate('save a plot’s numbers')) return; const rows = csvRows(); downloadFile(safeFileName(name) + '.csv', new Blob(['﻿' + rows.map(r => r.map(v => (typeof v === 'number' ? String(v) : '"' + String(v).replace(/"/g, '""') + '"')).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv' })); toast('Saved ' + name + '.csv'); } }, 'CSV');
  return h('div', { class: 'ion-plotbar' }, acctMark(png, 'save a plot as a picture'), acctMark(csv, 'save a plot’s numbers'), note ? h('span', null, note) : null);
}
/* a histogram of values: { title, unit, bins, colour } */
export function histogram(values, o) {
  const cv = canvasFor(), wrap = h('div', null, cv);
  const vals = values.filter(v => isFinite(v));
  let edges = [], counts = [];
  const draw = () => {
    const { c, w, hgt } = sized(cv);
    if (!vals.length) { c.fillStyle = getCss('--jek-ink-soft'); c.font = font(); c.textAlign = 'center'; c.fillText('nothing recorded', w / 2, hgt / 2); return; }
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (!(hi > lo)) { lo -= 0.5 * Math.abs(lo) || 0.5; hi += 0.5 * Math.abs(hi) || 0.5; }
    const nb = Math.max(4, Math.min(o.bins || 40, Math.ceil(Math.sqrt(vals.length) * 2))), st = niceStep((hi - lo) / nb), b0 = Math.floor(lo / st) * st, n = Math.ceil((hi - b0) / st) + 1;
    counts = new Array(n).fill(0); edges = [];
    for (let i = 0; i <= n; i++) edges.push(b0 + i * st);
    for (const v of vals) counts[Math.min(n - 1, Math.max(0, Math.floor((v - b0) / st)))]++;
    const A = axes(c, w, hgt, [b0, b0 + n * st], [0, Math.max(1, ...counts) * 1.08], o.title + (o.unit ? ' (' + o.unit + ')' : ''), 'count');
    c.fillStyle = (o.colour || getCss('--jek-cyan')) + 'cc';
    for (let i = 0; i < n; i++) { const x0 = A.X(edges[i]), x1 = A.X(edges[i + 1]); c.fillRect(x0 + 0.5, A.Y(counts[i]), Math.max(1, x1 - x0 - 1), A.Y(0) - A.Y(counts[i])); }
  };
  requestAnimationFrame(draw);
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN, sd = vals.length > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1)) : 0;
  wrap.append(plotBar(cv, o.title, () => [[o.title + (o.unit ? ' from (' + o.unit + ')' : ''), 'to', 'count'], ...counts.map((k, i) => [edges[i], edges[i + 1], k])], vals.length ? vals.length + ' values, mean ' + nf(mean, 4) + (o.unit ? ' ' + o.unit : '') + (vals.length > 1 ? ', σ ' + nf(sd, 3) + (o.unit ? ' ' + o.unit : '') : '') : ''));
  return wrap;
}
/* points as a scatter: { title, xl, yl, unit, colours } */
export function scatter(xs, ys, o) {
  const cv = canvasFor(), wrap = h('div', null, cv);
  const draw = () => {
    const { c, w, hgt } = sized(cv);
    if (!xs.length) { c.fillStyle = getCss('--jek-ink-soft'); c.font = font(); c.textAlign = 'center'; c.fillText('nothing recorded', w / 2, hgt / 2); return; }
    const pad = (a, b) => { const m = (b - a) * 0.08 || Math.abs(a) * 0.1 || 1; return [a - m, b + m]; };
    const A = axes(c, w, hgt, pad(Math.min(...xs), Math.max(...xs)), pad(Math.min(...ys), Math.max(...ys)), o.xl, o.yl);
    for (let i = 0; i < xs.length; i++) { c.fillStyle = (o.colours ? o.colours[i] : getCss('--jek-cyan')) + 'bb'; c.beginPath(); c.arc(A.X(xs[i]), A.Y(ys[i]), 2.2, 0, 2 * Math.PI); c.fill(); }
  };
  requestAnimationFrame(draw);
  wrap.append(plotBar(cv, o.title, () => [[o.xl, o.yl], ...xs.map((x, i) => [x, ys[i]])], xs.length + ' points'));
  return wrap;
}
/* a line plot: { title, xl, yl } */
export function linePlot(xs, ys, o) {
  const cv = canvasFor(), wrap = h('div', null, cv);
  const draw = () => {
    const { c, w, hgt } = sized(cv);
    const ok = ys.map((y, i) => [xs[i], y]).filter(p => isFinite(p[1]));
    if (!ok.length) { c.fillStyle = getCss('--jek-ink-soft'); c.font = font(); c.textAlign = 'center'; c.fillText('nothing to plot', w / 2, hgt / 2); return; }
    let y0 = Math.min(...ok.map(p => p[1])), y1 = Math.max(...ok.map(p => p[1]));
    if (!(y1 > y0)) { y0 -= 1; y1 += 1; }
    const A = axes(c, w, hgt, [Math.min(...xs), Math.max(...xs)], [y0, y1], o.xl, o.yl);
    c.strokeStyle = o.colour || getCss('--jek-cyan'); c.lineWidth = 1.5; c.beginPath();
    let pen = false;
    for (let i = 0; i < xs.length; i++) { if (!isFinite(ys[i])) { pen = false; continue; } const X = A.X(xs[i]), Y = A.Y(ys[i]); if (pen) c.lineTo(X, Y); else c.moveTo(X, Y); pen = true; }
    c.stroke();
  };
  requestAnimationFrame(draw);
  wrap.append(plotBar(cv, o.title, () => [[o.xl, o.yl], ...xs.map((x, i) => [x, ys[i]])], o.note || ''));
  return wrap;
}
