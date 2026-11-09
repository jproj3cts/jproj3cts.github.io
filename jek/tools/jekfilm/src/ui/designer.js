import { h } from '../../../jekray/src/ui/dom.js';
import { hooks } from '../../../jekray/src/core/hooks.js';
import { designPro, proMark } from '../../../jekray/src/ui/pro.js';
import { track } from '../../../jekray/src/io/usage.js';
import { COAT_MATERIALS, qwot } from '../../../jekray/src/core/coatings.js';
import { coatAngles, coatCurve, coatOptimise, coatSummary, coatWant } from '../../../jekray/src/core/coatdesign.js';
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
  const i = h('input', { type: 'text', inputmode: 'decimal', value: dsFmt(value, p || 6), class: 'rt-lnum', 'aria-label': label, spellcheck: 'false' });
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
const dsRow = (label, ...kids) => h('label', { class: 'rt-lrow' }, h('span', null, label), ...kids);
/* a short line of help, its fuller explanation folded behind an ⓘ */
function dsHelp(short, long) {
  const more = h('span', { class: 'rt-helpmore', hidden: '' }, ' ', long);
  const btn = h('button', { type: 'button', class: 'rt-helpbtn', 'aria-expanded': 'false', 'aria-label': 'More about this', title: 'More about this',
    onclick: () => { const open = more.hidden; more.hidden = !open; btn.setAttribute('aria-expanded', String(open)); } }, 'ⓘ');
  return h('p', { class: 'rt-lsub' }, short, ' ', btn, more);
}

/* ---------- the page ---------- */
export function render() {
  const body = document.getElementById('filmBody');
  if (!body) return;
  const scroll = body.scrollTop, spec = filmSpec(film), sum = coatSummary(film.layers, spec);
  body.replaceChildren(settingsCard(spec), h('div', { class: 'rt-lmain' }, figures(sum, spec), plotsCard(spec), layersCard(spec)));
  body.scrollTop = scroll;
  const nm = document.getElementById('filmName');
  if (nm && document.activeElement !== nm) nm.value = film.name;
  for (const [id, can] of [['btnUndo', canUndo()], ['btnRedo', canRedo()]]) { const b = document.getElementById(id); if (b) b.disabled = !can; }
  document.title = film.name + ' | JEKfilm';
}
function settingsCard(spec) {
  const S = film.spec;
  const card = h('section', { class: 'rt-lcard rt-lcond rt-rfcond', 'aria-label': 'The coating' }, h('h2', null, 'The coating'));
  card.append(h('p', { class: 'rt-lsub' }, 'What the stack is for, what it sits on and the light it is judged in.'));
  const rows = [dsRow('For', dsSelect(Object.entries(FILM_TARGETS), S.target, v => edit(f => { f.spec.target = v; }), 'What the coating is for'))];
  const subOpts = Object.keys(FILM_GLASSES).map(g => ['g:' + g, g]).concat([['n', 'An index of my own']]);
  rows.push(dsRow('On', dsSelect(subOpts, S.sub.glass ? 'g:' + S.sub.glass : 'n', v => edit(f => { f.spec.sub = v === 'n' ? { n: +subIndex(f.spec.sub, f.spec.design).toFixed(4) } : { glass: v.slice(2) }; }), 'The substrate')));
  if (!S.sub.glass) rows.push(dsRow('Its index', dsNum(S.sub.n, v => { film.spec.sub = { n: Math.max(1, v) }; }, 'Substrate index')));
  else if (!subClear(S.sub, S.design)) rows.push(h('p', { class: 'rt-lsub film-warn' }, S.sub.glass + ' is not transparent at ' + dsFmt(S.design, 5) + ' nm: choose a design wavelength where it is, or another substrate.'));
  else rows.push(dsRow('Its index', h('span', { class: 'mono' }, dsFmt(spec.ns, 5) + ' at ' + dsFmt(spec.design, 5) + ' nm')));
  rows.push(dsRow('Light comes from (n, 1 for air)', dsNum(S.n0, v => { film.spec.n0 = Math.max(1, v); }, 'Index of the medium the light comes from')),
    dsRow('Band (nm)', h('span', { class: 'film-pair' }, dsNum(S.lo, v => { film.spec.lo = v; film.spec.hi = Math.max(v, film.spec.hi); }, 'Band from (nm)'), 'to', dsNum(S.hi, v => { film.spec.hi = Math.max(film.spec.lo, v); }, 'Band to (nm)'))),
    dsRow('Design wavelength (nm)', dsNum(S.design, v => { film.spec.design = v; }, 'Design wavelength (nm)')),
    dsRow('Angles up to (°)', dsNum(S.theta, v => { film.spec.theta = v; }, 'Largest angle of incidence (degrees)')),
    dsRow('Polarisation', dsSelect([['avg', 's and p, the mean'], ['s', 's'], ['p', 'p']], S.pol, v => edit(f => { f.spec.pol = v; }), 'Polarisation judged')));
  if (S.target === 'split') rows.push(dsRow('Reflects (%)', dsNum(S.R, v => { film.spec.R = v; }, 'Reflectance wanted (%)')));
  if (S.target === 'edge') rows.push(dsRow('Turns at (nm)', dsNum(S.edge, v => { film.spec.edge = v; }, 'Edge wavelength (nm)')),
    dsRow('Passes', dsSelect([['below', 'shorter wavelengths, reflects longer'], ['above', 'longer wavelengths, reflects shorter']], S.passBelow ? 'below' : 'above', v => edit(f => { f.spec.passBelow = v === 'below'; }), 'Which side passes')));
  card.append(h('div', { class: 'rt-rfgrid' }, ...rows));
  card.append(dsHelp('Judged over the band and the angles, each wavelength and angle alike.',
    'The merit is the mean square of the reflectance against its target over the band and the angles up to the largest, for the polarisation chosen; an edge’s own wavelength ± 2% is left out, as no stack turns in no width. The stack is worked out with the thin-film model JEKray traces with, so a coating designed here behaves the same on a JEKray bench.'));
  return card;
}
function figures(sum, spec) {
  const r = (a, b, t) => h('div', { title: t || '' }, h('span', null, a), h('b', { class: 'mono' }, b));
  return h('div', { class: 'rt-lfig', id: 'filmFigures' },
    r('Reflects, over the band', dsPct(sum.mean) + ' mean, ' + dsPct(sum.worst) + ' worst', 'Square on, across the band'),
    ...(spec.theta > 0 ? [r('At ' + dsFmt(spec.theta, 3) + '°', dsPct(sum.meanAt) + ' mean, ' + dsPct(sum.worstAt) + ' worst')] : []),
    r('At ' + dsFmt(spec.design, 5) + ' nm', dsPct(sum.design)),
    r('Bare face', dsPct(sum.bare), 'What the face would reflect square on with no coating'),
    r('Merit', dsFmt(sum.merit, 3), 'The mean square of the reflectance against its target over the band and the angles'));
}
/* the curves drawn: square on and at the largest angle against wavelength, the target; s and p against the angle */
export function filmCurves(f) {
  const spec = filmSpec(f), c0 = coatCurve(f.layers, spec, 0), ct = spec.theta > 0 ? coatCurve(f.layers, spec, spec.theta) : null, A = coatAngles(f.layers, spec);
  return { spec, nms: c0.nms, R0: c0.R, Rt: ct ? ct.R : null, want: c0.nms.map(nm => coatWant(spec, nm)), A };
}
function plotsCard() {
  const C = filmCurves(film), spec = C.spec;
  const card = h('section', { class: 'rt-lcard' }, h('h2', null, 'Reflectance'));
  const series = [{ label: 'square on', cls: 's0', xs: C.nms, ys: C.R0.map(v => 100 * v) }];
  if (C.Rt) series.push({ label: 'at ' + dsFmt(spec.theta, 3) + '°', cls: 's1', xs: C.nms, ys: C.Rt.map(v => 100 * v) });
  series.push({ label: 'target', cls: 'tgt', dash: true, xs: C.nms, ys: C.want.map(v => 100 * v) });
  const top = Math.min(100, Math.max(0.5, 1.15 * Math.max(...series.flatMap(s => s.ys))));
  const wrap = h('div', { class: 'rt-lpair' }), a = h('div'), b = h('div'); wrap.append(a, b); card.append(wrap);
  linePlotSvg(a, { id: 'band', label: 'Reflectance across the band', xTitle: 'wavelength, nm', yTitle: 'R, %', xName: 'nm', yUnit: '%', yr: [0, top], series });
  linePlotSvg(b, { id: 'angle', label: 'Reflectance against the angle, at ' + dsFmt(spec.design, 5) + ' nm', xTitle: 'angle of incidence, °', yTitle: 'R, %', xName: '°', yUnit: '%', xr: [0, 89], yr: [0, 100],
    series: [{ label: 's', cls: 's0', xs: C.A.degs, ys: C.A.s.map(v => 100 * v) }, { label: 'p', cls: 's1', xs: C.A.degs, ys: C.A.p.map(v => 100 * v) }] });
  return card;
}
function layersCard(spec) {
  const layers = film.layers;
  const card = h('section', { class: 'rt-lcard rt-coatlayers', 'aria-label': 'The layers' }, h('h2', null, 'The layers'),
    h('p', { class: 'rt-lsub' }, 'From the outside in: each layer’s index and thickness, and its optical thickness in quarter waves at the design wavelength.'));
  const tbl = h('table', { class: 'rt-ltable', id: 'filmLayers', style: 'min-width:0' }), tb = h('tbody');
  tbl.append(h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Material'), h('th', null, 'n'), h('th', null, 'Thickness (nm)'), h('th', null, 'λ/4 at design'), h('th', null, ''))));
  layers.forEach((L, k) => {
    const qw = qwot(L.n, spec.design);
    const opts = COAT_MATERIALS.map(([v, t]) => [String(+v), t]);
    if (!opts.some(o => Math.abs(+o[0] - L.n) < 1e-9)) opts.push([String(+L.n), 'n = ' + dsFmt(L.n, 4)]);
    opts.push(['custom', 'An index of my own…']);
    const mat = dsSelect(opts, String(+L.n), v => {
      if (v === 'custom') { const n = +prompt('The layer’s index', String(L.n)); if (isFinite(n) && n >= 1) edit(f => { f.layers[k].n = n; }); else render(); }
      else edit(f => { f.layers[k].n = +v; });
    }, 'Layer ' + (k + 1) + ' material');
    tb.append(h('tr', null, h('td', { class: 'mono' }, String(k + 1)), h('td', null, mat), h('td', { class: 'mono' }, dsFmt(L.n, 4)),
      h('td', null, dsNum(L.d, v => { film.layers[k].d = Math.max(0.01, v); }, 'Layer ' + (k + 1) + ' thickness (nm)', 5)),
      h('td', { class: 'mono' }, dsFmt(L.d / qw, 3)),
      h('td', null, h('button', { class: 'rt-link', type: 'button', title: 'Make this layer a quarter wave thick at the design wavelength', onclick: () => edit(f => { f.layers[k].d = qw; }) }, 'λ/4'), ' ',
        h('button', { class: 'rt-link', type: 'button', onclick: () => edit(f => { f.layers.splice(k, 1); }) }, 'Remove'))));
  });
  if (!layers.length) tb.append(h('tr', null, h('td', { colspan: '6', class: 'rt-lsub' }, 'No layers: the bare substrate. Add one, or start from a preset.')));
  tbl.append(tb);
  card.append(h('div', { class: 'rt-ltwrap' }, tbl));
  const pre = dsSelect([['', 'Start from a preset…'], ...FILM_PRESETS], '', v => { if (v) edit(f => { f.layers = filmPreset(v, f.spec.design); }); }, 'A preset stack');
  const opt = proMark(h('button', { class: 'rt-btn primary', type: 'button', id: 'filmOptimise', title: 'Nelder–Mead on the thicknesses, from where they stand, against the target over the band and the angles' }, 'Optimise thicknesses'), 'optimise a coating');
  opt.addEventListener('click', () => optimiseNow());
  card.append(h('div', { class: 'rt-rfacts' }, opt,
    h('button', { class: 'rt-btn', type: 'button', id: 'filmAddLayer', onclick: () => edit(f => { f.layers.push({ n: 1.38, d: qwot(1.38, f.spec.design) }); }) }, 'Add a layer'),
    h('button', { class: 'rt-btn', type: 'button', onclick: () => edit(f => { for (const L of f.layers) L.d = qwot(L.n, f.spec.design); }) }, 'All quarter waves'),
    pre));
  return card;
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
