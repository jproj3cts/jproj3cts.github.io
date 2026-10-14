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

/* Screen on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/screen.js */

function drawScreen(el, sel) {
  const f = frame(el);
  const [surf] = elementSurfaces(el);
  const L = surf.semi;
  pathLocal(f, surfPoints(surf, 48, false, f));
  ctx.strokeStyle = sel ? selInk() : getCss('--rt-screen');
  ctx.lineWidth = sel ? 4 : 3.5;
  ctx.stroke();
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

function screenPanel(el) {
  if (readoutTabs(el, [['params', 'Screen'], ['rays', 'Rays'], ['aber', 'Aberrations'], ['plots', 'Diffraction'], ['pulse', 'Pulse'], ['trap', 'Trap'], ...(modReadouts('screen').length ? [['mods', 'Modules']] : [])])) return;
  screenParams(el);
}

export const SCREEN_UI = {
  draw: drawScreen, hit: hitSurface, panel: screenPanel, rank: 1,
};
