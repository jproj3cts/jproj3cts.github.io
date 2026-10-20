import { MOD_COLOURS } from '../../core/modulators.js';
import { V, deg } from '../../state/project.js';
import { frame, toWorld } from '../../core/mask.js';
import { ctx, pathLocal, selInk, sx, sy } from '../render.js';
import { hitThin } from './hits.js';
import { h, panel, param, selectField } from '../panel.js';
import { C_NM_GHZ, gridCoef } from '../../core/rf.js';
import { benchNms } from '../../state/elements.js';

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
  if (el.grid) {
    // a wire grid: its wires, as ticks along the plate (upright wires seen end on as dots)
    const up = Math.abs(((el.axis % 180) + 180) % 180 - 90) >= 45, n = Math.max(6, Math.min(40, Math.round(el.length / 4)));
    ctx.strokeStyle = sel ? selInk() : '#d9cfff'; ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) { const y = -L + 2 * L * i / n; pathLocal(f, up ? [[-1.2 * k, y], [1.2 * k, y]] : [[-2.4 * k, y], [2.4 * k, y]]); ctx.stroke(); }
    if (!up) { pathLocal(f, [[0, -L], [0, L]]); ctx.lineWidth = 2; ctx.stroke(); }
  }
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
  if (el.grid) { gridPanel(el); return; }
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

/* a wire grid: its pitch and wires, which way they run, and what it does to the light at the bench's frequency */
function gridPanel(el) {
  panel.append(h('h3', null, 'Wire grid'));
  const up = Math.abs(((el.axis % 180) + 180) % 180 - 90) >= 45;
  panel.append(h('div', { class: 'rt-rows' },
    param('Aperture (mm)', el, 'length'),
    selectField('Wires', [['0', 'Upright, across the bench (reflect s)'], ['90', 'In the bench plane (reflect p)']], () => (up ? '0' : '90'), v => { el.axis = +v; }),
    param('Pitch g (mm)', el, 'grid.g'), param('Wire radius a (mm)', el, 'grid.a')));
  const nm = benchNms()[0], G = gridCoef(el.grid, nm, 1, !up), pc = v => (100 * v).toPrecision(3) + ' %';
  panel.append(h('div', { class: 'rt-readout' },
    h('table', null, h('tbody', null,
      h('tr', null, h('td', null, 'At ' + (+(C_NM_GHZ / nm).toPrecision(4)) + ' GHz, square on'), h('td', null, '')),
      h('tr', null, h('td', null, 'Along the wires: reflected'), h('td', null, pc(G.Rpar) + ' (' + (10 * Math.log10(Math.max(1e-12, 1 - G.Rpar))).toFixed(1) + ' dB leaks through)')),
      h('tr', null, h('td', null, 'Across the wires: passed'), h('td', null, pc(1 - G.Rperp) + ' (' + (10 * Math.log10(Math.max(1e-12, G.Rperp))).toFixed(1) + ' dB reflected)')),
      h('tr', null, h('td', null, 'Filling 2a/g'), h('td', null, (2 * el.grid.a / el.grid.g).toPrecision(3)))))));
  if (G.grating) panel.append(h('p', { class: 'rt-assumed' }, 'Its pitch is more than the wavelength: the grid diffracts as a grating, which the model does not follow; the figures above hold for g < \u03bb.'));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'A grid of round wires: the field along the wires sees them as a shunt inductance across the line, X = (g/2\u03bb) X\u2099(2a/g), and is reflected 1/(1 + 4X\u00b2); the field across them sees a small capacitance and passes, leaking B\u00b2/(4 + B\u00b2). Met at an angle, the wires\u2019 reactance scales with the wave impedance (cos \u03b8 for upright wires, 1/cos \u03b8 for wires in the plane). Lossless; valid while g < \u03bb. Chuss et al. 2012, after Marcuvitz.'));
}
