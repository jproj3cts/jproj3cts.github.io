import { EMBED, FORMAT, VERSION } from '../core/constants.js';
import { history, project, selectOne, selectedId } from '../state/project.js';
import { getEl, normElementBase, serialize } from '../state/elements.js';
import { undo } from '../state/tabs.js';
import { traceScene } from '../engines/trace.js';
import { requestRender } from '../ui/render.js';
import { allSweeps, pauseAll, play, playAll, playing } from '../ui/sweeps.js';
import { V3D } from '../ui/view3d.js';
import { h, holdScroll, mainPanel, pinBoxes, pinOk, pins, renderPanel, setPins, viewState, vs } from '../ui/panel.js';
import { toast } from '../ui/actions.js';
import { esc, openProjectData } from './open.js';

/* ---------- Sharing a bench as a link ----------
   The project, less everything that is its default, compressed into the part of the address
   after #, which browsers never send to the server: the link is the file. It opens through
   the same door as a pasted project, so a damaged link gets the same report. */
const SHARE_LONG = 2000;                 // characters past which some apps cut a link
/* The panels as they are: the element shown, those pinned (in order), each one's tab and plot
   choices and where each panel and the page are scrolled. A link carries them, so whoever
   opens it sees what was being looked at and can press Play straight away. */
const plainVal = x => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean';
export function uiState() {
  const views = {}, ids = new Set([selectedId, ...pins].filter(Boolean));
  for (const id of ids) if (viewState.has(id)) {
    const v = {};
    for (const [k, x] of Object.entries(viewState.get(id))) if (plainVal(x)) v[k] = x;
    views[id] = v;
  }
  const scroll = { main: Math.round(mainPanel.scrollTop), page: Math.round(window.scrollY || 0) };
  for (const [id, box] of pinBoxes) scroll[id] = Math.round(box._hold != null ? box._hold : box.scrollTop);
  // in the 3D view: the link opens in it, from where the camera is
  const r1 = a => a.map(v => Math.round(v * 10) / 10), c = V3D.active() && V3D.api.camera(), v3d = c ? { cam: { p: r1(c.p), t: r1(c.t) } } : null;
  return Object.assign({ sel: selectedId, pins: pins.slice(), views, scroll }, v3d ? { v3d } : {});
}
export function applyUi(ui) {
  if (!ui || typeof ui !== 'object') return;
  for (const [id, v] of Object.entries(ui.views || {})) {
    const el = getEl(id);
    if (el && v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (plainVal(x)) vs(el)[k] = x;
  }
  setPins((Array.isArray(ui.pins) ? ui.pins : []).filter(id => typeof id === 'string' && pinOk(id)));
  if (typeof ui.sel === 'string' && getEl(ui.sel)) selectOne(ui.sel);
  traceScene();
  renderPanel(); requestRender();
  if (ui.v3d && typeof ui.v3d === 'object') {
    const C = ui.v3d.cam, ok = a => Array.isArray(a) && a.length === 3 && a.every(x => typeof x === 'number' && isFinite(x));
    V3D.open(C && ok(C.p) && ok(C.t) ? { p: C.p, t: C.t } : null);
  }
  const sc = ui.scroll && typeof ui.scroll === 'object' ? ui.scroll : {};
  requestAnimationFrame(() => {
    if (sc.main > 0) holdScroll(mainPanel, sc.main);
    for (const [id, box] of pinBoxes) if (sc[id] > 0) holdScroll(box, sc[id]);
    if (sc.page > 0) window.scrollTo(0, sc.page);
  });
}
export function shareData() {
  const d = serialize(), multi = d.benches.length > 1;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const els = d.elements.map(e => {
    const def = normElementBase(e.type === 'fcomp' ? { type: 'fcomp', kind: e.kind, name: 'x' } : { type: e.type, name: 'x' }) || {};
    const o = { type: e.type };
    if (e.kind) o.kind = e.kind;
    Object.assign(o, { id: e.id, name: e.name, x: e.x, y: e.y });
    if (e.angle) o.angle = e.angle;
    if (multi) o.bench = e.bench;
    for (const [k, v] of Object.entries(e)) {
      if (k in o || k === 'bench' || v === undefined) continue;
      if (k === 'colour' && e.colourAuto !== false) continue;          // follows the wavelength
      if (k === 'sweeps') { if (Object.keys(v).length) o.sweeps = v; continue; }
      if (!same(def[k], v)) o[k] = v;
    }
    return o;
  });
  const out = { format: FORMAT, version: VERSION, name: d.name };
  if (d.notes) out.notes = d.notes;
  out.view = { cx: +d.view.cx.toPrecision(8), cy: +d.view.cy.toPrecision(8), scale: +d.view.scale.toPrecision(6) };
  if (d.snap !== 1) out.snap = d.snap;
  if (d.maxBounces !== 200) out.maxBounces = d.maxBounces;
  if (d.minPower !== 0.1) out.minPower = d.minPower;
  if (d.ghosts) out.ghosts = true;
  if (d.library.length) out.library = d.library;
  if (Object.keys(d.cavityLock).length) out.cavityLock = d.cavityLock;
  if (multi) { out.benches = d.benches.map(b => ({ id: b.id, name: b.name, view: b.view })); out.tab = d.tab; }
  out.elements = els;
  if (d.fibres.length) out.fibres = d.fibres.map(F => {
    // a wire is its ends (ELEC hook); a waveguide keeps its settings (PIC hook)
    if (F.wire) return Object.assign({ id: F.id, a: F.a, b: F.b, wire: true }, F.path && F.path.length ? { path: F.path } : {});
    const o = { id: F.id, a: F.a, b: F.b, len: F.len };
    if (F.wg) o.wg = F.wg;
    if (F.loss !== 0.2) o.loss = F.loss;
    if (F.path && F.path.length) o.path = F.path;
    if (F.ta !== null && F.ta !== undefined) o.ta = F.ta;
    if (F.tb !== null && F.tb !== undefined) o.tb = F.tb;
    return o;
  });
  if (d.measures.length) out.measures = d.measures;
  const ui = uiState();
  // only what is set: nothing selected, pinned, scrolled or in 3D leaves it out
  const U = {};
  if (ui.sel) U.sel = ui.sel;
  if (ui.pins.length) U.pins = ui.pins;
  if (Object.keys(ui.views).length) U.views = ui.views;
  const sc = Object.fromEntries(Object.entries(ui.scroll).filter(([, v]) => v > 0));
  if (Object.keys(sc).length) U.scroll = sc;
  if (ui.v3d) U.v3d = ui.v3d;
  if (Object.keys(U).length) out.ui = U;
  return out;
}
export const b64u = bytes => { let t = ''; for (let i = 0; i < bytes.length; i += 0x8000) t += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const unb64u = t => { const s2 = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)); const u = new Uint8Array(s2.length); for (let i = 0; i < s2.length; i++) u[i] = s2.charCodeAt(i); return u; };
async function streamBytes(bytes, T) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(T)).arrayBuffer()); }
/* the part after #p=: "z" then deflated JSON, or "j" then plain JSON where the browser cannot compress */
export async function shareHash(data) {
  const json = new TextEncoder().encode(JSON.stringify(data || shareData()));
  if (typeof CompressionStream !== 'undefined') {
    try { return 'z' + b64u(await streamBytes(json, new CompressionStream('deflate-raw'))); } catch (err) { /* plain below */ }
  }
  return 'j' + b64u(json);
}
async function readShareHash(h) {
  const kind = h[0], body = h.slice(1);
  let bytes;
  try { bytes = kind === 'q' ? unb32(body) : unb64u(body); } catch (err) { throw new Error('the link is damaged (it may have been cut short)'); }
  if (kind === 'z' || kind === 'q') {
    if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot read compressed links; ask for the .jekray file instead');
    try { bytes = await streamBytes(bytes, new DecompressionStream('deflate-raw')); } catch (err) { throw new Error('the link is damaged (it may have been cut short)'); }
  } else if (kind !== 'j') throw new Error('that is not a JEKray2D link');
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch (err) { throw new Error('the link is damaged (it may have been cut short)'); }
}
export const shareBase = () => location.origin + location.pathname;
/* A link for a QR code, as small as it can be: the bench without its notes, its parts renumbered
   0, 1, 2... (not where a cavity's lock setting is keyed by them), deflated, and written in base
   32 capitals after /R/ on the site, all of it in the QR code's alphanumeric mode (5.5 bits a
   character, against 8 for a byte). The site's 404 page forwards /R/... to the tool as #p=q... */
function shareDataCompact() {
  const d = shareData();
  delete d.notes;
  if (!d.cavityLock) {
    const map = new Map(), taken = new Set(d.elements.map(e => e.id));
    let k = 0;
    const next = () => { let t; do t = (k++).toString(36); while (taken.has(t)); return t; };
    for (const e of d.elements) map.set(e.id, next());
    const m = id => map.has(id) ? map.get(id) : id;
    for (const e of d.elements) { e.id = m(e.id); if (e.splitFrom) e.splitFrom = m(e.splitFrom); }
    for (const F of d.fibres || []) { F.a = [m(F.a[0]), F.a[1]]; F.b = [m(F.b[0]), F.b[1]]; delete F.id; }
    if (d.ui) {
      if (d.ui.sel) d.ui.sel = m(d.ui.sel);
      if (d.ui.pins) d.ui.pins = d.ui.pins.map(m);
      if (d.ui.views) d.ui.views = Object.fromEntries(Object.entries(d.ui.views).map(([id, v]) => [m(id), v]));
    }
  }
  return d;
}
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = bytes => { let out = '', acc = 0, bits = 0; for (const b of bytes) { acc = (acc << 8) | b; bits += 8; while (bits >= 5) { out += B32[(acc >>> (bits - 5)) & 31]; bits -= 5; } acc &= (1 << bits) - 1; } if (bits) out += B32[(acc << (5 - bits)) & 31]; return out; };
const unb32 = t => { const out = []; let acc = 0, bits = 0; for (const ch of t.toUpperCase()) { const v = B32.indexOf(ch); if (v < 0) throw new Error('bad'); acc = (acc << 5) | v; bits += 5; if (bits >= 8) { out.push((acc >>> (bits - 8)) & 255); bits -= 8; } acc &= (1 << bits) - 1; } return new Uint8Array(out); };
/* the QR link: [url, alphanumeric?]: capitals throughout where the site's address allows it */
export async function qrLink() {
  const json = new TextEncoder().encode(JSON.stringify(shareDataCompact()));
  const host = location.origin.toUpperCase();
  if (typeof CompressionStream !== 'undefined' && /^[0-9A-Z $%*+\-.\/:]+$/.test(host)) {
    try { return [host + '/R/' + b32(await streamBytes(json, new CompressionStream('deflate-raw'))), true]; } catch (err) { /* the long way below */ }
  }
  return [shareBase() + '#p=' + await shareHash(shareDataCompact()), false];
}
async function shareLink() {
  const hash = '#p=' + await shareHash(), url = shareBase() + hash;
  const dlg = document.getElementById('shareDialog'), box = document.getElementById('shareUrl'), note = document.getElementById('shareNote');
  box.value = url;
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  document.getElementById('shareEmbed').value = '<iframe src="' + esc(shareBase() + '?embed' + hash) + '" width="800" height="500" style="border:0;max-width:100%" loading="lazy" title="' + esc('JEKray2D: ' + (project.name || 'bench')) + '"></iframe>';
  document.getElementById('shareEmbedCopy').textContent = 'Copy embed code';
  note.textContent = url.length.toLocaleString() + ' characters. ' + (url.length > SHARE_LONG
    ? 'That is long: some chat and email apps cut links this size. If it arrives cut short, send the .jekray file (Save .jekray) instead.'
    : 'Anyone with the link opens this bench as it is now, with the same panels open and pinned, on the same tabs and scrolled to the same place, and its sweeps ready to play; nothing is uploaded, the bench travels in the link itself.');
  dlg.showModal(); box.focus(); box.select();
  try { await navigator.clipboard.writeText(url); document.getElementById('shareCopy').textContent = 'Copied'; }
  catch (err) { document.getElementById('shareCopy').textContent = 'Copy'; }
}
/* a link opened: its bench replaces this one (Ctrl+Z brings this one back) */
export async function openShareHash(h) {
  try {
    const data = await readShareHash(h);
    const had = project && project.elements.length && !EMBED;
    openProjectData(data, 'the shared bench');
    if (had) sharedBar();
  } catch (err) { toast('Could not open that link: ' + err.message + '.', true); }
}
/* ?embed: the bench alone, filling the frame, with a way to open it in the full tool and to
   play its sweeps. Nothing is kept in this browser. */
export function embedMode() {
  document.body.classList.add('rt-embed');
  const full = location.pathname + location.hash;
  const play = h('button', { type: 'button', hidden: true, onclick: () => { if (playing.size) pauseAll(); else playAll(); } }, '\u25b6 Play');
  document.getElementById('stage').append(h('div', { class: 'rt-embedbar' }, play,
    h('a', { href: full, target: '_blank', rel: 'noopener' }, 'Open in JEKray2D \u2197')));
  setInterval(() => { play.hidden = !allSweeps().length; play.textContent = playing.size ? '\u275a\u275a Pause' : '\u25b6 Play'; }, 400);
}
/* A shared bench opened over the user's own: keep it (and change it as they like), or go
   straight back to their work. Their work is kept under Open \u25be Earlier versions either way. */
function sharedBar() {
  const old = document.getElementById('sharedBar');
  if (old) old.remove();
  const mark = history.length, bar = h('div', { class: 'rt-sharedbar', id: 'sharedBar', role: 'status' },
    h('span', null, h('b', null, 'A shared bench.'), ' Change it as you like; your own work is kept.'),
    h('button', { class: 'rt-btn', type: 'button', onclick: () => { bar.remove(); if (history.length >= mark) { while (history.length > mark) undo(); undo(); toast('Back to your work'); } } }, 'Back to my work'),
    h('button', { class: 'rt-btn primary', type: 'button', onclick: () => bar.remove() }, 'Keep this bench'));
  document.getElementById('stage').append(bar);
}

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wireShare() {
  {
    const dlg = document.getElementById('shareDialog');
    document.getElementById('btnShare').addEventListener('click', () => { document.getElementById('shareCopy').textContent = 'Copy'; shareLink().catch(err => toast('Could not make a link: ' + err.message, true)); });
    document.getElementById('shareClose').addEventListener('click', () => dlg.close());
    for (const [b, t] of [['shareCopy', 'shareUrl'], ['shareEmbedCopy', 'shareEmbed']]) document.getElementById(b).addEventListener('click', e => {
      const box = document.getElementById(t); box.select();
      navigator.clipboard.writeText(box.value).then(() => { e.target.textContent = 'Copied'; }, () => { document.execCommand('copy'); e.target.textContent = 'Copied'; });
    });
  }

}
