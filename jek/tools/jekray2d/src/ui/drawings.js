import { EMBED, IN_WORKER, clamp, mkCanvas } from '../core/constants.js';
import { DRAW_DASH, DRAW_FONTS, DRAW_SHAPES, hexColour, normDraw } from '../state/drawings.js';
import { V, deg, extraSel, nextName, project, selectOne, selectedId, typeLabel, uid } from '../state/project.js';
import { getEl, normElement, selected } from '../state/elements.js';
import { onTab } from '../state/tabs.js';
import { frame, toLocal, toWorld, toWorldDir } from '../core/mask.js';
import { exporting } from '../engines/trace.js';
import {
  benchLight, canvas, ctx, getCss, halfSize, pathLocal, requestRender, selFibreId, selInk, selection,
  setSelFibreId, srcBody, stage, sx, sy, wx, wy
} from './render.js';
import { drag, hitTest, inPolygon, setDrag, snapVal } from './pointer.js';
import { FC_W, fcH } from '../engines/fibre.js';
import { beginEdit, bindSync, endEdit, fid, h, numInput, panel, renderPanel, setFid, syncPanel, vs } from './panel.js';
import { changed, moveEls, rotateEls, toast } from './actions.js';
import { checkpoint } from './tabs.js';
import { palette } from './experimental.js';
import { rail, setPalette } from './rail.js';

const DRAW_STYLE_KEYS = ['fill', 'fillOpacity', 'stroke', 'strokeOpacity', 'strokeWidth', 'dash', 'cap', 'join', 'opacity', 'layer'];
const fontFamily = k => { const v = DRAW_FONTS[k][1]; return v.startsWith('--') ? (IN_WORKER ? 'sans-serif' : getCss(v)) : v; };
const fontOf = (el, px) => (el.italic ? 'italic ' : '') + (el.bold ? '700 ' : '400 ') + px + 'px ' + fontFamily(el.font);
let measureCtx = null;
function textLines(el) {
  const lines = el.text.split('\n');
  if (!measureCtx) measureCtx = mkCanvas(4, 4).getContext('2d');
  measureCtx.font = fontOf(el, 100);
  const w = lines.map(t => measureCtx.measureText(t).width * el.size / 100), L = el.size * 1.25;
  const W = Math.max(el.size * 0.3, ...w), H = lines.length * L, top = 0.95 * el.size;
  const x0 = el.align === 'left' ? 0 : el.align === 'right' ? -W : -W / 2;
  return { lines, L, W, H, box: [x0, top - H, x0 + W, top] };
}
const rectSegs = (x0, y0, x1, y1) => ({ p0: [x0, y0], closed: true, segs: [[[x0, y0], [x1, y0], [x1, y0]], [[x1, y0], [x1, y1], [x1, y1]], [[x1, y1], [x0, y1], [x0, y1]], [[x0, y1], [x0, y0], [x0, y0]]] });
/* the matrix on a drawing's shape (skew), and the way to and from the bench */
const mApply = (m, p) => m ? [m[0] * p[0] + m[2] * p[1], m[1] * p[0] + m[3] * p[1]] : p;
const mInv = (m, p) => { if (!m) return p; const det = m[0] * m[3] - m[1] * m[2]; return [(m[3] * p[0] - m[2] * p[1]) / det, (-m[1] * p[0] + m[0] * p[1]) / det]; };
const mMul = (A, B) => { A = A || [1, 0, 0, 1]; B = B || [1, 0, 0, 1]; return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3]].map(v => +v.toFixed(6)); };
const mClean = m => m && Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(m[3] - 1) < 1e-9 ? undefined : m;
const shapeToWorld = (el, p) => toWorld(frame(el), ...mApply(el.m, p));
const worldToShape = (el, X, Y) => mInv(el.m, toLocal(frame(el), X, Y));
/* a point snapped to the nearest 15 degrees round another (Ctrl), keeping its distance */
export function snap15(ox, oy, x, y) { const a = Math.round(Math.atan2(y - oy, x - ox) / (15 * deg)) * 15 * deg, L = Math.hypot(x - ox, y - oy); return [ox + L * Math.cos(a), oy + L * Math.sin(a)]; }
/* its outline as cubic Béziers in its own frame, skewed as it is: a start and [c1, c2, end] for each piece */
function drawSegs(el) {
  const g = drawSegs0(el);
  if (!el.m) return g;
  const M = p => mApply(el.m, p);
  return { p0: M(g.p0), closed: g.closed, segs: g.segs.map(q => q.map(M)) };
}
function drawSegs0(el) {
  const K = 0.5522847498;
  if (el.shape === 'text') return rectSegs(...textLines(el).box);
  if (el.shape === 'ellipse') {
    const a = el.rx, b = el.ry;
    return { p0: [a, 0], closed: true, segs: [[[a, K * b], [K * a, b], [0, b]], [[-K * a, b], [-a, K * b], [-a, 0]],
      [[-a, -K * b], [-K * a, -b], [0, -b]], [[K * a, -b], [a, -K * b], [a, 0]]] };
  }
  if (el.shape === 'rect') {
    const w = el.w / 2, hh = el.h / 2, r = Math.min(el.r, w, hh), k = r * K, segs = [];
    const line = (a, b) => segs.push([a, b, b]);
    let at = [-w + r, -hh];
    const to = p => { line(at, p); at = p; };
    const arc = (c1, c2, p) => { if (r > 0) segs.push([c1, c2, p]); at = p; };
    to([w - r, -hh]); arc([w - r + k, -hh], [w, -hh + r - k], [w, -hh + r]);
    to([w, hh - r]); arc([w, hh - r + k], [w - r + k, hh], [w - r, hh]);
    to([-w + r, hh]); arc([-w + r - k, hh], [-w, hh - r + k], [-w, hh - r]);
    to([-w, -hh + r]); arc([-w, -hh + r - k], [-w + r - k, -hh], [-w + r, -hh]);
    return { p0: [-w + r, -hh], closed: true, segs };
  }
  const N = el.nodes, segs = [], add = (a, b) => segs.push([[a.x + (a.h2 ? a.h2[0] : 0), a.y + (a.h2 ? a.h2[1] : 0)], [b.x + (b.h1 ? b.h1[0] : 0), b.y + (b.h1 ? b.h1[1] : 0)], [b.x, b.y]]);
  for (let i = 1; i < N.length; i++) add(N[i - 1], N[i]);
  if (el.closed && N.length > 2) add(N[N.length - 1], N[0]);
  return { p0: [N[0].x, N[0].y], closed: !!el.closed && N.length > 2, segs };
}
const bez4 = (a, b, c, d, t) => { const u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]; };
/* the outline as points, in its own frame: for hits and extents */
function drawPoly(el, n = 16) {
  const g = drawSegs(el), out = [g.p0];
  let at = g.p0;
  for (const [c1, c2, p] of g.segs) {
    const straight = c1[0] === at[0] && c1[1] === at[1] && c2[0] === p[0] && c2[1] === p[1];
    if (straight) out.push(p); else for (let i = 1; i <= n; i++) out.push(bez4(at, c1, c2, p, i / n));
    at = p;
  }
  return out;
}
function drawBox(el) {
  const P = drawPoly(el, 8);
  return [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))];
}
export const drawHalf = el => Math.max(0.5, ...drawPoly(el, 8).map(p => Math.hypot(p[0], p[1]))) + el.strokeWidth / 2;
function drawTrace(c, el) {
  const f = frame(el), P = p => { const [x, y] = toWorld(f, p[0], p[1]); return [sx(x), sy(y)]; };
  const g = drawSegs(el), a = P(g.p0);
  c.beginPath(); c.moveTo(a[0], a[1]);
  for (const [c1, c2, p] of g.segs) { const A = P(c1), B = P(c2), C = P(p); c.bezierCurveTo(A[0], A[1], B[0], B[1], C[0], C[1]); }
  if (g.closed) c.closePath();
}
const rgbaHex = (hex, a) => 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16) + ',' + (+a.toFixed(3)) + ')';
export function drawDrawing(el, sel) {
  if (el.shape === 'text') drawText(el);
  else drawShape(el);
  if (sel && !exporting) {                       // its box, dashed, to mark what is selected
    const [x0, y0, x1, y1] = drawBox(el), f = frame(el), m = 3 / V().scale;
    pathLocal(f, [[x0 - m, y0 - m], [x1 + m, y0 - m], [x1 + m, y1 + m], [x0 - m, y1 + m]], true);
    ctx.save(); ctx.strokeStyle = selInk(0.8); ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.restore();
  }
}
function drawText(el) {
  if ((textEdit && textEdit.el === el) || el.fill === 'none') return;      // the editor shows it while it is typed
  const t = textLines(el), s = V().scale, px = el.size * s;
  if (px < 0.5) return;
  ctx.save();
  ctx.translate(sx(el.x), sy(el.y)); ctx.rotate(-el.angle * deg);
  if (el.m) ctx.transform(el.m[0], -el.m[1], -el.m[2], el.m[3], 0, 0);   // skewed (the screen's y is down)
  ctx.font = fontOf(el, +px.toFixed(3)); ctx.textAlign = el.align; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = rgbaHex(el.fill, el.fillOpacity * el.opacity);
  const fill = Object.getPrototypeOf(ctx).fillText;               // its own colour on any bench, not the bench's ink
  t.lines.forEach((ln, i) => fill.call(ctx, ln, 0, i * t.L * s));
  ctx.restore();
}
function drawShape(el) {
  ctx.save();
  drawTrace(ctx, el);
  if (el.fill !== 'none' && el.fillOpacity * el.opacity > 0) { ctx.fillStyle = rgbaHex(el.fill, el.fillOpacity * el.opacity); ctx.fill(); }
  if (el.stroke !== 'none' && el.strokeWidth > 0 && el.strokeOpacity * el.opacity > 0) {
    const lw = Math.max(0.5, el.strokeWidth * V().scale);
    ctx.strokeStyle = rgbaHex(el.stroke, el.strokeOpacity * el.opacity); ctx.lineWidth = lw;
    ctx.lineCap = el.cap; ctx.lineJoin = el.join; ctx.setLineDash(DRAW_DASH[el.dash].map(v => v * lw));
    ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}
export function hitDrawing(el, lx, ly, tol) {
  const P = drawPoly(el, 16), t = tol + el.strokeWidth / 2;
  if (el.shape === 'text') return inPolygon(P, lx, ly, tol);
  if (el.fill !== 'none' && inPolygon(P, lx, ly, t)) return true;
  if (el.stroke === 'none' && el.fill !== 'none') return false;
  const closed = el.shape !== 'path' || (el.closed && el.nodes.length > 2);
  for (let i = 1; i < P.length + (closed ? 1 : 0); i++) {
    const a = P[i - 1], b = P[i % P.length], ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey || 1;
    const u = clamp(((lx - a[0]) * ex + (ly - a[1]) * ey) / L2, 0, 1);
    if (Math.hypot(lx - a[0] - u * ex, ly - a[1] - u * ey) <= t) return true;
  }
  return false;
}

/* ---------- the tools ---------- */
export const DRAW_TOOLS = [
  ['select', 'Select', 'S', 'Select and move drawings: click one, drag it to move it, drag on the bench for a box. Parts stay put in Draw; drag a part\u2019s name to move it.',
    '<path d="M6 3v16l4.2-4.1 2.9 6.4 2.6-1.2-2.9-6.2H18Z" fill="currentColor"/>'],
  ['node', 'Node tool', 'N', 'Node tool: drag a node or a handle. Double-click a path to add a node, a node to make it smooth or a corner; Delete removes the node picked.',
    '<path d="M4 18C7 6 15 6 19 16" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 5l7 2" stroke="currentColor" stroke-width="1"/><rect x="2" y="16" width="4" height="4" fill="currentColor"/><rect x="17" y="14" width="4" height="4" fill="currentColor"/><circle cx="8" cy="5" r="1.8" fill="currentColor"/><circle cx="15" cy="7" r="1.8" fill="currentColor"/>'],
  ['rect', 'Rectangle', 'F4', 'Rectangle: drag to draw one. Ctrl: a square. Shift: from its middle. Round its corners with the node tool or its panel.',
    '<rect x="3.5" y="6" width="17" height="12" fill="none" stroke="currentColor" stroke-width="1.8"/>'],
  ['ellipse', 'Ellipse', 'E', 'Ellipse: drag to draw one. Ctrl: a circle. Shift: from its middle.',
    '<ellipse cx="12" cy="12" rx="8.5" ry="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/>'],
  ['text', 'Text', 'T', 'Text: click on the bench to write, or on a text or a part\u2019s name to change it. Enter starts a new line (a name has one); Escape or a click elsewhere finishes.',
    '<path d="M5 5h14v3.5M5 5v3.5M12 5v14M9 19h6" fill="none" stroke="currentColor" stroke-width="2"/>'],
  ['pen', 'Pen', 'B', 'Pen: click for a corner, drag for a curve. Click the first node to close the path; Enter, a double-click or a right-click ends it, Backspace takes the last node off, Escape drops it.',
    '<path d="M4 20l1.2-5.2L16 4l4 4L9.2 18.8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 20l5-5" stroke="currentColor" stroke-width="1.2"/><circle cx="9.7" cy="14.3" r="1.3" fill="currentColor"/>'],
];
export const partsLocked = () => palette === 'draw';
export const DRAW_DRAGS = new Set(['drawshape', 'pen', 'dnode', 'dscale', 'label']);
export let penEnded = 0, textEdit = null, labelSelId = null, drawTool = 'select', penDraft = null, penCursor = null, drawNodeSel = null;    // drawNodeSel: { id, i } a path's picked node
export function setPenEnded(v) { return (penEnded = v); }
export function setPenCursor(v) { return (penCursor = v); }
export const drawIcon = k => { const s = document.createElement('span'); s.className = 'rt-dicon'; s.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' + DRAW_TOOLS.find(t => t[0] === k)[4] + '</svg>'; return s; };
const DRAW_STYLE_KEY = 'jek-raytracer-drawstyle';
/* the style a new drawing takes: the last one set */
function drawStyleNow() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(DRAW_STYLE_KEY) || '{}') || {}; } catch (err) { s = {}; }
  if (!s.stroke) s.stroke = benchLight() ? '#1b2328' : '#e8edf0';
  return s;
}
function keepDrawStyle(el) {
  const s = drawStyleNow();
  if (el.shape === 'text') Object.assign(s, { textFill: el.fill, textSize: el.size, textFont: el.font, textBold: el.bold, textItalic: el.italic });   // a text's own: it does not set the shapes' fill
  else for (const k of DRAW_STYLE_KEYS) s[k] = el[k];
  try { localStorage.setItem(DRAW_STYLE_KEY, JSON.stringify(s)); } catch (err) { /* not kept: fine */ }
}
export function setDrawTool(t) {
  if (penDraft && t !== 'pen') finishPen(false);
  drawTool = t;
  if (t !== 'select' && palette !== 'draw') setPalette('draw');
  if (t !== 'node') drawNodeSel = null;
  if (t !== 'text') closeTextEdit();
  canvas.classList.toggle('drawing', t === 'rect' || t === 'ellipse' || t === 'pen');
  canvas.classList.toggle('texting', t === 'text');
  drawToolsShown();
  requestRender();
}
export function drawToolsShown() {
  rail.querySelectorAll('[data-dtool]').forEach(b => { const on = b.dataset.dtool === drawTool; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  drawBarShown();
  const bar = document.getElementById('drawHint');
  if (!bar) return;
  bar.hidden = palette !== 'draw' || EMBED;
  const T = DRAW_TOOLS.find(t => t[0] === drawTool);
  bar.textContent = T[3];
}
/* a new drawing from what the tool made, in world mm, on this tab, and selected */
function addDrawing(props) {
  checkpoint();
  const el = normElement(Object.assign({ type: 'draw', name: nextName(DRAW_SHAPES[props.shape]), angle: 0 }, drawStyleNow(), props));
  el.bench = project.tab;
  project.elements.push(el);
  selectOne(el.id);
  changed(true);
  return el;
}
export function finishPen(keep = true) {
  const d = penDraft;
  penDraft = null; penCursor = null;
  if (!keep || !d || d.nodes.length < 2) { requestRender(); return; }
  const xs = d.nodes.map(n => n.x), ys = d.nodes.map(n => n.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  addDrawing({ shape: 'path', x: +cx.toFixed(4), y: +cy.toFixed(4), closed: !!d.closed && d.nodes.length > 2,
    nodes: d.nodes.map(n => ({ x: +(n.x - cx).toFixed(4), y: +(n.y - cy).toFixed(4), h1: n.h1, h2: n.h2, smooth: n.smooth })) });
}
/* the grips the node tool offers on a drawing: where they are on screen */
function drawGrips(el) {
  const S = p => { const [x, y] = shapeToWorld(el, p); return [sx(x), sy(y)]; }, out = [];
  if (el.shape === 'rect') {
    for (const [gx, gy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) out.push({ k: 'corner', gx, gy, at: S([gx * el.w / 2, gy * el.h / 2]) });
    const rx = Math.max(el.r, Math.min(el.w / 2, 10 / V().scale));            // clear of the corner, even when square
    out.push({ k: 'radius', at: S([el.w / 2 - rx, el.h / 2]), round: true });
  } else if (el.shape === 'ellipse') {
    out.push({ k: 'rx', at: S([el.rx, 0]) }, { k: 'ry', at: S([0, el.ry]) });
  } else {
    el.nodes.forEach((n, i) => {
      for (const hk of ['h1', 'h2']) if (n[hk]) out.push({ k: hk, i, round: true, at: S([n.x + n[hk][0], n.y + n[hk][1]]), from: S([n.x, n.y]) });
    });
    el.nodes.forEach((n, i) => out.push({ k: 'node', i, at: S([n.x, n.y]), smooth: !!n.smooth }));
  }
  return out;
}
function drawGripAt(el, px, py) {
  const G = drawGrips(el);
  for (let i = G.length - 1; i >= 0; i--) if (Math.hypot(px - G[i].at[0], py - G[i].at[1]) <= 7) return G[i];
  return null;
}
const nodeDrawing = () => { const el = selected(); return drawTool === 'node' && el && el.type === 'draw' && !extraSel.size && onTab(el) && !el.locked ? el : null; };
/* the pointer pressed with a drawing tool: true if the tool took it */
export function drawDown(px, py, e) {
  if (drawTool === 'select') {
    // a drawing's scale handles, or a part's name (moved, or scaled by its corner)
    const el = scaleDrawing(), g = el && scaleGrips(el).find(q => Math.hypot(px - q.at[0], py - q.at[1]) <= 7);
    if (g) { setDrag({ mode: 'dscale', el, g, orig: JSON.parse(JSON.stringify(el)), started: false, px0: px, py0: py }); return true; }
    const lab = labelAt(px, py);
    if (lab && (lab.k === 'scale' || !hitTest(px, py))) {
      // in Draw just the name is picked, not its part; elsewhere the part with it
      if (partsLocked()) { if (selectedId || extraSel.size || selFibreId) { selectOne(null); setSelFibreId(null); renderPanel(); } }
      else if (selectedId !== lab.el.id || extraSel.size) { selectOne(lab.el.id); setSelFibreId(null); renderPanel(); }
      labelSelId = lab.el.id;
      const B = labelBoxes.get(lab.el.id), L = lab.el.label || { dx: wx(B.ax) - lab.el.x, dy: wy(B.ay) - lab.el.y, s: 1 };
      setDrag({ mode: 'label', el: lab.el, k: lab.k, start: Object.assign({}, L), ax: B.ax, ay: B.ay, px0: px, py0: py, started: false });
      requestRender();
      return true;
    }
    labelSelId = null;
    return false;
  }
  if (drawTool === 'text') {
    const lab = labelAt(px, py);
    if (lab) { if (!partsLocked()) { selectOne(lab.el.id); renderPanel(); } editText(lab.el, 'name'); return true; }
    const hit = hitTest(px, py);
    if (hit && hit.type === 'draw' && hit.shape === 'text') { selectOne(hit.id); renderPanel(); editText(hit, 'text'); return true; }
    if (textEdit) { closeTextEdit(); return true; }            // a click away finishes the one being typed
    const st = drawStyleNow();
    const el = addDrawing({ shape: 'text', x: snapVal(wx(px), e), y: snapVal(wy(py), e), text: '', stroke: 'none',
      fill: st.textFill || (st.stroke !== 'none' ? st.stroke : '#e8edf0'), size: st.textSize || +(14 / V().scale).toPrecision(2), font: st.textFont, bold: st.textBold, italic: st.textItalic });
    editText(el, 'text', true);
    return true;
  }
  if (drawTool === 'rect' || drawTool === 'ellipse') {
    setDrag({ mode: 'drawshape', kind: drawTool, px0: px, py0: py, cur: null });
    return true;
  }
  if (drawTool === 'pen') {
    let x = snapVal(wx(px), e), y = snapVal(wy(py), e);
    const now = performance.now();
    if (!penDraft) penDraft = { nodes: [], t: 0 };
    const N = penDraft.nodes, last = N[N.length - 1];
    if (last && (e.ctrlKey || e.metaKey)) [x, y] = snap15(last.x, last.y, wx(px), wy(py));        // Ctrl: 15 degrees round the last node
    // a second click where the last one was: the path is done
    if (last && now - penDraft.t < 400 && Math.hypot(sx(last.x) - px, sy(last.y) - py) < 5) { finishPen(); return true; }
    if (N.length >= 2 && Math.hypot(sx(N[0].x) - px, sy(N[0].y) - py) < 8) { penDraft.closed = true; finishPen(); return true; }
    N.push({ x, y, h1: null, h2: null });
    penDraft.t = now;
    setDrag({ mode: 'pen', px0: px, py0: py, started: false });
    requestRender();
    return true;
  }
  const el = nodeDrawing();
  if (el) {
    const g = drawGripAt(el, px, py);
    if (g) {
      if (g.k === 'node' || g.k === 'h1' || g.k === 'h2') { drawNodeSel = { id: el.id, i: g.i }; renderPanel(); }
      setDrag({ mode: 'dnode', el, g, started: false, px0: px, py0: py });
      requestRender();
      return true;
    }
    drawNodeSel = null;
  }
  return false;
}
export function drawMove(px, py, e) {
  if (drag.mode === 'label') {
    if (!drag.started) { if (Math.hypot(px - drag.px0, py - drag.py0) < 2) return; checkpoint(); drag.started = true; }
    const S = drag.start, el = drag.el;
    if (drag.k === 'scale') {
      const d0 = Math.hypot(drag.px0 - drag.ax, drag.py0 - drag.ay) || 1, d1 = Math.hypot(px - drag.ax, py - drag.ay);
      el.label = { dx: S.dx, dy: S.dy, s: +clamp(S.s * d1 / d0, 0.4, 8).toFixed(3) };
    } else el.label = { dx: +(S.dx + (px - drag.px0) / V().scale).toFixed(4), dy: +(S.dy - (py - drag.py0) / V().scale).toFixed(4), s: S.s };
    requestRender();
    return;
  }
  if (drag.mode === 'dscale') {
    if (!drag.started) { if (Math.hypot(px - drag.px0, py - drag.py0) < 2) return; checkpoint(); drag.started = true; }
    if (drag.g.kind === 'scale') scaleMove(drag, px, py, e.ctrlKey || e.metaKey); else rotSkewMove(drag, px, py, e.ctrlKey || e.metaKey);
    syncPanel(); requestRender();
    return;
  }
  if (drag.mode === 'drawshape') { drag.cur = [px, py]; drag.sq = e.ctrlKey || e.metaKey; drag.mid = e.shiftKey; requestRender(); return; }
  if (drag.mode === 'pen') {
    // dragged: the node gets handles, symmetric, along the drag (a smooth node)
    if (!drag.started && Math.hypot(px - drag.px0, py - drag.py0) < 3) return;
    drag.started = true;
    const n = penDraft.nodes[penDraft.nodes.length - 1];
    let [hx, hy] = [wx(px), wy(py)];
    if (e.ctrlKey || e.metaKey) [hx, hy] = snap15(n.x, n.y, hx, hy);
    const dx = hx - n.x, dy = hy - n.y;
    n.h2 = [dx, dy]; n.h1 = [-dx, -dy]; n.smooth = true;
    requestRender();
    return;
  }
  // the node tool: a grip dragged
  const { el, g } = drag;
  if (!drag.started) { if (Math.hypot(px - drag.px0, py - drag.py0) < 2) return; checkpoint(); drag.started = true; }
  const ctrl = e.ctrlKey || e.metaKey;
  let X = ctrl ? wx(px) : snapVal(wx(px), e), Y = ctrl ? wy(py) : snapVal(wy(py), e);
  if (ctrl && el.shape === 'path' && (g.k === 'node' || g.k === 'h1' || g.k === 'h2')) {
    // the point it hangs from: a handle's node, a node's neighbour along the path
    const N = el.nodes, i = g.i, q = g.k !== 'node' ? N[i] : N[i - 1] || (el.closed ? N[N.length - 1] : N[i + 1]);
    if (q && q !== (g.k === 'node' ? N[i] : null)) { const [ox, oy] = shapeToWorld(el, [q.x, q.y]); [X, Y] = snap15(ox, oy, X, Y); }
  }
  const [lx, ly] = worldToShape(el, X, Y);
  if (g.k === 'corner') {
    const ox = -g.gx * el.w / 2, oy = -g.gy * el.h / 2;                     // the corner across from it stays put
    const nw = Math.max(0.01, Math.abs(lx - ox)), nh = Math.max(0.01, Math.abs(ly - oy));
    const cx = ox + Math.sign(lx - ox || g.gx) * nw / 2, cy = oy + Math.sign(ly - oy || g.gy) * nh / 2;
    const [wx2, wy2] = shapeToWorld(el, [cx, cy]);
    if (Math.sign(lx - ox || g.gx) !== g.gx) g.gx = -g.gx;
    if (Math.sign(ly - oy || g.gy) !== g.gy) g.gy = -g.gy;
    el.w = +nw.toFixed(4); el.h = +nh.toFixed(4); el.x = +wx2.toFixed(4); el.y = +wy2.toFixed(4);
    el.r = Math.min(el.r, el.w / 2, el.h / 2);
  } else if (g.k === 'radius') el.r = +clamp(el.w / 2 - lx, 0, Math.min(el.w, el.h) / 2).toFixed(4);
  else if (g.k === 'rx') { el.rx = Math.max(0.01, +Math.abs(lx).toFixed(4)); if (ctrl) el.ry = el.rx; }
  else if (g.k === 'ry') { el.ry = Math.max(0.01, +Math.abs(ly).toFixed(4)); if (ctrl) el.rx = el.ry; }
  else {
    const n = el.nodes[g.i];
    if (g.k === 'node') { n.x = +lx.toFixed(4); n.y = +ly.toFixed(4); }
    else {
      const o = g.k === 'h1' ? 'h2' : 'h1', d = [+(lx - n.x).toFixed(4), +(ly - n.y).toFixed(4)];
      n[g.k] = d;
      // a smooth node keeps its handles in line, each its own length
      if (n.smooth && n[o]) { const L = Math.hypot(...n[o]), M = Math.hypot(...d) || 1; n[o] = [-d[0] / M * L, -d[1] / M * L]; }
    }
  }
  syncPanel(); requestRender();
}
export function drawUp(e) {
  const d = drag;
  setDrag(null); canvas.classList.remove('dragging');
  if (d.mode === 'pen') { requestRender(); return; }
  if (d.mode === 'dnode' || d.mode === 'dscale' || d.mode === 'label') { if (d.started) changed(); else requestRender(); return; }
  // a rectangle or an ellipse: a click (no drag) picks what is there instead
  if (!d.cur || Math.hypot(d.cur[0] - d.px0, d.cur[1] - d.py0) < 3) {
    const hit = hitTest(d.px0, d.py0);
    selectOne(hit ? hit.id : null); setSelFibreId(null); renderPanel(); requestRender();
    return;
  }
  const b = shapeBox(d, { shiftKey: false });
  addDrawing(d.kind === 'rect' ? { shape: 'rect', x: b.cx, y: b.cy, w: b.w, h: b.h } : { shape: 'ellipse', x: b.cx, y: b.cy, rx: b.w / 2, ry: b.h / 2 });
}
/* the box a rectangle or ellipse drag spans, in world mm: Ctrl square, Shift from its middle */
function shapeBox(d, e) {
  const ax = snapVal(wx(d.px0), e), ay = snapVal(wy(d.py0), e);
  let bx = snapVal(wx(d.cur[0]), e), by = snapVal(wy(d.cur[1]), e);
  if (d.sq) { const s = Math.max(Math.abs(bx - ax), Math.abs(by - ay)); bx = ax + Math.sign(bx - ax || 1) * s; by = ay + Math.sign(by - ay || 1) * s; }
  if (d.mid) return { cx: ax, cy: ay, w: Math.max(0.01, 2 * Math.abs(bx - ax)), h: Math.max(0.01, 2 * Math.abs(by - ay)) };
  return { cx: +((ax + bx) / 2).toFixed(4), cy: +((ay + by) / 2).toFixed(4), w: Math.max(0.01, Math.abs(bx - ax)), h: Math.max(0.01, Math.abs(by - ay)) };
}
/* what a tool shows as it works: the shape being dragged out, the pen's path so far, the node tool's grips */
export function drawToolOverlay() {
  ctx.save();
  const ink = getCss('--jek-cyan');
  if (drag && drag.mode === 'drawshape' && drag.cur) {
    const b = shapeBox(drag, { shiftKey: false }), st = drawStyleNow();
    const ghost = normDraw(Object.assign({}, st, drag.kind === 'rect' ? { shape: 'rect', w: b.w, h: b.h } : { shape: 'ellipse', rx: b.w / 2, ry: b.h / 2 }), { type: 'draw', x: b.cx, y: b.cy, angle: 0 });
    drawDrawing(ghost, false);
    drawTrace(ctx, ghost); ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
  }
  if (penDraft && penDraft.nodes.length) {
    const N = penDraft.nodes;
    if (N.length > 1) {
      const ghost = normDraw(Object.assign({}, drawStyleNow(), { shape: 'path', nodes: N, closed: false }), { type: 'draw', x: 0, y: 0, angle: 0 });
      drawDrawing(ghost, false);
    }
    // the next piece, to the pointer
    const last = N[N.length - 1];
    if (penCursor && !(drag && drag.mode === 'pen')) {
      ctx.beginPath(); ctx.moveTo(sx(last.x), sy(last.y));
      if (last.h2) ctx.quadraticCurveTo(sx(last.x + last.h2[0]), sy(last.y + last.h2[1]), penCursor[0], penCursor[1]); else ctx.lineTo(penCursor[0], penCursor[1]);
      ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const n of N) {
      for (const hk of ['h1', 'h2']) if (n[hk]) {
        ctx.beginPath(); ctx.moveTo(sx(n.x), sy(n.y)); ctx.lineTo(sx(n.x + n[hk][0]), sy(n.y + n[hk][1])); ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(sx(n.x + n[hk][0]), sy(n.y + n[hk][1]), 3, 0, Math.PI * 2); ctx.fillStyle = ink; ctx.fill();
      }
    }
    N.forEach((n, i) => { const r = i === 0 && N.length >= 2 ? 5 : 3.5; ctx.fillStyle = i === 0 && N.length >= 2 ? '#ffd36b' : ink; ctx.fillRect(sx(n.x) - r, sy(n.y) - r, 2 * r, 2 * r); });
  }
  const se = scaleDrawing();
  if (se) for (const g of scaleGrips(se)) {
    ctx.fillStyle = g.kind === 'scale' ? '#fff' : '#ffd36b'; ctx.strokeStyle = '#11181c'; ctx.lineWidth = 1;
    ctx.beginPath();
    if (g.kind === 'scale') ctx.rect(g.at[0] - 4, g.at[1] - 4, 8, 8);
    else if (g.kind === 'rot') ctx.arc(g.at[0], g.at[1], 5, 0, Math.PI * 2);
    else { const [X, Y] = g.at, a = g.gx ? 'v' : 'h'; if (a === 'h') { ctx.moveTo(X - 7, Y); ctx.lineTo(X - 2, Y - 4); ctx.lineTo(X - 2, Y + 4); ctx.closePath(); ctx.moveTo(X + 7, Y); ctx.lineTo(X + 2, Y - 4); ctx.lineTo(X + 2, Y + 4); ctx.closePath(); }
      else { ctx.moveTo(X, Y - 7); ctx.lineTo(X - 4, Y - 2); ctx.lineTo(X + 4, Y - 2); ctx.closePath(); ctx.moveTo(X, Y + 7); ctx.lineTo(X - 4, Y + 2); ctx.lineTo(X + 4, Y + 2); ctx.closePath(); } }
    ctx.fill(); ctx.stroke();
  }
  if (se && xformMode === 'rotate') {                // the middle it turns about
    const [x0, y0, x1, y1] = drawBox(se), [X, Y] = toWorld(frame(se), (x0 + x1) / 2, (y0 + y1) / 2);
    ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx(X) - 6, sy(Y)); ctx.lineTo(sx(X) + 6, sy(Y)); ctx.moveTo(sx(X), sy(Y) - 6); ctx.lineTo(sx(X), sy(Y) + 6); ctx.stroke();
  }
  const LB = labelSelId && (labelSelId === selectedId || (partsLocked() && !selectedId)) && !extraSel.size && drawTool === 'select' && labelBoxes.get(labelSelId);
  if (LB) {
    ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.setLineDash([3, 2]); ctx.strokeRect(LB.x - 2.5, LB.y - 2.5, LB.w + 5, LB.h + 5); ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#11181c'; ctx.beginPath(); ctx.rect(LB.x + LB.w - 4, LB.y + LB.h - 4, 8, 8); ctx.fill(); ctx.stroke();
  }
  const el = nodeDrawing();
  if (el) {
    for (const g of drawGrips(el)) {
      if (g.from) { ctx.beginPath(); ctx.moveTo(g.from[0], g.from[1]); ctx.lineTo(g.at[0], g.at[1]); ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke(); }
      const picked = g.k === 'node' && drawNodeSel && drawNodeSel.id === el.id && drawNodeSel.i === g.i;
      ctx.fillStyle = picked ? '#ffd36b' : g.k === 'radius' ? '#fff' : ink; ctx.strokeStyle = '#11181c'; ctx.lineWidth = 1;
      ctx.beginPath();
      if (g.round) ctx.arc(g.at[0], g.at[1], 4, 0, Math.PI * 2);
      else if (g.smooth) { ctx.moveTo(g.at[0], g.at[1] - 5.5); ctx.lineTo(g.at[0] + 5.5, g.at[1]); ctx.lineTo(g.at[0], g.at[1] + 5.5); ctx.lineTo(g.at[0] - 5.5, g.at[1]); ctx.closePath(); }   // a smooth node a diamond
      else ctx.rect(g.at[0] - 4.5, g.at[1] - 4.5, 9, 9);
      ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
}
/* a node given handles along the line through its neighbours, a third of the way to each */
function smoothNode(el, i) {
  const N = el.nodes, n = N[i], a = N[i - 1] || (el.closed ? N[N.length - 1] : n), b = N[i + 1] || (el.closed ? N[0] : n);
  let tx = b.x - a.x, ty = b.y - a.y; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
  const d1 = Math.hypot(n.x - a.x, n.y - a.y) / 3, d2 = Math.hypot(b.x - n.x, b.y - n.y) / 3;
  n.h1 = [-tx * d1, -ty * d1]; n.h2 = [tx * d2, ty * d2]; n.smooth = true;
}
/* ---------- scaling a drawing with the select tool: eight handles round its box ---------- */
export let xformMode = 'scale', xformId = null;
export function setXformMode(v) { return (xformMode = v); }
export const scaleDrawing = () => {
  const el = selected(), ok = drawTool === 'select' && el && el.type === 'draw' && !extraSel.size && onTab(el) && !el.locked && !textEdit;
  if (ok && xformId !== el.id) { xformId = el.id; xformMode = 'scale'; }        // a drawing newly picked starts with its scale handles
  return ok ? el : null;
};
export function scaleGrips(el) {
  const [x0, y0, x1, y1] = drawBox(el), m = 3 / V().scale, f = frame(el), out = [];
  for (const gx of [-1, 0, 1]) for (const gy of [-1, 0, 1]) {
    if (!gx && !gy) continue;
    const [X, Y] = toWorld(f, gx < 0 ? x0 - m : gx > 0 ? x1 + m : (x0 + x1) / 2, gy < 0 ? y0 - m : gy > 0 ? y1 + m : (y0 + y1) / 2);
    out.push({ gx, gy, at: [sx(X), sy(Y)], box: [x0, y0, x1, y1], kind: xformMode === 'scale' ? 'scale' : gx && gy ? 'rot' : 'skew' });
  }
  return out;
}
/* rotate (a corner, about the middle of its box; Ctrl: by 15 degrees) or skew (a side, the side across staying put; Ctrl: by 15 degrees) */
function rotSkewMove(d, px, py, ctrl) {
  const o = d.orig, el = d.el, g = d.g, [x0, y0, x1, y1] = g.box, f = frame(o), r4 = v => +v.toFixed(4);
  if (g.kind === 'rot') {
    const [cx, cy] = toWorld(f, (x0 + x1) / 2, (y0 + y1) / 2);
    let da = (Math.atan2(wy(py) - cy, wx(px) - cx) - Math.atan2(wy(d.py0) - cy, wx(d.px0) - cx)) / deg;
    if (ctrl) da = Math.round(da / 15) * 15;
    const c = Math.cos(da * deg), sn = Math.sin(da * deg), dx = o.x - cx, dy = o.y - cy;
    el.x = r4(cx + dx * c - dy * sn); el.y = r4(cy + dx * sn + dy * c); el.angle = wrapDeg(o.angle + da);
    return;
  }
  const [lx, ly] = toLocal(f, wx(px), wy(py)), [l0x, l0y] = toLocal(f, wx(d.px0), wy(d.py0));
  let D, off;
  if (g.gy) {                                       // the top or the bottom: slid along x
    const ay = g.gy < 0 ? y1 : y0, hy = g.gy < 0 ? y0 : y1;
    let k = (lx - l0x) / ((hy - ay) || 1);
    if (ctrl) k = Math.tan(Math.round(Math.atan(k) / (15 * deg)) * 15 * deg);
    D = [1, 0, k, 1]; off = [-k * ay, 0];
  } else {                                          // a side: slid along y
    const ax = g.gx < 0 ? x1 : x0, hx = g.gx < 0 ? x0 : x1;
    let k = (ly - l0y) / ((hx - ax) || 1);
    if (ctrl) k = Math.tan(Math.round(Math.atan(k) / (15 * deg)) * 15 * deg);
    D = [1, k, 0, 1]; off = [0, -k * ax];
  }
  el.m = mClean(mMul(D, o.m));
  if (!el.m) delete el.m;
  const [dx, dy] = toWorldDir(f, off[0], off[1]);
  el.x = r4(o.x + dx); el.y = r4(o.y + dy);
}
/* a handle dragged: the drawing scaled from the side or corner across from it (Ctrl: keeping its shape) */
function scaleMove(d, px, py, keep) {
  const o = d.orig, el = d.el, g = d.g, [x0, y0, x1, y1] = g.box, f = frame(o), [lx, ly] = toLocal(f, wx(px), wy(py));
  const ax = g.gx < 0 ? x1 : x0, ay = g.gy < 0 ? y1 : y0, hx = g.gx < 0 ? x0 : x1, hy = g.gy < 0 ? y0 : y1;
  const lim = v => Math.sign(v || 1) * Math.max(0.01, Math.abs(v));
  let kx = g.gx ? lim((lx - ax) / ((hx - ax) || 1)) : 1, ky = g.gy ? lim((ly - ay) / ((hy - ay) || 1)) : 1;
  if (keep || o.shape === 'text') { const k = g.gx && g.gy ? Math.max(Math.abs(kx), Math.abs(ky)) : g.gx ? Math.abs(kx) : Math.abs(ky); kx = k * Math.sign(kx); ky = k * Math.sign(ky); }
  if (o.shape === 'text') { kx = ky = Math.abs(kx); }
  const [dx, dy] = toWorldDir(f, (g.gx ? ax : 0) * (1 - kx), (g.gy ? ay : 0) * (1 - ky)), r4 = v => +v.toFixed(4);
  if (o.m) { el.m = mMul([kx, 0, 0, ky], o.m); el.x = r4(o.x + dx); el.y = r4(o.y + dy); return; }     // skewed: its matrix scaled
  if (o.shape === 'path') {
    const ox = g.gx ? ax : 0, oy = g.gy ? ay : 0;
    el.nodes = o.nodes.map(n => Object.assign({}, n, { x: r4(ox + (n.x - ox) * kx), y: r4(oy + (n.y - oy) * ky),
      h1: n.h1 && [n.h1[0] * kx, n.h1[1] * ky], h2: n.h2 && [n.h2[0] * kx, n.h2[1] * ky] }));
    return;
  }
  el.x = r4(o.x + dx); el.y = r4(o.y + dy);
  if (o.shape === 'rect') { el.w = r4(o.w * Math.abs(kx)); el.h = r4(o.h * Math.abs(ky)); el.r = r4(Math.min(o.r * Math.min(Math.abs(kx), Math.abs(ky)), el.w / 2, el.h / 2)); }
  else if (o.shape === 'ellipse') { el.rx = r4(o.rx * Math.abs(kx)); el.ry = r4(o.ry * Math.abs(ky)); }
  else el.size = +(o.size * kx).toPrecision(4);
}

/* ---------- parts' names: where each was drawn, to pick it up, move it, scale it or retype it ---------- */
export const labelBoxes = new Map();          // id: { x, y, w, h, ax, ay } on screen, as last drawn
export function labelAt(px, py) {
  const B = labelSelId && labelBoxes.get(labelSelId), E = B && getEl(labelSelId);
  if (E && onTab(E) && Math.hypot(px - (B.x + B.w), py - (B.y + B.h)) <= 7) return { el: E, k: 'scale' };
  for (const [id, b] of labelBoxes) {
    const el = getEl(id);
    if (el && onTab(el) && px >= b.x - 2 && px <= b.x + b.w + 2 && py >= b.y - 2 && py <= b.y + b.h + 2) return { el, k: 'move' };
  }
  return null;
}

/* ---------- typing: a text, or a part's name, in place ---------- */
export function editText(el, kind, fresh) {
  closeTextEdit();
  if (!fresh) checkpoint();
  const multi = kind === 'text';
  const box = h(multi ? 'textarea' : 'input', { class: 'rt-textedit', spellcheck: 'false', 'aria-label': multi ? 'Text' : 'Name of ' + typeLabel(el), rows: '1' });
  box.value = multi ? el.text : el.name;
  stage.append(box);
  textEdit = { el, kind, box };
  placeTextEdit();
  box.addEventListener('input', () => { if (multi) el.text = box.value; else el.name = box.value; placeTextEdit(); syncPanel(); requestRender(); });
  box.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'Enter' && (!multi || e.ctrlKey || e.metaKey))) { e.preventDefault(); closeTextEdit(); canvas.focus({ preventScroll: true }); }
  });
  box.addEventListener('blur', () => { if (textEdit && textEdit.box === box) closeTextEdit(); });
  requestRender();
  setTimeout(() => { box.focus(); if (!fresh) box.select(); }, 0);
}
function placeTextEdit() {
  const T = textEdit;
  if (!T) return;
  const b = T.box, el = T.el;
  let x, y, fs;
  if (T.kind === 'text') {
    const t = textLines(el), [x0, , , y1] = t.box, [X, Y] = shapeToWorld(el, [x0, y1]);
    fs = Math.max(12, el.size * V().scale); x = sx(X); y = sy(Y);
    b.style.font = fontOf(el, fs); b.style.textAlign = el.align;
    b.style.color = el.fill !== 'none' ? el.fill : '#e8edf0';
  } else {
    const B = labelBoxes.get(el.id) || { x: sx(el.x) - 30, y: sy(el.y) + 20, h: 14 };
    fs = Math.max(12, B.h / 1.3); x = B.x; y = B.y;
    b.style.font = '600 ' + fs + 'px ' + getCss('--jek-sans'); b.style.color = '';
  }
  const lines = b.value.split('\n'), longest = Math.max(4, ...lines.map(l => l.length));
  b.style.left = Math.round(x - 4) + 'px'; b.style.top = Math.round(y - 3) + 'px';
  b.style.width = Math.round(longest * fs * 0.62 + 24) + 'px';
  if (T.kind === 'text') b.style.height = Math.round(lines.length * fs * 1.3 + 10) + 'px';
}
function closeTextEdit() {
  const T = textEdit;
  if (!T) return;
  textEdit = null;
  T.box.remove();
  if (T.kind === 'text' && !T.el.text.trim()) {              // a text left empty goes
    project.elements = project.elements.filter(e => e !== T.el);
    if (selectedId === T.el.id) selectOne(null);
  }
  if (T.kind === 'name' && !T.el.name.trim()) T.el.name = typeLabel(T.el);
  changed(true);
}

/* ---------- flipping: left to right (H) or upside down (V) ---------- */
const wrapDeg = a => +(((a % 360) + 540) % 360 - 180).toFixed(4);
export function flipEls(list, axis) {
  const free = list.filter(e => !e.locked && e.type === 'draw');            // drawings: a part is not mirrored
  if (!free.length) { if (list.length) toast(list.some(e => e.type === 'draw') ? 'Locked in place' : 'Flip is for drawings'); return; }
  checkpoint();
  // about their middle together; one alone about its own place
  const cx = free.reduce((a, e) => a + e.x, 0) / free.length, cy = free.reduce((a, e) => a + e.y, 0) / free.length, H = axis === 'h';
  for (const e of free) {
    if (H) e.x = +(2 * cx - e.x).toFixed(4); else e.y = +(2 * cy - e.y).toFixed(4);
    if (e.label) { if (H) e.label.dx = -e.label.dx; else e.label.dy = -e.label.dy; }
    if (e.type === 'draw') {
      // a mirror turns the frame the other way, and mirrors the shape in it (a text stays readable)
      e.angle = wrapDeg(-e.angle);
      if (e.m) e.m = [e.m[0], -e.m[1], -e.m[2], e.m[3]];
      if (e.shape === 'path') for (const n of e.nodes) {
        const m = p => p && (H ? [-p[0], p[1]] : [p[0], -p[1]]);
        if (H) n.x = -n.x; else n.y = -n.y;
        n.h1 = m(n.h1); n.h2 = m(n.h2);
      }
      if (e.shape === 'text' && H && e.align !== 'center') e.align = e.align === 'left' ? 'right' : 'left';
    } else e.angle = wrapDeg(H ? 180 - e.angle : -e.angle);
  }
  const ids = new Set(free.map(e => e.id));
  if (free.length > 1) for (const F of project.fibres || []) if (ids.has(F.a[0]) && ids.has(F.b[0])) for (const n of F.path || []) {
    if (H) n.x = 2 * cx - n.x; else n.y = 2 * cy - n.y;
    for (const k of ['h1', 'h2']) if (n[k]) n[k] = H ? [-n[k][0], n[k][1]] : [n[k][0], -n[k][1]];
  }
  changed(true);
}

/* ---------- groups: picked, moved and copied as one; Ctrl+click picks one of a group ---------- */
export const groupOf = el => el.group ? project.elements.filter(e => e.group === el.group && e.bench === el.bench) : [el];
export function groupEls(list) {
  if (list.length < 2) return;
  checkpoint();
  const g = 'g' + uid().slice(1);
  for (const e of list) e.group = g;
  toast('Grouped ' + list.length);
  changed(true);
}
export function ungroupEls(list) {
  if (!list.some(e => e.group)) return;
  checkpoint();
  for (const e of list) delete e.group;
  toast('Ungrouped');
  changed(true);
}
/* ---------- the stacking of drawings (each layer, under or over the light, in its own order) ---------- */
export function restack(list, how) {
  const ds = list.filter(e => e.type === 'draw');
  if (!ds.length) return;
  checkpoint();
  const E = project.elements;
  const peers = d => E.filter(e => e.type === 'draw' && e.bench === d.bench && e.layer === d.layer);
  // one step: past the next drawing above (or below) it that it overlaps, or the next at all
  const order = how === 'up' || how === 'top' ? [...ds].sort((a, b) => E.indexOf(b) - E.indexOf(a)) : [...ds].sort((a, b) => E.indexOf(a) - E.indexOf(b));
  for (const d of order) {
    const P = peers(d), i = P.indexOf(d);
    let target = null;
    if (how === 'top') target = P[P.length - 1];
    else if (how === 'bottom') target = P[0];
    else {
      // one step: past the next one it overlaps (else the next at all)
      const b = worldBoxOf(d), meets = q => { const c = worldBoxOf(q); return c[0] <= b[2] && c[2] >= b[0] && c[1] <= b[3] && c[3] >= b[1]; };
      const run = how === 'up' ? P.slice(i + 1) : P.slice(0, i).reverse();
      target = run.find(meets) || run[0];
    }
    if (!target || target === d || ds.includes(target) && (how === 'up' || how === 'down')) continue;
    E.splice(E.indexOf(d), 1);
    const j = E.indexOf(target);
    E.splice(how === 'up' || how === 'top' ? j + 1 : j, 0, d);
  }
  changed(true);
}

/* ---------- align and distribute: each element's box on the bench ---------- */
function worldBoxOf(e) {
  if (e.type === 'draw') {
    const f = frame(e), P = drawPoly(e, 8).map(p => toWorld(f, p[0], p[1])), m = e.stroke !== 'none' && e.shape !== 'text' ? e.strokeWidth / 2 : 0;
    return [Math.min(...P.map(p => p[0])) - m, Math.min(...P.map(p => p[1])) - m, Math.max(...P.map(p => p[0])) + m, Math.max(...P.map(p => p[1])) + m];
  }
  // a laser's body and a fibre component's box as they are drawn; the rest, the circle round them
  let R = null;
  if (e.type === 'source') { const { L, hw } = srcBody(e); R = [-L, -hw, 0, hw]; }
  else if (e.type === 'fcomp') R = [-FC_W / 2, -fcH(e) / 2, FC_W / 2, fcH(e) / 2];
  if (R) {
    const f = frame(e), P = [[R[0], R[1]], [R[2], R[1]], [R[2], R[3]], [R[0], R[3]]].map(p => toWorld(f, p[0], p[1]));
    return [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))];
  }
  const r = halfSize(e);
  return [e.x - r, e.y - r, e.x + r, e.y + r];
}
let alignRel = 'selection';
function alignSel(how) {
  const list = selection();
  if (!list.length || (list.length < 2 && alignRel !== 'first' && alignRel !== 'last')) { toast('Pick two or more to line up'); return; }
  const B = list.map(worldBoxOf), area = b => (b[2] - b[0]) * (b[3] - b[1]);
  let R;
  if (alignRel === 'first') R = B[0];
  else if (alignRel === 'last') R = B[B.length - 1];
  else if (alignRel === 'biggest') R = B.reduce((a, b) => area(b) > area(a) ? b : a);
  else if (alignRel === 'smallest') R = B.reduce((a, b) => area(b) < area(a) ? b : a);
  else R = [Math.min(...B.map(b => b[0])), Math.min(...B.map(b => b[1])), Math.max(...B.map(b => b[2])), Math.max(...B.map(b => b[3]))];
  checkpoint();
  list.forEach((e, i) => {
    if (e.locked) return;
    const b = B[i];
    const dx = { left: R[0] - b[0], cx: (R[0] + R[2]) / 2 - (b[0] + b[2]) / 2, right: R[2] - b[2] }[how] || 0;
    const dy = { top: R[3] - b[3], cy: (R[1] + R[3]) / 2 - (b[1] + b[3]) / 2, bottom: R[1] - b[1] }[how] || 0;
    if (dx || dy) moveEls([e], dx, dy);
  });
  changed(true);
}
function distributeSel(how) {
  const list = selection().filter(e => !e.locked);
  if (list.length < 3) { toast('Pick three or more to space out'); return; }
  const H = how === 'cx' || how === 'gx', k0 = H ? 0 : 1, k1 = H ? 2 : 3;
  const items = list.map(e => ({ e, b: worldBoxOf(e) })).sort((p, q) => (p.b[k0] + p.b[k1]) - (q.b[k0] + q.b[k1]));
  checkpoint();
  const n = items.length, first = items[0].b, last = items[n - 1].b;
  if (how === 'cx' || how === 'cy') {
    const c0 = (first[k0] + first[k1]) / 2, c1 = (last[k0] + last[k1]) / 2;
    items.forEach((it, i) => { const d = c0 + (c1 - c0) * i / (n - 1) - (it.b[k0] + it.b[k1]) / 2; if (d) moveEls([it.e], H ? d : 0, H ? 0 : d); });
  } else {
    const span = last[k1] - first[k0], sizes = items.reduce((a, it) => a + it.b[k1] - it.b[k0], 0), gap = (span - sizes) / (n - 1);
    let at = first[k0];
    items.forEach(it => { const d = at - it.b[k0]; if (d) moveEls([it.e], H ? d : 0, H ? 0 : d); at += it.b[k1] - it.b[k0] + gap; });
  }
  changed(true);
}

/* ---------- the bar along the top of the bench in the Draw palette: flip, rotate, stack, align ---------- */
const DB_ICONS = {
  flipH: '<path d="M12 2.5v19" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/><path d="M9.5 6 3 18h6.5Z" fill="currentColor"/><path d="M14.5 6 21 18h-6.5Z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  flipV: '<path d="M2.5 12h19" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/><path d="M6 9.5 18 3v6.5Z" fill="currentColor"/><path d="M6 14.5 18 21v-6.5Z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  rotL: '<path d="M7 7.5A7 7 0 1 1 5 13" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 4.5v5h5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/>',
  rotR: '<path d="M17 7.5A7 7 0 1 0 19 13" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M21 4.5v5h-5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/>',
  top: '<path d="M4 3.5h16" stroke="currentColor" stroke-width="2"/><path d="M12 21V8M7 13l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  up: '<path d="M12 20V5M6.5 10.5 12 5l5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  down: '<path d="M12 4v15M6.5 13.5 12 19l5.5-5.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  bottom: '<path d="M4 20.5h16" stroke="currentColor" stroke-width="2"/><path d="M12 3v13M7 11l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  align: '<path d="M4 3v18" stroke="currentColor" stroke-width="1.8"/><rect x="6" y="5" width="13" height="5" fill="currentColor"/><rect x="6" y="14" width="8" height="5" fill="currentColor"/>',
  // align
  left: '<path d="M4 3v18" stroke="currentColor" stroke-width="1.8"/><rect x="6" y="5" width="13" height="5" fill="currentColor"/><rect x="6" y="14" width="8" height="5" fill="currentColor"/>',
  cx: '<path d="M12 3v18" stroke="currentColor" stroke-width="1.8"/><rect x="5" y="5" width="14" height="5" fill="currentColor" opacity="0.8"/><rect x="8" y="14" width="8" height="5" fill="currentColor" opacity="0.8"/>',
  right: '<path d="M20 3v18" stroke="currentColor" stroke-width="1.8"/><rect x="5" y="5" width="13" height="5" fill="currentColor"/><rect x="10" y="14" width="8" height="5" fill="currentColor"/>',
  topA: '<path d="M3 4h18" stroke="currentColor" stroke-width="1.8"/><rect x="5" y="6" width="5" height="13" fill="currentColor"/><rect x="14" y="6" width="5" height="8" fill="currentColor"/>',
  cy: '<path d="M3 12h18" stroke="currentColor" stroke-width="1.8"/><rect x="5" y="5" width="5" height="14" fill="currentColor" opacity="0.8"/><rect x="14" y="8" width="5" height="8" fill="currentColor" opacity="0.8"/>',
  bottomA: '<path d="M3 20h18" stroke="currentColor" stroke-width="1.8"/><rect x="5" y="5" width="5" height="13" fill="currentColor"/><rect x="14" y="10" width="5" height="8" fill="currentColor"/>',
  // distribute
  dcx: '<path d="M5 3v18M12 3v18M19 3v18" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/><rect x="3" y="8" width="4" height="8" fill="currentColor"/><rect x="9.5" y="6" width="5" height="12" fill="currentColor"/><rect x="17.5" y="9" width="3" height="6" fill="currentColor"/>',
  dgx: '<rect x="2" y="7" width="5" height="10" fill="currentColor"/><rect x="10" y="5" width="4" height="14" fill="currentColor"/><rect x="17" y="8" width="5" height="8" fill="currentColor"/><path d="M7.5 12h2M14.5 12h2" stroke="#8b6ee0" stroke-width="2"/>',
  dcy: '<path d="M3 5h18M3 12h18M3 19h18" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/><rect x="8" y="3" width="8" height="4" fill="currentColor"/><rect x="6" y="9.5" width="12" height="5" fill="currentColor"/><rect x="9" y="17.5" width="6" height="3" fill="currentColor"/>',
  dgy: '<rect x="7" y="2" width="10" height="5" fill="currentColor"/><rect x="5" y="10" width="14" height="4" fill="currentColor"/><rect x="8" y="17" width="8" height="5" fill="currentColor"/><path d="M12 7.5v2M12 14.5v2" stroke="#8b6ee0" stroke-width="2"/>',
};
const dbIco = k => { const s = h('span', { class: 'rt-ico' }); s.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' + DB_ICONS[k] + '</svg>'; return s; };
export let drawBarEl = null, alignBox = null;
export function drawBarShown() {
  if (!drawBarEl) {
    const B = (k, title, fn, need) => { const b = h('button', { type: 'button', title, 'aria-label': title, 'data-need': need || '' }, dbIco(k)); b.addEventListener('click', e => { e.stopPropagation(); fn(); }); return b; };
    const sep = () => h('span', { class: 'sep' });
    drawBarEl = h('div', { class: 'rt-drawbar', id: 'drawBar', role: 'toolbar', 'aria-label': 'Drawing', hidden: '' },
      B('flipH', 'Flip horizontal (H)', () => flipEls(selection(), 'h'), 'draw'), B('flipV', 'Flip vertical (V)', () => flipEls(selection(), 'v'), 'draw'), sep(),
      B('rotL', 'Rotate 90° anticlockwise (R)', () => rotateEls(selection(), 90), 'any'), B('rotR', 'Rotate 90° clockwise (Shift+R)', () => rotateEls(selection(), -90), 'any'), sep(),
      B('top', 'Raise to top (Home)', () => restack(selection(), 'top'), 'draw'), B('up', 'Raise one step (Page Up)', () => restack(selection(), 'up'), 'draw'),
      B('down', 'Lower one step (Page Down)', () => restack(selection(), 'down'), 'draw'), B('bottom', 'Lower to bottom (End)', () => restack(selection(), 'bottom'), 'draw'), sep(),
      B('align', 'Align and distribute (Ctrl+Shift+A)', () => alignShown(!alignBox || alignBox.hidden)));
    stage.append(drawBarEl);
  }
  const on = palette === 'draw' && !EMBED;
  drawBarEl.hidden = !on;
  if (!on && alignBox) alignBox.hidden = true;
  const L = selection(), hasDraw = L.some(e => e.type === 'draw');
  drawBarEl.querySelectorAll('button[data-need]').forEach(b => { b.disabled = b.dataset.need === 'draw' ? !hasDraw : b.dataset.need === 'any' ? !L.length : false; });
  const ab = drawBarEl.querySelector('button:last-child');
  if (ab) ab.classList.toggle('on', !!alignBox && !alignBox.hidden);
}
export function alignShown(on) {
  if (!alignBox) {
    const B = (k, title, fn) => h('button', { type: 'button', title, 'aria-label': title, onclick: e => { e.stopPropagation(); fn(); } }, dbIco(k));
    const rel = h('select', { 'aria-label': 'Relative to' }, ...[['selection', 'Selection area'], ['first', 'First selected'], ['last', 'Last selected'], ['biggest', 'Biggest object'], ['smallest', 'Smallest object']].map(([v, t]) => h('option', { value: v }, t)));
    rel.value = alignRel;
    rel.addEventListener('change', () => { alignRel = rel.value; });
    alignBox = h('div', { class: 'rt-alignbox', role: 'dialog', 'aria-label': 'Align and distribute', hidden: '' },
      h('div', { class: 'rt-alignhead' }, h('b', null, 'Align and distribute'), h('button', { type: 'button', class: 'rt-pclose', 'aria-label': 'Close', onclick: () => alignShown(false) }, '×')),
      h('label', { class: 'rt-alignrel' }, 'Relative to', rel),
      h('h4', null, 'Align'),
      h('div', { class: 'rt-aligngrid' }, B('left', 'Left edges', () => alignSel('left')), B('cx', 'Centres on a vertical line', () => alignSel('cx')), B('right', 'Right edges', () => alignSel('right')),
        B('topA', 'Top edges', () => alignSel('top')), B('cy', 'Centres on a horizontal line', () => alignSel('cy')), B('bottomA', 'Bottom edges', () => alignSel('bottom'))),
      h('h4', null, 'Distribute'),
      h('div', { class: 'rt-aligngrid' }, B('dcx', 'Centres evenly across', () => distributeSel('cx')), B('dgx', 'Equal gaps across', () => distributeSel('gx')),
        B('dcy', 'Centres evenly up', () => distributeSel('cy')), B('dgy', 'Equal gaps up', () => distributeSel('gy'))),
      h('p', null, 'For what is selected: drawings and parts alike, each by its box.'));
    alignBox.addEventListener('pointerdown', e => e.stopPropagation());
    stage.append(alignBox);
  }
  alignBox.hidden = !on;
  drawBarShown();
}
/* the node tool's double-click: on a node, smooth it or make it a corner; on the path, a node there */
export function drawDblClick(px, py) {
  const el = nodeDrawing();
  if (!el || el.shape !== 'path') return false;
  const g = drawGripAt(el, px, py);
  if (g && g.k === 'node') {
    checkpoint();
    const N = el.nodes, n = N[g.i];
    if (n.h1 || n.h2) { n.h1 = null; n.h2 = null; delete n.smooth; }
    else smoothNode(el, g.i);
    drawNodeSel = { id: el.id, i: g.i };
    changed(true);
    return true;
  }
  // nearest point on the outline: split the piece there (de Casteljau), the shape unchanged
  const f = frame(el), [lx, ly] = toLocal(f, wx(px), wy(py)), G = drawSegs(el), tol = 6 / V().scale;
  let best = null, at = G.p0;
  G.segs.forEach(([c1, c2, p], k) => {
    for (let i = 0; i <= 40; i++) { const q = bez4(at, c1, c2, p, i / 40), d = Math.hypot(q[0] - lx, q[1] - ly); if (!best || d < best.d) best = { d, k, t: i / 40 }; }
    at = p;
  });
  if (!best || best.d > tol + el.strokeWidth / 2 || best.t <= 0 || best.t >= 1) return false;
  checkpoint();
  const N = el.nodes, i0 = best.k, i1 = (best.k + 1) % N.length, A = N[i0], B = N[i1], t = best.t;
  const P0 = [A.x, A.y], P1 = [A.x + (A.h2 ? A.h2[0] : 0), A.y + (A.h2 ? A.h2[1] : 0)], P2 = [B.x + (B.h1 ? B.h1[0] : 0), B.y + (B.h1 ? B.h1[1] : 0)], P3 = [B.x, B.y];
  const L = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const a = L(P0, P1), b = L(P1, P2), c = L(P2, P3), d = L(a, b), e2 = L(b, c), m = L(d, e2);
  const curved = !!(A.h2 || B.h1);
  if (curved) { A.h2 = [a[0] - A.x, a[1] - A.y]; B.h1 = [c[0] - B.x, c[1] - B.y]; }
  const n = { x: +m[0].toFixed(4), y: +m[1].toFixed(4), h1: curved ? [d[0] - m[0], d[1] - m[1]] : null, h2: curved ? [e2[0] - m[0], e2[1] - m[1]] : null };
  if (curved) n.smooth = true;
  N.splice(i0 + 1, 0, n);
  drawNodeSel = { id: el.id, i: i0 + 1 };
  changed(true);
  return true;
}
/* keys for drawing: the tools; the pen's Enter, Backspace and Escape; Delete on a node */
export function drawKey(e) {
  if (penDraft) {
    if (e.key === 'Enter') { e.preventDefault(); finishPen(); return true; }
    if (e.key === 'Escape') { e.preventDefault(); finishPen(false); return true; }
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); penDraft.nodes.pop(); if (!penDraft.nodes.length) finishPen(false); requestRender(); return true; }
  }
  const el = nodeDrawing();
  if (el && el.shape === 'path' && drawNodeSel && drawNodeSel.id === el.id && (e.key === 'Delete' || e.key === 'Backspace')) {
    e.preventDefault();
    if (el.nodes.length <= 2) { toast('A path keeps two nodes at least: delete the path itself with the select tool'); return true; }
    checkpoint(); el.nodes.splice(drawNodeSel.i, 1); if (el.nodes.length < 3) el.closed = false; drawNodeSel = null; changed(true);
    return true;
  }
  if (e.key === 'Escape' && drawTool !== 'select' && palette === 'draw') { setDrawTool('select'); return true; }
  if ((e.key === 'h' || e.key === 'v') && selection().some(x => x.type === 'draw')) { e.preventDefault(); flipEls(selection(), e.key); return true; }
  const st = { Home: 'top', End: 'bottom', PageUp: 'up', PageDown: 'down' }[e.key];
  if (st && selection().some(x => x.type === 'draw')) { e.preventDefault(); restack(selection(), st); return true; }
  const k = { s: 'select', n: 'node', e: 'ellipse', b: 'pen', t: 'text', F1: 'select', F2: 'node', F4: 'rect', F5: 'ellipse', F8: 'text' }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (!k || e.shiftKey || (e.key.startsWith('F') && e.key.length > 1 && palette !== 'draw')) return false;
  e.preventDefault();
  setDrawTool(k);
  return true;
}

/* ---------- its panel: the shape, and Fill and stroke ---------- */
const DI = {      // the panel's icons (24 wide unless noted)
  shape: { rect: DRAW_TOOLS.find(t => t[0] === 'rect')[4], ellipse: DRAW_TOOLS.find(t => t[0] === 'ellipse')[4], path: DRAW_TOOLS.find(t => t[0] === 'pen')[4], text: DRAW_TOOLS.find(t => t[0] === 'text')[4] },
  paint: '<path d="M4 13.5 11 6.5l6.5 6.5-7 7Z" fill="currentColor"/><path d="M9 4.5 11 6.5" stroke="currentColor" stroke-width="1.8"/><path d="M19.5 15.5c1.2 2 1.8 3 1 3.9-.8.8-2.5.2-2-1.2Z" fill="currentColor"/>',
  none: '<rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 19 19 5" stroke="#d6453d" stroke-width="2"/>',
  flat: '<rect x="4" y="4" width="16" height="16" fill="currentColor"/>',
  flipH: '<path d="M12 2.5v19" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/><path d="M9.5 6 3 18h6.5Z" fill="currentColor"/><path d="M14.5 6 21 18h-6.5Z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  flipV: '<path d="M2.5 12h19" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/><path d="M6 9.5 18 3v6.5Z" fill="currentColor"/><path d="M6 14.5 18 21v-6.5Z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  under: '<rect x="6" y="5" width="12" height="14" fill="currentColor" opacity="0.55"/><path d="M2 12h20" stroke="#ff6a3d" stroke-width="3"/>',
  over: '<path d="M2 12h20" stroke="#ff6a3d" stroke-width="3"/><rect x="6" y="5" width="12" height="14" fill="currentColor"/>',
  miter: '<path d="M6 20V6h14" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="miter"/>',
  roundJ: '<path d="M6 20V6h14" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/>',
  bevel: '<path d="M6 20V6h14" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="bevel"/>',
  butt: '<path d="M7 12h10" stroke="currentColor" stroke-width="8" stroke-linecap="butt"/><path d="M7 5v14M17 5v14" stroke="#8b6ee0" stroke-width="1.2"/>',
  roundC: '<path d="M7 12h10" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><path d="M7 5v14M17 5v14" stroke="#8b6ee0" stroke-width="1.2"/>',
  square: '<path d="M7 12h10" stroke="currentColor" stroke-width="8" stroke-linecap="square"/><path d="M7 5v14M17 5v14" stroke="#8b6ee0" stroke-width="1.2"/>',
  left: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10" stroke="currentColor" stroke-width="2"/>',
  center: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10" stroke="currentColor" stroke-width="2"/>',
  right: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10" stroke="currentColor" stroke-width="2"/>',
};
const DRAW_PRESETS = ['#e8edf0', '#9aa4ab', '#1b2328', '#e8423f', '#ff6a3d', '#ffd36b', '#7ee0a1', '#7fdcff', '#4a7fe0', '#b79bff', '#e86fa6', '#ffffff'];
const dIco = (svg, w = 24) => { const s = h('span', { class: 'rt-ico' }); s.innerHTML = '<svg viewBox="0 0 ' + w + ' 24" width="' + Math.round(w * 0.8) + '" height="19" aria-hidden="true">' + svg + '</svg>'; return s; };
export function drawPanel(el) {
  const st = vs(el), isText = el.shape === 'text';
  if (!st.drawTab) st.drawTab = 'shape';
  const keep = () => keepDrawStyle(el);
  // the two tabs, each with its icon
  panel.append(h('div', { class: 'rt-tabs rt-dtabs' }, ...[['shape', DI.shape[el.shape], DRAW_SHAPES[el.shape]], ['paint', DI.paint, isText ? 'Colour' : 'Fill and stroke']].map(([k, ic, t]) =>
    h('button', { class: 'rt-tab' + (st.drawTab === k ? ' on' : ''), type: 'button', onclick: () => { st.drawTab = k; renderPanel(); } }, dIco(ic), t))));
  // a labelled row of the panel, its controls on the right
  const row = (label, ...kids) => h('div', { class: 'rt-drow' }, h('span', { class: 'rt-dlab' }, label), h('div', { class: 'rt-dctl' }, ...kids));
  // buttons of which one is on, each an icon and maybe a word
  const seg = (opts, get, set, cls) => h('div', { class: 'rt-seg' + (cls ? ' ' + cls : ''), role: 'group' }, ...opts.map(([v, ic, label, title, style]) => {
    const on = get() === v;
    return h('button', { type: 'button', class: on ? 'on' : null, 'aria-pressed': on ? 'true' : 'false', title: title || label, 'aria-label': title || label, style: style || null,
      onclick: () => { if (get() === v) return; checkpoint(); set(v); keep(); changed(true); } }, ic ? dIco(ic) : null, label ? h('span', null, label) : null);
  }));
  const num = (get, set, unit, opts = {}) => {
    const id = 'rtf' + (setFid(fid + 1)), inp = numInput(id, get, v => { set(v); if (opts.style) keep(); });
    inp.classList.add('rt-dnum');
    return [inp, unit ? h('span', { class: 'rt-dunit' }, unit) : null];
  };
  const slider = (key, label) => {
    const r = h('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': label }), out = h('span', { class: 'rt-dval' });
    r.addEventListener('input', () => { beginEdit(); el[key] = r.value / 100; out.textContent = r.value + '%'; keep(); changed(false); });
    r.addEventListener('change', endEdit);
    bindSync(r, () => { r.value = String(Math.round(el[key] * 100)); out.textContent = r.value + '%'; });
    return row(label, r, out);
  };
  const head = (t, ic) => h('h3', { class: 'rt-dhead' }, ic ? dIco(ic) : null, t);
  const box = (...kids) => h('div', { class: 'rt-dbox' }, ...kids.flat());

  if (st.drawTab === 'shape') {
    if (el.shape === 'rect') panel.append(box(
      row('Width', ...num(() => el.w, v => { if (v > 0) { el.w = v; el.r = Math.min(el.r, el.w / 2, el.h / 2); } }, 'mm')),
      row('Height', ...num(() => el.h, v => { if (v > 0) { el.h = v; el.r = Math.min(el.r, el.w / 2, el.h / 2); } }, 'mm')),
      row('Corner radius', ...num(() => el.r, v => { el.r = clamp(v, 0, Math.min(el.w, el.h) / 2); }, 'mm'))));
    else if (el.shape === 'ellipse') panel.append(box(
      row('Radius x', ...num(() => el.rx, v => { if (v > 0) el.rx = v; }, 'mm')),
      row('Radius y', ...num(() => el.ry, v => { if (v > 0) el.ry = v; }, 'mm'))));
    else if (isText) {
      const ta = h('textarea', { class: 'rt-dtext', rows: String(Math.min(6, Math.max(2, el.text.split('\n').length))), spellcheck: 'false', 'aria-label': 'Text' });
      ta.addEventListener('input', () => { beginEdit(); el.text = ta.value; changed(false); });
      ta.addEventListener('change', endEdit); ta.addEventListener('blur', endEdit);
      bindSync(ta, () => { ta.value = el.text; });
      panel.append(box(ta,
        row('Font', seg(Object.entries(DRAW_FONTS).map(([k, [name]]) => [k, null, name, name, 'font-family:' + fontFamily(k)]), () => el.font, v => { el.font = v; })),
        row('Size', ...num(() => el.size, v => { if (v > 0) el.size = clamp(v, 0.05, 500); }, 'mm', { style: true })),
        row('Style', h('div', { class: 'rt-seg' }, ...[['bold', 'B', 'Bold', 'font-weight:700'], ['italic', 'I', 'Italic', 'font-style:italic;font-family:Georgia,serif']].map(([k, t, title, css]) =>
          h('button', { type: 'button', class: el[k] ? 'on' : null, 'aria-pressed': el[k] ? 'true' : 'false', title, 'aria-label': title, onclick: () => { checkpoint(); el[k] = !el[k]; keep(); changed(true); } }, h('span', { style: css }, t))))),
        row('Align', seg([['left', DI.left, null, 'Left'], ['center', DI.center, null, 'Centre'], ['right', DI.right, null, 'Right']], () => el.align, v => { el.align = v; }))));
    } else {
      const cl = h('input', { type: 'checkbox' });
      cl.checked = el.closed; cl.disabled = el.nodes.length < 3;
      cl.addEventListener('change', () => { checkpoint(); el.closed = cl.checked; changed(false); });
      const ni = drawNodeSel && drawNodeSel.id === el.id ? drawNodeSel.i : -1, n = el.nodes[ni];
      const b = box(h('label', { class: 'rt-check' }, cl, 'Closed path'));
      if (n) b.append(head('Node ' + (ni + 1) + ' of ' + el.nodes.length),
        row('x', ...num(() => n.x, v => { n.x = v; }, 'mm')), row('y', ...num(() => n.y, v => { n.y = v; }, 'mm')),
        row('Type', seg([['straight', '<path d="M4 18 20 6" stroke="currentColor" stroke-width="2"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/>', null, 'Straight: no handles'],
          ['corner', '<path d="M4 18 12 12 20 18M5 6l7 6 7-6" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/>', null, 'Corner: handles of their own'],
          ['smooth', '<path d="M3 17C7 6 17 6 21 17" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6.5 15.5 10 12 13.5 8.5 10Z" fill="currentColor"/>', null, 'Smooth: handles in line']],
          () => n.h1 || n.h2 ? (n.smooth ? 'smooth' : 'corner') : 'straight',
          v => { if (v === 'straight') { n.h1 = null; n.h2 = null; delete n.smooth; return; } if (!n.h1 && !n.h2) smoothNode(el, ni); if (v === 'smooth') n.smooth = true; else delete n.smooth; })));
      b.append(h('p', { class: 'rt-hint' }, el.nodes.length + ' nodes. ' + (n ? '' : 'Pick a node with the node tool (N) to set it here. ') + 'With the node tool, double-click the path to add a node.'));
      panel.append(b);
    }
    // where it sits, and which way round
    panel.append(head('Arrange'), box(
        ...(el.m ? [row('Skew', h('button', { type: 'button', class: 'rt-btn', onclick: () => { checkpoint(); delete el.m; changed(true); } }, 'Take the skew off'))] : []),
      row('Layer', seg([['under', DI.under, 'Under', 'Under the light: beams and parts are drawn over it'], ['over', DI.over, 'Over', 'Over the light: it is drawn over beams and parts']], () => el.layer, v => { el.layer = v; }))),
      h('p', { class: 'rt-hint' }, 'A drawing is for figures: the light goes through it as if it were not there. With the select tool its handles scale it; click it again and they rotate and skew it. Flip, rotate, raise and lower it, and line drawings up, from the bar along the top of the bench.'));
    return;
  }
  // Fill, then Stroke paint, then Stroke style
  const paint = (key, opKey, title) => {
    const out = [row('Paint', seg([['none', DI.none, 'None', 'No ' + title.toLowerCase()], ['flat', DI.flat, 'Flat', 'A flat colour']], () => el[key] === 'none' ? 'none' : 'flat', v => {
      if (v === 'none') { st['last' + key] = el[key]; el[key] = 'none'; }
      else el[key] = st['last' + key] || (key === 'fill' && !isText ? '#7fdcff' : benchLight() ? '#1b2328' : '#e8edf0');
    }))];
    if (el[key] === 'none') return out;
    const col = h('input', { type: 'color', class: 'rt-dcol', 'aria-label': title + ' colour' }), hex = h('input', { type: 'text', class: 'rt-dhex', maxlength: '7', spellcheck: 'false', 'aria-label': title + ' colour, hex' });
    col.addEventListener('input', () => { beginEdit(); el[key] = col.value; hex.value = col.value; keep(); changed(false); });
    col.addEventListener('change', endEdit);
    hex.addEventListener('change', () => { const v = hex.value.trim().replace(/^#?/, '#').toLowerCase(); if (hexColour(v)) { checkpoint(); el[key] = v; keep(); changed(false); } hex.value = el[key]; });
    bindSync(col, () => { col.value = el[key]; if (document.activeElement !== hex) hex.value = el[key]; });
    const sw = h('div', { class: 'rt-dsw' }, ...DRAW_PRESETS.map(c => h('button', { type: 'button', title: c, 'aria-label': c, style: 'background:' + c, class: el[key] === c ? 'on' : null,
      onclick: () => { checkpoint(); el[key] = c; keep(); changed(true); } })));
    out.push(row('Colour', col, hex), row('', sw), slider(opKey, 'Opacity'));
    return out;
  };
  panel.append(head(isText ? 'Colour' : 'Fill', DI.flat), box(paint('fill', 'fillOpacity', isText ? 'Colour' : 'Fill')));
  if (!isText) {
    panel.append(head('Stroke paint', '<rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3"/>'), box(paint('stroke', 'strokeOpacity', 'Stroke')));
    if (el.stroke !== 'none') {
      const dash = k => '<path d="M2 12h32" stroke="currentColor" stroke-width="3" stroke-dasharray="' + DRAW_DASH[k].map(v => v * 3).join(' ') + '"/>';
      panel.append(head('Stroke style', '<path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" stroke-width="1" /><path d="M3 12h18" stroke="currentColor" stroke-width="3"/>'), box(
        row('Width', ...num(() => el.strokeWidth, v => { el.strokeWidth = clamp(v, 0, 100); }, 'mm', { style: true })),
        row('Dashes', h('div', { class: 'rt-seg rt-dashes' }, ...['solid', 'dash', 'long', 'dot', 'dashdot'].map(k => {
          const on = el.dash === k, t = { solid: 'Solid', dash: 'Dashed', long: 'Long dashes', dot: 'Dotted', dashdot: 'Dash-dot' }[k];
          return h('button', { type: 'button', class: on ? 'on' : null, 'aria-pressed': on ? 'true' : 'false', title: t, 'aria-label': t, onclick: () => { checkpoint(); el.dash = k; keep(); changed(true); } }, dIco(dash(k), 36));
        }))),
        row('Join', seg([['miter', DI.miter, null, 'Mitre join'], ['round', DI.roundJ, null, 'Round join'], ['bevel', DI.bevel, null, 'Bevel join']], () => el.join, v => { el.join = v; })),
        row('Cap', seg([['butt', DI.butt, null, 'Butt cap'], ['round', DI.roundC, null, 'Round cap'], ['square', DI.square, null, 'Square cap']], () => el.cap, v => { el.cap = v; }))));
    }
  }
  panel.append(head('Opacity'), box(slider('opacity', isText ? 'The text' : 'The whole drawing')),
    h('p', { class: 'rt-hint' }, 'The next ' + (isText ? 'text' : 'drawing') + ' takes the style set here.'));
}

