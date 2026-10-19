import { EMBED, TEST_MODE, cloud, cloudOpening, setCloud, setCloudOpening } from '../core/constants.js';
import { hooks } from '../core/hooks.js';
import { V, project } from '../state/project.js';
import { serialize } from '../state/elements.js';
import { onTab } from '../state/tabs.js';
import { setExporting } from '../engines/trace.js';
import { H, W, canvas, halfSize, render, requestRender, setThumbing, sx, sy } from '../ui/render.js';
import { helpLine, h } from '../ui/panel.js';
import { markUnsaved, setStatus, toast } from '../ui/actions.js';
import { openProjectData } from './open.js';
import { KIND_WORD, diffProject, merge3, resolve, showValue } from './merge.js';
import { PALETTE_NAMES, setExpGate } from '../ui/experimental.js';
import { fillRail } from '../ui/rail.js';
import { MINE, placeMine } from '../ui/myparts.js';
import { MENU_ICONS } from './packs.js';
import { openShortLink, shortUrl } from './share.js';
import {
  API_BASE, AUTH_OUTCOMES, account, accountShown, accountsOn, api, avatarNode, awaitPlan, fillAccount, setAccount,
  showSubscribe
} from './account.js';
import { keepSnapshot, scheduleSave } from './autosave.js';
import { newProject, openZmx } from '../ui/tours.js';
import { newLensDesign } from '../ui/assembly.js';
import { newRfDesign } from '../ui/rf-workspace.js';
import { openCoatDesign } from '../ui/coat-workspace.js';

/* ---------- Cloud benches ----------
   A bench opened from, or saved to, the cloud stays linked to it: `cloud` holds its id,
   workspace and the version this copy is based on. Edits save themselves at most every 30
   seconds, and at once when the tab is hidden; Save to cloud also keeps a version in its
   history. A save based on an older version than the cloud's is refused by the API (409),
   and the person chooses what to keep. Offline, the bench stays in this browser's autosave
   and goes up when the connection returns: the link and whether it has unsaved changes
   are kept with the autosave, so a reload picks up where it left off. */
const CLOUD_KEY = 'jek-cloud-link', CLOUD_EVERY = 30000, CLOUD_RETRY = 60000;
export let cloudTimer = null, cloudBusy = false, cloudAgain = false, cloudNote = '';
function cloudKeep() {
  if (TEST_MODE || EMBED) return;
  try { if (cloud) localStorage.setItem(CLOUD_KEY, JSON.stringify(cloud)); else localStorage.removeItem(CLOUD_KEY); } catch (err) { /* not kept: fine */ }
}
export function cloudLink(link) {
  if (cloud && (!link || link.id !== cloud.id)) leaseStop(cloud);
  setCloud(link); clearTimeout(cloudTimer);
  cloudKeep(); cloudSay(link ? 'Saved to the cloud' : '');
  cloudGates();
  leaseStart();
}
/* ---------- the editing lease ----------
   Whoever has a cloud bench open to edit holds its lease, renewed every minute while this page
   has it; a save against someone else's lease is refused by the API. Opening a bench someone
   else is editing shows who, and the bench here is theirs to look at: edits stay in this
   browser until they are done (the bench follows their saves), or you take over, or you work
   on a copy. A renewal also brings back the cloud's version, so a bench that moved on without
   this page is noticed within the minute. */
const LEASE_EVERY = 60000;
export const lease = { held: false, editing: null, timer: null };
async function leaseStart() {
  clearTimeout(lease.timer); lease.timer = null;
  Object.assign(lease, { held: false, editing: null });
  lockShow();
  if (!cloud || !cloudOn() || TEST_MODE) return;
  await leaseRenew();
}
async function leaseRenew(take) {
  const link = cloud;
  if (!link || !cloudOn()) return;
  let r;
  try { r = await api('/v1/benches/' + link.id + '/lease', Object.assign({ method: 'POST' }, jsonBody(take ? { take: true } : {}))); }
  catch (err) {
    if (cloud !== link) return;
    if (err.status === 404) { cloudSay(''); toast('That bench is no longer in the cloud (it may be in the bin). This copy is kept in this browser.', true); cloudLink(null); return; }
    if (err.status === 401) { setAccount(null); fillAccount(); return; }
  } finally {
    if (cloud === link) { clearTimeout(lease.timer); lease.timer = setTimeout(() => leaseRenew(), LEASE_EVERY); }
  }
  if (!r || cloud !== link) return;
  const was = lease.held;
  lease.held = r.held; lease.editing = r.editing && r.editing.id !== (account && account.user.id) ? r.editing : null;
  lockShow();
  // the cloud moved on (someone took over and saved, or another tab did): follow it when
  // nothing here would be lost, else say so and let the next save ask
  if (r.version > link.version) {
    if (!link.dirty) { try { keepSnapshot('Before following the cloud\u2019s newer version', true); await cloudOpen(link.id); toast((r.updated_by ? r.updated_by.name : 'Someone') + ' saved a newer version of this bench: it is shown now.'); } catch (err) { /* the next renewal tries again */ } }
    else if (was && !r.held) toast((r.updated_by ? r.updated_by.name : 'Someone') + ' took over this bench and saved it. Your changes here are not in the cloud: take it back, or work on a copy.', true);
  }
  if (!r.held && lease.editing) cloudSay('Not saved: ' + lease.editing.name + ' is editing');
  else if (was !== r.held && r.held) cloudSay(link.dirty ? 'Saving to the cloud…' : 'Saved to the cloud');
}
function leaseStop(link) {
  clearTimeout(lease.timer); lease.timer = null;
  if (!link || !cloudOn() || TEST_MODE || !lease.held) return;
  lease.held = false;
  fetch(API_BASE + '/v1/benches/' + link.id + '/lease', { method: 'DELETE', credentials: 'include', keepalive: true }).catch(() => {});
}
function lockShow() {
  const bar = document.getElementById('cloudLock');
  const on = !!(cloud && lease.editing && !lease.held);
  bar.hidden = !on;
  if (!on) return;
  const e = lease.editing;
  document.getElementById('cloudLockWho').replaceChildren(avatarNode(e));
  document.getElementById('cloudLockText').textContent = e.name + ' is editing this bench. You are looking at it: changes you make here stay in this browser.';
}
function cloudSay(text) {
  cloudNote = text;
  setStatus(cloud ? text : 'Autosaved in this browser');
}
export const cloudOn = () => accountsOn() && !!account;
/* why saving to the cloud, forking and keeping parts are not possible now: not signed in, or no plan anywhere the
   person can save (their own JEKrayPro, or a team with a plan); '' when they are */
export const proWhy = () => (!account ? 'Sign in, top right, to use the cloud' : newPlaces().some(w => w.active) ? '' : 'Needs JEKrayPro: subscribe from the account menu, or join a team with a plan');
/* the way to make it possible: the sign-in menu, or the subscribe dialog */
export function proFix() {
  // after the menu the click came from has closed
  setTimeout(() => { if (!account) { const b = document.getElementById('btnAcct'); if (b && document.getElementById('acctMenu').hidden) b.click(); } else showSubscribe(); });
}
/* a menu item present but greyed when it is not possible, saying why: clicked, it explains and offers the fix */
export function gateItem(el, why, badge) {
  const off = !!why;
  el.hidden = false;
  el.classList.toggle('rt-off', off);
  el.setAttribute('aria-disabled', off ? 'true' : 'false');
  if (el.dataset.title === undefined) el.dataset.title = el.title || '';
  el.title = off ? why : el.dataset.title;
  el.dataset.why = off ? why : '';
  let k = el.querySelector('.k.rt-why');
  if (off) { if (!k) { k = h('span', { class: 'k rt-why' }); el.append(k); } k.textContent = badge || (account ? 'JEKrayPro' : 'Sign in'); }
  else if (k) k.remove();
}
/* a gated item's click: true when it was off (explained, and the fix offered), so the handler stops */
export function gated(el) {
  if (!el.dataset.why) return false;
  toast(el.dataset.why, true);
  if (el.dataset.why.startsWith('Sign in') || account) proFix();
  return true;
}
export function cloudChanged() {
  if (!cloud || cloudOpening) return;          // opening replaces the bench: not an edit of the old link
  if (!cloud.dirty) { cloud.dirty = true; cloudKeep(); }
  if (!cloudOn()) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => cloudPush(), CLOUD_EVERY);
}
const cloudContent = () => JSON.stringify(serialize());
export async function cloudPush(opts = {}) {
  if (!cloud || !cloudOn()) return false;
  if (lease.editing && !lease.held && !opts.over) { cloudSay('Not saved: ' + lease.editing.name + ' is editing'); return false; }
  if (cloudBusy) { cloudAgain = true; return false; }
  clearTimeout(cloudTimer);
  cloudBusy = true; cloudAgain = false;
  const link = cloud, content = cloudContent();
  if (!opts.keepalive) cloudSay('Saving to the cloud…');
  try {
    const out = await api('/v1/benches/' + link.id, {
      method: 'PUT', keepalive: !!opts.keepalive && content.length < 60000,
      headers: { 'Content-Type': 'application/json', 'If-Match': '"' + (opts.over || link.version) + '"' },
      body: JSON.stringify({ content, name: project.name, checkpoint: !!opts.checkpoint || !!link.label, label: link.label || undefined }),
    });
    if (cloud !== link) return false;                       // another bench was opened meanwhile
    link.version = out.version; link.dirty = cloudAgain; link.name = out.name; delete link.label;
    if (!link.dirty) markUnsaved(false);
    cloudKeep();
    cloudSay('Saved to the cloud ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    if (!opts.keepalive) cloudThumb(link, opts.checkpoint);
    return true;
  } catch (err) {
    if (cloud !== link) return false;
    if (err.code === 'conflict') {
      // the same bench as here (say, saved as the page closed, before its new version was noted):
      // no clash, just a newer number
      try {
        const head = await api('/v1/benches/' + link.id), same = (x, y) => { const a = JSON.parse(x), b = JSON.parse(y); delete a.saved; delete b.saved; return JSON.stringify(a) === JSON.stringify(b); };
        if (cloud === link && same(head.content, cloudContent())) { link.version = head.version; link.dirty = false; cloudKeep(); cloudSay('Saved to the cloud'); return true; }
      } catch (e2) { /* fall through to asking */ }
      if (cloud !== link) return false;
      cloudSay('Not saved: changed somewhere else'); cloudConflict(err.version, err.updated_by, err.updated_at);
    }
    else if (err.status === 423) {
      // someone else holds its lease now
      lease.held = false; lease.editing = err.editing || lease.editing; lockShow();
      cloudSay('Not saved: ' + (lease.editing ? lease.editing.name : 'someone') + ' is editing');
      if (!opts.quiet && !opts.keepalive) toast((lease.editing ? lease.editing.name : 'Someone') + ' is editing this bench: your changes stay in this browser. Take over, or work on a copy.', true);
    }
    else if (err.status === 402) { cloudSay('Not saved to the cloud: that needs JEKrayPro'); if (!opts.quiet) toast('Saving to the cloud needs JEKrayPro: Subscribe from the account menu, top right. This bench is still kept in this browser.', true); }
    else if (err.status === 401) { cloudSay('Not saved: signed out'); setAccount(null); fillAccount(); }
    else if (err.status === 404) { cloudSay(''); toast('That bench is no longer in the cloud (it may be in the bin). This copy is kept in this browser.', true); cloudLink(null); }
    else if (err.status) { cloudSay('Not saved to the cloud: ' + err.message); }
    else { cloudSay('Offline: will save to the cloud when back'); clearTimeout(cloudTimer); cloudTimer = setTimeout(() => cloudPush({ quiet: true }), CLOUD_RETRY); }
    return false;
  } finally {
    cloudBusy = false;
    if (cloudAgain && cloud) { cloudAgain = false; clearTimeout(cloudTimer); cloudTimer = setTimeout(() => cloudPush(), 2000); }
  }
}
export const personalWs = () => account && (account.workspaces.find(w => w.kind === 'personal') || account.workspaces[0]);
// Save to cloud: a new cloud bench, or a kept version of the linked one.
async function cloudSave() {
  if (!cloudOn()) return;
  if (cloud) { if (await cloudPush({ checkpoint: true })) toast('Saved to the cloud, and kept in its history'); return; }
  // not in the cloud yet: asked where it goes (My benches or a team) and its name
  newCloudBench(cloudPlace.ws || personalWs().id, cloudPlace.folder, true);
}
/* A bench put in the cloud, in My benches or in a team the person can edit in (and in the folder shown,
   when made from My benches' page there), then linked and saving there: what is on the bench (Save to
   cloud), or a new, empty one (New bench on My benches' page; the bench being worked on is kept in
   Earlier versions first, and nothing is cleared unless the new one is made). A new bench can open
   straight into a workspace (then: 'lens', 'rf' or 'coat'), from My benches' Open a workspace. */
const newPlaces = () => (account ? account.workspaces : []).filter(w => w.kind === 'personal' || (w.kind !== 'institution' && w.active && ['owner', 'admin', 'editor'].includes(w.role || 'owner')));
export function newCloudBench(ws, folder, saveThis, then) {
  if (!cloudOn()) return;
  const places = newPlaces();
  if (!places.length) return;
  let dlg = document.getElementById('cloudNewDialog');
  if (dlg) dlg.remove();
  const name = h('input', { type: 'text', id: 'cloudNewName', value: saveThis ? project.name || 'Untitled bench' : 'Untitled bench', spellcheck: 'false', maxlength: '120' });
  const where = h('select', { id: 'cloudNewWhere' }, ...places.map(w => h('option', { value: w.id }, placeName(w))));
  where.value = places.some(w => w.id === ws) ? ws : places[0].id;
  const note = h('p', { class: 'rt-subsmall' });
  const sayWhere = () => {
    const w = places.find(x => x.id === where.value), inFolder = where.value === ws && folder;
    note.textContent = (w.kind === 'personal' ? 'Yours alone, in My benches' : 'Shared with everyone in ' + w.name + ', who can open and edit it as their role allows') + (inFolder ? ', in the folder you are looking at.' : '.') +
      (!saveThis && project.elements.length ? ' What is on the bench now is kept in Earlier versions (File menu).' : '');
  };
  where.addEventListener('change', sayWhere); sayWhere();
  const go = h('button', { class: 'rt-btn primary', type: 'button', id: 'cloudNewMake' }, saveThis ? 'Save' : 'Make it');
  dlg = h('dialog', { class: 'rt-dialog', id: 'cloudNewDialog', 'aria-labelledby': 'cloudNewTitle' },
    h('h2', { id: 'cloudNewTitle' }, saveThis ? 'Save to the cloud' : then === 'lens' ? 'New optical design' : then === 'rf' ? 'New RF design' : then === 'coat' ? 'New bench, with a coating to design' : 'New cloud bench'),
    h('div', { class: 'rt-rows' },
      h('div', { class: 'rt-f wide' }, h('label', { for: 'cloudNewName' }, 'Name'), name),
      h('div', { class: 'rt-f wide' }, h('label', { for: 'cloudNewWhere' }, 'In'), where)),
    note,
    h('div', { class: 'rt-actions' }, h('button', { class: 'rt-btn', type: 'button', onclick: () => dlg.close() }, 'Cancel'), go));
  document.body.append(dlg);
  go.addEventListener('click', async () => {
    const wsId = where.value, nm = name.value.trim() || 'Untitled bench', fid = wsId === ws ? folder || null : null;
    go.disabled = true;
    try {
      if (saveThis) { project.name = nm; document.getElementById('projName').value = nm; scheduleSave(); }
      const content = saveThis ? cloudContent() : JSON.stringify({ format: 'jekray', version: 1, name: nm, elements: [], fibres: [] });
      const b = await api('/v1/workspaces/' + wsId + '/benches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nm, folder_id: fid, content }) });
      dlg.close();
      const w = places.find(x => x.id === wsId);
      if (saveThis) {
        cloudLink({ id: b.id, ws: b.workspace_id, version: b.version, name: b.name, dirty: false });
        cloudThumb(cloud, true);
        toast('Saved to the cloud: “' + b.name + '” is in ' + (w.kind === 'personal' ? 'My benches' : w.name) + ', and saves there as you work');
        return;
      }
      if (project.elements.length) keepSnapshot('Before a new cloud bench', true);
      if (cloud) cloudLink(null);
      setCloudOpening(true);
      try { newProject(); project.name = b.name; document.getElementById('projName').value = b.name; } finally { setCloudOpening(false); }
      cloudLink({ id: b.id, ws: b.workspace_id, version: b.version, name: b.name, dirty: false });
      if (homeOpen()) closeHome();
      toast('“' + b.name + '” is made ' + (w.kind === 'personal' ? 'in My benches' : 'in ' + w.name) + ', and open on the bench: it saves there as you work');
      // straight into a workspace: a starting design on the new bench, or the coating workspace on its own
      if (then === 'lens') newLensDesign(); else if (then === 'rf') newRfDesign(); else if (then === 'coat') openCoatDesign(null);
    } catch (err) {
      go.disabled = false;
      toast(err.status === 402 ? (places.find(x => x.id === wsId).kind === 'personal' ? 'Benches in the cloud need JEKrayPro.' : 'That team has no active plan.') : 'Could not make the bench: ' + err.message, true);
    }
  });
  dlg.showModal();
  name.select();
}
/* My benches' picture of a bench: the view as it was last seen, without the handles, cut to
   8:5 and drawn small. Sent after a save at most every two minutes, and always after Save to
   cloud; a failure is no matter (the next save tries again) */
const THUMB_W = 320, THUMB_H = 200, THUMB_EVERY = 2 * 60 * 1000;
function benchThumb() {
  return new Promise(resolve => {
    try {
      if (!W || !H) return resolve(null);
      setExporting(true); setThumbing(true); render(); setExporting(false); setThumbing(false);
      const cv = document.createElement('canvas'); cv.width = THUMB_W; cv.height = THUMB_H;
      const c = cv.getContext('2d'), sw = canvas.width, sh = canvas.height, d = sw / W;
      // the parts as seen, with a margin, cut to 8:5 and kept inside the view
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const e of project.elements.filter(onTab)) {
        const r = halfSize(e) * V().scale;
        x0 = Math.min(x0, sx(e.x) - r); x1 = Math.max(x1, sx(e.x) + r); y0 = Math.min(y0, sy(e.y) - r); y1 = Math.max(y1, sy(e.y) + r);
      }
      x0 = Math.max(0, x0) * d; x1 = Math.min(W, x1) * d; y0 = Math.max(0, y0) * d; y1 = Math.min(H, y1) * d;
      let w = sw, hh = sh, cx = sw / 2, cy = sh / 2;
      if (x1 > x0 && y1 > y0) { w = (x1 - x0) * 1.2; hh = (y1 - y0) * 1.2; cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; }
      // no closer than the thumbnail's own size (a lone part stays a part, not a blur)
      w = Math.max(w, hh * THUMB_W / THUMB_H, THUMB_W * d); hh = w * THUMB_H / THUMB_W;
      if (w > sw) { w = sw; hh = w * THUMB_H / THUMB_W; }
      if (hh > sh) { hh = sh; w = hh * THUMB_W / THUMB_H; }
      const left = Math.min(Math.max(0, cx - w / 2), sw - w), top = Math.min(Math.max(0, cy - hh / 2), sh - hh);
      c.imageSmoothingQuality = 'high';
      c.drawImage(canvas, left, top, w, hh, 0, 0, THUMB_W, THUMB_H);
      requestRender();
      // WebP where the browser writes it (Safari writes PNG instead), JPEG if that is too big
      cv.toBlob(b => {
        if (b && b.size <= 120000) return resolve(b);
        cv.toBlob(j => resolve(j && j.size <= 120000 ? j : null), 'image/jpeg', 0.75);
      }, 'image/webp', 0.8);
    } catch (err) { setExporting(false); setThumbing(false); resolve(null); }
  });
}
async function cloudThumb(link, force) {
  if (!link || TEST_MODE || (!force && Date.now() - (link.thumbAt || 0) < THUMB_EVERY)) return;
  link.thumbAt = Date.now();
  const blob = await benchThumb();
  if (!blob || cloud !== link) return;
  try { await api('/v1/benches/' + link.id + '/thumb', { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob }); }
  catch (err) { link.thumbAt = 0; }
}
async function cloudOpen(id, version) {
  const b = await api('/v1/benches/' + id + (version ? '/versions/' + version : ''));
  const meta = version ? await api('/v1/benches/' + id) : b;
  setCloudOpening(true);
  try { openProjectData(JSON.parse(b.content), '“' + (meta.name || 'bench') + '”' + (version ? ', version ' + version : '') + ' from the cloud'); }
  finally { setCloudOpening(false); }
  // an old version opens as a copy: Save to cloud makes it a new bench
  if (version) cloudLink(null);
  else cloudLink({ id: meta.id, ws: meta.workspace_id, version: meta.version, name: meta.name, dirty: false });
}
/* the conflict: someone saved this bench elsewhere since this copy was opened */
function cloudConflict(theirs, by, at) {
  const dlg = document.getElementById('cloudConflict'), link = cloud;
  const who = by && account && by.id !== account.user.id ? 'by ' + by.name : 'from another tab or device';
  document.getElementById('cloudConflictText').textContent = '“' + link.name + '” was saved ' + who + (at ? ' ' + whenAgo(at) : '') + ' (version ' + theirs + ') after you opened it here. Which do you want to keep?';
  const done = () => dlg.close();
  document.getElementById('ccTheirs').onclick = async () => { done(); try { keepSnapshot('Before opening the cloud’s newer version', true); await cloudOpen(link.id); } catch (err) { toast(err.message, true); } };
  document.getElementById('ccCopy').onclick = async () => {
    done();
    try {
      const b = await api('/v1/workspaces/' + link.ws + '/benches', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: project.name + ' (my copy)', content: cloudContent() }) });
      project.name = b.name; document.getElementById('projName').value = b.name;
      cloudLink({ id: b.id, ws: b.workspace_id, version: b.version, name: b.name, dirty: false });
      toast('Kept yours as “' + b.name + '”');
    } catch (err) { toast(err.message, true); }
  };
  document.getElementById('ccMine').onclick = () => { done(); cloudPush({ over: theirs, checkpoint: true }); };
  // merging the two: only when the version this copy came from is still in the history
  const mergeBtn = document.getElementById('ccMerge');
  mergeBtn.hidden = true;
  if (link.version) versionContent(link.id, link.version).then(base => {
    if (!dlg.open || cloud !== link) return;
    mergeBtn.hidden = false;
    mergeBtn.onclick = () => { done(); conflictMerge(link, base, who); };
  }).catch(() => {});
  if (!dlg.open) dlg.showModal();
}
/* the save conflict resolved as a merge: the cloud's newer version is the target, this copy the
   source, and the version this copy came from is the common base */
function conflictMerge(link, base, who) {
  const ours = JSON.parse(cloudContent());
  mergeDialog({
    title: 'Merge my changes into “' + link.name + '”',
    target: { id: link.id, name: link.name }, source: { name: 'mine' }, baseWord: 'version ' + link.version + ', which this copy came from',
    parts: async () => { const T = await api('/v1/benches/' + link.id); return { base, T, S: { content: JSON.stringify(ours), version: null } }; },
    sourceWord: 'My changes here', keptLabel: 'Before merging my changes', mergedLabel: T => 'Merged with version ' + T.version + (who.startsWith('by ') ? ', saved ' + who : ''),
    openWord: T => '“' + T.name + '” merged with my changes',
    toastWord: 'Merged: look it over. It saves to the cloud as a version of its own; undo takes it back.',
  });
}
/* ---------- My benches ----------
   A page of its own over the tool, as a CAD system's documents page: places down the left
   (each workspace, Recent, its folders, the bin), the benches as cards with their pictures,
   or as rows. A card's ⋯ menu opens, forks, renames, moves and deletes; a bench's history
   opens a copy of any version, forks from it, or restores it. Opened from the File menu, the
   bar's My benches button, or #benches; Esc or Back returns to the bench. */
export const cloudPlace = { ws: null, folder: null, q: '', view: 'folder', history: null, flash: null, cmp: null };
const HOME_KEY = 'jek-home-view';
const homeView = { sort: 'changed', rows: false };
export const kb = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
const whenAgo = t => {
  const d = new Date(t), s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return new Date().toDateString() === d.toDateString() ? 'today ' + hm : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) + ' ' + hm;
};
const HOME_ICONS = {
  folder: 'M1.5 3.5H6L7.5 5H14.5V13H1.5Z', recent: 'M8 1.5A6.5 6.5 0 1 1 7.99 1.5 M8 4.5V8L10.5 9.5',
  fork: MENU_ICONS.fork, copy: MENU_ICONS.paste,
  list: 'M5.5 4H14 M5.5 8H14 M5.5 12H14 M2 4H2.5 M2 8H2.5 M2 12H2.5', grid: MENU_ICONS.gallery, trash: MENU_ICONS.trash,
  bench: 'M1.5 3.5H14.5V12.5H1.5Z M4 6H4.1 M8 6H8.1 M12 6H12.1 M4 10H4.1 M8 10H8.1 M12 10H12.1', open: MENU_ICONS.open,
  history: MENU_ICONS.history, rename: 'M10.5 2.5L13.5 5.5L5.5 13.5H2.5V10.5Z M9 4L12 7', move: 'M1.5 3.5H6L7.5 5H14.5V13H1.5Z M6 9H10.5 M8.5 7L10.5 9L8.5 11',
  restore: 'M3 8A5 5 0 1 0 4.5 4.4 M3 2V5H6', star: MENU_ICONS.star, link: MENU_ICONS.link,
};
const homeIcon = name => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', HOME_ICONS[name] || ''); svg.append(p);
  return svg;
};
export const homeOpen = () => !document.getElementById('home').hidden;
const jsonBody = body => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
let homeSeq = 0, homeRO = null;
/* a card's menu: [label, icon, fn, cls] items, 'sep', or an element */
let homeMenu = null;
function closeHomeMenu() {
  if (!homeMenu) return;
  const { el, btn } = homeMenu; homeMenu = null;
  el.remove(); btn.setAttribute('aria-expanded', 'false');
}
function openHomeMenu(btn, items) {
  if (homeMenu && homeMenu.btn === btn) { closeHomeMenu(); return; }
  closeHomeMenu();
  const el = h('div', { class: 'rt-hmenu', role: 'menu' }, ...items.filter(Boolean).map(it => it === 'sep' ? h('div', { class: 'sep' }) : it instanceof Node ? it
    : h('button', { type: 'button', role: 'menuitem', class: it[3] || null, onclick: () => { closeHomeMenu(); it[2](); } }, homeIcon(it[1]), it[0])));
  document.getElementById('home').append(el);
  const r = btn.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
  el.style.top = (r.bottom + 4 + hh > innerHeight - 8 ? Math.max(8, r.top - 4 - hh) : r.bottom + 4) + 'px';
  btn.setAttribute('aria-expanded', 'true');
  homeMenu = { el, btn };
  const first = el.querySelector('button, select'); if (first) first.focus();
}
const homeSay = (fn, ok) => async () => {
  try { const out = await fn(); if (ok) toast(typeof ok === 'function' ? ok(out) : ok); }
  catch (err) { toast(err.status === 402 ? 'That needs JEKrayPro.' : err.message, true); }
  if (homeOpen()) fillHome();
};
// open a cloud bench on the bench, leaving this page
async function homeOpenBench(id, version) {
  try {
    if (cloud && cloud.dirty && cloud.id !== id) await cloudPush({ quiet: true });
    await cloudOpen(id, version);
    closeHome();
  } catch (err) { toast(err.message, true); }
}
// the workspaces (but one) the person can save a bench to: a copy goes to one of them
export const copyPlaces = (notWs) => (account ? account.workspaces : []).filter(w => w.id !== notWs && w.kind !== 'institution' && w.active && ['owner', 'admin', 'editor'].includes(w.role || 'owner'));
const placeName = w => w.kind === 'personal' ? 'My benches' : w.name;
// a copy of a bench, as it is now, into another workspace: a fork there, so it remembers where it came from
function homeCopy(b, btn) {
  const places = copyPlaces(b.workspace_id);
  const sel = h('select', { 'aria-label': 'Copy to workspace' }, h('option', { value: '' }, 'Choose…'), ...places.map(w => h('option', { value: w.id }, placeName(w))));
  sel.addEventListener('change', () => {
    const w = places.find(x => x.id === sel.value);
    if (!w) return;
    closeHomeMenu();
    const name = prompt('Name of the copy in ' + placeName(w), b.name);
    if (name === null) return;
    homeSay(async () => {
      const f = await api('/v1/benches/' + b.id + '/fork', Object.assign({ method: 'POST' }, jsonBody({ name: name.trim() || undefined, workspace_id: w.id })));
      Object.assign(cloudPlace, { ws: w.id, folder: null, view: 'folder', q: '', history: null, flash: f.id });
      return f;
    }, f => 'Copied to ' + placeName(w) + ' as “' + f.name + '”')();
  });
  openHomeMenu(btn, [h('div', { class: 'rt-menunote' }, 'Copy “' + b.name + '” to'), sel]);
}
// a fork: of the bench as it is now, or of one of its versions; named first
function homeFork(b, version, after) {
  const name = prompt('Name of the fork', b.name + (version ? ' (v' + version + ')' : ' (fork)'));
  if (name === null) return;
  homeSay(async () => {
    const f = await api('/v1/benches/' + b.id + '/fork', Object.assign({ method: 'POST' }, jsonBody(Object.assign({ name: name.trim() || undefined }, version ? { version } : {}))));
    if (after) after(f); else cloudPlace.flash = f.id;
    return f;
  }, f => 'Forked as “' + f.name + '”')();
}
/* ---------- compare and merge ----------
   Compare: two versions of a bench, item by item (src/io/merge.js). Merge: a fork back into
   the bench it came from, or that bench's changes into the fork, from the version the fork
   left at. The bench it lands in is checkpointed first ("Before merging"), the merged bench
   is opened on the bench to look at, and its next save is a labelled version. */
function diffNodes(d, fromName, toName) {
  if (!d.count) return [h('p', null, 'No difference between ' + fromName + ' and ' + toName + '.')];
  const word = i => KIND_WORD[i.kind] + ' ' + i.label;
  const rows = d.items.map(i => h('li', null, h('span', { class: 'tag ' + i.change }, i.change), word(i),
    i.fields ? h('span', { class: 'fields' }, i.fields.map(f => f.key + ': ' + showValue(f.from) + ' to ' + showValue(f.to)).join(' · ')) : null));
  const sets = d.settings.map(f => h('li', null, h('span', { class: 'tag changed' }, 'setting'), f.key, h('span', { class: 'fields' }, showValue(f.from) + ' to ' + showValue(f.to))));
  return [h('p', null, 'From ' + fromName + ' to ' + toName + ': ' + d.count + (d.count === 1 ? ' change.' : ' changes.')), h('ul', { class: 'rt-difflist' }, ...rows, ...sets)];
}
const versionContent = async (id, v) => JSON.parse((await api('/v1/benches/' + id + '/versions/' + v)).content);
async function homeCompare(b, va, vb) {
  const dlg = document.getElementById('diffDialog'), body = document.getElementById('diffBody');
  const [lo, hi] = va < vb ? [va, vb] : [vb, va];
  document.getElementById('diffTitle').textContent = '“' + b.name + '”: version ' + lo + ' to ' + hi;
  body.replaceChildren(h('p', null, 'Comparing…'));
  if (!dlg.open) dlg.showModal();
  try {
    const [A, B] = await Promise.all([versionContent(b.id, lo), versionContent(b.id, hi)]);
    body.replaceChildren(...diffNodes(diffProject(A, B), 'version ' + lo, 'version ' + hi));
  } catch (err) { body.replaceChildren(h('p', { class: 'rt-error' }, err.message)); }
}
function homeMerge(target, source, baseVersion, baseBench) {
  mergeDialog({
    title: 'Merge “' + source.name + '” into “' + target.name + '”', target, source,
    baseWord: 'version ' + baseVersion + ' of “' + (baseBench === target.id ? target.name : source.name) + '”',
    parts: async () => { const [base, T, S] = await Promise.all([versionContent(baseBench, baseVersion), api('/v1/benches/' + target.id), api('/v1/benches/' + source.id)]); return { base, T, S }; },
    sourceWord: '“' + source.name + '”', keptLabel: 'Before merging “' + source.name + '”', mergedLabel: (T, S) => 'Merged from “' + source.name + '”, version ' + S.version,
    openWord: T => '“' + T.name + '” merged with “' + source.name + '”', closeHome: true,
    toastWord: 'Merged: look it over. It saves to the cloud as a version of its own; undo takes it back.',
  });
}
/* the merge dialog: a three-way merge of the target's head and a source over a common base,
   each clash chosen by hand, the gains listed, and the result opened on the bench as a new
   version of the target, the target's head kept first as a version to come back to */
async function mergeDialog(o) {
  const dlg = document.getElementById('mergeDialog'), body = document.getElementById('mergeBody'), go = document.getElementById('mergeGo');
  const target = o.target, source = o.source;
  document.getElementById('mergeTitle').textContent = o.title;
  body.replaceChildren(h('p', null, 'Working out the merge…'));
  go.disabled = true;
  if (!dlg.open) dlg.showModal();
  let m, T, S;
  try {
    const parts = await o.parts(); T = parts.T; S = parts.S;
    m = merge3(parts.base, JSON.parse(T.content), JSON.parse(S.content));
  } catch (err) { body.replaceChildren(h('p', { class: 'rt-error' }, err.message)); return; }
  const brings = diffProject(JSON.parse(T.content), resolve(m));
  const n = m.taken.source + m.taken.both;
  const rows = m.conflicts.map((c, i) => {
    const pick = side => h('label', null, h('input', { type: 'radio', name: 'mc' + i, value: side, checked: side === 'target', onchange: () => { c.choice = side; } }), ' ' + (side === 'target' ? '“' + target.name + '”: ' : (source.id ? '“' + source.name + '”: ' : 'Mine: ')) + (c.key ? showValue(c[side]) : c[side] ? 'keep it' : 'remove it'));
    return h('li', null, h('span', null, KIND_WORD[c.kind] + ' ' + c.label + (c.key && c.kind !== 'settings' ? ', ' + c.key : '')), pick('target'), pick('source'));
  });
  body.replaceChildren(
    h('p', null, o.sourceWord + (S.version ? ' (version ' + S.version + ')' : '') + ', since ' + o.baseWord + ': ' + n + (n === 1 ? ' change goes in' : ' changes go in') + (m.taken.target ? ', beside ' + m.taken.target + ' of “' + target.name + '”’s own' : '') + '. ' +
      (m.conflicts.length ? 'Both changed the same thing in ' + m.conflicts.length + (m.conflicts.length === 1 ? ' place: choose which to keep.' : ' places: choose which to keep.') : 'Nothing clashes.')),
    ...(m.conflicts.length ? [h('h3', null, 'Choose'), h('ul', { class: 'rt-difflist conflicts' }, ...rows)] : []),
    h('h3', null, 'What “' + target.name + '” will gain'), ...diffNodes(brings, 'now', 'merged').slice(1),
    h('p', { class: 'rt-subsmall' }, '“' + target.name + '” as it is now is kept as a version first (“' + o.keptLabel + '”). The merged bench opens on the bench for you to look at and is saved to the cloud as a version of its own; undo on the bench, or restore the version before, takes it back.'));
  // the gains list follows the choices
  body.addEventListener('change', () => { const d = diffProject(JSON.parse(T.content), resolve(m)); const ul = body.querySelectorAll('ul.rt-difflist:not(.conflicts)')[0]; const fresh = diffNodes(d, 'now', 'merged').slice(1)[0]; if (ul && fresh) ul.replaceWith(fresh); });
  go.disabled = false;
  go.onclick = async () => {
    go.disabled = true;
    try {
      if (cloud && cloud.dirty && cloud.id !== target.id) await cloudPush({ quiet: true });
      // the target as it is now, kept: a version to come back to
      const kept = await api('/v1/benches/' + target.id, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': '"' + T.version + '"' },
        body: JSON.stringify({ content: T.content, name: T.name, checkpoint: true, label: o.keptLabel }) });
      const merged = resolve(m); merged.name = T.name;
      setCloudOpening(true);
      try { openProjectData(merged, o.openWord(T)); } finally { setCloudOpening(false); }
      cloudLink({ id: target.id, ws: T.workspace_id, version: kept.version, name: T.name, dirty: true, label: o.mergedLabel(T, S) });
      cloudChanged();
      dlg.close(); if (o.closeHome) closeHome();
      toast(o.toastWord);
    } catch (err) {
      toast(err.status === 423 ? (err.editing ? err.editing.name : 'Someone') + ' is editing “' + target.name + '”: merge when they are done.' : err.status === 409 ? '“' + target.name + '” changed just now: open the merge again.' : err.message, true);
      go.disabled = false;
    }
  };
}
export async function fillHome() {
  const box = document.getElementById('homeList'), rail = document.getElementById('homeRail');
  const crumbs = document.getElementById('homeCrumbs'), tools = document.getElementById('homeTools'), note = document.getElementById('homeNote');
  if (!account) { closeHome(); return; }
  const places = account.workspaces.filter(w => w.kind !== 'institution');
  if (!cloudPlace.ws || !places.some(w => w.id === cloudPlace.ws)) cloudPlace.ws = personalWs().id;
  const ws = cloudPlace.ws, wsInfo = places.find(w => w.id === ws), P = cloudPlace;
  const top = wsInfo && wsInfo.kind !== 'personal' ? wsInfo.name : 'My benches';
  const seq = ++homeSeq;
  if (!box.children.length) box.replaceChildren(h('p', { class: 'rt-hempty' }, 'Loading…'));
  box.setAttribute('aria-busy', 'true');
  let folders = [], data;
  try {
    [{ folders }, data] = await Promise.all([api('/v1/workspaces/' + ws + '/folders'),
      P.view === 'history' ? api('/v1/benches/' + P.history.id + '/versions')
        : P.view === 'parts' ? api('/v1/workspaces/' + ws + '/parts')
        : P.view === 'links' ? api('/v1/me/links')
        : api('/v1/workspaces/' + ws + '/benches?' + new URLSearchParams(P.view === 'bin' ? { bin: '1' } : P.q ? { q: P.q } : P.view === 'recent' ? {} : { folder: P.folder || '' }))]);
  } catch (err) {
    if (seq !== homeSeq) return;
    box.removeAttribute('aria-busy');
    if (err.status === 404 && P.view === 'history') { Object.assign(P, { view: 'folder', history: null }); toast('That bench is not available to you', true); fillHome(); return; }
    box.replaceChildren(h('p', { class: 'rt-hempty' }, err.status === 401 ? 'You are signed out. Sign in again from the bench, top right.' : 'Could not reach your benches: ' + err.message));
    if (err.status === 401) { setAccount(null); fillAccount(); }
    return;
  }
  if (seq !== homeSeq) return;
  box.removeAttribute('aria-busy');
  const byId = new Map(folders.map(f => [f.id, f]));
  if (P.folder && !byId.has(P.folder)) P.folder = null;
  // share links are the person's own, not a workspace's: shown with their personal workspace
  if (P.view === 'links' && wsInfo && wsInfo.kind !== 'personal') { P.view = 'folder'; fillHome(); return; }
  const go = (view, folder = null) => () => { closeHomeMenu(); Object.assign(P, { view, folder, q: '', history: null }); document.getElementById('homeSearch').value = ''; fillHome(); document.getElementById('homeMain').scrollTop = 0; };
  const pathOf = id => { const out = []; for (let f = byId.get(id); f; f = byId.get(f.parent_id)) out.unshift(f); return out; };
  // the rail: workspaces, then this one's places and folders
  const here = (view, folder) => !P.q && P.view === view && (view !== 'folder' || P.folder === folder);
  // My parts, kept up to date for the picker and the rail too (they show the personal workspace's)
  if (P.view === 'parts' && personalWs() && ws === personalWs().id) Object.assign(MINE, { list: data.parts.slice(), ws, active: !!data.active });
  const railBtn = (label, icon, on, fn, depth = 0) => h('button', { type: 'button', 'aria-current': on ? 'true' : 'false', onclick: fn, title: label, style: depth ? 'padding-left:' + (0.6 + depth * 0.9) + 'rem' : null }, homeIcon(icon), h('span', null, label));
  const tree = [];
  const walk = (parent, depth) => { for (const f of folders.filter(f => (f.parent_id || null) === parent).sort((a, b) => a.name.localeCompare(b.name))) { tree.push(railBtn(f.name, 'folder', here('folder', f.id), go('folder', f.id), depth)); walk(f.id, depth + 1); } };
  walk(null, 1);
  const used = data.usage || (P.lastUsage && P.lastUsage.ws === ws ? P.lastUsage : null);
  if (data.usage) P.lastUsage = Object.assign({ ws }, data.usage);
  rail.replaceChildren(...[
    places.length > 1 ? h('h2', null, 'Workspaces') : null,
    ...(places.length > 1 ? places.map(w => railBtn(w.kind === 'personal' ? 'My benches' : w.name, w.kind === 'personal' ? 'bench' : 'folder', w.id === ws, () => { Object.assign(P, { ws: w.id, folder: null, view: 'folder', q: '', history: null }); fillHome(); })) : []),
    h('h2', null, places.length > 1 ? top : 'Benches'),
    railBtn(places.length > 1 ? 'All benches' : 'My benches', 'bench', here('folder', null), go('folder', null)),
    railBtn('Recent', 'recent', here('recent'), go('recent')),
    railBtn(wsInfo && wsInfo.kind !== 'personal' ? 'Team parts' : 'My parts', 'star', P.view === 'parts', go('parts')),
    wsInfo && wsInfo.kind === 'personal' ? railBtn('My links', 'link', P.view === 'links', go('links')) : null,
    ...tree,
    railBtn('Bin', 'trash', here('bin'), go('bin')),
    h('div', { class: 'rt-hfoot' },
      used ? h('span', null, kb(used.bytes) + ' of ' + kb(used.quota) + ' used') : null,
      used ? h('div', { class: 'rt-hmeter', role: 'progressbar', 'aria-label': 'Cloud storage used', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(100 * used.bytes / used.quota)) },
        h('span', { style: 'width:' + Math.min(100, Math.max(1, 100 * used.bytes / used.quota)).toFixed(1) + '%' })) : null,
      h('a', { href: API_BASE + '/v1/me/export', class: 'rt-link' }, 'Download everything (.zip)'),
      h('span', null, 'Signed in as ' + (account.user.name || account.user.email || 'you')))].filter(Boolean));
  // where we are
  const link = (label, fn) => h('button', { type: 'button', class: 'rt-link', onclick: fn }, label);
  const sep = ' › ';
  if (P.view === 'history') {
    const b = data.bench;
    crumbs.replaceChildren(link(top, go('folder', null)), ...pathOf(b.folder_id).flatMap(f => [sep, link(f.name, go('folder', f.id))]), sep, b.name);
  } else crumbs.replaceChildren(...(P.q ? [link(top, go('folder', null)), sep, 'Search: “' + P.q + '”']
    : P.view === 'bin' ? [link(top, go('folder', null)), sep, 'Bin'] : P.view === 'recent' ? [link(top, go('folder', null)), sep, 'Recent']
    : pathOf(P.folder).length ? [link(top, go('folder', null)), ...pathOf(P.folder).flatMap((f, i, a) => [sep, i === a.length - 1 ? f.name : link(f.name, go('folder', f.id))])] : [top]));
  document.getElementById('homeWhere').textContent = top;
  const writer = data.role ? ['owner', 'admin', 'editor'].includes(data.role) : wsInfo ? ['owner', 'admin', 'editor'].includes(wsInfo.role || 'owner') : true;
  const active = data.active !== undefined ? data.active : !!(wsInfo && wsInfo.active);
  const can = writer && active;
  note.hidden = active || P.view === 'history';
  note.replaceChildren('Saving, forking and organising need JEKrayPro. Benches here can still be opened and downloaded. ', link('Subscribe', () => { closeHome(); showSubscribe(); }));
  // the tools: sort, grid or rows, a new folder
  const keepView = () => { try { localStorage.setItem(HOME_KEY, JSON.stringify(homeView)); } catch (err) { /* this visit only */ } };
  const listing = P.view !== 'history' && P.view !== 'bin';
  const sortSel = listing ? h('select', { 'aria-label': 'Sort by', onchange: e => { homeView.sort = e.target.value; keepView(); fillHome(); } },
    ...[['changed', 'Last changed'], ['name', 'Name'], ['size', 'Size']].map(([v, t]) => { const o = h('option', { value: v }, t); o.selected = homeView.sort === v; return o; })) : null;
  tools.replaceChildren(...[sortSel,
    P.view !== 'history' ? h('button', { type: 'button', class: 'rt-btn', title: homeView.rows ? 'Show as cards' : 'Show as a list', 'aria-label': homeView.rows ? 'Show as cards' : 'Show as a list',
      onclick: () => { homeView.rows = !homeView.rows; keepView(); fillHome(); } }, homeIcon(homeView.rows ? 'grid' : 'list')) : null,
    P.view === 'parts' ? h('button', { type: 'button', class: 'rt-btn', title: 'Thorlabs, Edmund and other makers publish their lenses, mirrors and beam splitters as .zmx files',
      onclick: () => { if (!can) { closeHome(); showSubscribe(); return; } openZmx(true); } }, homeIcon('open'), ' Import .zmx files…') : null,
    P.view === 'folder' && !P.q && can ? h('button', { type: 'button', class: 'rt-btn', onclick: () => {
      const name = (prompt('Name of the new folder') || '').trim();
      if (name) homeSay(() => api('/v1/workspaces/' + ws + '/folders', Object.assign({ method: 'POST' }, jsonBody({ name, parent_id: P.folder }))))();
    } }, homeIcon('folder'), ' New folder') : null].filter(Boolean));
  for (const b of tools.querySelectorAll('.rt-btn')) b.style.cssText = 'display:inline-flex;align-items:center;gap:0.3rem';
  box.classList.toggle('rows', homeView.rows && P.view !== 'history');
  // the history of one bench, as a graph down the side: its versions on one line, newest at
  // the top; each fork branching off from the version it was made from, at the time it was
  // made; and the bench it was itself forked from, at the foot
  if (P.view === 'history') {
    // a fork or an original in another workspace: shown in its own, with its own rights
    if (data.bench.workspace_id !== ws && places.some(w => w.id === data.bench.workspace_id)) { P.ws = data.bench.workspace_id; fillHome(); return; }
    const b = data.bench, mine = cloud && cloud.id === b.id, origin = data.forked_from;
    const toHist = (id, name) => () => { Object.assign(P, { view: 'history', history: { id, name }, cmp: null }); fillHome(); document.getElementById('homeMain').scrollTop = 0; };
    const side = h('div', { class: 'rt-hside' },
      b.thumb ? h('img', { src: API_BASE + b.thumb, alt: '' }) : h('span', { class: 'thumb rt-nopic' }, 'Its picture is drawn the next time it is opened and saved'),
      h('p', null, 'Version ' + b.version + ' · changed ' + whenAgo(b.updated_at) + (b.updated_by && wsInfo && wsInfo.kind !== 'personal' ? ' by ' + b.updated_by.name : '') + ' · ' + kb(b.size_bytes) + (mine ? ' · open on the bench' : '')),
      h('div', { class: 'rt-actions' },
        h('button', { type: 'button', class: 'rt-btn primary', onclick: () => homeOpenBench(b.id) }, 'Open'),
        can ? h('button', { type: 'button', class: 'rt-btn', onclick: () => homeFork(b, null, () => {}) }, homeIcon('fork'), ' Fork') : null),
      helpLine('Versions are kept as you work: the last 50, then one a day for 90 days.', ['A version is kept on Save to cloud, every 10 minutes or so while you work, before a restore, and wherever a fork was made: the last 50, then one a day for 90 days, and every fork’s starting point for good.'], 'rt-subsmall'));
    // the events, newest first: a fork comes just after the version it was made from
    const ev = [...data.versions.map(v => ({ kind: 'v', t: v.created_at, v })), ...data.forks.map(f => ({ kind: 'f', t: f.created_at, f }))]
      .sort((x, y) => y.t - x.t || (x.kind === 'f' ? -1 : 1));
    if (origin) ev.push({ kind: 'o' });
    const rowOf = new Map();
    ev.forEach((e, i) => { if (e.kind === 'v') rowOf.set(e.v.version, i); });
    const vRows = ev.map((e, i) => e.kind === 'v' ? i : -1).filter(i => i >= 0);
    // a version merged from a fork: its row joins the fork's lane back to the main line
    const MERGED = /^Merged from “(.+)”, version (\d+)$/;
    ev.forEach((e, i) => {
      if (e.kind !== 'v' || !e.v.label) return;
      const mm = MERGED.exec(e.v.label); if (!mm) return;
      const f = ev.find((x, j) => x.kind === 'f' && j > i && x.f.name === mm[1]);
      if (f) (f.merges = f.merges || []).push(i);
    });
    // each fork's lane: the lowest one free between its earliest merge row and its version's
    const LANES = 5, busy = [];   // per lane, the rows it is taken on, as [top, bottom]
    for (const [i, e] of ev.entries()) {
      if (e.kind !== 'f') continue;
      let at = rowOf.get(e.f.version);
      if (at === undefined || at < i) at = vRows.find(r => r > i && ev[r].v.version <= e.f.version) ?? ev.length - 1;
      const top = e.merges ? Math.min(i, ...e.merges) : i;
      let lane = 1;
      while (lane < LANES && (busy[lane] || []).some(([a, b]) => a <= at && b >= top)) lane++;
      (busy[lane] = busy[lane] || []).push([top, at]);
      e.lane = lane; e.from = at;
    }
    const lanes = Math.max(0, ...ev.map(e => e.lane || 0));
    const X0 = 14, DX = 20, G = X0 + lanes * DX + 16;
    const COLOURS = ['var(--jek-cyan)', 'var(--jek-orange)', '#7a5cc4', 'var(--jek-red)', '#2e8b57'];
    const rows = ev.map(e => {
      if (e.kind === 'v') {
        const v = e.v;
        return h('div', { class: 'rt-hev' + (v.version === b.version ? ' head' : '') },
          h('span', { class: 'when' }, whenAgo(v.created_at)),
          h('span', { class: 'what' }, 'Version ' + v.version, ' ', h('small', null, [v.version === b.version ? 'current' : null, v.created_by && v.created_by.name, v.label, kb(v.size_bytes)].filter(Boolean).join(' · '))),
          h('span', { class: 'acts' },
            link('Open a copy', () => homeOpenBench(b.id, v.version)),
            P.cmp === v.version ? link('Cancel compare', () => { P.cmp = null; fillHome(); })
              : P.cmp ? link('Compare with v' + P.cmp, () => { const a = P.cmp; P.cmp = null; fillHome(); homeCompare(b, a, v.version); })
              : link('Compare…', () => { P.cmp = v.version; fillHome(); toast('Now choose the version to compare it with'); }),
            can ? link('Fork from here', () => homeFork(b, v.version, () => {})) : null,
            can && v.version !== b.version ? link('Restore', homeSay(async () => {
              await api('/v1/benches/' + b.id + '/versions/' + v.version + '/restore', { method: 'POST' });
              if (cloud && cloud.id === b.id) await cloudOpen(b.id);
            }, 'Restored version ' + v.version)) : null));
      }
      if (e.kind === 'f') {
        const f = e.f;
        return h('div', { class: 'rt-hev fork', style: '--lane:' + COLOURS[(e.lane - 1) % COLOURS.length] },
          f.thumb ? h('img', { class: 'thumb', src: API_BASE + f.thumb, alt: '', loading: 'lazy' }) : h('span', { class: 'thumb', 'aria-hidden': 'true' }),
          h('span', { class: 'what' }, homeIcon('fork'), ' ', link(f.name, toHist(f.id, f.name)), ' ',
            h('small', null, ['forked from version ' + f.version, f.created_by, whenAgo(f.created_at), f.forks ? (f.forks === 1 ? '1 fork of its own' : f.forks + ' forks of its own') : null].filter(Boolean).join(' · '))),
          h('span', { class: 'acts' }, link('Open', () => homeOpenBench(f.id)), link('History', toHist(f.id, f.name)),
            can ? link('Merge into this bench…', () => homeMerge({ id: b.id, name: b.name }, { id: f.id, name: f.name }, f.version, b.id)) : null));
      }
      return h('div', { class: 'rt-hev origin' },
        h('span', { class: 'what' }, 'Forked from ', link('“' + origin.name + '”', toHist(origin.id, origin.name)), ', version ' + origin.version),
        h('span', { class: 'acts' },
          link('Merge this fork into it…', () => homeMerge({ id: origin.id, name: origin.name }, { id: b.id, name: b.name }, origin.version, origin.id)),
          can ? link('Bring its changes in…', () => homeMerge({ id: b.id, name: b.name }, { id: origin.id, name: origin.name }, origin.version, origin.id)) : null));
    });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'rt-hlines'); svg.setAttribute('aria-hidden', 'true');
    const list = h('div', { class: 'rt-hevs', style: '--g:' + G + 'px' }, ...rows);
    const graph = h('div', { class: 'rt-hgraph' }, svg, list);
    const draw = () => {
      const H = list.offsetHeight, ys = rows.map(r => r.offsetTop + Math.min(r.offsetHeight / 2, 20));
      svg.setAttribute('width', G); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + G + ' ' + H);
      const NS = 'http://www.w3.org/2000/svg', el = (tag, at) => { const n = document.createElementNS(NS, tag); for (const k in at) n.setAttribute(k, at[k]); svg.append(n); return n; };
      svg.replaceChildren();
      const firstV = ev.findIndex(e => e.kind === 'v'), lastV = ev.length - 1 - [...ev].reverse().findIndex(e => e.kind === 'v');
      if (firstV >= 0) el('path', { d: 'M' + X0 + ' ' + ys[firstV] + 'V' + ys[lastV], class: 'main' });
      if (origin && lastV >= 0) el('path', { d: 'M' + X0 + ' ' + ys[lastV] + 'V' + ys[ev.length - 1], class: 'main from' });
      ev.forEach((e, i) => {
        if (e.kind !== 'f') return;
        const x = X0 + e.lane * DX, y0 = ys[e.from], y1 = ys[i], c = COLOURS[(e.lane - 1) % COLOURS.length];
        const bend = Math.min(14, (y0 - y1) / 2);
        el('path', { d: 'M' + X0 + ' ' + y0 + 'C' + X0 + ' ' + (y0 - bend) + ' ' + x + ' ' + (y0 - bend) + ' ' + x + ' ' + (y0 - 2 * bend) + 'V' + y1, class: 'branch', style: 'stroke:' + c });
        // and back in, to each version merged from it
        for (const r of e.merges || []) {
          const ym = ys[r], mb = Math.min(14, (y1 - ym) / 2);
          el('path', { d: 'M' + x + ' ' + y1 + 'V' + (ym + 2 * mb) + 'C' + x + ' ' + (ym + mb) + ' ' + X0 + ' ' + (ym + mb) + ' ' + X0 + ' ' + ym, class: 'branch merge', style: 'stroke:' + c });
        }
      });
      ev.forEach((e, i) => {
        if (e.kind === 'v') el('circle', { cx: X0, cy: ys[i], r: e.v.version === b.version ? 6 : 4.5, class: e.v.version === b.version ? 'node head' : 'node' });
        else if (e.kind === 'f') el('circle', { cx: X0 + e.lane * DX, cy: ys[i], r: 5, class: 'node fork', style: 'fill:' + COLOURS[(e.lane - 1) % COLOURS.length] });
        else el('circle', { cx: X0, cy: ys[i], r: 5, class: 'node origin' });
      });
    };
    box.replaceChildren(h('div', { class: 'rt-hhist' }, side, h('div', null,
      h('h3', null, 'Versions and forks'),
      ev.length ? graph : h('p', { class: 'rt-hempty' }, 'No versions kept yet.'))));
    if (homeRO) homeRO.disconnect();
    if (ev.length) { draw(); homeRO = new ResizeObserver(draw); homeRO.observe(list); }
    return;
  }
  // My links: the share links made, each a snapshot of a bench as it was: open it, copy its link, or delete it
  if (P.view === 'links') {
    const by = { changed: (a, b) => b.created_at - a.created_at, name: (a, b) => a.name.localeCompare(b.name), size: (a, b) => b.size_bytes - a.size_bytes }[homeView.sort] || ((a, b) => b.created_at - a.created_at);
    const words = P.q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = data.links.filter(l => words.every(w => (l.name + ' ' + l.id).toLowerCase().includes(w))).sort(by);
    crumbs.replaceChildren(link(top, go('folder', null)), sep, P.q ? 'My links: “' + P.q + '”' : 'My links');
    const linkNote = !!(hooks.proWhy && hooks.proWhy());
    note.hidden = !linkNote;
    note.replaceChildren('Making share links needs JEKrayPro. The links you made still open for everyone, and you can delete them here. ', link('Subscribe', () => { closeHome(); showSubscribe(); }));
    const copyLink = (l, btn) => navigator.clipboard.writeText(shortUrl(l.id)).then(() => { toast('Copied ' + shortUrl(l.id)); if (btn) btn.textContent = 'Copied'; }, () => toast(shortUrl(l.id)));
    const open = l => { closeHome(); openShortLink(l.id); };
    const del = l => () => {
      if (!confirm('Delete the link to “' + l.name + '”? Anyone who has ' + shortUrl(l.id) + ' will no longer be able to open it. Your benches are not changed.')) return;
      homeSay(() => api('/v1/links/' + l.id, { method: 'DELETE' }), 'Deleted: ' + shortUrl(l.id) + ' no longer opens')();
    };
    const cards = list.map(l => {
      const more = h('button', { type: 'button', class: 'rt-hmore', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'More for ' + l.name, title: 'More' }, '⋯');
      more.addEventListener('click', () => openHomeMenu(more, [
        ['Open on the bench', 'open', () => open(l)],
        ['Copy the link', 'copy', () => copyLink(l)],
        'sep',
        ['Delete…', 'trash', del(l), 'danger']]));
      const copyBtn = h('button', { type: 'button', class: 'rt-link', onclick: e => copyLink(l, e.target) }, 'Copy link');
      return h('div', { class: 'rt-hcard rt-hlink', 'data-link': l.id },
        h('button', { type: 'button', class: 'rt-hopen', title: 'Open “' + l.name + '” as it was shared', onclick: () => open(l) }, homeIcon('link'), h('span', { class: 'mono' }, '/s/' + l.id)),
        h('div', { class: 'rt-hinfo' },
          h('b', { title: l.name }, l.name),
          h('small', null, 'Made ' + whenAgo(l.created_at) + ' · ' + kb(l.size_bytes)),
          h('small', null, l.opens ? 'Opened ' + l.opens + (l.opens === 1 ? ' time' : ' times') + (l.opened_at ? ', last ' + whenAgo(l.opened_at) : '') : 'Not opened yet'),
          h('small', null, copyBtn)),
        more);
    });
    box.replaceChildren(...(cards.length ? [h('div', { class: 'rt-hgrid' }, ...cards)]
      : [h('p', { class: 'rt-hempty' }, P.q ? 'No link matches “' + P.q + '”.'
        : 'No share links yet. On the bench, Share link makes a short link to the bench as it is then: anyone who opens it sees that snapshot, and it is listed here.')]),
      helpLine('Each link opens the bench as it was when the link was made.', ['A share link is a snapshot: changing the bench afterwards does not change what the link opens. Share again for a new link to the bench as it is now. Delete a link here and it stops opening at once, for everyone; the benches themselves are not touched. Anyone with a link can open it without an account.'], 'rt-subsmall'));
    return;
  }
  // My parts: the parts kept, as cards with their pictures, to add to the bench, rename or delete
  if (P.view === 'parts') {
    const by = { changed: (a, b) => b.updated_at - a.updated_at, name: (a, b) => a.name.localeCompare(b.name), size: (a, b) => b.size_bytes - a.size_bytes }[homeView.sort] || ((a, b) => a.name.localeCompare(b.name));
    const words = P.q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = data.parts.filter(p => words.every(w => (p.name + ' ' + p.summary + ' ' + PALETTE_NAMES[p.palette]).toLowerCase().includes(w))).sort(by);
    const partsName = wsInfo && wsInfo.kind !== 'personal' ? 'Team parts' : 'My parts';
    crumbs.replaceChildren(link(top, go('folder', null)), sep, P.q ? partsName + ': “' + P.q + '”' : partsName);
    const cards = list.map(p => {
      const more = h('button', { type: 'button', class: 'rt-hmore', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'More for ' + p.name, title: 'More' }, '⋯');
      const add = () => { closeHome(); placeMine(p); };
      more.addEventListener('click', () => openHomeMenu(more, [
        ['Add to the bench', 'open', add],
        'sep',
        can ? ['Rename…', 'rename', () => { const name = (prompt('Rename the part', p.name) || '').trim(); if (name && name !== p.name) homeSay(() => api('/v1/parts/' + p.id, Object.assign({ method: 'PATCH' }, jsonBody({ name }))), 'Renamed')(); }] : null,
        writer ? ['Delete…', 'trash', () => { if (confirm('Delete “' + p.name + '” from ' + partsName + '? Benches it was added to keep their copies.')) homeSay(() => api('/v1/parts/' + p.id, { method: 'DELETE' }), 'Deleted “' + p.name + '”')(); }, 'danger'] : null]));
      return h('div', { class: 'rt-hcard rt-hpart', 'data-part': p.id },
        h('button', { type: 'button', class: 'rt-hopen', title: 'Add “' + p.name + '” to the bench', onclick: add },
          p.icon ? h('img', { class: 'thumb icon', src: p.icon, alt: '' }) : h('span', { class: 'thumb rt-nopic' }, 'No picture')),
        h('div', { class: 'rt-hinfo' },
          h('b', { title: p.name }, p.name),
          h('small', null, [p.summary, PALETTE_NAMES[p.palette], kb(p.size_bytes)].join(' · ')),
          h('small', null, 'Kept ' + whenAgo(p.created_at))),
        more);
    });
    box.replaceChildren(...(cards.length ? [h('div', { class: 'rt-hgrid' }, ...cards)]
      : [h('p', { class: 'rt-hempty' }, P.q ? 'No part matches “' + P.q + '”.'
        : 'No parts kept yet. On the bench, set up a part as you want it (a lens of your own, a tuned laser) or a whole assembly, select it, right-click and choose Save to My parts; or import lens files with Import .zmx files above. They are then on every bench, under + Add part › My parts and the rail’s ★.')]),
      helpLine('Your parts, on every bench and on any computer.', ['Parts you keep are on every bench, on any computer: under + Add part › ★ My parts, in its search, and behind the ★ on the bench’s parts rail. Deleting a part here leaves the benches it was added to as they are.'], 'rt-subsmall'));
    return;
  }
  // folders, then benches, as cards
  const bin = P.view === 'bin';
  const folderCards = P.view === 'folder' && !P.q ? folders.filter(f => (f.parent_id || null) === P.folder).sort((a, b) => a.name.localeCompare(b.name)).map(f => {
    const more = h('button', { type: 'button', class: 'rt-hmore', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'More for ' + f.name, title: 'More' }, '⋯');
    more.addEventListener('click', () => openHomeMenu(more, [
      ['Open', 'open', go('folder', f.id)],
      can ? ['Rename', 'rename', () => { const name = (prompt('Rename the folder', f.name) || '').trim(); if (name && name !== f.name) homeSay(() => api('/v1/workspaces/' + ws + '/folders/' + f.id, Object.assign({ method: 'PATCH' }, jsonBody({ name }))))(); }] : null,
      writer ? 'sep' : null,
      writer ? ['Delete', 'trash', homeSay(() => api('/v1/workspaces/' + ws + '/folders/' + f.id, { method: 'DELETE' }), 'Folder deleted'), 'danger'] : null]));
    return h('div', { class: 'rt-hcard folder' }, h('button', { type: 'button', class: 'rt-hopen', onclick: go('folder', f.id) }, homeIcon('folder'), h('span', null, f.name)), writer ? more : null);
  }) : [];
  let benches = data.benches.slice();
  if (!bin) {
    const by = { changed: (a, b) => b.updated_at - a.updated_at, name: (a, b) => a.name.localeCompare(b.name), size: (a, b) => b.size_bytes - a.size_bytes }[homeView.sort] || ((a, b) => b.updated_at - a.updated_at);
    benches.sort(P.view === 'recent' ? (a, b) => b.updated_at - a.updated_at : by);
    if (P.view === 'recent') benches = benches.slice(0, 24);
  }
  const team = wsInfo && wsInfo.kind !== 'personal';
  const benchCards = benches.map(b => {
    const mine = cloud && cloud.id === b.id;
    const more = h('button', { type: 'button', class: 'rt-hmore', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'More for ' + b.name, title: 'More' }, '⋯');
    const moveTo = () => {
      const sel = h('select', { 'aria-label': 'Move to folder' }, h('option', { value: '' }, top),
        ...folders.map(f => { const o = h('option', { value: f.id }, pathOf(f.id).map(x => x.name).join(' › ')); o.selected = f.id === b.folder_id; return o; }));
      sel.addEventListener('change', () => { closeHomeMenu(); homeSay(() => api('/v1/benches/' + b.id, Object.assign({ method: 'PATCH' }, jsonBody({ folder_id: sel.value || null }))), 'Moved')(); });
      openHomeMenu(more, [h('div', { class: 'rt-menunote' }, 'Move “' + b.name + '” to'), sel]);
    };
    more.addEventListener('click', () => openHomeMenu(more, bin ? [
      writer ? ['Restore', 'restore', homeSay(() => api('/v1/benches/' + b.id + '/undelete', { method: 'POST' }), 'Restored “' + b.name + '”')] : null,
      ['History', 'history', () => { Object.assign(P, { view: 'history', history: { id: b.id, name: b.name } }); fillHome(); }]] : [
      ['Open', 'open', () => homeOpenBench(b.id)],
      ['History', 'history', () => { Object.assign(P, { view: 'history', history: { id: b.id, name: b.name } }); fillHome(); }],
      can ? ['Fork…', 'fork', () => homeFork(b)] : null,
      copyPlaces(ws).length ? ['Copy to…', 'copy', () => setTimeout(() => homeCopy(b, more))] : null,
      'sep',
      can ? ['Rename…', 'rename', () => { const name = (prompt('Rename the bench', b.name) || '').trim(); if (name && name !== b.name) homeSay(async () => { await api('/v1/benches/' + b.id, Object.assign({ method: 'PATCH' }, jsonBody({ name }))); if (mine) { cloud.name = name; project.name = name; document.getElementById('projName').value = name; scheduleSave(); } })(); }] : null,
      can && folders.length ? ['Move to…', 'move', () => setTimeout(moveTo)] : null,
      writer ? ['Delete', 'trash', homeSay(async () => { await api('/v1/benches/' + b.id, { method: 'DELETE' }); if (mine) cloudLink(null); }, '“' + b.name + '” moved to the bin for 30 days'), 'danger'] : null]));
    const where = (P.q || P.view === 'recent') && b.folder_id && byId.get(b.folder_id) ? 'in ' + byId.get(b.folder_id).name : null;
    return h('div', { class: 'rt-hcard' + (mine ? ' here' : '') + (P.flash === b.id ? ' flash' : ''), 'data-bench': b.id },
      h('button', { type: 'button', class: 'rt-hopen', title: bin ? b.name : 'Open “' + b.name + '”', onclick: bin ? () => more.click() : () => homeOpenBench(b.id) },
        b.thumb ? h('img', { class: 'thumb', src: API_BASE + b.thumb, alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { class: 'thumb rt-nopic' }, 'No picture yet')),
      h('div', { class: 'rt-hinfo' },
        h('b', { title: b.name }, b.name),
        h('small', null, [mine ? 'Open on the bench' : null, bin ? 'Deleted ' + whenAgo(b.deleted_at) : 'Changed ' + whenAgo(b.updated_at) + (team && b.updated_by ? ' by ' + b.updated_by.name : ''), kb(b.size_bytes), where].filter(Boolean).join(' · ')),
        b.forked_from ? h('small', { class: 'rt-hfork', title: 'Forked from “' + b.forked_from.name + '”, version ' + b.forked_from.version }, homeIcon('fork'), 'from “' + b.forked_from.name + '”') : null,
        b.editing && account && b.editing.id !== account.user.id ? h('small', { class: 'rt-hwho', title: b.editing.name + ' has this bench open to edit' }, avatarNode(b.editing, 'small'), b.editing.name + ' is editing') : null),
      more);
  });
  P.flash = null;
  const out = [];
  if (folderCards.length) out.push(benchCards.length ? h('h3', null, 'Folders') : null, h('div', { class: 'rt-hgrid folders' }, ...folderCards));
  if (benchCards.length) out.push(folderCards.length ? h('h3', null, 'Benches') : null, h('div', { class: 'rt-hgrid' }, ...benchCards));
  if (!out.length) out.push(h('p', { class: 'rt-hempty' }, bin ? 'The bin is empty. Deleted benches stay here for 30 days.'
    : P.q ? 'No bench matches “' + P.q + '”.' : P.view === 'recent' ? 'Nothing yet.' : P.folder ? 'This folder is empty.'
    : 'No benches yet. Use Save to cloud in the File menu to put the bench you are working on here, or New bench to start one.'));
  box.replaceChildren(...out.filter(Boolean));
}
// everything but the page (and the dialogs, which may open over it) is out of reach while it is up
function homeInert(on) {
  const home = document.getElementById('home');
  for (const el of [...document.body.children, ...home.parentElement.children]) {
    if (el === home || el.contains(home) || el.tagName === 'SCRIPT' || el.tagName === 'DIALOG') continue;
    el.inert = on;
  }
}
export function openHome(push = true) {
  if (!cloudOn()) { toast(accountsOn() ? 'Sign in, top right, to see your benches' : 'Cloud benches are not available here', true); return; }
  const home = document.getElementById('home');
  Object.assign(cloudPlace, { q: '' });
  if (cloudPlace.view === 'history' || cloudPlace.view === 'bin') Object.assign(cloudPlace, { view: 'folder', history: null });
  // My parts opens from the picker's link; otherwise the page opens on the benches
  if (cloudPlace.view === 'parts' && !cloudPlace.toParts) cloudPlace.view = 'folder';
  cloudPlace.toParts = false;
  document.getElementById('homeSearch').value = '';
  home.hidden = false;
  homeInert(true);
  document.documentElement.style.overflow = 'hidden';
  if (push && location.hash !== '#benches') window.history.pushState(null, '', location.pathname + location.search + '#benches');
  fillHome();
  (matchMedia('(pointer: fine)').matches ? document.getElementById('homeSearch') : document.getElementById('homeBack')).focus();
}
function closeHome() {
  const home = document.getElementById('home');
  if (home.hidden) return;
  closeHomeMenu();
  home.hidden = true;
  homeInert(false);
  document.documentElement.style.overflow = '';
  if (location.hash === '#benches') window.history.replaceState(null, '', location.pathname + location.search);
  requestRender();
}
/* the toolbar's My benches button comes and goes with the account; the File menu's cloud items stay, greyed when not possible */
function cloudGates() {
  const on = cloudOn(), show = accountsOn(), why = proWhy();
  // share links are JEKrayPro's: the button marked Pro while they are not open
  const sb = document.getElementById('btnShare');
  if (sb) sb.classList.toggle('rt-proneed', show && !!why);
  document.getElementById('btnHome').hidden = !on;
  for (const id of ['btnCloudList', 'btnCloudSave', 'btnCloudFork']) document.getElementById(id).hidden = !show;
  if (!show) return;
  gateItem(document.getElementById('btnCloudList'), account ? '' : why);
  gateItem(document.getElementById('btnCloudSave'), why);
  gateItem(document.getElementById('btnCloudFork'), why || (cloud ? '' : 'This bench is not in the cloud yet: Save to cloud first'), why ? null : 'Not in the cloud');
}
export function cloudMenuShown() {
  const on = cloudOn();
  if (!on || (MINE.ws && personalWs() && MINE.ws !== personalWs().id)) { MINE.list = null; MINE.ws = null; }
  fillRail();
  cloudGates();
  if (!TEST_MODE && !on && cloud) cloudSay('Linked to the cloud: sign in to keep saving there');
  if (!on) closeHome();
}

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wireCloud() {
  hooks.proWhy = proWhy; hooks.proFix = proFix;
  setExpGate(() => (accountsOn() ? proWhy() : ''));    // experimental features are JEKrayPro's
  window.addEventListener('online', () => { if (cloud && cloud.dirty) cloudPush({ quiet: true }); });

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && cloud && cloud.dirty) cloudPush({ keepalive: true }); });

  try { Object.assign(homeView, JSON.parse(localStorage.getItem(HOME_KEY)) || {}); } catch (err) { /* defaults */ }

  document.addEventListener('pointerdown', e => { if (homeMenu && !homeMenu.el.contains(e.target) && e.target !== homeMenu.btn) closeHomeMenu(); }, true);

  {
    try { const v = !TEST_MODE && !EMBED && JSON.parse(localStorage.getItem(CLOUD_KEY)); if (v && v.id) setCloud(v); } catch (err) { /* none */ }
    document.getElementById('btnCloudSave').addEventListener('click', e => { if (!gated(e.currentTarget)) cloudSave(); });
    document.getElementById('btnCloudList').addEventListener('click', e => { if (!gated(e.currentTarget)) openHome(); });
    document.getElementById('btnHome').addEventListener('click', () => openHome());
    // Fork this bench: what is on the bench now becomes a new cloud bench, remembering this one
    document.getElementById('btnCloudFork').addEventListener('click', async e => {
      if (gated(e.currentTarget) || !cloud) return;
      const link = cloud, name = prompt('Name of the fork', (project.name || link.name) + ' (fork)');
      if (name === null) return;
      if (link.dirty && !(await cloudPush({ checkpoint: true }))) return;
      try {
        const f = await api('/v1/benches/' + link.id + '/fork', Object.assign({ method: 'POST' }, jsonBody({ name: name.trim() || undefined })));
        setCloudOpening(true);
        try { project.name = f.name; document.getElementById('projName').value = f.name; scheduleSave(); } finally { setCloudOpening(false); }
        cloudLink({ id: f.id, ws: f.workspace_id, version: f.version, name: f.name, dirty: false });
        toast('Forked: you are now working on “' + f.name + '”. “' + link.name + '” is as it was.');
      } catch (err) { toast(err.status === 402 ? 'Forking needs JEKrayPro.' : 'Could not fork: ' + err.message, true); }
    });
    document.getElementById('diffClose').addEventListener('click', () => document.getElementById('diffDialog').close());
    document.getElementById('mergeCancel').addEventListener('click', () => document.getElementById('mergeDialog').close());
    document.getElementById('cloudLockTake').addEventListener('click', async () => {
      if (!cloud) return;
      const name = lease.editing ? lease.editing.name : 'them';
      if (!confirm('Take over this bench from ' + name + '? They can no longer save it, and what you have here is saved over the cloud\u2019s copy (their last save stays in its history).')) return;
      await leaseRenew(true);
      if (lease.held) { toast('You are editing this bench now'); if (cloud.dirty) cloudPush({ checkpoint: true }); }
    });
    document.getElementById('cloudLockCopy').addEventListener('click', () => document.getElementById('btnCloudFork').click());
    window.addEventListener('pagehide', () => { if (cloud) leaseStop(cloud); });
    document.getElementById('homeBack').addEventListener('click', closeHome);
    // New bench on My benches' page: a cloud bench, in the workspace and folder shown
    document.getElementById('homeNew').addEventListener('click', () => newCloudBench(cloudPlace.ws, cloudPlace.view === 'folder' ? cloudPlace.folder : null));
    // Open a workspace: a new cloud bench here, opened straight into the lens designer, the RF designer or the coating workspace
    const wsBtn = document.getElementById('homeWs');
    wsBtn.addEventListener('click', () => {
      const into = then => () => newCloudBench(cloudPlace.ws, cloudPlace.view === 'folder' ? cloudPlace.folder : null, false, then);
      openHomeMenu(wsBtn, [['Optical designer', 'bench', into('lens')], ['RF designer', 'bench', into('rf')], ['Coating design', 'star', into('coat')]]);
    });

    const search = document.getElementById('homeSearch');
    let searchT = null;
    search.addEventListener('input', () => {
      clearTimeout(searchT);
      searchT = setTimeout(() => { Object.assign(cloudPlace, { q: search.value.trim(), history: null }); if (cloudPlace.view === 'history' || cloudPlace.view === 'bin') cloudPlace.view = 'folder'; fillHome(); }, 250);
    });
    // while the page is up, the bench's keys, copy and paste stay with the page
    const home = document.getElementById('home');
    for (const t of ['keydown', 'keyup', 'copy', 'cut', 'paste']) {
      home.addEventListener(t, e => e.stopPropagation());
      window.addEventListener(t, e => {
        if (!homeOpen()) return;
        if (t === 'keydown' && e.key === 'Escape' && !document.querySelector('dialog[open]')) {
          e.preventDefault();
          if (homeMenu) { const b = homeMenu.btn; closeHomeMenu(); b.focus(); } else closeHome();
          e.stopPropagation(); return;
        }
        if (!home.contains(e.target)) e.stopPropagation();
      }, true);
    }
    home.addEventListener('scroll', closeHomeMenu, true);
    window.addEventListener('resize', closeHomeMenu);
    // Back in the browser leaves the page as well
    window.addEventListener('popstate', () => { if (homeOpen() && location.hash !== '#benches') closeHome(); });
    document.getElementById('subClose').addEventListener('click', () => document.getElementById('subDialog').close());
  }

  {
    // the outcome of a sign-in, reported once, and taken out of the address
    const q = new URLSearchParams(location.search), outcome = q.get('jekauth'), code = q.get('jekauthcode');
    if (outcome) {
      q.delete('jekauth'); q.delete('jekauthcode');
      window.history.replaceState(window.history.state, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
      const m = AUTH_OUTCOMES[outcome];
      // the provider's own error code, when it gave one, so the reason can be looked up
      if (m) setTimeout(() => toast(m[0] + (code && /^[\w-]{1,40}$/.test(code) ? ' (Microsoft: ' + code + ')' : ''), m[1]), 600);
    }
    const billing = q.get('jekbilling');
    if (billing) {
      q.delete('jekbilling');
      window.history.replaceState(window.history.state, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
      if (billing === 'cancelled') setTimeout(() => toast('Payment cancelled: nothing was charged'), 600);
      if (billing === 'success' && accountsOn()) setTimeout(() => awaitPlan(), 300);
    }
    accountShown();
  }

}
