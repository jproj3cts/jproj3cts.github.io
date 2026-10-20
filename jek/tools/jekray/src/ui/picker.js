import { EMBED } from '../core/constants.js';
import { PACKS } from '../state/packs.js';
import { h } from './panel.js';
import { typingIn } from './actions.js';
import { PALETTE_NAMES, addPart, palette, palettesOn, partGroups, partTile, partsOf, recentParts } from './experimental.js';
import { setPalette } from './rail.js';
import { MINE, loadMine, mineBody, mineChanged, mineOn, mineTile, placeMine } from './myparts.js';
import { packHits, packTile, packsBody } from '../io/packs.js';

/* ---------- the picker ---------- */
export const picker = h('div', { class: 'rt-picker', id: 'picker', role: 'dialog', 'aria-label': 'Add a part', hidden: '' });
export let pickTab = 'free';
export function setPickTab(v) { return (pickTab = v); }
export function pickerShown(on) {
  if (!on) { picker.hidden = true; document.getElementById('btnAddPart').setAttribute('aria-expanded', 'false'); return; }
  if (!palettesOn().includes(pickTab) && !(pickTab === 'mine' && mineOn())) pickTab = 'free';
  if (mineOn()) loadMine().then(() => { if (!picker.hidden && pickTab === 'mine') mineChanged(); });
  const r = document.getElementById('btnAddPart').getBoundingClientRect();
  picker.style.top = Math.round(r.bottom + 4) + 'px';
  picker.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - Math.min(660, window.innerWidth - 16) - 8))) + 'px';
  picker.hidden = false; document.getElementById('btnAddPart').setAttribute('aria-expanded', 'true');
  fillPicker('');
}
export function fillPicker(q) {
  const search = h('input', { type: 'search', class: 'rt-psearch', placeholder: 'Search all parts (Enter adds the first)', 'aria-label': 'Search parts', value: q });
  const body = h('div', { class: 'rt-pbody' });
  const add = (key, e) => { addPart(key); if (!e || !e.shiftKey) pickerShown(false); };
  const show = () => {
    const t = search.value.trim().toLowerCase();
    body.replaceChildren();
    if (t) {
      // every palette's parts whose name has each word typed
      const words = t.split(/\s+/), hits = palettesOn().flatMap(pal => partsOf(pal)).filter(p => words.every(w => (p.short + ' ' + p.long + ' ' + PALETTE_NAMES[p.pal]).toLowerCase().includes(w)));
      const mine = mineOn() && MINE.list ? MINE.list.filter(p => words.every(w => (p.name + ' ' + p.summary).toLowerCase().includes(w))) : [];
      if (mine.length) body.append(h('h4', null, 'My parts'), h('div', { class: 'rt-pgrid' }, ...mine.map(p => mineTile(p, e => { if (!e.shiftKey) pickerShown(false); }))), hits.length ? h('h4', null, 'Parts') : null);
      const ph = packHits(words);
      if (ph.length) body.append(h('h4', null, 'From packs'), h('div', { class: 'rt-pgrid' }, ...ph.map(({ pk, i }) => packTile(pk, i, e => { if (!e.shiftKey) pickerShown(false); }))), hits.length ? h('h4', null, 'Parts') : null);
      if (hits.length) body.append(h('div', { class: 'rt-pgrid' }, ...hits.map(p => partTile(p, add, true))));
      else if (!mine.length && !ph.length) body.append(h('p', { class: 'rt-pnone' }, 'No part matches “' + search.value.trim() + '”.'));
      return;
    }
    if (pickTab === 'mine') {
      body.append(...mineBody(e => { if (!e.shiftKey) pickerShown(false); }));
      return;
    }
    if (pickTab === 'packs') {
      body.append(...packsBody(e => { if (!e.shiftKey) pickerShown(false); }));
      return;
    }
    const rec = recentParts().map(k => palettesOn().flatMap(partsOf).find(p => p.key === k)).filter(Boolean);
    if (rec.length) body.append(h('h4', null, 'Recent'), h('div', { class: 'rt-pgrid' }, ...rec.map(p => partTile(p, add, p.pal !== pickTab))));
    for (const g of partGroups(pickTab)) body.append(h('h4', null, g.name), h('div', { class: 'rt-pgrid' }, ...g.parts.map(p => partTile(p, add))));
  };
  search.addEventListener('input', show);
  search.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const b = body.querySelector('[data-add], [data-mine]'); if (b && b.dataset.mine) { const p = MINE.list.find(q => q.id === b.dataset.mine); if (p) { placeMine(p); if (!e.shiftKey) pickerShown(false); } } else if (b) add(b.dataset.add, e); }
    if (e.key === 'Escape') { pickerShown(false); document.getElementById('btnAddPart').focus(); }
    e.stopPropagation();
  });
  const tabs = h('div', { class: 'rt-ptabs', role: 'tablist' }, ...palettesOn().map(pal => {
    const b = h('button', { type: 'button', role: 'tab', class: 'rt-ptab ' + pal + (pal === pickTab ? ' on' : ''), 'aria-selected': pal === pickTab ? 'true' : 'false' }, PALETTE_NAMES[pal]);
    b.addEventListener('click', e => { e.stopPropagation(); pickTab = pal; setPalette(pal); search.value = ''; fillPicker(''); });
    return b;
  }), mineOn() ? h('button', { type: 'button', role: 'tab', class: 'rt-ptab mine' + (pickTab === 'mine' ? ' on' : ''), 'aria-selected': pickTab === 'mine' ? 'true' : 'false',
    onclick: e => { e.stopPropagation(); pickTab = 'mine'; search.value = ''; fillPicker(''); } }, '★ My parts') : null,
    PACKS.list.length ? h('button', { type: 'button', role: 'tab', class: 'rt-ptab packs' + (pickTab === 'packs' ? ' on' : ''), 'aria-selected': pickTab === 'packs' ? 'true' : 'false',
      onclick: e => { e.stopPropagation(); pickTab = 'packs'; search.value = ''; fillPicker(''); } }, 'Packs') : null);
  picker.replaceChildren(h('div', { class: 'rt-phead' }, search, h('button', { type: 'button', class: 'rt-pclose', 'aria-label': 'Close', onclick: () => pickerShown(false) }, '×')), tabs, body,
    h('p', { class: 'rt-pfoot' }, typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'Tap to add in the middle of the view, or drag onto the bench to put it there.' : 'Click to add in the middle of the view, Shift+click to add several, or drag onto the bench to put it there.'));
  show();
  search.focus();
}

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wirePicker() {
  document.querySelector('.rt-wrap').append(picker);

  // the right-click menu beside it, so it can open over the picker's own parts (Rename, Delete)
  document.querySelector('.rt-wrap').append(document.getElementById('ctxMenu'));

  pickTab = palette;                     // the palette the bench shows (settled once every module is loaded)

  document.getElementById('btnAddPart').addEventListener('click', e => { e.stopPropagation(); pickerShown(picker.hidden); });

  document.addEventListener('click', e => { if (!picker.hidden && !picker.contains(e.target) && !e.target.closest('#ctxMenu')) pickerShown(false); });

  document.addEventListener('keydown', e => {
    if (EMBED || e.ctrlKey || e.metaKey || e.altKey || typingIn(e.target) || document.querySelector('dialog[open]')) return;
    if (e.key === 'a' || e.key === 'A' || e.key === '/') { e.preventDefault(); pickerShown(true); }
    else if (e.key === 'Escape' && !picker.hidden) pickerShown(false);
  });

}
