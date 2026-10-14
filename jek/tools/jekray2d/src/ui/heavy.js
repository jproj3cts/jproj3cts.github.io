import { TEST_MODE, clamp } from '../core/constants.js';
import { m2Of } from '../core/pulses.js';
import { isHigherMode, srcModes } from '../core/beams-hom.js';
import { V, project } from '../state/project.js';
import { getEl } from '../state/elements.js';
import { lastTrace } from '../engines/trace.js';
import { DPR, clipSegPlanes, ctx, glowA, glowOp, requestRender, segPlanes, sx, sy } from './render.js';
import { drag } from './pointer.js';
import { benchFrame, fieldFrames, fieldHeld, playing, showActivityNow, sweepJob } from './sweeps.js';
import { h, syncPanel } from './panel.js';
import {
  POP_MAX_SEGS, POP_MAX_SEGS_2D, POP_ROWS, POP_SLICES, popKeyOf, popRoundEv, popRunGen, popSources,
  popState
} from '../engines/beam-tree.js';
import { changed, toast } from './actions.js';
import { checkpoint } from './tabs.js';
import { fieldWorker, fwMismatch, fwRequest, fwUnpackRun } from '../page/workers.js';

/* ---------- A heavy field, said before it is worked out ----------
   What a field run will cost, from what the tracer made: the Gaussian segments each source's
   field will carry (as popRunGen counts them), on its grid, round or 2D. The time per segment
   was measured (round about 10 ms + 7.5e-5 N^2, 2D about 40 ms + 1.7e-3 N^2) and is scaled by
   how fast this computer turned out to be on the runs it has finished. Past HEAVY_MS the bench
   says so, and offers what would lighten it. */
export const HEAVY_MS = 8000;
const fieldSpeed = { f: 1 };                    // measured over estimated, on this computer
export function fieldCost(beams, srcs) {
  const by = new Map(srcs.map(e => [e.id, { el: e, n: 0, ghost: 0, twoD: e.popModel === '2d' || m2Of(e) > 1 || isHigherMode(e), root: 0 }]));
  const ghostAt = new Uint8Array(beams.length);
  beams.forEach((b, i) => {
    const S = by.get(b.src);
    if (!S) return;
    ghostAt[i] = (b.ev && b.ev.ghost) || (b.parent >= 0 && ghostAt[b.parent]) ? 1 : 0;
    if (!popRoundEv(b.ev)) S.twoD = true;
    if (b.parent < 0) S.root = Math.max(S.root, b.w || 1);
  });
  beams.forEach((b, i) => {
    const S = by.get(b.src);
    if (!S || (b.parent >= 0 && b.w < (S.twoD ? 1e-3 : 1e-4) * (S.root || 1))) return;
    S.n++; if (ghostAt[i]) S.ghost++;
  });
  let ms = 0, segs = 0, ghost = 0, worst = null;
  for (const S of by.values()) {
    const N = S.el.popN || 256, n = Math.min(S.n, S.twoD ? POP_MAX_SEGS_2D : POP_MAX_SEGS);
    const per = S.twoD ? 40 + 1.7e-3 * N * N : 10 + 7.5e-5 * N * N;
    S.ms = n * per * Math.max(1, srcModes(S.el).length);
    // the main path is worked out whatever happens; weak reflections fill what the cap leaves
    ms += S.ms; segs += n; ghost += clamp(n - (S.n - S.ghost), 0, S.ghost);
    if (!worst || S.ms > worst.ms) worst = S;
  }
  return { ms: ms * fieldSpeed.f, raw: ms, segs, ghost, worst };
}
function fieldSpeedLearn(took, raw) {
  if (!(raw > 500 && took > 0)) return;
  const r = clamp(took / raw, 0.2, 5);
  fieldSpeed.f = clamp(fieldSpeed.f * 0.6 + r * 0.4, 0.2, 5);
}
const heavy = { box: null, key: null, go: new Set(), hidden: new Set() };
const aboutTime = ms => ms < 90000 ? 'about ' + Math.max(10, Math.round(ms / 5000) * 5) + ' s' : 'about ' + Math.round(ms / 60000) + ' min';
// shown while a heavy field is worked out; held: the page has no worker, so it waits to be asked
function heavyShow(key, est, held) {
  if (TEST_MODE || heavy.hidden.has(key)) return;
  if (!heavy.box) {
    heavy.box = h('div', { class: 'rt-heavy', role: 'status', 'aria-live': 'polite' });
    document.getElementById('stage').append(heavy.box);
  }
  heavy.key = key;
  const S = est.worst, el = S && S.el, N = el ? el.popN : 0;
  const what = est.segs + ' beam segment' + (est.segs === 1 ? '' : 's') + (el ? ' on a ' + (S.twoD ? N + ' \u00d7 ' + N : N + '-point round') + ' grid' : '') +
    (est.ghost ? ', ' + est.ghost + ' of them from weak reflections' : '');
  const act = (label, fn) => h('button', { type: 'button', class: 'rt-btn', onclick: () => { fn(); } }, label);
  const acts = [];
  if (est.ghost && project.ghosts) acts.push(act('Stop following weak reflections', () => { checkpoint(); project.ghosts = false; changed(true); toast('Weak reflections are no longer followed'); }));
  if (el && N >= 512) acts.push(act('Use ' + N / 2 + ' points', () => { checkpoint(); el.popN = N / 2; changed(true); toast(el.name + ': ' + N / 2 + ' grid points'); }));
  if (est.segs > 12 && project.minPower < 2) {
    const f = +Math.min(2, project.minPower * 10).toPrecision(2);
    acts.push(act('Raise the power floor to ' + f + '%', () => { checkpoint(); project.minPower = f; changed(true); toast('Power floor ' + f + '%'); }));
  }
  if (held) acts.push(act('Work it out anyway', () => { heavy.go.add(key); heavyHide(); schedulePop(); }));
  else acts.push(act('Hide', () => { heavy.hidden.add(key); heavyHide(); }));
  heavy.box.replaceChildren(
    h('p', null, h('b', null, (held ? 'This field would take ' : 'This field will take ') + aboutTime(est.ms)), ': ' + what + '.' + (held ? ' The page would be held up while it is worked out.' : '')),
    h('div', { class: 'rt-heavy-acts' }, ...acts));
  heavy.box.hidden = false;
}
function heavyHide() { if (heavy.box) heavy.box.hidden = true; heavy.key = null; }

/* Runs the field a few tens of milliseconds at a time; a change to the bench restarts it */
export function schedulePop() {
  if (popState.timer || TEST_MODE || sweepJob || fieldHeld()) return;
  if (fieldWorker()) {
    popState.timer = setTimeout(() => {
      popState.timer = null;
      const srcs = popSources(), key = popKeyOf(lastTrace.beams, srcs);
      if (key === popState.key || (popState.job && popState.job.key === key)) return;
      if (!srcs.length) { popState.result = null; popState.key = key; popState.job = null; heavyHide(); requestRender(); return; }
      const est = fieldCost(lastTrace.beams, srcs);
      if (est.ms > HEAVY_MS) heavyShow(key, est, false); else heavyHide();
      const job = { key, t0: performance.now(), raw: est.raw }, beams = lastTrace.beams;
      popState.job = job;
      fwRequest('bench', 'bench').then(o => {
        if (popState.job !== job) return;
        popState.job = null;
        if (!o) { requestRender(); return; }             // abandoned: the next frame asks again if still wanted
        fwMismatch(o.key === key);
        if (o.key !== key) { requestRender(); return; }
        fieldSpeedLearn(performance.now() - job.t0, job.raw);
        if (heavy.key === key) heavyHide();
        popState.result = fwUnpackRun(o.R, beams); popState.key = key;
        requestRender(); syncPanel();
      }).catch(() => { if (popState.job === job) popState.job = null; schedulePop(); });
    }, 60);
    return;
  }
  popState.timer = setTimeout(function step() {
    const srcs = popSources();
    const key = popKeyOf(lastTrace.beams, srcs);
    if (!popState.job || popState.job.key !== key) {
      if (key === popState.key) { popState.timer = null; popState.job = null; return; }
      if (!srcs.length) { popState.result = null; popState.key = key; popState.timer = null; heavyHide(); requestRender(); return; }
      // on the page a heavy field would hold everything up: it waits to be asked for
      const est = fieldCost(lastTrace.beams, srcs);
      if (est.ms > HEAVY_MS && !heavy.go.has(key)) { heavyShow(key, est, true); popState.timer = null; return; }
      if (est.ms > HEAVY_MS) heavyShow(key, est, false); else heavyHide();
      // slices per segment from a rough count of the segments to come
      const n = lastTrace.beams.filter(b => srcs.some(e => e.id === b.src)).length;
      popState.job = { key, t0: performance.now(), raw: est.raw, gen: popRunGen(lastTrace.beams, srcs, { draw: true, per: clamp(Math.floor(POP_SLICES / Math.max(1, n)), 6, 48) }) };
      showActivityNow();
      popState.timer = setTimeout(step, 30);    // a frame for the bar to show before the first slice
      return;
    }
    const until = performance.now() + 30;
    let r;
    do r = popState.job.gen.next(); while (!r.done && performance.now() < until);
    if (r.done) {
      fieldSpeedLearn(performance.now() - popState.job.t0, popState.job.raw);
      if (heavy.key === popState.job.key) heavyHide();
      popState.result = r.value; popState.key = popState.job.key; popState.job = null; popState.timer = null;
      requestRender(); syncPanel();
      return;
    }
    popState.timer = setTimeout(step, 0);
  }, 60);
}

/* The field overlay; returns the sources it drew, so their envelopes are only outlined */
export function drawPop() {
  const srcs = popSources();
  if (!srcs.length) return new Set();
  // mid-drag the field is stale at every step: the outlines show, and it is worked out on release
  if (drag && drag.started && (drag.mode === 'move' || drag.mode === 'rotate') && !playing.size) return new Set();
  const key = popKeyOf(lastTrace.beams, srcs);
  if (key !== popState.key && fieldFrames.bench.has(key)) {
    popState.key = key; popState.result = benchFrame(key); popState.job = null;
  }
  if (key !== popState.key) { schedulePop(); return new Set(); }
  const R = popState.result;
  if (!R) return new Set();
  const s = V().scale;
  ctx.save();
  ctx.globalCompositeOperation = glowOp();
  ctx.imageSmoothingEnabled = true;
  // each segment cut along the surfaces it runs between (see segPlanes), its end slices drawn on past its ends to meet them
  const TB = lastTrace.beams || [], at = new Map(TB.map((b, i) => [[b.x0, b.y0, b.dx, b.dy].join(','), i]));
  for (const sg of R.segs) {
    const D = sg.draw, b = sg.b;
    if (!D || b.bench !== project.tab) continue;
    const i = at.get([b.x0, b.y0, b.dx, b.dy].join(',')), PL = i !== undefined ? segPlanes(TB, i) : { p0: null, p1: null };
    const ts = D.ts, last = ts.length - 1, e0 = PL.p0 ? Math.min(5, PL.p0.tan) * D.Ys[0] : 0, e1 = PL.p1 ? Math.min(5, PL.p1.tan) * D.Ys[last] : 0;
    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    clipSegPlanes(PL, (b.len3 || b.len) + 6 * Math.max(...D.Ys));
    const nx = -b.dy, ny = b.dx;
    ctx.setTransform(DPR * s * b.dx, -DPR * s * b.dy, DPR * s * nx, -DPR * s * ny, DPR * sx(b.x0), DPR * sy(b.y0));
    ctx.globalAlpha = glowA(0.95 * D.alpha);
    for (let c = 0; c < ts.length; c++) {
      const tA = c ? 0.5 * (ts[c - 1] + ts[c]) : ts[0] - e0;
      const tB = c < last ? 0.5 * (ts[c] + ts[c + 1]) : ts[c] + e1;
      if (tB <= tA) continue;
      ctx.drawImage(D.cv, 3 * c + 1, 0, 1, POP_ROWS, tA, -D.Ys[c], tB - tA, 2 * D.Ys[c]);
    }
    ctx.restore();
  }
  ctx.restore();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  return new Set(srcs.map(e => e.id));
}

/* A line for the source panel on what the field run found */
/* a lens (or window) whose rim clips the Gaussian beam: a note for its panel, with the share of the
   light the tracer carries round it, or null when nothing is clipped there */
export function clipNote(el) {
  const R = popState.result;
  if (!R || popState.key !== popKeyOf(lastTrace.beams, popSources()) || !R.notes.clipped.has(el.id)) return null;
  // the light round the rim, as the tracer splits it off: against its siblings through the glass
  // (a rim beam of a rim beam, the light passing the part again on its way back, has no sibling
  // through the glass to count against)
  let rim = 0, thru = 0;
  for (const b of lastTrace.beams) if (b.ev && b.ev.el === el.id && b.ev.kind === 'split' && b.ev.mode === 'P') {
    let t = 0;
    for (const c of lastTrace.beams) if (c !== b && c.parent === b.parent && c.ev && c.ev.el === el.id && c.ev.mode === 'T') t += c.w;
    if (t > 0) { rim += b.w; thru += t; }
  }
  const share = rim + thru > 0 ? Math.round(100 * rim / (rim + thru)) : 0;
  return 'The beam is wider than this part: ' + (share > 0 ? 'about ' + share + ' % of its light' : 'some of its light') +
    ' goes round the rim, traced on its own, and the field through it is clipped (its pilot beam refitted after). A larger aperture, or a smaller beam, keeps it whole.';
}
export function popNote(el) {
  const R = popState.result;
  if (!R || popState.key !== popKeyOf(lastTrace.beams, popSources())) return 'Computing the field\u2026';
  const mine = R.segs.filter(sg => sg.src === el);
  if (!mine.length) return 'No beam to propagate.';
  const name = id => { const e = getEl(id); return e ? e.name : '?'; };
  const two = R.notes.engine.get(el.id) === '2d';
  let t = (two ? '2D field on ' + el.popN + ' \u00d7 ' + el.popN : 'Round field on ' + el.popN + ' radial') + ' points along ' +
    mine.length + ' segment' + (mine.length === 1 ? '' : 's') + ' (' + Math.round(R.ms) + ' ms for the scene).';
  const why = R.notes.why.get(el.id);
  if (two) t += (why ? ' Not round because of ' + [...why].map(name).join(', ') + '.' : ' Set to always use 2D.') + ' It carries its polarisation at every point, with each surface\u2019s s and p coefficients taken sample by sample.';
  const cl = [...R.notes.clipped].map(name);
  if (cl.length) t += ' Clipped at ' + cl.join(', ') + '; the pilot beam is refitted after each.';
  const st = [...R.notes.steep].map(name);
  if (st.length) t += ' The wavefront after ' + st.join(', ') + ' turns faster than the grid can follow: use more points.';
  const co = [...R.notes.coarse].map(name);
  if (co.length) t += ' ' + co.join(', ') + (co.length > 1 ? ' have' : ' has') + ' detail finer than three grid samples, so its diffraction is only roughly right: use more points.';
  if (R.truncated) t += ' Stopped after ' + (two ? POP_MAX_SEGS_2D : POP_MAX_SEGS) + ' segments; the weakest branches were left out.';
  return t;
}

