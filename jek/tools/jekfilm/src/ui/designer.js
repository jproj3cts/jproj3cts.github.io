import { h } from '../../../jekray/src/ui/dom.js';
import { hooks } from '../../../jekray/src/core/hooks.js';
import { designPro, proMark } from '../../../jekray/src/ui/pro.js';
import { track } from '../../../jekray/src/io/usage.js';
import { COAT_MATERIALS, qwot } from '../../../jekray/src/core/coatings.js';
import { coatAngles, coatCurve, coatMerit, coatOptimise, coatWant, stackR } from '../../../jekray/src/core/coatdesign.js';
import { FILM_GLASSES, FILM_PRESETS, FILM_TARGETS, filmPreset, filmSpec, newFilm, normFilm, subClear, subIndex } from '../core/film.js';
import { linePlotSvg } from './plot.js';
import { toast } from './bar.js';

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
  body.replaceChildren(settingsCard(spec), h('div', { class: 'rt-lmain' }, plotsCard(), layersCard(spec)));
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
/* a reflectance as a percentage to three decimals, so a column's figures line up */
const dsR = v => (isFinite(v) ? (100 * v).toFixed(3) : '—');
/* a small table under a plot: a heading row, figure rows, and a line of notes under it */
function miniTable(id, label, heads, rows, foot) {
  return h('div', { class: 'film-twrap film-perf' }, h('table', { class: 'film-results', id, 'aria-label': label },
    h('thead', null, h('tr', null, ...heads.map((t, k) => h('th', { scope: 'col', class: k ? 'n' : null }, t)))),
    h('tbody', null, ...rows.map(r => h('tr', null, h('th', { scope: 'row' }, r[0]), ...r.slice(1).map(v => h('td', { class: 'n mono' }, v))))),
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
    'Merit ' + dsFmt(coatMerit(film.layers, spec), 3) + ' · bare substrate ' + dsR(bare) + ' %'));
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
    const opts = COAT_MATERIALS.map(([v, t]) => [String(+v), t]);
    if (!opts.some(o => Math.abs(+o[0] - L.n) < 1e-9)) opts.push([String(+L.n), 'n = ' + dsFmt(L.n, 4)]);
    opts.push(['custom', 'Index of my own…']);
    const mat = dsSelect(opts, String(+L.n), v => {
      if (v === 'custom') { const n = +prompt('The layer’s index', String(L.n)); if (isFinite(n) && n >= 1) edit(f => { f.layers[k].n = n; }); else render(); }
      else edit(f => { f.layers[k].n = +v; });
    }, 'Layer ' + (k + 1) + ' material');
    tb.append(h('tr', null, h('td', { class: 'n mono' }, String(k + 1)), h('td', null, mat), h('td', { class: 'n mono' }, (+L.n).toFixed(3)),
      h('td', { class: 'n' }, dsNum(L.d, v => { film.layers[k].d = Math.max(0.01, v); }, 'Layer ' + (k + 1) + ' thickness (nm)', { dp: 2 })),
      h('td', { class: 'n mono' }, (L.d / qw).toFixed(3)),
      h('td', { class: 'acts' }, h('button', { class: 'film-tbtn', type: 'button', title: 'Make this layer a quarter wave at λ₀', onclick: () => edit(f => { f.layers[k].d = qw; }) }, 'λ/4'),
        h('button', { class: 'film-tbtn', type: 'button', title: 'Remove layer ' + (k + 1), 'aria-label': 'Remove layer ' + (k + 1), onclick: () => edit(f => { f.layers.splice(k, 1); }) }, '✕'))));
  });
  if (!layers.length) tb.append(h('tr', null, h('td', { colspan: '6', class: 'film-empty' }, 'No layers: the bare substrate. Add one, or start from a preset.')));
  tbl.append(tb, h('tfoot', null,
    h('tr', { class: 'film-medium' }, h('td', { class: 'n' }, '—'), h('td', null, 'Substrate: ' + (S.sub.glass || 'index of my own')), h('td', { class: 'n mono' }, subClear(S.sub, S.design) ? spec.ns.toFixed(3) : '—'), h('td', { class: 'n' }, '∞'), h('td'), h('td')),
    h('tr', { class: 'film-total' }, h('td'), h('th', { scope: 'row' }, layers.length + (layers.length === 1 ? ' layer' : ' layers')), h('td'), h('td', { class: 'n mono' }, total.toFixed(2)), h('td'), h('td'))));
  const pre = dsSelect([['', 'Preset…'], ...FILM_PRESETS], '', v => { if (v) edit(f => { f.layers = filmPreset(v, f.spec.design); }); }, 'A preset stack');
  const opt = proMark(h('button', { class: 'rt-btn primary', type: 'button', id: 'filmOptimise', title: 'Nelder–Mead on the thicknesses, from where they stand, against the target over the band and the angles' }, 'Optimise thicknesses'), 'optimise a coating');
  opt.addEventListener('click', () => optimiseNow());
  return section('Layers',
    h('div', { class: 'film-twrap' }, tbl),
    h('div', { class: 'film-tools' }, opt,
      h('button', { class: 'rt-btn', type: 'button', id: 'filmAddLayer', onclick: () => edit(f => { f.layers.push({ n: 1.38, d: qwot(1.38, f.spec.design) }); }) }, 'Add layer'),
      h('button', { class: 'rt-btn', type: 'button', onclick: () => edit(f => { for (const L of f.layers) L.d = qwot(L.n, f.spec.design); }) }, 'All quarter waves'),
      pre));
}
/* the optimiser, JEKrayPro's: the thicknesses searched from where they stand */
export function optimiseNow() {
  if (!film.layers.length) { toast('Add a layer first: there is nothing to optimise', true); return null; }
  if (!designPro('optimise a coating')) return null;
  const o = coatOptimise(film.layers, filmSpec(film));
  edit(f => { f.layers = o.layers; });
  track('optimise', 'film');
  toast('Merit ' + dsFmt(o.before, 3) + ' to ' + dsFmt(o.after, 3) + ' in ' + o.evals + ' tries');
  return o;
}
