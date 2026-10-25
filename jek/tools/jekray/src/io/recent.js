import { EMBED } from '../core/constants.js';
import { h } from '../ui/panel.js';
import { toast } from '../ui/actions.js';
import { openDemo } from '../ui/tours.js';
import { openProjectData } from './open.js';
import { openCloudBench } from './cloud.js';

/* ---------- Open recent (File › Open recent) ----------
   The last few things opened, newest first: a .jekray file (its text kept here, as a page cannot open a file
   on the disk again by itself; a large one is let go first when the browser's store is full), an example (by
   its name) and a cloud bench (by its id, fetched afresh). Kept in this browser. */
const OPENED_KEY = 'jekray-recent', OPENED_MAX = 8;
export function readRecent() {
  try { const v = JSON.parse(localStorage.getItem(OPENED_KEY)); return Array.isArray(v) ? v : []; } catch (err) { return []; }
}
export function noteRecent(item) {
  if (EMBED) return;
  const same = r => r.kind === item.kind && (item.kind === 'file' ? r.label === item.label : r.id === item.id);
  const list = [Object.assign({ t: Date.now() }, item), ...readRecent().filter(r => !same(r))].slice(0, OPENED_MAX);
  // a full store: the files' kept text let go, the oldest first, then the entries themselves
  for (;;) {
    try { localStorage.setItem(OPENED_KEY, JSON.stringify(list)); return; } catch (err) {
      const i = list.map(r => !!r.json).lastIndexOf(true);
      if (i > 0) list.splice(i, 1); else if (list.length > 1) list.pop(); else return;
    }
  }
}
export function openRecent(r) {
  if (r.kind === 'example') return openDemo(r.id, true);
  if (r.kind === 'cloud') return openCloudBench(r.id).catch(err => toast('Could not open ' + r.label + ': ' + err.message, true));
  try { openProjectData(JSON.parse(r.json), r.label); noteRecent(r); }
  catch (err) { toast(r.label + ' could not be opened: ' + err.message, true); }
}
const KIND = { file: 'file', example: 'example', cloud: 'cloud' };
export function fillRecent() {
  const menu = document.getElementById('recentMenu');
  if (!menu) return;
  const list = readRecent();
  menu.replaceChildren(...(list.length ? list.map(r => h('button', { type: 'button', role: 'menuitem', title: r.label, onclick: () => openRecent(r) },
    h('span', { class: 'rt-recentname' }, r.label), h('span', { class: 'k' }, KIND[r.kind] || ''))) : [h('span', { class: 'rt-menunote' }, 'Nothing opened yet: a file, an example or a cloud bench you open is kept here.')]),
    ...(list.length ? [h('div', { class: 'sep' }), h('button', { type: 'button', role: 'menuitem', onclick: () => { try { localStorage.removeItem(OPENED_KEY); } catch (err) { /* none */ } fillRecent(); } }, 'Clear this list')] : []));
}

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wireRecent() {
  document.getElementById('btnFile').addEventListener('click', fillRecent);
  fillRecent();
}
