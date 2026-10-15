import { glassKey } from '../../core/glass.js';
import { deg } from '../../state/project.js';
import { lensSurfaces } from '../../core/geometry.js';
import { elementSurfaces } from '../../core/stl.js';
import { frame } from '../../core/mask.js';
import { ctx, getCss, lightLayer, pathLocal, selInk, surfPoints } from '../render.js';
import { fid, h, numInput, panel, param, selectField, setFid } from '../panel.js';
import { coatingRows } from '../panels.js';
import { clipNote } from '../heavy.js';
import {
  askForGlass, askForMaterial, flipLens, glassNote, materialOptions, pickMaterial, removeSweeps, unknownGlass,
  unknownGlassNote
} from '../plots.js';
import { changed } from '../actions.js';
import { checkpoint } from '../tabs.js';

/* Lens on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/lens.js */

function drawLens(el, sel) {
  const f = frame(el);
  const ss = lensSurfaces(el);
  const glass = getCss('--rt-glass');
  for (let i = 0; i < ss.length - 1; i++) {
    if (el.materials[i].glass === 'AIR') continue;
    const pts = surfPoints(ss[i], 48, false, f).concat(surfPoints(ss[i + 1], 48, true, f));
    pathLocal(f, pts, true);
    // an RF lens is white plastic (PTFE, HDPE), not glass
    ctx.fillStyle = el.mmw ? 'rgba(242,242,236,0.5)' : 'rgba(115,185,202,0.16)';
    ctx.fill();
    ctx.strokeStyle = sel ? selInk() : el.mmw ? (lightLayer ? '#8f8f88' : '#f2f2ec') : glass;
    ctx.lineWidth = sel ? 2 : 1.4;
    ctx.stroke();
  }
}

function lensPanel(el) {
  panel.append(h('h3', null, el.mmw ? 'RF lens' : 'Lens'));
  panel.append(h('div', { class: 'rt-rows' }, param('Diameter (mm)', el, 'diameter', { wide: true }),
    selectField('Shape', [['round', 'Round'], ['plane', 'Cylinder, power in the bench plane'], ['out', 'Cylinder, power out of the plane']],
      () => el.cyl || 'round', v => { el.cyl = v === 'round' ? undefined : v; }, { wide: true })));
  const clip = clipNote(el);
  if (clip) panel.append(h('p', { class: 'rt-assumed' }, clip));

  const N = el.surfaces.length;
  for (let i = 0; i < N; i++) {
    const s = el.surfaces[i];
    panel.append(h('h3', null, 'Surface ' + (i + 1)));
    const rows = h('div', { class: 'rt-rows' },
      param('Radius (mm)', el, `surfaces.${i}.R`, { blank: null, placeholder: 'flat' }),
      param('Conic k', el, `surfaces.${i}.k`, { blank: 0 }),
    );
    if (s.a2 !== 0) rows.append(param('A2 (mm⁻¹)', el, `surfaces.${i}.a2`, { blank: 0 }));
    if (s.odd && s.odd[0]) {
      // an axicon's cone, given as its base angle; stored as the odd r^1 sag term
      const cid = 'rtf' + (setFid(fid + 1));
      const cone = numInput(cid, () => +(Math.atan(s.odd[0]) / deg).toPrecision(6), v => { if (Math.abs(v) < 80) s.odd[0] = Math.tan(v * deg); });
      rows.append(h('div', { class: 'rt-f wide' }, h('label', { for: cid }, 'Cone angle (°)'), cone));
    }
    s.A.forEach((_, j) => rows.append(param('A' + (4 + 2 * j), el, `surfaces.${i}.A.${j}`, { blank: 0 })));
    rows.append(h('div', { class: 'rt-inline wide' },
      h('button', { class: 'rt-link', type: 'button', onclick: () => { checkpoint(); s.A.push(0); changed(true); } },
        s.A.length ? 'Add A' + (4 + 2 * s.A.length) + ' term' : 'Add aspheric terms'),
      s.A.length ? h('button', { class: 'rt-link', type: 'button', onclick: () => {
        checkpoint(); removeSweeps(el, `surfaces.${i}.A.${s.A.length - 1}`); s.A.pop(); changed(true);
      } }, 'Remove A' + (2 + 2 * s.A.length)) : null,
    ));
    panel.append(rows);
    panel.append(coatingRows(el, s));

    if (i < N - 1) {
      const m = el.materials[i];
      const mrows = h('div', { class: 'rt-rows', style: 'margin-top:0.6rem' },
        param(i === 0 && N === 2 ? 'Centre thickness (mm)' : 'Thickness to ' + (i + 2) + ' (mm)', el, `gaps.${i}`),
        selectField('Material', materialOptions(m, !!el.mmw), () => glassKey(m.glass) || m.glass, v => {
          const old = el.materials[i];
          if (v === 'import') { askForMaterial(mm => { el.materials[i] = mm; changed(true); }); return; }
          if (v === 'search') { askForGlass(k => { checkpoint(); removeSweeps(el, `materials.${i}.`); el.materials[i] = pickMaterial(k, el.materials[i]); changed(true); }); return; }
          removeSweeps(el, `materials.${i}.`);
          el.materials[i] = pickMaterial(v, old);
        }),
      );
      const gn = glassNote(m); if (gn) mrows.append(gn);
      if (m.glass === 'custom') mrows.append(param('Index n', el, `materials.${i}.n`, { wide: true }));
      if (unknownGlass(m)) mrows.append(unknownGlassNote(m));
      if (m.glass !== 'AIR') mrows.append(param('Absorption (per mm)', el, `materials.${i}.abs`, { wide: true }));
      panel.append(mrows);
    }
  }
  panel.append(h('div', { class: 'rt-readout', 'data-readout': 'lens' }));
  panel.append(h('div', { class: 'rt-actions' },
    h('button', { class: 'rt-btn', onclick: () => { checkpoint(); flipLens(el); changed(true); } }, 'Flip'),
  ));
}

function hitLens(el, lx, ly, tol) {
  const ss = elementSurfaces(el), a = ss[0], b = ss[ss.length - 1], r = el.diameter / 2 + tol;
  return Math.abs(ly) <= r && lx >= a.xmin - tol && lx <= b.xmax + tol;
}

export const LENS_UI = {
  draw: drawLens, hit: hitLens, panel: lensPanel, rank: 3,
};
