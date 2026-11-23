import { sketchId } from './sketch.js';

/* ==========================================================================
   A drawing: a tab that shows a Part Studio's parts, or an Assembly, as views on a sheet of paper, with dimensions
   and a title block. Pure: the document's drawing checked, where each view sits on the sheet, each dimension's
   lines, the whole sheet drawn through a pen (the page's canvas, a PDF or a DXF), and both files written with no
   library. The sheet is in millimetres, x across and y down from its top left corner. A view is the model seen
   square on (the kernel takes the hidden lines out); its own coordinates are the model's millimetres, X across and Y
   up. Third angle: the top view above the front, the right view to its right.
   Besides the principal views a drawing has section views (a parent view cut along a line across it, seen from one
   side, the cut faces hatched) and detail views (a circle of a parent view drawn larger).
   ========================================================================== */
export const SHEETS = { A4: [297, 210], A3: [420, 297], A2: [594, 420] };
const R2 = Math.SQRT1_2, R3 = 1 / Math.sqrt(3);
/* each principal view: n towards the eye, x across the paper */
export const VIEW_DIRS = {
  front: { name: 'Front', n: [0, -1, 0], x: [1, 0, 0] }, top: { name: 'Top', n: [0, 0, 1], x: [1, 0, 0] }, right: { name: 'Right', n: [1, 0, 0], x: [0, 1, 0] },
  back: { name: 'Back', n: [0, 1, 0], x: [-1, 0, 0] }, left: { name: 'Left', n: [-1, 0, 0], x: [0, -1, 0] }, bottom: { name: 'Bottom', n: [0, 0, -1], x: [1, 0, 0] },
  iso: { name: 'Isometric', n: [R3, -R3, R3], x: [R2, R2, 0] },
};
const SCALES = [50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001];
const dstr = (v, n) => typeof v === 'string' && v.length <= n;
const dcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const ddot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dneg = a => [-a[0], -a[1], -a[2]];
/* a model point as a view sees it: [X across, Y up] (by a principal view's name, or by a view's frame) */
export function viewPoint(dir, p) { const V = VIEW_DIRS[dir] || VIEW_DIRS.front, y = dcross(V.n, V.x); return [ddot(p, V.x), ddot(p, y)]; }
export const framePoint = (F, p) => [ddot(p, F.x), ddot(p, F.up)];
export const scaleText = s => (s >= 1 ? +s.toFixed(3) + ':1' : '1:' + +(1 / s).toFixed(3));
export const drwText = v => String(+(+v).toFixed(2));
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

/* ---------- a view's frame: which way it looks, and for a section where it cuts ----------
   { n (towards the eye), x (across), up, k (its scale against the sheet's), cut: { o, n } (the half of space on
   the eye's side of the plane through o is taken away) } */
export function frameOf(D, v) {
  if (VIEW_DIRS[v.dir]) { const V = VIEW_DIRS[v.dir]; return { n: V.n, x: V.x, up: dcross(V.n, V.x), k: 1 }; }
  const P = D.views.find(x => x.id === v.of);
  if (!P) return null;
  const PF = frameOf(D, P);
  if (!PF) return null;
  if (v.dir === 'detail') return Object.assign({}, PF, { k: (PF.k || 1) * (v.k || 2), cut: PF.cut });
  // a section: a line across its parent (up the parent at X = pos, or across it at Y = pos), seen from one side
  let n, up;
  if (v.axis === 'v') { n = v.flip ? PF.x : dneg(PF.x); up = PF.up; }
  else { n = v.flip ? dneg(PF.up) : PF.up; up = dneg(PF.n); }
  const x = dcross(up, n), o = v.axis === 'v' ? PF.x.map(c => c * v.pos) : PF.up.map(c => c * v.pos);
  return { n, x, up, k: 1, cut: { o, n } };
}
/* the views the kernel is asked for: every one but a detail (drawn from its parent's lines) */
export const kernelViews = D => D.views.filter(v => v.dir !== 'detail').map(v => { const F = frameOf(D, v); return F && Object.assign({ id: v.id, n: F.n, x: F.x }, F.cut ? { cut: F.cut } : {}); }).filter(Boolean);

/* ---------- the document's drawing, checked ---------- */
function normRef(r) {
  if (!r || typeof r !== 'object' || !r.ref || typeof r.ref !== 'object' || !(r.ref.kind === 'vertex' || r.ref.kind === 'edge')) return null;
  const ref = r.ref, okS = (v, n) => typeof v === 'string' && v.length < n;
  if (!okS(ref.part, 80) || !Array.isArray(ref.faces) || ref.faces.length < 1 || ref.faces.length > 6 || !ref.faces.every(x => okS(x, 120)) || !Array.isArray(ref.pt) || ref.pt.length !== 3 || !ref.pt.every(Number.isFinite)) return null;
  return Object.assign({ ref: { kind: ref.kind, part: ref.part, faces: ref.faces.slice(), pt: ref.pt.slice() } }, okS(r.inst, 40) ? { inst: r.inst } : {});
}
const dfin = (v, d) => (Number.isFinite(v) ? +v : d);
/* a dimension's tolerance: ± one value (sym), + and − values (dev), the limits worked out from them (lim), or a
   fit's letters (fit, as H7); with text before and after it (pre, as "4×"; suf) */
const TOL_KINDS = ['sym', 'dev', 'lim', 'fit'];
function normTol(m) {
  const o = {};
  if (m.tol && typeof m.tol === 'object' && TOL_KINDS.includes(m.tol.k)) {
    const t = m.tol, num = v => (Number.isFinite(+v) && v !== '' && v !== null ? Math.abs(+v) : 0);
    o.tol = t.k === 'fit' ? (dstr(t.fit, 12) && t.fit.trim() ? { k: 'fit', fit: t.fit.trim() } : null) : { k: t.k, p: num(t.p), m: t.k === 'sym' ? num(t.p) : num(t.m) };
    if (!o.tol) delete o.tol;
  }
  if (dstr(m.pre, 24) && m.pre.trim()) o.pre = m.pre.trim();
  if (dstr(m.suf, 24) && m.suf.trim()) o.suf = m.suf.trim();
  return o;
}
/* one sheet of a drawing: its paper and scale, its views, dimensions, notes and balloons, and whether it shows the
   bill of materials */
function normSheet(d, k, vtaken) {
  const vids = new Set(), views = [], src = (Array.isArray(d.views) ? d.views : []).slice(0, 24), used = new Set();
  const at = v => (Array.isArray(v.at) && v.at.length === 2 && v.at.every(Number.isFinite) ? { at: v.at.map(Number) } : {});
  const idOf = v => { const id = dstr(v.id, 40) && v.id && !vids.has(v.id) && !vtaken.has(v.id) ? v.id : sketchId('v'); vids.add(id); vtaken.add(id); return id; };
  for (const v of src) if (v && VIEW_DIRS[v.dir]) views.push(Object.assign({ id: idOf(v), dir: v.dir }, at(v)));
  const principal = new Set(views.filter(v => v.dir !== 'iso').map(v => v.id)), byOld = new Map();
  src.forEach((v, i) => { if (v && VIEW_DIRS[v.dir]) byOld.set(v.id, views[[...src.slice(0, i)].filter(x => x && VIEW_DIRS[x.dir]).length].id); });
  const old = id => byOld.get(id) || id;
  const letter = v => { let L = dstr(v.label, 2) && /^[A-Z]{1,2}$/.test(v.label) && !used.has(v.label) ? v.label : [...LETTERS].find(c => !used.has(c)) || 'Z'; used.add(L); return L; };
  // a section of a principal view (not the isometric one); a detail of any view but a detail
  for (const v of src) if (v && v.dir === 'section' && principal.has(old(v.of))) { const nv = Object.assign({ id: idOf(v), dir: 'section', of: old(v.of), axis: v.axis === 'h' ? 'h' : 'v', pos: dfin(v.pos, 0), label: letter(v) }, v.flip ? { flip: true } : {}, at(v)); byOld.set(v.id, nv.id); views.push(nv); }
  const parents = new Set(views.map(v => v.id));
  for (const v of src) if (v && v.dir === 'detail' && parents.has(old(v.of)) && Array.isArray(v.c) && v.c.length === 2 && v.c.every(Number.isFinite) && dfin(v.r, 0) > 0) { const nv = Object.assign({ id: idOf(v), dir: 'detail', of: old(v.of), c: v.c.map(Number), r: +v.r, k: [1.5, 2, 3, 4, 5, 10].includes(+v.k) ? +v.k : 2, label: letter(v) }, at(v)); byOld.set(v.id, nv.id); views.push(nv); }
  const dims = [], dids = new Set(), live = new Set(views.map(v => v.id));
  for (const m of (Array.isArray(d.dims) ? d.dims : []).slice(0, 400)) {
    if (!m || !live.has(old(m.view)) || !['lin', 'dia', 'rad', 'ang', 'ext'].includes(m.t)) continue;
    const id = dstr(m.id, 40) && m.id && !dids.has(m.id) ? m.id : sketchId('q'); dids.add(id);
    const o = { id, view: old(m.view), t: m.t, off: dfin(m.off, m.t === 'ang' ? 15 : 10) };
    if (m.t === 'lin') { const a = normRef(m.a), b = normRef(m.b); if (!a || !b) continue; Object.assign(o, { a, b, dir: ['h', 'v', 'a'].includes(m.dir) ? m.dir : 'h' }); }
    else if (m.t === 'dia' || m.t === 'rad') { const a = normRef(m.a); if (!a || a.ref.kind !== 'edge') continue; Object.assign(o, { a, ang: dfin(m.ang, 45) }); }
    else if (m.t === 'ang') { const r = ['a', 'b', 'c', 'd'].map(k2 => normRef(m[k2])); if (r.some(x => !x)) continue; Object.assign(o, { a: r[0], b: r[1], c: r[2], d: r[3] }); }
    else o.axis = m.axis === 'y' ? 'y' : 'x';
    dims.push(Object.assign(o, normTol(m)));
  }
  // notes: text where it sits on the sheet, and, with a leader, the corner or edge of a view it points at
  const notes = [], nids = new Set();
  for (const m of (Array.isArray(d.notes) ? d.notes : []).slice(0, 200)) {
    if (!m || !dstr(m.text, 400) || !m.text.trim() || !Array.isArray(m.at) || m.at.length !== 2 || !m.at.every(Number.isFinite)) continue;
    const id = dstr(m.id, 40) && m.id && !nids.has(m.id) ? m.id : sketchId('n'); nids.add(id);
    const a = m.a ? normRef(m.a) : null;
    notes.push(Object.assign({ id, text: m.text.replace(/\r/g, ''), at: m.at.map(Number) }, a && live.has(old(m.view)) ? { view: old(m.view), a } : {}));
  }
  // balloons: a part's item number in the bill of materials, on a leader to a corner or edge of it
  const balloons = [], bids = new Set();
  for (const m of (Array.isArray(d.balloons) ? d.balloons : []).slice(0, 200)) {
    const a = m && normRef(m.a);
    if (!a || !live.has(old(m.view))) continue;
    const id = dstr(m.id, 40) && m.id && !bids.has(m.id) ? m.id : sketchId('b'); bids.add(id);
    balloons.push({ id, view: old(m.view), a, off: Array.isArray(m.off) && m.off.length === 2 && m.off.every(Number.isFinite) ? m.off.map(Number) : [12, -12] });
  }
  return { id: dstr(d.id, 40) && d.id ? d.id : sketchId('s'), name: dstr(d.name, 60) && d.name.trim() ? d.name : 'Sheet ' + (k + 1), sheet: SHEETS[d.sheet] ? d.sheet : 'A4',
    scale: Number.isFinite(d.scale) && d.scale > 0 ? +d.scale : 0, hidden: !!d.hidden, marks: d.marks !== false, bom: !!d.bom, views, dims, notes, balloons };
}
/* what a drawing's open sheet holds, read and written on the drawing itself (not kept with it: a sheet keeps them) */
export const SHEET_KEYS = ['sheet', 'scale', 'hidden', 'marks', 'bom', 'views', 'dims', 'notes', 'balloons'];
function sheetAccess(D) {
  for (const k of SHEET_KEYS) Object.defineProperty(D, k, { get() { return this.sheets[this.at][k]; }, set(v) { this.sheets[this.at][k] = v; }, enumerable: false, configurable: true });
  return D;
}
/* a drawing with sheet k open (as the drawing, for writing a sheet that is not the one shown) */
export function sheetOf(D, k) { const o = Object.create(D); Object.defineProperty(o, 'at', { value: k, enumerable: false }); return o; }
export function normDrawing(d, n) {
  d = d && typeof d === 'object' ? d : {};
  // (a drawing from before it had sheets is its one sheet)
  const src = Array.isArray(d.sheets) && d.sheets.length ? d.sheets.slice(0, 20) : [d], vtaken = new Set();
  const sheets = src.map((x, k) => normSheet(x && typeof x === 'object' ? x : {}, k, vtaken));
  const t = d.title && typeof d.title === 'object' ? d.title : {}, title = {};
  for (const k of ['title', 'by', 'material', 'note', 'number']) if (dstr(t[k], 120) && t[k]) title[k] = t[k];
  return sheetAccess({ id: dstr(d.id, 40) && d.id ? d.id : sketchId('t'), kind: 'drawing', name: dstr(d.name, 120) && d.name.trim() ? d.name : 'Drawing ' + (n || 1),
    of: dstr(d.of, 40) ? d.of : '', part: dstr(d.part, 80) && d.part ? d.part : null, title, sheets, at: Number.isInteger(d.at) && d.at >= 0 && d.at < sheets.length ? d.at : 0 });
}
/* a new, empty sheet for a drawing (its paper and scale as the open one's) */
export const newSheet = (D, k) => normSheet({ sheet: D.sheet, scale: D.scale, views: [{ dir: 'front' }, { dir: 'top' }, { dir: 'right' }, { dir: 'iso' }] }, k, new Set(D.sheets.flatMap(x => x.views.map(v => v.id))));
/* a new drawing of a tab: the three views and the isometric one */
export const newDrawing = (of, n) => normDrawing({ of, views: [{ dir: 'front' }, { dir: 'top' }, { dir: 'right' }, { dir: 'iso' }] }, n);
/* the next letter free for a section or a detail */
export const nextLetter = D => [...LETTERS].find(c => !D.views.some(v => v.label === c)) || 'Z';

/* ---------- a detail view's lines: its parent's, cut to its circle ---------- */
function clipRun(run, c, r) {
  const out = [], inside = (x, y) => Math.hypot(x - c[0], y - c[1]) <= r;
  let cur = null;
  const push = (x, y) => { if (!cur) { cur = []; out.push(cur); } cur.push(x, y); };
  for (let i = 0; i + 3 < run.length; i += 2) {
    const ax = run[i], ay = run[i + 1], bx = run[i + 2], by = run[i + 3], ia = inside(ax, ay), ib = inside(bx, by);
    // where the segment crosses the circle: t along it
    const dx = bx - ax, dy = by - ay, fx = ax - c[0], fy = ay - c[1], A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r, disc = B * B - 4 * A * C;
    const ts = A > 1e-18 && disc > 0 ? [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)].filter(t => t > 0 && t < 1) : [];
    if (ia) { if (!cur) push(ax, ay); }
    const pts = ts.map(t => [ax + dx * t, ay + dy * t]);
    let state = ia;
    for (const p of pts) { if (state) { push(p[0], p[1]); cur = null; } else push(p[0], p[1]); state = !state; }
    if (ib) push(bx, by); else if (state) { cur = null; }
    if (!ib) cur = null;
  }
  return out.filter(r2 => r2.length >= 4);
}
export function withDetails(D, data) {
  if (!data || !data.views) return data;
  const views = Object.assign({}, data.views);
  for (const v of D.views) {
    if (v.dir !== 'detail') continue;
    const P = views[v.of];
    if (!P) continue;
    const clip = L => (L || []).flatMap(run => clipRun(run, v.c, v.r));
    views[v.id] = { id: v.id, vis: clip(P.vis), hid: clip(P.hid), cut: (P.cut || []).map(ring => ring.slice()), clipC: v.c, clipR: v.r,
      circles: (P.circles || []).filter(k => Math.hypot(k.c[0] - v.c[0], k.c[1] - v.c[1]) + k.r <= v.r + 1e-9),
      threads: (P.threads || []).filter(t => t.kind === 'end' ? Math.hypot(t.c[0] - v.c[0], t.c[1] - v.c[1]) + t.r <= v.r + 1e-9 : Math.hypot(t.a[0] - v.c[0], t.a[1] - v.c[1]) <= v.r && Math.hypot(t.b[0] - v.c[0], t.b[1] - v.c[1]) <= v.r) };
  }
  return Object.assign({}, data, { views });
}

/* ---------- where everything sits on the sheet ----------
   data: { views: { [id]: { vis, hid, cut, circles, threads } } } as the kernel gives them (runs of x, y in the view's
   millimetres). { W, H, s, m (the margin), views: [{ id, dir, box, c, at, s (its scale), F }], data, toSheet(view, [X, Y]) } */
export function viewBox(v) {
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const L of [v && v.vis, v && v.hid]) for (const run of L || []) for (let i = 0; i + 1 < run.length; i += 2) { lo = [Math.min(lo[0], run[i]), Math.min(lo[1], run[i + 1])]; hi = [Math.max(hi[0], run[i]), Math.max(hi[1], run[i + 1])]; }
  return lo[0] === Infinity ? null : [lo[0], lo[1], hi[0], hi[1]];
}
export const TITLE_W = 150, TITLE_H = 36;
export function layoutOf(D, data0) {
  const data = withDetails(D, data0);
  const [W, H] = SHEETS[D.sheet] || SHEETS.A4, m = 10, gap = 18;
  const vs = D.views.map(v => {
    const F = frameOf(D, v) || { n: [0, 0, 1], x: [1, 0, 0], up: [0, 1, 0], k: 1 };
    let box = viewBox(data && data.views && data.views[v.id]);
    if (v.dir === 'detail') box = [v.c[0] - v.r, v.c[1] - v.r, v.c[0] + v.r, v.c[1] + v.r];
    return Object.assign({ id: v.id, dir: v.dir, box, at: v.at || null, c: box ? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] : [0, 0], w: box ? box[2] - box[0] : 0, h: box ? box[3] - box[1] : 0, F, k: F.k || 1 }, v.label ? { label: v.label } : {}, v.of ? { of: v.of } : {});
  });
  const by = d => vs.find(v => v.dir === d), Fv = by('front') || vs.find(v => VIEW_DIRS[v.dir]) || vs[0], T = by('top'), Rv = by('right'), I = by('iso');
  // the scale: the largest of the usual ones at which the front, top and right views sit together above the title block
  const needW = (Fv ? Fv.w : 0) + (Rv ? Rv.w : 0) + (I && !Rv ? I.w : 0), needH = (Fv ? Fv.h : 0) + (T ? T.h : 0);
  const roomW = W - 2 * m - gap * 4, roomH = H - 2 * m - TITLE_H - gap * 3;
  let s = D.scale;
  if (!s) { s = SCALES[SCALES.length - 1]; for (const k of SCALES) if (needW * k <= roomW * 0.86 && needH * k <= roomH * 0.92) { s = k; break; } }
  for (const v of vs) v.s = s * v.k;
  // third angle: the front view low on the left, the top above it, the right beside it, the isometric at the top right
  if (Fv && VIEW_DIRS[Fv.dir]) {
    const fx = m + gap + 8 + (Fv.w * s) / 2 + (by('left') ? by('left').w * s + gap : 0), fy = H - m - TITLE_H - gap - (Fv.h * s) / 2 - (by('bottom') ? by('bottom').h * s + gap : 0);
    const auto = { front: [fx, fy] };
    if (T) auto.top = [fx, fy - (Fv.h * s) / 2 - gap - (T.h * s) / 2];
    if (Rv) auto.right = [fx + (Fv.w * s) / 2 + gap + (Rv.w * s) / 2, fy];
    if (by('left')) auto.left = [fx - (Fv.w * s) / 2 - gap - (by('left').w * s) / 2, fy];
    if (by('bottom')) auto.bottom = [fx, fy + (Fv.h * s) / 2 + gap + (by('bottom').h * s) / 2];
    if (by('back')) auto.back = [(auto.right ? auto.right[0] + (Rv.w * s) / 2 : fx + (Fv.w * s) / 2) + gap + (by('back').w * s) / 2, fy];
    if (I) auto.iso = [W - m - gap - (I.w * s) / 2, m + gap + (I.h * s) / 2];
    for (const v of vs) if (!v.at && auto[v.dir]) v.at = auto[v.dir];
  }
  // a section or a detail with no place of its own: the spot on the sheet nearest its parent that covers least of
  // the other views (each with room round it for its dimensions and its name), the title block and the sheet's edge
  const placedViews = () => vs.filter(o => o.at && o.box);
  for (const v of vs) {
    if (v.at) continue;
    const P = vs.find(x => x.id === v.of), want = P && P.at ? P.at : [W / 2, H / 2], hw = v.w * v.s / 2 + 4, hh = v.h * v.s / 2 + 4;
    const boxes = placedViews().filter(o => o !== v).map(o => [o.at[0] - o.w * o.s / 2 - 14, o.at[1] - o.h * o.s / 2 - 8, o.at[0] + o.w * o.s / 2 + 8, o.at[1] + o.h * o.s / 2 + 18]);
    boxes.push([W - m - TITLE_W, H - m - TITLE_H - 4 - (D.bom && data0 && data0.bomRows ? bomHeight(data0.bomRows) : 0), W - m, H - m]);
    const cover = (x, y) => { let a = 0; for (const b of boxes) { const ox = Math.min(x + hw, b[2]) - Math.max(x - hw, b[0]), oy = Math.min(y + hh + 8, b[3]) - Math.max(y - hh, b[1]); if (ox > 0 && oy > 0) a += ox * oy; } return a; };
    let best = [W / 2, H / 2], bs = Infinity;
    for (let x = m + hw; x <= W - m - hw + 1e-9; x += 3) for (let y = m + hh; y <= H - m - hh - 8 + 1e-9; y += 3) {
      const sc = cover(x, y) * 50 + Math.hypot(x - want[0], y - want[1]);
      if (sc < bs) { bs = sc; best = [x, y]; }
    }
    v.at = best;
  }
  const toSheet = (v, q) => [v.at[0] + v.s * (q[0] - v.c[0]), v.at[1] - v.s * (q[1] - v.c[1])];
  return { W, H, s, m, views: vs, toSheet, data };
}

/* ---------- a dimension's lines ----------
   L: the layout; got: what the dimension holds to, found on the model ({ pt } for a corner, { c, r, n, label } for a
   round edge), or nothing for one of the view's whole size. { lines: [[x1, y1, x2, y2]], arrows: [[tip, from]], text,
   at: [x, y] (the text's middle), value, hit: [x0, y0, x1, y1] } in sheet millimetres, or null if it cannot be drawn */
export function dimGeom(L, d, got) {
  const v = L.views.find(x => x.id === d.view);
  if (!v || !v.box) return null;
  const S = q => L.toSheet(v, q), s = v.s, G = 1.5, VP = p => framePoint(v.F, p);
  let P, Q, dir = d.dir;
  if (d.t === 'ext') {
    // the view's whole size across, under it; or up, to its left
    if (d.axis === 'x') { P = S([v.box[0], v.box[1]]); Q = S([v.box[2], v.box[1]]); dir = 'h'; } else { P = S([v.box[0], v.box[1]]); Q = S([v.box[0], v.box[3]]); dir = 'v'; }
  } else if (d.t === 'dia' || d.t === 'rad') {
    const g = got && got.a;
    if (!g || !g.c || !(g.r > 0)) return null;
    const C = S(VP(g.c)), r = g.r * s, a = (d.ang || 0) * Math.PI / 180, u = [Math.cos(a), -Math.sin(a)], len = Math.max(4, d.off || 8);
    const p0 = [C[0] - u[0] * r, C[1] - u[1] * r], p1 = [C[0] + u[0] * r, C[1] + u[1] * r], p2 = [C[0] + u[0] * (r + len), C[1] + u[1] * (r + len)];
    const text = d.t === 'rad' ? 'R' + drwText(g.r) : g.label || 'Ø' + drwText(2 * g.r), tx = p2[0] + (u[0] >= 0 ? 1 : -1) * (text.length * 0.95 + 1.5);
    const lines = d.t === 'rad' ? [[C[0], C[1], p2[0], p2[1]]] : [[p0[0], p0[1], p2[0], p2[1]]];
    return { lines, arrows: d.t === 'rad' ? [[p1, C]] : [[p0, p1], [p1, p0]], text, at: [tx, p2[1]], value: d.t === 'rad' ? g.r : 2 * g.r, hit: [Math.min(tx - text.length, p2[0]) - 3, p2[1] - 3, Math.max(tx + text.length, p2[0]) + 3, p2[1] + 3], centre: C, r };
  } else if (d.t === 'ang') {
    // two lines, each by two corners: the angle between them, an arc about where they meet
    const k = ['a', 'b', 'c', 'd'].map(x => got && got[x] && got[x].pt ? S(VP(got[x].pt)) : null);
    if (k.some(p => !p)) return null;
    const [A1, A2, B1, B2] = k, r1 = [A2[0] - A1[0], A2[1] - A1[1]], r2 = [B2[0] - B1[0], B2[1] - B1[1]], den = r1[0] * r2[1] - r1[1] * r2[0];
    if (Math.abs(den) < 1e-9 * Math.hypot(...r1) * Math.hypot(...r2)) return null;
    const t = ((B1[0] - A1[0]) * r2[1] - (B1[1] - A1[1]) * r2[0]) / den, X = [A1[0] + r1[0] * t, A1[1] + r1[1] * t];
    const far = (p, q) => (Math.hypot(p[0] - X[0], p[1] - X[1]) >= Math.hypot(q[0] - X[0], q[1] - X[1]) ? p : q);
    const ua = far(A1, A2), ub = far(B1, B2), aa = Math.atan2(ua[1] - X[1], ua[0] - X[0]);
    let ab = Math.atan2(ub[1] - X[1], ub[0] - X[0]), sweep = ab - aa;
    while (sweep > Math.PI) sweep -= 2 * Math.PI; while (sweep < -Math.PI) sweep += 2 * Math.PI;
    const value = Math.abs(sweep) * 180 / Math.PI, R = Math.max(4, d.off || 15), N = 24, pts = [];
    for (let i = 0; i <= N; i++) { const q = aa + sweep * i / N; pts.push([X[0] + R * Math.cos(q), X[1] + R * Math.sin(q)]); }
    const lines = []; for (let i = 0; i < N; i++) lines.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
    // extension lines from the corners on each line out to the arc, where the arc is past them
    for (const [p, ang] of [[ua, aa], [ub, ab]]) { const dist = Math.hypot(p[0] - X[0], p[1] - X[1]); if (R > dist + 0.5) lines.push([p[0] + Math.cos(ang) * G, p[1] + Math.sin(ang) * G, X[0] + Math.cos(ang) * (R + G), X[1] + Math.sin(ang) * (R + G)]); }
    const mid = aa + sweep / 2, text = drwText(value) + '°', at = [X[0] + (R + 3.5) * Math.cos(mid), X[1] + (R + 3.5) * Math.sin(mid)];
    return { lines, arrows: [[pts[0], pts[2]], [pts[N], pts[N - 2]]], text, at, value, hit: [at[0] - text.length - 1, at[1] - 2.5, at[0] + text.length + 1, at[1] + 2.5], X, R };
  } else {
    const a = got && got.a, b = got && got.b;
    if (!a || !b || !a.pt || !b.pt) return null;
    P = S(VP(a.pt)); Q = S(VP(b.pt));
  }
  const off = d.off;
  let A, B, value;
  if (dir === 'h') { const y = (d.t === 'ext' ? Math.max(P[1], Q[1]) : (P[1] + Q[1]) / 2) + off; A = [P[0], y]; B = [Q[0], y]; value = Math.abs(Q[0] - P[0]) / s; }
  else if (dir === 'v') { const x = (d.t === 'ext' ? Math.min(P[0], Q[0]) : (P[0] + Q[0]) / 2) + off; A = [x, P[1]]; B = [x, Q[1]]; value = Math.abs(Q[1] - P[1]) / s; }
  else { const dx = Q[0] - P[0], dy = Q[1] - P[1], len = Math.hypot(dx, dy) || 1, nn = [-dy / len, dx / len]; A = [P[0] + nn[0] * off, P[1] + nn[1] * off]; B = [Q[0] + nn[0] * off, Q[1] + nn[1] * off]; value = len / s; }
  if (!(value > 1e-9)) return null;
  // each extension line from a little off its point to a little past the dimension line
  const ext = (p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy); if (len < 1e-6) return null; const u = [dx / len, dy / len]; return [p[0] + u[0] * Math.min(G, len), p[1] + u[1] * Math.min(G, len), q[0] + u[0] * G, q[1] + u[1] * G]; };
  const lines = [[A[0], A[1], B[0], B[1]], ext(P, A), ext(Q, B)].filter(Boolean), text = drwText(value);
  const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], vert = Math.abs(B[0] - A[0]) < Math.abs(B[1] - A[1]);
  const at = vert ? [mid[0] - 1.2 - text.length * 0.95, mid[1]] : [mid[0], mid[1] - 2.2];
  return { lines, arrows: [[A, B], [B, A]], text, at, value, hit: [at[0] - text.length * 1.1 - 1, at[1] - 2.5, at[0] + text.length * 1.1 + 1, at[1] + 2.5], P, Q, A, B };
}

/* ---------- a dimension's text with its tolerance ----------
   g: the dimension's geometry (its text and value). ± (sym), + and − (dev), the limits (lim: the largest over the
   least, the dimension's sign kept, as Ø or R), a fit's letters; text before and after it */
export function tolText(d, g) {
  let t = g.text;
  const T = d.tol, n = drwText, sign = (t.match(/^[ØR]/) || [''])[0], unit = /°$/.test(t) ? '°' : '';
  if (T && !/^M/.test(t)) {
    if (T.k === 'sym') t += ' ±' + n(T.p) + unit;
    else if (T.k === 'dev') t += ' +' + n(T.p) + ' -' + n(T.m);
    else if (T.k === 'lim') t = sign + n(g.value + T.p) + unit + '/' + n(g.value - T.m) + unit;
    else if (T.k === 'fit') t += ' ' + T.fit;
  }
  return (d.pre ? d.pre + ' ' : '') + t + (d.suf ? ' ' + d.suf : '');
}
/* ---------- the bill of materials ----------
   rows: [{ item, name, qty, material }] (an assembly's parts by Part Studio and part, numbered as they first come) */
const BOM_ROW = 6, BOM_COLS = [['ITEM', 14], ['NAME', 74], ['QTY', 14], ['MATERIAL', 48]];
export const bomHeight = rows => (rows && rows.length ? (rows.length + 1) * BOM_ROW + 6 : 0);
export function bomRows(items, lookOf) {
  const rows = [], at = new Map();
  for (const it of items) {
    const key = it.doc + '|' + it.part;
    if (!at.has(key)) { const L = lookOf(it) || {}; at.set(key, rows.length); rows.push({ item: rows.length + 1, name: L.name || 'Part', qty: 0, material: L.material || '', mass: L.mass, key }); }
    rows[at.get(key)].qty++;
  }
  return rows;
}
/* the bill of materials as CSV (RFC 4180): item, name, quantity, material, each one's mass and all of them's */
export function bomCsv(rows) {
  const q = v => { const t = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const out = [['Item', 'Name', 'Quantity', 'Material', 'Mass each (g)', 'Mass (g)'].join(',')];
  for (const r of rows) out.push([r.item, r.name, r.qty, r.material, Number.isFinite(r.mass) ? +r.mass.toFixed(3) : '', Number.isFinite(r.mass) ? +(r.mass * r.qty).toFixed(3) : ''].map(q).join(','));
  return '\ufeff' + out.join('\r\n') + '\r\n';
}

/* ---------- hatching: lines at 45° across closed outlines (inside by the even-odd rule) ---------- */
export function hatchLines(rings, gap) {
  // turned by −45°, the hatch lines are level: each one cut where the outlines cross it, and the pieces inside kept
  const c = Math.SQRT1_2, rot = (x, y) => [c * x + c * y, -c * x + c * y], back = (u, v) => [c * u - c * v, c * u + c * v];
  const R = rings.map(r => { const o = []; for (let i = 0; i + 1 < r.length; i += 2) o.push(rot(r[i], r[i + 1])); return o; }).filter(r => r.length >= 3);
  if (!R.length) return [];
  let lo = Infinity, hi = -Infinity;
  for (const r of R) for (const p of r) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
  const out = [];
  for (let y = Math.ceil(lo / gap) * gap; y < hi; y += gap) {
    const xs = [];
    for (const r of R) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 1e-6) { const p = back(xs[i], y), q = back(xs[i + 1], y); out.push([p[0], p[1], q[0], q[1]]); }
  }
  return out;
}

/* ---------- the sheet, drawn through a pen ----------
   pen: line(x1, y1, x2, y2, w, dash), poly(run, w, dash) (run: x, y, x, y… in sheet mm), fill(pts), text(x, y, str,
   size, align, bold). opts: { located: { [dimId]: { a, b } }, date, source (its name), picked (a dimension's id) } */
const CHAIN = [6, 1.5, 1, 1.5], HIDDEN = [1.2, 0.9];
export function drawSheet(pen, D, data, opts) {
  opts = opts || {};
  const L = layoutOf(D, data), { W, H, m } = L, dat = L.data;
  // the border, and the title block at the bottom right
  pen.poly([m, m, W - m, m, W - m, H - m, m, H - m, m, m], 0.5);
  const tx = W - m - TITLE_W, ty = H - m - TITLE_H, T = D.title || {};
  pen.poly([tx, ty, W - m, ty, W - m, H - m, tx, H - m, tx, ty], 0.35);
  pen.line(tx, ty + 14, W - m, ty + 14, 0.25); pen.line(tx, ty + 25, W - m, ty + 25, 0.25); pen.line(tx + 60, ty + 14, tx + 60, H - m, 0.25); pen.line(tx + 105, ty + 14, tx + 105, H - m, 0.25);
  const cell = (x, y, label, value, big) => { pen.text(x + 1.5, y + 3.2, label, 2, 'l'); if (value) pen.text(x + 1.5, y + (big ? 10.5 : 8.6), String(value).slice(0, big ? 60 : 40), big ? 5 : 3.2, 'l', big); };
  cell(tx, ty, 'TITLE', T.title || D.name, true);
  cell(tx, ty + 14, 'DRAWN BY', T.by || ''); cell(tx + 60, ty + 14, 'DATE', opts.date || ''); cell(tx + 105, ty + 14, 'SCALE', scaleText(L.s));
  cell(tx, ty + 25, 'MATERIAL', T.material || ''); cell(tx + 60, ty + 25, 'DRAWING NO.', T.number || ''); cell(tx + 105, ty + 25, 'SHEET', (opts.sheetNo ? opts.sheetNo[0] + ' of ' + opts.sheetNo[1] + ' · ' : '') + D.sheet + ' · mm');
  if (T.note) pen.text(m + 3, H - m - 3, T.note.slice(0, 120), 2.6, 'l');
  // the bill of materials above the title block
  const bom = D.bom && opts.bom && opts.bom.length ? opts.bom : null;
  if (bom) {
    const bh = (bom.length + 1) * BOM_ROW, by0 = ty - 4 - bh, x0 = W - m - TITLE_W;
    pen.poly([x0, by0, W - m, by0, W - m, by0 + bh, x0, by0 + bh, x0, by0], 0.35);
    let cx = x0; for (const [, w] of BOM_COLS.slice(0, -1)) { cx += w; pen.line(cx, by0, cx, by0 + bh, 0.18); }
    for (let i = 1; i <= bom.length; i++) pen.line(x0, by0 + i * BOM_ROW, W - m, by0 + i * BOM_ROW, i === bom.length ? 0.35 : 0.13);
    // (the heading at the foot, the items going up from it: the way a list above a title block reads)
    const rowY = i => by0 + bh - (i + 1) * BOM_ROW + 4.3;
    cx = x0; for (const [name, w] of BOM_COLS) { pen.text(cx + 1.5, by0 + bh - BOM_ROW + 4.2, name, 2.2, 'l', true); cx += w; }
    bom.forEach((r, i) => { const y = rowY(i + 1); let c2 = x0; const cells = [String(r.item), r.name, String(r.qty), r.material || '']; cells.forEach((v, k) => { pen.text(c2 + 1.5, y, String(v).slice(0, k === 1 ? 38 : 24), 2.6, 'l'); c2 += BOM_COLS[k][1]; }); });
  }
  if (opts.source) pen.text(W - m - 1.5, (bom ? ty - 4 - (bom.length + 1) * BOM_ROW : ty) - 1.5, opts.source + ' · JEKcad', 2, 'r');
  // the views
  for (const v of L.views) {
    const dv = dat && dat.views && dat.views[v.id];
    if (!dv || !v.box) { pen.text(v.at[0], v.at[1], 'Nothing to show in this view yet', 3, 'c'); continue; }
    const sx = q => v.at[0] + v.s * (q[0] - v.c[0]), sy = q => v.at[1] - v.s * (q[1] - v.c[1]);
    const run = (r, w, dash) => { const out = new Array(r.length); for (let i = 0; i + 1 < r.length; i += 2) { out[i] = v.at[0] + v.s * (r[i] - v.c[0]); out[i + 1] = v.at[1] - v.s * (r[i + 1] - v.c[1]); } pen.poly(out, w, dash); };
    // the cut faces of a section, hatched
    if (dv.cut && dv.cut.length) { const rings = dv.cut.map(r => { const o = []; for (let i = 0; i + 1 < r.length; i += 2) o.push(sx([r[i], r[i + 1]]), sy([r[i], r[i + 1]])); return o; }); for (const l of hatchLines(rings, 2.5)) pen.line(l[0], l[1], l[2], l[3], 0.13); }
    if (D.hidden) for (const r of dv.hid) run(r, 0.18, HIDDEN);
    for (const r of dv.vis) run(r, v.dir === 'iso' ? 0.3 : 0.4);
    // centre marks on round edges seen end on, and threads (ISO 6410: a thin three-quarter circle; thin lines along)
    if (D.marks && v.dir !== 'iso') for (const k of dv.circles || []) { const C = [sx(k.c), sy(k.c)], e = k.r * v.s + 2.2; pen.line(C[0] - e, C[1], C[0] + e, C[1], 0.13, CHAIN); pen.line(C[0], C[1] - e, C[0], C[1] + e, 0.13, CHAIN); }
    for (const t of dv.threads || []) {
      if (t.kind === 'end') { const C = [sx(t.c), sy(t.c)], r = t.r * v.s, pts = []; for (let i = 0; i <= 27; i++) { const a = Math.PI / 2 + i / 27 * 1.5 * Math.PI; pts.push(C[0] + r * Math.cos(a), C[1] - r * Math.sin(a)); } pen.poly(pts, 0.18); }
      else { const ax = t.b[0] - t.a[0], ay = t.b[1] - t.a[1], L2 = Math.hypot(ax, ay) || 1, nx = -ay / L2 * t.half, ny = ax / L2 * t.half; for (const sg of [1, -1]) pen.line(sx([t.a[0] + sg * nx, t.a[1] + sg * ny]), sy([t.a[0] + sg * nx, t.a[1] + sg * ny]), sx([t.b[0] + sg * nx, t.b[1] + sg * ny]), sy([t.b[0] + sg * nx, t.b[1] + sg * ny]), 0.18, t.seen ? null : HIDDEN); }
    }
    // a detail's own circle
    if (v.dir === 'detail') { const pts = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * 2 * Math.PI; pts.push(v.at[0] + v.w / 2 * v.s * Math.cos(a), v.at[1] + v.h / 2 * v.s * Math.sin(a)); } pen.poly(pts, 0.25); }
    // where sections cut this view, and where details are taken from it
    for (const c of L.views) {
      if (c.of !== v.id) continue;
      const Dc = D.views.find(x => x.id === c.id);
      if (c.dir === 'section') {
        const ext = 4 / v.s, a = Dc.axis === 'v' ? [Dc.pos, v.box[1] - ext] : [v.box[0] - ext, Dc.pos], b = Dc.axis === 'v' ? [Dc.pos, v.box[3] + ext] : [v.box[2] + ext, Dc.pos];
        const A = [sx(a), sy(a)], B = [sx(b), sy(b)];
        pen.line(A[0], A[1], B[0], B[1], 0.25, CHAIN);
        // the arrows at each end, the way the section looks (its line of sight, as this view sees it)
        const look = framePoint(v.F, dneg(c.F.n)), ln = Math.hypot(look[0], look[1]) || 1, u = [look[0] / ln, -look[1] / ln];
        for (const E of [A, B]) {
          const tip = [E[0] + u[0] * 6, E[1] + u[1] * 6];
          pen.line(E[0], E[1], tip[0], tip[1], 0.35);
          pen.fill([tip[0], tip[1], tip[0] - u[0] * 2.4 - u[1] * 0.8, tip[1] - u[1] * 2.4 + u[0] * 0.8, tip[0] - u[0] * 2.4 + u[1] * 0.8, tip[1] - u[1] * 2.4 - u[0] * 0.8]);
          pen.text(E[0] + u[0] * 3 - (Dc.axis === 'v' ? 0 : 3), E[1] + u[1] * 3 + (Dc.axis === 'v' ? (E === A ? 4.5 : -2) : 1), c.label, 3.5, 'c', true);
        }
      } else if (c.dir === 'detail') {
        const C = [sx(Dc.c), sy(Dc.c)], r = Dc.r * v.s, pts = [];
        for (let i = 0; i <= 48; i++) { const a = i / 48 * 2 * Math.PI; pts.push(C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)); }
        pen.poly(pts, 0.25, [3, 1.2]);
        pen.text(C[0] + r * 0.75 + 1.5, C[1] - r * 0.75 - 1, c.label, 3.5, 'l', true);
      }
    }
    if (opts.labels !== false) {
      const below = v.at[1] + (v.h * v.s) / 2 + (D.dims.some(d => d.view === v.id && ((d.t === 'ext' && d.axis === 'x') || (d.t === 'lin' && d.dir === 'h' && d.off > 0))) ? 17 : 6);
      const name = v.dir === 'section' ? 'SECTION ' + v.label + '-' + v.label : v.dir === 'detail' ? 'DETAIL ' + v.label + ' (' + scaleText(v.s) + ')' : VIEW_DIRS[v.dir].name.toUpperCase();
      pen.text(v.at[0], below, name, v.dir === 'section' || v.dir === 'detail' ? 3 : 2.4, 'c', v.dir === 'section' || v.dir === 'detail');
    }
  }
  // the dimensions (a pen that sorts its lines by what they are is told they begin)
  if (pen.phase) pen.phase('dims');
  const out = { layout: L, dims: [] };
  for (const d of D.dims) {
    const g = dimGeom(L, d, opts.located && opts.located[d.id]);
    if (!g) continue;
    const hot = opts.picked === d.id, w = hot ? 0.35 : 0.18;
    for (const l of g.lines) pen.line(l[0], l[1], l[2], l[3], w, null, hot);
    for (const [tip, from] of g.arrows) { const dx = from[0] - tip[0], dy = from[1] - tip[1], len = Math.hypot(dx, dy) || 1, u = [dx / len, dy / len], a = 2.4, b = 0.55; pen.fill([tip[0], tip[1], tip[0] + u[0] * a - u[1] * b, tip[1] + u[1] * a + u[0] * b, tip[0] + u[0] * a + u[1] * b, tip[1] + u[1] * a - u[0] * b], hot); }
    const label = tolText(d, g);
    pen.text(g.at[0], g.at[1] + 1.1, label, 3, 'c', false, hot);
    // (the text with its tolerance is wider: so is where it is clicked)
    const grow = Math.max(0, (label.length - g.text.length) * 0.95);
    out.dims.push({ id: d.id, g: Object.assign({}, g, { label, hit: [g.hit[0] - grow, g.hit[1], g.hit[2] + grow, g.hit[3]] }) });
  }
  // a point of the model on the sheet, as a view shows it (what a note's leader or a balloon points at)
  const onSheet = (vid, got) => { const v = L.views.find(x => x.id === vid); return v && v.box && got && got.pt ? L.toSheet(v, framePoint(v.F, got.pt)) : got && got.c && v && v.box ? L.toSheet(v, framePoint(v.F, got.c)) : null; };
  const arrowTo = (tip, from, hot) => { const dx = from[0] - tip[0], dy = from[1] - tip[1], len = Math.hypot(dx, dy) || 1, u = [dx / len, dy / len]; pen.fill([tip[0], tip[1], tip[0] + u[0] * 2.4 - u[1] * 0.55, tip[1] + u[1] * 2.4 + u[0] * 0.55, tip[0] + u[0] * 2.4 + u[1] * 0.55, tip[1] + u[1] * 2.4 - u[0] * 0.55], hot); };
  out.notes = []; out.balloons = [];
  for (const nt of D.notes || []) {
    const hot = opts.picked === nt.id, lines = nt.text.split('\n').slice(0, 12), size = 3, lh = size * 1.35, wmax = Math.max(...lines.map(x => x.length)) * size * 0.55;
    lines.forEach((t, i) => pen.text(nt.at[0], nt.at[1] + i * lh, t, size, 'l', false, hot));
    const tip = nt.view ? onSheet(nt.view, opts.located && opts.located[nt.id] && opts.located[nt.id].a) : null;
    if (tip) {
      // the leader from the nearer end of the first line, with a short shoulder
      const left = tip[0] < nt.at[0] + wmax / 2, sx0 = left ? nt.at[0] - 1 : nt.at[0] + wmax + 1, sy0 = nt.at[1] - size * 0.35, kx = sx0 + (left ? -3 : 3);
      pen.line(sx0, sy0, kx, sy0, 0.18, null, hot); pen.line(kx, sy0, tip[0], tip[1], 0.18, null, hot); arrowTo(tip, [kx, sy0], hot);
    }
    out.notes.push({ id: nt.id, hit: [nt.at[0] - 1, nt.at[1] - size, nt.at[0] + wmax + 1, nt.at[1] + (lines.length - 1) * lh + 1], tip });
  }
  for (const b of D.balloons || []) {
    const tip = onSheet(b.view, opts.located && opts.located[b.id] && opts.located[b.id].a);
    if (!tip) continue;
    const hot = opts.picked === b.id, no = opts.balloonNo && opts.balloonNo[b.id], C = [tip[0] + b.off[0], tip[1] + b.off[1]], r = 3.6, d0 = Math.hypot(b.off[0], b.off[1]) || 1;
    const edge = [C[0] - b.off[0] / d0 * r, C[1] - b.off[1] / d0 * r];
    pen.line(edge[0], edge[1], tip[0], tip[1], 0.18, null, hot);
    pen.fill(Array.from({ length: 12 }, (_, i) => [tip[0] + 0.6 * Math.cos(i / 6 * Math.PI), tip[1] + 0.6 * Math.sin(i / 6 * Math.PI)]).flat(), hot);
    const ring = []; for (let i = 0; i <= 36; i++) { const a = i / 36 * 2 * Math.PI; ring.push(C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)); }
    pen.poly(ring, hot ? 0.35 : 0.25);
    pen.text(C[0], C[1] + 1.2, no ? String(no) : '?', 3.4, 'c', true, hot);
    out.balloons.push({ id: b.id, hit: [C[0] - r, C[1] - r, C[0] + r, C[1] + r], tip, C });
  }
  return out;
}

/* ---------- a PDF of the sheet, written here ----------
   One page of the sheet's size, the lines as lines and the text in Helvetica (one of the fonts every PDF reader
   has), so it prints at its true size and stays sharp. */
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const helvWidth = (str, size) => { let w = 0; for (const ch of str) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? HELV[c - 32] : c === 0xd8 ? 778 : c === 0xb0 ? 400 : 584; } return w * size / 1000; };
export const pdfOfSheet = (D, data, opts) => pdfOfSheets([{ D, data, opts }]);
/* every sheet a page, each of its own size: pages [{ D, data, opts }] */
export function pdfOfSheets(pages) {
  const k = 72 / 25.4, f = v => +(+v).toFixed(3), streams = [];
  const esc = str => { let o = ''; for (const ch of str) { const c = ch.charCodeAt(0); o += c === 40 || c === 41 || c === 92 ? '\\' + ch : c >= 32 && c <= 126 ? ch : c <= 255 ? '\\' + c.toString(8).padStart(3, '0') : c === 0x2212 ? '-' : '?'; } return o; };
  for (const pg of pages) streams.push(pdfPage(pg.D, pg.data, pg.opts, f, esc, k));
  const D0 = pages[0].D, n = pages.length;
  // 1 catalog, 2 pages, 3 and 4 the fonts, 5 the info; then each page and its content
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [' + pages.map((p, i) => (6 + 2 * i) + ' 0 R').join(' ') + '] /Count ' + n + ' >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Title (' + esc((D0.title && D0.title.title) || D0.name) + ') /Creator (JEKcad) >>'];
  pages.forEach((pg, i) => { const [W, H] = SHEETS[pg.D.sheet] || SHEETS.A4; objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + f(W * k) + ' ' + f(H * k) + '] /Contents ' + (7 + 2 * i) + ' 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>', '<< /Length ' + streams[i].length + ' >>\nstream\n' + streams[i] + 'endstream'); });
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const at = [];
  objs.forEach((o, i) => { at.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + at.map(a => String(a).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info 5 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}
function pdfPage(D, data, opts, f, esc, k) {
  const [, H] = SHEETS[D.sheet] || SHEETS.A4, ops = [];
  let lw = -1, ds = null;
  const style = (w, dash) => { if (w !== lw) { ops.push(f(w) + ' w'); lw = w; } const d = dash ? dash.map(f).join(' ') : ''; if (d !== ds) { ops.push('[' + d + '] 0 d'); ds = d; } };
  const pen = {
    line(x1, y1, x2, y2, w, dash) { style(w || 0.2, dash); ops.push(f(x1) + ' ' + f(y1) + ' m ' + f(x2) + ' ' + f(y2) + ' l S'); },
    poly(run, w, dash) { if (run.length < 4) return; style(w || 0.2, dash); let o = f(run[0]) + ' ' + f(run[1]) + ' m'; for (let i = 2; i + 1 < run.length; i += 2) o += ' ' + f(run[i]) + ' ' + f(run[i + 1]) + ' l'; ops.push(o + ' S'); },
    fill(p) { let o = f(p[0]) + ' ' + f(p[1]) + ' m'; for (let i = 2; i + 1 < p.length; i += 2) o += ' ' + f(p[i]) + ' ' + f(p[i + 1]) + ' l'; ops.push(o + ' h f'); },
    text(x, y, str, size, align, bold) { const w = helvWidth(str, size), x0 = align === 'c' ? x - w / 2 : align === 'r' ? x - w : x; ops.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + f(size) + ' Tf 1 0 0 -1 ' + f(x0) + ' ' + f(y) + ' Tm (' + esc(str) + ') Tj ET'); },
  };
  drawSheet(pen, D, data, Object.assign({}, opts, { picked: null }));
  return '1 J 1 j 0 G 0 g\n' + f(k) + ' 0 0 ' + f(-k) + ' 0 ' + f(H * k) + ' cm\n' + ops.join('\n') + '\n';
}

/* ---------- a DXF of the sheet, written here ----------
   AutoCAD R12 text, in millimetres, the sheet's corner at the origin and y up: lines as LINEs on layers by what they
   are (VISIBLE, THIN, HIDDEN, CENTRE, DIMENSIONS, TEXT), dashed by the HIDDEN and CENTER line types, arrowheads as
   SOLIDs, text as TEXT (Ø as %%c, ° as %%d). Every CAD program reads R12. */
export const dxfOfSheet = (D, data, opts) => dxfOfSheets([{ D, data, opts }]);
/* every sheet in the one file, side by side from the origin with 20 mm between them, their tops level */
export function dxfOfSheets(pages) {
  const f = v => String(+(+v).toFixed(4)), E = [], Htop = Math.max(...pages.map(pg => (SHEETS[pg.D.sheet] || SHEETS.A4)[1]));
  const pair = (c, v) => E.push(String(c), String(v));
  let ox = 0;
  for (const pg of pages) { dxfSheet(pg.D, pg.data, pg.opts, pair, f, ox, Htop); ox += (SHEETS[pg.D.sheet] || SHEETS.A4)[0] + 20; }
  return dxfFile(E, f, ox - 20, Htop);
}
function dxfSheet(D, data, opts, pair, f, ox, Htop) {
  const [, H0] = SHEETS[D.sheet] || SHEETS.A4, H = Htop, X = x => f(+x + ox);
  void H0;
  const layerOf = (w, dash, dim) => (dim ? 'DIMENSIONS' : dash === HIDDEN ? 'HIDDEN' : dash === CHAIN ? 'CENTRE' : w >= 0.3 ? 'VISIBLE' : 'THIN');
  const ltypeOf = dash => (dash === HIDDEN ? 'HIDDEN' : dash === CHAIN ? 'CENTER' : dash ? 'DASHED' : 'CONTINUOUS');
  let dimMode = false;
  const line = (x1, y1, x2, y2, w, dash) => { pair(0, 'LINE'); pair(8, layerOf(w, dash, dimMode)); pair(6, ltypeOf(dash)); pair(10, X(x1)); pair(20, f(H - y1)); pair(30, 0); pair(11, X(x2)); pair(21, f(H - y2)); pair(31, 0); };
  const txt = s => { let o = ''; for (const ch of s) o += ch === 'Ø' ? '%%c' : ch === '°' ? '%%d' : ch === '±' ? '%%p' : ch === '×' ? 'x' : ch === '·' ? '-' : ch.charCodeAt(0) < 127 ? ch : '?'; return o; };
  const pen = {
    line, poly(run, w, dash) { for (let i = 0; i + 3 < run.length; i += 2) line(run[i], run[i + 1], run[i + 2], run[i + 3], w, dash); },
    fill(p) { const q = p.length >= 8 ? p.slice(0, 8) : p.concat(p.slice(-2)); pair(0, 'SOLID'); pair(8, 'DIMENSIONS'); for (let i = 0; i < 4; i++) { pair(10 + i, X(q[2 * i])); pair(20 + i, f(H - q[2 * i + 1])); pair(30 + i, 0); } },
    text(x, y, s, size, align) { const h = size * 0.72, al = align === 'c' ? 1 : align === 'r' ? 2 : 0; pair(0, 'TEXT'); pair(8, 'TEXT'); pair(10, X(x)); pair(20, f(H - y)); pair(30, 0); pair(40, f(h)); pair(1, txt(s)); if (al) { pair(72, al); pair(11, X(x)); pair(21, f(H - y)); pair(31, 0); } },
  };
  pen.phase = ph => { dimMode = ph === 'dims'; };
  drawSheet(pen, D, data, Object.assign({}, opts, { picked: null }));
}
function dxfFile(E, f, Wall, H) {
  const head = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '9', '$EXTMIN', '10', '0', '20', '0', '9', '$EXTMAX', '10', f(Wall), '20', f(H), '0', 'ENDSEC'];
  const ltype = (name, desc, pat) => ['0', 'LTYPE', '2', name, '70', '0', '3', desc, '72', '65', '73', String(pat.length), '40', f(pat.reduce((s, x) => s + Math.abs(x), 0)), ...pat.flatMap(x => ['49', f(x)])];
  const layer = (name, col, lt) => ['0', 'LAYER', '2', name, '70', '0', '62', String(col), '6', lt];
  const tables = ['0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LTYPE', '70', '4', ...ltype('CONTINUOUS', 'Solid line', []), ...ltype('HIDDEN', 'Hidden __ __ __', [3, -1.5]), ...ltype('CENTER', 'Center ____ _ ____', [12, -3, 2, -3]), ...ltype('DASHED', 'Dashed __ __', [6, -2]), '0', 'ENDTAB',
    '0', 'TABLE', '2', 'LAYER', '70', '6', ...layer('VISIBLE', 7, 'CONTINUOUS'), ...layer('THIN', 7, 'CONTINUOUS'), ...layer('HIDDEN', 8, 'HIDDEN'), ...layer('CENTRE', 1, 'CENTER'), ...layer('DIMENSIONS', 3, 'CONTINUOUS'), ...layer('TEXT', 7, 'CONTINUOUS'), '0', 'ENDTAB', '0', 'ENDSEC'];
  const text = [...head, ...tables, '0', 'SECTION', '2', 'ENTITIES', ...E, '0', 'ENDSEC', '0', 'EOF'].join('\n') + '\n';
  return new TextEncoder().encode(text);
}
