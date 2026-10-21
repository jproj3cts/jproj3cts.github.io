import { TEST_MODE } from '../core/constants.js';
import { STL_UNITS } from '../core/stl.js';
import { stepPlan, stepRead } from '../core/step.js';
import { V, extraSel, project, selectOne, uid } from '../state/project.js';
import { canvas, wx, wy } from '../ui/render.js';
import { snapVal } from '../ui/pointer.js';
import { V3D } from '../ui/view3d.js';
import { changed, toast } from '../ui/actions.js';
import { checkpoint } from '../ui/tabs.js';
import { stlElement } from '../ui/experimental.js';

/* ==========================================================================
   STEP import: a .step or .stp file as STL objects
   OpenCascade reads the file (occt-import-js 0.0.23, LGPL-2.1, vendored as it was published under
   jek/assets/vendor/occt-import-js/: its script and its WebAssembly, separate files, replaceable). It is fetched
   only when a STEP file is first brought in, and runs in a worker of its own (a classic worker made from the
   few lines in stepWorker, on the built page and the dev page alike), so the page never waits on it. What comes
   back is each body's triangles (core/step.js), which become STL objects exactly as a .stl's do: one object,
   or one for each part, grouped and in place, as the person chooses when there are several.
   ========================================================================== */

export const OCCT_DIR = '../assets/vendor/occt-import-js/0.0.23/';
export const OCCT_WASM_BYTES = 7604031;            // the reader's size, to say how far its download has come
const STEP_AS_KEY = 'jek-raytracer-step-as';

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

/* the STL objects for what was read, onto the bench at (x, y): 'one' object, or 'parts' (one each, grouped) */
export function stepElements(res, fileName, x, y, as) {
  const sc = STL_UNITS[res.units] || 1, plan = stepPlan(res.bodies, fileName, as, res.units, sc), g = plan.length > 1 ? 'g' + uid().slice(1) : null;
  return plan.map(p => {
    const el = stlElement(p.T, p.name, x + p.dx, y + p.dy, res.units, { budget: p.budget, z: p.z, file: fileName, colour: p.colour });
    if (g) el.group = g;
    el.bench = project.tab;
    return el;
  });
}

/* the choice, when a file has several bodies: 'parts', 'one', or null (cancelled); the last kept as the default */
export const stepAsDefault = () => { try { return !TEST_MODE && localStorage.getItem(STEP_AS_KEY) === 'one' ? 'one' : 'parts'; } catch (err) { return 'parts'; } };
let stepAsk = null;
export function stepChoose(n, fileName) {
  const dlg = document.getElementById('stepDialog');
  document.getElementById('stepText').textContent = n + ' parts in ' + fileName;
  const def = stepAsDefault(), bParts = document.getElementById('stepParts'), bOne = document.getElementById('stepOne');
  bParts.classList.toggle('primary', def === 'parts'); bOne.classList.toggle('primary', def === 'one');
  return new Promise(resolve => {
    stepAsk = v => {
      stepAsk = null;
      if (v && !TEST_MODE) try { localStorage.setItem(STEP_AS_KEY, v); } catch (err) { /* not kept: fine */ }
      resolve(v);
    };
    dlg.showModal();
    (def === 'one' ? bOne : bParts).focus();
  });
}
export function wireStep() {
  const dlg = document.getElementById('stepDialog'), pick = v => { if (stepAsk) stepAsk(v); dlg.close(); };
  document.getElementById('stepParts').addEventListener('click', () => pick('parts'));
  document.getElementById('stepOne').addEventListener('click', () => pick('one'));
  document.getElementById('stepCancel').addEventListener('click', () => pick(null));
  dlg.addEventListener('close', () => { if (stepAsk) stepAsk(null); });
}

/* A STEP file from the file picker or dropped on the bench (at: the screen point it was dropped at) */
export async function importStep(file, at) {
  let res;
  try {
    toast('Reading ' + file.name + '…');
    const bytes = new Uint8Array(await file.arrayBuffer());
    res = await stepImportBytes(bytes, file.name, msg => toast(msg));
  } catch (err) { toast(/^(The|OpenCascade|\S+ is not)/.test(err.message) ? err.message : 'Could not read ' + file.name + ': ' + err.message, true); return null; }
  const n = res.bodies.length, as = n > 1 ? await stepChoose(n, file.name) : 'one';
  if (!as) { toast('Nothing brought in.'); return null; }
  let x = V().cx, y = V().cy;
  if (at) { const r = canvas.getBoundingClientRect(), q = V3D.active() ? V3D.tablePoint(at[0], at[1]) : [wx(at[0] - r.left), wy(at[1] - r.top)]; if (q) [x, y] = q; }
  checkpoint();
  const els = stepElements(res, file.name, snapVal(x), snapVal(y), as);
  project.elements.push(...els);
  selectOne(els[0].id); for (const e of els.slice(1)) extraSel.add(e.id);
  const kept = els.reduce((a, e) => a + e.mesh.n, 0), simpl = els.some(e => e.mesh.orig);
  const kb = Math.round(els.reduce((a, e) => a + e.mesh.data.length, 0) / 1024);
  toast('Brought in ' + (els.length > 1 ? els.length + ' parts of ' + file.name + ', grouped' : els[0].name) + ': ' + kept + ' triangles' + (simpl ? ' (simplified from ' + res.tris + ')' : '') +
    ', in ' + ({ mm: 'millimetres', cm: 'centimetres', m: 'metres', in: 'inches' }[res.units]) + (res.declared ? ' as the file says' : '') + ', resting on the breadboard' + (kb > 1024 ? ' (' + (kb / 1024).toFixed(1) + ' MB with the bench: a share link to it will be long)' : ''));
  changed(true);
  return els;
}
