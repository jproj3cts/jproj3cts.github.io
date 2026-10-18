import { hitThin } from './hits.js';
import { drawJones, jonesPanel } from './waveplate.js';

/* Polariser on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/polariser.js */

export const POLARISER_UI = {
  draw: drawJones, hit: hitThin, panel: jonesPanel, rank: 1, noModPanel: true,
};
