import { TEST_MODE } from '../core/constants.js';
import { hooks } from '../core/hooks.js';
import { project } from '../state/project.js';
import { h } from './panel.js';
import { downloadFile, safeFileName, toast } from './actions.js';
import { adoptBench, checkpoint, snapshot } from './tabs.js';
import { serialize } from '../state/elements.js';
import { modDelta } from '../engines/mods.js';
import { accountsOn } from '../io/account.js';
import { track } from '../io/usage.js';
import { NUMPY_BYTES, PY_BYTES, PY_DIR, pyReady, pyRun } from './python.js';
import { WORKERS_OK, newAppWorker } from '../page/workers.js';
import { DATA_FORMATS, dfArrayCsv, dfItemsOf, dfTableCsv, dfUtf8, dfWrite, dfZip } from '../core/datafiles.js';
import { dataMeta } from '../io/data-export.js';

/* ---------- Scripts: JavaScript or Python run against the bench, in the background (JEKrayPro) ----------
   File › Scripts… opens an editor beside the bench. A script is JavaScript or Python given J, the same
   calls the documentation lists for scripting (a screen's spot, a detector's reading, an
   antenna's gain, a part moved and read again, a sweep to a table), and log(). What it returns
   (in Python: what it sets result to, or its last line's value) is shown: a table when it is rows,
   which Save as… keeps as CSV, JSON, Excel, NumPy or MATLAB, else as JSON; save(name, data, format)
   keeps what it makes as files, downloaded when the run ends (not when it is stopped). A script runs
   in the script worker (page/script-worker.js), on its own copy of the bench, so the page carries on meanwhile and Stop ends it at once; its log()
   lines come as they are written, and when it ends what it changed is applied to the bench as one
   step Undo puts back. A script that needs the page itself (J.sweepPlay) can be run on the page
   instead, as typing it into the browser's console would (no Stop then). Scripts are kept in this
   browser by name with their language, or saved as a .js or .py file. Python is Pyodide
   (ui/python.js), fetched the first time a Python script runs. */

const KEY = 'jek-raytracer-scripts', LANG_KEY = 'jek-raytracer-scripts-lang';
export const SCRIPT_LANGS = [['js', 'JavaScript'], ['py', 'Python']];
// the calls a script may make, from the page's own (ui/boot.js): the stable set the documentation lists
const CALLS = ['load', 'serialize', 'trace', 'select', 'stats', 'detector', 'lensAntenna', 'rfSweep', 'linkBudget', 'arrivals', 'asmPrescription', 'asmEfl',
  'exportZmx', 'sweepPlay', 'sweepPause', 'typeLabel', 'benches', 'showTab', 'paraxial', 'metric', 'diffraction', 'getParam', 'setParam'];

export const EXAMPLE_SCRIPTS = [
  ['Read a screen', `// The spot on the first screen: its rms radius, and the share of the sources' light that reaches it.
// (A screen counts rays, not milliwatts: for mW, read a photodetector there.)
const screen = J.elements().find(e => e.type === 'screen');
if (!screen) throw new Error('Put a screen on the bench first.');
const S = J.stats(screen.name);
log('rms', S.rms, 'mm;', S.powerPct, '% of the light from the sources reaching it');
return S;`, 'js'],
  ['Sweep a part to a table', `// Move the first lens along x and read the spot at each place.
// The result is a table; Save as keeps it (CSV, JSON, Excel, NumPy or MATLAB) for a plot.
const lens = J.elements().find(e => e.type === 'lens'), screen = J.elements().find(e => e.type === 'screen');
if (!lens || !screen) throw new Error('This needs a lens and a screen.');
const x0 = J.get(lens.name, 'x');
return J.sweep(lens.name, 'x', J.range(x0 - 20, x0 + 20, 21), () => { const S = J.stats(screen.name); return { rms: S.rms, powerPct: S.powerPct }; });`, 'js'],
  ['Check a figure', `// A check that fails loudly when a figure drifts: here a detector's reading.
const pd = J.elements().find(e => e.type === 'detector');
if (!pd) throw new Error('This needs a photodetector.');
const R = J.detector(pd.name);
if (R.mw < 0.1) throw new Error('only ' + R.mw.toFixed(4) + ' mW reaches ' + pd.name);
log('ok:', R.mw.toFixed(4), 'mW');
return R;`, 'js'],
  ['Every part', `// Every part on this bench, with its type and place.
return J.elements();`, 'js'],
  ['Read a screen', `# The spot on the first screen: its rms radius, and the share of the sources' light that reaches it.
# (A screen counts rays, not milliwatts: for mW, read a photodetector there.)
screen = next((e for e in J.elements() if e['type'] == 'screen'), None)
if screen is None:
    raise RuntimeError('Put a screen on the bench first.')
S = J.stats(screen['name'])
log('rms', S['rms'], 'mm;', S['powerPct'], '% of the light from the sources reaching it')
result = S`, 'py'],
  ['Sweep a part to a table', `# Move the first lens along x and read the spot at each place.
# The result is a table; Save as keeps it (CSV, JSON, Excel, NumPy or MATLAB) for a plot.
import numpy as np

parts = J.elements()
lens = next((e for e in parts if e['type'] == 'lens'), None)
screen = next((e for e in parts if e['type'] == 'screen'), None)
if lens is None or screen is None:
    raise RuntimeError('This needs a lens and a screen.')

def read(x):
    S = J.stats(screen['name'])
    return {'rms': S['rms'], 'powerPct': S['powerPct']}

x0 = J.get(lens['name'], 'x')
result = J.sweep(lens['name'], 'x', np.linspace(x0 - 20, x0 + 20, 21), read)`, 'py'],
  ['Check a figure', `# A check that fails loudly when a figure drifts: here a detector's reading.
pd = next((e for e in J.elements() if e['type'] == 'detector'), None)
if pd is None:
    raise RuntimeError('This needs a photodetector.')
R = J.detector(pd['name'])
if R['mw'] < 0.1:
    raise RuntimeError(f"only {R['mw']:.4f} mW reaches {pd['name']}")
log('ok:', f"{R['mw']:.4f}", 'mW')
result = R`, 'py'],
  ['Every part', `# Every part on this bench, with its type and place (a last line's value is shown, as result would be).
J.elements()`, 'py'],
];

// why scripts are not available now ('' when they are): they are JEKrayPro's; the tests and a build without accounts are not gated
export const scriptsWhy = () => (TEST_MODE || !accountsOn() ? '' : hooks.proWhy() || '');

/* what a script is given: P is the page's window.JEKray (or, in the tests, the same calls made in Node); saves, the
   list its save() calls go into, for the page to make into files when the run ends */
export const SAVE_MAX = 20;
export function makeJ(P = window.JEKray, saves = []) {   // (in the script worker, P is its own: page/script-worker.js)
  const J = {};
  for (const k of CALLS) if (typeof P[k] === 'function') J[k] = (...a) => P[k](...a);
  J.elements = () => project.elements.map(e => ({ name: e.name, type: e.type, x: e.x, y: e.y, angle: e.angle }));
  J.element = name => { const e = P.byName(name); if (!e) throw new Error('No part is called ' + JSON.stringify(name)); return JSON.parse(JSON.stringify(e)); };
  J.get = (name, path) => { J.element(name); return P.getParam(name, path); };
  J.set = (name, path, v) => { J.element(name); P.setParam(name, path, v); P.trace(); return J; };
  J.range = (a, b, n) => { n = Math.max(2, Math.round(n)); return Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1)); };
  // each value set, read, and the parameter put back: rows of { [path]: value, ...what was read }
  J.sweep = (name, path, values, read) => {
    const was = J.get(name, path), rows = [];
    try {
      for (const v of values) { J.set(name, path, v); const r = read(v); rows.push(Object.assign({ [path]: v }, r !== null && typeof r === 'object' ? r : { value: r })); }
    } finally { P.setParam(name, path, was); P.trace(); }
    return rows;
  };
  J.csv = rows => toCsv(rows);
  // save(name, data, format, meta): a file made of data when the run ends, in a format of DATA_FORMATS (core/datafiles.js)
  J.save = (name, data, format = 'csv', meta = null) => {
    const f = String(format == null ? 'csv' : format).toLowerCase().replace(/^\./, '');
    if (!DATA_FORMATS[f]) throw new Error('save: the format is one of ' + Object.keys(DATA_FORMATS).join(', ') + ', not ' + JSON.stringify(format));
    if (data === undefined) throw new Error('save: give it something to save, as save(name, data)');
    if (saves.length >= SAVE_MAX) throw new Error('save: ' + SAVE_MAX + ' files at most from one run');
    saves.push({ name: String(name == null || name === '' ? 'data' : name).slice(0, 80), data: saveCopy(data), format: f,
      meta: meta === null || meta === undefined ? null : typeof meta === 'object' && !Array.isArray(meta) ? saveCopy(meta) : { note: String(meta) } });
  };
  return J;
}
/* what save() is given, as it is then (a script may change it after): cloned, or where that cannot be (a function in it), its plain parts */
function saveCopy(v, seen = new Set()) {
  try { return structuredClone(v); } catch (err) { /* below */ }
  if (v === null || typeof v !== 'object') return typeof v === 'function' || typeof v === 'symbol' ? undefined : v;
  if (ArrayBuffer.isView(v)) return v.slice();
  if (seen.has(v)) return null;
  seen.add(v);
  const out = Array.isArray(v) ? v.map(x => { const y = saveCopy(x, seen); return y === undefined ? null : y; }) : {};
  if (!Array.isArray(v)) for (const k of Object.keys(v)) { const y = saveCopy(v[k], seen); if (y !== undefined) out[k] = y; }
  seen.delete(v);
  return out;
}

/* One thing a script saved, as a file: { name, blob }. A single table or array as CSV is a plain .csv; anything else
   as CSV is a zip of them with README.txt, and every other format one file with an item for each named thing */
export async function scriptDataFile(s, script) {
  const items = dfItemsOf(s.data, s.name), base = safeFileName(s.name);
  const user = s.meta && typeof s.meta === 'object' ? s.meta : {};
  const meta = Object.assign({}, user, dataMeta({ title: 'JEKray script data: ' + s.name, script: script || '' }));
  if (s.format === 'csv' && items.length === 1 && items[0].kind !== 'value') {
    const text = items[0].kind === 'table' ? dfTableCsv(items[0]) : dfArrayCsv(items[0]);
    return { name: base + '.csv', base, ext: '.csv', blob: new Blob([dfUtf8(text)], { type: 'text/csv' }) };
  }
  const out = await dfWrite({ meta, items }, s.format);
  return { name: base + out.ext, base, ext: out.ext, blob: new Blob([out.bytes], { type: out.mime }) };
}
/* the files a run's save() calls asked for, downloaded (a run's script is JEKrayPro's: so is this). More than five come as one zip */
export async function saveScriptFiles(saves, script) {
  if (scriptsWhy()) { toast(scriptsWhy(), true); return []; }
  if (!saves || !saves.length) return [];
  const files = [], used = new Set();
  for (const s of saves) {
    try {
      const F = await scriptDataFile(s, script);
      let name = F.name, k = 2;
      while (used.has(name.toLowerCase())) name = F.base + ' ' + k++ + F.ext;
      used.add(name.toLowerCase());
      files.push({ name, blob: F.blob, format: s.format });
    } catch (err) { toast('“' + s.name + '” could not be saved: ' + err.message, true); }
  }
  if (!files.length) return [];
  if (files.length > 5) {
    const parts = await Promise.all(files.map(async f => ({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) })));
    const name = safeFileName((script || 'script') + ' files') + '.zip';
    downloadFile(name, new Blob([await dfZip(parts, { deflate: false })], { type: 'application/zip' }));
    toast('Saved ' + name + ': ' + files.map(f => f.name).join(', '));
  } else {
    for (const f of files) downloadFile(f.name, f.blob);
    toast('Saved ' + files.map(f => f.name).join(', '));
  }
  for (const f of files) track('export', 'script.' + f.format);
  return files.map(f => f.name);
}
const SAVE_AS = [['csv', 'CSV', 'A .csv file (a zip of them for several tables)'], ['json', 'JSON', 'One .json file'], ['xlsx', 'Excel', 'An .xlsx workbook, a sheet for each table'],
  ['npz', 'NumPy', 'A NumPy .npz file: numpy.load reads it'], ['mat', 'MATLAB', 'A MATLAB .mat file: load (or scipy.io.loadmat) reads it']];
const isRows = v => Array.isArray(v) && v.length > 0 && v.every(r => r && typeof r === 'object' && !Array.isArray(r));
const cell = v => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : Number(v.toPrecision(6)).toString()) : v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
function toCsv(rows) {
  if (!isRows(rows)) return '';
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const esc = s => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(cell(r[c]))).join(','))].join('\n') + '\n';
}

/* a script's text run against J, in its language ('js' or 'py'): { result, logs, error, traceback };
   onLog(line), if given, is told each log() line (and in Python each print() line) as it is written */
export async function execScript(code, J, lang, say, onLog) {
  if (lang === 'py') {
    try {
      const R = await pyRun(code, J, say, undefined, onLog);
      return { result: R.result === null ? undefined : R.result, logs: R.logs, error: R.error, traceback: R.traceback };
    } catch (err) { return { result: undefined, logs: [], error: (err && err.message) || String(err), traceback: null }; }
  }
  const logs = [], log = (...a) => { const line = a.map(cell).join(' '); logs.push(line); if (onLog) onLog(line); };
  let result, error = null;
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    // (in a block of its own, so a script's own const save or log is its own, as before save() was given)
    const fn = new AsyncFunction('J', 'log', 'save', '"use strict";\n{\n' + String(code) + '\n}');
    result = await fn(J, log, (...a) => (J.save ? J.save(...a) : undefined));
  } catch (err) {
    error = (err && err.message) || String(err);
  }
  return { result, logs, error, traceback: null };
}
/* what to say when Python could not be loaded */
export function pyLoadError(err) {
  const net = /fetch|network|HTTP|import/i.test((err && err.message) || '') || (typeof navigator !== 'undefined' && navigator.onLine === false);
  return 'Python could not be loaded (' + ((err && err.message) || err) + '). ' + (net ? 'It is fetched the first time a Python script runs: try again when online.' : 'This browser may be too old to run it: try a current Chrome, Edge, Firefox or Safari.');
}

/* The script worker (page/script-worker.js), kept between runs: one run at a time, ended by Stop */
const SCRIPT_W = { w: null, failed: false, ok: false, py: false, run: null, seq: 0 };
const scriptWorkerOk = () => WORKERS_OK && !SCRIPT_W.failed;
function scriptWorker() {
  if (SCRIPT_W.w) return SCRIPT_W.w;
  try { SCRIPT_W.w = newAppWorker(true); } catch (err) { SCRIPT_W.failed = true; return null; }
  return SCRIPT_W.w;
}
const pyDir = () => new URL(PY_DIR, location.href).href;
/* a worker made ready before it is needed (the Scripts window opening; after a Stop), with Python loading in it
   if the script is Python and Python has been run on this page already (its files are then in the browser's cache) */
export function scriptWarm(lang) {
  if (!scriptWorkerOk() || SCRIPT_W.run) return;
  const w = scriptWorker();
  if (w && lang === 'py' && SCRIPT_W.py) w.postMessage({ t: 'warm', lang, py: pyDir() });
}
/* the script running in the worker stopped now: the worker ended (nothing it did reaches the bench), a fresh one readied */
export function stopScript() {
  const run = SCRIPT_W.run;
  if (!run) return false;
  SCRIPT_W.run = null;
  if (SCRIPT_W.w) SCRIPT_W.w.terminate();
  SCRIPT_W.w = null;
  track('mod', 'script.stop');
  run.resolve({ result: undefined, logs: run.logs, error: null, traceback: null, ms: performance.now() - run.t0, stopped: true, where: 'worker' });
  setTimeout(() => scriptWarm(run.lang), 0);
  return true;
}
export const scriptRunning = () => !!SCRIPT_W.run;

/* a script run in the worker over a copy of the bench, taken back as one change when it ends (or not at all, stopped) */
function runInWorker(code, lang, say, onLog) {
  const w = scriptWorker();
  if (!w) return null;
  return new Promise(resolve => {
    const id = ++SCRIPT_W.seq, run = { id, lang, logs: [], t0: performance.now(), resolve, start: snapshot() };
    SCRIPT_W.run = run;
    const end = R => { if (SCRIPT_W.run !== run) return; SCRIPT_W.run = null; resolve(R); };
    w.onmessage = e => {
      const m = e.data;
      if (!m || m.id !== id || SCRIPT_W.run !== run) return;
      SCRIPT_W.ok = true;
      if (m.t === 'say') { if (say) say(m.text); }
      else if (m.t === 'log') { run.logs.push(m.line); if (onLog) onLog(m.line); }
      else if (m.t === 'done') {
        if (lang === 'py' && !/^Python could not be loaded/.test(m.R.error || '')) SCRIPT_W.py = true;
        const R = Object.assign(m.R, { where: 'worker', saves: m.saves || [], pageOnly: m.pageOnly || (m.R.error && /\b(window|document)\b/.test(code) ? 'page' : '') });
        R.note = scriptTakeUp(m, run.start);
        end(R);
      }
    };
    w.onerror = e => {
      e.preventDefault();
      if (SCRIPT_W.w === w) { w.terminate(); SCRIPT_W.w = null; }
      if (!SCRIPT_W.ok) SCRIPT_W.failed = true;        // a worker that never started: scripts run on the page from now on
      end({ result: undefined, logs: run.logs, traceback: null, ms: performance.now() - run.t0, where: 'worker', pageOnly: 'worker',
        error: 'The script’s background worker stopped (' + ((e && e.message) || 'it failed to start') + ')' });
    };
    w.postMessage({ t: 'run', id, proj: JSON.stringify(serialize()), mods: modDelta(w), code: String(code), lang, py: pyDir() });
  });
}
/* the end of a run in the worker, on the page: its bench taken up (one change, Undo puts it back) if it changed it
   and this bench has not been changed meanwhile; then what it asked of the page (a tab shown, a part selected, sweeps paused) */
function scriptTakeUp(m, start) {
  const P = window.JEKray;
  if (m.bench && snapshot() !== start) return 'The bench was changed while the script ran, so what the script changed was not applied: run it again to apply it.';
  if (m.bench) adoptBench(JSON.parse(m.bench), m.whole);
  if (m.tab && !m.whole) P.showTab(m.tab);
  for (const [op, name, tab] of m.ops || []) { if (op === 'select') P.select(name, tab || undefined); else if (op === 'pause') P.sweepPause(); }
  P.trace(); hooks.renderPanel(); hooks.requestRender();
  return m.bench ? 'The script’s changes were applied to the bench as one step: Undo puts it back.' : '';
}

/* run a script's text: { result, logs, error, traceback, ms, where, stopped?, pageOnly?, note? }. It runs in the script
   worker, on a copy of the bench (Stop ends it: stopScript), with what it changed taken up when it ends; or on the page
   (o.page, or where there can be no worker), as typing it into the console would, the bench checkpointed first so Undo
   puts it back. o.onLog(line) is told each log() line as it comes. Python is fetched and started first, the first time
   (say(text) is told how that goes): not counted in ms */
export async function runScript(code, lang, say, o = {}) {
  const py = lang === 'py';
  if (SCRIPT_W.run) return { result: undefined, logs: [], traceback: null, ms: 0, error: 'A script is running already: wait for it, or stop it' };
  if (!o.page && scriptWorkerOk()) {
    const R = await runInWorker(code, py ? 'py' : 'js', say, o.onLog);
    if (R) { if (!R.stopped) track('mod', py ? 'script.python' : 'script.js'); return R; }
  }
  if (py) {
    try { await pyReady(say); } catch (err) { return { result: undefined, logs: [], traceback: null, ms: 0, where: 'page', error: pyLoadError(err) }; }
  }
  const t0 = performance.now(), saves = [];
  checkpoint();
  const R = await execScript(code, makeJ(window.JEKray, saves), py ? 'py' : 'js', say, o.onLog);
  window.JEKray.trace(); hooks.renderPanel(); hooks.requestRender();
  track('mod', py ? 'script.python' : 'script.js');
  return Object.assign(R, { ms: performance.now() - t0, where: 'page', saves });
}

/* the scripts kept in this browser, each with its language (one kept before there was a choice is JavaScript) */
function loadScripts() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter(s => s && typeof s.name === 'string' && typeof s.code === 'string').map(s => ({ name: s.name, code: s.code, lang: s.lang === 'py' ? 'py' : 'js' })) : [];
  } catch (err) { return []; }
}
function saveScripts(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (err) { /* not kept: fine */ } }
// the language a new script starts in: the last one chosen
const lastLang = () => { try { return localStorage.getItem(LANG_KEY) === 'py' ? 'py' : 'js'; } catch (err) { return 'js'; } };
const keepLang = lang => { try { localStorage.setItem(LANG_KEY, lang); } catch (err) { /* not kept: fine */ } };
const SCRIPT_HINT = {
  js: 'JavaScript. J is the bench: J.stats(\'Screen\'), J.set(\'Lens\', \'x\', 120), J.sweep(…). log() writes below; what you return is shown; save(name, data, \'csv\') keeps a file.',
  py: 'Python. J is the bench: J.stats(\'Screen\'), J.set(\'Lens\', \'x\', 120), J.sweep(…). log() and print() write below; set result to what to show (or end with it); save(name, data, \'csv\') keeps a file.',
};

export function wireScripts() {
  const btn = document.getElementById('btnScripts');
  if (!btn) return;
  let scripts = loadScripts(), cur = 0, dlg = null, ed, out, pick, langPick, runBtn, clock, gate;
  const current = () => scripts[cur] || null;
  const langOf = () => (current() ? current().lang : lastLang());
  const showList = () => {
    pick.replaceChildren(...scripts.map((s, i) => h('option', { value: String(i), selected: i === cur ? true : null }, s.name + (s.lang === 'py' ? ' (Python)' : ''))));
    pick.disabled = !scripts.length;
    ed.value = current() ? current().code : '';
    ed.disabled = !current();
    langPick.value = langOf(); langPick.disabled = !current();
    ed.placeholder = SCRIPT_HINT[langOf()];
  };
  const keep = () => { if (current()) { current().code = ed.value; saveScripts(scripts); } };
  const add = (name, code, lang) => { lang = lang === 'py' ? 'py' : 'js'; scripts.push({ name, code, lang }); cur = scripts.length - 1; keepLang(lang); saveScripts(scripts); showList(); };
  // a run's output: its log() lines as they come, what Python's loading is doing, and while it runs the time it has taken
  let logBox = null, status = null, timer = 0;
  const show = (R) => {
    out.replaceChildren();
    for (const l of R.logs) out.append(h('div', { class: 'rt-script-log' }, l));
    const secs = (R.ms / 1000).toFixed(R.ms < 10000 ? 1 : 0);
    if (R.stopped) { out.append(h('div', { class: 'rt-script-note', id: 'scriptStopped' }, 'Stopped after ' + secs + ' s: nothing it did was applied, so the bench is as it was.')); return; }
    if (R.error) out.append(R.traceback ? h('pre', { class: 'rt-script-err' }, R.traceback) : h('div', { class: 'rt-script-err' }, 'Error: ' + R.error));
    else if (isRows(R.result)) {
      const cols = [...new Set(R.result.flatMap(r => Object.keys(r)))];
      out.append(h('table', null, h('thead', null, h('tr', null, ...cols.map(c => h('th', null, c)))),
        h('tbody', null, ...R.result.map(r => h('tr', null, ...cols.map(c => h('td', null, cell(r[c]))))))));
      out.append(saveBar(R.result, R.result.length + ' row' + (R.result.length === 1 ? '' : 's')));
    } else if (R.result !== undefined) {
      out.append(h('pre', null, typeof R.result === 'string' ? R.result : JSON.stringify(R.result, null, 1)));
      if (dfItemsOf(R.result, 'result').some(it => it.kind !== 'value')) out.append(saveBar(R.result, ''));
    }
    // a script that needs the page (sweepPlay, the page's own window or document): run there instead, without Stop
    if (R.error && R.pageOnly && R.where === 'worker') out.append(h('div', { class: 'rt-script-bar' }, h('button', { type: 'button', class: 'rt-btn', id: 'scriptOnPage', onclick: () => run({ page: true }) }, 'Run on the page (no Stop)'),
      h('span', { class: 'rt-script-note' }, 'Runs it on this page as the console would: the page waits for it, and it cannot be stopped.')));
    const took = R.ms < 1000 ? Math.round(R.ms) + ' ms' : secs + ' s';
    out.append(h('div', { class: 'rt-script-note', id: 'scriptDone' }, (R.error ? 'Failed after ' : 'Done in ') + took + (R.where === 'page' ? ' (on the page)' : '') + '.' + (R.note ? ' ' + R.note : R.where === 'page' && R.error ? ' Undo puts the bench back if the script changed it.' : '')));
  };
  // what a run returned, saved as a file in the format picked (a table, an array, or several named ones)
  const saveBar = (result, note) => h('div', { class: 'rt-script-bar', id: 'scriptSaveAs' }, h('span', { class: 'rt-script-note' }, 'Save as'),
    ...SAVE_AS.map(([k, label, title]) => h('button', { type: 'button', class: 'rt-btn quiet', 'data-fmt': k, title, onclick: () => saveScriptFiles([{ name: current() ? current().name : 'script', data: result, format: k, meta: null }], current() ? current().name : 'script') }, label)),
    note ? h('span', { class: 'rt-script-note' }, note) : null);
  // Run becomes Stop while a script runs, with the time it has run beside it
  const busy = on => {
    runBtn.textContent = on ? 'Stop' : 'Run';
    runBtn.classList.toggle('danger', on);
    runBtn.title = on ? 'Stop the script (its changes are not applied)' : 'Ctrl+Enter';
    clearInterval(timer);
    clock.textContent = '';
    if (on) { const t0 = performance.now(); const tick = () => { clock.textContent = 'Running… ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s'; }; tick(); timer = setInterval(tick, 100); }
  };
  const run = async (o = {}) => {
    const why = scriptsWhy();
    if (why) { toast(why, true); hooks.proFix(); return; }
    if (scriptRunning()) return;
    keep();
    out.replaceChildren(logBox = h('div', { id: 'scriptLogs' }), status = h('div', { class: 'rt-script-note', id: 'scriptLoading' }));
    // Python's first run fetches it: what that is doing, below the lines logged so far
    let seen = false;
    const into = () => { if (!seen) { seen = true; out.scrollIntoView({ block: 'nearest' }); } };     // on a phone the output is below the fold
    const say = text => { status.textContent = text; into(); };
    const onLog = line => { logBox.append(h('div', { class: 'rt-script-log' }, line)); into(); if (out.scrollHeight - out.scrollTop - out.clientHeight < 60) out.scrollTop = out.scrollHeight; };
    const onPage = o.page || !scriptWorkerOk();
    if (onPage) runBtn.disabled = true; else busy(true);
    try {
      const R = await runScript(ed.value, langOf(), say, { page: o.page, onLog });
      show(R);
      // what it asked save() for, made into files now it has ended (a stopped run saves nothing)
      if (!R.stopped && R.saves && R.saves.length) {
        const names = await saveScriptFiles(R.saves, current() ? current().name : 'script');
        if (names.length) out.append(h('div', { class: 'rt-script-note', id: 'scriptSaved' }, 'Saved ' + names.join(', ') + '.'));
      }
    } finally { runBtn.disabled = false; busy(false); }
  };
  const build = () => {
    dlg = h('dialog', { class: 'rt-dialog rt-wide rt-scripts', id: 'scriptDialog', 'aria-labelledby': 'scriptTitle' });
    pick = h('select', { 'aria-label': 'Which script', onchange: () => { keep(); cur = Number(pick.value); showList(); } });
    langPick = h('select', { id: 'scriptLang', 'aria-label': 'The script’s language', onchange: () => { if (!current()) return; current().lang = langPick.value; keepLang(langPick.value); saveScripts(scripts); showList(); } },
      ...SCRIPT_LANGS.map(([k, label]) => h('option', { value: k }, label)));
    const exPick = h('select', { 'aria-label': 'Start from an example', onchange: () => { const i = Number(exPick.value); if (i >= 0) { const [n, c, l] = EXAMPLE_SCRIPTS[i]; add(n, c, l); } exPick.value = '-1'; } },
      h('option', { value: '-1' }, 'Start from an example…'),
      ...SCRIPT_LANGS.map(([k, label]) => h('optgroup', { label }, ...EXAMPLE_SCRIPTS.map((e, i) => (e[2] === k ? h('option', { value: String(i) }, e[0]) : null)).filter(Boolean))));
    ed = h('textarea', { id: 'scriptCode', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', wrap: 'off', placeholder: SCRIPT_HINT.js });
    ed.addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); const s = ed.selectionStart, t = ed.selectionEnd; ed.setRangeText(langOf() === 'py' ? '    ' : '  ', s, t, 'end'); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    });
    ed.addEventListener('input', keep);
    out = h('div', { id: 'scriptOut', class: 'rt-script-out', 'aria-live': 'polite' });
    runBtn = h('button', { type: 'button', class: 'rt-btn primary', id: 'scriptRun', title: 'Ctrl+Enter', onclick: () => (scriptRunning() ? stopScript() : run()) }, 'Run');
    clock = h('span', { class: 'rt-script-note', id: 'scriptTimer', 'aria-live': 'off' });
    const fi = h('input', { type: 'file', accept: '.js,.mjs,.py,text/javascript,text/x-python', hidden: true });
    fi.addEventListener('change', async () => { const f = fi.files[0]; fi.value = ''; if (f) add(f.name.replace(/\.(m?js|py)$/i, ''), await f.text(), /\.py$/i.test(f.name) ? 'py' : 'js'); });
    gate = h('p', { class: 'rt-exppro', hidden: true });
    dlg.append(h('h2', { id: 'scriptTitle' }, 'Scripts'),
      h('p', null, 'JavaScript or Python run against this bench: read a screen or a detector, move a part and read again, sweep a parameter to a table, or check a figure. The same calls as the ',
        h('a', { class: 'rt-link', href: '/jek/docs/jekray/scripting/', target: '_blank', rel: 'noopener' }, 'scripting documentation'), ' lists. Python is fetched the first time a Python script runs (' + (PY_BYTES / 1e6).toFixed(1) + ' MB, once; NumPy ' + (NUMPY_BYTES / 1e6).toFixed(1) + ' MB more, if a script imports it). A script runs in the background on a copy of the bench: Stop ends it at once, and what it changed is applied when it ends, as one step Undo puts back. Scripts are kept in this browser.'),
      gate,
      h('div', { class: 'rt-script-bar' }, pick, langPick,
        h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => { const n = prompt('A name for the script', 'Script ' + (scripts.length + 1)); if (n) add(n.trim().slice(0, 60) || 'Script', '', lastLang()); } }, 'New'),
        h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => { if (!current()) return; const n = prompt('Rename the script', current().name); if (n) { current().name = n.trim().slice(0, 60) || current().name; saveScripts(scripts); showList(); } } }, 'Rename'),
        h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => { if (!current() || !confirm('Delete “' + current().name + '”?')) return; scripts.splice(cur, 1); cur = Math.max(0, cur - 1); saveScripts(scripts); showList(); } }, 'Delete'),
        exPick),
      ed,
      h('div', { class: 'rt-script-bar' }, runBtn, clock,
        h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => { keep(); const s = current(); if (s) downloadFile(s.name.replace(/[^\w.-]+/g, '-') + (s.lang === 'py' ? '.py' : '.js'), new Blob([s.code], { type: s.lang === 'py' ? 'text/x-python' : 'text/javascript' })); } }, 'Save as a file'),
        h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => fi.click() }, 'Open a file…'),
        h('span', { style: 'flex:1' }),
        h('button', { type: 'button', class: 'rt-btn', onclick: () => { keep(); dlg.close(); } }, 'Close')),
      out, fi);
    document.body.append(dlg);
  };
  btn.addEventListener('click', () => {
    if (!dlg) build();
    scripts = loadScripts(); if (cur >= scripts.length) cur = 0;
    if (!scripts.length) { scripts = [{ name: EXAMPLE_SCRIPTS[0][0], code: EXAMPLE_SCRIPTS[0][1], lang: 'js' }]; cur = 0; saveScripts(scripts); }
    showList();
    const why = scriptsWhy();
    gate.hidden = !why;
    if (why) gate.replaceChildren(h('b', null, 'Part of JEKrayPro. '), /^Sign in/.test(why) ? 'Sign in, top right, with an account that has a plan. ' : 'Scripts need a plan: your own JEKrayPro, or a team with one. ',
      h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => hooks.proFix() }, /^Sign in/.test(why) ? 'Sign in' : 'Get JEKrayPro'));
    if (!scriptRunning()) { runBtn.disabled = !!why; out.replaceChildren(); }
    if (!why) scriptWarm(langOf());
    dlg.showModal();
    ed.focus();
  });
}
