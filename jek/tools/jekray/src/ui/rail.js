import { EMBED, LOCKED } from '../core/constants.js';
import { project } from '../state/project.js';
import { PACKS } from '../state/packs.js';
import {
  benchHoles, benchStyleShown, labelSize, requestRender, selFibreId, selection, setSelFibreId,
  setSelection, stage
} from './render.js';
import { DRAW_TOOLS, drawIcon, drawTool, drawToolsShown, setDrawTool } from './drawings.js';
import { V3D } from './view3d.js';
import { h } from './panel.js';
import { addElement } from './actions.js';
import {
  PALETTE_NAMES, PALETTE_SHORT, PART_DRAG, addPart, assignPalette, exp, palette, palettesOn,
  partGroups, partIcon, partTile
} from './experimental.js';
import { fillPicker, picker, pickerShown, setPickTab } from './picker.js';
import { MINE, loadMine, mineBody, mineOn, placeMine } from './myparts.js';
import { placePackPart } from '../io/packs.js';
import { scheduleSave } from '../io/autosave.js';

/* ---------- the rail ---------- */
const RAIL_KEY = 'jek-raytracer-rail';
let railOn = (() => { try { return localStorage.getItem(RAIL_KEY) !== '0'; } catch (err) { return true; } })();   // (a private window: on)
export const rail = h('nav', { class: 'rt-rail', id: 'rail', 'aria-label': 'Parts' });
const flyout = h('div', { class: 'rt-flyout', hidden: '' });
let flyFor = null;
export function flyShown(btn, g) {
  if (!btn || flyFor === btn) { flyout.hidden = true; flyFor = null; rail.querySelectorAll('.on').forEach(b => b.classList.remove('on')); return; }
  flyFor = btn;
  rail.querySelectorAll('.rt-rgroup').forEach(b => b.classList.toggle('on', b === btn));
  if (g.mine) flyout.replaceChildren(h('h4', null, 'My parts'), ...mineBody(e => { if (!e.shiftKey) flyShown(null); }));
  else flyout.replaceChildren(h('h4', null, g.name), h('div', { class: 'rt-pgrid' }, ...g.parts.map(p => partTile(p, (key, e) => { addPart(key); if (!e.shiftKey) flyShown(null); }))));
  const sr = stage.getBoundingClientRect(), br = btn.getBoundingClientRect();
  flyout.hidden = false;
  flyout.style.top = Math.max(4, Math.min(br.top - sr.top, sr.height - flyout.offsetHeight - 8)) + 'px';
}
export function railRecent() { /* the rail's recent part, kept current as parts are added */ if (railOn) fillRail(); }
export function fillRail() {
  if (!project) { requestAnimationFrame(fillRail); return; }          // the bench is not loaded yet: its symbols are drawn once it is
  if (EMBED) { rail.hidden = true; return; }                          // an embedded bench is for looking at
  rail.hidden = !railOn; flyout.hidden = true; flyFor = null;
  document.getElementById('btnRailToggle').setAttribute('aria-checked', railOn ? 'true' : 'false');
  stage.classList.toggle('rail', railOn);
  if (!railOn) return;
  // its palette, a coloured button for each; then a button for each of that palette's groups, showing its first part
  const pals = h('div', { class: 'rt-rpals' }, ...[...palettesOn(), ...(V3D.active() ? [] : ['draw'])].map(pal => {   // drawings are 2D only
    const b = h('button', { type: 'button', class: 'rt-rpal ' + pal + (pal === palette ? ' on' : ''), title: PALETTE_NAMES[pal], 'aria-label': PALETTE_NAMES[pal] + ' parts', 'aria-pressed': pal === palette ? 'true' : 'false' }, PALETTE_SHORT[pal]);
    b.addEventListener('click', e => { e.stopPropagation(); setPalette(pal); });
    return b;
  }));
  // the Draw palette: its tools instead of groups of parts
  const groups = palette === 'draw' ? DRAW_TOOLS.map(([k, name, key, tip]) => {
    const b = h('button', { type: 'button', class: 'rt-rgroup rt-rtool draw', 'data-dtool': k, title: name + ' (' + key + '): ' + tip.replace(/^[^:]*: /, ''), 'aria-label': name, 'aria-pressed': 'false' }, drawIcon(k));
    b.addEventListener('click', e => { e.stopPropagation(); flyShown(null); setDrawTool(k); });
    return b;
  }) : partGroups(palette).map(g => {
    const b = h('button', { type: 'button', class: 'rt-rgroup ' + palette, title: g.name, 'aria-label': g.name }, h('img', { alt: '', src: partIcon(g.parts[0].key), width: '36', height: '36' }));
    b.addEventListener('click', e => { e.stopPropagation(); flyShown(b, g); });
    return b;
  });
  const more = h('button', { type: 'button', class: 'rt-rgroup rt-rall', title: 'All parts, with a search (A)', 'aria-label': 'All parts' }, '+');
  more.addEventListener('click', e => { e.stopPropagation(); setPickTab(palette); pickerShown(true); });
  // My parts, for the signed in
  let star = null;
  if (mineOn()) {
    star = h('button', { type: 'button', class: 'rt-rgroup rt-rall rt-rmine', title: 'My parts: the parts you have kept', 'aria-label': 'My parts' }, '★');
    star.addEventListener('click', e => { e.stopPropagation(); const open = flyFor !== star; flyShown(star, { mine: true }); if (open && MINE.list === null) loadMine().then(() => { if (flyFor === star) { flyFor = null; flyShown(star, { mine: true }); } }); });
  }
  rail.replaceChildren(pals, ...groups, ...[star, more].filter(Boolean));
  drawToolsShown();
}
export function setPalette(pal) {
  if (pal === 'draw' && palette !== 'draw' && typeof selection === 'function') {
    const keep = selection().filter(e => e.type === 'draw');
    if (keep.length !== selection().length || selFibreId) { setSelFibreId(null); assignPalette(pal); setSelection(keep); }
  }
  assignPalette(pal);
  if (pal !== 'draw' && drawTool !== 'select') setDrawTool('select');
  try { localStorage.setItem('jek-raytracer-palette', palette); } catch (err) { /* not kept: fine */ }
  fillRail();
}
/* the palettes offered change with the experimental switch */
export function layoutPalette() {
  if (palette === 'pic' && !exp('pic')) assignPalette('free');                                    // PIC hook
  fillRail();
  if (!picker.hidden) fillPicker('');
}
/* a part dragged from the picker or the rail onto the bench lands where it is dropped */

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wireRail() {
  stage.append(rail);

  stage.append(flyout);

  document.addEventListener('click', e => { if (!flyout.hidden && !flyout.contains(e.target) && !e.target.closest('#ctxMenu')) flyShown(null); });

  document.getElementById('btnHoles').addEventListener('click', () => {
    project.style = Object.assign({}, project.style);
    if (benchHoles()) project.style.holes = false; else delete project.style.holes;
    benchStyleShown(); scheduleSave(); requestRender();
  });

  benchStyleShown();

  document.getElementById('btnNamesUp').addEventListener('click', () => labelSize(1.25));

  document.getElementById('btnNamesDown').addEventListener('click', () => labelSize(0.8));

  document.getElementById('btnRailToggle').addEventListener('click', () => {
    railOn = !railOn;
    try { localStorage.setItem(RAIL_KEY, railOn ? '1' : '0'); } catch (err) { /* not kept: fine */ }
    fillRail(); requestRender();
  });

  layoutPalette();

  stage.addEventListener('dragover', e => { if (e.dataTransfer.types.includes(PART_DRAG)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });

  stage.addEventListener('drop', e => {
    const k = e.dataTransfer.getData(PART_DRAG);
    if (!k || LOCKED) return;
    e.preventDefault(); e.stopImmediatePropagation(); stage.classList.remove('drop'); pickerShown(false); flyShown(null);
    if (k.startsWith('mine:')) { const p = (MINE.list || []).find(q => 'mine:' + q.id === k); if (p) placeMine(p, [e.clientX, e.clientY]); }
    else if (k.startsWith('pack:')) { const m = /^pack:(.+):(\d+)$/.exec(k), pk = m && PACKS.list.find(p => p.id === m[1]); if (pk) placePackPart(pk, +m[2], [e.clientX, e.clientY]); }
    else addPart(k, [e.clientX, e.clientY]);
  }, true);

  document.querySelector('.rt-toolbar').addEventListener('click', e => { const b = e.target.closest('[data-add]'); if (b) addElement(b.dataset.add); });

}
