/* The dev page's worker: the modules as they are, as a module worker (the built page runs its own script in a
   worker instead: page/workers.js). JEKray's shim stands in for the page before anything loads. Messages that
   arrive while the modules load are kept and answered once they have. */
import { workerShim } from '../../../jekray/src/worker/shim.js';
workerShim();
const early = [];
self.onmessage = e => early.push(e);
import('../worker-main.js').then(({ workerMain }) => { workerMain(); for (const e of early) self.onmessage(e); });
