import { TEST_MODE } from '../core/constants.js';
import { hooks } from '../core/hooks.js';
import { project } from '../state/project.js';
import { h } from './panel.js';
import { downloadFile, toast } from './actions.js';
import { checkpoint } from './tabs.js';
import { accountsOn } from '../io/account.js';

/* ---------- Scripts: JavaScript run against the bench, on the page (JEKrayPro) ----------
   File › Scripts… opens an editor beside the bench. A script is JavaScript given J, the same
   calls the documentation lists for scripting (a screen's spot, a detector's reading, an
   antenna's gain, a part moved and read again, a sweep to a table), and log(). What it returns
   is shown: a table when it is rows, with the rows saved as CSV, else as JSON. A script runs on
   this page, on your own bench, as typing it into the browser's console would; it is kept in
   this browser by name, or saved as a .js file. The bench is checkpointed before each run, so
   Undo puts back whatever a script changed. */

const KEY = 'jek-raytracer-scripts';
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
return S;`],
  ['Sweep a part to a table', `// Move the first lens along x and read the spot at each place.
// The result is a table; Save as CSV keeps it for a plot.
const lens = J.elements().find(e => e.type === 'lens'), screen = J.elements().find(e => e.type === 'screen');
if (!lens || !screen) throw new Error('This needs a lens and a screen.');
const x0 = J.get(lens.name, 'x');
return J.sweep(lens.name, 'x', J.range(x0 - 20, x0 + 20, 21), () => { const S = J.stats(screen.name); return { rms: S.rms, powerPct: S.powerPct }; });`],
  ['Check a figure', `// A check that fails loudly when a figure drifts: here a detector's reading.
const pd = J.elements().find(e => e.type === 'detector');
if (!pd) throw new Error('This needs a photodetector.');
const R = J.detector(pd.name);
if (R.mw < 0.1) throw new Error('only ' + R.mw.toFixed(4) + ' mW reaches ' + pd.name);
log('ok:', R.mw.toFixed(4), 'mW');
return R;`],
  ['Every part', `// Every part on this bench, with its type and place.
return J.elements();`],
];

// why scripts are not available now ('' when they are): they are JEKrayPro's; the tests and a build without accounts are not gated
export const scriptsWhy = () => (TEST_MODE || !accountsOn() ? '' : hooks.proWhy() || '');

/* what a script is given */
function makeJ() {
  const P = window.JEKray, J = {};
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

/* run a script's text: { result, logs, error, ms }; the bench is checkpointed first so Undo puts it back */
export async function runScript(code) {
  const logs = [], t0 = performance.now();
  const log = (...a) => { logs.push(a.map(cell).join(' ')); };
  let result, error = null;
  checkpoint();
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction('J', 'log', '"use strict";\n' + String(code));
    result = await fn(makeJ(), log);
  } catch (err) {
    error = (err && err.message) || String(err);
  }
  window.JEKray.trace(); hooks.renderPanel(); hooks.requestRender();
  return { result, logs, error, ms: performance.now() - t0 };
}

/* the scripts kept in this browser */
function loadScripts() { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(s => s && typeof s.name === 'string' && typeof s.code === 'string') : []; } catch (err) { return []; } }
function saveScripts(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (err) { /* not kept: fine */ } }

export function wireScripts() {
  const btn = document.getElementById('btnScripts');
  if (!btn) return;
  let scripts = loadScripts(), cur = 0, dlg = null, ed, out, pick, runBtn, gate;
  const current = () => scripts[cur] || null;
  const showList = () => {
    pick.replaceChildren(...scripts.map((s, i) => h('option', { value: String(i), selected: i === cur ? true : null }, s.name)));
    pick.disabled = !scripts.length;
    ed.value = current() ? current().code : '';
    ed.disabled = !current();
  };
  const keep = () => { if (current()) { current().code = ed.value; saveScripts(scripts); } };
  const add = (name, code) => { scripts.push({ name, code }); cur = scripts.length - 1; saveScripts(scripts); showList(); };
  const show = (R) => {
    out.replaceChildren();
    for (const l of R.logs) out.append(h('div', { class: 'rt-script-log' }, l));
    if (R.error) out.append(h('div', { class: 'rt-script-err' }, 'Error: ' + R.error));
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
    try { show(await runScript(ed.value)); } finally { runBtn.disabled = false; }
  };
  const build = () => {
    dlg = h('dialog', { class: 'rt-dialog rt-wide rt-scripts', id: 'scriptDialog', 'aria-labelledby': 'scriptTitle' });
    pick = h('select', { 'aria-label': 'Which script', onchange: () => { keep(); cur = Number(pick.value); showList(); } });
    const exPick = h('select', { 'aria-label': 'Start from an example', onchange: () => { const i = Number(exPick.value); if (i >= 0) { add(EXAMPLE_SCRIPTS[i][0], EXAMPLE_SCRIPTS[i][1]); } exPick.value = '-1'; } },
      h('option', { value: '-1' }, 'Start from an example…'), ...EXAMPLE_SCRIPTS.map((e, i) => h('option', { value: String(i) }, e[0])));
    ed = h('textarea', { id: 'scriptCode', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', wrap: 'off', placeholder: 'JavaScript. J is the bench: J.stats(\'Screen\'), J.set(\'Lens\', \'x\', 120), J.sweep(…). log() writes below; what you return is shown.' });
    ed.addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); const s = ed.selectionStart, t = ed.selectionEnd; ed.setRangeText('  ', s, t, 'end'); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    });
    ed.addEventListener('input', keep);
    out = h('div', { id: 'scriptOut', class: 'rt-script-out', 'aria-live': 'polite' });
    runBtn = h('button', { type: 'button', class: 'rt-btn primary', id: 'scriptRun', title: 'Ctrl+Enter', onclick: run }, 'Run');
    const fi = h('input', { type: 'file', accept: '.js,.mjs,text/javascript', hidden: true });
    fi.addEventListener('change', async () => { const f = fi.files[0]; fi.value = ''; if (f) add(f.name.replace(/\.m?js$/i, ''), await f.text()); });
    gate = h('p', { class: 'rt-exppro', hidden: true });
    dlg.append(h('h2', { id: 'scriptTitle' }, 'Scripts'),
      h('p', null, 'JavaScript run against this bench: read a screen or a detector, move a part and read again, sweep a parameter to a table, or check a figure. The same calls as the ',
        h('a', { class: 'rt-link', href: '/jek/docs/jekray/scripting/', target: '_blank', rel: 'noopener' }, 'scripting documentation'), ' lists. Scripts are kept in this browser; Undo puts the bench back after a run.'),
      gate,
      h('div', { class: 'rt-script-bar' }, pick,
        h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => { const n = prompt('A name for the script', 'Script ' + (scripts.length + 1)); if (n) add(n.trim().slice(0, 60) || 'Script', ''); } }, 'New'),
        h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => { if (!current()) return; const n = prompt('Rename the script', current().name); if (n) { current().name = n.trim().slice(0, 60) || current().name; saveScripts(scripts); showList(); } } }, 'Rename'),
        h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => { if (!current() || !confirm('Delete “' + current().name + '”?')) return; scripts.splice(cur, 1); cur = Math.max(0, cur - 1); saveScripts(scripts); showList(); } }, 'Delete'),
        exPick),
      ed,
      h('div', { class: 'rt-script-bar' }, runBtn,
        h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => { keep(); if (current()) downloadFile(current().name.replace(/[^\w.-]+/g, '-') + '.js', new Blob([current().code], { type: 'text/javascript' })); } }, 'Save as a file'),
        h('button', { type: 'button', class: 'rt-btn quiet', onclick: () => fi.click() }, 'Open a file…'),
        h('span', { style: 'flex:1' }),
        h('button', { type: 'button', class: 'rt-btn', onclick: () => { keep(); dlg.close(); } }, 'Close')),
      out, fi);
    document.body.append(dlg);
  };
  btn.addEventListener('click', () => {
    if (!dlg) build();
    scripts = loadScripts(); if (cur >= scripts.length) cur = 0;
    if (!scripts.length) { scripts = [{ name: EXAMPLE_SCRIPTS[0][0], code: EXAMPLE_SCRIPTS[0][1] }]; cur = 0; saveScripts(scripts); }
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
