import { EMBED, TEST_MODE, cloud, cloudOpening, setCloud, setCloudOpening } from '../core/constants.js';
import { hooks } from '../core/hooks.js';
import { V, project } from '../state/project.js';
import { serialize } from '../state/elements.js';
import { onTab } from '../state/tabs.js';
import { setExporting } from '../engines/trace.js';
import { H, W, canvas, halfSize, render, requestRender, setThumbing, sx, sy } from '../ui/render.js';
import { h } from '../ui/dom.js';
import { markUnsaved, setStatus, toast } from '../ui/actions.js';
import { openProjectData } from './open.js';
import { KIND_WORD, diffProject, merge3, resolve, showValue } from './merge.js';
import { setExpGate } from '../ui/experimental.js';
import { needsShown } from '../ui/pro.js';
import { fillRail } from '../ui/rail.js';
import { MINE } from '../ui/myparts.js';
import { API_BASE, AUTH_OUTCOMES, account, accountShown, accountsOn, api, avatarNode, awaitPlan, fillAccount, setAccount, showSubscribe } from './account.js';
import { gateSignIn } from './nudges.js';
import { keepSnapshot, scheduleSave } from './autosave.js';
import { loadTasters } from './tasters.js';
import { newProject } from '../ui/tours.js';
import { newLensDesign } from '../ui/assembly.js';
import { newRfDesign } from '../ui/rf-workspace.js';
import { noteRecent } from './recent.js';

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
  hooks.cloudLinked(link);
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
/* the way to make it possible: signed out, what it needs and the ways in (gateSignIn; kind 'exp' for the experimental
   features, which an account is enough for); signed in, the subscribe dialog. what: what was asked for, as 'optimise a design' */
export function proFix(what, kind) {
  // after the menu the click came from has closed
  setTimeout(() => { if (!account) gateSignIn(kind === 'exp' || kind === 'acct' ? kind : 'pro', typeof what === 'string' ? what : ''); else if (kind !== 'exp' && kind !== 'acct' && !hooks.tasterOut(what)) showSubscribe(); });
}
/* a menu item present but greyed when it is not possible, saying why: clicked, it explains and offers the fix.
   badge: 'pro' (the Pro badge, the default) or 'account' (Free account) for what is missing, or a word of its own */
export function gateItem(el, why, badge) {
  const off = !!why, chip = !badge || badge === 'pro' || badge === 'account';
  el.hidden = false;
  el.classList.toggle('rt-off', off);
  el.setAttribute('aria-disabled', off ? 'true' : 'false');
  if (el.dataset.title === undefined) el.dataset.title = el.title || '';
  el.title = off ? why : el.dataset.title;
  el.dataset.why = off ? why : '';
  el.classList.toggle('rt-proneed', off && chip && badge !== 'account');
  el.classList.toggle('rt-acctneed', off && badge === 'account');
  let k = el.querySelector('.k.rt-why');
  if (off && !chip) { if (!k) { k = h('span', { class: 'k rt-why' }); el.append(k); } k.textContent = badge; }
  else if (k) k.remove();
}
/* a gated item's click: true when it was off (explained, and the fix offered), so the handler stops */
export function gated(el) {
  if (!el.dataset.why) return false;
  // signed out, the card says it all; signed in, why it is off, and the plans
  if (account) toast(el.dataset.why, true);
  if (el.dataset.why.startsWith('Sign in') || account) proFix(el.dataset.what || (el.textContent || '').replace(/\s*(Pro|Free account)\s*$/, '').replace(/…$/, '').trim().replace(/^My /, 'open your ').toLowerCase(), el.classList.contains('rt-acctneed') ? 'acct' : 'pro');
  else toast(el.dataset.why, true);
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
      toast('“' + b.name + '” is made ' + (w.kind === 'personal' ? 'in My benches' : 'in ' + w.name) + ', and open on the bench: it saves there as you work');
      // straight into a workspace: a starting design on the new bench, or the coating workspace on its own
      if (then === 'lens') newLensDesign(); else if (then === 'rf') newRfDesign(); else if (then === 'coat') hooks.designInFilm(null);
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
  if (meta.tool === 'jekion') { openInJekion(meta, version); toast('“' + meta.name + '” is a JEKion bench: opened in JEKion'); return; }
  // a coating, by its mark or by its content (one saved by an API from before JEKfilm is marked JEKray's)
  const fmt = (() => { try { return JSON.parse(b.content).format; } catch (err) { return null; } })();
  if (meta.tool === 'jekfilm' || fmt === 'jekfilm') { openInJekfilm(meta, version); toast('“' + meta.name + '” is a JEKfilm coating: opened in JEKfilm'); return; }
  setCloudOpening(true);
  try { openProjectData(JSON.parse(b.content), '“' + (meta.name || 'bench') + '”' + (version ? ', version ' + version : '') + ' from the cloud'); }
  finally { setCloudOpening(false); }
  // an old version opens as a copy: Save to cloud makes it a new bench
  if (version) cloudLink(null);
  else { cloudLink({ id: meta.id, ws: meta.workspace_id, version: meta.version, name: meta.name, dirty: false }); noteRecent({ kind: 'cloud', id: meta.id, label: meta.name || 'Cloud bench' }); }
}
// a cloud bench opened by its id (File › Open recent, #cloud=<id>, or #cloud=<id>@<version> for a copy of a version)
export const openCloudBench = (id, version) => cloudOpen(id, version);
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
/* ---------- My benches: JEKsuite ----------
   Every cloud bench, of every app, is on JEKsuite (jek/tools/jekspace.html), the JEK hub, opened in a tab of its own
   (named, so it is the same tab each time): the bar's cloud button, File › My benches, #benches and My parts' Manage
   link open it there. A bench opened from it comes back here as #cloud=<id>. */
export const SPACE_URL = '/jek/tools/jekspace.html';
export function openSpace(hash) { const w = window.open(SPACE_URL + (hash ? '#' + hash : ''), 'jekspace'); if (w) w.focus(); }
// where Save to cloud puts a bench first: the person's own workspace
export const cloudPlace = { ws: null, folder: null };
const whenAgo = t => {
  const d = new Date(t), s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return new Date().toDateString() === d.toDateString() ? 'today ' + hm : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) + ' ' + hm;
};
/* a JEKion bench (the same workspaces hold both tools' benches) opens in JEKion, in a tab of its own */
const JEKION_URL = '/jek/tools/jekion.html';
const openInJekion = (b, version) => { const w = window.open(JEKION_URL + '#cloud=' + b.id + (version ? '@' + version : ''), 'jekion'); if (w) w.focus(); };    // the one JEKion tab, named
const JEKFILM_URL = '/jek/tools/jekfilm.html';
const openInJekfilm = (b, version) => { const w = window.open(JEKFILM_URL + '#cloud=' + b.id + (version ? '@' + version : ''), 'jekfilm'); if (w) w.focus(); };    // the one JEKfilm tab
// the workspaces (but one) the person can save a bench to: a copy goes to one of them
export const copyPlaces = (notWs) => (account ? account.workspaces : []).filter(w => w.id !== notWs && w.kind !== 'institution' && w.active && ['owner', 'admin', 'editor'].includes(w.role || 'owner'));
const placeName = w => w.kind === 'personal' ? 'My benches' : w.name;
/* ---------- merging a save conflict ----------
   This copy's changes and the cloud's newer version, item by item (src/io/merge.js), over the version this copy
   came from. The cloud's is kept as a version first ("Before merging"), the merged bench is opened on the bench
   to look at, and its next save is a labelled version. Comparing versions and merging forks are JEKsuite's. */
function diffNodes(d, fromName, toName) {
  if (!d.count) return [h('p', null, 'No difference between ' + fromName + ' and ' + toName + '.')];
  const word = i => KIND_WORD[i.kind] + ' ' + i.label;
  const rows = d.items.map(i => h('li', null, h('span', { class: 'tag ' + i.change }, i.change), word(i),
    i.fields ? h('span', { class: 'fields' }, i.fields.map(f => f.key + ': ' + showValue(f.from) + ' to ' + showValue(f.to)).join(' · ')) : null));
  const sets = d.settings.map(f => h('li', null, h('span', { class: 'tag changed' }, 'setting'), f.key, h('span', { class: 'fields' }, showValue(f.from) + ' to ' + showValue(f.to))));
  return [h('p', null, 'From ' + fromName + ' to ' + toName + ': ' + d.count + (d.count === 1 ? ' change.' : ' changes.')), h('ul', { class: 'rt-difflist' }, ...rows, ...sets)];
}
const versionContent = async (id, v) => JSON.parse((await api('/v1/benches/' + id + '/versions/' + v)).content);
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
      dlg.close();
      toast(o.toastWord);
    } catch (err) {
      toast(err.status === 423 ? (err.editing ? err.editing.name : 'Someone') + ' is editing “' + target.name + '”: merge when they are done.' : err.status === 409 ? '“' + target.name + '” changed just now: open the merge again.' : err.message, true);
      go.disabled = false;
    }
  };
}
/* the File menu's cloud items: there with accounts, greyed when not possible (JEKsuite's mark at the bar's left is always there) */
function cloudGates() {
  const show = accountsOn(), why = proWhy();
  loadTasters(!!account && !!why);                     // signed in without a plan: this month's free uses
  // the badges (Pro, Free account) on what needs them, Share link among them, shown while it is needed
  needsShown();
  for (const id of ['btnCloudList', 'btnCloudSave', 'btnCloudFork']) document.getElementById(id).hidden = !show;
  if (!show) return;
  gateItem(document.getElementById('btnCloudList'), account ? '' : why, 'account');
  gateItem(document.getElementById('btnCloudSave'), why);
  gateItem(document.getElementById('btnCloudFork'), why || (cloud ? '' : 'This bench is not in the cloud yet: Save to cloud first'), why ? null : 'Not in the cloud');
}
export function cloudMenuShown() {
  const on = cloudOn();
  if (!on || (MINE.ws && personalWs() && MINE.ws !== personalWs().id)) { MINE.list = null; MINE.ws = null; }
  fillRail();
  cloudGates();
  if (!TEST_MODE && !on && cloud) cloudSay('Linked to the cloud: sign in to keep saving there');
}

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wireCloud() {
  hooks.proWhy = proWhy; hooks.proFix = proFix;
  setExpGate(() => (accountsOn() && !account ? 'Sign in, top right, to use experimental features: a free account is enough' : ''));    // any account: a free one or JEKrayPro
  window.addEventListener('online', () => { if (cloud && cloud.dirty) cloudPush({ quiet: true }); });

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && cloud && cloud.dirty) cloudPush({ keepalive: true }); });

  {
    try { const v = !TEST_MODE && !EMBED && JSON.parse(localStorage.getItem(CLOUD_KEY)); if (v && v.id) setCloud(v); } catch (err) { /* none */ }
    document.getElementById('btnCloudSave').addEventListener('click', e => { if (!gated(e.currentTarget)) cloudSave(); });
    document.getElementById('btnCloudList').addEventListener('click', e => { if (!gated(e.currentTarget)) openSpace(); });
    // JEKsuite's mark at the bar's far left, always there (JEKsuite signs people in itself): its own tab, the same one
    // each time, brought to the front
    document.getElementById('btnSpace').addEventListener('click', e => { e.preventDefault(); const w = window.open(e.currentTarget.href, 'jekspace'); if (w) w.focus(); });
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
