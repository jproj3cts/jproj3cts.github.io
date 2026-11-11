import { EMBED, TEST_MODE } from '../../../jekray/src/core/constants.js';
import { hooks } from '../../../jekray/src/core/hooks.js';
import { designPro } from '../../../jekray/src/ui/pro.js';
import { track } from '../../../jekray/src/io/usage.js';
import { API_BASE, account, accountLoaded, accountsOn, api, fillAccount, setAccount } from '../../../jekray/src/io/account.js';
import { h } from '../../../jekray/src/ui/dom.js';
import { filmText } from '../core/film.js';
import { film, filmCurves, render } from '../ui/designer.js';
import { setStatus, toast } from '../ui/bar.js';
import { filmAutosave, openFilmData } from './files.js';

/* ==========================================================================
   Coatings in the cloud: the same accounts, workspaces, folders and API as every JEK app's benches, so a coating sits
   in a folder beside the benches that use it, with its history, forks and the bin, all on JEKsuite. The API keeps a
   coating's tool from its content (format 'jekfilm'): it opens here, and no other app's file saves over it. Keeping a
   coating in the cloud is JEKrayPro's (the API refuses it otherwise, 402). A coating opened from, or saved to, the
   cloud stays linked to it (filmLink: its id, workspace, the version this copy is based on): changes save themselves
   after 30 seconds and when the page is hidden, Save to cloud keeps a version in its history. A save on an older
   version than the cloud's is refused (409), and the person chooses which to keep.
   ========================================================================== */
const FILM_LINK_KEY = 'jek-film-cloud-link', FILM_CLOUD_EVERY = 30000;
export const SPACE_URL = '/jek/tools/jeksuite.html';
export let filmLink = null;
/* the JEKray face this coating is designed for (#design=…): { face, label, ws, folder }, until it goes back */
export let filmFor = null;
export function setFilmFor(v) { filmFor = v; forShown(); }
function forShown() {
  const bar = document.getElementById('filmFor');
  if (!bar) return;
  bar.hidden = !filmFor;
  if (filmFor) bar.replaceChildren(h('b', null, 'For JEKray: ' + filmFor.label + '. '), 'Save it to the cloud (File › Save to cloud…) and it goes onto that face, linked to this coating.',
    h('button', { class: 'rt-link', type: 'button', onclick: () => setFilmFor(null) }, 'Not for that face'));
}
let filmCloudTimer = null, filmCloudBusy = false;
const filmJson = body => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const filmCloudOn = () => accountsOn() && !!account;
function linkKeep() {
  if (TEST_MODE || EMBED) return;
  try { if (filmLink) localStorage.setItem(FILM_LINK_KEY, JSON.stringify(filmLink)); else localStorage.removeItem(FILM_LINK_KEY); } catch (err) { /* no store */ }
}
export function linkRestore() {
  if (TEST_MODE || EMBED) return;
  try { const l = JSON.parse(localStorage.getItem(FILM_LINK_KEY) || 'null'); filmLink = l && l.id ? l : null; } catch (err) { filmLink = null; }
}
export function setFilmLink(link) {
  if (filmLink && (!link || link.id !== filmLink.id)) leaseStop(filmLink);
  filmLink = link; clearTimeout(filmCloudTimer);
  linkKeep(); cloudShown();
  leaseStart();
}
/* ---------- the editing lease ----------
   As every JEK app's: whoever has a cloud coating open to edit holds its lease, renewed every minute, so JEKsuite shows
   who is editing it and a save against someone else's lease is refused (423). Opening one someone else is editing
   says who, to look (changes stay in this browser), take over, or carry on in a copy. */
const FILM_LEASE_EVERY = 60000;
export const filmLease = { held: false, editing: null, timer: null };
async function leaseStart() {
  clearTimeout(filmLease.timer); filmLease.timer = null;
  Object.assign(filmLease, { held: false, editing: null });
  if (!filmLink || !filmCloudOn() || TEST_MODE) return;
  await leaseRenew();
}
export async function leaseRenew(take) {
  const link = filmLink;
  if (!link || !filmCloudOn()) return;
  let r = null;
  try { r = await api('/v1/benches/' + link.id + '/lease', Object.assign({ method: 'POST' }, filmJson(take ? { take: true } : {}))); }
  catch (err) {
    if (filmLink !== link) return;
    if (err.status === 404) { toast('That coating is no longer in the cloud (it may be in the bin). This copy is kept in this browser.', true); setFilmLink(null); return; }
    if (err.status === 401) { setAccount(null); fillAccount(); return; }
  } finally {
    if (filmLink === link) { clearTimeout(filmLease.timer); filmLease.timer = setTimeout(() => leaseRenew(), FILM_LEASE_EVERY); }
  }
  if (!r || filmLink !== link) return;
  const was = filmLease.held;
  filmLease.held = !!r.held; filmLease.editing = r.editing && account && r.editing.id !== account.user.id ? r.editing : null;
  // the cloud moved on (someone took over and saved): follow it when nothing here would be lost
  if (r.version > link.version && !link.dirty) { try { await openCloudFilm(link.id); toast((r.updated_by ? r.updated_by.name : 'Someone') + ' saved a newer version of this coating: it is shown now'); } catch (err) { /* the next renewal tries again */ } return; }
  if (!r.held && filmLease.editing) { setStatus('not saved: ' + filmLease.editing.name + ' is editing'); if (!was && !take) filmLockAsk(); }
  cloudShown();
}
function leaseStop(link) {
  clearTimeout(filmLease.timer); filmLease.timer = null;
  if (!link || !filmCloudOn() || TEST_MODE || !filmLease.held) return;
  filmLease.held = false;
  fetch(API_BASE + '/v1/benches/' + link.id + '/lease', { method: 'DELETE', credentials: 'include', keepalive: true }).catch(() => {});
}
/* someone else has the coating open to edit: look, take over, or work on a copy */
function filmLockAsk() {
  const e = filmLease.editing, link = filmLink;
  if (!e || !link) return;
  let dlg = document.getElementById('filmLock');
  if (!dlg) { dlg = h('dialog', { class: 'rt-dialog', id: 'filmLock', 'aria-labelledby': 'filmLockTitle' }); document.body.append(dlg); }
  if (dlg.open) return;
  const done = () => dlg.close();
  dlg.replaceChildren(h('h2', { id: 'filmLockTitle' }, e.name + ' is editing this coating'),
    h('p', null, e.name + ' has “' + link.name + '” open to edit. You can look at it (changes you make stay in this browser), take over (their unsaved changes stay with them), or carry on in a copy of your own.'),
    h('div', { class: 'rt-actions' },
      h('button', { class: 'rt-btn', type: 'button', id: 'flLook', onclick: done }, 'Look'),
      h('button', { class: 'rt-btn', type: 'button', id: 'flCopy', onclick: async () => { done(); await keepAsCopy(link); } }, 'Work on a copy'),
      h('button', { class: 'rt-btn primary', type: 'button', id: 'flTake', onclick: async () => { done(); await leaseRenew(true); if (filmLease.held) { toast('Taken over: this coating saves from here now'); if (link.dirty) filmPush({ checkpoint: true }); } } }, 'Take over')));
  dlg.showModal();
}
/* the coating as it is here, as a new cloud coating beside the one it came from */
async function keepAsCopy(link) {
  try {
    const nm = film.name + ' (my copy)';
    const b = await api('/v1/workspaces/' + link.ws + '/benches', Object.assign({ method: 'POST' }, filmJson({ name: nm, folder_id: link.folder || null, content: filmText(Object.assign({}, film, { name: nm })) })));
    film.name = b.name || nm; render();
    setFilmLink({ id: b.id, ws: b.workspace_id || link.ws, folder: link.folder || null, version: b.version || 1, name: b.name || nm, dirty: false });
    toast('Carrying on in “' + film.name + '”');
  } catch (err) { toast(err.status === 402 ? 'Coatings in the cloud need JEKrayPro.' : 'Could not make a copy: ' + err.message, true); }
}
/* where the coating is, in the bar: its place in the cloud, or this browser */
export function cloudShown() {
  const on = accountsOn();
  for (const id of ['btnCloudSave', 'cloudSep']) { const el = document.getElementById(id); if (el) el.hidden = !on; }
  const where = document.getElementById('filmWhere');
  if (where) where.textContent = filmLink ? 'In the cloud' + (filmLease.editing && !filmLease.held ? ', ' + filmLease.editing.name + ' is editing' : filmLink.dirty ? ', not saved yet' : '') : 'In this browser';
  const b = document.getElementById('btnCloudSave');
  if (b) b.querySelector('.lbl').textContent = filmLink ? 'Save to cloud' : 'Save to cloud…';
}
/* ---------- saving ---------- */
export function filmCloudChanged() {
  if (!filmLink) return;
  if (!filmLink.dirty) { filmLink.dirty = true; linkKeep(); cloudShown(); }
  if (!filmCloudOn()) return;
  clearTimeout(filmCloudTimer);
  filmCloudTimer = setTimeout(() => filmPush({ quiet: true }), FILM_CLOUD_EVERY);
}
export async function filmPush(opts = {}) {
  if (!filmLink || !filmCloudOn()) return false;
  if (filmCloudBusy) return false;
  if (filmLease.editing && !filmLease.held && !opts.over) { setStatus('not saved: ' + filmLease.editing.name + ' is editing'); if (!opts.quiet && !opts.keepalive) filmLockAsk(); return false; }
  clearTimeout(filmCloudTimer);
  filmCloudBusy = true;
  const link = filmLink, content = filmText(film);
  if (!opts.keepalive) setStatus('saving…');
  try {
    const out = await api('/v1/benches/' + link.id, { method: 'PUT', keepalive: !!opts.keepalive && content.length < 60000,
      headers: { 'Content-Type': 'application/json', 'If-Match': '"' + (opts.over || link.version) + '"' }, body: JSON.stringify({ content, name: film.name, checkpoint: !!opts.checkpoint }) });
    if (filmLink !== link) return false;
    Object.assign(link, { version: out.version, dirty: false, name: out.name });
    linkKeep(); cloudShown();
    setStatus('saved ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    if (opts.checkpoint) toast('Saved to the cloud, as version ' + out.version);
    filmTell(link);
    if (!opts.keepalive) filmThumb(link, opts.checkpoint);
    return true;
  } catch (err) {
    if (filmLink !== link) return false;
    if (err.status === 409) { setStatus('not saved: changed somewhere else'); filmConflict(err.version); }
    else if (err.status === 402) { setStatus('not saved to the cloud: that needs JEKrayPro'); if (!opts.quiet) designPro('save to the cloud'); }
    else if (err.status === 423) { filmLease.held = false; filmLease.editing = err.editing || filmLease.editing; setStatus('not saved: ' + (filmLease.editing ? filmLease.editing.name : 'someone') + ' is editing it'); if (!opts.quiet) filmLockAsk(); }
    else if (err.status === 401) { setStatus('not saved: signed out'); setAccount(null); fillAccount(); }
    else if (err.status === 404) { toast('That coating is no longer in the cloud (it may be in the bin). This copy is kept in this browser.', true); setFilmLink(null); }
    else setStatus('not saved to the cloud: ' + (err.message || 'no connection'));
    return false;
  } finally { filmCloudBusy = false; }
}
/* someone saved this coating elsewhere since it was opened here: theirs, or mine over it */
function filmConflict(theirs) {
  const link = filmLink;
  let dlg = document.getElementById('filmConflict');
  if (!dlg) { dlg = h('dialog', { class: 'rt-dialog', id: 'filmConflict', 'aria-labelledby': 'filmConflictTitle' }); document.body.append(dlg); }
  const done = () => dlg.close();
  dlg.replaceChildren(h('h2', { id: 'filmConflictTitle' }, 'Saved somewhere else'),
    h('p', null, '“' + link.name + '” was saved somewhere else (version ' + theirs + ') after you opened it here. Which do you want to keep?'),
    h('div', { class: 'rt-actions' },
      h('button', { class: 'rt-btn', type: 'button', onclick: async () => { done(); await openCloudFilm(link.id); } }, 'Open theirs'),
      h('button', { class: 'rt-btn primary', type: 'button', onclick: () => { done(); filmPush({ over: theirs, checkpoint: true }); } }, 'Keep mine')));
  if (!dlg.open) dlg.showModal();
}
/* Save to the cloud: the linked coating saved as a version; one not in the cloud yet put there, named and placed */
export async function saveToCloud() {
  if (!designPro('save to the cloud')) return;
  if (filmLink) { await filmPush({ checkpoint: true }); return; }
  if (!account) return;
  const places = (account.workspaces || []).filter(w => w.kind !== 'institution' && w.active && ['owner', 'admin', 'editor'].includes(w.role || 'owner'));
  if (!places.length) { designPro('save to the cloud'); return; }
  let dlg = document.getElementById('filmCloudNew');
  if (dlg) dlg.remove();
  const name = h('input', { type: 'text', id: 'filmCloudName', value: film.name, spellcheck: 'false', maxlength: '120' });
  const where = h('select', { id: 'filmCloudWhere' }, ...places.map(w => h('option', { value: w.id }, w.kind === 'personal' ? 'My benches' : w.name)));
  const wantFolder = filmFor && places.some(w => w.id === filmFor.ws) ? filmFor.folder : null;
  if (filmFor && places.some(w => w.id === filmFor.ws)) where.value = filmFor.ws;
  // the workspace's folders, each by its path, to put the coating beside the benches it is for
  const folder = h('select', { id: 'filmCloudFolder' }, h('option', { value: '' }, 'The top folder'));
  const fillFolders = async () => {
    folder.replaceChildren(h('option', { value: '' }, 'The top folder'));
    try {
      const fs = (await api('/v1/workspaces/' + where.value + '/folders')).folders || [], byId = new Map(fs.map(f => [f.id, f]));
      const path = f => { const out = []; for (let x = f, i = 0; x && i < 20; x = byId.get(x.parent_id), i++) out.unshift(x.name); return out.join(' › '); };
      for (const [id, p] of fs.map(f => [f.id, path(f)]).sort((x, y) => x[1].localeCompare(y[1]))) folder.append(h('option', { value: id }, p));
      if (wantFolder && where.value === filmFor.ws && fs.some(f => f.id === wantFolder)) folder.value = wantFolder;
    } catch (err) { /* the top folder only */ }
  };
  where.addEventListener('change', fillFolders); fillFolders();
  const go = h('button', { class: 'rt-btn primary', type: 'button', id: 'filmCloudMake' }, 'Save');
  dlg = h('dialog', { class: 'rt-dialog', id: 'filmCloudNew', 'aria-labelledby': 'filmCloudNewTitle' },
    h('h2', { id: 'filmCloudNewTitle' }, 'Save to cloud'),
    h('div', { class: 'rt-rows' }, h('div', { class: 'rt-f wide' }, h('label', { for: 'filmCloudName' }, 'Name'), name), h('div', { class: 'rt-f wide' }, h('label', { for: 'filmCloudWhere' }, 'In'), where),
      h('div', { class: 'rt-f wide' }, h('label', { for: 'filmCloudFolder' }, 'Folder'), folder)),
    h('p', { class: 'rt-subsmall' }, filmFor ? 'The bench’s own folder is chosen, so its faces’ Coating lists offer it. It saves as you work, with its history on JEKsuite.' : 'Keep it in the folder of the benches it is for. It saves as you work, with its history on JEKsuite.'),
    h('div', { class: 'rt-actions' }, h('button', { class: 'rt-btn', type: 'button', onclick: () => dlg.close() }, 'Cancel'), go));
  document.body.append(dlg);
  go.addEventListener('click', async () => {
    go.disabled = true;
    const nm = name.value.trim() || 'Untitled coating';
    try {
      film.name = nm;
      const b = await api('/v1/workspaces/' + where.value + '/benches', Object.assign({ method: 'POST' }, filmJson({ name: nm, folder_id: folder.value || null, content: filmText(film) })));
      dlg.close();
      setFilmLink({ id: b.id, ws: b.workspace_id || where.value, folder: folder.value || null, version: b.version || 1, name: b.name || nm, dirty: false });
      filmThumb(filmLink, true); filmTell(filmLink);
      render(); filmAutosave();
      setStatus('saved'); toast('Saved to the cloud: it is on JEKsuite with your benches'); track('cloud', 'film-new');
    } catch (err) {
      go.disabled = false;
      toast(err.status === 402 ? 'Coatings in the cloud need JEKrayPro.' : 'Could not save it: ' + err.message, true);
    }
  });
  dlg.showModal(); name.select();
}
/* a coating saved: JEKray's tabs hear of it (io/film-coats.js), to offer its benches' faces the new version, or to
   list a new coating in their folder */
function filmTell(link) {
  if (typeof BroadcastChannel !== 'function' || !link) return;
  try {
    const ch = new BroadcastChannel('jek-film');
    ch.postMessage({ id: link.id, version: link.version, name: link.name, ws: link.ws, folder: link.folder || null, face: filmFor ? filmFor.face : null }); ch.close();
    if (filmFor) { toast('Saved, and on ' + filmFor.label + ' in JEKray'); setFilmFor(null); }
  } catch (err) { /* no channel: JEKray finds out when the bench is next opened */ }
}
/* ---------- the picture JEKsuite shows: the stack, and its reflectance across the band ---------- */
const FILM_THUMB_EVERY = 5 * 60000;
export function filmThumbCanvas(f) {
  const W = 480, H = 300, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), C = filmCurves(f);
  g.fillStyle = '#1f2529'; g.fillRect(0, 0, W, H);
  // the stack, from the outside in, each layer's band as thick as its optical thickness, shaded by its index; the substrate below
  const sx = 24, sw = 96, top = 30, bot = H - 70, tot = f.layers.reduce((a, L) => a + L.n * L.d, 0) || 1;
  let y = top;
  for (const L of f.layers) { const hh = (bot - top) * L.n * L.d / tot, k = Math.min(1, (L.n - 1.3) / 1.1); g.fillStyle = `rgb(${Math.round(115 + 140 * k)}, ${Math.round(185 - 60 * k)}, ${Math.round(202 - 140 * k)})`; g.fillRect(sx, y, sw, Math.max(1, hh - 1)); y += hh; }
  g.fillStyle = '#d8dee3'; g.fillRect(sx, bot, sw, H - 24 - bot);
  // the curve: R against wavelength, its target dashed
  const px = 150, pw = W - px - 20, pt = 30, ph = H - 70, top100 = Math.min(1, Math.max(0.005, 1.15 * Math.max(...C.R0, ...C.want)));
  const X = i => px + pw * i / (C.nms.length - 1), Y = r => pt + ph * (1 - Math.min(1.05, r / top100));
  g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 1; g.strokeRect(px, pt, pw, ph);
  g.setLineDash([6, 5]); g.strokeStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); C.want.forEach((r, i) => (i ? g.lineTo(X(i), Y(r)) : g.moveTo(X(i), Y(r)))); g.stroke(); g.setLineDash([]);
  g.strokeStyle = '#33b5d4'; g.lineWidth = 3; g.beginPath(); C.R0.forEach((r, i) => (i ? g.lineTo(X(i), Y(r)) : g.moveTo(X(i), Y(r)))); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '15px sans-serif';
  g.fillText(Math.round(f.spec.lo) + '–' + Math.round(f.spec.hi) + ' nm', px, H - 22);
  g.fillText(f.layers.length + (f.layers.length === 1 ? ' layer' : ' layers'), sx, H - 6);
  return cv;
}
async function filmThumb(link, force) {
  if (!link || TEST_MODE || (!force && Date.now() - (link.thumbAt || 0) < FILM_THUMB_EVERY)) return;
  link.thumbAt = Date.now();
  const blob = await new Promise(res => filmThumbCanvas(film).toBlob(res, 'image/webp', 0.85));
  if (!blob || filmLink !== link) return;
  try { await api('/v1/benches/' + link.id + '/thumb', { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob }); }
  catch (err) { link.thumbAt = 0; }
}
/* ---------- opening ---------- */
const OTHER_APPS = { jekray: ['/jek/tools/jekray.html', 'jekray', 'a JEKray bench', 'JEKray'], jekion: ['/jek/tools/jekion.html', 'jekion', 'a JEKion bench', 'JEKion'], jekcad: ['/jek/tools/jekcad.html', 'jekcad', 'a JEKcad part studio', 'JEKcad'] };
async function filmCloudOpen(id, version) {
  const b = await api('/v1/benches/' + id + (version ? '/versions/' + version : ''));
  const meta = version ? await api('/v1/benches/' + id) : b;
  // its content decides: a coating saved by an API from before JEKfilm is marked JEKray's, and opens here all the same
  let fmt = null;
  try { fmt = JSON.parse(b.content).format; } catch (err) { /* not JSON: another app's */ }
  if (meta.tool !== 'jekfilm' && fmt !== 'jekfilm') {
    const a = OTHER_APPS[fmt === 'jekcad' ? 'jekcad' : meta.tool] || OTHER_APPS.jekray, w = window.open(a[0] + '#cloud=' + id + (version ? '@' + version : ''), a[1]);
    if (w) w.focus(); toast('“' + meta.name + '” is ' + a[2] + ': opened in ' + a[3]); return;
  }
  let d = null;
  try { d = JSON.parse(b.content); } catch (err) { toast('That coating could not be read', true); return; }
  if (!openFilmData(Object.assign(d, { name: meta.name }))) return;
  // an old version opens as a copy: Save to the cloud makes it a coating of its own
  if (version) { setFilmLink(null); toast('Version ' + version + ' of “' + meta.name + '” opened as a copy'); }
  else { setFilmLink({ id: meta.id, ws: meta.workspace_id, folder: meta.folder_id || null, version: meta.version, name: meta.name, dirty: false }); setStatus(''); }
  filmAutosave(); track('cloud', 'film-open');
}
/* a cloud coating by its id (#cloud=<id>, or #cloud=<id>@<version> for a copy of a version) */
export async function openCloudFilm(id, version) {
  if (!accountsOn()) return;
  try { if (filmLink && filmLink.dirty && filmLink.id !== id) await filmPush({ quiet: true }); await filmCloudOpen(id, version); }
  catch (err) { toast(err.status === 401 ? 'Sign in, top right, to open that coating' : err.status === 404 ? 'That coating is not available to you' : err.message, true); }
}
/* JEKsuite, in its own tab, at JEKfilm's page: every coating, in its folders */
export function openSpace() {
  track('view', 'film-space');
  const w = window.open(SPACE_URL + '#app=jekfilm', 'jeksuite'); if (w) w.focus();
}
export function wireCloud() {
  linkRestore();
  Object.assign(hooks, { filmLinked: () => !!filmLink, filmUnlink: () => setFilmLink(null), filmCloudShown: cloudShown });
  document.getElementById('btnCloudSave').addEventListener('click', saveToCloud);
  document.getElementById('btnSpace').addEventListener('click', e => { if (accountsOn()) { e.preventDefault(); openSpace(); } });
  // the page hidden: anything not saved goes up now
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && filmLink && filmLink.dirty && filmCloudOn()) filmPush({ keepalive: true, quiet: true }); });
  // leaving the page lets the lease go, so JEKsuite stops saying this coating is being edited
  window.addEventListener('pagehide', () => leaseStop(filmLink));
  // a coating restored with the page takes its lease once the account is known
  Promise.resolve().then(() => { if (accountLoaded) accountLoaded.then(() => { if (filmLink && !filmLease.held && !filmLease.timer) leaseStart(); }); });
  cloudShown();
}
