import { stepRead } from '../core/step.js';

/* ==========================================================================
   STEP import: a .step or .stp file as STL objects
   The reader alone, with nothing of the page in it (JEKion shares it; io/step.js is the page's side).
   OpenCascade reads the file (occt-import-js 0.0.23, LGPL-2.1, vendored as it was published under
   jek/assets/vendor/occt-import-js/: its script and its WebAssembly, separate files, replaceable). It is fetched
   only when a STEP file is first brought in, and runs in a worker of its own (a classic worker made from the
   few lines in stepWorker, on the built page and the dev page alike), so the page never waits on it. What comes
   back is each body's triangles (core/step.js), which become STL objects exactly as a .stl's do: one object,
   or one for each part, grouped and in place, as the person chooses when there are several.
   ========================================================================== */

export const OCCT_DIR = '../assets/vendor/occt-import-js/0.0.23/';
export const OCCT_WASM_BYTES = 7604031;            // the reader's size, to say how far its download has come

/* the worker's code (a classic worker: importScripts, then OpenCascade's module), sent as its text */
function stepWorker() {
  let occt = null, bytes = null;
  self.onmessage = async e => {
    const m = e.data;
    try {
      if (m.load) {
        // the WebAssembly fetched here, so its download can be followed; then the module made from it
        const res = await fetch(m.wasm);
        if (!res.ok) throw new Error('the STEP reader could not be fetched (HTTP ' + res.status + ')');
        const parts = [], rd = res.body && res.body.getReader();
        let got = 0, last = 0;
        if (rd) for (;;) { const r = await rd.read(); if (r.done) break; parts.push(r.value); got += r.value.length; if (got - last > 262144) { last = got; self.postMessage({ progress: got }); } }
        const bin = rd ? new Uint8Array(got) : new Uint8Array(await res.arrayBuffer());
        if (rd) { let o = 0; for (const p of parts) { bin.set(p, o); o += p.length; } }
        self.importScripts(m.lib);
        occt = await self.occtimportjs({ wasmBinary: bin.buffer, locateFile: () => m.wasm });
        self.postMessage({ id: m.id, ok: true });
        return;
      }
      if (m.bytes) bytes = new Uint8Array(m.bytes);
      const r = occt.ReadStepFile(bytes, m.params);
      if (!r || !r.success) { self.postMessage({ id: m.id, ok: true, out: { success: false } }); return; }
      const meshes = r.meshes.map(M => ({ name: M.name || '', color: M.color || null, P: new Float32Array(M.attributes.position.array), I: new Uint32Array(M.index.array) }));
      self.postMessage({ id: m.id, ok: true, out: { success: true, root: r.root, meshes } }, meshes.flatMap(M => [M.P.buffer, M.I.buffer]));
    } catch (err) { self.postMessage({ id: m.id, ok: false, err: String((err && err.message) || err) }); }
  };
}
/* a reader in its worker: { read(params, bytes) → Promise of occt-import-js's result, close() }; onProgress(bytes so far) */
export async function stepReader(onProgress) {
  const url = URL.createObjectURL(new Blob(['(' + stepWorker + ')();\n'], { type: 'text/javascript' }));
  const w = new Worker(url);
  URL.revokeObjectURL(url);
  let seq = 0;
  const waiting = new Map();
  const fail = msg => { for (const p of waiting.values()) p.reject(new Error(msg)); waiting.clear(); };
  w.onmessage = e => {
    const m = e.data;
    if (m.progress) { if (onProgress) onProgress(m.progress); return; }
    const p = waiting.get(m.id); if (!p) return;
    waiting.delete(m.id);
    if (m.ok) p.resolve(m.out); else p.reject(new Error(m.err));
  };
  w.onerror = e => { e.preventDefault(); fail(e.message || 'the STEP reader stopped'); };
  const ask = (msg, transfer) => new Promise((resolve, reject) => { msg.id = ++seq; waiting.set(msg.id, { resolve, reject }); w.postMessage(msg, transfer || []); });
  const base = new URL(OCCT_DIR, location.href).href;
  try { await ask({ load: true, lib: base + 'occt-import-js.js', wasm: base + 'occt-import-js.wasm' }); } catch (err) { w.terminate(); throw err; }
  let sent = false;
  return {
    read(params, bytes) { const msg = { params }; if (!sent) { msg.bytes = bytes.slice().buffer; sent = true; } return ask(msg, msg.bytes ? [msg.bytes] : []); },
    close() { w.terminate(); fail('closed'); },
  };
}

/* Reads a STEP file's bodies in a worker, saying how it goes: { bodies, units, declared, pass, tris, ms } */
export async function stepImportBytes(bytes, fileName, say) {
  say = say || (() => {});
  const t0 = performance.now();
  let slow = false;
  // the reader's download, said only if it is not already at hand (from this browser's cache it comes at once)
  const timer = setTimeout(() => { slow = true; say('Fetching the STEP reader (OpenCascade, ' + (OCCT_WASM_BYTES / 1e6).toFixed(1) + ' MB, once)…'); }, 400);
  let reader;
  try {
    reader = await stepReader(got => { if (slow) say('Fetching the STEP reader: ' + Math.min(100, Math.round(100 * got / OCCT_WASM_BYTES)) + '% of ' + (OCCT_WASM_BYTES / 1e6).toFixed(1) + ' MB (once)…'); });
  } catch (err) {
    const net = /fetch|network|HTTP/i.test(err.message) || (typeof navigator !== 'undefined' && navigator.onLine === false);
    throw new Error('The STEP reader could not be loaded (' + err.message + '). ' + (net ? 'It is fetched the first time a STEP file is brought in: try again when online.' : 'This browser may be too old to run it: try a current Chrome, Edge, Firefox or Safari.'));
  } finally { clearTimeout(timer); }
  const tick = setInterval(() => say('Reading ' + fileName + '… ' + Math.round((performance.now() - t0) / 1000) + ' s'), 1000);
  try {
    const out = await stepRead(bytes, fileName, params => reader.read(params, bytes), pass => say(pass ? 'Reading ' + fileName + ' again, more coarsely (it has many triangles)…' : 'Reading ' + fileName + '…'));
    out.ms = Math.round(performance.now() - t0);
    return out;
  } finally { clearInterval(tick); reader.close(); }
}

