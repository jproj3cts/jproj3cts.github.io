import { ASM_FIELDS_MAX, ASM_WAVES_MAX, ASPH_ORDERS, MERIT_AT_FIELD, MERIT_AT_FREQ, MERIT_AT_PUPIL, MERIT_OPS, SOLVE_KINDS, asmAxisAt, asmCheck, asmKind, asmMembers, normCond, normLims, normMerit } from '../core/assembly.js';
import { TEST_MODE } from '../core/constants.js';
import { hooks } from '../core/hooks.js';
import { glassKey, glassSearch, matLabel } from '../core/glass.js';
import { deg, project } from '../state/project.js';
import { getEl, normElement } from '../state/elements.js';
import { benchName } from '../state/tabs.js';
import { lastTrace, sourceLines, traceScene } from '../engines/trace.js';
import { rayPath } from '../engines/lens-engine.js';
import { ghostPath, ghostsTraceable } from '../engines/lens-ghost.js';
import { FOUND_MAX, GLASS_MAKERS, LIMITED, atLimits, glassCandidates, isModel, keepFound, limitKey, meritReport, modelOf, nearestGlass, optApply, optProblem, optRun, optValues, optVars, sameDesign, substIndices, withGlass } from '../engines/lens-opt.js';
import { cfgSolved, mcAdd, mcKey, mcOf, mcRemove, mcSwitch, mcValue } from '../engines/lens-design.js';
import { commitDesign, condFromBench, condFromRays, designFigures, designOf, designPrescription, editable, getV, insertSinglet,
  insertSurface, keyAt, posOf, primaryNm, removeSurface, setV, surfSag, surfaceParts } from '../engines/lens-design.js';
import { helpLine, h } from './panel.js';
import { FF_KEYS, ffLabel } from '../core/freeform.js';
import { DP_KEYS, DP_N, dpLabel } from '../core/diffractive.js';
import { GR_N, grLabel } from '../core/gradient.js';
import { analysesPanel } from './lens-analyses.js';
import { lensTolState, tolCard, tolStart, tolStop } from './lens-tolerance.js';
import { drawingsCard } from './lens-drawing.js';
import { stockCard } from './lens-stock.js';
import { saveReport } from './lens-report.js';
import { setSelection } from './render.js';
import { changed, toast } from './actions.js';
import { checkpoint, redo, undo } from './tabs.js';
import { isRfAsm, openRfDesign } from './rf-workspace.js';
import { fmtWs } from '../core/format.js';

/* ==========================================================================
   The lens design workspace
   An assembly opened on a page of its own: the conditions it is designed for, its layout traced
   by the lens engine, and its element data, surface by surface, to edit as a lens designer does.
   Every change is written to its parts on the bench as it is made (and can be undone there), so
   leaving the workspace is only going back to the bench. A design started from nothing has no
   light on the bench yet: Place on a bench gives it a source for each field and a screen at its
   image, set to its conditions.
   ========================================================================== */
let WS = null;                     // { asm, tab, sel, draft, took }
const FIELD_COLOURS = ['#5aa9ff', '#5fd38a', '#ff7a6b', '#f2c14e', '#c38bff', '#4fd6d6', '#ff9cd0', '#b0b8c0'];
export const lensDesignOpen = () => !!WS;
const wsFmt = (v, p) => fmtWs(v, p || 6);
const fmtR = v => v === null || v === undefined ? 'Flat' : wsFmt(v, 7);

/* the light the bench sends the assembly, as conditions: null when none reaches it */
const linesOf = id => { const e = getEl(id); return !e ? [] : e.type === 'source' ? sourceLines(e) : isFinite(e.wavelength) ? [e.wavelength] : []; };
export function asmBenchLight(asm, P) {
  traceScene();
  return condFromRays(asm, P || designPrescription(asm), lastTrace.rays || [], linesOf);
}

export function openLensDesign(asm, opts) {
  // a system of RF parts opens in the RF designer, unless the optical one is asked for
  if (!(opts && opts.optical) && isRfAsm(asm)) return openRfDesign(asm, opts);
  // a graded-index RF disc is the RF designer's alone (the optical designer has no such part)
  if (asmMembers(asm).some(e => asmKind(e) === 'grin')) { toast(isRfAsm(asm) ? 'A graded-index RF disc is designed in the RF designer only.' : 'A graded-index RF disc can be designed only with RF parts, in the RF designer.', true); return false; }
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
  // designed: its parts' fields on the bench are locked against a stray edit (the padlock in their panel opens them)
  asm.lock = true;
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
    ...cfgPicker(asm),
    h('button', { class: 'rt-btn rt-icon quiet', type: 'button', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', onclick: () => { undo(); afterUndo(); } }, '↶'),
    h('button', { class: 'rt-btn rt-icon quiet', type: 'button', title: 'Redo (Ctrl+Y)', 'aria-label': 'Redo', onclick: () => { redo(); afterUndo(); } }, '↷'),
    ...(isRfAsm(asm) ? [h('button', { class: 'rt-btn quiet', type: 'button', title: 'The same parts in the RF designer: the feed horn’s beam through them to its goal', onclick: () => { closeLensDesign(); openRfDesign(asm); } }, 'RF designer')] : []),
    hooks.saveParts ? h('button', { class: 'rt-btn quiet' + (hooks.proWhy() ? ' rt-off' : ''), type: 'button', id: 'lensKeep', 'aria-disabled': hooks.proWhy() ? 'true' : null, title: hooks.proWhy() || 'Keep the whole design (its parts, with their conditions and design) as a part, in My parts or a team’s parts, to add to any bench', onclick: () => { const why = hooks.proWhy(); if (why) { toast(why, true); hooks.proFix(); } else hooks.saveParts(asmMembers(asm)); } }, 'Keep as a part…') : null,
    h('button', { class: 'rt-btn', type: 'button', title: 'The design as a PDF: its conditions, first order, layout, prescription, Seidel sums, analyses, tolerances and each lens’s drawing', onclick: () => saveReport(asm) }, 'Report (PDF)'),
    h('button', { class: 'rt-btn primary', type: 'button', id: 'lensLeave', title: WS.draft ? 'Put it on the bench, with a source for each field and a screen at its image' : 'Back to the bench, where its parts are as designed here (Esc)', onclick: leave },
      WS.draft ? 'Place on a bench' : 'Back to the bench')));
  const body = h('div', { class: 'rt-lbody' });
  body.append(conditionsCard(asm, F), h('div', { class: 'rt-lmain' }, layoutCard(asm, P, F), figuresStrip(F), tabsRow(), WS.tab === 'data' ? dataCard(asm, P) : WS.tab === 'cfg' ? configsCard(asm, P) : WS.tab === 'merit' ? meritCard(asm, P) : WS.tab === 'opt' ? optCard(asm, P) : WS.tab === 'tol' ? tolCard({ asm, P, redraw: renderWs, state: WS.tolState || (WS.tolState = {}), edit: tolEdit }) : WS.tab === 'draw' ? drawingsCard(asm, WS.drawState || (WS.drawState = { redraw: renderWs })) : WS.tab === 'stock' ? stockCard({ asm, P, redraw: renderWs, edit, toast }) : analysesPanel(asm, P, F, WS.ana || (WS.ana = {}), renderWs)));
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
  const fin = !!(c.object && c.object.kind === 'finite');
  card.append(h('p', { class: 'rt-lsub' }, fin ? 'What it is designed and analysed for: an object at this distance, points on it at these heights, through this aperture.' : 'What it is designed and analysed for: light from infinity at these angles, through this aperture.'));
  // the object: at infinity, or at a distance; the fields go with it (angles to heights, and back)
  const ok = h('select', { 'aria-label': 'Object' }, h('option', { value: 'inf' }, 'At infinity'), h('option', { value: 'finite' }, 'At a distance (mm)'));
  ok.value = fin ? 'finite' : 'inf';
  ok.addEventListener('change', fromField(ok, () => condEdit(cc => {
    if (ok.value === 'finite') {
      const d = isFinite(F.efl) && F.efl ? +(2 * Math.abs(F.efl)).toPrecision(4) : 100;
      cc.object = { kind: 'finite', d };
      cc.fields = cc.fields.map(f => ({ deg: +(d * Math.tan(f.deg * deg)).toPrecision(5), w: f.w }));
    } else {
      const d = cc.object.d;
      delete cc.object;
      cc.fields = cc.fields.map(f => ({ deg: +(Math.atan(f.deg / d) / deg).toPrecision(5), w: f.w }));
      if (cc.aperture.kind === 'na') cc.aperture = { kind: 'epd', v: +F.epd.toPrecision(6) };
    }
  })));
  card.append(h('h3', null, 'Object'), h('div', { class: 'rt-lrow' }, ok, fin ? wsNumInput(c.object.d, v => condEdit(cc => { if (v > 0) cc.object.d = v; }), { label: 'Object distance' }) : ''));
  if (fin) card.append(h('p', { class: 'rt-lsub' }, 'Before the first surface. Magnification ' + wsFmt(F.mag, 4) + ', the image ' + wsFmt(F.imgDist, 6) + ' mm after the last surface (paraxial).'));
  // the aperture
  const kind = h('select', { 'aria-label': 'Aperture given as' }, h('option', { value: 'epd' }, 'Entrance pupil diameter (mm)'), h('option', { value: 'fno' }, 'Working F-number'), ...(fin ? [h('option', { value: 'na' }, 'NA at the object')] : []));
  kind.value = c.aperture.kind;
  kind.addEventListener('change', fromField(kind, () => condEdit(cc => { const v = kind.value === 'fno' ? F.fno : kind.value === 'na' ? F.na : F.epd; cc.aperture = { kind: kind.value, v: isFinite(v) && v > 0 ? +v.toPrecision(6) : (kind.value === 'fno' ? 4 : kind.value === 'na' ? 0.1 : 10) }; })));
  card.append(h('h3', null, 'Aperture'), h('div', { class: 'rt-lrow' }, kind, wsNumInput(c.aperture.v, v => condEdit(cc => { cc.aperture.v = v; }), { label: 'Aperture' })));
  // the fields
  card.append(h('h3', null, fin ? 'Fields (object height mm, weight)' : 'Fields (angle °, weight)'));
  c.fields.forEach((f, i) => card.append(h('div', { class: 'rt-lrow' },
    h('span', { class: 'rt-lswatch', style: 'background:' + FIELD_COLOURS[i % FIELD_COLOURS.length], 'aria-hidden': 'true' }),
    wsNumInput(f.deg, v => condEdit(cc => { cc.fields[i].deg = v; }), { label: 'Field ' + (i + 1) + (fin ? ' height' : ' angle') }),
    wsNumInput(f.w, v => condEdit(cc => { cc.fields[i].w = v; }), { label: 'Field ' + (i + 1) + ' weight' }),
    c.fields.length > 1 ? h('button', { class: 'rt-lx', type: 'button', 'aria-label': 'Remove field ' + (i + 1), onclick: () => condEdit(cc => { cc.fields.splice(i, 1); }) }, '×') : h('span', { class: 'rt-lx' }))));
  if (c.fields.length < ASM_FIELDS_MAX) card.append(h('button', { class: 'rt-link', type: 'button', onclick: () => condEdit(cc => { const m = Math.max(...cc.fields.map(f => f.deg)), st = fin ? Math.max(0.5, +(0.05 * cc.object.d).toPrecision(1)) : 5; cc.fields.push({ deg: +(m + st).toFixed(3), w: 1 }); }) }, 'Add a field'));
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
  condEdit(cc => { const nc = condFromBench({ cond: cc }, B); for (const k of Object.keys(cc)) delete cc[k]; Object.assign(cc, nc); });
  const c = asm.cond, waves = c.waves.length === 1 ? 'one wavelength, ' + wsFmt(c.waves[0].nm, 5) + ' nm' : c.waves.map(w => wsFmt(w.nm, 5)).join(', ') + ' nm';
  WS.took = 'Taken from the light arriving at it on ' + benchName(asm.bench) + ': ' + (B.object
    ? 'light from points ' + wsFmt(B.object, 4) + ' mm before it, up to ' + wsFmt(Math.max(...B.heights), 3) + ' mm off the axis, NA ' + wsFmt(B.na, 3) + ', '
    : (B.epd > 1e-6 ? 'a beam ' + wsFmt(B.epd, 3) + ' mm across, ' : '') + 'fields to ' + wsFmt(Math.max(...B.fields), 3) + '°, ') + waves + '.';
  renderWs();
}

/* ---------- The layout: the meridional rays of each field, traced by the lens engine ---------- */
function layoutCard(asm, P, F) {
  const card = h('div', { class: 'rt-lcard rt-llayout' });
  const stats = h('span', { class: 'mono' }, F.object ? 'm ' + wsFmt(F.mag, 4) + ' · NA ' + wsFmt(F.na, 3) + ' at the object · f/' + wsFmt(F.fno, 3) + ' working · fields to ' + wsFmt(F.fmax, 4) + ' mm'
    : 'EFL ' + wsFmt(F.efl, 5) + ' mm · f/' + wsFmt(F.fno, 3) + ' · fields to ' + wsFmt(F.fmax, 3) + '°');
  card.append(h('div', { class: 'rt-lltop' }, h('span', null, 'Layout, in the plane of the fields'), stats));
  const cv = h('canvas', { role: 'img', 'aria-label': 'The design’s layout: its lenses, stop and image plane, with rays from each field' });
  card.append(cv);
  requestAnimationFrame(() => drawLayout(cv, asm, P, F));
  return card;
}
/* the layout in the plane of the fields, in the engine's own frame (y across, z along the first
   axis), each surface drawn in its own frame, so folds, tilts and decentres show as they are:
   each lens an outline, each mirror its face, each stop its two blades, the rays from each field */
export function layoutData(asm, P, F) {
  const S = F.S, c = asm.cond, out = { lenses: [], mirrors: [], stops: [], rays: [], axis: [], image: null, imageZ: S.imageZ, zEnd: S.z[S.N - 1], folded: !!S.fr };
  const sps = surfaceParts(P);
  // a point (y across, z along) in surface i's own frame, to [y, z] in the drawing's
  const at = (i, y, zl) => {
    if (!S.fr) return [y, S.z[i] + zl];
    const f = S.fr[i], Q = f.R;
    return [f.o[1] + Q[4] * y + Q[5] * zl, f.o[2] + Q[7] * y + Q[8] * zl];
  };
  const prof = (k, hmax) => { const s = P.surfaces[k], pts = []; for (let q = 0; q <= 24; q++) { const y = -hmax + 2 * hmax * q / 24, zz = wsSag(s, y); pts.push([y, isFinite(zz) ? zz : 0]); } return pts; };
  const semiOf = s => isFinite(s.semi) && s.semi > 0 ? s.semi : 10;
  let i = 0;
  while (i < P.surfaces.length) {
    const sp = sps[i];
    if (sp.kind === 'stop') { const r = P.surfaces[i].semi, e = Math.max(r * 0.35, 1.5); out.stops.push([[at(i, r, 0), at(i, r + e, 0)], [at(i, -r, 0), at(i, -r - e, 0)]]); i++; continue; }
    if (sp.kind === 'mirror') {
      const pr = prof(i, semiOf(P.surfaces[i]));
      // its face, and its back a little behind it (the side the light doesn't reach)
      out.mirrors.push({ face: pr.map(([y, z]) => at(i, y, z)), back: pr.map(([y, z]) => at(i, y, z + Math.max(0.6, 0.04 * semiOf(P.surfaces[i])))) });
      i++; continue;
    }
    // a lens or window: an outline round its surfaces, each pair joined at the rim of the larger
    const ps = [];
    for (let j = 0; j < sp.n; j++) ps.push(prof(i + j, semiOf(P.surfaces[i + j])));
    for (let j = 0; j + 1 < sp.n; j++) {
      const a = ps[j], b = ps[j + 1], ka = i + j, kb = ka + 1, ha = a[a.length - 1][0], hb = b[b.length - 1][0], poly = [];
      for (const [y, z] of a) poly.push(at(ka, y, z));
      if (hb > ha) poly.push(at(ka, hb, a[a.length - 1][1]));
      if (ha > hb) poly.push(at(kb, ha, b[b.length - 1][1]));
      for (let q = b.length - 1; q >= 0; q--) poly.push(at(kb, b[q][0], b[q][1]));
      if (ha > hb) poly.push(at(kb, -ha, b[0][1])); else if (hb > ha) poly.push(at(ka, -hb, a[0][1]));
      out.lenses.push(poly);
    }
    i += sp.n;
  }
  // the axis, from before the first surface through each vertex it turns at, to the image; from a
  // finite object, from the object itself when it is near enough to draw
  let lead = Math.max(5, 0.25 * S.imageZ);
  if (S.obj && S.obj <= 3 * Math.max(Math.abs(S.imageZ), 10)) {
    lead = S.obj;
    const hm = Math.max(...c.fields.map(f => Math.abs(f.deg)));
    out.object = hm > 0 ? [[0, -S.obj], [hm, -S.obj]] : null;
  }
  if (S.ax) {
    out.axis.push([-lead * S.ax[0].d[1], -lead * S.ax[0].d[2]]);
    S.ax.forEach((a, k) => { if (k === 0 || P.surfaces[k].mirror) out.axis.push([a.p[1], a.p[2]]); });
    out.axis.push([S.img.p[1] + S.img.d[1] * 0.05 * lead, S.img.p[2] + S.img.d[2] * 0.05 * lead]);
    out.image = { p: [S.img.p[1], S.img.p[2]], e: [S.img.e2[1], S.img.e2[2]] };
  } else {
    out.axis.push([0, -lead], [0, S.imageZ + 0.05 * lead]);
    out.image = { p: [0, S.imageZ], e: [1, 0] };
  }
  out.lead = lead;
  c.fields.forEach((f, fi) => {
    for (const py of [-1, -0.5, 0, 0.5, 1]) {
      const r = rayPath(S, f.deg * deg, 0, py);
      if (r) out.rays.push({ field: fi, pts: r.pts, lost: r.lost });
    }
  });
  // the ghost chosen in the Analyses, its rays from the field shown there
  const an = WS && WS.tab === 'analyses' && WS.ana;
  if (an && an.view === 'ghost' && an.ghost && ghostsTraceable(P)) {
    const f = c.fields[an.field >= 0 && an.field < c.fields.length ? an.field : 0], A = { Sp: S, P, c };
    out.ghost = [];
    for (const py of [-1, -0.5, 0, 0.5, 1]) { const r = ghostPath(A, an.ghost[0], an.ghost[1], f.deg, 0, py); if (r) out.ghost.push(r); }
  }
  return out;
}
// a surface's profile in the plane of the fields, as drawn (a cylinder curved out of it flat; a freeform's terms in it)
const wsSag = (s, y) => surfSag(s, y);
function drawLayout(cv, asm, P, F) {
  const L = layoutData(asm, P, F), dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 800;
  // the rays from the plane a lead before the first surface
  const z0 = -L.lead, rays = L.rays.map(r => {
    const p = r.pts.slice(), [ya, za] = p[0], [yb, zb] = p[1], t = (z0 - za) / (zb - za);
    p[0] = [ya + t * (yb - ya), z0];
    return Object.assign({}, r, { pts: p });
  });
  // the image plane, as tall as the rays that land on it and a little more
  let hi = 1;
  for (const pr of L.lenses) for (const [y] of pr) hi = Math.max(hi, 0.5 * Math.abs(y));
  for (const r of rays) if (r.lost < 0) { const [y, z] = r.pts[r.pts.length - 1]; hi = Math.max(hi, 1.08 * Math.abs((y - L.image.p[0]) * L.image.e[0] + (z - L.image.p[1]) * L.image.e[1])); }
  const img = [[L.image.p[0] + L.image.e[0] * hi, L.image.p[1] + L.image.e[1] * hi], [L.image.p[0] - L.image.e[0] * hi, L.image.p[1] - L.image.e[1] * hi]];
  // the extent of it all
  let y0 = Infinity, y1 = -Infinity, za = Infinity, zb = -Infinity;
  const take = ([y, z]) => { if (!isFinite(y) || !isFinite(z)) return; y0 = Math.min(y0, y); y1 = Math.max(y1, y); za = Math.min(za, z); zb = Math.max(zb, z); };
  for (const pr of L.lenses) pr.forEach(take);
  for (const m of L.mirrors) { m.face.forEach(take); m.back.forEach(take); }
  for (const s of L.stops) for (const seg of s) seg.forEach(take);
  img.forEach(take); L.axis.forEach(take);
  if (L.object) L.object.forEach(take);
  if (!L.folded) { const m = Math.max(Math.abs(y0), Math.abs(y1)); y0 = -m; y1 = m; }
  const pad = Math.max(2, 0.03 * (zb - za));
  za -= pad * (L.folded ? 1 : 0); zb += pad; y0 -= pad * 0.3; y1 += pad * 0.3;
  const H = L.folded ? Math.max(200, Math.min(520, W * (y1 - y0) / (zb - za) + 24)) : Math.max(180, Math.min(320, W * 0.32));
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  g.fillStyle = '#1e2227'; g.fillRect(0, 0, W, H);
  const k = Math.min((W - 24) / (zb - za), (H - 24) / ((y1 - y0) * 1.05));
  const X = z => 12 + (z - za) * k + ((W - 24) - (zb - za) * k) / 2, Y = y => H / 2 - (y - (y0 + y1) / 2) * k;
  const path = pts => { g.beginPath(); pts.forEach(([y, z], q) => q ? g.lineTo(X(z), Y(y)) : g.moveTo(X(z), Y(y))); };
  // the axis
  g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 1; g.setLineDash([4, 4]); path(L.axis); g.stroke(); g.setLineDash([]);
  // the lenses
  for (const pr of L.lenses) { path(pr); g.closePath(); g.fillStyle = 'rgba(115,185,202,0.28)'; g.fill(); g.strokeStyle = '#9ccfdc'; g.lineWidth = 1.2; g.stroke(); }
  // the mirrors: the face bright, the back shaded
  for (const m of L.mirrors) {
    path(m.face.concat(m.back.slice().reverse())); g.closePath(); g.fillStyle = 'rgba(200,210,220,0.25)'; g.fill();
    path(m.face); g.strokeStyle = '#e4ebf0'; g.lineWidth = 2; g.stroke();
  }
  // the stops
  g.strokeStyle = '#d8dee3'; g.lineWidth = 3;
  for (const s of L.stops) for (const seg of s) { path(seg); g.stroke(); }
  // the rays
  g.lineWidth = 1; g.globalAlpha = 0.9;
  for (const r of rays) { g.strokeStyle = FIELD_COLOURS[r.field % FIELD_COLOURS.length]; path(r.pts); g.stroke(); }
  g.globalAlpha = 1;
  // a ghost's rays, over the rest
  if (L.ghost) { g.strokeStyle = '#ff5fd2'; g.lineWidth = 1.2; for (const r of L.ghost) { path(r.pts.slice(1)); g.stroke(); } }
  // the image plane
  g.strokeStyle = '#f2f2ec'; g.lineWidth = 2; path(img); g.stroke();
  // the object, from the axis to its highest field point
  if (L.object) { g.strokeStyle = '#f2c14e'; g.lineWidth = 2; path(L.object); g.stroke(); }
}

function figuresStrip(F) {
  const row = (a, b, t) => h('div', { title: t || '' }, h('span', null, a), h('b', { class: 'mono' }, b));
  return h('div', { class: 'rt-lfig' },
    row('EFL', isFinite(F.efl) ? wsFmt(F.efl, 6) + ' mm' : 'afocal', 'Effective focal length at the primary wavelength'),
    row('BFL', isFinite(F.bfl) ? wsFmt(F.bfl, 6) + ' mm' : '—', 'From the last surface to the paraxial focus (of an object at infinity)'),
    ...(F.object ? [row('Image distance', isFinite(F.imgDist) ? wsFmt(F.imgDist, 6) + ' mm' : '—', 'From the last surface to the paraxial image of the object'),
      row('Magnification', wsFmt(F.mag, 5), 'Paraxial: the image\u2019s height over the object\u2019s')] : []),
    row('Working F-number', isFinite(F.fno) ? 'f/' + wsFmt(Math.abs(F.fno), 4) : '—'),
    row('Entrance pupil', wsFmt(F.epd, 5) + ' mm, ' + wsFmt(F.epz, 5) + ' mm from the first surface'),
    row('Image height', wsFmt(F.imgH, 5) + ' mm', 'Paraxial, at the largest field'),
    row('Total track', wsFmt(F.track, 6) + ' mm', 'First surface to the image'));
}
function tabsRow() {
  const tab = (id, label) => h('button', { type: 'button', role: 'tab', class: 'rt-ltab', 'aria-selected': String(WS.tab === id), onclick: () => { WS.tab = id; renderWs(); } }, label);
  return h('div', { class: 'rt-ltabs', role: 'tablist', 'aria-label': 'Design' }, tab('data', 'Element data'), tab('cfg', 'Configurations'), tab('merit', 'Merit'), tab('opt', 'Optimise the design'), tab('analyses', 'Analyses'), tab('tol', 'Tolerance the design'), tab('stock', 'Stock lenses'), tab('draw', 'Drawings'));
}

/* ---------- Element data ---------- */
function surfaceName(P, sps, i) {
  const sp = sps[i], e = getEl(sp.id), nm = e ? e.name : '?';
  if (sp.kind === 'stop') return /\bstop\b/i.test(nm) ? nm : nm + ' (stop)';
  if (sp.n === 1) return nm;
  if (sp.n === 2) return nm + (sp.j === 0 ? ', front' : ', back');
  return nm + ', ' + ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][sp.j] + (sp.j > 5 ? ' ' + (sp.j + 1) : '');
}
function dataCard(asm, P) {
  const D = designOf(asm), sps = surfaceParts(P), N = P.surfaces.length;
  const card = h('div', { class: 'rt-lcard rt-ldata', role: 'tabpanel' });
  const tbl = h('table', { class: 'rt-ltable' });
  // tilts and decentres, where a part has them (a fold mirror always)
  const moved = P.surfaces.some(s => s.mirror || s.tilt || s.dec) || !!WS.poseOn;
  // the columns some part here can take (a mirror alone: its tilt)
  const PQ = moved ? POSE_QS.filter(q => P.surfaces.some((_, i) => editable(P, q, i))) : [];
  tbl.append(h('thead', null, h('tr', null, ...['', 'Surface', 'Radius (mm)', 'Thickness (mm)', 'Glass', 'Clear radius (mm)', 'Conic'].map(t => h('th', { scope: 'col' }, t)), ...PQ.map(q => { const [t, tip] = POSE_HEADS[POSE_QS.indexOf(q)]; return h('th', { scope: 'col', class: 'pose', title: tip }, t); }))));
  const tb = h('tbody');
  const obj = h('tr', { class: 'obj' + (WS.sel === -2 ? ' sel' : ''), 'aria-selected': String(WS.sel === -2), title: 'Select it to insert a singlet in front of the first surface' },
    h('td', { class: 'n' }, 'OBJ'), h('td', { class: 'nm' }, 'Object'), h('td', { class: 'mono' }, 'Flat'), h('td', { class: 'mono', title: asm.cond.object ? 'The object’s distance, set in the design conditions' : 'At infinity' }, asm.cond.object ? wsFmt(asm.cond.object.d, 7) : '∞'), h('td'), h('td'), h('td'), ...PQ.map(() => h('td')));
  obj.addEventListener('click', () => { WS.sel = WS.sel === -2 ? -1 : -2; renderWs(); });
  tb.append(obj);
  for (let i = 0; i < N; i++) {
    const sp = sps[i], s = P.surfaces[i];
    const tr = h('tr', { class: i === WS.sel ? 'sel' : '', 'aria-selected': String(i === WS.sel) });
    tr.addEventListener('click', e => { if (e.target.closest('input,button,select')) return; WS.sel = WS.sel === i ? -1 : i; renderWs(); });
    // a lens surface's aspheric terms: shown under it once it has any, or once asked for
    const sid = s.from ? s.from.id + '.' + s.from.i : '', asph = sp.kind === 'mirror' || sp.kind === 'lens' && !!P.parts[sp.pi].asph, nA = asph ? Math.max((s.A || []).length, (WS.asp && WS.asp[sid]) || 0) : 0;
    const nmTd = h('td', { class: 'nm' }, surfaceName(P, sps, i));
    if (s.cyl) nmTd.append(h('span', { class: 'rt-lcyl', title: s.cyl === 'y' ? 'Cylindrical: curved in the plane of the fields only (its radius there), flat out of it' : 'Cylindrical: curved out of the plane of the fields only (its radius there), flat in it, so it has no power in the layout or the first-order figures' }, s.cyl === 'y' ? ' cyl ⟂' : ' cyl ↕'));
    if (asph && !nA) nmTd.append(h('button', { type: 'button', class: 'rt-lasp', title: 'Give this surface aspheric terms (A4 r⁴, A6 r⁶ …), to type or to vary', 'aria-label': 'Aspheric terms for surface ' + (i + 1),
      onclick: () => { (WS.asp || (WS.asp = {}))[sid] = 1; renderWs(); } }, '+ A'));
    // a freeform's XY terms: those it has, and those asked for
    const ffKs = asph ? FF_KEYS.filter(k => (s.F && k in s.F) || (WS.ff && WS.ff[sid] && WS.ff[sid].includes(k))) : [];
    if (asph && !ffKs.length) nmTd.append(h('button', { type: 'button', class: 'rt-lasp', title: 'Make this surface a freeform: XY terms c x^m y^n on its sag (x up out of the plane of the fields, y across), to type or to vary', 'aria-label': 'Freeform terms for surface ' + (i + 1),
      onclick: () => { (WS.ff || (WS.ff = {}))[sid] = ['02']; renderWs(); } }, '+ XY'));
    // a diffractive lens's phase on this face: shown under it once it has any, or once asked for
    const dif = sp.kind === 'lens' && !!P.parts[sp.pi].diff, nPh = dif ? Math.max(s.ph ? s.ph.reduce((n, v, j) => (v ? j + 1 : n), 0) : 0, (WS.ph && WS.ph[sid]) || 0) : 0;
    if (dif && !nPh) nmTd.append(h('button', { type: 'button', class: 'rt-lasp', title: 'Write a diffractive phase on this surface (c₁ρ² + c₂ρ⁴ …, radians), to type or to vary', 'aria-label': 'Phase terms for surface ' + (i + 1),
      onclick: () => { (WS.ph || (WS.ph = {}))[sid] = 1; renderWs(); } }, '+ φ'));
    // a graded lens's glass after this surface: its terms shown under it once it has any, or once asked for
    const gra = editable(P, 'n2', i), nGr = gra ? Math.max(P.materials[i].grad ? P.materials[i].grad.length : 0, (WS.gr && WS.gr[sid]) || 0) : 0;
    if (gra && !nGr) nmTd.append(h('button', { type: 'button', class: 'rt-lasp', title: 'Grade the glass after this surface: its index n + g₂r² + g₄r⁴ + g₆r⁶ from the lens\u2019s axis, to type or to vary', 'aria-label': 'Gradient terms for the glass after surface ' + (i + 1),
      onclick: () => { (WS.gr || (WS.gr = {}))[sid] = 1; renderWs(); } }, '+ n(r)'));
    tr.append(h('td', { class: 'n' }, sp.kind === 'stop' ? 'STO' : String(i + 1)), nmTd);
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
    else if (sp.kind === 'mirror') gtd.append(h('span', { class: 'mono ro', title: 'A reflecting surface: the light turns back along the axis it folds' }, 'Mirror'));
    tr.append(gtd);
    // clear radius: a lens's surface's own; the stop's is set by the aperture
    const ctd = h('td');
    if (sp.kind === 'lens') ctd.append(wsNumInput(s.semi, v => edit(PP => { if (!(v > 0)) return 'A clear radius is more than 0.'; const e = getEl(sp.id); if (e && 2 * v > e.diameter) e.diameter = 2 * v; PP.surfaces[i].semi = v; }), { label: 'Clear radius of surface ' + (i + 1) }));
    else ctd.append(h('span', { class: 'mono ro', title: sp.kind === 'stop' ? 'Set by the aperture in the design conditions' : sp.kind === 'mirror' ? 'Half the mirror’s length' : 'The window’s own size' }, wsFmt(s.semi, 5)));
    tr.append(ctd);
    tr.append(valueCell(P, D, 'k', i));
    // a part's tilt (°) and decentre (mm), about its first vertex: typed, varied, solved or picked up here, or set by turning it on the bench
    // in the plane of the fields (across the bench) and out of it (up and down), a column each, on the part's first surface
    for (const q of PQ) { const c = editable(P, q, i) ? valueCell(P, D, q, i) : h('td'); c.classList.add('pose'); tr.append(c); }
    tb.append(tr);
    if (nA) tb.append(asphRow(P, D, i, sid, nA, PQ.length));
    if (ffKs.length) tb.append(ffRow(P, D, i, sid, ffKs, PQ.length));
    if (nPh) tb.append(phRow(P, D, i, sid, nPh, PQ.length));
    if (nGr) tb.append(grRow(P, D, i, sid, nGr, PQ.length));
  }
  const F = designFigures(asm, P);
  tb.append(h('tr', { class: 'obj' }, h('td', { class: 'n' }, 'IMA'), h('td', null, 'Image'), h('td', { class: 'mono' }, 'Flat'), h('td'), h('td'), h('td', { class: 'mono ro', title: 'Paraxial image height at the largest field' }, wsFmt(Math.abs(F.imgH), 5)), h('td'), ...PQ.map(() => h('td'))));
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
    h('button', { class: 'rt-btn', type: 'button', 'aria-pressed': String(moved), disabled: P.surfaces.some(x => x.mirror || x.tilt || x.dec) ? '' : null,
      title: 'Each part’s tilt (degrees) and decentre (mm) about its first vertex: in the plane of the fields (across the bench) and out of it (up and down): to type, or to vary', onclick: () => { WS.poseOn = !WS.poseOn; renderWs(); } }, 'Tilts and decentres'),
    h('span', { class: 'rt-lkey' }, h('b', null, 'V'), ' a variable for the optimiser (' + D.vars.length + ' now) · ', h('b', null, 'S'), ' a solve · ', h('b', null, 'P'), ' a pickup'));
  card.append(bar);
  return card;
}
const POSE_QS = ['T', 'D', 'U', 'X'];
const POSE_HEADS = [['Tilt (°)', 'In the plane of the fields: turned across the bench, about its first vertex'], ['Decentre (mm)', 'In the plane of the fields: moved across the bench'],
  ['Tilt up (°)', 'Out of the plane of the fields: tipped up, about its first vertex'], ['Decentre up (mm)', 'Out of the plane of the fields: raised']];
/* a radius, thickness or conic: its value (fixed by a solve or pickup, or typed), its V and its S/P */
function valueCell(P, D, q, i) {
  const td = h('td', { class: 'rt-lval' });
  if (!editable(P, q, i)) { if (q === 't' || q === 'k') td.append(h('span', { class: 'mono ro' }, q === 'k' ? '' : wsFmt(getV(P, { q, i, image: i === P.surfaces.length - 1 })))); else td.append(h('span', { class: 'mono ro' }, 'Flat')); return td; }
  const key = keyAt(P, q, i), at = posOf(P, key), v = getV(P, at), sv = D.solves[key], pk = D.pickups[key], fixed = !!(sv || pk);
  const label = (q === 'R' ? 'Radius' : q === 't' ? (at.image ? 'Image distance' : 'Thickness') : q[0] === 'a' ? 'A' + q.slice(1) : q[0] === 'f' ? 'Freeform ' + ffLabel(q.slice(1)) : q[0] === 'p' ? 'Phase ' + dpLabel(+q[1] / 2 - 1) : q[0] === 'n' ? 'Gradient ' + grLabel(+q[1] / 2 - 1) : q === 'T' ? 'Tilt' : q === 'D' ? 'Decentre' : q === 'U' ? 'Tilt out of the plane' : q === 'X' ? 'Decentre out of the plane' : 'Conic') + (q[0] === 'n' ? ' after surface ' : ' of surface ') + (i + 1);
  const asp = q[0] === 'a' || q[0] === 'f' || q[0] === 'p' || q[0] === 'n', expo = x => !x ? '0' : x.toExponential(5).replace(/\.?0+e/, 'e'), MC = mcOf(D), inMc = !!(MC && MC.keys.includes(key));
  const inp = h('input', { type: 'text', inputmode: 'decimal', class: 'rt-lnum' + (asp ? ' wide' : '') + (fixed ? ' fixed' : '') + (inMc ? ' mc' : ''), value: q === 'R' ? fmtR(v) : asp ? expo(v) : wsFmt(v, 7), 'aria-label': label, spellcheck: 'false', readonly: fixed ? '' : null,
    title: (fixed ? (sv ? 'Solved: ' + solveText(sv) : 'Picked up: ' + pickText(pk)) + '. Clear it with the button beside.' : '') + (inMc ? (fixed ? ' ' : '') + 'Its own in each configuration: this is ' + MC.configs[MC.active].name + '’s.' : '') });
  inp.addEventListener('change', fromField(inp, () => {
    const t = inp.value.trim().toLowerCase();
    let val = q === 'R' && (t === '' || t === 'flat' || t === 'inf' || t === '∞' || t === 'infinity') ? null : parseNum(t);
    if (val === null && q !== 'R') { inp.value = wsFmt(v, 7); return; }
    edit(PP => { const a = posOf(PP, key); if (q === 'R') PP.surfaces[a.i].R = val === 0 ? null : val; else if (q === 'k') PP.surfaces[a.i].k = val; else if (q[0] === 'a' || q[0] === 'f' || q[0] === 'p' || q[0] === 'n' || q === 'T' || q === 'D' || q === 'U' || q === 'X') setV(PP, a, val); else if (a.image) PP.image = val; else { if (val < 0) return 'A thickness can’t be negative.'; PP.gaps[a.i] = val; } });
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
const pickText = p => p.scale + ' × ' + p.from.replace(/^R:/, 'radius ').replace(/^t:/, 'thickness ').replace(/^T:/, 'tilt ').replace(/^D:/, 'decentre ').replace(/^U:/, 'tilt out of the plane ').replace(/^X:/, 'decentre out of the plane ').replace(/^k:/, 'conic ').replace(/^a(\d+):/, 'A$1 ').replace(/^f(\d\d):/, (m, k) => 'freeform ' + ffLabel(k) + ' ').replace(/^p(\d):/, (m, k) => 'phase ' + dpLabel(+k / 2 - 1) + ' ').replace(/^n(\d):/, (m, k) => 'gradient ' + grLabel(+k / 2 - 1) + ' after ') + (p.off ? ' + ' + p.off : '');
/* a surface's aspheric terms, a row under it: A4, A6 … each typed, varied, solved or picked up; one more, or the last taken off */
/* a freeform's XY terms, a row under its surface: each typed, varied, solved or picked up, and taken off with its ×; another added from the list */
function ffRow(P, D, i, sid, ks, nPose) {
  const cells = h('div', { class: 'rt-laspc' });
  for (const k of ks) cells.append(h('div', { class: 'rt-lasp1' }, h('span', { class: 'mono' }, ffLabel(k)), valueCell(P, D, 'f' + k, i),
    h('button', { type: 'button', class: 'rt-lx', 'aria-label': 'Take ' + ffLabel(k) + ' off surface ' + (i + 1), title: 'Take this term off (its value 0, and its variable, solve or pickup cleared)', onclick: () => {
      const key = keyAt(P, 'f' + k, i);
      if (WS.ff && WS.ff[sid]) WS.ff[sid] = WS.ff[sid].filter(x => x !== k);
      edit((PP, a) => { const at = posOf(PP, key); if (at) { const sf = PP.surfaces[at.i]; if (sf.F) { const F = Object.assign({}, sf.F); delete F[k]; sf.F = Object.keys(F).length ? F : undefined; } } const dd = designOf(a); dd.vars = dd.vars.filter(x => x !== key); delete dd.solves[key]; delete dd.pickups[key]; });
    } }, '×')));
  const left = FF_KEYS.filter(k => !ks.includes(k));
  if (left.length) {
    const pick = h('select', { 'aria-label': 'Freeform term to add to surface ' + (i + 1) }, ...left.map(k => h('option', { value: k }, ffLabel(k))));
    cells.append(pick, h('button', { type: 'button', class: 'rt-link', 'aria-label': 'Add the term to surface ' + (i + 1), onclick: () => { const L = (WS.ff || (WS.ff = {}))[sid] || []; WS.ff[sid] = L.concat([pick.value]); renderWs(); } }, 'Add the term'));
  }
  return h('tr', { class: 'asp' }, h('td'), h('td', { class: 'nm asp', title: 'c x^m y^n added to the sag: x up out of the plane of the fields, y across it' }, 'freeform terms'), h('td', { colspan: String(5 + nPose) }, cells));
}
/* a diffractive face's phase terms, a row under it: c₁ρ² … each typed (radians), varied, solved or picked up; one more, or the last taken off */
function phRow(P, D, i, sid, n, nPose) {
  const cells = h('div', { class: 'rt-laspc' });
  for (let j = 0; j < n; j++) cells.append(h('div', { class: 'rt-lasp1' }, h('span', { class: 'mono' }, dpLabel(j)), valueCell(P, D, DP_KEYS[j], i)));
  const grow = m => { (WS.ph || (WS.ph = {}))[sid] = m; };
  if (n < DP_N) cells.append(h('button', { type: 'button', class: 'rt-link', 'aria-label': 'Add the ' + dpLabel(n) + ' phase term to surface ' + (i + 1), onclick: () => { grow(n + 1); renderWs(); } }, 'Add ' + dpLabel(n)));
  cells.append(h('button', { type: 'button', class: 'rt-link', title: 'Take the last term off (its value set to 0, and its variable, solve or pickup cleared)', onclick: () => {
    const key = keyAt(P, DP_KEYS[n - 1], i);
    grow(n - 1);
    edit((PP, a) => { const at = posOf(PP, key); if (at) setV(PP, at, 0); const dd = designOf(a); dd.vars = dd.vars.filter(k => k !== key); delete dd.solves[key]; delete dd.pickups[key]; });
  } }, n > 1 ? 'Remove ' + dpLabel(n - 1) : 'No phase'));
  return h('tr', { class: 'asp' }, h('td'), h('td', { class: 'nm asp', title: 'The phase written on the face, radians at ρ mm from the axis, in the lens’s order of diffraction' }, 'diffractive phase'), h('td', { colspan: String(5 + nPose) }, cells));
}
/* a graded glass's terms, a row under the surface it follows: g₂r² … each typed, varied, solved or picked up; one more, or the last taken off */
function grRow(P, D, i, sid, n, nPose) {
  const cells = h('div', { class: 'rt-laspc' }), keys = ['n2', 'n4', 'n6'];
  for (let j = 0; j < n; j++) cells.append(h('div', { class: 'rt-lasp1' }, h('span', { class: 'mono' }, grLabel(j)), valueCell(P, D, keys[j], i)));
  const grow = m => { (WS.gr || (WS.gr = {}))[sid] = m; };
  if (n < GR_N) cells.append(h('button', { type: 'button', class: 'rt-link', 'aria-label': 'Add the ' + grLabel(n) + ' gradient term after surface ' + (i + 1), onclick: () => { grow(n + 1); renderWs(); } }, 'Add ' + grLabel(n)));
  cells.append(h('button', { type: 'button', class: 'rt-link', title: 'Take the last term off (its value set to 0, and its variable, solve or pickup cleared)', onclick: () => {
    const key = keyAt(P, keys[n - 1], i);
    grow(n - 1);
    edit((PP, a) => { const at = posOf(PP, key); if (at) setV(PP, at, 0); const dd = designOf(a); dd.vars = dd.vars.filter(k => k !== key); delete dd.solves[key]; delete dd.pickups[key]; });
  } }, n > 1 ? 'Remove ' + grLabel(n - 1) : 'Not graded'));
  return h('tr', { class: 'asp' }, h('td'), h('td', { class: 'nm asp', title: 'The index of the glass after this surface: n + g₂r² + g₄r⁴ + g₆r⁶, r mm from the lens\u2019s axis (mm⁻², mm⁻⁴, mm⁻⁶)' }, 'graded glass'), h('td', { colspan: String(5 + nPose) }, cells));
}
function asphRow(P, D, i, sid, nA, nPose) {
  const cells = h('div', { class: 'rt-laspc' });
  for (let j = 0; j < Math.min(nA, ASPH_ORDERS.length); j++) cells.append(h('div', { class: 'rt-lasp1' }, h('span', { class: 'mono' }, 'A' + ASPH_ORDERS[j]), valueCell(P, D, 'a' + ASPH_ORDERS[j], i)));
  const grow = n => { (WS.asp || (WS.asp = {}))[sid] = n; };
  if (nA < ASPH_ORDERS.length) cells.append(h('button', { type: 'button', class: 'rt-link', onclick: () => { grow(nA + 1); renderWs(); } }, 'Add A' + ASPH_ORDERS[nA]));
  cells.append(h('button', { type: 'button', class: 'rt-link', title: 'Take the last term off (its value set to 0, and its variable, solve or pickup cleared)', onclick: () => {
    const q = 'a' + ASPH_ORDERS[nA - 1], key = keyAt(P, q, i);
    grow(nA - 1);
    edit((PP, a) => { const at = posOf(PP, key); if (at) setV(PP, at, 0); const dd = designOf(a); dd.vars = dd.vars.filter(k => k !== key); delete dd.solves[key]; delete dd.pickups[key]; });
  } }, nA > 1 ? 'Remove A' + ASPH_ORDERS[nA - 1] : 'No aspheric terms'));
  return h('tr', { class: 'asp' }, h('td'), h('td', { class: 'nm asp' }, 'aspheric terms'), h('td', { colspan: String(5 + nPose) }, cells));
}
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
/* ---------- Configurations ----------
   The design in several states: a table of the values that differ between them, a column each;
   the active one's are the bench's, and showing another puts its values there. */
function cfgPicker(asm) {
  const M = mcOf(designOf(asm));
  if (!M) return [];
  const x = h('select', { class: 'rt-lcfgsel', 'aria-label': 'Configuration shown', title: 'The configuration on the bench, and in the layout, element data and analyses' }, ...M.configs.map((c, i) => h('option', { value: String(i) }, c.name)));
  x.value = String(M.active);
  x.addEventListener('change', fromField(x, () => cfgShow(+x.value)));
  return [x];
}
function cfgShow(ci) {
  optStop('Stopped: another configuration was shown.');
  tolStop('Stopped: another configuration was shown.');
  checkpoint();
  mcSwitch(WS.asm, ci);
  changed(true);
  renderWs();
}
/* a key in words: "Thickness after surface 3 (L1, back)" */
function keyLabel(P, sps, key) {
  const at = posOf(P, key);
  if (!at) return key;
  if (at.image) return 'Image distance';
  const what = { R: 'Radius', t: 'Thickness after', k: 'Conic of', T: 'Tilt of', D: 'Decentre of', U: 'Tilt out of the plane of', X: 'Decentre out of the plane of' }[at.q] || (at.q[0] === 'a' ? 'A' + at.q.slice(1) + ' of' : at.q[0] === 'f' ? 'Freeform ' + ffLabel(at.q.slice(1)) + ' of' : at.q[0] === 'p' ? 'Phase ' + dpLabel(+at.q[1] / 2 - 1) + ' of' : at.q[0] === 'n' ? 'Gradient ' + grLabel(+at.q[1] / 2 - 1) + ' after' : at.q);
  return (at.q === 'R' ? 'Radius of' : what) + ' surface ' + (at.i + 1) + ' (' + surfaceName(P, sps, at.i) + ')';
}
const KEY_UNIT = { R: 'mm', t: 'mm', T: '°', D: 'mm', U: '°', X: 'mm' };
function configsCard(asm, P) {
  const D = designOf(asm), M = mcOf(D), card = h('div', { class: 'rt-lcard rt-lcfg', role: 'tabpanel' });
  const fin = !!(asm.cond.object && asm.cond.object.kind === 'finite');
  const addBtn = h('button', { class: 'rt-btn', type: 'button', title: 'A copy of the configuration shown, to change', onclick: () => {
    checkpoint(); const r = mcAdd(asm); if (r !== true) { toast(r, true); return; } WS.tab = 'cfg'; changed(false); renderWs();
  } }, M ? 'Add a configuration' : 'Make configurations');
  if (!M) {
    card.append(helpLine('One design in several states, such as a zoom lens at each focal length.', ['One design in several states: a zoom lens at each of its focal lengths, or a lens refocused for nearer objects. Each configuration has its own values for the radii, thicknesses and spacings you choose' +
      (fin ? ', and its own object distance' : '') + '; everything else is shared. The merit function adds them up, each with a weight, and a variable that differs between them is optimised in each one.'], 'rt-lsub'), h('div', { class: 'rt-lbar' }, addBtn));
    if (!fin) card.append(h('p', { class: 'rt-lsub' }, 'To refocus for different object distances, set the object at a distance in the design conditions first.'));
    return card;
  }
  const sps = surfaceParts(P), nC = M.configs.length;
  // per configuration, solved: its first order, read only
  const solved = M.configs.map((c, ci) => ci === M.active ? P : cfgSolved(asm, P, ci));
  const figs = solved.map((Pc, ci) => { try { return designFigures({ cond: ci === M.active ? asm.cond : Object.assign({}, asm.cond, M.configs[ci].obj && fin ? { object: { kind: 'finite', d: M.configs[ci].obj } } : {}), design: D }, Pc); } catch (e) { return null; } });
  const cfgEdit = fn => { optStop('Stopped: a configuration was changed.'); tolStop('Stopped: a configuration was changed.'); checkpoint(); fn(); const notes = commitDesign(asm, designPrescription(asm)); if (notes.length) toast(notes.join(' '), true); changed(true); renderWs(); };
  const tbl = h('table', { class: 'rt-ltable rt-lcfgt' });
  const head = h('tr', null, h('th', { scope: 'col' }, ''));
  M.configs.forEach((c, ci) => {
    const nm = h('input', { type: 'text', class: 'rt-lcfgname', value: c.name, 'aria-label': 'Name of configuration ' + (ci + 1), spellcheck: 'false' });
    nm.addEventListener('change', fromField(nm, () => { checkpoint(); c.name = String(nm.value || 'Configuration ' + (ci + 1)).slice(0, 40); changed(false); renderWs(); }));
    head.append(h('th', { scope: 'col', class: ci === M.active ? 'on' : '' }, h('div', { class: 'rt-lcfgh' }, nm,
      ci === M.active ? h('span', { class: 'rt-lpill', title: 'On the bench, and in the layout, element data and analyses' }, 'Shown') : h('button', { type: 'button', class: 'rt-link', onclick: () => cfgShow(ci) }, 'Show'),
      h('button', { type: 'button', class: 'rt-lx', 'aria-label': 'Remove ' + c.name, title: 'Take this configuration out (with any merit term set for it alone)', onclick: () => { checkpoint(); mcRemove(asm, ci); changed(true); renderWs(); } }, '×'))));
  });
  tbl.append(h('thead', null, head));
  const tb = h('tbody');
  const row = (label, cells, extra) => tb.append(h('tr', extra || null, h('td', { class: 'nm' }, ...[].concat(label)), ...cells));
  row('Weight in the merit', M.configs.map((c, ci) => h('td', null, wsNumInput(c.w, v => { checkpoint(); c.w = Math.max(0, Math.min(1e3, v)); changed(false); renderWs(); }, { label: 'Weight of ' + c.name }))));
  if (fin) row('Object distance (mm)', M.configs.map((c, ci) => h('td', null, wsNumInput(ci === M.active ? asm.cond.object.d : c.obj || asm.cond.object.d, v => {
    if (!(v > 0)) { toast('An object distance is more than 0.', true); return; }
    if (ci === M.active) condEdit(cc => { cc.object.d = v; }); else cfgEdit(() => { c.obj = v; });
  }, { label: 'Object distance in ' + c.name }))));
  for (const key of M.keys) {
    const at = posOf(P, key);
    if (!at) continue;
    const sv = D.solves[key], pk = D.pickups[key], isVar = D.vars.includes(key) && !sv && !pk, fixed = !!(sv || pk);
    const lab = [keyLabel(P, sps, key) + (KEY_UNIT[at.q] && !at.image ? ', ' + KEY_UNIT[at.q] : at.image ? ', mm' : ''),
      h('span', { class: 'rt-lsub' }, sv ? ' solved' : pk ? ' picked up' : isVar ? ' varied in each' : ''),
      h('button', { type: 'button', class: 'rt-lx', 'aria-label': 'Share ' + keyLabel(P, sps, key) + ' again', title: 'One value for every configuration again (the one shown now)', onclick: () => { checkpoint(); mcKey(asm, P, key, false); changed(false); renderWs(); } }, '×')];
    row(lab, M.configs.map((c, ci) => {
      const v = mcValue(asm, P, ci, key), asp = at.q[0] === 'a';
      const shown = at.q === 'R' ? fmtR(v) : asp ? (v ? v.toExponential(5) : '0') : wsFmt(v, 7);
      if (fixed) return h('td', { class: 'mono ro' }, shown);
      const inp = h('input', { type: 'text', inputmode: 'decimal', class: 'rt-lnum' + (asp ? ' wide' : ''), value: shown, 'aria-label': keyLabel(P, sps, key) + ' in ' + c.name, spellcheck: 'false' });
      inp.addEventListener('change', fromField(inp, () => {
        const t = inp.value.trim().toLowerCase();
        const val = at.q === 'R' && (t === '' || t === 'flat' || t === 'inf' || t === '∞') ? null : parseNum(t);
        if (val === null && at.q !== 'R') { inp.value = shown; return; }
        if (at.q === 't' && !at.image && val < 0) { toast('A thickness can’t be negative.', true); inp.value = shown; return; }
        if (ci === M.active) edit(PP => { setV(PP, posOf(PP, key), val); });
        else cfgEdit(() => { c.v[key] = val; });
      }));
      return h('td', null, inp);
    }));
  }
  // what each one gives
  const ro = (label, fn) => row(label, figs.map(F => h('td', { class: 'mono ro' }, F ? fn(F) : '—')), { class: 'ro' });
  ro('Focal length (mm)', F => isFinite(F.efl) ? wsFmt(F.efl, 6) : 'afocal');
  ro('Working F-number', F => isFinite(F.fno) ? 'f/' + wsFmt(Math.abs(F.fno), 4) : '—');
  if (fin) ro('Magnification', F => wsFmt(F.mag, 5));
  ro('Image height (mm)', F => wsFmt(Math.abs(F.imgH), 5));
  ro('Total track (mm)', F => wsFmt(F.track, 6));
  tbl.append(tb);
  card.append(h('div', { class: 'rt-ltwrap' }, tbl));
  // a value made to differ: any radius, thickness, conic, tilt or decentre not yet listed
  const opts = [];
  for (let i = 0; i < P.surfaces.length; i++) for (const q of ['R', 't', 'k', 'T', 'D', 'U', 'X']) {
    if (!editable(P, q, i)) continue;
    const k = keyAt(P, q, i);
    if (!M.keys.includes(k)) opts.push([k, keyLabel(P, sps, k)]);
  }
  for (let i = 0; i < P.surfaces.length; i++) for (const n of ASPH_ORDERS) { if (!editable(P, 'a' + n, i) || !(P.surfaces[i].A || [])[(n - 4) / 2]) continue; const k = keyAt(P, 'a' + n, i); if (!M.keys.includes(k)) opts.push([k, keyLabel(P, sps, k)]); }
  const pick = h('select', { 'aria-label': 'Value to make differ between the configurations' }, ...opts.map(([k, t]) => h('option', { value: k }, t)));
  card.append(h('div', { class: 'rt-lbar' }, pick, h('button', { class: 'rt-btn', type: 'button', disabled: opts.length ? null : '', title: 'Give each configuration its own value of it, starting from the one it has now', onclick: () => {
    checkpoint(); mcKey(asm, designPrescription(asm), pick.value, true); changed(false); renderWs();
  } }, 'Make it differ'), addBtn));
  card.append(helpLine('The configuration shown is the one on the bench.', ['The configuration shown is the one on the bench and in the layout, element data, analyses, drawings and tolerancing. A value marked V that differs between configurations is optimised in each; one shared is optimised once for all. A merit term is measured in every configuration unless set for one. Solves are worked out in each configuration.'], 'rt-lsub'));
  return card;
}

const OP_LABEL = { EFL: 'Focal length (mm)', FNO: 'Working F-number', TTL: 'Total track (mm)', DIST: 'Distortion at the largest field (%)',
  SI: 'Spherical, SI (mm)', SII: 'Coma, SII (mm)', SIII: 'Astigmatism, SIII (mm)', SIV: 'Petzval, SIV (mm)', SV: 'Distortion, SV (mm)', CL: 'Axial colour, CL (mm)', CT: 'Lateral colour, CT (mm)',
  BFL: 'Back focal length (mm)', IMD: 'Image distance, paraxial (mm)', MAG: 'Magnification, paraxial', NA: 'NA in image space', XPD: 'Exit pupil before the image (mm)',
  IMH: 'Chief ray’s height on the image (mm)', CRA: 'Chief ray’s angle at the image (°)', RAYY: 'A ray’s height on the image (mm)',
  MTFT: 'MTF, tangential', MTFS: 'MTF, sagittal', MTFA: 'MTF, mean of the two' };
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
  const cfgs = R.configs, nf = asm.cond.fields.length;
  R.fields.forEach((f, i) => tb.append(h('tr', null, h('td', null, (cfgs ? cfgs[f.cfg] + ': ' : '') + (wf ? 'Wavefront' : 'Spot') + ', field ' + wsFmt(f.deg, 4) + (asm.cond.object ? ' mm' : '°')), h('td', { class: 'mono ro' }, '0'),
    h('td', { class: 'mono ro', title: 'The field’s weight, set in the design conditions' }, wsFmt(asm.cond.fields[i % nf].w, 4)),
    h('td', { class: 'mono' }, wf ? wsFmt(f.rms, 4) + ' waves' : wsFmt(1000 * f.rms, 4) + ' µm'), h('td', null, share(f.share)), h('td'))));
  // a term at a field: which one; a ray: where in the pupil
  const fin = !!asm.cond.object, opWhere = (o, i) => {
    const out = [];
    if (MERIT_AT_FIELD.includes(o.op)) out.push(sel('Field of ' + OP_LABEL[o.op], asm.cond.fields.map((f, j) => [j, 'at ' + wsFmt(f.deg, 4) + (fin ? ' mm' : '°')]), Math.min(o.f === undefined ? 99 : o.f, asm.cond.fields.length - 1), v => meritEdit(m => { m.ops[i].f = +v; })));
    if (MERIT_AT_PUPIL.includes(o.op)) out.push(h('span', null, ' pupil y '), wsNumInput(o.p, v => meritEdit(m => { m.ops[i].p = Math.max(-1, Math.min(1, v)); }), { label: 'Pupil of ' + OP_LABEL[o.op] }));
    if (MERIT_AT_FREQ.includes(o.op)) out.push(wsNumInput(o.v, v => meritEdit(m => { m.ops[i].v = Math.max(0, v); }), { label: 'Frequency of ' + OP_LABEL[o.op] }), h('span', null, 'cycles/mm'));
    return out;
  };
  // with configurations: each term once, in every configuration or in one, its value in each it is measured in
  const rows = cfgs ? M.ops.map((o, j) => { const at = R.ops.filter(r => r.j === j); return Object.assign({}, o, { at, share: at.reduce((a, r) => a + r.share, 0) }); }) : R.ops;
  rows.forEach((o, i) => tb.append(h('tr', null, h('td', null, h('div', { class: 'rt-lopw' }, OP_LABEL[o.op], ...opWhere(o, i),
      ...(cfgs ? [sel('Configuration of ' + OP_LABEL[o.op], [[-1, 'in every configuration']].concat(cfgs.map((n, c) => [c, 'in ' + n])), o.c === undefined ? -1 : o.c, v => meritEdit(m => { if (+v < 0) delete m.ops[i].c; else m.ops[i].c = +v; }))] : []))),
    h('td', null, wsNumInput(o.target, v => meritEdit(m => { m.ops[i].target = v; }), { label: 'Target of ' + OP_LABEL[o.op] })),
    h('td', null, wsNumInput(o.weight, v => meritEdit(m => { m.ops[i].weight = v; }), { label: 'Weight of ' + OP_LABEL[o.op] })),
    h('td', { class: 'mono', title: cfgs ? o.at.map(r => cfgs[r.cfg] + ': ' + wsFmt(r.value, 6)).join('\n') : '' }, cfgs ? o.at.map(r => wsFmt(r.value, 6)).join(' · ') : wsFmt(o.value, 6)), h('td', null, share(o.share)),
    h('td', null, h('button', { class: 'rt-lx', type: 'button', 'aria-label': 'Remove ' + OP_LABEL[o.op], onclick: () => meritEdit(m => { m.ops.splice(i, 1); }) }, '×')))));
  tb.append(h('tr', null, h('td', null, 'Boundaries'), h('td', { class: 'ro', colspan: '2' }, R.bounds.broken.length ? R.bounds.broken.length + ' broken' : 'all kept'), h('td'), h('td', null, share(R.bounds.share)), h('td')));
  tbl.append(tb);
  card.append(h('div', { class: 'rt-ltwrap' }, tbl));
  const add = sel('Term to add', MERIT_OPS.map(k => [k, OP_LABEL[k]]), 'EFL', () => {});
  card.append(h('div', { class: 'rt-lbar' }, add, h('button', { class: 'rt-btn', type: 'button', onclick: () => {
    const F = designFigures(asm, P), now = { EFL: F.efl, FNO: Math.abs(F.fno), TTL: F.track, BFL: F.bfl, IMD: F.imgDist, MAG: F.mag, NA: F.S.n[F.S.N] * F.S.epr * Math.abs(F.S.par.uEp), XPD: F.S.imageZ - F.S.par.xpz }[add.value];
    meritEdit(m => { m.ops.push({ op: add.value, target: isFinite(now) ? +now.toPrecision(6) : 0, weight: 1, ...(MERIT_AT_FIELD.includes(add.value) ? { f: asm.cond.fields.length - 1 } : {}), ...(MERIT_AT_PUPIL.includes(add.value) ? { p: 1 } : {}), ...(MERIT_AT_FREQ.includes(add.value) ? { v: 50, target: 1 } : {}) }); });
  } }, 'Add a term')));
  if (R.bounds.broken.length) card.append(h('div', { class: 'rt-lnote' }, 'Broken: ' + R.bounds.broken.map(b => b.what).join('; ') + '.'));
  const B = M.bounds, bnum = (label, k, t) => h('label', { class: 'rt-lbnd', title: t || '' }, label, wsNumInput(B[k], v => meritEdit(m => { m.bounds[k] = Math.max(0, v); }), { label }));
  card.append(h('h3', null, 'Boundaries every design keeps to (mm)'), h('div', { class: 'rt-lbnds' },
    bnum('Glass at the centre, at least', 'glassMin'), bnum('Glass at the centre, at most', 'glassMax', '0 for no limit'),
    bnum('Glass at the edge, at least', 'edgeMin'), bnum('Air between lenses, at least', 'airMin', 'At the centre and at the edge'),
    bnum('Aspheric departure, at most', 'aspMax', 'The sag the aspheric terms add to a surface, anywhere over its clear radius; 0 for no limit'),
    bnum('Departure’s slope, at most (°)', 'slopeMax', 'How steep the aspheric terms’ own sag may get, in degrees; 0 for no limit')));
  card.append(helpLine('The merit: the weighted RMS of its terms.', ['The merit is the square root of the sum of the squared terms over the image’s weight and the terms’ weights. A boundary counts only while it is broken. Rays are traced through every surface whatever its clear radius.'], 'rt-lsub'));
  return card;
}

/* ---------- Optimising ----------
   A few cycles (or trials) at a time, in the background worker where there is one, each batch's
   result written to the design and shown before the next; Stop ends it, Undo takes it all back. */
let OPT = null;
export function lensTolRun(mode, sync) { if (!WS) return null; tolStart(mode, { asm: WS.asm, P: designPrescription(WS.asm), redraw: renderWs, sync: sync !== false, state: WS.tolState || (WS.tolState = {}) }); return lensTolState(); }
export const lensOptState = () => OPT && { running: OPT.running, mode: OPT.mode, start: OPT.start, now: OPT.now, cycles: OPT.cycles, trials: OPT.trials, better: OPT.better, note: OPT.note, subs: OPT.sub ? OPT.sub.log.map(l => ({ gi: l.gi, from: l.from, to: l.to, merit: l.merit, tried: l.tried.length })) : null };
function optStop(note) { if (OPT && OPT.running) { OPT.running = false; OPT.note = note || 'Stopped.'; if (WS) renderWs(); } }
export function optStart(mode, opts) {
  if (!WS) return false;
  const asm = WS.asm, P = designPrescription(asm), prob = optProblem(asm, P), V = optVars(prob);
  if (mode === 'subst' && !substIndices(prob).length) { toast('No glass to substitute: mark a lens\u2019s glass V in the element data first.', true); return false; }
  if (mode !== 'subst' && !V.length) { toast('Nothing to vary: mark values V in the element data first.', true); return false; }
  checkpoint();
  const R = meritReport(prob);
  OPT = { id: asm.id, mode, running: true, start: R.merit, now: R.merit, cycles: 0, trials: 0, better: 0, seed: (opts && opts.seed) || 1, lambda: undefined, t0: performance.now(), note: '',
    maxTrials: (opts && opts.trials) || 200, sync: !!(opts && opts.sync) };
  if (mode === 'subst') {
    const S = WS.subst || (WS.subst = { makers: GLASS_MAKERS.slice(), n: 12 });
    OPT.sub = { list: substIndices(prob), li: 0, pass: 0, moved: false, cands: null, ci: 0, tried: [], base: null, log: [], makers: (opts && opts.makers) || S.makers, n: (opts && opts.n) || S.n };
  }
  renderWs();
  if (OPT.sync) { while (OPT.running) optBatch(); return true; }
  setTimeout(optBatch, 0);
  return true;
}
function optBatch() {
  const O = OPT;
  if (!O || !O.running || !WS || WS.asm.id !== O.id) return;
  const asm = WS.asm, prob = optProblem(asm, designPrescription(asm));
  if (O.mode === 'subst') { substBatch(O, asm, prob); return; }
  const run = O.mode === 'global' ? { mode: 'global', trials: 2, seed: O.seed++ } : { mode: 'dls', iters: 4, lambda: O.lambda };
  const take = out => {
    if (OPT !== O || !O.running || !WS) return;
    if (!out) { O.running = false; O.note = 'Stopped: the background worker was busy.'; renderWs(); return; }
    if (out.merit < O.now || O.mode === 'dls') {
      const P2 = designPrescription(asm);
      optApply(P2, prob, out, designOf(asm));
      commitDesign(asm, P2);
      changed(false);
    }
    O.now = Math.min(O.now, out.merit); O.cycles += out.iters; O.trials += out.tried; O.better += out.better; O.lambda = out.lambda;
    // the global search's designs, kept with the design: the best distinct ones it has reached
    if (out.found && out.found.length) { const dd = designOf(asm), L = dd.found || (dd.found = []), t = Date.now(); for (const f of out.found) keepFound(L, { vars: out.vars, x: f.x, merit: f.merit, t }); changed(false); }
    if (O.mode === 'dls' && out.done) { O.running = false; O.note = 'Done: no step makes it better.'; }
    if (O.mode === 'global' && O.trials >= O.maxTrials) { O.running = false; O.note = 'Done: ' + O.trials + ' trials.'; }
    renderWs();
    if (O.running && !O.sync) setTimeout(optBatch, 0);
  };
  if (O.sync || TEST_MODE || !hooks.fieldWorker()) take(optRun(prob, run));
  else hooks.fwRequest('lensopt', 'lensopt', { prob, run }).then(o => take(o && o.out)).catch(() => take(null));
}
/* One step of glass substitution (lens-opt.js): the glass at hand settled as it is, or one candidate tried in its
   place, the rest of the design optimised again from where it is; once every candidate has been, the best is
   put in (if better than the glass there; a model glass always goes), and the next glass taken */
const SUBST_ITERS = 12;
function substBatch(O, asm, prob) {
  const S = O.sub, gi = S.list[S.li];
  if (!S.cands) { S.cands = glassCandidates(prob, gi, S.makers, S.n); S.ci = isModel(prob.P.materials[gi]) ? 0 : -1; S.tried = []; S.base = null; }
  const k = S.ci < 0 ? null : S.cands[S.ci], p = k ? withGlass(prob, gi, k) : prob;
  O.trying = k ? 'Trying ' + k + ' (' + (S.ci + 1) + ' of ' + S.cands.length + ') for the glass after surface ' + (gi + 1) : 'Settling the glass after surface ' + (gi + 1) + ' as it is';
  const take = out => {
    if (OPT !== O || !O.running || !WS) return;
    if (!out) { O.running = false; O.note = 'Stopped: the background worker was busy.'; renderWs(); return; }
    O.cycles += out.iters;
    if (k) S.tried.push({ k, merit: out.merit, out, p }); else S.base = { merit: out.merit, out, p };
    S.ci++;
    if (S.ci >= S.cands.length) {
      S.tried.sort((a, b) => a.merit - b.merit);
      const best = S.tried[0], from = isModel(prob.P.materials[gi]) ? 'model glass' : prob.P.materials[gi].glass;
      const pick = best && (!S.base || best.merit < S.base.merit * (1 - 1e-6)) ? best : S.base;
      if (pick) {
        const P2 = designPrescription(asm);
        if (pick !== S.base) { P2.materials[gi] = Object.assign({}, P2.materials[gi], { glass: best.k }); delete P2.materials[gi].nd; delete P2.materials[gi].vd; }
        optApply(P2, pick.p, pick.out, designOf(asm));
        commitDesign(asm, P2); changed(false);
        O.now = pick.merit;
      }
      S.log.push({ gi, from, to: pick === S.base ? null : best && best.k, merit: pick ? pick.merit : NaN, tried: S.tried.map(t => [t.k, t.merit]) });
      if (pick && pick !== S.base) S.moved = true;
      S.cands = null; S.li++;
      if (S.li >= S.list.length) {
        S.pass++; S.li = 0;
        if (!S.moved || S.pass >= 3) { O.running = false; O.trying = ''; O.note = 'Done: ' + S.pass + (S.pass === 1 ? ' pass' : ' passes') + ' over ' + S.list.length + (S.list.length === 1 ? ' glass' : ' glasses') + (S.moved ? '.' : '; no glass did better than the ones there.'); }
        S.moved = false;
      }
    }
    renderWs();
    if (O.running && !O.sync) setTimeout(optBatch, 0);
  };
  const run = { mode: 'dls', iters: SUBST_ITERS };
  if (O.sync || TEST_MODE || !hooks.fieldWorker()) take(optRun(p, run));
  else hooks.fwRequest('lensopt', 'lensopt', { prob: p, run }).then(o => take(o && o.out)).catch(() => take(null));
}
/* each variable, its value now, and the least and greatest the optimiser may take it to */
function limitsCard(asm, prob, V, running) {
  const L = designOf(asm).lims || {}, x = optValues(prob), at = atLimits(prob, V, x), tb = h('tbody');
  const setLim = (id, side, txt) => edit((PP, a) => {
    const dd = designOf(a), all = Object.assign({}, dd.lims || {}), cur = Object.assign({}, all[id] || {}), t = String(txt).trim();
    if (t === '') delete cur[side]; else { const n = parseNum(t); if (n === null) return 'Not a number: ' + t; cur[side] = n; }
    all[id] = cur;
    const L2 = normLims(all), R = PP && limitBad(prob.P, id, L2 && L2[id]);
    if (R) return R;
    if (L2) dd.lims = L2; else delete dd.lims;
    return false;
  });
  V.forEach((v, j) => {
    const id = limitKey(v), m = L[id] || {}, can = LIMITED(v.at.q) && v.cfg === undefined, name = foundLabel({ k: v.k, part: v.part || null, cfg: v.cfg === undefined ? null : v.cfg });
    const box = side => can ? h('input', { type: 'text', inputmode: 'decimal', class: 'rt-lnum', value: isFinite(m[side]) ? wsFmt(m[side]) : '', placeholder: 'none', 'aria-label': (side === 'lo' ? 'Least ' : 'Greatest ') + name, disabled: running ? '' : null,
      onchange: e => setLim(id, side, e.target.value) }) : h('span', { class: 'rt-lsub' }, '\u2014');
    tb.append(h('tr', { class: at[j] ? 'on' : '' }, h('td', null, name), h('td', { class: 'mono' }, foundVal({ k: v.k, part: v.part || null }, x[j])), h('td', null, box('lo')), h('td', null, box('hi')),
      h('td', { class: 'rt-lsub' }, at[j] ? 'at its limit' : '')));
  });
  const det = h('details', { class: 'rt-llims' }, h('summary', null, 'Limits on the variables' + (Object.keys(L).length ? ' (' + Object.keys(L).length + ' set)' : '')),
    h('div', { class: 'rt-ltwrap' }, h('table', { class: 'rt-ltable' }, h('thead', null, h('tr', null, ...['Variable', 'Now', 'Least', 'Greatest', ''].map(t => h('th', { scope: 'col' }, t)))), tb)),
    helpLine('The optimiser keeps each value within its limits.', ['The optimiser never takes a value past its limits, in the units the element data shows (radii, thicknesses and decentres in mm, tilts in degrees). A radius limited keeps the sign of its limits: between two of one sign, or one alone on its own side of flat (at least 20: from 20 out to flat; at most -20: from -20 out to flat). Aspheric, freeform, phase and gradient terms, and values each configuration has its own of, take no limits.'], 'rt-lsub'));
  if (WS.limsOpen || Object.keys(L).length) det.open = true;
  det.addEventListener('toggle', () => { if (WS) WS.limsOpen = det.open; });
  return det;
}
/* why a radius's limits can't be kept (two of opposite signs), or null */
function limitBad(P, id, m) {
  if (!m || id[0] !== 'R' || !isFinite(m.lo) || !isFinite(m.hi)) return null;
  return m.lo * m.hi <= 0 ? 'A radius\u2019s two limits must be of one sign: a radius between them would pass through flat' : null;
}
/* a kept value as the element data shows it: 'R:Front.1' as Front R2, a radius from its curvature (flat at none) */
const foundLabel = v => { const m = /^([A-Za-z]\w*):(.*)\.(\d+)$/.exec(v.k); return m ? ((getEl(m[2]) || {}).name || m[2]) + ' ' + (m[1] === 'g' ? 'glass ' + (v.part || '') : m[1] + (+m[3] + 1)) + (v.cfg !== null && v.cfg !== undefined ? ' (configuration ' + (v.cfg + 1) + ')' : '') : v.k === 't:image' ? 'image distance' : v.k; };
const foundVal = (v, x) => v.k[0] === 'R' && !v.part ? (Math.abs(x) < 1e-12 ? 'flat' : wsFmt(1 / x, 5)) : wsFmt(x, 5);
/* the designs kept: those the global search found (the best distinct ones), and any kept by hand; each can be
   put back, its variables' values as they were, the rest of the design as it is now */
function foundCard(asm, P, prob, V, running) {
  const D = designOf(asm), L = D.found || [], wrap = h('div', { class: 'rt-lfound' });
  const keep = h('button', { class: 'rt-btn', type: 'button', disabled: running || !V.length ? '' : null, title: 'Keep the design as it is now in this list, to come back to',
    onclick: () => edit((PP, a) => { const pr = optProblem(a, PP), VV = optVars(pr), dd = designOf(a), x = optValues(pr);
      keepFound(dd.found || (dd.found = []), { vars: VV.map(v => ({ k: v.k, part: v.part || null, cfg: v.cfg === undefined ? null : v.cfg })), x, merit: meritReport(pr).merit, t: Date.now(), by: 'hand' }); return false; }) }, 'Keep this design');
  wrap.append(h('div', { class: 'rt-lrow' }, h('b', null, 'Designs kept'), keep,
    L.length ? h('button', { class: 'rt-link', type: 'button', disabled: running ? '' : null, onclick: () => edit((PP, a) => { delete designOf(a).found; return false; }) }, 'Clear the list') : null));
  if (!L.length) { wrap.append(h('p', { class: 'rt-lsub' }, 'A global search keeps here the ' + FOUND_MAX + ' best distinct designs it reaches, best first, saved with the design: a design a little worse may be easier to make. Keep this design adds the design as it is now.')); return wrap; }
  const now = meritReport(prob).merit, tb = h('tbody');
  const curX = optValues(prob);
  L.forEach((f, i) => {
    const same = f.vars.length === V.length && f.vars.every((v, j) => v.k === V[j].k && (v.part || null) === (V[j].part || null)), here = same && sameDesign(f.x, curX);
    const vals = f.vars.slice(0, 4).map((v, j) => foundLabel(v) + ' ' + foundVal(v, f.x[j])).join(', ') + (f.vars.length > 4 ? ', \u2026' : '');
    tb.append(h('tr', { class: here ? 'on' : '' }, h('td', null, String(i + 1)), h('td', { class: 'mono' }, wsFmt(f.merit, 5)),
      h('td', null, (f.by === 'hand' ? 'kept by hand' : 'global search') + (f.t ? ', ' + new Date(f.t).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '')),
      h('td', { class: 'rt-lsub' }, vals + (same ? '' : ' (other variables than now)')),
      h('td', null, here ? h('span', { class: 'rt-lsub' }, 'the design now') : h('button', { class: 'rt-link', type: 'button', disabled: running ? '' : null, 'aria-label': 'Use design ' + (i + 1),
        onclick: () => edit((PP, a) => { optApply(PP, optProblem(a, PP), f, designOf(a)); }) }, 'Use'),
        ' ', h('button', { class: 'rt-link', type: 'button', disabled: running ? '' : null, 'aria-label': 'Remove design ' + (i + 1), onclick: () => edit((PP, a) => { const dd = designOf(a); dd.found = (dd.found || []).filter(g => g !== dd.found[i]); if (!dd.found.length) delete dd.found; return false; }) }, 'Remove'))));
  });
  wrap.append(h('div', { class: 'rt-ltwrap' }, h('table', { class: 'rt-ltable rt-lfoundt' }, h('thead', null, h('tr', null, ...['', 'Merit when kept', 'From', 'Values', ''].map(t => h('th', { scope: 'col' }, t)))), tb)));
  wrap.append(h('p', { class: 'rt-lsub' }, 'The merit now: ' + wsFmt(now, 5) + '. Use puts a design\u2019s values back (Undo takes them out again); its merit is as it was when kept, under the merit function then.'));
  return wrap;
}
function optCard(asm, P) {
  const prob = optProblem(asm, P), V = optVars(prob), O = OPT && OPT.id === asm.id ? OPT : null, running = !!(O && O.running);
  const card = h('div', { class: 'rt-lcard rt-lopt', role: 'tabpanel' });
  const count = q => V.filter(v => v.at.q === q && v.part !== 'vd').length;
  card.append(h('p', null, 'Variables: ', h('b', null, String(V.length)), V.length ? ' (radii ' + count('R') + ', thicknesses ' + count('t') + ', conics ' + count('k') + (count('g') ? ', model glasses ' + count('g') + ', each its nd and Vd' : '') + ')' : ' — mark values V in the element data.'));
  if (V.length) card.append(limitsCard(asm, prob, V, running));
  WS.method = WS.method || 'dls';
  const radio = (k, label, t) => h('button', { type: 'button', role: 'radio', class: 'rt-ltab', 'aria-checked': String(WS.method === k), 'aria-selected': String(WS.method === k), title: t, disabled: running ? '' : null, onclick: () => { WS.method = k; renderWs(); } }, label);
  card.append(h('div', { class: 'rt-ltabs', role: 'radiogroup', 'aria-label': 'Method' },
    radio('dls', 'Damped least squares', 'Downhill from where the design is, to the nearest minimum'),
    radio('global', 'Global search', 'Again and again from the best design yet, shaken, keeping what is better: for a better minimum than the nearest'),
    radio('subst', 'Substitute glasses', 'Each glass marked V tried as the catalogue glasses nearest it, the rest optimised again with each, the best kept')));
  if (WS.method === 'subst') {
    const S = WS.subst || (WS.subst = { makers: GLASS_MAKERS.slice(), n: 12 }), nG = substIndices(prob).length;
    const box = mk => { const c = h('input', { type: 'checkbox', disabled: running ? '' : null }); c.checked = S.makers.includes(mk); c.addEventListener('change', () => { S.makers = c.checked ? S.makers.concat([mk]) : S.makers.filter(x => x !== mk); if (!S.makers.length) S.makers = [mk]; renderWs(); }); return h('label', { class: 'rt-check' }, c, mk); };
    const num = h('input', { type: 'text', inputmode: 'numeric', class: 'rt-lnum', value: String(S.n), 'aria-label': 'Candidates for each glass', disabled: running ? '' : null });
    num.addEventListener('change', () => { const v = Math.round(+num.value); S.n = isFinite(v) ? Math.max(1, Math.min(200, v)) : 12; renderWs(); });
    card.append(h('div', { class: 'rt-lsubst' }, h('div', { class: 'rt-lrow', role: 'group', 'aria-label': 'Makers' }, h('span', { class: 'rt-lsub' }, 'From'), ...GLASS_MAKERS.map(box)),
      h('label', { class: 'rt-lrow' }, h('span', { class: 'rt-lsub' }, 'Candidates for each glass, nearest on the glass map'), num),
      helpLine(nG ? nG + (nG === 1 ? ' glass' : ' glasses') + ' marked V to substitute.' : 'Mark a lens’s glass V in the element data to substitute it.', [nG ? nG + (nG === 1 ? ' glass' : ' glasses') + ' marked V to substitute. Each candidate transmits at every wavelength of the design; with each, the rest of the design is optimised again, and the best is kept if it is better than the glass there.' : 'Mark a lens\u2019s glass V in the element data to substitute it.'], 'rt-lsub')));
  }
  card.append(h('div', { class: 'rt-lbar' }, running
    ? h('button', { class: 'rt-btn primary', type: 'button', onclick: () => optStop('Stopped.') }, 'Stop')
    : h('button', { class: 'rt-btn primary', type: 'button', disabled: (WS.method === 'subst' ? substIndices(prob).length : V.length) ? null : '', onclick: () => optStart(WS.method) }, WS.method === 'subst' ? 'Substitute the glasses' : 'Optimise the design')));
  const R = O ? null : meritReport(prob);
  const rows = O ? [['Merit at the start', wsFmt(O.start, 5)], ['Merit now', wsFmt(O.now, 5) + (O.start > 0 ? ' (' + (100 * (1 - O.now / O.start)).toFixed(1) + '% lower)' : '')],
    O.mode === 'subst' ? ['Glasses tried', String(O.sub.log.reduce((a, l) => a + l.tried.length, 0) + (O.sub.cands ? O.sub.tried.length : 0))] : [O.mode === 'global' ? 'Trials' : 'Cycles', O.mode === 'global' ? O.trials + ' (' + O.better + ' better)' : String(O.cycles)]] : [['Merit now', wsFmt(R.merit, 5)]];
  card.append(h('div', { class: 'rt-readout' }, h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', { class: 'mono' }, b)]))));
  if (O && (O.note || running)) card.append(h('div', { class: 'rt-lnote', role: 'status' }, running ? (O.mode === 'global' ? 'Searching… it carries on until you stop it.' : O.mode === 'subst' ? (O.trying || 'Substituting…') + '…' : 'Optimising…') : O.note));
  if (O && O.mode === 'subst' && O.sub.log.length) {
    const tb = h('tbody');
    for (const L of O.sub.log) tb.append(h('tr', null, h('td', null, 'After surface ' + (L.gi + 1)), h('td', null, L.from), h('td', null, L.to || 'kept'), h('td', { class: 'mono' }, wsFmt(L.merit, 5)),
      h('td', { class: 'rt-lsub' }, L.tried.slice(0, 3).map(([k, m]) => k + ' ' + wsFmt(m, 4)).join(', '))));
    card.append(h('div', { class: 'rt-ltwrap' }, h('table', { class: 'rt-ltable rt-lsublog' }, h('thead', null, h('tr', null, ...['Glass', 'Was', 'Now', 'Merit', 'Best tried'].map(t => h('th', { scope: 'col' }, t)))), tb)));
  }
  const models = P.materials.map((m, i) => isModel(m) ? i : -1).filter(i => i >= 0);
  if (models.length) card.append(h('div', { class: 'rt-lbar' }, h('button', { class: 'rt-btn', type: 'button', disabled: running ? '' : null,
    title: 'Each model glass replaced by the catalogue glass nearest it in nd and Vd; optimise again after', onclick: () => {
      const names = [];
      edit((PP, a) => { const dd = designOf(a); for (const i of models) { const m = PP.materials[i], k = nearestGlass(m.nd, m.vd); if (k) { PP.materials[i] = { glass: k }; names.push(k); dd.vars = dd.vars.filter(v => v !== keyAt(PP, 'g', i)); } } });
      toast('Model glasses replaced by ' + names.join(', ') + '. Optimise again to settle the design on them.');
    } }, 'Replace model glasses with the nearest real ones'), h('span', { class: 'rt-lsub' }, models.length + ' model glass' + (models.length === 1 ? '' : 'es'))));
  card.append(h('p', { class: 'rt-lsub' }, 'Runs in the background; the design, and its parts on the bench, change as it goes. Undo takes it back to where it started.'));
  card.append(foundCard(asm, P, prob, V, running));
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
    let src;
    if (F.object) {
      // a point on the object, its fan filling the entrance pupil
      const dep = F.object + F.epz, h = f.deg, a1 = Math.atan((F.epd / 2 - h) / dep), a2 = Math.atan((-F.epd / 2 - h) / dep), pp = [-d[1], d[0]];
      const x = P.origin[0] - d[0] * F.object + pp[0] * h, y = P.origin[1] - d[1] * F.object + pp[1] * h;
      src = normElement({ type: 'source', name: 'Object point ' + wsFmt(h, 4) + ' mm', x, y, angle: (a0 + (a1 + a2) / 2) / deg, wavelength: pr, lines: nms.filter(n => n !== pr), width: 0, rays: 9, divergence: (a1 - a2) / deg, bench: asm.bench, ...(ref.z !== undefined ? { z: ref.z } : {}) });
    } else {
      // aimed through the entrance pupil's centre, as wide as the pupil
      const a = a0 + f.deg * deg, x = ep[0] - back * Math.cos(a), y = ep[1] - back * Math.sin(a);
      src = normElement({ type: 'source', name: 'Field ' + wsFmt(f.deg, 4) + '°', x, y, angle: a / deg, wavelength: pr, lines: nms.filter(n => n !== pr), width: F.epd, rays: 9, divergence: 0, bench: asm.bench, ...(ref.z !== undefined ? { z: ref.z } : {}) });
    }
    made.push(src);
  });
  // the image along the axis, folded where the assembly folds it
  const im = asmAxisAt(P, F.S.imageZ), ip = im.p;
  const scr = normElement({ type: 'screen', name: 'Image of ' + asm.name, x: ip[0], y: ip[1], angle: Math.atan2(im.d[1], im.d[0]) / deg + 180, length: Math.max(4, Math.ceil(2.4 * Math.abs(F.imgH) + 2)), bench: asm.bench, ...(ref.z !== undefined ? { z: ref.z } : {}) });
  made.push(scr);
  for (const e of made) project.elements.push(e);
  toast('Placed ' + asm.name + ' with ' + c.fields.length + ' source' + (c.fields.length === 1 ? '' : 's') + (F.object ? ' on its object' : '') + ' and a screen at its image');
  return made;
}
