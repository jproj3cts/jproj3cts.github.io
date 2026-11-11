import { EMBED, TEST_MODE } from '../../../jekray/src/core/constants.js';
import { hooks } from '../../../jekray/src/core/hooks.js';
import { accountGate, keepHere } from '../../../jekray/src/ui/pro.js';
import { editGate } from '../ui/app.js';
import { track } from '../../../jekray/src/io/usage.js';
import { CAD_FORMAT, CAD_STORE_KEY, appliedCount, newDoc, newFeature, normDoc, partLook } from '../core/doc.js';
import { h } from '../../../jekray/src/ui/dom.js';
import { app, changed, checkpoint, downloadFile, emit, on, regenNow, safeName, setStatus, toast } from '../ui/app.js';
import { kernelAsk } from '../page/kernel.js';
import { fit } from '../ui/view3d.js';

/* ==========================================================================
   Files: the .jekcad (the Part Studio as JSON: saving it needs no account), opened from a file or dropped on the
   view; the autosave in this browser (as the other apps keep theirs); STEP imported as a feature; and the parts
   exported as STEP or STL, all of them or one, which needs a free account as JEKion's exports do.
   ========================================================================== */
const SAVE_EVERY = 800;
let saveTimer = null;
export function scheduleSave() {
  if (TEST_MODE || EMBED) return;
  clearTimeout(saveTimer);
  // (signed out, nothing is kept: a Part Studio cannot be changed then either)
  saveTimer = setTimeout(() => { if (!keepHere()) return; try { localStorage.setItem(CAD_STORE_KEY, JSON.stringify(app.doc)); setStatus(hooks.cadCloudLinked && hooks.cadCloudLinked() ? '' : 'Autosaved in this browser'); } catch (err) { setStatus('Not autosaved: this browser’s storage is full'); } }, SAVE_EVERY);
}
export function restoreSaved() {
  if (TEST_MODE || EMBED) return null;
  try { const d = JSON.parse(localStorage.getItem(CAD_STORE_KEY) || 'null'); return d && d.format === CAD_FORMAT ? normDoc(d) : null; } catch (err) { return null; }
}
/* a document opened in place of this one (Undo brings this one back) */
export function openDocData(d, label, opts) {
  if (!d || typeof d !== 'object' || (d.format && d.format !== CAD_FORMAT)) { toast('That is not a .jekcad file', true); return false; }
  if (!(opts && opts.fresh)) checkpoint();
  app.doc = normDoc(d); app.sel = []; app.editing = null; app.sketch = null;
  emit('sel'); emit('sketch'); emit('editing');
  const nm = document.getElementById('docName'); if (nm) nm.value = app.doc.name;
  changed();
  regenNow().then(() => fit());
  if (label) toast('Opened ' + label);
  return true;
}
export function newDocument() {
  if (app.doc.features.length && !confirm('Start a new Part Studio? This one stays in Undo, and in its file if you saved it.')) return;
  checkpoint();
  openDocData(newDoc(), null, { fresh: true });
  track('new', 'cad');
}
export function saveFile() {
  downloadFile(safeName(app.doc.name) + '.jekcad', JSON.stringify(app.doc, null, 1), 'application/json');
  app.unsaved = false; emit('saved');
  track('save', 'cad-file');
}
export function openFile() {
  const inp = h('input', { type: 'file', accept: '.jekcad,.json,.step,.stp' });
  inp.addEventListener('change', () => { if (inp.files[0]) openAnyFile(inp.files[0]); });
  inp.click();
}
export async function openAnyFile(file) {
  if (/\.(step|stp)$/i.test(file.name)) return importStep(file);
  let d;
  try { d = JSON.parse(await file.text()); } catch (err) { toast('That file is not a .jekcad (it is not JSON)', true); return false; }
  return openDocData(d, '“' + file.name + '”');
}
/* a STEP file as an Import feature at the rollback bar: each solid in it a part */
export async function importStep(file) {
  if (!editGate()) return false;
  if (!file) { const inp = h('input', { type: 'file', accept: '.step,.stp' }); inp.addEventListener('change', () => { if (inp.files[0]) importStep(inp.files[0]); }); inp.click(); return false; }
  const data = await file.text();
  if (data.length > 1.8e6) toast('That STEP file is large: the Part Studio can be saved as a file, but the cloud keeps documents up to 2 MB', true);
  checkpoint();
  const at = appliedCount(app.doc), f = newFeature(app.doc, 'import', { file: file.name, data, name: 'Import ' + file.name.replace(/\.(step|stp)$/i, '') });
  app.doc.features.splice(at, 0, f);
  if (app.doc.rollback !== null) app.doc.rollback++;
  changed();
  const out = await regenNow();
  const rep = out && out.features.find(r => r.id === f.id);
  if (rep && rep.ok) { toast('Imported ' + file.name + ': ' + rep.info.solids + ' solid' + (rep.info.solids === 1 ? '' : 's')); fit(); }
  else if (rep) toast('Could not import ' + file.name + ': ' + rep.error, true);
  track('import', 'cad-step');
  return true;
}
/* ---------- exports: STEP and STL, of every part or one ---------- */
export async function exportParts(fmt, ids) {
  if (!accountGate('export ' + (fmt === 'stl' ? 'STL' : 'STEP') + ' files')) return false;
  const parts = app.result ? app.result.parts : [];
  if (!parts.length) { toast('There are no parts to export yet', true); return false; }
  const one = ids && ids.length === 1 ? parts.findIndex(p => p.id === ids[0]) : -1;
  const base = safeName(one >= 0 ? partLook(app.doc, ids[0], one).name : app.doc.name);
  try {
    const bytes = await kernelAsk(fmt === 'stl' ? 'stl' : 'step', { parts: ids || [] });
    downloadFile(base + (fmt === 'stl' ? '.stl' : '.step'), bytes, fmt === 'stl' ? 'model/stl' : 'model/step');
    track('export', 'cad-' + fmt);
    toast('Exported ' + base + (fmt === 'stl' ? '.stl' : '.step'));
    return true;
  } catch (err) { toast('Could not export: ' + err.message, true); return false; }
}
export function wireFiles() {
  hooks.cadSaveLater = scheduleSave;
  on('exportPart', x => exportParts(x.fmt, [x.id]));
  const stage = document.getElementById('stage');
  stage.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); stage.classList.add('dropping'); } });
  stage.addEventListener('dragleave', () => stage.classList.remove('dropping'));
  stage.addEventListener('drop', e => { e.preventDefault(); stage.classList.remove('dropping'); const f = e.dataTransfer.files[0]; if (f) openAnyFile(f); });
  const nm = document.getElementById('docName');
  nm.value = app.doc.name;
  nm.addEventListener('change', () => { const v = nm.value.trim(); if (v && v !== app.doc.name) { checkpoint(); app.doc.name = v; changed(); } });
}
