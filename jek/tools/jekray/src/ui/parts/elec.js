import { ELEC } from '../../engines/elec.js';
import { ELEC_UI } from '../elec.js';

/* Electronics block on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/elec.js */

export const ELEC_PART_UI = {
  draw: (el, sel) => ELEC_UI.draw(el, sel), hit: (el, lx, ly, tol) => ELEC.hit(el, lx, ly, tol), panel: el => ELEC_UI.panelFor(el), rank: 1, noModPanel: true,
};
