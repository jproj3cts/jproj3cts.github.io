import { FEATURE_KINDS, MATERIALS, STD_PLANES, appliedCount, featureLabel, newFeature, partLook } from '../core/doc.js';
import { defaultRegionPts, regionAt } from '../core/sketch-tools.js';
import { evalExpr, exprIsFormula, fmtNum } from '../core/units.js';
import { h } from '../../../jekray/src/ui/dom.js';
import { app, changed, checkpoint, emit, on, regenNow, regenSoon, toast } from './app.js';
import { regionsCached, startSketch } from './sketcher.js';
import { kernelAsk } from '../page/kernel.js';

/* ==========================================================================
   The feature dialogs, as a CAD program's: a panel over the view with the feature's settings, its selection
   fields (one active at a time: what is clicked in the view goes into it), and a live preview of the result (the
   model is shown as it was before the feature, the feature's tool body over it in green to add or red to cut).
   OK puts the feature in the list at the rollback bar (or back where it was, edited); Cancel leaves the list as it
   was. Every number field takes units and expressions, and the Variables table's #names.
   ========================================================================== */
const OPS = [['new', 'New'], ['add', 'Add'], ['remove', 'Remove'], ['intersect', 'Intersect']];
const ENDS = [['blind', 'Blind'], ['symmetric', 'Symmetric'], ['upto', 'Up to face'], ['through', 'Through all']];
const SEL_WORDS = { regions: ['region', 'regions'], edges: ['edge or face', 'edges and faces'], faces: ['face', 'faces'], face: ['face', 'face'], edge: ['edge', 'edge'], plane: ['plane or flat face', 'plane'], sketchLine: ['line of the sketch', 'line'], sketch: ['sketch', 'sketch'], parts: ['part', 'parts'], features: ['feature', 'features'], sections: ['profile', 'profiles'] };
/* each feature's settings: [key, label, kind, more] */
export const FEATURE_FORMS = {
  plane: [['ref', 'Plane or face', 'sel', { pick: 'plane' }], ['offset', 'Offset', 'expr', { unit: 'len' }], ['flip', 'Opposite direction', 'check']],
  extrude: [['op', '', 'seg', { options: OPS }], ['regions', 'Faces and sketch regions to extrude', 'sel', { pick: 'regions' }], ['end', 'End', 'select', { options: ENDS }],
    ['depth', 'Depth (below 0: the other way)', 'expr', { unit: 'len', show: f => f.end === 'blind' || f.end === 'symmetric' }], ['upto', 'Up to face', 'sel', { pick: 'face', show: f => f.end === 'upto' }], ['flip', 'Opposite direction', 'check', { show: f => f.end === 'through' || f.end === 'upto' }],
    ['draft', 'Draft angle', 'expr', { unit: 'ang' }], ['second', 'Second end position', 'check', { show: f => f.end !== 'symmetric' }],
    ['end2', 'Second end', 'select', { options: ENDS.filter(e => e[0] !== 'symmetric'), show: f => f.second && f.end !== 'symmetric' }], ['depth2', 'Second depth', 'expr', { unit: 'len', show: f => f.second && f.end !== 'symmetric' && f.end2 === 'blind' }],
    ['upto2', 'Second: up to face', 'sel', { pick: 'face', show: f => f.second && f.end2 === 'upto' }], ['targets', 'Parts to change (none: all it meets)', 'sel', { pick: 'parts', show: f => f.op !== 'new' }]],
  revolve: [['op', '', 'seg', { options: OPS }], ['regions', 'Sketch regions to revolve', 'sel', { pick: 'regions' }], ['axis', 'Axis: a line of the sketch', 'sel', { pick: 'sketchLine' }],
    ['kind', 'Revolve', 'select', { options: [['full', 'Full'], ['one', 'One direction'], ['sym', 'Symmetric']] }], ['angle', 'Angle', 'expr', { unit: 'ang', show: f => f.kind !== 'full' }], ['flip', 'Opposite direction', 'check', { show: f => f.kind === 'one' }],
    ['targets', 'Parts to change (none: all it meets)', 'sel', { pick: 'parts', show: f => f.op !== 'new' }]],
  sweep: [['op', '', 'seg', { options: OPS }], ['regions', 'Profile: sketch regions', 'sel', { pick: 'regions' }], ['path', 'Path: a sketch of joined shapes', 'sel', { pick: 'sketch' }], ['targets', 'Parts to change', 'sel', { pick: 'parts', show: f => f.op !== 'new' }]],
  loft: [['op', '', 'seg', { options: OPS }], ['sections', 'Profiles, in order', 'sel', { pick: 'sections' }], ['ruled', 'Straight between profiles (ruled)', 'check'], ['targets', 'Parts to change', 'sel', { pick: 'parts', show: f => f.op !== 'new' }]],
  fillet: [['edges', 'Edges or faces to round (tangent edges follow)', 'sel', { pick: 'edges' }], ['radius', 'Radius', 'expr', { unit: 'len' }]],
  chamfer: [['edges', 'Edges or faces to bevel (tangent edges follow)', 'sel', { pick: 'edges' }], ['distance', 'Distance', 'expr', { unit: 'len' }]],
  shell: [['faces', 'Faces to remove', 'sel', { pick: 'faces' }], ['thickness', 'Thickness', 'expr', { unit: 'len' }], ['outward', 'Thicken outward', 'check']],
  hole: [['sketch', 'Sketch with points (each a hole)', 'sel', { pick: 'sketch' }], ['kind', 'Hole', 'select', { options: [['simple', 'Simple'], ['cbore', 'Counterbore'], ['csink', 'Countersink']] }], ['dia', 'Diameter', 'expr', { unit: 'len' }],
    ['end', 'End', 'select', { options: [['blind', 'Blind'], ['through', 'Through all']] }], ['depth', 'Depth', 'expr', { unit: 'len', show: f => f.end === 'blind' }], ['tip', 'Drill tip (118°)', 'check', { show: f => f.end === 'blind' }],
    ['cbDia', 'Counterbore diameter', 'expr', { unit: 'len', show: f => f.kind === 'cbore' }], ['cbDepth', 'Counterbore depth', 'expr', { unit: 'len', show: f => f.kind === 'cbore' }],
    ['csDia', 'Countersink diameter', 'expr', { unit: 'len', show: f => f.kind === 'csink' }], ['csAngle', 'Countersink angle', 'expr', { unit: 'ang', show: f => f.kind === 'csink' }], ['targets', 'Parts to cut (none: all)', 'sel', { pick: 'parts' }]],
  lpattern: [['of', 'Pattern', 'seg', { options: [['features', 'Features'], ['parts', 'Parts']] }], ['items', 'What to pattern', 'sel', { pick: f => (f.of === 'parts' ? 'parts' : 'features') }],
    ['dir', 'Direction', 'select', { options: [['x', 'x'], ['y', 'y'], ['z', 'z']], show: f => !f.dirRef }], ['dirRef', 'Or along an edge', 'sel', { pick: 'edge' }], ['flip', 'Opposite direction', 'check'], ['count', 'Instances', 'expr', { unit: 'num' }], ['spacing', 'Spacing', 'expr', { unit: 'len' }]],
  cpattern: [['of', 'Pattern', 'seg', { options: [['features', 'Features'], ['parts', 'Parts']] }], ['items', 'What to pattern', 'sel', { pick: f => (f.of === 'parts' ? 'parts' : 'features') }],
    ['axis', 'Axis', 'select', { options: [['x', 'x'], ['y', 'y'], ['z', 'z']], show: f => !f.axisRef }], ['axisRef', 'Or about an edge (straight or round)', 'sel', { pick: 'edge' }], ['count', 'Instances', 'expr', { unit: 'num' }], ['angle', 'Angle (360°: equally round)', 'expr', { unit: 'ang' }]],
  mirror: [['of', 'Mirror', 'seg', { options: [['features', 'Features'], ['parts', 'Parts']] }], ['items', 'What to mirror', 'sel', { pick: f => (f.of === 'parts' ? 'parts' : 'features') }], ['plane', 'Mirror plane', 'sel', { pick: 'plane' }]],
  boolean: [['op', '', 'seg', { options: [['union', 'Union'], ['subtract', 'Subtract'], ['intersect', 'Intersect']] }], ['targets', 'Parts', 'sel', { pick: 'parts' }], ['tools', 'Tools', 'sel', { pick: 'parts', show: f => f.op !== 'union' }], ['keep', 'Keep the tools', 'check', { show: f => f.op !== 'union' }]],
  import: [['file', 'STEP file', 'file']],
};
const pickOf = (fd, f) => (typeof fd[3].pick === 'function' ? fd[3].pick(f) : fd[3].pick);
/* ---------- opening ---------- */
export function openFeature(type, opts) {
  if (app.sketch) { toast('Finish the sketch first'); return; }
  if (app.editing) closeDialog(false);
  const at = appliedCount(app.doc), f = newFeature(app.doc, type);
  const planeSel = app.sel.find(s => s.kind === 'plane' || s.kind === 'face');     // before prefill empties the selection
  prefill(f, at);
  if (type === 'sketch') {
    if (planeSel) { refFor(planeSel).then(r => { if (!r) { toast('Choose a plane or a flat face to sketch on', true); return; } f.plane = r; startSketch(f, at, true); }); return; }
    if (opts && opts.plane) { f.plane = opts.plane; startSketch(f, at, true); return; }
    // ask for the plane first
    app.editing = { f, at, isNew: true, field: null, sketchPlane: true };
    showDialog(); activate('plane'); return;
  }
  app.editing = { f, at, isNew: true, field: null };
  showDialog();
  const first = (FEATURE_FORMS[type] || []).find(fd => fd[2] === 'sel' && (!fd[3].show || fd[3].show(f)));
  // (an extrude's or a revolve's regions stay ready to be clicked in the view, though they start chosen: one click takes
  // a region out or puts one in)
  if (first && (!hasValue(f[first[0]]) || first[0] === 'regions')) activate(first[0]);
  regenSoon(0);
}
export function editFeature(i) {
  const f = app.doc.features[i];
  if (!f) return;
  if (app.sketch) { toast('Finish the sketch first'); return; }
  if (app.editing) closeDialog(false);
  if (f.type === 'sketch') { startSketch(f, i, false); return; }
  app.editing = { f: JSON.parse(JSON.stringify(f)), at: i, isNew: false, field: null };
  // an extrude to a depth, ticked Opposite direction (from before a depth could be below 0): the same as a negative depth
  { const g = app.editing.f; if (g.type === 'extrude' && g.flip && (g.end === 'blind' || g.end === 'symmetric')) { g.flip = false; if (g.end === 'blind') g.depth = /^\s*-/.test(g.depth) ? g.depth.replace(/^\s*-\s*/, '') : '-(' + g.depth + ')'; } }
  showDialog();
  // (its regions ready to be clicked in the view, as they are when the feature is new)
  if ((FEATURE_FORMS[f.type] || []).some(fd => fd[0] === 'regions')) activate('regions');
  regenSoon(0);
}
const hasValue = v => (Array.isArray(v) ? v.length > 0 : !!v);
/* what is selected when a feature starts goes into it */
function prefill(f, at) {
  const sel = app.sel;
  const regions = sel.filter(s => s.kind === 'region');
  if (('regions' in f) && regions.length) { f.sketch = regions[0].sketch; f.regions = regions.filter(r => r.sketch === f.sketch).map(r => r.pt); }
  if (f.type === 'loft' && regions.length) { const by = new Map(); for (const r of regions) { if (!by.has(r.sketch)) by.set(r.sketch, []); by.get(r.sketch).push(r.pt); } f.sections = [...by].map(([sketch, regs]) => ({ sketch, regions: regs })); }
  // nothing chosen: the last sketch before the bar, all its regions that are not holes
  if (('regions' in f) && f.type !== 'sweep' && !f.sketch) {
    const sk = app.doc.features.slice(0, at).reverse().find(x => x.type === 'sketch' && !x.suppressed && regionsCached(x).length);
    if (sk) { f.sketch = sk.id; f.regions = defaultRegionPts(sk.ents); }
  }
  // a loft or a sweep with nothing chosen: the sketches no feature has used yet (a loft's profiles in order; a
  // sweep's profile the last with a region, its path the last without one)
  if ((f.type === 'loft' && !f.sections.length) || (f.type === 'sweep' && !f.sketch)) {
    const used = new Set(app.doc.features.flatMap(x => [x.sketch, x.path, ...(x.sections || []).map(s2 => s2.sketch)]));
    const free = app.doc.features.slice(0, at).filter(x => x.type === 'sketch' && !x.suppressed && !used.has(x.id)), closed = free.filter(x => regionsCached(x).length), open = free.filter(x => !regionsCached(x).length && x.ents.some(e => !e.k && e.t !== 'point'));
    if (f.type === 'loft' && closed.length >= 2) f.sections = closed.map(x => ({ sketch: x.id, regions: defaultRegionPts(x.ents) }));
    if (f.type === 'sweep' && closed.length) { const pr = closed[closed.length - 1]; f.sketch = pr.id; f.regions = defaultRegionPts(pr.ents); if (open.length && !f.path) f.path = open[open.length - 1].id; }
  }
  // a revolve about the sketch's centre line: its one construction line, if it has just one
  if (f.type === 'revolve' && f.sketch && !f.axis) { const sk = app.doc.features.find(x => x.id === f.sketch), ls = sk ? sk.ents.filter(e => e.t === 'line' && e.k && !e.ref) : []; if (ls.length === 1) f.axis = { e: ls[0].id }; }
  if (f.type === 'hole' && !f.sketch) { const sk = app.doc.features.slice(0, at).reverse().find(x => x.type === 'sketch' && x.ents.some(e => e.t === 'point' && !e.k)); if (sk) f.sketch = sk.id; }
  const parts = sel.filter(s => s.kind === 'part').map(s => s.part);
  if (f.type === 'boolean' && parts.length) { f.targets = parts.slice(0, 1); f.tools = parts.slice(1); }
  if ((f.type === 'lpattern' || f.type === 'cpattern' || f.type === 'mirror') && parts.length) { f.of = 'parts'; f.items = parts; }
  const plane = sel.find(s => s.kind === 'plane');
  if (f.type === 'plane' && plane) f.ref = plane.std ? { std: plane.std } : { feature: plane.feature };
  if (f.type === 'mirror' && plane) f.plane = plane.std ? { std: plane.std } : { feature: plane.feature };
  const model = sel.filter(s => s.kind === 'edge' || s.kind === 'face');
  if (model.length && (f.type === 'fillet' || f.type === 'chamfer' || f.type === 'shell' || (f.type === 'plane' && !plane))) {
    kernelAsk('refs', { picks: model }).then(rs => {
      if (!app.editing || app.editing.f !== f) return;
      if (f.type === 'shell') f.faces = rs.filter(r => r.kind === 'face');
      else if (f.type === 'plane') { const r = rs.find(x => x.kind === 'face' && x.type === 'plane'); if (r) f.ref = r; }
      else f.edges = rs;
      showDialog(); regenSoon(0);
    }).catch(() => {});
  }
  if (sel.length) { app.sel = []; emit('sel'); }
}
/* a ref for a pick: planes and regions as they are, model items from the kernel */
async function refFor(s) {
  if (s.kind === 'plane') return s.std ? { std: s.std } : { feature: s.feature };
  if (s.kind === 'face' || s.kind === 'edge' || s.kind === 'vertex' || s.kind === 'part') { try { const [r] = await kernelAsk('refs', { picks: [s] }); if (s.kind === 'face' && r.type !== 'plane' && app.editing && /plane|sketch/.test(app.editing.field && app.editing.field.kind)) return null; return r; } catch (err) { return null; } }
  return null;
}
/* ---------- picks into the active field ---------- */
export function fieldWants() { const E = app.editing; return E && E.field ? E.field.kind : null; }
export async function fieldPick(p) {
  const E = app.editing;
  if (!E || !E.field || !p) return false;
  const f = E.f, k = E.field.key, kind = E.field.kind;
  if (kind === 'regions') {
    if (p.kind !== 'region') return false;
    if (f.sketch !== p.sketch) { f.sketch = p.sketch; f.regions = [p.pt]; }
    else { const R = regionsCached(app.doc.features.find(x => x.id === p.sketch)), mine = regionAt(R, p.pt), i = f.regions.findIndex(q => regionAt(R, q) === mine); if (i >= 0) f.regions.splice(i, 1); else f.regions.push(p.pt); }
    if (f.axis && typeof f.axis === 'object' && f.axis.sketch && f.axis.sketch !== f.sketch) f.axis = null;
  } else if (kind === 'sections') {
    if (p.kind !== 'region') return false;
    const i = f.sections.findIndex(s => s.sketch === p.sketch);
    if (i >= 0) f.sections.splice(i, 1); else f.sections.push({ sketch: p.sketch, regions: [p.pt] });
  } else if (kind === 'sketchLine') {
    if (p.kind !== 'sketchEnt') return false;
    if (f.sketch && p.sketch !== f.sketch) { toast('The axis must be a line of the same sketch', true); return true; }
    f.axis = { e: p.ent };
  } else if (kind === 'sketch') {
    if (p.kind !== 'sketchEnt' && p.kind !== 'region') return false;
    f[k] = p.sketch;
  } else if (kind === 'plane') {
    const r = await refFor(p);
    if (!r) { toast('Choose a plane or a flat face', true); return true; }
    if (E.sketchPlane) { const sf = E.f; app.editing = null; hideDialog(); sf.plane = r; startSketch(sf, E.at, true); return true; }
    f[k] = r;
  } else if (kind === 'parts' || kind === 'features') {
    const id = kind === 'parts' ? p.part : p.feature;
    if (!id || (kind === 'parts' && !p.part) || (kind === 'features' && p.kind !== 'feature')) return false;
    const L = f[k], i = L.indexOf(id);
    if (i >= 0) L.splice(i, 1); else L.push(id);
  } else {
    // model edges and faces
    if (!(p.kind === 'edge' || p.kind === 'face' || p.kind === 'vertex')) return false;
    if ((kind === 'faces' || kind === 'face') && p.kind !== 'face') return false;
    if (kind === 'edge' && p.kind !== 'edge') return false;
    const r = await refFor(p);
    if (!r) return true;
    if (kind === 'face' || kind === 'edge') f[k] = r;
    else {
      const L = f[k], same = x => x.kind === r.kind && Math.hypot(...x.pt.map((v, j) => v - r.pt[j])) < 1e-6, i = L.findIndex(same);
      if (i >= 0) L.splice(i, 1); else { L.push(r); if (kind === 'edges' && r.kind === 'face') toast('The whole face is chosen: every edge round it. Click an edge for just that one (turn the part if it is behind).'); }
    }
  }
  showDialog(); regenSoon(120);
  return true;
}
/* is this pick already in the active field (the view shows it chosen) */
export function fieldHas(p) {
  const E = app.editing;
  if (!E) return false;
  const f = E.f;
  if (p.kind === 'part') return Object.values(f).some(v => Array.isArray(v) && v.includes(p.part));
  return false;
}
function activate(key) {
  const E = app.editing;
  if (!E) return;
  const fd = E.sketchPlane ? ['plane', 'Sketch plane', 'sel', { pick: 'plane' }] : (FEATURE_FORMS[E.f.type] || []).find(x => x[0] === key);
  E.field = fd ? { key, kind: pickOf(fd, E.f) } : null;
  // the filter follows the field: model picks only of the kind it takes
  showDialog(); emit('editing');
}
/* ---------- the panel ---------- */
function exprField(f, key, label, unit) {
  const vars = app.result ? app.result.vars : {};
  let val = '', bad = '';
  try { val = evalExpr(f[key], vars, unit); } catch (err) { bad = err.message; }
  const inp = h('input', { type: 'text', value: f[key], spellcheck: 'false', 'data-key': key, id: 'fd-' + key, class: bad ? 'bad' : null, 'aria-invalid': bad ? 'true' : null });
  const note = h('span', { class: 'cad-fval' + (bad ? ' bad' : '') }, bad || (exprIsFormula(f[key]) ? '= ' + fmtNum(val) + (unit === 'len' ? ' mm' : unit === 'ang' ? '°' : '') : ''));
  inp.addEventListener('input', () => { f[key] = inp.value; let b = ''; try { const v = evalExpr(inp.value, vars, unit); note.textContent = exprIsFormula(inp.value) ? '= ' + fmtNum(v) + (unit === 'len' ? ' mm' : unit === 'ang' ? '°' : '') : ''; } catch (err) { b = err.message; note.textContent = b; } inp.classList.toggle('bad', !!b); note.classList.toggle('bad', !!b); regenSoon(250); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); okDialog(); } });
  return h('div', { class: 'cad-frow' }, h('label', { for: 'fd-' + key }, label), inp, note);
}
function selField(E, fd) {
  const [key, label] = fd, f = E.f, kind = pickOf(fd, f), v = f[key], words = SEL_WORDS[kind] || ['item', 'items'];
  let n = Array.isArray(v) ? v.length : v ? 1 : 0, what;
  if (kind === 'regions') { n = f.regions.length; what = n ? n + ' ' + (n === 1 ? 'region' : 'regions') + ' of ' + sketchName(f.sketch) : ''; }
  else if (kind === 'sketch') what = v ? sketchName(v) : '';
  else if (kind === 'plane') what = v ? (v.std ? STD_PLANES[v.std].name + ' plane' : v.feature ? sketchName(v.feature) : 'a face') : '';
  else if (kind === 'sketchLine') what = v ? 'a line of ' + sketchName(f.sketch) : '';
  else if (kind === 'sections') what = f.sections.map(s => sketchName(s.sketch)).join(', ');
  else if (kind === 'features') what = v.map(id => sketchName(id)).join(', ');
  else if (kind === 'parts') what = v.map(id => partName(id)).join(', ');
  else what = n ? n + ' ' + (n === 1 ? words[0] : words[1]) : '';
  const on = E.field && E.field.key === key;
  const box = h('div', { class: 'cad-selbox' + (on ? ' on' : '') + (n ? '' : ' empty'), role: 'button', tabindex: '0', 'data-key': key, id: 'fs-' + key, 'aria-pressed': String(on),
    title: on ? 'Click ' + words[1] + ' in the view' + (kind === 'features' ? ' or the feature list' : '') : 'Click here, then ' + words[1] + ' in the view',
    onclick: () => activate(key) }, (what && on && kind === 'regions' ? what + ' · click a region in the view to add it or take it out' : what) || (on ? 'Click ' + words[1] + (kind === 'features' ? ' in the feature list' : ' in the view') : 'Nothing chosen'));
  const clear = n ? h('button', { type: 'button', class: 'cad-selclear', title: 'Clear', 'aria-label': 'Clear ' + label, onclick: e => { e.stopPropagation(); f[key] = Array.isArray(v) ? [] : null; if (key === 'regions') f.sketch = null; showDialog(); regenSoon(0); } }, '×') : null;
  return h('div', { class: 'cad-frow sel' }, h('label', null, label), h('div', { class: 'cad-selwrap' }, box, clear));
}
const sketchName = id => { const f = app.doc.features.find(x => x.id === id) || (app.editing && app.editing.f.id === id ? app.editing.f : null); return f ? f.name : '—'; };
const partName = id => { const ps = app.result ? app.result.parts : [], i = ps.findIndex(p => p.id === id); return i >= 0 ? partLook(app.doc, id, i).name : id; };
export function showDialog() {
  const E = app.editing, box = document.getElementById('featureDialog');
  if (!E) { hideDialog(); return; }
  const f = E.f, rows = [];
  if (E.sketchPlane) {
    rows.push(h('p', { class: 'cad-fhelp' }, 'Click a plane, or a flat face of a part, to sketch on.'), selField(E, ['plane', 'Sketch plane', 'sel', { pick: 'plane' }]));
  } else for (const fd of FEATURE_FORMS[f.type] || []) {
    const [key, label, kind, more] = fd;
    if (more && more.show && !more.show(f)) continue;
    if (kind === 'expr') rows.push(exprField(f, key, label, more.unit));
    else if (kind === 'sel') rows.push(selField(E, fd));
    else if (kind === 'check') rows.push(h('label', { class: 'cad-frow check' }, h('input', { type: 'checkbox', 'data-key': key, id: 'fd-' + key, checked: f[key] ? true : null, onchange: e => { f[key] = e.target.checked; showDialog(); regenSoon(0); } }), label));
    else if (kind === 'select') { const s = h('select', { 'data-key': key, id: 'fd-' + key, onchange: e => { f[key] = e.target.value; showDialog(); regenSoon(0); } }, ...more.options.map(([v, t]) => h('option', { value: v, selected: f[key] === v ? true : null }, t))); rows.push(h('div', { class: 'cad-frow' }, h('label', { for: 'fd-' + key }, label), s)); }
    else if (kind === 'seg') rows.push(h('div', { class: 'cad-seg', role: 'radiogroup', 'aria-label': featureLabel(f.type) + ' kind' }, ...more.options.map(([v, t]) => h('button', { type: 'button', role: 'radio', 'data-key': key, 'data-val': v, 'aria-checked': String(f[key] === v), class: f[key] === v ? 'on' : null, onclick: () => { f[key] = v; if (key === 'of') f.items = []; if (E.field) activate(E.field.key); else showDialog(); regenSoon(0); } }, t))));
    else if (kind === 'file') rows.push(h('div', { class: 'cad-frow' }, h('label', null, label), h('div', null, f.file || 'No file', ' ', h('button', { type: 'button', class: 'rt-btn', onclick: () => { const inp = h('input', { type: 'file', accept: '.step,.stp' }); inp.addEventListener('change', async () => { const fl = inp.files[0]; if (!fl) return; f.file = fl.name; f.data = await fl.text(); f.name = 'Import ' + fl.name.replace(/\.(step|stp)$/i, ''); showDialog(); regenSoon(0); }); inp.click(); } }, 'Choose…'))));
  }
  const rep = app.result && app.result.preview && app.result.preview.rep;
  const status = E.sketchPlane ? null : h('p', { class: 'cad-fstatus' + (rep && !rep.ok ? ' bad' : ''), id: 'featureStatus', role: 'status' }, !rep ? 'Working…' : rep.ok ? (rep.info && rep.info.made && rep.info.made.length ? 'Makes ' + rep.info.made.length + ' part' + (rep.info.made.length === 1 ? '' : 's') : 'Ready') : rep.error);
  const name = h('input', { type: 'text', class: 'cad-fname', value: f.name, 'aria-label': 'The feature’s name', spellcheck: 'false', onchange: e => { f.name = e.target.value.trim() || f.name; } });
  box.replaceChildren(h('div', { class: 'cad-fhead' }, h('span', { class: 'cad-fkind', 'data-icon': f.type }, E.sketchPlane ? 'Sketch' : featureLabel(f.type)), E.sketchPlane ? null : name),
    h('div', { class: 'cad-fbody' }, ...rows), status,
    h('div', { class: 'cad-factions' }, h('button', { type: 'button', class: 'rt-btn', id: 'featureCancel', onclick: () => closeDialog(false) }, 'Cancel'), E.sketchPlane ? null : h('button', { type: 'button', class: 'rt-btn primary', id: 'featureOk', onclick: okDialog }, '✓ OK')));
  box.hidden = false;
  emit('icons', box); emit('editing');
}
function hideDialog() { const box = document.getElementById('featureDialog'); if (box) { box.hidden = true; box.replaceChildren(); } }
export function okDialog() {
  const E = app.editing;
  if (!E || E.sketchPlane) return;
  checkpoint();
  const f = E.f;
  if (E.isNew) {
    app.doc.features.splice(E.at, 0, f);
    if (app.doc.rollback !== null) app.doc.rollback = Math.min(app.doc.features.length, app.doc.rollback + 1);
    // the sketch an extrude or revolve uses is hidden, as its regions are now the part's faces
    for (const id of [f.sketch, ...(f.sections || []).map(s => s.sketch)]) { const sk = app.doc.features.find(x => x.id === id); if (sk && f.type !== 'hole' && (f.type === 'extrude' || f.type === 'revolve' || f.type === 'sweep' || f.type === 'loft')) sk.hide = true; }
  } else app.doc.features[E.at] = f;
  if (app.doc.rollback !== null && app.doc.rollback >= app.doc.features.length) app.doc.rollback = null;
  app.editing = null; hideDialog(); emit('editing');
  changed();
}
export function closeDialog(regen) {
  app.editing = null; hideDialog(); emit('editing');
  if (regen !== false || true) regenNow();
}
/* ---------- the Variables table ---------- */
export function showVariables() {
  const dlg = document.getElementById('varsDialog'), body = document.getElementById('varsBody');
  const draw = () => {
    const vals = app.result ? app.result.vars : {}, rows = app.doc.variables.map((v, i) => {
      let val = '', bad = '';
      try { val = fmtNum(evalExpr(v.expr, vals, v.kind)) + (v.kind === 'len' ? ' mm' : v.kind === 'ang' ? '°' : ''); } catch (err) { bad = err.message; }
      const set = (k, x) => { checkpoint(); v[k] = x; changed(); setTimeout(draw, 80); };
      return h('tr', null,
        h('td', null, '#', h('input', { type: 'text', value: v.name, size: '10', 'aria-label': 'Name', 'data-var': 'name', onchange: e => { const n = e.target.value.trim().replace(/^#/, ''); if (!/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(n)) { toast('A name is letters, digits and _, starting with a letter', true); draw(); return; } set('name', n); } })),
        h('td', null, h('input', { type: 'text', value: v.expr, size: '16', 'aria-label': 'Value', 'data-var': 'expr', onchange: e => set('expr', e.target.value) })),
        h('td', null, h('select', { 'aria-label': 'Kind', onchange: e => set('kind', e.target.value) }, ...[['len', 'Length'], ['ang', 'Angle'], ['num', 'Number']].map(([k, t]) => h('option', { value: k, selected: v.kind === k ? true : null }, t)))),
        h('td', { class: 'n' + (bad ? ' bad' : '') }, bad || val),
        h('td', null, h('button', { type: 'button', class: 'rt-btn quiet', 'aria-label': 'Delete #' + v.name, onclick: () => { checkpoint(); app.doc.variables.splice(i, 1); changed(); draw(); } }, '×')));
    });
    body.replaceChildren(h('table', { class: 'cad-table' }, h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Expression'), h('th', null, 'Kind'), h('th', null, 'Value'), h('th', null, ''))), h('tbody', null, ...rows)),
      h('div', { class: 'rt-actions', style: 'justify-content:flex-start' }, h('button', { type: 'button', class: 'rt-btn', id: 'varAdd', onclick: () => { checkpoint(); let n = 1; while (app.doc.variables.some(v => v.name === 'v' + n)) n++; app.doc.variables.push({ name: 'v' + n, expr: '10 mm', kind: 'len' }); changed(); draw(); } }, 'Add a variable')));
  };
  draw();
  if (!dlg.open) dlg.showModal();
}
/* ---------- the parts' looks: name, colour, material ---------- */
export function setPartLook(id, k, v) {
  checkpoint();
  const p = app.doc.parts[id] || (app.doc.parts[id] = {});
  if (v === '' || v === null) delete p[k]; else p[k] = v;
  if (k === 'material') { const m = MATERIALS.find(x => x[0] === v); if (m) p.density = m[1]; }
  changed();
}
export function wireDialog() {
  on('model', () => { if (app.editing) { const st = document.getElementById('featureStatus'), rep = app.result.preview && app.result.preview.rep; if (st && rep) { st.textContent = rep.ok ? (rep.info && rep.info.made && rep.info.made.length ? 'Makes ' + rep.info.made.length + ' part' + (rep.info.made.length === 1 ? '' : 's') : 'Ready') : rep.error; st.classList.toggle('bad', !rep.ok); } } });
  document.getElementById('varsClose').addEventListener('click', () => document.getElementById('varsDialog').close());
  void FEATURE_KINDS;
}
