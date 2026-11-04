import { APP_SRC, DEV_WORKER, TEST_MODE } from '../../../jekray/src/core/constants.js';
import { workerShim } from '../../../jekray/src/worker/shim.js';
import { jobsState, runJob } from '../engines/jobs.js';

/* ==========================================================================
   The page's side of the worker: jobs asked for and answered as promises. The worker is this same script run with
   JEKray's shim in front (or, on the dev page, the modules as a module worker). One job runs at a time; a newer
   request for the same slot replaces one still waiting, and asks the worker to drop one already running. Without
   workers (the tests, an old browser) the jobs run on the page, the same code (engines/jobs.js), a step at a time.
   ========================================================================== */
export const WORKERS_OK = !TEST_MODE && !!(APP_SRC || DEV_WORKER) && typeof Worker !== 'undefined';
export const IW = { w: null, failed: false, seq: 0, queue: [], busy: null, local: null, progress: new Map() };
function newIonWorker() {
  if (!APP_SRC) return new Worker(DEV_WORKER, { type: 'module' });
  const url = URL.createObjectURL(new Blob(['(' + workerShim + ')();\n', APP_SRC], { type: 'text/javascript' }));
  const w = new Worker(url);
  URL.revokeObjectURL(url);
  return w;
}
function ionWorker() {
  if (IW.w) return IW.w;
  if (IW.failed || !WORKERS_OK) return null;
  try {
    const w = newIonWorker();
    w.onmessage = iwReply;
    w.onerror = e => { e.preventDefault(); iwFail(e.message || 'the worker stopped'); };
    IW.w = w;
  } catch (err) { IW.failed = true; return null; }
  return IW.w;
}
/* ask for a job: kind, the project as plain data, args; onProgress(p) as it goes. Resolves with the answer, null if
   replaced or cancelled; rejects if the job failed. slot: requests of one slot replace each other (the last wins). */
export function iwRequest(kind, proj, args, slot, onProgress) {
  return new Promise((resolve, reject) => {
    const job = { kind, proj, args: args || {}, slot: slot || kind, resolve, reject, onProgress };
    const k = IW.queue.findIndex(j => j.slot === job.slot);
    if (k >= 0) { IW.queue[k].resolve(null); IW.queue.splice(k, 1); }
    IW.queue.push(job);
    // the one running in this slot is asked to stop, so the new one does not wait on stale work
    if (IW.busy && IW.busy.slot === job.slot && IW.busy.kind !== 'solve') { if (IW.w) IW.w.postMessage({ cancel: IW.busy.id }); else if (IW.busy.local) IW.busy.local.cancelled = true; }
    iwPump();
  });
}
function iwPump() {
  if (IW.busy || !IW.queue.length) return;
  const job = IW.queue.shift();
  IW.busy = job; job.id = ++IW.seq; job.t0 = performance.now();
  const w = ionWorker();
  if (w) { w.postMessage({ id: job.id, kind: job.kind, proj: job.proj, args: job.args }); return; }
  // no worker: on the page
  if (!IW.local) IW.local = jobsState();
  const ctl = { cancelled: false }; job.local = ctl;
  runJob(IW.local, job.kind, job.proj, job.args, { progress: p => { if (job.onProgress) job.onProgress(p); }, cancelled: () => ctl.cancelled })
    .then(r => { IW.busy = null; job.resolve(r.cancelled ? null : r.out); iwPump(); }, err => { IW.busy = null; job.reject(err); iwPump(); });
}
function iwReply(e) {
  const m = e.data, job = IW.busy;
  if (!job || job.id !== m.id) return;
  if (m.progress) { if (job.onProgress) job.onProgress(m.progress); return; }
  IW.busy = null;
  if (!m.ok) { console.warn('JEKion worker:', m.err); job.reject(new Error(m.err)); iwPump(); return; }
  job.resolve(m.cancelled ? null : m.out);
  iwPump();
}
function iwFail(msg) {
  IW.failed = true;
  if (IW.w) IW.w.terminate();
  IW.w = null;
  const all = [IW.busy, ...IW.queue].filter(Boolean);
  IW.busy = null; IW.queue = [];
  for (const j of all) j.reject(new Error(msg));
}
/* drop everything: the worker started afresh (a heavy solve abandoned) */
export function iwReset() {
  if (IW.w) IW.w.terminate();
  IW.w = null;
  const all = [IW.busy, ...IW.queue].filter(Boolean);
  IW.busy = null; IW.queue = [];
  for (const j of all) j.resolve(null);
  IW.local = null;
}
