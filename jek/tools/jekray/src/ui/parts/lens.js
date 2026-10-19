import { orderRow } from '../../io/order.js';
import { glassKey } from '../../core/glass.js';
import { deg } from '../../state/project.js';
import { lensStacks, lensSurfaces, sagFn } from '../../core/geometry.js';
import { elementSurfaces } from '../../core/stl.js';
import { frame } from '../../core/mask.js';
import { ctx, drawMount, getCss, lightLayer, pathLocal, selInk, surfPoints } from '../render.js';
import { fid, h, numInput, panel, param, selectField, setFid } from '../panel.js';
import { coatingRows, mountSection, rfLensPatternSection } from '../panels.js';
import { RF_MAT } from '../../core/rf.js';
import { clipNote } from '../heavy.js';
import {
  askForGlass, askForMaterial, flipLens, glassNote, materialOptions, pickMaterial, removeSweeps, unknownGlass,
  unknownGlassNote
} from '../plots.js';
import { changed } from '../actions.js';
import { FF_KEYS, ffLabel } from '../../core/freeform.js';
import { DP_N, dpLabel, normOrder } from '../../core/diffractive.js';
import { GR_N, grLabel } from '../../core/gradient.js';
import { checkpoint } from '../tabs.js';
import { asmOf } from '../../core/assembly.js';
import { makeAssembly } from '../assembly.js';
import { openLensDesign } from '../lens-workspace.js';

/* Lens on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/lens.js */

/* a stack's face across, [x, y] in the part's frame: sampled over its width, with a point either side of each member's edge */
function stackPoints(st, n, reverse) {
  const ys = []; for (let i = 0; i <= n; i++) ys.push(st.semi * (2 * i / n - 1));
  for (const r of st.edges) for (const sg of [1, -1]) ys.push(sg * (r - 1e-6), sg * (r + 1e-6));
  ys.sort((a, b) => a - b); if (reverse) ys.reverse();
  return ys.map(y => { const v = st.sag(y); return [st.z + (isFinite(v) ? v : 0), y]; });
}
function drawLens(el, sel) {
  const f = frame(el);
  const ss = lensSurfaces(el), stacks = lensStacks(ss);
  const glass = getCss('--rt-glass');
  // the glass between one face and the next (a face is a stack of the surfaces sharing a vertex, each where it reaches)
  for (let i = 0; i < stacks.length - 1; i++) {
    if (el.materials[stacks[i].last].glass === 'AIR') continue;
    const pts = stackPoints(stacks[i], 48, false).concat(stackPoints(stacks[i + 1], 48, true));
    pathLocal(f, pts, true);
    // an RF lens is white plastic (PTFE, HDPE), not glass
    ctx.fillStyle = el.mmw ? 'rgba(242,242,236,0.5)' : 'rgba(115,185,202,0.16)';
    ctx.fill();
    ctx.strokeStyle = sel ? selInk() : el.mmw ? (lightLayer ? '#8f8f88' : '#f2f2ec') : glass;
    ctx.lineWidth = sel ? 2 : 1.4;
    ctx.stroke();
  }
  // a mirror-coated surface: silvered, a thick bright line along it between its hole and its edge
  for (const s of ss) {
    if (!s.silver) continue;
    for (const sg of [1, -1]) {
      const pts = []; for (let q = 0; q <= 32; q++) { const y = sg * ((s.hole || 0) + (s.semi - (s.hole || 0)) * q / 32); pts.push([s.z + sagFn(s, y), y]); }
      pathLocal(f, pts); ctx.save(); ctx.lineWidth = sel ? 4 : 3.2; ctx.strokeStyle = sel ? selInk() : '#dfe5ea'; ctx.lineCap = 'butt'; ctx.stroke(); ctx.restore();
    }
  }
  // a diffractive face: its zones, as a broken line along it
  for (const s of ss) {
    if (!s.ph) continue;
    pathLocal(f, surfPoints(s, 48, false, f));
    ctx.save(); ctx.setLineDash([1.5, 2.5]); ctx.lineWidth = 3.2; ctx.strokeStyle = sel ? selInk() : glass; ctx.stroke(); ctx.restore();
  }
  if (el.mount) {
    // the flange about the middle of the rim: where the first and last faces meet the edge
    const rimX = s => { const P = surfPoints(s, 8, false, null); return P.reduce((b, p) => (Math.abs(p[1]) > Math.abs(b[1]) ? p : b))[0]; };
    drawMount(f, (rimX(ss[0]) + rimX(ss[ss.length - 1])) / 2, el.diameter / 2, el.mount, sel);
  }
}

function lensPanel(el) {
  panel.append(h('h3', null, el.mmw ? 'RF lens' : 'Lens'));
  panel.append(h('div', { class: 'rt-rows' }, param('Diameter (mm)', el, 'diameter', { wide: true }),
    selectField('Shape', [['round', 'Round'], ['plane', 'Cylinder, power in the bench plane'], ['out', 'Cylinder, power out of the plane']],
      () => el.cyl || 'round', v => { el.cyl = v === 'round' ? undefined : v; }, { wide: true })));
  const clip = clipNote(el);
  if (clip) panel.append(h('p', { class: 'rt-assumed' }, clip));
  if (el.diffractive) {
    // a diffractive lens: the order its faces send the light into (all of it, as a blaze would)
    const oid = 'rtf' + (setFid(fid + 1));
    panel.append(h('div', { class: 'rt-rows' }, h('div', { class: 'rt-f wide', title: 'The order of diffraction its zones are blazed for: all the light is taken to go into it' },
      h('label', { for: oid }, 'Diffraction order'), numInput(oid, () => el.diffOrder || 1, v => { const m = normOrder(Math.round(v)); el.diffOrder = m === 1 ? undefined : m; }))));
  }

  const N = el.surfaces.length;
  for (let i = 0; i < N; i++) {
    const s = el.surfaces[i];
    panel.append(h('h3', null, 'Surface ' + (i + 1)));
    const rows = h('div', { class: 'rt-rows' }, param('Radius (mm)', el, `surfaces.${i}.R`, { blank: null, placeholder: 'flat' }),
      // where the surface is: out to its clear radius (the lens's own unless given), from its hole (none unless given)
      param('Clear radius (mm)', el, `surfaces.${i}.semi`, { blank: null, placeholder: (el.diameter / 2).toPrecision(4) }), param('Hole radius (mm)', el, `surfaces.${i}.hole`, { blank: 0 }));
    // a conic and aspheric terms are an asphere's: a plain lens's surfaces are spheres
    if (el.asphere) rows.append(param('Conic k', el, `surfaces.${i}.k`, { blank: 0 }));
    if (s.a2 !== 0) rows.append(param('A2 (mm⁻¹)', el, `surfaces.${i}.a2`, { blank: 0 }));
    if (s.odd && s.odd[0]) {
      // an axicon's cone, given as its base angle; stored as the odd r^1 sag term
      const cid = 'rtf' + (setFid(fid + 1));
      const cone = numInput(cid, () => +(Math.atan(s.odd[0]) / deg).toPrecision(6), v => { if (Math.abs(v) < 80) s.odd[0] = Math.tan(v * deg); });
      rows.append(h('div', { class: 'rt-f wide' }, h('label', { for: cid }, 'Cone angle (°)'), cone));
    }
    if (el.asphere) s.A.forEach((_, j) => rows.append(param('A' + (4 + 2 * j), el, `surfaces.${i}.A.${j}`, { blank: 0 })));
    if (el.asphere) rows.append(h('div', { class: 'rt-inline wide' },
      h('button', { class: 'rt-link', type: 'button', onclick: () => { checkpoint(); s.A.push(0); changed(true); } },
        s.A.length ? 'Add A' + (4 + 2 * s.A.length) + ' term' : 'Add aspheric terms'),
      s.A.length ? h('button', { class: 'rt-link', type: 'button', onclick: () => {
        checkpoint(); removeSweeps(el, `surfaces.${i}.A.${s.A.length - 1}`); s.A.pop(); changed(true);
      } }, 'Remove A' + (2 + 2 * s.A.length)) : null,
    ));
    // an asphere's freeform terms, c x^m y^n on the sag (x up, y across): those it has, and one more to add
    if (el.asphere) rows.append(...ffRows(el, s, `surfaces.${i}.F`, 'surface ' + (i + 1)));
    // a diffractive lens's phase on this face, c ρ² … in radians: those it has, and one more to add
    if (el.diffractive) {
      const ph = s.ph || [];
      ph.forEach((_, j) => rows.append(param('Phase ' + dpLabel(j) + ' (rad)', el, `surfaces.${i}.ph.${j}`, { blank: 0 })));
      rows.append(h('div', { class: 'rt-inline wide', title: 'The phase written on this face, φ = c₁ρ² + c₂ρ⁴ + …, radians at ρ mm from the axis' },
        ph.length < DP_N ? h('button', { class: 'rt-link', type: 'button', 'aria-label': 'Add a phase term to surface ' + (i + 1), onclick: () => { checkpoint(); s.ph = ph.concat(0); changed(true); } },
          ph.length ? 'Add ' + dpLabel(ph.length) + ' phase term' : 'Add a diffractive phase') : null,
        ph.length ? h('button', { class: 'rt-link', type: 'button', onclick: () => {
          checkpoint(); removeSweeps(el, `surfaces.${i}.ph.${ph.length - 1}`); s.ph = ph.slice(0, -1); if (!s.ph.length) delete s.ph; changed(true);
        } }, 'Remove ' + dpLabel(ph.length - 1) + ' term') : null));
    }
    panel.append(rows);
    panel.append(coatingRows(el, s));
    if (s.coat && s.coat.mode === 'mirror') panel.append(h('p', { class: 'note' }, 'A mirror coating: light meeting this surface reflects and stays in the glass it came from (a surface stacked in its hole, or round it, takes the rest).'));

    if (i < N - 1) {
      const m = el.materials[i];
      const mrows = h('div', { class: 'rt-rows', style: 'margin-top:0.6rem' },
        param(i === 0 && N === 2 ? 'Centre thickness (mm)' : 'Thickness to ' + (i + 2) + ' (mm)', el, `gaps.${i}`, el.gaps[i] === 0 ? { blank: 0, placeholder: 'stacked' } : {}),
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
      // a graded lens's glass: its index's terms in r from the axis, those it has and one more to add
      if (el.graded && m.glass !== 'AIR') {
        const G = m.grad || [], unit = ['mm⁻²', 'mm⁻⁴', 'mm⁻⁶'];
        G.forEach((_, j) => mrows.append(param('Gradient ' + grLabel(j) + ' (' + unit[j] + ')', el, `materials.${i}.grad.${j}`, { blank: 0, wide: true })));
        mrows.append(h('div', { class: 'rt-inline wide', title: 'The index n(r) = n + g₂r² + g₄r⁴ + g₆r⁶ in this glass, r mm from the lens\u2019s axis: below 0, it falls away from the axis and focuses' },
          G.length < GR_N ? h('button', { class: 'rt-link', type: 'button', 'aria-label': 'Add a gradient term to glass ' + (i + 1), onclick: () => { checkpoint(); m.grad = G.concat(0); changed(true); } },
            G.length ? 'Add ' + grLabel(G.length) + ' gradient term' : 'Grade this glass') : null,
          G.length ? h('button', { class: 'rt-link', type: 'button', onclick: () => {
            checkpoint(); removeSweeps(el, `materials.${i}.grad.${G.length - 1}`); m.grad = G.slice(0, -1); if (!m.grad.length) delete m.grad; changed(true);
          } }, 'Remove ' + grLabel(G.length - 1) + ' term') : null));
      }
      panel.append(mrows);
      if (el.gaps[i] === 0) panel.append(h('p', { class: 'note' }, 'Surface ' + (i + 2) + ' is stacked on this one, at the same vertex: the two make one face, each applying between its hole and its clear radius. Give the thickness a value to part them.'));
    }
  }
  // a made-to-order RF lens: how it is mounted
  if (el.mmw && el.materials.length === 1 && RF_MAT[el.materials[0].glass] && RF_MAT[el.materials[0].glass].print) mountSection(el);
  panel.append(h('div', { class: 'rt-readout', 'data-readout': 'lens' }));
  // an RF lens: the system it is part of designed in the RF designer (made an assembly of its own first if it is not one)
  if (el.mmw) panel.append(h('div', { class: 'rt-rows' }, h('button', { class: 'rt-btn', type: 'button', title: 'Its feed horn’s beam through it to the goal: design the lens and the system in the RF designer',
    onclick: () => { const a = asmOf(el) || makeAssembly([el]); if (a) openLensDesign(a); } }, 'Design as an RF assembly…')));
  if (el.mmw) rfLensPatternSection(el);                                     // an RF lens with its horn, as an antenna
  if (el.mmw) { const o = orderRow(el); if (o) panel.append(o); }          // an RF lens that can be made: ask for a quote
  panel.append(h('div', { class: 'rt-actions' },
    h('button', { class: 'rt-btn', onclick: () => { checkpoint(); flipLens(el); changed(true); } }, 'Flip'),
  ));
}

/* a surface's freeform terms on the bench: each a number, taken off with its ×, and a list of those it has not */
export function ffRows(el, obj, path, what) {
  const F = obj.F || {}, out = FF_KEYS.filter(k => k in F).map(k => {
    const row = param(ffLabel(k) + ' (freeform)', el, path + '.' + k, { blank: 0 });
    row.append(h('button', { type: 'button', class: 'rt-link', title: 'Take this term off', 'aria-label': 'Take ' + ffLabel(k) + ' off ' + what, onclick: () => {
      checkpoint(); removeSweeps(el, path + '.' + k); const G = Object.assign({}, obj.F); delete G[k]; if (Object.keys(G).length) obj.F = G; else delete obj.F; changed(true);
    } }, '×'));
    return row;
  });
  const left = FF_KEYS.filter(k => !(k in F));
  if (left.length) {
    const pick = h('select', { 'aria-label': 'Freeform term to add to ' + what }, h('option', { value: '' }, 'Add a freeform term…'), ...left.map(k => h('option', { value: k }, ffLabel(k))));
    pick.addEventListener('change', () => { if (!pick.value) return; checkpoint(); obj.F = Object.assign({}, obj.F || {}, { [pick.value]: 0 }); changed(true); });
    out.push(h('div', { class: 'rt-inline wide', title: 'Terms c x^m y^n added to its sag: x up out of the bench plane, y across the part' }, pick));
  }
  return out;
}

function hitLens(el, lx, ly, tol) {
  const ss = elementSurfaces(el), a = ss[0], b = ss[ss.length - 1], r = el.diameter / 2 + tol;
  return Math.abs(ly) <= r && lx >= a.xmin - tol && lx <= b.xmax + tol;
}

export const LENS_UI = {
  draw: drawLens, hit: hitLens, panel: lensPanel, rank: 3,
};
