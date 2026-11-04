import { hooks } from '../../../jekray/src/core/hooks.js';
import { SHAPES } from '../core/geom.js';
import { project } from '../state/project.js';
import { SHAPE_ORDER } from '../parts/electrodes.js';
import { h } from './panel.js';
import { addDetector, addElectrode, addIon } from './actions.js';

/* ==========================================================================
   The Add menu: an electrode of each shape, an ion group, a detector; from the toolbar, or at a point of the bench
   from the right-click menu.
   ========================================================================== */
export function fillAddMenu(at) {
  const menu = document.getElementById('addMenu');
  const item = (label, small, fn) => h('button', { type: 'button', role: 'menuitem', class: 'ion-mshape', onclick: () => { menu.hidden = true; document.getElementById('btnAdd').setAttribute('aria-expanded', 'false'); fn(); } }, h('span', null, label), small ? h('small', null, small) : null);
  const cyl = project && project.grid.sym === 'cyl';
  menu.replaceChildren(h('span', { class: 'rt-menunote' }, 'Electrodes' + (cyl ? ' (bodies of revolution about the x axis)' : '')),
    ...SHAPE_ORDER.filter(s => !(cyl && s === 'box')).map(s => item(SHAPES[s].label, SHAPES[s].picker, () => addElectrode(s, at))),
    item('CAD body…', 'Each body of a .step or .stl file, as an electrode', () => document.getElementById('fileCad').click()),
    h('div', { class: 'sep' }), item('Ion group', 'Particles started together: species, energy, place, direction', () => addIon(at)), item('Detector', 'A plane that records every ion through it', () => addDetector(at)));
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
