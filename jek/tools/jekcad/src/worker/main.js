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
  if (kind === 'pierce') return K.pierce(a.picks, a.frame);
  if (kind === 'asmStep' || kind === 'asmStl') return K.asmExport(kind === 'asmStl' ? 'stl' : 'step', a.items, a.fine);
  if (kind === 'asmMeasure') return K.asmMeasure(a.picks);
  if (kind === 'asmClash') return K.asmClash(a.items);
  if (kind === 'drawing') return K.drawingViews(a.items, a.views);
  if (kind === 'drawLocate') return K.drawLocate(a.reqs);
  if (kind === 'ping') return true;
  throw new Error('no such request: ' + kind);
}
/* ---------- steps kept between visits ----------
   A Part Studio that took a while to make is kept in this browser's IndexedDB as its last step (the kernel's
   snapshot: its parts as OpenCascade's text, by the key of the features that made them), so opening it again reads
   the parts back instead of making every feature again. Only when the page says the work may be kept here (keep:
   ui/pro.js keepHere, as its autosave). The 24 used last are kept, 80 MB at most; what cannot be stored is left. */
const STEP_DB = 'jekcad-steps', STEP_MAX = 24, STEP_BYTES = 80e6, STEP_SLOW = 250;
let stepDb = null;
function stepOpen() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!stepDb) stepDb = new Promise(res => {
    try {
      const r = indexedDB.open(STEP_DB, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('steps', { keyPath: 'key' }); r.result.createObjectStore('meta', { keyPath: 'key' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
    } catch (err) { res(null); }
  });
  return stepDb;
}
const stepReq = r => new Promise(res => { r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); });
/* the furthest of the keys (latest first) that is kept, and its meta touched (it was used) */
async function stepFind(keys) {
  const db = await stepOpen();
  if (!db || !keys.length) return null;
  for (const key of keys) {
    const rec = await stepReq(db.transaction('steps').objectStore('steps').get(key));
    if (rec && rec.snap) { try { db.transaction('meta', 'readwrite').objectStore('meta').put({ key, at: Date.now(), size: rec.size }); } catch (err) { /* kept as it was */ } return rec.snap; }
  }
  return null;
}
async function stepKeep(snap) {
  const db = await stepOpen();
  if (!db || !snap) return;
  try {
    const size = JSON.stringify(snap.S).length;
    if (size > STEP_BYTES / 4) return;
    const tx = db.transaction(['steps', 'meta'], 'readwrite');
    tx.objectStore('steps').put({ key: snap.key, snap, size }); tx.objectStore('meta').put({ key: snap.key, at: Date.now(), size });
    await new Promise(res => { tx.oncomplete = res; tx.onerror = res; tx.onabort = res; });
    // the oldest let go while there are too many, or too much
    const metas = (await stepReq(db.transaction('meta').objectStore('meta').getAll())) || [];
    metas.sort((a, b) => b.at - a.at);
    let total = 0; const gone = [];
    metas.forEach((m, i) => { total += m.size || 0; if (i >= STEP_MAX || total > STEP_BYTES) gone.push(m.key); });
    if (gone.length) { const t2 = db.transaction(['steps', 'meta'], 'readwrite'); for (const k of gone) { t2.objectStore('steps').delete(k); t2.objectStore('meta').delete(k); } }
  } catch (err) { /* this browser keeps nothing: opening makes it again */ }
}
/* before a regeneration: the furthest step this browser kept, read in where the kernel holds nothing as far on */
async function stepBefore(K, a) {
  try {
    const cid = a.doc && typeof a.doc.id === 'string' ? a.doc.id : '', keys = K.stepKeys(a.doc, a.opts), want = [];
    for (const k of keys) { if (K.has(cid, k)) break; want.push(k); }
    if (!want.length) return;
    const snap = await stepFind(want);
    if (snap) K.restore(snap, cid);
  } catch (err) { /* made again instead */ }
}
export function workerMain() {
  self.onmessage = async e => {
    const { id, kind, args } = e.data || {};
    try {
      const K = await loadCad(args.base);
      if (kind === 'regen') await stepBefore(K, args);
      const out = cadRun(K, kind, args);
      self.postMessage({ id, out });
      // (after the answer: a studio that took a while is kept for next time)
      if (kind === 'regen' && args.opts && args.opts.keep && K.lastRan() > STEP_SLOW) stepKeep(K.snapshot());
    } catch (err) {
      self.postMessage({ id, error: err && err.message ? err.message : String(err) });
    }
  };
}
