/* The dev page's worker: the modules as they are, as a module worker (the built page runs its
   own script in a worker instead, see page/workers.js). The shim stands in for the page before
   anything loads, as it does there. Messages that arrive while the modules load are kept and
   answered once they have (a message posted to a module worker still awaiting is lost). */
import { workerShim } from './shim.js';
workerShim();
const early = [];
self.onmessage = e => early.push(e);
import('../worker-main.js').then(({ workerMain }) => { workerMain(); for (const e of early) self.onmessage(e); });
