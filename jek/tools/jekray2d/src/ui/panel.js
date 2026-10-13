import { BEAM_Z } from '../core/constants.js';
import { fmtFs, fmtHz, fmtLen, fmtNum } from '../core/format.js';
import { FIBRE_NG, cohGamma, lagOf, splitChain, splitRoot } from '../core/coherence.js';
import { applyPulse, gsmModes, m2Of, syncLine } from '../core/pulses.js';
import { fanFromGauss, isHigherMode, lgComps, modeM2 } from '../core/beams-hom.js';
import { wavelengthColour } from '../core/colour.js';
import { extraSel, project, selectOne, typeLabel } from '../state/project.js';
import { getEl, lightOf, selected } from '../state/elements.js';
import { STL_UNITS, meshHullCache } from '../core/stl.js';
import { RAY_PATTERNS, rayPattern, tippable } from '../engines/trace.js';
import { requestRender, selFibre, selection, setSelFibreId } from './render.js';
import { drawBarShown, drawPanel } from './drawings.js';
import { SWEEP_STEPS_MAX, getPath, setParam } from '../state/params.js';
import {
  FIELD_FRAMES, WAVES, advOpen, fieldPossible, isPlaying, pause, play, setFieldRendered, swPool,
  swRelease, sweepDefault, sweepEta, sweepFrac, sweepJob, sweepKey, sweepValue
} from './sweeps.js';
import { applyFibre } from '../engines/fibre-face.js';
import { PIC } from '../engines/pic.js';
import { ELEC } from '../engines/elec.js';
import { V3D } from './view3d.js';
import { updateReadouts } from './readouts.js';
import {
  cellPanel, crystalPanel, cubePanel, detectorPanel, faradayPanel, fcompPanel, fibreLinkPanel,
  fibrePanel, filterPanel, gainPanel, gratingPanel, groupPanel, jonesPanel, linkPanel, maskPanel,
  modulatorPanel, nlcPanel, prismPanel, pulseLine, pulseToggle, readoutBox, readoutTabs, rfHornPanel,
  screenPanel, stopPanel
} from './panels.js';
import { assumedBox, lensPanel } from './plots.js';
import { renderOverview, setBenchTab } from './panel-cavity.js';
import { cavitiesOf, gaussFromFan } from '../engines/cavity.js';
import { popNote } from './heavy.js';
import { changed, duplicate, removeEl } from './actions.js';
import { checkpoint, selectEl, switchTab } from './tabs.js';
import { importStl } from './experimental.js';
import { saveToMine } from './myparts.js';
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
/* An STL object's panel: its units (the file carries none), its size, colour and shape */
function stlPanel(el) {
  panel.append(h('h3', null, 'STL object'));
  const rows = h('div', { class: 'rt-rows' },
    selectField('Units of the file', [['mm', 'Millimetres'], ['cm', 'Centimetres'], ['m', 'Metres'], ['in', 'Inches'], ['other', 'Other (mm per unit)']], () => el.units || 'mm',
      v => { el.units = v; if (v !== 'other') el.scale = STL_UNITS[v]; meshHullCache.delete(el.id); }, { wide: true }));
  if (el.units === 'other') rows.append(param('mm per unit', el, 'scale'));
  const cid = 'rtf' + (++fid), ci = h('input', { type: 'color', id: cid, value: el.colour || '#8a8f96' });
  ci.addEventListener('change', () => { checkpoint(); el.colour = ci.value; changed(false); });
  rows.append(h('div', { class: 'rt-f' }, h('label', { for: cid }, 'Colour'), ci));
  panel.append(rows);
  panel.append(readoutBox('stl'));
  const fi = h('input', { type: 'file', accept: '.stl,.STL', hidden: true });
  fi.addEventListener('change', () => { const f = fi.files[0]; if (f) importStl(f, null, el); fi.value = ''; });
  panel.append(fi, h('div', { class: 'rt-actions', style: 'margin-top:0.5rem' }, h('button', { type: 'button', class: 'rt-btn', onclick: () => fi.click() }, 'Replace its shape from a .stl file\u2026'),
    h('button', { type: 'button', class: 'rt-btn', title: 'Keep it in My parts (JEKrayPro), to add to any bench from + Add part', onclick: () => saveToMine([el]) }, '\u2605 Save to My parts\u2026')));
  const M = el.mesh;
  if (M) panel.append(h('p', { class: 'note', style: 'margin-top:0.5rem' }, M.n + ' triangles' + (M.orig ? ', simplified from the file\u2019s ' + M.orig + ' (to detail of ' + M.cell + ' file units) so it saves with the bench' : '') +
    ', ' + Math.max(1, Math.round(M.data.length / 1024)) + ' KB with the bench' + (M.file ? ', from ' + M.file : '') + '.'));
  panel.append(h('p', { class: 'note', style: 'margin-top:0.5rem' }, 'An opaque object brought in from CAD (a mount, a housing, a baffle): every ray that meets it stops there, met against its triangles in 3D, and a Gaussian beam whose centre meets it ends there. Size, colour and place are yours; its facing, tip and roll turn it as any part. A beam that only grazes its edge is not cut by it: use a stop for that.'));
}
export function selectField(label, options, get, set, opts = {}) {
  const id = 'rtf' + (++fid);
  const sel = h('select', { id });
  for (const [v, t] of options) sel.append(h('option', { value: v }, t));
  sel.value = get();
  sel.addEventListener('change', () => { checkpoint(); set(sel.value); changed(opts.rebuild !== false); });
  return h('div', { class: 'rt-f' + (opts.wide ? ' wide' : '') }, h('label', { for: id }, label), sel);
}

export function syncPanel() {
  // skip the input the person is typing in or dragging; buttons always refresh
  for (const box of [mainPanel, ...pinBoxes.values()])
    for (const r of box._refs || []) if (document.activeElement !== r.node || r.node.tagName === 'BUTTON') r.sync();
}

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
  // something is selected again (or View › Show the side panel)
  const main = panel === mainPanel;
  const closeBtn = h('button', { class: 'rt-pin rt-close', type: 'button', title: main ? 'Close this panel' : 'Close: unpin this panel',
    'aria-label': main ? 'Close the panel' : 'Close this pinned panel',
    onclick: () => {
      if (!main) { togglePinId(id); return; }
      selectOne(null); setSelFibreId(null); panelClosed = true; renderPanel(); requestRender();
    } }, '\u00d7');
  title.append(pinBtn, closeBtn);
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
export let panelClosed = false;           // the main panel closed with its ×
export function setPanelClosed(v) { return (panelClosed = v); }
export function renderPanel() {
  pins = pins.filter(pinOk);
  for (const [id, box] of pinBoxes) if (!pins.includes(id)) { box.remove(); pinBoxes.delete(id); }
  // a pinned panel keeps its place in its own content while the selection moves around it:
  // read every scroll before anything is rebuilt or moved, since a box taken out of the
  // page, even to go straight back, comes back scrolled to the top
  const scrolls = new Map([...pinBoxes].map(([id, box]) => [id, box._hold != null ? box._hold : box.scrollTop]));
  const sel = selected();
  // a closed panel opens again with the next thing selected
  if (panelClosed && (sel || selFibre())) panelClosed = false;
  // with nothing selected the main panel would show the Bench: not if that is pinned, or closed
  const mainShows = !panelClosed && (sel ? !pins.includes(sel.id) : !(pins.includes(BENCH_PIN) && !selFibre()));
  mainPanel.style.display = mainShows ? '' : 'none';
  // the columns first, so plots drawn below measure the width they will actually have
  const cols = (mainShows ? 1 : 0) + pins.length;
  mainPanel.parentElement.style.setProperty('--rt-cols', String(Math.max(1, cols)));
  mainPanel.parentElement.classList.toggle('rt-nopanel', !cols);          // the bench across the whole width
  if (mainShows) renderInto(mainPanel, sel);
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
  updateReadouts();
  try { drawBarShown(); } catch (err) { /* the bench's bars are not made yet */ }
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
  if (el && panel === mainPanel && extraSel.size && selection().length > 1) { groupPanel(selection()); return; }
  if (!el) { const F = selFibre(); if (F && panel === mainPanel) (F.wg ? PIC.wgPanel : F.wire ? ELEC.wirePanel : fibreLinkPanel)(F); else { renderOverview(); sectionise(panel, 'bench'); } return; }   // PIC hook

  const title = h('h2', null, h('span', null, el.name), h('span', { class: 'kind' }, typeLabel(el)));
  pinTitle(title, el.id, () => selectEl(el));
  panel.append(title);
  const asm = assumedBox(el);
  if (asm) panel.append(asm);
  panel.append(h('div', { class: 'rt-rows' },
    textField('Name', () => el.name, v => { el.name = v; title.firstChild.textContent = v; }, { wide: true })));
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

  const horn = el.mmw && !el.mmw.part;
  if (horn) rfHornPanel(el);
  else if (el.type === 'source') sourcePanel(el);
  if (el.type === 'mirror') mirrorPanel(el);
  if (el.type === 'screen') screenPanel(el);
  if (el.type === 'lens') lensPanel(el);
  if (el.mod) modPanel(el);                                                                   // a mod's part
  else if (el.type === 'waveplate' || el.type === 'polariser') jonesPanel(el);
  if (el.type === 'stop') stopPanel(el);
  if (el.type === 'mask' && !el.mod) maskPanel(el);
  if (el.type === 'cube') cubePanel(el);
  if (el.type === 'prism') prismPanel(el);
  if (el.type === 'grating') gratingPanel(el);
  if (el.type === 'fibre') fibrePanel(el);
  if (el.type === 'detector' && !horn) detectorPanel(el);
  if (el.type === 'faraday' || el.type === 'isolator') faradayPanel(el);
  if (el.type === 'crystal') crystalPanel(el);
  if (el.type === 'filter') filterPanel(el);
  if (el.type === 'gain') gainPanel(el);
  if (el.type === 'cell') cellPanel(el);
  if (el.type === 'nlc') nlcPanel(el);
  if (el.type === 'link') linkPanel(el);
  if (el.type === 'fcomp' && !el.mod) fcompPanel(el);
  if (el.type === 'pic') PIC.panelFor(el);                                                    // PIC hook
  if (el.type === 'elec' && !el.mod) ELEC.panelFor(el);                                                  // ELEC hook
  if (el.type === 'aom' || el.type === 'eom') modulatorPanel(el);
  if (el.type === 'chopper') ELEC.chopperPanel(el);                                           // ELEC hook
  if (el.type === 'stl') stlPanel(el);
  if (el.type === 'draw') drawPanel(el);
  if (el.type !== 'elec' && el.type !== 'draw') ELEC.opticPanel(el);                                 // ELEC hook
  for (const c of cavitiesOf(el)) {
    panel.append(h('div', { class: 'rt-cavlink' },
      h('span', null, 'Part of ' + c.name + ': ' + c.kind + ', FSR ' + fmtHz(c.fsr) + (c.finesse ? ', finesse ' + (+c.finesse.toPrecision(3)) : '')),
      h('button', { class: 'rt-btn', type: 'button', onclick: () => { selectOne(null); setBenchTab('cavity'); renderPanel(); requestRender(); } }, 'Show')));
  }

  sectionise(panel, el.type);
  panel.append(h('div', { class: 'rt-actions' },
    h('button', { class: 'rt-btn', onclick: () => duplicate(el) }, 'Duplicate'),
    h('button', { class: 'rt-btn danger', onclick: () => removeEl(el) }, 'Delete'),
  ));
  holdScroll(panel, panel._hold != null ? panel._hold : scroll);
}

function sourcePanel(el) {
  panel.append(h('h3', null, 'Beam'));
  const rows = h('div', { class: 'rt-rows' });
  const colId = 'rtf' + (++fid);
  const col = h('input', { id: colId, type: 'color' });
  col.addEventListener('input', () => { beginEdit(); el.colour = col.value; el.colourAuto = false; chk.checked = false; changed(false); });
  col.addEventListener('change', endEdit);
  bindSync(col, () => { col.value = el.colour; });
  const chk = h('input', { type: 'checkbox' });
  chk.checked = el.colourAuto;
  chk.addEventListener('change', () => {
    checkpoint(); el.colourAuto = chk.checked;
    if (el.colourAuto) el.colour = wavelengthColour(el.wavelength);
    changed(false);
  });
  const root = splitRoot(el), linked = root !== el;
  const wlId = 'rtf' + (++fid);
  rows.append(
    // a copy split from a laser has the laser's wavelength
    linked ? h('div', { class: 'rt-f' }, h('label', { for: wlId }, 'Wavelength (nm)'), h('input', { id: wlId, type: 'text', value: String(root.wavelength), disabled: '', title: 'Set on ' + root.name })) : param('Wavelength (nm)', el, 'wavelength'),
    param('Power (mW)', el, 'power'),
    h('div', { class: 'rt-f' }, h('label', { for: colId }, 'Colour'), col),
    h('label', { class: 'rt-check wide' }, chk, 'Match colour to wavelength'),
  );
  panel.append(rows);

  // the ray fan: on its own, and hidden with its settings when it is off
  panel.append(h('h3', null, 'Rays'));
  const tr = h('input', { type: 'checkbox' });
  tr.checked = el.traceRays;
  tr.addEventListener('change', () => { checkpoint(); el.traceRays = tr.checked; changed(true); });
  panel.append(h('label', { class: 'rt-check' }, tr, 'Trace the ray fan'));
  if (el.traceRays) {
    panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' },
      param('Beam width (mm)', el, 'width'),
      param('Divergence, full (°)', el, 'divergence'),
      param('Rays', el, 'rays')));
    // the pattern across the beam: the line of the 2D bench, or spread up and down too
    panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.4rem' }, selectField('Rays across the beam', RAY_PATTERNS, () => el.pattern || 'line', v => { if (v === 'line') delete el.pattern; else el.pattern = v; }, { wide: true })));
    const pn = h('p', { class: 'note', style: 'margin-top:0.3rem' });
    bindSync(pn, () => { const N = rayPattern(el, el.rays).length; pn.textContent = (el.pattern ? N + ' rays across the beam, up and down it too, ' : 'In the bench plane only, ') + 'its width (and divergence) the same both ways, each traced exactly in 3D. Screens show where they land on a spot diagram (Rays tab).'; });
    panel.append(pn);
  }
  else if (!el.gauss) {
    // without a Gaussian beam the fan's width and divergence still shape the diffracted field
    panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' },
      param('Beam width (mm)', el, 'width'),
      param('Divergence, full (°)', el, 'divergence')));
    panel.append(h('p', { class: 'note', style: 'margin-top:0.5rem' }, 'No rays are traced, so the ray measurements (spot, wavefront, ray interference) have nothing to go on. The width and divergence still set the uniform pupil the diffracted field starts from; its numerical aperture, Airy radius and cut-off come from the rays and are not shown.'));
  } else panel.append(h('p', { class: 'note', style: 'margin-top:0.5rem' }, 'No rays are traced, so the ray measurements (spot, wavefront, ray interference) have nothing to go on. The Gaussian beam and the diffracted field still work, from their own reference rays.'));

  panel.append(h('h3', null, 'Beam propagation'));
  const gb = h('input', { type: 'checkbox' });
  gb.checked = el.gauss;
  gb.addEventListener('change', () => {
    checkpoint();
    el.gauss = gb.checked;
    if (el.gauss) gaussFromFan(el);    // start from the fan that is already there
    changed(true);
  });
  panel.append(h('label', { class: 'rt-check' }, gb, 'Propagate a Gaussian beam along the axis'));
  if (el.gauss) {
    const fb = h('input', { type: 'checkbox' });
    fb.checked = !!el.fibre;
    fb.addEventListener('change', () => {
      checkpoint();
      if (fb.checked) { el.fibre = { core: 4.4, na: 0.12 }; applyFibre(el); } else delete el.fibre;
      changed(true);
    });
    panel.append(h('label', { class: 'rt-check', style: 'margin-top:0.5rem' }, fb, 'Launch from a single-mode fibre'));
    if (el.fibre) panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' },
      param('Fibre core (µm)', el, 'fibre.core'), param('Fibre NA', el, 'fibre.na')));
    else panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' },
      param('Waist radius (mm)', el, 'w0'),
      param('Waist distance (mm)', el, 'z0'),
      ...(el.tem === 'gauss' ? [param('M\u00b2 (beam quality)', el, 'm2')] : [])));
    if (!el.fibre) {
      panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' },
        selectField('Beam mode', [['gauss', 'Gaussian (TEM\u2080\u2080)'], ['hg', 'Hermite\u2013Gauss HG\u2098\u2099'], ['lg', 'Laguerre\u2013Gauss LG\u209a\u2097 (vortex)']],
          () => el.tem, v => { el.tem = v; fanFromGauss(el); }, { wide: el.tem === 'gauss' }),
        ...(el.tem === 'hg' ? [param('m, nodes in the bench plane', el, 'hm'), param('n, nodes out of it', el, 'hn')]
          : el.tem === 'lg' ? [param('p, radial order', el, 'lp'), param('l, vortex charge', el, 'll')] : [])));
    }
    const line = h('p', { class: 'note', style: 'margin-top:0.5rem' });
    bindSync(line, () => {
      if (isHigherMode(el)) {
        const lam = el.wavelength * 1e-6, [mx, my] = modeM2(el), zR = Math.PI * el.w0 * el.w0 / lam;
        line.textContent = (el.tem === 'hg' ? 'HG' + el.hm + el.hn : 'LG' + el.lp + (el.ll < 0 ? '\u2212' : '') + Math.abs(el.ll)) + ' of a Gaussian of waist ' + fmtLen(el.w0) +
          ': M\u00b2 ' + mx + (my !== mx ? ' in the bench plane, ' + my + ' out of it' : '') + ', so its second-moment waist is ' + fmtLen(el.w0 * Math.sqrt(mx)) + (my !== mx ? ' (' + fmtLen(el.w0 * Math.sqrt(my)) + ' out of the plane)' : '') +
          ' and its far-field half-angle ' + (+(1000 * Math.sqrt(mx) * lam / (Math.PI * el.w0)).toPrecision(3)) + ' mrad; Rayleigh range ' + fmtLen(zR) + '. ' +
          (el.tem === 'lg' ? 'It is carried as a coherent sum of ' + lgComps(el.lp, el.ll).length + ' Hermite\u2013Gauss modes, each with its own Gouy phase, so a pair of cylindrical lenses converts it as in the lab. ' : '') +
          'The diffracted field uses the 2D model.';
        return;
      }
      const lam = el.wavelength * 1e-6, M2 = m2Of(el);
      const zR = Math.PI * el.w0 * el.w0 / (M2 * lam);
      line.textContent = 'Rayleigh range ' + fmtLen(zR) + ', far-field half-angle ' +
        (+(1000 * M2 * lam / (Math.PI * el.w0)).toPrecision(3)) + ' mrad.' +
        (M2 > 1 ? ' With M\u00b2 above 1 the beam is partly coherent across itself: a sum of ' + gsmModes(M2).length +
          ' Hermite\u2013Gauss modes of a Gaussian ' + (+Math.sqrt(M2).toPrecision(3)) + '\u00d7 narrower, added as powers (a Gaussian Schell-model beam, as from a multimode laser or an LED). The diffracted field runs once per mode, so it is that much slower.' : '');
    });
    panel.append(line);
    // how it is shown (envelope, field) is the bench's, for every source alike; how its field is worked out is its own
    panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' },
      selectField('Field model', [['auto', 'Round when it can be'], ['2d', 'Always 2D, with polarisation']], () => el.popModel, v => { el.popModel = v; }),
      selectField('Grid points', [128, 256, 512, 1024].map(v => [String(v), String(v)]), () => String(el.popN), v => { el.popN = +v; })));
    panel.append(h('p', { class: 'note', style: 'margin-top:0.4rem' }, 'Whether the rays, the beams\u2019 envelope and their diffracted field show is set for the whole bench: the ticks under the Bench panel\u2019s Light (click empty bench).'));
    if (lightOf().field) {
      const pn = h('p', { class: 'note', style: 'margin-top:0.5rem' });
      bindSync(pn, () => { pn.textContent = popNote(el); });
      panel.append(pn);
      panel.append(h('p', { style: 'margin-top:0.5rem' }, 'The field is propagated by diffraction, physical optics propagation with a pilot Gaussian choosing between near- and far-field steps. Each surface is a phase screen found by tracing rays through the real surface, so aberrations and clear apertures are included. While the beam stays round it is a radial profile moved with Hankel transforms; a tilted curved face, a tilted refracting face, an off-axis segment or an off-centre hit makes it a 2D field with separate pilots in and out of the bench plane, and what you see is the cut through the plane. Each slice is scaled to its own peak; the dashed lines are the 1/e\u00b2 radius of the Gaussian envelope for comparison.'));
    }
    panel.append(h('p', { style: 'margin-top:0.5rem' }, 'The waist sits this far ahead of the source; negative puts it behind. The ray fan\u2019s width and divergence (under Rays) stay in step with this: the rays are the wavefront normals, so the fan spans the beam diameter and a converging beam gives a negative divergence.'));
  }

  panel.append(h('h3', null, 'Polarisation'));
  const prows = h('div', { class: 'rt-rows' },
    selectField('State', [['unpolarised', 'Unpolarised'], ['s', 's, out of the plane'], ['p', 'p, in the plane'], ['linear', 'Linear at an angle']],
      () => el.pol, v => el.pol = v, { wide: el.pol !== 'linear' }));
  if (el.pol === 'linear') prows.append(param('Angle from p (°)', el, 'polAngle'));
  panel.append(prows);
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Everything here happens in one plane, so s and p never mix: each surface simply splits their power differently.'));

  // the laser's own line: how far apart two paths can be and still interfere
  panel.append(h('h3', null, 'Coherence'));
  // split from another laser's source: one launch with it
  const others = project.elements.filter(e => e.type === 'source' && e !== el && !splitChain(e).includes(el));
  const srows = h('div', { class: 'rt-rows' }, selectField('Split from', [['', 'Nothing: a laser of its own'], ...others.map(e => [e.id, e.name])],
    () => el.splitFrom && getEl(el.splitFrom) ? el.splitFrom : '', v => { el.splitFrom = v || null; }, { wide: true }));
  if (linked) srows.append(param('Phase against it (\u00b0)', el, 'splitPhase'), param('Extra fibre (mm)', el, 'splitPath'));
  panel.append(srows);
  if (linked) {
    const sl = h('p', { class: 'note', style: 'margin-top:0.5rem' });
    bindSync(sl, () => {
      const r = splitRoot(el), lag = lagOf(el), g = cohGamma(r);
      sl.textContent = 'Light from ' + r.name + ', split before it reaches the bench (a fibre coupler, say): the two add as fields wherever they meet, so they interfere. ' +
        'This one keeps its own power, place, beam and polarisation; its wavelength and line are ' + r.name + '\u2019s. ' +
        'The phase between them is set by the fibres to within a wavelength, which in practice drifts: sweep it to see the fringes move. ' +
        'The extra fibre is counted at a group index of ' + FIBRE_NG + ': ' + fmtLen(Math.abs(lag)) + ' of optical path against ' + r.name +
        (g ? ', so fringes with its light have at most ' + (+g(lag).toPrecision(3)) + ' of full contrast.' : ', which matters only once the laser has a coherence length (set on ' + r.name + ').');
    });
    panel.append(sl);
  }
  const crows = h('div', { class: 'rt-rows' });
  const pulsed = !linked && el.tau > 0;
  if (!linked && !pulsed) coherenceFields(el, crows);
  panel.append(crows);
  const cl = h('p', { class: 'note', style: 'margin-top:0.5rem' });
  bindSync(cl, () => {
    if (linked) { cl.textContent = 'The line is ' + splitRoot(el).name + '\u2019s' + (el.coh > 0 ? ': coherence length ' + fmtLen(el.coh) + '.' : ': a single frequency.'); return; }
    if (el.tau > 0) { cl.textContent = 'Set by the pulse (below): coherence length ' + fmtLen(el.coh) + ', Gaussian.'; return; }
    cl.textContent = coherenceNote(el);
  });
  panel.append(cl);
  panel.append(h('h3', null, 'Pulse'));
  if (linked) {
    const pl = h('p', { class: 'note' });
    bindSync(pl, () => { const r = splitRoot(el); pl.textContent = r.tau > 0 ? 'The pulse is ' + r.name + '\u2019s: ' + fmtFs(r.tau) + ', ' + (r.pshape === 'gauss' ? 'Gaussian' : 'sech\u00b2') + '. The extra fibre above delays it.' : r.name + ' is continuous.'; });
    panel.append(pl);
  } else {
    panel.append(pulseToggle(el));
    const prow = h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' });
    if (el.tau > 0) prow.append(param('Duration (fs)', el, 'tau'),
      selectField('Shape', [['sech2', 'sech\u00b2 (soliton, Kerr-lens)'], ['gauss', 'Gaussian']], () => el.pshape, v => { el.pshape = v; applyPulse(el); }),
      param('Repetition rate (MHz)', el, 'rep'),
      param('Chirp at the laser, GDD (fs\u00b2)', el, 'gdd0', { wide: true }));
    panel.append(prow);
    // turning a laser pulsed or continuous changes the panel: redraw it once the field is left
    const built = el.tau > 0, flip = () => { if ((el.tau > 0) !== built) setTimeout(renderPanel); };
    prow.addEventListener('focusout', flip);
    const pl = h('p', { class: 'note', style: 'margin-top:0.5rem' });
    bindSync(pl, () => { pl.textContent = pulseLine(el); if (!prow.contains(document.activeElement)) flip(); });
    if (el.tau > 0) panel.append(pl);
  }

  panel.append(h('h3', null, 'Extra wavelengths'));
  const presets = [['', 'Just the one above'], ['486.1,656.3', 'F and C lines (486.1, 656.3)'],
    ['450,550,650', 'Visible (450, 550, 650)'], ['1530,1565', 'Telecom C-band (1530, 1565)']];
  const pre = h('select', { id: 'rtf' + (++fid) });
  for (const [v, t] of presets) pre.append(h('option', { value: v }, t));
  pre.value = presets.some(q => q[0] === el.lines.join(',')) ? el.lines.join(',') : '';
  pre.addEventListener('change', () => {
    checkpoint();
    el.lines = pre.value ? pre.value.split(',').map(Number) : [];
    changed(true);
  });
  panel.append(h('div', { class: 'rt-rows' },
    h('div', { class: 'rt-f wide' }, h('label', { for: pre.id }, 'Preset'), pre),
    textField('Wavelengths (nm), comma separated', () => el.lines.join(', '), v => {
      const a = v.split(/[,;\s]+/).filter(Boolean).map(Number);
      if (a.every(q => isFinite(q) && q >= 100 && q <= 20000)) el.lines = a.slice(0, 12);
    }, { wide: true, placeholder: 'none' })));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Each extra wavelength fires the same fan of rays, so chromatic focal shift and lateral colour show up directly. Set width to 0 for a point source, or divergence to 0 for a collimated beam.'));
}

function mirrorPanel(el) {
  // what arrives at its face: the rays, the diffracted field and a pulse, read as a screen reads them
  if (readoutTabs(el, [['params', 'Mirror'], ['rays', 'Rays'], ['plots', 'Diffraction'], ['pulse', 'Pulse']])) return;
  panel.append(h('h3', null, 'Mirror'));
  panel.append(h('div', { class: 'rt-rows' },
    param('Length (mm)', el, 'length'),
    param('Radius (mm)', el, 'R', { blank: null, placeholder: 'plane' }),
    param('Reflectance (%)', el, 'reflect'),
    param('Conic k', el, 'k', { blank: 0 }),
    param('Off-axis offset (mm)', el, 'offset'),
    param('GDD a reflection (fs\u00b2)', el, 'gdd', { wide: true }),
  ));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'An off-axis offset slides the aperture that far along the parent curve, which is how off-axis parabolas work: set the parent radius, a conic of \u22121 and the offset. Leave the radius blank for a plane mirror. A positive radius is concave towards the reflecting face. At 100% the back of the mirror absorbs; below that it behaves as a thin partial reflector, and the transmitted part carries straight on. A GDD makes it a chirped (dispersive) mirror: each reflection adds that group-delay dispersion to a pulse, about the pulse\u2019s centre wavelength; negative compresses a pulse that glass has stretched.'));
  if (el.source) panel.append(h('p', { class: 'note' }, 'Imported from ' + el.source + '.'));
}

