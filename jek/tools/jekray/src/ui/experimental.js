import { TEST_MODE } from '../core/constants.js';
import { EXPERIMENTAL, expRead, expWrite } from '../core/exp-list.js';
import { PALETTE_GROUPS, PALETTE_PARTS, pickerRows } from '../parts/registry.js';
import { V, project, selectOne } from '../state/project.js';
import { makeElement, normElement, selected } from '../state/elements.js';
import { STL_UNITS, meshCache, meshEncode, meshHullCache, parseSTL } from '../core/stl.js';
import { DPR, H, W, asOnBench, benchBg, canvas, ctx, draw, halfSize, requestRender, setCtx, setDPR, setH, setW, wx, wy } from './render.js';
import { snapVal } from './pointer.js';
import { V3D } from './view3d.js';
import { renderPanel } from './panel.js';
import { h } from './dom.js';
import { addElement, changed, toast } from './actions.js';
import { checkpoint } from './tabs.js';
import { layoutPalette, railRecent } from './rail.js';
import { accountShown } from '../io/account.js';
import { modsSync } from '../io/mods.js';
import { track } from '../io/usage.js';

/* ==========================================================================
   Wiring
   ========================================================================== */

/* ---------- Experimental features ----------
   New features start here, off until someone switches them on, then move to beta (a Beta
   badge on their examples), then into the tool proper. The switch is kept in this browser.
   To add one: list it in EXPERIMENTAL, and have its code ask exp('its key'): a part for the
   Add row takes the key as exp on its picker entry (parts/<type>.js), an example as a fourth entry in its
   EXAMPLES line, and anything else (a panel section, a readout, a model) tests exp() where it
   would appear. A bench that uses one still opens and traces with the switch off: only what
   offers it (the Add row, the gallery, the panels) keeps it out of sight. */
/* (the list, and the store every app shares: core/exp-list.js) */

// the master switch, and each feature's own tick (ticked unless unticked): a feature is on when both are; as this
// browser keeps them, followed as they change (JEKsuite sets them: followExperimental)
export let expOn = expRead().on;
export let expPicks = expRead().picks;
export const expPicked = key => expPicks[key] !== false;
// experimental features need an account (free or JEKrayPro): the gate says why they are not available (not signed in), or ''
// when they are; set by the cloud module once accounts are up (the tests, and a build without accounts, are not gated)
let expGate = () => '';
export const expWhy = () => (TEST_MODE ? '' : expGate() || '');
export function setExpGate(fn) { expGate = fn; const dot = document.getElementById('expDot'); if (dot) dot.hidden = !(expOn && !expWhy()); expMenuShown(); }
/* the menu items that belong to an experimental feature: shown with it */
export function expMenuShown() { const b = document.getElementById('btnRayLook'); if (b) b.hidden = !exp('raylook'); }
export const exp = key => expOn && !expWhy() && expPicked(key) && EXPERIMENTAL.some(f => f.key === key);
export function setExperimental(on, picks) {
  if (on !== undefined && on !== null && !!on !== expOn) track('experimental', on ? 'on' : 'off');
  if (on !== undefined && on !== null) expOn = !!on;
  if (picks) for (const f of EXPERIMENTAL) if (f.key in picks) expPicks[f.key] = !!picks[f.key];
  expWrite(expOn, expPicks);
  expShown();
}
/* the switch or a tick changed in another tab (JEKsuite's, where they are set): this page follows */
export function followExperimental() {
  const S = expRead();
  expOn = S.on; expPicks = S.picks;
  expShown();
}
function expShown() {
  const dot = document.getElementById('expDot');
  if (dot) dot.hidden = !(expOn && !expWhy());
  modsSync(); expMenuShown();
  layoutPalette(); renderPanel(); requestRender();
  if (typeof accountShown === 'function') accountShown();
}
/* The Add row: a palette of free-space optics or of fibre components, as buttons, as many
   as fit on the row; the rest in More. The palette switch is the button before them: orange for free space, red for fibre. */
/* (each palette's rows are its parts' own picker entries, parts/registry.js PALETTE_PARTS; read when asked: the registry
   loads after this on the dev page) */
export const PALETTES = {
  get free() { return pickerRows(PALETTE_PARTS.free); },
  get fibre() { return pickerRows(PALETTE_PARTS.fibre); },
  get elec() { return pickerRows(PALETTE_PARTS.elec); },
  get rf() { return pickerRows(PALETTE_PARTS.rf); },
  get pic() { return pickerRows(PALETTE_PARTS.pic); },
};
export let palette = (() => { try { const pv = localStorage.getItem('jek-raytracer-palette'); return pv === 'fibre' || pv === 'pic' || pv === 'elec' || pv === 'rf' || pv === 'draw' ? pv : 'free'; } catch (err) { return 'free'; } })();   // (a private window: free space)
export function assignPalette(v) { return (palette = v); }
/* The parts, two ways in: a picker (+ Add part, or A or /) with a search, a tab for each palette and
   the parts in groups, each with its symbol as the bench draws it; and a rail down the bench's left
   edge, a button for each group, its parts in a flyout. Either way a part is clicked to add it at
   the middle of the view, or dragged onto the bench to put it there. */
export const PALETTE_NAMES = { free: 'Free space', fibre: 'Fibre', elec: 'Circuits', rf: 'RF', pic: 'Photonic', draw: 'Draw' };
/* (and its groups the parts' own, PALETTE_GROUPS) */
export const PART_GROUPS = {
  get free() { return PALETTE_GROUPS.free; },
  get fibre() { return PALETTE_GROUPS.fibre; },
  get rf() { return PALETTE_GROUPS.rf; },
  get pic() { return PALETTE_GROUPS.pic; },
  get elec() { return PALETTE_GROUPS.elec; },
};
export const palettesOn = () => Object.keys(PALETTES).filter(p => (p !== 'pic' || exp('pic')) );
export const partsOf = pal => PALETTES[pal].filter(it => !it[3] || exp(it[3])).map(([key, short, long]) => ({ key, short, long: long || short, pal }));
// a palette's parts in their groups; any not listed in a group under Other
export function partGroups(pal) {
  const items = partsOf(pal), by = new Map(items.map(p => [p.key, p])), used = new Set(), out = [];
  for (const [name, keys] of PART_GROUPS[pal] || []) { const g = keys.map(k => by.get(k)).filter(Boolean); g.forEach(p => used.add(p.key)); if (g.length) out.push({ name, parts: g }); }
  const rest = items.filter(p => !used.has(p.key));
  if (rest.length) out.push({ name: 'Other', parts: rest });
  return out;
}
/* a part's symbol, drawn as the bench draws it (on the bench's own colour), once per part and theme */
const partIcons = new Map();
export function partIcon(key) {
  const theme = benchBg(), ck = key + '|' + theme;
  if (partIcons.has(ck)) return partIcons.get(ck);
  if (!project) return '';
  const N = 48, cv = document.createElement('canvas');
  cv.width = cv.height = N * 2;
  const c = cv.getContext('2d');
  c.setTransform(2, 0, 0, 2, 0, 0); c.fillStyle = theme; c.fillRect(0, 0, N, N);
  const keep = { ctx, W, H, DPR, view: project.view, names: project.elements };
  let url = '';
  try {
    const el = makeElement(key, 0, 0);
    if (el) {
      const r = Math.max(halfSize(el), el.type === 'fcomp' || el.type === 'elec' || el.type === 'pic' ? 9 : 0, el.type === 'source' ? 14 : 0, 4);
      setCtx(c); setW(N); setH(N); setDPR(2); project.view = { cx: el.x, cy: el.y, scale: N * 0.4 / r };
      asOnBench(() => draw(el));
      url = cv.toDataURL();
    }
  } catch (err) { url = ''; } finally { setCtx(keep.ctx); setW(keep.W); setH(keep.H); setDPR(keep.DPR); project.view = keep.view; }
  partIcons.set(ck, url);
  return url;
}
const RECENT_KEY = 'jek-raytracer-recent-parts';
export const recentParts = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter(k => palettesOn().some(p => partsOf(p).some(q => q.key === k))); } catch (err) { return []; } };
/* add a part: in the middle of the view, or where it was dropped (screen point) */
/* An STL object onto the bench, from a file: where it was dropped (or the middle of the view),
   resting on the breadboard. el, if given, has its mesh replaced instead. */
export function stlElement(T, name, x, y, units, o) {
  o = o || {};                                    // from a STEP file: its triangle budget, height, file and colour
  const mesh = meshEncode(T, o.file || name, o.budget), u = units || 'mm', sc = STL_UNITS[u] || 1;
  return normElement(Object.assign({ type: 'stl', name: name.replace(/\.(stl|step|stp)$/i, '').slice(0, 60) || 'STL object', x, y, angle: 0, z: Math.max(0, o.z !== undefined ? o.z : mesh.size[2] * sc / 2), mesh, units: u }, o.colour ? { colour: o.colour } : {}));
}
export function importStl(file, at, el) {
  const fr = new FileReader();
  fr.onload = () => {
    let T;
    try { T = parseSTL(fr.result); } catch (err) { toast(err.message, true); return; }
    checkpoint();
    if (el) {
      el.mesh = meshEncode(T, file.name); meshCache.delete(el.id); meshHullCache.delete(el.id);
      toast('Replaced ' + el.name + '\u2019s shape: ' + el.mesh.n + ' triangles' + (el.mesh.orig ? ' (simplified from ' + el.mesh.orig + ')' : ''));
    } else {
      let x = V().cx, y = V().cy;
      if (at) { const r = canvas.getBoundingClientRect(), q = V3D.active() ? V3D.tablePoint(at[0], at[1]) : [wx(at[0] - r.left), wy(at[1] - r.top)]; if (q) [x, y] = q; }
      el = stlElement(T, file.name, snapVal(x), snapVal(y));
      el.bench = project.tab;
      project.elements.push(el);
      selectOne(el.id);
      const kb = Math.round(el.mesh.data.length / 1024);
      toast('Brought in ' + el.name + ': ' + el.mesh.n + ' triangles' + (el.mesh.orig ? ' (simplified from ' + el.mesh.orig + ', to detail of ' + el.mesh.cell + ' file units, so it saves with the bench)' : '') + ', taken as millimetres, resting on the breadboard' + (kb > 1024 ? ' (' + (kb / 1024).toFixed(1) + ' MB with the bench: a share link to it will be long)' : ''));
    }
    changed(true);
  };
  fr.onerror = () => toast('Could not read ' + file.name, true);
  fr.readAsArrayBuffer(file);
}
export function addPart(key, at) {
  addElement(key); track('part', key);
  const el = selected();
  if (el && at) {
    const r = canvas.getBoundingClientRect(), q = V3D.active() ? V3D.tablePoint(at[0], at[1]) : [wx(at[0] - r.left), wy(at[1] - r.top)];
    if (q) { el.x = snapVal(q[0]); el.y = snapVal(q[1]); changed(true); }
  }
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([key, ...recentParts().filter(k => k !== key)].slice(0, 8))); } catch (err) { /* not kept: fine */ }
  railRecent();
}
export const PART_DRAG = 'application/x-jekray-part';
// a part's tile: its symbol and name; clicked to add, dragged onto the bench
export function partTile(p, onAdd, where) {
  const img = h('img', { alt: '', src: partIcon(p.key), width: '48', height: '48' });
  const b = h('button', { type: 'button', class: 'rt-ptile ' + p.pal, 'data-add': p.key, title: p.long, draggable: 'true' }, img, h('span', null, p.short, where ? h('small', null, PALETTE_NAMES[p.pal]) : null));
  b.addEventListener('click', e => { e.stopPropagation(); onAdd(p.key, e); });
  b.addEventListener('dragstart', e => { e.dataTransfer.setData(PART_DRAG, p.key); e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setDragImage(img, 24, 24); });
  return b;
}
