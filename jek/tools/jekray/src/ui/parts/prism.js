import { PRISM_SHAPES } from '../../state/project.js';
import { hitBlock } from './hits.js';
import { drawBlock } from './cube.js';
import { panel, param, selectField } from '../panel.js';
import { h } from '../dom.js';
import { blockNote, coatingRows, materialRows } from '../panels.js';
import { removeSweeps } from '../plots.js';
import { prismMirrored } from '../../core/geometry.js';
import { changed } from '../actions.js';
import { checkpoint } from '../tabs.js';

/* Prism on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/prism.js */

function prismPanel(el) {
  panel.append(h('h3', null, 'Prism'));
  const rows = h('div', { class: 'rt-rows' },
    selectField('Shape', Object.entries(PRISM_SHAPES), () => el.shape, v => { removeSweeps(el, 'thickness'); el.shape = v; }, { wide: true }),
    param(el.shape === 'window' || el.shape === 'dove' ? 'Height (mm)' : el.shape === 'right' || el.shape === 'amici' ? 'Leg length (mm)' : el.shape === 'polygon' ? 'Height (mm)' : el.shape === 'penta' || el.shape === 'pellin' ? 'First face (mm)' : 'Side (mm)', el, 'size', { wide: el.shape !== 'window' }),
  );
  if (el.shape === 'window') rows.append(param('Thickness (mm)', el, 'thickness'));
  // a polygon's corners, typed as x, y pairs; any prism's silvered faces, by number
  if (el.shape === 'polygon') {
    const box = h('input', { type: 'text', value: (el.verts || []).map(p => +p[0].toFixed(3) + ', ' + (+p[1].toFixed(3))).join('; '), 'aria-label': 'Corners' });
    box.addEventListener('change', () => { const P = box.value.split(';').map(t => t.split(',').map(Number)).filter(p => p.length >= 2 && p.every(isFinite)); if (P.length >= 3) { checkpoint(); el.verts = P.map(p => [p[0], p[1]]); changed(); } else box.value = (el.verts || []).map(p => p[0] + ', ' + p[1]).join('; '); });
    rows.append(h('div', { class: 'rt-f wide' }, h('label', null, 'Corners (x, y mm; …)'), box));
  }
  const mir = h('input', { type: 'text', value: prismMirrored(el).join(', '), placeholder: 'none', 'aria-label': 'Silvered faces' });
  mir.addEventListener('change', () => { checkpoint(); el.mirrored = mir.value.split(/[,\s]+/).filter(Boolean).map(Number).filter(i => isFinite(i) && i >= 0 && i < 16).map(Math.round); changed(); });
  rows.append(h('div', { class: 'rt-f wide' }, h('label', null, 'Silvered faces (numbers, the first face 0)'), mir));
  if (el.shape === 'amici') rows.append(h('p', { class: 'note' }, 'On the bench, a right-angle prism: its roof turns the image over out of the bench\u2019s plane, which the 2D bench does not show.'));
  panel.append(rows);
  panel.append(materialRows(el));
  panel.append(coatingRows(el, el, 'Face coating'));
  panel.append(blockNote(el));
}

export const PRISM_UI = {
  draw: drawBlock, hit: hitBlock, panel: prismPanel, rank: 3,
};
