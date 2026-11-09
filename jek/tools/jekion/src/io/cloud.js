import { EMBED, TEST_MODE, cloud, cloudOpening, setCloud, setCloudOpening } from '../../../jekray/src/core/constants.js';
import { hooks } from '../../../jekray/src/core/hooks.js';
import { designPro, needsShown } from '../../../jekray/src/ui/pro.js';
import { track } from '../../../jekray/src/io/usage.js';
import { project } from '../state/project.js';
import { serialize } from '../state/elements.js';
import { h } from '../ui/panel.js';
import { markUnsaved, setStatus, toast } from '../ui/actions.js';
import { canvas } from '../ui/render.js';
import { openProjectData, scheduleSave } from './open.js';
import { ION_API, account, accountsOn, api, fillAccount, setAccount, showSignIn } from './account.js';

/* ==========================================================================
   Cloud benches, as JEKray's: the same accounts, workspaces and API, so a person's My benches holds both tools'
   benches, each marked with its tool (the API keeps a bench's tool from its content: a .jekion is JEKion's for good).
   A bench opened from, or saved to, the cloud stays linked to it: `cloud` holds its id, workspace and the version
   this copy is based on. Edits save themselves at most every 30 seconds and when the page is hidden; Save to cloud
   also keeps a version in its history. A save based on an older version than the cloud's is refused by the API
   (409), and the person chooses what to keep. Whoever has a bench open to edit holds its lease, renewed every
   minute; opening one someone else is editing shows who, to take over or work on a copy. Offline, the bench stays
   in this browser's autosave and goes up when the connection returns: the link is kept with the autosave.
   ========================================================================== */
const CLOUD_KEY = 'jek-ion-cloud-link', CLOUD_EVERY = 30000, CLOUD_RETRY = 60000, LEASE_EVERY = 60000;
const JEKRAY_URL = '/jek/tools/jekray.html';
let cloudTimer = null, cloudBusy = false, cloudAgain = false;
export const lease = { held: false, editing: null, timer: null };
const jsonBody = body => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const cloudOn = () => accountsOn() && !!account;
export const whenAgo = t => {
  const d = new Date(t), s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return new Date().toDateString() === d.toDateString() ? 'today ' + hm : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) + ' ' + hm;
};
/* ---------- the link to the cloud, kept with the autosave ---------- */
function cloudKeep() {
  if (TEST_MODE || EMBED) return;
  try { if (cloud) localStorage.setItem(CLOUD_KEY, JSON.stringify(cloud)); else localStorage.removeItem(CLOUD_KEY); } catch (err) { /* no store */ }
}
export function cloudRestore() {
  if (TEST_MODE || EMBED) return;
  try { const l = JSON.parse(localStorage.getItem(CLOUD_KEY) || 'null'); if (l && l.id) setCloud(l); } catch (err) { setCloud(null); }
}
export function cloudLink(link) {
  if (cloud && (!link || link.id !== cloud.id)) leaseStop(cloud);
  setCloud(link); clearTimeout(cloudTimer);
  cloudKeep(); cloudSay(link ? 'Saved to the cloud' : '');
  cloudGates();
  leaseStart();
}
function cloudSay(text) { setStatus(cloud ? text : 'Autosaved in this browser'); }
const cloudContent = () => JSON.stringify(serialize());
/* ---------- the editing lease ---------- */
async function leaseStart() {
  clearTimeout(lease.timer); lease.timer = null;
  Object.assign(lease, { held: false, editing: null });
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
  // the cloud moved on (someone took over and saved, or another tab did): follow it when nothing here would be lost
  if (r.version > link.version) {
    if (!link.dirty) { try { await cloudOpen(link.id); toast((r.updated_by ? r.updated_by.name : 'Someone') + ' saved a newer version of this bench: it is shown now'); } catch (err) { /* the next renewal tries again */ } return; }
    else if (was && !r.held) toast((r.updated_by ? r.updated_by.name : 'Someone') + ' took over this bench and saved it. Your changes here are not in the cloud: take it back, or work on a copy.', true);
  }
  if (!r.held && lease.editing) { cloudSay('Not saved: ' + lease.editing.name + ' is editing'); if (!was && !take) lockAsk(); }
  else if (was !== r.held && r.held) cloudSay(link.dirty ? 'Saving to the cloud…' : 'Saved to the cloud');
}
function leaseStop(link) {
  clearTimeout(lease.timer); lease.timer = null;
  if (!link || !cloudOn() || TEST_MODE || !lease.held) return;
  lease.held = false;
  fetch(ION_API + '/v1/benches/' + link.id + '/lease', { method: 'DELETE', credentials: 'include', keepalive: true }).catch(() => {});
}
/* someone else is editing the bench just opened: look, take over, or work on a copy */
function lockAsk() {
  const dlg = document.getElementById('cloudLockDialog'), e = lease.editing, link = cloud;
  if (!dlg || !e || dlg.open) return;
  document.getElementById('cloudLockText').textContent = e.name + ' has “' + link.name + '” open to edit. You can look at it (changes you make stay in this browser), take over (their unsaved changes stay with them), or carry on in a copy of your own.';
  const done = () => dlg.close();
  document.getElementById('clLook').onclick = done;
  document.getElementById('clTake').onclick = async () => { done(); await leaseRenew(true); if (lease.held) { toast('Taken over: this bench saves from here now'); if (link.dirty) cloudPush({ checkpoint: true }); } };
  document.getElementById('clCopy').onclick = async () => { done(); await keepAsCopy(link, ' (my copy)'); };
  dlg.showModal();
}
/* ---------- saving ---------- */
export function cloudChanged() {
  if (!cloud || cloudOpening) return;          // opening replaces the bench: not an edit of the old link
  if (!cloud.dirty) { cloud.dirty = true; cloudKeep(); }
  if (!cloudOn()) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => cloudPush(), CLOUD_EVERY);
}
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
      body: JSON.stringify({ content, name: project.name, checkpoint: !!opts.checkpoint }),
    });
    if (cloud !== link) return false;                       // another bench was opened meanwhile
    link.version = out.version; link.dirty = cloudAgain; link.name = out.name;
    if (!link.dirty) markUnsaved(false);
    cloudKeep();
    cloudSay('Saved to the cloud ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    if (!opts.keepalive) cloudThumb(link, opts.checkpoint);
    return true;
  } catch (err) {
    if (cloud !== link) return false;
    if (err.status === 409) {
      // the same bench as here (saved as the page closed, before its new version was noted): no clash, a newer number
      try {
        const head = await api('/v1/benches/' + link.id), same = (x, y) => { const a = JSON.parse(x), b = JSON.parse(y); return JSON.stringify(a) === JSON.stringify(b); };
        if (cloud === link && same(head.content, cloudContent())) { link.version = head.version; link.dirty = false; cloudKeep(); cloudSay('Saved to the cloud'); return true; }
      } catch (e2) { /* fall through to asking */ }
      if (cloud !== link) return false;
      cloudSay('Not saved: changed somewhere else'); cloudConflict(err.version, err.updated_by, err.updated_at);
    }
    else if (err.status === 423) {
      lease.held = false; lease.editing = err.editing || lease.editing;
      cloudSay('Not saved: ' + (lease.editing ? lease.editing.name : 'someone') + ' is editing');
      if (!opts.quiet && !opts.keepalive) lockAsk();
    }
    else if (err.status === 402) { cloudSay('Not saved to the cloud: that needs JEKrayPro'); if (!opts.quiet) toast('Saving to the cloud needs JEKrayPro: subscribe from the account menu in JEKray. This bench is still kept in this browser.', true); }
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
const placeName = w => (w.kind === 'personal' ? 'My benches' : w.name);
/* the workspaces a bench can be saved to: the person's own, and a team they edit in with a plan */
const newPlaces = () => (account ? account.workspaces : []).filter(w => w.kind === 'personal' || (w.kind !== 'institution' && w.active && ['owner', 'admin', 'editor'].includes(w.role || 'owner')));
/* Save to cloud: a new cloud bench, or a kept version of the linked one */
async function cloudSave() {
  if (!cloudOn()) { showSignIn('cloud', 'save this bench to the cloud'); return; }
  if (!designPro('save to the cloud')) return;
  if (cloud) { if (await cloudPush({ checkpoint: true })) toast('Saved to the cloud, and kept in its history'); return; }
  newCloudBench(personalWs().id);
}
/* the bench put in the cloud, in My benches or in a team: asked where it goes and its name */
export function newCloudBench(ws) {
  if (!cloudOn()) return;
  const places = newPlaces();
  if (!places.length) return;
  let dlg = document.getElementById('cloudNewDialog');
  if (dlg) dlg.remove();
  const name = h('input', { type: 'text', id: 'cloudNewName', value: project.name || 'Untitled bench', spellcheck: 'false', maxlength: '120' });
  const where = h('select', { id: 'cloudNewWhere' }, ...places.map(w => h('option', { value: w.id }, placeName(w))));
  where.value = places.some(w => w.id === ws) ? ws : places[0].id;
  const note = h('p', { class: 'rt-subsmall' });
  const sayWhere = () => { const w = places.find(x => x.id === where.value); note.textContent = (w.kind === 'personal' ? 'Yours alone, in My benches' : 'Shared with everyone in ' + w.name + ', who can open and edit it as their role allows') + '. It then saves there as you work, and JEKray’s My benches lists it too, marked JEKion.'; };
  where.addEventListener('change', sayWhere); sayWhere();
  const go = h('button', { class: 'rt-btn primary', type: 'button', id: 'cloudNewMake' }, 'Save');
  dlg = h('dialog', { class: 'rt-dialog', id: 'cloudNewDialog', 'aria-labelledby': 'cloudNewTitle' },
    h('h2', { id: 'cloudNewTitle' }, 'Save to the cloud'),
    h('div', { class: 'rt-rows' }, h('div', { class: 'rt-f wide' }, h('label', { for: 'cloudNewName' }, 'Name'), name), h('div', { class: 'rt-f wide' }, h('label', { for: 'cloudNewWhere' }, 'In'), where)),
    note,
    h('div', { class: 'rt-actions' }, h('button', { class: 'rt-btn', type: 'button', onclick: () => dlg.close() }, 'Cancel'), go));
  document.body.append(dlg);
  go.addEventListener('click', async () => {
    const wsId = where.value, nm = name.value.trim() || 'Untitled bench';
    go.disabled = true;
    try {
      project.name = nm; document.getElementById('projName').value = nm; scheduleSave();
      const b = await api('/v1/workspaces/' + wsId + '/benches', Object.assign({ method: 'POST' }, jsonBody({ name: nm, content: cloudContent() })));
      dlg.close();
      const w = places.find(x => x.id === wsId);
      cloudLink({ id: b.id, ws: b.workspace_id, version: b.version, name: b.name, dirty: false });
      markUnsaved(false);
      cloudThumb(cloud, true);
      track('save', 'ion-cloud');
      toast('Saved to the cloud: “' + b.name + '” is in ' + placeName(w) + ', and saves there as you work');
    } catch (err) {
      go.disabled = false;
      toast(err.status === 402 ? (places.find(x => x.id === wsId).kind === 'personal' ? 'Benches in the cloud need JEKrayPro.' : 'That team has no active plan.') : 'Could not save the bench: ' + err.message, true);
    }
  });
  dlg.showModal();
  name.select();
}
/* this bench kept as a copy of its own in the same workspace (a conflict, or someone else's lease) */
async function keepAsCopy(link, suffix) {
  try {
    const b = await api('/v1/workspaces/' + link.ws + '/benches', Object.assign({ method: 'POST' }, jsonBody({ name: project.name + suffix, content: cloudContent() })));
    project.name = b.name; document.getElementById('projName').value = b.name;
    cloudLink({ id: b.id, ws: b.workspace_id, version: b.version, name: b.name, dirty: false });
    toast('Kept yours as “' + b.name + '”');
  } catch (err) { toast(err.message, true); }
}
/* Fork this bench: a new cloud bench from the linked one as it is now, which this page carries on in */
async function cloudFork() {
  if (!cloud || !cloudOn()) return;
  if (!designPro('fork a bench')) return;
  const name = (prompt('Name of the fork', (cloud.name || project.name) + ' (fork)') || '').trim();
  if (!name) return;
  try {
    if (cloud.dirty) await cloudPush({ quiet: true });
    const f = await api('/v1/benches/' + cloud.id + '/fork', Object.assign({ method: 'POST' }, jsonBody({ name })));
    project.name = f.name; document.getElementById('projName').value = f.name; scheduleSave();
    cloudLink({ id: f.id, ws: f.workspace_id, version: f.version, name: f.name, dirty: false });
    track('save', 'ion-fork');
    toast('Forked: you are now working on “' + f.name + '”');
  } catch (err) { toast('Could not fork: ' + err.message, true); }
}
/* ---------- the picture ---------- */
const THUMB_W = 320, THUMB_H = 200, THUMB_EVERY = 2 * 60 * 1000;
function benchThumb() {
  return new Promise(resolve => {
    try {
      if (!canvas || !canvas.width || !canvas.height) return resolve(null);
      const cv = document.createElement('canvas'); cv.width = THUMB_W; cv.height = THUMB_H;
      const c = cv.getContext('2d'), sw = canvas.width, sh = canvas.height;
      // the middle of the view, cut to 8:5
      let w = sw, hh = sw * THUMB_H / THUMB_W; if (hh > sh) { hh = sh; w = sh * THUMB_W / THUMB_H; }
      c.imageSmoothingQuality = 'high';
      c.drawImage(canvas, (sw - w) / 2, (sh - hh) / 2, w, hh, 0, 0, THUMB_W, THUMB_H);
      cv.toBlob(b => { if (b && b.size <= 120000) return resolve(b); cv.toBlob(j => resolve(j && j.size <= 120000 ? j : null), 'image/jpeg', 0.75); }, 'image/webp', 0.8);
    } catch (err) { resolve(null); }
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
/* ---------- opening ---------- */
async function cloudOpen(id, version) {
  const b = await api('/v1/benches/' + id + (version ? '/versions/' + version : ''));
  const meta = version ? await api('/v1/benches/' + id) : b;
  if (meta.tool === 'jekray') { const w = window.open(JEKRAY_URL + '#cloud=' + id + (version ? '@' + version : ''), 'jekray'); if (w) w.focus(); toast('“' + meta.name + '” is a JEKray bench: opened in JEKray'); return; }
  setCloudOpening(true);
  try { if (!openProjectData(JSON.parse(b.content), '“' + (meta.name || 'bench') + '”' + (version ? ', version ' + version : '') + ' from the cloud')) return; }
  finally { setCloudOpening(false); }
  // an old version opens as a copy: Save to cloud makes it a new bench
  if (version) { cloudLink(null); toast('Version ' + version + ' of “' + meta.name + '” opened as a copy: Save to cloud puts it in the cloud as a bench of its own'); }
  else { cloudLink({ id: meta.id, ws: meta.workspace_id, version: meta.version, name: meta.name, dirty: false }); markUnsaved(false); }
}
/* a cloud bench by its id (#cloud=<id>, or #cloud=<id>@<version> for a copy of a version) */
export async function openCloudBench(id, version) {
  if (!accountsOn()) return;
  try { if (cloud && cloud.dirty && cloud.id !== id) await cloudPush({ quiet: true }); await cloudOpen(id, version); }
  catch (err) { toast(err.status === 401 ? 'Sign in, top right, to open that bench' : err.status === 404 ? 'That bench is not available to you' : err.message, true); }
}
/* the conflict: someone saved this bench elsewhere since this copy was opened */
function cloudConflict(theirs, by, at) {
  const dlg = document.getElementById('cloudConflict'), link = cloud;
  const who = by && account && by.id !== account.user.id ? 'by ' + by.name : 'from another tab or device';
  document.getElementById('cloudConflictText').textContent = '“' + link.name + '” was saved ' + who + (at ? ' ' + whenAgo(at) : '') + ' (version ' + theirs + ') after you opened it here. Which do you want to keep?';
  const done = () => dlg.close();
  document.getElementById('ccTheirs').onclick = async () => { done(); try { await cloudOpen(link.id); } catch (err) { toast(err.message, true); } };
  document.getElementById('ccCopy').onclick = async () => { done(); await keepAsCopy(link, ' (my copy)'); };
  document.getElementById('ccMine').onclick = () => { done(); cloudPush({ over: theirs, checkpoint: true }); };
  if (!dlg.open) dlg.showModal();
}
/* ---------- My benches ----------
   The home of every bench, JEKion's with JEKray's, is JEKspace (jek/tools/jekspace.html), the JEK hub: places and
   folders down the side, the benches as cards with their pictures, each one's history and forks, the bin, parts and
   links, the account and teams. It opens in its own tab (each app's and the hub's tab named, so they hand benches to
   each other without multiplying tabs), and a JEKion bench chosen there opens back here (#cloud=<id>). */
const SPACE_URL = '/jek/tools/jekspace.html';
export function openCloudList() {
  if (!accountsOn()) { toast('Accounts are not available here', true); return; }
  track('view', 'ion-benches');
  const w = window.open(SPACE_URL, 'jekspace'); if (w) w.focus();
}
/* ---------- the gates and the wiring ---------- */
export function cloudGates() {
  const show = accountsOn();
  for (const id of ['btnCloudList', 'btnCloudSave', 'btnCloudFork']) { const el = document.getElementById(id); if (el) el.hidden = !show; }
  if (!show) return;
  needsShown();
  const fork = document.getElementById('btnCloudFork');
  fork.disabled = !cloud; fork.title = cloud ? 'Carry on in a new cloud bench, leaving this one as it is' : 'This bench is not in the cloud yet: Save to cloud first';
}
export function wireCloud() {
  hooks.ionAccountChanged = () => { cloudGates(); leaseStart(); if (cloud && cloud.dirty && cloudOn()) cloudPush({ quiet: true }); };
  if (!accountsOn()) { cloudGates(); return; }
  cloudRestore();
  cloudGates();
  document.getElementById('btnCloudList').addEventListener('click', openCloudList);
  document.getElementById('btnCloudSave').addEventListener('click', cloudSave);
  document.getElementById('btnCloudFork').addEventListener('click', cloudFork);
  // the page hidden or closed: what is unsaved goes up at once, and the lease is let go
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && cloud && cloud.dirty) cloudPush({ keepalive: true, quiet: true }); });
  window.addEventListener('pagehide', () => { if (cloud && cloud.dirty) cloudPush({ keepalive: true, quiet: true }); leaseStop(cloud); });
  if (cloud) cloudSay(cloud.dirty ? 'Not yet saved to the cloud' : 'Saved to the cloud');
}
