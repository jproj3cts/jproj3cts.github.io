import { hitSlab } from './hits.js';
import { drawModulator, modHalf, modulatorPanel } from './aom.js';

/* Electro-optic modulator on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/eom.js */

export const EOM_UI = {
  draw: drawModulator, hit: hitSlab(modHalf), panel: modulatorPanel, rank: 1,
};
