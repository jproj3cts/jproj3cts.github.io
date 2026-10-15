import { drawPlate } from '../render.js';
import { hitPlate } from './hits.js';
import { h, panel, param } from '../panel.js';
import { readoutBox } from '../panels.js';

/* Gain medium on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/gain.js */

function gainPanel(el) {
  panel.append(h('h3', null, 'Gain medium'));
  panel.append(h('div', { class: 'rt-rows' },
    param('Gain a pass (×)', el, 'g0'), param('Aperture (mm)', el, 'length'),
    param('Line centre (nm)', el, 'centre'), param('FWHM (nm)', el, 'fwhm'),
    param('Saturation intensity (kW/cm\u00b2)', el, 'isat', { wide: true })));
  panel.append(readoutBox('gain'));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Multiplies the power of light crossing it, most at its line centre and less away from it: the gain a pass is the small-signal gain, which the pump sets. In a cavity, the cavity card (on each of its elements) shows whether the round trip gains more than it loses. Above threshold it lases, and the gain saturates until the round trip is exactly one: the card gives the circulating power, the power leaving through each partly transmitting mirror and the best output coupler, and the output leaves those mirrors as a beam on the bench. Saturation is that of a homogeneous line, every beam through the gain saturating it together (Rigrod\u2019s analysis, exact at any gain and coupling), with the power set by the saturation intensity over the cavity mode\u2019s area at the gain (Nd:YAG 2.9 kW/cm\u00b2, Ti:sapphire 200, Yb:YAG 10); 0 turns it off. The laser runs on one mode at the seed\u2019s wavelength: put the seed on the gain line.'));
}

function drawGain(el, sel) { drawPlate(el, sel, '#ff6a3d', 'rgba(255,106,61,0.28)', 2.2); }

export const GAIN_UI = {
  draw: drawGain, hit: hitPlate, panel: gainPanel, rank: 1,
};
