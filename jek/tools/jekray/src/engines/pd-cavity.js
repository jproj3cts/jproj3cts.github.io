import { TEST_MODE } from '../core/constants.js';
import { hooks } from '../core/hooks.js';
import { cdotc } from '../core/maths.js';
import { C_MM } from '../core/modulators.js';
import { cohGamma, lagOf, splitRoot } from '../core/coherence.js';
import { deg, project } from '../state/project.js';
import { getEl } from '../state/elements.js';
import { frame, toLocal } from '../core/mask.js';
import { lastTrace, sourceLines, traceScene } from './trace.js';
import { arrival3, deviceCache } from './fibre-face.js';
import { popStats } from './field.js';
import { cavLoops } from './cavity.js';
import { popStats2 } from './field2d.js';
import { popRun, popRunGen } from './beam-tree.js';
import { diffFns, popDiffraction, popScreenPrep, segFieldAt } from './diffraction.js';

/* ---------- A photodiode behind a cavity ----------
   The tracer follows a cavity's light round only as many times as its interaction limit
   allows, which for a good cavity is far short of its steady state. A diode that light
   reaches by way of a cavity is read from the field engine instead, which solves every
   round trip at once (and each sideband's own, at its own detuning): the fields arriving
   are summed over the diode as a screen sums them, and beat against each other. */
const cavReach = new WeakMap();
export function viaCavity(el) {
  let m = cavReach.get(lastTrace);
  if (!m) {
    const B = lastTrace.beams || [], inLoop = new Set();
    for (const L of cavLoops(B)) for (let j = L.s; j < L.path.length; j++) inLoop.add(L.path[j]);
    m = new Set();
    if (inLoop.size) B.forEach((b, i) => { if (!b.endEl) return; for (let j = i; j >= 0; j = B[j].parent) if (inLoop.has(j)) { m.add(b.endEl); break; } });
    cavReach.set(lastTrace, m);
  }
  return m.has(el.id);
}
export function detectorField(el, R) {
  const f = frame(el), a0 = el.angle * deg, sYx = -Math.sin(a0), sYy = Math.cos(a0), nX = Math.cos(a0), nY = Math.sin(a0);
  const arr = R.segs.filter(sg => sg.b.endEl === el.id && sg.b.dx * nX + sg.b.dy * nY < 0);
  const out = { mw: 0, tones: [], byNm: [] };
  if (!arr.length) return out;
  const hits = arr.map(sg => {
    const G = sg.leg.at(sg.b.len), st = sg.eng === '2d' ? popStats2(G) : popStats(G);
    const [, ly] = toLocal(f, sg.b.x0 + sg.b.dx * sg.b.len, sg.b.y0 + sg.b.dy * sg.b.len);
    return Object.assign({ sg, G, st, ly, p: sYx * -sg.b.dy + sYy * sg.b.dx }, arrival3(el, sg.b));
  });
  // a grid over the light, on the diode (round where each lands, above or below its centre too)
  const a = el.length / 2;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const h2 of hits) {
    const wx = (h2.st.wx || h2.st.w) / (Math.abs(h2.p) || 1), wy = h2.st.wy || h2.st.w, c = h2.lz || 0;
    u0 = Math.min(u0, h2.ly - 3 * wx); u1 = Math.max(u1, h2.ly + 3 * wx); v0 = Math.min(v0, c - 3 * wy); v1 = Math.max(v1, c + 3 * wy);
  }
  u0 = Math.max(u0, -a); u1 = Math.min(u1, a); v0 = Math.max(v0, -a); v1 = Math.min(v1, a);
  if (!(u1 > u0) || !(v1 > v0)) return out;
  const N = 96, du = (u1 - u0) / N, dv = (v1 - v0) / N, pts = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const u = u0 + (i + 0.5) * du, v = v0 + (j + 0.5) * dv; if (u * u + v * v <= a * a) pts.push([u, v]); }
  const E = hits.map(h2 => { const fn = segFieldAt(h2, sYx, sYy); return pts.map(([u, v]) => fn(u, v) || [0, 0, 0, 0]); });
  const L = h2 => (h2.sg.b.gpl || 0) + (h2.sg.b.ng || h2.sg.b.n) * h2.sg.b.len + lagOf(h2.sg.src), root = h2 => splitRoot(h2.sg.src);
  const base = h2 => h2.sg.coh.replace(/@[^#]*/, ''), fo = h2 => h2.sg.b.fo || 0;
  // each pair's overlap over the diode, in the beam's own cross-section
  const ov = (i, j) => {
    let re = 0, im = 0;
    for (let k = 0; k < pts.length; k++) { const c = cdotc(E[i][k], E[j][k]); re += c[0]; im += c[1]; }
    const hxOf = h2 => h2.vs ? 1 / Math.sqrt(1 + h2.vs * h2.vs) : 1;      // a beam met sloped up the face lights more of it, less brightly
    const w = du * dv * Math.sqrt(Math.abs(hits[i].p * hits[j].p) * hxOf(hits[i]) * hxOf(hits[j])) / Math.sqrt(hits[i].sg.repr * hits[j].sg.repr);
    return [re * w, im * w];
  };
  const tones = new Map(), add = (fq, re, im, incoh) => { const k = (incoh ? 'x' : '') + Math.round(fq), t = tones.get(k) || { f: fq, re: 0, im: 0, incoh }; t.re += re; t.im += im; tones.set(k, t); };
  for (let i = 0; i < hits.length; i++) for (let j = i; j < hits.length; j++) {
    const A = hits[i], B = hits[j], rA = root(A), rB = root(B);
    if (A.sg.coh === B.sg.coh) {                      // one launch at one frequency: its DC
      const c = ov(i, j), g = cohGamma(rA), gam = i === j || !g ? 1 : g(L(A) - L(B));
      out.mw += (i === j ? 1 : 2) * gam * c[0] * (A.sg.b.lmw || 0);
    } else if (base(A) === base(B) && fo(A) !== fo(B)) {
      // ov(i, j) is <E_i conj(E_j)>; the beat's phase is that of conj(E_X) E_Y, X the lower
      let c = ov(i, j), X = A, Y = B;
      if (fo(A) > fo(B)) { X = B; Y = A; } else c = [c[0], -c[1]];
      const g = cohGamma(rA), w = 2 * (g ? g(L(X) - L(Y)) : 1) * (A.sg.b.lmw || 0);
      add(fo(Y) - fo(X), w * c[0], w * c[1], false);
    } else if (rA !== rB) {
      const df = Math.abs(C_MM / (B.sg.b.nm * 1e-6) + fo(B) - C_MM / (A.sg.b.nm * 1e-6) - fo(A));
      if (df < 1e12) { const c = ov(i, j); add(df, 2 * Math.sqrt((A.sg.b.lmw || 0) * (B.sg.b.lmw || 0)) * Math.hypot(c[0], c[1]), 0, true); }
    }
  }
  out.tones = [...tones.values()].map(t => ({ f: t.f, amp: Math.hypot(t.re, t.im), ph: Math.atan2(t.im, t.re), incoh: t.incoh })).filter(t => t.amp > 1e-12).sort((x, y) => x.f - y.f);
  out.nm = hits[0].sg.b.nm;
  return out;
}
/* its reading: at once in the tests and the worker, from the worker on the page (the tracer's
   meanwhile) */
const detFieldCache = new Map();
export let detFieldGen = 0;                   // readings come in from the worker: a new one counts up
export function detectorFieldResult(el) {
  const J = popScreenPrep(el);
  if (!J) return { mw: 0, tones: [] };
  const key = J.key + '|' + el.length, c = detFieldCache.get(el.id);
  if (c && c.key === key) return c.r;
  const now = () => { const r = detectorField(el, popRun(lastTrace.beams, J.srcs, { keep: J.keep })); detFieldCache.set(el.id, { key, r }); return r; };
  if (TEST_MODE || !hooks.fieldWorker()) return now();
  // one at a time, as for the screens: while the bench keeps changing, the reading being
  // worked out is finished and shown (the last one meanwhile), then the next is asked for
  if (!c || !c.asked) {
    detFieldCache.set(el.id, { key: c ? c.key : null, r: c ? c.r : null, asked: key });
    hooks.fwRequest('detector', 'detector:' + el.id, { id: el.id }).then(o => {
      const cur = detFieldCache.get(el.id);
      if (!cur || cur.asked !== key) return;
      detFieldCache.set(el.id, o && o.key === key ? { key, r: o.r } : { key: cur.key, r: cur.r });
      detFieldGen++;                       // the electronics read it again
      deviceCache.delete(lastTrace); hooks.syncPanel(); hooks.requestRender();
    }).catch(() => { detFieldCache.delete(el.id); hooks.syncPanel(); });
  }
  return c && c.r ? c.r : null;
}

/* The screen's answer, now: for the optimiser, the tests and the export */
export const popScreenCache = new Map();
export let liveScreens = 0;                   // screen fields worked out on the spot (for the tests)
export function diffraction(el) {
  const job = popScreenPrep(el);
  if (!job) return null;
  const c = popScreenCache.get(el.id);
  if (c && c.key === job.key) return c.D;
  const F = hooks.frames();          // (none without a page: the script worker, Node)
  if (F && F.screens.has(job.key)) return F.screens.get(job.key);
  liveScreens++;
  const D = popDiffraction(el, popRun(lastTrace.beams, job.srcs, { keep: job.keep }));
  popScreenCache.set(el.id, { key: job.key, D });
  return D;
}
/* The same for the panels, computed a slice at a time; the last answer stands meanwhile.
   Each open screen has its own job, taken in turn, so pinned screens do not starve each other. */
export const popScreenState = { jobs: new Map(), timer: null };
export function diffractionLater(el) {
  const job = popScreenPrep(el);
  if (!job) return { D: null, busy: false };
  const c = popScreenCache.get(el.id);
  if (c && c.key === job.key) return { D: c.D, busy: false };
  const F = hooks.frames(), fr = F && F.screens.get(job.key);
  if (fr) { popScreenCache.set(el.id, { key: job.key, D: fr }); return { D: fr, busy: false }; }
  if (TEST_MODE) return { D: diffraction(el), busy: false };
  if (hooks.sweepJob()) return { D: c ? c.D : null, busy: true };     // the sweep's renderer is on it
  if (hooks.fieldHeld()) return { D: c ? c.D : null, busy: false };   // a sweep plays without the field: the last one stands
  const S = popScreenState, J0 = S.jobs.get(el.id);
  if (hooks.fieldWorker()) {
    // One field at a time per screen: while the bench keeps changing (a sweep playing, a
    // value being typed), the one being worked out is finished and shown, and the next is
    // asked for the bench as it is then. Starting afresh at every change would never finish.
    if (!J0) {
      const J = { key: job.key, el, worker: true };
      S.jobs.set(el.id, J);
      hooks.fwRequest('screen', 'screen:' + el.id, { id: el.id }).then(o => {
        if (S.jobs.get(el.id) !== J) return;
        S.jobs.delete(el.id);
        if (o) hooks.fwMismatch(o.key === J.key);
        if (o && o.key === J.key) popScreenCache.set(el.id, { key: J.key, D: diffFns(o.D) });
        hooks.syncPanel(); hooks.requestRender();
      }).catch(() => { if (S.jobs.get(el.id) === J) S.jobs.delete(el.id); hooks.syncPanel(); });
    }
    return { D: c ? c.D : null, busy: true };
  }
  if (!J0 || J0.key !== job.key) {
    S.jobs.set(el.id, { key: job.key, el, gen: popRunGen(lastTrace.beams, job.srcs, { keep: job.keep }) });
    hooks.showActivityNow();                 // a slice can run long: up before the first one
  }
  if (!S.timer) S.timer = setTimeout(function step() {
    const first = S.jobs.entries().next();
    if (first.done) { S.timer = null; return; }
    const [id, J] = first.value;
    const until = performance.now() + 30;
    let r;
    do r = J.gen.next(); while (!r.done && performance.now() < until);
    if (r.done) {
      // the last step (the figures, a vector focus) runs in one go and can take seconds, so
      // put the activity bar up now and give it a frame to show before the page is busy
      J.finishing = true;
      hooks.showActivityNow();
      S.timer = setTimeout(() => {
        popScreenCache.set(id, { key: J.key, D: popDiffraction(J.el, r.value) });
        if (S.jobs.get(id) === J) S.jobs.delete(id);
        hooks.syncPanel();
        S.timer = setTimeout(step, 0);
      }, 40);
      return;
    }
    S.timer = setTimeout(step, 0);
  }, 40);
  return { D: c ? c.D : null, busy: true };
}

/* Everything a screen can tell us about the rays that reached it.
   Shared by the readout panel and the optimiser's merit function. */
export const statsCache = new Map();
/* Aberrations at a screen, from a sweep across the field. The chosen fan source is traced
   again at each field: a collimated one turned by a field angle, a diverging one (a point
   object) moved across by an object height and aimed back at the same point. That point, the
   pivot, is where its axis first meets an element that bends or cuts the light; and where an
   aperture stop lies further along (behind a lens), each field's chief ray is aimed through
   the stop's centre, so the pupil stays filled whichever way the light meets it.
   At each field the rays of one wavelength down the main path give, on this screen: the chief
   ray (the middle of the fan) and so the distortion; the spot about it; the best focus along
   the screen's normal (the tangential field curve); and the wavefront, the optical path of
   each ray carried back to a sphere about where the chief ray lands, through the last element
   (the exit pupil, near enough). That is fitted with Zernike's polynomials along the meridian,
   and across the fields with Seidel's terms. The bench is 2D, so this is the tangential
   (meridional) section only: astigmatism shows as a focus that moves with the field. */
export const aberCache = { key: '', out: null };
export function aberSource(el) {
  const hits = ((lastTrace.screens && lastTrace.screens[el.id]) || []).filter(t => !t.chief);
  const ids = [...new Set(hits.map(t => t.sid))].map(getEl).filter(e => e && e.type === 'source' && !e.virtual);
  const pick = ids.find(e => e.id === el.abSrc);
  return { list: ids, src: pick || ids[0] || null };
}
export function aberrations(el) {
  const { src } = aberSource(el);
  if (!src) return null;
  const key = JSON.stringify(project.elements) + '|' + src.id;
  if (aberCache.key === key) return aberCache.out;
  const out = aberSweep(el, src);
  aberCache.key = key; aberCache.out = out;
  return out;
}
function aberSweep(el, src) {
  const point = Math.abs(src.divergence) > 1e-9, max = point ? el.abH : el.abAng, nF = el.abN;
  // the pivot: where the source's axis first meets an element that bends or cuts the light
  const BEND = new Set(['lens', 'asphere', 'axicon', 'cylinder', 'mirror', 'stop', 'mask', 'prism', 'grating', 'cube']);
  let b = lastTrace.beams.findIndex(q => q.src === src.id && q.parent === -1), hit = null;
  for (let guard = 0; b >= 0 && guard < 64; guard++) {
    const q = lastTrace.beams[b], e = q.endEl && getEl(q.endEl);
    if (e && BEND.has(e.type)) { hit = q; break; }
    b = lastTrace.beams.findIndex(c => c.parent === b);
  }
  const a0 = src.angle * deg, u0 = [Math.cos(a0), Math.sin(a0)], v0 = [-u0[1], u0[0]];
  const pivot = hit ? [hit.x0 + hit.dx * hit.len, hit.y0 + hit.dy * hit.len] : [src.x + 100 * u0[0], src.y + 100 * u0[1]];
  const nm0 = sourceLines(src)[0];
  const save = { x: src.x, y: src.y, angle: src.angle, rays: src.rays, traceRays: src.traceRays };
  const nR = Math.max(11, el.abRays | 1);
  const fieldAt = f => {
    if (point) {
      // an object height: moved across, the fan's middle aimed back through the pivot
      const x = save.x + v0[0] * f, y = save.y + v0[1] * f;
      return { x, y, angle: Math.atan2(pivot[1] - y, pivot[0] - x) / deg };
    }
    // a field angle: turned about the pivot
    const c = Math.cos(f * deg), sn = Math.sin(f * deg), rx = save.x - pivot[0], ry = save.y - pivot[1];
    return { x: pivot[0] + c * rx - sn * ry, y: pivot[1] + sn * rx + c * ry, angle: save.angle + f };
  };
  // Ray aiming: with an aperture stop anywhere along the way (behind a lens, say), each field's
  // chief ray is steered through the stop's centre: moved across for a collimated source, turned
  // for a point object, by the secant method on where it crosses the stop
  let stopEl = null;
  for (let i = lastTrace.beams.findIndex(q => q.src === src.id && q.parent === -1), guard = 0; i >= 0 && guard < 64; guard++) {
    const q = lastTrace.beams[i], e = q.endEl && getEl(q.endEl);
    if (e && e.type === 'stop') { stopEl = e; break; }
    i = lastTrace.beams.findIndex(c => c.parent === i && !(c.ev && c.ev.bypass));
  }
  const missAt = P => {
    Object.assign(src, P, { rays: 3, traceRays: true });
    traceScene();
    const q = lastTrace.beams.find(b2 => b2.src === src.id && b2.endEl === stopEl.id && !(b2.ev && b2.ev.bypass));
    if (!q) return NaN;
    return toLocal(frame(stopEl), q.x0 + q.dx * q.len, q.y0 + q.dy * q.len)[1] - (stopEl.offset || 0);
  };
  const aimed = new Map();
  const aim = f => {
    if (aimed.has(f)) return aimed.get(f);
    const P0 = fieldAt(f);
    let out = P0;
    if (stopEl) {
      const a = P0.angle * deg, vx = -Math.sin(a), vy = Math.cos(a);
      const at = d => point ? Object.assign({}, P0, { angle: P0.angle + d }) : Object.assign({}, P0, { x: P0.x + vx * d, y: P0.y + vy * d });
      let d0 = 0, e0 = missAt(at(0)), d1 = point ? 0.01 : 0.1, e1 = missAt(at(d1));
      for (let it = 0; it < 8 && isFinite(e0) && isFinite(e1) && Math.abs(e1) > 1e-7 && e1 !== e0; it++) {
        const d2 = d1 - e1 * (d1 - d0) / (e1 - e0);
        d0 = d1; e0 = e1; d1 = d2; e1 = missAt(at(d1));
      }
      if (isFinite(e1) && Math.abs(e1) < 1e-4) out = at(d1);
    }
    aimed.set(f, out);
    return out;
  };
  const grab = f => {
    Object.assign(src, aim(f), { rays: nR, traceRays: true });
    traceScene();
    const hits = (lastTrace.screens[el.id] || []).filter(t => !t.chief && t.sid === src.id && t.nm === nm0);
    // the main path: the one most rays take
    const byPath = new Map();
    for (const t of hits) { if (!byPath.has(t.path)) byPath.set(t.path, []); byPath.get(t.path).push(t); }
    let best = [];
    for (const L of byPath.values()) if (L.length > best.length) best = L;
    // one ray of each (an unpolarised fan traces each ray once per polarisation)
    const seen = new Set();
    return best.filter(t => !seen.has(t.k) && seen.add(t.k)).sort((a, b) => a.k - b.k);
  };
  const fields = [];
  let par = null;
  try {
    // the paraxial image height: a field a thousandth of the largest
    const eps = (max || 1) * 1e-3, g0 = grab(0), g1 = grab(eps);
    const chiefY = g => {
      const m = (nR - 1) / 2, lo = g.filter(t => t.k <= m).pop(), hi = g.find(t => t.k >= m);
      if (!lo || !hi) return NaN;
      return lo.k === hi.k ? lo.y : lo.y + (hi.y - lo.y) * (m - lo.k) / (hi.k - lo.k);
    };
    const y0 = chiefY(g0), m1 = (chiefY(g1) - y0) / (point ? eps : Math.tan(eps * deg));
    par = { y0, m: m1 };
    for (let j = 0; j < nF; j++) {
      const H = nF === 1 ? 0 : -1 + 2 * j / (nF - 1), f = H * max;
      const g = grab(f);
      fields.push(aberField(g, H, f, nR, chiefY(g), par, point));
    }
  } finally {
    Object.assign(src, save);
    traceScene();
  }
  return aberFit({ src: src.id, srcName: src.name, point, max, nm: nm0, fields, par, rays: nR });
}
/* One field's numbers from its rays on the screen, sorted along the fan */
function aberField(g, H, f, nR, yc, par, point) {
  const out = { H, f, n: g.length, yc, ok: g.length >= 5 && isFinite(yc) };
  if (!out.ok) return out;
  const lam = g[0].nm * 1e-6, n = g[0].n;
  // distortion: the chief ray's height against the paraxial one
  const ideal = par.y0 + par.m * (point ? f : Math.tan(f * deg));
  out.ideal = ideal; out.distMm = yc - ideal;
  out.distPct = Math.abs(ideal - par.y0) > 1e-12 ? 100 * (yc - ideal) / (ideal - par.y0) : 0;
  // the spot, about the chief ray and about its centroid
  const ys = g.map(t => t.y), mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  out.spot = ys.map(y => y - yc);
  out.centroid = mean - yc;
  out.rms = Math.sqrt(ys.reduce((a, y) => a + (y - mean) ** 2, 0) / ys.length);
  out.width = Math.max(...ys) - Math.min(...ys);
  // best focus along the normal: the screen moved by dz towards the light (T the ray's slope)
  const T = g.map(t => t.dly / Math.sqrt(Math.max(1e-12, 1 - t.dly * t.dly)));
  const mT = T.reduce((a, b) => a + b, 0) / T.length;
  let cov = 0, vT = 0;
  for (let i = 0; i < g.length; i++) { cov += (ys[i] - mean) * (T[i] - mT); vT += (T[i] - mT) ** 2; }
  out.dz = vT > 1e-18 ? cov / vT : NaN;
  out.rmsBest = NaN;
  if (isFinite(out.dz)) { const yb = ys.map((y, i) => y - out.dz * T[i]), mb = yb.reduce((a, b) => a + b, 0) / yb.length; out.rmsBest = Math.sqrt(yb.reduce((a, y) => a + (y - mb) ** 2, 0) / yb.length); }
  // the wavefront: each ray carried back from the screen to a sphere of radius R about the
  // chief ray's landing point, R the distance back to the last element the light met
  const backs = g.map(t => t.back).filter(v => v > 0).sort((a, b) => a - b), R = backs.length ? backs[backs.length >> 1] : 100;
  const pts = [];
  let uc = null;
  for (const t of g) {
    const dl = t.dly, dx = -Math.sqrt(Math.max(0, 1 - dl * dl)), a = t.y - yc;       // the ray heads along (dx, dl), dx < 0
    const s = a * dl + Math.sqrt(Math.max(0, a * a * dl * dl - a * a + R * R));
    const P = [-s * dx, a - s * dl];                                                  // on the sphere, from the landing point
    pts.push({ P, L: t.opl - t.n * s, k: t.k });
  }
  // the pupil coordinate: across the chief ray's direction, where the middle of the fan is
  const mid = pts.reduce((b, q) => Math.abs(q.k - (nR - 1) / 2) < Math.abs(b.k - (nR - 1) / 2) ? q : b);
  const cl = Math.hypot(mid.P[0], mid.P[1]); uc = [mid.P[0] / cl, mid.P[1] / cl];
  const acr = pts.map(q => q.P[1] * uc[0] - q.P[0] * uc[1]);
  const rp = Math.max(...acr.map(Math.abs));
  const Lc = mid.L;
  // W is how far each part of the wave is ahead of the sphere, in waves (a lens or mirror too
  // strong at its edge, under-corrected, has W040 above zero); a ray lands -(R/n rp) dW/drho out
  // rho runs the way the image moves as the field grows (as the field H does), so coma and
  // distortion have their usual signs whichever way the screen faces
  const sgn = par.m < 0 ? -1 : 1;
  out.rho = acr.map(v => sgn * v / rp); out.W = pts.map(q => (Lc - q.L) / lam);
  out.R = R; out.rp = rp; out.nImg = n;
  out.na = n * rp / Math.hypot(rp, R);
  // Zernike's polynomials along the meridian (fringe numbering, the y ones): piston, tilt,
  // defocus, coma, spherical, then their fifth-order partners
  const Z = [[1, 'Z1', 'piston', r => 1], [3, 'Z3', 'tilt', r => r], [4, 'Z4', 'defocus', r => 2 * r * r - 1], [8, 'Z8', 'coma', r => 3 * r ** 3 - 2 * r],
    [9, 'Z9', 'spherical', r => 6 * r ** 4 - 6 * r * r + 1], [15, 'Z15', 'fifth-order coma', r => 10 * r ** 5 - 12 * r ** 3 + 3 * r], [16, 'Z16', 'fifth-order spherical', r => 20 * r ** 6 - 30 * r ** 4 + 12 * r * r - 1]];
  const c = lsq(out.rho.map(r => Z.map(z => z[3](r))), out.W);
  out.zern = Z.map((z, i) => ({ j: z[0], name: z[1], what: z[2], c: c ? c[i] : NaN }));
  // the power series too, for Seidel's terms: W = a0 + a1 r + a2 r^2 + a3 r^3 + a4 r^4
  out.poly = lsq(out.rho.map(r => [1, r, r * r, r ** 3, r ** 4]), out.W);
  // rms wavefront error: about piston and tilt, and with the defocus taken out as well
  const rmsAbout = cols => { const q = lsq(out.rho.map(r => cols.map(fn => fn(r))), out.W); if (!q) return NaN;
    let s2 = 0; out.rho.forEach((r, i) => { const v = out.W[i] - cols.reduce((a, fn, k) => a + q[k] * fn(r), 0); s2 += v * v; }); return Math.sqrt(s2 / out.rho.length); };
  out.rmsW = rmsAbout([r => 1, r => r]);
  out.rmsWbest = rmsAbout([r => 1, r => r, r => r * r]);
  out.strehl = Math.exp(-((2 * Math.PI * out.rmsWbest) ** 2));
  return out;
}
/* Least squares: the coefficients that best fit y from rows of basis values, or null */
function lsq(rows, y) {
  const m = rows[0] ? rows[0].length : 0;
  if (!m || rows.length < m) return null;
  const A = Array.from({ length: m }, () => new Float64Array(m + 1));
  rows.forEach((r, i) => { for (let a = 0; a < m; a++) { for (let b = 0; b < m; b++) A[a][b] += r[a] * r[b]; A[a][m] += r[a] * y[i]; } });
  for (let c = 0; c < m; c++) {
    let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-300) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < m; r++) if (r !== c) { const k = A[r][c] / A[c][c]; for (let q = c; q <= m; q++) A[r][q] -= k * A[c][q]; }
  }
  return Array.from({ length: m }, (_, c) => A[c][m] / A[c][c]);
}
/* Seidel's terms from the fields' power series: W040 the spherical (the same at every field),
   W131 the coma (growing as H), W020 the focus on axis and W22T the tangential field
   curvature and astigmatism together (as H^2), W311 the distortion (as H^3, from the chief ray) */
function aberFit(A) {
  const ok = A.fields.filter(f => f.ok && f.poly);
  A.seidel = null;
  if (ok.length < 3) return A;
  const fitH = (vals, pows) => lsq(ok.map(f => pows.map(p => f.H ** p)), ok.map(vals));
  const s040 = fitH(f => f.poly[4], [0, 2]), s131 = fitH(f => f.poly[3], [1, 3]), s2 = fitH(f => f.poly[2], [0, 2, 4]);
  const d = fitH(f => f.distMm, [1, 3, 5]);
  const f0 = ok.reduce((b, f) => Math.abs(f.H) < Math.abs(b.H) ? f : b);
  // distortion as a wavefront term: the chief ray off by -(R/(n rp)) dW/drho, W311 H^3 rho
  const W311 = d ? -Math.sign(A.par.m || 1) * d[1] * f0.nImg * f0.rp / f0.R / (A.nm * 1e-6) : NaN;
  A.seidel = { W040: s040 ? s040[0] : NaN, W131: s131 ? s131[0] : NaN, W020: s2 ? s2[0] : NaN, W22T: s2 ? s2[1] : NaN, W311,
    distPct: ok.reduce((b, f) => Math.abs(f.H) > Math.abs(b.H) ? f : b).distPct };
  A.dz0 = f0.dz;
  for (const f of A.fields) f.curv = f.ok ? f.dz - f0.dz : NaN;
  return A;
}
/* Ray power w as a percentage of what the given sources send out (all of them when none are
   given), a split source counted by its share of its laser */
export function pctOfSources(w, ids) {
  const by = lastTrace.emittedBy || {}, list = ids ? [...ids] : Object.keys(by);
  const E = list.reduce((a, id) => a + (by[id] || 0), 0);
  return E > 0 ? 100 * w / E : 100 * w / Math.max(1, lastTrace.emitted);
}
export const blockedPct = el => pctOfSources(lastTrace.blocked[el.id] || 0, (lastTrace.blockedSrc || {})[el.id] || []);

