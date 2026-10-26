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
  PALETTE_NAMES, PART_DRAG, addPart, assignPalette, exp, palette, palettesOn,
  partGroups, partIcon, partTile
} from './experimental.js';
import { addBtn, fillPicker, picker, pickerShown } from './picker.js';
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
/* the palettes: an icon and a line of what each holds, for the switcher and its list */
const PAL_ABOUT = { free: 'lenses, mirrors, lasers, screens', fibre: 'fibres, couplers, amplifiers, detectors', elec: 'sources, amplifiers, filters, scopes',
  rf: 'horns, RF lenses, reflectors', pic: 'waveguides, rings, couplers on a chip', draw: 'shapes, arrows and text' };
const PAL_ICON = { free: 'M2 10H18 M10 4C12 6 12 14 10 16C8 14 8 6 10 4Z', fibre: 'M2 14C6 14 6 6 10 6S14 14 18 14 M2.5 12.8A1.2 1.2 0 1 0 2.51 12.8 M17.5 12.8A1.2 1.2 0 1 0 17.51 12.8',
  elec: 'M2 10H5L7 6L10 14L13 6L15 10H18', rf: 'M3 7L9 10L3 13Z M12 6.5A5 5 0 0 1 12 13.5 M15 4.5A8 8 0 0 1 15 15.5',
  pic: 'M4 4H16V16H4Z M4 10H8A2 2 0 0 1 12 10H16 M10 8V4', draw: 'M4 16L5 12L13 4L16 7L8 15Z M11 6L14 9' };
function palIcon(pal) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true');
  p.setAttribute('d', PAL_ICON[pal] || ''); svg.append(p);
  return svg;
}
const palMenu = h('div', { class: 'rt-palmenu', role: 'menu', 'aria-label': 'Palettes', hidden: '' });
function palMenuShown(on) {
  const sw = document.getElementById('palSwitch');
  if (!on || !sw) { palMenu.hidden = true; if (sw) sw.setAttribute('aria-expanded', 'false'); return; }
  flyShown(null);
  const list = [...palettesOn(), ...(V3D.active() ? [] : ['draw'])];
  palMenu.replaceChildren(...list.map(pal => {
    const b = h('button', { type: 'button', role: 'menuitemradio', class: pal + (pal === palette ? ' on' : ''), 'aria-checked': pal === palette ? 'true' : 'false' },
      palIcon(pal), h('span', null, h('b', null, PALETTE_NAMES[pal]), h('small', null, PAL_ABOUT[pal])));
    b.addEventListener('click', e => { e.stopPropagation(); palMenuShown(false); setPalette(pal); const n = document.getElementById('palSwitch'); if (n) n.focus(); });
    return b;
  }));
  const sr = stage.getBoundingClientRect(), br = sw.getBoundingClientRect();
  palMenu.style.top = Math.max(4, br.top - sr.top) + 'px';
  palMenu.hidden = false; sw.setAttribute('aria-expanded', 'true');
  const cur = palMenu.querySelector('.on') || palMenu.querySelector('button'); if (cur) cur.focus();
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
  // its palette: one switcher showing the one in use, opening a list of them, each with a line of what it holds
  const sw = h('button', { type: 'button', class: 'rt-rswitch ' + palette, id: 'palSwitch', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    title: PALETTE_NAMES[palette] + ': ' + PAL_ABOUT[palette] + ' (change the palette)', 'aria-label': 'Palette: ' + PALETTE_NAMES[palette] + '. Change it' }, palIcon(palette), h('span', null, PALETTE_NAMES[palette]));
  sw.addEventListener('click', e => { e.stopPropagation(); palMenuShown(palMenu.hidden); });
  const pals = h('div', { class: 'rt-rpals' }, sw);
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
  // My parts, for the signed in
  let star = null;
  if (mineOn()) {
    star = h('button', { type: 'button', class: 'rt-rgroup rt-rall rt-rmine', title: 'My parts: the parts you have kept', 'aria-label': 'My parts' }, '★');
    star.addEventListener('click', e => { e.stopPropagation(); const open = flyFor !== star; flyShown(star, { mine: true }); if (open && MINE.list === null) loadMine().then(() => { if (flyFor === star) { flyFor = null; flyShown(star, { mine: true }); } }); });
  }
  rail.replaceChildren(addBtn, pals, ...groups, ...[star].filter(Boolean));
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

  // the palettes' list: closed by a click elsewhere or Escape; Up and Down walk it
  stage.append(palMenu);
  document.addEventListener('click', e => { if (!palMenu.hidden && !palMenu.contains(e.target)) palMenuShown(false); });
  palMenu.addEventListener('keydown', e => {
    const items = [...palMenu.querySelectorAll('button')], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); palMenuShown(false); const n = document.getElementById('palSwitch'); if (n) n.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
  });

  document.addEventListener('click', e => { if (!flyout.hidden && !flyout.contains(e.target) && !e.target.closest('#ctxMenu')) flyShown(null); });

  document.getElementById('btnHoles').addEventListener('click', () => {
    project.style = Object.assign({}, project.style);
    if (benchHoles()) project.style.holes = false; else delete project.style.holes;
    benchStyleShown(); scheduleSave(); requestRender();
  });

  benchStyleShown();
  document.addEventListener('rt-theme', () => fillRail());

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
