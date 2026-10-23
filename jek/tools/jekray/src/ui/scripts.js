import { TEST_MODE } from '../core/constants.js';
import { hooks } from '../core/hooks.js';
import { project } from '../state/project.js';
import { h } from './panel.js';
import { downloadFile, toast } from './actions.js';
import { checkpoint } from './tabs.js';
import { accountsOn } from '../io/account.js';
import { track } from '../io/usage.js';
import { NUMPY_BYTES, PY_BYTES, pyReady, pyRun } from './python.js';

/* ---------- Scripts: JavaScript or Python run against the bench, on the page (JEKrayPro) ----------
   File › Scripts… opens an editor beside the bench. A script is JavaScript or Python given J, the same
   calls the documentation lists for scripting (a screen's spot, a detector's reading, an
   antenna's gain, a part moved and read again, a sweep to a table), and log(). What it returns
   (in Python: what it sets result to, or its last line's value) is shown: a table when it is rows,
   with the rows saved as CSV, else as JSON. A script runs on this page, on your own bench, as typing
   it into the browser's console would; it is kept in this browser by name with its language, or saved
   as a .js or .py file. Python is Pyodide (ui/python.js), fetched the first time a Python script runs.
   The bench is checkpointed before each run, so Undo puts back whatever a script changed. */

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
// The result is a table; Save as CSV keeps it for a plot.
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
# The result is a table; Save as CSV keeps it for a plot.
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

/* what a script is given: P is the page's window.JEKray (or, in the tests, the same calls made in Node) */
export function makeJ(P = window.JEKray) {
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
  return J;
}
const isRows = v => Array.isArray(v) && v.length > 0 && v.every(r => r && typeof r === 'object' && !Array.isArray(r));
const cell = v => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : Number(v.toPrecision(6)).toString()) : v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
function toCsv(rows) {
  if (!isRows(rows)) return '';
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const esc = s => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(cell(r[c]))).join(','))].join('\n') + '\n';
}

/* a script's text run against J, in its language ('js' or 'py'): { result, logs, error, traceback } */
export async function execScript(code, J, lang, say) {
  if (lang === 'py') {
    try {
      const R = await pyRun(code, J, say);
      return { result: R.result === null ? undefined : R.result, logs: R.logs, error: R.error, traceback: R.traceback };
    } catch (err) { return { result: undefined, logs: [], error: (err && err.message) || String(err), traceback: null }; }
  }
  const logs = [], log = (...a) => { logs.push(a.map(cell).join(' ')); };
  let result, error = null;
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction('J', 'log', '"use strict";\n' + String(code));
    result = await fn(J, log);
  } catch (err) {
    error = (err && err.message) || String(err);
  }
  return { result, logs, error, traceback: null };
}

/* run a script's text: { result, logs, error, traceback, ms }; the bench is checkpointed first so Undo puts it back.
   Python is fetched and started first, the first time (say(text) is told how that goes): not counted in ms */
export async function runScript(code, lang, say) {
  const py = lang === 'py';
  if (py) {
    try { await pyReady(say); } catch (err) {
      const net = /fetch|network|HTTP|import/i.test(err.message) || (typeof navigator !== 'undefined' && navigator.onLine === false);
      return { result: undefined, logs: [], traceback: null, ms: 0, error: 'Python could not be loaded (' + ((err && err.message) || err) + '). ' + (net ? 'It is fetched the first time a Python script runs: try again when online.' : 'This browser may be too old to run it: try a current Chrome, Edge, Firefox or Safari.') };
    }
  }
  const t0 = performance.now();
  checkpoint();
  const R = await execScript(code, makeJ(), py ? 'py' : 'js', say);
  window.JEKray.trace(); hooks.renderPanel(); hooks.requestRender();
  track('mod', py ? 'script.python' : 'script.js');
  return Object.assign(R, { ms: performance.now() - t0 });
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
  js: 'JavaScript. J is the bench: J.stats(\'Screen\'), J.set(\'Lens\', \'x\', 120), J.sweep(…). log() writes below; what you return is shown.',
  py: 'Python. J is the bench: J.stats(\'Screen\'), J.set(\'Lens\', \'x\', 120), J.sweep(…). log() and print() write below; set result to what to show (or end with it).',
};

export function wireScripts() {
  const btn = document.getElementById('btnScripts');
  if (!btn) return;
  let scripts = loadScripts(), cur = 0, dlg = null, ed, out, pick, langPick, runBtn, gate;
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
  const show = (R) => {
    out.replaceChildren();
    for (const l of R.logs) out.append(h('div', { class: 'rt-script-log' }, l));
    if (R.error) out.append(R.traceback ? h('pre', { class: 'rt-script-err' }, R.traceback) : h('div', { class: 'rt-script-err' }, 'Error: ' + R.error));
    else if (isRows(R.result)) {
      const cols = [...new Set(R.result.flatMap(r => Object.keys(r)))];
      out.append(h('table', null, h('thead', null, h('tr', null, ...cols.map(c => h('th', null, c)))),
        h('tbody', null, ...R.result.map(r => h('tr', null, ...cols.map(c => h('td', null, cell(r[c]))))))));
      out.append(h('div', { class: 'rt-script-bar' }, h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => downloadFile((current() ? current().name : 'script') + '.csv', new Blob([toCsv(R.result)], { type: 'text/csv' })) }, 'Save as CSV'),
        h('span', { class: 'rt-script-note' }, R.result.length + ' row' + (R.result.length === 1 ? '' : 's'))));
    } else if (R.result !== undefined) out.append(h('pre', null, typeof R.result === 'string' ? R.result : JSON.stringify(R.result, null, 1)));
    out.append(h('div', { class: 'rt-script-note' }, (R.error ? 'Stopped' : 'Done') + ' in ' + Math.round(R.ms) + ' ms' + (R.error ? '; Undo puts the bench back if the script changed it' : '')));
  };
  const run = async () => {
    const why = scriptsWhy();
    if (why) { toast(why, true); hooks.proFix(); return; }
    keep();
    runBtn.disabled = true;
    // Python's first run fetches it: what that is doing, in the output, until the run's own
    const say = text => out.replaceChildren(h('div', { class: 'rt-script-note', id: 'scriptLoading' }, text));
    try { show(await runScript(ed.value, langOf(), say)); } finally { runBtn.disabled = false; }
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
    runBtn = h('button', { type: 'button', class: 'rt-btn primary', id: 'scriptRun', title: 'Ctrl+Enter', onclick: run }, 'Run');
    const fi = h('input', { type: 'file', accept: '.js,.mjs,.py,text/javascript,text/x-python', hidden: true });
    fi.addEventListener('change', async () => { const f = fi.files[0]; fi.value = ''; if (f) add(f.name.replace(/\.(m?js|py)$/i, ''), await f.text(), /\.py$/i.test(f.name) ? 'py' : 'js'); });
    gate = h('p', { class: 'rt-exppro', hidden: true });
    dlg.append(h('h2', { id: 'scriptTitle' }, 'Scripts'),
      h('p', null, 'JavaScript or Python run against this bench: read a screen or a detector, move a part and read again, sweep a parameter to a table, or check a figure. The same calls as the ',
        h('a', { class: 'rt-link', href: '/jek/docs/jekray/scripting/', target: '_blank', rel: 'noopener' }, 'scripting documentation'), ' lists. Python is fetched the first time a Python script runs (' + (PY_BYTES / 1e6).toFixed(1) + ' MB, once; NumPy ' + (NUMPY_BYTES / 1e6).toFixed(1) + ' MB more, if a script imports it). Scripts are kept in this browser; Undo puts the bench back after a run.'),
      gate,
      h('div', { class: 'rt-script-bar' }, pick, langPick,
        h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => { const n = prompt('A name for the script', 'Script ' + (scripts.length + 1)); if (n) add(n.trim().slice(0, 60) || 'Script', '', lastLang()); } }, 'New'),
        h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => { if (!current()) return; const n = prompt('Rename the script', current().name); if (n) { current().name = n.trim().slice(0, 60) || current().name; saveScripts(scripts); showList(); } } }, 'Rename'),
        h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => { if (!current() || !confirm('Delete “' + current().name + '”?')) return; scripts.splice(cur, 1); cur = Math.max(0, cur - 1); saveScripts(scripts); showList(); } }, 'Delete'),
        exPick),
      ed,
      h('div', { class: 'rt-script-bar' }, runBtn,
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
    runBtn.disabled = !!why;
    out.replaceChildren();
    dlg.showModal();
    ed.focus();
  });
}
