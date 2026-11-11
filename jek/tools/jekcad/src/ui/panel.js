import { MATERIALS, appliedCount, canMove, featureLabel, newFeature, partLook } from '../core/doc.js';
import { fmtNum } from '../core/units.js';
import { h } from '../../../jekray/src/ui/dom.js';
import { app, changed, checkpoint, editGate, emit, on, toast } from './app.js';
import { editFeature, fieldPick, fieldWants, openFeature, setPartLook } from './dialog.js';
import { kernelAsk } from '../page/kernel.js';

/* ==========================================================================
   The left panel: the feature list (the origin and the three planes, then each feature in order, the rollback bar
   after the last one applied, which drags), and under it the parts list (each part's name, colour and material).
   Every row has an eye: the origin, a plane and a sketch are shown or hidden by it; a feature that made parts shows
   or hides them; a feature that only changes a part (a fillet, a cut) is suppressed by it, the model shown without
   it. A feature clicked is picked: its sketch's dimensions show on the model, to be double-clicked and changed.
   A feature: double-click to edit; its menu (right-click, or ⋯) to rename, suppress, roll to, move, delete; drag
   it to reorder (where what it uses allows). A failed feature is red, its reason in its row. And the measure box
   in the view's corner: what the selection measures.
   ========================================================================== */
const ICON_OF = { sketch: 'sketch', plane: 'plane', extrude: 'extrude', revolve: 'revolve', sweep: 'sweep', loft: 'loft', fillet: 'fillet', chamfer: 'chamfer', shell: 'shell', hole: 'hole', lpattern: 'lpattern', cpattern: 'cpattern', mirror: 'mirror', boolean: 'boolean', import: 'import', delete: 'trash' };
let menuEl = null;
function closeRowMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
function rowMenu(x, y, items) {
  closeRowMenu();
  menuEl = h('div', { class: 'rt-menu rt-imenu cad-rowmenu', role: 'menu' }, ...items.filter(Boolean).map(it => (it === 'sep' ? h('div', { class: 'sep' }) : h('button', { type: 'button', role: 'menuitem', disabled: it[2] === false ? true : null, onclick: () => { closeRowMenu(); it[1](); } }, it[0]))));
  document.body.append(menuEl);
  menuEl.style.left = Math.min(x, innerWidth - menuEl.offsetWidth - 8) + 'px'; menuEl.style.top = Math.min(y, innerHeight - menuEl.offsetHeight - 8) + 'px';
  const b = menuEl.querySelector('button'); if (b) b.focus();
}
const statusOf = id => (app.result ? app.result.features.find(r => r.id === id) : null);
export function moveFeature(i, j) {
  if (!editGate()) return false;
  if (!canMove(app.doc, i, j)) { toast('It cannot move there: a feature cannot come before what it uses', true); return false; }
  checkpoint();
  const [f] = app.doc.features.splice(i, 1);
  app.doc.features.splice(j, 0, f);
  changed();
  return true;
}
export function deleteFeature(i) {
  const f = app.doc.features[i];
  if (!f || !editGate()) return;
  checkpoint();
  app.doc.features.splice(i, 1);
  if (app.doc.rollback !== null && i < app.doc.rollback) app.doc.rollback--;
  if (app.doc.rollback !== null && app.doc.rollback >= app.doc.features.length) app.doc.rollback = null;
  changed();
  toast('Deleted “' + f.name + '”. Undo brings it back; features that used it now show why they fail.');
}
export function setRollback(n) {
  if (!editGate()) { renderPanel(); return; }
  checkpoint();
  app.doc.rollback = n >= app.doc.features.length ? null : Math.max(0, n);
  changed();
}
function renameFeature(i) {
  if (!editGate()) return;
  const f = app.doc.features[i], row = document.querySelector('.cad-frow-f[data-i="' + i + '"] .nm');
  if (!row) return;
  const inp = h('input', { type: 'text', value: f.name, class: 'cad-rename', 'aria-label': 'New name' });
  row.replaceWith(inp); inp.focus(); inp.select();
  const done = ok => { if (ok && inp.value.trim() && inp.value.trim() !== f.name) { checkpoint(); f.name = inp.value.trim(); changed(); } else renderPanel(); };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
  inp.addEventListener('blur', () => done(true));
}
function featureMenu(i, x, y) {
  const f = app.doc.features[i], n = appliedCount(app.doc);
  rowMenu(x, y, [['Edit…', () => editFeature(i)], ['Rename', () => renameFeature(i)],
    [f.suppressed ? 'Unsuppress' : 'Suppress', () => { if (!editGate()) return; checkpoint(); if (f.suppressed) delete f.suppressed; else f.suppressed = true; changed(); }],
    f.type === 'sketch' || f.type === 'plane' ? [f.hide ? 'Show' : 'Hide', () => { checkpoint(); if (f.hide) delete f.hide; else f.hide = true; changed(); }] : null,
    'sep', ['Roll to here', () => setRollback(i + 1), i + 1 !== n], ['Move up', () => moveFeature(i, i - 1), canMove(app.doc, i, i - 1)], ['Move down', () => moveFeature(i, i + 1), canMove(app.doc, i, i + 1)],
    'sep', ['Delete', () => deleteFeature(i)]]);
}
/* ---------- the eye on each row ---------- */
const eyeBtn = (off, what, fn) => h('button', { type: 'button', class: 'cad-eye' + (off ? ' off' : ''), 'data-icon': off ? 'eyeoff' : 'eye', 'aria-pressed': String(!off), title: (off ? 'Show ' : 'Hide ') + what, 'aria-label': (off ? 'Show ' : 'Hide ') + what, onclick: e => { e.stopPropagation(); fn(); } });
function toggleStd(k) { checkpoint(); const hd = app.doc.hide || (app.doc.hide = {}); if (hd[k]) delete hd[k]; else hd[k] = true; changed(); }
/* the parts a feature made that are still there (what its eye shows and hides) */
function madeParts(f) { const st = statusOf(f.id), made = st && st.info && st.info.made || [], have = new Set((app.result ? app.result.parts : []).map(p => p.id)); return made.filter(id => have.has(id)); }
const isHidden = f => (f.type === 'sketch' || f.type === 'plane' ? !!f.hide : (() => { const m = madeParts(f); return m.length ? m.every(id => (app.doc.parts[id] || {}).hidden) : !!f.suppressed; })());
export function toggleFeatureShown(i) {
  const f = app.doc.features[i];
  if (!f) return;
  // (showing and hiding is looking; a feature that can only be suppressed is changed by it)
  if (f.type !== 'sketch' && f.type !== 'plane' && !madeParts(f).length && !editGate()) return;
  checkpoint();
  if (f.type === 'sketch' || f.type === 'plane') { if (f.hide) delete f.hide; else f.hide = true; }
  else {
    const m = madeParts(f);
    if (m.length) { const hide = !m.every(id => (app.doc.parts[id] || {}).hidden); for (const id of m) { const p = app.doc.parts[id] || (app.doc.parts[id] = {}); if (hide) p.hidden = true; else delete p.hidden; } }
    else if (f.suppressed) delete f.suppressed; else f.suppressed = true;
  }
  changed();
}
/* ---------- the feature list ---------- */
export function renderPanel() {
  const list = document.getElementById('featureList');
  if (!list) return;
  const doc = app.doc, n = app.sketch ? app.sketch.at : appliedCount(doc), rows = [];
  const wantsFeatures = fieldWants() === 'features';
  const hid = doc.hide || {};
  const planeRow = (k, name) => h('li', { class: 'cad-frow-p' + (hid[k] ? ' hid' : '') + (app.sel.some(s => s.kind === 'plane' && s.std === k) ? ' picked' : ''), 'data-plane': k, title: 'Double-click to sketch on it', ondblclick: e => { if (e.target.closest('button') || app.sketch || app.editing) return; app.sel = []; emit('sel'); openFeature('sketch', { plane: { std: k } }); }, onclick: () => { const p = { kind: 'plane', std: k, name }; if (fieldWants() === 'plane') fieldPick(p); else { app.sel = [p]; emit('sel'); } } }, h('span', { class: 'ic2', 'data-icon': 'plane' }), h('span', { class: 'nm' }, name), eyeBtn(hid[k], 'the ' + name + ' plane', () => toggleStd(k)));
  rows.push(h('li', { class: 'cad-frow-p origin' + (hid.origin ? ' hid' : ''), 'data-plane': 'origin' }, h('span', { class: 'ic2', 'data-icon': 'cube' }), h('span', { class: 'nm' }, 'Origin'), eyeBtn(hid.origin, 'the origin', () => toggleStd('origin'))),
    planeRow('top', 'Top'), planeRow('front', 'Front'), planeRow('right', 'Right'));
  const bar = () => h('li', { class: 'cad-rollbar', id: 'rollbar', draggable: 'false', title: 'The rollback bar: drag it to see the model as it was there; new features go in at it', role: 'separator', 'aria-label': 'Rollback bar' });
  doc.features.forEach((f, i) => {
    if (i === n) rows.push(bar());
    const st = statusOf(f.id), err = st && st.ok === false, rolled = i >= n, editing = (app.editing && !app.editing.isNew && app.editing.at === i) || (app.sketch && !app.sketch.isNew && app.sketch.at === i);
    const chosen = wantsFeatures && app.editing.f.items.includes(f.id);
    const solid = f.type !== 'sketch' && f.type !== 'plane', off = isHidden(f), parts = solid ? madeParts(f) : [];
    const li = h('li', { class: 'cad-frow-f' + (err ? ' err' : '') + (rolled ? ' rolled' : '') + (f.suppressed ? ' supp' : '') + (editing ? ' editing' : '') + (chosen ? ' chosen' : '') + (off && !f.suppressed ? ' hid' : '') + (app.picked === f.id ? ' picked' : ''), 'data-i': String(i), 'data-id': f.id, draggable: 'true', tabindex: '0',
      title: err ? featureLabel(f.type) + ' failed: ' + st.error : featureLabel(f.type) + (f.suppressed ? ' (suppressed)' : rolled ? ' (after the rollback bar)' : '') },
    h('span', { class: 'ic2', 'data-icon': ICON_OF[f.type] || 'cube' }), h('span', { class: 'nm' }, f.name),
    eyeBtn(off, !solid ? f.name : parts.length ? (parts.length === 1 ? 'the part ' : 'the parts ') + f.name + ' made' : f.name + ' (suppress it: the model without it)', () => toggleFeatureShown(i)),
    h('button', { type: 'button', class: 'cad-more', 'aria-label': 'More for ' + f.name, title: 'More', onclick: e => { e.stopPropagation(); const r = e.target.getBoundingClientRect(); featureMenu(i, r.left, r.bottom + 2); } }, '⋯'),
    err ? h('span', { class: 'cad-ferr' }, st.error) : null);
    li.addEventListener('dblclick', () => editFeature(i));
    li.addEventListener('click', e => { if (wantsFeatures) { fieldPick({ kind: 'feature', feature: f.id }); return; } if (e.target.closest('button, input') || app.sketch || app.editing) return; app.picked = app.picked === f.id ? null : f.id; emit('picked'); });
    li.addEventListener('keydown', e => { if (e.key === 'Enter') editFeature(i); if (e.key === 'Delete') deleteFeature(i); });
    li.addEventListener('contextmenu', e => { e.preventDefault(); featureMenu(i, e.clientX, e.clientY); });
    li.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-jekcad-feature', String(i)); e.dataTransfer.effectAllowed = 'move'; });
    li.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/x-jekcad-feature')) { e.preventDefault(); li.classList.add('dropat'); } });
    li.addEventListener('dragleave', () => li.classList.remove('dropat'));
    li.addEventListener('drop', e => { e.preventDefault(); li.classList.remove('dropat'); const from = +e.dataTransfer.getData('text/x-jekcad-feature'); if (Number.isInteger(from) && from !== i) moveFeature(from, i); });
    rows.push(li);
  });
  if (n >= doc.features.length) rows.push(bar());
  if (!doc.features.length) rows.push(h('li', { class: 'cad-empty' }, 'No features yet. Start with Sketch: click a plane, draw, dimension, finish; then Extrude.'));
  list.replaceChildren(...rows);
  wireRollbar(list);
  renderParts();
  emit('icons', list);
}
/* the bar dragged: it settles between the rows it is dropped between */
function wireRollbar(list) {
  const bar = document.getElementById('rollbar');
  if (!bar) return;
  bar.addEventListener('pointerdown', e => {
    e.preventDefault();
    bar.setPointerCapture(e.pointerId); bar.classList.add('drag');
    const rows = [...list.querySelectorAll('.cad-frow-f')];
    const at = y => { let k = 0; for (const r of rows) { const b = r.getBoundingClientRect(); if (y > b.top + b.height / 2) k = +r.dataset.i + 1; } return k; };
    const move = ev => { const k = at(ev.clientY); for (const r of rows) r.classList.toggle('rolled', +r.dataset.i >= k); };
    const up = ev => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.classList.remove('drag'); const k = at(ev.clientY); if (k !== appliedCount(app.doc)) setRollback(k); else renderPanel(); };
    bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up);
  });
}
/* a whole part taken away: a Delete part feature added where the list ends (the bar), so it can be undone,
   suppressed or rolled before like any other; the part's colour and name are kept in case it comes back */
export function deletePart(id, name) {
  if (!editGate() || app.sketch || app.editing) return false;
  checkpoint();
  const at = appliedCount(app.doc), f = newFeature(app.doc, 'delete', { targets: [id] });
  if (name) f.name = 'Delete ' + name;
  app.doc.features.splice(at, 0, f);
  if (app.doc.rollback !== null) app.doc.rollback = Math.min(app.doc.features.length, app.doc.rollback + 1);
  app.sel = app.sel.filter(s => s.part !== id); emit('sel');
  changed();
  toast('Deleted ' + (name || 'the part') + ': a “' + f.name + '” feature in the list. Undo, or delete that feature, brings it back.');
  return true;
}
/* ---------- the parts list ---------- */
function renderParts() {
  const box = document.getElementById('partsList');
  if (!box) return;
  const parts = app.result ? app.result.parts : [];
  document.getElementById('partsCount').textContent = '(' + parts.length + ')';
  box.replaceChildren(...parts.map((p, i) => {
    const look = partLook(app.doc, p.id, i), sel = app.sel.some(s => s.kind === 'part' && s.part === p.id);
    const colour = h('input', { type: 'color', value: look.colour, 'aria-label': 'Colour of ' + look.name, title: 'Appearance', onchange: e => setPartLook(p.id, 'colour', e.target.value) });
    const mat = h('select', { 'aria-label': 'Material of ' + look.name, title: 'Material (its density gives the mass)', onchange: e => setPartLook(p.id, 'material', e.target.value) }, h('option', { value: '' }, 'No material'), ...MATERIALS.map(([m, d]) => h('option', { value: m, selected: look.material === m ? true : null }, m + ' (' + d + ' g/cm³)')));
    const name = h('span', { class: 'nm', title: 'Double-click to rename' }, look.name);
    name.addEventListener('dblclick', e => { e.stopPropagation(); const inp = h('input', { type: 'text', value: look.name, class: 'cad-rename', 'aria-label': 'Part name' }); name.replaceWith(inp); inp.focus(); inp.select(); const done = ok => { if (ok && inp.value.trim()) setPartLook(p.id, 'name', inp.value.trim()); else renderParts(); }; inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); }); inp.addEventListener('blur', () => done(true)); });
    const li = h('li', { class: 'cad-part' + (sel ? ' sel' : '') + (look.hidden ? ' hid' : ''), 'data-part': p.id },
      colour, name,
      h('button', { type: 'button', class: 'cad-more', title: look.hidden ? 'Show' : 'Hide', 'aria-label': (look.hidden ? 'Show ' : 'Hide ') + look.name, onclick: e => { e.stopPropagation(); setPartLook(p.id, 'hidden', look.hidden ? null : true); } }, look.hidden ? '◌' : '●'),
      h('button', { type: 'button', class: 'cad-more', 'aria-label': 'More for ' + look.name, onclick: e => { e.stopPropagation(); const r = e.target.getBoundingClientRect(); rowMenu(r.left, r.bottom + 2, [['Export as STEP…', () => emit('exportPart', { id: p.id, fmt: 'step' })], ['Export as STL…', () => emit('exportPart', { id: p.id, fmt: 'stl' })], 'sep', ['Delete part', () => deletePart(p.id, look.name)]]); } }, '⋯'),
      h('div', { class: 'cad-partmat' }, mat));
    // (not from its colour, its material list or its buttons: choosing the part redraws the row, which would shut the list)
    li.addEventListener('click', e => { if (e.target.closest('select, input, button')) return; const pk = { part: p.id, kind: 'part' }; if (fieldWants() === 'parts') { fieldPick(pk); return; } if (e.ctrlKey || e.shiftKey || e.metaKey) { const k = app.sel.findIndex(s => s.kind === 'part' && s.part === p.id); if (k >= 0) app.sel.splice(k, 1); else app.sel.push(pk); } else app.sel = [pk]; emit('sel'); });
    return li;
  }));
}
/* ---------- measure: what the selection measures, in the view's corner ---------- */
let measureSeq = 0;
async function measureShown() {
  const box = document.getElementById('measure');
  if (!box) return;
  if (app.asm) { box.hidden = true; return; }           // (an assembly's parts are measured in their Part Studios)
  const picks = app.sel.filter(s => s.part && (s.kind === 'part' || s.kind === 'face' || s.kind === 'edge' || s.kind === 'vertex')).slice(0, 2);
  if (!picks.length || app.sketch) { box.hidden = true; return; }
  const seq = ++measureSeq;
  let m;
  try { m = await kernelAsk('measure', { picks, doc: app.doc }); } catch (err) { box.hidden = true; return; }
  if (seq !== measureSeq) return;
  const L = [], mm = v => fmtNum(v, 3) + ' mm', mm2 = v => fmtNum(v, 3) + ' mm²';
  for (const it of m.items) {
    if (it.kind === 'part') L.push([it.name, ''], ['Volume', fmtNum(it.volume, 3) + ' mm³'], ['Surface area', mm2(it.area)], ['Mass', it.mass !== null ? fmtNum(it.mass, 3) + ' g (' + it.density + ' g/cm³)' : 'choose a material'], ['Centre of mass', it.centroid.map(v => fmtNum(v, 3)).join(', ')]);
    else if (it.kind === 'face') L.push(['Face (' + it.type + ')', mm2(it.area)], it.radius ? ['Radius', mm(it.radius)] : null);
    else if (it.kind === 'edge') L.push(['Edge (' + it.type + ')', mm(it.length)], it.radius ? ['Radius', mm(it.radius)] : null);
    else L.push(['Vertex', it.pt.map(v => fmtNum(v, 3)).join(', ')]);
  }
  if (m.distance !== undefined) L.push(['Distance', mm(m.distance)]);
  if (m.angle !== undefined) L.push(['Angle', fmtNum(m.angle, 3) + '°']);
  box.replaceChildren(h('dl', null, ...L.filter(Boolean).flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])));
  box.hidden = false;
}
export function wirePanel() {
  on('model', renderPanel); on('doc', renderPanel); on('history', renderPanel); on('editing', renderPanel); on('sketch', renderPanel);
  on('sel', () => { renderParts(); measureShown(); for (const r of document.querySelectorAll('.cad-frow-p[data-plane]')) r.classList.toggle('picked', app.sel.some(s => s.kind === 'plane' && s.std === r.dataset.plane)); }); on('model', measureShown);
  // (only the mark changes: the rows are not made again, or the second click of a double-click would land on a new row
  // and the double-click, which edits the feature, would never come)
  on('picked', () => { for (const r of document.querySelectorAll('.cad-frow-f')) r.classList.toggle('picked', r.dataset.id === app.picked); });
  document.addEventListener('pointerdown', e => { if (menuEl && !menuEl.contains(e.target)) closeRowMenu(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeRowMenu(); });
}
