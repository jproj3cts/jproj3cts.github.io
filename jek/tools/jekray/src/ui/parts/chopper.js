import { ELEC } from '../../engines/elec.js';
import { ELEC_UI } from '../elec.js';

/* Optical chopper on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/chopper.js */

export const CHOPPER_UI = {
  draw: (el, sel) => ELEC_UI.drawChopper(el, sel), hit: (el, lx, ly, tol) => ELEC.hitChopper(el, lx, ly, tol), panel: el => ELEC_UI.chopperPanel(el), rank: 1,
};
