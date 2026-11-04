import { EMBED, TEST_MODE } from '../../../jekray/src/core/constants.js';
import { hooks } from '../../../jekray/src/core/hooks.js';
import { designPro } from '../../../jekray/src/ui/pro.js';
import { goal, track } from '../../../jekray/src/io/usage.js';
import { ION_FORMAT } from '../core/units.js';
import { project } from '../state/project.js';
import { serialize } from '../state/elements.js';
import { h } from '../ui/panel.js';
import { toast } from '../ui/actions.js';
import { openProjectData } from './open.js';
import { account, accountsOn, api, showSignIn } from './account.js';

/* ==========================================================================
   Sharing a bench as a link, as JEKray does: the bench deflated and written after #p= ('i', or 'k' plain where the
   browser cannot compress), or, with an account, kept by the API as a short link, /i/ and ten capitals on the site
   (jek-api src/links.js, the same store as JEKray's links with JEKion's own prefix; the site's 404 page forwards
   /i/<id> here as #s=<id>). Making a short link is JEKrayPro's (a free account keeps three); anyone opens one.
   ========================================================================== */
export const b64u = bytes => { let t = ''; for (let i = 0; i < bytes.length; i += 0x8000) t += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const unb64u = t => { const s2 = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)); const u = new Uint8Array(s2.length); for (let i = 0; i < s2.length; i++) u[i] = s2.charCodeAt(i); return u; };
async function streamBytes(bytes, T) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(T)).arrayBuffer()); }
/* the bench as a link carries it: as saved, its view with it */
export const shareData = () => serialize();
/* the part after #p=: "i" then deflated JSON, or "k" then plain JSON where the browser cannot compress */
export async function shareHash(data) {
  const json = new TextEncoder().encode(JSON.stringify(data || shareData()));
  if (typeof CompressionStream !== 'undefined') { try { return 'i' + b64u(await streamBytes(json, new CompressionStream('deflate-raw'))); } catch (err) { /* plain below */ } }
  return 'k' + b64u(json);
}
export async function readShareHash(hash) {
  const kind = hash[0], body = hash.slice(1);
  if (kind === 'z' || kind === 'j') throw new Error('that is a JEKray bench: open the link in JEKray');
  if (kind !== 'i' && kind !== 'k') throw new Error('the link is not one of JEKion’s');
  let bytes;
  try { bytes = unb64u(body); } catch (err) { throw new Error('the link is damaged (it may have been cut short)'); }
  if (kind === 'i') {
    if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot read compressed links; ask for the .jekion file instead');
    try { bytes = await streamBytes(bytes, new DecompressionStream('deflate-raw')); } catch (err) { throw new Error('the link is damaged (it may have been cut short)'); }
  }
  let d;
  try { d = JSON.parse(new TextDecoder().decode(bytes)); } catch (err) { throw new Error('the link does not hold a bench'); }
  if (!d || d.format !== ION_FORMAT) throw new Error('the link does not hold a JEKion bench');
  return d;
}
export const shareBase = () => location.origin + location.pathname;
export const shortUrl = id => location.origin + '/i/' + id;
const MADE = new Map();
export async function shortLink() {
  const text = await shareHash();
  if (MADE.has(text)) return MADE.get(text);
  const r = await api('/v1/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: project.name || 'Untitled bench', data: text }) });
  MADE.set(text, r.id);
  return r.id;
}
async function shareLink() {
  const short = accountsOn();
  if (short && account === null) { showSignIn('export', 'share a link'); return; }
  if (short && !designPro('share a link')) return;
  const id = short ? await shortLink() : null, url = short ? shortUrl(id) : shareBase() + '#p=' + await shareHash();
  const dlg = document.getElementById('shareDialog'), box = document.getElementById('shareUrl'), note = document.getElementById('shareNote');
  box.value = url;
  note.textContent = short ? 'Anyone with the link opens this bench as it is now. A copy of it is kept with your account until you delete it.'
    : url.length.toLocaleString() + ' characters. ' + (url.length > 2000 ? 'That is long: some chat and email apps cut links this size. If it arrives cut short, send the .jekion file instead.' : 'Anyone with the link opens this bench as it is now; nothing is uploaded, the bench travels in the link itself.');
  if (short) linksList(id); else document.getElementById('shareLinks').replaceChildren();
  dlg.showModal(); box.focus(); box.select();
  goal('share'); track('share', 'ion-link');
  try { await navigator.clipboard.writeText(url); document.getElementById('shareCopy').textContent = 'Copied'; } catch (err) { document.getElementById('shareCopy').textContent = 'Copy link'; }
}
/* the person's share links, in the dialog: to copy or delete (JEKray's and JEKion's together, each on its own address) */
async function linksList(current) {
  const box = document.getElementById('shareLinks');
  box.replaceChildren(h('p', { class: 'note' }, 'Your share links…'));
  let links;
  try { links = (await api('/v1/me/links')).links; } catch (err) { box.replaceChildren(h('p', { class: 'note' }, 'Your share links could not be listed: ' + err.message)); return; }
  const day = t => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const rows = links.map(l => h('li', { class: l.id === current ? 'cur' : '' }, h('span', { class: 'nm' }, l.name), h('span', { class: 'mono' }, '/i/' + l.id), h('span', { class: 'rt-lsub' }, day(l.created_at) + ' · opened ' + l.opens + (l.opens === 1 ? ' time' : ' times')),
    h('button', { type: 'button', class: 'rt-link', onclick: e => { navigator.clipboard.writeText(shortUrl(l.id)).then(() => { e.target.textContent = 'Copied'; }, () => {}); } }, 'Copy'),
    h('button', { type: 'button', class: 'rt-link', 'aria-label': 'Delete the link ' + l.id, onclick: async () => {
      try { await api('/v1/links/' + l.id, { method: 'DELETE' }); } catch (err) { toast('Could not delete it: ' + err.message, true); return; }
      for (const [k, v] of MADE) if (v === l.id) MADE.delete(k);
      toast('Deleted: the link no longer opens.'); linksList(current);
    } }, 'Delete')));
  box.replaceChildren(h('details', { open: links.length <= 5 ? '' : null }, h('summary', null, 'Your share links (' + links.length + ', JEKray’s among them)'), links.length ? h('ul', { class: 'rt-sharelinks' }, ...rows) : h('p', { class: 'note' }, 'None yet.')));
}
/* a short link opened: its bench fetched, for anyone */
export async function openShortLink(id) {
  let r;
  try { r = await api('/v1/links/' + encodeURIComponent(id)); } catch (err) { toast('Could not open that link: ' + err.message, true); return; }
  return openShareHash(r.data);
}
/* a link opened: its bench replaces this one (Ctrl+Z brings this one back) */
export async function openShareHash(hash) {
  try {
    const data = await readShareHash(hash);
    openProjectData(data, 'the shared bench');
    if (!EMBED) toast('Opened the shared bench. Undo brings yours back.');
    track('import', 'ion-link');
    return true;
  } catch (err) { toast('Could not open that link: ' + err.message + '.', true); return false; }
}
/* the bench through a link and back (the tests): what came out */
export async function shareRoundTrip() {
  const before = JSON.stringify(shareData()), hash = await shareHash();
  const d = await readShareHash(hash); openProjectData(d, 'test');
  return { same: JSON.stringify(shareData()) === before, length: hash.length, kind: hash[0] };
}
export function wireShare() {
  const dlg = document.getElementById('shareDialog');
  document.getElementById('btnShare').addEventListener('click', () => { document.getElementById('shareCopy').textContent = 'Copy link'; shareLink().catch(err => toast('Could not make a link: ' + err.message, true)); });
  document.getElementById('shareClose').addEventListener('click', () => dlg.close());
  document.getElementById('shareCopy').addEventListener('click', e => { const box = document.getElementById('shareUrl'); box.select(); navigator.clipboard.writeText(box.value).then(() => { e.target.textContent = 'Copied'; }, () => { document.execCommand('copy'); e.target.textContent = 'Copied'; }); });
  if (TEST_MODE) hooks.ionShare = shareRoundTrip;
}
