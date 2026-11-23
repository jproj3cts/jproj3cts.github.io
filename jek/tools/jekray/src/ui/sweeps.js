import { IN_WORKER, TEST_MODE, clamp } from '../core/constants.js';
import { spmAsked } from '../core/pulses.js';
import { V, project, selectedId } from '../state/project.js';
import { fieldDec, getEl, lightOf } from '../state/elements.js';
import { keepTraceFrom, lastTrace, lastTraceMs, setLastTraceKey, traceScene } from '../engines/trace.js';
import { STEP_BUDGET, setStepBudget, stepBytes, stepBytesAt, stepClaim, stepInvalidate, stepKeep, stepKeyOf, stepMaps, stepRunBegin, stepStore, stepSwap } from '../engines/sweep-store.js';
import { H, W, requestRender, setDrawHeld } from './render.js';
import { SWEEP_STEPS_MAX, getPath, setParam } from '../state/params.js';
import { MODS } from '../core/modulators.js';
import { modDelta } from '../engines/mods.js';
import { mcJob, tick, updateSweepButtons } from './optimise.js';
import { pins, syncPanel, vs } from './panel.js';
import { h } from './dom.js';
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
import { track } from '../io/usage.js';
import { particlesAhead, particlesAheadDone, particlesAheadNow, scatActivity, scatAheadEta, scatAheadOn, scatWork, scatterAheadStop } from "./scatter.js";

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
export function stepValue(sw, i, n, P) {
  let j = Math.max(1, Math.round(sw.freq * P)) * i;
  // A sine or a triangle comes back the way it went: its step on the way down is the very step on the way up (the same
  // number, so the same state: worked out once, not once each way with a last digit between them). The two are j and
  // n − m − j, m twice the phase in steps, where that is a whole number (always, with no phase); the lower stands for both.
  if (sw.wave !== 'ramp') {
    const m = 2 * (sw.phase || 0) * n / 360, mi = Math.round(m);
    if (Math.abs(m - mi) < 1e-9) { j = ((j % n) + n) % n; const t = (((n - mi - j) % n) + n) % n; if (t < j) j = t; }
  }
  return sweepValue(sw, waveShape(sw.wave, j / n + sw.phase / 360));
}
/* The slider of a sweep at a fraction of its range: the nearest of the steps it plays on, so each place it is pulled to
   is a step already worked out (its trace, field and particle's answer kept) and not a state between two of them,
   worked out from nothing at every move of the hand */
export function sweepSnap(el, path, frac) {
  const sw = el.sweeps[path], want = sweepValue(sw, frac);
  const R = fieldRendered && fieldRendered.keys.has(sweepKey(el, path)) ? fieldRendered : null, n = R ? R.n : fieldFramesOf(sw), P = R ? R.period : 1 / sw.freq;
  let best = want, d = Infinity;
  for (let i = 0; i < n; i++) { const v = stepValue(sw, i, n, P), e = Math.abs(v - want); if (e < d) { d = e; best = v; } }
  return best;
}
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

/* The render workers' traces of the steps (asked for on a bench slow to trace: TRACE_SHARE_MS), kept as the page's own
   (engines/trace.js keepTraceFrom, in the sweeps' store with the step they are for: its key, given, or the step the
   worker was sent), so that the sweep's first cycle draws each step rather than tracing it here, a long wait at every
   step. */
export const TRACE_SHARE_MS = 30;
export function traceAhead(t, step) {
  if (t) keepTraceFrom(t.rest, t.T, t.ms, t.V, step);
}
/* the run the sweeps' store keeps steps for (engines/sweep-store.js): these sweeps over n steps of the cycle */
function sweepRun(list, n, period) {
  const ask = (k, i) => stepValue(list[k][0].sweeps[list[k][1]], i, n, period(list[k][0], list[k][1]));
  // each step's values as the bench holds them (a setting keeps to its limits, an angle comes round): set, read, put back
  const saved = list.map(([el, path]) => getPath(el, path)), held = [];
  for (let i = 0; i < n; i++) { list.forEach(([el, path], k) => setParam(el, path, ask(k, i))); held.push(list.map(([el, path]) => getPath(el, path))); }
  list.forEach(([el, path], k) => setParam(el, path, saved[k]));
  return stepRunBegin(list.map(([el, path]) => [el.id, path]), n, ask, sweepShapes(list), (k, i) => held[i][k]);
}
function startLoop() {
  playStep = null;
  if (!animFrame) { animLast = null; animFrame = requestAnimationFrame(tick); }
  scatWork.letFinish = () => playing.size > 0;
  if (!sweepJob && !renderedPeriod()) aheadPlain();
  syncPanel(); updateSweepButtons();
}
/* Sweeps playing on steps of their own (no field rendered ahead), all at one rate and number of steps: the particles'
   scattering for each step solved ahead, as the play will set it (ui/optimise.js tick), so a step that takes longer to
   solve than it is shown is ready when it comes round. (A sweep with no Steps set plays on its automatic steps: the same.) */
/* (their run, for the store: the steps they share; none when each steps to its own count or rate) */
function plainRun(list) {
  if (!list.length) return 0;
  const sw0 = list[0][0].sweeps[list[0][1]], n = fieldFramesOf(sw0);
  if (list.some(([e, p]) => fieldFramesOf(e.sweeps[p]) !== n || e.sweeps[p].freq !== sw0.freq)) { stepInvalidate('run'); return 0; }
  sweepRun(list, n, (e, p) => 1 / e.sweeps[p].freq);
  return n;
}
function aheadPlain() {
  const list = [...playing.values()].map(p => [getEl(p.id), p.path]).filter(([e, p]) => e && e.sweeps && e.sweeps[p]);
  const n = plainRun(list);
  if (!n || !project.elements.some(e => e.type === 'particle')) return;
  // (it plays at once; the particles' scattered light is added when every step's is solved: scatLayerHeld)
  const run = particlesAhead(list, n, (e, p, i) => stepValue(e.sweeps[p], i, n, 1 / e.sweeps[p].freq), () => list.every(([e, p]) => getEl(e.id) && e.sweeps && e.sweeps[p] && playing.has(sweepKey(e, p))));
  Promise.resolve(run).then(() => { requestRender(); syncPanel(); });
}
export function play(el, path) {
  const sw = el.sweeps && el.sweeps[path];
  if (!sw) return;
  track('sweep', el.type);
  // the sweeps that will move together: the ones already playing and this one (and, during a render, the ones it is
  // for: the render starts again with this one too, and they all play once it is done)
  const list = [...playing.values()].map(p => [getEl(p.id), p.path]).filter(q => q[0]);
  if (sweepJob) {
    if (jobHas(sweepJob, el, path)) { sweepJob.cancel(); return; }
    for (const q of sweepJob.list) if (getEl(q[0].id) && q[0].sweeps && q[0].sweeps[q[1]] && !list.some(([e, p]) => e.id === q[0].id && p === q[1])) list.push(q);
    sweepJob.quiet = true; sweepJob.cancel();
  }
  if (!list.some(([e, p]) => e.id === el.id && p === path)) list.push([el, path]);
  if (fieldWanted()) {
    playing.clear();
    renderSweepFrames(list, () => { for (const [e, p] of list) if (e !== el && getEl(e.id) && e.sweeps && e.sweeps[p]) playing.set(sweepKey(e, p), { id: e.id, path: p }); playNow(el, path); });
    return;
  }
  for (const [e, p] of list) if (e !== el && !playing.has(sweepKey(e, p))) playing.set(sweepKey(e, p), { id: e.id, path: p });
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
  if (sweepJob) { sweepJob.quiet = true; sweepJob.cancel(); }     // rendered again, for all of them
  if (fieldWanted()) {
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
/* A sweep's Steps changed while its field is being rendered or played: the frames rendered are for the old steps,
   and playing on without them works the field out live at every step (it never catches up). So the render starts
   again at the new steps, and what was playing (or about to) plays on once it is done. */
export function sweepStepsChanged(why) {
  fieldRendered = null;
  stepInvalidate(why || 'run');
  const job = sweepJob;
  const list = job ? job.list.filter(([e]) => getEl(e.id)) : [...playing.values()].map(p => [getEl(p.id), p.path]).filter(q => q[0]);
  // (playing with no field to render: the steps it plays on now are its run)
  // (and its particles' scattering solved ahead for them, what was being solved for the old steps dropped)
  if (list.length && !fieldWanted() && !job && playing.size) { scatterAheadStop(); aheadPlain(); }
  if (!list.length || !fieldWanted()) return;
  if (job) { job.quiet = true; job.cancel(); }
  playing.clear();
  renderSweepFrames(list, () => { for (const [el, path] of list) if (el.sweeps && el.sweeps[path]) playing.set(sweepKey(el, path), { id: el.id, path }); startLoop(); syncPanel(); updateSweepButtons(); });
}
/* A sweep's own settings changed in its panel (what: steps, min, max, phase, wave, freq), once the edit is finished. If it
   is playing or rendering, its steps are other steps now: everything worked out ahead for them starts again (as for
   Steps). Its rate alone moves no step (they are points of its cycle), unless its steps are the automatic count, which
   follows the rate, and no field rendered holds it to the count it had. */
export function sweepEdited(el, path, what) {
  if (!isPlaying(el, path) && !jobHas(sweepJob, el, path)) return;
  if (what === 'freq' && ((el.sweeps[path] && el.sweeps[path].steps) || sweepJob || renderedPeriod() > 0)) return;
  sweepStepsChanged();
}
/* The bench edited while a sweep renders or plays its field. What the frames hold is the light, keyed by the bench's
   field (popKeyOf over the trace): an edit the light never reaches (a part off the beam, a drawing, a part on another
   tab, a name) leaves that key as it was, and the render and the play carry on with every frame. An edit that changes
   the light changes it: the frames are for a bench that is gone, so the render starts again for this one and what was
   playing plays on (as for a change of Steps). Looked at once the edits settle, at the sweep's first step. */
let sweepEditTimer = 0;
export function sweepBenchEdited() {
  if (!sweepJob && !(fieldRendered && fieldRendered.ref)) return;
  clearTimeout(sweepEditTimer);
  sweepEditTimer = setTimeout(sweepEditCheck, 350);
}
function sweepEditCheck() {
  const job = sweepJob, ref = job ? job.ref : fieldRendered && fieldRendered.ref;
  // (the field turned off, or another tab on show: nothing drawn from the frames, which stay)
  if (!ref || !ref.key || !popSources().length || ref.tab !== project.tab) return;
  const list = job ? job.list.filter(([e]) => getEl(e.id)) : [...playing.values()].map(p => [getEl(p.id), p.path]).filter(q => q[0]);
  if (!list.length || list.some(([e, p]) => !e.sweeps || !e.sweeps[p])) { if (job) { job.quiet = true; job.cancel(); } return; }
  const shape = ref.shape === sweepShapes(list);
  if (shape && sweepRef(list, ref.n, ref.period).key === ref.key) return;
  // (the steps as they were, the light another: what is kept is no step's of the run to come)
  sweepStepsChanged(shape ? 'bench' : 'run');
}
/* the field's key at a sweep's first step, the bench put back after: what its rendered frames depend on (in 3D, with the
   board as the light meets it, which the volumes are cut to) */
function sweepRef(list, n, period) {
  const srcs = popSources();
  if (!srcs.length) return { key: '', n, period, tab: project.tab };
  const saved = list.map(([el, path]) => getPath(el, path));
  list.forEach(([el, path]) => setParam(el, path, stepValue(el.sweeps[path], 0, n, period)));
  traceScene();
  const key = popKeyOf(lastTrace.beams, srcs) + '|' + sweepVol.boxKey();
  list.forEach(([el, path], k) => setParam(el, path, saved[k]));
  traceScene();
  return { key, n, period, shape: sweepShapes(list), tab: project.tab };
}
/* what a sweep's steps are, other than its rate (which the steps hold at): From, To, its phase and shape; the frames
   are for these, so a change to any of them while its field is rendered renders it again (as Steps does) */
const sweepShapes = list => JSON.stringify(list.map(([el, path]) => { const sw = el.sweeps && el.sweeps[path]; return sw ? [el.id, path, sw.min, sw.max, sw.phase, sw.wave, sw.steps] : null; }));
/* whether a render is for this sweep (or, without a path, any of this part's) */
export const jobHas = (job, el, path) => !!job && job.list.some(([e, p]) => e.id === el.id && (path === undefined || p === path || (path.endsWith('.') && p.startsWith(path))));
/* a sweep paused, removed, typed over or its part deleted: the render for it is stopped too (else it renders on, and
   when done starts the sweep playing again, over what was typed) */
export function cancelJobFor(el, path) {
  if (!jobHas(sweepJob, el, path)) return false;
  sweepJob.quiet = true; sweepJob.cancel();
  return true;
}
export function pause(el, path) {
  cancelJobFor(el, path);
  playing.delete(sweepKey(el, path));
  // (what is kept for the steps stays: the slider pulled along a paused sweep finds each step as it was worked out)
  if (!playing.size) { scatterAheadStop(); holdEnd(); }
  syncPanel(); updateSweepButtons(); scheduleSave(); requestRender();         // (drawn again: the rays finer once nothing plays)
}
export function pauseAll() {
  if (sweepJob) sweepJob.cancel();
  holdEnd();
  if (!playing.size) return;
  playing.clear(); scatterAheadStop();
  syncPanel(); updateSweepButtons(); scheduleSave(); requestRender();
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
export const FIELD_FRAMES = 48;               // samples per cycle at the least, unless a sweep sets its steps
/* the samples a cycle a sweep's field is rendered at, unless it sets its own steps: enough to play at about 30
   a second (a slow sweep needs more of them to glide rather than step), from FIELD_FRAMES to SWEEP_STEPS_MAX. A sweep with
   no Steps set plays on these steps whether or not the field is rendered (ui/optimise.js tick) */
export const fieldFramesOf = sw => (sw && sw.steps) || clamp(Math.round(30 / ((sw && sw.freq) || 1)), FIELD_FRAMES, SWEEP_STEPS_MAX);
const FIELD_KEEP = 400;                // rendered fields kept, oldest dropped first
/* (the frames are layers of the sweeps' one store, engines/sweep-store.js, where every step's kept things are, and which
   keeps them within the budget) */
export const fieldFrames = { bench: stepMaps.bench, screens: stepMaps.screens, closeup: stepMaps.closeup };
let framesLast = FIELD_FRAMES;         // samples a cycle in the render last run, for what is kept
/* the samples a cycle for sweeps rendered together: the most any of them asks for */
const sweepFrames = list => Math.max(...list.map(([el, path]) => fieldFramesOf(el.sweeps[path])));
/* What a sweep's steps kept may take, in bytes, the frames of all three kinds together: an eighth of the computer's
   memory (as the browser says it, at most 8 GB), from 384 MB to 1.5 GB. A frame of a 2D field holds every segment's
   starting field (59 segments of 256 × 256 points, both polarisations, are 140 MB a step), and a cycle of 240 such steps
   kept whole ran the page out of memory: its tab was closed. Past the budget the oldest go first (the store: what is no
   step's of the sweeps playing, then their steps whole), and a render whose cycle would not fit renders fewer of its
   steps, evenly spread (renderStride), the rest shown as the step before them, as while it fills in. The store's own
   budget is this and STEP_EXTRA more, for the steps' 3D volumes, particles' answers and traces. */
export const FRAME_BUDGET = STEP_BUDGET;
let frameBudget = FRAME_BUDGET;
/* (tests) a smaller budget (none: put back) */
export function setFrameBudget(b) { frameBudget = b > 0 ? b : FRAME_BUDGET; setStepBudget(b > 0 ? b : 0); }
/* a frame's bytes: its typed arrays (each buffer once), its pictures; not the trace's beams and sources it points at */
export function frameBytes(v) {
  const seen = new Set();
  const walk = (o, d) => {
    if (!o || typeof o !== 'object' || d > 6 || seen.has(o)) return 0;
    seen.add(o);
    if (ArrayBuffer.isView(o)) { if (seen.has(o.buffer)) return 0; seen.add(o.buffer); return o.buffer.byteLength; }
    if (o instanceof ArrayBuffer) return o.byteLength;
    if ((typeof ImageBitmap !== 'undefined' && o instanceof ImageBitmap) || (typeof HTMLCanvasElement !== 'undefined' && o instanceof HTMLCanvasElement) ||
      (typeof OffscreenCanvas !== 'undefined' && o instanceof OffscreenCanvas)) return 4 * o.width * o.height;
    if (typeof ImageData !== 'undefined' && o instanceof ImageData) return o.data.byteLength;
    let b = 0;
    for (const k in o) if (k !== 'b' && k !== 'src' && k !== 'leg') b += walk(o[k], d + 1);
    return b;
  };
  return walk(v, 0);
}
export function framesBytes() { return stepBytes(['bench', 'screens', 'closeup']); }
/* the bytes kept for a render's step since it began (stepDone): its frames and its 3D volume */
const keptNow = { get bytes() { return stepStore.kept; }, set bytes(v) { stepStore.kept = v; } };
/* a frame kept, for the step given (its key: stepKeyOf) or the step the bench is at */
export function keepFrame(map, key, v, step) {
  const name = map === fieldFrames.closeup ? 'closeup' : map === fieldFrames.screens ? 'screens' : 'bench';
  // close-up pictures are big: two cycles' worth of them; the rest, a cycle at every readout at least; all of them within
  // the budget
  const cap = name === 'closeup' ? 2 * framesLast : Math.max(FIELD_KEEP, framesLast * (1 + fieldReadouts().length));
  stepKeep(name, key, v, { bytes: frameBytes(v), step, cap, count: true });
}
/* The steps of a render apart, so that its cycle fits the budget: 1 (every step) unless a step's frames (stepBytes) times
   the steps would not fit in most of it. A sweep rendered so plays the steps rendered, each shown until the next. */
export function renderStride(n, stepBytes) {
  if (!(stepBytes > 0)) return 1;
  const fit = Math.max(1, Math.floor(0.85 * frameBudget / stepBytes));
  return fit >= n ? 1 : Math.ceil(n / fit);
}
/* a render's step done (sequential renders): kept among those rendered, and after the first, the steps apart worked out */
function stepDone(job, i) {
  job.done.add(i);
  // (by what the step holds, kept now or there already: a step found kept, as the first is after a change of Steps, kept
  // nothing now, and taken for an empty one let a cycle too large for the budget be rendered whole)
  if (job.done.size === 1) { job.stride = job.rs.k = renderStride(job.n, Math.max(keptNow.bytes, stepBytesAt())); if (job.stride > 1) strideNote(job.n, job.stride); }
  keptNow.bytes = 0;
}
const strideNote = (n, k) => toast('This sweep\u2019s field is too large to keep at all ' + n + ' steps in this browser\u2019s memory: one step in ' + k + ' is rendered, each shown until the next', true);
/* the 3D view's field volume, rendered with each step while that view shows the field: box() the
   board the volumes are cut to (null when the 3D view is not showing the field), keep() a step's
   volume filed under the key the view will ask for (both installed by the 3D view) */
// (shown: in the 3D view, whether the step on show has its field there: null when the 3D view is not showing it)
// (keyAt: the key a step's volume is kept under, for the bench's field key, or null when the 3D view shows no field)
export const sweepVol = { box: () => null, keep: () => {}, shown: () => null, has: () => true, boxKey: () => '', begin: () => {}, mark: () => {}, keyAt: () => null };
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
  if (fieldHeld()) return true;                  // (the field still rendering: the step is shown without it)
  const srcs = popSources();
  // in 3D the bench's field is the 3D view's (the 2D one is not drawn there, so would never be in step: each step
  // would wait out its 4 s)
  const in3d = srcs.length ? sweepVol.shown() : null;
  if (in3d === false) return false;
  if (in3d === null && srcs.length && lastTrace && (popKeyOf(lastTrace.beams, srcs) !== popState.key || !popState.result)) return false;
  return !popScreenState.jobs.size;
}
/* how long a render has left: the time its steps have taken so far, on average, for each left */
export function sweepEta(j) {
  if (j.t0 === null) return '';
  const done = j.i + (j.part || 0) - j.i0, dt = (performance.now() - j.t0) / 1000;
  if (done < 0.5 || dt < 1.5) return '';
  return leftText(dt / done * (j.n - j.i0 - done));
}
/* time left as said on the bars: about 25 s, about 1 min 20 s, about 1.5 h */
export function leftText(left) {
  if (!(left >= 1)) return '';
  if (left < 60) return 'about ' + Math.ceil(left / 5) * 5 + ' s left';
  if (left < 3600) { const s = Math.round(left / 10) * 10, m = Math.floor(s / 60), r = s % 60; return 'about ' + m + ' min' + (r ? ' ' + r + ' s' : '') + ' left'; }
  return 'about ' + (left / 3600).toFixed(1) + ' h left';
}
/* ---------- A long render held ----------
   (Only where the field is rendered before the sweep plays, not beside it: zoomed in to the close-up, a bench with
   modules, no workers. Where it can play beside the render it plays at once, in layers: see fieldHeld.)
   A sweep whose work ahead (its field's frames, its particles' scattering) is predicted to take longer than SWEEP_HOLD_S
   does not play its steps as they trickle in: the bench is held as it was (render.js draws nothing new), the bars alone
   say how it goes, and the cycle plays once all of it is ready. The prediction is the time the steps worked out so far
   have taken, for every step there is to do, made again as each finishes: one that crosses the limit part way holds from
   there. Under the limit the sweep behaves as it always has. Pause or Stop let go at once. */
export const SWEEP_HOLD_S = 30;
let holdLimit = SWEEP_HOLD_S;
/* (the tests: a lower limit, so a quick sweep counts as a long one; none puts it back) */
export function setSweepHoldLimit(s) { holdLimit = s > 0 ? s : SWEEP_HOLD_S; }
export const HOLD = { on: false, wait: 0, plain: false };
export const sweepHolding = () => HOLD.on;
/* the whole of the work ahead, predicted (s), or null before a step has been timed: the longer of the field's and the particles' */
export function sweepPredict(j) {
  let T = null;
  if (j && j.t0 !== null && j.t0 !== undefined) {
    const done = j.i + (j.part || 0) - j.i0 + (j.pool ? 1 : 0), dt = (performance.now() - j.t0) / 1000;
    if (done >= 1) T = dt / done * (j.n - j.i0);
  }
  const A = scatAheadEta();
  if (A && A.done >= 1) T = Math.max(T || 0, A.dt / A.done * A.of);
  return T;
}
/* the time left on whatever is still worked out ahead (s), for the bars */
function holdLeft(j) {
  let L = 0;
  if (j && j.t0 !== null && j.t0 !== undefined) { const done = j.i + (j.part || 0) - j.i0 + (j.pool ? 1 : 0), dt = (performance.now() - j.t0) / 1000; if (done >= 1) L = dt / done * (j.n - j.i0 - done); }
  const A = scatAheadEta();
  if (A && A.done >= 1) L = Math.max(L, A.dt / A.done * (A.of - A.done));
  return L;
}
function holdCheck(j) {
  if (HOLD.on) return;
  const T = sweepPredict(j);
  if (T !== null && T > holdLimit) { HOLD.on = true; updateActivity(); }
}
export function holdEnd() {
  clearTimeout(HOLD.wait); HOLD.wait = 0; HOLD.plain = false;
  if (!HOLD.on) return;
  HOLD.on = false;
  requestRender(); syncPanel();
}
/* once the particles' steps ahead are done too (when held: the cycle plays whole), then go */
function whenReady(go) {
  clearTimeout(HOLD.wait);
  if (!HOLD.on || !scatAheadEta()) { go(); return; }
  HOLD.wait = setTimeout(() => whenReady(go), 150);
}
/* the play loop asks each frame: held (nothing moves), after looking again at a plain sweep's particles solved ahead */
export function sweepHoldTick() {
  if (HOLD.plain && !HOLD.on) holdCheck(null);
  return HOLD.on;
}
/* screens whose diffracted field is on show: their panel is open at the Diffraction tab */
const openScreens = () => project.elements.filter(e => (e.type === 'screen' || e.type === 'mirror') && (vs(e).screenTab === 'plots' || vs(e).screenTab === 'trap') &&
  (e.id === selectedId || pins.includes(e.id)));
const fieldWanted = () => popSources().length > 0 || openScreens().length > 0;
/* ---------- A sweep plays in layers ----------
   A sweep follows the bench's own Light settings: where the bench shows the diffracted field (Light › Show the
   diffracted field, or a screen's or mirror's Diffraction tab open), the sweep renders it ahead for its steps; where it
   does not, nothing of it is worked out. (A sweep saved with the old "Render the diffracted field" tick, field: true or
   not, is read and left alone: the bench decides.) Playing starts at once with what is quick: the parts, the rays, the
   beams' outlines, the readings and plots, each step's trace kept. The slow layers are worked out meanwhile on the
   workers, each with its bar, and none of a layer is shown until every step of it is there; then it is added to the
   playing sweep in one go, so no frame shows it for some steps and not others:
   - the diffracted field (the bench's, the screens', in 3D its volume): while it renders the bench shows the beams'
     outlines, as with the field off (fieldHeld). The field from before Play would lie where the beams no longer go;
   - a particle's scattered light (its light to the parts, its glow, its radiation pattern in 3D): while its steps are
     solved, none is launched (scatLayerHeld; the trace then has the particle's light held, kept apart from the full one).
   Each is added as it is ready, whichever comes first. Where the field cannot be rendered beside the play (zoomed in
   to the close-up, a bench with modules, no workers) it is rendered first and then played, as before (holdCheck). */
export const fieldHeld = () => playing.size > 0 && !!(fieldRendered && fieldRendered.pending);
export const scatLayerHeld = () => playing.size > 0 && scatAheadOn();
/* whether a sweep works out the diffracted field: the bench shows it */
export const sweepShowsField = () => fieldWanted();
/* the elements whose diffracted field a sweep's frames work out: every screen, and a mirror
   whose Diffraction tab is open (a bench has many mirrors, and few are read) */
export const fieldReadouts = () => project.elements.filter(e => e.type === 'screen' || (e.type === 'mirror' && vs(e).screenTab === 'plots'));
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
  sweepRun(list, n, () => period);
  // the particles' scattering for every step, solved ahead on their own worker beside the field (ui/scatter.js)
  setDrawHeld(sweepHolding); holdEnd();
  // (only the steps the render keeps: a cycle too large to keep whole renders every so many, see renderStride)
  const rs = { k: 1 };
  particlesAhead(list, n, (e, p, i) => stepValue(e.sweeps[p], i, n, period), () => list.every(([e, p]) => getEl(e.id) && e.sweeps && e.sweeps[p]), i => i % rs.k === 0);
  sweepVol.begin();
  // every step already rendered (played before, paused, played again): straight on, no render pass
  {
    let all = true;
    for (let i = 0; i < n && all; i++) {
      list.forEach(([el, path]) => setParam(el, path, stepValue(el.sweeps[path], i, n, period)));
      traceScene();
      const srcs = popSources();
      // (the bench's field, and in 3D its volume: a step with only one of them would be worked out live as it played)
      // (what is there already is this step's from here on)
      if (srcs.length) { const pk = popKeyOf(lastTrace.beams, srcs); if (!fieldFrames.bench.has(pk) || !sweepVol.has(pk)) all = false; else { sweepVol.mark(pk); stepClaim('bench', pk); } }
      for (const scr of fieldReadouts()) { const J = all && popScreenPrep(scr); if (J && !fieldFrames.screens.has(J.key)) all = false; else if (J) stepClaim('screens', J.key); }
    }
    list.forEach(([el, path], k) => setParam(el, path, saved[k]));
    traceScene();
    if (all) { fieldRendered = { keys: new Set(list.map(([el, path]) => sweepKey(el, path))), period, n, ref: sweepRef(list, n, period) }; changed(false); onDone(); return; }
  }
  // the cycle as it is now: a rate changed meanwhile moves the steps with it, each the same point of its cycle
  const cyc = () => commonPeriod(list.map(([el, path]) => el.sweeps[path] || { freq: 1 / period })) || period;
  const job = { list, i: 0, n, t0: null, i0: 0, ref: sweepRef(list, n, period), done: new Set(), stride: 1, rs };
  keptNow.bytes = 0;
  const timing = i => { if (job.t0 === null) { job.t0 = performance.now(); job.i0 = i; } };   // timed from the first step that needs working out
  sweepJob = job;
  const finish = ok => {
    if (sweepJob !== job) return;
    sweepJob = null; particlesAheadDone();
    list.forEach(([el, path], k) => { if (getEl(el.id)) setParam(el, path, saved[k]); });
    if (ok) fieldRendered = Object.assign({ keys: new Set(list.map(([el, path]) => sweepKey(el, path))), period: cyc(), n, ref: job.ref }, job.stride > 1 ? { done: job.done } : null);
    changed(false);
    // (held: it plays once the particles' steps are done too, the whole cycle ready)
    if (ok) whenReady(() => { holdEnd(); onDone(); });
    else { holdEnd(); if (!job.quiet) toast('Stopped rendering the field'); }
  };
  job.cancel = () => finish(false);
  const gone = () => list.some(([el, path]) => !getEl(el.id) || !el.sweeps || !el.sweeps[path]);
  // several workers at once, each step whole on one of them, the page left alone (see swPool)
  const pool = !closeupOnShow() && swPool();
  // the pool leaves the page's bench alone, so the sweep plays at once beside it, the field held until all of it is in
  // (not with modules, whose results are asked for on the page at each step: rendered first there)
  if (pool && !MODS.packs.size) {
    job.layered = true;
    fieldRendered = { keys: new Set(list.map(([el, path]) => sweepKey(el, path))), period, n, ref: job.ref, pending: true };
    list.forEach(([el, path], k) => setParam(el, path, saved[k]));
    onDone();
    renderOnPool(pool, list, n, cyc, job, onDone);
    return;
  }
  if (pool) { renderOnPool(pool, list, n, cyc, job, onDone); return; }
  if (fieldWorker()) {
    // the same, each field worked out in the worker while the page stays free
    const live = () => sweepJob === job;
    (async () => {
      for (let i = 0; i < n; i++) {
        if (job.stride > 1 && i % job.stride) continue;           // (a cycle too large to keep whole: see renderStride)
        if (gone()) { job.quiet = true; job.cancel(); return; }
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
          if (sweepVol.has(key)) sweepVol.mark(key);
          // (and its 3D volume, when the view shows the field and has not got it: rendered in 2D, played in 3D)
          if (!fieldFrames.bench.has(key) || !sweepVol.has(key)) {
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
        job.part = 1; stepDone(job, i); holdCheck(job);        // (the step done: the whole predicted again)
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
      if (job.stride > 1 && i % job.stride) continue;
      if (gone()) { job.quiet = true; job.cancel(); return; }
      job.i = i;
      list.forEach(([el, path]) => setParam(el, path, stepValue(el.sweeps[path], i, n, cyc())));
      job.stage = 'tracing'; job.part = 0;
      traceScene();
      requestRender(); syncPanel();
      yield;
      // (no scattering worker: the particles' answers for this step, here)
      if (TEST_MODE || !WORKERS_OK) { particlesAheadNow(i, n); yield; }
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
      job.part = 1; stepDone(job, i); holdCheck(job);          // (the step done: the whole predicted again)
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
// (what each was still asked for is handed back as failed: a promise left waiting on a stopped worker would hold up
// whatever waits on it, the 3D view's field among them, until the page was reloaded)
// (a stop asked for is marked stopped: what waited on it is let go, and not taken for the workers failing)
export function swDrop() { clearTimeout(SW.idle); for (const W of SW.pool) { W.w.terminate(); for (const j of W.jobs.values()) j.reject(Object.assign(new Error('the render workers were stopped'), { stopped: true })); W.jobs.clear(); } SW.pool = []; }
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
function renderOnPool(pool, list, n, cyc, job, onDone) {
  const live = () => sweepJob === job, proj = fwProject(), ids = fieldReadouts().map(e => e.id), prep = modsPrep(list), trace = lastTraceMs > TRACE_SHARE_MS && !MODS.packs.size;
  const gone = () => list.some(([el, path]) => !getEl(el.id) || !el.sweeps || !el.sweeps[path]);
  const keys = new Set(list.map(([el, path]) => sweepKey(el, path)));
  // coarse to fine: every 8th step, then every 4th, 2nd, and the rest
  const order = [], seen = new Set();
  for (let st = 8; st >= 1; st >>= 1) for (let i = 0; i < n; i += st) if (!seen.has(i)) { seen.add(i); order.push(i); }
  let first = Math.ceil(n / 8);
  const done = job.done;
  let next = 0, started = !!job.layered;       // (layered: playing already)
  job.t0 = performance.now(); job.i0 = 0; job.i = -1; job.part = 0; job.pool = true;
  job.stage = pool.length > 1 ? pool.length + ' at once' : '';
  const play = () => { if (started || !live()) return; started = true; fieldRendered = { keys, period: cyc(), n, done, ref: job.ref }; onDone(); };
  const runOne = async W => {
    while (live() && next < order.length) {
      // (a sweep removed, or its part deleted, meanwhile: nothing left to render for)
      if (gone()) { job.quiet = true; job.cancel(); return; }
      const i = order[next++];
      // the step at the rate as it is now (one changed meanwhile moves the steps with it), and the 3D view's board as
      // it is now (the view may have been opened meanwhile)
      const sets = list.map(([el, path]) => [el.id, path, stepValue(el.sweeps[path], i, n, cyc())]), vol = sweepVol.box();
      await prep(sets);
      if (!live()) return;
      const o = await swAsk(W, proj, { sets, ids, vol, trace });
      if (!live()) return;
      // (each kept as this step's: the swept values it was sent)
      const step = stepKeyOf(sets);
      traceAhead(o.trace, step);
      if (o.bench) keepFrame(fieldFrames.bench, o.bench.key, { packed: o.bench.R }, step);
      if (o.vol) sweepVol.keep(o.vol.key, o.vol.tab, o.vol.bb, o.vol.V, step);
      for (const S of o.screens) if (S && S.D) keepFrame(fieldFrames.screens, S.key, diffFns(S.D), step);
      done.add(i); job.i = done.size - 1;
      // (the first step in: whether the cycle fits the budget, and if not, only the steps that do are rendered, evenly spread)
      if (done.size === 1) {
        job.stride = job.rs.k = renderStride(n, Math.max(keptNow.bytes, stepBytesAt(step)));
        if (job.stride > 1) {
          strideNote(n, job.stride);
          const rest = order.slice(next).filter(k => k % job.stride === 0);
          order.length = next; order.push(...rest);
          first = Math.min(first, Math.ceil(n / job.stride));
        }
      }
      keptNow.bytes = 0;
      if (!job.layered) holdCheck(job);
      // (held: nothing plays until the whole cycle is there)
      if (!started && !HOLD.on && done.size >= first && order.slice(0, first).every(k => done.has(k))) play();
      // (layered: the field stays held until every step is in, so nothing is drawn of it meanwhile)
      if (!job.layered) requestRender();
      syncPanel();
    }
  };
  // stopped part way: what plays on is worked out live, not held to the coarse steps rendered so far
  job.cancel = () => { if (!live()) return; sweepJob = null; swDrop(); holdEnd(); if (fieldRendered && (fieldRendered.done === done || fieldRendered.pending)) fieldRendered = null; changed(false); if (!job.quiet) toast('Stopped rendering the field'); };
  Promise.all(pool.map(runOne)).then(() => {
    if (!live()) return;
    sweepJob = null; swRelease();
    fieldRendered = Object.assign({ keys, period: cyc(), n, ref: job.ref }, job.stride > 1 ? { done } : null);
    changed(false);
    whenReady(() => { holdEnd(); if (!started) { started = true; onDone(); } });
  }, err => {
    // a worker failed: the pool is not used again, and the render starts again the old way
    if (!live()) return;
    sweepJob = null;
    // (playing beside it: the old way renders on the page's bench, so the play waits for it, as it did)
    if (job.layered) { fieldRendered = null; playing.clear(); started = false; }
    // the workers stopped on purpose (the optimiser, Undo, a file opened): started again, not given up on
    if (err && err.stopped) { renderSweepFrames(list, started ? () => {} : onDone); return; }
    console.warn('JEKray render workers:', err && err.message);
    SW.failed = true; swDrop();
    renderSweepFrames(list, started ? () => {} : onDone);
  });
  updateSweepButtons(); syncPanel();
}
/* a rendered bench field, put back together against the trace the page has for it, the first time it is drawn */
export function benchFrame(key) {
  const f = fieldFrames.bench.get(key);
  if (f && f.packed) return stepSwap('bench', key, fwUnpackRun(f.packed, lastTrace.beams));
  return f;
}

/* ---------- What is being worked out: a bar at the bottom left of the window ----------
   Every background job leaves its state where it runs; this reads them all a few times a
   second and says what the slowest thing in progress is. Steps it can count show a filling
   bar, the rest a moving one. It shows only once a job has run for a moment, so quick ones
   do not flicker it. */
export function activityNow() {
  if (sweepJob) {
    const j = sweepJob, what = j.stage === 'the bench' ? 'the bench' : j.stage && j.stage !== 'tracing' ? j.stage : '';
    // (held: the time left on all of it, field and particles, and that it plays once ready)
    const eta = HOLD.on ? leftText(holdLeft(j)) : sweepEta(j);
    return { text: 'Rendering the field for the sweep: step ' + (j.i + 1) + ' of ' + j.n + (what ? ', ' + what : '') + (eta ? ' (' + eta + ')' : '') + (HOLD.on ? '; it plays once all of it is ready' : j.layered ? '; added once every step is in' : ''),
      frac: (j.i + (j.part || 0) + (j.pool ? 1 : 0)) / j.n };
  }
  if (HOLD.on) { const A = scatAheadEta(), eta = leftText(holdLeft(null)); return { text: 'The sweep plays once its steps are worked out' + (eta ? ' (' + eta + ')' : ''), frac: A ? A.done / A.of : null }; }
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
/* two bars: what the bench is working out, and below it, apart, the particles' scattering (ui/scatter.js scatActivity:
   a sweep's steps solved ahead, or a solve on show), so a slow particle is seen to be at work beside the field */
const activity = { box: null, text: null, bar: null, since: 0, now: false, shown: 0, cls: '' };
const scatBar = { box: null, text: null, bar: null, since: 0, now: false, shown: 0, cls: ' rt-act-scat' };
/* for a job about to block the page: show the bar straight away, skipping the usual delay */
export function showActivityNow() { if (TEST_MODE) return; activity.now = true; updateActivity(); }
export function updateActivity() {
  barShow(activity, activityNow());
  const s = scatActivity(), A = s && scatAheadEta(), left = A && A.done >= 1 ? leftText(A.dt / A.done * (A.of - A.done)) : '';
  barShow(scatBar, s && left ? Object.assign({}, s, { text: s.text + ' (' + left + ')' }) : s);
  placeBars();
}
/* The bars' dock (style.css .rt-actdock): at the bottom right of the bench, above its tab strip, clear of the parts rail
   at the top. Whatever else sits at the bottom of the bench across its width (the minimap, the 3D view's key, the
   drawing hint, the measuring bar, a note, an embed's bar) puts it above them; it is never higher than just under the
   rail, and never wider than the bench. */
const DOCK_AVOID = '.rt-minimap, .rt-v3dkey, .rt-drawhint, .rt-measurebar, .rt-welcome, .rt-embedbar';
function actDock() {
  const stage = document.getElementById('stage');
  let d = stage.querySelector(':scope > .rt-actdock');
  if (!d) { d = h('div', { class: 'rt-actdock' }); stage.append(d); }
  return d;
}
function placeBars() {
  const stage = document.getElementById('stage'), d = stage && stage.querySelector(':scope > .rt-actdock');
  if (!d || ![...d.children].some(c => !c.hidden)) return;
  const S = stage.getBoundingClientRect(), base = 2.6 * 16, gap = 6;
  d.style.bottom = base + 'px';
  const D = d.getBoundingClientRect();
  let bottom = base;
  for (const o of stage.querySelectorAll(DOCK_AVOID)) {
    if (o.hidden || !o.offsetParent || getComputedStyle(o).display === 'none' || getComputedStyle(o).visibility === 'hidden') continue;
    const r = o.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= D.left || r.left >= D.right || r.top >= S.bottom) continue;
    bottom = Math.max(bottom, S.bottom - r.top + gap);
  }
  // (on a phone the panel is a sheet over the bottom of the bench: above it)
  for (const sheet of document.querySelectorAll('.rt-panel')) if (!sheet.hidden && sheet.offsetParent && getComputedStyle(sheet).position === 'absolute') { const r = sheet.getBoundingClientRect(); if (r.height && r.top < S.bottom && r.left < D.right && r.right > D.left) bottom = Math.max(bottom, S.bottom - r.top + gap); }
  // (no higher than just under the rail and what the top overlays need: on a short bench it stays at its base)
  const top = parseFloat(getComputedStyle(stage).getPropertyValue('--rt-top')) || 0;
  if (S.height - bottom - D.height < top + gap) bottom = base;
  d.style.bottom = bottom + 'px';
}
/* (the tests) the two bars drawn now, as they stand: shown, pulsing, what they say */
export function activityBars() {
  activity.now = scatBar.now = true; updateActivity();
  return [activity, scatBar].map(B => ({ shown: !!B.box && !B.box.hidden, busy: !!B.track && B.track.classList.contains('rt-busy'), text: B.label ? B.label.textContent : '' }));
}
function barShow(B, a) {
  const now = performance.now();
  if (!a) {
    B.since = 0;
    // once up, it stays long enough to read rather than flashing
    if (B.box && !B.box.hidden && now - B.shown > 400) B.box.hidden = true;
    // (its pulse stops the moment the work does: a bar left up a moment is plainly finished)
    if (B.track) B.track.classList.remove('rt-busy');
    return;
  }
  if (!B.since) B.since = now;
  if (now - B.since < 250 && !B.now) return;
  B.now = false;
  if (!B.box) {
    B.label = h('span');
    B.pct = h('span', { class: 'rt-act-pct' });
    B.text = h('span', { class: 'rt-act-text' }, B.label, B.pct);
    B.bar = h('i');
    B.track = h('div', { class: 'rt-act-bar' }, B.bar);
    B.box = h('div', { class: 'rt-activity' + B.cls, role: 'status', 'aria-live': 'polite' }, B.text, B.track);
    // (in the bars' own dock, the bench's first, the scattering's under it)
    if (B === activity) actDock().prepend(B.box); else actDock().append(B.box);
  }
  if (B.box.hidden) B.shown = now;
  B.box.hidden = false;
  if (B.label.textContent !== a.text) B.label.textContent = a.text;
  const pct = a.frac === null ? '' : Math.round(100 * clamp(a.frac, 0, 1)) + '%';
  if (B.pct.textContent !== pct) B.pct.textContent = pct;
  B.box.classList.toggle('indeterminate', a.frac === null);
  // a pulse runs along it while the work goes on (style.css .rt-busy): it has not stopped, however slowly it fills
  B.track.classList.add('rt-busy'); B.track.classList.toggle('rt-indet', a.frac === null);
  B.bar.style.width = a.frac === null ? '' : (100 * clamp(a.frac, 0, 1)).toFixed(1) + '%';
}

