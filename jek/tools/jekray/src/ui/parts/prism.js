import { PRISM_SHAPES } from '../../state/project.js';
import { hitBlock } from './hits.js';
import { drawBlock } from './cube.js';
import { h, panel, param, selectField } from '../panel.js';
import { blockNote, coatingRows, materialRows } from '../panels.js';
import { removeSweeps } from '../plots.js';

/* Prism on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/prism.js */

function prismPanel(el) {
  panel.append(h('h3', null, 'Prism'));
  const rows = h('div', { class: 'rt-rows' },
    selectField('Shape', Object.entries(PRISM_SHAPES), () => el.shape, v => { removeSweeps(el, 'thickness'); el.shape = v; }, { wide: true }),
    param(el.shape === 'window' || el.shape === 'dove' ? 'Height (mm)' : el.shape === 'right' ? 'Leg length (mm)' : 'Side (mm)', el, 'size', { wide: el.shape !== 'window' }),
  );
  if (el.shape === 'window') rows.append(param('Thickness (mm)', el, 'thickness'));
  panel.append(rows);
  panel.append(materialRows(el));
  panel.append(coatingRows(el, el, 'Face coating'));
  panel.append(blockNote(el));
}

export const PRISM_UI = {
  draw: drawBlock, hit: hitBlock, panel: prismPanel, rank: 3,
};
