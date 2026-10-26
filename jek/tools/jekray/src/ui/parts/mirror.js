import { V } from '../../state/project.js';
import { sagFn } from '../../core/geometry.js';
import { elementSurfaces } from '../../core/stl.js';
import { frame, toWorld } from '../../core/mask.js';
import { ctx, getCss, lightLayer, metal, pathLocal, selInk, surfPoints, sx, sy } from '../render.js';
import { hitSurface } from './hits.js';
import { h, panel, param, selectField } from '../panel.js';
import { changed } from '../actions.js';
import { checkpoint } from '../tabs.js';
import { removeSweeps } from '../plots.js';
import { ffRows } from './lens.js';
import { C_NM_GHZ, RF_METALS, filmCoef, metalR } from '../../core/rf.js';
import { benchNms } from '../../state/elements.js';
import { readoutBox, readoutTabs } from '../panels.js';

/* Mirror on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/mirror.js */

function drawMirror(el, sel) {
  const f = frame(el);
  const [s] = elementSurfaces(el);
  const pts = surfPoints(s, 48, false, f);
  // hatching on the back
  ctx.strokeStyle = metal(0.45);
  ctx.lineWidth = 1;
  const hat = Math.min(3, Math.max(0.8, el.length * 0.08));   // the hatch strokes a set length (mm) for the mirror, at any zoom; how many, by the zoom
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
  ctx.strokeStyle = sel ? selInk() : el.reflect >= 100 ? (lightLayer ? metal() : getCss('--rt-metal')) : metal(0.35 + 0.6 * el.reflect / 100);
  ctx.lineWidth = sel ? 3.5 : 3;
  ctx.lineCap = 'round';
  pathLocal(f, pts);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function mirrorPanel(el) {
  // what arrives at its face: the rays, the diffracted field and a pulse, read as a screen reads them
  if (readoutTabs(el, [['params', 'Mirror'], ['rays', 'Rays'], ['plots', 'Diffraction'], ['pulse', 'Pulse']])) return;
  panel.append(h('h3', null, el.film ? 'Film beam splitter' : el.metal ? 'Metal mirror' : 'Mirror'));
  const nm = benchNms()[0], ghz = C_NM_GHZ / nm;
  if (el.film) {
    const F45 = filmCoef(el.film, nm, Math.SQRT1_2), pc = v => (100 * v).toPrecision(3) + ' %';
    panel.append(h('div', { class: 'rt-rows' },
      param('Length (mm)', el, 'length'), param('Film index', el, 'film.n'), param('Thickness (mm)', el, 'film.t', { wide: true })));
    panel.append(h('div', { class: 'rt-readout' }, h('table', null, h('tbody', null,
      h('tr', null, h('td', null, 'At ' + (+ghz.toPrecision(4)) + ' GHz, 45\u00b0'), h('td', null, 'reflects ' + pc(F45.Rs) + ' of s, ' + pc(F45.Rp) + ' of p'))))));
    panel.append(h('p', { style: 'margin-top:0.6rem' }, 'A dielectric sheet (Mylar is 1.73): its two faces interfere, so what it reflects goes with its thickness over the wavelength, the angle, and the polarisation. Lossless.'));
    return;
  }
  panel.append(h('div', { class: 'rt-rows' },
    param('Length (mm)', el, 'length'),
    param('Radius (mm)', el, 'R', { blank: null, placeholder: 'plane' }),
    ...(el.metal ? [selectField('Metal', Object.entries(RF_METALS).map(([k, v]) => [k, v.name]), () => el.metal, v => { el.metal = v; })] : [param('Reflectance (%)', el, 'reflect')]),
    param('Conic k', el, 'k', { blank: 0 }),
    // its aspheric terms on the conic, A4 r⁴ … (each added, and the last taken off, as an asphere's)
    ...(el.A || []).map((_, j) => param('A' + (4 + 2 * j), el, `A.${j}`, { blank: 0 })),
    h('div', { class: 'rt-inline wide' },
      (el.A || []).length < 7 ? h('button', { class: 'rt-link', type: 'button', onclick: () => { checkpoint(); el.A = (el.A || []).concat([0]); changed(true); } },
        (el.A || []).length ? 'Add A' + (4 + 2 * el.A.length) + ' term' : 'Add aspheric terms') : null,
      (el.A || []).length ? h('button', { class: 'rt-link', type: 'button', onclick: () => {
        checkpoint(); removeSweeps(el, 'A.' + (el.A.length - 1)); el.A.pop(); if (!el.A.length) delete el.A; changed(true);
      } }, 'Remove A' + (2 + 2 * el.A.length)) : null),
    ...ffRows(el, el, 'F', el.name || 'the mirror'),
    param('Off-axis offset (mm)', el, 'offset'),
    param('GDD a reflection (fs\u00b2)', el, 'gdd', { wide: true }),
  ));
  if (el.mmw && el.R) panel.append(readoutBox('mirror'));
  if (el.metal) panel.append(h('p', { class: 'note' }, 'Reflects ' + (100 * metalR(el.metal, ghz)).toPrecision(4) + ' % at ' + (+ghz.toPrecision(4)) + ' GHz: the loss is 4 Rs / Z0, Rs = \u221a(\u03c0 f \u03bc0 / \u03c3) the surface resistance of ' + RF_METALS[el.metal].name.toLowerCase() + '.'));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'An off-axis offset slides the aperture that far along the parent curve, which is how off-axis parabolas work: set the parent radius, a conic of \u22121 and the offset. Leave the radius blank for a plane mirror. A positive radius is concave towards the reflecting face. At 100% the back of the mirror absorbs; below that it behaves as a thin partial reflector, and the transmitted part carries straight on. A GDD makes it a chirped (dispersive) mirror: each reflection adds that group-delay dispersion to a pulse, about the pulse\u2019s centre wavelength; negative compresses a pulse that glass has stretched.'));
  if (el.source) panel.append(h('p', { class: 'note' }, 'Imported from ' + el.source + '.'));
}

export const MIRROR_UI = {
  draw: drawMirror, hit: hitSurface, panel: mirrorPanel, rank: 2,
};
