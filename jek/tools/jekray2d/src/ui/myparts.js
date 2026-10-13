import { typeLabel } from '../state/project.js';
import { STL_KEEP, meshEncode, meshTris } from '../core/stl.js';
import { V, canvas, draw, getCss, halfSize, requestRender, selection, wx, wy } from './render.js';
import { snapVal } from './pointer.js';
import { V3D } from './view3d.js';
import { h } from './panel.js';
import { clipOf, pasteClip, showCtxMenu, toast } from './actions.js';
import { PALETTE_NAMES, PART_DRAG } from './experimental.js';
import { fillPicker, picker, pickerShown } from './picker.js';
import { fillRail, flyShown } from './rail.js';
import { api, showSubscribe } from '../io/account.js';
import { cloudOn, cloudPlace, fillHome, openHome, personalWs } from '../io/cloud.js';
import { openZmx } from './tours.js';
// Shared mutable state read or set here, not yet imported (see state/shared.md): DPR, H, W, account, ctx, exporting, extraSel, project, selectedId

/* ---------- My parts (JEKrayPro) ----------
   Parts and assemblies kept in the account, to use on any bench and any computer: one element
   or several, with the fibres between them, as copy and paste carries them. Kept from the
   right-click menu (Save to My parts) or the picker's My parts tab, and offered there, in the
   picker's search, and behind the rail's star; clicked to add, or dragged onto the bench. */
export const MINE = { list: null, ws: null, active: false, busy: null, content: new Map() };
export function mineOn() { try { return cloudOn(); } catch (err) { return false; } }   // a declaration: the rail asks before the account code below has run
export function loadMine(force) {
  if (!mineOn()) { MINE.list = null; return Promise.resolve(null); }
  const ws = personalWs().id;
  if (MINE.list && MINE.ws === ws && !force) return Promise.resolve(MINE.list);
  if (MINE.busy && !force) return MINE.busy;
  MINE.busy = api('/v1/workspaces/' + ws + '/parts')
    .then(r => { Object.assign(MINE, { list: r.parts, ws, active: !!r.active }); return r.parts; })
    .catch(() => MINE.list || [])
    .finally(() => { MINE.busy = null; });
  return MINE.busy;
}
export function mineChanged() {
  if (MINE.list) MINE.list.sort((a, b) => a.name.localeCompare(b.name));
  if (!document.getElementById('home').hidden && cloudPlace.view === 'parts') fillHome();
  if (!picker.hidden) fillPicker(picker.querySelector('.rt-psearch') ? picker.querySelector('.rt-psearch').value : '');
  fillRail();
}
export const palOf = el => el.type === 'fcomp' ? 'fibre' : el.type === 'elec' ? 'elec' : el.type === 'pic' ? 'pic' : el.mmw ? 'rf' : 'free';
// a picture of the elements together, as the bench draws them, for the library
export function clipIcon(list, N = 64) {
  const cv = document.createElement('canvas'); cv.width = cv.height = N * 2;
  const c = cv.getContext('2d');
  c.setTransform(2, 0, 0, 2, 0, 0); c.fillStyle = getCss('--rt-bench'); c.fillRect(0, 0, N, N);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const e of list) {
    const r = Math.max(halfSize(e), e.type === 'fcomp' || e.type === 'elec' || e.type === 'pic' ? 9 : 0, e.type === 'source' ? 14 : 0, 4);
    x0 = Math.min(x0, e.x - r); x1 = Math.max(x1, e.x + r); y0 = Math.min(y0, e.y - r); y1 = Math.max(y1, e.y + r);
  }
  const keep = { ctx, W, H, DPR, view: project.view, sel: selectedId, extra: extraSel, exporting };
  try {
    ctx = c; W = N; H = N; DPR = 2; selectedId = null; extraSel = new Set(); exporting = true;
    project.view = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale: N * 0.86 / Math.max(x1 - x0, y1 - y0, 1) };
    for (const e of list) draw(e);
    const url = cv.toDataURL('image/png');
    return url.length <= 24000 ? url : null;
  } catch (err) { return null; }
  finally { ctx = keep.ctx; W = keep.W; H = keep.H; DPR = keep.DPR; project.view = keep.view; selectedId = keep.sel; extraSel = keep.extra; exporting = keep.exporting; requestRender(); }
}
/* what a part keeps: the parts as copied, an STL object's mesh simplified further if need be
   to fit a part's 256 KB (the copy only: the one on the bench keeps its detail); null if it cannot */
const PART_MAX = 250 * 1024;
export function partContent(list) {
  const C = clipOf(list);
  let txt = JSON.stringify(C), budget = STL_KEEP;
  const meshes = (C.elements || []).filter(e => e.type === 'stl' && e.mesh);
  while (txt.length > PART_MAX && meshes.length && budget > 200) {
    budget = Math.floor(budget * Math.min(0.8, Math.sqrt(PART_MAX / txt.length)));
    for (const e of meshes) { const T = meshTris(e.mesh); if (T.length / 9 > budget) e.mesh = meshEncode(T, e.mesh.file, budget); }
    txt = JSON.stringify(C);
  }
  return txt.length <= PART_MAX ? txt : null;
}
export async function saveToMine(list) {
  if (!list.length) return;
  if (!mineOn()) { toast('Sign in, top right, to keep parts in My parts, with JEKrayPro', true); return; }
  const mine = account.workspaces.find(w => w.id === personalWs().id);
  if (!(mine && mine.active)) { showSubscribe(); toast('My parts comes with JEKrayPro'); return; }
  const one = list.length === 1;
  const name = prompt('Name it, to find it again in My parts', one ? list[0].name : list.length + ' parts: ' + list.slice(0, 3).map(e => e.name).join(', ') + (list.length > 3 ? '…' : ''));
  if (name === null) return;
  const icon = clipIcon(list) || clipIcon(list, 40);
  try {
    const content = partContent(list);
    if (!content) { toast('Too big to keep as a part (a part can be at most 256 KB).', true); return; }
    const p = await api('/v1/workspaces/' + personalWs().id + '/parts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() || undefined, summary: one ? typeLabel(list[0]) : list.length + ' parts', palette: palOf(list[0]), content, icon }) });
    if (MINE.list) MINE.list.push(p);
    mineChanged();
    toast('Kept “' + p.name + '” in My parts: find it under + Add part');
  } catch (err) {
    if (err.status === 402) { showSubscribe(); return; }
    toast('Could not keep it: ' + err.message, true);
  }
}
export async function placeMine(p, at) {
  try {
    const k = p.id + '@' + p.updated_at;
    let c = MINE.content.get(k);
    if (!c) { c = (await api('/v1/parts/' + p.id)).content; MINE.content.set(k, c); }
    const clip = JSON.parse(c);
    // a part of one element takes the name it is kept under, which a rename changes
    if (Array.isArray(clip.elements) && clip.elements.length === 1 && p.name) clip.elements[0].name = p.name;
    clip.from = null;                                   // not where it was copied from: never nudged
    let pt = [V().cx, V().cy];
    if (at) { const r = canvas.getBoundingClientRect(), q = V3D.active() ? V3D.tablePoint(at[0], at[1]) : [wx(at[0] - r.left), wy(at[1] - r.top)]; if (q) pt = [snapVal(q[0]), snapVal(q[1])]; }
    if (!pasteClip(clip, pt)) throw new Error('it is empty');
  } catch (err) { toast('Could not add “' + p.name + '”: ' + err.message, true); }
}
function manageMine(p, x, y) {
  const json = body => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  showCtxMenu(x, y, [
    { label: 'Add to the bench', fn: () => placeMine(p) },
    { label: 'Rename…', off: !MINE.active, fn: async () => {
      const name = (prompt('Rename the part', p.name) || '').trim();
      if (!name || name === p.name) return;
      try { Object.assign(p, await api('/v1/parts/' + p.id, Object.assign({ method: 'PATCH' }, json({ name })))); mineChanged(); }
      catch (err) { toast(err.status === 402 ? 'Renaming needs JEKrayPro.' : err.message, true); }
    } },
    { label: 'Delete…', fn: async () => {
      if (!confirm('Delete “' + p.name + '” from My parts? Benches it was added to keep their copies.')) return;
      try { await api('/v1/parts/' + p.id, { method: 'DELETE' }); MINE.list = MINE.list.filter(q => q.id !== p.id); mineChanged(); toast('Deleted “' + p.name + '”'); }
      catch (err) { toast(err.message, true); }
    } }]);
}
// a kept part's tile: its picture and name; clicked to add, dragged onto the bench, ⋯ or right-click for more
export function mineTile(p, after) {
  const img = h('img', { alt: '', src: p.icon || '', width: '48', height: '48' });
  const more = h('span', { class: 'rt-pmore', role: 'button', tabindex: '-1', 'aria-label': 'More for ' + p.name, title: 'Rename or delete' }, '⋯');
  const b = h('button', { type: 'button', class: 'rt-ptile mine ' + p.palette, 'data-mine': p.id, title: p.name + ' (' + p.summary + ')', draggable: 'true' },
    img, h('span', null, p.name, h('small', null, p.summary)), more);
  b.addEventListener('click', e => {
    e.stopPropagation();
    if (e.target === more) { const r = more.getBoundingClientRect(); manageMine(p, r.left, r.bottom + 2); return; }
    placeMine(p); if (after) after(e);
  });
  b.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); manageMine(p, e.clientX, e.clientY); });
  b.addEventListener('dragstart', e => { e.dataTransfer.setData(PART_DRAG, 'mine:' + p.id); e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setDragImage(img, 24, 24); });
  return b;
}
// the My parts tab of the picker, or the rail's flyout
function mineBody(after) {
  if (MINE.list === null) { loadMine().then(() => mineChanged()); return [h('p', { class: 'rt-pnone' }, 'Loading your parts…')]; }
  const sel = selection();
  const keep = h('button', { type: 'button', class: 'rt-btn rt-pkeep', disabled: sel.length ? null : '', onclick: e => { e.stopPropagation(); saveToMine(selection()); } },
    sel.length ? 'Keep the selection (' + sel.length + ') in My parts' : 'Select parts on the bench to keep them here');
  const zmx = h('button', { type: 'button', class: 'rt-btn rt-pzmx', title: 'Thorlabs, Edmund and other makers publish their lenses, mirrors and beam splitters as .zmx files',
    onclick: e => { e.stopPropagation(); if (!MINE.active) { showSubscribe(); return; } pickerShown(false); flyShown(null); openZmx(true); } }, 'Import .zmx files…');
  const manage = h('button', { type: 'button', class: 'rt-link rt-pmanage', onclick: e => { e.stopPropagation(); pickerShown(false); flyShown(null); Object.assign(cloudPlace, { view: 'parts', q: '', history: null, toParts: true }); openHome(); } }, 'Manage My parts ›');
  const out = [h('div', { class: 'rt-pkeeprow' }, keep, zmx, manage, MINE.active ? null : h('span', null, 'Keeping new parts needs JEKrayPro.'))];
  if (!MINE.list.length) {
    out.push(h('p', { class: 'rt-pnone' }, 'Nothing kept yet. Set up a part as you want it (a lens of your own, an imported Thorlabs part, a tuned laser) or a whole assembly, select it, then right-click and choose Save to My parts. It is then here on every bench, on any computer.'));
    return out;
  }
  for (const pal of ['free', 'fibre', 'elec', 'rf', 'pic']) {
    const ps = MINE.list.filter(p => p.palette === pal);
    if (ps.length) out.push(h('h4', null, PALETTE_NAMES[pal]), h('div', { class: 'rt-pgrid' }, ...ps.map(p => mineTile(p, after))));
  }
  return out;
}
