import { hitPlate } from './hits.js';
import { drawModulator, modulatorPanel } from './aom.js';

/* Electro-optic modulator on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/eom.js */

export const EOM_UI = {
  draw: drawModulator, hit: hitPlate, panel: modulatorPanel, rank: 1,
};
