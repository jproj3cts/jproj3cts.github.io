import { cohModes, lagOf } from '../core/coherence.js';
import { project } from '../state/project.js';
import { fieldDec, lightOf } from '../state/elements.js';
import { sagFn } from '../core/geometry.js';
import { toLocal } from '../core/mask.js';
import { lastTrace } from './trace.js';
import { H, V, W, ctx, getCss, glowOp, lightLayer, mkCanvas, requestRender, wx, wy } from '../ui/render.js';
import { clamp } from '../ui/params.js';
import { benchFrame, fieldFrames } from '../ui/sweeps.js';
import { fmtLen } from '../ui/panel.js';
import { cx } from './cavity.js';
import { cutVec, popJ, popKeyOf, popSources, popState } from './beam-tree.js';
import { schedulePop } from '../ui/heavy.js';
import { fieldWorker, fwMismatch, fwRequest } from '../worker/field-worker.js';

/* ---------- The close-up: the field on each pixel ----------
   Zoomed in to a few tens of microns, every beam segment crossing the view is sampled at
   the pixels themselves. Over so short a stretch a beam's envelope, curvature and Gouy
   phase barely change, so each segment is cut at three places through the view and its
   envelope interpolated between them, while the fast phase e^{-iknz} is exact. The fields
   add as vectors, per launch: s out of the plane, p in it along each beam's own normal,
   so counter-propagating beams show their standing wave and crossing beams their fringes. */
const CLOSEUP_MM = 0.05;                 // view width below which the close-up takes over
export const CLOSEUP_STEP = 2;                  // CSS pixels per sample
const closeState = { key: '', img: null, info: null, step: 2, timer: null };
export let closeupOn = false;
export function setCloseupOn(v) { return (closeupOn = v); }

/* The segments of a field run that reach a window centred at (cx, cy) with half-size hw,
   each prepared with three cuts */
export function closeupPrep(segs, cx, cy, hw, tab) {
  const out = [];
  for (const sg of segs) {
    const b = sg.b, exx = -b.dy, exy = b.dx;
    if (tab && b.bench !== tab) continue;
    const rx = cx - b.x0, ry = cy - b.y0;
    const tc = rx * b.dx + ry * b.dy, xc = rx * exx + ry * exy;
    if (tc < -hw * 1.5 || tc > b.len + hw * 1.5) continue;
    const c1 = sg.leg.cutC(clamp(tc, 0, b.len));
    if (Math.abs(xc) > hw * 1.5 + c1.half) continue;
    // cuts along the beam through the view, close enough that its envelope (its Gouy phase and
    // its width, the fast phase taken off) is smooth between each and the next: an eighth of
    // its Rayleigh range (its pilot's, the smaller of the two axes'), at most 65
    const t0 = clamp(tc - hw, 0, b.len), t1 = clamp(tc + hw, 0, b.len), F0 = sg.F0 || {};
    const zRh = F0.ax ? Math.min(F0.ax.zR, F0.ay.zR) : F0.zR > 0 ? F0.zR : Math.PI * c1.w * c1.w * c1.k / (2 * Math.PI);
    const nc = t1 > t0 ? Math.min(65, Math.max(3, Math.ceil((t1 - t0) / (zRh / 8)) + 1)) : 1;
    const ts = nc === 1 ? [t0] : Array.from({ length: nc }, (_, i) => t0 + (t1 - t0) * i / (nc - 1));
    const cuts = ts.map(t => sg.leg.cutC(t));
    const J = popJ(b);
    out.push({ b, i: sg.i, parent: b.parent, ts, cuts, k: c1.k, J, par: b.par, ex: [exx, exy], colour: b.colour, coh: sg.coh, bounds: closeupBounds(b), reach: 4 * c1.w,
      src: sg.src, L: (b.gpl || 0) + (b.ng || b.n) * clamp(tc, 0, b.len) + lagOf(sg.src) });
  }
  closeupLaunches(out);
  return out;
}
/* The launches the prepared segments add in, numbered: a launch whose light coheres over
   its paths only in part is split into its incoherent parts (cohModes). Each segment gets
   vl, pairs of [launch number, weight], and the list of the launches' colours. */
function closeupLaunches(parts) {
  const byL = new Map(), cols = [];
  for (const P of parts) { if (!byL.has(P.coh)) byL.set(P.coh, []); byL.get(P.coh).push(P); }
  for (const Ps of byL.values()) {
    for (const P of Ps) P.vl = [];
    const cm = cohModes(Ps[0].src, Ps.map(P => P.L));
    for (const c of cm || [null]) {
      Ps.forEach((P, i) => { if (!c || c[i]) P.vl.push(cols.length, c ? c[i] : 1); });
      cols.push(Ps[0].colour);
    }
  }
  parts.cols = cols;
  return parts;
}
/* One segment's complex field at a world point, or null where it does not run */
/* Which side of a surface a point is on, in the bench plane: +1 or -1, 0 on it */
function surfSide(s, X, Y) {
  const [lx, ly] = toLocal(s.f, X, Y);
  const v = lx - s.z - (s.flat ? 0 : sagFn(s, clamp(ly, -s.semi, s.semi)));
  return Math.abs(v) < 1e-9 ? 0 : Math.sign(v);
}
/* The sides of its start and end surfaces a segment's light is on; near a tilted surface
   these, not the planes square to the beam, bound where it runs */
function closeupBounds(b) {
  const d = 1e-4, S = b.ev && b.ev.surf, E = b.endSurf;
  return {
    start: S && S.f ? [S, surfSide(S, b.x0 + b.dx * d, b.y0 + b.dy * d)] : null,
    end: E && E.f ? [E, surfSide(E, b.x0 + b.dx * (b.len - d), b.y0 + b.dy * (b.len - d))] : null,
  };
}
function closeupSeg(P, X, Y) {
  const b = P.b, rx = X - b.x0, ry = Y - b.y0;
  const t = rx * b.dx + ry * b.dy;
  const B = P.bounds;
  if (B.start) { const sd = surfSide(B.start[0], X, Y); if (sd && sd !== B.start[1]) return null; }
  else if (t < -1e-9) return null;
  if (B.end) { const sd = surfSide(B.end[0], X, Y); if (sd && sd !== B.end[1]) return null; }
  else if (t > b.len + 1e-9) return null;
  if (t < -P.reach || t > b.len + P.reach) return null;    // well past its ends: not this segment's light
  const x = rx * P.ex[0] + ry * P.ex[1];
  // envelope at each cut, with the fast phase taken off, then Lagrange through the four cuts
  // nearest (a cubic between each pair); both components, s and p, each with its
  // polarisation (from the field, or the Jones vector)
  const acc = [0, 0, 0, 0];
  const N = P.ts.length;
  let j0 = 0; while (j0 < N - 2 && P.ts[j0 + 1] < t) j0++;
  const lo = Math.max(0, Math.min(j0 - 1, N - 4)), hi = Math.min(N, lo + 4);
  for (let j = lo; j < hi; j++) {
    let l = 1;
    for (let m = lo; m < hi; m++) if (m !== j) l *= (t - P.ts[m]) / (P.ts[j] - P.ts[m]);
    const v = cutVec(P.cuts[j], x, P.J, P.par), ph = P.k * P.ts[j], c = Math.cos(ph), s = Math.sin(ph);
    acc[0] += l * (v[0] * c - v[1] * s); acc[1] += l * (v[0] * s + v[1] * c);
    acc[2] += l * (v[2] * c - v[3] * s); acc[3] += l * (v[2] * s + v[3] * c);
  }
  const ph = -P.k * t, c = Math.cos(ph), s = Math.sin(ph);
  return [acc[0] * c - acc[1] * s, acc[0] * s + acc[1] * c, acc[2] * c - acc[3] * s, acc[2] * s + acc[3] * c];
}
/* Intensity and its parts at a world point from prepared segments, fields added per launch */
export function closeupAt(parts, X, Y) {
  const acc = new Map();
  for (const P of parts) {
    const e = closeupSeg(P, X, Y);
    if (!e) continue;
    for (let q = 0; q < P.vl.length; q += 2) {
      const id = P.vl[q], c = P.vl[q + 1];
      let A = acc.get(id);
      if (!A) acc.set(id, A = { zr: 0, zi: 0, xr: 0, xi: 0, yr: 0, yi: 0, inc: 0, colour: P.colour });
      const sr = c * e[0], si = c * e[1], pr = c * e[2], pi = c * e[3];
      A.zr += sr; A.zi += si;                               // s: out of the bench plane
      A.xr += pr * P.ex[0]; A.xi += pi * P.ex[0];           // p: in it, along the beam's own normal
      A.yr += pr * P.ex[1]; A.yi += pi * P.ex[1];
      A.inc += sr * sr + si * si + pr * pr + pi * pi;
    }
  }
  let I = 0, inc = 0;
  const byColour = [];
  for (const A of acc.values()) {
    const v = A.zr ** 2 + A.zi ** 2 + A.xr ** 2 + A.xi ** 2 + A.yr ** 2 + A.yi ** 2;
    I += v; inc += A.inc; byColour.push([A.colour, v]);
  }
  return { I, inc, byColour };
}

/* Draws the close-up; returns true when it has taken over from the ordinary overlay. A new
   view is drawn coarse first, then refined once it has been still for a moment. */
export function drawCloseup() {
  const s = V().scale, wmm = W / s;
  if (wmm >= CLOSEUP_MM) return false;
  const srcs = popSources();
  if (!srcs.length) return false;
  const key = popKeyOf(lastTrace.beams, srcs);
  if (key !== popState.key && fieldFrames.bench.has(key)) { popState.key = key; popState.result = benchFrame(key); popState.job = null; }
  if (key !== popState.key || !popState.result) { schedulePop(); return false; }
  const vkey = closeupKey(key);
  // a sweep rendered ahead has this frame's close-up already
  const pre = closeState.key !== vkey && fieldFrames.closeup.get(vkey);
  if (pre) { Object.assign(closeState, pre, { key: vkey, asked: vkey }); clearTimeout(closeState.timer); }
  if (closeState.key !== vkey && closeState.asked !== vkey) {
    closeState.asked = vkey;
    closeupCompute(vkey, srcs, 2 * CLOSEUP_STEP);
    clearTimeout(closeState.timer);
    closeState.timer = setTimeout(() => {
      if (closeState.asked === vkey && !(closeState.key === vkey && closeState.step <= CLOSEUP_STEP)) { closeupCompute(vkey, srcs, CLOSEUP_STEP); requestRender(); }
    }, 180);
  }
  // until the new one is ready (from the field worker), the last image, put where its view was
  if (!closeState.img) return false;
  const v0 = closeState.view, k = s / v0.s;
  ctx.save();
  ctx.globalCompositeOperation = glowOp();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(closeState.img, W / 2 + (v0.cx - V().cx) * s - v0.W / 2 * k, H / 2 - (v0.cy - V().cy) * s - v0.H / 2 * k,
    closeState.img.width * closeState.step * k, closeState.img.height * closeState.step * k);
  ctx.restore();
  const inf = closeState.info;
  ctx.fillStyle = lightLayer ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.75)';
  ctx.font = '11px ' + getCss('--jek-mono');
  ctx.textAlign = 'left';
  ctx.fillText('Close-up: the field on each pixel' + (inf.beams ? ', ' + inf.beams + ' beam' + (inf.beams === 1 ? '' : 's') : ', no beam here') +
    (inf.contrast !== null && inf.beams > 1 ? ' \u00b7 fringe contrast ' + inf.contrast.toFixed(3) : '') +
    (inf.lamN ? ' \u00b7 \u03bb/2n = ' + fmtLen(inf.lamN / 2) : ''), 14, closeupCaptionY());
  return true;
}
export const closeupKey = key => key.length + '|' + key.slice(0, 64) + '|' + [project.tab, V().cx, V().cy, V().scale, W, H].join(',');
export const closeupOnShow = () => W / V().scale < CLOSEUP_MM && popSources().length > 0;
/* a close-up for the sweep's frames: the current view, its field, stored as drawCloseup keeps it */
export function closeupFrame(r, step) {
  const cv = mkCanvas(r.img.width, r.img.height);
  cv.getContext('2d').putImageData(r.img, 0, 0);
  return { img: cv, step, info: r.info, view: { cx: V().cx, cy: V().cy, s: V().scale, W, H, tab: project.tab } };
}
/* the close-up's caption: just below the bench tabs, which sit over the top left corner */
const closeupCaptionY = () => { const tb = document.getElementById('benchTabs'); return (tb && tb.offsetHeight ? tb.offsetHeight : 0) + 18; };
function closeupCompute(vkey, srcs, step) {
  const view = { cx: V().cx, cy: V().cy, s: V().scale, W, H, tab: project.tab }, log = fieldDec(lightOf().scale);
  const done = r => {
    const cv = mkCanvas(r.img.width, r.img.height);
    cv.getContext('2d').putImageData(r.img, 0, 0);
    Object.assign(closeState, { key: vkey, img: cv, step, info: r.info, view });
  };
  if (fieldWorker()) {
    fwRequest('closeup', 'closeup' + step, { key: popState.key, view, step, log }).then(r => {
      // a coarse answer never replaces a fine one of the same view
      if (!r || r.mismatch) {                       // dropped: ask again
        if (r) fwMismatch(false);
        if (closeState.asked === vkey && closeState.key !== vkey) { closeState.asked = null; requestRender(); }
        return;
      }
      fwMismatch(true);
      if (closeState.asked !== vkey || (closeState.key === vkey && closeState.step <= step)) return;
      done(r); requestRender();
    }).catch(() => { closeState.asked = null; requestRender(); });
    return;
  }
  done(closeupImage(popState.result.segs, view, step, log));
}
/* The close-up's pixels for a view ({cx, cy, s, W, H}), one sample every step CSS pixels */
export function closeupImage(segs, view, step, log) {
  const s = view.s, W = view.W, H = view.H, hw = 0.5 * Math.hypot(W, H) / s;
  const wx = px => view.cx + (px - W / 2) / s, wy = py => view.cy - (py - H / 2) / s;
  const parts = closeupPrep(segs, view.cx, view.cy, hw, view.tab);
  // launches in a fixed order (closeupLaunches), so each pixel adds into plain arrays
  const nL = parts.cols.length, acc = new Float64Array(nL * 6);
  const probe = mkCanvas(1, 1).getContext('2d');
  const launchCol = parts.cols.map(col => { probe.fillStyle = col; const h2 = probe.fillStyle; return [1, 3, 5].map(i => parseInt(h2.slice(i, i + 2), 16)); });
  const nx = Math.ceil(W / step), ny = Math.ceil(H / step);
  const I = new Float32Array(nx * ny), INC = new Float32Array(nx * ny), RGB = new Float32Array(nx * ny * 3);
  let pk = 0, iMax = 0;
  for (let j = 0; j < ny; j++) {
    const Y = wy((j + 0.5) * step);
    for (let i = 0; i < nx; i++) {
      const X = wx((i + 0.5) * step);
      acc.fill(0);
      let inc = 0;
      for (const P of parts) {
        const e = closeupSeg(P, X, Y);
        if (!e) continue;
        const sr = e[0], si = e[1], pr = e[2], pi = e[3], vl = P.vl;
        for (let q = 0; q < vl.length; q += 2) {
          const o = vl[q] * 6, c = vl[q + 1];
          acc[o] += c * sr; acc[o + 1] += c * si;                                      // s, out of the plane
          acc[o + 2] += c * pr * P.ex[0]; acc[o + 3] += c * pi * P.ex[0];              // p, along the beam's own normal
          acc[o + 4] += c * pr * P.ex[1]; acc[o + 5] += c * pi * P.ex[1];
        }
        inc += sr * sr + si * si + pr * pr + pi * pi;
      }
      let v = 0, R = 0, G = 0, Bc = 0;
      for (let L = 0; L < nL; L++) {
        const o = L * 6, u = acc[o] ** 2 + acc[o + 1] ** 2 + acc[o + 2] ** 2 + acc[o + 3] ** 2 + acc[o + 4] ** 2 + acc[o + 5] ** 2;
        v += u; R += launchCol[L][0] * u; G += launchCol[L][1] * u; Bc += launchCol[L][2] * u;
      }
      const q = j * nx + i;
      I[q] = v; INC[q] = inc;
      if (v > 0) { RGB[q * 3] = R / v; RGB[q * 3 + 1] = G / v; RGB[q * 3 + 2] = Bc / v; }
      if (v > pk) pk = v;
      if (inc > iMax) iMax = inc;
    }
  }
  // fringe contrast where the light is: how far the coherent sum strays from the beams' own
  // intensities added, 2ab/(a² + b²) for two; nothing for one beam, whatever its envelope
  let vis = 0;
  for (let q = 0; q < nx * ny; q++) if (INC[q] >= 0.5 * iMax && INC[q] > 0) vis = Math.max(vis, Math.abs(I[q] / INC[q] - 1));
  // the beams: a segment carrying straight on from another in view (through a screen that lets
  // the light by, a window square to it) is the same beam
  // the same beam (its modes of an M² above 1 too)
  const beams = new Set(parts.filter(P => !parts.some(Q => Q.i === P.parent && Math.abs(Q.b.dx - P.b.dx) + Math.abs(Q.b.dy - P.b.dy) < 1e-9)).map(P => P.i)).size;
  const img = new ImageData(nx, ny);
  for (let q = 0; q < nx * ny; q++) {
    let v = pk > 0 ? I[q] / pk : 0;
    if (log) v = Math.max(0, 1 + Math.log10(Math.max(v, 1e-12)) / log);
    img.data[q * 4] = RGB[q * 3]; img.data[q * 4 + 1] = RGB[q * 3 + 1]; img.data[q * 4 + 2] = RGB[q * 3 + 2];
    img.data[q * 4 + 3] = Math.round(255 * Math.min(1, v));
  }
  return { img, info: { contrast: iMax > 0 ? Math.min(1, vis) : null, beams,
    lamN: parts.length ? 2 * Math.PI / parts[0].k : null } };
}
