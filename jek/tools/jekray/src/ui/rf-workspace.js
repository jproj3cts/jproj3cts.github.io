import { asmAxisAt, asmCheck, asmMembers, normCond, normRfCond } from '../core/assembly.js';
import { C_NM_GHZ, PRINTER, RF_HORNS, RF_MAT, applyRf, hornGeom, lensZones, mountVolume, mountedDia, normMount, normZoned, printedMatch, rfBeam } from '../core/rf.js';
import { lensThickness, lensVolume } from './readouts.js';
import { orderRow } from '../io/order.js';
import { lens3d } from './rf-lens3d.js';
import { applyGrin, grinDesign, grinSlab, normGrin } from '../core/grin.js';
import { openCoatDesign } from './coat-workspace.js';
import { saveDrawingSvg, saveDrawingsPdf } from './lens-drawing.js';
import { rfDrawableParts } from '../engines/lens-drawing.js';
import { V, normCoat, project, uid } from '../state/project.js';
import { getEl, normElement } from '../state/elements.js';
import { benchName } from '../state/tabs.js';
import { commitDesign, designOf, designPrescription, insertSinglet, removeSurface, surfSag, surfaceParts } from '../engines/lens-design.js';
import { RF_LENS_TYPES, RF_TOL_KINDS, rfGrinInto, rfZonesAt, normRfTol, rfMcPlan, rfSensitivity, rfYield, rfBand, rfOptProblem, rfOptStart, rfOptStep, rfOptVars, rfPattern, rfBandSweep, rfSynth, rfSyncCond } from '../engines/rf-design.js';
import { linePlot } from './lens-analyses.js';
import { helpLine, h } from './panel.js';
import { matchLayer } from './panels.js';
import { setSelection } from './render.js';
import { changed, toast } from './actions.js';
import { checkpoint, redo, undo } from './tabs.js';
import { openLensDesign } from './lens-workspace.js';
import { fmtWs } from '../core/format.js';
import { hooks } from '../core/hooks.js';

/* ==========================================================================
   The RF designer
   An assembly of RF parts (lenses and mirrors for millimetre waves) opened as a quasi-optical system: a feed
   horn's beam through them to what it is for. The conditions are the system's own: the frequency and band,
   the feed horn and how far it stands from the first lens, and the goal (collimate, focus to a waist, or into a
   receiving horn). The layout draws the beam itself, its 1/e² radius along the axis at the design frequency and
   the band's edges, and each lens's edge taper; the figures are the ones an RF designer reads (engines/
   rf-design.js). The horns on the bench the conditions were taken from follow them. The system is listed
   down the left as the beam meets it (the frequency, the feed horn, each lens, the goal); the one chosen is
   edited beside the beam, a lens by hand or made from a spec (Design this lens); the full lens data is the
   optical designer's. The steps for the whole system (Optimise, Analyses, Tolerance, Make it) are tabs.
   ========================================================================== */
let RW = null;                     // { asm, tab, sel (freq, feed, goal or a part's id), design (sel's lens being designed), draft, synth }
export const rfDesignOpen = () => !!RW;
const rwFmt = (v, p) => fmtWs(v, p || 5, 1e-9);
/* where a waist sits from the last vertex, in words rather than a signed distance */
const rwAt = v => Math.abs(v) < 1e-6 ? 'at the last face' : v < 0 ? rwFmt(-v, 4) + ' mm before the last face' : rwFmt(v, 4) + ' mm after the last face';
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
  RW = { asm, tab: 'data', sel: null, design: false, draft: !!(opts && opts.draft), synth: null };
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
    // (not for a system with a graded-index disc: the optical designer has no such part)
    h('button', { class: 'rt-btn rt-icon quiet', type: 'button', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', onclick: () => { undo(); rwAfterUndo(); } }, '↶'),
    h('button', { class: 'rt-btn rt-icon quiet', type: 'button', title: 'Redo (Ctrl+Y)', 'aria-label': 'Redo', onclick: () => { redo(); rwAfterUndo(); } }, '↷'),
    P.parts.some(p => p.kind === 'grin') ? null : h('button', { class: 'rt-btn quiet', type: 'button', title: 'The same parts in the optical lens designer: every surface, ray traces and its analyses', onclick: () => { closeRfDesign(); openLensDesign(asm, { optical: true }); } }, 'Optical designer'),
    hooks.saveParts ? h('button', { class: 'rt-btn quiet' + (hooks.proWhy() ? ' rt-off' : ''), type: 'button', id: 'rfKeep', 'aria-disabled': hooks.proWhy() ? 'true' : null, title: hooks.proWhy() || 'Keep the whole system (its lenses, with their conditions and design) as a part, in My parts or a team’s parts, to add to any bench', onclick: () => { const why = hooks.proWhy(); if (why) { toast(why, true); hooks.proFix(); } else hooks.saveParts(asmMembers(asm)); } }, 'Keep as a part…') : null,
    h('button', { class: 'rt-btn primary', type: 'button', id: 'rfLeave', title: RW.draft ? 'Put it on the bench with its feed horn, and its receiver or a load at its goal' : 'Back to the bench, where its parts and horns are as designed here (Esc)', onclick: rwLeave },
      RW.draft ? 'Place on a bench' : 'Back to the bench')));
  const body = h('div', { class: 'rt-lbody' });
  rwSelOk(P);
  body.append(rwSysList(asm, P), h('div', { class: 'rt-lmain' }, rwLayoutCard(asm, P, T), rwFigures(asm, T), rwEditor(asm, P), rwTabs(),
    RW.tab === 'ana' ? rwAnaCard(asm, P, T) : RW.tab === 'tol' ? rwTolCard(asm, P) : RW.tab === 'make' ? rwMakeCard(asm, P, T) : RW.tab === 'opt' ? rwOptCard(asm, P) : rwDataCard(asm, P)));
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
  // each graded-index disc graded for the design frequency (its least density, and its layers, follow it)
  for (const e of asmMembers(asm)) if (e.grin && e.grin.ghz !== asm.rf.ghz) { e.grin = Object.assign({}, e.grin, { ghz: asm.rf.ghz }); applyGrin(e); }
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
/* ---------- The system, down the left, as the beam meets it ---------- */
const RW_HORN_SHORT = { corrugated: 'corrugated', smooth: 'smooth-wall', diagonal: 'diagonal', gauss: 'Gaussian' };
const RW_GOAL_SHORT = { collimate: 'collimate', focus: 'focus', couple: 'into a horn' };
/* the parts in the beam's order, each with its element and its first surface */
function rwParts(P) {
  let i0 = 0;
  return P.parts.map((p, pi) => { const o = { p, pi, i0, el: getEl(p.id) }; i0 += p.n; return o; });
}
const rwIsLens = x => (x.p.kind === 'lens' || x.p.kind === 'grin') && x.p.n === 2;
/* what is chosen still there (after an undo, a part taken out): else the first lens */
function rwSelOk(P) {
  const parts = rwParts(P);
  if (['freq', 'feed', 'goal'].includes(RW.sel) || parts.some(x => x.p.id === RW.sel)) return;
  const L = parts.find(rwIsLens) || parts[0];
  RW.sel = L ? L.p.id : 'freq'; RW.design = false;
}
function rwSysList(asm, P) {
  const R = asm.rf;
  const item = (key, icon, name, sub, title) => h('button', { type: 'button', class: 'rt-rfsi' + (RW.sel === key ? ' on' : ''), 'aria-pressed': String(RW.sel === key), 'data-sel': key, title: title || null,
    onclick: () => { RW.sel = key; RW.design = false; rwRender(); } },
    h('span', { class: 'ic', 'aria-hidden': 'true' }, icon), h('span', { class: 'tx' }, h('b', null, name), h('small', { class: 'mono' }, sub)));
  const card = h('nav', { class: 'rt-lcard rt-lcond rt-rfsys', 'aria-label': 'The system' }, h('h2', null, 'The system'));
  card.append(item('freq', '≈', 'Frequency', rwFmt(R.ghz, 4) + ' GHz · ' + rwFmt(R.lo, 4) + '–' + rwFmt(R.hi, 4), 'The design frequency, and the band it is judged over'),
    item('feed', '◁', 'Feed horn', (RW_HORN_SHORT[R.feed.kind] || R.feed.kind) + ' · a ' + rwFmt(R.feed.a, 3) + ' mm', 'The horn lighting the system, and how far it stands from the first lens'),
    h('div', { class: 'rt-rfsep' }));
  for (const x of rwParts(P)) {
    const el = x.el;
    if (!el) continue;
    if (x.p.kind === 'grin') card.append(item(x.p.id, '▥', el.name, 'graded · Ø' + rwFmt(el.length, 4) + ' · f ' + rwFmt(el.grin.f, 4) + ' mm'));
    else if (rwIsLens(x)) {
      const g = P.materials[x.i0].glass;
      card.append(item(x.p.id, '()', el.name, (RF_MAT[g] ? RF_MAT[g].name.replace(/ \(.*\)$/, '') : g) + ' · Ø' + rwFmt(el.diameter, 4) + ' · ' + rwFmt(P.gaps[x.i0], 3) + ' mm' + (el.zoned ? ' · zoned' : '')));
    } else card.append(item(x.p.id, x.p.kind === 'mirror' ? '◟' : '·', el.name, x.p.kind === 'mirror' ? 'a mirror' : x.p.kind));
  }
  card.append(h('button', { type: 'button', class: 'rt-rfsi add', title: 'A lens after the last part, made to suit the beam that reaches it', onclick: rwAddLens },
    h('span', { class: 'ic', 'aria-hidden': 'true' }, '+'), h('span', { class: 'tx' }, h('b', null, 'Add a lens'), h('small', null, 'or a graded-index disc'))),
  h('div', { class: 'rt-rfsep' }),
  item('goal', '→', 'Goal', (RW_GOAL_SHORT[R.goal.kind] || R.goal.kind) + ' · ' + rwFmt(R.goal.d, 4) + ' mm on', 'What the system is for, after its last part'),
  h('div', { class: 'rt-rfsep' }),
  h('button', { class: 'rt-btn', type: 'button', title: 'The feed horn lighting it and a receiving horn after it, as they are on the bench', onclick: rwTake }, 'Take from the bench'));
  const linked = [R.feed.id && getEl(R.feed.id) ? 'the feed horn' : null, R.goal.kind === 'couple' && R.goal.rx.id && getEl(R.goal.rx.id) ? 'the receiver' : null].filter(Boolean);
  if (linked.length) card.append(h('p', { class: 'rt-lsub' }, 'On the bench, ' + linked.join(' and ') + ' follow' + (linked.length === 1 ? 's' : '') + ' the system.'));
  return card;
}

/* ---------- The one chosen, edited beside the beam ---------- */
function rwEditor(asm, P) {
  if (RW.sel === 'freq') return rwFreqCard(asm);
  if (RW.sel === 'feed') return rwFeedCard(asm);
  if (RW.sel === 'goal') return rwGoalCard(asm);
  const x = rwParts(P).find(q => q.p.id === RW.sel);
  if (x && RW.design && rwIsLens(x)) return rwSynthCard(asm, P, x);
  return rwPartCard(asm, P, x);
}
const rwCard = (title, sub, ...kids) => h('section', { class: 'rt-lcard rt-rfedit' }, h('h3', null, title), sub, ...kids);
const rwSub = t => h('p', { class: 'rt-lsub' }, t);
function rwFreqCard(asm) {
  const R = asm.rf;
  return rwCard('Frequency', rwSub('The frequency it is designed at, and the band it is judged over (the band’s edges are dashed on the beam).'),
    h('div', { class: 'rt-rfgrid' },
      rwRow('Design (GHz)', rwNum(R.ghz, v => rwCondEdit(r => { const k = v / r.ghz; r.ghz = v; r.lo *= k; r.hi *= k; }), 'Design frequency (GHz)')),
      rwRow('Band from (GHz)', rwNum(R.lo, v => rwCondEdit(r => { r.lo = v; }), 'Band from (GHz)')),
      rwRow('Band to (GHz)', rwNum(R.hi, v => rwCondEdit(r => { r.hi = v; }), 'Band to (GHz)'))));
}
function rwFeedCard(asm) {
  const R = asm.rf, fb = rfBeam(R.feed, R.ghz);
  return rwCard('Feed horn', rwSub('The horn lighting the system, and how far its aperture stands from the first lens.'),
    h('div', { class: 'rt-rfgrid' },
      rwRow('Kind', rwSelect(RW_HORN_NAMES, R.feed.kind, v => rwCondEdit(r => { r.feed.kind = v; }), 'Feed horn kind')),
      rwRow('Aperture radius (mm)', rwNum(R.feed.a, v => rwCondEdit(r => { r.feed.a = v; }), 'Feed aperture radius (mm)')),
      rwRow('Slant length (mm)', rwNum(R.feed.L, v => rwCondEdit(r => { r.feed.L = v; }), 'Feed slant length (mm)')),
      rwRow('To the first lens (mm)', rwNum(R.feed.d, v => rwCondEdit(r => { r.feed.d = v; }), 'Feed to the first lens (mm)'))),
    h('p', { class: 'rt-lsub mono' }, 'Its beam: waist ' + rwFmt(fb.w0, 4) + ' mm, ' + rwFmt(fb.dz, 3) + ' mm behind the aperture; ' + rwFmt((RF_HORNS[R.feed.kind] || RF_HORNS.corrugated).g * 100, 3) + ' % of its power Gaussian'));
}
function rwGoalCard(asm) {
  const R = asm.rf;
  const grid = h('div', { class: 'rt-rfgrid' },
    rwRow('After the last lens', rwSelect(RW_GOAL_NAMES, R.goal.kind, v => rwCondEdit(r => { r.goal.kind = v; }), 'Goal')),
    rwRow(R.goal.kind === 'couple' ? 'To the horn’s aperture (mm)' : R.goal.kind === 'focus' ? 'Waist at (mm)' : 'Shown to (mm)', rwNum(R.goal.d, v => rwCondEdit(r => { r.goal.d = v; }), 'Goal distance (mm)')));
  if (R.goal.kind === 'focus') grid.append(rwRow('Waist radius (mm)', rwNum(R.goal.w, v => rwCondEdit(r => { r.goal.w = v; }), 'Target waist radius (mm)')));
  if (R.goal.kind === 'couple') grid.append(
    rwRow('Receiver kind', rwSelect(RW_HORN_NAMES, R.goal.rx.kind, v => rwCondEdit(r => { r.goal.rx.kind = v; }), 'Receiving horn kind')),
    rwRow('Aperture radius (mm)', rwNum(R.goal.rx.a, v => rwCondEdit(r => { r.goal.rx.a = v; }), 'Receiver aperture radius (mm)')),
    rwRow('Slant length (mm)', rwNum(R.goal.rx.L, v => rwCondEdit(r => { r.goal.rx.L = v; }), 'Receiver slant length (mm)')));
  return rwCard('Goal', rwSub('What the beam is for after the last lens: sent on collimated, focused to a waist, or into a receiving horn.'), grid);
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
      // a zoned lens: its curved face stepped back by the layers taken out
      const Zl = rfZonesAt(P, i), cut = (f, y) => Zl && Zl.face === f ? Zl.k(Math.abs(y)) * Zl.dz : 0, nq = Zl ? 400 : 40;
      g.beginPath();
      for (let q = 0; q <= nq; q++) { const y = -a + 2 * a * q / nq; const z = z0 + surfSag(s, Math.abs(y)) + cut(0, y); q ? g.lineTo(X(z), Y(y)) : g.moveTo(X(z), Y(y)); }
      for (let q = nq; q >= 0; q--) { const y = -a + 2 * a * q / nq; g.lineTo(X(z1 + surfSag(b, Math.abs(y)) - cut(1, y)), Y(y)); }
      g.closePath();
      // a graded-index disc: denser at its centre, shaded so
      if (sps[i].kind === 'grin') { const gr = g.createLinearGradient(0, Y(a), 0, Y(-a)); gr.addColorStop(0, 'rgba(242,242,236,0.08)'); gr.addColorStop(0.5, 'rgba(242,242,236,0.5)'); gr.addColorStop(1, 'rgba(242,242,236,0.08)'); g.fillStyle = gr; }
      else g.fillStyle = 'rgba(242,242,236,0.28)';
      g.fill(); g.strokeStyle = '#f2f2ec'; g.lineWidth = 1.2; g.stroke();
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
      row('Beam leaving', 'waist ' + rwFmt(m.waist.w, 4) + ' mm, ' + rwAt(m.waist.at), 'The Gaussian beam the last lens sends on: its waist and where it is from the last vertex'),
      row('Divergence', rwFmt(m.theta, 3) + '° (1/e²)', 'The far-field half-angle of that Gaussian beam'));
  } else {
    items.push(row('Coupling', rwPct(m.coupling), R.goal.kind === 'couple' ? 'The beam’s Gaussian coupling to the receiving horn’s beam' : 'The beam’s coupling to a Gaussian of the target waist'),
      row('Over the band', band(t => t.coupling, rwPct)),
      row('Waist made', rwFmt(m.waist.w, 4) + ' mm, ' + rwAt(m.waist.at), 'The waist of the beam leaving the last lens, and its distance from the last vertex'),
      row('Waist wanted', rwFmt(m.target.w, 4) + ' mm, ' + rwAt(m.target.at)));
  }
  items.push(row('Efficiency', rwPct(m.eff) + ' (' + rwDb(m.eff) + ')', 'All of it: the feed’s Gaussian share, reflections, absorption, spillover' + (R.goal.kind === 'collimate' ? ' and the aperture efficiency' : ', the coupling and the receiver’s share')),
    row('Over the band', band(t => t.eff, rwPct)),
    row('Reflections', rwDb(m.refl), 'From every face: matched faces through their layer at each frequency'),
    row('Absorption', rwDb(m.absorb), 'In the lenses’ plastic, over the beam’s profile'),
    row('Spillover', rwDb(m.spill), 'Past the apertures on the way' + (R.goal.kind === 'collimate' ? ' (the last lens’s own is in its aperture efficiency)' : '')),
    row('Phase error', rwFmt(m.sigma / m.lam, 2) + ' λ RMS (' + rwDb(m.phaseEff) + ')', 'What the faces add beyond the Gaussian beam’s first order, from real rays: its RMS over the beam, and its loss exp(−(2πσ/λ)²)'),
    ...(m.shadow < 1 ? [row('Steps’ shadow', rwDb(m.shadow), 'The share of the beam that runs into a zoned lens’s step walls and is lost, from real rays')] : []));
  return h('div', { class: 'rt-lfig' }, ...items);
}
function rwTabs() {
  const tab = (id, label) => h('button', { type: 'button', role: 'tab', class: 'rt-ltab', 'aria-selected': String(RW.tab === id), onclick: () => { RW.tab = id; rwRender(); } }, label);
  return h('div', { class: 'rt-ltabs', role: 'tablist', 'aria-label': 'The whole system' }, tab('data', 'Element data'), tab('opt', 'Optimise'), tab('ana', 'Analyses'), tab('tol', 'Tolerance'), tab('make', 'Make it'));
}

/* ---------- A part of the system: its material, size and faces, and the air after it ---------- */
const RW_GRIN_MATS = () => Object.fromEntries(Object.entries(RF_MAT).filter(([, M]) => M.print).map(([k, M]) => [k, M.name]));
const RW_MATS = () => Object.fromEntries(Object.entries(RF_MAT).sort((a, b) => (b[1].print ? 1 : 0) - (a[1].print ? 1 : 0)).map(([k, M]) => [k, M.name + (M.print ? ' (made to order)' : '')]));
function rwPartCard(asm, P, x) {
  if (!x || !x.el) return rwCard('Nothing chosen', rwSub('Choose a part of the system on the left.'));
  const el = x.el, p = x.p, idx = x.i0, last = x.i0 + p.n - 1, after = last < P.surfaces.length - 1 ? P.gaps[last] : null;
  const air = after === null ? [] : [rwRow('Air after (mm)', rwNum(after, v => rwEdit(Pd => { if (v < 0) return 'A gap can’t be negative.'; Pd.gaps[last] = v; }), el.name + ' air after (mm)'))];
  const lenses = rwParts(P).filter(rwIsLens).length;
  const design = (type, label, cls, title) => h('button', { class: 'rt-btn' + (cls ? ' ' + cls : ''), type: 'button', title, onclick: () => { RW.design = true; RW.synth = Object.assign({}, RW.synth && RW.synth.pi === x.pi ? RW.synth : {}, { pi: x.pi }, type ? { type } : {}); rwRender(); } }, label);
  const remove = h('button', { class: 'rt-btn quiet danger rt-rfrm', type: 'button', disabled: rwIsLens(x) && lenses < 2 ? '' : null,
    title: rwIsLens(x) && lenses < 2 ? 'A system keeps at least one lens' : 'Take it out of the system (Undo brings it back)', onclick: () => rwRemovePart(x) }, 'Remove');
  if (p.kind === 'lens' && p.n === 2) {
    const s1 = P.surfaces[idx], s2 = P.surfaces[idx + 1], mat = P.materials[idx].glass, matched = el.surfaces.every(s => s.coat && s.coat.label === 'Matching layer');
    const rNum = (s, j, lab) => rwNum(s.R === null ? Infinity : s.R, v => rwEdit(Pd => { Pd.surfaces[idx + j].R = !isFinite(v) || Math.abs(v) > 1e9 || v === 0 ? null : v; }), el.name + ' ' + lab + ' radius (mm)');
    const kNum = (s, j, lab) => rwNum(s.k || 0, v => rwEdit(Pd => { Pd.surfaces[idx + j].k = v; if (v) el.asphere = true; }), el.name + ' ' + lab + ' conic');
    const Z = lensZones(el), zs = (on, ghz) => rwEdit(() => { if (on) el.zoned = normZoned({ ghz }); else delete el.zoned; return false; });
    return rwCard(el.name, helpLine('The front face is the one toward the feed.', ['A radius is positive with its centre beyond the face; a conic of −n² makes it the hyperbola that suits a point source. Every surface, with its aspheric terms, is in the optical designer.'], 'rt-lsub'),
      h('div', { class: 'rt-rfgrid' },
        rwRow('Material', rwSelect(Object.assign(RF_MAT[mat] ? {} : { [mat]: mat }, RW_MATS()), mat, v => rwEdit(Pd => { Pd.materials[idx] = { glass: v }; }), el.name + ' material')),
        rwRow('Diameter (mm)', rwNum(el.diameter, v => rwEdit(Pd => { if (!(v > 0)) return 'A diameter must be more than 0.'; el.diameter = v; Pd.surfaces[idx].semi = Pd.surfaces[idx + 1].semi = v / 2; }), el.name + ' diameter (mm)')),
        rwRow('Centre (mm)', rwNum(P.gaps[idx], v => rwEdit(Pd => { if (!(v > 0)) return 'A lens must be thicker than 0.'; Pd.gaps[idx] = v; }), el.name + ' centre thickness (mm)')),
        rwRow('Front radius (mm)', rNum(s1, 0, 'face to the feed')), rwRow('Front conic', kNum(s1, 0, 'face to the feed')),
        rwRow('Back radius (mm)', rNum(s2, 1, 'other face')), rwRow('Back conic', kNum(s2, 1, 'other face')),
        rwRow('Matching layers', h('span', { class: 'rt-lrow' }, h('input', { type: 'checkbox', checked: matched ? '' : null, 'aria-label': el.name + ' matching layers', onchange: e => rwMatch(el, e.target.checked) }),
          h('button', { class: 'rt-link', type: 'button', title: 'The coating design workspace on this lens’s faces: the layer’s density and thickness against the band', onclick: () => openCoatDesign({ el, holder: el.surfaces[0], label: el.name + ', both faces', ghz: RW.asm.rf.ghz, bandPct: 100 * Math.max(RW.asm.rf.ghz / RW.asm.rf.lo - 1, RW.asm.rf.hi / RW.asm.rf.ghz - 1), onUse: c => rwEdit(() => { el.surfaces.forEach(s => { s.coat = normCoat(c); }); return false; }) }) }, 'Design…'))),
        ...air),
      // cut in zones, or not: whole layers a wave deep at its zone frequency taken out where it is thick
      h('div', { class: 'rt-lchips rt-rfzone' },
        h('label', { title: 'Wherever it is thick, whole layers a wave deep at the zone frequency come out of its curved face: thinner and lighter, the same at that frequency, a narrower band' },
          h('input', { type: 'checkbox', checked: el.zoned ? '' : null, 'aria-label': el.name + ' cut in zones', onchange: e => zs(e.target.checked, (el.zoned && el.zoned.ghz) || asm.rf.ghz) }), ' Cut in zones'),
        ...(el.zoned ? [h('span', null, 'at ', rwNum(el.zoned.ghz, v => { if (v > 0) zs(true, v); }, el.name + ' zone frequency (GHz)'), ' GHz')] : []),
        h('span', { class: 'rt-lsub mono' }, Z ? (Z.steps.length ? Z.steps.length + ' step' + (Z.steps.length > 1 ? 's' : '') + ', each ' + rwFmt(Z.dz, 3) + ' mm deep, at ' + Z.steps.map(r => rwFmt(r, 3)).join(', ') + ' mm; ' + rwFmt(lensThickness(el).thickest, 3) + ' mm at its thickest' : 'thinner than one step (' + rwFmt(Z.dz, 3) + ' mm): nothing to cut') : '')),
      h('div', { class: 'rt-rfacts' }, design(null, 'Design this lens…', '', 'A lens made to suit the beam that reaches it and the goal after it'),
        design('grin', 'Make it a graded-index disc…', 'quiet', 'A flat disc graded in density instead, in the same place'), remove));
  }
  if (p.kind === 'grin') {
    // a graded-index disc: its design (its thickness and grading follow from it)
    const g = el.grin, set = (k, v) => rwEdit(Pd => { const ng = normGrin(Object.assign({}, g, { [k]: v })); if (!rfGrinInto(Pd, idx, ng, el.length)) return 'A disc of that design can’t be graded: widen its density range, or lengthen its focal length.'; el.grin = ng; applyGrin(el); });
    const G = grinSlab(g, el.length);
    return rwCard(el.name, rwSub('A flat disc, solid at its centre and less dense toward its edge: its thickness follows from its focal length, its diameter and its density range.'),
      h('div', { class: 'rt-rfgrid' },
        rwRow('Material', rwSelect(RW_GRIN_MATS(), g.mat, v => set('mat', v), el.name + ' material')),
        rwRow('Diameter (mm)', rwNum(el.length, v => rwEdit(Pd => { if (!(v > 0)) return 'A diameter must be more than 0.'; if (!rfGrinInto(Pd, idx, g, v)) return 'A disc that wide can’t be graded at this focal length.'; el.length = v; applyGrin(el); }), el.name + ' diameter (mm)')),
        rwRow('Focal length (mm)', rwNum(g.f, v => { if (!(v > 0)) return; set('f', v); }, el.name + ' focal length (mm)')),
        rwRow('Thickness (mm)', h('span', { class: 'mono rt-rfro', title: 'It follows from its focal length, diameter and density range' }, G ? rwFmt(G.T, 4) : '—')),
        rwRow('Density at the centre (%)', rwNum(g.fillMax, v => set('fillMax', v), el.name + ' density at the centre (%)')),
        rwRow('Lowest density (%)', rwNum(g.fillMin, v => set('fillMin', v), el.name + ' lowest density (%)')),
        rwRow('Matching layers', h('input', { type: 'checkbox', checked: g.match ? '' : null, 'aria-label': el.name + ' matching layers', onchange: e => set('match', e.target.checked ? true : undefined) })),
        ...air),
      h('div', { class: 'rt-rfacts' }, design(null, 'Design this disc…', '', 'A disc made to suit the beam that reaches it and the goal after it'),
        design('hyperbolic', 'Make it a lens…', 'quiet', 'A lens with curved faces instead, in the same place'), remove));
  }
  return rwCard(el.name, rwSub(p.kind === 'mirror' ? 'A mirror' + (P.surfaces[idx].R ? ', radius ' + rwFmt(P.surfaces[idx].R, 5) + ' mm' : ', flat') + ': its shape is in the optical designer.' : 'Edit it in the optical designer.'),
    h('div', { class: 'rt-rfgrid' }, ...air));
}
/* a lens added after the last part: a made-to-order plastic as wide as the lens before it, 100 mm on, then designed */
function rwAddLens() {
  checkpoint();
  const asm = RW.asm, P = designPrescription(asm), prev = rwParts(P).filter(rwIsLens).pop();
  if (!(P.image > 0)) P.image = 100;
  const made = insertSinglet(asm, P, P.surfaces.length - 1);
  if (typeof made === 'string') { toast(made, true); return; }
  const D = prev && prev.el ? (prev.el.type === 'mask' ? prev.el.length : prev.el.diameter) : 120;
  const P2 = designPrescription(asm), x = rwParts(P2).find(q => q.p.id === made.id);
  if (!x) { toast('Nothing was added.', true); return; }
  P2.materials[x.i0] = { glass: 'PLA' }; P2.gaps[x.i0] = 10; if (x.i0 > 0) P2.gaps[x.i0 - 1] = 100;
  P2.surfaces[x.i0].semi = P2.surfaces[x.i0 + 1].semi = D / 2;
  commitDesign(asm, P2);
  const el = getEl(made.id), n = rwParts(designPrescription(asm)).filter(rwIsLens).length;
  Object.assign(el, { name: 'RF lens ' + n, diameter: D, mmw: { part: true }, asphere: true });
  const P3 = designPrescription(asm);
  rfSyncCond(asm, P3); rwToBench(asm, P3);
  changed(true);
  RW.sel = el.id; RW.design = true; RW.synth = { pi: x.pi, type: 'hyperbolic', D };
  rwRender();
}
function rwRemovePart(x) {
  checkpoint();
  const asm = RW.asm, r = removeSurface(asm, designPrescription(asm), x.i0);
  if (r !== true) { toast(r, true); return; }
  const P = designPrescription(asm);
  rfSyncCond(asm, P); rwToBench(asm, P);
  RW.sel = null; RW.design = false;
  changed(true);
  rwRender();
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
function rwSynthCard(asm, P, x) {
  const el0 = x.el, dia0 = el0 ? (el0.type === 'mask' ? el0.length : el0.diameter) : 100;
  const card = h('section', { class: 'rt-lcard rt-rfedit rt-rfsynth', 'aria-label': 'Design a lens' },
    h('div', { class: 'rt-rfedhead' }, h('h3', null, 'Design ' + el0.name), h('button', { class: 'rt-btn quiet', type: 'button', onclick: () => { RW.design = false; rwRender(); } }, 'Back to ' + el0.name)));
  const g0 = P.materials[x.i0] && P.materials[x.i0].glass;
  const sp = RW.synth = Object.assign({ type: el0 && el0.grin ? 'grin' : 'hyperbolic', mat: RF_MAT[g0] ? g0 : 'PLA', D: dia0, edge: 2, place: 'keep', taper: 11, match: true, fillMax: 100, fillMin: 15 }, RW.synth && RW.synth.pi === x.pi ? RW.synth : {}, { pi: x.pi });
  const isG = sp.type === 'grin';
  if (isG && !(RF_MAT[sp.mat] && RF_MAT[sp.mat].print)) sp.mat = 'PLA';
  card.append(helpLine('A lens, or a graded-index disc, made to suit the beam and the goal.', ['A lens made to suit the beam that reaches it and the goal after it: each curved face the hyperbola that turns the beam’s phase centre into a flat wavefront in the plastic, or the flat wavefront into the waist wanted. A graded-index disc does it with a flat disc instead, solid at its centre and less dense toward its edge: its focal length is solved through its own thickness. Designing a lens as a disc, or a disc as a lens, makes the part that kind, in the same place. Then refine it by hand, or in the optical designer.'], 'rt-lsub'));
  const set = (k, v) => { sp[k] = v; rwRender(); };
  const grid = h('div', { class: 'rt-rfgrid' },
    rwRow('Kind', rwSelect(RF_LENS_TYPES, sp.type, v => set('type', v), 'Lens kind')),
    rwRow('Material', rwSelect(isG ? RW_GRIN_MATS() : RW_MATS(), sp.mat, v => set('mat', v), 'Lens material')),
    rwRow('Diameter (mm)', rwNum(sp.D, v => set('D', Math.max(1, v)), 'Lens diameter (mm)')),
    ...(isG ? [rwRow('Density at the centre (%)', rwNum(sp.fillMax, v => set('fillMax', v), 'Density at the centre (%)')), rwRow('Lowest density (%)', rwNum(sp.fillMin, v => set('fillMin', v), 'Lowest density (%)'))]
      : [rwRow('Edge thickness (mm)', rwNum(sp.edge, v => set('edge', Math.max(0, v)), 'Edge thickness (mm)')),
        rwRow('Cut in zones', h('input', { type: 'checkbox', checked: sp.zoned ? '' : null, 'aria-label': 'Cut in zones at the design frequency', onchange: e => set('zoned', e.target.checked) }))]),
    rwRow('Where it stands', rwSelect({ keep: 'Where it is', taper: 'For an edge taper', ...(asm.rf.goal.kind !== 'collimate' ? { match: 'Matched to the goal' } : {}) }, sp.place, v => set('place', v), 'Where it stands')),
    ...(sp.place === 'taper' ? [rwRow('Edge taper (dB)', rwNum(sp.taper, v => set('taper', Math.max(0.5, v)), 'Edge taper (dB)'))] : []),
    rwRow('Matching layers', h('input', { type: 'checkbox', checked: sp.match ? '' : null, 'aria-label': 'Matching layers on both faces', onchange: e => set('match', e.target.checked) })));
  card.append(grid);
  const out = rfSynth(asm, P, sp);
  if (out.error) { card.append(h('p', { class: 'rt-lnote warn', role: 'status' }, out.error)); return card; }
  const M = RF_MAT[sp.mat];
  if (out.kind === 'grin') card.append(h('table', { class: 'rt-ltable rt-rfsum' }, h('tbody', null,
    ...[['Focal length', rwFmt(out.f, 5) + ' mm (solved through its thickness)'],
      ['Thickness', rwFmt(out.t, 4) + ' mm' + (out.grin.match ? ', its matching layers with it' : '')],
      ['Index', rwFmt(out.nHi, 4) + ' at the centre to ' + rwFmt(out.nLo, 4) + ' at the edge (' + M.name + ')'],
      ['Its phase centres', 'feed side ' + rwFmt(out.F1, 5) + ' mm' + (isFinite(out.F2) ? ', far side ' + rwFmt(out.F2, 5) + ' mm' : ', far side at infinity')],
      ['Feed to the disc', rwFmt(out.feedD, 5) + ' mm' + (Math.abs(out.feedD - asm.rf.feed.d) > 1e-6 ? ' (now ' + rwFmt(asm.rf.feed.d, 5) + ')' : '')],
      ['Beam at the disc', rwFmt(out.w, 4) + ' mm, edge taper −' + out.taper.toFixed(1) + ' dB'],
      ['Weight', 'about ' + Math.round(out.grams) + ' g'],
      ['Highest frequency', rwFmt(out.ghzMax, 3) + ' GHz (design rule: its least dense structure fine against the wavelength)']].map(([a, b]) => h('tr', null, h('th', { scope: 'row' }, a), h('td', { class: 'mono' }, b))))));
  else card.append(h('table', { class: 'rt-ltable rt-rfsum' }, h('tbody', null,
    ...[['Face to the feed', out.s1.R === null ? 'flat' : 'R ' + rwFmt(out.s1.R, 5) + ' mm, conic ' + rwFmt(out.s1.k, 4)],
      ['Other face', out.s2.R === null ? 'flat' : 'R ' + rwFmt(out.s2.R, 5) + ' mm, conic ' + rwFmt(out.s2.k, 4)],
      ['Centre thickness', rwFmt(out.t, 4) + ' mm' + (sp.zoned ? rwZoneNote(out, sp) : '')],
      ['Its phase centres', 'feed side ' + rwFmt(out.F1, 5) + ' mm' + (isFinite(out.F2) ? ', far side ' + rwFmt(out.F2, 5) + ' mm' : ', far side at infinity')],
      ['Feed to the lens', rwFmt(out.feedD, 5) + ' mm' + (Math.abs(out.feedD - asm.rf.feed.d) > 1e-6 ? ' (now ' + rwFmt(asm.rf.feed.d, 5) + ')' : '')],
      ['Beam at the lens', rwFmt(out.w, 4) + ' mm, edge taper −' + out.taper.toFixed(1) + ' dB'],
      ['Index', rwFmt(M.n, 4) + ' (' + M.name + ')']].map(([a, b]) => h('tr', null, h('th', { scope: 'row' }, a), h('td', { class: 'mono' }, b))))));
  for (const n of out.notes) card.append(h('p', { class: 'rt-lnote', role: 'status' }, n));
  card.append(h('button', { class: 'rt-btn primary', type: 'button', onclick: () => rwApplySynth(out, sp) }, out.kind === 'grin' ? 'Use this disc' : 'Use this lens'));
  return card;
}
/* a part made the other kind, in its place: a lens a graded-index disc, or a disc a lens (its id, name, group, place
   and mounting kept); the prescription read again */
function rwSwapKind(asm, Pd, i, toGrin, sp, out) {
  const el = getEl(Pd.surfaces[i].from.id);
  if (!el || toGrin === (el.type === 'mask')) return el;
  const keep = { id: el.id, name: el.name, x: el.x, y: el.y, angle: el.angle, group: el.group, bench: el.bench, mmw: el.mmw, ...(el.mount ? { mount: el.mount } : {}), ...(el.z !== undefined ? { z: el.z } : {}) };
  const ne = normElement(toGrin ? Object.assign(keep, { type: 'mask', length: sp.D, grin: out.grin, name: /^RF lens/.test(el.name) ? el.name.replace(/^RF lens/, 'GRIN disc') : el.name })
    : Object.assign(keep, { type: 'lens', diameter: sp.D, surfaces: [{ R: null }, { R: null }], gaps: [out.t], materials: [{ glass: sp.mat }], asphere: true, name: /^GRIN disc/.test(el.name) ? el.name.replace(/^GRIN disc/, 'RF lens') : el.name }));
  const k = project.elements.indexOf(el);
  project.elements[k] = ne;
  Object.assign(Pd, designPrescription(asm));
  return ne;
}
function rwApplySynth(out, sp) {
  const asm = RW.asm;
  RW.design = false;
  if (out.kind === 'grin') {
    rwEdit(Pd => {
      const el = rwSwapKind(asm, Pd, out.i0, true, sp, out);
      el.grin = out.grin; el.length = sp.D; applyGrin(el);
      rfGrinInto(Pd, out.i0, out.grin, sp.D);
      asm.rf.feed.d = out.feedD;
    });
    toast('The disc is designed: focal length ' + rwFmt(out.f, 4) + ' mm, ' + rwFmt(out.t, 3) + ' mm thick.');
    return;
  }
  rwEdit(Pd => {
    rwSwapKind(asm, Pd, out.i0, false, sp, out);
    const i = out.i0, el = getEl(Pd.surfaces[i].from.id);
    Object.assign(Pd.surfaces[i], { R: out.s1.R, k: out.s1.k, a2: 0, A: [], odd: null, semi: sp.D / 2 });
    Object.assign(Pd.surfaces[i + 1], { R: out.s2.R, k: out.s2.k, a2: 0, A: [], odd: null, semi: sp.D / 2 });
    Pd.gaps[i] = out.t; Pd.materials[i] = { glass: sp.mat };
    if (el) { el.diameter = sp.D; if (out.s1.k || out.s2.k) el.asphere = true; if (sp.zoned) el.zoned = normZoned({ ghz: asm.rf.ghz }); else delete el.zoned; }
    asm.rf.feed.d = out.feedD;
  });
  // the faces' matching layers at the design frequency (on the part, after its shape is written)
  const P = designPrescription(asm), el = getEl(P.surfaces[out.i0].from.id);
  if (el) { const nm = C_NM_GHZ / asm.rf.ghz; el.surfaces.forEach(s => { s.coat = sp.match ? matchLayer(out.n, nm) : normCoat({}); }); changed(false); rwRender(); }
  toast('The lens is designed: ' + (out.s1.k ? 'hyperbolic' : 'spherical') + ', ' + rwFmt(out.t, 4) + ' mm thick at its centre.');
}

/* what cutting the designed lens in zones at the design frequency comes to */
function rwZoneNote(out, sp) {
  const Z = lensZones({ type: 'lens', zoned: { ghz: RW.asm.rf.ghz }, surfaces: [out.s1, out.s2], gaps: [out.t], materials: [{ glass: sp.mat }], diameter: sp.D });
  if (!Z) return '';
  if (!Z.steps.length) return '; thinner than one zone (' + rwFmt(Z.dz, 3) + ' mm): it stays whole';
  let tMax = 0; for (let i = 0; i <= 200; i++) tMax = Math.max(tMax, Z.t(sp.D / 2 * i / 200));
  return '; cut in ' + (Z.steps.length + 1) + ' zones, ' + rwFmt(tMax, 3) + ' mm at its thickest';
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


/* ---------- Analyses ---------- */
const RW_BAND_COLS = ['#5aa9ff', '#e0a030', '#ff7a6b'];
const rwDbOf = v => (v > 0 ? 10 * Math.log10(v) : null);
function rwAnaCard(asm, P, T) {
  const st = RW.ana || (RW.ana = { view: 'band' }), R = asm.rf, coll = R.goal.kind === 'collimate';
  const card = h('section', { class: 'rt-lcard rt-lana rt-rfana', role: 'tabpanel', 'aria-label': 'Analyses' });
  const chip = (id, label) => h('button', { type: 'button', class: 'rt-lchip', 'aria-pressed': String(st.view === id), onclick: () => { st.view = id; rwRender(); } }, label);
  card.append(h('div', { class: 'rt-lchips', role: 'group', 'aria-label': 'Analysis' }, chip('band', 'Over the band'), ...(coll ? [chip('pattern', 'Far-field pattern')] : []), chip('apert', 'Apertures'), chip('refl', 'Reflections'), chip('budget', 'Loss budget')));
  const body = h('div', { class: 'rt-lanabody' });
  card.append(body);
  if (st.view === 'pattern' && !coll) st.view = 'band';
  if (st.view === 'band') {
    const S = rfBandSweep(asm, P, 61), xs = S.map(s => s.ghz);
    const main = coll ? { label: 'Gain', colour: '#e0a030', xs, ys: S.map(s => s.gain) } : { label: 'Coupling', colour: '#e0a030', xs, ys: S.map(s => rwDbOf(s.coupling)) };
    body.append(h('p', { class: 'rt-lsub' }, coll ? 'The gain on the axis across the band and a tenth beyond each edge, and what each loss takes, in dB.' : 'The coupling to the goal across the band and a tenth beyond each edge (the S21 of the system, from the feed’s Gaussian to the goal’s), and what each loss takes, in dB.'));
    linePlot(body, { label: coll ? 'Gain against frequency' : 'Coupling against frequency', H: 220, x: { kind: 'plain', title: 'frequency, GHz' }, y: { kind: 'plain', title: coll ? 'dBi' : 'dB' }, xName: 'GHz', series: [main],
      csv: { name: asm.name + ' over the band', cols: ['GHz', coll ? 'gain_dBi' : 'coupling_dB', 'efficiency_dB', 'reflections_dB', 'absorption_dB', 'spillover_dB', 'phase_error_dB'], rows: () => S.map(s => [s.ghz, coll ? s.gain : rwDbOf(s.coupling), rwDbOf(s.eff), rwDbOf(s.refl), rwDbOf(s.absorb), rwDbOf(s.spill), rwDbOf(s.phaseEff)]) } });
    const ser = [['Efficiency, all of it', '#e0a030', s => s.eff], ['Reflections', '#5aa9ff', s => s.refl], ['Absorption', '#7ee0a1', s => s.absorb], ['Spillover', '#c38bff', s => s.spill], ['Phase error', '#ff7a6b', s => s.phaseEff], ...(coll ? [['Aperture efficiency', '#b0b8c0', s => s.apEff]] : [])];
    body.append(h('div', { class: 'rt-llegend' }, ...ser.map(([t, col]) => h('span', null, h('i', { style: '--sw:' + col, 'aria-hidden': 'true' }), t))));
    linePlot(body, { label: 'Losses against frequency', H: 220, x: { kind: 'plain', title: 'frequency, GHz' }, y: { kind: 'plain', title: 'dB' }, xName: 'GHz', series: ser.map(([label, colour, f]) => ({ label, colour, xs, ys: S.map(s => rwDbOf(f(s))) })) });
    const band = S.filter(s => s.ghz >= R.lo - 1e-9 && s.ghz <= R.hi + 1e-9), vals = band.map(s => coll ? s.gain : rwDbOf(s.coupling));
    body.append(h('p', { class: 'rt-lsub mono' }, (coll ? 'Gain over the band ' : 'Coupling over the band ') + rwFmt(Math.min(...vals), 4) + ' to ' + rwFmt(Math.max(...vals), 4) + (coll ? ' dBi' : ' dB') + ': it varies by ' + rwFmt(Math.max(...vals) - Math.min(...vals), 3) + ' dB.'));
  } else if (st.view === 'pattern') {
    const pats = [T.lo, T.mid, T.hi].map(t => rfPattern(t.apAt, t.lam, Math.min(60, 8 * Math.atan(t.lam / t.D) * 180 / Math.PI + 4)));
    const th1 = Math.max(...pats.map(p => p.th[p.th.length - 1]));
    const ps = [T.lo, T.mid, T.hi].map(t => rfPattern(t.apAt, t.lam, th1));
    body.append(helpLine('The far-field pattern of the last lens’s aperture.', ['The far field of the last lens’s aperture: the Gaussian field it carries there, with its curvature, over its round aperture, at the band’s edges and its centre, in dB against the axis. Its phase error beyond first order and any cross-polar field are not in it.'], 'rt-lsub'));
    body.append(h('div', { class: 'rt-llegend' }, ...[R.lo, R.ghz, R.hi].map((g, k) => h('span', null, h('i', { style: '--sw:' + RW_BAND_COLS[k], 'aria-hidden': 'true' }), rwFmt(g, 4) + ' GHz'))));
    linePlot(body, { label: 'Far-field pattern', H: 260, x: { kind: 'plain', title: 'angle from the axis, °' }, y: { kind: 'plain', title: 'dB' }, yr: [-50, 2], xName: '°', series: ps.map((p, k) => ({ label: rwFmt([R.lo, R.ghz, R.hi][k], 4) + ' GHz', colour: RW_BAND_COLS[k], xs: p.th, ys: p.db.map(v => Math.max(-50, v)) })),
      csv: { name: asm.name + ' pattern', cols: ['angle_deg', 'lo_dB', 'design_dB', 'hi_dB'], rows: () => ps[1].th.map((t, j) => [t, ps[0].db[j], ps[1].db[j], ps[2].db[j]]) } });
    const m = ps[1];
    body.append(h('table', { class: 'rt-ltable rt-rfsum' }, h('tbody', null, ...[['Beamwidth, half power', rwFmt(m.hpbw, 3) + '°'], ['First sidelobe', m.sidelobe === null ? 'none within ' + rwFmt(th1, 3) + '°' : rwFmt(m.sidelobe, 3) + ' dB'], ['Gain on the axis', rwFmt(T.mid.gain, 4) + ' dBi']].map(([a, b]) => h('tr', null, h('th', { scope: 'row' }, a), h('td', { class: 'mono' }, b))))));
  } else if (st.view === 'apert') {
    body.append(helpLine('The beam at each face: its radius, edge taper and spillover.', ['The beam at each face: its 1/e² radius at the band’s edges and its centre, the face’s clear radius, its edge taper and the power that passes outside it, at the design frequency.'], 'rt-lsub'));
    const tbl = h('table', { class: 'rt-ltable' });
    tbl.append(h('thead', null, h('tr', null, ...['Face', 'Beam at ' + rwFmt(R.lo, 4) + ' GHz', 'at ' + rwFmt(R.ghz, 4), 'at ' + rwFmt(R.hi, 4), 'Clear radius', 'Edge taper', 'Spilled'].map(t => h('th', { scope: 'col' }, t)))));
    const sps = surfaceParts(P), tb = h('tbody');
    T.mid.surf.forEach((s, i) => {
      const el = getEl(P.parts[sps[i].pi].id), nm = (el ? el.name : 'Part') + (P.parts[sps[i].pi].n > 1 ? (sps[i].j === 0 ? ', front' : ', back') : '');
      tb.append(h('tr', null, h('th', { scope: 'row' }, nm), ...[T.lo, T.mid, T.hi].map(t => h('td', { class: 'mono' }, rwFmt(t.surf[i].w, 4) + ' mm')), h('td', { class: 'mono' }, rwFmt(s.semi, 4) + ' mm'),
        h('td', { class: 'mono' + (s.taper < 10 ? ' warn' : '') }, isFinite(s.taper) ? '−' + s.taper.toFixed(1) + ' dB' : '—'), h('td', { class: 'mono' }, rwFmt(100 * s.spill, 3) + ' %')));
    });
    tbl.append(tb); body.append(h('div', { class: 'rt-ltwrap' }, tbl));
  } else if (st.view === 'refl') {
    const S = rfBandSweep(asm, P, 121), xs = S.map(s => s.ghz), nl = S[0].slab.length;
    body.append(helpLine('Each lens’s reflection as a slab, across the band.', ['Each lens as a slab: its two faces, their matching layers and the plastic between, the reflections added coherently, so the ripple a lens shows across a band appears (the figures above take each face alone). In dB, shown down to \u221260 dB.'], 'rt-lsub'));
    const ser = [];
    for (let k = 0; k < nl; k++) { const el = getEl(P.parts[S[0].slab[k].pi].id); ser.push({ label: el ? el.name : 'Lens ' + (k + 1), colour: RW_BAND_COLS[k % 3], xs, ys: S.map(s => rwDbOf(s.slab[k].R)) }); }
    if (!nl) body.append(h('p', { class: 'rt-lsub' }, 'No lenses.'));
    else {
      body.append(h('div', { class: 'rt-llegend' }, ...ser.map(s => h('span', null, h('i', { style: '--sw:' + s.colour, 'aria-hidden': 'true' }), s.label))));
      linePlot(body, { label: 'Reflection against frequency', H: 240, x: { kind: 'plain', title: 'frequency, GHz' }, y: { kind: 'plain', title: 'dB' }, yr: [-60, 0], xName: 'GHz', series: ser.map(q => Object.assign({}, q, { ys: q.ys.map(v => v === null ? null : Math.max(-60, v)) })),
        csv: { name: asm.name + ' reflections', cols: ['GHz', ...ser.map(s => s.label + '_dB')], rows: () => S.map((s, j) => [s.ghz, ...ser.map(q => q.ys[j])]) } });
    }
  } else {
    const m = T.mid, rows = [['Feed horn: its power in the Gaussian', m.g]];
    for (const f of m.faces) { const sp = surfaceParts(P)[f.i], el = getEl(P.parts[sp.pi].id); rows.push([f.mirror ? 'Ohmic loss, ' + (el ? el.name : 'mirror') : 'Reflection, ' + (el ? el.name : 'face') + (sp.j === 0 ? ' front' : ' back') + (f.matched ? ' (matched)' : ''), 1 - f.R]); }
    for (const l of m.lenses) { const el = getEl(P.parts[surfaceParts(P)[l.i].pi].id); rows.push(['Absorption, ' + (el ? el.name : 'lens') + ' (' + l.mat + ')', l.T]); }
    rows.push(['Spillover on the way', m.spill], ['Phase error, ' + rwFmt(m.sigma / m.lam, 2) + ' λ RMS', m.phaseEff]);
    if (m.shadow < 1) rows.push(['Shadow of the zones’ steps', m.shadow]);
    if (coll) rows.push(['Aperture efficiency of the last lens', m.apEff]);
    else { rows.push(['Coupling to the goal’s beam', m.coupling]); if (R.goal.kind === 'couple') rows.push(['Receiving horn: the share its mode takes', m.gRx]); }
    rows.push(['All of it', m.eff]);
    body.append(h('p', { class: 'rt-lsub' }, 'Where the power goes, at ' + rwFmt(R.ghz, 4) + ' GHz: each factor the efficiency is the product of.'));
    body.append(h('table', { class: 'rt-ltable rt-rfsum' }, h('tbody', null, ...rows.map(([a, v], k) => h('tr', { class: k === rows.length - 1 ? 'rt-rftotal' : '' }, h('th', { scope: 'row' }, a), h('td', { class: 'mono' }, rwPct(v)), h('td', { class: 'mono' }, rwDb(v)))))));
    if (coll) body.append(h('p', { class: 'rt-lsub mono' }, 'Gain ' + rwFmt(m.gain, 4) + ' dBi = ' + rwFmt(10 * Math.log10((Math.PI * m.D / m.lam) ** 2), 4) + ' dBi for a uniform ' + rwFmt(m.D, 4) + ' mm aperture, ' + rwDb(m.eff) + '.'));
  }
  return card;
}

/* ---------- Optimise ---------- */
let RW_OPT = null;           // { asm, prob, st, running, note }
/* the optimiser's settings on the assembly: the variables (keys from rfOptVars; to start, each lens's radii and front conic) and its bounds */
function rwOptSpec(asm, P) {
  // the one object, kept: the V buttons hold it between renders
  const o = asm.rfOpt || (asm.rfOpt = {});
  for (const [k, v] of Object.entries({ keys: null, flat: 0, edgeMin: 1, tMax: 0 })) if (o[k] === undefined) o[k] = v;
  const vars = rfOptVars(P);
  if (!o.keys) o.keys = vars.filter(v => v.label === 'Front radius' || v.label === 'Back radius' || v.label === 'Front conic').map(v => v.key);
  o.keys = o.keys.filter(k => vars.some(v => v.key === k));
  return { o, vars };
}
/* the variables chosen, named: 'front radius of RF lens, feed to the first lens' */
function rwVarNames(asm, P) {
  const { o, vars } = rwOptSpec(asm, P);
  return o.keys.map(k => { const v = vars.find(q => q.key === k), el = v && v.part ? getEl(v.part) : null; return v ? v.label.toLowerCase() + (el ? ' of ' + el.name : '') : k; });
}
/* the V beside a value in Element data: a variable the optimiser may change, or fixed */
function rwVarBtn(asm, P, key, label) {
  const { o, vars } = rwOptSpec(asm, P), on = o.keys.includes(key), running = RW_OPT && RW_OPT.running && RW_OPT.asm === asm;
  return h('button', { type: 'button', class: 'rt-lv', 'aria-pressed': String(on), disabled: running ? '' : null, 'aria-label': (on ? 'Fix ' : 'Vary ') + label,
    title: on ? 'A variable: Optimise may change it. Click to fix it.' : 'Click to let Optimise change it.',
    onclick: () => { checkpoint(); const s2 = new Set(o.keys); if (on) s2.delete(key); else s2.add(key); o.keys = vars.map(q => q.key).filter(k => s2.has(k)); changed(false); rwRender(); } }, 'V');
}
/* ---------- Element data: every surface of the system in a table, as the optical designer's lens data ----------
   Each value typed here changes the part on the bench (Undo takes it back); the V beside a value makes it a variable
   for Optimise. The feed horn's distance comes first and the goal last, as the object and image do. */
function rwDataCard(asm, P) {
  const card = h('section', { class: 'rt-lcard rt-ldata rt-rfdata', role: 'tabpanel', 'aria-label': 'Element data' });
  const R = asm.rf, parts = rwParts(P), sps = surfaceParts(P), N = P.surfaces.length;
  const mono = (t, title) => h('td', { class: 'mono ro', title: title || null }, t);
  const cell = (inp, vb) => h('td', { class: 'rt-lval' }, h('div', { class: 'rt-lcell' }, inp, vb || null));
  const tbl = h('table', { class: 'rt-ltable' });
  tbl.append(h('thead', null, h('tr', null, ...['', 'Surface', 'Radius (mm)', 'Conic', 'Thickness (mm)', 'Material', 'Clear radius (mm)'].map(t => h('th', { scope: 'col' }, t)))));
  const tb = h('tbody');
  // the feed: its distance to the first surface is the first thickness
  tb.append(h('tr', { class: 'obj' }, h('td', { class: 'n' }, 'FEED'), h('td', { class: 'nm' }, 'Feed horn'), mono('—'), mono(''),
    cell(rwNum(R.feed.d, v => rwEdit((Pd, a) => { if (!(v > 0)) return 'The feed stands before the first lens.'; a.rf.feed.d = v; return false; }), 'Feed to the first surface (mm)'), rwVarBtn(asm, P, 'feed', 'feed to the first lens')),
    mono('Air'), mono(rwFmt(R.feed.a, 4), 'The horn’s aperture radius')));
  for (let i = 0; i < N; i++) {
    const s = P.surfaces[i], sp = sps[i], x = parts[sp.pi], el = x.el, p = x.p, first = sp.j === 0, last = sp.j === p.n - 1, lastAll = i === N - 1;
    const tr = h('tr', { class: RW.sel === p.id ? 'sel' : '', 'aria-selected': String(RW.sel === p.id) });
    tr.addEventListener('click', e => { if (e.target.closest('input,button,select')) return; RW.sel = p.id; RW.design = false; rwRender(); });
    const name = el ? el.name : p.id, face = p.n === 2 ? (first ? ', front' : ', back') : '', side = first ? 'front' : 'back';
    tr.append(h('td', { class: 'n' }, String(i + 1)), h('td', { class: 'nm' }, name + face));
    // radius and conic: a lens's typed and varied; a mirror's read; a disc's faces are flat, its focal length the design
    if (p.kind === 'lens' && p.n === 2) {
      tr.append(cell(rwNum(s.R === null ? Infinity : s.R, v => rwEdit(Pd => { Pd.surfaces[i].R = !isFinite(v) || Math.abs(v) > 1e9 || v === 0 ? null : v; }), name + ' ' + side + ' radius (mm)'), rwVarBtn(asm, P, 'c:' + i, side + ' radius of ' + name)));
      tr.append(cell(rwNum(s.k || 0, v => rwEdit(Pd => { Pd.surfaces[i].k = v; if (v && el) el.asphere = true; }), name + ' ' + side + ' conic'), rwVarBtn(asm, P, 'k:' + i, side + ' conic of ' + name)));
    } else if (p.kind === 'grin' && first && el && el.grin) {
      tr.append(cell(h('span', { class: 'mono' }, 'f = ', rwNum(el.grin.f, v => rwEdit(Pd => { if (!(v > 0)) return 'A focal length is more than 0.'; const ng = normGrin(Object.assign({}, el.grin, { f: v })); if (!rfGrinInto(Pd, i, ng, el.length)) return 'A disc of that focal length can’t be graded.'; el.grin = ng; applyGrin(el); }), name + ' focal length (mm)')), rwVarBtn(asm, P, 'p:' + i, 'focal length of ' + name)),
        mono('flat', 'A graded disc’s faces are flat: its power is in its grading'));
    } else if (p.kind === 'mirror') {
      tr.append(mono(s.R === null ? 'Flat' : rwFmt(s.R, 5), 'Set on the bench: a mirror is not varied here'), mono(s.k ? rwFmt(s.k, 4) : ''));
    } else tr.append(mono('Flat'), mono(''));
    // thickness: inside a lens its centre; after a part the air to the next, or to the goal
    if (p.kind === 'lens' && p.n === 2 && first) tr.append(cell(rwNum(P.gaps[i], v => rwEdit(Pd => { if (!(v > 0)) return 'A lens must be thicker than 0.'; Pd.gaps[i] = v; }), name + ' centre thickness (mm)'), rwVarBtn(asm, P, 't:' + i, 'centre thickness of ' + name)));
    else if (p.kind === 'grin' && first) tr.append(mono(rwFmt(P.gaps[i], 5), 'The disc’s thickness follows its design'));
    else if (last && !lastAll) tr.append(cell(rwNum(P.gaps[i], v => rwEdit(Pd => { if (!(v >= 0)) return 'A gap is 0 or more.'; Pd.gaps[i] = v; }), 'Air after ' + name + ' (mm)'), rwVarBtn(asm, P, 't:' + i, 'air after ' + name)));
    else if (lastAll) tr.append(mono(rwFmt(R.goal.d, 5), 'To the goal: set on the goal’s own page'));
    else tr.append(mono(''));
    // the material after this surface
    if (p.kind === 'lens' && p.n === 2 && first) {
      const mat = P.materials[i].glass;
      tr.append(h('td', null, rwSelect(Object.assign(RF_MAT[mat] ? {} : { [mat]: mat }, RW_MATS()), mat, v => rwEdit(Pd => { Pd.materials[i] = { glass: v }; }), name + ' material')));
    } else if (p.kind === 'grin' && first) tr.append(mono((RF_MAT[P.materials[i].glass] || {}).name || P.materials[i].glass, 'Graded in density from the axis'));
    else if (p.kind === 'mirror') tr.append(mono('Mirror'));
    else tr.append(mono('Air'));
    tr.append(mono(rwFmt(s.semi, 5), p.kind === 'mirror' ? 'Half the mirror’s length' : 'Half the diameter: set on the part’s own page'));
    tb.append(tr);
  }
  const g = R.goal;
  tb.append(h('tr', { class: 'obj' }, h('td', { class: 'n' }, 'GOAL'), h('td', { class: 'nm' }, g.kind === 'collimate' ? 'Collimated beam' : g.kind === 'focus' ? 'Waist' : 'Receiving horn'), mono('—'), mono(''), mono(''), mono('Air'),
    mono(g.kind === 'couple' ? rwFmt(g.rx.a, 4) : g.kind === 'focus' ? rwFmt(g.w, 4) : '', g.kind === 'couple' ? 'The receiving horn’s aperture radius' : g.kind === 'focus' ? 'The waist radius wanted' : null)));
  tbl.append(tb);
  card.append(h('div', { class: 'rt-ltwrap' }, tbl));
  const named = rwVarNames(asm, P);
  card.append(h('p', { class: 'rt-lsub' }, 'Each value typed here changes the part on the bench (Undo takes it back). ', h('b', null, 'V'), ' marks a value Optimise may change: ' + (named.length ? named.join(', ') : 'none yet') + '.'));
  return card;
}
function rwOptCard(asm, P) {
  const card = h('section', { class: 'rt-lcard rt-rfopt', role: 'tabpanel', 'aria-label': 'Optimise' }, h('h3', null, 'Optimise'));
  const { o } = rwOptSpec(asm, P);
  card.append(helpLine('The values marked V in Element data, changed for the most efficiency across the band.', ['The values marked V in Element data are changed to make the system’s efficiency (to collimate, its gain) as high as it can be at five frequencies across the band, with every loss and the faces’ phase error from real rays counted. Each lens keeps its edge and the air between parts stays open.'], 'rt-lsub'));
  const running = RW_OPT && RW_OPT.running && RW_OPT.asm === asm;
  // the variables, as chosen in Element data
  const named = rwVarNames(asm, P);
  card.append(h('p', { class: 'rt-lsub rt-rfvarlist' }, h('b', null, 'Varying: '), named.length ? named.join(', ') + '.' : 'nothing yet.', ' ',
    h('button', { class: 'rt-link', type: 'button', disabled: running ? '' : null, onclick: () => { RW.tab = 'data'; rwRender(); } }, 'Choose in Element data')));
  card.append(h('div', { class: 'rt-rfgrid' },
    rwRow('Flat across the band', rwSelect({ 0: 'Not asked', 0.5: 'Somewhat', 2: 'Strongly' }, String(o.flat), v => { o.flat = +v; rwRender(); }, 'Flat across the band')),
    rwRow('Thinnest edge (mm)', rwNum(o.edgeMin, v => { o.edgeMin = Math.max(0, v); rwRender(); }, 'Thinnest edge (mm)')),
    rwRow('Thickest centre (mm, 0 for none)', rwNum(o.tMax, v => { o.tMax = Math.max(0, v); rwRender(); }, 'Thickest centre (mm)'))));
  const btn = h('button', { class: 'rt-btn primary', type: 'button', disabled: !o.keys.length ? '' : null, onclick: () => running ? rwOptStop('Stopped.') : rwOptGo(asm) }, running ? 'Stop' : 'Optimise');
  card.append(h('div', { class: 'rt-lchips' }, btn));
  if (RW_OPT && RW_OPT.asm === asm) {
    const S = RW_OPT.st;
    card.append(h('p', { class: 'rt-lnote' + (RW_OPT.running ? '' : ' good'), role: 'status' }, (RW_OPT.running ? 'Optimising… ' : RW_OPT.note + ' ') + S.iter + ' step' + (S.iter === 1 ? '' : 's') + '; mean efficiency over the band ' + rwPct(RW_OPT.mean0) + ' → ' + rwPct(S.mean) + (RW_OPT.running ? '' : '. Undo takes it back.')));
  }
  return card;
}
function rwOptGo(asm) {
  const P = designPrescription(asm), o = asm.rfOpt;
  const prob = rfOptProblem(asm, P, { keys: o.keys, flat: o.flat, edgeMin: o.edgeMin, tMax: o.tMax });
  const st = rfOptStart(prob);
  RW_OPT = { asm, prob, st, running: true, mean0: st.mean, note: '' };
  rwRender();
  const tick = () => {
    if (!RW_OPT || !RW_OPT.running) return;
    const t0 = performance.now();
    while (performance.now() - t0 < 60 && !RW_OPT.st.done && RW_OPT.st.iter < 200) RW_OPT.st = rfOptStep(prob, RW_OPT.st);
    if (RW_OPT.st.done || RW_OPT.st.iter >= 200) { rwOptStop(RW_OPT.st.done ? 'Done.' : 'Stopped after 200 steps.'); return; }
    rwRender(); setTimeout(tick, 0);
  };
  setTimeout(tick, 0);
}
/* the run ended: its values into the design, as one change */
function rwOptStop(note) {
  if (!RW_OPT || !RW_OPT.running) return;
  const R = RW_OPT; R.running = false; R.note = note;
  const c = R.prob.at(R.st.x);
  if (RW && RW.asm === R.asm && R.st.mean > R.mean0) {
    rwEdit((Pd, asm) => {
      R.prob.keys.forEach(k => {
        if (k === 'feed') { asm.rf.feed.d = c.asm.rf.feed.d; return; }
        const [q, i] = k.split(':'), j = +i;
        if (q === 'p') { Pd.surfaces[j] = c.P.surfaces[j]; Pd.surfaces[j + 1] = c.P.surfaces[j + 1]; Pd.gaps[j] = c.P.gaps[j]; Pd.materials[j] = c.P.materials[j]; return; }
        if (q === 'c' || q === 'k') { Pd.surfaces[j].R = c.P.surfaces[j].R; Pd.surfaces[j].k = c.P.surfaces[j].k; if (q === 'k' && c.P.surfaces[j].k) { const el = getEl(Pd.surfaces[j].from.id); if (el) el.asphere = true; } }
        else Pd.gaps[j] = c.P.gaps[j];
      });
    });
  } else if (RW) { R.note = note + ' No better design found.'; rwRender(); }
}


/* ---------- Make it: each lens checked against what can be made, and its quote ---------- */
function rwMakeCard(asm, P, T) {
  const R = asm.rf, card = h('section', { class: 'rt-lcard rt-rfmake', role: 'tabpanel', 'aria-label': 'Make it' }, h('h3', null, 'Make it'));
  card.append(helpLine('Each lens checked against what can be made, then quoted.', ['Each lens checked against what can be made to order: its plastic, its size and thinnest point, and its matching layers across the band. A lens that passes can be quoted for: the request goes into your quote cart with its figures and a link to the design.'], 'rt-lsub'));
  const coll = R.goal.kind === 'collimate', perf = coll ? 'gain ' + rwFmt(T.mid.gain, 4) + ' dBi' : 'coupling ' + rwPct(T.mid.coupling);
  P.parts.forEach((p, pi) => {
    if (p.kind !== 'lens' && p.kind !== 'grin') return;
    const el = getEl(p.id); if (!el) return;
    const box = h('div', { class: 'rt-rflens' }, h('h4', null, el.name));
    const lamMin = C_NM_GHZ / R.hi * 1e-6, dia = el.grin ? el.length : el.diameter;
    const pIdx = surfaceParts(P).findIndex(sp => sp.pi === pi), taper = Math.min(T.lo.surf[pIdx].taper, T.mid.surf[pIdx].taper, T.hi.surf[pIdx].taper);
    const { M, geo, outside, grams, checks } = el.grin ? rwMakeGrin(el, R) : rwMakeLens(el, R);
    const advice = [];
    if (dia / lamMin < 5) advice.push('Only ' + (dia / lamMin).toFixed(1) + ' wavelengths across at the top of the band: the Gaussian-beam figures are rough at this size.');
    if (taper < 10) advice.push('Its edge taper is ' + taper.toFixed(1) + ' dB at worst across the band: the light past its rim is lost and its edge diffracts.');
    const ok = checks.every(c => c[0]);
    const list = h('ul', { class: 'rt-rfchecks' }, ...checks.map(([pass, what, why]) => h('li', { class: pass ? 'ok' : 'bad' }, h('span', { class: 'mark', 'aria-hidden': 'true' }, pass ? '✓' : '✗'), h('b', null, what), ' ', h('span', { class: 'rt-lsub' }, why))));
    // the checks and figures on the left, the lens in 3D beside them: a look at what will be made
    const left = h('div', null, h('p', { class: 'rt-rfverdict ' + (ok ? 'ok' : 'bad') }, ok ? 'Manufacturable' : 'Not manufacturable as it is'), list,
      h('table', { class: 'rt-ltable rt-rfsum' }, h('tbody', null, ...[['Material', M ? M.name + (el.grin ? ', graded' : '') : '—'], ...(el.grin ? [['Thickness', rwFmt(geo.centre, 4) + ' mm (flat)'], ['Focal length', rwFmt(el.grin.f, 5) + ' mm']] : [['Centre thickness', rwFmt(geo.centre, 4) + ' mm'], ['Edge thickness', rwFmt(geo.edge, 4) + ' mm']]),
        ['Weight', isFinite(grams) ? 'about ' + Math.round(grams) + ' g' : '—'], ['Outside diameter', rwFmt(outside, 4) + ' mm']].map(([a, b]) => h('tr', null, h('th', { scope: 'row' }, a), h('td', { class: 'mono' }, b))))));
    box.append(h('div', { class: 'rt-rftop' }, left, h('figure', { class: 'rt-rf3dfig' }, lens3d(el), h('figcaption', { class: 'rt-lsub' }, 'As it would be made' + (el.mount ? ', with its flange' : '') + ': drag to turn it.'))));
    for (const a of advice) box.append(h('p', { class: 'rt-lnote' }, a));
    // its mounting: a flange with bolt holes, or none
    const m = el.mount, mset = (k, v) => rwEdit(() => { el.mount = normMount(Object.assign({ kind: 'flange' }, el.mount || {}, { [k]: v })); return false; });
    box.append(h('div', { class: 'rt-rfgrid' },
      rwRow('Mounting', rwSelect({ none: 'None', flange: 'Flange with bolt holes' }, m ? 'flange' : 'none', v => rwEdit(() => { el.mount = v === 'flange' ? normMount({ kind: 'flange' }) : undefined; return false; }), el.name + ' mounting')),
      ...(m ? [rwRow('Flange width (mm)', rwNum(m.width, v => mset('width', v), el.name + ' flange width (mm)')), rwRow('Flange thickness (mm)', rwNum(m.thick, v => mset('thick', v), el.name + ' flange thickness (mm)')),
        rwRow('Bolt holes', rwNum(m.holes, v => mset('holes', v), el.name + ' bolt holes')), rwRow('Hole diameter (mm)', rwNum(m.hole, v => mset('hole', v), el.name + ' hole diameter (mm)'))] : [])));
    // its drawing, for the customer's own records and mechanical design: not a file to make it from
    const di = rfDrawableParts(P).indexOf(pi);
    box.append(h('div', { class: 'rt-lchips rt-rffiles' }, h('span', { class: 'rt-lsub' }, 'Its design drawing:'),
      h('button', { type: 'button', class: 'rt-btn', disabled: di < 0 ? '' : null, title: 'Its drawing on an A4 sheet: the lens in section with its dimensions, each face\u2019s radius, conic and tolerance, its plastic and thickness', onclick: () => saveDrawingsPdf(asm, di) }, 'Drawing (PDF)'),
      h('button', { type: 'button', class: 'rt-btn', disabled: di < 0 ? '' : null, onclick: () => saveDrawingSvg(asm, di) }, 'Drawing (SVG)')));
    if (ok) {
      const row = orderRow(el, { ghz: R.ghz, extra: ['Designed in the RF designer for ' + rwFmt(R.lo, 4) + ' to ' + rwFmt(R.hi, 4) + ' GHz: ' + perf + ' at ' + rwFmt(R.ghz, 4) + ' GHz, the feed ' + rwFmt(R.feed.d, 4) + ' mm before it'] });
      if (row) box.append(row);
    } else box.append(h('p', { class: 'rt-lnote' }, 'Put right what is marked and the quote button appears here.'));
    card.append(box);
  });
  if (!P.parts.some(p => p.kind === 'lens' || p.kind === 'grin')) card.append(h('p', { class: 'rt-lsub' }, 'This system has no lenses to make.'));
  return card;
}

/* what a lens comes to, made: its plastic, size, thicknesses and weight, and the checks against what can be made */
function rwMakeLens(el, R) {
  const mats = el.materials.filter(m => m.glass !== 'AIR'), M = mats.length && RF_MAT[mats[0].glass];
  const geo = lensThickness(el), outside = mountedDia(el.diameter, el.mount), grams = M ? (lensVolume(el) + mountVolume(el.diameter, el.mount)) / 1000 * (M.density || 1.2) : NaN;
  const skins = M ? el.surfaces.map(s => printedMatch(M, s.coat)).filter(Boolean) : [];
  const skinMax = skins.length ? Math.min(...skins.map(k => k.ghzMax)) : Infinity, Z = lensZones(el);
  return { M, geo, outside, grams, checks: [
    [!!(M && M.print), 'A made-to-order plastic', M ? (M.print ? M.name : M.name + ' is not one we print: PLA, ABS, PETG, ASA or polypropylene are') : 'Its material is not an RF plastic'],
    [outside <= PRINTER.maxDia, 'Fits across', rwFmt(outside, 4) + ' mm' + (el.mount ? ' with its flange' : '') + ', up to ' + PRINTER.maxDia + ' mm'],
    [geo.thickest <= PRINTER.maxHeight, 'Fits in height', rwFmt(geo.thickest, 4) + ' mm thick, up to ' + PRINTER.maxHeight + ' mm'],
    [geo.thinnest >= PRINTER.minWall, 'Thick enough everywhere', 'thinnest ' + rwFmt(geo.thinnest, 3) + ' mm, at least ' + PRINTER.minWall + ' mm'],
    [skins.every(k => k.ok), 'Matching layers can be printed', skins.length ? skins.map(k => (+k.fill.toFixed(0)) + '% dense, ' + k.thick.toFixed(2) + ' mm').join('; ') : 'bare faces'],
    [skinMax >= R.hi * 0.9995, 'Holds to the top of the band', skins.length ? 'its layers by the design rule up to ' + rwFmt(skinMax, 4) + ' GHz; the band to ' + rwFmt(R.hi, 4) + ' GHz' : 'solid plastic throughout'],
    ...(Z ? [[true, 'Cut in zones', Z.steps.length ? (Z.steps.length + 1) + ' zones for ' + rwFmt(Z.ghz, 4) + ' GHz, steps ' + rwFmt(Z.dz, 3) + ' mm deep in its ' + (Z.face ? 'back' : 'front') + ' face' : 'thinner than one step: whole']] : []),
  ] };
}
/* the same for a graded-index disc: its density range, and the frequency its least dense part holds to */
function rwMakeGrin(el, R) {
  const D = grinDesign(el.grin, el.length), M = D.M, outside = mountedDia(el.length, el.mount);
  const T = D.usable ? D.tTot : NaN, geo = { centre: T, edge: T, thickest: T, thinnest: T };
  const grams = D.usable ? D.grams + mountVolume(el.length, el.mount) / 1000 * (M.density || 1.2) : NaN;
  return { M, geo, outside, grams, checks: [
    [D.usable, 'Its density can be graded', D.usable ? Math.round(D.fillHi) + '% dense at the centre to ' + Math.round(D.fillLo) + '% at the edge' : 'its density range leaves nothing to grade at ' + rwFmt(el.grin.ghz, 4) + ' GHz'],
    [outside <= PRINTER.maxDia, 'Fits across', rwFmt(outside, 4) + ' mm' + (el.mount ? ' with its flange' : '') + ', up to ' + PRINTER.maxDia + ' mm'],
    [D.usable && T <= PRINTER.maxHeight, 'Fits in height', rwFmt(T, 4) + ' mm thick, up to ' + PRINTER.maxHeight + ' mm'],
    [D.usable && D.ghzMax >= R.hi * 0.9995, 'Holds to the top of the band', 'by the design rule up to ' + rwFmt(D.ghzMax, 4) + ' GHz; the band to ' + rwFmt(R.hi, 4) + ' GHz'],
    [true, 'Matching layers', D.match ? (D.rMatch >= D.a - 0.05 ? 'matched across the whole disc' : 'fully matched out to ' + rwFmt(D.rMatch, 3) + ' mm, partly beyond (the least density that can be made)') : 'bare faces'],
  ] };
}

/* ---------- Tolerance ---------- */
let RW_MC = null;             // { asm, plan, running }
function rwTolCard(asm, P) {
  const tol = asm.rfTol = normRfTol(asm.rfTol), R = asm.rf, coll = R.goal.kind === 'collimate', unit = coll ? 'dBi' : 'dB', fig = coll ? 'gain' : 'efficiency';
  const card = h('section', { class: 'rt-lcard rt-rftol', role: 'tabpanel', 'aria-label': 'Tolerance' }, h('h3', null, 'Tolerance'));
  card.append(helpLine('Each error alone (Sensitivity) and all together (Monte Carlo), with the yield.', ['How far each error may go, and what it does to the ' + fig + ': each alone at its limit (Sensitivity), and all at once in many builds (Monte Carlo), with the share that meet a specification. A printed plastic’s permittivity is known to a few per cent until measured. Errors across the axis (a lens decentred or tilted, the feed moved sideways) are not here: the RF lens’s own panel on the bench traces them.'], 'rt-lsub'));
  const st = RW.tolSt || (RW.tolSt = {});
  // a change to the errors makes the results stale; to the Monte Carlo's settings, only its builds (the specification, nothing)
  const set = (fn, what) => { const t = JSON.parse(JSON.stringify(asm.rfTol)); fn(t); asm.rfTol = normRfTol(t); if (what !== 'mc' && what !== 'spec') st.sens = null; if (what !== 'spec' && RW_MC && RW_MC.asm === asm && !RW_MC.running) RW_MC = null; rwRender(); };
  const tbl = h('table', { class: 'rt-ltable rt-rftolk' });
  tbl.append(h('thead', null, h('tr', null, ...['', 'Error', 'Within ±', ''].map(t => h('th', { scope: 'col' }, t)))));
  const tb = h('tbody');
  for (const [k, d] of Object.entries(RF_TOL_KINDS)) tb.append(h('tr', null,
    h('td', null, h('input', { type: 'checkbox', checked: tol[k].on ? '' : null, 'aria-label': d.label + ' on', onchange: e => set(t => { t[k].on = e.target.checked; }) })),
    h('th', { scope: 'row' }, d.label), h('td', null, rwNum(tol[k].v, v => set(t => { t[k].v = Math.max(0, v); }), d.label + ' within (' + d.unit + ')')), h('td', { class: 'rt-lsub' }, d.unit)));
  tbl.append(tb); card.append(h('div', { class: 'rt-ltwrap' }, tbl));
  // sensitivity
  card.append(h('div', { class: 'rt-lchips' }, h('button', { type: 'button', class: 'rt-btn', onclick: () => { st.sens = rfSensitivity(asm, designPrescription(asm), asm.rfTol); rwRender(); } }, 'Sensitivity')));
  if (st.sens) {
    const S = st.sens, t2 = h('table', { class: 'rt-ltable' });
    t2.append(h('thead', null, h('tr', null, ...['Error', 'Within ±', 'Its ' + fig + ', +', '−', 'Worse by'].map(t => h('th', { scope: 'col' }, t)))));
    const b2 = h('tbody');
    for (const r of S.rows) b2.append(h('tr', null, h('th', { scope: 'row' }, r.label), h('td', { class: 'mono' }, rwFmt(r.v, 3) + ' ' + RF_TOL_KINDS[r.kind].unit), h('td', { class: 'mono' }, (r.up >= 0 ? '+' : '') + r.up.toFixed(3) + ' dB'), h('td', { class: 'mono' }, (r.dn >= 0 ? '+' : '') + r.dn.toFixed(3) + ' dB'), h('td', { class: 'mono' + (r.worst < -0.5 ? ' warn' : '') }, Math.max(0, -r.worst).toFixed(3) + ' dB')));
    t2.append(b2);
    card.append(h('p', { class: 'rt-lsub mono' }, 'Nominal ' + fig + ' at ' + rwFmt(R.ghz, 4) + ' GHz: ' + rwFmt(S.nominal, 4) + ' ' + unit + '. Worst first.'), h('div', { class: 'rt-ltwrap' }, t2));
  }
  // Monte Carlo
  card.append(h('h3', null, 'Monte Carlo'), h('div', { class: 'rt-rfgrid' },
    rwRow('Builds', rwNum(tol.trials, v => set(t => { t.trials = v; }, 'mc'), 'Builds')),
    rwRow('Errors drawn', rwSelect({ uniform: 'Evenly within their limits', normal: 'Normally, limits at 2σ' }, tol.dist, v => set(t => { t.dist = v; }, 'mc'), 'Errors drawn')),
    rwRow('Specification: at least (' + unit + ')', rwNum(tol.spec, v => set(t => { t.spec = v; }, 'spec'), 'Specification (' + unit + ')'))));
  const mc = RW_MC && RW_MC.asm === asm ? RW_MC : null, running = !!(mc && mc.running);
  card.append(h('div', { class: 'rt-lchips' }, h('button', { type: 'button', class: 'rt-btn primary', onclick: () => running ? rwMcStop() : rwMcGo(asm) }, running ? 'Stop' : 'Run Monte Carlo')));
  if (mc) {
    const B = mc.plan.builds, n = B.length;
    card.append(h('p', { class: 'rt-lsub', role: 'status' }, (running ? 'Building… ' : '') + n + ' of ' + mc.plan.tol.trials + ' builds.'));
    if (n >= 5) {
      const worst = B.map(b => b.worst).sort((a, b) => a - b), at = B.map(b => b.at).sort((a, b) => a - b), q = (A, p) => A[Math.min(A.length - 1, Math.max(0, Math.floor(p * (A.length - 1))))];
      const mean = A => A.reduce((a, b) => a + b, 0) / A.length;
      card.append(h('table', { class: 'rt-ltable rt-rfsum' }, h('tbody', null, ...[
        ['Nominal, at ' + rwFmt(R.ghz, 4) + ' GHz', rwFmt(mc.plan.nominal, 4) + ' ' + unit],
        ['Builds, mean at ' + rwFmt(R.ghz, 4) + ' GHz', rwFmt(mean(at), 4) + ' ' + unit],
        ['Builds, worst over the band: mean', rwFmt(mean(worst), 4) + ' ' + unit],
        ['9 in 10 builds at least', rwFmt(q(worst, 0.1), 4) + ' ' + unit + ' over the band'],
        ['The worst build', rwFmt(worst[0], 4) + ' ' + unit]].map(([a, b]) => h('tr', null, h('th', { scope: 'row' }, a), h('td', { class: 'mono' }, b))))));
      rwHist(card, worst, tol.spec, unit);
      if (tol.spec !== null) {
        const Y = rfYield(B, tol.spec);
        card.append(h('p', { class: 'rt-lnote' + (Y.p >= 0.9 ? ' good' : '') }, 'Yield: ' + (100 * Y.p).toFixed(1) + ' % of builds have a ' + fig + ' of at least ' + rwFmt(tol.spec, 4) + ' ' + unit + ' across the whole band (' + (100 * Y.lo).toFixed(1) + ' to ' + (100 * Y.hi).toFixed(1) + ' %, 95% confidence).'));
      }
    }
  }
  return card;
}
/* the builds' worst figure over the band, as a histogram, the specification marked */
function rwHist(parent, xs, spec, unit) {
  const cv = h('canvas', { role: 'img', 'aria-label': 'Histogram of the builds’ worst figure over the band' }), wrap = h('div', { class: 'rt-lplot' }, cv);
  parent.append(wrap);
  requestAnimationFrame(() => {
    const dpr = window.devicePixelRatio || 1, W = Math.max(240, wrap.clientWidth || 500), H = 180, g = cv.getContext('2d');
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px'; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    let lo = Math.min(...xs), hi = Math.max(...xs); if (spec !== null) { lo = Math.min(lo, spec); hi = Math.max(hi, spec); }
    if (hi - lo < 1e-6) { lo -= 0.05; hi += 0.05; }
    const nb = 24, bins = new Array(nb).fill(0); for (const x of xs) bins[Math.min(nb - 1, Math.floor((x - lo) / (hi - lo) * nb))]++;
    const top = Math.max(...bins), L = 36, B = 22, X = v => L + (v - lo) / (hi - lo) * (W - L - 8), bw = (W - L - 8) / nb;
    g.fillStyle = '#e0a030'; bins.forEach((c, i) => { const hh = c / top * (H - B - 26); g.fillRect(L + i * bw + 1, H - B - hh, bw - 2, hh); });
    g.strokeStyle = '#888'; g.beginPath(); g.moveTo(L, H - B + 0.5); g.lineTo(W - 8, H - B + 0.5); g.stroke();
    g.fillStyle = '#555'; g.font = '11px system-ui, sans-serif'; g.textAlign = 'center';
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; g.textAlign = k === 0 ? 'left' : k === 4 ? 'right' : 'center'; g.fillText(v.toFixed(2), X(v), H - 6); }
    g.textAlign = 'right'; g.fillText('builds by their worst ' + unit + ' over the band', W - 8, 12);
    if (spec !== null) { g.strokeStyle = '#b42318'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(X(spec) + 0.5, 18); g.lineTo(X(spec) + 0.5, H - B); g.stroke(); g.setLineDash([]); g.fillStyle = '#b42318'; g.textAlign = 'left'; g.fillText('specification', X(spec) + 4, 30); }
  });
}
function rwMcGo(asm) {
  const plan = rfMcPlan(asm, designPrescription(asm), asm.rfTol);
  RW_MC = { asm, plan, running: true };
  const tick = () => {
    if (!RW_MC || RW_MC.plan !== plan || !RW_MC.running) return;
    const t0 = performance.now();
    while (performance.now() - t0 < 60 && !plan.done) plan.run(4);
    if (plan.done) RW_MC.running = false;
    rwRender();
    if (!plan.done) setTimeout(tick, 0);
  };
  rwRender(); setTimeout(tick, 0);
}
function rwMcStop() { if (RW_MC) RW_MC.running = false; rwRender(); }
