import { V } from '../../state/project.js';
import { sagFn } from '../../core/geometry.js';
import { elementSurfaces } from '../../core/stl.js';
import { frame, toWorld } from '../../core/mask.js';
import { ctx, getCss, lightLayer, metal, pathLocal, selInk, surfPoints, sx, sy } from '../render.js';
import { hitSurface } from './hits.js';
import { h, panel, param } from '../panel.js';
import { readoutTabs } from '../panels.js';

/* Mirror on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/mirror.js */

function drawMirror(el, sel) {
  const f = frame(el);
  const [s] = elementSurfaces(el);
  const pts = surfPoints(s, 48, false, f);
  // hatching on the back
  ctx.strokeStyle = metal(0.45);
  ctx.lineWidth = 1;
  const hat = Math.min(3, 8 / V().scale + 0.6);
  const nH = Math.max(4, Math.round(el.length * V().scale / 7));
  ctx.beginPath();
  for (let i = 0; i <= nH; i++) {
    const y = s.semi * (2 * i / nH - 1);
    const x = sagFn(s, y);
    const [ax, ay] = toWorld(f, x, y);
    const [bx, by] = toWorld(f, x - hat, y - hat);
    ctx.moveTo(sx(ax), sy(ay)); ctx.lineTo(sx(bx), sy(by));
  }
  ctx.stroke();
  pathLocal(f, pts);
  ctx.strokeStyle = sel ? selInk() : el.reflect >= 100 ? (lightLayer ? metal() : getCss('--rt-metal')) : metal(0.35 + 0.6 * el.reflect / 100);
  ctx.lineWidth = sel ? 3.5 : 3;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function mirrorPanel(el) {
  // what arrives at its face: the rays, the diffracted field and a pulse, read as a screen reads them
  if (readoutTabs(el, [['params', 'Mirror'], ['rays', 'Rays'], ['plots', 'Diffraction'], ['pulse', 'Pulse']])) return;
  panel.append(h('h3', null, 'Mirror'));
  panel.append(h('div', { class: 'rt-rows' },
    param('Length (mm)', el, 'length'),
    param('Radius (mm)', el, 'R', { blank: null, placeholder: 'plane' }),
    param('Reflectance (%)', el, 'reflect'),
    param('Conic k', el, 'k', { blank: 0 }),
    param('Off-axis offset (mm)', el, 'offset'),
    param('GDD a reflection (fs\u00b2)', el, 'gdd', { wide: true }),
  ));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'An off-axis offset slides the aperture that far along the parent curve, which is how off-axis parabolas work: set the parent radius, a conic of \u22121 and the offset. Leave the radius blank for a plane mirror. A positive radius is concave towards the reflecting face. At 100% the back of the mirror absorbs; below that it behaves as a thin partial reflector, and the transmitted part carries straight on. A GDD makes it a chirped (dispersive) mirror: each reflection adds that group-delay dispersion to a pulse, about the pulse\u2019s centre wavelength; negative compresses a pulse that glass has stretched.'));
  if (el.source) panel.append(h('p', { class: 'note' }, 'Imported from ' + el.source + '.'));
}

export const MIRROR_UI = {
  draw: drawMirror, hit: hitSurface, panel: mirrorPanel, rank: 2,
};
