import { project } from '../state/project.js';
import { curBench } from '../state/tabs.js';
import { getEl, selected } from '../state/elements.js';
import { DATA_FORMATS, dfWrite } from '../core/datafiles.js';
import { DATA_KINDS, dataCounts, gatherData, partsMeta } from '../engines/data-export.js';
import { mainPanel, panelInto, pinBoxes, viewState, vs } from '../ui/panel.js';
import { diffraction } from '../engines/pd-cavity.js';
import { downloadFile, safeFileName, toast } from '../ui/actions.js';
import { accountGate, designPro, designWhy, needMark } from '../ui/pro.js';
import { APP_VERSION } from '../ui/news.js';
import { snapshot } from '../ui/tabs.js';
import { track } from './usage.js';

/* ---------- File › Export data ----------
   The numbers behind the bench as files: its readouts (every screen, detector, spectrometer and antenna as one
   table), its plots' curves, each screen's ray hits and field map, its Gaussian beams, its sweeps and studies,
   and the bench itself, as CSV (a zip of CSV files with README.txt), JSON, Excel, NumPy or MATLAB
   (core/datafiles.js writes them; engines/data-export.js gathers all but the plots, which are the panels' own).
   A free account exports one kind at a time as CSV or JSON; several kinds at once, everything in one go,
   and Excel, NumPy and MATLAB files are JEKrayPro's. The tests, and a build without accounts, are not gated. */
export const DATA_PRO = new Set(['xlsx', 'npz', 'mat']);
export const DATA_FMT_LIST = [['csv', 'CSV (zip)'], ['json', 'JSON'], ['xlsx', 'Excel (.xlsx)'], ['npz', 'NumPy (.npz)'], ['mat', 'MATLAB (.mat)']];
const PRO_FMT_WHAT = 'export data as Excel, NumPy or MATLAB files', PRO_MANY_WHAT = 'export several kinds of data at once', PRO_ALL_WHAT = 'export everything at once';

/* what every file says of itself: the bench, the tab, JEKray's version and when */
export function dataMeta(extra) {
  return Object.assign({ title: 'JEKray data', bench: project.name, tab: (curBench() || {}).name || '', version: APP_VERSION, created: new Date().toISOString(),
    source: 'JEKray, https://jeksys.net/jek/tools/jekray.html' }, extra || {});
}

/* ---- the plots: the curves each part's panel draws, read from the panels (those open, and each other part's made
   out of sight for a moment: its plots draw as its panel would, then it goes) ---- */
const PLOTS = { key: '', out: null, busy: null };
const PLOT_TABS = ['params', 'plots', 'rays', 'pulse'];          // a screen's tabs with plots (Aberrations, worked out across the field, left to its panel)
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const plotRows = D => (typeof D.rows === 'function' ? D.rows() : D.rows) || [];
function plotItem(D, el) {
  const rows = plotRows(D);
  return { kind: 'table', name: D.name, about: 'the curves of the plot ' + D.name + (el ? ' (' + el.name + '’s panel)' : ''),
    cols: D.cols.map((c, j) => ({ name: String(c), unit: '', values: rows.map(r => (r[j] === '' ? null : r[j])) })) };
}
// (the bench as it stands, and the views its plots are set to)
const plotsKey = () => { let v = ''; try { v = JSON.stringify([...viewState]); } catch (err) { v = String(Math.random()); } return snapshot() + '|' + v; };
export async function plotsData() {
  const key = plotsKey();
  if (PLOTS.key === key && PLOTS.out) return PLOTS.out;
  if (PLOTS.busy && PLOTS.busy.key === key) return PLOTS.busy.p;
  const p = (async () => {
    const items = [], parts = new Set(), seen = new Set();
    const take = (cv, el) => {
      const D = cv._csv;
      if (!D || !D.cols || seen.has(D.name)) return;
      try { const it = plotItem(D, el); if (!it.cols.length || !it.cols[0].values.length) return; seen.add(D.name); items.push(it); if (el) parts.add(el.id); } catch (err) { /* a plot that cannot give its numbers now */ }
    };
    // the panels open now, as they are
    for (const [box, el] of [[mainPanel, selected()], ...[...pinBoxes].map(([id, b]) => [b, getEl(id)])]) {
      if (!box || box.style.display === 'none') continue;
      for (const cv of box.querySelectorAll('canvas')) take(cv, el);
    }
    // every part's (those open too, for their other tabs), out of sight: laid out (so its plots measure their width) but not seen, its sections open; a screen's
    // or a mirror's face's each tab of plots too (its field worked out first, as its Plots tab would), its tab put back after
    const probe = document.createElement('aside');
    probe.className = 'rt-panel rt-dataprobe';
    probe.setAttribute('aria-hidden', 'true');
    document.body.append(probe);
    const made = [], tabsWas = new Map();
    try {
      for (const el of project.elements) {
        if (el.type === 'draw') continue;
        const tabbed = el.type === 'screen' || el.type === 'mirror';
        for (const tab of tabbed ? PLOT_TABS : [null]) {
          if (tab) { if (!tabsWas.has(el.id)) tabsWas.set(el.id, vs(el).screenTab); vs(el).screenTab = tab; if (tab === 'plots') { try { diffraction(el); } catch (err) { /* its plots show what they can */ } } }
          const box = document.createElement('div');
          probe.append(box);
          try { panelInto(box, el); } catch (err) { box.remove(); continue; }
          if (tab && vs(el).screenTab !== tab) { box.remove(); continue; }          // a tab this part does not have
          if (box.querySelector('canvas')) made.push([box, el]); else box.remove();
        }
      }
      for (const [id, t] of tabsWas) { const el = getEl(id); if (el) vs(el).screenTab = t; }
      if (made.length) for (let k = 0; k < 3; k++) await nextFrame();
      for (const [box, el] of made) for (const cv of box.querySelectorAll('canvas')) take(cv, el);
    } finally { probe.remove(); for (const [id, t] of tabsWas) { const el = getEl(id); if (el) vs(el).screenTab = t; } }
    return { items, parts };
  })();
  PLOTS.busy = { key, p };
  // kept for the bench as it stands after (a panel made the first time gives its part its views' defaults), if it did not change meanwhile
  const bench = snapshot();
  try { const out = await p; if (snapshot() === bench) { PLOTS.key = plotsKey(); PLOTS.out = out; } return out; } finally { if (PLOTS.busy && PLOTS.busy.p === p) PLOTS.busy = null; }
}

/* the kinds asked for, as one file in the format: { name, blob, count } */
async function dataFile(kinds, fmt) {
  const G = { items: [], parts: new Set() };
  for (const [k] of DATA_KINDS) {
    if (!kinds.includes(k)) continue;
    const R = k === 'plots' ? await plotsData() : gatherData([k]);
    G.items.push(...R.items);
    for (const id of R.parts) G.parts.add(id);
  }
  if (!G.items.length) return null;
  const what = kinds.length === DATA_KINDS.length ? 'all' : kinds.map(k => (DATA_KINDS.find(q => q[0] === k) || [k, k])[1].toLowerCase()).join(', ');
  const set = { meta: dataMeta({ title: 'JEKray data: ' + what, parts: partsMeta(G.parts) }), items: G.items };
  const out = await dfWrite(set, fmt);
  const base = safeFileName(project.name) + ' - ' + (kinds.length === 1 ? (DATA_KINDS.find(q => q[0] === kinds[0]) || [0, kinds[0]])[1].toLowerCase() : 'data');
  return { name: base + out.ext, blob: new Blob([out.bytes], { type: out.mime }), count: G.items.length };
}

/* the kinds ticked, in the format chosen: a free account's for one kind as CSV or JSON; JEKrayPro's for more */
export async function exportData(kinds, fmt) {
  if (!accountGate('export data')) return null;
  if (DATA_PRO.has(fmt)) { if (!designPro(PRO_FMT_WHAT)) return null; }
  if (kinds.length > 1) { if (!designPro(PRO_MANY_WHAT)) return null; }
  if (!kinds.length) { toast('Tick what to export first.', true); return null; }
  try {
    const F = await dataFile(kinds, DATA_FORMATS[fmt] ? fmt : 'csv');
    if (!F) { toast('There is nothing of that on this bench to export yet.', true); return null; }
    downloadFile(F.name, F.blob);
    toast('Saved ' + F.name);
    track('export', 'data.' + fmt);
    return F.name;
  } catch (err) { toast('The data could not be exported: ' + err.message, true); return null; }
}
/* everything there is, in one file (JEKrayPro) */
export async function exportEverything(fmt) {
  if (!accountGate('export data')) return null;
  if (!designPro(PRO_ALL_WHAT)) return null;
  try {
    const F = await dataFile(DATA_KINDS.map(k => k[0]), DATA_FORMATS[fmt] ? fmt : 'csv');
    if (!F) { toast('There is nothing on this bench to export yet.', true); return null; }
    downloadFile(F.name, F.blob);
    toast('Saved ' + F.name);
    track('export', 'data.all.' + fmt);
    return F.name;
  } catch (err) { toast('The data could not be exported: ' + err.message, true); return null; }
}

/* ---- the dialog ---- */
const DATA_HINT = { readouts: 'every screen, detector, spectrometer and antenna: one table', plots: 'the curves each part’s panel plots', screens: 'each screen’s ray hits, and its field map',
  beams: 'each Gaussian beam’s q, size, waist and divergence', sweeps: 'the sweeps set, RF frequency sweeps and the bench’s studies', bench: 'every part and its settings' };
export function wireDataExport() {
  const btn = document.getElementById('btnExportData'), dlg = document.getElementById('dataDialog');
  if (!btn || !dlg) return;
  const list = document.getElementById('dataKinds'), fmts = document.getElementById('dataFormats'), go = document.getElementById('dataGo'), all = document.getElementById('dataAll'), note = document.getElementById('dataNote');
  const KEY = 'jek-rt-data-export';
  let kept = {};
  try { kept = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (err) { kept = {}; }
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(kept)); } catch (err) { /* this visit only */ } };
  const fmtNow = () => (fmts.querySelector('input:checked') || {}).value || 'csv';
  const kindsNow = () => [...list.querySelectorAll('input:checked')].map(cb => cb.value);
  for (const [k, label] of DATA_FMT_LIST) {
    const lab = document.createElement('label');
    lab.className = 'rt-check';
    lab.innerHTML = '<input type="radio" name="dataFmt" value="' + k + '"> <span></span>';
    lab.querySelector('span').textContent = label;
    if (DATA_PRO.has(k)) needMark(lab, 'pro', PRO_FMT_WHAT); else needMark(lab, 'account', 'export data');
    fmts.append(lab);
  }
  needMark(all, 'pro', PRO_ALL_WHAT);
  const counts = { plots: null };
  const say = () => {
    const ks = kindsNow(), f = fmtNow(), pro = DATA_PRO.has(f) || ks.length > 1;
    go.disabled = !ks.length;
    note.textContent = !ks.length ? 'Tick at least one kind of data.' : pro && designWhy(ks.length > 1 ? PRO_MANY_WHAT : PRO_FMT_WHAT) ? 'With a free account: one kind at a time, as CSV or JSON. Several at once, everything in one go, and Excel, NumPy and MATLAB files are part of JEKrayPro.'
      : 'Each file says what it holds: the bench, the JEKray version, the date, every column’s unit and the settings of the parts the numbers come from.';
    go.textContent = ks.length > 1 ? 'Export ' + ks.length + ' kinds' : 'Export';
  };
  const fill = () => {
    const C = Object.assign(dataCounts(), counts);
    list.replaceChildren();
    for (const [k, label] of DATA_KINDS) {
      const n = C[k], lab = document.createElement('label');
      lab.className = 'rt-check';
      lab.innerHTML = '<input type="checkbox" value="' + k + '"> <span class="rt-dk"><b></b><i></i></span>';
      lab.querySelector('b').textContent = label + (n === null ? ' (counting…)' : ' (' + n + ')');
      lab.querySelector('i').textContent = ': ' + DATA_HINT[k];
      const cb = lab.querySelector('input');
      cb.checked = kept.kinds ? kept.kinds.includes(k) : k === 'readouts';
      if (n === 0) { cb.checked = false; cb.disabled = true; lab.classList.add('off'); }
      cb.id = 'dataKind-' + k;
      list.append(lab);
    }
    say();
  };
  list.addEventListener('change', () => { kept.kinds = kindsNow(); keep(); say(); });
  fmts.addEventListener('change', () => { kept.fmt = fmtNow(); keep(); say(); });
  btn.addEventListener('click', () => {
    counts.plots = null;
    const r = fmts.querySelector('input[value="' + (DATA_FORMATS[kept.fmt] ? kept.fmt : 'csv') + '"]');
    if (r) r.checked = true;
    fill();
    dlg.showModal();
    const first = list.querySelector('input:checked') || list.querySelector('input:not(:disabled)');
    if (first) first.focus();
    plotsData().then(P => { counts.plots = P.items.length; if (dlg.open) { const was = kindsNow(); fill(); for (const cb of list.querySelectorAll('input')) if (was.includes(cb.value) && !cb.disabled) cb.checked = true; say(); } })
      .catch(() => { counts.plots = 0; if (dlg.open) fill(); });
  });
  const busy = async (b, fn) => { const t = b.textContent; b.disabled = true; b.textContent = 'Exporting…'; try { const name = await fn(); if (name) dlg.close(); } finally { b.disabled = false; b.textContent = t; say(); } };
  go.addEventListener('click', () => busy(go, () => exportData(kindsNow(), fmtNow())));
  all.addEventListener('click', () => busy(all, () => exportEverything(fmtNow())));
  document.getElementById('dataClose').addEventListener('click', () => dlg.close());
}
