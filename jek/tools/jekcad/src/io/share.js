import { EMBED, TEST_MODE } from '../../../jekray/src/core/constants.js';
import { accountGate } from '../../../jekray/src/ui/pro.js';
import { account, accountsOn, api } from '../../../jekray/src/io/account.js';
import { track } from '../../../jekray/src/io/usage.js';
import { CAD_FORMAT, fileData, normFile } from '../core/doc.js';
import { app, fileText, toast } from '../ui/app.js';
import { openDocData } from './files.js';

/* ==========================================================================
   Sharing a Part Studio as a link, as JEKion shares a bench: the document deflated and written after #p= ('c', or
   'd' plain where the browser cannot compress). Nothing is uploaded: the Part Studio travels in the link itself,
   as it is now. Making a link needs a free account; anyone opens one, to look at, turn and measure (changing it
   needs an account, as changing any Part Studio does).
   ========================================================================== */
const cadB64 = bytes => { let t = ''; for (let i = 0; i < bytes.length; i += 0x8000) t += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const cadUnB64 = t => { const s2 = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)); const u = new Uint8Array(s2.length); for (let i = 0; i < s2.length; i++) u[i] = s2.charCodeAt(i); return u; };
async function cadStream(bytes, T) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(T)).arrayBuffer()); }
/* the part after #p= */
export async function cadShareHash(doc) {
  const json = new TextEncoder().encode((doc ? JSON.stringify(doc) : fileText()));
  if (typeof CompressionStream !== 'undefined') { try { return 'c' + cadB64(await cadStream(json, new CompressionStream('deflate-raw'))); } catch (err) { /* plain below */ } }
  return 'd' + cadB64(json);
}
export async function cadReadShare(hash) {
  const kind = hash[0], body = hash.slice(1);
  if (kind !== 'c' && kind !== 'd') throw new Error('the link is not one of JEKcad’s');
  let bytes;
  try { bytes = cadUnB64(body); } catch (err) { throw new Error('the link is damaged (it may have been cut short)'); }
  if (kind === 'c') {
    if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot read compressed links; ask for the .jekcad file instead');
    try { bytes = await cadStream(bytes, new DecompressionStream('deflate-raw')); } catch (err) { throw new Error('the link is damaged (it may have been cut short)'); }
  }
  let d;
  try { d = JSON.parse(new TextDecoder().decode(bytes)); } catch (err) { throw new Error('the link does not hold a Part Studio'); }
  if (!d || d.format !== CAD_FORMAT) throw new Error('the link does not hold a JEKcad Part Studio');
  return fileData(normFile(d));
}
/* a short link: the same text kept by the API with the person's account (jek-api src/links.js, as the other apps'
   links are, with JEKcad's own letters), /c/ and ten capitals on the site; the site's 404 page forwards /c/<id>
   here as #s=<id>. A free account keeps three; when one cannot be made (the three are used, the API is away), the
   long link is given instead, with the reason. */
const CAD_MADE = new Map();
export const cadShortUrl = id => location.origin + '/c/' + id;
async function cadShortLink(text) {
  if (CAD_MADE.has(text)) return CAD_MADE.get(text);
  const r = await api('/v1/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: app.file.name || 'Untitled Part Studio', data: text }) });
  CAD_MADE.set(text, r.id);
  return r.id;
}
export async function cadShare() {
  if (!accountGate('share a link')) return false;
  const text = await cadShareHash();
  let url = location.origin + location.pathname + '#p=' + text, short = false, why = '';
  if (!TEST_MODE && accountsOn() && account) {
    try { url = cadShortUrl(await cadShortLink(text)); short = true; }
    catch (err) { why = err.status === 402 ? 'A free account keeps three short links at once (JEKsuite’s My links lists them, to delete), so this is the long one. ' : err.status === 413 ? 'This Part Studio is too big for a short link, so this is the long one. ' : 'A short link could not be made just now, so this is the long one. '; }
  }
  const dlg = document.getElementById('shareDialog'), box = document.getElementById('shareUrl');
  box.value = url;
  if (short) { document.getElementById('shareNote').textContent = 'Anyone with the link opens this Part Studio as it is now, as a copy of their own. The link is kept with your account: JEKsuite’s My links lists it, to delete.'; document.getElementById('shareCopy').textContent = 'Copy link'; dlg.showModal(); box.focus(); box.select(); track('share', 'cad-link'); try { await navigator.clipboard.writeText(url); document.getElementById('shareCopy').textContent = 'Copied'; } catch (err) { /* the button copies */ } return true; }
  const noteWhy = why;
  document.getElementById('shareNote').textContent = noteWhy + url.length.toLocaleString() + ' characters. ' + (url.length > 2000 ? 'That is long: some chat and email apps cut links this size. If it arrives cut short, send the .jekcad file instead.' : 'Anyone with the link opens this Part Studio as it is now. Nothing is uploaded: the Part Studio travels in the link itself.');
  document.getElementById('shareCopy').textContent = 'Copy link';
  dlg.showModal(); box.focus(); box.select();
  track('share', 'cad-link');
  try { await navigator.clipboard.writeText(url); document.getElementById('shareCopy').textContent = 'Copied'; } catch (err) { /* the button copies */ }
  return true;
}
/* a link opened: its Part Studio replaces this one (kept by autosave like any other) */
export async function cadOpenShare(hash) {
  try {
    const d = await cadReadShare(hash);
    openDocData(d, null, { fresh: true });
    if (!EMBED) toast('Opened the shared Part Studio “' + d.name + '”');
    track('import', 'cad-link');
    return true;
  } catch (err) { toast('Could not open that link: ' + err.message + '.', true); return false; }
}
/* a short link opened (#s=<id>): its Part Studio fetched, for anyone; another app's link goes to that app */
export async function cadOpenShort(id) {
  let r;
  try { r = await api('/v1/links/' + encodeURIComponent(id)); } catch (err) { toast('Could not open that link: ' + err.message, true); return false; }
  const other = { z: 'jekray', j: 'jekray', q: 'jekray', i: 'jekion', k: 'jekion', f: 'jekfilm', g: 'jekfilm' }[String(r.data || '')[0]];
  if (other) { location.replace('/jek/tools/' + other + '.html#s=' + encodeURIComponent(id)); return false; }
  return cadOpenShare(String(r.data || ''));
}
export function wireShare() {
  const dlg = document.getElementById('shareDialog');
  if (!dlg) return;
  document.getElementById('btnShare').addEventListener('click', () => { cadShare().catch(err => toast('Could not make a link: ' + err.message, true)); });
  document.getElementById('shareClose').addEventListener('click', () => dlg.close());
  document.getElementById('shareCopy').addEventListener('click', e => { const box = document.getElementById('shareUrl'); box.select(); navigator.clipboard.writeText(box.value).then(() => { e.target.textContent = 'Copied'; }, () => { document.execCommand('copy'); e.target.textContent = 'Copied'; }); });
  void TEST_MODE;
}
