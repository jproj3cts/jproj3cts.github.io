import { APP_SRC, EMBED, STORE_KEY, TEST_MODE } from '../core/constants.js';
import { refIndex } from '../core/glass.js';
import { atomLines, gasDamping, sphereAlpha, trapAlpha, trapPhysics, waterViscosity } from '../core/traps.js';
import { zeemanLines, zeemanStates } from '../core/zeeman.js';
import { NLC, bkBest, bkH, cellDensity, cellPlan, cellProfile, cellResponse, evalPlan, faddeeva, nlcPeriod } from '../core/nlc.js';
import { MODS } from '../core/modulators.js';
import { fibreGamma, fibreSPM } from '../core/pulses.js';
import { lgComps } from '../core/beams-hom.js';
import { TYPE_LABEL, project, selectOne, setFuture, setHistory, setProject, typeLabel, uid } from '../state/project.js';
import { stackAmp } from '../core/coatings.js';
import { VSRC, allSources, demoProject, getEl, loadProject, selected, serialize } from '../state/elements.js';
import { addBench, onTab, renderBenchTabs, switchTab } from '../state/tabs.js';
import { meshHull, parseSTL } from '../core/stl.js';
import { compileMaskExpr, maskFns } from '../core/mask.js';
import {
  lastTrace, lastTraceKey, lastTraceMs, paraxial, setLastTraceKey, traceCount, traceKeyNow, traceScene,
  traceStore, traceStoreHits
} from '../engines/trace.js';
import {
  bez, fibreSegs, handlePos, hornShape, modS, requestRender, resize, segPlanes, selection,
  setSelection, sx, sy, toScr, wireRender
} from './render.js';
import { wirePointer } from './pointer.js';
import { getPath, setParam } from './params.js';
import {
  fieldFrames, fieldRendered, pauseAll, play, playing, renderedPeriod, stepValue, sweepJob,
  updateActivity
} from './sweeps.js';
import { arrivalField, detectorReading, faceArrivals } from '../engines/fibre-face.js';
import { portWorld, portsOf } from '../engines/fibre.js';
import { PIC } from '../engines/pic.js';
import { ELEC } from '../engines/elec.js';
import { V3D } from './view3d.js';
import { INST, osaLines, osaSpan, osaTrace, pdInstSignal, pdNetMw, pdSignal } from './instruments.js';
import { METRICS, metricRaw, optimise, optimiseMany, sensitivity, updateSweepButtons } from './optimise.js';
import { pinBoxes, pins, renderPanel, setPins, togglePin, viewState, vs } from './panel.js';
import { portPower, pulseReport, trapReport } from './panels.js';
import { materialOptions, partAssumptions } from './plots.js';
import { beamAt, laserState } from './panel-cavity.js';
import {
  besselJ01, besselZerosJ0, hankel, ihankel, popFieldSeries, popGaussian, popLeg, popPower, popRadii,
  popStats, popSurface, popW, qdht, setBAB_N
} from '../engines/field.js';
import { cavEventABCD, cavModes, cavRunCache, cavSolved, findCavities } from '../engines/cavity.js';
import { vfPupil } from '../engines/vector-focus.js';
import { popScreen } from '../engines/phase-screen.js';
import { interp2, popGaussian2, popLeg2, popStats2, popSurface2 } from '../engines/field2d.js';
import { popGroupCut, popGroups, popKeyOf, popRun, popSources, popStepCache, segW } from '../engines/beam-tree.js';
import { closeupInfoAt, fieldAlongLine, fieldAtPoint, volData, volDisp } from '../engines/volume.js';
import { HEAVY_MS, fieldCost } from './heavy.js';
import { popScreenPrep } from '../engines/diffraction.js';
import { aberCache, aberrations, diffraction, liveScreens, popScreenCache, screenStats, viaCavity } from '../engines/pd-cavity.js';
import {
  addElement, alignEls, changed, clipOf, fitView, measureOpl, measureSnap, pasteClip, rotateEls,
  setStatus, toast, updateUndoButtons, wireActions
} from './actions.js';
import { layoutSvg, recordLayout } from '../io/layout.js';
import { AI_ANGLE, AI_FIELDS, AI_WHAT, aiFieldsOf, aiGuideText, docsParams } from '../io/guide.js';
import { b64u, embedMode, openShareHash, shareData, shareHash, uiState, unb64u, wireShare } from '../io/share.js';
import { openProjectData, parseProjectText, wireOpen } from '../io/open.js';
import { parseZmx, zmxToElement } from '../io/zmx-import.js';
import { zmxExport, zmxPart } from '../io/zmx-export.js';
import { EXPERIMENTAL, PALETTES, exp, expOn, palettesOn, setExperimental, stlElement } from './experimental.js';
import { wirePicker } from './picker.js';
import { wireRail } from './rail.js';
import { MINE, partContent, placeMine } from './myparts.js';
import { PACKS, normPack, packFromSelection, packPut, packRemove, placePackPart, wirePacks } from '../io/packs.js';
import { account, accountLoaded, accountsOn, proLink, wireAccount } from '../io/account.js';
import { homeOpen, openHome, wireCloud } from '../io/cloud.js';
import { APP_VERSION, EXAMPLES, hideWelcome, showWelcome, wireNews } from './news.js';
import { TOURS, endTour, nameInput, openDemo, startTour, tour, tourTick, wireTours } from './tours.js';
import { modAsk, modHash, modJonesM, modLoad, modPrepare, modReadoutResults, modReset, modStatus, wireMods } from '../io/mods.js';
import { FW, TW, workerShim } from '../worker/field-worker.js';


// every module's page wiring, in the page's order (the modules declare; this is where the page is put together)
wireRender(); wirePointer(); wireActions(); wireShare(); wireOpen(); wirePicker(); wireRail(); wirePacks(); wireAccount(); wireCloud(); wireNews(); wireTours(); wireMods();

if (!TEST_MODE) setInterval(updateActivity, 150);

/* Start-up: restore the last session in this browser, or show a demo bench */
(function init() {
  let restored = false;
  try {
    const raw = TEST_MODE || EMBED ? null : localStorage.getItem(STORE_KEY);
    if (raw) { loadProject(JSON.parse(raw)); restored = true; }
  } catch (err) { setProject(null); }
  if (!project) demoProject();
  nameInput.value = project.name;
  renderBenchTabs();
  setStatus(restored ? 'Restored your last session' : '');
  if (EMBED) embedMode();
  const shared = !TEST_MODE && location.hash.match(/^#p=([zjq][A-Za-z0-9_-]+)/);
  if (shared) { if (!EMBED) window.history.replaceState(null, '', location.pathname); openShareHash(shared[1]); }
  else if (!restored && !TEST_MODE && !EMBED && !/[#?&](demo=|tour=|examples|pro\b)/.test(location.hash + '&' + location.search)) setTimeout(showWelcome, 400);
  renderPanel();
  updateUndoButtons();
  updateSweepButtons();
  resize();

  // Hook for the regression suite. Reading only; it drives a throwaway copy of
  // the page in an iframe, in test mode, so nothing here touches saved work.
  window.JEKray2D = {
    view3d: V3D.api,
    load(data) { loadProject(data); selectOne(null); setHistory([]); setFuture([]); renderBenchTabs(); renderPanel(); traceScene(); requestRender(); },
    trace() { setLastTraceKey(null); traceScene(); },
    // what keeping a part as one of My parts would send, in bytes (-1: too big even simplified)
    partSize(name) { const c = partContent([this.byName(name)]); return c ? c.length : -1; },
    // sweeps: play one (resolving once any rendering of its field is done), pause them all, and
    // how many of the rendered steps, at the rates the sweeps have now, find their field ready
    sweepPlay(name, path) { play(this.byName(name), path); return new Promise(r => { const w = () => sweepJob ? setTimeout(w, 20) : r(playing.size); w(); }); },
    sweepPause() { pauseAll(); },
    // the diffracted field as the 3D view takes it, worked out here: per segment its cuts along it, their reach and the irradiance on the axis (W/cm²)
    vol3d() { traceScene(); const srcs = popSources(); if (!srcs.length) return null; const t0 = performance.now(), R = popRun(lastTrace.beams, srcs, {}), t1 = performance.now(), V = volData(R.segs, project.tab, null); self.__volMs = [t1 - t0, performance.now() - t1];
      return { peak: V.peak * 100, disp: volDisp(V) * 100, segs: V.segs.map(v => ({ i: v.i, two: v.two, coh: v.coh, ta: v.ta, tb: v.tb, o: v.o, e: v.e, ts: Array.from(v.ts), rmax: Array.from(v.rmax), peak: v.peak * 100,
        axis: Array.from(v.ts, (t, j) => 100 * (v.two ? v.I[(j * v.M + (v.M >> 1)) * v.M + (v.M >> 1)] : v.I[j * v.M])) })) }; },
    // part packs: checked as installing would ({ pack, notes } or { error }), installed without asking, listed, placed, removed, made
    packCheck(raw) { try { const r = normPack(JSON.parse(JSON.stringify(raw))); return { pack: r.pack, notes: r.notes }; } catch (err) { return { error: err.message }; } },
    async packInstall(raw) { const { pack, notes } = normPack(JSON.parse(JSON.stringify(raw))); if (pack.code) await modPrepare(pack, notes); await packPut(pack); return pack.id; },
    packs: () => PACKS.list.map(p => ({ id: p.id, name: p.name, parts: p.parts.map(P => P.name), glasses: p.glasses.map(g => g.glass) })),
    packPlace(id, i) { placePackPart(PACKS.list.find(p => p.id === id), i); return selection().map(e => e.name); },
    packRemove: id => packRemove(id),
    packMake(meta, names) { if (names) setSelection(names.map(n => this.byName(n))); return packFromSelection(meta || { id: 'test.pack', name: 'Test' }); },
    materialOptions: el => materialOptions(el.materials ? el.materials[0] : { glass: 'N-BK7' }, el.type === 'lens' && !!el.mmw),
    // the rendered frames kept: how many, and whether a screen's field as the bench is now is among them
    framesInfo(name) { const el = name && this.byName(name), J = el && popScreenPrep(el); return { live: liveScreens, bench: fieldFrames.bench.size, screens: fieldFrames.screens.size, has: J ? fieldFrames.screens.has(J.key) : null, key: J ? J.key.length + ':' + J.key.slice(0, 120) : null, keys: [...fieldFrames.screens.keys()].slice(0, 3).map(k => k.length + ':' + k.slice(0, 120)), full: J ? J.key : null, all: [...fieldFrames.screens.keys()] }; },
    renderedSteps() {
      const P = renderedPeriod();
      if (!P) return -1;
      const list = [...playing.values()].map(p => [getEl(p.id), p.path]), saved = list.map(([e, p]) => getPath(e, p)), n = fieldRendered.n;
      let found = 0;
      for (let i = 0; i < n; i++) {
        list.forEach(([e, p]) => setParam(e, p, stepValue(e.sweeps[p], i, n, P)));
        traceScene();
        if (fieldFrames.bench.has(popKeyOf(lastTrace.beams, popSources()))) found++;
      }
      list.forEach(([e, p], k) => setParam(e, p, saved[k])); traceScene();
      return found / n;
    },
    traceInfo() { return { ms: lastTraceMs, current: lastTraceKey === traceKeyNow(), rays: lastTrace.rays.length, count: traceCount, background: TW.n, stored: traceStore.size, restored: traceStoreHits }; },
    serialize,
    benches() { return project.benches.map(b => ({ id: b.id, name: b.name, on: b.id === project.tab })); },
    // fibres: join two ports by element name and port number; what a fibre photodiode reads
    connect(a, pa, b, pb, len, loss) { project.fibres = project.fibres || []; project.fibres.push({ id: uid(), a: [this.byName(a).id, pa], b: [this.byName(b).id, pb], len: len ?? 1, loss: loss ?? 0 }); traceScene(); },
    elScreen(name) { const el = this.byName(name); return [sx(el.x), sy(el.y)]; },
    handleScreen(name) { const q = handlePos(this.byName(name)); return Array.isArray(q) ? q : [q.x, q.y]; },
    portScreen(id, i) { const Q = portWorld(getEl(id), i); return [sx(Q.x), sy(Q.y)]; },
    fibrePoint(id, k, t) { const segs = fibreSegs(project.fibres.find(F => F.id === id)); return toScr(bez(segs[k], t)); },
    fibreMid(id) { const segs = fibreSegs(project.fibres.find(F => F.id === id)); return toScr(bez(segs[Math.floor((segs.length - 1) / 2)], segs.length % 2 ? 0.5 : 1)); },
    // the Gaussian beams' field arriving at a point on a part's face (u across, v up), summed: [s re, s im, p re, p im]
    arrivalE(name, u, v) { const e = [0, 0, 0, 0]; for (const A of faceArrivals(this.byName(name))) { const f = arrivalField(A, u, v); for (let k = 0; k < 4; k++) e[k] += f[k]; } return e; },
    arrivalsInfo(name) { return faceArrivals(this.byName(name)).map(A => ({ twisted: !!(A.QM && A.QM.twisted), th: A.QM ? A.QM.th : null, comps: A.comps || null, general: !!(A.Q || A.QM), psi: A.QM ? A.QM.psi : null, Q: A.QM ? A.QM.Q : A.Q || null, qx: A.qx, v0: A.v0, vs: A.vs, ldx: A.ldx, u0: A.u0 })); },
    // a beam segment's event's ray matrices (in and out of the plane, and the full 4x4 when it turns the axes)
    eventABCD(i) { const b = lastTrace.beams[i]; return b && b.ev ? cavEventABCD(b.ev, b.nm * 1e-6) : null; },
    arrivals(name) { return faceArrivals(this.byName(name)).map(A => ({ qx: A.qx, qy: A.qy, u0: A.u0, ldx: A.ldx, ldy: A.ldy, J: A.J, coh: A.coh, opl: A.opl, fo: A.fo })); },
    detector(name) { const el = this.byName(name), r = detectorReading(el); return { mw: r.mw, field: r.field, pending: r.pending, via: viaCavity(el), rf: r.rf ? { eff: r.rf.eff, inMw: r.rf.inMw, mw: r.rf.mw } : null }; },
    pdSignal(name) { const S = pdSignal(this.byName(name)); return JSON.parse(JSON.stringify(S)); },
    fibrePd(name) { return pdNetMw(this.byName(name)); },
    portPower(name, p) { return portPower(this.byName(name), p); },
    fibreNet() { const n = lastTrace.net; return n ? { keys: n.keys.map(k => k.gk), truncated: n.truncated, tips: [...n.tips.keys()].map(id => getEl(id).name), virtual: [...VSRC.values()].map(v => ({ id: v.id, power: v.power, lag: v.vLag, key: v.vKey })) } : null; },
    showTab(name) { const b = project.benches.find(b2 => b2.name === name || b2.id === name); if (b) switchTab(b.id); return project.tab; },
    addTab() { addBench(); return project.tab; },
    // the field worker's state, and a screen's figures as the panels last got them
    worker() { return { on: !!FW.w, failed: FW.failed, busy: FW.busy ? FW.busy.kind : null, queued: FW.queue.map(j => j.kind), sent: FW.seq }; },
    shownDiffraction(name) { const el = this.byName(name), c = el && popScreenCache.get(el.id); return c ? c.D : null; },
    shownCavity() { const [k, v] = [...cavSolved.entries()].pop() || []; return v && v.res ? { k, P: v.res.at(v.delta).P, Plock: v.res.Plock, delta: v.delta, dLock: v.res.dLock, others: (v.others || []).length, current: v.trace === lastTrace } : null; },
    byName(name) { return project.elements.find(e => e.name === name); },
    stats(name) { const el = this.byName(name); return el ? screenStats(el) : null; },
    // select an element by name, and optionally which tab of a screen's panel to show
    select(name, tab) { const el = this.byName(name); if (!el) return false; if (tab) vs(el).screenTab = tab; traceScene(); selectOne(el.id); renderPanel(); requestRender(); return true; },
    // vapour cells: a line's transitions, and what a cell does at a frequency (Hz), with pumps { nu, I W/m^2 }
    atomLines: (atom, line) => atomLines(atom, line).map(a => ({ iso: a.iso, Fg: a.Fg, Fe: a.Fe, nu: a.nu, S: a.S, share: a.share, Isat: a.Isat, A: a.A })),
    cellAt(name, nu, pumps, q) { return cellResponse(this.byName(name), nu, pumps || null, q); },
    zeemanLines(atom, line, B) { return zeemanLines(atom, line, B).map(a => ({ iso: a.iso, Fg: a.Fg, q: a.q, nu: a.nu, S: a.S, share: a.share })); },
    zeemanStates(iso, level, B) { return zeemanStates(iso, level, B).map(z => ({ E: z.E, mF: z.mF })); },
    // the full model: light at nu going dir through the cell at (u, v), its own beam self { I, w, ly }, others { nu, I, w, ly, dir }
    cellField(name, nu, o) { const el = this.byName(name); o = o || {}; const others = (o.others || []).map(r => Object.assign({ w: Infinity, ly: 0, dir: [-1, 0] }, r));
      others.forEach(r => { if (isFinite(r.w) && o.profiles !== false) r.prof = cellProfile(el, r); });
      return evalPlan(cellPlan(el, nu, o.dir || [1, 0], o.self || null, others), o.u || 0, o.v || 0); },
    cellDensity(name) { return cellDensity(this.byName(name)); },
    lgComps: (p, l) => lgComps(p, l).map(c => c.slice()),
    trapAlpha, trapPhysics,
    sphereAlpha, gasDamping, waterViscosity,
    trap(name) { const el = this.byName(name), D = diffraction(el); return D && D.trap ? trapReport(el, D.trap) : null; },
    fibreSPM: (F, nm, len, P, Pavg, gdd) => { const r = fibreSPM(Object.assign({ loss: 0, disp: null, gamma: null, ftype: 'smf' }, F), nm, len, Object.assign({ pshape: 'sech2', rep: 80, gdd0: 0 }, P), Pavg, gdd || 0, null); return r && { N: r.N, steps: r.steps, B: r.B, broad: r.broad, peakIn: r.peakIn, half: r.half, d0: r.d0, dd: r.dd, re: Array.from(r.re), im: Array.from(r.im) }; },
    fibreGamma: (F, nm) => fibreGamma(F, nm),
    nlc(name) { const el = this.byName(name); return ((lastTrace.nlc) || []).filter(H => H.id === el.id).map(H => ({ P: H.P, nm: H.nm, q: H.q, r: H.r })); },
    nlcPeriod: (mat, nm, T) => nlcPeriod(mat, nm, T),
    bkH: (s, xi, mu) => bkH(s, xi, mu), bkBest: (xi, mu) => bkBest(xi, mu),
    nlcIndex: (mat, nm, T) => NLC[mat].n(nm * 1e-3, T),
    cellBeams(name) { traceScene(); const el = this.byName(name); return (lastTrace.cells || []).filter(c => c.id === el.id); },
    faddeeva,
    laser(cavName) { traceScene(); const c = findCavities().find(q => !cavName || q.name === cavName); const L = c && laserState(c); return L && { P: L.P, above: L.above, need: L.need, Gsat: L.Gsat, outs: (L.outs || []).map(o => ({ name: o.e.name, T: o.T, P: o.P })), best: L.best && { R: L.best.R, P: L.best.P }, lnPassive: L.lnPassive, w: L.G.map(g => g.w), Psat: L.G.map(g => g.Psat) }; },
    rayPaths() { traceScene(); return lastTrace.rays.map(r => Array.from(r.pts)); },
    pulseSpectrum(name) { traceScene(); const R = pulseReport(this.byName(name)); return R && { nm: R.nm, S: R.S, dur: R.dur, peak: R.peak }; },
    pulse(name) { traceScene(); const R = pulseReport(this.byName(name)); return R && JSON.parse(JSON.stringify({ ...R, t: undefined, I: undefined, nm: undefined, S: undefined, spectralPhase: undefined })); },
    metric(name, key) { return metricRaw(this.byName(name), key); },
    paraxial(name, nm) { return paraxial(this.byName(name), nm); },
    index: refIndex,
    version: () => APP_VERSION,
    // experimental features: switch them on or off, and whether one is on
    palettesOn: () => palettesOn(),
    // mods: wait until every result asked for has come (traced again after each), and how they stand
    async modsSettle() { for (let i = 0; i < 30; i++) { setLastTraceKey(null); traceScene(); if (!MODS.waiting.size) break; await Promise.allSettled([...MODS.waiting.values()]); } setLastTraceKey(null); traceScene(); },
    modsInfo: () => ({ packs: [...MODS.packs.keys()], failed: Object.fromEntries(MODS.failed), waiting: MODS.waiting.size, rev: MODS.rev, frame: !!MODS.frame, loaded: [...MODS.loaded.keys()] }),
    modTimeout(ms) { MODS.timeout = ms || 0; },
    modStatus(name) { return modStatus(this.byName(name)); },
    hitsOn(name) { const el = this.byName(name); return ((lastTrace.screens && lastTrace.screens[el.id]) || []).map(t => Object.fromEntries(Object.entries(t).filter(([k, v]) => typeof v === 'number' || typeof v === 'boolean'))); },
    beams: () => lastTrace.beams,
    segPlanes: i => segPlanes(lastTrace.beams, i),
    maskAt(name, pts, nm) { const fn = maskFns(this.byName(name)).fn; return pts.map(([u, v]) => fn(u, v, (nm || 633) * 1e-6)); },
    modReadout(name) { return modReadoutResults(this.byName(name)).map(x => ({ name: x.D.name, none: x.none, fail: x.fail || null, r: x.r })); },
    modProbe(name, nm) { const el = this.byName(name); return { S: el.type === 'fcomp' ? modS(el, nm) : null, J: el.type === 'waveplate' ? modJonesM(el, nm) : null, keys: [...MODS.results.keys()] }; },
    async modRaw(code, def, fn, args) { const pk = { id: 'raw.test', code, hash: await modHash(code + Math.random()) }; try { const defs = await modLoad(pk); return def ? { out: await modAsk(pk, def, fn, args) } : { defs }; } catch (err) { return { err: err.message }; } },
    modReset: why => modReset(why || 'reset'),
    typeLabel(name) { return typeLabel(this.byName(name)); },
    hornShape(name) { const H = hornShape(this.byName(name)); return { a: H.a, lam: H.lam, Lf: H.Lf, rg: H.rg, xb: H.xb, back: H.back, D: H.D, square: H.square, grooves: H.grooves ? H.grooves.length : 0 }; },
    experimental(on, picks) { if (on !== undefined || picks) setExperimental(on, picks); return { on: expOn, list: EXPERIMENTAL.map(f => f.key), active: EXPERIMENTAL.map(f => f.key).filter(exp) }; },
    exp: key => exp(key),
    // an STL object onto the bench from a file's contents (text, or bytes as an array of numbers): its name
    stl(src, name, x, y, units) { const T = parseSTL(Array.isArray(src) ? new Uint8Array(src) : src), el = stlElement(T, name || 'object.stl', x || 0, y || 0, units); el.bench = project.tab; project.elements.push(el); changed(true); return el.name; },
    stlHull: name => meshHull(project.elements.find(e => e.name === name)),
    pic: PIC.api,                                                                              // PIC hook
    elec: ELEC.api,                                                                            // ELEC hook
    // the field steps kept between runs: how many, hits and misses since the last look; clear empties it
    // a field worker started from the page's own code, as the bench starts one, and asked to
    // trace: whatever the page's code does at its top level must still run in a worker
    workerProbe() {
      return new Promise(resolve => {
        if (!APP_SRC || typeof Worker === 'undefined') { resolve({ ok: false, err: 'no worker here' }); return; }
        const url = URL.createObjectURL(new Blob(['(' + workerShim + ')();\n', APP_SRC], { type: 'text/javascript' }));
        const w = new Worker(url);
        URL.revokeObjectURL(url);
        let timer = null;
        const done = r => { clearTimeout(timer); w.terminate(); resolve(r); };
        timer = setTimeout(() => done({ ok: false, err: 'no answer' }), 10000);
        w.onerror = e => { e.preventDefault(); done({ ok: false, err: e.message }); };
        w.onmessage = e => done(e.data.ok ? { ok: true, rays: e.data.out.rays.length } : { ok: false, err: e.data.err });
        w.postMessage({ id: 1, kind: 'trace', proj: JSON.stringify(serialize()), args: { key: 'probe' } });
      });
    },
    // the bench's field as drawn: each drawn stretch's half-width where it starts and ends
    fieldDrawn() {
      traceScene();
      const R = popRun(lastTrace.beams, popSources(), { draw: true });
      return R.segs.filter(sg => sg.draw).map(sg => ({ at: sg.b.ev && sg.b.ev.el ? getEl(sg.b.ev.el).name : null, members: sg.draw.members,
        Ys: [sg.draw.Ys[0], sg.draw.Ys[sg.draw.Ys.length - 1]], ts: Array.from(sg.draw.ts), all: Array.from(sg.draw.Ys) }));
    },
    // what the bench's field would cost, as the heavy-field notice reckons it (raw: before this computer's speed)
    fieldCost() { traceScene(); const e = fieldCost(lastTrace.beams, popSources()); return { raw: e.raw, segs: e.segs, ghost: e.ghost, heavy: e.raw > HEAVY_MS }; },
    // Gaussian beam segments: how many there are, and how many start at an element (by name)
    // each beam of the trace: its parent, the element it starts at and how (a split is light that went round it)
    beamList() { traceScene(); return lastTrace.beams.map(b => ({ parent: b.parent, at: b.ev ? (getEl(b.ev.el) || {}).name : null, kind: b.ev ? b.ev.kind : 'source' })); },
    beamsAt(name) { traceScene(); const el = name && this.byName(name); return lastTrace.beams.filter(b => !el || (b.ev && b.ev.el === el.id)).length; },
    popCache(clear) { const C = popStepCache, r = { entries: C.map.size, mb: +(C.bytes / 2 ** 20).toFixed(1), hits: C.hits, misses: C.misses }; C.hits = C.misses = 0; if (clear) { C.map.clear(); C.bytes = 0; } return r; },
    // a photodiode's oscilloscope trace at a time span (0: by itself), as its CSV's columns
    scope(name, span) { const el = this.byName(name), cv = document.createElement('canvas'); INST.scope(cv, [{ S: pdInstSignal(el), key: el.id, name: 'output' }], { mode: 'normal', span, ch: [{ vdiv: 0, off: 0 }] }, el.name); const D = cv._csv; return { cols: D.cols, rows: typeof D.rows === 'function' ? D.rows() : D.rows }; },
    beamAt,
    // a photodiode's own Spectrum view: its tones as drawn (f, dB at their rms level)
    pdSpectrum(name) { const el = this.byName(name), cv = document.createElement('canvas'); return INST.spectrum(cv, pdInstSignal(el), vs(el).spec || { scale: 'linear', rbw: 1000 }, el.name).tones; },
    setParam(name, path, v) { setParam(this.byName(name), path, v); },
    getParam(name, path) { return getPath(this.byName(name), path); },
    sensitivity(names, targetName, key) {
      const vars = names.map(([n, path]) => [this.byName(n), path]);
      return sensitivity(vars, this.byName(targetName), key);
    },
    stackAmp,
    system() { return lastTrace.system; },
    diffraction(name) { const el = this.byName(name); return el ? diffraction(el) : null; },
    // several parameters [[name, path]] against goals [{ target, key, goal, targetVal, weight }]
    optimiseMany(vars, terms, opts) { const r = optimiseMany(vars.map(([n, p]) => [this.byName(n), p]), terms.map(q => Object.assign({}, q, { target: this.byName(q.target) })), opts);
      return { best: r.best, start: r.start, improved: r.improved, evals: r.evals, startMerit: r.startMerit, bestMerit: r.bestMerit, raw0: r.raw0, rawBest: r.rawBest }; },
    optimise(name, path, targetName, key, goal, targetVal) {
      return optimise(this.byName(name), path, this.byName(targetName), key, goal, targetVal);
    },
    importZmxText(text, fileName, mode) { return zmxToElement(parseZmx(text, fileName), fileName, mode || 'auto'); },
    // the parts the bench marks with a red ! (their import assumed something)
    assumedOn() { return project.elements.filter(e => onTab(e) && partAssumptions(e).length).map(e => e.name); },
    // a .zmx onto the bench as File › Import does it (selected, its assumptions kept)
    importZmxBench(text, fileName, mode) { const el = zmxPart(parseZmx(text, fileName), fileName, mode || 'auto'); el.bench = project.tab; project.elements.push(el); selectOne(el.id); changed(true); traceScene(); return el.name; },
    // a part kept in My parts placed on the bench, its content given (as fetched)
    minePlace(p, content) { MINE.content.set(p.id + '@' + p.updated_at, content); return placeMine(p); },
    exportZmx(names, nms) { return zmxExport(names.map(n => this.byName(n)), nms || [633]); },
    project() { return project; },
    sel() { return selection().map(e => e.name); },
    // several at once: the clipboard, turning and lining up, as the menu and panel do them
    copy(names) { return clipOf(names.map(n => this.byName(n))); },
    paste(clip, at) { return pasteClip(clip, at); },
    rotateGroup(names, degs) { rotateEls(names.map(n => this.byName(n)), degs); },
    align(names, how) { alignEls(names.map(n => this.byName(n)), how); },
    // the optical path between two bench points on beams, as the ruler finds it
    oplBetween(a, b) { traceScene(); const v = measureOpl(measureSnap(sx(a[0]), sy(a[1])), measureSnap(sx(b[0]), sy(b[1]))); return v.length === 1 ? v[0] : v; },
    layoutSvg() { return layoutSvg(recordLayout()); },
    // a project as someone else wrote it: what opening it changed, as plain text
    aiGuideText,
    docsParams,
    // a bench through a link and back (plain encoding, so it runs without waiting): what came out
    shareRoundTrip() { const h = 'j' + b64u(new TextEncoder().encode(JSON.stringify(shareData()))), before = JSON.stringify(Object.assign(serialize(), { saved: '' }));
      const d = JSON.parse(new TextDecoder().decode(unb64u(h.slice(1)))); openProjectData(d, 'test'); const after = JSON.stringify(Object.assign(serialize(), { saved: '' }));
      return { same: before === after, before, after, length: h.length }; },
    shareHash: () => shareHash(),
    uiState: () => uiState(),
    pin(name) { const el = this.byName(name); if (el && !pins.includes(el.id)) togglePin(el); return pins.slice(); },
    // a link's panels, there and back: pins, selection and tabs as sent against as opened
    shareUiRoundTrip() { const before = uiState(), d = JSON.parse(JSON.stringify(shareData())); setPins([]); viewState.clear(); selectOne(null); openProjectData(d, 'test');
      const after = uiState(); return { before, after, same: JSON.stringify([before.sel, before.pins, before.views]) === JSON.stringify([after.sel, after.pins, after.views]) }; },
    pinned: () => pins.slice(),
    panelOf: id => pinBoxes.get(id) || null,
    openShareHash,
    aiFieldCoverage() { const miss = []; for (const t of Object.keys(TYPE_LABEL)) for (const k of aiFieldsOf(t)) if (!(AI_FIELDS[t] || {})[k]) miss.push(t + '.' + k); for (const t of Object.keys(TYPE_LABEL)) if (!AI_ANGLE[t] || !AI_WHAT[t]) miss.push(t); return miss; },
    importText(text) { const n = openProjectData(parseProjectText(text), 'test'); return n.map(x => x.replace(/<[^>]+>/g, '')); },
    measures() { return JSON.parse(JSON.stringify(project.measures || [])); },
    lastTrace() { return lastTrace; },
    popCore: { popFieldSeries, setBabN: n => { setBAB_N(n); }, besselJ01, besselZerosJ0, qdht, popRadii, hankel, ihankel, popPower, popGaussian, popLeg, popStats, popSurface, popW,
      popGaussian2, popLeg2, popStats2, popSurface2, popScreen },
    // every Gaussian source's beam tree as fields, whatever it is set to show
    popNotes() {
      const R = popRun(lastTrace.beams, allSources());
      const name = id => (getEl(id) || {}).name;
      return { clipped: [...R.notes.clipped].map(name), steep: [...R.notes.steep].map(name), coarse: [...R.notes.coarse].map(name), polErr: R.notes.polErr || 0 };
    },
    serialize() { return serialize(); },
    cavityModes(count) { const [k, v] = [...cavSolved.entries()].pop() || []; if (!v || !v.res) return null; const c = findCavities().find(c2 => c2.id === k);
      return cavModes(v.res, c ? c.fsr : 1, count).map(md => ({ abs: md.abs, loss: md.loss, offset: md.offset, share: md.share })); },
    setCavityLock(mode) { const c = findCavities()[0]; if (!c) return; project.cavityLock = Object.assign({}, project.cavityLock, { [c.id]: mode }); cavSolved.delete(c.id); cavRunCache.delete(lastTrace); },
    cavityPeaks(tol) {
      // the lines in the latest scan: position (as a share of the free spectral range from the
      // strongest) and height against it, each found finely
      const [k, v] = [...cavSolved.entries()].pop() || []; if (!v || !v.res) return null;
      const P = v.res, s = P.scan, n = s.length, out = [];
      for (let i = 0; i < n; i++) {
        const a = s[(i - 1 + n) % n], b = s[i], c = s[(i + 1) % n];
        if (b > a && b >= c && b > (tol || 1e-4) * P.Plock) {
          let lo = -Math.PI + 2 * Math.PI * (i - 1) / n, hi = -Math.PI + 2 * Math.PI * (i + 1) / n;
          for (let it = 0; it < 50; it++) { const x1 = lo + (hi - lo) * 0.382, x2 = lo + (hi - lo) * 0.618; if (P.at(x1).P > P.at(x2).P) hi = x2; else lo = x1; }
          const d = 0.5 * (lo + hi); let f = -(d - P.dLock) / (2 * Math.PI); f -= Math.round(f);
          out.push({ at: f, height: P.at(d).P / P.Plock });
        }
      }
      return out.sort((a, b) => b.height - a.height);
    },
    cavitySolve() { return [...cavSolved.entries()].map(([k, v]) => v.res ? { id: k, m: v.res.m, beta: v.res.beta, P0: v.res.P0 / v.res.beta ** 2, Plock: v.res.Plock / v.res.beta ** 2, dLock: v.res.dLock, delta: v.delta,
      fwhm: (() => { const s = v.res.scan, n = s.length; let k = 0; for (let i = 1; i < n; i++) if (s[i] > s[k]) k = i; const half = 0.5 * v.res.Plock; let a = v.res.dLock, b = v.res.dLock; const f = d => v.res.at(d).P; let lo = a, hi = a + 0.5; for (let it = 0; it < 60; it++) { const mid = 0.5 * (lo + hi); if (f(mid) > half) lo = mid; else hi = mid; } return 2 * (lo - v.res.dLock) / (2 * Math.PI); })() } : { id: k }); },
    cavities() { return findCavities().map(c => ({ name: c.name, kind: c.kind, names: c.names, p: c.p, Lopt: c.Lopt, fsr: c.fsr, rho: c.rho, finesse: c.finesse, linewidth: c.linewidth,
      buildup: c.buildup, Tin: c.Tin, stability: c.stability, gouy: c.gouy, tms: c.tms, waists: c.mode.waists, along: c.mode.along.map(a => ({ name: a.name, wx: a.wx, wy: a.wy })),
      axis: c.axis, match: c.match, sens: c.sens, Mx: c.Mx, My: c.My, M4: c.M4, Q: c.mode.Q, angles: c.mode.along.map(a => a.angle) })); },
    vfPupilOf(name) {
      const el = this.byName(name), R = popRun(lastTrace.beams, allSources());
      const sg = R.segs.find(s2 => s2.b.endEl === el.id); if (!sg) return null;
      const P = vfPupil(sg, R); if (!P) return null;
      let pw = 0; for (let o = 0; o < P.n; o++) { let I = 0; for (let m = 0; m < 4; m++) I += P.U[m][o] ** 2; pw += I * P.W[o]; }
      const par = R.segs.find(s2 => s2.i === sg.b.parent), Fin = par ? par.leg.at(par.b.len) : null;
      return { route: P.route, Rf: P.Rf, NA: P.NA, n: P.n, pupilPowerTransverse: pw, inPower: Fin ? (Fin.ax ? popStats2(Fin).power : popStats(Fin).power) : null, len: sg.b.len };
    },
    fieldAt(x, y) { return fieldAtPoint(x, y); },
    beamTree() { return lastTrace.beams.map((b, i) => ({ i, parent: b.parent, x0: +b.x0.toFixed(3), y0: +b.y0.toFixed(3), dx: +b.dx.toFixed(4), dy: +b.dy.toFixed(4), len: +b.len.toFixed(3), w: +b.w.toFixed(4), end: b.endEl && getEl(b.endEl) ? getEl(b.endEl).name : null, ev: b.ev ? (b.ev.bypass ? 'bypass' : b.ev.mode + ':' + (getEl(b.ev.el) || {}).name + ' ly ' + (+b.ev.ly).toFixed(2)) : null })); },
    closeupInfo(x, y, span) { return closeupInfoAt(x, y, span); },
    examples() { return [...new Set(EXAMPLES.flatMap(g => g[2].map(e => e[0])))]; },
    tourStart(name) { startTour(name); clearInterval(tour.timer); },
    tourTick() { tourTick(); return tour ? { i: tour.i, final: !!tour.T.steps[tour.i].final } : null; },
    tourEnd() { endTour(); },
    add(kind) { addElement(kind); traceScene(); return selected().name; },
    paletteKinds() { return Object.entries(PALETTES).flatMap(([k, v]) => (v || []).map(x => [k, x[0], x[1]])); },
    palette(name) { return PALETTES[name].map(it => it[0]); },
    fibreCount() { return (project.fibres || []).length; },
    fibreSet(i, key, v) { const F = (project.fibres || []).filter(G => !G.wire)[i]; if (F) F[key] = v; },
    osa(name) { const el = this.byName(name), L = osaLines(el), [lo, hi] = osaSpan(el, L), T = osaTrace(el, L, lo, hi, 4001), pk = Math.max(...T.ys);
      // the width at half the peak, the crossings placed by interpolation
      const i0 = T.ys.findIndex(y => y >= pk / 2), i1 = T.ys.length - 1 - [...T.ys].reverse().findIndex(y => y >= pk / 2);
      const at = (i, j) => T.xs[i] + (pk / 2 - T.ys[i]) / (T.ys[j] - T.ys[i]) * (T.xs[j] - T.xs[i]);
      return { lines: L.map(q => ({ nm: q.nm, mw: q.mw, w: q.w })), lo, hi, peak: pk, fwhm: (i1 < T.ys.length - 1 ? at(i1, i1 + 1) : T.xs[i1]) - (i0 > 0 ? at(i0 - 1, i0) : T.xs[i0]) }; },
    portCount(name) { return portsOf(this.byName(name)).length; },
    aberrations(name, opts) { const el = this.byName(name); if (!el) return null; if (opts) Object.assign(el, opts); traceScene(); aberCache.key = ''; return aberrations(el); },
    metricList() { return METRICS.map(m => ({ key: m.key, fam: m.fam, on: m.on })); },
    metricOf(name, key) { return metricRaw(this.byName(name), key); },
    fieldAlong(x0, y0, x1, y1, n) { return fieldAlongLine(x0, y0, x1, y1, n); },
    maskExpr(src, x, y, lam) { return compileMaskExpr(src)(x || 0, y || 0, lam || 633e-6); },
    // the bench's groups of branches drawn as one, with the power their fields add up to
    popGroups() {
      const R = popRun(lastTrace.beams, allSources());
      const name = id => id ? (getEl(id) || {}).name : null;
      return popGroups(R.segs).map(g => ({ size: g.members.length, to: name(g.lead.b.endEl),
        dx: g.lead.b.dx, dy: g.lead.b.dy, gain: popGroupCut(g, 0.5 * g.lead.b.len).gain }));
    },
    popSegments() {
      const withJ = (sg, s) => Object.assign({}, s, { power: s.power * segW(sg) });
      const srcs = allSources();
      const R = popRun(lastTrace.beams, srcs);
      return R.segs.map(sg => ({
        el: sg.b.ev ? (getEl(sg.b.ev.el) || {}).name : null, kind: sg.b.ev ? sg.b.ev.kind : 'source',
        len: sg.b.len, dx: sg.b.dx, dy: sg.b.dy, clipped: sg.clipped, engine: sg.eng,
        pilot: sg.eng === '2d' ? { x: [sg.F0.ax.z, sg.F0.ax.zR], y: [sg.F0.ay.z, sg.F0.ay.zR] }
          : { x: [sg.F0.z, sg.F0.zR], y: [sg.F0.z, sg.F0.zR] },
        start: withJ(sg, sg.leg.stats(0)), at: t => withJ(sg, sg.leg.stats(t)), coh: sg.coh, J: sg.b.J, mode: sg.mode,
        profile: t => { const c = sg.leg.cut(t); return { r: c.x, I: c.I }; },
        // the start field's two components at a point across the beam (x in the plane, y out of it)
        fieldAt: (x, y) => { const F = sg.F0; if (!F.re2) return null; const a = interp2(F, x, y), b = interp2(F, x, y, F.re2, F.im2);
          return { s: a[0] ** 2 + a[1] ** 2, p: b[0] ** 2 + b[1] ** 2 }; },
      }));
    },
  };
  if (!restored) fitView();

  // #demo=<name> (or ?demo=<name>) opens that example; the link is then dropped from the
  // address so a reload keeps the bench as edited rather than opening the example again
  const demo = !TEST_MODE && (location.hash + '&' + location.search).match(/[#?&]demo=([a-z0-9-]+)/);
  if (demo) {
    if (!EMBED) window.history.replaceState(null, '', location.pathname);
    openDemo(demo[1]);
  }
  // #examples opens the gallery, #tour=<name> starts a tour, #pro offers JEKrayPro (the product page links to all three),
  // and #benches opens My benches
  const helpLink = () => {
    const tr = location.hash.match(/^#tour=([a-z]+)/), pro = location.hash === '#pro', benches = location.hash === '#benches';
    if (benches && homeOpen()) return true;
    if (location.hash !== '#examples' && !pro && !benches && !(tr && TOURS[tr[1]])) return false;
    window.history.replaceState(null, '', location.pathname);
    hideWelcome();
    setTimeout(async () => {
      if (tr) startTour(tr[1]); else if (pro) proLink();
      else if (benches) {
        await accountLoaded;
        if (account) openHome();
        else if (accountsOn()) { const btn = document.getElementById('btnAcct'); if (btn && document.getElementById('acctMenu').hidden) btn.click(); toast('Sign in to see your benches'); }
      }
      else openGallery();
    }, 0);
    return true;
  };
  if (!TEST_MODE && !EMBED) helpLink();
  // a link pasted into the address bar of a page already open changes only the hash
  if (!TEST_MODE) window.addEventListener('hashchange', () => {
    if (!EMBED && helpLink()) return;
    const sh = location.hash.match(/^#p=([zjq][A-Za-z0-9_-]+)/), dm = location.hash.match(/^#demo=([a-z0-9-]+)/);
    if (!sh && !dm) return;
    if (!EMBED) window.history.replaceState(null, '', location.pathname);
    if (sh) openShareHash(sh[1]); else openDemo(dm[1], true);
  });
})();

