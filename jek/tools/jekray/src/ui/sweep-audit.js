import { getEl } from '../state/elements.js';
import { project } from '../state/project.js';
import { getPath, setParam } from '../state/params.js';
import { lastTrace, setLastTraceKey, traceScene, traceStore, traceStoreHits } from '../engines/trace.js';
import { stepMaps, stepStore } from '../engines/sweep-store.js';
import { popKeyOf, popRun, popSources } from '../engines/beam-tree.js';
import { popDiffraction, popScreenPrep } from '../engines/diffraction.js';
import { volData } from '../engines/volume.js';
import { scatKept, scatterPrep, scatterRun } from '../engines/scatter.js';
import { benchFrame, fieldFrames, fieldReadouts, sweepVol } from './sweeps.js';

/* ---------- (tests) What a sweep keeps, against working it out again ----------
   For every step of the run the sweeps' store holds (engines/sweep-store.js), the bench is set to the step and each
   thing kept for it is compared with the same thing worked out there and then, with nothing taken from the store: the
   trace (as the play would take it, against a trace from nothing), the bench's diffracted field, each screen's, the 3D
   view's volume, each particle's answer (opts.scat: slow). Every number, string and flag the kept one holds is looked
   for in the fresh one. What comes back, a layer each: kept (steps that had it), same (of those, equal to the last
   digit), max (the largest relative difference met), and the first few differences found. The bench is put back. */
function auditDiff(a, b, st, path, seen, depth) {
  if (typeof a === 'function' || a === undefined) return;
  if (a === null || typeof a !== 'object') {
    st.n++;
    if (typeof a === 'number' && typeof b === 'number') {
      if (a !== b && !(a !== a && b !== b)) { const d = Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300); if (d > st.max) { st.max = d; st.at = path; } }
    } else if (a !== b) { st.max = Infinity; st.at = path + ' (' + String(a).slice(0, 30) + ' / ' + String(b).slice(0, 30) + ')'; }
    return;
  }
  if (b === null || typeof b !== 'object') { st.max = Infinity; st.at = path + ' (missing)'; return; }
  if (seen.has(a) || depth > 14) return;
  seen.add(a);
  if (ArrayBuffer.isView(a) || Array.isArray(a)) {
    if (a.length !== b.length) { st.max = Infinity; st.at = path + ' (length ' + a.length + ' / ' + b.length + ')'; return; }
    if (ArrayBuffer.isView(a)) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && !(a[i] !== a[i] && b[i] !== b[i])) { const d = Math.abs(a[i] - b[i]) / Math.max(Math.abs(a[i]), Math.abs(b[i]), 1e-300); if (d > st.max) { st.max = d; st.at = path + '[' + i + ']'; } } st.n += a.length; return; }
    for (let i = 0; i < a.length; i++) auditDiff(a[i], b[i], st, path + '[' + i + ']', seen, depth + 1);
    return;
  }
  if (a instanceof Map) { auditDiff([...a.entries()], b instanceof Map ? [...b.entries()] : null, st, path, seen, depth + 1); return; }
  // (a part: the same part)
  if (typeof a.type === 'string' && typeof a.id === 'string' && depth > 0) { if (a.id !== b.id) { st.max = Infinity; st.at = path + ' (part)'; } return; }
  for (const k of Object.keys(a)) if (!st.skip.has(k)) auditDiff(a[k], b[k], st, path + '.' + k, seen, depth + 1);
}
const auditOf = (kept, fresh, skip) => { const st = { max: 0, n: 0, at: '', skip: new Set(skip || []) }; auditDiff(kept, fresh, st, '', new Set(), 0); return st; };
/* what a trace shows (as test/node/trace-store.test.mjs has it) */
const auditTrace = T => ({ rays: T.rays, beams: T.beams, screens: T.screens, blocked: T.blocked, absorbed: T.absorbed, emitted: T.emitted, scat: T.scat && T.scat.parts });

const auditVol = V => ({ peak: V.peak, segs: [...V.segs].sort((a, b) => a.i - b.i) });

export function sweepAudit(opts = {}) {
  const R = stepStore.run;
  if (!R) return null;
  const list = R.list.map(([id, path]) => [getEl(id), path]);
  if (list.some(q => !q[0])) return null;
  const saved = list.map(([el, path]) => getPath(el, path));
  const out = { steps: R.keys.size, gen: stepStore.gen, layers: {}, bad: [] };
  const L = name => out.layers[name] || (out.layers[name] = { kept: 0, same: 0, max: 0, numbers: 0 });
  const note = (name, i, st) => { const l = L(name); l.kept++; l.numbers += st.n; if (st.max === 0) l.same++; else { l.max = Math.max(l.max, st.max); if (out.bad.length < 8) out.bad.push(name + ' step ' + i + ': ' + (st.max === Infinity ? 'differs' : st.max.toExponential(2)) + ' at ' + st.at); } };
  let i = -1;
  try {
    for (const key of R.keys) {
      i++;
      for (const [id, path, v] of JSON.parse(key)) setParam(getEl(id), path, v);
      // the trace as the play takes it, then from nothing
      const h0 = traceStoreHits;
      setLastTraceKey(null); traceScene();
      const keptT = traceStoreHits > h0 ? lastTrace : null;
      stepStore.bypass = true;
      try { setLastTraceKey(null); traceScene(); } finally { stepStore.bypass = false; }
      const T = lastTrace;
      // (probed: how many rays a particle's light was looked for with in that trace, none when it was kept: work, not light)
      if (keptT) note('trace', i, auditOf(auditTrace(keptT), auditTrace(T), ['probed']));
      const srcs = popSources();
      if (srcs.length) {
        const pk = popKeyOf(T.beams, srcs);
        let run = null;
        const fresh = () => run || (run = popRun(T.beams, srcs, { draw: true }));
        if (fieldFrames.bench.has(pk)) note('bench', i, auditOf(benchFrame(pk).segs, fresh().segs, ['b', 'src', 'leg', 'draw', '_pw']));
        const vk = sweepVol.keyAt(pk), box = sweepVol.box();
        // (segment by segment: a volume put together from the workers' shares lists them in another order)
        if (vk && box && stepMaps.vol.has(vk)) note('vol', i, auditOf(auditVol(stepMaps.vol.get(vk)), auditVol(volData(fresh().segs, box.tab, box.bb, null)), ['disp', 'dispL']));
      }
      for (const scr of fieldReadouts()) {
        const J = popScreenPrep(scr);
        if (J && fieldFrames.screens.has(J.key)) note('screens', i, auditOf(fieldFrames.screens.get(J.key), popDiffraction(scr, popRun(T.beams, J.srcs, { keep: J.keep }))));
      }
      if (opts.scat) for (const el of project.elements) {
        const J = el.type === 'particle' && el.scatLight !== false && scatterPrep(el);
        if (J && scatKept.has(J.key)) note('scat', i, auditOf(scatKept.get(J.key).S, scatterRun(el, popRun(T.beams, J.srcs, { keep: J.keep, bare: true }), { trap: false }), ['ms', 'trapRaw']));
      }
    }
  } finally {
    list.forEach(([el, path], k) => setParam(el, path, saved[k]));
    setLastTraceKey(null); traceScene();
  }
  out.traces = traceStore.size;
  return out;
}
