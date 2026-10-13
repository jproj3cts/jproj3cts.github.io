import { MOD_COLOURS } from '../../core/modulators.js';
import { V, deg } from '../../state/project.js';
import { frame, toWorld } from '../../core/mask.js';
import { ctx, pathLocal, selInk, sx, sy } from '../render.js';
import { hitThin } from './hits.js';
import { h, panel, param, selectField } from '../panel.js';

/* Waveplate on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/waveplate.js */

export function drawJones(el, sel) {
  const f = frame(el);
  const L = el.length / 2, k = 1 / V().scale;
  if (el.mod) {                                       // a mod's polarisation plate: a plate in its colour, no axis to show
    const col = MOD_COLOURS[el.mod.colour || 'grey'];
    pathLocal(f, [[-1.2 * k, -L], [1.2 * k, -L], [1.2 * k, L], [-1.2 * k, L]], true);
    ctx.fillStyle = col + '38'; ctx.fill(); ctx.strokeStyle = sel ? selInk() : col; ctx.lineWidth = sel ? 2.5 : 1.6; ctx.stroke();
    return;
  }
  pathLocal(f, [[-0.6 * k * 2, -L], [1.2 * k, -L], [1.2 * k, L], [-1.2 * k, L]], true);
  ctx.fillStyle = el.type === 'polariser' ? 'rgba(157,107,255,0.22)' : 'rgba(115,185,202,0.18)';
  ctx.fill();
  ctx.strokeStyle = sel ? selInk() : (el.type === 'polariser' ? '#b79bff' : '#73b9ca');
  ctx.lineWidth = sel ? 2.5 : 1.6;
  ctx.stroke();
  // a badge showing where the axis sits in the polarisation plane
  const [bx, by] = toWorld(f, 0, L + 9 * k);
  const X = sx(bx), Y = sy(by), r = 6;
  ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  const a = el.axis * deg;
  ctx.beginPath();
  ctx.moveTo(X - Math.cos(a) * r, Y + Math.sin(a) * r);
  ctx.lineTo(X + Math.cos(a) * r, Y - Math.sin(a) * r);
  ctx.strokeStyle = el.type === 'polariser' ? '#b79bff' : '#73b9ca';
  ctx.lineWidth = 2; ctx.stroke();
}

export function jonesPanel(el) {
  const wp = el.type === 'waveplate';
  panel.append(h('h3', null, wp ? 'Waveplate' : 'Polariser'));
  const rows = h('div', { class: 'rt-rows' },
    param('Aperture (mm)', el, 'length', { wide: true }),
    param(wp ? 'Fast axis from p (\u00b0)' : 'Transmission axis from p (\u00b0)', el, 'axis', { wide: true }));
  if (wp) {
    rows.append(selectField('Retardance', [['0.25', 'Quarter wave'], ['0.5', 'Half wave'], ['custom', 'Custom']],
      () => el.retardCustom ? 'custom' : String(el.retard),
      v => {
        if (v === 'custom') el.retardCustom = true;
        else { el.retardCustom = false; el.retard = +v; }
      }, { wide: true }));
    if (el.retardCustom) rows.append(param('Retardance (waves)', el, 'retard', { wide: true }));
  }
  panel.append(rows);
  panel.append(h('p', { style: 'margin-top:0.6rem' }, wp
    ? 'Rays pass straight through; only the polarisation changes. A quarter wave at 45\u00b0 turns linear light circular, and a half wave at \u03b8 rotates linear light by 2\u03b8. Retardance is taken as given at every wavelength.'
    : 'Passes the component along its axis and absorbs the rest. 0\u00b0 passes p, 90\u00b0 passes s.'));
}

export const WAVEPLATE_UI = {
  draw: drawJones, hit: hitThin, panel: jonesPanel, rank: 1, noModPanel: true,
};
