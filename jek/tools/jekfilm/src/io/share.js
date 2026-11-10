import { EMBED, TEST_MODE } from '../../../jekray/src/core/constants.js';
import { designPro } from '../../../jekray/src/ui/pro.js';
import { goal, track } from '../../../jekray/src/io/usage.js';
import { account, accountsOn, api } from '../../../jekray/src/io/account.js';
import { h } from '../../../jekray/src/ui/dom.js';
import { FILM_FORMAT, filmText, normFilm } from '../core/film.js';
import { film } from '../ui/designer.js';
import { toast } from '../ui/bar.js';
import { filmSignIn } from './film-account.js';
import { filmAutosave, openFilmData } from './files.js';
import { setFilmLink } from './cloud.js';

/* ==========================================================================
   A coating shared as a link, as JEKray and JEKion share benches: the coating deflated and written after #p= ('f', or
   'g' plain where the browser cannot compress), or, with an account, kept by the API as a short link, /f/ and ten
   capitals on the site (jek-api src/links.js, the same store as the other apps' links with JEKfilm's own letters; the
   site's 404 page forwards /f/<id> here as #s=<id>, and the other apps send JEKfilm's links here). Making a short link
   is JEKrayPro's; anyone opens one, and the coating opened is a copy, linked to nothing.
   ========================================================================== */
const fb64u = bytes => { let t = ''; for (let i = 0; i < bytes.length; i += 0x8000) t += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const funb64u = t => { const s2 = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)); const u = new Uint8Array(s2.length); for (let i = 0; i < s2.length; i++) u[i] = s2.charCodeAt(i); return u; };
async function fstream(bytes, T) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(T)).arrayBuffer()); }
/* the part after #p=: "f" then deflated JSON, or "g" then plain JSON */
export async function filmShareHash(f) {
  const json = new TextEncoder().encode(filmText(f || film));
  if (typeof CompressionStream !== 'undefined') { try { return 'f' + fb64u(await fstream(json, new CompressionStream('deflate-raw'))); } catch (err) { /* plain below */ } }
  return 'g' + fb64u(json);
}
const OTHER_LINKS = { z: 'jekray', j: 'jekray', q: 'jekray', i: 'jekion', k: 'jekion' };
export async function readFilmHash(hash) {
  const kind = hash[0], body = hash.slice(1);
  if (OTHER_LINKS[kind]) throw new Error('that is a ' + (OTHER_LINKS[kind] === 'jekion' ? 'JEKion' : 'JEKray') + ' bench: open the link in ' + (OTHER_LINKS[kind] === 'jekion' ? 'JEKion' : 'JEKray'));
  if (kind !== 'f' && kind !== 'g') throw new Error('the link is not one of JEKfilm’s');
  let bytes;
  try { bytes = funb64u(body); } catch (err) { throw new Error('the link is damaged (it may have been cut short)'); }
  if (kind === 'f') {
    if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot read compressed links; ask for the .jekfilm file instead');
    try { bytes = await fstream(bytes, new DecompressionStream('deflate-raw')); } catch (err) { throw new Error('the link is damaged (it may have been cut short)'); }
  }
  let d;
  try { d = JSON.parse(new TextDecoder().decode(bytes)); } catch (err) { throw new Error('the link does not hold a coating'); }
  if (!d || d.format !== FILM_FORMAT) throw new Error('the link does not hold a JEKfilm coating');
  return normFilm(d);
}
export const filmShortUrl = id => location.origin + '/f/' + id;
const FILM_MADE = new Map();
async function filmShortLink() {
  const text = await filmShareHash();
  if (FILM_MADE.has(text)) return FILM_MADE.get(text);
  const r = await api('/v1/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: film.name || 'Untitled coating', data: text }) });
  FILM_MADE.set(text, r.id);
  return r.id;
}
/* File › Copy a share link: a short link with an account (JEKrayPro's), the coating in the link itself without accounts */
export async function shareFilm() {
  const short = accountsOn();
  if (short && !account) { filmSignIn('pro', 'share a link'); return null; }
  if (short && !designPro('share a link')) return null;
  const url = short ? filmShortUrl(await filmShortLink()) : location.origin + location.pathname + '#p=' + await filmShareHash();
  let dlg = document.getElementById('filmShare');
  if (!dlg) { dlg = h('dialog', { class: 'rt-dialog', id: 'filmShare', 'aria-labelledby': 'filmShareTitle' }); document.body.append(dlg); }
  const box = h('input', { type: 'text', id: 'filmShareUrl', readonly: '', value: url, 'aria-label': 'The link', class: 'film-shareurl' });
  const copyBtn = h('button', { class: 'rt-btn primary', type: 'button', onclick: () => { box.select(); navigator.clipboard.writeText(url).then(() => { copyBtn.textContent = 'Copied'; }, () => {}); } }, 'Copy link');
  dlg.replaceChildren(h('h2', { id: 'filmShareTitle' }, 'Share this coating'), box,
    h('p', { class: 'rt-subsmall' }, short ? 'Anyone with the link opens this coating as it is now, as a copy of their own. The link is kept with your account: JEKsuite’s My links lists it, to delete.'
      : url.length.toLocaleString() + ' characters. Anyone with the link opens this coating as it is now; it travels in the link itself.'),
    h('div', { class: 'rt-actions' }, h('button', { class: 'rt-btn', type: 'button', onclick: () => dlg.close() }, 'Close'), copyBtn));
  dlg.showModal(); box.select();
  goal('share'); track('share', 'film-link');
  try { await navigator.clipboard.writeText(url); copyBtn.textContent = 'Copied'; } catch (err) { /* the button copies */ }
  return url;
}
/* a link opened (#p=… or a short one): its coating here, a copy linked to nothing (Undo brings the last one back) */
export async function openFilmHash(hash) {
  try {
    const d = await readFilmHash(hash);
    if (!openFilmData(d)) return false;
    setFilmLink(null); filmAutosave();
    if (!EMBED) toast('Opened the shared coating. Undo brings yours back.');
    track('import', 'film-link');
    return true;
  } catch (err) { toast('Could not open that link: ' + err.message + '.', true); return false; }
}
export async function openFilmShort(id) {
  let r;
  try { r = await api('/v1/links/' + encodeURIComponent(id)); } catch (err) { toast('Could not open that link: ' + err.message, true); return false; }
  const other = OTHER_LINKS[String(r.data || '')[0]];
  if (other) { location.replace('/jek/tools/' + other + '.html#s=' + encodeURIComponent(id)); return false; }
  return openFilmHash(r.data);
}
export function wireShare() {
  document.getElementById('btnShare').addEventListener('click', () => { shareFilm().catch(err => toast('Could not make a link: ' + err.message, true)); });
  if (TEST_MODE) document.getElementById('btnShare').dataset.test = '1';
}
