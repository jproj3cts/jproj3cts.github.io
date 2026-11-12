import { sketchId } from './sketch.js';

/* ==========================================================================
   A drawing: a tab that shows a Part Studio's parts, or an Assembly, as views on a sheet of paper, with dimensions
   and a title block. Pure: the document's drawing checked, where each view sits on the sheet, each dimension's
   lines, the whole sheet drawn through a pen (the page's canvas, or a PDF), and the PDF written with no library.
   The sheet is in millimetres, x across and y down from its top left corner. A view is the model seen square on
   (the kernel takes the hidden lines out); its own coordinates are the model's millimetres, X across and Y up.
   Third angle: the top view above the front, the right view to its right.
   ========================================================================== */
export const SHEETS = { A4: [297, 210], A3: [420, 297], A2: [594, 420] };
const R2 = Math.SQRT1_2, R3 = 1 / Math.sqrt(3);
/* each view: n towards the eye, x across the paper */
export const VIEW_DIRS = {
  front: { name: 'Front', n: [0, -1, 0], x: [1, 0, 0] }, top: { name: 'Top', n: [0, 0, 1], x: [1, 0, 0] }, right: { name: 'Right', n: [1, 0, 0], x: [0, 1, 0] },
  back: { name: 'Back', n: [0, 1, 0], x: [-1, 0, 0] }, left: { name: 'Left', n: [-1, 0, 0], x: [0, -1, 0] }, bottom: { name: 'Bottom', n: [0, 0, -1], x: [1, 0, 0] },
  iso: { name: 'Isometric', n: [R3, -R3, R3], x: [R2, R2, 0] },
};
const SCALES = [50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001];
const dstr = (v, n) => typeof v === 'string' && v.length <= n;
const dcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const ddot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/* a model point as a view sees it: [X across, Y up] */
export function viewPoint(dir, p) { const V = VIEW_DIRS[dir] || VIEW_DIRS.front, y = dcross(V.n, V.x); return [ddot(p, V.x), ddot(p, y)]; }
export const scaleText = s => (s >= 1 ? +s.toFixed(3) + ':1' : '1:' + +(1 / s).toFixed(3));
export const drwText = v => String(+(+v).toFixed(2));

/* ---------- the document's drawing, checked ---------- */
function normRef(r) {
  if (!r || typeof r !== 'object' || !r.ref || typeof r.ref !== 'object' || !(r.ref.kind === 'vertex' || r.ref.kind === 'edge')) return null;
  const ref = r.ref, okS = (v, n) => typeof v === 'string' && v.length < n;
  if (!okS(ref.part, 80) || !Array.isArray(ref.faces) || ref.faces.length < 1 || ref.faces.length > 6 || !ref.faces.every(x => okS(x, 120)) || !Array.isArray(ref.pt) || ref.pt.length !== 3 || !ref.pt.every(Number.isFinite)) return null;
  return Object.assign({ ref: { kind: ref.kind, part: ref.part, faces: ref.faces.slice(), pt: ref.pt.slice() } }, okS(r.inst, 40) ? { inst: r.inst } : {});
}
export function normDrawing(d, n) {
  d = d && typeof d === 'object' ? d : {};
  const vids = new Set(), views = [];
  for (const v of (Array.isArray(d.views) ? d.views : []).slice(0, 12)) {
    if (!v || !VIEW_DIRS[v.dir]) continue;
    const id = dstr(v.id, 40) && v.id && !vids.has(v.id) ? v.id : sketchId('v'); vids.add(id);
    views.push(Object.assign({ id, dir: v.dir }, Array.isArray(v.at) && v.at.length === 2 && v.at.every(Number.isFinite) ? { at: v.at.map(Number) } : {}));
  }
  const dims = [], dids = new Set();
  for (const m of (Array.isArray(d.dims) ? d.dims : []).slice(0, 400)) {
    if (!m || !vids.has(m.view) || !['lin', 'dia', 'ext'].includes(m.t)) continue;
    const id = dstr(m.id, 40) && m.id && !dids.has(m.id) ? m.id : sketchId('q'); dids.add(id);
    const o = { id, view: m.view, t: m.t, off: Number.isFinite(m.off) ? +m.off : 10 };
    if (m.t === 'lin') { const a = normRef(m.a), b = normRef(m.b); if (!a || !b) continue; Object.assign(o, { a, b, dir: ['h', 'v', 'a'].includes(m.dir) ? m.dir : 'h' }); }
    else if (m.t === 'dia') { const a = normRef(m.a); if (!a || a.ref.kind !== 'edge') continue; Object.assign(o, { a, ang: Number.isFinite(m.ang) ? +m.ang : 45 }); }
    else o.axis = m.axis === 'y' ? 'y' : 'x';
    dims.push(o);
  }
  const t = d.title && typeof d.title === 'object' ? d.title : {}, title = {};
  for (const k of ['title', 'by', 'material', 'note', 'number']) if (dstr(t[k], 120) && t[k]) title[k] = t[k];
  return { id: dstr(d.id, 40) && d.id ? d.id : sketchId('t'), kind: 'drawing', name: dstr(d.name, 120) && d.name.trim() ? d.name : 'Drawing ' + (n || 1),
    of: dstr(d.of, 40) ? d.of : '', part: dstr(d.part, 80) && d.part ? d.part : null, sheet: SHEETS[d.sheet] ? d.sheet : 'A4',
    scale: Number.isFinite(d.scale) && d.scale > 0 ? +d.scale : 0, hidden: !!d.hidden, views, dims, title };
}
/* a new drawing of a tab: the three views and the isometric one */
export const newDrawing = (of, n) => normDrawing({ of, views: [{ dir: 'front' }, { dir: 'top' }, { dir: 'right' }, { dir: 'iso' }] }, n);

/* ---------- where everything sits on the sheet ----------
   data: { views: { [id]: { vis, hid } } } as the kernel gives them (runs of x, y in the view's millimetres).
   { W, H, s, m (the margin), views: [{ id, dir, box, c, at }] }, and toSheet(view, [X, Y]) */
export function viewBox(v) {
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const L of [v && v.vis, v && v.hid]) for (const run of L || []) for (let i = 0; i + 1 < run.length; i += 2) { lo = [Math.min(lo[0], run[i]), Math.min(lo[1], run[i + 1])]; hi = [Math.max(hi[0], run[i]), Math.max(hi[1], run[i + 1])]; }
  return lo[0] === Infinity ? null : [lo[0], lo[1], hi[0], hi[1]];
}
export const TITLE_W = 150, TITLE_H = 36;
export function layoutOf(D, data) {
  const [W, H] = SHEETS[D.sheet] || SHEETS.A4, m = 10, gap = 18;
  const vs = D.views.map(v => { const box = viewBox(data && data.views && data.views[v.id]); return { id: v.id, dir: v.dir, box, at: v.at || null, c: box ? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] : [0, 0], w: box ? box[2] - box[0] : 0, h: box ? box[3] - box[1] : 0 }; });
  const by = d => vs.find(v => v.dir === d), F = by('front') || vs[0], T = by('top'), Rv = by('right'), I = by('iso');
  // the scale: the largest of the usual ones at which the front, top and right views sit together above the title block
  const needW = (F ? F.w : 0) + (Rv ? Rv.w : 0) + (I && !Rv ? I.w : 0), needH = (F ? F.h : 0) + (T ? T.h : 0);
  const roomW = W - 2 * m - gap * 4, roomH = H - 2 * m - TITLE_H - gap * 3;
  let s = D.scale;
  if (!s) { s = SCALES[SCALES.length - 1]; for (const k of SCALES) if (needW * k <= roomW * 0.86 && needH * k <= roomH * 0.92) { s = k; break; } }
  // third angle: the front view low on the left, the top above it, the right beside it, the isometric at the top right
  if (F) {
    const fx = m + gap + 8 + (F.w * s) / 2 + (by('left') ? by('left').w * s + gap : 0), fy = H - m - TITLE_H - gap - (F.h * s) / 2 - (by('bottom') ? by('bottom').h * s + gap : 0);
    const auto = { front: [fx, fy] };
    if (T) auto.top = [fx, fy - (F.h * s) / 2 - gap - (T.h * s) / 2];
    if (Rv) auto.right = [fx + (F.w * s) / 2 + gap + (Rv.w * s) / 2, fy];
    if (by('left')) auto.left = [fx - (F.w * s) / 2 - gap - (by('left').w * s) / 2, fy];
    if (by('bottom')) auto.bottom = [fx, fy + (F.h * s) / 2 + gap + (by('bottom').h * s) / 2];
    if (by('back')) auto.back = [(auto.right ? auto.right[0] + (Rv.w * s) / 2 : fx + (F.w * s) / 2) + gap + (by('back').w * s) / 2, fy];
    if (I) auto.iso = [W - m - gap - (I.w * s) / 2, m + gap + (I.h * s) / 2];
    for (const v of vs) if (!v.at) v.at = auto[v.dir] || [W / 2, H / 2];
  }
  for (const v of vs) if (!v.at) v.at = [W / 2, H / 2];
  const toSheet = (v, q) => [v.at[0] + s * (q[0] - v.c[0]), v.at[1] - s * (q[1] - v.c[1])];
  return { W, H, s, m, views: vs, toSheet };
}

/* ---------- a dimension's lines ----------
   L: the layout; got: what the dimension holds to, found on the model ({ pt } for a corner, { c, r, n } for a round
   edge), or nothing for one of the view's whole size. { lines: [[x1, y1, x2, y2]], arrows: [[tip, from]], text,
   at: [x, y] (the text's middle), value, hit: [x0, y0, x1, y1] } in sheet millimetres, or null if it cannot be drawn */
export function dimGeom(L, d, got) {
  const v = L.views.find(x => x.id === d.view);
  if (!v || !v.box) return null;
  const S = q => L.toSheet(v, q), s = L.s, G = 1.5;
  let P, Q, dir = d.dir;
  if (d.t === 'ext') {
    // the view's whole size across, under it; or up, to its left
    if (d.axis === 'x') { P = S([v.box[0], v.box[1]]); Q = S([v.box[2], v.box[1]]); dir = 'h'; } else { P = S([v.box[0], v.box[1]]); Q = S([v.box[0], v.box[3]]); dir = 'v'; }
  } else if (d.t === 'dia') {
    const g = got && got.a;
    if (!g || !g.c || !(g.r > 0)) return null;
    const C = S(viewPoint(v.dir, g.c)), r = g.r * s, a = (d.ang || 0) * Math.PI / 180, u = [Math.cos(a), -Math.sin(a)], len = Math.max(4, d.off || 8);
    const p0 = [C[0] - u[0] * r, C[1] - u[1] * r], p1 = [C[0] + u[0] * r, C[1] + u[1] * r], p2 = [C[0] + u[0] * (r + len), C[1] + u[1] * (r + len)];
    const text = 'Ø' + drwText(2 * g.r), tx = p2[0] + (u[0] >= 0 ? 1 : -1) * (text.length * 1.0 + 1.5);
    return { lines: [[p0[0], p0[1], p2[0], p2[1]]], arrows: [[p0, p1], [p1, p0]], text, at: [tx, p2[1]], value: 2 * g.r, hit: [Math.min(tx, p2[0]) - 6, p2[1] - 3, Math.max(tx, p2[0]) + 6, p2[1] + 3], centre: C, r };
  } else {
    const a = got && got.a, b = got && got.b;
    if (!a || !b || !a.pt || !b.pt) return null;
    P = S(viewPoint(v.dir, a.pt)); Q = S(viewPoint(v.dir, b.pt));
  }
  const off = d.off;
  let A, B, value, n;
  if (dir === 'h') { const y = (d.t === 'ext' ? Math.max(P[1], Q[1]) : (P[1] + Q[1]) / 2) + off; A = [P[0], y]; B = [Q[0], y]; value = Math.abs(Q[0] - P[0]) / s; }
  else if (dir === 'v') { const x = (d.t === 'ext' ? Math.min(P[0], Q[0]) : (P[0] + Q[0]) / 2) + off; A = [x, P[1]]; B = [x, Q[1]]; value = Math.abs(Q[1] - P[1]) / s; }
  else { const dx = Q[0] - P[0], dy = Q[1] - P[1], len = Math.hypot(dx, dy) || 1; n = [-dy / len, dx / len]; A = [P[0] + n[0] * off, P[1] + n[1] * off]; B = [Q[0] + n[0] * off, Q[1] + n[1] * off]; value = len / s; }
  if (!(value > 1e-9)) return null;
  // each extension line from a little off its point to a little past the dimension line
  const ext = (p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy); if (len < 1e-6) return null; const u = [dx / len, dy / len]; return [p[0] + u[0] * Math.min(G, len), p[1] + u[1] * Math.min(G, len), q[0] + u[0] * G, q[1] + u[1] * G]; };
  const lines = [[A[0], A[1], B[0], B[1]], ext(P, A), ext(Q, B)].filter(Boolean), text = drwText(value);
  const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], vert = Math.abs(B[0] - A[0]) < Math.abs(B[1] - A[1]);
  const at = vert ? [mid[0] - 1.2 - text.length * 0.95, mid[1]] : [mid[0], mid[1] - 2.2];
  return { lines, arrows: [[A, B], [B, A]], text, at, value, hit: [at[0] - text.length * 1.1 - 1, at[1] - 2.5, at[0] + text.length * 1.1 + 1, at[1] + 2.5], P, Q, A, B };
}

/* ---------- the sheet, drawn through a pen ----------
   pen: line(x1, y1, x2, y2, w, dash), poly(run, w, dash) (run: x, y, x, y… in sheet mm), fill(pts), text(x, y, str,
   size, align, bold). opts: { located: { [dimId]: { a, b } }, date, scale text, source (its name), picked (a
   dimension's id), hot } */
export function drawSheet(pen, D, data, opts) {
  opts = opts || {};
  const L = layoutOf(D, data), { W, H, m, s } = L;
  // the border, and the title block at the bottom right
  pen.poly([m, m, W - m, m, W - m, H - m, m, H - m, m, m], 0.5);
  const tx = W - m - TITLE_W, ty = H - m - TITLE_H, T = D.title || {};
  pen.poly([tx, ty, W - m, ty, W - m, H - m, tx, H - m, tx, ty], 0.35);
  pen.line(tx, ty + 14, W - m, ty + 14, 0.25); pen.line(tx, ty + 25, W - m, ty + 25, 0.25); pen.line(tx + 60, ty + 14, tx + 60, H - m, 0.25); pen.line(tx + 105, ty + 14, tx + 105, H - m, 0.25);
  const cell = (x, y, label, value, big) => { pen.text(x + 1.5, y + 3.2, label, 2, 'l'); if (value) pen.text(x + 1.5, y + (big ? 10.5 : 8.6), String(value).slice(0, big ? 60 : 40), big ? 5 : 3.2, 'l', big); };
  cell(tx, ty, 'TITLE', T.title || D.name, true);
  cell(tx, ty + 14, 'DRAWN BY', T.by || ''); cell(tx + 60, ty + 14, 'DATE', opts.date || ''); cell(tx + 105, ty + 14, 'SCALE', scaleText(s));
  cell(tx, ty + 25, 'MATERIAL', T.material || ''); cell(tx + 60, ty + 25, 'DRAWING NO.', T.number || ''); cell(tx + 105, ty + 25, 'SHEET', D.sheet + ' · mm · third angle');
  if (T.note) pen.text(m + 3, H - m - 3, T.note.slice(0, 120), 2.6, 'l');
  if (opts.source) pen.text(W - m - 1.5, ty - 1.5, opts.source + ' · JEKcad', 2, 'r');
  // the views: what shows, then (if asked) what is behind, dashed
  for (const v of L.views) {
    const dat = data && data.views && data.views[v.id];
    if (!dat || !v.box) { pen.text(v.at[0], v.at[1], 'Nothing to show in the ' + VIEW_DIRS[v.dir].name.toLowerCase() + ' view yet', 3, 'c'); continue; }
    const run = (r, w, dash) => { const out = new Array(r.length); for (let i = 0; i + 1 < r.length; i += 2) { out[i] = v.at[0] + s * (r[i] - v.c[0]); out[i + 1] = v.at[1] - s * (r[i + 1] - v.c[1]); } pen.poly(out, w, dash); };
    if (D.hidden) for (const r of dat.hid) run(r, 0.18, [1.2, 0.9]);
    for (const r of dat.vis) run(r, v.dir === 'iso' ? 0.3 : 0.4);
    if (opts.labels !== false) pen.text(v.at[0], v.at[1] + (v.h * s) / 2 + (D.dims.some(d => d.view === v.id && d.t === 'ext' && d.axis === 'x') ? 17 : 6), VIEW_DIRS[v.dir].name.toUpperCase(), 2.4, 'c');
  }
  // the dimensions
  const out = { layout: L, dims: [] };
  for (const d of D.dims) {
    const g = dimGeom(L, d, opts.located && opts.located[d.id]);
    if (!g) continue;
    const hot = opts.picked === d.id, w = hot ? 0.35 : 0.18;
    for (const l of g.lines) pen.line(l[0], l[1], l[2], l[3], w, null, hot);
    for (const [tip, from] of g.arrows) { const dx = from[0] - tip[0], dy = from[1] - tip[1], len = Math.hypot(dx, dy) || 1, u = [dx / len, dy / len], a = 2.4, b = 0.55; pen.fill([tip[0], tip[1], tip[0] + u[0] * a - u[1] * b, tip[1] + u[1] * a + u[0] * b, tip[0] + u[0] * a + u[1] * b, tip[1] + u[1] * a - u[0] * b], hot); }
    pen.text(g.at[0], g.at[1] + 1.1, g.text, 3, 'c', false, hot);
    out.dims.push({ id: d.id, g });
  }
  return out;
}

/* ---------- a PDF of the sheet, written here ----------
   One page of the sheet's size, the lines as lines and the text in Helvetica (one of the fonts every PDF reader
   has), so it prints at its true size and stays sharp. */
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const helvWidth = (str, size) => { let w = 0; for (const ch of str) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? HELV[c - 32] : c === 0xd8 ? 778 : c === 0xb0 ? 400 : 584; } return w * size / 1000; };
export function pdfOfSheet(D, data, opts) {
  const [W, H] = SHEETS[D.sheet] || SHEETS.A4, k = 72 / 25.4, f = v => +(+v).toFixed(3), ops = [];
  let lw = -1, ds = null;
  const style = (w, dash) => { if (w !== lw) { ops.push(f(w) + ' w'); lw = w; } const d = dash ? dash.map(f).join(' ') : ''; if (d !== ds) { ops.push('[' + d + '] 0 d'); ds = d; } };
  const esc = str => { let o = ''; for (const ch of str) { const c = ch.charCodeAt(0); o += c === 40 || c === 41 || c === 92 ? '\\' + ch : c >= 32 && c <= 126 ? ch : c <= 255 ? '\\' + c.toString(8).padStart(3, '0') : '?'; } return o; };
  const pen = {
    line(x1, y1, x2, y2, w, dash) { style(w || 0.2, dash); ops.push(f(x1) + ' ' + f(y1) + ' m ' + f(x2) + ' ' + f(y2) + ' l S'); },
    poly(run, w, dash) { if (run.length < 4) return; style(w || 0.2, dash); let o = f(run[0]) + ' ' + f(run[1]) + ' m'; for (let i = 2; i + 1 < run.length; i += 2) o += ' ' + f(run[i]) + ' ' + f(run[i + 1]) + ' l'; ops.push(o + ' S'); },
    fill(p) { let o = f(p[0]) + ' ' + f(p[1]) + ' m'; for (let i = 2; i + 1 < p.length; i += 2) o += ' ' + f(p[i]) + ' ' + f(p[i + 1]) + ' l'; ops.push(o + ' h f'); },
    text(x, y, str, size, align, bold) { const w = helvWidth(str, size), x0 = align === 'c' ? x - w / 2 : align === 'r' ? x - w : x; ops.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + f(size) + ' Tf 1 0 0 -1 ' + f(x0) + ' ' + f(y) + ' Tm (' + esc(str) + ') Tj ET'); },
  };
  drawSheet(pen, D, data, Object.assign({}, opts, { picked: null }));
  const stream = '1 J 1 j 0 G 0 g\n' + f(k) + ' 0 0 ' + f(-k) + ' 0 ' + f(H * k) + ' cm\n' + ops.join('\n') + '\n';
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + f(W * k) + ' ' + f(H * k) + '] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Title (' + esc((D.title && D.title.title) || D.name) + ') /Creator (JEKcad) >>'];
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const at = [];
  objs.forEach((o, i) => { at.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + at.map(a => String(a).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info 7 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}
