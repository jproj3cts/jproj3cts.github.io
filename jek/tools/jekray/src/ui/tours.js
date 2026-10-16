import { BEAM_Z, EMBED, IN_WORKER, LOCKED, TEST_MODE, clamp, cloud } from '../core/constants.js';
import { newLensDesign } from './assembly.js';
import { V, normMat, project, selectOne, setFuture, setHistory, typeLabel } from '../state/project.js';
import { getEl, selected } from '../state/elements.js';
import { curBench, ensureBenches, onTab } from '../state/tabs.js';
import { lastTrace, setZ, zOf } from '../engines/trace.js';
import { W, requestRender, stage } from './render.js';
import { snapVal } from './pointer.js';
import { allSweeps, paramLabel, pauseAll, playAll, syncPhases } from './sweeps.js';
import { V3D } from './view3d.js';
import {
  GOAL_LABEL, METRIC_FAMS, drawConvergence, drawHistogram, drawScan, measurable, metricByKey,
  metricKind, metricRaw, metricText, metricsFor, monteCarlo, optimiseGen, sensitivity
} from './optimise.js';
import { benchGear, h, renderPanel, setPanelClosed } from './panel.js';
import { materialWanted, parseNK, plotSaveRow, setMaterialWanted } from './plots.js';
import { screenStats } from '../engines/screen-stats.js';
import { changed, fitView, toast, updateUndoButtons } from './actions.js';
import { addBench, checkpoint, redo, renderBenchTabs, undo } from './tabs.js';
import { exportLayout } from '../io/layout.js';
import { openJekray, openProjectData } from '../io/open.js';
import { IMPORT_AS } from '../io/zmx-import.js';
import { exportZmx, importZmx, setZmxAsDesign, setZmxToMine } from '../io/zmx-export.js';
import { assignPalette, importStl, palette } from './experimental.js';
import { layoutPalette } from './rail.js';
import { packInstallText } from '../io/packs.js';
import { cloudLink } from '../io/cloud.js';
import { keepSnapshot, scheduleSave } from '../io/autosave.js';
import { hideWelcome } from './news.js';

/* ---------- Guided tours ----------
   A tour builds a small bench step by step on a tab of its own, so the user's own work is
   untouched. Each step says what to do, points at the button it needs, and moves on by
   itself once the bench shows it done (read from the last trace). */
const tourEls = type => project.elements.filter(e => onTab(e) && e.type === type);
const tourLit = el => !!(lastTrace && ((lastTrace.screens && (lastTrace.screens[el.id] || []).length) || (lastTrace.beams || []).some(b => b.endEl === el.id)));
// light that meets el and goes straight back the way it came
const tourRetro = el => !!(lastTrace && (lastTrace.beams || []).some(b => {
  const p = b.parent >= 0 ? lastTrace.beams[b.parent] : null;
  return p && p.endEl === el.id && p.dx * b.dx + p.dy * b.dy < -0.95;
}));
export const TOURS = {
  focus: { title: 'Focus a laser beam', tab: 'Tour: focus', steps: [
    { text: 'Add a light source: click <b>+ Add part</b> (or press A) and choose <b>Source</b>. It sends a collimated beam to the right.', target: 'source', done: () => tourEls('source').length, after: () => tourPlace('source', -90, 0) },
    { text: 'Add a lens with <b>Lens</b>.', target: 'lens', done: () => tourEls('lens').length, after: () => tourPlace('lens', -20, -35) },
    { text: 'Drag the lens up into the beam. The rays bend towards a focus about 50 mm past it.', done: () => tourEls('lens').some(tourLit) },
    { text: 'Add a <b>Screen</b> (+ Add part, or type \u201cscreen\u201d in its search) and drag it past the lens into the rays.', target: 'screen', done: () => tourEls('screen').some(tourLit) },
    { text: 'Click the screen. The panel on the right shows what arrives: the spot, its size, and the beam’s profile.', done: () => { const e = selected(); return e && e.type === 'screen'; } },
    { text: 'Drag the screen along the beam until the spot is smallest. The <b>RMS spot</b> in the panel falls as you reach the focus.', done: () => tourEls('screen').some(e => { const st = screenStats(e); return st && st.rms < 0.05; }) },
    { text: 'That’s the focus. Click the lens to change its curvatures or glass and watch the focus move, or turn it round with a right-click. Try the Michelson tour next, or open an example.', final: true }] },
  michelson: { title: 'Build a Michelson interferometer', tab: 'Tour: Michelson', steps: [
    { text: 'Add a light source: <b>+ Add part</b> (or A), then <b>Source</b>.', target: 'source', done: () => tourEls('source').length, after: () => tourPlace('source', -90, 0) },
    { text: 'Add a <b>Beam splitter</b> and drag it into the beam. Half the light goes on, half is turned through 90°.', target: 'cube', done: () => tourEls('cube').some(tourLit), before: () => tourPlace('cube', -20, -35) },
    { text: 'Add a <b>Mirror</b> and drag it into the straight-through beam. Then turn it to face the splitter: click it and set its <b>Angle</b> to 180 in the panel (the way it faces), or drag its round handle.', target: 'mirror', done: () => tourEls('mirror').some(tourRetro) },
    { text: 'Add a second <b>Mirror</b> in the beam the splitter turned, and turn it to face the splitter too (Angle 90 or −90, whichever points back at it).', target: 'mirror', done: () => tourEls('mirror').filter(tourRetro).length >= 2 },
    { text: 'Light from both arms now meets again at the splitter. Add a <b>Screen</b> on the splitter’s fourth side, the output port, and turn it to face the splitter (its Angle is the way it faces).', target: 'screen',
      done: () => { const n = Math.max(1, ...tourEls('source').map(e => e.rays || 1)); return tourEls('screen').some(e => { const st = screenStats(e); return st && st.count >= 1.5 * n; }); } },
    { text: 'Click the screen: its plot shows the two beams interfering. Now nudge one mirror with the arrow keys, or give its position a sweep and press Play, and watch the output rise and fall.', final: true }] },
  periscope: { title: 'Build a periscope in 3D', tab: 'Tour: periscope', steps: [
    { text: 'Add a light source: <b>+ Add part</b> (or A), then <b>Source</b>. It sends its beam to the right, 75 mm above the breadboard.', target: 'source', done: () => tourEls('source').length, after: () => tourPlace('source', -90, 0) },
    { text: 'Click <b>3D</b> at the bench\u2019s top right to see the bench in three dimensions. Right-drag to turn the view, scroll to zoom.', done: () => V3D.active() },
    { text: 'Add a <b>Mirror</b>. It lands in the beam, facing the source.', target: 'mirror', done: () => tourEls('mirror').some(tourLit), before: () => tourSet('mirror', 90, 0, { angle: 180 }) },
    { text: 'Click the mirror, then click it again: its arrows give way to three rings. Drag the <b>green</b> ring up to tip the mirror 45\u00b0 (hold Shift for 15\u00b0 steps), or type 45 in its <b>Tip</b>. The beam now goes straight up.', done: () => tourEls('mirror').some(e => Math.abs((e.tip || 0) - 45) < 0.5) },
    { text: 'Add a second <b>Mirror</b>. It goes straight over the first, 100 mm higher, where the beam meets it (its <b>blue arrow</b> raises and lowers it, or type its <b>z</b>).', target: 'mirror', done: () => tourEls('mirror').length >= 2, before: () => tourSet('mirror', 90, 0, { angle: 0, z: BEAM_Z + 100 }) },
    { text: 'Click the upper mirror twice for its rings and tip it down 45\u00b0 with the green ring, or type \u221245 in its Tip. The light leaves level again, 100 mm higher: a periscope.', done: () => tourEls('mirror').some(e => zOf(e) > BEAM_Z + 50 && Math.abs((e.tip || 0) + 45) < 0.5) },
    { text: 'Add a <b>Screen</b> to catch the raised beam. It goes in the beam\u2019s way, at its new height.', target: 'screen', done: () => tourEls('screen').some(tourLit), before: () => tourSet('screen', 170, 0, { angle: 180, z: BEAM_Z + 100 }) },
    { text: 'That\u2019s a periscope. Turn the upper mirror\u2019s facing with its <b>blue</b> ring and the beam turns too, its polarisation and image turned with it, as on a real bench. Roll a part with its <b>orange</b> ring, and click a part once more for its arrows.', final: true }] },
};
/* the newest part of a type put where the tour wants it, dx, dy from the tour's source (the
   view moves about in 3D), and set as it needs */
function tourSet(type, dx, dy, props) {
  const list = tourEls(type), el = list[list.length - 1], s0 = tourEls('source')[0];
  if (!el) return;
  el.x = snapVal((s0 ? s0.x : V().cx) + dx); el.y = snapVal((s0 ? s0.y : V().cy) + dy);
  if (props.angle !== undefined) el.angle = props.angle;
  if (props.z !== undefined) setZ(el, props.z);
  changed(true);
}
export let tour = null;
/* put the newest element of a type where the tour wants it, relative to the middle of the view
   (y up the bench); done once per step */
function tourPlace(type, dx, dy) {
  const list = tourEls(type), el = list[list.length - 1];
  if (!el) return;
  el.x = snapVal(V().cx + dx); el.y = snapVal(V().cy + dy);
  changed(true);
}
export function startTour(name) {
  const T = TOURS[name];
  if (!T) return;
  endTour();
  hideWelcome();
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  if (palette !== 'free') { assignPalette('free'); layoutPalette(); }
  addBench();
  const b = curBench();
  b.name = T.tab; b.view.cx = 60; b.view.cy = 0; b.view.scale = Math.max(2, Math.min(6, (W || 800) / 230));
  project.view = b.view;
  renderBenchTabs(); changed(true);
  tour = { name, T, i: 0, bench: b.id, timer: setInterval(tourTick, 300) };
  tourShow();
}
export function endTour() {
  if (!tour) return;
  clearInterval(tour.timer);
  tour = null;
  const c = document.getElementById('coach');
  if (c) c.remove();
  for (const e of document.querySelectorAll('.rt-pulse')) e.classList.remove('rt-pulse');
}
function tourTarget(kind) {
  const all = [...document.querySelectorAll('[data-add="' + kind + '"]')];
  return all.find(e => e.offsetParent !== null) || document.getElementById('btnAddPart');
}
function tourShow() {
  if (!tour) return;
  const { T, i } = tour, st = T.steps[i];
  let c = document.getElementById('coach');
  if (!c) { c = h('div', { class: 'rt-welcome rt-coach', id: 'coach', role: 'status', 'aria-live': 'polite' }); document.getElementById('stage').append(c); }
  const p = h('p'); p.innerHTML = st.text;
  const acts = st.final
    ? [tour.name === 'focus' ? h('button', { class: 'rt-btn', type: 'button', onclick: () => startTour('michelson') }, 'Michelson tour')
        : tour.name === 'michelson' ? h('button', { class: 'rt-btn', type: 'button', onclick: () => startTour('periscope') }, 'Periscope tour, in 3D') : null,
       h('button', { class: 'rt-btn', type: 'button', onclick: () => { endTour(); openGallery(); } }, 'Examples'),
       h('button', { class: 'rt-btn primary', type: 'button', onclick: endTour }, 'Done')]
    : [h('button', { class: 'rt-btn', type: 'button', onclick: endTour }, 'End tour'),
       i > 0 ? h('button', { class: 'rt-btn', type: 'button', onclick: () => { tour.i--; tourShow(); } }, 'Back') : null,
       h('button', { class: 'rt-btn', type: 'button', onclick: () => { tour.i++; tourShow(); } }, 'Skip step')];
  c.replaceChildren(h('div', { class: 'rt-coachhead' }, h('h3', null, T.title), h('span', null, st.final ? 'Done' : 'Step ' + (i + 1) + ' of ' + (T.steps.length - 1))),
    p, h('div', { class: 'rt-actions' }, ...acts.filter(Boolean)));
  for (const e of document.querySelectorAll('.rt-pulse')) e.classList.remove('rt-pulse');
  const tg = st.target && tourTarget(st.target);
  if (tg) tg.classList.add('rt-pulse');
}
export function tourTick() {
  if (!tour) return;
  // the tour's tab gone (closed, or a file opened over it): the tour ends with it
  if (!project.benches.some(b => b.id === tour.bench)) { endTour(); return; }
  if (project.tab !== tour.bench) return;
  const st = tour.T.steps[tour.i];
  if (st.final) { for (const e of document.querySelectorAll('.rt-pulse')) e.classList.remove('rt-pulse'); return; }
  const tg = st.target && tourTarget(st.target);           // the palette may have moved it into More
  if (tg && !tg.classList.contains('rt-pulse')) { for (const e of document.querySelectorAll('.rt-pulse')) e.classList.remove('rt-pulse'); tg.classList.add('rt-pulse'); }
  // a part the step asks for, just added: put where the step can use it
  if (st.before && !tour.placed && tourEls(st.target).length) { tour.placed = true; st.before(); }
  let ok = false;
  try { ok = !!st.done(); } catch (err) { ok = false; }
  if (ok && st.after) st.after();
  if (ok) { tour.placed = false; tour.i++; tourShow(); const c = document.getElementById('coach'); if (c) { c.classList.remove('rt-flash'); void c.offsetWidth; c.classList.add('rt-flash'); } }
}
/* An empty tab: what to do first */
export function updateEmpty() {
  const empty = !TEST_MODE && !EMBED && !tour && !project.elements.some(onTab) && !document.getElementById('welcome');
  let c = document.getElementById('emptyHint');
  if (!empty) { if (c) c.remove(); return; }
  if (c) return;
  document.getElementById('stage').append(h('div', { class: 'rt-empty', id: 'emptyHint' },
    h('p', null, h('b', null, 'This bench is empty.'), ' Add a part with + Add part above (or press A), from the rail at the left, or:'),
    h('div', { class: 'rt-actions' },
      h('button', { class: 'rt-btn primary', type: 'button', onclick: () => startTour('focus') }, 'Take the 2-minute tour'),
      h('button', { class: 'rt-btn', type: 'button', onclick: () => openGallery() }, 'Browse examples'))));
}
// the same dialog, onto the bench (File > Import a lens) or into My parts (its tab's button)
export function openZmx(toMine) {
  setZmxToMine(toMine);
  document.getElementById('zmxTitle').textContent = toMine ? 'Import lens files (.zmx) into My parts' : 'Import a lens file (.zmx)';
  document.getElementById('zmxWhere').textContent = toMine
    ? 'Choose one file or several: each is kept in My parts, named by its part number, ready to add to any bench. Light travels left to right through it, as in the file.'
    : 'The part is placed at the centre of the view with light travelling left to right, as in the file.';
  document.getElementById('zmxChoose').textContent = toMine ? 'Choose .zmx files' : 'Choose .zmx file';
  document.getElementById('zmxError').hidden = true;
  document.getElementById('zmxDialog').showModal();
}
/* Open one of the example benches in demos/, by its file name. The product page links
   here with #demo=<name>, so the examples live there rather than on the tool. */
export async function openDemo(name, undoable) {
  try {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error('there is no example by that name');
    const built = window.JEK_DEMOS && window.JEK_DEMOS[name];
    let data = built ? JSON.parse(JSON.stringify(built)) : null;
    if (!data) {
      const res = await fetch('demos/' + name + '.jekray');
      if (!res.ok) throw new Error('that example could not be fetched');
      data = await res.json();
    }
    openProjectData(data, data.name || name);
    if (!undoable) { setHistory([]); setFuture([]); updateUndoButtons(); }
    if (!data.keepView) fitView();          // an example set up on a detail opens on it
  } catch (err) {
    toast('Could not open that example (' + err.message + ').', true);
  }
}

/* Fill a "measured on" list and keep its metric and goal lists in step */
function fillTargets(sel) {
  sel.replaceChildren();
  for (const el of measurable()) sel.append(h('option', { value: el.id }, el.name + ' (' + typeLabel(el).toLowerCase() + ')'));
}
/* One tab per kind of measurement the chosen element offers; the metric list shows that
   kind only. The tabs remember their choice across openings. */
function fillMetrics(targetSel, metricSel, famBox) {
  const el = getEl(targetSel.value);
  metricSel.replaceChildren();
  famBox.replaceChildren();
  if (!el) return;
  const all = metricsFor(metricKind(el));
  const fams = METRIC_FAMS.filter(([f]) => all.some(m => m.fam === f));
  if (!fams.some(([f]) => f === famBox.dataset.fam)) famBox.dataset.fam = fams.length ? fams[0][0] : '';
  for (const [f, label] of fams) {
    famBox.append(h('button', { class: 'rt-tab' + (f === famBox.dataset.fam ? ' on' : ''), type: 'button',
      onclick: () => { famBox.dataset.fam = f; fillMetrics(targetSel, metricSel, famBox); metricSel.dispatchEvent(new Event('change')); } }, label));
  }
  for (const m of all) if (m.fam === famBox.dataset.fam) metricSel.append(h('option', { value: m.key }, m.label));
}

export function newProject() {
  pauseAll();
  checkpoint();
  project.elements = []; project.fibres = [];
  project.benches = [{ id: 'b1', name: 'Bench 1', view: project.view }]; project.tab = 'b1';
  ensureBenches(project); renderBenchTabs();
  project.name = 'Untitled bench';
  document.getElementById('projName').value = project.name;
  selectOne(null);
  changed(true);
}
const newDlg = document.getElementById('newDialog');
export const nameInput = document.getElementById('projName');
/* the name's box is as wide as the name (within limits), so as much of it as the bar has room
   for can be read: sized on every change, however the value is set (on the page only: the
   field worker runs this code too, with no page) */

/* Drag and drop files onto the bench */

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wireTours() {
  document.getElementById('btnOpen').addEventListener('click', () => document.getElementById('fileJekray').click());

  document.getElementById('fileJekray').addEventListener('change', e => { const f = e.target.files[0]; if (f) openJekray(f); e.target.value = ''; });

  document.getElementById('btnImport').addEventListener('click', () => { setZmxAsDesign(false); openZmx(false); });
  document.getElementById('btnImportDesign').addEventListener('click', () => { openZmx(false); setZmxAsDesign(true); document.getElementById('zmxTitle').textContent = 'Import a lens file (.zmx) as a design'; });
  document.getElementById('btnNewLens').addEventListener('click', () => newLensDesign());

  document.getElementById('btnExportZmx').addEventListener('click', exportZmx);

  document.getElementById('btnShowPanel').addEventListener('click', () => { setPanelClosed(false); renderPanel(); requestRender(); });

  document.getElementById('btnBenchGear').addEventListener('click', () => { benchGear(); requestRender(); });

  document.getElementById('btnImportStl').addEventListener('click', () => document.getElementById('fileStl').click());

  document.getElementById('fileStl').addEventListener('change', e => { const f = e.target.files[0]; if (f) importStl(f); e.target.value = ''; });

  {
    const sel = document.getElementById('zmxAs');
    for (const [v, t] of Object.entries(IMPORT_AS)) sel.append(h('option', { value: v }, t));
  }

  document.getElementById('zmxCancel').addEventListener('click', () => document.getElementById('zmxDialog').close());

  document.getElementById('zmxChoose').addEventListener('click', () => document.getElementById('fileZmx').click());

  document.getElementById('fileZmx').addEventListener('change', e => { const fs = [...e.target.files]; if (fs.length) importZmx(fs); e.target.value = ''; });

  document.getElementById('zmxDialog').addEventListener('close', () => { setZmxToMine(false); setTimeout(() => setZmxAsDesign(false), 0); });

  {
    const dlg = document.getElementById('matDialog');
    const paste = document.getElementById('matPaste'), nameIn = document.getElementById('matName');
    const note = document.getElementById('matNote');
    document.getElementById('matCancel').addEventListener('click', () => { setMaterialWanted(null); dlg.close(); });
    document.getElementById('matFile').addEventListener('click', () => document.getElementById('fileMat').click());
    document.getElementById('fileMat').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        paste.value = r.result;
        if (!nameIn.value) nameIn.value = f.name.replace(/\.[a-z]+$/i, '').slice(0, 40);
        note.textContent = 'Loaded ' + f.name + '. Check the name, then add it.';
      };
      r.readAsText(f);
      e.target.value = '';
    });
    document.getElementById('matAdd').addEventListener('click', () => {
      try {
        const table = parseNK(paste.value);
        const name = (nameIn.value || 'Imported material').trim().slice(0, 40);
        const mat = normMat({ glass: name, table });
        project.library = project.library || [];
        if (!project.library.some(m => m.glass === name)) project.library.push(mat);
        checkpoint();
        if (materialWanted) materialWanted(normMat(mat));
        setMaterialWanted(null);
        dlg.close();
        paste.value = ''; nameIn.value = '';
        const um = table.wl;
        toast('Added ' + name + ', covering ' + (+um[0].toPrecision(3)) + ' to ' + (+um[um.length - 1].toPrecision(3)) + ' \u00b5m');
      } catch (err) {
        note.textContent = err.message;
      }
    });
  }

  document.querySelectorAll('[data-demo]:not([role=menuitem])').forEach(btn => btn.addEventListener('click', () => openDemo(btn.dataset.demo, true)));

  document.getElementById('btnUndo').addEventListener('click', undo);

  document.getElementById('btnRedo').addEventListener('click', redo);

  document.getElementById('btnFit').addEventListener('click', fitView);

  document.getElementById('fileMenu').addEventListener('click', e => { const b = e.target.closest('[data-export]'); if (b) exportLayout(b.dataset.export, !!b.dataset.view); });

  document.getElementById('btnPlayAll').addEventListener('click', playAll);

  document.getElementById('btnPauseAll').addEventListener('click', pauseAll);

  document.getElementById('btnSync').addEventListener('click', syncPhases);

  {
    const dlg = document.getElementById('tolDialog');
    const varsBox = document.getElementById('tolVars');
    const targetSel = document.getElementById('tolTarget'), metricSel = document.getElementById('tolMetric');
    const result = document.getElementById('tolResult'), hist = document.getElementById('tolHist');
    hist.after(plotSaveRow(hist, true));
    const sens = document.getElementById('tolSens');
    let running = false;
    const pickedVars = () => {
      const out = [];
      for (const cb of varsBox.querySelectorAll('input:checked')) {
        const [id, path] = cb.dataset.k.split('|');
        const el = getEl(id);
        if (el && el.sweeps[path]) out.push([el, path]);
      }
      return out;
    };
    const famBox = document.getElementById('tolFam');
    targetSel.addEventListener('change', () => fillMetrics(targetSel, metricSel, famBox));
    document.getElementById('btnTol').addEventListener('click', () => {
      varsBox.replaceChildren();
      for (const [el, path] of allSweeps()) {
        const cb = h('input', { type: 'checkbox', checked: true, 'data-k': el.id + '|' + path });
        const sw = el.sweeps[path];
        varsBox.append(h('label', null, cb, el.name + ': ' + paramLabel(path),
          h('span', { class: 'r' }, (+sw.min.toPrecision(5)) + ' to ' + (+sw.max.toPrecision(5)))));
      }
      fillTargets(targetSel);
      fillMetrics(targetSel, metricSel, famBox);
      result.textContent = '';
      hist.style.display = 'none';
      sens.replaceChildren();
      dlg.showModal();
    });
    document.getElementById('tolClose').addEventListener('click', () => { running = false; dlg.close(); });
    document.getElementById('tolSensRun').addEventListener('click', () => {
      if (running) return;
      const vars = pickedVars();
      const target = getEl(targetSel.value), key = metricSel.value;
      if (!vars.length || !target) { result.textContent = 'Pick at least one parameter and something to measure.'; return; }
      hist.style.display = 'none';
      checkpoint();
      const S = sensitivity(vars, target, key);
      changed(true);
      const head = h('tr', null, h('th', null, 'Parameter'), h('th', null, 'At the low end'),
        h('th', null, 'At the high end'), h('th', null, 'Worst swing'), h('th', null, ''));
      const table = h('table', { class: 'rt-sens' }, head);
      const top = S.rows.length ? S.rows[0].worst : 0;
      for (const r of S.rows) {
        const d = v => v === null ? 'no reading' : (v > 0 ? '+' : '') + metricText(key, v);
        table.append(h('tr', null,
          h('td', null, r.el.name + ': ' + paramLabel(r.path)),
          h('td', { class: 'n' }, d(r.dLo)),
          h('td', { class: 'n' }, d(r.dHi)),
          h('td', { class: 'n' }, metricText(key, r.worst)),
          h('td', { style: 'width:28%' }, h('span', { class: 'bar', style: 'width:' + (top ? Math.max(2, 100 * r.worst / top) : 2) + '%' }))));
      }
      sens.replaceChildren(table);
      result.textContent = 'Nominal ' + metricText(key, S.base) + '. Worst case if every tolerance went the wrong way at once: ' +
        metricText(key, S.rows.reduce((a, r) => a + r.worst, 0)) + ' of change; ' + metricText(key, S.rss) +
        ' added in quadrature, which is the realistic figure.';
    });
    document.getElementById('tolRun').addEventListener('click', () => {
      if (running) return;
      const vars = pickedVars();
      const target = getEl(targetSel.value);
      const key = metricSel.value;
      const trials = Math.round(clamp(Number(document.getElementById('tolN').value) || 200, 10, 5000));
      const dist = document.getElementById('tolDist').value;
      if (!vars.length || !target) { result.textContent = 'Pick at least one parameter and something to measure.'; return; }
      running = true;
      result.textContent = 'Running\u2026';
      monteCarlo(vars, target, key, trials, dist,
        (i, n) => { result.textContent = 'Trial ' + i + ' of ' + n + '\u2026'; },
        (samples, nominal) => {
          running = false;
          if (!samples.length) { result.textContent = 'No trial produced a reading there.'; return; }
          const n = samples.length;
          const mean = samples.reduce((a, b) => a + b, 0) / n;
          const sd = Math.sqrt(samples.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
          const pick = q => samples[Math.min(n - 1, Math.floor(q * n))];
          sens.replaceChildren();
          hist.style.display = 'block';
          drawHistogram(hist, samples, key);
          result.textContent = n + ' trials of ' + metricByKey(key).label.toLowerCase() + '. Nominal ' + metricText(key, nominal) +
            '; mean ' + metricText(key, mean) + ', sigma ' + metricText(key, sd) +
            '; median ' + metricText(key, pick(0.5)) + ', 90% within ' + metricText(key, pick(0.9)) +
            ', worst ' + metricText(key, samples[n - 1]) + '.';
        },
        () => running && dlg.open);
    });
  }

  {
    const dlg = document.getElementById('optDialog');
    const varsBox = document.getElementById('optVars'), termsBox = document.getElementById('optTerms');
    const result = document.getElementById('optResult'), scanCv = document.getElementById('optScan'), table = document.getElementById('optTable');
    const runBtn = document.getElementById('optRun'), stopBtn = document.getElementById('optStop');
    scanCv.after(plotSaveRow(scanCv, true));
    let job = null;
    // one goal: what it is measured on, with what, which way, and its weight among several
    const termRow = k => {
      const targetSel = h('select'), metricSel = h('select'), goalSel = h('select'), famBox = h('div', { class: 'rt-tabs', style: 'margin:0' });
      const tVal = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'target' }), wVal = h('input', { type: 'text', inputmode: 'decimal', value: '1' });
      const tWrap = h('div', { class: 'rt-f', hidden: '' }, h('label', null, 'Target'), tVal), wWrap = h('div', { class: 'rt-f' }, h('label', null, 'Weight'), wVal);
      const del = h('button', { class: 'rt-btn', type: 'button', title: 'Remove this goal', onclick: () => { row.remove(); relabel(); } }, 'Remove');
      const row = h('div', { class: 'rt-opt-term' },
        h('div', { class: 'rt-rows' },
          h('div', { class: 'rt-f' }, h('label', null, 'Measured on'), targetSel),
          h('div', { class: 'rt-f wide' }, h('label', null, 'Measured with'), famBox),
          h('div', { class: 'rt-f' }, h('label', null, 'Metric'), metricSel),
          h('div', { class: 'rt-f' }, h('label', null, 'Looking for'), goalSel), tWrap, wWrap),
        h('div', { class: 'rt-opt-del' }, del));
      const showTarget = () => {
        const match = goalSel.value === 'match';
        tWrap.hidden = !match;
        if (match && !tVal.value) {
          const now = metricRaw(getEl(targetSel.value), metricSel.value), m = metricByKey(metricSel.value);
          tVal.value = now !== null ? String(+now.toPrecision(5)) : (m && m.absolute ? '0' : '');
        }
      };
      const fillGoals = () => {
        const m = metricByKey(metricSel.value);
        goalSel.replaceChildren();
        if (m) for (const g of m.goals) goalSel.append(h('option', { value: g }, GOAL_LABEL[g]));
        showTarget();
      };
      targetSel.addEventListener('change', () => { fillMetrics(targetSel, metricSel, famBox); tVal.value = ''; fillGoals(); });
      metricSel.addEventListener('change', () => { tVal.value = ''; fillGoals(); });
      goalSel.addEventListener('change', showTarget);
      fillTargets(targetSel);
      if (k > 0 && targetSel.options.length) targetSel.selectedIndex = Math.min(k, targetSel.options.length - 1);     // a new goal: the next thing to measure
      fillMetrics(targetSel, metricSel, famBox); fillGoals();
      row._read = () => ({ target: getEl(targetSel.value), key: metricSel.value, goal: goalSel.value, targetVal: Number(tVal.value), weight: Number(wVal.value) });
      return row;
    };
    // weights and Remove only mean something with more than one goal
    const relabel = () => { const rows = [...termsBox.children]; rows.forEach(r => { r.querySelector('.rt-opt-del').hidden = rows.length < 2; r.querySelectorAll('.rt-f')[5].hidden = rows.length < 2; }); };
    document.getElementById('optAddTerm').addEventListener('click', () => { termsBox.append(termRow(termsBox.children.length)); relabel(); });
    document.getElementById('btnOptimise').addEventListener('click', () => {
      varsBox.replaceChildren();
      allSweeps().forEach(([el, path], i) => {
        const cb = h('input', { type: 'checkbox', 'data-k': el.id + '|' + path });
        if (i === 0) cb.checked = true;
        const sw = el.sweeps[path];
        varsBox.append(h('label', null, cb, el.name + ': ' + paramLabel(path), h('span', { class: 'r' }, (+sw.min.toPrecision(5)) + ' to ' + (+sw.max.toPrecision(5)))));
      });
      termsBox.replaceChildren(termRow(0)); relabel();
      result.textContent = ''; table.hidden = true; scanCv.style.display = 'none';
      dlg.showModal();
    });
    const stop = () => { if (job) job.stop = true; };
    document.getElementById('optClose').addEventListener('click', () => { stop(); dlg.close(); });
    stopBtn.addEventListener('click', stop);
    const f = v => +(+v).toPrecision(6);
    runBtn.addEventListener('click', () => {
      if (job) return;
      const vars = [...varsBox.querySelectorAll('input:checked')].map(cb => { const [id, path] = cb.dataset.k.split('|'); return [getEl(id), path]; }).filter(([el, path]) => el && el.sweeps[path]);
      const terms = [...termsBox.children].map(r => r._read());
      if (!vars.length) { result.textContent = 'Tick at least one parameter to vary.'; return; }
      if (terms.some(q => !q.target || !q.key)) { result.textContent = 'Every goal needs something to measure.'; return; }
      if (terms.some(q => q.goal === 'match' && !isFinite(q.targetVal))) { result.textContent = 'Give each Match goal a target value.'; return; }
      checkpoint();
      const me = job = { stop: false };
      const gen = optimiseGen(vars, terms, { stop: () => me.stop });
      runBtn.disabled = true; stopBtn.hidden = false; table.hidden = true;
      const finish = r => {
        job = null; runBtn.disabled = false; stopBtn.hidden = true;
        changed(true);
        scanCv.style.display = 'block';
        if (vars.length === 1 && terms.length === 1 && r.scan.length && !r.stopped) drawScan(scanCv, r.scan, terms[0].key, r.improved ? r.best[0] : r.start[0]);
        else drawConvergence(scanCv, r.history);
        result.textContent = (r.improved ? 'Better' : 'Nothing beat the starting settings; they are kept') + ' (' + r.evals + ' traces' + (r.stopped ? ', stopped early' : '') + ').';
        const rows = vars.map(([el, path], i) => [el.name + ': ' + paramLabel(path), f(r.start[i]) + (r.improved ? ' \u2192 ' + f(r.best[i]) : '')]);
        terms.forEach((q, i) => rows.push([q.target.name + ', ' + (metricByKey(q.key) || {}).label + (q.goal === 'match' ? ' (target ' + q.targetVal + ')' : ''),
          metricText(q.key, r.raw0[i]) + (r.improved ? ' \u2192 ' + metricText(q.key, r.rawBest[i]) : '')]));
        if (terms.length > 1) rows.push(['Merit (1 each at the start, weighted)', f(r.startMerit) + (r.improved ? ' \u2192 ' + f(r.bestMerit) : '')]);
        table.replaceChildren(h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)])));
        table.hidden = false;
      };
      const step = () => {
        const until = performance.now() + 60;
        let r;
        do r = gen.next(); while (!r.done && performance.now() < until);
        if (r.done) return finish(r.value);
        result.textContent = 'Searching: ' + r.value.evals + ' of about ' + r.value.budget + ' traces, best merit ' + f(r.value.best) + '\u2026';
        setTimeout(step, 0);
      };
      result.textContent = 'Searching\u2026';
      setTimeout(step, 20);
    });
  }

  document.getElementById('btnNew').addEventListener('click', () => {
    if (project.elements.length) newDlg.showModal(); else newProject();
  });

  document.getElementById('newCancel').addEventListener('click', () => newDlg.close());

  document.getElementById('newConfirm').addEventListener('click', () => { newDlg.close(); keepSnapshot('Before New', true); if (cloud) cloudLink(null); newProject(); });

  if (!IN_WORKER) {
    const cv = document.createElement('canvas').getContext('2d');
    const fit = () => {
      const cs = getComputedStyle(nameInput);
      cv.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      const w = cv.measureText(nameInput.value || nameInput.placeholder || '').width;
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      nameInput.style.setProperty('--name-w', Math.ceil(w + pad + 6) + 'px');
    };
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(nameInput, 'value', { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); fit(); } });
    nameInput.addEventListener('input', fit);
    if (document.fonts) document.fonts.ready.then(fit);
    fit();
  }

  nameInput.addEventListener('input', () => { project.name = nameInput.value; scheduleSave(); });

  nameInput.addEventListener('change', () => { if (!nameInput.value.trim()) { project.name = 'Untitled bench'; nameInput.value = project.name; scheduleSave(); } });

  ['dragenter', 'dragover'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); stage.classList.add('drop'); }));

  ['dragleave', 'drop'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); if (t === 'dragleave' && stage.contains(e.relatedTarget)) return; stage.classList.remove('drop'); }));

  stage.addEventListener('drop', e => {
    const f = e.dataTransfer.files[0];
    if (!f || LOCKED) return;
    if (/\.zmx$/i.test(f.name)) importZmx(f);
    else if (/\.stl$/i.test(f.name)) importStl(f, [e.clientX, e.clientY]);
    else if (/\.jekpack$/i.test(f.name)) f.text().then(t => packInstallText(t, f.name));   // a part pack: shown, then installed if wanted
    else if (/\.(jekray|json)$/i.test(f.name)) openJekray(f);
    else toast(f.name + ' isn\u2019t a .zmx, .stl, .jekray or .jekpack file.', true);
  });

}
