import { APP_SRC, DEV_WORKER } from '../../../jekray/src/core/constants.js';
import { workerShim } from '../../../jekray/src/worker/shim.js';
import { KERNEL_DIR } from '../core/doc.js';
import { cadRun, loadCad } from '../worker/main.js';

/* ==========================================================================
   The page's side of the kernel worker: requests as promises, one at a time in order. A regeneration still
   waiting is replaced by a newer one (the last wins), so typing in a field never queues up stale models. The
   worker is this same script run with JEKray's shim in front (on the dev page, the modules as a module worker);
   if a worker cannot be made, the kernel runs on the page instead (the same code).
   ========================================================================== */
export const KW = { w: null, failed: false, seq: 0, queue: [], busy: null, local: null, loads: 0 };
const kernelBase = () => new URL(KERNEL_DIR, location.href).href;
function cadWorker() {
  if (KW.w || KW.failed) return KW.w;
  try {
    let w;
    if (!APP_SRC && DEV_WORKER) w = new Worker(DEV_WORKER, { type: 'module' });
    else if (APP_SRC) { const url = URL.createObjectURL(new Blob(['(' + workerShim + ')();\n', APP_SRC], { type: 'text/javascript' })); w = new Worker(url); URL.revokeObjectURL(url); }
    else throw new Error('no worker source');
    w.onmessage = kwReply;
    w.onerror = e => { e.preventDefault(); kwFail(e.message || 'the kernel worker stopped'); };
    KW.w = w;
  } catch (err) { KW.failed = true; KW.w = null; }
  return KW.w;
}
/* ask the kernel: kind ('regen', 'refs', 'measure', 'step', 'stl', 'project'), its arguments. slot 'regen'
   requests replace one another while waiting (the one replaced resolves null) */
export function kernelAsk(kind, args, slot) {
  return new Promise((resolve, reject) => {
    const job = { kind, args: Object.assign({ base: kernelBase() }, args || {}), slot, resolve, reject };
    if (slot) { const k = KW.queue.findIndex(j => j.slot === slot); if (k >= 0) { KW.queue[k].resolve(null); KW.queue.splice(k, 1); } }
    KW.queue.push(job);
    kwPump();
  });
}
/* is a request of this slot waiting or being worked on (a regeneration still to come back) */
export const kernelHas = slot => !!(KW.busy && KW.busy.slot === slot) || KW.queue.some(j => j.slot === slot);
function kwPump() {
  if (KW.busy || !KW.queue.length) return;
  const job = KW.queue.shift();
  KW.busy = job; job.id = ++KW.seq;
  const w = cadWorker();
  if (w) { w.postMessage({ id: job.id, kind: job.kind, args: job.args }); return; }
  // no worker: on the page, a moment later so the page can draw first
  setTimeout(async () => {
    try { const K = await loadCad(job.args.base); kwDone(job, { out: cadRun(K, job.kind, job.args) }); }
    catch (err) { kwDone(job, { error: err.message || String(err) }); }
  }, 0);
}
function kwDone(job, m) {
  if (KW.busy !== job) return;
  KW.busy = null;
  if (m.error) job.reject(new Error(m.error)); else job.resolve(m.out);
  kwPump();
}
function kwReply(e) { const m = e.data || {}; if (KW.busy && m.id === KW.busy.id) kwDone(KW.busy, m); }
function kwFail(msg) {
  const job = KW.busy;
  try { KW.w.terminate(); } catch (err) { /* gone */ }
  KW.w = null; KW.failed = true;
  if (job) { KW.busy = null; job.reject(new Error(msg)); }
  kwPump();
}
export const kernelBusy = () => !!KW.busy || KW.queue.length > 0;
