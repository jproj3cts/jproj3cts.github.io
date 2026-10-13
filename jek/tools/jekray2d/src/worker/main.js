import { fibreSPMLater } from '../core/pulses.js';
import { allSources, getEl, loadProject } from '../state/elements.js';
import { lastTrace, lastTraceMs, traceScene } from '../engines/trace.js';
import { setParam } from '../ui/params.js';
import { popLeg } from '../engines/field.js';
import { cavSolved } from '../engines/cavity.js';
import { popLeg2 } from '../engines/field2d.js';
import { legAlong, popKeyOf, popRun, popSources } from '../engines/beam-tree.js';
import { closeupImage } from '../engines/closeup.js';
import { volData } from '../engines/volume.js';
import { popDiffraction, popScreenPrep } from '../engines/diffraction.js';
import { detectorField } from '../engines/pd-cavity.js';
import { modAbsorb } from '../io/mods.js';
import { fwPackCavities, fwPackD, fwPackRun } from './field-worker.js';

function workerMain() {
  let bench = { key: null, R: null };
  self.onmessage = e => {
    const { id, kind, proj, args } = e.data;
    try {
      if (e.data.mods) modAbsorb(e.data.mods);                 // the mods' results the page has (their code never comes here)
      if (proj) { loadProject(JSON.parse(proj)); traceScene(); bench = { key: null, R: null }; }
      else if (e.data.mods) { traceScene(); bench = { key: null, R: null }; }   // traced again with them
      const before = kind === 'cavity' ? null : new Map(cavSolved);
      const transfer = [];
      let out = null;
      if (kind === 'bench') {
        const srcs = popSources(), key = popKeyOf(lastTrace.beams, srcs);
        const R = popRun(lastTrace.beams, srcs, { draw: true });
        bench = { key, R };
        out = { key, R: fwPackRun(R, transfer) };
      } else if (kind === 'screen') {
        const el = getEl(args.id), J = el && popScreenPrep(el);
        out = J ? { key: J.key, D: fwPackD(popDiffraction(el, popRun(lastTrace.beams, J.srcs, { keep: J.keep }))) } : { key: null, D: null };
      } else if (kind === 'detector') {
        const el = getEl(args.id), J = el && popScreenPrep(el);
        out = J ? { key: J.key + '|' + el.length, r: detectorField(el, popRun(lastTrace.beams, J.srcs, { keep: J.keep })) } : null;
      } else if (kind === 'cavity') {
        popRun(lastTrace.beams, allSources(), {});
      } else if (kind === 'step') {
        // a sweep's step for the render pool: the swept values set as the page sets them, then its fields
        for (const [id, path, v] of args.sets) { const el = getEl(id); if (el) setParam(el, path, v); }
        traceScene();
        const srcs = popSources();
        out = { bench: srcs.length ? { key: popKeyOf(lastTrace.beams, srcs), R: fwPackRun(popRun(lastTrace.beams, srcs, { draw: true }), transfer) } : null,
          screens: (args.ids || []).map(id => { const el = getEl(id), J = el && popScreenPrep(el); return J ? { key: J.key, D: fwPackD(popDiffraction(el, popRun(lastTrace.beams, J.srcs, { keep: J.keep }))) } : null; }) };
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
        out = { key, R: fwPackRun(bench.R, transfer) };
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
}
