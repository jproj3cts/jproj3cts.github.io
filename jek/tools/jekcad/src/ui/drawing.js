import { hooks } from '../../../jekray/src/core/hooks.js';
import { h } from '../../../jekray/src/ui/dom.js';
import { edgeConnector, placed, turned3 } from '../core/assembly.js';
import { SHEETS, VIEW_DIRS, dimGeom, drawSheet, pdfOfSheet, scaleText, viewPoint } from '../core/drawing.js';
import { partLook } from '../core/doc.js';
import { sketchId } from '../core/sketch.js';
import { kernelAsk } from '../page/kernel.js';
import { app, changed, checkpoint, editGate, emit, on, toast } from './app.js';
import { studioMesh, studioParts } from './assembly.js';
import { V } from './view3d.js';

/* ==========================================================================
   A Drawing tab: a Part Studio's parts, or an Assembly, as views on a sheet with dimensions and a title block. The
   kernel projects each view with its hidden lines taken out (kept here until the model or the views change); the
   sheet is drawn on the view's overlay canvas, and written as a PDF from the same drawing. A dimension holds to
   corners and round edges of the model by the kernel's references, so it follows the model when it changes.
   ========================================================================== */
export const DR = { tool: 'select', data: null, key: '', located: {}, snaps: [], pick: null, pick2: null, hover: null, sel: null, cam: null, drag: null, mouse: null, drawn: null };
const drwTab = id => app.file.tabs.find(t => t.id === id);
const drwViews = D => D.views.map(v => ({ id: v.id, n: VIEW_DIRS[v.dir].n, x: VIEW_DIRS[v.dir].x }));
/* what the drawing is of, as the kernel is asked: each part with its place */
async function drwItems(D) {
  const src = drwTab(D.of);
  if (!src) return [];
  if (src.kind === 'studio') {
    const parts = await studioParts(src);
    if (!parts) return null;
    return parts.filter((p, i) => !partLook(src, p.id, i).hidden && (!D.part || p.id === D.part)).map(p => ({ doc: src, part: p.id, id: p.id, p: [0, 0, 0], q: [0, 0, 0, 1] }));
  }
  const out = [];
  for (const I of src.instances) {
    if (I.hidden) continue;
    const t = drwTab(I.studio);
    if (!t || !(await studioParts(t))) continue;
    out.push({ doc: t, part: I.part, id: I.id, inst: I.id, p: I.p, q: I.q });
  }
  return out;
}
/* the drawing made: its views from the kernel (when what they show has changed), what its dimensions hold to found
   on the model, and the corners and round edges a new dimension can be put on */
export async function drwRegen() {
  const D = app.drw;
  if (!D) return null;
  app.busy = true; emit('busy');
  try {
    const items = await drwItems(D);
    if (!items || app.drw !== D) return null;
    const key = JSON.stringify([items.map(i => [JSON.stringify(i.doc), i.part, i.p, i.q]), D.views.map(v => v.dir + v.id)]);
    if (key !== DR.key) {
      const got = await kernelAsk('drawing', { items, views: drwViews(D) }, 'regen');
      if (!got) return null;
      if (app.drw !== D) return null;
      DR.data = { views: Object.fromEntries(got.map(g => [g.id, g])) }; DR.key = key;
    }
    DR.items = items;
    // the corners and round edges of every part, where the drawing has them
    DR.snaps = [];
    for (const it of items) {
      const M = studioMesh(it.doc.id, it.part);
      if (!M) continue;
      for (let i = 0; i < M.verts.length / 3; i++) DR.snaps.push({ kind: 'vertex', item: it, index: i, w: placed(it, [M.verts[3 * i], M.verts[3 * i + 1], M.verts[3 * i + 2]]) });
      for (let j = 0; j < M.edgeGroups.length / 2; j++) {
        if (!M.edgeKinds || M.edgeKinds[j] !== 'circle') continue;
        const c = edgeConnector(M, j);
        if (!c || !c.round) continue;
        const k = M.edgeGroups[2 * j] * 6, r = Math.hypot(M.seg[k] - c.o[0], M.seg[k + 1] - c.o[1], M.seg[k + 2] - c.o[2]);
        DR.snaps.push({ kind: 'edge', item: it, index: j, w: placed(it, c.o), n: turned3(it, c.z), r });
      }
    }
    // what each dimension holds to
    const reqs = [], slots = [];
    for (const d of D.dims) for (const k of ['a', 'b']) {
      if (!d[k]) continue;
      const it = items.find(x => (d[k].inst ? x.inst === d[k].inst : x.part === d[k].ref.part));
      if (!it) continue;
      reqs.push({ doc: it.doc, part: it.part, p: it.p, q: it.q, ref: d[k].ref }); slots.push([d.id, k]);
    }
    const located = {};
    if (reqs.length) { const got = await kernelAsk('drawLocate', { reqs }); got.forEach((g, i) => { const [id, k] = slots[i]; (located[id] || (located[id] = {}))[k] = g; }); }
    if (app.drw !== D) return null;
    DR.located = located;
    app.result = { features: [], parts: [], frames: {}, vars: {}, errors: [], drw: true };
    app.sel = [];
    app.error = null; app.regenCount++;
    if (!DR.cam) fitSheet();
    emit('model', app.result);
    renderDrw();
    return app.result;
  } catch (err) { app.error = err.message; toast('The drawing could not be made: ' + err.message, true); return null; } finally { app.busy = false; emit('busy'); }
}
/* ---------- the sheet on the screen ---------- */
export function fitSheet() {
  const D = app.drw; if (!D) return;
  const [W, H] = SHEETS[D.sheet], z = Math.min((V.w - 40) / W, (V.h - 70) / H);
  DR.cam = { z: Math.max(0.2, z), x: (V.w - W * z) / 2, y: (V.h - 30 - H * z) / 2 + 4 };
}
const drwScr = p => [DR.cam.x + p[0] * DR.cam.z, DR.cam.y + p[1] * DR.cam.z];
const drwMm = (sx, sy) => [(sx - DR.cam.x) / DR.cam.z, (sy - DR.cam.y) / DR.cam.z];
const drwToday = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const drwSource = D => { const t = drwTab(D.of); return t ? t.name : ''; };
const drwOpts = D => ({ located: DR.located, date: drwToday(), source: drwSource(D), picked: DR.sel });
export function drawDrw(c) {
  const D = app.drw; if (!D) return;
  if (!DR.cam) fitSheet();
  const [W, H] = SHEETS[D.sheet], z = DR.cam.z, X = v => DR.cam.x + v * z, Y = v => DR.cam.y + v * z;
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(X(0) + 4, Y(0) + 4, W * z, H * z);
  c.fillStyle = '#fdfdfb'; c.fillRect(X(0), Y(0), W * z, H * z);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const ink = '#141414', hot = '#d2691e';
  const pen = {
    line(x1, y1, x2, y2, w, dash, on2) { c.beginPath(); c.setLineDash(dash ? dash.map(v => v * z) : []); c.lineWidth = Math.max(0.6, (w || 0.2) * z); c.strokeStyle = on2 ? hot : ink; c.moveTo(X(x1), Y(y1)); c.lineTo(X(x2), Y(y2)); c.stroke(); },
    poly(run, w, dash) { if (run.length < 4) return; c.beginPath(); c.setLineDash(dash ? dash.map(v => v * z) : []); c.lineWidth = Math.max(0.6, (w || 0.2) * z); c.strokeStyle = ink; c.moveTo(X(run[0]), Y(run[1])); for (let i = 2; i + 1 < run.length; i += 2) c.lineTo(X(run[i]), Y(run[i + 1])); c.stroke(); },
    fill(p, on2) { c.beginPath(); c.moveTo(X(p[0]), Y(p[1])); for (let i = 2; i + 1 < p.length; i += 2) c.lineTo(X(p[i]), Y(p[i + 1])); c.closePath(); c.fillStyle = on2 ? hot : ink; c.fill(); },
    text(x, y, str, size, align, bold, on2) { c.font = (bold ? '700 ' : '') + Math.max(5, size * z) + 'px Helvetica, Arial, sans-serif'; c.textAlign = align === 'c' ? 'center' : align === 'r' ? 'right' : 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = on2 ? hot : ink; c.fillText(str, X(x), Y(y)); },
  };
  DR.drawn = drawSheet(pen, D, DR.data, drwOpts(D));
  c.setLineDash([]);
  // the dimension being made: its first point, the point under the pointer, and how it would lie
  const L = DR.drawn.layout, mark = (s, col) => { const v = L.views.find(x => x.id === s.view); if (!v) return; const p = drwScr(L.toSheet(v, viewPoint(v.dir, s.w))); c.beginPath(); if (s.kind === 'edge') c.arc(p[0], p[1], Math.max(3, s.r * L.s * z), 0, 2 * Math.PI); else c.rect(p[0] - 4, p[1] - 4, 8, 8); c.strokeStyle = col; c.lineWidth = 2; c.stroke(); };
  if (DR.tool === 'dim') { if (DR.hover) mark(DR.hover, '#3b82d6'); if (DR.pick) mark(DR.pick, hot); if (DR.pick2) mark(DR.pick2, hot); }
  if (DR.tool === 'dim' && DR.pick && DR.pick2 && DR.mouse) {
    const d = drwPlacing(DR.mouse), g = d && dimGeom(L, d, { a: { pt: DR.pick.w }, b: { pt: DR.pick2.w } });
    if (g) { c.strokeStyle = hot; c.fillStyle = hot; c.lineWidth = 1; for (const l of g.lines) { c.beginPath(); c.moveTo(X(l[0]), Y(l[1])); c.lineTo(X(l[2]), Y(l[3])); c.stroke(); } c.font = Math.max(5, 3 * z) + 'px Helvetica, Arial, sans-serif'; c.textAlign = 'center'; c.fillText(g.text, X(g.at[0]), Y(g.at[1] + 1.1)); }
  }
  c.restore();
}
/* the corner or round edge of a view nearest a screen point */
function drwSnap(sx, sy) {
  const L = DR.drawn && DR.drawn.layout; if (!L) return null;
  let best = null, bd = 10;
  for (const v of L.views) {
    if (!v.box || v.dir === 'iso') continue;
    const n = VIEW_DIRS[v.dir].n;
    for (const s of DR.snaps) {
      const p = drwScr(L.toSheet(v, viewPoint(v.dir, s.w)));
      if (s.kind === 'vertex') { const d = Math.hypot(p[0] - sx, p[1] - sy); if (d < bd) { bd = d; best = Object.assign({ view: v.id }, s); } }
      // a round edge seen end on: by its rim
      else if (Math.abs(Math.abs(s.n[0] * n[0] + s.n[1] * n[1] + s.n[2] * n[2]) - 1) < 1e-6) { const d = Math.abs(Math.hypot(p[0] - sx, p[1] - sy) - s.r * L.s * DR.cam.z); if (d < Math.min(bd, 7)) { bd = d; best = Object.assign({ view: v.id }, s); } }
    }
  }
  return best;
}
/* the dimension two picked corners would make, placed where the pointer is: across if the pointer is above or below
   them, up if it is beside them, along them with Shift */
function drwPlacing(m) {
  const L = DR.drawn.layout, v = L.views.find(x => x.id === DR.pick.view); if (!v) return null;
  const P = L.toSheet(v, viewPoint(v.dir, DR.pick.w)), Q = L.toSheet(v, viewPoint(v.dir, DR.pick2.w)), mid = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2], q = drwMm(m.sx, m.sy);
  const dx = Math.abs(Q[0] - P[0]), dy = Math.abs(Q[1] - P[1]);
  let dir = m.shift ? 'a' : Math.abs(q[1] - mid[1]) >= Math.abs(q[0] - mid[0]) ? 'h' : 'v';
  if (dir === 'h' && dx < 1e-6) dir = 'v'; if (dir === 'v' && dy < 1e-6) dir = 'h';
  let off;
  if (dir === 'h') off = q[1] - mid[1]; else if (dir === 'v') off = q[0] - mid[0];
  else { const len = Math.hypot(Q[0] - P[0], Q[1] - P[1]) || 1, n = [-(Q[1] - P[1]) / len, (Q[0] - P[0]) / len]; off = (q[0] - P[0]) * n[0] + (q[1] - P[1]) * n[1]; }
  return { id: 'new', view: v.id, t: 'lin', dir, off };
}
async function drwRefs(snaps) {
  const got = await kernelAsk('drawLocate', { reqs: snaps.map(s => ({ doc: s.item.doc, part: s.item.part, p: s.item.p, q: s.item.q, pick: { part: s.item.part, kind: s.kind, index: s.index } })) });
  return got.map((g, i) => (g && g.ref ? Object.assign({ ref: g.ref }, snaps[i].item.inst ? { inst: snaps[i].item.inst } : {}) : null));
}
const drwDimAt = (sx, sy) => { const q = drwMm(sx, sy); return ((DR.drawn && DR.drawn.dims) || []).find(d => q[0] >= d.g.hit[0] && q[0] <= d.g.hit[2] && q[1] >= d.g.hit[1] && q[1] <= d.g.hit[3]) || null; };
const drwViewAt = (sx, sy) => { const L = DR.drawn && DR.drawn.layout, q = drwMm(sx, sy); return L ? L.views.find(v => v.box && Math.abs(q[0] - v.at[0]) <= v.w * L.s / 2 + 2 && Math.abs(q[1] - v.at[1]) <= v.h * L.s / 2 + 2) : null; };
/* ---------- the pointer on the sheet ---------- */
export function drwDown(e, sx, sy) {
  const D = app.drw; if (!D || !DR.cam) return;
  if (e.button === 1 || e.button === 2) { DR.drag = { kind: 'pan', x: sx, y: sy }; return; }
  if (DR.tool === 'dim') return;                       // (a dimension is made on the click's release)
  const d = drwDimAt(sx, sy), v = d ? null : drwViewAt(sx, sy);
  DR.sel = d ? d.id : null;
  if (d) DR.drag = { kind: 'dim', id: d.id, x: sx, y: sy, moved: false };
  else if (v) DR.drag = { kind: 'view', id: v.id, x: sx, y: sy, moved: false, at: v.at.slice() };
  emit('view'); renderDrw();
}
export function drwMove(e, sx, sy) {
  const D = app.drw; if (!D || !DR.cam) return;
  DR.mouse = { sx, sy, shift: e.shiftKey };
  const g = DR.drag;
  if (g && g.kind === 'pan') { DR.cam.x += sx - g.x; DR.cam.y += sy - g.y; g.x = sx; g.y = sy; emit('view'); return; }
  if (g && (g.kind === 'dim' || g.kind === 'view')) {
    const dx = (sx - g.x) / DR.cam.z, dy = (sy - g.y) / DR.cam.z;
    if (!g.moved) { if (Math.hypot(sx - g.x, sy - g.y) < 4) return; if (!editGate()) { DR.drag = null; return; } checkpoint(); g.moved = true; }
    if (g.kind === 'view') { const v = D.views.find(x => x.id === g.id); v.at = [g.at[0] + dx, g.at[1] + dy]; }
    else {
      const d = D.dims.find(x => x.id === g.id), geo = DR.drawn.dims.find(x => x.id === g.id);
      if (d && geo) {
        if (d.t === 'dia') { const q = drwMm(sx, sy), C = geo.g.centre; d.ang = Math.atan2(-(q[1] - C[1]), q[0] - C[0]) * 180 / Math.PI; d.off = Math.max(4, Math.hypot(q[0] - C[0], q[1] - C[1]) - geo.g.r); }
        else { const dir = d.t === 'ext' ? (d.axis === 'x' ? 'h' : 'v') : d.dir; if (dir === 'h') d.off += dy; else if (dir === 'v') d.off += dx; else { const P = geo.g.P, Q = geo.g.Q, len = Math.hypot(Q[0] - P[0], Q[1] - P[1]) || 1; d.off += dx * (-(Q[1] - P[1]) / len) + dy * ((Q[0] - P[0]) / len); } g.x = sx; g.y = sy; }
      }
    }
    emit('view'); return;
  }
  if (DR.tool === 'dim') { DR.hover = DR.pick && DR.pick2 ? null : drwSnap(sx, sy); emit('view'); }
}
export async function drwUp(e, sx, sy) {
  const D = app.drw, g = DR.drag; DR.drag = null;
  if (!D) return;
  if (g && g.kind !== 'pan' && g.moved) { changed(); return; }
  if (g) return;
  if (DR.tool !== 'dim' || e.button !== 0) return;
  if (DR.pick && DR.pick2) {
    // the third click places it
    const d = drwPlacing({ sx, sy, shift: e.shiftKey });
    if (!d || !editGate()) return;
    const refs = await drwRefs([DR.pick, DR.pick2]);
    if (!refs[0] || !refs[1]) { toast('Those corners could not be held to', true); DR.pick = DR.pick2 = null; emit('view'); return; }
    checkpoint();
    D.dims.push({ id: sketchId('q'), view: d.view, t: 'lin', dir: d.dir, off: d.off, a: refs[0], b: refs[1] });
    DR.pick = DR.pick2 = null; changed(); return;
  }
  const s = drwSnap(sx, sy);
  if (!s) { if (!DR.pick) toast('Click a corner of a view, then another, then where the dimension goes; or click a circle for its diameter'); return; }
  if (s.kind === 'edge' && !DR.pick) {
    if (!editGate()) return;
    const refs = await drwRefs([s]);
    if (!refs[0]) { toast('That circle could not be held to', true); return; }
    const L = DR.drawn.layout, v = L.views.find(x => x.id === s.view), C = L.toSheet(v, viewPoint(v.dir, s.w)), q = drwMm(sx, sy);
    checkpoint();
    D.dims.push({ id: sketchId('q'), view: s.view, t: 'dia', ang: Math.atan2(-(q[1] - C[1]), q[0] - C[0]) * 180 / Math.PI, off: 8, a: refs[0] });
    changed(); return;
  }
  if (s.kind !== 'vertex') return;
  if (!DR.pick) DR.pick = s;
  else if (s.view !== DR.pick.view) toast('Both corners are in one view');
  else if (Math.hypot(s.w[0] - DR.pick.w[0], s.w[1] - DR.pick.w[1], s.w[2] - DR.pick.w[2]) > 1e-9) DR.pick2 = s;
  emit('view');
}
export function drwWheel(sx, sy, f) { if (!DR.cam) return; const z = Math.max(0.3, Math.min(40, DR.cam.z / f)), q = drwMm(sx, sy); DR.cam.z = z; DR.cam.x = sx - q[0] * z; DR.cam.y = sy - q[1] * z; emit('view'); }
export function drwKey(k) {
  const D = app.drw; if (!D) return false;
  if (k === 'escape') { if (DR.pick || DR.pick2) { DR.pick = DR.pick2 = null; } else if (DR.tool !== 'select') setDrwTool('select'); else DR.sel = null; emit('view'); renderDrw(); return true; }
  if ((k === 'delete' || k === 'backspace') && DR.sel) { deleteDim(DR.sel); return true; }
  if (k === 'd') { setDrwTool('dim'); return true; }
  if (k === 'f') { fitSheet(); emit('view'); return true; }
  return false;
}
export function setDrwTool(t) { DR.tool = t; DR.pick = DR.pick2 = DR.hover = null; for (const b of document.querySelectorAll('#drwBar [data-drw]')) b.classList.toggle('on', b.dataset.drw === t); emit('view'); }
export function deleteDim(id) { const D = app.drw; if (!D || !editGate()) return; checkpoint(); D.dims = D.dims.filter(d => d.id !== id); if (DR.sel === id) DR.sel = null; changed(); }
/* the view's whole size across and up, on the front, top and right views that have none */
export function addOverall() {
  const D = app.drw; if (!D || !editGate()) return;
  checkpoint();
  let n = 0;
  for (const v of D.views) { if (v.dir === 'iso') continue; for (const axis of v.dir === 'front' ? ['x', 'y'] : v.dir === 'top' ? ['y'] : v.dir === 'right' ? ['x'] : []) if (!D.dims.some(d => d.t === 'ext' && d.view === v.id && d.axis === axis)) { D.dims.push({ id: sketchId('q'), view: v.id, t: 'ext', axis, off: axis === 'x' ? 10 : -10 }); n++; } }
  if (!n) { app.history.pop(); toast('The overall sizes are on the sheet already'); return; }
  changed();
}
/* ---------- the drawing's side panel ---------- */
export function renderDrw() {
  const D = app.drw, box = document.getElementById('drwSide');
  if (!D || !box) return;
  const set = (fn, quiet) => { if (!editGate()) { renderDrw(); return; } checkpoint(); fn(); if (!quiet) { DR.key = ''; } changed(); };
  const sel = (id, label, options, value, onPick) => h('div', { class: 'cad-frow' }, h('label', { for: id }, label), h('select', { id, onchange: e => onPick(e.target.value) }, ...options.map(([v, t]) => h('option', Object.assign({ value: v }, String(v) === String(value) ? { selected: '' } : {}), t))));
  const txt = (key, label) => h('div', { class: 'cad-frow' }, h('label', { for: 'drw-' + key }, label), h('input', { type: 'text', id: 'drw-' + key, value: (D.title && D.title[key]) || '', spellcheck: 'false', maxlength: '120', onkeydown: e => e.stopPropagation(), onchange: e => set(() => { D.title = Object.assign({}, D.title); if (e.target.value.trim()) D.title[key] = e.target.value.trim(); else delete D.title[key]; }, true) }));
  const src = drwTab(D.of), sources = app.file.tabs.filter(t => t.kind !== 'drawing').map(t => [t.id, (t.kind === 'assembly' ? 'Assembly: ' : 'Part Studio: ') + t.name]);
  const parts = src && src.kind === 'studio' ? ((DR.partsOf && DR.partsOf.id === src.id ? DR.partsOf.list : []) || []) : [];
  const L = DR.drawn && DR.drawn.layout;
  const rows = [h('h2', { class: 'cad-shead' }, 'This drawing'),
    sel('drw-of', 'Of', sources, D.of, v => set(() => { D.of = v; D.part = null; D.dims = D.dims.filter(d => d.t === 'ext'); })),
    src && src.kind === 'studio' ? sel('drw-part', 'Part', [['', 'All its parts'], ...parts], D.part || '', v => set(() => { D.part = v || null; D.dims = D.dims.filter(d => d.t === 'ext' || !v || d.a.ref.part === v); })) : null,
    sel('drw-sheet', 'Sheet', Object.keys(SHEETS).map(k => [k, k + ' (' + SHEETS[k][0] + ' × ' + SHEETS[k][1] + ' mm)']), D.sheet, v => set(() => { D.sheet = v; for (const x of D.views) delete x.at; DR.cam = null; }, true)),
    sel('drw-scale', 'Scale', [[0, 'To fit' + (L && !D.scale ? ' (' + scaleText(L.s) + ')' : '')], ...[10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02].map(k => [k, scaleText(k)])], D.scale || 0, v => set(() => { D.scale = +v || 0; for (const x of D.views) delete x.at; }, true)),
    h('label', { class: 'cad-check' }, h('input', Object.assign({ type: 'checkbox', id: 'drw-hidden', onchange: e => set(() => { D.hidden = e.target.checked; }, true) }, D.hidden ? { checked: '' } : {})), ' Show hidden lines, dashed'),
    h('h2', { class: 'cad-shead' }, 'Views'),
    h('div', { class: 'cad-drwviews' }, ...Object.keys(VIEW_DIRS).map(k => h('label', { class: 'cad-check' }, h('input', Object.assign({ type: 'checkbox', 'data-view': k, onchange: e => set(() => { if (e.target.checked) D.views.push({ id: sketchId('v'), dir: k }); else { const gone = D.views.filter(v => v.dir === k).map(v => v.id); D.views = D.views.filter(v => v.dir !== k); D.dims = D.dims.filter(d => !gone.includes(d.view)); } for (const x of D.views) delete x.at; }) }, D.views.some(v => v.dir === k) ? { checked: '' } : {})), ' ' + VIEW_DIRS[k].name))),
    h('h2', { class: 'cad-shead' }, 'Title block'), txt('title', 'Title'), txt('by', 'Drawn by'), txt('material', 'Material'), txt('number', 'Drawing no.'), txt('note', 'Note'),
    h('h2', { class: 'cad-shead' }, 'Dimensions (' + D.dims.length + ')'),
    D.dims.length ? h('ul', { class: 'cad-plist', id: 'drwDims' }, ...D.dims.map(d => { const g = DR.drawn && DR.drawn.dims.find(x => x.id === d.id), v = D.views.find(x => x.id === d.view); return h('li', { class: 'cad-irow' + (DR.sel === d.id ? ' picked' : '') + (g ? '' : ' hid'), 'data-dim': d.id, title: g ? 'Click to select; drag it on the sheet to move it' : 'What this held to is no longer on the model', onclick: e => { if (e.target.closest('button')) return; DR.sel = d.id; emit('view'); renderDrw(); } },
      h('span', { class: 'nm' }, (g ? g.g.text + ' mm' : 'lost') + ' · ' + (v ? VIEW_DIRS[v.dir].name : '?') + (d.t === 'ext' ? ', overall' : '')), h('button', { type: 'button', class: 'cad-eye', title: 'Delete this dimension', 'aria-label': 'Delete this dimension', 'data-icon': 'trash', onclick: () => deleteDim(d.id) })); }))
      : h('p', { class: 'cad-empty' }, 'None yet. Click Dimension, then two corners of a view and where it goes, or a circle. Overall sizes adds each view’s width and height.')];
  box.replaceChildren(...rows.filter(Boolean));
  emit('icons', box);
}
/* the sheet as a PDF's bytes and its name (io/files.js makes the file, behind its gate) */
export function drwPdf() { const D = app.drw; return D && DR.data ? { name: D.name, bytes: pdfOfSheet(D, DR.data, drwOpts(D)) } : null; }
export function wireDrawing() {
  hooks.cadDrwRegen = drwRegen;
  hooks.cadSheet = c => drawDrw(c);
  on('tab', () => { DR.cam = null; DR.sel = null; DR.pick = DR.pick2 = null; DR.tool = 'select'; if (app.drw) { DR.key = ''; setDrwTool('select'); } });
  on('model', () => { if (app.drw) { const src = drwTab(app.drw.of); if (src && src.kind === 'studio') studioParts(src).then(ps => { if (!ps) return; const list = ps.map((p, i) => [p.id, partLook(src, p.id, i).name]); if (!DR.partsOf || DR.partsOf.id !== src.id || JSON.stringify(DR.partsOf.list) !== JSON.stringify(list)) { DR.partsOf = { id: src.id, list }; renderDrw(); } }); } });
  const bar = document.getElementById('drwBar');
  if (bar) bar.addEventListener('click', e => { const b = e.target.closest('[data-drw]'); if (!b) return; const k = b.dataset.drw; if (k === 'overall') addOverall(); else if (k === 'fit') { fitSheet(); emit('view'); } else if (k === 'pdf') { if (hooks.cadExportPdf) hooks.cadExportPdf(); } else setDrwTool(k); });
}
