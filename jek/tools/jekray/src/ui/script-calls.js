import { project, typeLabel } from '../state/project.js';
import { serialize } from '../state/elements.js';
import { paraxial, setLastTraceKey, traceScene } from '../engines/trace.js';
import { getPath, setParam } from '../state/params.js';
import { detectorReading, faceArrivals } from '../engines/fibre-face.js';
import { linkBudget, rfSweep } from '../engines/rf-sweep.js';
import { antennaNow } from '../engines/antenna-field.js';
import { metricRaw } from './optimise.js';
import { diffraction, viaCavity } from '../engines/pd-cavity.js';
import { screenStats } from '../engines/screen-stats.js';
import { zmxExport } from '../io/zmx-export.js';
import { asmParaxial, asmPrescription, assemblies } from '../core/assembly.js';
import { lensSystem } from '../engines/lens-engine.js';

/* ---------- The calls a script is given, as window.JEKray has them ----------
   The part of window.JEKray (ui/boot.js) that Tools › Scripts hands a script as J (ui/scripts.js CALLS), kept here so the
   script worker (page/script-worker.js) makes the same calls over its own copy of the bench: the same code, the same
   answers. Each reads only the bench and the engines; none needs the page. The page-only ones (load, select, showTab,
   sweepPlay, sweepPause) stay in boot.js, and the worker has its own (page/script-worker.js workerCalls). */
export function scriptCalls() {
  return {
    serialize() { return serialize(); },
    trace() { setLastTraceKey(null); traceScene(); },
    benches() { return project.benches.map(b => ({ id: b.id, name: b.name, on: b.id === project.tab })); },
    arrivals(name) { return faceArrivals(this.byName(name)).map(A => ({ qx: A.qx, qy: A.qy, u0: A.u0, ldx: A.ldx, ldy: A.ldy, J: A.J, coh: A.coh, opl: A.opl, fo: A.fo })); },
    // a receiving horn against frequency, and its link budget (RF)
    rfSweep(name) { return rfSweep(this.byName(name)); },
    linkBudget(name) { return linkBudget(this.byName(name)); },
    detector(name) { const el = this.byName(name), r = detectorReading(el); return { mw: r.mw, field: r.field, pending: r.pending, via: viaCavity(el), V: r.V, snr: r.snr, ifMw: r.ifMw, mds: r.mds, rf: r.rf ? { eff: r.rf.eff, inMw: r.rf.inMw, mw: r.rf.mw, lines: r.rf.lines } : null }; },
    // an RF lens as an antenna, from the bench's field: worked out now and kept for its panel
    lensAntenna(name) {
      traceScene(); const A = antennaNow(this.byName(name), 'ant');
      return A && { Gdbi: A.Gdbi, Ddbi: A.Ddbi, hpbw: A.hpbw, hpbwY: A.hpbwY, lobe: A.lobe, eta: A.eta, hornDbi: A.hornDbi, focus: A.focus, farField: A.farField, beam: A.beam, feed: A.feed, round: A.round, eng: A.eng };
    },
    byName(name) { return project.elements.find(e => e.name === name); },
    stats(name) { const el = this.byName(name); return el ? screenStats(el) : null; },
    metric(name, key) { return metricRaw(this.byName(name), key); },
    paraxial(name, nm) { return paraxial(this.byName(name), nm); },
    typeLabel(name) { return typeLabel(this.byName(name)); },
    setParam(name, path, v) { setParam(this.byName(name), path, v); },
    getParam(name, path) { return getPath(this.byName(name), path); },
    diffraction(name) { const el = this.byName(name); return el ? diffraction(el) : null; },
    asmPrescription(name) { const a = assemblies().find(x => x.name === name); return a ? JSON.parse(JSON.stringify(asmPrescription(a))) : null; },
    // (the lens engine's first order: it follows folds and mirrored faces, which the bench's paraxial helper does not)
    asmEfl(name) { const a = assemblies().find(x => x.name === name); if (!a) return null; const P = asmPrescription(a), nm = a.cond.waves[a.cond.primary].nm; return P.folded ? lensSystem(P, nm, {}).par.efl : asmParaxial(P, nm, paraxial).efl; },
    exportZmx(names, nms) { return zmxExport(names.map(n => this.byName(n)), nms || [633]); },
  };
}
