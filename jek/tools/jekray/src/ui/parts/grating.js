import { V } from '../../state/project.js';
import { frame } from '../../core/mask.js';
import { ctx, pathLocal, selInk } from '../render.js';
import { hitPlate } from './hits.js';
import { h, panel, param, selectField } from '../panel.js';
import { readoutBox } from '../panels.js';

/* Grating on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/grating.js */

function drawGrating(el, sel) {
  const f = frame(el), L = el.length / 2, k = 1 / V().scale, refl = el.mode === 'reflect';
  // substrate behind a reflection grating, thin plate for a transmission one
  const back = refl ? -Math.max(2, 6 * k) : -1.2 * k;
  pathLocal(f, [[back, -L], [0, -L], [0, L], [back, L]], true);
  ctx.fillStyle = refl ? 'rgba(216,222,227,0.14)' : 'rgba(115,185,202,0.14)'; ctx.fill();
  ctx.strokeStyle = sel ? selInk() : '#d8dee3'; ctx.lineWidth = sel ? 2.2 : 1.4; ctx.stroke();
  // grooves on the working face
  const n = Math.max(4, Math.min(60, Math.round(2 * L * V().scale / 5))), pts = [];
  for (let i = 0; i <= n; i++) { const y = -L + 2 * L * i / n; pts.push([0, y]); if (i < n) pts.push([2.5 * k, y + 2 * L / n * 0.8]); }
  pathLocal(f, pts);
  ctx.strokeStyle = sel ? selInk() : '#c9a6ff'; ctx.lineWidth = 1.2; ctx.stroke();
}

function gratingPanel(el) {
  panel.append(h('h3', null, 'Grating'));
  panel.append(h('div', { class: 'rt-rows' },
    selectField('Type', [['reflect', 'Reflection'], ['transmit', 'Transmission']], () => el.mode, v => { el.mode = v; }, { wide: true }),
    param('Lines per mm', el, 'lpmm'), param('Width (mm)', el, 'length'),
    param('Blaze (nm)', el, 'blaze'), param('Efficiency (%)', el, 'eff')));
  panel.append(readoutBox('grating'));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Each ray leaves in every order that can propagate, along the grating equation sinθₘ = sinθᵢ + mλ/d, each carrying its share of the power; the diffracted field follows each order the same way. The grooves are a sawtooth blazed for the blaze wavelength in order +1, so that is where the power goes there, falling off either side. Peak efficiency covers what the real surface absorbs and scatters.'));
}

const hitGrating = (el, lx, ly, tol) => hitPlate(el, lx, ly, tol, el.mode === 'reflect' ? Math.max(2, 6 / V().scale) : 0.4);

export const GRATING_UI = {
  draw: drawGrating, hit: hitGrating, panel: gratingPanel, rank: 2,
};
