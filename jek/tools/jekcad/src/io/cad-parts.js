import { hooks } from '../../../jekray/src/core/hooks.js';
import { h } from '../../../jekray/src/ui/dom.js';
import { designPro } from '../../../jekray/src/ui/pro.js';
import { account, api } from '../../../jekray/src/io/account.js';
import { normDoc, partLook } from '../core/doc.js';
import { sketchId } from '../core/sketch.js';
import { app, changed, checkpoint, editGate, on, toast } from '../ui/app.js';
import { addInstance, renderTabs, studioParts } from '../ui/assembly.js';
import { cloudOn, personalWs } from './cloud.js';

/* ==========================================================================
   JEKcad's parts in My parts: the library JEKray keeps its parts in (the API's /v1/workspaces/:w/parts), each
   marked 'cad' so JEKray leaves it off its benches. A part is kept with the whole Part Studio it is made in
   ({ format: 'jekcad-part', part, studio }), from the part's ⋯ menu in the Part Studio (Save to My parts…: JEKrayPro,
   as JEKray's). An Assembly's Insert lists them under My parts: inserting one brings its Part Studio into the
   document as a tab of its own (named after the part, a copy to change as any other), once for each version kept,
   and puts the part in the assembly.
   ========================================================================== */
const MINE_MAX = 250 * 1024;
const MINE_SEEN = new Map();   // a part's id → its content, as last fetched (by its updated_at)
const cadMineWs = () => (cloudOn() && personalWs() ? personalWs().id : null);
/* a small square picture of the view, for the library's card (a PNG of at most 24 KB, or none) */
function cadMineIcon() {
  try {
    const cv = document.getElementById('view');
    if (!cv || !cv.width || !cv.height) return null;
    for (const N of [64, 48]) {
      const o = document.createElement('canvas'); o.width = o.height = N;
      const s = Math.min(cv.width, cv.height);
      o.getContext('2d').drawImage(cv, (cv.width - s) / 2, (cv.height - s) / 2, s, s, 0, 0, N, N);
      const url = o.toDataURL('image/png');
      if (url.length <= 24000) return url;
    }
  } catch (err) { /* no picture */ }
  return null;
}
/* the part as kept: its Part Studio whole (as the document holds it), and which of its parts it is */
export function cadMineContent(tab, part) {
  const { id, kind, mine, ...studio } = tab; void id; void kind; void mine;
  const text = JSON.stringify({ format: 'jekcad-part', version: 1, part, studio });
  return text.length <= MINE_MAX ? text : null;
}
/* Save to My parts… on a part of the Part Studio open */
export async function keepCadPart(part, name) {
  const tab = app.file.tabs.find(t => t.id === app.file.active);
  if (!tab || tab.kind !== 'studio') return null;
  if (!designPro('keep parts in My parts')) return null;
  const ws = cadMineWs();
  if (!ws) return null;
  const nm = prompt('Name it, to find it again in My parts', name || 'Part');
  if (nm === null) return null;
  const content = cadMineContent(tab, part);
  if (!content) { toast('Too big to keep as a part (a part can be at most 256 KB).', true); return null; }
  try {
    const p = await api('/v1/workspaces/' + ws + '/parts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nm.trim() || name || 'Part', summary: 'Part of ' + tab.name, palette: 'cad', content, icon: cadMineIcon() }) });
    toast('Kept “' + p.name + '” in My parts: an Assembly’s Insert lists it');
    return p;
  } catch (err) {
    toast(err.status === 402 ? 'My parts comes with JEKrayPro: subscribe from the account menu' : 'Could not keep it: ' + err.message, true);
    return null;
  }
}
/* the JEKcad parts in My parts (none when signed out, or the API cannot be reached) */
export async function cadMineList() {
  const ws = cadMineWs();
  if (!ws) return null;
  const r = await api('/v1/workspaces/' + ws + '/parts');
  return (r.parts || []).filter(p => p.palette === 'cad');
}
/* a part from My parts put in the open Assembly: its Part Studio a tab of the document (the one brought in before,
   if it is of the same version), the part an instance of it */
export async function insertCadPart(p) {
  if (!app.asm || !editGate()) return null;
  let c = MINE_SEEN.get(p.id);
  if (!c || c.at !== p.updated_at) {
    const got = await api('/v1/parts/' + p.id);
    let d = null; try { d = JSON.parse(got.content); } catch (err) { d = null; }
    if (!d || d.format !== 'jekcad-part' || !d.studio) { toast('“' + p.name + '” is not a JEKcad part', true); return null; }
    c = { at: got.updated_at || p.updated_at, d };
    MINE_SEEN.set(p.id, c);
  }
  if (!app.asm) return null;
  let tab = app.file.tabs.find(t => t.kind === 'studio' && t.mine && t.mine.id === p.id && t.mine.at === c.at);
  if (!tab) {
    checkpoint();
    const n = app.file.tabs.filter(t => t.kind === 'studio' && t.name === p.name).length;
    tab = Object.assign(normDoc(c.d.studio), { id: sketchId('t'), kind: 'studio', name: p.name + (n ? ' ' + (n + 1) : ''), mine: { id: p.id, at: c.at } });
    app.file.tabs.push(tab);
    changed(); renderTabs();
  }
  const parts = await studioParts(tab);
  if (!parts || !parts.length) { toast('The Part Studio of “' + p.name + '” has no parts now', true); return null; }
  const part = parts.some(x => x.id === c.d.part) ? c.d.part : parts[0].id;
  const id = addInstance(tab.id, part);
  if (id) toast('Put in ' + partLook(tab, part, parts.findIndex(x => x.id === part)).name + ', from My parts: its Part Studio is the tab “' + tab.name + '”');
  return id;
}
/* the Insert dialog's My parts rows */
async function cadMineRows() {
  const head = h('h3', { class: 'cad-shead' }, 'My parts');
  if (!account || !cloudOn()) return [head, h('p', { class: 'rt-subsmall' }, 'Sign in to insert parts kept in My parts.')];
  let list;
  try { list = await cadMineList(); } catch (err) { return [head, h('p', { class: 'rt-subsmall' }, 'My parts could not be reached: ' + err.message)]; }
  if (!list || !list.length) return [head, h('p', { class: 'rt-subsmall' }, 'None kept yet: in a Part Studio, a part’s ⋯ menu has Save to My parts.')];
  return [head, ...list.map(p => h('button', { type: 'button', class: 'rt-btn cad-insrow', 'data-mine': p.id, title: p.summary || '',
    onclick: async e => { const b = e.currentTarget; b.disabled = true; try { await insertCadPart(p); } catch (err) { toast('Could not insert it: ' + err.message, true); } finally { b.disabled = false; } } },
    p.icon ? h('img', { class: 'cad-insicon', src: p.icon, alt: '' }) : h('span', { class: 'cad-swatch' }), p.name, h('span', { class: 'rt-subsmall' }, ' ' + (p.summary || '')))) ];
}
export function wireCadParts() {
  hooks.cadMineRows = cadMineRows;
  on('keepPart', x => { keepCadPart(x.id, x.name); });
}
