import { clamp } from '../core/constants.js';
import { num } from './project.js';

/* ==========================================================================
   Drawings: the shapes of the Draw palette as elements, normalised. How they are drawn and
   edited is ui/drawings.js; this is what a drawing is.
   ========================================================================== */

/* ==========================================================================
   Drawings: rectangles, ellipses and paths drawn on the bench for figures, with the tools
   of the Draw palette (select, node, rectangle, ellipse, pen). They are
   elements like any other, selected, moved, turned, copied, saved and exported with the
   bench, but no light meets them: they have no surfaces, under the light or over it.
   ========================================================================== */
export const DRAW_SHAPES = { rect: 'Rectangle', ellipse: 'Ellipse', path: 'Path', text: 'Text' };

export const DRAW_MARKS = ['arrow', 'dot', 'bar'];
export const DRAW_DASH = { solid: [], dash: [4, 2], dot: [1, 1.5], dashdot: [4, 1.5, 1, 1.5], long: [8, 3] };   // in stroke widths

export const hexColour = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

export function normDraw(e, base) {
  const shape = DRAW_SHAPES[e.shape] ? e.shape : 'rect';
  const o = Object.assign(base, {
    shape,
    fill: hexColour(e.fill) ? e.fill.toLowerCase() : shape === 'text' && e.fill !== 'none' ? '#e8edf0' : 'none',   // a colour, or "none"
    fillOpacity: clamp(num(e.fillOpacity, 1), 0, 1),
    stroke: e.stroke === 'none' ? 'none' : hexColour(e.stroke) ? e.stroke.toLowerCase() : '#e8edf0',
    strokeOpacity: clamp(num(e.strokeOpacity, 1), 0, 1),
    strokeWidth: clamp(num(e.strokeWidth, 0.5), 0, 100),                   // mm, so it scales with the bench
    dash: DRAW_DASH[e.dash] ? e.dash : 'solid',
    cap: ['butt', 'round', 'square'].includes(e.cap) ? e.cap : 'butt',
    join: ['miter', 'round', 'bevel'].includes(e.join) ? e.join : 'miter',
    opacity: clamp(num(e.opacity, 1), 0, 1),
    layer: e.layer === 'over' ? 'over' : 'under',                          // drawn under the light, or over it
  });
  if (shape === 'rect') {
    o.w = Math.max(0.01, num(e.w, 20)); o.h = Math.max(0.01, num(e.h, 12));
    o.r = clamp(num(e.r, 0), 0, Math.min(o.w, o.h) / 2);                 // corner radius
  } else if (shape === 'ellipse') {
    o.rx = Math.max(0.01, num(e.rx, 10)); o.ry = Math.max(0.01, num(e.ry, 10));
  }
  // skewed (or scaled after a skew): a matrix on its shape, [a, b, c, d]: x' = a x + c y, y' = b x + d y
  if (Array.isArray(e.m) && e.m.length === 4 && e.m.every(v => isFinite(v))) {
    const m = e.m.map(Number), det = m[0] * m[3] - m[1] * m[2];
    if (Math.abs(det) > 1e-6 && !(m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1)) o.m = m;
  }
  if (shape === 'rect' || shape === 'ellipse') {
    /* sizes set above */
  } else if (shape === 'text') {
    // x, y is where its first line starts (left), is centred or ends (right), on its baseline
    o.text = String(e.text == null ? '' : e.text).slice(0, 4000);
    o.size = clamp(num(e.size, 4), 0.05, 500);                             // mm: the font size, so it scales with the bench
    o.font = DRAW_FONTS[e.font] ? e.font : 'sans';
    o.bold = e.bold === true; o.italic = e.italic === true;
    o.align = ['left', 'center', 'right'].includes(e.align) ? e.align : 'left';
  } else {
    // nodes in the drawing's own frame; h1 and h2 the handles into and out of each, from it
    const hd = v => Array.isArray(v) && v.length === 2 && isFinite(v[0]) && isFinite(v[1]) ? [+v[0], +v[1]] : null;
    o.nodes = (Array.isArray(e.nodes) ? e.nodes : []).slice(0, 4000).filter(n => n && isFinite(n.x) && isFinite(n.y))
      .map(n => Object.assign({ x: +n.x, y: +n.y, h1: hd(n.h1), h2: hd(n.h2) }, n.smooth === true ? { smooth: true } : {}));
    if (o.nodes.length < 2) o.nodes = [{ x: -10, y: 0, h1: null, h2: null }, { x: 10, y: 0, h1: null, h2: null }];
    o.closed = e.closed === true;
    // a mark at an open path's first and last node: an arrowhead, a dot or a bar across it (left out, none)
    if (!o.closed) for (const k of ['startMark', 'endMark']) if (DRAW_MARKS.includes(e[k])) o[k] = e[k];
  }
  return o;
}

/* a text's lines and its box, in mm, in its own frame */
export const DRAW_FONTS = { sans: ['Sans', '--jek-sans'], serif: ['Serif', 'Georgia, "Times New Roman", serif'], mono: ['Mono', '--jek-mono'] };
