import { h } from '../../../jekray/src/ui/dom.js';
import { hooks } from '../../../jekray/src/core/hooks.js';
import { proMark } from '../../../jekray/src/ui/pro.js';
import { FILM_TARGETS, subLabelOf } from '../core/film.js';
import { MAKE_DURABILITY, MAKE_SURFACES, makeLimits } from '../core/film-make.js';
import { edit, film } from './designer.js';
import { saveFilmSpec } from '../io/film-spec.js';

/* ==========================================================================
   Make it: what an optics maker needs to coat the part, kept with the coating (make), and the files that carry it.
   The part and the substrate, the surfaces and the clear aperture; the performance it is accepted against, each limit
   beside what the design gives (a limit the design misses shows); durability, surface quality and how it is checked;
   then the coating specification (PDF, JEKrayPro's) and the design data.
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
  const part = h('table', { class: 'film-props film-mk' }, h('tbody', null,
    mkRow('Part', mkText(M.part, (m, v) => { m.part = v; }, 'Part name or number', { placeholder: film.name })),
    mkRow('Quantity', mkText(M.qty, (m, v) => { m.qty = v; }, 'Quantity', { num: true })),
    mkRow('Substrate', h('span', null, subLabelOf(film.spec.sub) + ' (from the design)')),
    mkRow('Diameter', mkText(M.size, (m, v) => { m.size = v; }, 'Diameter (mm)', { num: true }), 'mm'),
    mkRow('Clear aperture', mkText(M.ca, (m, v) => { m.ca = v; }, 'Clear aperture (% of the diameter)', { num: true }), '%'),
    mkRow('Surfaces coated', mkSelect(MAKE_SURFACES, M.surfaces, (m, v) => { m.surfaces = v; }, 'Surfaces coated'))));
  const rows = makeLimits(film, spec, M);
  const lim = h('table', { class: 'film-results film-limits', id: 'filmLimits' },
    h('thead', null, h('tr', null, ...['Quantity', 'Band', 'Limit (%)', 'Design gives (%)', ''].map((t, k) => h('th', { scope: 'col', class: k >= 2 ? 'n' : null }, t)))),
    h('tbody', null, ...rows.map(r => h('tr', { class: r.ok ? null : 'film-miss' }, h('th', { scope: 'row', class: 'lbl' }, r.label), h('td', { class: 'film-band' }, r.where),
      h('td', { class: 'n' }, h('span', { class: 'film-op' }, r.op === 'le' ? '≤' : '≥'), mkText(r.value, (m, v) => { m.limits[r.key] = Math.min(100, Math.max(0, v)); }, r.label + ' limit (%)', { num: true })),
      h('td', { class: 'n mono' }, mpct(r.design)), h('td', { class: 'film-met' }, r.ok ? 'met' : 'not met')))));
  const angles = spec.theta > spec.theta0 ? spec.theta0 + '–' + spec.theta + '°' : spec.theta0 + '°';
  const perf = mkSec('Performance', h('p', { class: 'rt-lsub' }, FILM_TARGETS[spec.target] + ': the reflectance of one coated surface at ' + angles + ', ' + ({ avg: 'mean of s and p', s: 's', p: 'p' }[spec.pol]) + ', as the Design tab judges it. Each limit is the design’s value with a margin until you set it.'), h('div', { class: 'film-twrap' }, lim),
    spec.target === 'split' ? h('p', { class: 'rt-lsub' }, 'Splitter tolerance ± ', mkText(M.splitTol, (m, v) => { m.splitTol = v; delete m.limits.min; delete m.limits.max; }, 'Splitter tolerance (%)', { num: true }), ' %') : null,
    h('button', { class: 'film-tbtn', type: 'button', onclick: () => edit(f => { f.make.limits = {}; }) }, 'Limits from the design again'));
  const dur = h('table', { class: 'film-props film-mk' }, h('tbody', null,
    mkRow('Durability', mkSelect(MAKE_DURABILITY, M.durability, (m, v) => { m.durability = v; }, 'Durability')),
    mkRow('Surface quality', mkText(M.quality, (m, v) => { m.quality = v; }, 'Surface quality')),
    mkRow('Witness sample', h('label', { class: 'film-chk' }, h('input', { type: 'checkbox', checked: M.witness ? '' : null, onchange: e => edit(f => { f.make.witness = e.target.checked; }) }), ' measure it and send the curve'))));
  const pdf = proMark(h('button', { class: 'rt-btn primary', type: 'button', id: 'filmSpecPdf', title: 'The order and the design behind it, as a two-page PDF to send to the maker' }, 'Coating specification (PDF)'), 'make a coating specification');
  pdf.addEventListener('click', () => saveFilmSpec());
  const misses = rows.filter(r => !r.ok).length;
  const out = mkSec('Files for the maker',
    h('p', { class: 'rt-lsub' }, 'The specification is the order: the part, the performance it is accepted against, durability and how it is checked, with the design (layers, curves, tolerance) on its second page. The data gives the design curves to compare their measurements with.'),
    misses ? h('p', { class: 'film-warn' }, misses === 1 ? 'The design misses one of the limits: change the design, or the limit, before sending it.' : 'The design misses ' + misses + ' of the limits: change the design, or the limits, before sending it.') : null,
    h('div', { class: 'film-tools' }, pdf, h('button', { class: 'rt-btn', type: 'button', onclick: () => document.getElementById('btnExportData').click() }, 'Design data…')));
  return [mkSec('Part and substrate', part), perf, mkSec('Durability and checks', dur), out];
}
export function wireMake() { hooks.filmMakeCards = makeCards; }
