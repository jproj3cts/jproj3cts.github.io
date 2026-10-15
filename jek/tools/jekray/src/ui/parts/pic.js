import { PIC } from '../../engines/pic.js';
import { PIC_UI } from '../pic.js';

/* Photonic circuit part on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/pic.js */

export const PIC_PART_UI = {
  draw: (el, sel) => PIC_UI.draw(el, sel), hit: (el, lx, ly, tol) => PIC.hit(el, lx, ly, tol), panel: el => PIC_UI.panelFor(el), rank: 1,
};
