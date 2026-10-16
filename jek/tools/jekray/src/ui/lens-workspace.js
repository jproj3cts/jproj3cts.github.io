import { asmCheck, asmMembers, normCond, normMerit, ASM_FIELDS_MAX, ASM_WAVES_MAX, MERIT_OPS, SOLVE_KINDS } from '../core/assembly.js';
import { TEST_MODE } from '../core/constants.js';
import { hooks } from '../core/hooks.js';
import { glassKey, glassSearch, matLabel } from '../core/glass.js';
import { deg, project } from '../state/project.js';
import { getEl, normElement } from '../state/elements.js';
import { benchName } from '../state/tabs.js';
import { lastTrace, sourceLines, traceScene } from '../engines/trace.js';
import { rayPath } from '../engines/lens-engine.js';
import { isModel, meritReport, modelOf, nearestGlass, optApply, optProblem, optRun, optVars } from '../engines/lens-opt.js';
import { commitDesign, condFromBench, condFromRays, designFigures, designOf, designPrescription, editable, getV, insertSinglet,
  insertSurface, keyAt, posOf, primaryNm, removeSurface, surfaceParts } from '../engines/lens-design.js';
import { h } from './panel.js';
import { analysesPanel } from './lens-analyses.js';
import { lensTolState, tolCard, tolStart, tolStop } from './lens-tolerance.js';
import { setSelection } from './render.js';
import { changed, toast } from './actions.js';
import { checkpoint, redo, undo } from './tabs.js';

/* ==========================================================================
   The lens design workspace
   An assembly opened on a page of its own: the conditions it is designed for, its layout traced
   by the lens engine, and its lens data, surface by surface, to edit as a lens designer does.
   Every change is written to its parts on the bench as it is made (and can be undone there), so
   leaving the workspace is only going back to the bench. A design started from nothing has no
   light on the bench yet: Place on a bench gives it a source for each field and a screen at its
   image, set to its conditions.
   ========================================================================== */
let WS = null;                     // { asm, tab, sel, draft, took }
const FIELD_COLOURS = ['#5aa9ff', '#5fd38a', '#ff7a6b', '#f2c14e', '#c38bff', '#4fd6d6', '#ff9cd0', '#b0b8c0'];
export const lensDesignOpen = () => !!WS;
const wsFmt = (v, p) => v === null || v === undefined ? '' : !isFinite(v) ? '∞' : String(+(+v).toPrecision(p || 6));
const fmtR = v => v === null || v === undefined ? 'Flat' : wsFmt(v, 7);

/* the light the bench sends the assembly, as conditions: null when none reaches it */
const linesOf = id => { const e = getEl(id); return !e ? [] : e.type === 'source' ? sourceLines(e) : isFinite(e.wavelength) ? [e.wavelength] : []; };
export function asmBenchLight(asm, P) {
  traceScene();
  return condFromRays(asm, P || designPrescription(asm), lastTrace.rays || [], linesOf);
}

export function openLensDesign(asm, opts) {
  const C = asmCheck(asmMembers(asm), { ref: asm.ref, rev: asm.rev });
  if (!C.ok) { toast('Its parts are no longer on one axis: ' + C.why, true); return false; }
  designOf(asm);
  WS = { asm, tab: 'data', sel: -1, draft: !!(opts && opts.draft), took: null };
  const sec = shell();
  sec.hidden = false;
  document.body.classList.add('rt-lens-open');
  renderWs();
  sec.focus();
  return true;
}
export function closeLensDesign() {
  if (!WS) return;
  optStop('Stopped: the workspace was closed.');
  tolStop('Stopped: the workspace was closed.');
  const asm = WS.asm;
  WS = null;
  document.getElementById('lensWs').hidden = true;
  document.body.classList.remove('rt-lens-open');
  setSelection(asmMembers(asm));
  changed(true);
}

/* ---------- The page ---------- */
function shell() {
  let sec = document.getElementById('lensWs');
  if (sec) return sec;
  sec = h('section', { class: 'rt-lens', id: 'lensWs', hidden: '', tabindex: '-1', 'aria-label': 'Lens design' });
  // the bench's own keys stay on the bench: here Esc goes back, and undo and redo act on the design
  sec.addEventListener('keydown', e => {
    const k = e.key.toLowerCase(), typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
    if (k === 'escape') { if (closePop()) { e.stopPropagation(); return; } e.preventDefault(); leave(); }
    else if ((e.ctrlKey || e.metaKey) && !typing && (k === 'z' || k === 'y')) { e.preventDefault(); if (k === 'y' || e.shiftKey) redo(); else undo(); afterUndo(); }
    e.stopPropagation();
  });
  ['keyup', 'copy', 'cut', 'paste'].forEach(t => sec.addEventListener(t, e => e.stopPropagation()));
  document.body.append(sec);
  return sec;
}
function afterUndo() {
  if (!WS) return;
  optStop('Stopped: undone.');
  tolStop('Stopped: undone.');
  // the record is replaced by an undo: find it again by its id
  const a = (project.assemblies || []).find(x => x.id === WS.asm.id);
  if (!a || !asmMembers(a).length) { WS = null; document.getElementById('lensWs').hidden = true; document.body.classList.remove('rt-lens-open'); toast('The design was undone'); return; }
  WS.asm = a; designOf(a);
  renderWs();
}
function leave() {
  if (WS && WS.draft) { checkpoint(); placeOnBench(WS.asm); }
  closeLensDesign();
}

/* A value typed in is committed when its field loses focus, often to the next field: the page is
   drawn again just after, focus kept on the field (by its label) the person moved to. */
let rendering = false, deferRender = false, renderTimer = 0;
function renderSoon() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderTimer = 0;
    const a = document.activeElement, lab = a && a.closest && a.closest('#lensWs') && a.getAttribute('aria-label');
    renderWs();
    const n = lab && [...document.querySelectorAll('#lensWs [aria-label]')].find(x => x.getAttribute('aria-label') === lab);
    if (n) { n.focus(); if (n.select) n.select(); }
  }, 0);
}
/* a field's change: ignored while the page is being drawn again (a field taken away fires its own) */
const fromField = (el, fn) => () => { if (rendering || !el.isConnected) return; deferRender = true; try { fn(); } finally { deferRender = false; } };
function renderWs() {
  if (!WS) return;
  if (deferRender) { renderSoon(); return; }
  clearTimeout(renderTimer); renderTimer = 0;
  rendering = true;
  try { drawWs(); } finally { rendering = false; }
}
function drawWs() {
  const sec = document.getElementById('lensWs'), asm = WS.asm;
  const C = asmCheck(asmMembers(asm), { ref: asm.ref, rev: asm.rev });
  if (!C.ok) { closeLensDesign(); toast('Its parts are no longer on one axis: ' + C.why, true); return; }
  const P = designPrescription(asm), F = designFigures(asm, P);
  const scroll = sec.querySelector('.rt-lbody') ? sec.querySelector('.rt-lbody').scrollTop : 0;
  sec.replaceChildren();
  const name = h('input', { class: 'rt-lname', type: 'text', value: asm.name, size: String(Math.max(6, Math.min(40, asm.name.length + 1))), 'aria-label': 'Design name', spellcheck: 'false' });
  name.addEventListener('change', fromField(name, () => { checkpoint(); asm.name = String(name.value || 'Assembly').slice(0, 80); changed(false); }));
  sec.append(h('header', { class: 'rt-lhead' },
    h('span', { class: 'rt-hmark' }, 'JEKray'),
    h('nav', { class: 'rt-lcrumb', 'aria-label': 'Where you are' }, h('span', { class: 'from' }, benchName(asm.bench)), h('span', { 'aria-hidden': 'true' }, '›'), name, h('span', { class: 'rt-lpill' }, 'Lens design')),
    h('span', { class: 'rt-lgap' }),
    h('button', { class: 'rt-btn', type: 'button', title: 'Undo (Ctrl+Z)', onclick: () => { undo(); afterUndo(); } }, 'Undo'),
    h('button', { class: 'rt-btn', type: 'button', title: 'Redo (Ctrl+Y)', onclick: () => { redo(); afterUndo(); } }, 'Redo'),
    h('button', { class: 'rt-btn primary', type: 'button', id: 'lensLeave', title: WS.draft ? 'Put it on the bench, with a source for each field and a screen at its image' : 'Back to the bench, where its parts are as designed here (Esc)', onclick: leave },
      WS.draft ? 'Place on a bench' : 'Back to the bench')));
  const body = h('div', { class: 'rt-lbody' });
  body.append(conditionsCard(asm, F), h('div', { class: 'rt-lmain' }, layoutCard(asm, P, F), figuresStrip(F), tabsRow(), WS.tab === 'data' ? dataCard(asm, P) : WS.tab === 'merit' ? meritCard(asm, P) : WS.tab === 'opt' ? optCard(asm, P) : WS.tab === 'tol' ? tolCard({ asm, P, redraw: renderWs, state: WS.tolState || (WS.tolState = {}), edit: tolEdit }) : analysesPanel(asm, P, F, WS.ana || (WS.ana = {}), renderWs)));
  sec.append(body, h('div', { class: 'rt-toast', id: 'lensToast', role: 'status', 'aria-live': 'polite' }));
  body.scrollTop = scroll;
}

/* a change: undoable, solved, written to the parts, shown */
function tolEdit(fn) {
  checkpoint();
  fn(designOf(WS.asm));
  changed(false);
  renderWs();
}
function edit(fn) {
  optStop('Stopped: the design was changed by hand.');
  tolStop('Stopped: the design was changed.');
  checkpoint();
  const asm = WS.asm, P = designPrescription(asm);
  const r = fn(P, asm);
  if (typeof r === 'string') { toast(r, true); return; }
  if (r !== false) {
    const notes = commitDesign(asm, P);
    if (notes.length) toast(notes.join(' '), true);
  }
  changed(false);
  renderWs();
}

/* ---------- Design conditions ---------- */
function parseNum(v) { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; }
function wsNumInput(value, set, opts) {
  const i = h('input', { type: 'text', inputmode: 'decimal', value: wsFmt(value), class: 'rt-lnum', 'aria-label': opts.label, spellcheck: 'false' });
  i.addEventListener('change', fromField(i, () => { const v = parseNum(i.value); if (v === null) { i.value = wsFmt(value); return; } set(v); }));
  return i;
}
function condEdit(fn) {
  checkpoint();
  const c = JSON.parse(JSON.stringify(WS.asm.cond));
  fn(c);
  WS.asm.cond = normCond(c);
  const notes = commitDesign(WS.asm, designPrescription(WS.asm));
  if (notes.length) toast(notes.join(' '), true);
  changed(false);
  renderWs();
}
function conditionsCard(asm, F) {
  const c = asm.cond, card = h('section', { class: 'rt-lcard rt-lcond', 'aria-label': 'Design conditions' }, h('h2', null, 'Design conditions'));
  card.append(h('p', { class: 'rt-lsub' }, 'What it is designed and analysed for: light from infinity at these angles, through this aperture.'));
  // the aperture
  const kind = h('select', { 'aria-label': 'Aperture given as' }, h('option', { value: 'epd' }, 'Entrance pupil diameter (mm)'), h('option', { value: 'fno' }, 'F-number'));
  kind.value = c.aperture.kind;
  kind.addEventListener('change', fromField(kind, () => condEdit(cc => { const v = kind.value === 'fno' ? Math.abs(F.efl) / F.epd : F.epd; cc.aperture = { kind: kind.value, v: isFinite(v) && v > 0 ? +v.toPrecision(6) : (kind.value === 'fno' ? 4 : 10) }; })));
  card.append(h('h3', null, 'Aperture'), h('div', { class: 'rt-lrow' }, kind, wsNumInput(c.aperture.v, v => condEdit(cc => { cc.aperture.v = v; }), { label: 'Aperture' })));
  // the fields
  card.append(h('h3', null, 'Fields (angle °, weight)'));
  c.fields.forEach((f, i) => card.append(h('div', { class: 'rt-lrow' },
    h('span', { class: 'rt-lswatch', style: 'background:' + FIELD_COLOURS[i % FIELD_COLOURS.length], 'aria-hidden': 'true' }),
    wsNumInput(f.deg, v => condEdit(cc => { cc.fields[i].deg = v; }), { label: 'Field ' + (i + 1) + ' angle' }),
    wsNumInput(f.w, v => condEdit(cc => { cc.fields[i].w = v; }), { label: 'Field ' + (i + 1) + ' weight' }),
    c.fields.length > 1 ? h('button', { class: 'rt-lx', type: 'button', 'aria-label': 'Remove field ' + (i + 1), onclick: () => condEdit(cc => { cc.fields.splice(i, 1); }) }, '×') : h('span', { class: 'rt-lx' }))));
  if (c.fields.length < ASM_FIELDS_MAX) card.append(h('button', { class: 'rt-link', type: 'button', onclick: () => condEdit(cc => { const m = Math.max(...cc.fields.map(f => f.deg)); cc.fields.push({ deg: +(m + 5).toFixed(2), w: 1 }); }) }, 'Add a field'));
  // the wavelengths
  card.append(h('h3', null, 'Wavelengths (nm, weight)'));
  c.waves.forEach((w, i) => {
    const pr = h('input', { type: 'radio', name: 'lensPrimary', 'aria-label': 'Primary wavelength', title: 'The primary wavelength: first order and the Seidel sums are at it' });
    pr.checked = i === c.primary;
    pr.addEventListener('change', fromField(pr, () => condEdit(cc => { cc.primary = i; })));
    card.append(h('div', { class: 'rt-lrow' }, pr,
      wsNumInput(w.nm, v => condEdit(cc => { cc.waves[i].nm = v; }), { label: 'Wavelength ' + (i + 1) }),
      wsNumInput(w.w, v => condEdit(cc => { cc.waves[i].w = v; }), { label: 'Wavelength ' + (i + 1) + ' weight' }),
      c.waves.length > 1 ? h('button', { class: 'rt-lx', type: 'button', 'aria-label': 'Remove wavelength ' + (i + 1), onclick: () => condEdit(cc => { cc.waves.splice(i, 1); if (cc.primary >= cc.waves.length) cc.primary = cc.waves.length - 1; }) }, '×') : h('span', { class: 'rt-lx' })));
  });
  const wb = h('div', { class: 'rt-lrow' });
  if (c.waves.length < ASM_WAVES_MAX) wb.append(h('button', { class: 'rt-link', type: 'button', onclick: () => condEdit(cc => { cc.waves.push({ nm: Math.round(Math.max(...cc.waves.map(w => w.nm)) + 50), w: 1 }); }) }, 'Add a wavelength'));
  wb.append(h('button', { class: 'rt-link', type: 'button', title: 'F, d and C: 486.13, 587.56 and 656.27 nm, d primary', onclick: () => condEdit(cc => { cc.waves = [{ nm: 486.13, w: 1 }, { nm: 587.56, w: 1 }, { nm: 656.27, w: 1 }]; cc.primary = 1; }) }, 'Visible (F, d, C)'));
  card.append(wb);
  card.append(h('button', { class: 'rt-btn rt-ltake', type: 'button', onclick: takeFromBench, title: 'The fields, wavelengths and beam of the light arriving at it on the bench' }, 'Take conditions from the bench'));
  if (WS.took) card.append(h('div', { class: 'rt-lnote good', role: 'status' }, WS.took));
  if (WS.draft) card.append(h('div', { class: 'rt-lnote' }, 'A new design has no light on the bench yet. Place on a bench gives it a source for each field and a screen at its image, set to these conditions.'));
  return card;
}
function takeFromBench() {
  const asm = WS.asm, B = asmBenchLight(asm);
  if (!B) { WS.took = null; toast('No light from the bench reaches it: nothing to take.', true); renderWs(); return; }
  condEdit(cc => Object.assign(cc, condFromBench({ cond: cc }, B)));
  const c = asm.cond;
  WS.took = 'Taken from the light arriving at it on ' + benchName(asm.bench) + ': ' + (B.epd > 1e-6 ? 'a beam ' + wsFmt(B.epd, 3) + ' mm across, ' : '') +
    'fields to ' + wsFmt(Math.max(...B.fields), 3) + '°, ' + (c.waves.length === 1 ? 'one wavelength, ' + wsFmt(c.waves[0].nm, 5) + ' nm' : c.waves.map(w => wsFmt(w.nm, 5)).join(', ') + ' nm') + '.';
  renderWs();
}

/* ---------- The layout: the meridional rays of each field, traced by the lens engine ---------- */
function layoutCard(asm, P, F) {
  const card = h('div', { class: 'rt-lcard rt-llayout' });
  const stats = h('span', { class: 'mono' }, 'EFL ' + wsFmt(F.efl, 5) + ' mm · f/' + wsFmt(F.fno, 3) + ' · fields to ' + wsFmt(F.fmax, 3) + '°');
  card.append(h('div', { class: 'rt-lltop' }, h('span', null, 'Layout, in the plane of the fields'), stats));
  const cv = h('canvas', { role: 'img', 'aria-label': 'The design’s layout: its lenses, stop and image plane, with rays from each field' });
  card.append(cv);
  requestAnimationFrame(() => drawLayout(cv, asm, P, F));
  return card;
}
export function layoutData(asm, P, F) {
  const S = F.S, c = asm.cond, out = { lenses: [], stops: [], rays: [], imageZ: S.imageZ, zEnd: S.z[S.N - 1] };
  const sps = surfaceParts(P);
  // each lens: its surfaces' profiles across their clear radii
  let i = 0;
  while (i < P.surfaces.length) {
    const sp = sps[i];
    if (sp.kind === 'stop') { out.stops.push({ z: S.z[i], r: P.surfaces[i].semi }); i++; continue; }
    const prof = [];
    for (let j = 0; j < sp.n; j++) {
      const k = i + j, s = P.surfaces[k], hmax = isFinite(s.semi) && s.semi > 0 ? s.semi : 10, pts = [];
      for (let q = 0; q <= 24; q++) { const y = -hmax + 2 * hmax * q / 24, zz = S.z[k] + wsSag(s, y); pts.push([y, isFinite(zz) ? zz : S.z[k]]); }
      prof.push(pts);
    }
    out.lenses.push(prof);
    i += sp.n;
  }
  c.fields.forEach((f, fi) => {
    for (const py of [-1, -0.5, 0, 0.5, 1]) {
      const r = rayPath(S, f.deg * deg, 0, py);
      if (r) out.rays.push({ field: fi, pts: r.pts, lost: r.lost });
    }
  });
  return out;
}
function wsSag(s, y) {
  const c = s.R ? 1 / s.R : 0, r2 = y * y;
  let v = c ? c * r2 / (1 + Math.sqrt(1 - (1 + (s.k || 0)) * c * c * r2)) : 0;
  v += (s.a2 || 0) * r2;
  let p = r2 * r2;
  for (const a of s.A || []) { v += a * p; p *= r2; }
  return v;
}
function drawLayout(cv, asm, P, F) {
  const L = layoutData(asm, P, F), dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 800, H = Math.max(180, Math.min(320, W * 0.32));
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  g.fillStyle = '#1e2227'; g.fillRect(0, 0, W, H);
  let ymax = 1;
  for (const pr of L.lenses) for (const s of pr) for (const [y] of s) ymax = Math.max(ymax, Math.abs(y));
  for (const s of L.stops) ymax = Math.max(ymax, s.r * 1.3);
  const lead = Math.max(5, 0.25 * (L.imageZ - 0));
  const z0 = -lead, z1 = Math.max(L.imageZ, L.zEnd) + Math.max(2, 0.03 * (L.imageZ + lead));
  for (const r of L.rays) for (const [y, z] of r.pts) if (z >= z0 && z <= z1) ymax = Math.max(ymax, Math.abs(y));
  const k = Math.min((W - 24) / (z1 - z0), (H - 24) / (2 * ymax * 1.05)), X = z => 12 + (z - z0) * k + ((W - 24) - (z1 - z0) * k) / 2, Y = y => H / 2 - y * k;
  // the axis
  g.strokeStyle = 'rgba(255,255,255,0.15)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(z0), Y(0)); g.lineTo(X(z1), Y(0)); g.stroke(); g.setLineDash([]);
  // the lenses
  for (const pr of L.lenses) {
    g.beginPath();
    for (let j = 0; j + 1 < pr.length; j++) {
      const a = pr[j], b = pr[j + 1];
      g.moveTo(X(a[0][1]), Y(a[0][0]));
      for (const [y, z] of a) g.lineTo(X(z), Y(y));
      const ha = a[a.length - 1][0], hb = b[b.length - 1][0];
      // the rim: square across to the larger of the two
      if (hb > ha) g.lineTo(X(a[a.length - 1][1]), Y(hb));
      for (let q = b.length - 1; q >= 0; q--) { const [y, z] = b[q]; if (q === b.length - 1 && ha > hb) { g.lineTo(X(z), Y(ha)); } g.lineTo(X(z), Y(y)); }
      if (ha > hb) g.lineTo(X(b[0][1]), Y(-ha)); else if (hb > ha) g.lineTo(X(a[0][1]), Y(-hb));
      g.closePath();
    }
    g.fillStyle = 'rgba(115,185,202,0.28)'; g.fill();
    g.strokeStyle = '#9ccfdc'; g.lineWidth = 1.2; g.stroke();
  }
  // the stops
  g.strokeStyle = '#d8dee3'; g.lineWidth = 3;
  for (const s of L.stops) { const e = Math.max(s.r * 0.35, 1.5); g.beginPath(); g.moveTo(X(s.z), Y(s.r)); g.lineTo(X(s.z), Y(s.r + e)); g.moveTo(X(s.z), Y(-s.r)); g.lineTo(X(s.z), Y(-s.r - e)); g.stroke(); }
  // the rays, from the plane a lead before the first surface
  g.lineWidth = 1;
  for (const r of L.rays) {
    g.strokeStyle = FIELD_COLOURS[r.field % FIELD_COLOURS.length]; g.globalAlpha = 0.9;
    const p = r.pts.slice();
    const [ya, za] = p[0], [yb, zb] = p[1], t = (z0 - za) / (zb - za);
    p[0] = [ya + t * (yb - ya), z0];
    g.beginPath(); g.moveTo(X(p[0][1]), Y(p[0][0]));
    for (let q = 1; q < p.length; q++) g.lineTo(X(p[q][1]), Y(p[q][0]));
    g.stroke();
  }
  g.globalAlpha = 1;
  // the image plane
  g.strokeStyle = '#f2f2ec'; g.lineWidth = 2;
  // the image plane, as tall as the rays that land on it and a little more
  let hi = ymax * 0.5;
  for (const r of L.rays) if (r.lost < 0) hi = Math.max(hi, Math.abs(r.pts[r.pts.length - 1][0]) * 1.08);
  hi = Math.min(hi, ymax * 1.05);
  g.beginPath(); g.moveTo(X(L.imageZ), Y(hi)); g.lineTo(X(L.imageZ), Y(-hi)); g.stroke();
}

function figuresStrip(F) {
  const row = (a, b, t) => h('div', { title: t || '' }, h('span', null, a), h('b', { class: 'mono' }, b));
  return h('div', { class: 'rt-lfig' },
    row('EFL', isFinite(F.efl) ? wsFmt(F.efl, 6) + ' mm' : 'afocal', 'Effective focal length at the primary wavelength'),
    row('BFL', isFinite(F.bfl) ? wsFmt(F.bfl, 6) + ' mm' : '—', 'From the last surface to the paraxial focus'),
    row('Working F-number', isFinite(F.fno) ? 'f/' + wsFmt(Math.abs(F.fno), 4) : '—'),
    row('Entrance pupil', wsFmt(F.epd, 5) + ' mm, ' + wsFmt(F.epz, 5) + ' mm from the first surface'),
    row('Image height', wsFmt(F.imgH, 5) + ' mm', 'Paraxial, at the largest field'),
    row('Total track', wsFmt(F.track, 6) + ' mm', 'First surface to the image'));
}
function tabsRow() {
  const tab = (id, label) => h('button', { type: 'button', role: 'tab', class: 'rt-ltab', 'aria-selected': String(WS.tab === id), onclick: () => { WS.tab = id; renderWs(); } }, label);
  return h('div', { class: 'rt-ltabs', role: 'tablist', 'aria-label': 'Design' }, tab('data', 'Lens data'), tab('merit', 'Merit'), tab('opt', 'Optimise the design'), tab('analyses', 'Analyses'), tab('tol', 'Tolerance the design'));
}

/* ---------- Lens data ---------- */
function surfaceName(P, sps, i) {
  const sp = sps[i], e = getEl(sp.id), nm = e ? e.name : '?';
  if (sp.kind === 'stop') return /\bstop\b/i.test(nm) ? nm : nm + ' (stop)';
  if (sp.n === 2) return nm + (sp.j === 0 ? ', front' : ', back');
  return nm + ', ' + ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][sp.j] + (sp.j > 5 ? ' ' + (sp.j + 1) : '');
}
function dataCard(asm, P) {
  const D = designOf(asm), sps = surfaceParts(P), N = P.surfaces.length;
  const card = h('div', { class: 'rt-lcard rt-ldata', role: 'tabpanel' });
  const tbl = h('table', { class: 'rt-ltable' });
  tbl.append(h('thead', null, h('tr', null, ...['', 'Surface', 'Radius (mm)', 'Thickness (mm)', 'Glass', 'Clear radius (mm)', 'Conic'].map(t => h('th', { scope: 'col' }, t)))));
  const tb = h('tbody');
  const obj = h('tr', { class: 'obj' + (WS.sel === -2 ? ' sel' : ''), 'aria-selected': String(WS.sel === -2), title: 'Select it to insert a singlet in front of the first surface' },
    h('td', { class: 'n' }, 'OBJ'), h('td', { class: 'nm' }, 'Object'), h('td', { class: 'mono' }, 'Flat'), h('td', { class: 'mono' }, '∞'), h('td'), h('td'), h('td'));
  obj.addEventListener('click', () => { WS.sel = WS.sel === -2 ? -1 : -2; renderWs(); });
  tb.append(obj);
  for (let i = 0; i < N; i++) {
    const sp = sps[i], s = P.surfaces[i];
    const tr = h('tr', { class: i === WS.sel ? 'sel' : '', 'aria-selected': String(i === WS.sel) });
    tr.addEventListener('click', e => { if (e.target.closest('input,button,select')) return; WS.sel = WS.sel === i ? -1 : i; renderWs(); });
    tr.append(h('td', { class: 'n' }, sp.kind === 'stop' ? 'STO' : String(i + 1)), h('td', { class: 'nm' }, surfaceName(P, sps, i)));
    tr.append(valueCell(P, D, 'R', i), valueCell(P, D, 't', i));
    // glass: inside a lens; air between the parts
    const gtd = h('td');
    if (editable(P, 'g', i)) {
      const gk = keyAt(P, 'g', i), gv = D.vars.includes(gk), lab = 'glass after surface ' + (i + 1);
      gtd.append(h('div', { class: 'rt-lcell' }, glassInput(P.materials[i], 'Glass after surface ' + (i + 1), name => edit(PP => { const m = parseGlass(name); if (!m) return 'No glass called ' + name + '. Type a catalogue name, or a model glass as nd/Vd (1.62/60).'; PP.materials[i] = m; })),
        h('button', { type: 'button', class: 'rt-lv', 'aria-pressed': String(gv), 'aria-label': (gv ? 'Fix ' : 'Vary ') + lab, title: gv ? 'A variable: the optimiser may change this model glass’s nd and Vd. Click to fix it.' : 'Click to let the optimiser change it: it becomes a model glass (its nd and Vd), to be replaced by the nearest real glass afterwards',
          onclick: () => edit((PP, a) => { const dd = designOf(a); if (gv) dd.vars = dd.vars.filter(k => k !== gk); else { PP.materials[i] = modelOf(PP.materials[i]); dd.vars = dd.vars.concat([gk]); } }) }, 'V')));
    }
    else if (sp.kind === 'window' && sp.j === 0) gtd.append(h('span', { class: 'mono' }, matLabel(P.materials[i])));
    tr.append(gtd);
    // clear radius: a lens's surface's own; the stop's is set by the aperture
    const ctd = h('td');
    if (sp.kind === 'lens') ctd.append(wsNumInput(s.semi, v => edit(PP => { if (!(v > 0)) return 'A clear radius is more than 0.'; const e = getEl(sp.id); if (e && 2 * v > e.diameter) e.diameter = 2 * v; PP.surfaces[i].semi = v; }), { label: 'Clear radius of surface ' + (i + 1) }));
    else ctd.append(h('span', { class: 'mono ro', title: sp.kind === 'stop' ? 'Set by the aperture in the design conditions' : 'The window’s own size' }, wsFmt(s.semi, 5)));
    tr.append(ctd);
    tr.append(valueCell(P, D, 'k', i));
    tb.append(tr);
  }
  const F = designFigures(asm, P);
  tb.append(h('tr', { class: 'obj' }, h('td', { class: 'n' }, 'IMA'), h('td', null, 'Image'), h('td', { class: 'mono' }, 'Flat'), h('td'), h('td'), h('td', { class: 'mono ro', title: 'Paraxial image height at the largest field' }, wsFmt(Math.abs(F.imgH), 5)), h('td')));
  tbl.append(tb);
  card.append(h('div', { class: 'rt-ltwrap' }, tbl));
  const sel = WS.sel >= 0 && WS.sel < N ? WS.sel : -1;
  const bar = h('div', { class: 'rt-lbar' },
    h('button', { class: 'rt-btn', type: 'button', title: 'A flat surface after the one selected: inside a lens it splits the glass (a cemented doublet); after its back, it adds glass behind', onclick: () => {
      if (sel < 0) { toast('Select a surface of a lens first: the new one goes after it.', true); return; }
      checkpoint(); const r = insertSurface(asm, designPrescription(asm), sel); if (r !== true) { toast(r, true); return; } WS.sel = sel + 1; changed(true); renderWs();
    } }, 'Insert a surface'),
    h('button', { class: 'rt-btn', type: 'button', title: 'A flat N-BK7 singlet, 2 mm thick, after the part selected (in front of the first surface with the object selected; at the end with nothing selected)', onclick: () => {
      checkpoint(); const r = insertSinglet(asm, designPrescription(asm), WS.sel === -2 ? 'front' : sel); if (typeof r === 'string') { toast(r, true); return; } WS.sel = -1; changed(true); renderWs();
    } }, 'Insert a singlet'),
    h('button', { class: 'rt-btn', type: 'button', disabled: sel < 0 ? '' : null, title: 'Take out the surface selected; a lens of two surfaces goes whole', onclick: () => {
      checkpoint(); const r = removeSurface(asm, designPrescription(asm), sel); if (r !== true) { toast(r, true); return; } WS.sel = -1; changed(true); renderWs();
    } }, 'Remove'),
    h('span', { class: 'rt-lkey' }, h('b', null, 'V'), ' a variable for the optimiser (' + D.vars.length + ' now) · ', h('b', null, 'S'), ' a solve · ', h('b', null, 'P'), ' a pickup'));
  card.append(bar);
  return card;
}
/* a radius, thickness or conic: its value (fixed by a solve or pickup, or typed), its V and its S/P */
function valueCell(P, D, q, i) {
  const td = h('td', { class: 'rt-lval' });
  if (!editable(P, q, i)) { if (q === 't' || q === 'k') td.append(h('span', { class: 'mono ro' }, q === 'k' ? '' : wsFmt(getV(P, { q, i, image: i === P.surfaces.length - 1 })))); else td.append(h('span', { class: 'mono ro' }, 'Flat')); return td; }
  const key = keyAt(P, q, i), at = posOf(P, key), v = getV(P, at), sv = D.solves[key], pk = D.pickups[key], fixed = !!(sv || pk);
  const label = (q === 'R' ? 'Radius' : q === 't' ? (at.image ? 'Image distance' : 'Thickness') : 'Conic') + ' of surface ' + (i + 1);
  const inp = h('input', { type: 'text', inputmode: 'decimal', class: 'rt-lnum' + (fixed ? ' fixed' : ''), value: q === 'R' ? fmtR(v) : wsFmt(v, 7), 'aria-label': label, spellcheck: 'false', readonly: fixed ? '' : null,
    title: fixed ? (sv ? 'Solved: ' + solveText(sv) : 'Picked up: ' + pickText(pk)) + '. Clear it with the button beside.' : '' });
  inp.addEventListener('change', fromField(inp, () => {
    const t = inp.value.trim().toLowerCase();
    let val = q === 'R' && (t === '' || t === 'flat' || t === 'inf' || t === '∞' || t === 'infinity') ? null : parseNum(t);
    if (val === null && q !== 'R') { inp.value = wsFmt(v, 7); return; }
    edit(PP => { const a = posOf(PP, key); if (q === 'R') PP.surfaces[a.i].R = val; else if (q === 'k') PP.surfaces[a.i].k = val; else if (a.image) PP.image = val; else { if (val < 0) return 'A thickness can’t be negative.'; PP.gaps[a.i] = val; } });
  }));
  const isVar = D.vars.includes(key);
  const vb = h('button', { type: 'button', class: 'rt-lv', 'aria-pressed': String(isVar), 'aria-label': (isVar ? 'Fix ' : 'Vary ') + label.toLowerCase(), title: isVar ? 'A variable: the optimiser may change it. Click to fix it.' : 'Click to let the optimiser change it', disabled: fixed ? '' : null,
    onclick: () => { checkpoint(); D.vars = isVar ? D.vars.filter(k => k !== key) : D.vars.concat([key]); changed(false); renderWs(); } }, 'V');
  const sb = h('button', { type: 'button', class: 'rt-ls' + (fixed ? ' on' : ''), 'aria-label': 'Solve or pickup for ' + label.toLowerCase(), title: 'A solve or a pickup for this value', onclick: e => openPop(e.currentTarget, P, D, key, q, i) },
    sv ? 'S ' + (sv.kind === 'focus' ? 'focus' : sv.kind === 'fno' ? 'f/' + wsFmt(sv.v, 4) : 'edge') : pk ? 'P' : '…');
  td.append(h('div', { class: 'rt-lcell' }, inp, vb, sb));
  return td;
}
const solveText = s => s.kind === 'focus' ? 'the image at the paraxial focus' : s.kind === 'fno' ? 'for an F-number of ' + wsFmt(s.v, 4) : 'for an edge thickness of ' + wsFmt(s.v, 4) + ' mm';
const pickText = p => p.scale + ' × ' + p.from.replace(/^R:/, 'radius ').replace(/^t:/, 'thickness ').replace(/^k:/, 'conic ') + (p.off ? ' + ' + p.off : '');
function glassInput(mat, label, set) {
  let dl = document.getElementById('lensGlasses');
  if (!dl) { dl = h('datalist', { id: 'lensGlasses' }); for (const [k] of glassSearch('')) dl.append(h('option', { value: k })); document.body.append(dl); }
  const i = h('input', { type: 'text', class: 'rt-lglass', list: 'lensGlasses', value: isModel(mat) ? 'Model ' + (+mat.nd.toFixed(4)) + '/' + (+mat.vd.toFixed(2)) : matLabel(mat), 'aria-label': label, spellcheck: 'false',
    title: isModel(mat) ? 'A model glass: its nd and Vd alone. Type a glass’s name to use a real one.' : 'A glass by name, or a model glass as nd/Vd' });
  i.addEventListener('change', fromField(i, () => { if (i.value.trim()) set(i.value.trim()); }));
  return i;
}

/* a glass typed in: a catalogue name, or a model glass as "nd/Vd" ("1.62/60", "Model 1.62 60") */
function parseGlass(t) {
  const m = /^(?:model\s*)?(\d\.\d+)\s*[\/,\s]\s*(\d+(?:\.\d+)?)$/i.exec(t.trim());
  if (m) { const nd = +m[1], vd = +m[2]; if (nd >= 1.3 && nd <= 2.3 && vd >= 10 && vd <= 110) return { glass: 'Model', nd, vd }; return null; }
  const k = glassKey(t);
  return k ? { glass: k } : null;
}

/* ---------- The merit function ---------- */
const OP_LABEL = { EFL: 'Focal length (mm)', FNO: 'Working F-number', TTL: 'Total track (mm)', DIST: 'Distortion at the largest field (%)',
  SI: 'Spherical, SI (mm)', SII: 'Coma, SII (mm)', SIII: 'Astigmatism, SIII (mm)', SIV: 'Petzval, SIV (mm)', SV: 'Distortion, SV (mm)', CL: 'Axial colour, CL (mm)', CT: 'Lateral colour, CT (mm)' };
const CRIT = [['spot', 'RMS spot about the centroid'], ['chief', 'RMS spot about the chief ray'], ['wfe', 'RMS wavefront error']];
function meritEdit(fn) {
  optStop('Stopped: the merit function was changed.');
  checkpoint();
  const D = designOf(WS.asm), m = JSON.parse(JSON.stringify(D.merit));
  fn(m);
  D.merit = normMerit(m);
  changed(false);
  renderWs();
}
const share = v => h('div', { class: 'rt-lshare' }, h('div', { class: 'bar' }, h('span', { style: 'width:' + Math.min(100, 100 * v).toFixed(1) + '%' })), h('span', { class: 'mono' }, (100 * v).toFixed(v < 0.001 ? 2 : 1) + '%'));
function meritCard(asm, P) {
  const D = designOf(asm), M = D.merit, R = meritReport(optProblem(asm, P)), wf = M.crit === 'wfe';
  const card = h('div', { class: 'rt-lcard', role: 'tabpanel' });
  const sel = (label, opts, v, set) => { const x = h('select', { 'aria-label': label }, ...opts.map(([k, t]) => h('option', { value: String(k) }, t))); x.value = String(v); x.addEventListener('change', fromField(x, () => set(x.value))); return x; };
  card.append(h('div', { class: 'rt-lmerit' }, h('span', null, 'Merit'), h('b', { class: 'mono' }, wsFmt(R.merit, 5)), h('span', { class: 'rt-lsub' }, wf ? 'waves' : 'mm')));
  card.append(h('div', { class: 'rt-lrow rt-lmrow' }, h('span', null, 'Image:'),
    sel('Image quality', CRIT, M.crit, v => meritEdit(m => { m.crit = v; })),
    h('span', null, 'over ' + asm.cond.fields.length + ' field' + (asm.cond.fields.length === 1 ? '' : 's') + ' × ' + asm.cond.waves.length + ' wavelength' + (asm.cond.waves.length === 1 ? '' : 's') + ' ×'),
    sel('Pupil rings', [1, 2, 3, 4].map(n => [n, n + ' ring' + (n === 1 ? '' : 's')]), M.rings, v => meritEdit(m => { m.rings = +v; })),
    h('span', null, 'of'), sel('Arms', [4, 6, 8, 12].map(n => [n, n + ' arms']), M.arms, v => meritEdit(m => { m.arms = +v; })),
    h('span', { class: 'rt-lsub' }, '(Gaussian quadrature)')));
  const tbl = h('table', { class: 'rt-ltable rt-lmtable' });
  tbl.append(h('thead', null, h('tr', null, ...['Term', 'Target', 'Weight', 'Now', 'Share of the merit', ''].map(t => h('th', { scope: 'col' }, t)))));
  const tb = h('tbody');
  R.fields.forEach((f, i) => tb.append(h('tr', null, h('td', null, (wf ? 'Wavefront' : 'Spot') + ', field ' + wsFmt(f.deg, 4) + '°'), h('td', { class: 'mono ro' }, '0'),
    h('td', { class: 'mono ro', title: 'The field’s weight, set in the design conditions' }, wsFmt(asm.cond.fields[i].w, 4)),
    h('td', { class: 'mono' }, wf ? wsFmt(f.rms, 4) + ' waves' : wsFmt(1000 * f.rms, 4) + ' µm'), h('td', null, share(f.share)), h('td'))));
  R.ops.forEach((o, i) => tb.append(h('tr', null, h('td', null, OP_LABEL[o.op]),
    h('td', null, wsNumInput(o.target, v => meritEdit(m => { m.ops[i].target = v; }), { label: 'Target of ' + OP_LABEL[o.op] })),
    h('td', null, wsNumInput(o.weight, v => meritEdit(m => { m.ops[i].weight = v; }), { label: 'Weight of ' + OP_LABEL[o.op] })),
    h('td', { class: 'mono' }, wsFmt(o.value, 6)), h('td', null, share(o.share)),
    h('td', null, h('button', { class: 'rt-lx', type: 'button', 'aria-label': 'Remove ' + OP_LABEL[o.op], onclick: () => meritEdit(m => { m.ops.splice(i, 1); }) }, '×')))));
  tb.append(h('tr', null, h('td', null, 'Boundaries'), h('td', { class: 'ro', colspan: '2' }, R.bounds.broken.length ? R.bounds.broken.length + ' broken' : 'all kept'), h('td'), h('td', null, share(R.bounds.share)), h('td')));
  tbl.append(tb);
  card.append(h('div', { class: 'rt-ltwrap' }, tbl));
  const add = sel('Term to add', MERIT_OPS.map(k => [k, OP_LABEL[k]]), 'EFL', () => {});
  card.append(h('div', { class: 'rt-lbar' }, add, h('button', { class: 'rt-btn', type: 'button', onclick: () => {
    const F = designFigures(asm, P), now = { EFL: F.efl, FNO: Math.abs(F.fno), TTL: F.track }[add.value];
    meritEdit(m => { m.ops.push({ op: add.value, target: isFinite(now) ? +now.toPrecision(6) : 0, weight: 1 }); });
  } }, 'Add a term')));
  if (R.bounds.broken.length) card.append(h('div', { class: 'rt-lnote' }, 'Broken: ' + R.bounds.broken.map(b => b.what).join('; ') + '.'));
  const B = M.bounds, bnum = (label, k, t) => h('label', { class: 'rt-lbnd', title: t || '' }, label, wsNumInput(B[k], v => meritEdit(m => { m.bounds[k] = Math.max(0, v); }), { label }));
  card.append(h('h3', null, 'Boundaries every design keeps to (mm)'), h('div', { class: 'rt-lbnds' },
    bnum('Glass at the centre, at least', 'glassMin'), bnum('Glass at the centre, at most', 'glassMax', '0 for no limit'),
    bnum('Glass at the edge, at least', 'edgeMin'), bnum('Air between lenses, at least', 'airMin', 'At the centre and at the edge')));
  card.append(h('p', { class: 'rt-lsub' }, 'The merit is the square root of the sum of the squared terms over the image’s weight and the terms’ weights. A boundary counts only while it is broken. Rays are traced through every surface whatever its clear radius.'));
  return card;
}

/* ---------- Optimising ----------
   A few cycles (or trials) at a time, in the background worker where there is one, each batch's
   result written to the design and shown before the next; Stop ends it, Undo takes it all back. */
let OPT = null;
export function lensTolRun(mode, sync) { if (!WS) return null; tolStart(mode, { asm: WS.asm, P: designPrescription(WS.asm), redraw: renderWs, sync: sync !== false, state: WS.tolState || (WS.tolState = {}) }); return lensTolState(); }
export const lensOptState = () => OPT && { running: OPT.running, mode: OPT.mode, start: OPT.start, now: OPT.now, cycles: OPT.cycles, trials: OPT.trials, better: OPT.better, note: OPT.note };
function optStop(note) { if (OPT && OPT.running) { OPT.running = false; OPT.note = note || 'Stopped.'; if (WS) renderWs(); } }
export function optStart(mode, opts) {
  if (!WS) return false;
  const asm = WS.asm, P = designPrescription(asm), prob = optProblem(asm, P), V = optVars(prob);
  if (!V.length) { toast('Nothing to vary: mark values V in the lens data first.', true); return false; }
  checkpoint();
  const R = meritReport(prob);
  OPT = { id: asm.id, mode, running: true, start: R.merit, now: R.merit, cycles: 0, trials: 0, better: 0, seed: (opts && opts.seed) || 1, lambda: undefined, t0: performance.now(), note: '',
    maxTrials: (opts && opts.trials) || 200, sync: !!(opts && opts.sync) };
  renderWs();
  if (OPT.sync) { while (OPT.running) optBatch(); return true; }
  setTimeout(optBatch, 0);
  return true;
}
function optBatch() {
  const O = OPT;
  if (!O || !O.running || !WS || WS.asm.id !== O.id) return;
  const asm = WS.asm, prob = optProblem(asm, designPrescription(asm));
  const run = O.mode === 'global' ? { mode: 'global', trials: 2, seed: O.seed++ } : { mode: 'dls', iters: 4, lambda: O.lambda };
  const take = out => {
    if (OPT !== O || !O.running || !WS) return;
    if (!out) { O.running = false; O.note = 'Stopped: the background worker was busy.'; renderWs(); return; }
    if (out.merit < O.now || O.mode === 'dls') {
      const P2 = designPrescription(asm);
      optApply(P2, prob, out);
      commitDesign(asm, P2);
      changed(false);
    }
    O.now = Math.min(O.now, out.merit); O.cycles += out.iters; O.trials += out.tried; O.better += out.better; O.lambda = out.lambda;
    if (O.mode === 'dls' && out.done) { O.running = false; O.note = 'Done: no step makes it better.'; }
    if (O.mode === 'global' && O.trials >= O.maxTrials) { O.running = false; O.note = 'Done: ' + O.trials + ' trials.'; }
    renderWs();
    if (O.running && !O.sync) setTimeout(optBatch, 0);
  };
  if (O.sync || TEST_MODE || !hooks.fieldWorker()) take(optRun(prob, run));
  else hooks.fwRequest('lensopt', 'lensopt', { prob, run }).then(o => take(o && o.out)).catch(() => take(null));
}
function optCard(asm, P) {
  const prob = optProblem(asm, P), V = optVars(prob), O = OPT && OPT.id === asm.id ? OPT : null, running = !!(O && O.running);
  const card = h('div', { class: 'rt-lcard rt-lopt', role: 'tabpanel' });
  const count = q => V.filter(v => v.at.q === q && v.part !== 'vd').length;
  card.append(h('p', null, 'Variables: ', h('b', null, String(V.length)), V.length ? ' (radii ' + count('R') + ', thicknesses ' + count('t') + ', conics ' + count('k') + (count('g') ? ', model glasses ' + count('g') + ', each its nd and Vd' : '') + ')' : ' — mark values V in the lens data.'));
  WS.method = WS.method || 'dls';
  const radio = (k, label, t) => h('button', { type: 'button', role: 'radio', class: 'rt-ltab', 'aria-checked': String(WS.method === k), 'aria-selected': String(WS.method === k), title: t, disabled: running ? '' : null, onclick: () => { WS.method = k; renderWs(); } }, label);
  card.append(h('div', { class: 'rt-ltabs', role: 'radiogroup', 'aria-label': 'Method' },
    radio('dls', 'Damped least squares', 'Downhill from where the design is, to the nearest minimum'),
    radio('global', 'Global search', 'Again and again from the best design yet, shaken, keeping what is better: for a better minimum than the nearest')));
  card.append(h('div', { class: 'rt-lbar' }, running
    ? h('button', { class: 'rt-btn primary', type: 'button', onclick: () => optStop('Stopped.') }, 'Stop')
    : h('button', { class: 'rt-btn primary', type: 'button', disabled: V.length ? null : '', onclick: () => optStart(WS.method) }, 'Optimise the design')));
  const R = O ? null : meritReport(prob);
  const rows = O ? [['Merit at the start', wsFmt(O.start, 5)], ['Merit now', wsFmt(O.now, 5) + (O.start > 0 ? ' (' + (100 * (1 - O.now / O.start)).toFixed(1) + '% lower)' : '')],
    [O.mode === 'global' ? 'Trials' : 'Cycles', O.mode === 'global' ? O.trials + ' (' + O.better + ' better)' : String(O.cycles)]] : [['Merit now', wsFmt(R.merit, 5)]];
  card.append(h('div', { class: 'rt-readout' }, h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', { class: 'mono' }, b)]))));
  if (O && (O.note || running)) card.append(h('div', { class: 'rt-lnote', role: 'status' }, running ? (O.mode === 'global' ? 'Searching… it carries on until you stop it.' : 'Optimising…') : O.note));
  const models = P.materials.map((m, i) => isModel(m) ? i : -1).filter(i => i >= 0);
  if (models.length) card.append(h('div', { class: 'rt-lbar' }, h('button', { class: 'rt-btn', type: 'button', disabled: running ? '' : null,
    title: 'Each model glass replaced by the catalogue glass nearest it in nd and Vd; optimise again after', onclick: () => {
      const names = [];
      edit((PP, a) => { const dd = designOf(a); for (const i of models) { const m = PP.materials[i], k = nearestGlass(m.nd, m.vd); if (k) { PP.materials[i] = { glass: k }; names.push(k); dd.vars = dd.vars.filter(v => v !== keyAt(PP, 'g', i)); } } });
      toast('Model glasses replaced by ' + names.join(', ') + '. Optimise again to settle the design on them.');
    } }, 'Replace model glasses with the nearest real ones'), h('span', { class: 'rt-lsub' }, models.length + ' model glass' + (models.length === 1 ? '' : 'es'))));
  card.append(h('p', { class: 'rt-lsub' }, 'Runs in the background; the design, and its parts on the bench, change as it goes. Undo takes it back to where it started.'));
  return card;
}

/* the solve and pickup chooser, beside a value */
let pop = null;
function closePop() { if (!pop) return false; pop.remove(); pop = null; return true; }
function openPop(btn, P, D, key, q, i) {
  closePop();
  const kinds = Object.entries(SOLVE_KINDS).filter(([, K]) => K.on(key));
  const cur = D.solves[key] ? D.solves[key].kind : D.pickups[key] ? 'pick' : 'none';
  const sel = h('select', { 'aria-label': 'Kind' }, h('option', { value: 'none' }, 'None: typed in'), ...kinds.map(([k, K]) => h('option', { value: k }, 'Solve: ' + K.label)), h('option', { value: 'pick' }, 'Pick up from another surface'));
  sel.value = cur;
  const body = h('div', { class: 'rt-lpopb' });
  const ok = h('button', { class: 'rt-btn primary', type: 'button' }, 'Apply');
  const fill = () => {
    body.replaceChildren();
    const k = sel.value;
    if (k === 'fno' || k === 'edge') {
      const v = h('input', { type: 'text', inputmode: 'decimal', class: 'rt-lnum', value: wsFmt(D.solves[key] && D.solves[key].kind === k ? D.solves[key].v : SOLVE_KINDS[k].v), 'aria-label': SOLVE_KINDS[k].label });
      body.append(h('label', null, k === 'fno' ? 'F-number' : 'Edge thickness (mm)', v));
      ok.onclick = () => { const x = parseNum(v.value); if (x === null) return; apply(dd => { delete dd.pickups[key]; dd.solves[key] = { kind: k, v: x }; dd.vars = dd.vars.filter(z => z !== key); }); };
    } else if (k === 'pick') {
      const srcs = h('select', { 'aria-label': 'From' });
      for (let j = 0; j < P.surfaces.length; j++) {
        if (j === i || !editable(P, q, j)) continue;
        const kk = keyAt(P, q, j);
        srcs.append(h('option', { value: kk }, (q === 't' && kk === 't:image' ? 'the image distance' : 'surface ' + (j + 1))));
      }
      if (!srcs.options.length) { body.append(h('p', null, 'No other surface has one to pick up.')); ok.onclick = null; return; }
      const p = D.pickups[key] || { scale: q === 'R' ? -1 : 1, off: 0 };
      if (p.from) srcs.value = p.from;
      const sc = h('input', { type: 'text', inputmode: 'decimal', class: 'rt-lnum', value: wsFmt(p.scale), 'aria-label': 'Scale' }), off = h('input', { type: 'text', inputmode: 'decimal', class: 'rt-lnum', value: wsFmt(p.off), 'aria-label': 'Offset' });
      body.append(h('label', null, 'From', srcs), h('label', null, 'Times', sc), h('label', null, 'Plus', off));
      ok.onclick = () => { const s = parseNum(sc.value), o = parseNum(off.value); if (s === null || o === null) return; apply(dd => { delete dd.solves[key]; dd.pickups[key] = { from: srcs.value, scale: s, off: o }; dd.vars = dd.vars.filter(z => z !== key); }); };
    } else {
      body.append(h('p', null, k === 'focus' ? 'The image plane at the paraxial focus of the primary wavelength.' : 'The value as typed.'));
      ok.onclick = () => apply(dd => { delete dd.pickups[key]; delete dd.solves[key]; if (k === 'focus') dd.solves[key] = { kind: 'focus' }; });
    }
  };
  const apply = fn => { closePop(); edit((PP, asm) => { const dd = designOf(asm); fn(dd); }); };
  sel.addEventListener('change', fill);
  fill();
  pop = h('div', { class: 'rt-lpop', role: 'dialog', 'aria-label': 'Solve or pickup' }, sel, body, h('div', { class: 'rt-lrow' }, ok, h('button', { class: 'rt-btn', type: 'button', onclick: closePop }, 'Cancel')));
  document.getElementById('lensWs').append(pop);
  const r = btn.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(window.innerWidth - 300, r.left - 120)) + 'px';
  pop.style.top = (r.bottom + 6) + 'px';
  sel.focus();
  setTimeout(() => document.addEventListener('pointerdown', function out(e) { if (pop && !pop.contains(e.target)) { closePop(); } if (!pop) document.removeEventListener('pointerdown', out); }), 0);
}

/* ---------- Placing a new design: light for it on the bench ---------- */
export function placeOnBench(asm) {
  const P = designPrescription(asm), F = designFigures(asm, P), c = asm.cond;
  const d = P.dir, a0 = Math.atan2(d[1], d[0]), ep = [P.origin[0] + d[0] * F.epz, P.origin[1] + d[1] * F.epz];
  const back = Math.max(20, 0.5 * F.track), nms = c.waves.map(w => w.nm), pr = primaryNm(c);
  const ref = asmMembers(asm)[0];
  const made = [];
  c.fields.forEach((f, i) => {
    // aimed through the entrance pupil's centre, as wide as the pupil
    const a = a0 + f.deg * deg, x = ep[0] - back * Math.cos(a), y = ep[1] - back * Math.sin(a);
    const src = normElement({ type: 'source', name: 'Field ' + wsFmt(f.deg, 4) + '°', x, y, angle: a / deg, wavelength: pr, lines: nms.filter(n => n !== pr), width: F.epd, rays: 9, divergence: 0, bench: asm.bench, ...(ref.z !== undefined ? { z: ref.z } : {}) });
    made.push(src);
  });
  const zi = F.S.imageZ, ip = [P.origin[0] + d[0] * zi, P.origin[1] + d[1] * zi];
  const scr = normElement({ type: 'screen', name: 'Image of ' + asm.name, x: ip[0], y: ip[1], angle: a0 / deg + 180, length: Math.max(4, Math.ceil(2.4 * Math.abs(F.imgH) + 2)), bench: asm.bench, ...(ref.z !== undefined ? { z: ref.z } : {}) });
  made.push(scr);
  for (const e of made) project.elements.push(e);
  toast('Placed ' + asm.name + ' with ' + c.fields.length + ' source' + (c.fields.length === 1 ? '' : 's') + ' and a screen at its image');
  return made;
}
