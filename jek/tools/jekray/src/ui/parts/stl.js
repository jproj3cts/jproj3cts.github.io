import { STL_UNITS, meshHull, meshHullCache } from '../../core/stl.js';
import { frame } from '../../core/mask.js';
import { ctx, pathLocal, selInk } from '../render.js';
import { inPolygon } from '../pointer.js';
import { helpLine, fid, numInput, panel, param, selectField, setFid } from '../panel.js';
import { h } from '../dom.js';
import { readoutBox } from '../panels.js';
import { changed, toast } from '../actions.js';
import { checkpoint } from '../tabs.js';
import { importStl } from '../experimental.js';
import { saveToMine } from '../myparts.js';
import { proMark } from '../pro.js';
import { editSketch, exportModelStl, rebuildLater } from '../model3d.js';
import { setPalette } from '../rail.js';
import { extrudeTo } from '../../core/model.js';
import { solveSketch } from '../../core/sketch.js';
import { V3D } from '../view3d.js';

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
  if (el.model) return modelPanel(el);
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

/* A modelled part's panel: how it was made, in order (each sketch, each extrude or revolve, added or cut), each changed
   here and the part made again; its colour; and its triangles as a .stl file to make it */
function modelPanel(el) {
  panel.append(h('h3', null, 'Modelled part'));
  const F = el.model.feats, list = h('div', { class: 'rt-mfeats' });
  const solids = () => F.filter(f => f.t !== 'sketch');
  const redo = fn => () => { checkpoint(); fn(); rebuildLater(el); };
  const del = f => {
    if (solids().filter(q => q !== f && !(f.t === 'sketch' && q.sk === f.id)).length === 0) { toast('A modelled part needs a solid: delete the part instead'); return; }
    checkpoint();
    el.model.feats = F.filter(q => q !== f && !(f.t === 'sketch' && q.sk === f.id));
    rebuildLater(el);
  };
  const x = f => h('button', { type: 'button', class: 'rt-link', title: 'Remove ' + f.name + (f.t === 'sketch' ? ' and what is made from it' : ''), 'aria-label': 'Remove ' + f.name, onclick: () => del(f) }, '\u00d7');
  for (const f of F) {
    if (f.t === 'sketch') {
      list.append(h('div', { class: 'rt-mfeat' }, h('b', null, f.name || 'Sketch'), h('span', null, f.ents.length + ' shape' + (f.ents.length === 1 ? '' : 's') + (f.dims ? ', ' + f.dims.length + ' dimension' + (f.dims.length === 1 ? '' : 's') : '')),
        h('button', { type: 'button', class: 'rt-link', onclick: () => editSketch(el, f.id) }, 'Edit sketch\u2026'), x(f)));
      // its dimensions, each to change here: the sketch solved again with it, and the part made again
      if (f.dims && f.dims.length) {
        const NAMES = { dist: 'Distance', len: 'Length', pl: 'Distance', rad: 'Radius', dia: 'Diameter', ang: 'Angle' }, box = h('div', { class: 'rt-mdims' });
        f.dims.forEach((d, i) => {
          const did = 'rtf' + setFid(fid + 1);
          box.append(h('label', { for: did }, NAMES[d.t] + ' ' + (i + 1) + (d.t === 'ang' ? ' (\u00b0)' : ' (mm)')), numInput(did, () => +d.v.toFixed(4), v => {
            if (d.t !== 'ang' && !(v > 0)) return;
            const keep = JSON.stringify(f), v0 = d.v; d.v = v;
            const r = solveSketch(f.ents, f.cons || [], f.dims);
            if (!r.ok) { Object.assign(f, JSON.parse(keep)); d.v = v0; toast('That size conflicts with the sketch\u2019s other constraints and dimensions', true); return; }
            rebuildLater(el);
          }, { commit: true }));
        });
        list.append(box);
      }
      continue;
    }
    const op = h('select', { 'aria-label': (f.name || 'Feature') + ': add or cut' }, h('option', { value: 'add' }, 'Add'), h('option', { value: 'cut' }, 'Cut'));
    op.value = f.op;
    op.addEventListener('change', redo(() => { f.op = op.value; if (f.op !== 'cut') delete f.through; }));
    const row = h('div', { class: 'rt-mfeat' }, h('b', null, f.name || (f.t === 'revolve' ? 'Revolve' : 'Extrude')), op,
      f.regions ? h('span', { title: 'The regions of its sketch it is made of (chosen in the 3D view as it was made)' }, f.regions.filter(q => q[0] < 1e8).length + ' region' + (f.regions.length === 1 ? '' : 's')) : null);
    const nid = 'rtf' + setFid(fid + 1);
    if (f.t === 'extrude') {
      if (!f.through) row.append(h('label', { for: nid }, 'mm'), numInput(nid, () => f.d, v => { if (v !== 0) { extrudeTo(el.model, f.id, Math.max(-1e4, Math.min(1e4, v))); rebuildLater(el); } }, { commit: true }));
      const both = h('input', { type: 'checkbox' }); both.checked = !!f.both;
      both.addEventListener('change', redo(() => { if (both.checked) f.both = true; else delete f.both; }));
      row.append(h('label', { class: 'rt-check', title: 'As far each way from its sketch' }, both, 'Both ways'));
      if (f.op === 'cut') {
        const thr = h('input', { type: 'checkbox' }); thr.checked = !!f.through;
        thr.addEventListener('change', redo(() => { if (thr.checked) f.through = true; else delete f.through; }));
        row.append(h('label', { class: 'rt-check', title: 'Through the whole part, both ways' }, thr, 'Through all'));
      }
    } else row.append(h('label', { for: nid }, '\u00b0'), numInput(nid, () => f.deg, v => { f.deg = Math.max(1, Math.min(360, v)); rebuildLater(el); }, { commit: true }));
    row.append(x(f));
    list.append(row);
  }
  panel.append(list);
  const cid = 'rtf' + setFid(fid + 1), ci = h('input', { type: 'color', id: cid, value: el.colour || '#8a8f96' });
  ci.addEventListener('change', () => { checkpoint(); el.colour = ci.value; changed(false); });
  panel.append(h('div', { class: 'rt-rows' }, h('div', { class: 'rt-f' }, h('label', { for: cid }, 'Colour'), ci)));
  panel.append(h('div', { class: 'rt-actions', style: 'margin-top:0.5rem' },
    h('button', { type: 'button', class: 'rt-btn', title: 'Sketch on one of its faces (or anywhere) in the 3D view, and add to it or cut from it', onclick: async () => { if (!V3D.active()) await V3D.setOn(true); setPalette('model'); } }, 'Add a sketch\u2026'),
    h('button', { type: 'button', class: 'rt-btn', title: 'Its triangles as a .stl file, in millimetres, to make it (a 3D printer, a machinist)', onclick: () => exportModelStl(el) }, 'Export .stl\u2026')));
  panel.append(readoutBox('stl'));
  const M = el.mesh;
  if (M) panel.append(h('p', { class: 'note', style: 'margin-top:0.5rem' }, M.n + ' triangles, ' + Math.max(1, Math.round((M.data.length + JSON.stringify(el.model).length) / 1024)) + ' KB with the bench.'));
  panel.append(helpLine('A part modelled here: an opaque beam block, as an STL object.', ['Made in the 3D view\u2019s Model tools (Experimental), from sketches on flat planes extruded or revolved, each added to the part or cut from it. It keeps how it was made: change a distance, an angle, add or cut here, or a sketch in the 3D view, and it is made again, staying where it is. Rays and beams that meet it stop there, as on any STL object.'], 'note', 'margin-top:0.4rem'));
}

const hitStl = (el, lx, ly, tol) => inPolygon(meshHull(el), lx, ly, tol);

export const STL_UI = {
  draw: drawStl, hit: hitStl, panel: stlPanel, rank: 4,
};
