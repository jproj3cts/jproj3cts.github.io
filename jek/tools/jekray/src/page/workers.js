import { APP_SRC, DEV_WORKER, TEST_MODE } from '../core/constants.js';
import { project } from '../state/project.js';
import { VSRC, getEl, serialize } from '../state/elements.js';
import {
  TW_FREE, afterTrace, lastTrace, lastTraceKey, lastTraceMs, setLastTrace, setLastTraceKey,
  setLastTraceMs, setTraceCount, traceCount, traceKeyNow, traceScene
} from '../engines/trace.js';
import { requestRender } from '../ui/render.js';
import { drag } from '../ui/pointer.js';
import { playing, showActivityNow } from '../ui/sweeps.js';
import { modDelta } from '../engines/mods.js';
import { syncPanel } from '../ui/panel.js';
import { popLeg } from '../engines/field.js';
import { cavAtOf, cavSolved } from '../engines/cavity.js';
import { popLeg2 } from '../engines/field2d.js';
import { diffCache } from '../engines/diffraction.js';
import { statsCache } from '../engines/pd-cavity.js';
import { binCache } from '../engines/screen-stats.js';
import { workerShim } from '../worker/shim.js';

/* ==========================================================================
   The field worker
   The diffracted field (the bench's, each screen's, a cavity's steady state, the close-up
   and a sweep's frames rendered ahead) is worked out in a background thread, so the page
   never waits on it. The worker is this same script, run with a few stand-ins for the
   page it does not have: it is sent the bench as saved, traces it exactly as the page does,
   runs the job and sends back plain data (fields, figures, images), which the page takes
   up under the same keys it would have computed them by. One job runs at a time; a newer
   request for the same thing replaces one still waiting, and one already running is
   abandoned (the worker started afresh) once the bench has moved on. Where workers are not
   available, or one fails, everything runs on the page as before, a slice at a time.
   ========================================================================== */

/* a worker running this app: the page's own script with the shim in front, or on the dev page
   the modules as a module worker; null where there can be none. A script worker (script: true,
   Tools › Scripts, page/script-worker.js) is a module worker on the built page too, as Pyodide
   needs one, and is told what it is before the script runs (JEKRAY_SCRIPT_WORKER, or ?script) */
export const WORKERS_OK = !!(APP_SRC || DEV_WORKER) && typeof Worker !== 'undefined';
export function newAppWorker(script) {
  if (!APP_SRC) return new Worker(DEV_WORKER + (script ? '?script' : ''), { type: 'module' });
  const url = URL.createObjectURL(new Blob(['(' + workerShim + ')();\n', script ? 'self.JEKRAY_SCRIPT_WORKER = true;\n' : '', APP_SRC], { type: 'text/javascript' }));
  const w = script ? new Worker(url, { type: 'module' }) : new Worker(url);
  URL.revokeObjectURL(url);
  return w;
}

export const FW = { w: null, failed: false, seq: 0, queue: [], busy: null, sent: null };
export function fieldWorker() {
  if (FW.w) return FW.w;
  if (FW.failed || TEST_MODE || !WORKERS_OK || typeof OffscreenCanvas === 'undefined') return null;
  try {
    const w = newAppWorker();
    w.onmessage = fwReply;
    w.onerror = e => { e.preventDefault(); fwFail(e.message || 'the field worker stopped'); };
    FW.w = w;
  } catch (err) { FW.failed = true; return null; }
  return FW.w;
}
/* the bench as the worker needs it: what is saved, less the view and the time */
export function fwProject() { const d = serialize(); delete d.mods; d.saved = ''; d.view = null; d.tab = null; d.benches = d.benches.map(b => ({ id: b.id, name: b.name })); return JSON.stringify(d); }
/* Asks the worker for a job; resolves with its answer, or null if it was replaced or
   abandoned, and rejects if the worker failed (the caller then does it on the page) */
export function fwRequest(kind, slot, args) {
  return new Promise((resolve, reject) => {
    const job = { kind, slot, args: args || {}, proj: fwProject(), trace: lastTrace, resolve, reject };
    const k = FW.queue.findIndex(j => j.slot === slot);
    if (k >= 0) { FW.queue[k].resolve(null); FW.queue.splice(k, 1); }
    FW.queue.push(job);
    // mid-drag each step replaces the last: the worker gets the one where the drag ends
    if (midDrag()) return;
    if (FW.busy && FW.busy.slot === slot && performance.now() - FW.busy.t0 > 250) fwRestart();
    fwPump();
  });
}
export const midDrag = () => !!(typeof drag !== 'undefined' && drag && drag.started && /^(move|rotate|grip|bend)$/.test(drag.mode));
export function fwPump() {
  if (FW.busy || !FW.queue.length || midDrag() || !fieldWorker()) return;
  const job = FW.queue.shift();
  FW.busy = job; job.t0 = performance.now(); job.id = ++FW.seq;
  const msg = { id: job.id, kind: job.kind, args: job.args, mods: modDelta(FW.w) };
  if (job.proj !== FW.sent) { msg.proj = job.proj; FW.sent = job.proj; }
  FW.w.postMessage(msg);
}
function fwReply(e) {
  const m = e.data, job = FW.busy;
  if (!job || job.id !== m.id) return;
  FW.busy = null;
  if (!m.ok) { console.warn('JEKray field worker:', m.err); job.reject(new Error(m.err)); fwFail(m.err); return; }
  if (m.cav && m.cav.length) fwCavities(m.cav, job.trace);
  job.resolve(m.out);
  fwPump();
}
/* The worker traced a different bench from the page's: it happens in passing (a change
   between asking and answering) and the answer is simply dropped; if it keeps happening,
   something is wrong, and the page takes the work back */
export function fwMismatch(same) {
  FW.mismatch = same ? 0 : (FW.mismatch || 0) + 1;
  if (FW.mismatch > 4) { console.warn('JEKray field worker: its trace keeps differing from the page\u2019s; working on the page instead'); fwFail('trace mismatch'); }
}
/* the running job is out of date: drop it and start a fresh worker for what is waiting */
function fwRestart() {
  const job = FW.busy;
  FW.busy = null;
  if (FW.w) FW.w.terminate();
  FW.w = null; FW.sent = null;
  if (job) job.resolve(null);
}
/* the worker cannot be relied on: every job waiting is handed back, to be done on the page */
function fwFail(msg) {
  FW.failed = true;
  if (FW.w) FW.w.terminate();
  FW.w = null;
  const all = [FW.busy, ...FW.queue].filter(Boolean);
  FW.busy = null; FW.queue = [];
  for (const j of all) j.reject(new Error(msg));
}

export function fwUnpackRun(R, beams) {
  for (const sg of R.segs) {
    sg.b = beams[sg.i]; sg.src = getEl(sg.src);
    sg.leg = sg.eng === '2d' ? popLeg2(sg.F0) : popLeg(sg.F0);
  }
  return R;
}
function fwCavities(list, trace) {
  if (trace !== lastTrace) return;
  const fix = r => { if (r) r.at = cavAtOf(r.H, r.m, r.beta); return r; };
  for (const c of list) cavSolved.set(c.k, { eng: c.eng, delta: c.delta, mode: c.mode, trace, res: fix(c.res), others: c.others.map(o => ({ delta: o.delta, res: fix(o.res) })) });
  syncPanel();
}

/* The trace worker: a second copy of the script that only traces. A bench slower to trace
   than TRACE_ASYNC_MS is traced there while something is dragged or a sweep plays: the page
   sends the bench as it now stands, draws the rays that come back, and asks again with
   whatever has changed meanwhile (never more than one trace in flight). Once the dragging
   stops the page traces in full itself, so every panel and field is exact again; while a
   sweep plays it does so every so often, so readouts keep following. */
const TRACE_ASYNC_MS = 30;
const TRACE_FULL_MS = 150;          // a bench slower than this is traced in full in the worker too, once let go of
export const TW = { w: null, failed: false, busy: false, want: null, rays: null, n: 0, lastSync: 0, timer: null, full: null };
function traceWorker() {
  if (TW.w) return TW.w;
  if (TW.failed || TEST_MODE || !WORKERS_OK) return null;
  try {
    TW.w = newAppWorker();
    TW.w.onmessage = e => {
      TW.busy = false;
      if (e.data.ok && e.data.out.T) adoptTrace(e.data.out);
      else if (e.data.ok) { if (!TW.full) TW.rays = e.data.out.rays; TW.n++; }   // a full trace on its way supersedes it
      else { console.warn('JEKray trace worker:', e.data.err); TW.failed = true; TW.w.terminate(); TW.w = null; }
      requestRender();
      twPump();
    };
    TW.w.onerror = e => { e.preventDefault(); TW.failed = true; if (TW.w) TW.w.terminate(); TW.w = null; TW.busy = false; requestRender(); };
  } catch (err) { TW.failed = true; return null; }
  return TW.w;
}
function twPump() {
  if (TW.busy || !TW.want || !traceWorker()) return;
  TW.busy = true;
  TW.w.postMessage({ id: ++TW.n, kind: TW.want.full ? 'full' : 'trace', proj: TW.want.proj, args: { key: TW.want.key }, mods: modDelta(TW.w) });
  TW.want = null;
}
/* A full trace from the worker, taken as this page's own if the bench is still as it was
   when it was asked for; otherwise its rays are drawn and the next one asked for */
function adoptTrace(out) {
  TW.n++;
  if (out.key !== traceKeyNow()) { TW.rays = out.T.rays; return; }
  statsCache.clear(); diffCache.clear(); binCache.clear();
  setLastTrace(out.T);
  setLastTraceKey(out.key); setLastTraceMs(out.ms); setTraceCount(traceCount + 1);
  TW.rays = null; TW.full = null;
  afterTrace();
  syncPanel();
}
const fullOffload = () => lastTraceMs > TRACE_FULL_MS && !(project.fibres || []).length && !VSRC.size && project.elements.every(e => TW_FREE.has(e.type));
/* Brings the trace up to date, or has it brought up to date in the background; true while
   what is drawn comes from the background (the full trace is behind the bench) */
export function traceLater() {
  const key = traceKeyNow();
  if (key === lastTraceKey && lastTrace.beams) { TW.rays = null; return false; }
  const dragging = midDrag(), anim = typeof playing !== 'undefined' && playing.size > 0, now = performance.now();
  const bg = (dragging || anim) && lastTraceMs > TRACE_ASYNC_MS && traceWorker();
  // a slow bench let go of: the full trace too is done in the worker, and the page carries on
  if (!dragging && !anim && fullOffload() && traceWorker()) {
    if (TW.full !== key) { TW.full = key; TW.want = { key, proj: fwProject(), full: true }; twPump(); showActivityNow(); }
    return true;
  }
  // a sweep's readouts still follow it, from a full trace every so often
  if (!bg || (!dragging && now - TW.lastSync > Math.max(500, 6 * lastTraceMs))) { traceScene(); TW.lastSync = now; TW.rays = null; return false; }
  TW.want = { key, proj: fwProject() }; TW.full = null;
  twPump();
  // once the dragging or playing stops, trace in full (nothing else may ask for a redraw)
  clearTimeout(TW.timer);
  TW.timer = setTimeout(() => requestRender(), 250);
  return true;
}

/* The worker's side: load the bench when it changes, trace it, run the job, answer */
