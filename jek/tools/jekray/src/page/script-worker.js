import { project } from '../state/project.js';
import { loadProject, serialize } from '../state/elements.js';
import { curBench } from '../state/tabs.js';
import { setLastTraceKey, traceScene } from '../engines/trace.js';
import { modAbsorb } from '../engines/mods.js';
import { scriptCalls } from '../ui/script-calls.js';
import { execScript, makeJ, pyLoadError } from '../ui/scripts.js';
import { pyReady } from '../ui/python.js';
import { snapshot } from '../ui/tabs.js';

/* ==========================================================================
   The script worker: File › Scripts runs a script here, in the background, so a long loop never holds
   up the page and Stop can end it (by ending the worker) at any moment, in JavaScript or in Python.
   It is this same app (the page's own script, or on the dev page its modules), started by
   ui/scripts.js runScript and sent the bench as saved, the script and its language. The bench is
   loaded into the worker's own copy and traced, as headless.mjs does it in Node; J is made over the
   same calls window.JEKray gives (ui/script-calls.js), so the answers are the page's. log() lines are
   sent as they are written. When the script ends, the bench is sent back if the script changed it
   (J.set, J.load), for the page to take up as one change, with what save() was asked for (the page makes the files); the calls that are the page's own (select,
   showTab, sweepPause) are kept and done there then; sweepPlay, which plays a sweep on the bench in
   view, is refused, and the page offers to run the script there instead (no Stop).
   One worker is kept between runs (Python stays loaded in it); Stop ends it, and a fresh one starts.
   ========================================================================== */

/* what a run gives the page, made fit to post: functions and symbols left out (as JSON leaves them),
   numbers as they are (NaN and the infinities too), a loop of references cut */
export function scriptPlain(v, seen = new Set()) {
  if (v === null || typeof v !== 'object') return typeof v === 'function' || typeof v === 'symbol' ? undefined : typeof v === 'bigint' ? String(v) : v;
  if (ArrayBuffer.isView(v) || v instanceof Date || v instanceof RegExp) return v;
  if (seen.has(v)) return '[circular]';
  seen.add(v);
  let out;
  if (typeof v.toJSON === 'function') out = scriptPlain(v.toJSON(), seen);
  else if (Array.isArray(v)) out = v.map(x => { const y = scriptPlain(x, seen); return y === undefined ? null : y; });
  else { out = {}; for (const k of Object.keys(v)) { const y = scriptPlain(v[k], seen); if (y !== undefined) out[k] = y; } }
  seen.delete(v);
  return out;
}

/* the calls window.JEKray has that are the page's own, as the worker makes them: done on its copy where
   that is all they are (load, showTab), kept for the page to do when the script ends (select, sweepPause),
   or refused (sweepPlay). ops and st are the run's: what the page is to do, and whether it loaded a bench */
function workerCalls(ops, st) {
  const pageOnly = (name, what) => { st.pageOnly = name; return new Error(name + ' runs on the page: ' + what + ', which a script running in the background cannot. Run on the page (no Stop) to use it'); };
  return {
    load(data) { loadProject(JSON.parse(JSON.stringify(data))); setLastTraceKey(null); traceScene(); st.loaded = true; ops.length = 0; },
    select(name, tab) { if (!this.byName(name)) return false; ops.push(['select', name, tab || null]); traceScene(); return true; },
    showTab(name) { const b = project.benches.find(b2 => b2.name === name || b2.id === name); if (b) { project.tab = b.id; project.view = curBench().view; } return project.tab; },
    sweepPause() { ops.push(['pause']); },
    sweepPlay() { throw pageOnly('sweepPlay', 'it plays a sweep on the bench you see (for a table, use J.sweep)'); },
  };
}

/* the worker's side: one run at a time, { t: 'run', id, proj, mods, code, lang, py } in, and back
   { t: 'say' } (Python's loading), { t: 'log' } (each line as it comes) and once { t: 'done' } */
export function scriptWorkerMain() {
  self.onmessage = async e => {
    const m = e.data, post = o => self.postMessage(Object.assign({ id: m.id }, o));
    if (m.t === 'warm') { if (m.lang === 'py') pyReady(() => {}, m.py).catch(() => {}); return; }
    if (m.t !== 'run') return;
    let R, out = {};
    const saves = [];
    try {
      if (m.mods) modAbsorb(m.mods);                       // the mods' results the page has (their code never runs here)
      loadProject(JSON.parse(m.proj)); setLastTraceKey(null); traceScene();
      const key0 = snapshot(), tab0 = project.tab, ops = [], st = { loaded: false, pageOnly: '' };
      const P = Object.assign(scriptCalls(), workerCalls(ops, st));
      const say = text => post({ t: 'say', text });
      if (m.lang === 'py') {
        say('Starting Python…');                     // (still loading after a Stop's warm-up: its own progress is not this run's)
        try { await pyReady(say, m.py); } catch (err) { post({ t: 'done', R: { result: undefined, logs: [], traceback: null, ms: 0, error: pyLoadError(err) } }); return; }
      }
      const t0 = performance.now();
      R = await execScript(m.code, makeJ(P, saves), m.lang === 'py' ? 'py' : 'js', say, line => post({ t: 'log', line }));
      R.ms = performance.now() - t0;
      const moved = st.loaded || snapshot() !== key0;
      out = { bench: moved ? JSON.stringify(serialize()) : null, whole: st.loaded, tab: project.tab !== tab0 ? project.tab : null, ops, pageOnly: st.pageOnly };
    } catch (err) {
      R = { result: undefined, logs: R ? R.logs : [], traceback: null, ms: 0, error: (err && err.message) || String(err) };
    }
    let res = R.result, kept = saves;
    try { res = structuredClone(res); } catch (err) { res = scriptPlain(res); }
    try { kept = structuredClone(saves); } catch (err) { kept = scriptPlain(saves); }
    // (what save() was asked for goes with it: the page makes the files, now the run has ended)
    post(Object.assign({ t: 'done', R: { result: res, logs: R.logs, error: R.error, traceback: R.traceback, ms: R.ms }, saves: kept }, out));
  };
}
