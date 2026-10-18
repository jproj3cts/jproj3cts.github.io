import { LOCKED, clamp } from '../core/constants.js';
import { extraSel, future, history, project, selectOne, selectedId, setFuture } from '../state/project.js';
import { getEl, selected } from '../state/elements.js';
import { benchName, curBench, ensureBenches, onTab } from '../state/tabs.js';
import { requestRender } from './render.js';
import { pauseAll } from './sweeps.js';
import { stopSweepsFor } from './optimise.js';
import { h, renderPanel } from './panel.js';
import { changed, markUnsaved, updateUndoButtons } from './actions.js';
import { scheduleSave } from '../io/autosave.js';

/* ==========================================================================
   Bench tabs: switching, adding and removing benches, the tab row, and the undo history.
   ========================================================================== */

export function switchTab(id) {
  if (!project.benches.some(b => b.id === id)) return;
  project.tab = id;
  project.view = curBench().view;
  const sel = selected();
  if (sel && !onTab(sel)) selectOne(null);
  renderBenchTabs(); renderPanel(); scheduleSave(); requestRender();
}

/* select an element, going to its tab first */
export function selectEl(el) {
  if (!el) return;
  extraSel.clear();
  if (!onTab(el)) switchTab(el.bench);
  selectOne(el.id); renderPanel(); requestRender();
}

export function addBench() {
  checkpoint();
  let n = project.benches.length + 1;
  while (project.benches.some(b => b.name === 'Bench ' + n)) n++;
  let k = n; while (project.benches.some(b => b.id === 'b' + k)) k++;
  project.benches.push({ id: 'b' + k, name: 'Bench ' + n, view: { cx: 0, cy: 0, scale: 4 } });
  switchTab('b' + k);
  changed(true);
}

function removeBench(id) {
  if (project.benches.length < 2) return;
  const els = project.elements.filter(e => e.bench === id);
  if (els.length && !confirm('Delete ' + benchName(id) + ' and the ' + els.length + ' element' + (els.length === 1 ? '' : 's') + ' on it?')) return;
  checkpoint();
  for (const e of els) stopSweepsFor(e);
  project.elements = project.elements.filter(e => e.bench !== id);
  project.benches = project.benches.filter(b => b.id !== id);
  if (project.tab === id) switchTab(project.benches[0].id);
  changed(true);
}

/* Dragging a tab along the strip: it follows the pointer, the others step aside to show
   where it will go, and it is put there when let go. A press that barely moves is a click. */
function tabDragStart(e, btn, b) {
  if (e.button !== 0 || e.target.classList.contains('x')) return;
  const box = document.getElementById('benchTabs'), tabs = [...box.querySelectorAll('button[role="tab"]')];
  const from = tabs.indexOf(btn), rects = tabs.map(t => t.getBoundingClientRect()), x0 = e.clientX;
  let started = false, to = from;
  btn.setPointerCapture(e.pointerId);
  const move = ev => {
    const dx = ev.clientX - x0;
    if (!started) { if (Math.abs(dx) < 5) return; started = true; btn.classList.add('dragging'); }
    const lo = rects[0].left - rects[from].left, hi = rects[rects.length - 1].right - rects[from].right;
    const d = clamp(dx, lo, hi), mid = rects[from].left + rects[from].width / 2 + d, w = rects[from].width;
    btn.style.transform = 'translateX(' + d + 'px)';
    to = 0;
    tabs.forEach((t, k) => { if (k !== from && rects[k].left + rects[k].width / 2 < mid) to++; });
    tabs.forEach((t, k) => {
      if (k === from) return;
      const shift = from < to && k > from && k <= to ? -w : to < from && k >= to && k < from ? w : 0;
      t.style.transform = shift ? 'translateX(' + shift + 'px)' : '';
    });
  };
  const up = () => {
    btn.removeEventListener('pointermove', move); btn.removeEventListener('pointerup', up); btn.removeEventListener('pointercancel', up);
    if (!started) return;
    btn._dragged = true;
    tabs.forEach(t => { t.style.transform = ''; t.classList.remove('dragging'); });
    if (to !== from) {
      checkpoint();
      const [m] = project.benches.splice(from, 1);
      project.benches.splice(to, 0, m);
      changed(true);
    }
    renderBenchTabs();
  };
  btn.addEventListener('pointermove', move); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up);
}

export function renderBenchTabs() {
  const box = document.getElementById('benchTabs');
  if (!box) return;
  box.replaceChildren();
  for (const b of project.benches) {
    const btn = h('button', { type: 'button', role: 'tab', class: b.id === project.tab ? 'on' : '', 'aria-selected': b.id === project.tab ? 'true' : 'false',
      title: (b.id === project.tab ? 'Double-click to rename. ' : 'Show ' + b.name + '. ') + 'Drag to reorder.' }, b.name);
    btn.addEventListener('click', e => { if (e.target.classList.contains('x') || btn._dragged) { btn._dragged = false; return; } if (b.id !== project.tab) switchTab(b.id); });
    if (LOCKED) { box.append(btn); continue; }                        // a locked embed: tabs switch, nothing more
    btn.addEventListener('pointerdown', e => tabDragStart(e, btn, b));
    btn.addEventListener('dblclick', () => {
      const inp = h('input', { type: 'text', value: b.name, 'aria-label': 'Tab name' });
      let over = false;                    // Enter, then the blur as the field goes: once only
      const done = ok => {
        if (over) return;
        over = true;
        const v = inp.value.trim().slice(0, 40);
        if (ok && v && v !== b.name) { checkpoint(); b.name = v; changed(true); }
        renderBenchTabs();
      };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); e.stopPropagation(); });
      inp.addEventListener('blur', () => done(true));
      btn.replaceWith(inp); inp.focus(); inp.select();
    });
    if (b.id === project.tab && project.benches.length > 1) {
      const x = h('span', { class: 'x', title: 'Delete this tab', 'aria-label': 'Delete ' + b.name }, '\u00d7');
      x.addEventListener('click', () => removeBench(b.id));
      btn.append(x);
    }
    box.append(btn);
  }
  if (LOCKED) return;
  const add = h('button', { type: 'button', class: 'add', title: 'A new tab: a bench of its own, joined to the others by link planes' }, '+');
  add.addEventListener('click', addBench);
  box.append(add);
}

/* History */
const snapshot = () => JSON.stringify({ e: project.elements, b: project.benches.map(b => ({ id: b.id, name: b.name })), f: project.fibres || [], m: project.measures || [], a: project.assemblies || [] });

function restore(str) {
  const S = JSON.parse(str), views = new Map(project.benches.map(b => [b.id, b.view]));
  project.elements = S.e;
  project.fibres = S.f || [];
  project.measures = S.m || [];
  project.assemblies = S.a || [];
  project.benches = S.b.map(b => ({ id: b.id, name: b.name, view: views.get(b.id) || { cx: 0, cy: 0, scale: 4 } }));
  ensureBenches(project);
  renderBenchTabs();
}

export function checkpoint() {
  history.push(snapshot());
  if (history.length > 150) history.shift();
  setFuture([]);
  updateUndoButtons();
  markUnsaved(true);
}

export function undo() {
  if (!history.length) return;
  pauseAll();
  future.push(snapshot());
  restore(history.pop());
  if (selectedId && !getEl(selectedId)) selectOne(null);
  changed(true);
}

export function redo() {
  if (!future.length) return;
  pauseAll();
  history.push(snapshot());
  restore(future.pop());
  if (selectedId && !getEl(selectedId)) selectOne(null);
  changed(true);
}
