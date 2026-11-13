import { project, typeLabel } from '../state/project.js';
import { normElement, normFibres, serialize } from '../state/elements.js';
import { lastTrace, paraxial, setLastTraceKey, sourceLines, subFrame, traceScene } from '../engines/trace.js';
import { elementSurfaces } from '../core/stl.js';
import { sagFn } from '../core/geometry.js';
import { bendDbPerTurn } from '../core/bend.js';
import { frame, toLocal, toWorld } from '../core/mask.js';
import { onTab } from '../state/tabs.js';
import { getPath, setParam } from '../state/params.js';
import { detectorReading, faceArrivals } from '../engines/fibre-face.js';
import { linkBudget, rfSweep } from '../engines/rf-sweep.js';
import { antennaNow } from '../engines/antenna-field.js';
import { metricRaw } from './optimise.js';
import { diffraction, viaCavity } from '../engines/pd-cavity.js';
import { screenStats } from '../engines/screen-stats.js';
import { scatterCached, scatterNow, scatterPlain, scatterPrep } from '../engines/scatter.js';
import { mieCoeffs, mieQ, mieS } from '../core/mie.js';
import { zmxExport } from '../io/zmx-export.js';
import { asmParaxial, asmPrescription, assemblies } from '../core/assembly.js';
import { lensSystem } from '../engines/lens-engine.js';

/* ---------- The calls a script is given, as window.JEKray has them ----------
   The part of window.JEKray (ui/boot.js) that Tools › Scripts hands a script as J (ui/scripts.js CALLS), kept here so the
   script worker (page/script-worker.js) makes the same calls over its own copy of the bench: the same code, the same
   answers. Each reads only the bench and the engines; none needs the page. The page-only ones (load, select, showTab,
   sweepPlay, sweepPause) stay in boot.js, and the worker has its own (page/script-worker.js workerCalls). */
/* The traced rays, labelled (J.rays): each drawn run of a ray as it went, with the source it came from (id, name),
   its wavelength, its polarisation (the source's state it was launched as, and its s share at the end), its power
   (w, as a share of the launch: 1 a whole ray, 0.5 each of an unpolarised ray's s and p), the points it went
   through, the parts it met at them in order (bounces), its direction at the end, and the events along it (ev:
   r reflect, t transmit, and so on, each with its bounce). Runs one ray's brightness split are joined again. */
function surfsOnTab() {
  const out = [];
  for (const el of project.elements) {
    if (!onTab(el) || ['draw', 'elec', 'fcomp', 'pic', 'source'].includes(el.type)) continue;
    let S = [];
    try { S = elementSurfaces(el); } catch (err) { S = []; }
    const f = frame(el);
    for (const q of S) if (q) { q.f = q.lf ? subFrame(f, q.lf) : f; out.push({ el, q }); }
  }
  return out;
}
function partAt(surfs, x, y) {
  let best = null, bd = 1e-3;
  for (const { el, q } of surfs) {
    const [lx, ly] = toLocal(q.f, x, y);
    if (Math.abs(ly) > (q.semi || 0) + 1e-6) continue;
    let sag = 0;
    try { sag = sagFn(q, ly) || 0; } catch (err) { sag = 0; }
    const d = Math.abs(lx - sag);
    if (d < bd) { bd = d; best = el; }
  }
  return best;
}
export function labelledRays() {
  traceScene();
  const surfs = surfsOnTab(), byId = new Map(project.elements.map(e => [e.id, e])), out = [];
  for (const r of lastTrace.rays || []) {
    const prev = out[out.length - 1], n = r.pts.length;
    // a ray's brightness changing splits its drawing: joined again where one run starts where the last ended
    if (prev && prev.rid === r.rid && prev.fam === r.fam && prev.pts.length && Math.abs(prev.pts[prev.pts.length - 2] - r.pts[0]) < 1e-9 && Math.abs(prev.pts[prev.pts.length - 1] - r.pts[1]) < 1e-9) {
      for (let i = 2; i < n; i++) prev.pts.push(r.pts[i]);
      prev.w = r.w; prev.J = r.J; prev.ev = r.ev;
      continue;
    }
    out.push({ rid: r.rid, fam: r.fam, src: r.src, bench: r.bench, colour: r.colour, w0: r.w, w: r.w, J: r.J, ev: r.ev, pts: Array.from(r.pts) });
  }
  return out.map((r, i) => {
    const src = byId.get(r.src), parts = String(r.rid || '').split(':'), wi = +parts[parts.length - 2], lines = src ? sourceLines(src) : [];
    const pts = [];
    for (let k = 0; k < r.pts.length; k += 2) pts.push([r.pts[k], r.pts[k + 1]]);
    const met = [];
    for (let k = 1; k < pts.length; k++) { const el = partAt(surfs, pts[k][0], pts[k][1]); if (el && (!met.length || met[met.length - 1] !== el.name || k === pts.length - 1)) met.push(el.name); }
    const a = pts[pts.length - 2], b = pts[pts.length - 1], L = a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0;
    const J = r.J || [0, 0, 0, 0], ws = J[0] * J[0] + J[1] * J[1], wt = ws + J[2] * J[2] + J[3] * J[3];
    // the launch state: an unpolarised source's rays go as two (its fam's last figure), each half the power
    const st = /(\d+)$/.exec(String(r.fam || '')), fam = st ? +st[1] : 0;
    return { i, source: r.src, sourceName: src ? src.name : '', nm: isFinite(wi) && lines[wi] !== undefined ? lines[wi] : null, state: fam,
      pol: src && src.pol === 'unpolarised' ? (fam === 0 ? 's' : 'p') : src ? src.pol : '', sShare: wt > 0 ? ws / wt : null,
      w: r.w, w0: r.w0, colour: r.colour, points: pts, met, bounces: met.length, dir: L > 0 ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : null,
      angle: L > 0 ? Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI : null, ev: r.ev || '', bench: r.bench };
  });
}
/* the nearest any traced ray comes to a point (J.distance): { d mm, x, y where on the ray, ray: its index in J.rays() };
   the point { x, y }, or a part's name (its centre); only one source's rays if asked (opts.source, a name or id) */
export function rayDistance(at, opts = {}) {
  const P = typeof at === 'string' ? project.elements.find(e => e.name === at) : at;
  if (!P || !isFinite(P.x) || !isFinite(P.y)) throw new Error('J.distance needs a point { x, y } or a part\u2019s name');
  const R = labelledRays(), want = opts.source ? project.elements.find(e => e.name === opts.source || e.id === opts.source) : null;
  let best = null;
  for (const r of R) {
    if (want && r.source !== want.id) continue;
    for (let k = 1; k < r.points.length; k++) {
      const [ax, ay] = r.points[k - 1], [bx, by] = r.points[k], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((P.x - ax) * dx + (P.y - ay) * dy) / l2)) : 0, x = ax + t * dx, y = ay + t * dy, d = Math.hypot(P.x - x, P.y - y);
      if (!best || d < best.d) best = { d, x, y, ray: r.i };
    }
  }
  return best;
}
export function scriptCalls() {
  return {
    rays() { return labelledRays(); },
    /* a part's fields changed as a file would give them (checked and filled in as J.load does), then traced:
       J.set('Lens', { x: 20, diameter: 25 }); its id, type and tab stay as they were */
    set(name, props) {
      const el = typeof name === 'string' ? this.byName(name) : name;
      if (!el) throw new Error('No part called ' + name);
      const keep = { id: el.id, type: el.type, bench: el.bench }, next = normElement(Object.assign(JSON.parse(JSON.stringify(el)), props || {}, keep));
      for (const k of Object.keys(el)) delete el[k];
      Object.assign(el, next, keep);
      setLastTraceKey(null); traceScene();
      return el;
    },
    /* a fibre, wire or waveguide changed (by its id, or its place in J.project().fibres), checked as J.load does:
       its path's nodes may be { x, y } (handles left out are none) */
    setFibre(which, props) {
      const list = project.fibres || [], i = typeof which === 'number' ? which : list.findIndex(F => F.id === which);
      if (!(i >= 0 && i < list.length)) throw new Error('No fibre ' + which);
      const F = Object.assign(JSON.parse(JSON.stringify(list[i])), props || {}), [N] = normFibres([F], project.elements);
      if (!N) throw new Error('That fibre cannot be joined as given');
      list[i] = N;
      setLastTraceKey(null); traceScene();
      return N;
    },
    distance(at, opts) { return rayDistance(at, opts); },
    // the rays on a screen: y across it as the screen reads it (its own axis, so it turns over with the screen), bx, by on the bench
    hitsOn(name) { const el = this.byName(name), f = frame(el); return ((lastTrace.screens && lastTrace.screens[el.id]) || []).map(t => { const o = Object.fromEntries(Object.entries(t).filter(([k, v]) => typeof v === 'number' || typeof v === 'boolean' || k === 'path')); const [bx, by] = toWorld(f, 0, t.y); return Object.assign(o, { bx, by }); }); },
    // dB lost in one turn of standard single-mode fibre round a radius (mm) at a wavelength (nm): Marcuse's formula, core/bend.js
    bendDbPerTurn(Rmm, nm) { return bendDbPerTurn(+Rmm, +nm); },
    serialize() { return serialize(); },
    trace() { setLastTraceKey(null); traceScene(); },
    benches() { return project.benches.map(b => ({ id: b.id, name: b.name, on: b.id === project.tab })); },
    arrivals(name) { return faceArrivals(this.byName(name)).map(A => ({ qx: A.qx, qy: A.qy, u0: A.u0, ldx: A.ldx, ldy: A.ldy, J: A.J, coh: A.coh, opl: A.opl, fo: A.fo })); },
    // a receiving horn against frequency, and its link budget (RF)
    rfSweep(name) { return rfSweep(this.byName(name)); },
    linkBudget(name) { return linkBudget(this.byName(name)); },
    detector(name) { const el = this.byName(name), r = detectorReading(el); return { mw: r.mw, X: r.X, Y: r.Y, scattered: r.scat ? { mw: r.scat.mw, interference: r.scat.cross } : null, field: r.field, pending: r.pending, via: viaCavity(el), V: r.V, snr: r.snr, ifMw: r.ifMw, mds: r.mds, rf: r.rf ? { eff: r.rf.eff, inMw: r.rf.inMw, mw: r.rf.mw, lines: r.rf.lines } : null }; },
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
    /* the light a screen's particle scatters (its Scattering tab), worked out now: the model used, the cross-sections
       (m²), efficiencies and asymmetry, the powers in the light as it is (W), the shares forward, back and collected,
       the pattern on its two cuts and over the sphere (W/sr) and the far field's amplitude; null where the screen has
       no particle or no beam. opts: { nMax, tol, maxIter } for a dipole array */
    /* Lorenz-Mie for a sphere of size parameter x = k a and relative index mr + i mi: Qext, Qsca, Qabs, Qback, g, and S
       (each [S1 re, S1 im, S2 re, S2 im]) at the angles given (degrees), as Bohren and Huffman write them */
    mie(x, mr, mi, angles) { const C = mieCoeffs(+x, +mr, +mi || 0); return Object.assign(mieQ(C), { terms: C.n, S: (angles || []).map(a => mieS(C, Math.cos(a * Math.PI / 180))) }); },
    scatter(name, opts) { traceScene(); const el = this.byName(name); if (!el) throw new Error('No part called ' + name); const S = (!opts && scatterCached(el)) || scatterNow(el, opts); return S ? scatterPlain(S) : null; },
    /* where a Particle part's scattered light goes on the bench: its scattered power (W), a row for each part that catches some
       ({ name, share of the scattered power, P in W, followed: traced on as rays }), and what no part catches (lost, lostShare).
       state: "ok", or "dark" (no light reaches the particle); null for a part that is not a Particle or has its light off */
    scattered(name) {
      const el = this.byName(name); if (!el) throw new Error('No part called ' + name);
      if (el.type !== 'particle' || el.scatLight === false) return null;
      traceScene();
      if (!scatterCached(el) && scatterPrep(el)) { scatterNow(el); traceScene(); }           // (the page's own trace does not wait for a run: here it is done)
      const R = lastTrace.scat && lastTrace.scat.parts[el.id];
      return R ? { state: R.state, Psca: R.Psca, rows: R.rows.map(r => ({ name: r.name, share: r.share, P: r.P, followed: r.followed, halfDeg: r.halfDeg })), lost: R.lost, lostShare: R.lostShare } : null;
    },
    asmPrescription(name) { const a = assemblies().find(x => x.name === name); return a ? JSON.parse(JSON.stringify(asmPrescription(a))) : null; },
    // (the lens engine's first order: it follows folds and mirrored faces, which the bench's paraxial helper does not)
    asmEfl(name) { const a = assemblies().find(x => x.name === name); if (!a) return null; const P = asmPrescription(a), nm = a.cond.waves[a.cond.primary].nm; return P.folded ? lensSystem(P, nm, {}).par.efl : asmParaxial(P, nm, paraxial).efl; },
    exportZmx(names, nms) { return zmxExport(names.map(n => this.byName(n)), nms || [633]); },
  };
}
