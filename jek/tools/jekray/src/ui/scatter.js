import { TEST_MODE } from '../core/constants.js';
import { fmtLen } from '../core/format.js';
import { GLASS } from '../core/glass.js';
import { METAL_NAMES } from '../core/metals.js';
import { particleOf } from '../core/traps.js';
import { V, deg } from '../state/project.js';
import { getEl } from '../state/elements.js';
import { modDelta } from '../engines/mods.js';
import { SCAT_NMAX, particleTrapNow, scatCache, scatFind, scatKeep, scatStore, scatterNow, scatterPrep, scatterRun, setScatMode, trapKeep, trapKeyOf, trapKept } from '../engines/scatter.js';
import { popRun } from '../engines/beam-tree.js';
import { lastTrace } from '../engines/trace.js';
import { trapReport } from '../engines/screen-stats.js';
import { project } from '../state/project.js';
import { DPR, H, W, benchLight, ctx, getCss, glowA, glowOp, inkA, lightLayer, requestRender, sx, sy } from './render.js';
import { scatFieldLevel, scatPlaneAt } from '../engines/scatter-field.js';
import { bindSync, helpLine, panel, param, selectField, syncPanel, vs } from './panel.js';
import { h } from './dom.js';
import { axisFont, drawAxes, magma, plotArea, plotCsv, plotSaveRow, scatRamp } from './plots.js';
import { WORKERS_OK, fwProject, midDrag, newAppWorker } from '../page/workers.js';
import { changed } from './actions.js';
import { checkpoint } from './tabs.js';

/* ---------- A particle's scattered field on the 2D bench ----------
   The estimate engines/scatter-field.js makes (a particle with scatField on: lastTrace.scat.fans[].field), drawn as the
   diffracted field is, as bright as the irradiance is on its own log scale and added to what is under it, but in its
   own cool ramp (scatRamp), not the light's colour, so it is told from the beam where they overlap. An image in the bench's own millimetres over what of the field's square is in view (and a quarter of a view
   more each way), at about two of the screen's pixels to its own, kept while the view stays inside it at about that scale:
   a pan or a zoom draws the same image moved. A particle without it costs nothing here. */
const SF_IMG = new WeakMap();                   // a field -> { key, x0, y0, x1, y1, mmpp, cv }
export function drawScatField() {
  const SC = lastTrace.scat;
  if (!SC || !SC.fans) return;
  for (const F of SC.fans) {
    const G = F.field;
    if (!G || F.bench !== project.tab || !(G.top > 0)) continue;
    const v = V(), k = v.scale, P = F.pos, hw = W / 2 / k, hh = H / 2 / k;
    // in view: the field's square cut to the view
    const vx0 = Math.max(P[0] - G.R, v.cx - hw), vx1 = Math.min(P[0] + G.R, v.cx + hw), vy0 = Math.max(P[1] - G.R, v.cy - hh), vy1 = Math.min(P[1] + G.R, v.cy + hh);
    if (!(vx1 > vx0 && vy1 > vy0)) continue;
    const want = 2 / (k * DPR), key = String(lightLayer);
    let C = SF_IMG.get(G);
    if (!C || C.key !== key || C.mmpp > 1.5 * want || C.mmpp < want / 1.5 || C.x0 > vx0 || C.x1 < vx1 || C.y0 > vy0 || C.y1 < vy1) {
      const x0 = Math.max(P[0] - G.R, v.cx - 1.5 * hw), x1 = Math.min(P[0] + G.R, v.cx + 1.5 * hw), y0 = Math.max(P[1] - G.R, v.cy - 1.5 * hh), y1 = Math.min(P[1] + G.R, v.cy + 1.5 * hh);
      // (at most about 250 thousand pixels: past that, coarser)
      const mmpp = Math.max(want, Math.sqrt((x1 - x0) * (y1 - y0) / 2.5e5)), nx = Math.max(1, Math.ceil((x1 - x0) / mmpp)), ny = Math.max(1, Math.ceil((y1 - y0) / mmpp));
      const cv = C && C.cv && C.cv.width === nx && C.cv.height === ny ? C.cv : document.createElement('canvas');
      cv.width = nx; cv.height = ny;
      const lut = new Uint8Array(768);
      for (let c = 0; c < 256; c++) lut.set(scatRamp(c / 255, lightLayer), 3 * c);
      const g = cv.getContext('2d'), img = g.createImageData(nx, ny), d = img.data, px = (x1 - x0) / nx, py = (y1 - y0) / ny;
      for (let j = 0; j < ny; j++) {
        const dy = y1 - (j + 0.5) * py - P[1];
        for (let i = 0; i < nx; i++) {
          const a = scatFieldLevel(G, scatPlaneAt(G, x0 + (i + 0.5) * px - P[0], dy));
          if (!(a > 0)) continue;
          const o = 4 * (j * nx + i), c = 3 * Math.round(255 * a);
          d[o] = lut[c]; d[o + 1] = lut[c + 1]; d[o + 2] = lut[c + 2]; d[o + 3] = Math.round(255 * glowA(0.95 * a));
        }
      }
      g.putImageData(img, 0, 0);
      C = { key, x0, y0, x1, y1, mmpp: px, cv };
      SF_IMG.set(G, C);
    }
    ctx.save();
    ctx.globalCompositeOperation = glowOp();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(C.cv, sx(C.x0), sy(C.y1), (C.x1 - C.x0) * k, (C.y1 - C.y0) * k);
    ctx.restore();
  }
}

/* ---------- The Scattering tab ----------
   A screen's particle (the one its Trap tab holds) and the light it scatters: the settings,
   the run (in a worker of its own, so a dipole array's minutes hold nothing else up and can
   be stopped), the readouts and the pattern's plots. The physics is engines/scatter.js. */

/* The worker: this app again, asked for kind 'scatter' (worker/main.js), which sends its
   progress as it goes and the answer at the end. One run at a time; a run whose bench has
   moved on is let finish if it is nearly instant and stopped otherwise; Stop ends the worker. */
const SCW = { w: null, failed: false, job: null, queue: [], stopped: new Map(), seq: 0, timer: null, ahead: null, done: 0, letFinish: () => false };
export const scatWork = SCW;
function scatWorker() {
  if (SCW.w) return SCW.w;
  if (SCW.failed || TEST_MODE || !WORKERS_OK) return null;
  try {
    const w = newAppWorker();
    w.onmessage = e => {
      const m = e.data, J = SCW.job;
      if (!J || J.id !== m.id) return;
      if (m.prog) { J.prog = m.prog; syncPanel(); return; }
      SCW.job = null; clearTimeout(J.kill);
      if (!m.ok) { console.warn('JEKray scattering worker:', m.err); scatFail(); if (J.reject) J.reject(new Error(m.err)); return; }
      const o = m.out || {};
      // (a Particle part's answer is what the bench's trace launches its scattered light from: kept, the bench is drawn again)
      // (a step solved ahead is kept for when the sweep gets there, not put on show)
      if (o.S && o.key) { if (J.proj) scatStore(o.key, o.S); else scatKeep(J.elId, o.key, o.S); SCW.done++; requestRender(); }
      if (o.T !== undefined && o.key) { trapKeep(trapKeyOf(o.key), o.T); requestRender(); }
      if (J.resolve) J.resolve(o.cancelled ? null : o);
      syncPanel(); scatPump();
    };
    w.onerror = e => { e.preventDefault(); scatFail(); };
    SCW.w = w;
  } catch (err) { SCW.failed = true; return null; }
  return SCW.w;
}
// the worker cannot be relied on: the page does the work itself from here on
function scatFail() {
  SCW.failed = true;
  setScatMode('sync');
  if (SCW.w) SCW.w.terminate();
  const all = [SCW.job, ...SCW.queue].filter(Boolean);
  SCW.w = null; SCW.job = null; SCW.queue = [];
  for (const j of all) if (j.reject) j.reject(new Error('the scattering worker failed'));
  syncPanel();
}
/* The running job is out of date: the worker is asked to drop it (it hears between slices of its work, and keeps what it
   has worked out, the answers it combines included); one that has not answered within a few seconds (a long step that
   cannot be broken off) is stopped, and a fresh worker (a spare kept ready: page/workers.js) takes the next job. */
function scatCancel() {
  const J = SCW.job;
  if (!J || J.cancelling) return;
  J.cancelling = true;
  if (SCW.w) SCW.w.postMessage({ cancel: J.id });
  J.kill = setTimeout(() => { if (SCW.job === J) { scatKill(); scatPump(); } }, 3000);
}
function scatKill() {
  const J = SCW.job;
  if (SCW.w) SCW.w.terminate();
  SCW.w = null; SCW.job = null;
  if (J) { clearTimeout(J.kill); if (J.resolve) J.resolve(null); }
}
function scatPump() {
  if (SCW.job || !SCW.queue.length) return;
  // (a moment after the last change, so a value being typed or dragged starts one run, not ten)
  clearTimeout(SCW.timer);
  SCW.timer = setTimeout(() => {
    if (SCW.job || !SCW.queue.length) return;
    if (midDrag()) { scatPump(); return; }
    const q = SCW.queue.shift(), el = getEl(q.elId), w = el && scatWorker();
    // (one asked for live: still wanted only if the bench still asks for it)
    if (!w || (!q.proj && (!scatterPrep(el) || scatterPrep(el).key !== q.key))) { if (q.resolve) q.resolve(null); syncPanel(); scatPump(); return; }
    SCW.job = Object.assign(q, { id: ++SCW.seq, t0: performance.now(), prog: null });
    w.postMessage({ id: SCW.job.id, kind: q.kind, args: { id: q.elId, sets: q.sets || null, trap: false }, proj: q.proj || fwProject(), mods: modDelta(w) });
    syncPanel();
  }, SCW.queue[0].proj ? 0 : 120);
}
/* ask for a job (kind 'scatter' or 'trap') for a particle as the bench now is: one waiting for the same part and kind
   is replaced, and one running for a state the bench has left is dropped */
function scatWant(el, key, kind) {
  SCW.queue = SCW.queue.filter(q => q.proj || q.elId !== el.id || q.kind !== kind);
  const live = { kind, elId: el.id, key };
  // (live work goes before a sweep's steps solved ahead)
  const at = SCW.queue.findIndex(q => q.proj);
  if (at < 0) SCW.queue.push(live); else SCW.queue.splice(at, 0, live);
  const J = SCW.job;
  // (while sweeps play, one running is let finish: its answer is kept for when the sweep comes back to it, where one
  // stopped at each step would never be done)
  if (J && !J.proj && J.elId === el.id && J.kind === kind && J.key !== key && !SCW.letFinish()) scatCancel();
  scatPump();
}
/* A sweep's step solved ahead: the bench as it is (proj) with the step's values set (sets: [id, path, value]); resolves
   with { key, S }, or null when it was dropped */
export function scatterAhead(elId, proj, sets) {
  if (TEST_MODE || SCW.failed || !WORKERS_OK || !scatWorker()) return null;
  return new Promise((resolve, reject) => { SCW.queue.push({ kind: 'scatter', elId, key: null, proj, sets, resolve, reject }); scatPump(); });
}
/* A sweep's steps solved ahead for every Particle part whose light is on, one after another on the scattering worker
   (beside the field's workers), each answer kept by its key (engines/scatter.js scatKept) so that each step, played,
   finds its own. valueAt(el, path, i) the step's value, as the sweep will set it; live() false once the sweep is gone.
   Its progress is SCW.ahead, which the activity bar reads. On the page alone (no workers, the tests) the steps are
   solved where the field's own render does them (particlesAheadNow). */
export async function particlesAhead(list, n, valueAt, live) {
  const parts = project.elements.filter(e => e.type === 'particle' && e.scatLight !== false && scatterPrep(e));
  if (!parts.length || TEST_MODE || SCW.failed || !WORKERS_OK || !scatWorker()) return;
  scatterAheadStop();
  const run = SCW.ahead = { i: 0, n, done: 0, of: n * parts.length, t0: performance.now(), names: parts.map(e => e.name) };
  const proj = fwProject();
  try {
    for (let i = 0; i < n; i++) for (const el of parts) {
      if (SCW.ahead !== run || !live()) { if (SCW.ahead === run) SCW.ahead = null; return; }
      run.i = i;
      await scatterAhead(el.id, proj, list.map(([e, p]) => [e.id, p, valueAt(e, p, i)]));
      if (SCW.ahead !== run) return;
      run.done++;
      syncPanel();
    }
  } catch (err) { /* the worker failed: the steps are worked out live */ }
  if (SCW.ahead === run) SCW.ahead = null;
  syncPanel();
}
/* the same on the page, for one step as the bench now stands (the render on the page sets each step's values) */
export function particlesAheadNow(i, n) {
  const parts = project.elements.filter(el => el.type === 'particle' && el.scatLight !== false && scatterPrep(el));
  if (!parts.length) return;
  SCW.ahead = { i, n, done: i, of: n, t0: performance.now(), names: parts.map(e => e.name), page: true };
  for (const el of parts) {
    const J = scatterPrep(el);
    if (scatFind(el.id, J.key, true)) continue;
    scatKeep(el.id, J.key, scatterRun(el, popRun(lastTrace.beams, J.srcs, { keep: J.keep, bare: true }), { trap: false }), true);
  }
}
/* the steps on the page are done (or stopped) */
export function particlesAheadDone() { if (SCW.ahead && SCW.ahead.page) SCW.ahead = null; }
/* What the scattering is doing, for the activity bar's own line (ui/sweeps.js): a sweep's steps solved ahead, or the
   particle's solve on show; null when nothing is (or for less than a moment) */
export function scatActivity() {
  const A = SCW.ahead, J = SCW.job, now = performance.now();
  const stage = P => !P ? '' : P.stage === 'dipoles' ? (P.combined ? 'combined from earlier answers' : 'dipole array, ' + P.N + ' dipoles, iteration ' + P.iter) : P.stage === 'pattern' ? 'the pattern' : P.stage === 'sphere' ? 'Mie' : 'the light at the particle';
  // a solve's progress in its run: its stage, and a dipole solve's residual on its way down to the tolerance (on a log scale)
  const frac = P => !P ? 0 : P.stage === 'light' ? 0.05 : P.stage === 'dipoles' ? 0.1 + 0.75 * (P.combined ? 1 : Math.min(1, Math.max(0, Math.log(Math.max(P.resid, 1e-300)) / Math.log(P.tol || 1e-5)))) : P.stage === 'sphere' ? 0.5 : P.stage === 'pattern' ? 0.9 : 0;
  if (A) {
    const part = J && J.proj ? frac(J.prog) : 0;
    return { text: 'Scattering' + (A.names.length === 1 ? ' by ' + A.names[0] : '') + ' for the sweep: step ' + (Math.min(A.n, A.i + 1)) + ' of ' + A.n + (J && J.proj && J.prog ? ', ' + stage(J.prog) : ''), frac: (A.done + part) / A.of };
  }
  if (J && now - J.t0 > 250) {
    const el = getEl(J.elId), who = el ? el.name : 'the particle';
    if (J.kind === 'trap') return { text: 'Finding the trap that holds ' + who, frac: null };
    return { text: 'Scattering by ' + who + (J.prog ? ': ' + stage(J.prog) : '') + (J.cancelling ? ' (stopping: the bench has moved on)' : ''), frac: frac(J.prog) };
  }
  return null;
}
/* every step solved ahead dropped (the sweep stopped or rendered again) */
export function scatterAheadStop() {
  for (const q of SCW.queue) if (q.proj && q.resolve) q.resolve(null);
  SCW.queue = SCW.queue.filter(q => !q.proj);
  if (SCW.job && SCW.job.proj) scatCancel();
  SCW.ahead = null;
}
/* A screen's scattering: { S, busy, prog, stopped }. S is the last answer for this screen (stale
   while busy), null before the first; prog the run's progress. */
export function scatterLater(el) {
  const J = scatterPrep(el);
  if (!J) return { S: null, busy: false, none: true };
  const k = scatFind(el.id, J.key);
  if (k) { if (k.fresh) requestRender(); return { S: k.S, busy: false }; }
  const c = scatCache.get(el.id);
  if (TEST_MODE || SCW.failed || !WORKERS_OK) return { S: scatterNow(el, { trap: false }), busy: false };
  if (SCW.stopped.get(el.id) === J.key) return { S: c ? c.S : null, busy: false, stopped: true, stale: !!c };
  const job = SCW.job;
  if (job && job.elId === el.id && job.kind === 'scatter' && job.key === J.key && !job.cancelling) return { S: c ? c.S : null, busy: true, prog: job.prog, t0: job.t0, stale: !!c };
  // (a sweep's steps being solved ahead: this one comes with them; nothing is asked meanwhile)
  if (SCW.ahead && !SCW.ahead.page && SCW.ahead.names.includes(el.name)) return { S: c ? c.S : null, busy: true, prog: null, stale: !!c, ahead: true };
  if (!SCW.queue.some(q => !q.proj && q.elId === el.id && q.kind === "scatter" && q.key === J.key)) scatWant(el, J.key, "scatter");
  return { S: c ? c.S : null, busy: true, prog: null, stale: !!c };
}
/* A Particle part's trap: in its answer when the run solved it (the particle put where the trap holds it), else kept from
   before, else asked of the worker apart: { T, busy } as particleTrapLater takes them */
function trapLater(el) {
  const J = scatterPrep(el);
  if (!J) return { T: null, busy: false };
  const c = scatFind(el.id, J.key, true);
  if (c && c.S && c.S.trapRaw) return { T: c.S.trapRaw, busy: false };
  const tk = trapKeyOf(J.key);
  if (trapKept.has(tk)) return { T: trapKept.get(tk), busy: false };
  if (TEST_MODE || SCW.failed || !WORKERS_OK) return { T: particleTrapNow(el), busy: false };
  const job = SCW.job;
  if (!(job && job.elId === el.id && job.kind === 'trap' && job.key === J.key) && !SCW.queue.some(q => !q.proj && q.elId === el.id && q.kind === 'trap' && q.key === J.key)) scatWant(el, J.key, 'trap');
  return { T: null, busy: true };
}
function scatStop(el) {
  const J = scatterPrep(el);
  if (J) SCW.stopped.set(el.id, J.key);
  SCW.queue = SCW.queue.filter(q => q.proj || q.elId !== el.id);
  if (SCW.job && SCW.job.elId === el.id) scatKill();
  syncPanel();
}
function scatGo(el) { SCW.stopped.delete(el.id); syncPanel(); }

export const PARTICLE_SHAPES = [['sphere', 'A sphere'], ['cylinder', 'A rod with flat ends'], ['capsule', 'A rod with round ends'], ['spheroid', 'A spheroid']];
export const particleMats = () => [...Object.keys(GLASS).filter(g => g !== 'Water').map(g => [g, g]), ...Object.entries(METAL_NAMES).map(([k, n]) => [k, n + ' (absorbing)'])];
/* the Scattering tab's own rows for a Particle part (the Trap tab has the sphere's) */
function particleRows(el) {
  const rows = h('div', { class: 'rt-rows' });
  if (el.type === 'particle') {
    // a Particle part: what it is made of is on its own tab; here the model and where it is (the collection lens is set under the figure)
    const sph = el.trapShape === 'sphere';
    rows.append(selectField('Model', [['auto', 'Auto'], ['rayleigh', 'Rayleigh (one dipole)'], ['mie', 'Mie (a sphere, exact)'], ['dda', 'Dipole array']], () => el.scatModel, v => { el.scatModel = v; }));
    if (el.scatModel === 'dda' || (el.scatModel === 'auto' && !sph)) rows.append(param('Dipoles across (0: chosen)', el, 'scatDip', { noSweep: true }));
    rows.append(selectField('Where it is', [['part', 'Where the part is'], ['trap', 'Where the trap holds it']], () => el.scatAt, v => { el.scatAt = v; }, { wide: true }),
      param('Moved across (µm)', el, 'scatDx'), param('Moved up (µm)', el, 'scatDy'), param('Moved along the beam (µm)', el, 'scatDz'));
    return rows;
  }
  return rows;
}
const scatSig = (v, p = 3) => (v === 0 ? '0' : Math.abs(v) >= 1e4 || Math.abs(v) < 1e-3 ? v.toExponential(p - 1).replace('e', ' × 10^').replace('^+', '^') : String(+v.toPrecision(p)));
const scatArea = m2 => { const a = Math.abs(m2); return a >= 1e-14 ? scatSig(m2 * 1e12, 4) + ' µm²' : a >= 1e-19 ? scatSig(m2 * 1e18, 4) + ' nm²' : scatSig(m2 * 1e18, 3) + ' nm²'; };
const scatPw = v => { const a = Math.abs(v); return a >= 1 ? scatSig(v, 3) + ' W' : a >= 1e-3 ? scatSig(v * 1e3, 3) + ' mW' : a >= 1e-6 ? scatSig(v * 1e6, 3) + ' µW' : a >= 1e-9 ? scatSig(v * 1e9, 3) + ' nW' : a >= 1e-12 ? scatSig(v * 1e12, 3) + ' pW' : scatSig(v * 1e15, 3) + ' fW'; };
const scatPct = v => scatSig(100 * v, 3) + '%';
const scatCplx = c => (c[1] > 1e-9 ? scatSig(c[0], 4) + ' + ' + scatSig(c[1], 4) + 'i' : String(+c[0].toPrecision(5)));
const MODEL_NAME = { mie: 'Lorenz–Mie', dda: 'Dipole array', rayleigh: 'Rayleigh (one dipole)' };
const FLAG_TEXT = {
  coarse: 'The dipole lattice is coarse for this particle (|m|kd above 0.5, or fewer than 6 dipoles across it): take the figures as rough, or set more dipoles across.',
  capped: 'The run was held to its limit of dipoles, so the lattice is coarser than asked for.',
  noconv: 'The dipole array’s solver did not reach its tolerance: the figures are not to be trusted.',
  highIndex: 'An index this far from the medium’s (|m| above 2.5) is hard for a dipole array: it converges slowly and its error can reach tens of percent. For a sphere, Mie is exact.',
  rayleighBig: 'This particle is too large for a single dipole (|m|k·size/2 above 0.5): Rayleigh is shown because it was asked for.',
  mieNotSphere: 'Mie is for a sphere: shown for the sphere of this particle’s volume, not its shape.',
  medium: 'The medium set here is not the bench’s where the light is: the focus is the bench’s, the wavelength in the medium the one set.',
  varies: 'The beam changes across the particle but is taken as one plane wave (it is too gently focused for the vector focus model, above NA 0.3): rough for this size.',
  skipped: 'A beam through here was left out: no field could be taken for it.',
  notrap: 'No stable trap was found, so the particle is where the beam meets the screen.',
  fresnel: 'The cavity\u2019s Fresnel number (its mirrors\u2019 radius squared over the wavelength times their spacing) is under 10: the returns are taken as rays with their phase and the rims as hard edges, which diffraction at the rims makes rough here.',
  pupilFar: 'This cavity is further from the one that re-images its light than the solve has been checked: checked to 0.2 rad of round-trip Gouy phase from it (50 µm short of concentric with 90% mirrors), the light at the particle is 2 to 7% out at 0.4 rad and 28% at 0.6 rad.',
  modeNear: 'This cavity’s transverse modes step by under 1 rad a round trip, and only those up to order 12 are kept: the part of the light at the particle that is off resonance is not to be trusted here (it has been found with the wrong sign). The shift and widening come from the resonant part.',
  cavity: 'Scattering inside a cavity is not modelled: the light here comes back to the particle more than once, and these readings take its scattered light back to it once only.',
};
/* why a cavity's modes do not take a particle's light (engines/scatter-cavity.js) */
const CAV_WHY = {
  degenerate: 'the cavity is degenerate or near it (its transverse modes up to six orders above the lowest resonate within three linewidths of it): they share resonances, so they are not solved one by one.',
  unstable: 'the cavity is not stable, so it has no Hermite-Gauss modes to solve in.',
  ring: 'a ring cavity: the light the particle sends back would run round the other way, which the trace does not follow.',
  legs: 'only a two-mirror cavity with the particle on its axis is solved in its modes.',
  turned: 'a part of the cavity is turned out of the plane: its modes are not solved here.',
  misaligned: 'the cavity\u2019s axis is off its pilot (a mirror tilted): its modes are not solved here.',
  clipped: 'a mirror\u2019s edge cuts the mode (within three of its radii): its modes are not Hermite-Gauss ones.',
  entry: 'the light let in does not pass the particle on its way into the cavity: not solved here.',
  steady: 'the cavity\u2019s steady state is not worked out yet.',
  loss: 'the cavity keeps too little of its light round a trip to resonate.',
  noimage: 'the cavity is degenerate, but its mirrors do not bring the particle\u2019s light back to a focus on it within six reflections: not solved here.',
  parts: 'one of the cavity\u2019s mirrors is not a mirror part, or is tipped or rolled: its returns are not traced here.',
};
/* the readout's rows for an answer */
function scatterRows(el, S) {
  const rows = [], D = S.dda;
  const how = S.model === 'mie' ? ', ' + S.mie.terms + ' terms' + (S.shape === 'sphere' ? ', exact for a sphere' : '')
    : S.model === 'dda' ? ': ' + D.N + ' dipoles ' + scatSig(D.d, 3) + ' nm apart (' + scatSig(D.across, 3) + ' across), |m|kd = ' + scatSig(D.mkd, 2) + ', lattice dispersion relation; ' +
      (D.converged ? 'solved in ' + D.iters + ' iterations' : 'not converged after ' + D.iters + ' iterations') + ' (residual ' + scatSig(D.resid, 2) + ')' + (D.combined ? '; ' + (D.runs ? D.combined + ' of its ' + (D.runs + D.combined) + ' solves' : 'its solve' + (D.combined > 1 ? 's' : '')) + ' combined from answers already worked out for other light (the particle is linear in it)' : '') + (D.warm ? '; started from the nearest answer worked out before' : '')
      : ', good while the particle is much smaller than the wavelength';
  rows.push(['Model', MODEL_NAME[S.model] + how + (S.auto ? ' (Auto’s choice)' : '') + '; ' + scatSig(S.ms / 1000, 2) + ' s']);
  const size = S.shape === 'sphere' ? 'a sphere ' + fmtLen(S.D * 1e-6) + ' across' : ({ cylinder: 'a rod with flat ends', capsule: 'a rod with round ends', spheroid: 'a spheroid' })[S.shape] + ', ' + fmtLen(S.L * 1e-6) + ' × ' + fmtLen(S.D * 1e-6);
  rows.push(['Particle', (METAL_NAMES[S.mat] || S.mat) + ', n = ' + scatCplx(S.np) + ', ' + size + ', in a medium of n = ' + (+S.nMed.toPrecision(5)) +
    '; size parameter k·a = ' + scatSig(S.x, 3) + (S.shape === 'sphere' ? '' : ' for the sphere of its volume (k·length/2 = ' + scatSig(S.kL, 3) + ')')]);
  const I = S.I0, It = I >= 1e7 ? scatSig(I / 1e7, 4) + ' kW/cm²' : scatSig(I / 1e4, 4) + ' W/cm²';
  rows.push(['Light', (S.beams > 1 ? S.beams + ' beams' + (S.launches < S.beams ? ', interfering' : ', from separate lasers') : 'one beam') + ' at ' + S.nm + ' nm, ' +
    (S.pupils ? 'the tight focus as ' + S.waves + ' plane waves' : 'taken as a plane wave where the particle is') + '; ' + It + ' at the particle']);
  rows.push(['Cross-sections', 'scattering ' + scatArea(S.Csca) + ', extinction ' + scatArea(S.Cext) + ', absorption ' + (Math.abs(S.Cabs) < 1e-6 * Math.abs(S.Cext) ? 'none' : scatArea(S.Cabs)) +
    (S.model === 'mie' && S.shape === 'sphere' ? '' : ' (a plane wave along the beam, polarised as the light at the particle)')]);
  rows.push(['Efficiencies', 'Q scattering ' + scatSig(S.Qsca, 4) + ', extinction ' + scatSig(S.Qext, 4) + ', absorption ' + (Math.abs(S.Qabs) < 1e-6 * Math.abs(S.Qext) ? '0' : scatSig(S.Qabs, 4)) +
    ' (over πa²' + (S.shape === 'sphere' ? '' : ', a the radius of the sphere of its volume, ' + scatSig(S.rEq, 4) + ' nm') + ')']);
  rows.push(['Asymmetry', 'g = ' + scatSig(S.g, 3) + ' (the mean cosine of the scattering angle); back-scattering efficiency ' + scatSig(S.Qback, 3)]);
  rows.push(['In this light', scatPw(S.Psca) + ' scattered' + (S.Pabs > 1e-4 * S.Psca ? ', ' + scatPw(S.Pabs) + ' absorbed' : '') +
    (S.I0 > 0 ? ' (' + scatArea(S.Psca / S.I0) + ' of the irradiance at the particle)' : '')]);
  rows.push(['Forward and back', scatPct(S.fwd) + ' of the scattered power goes ahead of the particle, ' + scatPct(S.back) + ' back: ' + scatSig(S.fwd / (S.back || 1e-300), 3) + ' to 1']);
  const C = S.collect, where = { fwd: 'ahead', back: 'behind', side: 'to the side', up: 'above', angle: 'at ' + (+(el.scatAng || 0).toFixed(1)) + '°' }[C.dir] || 'ahead';
  rows.push(['Collected', scatPct(C.frac) + ' of the scattered power, ' + scatPw(C.P) + ', into NA ' + (+C.na.toPrecision(3)) + ' ' + where + ' (a cone of ' + scatSig(C.halfDeg, 3) + '° half-angle)']);
  if (S.model !== 'rayleigh' && S.rayleigh.Csca > 0) {
    const off = S.rayleigh.Csca / S.Csca - 1;
    rows.push(['Rayleigh would give', 'scattering ' + scatArea(S.rayleigh.Csca) + ', ' + (Math.abs(off) < 5e-4 ? 'the same' : scatSig(100 * Math.abs(off), 2) + '% ' + (off > 0 ? 'more' : 'less')) + ', and as much back as forward']);
  }
  if (S.model === 'dda' && S.shape === 'sphere') rows.push(['Mie gives', 'scattering ' + scatArea(S.mieEq.Csca) + ': the dipole array is ' + scatSig(100 * (S.Csca / S.mieEq.Csca - 1), 2) + '% from it']);
  if (S.at.trap) rows.push(['Where', 'where the trap holds it: ' + fmtLen(Math.abs(S.at.z)) + (S.at.z >= 0 ? (el.type === 'particle' ? ' past the part' : ' past the screen') : ' before it') + ' along the beam']);
  // in a cavity: solved in its modes, or why not
  const K = S.cav;
  if (K && K.solved && K.method === 'pupil') rows.push(['In ' + K.name, 'a degenerate cavity: its mirrors bring the particle\u2019s light back to it re-imaged (every ' + (K.pattern === 1 ? 'reflection' : K.pattern + ' reflections') + '). ' +
    'Solved over ' + K.nodes + ' directions across their caps, every round trip at once; the light at the particle is ' + scatSig(100 * (K.E2ratio - 1), 3) + '% from the empty cavity\u2019s, and the detectors read the cavity with the particle in it']);
  else if (K && K.solved) rows.push(['In ' + K.name, 'its light comes back to the particle round the cavity: solved in the cavity\u2019s ' + K.modes + ' Hermite-Gauss modes it couples to. ' +
    'The resonance moves by ' + scatSig(K.shiftLw, 3) + ' of a linewidth (' + scatSig(K.shiftHz / 1e3, 3) + ' kHz) and widens by ' + scatSig(K.widenLw, 3) + ' (' + scatSig(K.widenHz / 1e3, 3) + ' kHz); ' +
    'the detectors read the cavity with the particle in it']);
  else if (K && K.why) rows.push(['In ' + K.name, CAV_WHY[K.why] || 'its light comes back to the particle round the cavity, and that is not solved here']);
  for (const f of S.flags) if (FLAG_TEXT[f]) rows.push(['', FLAG_TEXT[f]]);
  return rows;
}
/* A Particle part: where its scattered light goes on the bench (the readout's last rows), a row for each part that catches some (its share of the
   scattered power and the power, as launched into the part's aperture) and one for what no part catches */
function caughtRows(el) {
  const R = lastTrace.scat && lastTrace.scat.parts && lastTrace.scat.parts[el.id], rows = [];
  if (el.scatLight === false) return [['On the bench', 'Its scattered light is not sent to the parts (the Particle tab turns it on).']];
  if (!R || R.state === 'dark' || R.state === 'none') return rows;
  if (R.state === 'wait') return [['On the bench', 'Working out the scattered light…']];
  for (const r of R.rows) rows.push(['Caught by ' + r.name, scatPct(r.share) + ' of the scattered power, ' + scatPw(r.P) + (r.followed ? '' : ' (not traced on: only the ' + R.rows.filter(q => q.followed).length + ' parts that catch most are)')]);
  rows.push(['Not collected', scatPct(R.lostShare) + ', ' + scatPw(R.lost) + (R.rows.length ? '' : ': no part has a clear line to the particle')]);
  if (R.state === 'stale') rows.push(['', 'From before the last change: being worked out again.']);
  return rows;
}
/* A Particle part's trap, from its scattering run (which solves the trap where it is): { T, busy } as the Trap tab takes them */
export function particleTrapLater(el) {
  const A = scatterLater(el), S = A.S;
  if (S && S.error) return { T: { error: S.error === 'no beam' ? 'no focused beam' : S.error }, busy: !!A.busy, none: !!A.none };
  const P = trapLater(el);
  return { T: P.T ? (P.T.error ? { error: P.T.error } : trapReport(el, P.T)) : null, busy: !!A.busy || P.busy, none: !!A.none };
}
/* The bench's trace launches each Particle part's scattered light from the answer kept for it. Where that answer is from
   before the last change (or there is none yet), the worker is asked for a new one; when it comes the bench is drawn
   again with it. Called as the bench is drawn. */
export function scatterKeepUp() {
  const P = lastTrace.scat && lastTrace.scat.parts;
  if (!P) return;
  for (const el of project.elements) if (el.type === 'particle' && el.scatLight !== false && P[el.id] && (P[el.id].state === 'stale' || P[el.id].state === 'wait')) scatterLater(el);
}
/* the page's wiring: where there are workers a trace does not wait for a scattering run */
export function wireScatter() { if (!TEST_MODE && WORKERS_OK) setScatMode('async'); }
const SCAT_DB = 40;        // a log plot's depth
/* the pattern on one cut as a polar plot: the angle as on the bench (or from the beam, up), the radius the intensity */
function drawPolar(cv, el, S, which) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, side = Math.min(w, 340), c = cv.getContext('2d');
  cv.style.height = side + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(side * dpr);
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, side);
  cv._csv = null;
  if (!S || !S.cutIn) return;
  const cut = which === 'out' ? S.cutOut : S.cutIn, log = el.scatScale !== 'lin';
  const cx = w / 2, cy = side / 2, R = side / 2 - 30, n = cut.I.length;
  let mx = 0; for (const v of cut.I) if (v > mx) mx = v;
  if (!(mx > 0)) return;
  const rOf = v => (log ? Math.max(0, 1 + 10 * Math.log10(Math.max(v / mx, 1e-30)) / SCAT_DB) : v / mx) * R;
  c.font = axisFont(); c.lineWidth = 1;
  // rings and spokes
  c.strokeStyle = inkA(0.12); c.fillStyle = getCss('--jek-ink-soft');
  for (let q = 1; q <= 4; q++) { c.beginPath(); c.arc(cx, cy, R * q / 4, 0, 2 * Math.PI); c.stroke(); }
  c.beginPath();
  for (let a = 0; a < 360; a += 30) { c.moveTo(cx, cy); c.lineTo(cx + R * Math.cos(a * deg), cy - R * Math.sin(a * deg)); }
  c.stroke();
  c.textAlign = 'left'; c.textBaseline = 'bottom';
  for (let q = 1; q <= 3; q++) c.fillText(log ? '−' + (SCAT_DB * (4 - q) / 4) + ' dB' : String(q / 4), cx + 3, cy - R * q / 4 - 1);
  c.textBaseline = 'middle';
  for (const a of [0, 90, 180, 270]) {
    const x = cx + (R + 12) * Math.cos(a * deg), y = cy - (R + 12) * Math.sin(a * deg);
    c.textAlign = a === 0 ? 'right' : a === 180 ? 'left' : 'center';
    c.fillText(a + '°', a === 0 ? cx + R + 21 : a === 180 ? cx - R - 21 : x, y);
  }
  // the detector's cone, where its axis lies in this plane
  const C = S.collect, d0 = S.dir;
  const coneAt = which === 'out' ? (C.dir === 'fwd' ? 0 : C.dir === 'back' ? 180 : C.dir === 'up' ? 90 : null) : (Math.abs(C.axis[2]) < 1e-6 ? Math.atan2(C.axis[1], C.axis[0]) / deg : null);
  if (coneAt !== null && C.halfDeg > 0) {
    c.fillStyle = inkA(0.07); c.beginPath(); c.moveTo(cx, cy);
    c.arc(cx, cy, R, -(coneAt + C.halfDeg) * deg, -(coneAt - C.halfDeg) * deg); c.closePath(); c.fill();
  }
  // which way the light goes: an arrow in to the particle
  const bd = which === 'out' ? 0 : Math.atan2(d0[1], d0[0]) / deg;
  c.strokeStyle = getCss('--jek-orange'); c.fillStyle = getCss('--jek-orange'); c.lineWidth = 1.5;
  {
    const ux = Math.cos(bd * deg), uy = -Math.sin(bd * deg), x0 = cx - ux * R, y0 = cy - uy * R, x1 = cx - ux * R * 0.72, y1 = cy - uy * R * 0.72;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    c.beginPath(); c.moveTo(x1 + ux * 2, y1 + uy * 2); c.lineTo(x1 - ux * 6 - uy * 4, y1 - uy * 6 + ux * 4); c.lineTo(x1 - ux * 6 + uy * 4, y1 - uy * 6 - ux * 4); c.closePath(); c.fill();
  }
  const line = (ys, dash, col, lw) => {
    c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash); c.beginPath();
    for (let i = 0; i < n; i++) { const a = i * 360 / (n - 1) * deg, r = rOf(ys[i]), x = cx + r * Math.cos(a), y = cy - r * Math.sin(a); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.stroke(); c.setLineDash([]);
  };
  line(cut.Is, [4, 3], inkA(0.55), 1);
  line(cut.I, [], getCss('--jek-cyan'), 1.8);
  // the particle, and the key
  c.fillStyle = getCss('--jek-ink-soft'); c.beginPath(); c.arc(cx, cy, 2, 0, 2 * Math.PI); c.fill();
  c.textAlign = 'left'; c.textBaseline = 'top';
  c.fillText(which === 'out' ? '0°: the beam’s way, 90°: up' : 'angles as on the bench', 2, 1);
  c.textBaseline = 'bottom';
  // (a beam that rises: its own frame, the level line across it and the line up from it, square to it)
  const tl = !!(S && S.dir && Math.abs(S.dir[2]) > 1e-9), pIn = tl ? 'across the beam, level' : 'in the bench plane', pOut = tl ? 'up from the beam' : 'out of the plane';
  c.fillText('dashed: polarised ' + (which === 'out' ? pIn : pOut), 2, side - 1);
  const an = which === 'out' ? 'angle from the beam towards up' : tl ? 'angle round the level line across the beam' : 'bench angle';
  plotCsv(cv, el.name + ' scattering ' + (which === 'out' ? pOut : pIn), [an + ' (deg)', 'intensity (W/sr)', 'polarised ' + (which === 'out' ? 'across the beam in the plane' : 'out of the plane') + ' (W/sr)'],
    () => Array.from({ length: n }, (_, i) => [i * 360 / (n - 1), cut.I[i], cut.Is[i]]));
}
/* the pattern over every direction: the angle from the beam across, the angle round it up */
function drawScatMap(cv, el, S) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, hgt = Math.min(260, Math.round(w * 0.8)), c = cv.getContext('2d');
  cv.style.height = hgt + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr);
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hgt);
  cv._csv = null;
  if (!S || !S.map) return;
  const M = S.map, log = el.scatScale !== 'lin';
  const sxA = { kind: 'plain', title: 'angle from the beam (°)' }, syA = { kind: 'plain', title: S.dir && Math.abs(S.dir[2]) > 1e-9 ? 'round the beam (°): 0 across it level, 90 up from it' : 'round the beam (°): 0 across in the plane, 90 up' };
  const A = plotArea(c, w, hgt, [0, 360], syA);
  let mx = 0; for (const v of M.I) if (v > mx) mx = v;
  if (!(mx > 0)) return;
  // an image a pixel a degree-and-a-bit, each from the grid's values either side
  const W2 = 180, H2 = 180, img = c.createImageData(W2, H2), th = M.theta, nT = M.nT, nP = M.nP;
  for (let i = 0; i < W2; i++) {
    const t = (i + 0.5) / W2 * 180;
    let a = 0; while (a < nT - 1 && th[a + 1] > t) a++;           // theta falls along the grid
    const b = Math.min(nT - 1, a + 1), f = th[a] === th[b] ? 0 : Math.min(1, Math.max(0, (th[a] - t) / (th[a] - th[b])));
    for (let j = 0; j < H2; j++) {
      const p = (1 - (j + 0.5) / H2) * nP, p0 = Math.floor(p) % nP, p1 = (p0 + 1) % nP, g = p - Math.floor(p);
      const v = (1 - f) * ((1 - g) * M.I[a * nP + p0] + g * M.I[a * nP + p1]) + f * ((1 - g) * M.I[b * nP + p0] + g * M.I[b * nP + p1]);
      const u = log ? 1 + 10 * Math.log10(Math.max(v / mx, 1e-30)) / SCAT_DB : v / mx, rgb = magma(u), o = 4 * (j * W2 + i);
      img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255;
    }
  }
  const off = document.createElement('canvas'); off.width = W2; off.height = H2; off.getContext('2d').putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true; c.drawImage(off, A.l, A.t, A.w, A.h);
  drawAxes(c, A, [0, 180], [0, 360], sxA, syA, { noGrid: true });
  plotCsv(cv, el.name + ' scattering map', ['angle from the beam (deg)', 'angle round the beam (deg)', 'intensity (W/sr)'],
    () => { const out = []; for (let i = nT - 1; i >= 0; i--) for (let j = 0; j < nP; j++) out.push([th[i], M.phi[j], M.I[i * nP + j]]); return out; });
}
/* A Particle part's Scattering tab */
export function scatterSection(el) {
  const isPart = el.type === 'particle';
  panel.append(h('h3', null, 'Scattering'));
  panel.append(particleRows(el));
  if (!isPart) {
    panel.append(helpLine('Choose a particle to read the light it scatters here.', ['Choose a sphere, a rod or a spheroid to read the light it scatters from the beams through this screen: its cross-sections, where the scattered light goes, and how much a lens of a given numerical aperture would collect. Put the screen at (or near) the focus and untick “Stop the rays it records” on the Screen tab so the light carries on. The same particle is the one the Trap tab reads.'], 'note', 'margin-top:0.5rem'));
    return;
  }
  const status = h('div', { class: 'rt-scatrun', role: 'status', 'aria-live': 'polite', style: 'display:none;align-items:center;flex-wrap:wrap;gap:0.6rem;margin-top:0.6rem;font-size:0.8125rem;color:var(--jek-ink-soft)' });
  const bar = h('progress', { class: 'rt-scatbar', max: 1, 'aria-label': 'Scattering progress', style: 'flex:1;min-width:4rem;height:0.4rem;accent-color:var(--jek-cyan)' });
  const box = h('div', { class: 'rt-readout' });
  const views = [['in', 'In the bench plane'], ['out', 'Out of the plane'], ['map', 'Every direction']];
  const tabs = h('div', { class: 'rt-inline', style: 'margin:0.5rem 0 0.3rem;flex-wrap:wrap;column-gap:0.8rem;row-gap:0.2rem' });
  const cv = h('canvas', { style: 'width:100%;display:block' });
  let last = null, sigT = '', sigS = '';
  const draw = () => { const v = vs(el).scatView || el.scatView; if (v === 'map') drawScatMap(cv, el, last); else drawPolar(cv, el, last, v); [...tabs.children].forEach((b, i) => { b.style.fontWeight = views[i][0] === v ? '700' : '600'; b.style.textDecoration = views[i][0] === v ? 'underline' : 'none'; }); };
  for (const [key, text] of views) tabs.append(h('button', { class: 'rt-link', type: 'button', onclick: () => { vs(el).scatView = key; draw(); } }, text));
  // under the figure: its scale, and the lens the Collected figure is for (a notional lens: the particle is lit by every
  // beam through it whatever these say, and its light reaches every part that sees it)
  const scale = h('div', { class: 'rt-rows', style: 'margin-top:0.3rem' }, selectField('Scale', [['log', 'Logarithmic, ' + SCAT_DB + ' dB'], ['lin', 'Linear']], () => el.scatScale, v => { el.scatScale = v; }, { rebuild: false }),
    param('Collection lens NA', el, 'scatNA'),
    selectField('Collection lens faces', [['fwd', 'Ahead (the beam’s way)'], ['back', 'Behind (back along it)'], ['side', 'The side, in the plane'], ['up', 'Above'], ['angle', 'A direction on the bench']], () => el.scatDir, v => { el.scatDir = v; }));
  if (el.scatDir === 'angle') scale.append(param('Direction (°)', el, 'scatAng'));
  scale.append(helpLine('The Collected figure is for this lens alone: the particle is lit by every beam through it whatever is set here.'));
  if (isPart) {
    // the scattered field's picture (engines/scatter-field.js): off unless asked for, its scale its own
    const c = h('input', { type: 'checkbox' }), sfLine = h('div', { class: 'rt-note', style: 'font-size:0.75rem;color:var(--jek-ink-soft);margin-top:0.15rem' });
    c.checked = !!el.scatField;
    c.onchange = () => { checkpoint(); el.scatField = c.checked; changed(true); };
    scale.append(h('label', { class: 'rt-check wide' }, c, 'Draw an estimate of its scattered field'), sfLine,
      helpLine('The far-field pattern falling off as 1/r², drawn as the diffracted field is, in cool colours on a scale of its own.', ['Drawn on the bench and in 3D as the diffracted field is, in a ramp of its own (navy to cyan to white on the dark bench, pale cyan to navy on paper) so it is told from the beam, from the pattern the plots show: the irradiance along each direction is the power scattered into a unit solid angle over the distance squared, and it stops at the first part that direction meets, as the rays do. ',
        'It is the intensity alone, with no fringes against the beam (they are a wavelength apart), and the far field alone, which holds from a few micrometres out. The scattered light is a millionth of the beam or less, so it has a log scale of its own (40 dB on the bench, 20 dB in 3D, where the light is added along each line of sight), which changes nothing of how the beam is drawn. A picture: no reading takes it.'], 'note'));
    bindSync(sfLine, () => {
      const G = el.scatField && lastTrace.scat && ((lastTrace.scat.fans || []).find(F => F.part === el.id) || {}).field;
      const t = G ? 'Its scale: ' + scatSig(G.top, 3) + ' W/mm² at the top (' + fmtLen(G.rTop) + ' out along the brightest direction), to ' + G.dec * 10 + ' dB below, out to ' + fmtLen(G.R) + '.' : '';
      // with the ramp it is drawn in on the bench (scatRamp), floor to top
      if (sfLine.dataset.t !== t + benchLight()) {
        sfLine.dataset.t = t + benchLight();
        const rc = h('canvas', { width: 120, height: 1, style: 'display:block;width:100%;max-width:15rem;height:8px;margin:0.2rem 0 0.1rem;border-radius:2px' }), g = rc.getContext('2d'), img = g.createImageData(120, 1);
        for (let i = 0; i < 120; i++) img.data.set([...scatRamp(i / 119, benchLight()), 255], 4 * i);
        g.putImageData(img, 0, 0);
        sfLine.replaceChildren(...(t ? [t, rc] : []));
      }
      sfLine.hidden = !t;
    });
  }
  panel.append(status, box, tabs, h('div', { class: 'rt-plot' }, cv), plotSaveRow(cv, true), scale);
  let drawnW = -1;
  new ResizeObserver(() => requestAnimationFrame(() => { const w = cv.clientWidth; if (w && Math.abs(w - drawnW) > 0.5) { drawnW = w; draw(); } })).observe(cv);
  bindSync(box, () => {
    const A = scatterLater(el), S = A.S && !A.S.error ? A.S : null;
    // the run's line: what it is doing, and Stop; or that it was stopped, and Run
    let st = [], frac = null;
    // (with a bar of its own beside the line: what the bench's scattering bar reads, scatActivity)
    const act = scatActivity();
    if (A.busy || (act && SCW.ahead)) {
      const P = A.prog;
      const what = act && SCW.ahead ? act.text + '…' : !P ? 'Working out the scattering…' : P.stage === 'dipoles' ? (P.combined ? 'Dipole array: combined from answers already worked out…' : 'Dipole array, ' + P.N + ' dipoles: ' + (P.iter ? 'iteration ' + P.iter + ', residual ' + scatSig(P.resid, 2) : 'starting') + '…')
        : P.stage === 'pattern' ? 'Working out the pattern…' : 'Taking the light at the particle…';
      frac = act ? act.frac : null;
      st = [what, A.busy && !A.ahead ? 'stop' : ''];
    } else if (A.stopped) st = ['Stopped.', 'run'];
    else if (A.S && A.S.error) st = ['No scattering: ' + (A.S.error === 'no beam' || A.S.error === 'no focused beam' || A.S.error === 'no light' ? 'no Gaussian beam through here has a field to take.' : A.S.error), ''];
    else if (A.none) st = [isPart ? 'No Gaussian beam passes the particle (within three beam radii of it).' : 'No Gaussian beam reaches this screen.', ''];
    const s1 = JSON.stringify(st);
    if (s1 !== sigT) {
      sigT = s1;
      status.replaceChildren(...(st.length ? [h('span', null, st[0]), st[1] === 'stop' ? h('button', { class: 'rt-zb', type: 'button', onclick: () => scatStop(el) }, 'Stop')
        : st[1] === 'run' ? h('button', { class: 'rt-zb', type: 'button', onclick: () => scatGo(el) }, 'Run') : ''] : []), bar);
      status.style.display = st.length ? 'flex' : 'none';
    }
    bar.hidden = !st.length || !A.busy && !SCW.ahead;
    if (frac === null) bar.removeAttribute('value'); else bar.value = Math.max(0, Math.min(1, frac));
    box.style.opacity = A.busy && S ? '0.55' : '';              // figures from before the last change, while their run is redone
    // (a Particle part: after its own figures, where its scattered light goes on the bench)
    const rows = (S ? scatterRows(el, S) : []).concat(isPart && (S || A.none) ? caughtRows(el) : []);
    const s2 = JSON.stringify(rows) + '|' + el.scatScale + '|' + (vs(el).scatView || el.scatView);
    if (s2 !== sigS || S !== last) {
      sigS = s2; last = S;
      box.replaceChildren(h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)])));
      box.hidden = !rows.length;
      draw();
    }
  });
  const P = particleOf(el);
  if (isPart) {
    panel.append(helpLine('The light the particle scatters, and the parts that catch it.', ['Lorenz–Mie is exact for a sphere of any size; a dipole array (the discrete dipole approximation) takes a rod or a spheroid; Rayleigh is one dipole, right only for a particle much smaller than the wavelength. Auto takes Mie for a sphere and the dipole array for other shapes. ',
      'The light is every Gaussian beam that passes within three of its radii of the particle. A steep focus (NA above 0.3) is its full vector field, as plane waves from its pupil; a gentler beam is one plane wave where the particle is. Beams of one laser add as fields; separate lasers as powers. ',
      'On the bench each part with a clear line to the particle is sent a cone of rays carrying the scattered field, and its Caught by row gives the share of the scattered power that enters its aperture. What no part catches is the Not collected row. The plots and the Collected figure are the pattern itself, whatever is on the bench.'], 'note', 'margin-top:0.4rem'));
    return;
  }
  panel.append(helpLine('The light the particle scatters, from the beams through this screen.', ['Three models. Lorenz–Mie is exact for a homogeneous sphere of any size. A dipole array (the discrete dipole approximation) takes any shape: the particle as point dipoles on a cubic lattice, each driven by the light and by all the others, their polarisability from the lattice dispersion relation; good to a few percent while |m|kd stays under about 0.5 and the lattice draws the shape (10 dipoles across unless set; ' + SCAT_NMAX + ' dipoles at most unless more across are asked for), and poor for metals. Rayleigh is one dipole, right only for a particle much smaller than the wavelength; Auto takes it only then. ',
    'The light is every beam through the screen’s region, as the Trap tab takes them. A steep focus (NA above 0.3) is its full vector field: each sample of its pupil is a plane wave onto the particle with its own direction, polarisation and phase, and a sphere’s scattered field is the sum of every wave’s Mie field, added as fields, so the particle may sit off the focus. A gentler beam is taken as one plane wave where the particle is. Beams of one laser add as fields; separate lasers as powers. ',
    'Cross-sections and efficiencies are a plane wave’s (for a shape that is not a sphere: along the strongest beam, polarised as the light at the particle is); the powers, the forward and back shares, the collected fraction and the plots are for the light as it is. The collected fraction is the scattered power into a cone of the numerical aperture set, about the direction chosen. One particle, alone: nothing the scattered light meets afterwards is counted, and a screen’s particle sends no light onto the bench. A Particle part (Add, Active and atomic) does: its scattered light goes on to the lenses, detectors and fibres that can see it.' +
    (P.shape !== 'sphere' ? ' The Trap tab takes this particle as the sphere of its volume.' : '')], 'note', 'margin-top:0.4rem'));
}
