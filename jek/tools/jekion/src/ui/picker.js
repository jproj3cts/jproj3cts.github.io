import { hooks } from '../../../jekray/src/core/hooks.js';
import { h } from '../../../jekray/src/ui/dom.js';
import { addDetector, addIon } from './actions.js';

/* ==========================================================================
   The Insert menu: an ion group, a detector; from the bar, or at a point of the bench
   from the right-click menu.
   ========================================================================== */
export function fillAddMenu(at) {
  const menu = document.getElementById('addMenu');
  const item = (label, small, fn) => h('button', { type: 'button', role: 'menuitem', class: 'ion-mshape', onclick: () => { menu.hidden = true; document.getElementById('btnAdd').setAttribute('aria-expanded', 'false'); fn(); } }, h('span', null, label), small ? h('small', null, small) : null);
  // the electrodes come from CAD, by File › Import; the primitive shapes (which the examples and old files still carry) are not offered
  menu.replaceChildren(item('Ion group', 'Particles started together: species, energy, place, direction', () => addIon(at)), item('Detector', 'A plane that records every ion through it', () => addDetector(at)));
  hooks.ionMenuIcons(menu);
}
export function wirePicker() {
  document.getElementById('btnAdd').addEventListener('click', () => fillAddMenu(null), true);
  hooks.ionAddMenu = at => {
    fillAddMenu(at);
    const btn = document.getElementById('btnAdd'), menu = document.getElementById('addMenu');
    menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
    const f = menu.querySelector('button'); if (f) f.focus();
  };
}
