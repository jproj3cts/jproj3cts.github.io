import { makeKernel } from '../engines/kernel.js';

/* ==========================================================================
   The kernel worker: OpenCascade loaded on the first request (from the site, never a CDN: the page sends where),
   then each request answered in turn. The page never waits on the kernel: regenerating the feature list, meshing,
   measuring and writing STEP or STL all happen here.
   ========================================================================== */
let kernelLoad = null;
export function loadCad(base) {
  if (!kernelLoad) {
    kernelLoad = import(base + 'replicad_single.js')
      .then(m => m.default({ print() {}, printErr() {}, locateFile: f => base + f }))
      .then(oc => makeKernel(oc));
    kernelLoad.catch(() => { kernelLoad = null; });
  }
  return kernelLoad;
}
/* one request: what it asks of the kernel */
export function cadRun(K, kind, a) {
  if (kind === 'regen') return K.regen(a.doc, a.opts);
  if (kind === 'refs') return K.refs(a.picks);
  if (kind === 'measure') return K.measure(a.picks, a.doc);
  if (kind === 'step') return K.exportStep(a.parts);
  if (kind === 'stl') return K.exportStl(a.parts, a.fine);
  if (kind === 'project') return K.project(a.picks, a.frame);
  if (kind === 'section') return K.section(a.picks, a.frame);
  if (kind === 'ping') return true;
  throw new Error('no such request: ' + kind);
}
export function workerMain() {
  self.onmessage = async e => {
    const { id, kind, args } = e.data || {};
    try {
      const K = await loadCad(args.base);
      const out = cadRun(K, kind, args);
      self.postMessage({ id, out });
    } catch (err) {
      self.postMessage({ id, error: err && err.message ? err.message : String(err) });
    }
  };
}
