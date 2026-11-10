import { EMBED, TEST_MODE } from '../../../jekray/src/core/constants.js';
import { accountGate } from '../../../jekray/src/ui/pro.js';
import { track } from '../../../jekray/src/io/usage.js';
import { CAD_FORMAT, normDoc } from '../core/doc.js';
import { app, toast } from '../ui/app.js';
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
  const json = new TextEncoder().encode(JSON.stringify(doc || app.doc));
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
  return normDoc(d);
}
export async function cadShare() {
  if (!accountGate('share a link')) return false;
  const url = location.origin + location.pathname + '#p=' + await cadShareHash();
  const dlg = document.getElementById('shareDialog'), box = document.getElementById('shareUrl');
  box.value = url;
  document.getElementById('shareNote').textContent = url.length.toLocaleString() + ' characters. ' + (url.length > 2000 ? 'That is long: some chat and email apps cut links this size. If it arrives cut short, send the .jekcad file instead.' : 'Anyone with the link opens this Part Studio as it is now. Nothing is uploaded: the Part Studio travels in the link itself.');
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
export function wireShare() {
  const dlg = document.getElementById('shareDialog');
  if (!dlg) return;
  document.getElementById('btnShare').addEventListener('click', () => { cadShare().catch(err => toast('Could not make a link: ' + err.message, true)); });
  document.getElementById('shareClose').addEventListener('click', () => dlg.close());
  document.getElementById('shareCopy').addEventListener('click', e => { const box = document.getElementById('shareUrl'); box.select(); navigator.clipboard.writeText(box.value).then(() => { e.target.textContent = 'Copied'; }, () => { document.execCommand('copy'); e.target.textContent = 'Copied'; }); });
  void TEST_MODE;
}
