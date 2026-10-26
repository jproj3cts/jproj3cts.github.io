import { hitSlab } from './hits.js';
import { drawFaraday, faradayHalf, faradayPanel } from './faraday.js';

/* Optical isolator on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/isolator.js */

export const ISOLATOR_UI = {
  draw: drawFaraday, hit: hitSlab(faradayHalf), panel: faradayPanel, rank: 1,
};
