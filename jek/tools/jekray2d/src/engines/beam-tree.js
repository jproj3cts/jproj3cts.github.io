import { C_MM, JONES_TYPES, MODS } from '../core/modulators.js';
import { cohGamma, cohModes, lagOf, splitRoot } from '../core/coherence.js';
import { m2Of } from '../core/pulses.js';
import { cavLine, isHigherMode, srcModes } from '../core/beams-hom.js';
import { allSources, getEl, lightOf } from '../state/elements.js';
import { popMaskRound } from '../core/mask.js';
import { zOf } from './trace.js';
import { V } from '../ui/render.js';
import { clamp } from '../ui/params.js';
import { h, vs } from '../ui/panel.js';
import { popGaussian, popLeg, popStats, popSurface, popW } from './field.js';
import { cavDot, cavLS, cavLin, cavLoops, cavMiss, cavRunCache, cavSolved, cavSteady, cavWeights, cx, cz } from './cavity.js';
import { field2Vector, popGaussian2, popLeg2, popStats2, popSurface2 } from './field2d.js';
import { popSlices } from './volume.js';
import { fanShape, popFan2, popFanRound } from './diffraction.js';
// Shared mutable state read or set here, not yet imported (see state/shared.md): W, lastTrace, project

/* ---------- The beam tree as diffracted fields ----------
   The beam-parameter ray leaves a tree of segments: each starts at a surface (or the
   source) and knows its parent, so splitters and cavity round trips give branches.
   Each branch carries its own field; where branches of one launch meet they add as fields. */
export const POP_ROWS = 192;              // rows across a drawn slice: enough to show edge fringes
export const POP_SLICES = 1800;           // slices drawn over the whole scene
export const POP_MAX_SEGS = 300;
export const popState = { key: '', result: null, timer: null, job: null };

export const popSources = () => lightOf().field ? allSources().filter(e => e.gauss) : [];
/* The element a beam's surface belongs to, for the keys that say whether a field must be
   worked out again: the tracer's description of the surface leaves out what only the field
   sees (a mask's formula, a coating), so the element's own settings go in with it */
const evElement = ev => ev && ev.el ? getEl(ev.el) || null : null;
/* the element as the field sees it: how it is swept (or whether the 3D view draws it) is not part of it, so a sweep's rate or range can change and the field worked out for it still holds */
const evElementKey = ev => { const e = evElement(ev); if (!e || !(e.sweeps || e.hide3d || e.mod)) return e; const { sweeps, hide3d, ...rest } = e; return e.mod ? Object.assign(rest, { modRev: MODS.rev }) : rest; };   // a mod's part: as its results stand
// asked for several times a frame: the beams part once per trace
let popKeyMemo = { beams: null, cfg: '', key: '' };
export function popKeyOf(beams, srcs) {
  const ids = new Set(srcs.map(e => e.id));
  const cfg = JSON.stringify(srcs.map(e => [e.id, e.popN, lightOf().scale, e.coh, e.lineshape, m2Of(e), splitRoot(e).id, lagOf(e), isHigherMode(e) ? [e.tem, e.hm, e.hn, e.lp, e.ll] : 0]));
  if (popKeyMemo.beams === beams && popKeyMemo.cfg === cfg) return popKeyMemo.key;
  const key = '[' + cfg + ',' + JSON.stringify(beams.filter(b => ids.has(b.src)).map(b =>
    [b.parent, b.x0, b.y0, b.dx, b.dy, b.len, b.qr, b.qi, b.n, b.nm, b.w, b.colour, b.ev, b.J, b.coh, evElementKey(b.ev), b.z0, b.uz, b.len3, b.d3])) + ']';
  popKeyMemo = { beams, cfg, key };
  return key;
}

/* Clear radius a surface offers the beam: its semi-aperture less the decentre, seen
   along the beam, so a tilted face offers its projection */
export const popClear = ev => {
  if (ev && ev.mask) {
    const M = ev.mask;
    if (M.shape === 'knife' || M.shape === 'disc') return Infinity;
    return M.a * ev.cth;                               // the opening's own size sets the sampling
  }
  // a beam's part that meets an element its reference ray is carried past the rim of: the
  // light is all to one side, and the grid is sized by the light itself
  if (ev && ev.semi > 0 && Math.abs(ev.ly) >= ev.semi) return Infinity;
  return (ev && ev.semi > 0) ? Math.max(0, ev.semi - Math.abs(ev.ly)) * ev.cth : Infinity;
};

/* Does the beam stay round through this surface? Centred on it, square to it where it is
   curved, no anamorphic stretch, and not an off-axis segment of a larger surface. */
export function popRoundEv(ev) {
  if (!ev) return true;
  // off the plane: a part met above or below its centre, tipped or rolled, or a beam that rises
  if (ev.surf && ev.surf.tilt) return false;
  if (ev.hz !== undefined && ev.surf && ev.surf.el && Math.abs(ev.hz - zOf(ev.surf.el)) > 1e-9) return false;
  if ((ev.din3 && ev.din3[2]) || (ev.dout3 && ev.dout3[2])) return false;
  if (ev.mask) {
    const M = ev.mask;
    if (M.shape !== 'round' && M.shape !== 'disc') return false;
    if (Math.abs(ev.ly - M.o) > 1e-9 * Math.max(1, M.a)) return false;
    return Math.abs(ev.cth - 1) < 1e-9;
  }
  if (ev.surf && ev.surf.maskFn && !popMaskRound(ev)) return false;
  if (Math.abs(ev.A - 1) > 1e-9) return false;
  if (Math.abs(ev.ly) > 1e-9 * Math.max(1, ev.semi)) return false;
  const s = ev.surf;
  if (s && s.y0) return false;
  if (s && s.cyl) return false;                 // a cylinder focuses one way only
  if (s && !s.flat && ev.mode !== 'P' && Math.abs(ev.cth - 1) > 1e-9) return false;
  return true;
}
export const POP_MAX_SEGS_2D = 60;

/* The field run, as a generator so the page can do it a slice at a time between frames */
/* ---------- Steps kept between runs ----------
   A field run is a tree of pure steps: a segment's field carried to its end, then through
   the next surface. Each is kept, keyed by everything on the path to it (the source and its
   launch, then each segment and surface as the tracer describes them), so after an edit the
   steps before the change are taken from here and only those after it are worked out again.
   Least recently used go first past a memory budget. A cavity's steady state has its own
   store, per trace; what comes after one is worked out each time. */
const POP_STEP_BUDGET = 128 * 2 ** 20;                       // bytes of field arrays
export const popStepCache = { map: new Map(), bytes: 0, hits: 0, misses: 0 };
const fieldBytes = F => F ? ['re', 'im', 're2', 'im2'].reduce((a, k) => a + (F[k] ? F[k].byteLength : 0), 0) : 0;
function stepGet(k) {
  const m = popStepCache.map, e = m.get(k);
  if (!e) { popStepCache.misses++; return undefined; }
  m.delete(k); m.set(k, e); popStepCache.hits++;
  return e.v;
}
function stepSet(k, v, F) {
  const b = fieldBytes(F), C = popStepCache;
  if (b > POP_STEP_BUDGET / 4) return;
  const old = C.map.get(k);
  if (old) { C.bytes -= old.b; C.map.delete(k); }
  C.map.set(k, { v, b }); C.bytes += b;
  for (const [k2, e] of C.map) { if (C.bytes <= POP_STEP_BUDGET) break; C.map.delete(k2); C.bytes -= e.b; }
}
/* a short key for a long description: two 32-bit hashes of it */
function stepHash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + '.' + (h1 >>> 0).toString(36) + '.' + str.length.toString(36);
}
/* a beam as far as its field's steps depend on it */
const stepDesc = b => [b.x0, b.y0, b.dx, b.dy, b.len, b.qr, b.qi, b.n, b.nm, b.w, b.ev, evElement(b.ev), b.J, b.coh, b.par, b.fo, !!b.fan, b.len3, b.d3, b.z0, b.uz];
const stepJSON = v => { try { return JSON.stringify(v); } catch (err) { return null; } };

/* A leg of the field, its positions taken along the bench (t to the segment's len) but its light
   carried along the ray in 3D (to len3): a leg that rises is longer than its run across the bench,
   and one straight up (a periscope's) has no run at all, its end its whole length */
export function legAlong(leg, b) {
  if (!(b.len3 > 0) || b.len3 === b.len) return leg;
  const map = b.len > 1e-12 ? t => t * b.len3 / b.len : t => (t > 0 ? b.len3 : 0), w = Object.create(leg);
  w.at = t => leg.at(map(t)); w.cutC = t => leg.cutC(map(t));
  return w;
}
export function popRun(beams, srcs, opts = {}) {
  const g = popRunGen(beams, srcs, opts);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}
export function* popRunGen(beams, srcs, opts = {}) {
  let busy = 0, t0 = performance.now();
  const bySrc = new Map(srcs.map(e => [e.id, e]));
  const kids = new Map();
  const why = new Map();                     // source id -> elements that make its beam not round
  beams.forEach((b, i) => {
    if (!bySrc.has(b.src) || (opts.keep && !opts.keep.has(i))) return;
    if (!kids.has(b.parent)) kids.set(b.parent, []);
    kids.get(b.parent).push(i);
    if (!popRoundEv(b.ev)) { if (!why.has(b.src)) why.set(b.src, new Set()); why.get(b.src).add(b.ev.el); }
  });
  // a beam of M^2 above 1 is a sum of Hermite-Gauss modes, which are not round; so is a higher-order mode
  // and a loop whose pilot misses itself (a mirror tilted or tipped off its axis) walks the light off it
  if (!opts.noCavity) for (const L of cavLoops(beams)) {
    const B0 = beams[L.path[L.s]], m = cavMiss(B0, beams[L.path[L.s + L.p]]);
    if (B0 && bySrc.has(B0.src) && m && m.size > 1e-9) { if (!why.has(B0.src)) why.set(B0.src, new Set()); why.get(B0.src).add(B0.ev && B0.ev.el); }
  }
  const engine = new Map(srcs.map(e => [e.id, (e.popModel === '2d' || why.has(e.id) || m2Of(e) > 1 || isHigherMode(e)) ? '2d' : 'round']));
  const segs = [], notes = { clipped: new Set(), steep: new Set(), coarse: new Set(), why, engine };
  // one root per launch, or per mode of a launch for a beam of M^2 above 1: the modes add as
  // powers, so each runs through the tree on its own and counts as a launch of its own
  // (the strongest mode is taken first, so a cavity's lock is its to set)
  const todo = (kids.get(-1) || []).flatMap(i => srcModes(bySrc.get(beams[i].src)).map((md, k) =>
    ({ i, F: null, root: beams[i].w || 1, repr: 1, mode: k, mn: md })).reverse());
  const lockOf = new Map();
  const count = { round: 0, '2d': 0 };
  let truncated = false;
  // Cavities: each loop's first pass carries its steady state; the tracer's unrolled
  // repeats of it (and all that branches from them) are already in that sum, so are skipped
  const loops = opts.noCavity ? [] : cavLoops(beams).filter(L => bySrc.has(beams[L.path[0]].src));
  const loopAt = new Map(), repeats = new Set(), entries = new Set();
  for (const L of loops) {
    loopAt.set(L.path[L.s], L);
    // the light entering a loop leaves it too, a little, on its first pass: those branches
    // add to the built-up leaks as fields, so they are kept however weak one pass makes them
    if (L.s >= 1) entries.add(L.path[L.s - 1]);
    // and what leaks out of the loop's own segments joins them, however little that is
    for (let j = 0; j < L.p; j++) entries.add(L.path[L.s + j]);
    const stack = [L.path[L.s + L.p]];
    while (stack.length) { const i = stack.pop(); if (i === undefined || repeats.has(i)) continue; repeats.add(i); for (const c of (L.kids.get(i) || [])) stack.push(c); }
  }
  notes.cavities = [];
  while (todo.length) {
    const job = todo.pop();
    if (repeats.has(job.i)) continue;
    const b = beams[job.i], src = bySrc.get(b.src), eng = engine.get(b.src);
    if (count[eng] >= (eng === '2d' ? POP_MAX_SEGS_2D : POP_MAX_SEGS)) { truncated = true; continue; }
    count[eng]++;
    const lam0 = b.nm * 1e-6, q = [b.qr, b.qi];
    let F0 = job.F;
    if (!F0 && b.fan) {
      const shape = fanShape(src, b.nm);
      F0 = eng === '2d' ? popFan2(src.popN, q, b.n, lam0, 1, shape) : popFanRound(src.popN, q, b.n, lam0, 1, shape);
    } else if (!F0) F0 = eng === '2d' ? popGaussian2(src.popN, q, q, b.n, lam0, job.mn ? job.mn.w : 1, job.mn ? job.mn.c : null) : popGaussian(src.popN, q, b.n, lam0, 1);
    // on the 2D engine the field carries its polarisation at every point from the start
    if (!job.F && eng === '2d') F0 = field2Vector(F0, b.J);
    // this field's key for the steps kept between runs: from its launch, or handed down
    if (!job.F) {
      const d = stepJSON([eng, src, stepDesc(b), job.mode || 0, job.mn || null, project.library || null]);
      job.fk = d === null ? null : stepHash('root|' + d);
    }
    if (job.F && loopAt.has(job.i) && job.decision) {
      const L = loopAt.get(job.i), key = L.canon + '|' + L.path[0] + '|' + (opts.paraxial ? 'p' : '') + '|' + eng + (job.mode ? '|m' + job.mode : '') + (b.fo ? '|f' + b.fo : '');
      let store = cavRunCache.get(lastTrace); if (!store) { store = new Map(); cavRunCache.set(lastTrace, store); }
      let got = store.get(key);
      // The twin behind a Strehl ratio needs the cavity's build-up, not its every detail: the
      // real solve's complex factor on the injected field, <b, X> / <b, b>, serves it
      const real = opts.paraxial ? store.get(L.canon + '|' + L.path[0] + '||' + eng) : null;
      if (!got && real && real.bRef) {
        const w = cavWeights(real.bRef), A0 = cavDot(real.bRef, real.X, w), bb = cavDot(real.bRef, real.bRef, w)[0];
        got = { X: cavLin(F0, [[[A0[0] / bb, A0[1] / bb], F0]]), res: null, delta: real.delta, mode: real.mode };
        store.set(key, got);
      }
      if (!got) {
        const res = yield* cavSteady(L, beams, F0, job.decision, eng);
        const mode = (project.cavityLock && project.cavityLock[L.canon]) || 'lock';
        // one laser, one frequency: the higher modes of a beam of M^2 above 1 keep its lock
        const lk = L.canon + '|' + eng + '|' + (opts.paraxial ? 'p' : '');
        // light shifted by f from the laser (a modulator's sideband) is 2 pi f Lopt / c further
        // round in each round trip than the laser itself, locked or not: as the laser would be
        // raised by f, which (the field going as e^{-ikz}) lowers delta
        const LoptF = L.path.slice(L.s, L.s + L.p).reduce((a, i) => a + beams[i].n * beams[i].len, 0);
        const base = mode === 'lock' && res ? ((job.mode || b.fo) && lockOf.has(lk) ? lockOf.get(lk) : res.dLock) : 0;
        const delta = base - (b.fo ? 2 * Math.PI * b.fo * LoptF / C_MM : 0);
        if (!job.mode && !b.fo) lockOf.set(lk, delta);
        let X = F0, Xinc = null;
        if (res) {
          const y = cavLS(res.H, res.m, res.beta, [Math.cos(delta), Math.sin(delta)]);
          X = cavLin(F0, y.map((c, k) => [c, res.Q[k]]));
          // A laser with a line of its own. Round trip n is n Lopt longer than the light let in,
          // so it adds to the rest weighted by gamma(n Lopt) = gamma(Lopt)^n (exact for a
          // Lorentzian line, right to first order for a Gaussian): the mean field is the solve
          // with the round trip damped by gamma(Lopt). It carries on as the launch itself,
          // interfering with the prompt reflection; what the line's average power holds beyond
          // it carries on as light of its own that interferes with nothing.
          const Lopt = L.path.slice(L.s, L.s + L.p).reduce((a, i) => a + beams[i].n * beams[i].len, 0);
          const line = cavLine(res, Lopt, src), P = res.at(delta).P;
          if (line && P > 0) {
            const g1 = cohGamma(src)(Lopt), pw = F => (eng === '2d' ? popStats2(F) : popStats(F)).power;
            const ym = cavLS(res.H, res.m, res.beta, [g1 * Math.cos(delta), g1 * Math.sin(delta)]);
            const Xm = cavLin(F0, ym.map((c, k) => [c, res.Q[k]]));
            const rest = line.avg(delta) - P * pw(Xm) / Math.max(1e-300, pw(X));
            Xinc = rest > 1e-9 * P ? cavLin(X, [[[Math.sqrt(rest / P), 0], X]]) : null;
            X = Xm;
          }
        }
        got = { X, Xinc, res, delta, mode, bRef: F0 };
        store.set(key, got);
        if (!opts.paraxial && !job.mode && !b.fo) cavSolved.set(L.canon, Object.assign({ eng, trace: lastTrace, others: [] }, got));
        else if (b.fo) { /* a sideband's solve: not the laser's own, so not for the card */ }
        else if (!opts.paraxial && res) {         // the other modes' solves, for the readouts
          const S = cavSolved.get(L.canon);
          if (S && S.trace === lastTrace) S.others.push({ res, delta });
        }
      }
      // what the steady state holds against the injected light: a branch leaking out of the
      // loop is judged by that built-up power, not by one pass's
      const pw = F => (eng === '2d' ? popStats2(F) : popStats(F)).power;
      job.boost = (job.boost || 1) * Math.max(1, pw(got.X) / Math.max(1e-300, pw(F0)));
      F0 = got.X;
      // The detuning is a hair's change of length, carried by this leg: light crossing it
      // gains delta each round trip, the leak back through the input coupler included, so
      // the prompt reflection and the leak meet with the right phase
      job.cavPhase = got.delta;
      job.fk = null;                                         // a cavity's solve is not kept here
      // the part of a broad laser line's build-up that coheres with nothing: on its own
      if (got.Xinc && !opts.paraxial) todo.push(Object.assign({}, job, { F: got.Xinc, decision: null, tag: (job.tag || '') + '#i' }));
      notes.cavities.push(L.canon);
    }
    const leg = legAlong(eng === '2d' ? popLeg2(F0) : popLeg(F0), b);
    const repr = job.F ? job.repr : (F0.repr || 1);
    const sg = { i: job.i, b, src, eng, F0, leg, root: job.root, clipped: !!job.clipped, repr, boost: job.boost || 1,
      mode: job.mode || 0, coh: b.coh + (job.mode ? '#m' + job.mode : '') + (job.tag || '') };
    segs.push(sg);
    busy += performance.now() - t0; yield; t0 = performance.now();
    // weaker branches go first when the budget runs short: the stack is last in, first out
    // Branches the tracer says carry nothing are dropped, except, on the 2D engine, after a
    // waveplate or polariser: the tracer's Jones vector speaks for the beam's centre only, and a
    // vector field can carry light off-centre that the centre lacks (a lens between crossed
    // polarisers leaks at its edges). Those are judged by their field instead, below.
    const polEl = c => { const e = beams[c].ev; return e && e.mode === 'P' && e.surf && e.surf.el && (JONES_TYPES.has(e.surf.el.type) || !!e.jm); };
    const ch = (kids.get(job.i) || []).filter(c => entries.has(job.i) || beams[c].w * (job.boost || 1) >= (eng === '2d' ? 1e-3 : 1e-4) * job.root || (eng === '2d' && polEl(c)))
      .sort((a, c) => beams[a].w - beams[c].w);
    if (!ch.length) continue;
    const endKey = job.fk ? stepHash(job.fk + '|end|' + b.len + '|' + (b.len3 || '')) : null;
    let Fend = endKey ? stepGet(endKey) : undefined;
    if (!Fend) { Fend = leg.at(b.len); if (endKey) stepSet(endKey, Fend, Fend); }
    if (job.cavPhase) Fend = cavLin(Fend, [[[Math.cos(job.cavPhase), Math.sin(job.cavPhase)], Fend]]);
    for (const c of ch) {
      const cb = beams[c], ev = cb.ev || { A: 1, C: 0, D: 1, n2: b.n };
      const gain = 1;          // the field keeps unit power; each segment's Jones vector carries its amplitude
      const sd = endKey ? stepJSON([stepDesc(cb), opts.paraxial ? 1 : 0, b.J, b.par, eng]) : null;
      const outKey = sd === null ? null : stepHash(endKey + '|surf|' + sd);
      let out = outKey ? stepGet(outKey) : undefined;
      if (!out) {
        if (eng === '2d') out = cb.ev ? popSurface2(Fend, cb.ev, gain, opts.paraxial, cb.len, { Jin: b.J, Jout: cb.J, parIn: b.par, parOut: cb.par }) : { field: Fend, clipped: false };
        else out = popSurface(Fend, [Fend.z, Fend.zR], { A: ev.A, C: ev.C, D: ev.D, n2: ev.n2, a: popClear(cb.ev), gain, raw: cb.ev, paraxial: opts.paraxial, tNext: cb.len,
          disc: cb.ev && cb.ev.mask && cb.ev.mask.shape === 'disc' ? cb.ev.mask.a : null });
        if (outKey) stepSet(outKey, out, out.field);
      }
      if (out.clipped && ev.el) notes.clipped.add(ev.el);
      if (out.steep && ev.el) notes.steep.add(ev.el);
      if (out.coarse && ev.el) notes.coarse.add(ev.el);
      if (out.polErr) notes.polErr = Math.max(notes.polErr || 0, out.polErr);
      if (eng === '2d' && polEl(c) && beams[c].w < 1e-3 * job.root && popStats2(out.field).power < 1e-12 * job.root) continue;
      todo.push({ i: c, F: out.field, fk: outKey, root: job.root, clipped: out.clipped, repr: sg.repr, decision: out.decision, boost: job.boost, mode: job.mode, mn: job.mn, tag: job.tag });
    }
  }
  if (opts.draw) {
    // branches that run together add as fields, so they are drawn as one
    for (const item of popGroups(segs)) { popSlices([item], opts.per); busy += performance.now() - t0; yield; t0 = performance.now(); }
  }
  busy += performance.now() - t0;
  return { segs, notes, truncated, ms: busy };
}


/* ---------- Where branches meet: fields that add ----------
   Branches of one beam tree share a source, a wavelength and a polarisation launch, so
   where they overlap their fields add. A branch's field is its spatial profile, which has
   unit power and every propagation phase in it, times its Jones vector from the tracer,
   which carries each reflection and transmission with its phase. The tracer works in
   e^{+ikL} and the field in e^{-ikz}, so the Jones vector enters conjugated. */
export const popJ = b => { const g = b.par ? -1 : 1; return [b.J[0], -b.J[1], g * b.J[2], -g * b.J[3]]; };   // conjugated s and p, p with its parity
const popWJ = b => b.J[0] ** 2 + b.J[1] ** 2 + b.J[2] ** 2 + b.J[3] ** 2;
/* A 2D segment's field already holds its polarisation and amplitude; a round one's holds a
   profile of unit power, and its Jones vector is applied when fields are added */
const segVec = sg => !!(sg && sg.F0 && sg.F0.re2);
export const segW = sg => segVec(sg) ? 1 : popWJ(sg.b);
/* A cut's value at x as [s re, s im, p re, p im] with p's parity sign, from its own two
   components or from its scalar profile and a Jones vector */
export function cutVec(c, x, J, par) {
  const [er, ei] = popCutAt(c, x);
  if (!c.re2) { const [a, b, c2, d] = J; return [er * a - ei * b, er * b + ei * a, er * c2 - ei * d, er * d + ei * c2]; }
  const [pr, pi] = popCutAt({ x: c.x, re: c.re2, im: c.im2, sym: c.sym, b: c.b }, x), g = par ? -1 : 1;
  return [er, ei, g * pr, g * pi];
}
const POP_GROUP_ANGLE = 0.02;                                 // rad: beams closer than this in direction may overlap

/* Branches that run together on the bench: same tree, nearly the same direction, and
   starting close enough, side to side and along, to overlap */
export function popGroups(segs) {
  const n = segs.length, parent = segs.map((_, i) => i);
  const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const wAt = sg => sg.eng === '2d' ? Math.max(popW(sg.F0.ax.z, sg.F0.ax.zR, sg.F0.lam0 / sg.F0.n), popW(sg.F0.ay.z, sg.F0.ay.zR, sg.F0.lam0 / sg.F0.n))
    : popW(sg.F0.z, sg.F0.zR, sg.F0.lam0 / sg.F0.n);
  const w = segs.map(wAt);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = segs[i].b, b = segs[j].b;
    if (segs[i].coh !== segs[j].coh || a.bench !== b.bench) continue;
    if (a.dx * b.dx + a.dy * b.dy < Math.cos(POP_GROUP_ANGLE)) continue;
    const ox = b.x0 - a.x0, oy = b.y0 - a.y0;
    const side = Math.abs(-a.dy * ox + a.dx * oy), along = Math.abs(a.dx * ox + a.dy * oy);
    if (side > 2 * (w[i] + w[j]) + 1e-6) continue;
    if (along > Math.max(1, 0.05 * Math.min(a.len, b.len))) continue;
    parent[find(i)] = find(j);
  }
  const groups = new Map();
  segs.forEach((sg, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(sg); });
  return [...groups.values()].map(members => ({
    members, lead: members.reduce((x, y) => popWJ(y.b) > popWJ(x.b) ? y : x),     // the tracer's power, either engine
  }));
}

/* A complex cut's value at x: its residual interpolated, and its reference put back exactly */
function popCutAt(c, x) {
  const xs = c.x, n = xs.length, q = c.sym ? Math.abs(x) : x;
  let ur = 0, ui = 0;
  if (q <= xs[0]) { if (c.sym) { ur = c.re[0]; ui = c.im[0]; } else return [0, 0]; }
  else if (q < xs[n - 1]) {
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= q) lo = mid; else hi = mid; }
    const t = (q - xs[lo]) / (xs[hi] - xs[lo]);
    ur = c.re[lo] + (c.re[hi] - c.re[lo]) * t; ui = c.im[lo] + (c.im[hi] - c.im[lo]) * t;
  } else return [0, 0];
  const ph = c.b * x * x, cs = Math.cos(ph), sn = Math.sin(ph);
  return [ur * cs - ui * sn, ur * sn + ui * cs];
}

/* Half-width of a complex cut that holds 99.5% of its light, about its middle (a round
   field's cut is its radius), found between samples */
function popCutExtent(c) {
  const xs = c.x, n = xs.length, I = i => c.re[i] ** 2 + c.im[i] ** 2 + (c.re2 ? c.re2[i] ** 2 + c.im2[i] ** 2 : 0);
  let tot = 0;
  for (let i = 0; i < n; i++) tot += I(i);
  if (!(tot > 0)) return 0;
  if (c.sym) {
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const v = I(i);
      if (acc + v >= 0.995 * tot) return Math.abs(xs[i - 1 >= 0 ? i - 1 : 0] + (xs[i] - xs[i - 1 >= 0 ? i - 1 : 0]) * (0.995 * tot - acc) / (v || 1));
      acc += v;
    }
    return Math.abs(xs[n - 1]);
  }
  const m0 = n >> 1, dx = n > 1 ? xs[1] - xs[0] : 0;
  let acc = I(m0);
  for (let m = 1; m < m0; m++) {
    const add = I(m0 - m) + (m0 + m < n ? I(m0 + m) : 0);
    if (acc + add >= 0.995 * tot) return (m - 1 + (0.995 * tot - acc) / (add || 1)) * dx;
    acc += add;
  }
  return m0 * dx;
}

/* The cut through a group at distance t along its lead: every member's field, in the
   lead's frame, with its Jones vector, added. gain is the power the sum carries. */
export function popGroupCut(item, t) {
  const L = item.lead.b, exLx = -L.dy, exLy = L.dx;
  const Px = L.x0 + L.dx * t, Py = L.y0 + L.dy * t;
  const parts = [];
  let Yg = 0, wMax = 0;
  for (const m of item.members) {
    const b = m.b, ox = Px - b.x0, oy = Py - b.y0;
    const tm = ox * b.dx + oy * b.dy;
    if (tm < -1e-9 || tm > b.len + 1e-9) continue;
    const c = m.leg.cutC(clamp(tm, 0, b.len));
    const x0 = -b.dy * ox + b.dx * oy, cx = exLx * -b.dy + exLy * b.dx, cz = exLx * b.dx + exLy * b.dy;
    parts.push({ c, x0, cx, cz, dz: b.dx * L.dx + b.dy * L.dy, J: popJ(b), par: b.par, wJ: popWJ(b) * (m.boost || 1), kn: c.k, L: (b.gpl || 0) + (b.ng || b.n) * tm + lagOf(m.src) });
    // as wide as the light really is: after a mask or an edge the pilot is an embedded
    // Gaussian, narrower than the light by its M, and drawing to its width cut the light off
    Yg = Math.max(Yg, Math.abs(x0) + Math.max(2.5 * c.w, 1.3 * popCutExtent(c))); wMax = Math.max(wMax, c.w);
  }
  const M = 2 * POP_ROWS, x = new Float64Array(M), I = new Float64Array(M);
  if (!parts.length) return { x, I, sym: false, w: 1, half: 1, gain: 0 };
  Yg = Math.min(Yg, Math.max(...parts.map(p => p.c.half)));
  // a laser with a line of its own: the members add as its incoherent parts (cohModes)
  const cm = cohModes(item.lead.src, parts.map(p => p.L)), vs = cm ? parts.map(() => [0, 0, 0, 0]) : null;
  // Two members whose fringes are finer than the drawing resolves add as powers, their average,
  // not as fields: each slice would catch the fringes at a different phase and draw the beam
  // ragged. That is a beam and its return from a mirror (fringes half a wavelength apart along
  // the beam: the close-up shows that standing wave), and light of very different curvature
  // (a returned beam and light that went round a lens: rings a few microns apart). Members
  // whose fringes the rows resolve keep adding as fields, so an interferometer's still show.
  const n = parts.length, dyRow = 2 * Yg / M, along = parts.map(p => p.dz);
  // each member's own phase slope across the rows, from its smooth field a hair either side
  const slope = (p, y) => {
    const h = 1e-3 * dyRow, a = cutVec(p.c, p.x0 + (y - h) * p.cx, p.J, p.par), b = cutVec(p.c, p.x0 + (y + h) * p.cx, p.J, p.par);
    const sa = Math.abs(a[0]) + Math.abs(a[1]) >= Math.abs(a[2]) + Math.abs(a[3]) ? 0 : 2;     // the stronger component
    let d = Math.atan2(b[sa + 1], b[sa]) - Math.atan2(a[sa + 1], a[sa]);
    d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
    return d / (2 * h) - p.kn * p.cz;
  };
  const pairV = n > 1 ? new Float64Array(n * n) : null, W = parts.map(() => [0, 0, 0, 0]);
  let sumC = 0, sumI = 0;
  for (let i = 0; i < M; i++) {
    const y = ((i + 0.5) / M * 2 - 1) * Yg;
    x[i] = y;
    let inc = 0;
    for (let q = 0; q < n; q++) {
      const p = parts[q], v = cutVec(p.c, p.x0 + y * p.cx, p.J, p.par);
      const ph = -p.kn * y * p.cz, cs = Math.cos(ph), sn = Math.sin(ph);   // the member's own path to this row
      const w = W[q];
      w[0] = v[0] * cs - v[1] * sn; w[1] = v[0] * sn + v[1] * cs; w[2] = v[2] * cs - v[3] * sn; w[3] = v[2] * sn + v[3] * cs;
      if (vs) { const u = vs[q]; u[0] = w[0]; u[1] = w[1]; u[2] = w[2]; u[3] = w[3]; }
      inc += w[0] * w[0] + w[1] * w[1] + w[2] * w[2] + w[3] * w[3];
    }
    // how well each pair's fringes are resolved here: 1 down to a quarter turn a row, 0 from a half
    if (pairV) {
      const g = parts.map(p => slope(p, y));
      for (let q = 0; q < n; q++) for (let r = q + 1; r < n; r++) {
        const opposite = along[q] * along[r] < 0.5 && Math.abs(along[q] - along[r]) > 0.5;
        const f = Math.abs(g[q] - g[r]) * dyRow;
        pairV[q * n + r] = opposite ? 0 : clamp(2 - f / (Math.PI / 4), 0, 1);
      }
    }
    // |sum|^2 with each cross term weighted by how well it is resolved
    const field = (k) => {
      let v = 0;
      for (let q = 0; q < n; q++) {
        const a = k ? k[q] : 1, wq = W[q];
        v += a * a * (wq[0] * wq[0] + wq[1] * wq[1] + wq[2] * wq[2] + wq[3] * wq[3]);
        for (let r = q + 1; r < n; r++) {
          const V = pairV ? pairV[q * n + r] : 1;
          if (!V) continue;
          const b = k ? k[r] : 1, wr = W[r];
          v += 2 * a * b * V * (wq[0] * wr[0] + wq[1] * wr[1] + wq[2] * wr[2] + wq[3] * wr[3]);
        }
      }
      return v;
    };
    I[i] = cm ? cm.reduce((s, c) => s + field(c), 0) : field(null);
    sumC += I[i]; sumI += inc;
  }
  const wSum = parts.reduce((s, p) => s + p.wJ, 0);
  return { x, I, sym: false, w: wMax, half: Yg, gain: sumI > 0 ? sumC / sumI * wSum : 0 };
}


