import { KIND_WORD, diffProject, merge3, resolve, showValue } from '../../../jekray/src/io/merge.js';
import { track } from '../../../jekray/src/io/usage.js';
import { APPS, appOf, thingOf, closeMenu, helpLine, iconNode, menuIcons, menuOpenFor, openApp, openMenu, setSpaceTheme, spaceTheme, toast } from './dom.js';
import { h } from '../../../jekray/src/ui/dom.js';
import { SORTS, countOf, folderCounts, folderFits, folderKids, runOf, sortBenches } from '../core/files.js';
import { API_BASE, account, accountMenuRows, api, avatarNode, fillAccount, setAccount, showSubscribe } from '../../../jekray/src/io/account.js';

/* ==========================================================================
   JEKsuite's home: every cloud bench of every app, as a CAD system's documents page. Places down the left (the
   apps, each workspace, Recent, its folders, My parts, My links, the bin), the benches as cards with their pictures,
   or as rows, of every app or one. A bench opens in its own app, in that app's tab (#cloud=<id>); a card's ⋯ menu
   also gives its history, forks, renames, moves, copies to another workspace and deletes; a bench's history opens a
   copy of any version, compares two, forks from one, restores one, and merges a fork back. New starts a bench in an
   app, in the cloud when the workspace can save there. Taken from what was JEKray's My benches page (io/cloud.js),
   which this page replaces.
   ========================================================================== */
export const cloudPlace = { ws: null, folder: null, q: '', view: 'folder', history: null, flash: null, cmp: null, app: null, sel: null, only: null };
const HOME_KEY = 'jek-home-view';
const homeView = { sort: 'changed', flip: false, rows: false, open: [] };
/* the benches picked (Ctrl-click, Shift-click, a card's tick): kept while the place shown stays the same */
const picked = new Set();
let pickedAt = '', pickAnchor = null;
/* what is being dragged ({ benches, folders }), every bench of the workspace as last read (for what each folder
   holds), and what the keys do in the list shown (Ctrl+A, Delete, F2, Escape) */
let dragItems = null, allSeen = null, homeKeys = null;
/* a name typed in place: Enter or leaving it keeps it, Escape puts things back */
function nameInput(value, label, save, cancel) {
  const inp = h('input', { type: 'text', class: 'rt-hrename', value, maxlength: '120', spellcheck: 'false', 'aria-label': label, placeholder: label });
  let done = false;
  const end = keep => { if (done) return; done = true; const v = inp.value.trim(); if (keep && v && v !== value) save(v); else cancel(); };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); end(true); } else if (e.key === 'Escape') { e.preventDefault(); end(false); } });
  inp.addEventListener('blur', () => end(true));
  for (const ev of ['click', 'dblclick', 'pointerdown', 'dragstart']) inp.addEventListener(ev, e => e.stopPropagation());
  return inp;
}
export const kb = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
const whenAgo = t => {
  const d = new Date(t), s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return new Date().toDateString() === d.toDateString() ? 'today ' + hm : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) + ' ' + hm;
};
const homeIcon = name => iconNode(name);
const closeHomeMenu = () => closeMenu();
const openHomeMenu = (btn, items) => openMenu(btn, items);
const jsonBody = body => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const shortUrl = id => location.origin + '/s/' + id;
const PALETTE_NAMES = { free: 'Free space', fibre: 'Fibre', elec: 'Circuits', rf: 'RF', pic: 'Photonic', draw: 'Draw', model: 'Model' };
let homeSeq = 0, homeRO = null;
/* ---------- an app's launch page ----------
   The rail's apps open the app's page here (#app=<id>), not the app: what it does, its benches alone (the same folders,
   search and sorting as My benches), and the one picked shown large beside them, to open in the app. Anything else in
   the rail leaves it. */
const appHash = () => { const m = location.hash.match(/^#app=(jekray|jekion|jekfilm|jekcad)$/); return m ? m[1] : null; };
export function showApp(id) {
  closeMenu();
  if (id) { Object.assign(cloudPlace, { app: id, view: 'folder', folder: null, q: '', history: null, sel: null }); const s = document.getElementById('homeSearch'); if (s) s.value = ''; if (appHash() !== id) location.hash = 'app=' + id; fillHome(); return; }
  cloudPlace.app = null;
  if (appHash()) window.history.pushState(null, '', location.pathname + location.search);
}
export const personalWs = () => account && (account.workspaces.find(w => w.kind === 'personal') || account.workspaces[0]);
/* why the cloud's work is not open ('' when it is): no plan anywhere the person can save */
const newPlaces = () => (account ? account.workspaces : []).filter(w => w.kind === 'personal' || (w.kind !== 'institution' && w.active && ['owner', 'admin', 'editor'].includes(w.role || 'owner')));
const proWhy = () => (!account ? 'Sign in, top right' : newPlaces().some(w => w.active) ? '' : 'Needs JEKrayPro');
const homeSay = (fn, ok) => async () => {
  try { const out = await fn(); if (ok) toast(typeof ok === 'function' ? ok(out) : ok); }
  catch (err) { toast(err.status === 402 ? 'That needs JEKrayPro.' : err.message, true); }
  fillHome();
};
/* a cloud bench opened in its app, in that app's tab: a version as a copy (#cloud=<id>@<version>) */
async function homeOpenBench(id, version, b) {
  let tool = b && b.tool;
  if (!tool) { try { const full = await api('/v1/benches/' + id); tool = full.tool; try { tool = TOOL_OF_FORMAT[JSON.parse(full.content).format] || tool; } catch (err) { /* as marked */ } } catch (err) { tool = 'jekray'; } }
  else if (tool === 'jekray' && toolMap()[id] && toolMap()[id] !== 'jekray') tool = toolMap()[id];
  track('cloud', 'open.' + (tool || 'jekray'));
  openApp(tool || 'jekray', 'cloud=' + id + (version ? '@' + version : ''));
}
// the workspaces (but one) the person can save a bench to: a copy goes to one of them
export const copyPlaces = (notWs) => (account ? account.workspaces : []).filter(w => w.id !== notWs && w.kind !== 'institution' && w.active && ['owner', 'admin', 'editor'].includes(w.role || 'owner'));
/* A bench's app, where the API's mark is behind what it holds: an API from before an app was made marks that app's
   benches JEKray's. Each bench marked JEKray's is looked at once (its content says its format), what was found is
   kept by its id for the next visit, and the list is drawn again if any turned out to be another app's. */
const TOOL_KEY = 'jeksuite-tools', TOOL_OF_FORMAT = { jekcad: 'jekcad', jekfilm: 'jekfilm', jekion: 'jekion' };
let toolSeen = null;
const toolMap = () => toolSeen || (toolSeen = (() => { try { return JSON.parse(localStorage.getItem(TOOL_KEY)) || {}; } catch (err) { return {}; } })());
function trueTools(list, again) {
  const M = toolMap(), ask = [];
  for (const b of list || []) { if (!b || (b.tool || 'jekray') !== 'jekray') continue; const k = M[b.id]; if (!k) ask.push(b); else if (k !== 'jekray') b.tool = k; }
  if (!ask.length) return;
  Promise.all(ask.slice(0, 40).map(b => api('/v1/benches/' + b.id).then(full => { let fmt = null; try { fmt = JSON.parse(full.content).format; } catch (err) { /* not JSON: JEKray's */ } M[b.id] = TOOL_OF_FORMAT[fmt] || 'jekray'; return M[b.id] !== 'jekray'; }, () => false)))
    .then(found => { try { localStorage.setItem(TOOL_KEY, JSON.stringify(M)); } catch (err) { /* this visit */ } if (found.some(Boolean) && again) again(); });
}
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
    toastWord: 'Merged: “' + target.name + '” has a new version. Open it to look it over; its history keeps the one before.',
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
    h('p', { class: 'rt-subsmall' }, '“' + target.name + '” as it is now is kept as a version first (“' + o.keptLabel + '”). The merged bench is saved as a version of its own, at the head of “' + target.name + '”’s history; restore the version before to take it back.'));
  // the gains list follows the choices
  body.addEventListener('change', () => { const d = diffProject(JSON.parse(T.content), resolve(m)); const ul = body.querySelectorAll('ul.rt-difflist:not(.conflicts)')[0]; const fresh = diffNodes(d, 'now', 'merged').slice(1)[0]; if (ul && fresh) ul.replaceWith(fresh); });
  go.disabled = false;
  go.onclick = async () => {
    go.disabled = true;
    try {
      // the target as it is now, kept: a version to come back to; then the merged bench saved over it as a version of its own
      const kept = await api('/v1/benches/' + target.id, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': '"' + T.version + '"' },
        body: JSON.stringify({ content: T.content, name: T.name, checkpoint: true, label: o.keptLabel }) });
      const merged = resolve(m); merged.name = T.name;
      await api('/v1/benches/' + target.id, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': '"' + kept.version + '"' },
        body: JSON.stringify({ content: JSON.stringify(merged), name: T.name, checkpoint: true, label: o.mergedLabel(T, S) }) });
      dlg.close();
      toast(o.toastWord);
      fillHome();
    } catch (err) {
      toast(err.status === 423 ? (err.editing ? err.editing.name : 'Someone') + ' is editing “' + target.name + '”: merge when they are done.' : err.status === 409 ? '“' + target.name + '” changed just now: open the merge again.' : err.message, true);
      go.disabled = false;
    }
  };
}
export async function fillHome() {
  const box = document.getElementById('homeList'), rail = document.getElementById('homeRail');
  const crumbs = document.getElementById('homeCrumbs'), tools = document.getElementById('homeTools'), note = document.getElementById('homeNote');
  if (!account) { signedOutView(); return; }
  const places = account.workspaces.filter(w => w.kind !== 'institution');
  if (!cloudPlace.ws || !places.some(w => w.id === cloudPlace.ws)) cloudPlace.ws = (personalWs() || places[0] || {}).id;
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
    box.replaceChildren(h('p', { class: 'rt-hempty' }, err.status === 401 ? 'You are signed out. Sign in again, top right.' : 'Could not reach your benches: ' + err.message));
    if (err.status === 401) { setAccount(null); fillAccount(); }
    return;
  }
  if (seq !== homeSeq) return;
  if (data && Array.isArray(data.benches)) trueTools(data.benches, () => { if (seq === homeSeq) fillHome(); });
  box.removeAttribute('aria-busy');
  const byId = new Map(folders.map(f => [f.id, f]));
  const appPage = P.app && P.view === 'folder' ? appOf(P.app) : null;
  if (P.folder && !byId.has(P.folder)) P.folder = null;
  // share links are the person's own, not a workspace's: shown with their personal workspace
  if (P.view === 'links' && wsInfo && wsInfo.kind !== 'personal') { P.view = 'folder'; fillHome(); return; }
  const go = (view, folder = null) => () => { closeHomeMenu(); Object.assign(P, { view, folder, q: '', history: null }); document.getElementById('homeSearch').value = ''; fillHome(); document.getElementById('homeMain').scrollTop = 0; };
  const pathOf = id => { const out = []; for (let f = byId.get(id); f; f = byId.get(f.parent_id)) out.unshift(f); return out; };
  const pathText = id => pathOf(id).map(f => f.name).join(' › ');
  const writer = data.role ? ['owner', 'admin', 'editor'].includes(data.role) : wsInfo ? ['owner', 'admin', 'editor'].includes(wsInfo.role || 'owner') : true;
  const active = data.active !== undefined ? data.active : !!(wsInfo && wsInfo.active);
  const can = writer && active;
  const keepView = () => { try { localStorage.setItem(HOME_KEY, JSON.stringify(homeView)); } catch (err) { /* this visit only */ } };
  const placeKey = [ws, P.view, P.folder, P.q, P.app].join('|');
  if (placeKey !== pickedAt) { picked.clear(); pickAnchor = null; pickedAt = placeKey; }
  homeKeys = null;
  // what is dragged goes where it is dropped: benches and folders into a folder (or the top), benches onto the bin
  const sayItems = (bs, fs) => [bs.length === 1 && !fs.length ? '“' + bs[0].name + '”' : bs.length ? countOf(bs.length, 'bench') : null,
    fs.length === 1 && !bs.length ? 'the folder “' + fs[0].name + '”' : fs.length ? countOf(fs.length, 'folder') : null].filter(Boolean).join(' and ');
  const goesInto = (items, into) => ({ benches: items.benches.filter(b => (b.folder_id || null) !== into),
    folders: items.folders.filter(f => f.id !== into && (f.parent_id || null) !== into && folderFits(folders, f.id, into)) });
  const moveItems = (items, into) => {
    const { benches: bs, folders: fs } = goesInto(items, into);
    if (!bs.length && !fs.length) return;
    homeSay(async () => {
      for (const b of bs) await api('/v1/benches/' + b.id, Object.assign({ method: 'PATCH' }, jsonBody({ folder_id: into })));
      for (const f of fs) await api('/v1/workspaces/' + ws + '/folders/' + f.id, Object.assign({ method: 'PATCH' }, jsonBody({ parent_id: into })));
      picked.clear();
    }, 'Moved ' + sayItems(bs, fs) + ' to ' + (into && byId.get(into) ? '“' + byId.get(into).name + '”' : top))();
  };
  const binItems = bs => homeSay(async () => { for (const b of bs) await api('/v1/benches/' + b.id, { method: 'DELETE' }); picked.clear(); },
    bs.length === 1 ? '“' + bs[0].name + '” moved to the bin for 30 days' : bs.length + ' benches moved to the bin for 30 days')();
  const takes = target => { if (!dragItems || !can) return false; if (target.bin) return dragItems.benches.length > 0 && !dragItems.folders.length; const g = goesInto(dragItems, target.folder); return g.benches.length + g.folders.length > 0; };
  const dropOn = (el, target) => {
    el.addEventListener('dragover', e => { if (!takes(target)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('drop'); });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', e => { el.classList.remove('drop'); if (!takes(target)) return; e.preventDefault(); const items = dragItems; dragItems = null; if (target.bin) binItems(items.benches); else moveItems(items, target.folder); });
    return el;
  };
  const dragFrom = (el, items) => {
    el.addEventListener('dragstart', e => { dragItems = items(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', sayItems(dragItems.benches, dragItems.folders)); el.classList.add('dragging'); document.getElementById('home').classList.add('dragging'); });
    el.addEventListener('dragend', () => { dragItems = null; el.classList.remove('dragging'); document.getElementById('home').classList.remove('dragging'); for (const d of document.querySelectorAll('.drop')) d.classList.remove('drop'); });
    return el;
  };
  // what each folder holds, on its card and in the rail's tree: from every bench of the workspace, read once it is drawn
  const decorate = () => {
    const all = allSeen && allSeen.ws === ws ? allSeen.benches : null;
    if (!all) return;
    const every = folderCounts(folders, all), shown = appPage ? folderCounts(folders, all, appPage.id) : every, thing = appPage ? thingOf(appPage.id) : 'bench';
    for (const n of rail.querySelectorAll('.rt-htnode[data-tree]')) { const c = n.querySelector('.rt-hcount'), k = every.get(n.dataset.tree); if (c) c.textContent = k ? String(k.n) : ''; }
    for (const c of box.querySelectorAll('.rt-hcard.folder[data-folder]')) {
      const k = shown.get(c.dataset.folder) || { n: 0, apps: {} }, cnt = c.querySelector('.rt-hcount'), dots = c.querySelector('.rt-hdots');
      if (cnt) cnt.textContent = countOf(k.n, thing);
      if (dots) dots.replaceChildren(...(appPage ? [] : APPS.filter(a => k.apps[a.id]).map(a => h('i', { class: a.id, title: countOf(k.apps[a.id], a.name + ' ' + thingOf(a.id)) }))));
    }
  };
  // the rail: workspaces, then this one's places and folders
  const here = (view, folder) => !P.q && P.view === view && (view !== 'folder' || P.folder === folder);
  // (a place in the rail leaves an app's launch page)
  const leave = fn => () => { if (P.app) showApp(null); fn(); };
  const railBtn = (label, icon, on, fn, cls) => h('button', { type: 'button', class: cls || null, 'aria-current': on ? 'true' : 'false', onclick: fn, title: label }, homeIcon(icon), h('span', null, label));
  // the workspace's folders as a tree under it: a folder with folders in it opens and closes (kept), the way to the
  // folder shown is always open; each is somewhere to drop what is dragged
  const kids = folderKids(folders), wayHere = new Set(pathOf(P.folder).slice(0, -1).map(f => f.id)), openSet = new Set([...(homeView.open || []), ...wayHere]);
  const treeNodes = (parent, depth) => (kids.get(parent) || []).flatMap(f => {
    const has = (kids.get(f.id) || []).length > 0, isOpen = has && openSet.has(f.id);
    const twist = has ? h('button', { type: 'button', class: 'rt-htwist', 'aria-expanded': String(isOpen), 'aria-label': (isOpen ? 'Close ' : 'Open ') + f.name, title: isOpen ? 'Close' : 'Open',
      onclick: () => { const s = new Set(homeView.open || []); if (isOpen && !wayHere.has(f.id)) s.delete(f.id); else s.add(f.id); homeView.open = [...s].filter(id => byId.has(id)); keepView(); fillHome(); } }, isOpen ? '▾' : '▸') : h('span', { class: 'rt-htwist' });
    const btn = dropOn(h('button', { type: 'button', class: 'rt-htgo', 'aria-current': !P.app && here('folder', f.id) ? 'true' : 'false', title: pathText(f.id), onclick: leave(go('folder', f.id)) },
      homeIcon('folder'), h('span', null, f.name), h('small', { class: 'rt-hcount' })), { folder: f.id });
    return [h('div', { class: 'rt-htnode', 'data-tree': f.id, style: 'padding-left:' + (0.55 + depth * 0.85) + 'rem' }, twist, btn), ...(isOpen ? treeNodes(f.id, depth + 1) : [])];
  });
  const used = data.usage || (P.lastUsage && P.lastUsage.ws === ws ? P.lastUsage : null);
  if (data.usage) P.lastUsage = Object.assign({ ws }, data.usage);
  rail.replaceChildren(...[
    h('h2', null, 'Apps'), ...APPS.map(a => railBtn(a.name, a.icon, P.app === a.id, () => { track('cloud', 'app.' + a.id); showApp(a.id); }, 'rt-happbtn ' + a.id)),
    h('h2', null, 'Benches'),
    ...places.flatMap(w => w.id === ws
      ? [dropOn(railBtn(placeName(w), w.kind === 'personal' ? 'home' : 'users', !P.app && here('folder', null), leave(go('folder', null))), { folder: null }), ...treeNodes(null, 1)]
      : [railBtn(placeName(w), w.kind === 'personal' ? 'home' : 'users', false, leave(() => { Object.assign(P, { ws: w.id, folder: null, view: 'folder', q: '', history: null }); fillHome(); }))]),
    h('h2', null, 'In ' + top),
    railBtn('Recent', 'recent', !P.app && here('recent'), leave(go('recent'))),
    railBtn(wsInfo && wsInfo.kind !== 'personal' ? 'Team parts' : 'My parts', 'star', P.view === 'parts', leave(go('parts'))),
    wsInfo && wsInfo.kind === 'personal' ? railBtn('My links', 'link', P.view === 'links', leave(go('links'))) : null,
    dropOn(railBtn('Bin', 'trash', here('bin'), leave(go('bin'))), { bin: true }),
    h('div', { class: 'rt-hfoot' },
      used ? h('span', null, kb(used.bytes) + ' of ' + kb(used.quota) + ' used') : null,
      used ? h('div', { class: 'rt-hmeter', role: 'progressbar', 'aria-label': 'Cloud storage used', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(100 * used.bytes / used.quota)) },
        h('span', { style: 'width:' + Math.min(100, Math.max(1, 100 * used.bytes / used.quota)).toFixed(1) + '%' })) : null,
      h('a', { href: API_BASE + '/v1/me/export', class: 'rt-link' }, 'Download everything (.zip)'),
      h('span', null, 'Signed in as ' + (account.user.name || account.user.email || 'you')))].filter(Boolean));
  decorate();
  (P.view === 'recent' && !P.q && Array.isArray(data.benches) ? Promise.resolve(data) : api('/v1/workspaces/' + ws + '/benches')).then(all => {
    if (seq !== homeSeq) return;
    trueTools(all.benches, () => { if (seq === homeSeq) fillHome(); });
    allSeen = { ws, benches: all.benches || [] };
    decorate();
  }, () => {});
  // where we are
  const link = (label, fn) => h('button', { type: 'button', class: 'rt-link', onclick: fn }, label);
  const sep = ' › ';
  const cr = f => dropOn(link(f ? f.name : top, go('folder', f ? f.id : null)), { folder: f ? f.id : null });
  if (P.view === 'history') {
    const b = data.bench;
    crumbs.replaceChildren(cr(null), ...pathOf(b.folder_id).flatMap(f => [sep, cr(f)]), sep, b.name);
  } else crumbs.replaceChildren(...(P.q ? [cr(null), sep, 'Search: “' + P.q + '”']
    : P.view === 'bin' ? [cr(null), sep, 'Bin'] : P.view === 'recent' ? [cr(null), sep, 'Recent']
    : pathOf(P.folder).length ? [cr(null), ...pathOf(P.folder).flatMap((f, i, a) => [sep, i === a.length - 1 ? f.name : cr(f)])] : [top]));
  if (appPage) crumbs.replaceChildren(link(appPage.name, go('folder', null)), sep, ...(P.q ? ['Search: “' + P.q + '”'] : pathOf(P.folder).length ? [cr(null), ...pathOf(P.folder).flatMap((f, i, a) => [sep, i === a.length - 1 ? f.name : cr(f)])] : [top]));
  document.getElementById('homeWhere').textContent = appPage ? appPage.name : top;
  note.hidden = active || P.view === 'history';
  note.replaceChildren('Saving, forking and organising need JEKrayPro. Benches here can still be opened and downloaded. ', link('Subscribe', () => showSubscribe()));
  // the tools: sort, grid or rows, a new folder
  const listing = P.view !== 'history' && P.view !== 'bin';
  // (the benches as a table: its headings sort it, so the list of orders is for the cards)
  const tbl = homeView.rows && !['history', 'parts', 'links'].includes(P.view);
  const showWhere = !!(P.q || P.view === 'recent' || P.view === 'bin');
  const sortSel = listing && !tbl ? h('select', { 'aria-label': 'Sort by', onchange: e => { homeView.sort = e.target.value; homeView.flip = false; keepView(); fillHome(); } },
    ...Object.entries(SORTS).filter(([v]) => v !== 'folder' || showWhere).map(([v, t]) => { const o = h('option', { value: v }, t); o.selected = homeView.sort === v; return o; })) : null;
  const newFolder = () => {
    if (box.querySelector('.rt-hnewfolder')) { box.querySelector('.rt-hnewfolder input').focus(); return; }
    const row = h('div', { class: 'rt-hnewfolder' }, homeIcon('folder'));
    const inp = nameInput('', 'Name of the new folder', name => homeSay(() => api('/v1/workspaces/' + ws + '/folders', Object.assign({ method: 'POST' }, jsonBody({ name, parent_id: P.folder }))))(), () => row.remove());
    row.append(inp); box.prepend(row); inp.focus();
  };
  tools.replaceChildren(...[sortSel,
    P.view !== 'history' ? h('button', { type: 'button', class: 'rt-btn', title: homeView.rows ? 'Show as cards' : 'Show as a list', 'aria-label': homeView.rows ? 'Show as cards' : 'Show as a list',
      onclick: () => { homeView.rows = !homeView.rows; keepView(); fillHome(); } }, homeIcon(homeView.rows ? 'grid' : 'list')) : null,
    P.view === 'folder' && !P.q && can ? h('button', { type: 'button', class: 'rt-btn', id: 'homeNewFolder', onclick: newFolder }, homeIcon('folder'), ' New folder') : null].filter(Boolean));
  for (const b of tools.querySelectorAll('.rt-btn')) b.style.cssText = 'display:inline-flex;align-items:center;gap:0.3rem';
  box.classList.toggle('rows', homeView.rows && (P.view === 'parts' || P.view === 'links'));
  box.classList.toggle('tbl', tbl);
  box.classList.remove('picking');
  // the history of one bench, as a graph down the side: its versions on one line, newest at
  // the top; each fork branching off from the version it was made from, at the time it was
  // made; and the bench it was itself forked from, at the foot
  if (P.view === 'history') {
    // a fork or an original in another workspace: shown in its own, with its own rights
    if (data.bench.workspace_id !== ws && places.some(w => w.id === data.bench.workspace_id)) { P.ws = data.bench.workspace_id; fillHome(); return; }
    const b = data.bench, mine = false, origin = data.forked_from;
    const toHist = (id, name) => () => { Object.assign(P, { view: 'history', history: { id, name }, cmp: null }); fillHome(); document.getElementById('homeMain').scrollTop = 0; };
    const side = h('div', { class: 'rt-hside' },
      b.thumb ? h('img', { src: API_BASE + b.thumb, alt: '' }) : h('span', { class: 'thumb rt-nopic' }, 'Its picture is drawn the next time it is opened and saved'),
      h('p', null, 'Version ' + b.version + ' · changed ' + whenAgo(b.updated_at) + (b.updated_by && wsInfo && wsInfo.kind !== 'personal' ? ' by ' + b.updated_by.name : '') + ' · ' + kb(b.size_bytes) + (mine ? ' · open on the bench' : '')),
      h('div', { class: 'rt-actions' },
        h('button', { type: 'button', class: 'rt-btn primary', onclick: () => homeOpenBench(b.id, null, b) }, 'Open in ' + appOf(b.tool).name),
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
            link('Open a copy', () => homeOpenBench(b.id, v.version, b)),
            P.cmp === v.version ? link('Cancel compare', () => { P.cmp = null; fillHome(); })
              : P.cmp ? link('Compare with v' + P.cmp, () => { const a = P.cmp; P.cmp = null; fillHome(); homeCompare(b, a, v.version); })
              : link('Compare…', () => { P.cmp = v.version; fillHome(); toast('Now choose the version to compare it with'); }),
            can ? link('Fork from here', () => homeFork(b, v.version, () => {})) : null,
            can && v.version !== b.version ? link('Restore', homeSay(async () => {
              await api('/v1/benches/' + b.id + '/versions/' + v.version + '/restore', { method: 'POST' });
            }, 'Restored version ' + v.version)) : null));
      }
      if (e.kind === 'f') {
        const f = e.f;
        return h('div', { class: 'rt-hev fork', style: '--lane:' + COLOURS[(e.lane - 1) % COLOURS.length] },
          f.thumb ? h('img', { class: 'thumb', src: API_BASE + f.thumb, alt: '', loading: 'lazy' }) : h('span', { class: 'thumb', 'aria-hidden': 'true' }),
          h('span', { class: 'what' }, homeIcon('fork'), ' ', link(f.name, toHist(f.id, f.name)), ' ',
            h('small', null, ['forked from version ' + f.version, f.created_by, whenAgo(f.created_at), f.forks ? (f.forks === 1 ? '1 fork of its own' : f.forks + ' forks of its own') : null].filter(Boolean).join(' · '))),
          h('span', { class: 'acts' }, link('Open', () => homeOpenBench(f.id, null, { tool: b.tool })), link('History', toHist(f.id, f.name)),
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
    if (ev.length) { draw(); homeRO = new ResizeObserver(() => requestAnimationFrame(draw)); homeRO.observe(list); }
    return;
  }
  // My links: the share links made, each a snapshot of a bench as it was: open it, copy its link, or delete it
  if (P.view === 'links') {
    const by = { changed: (a, b) => b.created_at - a.created_at, name: (a, b) => a.name.localeCompare(b.name), size: (a, b) => b.size_bytes - a.size_bytes }[homeView.sort] || ((a, b) => b.created_at - a.created_at);
    const words = P.q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = data.links.filter(l => words.every(w => (l.name + ' ' + l.id).toLowerCase().includes(w))).sort(by);
    crumbs.replaceChildren(link(top, go('folder', null)), sep, P.q ? 'My links: “' + P.q + '”' : 'My links');
    const linkNote = !!proWhy();
    note.hidden = !linkNote;
    note.replaceChildren('Making share links needs JEKrayPro. The links you made still open for everyone, and you can delete them here. ', link('Subscribe', () => showSubscribe()));
    const copyLink = (l, btn) => navigator.clipboard.writeText(shortUrl(l.id)).then(() => { toast('Copied ' + shortUrl(l.id)); if (btn) btn.textContent = 'Copied'; }, () => toast(shortUrl(l.id)));
    const open = l => openApp('jekray', 's=' + l.id);
    const del = l => () => {
      if (!confirm('Delete the link to “' + l.name + '”? Anyone who has ' + shortUrl(l.id) + ' will no longer be able to open it. Your benches are not changed.')) return;
      homeSay(() => api('/v1/links/' + l.id, { method: 'DELETE' }), 'Deleted: ' + shortUrl(l.id) + ' no longer opens')();
    };
    const cards = list.map(l => {
      const more = h('button', { type: 'button', class: 'rt-hmore', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'More for ' + l.name, title: 'More' }, '⋯');
      more.addEventListener('click', () => openHomeMenu(more, [
        ['Open in JEKray', 'open', () => open(l)],
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
      const add = () => toast('On a JEKray bench: + Add part › ★ My parts › “' + p.name + '”');
      more.addEventListener('click', () => openHomeMenu(more, [
        ['How to add it', 'open', add],
        'sep',
        can ? ['Rename…', 'rename', () => { const name = (prompt('Rename the part', p.name) || '').trim(); if (name && name !== p.name) homeSay(() => api('/v1/parts/' + p.id, Object.assign({ method: 'PATCH' }, jsonBody({ name }))), 'Renamed')(); }] : null,
        writer ? ['Delete…', 'trash', () => { if (confirm('Delete “' + p.name + '” from ' + partsName + '? Benches it was added to keep their copies.')) homeSay(() => api('/v1/parts/' + p.id, { method: 'DELETE' }), 'Deleted “' + p.name + '”')(); }, 'danger'] : null]));
      return h('div', { class: 'rt-hcard rt-hpart', 'data-part': p.id },
        h('button', { type: 'button', class: 'rt-hopen', title: '“' + p.name + '”: added on a JEKray bench, from + Add part › ★ My parts', onclick: add },
          p.icon ? h('img', { class: 'thumb icon', src: p.icon, alt: '' }) : h('span', { class: 'thumb rt-nopic' }, 'No picture')),
        h('div', { class: 'rt-hinfo' },
          h('b', { title: p.name }, p.name),
          h('small', null, [p.summary, PALETTE_NAMES[p.palette], kb(p.size_bytes)].join(' · ')),
          h('small', null, 'Kept ' + whenAgo(p.created_at))),
        more);
    });
    box.replaceChildren(...(cards.length ? [h('div', { class: 'rt-hgrid' }, ...cards)]
      : [h('p', { class: 'rt-hempty' }, P.q ? 'No part matches “' + P.q + '”.'
        : 'No parts kept yet. On the bench, set up a part as you want it (a lens of your own, a tuned laser) or a whole assembly, select it, right-click and choose Save to My parts; or import lens files there with Import .zmx files. They are then on every bench, under + Add part › My parts and the rail’s ★.')]),
      helpLine('Your parts, on every bench and on any computer.', ['Parts you keep are on every bench, on any computer: under + Add part › ★ My parts, in its search, and behind the ★ on the bench’s parts rail. Deleting a part here leaves the benches it was added to as they are.'], 'rt-subsmall'));
    return;
  }
  // folders, then benches: as cards, or as the rows of a table
  const bin = P.view === 'bin';
  const folderCards = P.view === 'folder' && !P.q ? (kids.get(P.folder) || []).map(f => {
    const more = h('button', { type: 'button', class: 'rt-hmore', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'More for ' + f.name, title: 'More' }, '⋯');
    const open = h('button', { type: 'button', class: 'rt-hopen', title: 'Open the folder “' + f.name + '”', onclick: go('folder', f.id) }, homeIcon('folder'), h('span', null, f.name),
      tbl ? null : h('small', { class: 'rt-hdots' }), tbl ? null : h('small', { class: 'rt-hcount' }));
    const card = h('div', { class: 'rt-hcard folder' + (tbl ? ' rt-hrow' : ''), 'data-folder': f.id, draggable: can ? 'true' : null },
      ...(tbl ? [h('span'), open, h('span', { class: 'rt-hc app rt-hdots' }), showWhere ? h('span', { class: 'rt-hc where' }) : null, h('span', { class: 'rt-hc when' }), h('span', { class: 'rt-hc size rt-hcount' })] : [open]),
      writer ? more : null);
    const rename = () => {
      if (!can) return false;
      const edit = h('div', { class: 'rt-hopen editing' }, homeIcon('folder'));
      const inp = nameInput(f.name, 'Name of the folder', name => homeSay(() => api('/v1/workspaces/' + ws + '/folders/' + f.id, Object.assign({ method: 'PATCH' }, jsonBody({ name }))))(), () => { edit.replaceWith(open); card.draggable = can; });
      edit.append(inp); card.draggable = false; open.replaceWith(edit); inp.focus(); inp.select();
      return true;
    };
    card.renameHere = rename;
    more.addEventListener('click', () => openHomeMenu(more, [
      ['Open', 'open', go('folder', f.id)],
      can ? ['Rename', 'rename', () => setTimeout(rename)] : null,
      writer ? 'sep' : null,
      writer ? ['Delete', 'trash', homeSay(() => api('/v1/workspaces/' + ws + '/folders/' + f.id, { method: 'DELETE' }), 'Folder deleted'), 'danger'] : null]));
    if (can) dragFrom(card, () => ({ benches: [], folders: [f] }));
    return dropOn(card, { folder: f.id });
  }) : [];
  let benches = data.benches.slice();
  const whereText = b => (b.folder_id && byId.get(b.folder_id) ? pathText(b.folder_id) : '');
  const sortKey = SORTS[homeView.sort] && (homeView.sort !== 'folder' || showWhere) ? homeView.sort : 'changed';
  if (P.view === 'recent') benches = sortBenches(benches, 'changed').slice(0, 24);
  if (!bin && (P.view !== 'recent' || tbl)) benches = sortBenches(benches, sortKey, !!homeView.flip, whereText);
  // an app's launch page: its benches alone; anywhere else, one app's when its chip is pressed
  if (appPage) benches = benches.filter(b => (b.tool || 'jekray') === appPage.id);
  const appsHere = {};
  for (const b of benches) appsHere[b.tool || 'jekray'] = (appsHere[b.tool || 'jekray'] || 0) + 1;
  const total = benches.length;
  if (P.only && !APPS.some(a => a.id === P.only)) P.only = null;
  const chip = (id, label, n) => h('button', { type: 'button', class: 'rt-hchip' + (id ? ' ' + id : ''), 'aria-pressed': String((P.only || null) === id), title: id ? 'Only the ' + label + ' ' + thingOf(id) + 's here' : 'Every app’s benches here',
    onclick: () => { P.only = P.only === id ? null : id; fillHome(); } }, id ? h('i', { class: id }) : null, label, h('small', null, String(n)));
  const chips = !appPage && (Object.keys(appsHere).length > 1 || P.only) ? h('div', { class: 'rt-hchips', id: 'homeChips', role: 'group', 'aria-label': 'The benches of one app' },
    chip(null, 'All', total), ...APPS.filter(a => appsHere[a.id] || P.only === a.id).map(a => chip(a.id, a.name, appsHere[a.id] || 0))) : null;
  if (!appPage && P.only) benches = benches.filter(b => (b.tool || 'jekray') === P.only);
  const team = wsInfo && wsInfo.kind !== 'personal';
  const menuOf = new Map();
  // the benches picked: a tick on each, Ctrl-click one more, Shift-click a run; what can be done with them in a bar
  const order = benches.map(b => b.id), benchOf = new Map(benches.map(b => [b.id, b]));
  for (const id of [...picked]) if (!benchOf.has(id)) picked.delete(id);
  const bar = h('div', { class: 'rt-hpickbar', id: 'homePicked', role: 'toolbar', 'aria-label': 'The benches picked', hidden: true });
  const paintPicked = () => {
    for (const c of box.querySelectorAll('.rt-hcard[data-bench]')) { const on = picked.has(c.dataset.bench); c.classList.toggle('picked', on); const k = c.querySelector('.rt-hpick'); if (k) k.checked = on; }
    box.classList.toggle('picking', picked.size > 0);
    const all = box.querySelector('.rt-hpickall');
    if (all) { all.checked = picked.size > 0 && picked.size === order.length; all.indeterminate = picked.size > 0 && picked.size < order.length; }
    bar.hidden = !picked.size;
    if (!picked.size) { bar.replaceChildren(); return; }
    const bs = order.filter(id => picked.has(id)).map(id => benchOf.get(id));
    const act = (label, icon, fn, cls) => { const x = h('button', { type: 'button', class: 'rt-btn' + (cls ? ' ' + cls : '') }, homeIcon(icon), ' ' + label); x.addEventListener('click', () => fn(x)); return x; };
    const choose = (x, note, options, done) => {
      const sel = h('select', { 'aria-label': note }, h('option', { value: '?' }, 'Choose…'), ...options.map(([v, t]) => h('option', { value: v }, t)));
      sel.addEventListener('change', () => { if (sel.value === '?') return; closeHomeMenu(); done(sel.value); });
      openHomeMenu(x, [h('div', { class: 'rt-menunote' }, note), sel]);
    };
    bar.replaceChildren(...[h('b', null, countOf(bs.length, 'bench') + ' picked'),
      !bin && can ? act('Move to…', 'move', x => choose(x, 'Move ' + sayItems(bs, []) + ' to', [['', top], ...folders.map(f => [f.id, pathText(f.id)])], v => moveItems({ benches: bs, folders: [] }, v || null))) : null,
      !bin && copyPlaces(ws).length ? act('Copy to…', 'copy', x => choose(x, 'Copy ' + sayItems(bs, []) + ' to', copyPlaces(ws).map(w => [w.id, placeName(w)]), v => homeSay(async () => {
        for (const b of bs) await api('/v1/benches/' + b.id + '/fork', Object.assign({ method: 'POST' }, jsonBody({ workspace_id: v })));
        picked.clear();
      }, 'Copied ' + sayItems(bs, []) + ' to ' + placeName(copyPlaces(ws).find(w => w.id === v)))())) : null,
      !bin && writer ? act('Delete', 'trash', () => binItems(bs), 'danger') : null,
      bin && writer ? act('Restore', 'restore', () => homeSay(async () => { for (const b of bs) await api('/v1/benches/' + b.id + '/undelete', { method: 'POST' }); picked.clear(); }, 'Restored ' + sayItems(bs, []))()) : null,
      h('button', { type: 'button', class: 'rt-link', title: 'Escape', onclick: () => { picked.clear(); paintPicked(); } }, 'Clear')].filter(Boolean));
  };
  const pick = (id, e) => {
    if (e && e.shiftKey && pickAnchor && pickAnchor !== id) for (const x of runOf(order, pickAnchor, id)) picked.add(x);
    else { if (picked.has(id)) picked.delete(id); else picked.add(id); pickAnchor = id; }
    paintPicked();
  };
  const benchCards = benches.map(b => {
    const app = appOf(b.tool), drag = can && !bin;
    const more = h('button', { type: 'button', class: 'rt-hmore', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'More for ' + b.name, title: 'More' }, '⋯');
    const moveTo = () => {
      const sel = h('select', { 'aria-label': 'Move to folder' }, h('option', { value: '' }, top),
        ...folders.map(f => { const o = h('option', { value: f.id }, pathText(f.id)); o.selected = f.id === b.folder_id; return o; }));
      sel.addEventListener('change', () => { closeHomeMenu(); homeSay(() => api('/v1/benches/' + b.id, Object.assign({ method: 'PATCH' }, jsonBody({ folder_id: sel.value || null }))), 'Moved')(); });
      openHomeMenu(more, [h('div', { class: 'rt-menunote' }, 'Move “' + b.name + '” to'), sel]);
    };
    const name = h('b', { class: 'rt-hname', title: b.name }, tbl ? null : h('span', { class: 'rt-htool ' + app.id, title: 'A ' + app.name + ' ' + thingOf(b.tool) + ': it opens in ' + app.name }, app.name), b.name);
    const rename = () => {
      if (!can || bin) return false;
      const old = [...name.childNodes];
      const inp = nameInput(b.name, 'Name of the ' + thingOf(b.tool), nm => homeSay(() => api('/v1/benches/' + b.id, Object.assign({ method: 'PATCH' }, jsonBody({ name: nm }))))(), () => { name.replaceChildren(...old); card.draggable = drag; });
      card.draggable = false; name.replaceChildren(inp); inp.focus(); inp.select();
      return true;
    };
    const items = () => bin ? [
      writer ? ['Restore', 'restore', homeSay(() => api('/v1/benches/' + b.id + '/undelete', { method: 'POST' }), 'Restored “' + b.name + '”')] : null,
      ['History', 'history', () => { Object.assign(P, { view: 'history', history: { id: b.id, name: b.name } }); fillHome(); }]] : [
      ['Open in ' + app.name, 'open', () => homeOpenBench(b.id, null, b)],
      ['History', 'history', () => { Object.assign(P, { view: 'history', history: { id: b.id, name: b.name } }); fillHome(); }],
      can ? ['Fork…', 'fork', () => homeFork(b)] : null,
      copyPlaces(ws).length ? ['Copy to…', 'copy', () => setTimeout(() => homeCopy(b, more))] : null,
      'sep',
      can ? ['Rename', 'rename', () => setTimeout(rename)] : null,
      can && folders.length ? ['Move to…', 'move', () => setTimeout(moveTo)] : null,
      writer ? ['Delete', 'trash', homeSay(() => api('/v1/benches/' + b.id, { method: 'DELETE' }), '“' + b.name + '” moved to the bin for 30 days'), 'danger'] : null];
    more.addEventListener('click', () => openHomeMenu(more, items()));
    menuOf.set(b.id, items);
    // no picture yet: the app's own mark, on its colour
    const pic = b.thumb ? h('img', { class: 'thumb', src: API_BASE + b.thumb, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' })
      : h('span', { class: 'thumb rt-nopic rt-happpic ' + app.id, title: 'No picture yet: it is drawn the next time this is saved in ' + app.name }, homeIcon(app.icon || 'bench'));
    // a click opens it in its app (Ctrl or Shift picks it instead); on an app's page, the bench under the pointer
    // or the keyboard is the one shown beside the list
    const show = () => { if (appPage && P.sel !== b.id) { P.sel = b.id; fillPreview(); } };
    const open = h('button', { type: 'button', class: 'rt-hopen', title: bin ? b.name : 'Open “' + b.name + '” in ' + app.name,
      onclick: e => { if (e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); pick(b.id, e); } else if (bin) more.click(); else homeOpenBench(b.id, null, b); },
      onfocus: show }, pic);
    const tick = h('input', { type: 'checkbox', class: 'rt-hpick', 'aria-label': 'Pick “' + b.name + '”', title: 'Pick it (Ctrl-click picks one more, Shift-click a run)' });
    tick.addEventListener('click', e => { e.stopPropagation(); pick(b.id, e); });
    const whereLink = b.folder_id && byId.get(b.folder_id) ? link(pathText(b.folder_id), go('folder', b.folder_id)) : null;
    const when = (bin ? 'Deleted ' + whenAgo(b.deleted_at) : (tbl ? '' : 'Changed ') + whenAgo(b.updated_at)) + (team && b.updated_by ? ' by ' + b.updated_by.name : '');
    const fork = b.forked_from ? h('small', { class: 'rt-hfork', title: 'Forked from “' + b.forked_from.name + '”, version ' + b.forked_from.version }, homeIcon('fork'), 'from “' + b.forked_from.name + '”') : null;
    const who = b.editing && account && b.editing.id !== account.user.id ? h('small', { class: 'rt-hwho', title: b.editing.name + ' has this bench open to edit' }, avatarNode(b.editing, 'small'), b.editing.name + ' is editing') : null;
    const card = h('div', { class: 'rt-hcard' + (tbl ? ' rt-hrow' : '') + (P.flash === b.id ? ' flash' : ''), 'data-bench': b.id, draggable: drag ? 'true' : null, onpointerenter: show },
      tick, open,
      ...(tbl ? [h('div', { class: 'rt-hinfo' }, name, fork, who),
        h('span', { class: 'rt-hc app' }, h('span', { class: 'rt-htool ' + app.id, title: 'A ' + app.name + ' ' + thingOf(b.tool) + ': it opens in ' + app.name }, app.name)),
        showWhere ? h('span', { class: 'rt-hc where' }, whereLink || top) : null,
        h('span', { class: 'rt-hc when' }, when), h('span', { class: 'rt-hc size' }, kb(b.size_bytes))]
      : [h('div', { class: 'rt-hinfo' }, name,
        h('small', null, [when, kb(b.size_bytes)].join(' · ')),
        showWhere && whereLink ? h('small', { class: 'rt-hwhere' }, 'in ', whereLink) : null, fork, who)]),
      more);
    card.renameHere = rename;
    if (drag) dragFrom(card, () => ({ benches: picked.has(b.id) ? order.filter(id => picked.has(id)).map(id => benchOf.get(id)) : [b], folders: [] }));
    return card;
  });
  P.flash = null;
  const out = [chips, bar];
  if (tbl && (folderCards.length || benchCards.length)) {
    const th = (key, label) => {
      const on = sortKey === key, down = (key === 'changed' || key === 'size') !== !!homeView.flip;
      return h('button', { type: 'button', class: 'rt-hsort', 'aria-pressed': String(on), title: on ? 'Turn the order round' : 'Sort by this',
        onclick: () => { if (on) homeView.flip = !homeView.flip; else { homeView.sort = key; homeView.flip = false; } keepView(); fillHome(); } }, label || SORTS[key], on ? h('span', { 'aria-hidden': 'true' }, down ? ' ▾' : ' ▴') : null);
    };
    const all = h('input', { type: 'checkbox', class: 'rt-hpickall', 'aria-label': 'Pick every bench here', title: 'Pick every bench here' });
    all.addEventListener('click', () => { if (picked.size === order.length) picked.clear(); else for (const id of order) picked.add(id); paintPicked(); });
    out.push(h('div', { class: 'rt-htable' + (showWhere ? ' where' : ''), role: 'table' },
      h('div', { class: 'rt-hrow rt-hth' }, order.length ? all : h('span'), h('span'), th('name'), th('app'), showWhere ? th('folder') : null, th('changed', bin ? 'Deleted' : 'Changed'), th('size'), h('span')),
      ...folderCards, ...benchCards));
  } else {
    if (folderCards.length) out.push(benchCards.length ? h('h3', null, 'Folders') : null, h('div', { class: 'rt-hgrid folders' }, ...folderCards));
    if (benchCards.length) out.push(folderCards.length ? h('h3', null, 'Benches') : null, h('div', { class: 'rt-hgrid' }, ...benchCards));
  }
  if (!folderCards.length && !benchCards.length) out.push(h('p', { class: 'rt-hempty' }, bin ? 'The bin is empty. Deleted benches stay here for 30 days.'
    : !appPage && P.only ? 'No ' + appOf(P.only).name + ' ' + thingOf(P.only) + 's here.'
    : P.q ? 'No bench matches “' + P.q + '”.' : P.view === 'recent' ? 'Nothing yet.' : P.folder ? 'This folder is empty.'
    : appPage ? 'No ' + appPage.name + ' ' + thingOf(appPage.id) + 's here yet.' : 'No benches yet. Start one with New, top right, or use Save to cloud in an app’s File menu.'));
  homeKeys = {
    clear: () => { picked.clear(); paintPicked(); },
    all: () => { if (!order.length) return false; for (const id of order) picked.add(id); paintPicked(); return true; },
    del: () => { if (!bin && writer && picked.size) binItems(order.filter(id => picked.has(id)).map(id => benchOf.get(id))); },
    rename: card => { const c = card || (picked.size === 1 ? box.querySelector('.rt-hcard.picked') : null); return !!(c && c.renameHere && c.renameHere()); },
  };
  let fillPreview = () => {};
  if (!appPage) { box.replaceChildren(...out.filter(Boolean)); paintPicked(); decorate(); return; }
  // the launch page: the app, then its benches beside the one shown (the last changed, until the pointer or the
  // keyboard is on another)
  if (!benches.some(b => b.id === P.sel)) P.sel = benches.length ? benches.reduce((x, y) => (y.updated_at > x.updated_at ? y : x)).id : null;
  const prev = h('aside', { class: 'rt-hprev', id: 'appPreview', 'aria-label': 'The bench shown', 'aria-live': 'polite' });
  fillPreview = () => {
    for (const c of box.querySelectorAll('.rt-hcard[data-bench]')) c.classList.toggle('sel', c.dataset.bench === P.sel);
    const b = benches.find(x => x.id === P.sel);
    if (!b) {
      prev.replaceChildren(h('span', { class: 'thumb rt-nopic' }, 'No bench picked'), h('h3', null, 'No ' + appPage.name + ' ' + thingOf(appPage.id) + 's' + (P.folder || P.q ? ' here' : ' yet')),
        h('p', null, P.folder || P.q ? 'Pick another folder, or start one.' : 'Start one, or save one from ' + appPage.name + ' with File › Save to cloud.'),
        h('div', { class: 'rt-actions' }, h('button', { type: 'button', class: 'rt-btn primary', onclick: () => startNew(appPage.id) }, 'New ' + thingOf(appPage.id))));
      return;
    }
    const pmore = h('button', { type: 'button', class: 'rt-btn rt-hprevmore', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'More for ' + b.name, title: 'More' }, '⋯');
    pmore.addEventListener('click', () => openHomeMenu(pmore, (menuOf.get(b.id) || (() => []))()));
    const folderName = b.folder_id && byId.get(b.folder_id) ? pathText(b.folder_id) : null;
    const ver = b.version || b.head_version;
    prev.replaceChildren(
      b.thumb ? h('img', { class: 'thumb', src: API_BASE + b.thumb, alt: 'The bench “' + b.name + '”' }) : h('span', { class: 'thumb rt-nopic rt-happpic ' + appPage.id }, homeIcon(appPage.icon || 'bench'), h('small', null, 'No picture yet: it is drawn the next time the ' + thingOf(appPage.id) + ' is saved in ' + appPage.name)),
      h('h3', null, h('span', { class: 'rt-htool ' + appPage.id }, appPage.name), b.name),
      h('dl', null,
        h('dt', null, 'In'), h('dd', null, folderName ? top + ' › ' + folderName : top),
        h('dt', null, 'Changed'), h('dd', null, whenAgo(b.updated_at) + (b.updated_by && b.updated_by.name ? ' by ' + b.updated_by.name : '')),
        h('dt', null, 'Size'), h('dd', null, kb(b.size_bytes)),
        ver ? h('dt', null, 'Version') : null, ver ? h('dd', null, String(ver)) : null),
      h('div', { class: 'rt-actions' },
        h('button', { type: 'button', class: 'rt-btn primary', id: 'appPreviewOpen', onclick: () => homeOpenBench(b.id, null, b) }, 'Open in ' + appPage.name),
        h('button', { type: 'button', class: 'rt-btn', onclick: () => { showApp(null); Object.assign(P, { view: 'history', history: { id: b.id, name: b.name } }); fillHome(); } }, homeIcon('history'), ' History'),
        pmore));
  };
  box.replaceChildren(appHead(appPage), h('div', { class: 'rt-hlaunch' }, h('div', { class: 'rt-hexplore' }, ...out.filter(Boolean)), prev));
  fillPreview(); paintPicked(); decorate();
}
/* an app's head on its launch page: what it does, and the ways to start in it */
function appHead(a) {
  const starts = a.id === 'jekray' ? NEW_KINDS.filter(k => k.app === 'jekray' && k.into).map(k => h('button', { type: 'button', class: 'rt-btn', onclick: () => startNew('jekray', k.into) }, k.label.replace(' (JEKray)', ''))) : [];
  return h('div', { class: 'rt-happhead ' + a.id },
    h('h2', null, a.name),
    h('p', null, a.line),
    h('div', { class: 'rt-actions' },
      h('button', { type: 'button', class: 'rt-btn primary', id: 'appOpen', onclick: () => { track('cloud', 'app.' + a.id); openApp(a.id); } }, 'Open ' + a.name),
      h('button', { type: 'button', class: 'rt-btn', id: 'appNew', onclick: () => startNew(a.id) }, 'New ' + thingOf(a.id)),
      ...starts,
      a.about ? h('a', { href: a.about, target: '_blank', rel: 'noopener', class: 'rt-link' }, 'About ' + a.name) : null));
}

/* ---------- the apps ----------
   Opened from New (its Open group) and the rail, each in its own tab; signed out, under the sign-in panel. */
export function appLinks() {
  return h('div', { class: 'rt-happlinks', 'aria-label': 'Apps' }, h('span', null, 'The apps need no account to use:'),
    ...APPS.map(a => h('button', { type: 'button', class: 'rt-btn', title: a.line, onclick: () => { track('cloud', 'app.' + a.id); openApp(a.id); } }, 'Open ' + a.name)),
    ...APPS.filter(a => a.about).map(a => h('a', { href: a.about, target: '_blank', rel: 'noopener', class: 'rt-link' }, 'About ' + a.name)));
}
/* New's menu: what can be started, a bench in each app first (opening an app is on its page, from the rail) */
export function newMenuItems() {
  return NEW_KINDS.map(k => [k.label, k.icon, () => startNew(k.app, k.into)]);
}
/* What New starts: a bench in an app, or straight into one of JEKray's designers */
export const NEW_KINDS = [
  { app: 'jekray', into: null, label: 'JEKray bench', icon: 'bench' },
  { app: 'jekion', into: null, label: 'JEKion bench', icon: 'ion' },
  { app: 'jekfilm', into: null, label: 'JEKfilm coating', icon: 'coat' },
  { app: 'jekcad', into: null, label: 'JEKcad part studio', icon: 'cube' },
  { app: 'jekray', into: 'lens', label: 'Optical design (JEKray)', icon: 'lens' },
  { app: 'jekray', into: 'rf', label: 'RF design (JEKray)', icon: 'rf' },
];
/* what a new bench of each app holds: an empty one (JEKfilm's a single MgF2 layer on N-BK7, as the app starts one) */
export function newContent(app, name) {
  if (app === 'jekion') return { format: 'jekion', version: 1, name, electrodes: [], ions: [], detectors: [] };
  if (app === 'jekcad') return { format: 'jekcad', version: 1, name, units: 'mm', variables: [], features: [], rollback: null, parts: {} };
  if (app === 'jekfilm') return { format: 'jekfilm', version: 1, name, spec: { target: 'ar', sub: { glass: 'N-BK7' }, lo: 450, hi: 650, design: 550 }, layers: [{ n: 1.38, d: 99.638 }] };
  return { format: 'jekray', version: 1, name, elements: [], fibres: [] };
}
/* A new bench: in the cloud, named and placed (the workspace shown, or another the person can save to), then opened
   in its app (#cloud=<id>, and :lens, :rf or :coat into a designer). Signed out, or with nowhere to save, it starts in
   the app itself, in that browser (#new, #new=lens…). */
export function startNew(app, into) {
  track('cloud', 'new.' + app + (into ? '.' + into : ''));
  const places = newPlaces().filter(w => w.active);
  if (!account || !places.length) { openApp(app, 'new' + (into ? '=' + into : '')); if (account) toast('Started in ' + appOf(app).name + ': saving it to the cloud needs JEKrayPro'); return; }
  let dlg = document.getElementById('spaceNewDialog');
  if (dlg) dlg.remove();
  const kind = NEW_KINDS.find(k => k.app === app && k.into === (into || null)) || NEW_KINDS[0];
  const name = h('input', { type: 'text', id: 'spaceNewName', value: 'Untitled ' + thingOf(app), spellcheck: 'false', maxlength: '120' });
  const ws = cloudPlace.ws, folder = cloudPlace.view === 'folder' ? cloudPlace.folder : null;
  const where = h('select', { id: 'spaceNewWhere' }, ...places.map(w => h('option', { value: w.id }, placeName(w))));
  where.value = places.some(w => w.id === ws) ? ws : places[0].id;
  const note = h('p', { class: 'rt-subsmall' });
  const sayWhere = () => { const w = places.find(x => x.id === where.value); note.textContent = (w.kind === 'personal' ? 'Yours alone, in My benches' : 'Shared with everyone in ' + w.name + ', who can open and edit it as their role allows') + (where.value === ws && folder ? ', in the folder you are looking at.' : '.') + ' It opens in ' + appOf(app).name + ', where it saves as you work.'; };
  where.addEventListener('change', sayWhere); sayWhere();
  const go = h('button', { class: 'rt-btn primary', type: 'button', id: 'spaceNewMake' }, 'Make it');
  dlg = h('dialog', { class: 'rt-dialog', id: 'spaceNewDialog', 'aria-labelledby': 'spaceNewTitle' },
    h('h2', { id: 'spaceNewTitle' }, 'New ' + kind.label),
    h('div', { class: 'rt-rows' }, h('div', { class: 'rt-f wide' }, h('label', { for: 'spaceNewName' }, 'Name'), name), h('div', { class: 'rt-f wide' }, h('label', { for: 'spaceNewWhere' }, 'In'), where)),
    note, h('div', { class: 'rt-actions' }, h('button', { class: 'rt-btn', type: 'button', onclick: () => dlg.close() }, 'Cancel'), go));
  document.body.append(dlg);
  go.addEventListener('click', async () => {
    const wsId = where.value, nm = name.value.trim() || 'Untitled ' + thingOf(app), fid = wsId === ws ? folder || null : null;
    go.disabled = true;
    try {
      const content = JSON.stringify(newContent(app, nm));
      const b = await api('/v1/workspaces/' + wsId + '/benches', Object.assign({ method: 'POST' }, jsonBody({ name: nm, folder_id: fid, content })));
      dlg.close();
      openApp(app, 'cloud=' + b.id + (into ? ':' + into : ''));
      Object.assign(cloudPlace, { ws: wsId, flash: b.id });
      fillHome();
    } catch (err) {
      go.disabled = false;
      toast(err.status === 402 ? 'Benches in the cloud need JEKrayPro.' : 'Could not make the bench: ' + err.message, true);
    }
  });
  dlg.showModal(); name.select();
}

/* Signed out: what the hub is, the ways in, and the apps (which need no account to use) */
export function signedOutView() {
  const rail = document.getElementById('homeRail'), box = document.getElementById('homeList');
  document.getElementById('homeCrumbs').replaceChildren('JEKsuite');
  document.getElementById('homeTools').replaceChildren();
  document.getElementById('homeNote').hidden = true;
  document.getElementById('homeWhere').textContent = 'Your apps and benches';
  const P = cloudPlace, appPage = P.app ? appOf(P.app) : null;
  rail.replaceChildren(h('h2', null, 'Apps'), ...APPS.map(a => h('button', { type: 'button', onclick: () => showApp(a.id), title: a.name + ': what it does, and its benches', class: 'rt-happbtn ' + a.id, 'aria-current': String(P.app === a.id) }, homeIcon(a.icon), h('span', null, a.name))));
  homeKeys = null; picked.clear();
  box.classList.remove('rows', 'tbl', 'picking');
  if (appPage) {
    document.getElementById('homeCrumbs').replaceChildren(appPage.name);
    document.getElementById('homeWhere').textContent = appPage.name;
    box.replaceChildren(appHead(appPage), h('div', { class: 'rt-hsignin rt-hsigninline' },
      h('p', null, 'Sign in to see your ' + appPage.name + ' benches here. ' + appPage.name + ' itself needs no account to use.'),
      h('div', { class: 'rt-actions', style: 'justify-content:flex-start' }, h('button', { type: 'button', class: 'rt-btn primary', id: 'homeSignIn', onclick: openAccountMenu }, 'Sign in or create an account'))));
    return;
  }
  box.replaceChildren(
    h('div', { class: 'rt-hsignin' },
      h('h2', null, 'Sign in to see your benches'),
      h('p', null, 'JEKsuite holds every bench you keep in the cloud, from every JEK app, in your workspace and your teams’: open any of them in its app, see its history, fork, compare and merge versions, and manage your account, plan and teams. One account signs you in to every app.'),
      h('div', { class: 'rt-actions', style: 'justify-content:flex-start' }, h('button', { type: 'button', class: 'rt-btn primary', id: 'homeSignIn', onclick: openAccountMenu }, 'Sign in or create an account'),
        h('button', { type: 'button', class: 'rt-btn', onclick: () => showSubscribe() }, 'JEKrayPro: plans and prices'))),
    appLinks());
}

/* ---------- the page's wiring for this module: done once, from boot.js ---------- */
export function wireHome() {
  try { Object.assign(homeView, JSON.parse(localStorage.getItem(HOME_KEY)) || {}); } catch (err) { /* defaults */ }
  // #parts (JEKray's Manage My parts): opened at My parts
  if (location.hash === '#parts') { cloudPlace.view = 'parts'; window.history.replaceState(null, '', location.pathname + location.search); }
  delete homeView.app;                         // (an older filter by app, kept in the view: the chips over a list are for this visit)
  if (!Array.isArray(homeView.open)) homeView.open = [];
  // #app=<id>: that app's launch page; the back button goes with it
  cloudPlace.app = appHash();
  window.addEventListener('hashchange', () => { const a = appHash(); if (a !== cloudPlace.app) { Object.assign(cloudPlace, { app: a, view: 'folder', folder: null, q: '', history: null, sel: null }); document.getElementById('homeSearch').value = ''; fillHome(); } });
  document.addEventListener('pointerdown', e => { const m = document.querySelector('.rt-hmenu'); if (m && !m.contains(e.target) && !e.target.closest('[aria-expanded="true"]')) closeMenu(); }, true);
  document.getElementById('diffClose').addEventListener('click', () => document.getElementById('diffDialog').close());
  document.getElementById('mergeCancel').addEventListener('click', () => document.getElementById('mergeDialog').close());
  // New: an app to open, or a bench to start in one (in the workspace and folder shown)
  const newBtn = document.getElementById('homeNew');
  newBtn.addEventListener('click', () => openMenu(newBtn, newMenuItems()));
  const search = document.getElementById('homeSearch');
  let searchT = null;
  search.addEventListener('input', () => {
    clearTimeout(searchT);
    searchT = setTimeout(() => { Object.assign(cloudPlace, { q: search.value.trim(), history: null }); if (cloudPlace.view === 'history' || cloudPlace.view === 'bin') cloudPlace.view = 'folder'; fillHome(); }, 250);
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.rt-hmenu') && !document.querySelector('dialog[open]')) closeMenu(); });
  // the list's keys: Escape lets go of what is picked, Ctrl+A picks every bench shown, Delete bins the picked, F2
  // renames the bench or folder the keyboard is on (or the one bench picked)
  window.addEventListener('keydown', e => {
    if (!homeKeys || document.querySelector('dialog[open]') || document.querySelector('.rt-hmenu')) return;
    const t = e.target, typing = t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '') && t.type !== 'checkbox';
    if (typing) return;
    if (e.key === 'Escape' && picked.size) homeKeys.clear();
    else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a') { if (homeKeys.all()) e.preventDefault(); }
    else if (e.key === 'Delete' && picked.size) homeKeys.del();
    else if (e.key === 'F2') { const c = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.rt-hcard') : null; if (homeKeys.rename(c)) e.preventDefault(); }
  });
  document.getElementById('home').addEventListener('scroll', closeMenu, true);
  window.addEventListener('resize', closeMenu);
  // back in the hub from an app: what changed there shows
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && account) fillHome(); });
}

/* ---------- the account, in the hub ----------
   The account is the apps' own (jekray/src/io/account.js, shared): its menu here is a pop-up made as it opens from the
   rows it gives, with the theme in it (the hub has no View menu), and the plans for someone signed out */
export function openAccountMenu() {
  const btn = document.getElementById('btnAcct');
  if (menuOpenFor() && menuOpenFor().btn === btn) { closeMenu(); return; }
  openMenu(btn, accountMenuRows(), 'rt-acctmenu');
  if (menuOpenFor()) menuIcons(menuOpenFor().el);
}
export function spaceAccountExtra(signedIn) {
  const cur = spaceTheme(), theme = h('div', { class: 'rt-hthemes', role: 'group', 'aria-label': 'Theme' }, h('span', null, 'Theme'),
    ...[['dark', 'Dark'], ['light', 'Light'], ['system', 'System']].map(([v, t]) => h('button', { type: 'button', class: 'rt-btn', 'aria-pressed': String(cur === v), onclick: () => { setSpaceTheme(v); closeMenu(); } }, t)));
  const plans = h('button', { type: 'button', role: 'menuitem', 'data-icon': 'star', onclick: () => { closeMenu(); showSubscribe(); } }, 'JEKrayPro: plans and prices\u2026');
  return signedIn ? [theme] : [plans, theme];
}
