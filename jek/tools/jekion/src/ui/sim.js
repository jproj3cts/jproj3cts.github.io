import { TEST_MODE } from '../../../jekray/src/core/constants.js';
import { hooks } from '../../../jekray/src/core/hooks.js';
import { nf } from '../core/units.js';
import { PLANES } from '../core/geom.js';
import { project, V } from '../state/project.js';
import { serialize } from '../state/elements.js';
import { geometryKey, voltageKey } from '../engines/session.js';
import { IW, iwRequest } from '../page/workers.js';

/* ==========================================================================
   The simulation's controller: when the bench changes, the fields are solved (if the geometry changed) and the
   ions flown (if anything changed) in the worker, the potential on the view's cut fetched, and the results kept
   here for the renderer, the panels and the export. Solving and flying happen after a pause, so a value typed
   digit by digit is run once; the bar on the bench says what is going on.
   ========================================================================== */
export const SIM = { get pickedLine() { return pickedLine; }, result: null, slice: null, trap: null, status: '', busy: false, gkey: '', vkey: '', skey: '', seq: 0, when: 0, stale: false, info: null, wanted: null };
let timer = 0, sliceTimer = 0;
const bar = () => document.getElementById('simBar'), text = () => document.getElementById('simText');
function say(msg, busy) {
  SIM.status = msg; SIM.busy = !!busy;
  const b = bar(); if (!b) return;
  text().textContent = msg;
  b.classList.toggle('busy', !!busy); b.classList.toggle('quiet', !msg);
  document.getElementById('simStop').hidden = !busy;
  hooks.ionStatus(msg);
}
const projData = () => serialize();
/* the geometry or voltages changed: solve (if need be) and fly after a pause; the cut is fetched sooner */
export function simChanged() {
  if (!project) return;
  const gk = geometryKey(project), vk = voltageKey(project);
  const geom = gk !== SIM.gkey;
  SIM.stale = true;
  requestSlice();
  if (!project.fly.auto && !geom) { say('Changed: press Fly (Space), or turn on Tools › Fly after every change', false); return; }
  clearTimeout(timer);
  timer = setTimeout(() => flyNow(), geom ? 250 : 120);
}
/* the potential on the view's cut, for drawing */
export function requestSlice() {
  clearTimeout(sliceTimer);
  sliceTimer = setTimeout(async () => {
    if (!project) return;
    cutInside();
    const key = geometryKey(project) + voltageKey(project) + V().plane + V().slice + project.show.efield;
    if (key === SIM.skey && SIM.slice) return;
    try {
      const S = await iwRequest('slice', projData(), { plane: V().plane, slice: V().slice, efield: project.show.efield, t: 0 }, 'slice', p => progress(p));
      if (!S) return;
      S.plane = V().plane; S.id = ++SIM.seq; SIM.slice = S; SIM.skey = key;
      hooks.requestRender(); hooks.ionLegend();
    } catch (err) { console.warn('JEKion slice:', err); say('Could not compute the fields: ' + err.message, false); }
  }, 60);
}
/* the cut's position along the plane's perpendicular is kept while it is within the array; outside (a file saved
   on another plane, the array moved, Page down past the edge) it goes to the analysis point's coordinate there,
   or failing that to the array's middle: a cut through nothing draws nothing, which reads as the fields missing */
export function cutInside() {
  const G = project.grid;
  if (G.sym !== '3d') return;
  const [, , ip] = PLANES[V().plane], lo = [G.x0, G.y0, G.z0][ip], hi = [G.x1, G.y1, G.z1][ip];
  if (V().slice >= lo && V().slice <= hi) return;
  const pt = project.point && project.point[ip], at = pt >= lo && pt <= hi ? pt : (lo + hi) / 2;
  V().slice = +(Math.round(at / G.h) * G.h).toPrecision(8);
  hooks.requestRender();
}
function progress(p) {
  if (!p) return;
  if (p.phase === 'solve') say('Solving the fields: electrode ' + Math.min(p.k + 1, p.n) + ' of ' + p.n + (p.cycle ? ', cycle ' + p.cycle : '') + '…', true);
  else if (p.phase === 'fly') say('Flying: ' + p.done + ' of ' + p.n + ' ions' + (p.t ? ', t = ' + nf(p.t, 3) + ' µs' : '') + '…', true);
}
/* solve and fly now */
export async function flyNow() {
  clearTimeout(timer);
  if (!project) return;
  const gk = geometryKey(project), vk = voltageKey(project), t0 = performance.now();
  if (!project.ions.some(g => g.on !== false)) { SIM.result = null; SIM.stale = false; say(project.electrodes.length ? 'No ion group to fly: + Add › Ion group' : '', false); hooks.requestRender(); hooks.ionResults(); return; }
  say(gk !== SIM.gkey ? 'Solving the fields…' : 'Flying…', true);
  try {
    const R = await iwRequest('fly', projData(), {}, 'fly', p => progress(p));
    if (!R) return;                                           // replaced by a newer request
    SIM.result = R; SIM.gkey = gk; SIM.vkey = vk; SIM.stale = false; SIM.when = Date.now();
    const n = R.particles.length, splat = R.particles.filter(p => p.end.why === 'splat' || p.end.why === 'start').length, det = R.particles.filter(p => p.end.why === 'det').length, out = R.particles.filter(p => p.end.why === 'out').length, time = n - splat - det - out;
    say('Flew ' + n + ' ion' + (n === 1 ? '' : 's') + ' in ' + nf((performance.now() - t0) / 1000, 2) + ' s: ' + [det && det + ' at detectors', splat && splat + ' on electrodes', out && out + ' out of the array', time && time + ' still flying at tₘₐₓ'].filter(Boolean).join(', '), false);
    hooks.requestRender(); hooks.ionResults();
    if (project.point || hasTrap()) trapNow();
  } catch (err) { console.warn('JEKion fly:', err); say('Could not fly: ' + err.message, false); }
}
const hasTrap = () => project.electrodes.some(e => e.on !== false && e.rf && e.rf.on) || !!(project.bfield.bx || project.bfield.by || project.bfield.bz);
/* the trap analysis at the analysis point (the array's centre unless set) */
export async function trapNow() {
  if (!project) return null;
  const G = project.grid, p = project.point || [(G.x0 + G.x1) / 2, G.sym === 'cyl' ? 0 : (G.y0 + G.y1) / 2, G.sym === '3d' ? (G.z0 + G.z1) / 2 : 0];
  try {
    const T = await iwRequest('trap', projData(), { point: p, species: project.species }, 'trap');
    if (T) { SIM.trap = T; hooks.ionResults(); }
    return T;
  } catch (err) { console.warn('JEKion trap:', err); return null; }
}
/* the potential along a line, for a plot */
export const potentialLine = (a, b, n) => iwRequest('line', projData(), { a, b, n }, 'line');
export const probeAt = p => iwRequest('probe', projData(), { p }, 'probe');
export const potentialAtPoints = (pts, t, ts) => iwRequest('probes', projData(), { pts, t: t || 0, ts: ts || null }, 'probes');
/* the line picked on the bench for a potential plot (ui/panels.js), drawn there while it stands: { a, b } or null */
export let pickedLine = null;
export function setPickedLine(v) { pickedLine = v; hooks.requestRender(); return v; }
export function stopFly() {
  clearTimeout(timer);
  if (IW.busy && IW.busy.kind === 'fly') { if (IW.w) IW.w.postMessage({ cancel: IW.busy.id }); else if (IW.busy.local) IW.busy.local.cancelled = true; }
  IW.queue = IW.queue.filter(j => { if (j.kind === 'fly') { j.resolve(null); return false; } return true; });
  say('Stopped', false);
}
export function wireSim() {
  document.getElementById('simStop').addEventListener('click', stopFly);
  document.getElementById('btnStop').addEventListener('click', stopFly);
  document.getElementById('btnFly').addEventListener('click', () => flyNow());
  if (TEST_MODE) say('', false);
}
