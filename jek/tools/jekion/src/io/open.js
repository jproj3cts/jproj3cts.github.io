import { EMBED, TEST_MODE, cloud } from '../../../jekray/src/core/constants.js';
import { hooks } from '../../../jekray/src/core/hooks.js';
import { goal, track } from '../../../jekray/src/io/usage.js';
import { ION_FORMAT, ION_STORE_KEY } from '../core/units.js';
import { project, setFuture, setHistory, setSelectedId } from '../state/project.js';
import { checkpoint, demoProject, loadProject, serialize } from '../state/elements.js';
import { changed, downloadFile, markUnsaved, safeFileName, setStatus, toast, updateUndoButtons } from '../ui/actions.js';
import { fitView } from '../ui/render.js';
import { importCad } from './step.js';
import { accountGate } from '../../../jekray/src/ui/pro.js';

/* ==========================================================================
   Files: saving and opening .jekion files, the autosave in this browser, a new bench, the examples, and what to
   do with a file dropped on the bench (a bench, or CAD to bring in as electrodes).
   ========================================================================== */
export let saveTimer = null;
export function scheduleSave() {
  if (TEST_MODE || EMBED || !project) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(ION_STORE_KEY, JSON.stringify(serialize())); if (!cloud) setStatus('Autosaved in this browser'); }    // a cloud bench's status is the cloud's
    catch (err) { setStatus('This browser is blocking autosave. Use Save .jekion to keep your work.'); }
  }, 350);
}
export function restoreSaved() {
  if (TEST_MODE || EMBED) return null;
  try { const d = JSON.parse(localStorage.getItem(ION_STORE_KEY) || 'null'); if (d && d.format === ION_FORMAT) return d; } catch (err) { /* nothing kept */ }
  return null;
}
export function saveFile() {
  if (!accountGate('save the bench as a file')) return;
  const name = safeFileName(project.name) + '.jekion';
  downloadFile(name, new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' }));
  toast('Saved ' + name); markUnsaved(false); goal('save');
}
/* a project's data opened onto the bench (undoable), with a note of what was changed on the way */
export function openProjectData(d, name, opts = {}) {
  if (!d || typeof d !== 'object') { toast('That is not a JEKion bench', true); return false; }
  if (d.format && d.format !== ION_FORMAT) { toast('That is a ' + d.format + ' file, not a JEKion bench' + (d.format === 'jekray' ? ': open it in JEKray' : ''), true); return false; }
  checkpoint();
  loadProject(d);
  if (name && !d.name) project.name = String(name).replace(/\.jekion$/i, '').slice(0, 80);
  setSelectedId(null);
  if (opts.fresh) { setHistory([]); setFuture([]); }
  hooks.ionViewMenu();
  changed(true); fitView(); markUnsaved(false);
  return true;
}
export function openFile(file) {
  const rd = new FileReader();
  rd.onload = () => { try { openProjectData(JSON.parse(rd.result), file.name); toast('Opened ' + file.name); track('import', 'jekion'); } catch (err) { toast('Could not read ' + file.name + ': ' + err.message, true); } };
  rd.readAsText(file);
}
export function newProject() {
  checkpoint();
  const P = demoProject(); P.electrodes = []; P.ions = []; P.detectors = []; P.name = 'Untitled';
  loadProject(P); setSelectedId(null);
  hooks.ionViewMenu(); changed(true); fitView(); markUnsaved(false);
}
/* an example by name: demos/<name>.jekion */
export async function openDemo(name, undoable) {
  try {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error('there is no example by that name');
    const res = await fetch('demos/' + name + '.jekion');
    if (!res.ok) throw new Error('that example could not be fetched');
    const data = await res.json();
    openProjectData(data, data.name || name, { fresh: !undoable }); track('example', 'ion-' + name);
    updateUndoButtons();
  } catch (err) { toast('Could not open the example: ' + err.message, true); }
}
/* a file dropped on the bench, or chosen */
export function openDropped(file, at) {
  const n = file.name.toLowerCase();
  if (/\.(step|stp|stl)$/.test(n)) { importCad(file, at); return; }
  if (/\.(jekion|json)$/.test(n)) { openFile(file); return; }
  if (/\.jekray$/.test(n)) { toast(file.name + ' is a JEKray bench: open it in JEKray', true); return; }
  toast('Drop a .jekion bench, or a .step or .stl file to bring in as electrodes', true);
}
export function wireOpen() {
  const fj = document.getElementById('fileJekion'), fc = document.getElementById('fileCad');
  document.getElementById('btnOpen').addEventListener('click', () => fj.click());
  fj.addEventListener('change', () => { if (fj.files[0]) openFile(fj.files[0]); fj.value = ''; });
  document.getElementById('btnImportCad').addEventListener('click', () => fc.click());
  fc.addEventListener('change', () => { for (const f of fc.files) importCad(f, null); fc.value = ''; });
  document.getElementById('btnSave').addEventListener('click', saveFile);
  hooks.ionSave = saveFile;
  const dlg = document.getElementById('newDialog');
  document.getElementById('btnNew').addEventListener('click', () => { if (project.electrodes.length || project.ions.length) dlg.showModal(); else newProject(); });
  document.getElementById('newCancel').addEventListener('click', () => dlg.close());
  document.getElementById('newConfirm').addEventListener('click', () => { dlg.close(); newProject(); toast('A new bench. Undo brings the old one back.'); });
  document.getElementById('importClose').addEventListener('click', () => document.getElementById('importDialog').close());
  window.addEventListener('beforeunload', () => { if (!TEST_MODE && !EMBED && project) try { localStorage.setItem(ION_STORE_KEY, JSON.stringify(serialize())); } catch (err) { /* the last autosave stands */ } });
}
