import { CRYSTALS, CRYSTAL_SHAPES } from '../../core/crystals.js';
import { V, deg } from '../../state/project.js';
import { crystalGeom } from '../../core/stl.js';
import { frame } from '../../core/mask.js';
import { ctx, pathLocal, selInk } from '../render.js';
import { inPolygon } from '../pointer.js';
import { h, panel, param, selectField } from '../panel.js';
import { readoutBox } from '../panels.js';

/* Crystal on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/crystal.js */

function drawCrystal(el, sel) {
  const f = frame(el), G = crystalGeom(el), k = 1 / V().scale;
  pathLocal(f, G.outline, true);
  ctx.fillStyle = 'rgba(183,155,255,0.13)'; ctx.fill();
  ctx.strokeStyle = sel ? selInk() : '#b79bff'; ctx.lineWidth = sel ? 2.2 : 1.4; ctx.stroke();
  ctx.lineWidth = 1.2; ctx.strokeStyle = sel ? selInk() : '#b79bff';
  if (G.cut) { pathLocal(f, G.cut); ctx.stroke(); }
  if (G.gap) for (const g of G.gap) { pathLocal(f, [[g[0], g[1]], [g[2], g[3]]]); ctx.stroke(); }
  // the optic axis, where it lies in the bench plane
  if (el.shape === 'displacer') {
    const a = el.axisAngle * deg, r = 0.35 * Math.min(el.length, el.size);
    pathLocal(f, [[-r * Math.cos(a), -r * Math.sin(a)], [r * Math.cos(a), r * Math.sin(a)]]);
    ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(183,155,255,0.8)'; ctx.stroke(); ctx.setLineDash([]);
  }
}

function crystalPanel(el) {
  panel.append(h('h3', null, 'Crystal'));
  const rows = h('div', { class: 'rt-rows' },
    selectField('Type', Object.entries(CRYSTAL_SHAPES), () => el.shape, v => { el.shape = v; }, { wide: true }),
    selectField('Material', Object.entries(CRYSTALS).map(([k, v]) => [k, v.name]), () => el.crystal, v => { el.crystal = v; }),
    param('Aperture (mm)', el, 'size'));
  if (el.shape === 'displacer') rows.append(param('Length (mm)', el, 'length'), param('Optic axis from the normal (°)', el, 'axisAngle', { wide: true }));
  if (el.shape === 'wollaston') rows.append(param('Wedge angle (°)', el, 'wedge', { wide: true }));
  panel.append(rows);
  panel.append(readoutBox('crystal'));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, {
    displacer: 'The optic axis lies in the bench plane, tilted from the faces, so p light is the extraordinary ray: its energy walks off sideways while s goes straight, and they leave parallel, side by side.',
    wollaston: 'Two wedges with their optic axes crossed: s and p swap between the ordinary and extraordinary index at the join, so they bend opposite ways and leave diverging.',
    glan: 'Two prisms with an air gap cut between the two critical angles: the polarisation with the higher index is totally reflected out of the side, the other passes.',
  }[el.shape]));
}

const hitCrystal = (el, lx, ly, tol) => inPolygon(crystalGeom(el).outline, lx, ly, tol);

export const CRYSTAL_UI = {
  draw: drawCrystal, hit: hitCrystal, panel: crystalPanel, rank: 3,
};
