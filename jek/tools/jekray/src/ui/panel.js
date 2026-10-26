import { BEAM_Z, TEST_MODE } from '../core/constants.js';
import { asmOf, asmOfSelection } from '../core/assembly.js';
import { assemblyPanel, designOneRow } from './assembly.js';
import { fmtHz, fmtLen, fmtNum } from '../core/format.js';
import { syncLine } from '../core/pulses.js';
import { V, extraSel, project, selectOne, typeLabel } from '../state/project.js';
import { getEl, selected } from '../state/elements.js';
import { tippable } from '../engines/trace.js';
import { H, requestRender, selFibre, selection, setSelFibreId, sy } from './render.js';
import { drawBarShown } from './drawings.js';
import { SWEEP_STEPS_MAX, getPath, setParam } from '../state/params.js';
import {
  FIELD_FRAMES, WAVES, advOpen, fieldPossible, isPlaying, pause, play, setFieldRendered, swPool,
  swRelease, sweepDefault, sweepEta, sweepFrac, sweepJob, sweepKey, sweepValue
} from './sweeps.js';
import { V3D } from './view3d.js';
import { ELEC_UI } from './elec.js';
import { PIC_UI } from './pic.js';
import { PART_UI } from './parts/registry.js';
import { updateReadouts } from './readouts.js';
import { fibreLinkPanel, groupPanel, rfHornPanel } from './panels.js';
import { assumedBox } from './plots.js';
import { renderOverview, setBenchTab } from './panel-cavity.js';
import { cavitiesOf } from '../engines/cavity.js';
import { changed, duplicate, removeEl } from './actions.js';
import { checkpoint, selectEl, switchTab } from './tabs.js';
import { modPanel } from '../io/mods.js';

/* ==========================================================================
   Properties panel
   ========================================================================== */

export const mainPanel = document.getElementById('panel');
export let panel = mainPanel;  // where the panel builders write: the main panel, or a pinned one
let refs = [];          // { node, sync() }, refreshed while dragging or animating
/* Tabs and plot choices belong to each element, so two pinned screens can show different plots */
export const viewState = new Map();
export function vs(el) {
  if (!viewState.has(el.id)) viewState.set(el.id, { screenTab: 'params', rayView: 'power', diffView: 'map' });
  return viewState.get(el.id);
}
/* Panels kept open while other elements are selected: element ids, newest first */
export let pins = [];
export function setPins(v) { return (pins = v); }
export const pinBoxes = new Map();
let editing = false;
export let fid = 0;
export function setFid(v) { return (fid = v); }

export function beginEdit() { if (!editing) { checkpoint(); editing = true; } }
export function endEdit() { editing = false; }

/* A Stop button for a run that redraws as it goes: it acts as the pointer goes down, not on the click that follows
   (the redraw may have replaced the button by the time the pointer comes up, and a click needs both on the same
   element); a key press (Enter, Space) still clicks it. The click that follows a press it acted on is ignored, so a
   button redrawn as Start under the pointer is not pressed too. */
let pressedAt = 0;
export function stopButton(label, fn, attrs) {
  const act = () => { pressedAt = performance.now(); fn(); };
  const b = h('button', Object.assign({ type: 'button', class: 'rt-btn primary' }, attrs || {}), label);
  b.addEventListener('pointerdown', e => { if (e.button === 0) { e.preventDefault(); act(); } });
  b.addEventListener('click', () => { if (performance.now() - pressedAt > 600) act(); });
  return b;
}
/* true for a click that comes just after a Stop button's press: the pointer coming up over what replaced it */
export const justStopped = () => performance.now() - pressedAt < 600;
/* a redraw at most every ms milliseconds while a run goes on (the last one always made) */
export function throttle(fn, ms = 200) {
  let last = 0, timer = 0;
  return () => {
    const now = performance.now();
    if (now - last >= ms) { last = now; clearTimeout(timer); timer = 0; fn(); }
    else if (!timer) timer = setTimeout(() => { timer = 0; last = performance.now(); fn(); }, ms - (now - last));
  };
}
export function h(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids) if (k !== null && k !== undefined) n.append(k);
  return n;
}
/* A line of help: a short line, with its fuller explanation folded behind an ⓘ that opens it in place (kept in the
   page, so a screen reader and the page's search still find it). cls: the paragraph's class (rt-lsub by default); style, its own. */
export function helpLine(short, long, cls, style) {
  const more = h('span', { class: 'rt-helpmore', hidden: '' }, ' ', ...(Array.isArray(long) ? long : [long]));
  const btn = h('button', { type: 'button', class: 'rt-helpbtn', 'aria-expanded': 'false', 'aria-label': 'More about this', title: 'More about this',
    onclick: () => { const open = more.hidden; more.hidden = !open; btn.setAttribute('aria-expanded', String(open)); } }, '\u24d8');
  return h('p', { class: cls || 'rt-lsub', ...(style ? { style } : {}) }, ...(Array.isArray(short) ? short : [short]), ' ', btn, more);
}
/* a setting whose list has a long choice: its label on a line of its own and the list across the panel, so the choice
   shown is never cut short */
export function stackLongSelects(root) {
  for (const sel of root.querySelectorAll('.rt-rows > .rt-f > select, .rt-rows > .rt-f > .rt-lab ~ select')) {
    const long = [...sel.options].some(o => o.textContent.length > 17);
    sel.parentElement.classList.toggle('rt-fstack', long);
  }
}
export function bindSync(node, sync) { refs.push({ node, sync }); sync(); }

/* A plain number input. `onValue` receives a number (or `blank` when emptied). */
export function numInput(id, get, onValue, opts = {}) {
  const inp = h('input', { id, type: 'text', inputmode: 'decimal', spellcheck: 'false', placeholder: opts.placeholder });
  const show = opts.fmt || fmtNum;
  // taken only once typed (Enter, or leaving the field): for a value that rebuilds the part, so
  // its first digit alone (the 1 of 12 branches) does not take effect on the way
  if (opts.commit) {
    inp.addEventListener('change', () => { const v = Number(inp.value.trim()); if (inp.value.trim() !== '' && isFinite(v)) { checkpoint(); onValue(v); changed(true); } inp.value = show(get()); });
    bindSync(inp, () => { inp.value = show(get()); });
    return inp;
  }
  inp.addEventListener('input', () => {
    const raw = inp.value.trim();
    let v;
    if (raw === '') { if (opts.blank === undefined) return; v = opts.blank; }
    else { v = Number(raw); if (!isFinite(v)) return; }
    beginEdit(); onValue(v); changed(false);
  });
  inp.addEventListener('change', () => { endEdit(); inp.value = show(get()); });
  inp.addEventListener('blur', endEdit);
  bindSync(inp, () => { inp.value = show(get()); });
  return inp;
}

/* An element parameter with its optional sweep controls */
/* A number's input, its sweep button (∿) and, when it is swept, its sweep: folded to one line,
   or open to edit (one sweep open at a time) */
const sweepOpen = new Set();
function paramBits(label, el, path, opts, id) {
  const sweeps = el.sweeps || (el.sweeps = {});
  const sw = sweeps[path], key = sweepKey(el, path), open = !!sw && sweepOpen.has(key);
  const inp = numInput(id, () => getPath(el, path), v => { pause(el, path); setParam(el, path, v); }, opts);
  const name = label.replace(/\s*\(.*\)$/, '');
  const tip = sw ? (open ? 'Fold the sweep of ' : 'Edit the sweep of ') + name : 'Sweep ' + name + ' over a range';
  const toggle = opts.noSweep ? null : h('button', {
    class: 'rt-sweep-toggle' + (sw ? ' on' : ''), type: 'button', 'aria-pressed': sw ? 'true' : 'false',
    'aria-expanded': sw ? String(open) : undefined, title: tip, 'aria-label': tip,
    onclick: () => {
      if (sweeps[path]) { sweepOpen.clear(); if (!open) sweepOpen.add(key); renderPanel(); return; }
      checkpoint();
      sweeps[path] = sweepDefault(path, getPath(el, path));
      sweepOpen.clear(); sweepOpen.add(key);
      changed(true);
    },
  }, '\u223f');
  const box = !sw ? null : open ? sweepControls(el, path, sw, label) : sweepSummary(el, path, sw, label, opts.prefix);
  return { inp, toggle, box, sw };
}
export function param(label, el, path, opts = {}) {
  const id = 'rtf' + (++fid);
  const P = paramBits(label, el, path, opts, id);
  const wrap = h('div', { class: 'rt-f' + (P.sw ? ' swept' : '') },
    h('div', { class: 'rt-lab' }, h('label', { for: id }, label), P.toggle), P.inp);
  if (P.box) wrap.append(P.box);
  return wrap;
}
/* two numbers on one row, as X and Y, or Tip and Roll: each its own input and sweep */
function paramPair(label, el, items, opts = {}) {
  const cells = h('div', { class: 'rt-pairbox' }), boxes = [];
  for (const [path, sub] of items) {
    const id = 'rtf' + (++fid);
    const P = paramBits(sub, el, path, Object.assign({ prefix: sub.replace(/\s*\(.*\)$/, '') }, opts), id);
    cells.append(h('label', { for: id, class: 'rt-sr' }, sub), P.inp, P.toggle || h('span'));
    if (P.box) boxes.push(P.box);
  }
  return h('div', { class: 'rt-f rt-pair' + (boxes.length ? ' swept' : '') }, h('span', { class: 'rt-plab' }, label), cells, ...boxes);
}
/* a sweep's play button */
export function sweepPlay(el, path, label) {
  const btn = h('button', { class: 'rt-play', type: 'button' });
  const rendering = () => !!sweepJob && sweepJob.list.some(([e, p]) => e === el && p === path);
  btn.addEventListener('click', () => rendering() ? sweepJob.cancel() : isPlaying(el, path) ? pause(el, path) : play(el, path));
  bindSync(btn, () => {
    const on = isPlaying(el, path);
    btn.textContent = rendering() ? 'Cancel' : on ? 'Pause' : 'Play';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', (on ? 'Pause ' : 'Play ') + label + ' sweep');
  });
  return btn;
}
/* a sweep folded to one line: its range, waveform and rate, with play; click to edit */
function sweepSummary(el, path, sw, label, prefix) {
  const key = sweepKey(el, path);
  const txt = h('button', { class: 'rt-sweep-line', type: 'button', title: 'Edit this sweep',
    onclick: () => { sweepOpen.clear(); sweepOpen.add(key); renderPanel(); } });
  bindSync(txt, () => {
    txt.textContent = (prefix ? prefix + ': ' : '') + fmtNum(sw.min) + ' \u2192 ' + fmtNum(sw.max) + ' \u00b7 ' +
      (WAVES[sw.wave] || '').replace(/ \(.*\)$/, '').toLowerCase() + ' \u00b7 ' + (+(+sw.freq).toPrecision(3)) + ' Hz';
  });
  return h('div', { class: 'rt-sweep-sum' }, sweepPlay(el, path, label), txt);
}

function sweepControls(el, path, sw, label) {
  const box = h('div', { class: 'rt-sweep' });
  const small = (text, key, check) => {
    const id = 'rtf' + (++fid);
    const inp = numInput(id, () => sw[key], v => { if (check && !check(v)) return; sw[key] = v; });
    return h('div', { class: 'rt-f' }, h('label', { for: id }, text), inp);
  };
  const range = h('div', { class: 'rt-sweep-range' }, small('From', 'min'), small('To', 'max'));
  box.append(range);

  const btn = sweepPlay(el, path, label);
  const rendering = () => !!sweepJob && sweepJob.list.some(([e, p]) => e === el && p === path);
  const slider = h('input', { type: 'range', min: '0', max: '1000', step: '1', 'aria-label': label + ' within the sweep range' });
  slider.addEventListener('input', () => {
    if (isPlaying(el, path)) pause(el, path);
    beginEdit();
    setParam(el, path, sweepValue(sw, slider.value / 1000));
    changed(false);
  });
  slider.addEventListener('change', endEdit);
  bindSync(slider, () => { slider.value = String(Math.round(sweepFrac(el, path) * 1000)); });
  box.append(h('div', { class: 'rt-sweep-play' }, btn, slider));

  // steps a cycle: blank plays smoothly (or renders the usual number), a number steps through
  // that many positions, the same ones the whole sweep is rendered at
  {
    const id = 'rtf' + (++fid);
    const inp = numInput(id, () => sw.steps || null, v => {
      if (v === null) delete sw.steps; else if (v >= 2) sw.steps = Math.round(Math.min(v, SWEEP_STEPS_MAX)); else return;
      setFieldRendered(null);
    }, { blank: null });
    bindSync(inp, () => { inp.placeholder = sw.field ? String(FIELD_FRAMES) : 'smooth'; });
    range.append(h('div', { class: 'rt-f', title: 'Blank plays smoothly; a number steps through that many positions a cycle' }, h('label', { for: id }, 'Steps'), inp));
  }
  // the diffracted field, rendered ahead so the sweep can play it: offered where there is one
  if (fieldPossible() || sw.field) {
    const fc = h('input', { type: 'checkbox' });
    fc.checked = !!sw.field;
    fc.addEventListener('change', () => { checkpoint(); if (fc.checked) sw.field = true; else delete sw.field; setFieldRendered(null); changed(false); });
    const status = h('p', { class: 'rt-hint', style: 'margin:0.2rem 0 0' });
    bindSync(status, () => {
      status.textContent = rendering() ? 'Rendering the field: ' + (sweepJob.i + 1) + ' of ' + sweepJob.n + (sweepEta(sweepJob) ? ', ' + sweepEta(sweepJob) : '') + '\u2026'
        : sw.field ? 'Play renders the field at ' + (sw.steps || FIELD_FRAMES) + ' points of the cycle, on the bench and on every screen it reaches, then plays through them.'
        : '';
      status.hidden = !status.textContent;
    });
    box.append(h('label', { class: 'rt-check', title: 'Unticked, the sweep plays quickly: the diffracted field is held (the beams show as outlines, screens keep their last field) and worked out again when it stops.' }, fc, 'Render the diffracted field (slow)'), status);
    // the render workers warmed up while the sweep is in view, so Play does not wait for them to start
    if (sw.field && swPool()) swRelease();
  }

  const key = sweepKey(el, path);
  const adv = h('details', { class: 'rt-adv' });
  adv.open = advOpen.has(key);
  adv.addEventListener('toggle', () => adv.open ? advOpen.add(key) : advOpen.delete(key));
  const waveId = 'rtf' + (++fid);
  const wave = h('select', { id: waveId });
  for (const [v, t] of Object.entries(WAVES)) wave.append(h('option', { value: v }, t));
  wave.value = sw.wave;
  wave.addEventListener('change', () => { checkpoint(); sw.wave = wave.value; changed(false); });
  const period = h('span', { class: 'rt-hint' });
  bindSync(period, () => { period.textContent = 'One cycle every ' + (+(1 / sw.freq).toPrecision(3)) + ' s.'; });
  adv.append(h('summary', null, 'Advanced'),
    h('div', { class: 'rt-sweep-range' },
      small('Frequency (Hz)', 'freq', v => v > 0 && v <= 50),
      small('Phase (°)', 'phase'),
      h('div', { class: 'rt-f' }, h('label', { for: waveId }, 'Waveform'), wave)),
    period);
  box.append(h('div', { class: 'rt-sweep-foot' }, adv, h('button', { class: 'rt-link', type: 'button',
    onclick: () => { checkpoint(); pause(el, path); delete el.sweeps[path]; sweepOpen.delete(key); changed(true); } }, 'Remove sweep')));
  return box;
}

export function textField(label, get, set, opts = {}) {
  const id = 'rtf' + (++fid);
  const inp = h('input', { id, type: 'text', spellcheck: 'false', placeholder: opts.placeholder });
  inp.addEventListener('input', () => { beginEdit(); set(inp.value); changed(false); });
  inp.addEventListener('change', endEdit);
  inp.addEventListener('blur', endEdit);
  bindSync(inp, () => { inp.value = get(); });
  return h('div', { class: 'rt-f' + (opts.wide ? ' wide' : '') }, h('label', { for: id }, label), inp);
}
/* a laser's coherence: the choice of three, and the fields that go with it */
export function coherenceFields(el, rows) {
  if (!el.led) rows.append(selectField('Spectrum', [['single', 'Single frequency'], ['line', 'A line (coherence length)'], ['broad', 'Incoherent, broadband']], () => el.cmode, v => {
    const V = vs(el);
    if (el.cmode === 'line') V.lineCoh = el.coh;
    if (v === 'line' && el.cmode !== 'line') el.coh = V.lineCoh > 0 ? V.lineCoh : 300;
    el.cmode = v; syncLine(el);
  }, { wide: true }));
  if (el.cmode === 'line') rows.append(param('Coherence length (mm)', el, 'coh'),
    selectField('Line shape', [['lorentz', 'Lorentzian (a laser\u2019s own line)'], ['gauss', 'Gaussian (Doppler, many modes)']], () => el.lineshape, v => { el.lineshape = v; }, { wide: true }));
  if (el.cmode === 'broad') rows.append(param('Bandwidth (nm)', el, 'bw'));
}
export function coherenceNote(el) {
  if (el.cmode === 'single' || !(el.coh > 0)) return 'A single frequency: every path of this source interferes in full, however long. Separate sources never interfere.';
  const dnu = 299792458e3 / el.coh, dl = el.wavelength * el.wavelength * 1e-6 / el.coh;
  if (el.cmode === 'broad') return 'Broadband: ' + (+dl.toPrecision(3)) + ' nm wide (FWHM, Gaussian), a coherence length of ' + fmtLen(el.coh) + ', ' +
    (+(el.coh / (el.wavelength * 1e-6)).toPrecision(2)) + ' wavelengths. Its own light adds as powers, but for paths equal to within about that (white-light fringes, at a balanced interferometer), ' +
    'and a cavity passes its average over the band. In fibre its band is followed in slices, so filters, WDMs and Bragg gratings there shape it (a spectrum analyser shows it); in free space, lenses, gratings and filters see its centre wavelength. Separate sources never interfere.';
  return 'Linewidth ' + fmtHz(dnu) + ' (' + (dl >= 0.1 ? +dl.toPrecision(3) + ' nm' : +(1000 * dl).toPrecision(3) + ' pm') + ', FWHM). ' +
    'Two paths of this source a distance \u0394L apart interfere with fringe contrast ' + (el.lineshape === 'gauss' ? 'exp(\u2212(\u03c0\u0394L/Lc)\u00b2/4 ln 2)' : 'exp(\u2212\u03c0|\u0394L|/Lc)') +
    ', Lc = c/\u0394\u03bd; a cavity builds up the average of its response over the line. Separate sources never interfere.';
}
export function selectField(label, options, get, set, opts = {}) {
  const id = 'rtf' + (++fid);
  const sel = h('select', { id });
  for (const [v, t] of options) sel.append(h('option', { value: v }, t));
  sel.value = get();
  sel.addEventListener('change', () => { checkpoint(); set(sel.value); changed(opts.rebuild !== false); });
  return h('div', { class: 'rt-f' + (opts.wide ? ' wide' : '') }, h('label', { for: id }, label), sel);
}

/* a link's way across the bench (a fibre, wire or waveguide): curved, or square as in a schematic (render.js
   squarePts); changed, it starts afresh, its own corners or bends let go */
export function routeField(F) {
  return selectField('Route', [['curved', 'Curved'], ['square', 'Square (as in a schematic)']], () => F.route === 'square' ? 'square' : 'curved',
    v => { if (v === 'square') F.route = 'square'; else delete F.route; F.path = []; delete F.ta; delete F.tb; }, { wide: true });
}
export function syncPanel() {
  // skip the input the person is typing in or dragging; buttons always refresh
  for (const box of [mainPanel, ...pinBoxes.values()])
    for (const r of box._refs || []) if (document.activeElement !== r.node || r.node.tagName === 'BUTTON') r.sync();
}

const PADLOCK_SVG = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.2" fill="currentColor"/><path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const UNPADLOCK_SVG = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.2 7V5a2.8 2.8 0 0 1 5.5-.7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const PIN_SVG = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M10.2 1.6 14.4 5.8 12.6 6.4 9.9 9.1 10.3 12.1 9.1 13.3 6.3 10.5 2.6 14.2 1.8 13.4 5.5 9.7 2.7 6.9 3.9 5.7 6.9 6.1 9.6 3.4Z" fill="currentColor"/></svg>';
// the Bench panel pins as an element does, under an id no element can have
export const BENCH_PIN = '#bench';
export const pinOk = id => id === BENCH_PIN || !!getEl(id);
export function togglePin(el) { togglePinId(el.id); }
function togglePinId(id) {
  if (pins.includes(id)) pins = pins.filter(p => p !== id);
  else pins.unshift(id);                        // the newest pin sits next to the main panel
  renderPanel();
}
/* the pin button and, on a pinned panel, its title's click (to select) and drag (to reorder) */
export function pinTitle(title, id, onSelect) {
  const pinned = pins.includes(id);
  const pinBtn = h('button', { class: 'rt-pin' + (pinned ? ' on' : ''), type: 'button', 'aria-pressed': pinned ? 'true' : 'false',
    title: pinned ? 'Unpin: let this panel close when something else is selected' : 'Pin: keep this panel open while you select other things',
    onclick: () => togglePinId(id) });
  pinBtn.innerHTML = PIN_SVG;
  // and closed: a pinned panel is unpinned; the main one goes, the selection with it, until
  // something is selected again (or View › Show the side panel). On a wide screen the main one's
  // × is not shown: the tab on the bench's right edge (sideTab) closes it
  const main = panel === mainPanel;
  const closeBtn = h('button', { class: 'rt-pin rt-close' + (main ? ' rt-mainclose' : ''), type: 'button', title: main ? 'Close this panel' : 'Close: unpin this panel',
    'aria-label': main ? 'Close the panel' : 'Close this pinned panel',
    onclick: () => {
      if (!main) { togglePinId(id); return; }
      selectOne(null); setSelFibreId(null); panelClosed = true; renderPanel(); requestRender();
    } }, '\u00d7');
  // on a phone the main panel is a sheet over the bench's lower part: this makes it taller, or shorter again
  const sheetBtn = main ? h('button', { class: 'rt-pin rt-sheetbtn', type: 'button', 'aria-pressed': sheetTall ? 'true' : 'false',
    'aria-label': sheetTall ? 'Make the panel shorter' : 'Make the panel taller', title: sheetTall ? 'Shorter: more of the bench' : 'Taller: more of the panel',
    onclick: () => { sheetTall = !sheetTall; mainPanel.classList.toggle('rt-tall', sheetTall); renderPanel(); } }, sheetTall ? '\u2193' : '\u2191') : null;
  title.append(...[pinBtn, sheetBtn, closeBtn].filter(Boolean));
  if (panel !== mainPanel) {
    const box = panel;                          // the panel being built now (panel is reassigned after)
    title.addEventListener('click', e => { if (e.target.closest('.rt-pin') || title._dragged) { title._dragged = false; return; } onSelect(); });   // (the close button is an .rt-pin too)
    title.addEventListener('pointerdown', e => dragPinned(e, title, box, id));
  }
}
/* slide boxes from where they were to where they now are (they have moved in the page) */
function slideFrom(before, skip) {
  for (const [b, r0] of before) {
    if (b === skip) continue;
    const r1 = b.getBoundingClientRect(), dx = r0.left - r1.left, dy = r0.top - r1.top;
    if (!dx && !dy) continue;
    b.style.transition = 'none'; b.style.transform = `translate(${dx}px, ${dy}px)`;
    b.getBoundingClientRect();                  // take that as the start
    b.style.transition = 'transform 180ms ease'; b.style.transform = '';
  }
}
/* A pinned panel dragged by its title to another place among the pinned panels: it moves as
   the pointer passes the middle of its neighbours, and a drag of a few pixels is not a click */
function dragPinned(e, title, box, id) {
  if (e.button !== 0 || e.target.closest('.rt-pin')) return;
  e.preventDefault();                           // no text selection as it is dragged
  const x0 = e.clientX, y0 = e.clientY, vertical = window.innerWidth <= 960;
  const r0 = box.getBoundingClientRect(), gx = x0 - r0.left, gy = y0 - r0.top;
  let moving = false;
  // the dragged box follows the pointer from wherever it now sits in the row
  const follow = ev => {
    box.style.transition = 'none'; box.style.transform = '';
    const r = box.getBoundingClientRect();
    box.style.transform = vertical ? `translateY(${ev.clientY - gy - r.top}px)` : `translateX(${ev.clientX - gx - r.left}px)`;
  };
  const move = ev => {
    if (!moving) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; moving = true; box.classList.add('moving'); const ws = window.getSelection(); if (ws) ws.removeAllRanges(); }
    const others = pins.filter(p => p !== id), boxes = others.map(p => pinBoxes.get(p));
    let k = 0;
    boxes.forEach((b, n) => { const r = b.getBoundingClientRect(); if (vertical ? ev.clientY > r.top + r.height / 2 : ev.clientX > r.left + r.width / 2) k = n + 1; });
    const next = [...others.slice(0, k), id, ...others.slice(k)];
    if (next.join() !== pins.join()) {
      // move the boxes, keeping where each was scrolled to, and slide the others into place
      const sc = new Map([...pinBoxes].map(([p, b]) => [p, b.scrollTop]));
      const before = new Map(boxes.map(b => [b, b.getBoundingClientRect()]));
      pins = next;
      let after = mainPanel;
      for (const p of pins) { const b = pinBoxes.get(p); if (after.nextElementSibling !== b) after.after(b); after = b; }
      for (const [p, b] of pinBoxes) if (b.scrollTop !== sc.get(p)) b.scrollTop = sc.get(p);
      slideFrom(before, box);
    }
    follow(ev);
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    if (!moving) return;
    title._dragged = true; setTimeout(() => { title._dragged = false; }, 0);
    // and it settles into its place
    box.style.transition = 'transform 180ms ease'; box.style.transform = '';
    setTimeout(() => { box.classList.remove('moving'); box.style.transition = ''; renderPanel(); }, 190);
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}
/* The main panel shows the selection, unless that is already pinned; pinned panels follow
   it to the right, newest first */
// the main panel closed with its ×; the tool opens with it closed, the bench across the page
// (the tests open it, as their checks read it)
export let panelClosed = !TEST_MODE;
/* a phone: the panel is a sheet over the bottom of the bench (style.css), short unless made tall */
let sheetTall = false, sheetFor = null;
export const phoneSheet = () => typeof matchMedia === 'function' && matchMedia('(max-width: 760px), (max-width: 960px) and (pointer: coarse), (max-height: 520px) and (pointer: coarse)').matches;
/* something just selected on a phone: if the sheet would cover it, the view moves it up into the bench left showing */
function sheetReveal(el) {
  if (!el || !phoneSheet() || el.x === undefined) return;
  const top = H * (sheetTall ? 0.08 : 0.5), y = sy(el.y);
  if (y > top - 24) V().cy -= (y - top * 0.5) / V().scale;      // (the bench's y is up the screen)
}
export function setPanelClosed(v) { return (panelClosed = v); }
export function renderPanel() {
  pins = pins.filter(pinOk);
  for (const [id, box] of pinBoxes) if (!pins.includes(id)) { box.remove(); pinBoxes.delete(id); }
  // a pinned panel keeps its place in its own content while the selection moves around it:
  // read every scroll before anything is rebuilt or moved, since a box taken out of the
  // page, even to go straight back, comes back scrolled to the top
  const scrolls = new Map([...pinBoxes].map(([id, box]) => [id, box._hold != null ? box._hold : box.scrollTop]));
  const sel = selected();
  // A selection shows its own panel. Put down (a click on empty bench), the panel closes and
  // the bench takes the page: the Bench panel opens only from the tab on the bench's right edge (or View › Show the
  // side panel), and stays until something is selected or the tab puts it away
  const picked = !!(sel || selFibre());
  if (picked) panelClosed = true;
  const mainShows = picked ? !(sel && pins.includes(sel.id)) : !panelClosed && !pins.includes(BENCH_PIN);
  mainPanel.style.display = mainShows ? '' : 'none';
  // the columns first, so plots drawn below measure the width they will actually have
  const cols = (mainShows ? 1 : 0) + pins.length;
  mainPanel.parentElement.style.setProperty('--rt-cols', String(Math.max(1, cols)));
  mainPanel.parentElement.classList.toggle('rt-nopanel', !cols);          // the bench across the whole width
  if (mainShows) renderInto(mainPanel, sel);
  mainPanel.classList.toggle('rt-tall', sheetTall);
  // newly selected on a phone: kept clear of the sheet
  if (sel && sel.id !== sheetFor && mainShows) { sheetReveal(sel); requestRender(); }
  sheetFor = sel ? sel.id : null;
  let after = mainPanel;
  for (const id of pins) {
    let box = pinBoxes.get(id);
    if (!box) { box = h('aside', { class: 'rt-panel rt-pinned', 'aria-label': 'Pinned properties' }); pinBoxes.set(id, box); }
    if (after.nextElementSibling !== box) after.after(box);
    after = box;
    box.classList.toggle('current', sel ? sel.id === id : id === BENCH_PIN && !selFibre());
    renderInto(box, getEl(id));
    if (scrolls.has(id)) holdScroll(box, scrolls.get(id));
  }
  stackLongSelects(document);
  updateReadouts();
  try { drawBarShown(); } catch (err) { /* the bench's bars are not made yet */ }
  // the tab on the bench's right edge: pointing out (open the Bench panel) or in (put the panel away)
  const tab = document.getElementById('btnSideTab');
  if (tab) {
    const what = mainShows ? 'Hide the panel' : 'Bench settings: light, snapping, notes and the parts list';
    tab.classList.toggle('open', mainShows); tab.setAttribute('aria-pressed', mainShows && !sel && !selFibre() ? 'true' : 'false');
    tab.title = what; tab.setAttribute('aria-label', mainShows ? 'Hide the panel' : 'Bench settings');
  }
}
/* the tab on the bench's right edge: the panel, put away (whatever was selected put down, as its × does), or,
   with none shown, the Bench panel brought out */
export function sideTab() {
  const sel = selected(), shown = mainPanel.style.display !== 'none' && (!!(sel || selFibre()) || !panelClosed);
  selectOne(null); setSelFibreId(null);
  panelClosed = shown;
  renderPanel();
}
/* Put a panel back where it was scrolled to. Its content is rebuilt short and grows as
   plots and readouts fill in, some of them a while later, so the place is held until the
   content reaches it, or until the user scrolls or clicks in the panel themselves. */
export function holdScroll(box, want) {
  box.scrollTop = want;
  box._hold = want > 0 ? want : null;          // held only while there is somewhere to get back to
  if (box._hold == null || box._holding) return;
  box._holding = true;
  const release = () => { box._hold = null; };
  const evs = ['wheel', 'pointerdown', 'touchstart', 'keydown'];
  for (const ev of evs) box.addEventListener(ev, release, { passive: true });
  const t0 = performance.now();
  const step = () => {
    const want2 = box._hold;
    if (want2 == null || !box.isConnected || performance.now() - t0 > 15000 || box.scrollTop === want2 && box.scrollHeight - box.clientHeight >= want2 && performance.now() - t0 > 1500) {
      for (const ev of evs) box.removeEventListener(ev, release);
      box._holding = false; box._hold = null;
      return;
    }
    if (box.scrollTop !== want2) box.scrollTop = want2;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function renderInto(box, el) {
  const saved = panel;
  panel = box;
  refs = [];
  try { renderPanelBody(el); } finally { box._refs = refs; panel = saved; refs = []; }
}
/* a part's panel made in a box of the caller's, apart from the page's own (File › Export data reads the plots drawn in it) */
export function panelInto(box, el) { renderInto(box, el); }
/* ---------- A panel's sections ----------
   Each heading and what follows it is a section that folds away, remembered for the kind of
   part (About, the long explanations gathered at the foot, starts folded). Readouts set among a
   section's settings are gathered into a Readout section of their own. */
const SEC_KEY = 'jek-rt-sections';
const secState = (() => { try { return JSON.parse(localStorage.getItem(SEC_KEY)) || {}; } catch (err) { return {}; } })();
function secOpenOf(key, dflt) { return key in secState ? !!secState[key] : dflt; }
function makeSection(h3, body, key, dflt) {
  const open = secOpenOf(key, dflt);
  const text = h3.textContent.trim();
  const btn = h('button', { class: 'rt-secbtn', type: 'button', 'aria-expanded': String(open), 'aria-label': (open ? 'Fold ' : 'Show ') + text });
  h3.prepend(btn);
  h3.classList.add('rt-sech');
  const sec = h('section', { class: 'rt-sec' + (open ? '' : ' shut') }, h3, body);
  const flip = () => {
    const now = sec.classList.toggle('shut');
    btn.setAttribute('aria-expanded', String(!now));
    btn.setAttribute('aria-label', (now ? 'Show ' : 'Fold ') + text);
    secState[key] = !now;
    try { localStorage.setItem(SEC_KEY, JSON.stringify(secState)); } catch (err) { /* kept for this visit only */ }
  };
  h3.addEventListener('click', e => { if (e.target === btn || !e.target.closest('a, button, input, select, label')) flip(); });
  return sec;
}
function sectionise(box, kind) {
  const kids = [...box.children];
  const order = [], secs = [], about = [], reads = [];
  let cur = null;
  // a long explanation, plain or a note, goes to About; a short one whose text is kept up to
  // date (a status, a warning) stays where it is
  const live = new Set(refs.map(r => r.node));
  const longText = k => k.tagName === 'P' && (!k.className || k.className === 'note') && k.textContent.length > 90 &&
    (k.textContent.length > 240 || (!live.has(k) && ![...k.querySelectorAll('*')].some(n => live.has(n))));
  for (const k of kids) {
    k.remove();
    if (k.tagName === 'H3') { cur = { h3: k, body: h('div', { class: 'rt-secbody' }) }; secs.push(cur); order.push(cur); continue; }
    // a part's tabs stand between sections, not in one
    if (k.classList.contains('rt-tabs')) { cur = null; order.push(k); continue; }
    if (longText(k)) { about.push([cur && cur.h3.textContent.trim(), k]); continue; }
    if (!cur) { order.push(k); continue; }
    if (k.classList.contains('rt-readout')) reads.push([cur, k]);
    else cur.body.append(k);
  }
  // a section of readouts alone keeps them; the rest go to a Readout section after the settings
  for (const c of secs) c.only = !c.body.children.length;
  let readSec = null;
  for (const [c, k] of reads) {
    if (c.only) c.body.append(k);
    else (readSec || (readSec = { h3: h('h3', null, 'Readout'), body: h('div', { class: 'rt-secbody' }) })).body.append(k);
  }
  if (readSec) order.splice(order.lastIndexOf(secs[secs.length - 1]) + 1, 0, readSec);
  for (const o of order) {
    if (o instanceof Node) box.append(o);
    else if (o.body.children.length) box.append(makeSection(o.h3, o.body, kind + '|' + o.h3.textContent.trim(), true));
  }
  if (about.length) {
    const body = h('div', { class: 'rt-secbody rt-about' });
    let last;
    for (const [head, p] of about) {
      if (head && head !== last && head !== 'Position') body.append(h('h4', null, head));
      last = head;
      body.append(p);
    }
    box.append(makeSection(h('h3', null, 'About this part'), body, kind + '|About', false));
  }
}
function renderPanelBody(el) {
  const scroll = panel.scrollTop;
  panel.replaceChildren();
  if (el && panel === mainPanel && extraSel.size && selection().length > 1) {
    const A = asmOfSelection(selection());                // an assembly picked whole shows as one
    if (A) { assemblyPanel(A); sectionise(panel, 'assembly'); return; }
    groupPanel(selection()); return;
  }
  if (!el) {
    const F = selFibre();
    if (F && panel === mainPanel) { (F.wg ? PIC_UI.wgPanel : F.wire ? ELEC_UI.wirePanel : fibreLinkPanel)(F); panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' }, routeField(F))); }   // PIC hook
    else { renderOverview(); sectionise(panel, 'bench'); }
    return;
  }

  const title = h('h2', null, h('span', null, el.name), h('span', { class: 'kind' }, typeLabel(el)));
  // a part of a designed assembly: locked against a stray edit, the padlock beside the title opening it
  const des = asmOf(el), designed = !!(des && des.design), locked = designed && des.lock === true;
  if (designed) {
    const lk = h('button', { class: 'rt-pin rt-padlock' + (locked ? ' on' : ''), type: 'button', 'data-keep': '', 'aria-pressed': locked ? 'true' : 'false',
      'aria-label': locked ? 'Unlock ' + des.name + '’s parts' : 'Lock ' + des.name + '’s parts',
      title: locked ? 'Locked: these parts are as ' + des.name + '’s lens design has them. Click to unlock their fields here (the design workspace can always change them).' : 'Unlocked: these parts’ fields can be changed here. Click to lock them again.',
      onclick: () => { checkpoint(); des.lock = !locked; changed(false); renderPanel(); } });
    lk.innerHTML = locked ? PADLOCK_SVG : UNPADLOCK_SVG;
    title.append(lk);
  }
  pinTitle(title, el.id, () => selectEl(el));
  panel.append(title);
  if (locked) panel.append(h('div', { class: 'rt-locknote' }, 'Locked as designed in ' + des.name + '. Open the padlock to edit here, or open its lens design.'));
  const asm = assumedBox(el);
  if (asm) panel.append(asm);
  panel.append(h('div', { class: 'rt-rows' },
    textField('Name', () => el.name, v => { el.name = v; title.firstChild.textContent = v; }, { wide: true })));
  // a lens, mirror or window on its own: straight into lens design, right under its name
  const dz = panel === mainPanel ? designOneRow(el) : null;
  if (dz) panel.append(h('div', { class: 'rt-inline', style: 'display:flex;flex-wrap:wrap;justify-content:flex-end;gap:0.35rem;margin:0.35rem 0 0.6rem' }, dz));
  panel.append(h('h3', null, 'Position'));
  const rows = h('div', { class: 'rt-rows' });
  rows.append(
    paramPair('X, Y (mm)', el, [['x', 'X (mm)'], ['y', 'Y (mm)']], { noSweep: el.type === 'draw' }),
    param({ source: 'Direction (\u00b0)', lens: 'Axis angle (\u00b0)', cube: 'Orientation (\u00b0)', prism: 'Orientation (\u00b0)',
      stop: 'Orientation (\u00b0)', waveplate: 'Orientation (\u00b0)', polariser: 'Orientation (\u00b0)', crystal: 'Orientation (\u00b0)',
      faraday: 'Field direction (\u00b0)', isolator: 'Forward direction (\u00b0)', filter: 'Orientation (\u00b0)', gain: 'Orientation (\u00b0)', cell: 'Orientation (\u00b0)', nlc: 'Orientation (\u00b0)',
      link: 'Orientation (\u00b0)', fcomp: 'Orientation (\u00b0)', pic: 'Orientation (\u00b0)', aom: 'Orientation (\u00b0)', eom: 'Orientation (\u00b0)', draw: 'Rotation (\u00b0)' }[el.type] || 'Facing (\u00b0)', el, 'angle', { wide: true, noSweep: el.type === 'draw' }),
  );
  // its place out of the plane (as the 3D view shows it): height above the breadboard, tip and roll
  if (V3D.free(el)) {
    const zp = param('z (mm)', el, 'z', { wide: true });
    zp.title = 'Its optical centre above the breadboard. The beam is at ' + BEAM_Z + ' mm unless a part sets it otherwise; light passing above or below a part misses it, and a curved surface met off its centre turns the light up or down.';
    rows.append(zp);
  }
  // a part tipped up or down out of the plane, as a mount's vertical knob does
  if (tippable(el)) {
    const tp = paramPair('Tip, Roll (\u00b0)', el, [['tip', 'Tip (\u00b0)'], ['roll', 'Roll (\u00b0)']]);
    tp.title = el.type === 'mirror' ? 'Tips the mirror up (positive) or down out of the bench plane, as the vertical knob of a kinematic mount does; Facing turns it across, as the other knob does. The reflected light rises or falls by twice the tip.'
      : el.type === 'source' ? 'Sends the light up (positive) or down out of the bench plane, at this angle.' : 'Tips the part up (positive) or down out of the bench plane, about its own across axis.';
    // and rolled about its own axis: a cylinder's power, a grating's grooves, a Dove prism's image turned
    tp.title += ' Roll: ' + (el.type === 'source' ? 'turns the source about its beam: its pattern across the beam and its polarisation with it.'
      : 'turns the part about its own axis (the way it faces), right-handed: a cylindrical lens\u2019s power, a grating\u2019s grooves, a waveplate\u2019s, polariser\u2019s or crystal\u2019s axis, a Dove prism\u2019s image (turned twice as far).');
    tp.title = 'Tip: ' + tp.title;
    rows.append(tp);
  }
  // with more than one tab: which one it is on (moving it takes it there, the view with it)
  if (project.benches.length > 1) rows.append(selectField('On tab', project.benches.map(b => [b.id, b.name]), () => el.bench,
    v => { el.bench = v; if (panel === mainPanel) switchTab(v); }, { wide: true }));
  panel.append(rows);

  const horn = el.mmw && !el.mmw.part, U = PART_UI[el.type];
  if (horn) rfHornPanel(el);
  if (el.mod) modPanel(el);                                                                   // a mod's part
  // the part's own sections (a horn's stand in for a source's or a detector's; a mod's for its part's)
  if (U && !(horn && (el.type === 'source' || el.type === 'detector')) && !(el.mod && U.noModPanel)) U.panel(el);
  if (el.type !== 'elec' && el.type !== 'draw') ELEC_UI.opticPanel(el);                                 // ELEC hook
  for (const c of cavitiesOf(el)) {
    panel.append(h('div', { class: 'rt-cavlink' },
      h('span', null, 'Part of ' + c.name + ': ' + c.kind + ', FSR ' + fmtHz(c.fsr) + (c.finesse ? ', finesse ' + (+c.finesse.toPrecision(3)) : '')),
      h('button', { class: 'rt-btn', type: 'button', onclick: () => { selectOne(null); setBenchTab('cavity'); renderPanel(); requestRender(); } }, 'Show')));
  }

  sectionise(panel, el.type);
  panel.append(h('div', { class: 'rt-actions' },
    h('button', { class: 'rt-btn', 'data-keep': '', onclick: () => duplicate(el) }, 'Duplicate'),
    h('button', { class: 'rt-btn danger', onclick: () => removeEl(el) }, 'Delete'),
  ));
  // locked: every field, sweep and button that would change the part is shown but can't be used
  if (locked) for (const n of panel.querySelectorAll('input, select, textarea, button')) {
    // kept: the title's buttons, folding sections, tabs between views, and what opens the design or copies the part
    if (n.hasAttribute('data-keep') || n.closest('h2') || n.classList.contains('rt-secbtn') || n.getAttribute('role') === 'tab') continue;
    n.disabled = true;
  }
  holdScroll(panel, panel._hold != null ? panel._hold : scroll);
}

