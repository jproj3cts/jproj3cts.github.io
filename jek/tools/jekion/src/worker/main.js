import { jobsState, runJob } from '../engines/jobs.js';

/* ==========================================================================
   The worker's side: the page's jobs run here one after another (each yielding as it goes, so a cancel message
   arrives), the solved array kept between them. Messages in: { id, kind, proj, args } or { cancel: id };
   out: { id, progress }, { id, ok: true, out } (with buffers transferred), { id, ok: true, cancelled: true } or
   { id, ok: false, err }.
   ========================================================================== */
export function workerMain() {
  const St = jobsState(), queue = [], cancelled = new Set();
  let running = null;
  const pump = async () => {
    if (running || !queue.length) return;
    const m = running = queue.shift();
    try {
      if (cancelled.has(m.id)) { cancelled.delete(m.id); self.postMessage({ id: m.id, ok: true, cancelled: true }); }
      else {
        const r = await runJob(St, m.kind, m.proj, m.args, { progress: p => self.postMessage({ id: m.id, progress: p }), cancelled: () => cancelled.has(m.id) });
        cancelled.delete(m.id);
        if (r.cancelled) self.postMessage({ id: m.id, ok: true, cancelled: true });
        else self.postMessage({ id: m.id, ok: true, out: r.out }, r.transfer || []);
      }
    } catch (err) { self.postMessage({ id: m.id, ok: false, err: String((err && err.stack) || err) }); }
    running = null;
    pump();
  };
  self.onmessage = e => {
    const m = e.data;
    if (m.cancel !== undefined) { cancelled.add(m.cancel); return; }
    queue.push(m);
    pump();
  };
}
