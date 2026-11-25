import { V } from '../../state/project.js';
import { sagFn } from '../../core/geometry.js';
import { elementSurfaces } from '../../core/stl.js';
import { ELEC } from '../../engines/elec.js';
import { frame, toWorld } from '../../core/mask.js';
import { ctx, getCss, lightLayer, metal, pathLocal, selInk, surfPoints, sx, sy } from '../render.js';
import { hitSurface } from './hits.js';
import { panel, param, propTable, selectField } from '../panel.js';
import { h } from '../dom.js';
import { changed } from '../actions.js';
import { checkpoint } from '../tabs.js';
import { removeSweeps } from '../plots.js';
import { ffRows } from './lens.js';
import { C_NM_GHZ, RF_METALS, filmCoef, metalR } from '../../core/rf.js';
import { benchNms } from '../../state/elements.js';
import { readoutBox, readoutTabs } from '../panels.js';

/* Mirror on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/mirror.js */

/* (a steering mirror is drawn where its drive puts it: posed for the drawing, at rest again after) */
function drawMirror(el, sel) { const rest = ELEC.steerOn(el); try { drawMirrorPosed(el, sel); } finally { rest(); } }
function drawMirrorPosed(el, sel) {
  const f = frame(el);
  // a corner cube: its open face, and the mirrors behind it meeting at their corner
  if (el.retro) {
    const [r] = elementSurfaces(el), a = r.semi, d = r.retro;
    ctx.strokeStyle = metal(0.45); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    pathLocal(f, [[0, -a], [0, a]]); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = sel ? selInk() : lightLayer ? metal() : getCss('--rt-metal');
    ctx.lineWidth = sel ? 3.5 : 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    pathLocal(f, [[0, -a], [-d, 0], [0, a]]); ctx.stroke();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    return;
  }
  const [s] = elementSurfaces(el);
  const pts = surfPoints(s, 48, false, f);
  // hatching on the back
  ctx.strokeStyle = metal(0.45);
  ctx.lineWidth = 1;
  // the hatch strokes a set length (mm) for the mirror, at any zoom, but never more than 7 px: zoomed in, they stay
  // a short fringe, not a band that fills a narrow wedge between two mirrors; how many, by the zoom
  const hat = Math.min(3, Math.max(0.8, el.length * 0.08), 7 / V().scale);
  const nH = Math.max(4, Math.round(el.length * V().scale / 7));
  ctx.beginPath();
  for (let i = 0; i <= nH; i++) {
    const y = s.semi * (2 * i / nH - 1);
    if (s.hole > 0 && Math.abs(y) < s.hole) continue;            // none across its hole
    const x = sagFn(s, y);
    const [ax, ay] = toWorld(f, x, y);
    const [bx, by] = toWorld(f, x - hat, y - hat);
    ctx.moveTo(sx(ax), sy(ay)); ctx.lineTo(sx(bx), sy(by));
  }
  ctx.stroke();
  // a steering mirror: its actuator, a small block on its back
  if (el.steer) {
    const b = Math.min(el.length * 0.3, 14 / V().scale), d = Math.min(el.length * 0.22, 10 / V().scale), x0 = sagFn(s, 0) - hat;
    pathLocal(f, [[x0, -b / 2], [x0 - d, -b / 2], [x0 - d, b / 2], [x0, b / 2]]); ctx.stroke();
  }
  ctx.strokeStyle = sel ? selInk() : el.reflect >= 100 ? (lightLayer ? metal() : getCss('--rt-metal')) : metal(0.35 + 0.6 * el.reflect / 100);
  ctx.lineWidth = sel ? 3.5 : 3;
  ctx.lineCap = 'round';
  // a hole through the middle: the face drawn either side of it
  if (s.hole > 0) { for (const side of [pts.filter(p => p[1] <= -s.hole), pts.filter(p => p[1] >= s.hole)]) if (side.length > 1) { pathLocal(f, side); ctx.stroke(); } }
  else { pathLocal(f, pts); ctx.stroke(); }
  ctx.lineCap = 'butt';
}

function mirrorPanel(el) {
  // what arrives at its face: the rays, the diffracted field and a pulse, read as a screen reads them
  if (readoutTabs(el, [['params', 'Mirror'], ['rays', 'Rays'], ['plots', 'Diffraction'], ['pulse', 'Pulse']])) return;
  // (its sections are named by what they hold: a film beam splitter's alone by what it is)
  if (el.film) panel.append(h('h3', null, 'Film beam splitter'));
  if (el.retro) {
    panel.append(h('h3', null, 'Corner cube'), propTable(el, [{ name: 'Opening', path: 'length', unit: 'mm' }, { name: 'Each mirror reflects', path: 'reflect', unit: '%', dflt: 100 },
      { name: 'Corner depth', read: () => fmtPt(el.length / Math.SQRT2), unit: 'mm', title: 'Where the three mirrors meet: as deep as a cube corner is under the circle its faces just reach, the opening over \u221a2.' }]));
    panel.append(h('p', { style: 'margin-top:0.6rem' }, 'A hollow corner cube: three flat mirrors square to one another, meeting at a corner ' + (+(el.length / Math.SQRT2).toPrecision(4)) + ' mm behind the middle of its round opening. Light reflects off all three and goes back the way it came, whatever its angle in or out of the bench plane, leaving from the point opposite across the middle. Light that meets only one or two of the mirrors before leaving goes elsewhere, as on a real one. What a mirror does not reflect is lost.'));
    return;
  }
  const nm = benchNms()[0], ghz = C_NM_GHZ / nm;
  if (el.film) {
    const F45 = filmCoef(el.film, nm, Math.SQRT1_2), pc = v => (100 * v).toPrecision(3) + ' %';
    panel.append(h('div', { class: 'rt-rows' },
      param('Width (mm)', el, 'length'), param('Film index', el, 'film.n'), param('Thickness (mm)', el, 'film.t', { wide: true })));
    panel.append(h('div', { class: 'rt-readout' }, h('table', null, h('tbody', null,
      h('tr', null, h('td', null, 'At ' + (+ghz.toPrecision(4)) + ' GHz, 45\u00b0'), h('td', null, 'reflects ' + pc(F45.Rs) + ' of s, ' + pc(F45.Rp) + ' of p'))))));
    panel.append(h('p', { style: 'margin-top:0.6rem' }, 'A dielectric sheet (Mylar is 1.73): its two faces interfere, so what it reflects goes with its thickness over the wavelength, the angle, and the polarisation. Lossless.'));
    return;
  }
  // its settings as a table: its surface, then its coating; the figures that follow from them among them
  const f0 = () => (el.R ? el.R / 2 : null), para = () => !!el.R && el.k === -1 && !!el.offset;
  panel.append(h('h3', null, 'Surface'), propTable(el, [
    { name: 'Width', path: 'length', unit: 'mm' },
    { name: 'Radius', path: 'R', unit: 'mm', dflt: null, opts: { blank: null, placeholder: 'plane' }, title: 'Its radius of curvature: positive is concave towards the reflecting face, negative convex. Blank for a plane mirror.' },
    { name: 'Conic', path: 'k', dflt: 0, opts: { blank: 0 }, title: '0 a sphere, −1 a paraboloid.' },
    { name: 'Off-axis offset', path: 'offset', unit: 'mm', dflt: 0, title: 'Slides the mirror this far along its parent curve, off the curve’s axis: with a conic of −1, an off-axis parabola.' },
    { name: 'Hole through it', path: 'hole', unit: 'mm', dflt: 0, opts: { blank: 0, placeholder: 'none' } },
    ...(el.A || []).map((_, j) => ({ name: 'A' + (4 + 2 * j), path: `A.${j}`, dflt: 0, opts: { blank: 0 } })),
    { name: 'Focal length', unit: 'mm', read: () => (f0() === null || para() ? null : fmtPt(f0())), title: 'Half its radius, for light near its axis.' },
    { name: 'Turns the beam', unit: '°', read: () => (para() ? fmtPt(2 * Math.atan(Math.abs(el.offset) / (2 * Math.abs(f0()))) * 180 / Math.PI) : null), title: 'An off-axis parabola: how far it turns a beam that comes in along its parent’s axis.' },
    { name: 'Focus from the mirror', unit: 'mm', read: () => (para() ? fmtPt(Math.abs(f0()) + el.offset * el.offset / (4 * Math.abs(f0()))) : null), title: 'An off-axis parabola’s reflected focal length: from the middle of the mirror to its focus.' },
  ]));
  if (!el.metal) panel.append(h('h3', null, 'Coating'), propTable(el, [
    { name: 'Reflectance', path: 'reflect', unit: '%', dflt: 100 },
    { name: 'Passes through', path: 'transmit', unit: '%', dflt: null, opts: { placeholder: 'the rest', blank: null }, title: 'What is neither reflected nor passed is absorbed. Blank: all that is not reflected passes.' },
    { name: 'GDD a reflection', path: 'gdd', unit: 'fs²', dflt: 0, title: 'A chirped mirror: the group delay dispersion each reflection adds. Negative compresses a pulse.' },
  ]));
  if (el.metal) panel.append(h('h3', null, 'Metal'), h('div', { class: 'rt-rows' }, selectField('Metal', Object.entries(RF_METALS).map(([k, v]) => [k, v.name]), () => el.metal, v => { el.metal = v; })));
  // its aspheric and freeform terms: added and taken off here, each a row above once it is there
  const termed = !!((el.A && el.A.length) || (el.F && Object.keys(el.F).length));
  panel.append(h('h3', termed ? null : { 'data-shut': '' }, 'Aspheric and freeform terms'), h('div', { class: 'rt-rows' },
    h('div', { class: 'rt-inline wide' },
      (el.A || []).length < 7 ? h('button', { class: 'rt-link', type: 'button', onclick: () => { checkpoint(); el.A = (el.A || []).concat([0]); changed(true); } },
        (el.A || []).length ? 'Add A' + (4 + 2 * el.A.length) + ' term' : 'Add aspheric terms') : null,
      (el.A || []).length ? h('button', { class: 'rt-link', type: 'button', onclick: () => {
        checkpoint(); removeSweeps(el, 'A.' + (el.A.length - 1)); el.A.pop(); if (!el.A.length) delete el.A; changed(true);
      } }, 'Remove A' + (2 + 2 * el.A.length)) : null),
    ...ffRows(el, el, 'F', el.name || 'the mirror'),
  ));
  if (el.mmw && el.R) panel.append(readoutBox('mirror'));
  if (el.metal) panel.append(h('p', { class: 'note' }, 'Reflects ' + (100 * metalR(el.metal, ghz)).toPrecision(4) + ' % at ' + (+ghz.toPrecision(4)) + ' GHz: the loss is 4 Rs / Z0, Rs = \u221a(\u03c0 f \u03bc0 / \u03c3) the surface resistance of ' + RF_METALS[el.metal].name.toLowerCase() + '.'));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'An off-axis offset slides the aperture that far along the parent curve, which is how off-axis parabolas work: set the parent radius, a conic of \u22121 and the offset. Leave the radius blank for a plane mirror. A positive radius is concave towards the reflecting face. At 100% the back of the mirror absorbs; below that it behaves as a thin partial reflector, and the transmitted part carries straight on. A GDD makes it a chirped (dispersive) mirror: each reflection adds that group-delay dispersion to a pulse, about the pulse\u2019s centre wavelength; negative compresses a pulse that glass has stretched.'));
  if (el.source) panel.append(h('p', { class: 'note' }, 'Imported from ' + el.source + '.'));
}

/* a figure in the table: four figures, no trailing noughts */
const fmtPt = v => String(+(+v).toPrecision(4));
export const MIRROR_UI = {
  draw: drawMirror, hit: hitSurface, panel: mirrorPanel, rank: 2, table: true,
};
