import { FILTER_TYPES } from '../../core/crystals.js';
import { drawPlate, filterColour } from '../render.js';
import { hitPlate } from './hits.js';
import { h, panel, param, selectField } from '../panel.js';
import { readoutBox } from '../panels.js';
import { changed } from '../actions.js';
import { checkpoint } from '../tabs.js';

/* Filter on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/filter.js */

function filterPanel(el) {
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
