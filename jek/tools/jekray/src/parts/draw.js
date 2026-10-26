import { normDraw } from '../state/drawings.js';

/* Drawing: A drawing for figures: a rectangle, an ellipse, a path of Bézier curves or a text, filled and stroked like an SVG shape. The light passes through it as if it were not there. Its shape is in its own frame, centred on x, y. */
export const DRAW = {
  type: 'draw', label: 'Drawing',
  norm(e, base) {
    return normDraw(e, base);
  },
  guide: {
    what: 'A drawing for figures: a rectangle, an ellipse, a path of Bézier curves or a text, filled and stroked like an SVG shape. The light passes through it as if it were not there. Its shape is in its own frame, centred on x, y.',
    angle: 'turns the drawing about its x, y.',
    fields: { shape: '"rect", "ellipse", "path" or "text".', fill: '"#rrggbb", or "none" (a text’s colour).', fillOpacity: '0 to 1.', stroke: '"#rrggbb", or "none".', strokeOpacity: '0 to 1.',
    strokeWidth: 'mm.', dash: '"solid", "dash", "long", "dot" or "dashdot".', cap: '"butt", "round" or "square".', join: '"miter", "round" or "bevel".', opacity: '0 to 1: the whole drawing.',
    layer: '"under" the beams and parts, or "over" them.', w: 'mm, a rectangle’s width.', h: 'mm, a rectangle’s height.', r: 'mm, a rectangle’s corner radius.',
    rx: 'mm, an ellipse’s radius along x.', ry: 'mm, an ellipse’s radius along y.',
    nodes: 'a path’s nodes, [{"x": mm, "y": mm, "h1": [dx, dy] or null, "h2": [dx, dy] or null}], from x, y; h1 and h2 are the Bézier handles into and out of the node, from it (null: a straight piece). "smooth": true keeps a node’s handles in line when one is dragged.',
    closed: 'true joins a path’s last node to its first.',
    startMark: 'an open path’s mark at its first node: "arrow", "dot" or "bar"; left out, none.', endMark: 'the same at its last node (an arrow: "endMark": "arrow").',
    text: 'a text’s words; \\n starts a new line. x, y is where its first line starts, is centred or ends (align), on its baseline.', size: 'mm, a text’s font size.',
    m: 'optional [a, b, c, d]: a skew (or scale) on the shape before its angle, x\u2032 = a x + c y, y\u2032 = b x + d y; left out, none.',
    font: '"sans", "serif" or "mono".', bold: 'true for bold text.', italic: 'true for italic text.', align: '"left", "center" or "right".' },
  },
};
