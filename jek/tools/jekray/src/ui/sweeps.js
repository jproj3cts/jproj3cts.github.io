import { IN_WORKER, TEST_MODE, clamp } from '../core/constants.js';
import { spmAsked } from '../core/pulses.js';
import { V, project, selectedId } from '../state/project.js';
import { allSources, fieldDec, getEl, lightOf } from '../state/elements.js';
import { dropTraceStore, lastTrace, setLastTraceKey, traceScene } from '../engines/trace.js';
import { H, W, requestRender } from './render.js';
import { getPath, setParam } from '../state/params.js';
import { MODS } from '../core/modulators.js';
import { modDelta } from '../engines/mods.js';
import { mcJob, tick, updateSweepButtons } from './optimise.js';
import { h, pins, syncPanel, vs } from './panel.js';
import { cavJob } from './panel-cavity.js';
import { POP_SLICES, popKeyOf, popRunGen, popSources, popState } from '../engines/beam-tree.js';
import { CLOSEUP_STEP, closeupImage } from '../engines/closeup.js';
import { closeupFrame, closeupKey, closeupOnShow } from './closeup.js';
import { diffFns, popDiffraction, popScreenPrep } from '../engines/diffraction.js';
import { popScreenState } from '../engines/pd-cavity.js';
import { changed, toast } from './actions.js';
import { checkpoint } from './tabs.js';
import { scheduleSave } from '../io/autosave.js';
import { FW, TW, WORKERS_OK, fieldWorker, fwProject, fwRequest, fwUnpackRun, newAppWorker } from '../page/workers.js';

/* ---------- Sweeps: each value oscillates on one shared clock ----------
   value = From + (To − From) · shape(f·T + phase/360), so phases are relative
   to one another and "Sync phases" simply zeroes them all. */

export const playing = new Map();          // "id|path" → { id, path }
export let clockT = 0;                     // seconds; advances while anything plays
export function setClockT(v) { return (clockT = v); }
export let animFrame = null, animLast = null;
export function setAnimLast(v) { return (animLast = v); }
export function setAnimFrame(v) { return (animFrame = v); }
export const advOpen = new Set();          // which sweeps have Advanced expanded

export const WAVES = { sine: 'Sine', triangle: 'Triangle', ramp: 'Ramp (sawtooth)' };
function waveShape(wave, u) {
  u -= Math.floor(u);
  if (wave === 'triangle') return u < 0.5 ? 2 * u : 2 - 2 * u;
  if (wave === 'ramp') return u;
  return (1 - Math.cos(2 * Math.PI * u)) / 2;
}
function waveInverse(wave, f) {    // earliest cycle position that gives fraction f
  if (wave === 'triangle') return f / 2;
  if (wave === 'ramp') return f;
  return Math.acos(clamp(1 - 2 * f, -1, 1)) / (2 * Math.PI);
}

const PARAM_LABEL = {
  x: 'X', y: 'Y', angle: 'Angle', wavelength: 'Wavelength', width: 'Beam width',
  divergence: 'Divergence', rays: 'Rays', length: 'Length', R: 'Radius', k: 'Conic',
  reflect: 'Reflectance', offset: 'Off-axis offset', diameter: 'Diameter', size: 'Size',
  thickness: 'Thickness', aperture: 'Clear aperture', outer: 'Outer size', n: 'Index',
};
export function paramLabel(path) {
  const k = path.split('.');
  if (k[0] === 'surfaces') {
    const what = k[2] === 'A' ? 'A' + (4 + 2 * +k[3]) : (PARAM_LABEL[k[2]] || k[2]);
    return 'surface ' + (+k[1] + 1) + ' ' + what.toLowerCase();
  }
  if (k[0] === 'gaps') return 'thickness ' + (+k[1] + 1);
  if (k[0] === 'materials') return 'index ' + (+k[1] + 1);
  if (k[0] === 'material') return 'index';
  return (PARAM_LABEL[k[0]] || k[0]).toLowerCase();
}

export function sweepDefault(path, v) {
  const last = path.split('.').pop();
  const spans = { x: 10, y: 10, z: 10, tip: 5, roll: 15, angle: 15, divergence: 5, width: 5, rays: 10, reflect: 50 };
  let lo, hi;
  if (last === 'wavelength') { lo = Math.max(100, v - 150); hi = v + 150; }
  else if (last === 'R' && v === null) { lo = 100; hi = 1000; }
  else if (last === 'reflect') { lo = 0; hi = 100; }
  else if (spans[last] !== undefined) { lo = v - spans[last]; hi = v + spans[last]; }
  else if (!v) { lo = 0; hi = 1; }
  else { lo = v * 0.5; hi = v * 1.5; if (lo > hi) [lo, hi] = [hi, lo]; }
  if (['rays', 'width', 'divergence', 'length', 'diameter', 'size', 'thickness'].includes(last) || path.startsWith('gaps')) lo = Math.max(last === 'rays' ? 1 : 0, lo);
  return { min: +lo.toPrecision(6), max: +hi.toPrecision(6), freq: 0.25, phase: 0, wave: 'sine' };
}
export const sweepKey = (el, path) => el.id + '|' + path;
export const isPlaying = (el, path) => playing.has(sweepKey(el, path));
export const sweepValue = (sw, frac) => sw.min + (sw.max - sw.min) * frac;
export const clockValueAt = (sw, t) => sweepValue(sw, waveShape(sw.wave, sw.freq * t + sw.phase / 360));
const clockValue = sw => clockValueAt(sw, clockT);
/* step i of n over a cycle P of the clock: the sweep at that point of its own cycles (P holds a
   whole number of them), from the fraction alone, so the same step comes out the same to the
   last digit at any rate, and finds the field rendered for it */
export const stepValue = (sw, i, n, P) => sweepValue(sw, waveShape(sw.wave, Math.max(1, Math.round(sw.freq * P)) * i / n + sw.phase / 360));
export function sweepFrac(el, path) {
  const sw = el.sweeps[path], v = getPath(el, path);
  if (!sw || sw.max === sw.min || v === null || !isFinite(v)) return 0;
  return clamp((v - sw.min) / (sw.max - sw.min), 0, 1);
}
export function allSweeps() {
  const out = [];
  for (const el of project.elements) for (const path of Object.keys(el.sweeps || {})) out.push([el, path]);
  return out;
}

function startLoop() {
  playStep = null;
  if (!animFrame) { animLast = null; animFrame = requestAnimationFrame(tick); }
  syncPanel(); updateSweepButtons();
}
export function play(el, path) {
  const sw = el.sweeps && el.sweeps[path];
  if (!sw) return;
  if (sweepJob) { sweepJob.cancel(); return; }
  // the sweeps that will move together: the ones already playing and this one
  const list = [...playing.values()].map(p => [getEl(p.id), p.path]).filter(q => q[0]);
  list.push([el, path]);
  if (list.some(([e, p]) => e.sweeps[p] && e.sweeps[p].field) && fieldWanted()) {
    const resume = [...playing.values()];
    playing.clear();
    renderSweepFrames(list, () => { for (const p of resume) playing.set(sweepKey(getEl(p.id) || {}, p.path), p); playNow(el, path); });
    return;
  }
  playNow(el, path);
}
function playNow(el, path) {
  const sw = el.sweeps && el.sweeps[path];
  if (!sw) return;
  if (!playing.size) {
    checkpoint();
    // first one to start: move the shared clock so this value carries on from where it is
    const u = waveInverse(sw.wave, sweepFrac(el, path));
    clockT = (u - sw.phase / 360) / sw.freq;
  }
  playing.set(sweepKey(el, path), { id: el.id, path });
  startLoop();
}
export function playAll() {
  const list = allSweeps();
  if (!list.length) return;
  if (sweepJob) { sweepJob.cancel(); return; }
  if (list.some(([e, p]) => e.sweeps[p].field) && fieldWanted()) {
    playing.clear();
    renderSweepFrames(list, playAllNow);
    return;
  }
  playAllNow();
}
function playAllNow() {
  const list = allSweeps();
  if (!list.length) return;
  if (!playing.size) checkpoint();
  for (const [el, path] of list) playing.set(sweepKey(el, path), { id: el.id, path });
  startLoop();
}
export function pause(el, path) {
  playing.delete(sweepKey(el, path));
  if (!playing.size) dropTraceStore();
  syncPanel(); updateSweepButtons(); scheduleSave();
}
export function pauseAll() {
  if (sweepJob) sweepJob.cancel();
  if (!playing.size) return;
  playing.clear(); dropTraceStore();
  syncPanel(); updateSweepButtons(); scheduleSave();
}
export function syncPhases() {
  const list = allSweeps();
  if (!list.length) return;
  checkpoint();
  clockT = 0;
  for (const [el, path] of list) {
    const sw = el.sweeps[path];
    sw.phase = 0;
    setParam(el, path, clockValue(sw));
  }
  toast('All sweeps set to phase 0°, starting together');
  changed(false);
}
/* ---------- Sweeps with the diffracted field rendered ahead ----------
   The field takes far longer to work out than a trace, so a sweep that shows it renders it
   first: the shared clock is sampled at the sweep's steps over one cycle (FIELD_FRAMES unless
   it sets its own), and at each sample the bench's field and the field on every screen the
   light reaches are worked out and kept under the same keys the live runs use. The sweep
   then plays by stepping between those samples, so every step finds its field ready, on
   whichever screen is opened. Whatever was not rendered (a change to the bench) is simply
   worked out live, as it always was. */
export const FIELD_FRAMES = 48;               // samples per cycle, unless a sweep sets its steps
const FIELD_KEEP = 400;                // rendered fields kept, oldest dropped first
export const fieldFrames = { bench: new Map(), screens: new Map(), closeup: new Map() };
let framesLast = FIELD_FRAMES;         // samples a cycle in the render last run, for what is kept
/* the samples a cycle for sweeps rendered together: the most any of them asks for */
const sweepFrames = list => Math.max(...list.map(([el, path]) => (el.sweeps[path] && el.sweeps[path].steps) || FIELD_FRAMES));
function keepFrame(map, key, v) {
  map.delete(key); map.set(key, v);
  // close-up pictures are big: two cycles' worth of them; the rest, a cycle at every readout at least
  const cap = map === fieldFrames.closeup ? 2 * framesLast : Math.max(FIELD_KEEP, framesLast * (1 + fieldReadouts().length));
  while (map.size > cap) map.delete(map.keys().next().value);
}
/* the 3D view's field volume, rendered with each step while that view shows the field: box() the
   board the volumes are cut to (null when the 3D view is not showing the field), keep() a step's
   volume filed under the key the view will ask for (both installed by the 3D view) */
export const sweepVol = { box: () => null, keep: () => {} };
export let sweepJob = null;                   // { list, i, n, cancel } while a sweep's field is rendering
export let fieldRendered = null;              // { keys, period } of the sweeps last rendered, for stepping
export function setFieldRendered(v) { return (fieldRendered = v); }
export let playStep = null, stepSince = 0;    // the rendered step on show while they play, and since when
export function setStepSince(v) { return (stepSince = v); }
export function setPlayStep(v) { return (playStep = v); }
/* the cycle the rendered steps cover, if they are for exactly what is playing. One sweep's steps
   are points of its cycle, so they hold at any rate: its frequency can change as it plays and
   every step is still found. Sweeps together hold while their rates keep the same cycle. */
export function renderedPeriod() {
  if (!fieldRendered || ![...playing.keys()].every(k => fieldRendered.keys.has(k))) return 0;
  const sws = [...playing.values()].map(p => { const e = getEl(p.id); return e && e.sweeps && e.sweeps[p.path]; });
  if (!sws.length || sws.some(sw => !sw || !(sw.freq > 0))) return 0;
  if (sws.length === 1 && fieldRendered.keys.size === 1) return 1 / sws[0].freq;
  const T = commonPeriod(sws);
  return T && Math.abs(T - fieldRendered.period) < 1e-9 * T ? T : 0;
}
/* the step on show is drawn in full: the bench's field and every open screen's are there */
export function sampleShown() {
  const srcs = popSources();
  if (srcs.length && lastTrace && (popKeyOf(lastTrace.beams, srcs) !== popState.key || !popState.result)) return false;
  return !popScreenState.jobs.size;
}
/* how long a render has left: the time its steps have taken so far, on average, for each left */
export function sweepEta(j) {
  if (j.t0 === null) return '';
  const done = j.i + (j.part || 0) - j.i0, dt = (performance.now() - j.t0) / 1000;
  if (done < 0.5 || dt < 1.5) return '';
  const left = dt / done * (j.n - j.i0 - done);
  return left < 1 ? '' : 'about ' + (left < 60 ? Math.ceil(left / 5) * 5 + ' s' : left < 3600 ? Math.round(left / 60) + ' min' : (left / 3600).toFixed(1) + ' h') + ' left';
}
/* screens whose diffracted field is on show: their panel is open at the Diffraction tab */
const openScreens = () => project.elements.filter(e => (e.type === 'screen' || e.type === 'mirror') && (vs(e).screenTab === 'plots' || vs(e).screenTab === 'trap') &&
  (e.id === selectedId || pins.includes(e.id)));
const fieldWanted = () => popSources().length > 0 || openScreens().length > 0;
/* a sweep can work out the diffracted field (slow) wherever there is a Gaussian beam to diffract */
export const fieldPossible = () => fieldWanted() || allSources().some(e => e.gauss) || project.elements.some(e => e.type === 'fcomp' && e.kind === 'laser');
/* While sweeps play and none of them has "Render the diffracted field" ticked, the field is held:
   nothing new is worked out (the bench shows the beams' outlines, screens and photodiodes keep
   their last field), so a sweep is quick unless the slow field is asked for. It is worked out
   again when they stop. */
export const fieldHeld = () => playing.size > 0 && !sweepJob && ![...playing.values()].some(({ id, path }) => { const e = getEl(id); return e && e.sweeps && e.sweeps[path] && e.sweeps[path].field; });
/* the elements whose diffracted field a sweep's frames work out: every screen, and a mirror
   whose Diffraction tab is open (a bench has many mirrors, and few are read) */
const fieldReadouts = () => project.elements.filter(e => e.type === 'screen' || (e.type === 'mirror' && vs(e).screenTab === 'plots'));
/* one cycle of the clock that brings every sweep in the list back to its start, if there is
   a short one: equal rates, or rates in small whole ratios */
function commonPeriod(sws) {
  const P = sws.map(sw => 1 / sw.freq), Pmax = Math.max(...P);
  for (let k = 1; k <= 8; k++) {
    const T = Pmax * k;
    if (P.every(p => Math.abs(T / p - Math.round(T / p)) < 1e-6)) return T;
  }
  return null;
}
function renderSweepFrames(list, onDone) {
  const period = commonPeriod(list.map(([el, path]) => el.sweeps[path]));
  if (!period) {
    toast('These sweeps run at unrelated rates, so their field cannot be rendered ahead; it will be worked out live.', true);
    onDone();
    return;
  }
  const saved = list.map(([el, path]) => getPath(el, path));
  const n = sweepFrames(list);
  framesLast = n;
  // every step already rendered (played before, paused, played again): straight on, no render pass
  {
    let all = true;
    for (let i = 0; i < n && all; i++) {
      list.forEach(([el, path]) => setParam(el, path, stepValue(el.sweeps[path], i, n, period)));
      traceScene();
      const srcs = popSources();
      if (srcs.length && !fieldFrames.bench.has(popKeyOf(lastTrace.beams, srcs))) all = false;
      for (const scr of fieldReadouts()) { const J = all && popScreenPrep(scr); if (J && !fieldFrames.screens.has(J.key)) all = false; }
    }
    list.forEach(([el, path], k) => setParam(el, path, saved[k]));
    traceScene();
    if (all) { fieldRendered = { keys: new Set(list.map(([el, path]) => sweepKey(el, path))), period, n }; changed(false); onDone(); return; }
  }
  // the cycle as it is now: a rate changed meanwhile moves the steps with it, each the same point of its cycle
  const cyc = () => commonPeriod(list.map(([el, path]) => el.sweeps[path] || { freq: 1 / period })) || period;
  const job = { list, i: 0, n, t0: null, i0: 0 };
  const timing = i => { if (job.t0 === null) { job.t0 = performance.now(); job.i0 = i; } };   // timed from the first step that needs working out
  sweepJob = job;
  const finish = ok => {
    if (sweepJob !== job) return;
    sweepJob = null;
    list.forEach(([el, path], k) => setParam(el, path, saved[k]));
    if (ok) fieldRendered = { keys: new Set(list.map(([el, path]) => sweepKey(el, path))), period: cyc(), n };
    changed(false);
    if (ok) onDone();
    else toast('Stopped rendering the field');
  };
  job.cancel = () => finish(false);
  // several workers at once, each step whole on one of them, the page left alone (see swPool)
  const pool = !closeupOnShow() && swPool();
  if (pool) { renderOnPool(pool, list, n, cyc(), job, onDone); return; }
  if (fieldWorker()) {
    // the same, each field worked out in the worker while the page stays free
    const live = () => sweepJob === job;
    (async () => {
      for (let i = 0; i < n; i++) {
        job.i = i;
        const at = () => list.forEach(([el, path]) => setParam(el, path, stepValue(el.sweeps[path], i, n, cyc())));
        at();
        job.stage = 'tracing'; job.part = 0;
        traceScene();
        requestRender(); syncPanel();
        await new Promise(r => setTimeout(r, 0));
        if (!live()) return;
        const srcs = popSources();
        if (srcs.length) {
          traceScene();
          if (MODS.packs.size) { await modsReady(); if (!live()) return; }
          const key = popKeyOf(lastTrace.beams, srcs), beams = lastTrace.beams;
          if (!fieldFrames.bench.has(key)) {
            timing(i); job.stage = 'the bench';
            const o = await fwRequest('bench', 'sweep', { vol: sweepVol.box() });
            if (!live()) return;
            if (o && o.key === key) { keepFrame(fieldFrames.bench, key, fwUnpackRun(o.R, beams)); if (o.vol) sweepVol.keep(o.vol.key, o.vol.tab, o.vol.bb, o.vol.V); requestRender(); }
          }
          // zoomed in to the close-up: its picture for this frame too, for this view
          if (closeupOnShow() && !fieldFrames.closeup.has(closeupKey(key))) {
            job.stage = 'the close-up';
            const vk = closeupKey(key), view = { cx: V().cx, cy: V().cy, s: V().scale, W, H, tab: project.tab };
            const o = await fwRequest('closeup', 'sweep', { key, view, step: CLOSEUP_STEP, log: fieldDec(lightOf().scale) });
            if (!live()) return;
            if (o && !o.mismatch && o.img) keepFrame(fieldFrames.closeup, vk, closeupFrame(o, CLOSEUP_STEP));
          }
        }
        const screens = fieldReadouts();
        for (const [k, scr] of screens.entries()) {
          job.part = (k + 1) / (screens.length + 1);
          at();
          traceScene();
          const J = popScreenPrep(scr);
          if (!J || fieldFrames.screens.has(J.key)) continue;
          timing(i); job.stage = scr.name;
          const o = await fwRequest('screen', 'sweep', { id: scr.id });
          if (!live()) return;
          if (o && o.key === J.key && o.D) keepFrame(fieldFrames.screens, J.key, diffFns(o.D));
        }
      }
      finish(true);
    })().catch(() => {
      // the worker failed: start the rendering again on the page
      if (!live()) return;
      sweepJob = null;
      list.forEach(([el, path], k) => setParam(el, path, saved[k]));
      renderSweepFrames(list, onDone);
    });
    updateSweepButtons(); syncPanel();
    return;
  }
  // run a field to the end, a slice at a time, handing control back between slices
  const run = function* (gen) { let r; while (!(r = gen.next()).done) yield; return r.value; };
  const frames = (function* () {
    for (let i = 0; i < n; i++) {
      job.i = i;
      list.forEach(([el, path]) => setParam(el, path, stepValue(el.sweeps[path], i, n, cyc())));
      job.stage = 'tracing'; job.part = 0;
      traceScene();
      requestRender(); syncPanel();
      yield;
      const srcs = popSources();
      if (srcs.length) {
        traceScene();
        const key = popKeyOf(lastTrace.beams, srcs);
        if (!fieldFrames.bench.has(key)) {
          timing(i); job.stage = 'the bench';
          const n = lastTrace.beams.filter(b => srcs.some(e => e.id === b.src)).length;
          const R = yield* run(popRunGen(lastTrace.beams, srcs, { draw: true, per: clamp(Math.floor(POP_SLICES / Math.max(1, n)), 6, 48) }));
          keepFrame(fieldFrames.bench, key, R);
          requestRender();
        }
        if (closeupOnShow() && fieldFrames.bench.has(key) && !fieldFrames.closeup.has(closeupKey(key))) {
          job.stage = 'the close-up';
          const view = { cx: V().cx, cy: V().cy, s: V().scale, W, H, tab: project.tab };
          keepFrame(fieldFrames.closeup, closeupKey(key), closeupFrame(closeupImage(benchFrame(key).segs, view, CLOSEUP_STEP, fieldDec(lightOf().scale)), CLOSEUP_STEP));
          yield;
        }
      }
      const screens = fieldReadouts();
      for (const [k, scr] of screens.entries()) {
        job.part = (k + 1) / (screens.length + 1);
        traceScene();                  // the bench may have been redrawn meanwhile: this sample's trace
        const J = popScreenPrep(scr);
        if (!J || fieldFrames.screens.has(J.key)) continue;
        timing(i); job.stage = scr.name;
        const R = yield* run(popRunGen(lastTrace.beams, J.srcs, { keep: J.keep }));
        traceScene();
        keepFrame(fieldFrames.screens, J.key, popDiffraction(scr, R));
      }
    }
  })();
  const step = () => {
    if (sweepJob !== job) return;
    const until = performance.now() + 40;
    let r;
    do r = frames.next(); while (!r.done && performance.now() < until);
    if (r.done) finish(true); else setTimeout(step, 0);
  };
  updateSweepButtons(); syncPanel();
  setTimeout(step, 0);
}

/* ---------- A sweep's field rendered on several workers at once ----------
   Each worker holds the bench as it was when Play was pressed; for a step it is sent only the
   swept values, which it sets as the page would (setParam), traces, and works out the bench's
   field and every screen's there, so what comes back is filed under the very keys the page
   will ask for when it plays that step. The page itself is left alone meanwhile, so the sweep
   can play as the steps come in. They are rendered coarse to fine: every eighth first, then
   the fourths, the halves and the rest; once the first pass is in, it plays, each step it has
   not got yet shown as the nearest one before it that it has, so the motion is there at once
   and fills in. As many workers as the computer has cores to spare, up to six. */
export const SW = { pool: [], failed: false, idle: null };
const swSize = () => Math.max(1, Math.min(6, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4) - 1));
export function swPool() {
  if (SW.failed || TEST_MODE || IN_WORKER || !WORKERS_OK || typeof OffscreenCanvas === 'undefined') return null;
  clearTimeout(SW.idle);
  try {
    while (SW.pool.length < swSize()) {
      const W = { w: newAppWorker(), sent: null, jobs: new Map(), seq: 0 };
      W.w.onmessage = e => { const j = W.jobs.get(e.data.id); if (!j) return; W.jobs.delete(e.data.id); if (e.data.ok) j.resolve(e.data.out); else j.reject(new Error(e.data.err)); };
      W.w.onerror = e => { e.preventDefault(); for (const j of W.jobs.values()) j.reject(new Error(e.message || 'a render worker stopped')); W.jobs.clear(); };
      SW.pool.push(W);
    }
  } catch (err) { SW.failed = true; swDrop(); return null; }
  return SW.pool;
}
export function swAsk(W, proj, args, kind) {
  return new Promise((resolve, reject) => {
    const id = ++W.seq;
    W.jobs.set(id, { resolve, reject });
    const msg = { id, kind: kind || 'step', args, mods: modDelta(W.w) };
    if (W.sent !== proj) { msg.proj = proj; W.sent = proj; }
    W.w.postMessage(msg);
  });
}
export function swDrop() { clearTimeout(SW.idle); for (const W of SW.pool) W.w.terminate(); SW.pool = []; }
// kept a minute after a render, for the next; then let go (each holds a copy of the tool)
export const swRelease = () => { clearTimeout(SW.idle); SW.idle = setTimeout(swDrop, 60000); };
/* A bench with mods: their code runs only on the page, so a step's results (for its swept values)
   are asked for here, with the bench set to the step and traced, and waited for, before the step
   goes to a worker, which then has them (see modDelta). The page is put back after each. */
async function modsReady() {
  for (let i = 0; i < 30 && MODS.waiting.size; i++) { await Promise.allSettled([...MODS.waiting.values()]); setLastTraceKey(null); traceScene(); }
}
function modsPrep(list) {
  if (!MODS.packs.size) return () => Promise.resolve();
  let chain = Promise.resolve();
  return sets => (chain = chain.then(async () => {
    const saved = list.map(([el, path]) => getPath(el, path));
    for (const [id, path, v] of sets) { const el = getEl(id); if (el) setParam(el, path, v); }
    setLastTraceKey(null); traceScene();
    await modsReady();
    list.forEach(([el, path], k) => setParam(el, path, saved[k]));
    setLastTraceKey(null); traceScene();
  }));
}
function renderOnPool(pool, list, n, period, job, onDone) {
  const live = () => sweepJob === job, proj = fwProject(), ids = fieldReadouts().map(e => e.id), vol = sweepVol.box(), prep = modsPrep(list);
  const keys = new Set(list.map(([el, path]) => sweepKey(el, path)));
  // coarse to fine: every 8th step, then every 4th, 2nd, and the rest
  const order = [], seen = new Set();
  for (let st = 8; st >= 1; st >>= 1) for (let i = 0; i < n; i += st) if (!seen.has(i)) { seen.add(i); order.push(i); }
  const first = Math.ceil(n / 8), done = new Set();
  let next = 0, started = false;
  job.t0 = performance.now(); job.i0 = 0; job.i = -1; job.part = 0;
  job.stage = pool.length > 1 ? pool.length + ' at once' : '';
  const play = () => { if (started || !live()) return; started = true; fieldRendered = { keys, period, n, done }; onDone(); };
  const runOne = async W => {
    while (live() && next < order.length) {
      const i = order[next++];
      const sets = list.map(([el, path]) => [el.id, path, stepValue(el.sweeps[path], i, n, period)]);
      await prep(sets);
      if (!live()) return;
      const o = await swAsk(W, proj, { sets, ids, vol });
      if (!live()) return;
      if (o.bench) keepFrame(fieldFrames.bench, o.bench.key, { packed: o.bench.R });
      if (o.vol) sweepVol.keep(o.vol.key, o.vol.tab, o.vol.bb, o.vol.V);
      for (const S of o.screens) if (S && S.D) keepFrame(fieldFrames.screens, S.key, diffFns(S.D));
      done.add(i); job.i = done.size - 1;
      if (!started && done.size >= first && order.slice(0, first).every(k => done.has(k))) play();
      requestRender(); syncPanel();
    }
  };
  job.cancel = () => { if (!live()) return; sweepJob = null; swDrop(); changed(false); toast('Stopped rendering the field'); };
  Promise.all(pool.map(runOne)).then(() => {
    if (!live()) return;
    sweepJob = null; swRelease();
    fieldRendered = { keys, period, n };
    changed(false);
    if (!started) { started = true; onDone(); }
  }, err => {
    // a worker failed: the pool is not used again, and the render starts again the old way
    if (!live()) return;
    console.warn('JEKray render workers:', err && err.message);
    sweepJob = null; SW.failed = true; swDrop();
    renderSweepFrames(list, started ? () => {} : onDone);
  });
  updateSweepButtons(); syncPanel();
}
/* a rendered bench field, put back together against the trace the page has for it, the first time it is drawn */
export function benchFrame(key) {
  const f = fieldFrames.bench.get(key);
  if (f && f.packed) { const R = fwUnpackRun(f.packed, lastTrace.beams); fieldFrames.bench.set(key, R); return R; }
  return f;
}

/* ---------- What is being worked out: a bar at the bottom left of the window ----------
   Every background job leaves its state where it runs; this reads them all a few times a
   second and says what the slowest thing in progress is. Steps it can count show a filling
   bar, the rest a moving one. It shows only once a job has run for a moment, so quick ones
   do not flicker it. */
function activityNow() {
  if (sweepJob) {
    const j = sweepJob, what = j.stage === 'the bench' ? 'the bench' : j.stage && j.stage !== 'tracing' ? j.stage : '';
    const eta = sweepEta(j);
    return { text: 'Rendering the field for the sweep: step ' + (j.i + 1) + ' of ' + j.n + (what ? ', ' + what : '') + (eta ? ' (' + eta + ')' : ''),
      frac: (j.i + (j.part || 0)) / j.n };
  }
  if (mcJob) return { text: 'Tolerance study: ' + mcJob.i + ' of ' + mcJob.n + ' trials', frac: mcJob.i / mcJob.n };
  const jobs = [];
  if (popState.job) jobs.push('the diffracted field on the bench');
  const J0 = [...popScreenState.jobs.values()], scr = J0.map(J => J.el.name);
  if (scr.length) jobs.push((J0[0].finishing ? 'the figures at ' : 'the field at ') + scr[0] + (scr.length > 1 ? ' and ' + (scr.length - 1) + ' more screen' + (scr.length > 2 ? 's' : '') : ''));
  if (cavJob && !cavJob.done) jobs.push('the cavity’s steady state');
  if (spmAsked.size) jobs.push('the pulse through the fibre');
  if (TW.full) jobs.push('the rays');
  if (!jobs.length && FW.busy) jobs.push({ detector: 'the light at the photodiodes', closeup: 'the close-up', cavity: 'the cavity’s steady state', screen: 'the field at the screens', bench: 'the diffracted field on the bench' }[FW.busy.kind] || 'the field');
  if (!jobs.length) return null;
  const text = jobs.join(', ');
  return { text: 'Computing ' + text, frac: null };
}
const activity = { box: null, text: null, bar: null, since: 0, now: false, shown: 0 };
/* for a job about to block the page: show the bar straight away, skipping the usual delay */
export function showActivityNow() { if (TEST_MODE) return; activity.now = true; updateActivity(); }
export function updateActivity() {
  const a = activityNow(), now = performance.now();
  if (!a) {
    activity.since = 0;
    // once up, it stays long enough to read rather than flashing
    if (activity.box && !activity.box.hidden && now - activity.shown > 400) activity.box.hidden = true;
    return;
  }
  if (!activity.since) activity.since = now;
  if (now - activity.since < 250 && !activity.now) return;
  activity.now = false;
  if (!activity.box) {
    activity.label = h('span');
    activity.pct = h('span', { class: 'rt-act-pct' });
    activity.text = h('span', { class: 'rt-act-text' }, activity.label, activity.pct);
    activity.bar = h('i');
    activity.box = h('div', { class: 'rt-activity', role: 'status', 'aria-live': 'polite' }, activity.text, h('div', { class: 'rt-act-bar' }, activity.bar));
    document.getElementById('stage').append(activity.box);
  }
  if (activity.box.hidden) activity.shown = now;
  activity.box.hidden = false;
  if (activity.label.textContent !== a.text) activity.label.textContent = a.text;
  const pct = a.frac === null ? '' : Math.round(100 * clamp(a.frac, 0, 1)) + '%';
  if (activity.pct.textContent !== pct) activity.pct.textContent = pct;
  activity.box.classList.toggle('indeterminate', a.frac === null);
  activity.bar.style.width = a.frac === null ? '' : (100 * clamp(a.frac, 0, 1)).toFixed(1) + '%';
}

