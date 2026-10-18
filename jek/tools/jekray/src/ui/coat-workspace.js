import { h, helpLine } from './panel.js';
import { changed, toast } from './actions.js';
import { checkpoint } from './tabs.js';
import { linePlot } from './lens-analyses.js';
import { COAT_MATERIALS, coatPreset, qwot } from '../core/coatings.js';
import { COAT_TARGETS, coatAngles, coatCurve, coatOptimise, coatSpec, coatSummary, coatToStack } from '../core/coatdesign.js';
import { normCoat } from '../state/project.js';
import { GLASS, glassKey, refIndex } from '../core/glass.js';
import { C_NM_GHZ, RF_MAT, mixEps } from '../core/rf.js';
import { benchNms } from '../state/elements.js';
import { fmtWs } from '../core/format.js';
import { hooks } from '../core/hooks.js';

/* ==========================================================================
   The coating design workspace
   A thin-film stack designed against what it is for (core/coatdesign.js), on its own page over the bench as the lens
   and RF designers are. Opened from a face's Coating setting (Design a coating…), from the lens designer's face table,
   from the RF designer's matching layers, or from File › Open a workspace with no face at all. Use this coating writes
   the stack to the face it came from; Keep as a coating keeps it by name in this browser, for any face's Coating list.
   ========================================================================== */
let CW = null;                       // { spec, layers, from: { el, holder, label, onUse } | null, names }
export const coatDesignOpen = () => !!CW;
const CW_KEPT = 'JEK_COATINGS';
/* the coatings kept by name in this browser: [{ id, name, coat, spec }] */
export function keptCoatings() { try { const v = JSON.parse(localStorage.getItem(CW_KEPT) || '[]'); return Array.isArray(v) ? v : []; } catch (err) { return []; } }
function cwKeep(name, coat, spec) {
  const list = keptCoatings().filter(k => k.name !== name);
  list.push({ id: 'c' + Date.now().toString(36), name, coat, spec });
  try { localStorage.setItem(CW_KEPT, JSON.stringify(list.slice(-60))); } catch (err) { toast('Could not keep it in this browser', true); }
}
export function forgetCoating(id) { try { localStorage.setItem(CW_KEPT, JSON.stringify(keptCoatings().filter(k => k.id !== id))); } catch (err) { /* none */ } }

/* the common substrates offered, and an RF material's index */
const CW_GLASSES = ['N-BK7', 'Fused silica', 'N-SF11', 'N-LAK22', 'CaF2', 'Sapphire', 'N-SK16', 'F2'].filter(g => GLASS[g] || glassKey(g));
/* the index of the substrate chosen: a glass at the design wavelength, an RF dielectric, or a number */
function cwSubIndex(S) {
  if (S.subKind === 'n') return S.subN;
  if (S.subKind === 'rf') { const M = RF_MAT[S.subRf]; return M ? M.n : 1.5; }
  return refIndex({ glass: S.subGlass }, S.design);
}
/* the spec from the workspace's settings */
function cwSpec(S) {
  const ns = cwSubIndex(S), rf = S.target === 'rf';
  const design = rf ? C_NM_GHZ / S.ghz : S.design, lo = rf ? design / (1 + S.bandPct / 100) : S.lo, hi = rf ? design * (1 + S.bandPct / 100) : S.hi;
  return coatSpec({ target: S.target, n0: S.n0, ns, lo, hi, theta: S.theta, pol: S.pol, design, R: S.R, edge: S.edge, passBelow: S.passBelow });
}
/* the index a printed skin of the lens's plastic has at a density (core/rf.js mixEps) */
const cwPrintedN = (M, fill) => Math.sqrt(mixEps(M, fill / 100).eps);

/* open the workspace: from a face ({ el, holder (the surface or part whose .coat it is), label, onUse(coat) }) or alone */
export function openCoatDesign(from) {
  from = from || null;
  const el = from && from.el, holder = from && from.holder, coat = holder && holder.coat;
  const rf = !!(el && el.mmw), nm0 = benchNms()[0] || 550;
  // the substrate: the face's own glass (a lens face's, on the glass side; a window's or cube's material), the RF plastic, or BK7
  let subKind = 'glass', subGlass = 'N-BK7', subRf = 'PLA', subN = 1.5168;
  if (el && el.type === 'lens' && el.surfaces && holder) {
    const i = el.surfaces.indexOf(holder), m = (el.materials[i] && el.materials[i].glass !== 'AIR' ? el.materials[i] : el.materials[i - 1]) || { glass: 'N-BK7' };
    if (rf && RF_MAT[m.glass]) { subKind = 'rf'; subRf = m.glass; } else if (glassKey(m.glass)) subGlass = m.glass; else { subKind = 'n'; subN = refIndex(m, nm0); }
  } else if (el && el.material) { const m = el.material; if (rf && RF_MAT[m.glass]) { subKind = 'rf'; subRf = m.glass; } else if (glassKey(m.glass)) subGlass = m.glass; else { subKind = 'n'; subN = refIndex(m, nm0); } }
  // an RF face's frequency: the opener's (the RF designer's design frequency), the disc's own, or the bench's longest wave
  const ghz = rf ? ((from && +from.ghz) || (el.grin && el.grin.ghz) || (() => { const nm = benchNms().find(v => v > 1e5); return nm ? +(C_NM_GHZ / nm).toPrecision(4) : 24; })()) : 24;
  const design = coat && coat.mode === 'stack' && coat.design ? coat.design : rf ? C_NM_GHZ / ghz : nm0 < 1e4 ? nm0 : 550;
  const S = { target: rf ? 'rf' : 'ar', subKind, subGlass, subRf, subN, n0: 1, design, lo: Math.max(100, Math.round(design * 0.82)), hi: Math.round(design * 1.18), theta: 0, pol: 'avg', R: 50, edge: design, passBelow: true,
    ghz, bandPct: from && from.bandPct > 0 ? +from.bandPct : 10, fill: 50 };
  if (!rf && !(coat && coat.mode === 'stack' && coat.design)) { S.lo = 450; S.hi = 650; S.design = 550; S.edge = 550; }
  const spec = cwSpec(S);
  let layers = coat && coat.mode === 'stack' && coat.layers && coat.layers.length ? coat.layers.map(L => ({ n: +L.n, d: +L.d })) : null;
  if (!layers) layers = rf ? [{ n: Math.sqrt(spec.ns), d: qwot(Math.sqrt(spec.ns), spec.design) }] : coatPreset('mgf2', spec.design);
  CW = { S, layers, from, sel: -1 };
  const sec = cwShell();
  sec.hidden = false;
  document.body.classList.add('rt-lens-open');
  cwRender();
  sec.focus();
  return true;
}
export function closeCoatDesign() {
  if (!CW) return;
  CW = null;
  document.getElementById('coatWs').hidden = true;
  document.body.classList.remove('rt-lens-open');
}
function cwShell() {
  let sec = document.getElementById('coatWs');
  if (sec) return sec;
  sec = h('section', { class: 'rt-lens rt-rfws rt-coatws', id: 'coatWs', hidden: '', tabindex: '-1', 'aria-label': 'Coating design' });
  sec.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); closeCoatDesign(); } });
  document.body.append(sec);
  return sec;
}
const cwFmt = (v, p) => fmtWs(v, p || 4, 1e-12);
const cwPct = v => (isFinite(v) ? (100 * v < 0.01 && v > 0 ? '< 0.01' : (100 * v).toPrecision(3)) + ' %' : '—');
function cwNum(value, set, label, p) {
  const i = h('input', { type: 'text', inputmode: 'decimal', value: cwFmt(value, p || 6), class: 'rt-lnum', 'aria-label': label, spellcheck: 'false' });
  const go = () => { const v = +i.value; if (isFinite(v)) set(v); else cwRender(); };
  i.addEventListener('change', go);
  i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  return i;
}
function cwSelect(options, value, set, label) {
  const s = h('select', { 'aria-label': label }, ...options.map(([v, t]) => h('option', { value: v, selected: String(v) === String(value) ? '' : null }, t)));
  s.addEventListener('change', () => set(s.value));
  return s;
}
const cwRow = (label, ...kids) => h('label', { class: 'rt-lrow' }, h('span', null, label), ...kids);
const cwEdit = fn => { fn(); cwRender(); };

function cwRender() {
  if (!CW) return;
  const sec = document.getElementById('coatWs'), { S, layers, from } = CW, spec = cwSpec(S), rf = S.target === 'rf', sum = coatSummary(layers, spec);
  const scroll = sec.querySelector('.rt-lbody') ? sec.querySelector('.rt-lbody').scrollTop : 0;
  sec.replaceChildren();
  const where = from ? (from.label || (from.el ? from.el.name : 'a face')) : 'A coating on its own';
  sec.append(h('header', { class: 'rt-lhead' },
    h('span', { class: 'rt-hmark' }, 'JEKray'),
    h('nav', { class: 'rt-lcrumb', 'aria-label': 'Where you are' }, h('span', { class: 'from' }, 'Bench'), h('span', { 'aria-hidden': 'true' }, '›'), h('span', null, where), h('span', { class: 'rt-lpill' }, 'Coating design')),
    h('span', { class: 'rt-lgap' }),
    h('button', { class: 'rt-btn quiet', type: 'button', title: 'Keep this stack by name in this browser: every face’s Coating list offers it', onclick: () => {
      const name = (prompt('Name the coating, to find it in every face’s Coating list', COAT_TARGETS[S.target] + ', ' + layers.length + ' layer' + (layers.length === 1 ? '' : 's')) || '').trim();
      if (!name) return;
      cwKeep(name, coatToStack(layers, spec, name), spec);
      toast('Kept “' + name + '”: choose it from any face’s Coating list');
    } }, 'Keep as a coating…'),
    from ? h('button', { class: 'rt-btn primary', type: 'button', id: 'coatUse', title: 'Write this stack to the face it came from, and go back', onclick: () => {
      const c = normCoat(coatToStack(layers, spec));
      checkpoint();
      if (from.onUse) from.onUse(c); else if (from.holder) { from.holder.coat = c; changed(true); }
      closeCoatDesign();
      toast('The coating is on ' + where);
    } }, 'Use this coating') : null,
    h('button', { class: from ? 'rt-btn' : 'rt-btn primary', type: 'button', id: 'coatLeave', title: 'Back to the bench (Esc)', onclick: closeCoatDesign }, 'Back to the bench')));
  const body = h('div', { class: 'rt-lbody' });
  body.append(cwSettings(S, spec), h('div', { class: 'rt-lmain' }, cwFigures(sum, spec), cwPlots(layers, spec), cwLayers(layers, spec)));
  sec.append(body);
  body.scrollTop = scroll;
}
function cwSettings(S, spec) {
  const rf = S.target === 'rf';
  const card = h('section', { class: 'rt-lcard rt-lcond rt-rfcond', 'aria-label': 'The coating' }, h('h2', null, 'The coating'));
  card.append(h('p', { class: 'rt-lsub' }, 'What the stack is for, what it sits on and the light it is judged in. The thicknesses are then found from where they stand.'));
  const rows = [cwRow('For', cwSelect(Object.entries(COAT_TARGETS), S.target, v => cwEdit(() => {
    S.target = v;
    if (v === 'rf' && S.subKind !== 'rf') { S.subKind = 'rf'; }
    if (v !== 'rf' && S.subKind === 'rf') { S.subKind = 'glass'; }
  }), 'What the coating is for'))];
  // the substrate
  const subOpts = rf ? Object.entries(RF_MAT).map(([k, v]) => ['rf:' + k, v.name + ', n = ' + v.n]) : CW_GLASSES.map(g => ['g:' + g, g]);
  subOpts.push(['n', 'An index of my own']);
  const subVal = S.subKind === 'n' ? 'n' : S.subKind === 'rf' ? 'rf:' + S.subRf : 'g:' + S.subGlass;
  rows.push(cwRow('On', cwSelect(subOpts, subOpts.some(o => o[0] === subVal) ? subVal : subOpts[0][0], v => cwEdit(() => { if (v === 'n') { S.subKind = 'n'; S.subN = cwSubIndex(S); } else if (v.startsWith('rf:')) { S.subKind = 'rf'; S.subRf = v.slice(3); } else { S.subKind = 'glass'; S.subGlass = v.slice(2); } }), 'The substrate')));
  if (S.subKind === 'n') rows.push(cwRow('Its index', cwNum(S.subN, v => cwEdit(() => { S.subN = Math.max(1, v); }), 'Substrate index')));
  else rows.push(cwRow('Its index', h('span', { class: 'mono' }, cwFmt(spec.ns, 5) + (rf ? '' : ' at ' + cwFmt(spec.design, 5) + ' nm'))));
  rows.push(cwRow('Light comes from', cwNum(S.n0, v => cwEdit(() => { S.n0 = Math.max(1, v); }), 'Index of the medium the light comes from'), h('span', { class: 'rt-lsub' }, 'n (1 for air)')));
  if (rf) {
    rows.push(cwRow('Frequency (GHz)', cwNum(S.ghz, v => cwEdit(() => { S.ghz = Math.max(0.1, v); }), 'Design frequency (GHz)')),
      cwRow('Band (± %)', cwNum(S.bandPct, v => cwEdit(() => { S.bandPct = Math.max(0, v); }), 'Band either side of the frequency (%)')));
  } else {
    rows.push(cwRow('Band (nm)', cwNum(S.lo, v => cwEdit(() => { S.lo = Math.max(100, v); S.hi = Math.max(S.lo, S.hi); }), 'Band from (nm)'), h('span', null, 'to'), cwNum(S.hi, v => cwEdit(() => { S.hi = Math.max(S.lo, v); }), 'Band to (nm)')),
      cwRow('Design wavelength (nm)', cwNum(S.design, v => cwEdit(() => { S.design = Math.max(100, v); }), 'Design wavelength (nm)')));
  }
  rows.push(cwRow('Angles up to (°)', cwNum(S.theta, v => cwEdit(() => { S.theta = Math.min(89, Math.max(0, v)); }), 'Largest angle of incidence (degrees)')),
    cwRow('Polarisation', cwSelect([['avg', 's and p, the mean'], ['s', 's'], ['p', 'p']], S.pol, v => cwEdit(() => { S.pol = v; }), 'Polarisation judged')));
  if (S.target === 'split') rows.push(cwRow('Reflects (%)', cwNum(S.R, v => cwEdit(() => { S.R = Math.min(100, Math.max(0, v)); }), 'Reflectance wanted (%)')));
  if (S.target === 'edge') rows.push(cwRow('Turns at (nm)', cwNum(S.edge, v => cwEdit(() => { S.edge = Math.max(100, v); }), 'Edge wavelength (nm)')),
    cwRow('Passes', cwSelect([['below', 'shorter wavelengths, reflects longer'], ['above', 'longer wavelengths, reflects shorter']], S.passBelow ? 'below' : 'above', v => cwEdit(() => { S.passBelow = v === 'below'; }), 'Which side passes')));
  card.append(h('div', { class: 'rt-rfgrid' }, ...rows));
  card.append(helpLine(rf ? 'A matching layer: a quarter wave of index √n of the plastic passes everything at its frequency; printed as a less dense skin of the same plastic.'
    : 'Judged over the band and the angles, each wavelength and angle alike.', [rf ? 'The layer’s index is made by printing the lens’s own plastic less dense (core/rf.js: the mixing rule). A single layer with the label Matching layer is what the quote and the manufacturable check look for; a stack of more is traced as given, and made to order on request.'
      : 'The merit is the mean square of the reflectance against its target over the band and the angles up to the largest, for the polarisation chosen; an edge’s own wavelength ± 2% is left out, as no stack turns in no width. The stack is traced with the one thin-film model the bench, the lens designer and the RF designer share, so what is designed here is what is traced.'], 'rt-lsub'));
  return card;
}
function cwFigures(sum, spec) {
  const r = (a, b, t) => h('div', { title: t || '' }, h('span', null, a), h('b', { class: 'mono' }, b));
  return h('div', { class: 'rt-lfig' },
    r('Reflects, over the band', cwPct(sum.mean) + ' mean, ' + cwPct(sum.worst) + ' worst', 'Square on, across the band'),
    ...(spec.theta > 0 ? [r('At ' + cwFmt(spec.theta, 3) + '°', cwPct(sum.meanAt) + ' mean, ' + cwPct(sum.worstAt) + ' worst')] : []),
    r('At ' + (spec.target === 'rf' ? cwFmt(C_NM_GHZ / spec.design, 4) + ' GHz' : cwFmt(spec.design, 5) + ' nm'), cwPct(sum.design)),
    r('Bare face', cwPct(sum.bare), 'What the face would reflect square on with no coating'),
    r('Merit', cwFmt(sum.merit, 3), 'The mean square of the reflectance against its target over the band and the angles'));
}
function cwPlots(layers, spec) {
  const card = h('section', { class: 'rt-lcard' }, h('h2', null, 'Reflectance'));
  const rf = spec.target === 'rf', xs = c => c.nms.map(v => (rf ? C_NM_GHZ / v : v));
  const c0 = coatCurve(layers, spec, 0), series = [{ label: 'square on', colour: '#1f77b4', xs: xs(c0), ys: c0.R.map(v => 100 * v) }];
  if (spec.theta > 0) { const ct = coatCurve(layers, spec, spec.theta); series.push({ label: 'at ' + cwFmt(spec.theta, 3) + '°', colour: '#e0a030', xs: xs(ct), ys: ct.R.map(v => 100 * v) }); }
  series.push({ label: 'target', colour: '#999', dash: true, xs: xs(c0), ys: c0.nms.map(nm => 100 * (spec.target === 'edge' ? ((nm < spec.edge) === spec.passBelow ? 0 : 1) : spec.target === 'hr' ? 1 : spec.target === 'split' ? spec.R / 100 : 0)) });
  const wrap = h('div', { class: 'rt-lpair' }), a = h('div'), b = h('div'); wrap.append(a, b); card.append(wrap);
  const top = Math.min(100, Math.max(0.5, 1.15 * Math.max(...series.flatMap(s => s.ys))));
  linePlot(a, { label: 'Reflectance across the band', x: { kind: 'plain', title: rf ? 'GHz' : 'nm' }, y: { kind: 'plain', title: 'R, %' }, yr: [0, top], series, xName: rf ? 'GHz' : 'nm', H: 240 });
  const A = coatAngles(layers, spec);
  linePlot(b, { label: 'Reflectance against the angle', x: { kind: 'plain', title: 'angle, °' }, y: { kind: 'plain', title: 'R, %' }, xr: [0, 89], yr: [0, 100], xName: 'angle',
    series: [{ label: 's', colour: '#1f77b4', xs: A.degs, ys: A.s.map(v => 100 * v) }, { label: 'p', colour: '#e0a030', xs: A.degs, ys: A.p.map(v => 100 * v) }], H: 240 });
  return card;
}
function cwLayers(layers, spec) {
  const { S } = CW, rf = S.target === 'rf', M = rf && RF_MAT[S.subRf];
  const card = h('section', { class: 'rt-lcard rt-coatlayers', 'aria-label': 'The layers' }, h('h2', null, 'The layers'), h('p', { class: 'rt-lsub' }, 'From the outside in, each layer’s index and thickness' + (rf ? ' (a printed skin: its density gives its index)' : ' (optical thickness in quarter waves at the design wavelength beside it)') + '.'));
  const tbl = h('table', { class: 'rt-ltable', style: 'min-width:0' }), tb = h('tbody');
  tbl.append(h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, rf ? 'Density (%)' : 'Material'), h('th', null, 'n'), h('th', null, rf ? 'Thickness (mm)' : 'Thickness (nm)'), h('th', null, 'λ/4 at design'), h('th', null, ''))));
  layers.forEach((L, k) => {
    const qw = qwot(L.n, spec.design);
    let matCell;
    if (rf) {
      const fill = M ? 100 * Math.min(1, Math.max(0, (Math.pow(L.n * L.n, 1) - 1) / (M.n * M.n - 1))) : 0;    // the density for this index, by volume
      matCell = cwNum(fill, v => cwEdit(() => { L.n = M ? cwPrintedN(M, Math.min(100, Math.max(5, v))) : L.n; }), 'Layer ' + (k + 1) + ' density (%)', 4);
    } else {
      const opts = COAT_MATERIALS.map(([v, t]) => [String(+v), t]);
      if (!opts.some(o => Math.abs(+o[0] - L.n) < 1e-9)) opts.push([String(+L.n), 'n = ' + cwFmt(L.n, 4)]);
      opts.push(['custom', 'An index of my own…']);
      matCell = cwSelect(opts, String(+L.n), v => cwEdit(() => { if (v === 'custom') { const n = +prompt('The layer’s index', String(L.n)); if (isFinite(n) && n >= 1) L.n = n; } else L.n = +v; }), 'Layer ' + (k + 1) + ' material');
    }
    tb.append(h('tr', null, h('td', { class: 'mono' }, String(k + 1)), h('td', null, matCell), h('td', { class: 'mono' }, cwFmt(L.n, 4)),
      h('td', null, cwNum(rf ? L.d * 1e-6 : L.d, v => cwEdit(() => { L.d = Math.max(0.01, rf ? v * 1e6 : v); }), 'Layer ' + (k + 1) + ' thickness', 5)),
      h('td', { class: 'mono' }, cwFmt(L.d / qw, 3)),
      h('td', null, h('button', { class: 'rt-link', type: 'button', onclick: () => cwEdit(() => { L.d = qw; }) }, 'λ/4'), ' ',
        h('button', { class: 'rt-link', type: 'button', onclick: () => cwEdit(() => { layers.splice(k, 1); }) }, 'Remove'))));
  });
  tbl.append(tb);
  card.append(h('div', { class: 'rt-ltwrap' }, tbl));
  const pre = cwSelect([['', 'A preset…'], ['mgf2', 'MgF2 single layer'], ['vcoat', 'Two-layer V-coat'], ['bb3', 'Three-layer broadband AR'], ['bs5050', 'Three-layer 50:50 splitter'], ['hr', 'HR stack, 6 pairs'], ['match', 'RF matching layer, √n']], '', v => {
    if (!v) return;
    cwEdit(() => {
      const d = spec.design;
      CW.layers = v === 'bb3' ? [{ n: 1.38, d: qwot(1.38, d) }, { n: 2.10, d: qwot(2.10, d) / 2 }, { n: 1.63, d: qwot(1.63, d) }]
        : v === 'match' ? [{ n: Math.sqrt(spec.ns), d: qwot(Math.sqrt(spec.ns), d) }] : coatPreset(v, d);
    });
  }, 'A preset stack');
  card.append(h('div', { class: 'rt-rfacts' },
    h('button', { class: 'rt-btn primary', type: 'button', id: 'coatOpt', title: 'Nelder–Mead on the thicknesses, from where they stand, against the target over the band and the angles', onclick: () => {
      const o = coatOptimise(layers, spec);
      CW.layers = o.layers;
      toast('Merit ' + cwFmt(o.before, 3) + ' to ' + cwFmt(o.after, 3) + ' in ' + o.evals + ' tries');
      cwRender();
    } }, 'Optimise thicknesses'),
    h('button', { class: 'rt-btn', type: 'button', onclick: () => cwEdit(() => { layers.push(rf ? { n: Math.sqrt(spec.ns), d: qwot(Math.sqrt(spec.ns), spec.design) } : { n: 1.38, d: qwot(1.38, spec.design) }); }) }, 'Add a layer'),
    h('button', { class: 'rt-btn', type: 'button', onclick: () => cwEdit(() => { for (const L of layers) L.d = qwot(L.n, spec.design); }) }, 'All quarter waves'),
    pre));
  return card;
}
/* the page's wiring (from boot.js): a face's Coating setting and the lens designer's face table reach the workspace through the hooks */
export function wireCoatDesign() { hooks.openCoatDesign = openCoatDesign; hooks.keptCoatings = keptCoatings; }
