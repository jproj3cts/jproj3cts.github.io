import { DATA_FORMATS, dfWrite } from '../../../jekray/src/core/datafiles.js';
import { accountGate, designPro, needMark } from '../../../jekray/src/ui/pro.js';
import { track } from '../../../jekray/src/io/usage.js';
import { project } from '../state/project.js';
import { ION_DATA_KINDS, gatherIonData, ionDataCounts } from '../engines/data.js';
import { h } from '../../../jekray/src/ui/dom.js';
import { downloadFile, safeFileName, toast } from '../ui/actions.js';
import { SIM } from '../ui/sim.js';
import { APP_VERSION } from '../ui/news.js';

/* ==========================================================================
   File › Export data: the bench's numbers as CSV (a zip), JSON, Excel, NumPy or MATLAB files, written by JEKray's
   writers. Gated as JEKray's: one kind as CSV or JSON needs a free account; a workbook, NumPy or MATLAB file,
   several kinds at once or everything is JEKrayPro's.
   ========================================================================== */
export const DATA_PRO_ION = new Set(['xlsx', 'npz', 'mat']);
let fmt = 'csv';
const metaOf = () => ({ title: project.name, tool: 'JEKion', version: APP_VERSION, created: new Date().toISOString(), units: { length: 'mm', time: 'us', energy: 'eV', potential: 'V', mass: 'u', charge: 'e', field: 'gauss' }, format: 'jekion', grid: project.grid });
export async function exportData(kinds, f) {
  if (!accountGate('export data')) return false;
  if (DATA_PRO_ION.has(f) || kinds.length > 1) { if (!designPro(DATA_PRO_ION.has(f) ? 'export data as ' + DATA_FORMATS[f].label : 'export several kinds of data at once')) return false; }
  const items = gatherIonData(project, SIM.result, SIM.trap, kinds);
  if (!items.length) { toast('Nothing of that kind to export yet: fly first', true); return false; }
  const set = { meta: Object.assign(metaOf(), { kinds }), items };
  try {
    const W = await dfWrite(set, f);
    const name = safeFileName(project.name) + (kinds.length === 1 ? ' ' + kinds[0] : '') + W.ext;
    downloadFile(name, new Blob([W.bytes], { type: W.mime })); toast('Saved ' + name); track('export', 'ion-data-' + f);
    return true;
  } catch (err) { toast('Could not write the file: ' + err.message, true); return false; }
}
export async function exportEverything(f) {
  if (!accountGate('export data')) return false;
  if (!designPro('export everything at once')) return false;
  return exportData(ION_DATA_KINDS.map(k => k[0]), f);
}
function fillDialog() {
  const kindsBox = document.getElementById('dataKinds'), fmtBox = document.getElementById('dataFormats'), note = document.getElementById('dataNote');
  const counts = ionDataCounts(project, SIM.result, SIM.trap);
  kindsBox.replaceChildren(...ION_DATA_KINDS.map(([k, label, about]) => h('label', { class: 'rt-check', title: about }, h('input', { type: 'checkbox', value: k, disabled: counts[k] ? null : '' }), label + (counts[k] ? ' (' + counts[k] + ')' : ' (none yet)'))));
  const first = kindsBox.querySelector('input:not(:disabled)'); if (first) first.checked = true;
  fmtBox.replaceChildren(...Object.entries(DATA_FORMATS).map(([k, F]) => { const b = h('button', { type: 'button', role: 'radio', class: 'rt-btn', 'aria-checked': String(k === fmt), onclick: () => { fmt = k; for (const x of fmtBox.children) x.setAttribute('aria-checked', String(x === b)); } }, F.label); return DATA_PRO_ION.has(k) ? needMark(b, 'pro', 'export data as ' + F.label) : b; }));
  note.textContent = 'One kind as CSV or JSON needs a free account; Excel, NumPy and MATLAB, several kinds at once, or everything, are JEKrayPro’s. Every file carries the bench’s name, the units and the array’s settings.';
}
export function wireDataExport() {
  const dlg = document.getElementById('dataDialog');
  document.getElementById('btnExportData').addEventListener('click', () => { if (!accountGate('export data')) return; fillDialog(); dlg.showModal(); });
  document.getElementById('dataClose').addEventListener('click', () => dlg.close());
  document.getElementById('dataGo').addEventListener('click', async () => { const kinds = [...document.querySelectorAll('#dataKinds input:checked')].map(i => i.value); if (!kinds.length) { toast('Tick what to export', true); return; } if (await exportData(kinds, fmt)) dlg.close(); });
  document.getElementById('dataAll').addEventListener('click', async () => { if (await exportEverything(fmt)) dlg.close(); });
}
