import { FILTER_TYPES, filterT } from '../../core/crystals.js';
import { C_NM_GHZ, MESH_TYPES, meshGrating } from '../../core/rf.js';
import { benchNms } from '../../state/elements.js';
import { drawPlate, filterColour } from '../render.js';
import { hitPlate } from './hits.js';
import { h, panel, param, selectField } from '../panel.js';
import { readoutBox } from '../panels.js';
import { changed } from '../actions.js';
import { checkpoint } from '../tabs.js';

/* Filter on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/filter.js */

function filterPanel(el) {
  if (el.ftype === 'mesh') { meshPanel(el); return; }
  panel.append(h('h3', null, 'Filter'));
  const rows = h('div', { class: 'rt-rows' },
    selectField('Type', Object.entries(FILTER_TYPES), () => el.ftype, v => { el.ftype = v; }, { wide: true }));
  if (el.ftype === 'longpass' || el.ftype === 'shortpass') rows.append(param('Edge (nm)', el, 'edge'), param('10–90% (nm)', el, 'slope'));
  if (el.ftype === 'bandpass') rows.append(param('Centre (nm)', el, 'centre'), param('FWHM (nm)', el, 'fwhm'));
  if (el.ftype === 'nd') rows.append(param('Optical density', el, 'od'));
  else rows.append(param('Peak T (%)', el, 'tmax'));
  rows.append(param('Aperture (mm)', el, 'length'));
  panel.append(rows);
  const rf = h('input', { type: 'checkbox' });
  rf.checked = el.reflect;
  rf.addEventListener('change', () => { checkpoint(); el.reflect = rf.checked; changed(false); });
  panel.append(h('label', { class: 'rt-check', style: 'margin-top:0.5rem' }, rf, 'Reflect what it blocks (a dichroic)'));
  panel.append(readoutBox('filter'));
}

function drawFilter(el, sel) { const c = filterColour(el); drawPlate(el, sel, c, c + '33'); }

export const FILTER_UI = {
  draw: drawFilter, hit: hitPlate, panel: filterPanel, rank: 1,
};

/* a metal mesh: its kind and geometry, and what it passes at the bench's frequency */
function meshPanel(el) {
  panel.append(h('h3', null, 'Mesh filter'));
  const res = el.mesh === 'bandpass' || el.mesh === 'bandstop';
  const rows = h('div', { class: 'rt-rows' },
    selectField('Mesh', Object.entries(MESH_TYPES), () => el.mesh, v => { el.mesh = v; }, { wide: true }));
  if (res) rows.append(param('Centre (GHz)', el, 'meshF0'), param('Q', el, 'meshQ'));
  else rows.append(param('Period g (mm)', el, 'meshG'), param(el.mesh === 'capacitive' ? 'Gap 2a (mm)' : 'Line 2a (mm)', el, 'meshA'));
  rows.append(param('Loss (dB)', el, 'meshLoss'), param('Aperture (mm)', el, 'length'));
  panel.append(rows);
  const nm = benchNms()[0], T = filterT(el, nm);
  panel.append(h('div', { class: 'rt-readout' }, h('table', null, h('tbody', null,
    h('tr', null, h('td', null, 'At ' + (+(C_NM_GHZ / nm).toPrecision(4)) + ' GHz'), h('td', null, 'passes ' + (100 * T).toPrecision(3) + ' % (' + (10 * Math.log10(Math.max(1e-12, T))).toFixed(2) + ' dB), reflects the rest'))))));
  if (meshGrating(el, nm)) panel.append(h('p', { class: 'rt-assumed' }, 'Its period is more than the wavelength: the mesh diffracts, which the model does not follow; the figures hold for g < \u03bb.'));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, res
    ? 'A resonant mesh (crosses, or cross-shaped slots) is a tuned circuit across the line: |t|\u00b2 = 1/(1 + Q\u00b2(f/f\u2080 \u2212 f\u2080/f)\u00b2) for the band-pass, one less that for the band-stop. Its centre and Q come from the cross\u2019s size and arms; set them from the maker\u2019s curve.'
    : 'In the non-diffracting region a mesh is a lumped element across the line (Ulrich 1967): a grid of square holes a shunt inductance L = ln csc(\u03c0a/g), passing 1/(1 + 1/(4\u03c9\u00b2L\u00b2)) with \u03c9 = g/\u03bb, so the long waves are reflected; free-standing squares a shunt capacitance C = 4 ln csc(\u03c0a/g), passing 1/(1 + \u03c9\u00b2C\u00b2/4), so the short waves are. What it does not pass it reflects, but for its loss.'));
  panel.append(readoutBox('filter'));
}
