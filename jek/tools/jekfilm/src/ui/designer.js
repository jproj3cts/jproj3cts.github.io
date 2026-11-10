import { h } from '../../../jekray/src/ui/dom.js';
import { hooks } from '../../../jekray/src/core/hooks.js';
import { designPro, proMark } from '../../../jekray/src/ui/pro.js';
import { track } from '../../../jekray/src/io/usage.js';
import { COAT_MATERIALS, qwot } from '../../../jekray/src/core/coatings.js';
import { METAL_NAMES, metalCovers, metalNK } from '../../../jekray/src/core/metals.js';
import { coatAngles, coatCurve, coatMerit, coatOptimise, coatWant, stackR } from '../../../jekray/src/core/coatdesign.js';
import { dsFix, FILM_GLASSES, FILM_PRESETS, FILM_TARGETS, filmPreset, filmSpec, newFilm, normFilm, subClear, subIndex } from '../core/film.js';
import { linePlotSvg } from './plot.js';
import { filmMaterials, filmNeedle } from '../core/film-opt.js';
import { filmTolerance } from '../core/film-tol.js';
import { filmYield } from '../core/film-make.js';
import { toast } from './bar.js';
import { stackField } from '../core/film-field.js';

/* ==========================================================================
   The designer: the coating being worked on (film), its undo history, and the page drawn from it. What the stack is
   for, what it sits on and the light it is judged in (the settings card); the figures; the reflectance across the
   band and against the angle; the layers, with the optimiser. Every change goes through edit(fn): a step of undo, the
   page drawn again, and the change told to the files and the cloud (hooks.filmChanged).
   ========================================================================== */
export let film = newFilm();
let filmPast = [], filmFuture = [];
const FILM_UNDO_MAX = 100;
const snap = () => JSON.stringify(film);
/* a coating put in place of the one here: opened, new, restored (fresh: its undo history starts again) */
export function setFilm(f, fresh) {
  if (!fresh) { filmPast.push(snap()); if (filmPast.length > FILM_UNDO_MAX) filmPast.shift(); filmFuture = []; }
  else { filmPast = []; filmFuture = []; }
  film = normFilm(f);
  render();
}
/* a change: undoable, drawn, kept */
export function edit(fn, quiet) {
  const before = snap();
  fn(film);
  film = normFilm(film);
  if (snap() === before) { render(); return; }
  filmPast.push(before); if (filmPast.length > FILM_UNDO_MAX) filmPast.shift(); filmFuture = [];
  render();
  if (!quiet) hooks.filmChanged();
}
export function undo() { if (!filmPast.length) return; filmFuture.push(snap()); film = normFilm(JSON.parse(filmPast.pop())); render(); hooks.filmChanged(); }
export function redo() { if (!filmFuture.length) return; filmPast.push(snap()); film = normFilm(JSON.parse(filmFuture.pop())); render(); hooks.filmChanged(); }
export const canUndo = () => filmPast.length > 0, canRedo = () => filmFuture.length > 0;

/* ---------- the controls ---------- */
const dsFmt = (v, p) => (isFinite(v) ? String(+(+v).toPrecision(p || 5)) : '—');
const dsPct = v => (isFinite(v) ? (100 * v < 0.01 && v > 0 ? '< 0.01' : (100 * v).toPrecision(3)) + ' %' : '—');
function dsNum(value, set, label, p) {
  const i = h('input', { type: 'text', inputmode: 'decimal', value: p && p.dp !== undefined ? (+value).toFixed(p.dp) : dsFmt(value, p || 6), class: 'rt-lnum', 'aria-label': label, spellcheck: 'false' });
  const go = () => { const v = +i.value; if (i.value.trim() !== '' && isFinite(v)) edit(() => set(v)); else render(); };
  i.addEventListener('change', go);
  i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  return i;
}
function dsSelect(options, value, set, label) {
  const s = h('select', { 'aria-label': label }, ...options.map(([v, t]) => h('option', { value: v, selected: String(v) === String(value) ? '' : null }, t)));
  s.addEventListener('change', () => set(s.value));
  return s;
}
/* a short line of help, its fuller explanation folded behind an ⓘ */
function dsHelp(short, long) {
  const more = h('span', { class: 'rt-helpmore', hidden: '' }, ' ', long);
  const btn = h('button', { type: 'button', class: 'rt-helpbtn', 'aria-expanded': 'false', 'aria-label': 'More about this', title: 'More about this',
    onclick: () => { const open = more.hidden; more.hidden = !open; btn.setAttribute('aria-expanded', String(open)); } }, 'ⓘ');
  return h('p', { class: 'rt-lsub' }, short, ' ', btn, more);
}

/* ---------- the page: the design's properties, its results, its curves and its layers, each a table ---------- */
export function render() {
  const body = document.getElementById('filmBody');
  if (!body) return;
  const scroll = body.scrollTop, spec = filmSpec(film);
  // the tab shown: the design itself, its tolerancing, or what a maker needs (ui/make.js, through hooks.filmMakeCards)
  const main = filmTab === 'tolerance' ? [tolCard(), yieldCard(spec), fieldCard(spec)] : filmTab === 'make' ? hooks.filmMakeCards(spec) : [plotsCard(), layersCard(spec)];
  body.replaceChildren(settingsCard(spec), h('div', { class: 'rt-lmain' }, ...main));
  for (const b of document.querySelectorAll('.film-tabs [role=tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === filmTab));
  body.scrollTop = scroll;
  const nm = document.getElementById('filmName');
  if (nm && document.activeElement !== nm) nm.value = film.name;
  for (const [id, can] of [['btnUndo', canUndo()], ['btnRedo', canRedo()]]) { const b = document.getElementById(id); if (b) b.disabled = !can; }
  document.title = film.name + ' | JEKfilm';
}
/* a row of a property table: its name, its value (a control or a figure), its unit */
const propRow = (label, value, unit, cls) => h('tr', { class: cls || null }, h('th', { scope: 'row' }, label), h('td', null, value), h('td', { class: 'unit' }, unit || ''));
const section = (title, ...kids) => h('section', { class: 'film-sec rt-lcard', 'aria-label': title }, h('h2', null, title), ...kids);
function settingsCard(spec) {
  const S = film.spec, tb = h('tbody');
  const subOpts = Object.keys(FILM_GLASSES).map(g => ['g:' + g, g]).concat([['n', 'Index of my own']]);
  tb.append(
    propRow('Target', dsSelect(Object.entries(FILM_TARGETS), S.target, v => edit(f => { f.spec.target = v; }), 'What the coating is for')),
    ...(S.target === 'split' ? [propRow('Reflectance wanted', dsNum(S.R, v => { film.spec.R = v; }, 'Reflectance wanted (%)'), '%')] : []),
    ...(S.target === 'edge' ? [propRow('Edge', dsNum(S.edge, v => { film.spec.edge = v; }, 'Edge wavelength (nm)'), 'nm'),
      propRow('Passes', dsSelect([['below', 'Shorter λ'], ['above', 'Longer λ']], S.passBelow ? 'below' : 'above', v => edit(f => { f.spec.passBelow = v === 'below'; }), 'Which side passes'))] : []),
    propRow('Reference λ₀', dsNum(S.design, v => { film.spec.design = v; }, 'Design wavelength (nm)'), 'nm'),
    propRow('Band from', dsNum(S.lo, v => { film.spec.lo = v; film.spec.hi = Math.max(v, film.spec.hi); }, 'Band from (nm)'), 'nm'),
    propRow('Band to', dsNum(S.hi, v => { film.spec.hi = Math.max(film.spec.lo, v); }, 'Band to (nm)'), 'nm'),
    propRow('Angles', dsSelect([['upto', 'Up to'], ['band', 'A band']], S.angles, v => edit(f => { f.spec.angles = v; if (v === 'band' && !(f.spec.theta > 0)) { f.spec.theta0 = 40; f.spec.theta = 50; } }), 'How the angles are judged')),
    ...(S.angles === 'band' ? [propRow('Angles from', dsNum(S.theta0, v => { film.spec.theta0 = v; film.spec.theta = Math.max(v, film.spec.theta); }, 'Smallest angle of incidence (degrees)'), '°'),
      propRow('Angles to', dsNum(S.theta, v => { film.spec.theta = v; film.spec.theta0 = Math.min(v, film.spec.theta0); }, 'Largest angle of incidence (degrees)'), '°')]
      : [propRow('Angles up to', dsNum(S.theta, v => { film.spec.theta = v; }, 'Largest angle of incidence (degrees)'), '°')]),
    propRow('Polarisation', dsSelect([['avg', 'Mean of s and p'], ['s', 's'], ['p', 'p']], S.pol, v => edit(f => { f.spec.pol = v; }), 'Polarisation judged')),
    propRow('Incident medium n', dsNum(S.n0, v => { film.spec.n0 = Math.max(1, v); }, 'Index of the medium the light comes from'), ''),
    propRow('Substrate', dsSelect(subOpts, S.sub.glass ? 'g:' + S.sub.glass : 'n', v => edit(f => { f.spec.sub = v === 'n' ? { n: +subIndex(f.spec.sub, f.spec.design).toFixed(4) } : { glass: v.slice(2) }; }), 'The substrate')),
    S.sub.glass ? propRow('Substrate n at λ₀', h('span', { class: 'mono' }, subClear(S.sub, S.design) ? dsFmt(spec.ns, 5) : '—'), '')
      : propRow('Substrate n', dsNum(S.sub.n, v => { film.spec.sub = { n: Math.max(1, v) }; }, 'Substrate index'), ''));
  const out = section('Design', h('table', { class: 'film-props' }, tb));
  if (S.sub.glass && !subClear(S.sub, S.design)) out.append(h('p', { class: 'film-warn' }, S.sub.glass + ' is not transparent at ' + dsFmt(S.design, 5) + ' nm: choose a design wavelength where it is, or another substrate.'));
  out.append(dsHelp('Merit: mean square of R against the target over the band and angles.',
    'An edge’s own wavelength ± 2% is left out, as no stack turns in no width. The stack is worked out with the thin-film model JEKray traces with, so a coating designed here behaves the same on a JEKray bench.'));
  out.classList.add('rt-lcond');
  return out;
}
/* a reflectance as a percentage to three decimals, so a column's figures line up (very small ones as above) */
const dsR = v => dsFix(100 * v, 3);
/* a small table under a plot: a heading row, figure rows, and a line of notes under it */
function miniTable(id, label, heads, rows, foot, lbl) {
  return h('div', { class: 'film-twrap film-perf' }, h('table', { class: 'film-results', id, 'aria-label': label },
    h('thead', null, h('tr', null, ...heads.map((t, k) => h('th', { scope: 'col', class: k ? 'n' : null }, t)))),
    h('tbody', null, ...rows.map(r => h('tr', null, h('th', { scope: 'row', class: lbl ? 'lbl' : null }, r[0]), ...r.slice(1).map(v => h('td', { class: 'n mono' }, v))))),
    foot ? h('tfoot', null, h('tr', null, h('td', { colspan: String(heads.length) }, foot))) : null));
}
/* the curves drawn: square on and at the largest angle against wavelength, the target; s and p against the angle */
export function filmCurves(f) {
  const spec = filmSpec(f), c0 = coatCurve(f.layers, spec, spec.theta0), ct = spec.theta > spec.theta0 ? coatCurve(f.layers, spec, spec.theta) : null, A = coatAngles(f.layers, spec);
  return { spec, nms: c0.nms, R0: c0.R, Rt: ct ? ct.R : null, want: c0.nms.map(nm => coatWant(spec, nm)), A };
}
function plotsCard() {
  const C = filmCurves(film), spec = C.spec, a0 = spec.theta0 || 0, deg = d => dsFmt(d, 3) + '°';
  const series = [{ label: 'R, ' + deg(a0), cls: 's0', xs: C.nms, ys: C.R0.map(v => 100 * v) }];
  if (C.Rt) series.push({ label: 'R, ' + deg(spec.theta), cls: 's1', xs: C.nms, ys: C.Rt.map(v => 100 * v) });
  series.push({ label: 'target', cls: 'tgt', dash: true, xs: C.nms, ys: C.want.map(v => 100 * v) });
  const top = Math.min(100, Math.max(0.5, 1.15 * Math.max(...series.flatMap(s => s.ys))));
  const wrap = h('div', { class: 'rt-lpair' }), a = h('div'), b = h('div'); wrap.append(a, b);
  linePlotSvg(a, { id: 'band', label: 'Reflectance against wavelength', xTitle: 'Wavelength (nm)', yTitle: 'R (%)', xName: 'nm', yUnit: '%', yr: [0, top], series });
  linePlotSvg(b, { id: 'angle', label: 'Reflectance against angle at ' + dsFmt(spec.design, 5) + ' nm', xTitle: 'Angle of incidence (°)', yTitle: 'R (%)', xName: '°', yUnit: '%', xr: [0, 89], yr: [0, 100],
    series: [{ label: 'Rs', cls: 's0', xs: C.A.degs, ys: C.A.s.map(v => 100 * v) }, { label: 'Rp', cls: 's1', xs: C.A.degs, ys: C.A.p.map(v => 100 * v) }] });
  // under the wavelength plot: the band's mean, largest and smallest reflectance at each angle drawn
  const stat = R => [R.reduce((x, y) => x + y, 0) / R.length, Math.max(...R), Math.min(...R)];
  const bandRows = [[deg(a0), ...stat(C.R0).map(dsR)], ...(C.Rt ? [[deg(spec.theta), ...stat(C.Rt).map(dsR)]] : [])];
  const bare = ((spec.n0 - spec.ns) / (spec.n0 + spec.ns)) ** 2;
  a.append(miniTable('filmFigures', 'Reflectance over the band', ['Angle', 'R mean (%)', 'R max (%)', 'R min (%)'], bandRows,
    'Merit ' + dsFix(coatMerit(film.layers, spec), 3) + ' · bare substrate ' + dsR(bare) + ' %'));
  // under the angle plot: s, p and their mean at λ₀, square on and at the angles judged
  const angs = [...new Set([0, a0, spec.theta])], at = (d, pol) => stackR(film.layers, spec.n0, spec.ns, Math.cos(d * Math.PI / 180), spec.design, pol);
  b.append(miniTable('filmAngleFigures', 'Reflectance at the design wavelength', ['Angle', 'Rs (%)', 'Rp (%)', 'R mean (%)'],
    angs.map(d => [deg(d), dsR(at(d, 's')), dsR(at(d, 'p')), dsR(at(d, 'avg'))]), 'At λ₀ = ' + dsFmt(spec.design, 5) + ' nm'));
  return section('Reflectance', wrap);
}
function layersCard(spec) {
  const layers = film.layers, S = film.spec;
  const tbl = h('table', { class: 'film-layers', id: 'filmLayers' }), tb = h('tbody');
  tbl.append(h('thead', null,
    h('tr', null, h('th', { class: 'n' }, 'Layer'), h('th', null, 'Material'), h('th', { class: 'n' }, 'n'), h('th', { class: 'n' }, 'Physical thickness (nm)'), h('th', { class: 'n' }, 'Optical thickness (QWOT)'), h('th', { class: 'acts' }, h('span', { class: 'film-sr' }, 'Actions'))),
    h('tr', { class: 'film-medium' }, h('td', { class: 'n' }, '—'), h('td', null, 'Incident medium'), h('td', { class: 'n mono' }, (+S.n0).toFixed(3)), h('td', { class: 'n' }, '∞'), h('td'), h('td'))));
  let total = 0;
  layers.forEach((L, k) => {
    const qw = qwot(L.n, spec.design); total += L.d;
    // the material: a dielectric by its index, or a metal (absorbing, its index from its measured table)
    const opts = COAT_MATERIALS.map(([v, t]) => [String(+v), t]);
    if (!L.metal && !opts.some(o => Math.abs(+o[0] - L.n) < 1e-9)) opts.push([String(+L.n), 'n = ' + dsFmt(L.n, 4)]);
    for (const [m, nm] of Object.entries(METAL_NAMES)) opts.push(['metal:' + m, nm + ' (' + m + ', metal)']);
    opts.push(['custom', 'Index of my own…']);
    const mat = dsSelect(opts, L.metal ? 'metal:' + L.metal : String(+L.n), v => {
      if (v === 'custom') { const n = +prompt('The layer’s index', String(L.n)); if (isFinite(n) && n >= 1) edit(f => { f.layers[k].n = n; delete f.layers[k].metal; }); else render(); }
      else if (v.startsWith('metal:')) edit(f => { const was = f.layers[k].metal; f.layers[k].metal = v.slice(6); if (!was) f.layers[k].d = 100; });
      else edit(f => { const was = f.layers[k].metal; f.layers[k].n = +v; delete f.layers[k].metal; if (was) f.layers[k].d = qwot(+v, f.spec.design); });
    }, 'Layer ' + (k + 1) + ' material');
    const nk = L.metal ? metalNK(L.metal, spec.design) : null;
    const nCell = L.metal ? h('span', { title: 'n − ik at λ₀' + (metalCovers(L.metal, spec.design) ? '' : ': beyond its table, its nearest value') }, nk[0].toFixed(3) + ' − ' + nk[1].toFixed(3) + 'i') : (+L.n).toFixed(3);
    tb.append(h('tr', { class: L.metal ? 'film-metal' : null }, h('td', { class: 'n mono' }, String(k + 1)), h('td', null, mat), h('td', { class: 'n mono' }, nCell),
      h('td', { class: 'n' }, dsNum(L.d, v => { film.layers[k].d = Math.max(0.01, v); }, 'Layer ' + (k + 1) + ' thickness (nm)', { dp: 2 })),
      h('td', { class: 'n mono' }, L.metal ? '—' : (L.d / qw).toFixed(3)),
      h('td', { class: 'acts' }, L.metal ? null : h('button', { class: 'film-tbtn', type: 'button', title: 'Make this layer a quarter wave at λ₀', onclick: () => edit(f => { f.layers[k].d = qw; }) }, 'λ/4'),
        h('button', { class: 'film-tbtn', type: 'button', title: 'Remove layer ' + (k + 1), 'aria-label': 'Remove layer ' + (k + 1), onclick: () => edit(f => { f.layers.splice(k, 1); }) }, '✕'))));
  });
  if (!layers.length) tb.append(h('tr', null, h('td', { colspan: '6', class: 'film-empty' }, 'No layers: the bare substrate. Add one, or start from a preset.')));
  tbl.append(tb, h('tfoot', null,
    h('tr', { class: 'film-medium' }, h('td', { class: 'n' }, '—'), h('td', null, 'Substrate: ' + (S.sub.glass || 'index of my own')), h('td', { class: 'n mono' }, subClear(S.sub, S.design) ? spec.ns.toFixed(3) : '—'), h('td', { class: 'n' }, '∞'), h('td'), h('td')),
    h('tr', { class: 'film-total' }, h('td'), h('th', { scope: 'row' }, layers.length + (layers.length === 1 ? ' layer' : ' layers')), h('td'), h('td', { class: 'n mono' }, total.toFixed(2)), h('td'), h('td'))));
  const pre = dsSelect([['', 'Preset…'], ...FILM_PRESETS], '', v => { if (v) edit(f => { f.layers = filmPreset(v, f.spec.design); }); }, 'A preset stack');
  const opt = proMark(h('button', { class: 'rt-btn primary', type: 'button', id: 'filmOptimise', title: 'Nelder–Mead on the thicknesses, from where they stand, against the target over the band and the angles' }, 'Optimise thicknesses'), 'optimise a coating');
  opt.addEventListener('click', () => optimiseNow());
  const needle = proMark(h('button', { class: 'rt-btn', type: 'button', id: 'filmNeedle', title: 'Needle optimisation: thin layers tried at every place in the stack, the best put in and the thicknesses settled, round by round' }, 'Add layers (needle)'), 'optimise a coating');
  needle.addEventListener('click', () => { searchNow('needle'); });
  const mats = proMark(h('button', { class: 'rt-btn', type: 'button', id: 'filmMaterials', title: 'Each layer tried as each material of the list, keeping its optical thickness; the best kept, then the thicknesses settled' }, 'Choose materials'), 'optimise a coating');
  mats.addEventListener('click', () => { searchNow('materials'); });
  return section('Layers',
    h('div', { class: 'film-twrap' }, tbl),
    h('div', { class: 'film-tools' }, opt, needle, mats,
      h('button', { class: 'rt-btn', type: 'button', id: 'filmAddLayer', onclick: () => edit(f => { f.layers.push({ n: 1.38, d: qwot(1.38, f.spec.design) }); }) }, 'Add layer'),
      h('button', { class: 'rt-btn', type: 'button', onclick: () => edit(f => { for (const L of f.layers) if (!L.metal) L.d = qwot(L.n, f.spec.design); }) }, 'All quarter waves'),
      pre));
}
/* ---------- the field in the stack: an optional view, shut until asked for; how it is looked at is this browser's, not
   the coating's (nothing of it is saved in the file) ---------- */
const FIELD_KEY = 'jek-film-field';
const fieldView = (() => { try { return { pol: 's', ...JSON.parse(localStorage.getItem(FIELD_KEY) || '{}'), nm: null, deg: null }; } catch (err) { return { open: false, pol: 's', nm: null, deg: null }; } })();
const keepField = () => { try { localStorage.setItem(FIELD_KEY, JSON.stringify({ open: !!fieldView.open, pol: fieldView.pol })); } catch (err) { /* this visit only */ } };
/* the field for the coating here, at the wavelength and angle chosen (λ₀ and the smallest angle judged unless set) */
export function filmField(f, o = {}) {
  const spec = filmSpec(f), nm = o.nm || spec.design, deg = o.deg !== undefined && o.deg !== null ? o.deg : spec.theta0 || 0, pol = o.pol || 's';
  const F = stackField(f.layers, spec.n0, spec.ns, Math.cos(deg * Math.PI / 180), nm, pol);
  // each layer's peak, and where it sits; the field at the outer surface and at each interface
  const peaks = f.layers.map((L, j) => { let best = -1, at = 0; F.z.forEach((z, i) => { if (z >= F.bounds[j] - 1e-9 && z <= F.bounds[j + 1] + 1e-9 && F.E2[i] > best) { best = F.E2[i]; at = z; } }); return { layer: j + 1, E2: best, z: at }; });
  const edgeAt = z => { let best = 0; F.z.forEach((v, i) => { if (Math.abs(v - z) < Math.abs(F.z[best] - z)) best = i; }); return F.E2[best]; };
  return { ...F, nm, deg, pol, peaks, surface: F.E2[0], edges: F.bounds.map(edgeAt) };
}
function fieldCard(spec) {
  const toggle = h('button', { class: 'rt-btn', type: 'button', id: 'filmFieldShow', 'aria-expanded': String(!!fieldView.open),
    onclick: () => { fieldView.open = !fieldView.open; keepField(); render(); } }, fieldView.open ? 'Hide' : 'Show');
  const out = section('Field in the stack', h('div', { class: 'film-tools film-tolset' },
    h('span', { class: 'film-tolline' }, '|E|² through the layers, where laser damage starts'), toggle));
  out.id = 'filmField';
  if (!fieldView.open) return out;
  if (!film.layers.length) { out.append(h('p', { class: 'rt-lsub' }, 'No layers: add one to see the field in it.')); return out; }
  const F = filmField(film, fieldView), num = (v, set, label) => {
    const i = h('input', { type: 'text', inputmode: 'decimal', value: dsFmt(v, 5), class: 'rt-lnum', 'aria-label': label, spellcheck: 'false' });
    const go = () => { const x = +i.value; if (i.value.trim() !== '' && isFinite(x)) set(x); render(); };
    i.addEventListener('change', go); i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    return i;
  };
  out.querySelector('.film-tolline').replaceChildren('At', num(F.nm, v => { fieldView.nm = v > 0 ? v : null; }, 'Wavelength for the field (nm)'), 'nm,',
    num(F.deg, v => { fieldView.deg = Math.max(0, Math.min(89, v)); }, 'Angle of incidence for the field (degrees)'), '°,',
    dsSelect([['s', 's'], ['p', 'p']], F.pol, v => { fieldView.pol = v; keepField(); render(); }, 'Polarisation for the field'));
  const pl = h('div'), top = Math.max(...F.E2);
  linePlotSvg(pl, { id: 'field', H: 190, label: '|E|² against depth at ' + dsFmt(F.nm, 5) + ' nm, ' + dsFmt(F.deg, 3) + '°, ' + F.pol + ' (1 = the incident wave)',
    xTitle: 'Depth from the outer surface (nm)', yTitle: '|E|²', xName: 'nm', yUnit: '', yr: [0, Math.max(0.5, 1.1 * top)], marks: F.bounds,
    series: [{ label: '|E|²', cls: 's0', xs: F.z, ys: F.E2 }] });
  const hi = F.peaks.reduce((a, b) => (b.E2 > a.E2 ? b : a)), edge = F.edges.slice(0, -1).reduce((a, v, k) => (v > a.v ? { v, k } : a), { v: -1, k: 0 });
  const mat = L => (L.metal ? METAL_NAMES[L.metal] || L.metal : (COAT_MATERIALS.find(([v]) => Math.abs(+v - L.n) < 1e-9) || [0, 'n = ' + dsFmt(L.n, 4)])[1].replace(/ \([\d.]+\)$/, ''));
  const rows = [['Outer surface', dsFix(F.surface, 3), '0'],
    ['Highest, layer ' + hi.layer + ' (' + mat(film.layers[hi.layer - 1]) + ')', dsFix(hi.E2, 3), dsFix(hi.z, 1)],
    ['Highest at an interface', dsFix(edge.v, 3), dsFix(F.bounds[edge.k], 1)],
    ['Into the substrate', dsFix(F.E2[F.E2.length - 1], 3), dsFix(F.bounds[F.bounds.length - 1], 1)]];
  out.append(h('div', { class: 'rt-lpair' }, miniTable('filmFieldTable', 'Field in the stack', ['Where', '|E|²', 'Depth (nm)'], rows, 'Dashed lines on the plot: the interfaces.', true), pl));
  return out;
}
/* ---------- the tabs: Design, Tolerance, Make it (kept in this browser, per viewer) ---------- */
const FILM_TAB_KEY = 'jek-film-tab';
export let filmTab = (() => { try { const t = localStorage.getItem(FILM_TAB_KEY); return ['design', 'tolerance', 'make'].includes(t) ? t : 'design'; } catch (err) { return 'design'; } })();
export function setFilmTab(t) {
  filmTab = ['design', 'tolerance', 'make'].includes(t) ? t : 'design';
  try { localStorage.setItem(FILM_TAB_KEY, filmTab); } catch (err) { /* this visit only */ }
  const body = document.getElementById('filmBody'); if (body) body.scrollTop = 0;
  render();
}
/* ---------- tolerancing: the coating as made, with each layer's thickness off by a normal error ---------- */
let filmTol = null;                                   // { key: the coating it was run on, result }
const tolKey = () => JSON.stringify([film.spec, film.layers, film.tol]);
/* the tolerance run for the coating as it is now, if there is one */
export const filmTolResult = () => (filmTol && filmTol.key === tolKey() ? filmTol.result : null);
function tolCard() {
  const T = film.tol, res = filmTol && filmTol.key === tolKey() ? filmTol.result : null;
  const run = proMark(h('button', { class: 'rt-btn primary', type: 'button', id: 'filmTolRun', title: 'Monte Carlo: every layer’s thickness off by a normal error of this σ, run after run' }, 'Run'), 'tolerance a coating');
  run.addEventListener('click', () => tolNow());
  const out = section('Tolerance',
    h('div', { class: 'film-tools film-tolset' },
      h('span', { class: 'film-tolline' }, 'Each layer off by σ', dsNum(T.sigma, v => { film.tol.sigma = v; }, 'Thickness error σ', 4),
        dsSelect([['rel', '% of its thickness'], ['abs', 'nm']], T.kind, v => edit(f => { f.tol.kind = v; }), 'σ as a share or in nm'),
        'over', dsNum(T.runs, v => { film.tol.runs = Math.round(v); }, 'Runs', 4), 'runs'), run));
  if (!res) { out.append(h('p', { class: 'rt-lsub' }, 'Run to see how the coating fares as made: the spread of its reflectance and merit over the runs.')); return out; }
  const r3 = (label, o, f) => [label, f(o.nominal), f(o.median), f(o.p90)];
  const tbl = (h('div', { class: 'film-twrap film-perf' }, h('table', { class: 'film-results', id: 'filmTolTable', 'aria-label': 'Tolerance' },
    h('thead', null, h('tr', null, ...['', 'Nominal', 'Median', '90th percentile'].map((t, k) => h('th', { scope: 'col', class: k ? 'n' : null }, t)))),
    h('tbody', null, ...[r3('Merit', res.merit, v => dsFix(v, 3)), r3('R mean (%)', res.mean, dsR), r3('R max (%)', res.worst, dsR)].map(r => h('tr', null, h('th', { scope: 'row', class: 'lbl' }, r[0]), ...r.slice(1).map(v => h('td', { class: 'n mono' }, v))))))));
  const pl = h('div');
  out.append(h('div', { class: 'rt-lpair' }, tbl, pl));
  const a0 = filmSpec(film).theta0 || 0;
  linePlotSvg(pl, { id: 'tol', H: 190, label: 'Reflectance at ' + dsFmt(a0, 3) + '° over ' + res.tol.runs + ' runs, σ ' + res.tol.sigma + (res.tol.kind === 'rel' ? ' %' : ' nm'), xTitle: 'Wavelength (nm)', yTitle: 'R (%)', xName: 'nm', yUnit: '%',
    yr: [0, Math.min(100, Math.max(0.5, 1.15 * 100 * Math.max(...res.p95)))],
    series: [{ label: 'nominal', cls: 's0', xs: res.nms, ys: res.nominal.map(v => 100 * v) }, { label: 'median', cls: 's1', xs: res.nms, ys: res.p50.map(v => 100 * v) },
      { label: '5th and 95th percentiles', cls: 'tgt', dash: true, xs: res.nms, ys: res.p95.map(v => 100 * v) }, { label: '', cls: 'tgt', dash: true, xs: res.nms, ys: res.p5.map(v => 100 * v) }] });
  return out;
}
/* the yield of the tolerance run: the runs that meet every limit of Make it (worked out again when the limits change) */
let filmYieldMemo = null;
export function filmYieldResult() {
  const res = filmTolResult();
  if (!res) return null;
  const key = JSON.stringify(film.make);
  if (!filmYieldMemo || filmYieldMemo.res !== res || filmYieldMemo.key !== key) filmYieldMemo = { res, key, y: filmYield(res.stacks, film, filmSpec(film), film.make) };
  return filmYieldMemo.y;
}
function yieldCard() {
  const Y = filmYieldResult();
  const out = section('Yield');
  out.id = 'filmYield';
  if (!Y) { out.append(h('p', { class: 'rt-lsub' }, 'Run the tolerance above to see how many coatings as made meet the limits set in Make it.')); return out; }
  const share = (k, n) => (n ? dsFix(100 * k / n, 1) : '—');
  const ops = { le: '≤ ', ge: '≥ ' };
  out.append(h('p', { class: 'film-yield', id: 'filmYieldLine' }, h('strong', { class: 'mono' }, share(Y.pass, Y.runs) + ' %'), ' of ' + Y.runs + ' runs meet every limit (' + Y.pass + ' of ' + Y.runs + ').'),
    h('div', { class: 'film-twrap film-perf' }, h('table', { class: 'film-results', id: 'filmYieldTable', 'aria-label': 'Yield' },
      h('thead', null, h('tr', null, ...['Limit (%)', 'Band', 'Required', 'Nominal', '9 runs in 10', 'Runs meeting it (%)'].map((t, k) => h('th', { scope: 'col', class: k > 1 ? 'n' : null }, t)))),
      h('tbody', null, ...Y.rows.map(r => h('tr', null, h('th', { scope: 'row', class: 'lbl' }, r.label), h('td', null, r.where),
        ...[ops[r.op] + r.value, dsFix(r.nominal, 3), dsFix(r.p10, 3), share(r.pass, Y.runs)].map(v => h('td', { class: 'n mono' }, v))))),
      h('tfoot', null, h('tr', null, h('td', { colspan: '6' }, 'Judged over the band and all the angles, as Make it judges them (the table above is at ' + dsFmt(filmSpec(film).theta0 || 0, 3) + '° only). 9 runs in 10: the value nine runs in ten do as well as or better than.'))))));
  return out;
}
/* the run, JEKrayPro's as tolerancing is in JEKray */
export function tolNow() {
  if (!film.layers.length) { toast('Add a layer first: there is nothing to tolerance', true); return null; }
  if (!designPro('tolerance a coating')) return null;
  const result = filmTolerance(film.layers, filmSpec(film), film.tol);
  filmTol = { key: tolKey(), result };
  track('tolerance', 'film-run');
  render();
  return result;
}
/* the searches beyond the thicknesses, JEKrayPro's as the optimiser is: adding layers (needle) or choosing materials;
   while one runs the buttons wait, and its result is one step of Undo */
let filmSearching = false;
export async function searchNow(kind) {
  if (filmSearching) return null;
  if (!film.layers.some(L => !L.metal)) { toast('Add a dielectric layer first: there is nothing to search', true); return null; }
  if (!designPro('optimise a coating')) return null;
  filmSearching = true;
  const btns = ['filmOptimise', 'filmNeedle', 'filmMaterials'].map(id => document.getElementById(id)).filter(Boolean);
  for (const b of btns) b.disabled = true;
  try {
    const spec = filmSpec(film);
    const o = kind === 'needle' ? await filmNeedle(film.layers, spec, { onStep: s => toast('Needle: ' + s.layers + ' layers, merit ' + dsFix(s.merit, 3)) })
      : await filmMaterials(film.layers, spec, { onStep: s => toast('Materials: layer ' + s.layer + ' changed, merit ' + dsFix(s.merit, 3)) });
    if (o.after < o.before) edit(f => { f.layers = o.layers; });
    track('optimise', 'film-' + kind);
    toast(o.after < o.before ? 'Merit ' + dsFix(o.before, 3) + ' to ' + dsFix(o.after, 3) + (kind === 'needle' ? ', ' + o.layers.length + ' layers' : ', ' + o.changed + (o.changed === 1 ? ' layer' : ' layers') + ' of another material')
      : kind === 'needle' ? 'No layer added helps: this stack is as good as a needle can make it' : 'No other material helps: these are the best of the list', o.after >= o.before);
    return o;
  } finally { filmSearching = false; for (const b of btns) b.disabled = false; render(); }
}
/* the optimiser, JEKrayPro's: the thicknesses searched from where they stand */
export function optimiseNow() {
  if (!film.layers.length) { toast('Add a layer first: there is nothing to optimise', true); return null; }
  if (!designPro('optimise a coating')) return null;
  const o = coatOptimise(film.layers, filmSpec(film));
  edit(f => { f.layers = o.layers; });
  track('optimise', 'film-thicknesses');
  toast('Merit ' + dsFix(o.before, 3) + ' to ' + dsFix(o.after, 3) + ' in ' + o.evals + ' tries');
  return o;
}
