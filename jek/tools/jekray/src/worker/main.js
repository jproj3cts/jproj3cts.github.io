import { fibreSPMLater } from '../core/pulses.js';
import { VSRC, allSources, getEl, loadProject } from '../state/elements.js';
import { lastTrace, lastTraceMs, setLastTraceKey, traceKeepable, traceKeyRestNow, traceScene } from '../engines/trace.js';
import { setParam } from '../state/params.js';
import { modAbsorb } from '../engines/mods.js';
import { popLeg } from '../engines/field.js';
import { cavSolved } from '../engines/cavity.js';
import { popLeg2 } from '../engines/field2d.js';
import { legAlong, popKeyOf, popRun, popSources } from '../engines/beam-tree.js';
import { closeupImage } from '../engines/closeup.js';
import { volData, volLightBox } from '../engines/volume.js';
import { popDiffraction, popScreenPrep } from '../engines/diffraction.js';
import { particleTrapRaw, scatFind, scatKeep, scatterGen, scatterPrep } from '../engines/scatter.js';
import { detectorField } from '../engines/pd-cavity.js';
import { cavLoadKey } from '../engines/scatter-cavity.js';
import { antennaJob } from '../engines/antenna-field.js';
import { optRun } from '../engines/lens-opt.js';
import { tolRun } from '../engines/lens-tol.js';

/* the 3D view's field volume for a step, cut to its board, keyed as the view asks for it (by the board as the light
   meets it: volLightBox) */
function volOut(R, key, vol, transfer) {
  const V = volData(R.segs, vol.tab, vol.bb, null);
  for (const v of V.segs) transfer.push(v.I.buffer, v.ts.buffer, v.rmax.buffer);
  return { key, tab: vol.tab, bb: volLightBox(vol.bb, lastTrace.beams, popSources()), V };
}
/* A sweep's step as traced here, for the page to keep for when the step plays (engines/trace.js keepTraceFrom), so that it
   is not traced again there: the bench's key as it stands after the trace, the trace, how long it took and the sources a
   fibre tip made; copied now, before any field run on it. None while a particle's answer is still to come here (one the
   page would not keep). */
function stepTrace() {
  return traceKeepable(lastTrace) ? structuredClone({ rest: traceKeyRestNow(), T: lastTrace, ms: lastTraceMs, V: [...VSRC.values()] }) : null;
}
export function workerMain() {
  let bench = { key: null, R: null }, wLoad = null;
  // the scattering worker's jobs run a slice at a time, so a cancel sent for one (the bench moved on) is heard between
  // slices and the worker, with what it keeps (the answers it can combine), stays for the next
  const cancelled = new Set();
  let lastProj = null, dirty = false;
  self.onmessage = e => {
    if (e.data && e.data.cancel !== undefined) { cancelled.add(e.data.cancel); return; }
    const { id, kind, proj, args } = e.data;
    if (kind === 'scatter' || kind === 'trap') { particleJob(e.data); return; }
    lastProj = null;
    try {
      // the page's particles solved in a cavity: what the field runs take the cavity's light by (engines/scatter-cavity.js)
      if (proj) wLoad = JSON.parse(proj).cavLoad || null;
      if (e.data.mods) modAbsorb(e.data.mods);                 // the mods' results the page has (their code never comes here)
      if (proj) { loadProject(JSON.parse(proj)); traceScene(); bench = { key: null, R: null }; }
      else if (e.data.mods) { traceScene(); bench = { key: null, R: null }; }   // traced again with them
      if ((proj || e.data.mods) && wLoad) lastTrace.cavLoad = wLoad;
      const before = kind === 'cavity' ? null : new Map(cavSolved);
      const transfer = [];
      let out = null;
      if (kind === 'bench') {
        const srcs = popSources(), key = popKeyOf(lastTrace.beams, srcs);
        const R = popRun(lastTrace.beams, srcs, { draw: true });
        bench = { key, R };
        out = { key, R: fwPackRun(R, transfer), vol: args && args.vol ? volOut(R, key, args.vol, transfer) : null };
      } else if (kind === 'screen') {
        const el = getEl(args.id), J = el && popScreenPrep(el);
        out = J ? { key: J.key, D: fwPackD(popDiffraction(el, popRun(lastTrace.beams, J.srcs, { keep: J.keep }))) } : { key: null, D: null };
      } else if (kind === 'detector') {
        const el = getEl(args.id), J = el && popScreenPrep(el);
        out = J ? { key: J.key + '|' + el.length + cavLoadKey(), r: detectorField(el, popRun(lastTrace.beams, J.srcs, { keep: J.keep })) } : null;
      } else if (kind === 'cavity') {
        popRun(lastTrace.beams, allSources(), {});
        out = true;                                      // (done: the cavities it solved come with it, as cav; none may be)
      } else if (kind === 'step') {
        // a sweep's step for the render pool: the swept values set as the page sets them, then its fields
        for (const [id, path, v] of args.sets) { const el = getEl(id); if (el) setParam(el, path, v); }
        traceScene();
        // (asked for on a bench slow to trace: the step's trace too, as it stands before the fields are run on it)
        const tr = args.trace ? stepTrace() : null;
        const srcs = popSources();
        const R = srcs.length ? popRun(lastTrace.beams, srcs, { draw: true }) : null, key = R && popKeyOf(lastTrace.beams, srcs);
        out = { bench: R ? { key, R: fwPackRun(R, transfer) } : null, vol: R && args.vol ? volOut(R, key, args.vol, transfer) : null,
          screens: (args.ids || []).map(id => { const el = getEl(id), J = el && popScreenPrep(el); return J ? { key: J.key, D: fwPackD(popDiffraction(el, popRun(lastTrace.beams, J.srcs, { keep: J.keep }))) } : null; }),
          trace: tr };
      } else if (kind === 'antenna') {
        // an RF lens as an antenna: its far field, its tolerance or its scan, the bench traced again as they need
        const el = getEl(args.id);
        out = { out: el ? JSON.parse(JSON.stringify(antennaJob(el, args.what), (k, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v))) : null };
      } else if (kind === 'lensopt') {
        // a lens design's optimisation, a few cycles (or trials) at a time: all it needs comes with it
        out = { out: optRun(args.prob, args.run) };
      } else if (kind === 'lenstol') {
        // a lens design's tolerancing, a batch of tolerances (or trials) at a time
        out = { out: tolRun(args.prob, args.run) };
      } else if (kind === 'spm') {
        out = fibreSPMLater(args.F, args.nm, args.len, args.P, args.Pavg, args.gdd, args.sp);
      } else if (kind === 'trace') {
        out = { key: args.key, rays: lastTrace.rays };
      } else if (kind === 'full') {
        out = { key: args.key, T: lastTrace, ms: lastTraceMs };
      } else if (kind === 'closeup') {
        const srcs = popSources(), key = popKeyOf(lastTrace.beams, srcs);
        if (bench.key !== key) bench = { key, R: popRun(lastTrace.beams, srcs, {}) };
        if (key === args.key) { out = closeupImage(bench.R.segs, args.view, args.step, args.log); transfer.push(out.img.data.buffer); }
        else out = { mismatch: true };      } else if (kind === 'run') {
        // the bench's field run, without the bench's drawing of it (for the 3D view's render workers)
        const srcs = popSources(), key = popKeyOf(lastTrace.beams, srcs);
        if (bench.key !== key) bench = { key, R: popRun(lastTrace.beams, srcs, {}) };
        // (never its drawing: a run kept from a 'bench' job has handed its drawn slices to the page already, and sending
        // them again failed the worker, DataCloneError, after which the page did every field itself)
        out = { key, R: fwPackRun(bench.R, transfer, true) };
      } else if (kind === 'warm') {
        out = true;                                      // the bench loaded and traced: ready for its share
      } else if (kind === 'volpart') {
        // a render worker's share of the 3D field: the segments' starting fields as the field worker
        // worked them out, carried on from there, here
        const srcs = popSources(), key = popKeyOf(lastTrace.beams, srcs);
        if (key !== args.key) out = { mismatch: true };
        else {
          const segs = args.segs.map(q => { const b = lastTrace.beams[q.i]; return Object.assign({}, q, { b, src: getEl(q.src), leg: legAlong(q.eng === '2d' ? popLeg2(q.F0) : popLeg(q.F0), b) }); });
          out = volData(segs, args.tab, args.bb, new Map(args.only));
          for (const v of out.segs) transfer.push(v.I.buffer, v.ts.buffer, v.rmax.buffer);
        }
      } else if (kind === 'vol3d') {
        const srcs = popSources(), key = popKeyOf(lastTrace.beams, srcs);
        if (bench.key !== key) bench = { key, R: popRun(lastTrace.beams, srcs, {}) };
        if (key === args.key) {
          // one share of a pooled job, or all of it
          out = volData(bench.R.segs, args.tab, args.bb, null);
          for (const v of out.segs) transfer.push(v.I.buffer, v.ts.buffer, v.rmax.buffer);
        }
        else out = { mismatch: true };
      }
      self.postMessage({ id, ok: true, out, cav: fwPackCavities(before) }, transfer);
    } catch (err) {
      self.postMessage({ id, ok: false, err: String((err && err.stack) || err) });
    }
  };
  /* A particle's scattering (the Scattering tab's own worker, and a sweep's steps solved ahead): its progress as it goes,
     then the answer; or its trap, asked for apart. args.sets: a sweep's values for the step, set as the page sets them.
     The bench is loaded again only when it is not the one already loaded as it was sent. */
  const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
  async function particleJob(m) {
    const { id, kind, proj, args } = m;
    try {
      if (m.mods) modAbsorb(m.mods);
      if (proj && (proj !== lastProj || dirty || m.mods)) { wLoad = JSON.parse(proj).cavLoad || null; loadProject(JSON.parse(proj)); traceScene(); bench = { key: null, R: null }; lastProj = proj; dirty = false; if (wLoad) lastTrace.cavLoad = wLoad; }
      if (args.sets && args.sets.length) { for (const [eid, path, v] of args.sets) { const el = getEl(eid); if (el) setParam(el, path, v); } traceScene(); dirty = true; }
      const el = getEl(args.id), J = el && scatterPrep(el);
      if (!J) { self.postMessage({ id, ok: true, out: { key: null, S: null } }); return; }
      const R = popRun(lastTrace.beams, J.srcs, { keep: J.keep, bare: true });
      if (kind === 'trap') { self.postMessage({ id, ok: true, out: { key: J.key, T: particleTrapRaw(el, R) } }); return; }
      // (an answer this worker has worked out before, a state come back to: sent again as it is)
      // (a sweep's step solved ahead on a bench slow to trace: the step traced again here with its answer, and sent with it)
      const traced = () => { if (!args.trace) return null; setLastTraceKey(null); traceScene(); return stepTrace(); };
      const was = scatFind(el.id, J.key, true);
      if (was && (was.S.trapRaw || !args.trap)) { self.postMessage({ id, ok: true, out: { key: J.key, S: was.S, trace: traced() } }); return; }
      const g = scatterGen(el, R, { trap: !!args.trap });
      // (its progress ten times a second, and each new stage as it starts, however short the one before it was; a slice of
      // about 40 ms at a time, a cancel heard between them)
      let r = g.next(), t = 0, stage = '', slice = Date.now();
      while (!r.done) {
        const now = Date.now();
        if (now - t > 100 || r.value.stage !== stage) { t = now; stage = r.value.stage; self.postMessage({ id, prog: r.value }); }
        if (now - slice > 40) { await tick(); slice = Date.now(); if (cancelled.has(id)) { cancelled.delete(id); self.postMessage({ id, ok: true, out: { cancelled: true } }); return; } }
        r = g.next();
      }
      cancelled.delete(id);
      if (r.value && !r.value.error) scatKeep(el.id, J.key, r.value, true);
      self.postMessage({ id, ok: true, out: { key: J.key, S: r.value, trace: r.value && !r.value.error ? traced() : null } });
    } catch (err) {
      self.postMessage({ id, ok: false, err: String((err && err.stack) || err) });
    }
  }
}

/* A field run as plain data: each segment by its beam's index and its source's id, with its
   starting field; the drawn slices as images. The page puts the rest back (fwUnpackRun). */
export function fwPackRun(R, transfer, bare) {
  const segs = R.segs.map(sg => {
    let draw = null;
    if (sg.draw && !bare) {
      const bm = sg.draw.cv.transferToImageBitmap();
      transfer.push(bm);
      draw = Object.assign({}, sg.draw, { cv: bm });
      if (sg.draw.lin) transfer.push(sg.draw.lin.buffer, sg.draw.gs.buffer);
    }
    return { i: sg.i, src: sg.src.id, eng: sg.eng, F0: sg.F0, root: sg.root, clipped: sg.clipped, repr: sg.repr, boost: sg.boost, mode: sg.mode, coh: sg.coh, draw };
  });
  return { segs, notes: R.notes, truncated: R.truncated, ms: R.ms };
}

/* a screen's figures without their functions (diffFns puts them back) */
export function fwPackD(D) {
  if (!D) return null;
  const o = {};
  for (const k in D) if (typeof D[k] !== 'function') o[k] = D[k];
  return o;
}

/* the cavities a job solved, for the cards; their responses rebuilt from the Krylov space */
export function fwPackCavities(before) {
  const out = [], pr = r => r && { Q: r.Q, H: r.H, m: r.m, beta: r.beta, scan: r.scan, dLock: r.dLock, P0: r.P0, Plock: r.Plock };
  for (const [k, v] of cavSolved) {
    if (v.trace !== lastTrace || (before && before.get(k) === v)) continue;
    out.push({ k, eng: v.eng, delta: v.delta, mode: v.mode, res: pr(v.res), others: (v.others || []).map(o => ({ delta: o.delta, res: pr(o.res) })) });
  }
  return out;
}
