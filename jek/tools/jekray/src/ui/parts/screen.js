import { V } from '../../state/project.js';
import { dsagFn, sagFn } from '../../core/geometry.js';
import { elementSurfaces } from '../../core/stl.js';
import { frame, toWorld } from '../../core/mask.js';
import { lastTrace } from '../../engines/trace.js';
import { ctx, getCss, pathLocal, selInk, surfPoints, sx, sy } from '../render.js';
import { modReadouts } from '../../engines/mods.js';
import { hitSurface } from './hits.js';
import { readoutTabs, screenParams } from '../panels.js';
import { screenStats } from '../../engines/screen-stats.js';
import { phosphorColumns } from '../phosphor.js';
import { phosphorLook } from '../../engines/phosphor.js';

/* Screen on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/screen.js */

function drawScreen(el, sel) {
  const f = frame(el);
  const [surf] = elementSurfaces(el);
  const L = surf.semi;
  pathLocal(f, surfPoints(surf, 48, false, f));
  // a phosphor screen is its glow's colour, dimmed: lit, the glow is laid along it (below)
  ctx.strokeStyle = sel ? selInk() : el.phosphor ? el.glow + '66' : getCss('--rt-screen');
  ctx.lineWidth = sel ? 4 : 3.5;
  ctx.stroke();
  if (el.phosphor) drawGlow(el, f, surf);
  // ticks on the detecting face
  const k = 1 / V().scale;
  const nT = Math.max(3, Math.round(el.length * V().scale / 9));
  ctx.strokeStyle = 'rgba(255,179,71,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= nT; i++) {
    const y = L * (2 * i / nT - 1);
    const x = sagFn(surf, y);
    const [ax, ay] = toWorld(f, x, y), [bx, by] = toWorld(f, x + 5 * k, y);
    ctx.moveTo(sx(ax), sy(ay)); ctx.lineTo(sx(bx), sy(by));
  }
  ctx.stroke();
  // mark the hits
  const hits = lastTrace.screens[el.id] || [];
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const t of hits) {
    if (t.chief) continue;
    const [x1, y1] = toWorld(f, sagFn(surf, t.y), t.y);
    ctx.fillRect(sx(x1) - 1.5, sy(y1) - 1.5, 3, 3);
  }
  // the intensity profile, coherently summed, drawn behind the screen
  const st = screenStats(el);
  if (st && st.profile && st.profile.max > 0) {
    const P = st.profile, k = 1 / V().scale;
    // as tall as the light is strong: a beam 40 dB down gets a sliver, not a full plot of its own
    const depth = 46 * k * Math.max(0.12, 1 + Math.log10(Math.max(1e-9, (st.power || 0) / 100)) / 3);
    ctx.beginPath();
    // from the baseline, along the profile, back to the baseline: a closed plot
    const at = (y, v) => { const m = dsagFn(surf, y), nl = Math.hypot(1, m), off = -(4 * k + depth * v); const [wx0, wy0] = toWorld(f, sagFn(surf, y) + off / nl, y - off * m / nl); return [sx(wx0), sy(wy0)]; };
    const base0 = at(P.lo, 0), base1 = at(P.hi, 0);
    ctx.moveTo(base0[0], base0[1]);
    for (let i = 0; i < P.nb; i++) {
      const y = P.lo + (P.hi - P.lo) * (i + 0.5) / P.nb;
      const v = P.binC[i] / P.max;
      // stand the plot off along the local normal, so it follows a curved screen
      const m = dsagFn(surf, y);
      const nl = Math.hypot(1, m);
      const off = -(4 * k + depth * v);
      const [wx0, wy0] = toWorld(f, sagFn(surf, y) + off / nl, y - off * m / nl);
      const X = sx(wx0), Y = sy(wy0);
      ctx.lineTo(X, Y);
    }
    ctx.lineTo(base1[0], base1[1]);
    ctx.fillStyle = 'rgba(255,179,71,0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,179,71,0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/* a phosphor screen's glow along its face: each stretch as bright as the brightest of the face above and below it,
   drawn as light (added, not painted over) */
function drawGlow(el, f, surf) {
  const C = phosphorColumns(el);
  if (!C) return;
  const n = C.length, L = surf.semi, was = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = el.glow; ctx.lineCap = 'butt';
  for (const [wd, a] of [[14, 0.25], [7, 0.55], [3.5, 1]]) {
    ctx.lineWidth = wd;
    for (let i = 0; i < n; i++) {
      const v = phosphorLook(C[i]);
      if (v <= 0.01) continue;
      const y0 = Math.max(-L, -el.length / 2 + i * el.length / n), y1 = Math.min(L, -el.length / 2 + (i + 1) * el.length / n);
      if (y1 <= y0) continue;
      const [ax, ay] = toWorld(f, sagFn(surf, y0), y0), [bx, by] = toWorld(f, sagFn(surf, y1), y1);
      ctx.globalAlpha = a * v;
      ctx.beginPath(); ctx.moveTo(sx(ax), sy(ay)); ctx.lineTo(sx(bx), sy(by)); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = was;
}

function screenPanel(el) {
  if (readoutTabs(el, [['params', 'Screen'], ['rays', 'Rays'], ['aber', 'Aberrations'], ['plots', 'Diffraction'], ['pulse', 'Pulse'], ['trap', 'Trap'], ...(modReadouts('screen').length ? [['mods', 'Modules']] : [])])) return;
  screenParams(el);
}

export const SCREEN_UI = {
  draw: drawScreen, hit: hitSurface, panel: screenPanel, rank: 1,
};
