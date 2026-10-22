import { STL_UNITS, meshHull, meshHullCache } from '../../core/stl.js';
import { frame } from '../../core/mask.js';
import { ctx, pathLocal, selInk } from '../render.js';
import { inPolygon } from '../pointer.js';
import { helpLine, fid, h, panel, param, selectField, setFid } from '../panel.js';
import { readoutBox } from '../panels.js';
import { changed } from '../actions.js';
import { checkpoint } from '../tabs.js';
import { importStl } from '../experimental.js';
import { saveToMine } from '../myparts.js';
import { proMark } from '../pro.js';

/* STL object on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/stl.js */

/* an STL object from above: its outline, filled as a solid */
function drawStl(el, sel) {
  const f = frame(el);
  pathLocal(f, meshHull(el), true);
  ctx.fillStyle = (el.colour || '#8a8f96') + 'cc'; ctx.fill();
  ctx.strokeStyle = sel ? selInk() : 'rgba(0,0,0,0.6)'; ctx.lineWidth = sel ? 2.2 : 1.2; ctx.stroke();
}

/* An STL object's panel: its units (the file carries none), its size, colour and shape */
function stlPanel(el) {
  panel.append(h('h3', null, 'STL object'));
  const rows = h('div', { class: 'rt-rows' },
    selectField('Units of the file', [['mm', 'Millimetres'], ['cm', 'Centimetres'], ['m', 'Metres'], ['in', 'Inches'], ['other', 'Other (mm per unit)']], () => el.units || 'mm',
      v => { el.units = v; if (v !== 'other') el.scale = STL_UNITS[v]; meshHullCache.delete(el.id); }, { wide: true }));
  if (el.units === 'other') rows.append(param('mm per unit', el, 'scale'));
  const cid = 'rtf' + setFid(fid + 1), ci = h('input', { type: 'color', id: cid, value: el.colour || '#8a8f96' });
  ci.addEventListener('change', () => { checkpoint(); el.colour = ci.value; changed(false); });
  rows.append(h('div', { class: 'rt-f' }, h('label', { for: cid }, 'Colour'), ci));
  panel.append(rows);
  panel.append(readoutBox('stl'));
  const fi = h('input', { type: 'file', accept: '.stl,.STL', hidden: true });
  fi.addEventListener('change', () => { const f = fi.files[0]; if (f) importStl(f, null, el); fi.value = ''; });
  panel.append(fi, h('div', { class: 'rt-actions', style: 'margin-top:0.5rem' }, h('button', { type: 'button', class: 'rt-btn', onclick: () => fi.click() }, 'Replace its shape from a .stl file\u2026'),
    proMark(h('button', { type: 'button', class: 'rt-btn', title: 'Keep it in My parts (JEKrayPro), to add to any bench from + Add part', onclick: () => saveToMine([el]) }, '\u2605 Save to My parts\u2026'), 'keep parts in My parts')));
  const M = el.mesh;
  if (M) panel.append(h('p', { class: 'note', style: 'margin-top:0.5rem' }, M.n + ' triangles' + (M.orig ? ', simplified from the file\u2019s ' + M.orig + ' (to detail of ' + M.cell + ' file units) so it saves with the bench' : '') +
    ', ' + Math.max(1, Math.round(M.data.length / 1024)) + ' KB with the bench' + (M.file ? ', from ' + M.file : '') + '.'));
  panel.append(helpLine('An opaque CAD object: rays and beams that meet it stop there.', ['An opaque object brought in from CAD (a mount, a housing, a baffle): every ray that meets it stops there, met against its triangles in 3D, and a Gaussian beam whose centre meets it ends there. Size, colour and place are yours; its facing, tip and roll turn it as any part. A beam that only grazes its edge is not cut by it: use a stop for that.'], 'note', 'margin-top:0.5rem'));
}

const hitStl = (el, lx, ly, tol) => inPolygon(meshHull(el), lx, ly, tol);

export const STL_UI = {
  draw: drawStl, hit: hitStl, panel: stlPanel, rank: 4,
};
