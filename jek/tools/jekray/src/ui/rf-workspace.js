import { asmAxisAt, asmCheck, asmMembers, normCond, normRfCond } from '../core/assembly.js';
import { C_NM_GHZ, RF_HORNS, RF_MAT, applyRf, hornGeom, rfBeam } from '../core/rf.js';
import { V, normCoat, project, uid } from '../state/project.js';
import { getEl, normElement } from '../state/elements.js';
import { benchName } from '../state/tabs.js';
import { commitDesign, designOf, designPrescription, surfSag, surfaceParts } from '../engines/lens-design.js';
import { RF_LENS_TYPES, rfBand, rfSynth, rfSyncCond } from '../engines/rf-design.js';
import { h } from './panel.js';
import { matchLayer } from './panels.js';
import { setSelection } from './render.js';
import { changed, toast } from './actions.js';
import { checkpoint, redo, undo } from './tabs.js';
import { openLensDesign } from './lens-workspace.js';

/* ==========================================================================
   The RF designer
   An assembly of RF parts (lenses and mirrors for millimetre waves) opened as a quasi-optical system: a feed
   horn's beam through them to what it is for. The conditions are the system's own: the frequency and band,
   the feed horn and how far it stands from the first lens, and the goal (collimate, focus to a waist, or into a
   receiving horn). The layout draws the beam itself, its 1/e² radius along the axis at the design frequency and
   the band's edges, and each lens's edge taper; the figures are the ones an RF designer reads (engines/
   rf-design.js). The horns on the bench the conditions were taken from follow them. The lenses are edited
   in their own table, or made from a spec (Design a lens); the full lens data is the optical designer's.
   ========================================================================== */
let RW = null;                     // { asm, tab, draft, synth }
export const rfDesignOpen = () => !!RW;
const rwFmt = (v, p) => v === null || v === undefined ? '' : !isFinite(v) ? '∞' : String(+(+v).toPrecision(p || 5));
const rwPct = v => isFinite(v) ? (100 * v).toFixed(1) + ' %' : '—';
const rwDb = v => isFinite(v) && v > 0 ? (10 * Math.log10(v)).toFixed(2) + ' dB' : '—';
const RW_HORN_NAMES = { corrugated: 'Corrugated conical', smooth: 'Smooth-wall conical', diagonal: 'Diagonal', gauss: 'Ideal Gaussian' };
const RW_GOAL_NAMES = { collimate: 'Collimate the beam', focus: 'Focus to a waist', couple: 'Into a receiving horn' };

/* an assembly the RF designer takes: every part an RF one, and not set to the optical designer */
export const isRfAsm = asm => !!asm && asm.kind !== 'optical' && asmMembers(asm).length > 0 && asmMembers(asm).every(e => e.mmw);

/* the horns on the bench before the first lens and after the last, on the axis: the conditions taken from them */
const rwSources = asm => project.elements.filter(e => e.bench === asm.bench && e.mmw && !e.mmw.part && e.type === 'source');
const rwReceivers = asm => project.elements.filter(e => e.bench === asm.bench && e.mmw && !e.mmw.part && e.type === 'detector');
function rwNearest(list, p, d) {
  let best = null;
  for (const e of list) {
    const v = [e.x - p[0], e.y - p[1]], t = v[0] * d[0] + v[1] * d[1], off = Math.abs(v[0] * d[1] - v[1] * d[0]);
    if (t > 0.5 && off < 0.25 * t + 20 && (!best || off + 0.01 * t < best.off + 0.01 * best.t)) best = { e, t, off };
  }
  return best;
}
const rwLen = P => P.gaps.reduce((a, b) => a + b, 0);
export function rfFromBench(asm, P) {
  const R = normRfCond(asm.rf), notes = [];
  const f = rwNearest(rwSources(asm), P.origin, [-P.dir[0], -P.dir[1]]);
  if (f) { const m = f.e.mmw; Object.assign(R.feed, { kind: m.kind, a: m.a, L: m.L, d: f.t, id: f.e.id }); R.ghz = m.ghz; R.lo = m.ghz * 0.9; R.hi = m.ghz * 1.1; }
  else notes.push('No feed horn on the bench lights it: the feed is as set here.');
  const A = asmAxisAt(P, rwLen(P) + 1e-9), r = rwNearest(rwReceivers(asm), A.p, A.d);
  if (r) R.goal = { kind: 'couple', d: r.t, rx: { kind: r.e.mmw.kind, a: r.e.mmw.a, L: r.e.mmw.L, id: r.e.id } };
  return { rf: normRfCond(R), notes };
}
/* the horns the conditions came from follow them: the feed at its distance before the first vertex, facing it;
   the receiver at its distance after the last, facing back; each its kind, size and (the feed) frequency */
function rwToBench(asm, P) {
  const R = asm.rf, fe = R.feed.id && getEl(R.feed.id);
  if (fe && fe.type === 'source' && fe.mmw) {
    fe.x = P.origin[0] - P.dir[0] * R.feed.d; fe.y = P.origin[1] - P.dir[1] * R.feed.d;
    fe.angle = Math.atan2(P.dir[1], P.dir[0]) * 180 / Math.PI;
    Object.assign(fe.mmw, { kind: R.feed.kind, a: R.feed.a, L: R.feed.L, ghz: R.ghz });
    applyRf(fe);
  }
  const rx = R.goal.kind === 'couple' && R.goal.rx.id && getEl(R.goal.rx.id);
  if (rx && rx.type === 'detector' && rx.mmw) {
    const A = asmAxisAt(P, rwLen(P) + 1e-9);
    rx.x = A.p[0] + A.d[0] * R.goal.d; rx.y = A.p[1] + A.d[1] * R.goal.d;
    rx.angle = Math.atan2(-A.d[1], -A.d[0]) * 180 / Math.PI;
    Object.assign(rx.mmw, { kind: R.goal.rx.kind, a: R.goal.rx.a, L: R.goal.rx.L });
    applyRf(rx);
  }
}

export function openRfDesign(asm, opts) {
  const C = asmCheck(asmMembers(asm), { ref: asm.ref, rev: asm.rev });
  if (!C.ok) { toast('Its parts are no longer on one axis: ' + C.why, true); return false; }
  designOf(asm);
  const P = designPrescription(asm);
  if (asm.kind !== 'rf' || !asm.rf) {
    const T = rfFromBench(asm, P);
    asm.kind = 'rf'; asm.rf = T.rf;
  }
  rfSyncCond(asm, P);
  RW = { asm, tab: 'lenses', draft: !!(opts && opts.draft), synth: null };
  const sec = rwShell();
  sec.hidden = false;
  document.body.classList.add('rt-lens-open');
  rwRender();
  sec.focus();
  return true;
}
export function closeRfDesign() {
  if (!RW) return;
  const asm = RW.asm;
  RW = null;
  asm.lock = true;
  document.getElementById('rfWs').hidden = true;
  document.body.classList.remove('rt-lens-open');
  setSelection(asmMembers(asm));
  changed(true);
}
function rwLeave() {
  if (RW && RW.draft) { checkpoint(); rwPlace(RW.asm); }
  closeRfDesign();
}
function rwShell() {
  let sec = document.getElementById('rfWs');
  if (sec) return sec;
  sec = h('section', { class: 'rt-lens rt-rfws', id: 'rfWs', hidden: '', tabindex: '-1', 'aria-label': 'RF design' });
  sec.addEventListener('keydown', e => {
    const k = e.key.toLowerCase(), typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
    if (k === 'escape') { e.preventDefault(); rwLeave(); }
    else if ((e.ctrlKey || e.metaKey) && !typing && (k === 'z' || k === 'y')) { e.preventDefault(); if (k === 'y' || e.shiftKey) redo(); else undo(); rwAfterUndo(); }
    e.stopPropagation();
  });
  ['keyup', 'copy', 'cut', 'paste'].forEach(t => sec.addEventListener(t, e => e.stopPropagation()));
  document.body.append(sec);
  return sec;
}
function rwAfterUndo() {
  if (!RW) return;
  const a = (project.assemblies || []).find(x => x.id === RW.asm.id);
  if (!a || !asmMembers(a).length) { RW = null; document.getElementById('rfWs').hidden = true; document.body.classList.remove('rt-lens-open'); toast('The design was undone'); return; }
  RW.asm = a; designOf(a);
  rwRender();
}

/* drawn again after a field's change, focus kept on the field (by its label) the person moved to */
let rwRendering = false, rwTimer = 0;
function rwSoon() {
  clearTimeout(rwTimer);
  rwTimer = setTimeout(() => {
    rwTimer = 0;
    const a = document.activeElement, lab = a && a.closest && a.closest('#rfWs') && a.getAttribute('aria-label');
    rwRender();
    const n = lab && [...document.querySelectorAll('#rfWs [aria-label]')].find(x => x.getAttribute('aria-label') === lab);
    if (n) { n.focus(); if (n.select) n.select(); }
  }, 0);
}
const rwField = (el, fn) => () => { if (rwRendering || !el.isConnected) return; fn(); };
export function rwRender() {
  if (!RW) return;
  rwRendering = true;
  try { rwDraw(); } finally { rwRendering = false; }
}
function rwDraw() {
  const sec = document.getElementById('rfWs'), asm = RW.asm;
  const C = asmCheck(asmMembers(asm), { ref: asm.ref, rev: asm.rev });
  if (!C.ok) { closeRfDesign(); toast('Its parts are no longer on one axis: ' + C.why, true); return; }
  const P = designPrescription(asm), T = rfBand(asm, P);
  const scroll = sec.querySelector('.rt-lbody') ? sec.querySelector('.rt-lbody').scrollTop : 0;
  sec.replaceChildren();
  const name = h('input', { class: 'rt-lname', type: 'text', value: asm.name, size: String(Math.max(6, Math.min(40, asm.name.length + 1))), 'aria-label': 'Design name', spellcheck: 'false' });
  name.addEventListener('change', rwField(name, () => { checkpoint(); asm.name = String(name.value || 'Assembly').slice(0, 80); changed(false); }));
  sec.append(h('header', { class: 'rt-lhead' },
    h('span', { class: 'rt-hmark' }, 'JEKray'),
    h('nav', { class: 'rt-lcrumb', 'aria-label': 'Where you are' }, h('span', { class: 'from' }, benchName(asm.bench)), h('span', { 'aria-hidden': 'true' }, '›'), name, h('span', { class: 'rt-lpill rt-rfpill' }, 'RF design')),
    h('span', { class: 'rt-lgap' }),
    h('button', { class: 'rt-btn', type: 'button', title: 'The same parts in the optical lens designer: every surface, ray traces and its analyses', onclick: () => { closeRfDesign(); openLensDesign(asm, { optical: true }); } }, 'Optical designer'),
    h('button', { class: 'rt-btn', type: 'button', title: 'Undo (Ctrl+Z)', onclick: () => { undo(); rwAfterUndo(); } }, 'Undo'),
    h('button', { class: 'rt-btn', type: 'button', title: 'Redo (Ctrl+Y)', onclick: () => { redo(); rwAfterUndo(); } }, 'Redo'),
    h('button', { class: 'rt-btn primary', type: 'button', id: 'rfLeave', title: RW.draft ? 'Put it on the bench with its feed horn, and its receiver or a load at its goal' : 'Back to the bench, where its parts and horns are as designed here (Esc)', onclick: rwLeave },
      RW.draft ? 'Place on a bench' : 'Back to the bench')));
  const body = h('div', { class: 'rt-lbody' });
  body.append(rwCondCard(asm, P), h('div', { class: 'rt-lmain' }, rwLayoutCard(asm, P, T), rwFigures(asm, T), rwTabs(),
    RW.tab === 'synth' ? rwSynthCard(asm, P) : rwLensCard(asm, P, T.mid)));
  sec.append(body, h('div', { class: 'rt-toast', id: 'rfToast', role: 'status', 'aria-live': 'polite' }));
  body.scrollTop = scroll;
}

/* a change to the parts: undoable, written to the parts, the horns following, shown */
function rwEdit(fn) {
  checkpoint();
  const asm = RW.asm, P = designPrescription(asm);
  const r = fn(P, asm);
  if (typeof r === 'string') { toast(r, true); return; }
  if (r !== false) commitDesign(asm, P);
  const P2 = designPrescription(asm);
  rfSyncCond(asm, P2); rwToBench(asm, P2);
  changed(false);
  rwRender();
}
function rwCondEdit(fn) {
  checkpoint();
  const asm = RW.asm, r = JSON.parse(JSON.stringify(asm.rf));
  fn(r);
  asm.rf = normRfCond(r);
  const P = designPrescription(asm);
  rfSyncCond(asm, P); rwToBench(asm, P);
  changed(false);
  rwRender();
}

/* ---------- Conditions ---------- */
function rwNum(value, set, label, p) {
  const i = h('input', { type: 'text', inputmode: 'decimal', value: rwFmt(value, p || 6), class: 'rt-lnum', 'aria-label': label, spellcheck: 'false' });
  i.addEventListener('change', rwField(i, () => { const v = parseFloat(String(i.value).replace(',', '.')); if (!isFinite(v)) { i.value = rwFmt(value, p || 6); return; } set(v); }));
  return i;
}
function rwSelect(options, value, set, label) {
  const s = h('select', { 'aria-label': label }, ...Object.entries(options).map(([k, t]) => h('option', { value: k }, t)));
  s.value = value;
  s.addEventListener('change', rwField(s, () => set(s.value)));
  return s;
}
const rwRow = (label, ...kids) => h('label', { class: 'rt-lrow' }, h('span', null, label), ...kids);
function rwCondCard(asm, P) {
  const R = asm.rf, card = h('section', { class: 'rt-lcard rt-lcond rt-rfcond', 'aria-label': 'Design conditions' }, h('h2', null, 'Design conditions'));
  card.append(h('p', { class: 'rt-lsub' }, 'The system it is designed for: a feed horn’s beam, through its lenses, to its goal.'));
  card.append(h('h3', null, 'Frequency (GHz)'),
    rwRow('Design', rwNum(R.ghz, v => rwCondEdit(r => { const k = v / r.ghz; r.ghz = v; r.lo *= k; r.hi *= k; }), 'Design frequency (GHz)')),
    rwRow('Band from', rwNum(R.lo, v => rwCondEdit(r => { r.lo = v; }), 'Band from (GHz)')),
    rwRow('Band to', rwNum(R.hi, v => rwCondEdit(r => { r.hi = v; }), 'Band to (GHz)')));
  const fb = rfBeam(R.feed, R.ghz);
  card.append(h('h3', null, 'Feed horn'),
    rwRow('Kind', rwSelect(RW_HORN_NAMES, R.feed.kind, v => rwCondEdit(r => { r.feed.kind = v; }), 'Feed horn kind')),
    rwRow('Aperture radius (mm)', rwNum(R.feed.a, v => rwCondEdit(r => { r.feed.a = v; }), 'Feed aperture radius (mm)')),
    rwRow('Slant length (mm)', rwNum(R.feed.L, v => rwCondEdit(r => { r.feed.L = v; }), 'Feed slant length (mm)')),
    rwRow('To the first lens (mm)', rwNum(R.feed.d, v => rwCondEdit(r => { r.feed.d = v; }), 'Feed to the first lens (mm)')),
    h('p', { class: 'rt-lsub mono' }, 'Its beam: waist ' + rwFmt(fb.w0, 4) + ' mm, ' + rwFmt(fb.dz, 3) + ' mm behind the aperture; ' + rwFmt((RF_HORNS[R.feed.kind] || RF_HORNS.corrugated).g * 100, 3) + ' % of its power Gaussian'));
  card.append(h('h3', null, 'Goal'),
    rwRow('After the last lens', rwSelect(RW_GOAL_NAMES, R.goal.kind, v => rwCondEdit(r => { r.goal.kind = v; }), 'Goal')),
    rwRow(R.goal.kind === 'couple' ? 'To the horn’s aperture (mm)' : R.goal.kind === 'focus' ? 'Waist at (mm)' : 'Shown to (mm)', rwNum(R.goal.d, v => rwCondEdit(r => { r.goal.d = v; }), 'Goal distance (mm)')));
  if (R.goal.kind === 'focus') card.append(rwRow('Waist radius (mm)', rwNum(R.goal.w, v => rwCondEdit(r => { r.goal.w = v; }), 'Target waist radius (mm)')));
  if (R.goal.kind === 'couple') card.append(
    rwRow('Receiver kind', rwSelect(RW_HORN_NAMES, R.goal.rx.kind, v => rwCondEdit(r => { r.goal.rx.kind = v; }), 'Receiving horn kind')),
    rwRow('Aperture radius (mm)', rwNum(R.goal.rx.a, v => rwCondEdit(r => { r.goal.rx.a = v; }), 'Receiver aperture radius (mm)')),
    rwRow('Slant length (mm)', rwNum(R.goal.rx.L, v => rwCondEdit(r => { r.goal.rx.L = v; }), 'Receiver slant length (mm)')));
  const linked = [R.feed.id && getEl(R.feed.id) ? 'the feed horn' : null, R.goal.kind === 'couple' && R.goal.rx.id && getEl(R.goal.rx.id) ? 'the receiver' : null].filter(Boolean);
  card.append(h('button', { class: 'rt-btn', type: 'button', title: 'The feed horn lighting it and a receiving horn after it, as they are on the bench', onclick: rwTake }, 'Take from the bench'));
  if (linked.length) card.append(h('p', { class: 'rt-lsub' }, 'On the bench, ' + linked.join(' and ') + ' follow' + (linked.length === 1 ? 's' : '') + ' these conditions.'));
  return card;
}
function rwTake() {
  const asm = RW.asm, P = designPrescription(asm), T = rfFromBench(asm, P);
  rwCondEdit(r => { Object.assign(r, T.rf); });
  if (T.notes.length) toast(T.notes.join(' '), true);
}

/* ---------- The layout: the parts, the horns and the beam ---------- */
const RW_BEAM = '#e0a030', RW_EDGE = 'rgba(224,160,48,0.55)';
function rwLayoutCard(asm, P, T) {
  const card = h('div', { class: 'rt-lcard rt-llayout' });
  const R = asm.rf;
  card.append(h('div', { class: 'rt-lltop' }, h('span', null, 'The beam, 1/e² radius along the axis' + (P.folded ? ' (unfolded)' : '')),
    h('span', { class: 'mono' }, rwFmt(R.ghz, 4) + ' GHz · band ' + rwFmt(R.lo, 4) + ' to ' + rwFmt(R.hi, 4) + ' GHz dashed')));
  const cv = h('canvas', { role: 'img', 'aria-label': 'The system: its feed horn, its lenses and the beam through them to its goal, with each lens’s edge taper' });
  card.append(cv);
  requestAnimationFrame(() => rwDrawLayout(cv, asm, P, T));
  return card;
}
function rwDrawLayout(cv, asm, P, T) {
  const R = asm.rf, dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 800;
  const fg = hornGeom({ type: 'source', mmw: { a: R.feed.a, L: R.feed.L, ghz: R.ghz } });
  const zFeed = -R.feed.d, zBack = zFeed - fg.Lax - 0.15 * fg.Lax;
  let zEnd = Math.max(T.mid.zEnd, T.lo.zEnd, T.hi.zEnd);
  let rxG = null;
  if (R.goal.kind === 'couple') { rxG = hornGeom({ type: 'source', mmw: { a: R.goal.rx.a, L: R.goal.rx.L, ghz: R.ghz } }); zEnd = Math.max(zEnd, T.mid.zL + R.goal.d + rxG.Lax * 1.15); }
  let yMax = Math.max(R.feed.a, rxG ? R.goal.rx.a : 0);
  for (const s of P.surfaces) if (isFinite(s.semi)) yMax = Math.max(yMax, s.semi);
  for (const t of [T.lo, T.mid, T.hi]) for (const s of t.samples) if (isFinite(s.w)) yMax = Math.max(yMax, Math.min(s.w, 4 * yMax + 1));
  yMax *= 1.12;
  const za = zBack, zb = zEnd + 0.02 * (zEnd - zBack);
  const H = Math.max(220, Math.min(460, W * (2 * yMax) / (zb - za) + 40));
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  g.fillStyle = '#1e2227'; g.fillRect(0, 0, W, H);
  const k = Math.min((W - 24) / (zb - za), (H - 36) / (2 * yMax));
  const X = z => 12 + (z - za) * k + ((W - 24) - (zb - za) * k) / 2, Y = y => H / 2 + 6 - y * k;
  // the axis
  g.strokeStyle = 'rgba(255,255,255,0.15)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(za), Y(0)); g.lineTo(X(zb), Y(0)); g.stroke(); g.setLineDash([]);
  // the beam at the design frequency, filled; the band's edges dashed
  const env = (t, fill) => {
    const S = t.samples.filter(s => isFinite(s.w) && s.z <= zb);
    g.beginPath(); S.forEach((s, i) => i ? g.lineTo(X(s.z), Y(s.w)) : g.moveTo(X(s.z), Y(s.w)));
    if (fill) { for (let i = S.length - 1; i >= 0; i--) g.lineTo(X(S[i].z), Y(-S[i].w)); g.closePath(); g.fillStyle = 'rgba(224,160,48,0.18)'; g.fill(); g.strokeStyle = RW_BEAM; g.lineWidth = 1.5; g.stroke(); }
    else { g.strokeStyle = RW_EDGE; g.lineWidth = 1; g.setLineDash([5, 4]); g.stroke(); g.beginPath(); S.forEach((s, i) => i ? g.lineTo(X(s.z), Y(-s.w)) : g.moveTo(X(s.z), Y(-s.w))); g.stroke(); g.setLineDash([]); }
  };
  env(T.lo, false); env(T.hi, false); env(T.mid, true);
  // the parts: each lens its outline (the faces' sags to the clear radius), each mirror its face
  const S = T.mid.surf, sps = surfaceParts(P);
  for (let i = 0; i < P.surfaces.length; i++) {
    const s = P.surfaces[i], z0 = S[i].z;
    if (s.mirror) { g.strokeStyle = '#e4ebf0'; g.lineWidth = 2; g.beginPath(); for (let q = 0; q <= 20; q++) { const y = -s.semi + 2 * s.semi * q / 20; const z = z0 + surfSag(s, Math.abs(y)); q ? g.lineTo(X(z), Y(y)) : g.moveTo(X(z), Y(y)); } g.stroke(); continue; }
    if (i < P.surfaces.length - 1 && P.materials[i] && P.materials[i].glass !== 'AIR' && sps[i].pi === sps[i + 1].pi) {
      const a = Math.min(s.semi, P.surfaces[i + 1].semi), z1 = S[i + 1].z, b = P.surfaces[i + 1];
      g.beginPath();
      for (let q = 0; q <= 40; q++) { const y = -a + 2 * a * q / 40; const z = z0 + surfSag(s, Math.abs(y)); q ? g.lineTo(X(z), Y(y)) : g.moveTo(X(z), Y(y)); }
      for (let q = 40; q >= 0; q--) { const y = -a + 2 * a * q / 40; g.lineTo(X(z1 + surfSag(b, Math.abs(y))), Y(y)); }
      g.closePath(); g.fillStyle = 'rgba(242,242,236,0.28)'; g.fill(); g.strokeStyle = '#f2f2ec'; g.lineWidth = 1.2; g.stroke();
      // its edge taper, over it
      g.fillStyle = '#f2f2ec'; g.font = '11px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(isFinite(S[i].taper) ? '−' + S[i].taper.toFixed(1) + ' dB edge' : '', X((z0 + z1) / 2), Y(a) - 6);
    }
  }
  // the horns: the feed's flare to its aperture; the receiver's, facing back
  const hornPath = (zAp, sgn, G, a) => { g.beginPath(); g.moveTo(X(zAp - sgn * G.Lax * 1.15), Y(G.rg)); g.lineTo(X(zAp - sgn * G.Lax), Y(G.rg)); g.lineTo(X(zAp), Y(a)); g.lineTo(X(zAp), Y(-a)); g.lineTo(X(zAp - sgn * G.Lax), Y(-G.rg)); g.lineTo(X(zAp - sgn * G.Lax * 1.15), Y(-G.rg)); };
  g.fillStyle = 'rgba(224,160,48,0.35)'; g.strokeStyle = RW_BEAM; g.lineWidth = 1.4;
  hornPath(zFeed, 1, fg, R.feed.a); g.fill(); g.stroke();
  g.fillStyle = '#f2f2ec'; g.font = '11px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText('Feed', X(zFeed - fg.Lax / 2), Y(R.feed.a) - 8);
  if (rxG) {
    const zr = T.mid.zL + R.goal.d;
    g.fillStyle = 'rgba(224,160,48,0.35)'; hornPath(zr, -1, rxG, R.goal.rx.a); g.fill(); g.stroke();
    g.fillStyle = '#f2f2ec'; g.fillText('Receiver', X(zr + rxG.Lax / 2), Y(R.goal.rx.a) - 8);
  } else if (R.goal.kind === 'focus') {
    const zw = T.mid.zL + R.goal.d, w = R.goal.w;
    g.strokeStyle = '#7ee0a1'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(zw), Y(w)); g.lineTo(X(zw), Y(-w)); g.stroke();
    g.fillStyle = '#7ee0a1'; g.fillText('Target waist', X(zw), Y(w) - 8);
  }
}

/* ---------- The figures ---------- */
function rwFigures(asm, T) {
  const R = asm.rf, m = T.mid, row = (a, b, t) => h('div', { title: t || '' }, h('span', null, a), h('b', { class: 'mono' }, b));
  const band = (f, fmt) => fmt(Math.min(f(T.lo), f(T.hi), f(m))) + ' to ' + fmt(Math.max(f(T.lo), f(T.hi), f(m)));
  const items = [];
  if (R.goal.kind === 'collimate') {
    items.push(row('Gain', rwFmt(m.gain, 4) + ' dBi', 'On the axis, from the last lens’s aperture: its aperture efficiency and the losses before it'),
      row('Over the band', band(t => t.gain, v => rwFmt(v, 4)) + ' dBi'),
      row('Aperture efficiency', rwPct(m.apEff), 'The last lens’s Gaussian field, with its curvature, against a uniform one over its aperture'),
      row('Beam leaving', 'waist ' + rwFmt(m.waist.w, 4) + ' mm, ' + rwFmt(m.waist.at, 4) + ' mm after', 'The Gaussian beam the last lens sends on: its waist and where it is from the last vertex (negative: behind it)'),
      row('Divergence', rwFmt(m.theta, 3) + '° (1/e²)', 'The far-field half-angle of that Gaussian beam'));
  } else {
    items.push(row('Coupling', rwPct(m.coupling), R.goal.kind === 'couple' ? 'The beam’s Gaussian coupling to the receiving horn’s beam' : 'The beam’s coupling to a Gaussian of the target waist'),
      row('Over the band', band(t => t.coupling, rwPct)),
      row('Waist made', rwFmt(m.waist.w, 4) + ' mm, ' + rwFmt(m.waist.at, 4) + ' mm after', 'The waist of the beam leaving the last lens, and its distance from the last vertex'),
      row('Waist wanted', rwFmt(m.target.w, 4) + ' mm, ' + rwFmt(m.target.at, 4) + ' mm after'));
  }
  items.push(row('Efficiency', rwPct(m.eff) + ' (' + rwDb(m.eff) + ')', 'All of it: the feed’s Gaussian share, reflections, absorption, spillover' + (R.goal.kind === 'collimate' ? ' and the aperture efficiency' : ', the coupling and the receiver’s share')),
    row('Over the band', band(t => t.eff, rwPct)),
    row('Reflections', rwDb(m.refl), 'From every face: matched faces through their layer at each frequency'),
    row('Absorption', rwDb(m.absorb), 'In the lenses’ plastic, over the beam’s profile'),
    row('Spillover', rwDb(m.spill), 'Past the apertures on the way' + (R.goal.kind === 'collimate' ? ' (the last lens’s own is in its aperture efficiency)' : '')));
  return h('div', { class: 'rt-lfig' }, ...items);
}
function rwTabs() {
  const tab = (id, label) => h('button', { type: 'button', role: 'tab', class: 'rt-ltab', 'aria-selected': String(RW.tab === id), onclick: () => { RW.tab = id; rwRender(); } }, label);
  return h('div', { class: 'rt-ltabs', role: 'tablist', 'aria-label': 'Design' }, tab('lenses', 'Lenses'), tab('synth', 'Design a lens'));
}

/* ---------- The lenses: each its material, size and faces, and the air after it ---------- */
const RW_MATS = () => Object.fromEntries(Object.entries(RF_MAT).sort((a, b) => (b[1].print ? 1 : 0) - (a[1].print ? 1 : 0)).map(([k, M]) => [k, M.name + (M.print ? ' (made to order)' : '')]));
function rwLensCard(asm, P, Tm) {
  const card = h('section', { class: 'rt-lcard', role: 'tabpanel', 'aria-label': 'Lenses' }, h('h3', null, 'Lenses'));
  card.append(h('p', { class: 'rt-lsub' }, 'In the order the beam meets them, the front face toward the feed. A radius is positive with its centre beyond the face; a conic of −n² makes it the hyperbola that suits a point source. Every surface, with its aspheric terms, is in the optical designer.'));
  const tbl = h('table', { class: 'rt-ltable rt-rftable' });
  tbl.append(h('thead', null, h('tr', null, ...['Part', 'Material', 'Diameter (mm)', 'Centre (mm)', 'Front R (mm)', 'Front conic', 'Back R (mm)', 'Back conic', 'Matched', 'Air after (mm)'].map(t => h('th', { scope: 'col' }, t)))));
  const tb = h('tbody');
  let i0 = 0;
  P.parts.forEach((p, pi) => {
    const el = getEl(p.id), i1 = i0 + p.n - 1, after = i1 < P.surfaces.length - 1 ? P.gaps[i1] : null, idx = i0, last = i1;
    const airCell = after === null ? h('td', { class: 'mono' }, '—') : h('td', null, rwNum(after, v => rwEdit(Pd => { if (v < 0) return 'A gap can’t be negative.'; Pd.gaps[last] = v; }), el.name + ' air after (mm)'));
    if (p.kind === 'lens' && p.n === 2) {
      const s1 = P.surfaces[i0], s2 = P.surfaces[i0 + 1], mat = P.materials[i0].glass, matched = el.surfaces.every(s => s.coat && s.coat.label === 'Matching layer');
      const rCell = (s, j, lab) => h('td', null, rwNum(s.R === null ? Infinity : s.R, v => rwEdit(Pd => { Pd.surfaces[idx + j].R = !isFinite(v) || Math.abs(v) > 1e9 || v === 0 ? null : v; }), el.name + ' ' + lab + ' radius (mm)'));
      const kCell = (s, j, lab) => h('td', null, rwNum(s.k || 0, v => rwEdit(Pd => { Pd.surfaces[idx + j].k = v; if (v) el.asphere = true; }), el.name + ' ' + lab + ' conic'));
      tb.append(h('tr', null, h('th', { scope: 'row' }, el.name),
        h('td', null, rwSelect(Object.assign(RF_MAT[mat] ? {} : { [mat]: mat }, RW_MATS()), mat, v => rwEdit(Pd => { Pd.materials[idx] = { glass: v }; }), el.name + ' material')),
        h('td', null, rwNum(el.diameter, v => rwEdit(Pd => { if (!(v > 0)) return 'A diameter must be more than 0.'; el.diameter = v; Pd.surfaces[idx].semi = Pd.surfaces[idx + 1].semi = v / 2; }), el.name + ' diameter (mm)')),
        h('td', null, rwNum(P.gaps[i0], v => rwEdit(Pd => { if (!(v > 0)) return 'A lens must be thicker than 0.'; Pd.gaps[idx] = v; }), el.name + ' centre thickness (mm)')),
        rCell(s1, 0, 'face to the feed'), kCell(s1, 0, 'face to the feed'), rCell(s2, 1, 'other face'), kCell(s2, 1, 'other face'),
        h('td', null, h('input', { type: 'checkbox', checked: matched ? '' : null, 'aria-label': el.name + ' matching layers', onchange: e => rwMatch(el, e.target.checked) })),
        airCell));
    } else {
      tb.append(h('tr', null, h('th', { scope: 'row' }, el.name), h('td', { colspan: '8', class: 'rt-lsub' }, p.kind === 'mirror' ? 'A mirror' + (P.surfaces[i0].R ? ', radius ' + rwFmt(P.surfaces[i0].R, 5) + ' mm' : ', flat') + ': its shape is in the optical designer.' : 'Edit it in the optical designer.'),
        airCell));
    }
    i0 += p.n;
  });
  tbl.append(tb);
  card.append(h('div', { class: 'rt-ltwrap' }, tbl));
  return card;
}
/* a lens's two faces matched, or not: a quarter-wave layer of index √n at the design frequency on each */
function rwMatch(el, on) {
  rwEdit(() => {
    const nm = C_NM_GHZ / RW.asm.rf.ghz, M = RF_MAT[el.materials[0].glass], n = M ? M.n : 1.5;
    el.surfaces.forEach(s => { s.coat = on ? matchLayer(n, nm) : normCoat({}); });
    return false;
  });
}

/* ---------- Design a lens from a spec ---------- */
function rwSynthCard(asm, P) {
  const card = h('section', { class: 'rt-lcard rt-rfsynth', role: 'tabpanel', 'aria-label': 'Design a lens' }, h('h3', null, 'Design a lens'));
  const lenses = P.parts.map((p, pi) => ({ p, pi })).filter(x => x.p.kind === 'lens' && x.p.n === 2);
  if (!lenses.length) { card.append(h('p', { class: 'rt-lsub' }, 'This system has no lens of two faces to design.')); return card; }
  const first = lenses[0], el0 = getEl(first.p.id);
  const sp = RW.synth = Object.assign({ pi: first.pi, type: 'hyperbolic', mat: RF_MAT[P.materials[0] && P.materials[0].glass] ? P.materials[0].glass : 'PLA', D: el0 ? el0.diameter : 100, edge: 2, place: 'keep', taper: 11, match: true }, RW.synth || {});
  if (!lenses.some(x => x.pi === sp.pi)) sp.pi = first.pi;
  card.append(h('p', { class: 'rt-lsub' }, 'A lens made to suit the beam that reaches it and the goal after it: each curved face the hyperbola that turns the beam’s phase centre into a flat wavefront in the plastic, or the flat wavefront into the waist wanted. Then refine it by hand, or in the optical designer.'));
  const set = (k, v) => { sp[k] = v; rwRender(); };
  const grid = h('div', { class: 'rt-rfgrid' },
    rwRow('Lens', rwSelect(Object.fromEntries(lenses.map(x => [String(x.pi), getEl(x.p.id).name])), String(sp.pi), v => set('pi', +v), 'Lens to design')),
    rwRow('Kind', rwSelect(RF_LENS_TYPES, sp.type, v => set('type', v), 'Lens kind')),
    rwRow('Material', rwSelect(RW_MATS(), sp.mat, v => set('mat', v), 'Lens material')),
    rwRow('Diameter (mm)', rwNum(sp.D, v => set('D', Math.max(1, v)), 'Lens diameter (mm)')),
    rwRow('Edge thickness (mm)', rwNum(sp.edge, v => set('edge', Math.max(0, v)), 'Edge thickness (mm)')),
    rwRow('Where it stands', rwSelect({ keep: 'Where it is', taper: 'For an edge taper', ...(asm.rf.goal.kind !== 'collimate' ? { match: 'Matched to the goal' } : {}) }, sp.place, v => set('place', v), 'Where it stands')),
    ...(sp.place === 'taper' ? [rwRow('Edge taper (dB)', rwNum(sp.taper, v => set('taper', Math.max(0.5, v)), 'Edge taper (dB)'))] : []),
    rwRow('Matching layers', h('input', { type: 'checkbox', checked: sp.match ? '' : null, 'aria-label': 'Matching layers on both faces', onchange: e => set('match', e.target.checked) })));
  card.append(grid);
  const out = rfSynth(asm, P, sp);
  if (out.error) { card.append(h('p', { class: 'rt-lnote warn', role: 'status' }, out.error)); return card; }
  const M = RF_MAT[sp.mat];
  card.append(h('table', { class: 'rt-ltable rt-rfsum' }, h('tbody', null,
    ...[['Face to the feed', out.s1.R === null ? 'flat' : 'R ' + rwFmt(out.s1.R, 5) + ' mm, conic ' + rwFmt(out.s1.k, 4)],
      ['Other face', out.s2.R === null ? 'flat' : 'R ' + rwFmt(out.s2.R, 5) + ' mm, conic ' + rwFmt(out.s2.k, 4)],
      ['Centre thickness', rwFmt(out.t, 4) + ' mm'],
      ['Its phase centres', 'feed side ' + rwFmt(out.F1, 5) + ' mm' + (isFinite(out.F2) ? ', far side ' + rwFmt(out.F2, 5) + ' mm' : ', far side at infinity')],
      ['Feed to the lens', rwFmt(out.feedD, 5) + ' mm' + (Math.abs(out.feedD - asm.rf.feed.d) > 1e-6 ? ' (now ' + rwFmt(asm.rf.feed.d, 5) + ')' : '')],
      ['Beam at the lens', rwFmt(out.w, 4) + ' mm, edge taper −' + out.taper.toFixed(1) + ' dB'],
      ['Index', rwFmt(M.n, 4) + ' (' + M.name + ')']].map(([a, b]) => h('tr', null, h('th', { scope: 'row' }, a), h('td', { class: 'mono' }, b))))));
  for (const n of out.notes) card.append(h('p', { class: 'rt-lnote', role: 'status' }, n));
  card.append(h('button', { class: 'rt-btn primary', type: 'button', onclick: () => rwApplySynth(out, sp) }, 'Use this lens'));
  return card;
}
function rwApplySynth(out, sp) {
  const asm = RW.asm;
  rwEdit(Pd => {
    const i = out.i0, el = getEl(Pd.surfaces[i].from.id);
    Object.assign(Pd.surfaces[i], { R: out.s1.R, k: out.s1.k, a2: 0, A: [], odd: null, semi: sp.D / 2 });
    Object.assign(Pd.surfaces[i + 1], { R: out.s2.R, k: out.s2.k, a2: 0, A: [], odd: null, semi: sp.D / 2 });
    Pd.gaps[i] = out.t; Pd.materials[i] = { glass: sp.mat };
    if (el) { el.diameter = sp.D; if (out.s1.k || out.s2.k) el.asphere = true; }
    asm.rf.feed.d = out.feedD;
  });
  // the faces' matching layers at the design frequency (on the part, after its shape is written)
  const P = designPrescription(asm), el = getEl(P.surfaces[out.i0].from.id);
  if (el) { const nm = C_NM_GHZ / asm.rf.ghz; el.surfaces.forEach(s => { s.coat = sp.match ? matchLayer(out.n, nm) : normCoat({}); }); changed(false); rwRender(); }
  toast('The lens is designed: ' + (out.s1.k ? 'hyperbolic' : 'spherical') + ', ' + rwFmt(out.t, 4) + ' mm thick at its centre.');
}

/* ---------- A new RF design, and placing one on a bench ---------- */
/* a new design: a made-to-order lens for 24 GHz, its feed 150 mm before it, collimating */
export function newRfDesign() {
  checkpoint();
  const id = 'g' + uid().slice(1), x = Math.round(V().cx), y = Math.round(V().cy);
  const lens = normElement({ type: 'lens', id: uid(), name: 'RF lens', x, y, angle: 0, diameter: 120, surfaces: [{ R: 104, k: -2.7 }, { R: null }], gaps: [30], materials: [{ glass: 'PLA' }], asphere: true, mmw: { part: true }, group: id, bench: project.tab });
  project.elements.push(lens);
  const asm = { id, name: 'New RF design', bench: project.tab, ref: lens.id, rev: false, kind: 'rf', rf: normRfCond({ ghz: 24, feed: { kind: 'corrugated', a: 15, L: 80, d: 150 }, goal: { kind: 'collimate', d: 300 } }), cond: normCond({}) };
  project.assemblies = (project.assemblies || []).concat([asm]);
  const P = designPrescription(asm);
  rfSyncCond(asm, P);
  // the lens made to suit its feed: hyperbolic, for an 11 dB edge taper
  const out = rfSynth(asm, P, { pi: 0, type: 'hyperbolic', mat: 'PLA', D: 120, edge: 2, place: 'taper', taper: 11 });
  if (!out.error) {
    Object.assign(P.surfaces[0], { R: out.s1.R, k: out.s1.k }); Object.assign(P.surfaces[1], { R: out.s2.R, k: out.s2.k }); P.gaps[0] = out.t; asm.rf.feed.d = out.feedD;
    commitDesign(asm, P);
    const nm = C_NM_GHZ / 24; lens.surfaces.forEach(s => { s.coat = matchLayer(out.n, nm); });
  }
  setSelection([lens]);
  changed(true);
  openRfDesign(asm, { draft: true });
  return asm;
}
/* on the bench: the feed horn at its distance, and at the goal a receiving horn (or an absorber load), linked to the conditions */
function rwPlace(asm) {
  const P = designPrescription(asm), R = asm.rf, dir = P.dir;
  if (!(R.feed.id && getEl(R.feed.id))) {
    const fe = normElement({ type: 'source', id: uid(), name: 'Feed horn', x: P.origin[0] - dir[0] * R.feed.d, y: P.origin[1] - dir[1] * R.feed.d, angle: Math.atan2(dir[1], dir[0]) * 180 / Math.PI, rays: 3,
      mmw: { kind: R.feed.kind, ghz: R.ghz, dbm: 0, a: R.feed.a, L: R.feed.L }, bench: asm.bench });
    project.elements.push(fe); R.feed.id = fe.id;
  }
  const A = asmAxisAt(P, rwLen(P) + 1e-9), back = Math.atan2(-A.d[1], -A.d[0]) * 180 / Math.PI;
  if (R.goal.kind === 'couple' && !(R.goal.rx.id && getEl(R.goal.rx.id))) {
    const rx = normElement({ type: 'detector', id: uid(), name: 'Receiver', x: A.p[0] + A.d[0] * R.goal.d, y: A.p[1] + A.d[1] * R.goal.d, angle: back, material: 'custom', resp: 0.5, gain: 1e4,
      mmw: { kind: R.goal.rx.kind, a: R.goal.rx.a, L: R.goal.rx.L }, bench: asm.bench });
    project.elements.push(rx); R.goal.rx.id = rx.id;
  } else if (R.goal.kind !== 'couple') {
    project.elements.push(normElement({ type: 'screen', id: uid(), name: 'Absorber load', x: A.p[0] + A.d[0] * R.goal.d, y: A.p[1] + A.d[1] * R.goal.d, angle: back, length: Math.max(50, 4 * rfBeam(R.feed, R.ghz).w0), mmw: { part: true }, bench: asm.bench }));
  }
  rwToBench(asm, P);
}
