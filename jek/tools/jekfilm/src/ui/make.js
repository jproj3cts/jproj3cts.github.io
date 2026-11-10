import { h } from '../../../jekray/src/ui/dom.js';
import { hooks } from '../../../jekray/src/core/hooks.js';
import { proMark } from '../../../jekray/src/ui/pro.js';
import { FILM_TARGETS, subLabelOf } from '../core/film.js';
import { MAKE_DURABILITY, drawingNote, makeLimits } from '../core/film-make.js';
import { edit, film } from './designer.js';
import { saveFilmSpec } from '../io/film-spec.js';

/* ==========================================================================
   Make it: what a coater needs, kept with the coating (make): the coating and the substrate it is on (nothing else of
   the part: that is the part's drawing's); the performance it is accepted against, reflectance and transmittance, each
   limit beside what the design gives (a limit the design misses shows); durability and how it is checked; the note for
   the part's drawing; then the coating specification (PDF, JEKrayPro's) and the design data.
   ========================================================================== */
const mkSec = (title, ...kids) => h('section', { class: 'film-sec rt-lcard', 'aria-label': title }, h('h2', null, title), ...kids);
const mkRow = (label, value, unit) => h('tr', null, h('th', { scope: 'row' }, label), h('td', null, value), h('td', { class: 'unit' }, unit || ''));
function mkText(value, set, label, o) {
  const i = h('input', { type: 'text', value: value === undefined ? '' : String(value), class: 'film-mkin' + (o && o.num ? ' num' : ''), 'aria-label': label, spellcheck: 'false', placeholder: (o && o.placeholder) || '' });
  i.addEventListener('change', () => { const v = o && o.num ? +i.value : i.value.trim(); if (o && o.num && !isFinite(v)) { i.value = String(value); return; } edit(f => set(f.make, v)); });
  return i;
}
function mkSelect(options, value, set, label) {
  const s = h('select', { 'aria-label': label }, ...Object.entries(options).map(([v, t]) => h('option', { value: v, selected: v === value ? '' : null }, t)));
  s.addEventListener('change', () => edit(f => set(f.make, s.value)));
  return s;
}
const mpct = v => (v >= 10 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : v.toExponential(2));
export function makeCards(spec) {
  const M = film.make;
  const sub = h('table', { class: 'film-props film-mk' }, h('tbody', null,
    mkRow('Coating', h('span', null, FILM_TARGETS[spec.target] + ', ' + film.layers.length + (film.layers.length === 1 ? ' layer' : ' layers'))),
    mkRow('Substrate', h('span', null, subLabelOf(film.spec.sub) + ', n = ' + spec.ns.toFixed(4) + ' at ' + spec.design + ' nm'))));
  const rows = makeLimits(film, spec, M);
  const lim = h('table', { class: 'film-results film-limits', id: 'filmLimits' },
    h('thead', null, h('tr', null, ...['Quantity', 'Band', 'Limit (%)', 'Design gives (%)', ''].map((t, k) => h('th', { scope: 'col', class: k >= 2 ? 'n' : null }, t)))),
    h('tbody', null, ...rows.map(r => h('tr', { class: r.ok ? null : 'film-miss' }, h('th', { scope: 'row', class: 'lbl' }, r.label), h('td', { class: 'film-band' }, r.where),
      h('td', { class: 'n' }, h('span', { class: 'film-op' }, r.op === 'le' ? '≤' : '≥'), mkText(r.value, (m, v) => { m.limits[r.key] = Math.min(100, Math.max(0, v)); }, r.label + ' limit (%)', { num: true })),
      h('td', { class: 'n mono' }, mpct(r.design)), h('td', { class: 'film-met' }, r.ok ? 'met' : 'not met')))));
  const angles = spec.theta > spec.theta0 ? spec.theta0 + '–' + spec.theta + '°' : spec.theta0 + '°';
  const perf = mkSec('Performance', h('p', { class: 'rt-lsub' }, 'One coated surface at ' + angles + ', ' + ({ avg: 'mean of s and p', s: 's', p: 'p' }[spec.pol]) + ': its reflectance R, and its transmittance T into the substrate. Each limit is the design’s value with a margin until you set it.'), h('div', { class: 'film-twrap' }, lim),
    spec.target === 'split' ? h('p', { class: 'rt-lsub' }, 'Splitter tolerance ± ', mkText(M.splitTol, (m, v) => { m.splitTol = v; delete m.limits.min; delete m.limits.max; }, 'Splitter tolerance (%)', { num: true }), ' %') : null,
    h('button', { class: 'film-tbtn', type: 'button', onclick: () => edit(f => { f.make.limits = {}; }) }, 'Limits from the design again'));
  const dur = h('table', { class: 'film-props film-mk' }, h('tbody', null,
    mkRow('Durability', mkSelect(MAKE_DURABILITY, M.durability, (m, v) => { m.durability = v; }, 'Durability')),
    mkRow('Witness sample', h('label', { class: 'film-chk' }, h('input', { type: 'checkbox', checked: M.witness ? '' : null, onchange: e => edit(f => { f.make.witness = e.target.checked; }) }), ' measure it and send the curve'))));
  const pdf = proMark(h('button', { class: 'rt-btn primary', type: 'button', id: 'filmSpecPdf', title: 'The order and the design behind it, as a two-page PDF to send to the maker' }, 'Coating specification (PDF)'), 'make a coating specification');
  pdf.addEventListener('click', () => saveFilmSpec());
  const misses = rows.filter(r => !r.ok).length;
  const out = mkSec('Files for the maker',
    h('p', { class: 'rt-lsub' }, 'The specification is the coating and its substrate, the performance it is accepted against, durability and how it is checked, with the design (layers, curves, tolerance) on its second page. The data gives the design curves to compare the coater’s measurements with.'),
    misses ? h('p', { class: 'film-warn' }, misses === 1 ? 'The design misses one of the limits: change the design, or the limit, before sending it.' : 'The design misses ' + misses + ' of the limits: change the design, or the limits, before sending it.') : null,
    h('div', { class: 'film-tools' }, pdf, h('button', { class: 'rt-btn', type: 'button', onclick: () => document.getElementById('btnExportData').click() }, 'Design data…')));
  // the note for the part's optical drawing (ISO 10110-9's way of marking a coating), to copy
  const note = drawingNote(film, spec, M), pre = h('pre', { class: 'film-note', id: 'filmDrawingNote' }, note.join('\n'));
  const copy = h('button', { class: 'film-tbtn', type: 'button', onclick: () => { navigator.clipboard.writeText(note.join('\n')).then(() => { copy.textContent = 'Copied'; }, () => {}); } }, 'Copy');
  const draw = mkSec('Drawing note', h('p', { class: 'rt-lsub' }, 'The coating as the part’s optical drawing carries it, in the manner of ISO 10110-9: marked on its surface by λ in a circle, its requirements as ρ(λ) for reflectance and τ(λ) for transmittance. Check the layout against the standard itself before relying on it.'), pre, copy);
  return [mkSec('Coating and substrate', sub), perf, mkSec('Durability and checks', dur), draw, out];
}
export function wireMake() { hooks.filmMakeCards = makeCards; }
