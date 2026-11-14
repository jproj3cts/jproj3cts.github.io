import { TEST_MODE } from '../core/constants.js';
import { fmtLen } from '../core/format.js';
import { GLASS } from '../core/glass.js';
import { METAL_NAMES } from '../core/metals.js';
import { particleOf } from '../core/traps.js';
import { deg } from '../state/project.js';
import { getEl } from '../state/elements.js';
import { modDelta } from '../engines/mods.js';
import { SCAT_NMAX, scatCache, scatKeep, scatterNow, scatterPrep, setScatMode } from '../engines/scatter.js';
import { lastTrace } from '../engines/trace.js';
import { trapReport } from '../engines/screen-stats.js';
import { project } from '../state/project.js';
import { getCss, inkA, requestRender } from './render.js';
import { bindSync, helpLine, panel, param, selectField, syncPanel, vs } from './panel.js';
import { h } from './dom.js';
import { axisFont, drawAxes, magma, plotArea, plotCsv, plotSaveRow } from './plots.js';
import { WORKERS_OK, fwProject, midDrag, newAppWorker } from '../page/workers.js';

/* ---------- The Scattering tab ----------
   A screen's particle (the one its Trap tab holds) and the light it scatters: the settings,
   the run (in a worker of its own, so a dipole array's minutes hold nothing else up and can
   be stopped), the readouts and the pattern's plots. The physics is engines/scatter.js. */

/* The worker: this app again, asked for kind 'scatter' (worker/main.js), which sends its
   progress as it goes and the answer at the end. One run at a time; a run whose bench has
   moved on is let finish if it is nearly instant and stopped otherwise; Stop ends the worker. */
const SCW = { w: null, failed: false, job: null, want: new Map(), stopped: new Map(), seq: 0, timer: null };
function scatWorker() {
  if (SCW.w) return SCW.w;
  if (SCW.failed || TEST_MODE || !WORKERS_OK) return null;
  try {
    const w = newAppWorker();
    w.onmessage = e => {
      const m = e.data, J = SCW.job;
      if (!J || J.id !== m.id) return;
      if (m.prog) { J.prog = m.prog; syncPanel(); return; }
      SCW.job = null;
      if (!m.ok) { console.warn('JEKray scattering worker:', m.err); scatFail(); return; }
      // (a Particle part's answer is what the bench's trace launches its scattered light from: kept, the bench is drawn again)
      if (m.out && m.out.S) { scatKeep(J.elId, m.out.key, m.out.S); requestRender(); }
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
  SCW.w = null; SCW.job = null;
  syncPanel();
}
function scatKill() {
  if (SCW.w) SCW.w.terminate();
  SCW.w = null; SCW.job = null;
}
function scatPump() {
  if (SCW.job || !SCW.want.size) return;
  // (a moment after the last change, so a value being typed or dragged starts one run, not ten)
  clearTimeout(SCW.timer);
  SCW.timer = setTimeout(() => {
    if (SCW.job || !SCW.want.size) return;
    if (midDrag()) { scatPump(); return; }
    const [elId, key] = SCW.want.entries().next().value;
    SCW.want.delete(elId);
    const el = getEl(elId), J = el && scatterPrep(el), w = J && J.key === key && scatWorker();
    if (!w) { syncPanel(); return; }
    SCW.job = { id: ++SCW.seq, elId, key, t0: performance.now(), prog: null };
    w.postMessage({ id: SCW.job.id, kind: 'scatter', args: { id: elId }, proj: fwProject(), mods: modDelta(w) });
    syncPanel();
  }, 120);
}
/* A screen's scattering: { S, busy, prog, stopped }. S is the last answer for this screen (stale
   while busy), null before the first; prog the run's progress. */
export function scatterLater(el) {
  const J = scatterPrep(el);
  if (!J) return { S: null, busy: false, none: true };
  const c = scatCache.get(el.id);
  if (c && c.key === J.key) return { S: c.S, busy: false };
  if (TEST_MODE || SCW.failed || !WORKERS_OK) return { S: scatterNow(el), busy: false };
  if (SCW.stopped.get(el.id) === J.key) return { S: c ? c.S : null, busy: false, stopped: true, stale: !!c };
  const job = SCW.job;
  if (job && job.elId === el.id) {
    if (job.key === J.key) return { S: c ? c.S : null, busy: true, prog: job.prog, t0: job.t0, stale: !!c };
    // the bench has moved on under a run: a quick one finishes, a long one is stopped
    if (performance.now() - job.t0 > 1200) scatKill();
  }
  SCW.want.set(el.id, J.key);
  scatPump();
  return { S: c ? c.S : null, busy: true, prog: null, stale: !!c };
}
function scatStop(el) {
  const J = scatterPrep(el);
  if (J) SCW.stopped.set(el.id, J.key);
  SCW.want.delete(el.id);
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
    // a Particle part: what it is made of is on its own tab; here the model, where it is and the cone the Collected figure is for
    const sph = el.trapShape === 'sphere';
    rows.append(selectField('Model', [['auto', 'Auto'], ['rayleigh', 'Rayleigh (one dipole)'], ['mie', 'Mie (a sphere, exact)'], ['dda', 'Dipole array']], () => el.scatModel, v => { el.scatModel = v; }));
    if (el.scatModel === 'dda' || (el.scatModel === 'auto' && !sph)) rows.append(param('Dipoles across (0: chosen)', el, 'scatDip', { noSweep: true }));
    rows.append(selectField('Where it is', [['part', 'Where the part is'], ['trap', 'Where the trap holds it']], () => el.scatAt, v => { el.scatAt = v; }, { wide: true }),
      param('Moved across (µm)', el, 'scatDx'), param('Moved up (µm)', el, 'scatDy'), param('Moved along the beam (µm)', el, 'scatDz'));
    rows.append(param('Collecting NA', el, 'scatNA'),
      selectField('Collected from', [['fwd', 'Ahead (the beam’s way)'], ['back', 'Behind (back along it)'], ['side', 'The side, in the plane'], ['up', 'Above'], ['angle', 'A direction on the bench']], () => el.scatDir, v => { el.scatDir = v; }));
    if (el.scatDir === 'angle') rows.append(param('Direction (°)', el, 'scatAng'));
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
  cavity: 'Scattering inside a cavity is not modelled: the light here comes back to the particle more than once, and these readings take its scattered light back to it once only.',
};
/* why a cavity's modes do not take a particle's light (engines/scatter-cavity.js) */
const CAV_WHY = {
  degenerate: 'the cavity is degenerate or near it (its round-trip Gouy phase within three linewidths of a simple fraction of a turn, up to sixths): its transverse modes share resonances, so they are not solved one by one.',
  unstable: 'the cavity is not stable, so it has no Hermite-Gauss modes to solve in.',
  ring: 'a ring cavity: the light the particle sends back would run round the other way, which the trace does not follow.',
  legs: 'only a two-mirror cavity with the particle on its axis is solved in its modes.',
  turned: 'a part of the cavity is turned out of the plane: its modes are not solved here.',
  misaligned: 'the cavity\u2019s axis is off its pilot (a mirror tilted): its modes are not solved here.',
  clipped: 'a mirror\u2019s edge cuts the mode (within three of its radii): its modes are not Hermite-Gauss ones.',
  entry: 'the light let in does not pass the particle on its way into the cavity: not solved here.',
  steady: 'the cavity\u2019s steady state is not worked out yet.',
  loss: 'the cavity keeps too little of its light round a trip to resonate.',
};
/* the readout's rows for an answer */
function scatterRows(el, S) {
  const rows = [], D = S.dda;
  const how = S.model === 'mie' ? ', ' + S.mie.terms + ' terms' + (S.shape === 'sphere' ? ', exact for a sphere' : '')
    : S.model === 'dda' ? ': ' + D.N + ' dipoles ' + scatSig(D.d, 3) + ' nm apart (' + scatSig(D.across, 3) + ' across), |m|kd = ' + scatSig(D.mkd, 2) + ', lattice dispersion relation; ' +
      (D.converged ? 'solved in ' + D.iters + ' iterations' : 'not converged after ' + D.iters + ' iterations') + ' (residual ' + scatSig(D.resid, 2) + ')'
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
  if (K && K.solved) rows.push(['In ' + K.name, 'its light comes back to the particle round the cavity: solved in the cavity\u2019s ' + K.modes + ' Hermite-Gauss modes it couples to. ' +
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
  return { T: S && S.trapRaw ? trapReport(el, S.trapRaw) : S && S.error ? { error: S.error === 'no beam' ? 'no focused beam' : S.error } : null, busy: !!A.busy, none: !!A.none };
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
  const status = h('div', { class: 'rt-scatrun', role: 'status', 'aria-live': 'polite', style: 'display:none;align-items:center;gap:0.6rem;margin-top:0.6rem;font-size:0.8125rem;color:var(--jek-ink-soft)' });
  const box = h('div', { class: 'rt-readout' });
  const views = [['in', 'In the bench plane'], ['out', 'Out of the plane'], ['map', 'Every direction']];
  const tabs = h('div', { class: 'rt-inline', style: 'margin:0.5rem 0 0.3rem;flex-wrap:wrap;column-gap:0.8rem;row-gap:0.2rem' });
  const cv = h('canvas', { style: 'width:100%;display:block' });
  let last = null, sigT = '', sigS = '';
  const draw = () => { const v = vs(el).scatView || el.scatView; if (v === 'map') drawScatMap(cv, el, last); else drawPolar(cv, el, last, v); [...tabs.children].forEach((b, i) => { b.style.fontWeight = views[i][0] === v ? '700' : '600'; b.style.textDecoration = views[i][0] === v ? 'underline' : 'none'; }); };
  for (const [key, text] of views) tabs.append(h('button', { class: 'rt-link', type: 'button', onclick: () => { vs(el).scatView = key; draw(); } }, text));
  const scale = h('div', { class: 'rt-rows', style: 'margin-top:0.3rem' }, selectField('Scale', [['log', 'Logarithmic, ' + SCAT_DB + ' dB'], ['lin', 'Linear']], () => el.scatScale, v => { el.scatScale = v; }, { rebuild: false }));
  panel.append(status, box, tabs, h('div', { class: 'rt-plot' }, cv), plotSaveRow(cv, true), scale);
  let drawnW = -1;
  new ResizeObserver(() => requestAnimationFrame(() => { const w = cv.clientWidth; if (w && Math.abs(w - drawnW) > 0.5) { drawnW = w; draw(); } })).observe(cv);
  bindSync(box, () => {
    const A = scatterLater(el), S = A.S && !A.S.error ? A.S : null;
    // the run's line: what it is doing, and Stop; or that it was stopped, and Run
    let st = [];
    if (A.busy) {
      const P = A.prog;
      const what = !P ? 'Working out the scattering…' : P.stage === 'dipoles' ? 'Dipole array, ' + P.N + ' dipoles: ' + (P.iter ? 'iteration ' + P.iter + ', residual ' + scatSig(P.resid, 2) : 'starting') + '…'
        : P.stage === 'pattern' ? 'Working out the pattern…' : 'Taking the light at the particle…';
      st = [what, 'stop'];
    } else if (A.stopped) st = ['Stopped.', 'run'];
    else if (A.S && A.S.error) st = ['No scattering: ' + (A.S.error === 'no beam' || A.S.error === 'no focused beam' || A.S.error === 'no light' ? 'no Gaussian beam through here has a field to take.' : A.S.error), ''];
    else if (A.none) st = [isPart ? 'No Gaussian beam passes the particle (within three beam radii of it).' : 'No Gaussian beam reaches this screen.', ''];
    const s1 = JSON.stringify(st);
    if (s1 !== sigT) {
      sigT = s1;
      status.replaceChildren(...(st.length ? [h('span', null, st[0]), st[1] === 'stop' ? h('button', { class: 'rt-zb', type: 'button', onclick: () => scatStop(el) }, 'Stop')
        : st[1] === 'run' ? h('button', { class: 'rt-zb', type: 'button', onclick: () => scatGo(el) }, 'Run') : ''] : []));
      status.style.display = st.length ? 'flex' : 'none';
    }
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
