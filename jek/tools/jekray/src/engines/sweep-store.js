import { getEl } from '../state/elements.js';
import { getPath } from '../state/params.js';
import { clamp } from '../core/constants.js';

/* ==========================================================================
   What a sweep keeps for its steps: one store
   A sweep comes back to the same steps every cycle, so what was worked out for a step is kept and shown again: its
   trace, the bench's diffracted field, each screen's, the close-up's picture, the 3D view's field volume and its built
   light, each particle's scattering (and, with a trace, the cavities solved for it). They are kept here, in layers,
   each layer a Map under the key its result depends on (the bench as traced, the light's geometry, the particle's
   state), which is what a result is found by: one kept under a key is shown only for a bench that gives that very key,
   so a kept result is the result a fresh run would give.

   Beside its own key every entry carries its step: the swept values it was worked out at (stepKeyOf). The run is the
   set of steps of the sweeps moving together now (stepRunBegin); an entry of one of them belongs to the run, and what
   belongs to no step of it is loose. That decides how long things are kept, in one place:
   - the run's steps are kept whole, every layer of them, within one budget of memory (setStepBudget); past it the
     loose entries go first, oldest first, then the run's own steps, whole, the longest unused first, never the step
     just kept or the one on show;
   - loose entries are held to the few each layer says (a still bench's 3D volumes, the answers an Undo comes back to);
   - stepInvalidate(why) is the one way things are let go: the steps changed ('run': range, Steps, waveform, phase, the
     sweeps moving together), the bench's light changed ('bench'), the sweeps stopped ('stopped'), a file opened
     ('file'), memory ('memory'). (A part shown or hidden changes no step's light; the 3D view's built light is kept by
     the board it was built on, and one built on another is not taken.)
   Every answer from a worker is for a generation of the run (stepStore.gen): one that comes back for a run since
   replaced is known by it.
   ========================================================================== */
export const stepMaps = { trace: new Map(), bench: new Map(), screens: new Map(), closeup: new Map(), vol: new Map(), scat: new Map(), light3d: new Map() };
/* the memory a sweep's rendered frames may take (ui/sweeps.js FRAME_BUDGET: an eighth of the computer's, 384 MB to 1.5 GB),
   and what the store may hold beyond it: the steps' 3D volumes, particles' answers and traces */
export const STEP_BUDGET = (() => { const gb = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 8; return clamp(gb * 1024 * 1024 * 1024 / 8, 384e6, 1.5e9); })();
export const STEP_EXTRA = 296e6;
export const stepStore = { gen: 1, run: null, age: 0, budget: STEP_BUDGET + STEP_EXTRA, kept: 0, bypass: false };
/* what an entry is, beside its value: { bytes, n, age, step, gen } */
const stepMeta = new WeakMap();
/* what a layer does with an entry that leaves it (the 3D view's meshes are disposed of) */
const stepDrops = {};
export function stepOnDrop(name, fn) { stepDrops[name] = fn; }
/* the cavities' steady states solved for a trace, by the trace: kept while the trace is (a step's trace kept, its
   cavities with it), read by ui/panel-cavity.js */
export const stepCav = new WeakMap();

/* a step's key: the swept values, [[part id, path, value], …] in the run's order */
export const stepKeyOf = sets => JSON.stringify(sets);
/* the step the bench is at now, if it is one of the run's; null otherwise */
export function stepNow() {
  const R = stepStore.run;
  if (!R) return null;
  const sets = [];
  for (const [id, path] of R.list) { const el = getEl(id); if (!el) return null; sets.push([id, path, getPath(el, path)]); }
  const k = stepKeyOf(sets);
  return R.keys.has(k) ? k : null;
}
const stepOfRun = m => !!m && m.step !== null && m.gen === stepStore.gen && !!stepStore.run;
export const stepInRun = v => stepOfRun(stepMeta.get(v));
function stepLeave(name, key) {
  const map = stepMaps[name], v = map.get(key);
  if (v === undefined) return;
  map.delete(key);
  if (stepDrops[name]) stepDrops[name](v);
}
/* An entry kept: layer name, its key there, its value (an object), and
   o.bytes its size (o.count: counted in stepStore.kept, unless the run holds one under this key already), o.n its count in the layer's own unit (a trace's rays); o.step its step's key (left out: the step
   the bench is at); o.cap the most entries the layer holds at all; o.loose { count, bytes, n }: the most of the layer's
   loose entries, by number, bytes or its own unit (the oldest go first, one always left) */
export function stepKeep(name, key, v, o = {}) {
  const map = stepMaps[name], was = map.get(key), R = stepStore.run, wm = was !== undefined ? stepMeta.get(was) : null;
  // (held by the run already under this key: a sweep that moves nothing of the beams has one field for all its steps)
  // (one a run took over from the run before, at its beginning, is not yet counted as this run's: carried)
  const held = !!wm && !!R && wm.step !== null && wm.gen === stepStore.gen && !wm.carried;
  if (was !== undefined) { map.delete(key); if (was !== v && stepDrops[name]) stepDrops[name](was); }
  map.set(key, v);
  let step = o.step !== undefined ? o.step : stepNow();
  if (step !== null && R && R.as.has(step)) step = R.as.get(step);
  if (step !== null && !(R && R.keys.has(step))) step = null;
  const m = { bytes: o.bytes || 0, n: o.n || 0, age: ++stepStore.age, step, gen: stepStore.gen };
  stepMeta.set(v, m);
  if (o.count && !held) stepStore.kept += m.bytes;         // (what a render's step kept, for how many of its steps fit: ui/sweeps.js)
  if (o.cap) while (map.size > o.cap) stepLeave(name, map.keys().next().value);
  if (o.loose) stepLooseTrim(name, o.loose, v);
  stepTrim(v);
  return v;
}
function stepLooseTrim(name, L, v) {
  const map = stepMaps[name], loose = [];
  const mv = stepMeta.get(v), mine = !stepOfRun(mv);
  let bytes = mine ? mv.bytes : 0, n = mine ? mv.n : 0;
  for (const [k, x] of map) { const m = stepMeta.get(x); if (x === v || stepOfRun(m)) continue; loose.push([k, m]); bytes += m ? m.bytes : 0; n += m ? m.n : 0; }
  let at = 0;
  const over = () => (L.count && loose.length - at + (mine ? 1 : 0) > L.count) || (((L.bytes && bytes > L.bytes) || (L.n && n > L.n)) && map.size > 1 && loose.length - at > 0);
  while (over()) { const [k, m] = loose[at++]; if (m) { bytes -= m.bytes; n -= m.n; } stepLeave(name, k); }
}
/* the bytes kept: in the layers named, or in all of them */
export function stepBytes(names) {
  let b = 0;
  for (const name of names || Object.keys(stepMaps)) for (const x of stepMaps[name].values()) { const m = stepMeta.get(x); if (m) b += m.bytes; }
  return b;
}
/* (tests) a budget of its own (none: the usual one) */
export function setStepBudget(b) { stepStore.budget = b > 0 ? b : STEP_BUDGET + STEP_EXTRA; }
/* past the budget: the loose entries, oldest first, then the run's steps whole, longest unused first; never v (the
   entry just kept), its step, or the step on show */
function stepTrim(v) {
  let total = stepBytes();
  if (total <= stepStore.budget) return;
  const mv = stepMeta.get(v), mine = stepOfRun(mv) ? mv.step : null, now = stepNow(), groups = new Map(), singles = [];
  for (const [name, map] of Object.entries(stepMaps)) for (const [key, x] of map) {
    if (x === v) continue;
    const m = stepMeta.get(x);
    if (!m || !m.bytes) continue;
    if (stepOfRun(m)) {
      if (m.step === mine || m.step === now) continue;
      let g = groups.get(m.step);
      if (!g) groups.set(m.step, g = { age: 0, bytes: 0, at: [] });
      g.age = Math.max(g.age, m.age); g.bytes += m.bytes; g.at.push([name, key]);
    } else singles.push({ age: m.age, bytes: m.bytes, at: [[name, key]] });
  }
  const byAge = (a, b) => a.age - b.age;
  for (const g of [...singles.sort(byAge), ...[...groups.values()].sort(byAge)]) {
    if (total <= stepStore.budget) break;
    for (const [name, key] of g.at) stepLeave(name, key);
    total -= g.bytes;
  }
}
/* an entry used again: the newest of its layer (the last to go) */
export function stepTouch(name, key) {
  const map = stepMaps[name], v = map.get(key);
  if (v === undefined) return undefined;
  map.delete(key); map.set(key, v);
  const m = stepMeta.get(v); if (m) m.age = ++stepStore.age;
  return v;
}
/* an entry in another form (a field as it came from a worker, put together for drawing): the same entry */
export function stepSwap(name, key, v2) {
  const map = stepMaps[name], v = map.get(key), m = v !== undefined ? stepMeta.get(v) : null;
  map.set(key, v2);
  if (m) stepMeta.set(v2, m);
  return v2;
}
/* an entry the page has already, found to be a step's of the run (the step the bench is at, unless given) */
export function stepClaim(name, key, step, count) {
  const v = stepMaps[name].get(key), m = v !== undefined ? stepMeta.get(v) : null, R = stepStore.run;
  let s = step !== undefined ? step : stepNow();
  if (s !== null && R && R.as.has(s)) s = R.as.get(s);
  // (count: taken over from an earlier run, it is counted as kept for this step, as one made now would be)
  if (m && R && s !== null && R.keys.has(s)) { const mine = m.step !== null && m.gen === stepStore.gen && !m.carried; m.step = s; m.gen = stepStore.gen; if (count) { if (!mine) stepStore.kept += m.bytes; m.carried = false; } }
}
export function stepDelete(name, key) { stepLeave(name, key); }
export function stepDropLayer(name) { for (const k of [...stepMaps[name].keys()]) stepLeave(name, k); }
/* the run's entries in a layer: [key, value] each */
export function stepRunEntries(name) {
  const out = [];
  for (const [k, x] of stepMaps[name]) if (stepInRun(x)) out.push([k, x]);
  return out;
}
/* The run: the sweeps moving together, list [[part id, path], …], over n steps, valueAt(k, i) the value of the k-th
   at step i; shape whatever else its steps depend on (their ranges, phases, waveforms, Steps). The same run begun
   again is the run it was; another is a new generation, which takes over what is kept for steps it has too.
   Returns the generation. */
export function stepRunBegin(list, n, valueAt, shape, heldAt) {
  // (a step by the values the bench holds at it, heldAt(k, i): a setting held to its limits, or an angle brought round,
  // is not always the value asked for; as: the step asked for, as a worker is sent it, to the step it is)
  const keys = new Set(), as = new Map();
  for (let i = 0; i < n; i++) {
    const asked = stepKeyOf(list.map(([id, path], k) => [id, path, valueAt(k, i)])), held = heldAt ? stepKeyOf(list.map(([id, path], k) => [id, path, heldAt(k, i)])) : asked;
    keys.add(held); if (held !== asked) as.set(asked, held);
  }
  const sh = JSON.stringify([shape, n, list]);
  const R = stepStore.run;
  if (R && R.shape === sh) { R.keys = keys; R.as = as; return stepStore.gen; }
  const gen = ++stepStore.gen;
  stepStore.run = { shape: sh, n, list: list.map(q => [q[0], q[1]]), keys, as };
  for (const map of Object.values(stepMaps)) for (const x of map.values()) { const m = stepMeta.get(x); if (m && m.step !== null && keys.has(m.step)) { m.gen = gen; m.carried = true; } }
  return gen;
}
/* The one way kept things are let go:
   'run'      the steps are no longer those (range, Steps, waveform, phase, which sweeps): no run until the next begins;
              what is kept stays under its own keys, loose, and a new run takes over the steps it shares
   'bench'    the bench's light changed: as 'run', and nothing kept is any later run's (the same values, another bench)
   'stopped'  the sweeps stopped: the traces and the 3D view's built light, which are kept only while one plays
   'file'     another bench opened: as 'bench', and the traces and built light go (what else is kept stays under its own
              keys, loose: an Undo back to the bench finds it)
   'memory'   brought within the budget */
export function stepInvalidate(why) {
  if (why === 'file' || why === 'run' || why === 'bench') {
    stepStore.run = null; stepStore.gen++;
    if (why === 'file') { stepDropLayer('trace'); stepDropLayer('light3d'); }
    if (why !== 'run') for (const map of Object.values(stepMaps)) for (const x of map.values()) { const m = stepMeta.get(x); if (m) m.step = null; }
  } else if (why === 'stopped') { stepDropLayer('trace'); stepDropLayer('light3d'); }
  else if (why === 'memory') stepTrim(null);
}
/* (the tests) what is kept: each layer's entries, the run's among them, the bytes */
export function stepInfo() {
  const layers = {};
  for (const [name, map] of Object.entries(stepMaps)) { let run = 0; for (const x of map.values()) if (stepInRun(x)) run++; layers[name] = { size: map.size, run, bytes: stepBytes([name]) }; }
  return { gen: stepStore.gen, run: stepStore.run ? { n: stepStore.run.n, steps: stepStore.run.keys.size, list: stepStore.run.list } : null, layers, bytes: stepBytes(), budget: stepStore.budget };
}
