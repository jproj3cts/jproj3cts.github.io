import { BEAM_Z, clamp } from '../core/constants.js';
import { fmtHz, fmtLen } from '../core/format.js';
import { hornGeom } from '../core/rf.js';
import { beamAt, m2Env } from '../core/beams-hom.js';
import { wavelengthColour } from '../core/colour.js';
import { DOVE_RATIO, V, deg, extraSel, project, selectedId, setExtraSel, setSelectedId } from '../state/project.js';
import { FIBRE_COLOUR, getEl, lightOf, selected, srcBody } from '../state/elements.js';
import { benchName, linkPartner, onTab } from '../state/tabs.js';
import { polyVerts, sagFn } from '../core/geometry.js';
import { crystalGeom, elementSurfaces, meshHull } from '../core/stl.js';
import { frame, toLocal, toWorld } from '../core/mask.js';
import { asmCheck, asmMembers, assemblies } from '../core/assembly.js';
import { exporting, lastTrace } from '../engines/trace.js';
import { drawHalf, drawToolOverlay, labelBoxes, partsLocked, textEdit } from './drawings.js';
import { drag } from './pointer.js';
import { FC_W, SPLIT_P, fcH, netPower, pkey, portName, portWorld, portsOf, thruPartner } from '../engines/fibre.js';
import { PIC } from '../engines/pic.js';
import { ELEC } from '../engines/elec.js';
import { V3D } from './view3d.js';
import { ELEC_UI } from './elec.js';
import { PART_UI } from './parts/registry.js';
import { updateReadouts } from './readouts.js';
import { h, renderPanel } from './panel.js';
import { partAssumptions } from './plots.js';
import { popSources } from '../engines/beam-tree.js';
import { closeupOn, setCloseupOn } from '../engines/closeup.js';
import { drawPop } from './heavy.js';
import { drawCloseup } from './closeup.js';
import { changed, drawMeasures, drawMinimap } from './actions.js';
import { checkpoint } from './tabs.js';
import { cssColour } from '../io/layout.js';
import { scheduleSave } from '../io/autosave.js';
import { updateEmpty } from './tours.js';
import { TW, traceLater } from '../page/workers.js';

/* ==========================================================================
   Rendering
   ========================================================================== */

export const canvas = document.getElementById('bench');
export let ctx = canvas.getContext('2d');          // a VecCtx for a moment while the layout is exported
export function setCtx(v) { return (ctx = v); }
export const stage = document.getElementById('stage');
export let W = 0, H = 0, DPR = 1;
export function setW(v) { return (W = v); }
export function setH(v) { return (H = v); }
export function setDPR(v) { return (DPR = v); }

export function resize() {
  const r = stage.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  // the bench grown or narrowed (a side panel opened or closed, the window resized) keeps its
  // left edge where it was: what is under the pointer stays there
  if (W > 0 && r.width > 0 && r.width !== W) { try { const v = V(); if (v && v.scale > 0) v.cx += (r.width - W) / (2 * v.scale); } catch (err) { /* no bench yet */ } }
  W = r.width; H = r.height;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  requestRender();
}
/* the tool is the whole window; the page itself does not scroll */

export const sx = x => W / 2 + (x - V().cx) * V().scale;
export const sy = y => H / 2 - (y - V().cy) * V().scale;
export const wx = px => V().cx + (px - W / 2) / V().scale;
export const wy = py => V().cy - (py - H / 2) / V().scale;

let renderQueued = false;
export function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

/* ---------- The bench's colour ----------
   The bench is the dark anodised breadboard, or a colour of your own (View › Bench colour,
   kept in the project). Parts, beams and fibres are drawn the same on any colour; on a light
   one the words (names, the scale, captions) are drawn dark to be read, and the light is
   drawn stronger, laid on rather than glowing, so beams stand out as they do on the dark.
   Exports (PNG, SVG, PDF) come out the same. */
const BENCH_DEFAULT = '#1f2529';
const BENCH_COLOURS = [['Breadboard', '#1f2529'], ['Black', '#000000'], ['Navy', '#0f1b2d'], ['Paper', '#f7f3ec'], ['White', '#ffffff']];
const hexRgb = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
const benchStyle = () => (project && project.style) || {};
export const benchBg = () => /^#[0-9a-f]{6}$/i.test(benchStyle().bg || '') ? benchStyle().bg.toLowerCase() : BENCH_DEFAULT;
export const benchHoles = () => benchStyle().holes !== false;
export function benchLight(bg = benchBg()) {
  const [r, g, b] = hexRgb(bg).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.25;
}
// while a light bench is drawn
export let lightLayer = false;
// the light laid on (over a light bench) rather than glowing (over the dark), and stronger
export const glowOp = () => lightLayer ? 'source-over' : 'lighter';
export const glowA = a => lightLayer ? Math.min(1, a * 1.6) : a;
// what is selected is picked out in white on the dark bench, and in near-black on a light one
export const selInk = (a = 1) => lightLayer ? (a === 1 ? '#1b2328' : 'rgba(27,35,40,' + a + ')') : (a === 1 ? '#ffffff' : 'rgba(255,255,255,' + a + ')');
// while the bench itself is drawn (not a part's icon in the picker, on the standard dark tile)
let inBench = false;
// a part's dark body, and an open port, take the bench's own colour on any bench colour but the
// standard breadboard, where they keep their own (an open port is the breadboard's colour anyway)
export const bodyFill = c => inBench && benchBg() !== BENCH_DEFAULT ? benchBg() : c;
export const portFill = () => inBench ? benchBg() : '#1b2327';
// mirrors' metal, a darker grey on a light bench so it shows
export const metal = (a = 1) => lightLayer ? 'rgba(98,109,117,' + a + ')' : 'rgba(216,222,227,' + a + ')';
// the words on a light bench: light greys go dark, light colours deeper; a colour stays its hue
const inkMemo = new Map();
function textInk(style) {
  if (typeof style !== 'string') return style;
  if (inkMemo.has(style)) return inkMemo.get(style);
  const c = cssColour(style), hi = Math.max(c.r, c.g, c.b), lo = Math.min(c.r, c.g, c.b);
  let out = style;
  if (hi - lo < 48 && hi > 120) out = 'rgba(' + [255 - c.r, 255 - c.g, 255 - c.b].map(v => Math.round(v * 0.85)).join(',') + ',' + Math.min(1, c.a * 1.25) + ')';
  else if (hi > 150) out = 'rgba(' + [c.r, c.g, c.b].map(v => Math.round(v * 0.58)).join(',') + ',' + Math.min(1, c.a * 1.2) + ')';
  inkMemo.set(style, out);
  return out;
}
function inkedText(t, x, y, w) {
  const keep = this.fillStyle;
  this.fillStyle = textInk(keep);
  const proto = Object.getPrototypeOf(this);
  if (w === undefined) proto.fillText.call(this, t, x, y); else proto.fillText.call(this, t, x, y, w);
  this.fillStyle = keep;
}
// the View menu's colours and holes, and the bench's own background, as the project has them
export function benchStyleShown() {
  const menu = document.getElementById('benchColourMenu');
  if (!menu) return;
  const bg = benchBg(), known = BENCH_COLOURS.some(([, c]) => c === bg);
  const pick = (c, e) => {
    if (e) e.stopPropagation();
    project.style = Object.assign({}, project.style, { bg: c });
    if (c === BENCH_DEFAULT) delete project.style.bg;
    benchStyleShown(); scheduleSave(); requestRender();
  };
  const custom = h('input', { type: 'color', value: bg, 'aria-label': 'A colour of your own', class: 'rt-swatchpick' });
  custom.addEventListener('input', () => { project.style = Object.assign({}, project.style, { bg: custom.value.toLowerCase() }); requestRender(); stage.style.background = custom.value; });
  custom.addEventListener('change', () => pick(custom.value.toLowerCase()));
  menu.replaceChildren(...BENCH_COLOURS.map(([name, c]) => h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': c === bg ? 'true' : 'false', onclick: e => pick(c, e) },
      h('span', { class: 'rt-swatch', style: 'background:' + c }), name, c === bg ? h('span', { class: 'k' }, '✓') : null)),
    h('label', { class: 'rt-swatchrow', role: 'menuitemradio', 'aria-checked': known ? 'false' : 'true' },
      h('span', { class: 'rt-swatch', style: 'background:' + bg }), 'Your own…', custom, known ? null : h('span', { class: 'k' }, '✓')),
    h('span', { class: 'rt-menunote' }, 'Kept with the bench, and used for exported pictures. Parts, beams and fibres are drawn the same on any colour; on a light one, the words are drawn dark.'));
  document.getElementById('btnHoles').setAttribute('aria-checked', benchHoles() ? 'true' : 'false');
  stage.style.background = bg;
}
function drawBench() {
  const light = benchLight();
  ctx.fillStyle = benchBg();
  ctx.fillRect(0, 0, W, H);
  if (!benchHoles()) return;
  // 25 mm hole grid, like an M6 breadboard; finer grid when zoomed in
  const pitch = 25;
  const x0 = Math.floor(wx(0) / pitch) * pitch, x1 = wx(W);
  const y0 = Math.floor(wy(H) / pitch) * pitch, y1 = wy(0);
  const px = pitch * V().scale;
  if (px > 6) {
    if (px > 90) {
      ctx.strokeStyle = light ? 'rgba(0,0,0,0.045)' : 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 1;
      const sub = px > 400 ? niceStep(40 / V().scale) : 5;
      ctx.beginPath();
      for (let x = Math.floor(wx(0) / sub) * sub; x <= x1; x += sub) { const X = Math.round(sx(x)) + 0.5; ctx.moveTo(X, 0); ctx.lineTo(X, H); }
      for (let y = Math.floor(wy(H) / sub) * sub; y <= y1; y += sub) { const Y = Math.round(sy(y)) + 0.5; ctx.moveTo(0, Y); ctx.lineTo(W, Y); }
      ctx.stroke();
    }
    ctx.fillStyle = benchBg() === BENCH_DEFAULT ? getCss('--rt-hole') : light ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.11)';
    const r = Math.min(5, Math.max(1, 3 * V().scale));
    for (let x = x0; x <= x1; x += pitch) {
      for (let y = y0; y <= y1; y += pitch) {
        ctx.beginPath(); ctx.arc(sx(x), sy(y), r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

/* Clipping to a margin round the view, so nothing drawn has coordinates of millions of
   pixels, where the canvas loses its sub-pixel precision */
const CLIP_M = 64;
function clipSeg(x1, y1, x2, y2) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const edges = [[-dx, x1 + CLIP_M], [dx, W + CLIP_M - x1], [-dy, y1 + CLIP_M], [dy, H + CLIP_M - y1]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}
function clipPoly(P) {                    // Sutherland-Hodgman against the same margin
  const planes = [[p => p[0] >= -CLIP_M, (a, b) => (-CLIP_M - a[0]) / (b[0] - a[0])], [p => p[0] <= W + CLIP_M, (a, b) => (W + CLIP_M - a[0]) / (b[0] - a[0])],
    [p => p[1] >= -CLIP_M, (a, b) => (-CLIP_M - a[1]) / (b[1] - a[1])], [p => p[1] <= H + CLIP_M, (a, b) => (H + CLIP_M - a[1]) / (b[1] - a[1])]];
  let out = P;
  for (const [inside, cut] of planes) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i], b = inp[(i + 1) % inp.length], ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) { const t = cut(a, b); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
    if (!out.length) break;
  }
  return out;
}
/* a made-to-order lens's flange, side on: a ring from the rim at a out by its width, thick along
   the axis about x0, with its bolt circle marked */
export function drawMount(f, x0, a, m, sel) {
  if (!m || m.kind !== 'flange') return;
  const t = m.thick / 2, ink = lightLayer ? '143,143,136' : '242,242,236';
  for (const s of [1, -1]) {
    pathLocal(f, [[x0 - t, s * a], [x0 + t, s * a], [x0 + t, s * (a + m.width)], [x0 - t, s * (a + m.width)]], true);
    ctx.fillStyle = 'rgba(' + ink + ',0.32)'; ctx.fill();
    ctx.strokeStyle = sel ? selInk() : 'rgb(' + ink + ')'; ctx.lineWidth = sel ? 2 : 1.2; ctx.stroke();
    if (m.holes) {
      const yc = s * (a + m.width / 2), hr = m.hole / 2;
      pathLocal(f, [[x0 - t, yc - hr], [x0 + t, yc - hr], [x0 + t, yc + hr], [x0 - t, yc + hr]], true);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    }
  }
}
export function pathLocal(f, pts, close) {
  ctx.beginPath();
  const S = pts.map(p => { const [x, y] = toWorld(f, p[0], p[1]); return [sx(x), sy(y)]; });
  if (close) {
    const C = clipPoly(S);
    C.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    if (C.length) ctx.closePath();
    return;
  }
  let open = false;
  for (let i = 1; i < S.length; i++) {
    const c = clipSeg(S[i - 1][0], S[i - 1][1], S[i][0], S[i][1]);
    if (!c) { open = false; continue; }
    if (!open) ctx.moveTo(c[0], c[1]);
    ctx.lineTo(c[2], c[3]);
    open = c[2] === S[i][0] && c[3] === S[i][1];
  }
}
export function surfPoints(s, n = 48, reverse = false, f = null) {
  const ys = [];
  for (let i = 0; i <= n; i++) ys.push(s.semi * (2 * i / n - 1));
  if (f && V().scale > 400) {
    // the stretch of the surface inside the view, sampled finely
    const vs = [[0, 0], [W, 0], [0, H], [W, H]].map(([X, Y]) => toLocal(f, wx(X), wy(Y))[1]);
    const lo = Math.max(-s.semi, Math.min(...vs)), hi = Math.min(s.semi, Math.max(...vs));
    if (hi > lo) for (let i = 0; i <= 200; i++) ys.push(lo + (hi - lo) * i / 200);
    ys.sort((a, b) => a - b);
  }
  // a zoned face: a point either side of each step, so its walls are drawn sheer
  if (s.zone) { for (const r of s.zone.steps) for (const sg of [1, -1]) ys.push(sg * (r - 1e-6), sg * (r + 1e-6)); ys.sort((a, b) => a - b); }
  if (reverse) ys.reverse();
  return ys.map(y => [s.z + sagFn(s, y), y]);
}

/* a feed horn from above: its flare from the waveguide to the aperture (on the part's place, facing
   the way it sends or takes light), in the RF palette's amber, and the aperture in the beam's colour */
/* A horn's shape in its own frame (x along its beam, the aperture at 0, the rest behind). The
   flare is the cone whose slant length L runs from the apex to the aperture's rim, so its
   half-angle is asin(a / L); it narrows to the waveguide, sized for the one mode at its
   frequency (a circular guide's TE11 cuts off at 3.41 r and TM01 at 2.61 r, so r = 0.36 lambda
   carries TE11 alone; a diagonal horn's square guide the same), then two wavelengths of guide
   and a flange. A corrugated horn's wall is grooved a quarter-wave deep, three grooves to the
   wavelength. A diagonal horn is square across (a its half-side). The upper half's outline,
   and a corrugated horn's grooved inner wall from the aperture back to the throat. */
export function hornShape(el) {
  const { kind } = el.mmw, { a, lam, tanA, rg, Lf, xb, rFl, back } = hornGeom(el);
  const corr = kind === 'corrugated', D = corr ? lam / 4 : 0, wall = corr ? Math.max(0.04 * a, 0.3) : 0, rAt = x => a + x * tanA;
  const upper = [[0, a + D + wall], [-Lf, rg + D + wall], ...(corr ? [[-Lf, rg]] : []), [xb, rg], [xb, Math.max(rFl, rg + D + wall)], [back, Math.max(rFl, rg + D + wall)]];
  let grooves = null;
  if (corr) {
    const p = Math.max(lam / 3, Lf / 120);
    grooves = [[0, a]];
    for (let x = 0; x - p > -Lf + 1e-9; x -= p) {
      const m = x - p / 2, e = x - p;
      grooves.push([m, rAt(m)], [m, rAt(m) + D], [e, rAt(e) + D], [e, rAt(e)]);
    }
    grooves.push([-Lf, rg]);
  }
  return { a, lam, Lf, rg, xb, rFl, back, corr, D, wall, square: kind === 'diagonal', upper, grooves,
    outline: [...upper, ...upper.slice().reverse().map(([x, y]) => [x, -y])] };
}
export function drawHorn(el, sel) {
  const f = frame(el), H = hornShape(el), s = V().scale;
  pathLocal(f, H.outline, true);
  ctx.fillStyle = bodyFill('#4a3a1c'); ctx.fill();
  ctx.strokeStyle = sel ? selInk() : '#ffb347'; ctx.lineWidth = sel ? 2.2 : 1.5; ctx.stroke();
  // the bore: the flare's inner wall, grooved in a corrugated horn (when the grooves can be seen)
  const bore = H.grooves && H.lam / 3 * s >= 3 ? H.grooves : [[0, H.a], [-H.Lf, H.rg]];
  for (const sg of [1, -1]) { pathLocal(f, bore.map(([x, y]) => [x, sg * y])); ctx.strokeStyle = sel ? selInk() : 'rgba(255,179,71,0.75)'; ctx.lineWidth = 1; ctx.stroke(); }
  pathLocal(f, [[0, -H.a], [0, H.a]]);
  ctx.strokeStyle = el.type === 'source' ? el.colour : '#7ee0a1'; ctx.lineWidth = 3; ctx.stroke();
}

/* The surfaces a beam segment runs between, so it is drawn cut along them, not square across
   its axis: at a 45° mirror the beam in ends on the mirror and the beam out starts on it, each
   edge where it meets the surface. Each plane is its point on the axis and its normal, turned so
   the segment lies on its positive side. The normal at a surface comes from what it did to the
   axis: a reflection's along the change in direction, a refraction's from Snell's law (n1 d1 -
   n2 d2 lies along it); where the axis went straight on, from the part's own facing. The end's
   is the next segment's start, or the part the beam ends on. Null where there is none. */
// each segment's first child (the segment that leaves its end), by index
function segKids(B) {
  if (segKids.B === B) return segKids.m;
  const m = new Map();
  B.forEach((c, j) => { if (c.parent >= 0 && c.ev && c.ev.dIn && !m.has(c.parent)) m.set(c.parent, j); });
  segKids.B = B; segKids.m = m;
  return m;
}
export function segPlanes(B, i) {
  const b = B[i], len = b.len3 || b.len, d3 = b.d3 || [b.dx, b.dy, b.uz || 0], dl = Math.hypot(...d3), dir = d3.map(v => v / dl);
  const plane = (ev, hx, hy, hz, sgn, el) => {
    let n = [0, 0, 0];
    if (ev && ev.dIn && ev.dOut) {
      const a = ev.din3 || [...ev.dIn, 0], c = ev.dout3 || [...ev.dOut, 0], n1 = ev.n1 || 1, n2 = ev.n2 || 1;
      n = ev.mode === 'R' ? [0, 1, 2].map(k => c[k] - a[k]) : [0, 1, 2].map(k => n1 * a[k] - n2 * c[k]);
    }
    // straight on through a surface with the same index either side (a cube's diagonal): the surface's own normal
    if (Math.hypot(...n) < 1e-6 && ev && ev.sn) n = ev.sn.slice();
    if (Math.hypot(...n) < 1e-6 && el && !['source', 'fcomp', 'elec', 'pic', 'draw', 'fibre'].includes(el.type)) n = [Math.cos(el.angle * deg), Math.sin(el.angle * deg), 0];
    const m = Math.hypot(...n);
    if (m < 1e-6) return null;
    n = n.map(v => v / m);
    const c = n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2];
    if (Math.abs(c) < 0.05) return null;                      // grazing: left square
    n = n.map(v => v * Math.sign(c) * sgn);
    const h2 = Math.hypot(n[0], n[1]);
    return { x: hx, y: hy, z: hz, n3: n, nx: h2 > 1e-6 ? n[0] / h2 : 0, ny: h2 > 1e-6 ? n[1] / h2 : 0, flat: h2 > 0.05, tan: Math.sqrt(Math.max(0, 1 - c * c)) / Math.abs(c) };
  };
  const z0 = b.z0 !== undefined ? b.z0 : BEAM_Z;
  const ev0 = b.ev && b.ev.dIn ? b.ev : null;
  const p0 = ev0 ? plane(ev0, b.x0, b.y0, ev0.hz !== undefined ? ev0.hz : z0, 1, getEl(ev0.el)) : null;
  const k = segKids(B).get(i), ev1 = k !== undefined ? B[k].ev : null, end = getEl(b.endEl);
  const p1 = (ev1 || end) ? plane(ev1, b.x0 + b.dx * b.len, b.y0 + b.dy * b.len, ev1 && ev1.hz !== undefined ? ev1.hz : z0 + dir[2] * len, -1, ev1 ? getEl(ev1.el) : end) : null;
  return { p0, p1, len };
}
// the canvas clipped to between a segment's planes (screen coordinates); W the widest it is drawn, mm
export function clipSegPlanes(P, W, c = ctx, sq = false) {
  const big = 4 * W + 50;
  for (const q of [P.p0, P.p1]) {
    if (!q || !q.flat) continue;                              // a plane lying flat (a periscope's mirror) cuts nothing seen from above
    // a plane square to the segment cuts where its end is anyway: a clip there only leaves a seam with the next
    if (q.tan < 1e-9 && sq) continue;
    const tx = -q.ny, ty = q.nx;
    c.beginPath();
    c.moveTo(sx(q.x + tx * big), sy(q.y + ty * big)); c.lineTo(sx(q.x - tx * big), sy(q.y - ty * big));
    c.lineTo(sx(q.x - tx * big + q.nx * big), sy(q.y - ty * big + q.ny * big)); c.lineTo(sx(q.x + tx * big + q.nx * big), sy(q.y + ty * big + q.ny * big));
    c.closePath(); c.clip();
  }
}
function drawBeams(fieldShown) {
  const B = lastTrace.beams;
  if (!B || !B.length || !lightOf().envelope) return;
  ctx.save();
  // a cavity's round trips land on one another: each envelope once, to the pixel
  const done = new Set(), m2 = new Map(), idx = new Map(B.map((b, i) => [b, i]));
  for (const seg of B) {
    if (seg.fan || seg.pol || seg.bench !== project.tab) continue;       // a ray fan's pilot is not a beam; one envelope per beam
    if (closeupOn && fieldShown && fieldShown.has(seg.src)) continue;   // meaningless at this scale
    const outline = fieldShown && fieldShown.has(seg.src);   // the field is drawn: just mark 1/e²
    if (!m2.has(seg.src)) m2.set(seg.src, m2Env(getEl(seg.src)));
    const M2 = m2.get(seg.src);
    const bA = beamAt(seg.qr, seg.qi, seg.n, seg.nm, M2), bB = beamAt(seg.qr + seg.len, seg.qi, seg.n, seg.nm, M2);
    if (bA && bB) {
      const k = [sx(seg.x0), sy(seg.y0), sx(seg.x0 + seg.dx * seg.len), sy(seg.y0 + seg.dy * seg.len), bA.w * V().scale, bB.w * V().scale].map(Math.round).join(',') + seg.colour + outline;
      if (done.has(k)) continue;
      done.add(k);
    }
    const nxp = -seg.dy, nyp = seg.dx;
    const steps = Math.max(12, Math.min(96, Math.round(seg.len * V().scale / 6)));
    const up = [], dn = [], upIn = [], dnIn = [];
    // past each end as far as its surface runs across the beam, then cut along the surface
    const PL = segPlanes(B, idx.get(seg)), wMax = Math.max(bA ? bA.w : 0, bB ? bB.w : 0, seg.hole || 0) * 1.6;
    const e0 = PL.p0 ? Math.min(5, PL.p0.tan) * wMax : 0, e1 = PL.p1 ? Math.min(5, PL.p1.tan) * wMax : 0;
    for (let i = -1; i <= steps + 1; i++) {
      const t = i < 0 ? -e0 : i > steps ? seg.len + e1 : seg.len * i / steps;
      if ((i < 0 && !e0) || (i > steps && !e1)) continue;
      const b = beamAt(seg.qr + t, seg.qi, seg.n, seg.nm, M2);
      if (!b) continue;
      const x = seg.x0 + seg.dx * t, y = seg.y0 + seg.dy * t;
      // light that went round an element's rim (a beam wider than the lens): it has a hole in its
      // middle as wide as the element, so it is drawn either side of it, out past the rim
      const inner = seg.hole > 0 ? seg.hole : 0, outer = inner ? Math.max(b.w, inner + 0.5 * b.w) : b.w;
      up.push([sx(x + nxp * outer), sy(y + nyp * outer)]);
      dn.push([sx(x - nxp * outer), sy(y - nyp * outer)]);
      if (inner) { upIn.push([sx(x + nxp * inner), sy(y + nyp * inner)]); dnIn.push([sx(x - nxp * inner), sy(y - nyp * inner)]); }
    }
    if (up.length < 2) continue;
    if (outline) {
      // a dashed outline only helps where the beam is wide enough to see inside it
      let wide = 0;
      for (let i = 0; i < up.length; i++) wide = Math.max(wide, Math.hypot(up[i][0] - dn[i][0], up[i][1] - dn[i][1]));
      if (wide < 10) continue;
    }
    // the envelope carries the beam's power: its fill in proportion to the share of the source's power the beam
    // has (so power moving between the two arms of a polarising split is seen moving), its edges as the amplitude,
    // with a floor so a weak beam (a ghost, a share that went round a rim) still shows as an outline
    const faint = clamp(Math.sqrt(seg.w === undefined ? 1 : seg.w), 0.15, 1);
    ctx.save(); clipSegPlanes(PL, seg.len + wMax * 6);
    ctx.beginPath();
    if (upIn.length === up.length) {
      // two bands, either side of the hole
      for (const [A, B2] of [[up, upIn], [dn, dnIn]]) {
        A.forEach(([X, Y], i) => i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y));
        for (let i = B2.length - 1; i >= 0; i--) ctx.lineTo(B2[i][0], B2[i][1]);
        ctx.closePath();
      }
    } else {
      up.forEach(([X, Y], i) => i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y));
      for (let i = dn.length - 1; i >= 0; i--) ctx.lineTo(dn[i][0], dn[i][1]);
      ctx.closePath();
    }
    ctx.fillStyle = seg.colour;
    ctx.globalAlpha = outline ? 0 : glowA(0.16 * faint * faint);
    ctx.fill();
    // stroke the two edges only: closing the path would draw a bar at every surface
    ctx.globalAlpha = glowA((outline ? 0.35 * Math.min(1, seg.w || 1) : 0.55) * faint);
    ctx.setLineDash(outline ? [3, 4] : []);
    ctx.strokeStyle = seg.colour;
    ctx.lineWidth = 1;
    for (const side of [up, dn]) {
      ctx.beginPath();
      side.forEach(([X, Y], i) => i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y));
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

/* Many rays (a big bench) are drawn once into a layer of their own, kept while neither the
   rays nor the view change: dragging an element redraws the bench, not a few hundred
   thousand ray segments each time the pointer moves */
const RAY_LAYER_MIN = 2000;
const rayLayer = { cv: null, key: null, rays: null, frame: null, view: null, settled: false, timer: null, done: 0 };
const RAY_CHUNK = 30000;              // segments drawn into the layer per frame: a big bench fills in over a few frames
function drawRays(stale) {
  const rays = stale && TW.rays ? TW.rays : lastTrace.rays;
  if (rays.length < RAY_LAYER_MIN || exporting || typeof document.createElement !== 'function') { drawRaysOn(ctx, rays); return; }
  const frameKey = [W, H, DPR, project.tab, lightLayer].join('|'), key = [V().cx, V().cy, V().scale, frameKey].join('|');
  // while the view is moving (a pan or a zoom), the layer drawn a moment ago is moved and
  // scaled to match, and drawn afresh once the view has settled
  if (rayLayer.rays === rays && rayLayer.frame === frameKey && rayLayer.key !== key && !rayLayer.settled) {
    const v0 = rayLayer.view, k = V().scale / v0.scale;
    ctx.save();
    ctx.globalCompositeOperation = glowOp();
    ctx.setTransform(DPR * k, 0, 0, DPR * k, DPR * (W / 2 * (1 - k) + (v0.cx - V().cx) * V().scale), DPR * (H / 2 * (1 - k) - (v0.cy - V().cy) * V().scale));
    ctx.drawImage(rayLayer.cv, 0, 0, rayLayer.cv.width / (DPR * rayLayer.ss), rayLayer.cv.height / (DPR * rayLayer.ss));
    ctx.restore();
    clearTimeout(rayLayer.timer);
    rayLayer.timer = setTimeout(() => { rayLayer.settled = true; requestRender(); }, 200);
    return;
  }
  if (rayLayer.rays !== rays || rayLayer.key !== key) {
    const cv = rayLayer.cv || (rayLayer.cv = document.createElement('canvas'));
    // the rays are drawn at twice the resolution and scaled down (on all but the largest
    // screens), so where a fan's lines converge to under a pixel apart the beats between
    // lines and pixels (moiré) average out
    const ss = rayLayer.ss = canvas.width * canvas.height <= 4.5e6 ? 2 : 1;
    if (cv.width !== canvas.width * ss || cv.height !== canvas.height * ss) { cv.width = canvas.width * ss; cv.height = canvas.height * ss; }
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    rayLayer.rays = rays; rayLayer.key = key; rayLayer.frame = frameKey; rayLayer.view = { cx: V().cx, cy: V().cy, scale: V().scale };
    rayLayer.settled = false; rayLayer.done = 0;
  }
  if (rayLayer.done < rays.length) {
    let j = rayLayer.done, n = 0;
    while (j < rays.length && n < RAY_CHUNK) { if (rays[j].bench === project.tab) n += rays[j].pts.length >> 1; j++; }
    const c = rayLayer.cv.getContext('2d'), k = DPR * (rayLayer.ss || 1);
    c.setTransform(k, 0, 0, k, 0, 0);
    drawRaysOn(c, j - rayLayer.done === rays.length ? rays : rays.slice(rayLayer.done, j));
    rayLayer.done = j;
    if (j < rays.length) requestRender();
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = glowOp();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(rayLayer.cv, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}
function drawRaysOn(ctx, rays) {
  ctx.save();
  ctx.globalCompositeOperation = glowOp();
  // brightness follows each branch's power; one path per colour and brightness keeps it fast
  const groups = new Map();
  let segs = 0;
  for (const r of rays) if (r.bench === project.tab) segs += r.pts.length >> 1;
  const dens = rayDensity(segs), tops = rayTops(rays, project.tab);
  ctx.lineWidth = dens < 1 ? 1.4 : 1.2;                 // a dense fan: lines wide enough to run together into a fill (drawn at twice the resolution, see drawRays)
  for (const r of rays) {
    if (r.bench !== project.tab) continue;
    const alpha = rayAlpha(r.w / (tops.get(r.src) || 1)) * dens, lvl = Math.max(1, Math.round(alpha * 12));   // a few steps: lines in one step are one stroke, and do not pile up where they cross
    const key = r.colour + '|' + lvl;
    if (!groups.has(key)) groups.set(key, { colour: r.colour, alpha: lvl / 12, rays: [] });
    groups.get(key).rays.push(r);
  }
  // the view's transform written out, and a segment wholly inside the clip margin drawn as it
  // is, joined to the one before where they meet: only those crossing the margin are clipped
  const v = V(), k = v.scale, ox = W / 2 - v.cx * k, oy = H / 2 + v.cy * k;
  const lo = -CLIP_M, hiX = W + CLIP_M, hiY = H + CLIP_M;
  for (const g of groups.values()) {
    ctx.globalAlpha = glowA(g.alpha);
    ctx.strokeStyle = g.colour;
    ctx.beginPath();
    for (const r of g.rays) {
      const p = r.pts;
      let x0 = ox + p[0] * k, y0 = oy - p[1] * k, pen = false;
      for (let i = 2; i < p.length; i += 2) {
        const x1 = ox + p[i] * k, y1 = oy - p[i + 1] * k;
        if (x0 >= lo && x0 <= hiX && y0 >= lo && y0 <= hiY && x1 >= lo && x1 <= hiX && y1 >= lo && y1 <= hiY) {
          if (!pen) ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1); pen = true;
        } else {
          pen = false;
          if (!((x0 < lo && x1 < lo) || (x0 > hiX && x1 > hiX) || (y0 < lo && y1 < lo) || (y0 > hiY && y1 > hiY))) {
            const c = clipSeg(x0, y0, x1, y1);
            if (c) { ctx.moveTo(c[0], c[1]); ctx.lineTo(c[2], c[3]); }
          }
        }
        x0 = x1; y0 = y1;
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* A ray's brightness from the power it carries, as the power to the 0.4: the two arms of a 50/50 split are each
   plainly dimmer than the beam that fed them and power moving between the arms of a polarising split is seen
   moving (on a log scale a beam kept nearly its full brightness down to a tenth of the power, then went out
   within a few degrees of a waveplate), while a 4% Fresnel ghost still shows at about a third of the
   brightness and a beam 40 dB down is a trace. w: its power as a fraction */
export function rayAlpha(w) { return 0.8 * Math.min(1, Math.max(0.06, Math.pow(Math.max(w, 1e-9), 0.4))); }
/* the strongest ray of each source on a tab, by source id: a ray's brightness is against its own
   launch, so a fibre tip fed through a lossy network is as bright as a laser, and a return beam
   or a window's reflection is fainter than the beam it came off (a kept ray is never drawn at
   no brightness at all: the faintest level is one step) */
export function rayTops(rays, tab) {
  const tops = new Map();
  for (const r of rays) if (r.bench === tab && r.w > (tops.get(r.src) || 0)) tops.set(r.src, r.w);
  return tops;
}
/* and all of them thinned where there are many (a dense fan, a cavity's hundreds of passes),
   so the glow adds up to a beam rather than a block */
export const rayDensity = segs => Math.min(1, Math.max(0.08, Math.sqrt(600 / Math.max(1, segs))));

/* A part's outline in its own frame (mm): the body a label sits under and the view fits around.
   Line-like parts are the line across the beam; bodies their rectangle or polygon. */
export function bodyOutline(el) {
  const r = halfSize(el);
  const rect = (x0, x1, b) => [[x0, -b], [x1, -b], [x1, b], [x0, b]];
  if (el.type === 'source') { if (el.mmw && !el.mmw.part) return rect(hornShape(el).back, 0, r); const { L, hw } = srcBody(el); return rect(-L, 0, hw); }
  if (el.type === 'cube' || el.type === 'prism') return polyVerts(el);
  if (el.type === 'lens') { const ss = elementSurfaces(el); return rect(Math.min(...ss.map(s => s.xmin)), Math.max(...ss.map(s => s.xmax)), r); }
  if (el.type === 'crystal') return crystalGeom(el).outline;
  if (el.type === 'stl') return meshHull(el);
  if (el.type === 'cell') return rect(-el.cellLen / 2, el.cellLen / 2, r);
  if (el.type === 'nlc') return rect(-el.nlLen / 2, el.nlLen / 2, r);
  if (el.type === 'fcomp') return rect(-FC_W / 2, FC_W / 2, r);
  if (el.type === 'elec' || el.type === 'pic') return rect(-7, 7, r);
  if (el.type === 'detector') { const o = []; for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + Math.PI * i / 8; o.push([r * Math.cos(a), r * Math.sin(a)]); } return o; }
  if (el.type === 'chopper') return rect(-2.5, 2.5, r);
  return [[0, -r], [0, r]];
}
/* that outline's bounding box on the bench (world mm) */
export function worldBox(el) {
  const f = frame(el);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [u, v] of bodyOutline(el)) { const [x, y] = toWorld(f, u, v); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, x1, y0, y1 };
}

export function halfSize(el) {
  if (el.type === 'draw') return drawHalf(el);
  if (el.type === 'fcomp') return fcH(el) / 2 + 1;
  if (el.type === 'pic') return PIC.halfSize(el);                                             // PIC hook
  if (el.type === 'elec') return ELEC.halfSize(el);                                           // ELEC hook
  if (el.type === 'chopper') return el.length / 2 + 5;                                        // ELEC hook
  if (el.type === 'stl') return Math.max(1, ...meshHull(el).map(p => Math.hypot(p[0], p[1])));
  if (el.type === 'lens') return el.diameter / 2;
  if (el.type === 'source') return srcBody(el).hw;
  if (el.type === 'stop') return el.outer / 2;
  if (el.type === 'waveplate' || el.type === 'polariser') return el.length / 2;
  if (el.type === 'cube') return el.size / Math.SQRT2;
  if (el.type === 'prism') return el.shape === 'window' ? Math.hypot(el.size, el.thickness) / 2 : el.shape === 'dove' ? el.size * DOVE_RATIO / 2 : el.size * 0.72;
  if (el.type === 'crystal') { const o = crystalGeom(el).outline; return Math.max(...o.map(v => Math.hypot(v[0], v[1]))); }
  if (el.type === 'detector') return Math.max(el.length / 2 + 1.5, 4);
  if (el.type === 'fibre') return Math.max(el.length / 2, 3);
  if (el.type === 'cell') return el.length / 2 + 3;          // its label goes under the tube
  if (el.type === 'nlc') return Math.max(el.length / 2, 1) + 2;
  return el.length / 2;
}
function elementExtentPx(el) {
  const s = V().scale;
  if (el.type === 'source') return Math.max(30, srcBody(el).hw * s + 14);
  return Math.max(34, halfSize(el) * s + 20);
}
export function handlePos(el) {
  const r = elementExtentPx(el);
  const a = el.angle * deg;
  return [sx(el.x) + Math.cos(a) * r, sy(el.y) - Math.sin(a) * r];
}

/* parts' names, in mm on the bench: set once, from how they looked at the zoom the bench was first
   drawn at (11 px), and kept with it; View > Larger or Smaller names changes it */
function labelMm() {
  if (!(project.labelMm > 0)) project.labelMm = +(11 / V().scale).toPrecision(3);
  return project.labelMm;
}
export function labelSize(f) {
  project.labelMm = +(labelMm() * f).toPrecision(3);
  scheduleSave(); requestRender();
}
/* a ringed red ! on a part whose import made assumptions (see partAssumptions); not in exports */
function drawAssumed(els) {
  if (exporting) return;
  for (const el of els) {
    if (el.type !== 'lens' && el.type !== 'mirror' && el.type !== 'prism' && el.type !== 'cube' && !el.assumed) continue;
    if (!partAssumptions(el).length) continue;
    const r = Math.max(4, halfSize(el)), X = sx(el.x) + Math.min(r * V().scale * 0.75, 60) + 6, Y = sy(el.y) - Math.min(r * V().scale * 0.75, 60) - 6;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(X, Y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#d7263d'; ctx.stroke();
    ctx.fillStyle = '#d7263d'; ctx.font = '700 12px ' + getCss('--jek-sans'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', X, Y + 0.5);
    ctx.restore();
  }
}
function drawLabels() {
  const sans = getCss('--jek-sans');
  ctx.textAlign = 'center';
  labelBoxes.clear();
  const taken = portLabelBoxes.splice(0);
  for (const el of project.elements) {
    if (!onTab(el) || el.type === 'draw') continue;                   // a drawing has no label
    if (el.type === 'elec' && el.kind === 'node' && !(el.id === selectedId || extraSel.has(el.id))) continue;   // ELEC hook: a node's name only when selected
    // its size on the bench, in mm, as everything drawn there: a figure looks the same at any
    // zoom; on the screen, kept readable (never tiny, never a banner) while the view is worked in
    const k = el.label ? el.label.s : 1;
    let fs = labelMm() * V().scale * k;
    if (!exporting) fs = Math.min(26, Math.max(8, fs));
    const u = fs / 11;
    // below the part's body, whichever way it is turned, centred under it
    const B = worldBox(el);
    let X = sx((B.x0 + B.x1) / 2), Y = sy(B.y0) + 14 * u + (el.type === 'lens' ? 4 * u : 0);
    // moved or scaled with the select tool: where it was put, at its size
    if (el.label) { X = sx(el.x + el.label.dx); Y = sy(el.y + el.label.dy); }
    ctx.font = +fs.toFixed(3) + 'px ' + sans;
    // two names in the same place: the later one steps down until clear
    const w = ctx.measureText(el.name).width;
    if (!el.label) for (let step = 0; step < 4; step++) {
      const box = { x: X - w / 2, y: Y - 10 * u, w, h: 13 * u };
      if (![...labelBoxes.values(), ...taken].some(b => box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h)) break;
      Y += 13 * u;
    }
    labelBoxes.set(el.id, { x: X - w / 2, y: Y - 10 * u, w, h: 13 * u, ax: X, ay: Y });
    if (textEdit && textEdit.el === el) continue;                          // being retyped in place
    if (fs < 2) continue;                                                  // too small to read at this zoom
    // a plate of the bench's own colour under the name, so a beam or a part passing under it never runs through the letters
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = benchBg(); ctx.globalAlpha = 0.92; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(X - w / 2 - 3 * u, Y - 10 * u, w + 6 * u, 13 * u, 3 * u); else ctx.rect(X - w / 2 - 3 * u, Y - 10 * u, w + 6 * u, 13 * u);
    ctx.fill(); ctx.restore();
    ctx.fillStyle = el.id === selectedId || extraSel.has(el.id) ? '#ffffff' : 'rgba(255,255,255,0.5)';
    ctx.fillText(el.name, X, Y);
    if (el.locked) drawLock(X + ctx.measureText(el.name).width / 2 + 8, Y - 4);
    // a part not at the beam height: by how much, under its name (see zOf)
    if (el.z !== undefined && Math.abs(el.z - BEAM_Z) > 1e-9) {
      const d = el.z - BEAM_Z;
      ctx.fillStyle = '#ffb347';
      ctx.fillText((d > 0 ? '\u2191 ' : '\u2193 ') + (+Math.abs(d).toPrecision(4)) + ' mm', X, Y + 13 * u);
      Y += 13 * u;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
    }
    // a part tipped or rolled out of the plane: by how much
    if (el.tip || el.roll) {
      ctx.fillStyle = '#ffb347';
      ctx.fillText([el.tip ? 'tipped ' + (el.tip > 0 ? 'up ' : 'down ') + (+Math.abs(el.tip).toPrecision(4)) + '\u00b0' : '', el.roll ? 'rolled ' + (+el.roll.toPrecision(4)) + '\u00b0' : ''].filter(Boolean).join(', '), X, Y + 13 * u);
      Y += 13 * u;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
    }
    if (el.type === 'fcomp' && el.kind === 'thru') {
      const P = thruPartner(el);
      ctx.fillStyle = P ? FIBRE_COLOUR : 'rgba(232,111,166,0.55)';
      ctx.fillText(P ? '\u21c4 ' + (P.bench === el.bench ? P.name : benchName(P.bench)) : '\u201c' + el.pair + '\u201d has no partner', X, Y + 13 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
    }
    if (el.type === 'link') {                 // where it leads
      const P = linkPartner(el);
      ctx.fillStyle = P ? '#7fdcff' : 'rgba(127,220,255,0.55)';
      ctx.fillText(P ? '\u21c4 ' + (P.bench === el.bench ? P.name : benchName(P.bench)) : '\u201c' + el.pair + '\u201d has no partner', X, Y + 13 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
    }
  }
}

/* a small padlock, for an element held in place */
function drawLock(X, Y) {
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(X, Y - 2, 2.6, Math.PI, 0); ctx.stroke();
  ctx.fillRect(X - 3.5, Y - 2, 7, 5.5); ctx.restore();
}
/* the elements selected, on this tab, the one the panel shows first */
export function selection() {
  const out = [], seen = new Set();
  for (const id of [selectedId, ...extraSel]) { const e = id && getEl(id); if (e && onTab(e) && !seen.has(id)) { seen.add(id); out.push(e); } }
  return out;
}
export function setSelection(list) {
  setSelectedId(list.length ? list[0].id : null);
  setExtraSel(new Set(list.slice(1).map(e => e.id)));
  selFibreId = null;
  renderPanel(); requestRender();
}
function drawSelection() {
  // the rest of a group: a dashed ring each
  for (const e of selection()) if (e.id !== selectedId && e.type !== 'draw') {
    ctx.strokeStyle = selInk(0.45); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(sx(e.x), sy(e.y), elementExtentPx(e), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  const el = selected();
  if (!el || !onTab(el)) return;
  if (el.type === 'draw' || partsLocked()) return;            // a drawing's dashed box and handles; in Draw a part shows by its name's box
  if (extraSel.size || el.locked) {
    ctx.strokeStyle = selInk(0.7); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(sx(el.x), sy(el.y), elementExtentPx(el), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    return;                              // a group turns from its panel or the menu, not a handle; a locked one not at all
  }
  const [hx, hy] = handlePos(el);
  const cx = sx(el.x), cy = sy(el.y);
  ctx.strokeStyle = selInk(0.45);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(hx, hy); ctx.stroke();
  if (el.type !== 'draw') { ctx.beginPath(); ctx.arc(cx, cy, elementExtentPx(el), 0, Math.PI * 2); ctx.stroke(); }     // a drawing has its box
  ctx.setLineDash([]);
  ctx.fillStyle = getCss('--jek-cyan');
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(hx, hy, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = selInk();
  ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
}

/* an assembly: a dashed box round its parts along its axis (one round each straight run of a folded
   one, the mirror in both), its name above it (red, and saying so, once its parts are no longer on one axis) */
function drawAssemblies() {
  const k = 1 / V().scale;
  for (const a of assemblies()) {
    const M = asmMembers(a).filter(onTab);
    if (!M.length) continue;
    const chk = asmCheck(M, { ref: a.ref, rev: a.rev }), ok = chk.ok, ink = ok ? '#f07a35' : '#e5484d';
    const ref = M.find(e => e.id === a.ref) || M[0], ang = (ref.angle + (a.rev ? 180 : 0)) * deg;
    // the runs: the parts between mirrors, each along the light's way through it (the mirror ends one and starts the next)
    let runs = [{ els: M, ang }];
    if (ok && chk.folded) {
      const byId = new Map(M.map(e => [e.id, e]));
      runs = []; let cur = [];
      chk.order.forEach((id, i) => {
        const e = byId.get(id);
        if (!e) return;
        cur.push(e);
        if (e.type === 'mirror') { runs.push({ els: cur, d: chk.dirs[i] }); cur = [e]; }
        else if (i === chk.order.length - 1) runs.push({ els: cur, d: chk.dirs[i] });
      });
      runs = runs.filter(r => r.els.some(e => e.type !== 'mirror')).map(r => ({ els: r.els, ang: Math.atan2(r.d[1], r.d[0]) }));
      if (!runs.length) runs = [{ els: M, ang }];
    }
    let label = null;
    ctx.save();
    for (const run of runs) {
      const o = run.els[0], fA = { ox: o.x, oy: o.y, c: Math.cos(run.ang), s: Math.sin(run.ang) };
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const e of run.els) {
        const f = frame(e);
        for (const [p, q] of bodyOutline(e)) { const [x, y] = toWorld(f, p, q), [u, v] = toLocal(fA, x, y); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      }
      const m = 3 * k + 0.04 * Math.max(u1 - u0, v1 - v0);
      u0 -= m; u1 += m; v0 -= m; v1 += m;
      pathLocal(fA, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], true);
      ctx.fillStyle = ok ? 'rgba(240,122,53,0.06)' : 'rgba(229,72,77,0.07)'; ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
      // its name over the highest box's top edge, whichever way the axis runs on the page
      const corners = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => toWorld(fA, u, v)).map(([x, y]) => [sx(x), sy(y)]);
      const top = Math.min(...corners.map(c => c[1]));
      if (!label || top < label[1]) label = [corners.reduce((s2, c) => s2 + c[0], 0) / 4, top];
    }
    ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = ink;
    if (label) ctx.fillText(a.name + (ok ? '' : ' (no longer on one axis)'), label[0], label[1] - 4);
    ctx.restore();
  }
}

export function niceStep(target) {
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) if (m * p >= target) return m * p;
  return 10 * p;
}
function drawScaleBar() {
  const mm = niceStep(90 / V().scale);
  const px = mm * V().scale;
  const x = 14 + (stage.classList.contains('rail') && !exporting ? 52 : 0), y = H - 16;     // clear of the parts rail
  ctx.strokeStyle = lightLayer ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)';           // dark with its words on a light bench
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 5); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '11px ' + getCss('--jek-mono');
  ctx.textAlign = 'left';
  ctx.fillText(fmtLen(mm), x + px + 8, y + 1);
}

const cssCache = {};
export function getCss(v) {
  if (!(v in cssCache)) cssCache[v] = getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#000';
  return cssCache[v];
}

export function render() {
  if (!W || !H) return;
  // stale: the bench moved on and a background trace is catching up; its rays are drawn,
  // and the beams and fields, which need the full trace, wait for it
  const stale = traceLater();
  // a tab shown in 3D draws there instead (the 2D bench under it waits)
  let in3d = false;
  try { V3D.sync(); in3d = V3D.active(); } catch (e) { in3d = false; }
  if (in3d) { updateReadouts(); return; }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // a light bench: the parts as ever, the words dark, the light stronger (see benchLight)
  lightLayer = benchLight(); inBench = true;
  if (lightLayer) ctx.fillText = inkedText;
  try { renderAll(stale); } finally { if (ctx.fillText === inkedText) delete ctx.fillText; lightLayer = false; inBench = false; }
  updateReadouts();
}
function renderAll(stale) {
  drawBench();
  const order = { lens: 0, prism: 0, cube: 0, crystal: 0, mirror: 1, grating: 1, screen: 2, stop: 2, waveplate: 2, polariser: 2,
    mask: 2, fibre: 2, detector: 2, faraday: 2, isolator: 2, filter: 2, gain: 2, cell: 1, nlc: 1, link: 2, fcomp: 2, pic: 2, aom: 2, eom: 2, chopper: 2, elec: 2, source: 3, stl: 0, draw: 0 };
  const els = project.elements.filter(onTab).sort((a, b) => order[a.type] - order[b.type]);
  for (const el of els) if (el.type === 'draw' && el.layer === 'under') draw(el);
  drawFibres();
  for (const el of els) if (el.type !== 'source' && el.type !== 'draw') draw(el);
  if (lightOf().rays) drawRays(stale);
  if (!stale) {
    setCloseupOn(drawCloseup());
    const fieldShown = closeupOn ? new Set(popSources().map(e => e.id)) : drawPop();
    drawBeams(fieldShown);
  }
  for (const el of els) if (el.type === 'source') draw(el);
  for (const el of els) if (el.type === 'draw' && el.layer === 'over') draw(el);
  drawAssemblies();
  drawAssumed(els);
  drawLabels();
  drawMeasures();
  updateEmpty();
  if (!exporting && drag && drag.mode === 'box' && drag.cur) {
    const x0 = Math.min(drag.px0, drag.cur[0]), y0 = Math.min(drag.py0, drag.cur[1]);
    ctx.save(); ctx.fillStyle = 'rgba(127,220,255,0.08)'; ctx.strokeStyle = 'rgba(127,220,255,0.8)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.fillRect(x0, y0, Math.abs(drag.cur[0] - drag.px0), Math.abs(drag.cur[1] - drag.py0));
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, Math.abs(drag.cur[0] - drag.px0), Math.abs(drag.cur[1] - drag.py0)); ctx.restore();
  }
  if (!exporting) { drawMinimap(); drawSelection(); drawToolOverlay(); }
  drawScaleBar();
  if (exporting && !thumbing) drawCredit();
}
/* on an exported picture: where it was made */
export let thumbing = false;                 // drawing My benches' picture of the bench: no credit line
export function setThumbing(v) { return (thumbing = v); }
function drawCredit() {
  ctx.save();
  ctx.font = '11px ' + getCss('--jek-sans');
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('Made with JEKray \u00b7 jeksys.net', W - 10, H - 8);
  ctx.restore();
}
/* A thin plate seen edge-on: the shared look of the newer thin elements */
/* A fibre component: a box with its tag, and its ports */
/* Fibre components as schematic symbols, in rose, drawn in the part's own frame in mm with
   v down the page (u across): leads run in from the ports, and a value (a ratio, a loss, a
   shift) sits beside the symbol where it says something. The box is still what is clicked. */
export const FSYM = (() => {
  const ln = (c, a, b, d, e) => { c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke(); };
  const shape = (c, P, close = true) => { c.beginPath(); P.forEach(([u, v], i) => i ? c.lineTo(u, v) : c.moveTo(u, v)); if (close) { c.closePath(); c.fillStyle = bodyFill('#2b3338'); c.fill(); } c.stroke(); };
  const box = (c, a, b) => shape(c, [[-a, -b], [a, -b], [a, b], [-a, b]]);
  const arrow = (c, a, b, d, e, h = 0.9) => { ln(c, a, b, d, e); const t = Math.atan2(e - b, d - a); shape(c, [[d - h * Math.cos(t - 0.45), e - h * Math.sin(t - 0.45)], [d, e], [d - h * Math.cos(t + 0.45), e - h * Math.sin(t + 0.45)]], false); };
  const hatch = (c, u, v0, v1, n) => { for (let i = 0; i < n; i++) { const v = v0 + (v1 - v0) * (i + 0.5) / n; ln(c, u, v, u + 1.1, v - 1.1); } };
  const fmtNm = nm => (+nm.toPrecision(6)) + ' nm';
  // each: draw(c, el), and the value shown, with where (v, mm down the page)
  const S = {
    laser: { draw(c, el) {
      if (el.led) {
        // an LED: the diode, its light leaving by two arrows, into the fibre at the right
        ln(c, -5, 0, -2, 0); ln(c, 2, 0, 7, 0);
        shape(c, [[-2, -2.2], [2, 0], [-2, 2.2]]); ln(c, 2, -2.2, 2, 2.2);
        const st = c.strokeStyle; c.strokeStyle = wavelengthColour(el.wavelength);
        arrow(c, -0.6, -2.4, 1.2, -4.2, 0.7); arrow(c, 1.2, -2.0, 3.0, -3.8, 0.7); c.strokeStyle = st;
        return;
      }
      // any laser: a gain medium between a high reflector and an output coupler, the beam leaving
      box(c, 2.6, 1.6); const w = c.lineWidth; c.lineWidth = w * 2; ln(c, -4, -3, -4, 3); c.lineWidth = w; hatch(c, -5.6, -3, 3, 4);
      ln(c, 4, -3, 4, 3);
      const st = c.strokeStyle; c.strokeStyle = wavelengthColour(el.wavelength); arrow(c, 4, 0, 6, 0); c.strokeStyle = st;
    }, val: el => [fmtNm(el.wavelength) + (el.led ? ', ' + (+el.bw.toPrecision(3)) + ' nm wide' : ''), 4.4] },
    split: { draw(c, el) {
      // the common port's fibre into a fan of branches, one to each port
      const N = el.ways, k = el.combine ? -1 : 1;
      ln(c, -7 * k, 0, -2 * k, 0);
      for (let i = 0; i < N; i++) { const v = -((N - 1) / 2 - i) * SPLIT_P; c.beginPath(); c.moveTo(-2 * k, 0); c.bezierCurveTo(1 * k, 0, 2 * k, v, 4.5 * k, v); c.lineTo(7 * k, v); c.stroke(); }
      c.beginPath(); c.arc(-2 * k, 0, 0.6, 0, 2 * Math.PI); c.fillStyle = c.strokeStyle; c.fill();
    }, val: el => [el.combine ? el.ways + '\u00d71' : '1\u00d7' + el.ways, -(fcH(el) / 2 + 1.4)] },
    coupler: { draw(c) {
      for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(-7, sg * 2.25); c.bezierCurveTo(-2.5, sg * 2.25, -2, sg * 0.4, 0, sg * 0.4); c.bezierCurveTo(2, sg * 0.4, 2.5, sg * 2.25, 7, sg * 2.25); c.stroke(); }
    }, val: el => [Math.round(100 - el.ratio) + ':' + Math.round(el.ratio), -3.6] },
    wdm: { draw(c) {
      c.beginPath(); c.moveTo(-7, 0); c.lineTo(-1, 0); c.bezierCurveTo(2, 0, 3, -2.25, 7, -2.25); c.stroke();
      c.beginPath(); c.moveTo(-1, 0.3); c.bezierCurveTo(2, 0.3, 3, 2.25, 7, 2.25); c.stroke();
    }, val: el => ['λ ' + fmtNm(el.centre), 4.2] },
    circ: { draw(c) {
      ln(c, -7, 0, -2.6, 0); ln(c, 2.6, 0, 7, 0); ln(c, 0, 2.6, 0, 4.5);
      c.beginPath(); c.arc(0, 0, 2.6, 0, 2 * Math.PI); c.fillStyle = bodyFill('#2b3338'); c.fill(); c.stroke();
      c.beginPath(); c.arc(0, 0, 1.5, Math.PI * 0.85, Math.PI * 2.15); c.stroke();
      const a = Math.PI * 2.15; arrow(c, 1.5 * Math.cos(a - 0.3), 1.5 * Math.sin(a - 0.3), 1.5 * Math.cos(a), 1.5 * Math.sin(a), 0.7);
    } },
    iso: { draw(c) { ln(c, -7, 0, -3, 0); ln(c, 3, 0, 7, 0); box(c, 3, 2); arrow(c, -1.8, 0, 1.8, 0); } },
    voa: { draw(c) {
      ln(c, -7, 0, -3, 0); ln(c, 3, 0, 7, 0); box(c, 3, 2);
      shape(c, [[-2.2, 1.2], [-1.3, -1.2], [-0.4, 1.2], [0.5, -1.2], [1.4, 1.2], [2.2, -1]], false); arrow(c, -2, 2.6, 2.6, -2.6);
    }, val: el => [(+el.att.toPrecision(3)) + ' dB', 4.2] },
    pc: { draw(c) { ln(c, -7, 0, 7, 0); for (const u of [-3.2, 0, 3.2]) { c.beginPath(); c.arc(u, -1.5, 1.5, 0, 2 * Math.PI); c.stroke(); } } },
    pol: { draw(c, el) {
      ln(c, -7, 0, -2, 0); ln(c, 2, 0, 7, 0); box(c, 2, 3);
      ln(c, 0, -2.2, 0, 2.2); shape(c, [[-0.7, -1.4], [0, -2.2], [0.7, -1.4]], false); shape(c, [[-0.7, 1.4], [0, 2.2], [0.7, 1.4]], false);
    }, val: el => [(+el.axis.toPrecision(3)) + '°', 4.4] },
    fm: { draw(c) {
      ln(c, -7, 0, -1.2, 0);
      c.save(); c.translate(-0.2, 0); shape(c, [[-1, -1.3], [1, -1.3], [1, 1.3], [-1, 1.3]]); c.restore();
      const w = c.lineWidth; c.lineWidth = w * 1.8; ln(c, 1.8, -3.4, 1.8, 3.4); c.lineWidth = w; hatch(c, 1.8, -3.4, 3.4, 5);
    } },
    fbg: { draw(c) {
      ln(c, -7, 0, 7, 0); for (let u = -3; u <= 3.01; u += 1) ln(c, u, -1.4, u, 1.4);
      c.save(); c.setLineDash([0.5, 0.5]); c.lineWidth *= 0.6; c.strokeRect(-3.6, -1.9, 7.2, 3.8); c.restore();
    }, val: el => [fmtNm(el.centre), -3.4] },
    term: { draw(c) { ln(c, -7, 0, 0.6, 0); for (const u of [0.6, 1.8, 3]) ln(c, u, -2, u + 1.2, 2); } },
    pd: { draw(c, el) {
      if (el.balanced) {
        // two photodiodes back to back, the difference of their currents taken from between them
        for (const v of [-2.25, 2.25]) { ln(c, -7, v, -3, v); shape(c, [[-3, v - 1.5], [0, v], [-3, v + 1.5]]); ln(c, 0, v - 1.5, 0, v + 1.5); ln(c, 0, v, 2, v); }
        ln(c, 2, -2.25, 2, 2.25); ln(c, 2, 0, 4, 0); c.beginPath(); c.arc(2, 0, 0.5, 0, 2 * Math.PI); c.fillStyle = c.strokeStyle; c.fill();
        return;
      }
      ln(c, -7, 0, -3, 0); shape(c, [[-3, -2.8], [2, 0], [-3, 2.8]]); ln(c, 2, -2.8, 2, 2.8);
      arrow(c, -4.6, -4.4, -2.8, -2.6); arrow(c, -2.6, -4.4, -0.8, -2.6);
    } },
    pbs: { draw(c) {
      // a cube with its coating across it, the two polarisations leaving by two fibres
      ln(c, -7, 0, -2.6, 0); box(c, 2.6, 2.6); ln(c, -2.6, 2.6, 2.6, -2.6);
      c.beginPath(); c.moveTo(2.6, -0.6); c.bezierCurveTo(4.5, -0.6, 4.6, -2.25, 7, -2.25); c.stroke();
      c.beginPath(); c.moveTo(2.6, 0.6); c.bezierCurveTo(4.5, 0.6, 4.6, 2.25, 7, 2.25); c.stroke();
    }, val: el => [(+el.axis.toPrecision(3)) + '\u00b0', 4.4] },
    fmir: { draw(c) {
      ln(c, -7, 0, -0.7, 0); ln(c, 0.7, 0, 7, 0); c.beginPath(); c.rect(-0.7, -3, 1.4, 6); c.fillStyle = c.strokeStyle; c.fill();
    }, val: el => ['R ' + (+el.rmax.toPrecision(3)) + '%', 4.6] },
    switch: { draw(c, el) {
      // two blades on their pivots, set bar or cross
      for (const v of [-2.25, 2.25]) { ln(c, -7, v, -3, v); ln(c, 3, v, 7, v); }
      for (const [u, v] of [[-3, -2.25], [-3, 2.25], [3, -2.25], [3, 2.25]]) { c.beginPath(); c.arc(u, v, 0.5, 0, 2 * Math.PI); c.fillStyle = c.strokeStyle; c.fill(); }
      if (el.cross >= 0.5) { ln(c, -3, -2.25, 3, 2.25); ln(c, -3, 2.25, 3, -2.25); } else { ln(c, -3, -2.25, 3, -2.25); ln(c, -3, 2.25, 3, 2.25); }
    }, val: el => [el.cross >= 0.5 ? 'cross' : 'bar', 4.6] },
    delay: { draw(c) {
      // a trombone: the light out along a slide and back
      ln(c, -7, 0, -3.2, 0); ln(c, 3.2, 0, 7, 0); box(c, 3.2, 2.4);
      c.beginPath(); c.moveTo(-3.2, 0); c.lineTo(-2.2, 0); c.lineTo(-2.2, -1.2); c.lineTo(1.6, -1.2); c.lineTo(1.6, 1.2); c.lineTo(-2.2, 1.2); c.lineTo(-2.2, 0.4); c.stroke();
      arrow(c, 0.6, 0, 2.6, 0, 0.6);
    }, val: el => [(+el.delay.toPrecision(4)) + ' ps', 4.6] },
    stretch: { draw(c) {
      // fibre wound round a piezo drum
      ln(c, -7, 0, -2.6, 0); ln(c, 2.6, 0, 7, 0); c.beginPath(); c.arc(0, 0, 2.6, 0, 2 * Math.PI); c.fillStyle = bodyFill('#2b3338'); c.fill(); c.stroke();
      c.beginPath(); c.arc(0, 0, 1.4, 0, 2 * Math.PI); c.stroke();
    }, val: el => [(+el.phase.toPrecision(3)) + '\u00b0', 4.6] },
    tbf: { draw(c) {
      ln(c, -7, 0, -3.2, 0); ln(c, 3.2, 0, 7, 0); box(c, 3.2, 2.4);
      c.beginPath(); for (let i = 0; i <= 24; i++) { const u = -2.4 + 4.8 * i / 24, v = 1.4 - 2.6 * Math.exp(-((u / 0.8) ** 2)); i ? c.lineTo(u, v) : c.moveTo(u, v); } c.stroke();
      arrow(c, -1.6, 1.9, 1.6, 1.9, 0.5); arrow(c, 1.6, 1.9, -1.6, 1.9, 0.5);
    }, val: el => [(+el.centre.toPrecision(6)) + ' nm', 4.6] },
    depol: { draw(c) {
      // two crystals, their axes crossed at 45 degrees
      ln(c, -7, 0, -3.4, 0); ln(c, 3.4, 0, 7, 0);
      c.beginPath(); c.rect(-3.4, -2.4, 2.6, 4.8); c.fillStyle = bodyFill('#2b3338'); c.fill(); c.stroke(); c.beginPath(); c.rect(-0.4, -2.4, 3.8, 4.8); c.fill(); c.stroke();
      ln(c, -2.9, 1.9, -1.3, -1.9); ln(c, 0.4, 0, 2.6, 0); ln(c, 1.5, -1.9, 1.5, 1.9);
    }, val: el => [(+el.dgd.toPrecision(3)) + ' ps', 4.6] },
    star: { draw(c, el) {
      // every input fanned into a mixing region and out to every output
      const M = el.ins, N = el.outs, h = Math.max(M, N) * SPLIT_P / 2;
      c.beginPath(); c.rect(-1.6, -h * 0.6 - 0.6, 3.2, 1.2 * h + 1.2); c.fillStyle = bodyFill('#2b3338'); c.fill(); c.stroke();
      for (let i = 0; i < M; i++) { const v = -((M - 1) / 2 - i) * SPLIT_P; c.beginPath(); c.moveTo(-7, v); c.bezierCurveTo(-4, v, -3.5, v * 0.6, -1.6, v * 0.6); c.stroke(); }
      for (let j = 0; j < N; j++) { const v = -((N - 1) / 2 - j) * SPLIT_P; c.beginPath(); c.moveTo(7, v); c.bezierCurveTo(4, v, 3.5, v * 0.6, 1.6, v * 0.6); c.stroke(); }
    }, val: el => [el.ins + '\u00d7' + el.outs, -(fcH(el) / 2 + 1.4)] },
    osa: { draw(c) {
      ln(c, -7, 0, -4.6, 0); box(c, 4.6, 3.4);
      c.beginPath(); c.moveTo(-3.6, 2.4); for (const [u, h] of [[-1.8, 3.8], [0.6, 2.2], [2.2, 1.2]]) { c.lineTo(u - 0.5, 2.4); c.lineTo(u, 2.4 - h); c.lineTo(u + 0.5, 2.4); } c.lineTo(3.6, 2.4); c.stroke();
    } },
    thru: { draw(c) {
      ln(c, -3, 0, 7, 0); c.beginPath(); c.rect(-0.6, -3.6, 1.2, 7.2); c.fillStyle = bodyFill('#2b3338'); c.fill(); c.stroke(); hatch(c, -2, -3.6, 3.6, 5);
    }, val: el => [el.pair, 4.6] },
    amp: { draw(c, el) {
      ln(c, -7, 0, -3.4, 0); ln(c, 3.4, 0, 7, 0);
      // a semiconductor amplifier: its chip, the gain stripe along it, both ways
      if (el.soa) { box(c, 3.4, 2.2); ln(c, -2.4, 0, 2.4, 0); shape(c, [[-1.2, -1.2], [1.2, 0], [-1.2, 1.2]]); return; }
      shape(c, [[-3.4, -3.6], [3.4, 0], [-3.4, 3.6]]);
    }, val: el => [(+el.g0.toPrecision(3)) + ' dB', 4.6] },
    aom: { draw(c) {
      ln(c, -7, 0, -3.2, 0); ln(c, 3.2, 0, 7, 0); box(c, 3.2, 2.2);
      for (const u of [-2, -0.7, 0.6, 1.9]) { c.beginPath(); c.moveTo(u, -1.6); c.quadraticCurveTo(u + 0.7, -0.8, u, 0); c.quadraticCurveTo(u - 0.7, 0.8, u, 1.6); c.stroke(); }
      c.fillStyle = c.strokeStyle; c.fillRect(-2.4, 2.2, 4.8, 0.9);
    }, val: el => [(el.order < 0 ? '−' : '+') + fmtHz(el.rf * 1e6), 4.6] },
    eom: { draw(c) {
      ln(c, -7, 0, -3.2, 0); ln(c, 3.2, 0, 7, 0); box(c, 3.2, 1.6);
      c.fillStyle = c.strokeStyle; c.fillRect(-3.2, -2.6, 6.4, 0.8); c.fillRect(-3.2, 1.8, 6.4, 0.8);
    }, val: el => [fmtHz(el.fm * 1e6), 4.6] },
  };
  function draw(el, sel) {
    const G = S[el.kind], s = V().scale;
    if (!G) return false;
    const c = ctx;
    c.save(); c.translate(sx(el.x), sy(el.y)); c.rotate(-el.angle * deg); c.scale(s, s);
    c.strokeStyle = sel ? selInk() : FIBRE_COLOUR; c.lineWidth = (sel ? 2.2 : 1.5) / s; c.lineJoin = 'round'; c.lineCap = 'round';
    G.draw(c, el);
    c.restore();
    if (G.val && s > 2.5) {
      const [t, v] = G.val(el), f = frame(el), [x, y] = toWorld(f, 0, -v);
      c.save(); c.font = clamp(1.6 * s, 8, 11) + 'px ' + getCss('--jek-mono'); c.fillStyle = el.kind === 'laser' ? wavelengthColour(el.wavelength) : 'rgba(244,199,220,0.9)';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, sx(x), sy(y)); c.restore();
    }
    return true;
  }
  return { draw };
})();
/* a w x hh half-size rectangle with corners of radius r, as points */
export function roundRect(w, hh, r) {
  const pts = [], k = 6;
  for (const [cx, cy, a0] of [[w - r, -hh + r, -90], [w - r, hh - r, 0], [-w + r, hh - r, 90], [-w + r, -hh + r, 180]])
    for (let i = 0; i <= k; i++) { const a = (a0 + 90 * i / k) * deg; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}
/* a component's ports: open rings where nothing is joined, filled where a fibre is, numbered when there are several */
/* where the port names were drawn this frame, in css px: the parts' names keep off them */
const portLabelBoxes = [];
export const keepOffLabel = box => { portLabelBoxes.push(box); };
export function drawPorts(el) {
  const ps = portsOf(el), used = portsInUse(), s = V().scale, r = clamp(1.1 * s, 3, 6);
  ELEC_UI.drawExtras(el);                                                                       // ELEC hook
  ps.forEach((P, i) => {
    if (P.elec) return;
    const Q = portWorld(el, i), X = sx(Q.x), Y = sy(Q.y), on = used.has(pkey(el.id, i));
    ctx.beginPath(); ctx.arc(X, Y, r, 0, 2 * Math.PI);
    ctx.fillStyle = on ? FIBRE_COLOUR : portFill(); ctx.fill();
    ctx.strokeStyle = FIBRE_COLOUR; ctx.lineWidth = 1.4; ctx.stroke();
    if (ps.length > 1 && s > 3) {                  // named when it has company: other fibre ports, or electrical ones
      // the name just outside the port, above it, upright whatever the part's angle
      ctx.fillStyle = 'rgba(244,199,220,0.9)'; ctx.font = '9px ' + getCss('--jek-mono');
      const W = Math.abs(Q.dx) < 0.3;
      ctx.textAlign = W ? 'left' : Q.dx > 0 ? 'left' : 'right'; ctx.textBaseline = W ? 'middle' : 'bottom';
      const t = portName(el, i), tx = X + (W ? r + 3 : Q.dx * (r + 3)), ty = Y - (W ? 0 : 3), tw = ctx.measureText(t).width;
      ctx.fillText(t, tx, ty);
      // kept, so the part's name steps out of its way (see drawLabels)
      portLabelBoxes.push({ x: ctx.textAlign === 'right' ? tx - tw : tx, y: W ? ty - 5 : ty - 9, w: tw, h: 10 });
      ctx.textBaseline = 'alphabetic';
    }
  });
}
export const portsInUse = () => new Set((project.fibres || []).flatMap(F => [pkey(...F.a), pkey(...F.b)]));
/* A fibre's path, in bench coordinates: cubic segments from port to port through its nodes.
   It leaves each port along the port's direction, ta and tb mm (or a length that suits the
   span); each node has an in handle h1 and an out handle h2, offsets from it, as in a
   drawing program. endB, a point, stands in for the far port while a fibre is being laid. */
export function fibreSegs(F, endB) {
  const A = getEl(F.a[0]);
  if (!A) return null;
  const pa = portWorld(A, F.a[1]);
  let pb = null;
  if (!endB) { const B = getEl(F.b[0]); if (!B) return null; pb = portWorld(B, F.b[1]); }
  const nodes = F.path || [], s0 = V().scale;
  const P = [[pa.x, pa.y], ...nodes.map(n => [n.x, n.y]), endB || [pb.x, pb.y]];
  const auto = i => Math.max(24 / s0, 0.4 * Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]));
  const segs = [];
  for (let i = 0; i < P.length - 1; i++) {
    const ta = F.ta != null ? F.ta : auto(0);
    const c1 = i === 0 ? [pa.x + pa.dx * ta, pa.y + pa.dy * ta] : [P[i][0] + nodes[i - 1].h2[0], P[i][1] + nodes[i - 1].h2[1]];
    let c2;
    if (i < P.length - 2) c2 = [P[i + 1][0] + nodes[i].h1[0], P[i + 1][1] + nodes[i].h1[1]];
    else if (pb) { const tb = F.tb != null ? F.tb : auto(i); c2 = [pb.x + pb.dx * tb, pb.y + pb.dy * tb]; }
    else c2 = [(c1[0] + P[i + 1][0]) / 2, (c1[1] + P[i + 1][1]) / 2];
    segs.push([P[i], c1, c2, P[i + 1]]);
  }
  return segs;
}
export const toScr = q => [sx(q[0]), sy(q[1])];
function tracePath(segs) {
  ctx.beginPath(); ctx.moveTo(...toScr(segs[0][0]));
  for (const C of segs) ctx.bezierCurveTo(...toScr(C[1]), ...toScr(C[2]), ...toScr(C[3]));
}
/* the point of a fibre nearest a point on screen: its segment, parameter and distance (px) */
export function fibreNearest(F, px, py) {
  const segs = fibreSegs(F);
  if (!segs) return null;
  let best = null;
  segs.forEach((C, k) => {
    for (let i = 0; i <= 60; i++) { const [x, y] = toScr(bez(C, i / 60)), d = Math.hypot(x - px, y - py); if (!best || d < best.d) best = { k, t: i / 60, d }; }
  });
  return best;
}
/* A node put into a fibre at segment k, parameter t, without changing its shape: the curve
   split there (de Casteljau), the neighbours' handles shortened to match */
export function fibreSplit(F, k, t) {
  const segs = fibreSegs(F), [P0, P1, P2, P3] = segs[k];
  const L = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const P01 = L(P0, P1), P12 = L(P1, P2), P23 = L(P2, P3), P012 = L(P01, P12), P123 = L(P12, P23), M = L(P012, P123);
  F.path = F.path || [];
  const nodes = F.path;
  if (k === 0) F.ta = Math.hypot(P01[0] - P0[0], P01[1] - P0[1]);
  else nodes[k - 1].h2 = [P01[0] - P0[0], P01[1] - P0[1]];
  if (k === segs.length - 1) F.tb = Math.hypot(P23[0] - P3[0], P23[1] - P3[1]);
  else nodes[k].h1 = [P23[0] - P3[0], P23[1] - P3[1]];
  nodes.splice(k, 0, { x: M[0], y: M[1], h1: [P012[0] - M[0], P012[1] - M[1]], h2: [P123[0] - M[0], P123[1] - M[1]] });
  return k;
}
/* the grip of the selected fibre under a point: a handle, a node, or an end's handle */
export function fibreGrip(F, px, py) {
  const segs = fibreSegs(F);
  if (!segs) return null;
  const near = (q, r) => Math.hypot(sx(q[0]) - px, sy(q[1]) - py) <= (r || 7);
  const nodes = F.path || [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (near([n.x + n.h1[0], n.y + n.h1[1]])) return { type: 'h1', i };
    if (near([n.x + n.h2[0], n.y + n.h2[1]])) return { type: 'h2', i };
  }
  for (let i = 0; i < nodes.length; i++) if (near([nodes[i].x, nodes[i].y], 8)) return { type: 'node', i };
  // an end with no direction (an electrical node) has no handle: its point is the node's own
  const loose = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-9;
  if (loose(segs[0][1], segs[0][0]) && near(segs[0][1])) return { type: 'ta' };
  const L = segs[segs.length - 1];
  if (loose(L[2], L[3]) && near(L[2])) return { type: 'tb' };
  return null;
}
/* moving a grip to a point on the bench; free (Shift) lets a node's two handles part */
export function moveGrip(F, g, X, Y, free) {
  const nodes = F.path || [];
  if (g.type === 'node') { nodes[g.i].x = X; nodes[g.i].y = Y; return; }
  if (g.type === 'h1' || g.type === 'h2') {
    const n = nodes[g.i], mine = g.type, other = mine === 'h1' ? 'h2' : 'h1';
    n[mine] = [X - n.x, Y - n.y];
    if (!free) {                               // a smooth node: the other handle stays opposite, its own length
      const L = Math.hypot(...n[mine]), Lo = Math.hypot(...n[other]) || L;
      if (L > 0) n[other] = [-n[mine][0] / L * Lo, -n[mine][1] / L * Lo];
    }
    return;
  }
  const end = g.type === 'ta' ? F.a : F.b, el = getEl(end[0]), P = portWorld(el, end[1]);
  F[g.type] = Math.max(0, (X - P.x) * P.dx + (Y - P.y) * P.dy);     // along the port's own direction
}
export const bez = (C, t) => { const u = 1 - t; return [0, 1].map(k => u * u * u * C[0][k] + 3 * u * u * t * C[1][k] + 3 * u * t * t * C[2][k] + t * t * t * C[3][k]); };
/* the light a fibre carries, both ways, in mW; and its colour */
function fibreLight(F) {
  const net = lastTrace.net;
  if (!net) return { mw: 0, colour: null };
  const mw = netPower(net.out.get(pkey(...F.a)), net.keys) + netPower(net.out.get(pkey(...F.b)), net.keys);
  const K = net.keys.find(k => (net.out.get(pkey(...F.a)) || new Map()).has(k.gk) || (net.out.get(pkey(...F.b)) || new Map()).has(k.gk));
  return { mw, colour: K ? wavelengthColour(K.nm) : null };
}
function drawFibres() {
  const list = (project.fibres || []).filter(F => { const A = getEl(F.a[0]), B = getEl(F.b[0]); return A && B && onTab(A) && onTab(B); });
  const lights = list.map(F => F.wire ? { mw: 0 } : fibreLight(F)), top = Math.max(1e-30, ...lights.map(l => l.mw));
  list.forEach((F, i) => {
    const segs = fibreSegs(F);
    if (!segs) return;
    const sel = F.id === selFibreId;
    // PIC hook: waveguides in green; ELEC hook: wires in yellow, thinner
    tracePath(segs); ctx.strokeStyle = F.wg ? PIC.GREEN : F.wire ? ELEC.YELLOW : FIBRE_COLOUR; ctx.lineWidth = (sel ? 4 : 3) - (F.wg ? 0.8 : F.wire ? 1.4 : 0); ctx.stroke();
    if (F.wire) { if (sel) drawFibreNodes(F, segs); return; }
    const L = lights[i];
    if (L.colour && L.mw > 1e-9 * top) {
      tracePath(segs); ctx.save(); ctx.globalAlpha = 0.25 + 0.75 * Math.sqrt(L.mw / top); ctx.strokeStyle = L.colour; ctx.lineWidth = 1.6;
      ctx.shadowColor = L.colour; ctx.shadowBlur = 6; ctx.stroke(); ctx.restore();
    }
    if (sel) drawFibreNodes(F, segs);
  });
  if (drag && drag.mode === 'fibre' && drag.cur) {
    const el = getEl(drag.from[0]);
    const segs = el && fibreSegs({ a: drag.from }, [wx(drag.cur[0]), wy(drag.cur[1])]);
    const wire = !!ELEC.dirOf(drag.from);                                                   // ELEC hook: a wire being drawn
    if (segs) { tracePath(segs); ctx.setLineDash([6, 4]); ctx.strokeStyle = wire ? ELEC.YELLOW : FIBRE_COLOUR; ctx.lineWidth = wire ? 1.8 : 2.5; ctx.stroke(); ctx.setLineDash([]); }
  }
}
/* a selected fibre's nodes (squares) and handles (lines to round knobs), as in a drawing program */
function drawFibreNodes(F, segs) {
  const knob = (q, from) => {
    const [X, Y] = toScr(q), [X0, Y0] = toScr(from);
    ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X, Y); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(X, Y, 3.5, 0, 2 * Math.PI); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#0092b2'; ctx.lineWidth = 1.2; ctx.stroke();
  };
  knob(segs[0][1], segs[0][0]);
  const last = segs[segs.length - 1];
  knob(last[2], last[3]);
  for (const n of F.path || []) {
    knob([n.x + n.h1[0], n.y + n.h1[1]], [n.x, n.y]);
    knob([n.x + n.h2[0], n.y + n.h2[1]], [n.x, n.y]);
  }
  for (const n of F.path || []) {
    const [X, Y] = toScr([n.x, n.y]);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#0092b2'; ctx.lineWidth = 1.4;
    ctx.fillRect(X - 4.5, Y - 4.5, 9, 9); ctx.strokeRect(X - 4.5, Y - 4.5, 9, 9);
  }
}
/* the port under a point on screen, on this tab */
export function portAt(px, py) {
  const r = 8;
  for (const el of project.elements) {
    if (!onTab(el) || (el.type !== 'fcomp' && el.type !== 'fibre' && el.type !== 'pic' && el.type !== 'elec' && !ELEC.extra(el).length)) continue;   // ELEC hook
    const ps = portsOf(el), n = ps.length;
    for (let i = 0; i < n; i++) { const Q = portWorld(el, i), r = ps[i].elec === 'io' ? 5 : 8; if (Math.hypot(sx(Q.x) - px, sy(Q.y) - py) <= r) return [el.id, i]; }
  }
  return null;
}
export function fibreAtPx(px, py) {
  let best = null, bd = 6;
  for (const F of project.fibres || []) {
    const A = getEl(F.a[0]), B = getEl(F.b[0]);
    if (!A || !B || !onTab(A)) continue;
    const q = fibreNearest(F, px, py);
    if (q && q.d < bd) { bd = q.d; best = F; }
  }
  return best;
}
export let selFibreId = null;
export function setSelFibreId(v) { return (selFibreId = v); }
export const selFibre = () => selFibreId ? (project.fibres || []).find(F => F.id === selFibreId) || null : null;
export function removeFibre(F) {
  checkpoint();
  project.fibres = project.fibres.filter(G => G !== F);
  if (selFibreId === F.id) selFibreId = null;
  changed(true);
}
export function drawPlate(el, sel, stroke, fill, half) {
  const f = frame(el), L = el.length / 2, k = 1 / V().scale, t = (half || 1.2) * k;
  pathLocal(f, [[-t, -L], [t, -L], [t, L], [-t, L]], true);
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = sel ? selInk() : stroke; ctx.lineWidth = sel ? 2.5 : 1.6; ctx.stroke();
  return { f, L, k };
}
/* an arrow along the element's axis above it: the direction of a Faraday rotator's field */
export function drawAxisArrow(f, L, k, colour, bar) {
  const [ax, ay] = toWorld(f, -7 * k, L + 9 * k), [bx, by] = toWorld(f, 7 * k, L + 9 * k);
  const X1 = sx(ax), Y1 = sy(ay), X2 = sx(bx), Y2 = sy(by), an = Math.atan2(Y2 - Y1, X2 - X1);
  ctx.beginPath(); ctx.moveTo(X1, Y1); ctx.lineTo(X2, Y2);
  ctx.moveTo(X2, Y2); ctx.lineTo(X2 - 5 * Math.cos(an - 0.5), Y2 - 5 * Math.sin(an - 0.5));
  ctx.moveTo(X2, Y2); ctx.lineTo(X2 - 5 * Math.cos(an + 0.5), Y2 - 5 * Math.sin(an + 0.5));
  if (bar) { const px = -Math.sin(an) * 5, py = Math.cos(an) * 5; ctx.moveTo(X2 + px, Y2 + py); ctx.lineTo(X2 - px, Y2 - py); }
  ctx.strokeStyle = colour; ctx.lineWidth = 1.6; ctx.stroke();
}
export function filterColour(el) {
  if (el.ftype === 'nd') return '#9aa4ab';
  if (el.ftype === 'bandpass') return wavelengthColour(el.centre);
  return wavelengthColour(el.ftype === 'longpass' ? el.edge + 60 : el.edge - 60);
}
export function draw(el) {
  drawBody(el);
  if (el.type !== 'fcomp') ELEC_UI.drawExtras(el);                                               // ELEC hook: electrical ports on optical parts
}
function drawBody(el) {
  const sel = el.id === selectedId || extraSel.has(el.id), U = PART_UI[el.type];
  if (U) U.draw(el, sel);
}

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wireRender() {
  new ResizeObserver(resize).observe(stage);

  document.documentElement.classList.add('rt-noscroll');

}
