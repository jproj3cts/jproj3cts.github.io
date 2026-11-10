import { evalExpr, evalVars, VAR_NAME } from './units.js';
import { normCons, normDims, sketchId, solveSketch } from './sketch.js';
import { normEnts } from './sketch-tools.js';

/* ==========================================================================
   A Part Studio as a file (.jekcad, JSON): its Variables table, its feature list in order, the rollback bar, and its
   parts' names, colours and materials. There are no format migrations: every field has its default here (normDoc),
   so a file from an older JEKcad opens. The features hold what the person chose, never the geometry made from it:
   that is regenerated (engines/kernel.js) every time.
   ========================================================================== */
export const CAD_FORMAT = 'jekcad', CAD_VERSION = 1;
export const CAD_STORE_KEY = 'jek-cad-session-v1';
/* the kernel's files, served with the site (jek/assets/vendor/…/README.txt): the build JEKcad loads on first use */
export const KERNEL_DIR = '/jek/assets/vendor/replicad-opencascadejs/1.2.1/';
/* the three standard planes, as Onshape's and every CAD program's: z up; each its origin, x and y in the plane, and normal */
export const STD_PLANES = {
  top: { name: 'Top', o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] },
  front: { name: 'Front', o: [0, 0, 0], x: [1, 0, 0], y: [0, 0, 1], n: [0, -1, 0] },
  right: { name: 'Right', o: [0, 0, 0], x: [0, 1, 0], y: [0, 0, 1], n: [1, 0, 0] },
};
/* materials and their densities, g/cm³ */
export const MATERIALS = [
  ['Aluminium 6061', 2.70], ['Aluminium 7075', 2.81], ['Steel, mild', 7.85], ['Stainless steel 304', 8.00], ['Stainless steel 316', 8.00],
  ['Brass', 8.50], ['Copper', 8.96], ['Titanium Ti-6Al-4V', 4.43], ['Invar 36', 8.05], ['ABS', 1.04], ['PLA', 1.24], ['Nylon (PA12)', 1.01],
  ['PEEK', 1.32], ['Acetal (POM)', 1.41], ['Acrylic (PMMA)', 1.18], ['N-BK7 glass', 2.51], ['Fused silica', 2.20], ['Macor', 2.52],
];
export const PART_COLOURS = ['#9aa7b4', '#e0892e', '#5b8fd1', '#6aa56a', '#c75a5a', '#b48ad0', '#d6b44a', '#4fb3b0'];
/* the features, as the feature list names them, and each one's settings and their defaults */
export const FEATURE_KINDS = {
  sketch: { label: 'Sketch', defaults: { plane: { std: 'top' }, ents: [], cons: [], dims: [] } },
  plane: { label: 'Plane', defaults: { ref: { std: 'top' }, offset: '10 mm', flip: false } },
  extrude: { label: 'Extrude', defaults: { sketch: null, regions: [], op: 'new', end: 'blind', depth: '10 mm', flip: false, upto: null, second: false, end2: 'blind', depth2: '10 mm', upto2: null, draft: '0 deg', targets: [] } },
  revolve: { label: 'Revolve', defaults: { sketch: null, regions: [], axis: null, op: 'new', kind: 'full', angle: '360 deg', flip: false, targets: [] } },
  sweep: { label: 'Sweep', defaults: { sketch: null, regions: [], path: null, op: 'new', targets: [] } },
  loft: { label: 'Loft', defaults: { sections: [], op: 'new', ruled: false, targets: [] } },
  fillet: { label: 'Fillet', defaults: { edges: [], radius: '2 mm' } },
  chamfer: { label: 'Chamfer', defaults: { edges: [], distance: '1 mm' } },
  shell: { label: 'Shell', defaults: { faces: [], thickness: '1 mm', outward: false } },
  hole: { label: 'Hole', defaults: { sketch: null, kind: 'simple', dia: '5 mm', end: 'through', depth: '10 mm', tip: true, cbDia: '9 mm', cbDepth: '3 mm', csDia: '10 mm', csAngle: '90 deg', targets: [] } },
  lpattern: { label: 'Linear pattern', defaults: { of: 'features', items: [], dir: 'x', dirRef: null, flip: false, count: '3', spacing: '20 mm' } },
  cpattern: { label: 'Circular pattern', defaults: { of: 'features', items: [], axis: 'z', axisRef: null, count: '6', angle: '360 deg' } },
  mirror: { label: 'Mirror', defaults: { of: 'features', items: [], plane: { std: 'right' } } },
  boolean: { label: 'Boolean', defaults: { op: 'union', targets: [], tools: [], keep: false } },
  import: { label: 'Import', defaults: { file: '', format: 'step', data: '' } },
};
export const featureLabel = t => (FEATURE_KINDS[t] ? FEATURE_KINDS[t].label : t);
const isStr = (v, n) => typeof v === 'string' && v.length <= (n || 200);
const exprOr = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : isStr(v, 400) ? v : d);
const refOk = r => r && typeof r === 'object' && (isStr(r.part, 60) || r.kind === 'part' || r.std);
const cleanRefs = (a, n) => (Array.isArray(a) ? a.filter(refOk).slice(0, n || 2000).map(r => JSON.parse(JSON.stringify(r))) : []);
const ptsOk = a => (Array.isArray(a) ? a.filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)).slice(0, 400) : []);
/* a plane reference: a standard plane, a planar face, or a Plane feature */
const normPlaneRef = (p, d) => (p && typeof p === 'object' ? (STD_PLANES[p.std] ? { std: p.std } : isStr(p.feature, 40) ? { feature: p.feature } : refOk(p) && p.kind === 'face' ? JSON.parse(JSON.stringify(p)) : d) : d);
/* one feature, every field checked and defaulted */
export function normFeature(f, i) {
  if (!f || !FEATURE_KINDS[f.type]) return null;
  const D = FEATURE_KINDS[f.type].defaults, o = { id: isStr(f.id, 40) && f.id ? f.id : sketchId('f'), type: f.type, name: isStr(f.name, 80) && f.name.trim() ? f.name : featureLabel(f.type) + ' ' + (i + 1) };
  if (f.suppressed) o.suppressed = true;
  for (const [k, dv] of Object.entries(D)) {
    const v = f[k];
    if (typeof dv === 'boolean') o[k] = typeof v === 'boolean' ? v : dv;
    else if (typeof dv === 'string' && /^(op|end|end2|kind|of|dir|axis|format)$/.test(k)) o[k] = isStr(v, 40) ? v : dv;
    else if (typeof dv === 'string' && (k === 'file' || k === 'data')) o[k] = typeof v === 'string' ? v : dv;
    else if (typeof dv === 'string') o[k] = exprOr(v, dv);
    else if (k === 'regions') o[k] = ptsOk(v);
    else if (k === 'plane' || k === 'ref') o[k] = normPlaneRef(v, dv);
    else if (k === 'sketch' || k === 'path') o[k] = isStr(v, 40) ? v : null;
    else if (k === 'axis') o[k] = isStr(v, 40) || (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : null;
    else if (k === 'upto' || k === 'upto2' || k === 'dirRef' || k === 'axisRef') o[k] = refOk(v) ? JSON.parse(JSON.stringify(v)) : null;
    else if (k === 'items') o[k] = Array.isArray(v) ? v.filter(x => isStr(x, 60)).slice(0, 200) : [];
    else if (k === 'targets' || k === 'tools') o[k] = Array.isArray(v) ? v.filter(x => isStr(x, 60)).slice(0, 200) : [];
    else if (k === 'sections') o[k] = Array.isArray(v) ? v.filter(s => s && isStr(s.sketch, 40)).slice(0, 20).map(s => ({ sketch: s.sketch, regions: ptsOk(s.regions) })) : [];
    else if (k === 'edges' || k === 'faces') o[k] = cleanRefs(v);
    else if (k === 'ents') o[k] = normEnts(v);
    else if (k === 'cons') o[k] = normCons(v, normEnts(f.ents));
    else if (k === 'dims') o[k] = normDims(v, normEnts(f.ents));
    else o[k] = v === undefined ? JSON.parse(JSON.stringify(dv)) : v;
  }
  if (f.type === 'sketch') { o.cons = normCons(f.cons, o.ents); o.dims = normDims(f.dims, o.ents); }
  if (f.type === 'axis' && o.axis === undefined) o.axis = null;
  return o;
}
/* the whole document, checked: anything not understood is left out, anything missing given its default */
export function normDoc(d) {
  d = d && typeof d === 'object' ? d : {};
  const feats = (Array.isArray(d.features) ? d.features : []).slice(0, 1000).map((f, i) => normFeature(f, i)).filter(Boolean);
  const ids = new Set();
  for (const f of feats) { while (ids.has(f.id)) f.id = sketchId('f'); ids.add(f.id); }
  const vars = (Array.isArray(d.variables) ? d.variables : []).filter(v => v && VAR_NAME.test(v.name || '')).slice(0, 500)
    .map(v => ({ name: v.name, expr: exprOr(v.expr, '0'), kind: ['len', 'ang', 'num'].includes(v.kind) ? v.kind : 'len', ...(isStr(v.note, 200) && v.note ? { note: v.note } : {}) }));
  const parts = {};
  if (d.parts && typeof d.parts === 'object') for (const [k, p] of Object.entries(d.parts)) {
    if (!isStr(k, 60) || !p || typeof p !== 'object') continue;
    parts[k] = { ...(isStr(p.name, 80) && p.name ? { name: p.name } : {}), ...(/^#[0-9a-f]{6}$/i.test(p.colour || '') ? { colour: p.colour } : {}),
      ...(isStr(p.material, 80) ? { material: p.material } : {}), ...(Number.isFinite(p.density) && p.density > 0 ? { density: p.density } : {}), ...(p.hidden ? { hidden: true } : {}) };
  }
  const rb = Number.isInteger(d.rollback) && d.rollback >= 0 && d.rollback < feats.length ? d.rollback : null;
  return { format: CAD_FORMAT, version: CAD_VERSION, name: isStr(d.name, 120) && d.name.trim() ? d.name : 'Part Studio 1', units: 'mm', variables: vars, features: feats, rollback: rb, parts };
}
export const newDoc = () => normDoc({});
/* a new feature of a kind, with its defaults, named in sequence */
export function newFeature(doc, type, over) {
  const n = doc.features.filter(f => f.type === type).length + 1;
  return normFeature(Object.assign({ type, name: featureLabel(type) + ' ' + n }, JSON.parse(JSON.stringify(FEATURE_KINDS[type].defaults)), over || {}), 0);
}
/* how many features are applied: everything before the rollback bar */
export const appliedCount = doc => (doc.rollback === null ? doc.features.length : doc.rollback);
/* the values in every field: the Variables table evaluated; a dimension's expression into its value; every sketch
   solved again (so a changed variable moves the sketches it reaches). Changes doc in place; { vars, errors } */
export function prepareDoc(doc) {
  const { values, errors: verr } = evalVars(doc.variables), errors = [];
  for (const [n, e] of Object.entries(verr)) errors.push({ variable: n, error: e });
  for (const f of doc.features) {
    if (f.type !== 'sketch') continue;
    let changed = false;
    for (const d of f.dims) {
      if (typeof d.x !== 'string' || !d.x.trim()) continue;
      try { const v = evalExpr(d.x, values, d.t === 'ang' ? 'ang' : 'len'); if (Math.abs(v - d.v) > 1e-12) { d.v = d.t === 'ang' ? v : Math.abs(v); changed = true; } delete d.err; }
      catch (err) { d.err = err.message; errors.push({ feature: f.id, error: 'Dimension: ' + err.message }); }
    }
    if (changed) solveSketch(f.ents, f.cons, f.dims, null, { iters: 80 });
  }
  return { vars: values, errors };
}
/* a field's value: its expression evaluated with the variables (kind 'len', 'ang' or 'num') */
export function fieldValue(f, key, vars, kind) {
  try { return evalExpr(f[key], vars, kind); }
  catch (err) { throw new Error((FIELD_NAMES[key] || key) + ': ' + err.message); }
}
export const FIELD_NAMES = { depth: 'Depth', depth2: 'Second depth', draft: 'Draft angle', angle: 'Angle', radius: 'Radius', distance: 'Distance', thickness: 'Thickness', dia: 'Diameter', cbDia: 'Counterbore diameter', cbDepth: 'Counterbore depth', csDia: 'Countersink diameter', csAngle: 'Countersink angle', count: 'Instances', spacing: 'Spacing', offset: 'Offset' };
/* the features that make or change solids from a tool body, and so can be patterned or mirrored as features */
export const TOOL_FEATURES = ['extrude', 'revolve', 'sweep', 'loft', 'hole'];
/* what each feature reads of the ones before it: the ids it names (for reordering: a feature cannot move above what it uses) */
export function featureUses(f) {
  const out = new Set();
  const addRefs = rs => { for (const r of rs || []) if (r && r.part) out.add('part:' + r.part); };
  if (f.sketch) out.add(f.sketch);
  if (f.path) out.add(f.path);
  for (const s of f.sections || []) out.add(s.sketch);
  if (f.items) for (const x of f.items) out.add(x);
  if (f.plane && f.plane.feature) out.add(f.plane.feature);
  if (f.ref && f.ref.feature) out.add(f.ref.feature);
  if (f.plane && f.plane.part) addRefs([f.plane]);
  if (f.ref && f.ref.part) addRefs([f.ref]);
  addRefs(f.edges); addRefs(f.faces); addRefs([f.upto, f.upto2, f.dirRef, f.axisRef].filter(Boolean));
  for (const t of (f.targets || []).concat(f.tools || [])) out.add('part:' + t);
  return out;
}
/* the parts a feature makes: their ids start with its own */
export const partOwner = (doc, partId) => doc.features.find(f => partId === f.id || partId.startsWith(f.id + '.'));
/* can feature i move to place j? Not above anything it uses, nor below anything that uses it */
export function canMove(doc, i, j) {
  if (i === j || j < 0 || j >= doc.features.length) return false;
  const f = doc.features[i], usesOf = g => featureUses(g), owns = (g, use) => use === g.id || (use.startsWith('part:') && (use.slice(5) === g.id || use.slice(5).startsWith(g.id + '.')));
  if (j < i) { for (let k = j; k < i; k++) for (const u of usesOf(f)) if (owns(doc.features[k], u)) return false; }
  else { for (let k = i + 1; k <= j; k++) for (const u of usesOf(doc.features[k])) if (owns(f, u)) return false; }
  return true;
}
/* a part's name, colour and density as the parts list shows them: its own, or the defaults by its place */
export function partLook(doc, id, i) {
  const p = doc.parts[id] || {}, mat = MATERIALS.find(m => m[0] === p.material);
  return { name: p.name || 'Part ' + (i + 1), colour: p.colour || PART_COLOURS[i % PART_COLOURS.length], material: p.material || '', density: p.density || (mat ? mat[1] : 0), hidden: !!p.hidden };
}
