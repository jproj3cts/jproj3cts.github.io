import { EMBED } from '../core/constants.js';
import { h } from './panel.js';
import { editCan } from './actions.js';
import { PALETTE_NAMES, addPart, exp, palettesOn, partsOf } from './experimental.js';
import { EXAMPLES } from './news.js';
import { openDemo } from './tours.js';
import { PART_USES } from './part-uses.js';

/* ---------- Search commands (Ctrl+K) ----------
   Every item of the bar's menus, found by its words and run as if it were clicked there: the menus stay
   the one place a command lives, and this reads them as they stand (an item hidden there is left out, one
   greyed there is shown greyed, a gated one carries its badge and asks as the menu's does). Typed words
   find the parts too (added as the picker adds them) and the examples (opened as the gallery opens them). */
const CMD_MENUS = ['fileMenu', 'editMenu', 'viewMenu', 'toolsMenu', 'sweepsMenu', 'helpMenu'];
let cmdDlg = null, cmdHits = [], cmdAt = 0;

// an item's own words: without its shortcut, its dot, its icon or a submenu's items
function cmdWords(n) {
  const c = n.cloneNode(true);
  for (const x of c.querySelectorAll('.k, .rt-dot, svg, .rt-menu')) x.remove();
  return c.textContent.replace(/\s+/g, ' ').trim();
}
export function commandList() {
  // the Edit menu's items as it would show them now
  for (const b of document.querySelectorAll('#editMenu [data-edit]')) b.disabled = !editCan(b.dataset.edit);
  for (const k of ['Undo', 'Redo']) document.getElementById('edit' + k).disabled = document.getElementById('btn' + k).disabled;
  const out = [];
  const walk = (menu, path) => {
    for (const n of menu.children) {
      if (n.hidden) continue;
      if (n.classList.contains('rt-sub')) { walk(n.querySelector(':scope > .rt-menu'), path.concat(cmdWords(n))); continue; }
      if (!n.matches('button, a') || n.dataset.click === 'btnCmd') continue;
      const k = n.querySelector('.k');
      out.push({ node: n, label: cmdWords(n), path, key: k ? k.textContent : '', off: !!n.disabled,
        need: n.classList.contains('rt-proneed') ? 'Pro' : n.classList.contains('rt-acctneed') ? 'Free account' : '' });
    }
  };
  for (const id of CMD_MENUS) {
    const menu = document.getElementById(id), top = document.querySelector('[aria-controls="' + id + '"]');
    if (menu) walk(menu, [top ? cmdWords(top) : '']);
  }
  return out;
}
// the parts and the examples, found only by what is typed (not listed with nothing typed)
export function findList() {
  const out = [];
  for (const pal of palettesOn()) for (const p of partsOf(pal)) out.push({ label: p.long, path: ['Add a part', PALETTE_NAMES[pal]], key: '', off: false, need: '', uses: PART_USES[p.key] || '', run: () => addPart(p.key) });
  for (const [group, , list] of EXAMPLES) for (const [id, t, , x] of list) if (!x || exp(x)) out.push({ label: t, path: ['Example', group], key: '', off: false, need: '', run: () => openDemo(id, true) });
  return out;
}
// the commands holding every word typed, those whose name starts with it first
export function commandFind(q, list) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean), Q = words.join(' ');
  if (!words.length) return list.slice();
  const hits = list.filter(c => { const t = (c.path.join(' ') + ' ' + c.label + ' ' + (c.uses || '')).toLowerCase(); return words.every(w => t.includes(w)); });
  const rank = c => { const l = c.label.toLowerCase(); return l.startsWith(Q) ? 0 : l.includes(Q) ? 1 : 2; };
  return hits.map((c, i) => [rank(c), i, c]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
}

function cmdFill() {
  const input = cmdDlg.querySelector('input'), ul = cmdDlg.querySelector('ul');
  cmdHits = commandFind(input.value, commandList());
  if (input.value.trim()) cmdHits = cmdHits.concat(commandFind(input.value, findList())).slice(0, 80);
  cmdAt = Math.max(0, cmdHits.findIndex(c => !c.off));
  ul.replaceChildren(...cmdHits.map((c, i) => h('li', { role: 'option', id: 'cmd' + i, class: (c.off ? 'off' : '') + (i === cmdAt ? ' at' : ''), 'aria-selected': i === cmdAt ? 'true' : 'false', 'aria-disabled': c.off ? 'true' : null,
    onclick: () => cmdRun(i), onmousemove: () => cmdMark(i) },
    h('span', { class: 'rt-cmdpath' }, c.path.join(' › ')), h('span', { class: 'rt-cmdname' }, c.label),
    c.need ? h('span', { class: 'rt-cmdneed ' + (c.need === 'Pro' ? 'pro' : 'acct') }, c.need) : null,
    c.key ? h('span', { class: 'k' }, c.key) : null)));
  if (!cmdHits.length) ul.append(h('li', { class: 'rt-cmdnone' }, 'Nothing matches. Try “export”, “sweep” or “designer”.'));
  input.setAttribute('aria-activedescendant', cmdHits.length ? 'cmd' + cmdAt : '');
}
function cmdMark(i) {
  if (i === cmdAt) return;
  const ul = cmdDlg.querySelector('ul'), was = ul.children[cmdAt], now = ul.children[i];
  if (was) { was.classList.remove('at'); was.setAttribute('aria-selected', 'false'); }
  if (now) { now.classList.add('at'); now.setAttribute('aria-selected', 'true'); now.scrollIntoView({ block: 'nearest' }); }
  cmdAt = i; cmdDlg.querySelector('input').setAttribute('aria-activedescendant', 'cmd' + i);
}
function cmdRun(i) {
  const c = cmdHits[i];
  if (!c || c.off) return;
  cmdDlg.close();
  // after the dialog has gone, so what it opens (a menu's dialog, a submenu's export) is not shut with it
  setTimeout(() => c.run ? c.run() : c.node.click());
}
export function openCommands(q) {
  if (!cmdDlg) {
    const input = h('input', { type: 'search', placeholder: 'Search commands, parts and examples: export, lens, Michelson…', 'aria-label': 'Search commands', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'cmdList', autocomplete: 'off', spellcheck: 'false' });
    input.addEventListener('input', cmdFill);
    input.addEventListener('keydown', e => {
      const step = d => { for (let j = cmdAt + d; j >= 0 && j < cmdHits.length; j += d) if (!cmdHits[j].off) return cmdMark(j); };
      if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); cmdRun(cmdAt); }
      else if (e.key === 'Escape') { e.preventDefault(); cmdDlg.close(); }   // at once (a search box would only clear its text first)
    });
    cmdDlg = h('dialog', { class: 'rt-dialog rt-cmd', id: 'cmdDialog', 'aria-label': 'Search commands' },
      h('div', { class: 'rt-cmdbox' }, input), h('ul', { id: 'cmdList', role: 'listbox', 'aria-label': 'Commands' }));
    cmdDlg.addEventListener('click', e => { if (e.target === cmdDlg) cmdDlg.close(); });   // a click outside the box
    document.body.append(cmdDlg);
  }
  const input = cmdDlg.querySelector('input');
  input.value = q || '';
  cmdFill();
  if (!cmdDlg.open) cmdDlg.showModal();
  input.focus(); input.select();
}

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wireCommands() {
  document.getElementById('btnCmd').addEventListener('click', () => openCommands(''));
  document.addEventListener('keydown', e => {
    if (EMBED || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k') return;
    const open = document.querySelector('dialog[open]');
    if (open && open !== cmdDlg) return;
    e.preventDefault();
    openCommands('');
  });
}
