import { h } from '../../../jekray/src/ui/dom.js';

/* ==========================================================================
   A line plot, drawn as SVG in the page's own colours (so it follows the theme with no redraw): axes with round
   ticks, the series with a key, and a readout of each series at the pointer. o = { label, xTitle, yTitle, xr, yr,
   series: [{ label, cls, xs, ys, dash }], H }. The series' colours are classes (.s0…, .tgt) in style.css.
   ========================================================================== */
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs, ...kids) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) n.setAttribute(k, v); for (const k of kids) n.append(k); return n; };
/* round ticks across [a, b], about n of them */
export function niceTicks(a, b, n = 5) {
  if (!(b > a)) return [a];
  const raw = (b - a) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = [];
  for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + 1e-9 * step; v += step) out.push(+v.toPrecision(12));
  return out;
}
const tickText = v => (Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-3) ? v.toExponential(1) : String(+v.toPrecision(6)));
export function linePlotSvg(parent, o) {
  const W = 520, H = o.H || 250, L = 46, R = 10, T = 10, B = 34;
  const xs = o.series.flatMap(s => s.xs), ys = o.series.flatMap(s => s.ys).filter(isFinite);
  const xr = o.xr || [Math.min(...xs), Math.max(...xs)], yr = o.yr || [Math.min(0, ...ys), Math.max(...ys) || 1];
  const X = v => L + (W - L - R) * (v - xr[0]) / ((xr[1] - xr[0]) || 1), Y = v => H - B - (H - B - T) * (v - yr[0]) / ((yr[1] - yr[0]) || 1);
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'film-plot', role: 'img', 'aria-label': o.label, preserveAspectRatio: 'none' });
  const grid = sv('g', { class: 'grid' }), axes = sv('g', { class: 'axes' });
  for (const t of niceTicks(xr[0], xr[1], 6)) { grid.append(sv('line', { x1: X(t), x2: X(t), y1: T, y2: H - B })); axes.append(sv('text', { x: X(t), y: H - B + 14, 'text-anchor': 'middle' }, tickText(t))); }
  for (const t of niceTicks(yr[0], yr[1], 4)) { grid.append(sv('line', { x1: L, x2: W - R, y1: Y(t), y2: Y(t) })); axes.append(sv('text', { x: L - 5, y: Y(t) + 3.5, 'text-anchor': 'end' }, tickText(t))); }
  axes.append(sv('rect', { x: L, y: T, width: W - L - R, height: H - B - T, class: 'frame' }),
    sv('text', { x: (L + W - R) / 2, y: H - 4, 'text-anchor': 'middle', class: 'title' }, o.xTitle || ''),
    sv('text', { x: 11, y: (T + H - B) / 2, 'text-anchor': 'middle', class: 'title', transform: `rotate(-90 11 ${(T + H - B) / 2})` }, o.yTitle || ''));
  svg.append(grid, axes, sv('defs', null, sv('clipPath', { id: 'clip' + o.id }, sv('rect', { x: L, y: T, width: W - L - R, height: H - B - T }))));
  const lines = sv('g', { 'clip-path': `url(#clip${o.id})` });
  for (const s of o.series) {
    let d = '';
    s.xs.forEach((x, i) => { const y = s.ys[i]; if (isFinite(y)) d += (d ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(Math.min(yr[1] * 2, y)).toFixed(1); });
    lines.append(sv('path', { d, class: 'line ' + (s.cls || ''), 'stroke-dasharray': s.dash ? '5 4' : null }));
  }
  const cursor = sv('line', { class: 'cursor', y1: T, y2: H - B, visibility: 'hidden' });
  svg.append(lines, cursor);
  const read = h('div', { class: 'film-read mono', 'aria-live': 'off' }, ' ');
  const key = h('div', { class: 'film-key' }, ...o.series.map(s => h('span', { class: s.cls || '' }, h('i', { class: s.dash ? 'dash' : null }), s.label)));
  svg.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect(), x = xr[0] + ((e.clientX - r.left) * W / r.width - L) / (W - L - R) * (xr[1] - xr[0]);
    if (x < xr[0] || x > xr[1]) { cursor.setAttribute('visibility', 'hidden'); return; }
    cursor.setAttribute('x1', X(x)); cursor.setAttribute('x2', X(x)); cursor.setAttribute('visibility', 'visible');
    const at = s => { let best = 0; s.xs.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(s.xs[best] - x)) best = i; }); return s.ys[best]; };
    read.textContent = (o.xName || 'x') + ' ' + (+x.toPrecision(5)) + ': ' + o.series.filter(s => !s.dash).map(s => s.label + ' ' + (+at(s).toPrecision(3)) + (o.yUnit || '')).join(', ');
  });
  svg.addEventListener('pointerleave', () => { cursor.setAttribute('visibility', 'hidden'); read.textContent = ' '; });
  parent.append(h('figure', { class: 'film-fig' }, h('figcaption', null, o.label), svg, key, read));
  return svg;
}
