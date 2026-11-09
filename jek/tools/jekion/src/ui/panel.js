import { hooks } from '../../../jekray/src/core/hooks.js';
import { nf } from '../core/units.js';
import { checkpoint } from '../state/elements.js';

/* ==========================================================================
   The properties panel's framework: the element builder h, fields (a number, a choice, a tick, text), sections,
   readouts, and the panel's rebuild (renderPanel, ui/panels.js writes it) and refresh (syncPanel: every field reads
   its value again). The classes are JEKray's, so the panels look the same.
   ========================================================================== */
export const mainPanel = typeof document !== 'undefined' ? document.getElementById('panel') : null;
export let panel = mainPanel;
export function setPanel(v) { return (panel = v); }
let refs = [], editing = false, fid = 0;
export let panelBody = () => {};           // ui/panels.js installs the builder
export function setPanelBody(fn) { return (panelBody = fn); }
export let panelClosed = false;
export function setPanelClosed(v) { return (panelClosed = v); }

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
export function helpLine(short, long, cls, style) {
  const more = h('span', { class: 'rt-helpmore', hidden: '' }, ' ', ...(Array.isArray(long) ? long : [long]));
  const btn = h('button', { type: 'button', class: 'rt-helpbtn', 'aria-expanded': 'false', 'aria-label': 'More about this', title: 'More about this',
    onclick: () => { const open = more.hidden; more.hidden = !open; btn.setAttribute('aria-expanded', String(open)); } }, 'ⓘ');
  return h('p', { class: cls || 'rt-lsub', ...(style ? { style } : {}) }, ...(Array.isArray(short) ? short : [short]), ' ', btn, more);
}
export function bindSync(node, sync) { refs.push({ node, sync }); sync(); }
export function beginEdit() { if (!editing) { checkpoint(); editing = true; } }
export function endEdit() { editing = false; flushPanel(); }
/* a rebuild asked for while a number is being typed (a flight's results arriving after each keystroke) waits until
   the field is left: rebuilding would replace the field under the caret, eating what was typed */
let pendingRender = false;
const typingHere = () => { const a = document.activeElement; return !!(a && mainPanel && mainPanel.contains(a) && a.tagName === 'INPUT' && a.type === 'text'); };
export function flushPanel() { if (pendingRender && !typingHere()) renderPanel(); }
const panelChanged = rebuild => hooks.ionChanged(rebuild);
/* a number typed: onValue as it is typed (a checkpoint taken at the first keystroke), the field redrawn when left */
export function numInput(get, onValue, opts = {}) {
  const inp = h('input', { id: 'rtf' + (++fid), type: 'text', inputmode: 'decimal', spellcheck: 'false', placeholder: opts.placeholder });
  const show = opts.fmt || (v => nf(v, 6));
  if (opts.commit) {
    inp.addEventListener('change', () => { const v = Number(inp.value.trim()); if (inp.value.trim() !== '' && isFinite(v)) { checkpoint(); onValue(v); inp.blur(); panelChanged(true); } inp.value = show(get()); });
    bindSync(inp, () => { inp.value = show(get()); });
    return inp;
  }
  inp.addEventListener('input', () => {
    const raw = inp.value.trim();
    let v;
    if (raw === '') { if (opts.blank === undefined) return; v = opts.blank; } else { v = Number(raw); if (!isFinite(v)) return; }
    beginEdit(); onValue(v); panelChanged(false);
  });
  inp.addEventListener('change', () => { endEdit(); inp.value = show(get()); });
  inp.addEventListener('blur', endEdit);
  bindSync(inp, () => { inp.value = show(get()); });
  return inp;
}
/* a labelled number bound to obj[key] (clamped to opts.min / opts.max) */
export function param(label, obj, key, opts = {}) {
  const inp = numInput(() => obj[key], v => { if (opts.min !== undefined) v = Math.max(opts.min, v); if (opts.max !== undefined) v = Math.min(opts.max, v); obj[key] = v; if (opts.after) opts.after(v); }, opts);
  inp.dataset.key = key;
  const wrap = h('div', { class: 'rt-f' + (opts.wide ? ' wide' : '') }, h('label', { for: inp.id }, label), inp);
  if (opts.title) wrap.title = opts.title;
  return wrap;
}
export function selectField(label, options, get, set, opts = {}) {
  const sel = h('select', { id: 'rtf' + (++fid) });
  for (const [v, t] of options) sel.append(h('option', { value: v }, t));
  sel.value = get();
  sel.addEventListener('change', () => { checkpoint(); set(sel.value); panelChanged(opts.rebuild !== false); });
  bindSync(sel, () => { sel.value = get(); });
  return h('div', { class: 'rt-f' + (opts.wide ? ' wide' : '') }, h('label', { for: sel.id }, label), sel);
}
export function checkField(label, get, set, opts = {}) {
  const inp = h('input', { type: 'checkbox' });
  inp.checked = !!get();
  inp.addEventListener('change', () => { checkpoint(); set(inp.checked); panelChanged(opts.rebuild !== false); });
  bindSync(inp, () => { inp.checked = !!get(); });
  return h('label', { class: 'rt-check' + (opts.wide ? ' wide' : ''), title: opts.title }, inp, label);
}
export function textField(label, get, set, opts = {}) {
  const inp = h('input', { id: 'rtf' + (++fid), type: 'text', spellcheck: 'false', placeholder: opts.placeholder });
  inp.addEventListener('input', () => { beginEdit(); set(inp.value); panelChanged(false); });
  inp.addEventListener('change', endEdit); inp.addEventListener('blur', endEdit);
  bindSync(inp, () => { inp.value = get(); });
  return h('div', { class: 'rt-f' + (opts.wide ? ' wide' : '') }, h('label', { for: inp.id }, label), inp);
}
export function colourField(label, get, set) {
  const inp = h('input', { type: 'color', id: 'rtf' + (++fid), value: get() });
  inp.addEventListener('change', () => { checkpoint(); set(inp.value); panelChanged(false); });
  return h('div', { class: 'rt-f' }, h('label', { for: inp.id }, label), inp);
}
export const rows = (...items) => h('div', { class: 'rt-rows' }, ...items.flat().filter(Boolean));
/* a heading and its content, folded and unfolded, remembered by key */
const SEC_KEY = 'jek-ion-sections';
const secState = (() => { try { return JSON.parse(localStorage.getItem(SEC_KEY)) || {}; } catch (err) { return {}; } })();
export function section(title, key, body, open = true) {
  const isOpen = key in secState ? !!secState[key] : open;
  const btn = h('button', { class: 'rt-secbtn', type: 'button', 'aria-expanded': String(isOpen), 'aria-label': (isOpen ? 'Fold ' : 'Show ') + title });
  const h3 = h('h3', { class: 'rt-sech' }, btn, title);
  const sec = h('section', { class: 'rt-sec' + (isOpen ? '' : ' shut') }, h3, h('div', { class: 'rt-secbody' }, ...body.filter(Boolean)));
  h3.addEventListener('click', e => { if (e.target === btn || !e.target.closest('a, button, input, select, label')) { const shut = sec.classList.toggle('shut'); btn.setAttribute('aria-expanded', String(!shut)); secState[key] = !shut; try { localStorage.setItem(SEC_KEY, JSON.stringify(secState)); } catch (err) { /* this visit */ } } });
  return sec;
}
/* a readout list: [[name, value], …], values refreshed on sync when given as functions */
export function readout(items, cls) {
  const dl = h('dl');
  for (const [k, v] of items) { const dd = h('dd'); if (typeof v === 'function') bindSync(dd, () => { dd.textContent = v(); }); else dd.textContent = v; dl.append(h('dt', null, k), dd); }
  return h('div', { class: 'rt-readout' + (cls ? ' ' + cls : '') }, dl);
}
/* every field reads its value again (after a drag, a run) */
/* every field shown again from the bench, but not the one being typed in: rewriting it would eat what was typed (a
   trailing point, a leading minus, the digits of 0.05) and throw the caret to the end */
export function syncPanel() { for (const r of refs) try { if (document.activeElement !== r.node || r.node.tagName === 'BUTTON') r.sync(); } catch (err) { /* a field gone */ } }
/* the panel rebuilt for what is selected (ui/panels.js says what goes in it) */
export function renderPanel(force) {
  if (!mainPanel) return;
  if (!force && typingHere()) { pendingRender = true; syncPanel(); return; }
  pendingRender = false;
  refs = [];
  const scroll = mainPanel.scrollTop;
  mainPanel.replaceChildren();
  const show = panelBody(mainPanel);
  mainPanel.style.display = show ? '' : 'none';
  mainPanel.parentElement.classList.toggle('rt-nopanel', !show);
  mainPanel.scrollTop = scroll;
  const tab = document.getElementById('btnSideTab');
  if (tab) { tab.classList.toggle('open', !!show); tab.setAttribute('aria-pressed', show === 'bench' ? 'true' : 'false'); tab.title = show ? 'Hide the panel' : 'Bench settings: the array, the gas, the magnetic field, flying and display'; }
}
