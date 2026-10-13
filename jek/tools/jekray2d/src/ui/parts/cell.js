import { ATOMS } from '../../core/cells.js';
import { V } from '../../state/project.js';
import { frame } from '../../core/mask.js';
import { ctx, pathLocal, selInk } from '../render.js';
import { bindSync, h, panel, param, selectField, vs } from '../panel.js';
import { drawCellSpectrum, readoutBox } from '../panels.js';
import { plotSaveRow } from '../plots.js';

/* Vapour cell on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/cell.js */

/* a vapour cell: a glass tube along the beam, windows at its ends, faintly tinted */
function drawCell(el, sel) {
  const f = frame(el), L = el.length / 2, H = el.cellLen / 2, k = 1 / V().scale;
  pathLocal(f, [[-H, -L], [H, -L], [H, L], [-H, L]], true);
  ctx.fillStyle = 'rgba(199,155,255,0.13)'; ctx.fill();
  ctx.strokeStyle = sel ? selInk() : '#c79bff'; ctx.lineWidth = sel ? 2.2 : 1.3; ctx.stroke();
  for (const x of [-H, H]) { pathLocal(f, [[x - 1.2 * k, -L], [x + 1.2 * k, -L], [x + 1.2 * k, L], [x - 1.2 * k, L]], true); ctx.fillStyle = 'rgba(115,185,202,0.35)'; ctx.fill(); }
  // the stem where the metal sits
  pathLocal(f, [[-2.5, L], [2.5, L], [2.5, L + Math.min(8, L * 0.5)], [-2.5, L + Math.min(8, L * 0.5)]], true);
  ctx.strokeStyle = sel ? selInk() : '#c79bff'; ctx.lineWidth = 1.1; ctx.stroke();
}

function cellPanel(el) {
  panel.append(h('h3', null, 'Vapour cell'));
  panel.append(h('div', { class: 'rt-rows' },
    selectField('Atoms', Object.entries(ATOMS).map(([k, v]) => [k, v.name]), () => el.atom, v => { el.atom = v; }, { wide: true }),
    selectField('Line', [['D2', 'D2 (Rb 780, Cs 852, K 767 nm)'], ['D1', 'D1 (Rb 795, Cs 894, K 770 nm)']], () => el.line, v => { el.line = v; }, { wide: true }),
    param('Temperature (°C)', el, 'temp'), param('Length (mm)', el, 'cellLen'),
    param('Window (mm)', el, 'length'), param('Field (G)', el, 'bField')));
  panel.append(readoutBox('cell'));
  const vsEl = vs(el);
  vsEl.cellSpan = vsEl.cellSpan || 'all';
  const tabs = h('div', { class: 'rt-tabs', style: 'margin-top:0.6rem' });
  const cv = h('canvas', { height: '170', style: 'width:100%;display:block' });
  const draw = () => drawCellSpectrum(cv, el, vsEl.cellSpan);
  for (const [k, label] of [['all', 'Whole line'], ['laser', 'Round the laser']]) {
    const b = h('button', { class: 'rt-tab' + (vsEl.cellSpan === k ? ' on' : ''), type: 'button', onclick: () => { vsEl.cellSpan = k; [...tabs.children].forEach(x => x.classList.toggle('on', x === b)); draw(); } }, label);
    tabs.append(b);
  }
  panel.append(tabs, cv, plotSaveRow(cv));
  bindSync(cv, draw);
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Alkali vapour at the temperature set: its density from the vapour pressure, each hyperfine line of the D line with the Doppler width of the vapour and the natural width of the excited state (a Voigt profile), weighted by how many atoms sit in its lower level and how strong it is. The light is absorbed and delayed by the same lines, so a laser tuned through them sees the familiar Doppler-broadened dips, and a beam off to one side of a line picks up its phase. Tune the laser with its wavelength (a sweep scans it), or shift it with an AOM.'));
  panel.append(h('p', { class: 'note', style: 'margin-top:0.4rem' }, 'Saturation, worked out slice by slice along the cell and point by point across each beam: a beam bleaches the lines it is on where it is strong (its centre more than its edges, less as it fades), and a beam crossing the cell burns holes in the atoms\u2019 velocities for the others. Head on, a weak probe sees sub-Doppler Lamb dips at each transition and crossovers halfway between two that share a lower level; a pump a few milliradians off head-on broadens them (the atoms moving across it), one going the same way makes no narrow feature at all, and a probe only partly inside the pump, or crossing it at an angle, sees them only where the two overlap. The diffracted field and the photodiodes take all of this across the beam. The plot shows the weakest beam on its axis with the others scanning with it. The holes come from rate equations for each transition alone, with no optical pumping between levels: positions and widths are right, depths (crossovers above all) only roughly. No buffer gas, no windows.'));
  panel.append(h('p', { class: 'note', style: 'margin-top:0.4rem' }, 'A magnetic field along the cell (positive along its +x axis, as a solenoid or ring magnets would put it) splits each line into its Zeeman components, worked out exactly from the weak field through the Paschen\u2013Back regime by diagonalising each level\u2019s hyperfine and Zeeman energy. Light along the field drives \u03c3+ and \u03c3\u2212 transitions, so the two hands of circular light see lines shifted apart: the cell absorbs them differently (circular dichroism, the signal of a DAVLL lock: a quarter-wave plate at 45\u00b0 and a polarising cube after the cell, a detector on each port, their difference the error signal) and delays them differently (Faraday rotation: between crossed polarisers, a Faraday filter passing light only near the lines). With no field, a circularly polarised pump against the probe saturates one hand more than the other, which is polarisation spectroscopy (the probe through a polariser at 45\u00b0, or a cube with two detectors); that comes from saturation alone here, no optical pumping, so its shape is right and its size only roughly. \u03c0 transitions, which light along the field cannot drive, are left out. With a field, the plot shows each hand\u2019s transmission on its own: \u03c3+ in blue, \u03c3\u2212 in orange.'));
}

const hitCell = (el, lx, ly, tol) => Math.abs(lx) <= el.cellLen / 2 + tol && Math.abs(ly) <= el.length / 2 + tol;

export const CELL_UI = {
  draw: drawCell, hit: hitCell, panel: cellPanel, rank: 2,
};
