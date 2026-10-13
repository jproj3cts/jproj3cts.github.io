import { drawDrawing, drawPanel, hitDrawing } from '../drawings.js';

/* Drawing on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/draw.js */

export const DRAW_UI = {
  draw: drawDrawing, hit: hitDrawing, panel: drawPanel,
};
