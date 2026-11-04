import { TEST_MODE, clamp } from '../../../jekray/src/core/constants.js';
import { fmtVolt, nf } from '../core/units.js';
import { PLANES, meshSections, shapeSections } from '../core/geom.js';
import { project, selectedId, V } from '../state/project.js';
import { SIM } from './sim.js';
import { viridis } from '../core/colour.js';

/* ==========================================================================
   Drawing the bench: the cut through the array (its plane and position are the view's), the potential or field
   strength on it as a colour map and equipotentials, the electrodes' sections, the ion groups' starts, the
   detectors, and the flown trajectories projected onto the plane. A cylindrical array is drawn whole, its half
   plane mirrored. The view's u, v are the plane's two coordinates in millimetres; the scale is pixels a mm.
   ========================================================================== */
export const canvas = typeof document !== 'undefined' ? document.getElementById('bench') : null;
export const ctx = canvas ? canvas.getContext('2d') : null;
export const stage = typeof document !== 'undefined' ? document.getElementById('stage') : null;
export let W = 0, H = 0, DPR = 1;
export function resize() {
  if (!stage) return;
  const r = stage.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  if (W > 0 && r.width > 0 && r.width !== W) { try { const v = V(); if (v && v.scale > 0) v.cx += (r.width - W) / (2 * v.scale); } catch (err) { /* no bench yet */ } }
  W = r.width; H = r.height;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  requestRender();
}
export const sx = u => W / 2 + (u - V().cx) * V().scale;
export const sy = v => H / 2 - (v - V().cy) * V().scale;
export const wx = px => V().cx + (px - W / 2) / V().scale;
export const wy = py => V().cy - (py - H / 2) / V().scale;
/* the plane's coordinates of a bench point, and back (the perpendicular at the cut) */
export const uvOf = p => { const [iu, iv] = PLANES[V().plane]; return [p[iu], p[iv]]; };
export function pointOf(u, v) { const [iu, iv, ip] = PLANES[V().plane], p = [0, 0, 0]; p[iu] = u; p[iv] = v; p[ip] = V().slice; return p; }

let renderQueued = false, lastDrawn = false;
export let drawnOnce = () => {};
export function setDrawnOnce(fn) { return (drawnOnce = fn); }
export function requestRender() {
  if (renderQueued || !canvas) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}
/* ---------- theme ---------- */
const THEME_KEY = 'jek-rt-theme';
export let themePref = (() => { try { return localStorage.getItem(THEME_KEY) || 'system'; } catch (err) { return 'system'; } })();
const sysDark = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
export const themeDark = () => themePref === 'dark' || (themePref === 'system' && sysDark());
export function setTheme(v) {
  themePref = v;
  try { localStorage.setItem(THEME_KEY, v); } catch (err) { /* this visit */ }
  applyTheme();
}
export function applyTheme() {
  document.documentElement.dataset.rtTheme = themeDark() ? 'dark' : 'light';
  cssCache = {};
  requestRender();
}
let cssCache = {};
export function getCss(v) {
  if (!(v in cssCache)) cssCache[v] = getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#000';
  return cssCache[v];
}
export const inkA = a => (themeDark() ? 'rgba(231,227,219,' + a + ')' : 'rgba(0,0,0,' + a + ')');
export function niceStep(target) {
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) if (m * p >= target) return m * p;
  return 10 * p;
}
/* the array's extent in the plane: [u0, u1, v0, v1] (a cylindrical array mirrored across the axis) */
export function arrayBox() {
  const G = project.grid, [iu, iv] = PLANES[V().plane], lo = [G.x0, G.sym === 'cyl' ? -G.y1 : G.y0, G.sym === 'planar' || G.sym === 'cyl' ? -G.y1 : G.z0], hi = [G.x1, G.y1, G.sym === 'planar' || G.sym === 'cyl' ? G.y1 : G.z1];
  if (G.sym === 'cyl') { lo[2] = -G.y1; hi[2] = G.y1; }
  return [lo[iu], hi[iu], lo[iv], hi[iv]];
}
export function fitView() {
  if (!W || !H) return;
  const [u0, u1, v0, v1] = arrayBox();
  V().cx = (u0 + u1) / 2; V().cy = (v0 + v1) / 2;
  V().scale = clamp(0.9 * Math.min(W / Math.max(1e-6, u1 - u0), H / Math.max(1e-6, v1 - v0)), 0.05, 1e4);
  requestRender();
}

/* ---------- the colour map's image, cached by its slice ---------- */
let mapImg = null, mapKey = '';
export let mapRange = null;          // [lo, hi] of what the map shows
export const mapCanvasFor = (S, efield) => mapOf(S, efield);
function mapOf(S, efield) {
  const key = S.id + '|' + efield + '|' + themeDark();
  if (mapImg && mapKey === key) return mapImg;
  const A = efield && S.emag ? S.emag : S.pot, n = S.nu * S.nv;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const v = A[i]; if (v === v && isFinite(v) && S.mask[i] < 0) { if (v < lo) lo = v; if (v > hi) hi = v; } }
  if (!(hi > lo)) { lo = Math.min(lo, 0); hi = lo + 1; }
  mapRange = [lo, hi];
  const img = new ImageData(S.nu, S.nv), d = img.data;
  for (let b = 0; b < S.nv; b++) for (let a = 0; a < S.nu; a++) {
    const i = a + S.nu * b, o = 4 * (a + S.nu * (S.nv - 1 - b)), v = A[i];
    if (!(v === v) || S.mask[i] >= 0) { d[o + 3] = 0; continue; }
    const c = viridis((v - lo) / (hi - lo));
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 200;
  }
  const cv = document.createElement('canvas'); cv.width = S.nu; cv.height = S.nv;
  cv.getContext('2d').putImageData(img, 0, 0);
  mapImg = cv; mapKey = key;
  return cv;
}
/* marching squares: the equipotentials of the slice as segments [u1, v1, u2, v2], in slice coordinates */
function contoursOf(S, levels) {
  const out = [], { nu, nv, pot: A, mask } = S;
  const at = (a, b) => A[a + nu * b];
  for (const L of levels) {
    const segs = [];
    for (let b = 0; b + 1 < nv; b++) for (let a = 0; a + 1 < nu; a++) {
      if (mask[a + nu * b] >= 0 || mask[a + 1 + nu * b] >= 0 || mask[a + nu * (b + 1)] >= 0 || mask[a + 1 + nu * (b + 1)] >= 0) continue;
      const v00 = at(a, b), v10 = at(a + 1, b), v01 = at(a, b + 1), v11 = at(a + 1, b + 1);
      const c = (v00 >= L ? 1 : 0) | (v10 >= L ? 2 : 0) | (v11 >= L ? 4 : 0) | (v01 >= L ? 8 : 0);
      if (c === 0 || c === 15) continue;
      const pts = [];
      const lerp = (p, q, vp, vq) => p + (L - vp) / ((vq - vp) || 1e-30) * (q - p);
      if ((c & 1) !== ((c >> 1) & 1)) pts.push([lerp(a, a + 1, v00, v10), b]);
      if (((c >> 1) & 1) !== ((c >> 2) & 1)) pts.push([a + 1, lerp(b, b + 1, v10, v11)]);
      if (((c >> 2) & 1) !== ((c >> 3) & 1)) pts.push([lerp(a, a + 1, v01, v11), b + 1]);
      if (((c >> 3) & 1) !== (c & 1)) pts.push([a, lerp(b, b + 1, v00, v01)]);
      if (pts.length >= 2) segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
      if (pts.length === 4) segs.push([pts[2][0], pts[2][1], pts[3][0], pts[3][1]]);
    }
    out.push({ L, segs });
  }
  return out;
}
let contourCache = { key: '', list: [] };

export function render() {
  if (!W || !H || !project) return;
  const c = ctx, sc = V().scale;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, W, H);
  const G = project.grid, show = project.show, plane = V().plane, [iu, iv, ip] = PLANES[plane];
  const cyl = G.sym === 'cyl', mirror = cyl && plane !== 'yz';
  const [u0, u1, v0, v1] = arrayBox();
  // the array's box
  c.fillStyle = themeDark() ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)';
  c.fillRect(sx(u0), sy(v1), (u1 - u0) * sc, (v1 - v0) * sc);
  // the potential (or |E|) map and equipotentials
  const S = SIM.slice;
  if (S && S.plane === plane && show.pot !== 'none') {
    const efield = show.efield && S.emag;
    const sU0 = S.u0, sV0 = S.v0, du = S.h * (S.nu - 1), dv = S.h * (S.nv - 1);
    const drawMap = flipV => {
      c.save(); c.imageSmoothingEnabled = true;
      const img = mapOf(S, efield);
      if (S.nv > 1) {
        // the half plane as it is, or mirrored across the axis (drawn upward from its far edge)
        if (flipV) { c.translate(sx(sU0 - S.h / 2), sy(-(sV0 + dv + S.h / 2))); c.scale((du + S.h) * sc / S.nu, -(dv + S.h) * sc / S.nv); }
        else { c.translate(sx(sU0 - S.h / 2), sy(sV0 + dv + S.h / 2)); c.scale((du + S.h) * sc / S.nu, (dv + S.h) * sc / S.nv); }
        c.drawImage(img, 0, 0, S.nu, S.nv);
      }
      c.restore();
    };
    if (show.pot === 'map' || show.pot === 'both' || efield) { drawMap(false); if (mirror) drawMap(true); }
    if ((show.pot === 'contours' || show.pot === 'both') && !efield && S.nv > 1) {
      const key = S.id + '|' + show.contours;
      if (contourCache.key !== key) {
        const R = mapRange || [0, 1], lo = R[0], hi = R[1], n = show.contours, lv = [];
        const st = niceStep((hi - lo) / n) || 1;
        for (let L = Math.ceil(lo / st) * st; L <= hi; L += st) lv.push(L);
        contourCache = { key, list: contoursOf(S, lv.length ? lv : [(lo + hi) / 2]) };
      }
      c.save(); c.lineWidth = 1; c.strokeStyle = themeDark() ? 'rgba(255,255,255,0.55)' : 'rgba(40,30,20,0.55)';
      const draw = flip => { c.beginPath(); for (const { segs } of contourCache.list) for (const s of segs) { c.moveTo(sx(sU0 + s[0] * S.h), sy(flip ? -(sV0 + s[1] * S.h) : sV0 + s[1] * S.h)); c.lineTo(sx(sU0 + s[2] * S.h), sy(flip ? -(sV0 + s[3] * S.h) : sV0 + s[3] * S.h)); } c.stroke(); };
      draw(false); if (mirror) draw(true);
      c.restore();
    }
  }
  // the array's outline and, zoomed in, its nodes
  if (show.grid) {
    c.save(); c.strokeStyle = inkA(0.35); c.setLineDash([4, 3]); c.lineWidth = 1;
    c.strokeRect(sx(u0), sy(v1), (u1 - u0) * sc, (v1 - v0) * sc);
    c.restore();
    if (G.h * sc > 9) {
      c.save(); c.fillStyle = inkA(0.18);
      const a0 = Math.max(u0, wx(0)), a1 = Math.min(u1, wx(W)), b0 = Math.max(v0, wy(H)), b1 = Math.min(v1, wy(0));
      const uStart = G[['x0', 'y0', 'z0'][iu]], vStart = cyl && iv === 1 ? 0 : G[['x0', 'y0', 'z0'][iv]];
      for (let a = Math.ceil((a0 - uStart) / G.h); uStart + a * G.h <= a1; a++) for (let b = Math.ceil((b0 - vStart) / G.h); vStart + b * G.h <= b1; b++) {
        const X = sx(uStart + a * G.h), Y = sy(vStart + b * G.h);
        c.fillRect(X - 0.75, Y - 0.75, 1.5, 1.5);
        if (mirror && b !== 0) c.fillRect(X - 0.75, sy(-(vStart + b * G.h)) - 0.75, 1.5, 1.5);
      }
      c.restore();
    }
    if (cyl && plane !== 'yz') { c.save(); c.strokeStyle = inkA(0.3); c.setLineDash([8, 6]); c.beginPath(); c.moveTo(sx(u0), sy(0)); c.lineTo(sx(u1), sy(0)); c.stroke(); c.restore(); }
  }
  // the electrodes' sections
  for (const el of project.electrodes) {
    if (el.on === false) continue;
    const sel = el.id === selectedId;
    const slice = V().slice;
    const polysAt = s => (el.shape === 'mesh' ? null : shapeSections(el, plane, s));
    const fill = (polys, flip) => {
      c.beginPath();
      for (const P of polys) { P.forEach(([u, v], i) => { const X = sx(u), Y = sy(flip ? -v : v); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.closePath(); }
      c.fillStyle = el.colour + (el.transparent ? '55' : sel ? 'ee' : 'bb'); c.fill('evenodd');
      c.setLineDash(el.transparent ? [4, 3] : []);
      c.strokeStyle = sel ? getCss('--jek-cyan') : 'rgba(0,0,0,0.55)'; c.lineWidth = sel ? 2.5 : 1; c.stroke(); c.setLineDash([]);
    };
    if (el.shape === 'mesh') {
      // a CAD body: its voxels on the slice, and the cut through its triangles
      if (S && S.plane === plane) {
        c.fillStyle = el.colour + (sel ? 'dd' : '99');
        const k = project.electrodes.filter(e => e.on !== false).indexOf(el);
        for (let b = 0; b < S.nv; b++) for (let a = 0; a < S.nu; a++) if (S.mask[a + S.nu * b] === k) {
          c.fillRect(sx(S.u0 + (a - 0.5) * S.h), sy(S.v0 + (b + 0.5) * S.h), S.h * sc + 0.5, S.h * sc + 0.5);
          if (mirror && b) c.fillRect(sx(S.u0 + (a - 0.5) * S.h), sy(-(S.v0 + (b - 0.5) * S.h)), S.h * sc + 0.5, S.h * sc + 0.5);
        }
      }
      if (el.meshT && el.meshT.length) {
        const segs = meshSections(el.meshT, [el.x, el.y, el.z], plane, slice);
        c.save(); c.strokeStyle = sel ? getCss('--jek-cyan') : 'rgba(0,0,0,0.7)'; c.lineWidth = sel ? 2 : 1; c.beginPath();
        for (const s of segs) { c.moveTo(sx(s[0]), sy(s[1])); c.lineTo(sx(s[2]), sy(s[3])); }
        c.stroke(); c.restore();
      }
    } else {
      const polys = polysAt(cyl && plane !== 'yz' ? 0 : slice);
      if (polys) { fill(polys, false); if (mirror) fill(polys, true); }
    }
  }
  // the electrodes' names and voltages
  c.save(); c.font = '600 11px ' + getCss('--jek-sans'); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = inkA(0.85);
  for (const el of project.electrodes) {
    if (el.on === false) continue;
    const [u, v] = uvOf([el.x, el.y, el.z]);
    const polys = el.shape === 'mesh' ? null : shapeSections(el, plane, cyl && plane !== 'yz' ? 0 : V().slice);
    let lu = u, lv = v;
    if (polys && polys[0]) { let su = 0, sv = 0, n = 0; for (const [a, b] of polys[0]) { su += a; sv += b; n++; } lu = su / n; lv = sv / n; if (polys.length > 1) lv = Math.max(...polys[0].map(p => p[1])); }
    const text = el.name + ' · ' + fmtVolt(el.V) + (el.rf && el.rf.on ? ' ± ' + fmtVolt(el.rf.amp) + ' RF' : '');
    c.fillText(text, sx(lu), sy(lv) - 10);
  }
  c.restore();
  // the analysis point
  if (project.point) { const [u, v] = uvOf(project.point); c.save(); c.strokeStyle = getCss('--jek-orange'); c.lineWidth = 1.5; c.beginPath(); c.moveTo(sx(u) - 7, sy(v)); c.lineTo(sx(u) + 7, sy(v)); c.moveTo(sx(u), sy(v) - 7); c.lineTo(sx(u), sy(v) + 7); c.stroke(); c.restore(); }
  // the trajectories
  if (show.traj && SIM.result) drawTrajectories(c);
  // the detectors
  for (const d of project.detectors) {
    if (d.on === false) continue;
    const sel = d.id === selectedId, ax = d.axis === 'x' ? 0 : d.axis === 'y' ? 1 : 2;
    c.save(); c.strokeStyle = sel ? getCss('--jek-cyan') : d.colour; c.lineWidth = sel ? 3 : 2; c.setLineDash(d.stop ? [] : [6, 4]);
    if (ax === ip) {
      // the plane is this cut: a frame
      const [cu, cv] = uvOf([d.x, d.y, d.z]), hw = d.half > 0 ? d.half : 1e4;
      c.strokeRect(sx(cu - hw), sy(cv + hw), 2 * hw * sc, 2 * hw * sc);
    } else {
      const along = ax === iu, hw = d.half > 0 ? d.half : 1e4, cc = uvOf([d.x, d.y, d.z]);
      c.beginPath();
      if (along) { c.moveTo(sx(d.at), sy(cc[1] - hw)); c.lineTo(sx(d.at), sy(cc[1] + hw)); } else { c.moveTo(sx(cc[0] - hw), sy(d.at)); c.lineTo(sx(cc[0] + hw), sy(d.at)); }
      c.stroke();
      c.font = '600 11px ' + getCss('--jek-sans'); c.fillStyle = d.colour; c.textAlign = along ? 'left' : 'center';
      c.fillText(d.name, along ? sx(d.at) + 4 : sx(cc[0]), along ? sy(Math.min(cc[1] + hw, wy(0) - 2)) + 14 : sy(d.at) - 6);
    }
    c.restore();
  }
  // the ion groups' starts
  for (const g of project.ions) {
    if (g.on === false) continue;
    const sel = g.id === selectedId, [u, v] = uvOf([g.x, g.y, g.z]);
    const az = g.dirAz * Math.PI / 180, el = g.dirEl * Math.PI / 180, d = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)], du = d[iu], dv = d[iv];
    c.save(); c.strokeStyle = sel ? getCss('--jek-cyan') : g.colour; c.fillStyle = g.colour; c.lineWidth = sel ? 3 : 2;
    const X = sx(u), Y = sy(v), L = 14;
    c.beginPath(); c.arc(X, Y, 4, 0, 2 * Math.PI); c.fill();
    c.beginPath(); c.moveTo(X, Y); c.lineTo(X + du * L, Y - dv * L); c.stroke();
    if (g.size > 0 && g.dist !== 'point') { c.setLineDash([3, 3]); c.beginPath(); if (g.dist === 'sphere' || g.dist === 'gauss') c.arc(X, Y, g.size * sc, 0, 2 * Math.PI); else { c.moveTo(X - dv * g.size * sc, Y - du * g.size * sc); c.lineTo(X + dv * g.size * sc, Y + du * g.size * sc); } c.stroke(); }
    c.font = '600 11px ' + getCss('--jek-sans'); c.textAlign = 'center'; c.fillStyle = inkA(0.85); c.fillText(g.name, X, Y + 16);
    c.restore();
  }
  drawScaleBar(c);
  if (!lastDrawn) { lastDrawn = true; drawnOnce(); }
}
/* the paths flown, projected onto the plane; coloured by group, energy or time */
function drawTrajectories(c) {
  const R = SIM.result, show = project.show, [iu, iv] = PLANES[V().plane];
  let keMax = 1e-9, tMax = 1e-9;
  if (show.colourBy !== 'group') for (const p of R.particles) { keMax = Math.max(keMax, p.ke0, p.end.ke); tMax = Math.max(tMax, p.end.t); }
  c.save(); c.lineWidth = 1.2; c.lineJoin = 'round';
  for (const p of R.particles) {
    const pts = p.pts, n = pts.length / 4;
    if (n < 2) continue;
    if (show.colourBy === 'group') {
      c.strokeStyle = (p.colour || '#e8402a') + 'cc'; c.beginPath();
      for (let i = 0; i < n; i++) { const X = sx([pts[4 * i], pts[4 * i + 1], pts[4 * i + 2]][iu]), Y = sy([pts[4 * i], pts[4 * i + 1], pts[4 * i + 2]][iv]); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }
      c.stroke();
    } else {
      // a colour a segment: the energy (from the start and end, linearly in time) or the time
      for (let i = 1; i < n; i++) {
        const t = pts[4 * i + 3], f = show.colourBy === 'time' ? t / tMax : (p.ke0 + (p.end.ke - p.ke0) * (t - p.t0) / Math.max(1e-12, p.end.t - p.t0)) / keMax;
        const col = viridis(clamp(f, 0, 1));
        c.strokeStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')'; c.beginPath();
        c.moveTo(sx([pts[4 * i - 4], pts[4 * i - 3], pts[4 * i - 2]][iu]), sy([pts[4 * i - 4], pts[4 * i - 3], pts[4 * i - 2]][iv]));
        c.lineTo(sx([pts[4 * i], pts[4 * i + 1], pts[4 * i + 2]][iu]), sy([pts[4 * i], pts[4 * i + 1], pts[4 * i + 2]][iv]));
        c.stroke();
      }
    }
    // where it ended
    const e = p.end, X = sx([e.x, e.y, e.z][iu]), Y = sy([e.x, e.y, e.z][iv]);
    c.fillStyle = e.why === 'splat' || e.why === 'start' ? '#d33' : e.why === 'det' ? '#2a7de8' : e.why === 'out' ? inkA(0.4) : '#e0a020';
    c.beginPath(); c.arc(X, Y, 2.2, 0, 2 * Math.PI); c.fill();
  }
  c.restore();
}
function drawScaleBar(c) {
  const mm = niceStep(90 / V().scale), px = mm * V().scale, x = 14, y = H - 16;
  c.save(); c.strokeStyle = inkA(0.7); c.fillStyle = inkA(0.8); c.lineWidth = 2;
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + px, y); c.moveTo(x, y - 4); c.lineTo(x, y + 4); c.moveTo(x + px, y - 4); c.lineTo(x + px, y + 4); c.stroke();
  c.font = '11px ' + getCss('--jek-mono'); c.textAlign = 'left'; c.textBaseline = 'bottom';
  c.fillText(mm >= 1 ? nf(mm) + ' mm' : nf(mm * 1000) + ' µm', x, y - 5);
  // the cut
  const [, , ip] = PLANES[V().plane], G = project.grid;
  c.textAlign = 'right'; c.fillText(G.sym === 'cyl' ? 'x–r plane (cylindrical)' : G.sym === 'planar' ? 'x–y plane (planar)' : V().plane.replace('', '').split('').join('–') + ' plane at ' + ['x', 'y', 'z'][ip] + ' = ' + nf(V().slice) + ' mm', W - 14, y);
  c.restore();
}
export function wireRender() {
  if (TEST_MODE) { /* no system theme changes to follow */ }
  applyTheme();
  new ResizeObserver(resize).observe(stage);
  if (typeof matchMedia !== 'undefined') matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  resize();
}
