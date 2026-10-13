import { drawAxisArrow, drawPlate } from '../render.js';
import { hitPlate } from './hits.js';
import { h, panel, param } from '../panel.js';

/* Faraday rotator on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/faraday.js */

export function faradayPanel(el) {
  const iso = el.type === 'isolator';
  panel.append(h('h3', null, iso ? 'Isolator' : 'Faraday rotator'));
  const rows = h('div', { class: 'rt-rows' }, param('Aperture (mm)', el, 'length'));
  if (iso) rows.append(param('Extinction (dB)', el, 'extinction'), param('Input polariser from p (°)', el, 'axis', { wide: true }));
  else rows.append(param('Rotation (°)', el, 'rotation'));
  panel.append(rows);
  panel.append(h('p', { style: 'margin-top:0.6rem' }, iso
    ? 'A polariser, a 45° Faraday rotator and a second polariser at 45° to the first. Light going the way of the arrow passes; light coming back is turned a further 45° and stopped, as far as the extinction ratio allows.'
    : 'Turns the polarisation by its rotation, the same way in the lab whichever way the light goes, so a double pass turns it twice as far rather than undoing it. That is what an isolator and a Faraday mirror are built on. The arrow is the direction of its magnetic field.'));
}

/* a Faraday rotator or an isolator: a plate with the arrow of its rotation */
export function drawFaraday(el, sel) {
  const { f, L, k } = drawPlate(el, sel, '#ff9f6b', 'rgba(255,159,107,0.18)', 2);
  drawAxisArrow(f, L, k, '#ff9f6b', el.type === 'isolator');
}

export const FARADAY_UI = {
  draw: drawFaraday, hit: hitPlate, panel: faradayPanel, rank: 1,
};
