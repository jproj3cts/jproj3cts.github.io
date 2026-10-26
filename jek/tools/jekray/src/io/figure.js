import { project, V } from '../state/project.js';
import { onTab } from '../state/tabs.js';
import { fmtLen } from '../core/format.js';
import { TYPE_LABEL } from '../parts/registry.js';
import { W, H, benchBg, benchHoles, benchLight, niceStep, requestRender, setFigure, sx, sy, worldBox } from '../ui/render.js';
import { V3D } from '../ui/view3d.js';
import { VecCtx, layoutSvg, pdfDoc, recordLayout } from './layout.js';
import { downloadFile, fitView, safeFileName, toast } from '../ui/actions.js';
import { accountGate, needMark } from '../ui/pro.js';
import { PALETTES } from '../ui/experimental.js';
import { h } from '../ui/panel.js';
import { track } from './usage.js';

/* ==========================================================================
   File › Export figure…: the bench as a figure made for where it is going.
   - Journal: white, no holes, the parts as line art, the light in its colour or black, the names in
     Helvetica at a size in points; 85 mm wide (a single column) or 174 mm (two), lines no thinner than
     0.5 pt, a scale bar; PDF or SVG (vector), or PNG at 600 dpi.
   - Technical drawing: an A4 or A3 sheet, the bench to a standard scale, the parts' centres dimensioned
     (along and across), numbered callouts and a parts list, and a title block.
   - Presentation: the bench as it looks, on a 16:9 or 4:3 slide.
   The bench is drawn into a VecCtx (io/layout.js) with the figure's look (render.js `figure`), cut to
   what is on it, and placed on the figure's page in points (or a slide's pixels).
   ========================================================================== */
const FIG_MM = 72 / 25.4;                                              // points in a millimetre
const FIG_FONT = 'Helvetica, Arial, sans-serif', FIG_INK = '#111', FIG_SOFT = '#5b6570';
export const FIGURE_PRESETS = [['journal', 'Journal'], ['technical', 'Technical drawing'], ['slides', 'Presentation']];
export const FIGURE_DEFAULTS = {
  journal: { width: 85, mono: false, pt: 8, scaleBar: true, fmt: 'pdf' },
  technical: { sheet: 'A4', mono: true, dims: true, callouts: true, title: '', by: '', fmt: 'pdf' },
  slides: { size: '169', fmt: 'png' },
};

/* the bench drawn once with a figure's look, the view as it stands */
function figRecord(fig) {
  setFigure(fig);
  try { return recordLayout(); } finally { setFigure(null); requestRender(); }
}
// the parts on this tab (not drawings' own nodes), each with where it is on the canvas
const figParts = () => project.elements.filter(e => onTab(e) && e.type !== 'draw' && !(e.type === 'elec' && e.kind === 'node'));
/* what the figure shows, on the canvas: every part, the fibres' routes, every word drawn; cut to the canvas */
function figBox(rec) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  const els = project.elements.filter(onTab), ids = new Set(els.map(e => e.id));
  for (const e of els) { const B = worldBox(e); add(sx(B.x0), sy(B.y0)); add(sx(B.x1), sy(B.y1)); }
  for (const F of project.fibres || []) if (ids.has(F.a[0]) && ids.has(F.b[0])) for (const n of F.path || []) add(sx(n.x), sy(n.y));
  for (const o of rec.ops) if (o.k === 'text') { add(o.x, o.y - o.size); add(o.x + o.w, o.y + 0.3 * o.size); }
  if (!isFinite(x0)) return { x: 0, y: 0, w: W, h: H };
  const pad = Math.max(8, 0.04 * Math.max(x1 - x0, y1 - y0));
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W, x1 + pad); y1 = Math.min(H, y1 + pad);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
/* the bench's record put on the figure: its box at (ox, oy), s figure units to a canvas pixel; lines no
   thinner than minLw; noField: the diffracted field's glow (a coloured picture) left out, as for light in one ink */
function figPlace(dst, src, box, ox, oy, s, minLw = 0, noField = false) {
  const X = x => ox + (x - box.x) * s, Y = y => oy + (y - box.y) * s;
  for (const o of src.ops) {
    if (o.k === 'path') {
      const q = Object.assign({}, o, { segs: o.segs.map(g => g.length === 1 ? g : [g[0], ...g.slice(1).map((v, i) => i % 2 ? Y(v) : X(v))]) });
      if (o.stroke) { q.lw = Math.max(minLw, o.lw * s); q.dash = o.dash.map(v => v * s); }
      dst.ops.push(q);
    } else if (o.k === 'text') dst.ops.push(Object.assign({}, o, { x: X(o.x), y: Y(o.y), size: o.size * s, w: o.w * s }));
    else if (o.k === 'layer' && src.layer && !noField) {
      // the field's glow: the part of it in the box, at the figure's own resolution
      const r = src.layer.width / src.w, c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(box.w * r)); c.height = Math.max(1, Math.round(box.h * r));
      c.getContext('2d').drawImage(src.layer, -box.x * r, -box.y * r);
      dst.resetTransform(); dst.globalAlpha = 1; dst.globalCompositeOperation = 'source-over';
      dst.drawImage(c, X(box.x), Y(box.y), box.w * s, box.h * s);
      const L = dst.ops.find(p => p.k === 'layer'); if (L) L.blend = o.blend;
    }
  }
}
// words on the figure, in its font, at a size in its units
function figSay(g, t, x, y, o = {}) {
  g.save(); g.font = (o.bold ? '600 ' : '') + (o.size || 7) + 'px ' + FIG_FONT; g.fillStyle = o.ink || FIG_INK;
  g.textAlign = o.align || 'left'; g.textBaseline = o.base || 'alphabetic'; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillText(t, x, y); g.restore();
}
function figLine(g, pts, lw = 0.5, ink = FIG_INK, dash) {
  g.save(); g.strokeStyle = ink; g.lineWidth = lw; g.setLineDash(dash || []); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.lineCap = 'butt';
  g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); g.restore();
}
const figFit = (g, t, w, size) => { g.font = size + 'px ' + FIG_FONT; if (g.measureText(t).width <= w) return t; while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; };
/* the bench recorded at the label size that comes out at pt once it is scaled to the figure: the scale
   depends on the box, the box a little on the labels, so a few rounds */
function figFitted(fig, pt, scaleOf) {
  let rec = null, box = null, s = 1;
  fig.labelPx = pt / scaleOf({ w: W * 0.8, h: H * 0.8 });
  for (let i = 0; i < 4; i++) {
    rec = figRecord(fig); box = figBox(rec); s = scaleOf(box);
    const px = pt / s;
    if (Math.abs(px / fig.labelPx - 1) < 0.03) break;
    fig.labelPx = px;
  }
  return { rec, box, s };
}

/* ---- Journal ---- */
function journalFigure(o) {
  const Wpt = o.width * FIG_MM, maxH = 230 * FIG_MM, bar = o.scaleBar ? o.pt * 2.2 : 0;
  const fig = { plain: true, bg: '#ffffff', mono: o.mono && '#111', font: FIG_FONT };
  const { rec, box, s } = figFitted(fig, o.pt, b => Math.min(Wpt / b.w, (maxH - bar) / b.h));
  const g = new VecCtx(Wpt, box.h * s + bar, { plain: true, res: 4 });
  figPlace(g, rec, box, (Wpt - box.w * s) / 2, 0, s, 0.5, !!o.mono);
  if (o.scaleBar) {
    const mmPerPt = 1 / (V().scale * s), L = niceStep(0.18 * Wpt * mmPerPt), len = L / mmPerPt, y = box.h * s + bar * 0.45, x = 2;
    figLine(g, [[x, y - 2.5], [x, y], [x + len, y], [x + len, y - 2.5]], 0.75);
    figSay(g, fmtLen(L), x + len + 3, y + o.pt * 0.35, { size: o.pt });
  }
  return { g, unit: 'pt', dpi: 600, note: o.width + ' × ' + Math.round(g.h / FIG_MM) + ' mm, names in Helvetica ' + o.pt + ' pt, lines at least 0.5 pt' };
}

/* ---- Technical drawing ---- */
const FIG_SCALES = [[5, '5:1'], [2, '2:1'], [1, '1:1'], [0.5, '1:2'], [0.4, '1:2.5'], [0.2, '1:5'], [0.1, '1:10'], [0.05, '1:20'], [0.04, '1:25'], [0.02, '1:50'], [0.01, '1:100']];
const FIG_PART_NAMES = () => Object.fromEntries(Object.keys(PALETTES).flatMap(p => PALETTES[p].map(r => [r[0], r[2] || r[1]])));
export function partKindName(e, names = FIG_PART_NAMES()) {
  const k = e.type === 'fcomp' ? e.kind : (e.type === 'elec' || e.type === 'pic') ? e.type + ':' + e.kind : null;
  return (k && names[k]) || (e.mmw && e.type === 'source' ? 'Feed horn' : '') || TYPE_LABEL[e.type] || e.type;
}
function technicalFigure(o) {
  const [SW, SH] = o.sheet === 'A3' ? [1191, 842] : [842, 595], M = 20, RC = o.sheet === 'A3' ? 320 : 250;
  const parts = figParts().slice().sort((a, b) => a.x - b.x || b.y - a.y);
  const callouts = o.callouts && parts.length > 0;
  // the drawing's area, less room for the callouts above and below and the dimensions below and at the right
  const A = { x: M + 12, y: M + 12, w: SW - 2 * M - RC - 30, h: SH - 2 * M - 24 };
  const top = callouts ? 26 : 0, under = (callouts ? 26 : 0) + (o.dims ? 30 : 0), right = o.dims ? 40 : 0;
  const D = { x: A.x + 4, y: A.y + top, w: A.w - right - 8, h: A.h - top - under };
  const fig = { plain: true, bg: '#ffffff', mono: o.mono && '#8a9099', font: FIG_FONT, labels: callouts ? false : undefined };   // the light grey, the parts black
  const per = () => V().scale;                                        // canvas pixels a millimetre
  let ratio = FIG_SCALES[FIG_SCALES.length - 1];
  const scaleOf = b => {
    const k = Math.min(D.w / b.w, D.h / b.h) * per() / FIG_MM;            // paper mm to a bench mm, to fill the area
    ratio = FIG_SCALES.find(r => r[0] <= k * 1.0001) || [k, '1:' + (+(1 / k).toPrecision(2))];
    return ratio[0] * FIG_MM / per();
  };
  const { rec, box, s } = figFitted(fig, 7, scaleOf);
  const g = new VecCtx(SW, SH, { plain: true, res: 3 });
  const ox = D.x + (D.w - box.w * s) / 2, oy = D.y + (D.h - box.h * s) / 2;
  figPlace(g, rec, box, ox, oy, s, 0.35, !!o.mono);
  const dBot = oy + box.h * s, dRight = ox + box.w * s;            // the drawing's own edges: the callouts and dimensions kept close to it
  // the sheet round the drawing white again (a ray running off the bench stops at the drawing's edge)
  g.fillStyle = '#fff';
  for (const [x, y, w, hh] of [[0, 0, SW, A.y], [0, A.y + A.h, SW, SH - A.y - A.h], [0, 0, A.x, SH], [A.x + A.w, 0, SW - A.x - A.w, SH]]) g.fillRect(x, y, w, hh);
  const P = e => [ox + (sx(e.x) - box.x) * s, oy + (sy(e.y) - box.y) * s];
  // ---- dimensions: the parts' centres, along (below) and across (at the right), a chain of steps in mm ----
  if (o.dims && parts.length > 1) {
    const chain = (vals, along) => {
      const u = [];
      for (const v of vals.slice().sort((a, b) => a - b)) if (!u.length || v - u[u.length - 1] > 0.05) u.push(v);
      if (u.length < 2) return;
      const at = along ? Math.min(A.y + A.h - 12, dBot + (callouts ? 30 : 0) + 12) : Math.min(A.x + A.w - 14, dRight + 14);
      const pos = v => along ? ox + (sx(v) - box.x) * s : oy + (sy(v) - box.y) * s;
      // extension lines from each part's centre to the dimension line
      for (const e of parts) {
        const [px, py] = P(e), v = along ? e.x : e.y;
        if (!u.some(w => Math.abs(w - v) <= 0.05)) continue;
        if (along) figLine(g, [[px, py + 3], [px, at + 3]], 0.25, FIG_SOFT, [2, 1.5]); else figLine(g, [[px + 3, py], [at + 3, py]], 0.25, FIG_SOFT, [2, 1.5]);
      }
      for (let i = 1; i < u.length; i++) {
        const a = pos(u[i - 1]), b = pos(u[i]), d = u[i] - u[i - 1], t = String(+d.toFixed(d < 10 ? 2 : 1));
        if (along) figLine(g, [[a, at], [b, at]], 0.4); else figLine(g, [[at, a], [at, b]], 0.4);
        // arrowheads, in at each end
        const hd = Math.min(3.5, Math.abs(b - a) / 3);
        g.fillStyle = FIG_INK;
        for (const [p, dir] of [[a, Math.sign(b - a)], [b, -Math.sign(b - a)]]) {
          g.beginPath();
          if (along) { g.moveTo(p, at); g.lineTo(p + dir * hd, at - hd * 0.35); g.lineTo(p + dir * hd, at + hd * 0.35); }
          else { g.moveTo(at, p); g.lineTo(at - hd * 0.35, p + dir * hd); g.lineTo(at + hd * 0.35, p + dir * hd); }
          g.closePath(); g.fill();
        }
        g.font = '6.5px ' + FIG_FONT;
        const tw = g.measureText(t).width, room = Math.abs(b - a) > tw + 4, off = room || i % 2 ? -2 : 8;
        if (along) figSay(g, t, (a + b) / 2, at + off, { size: 6.5, align: 'center' });
        else { g.save(); g.translate(at + (room || i % 2 ? -2 : 8), (a + b) / 2); g.rotate(-Math.PI / 2); figSay(g, t, 0, 0, { size: 6.5, align: 'center' }); g.restore(); }
      }
    };
    chain(parts.map(e => e.x), true);
    chain(parts.map(e => e.y), false);
  }
  // ---- callouts: a numbered balloon for each part, in a row above (the parts in the upper half) or below ----
  if (callouts) {
    const mid = D.y + D.h / 2, R = 6, gap = 2 * R + 2;
    const rows = [[parts.filter(e => P(e)[1] < mid), Math.max(A.y + 10, oy - 14)], [parts.filter(e => P(e)[1] >= mid), Math.min(A.y + A.h - (o.dims ? 30 : 0) - 10, dBot + 14)]];
    for (const [list, y] of rows) {
      const it = list.map(e => ({ e, n: parts.indexOf(e) + 1, p: P(e), x: P(e)[0] })).sort((a, b) => a.x - b.x);
      for (let i = 0; i < it.length; i++) it[i].x = Math.max(it[i].x, A.x + R + 2, i ? it[i - 1].x + gap : -Infinity);
      for (let i = it.length - 1; i >= 0; i--) it[i].x = Math.min(it[i].x, D.x + D.w + R, i < it.length - 1 ? it[i + 1].x - gap : Infinity);
      for (const c of it) {
        const dx = c.p[0] - c.x, dy = c.p[1] - y, d = Math.hypot(dx, dy) || 1;
        figLine(g, [[c.x + dx / d * R, y + dy / d * R], c.p], 0.35);
        g.fillStyle = FIG_INK; g.beginPath(); g.arc(c.p[0], c.p[1], 0.9, 0, 2 * Math.PI); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(c.x, y, R, 0, 2 * Math.PI); g.fill();
        g.strokeStyle = FIG_INK; g.lineWidth = 0.6; g.setLineDash([]); g.stroke();
        figSay(g, String(c.n), c.x, y + 2.4, { size: 6.5, align: 'center', bold: true });
      }
    }
  }
  // ---- the frame, the parts list and the title block ----
  g.strokeStyle = FIG_INK; g.lineWidth = 0.8; g.setLineDash([]); g.strokeRect(M, M, SW - 2 * M, SH - 2 * M);
  figLine(g, [[SW - M - RC - 12, M], [SW - M - RC - 12, SH - M]], 0.5);
  const tx = SW - M - RC, bh = 92, by = SH - M - bh;
  if (callouts) {
    const cols = [['No.', 16], ['Name', RC * 0.27], ['Part', RC * 0.28], ['x (mm)', RC * 0.13], ['y (mm)', RC * 0.13], ['Angle (°)', 0]];
    cols[5][1] = RC - cols.slice(0, 5).reduce((t, c) => t + c[1], 0);
    let y = M + 8;
    figSay(g, 'Parts', tx, y + 8, { size: 9, bold: true }); y += 16;
    const row = (vals, bold) => {
      let x = tx;
      vals.forEach((v, i) => { const w = cols[i][1], num = i >= 3; figSay(g, figFit(g, v, w - 4, 6.5), num ? x + w - 3 : x + 2, y + 7.5, { size: 6.5, bold, align: num ? 'right' : 'left' }); x += w; });
      y += 10; figLine(g, [[tx, y], [tx + RC, y]], bold ? 0.5 : 0.2, bold ? FIG_INK : '#9aa3ab');
    };
    row(cols.map(c => c[0]), true);
    const names = FIG_PART_NAMES(), fits = Math.floor((by - 10 - y) / 10);
    const shown = parts.length > fits ? parts.slice(0, fits - 1) : parts;
    shown.forEach(e => row([String(parts.indexOf(e) + 1), e.name || '', partKindName(e, names), (+e.x.toFixed(2)).toString(), (+e.y.toFixed(2)).toString(), (+(e.angle || 0).toFixed(2)).toString()]));
    if (shown.length < parts.length) figSay(g, '… and ' + (parts.length - shown.length) + ' more', tx + 2, y + 8, { size: 6.5, ink: FIG_SOFT });
  }
  g.strokeStyle = FIG_INK; g.lineWidth = 0.8; g.strokeRect(tx, by, RC, bh);
  figLine(g, [[tx, by + 40], [tx + RC, by + 40]]); figLine(g, [[tx, by + 66], [tx + RC, by + 66]]);
  for (const f of [1 / 3, 2 / 3]) figLine(g, [[tx + RC * f, by + 40], [tx + RC * f, by + bh]]);
  const bench = project.benches.length > 1 ? (project.benches.find(b => b.id === project.tab) || {}).name || '' : '';
  figSay(g, figFit(g, o.title || project.name || 'Bench', RC - 16, 13), tx + 8, by + 18, { size: 13, bold: true });
  figSay(g, figFit(g, 'Optical layout' + (bench ? ', ' + bench : ''), RC - 16, 8), tx + 8, by + 32, { size: 8, ink: FIG_SOFT });
  const cell = (x, y, label, v) => { figSay(g, label, x + 5, y + 9, { size: 6, ink: FIG_SOFT }); figSay(g, figFit(g, v, RC / 3 - 10, 8), x + 5, y + 20, { size: 8 }); };
  cell(tx, by + 40, 'Scale', ratio[1]); cell(tx + RC / 3, by + 40, 'Units', 'mm, degrees'); cell(tx + 2 * RC / 3, by + 40, 'Sheet', o.sheet + ', 1 of 1');
  cell(tx, by + 66, 'Date', new Date().toISOString().slice(0, 10)); cell(tx + RC / 3, by + 66, 'Drawn by', o.by || '—'); cell(tx + 2 * RC / 3, by + 66, 'Drawn with', 'JEKray');
  return { g, unit: 'pt', dpi: 300, note: o.sheet + ' landscape, scale ' + ratio[1] + (callouts ? ', ' + parts.length + ' parts listed' : '') };
}

/* ---- Presentation ---- */
function slidesFigure(o) {
  const [SW, SH] = o.size === '43' ? [1600, 1200] : [1920, 1080];
  const fig = { plain: true };
  const { rec, box, s } = figFitted(fig, Math.round(SH / 40), b => Math.min(SW * 0.9 / b.w, SH * 0.86 / b.h));
  const g = new VecCtx(SW, SH, { res: 1 });
  const ox = (SW - box.w * s) / 2, oy = (SH - box.h * s) / 2, light = benchLight();
  g.fillStyle = benchBg(); g.fillRect(0, 0, SW, SH);
  if (benchHoles()) {
    // the breadboard's 25 mm holes, as the bench draws them, over the whole slide
    const k = V().scale * s, r = Math.min(light ? 3.5 : 5, Math.max(1, (light ? 2.2 : 3) * k)) * SH / 800;   // as on a screen, a little larger for a slide's pixels
    const wxOf = X => (X - ox) / s + box.x, wyOf = Y => (Y - oy) / s + box.y;           // slide to canvas pixels
    const toW = (px, py) => [V().cx + (px - W / 2) / V().scale, V().cy - (py - H / 2) / V().scale];
    const [a0, b1] = toW(wxOf(0), wyOf(0)), [a1, b0] = toW(wxOf(SW), wyOf(SH));
    g.fillStyle = light ? 'rgba(95,75,45,0.15)' : '#343d44';
    if (25 * k > 6) for (let x = Math.floor(a0 / 25) * 25; x <= a1; x += 25) for (let y = Math.floor(b0 / 25) * 25; y <= b1; y += 25) {
      g.beginPath(); g.arc(ox + (sx(x) - box.x) * s, oy + (sy(y) - box.y) * s, r, 0, 2 * Math.PI); g.fill();
    }
  }
  figPlace(g, rec, box, ox, oy, s, 1);
  figSay(g, 'Made with JEKray · jeksys.net', SW - 24, SH - 20, { size: Math.round(SH / 70), align: 'right', ink: light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)' });
  return { g, unit: '', dpi: 72, note: SW + ' × ' + SH + ' pixels, the bench as it looks' };
}

/* the figure for a preset and its choices; the view framed to fit while it is drawn, then put back */
export function makeFigure(preset, o) {
  let in3d = false;
  try { in3d = V3D.active(); } catch (err) { in3d = false; }
  if (in3d) throw new Error('switch to the 2D view first');
  const keep = Object.assign({}, V());
  fitView(true);
  try {
    const opts = Object.assign({}, FIGURE_DEFAULTS[preset], o);
    return Object.assign(preset === 'technical' ? technicalFigure(opts) : preset === 'slides' ? slidesFigure(opts) : journalFigure(opts), { opts });
  } finally { Object.assign(V(), keep); requestRender(); }
}
export const figureSvg = (F, title) => layoutSvg(F.g, title || project.name, F.unit);
/* the figure as a picture: its SVG drawn at the dpi asked, on white (or the slide's own colour) */
function figurePng(F) {
  const k = F.dpi / 72, svg = figureSvg(F), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  return new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = Math.round(F.g.w * k); c.height = Math.round(F.g.h * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? ok(b) : no(new Error('the picture could not be made here')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error('the picture could not be made here')); };
    img.src = url;
  });
}
export async function figureBlob(F) {
  const f = F.opts.fmt;
  if (f === 'svg') return new Blob([figureSvg(F)], { type: 'image/svg+xml' });
  if (f === 'pdf') return pdfDoc([F.g], project.name);
  return figurePng(F);
}
/* File › Export figure…'s Export */
export async function exportFigure(preset, o) {
  if (!accountGate('export a figure')) return null;
  try {
    const F = makeFigure(preset, o), ext = F.opts.fmt === 'svg' ? 'svg' : F.opts.fmt === 'pdf' ? 'pdf' : 'png';
    const name = safeFileName(project.name) + ' - ' + (FIGURE_PRESETS.find(p => p[0] === preset) || [0, 'figure'])[1].toLowerCase() + '.' + ext;
    downloadFile(name, await figureBlob(F));
    track('export', 'figure.' + preset);
    toast('Saved ' + name);
    return name;
  } catch (err) { toast('The figure could not be made: ' + err.message, true); return null; }
}

/* ---- the dialog ---- */
const FIG_KEY = 'jek-rt-figure';
const FIG_FIELDS = {
  journal: [['width', 'Width', [[85, 'Single column, 85 mm'], [174, 'Double column, 174 mm']]], ['mono', 'Light', [[false, 'In its colour'], [true, 'Black']]],
    ['pt', 'Names', [[6, '6 pt'], [7, '7 pt'], [8, '8 pt'], [9, '9 pt'], [10, '10 pt']]], ['scaleBar', 'Scale bar', [[true, 'Yes'], [false, 'No']]],
    ['fmt', 'As', [['pdf', 'PDF (vector)'], ['svg', 'SVG (vector)'], ['png', 'PNG, 600 dpi']]]],
  technical: [['sheet', 'Sheet', [['A4', 'A4'], ['A3', 'A3']]], ['dims', 'Dimensions', [[true, 'Between the parts’ centres'], [false, 'None']]],
    ['callouts', 'Callouts', [[true, 'Numbered, with a parts list'], [false, 'The parts’ names']]], ['mono', 'Light', [[true, 'Black'], [false, 'In its colour']]],
    ['title', 'Title', 'text'], ['by', 'Drawn by', 'text'], ['fmt', 'As', [['pdf', 'PDF (vector)'], ['svg', 'SVG (vector)'], ['png', 'PNG, 300 dpi']]]],
  slides: [['size', 'Slide', [['169', '16:9, 1920 × 1080'], ['43', '4:3, 1600 × 1200']]], ['fmt', 'As', [['png', 'PNG'], ['svg', 'SVG (vector)'], ['pdf', 'PDF (vector)']]]],
};
let figDlg = null, figUrl = null;
const figKept = () => { try { return JSON.parse(localStorage.getItem(FIG_KEY)) || {}; } catch (err) { return {}; } };
function figState() {
  const k = figKept(), preset = FIGURE_DEFAULTS[k.preset] ? k.preset : 'journal';
  return { preset, o: Object.assign({}, FIGURE_DEFAULTS[preset], k[preset] || {}) };
}
function figKeep(st) { try { const k = figKept(); k.preset = st.preset; k[st.preset] = st.o; localStorage.setItem(FIG_KEY, JSON.stringify(k)); } catch (err) { /* this visit only */ } }
function figFill() {
  const st = figState(), opts = figDlg.querySelector('.rt-figopts'), tabs = figDlg.querySelector('.rt-figtabs');
  tabs.replaceChildren(...FIGURE_PRESETS.map(([k, label]) => h('button', { type: 'button', class: 'rt-btn' + (k === st.preset ? ' on' : ''), role: 'tab', 'aria-selected': k === st.preset ? 'true' : 'false', 'data-preset': k,
    onclick: () => { const s2 = figState(); s2.preset = k; s2.o = Object.assign({}, FIGURE_DEFAULTS[k], figKept()[k] || {}); figKeep(s2); figFill(); } }, label)));
  opts.replaceChildren();
  for (const [key, label, choices] of FIG_FIELDS[st.preset]) {
    let field;
    if (choices === 'text') {
      field = h('input', { type: 'text', value: st.o[key] || '', placeholder: key === 'title' ? project.name : 'Optional', 'data-key': key });
      field.addEventListener('change', () => { const s2 = figState(); s2.o[key] = field.value.trim(); figKeep(s2); figPreview(); });
    } else {
      field = h('select', { 'data-key': key, 'aria-label': label });
      for (const [v, t] of choices) field.append(h('option', { value: String(v), selected: String(st.o[key]) === String(v) }, t));
      field.addEventListener('change', () => {
        const s2 = figState(), v = choices.find(c => String(c[0]) === field.value)[0];
        s2.o[key] = v; figKeep(s2); figPreview();
      });
    }
    opts.append(h('label', { class: 'rt-figrow' }, h('span', null, label), field));
  }
  figPreview();
}
function figPreview() {
  const st = figState(), img = figDlg.querySelector('.rt-figprev img'), note = figDlg.querySelector('.rt-fignote');
  try {
    const F = makeFigure(st.preset, st.o);
    if (figUrl) URL.revokeObjectURL(figUrl);
    const svg = figureSvg(F);
    figDlg.figSvg = svg;                                             // the preview's text (the tests read it)
    figUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.src = figUrl; img.hidden = false;
    note.textContent = F.note + '.';
  } catch (err) { img.hidden = true; note.textContent = 'No preview: ' + err.message + '.'; }
}
export function openFigure() {
  if (!figDlg) {
    figDlg = h('dialog', { class: 'rt-dialog rt-wide rt-figure', id: 'figureDialog', 'aria-labelledby': 'figureTitle' },
      h('h2', { id: 'figureTitle' }, 'Export figure'),
      h('p', null, 'The bench as a figure for a paper, a drawing to build from, or a slide. ', h('a', { class: 'rt-link', href: '/jek/docs/jekray/figures/', target: '_blank', rel: 'noopener' }, 'What each one is')),
      h('div', { class: 'rt-figtabs', role: 'tablist', 'aria-label': 'The kind of figure' }),
      h('div', { class: 'rt-figbody' }, h('div', { class: 'rt-figopts' }), h('div', { class: 'rt-figprev' }, h('img', { alt: 'Preview of the figure' }))),
      h('p', { class: 'note rt-fignote', 'aria-live': 'polite' }),
      h('div', { class: 'rt-actions' },
        h('button', { class: 'rt-btn', type: 'button', onclick: () => figDlg.close() }, 'Close'),
        h('button', { class: 'rt-btn primary', type: 'button', id: 'figureGo', onclick: async e => {
          const b = e.currentTarget, st = figState(); b.disabled = true;
          try { if (await exportFigure(st.preset, st.o)) figDlg.close(); } finally { b.disabled = false; }
        } }, 'Export')));
    needMark(figDlg.querySelector('#figureGo'), 'account', 'export a figure');
    document.body.append(figDlg);
  }
  figDlg.showModal();
  figFill();
}
/* the page's wiring for this module: done once, from boot.js */
export function wireFigure() {
  const b = document.getElementById('btnExportFigure');
  if (b) b.addEventListener('click', () => openFigure());
}
