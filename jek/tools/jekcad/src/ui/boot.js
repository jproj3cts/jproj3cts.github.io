import { EMBED, TEST_MODE } from '../../../jekray/src/core/constants.js';
import { installHooks } from '../../../jekray/src/core/hooks.js';
import { needsShown } from '../../../jekray/src/ui/pro.js';
import { usageDrawn, usageStart, wireUsage } from '../../../jekray/src/io/usage.js';
import { accountLoaded } from '../../../jekray/src/io/account.js';
import { STD_PLANES, normDoc } from '../core/doc.js';
import { app, cadIcons, cadTheme, changed, checkpoint, closeMenus, emit, on, redo, regenDone, regenNow, setCadTheme, themeNow, toast, undo, wireMenus } from './app.js';
import { V, fit, flyStart, flyStop, flyTurn, initView, pickAt, project, setMode, setSection, viewFrom, viewPng, wireCube, wireFly } from './view3d.js';
import { SK, addConstraint, cancelSketch, dimsShown, drawOverlay, finishSketch, modelDimEdit, modelGeom, overlayPick, setDimsShown, setTool, sketchBar, sketchRight, sketchUndo, startSketch, toScreen, wireSketcher } from './sketcher.js';
import { closeDialog, editFeature, fieldPick, okDialog, openFeature, showVariables, wireDialog } from './dialog.js';
import { deleteFeature, moveFeature, renderPanel, setRollback, toggleFeatureShown, wirePanel } from './panel.js';
import { normalToSel, pickHere, selectPick, wirePointer } from './pointer.js';
import { exportParts, importStep, newDocument, openDocData, openFile, restoreSaved, saveFile, wireFiles } from '../io/files.js';
import { wireCadAccount } from '../io/cad-account.js';
import { cloudPush, openCloudBench, openCloudList, wireCloud } from '../io/cloud.js';
import { kernelAsk } from '../page/kernel.js';
import { APP_VERSION, wireNews } from './news.js';

/* ==========================================================================
   The page put together: the hooks, every module's wiring, the Part Studio restored (or a new one), the hashes the
   hub sends (#cloud=<id>, #new), and window.JEKcad for the tests and the console.
   ========================================================================== */
installHooks({ toast, needsShown, renderPanel });
if (!TEST_MODE && !EMBED && !window.name) window.name = 'jekcad';
themeNow();
if (typeof matchMedia === 'function') matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeNow);
const saved = restoreSaved();
if (saved) app.doc = saved;
on('icons', el => cadIcons(el));
wireMenus(); wireSketcher(); wireDialog(); wirePanel(); wirePointer(); wireFiles(); wireCube(); wireFly(); wireNews(); wireCadAccount(); wireCloud(); wireUsage();
/* the bar's buttons and menus */
const click = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
for (const b of document.querySelectorAll('[data-feature]')) b.addEventListener('click', () => { closeMenus(); openFeature(b.dataset.feature); });
click('btnUndo', () => { if (app.sketch) emit('sketchUndo'); else undo(); }); click('btnRedo', () => { if (!app.sketch) redo(); });
click('btnNew', newDocument); click('btnOpen', openFile); click('btnSave', saveFile); click('btnImportStep', () => importStep());
click('btnExportStep', () => exportParts('step')); click('btnExportStl', () => exportParts('stl'));
click('btnVariables', showVariables); click('btnFit', () => fit()); click('btnNormal', normalToSel);
click('btnSection', () => sectionToggle());
window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !e.shiftKey) { e.preventDefault(); saveFile(); } });
for (const b of document.querySelectorAll('[data-view]:not(.cad-cubeface)')) b.addEventListener('click', () => viewFrom(b.dataset.view));
for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => { setMode(b.dataset.mode); bootModes(); });
function bootModes() { for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-checked', String(b.dataset.mode === V.mode)); }
function themeMenu() { for (const b of document.querySelectorAll('[data-theme]')) b.setAttribute('aria-checked', String(b.dataset.theme === cadTheme())); }
for (const b of document.querySelectorAll('[data-theme]')) b.addEventListener('click', () => { setCadTheme(b.dataset.theme); themeMenu(); });
const filter = document.getElementById('selFilter');
filter.addEventListener('change', () => { app.filter = filter.value; app.hover = null; emit('sel'); });
// the three planes together: hidden if any shows, shown if none does (each has its own eye in the list)
click('btnPlanes', () => { checkpoint(); const hd = app.doc.hide || (app.doc.hide = {}), any = ['top', 'front', 'right'].some(k => !hd[k]); for (const k of ['top', 'front', 'right']) { if (any) hd[k] = true; else delete hd[k]; } changed(); });
click('btnFly', () => { closeMenus(); flyStart(); });
const dimsBtn = document.getElementById('btnDimsShown');
dimsBtn.setAttribute('aria-checked', String(dimsShown()));
dimsBtn.addEventListener('click', () => { setDimsShown(!dimsShown()); dimsBtn.setAttribute('aria-checked', String(dimsShown())); });
on('picked', drawOverlay);
/* the feature list's tab: the list closed, the view has the whole window; kept for the next visit */
const SIDE_KEY = 'jekcad-side';
function sideShown(open) {
  const main = document.getElementById('cadMain'), tab = document.getElementById('sideTab');
  main.classList.toggle('side-off', !open);
  tab.setAttribute('aria-expanded', String(open)); tab.title = open ? 'Hide the feature list' : 'Show the feature list'; tab.setAttribute('aria-label', tab.title);
  tab.firstElementChild.textContent = open ? '‹' : '›';
  try { if (open) localStorage.removeItem(SIDE_KEY); else localStorage.setItem(SIDE_KEY, 'off'); } catch (err) { /* this visit */ }
}
click('sideTab', () => sideShown(document.getElementById('cadMain').classList.contains('side-off')));
try { if (!TEST_MODE && localStorage.getItem(SIDE_KEY) === 'off') sideShown(false); } catch (err) { /* open */ }
click('btnHelpKeys', () => document.getElementById('helpDialog').showModal());
click('helpClose', () => document.getElementById('helpDialog').close());
on('history', () => { document.getElementById('btnUndo').disabled = !app.history.length && !app.sketch; document.getElementById('btnRedo').disabled = !app.future.length; });
on('sketchUndo', () => { sketchUndo(); });
on('busy', () => { const b = document.getElementById('busy'); if (b) b.hidden = !app.busy; });
on('saved', () => { const d = document.getElementById('saveDot'); if (d) d.hidden = !app.unsaved; });
on('doc', () => { const d = document.getElementById('saveDot'); if (d) d.hidden = !app.unsaved; const nm = document.getElementById('docName'); if (nm && document.activeElement !== nm) nm.value = app.doc.name; });
/* the section view: a plane and where along it */
function sectionToggle() {
  const ctl = document.getElementById('sectionCtl'), on2 = ctl.hidden;
  ctl.hidden = !on2;
  document.getElementById('btnSection').setAttribute('aria-checked', String(on2));
  if (!on2) { setSection(null); return; }
  sectionApply();
}
function sectionApply() {
  const pl = STD_PLANES[document.getElementById('secPlane').value], at = parseFloat(document.getElementById('secAt').value) || 0, flip = document.getElementById('secFlip').checked;
  setSection({ n: pl.n, o: pl.n.map(v => v * at), flip });
  document.getElementById('secAtOut').textContent = at.toFixed(1) + ' mm';
}
for (const id of ['secPlane', 'secAt', 'secFlip']) document.getElementById(id).addEventListener('input', sectionApply);
on('model', out => { // the section's slider spans the parts
  let lo = Infinity, hi = -Infinity;
  for (const p of out.parts) for (const b of p.bbox) for (const v of b) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const r = document.getElementById('secAt'); if (Number.isFinite(lo)) { r.min = String(Math.floor(lo - 1)); r.max = String(Math.ceil(hi + 1)); }
});
// the hint line: what the mouse does
const hint = document.getElementById('hint');
on('sketch', () => { hint.textContent = app.sketch ? 'Click to draw, and type a size as you go (Enter) · Shift: nothing inferred · Right-click or Esc ends a chain · D: dimension · Double-click a dimension to change it' : 'Right-drag: orbit · Middle-drag: pan · Wheel: zoom · Click: select · Double-click a dimension or a face to change it · F: fit'; sketchBar(); renderPanel(); });
emit('sketch');
bootModes(); themeMenu();
cadIcons(document);
renderPanel();
initView().then(() => { regenNow().then(() => { if (!V.fitted) fit(true); usageDrawn(); }); });
usageStart(saved ? 'cad-restored' : 'cad-fresh');
if (!saved && !TEST_MODE && !EMBED) setTimeout(() => toast('Welcome to JEKcad. Click Sketch, pick the Top plane, draw a rectangle and dimension it (D), then Finish and Extrude.'), 700);
// #cloud=<id> (or @<version> for a copy) opens a cloud Part Studio; #benches opens JEKsuite; #new starts a new one
const cloudAt = !TEST_MODE && !EMBED && location.hash.match(/^#cloud=([A-Za-z0-9_-]+)(?:@(\d+))?$/);
const cloudHash = async cl => { window.history.replaceState(null, '', location.pathname); await accountLoaded; openCloudBench(cl[1], cl[2] ? Number(cl[2]) : undefined); };
if (cloudAt) cloudHash(cloudAt);
if (!TEST_MODE && !EMBED && location.hash === '#benches') { window.history.replaceState(null, '', location.pathname); openCloudList(); }
if (!TEST_MODE && !EMBED && location.hash === '#new') { window.history.replaceState(null, '', location.pathname); openDocData(normDoc({}), null, { fresh: true }); }
if (!TEST_MODE && !EMBED) window.addEventListener('hashchange', () => { const cl = location.hash.match(/^#cloud=([A-Za-z0-9_-]+)(?:@(\d+))?$/); if (cl) cloudHash(cl); else if (location.hash === '#new') { window.history.replaceState(null, '', location.pathname); openDocData(normDoc({}), null, { fresh: true }); } });
// the tests' and the console's handle on the app
window.JEKcad = {
  version: APP_VERSION, app, sk: SK, view: V,
  doc: () => app.doc, load: d => openDocData(d, null, { fresh: true }), text: () => JSON.stringify(app.doc),
  regen: regenNow, regenDone, changed, checkpoint, undo, redo,
  openFeature, editFeature, okDialog, closeDialog, fieldPick, startSketch, finishSketch, cancelSketch, setTool, addConstraint,
  deleteFeature, moveFeature, setRollback, exportParts, importStep, saveFile, kernel: kernelAsk, cloudPush,
  pickAt, pickHere, overlayPick, selectPick, project, toScreen, fit, viewFrom, setMode, png: viewPng, sketchOn: () => !!app.sketch,
  flyStart, flyStop, flyTurn, modelGeom, modelDimEdit, sketchRight, toggleFeatureShown, setDimsShown,
};
