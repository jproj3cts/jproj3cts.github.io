import { polyVerts } from '../../core/geometry.js';
import { frame } from '../../core/mask.js';
import { ctx, getCss, metal, pathLocal, selInk } from '../render.js';
import { hitBlock } from './hits.js';
import { h, panel, param, selectField } from '../panel.js';
import { blockNote, coatingRows, materialRows } from '../panels.js';

/* Beam splitter cube on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/cube.js */

export function drawBlock(el, sel) {
  const f = frame(el);
  const V = polyVerts(el);
  pathLocal(f, V, true);
  ctx.fillStyle = 'rgba(115,185,202,0.16)';
  ctx.fill();
  ctx.strokeStyle = sel ? selInk() : getCss('--rt-glass');
  ctx.lineWidth = sel ? 2 : 1.4;
  ctx.stroke();
  if (el.type === 'cube') {
    const a = el.size / 2;
    pathLocal(f, [[-a, -a], [a, a]]);
    ctx.strokeStyle = metal(0.35 + 0.6 * el.reflect / 100);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function cubePanel(el) {
  panel.append(h('h3', null, 'Beam splitter cube'));
  const rows = h('div', { class: 'rt-rows' },
    param('Size (mm)', el, 'size', { wide: true }),
    selectField('Type', [['npbs', 'Non-polarising'], ['pbs', 'Polarising']], () => el.mode, v => el.mode = v, { wide: true }));
  if (el.mode === 'pbs') {
    rows.append(param('s reflected (%)', el, 'reflectS'), param('p reflected (%)', el, 'reflectP'));
  } else rows.append(param('Reflected (%)', el, 'reflect', { wide: true }));
  panel.append(rows);
  panel.append(materialRows(el));
  panel.append(coatingRows(el, el, 'Face coating'));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, el.mode === 'pbs'
    ? 'A polarising cube passes p and reflects s. The defaults leave a little leakage in each arm, which is what an extinction ratio really means.'
    : 'The coated diagonal reflects this share of each ray and transmits the rest. Ray brightness shows the power left in each branch.'));
  panel.append(blockNote(el));
}

export const CUBE_UI = {
  draw: drawBlock, hit: hitBlock, panel: cubePanel, rank: 3,
};
