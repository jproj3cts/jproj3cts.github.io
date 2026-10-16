import { BEAM_Z, EPS, FAR, IN_WORKER, TEST_MODE, TRACE_BUDGET, clamp } from '../core/constants.js';
import { hooks } from '../core/hooks.js';
import { absorbAt, refIndex } from '../core/glass.js';
import { bireAxis, birefIndex, filterT, gainAt, gainSat, setGainSat, walkOff } from '../core/crystals.js';
import { C_NM_GHZ, filmCoef, gridCoef, metalR } from '../core/rf.js';
import { C_SI } from '../core/cells.js';
import { cellJones, cellPolar, circShares } from '../core/zeeman.js';
import {
  beamReach, beamShape, cellPlanFor, evalPlan, gratingOrders, nlcConv, nlcConvert, nlcSources,
  setCellPlanMemo, setNlcConv
} from '../core/nlc.js';
import { MODS, aomOrders, cmul, eomSidebands, famAt, jonesAt, linesPerMm } from '../core/modulators.js';
import { splitOffset, splitRoot } from '../core/coherence.js';
import { gddPath, isLaserLike, m2Of, pulseGrid, pulseOf, syncLine, syncSplit } from '../core/pulses.js';
import { beamAt, isHigherMode, m2Env, srcModes } from '../core/beams-hom.js';
import { wavelengthColour } from '../core/colour.js';
import { PARTS } from '../parts/registry.js';
import { deg, project } from '../state/project.js';
import { stackAmp } from '../core/coatings.js';
import { FREE_3D, VSRC, getEl, setVSRC } from '../state/elements.js';
import { ensureBenches, linkPairs } from '../state/tabs.js';
import { dsagFn, kapIn, makeSurf, maskOf, rawDsag, rawSag, sagFn } from '../core/geometry.js';
import { elementSurfaces, meshRay } from '../core/stl.js';
import {
  frame, lensEdges, maskMeanSlope, stopExtent, stopMargin, stopSlitLike, toLocal, toLocalDir, toWorld,
  toWorldDir
} from '../core/mask.js';
import { fibreNetCached, tipSources } from './fibre.js';
import { modJonesM } from './mods.js';
import { cavSolved, findCavities, laserSources, laserState, setCavCache } from './cavity.js';
import { jonesOf, jonesRoll, rollJones } from './polarisation.js';
import { diffCache } from './diffraction.js';
import { statsCache } from './pd-cavity.js';
import { binCache } from './screen-stats.js';

/* ==========================================================================
   Ray tracing
   ========================================================================== */

/* ---------- A beam across an element's edge ----------
   A Gaussian beam wider than the part of an element it meets is split there, in two
   branches of the beam tree: the part that lands on the element goes through it (or off
   it), and the part that misses carries straight on past it. Each branch has its own
   reference ray: the one through meets the element (its surfaces carried on past the rim
   where the beam's own centre misses it, so its reference still refracts or reflects as the
   light near the edge does, while its field is still cut to the real aperture), and the one
   past ignores the element and has its field cut to what misses it. They share the beam's
   power as the Gaussian lands. A split is made only if both parts keep SPLIT_MIN of the beam
   the reference ray set out with. */
const SPLIT_MIN = 0.01;
const SPLIT_KINDS = new Set(['iris', 'link', 'absorb']);          // stops are masks on the field already; link planes are no edge
// a screen that lets the light through (a trap's, a plane that only records) is no edge either:
// splitting at it doubled the beams at every pass, a retroreflected trap's most of all
const splittable = s => s && s.el && !SPLIT_KINDS.has(s.kind) && !(s.el.type === 'screen' && !s.el.absorb) && s.semi > 0 && !s.y0;
/* the share of a beam (1/e^2 radii w in the plane, wv out of it) centred at ly on a surface,
   travelling at cos(theta) = cth to the element's axis, that lands inside its aperture */
function apertureShare(s, ly, cth, w, wv) {
  const edge = s.maskMargin || ((u, v) => s.semi - Math.hypot(u, v));
  // each sample counted by how far inside it is (the edge function is a distance), which
  // takes the edge between samples smoothly and the share to a fraction of a percent
  const N = 64, c = Math.max(1e-6, cth), h = 2 * 2.6 * Math.max(w / c, wv) / N;
  let tot = 0, inn = 0;
  for (let i = 0; i < N; i++) {
    const x = ((i + 0.5) / N * 2 - 1) * 2.6 * w, gx = Math.exp(-2 * x * x / (w * w));
    for (let j = 0; j < N; j++) {
      const y = ((j + 0.5) / N * 2 - 1) * 2.6 * wv, g = gx * Math.exp(-2 * y * y / (wv * wv));
      tot += g; inn += g * clamp(0.5 + edge(ly + x / c, y) / h, 0, 1);
    }
  }
  return tot > 0 ? inn / tot : 1;
}
/* a surface carried on past its rim, for a reference ray that must meet it off the element */
function extendedSurf(s) {
  if (s._ext) return s._ext;
  let semi = s.semi * 3 + 10;
  if (!s.flat && s.c) semi = Math.min(semi, 0.98 / Math.abs(s.c) / Math.sqrt(Math.max(1, 1 + (s.k || 0))));
  const e = Object.create(s);
  e.semi = semi;
  if (!s.flat) {
    let lo = s.xmin, hi = s.xmax;
    for (let i = -20; i <= 20; i++) { const v = s.z + sagFn(s, semi * i / 20); if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    e.xmin = lo - 1e-6; e.xmax = hi + 1e-6;
  }
  Object.defineProperty(s, '_ext', { value: e, enumerable: false });
  return e;
}
/* the event where a beam's part past an element starts: nothing but a cut to what misses it */
function bypassEvent(s, base) {
  const edge = s.maskMargin || ((u, v) => s.semi - Math.hypot(u, v));
  const surf = Object.create(s);
  surf.flat = true; surf.cyl = null; surf.maskFn = null; surf.odd = null;
  surf.maskMargin = (u, v) => -edge(u, v);
  const ev = Object.assign(base, { bypass: true, mask: { shape: 'disc', a: s.semi, o: 0, ext: s.semi } });
  return Object.defineProperty(ev, 'surf', { value: surf, enumerable: false, configurable: true });
}
function intersectSurf(s, px, py, dx, dy, tmin) {
  px -= s.z;
  const xmin = s.xmin - s.z, xmax = s.xmax - s.z;
  let t0 = tmin, t1 = Infinity;
  // slab clip to the surface's bounding box
  if (Math.abs(dx) < 1e-15) { if (px < xmin || px > xmax) return null; }
  else {
    let a = (xmin - px) / dx, b = (xmax - px) / dx;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  }
  if (Math.abs(dy) < 1e-15) { if (py < -s.semi || py > s.semi) return null; }
  else {
    let a = (-s.semi - py) / dy, b = (s.semi - py) / dy;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  }
  if (!(t0 <= t1)) return null;

  if (s.flat) {
    if (Math.abs(dx) < 1e-15) return null;
    const t = -px / dx;
    if (t < tmin) return null;
    const y = py + t * dy;
    return Math.abs(y) <= s.semi ? t : null;
  }
  if (s.conicOnly) {
    // closed form: c(y² + (1+k)x²) − 2x = 0, keeping the branch through the vertex
    const q = 1 + s.k, c = s.c;
    const A = c * (dy*dy + q*dx*dx);
    const B = 2 * c * (py*dy + q*px*dx) - 2 * dx;
    const C = c * (py*py + q*px*px) - 2 * px;
    let r1, r2;
    if (Math.abs(A) < 1e-14) { if (Math.abs(B) < 1e-15) return null; r1 = r2 = -C / B; }
    else {
      const disc = B*B - 4*A*C;
      if (disc < 0) return null;
      const sq = Math.sqrt(disc);
      const qq = -0.5 * (B + (B >= 0 ? sq : -sq));
      r1 = qq / A; r2 = qq !== 0 ? C / qq : r1;
      if (r1 > r2) [r1, r2] = [r2, r1];
    }
    for (const t of [r1, r2]) {
      if (t < tmin || t < t0 - 1e-9 || t > t1 + 1e-9) continue;
      const y = py + t*dy;
      if (Math.abs(y) > s.semi) continue;
      if (Math.abs(px + t*dx - sagFn(s, y)) < 1e-6 * (1 + Math.abs(px))) return t;
    }
    return null;
  }
  // general asphere: bracket the first root of f(t) = x(t) − sag(y(t)), then Illinois
  const f = t => px + t*dx - sagFn(s, py + t*dy);
  const N = 24, step = (t1 - t0) / N;
  let ta = t0, fa = f(ta);
  for (let i = 1; i <= N; i++) {
    const tb = t0 + i * step, fb = f(tb);
    if (fa === 0) return ta;
    if (fa * fb <= 0) {
      let lo = ta, hi = tb, flo = fa, fhi = fb, side = 0, t = tb;
      for (let it = 0; it < 60; it++) {
        t = (lo * fhi - hi * flo) / (fhi - flo);
        const ft = f(t);
        if (Math.abs(ft) < 1e-13 || hi - lo < 1e-13) break;
        if ((ft < 0) === (flo < 0)) { lo = t; flo = ft; if (side === -1) fhi *= 0.5; side = -1; }
        else { hi = t; fhi = ft; if (side === 1) flo *= 0.5; side = 1; }
      }
      return Math.abs(py + t*dy) <= s.semi + 1e-9 ? t : null;
    }
    ta = tb; fa = fb;
  }
  return null;
}

function intersectSeg(sg, px, py, dx, dy, tmin) {
  const ex = sg[2] - sg[0], ey = sg[3] - sg[1];
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-15) return null;
  const qx = sg[0] - px, qy = sg[1] - py;
  const t = (qx * ey - qy * ex) / den;
  const u = (qx * dy - qy * dx) / den;
  return (t >= tmin && u >= 0 && u <= 1) ? t : null;
}

export let exporting = false;
export function setExporting(v) { return (exporting = v); }
export let lastTrace = { rays: [], screens: {} };
export function setLastTrace(v) { return (lastTrace = v); }

function subFrame(f, lf) {
  const [ox, oy] = toWorld(f, lf.x, lf.y);
  const a = Math.atan2(f.s, f.c) + lf.a;
  return { ox, oy, c: Math.cos(a), s: Math.sin(a) };
}

/* The Jones states a source launches. Rays carry complex s and p amplitudes;
   an unpolarised source is two half-power rays that never interfere. */
function sourcePol(src) {
  const r2 = Math.SQRT1_2;
  if (src.pol === 's') return [{ as: 1, ap: 0 }];
  if (src.pol === 'p') return [{ as: 0, ap: 1 }];
  if (src.pol === 'linear') {
    const a = src.polAngle * deg;
    return [{ as: Math.sin(a), ap: Math.cos(a) }];
  }
  return [{ as: r2, ap: 0 }, { as: 0, ap: r2 }];
}

/* Pilot beam of a ray fan taken as a uniform pupil, as [Re q, Im q], or null for a single
   ray. A fan with a width is a top-hat of that diameter, curved to its divergence; a
   point source is a uniform cone, whose pilot has the same far-field angle. */
function fanPilot(src, nm) {
  const lam = nm * 1e-6, a = src.width / 2, th = src.divergence / 2 * deg;
  if (src.rays < 2) return null;
  if (a > 0) {
    const iR = Math.tan(th) / a, ii = lam / (Math.PI * a * a), den = iR * iR + ii * ii;
    return [iR / den, ii / den];
  }
  if (Math.abs(th) > 1e-9 && Math.abs(th) < Math.PI / 2) {
    const w0 = lam / (Math.PI * Math.tan(Math.abs(th)));
    return [0, Math.PI * w0 * w0 / lam];
  }
  return null;
}

/* Every wavelength a source emits: its own, plus any extra lines */
export function sourceLines(src) {
  const out = [src.wavelength];
  for (const v of src.lines || []) if (!out.includes(v)) out.push(v);
  return out;
}

/* ---------- Tracing, and when to do it again ----------
   The trace depends on the bench and nothing else (what it works out for itself, lasing gain
   and the beams in vapour cells, it settles by tracing again). So it is kept until the bench
   changes: panning, zooming and redrawing cost nothing. How long it took is noted: a bench
   slow to trace is traced in a background thread while something is being dragged or a
   sweep plays (see traceLater), so the page keeps up and draws the rays as they come. */
export let lastTraceKey = null, lastTraceMs = 0, loadGen = 0, traceCount = 0;
export function setTraceCount(v) { return (traceCount = v); }
export function setLoadGen(v) { return (loadGen = v); }
export function setLastTraceMs(v) { return (lastTraceMs = v); }
export function setLastTraceKey(v) { return (lastTraceKey = v); }
// the electronics (their blocks and wires) carry no light, so moving or changing them does not call for a new trace
/* RF parts met past their model (a grid or mesh with its pitch over the wavelength: a grating), by id, from the last trace */
export const rfNotes = new Set();
export const traceKeyNow = () => loadGen + '|' + MODS.rev + '|' + project.maxBounces + '|' + project.minPower + '|' + project.ghosts + '|' + project.benches.map(b => b.id).join(',') + '|' +
  JSON.stringify(project.elements.filter(e => e.type !== 'elec' && e.type !== 'draw'), (k, v) => COSMETIC.has(k) ? undefined : v) + '|' + JSON.stringify((project.fibres || []).filter(F => !F.wire));
// what changes nothing in the light: a part's name and where it is written, its import notes, drawings
const COSMETIC = new Set(['hide3d', 'label', 'name', 'assumed', 'design', 'source']);
export function traceScene() {
  for (const e of project.elements) if (isLaserLike(e)) syncLine(e);
  const key = traceKeyNow();
  if (key === lastTraceKey && lastTrace.beams) return;
  // a sweep playing round again: each step's trace kept from the cycle before
  const keep = traceStoreOn();
  if (keep && traceStore.has(key)) {
    const c = traceStore.get(key);
    statsCache.clear(); diffCache.clear(); binCache.clear();
    lastTrace = c.T; lastTraceKey = key; lastTraceMs = c.ms; traceStoreHits++;
    afterTrace();
    return;
  }
  const t0 = performance.now();
  traceCount++;
  traceSceneRaw();
  // the key as the bench stands after it (a split source takes its laser's settings as it goes)
  lastTraceKey = traceKeyNow();
  lastTraceMs = performance.now() - t0;
  if (keep) keepTrace(lastTraceKey, lastTrace, lastTraceMs);
}
/* While a sweep plays, the traces of its steps are kept, so the second cycle and after only
   draw them. Only a bench the trace worker can trace whole: nothing on it carries state from
   one trace to the next (fibre networks, lasers, vapour cells); kept up to a few hundred
   thousand rays' worth, dropped when the sweeps stop. */
export const traceStore = new Map();
export let traceStoreRays = 0, traceStoreHits = 0;
const TRACE_STORE_RAYS = 400000;
export const traceStoreOn = () => !TEST_MODE && !IN_WORKER && hooks.playing() && !(project.fibres || []).length && !VSRC.size && project.elements.every(e => TW_FREE.has(e.type));
function keepTrace(key, T, ms) {
  const n = (T.rays || []).length + 1;
  traceStore.set(key, { T, ms, n }); traceStoreRays += n;
  while (traceStoreRays > TRACE_STORE_RAYS && traceStore.size > 1) { const [k, v] = traceStore.entries().next().value; traceStore.delete(k); traceStoreRays -= v.n; }
}
export function dropTraceStore() { traceStore.clear(); traceStoreRays = 0; }
/* light round loops through free space and the fibres: what the tips send out, carried from
   one pass of the trace to the next, and how many passes it has had */
let tipCarry = null, tipPass = 0, traceDepth = 0;
const TIP_PASSES = 8;
export function traceSceneRaw() {
  if (traceDepth === 0) { tipCarry = null; tipPass = 0; }
  traceDepth++;
  try { traceSceneOnce(); } finally { traceDepth--; }
}
/* ---------- Heights: each part's optical centre above the breadboard ----------
   A part may sit higher or lower than the beam height (75 mm, the default). Each ray carries
   its height z and its slope u (dz/ds), and is traced exactly in 3D (see intersect3): a part
   takes only the light that lands inside its aperture, round or square, once its height is
   counted; a curved surface is met where the ray reaches it, and bends the light by its normal
   there in 3D, s and p taken from its own plane of incidence; a mask's delay bends it by its
   gradient both ways, a grating keeps its rise across the grooves. With every part at the beam
   height and every source a line none of this runs, and the bench traces exactly as it did. */
/* A source's rays across its beam: [t across in the bench plane, s up out of it], each from -0.5
   to 0.5 of its width (and of its divergence, for a point source). A line, as ever, n across;
   a cross, n across and n up; a square grid of n by n, trimmed to the round beam; or hexapolar,
   rings of 6, 12, 18... about the middle, as lens design programs trace a pupil. */
export const RAY_PATTERNS = [['line', 'A line across the bench'], ['cross', 'A cross: across and up'], ['grid', 'A grid across the beam'], ['hex', 'Hexapolar rings']];
export function rayPattern(src, n) {
  const pat = src.pattern || 'line', out = [], at = i => n === 1 ? 0 : i / (n - 1) - 0.5;
  if (pat === 'line' || n <= 1) { for (let i = n - 1; i >= 0; i--) out.push([at(i), 0, i]); return out; }
  if (pat === 'cross') {
    for (let i = n - 1; i >= 0; i--) out.push([at(i), 0, i]);
    for (let j = n - 1; j >= 0; j--) if (Math.abs(at(j)) > 1e-12) out.push([0, at(j), n + j]);
    return out;
  }
  if (pat === 'grid') {
    for (let i = n - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) { const t = at(i), u = at(j); if (t * t + u * u <= 0.25 + 1e-9) out.push([t, u, i * n + j]); }
    return out;
  }
  // hexapolar: as many rings as fit n across the diameter
  const R = Math.max(1, Math.round((n - 1) / 2));
  out.push([0, 0, 0]);
  for (let k = 1; k <= R; k++) for (let m = 0; m < 6 * k; m++) { const r = k / (2 * R), a = 2 * Math.PI * m / (6 * k); out.push([r * Math.cos(a), r * Math.sin(a), out.length]); }
  return out;
}
export const zOf = el => el && el.z !== undefined ? el.z : BEAM_Z;
export function setZ(el, z) { if (!isFinite(z)) return; z = clamp(+z, 0, 2000); if (Math.abs(z - BEAM_Z) < 1e-9) delete el.z; else el.z = +z.toFixed(4); }
const anyHeights = () => project.elements.some(e => e.type === 'stl' || (e.z !== undefined && e.z !== BEAM_Z) || e.tip || e.roll || (e.type === 'source' && e.pattern && e.pattern !== 'line') || (e.type === 'fibre' && e.emitPattern));
// a mirror tipped out of the plane: degrees, up positive; kept only when not 0
export const tippable = el => FREE_3D.has(el.type) && el.type !== 'draw' && el.type !== 'link';
// rolled about its own axis: degrees, right-handed about the way it faces; kept only when not 0
export function setRoll(el, v) { if (!isFinite(v)) return; v = ((+v + 180) % 360 + 360) % 360 - 180; if (Math.abs(v) < 1e-9) delete el.roll; else el.roll = +v.toFixed(6); }
export function setTip(el, v) { if (!isFinite(v)) return; v = clamp(+v, -90, 90); if (Math.abs(v) < 1e-9) delete el.tip; else el.tip = +v.toFixed(6); }
// a part's aperture out of the plane: round about its centre (a lens, a mirror, a plate), or a
// square band as tall as it is wide (a screen, a cube, a block): the part says (zSquare, zHalf)
const zSquare = el => !!(PARTS[el.type] && PARTS[el.type].zSquare);
const zHalf = (el, semi) => { const P = PARTS[el.type]; return P && P.zHalf ? P.zHalf(el) : semi; };
function zInside(s, yy, h) {
  const el = s.el;
  if (!el || !s.semi) return true;
  if (zSquare(el)) return Math.abs(h) <= zHalf(el, s.semi) + 1e-9;
  return yy * yy + h * h <= s.semi * s.semi * (1 + 1e-12) + 1e-12;
}
/* Out of the plane the trace is as exact as in it. A ray carries its in-plane direction (unit),
   its height z and its slope u = dz/ds along the bench, so its 3D direction is (dx, dy, u) over
   sqrt(1 + u^2). A surface that is a plane in the bench (a flat, a cube's face, a cylinder
   curved in the plane) stands straight up, so where a ray meets it is found in the plane alone;
   a curved one (a lens's or a mirror's face, turned about its axis, or a cylinder curved out
   of the plane) is met where the ray reaches it in 3D, its normal taken there in 3D, and the
   light bent by Snell's law and the law of reflection as vectors. */
const zCurved = s => !!s.cylS || (!s.flat && s.cyl !== 'plane');
function cylOut(s) {
  if (!s._co) { const S = s.cylS; Object.defineProperty(s, '_co', { value: { c: S.c || 0, k: S.k || 0, a2: S.a2 || 0, A: S.A || [], odd: S.odd }, enumerable: false }); }
  return s._co;
}
// the sag of a surface at y across and h up from its centre: a surface of revolution about its
// axis (an off-axis segment's parent's axis), or a cylinder's profile up and down
export function sag3(s, y, h) {
  if (s.cylS) return rawSag(cylOut(s), h);
  if (s.cyl === 'plane') return sagFn(s, y);
  if (s.y0) return rawSag(s, Math.hypot(y + s.y0, h)) - s.sag0;
  return rawSag(s, Math.hypot(y, h));
}
// its unit normal there, towards local +x
function normal3(s, y, h) {
  let nx = 1, ny = 0, nz = 0;
  if (s.cylS) nz = -rawDsag(cylOut(s), h);
  else if (s.cyl === 'plane') ny = -dsagFn(s, y);
  else {
    const Y = y + (s.y0 || 0), r = Math.hypot(Y, h);
    if (r > 1e-12) { const m = rawDsag(s, r) / r; ny = -m * Y; nz = -m * h; }
  }
  const l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}
// where a ray from (px, py) at h0 up, along (dx, dy) in the plane rising u per unit, first meets
// a curved surface: t along the plane, as intersectSurf gives it
function intersect3(s, px, py, h0, dx, dy, u, tmin) {
  px -= s.z;
  let xmin = s.xmin - s.z, xmax = s.xmax - s.z;
  if (s.cylS) {
    if (!s._cx) {
      let lo = 0, hi = 0;
      for (let i = 0; i <= 64; i++) { const v = rawSag(cylOut(s), s.semi * (i / 32 - 1)); if (v < lo) lo = v; if (v > hi) hi = v; }
      Object.defineProperty(s, '_cx', { value: [lo - 1e-9, hi + 1e-9], enumerable: false });
    }
    [xmin, xmax] = s._cx;
  }
  let t0 = tmin, t1 = Infinity;
  const slab = (p, d, lo, hi) => {
    if (Math.abs(d) < 1e-15) return p >= lo && p <= hi;
    let a = (lo - p) / d, b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    return true;
  };
  if (!slab(px, dx, xmin, xmax) || !slab(py, dy, -s.semi, s.semi) || !slab(h0, u, -s.semi, s.semi) || !(t0 <= t1)) return null;
  if (s.conicOnly && !s.cylS) {
    // closed form: c(y² + h² + (1+k)x²) − 2x = 0, keeping the branch through the vertex
    const q = 1 + s.k, c = s.c;
    const A = c * (dy * dy + u * u + q * dx * dx);
    const B = 2 * c * (py * dy + h0 * u + q * px * dx) - 2 * dx;
    const C = c * (py * py + h0 * h0 + q * px * px) - 2 * px;
    let r1, r2;
    if (Math.abs(A) < 1e-14) { if (Math.abs(B) < 1e-15) return null; r1 = r2 = -C / B; }
    else {
      const disc = B * B - 4 * A * C;
      if (disc < 0) return null;
      const sq = Math.sqrt(disc), qq = -0.5 * (B + (B >= 0 ? sq : -sq));
      r1 = qq / A; r2 = qq !== 0 ? C / qq : r1;
      if (r1 > r2) [r1, r2] = [r2, r1];
    }
    for (const t of [r1, r2]) {
      if (t < tmin || t < t0 - 1e-9 || t > t1 + 1e-9) continue;
      const y = py + t * dy;
      if (Math.abs(y) > s.semi) continue;
      if (Math.abs(px + t * dx - sag3(s, y, h0 + t * u)) < 1e-6 * (1 + Math.abs(px))) return t;
    }
    return null;
  }
  // otherwise bracket the first root of x(t) − sag(y(t), h(t)), then Illinois
  const f = t => px + t * dx - sag3(s, py + t * dy, h0 + t * u);
  const N = 24, step = (t1 - t0) / N;
  let ta = t0, fa = f(ta);
  for (let i = 1; i <= N; i++) {
    const tb = t0 + i * step, fb = f(tb);
    if (fa === 0) return ta;
    if (fa * fb <= 0) {
      let lo = ta, hi = tb, flo = fa, fhi = fb, side = 0, t = tb;
      for (let it = 0; it < 60; it++) {
        t = (lo * fhi - hi * flo) / (fhi - flo);
        const ft = f(t);
        if (Math.abs(ft) < 1e-13 || hi - lo < 1e-13) break;
        if ((ft < 0) === (flo < 0)) { lo = t; flo = ft; if (side === -1) fhi *= 0.5; side = -1; }
        else { hi = t; fhi = ft; if (side === 1) flo *= 0.5; side = 1; }
      }
      return Math.abs(py + t * dy) <= s.semi + 1e-9 ? t : null;
    }
    ta = tb; fa = fb;
  }
  return null;
}
/* A part tipped out of the plane by s.tip (radians, about its own across axis, up positive):
   the ray, in the part's frame, is taken into the tipped frame, where the part is as it was,
   and on into a face's own frame (a cube's or prism's face, lf); it is met there in 3D and
   kept only inside the aperture, round or square (see zInside). t is along the ray, as ever */
export function tipFrame(s, x, h) { const c = Math.cos(s.tip), n = Math.sin(s.tip); return [x * c + h * n, -x * n + h * c]; }
// and rolled about its own axis by s.roll (radians, right-handed about it): across and up in the rolled frame
export function rollFrame(s, y, z) { if (!s.roll) return [y, z]; const c = Math.cos(s.roll), n = Math.sin(s.roll); return [y * c + z * n, -y * n + z * c]; }
// a point (or, with no shift, a direction) of the part's tipped frame in a face's own frame
export function faceFrame(s, x, y, shift) {
  const L = s.lf; if (!L) return [x, y];
  const X = shift ? x - L.x : x, Y = shift ? y - L.y : y, c = Math.cos(L.a), n = Math.sin(L.a);
  return [X * c + Y * n, -X * n + Y * c];
}
function intersectTip(s, px, py, h0, dx, dy, u, tmin) {
  const [qx, qz0] = tipFrame(s, px, h0), [ex, ez0] = tipFrame(s, dx, u);
  const [qy, qz] = rollFrame(s, py, qz0), [ey, ez] = rollFrame(s, dy, ez0);
  const [fx, fy] = faceFrame(s, qx, qy, true), [gx, gy] = faceFrame(s, ex, ey, false);
  let t;
  if (s.flat) { if (Math.abs(gx) < 1e-15) return null; t = (s.z - fx) / gx; if (t < tmin) return null; }
  else t = intersect3(s, fx, fy, qz, gx, gy, ez, tmin);
  if (t === null) return null;
  const y = fy + gy * t, z = qz + ez * t;
  if (s.el && zSquare(s.el)) return Math.abs(y) <= s.semi + 1e-9 && Math.abs(z) <= zHalf(s.el, s.semi) + 1e-9 ? t : null;
  return y * y + z * z <= s.semi * s.semi * (1 + 1e-12) + 1e-12 ? t : null;
}
// its unit normal where a ray at (px, py) in the part's frame, h up, meets it: in the frame of
// the surface's own in-plane axes (s.f), as the trace takes it
function tipNormal(s, px, py, h) {
  const [qx, qz0] = tipFrame(s, px, h), [qy, qz] = rollFrame(s, py, qz0), [, fy] = faceFrame(s, qx, qy, true);
  return faceToLocal(s, ...(s.flat ? [1, 0, 0] : normal3(s, fy, qz)));
}
// a direction in a tipped or rolled part's face frame, in the frame of the face's in-plane axes (s.f)
function faceToLocal(s, a, b, c) {
  const L = s.lf, la = L ? L.a : 0, cl = Math.cos(la), sl = Math.sin(la);
  [a, b] = [a * cl - b * sl, a * sl + b * cl];                         // into the part's rolled frame
  if (s.roll) { const cr = Math.cos(s.roll), sr = Math.sin(s.roll); [b, c] = [b * cr - c * sr, b * sr + c * cr]; }   // unrolled
  const ct = Math.cos(s.tip), st = Math.sin(s.tip);
  [a, c] = [a * ct - c * st, a * st + c * ct];                         // tipped back up
  return [a * cl + b * sl, -a * sl + b * cl, c];                       // into the face's in-plane axes
}
/* A ray's polarisation frame: s across it as near straight up as it can be, p = ±(d × s), the
   sign turning over at each reflection (the parity convention the trace keeps throughout). In
   the bench plane s is straight up, so nothing below changes there. Off it, a surface's own s
   (along n × d, across its plane of incidence) is turned from the ray's, so the amplitudes are
   turned into the surface's frame for its Fresnel coefficients and back out of it after. */
function polFrame(d, sig, fx) {
  let sx, sy, sz;
  if (Math.hypot(d[0], d[1]) > 1e-6) { sx = -d[2] * d[0]; sy = -d[2] * d[1]; sz = d[0] * d[0] + d[1] * d[1]; }
  else {
    // straight up or down there is no "up" across it: s is taken along the bench's x instead
    // (fx: that direction in the surface's frame), the same whichever part the ray meets
    const w = fx || [1, 0, 0], k = w[0] * d[0] + w[1] * d[1] + w[2] * d[2];
    sx = w[0] - k * d[0]; sy = w[1] - k * d[1]; sz = w[2] - k * d[2];
  }
  const l = Math.hypot(sx, sy, sz);
  sx /= l; sy /= l; sz /= l;
  return [[sx, sy, sz], [sig * (d[1] * sz - d[2] * sy), sig * (d[2] * sx - d[0] * sz), sig * (d[0] * sy - d[1] * sx)]];
}
export const vdot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// amplitudes [sr, si, pr, pi] in one frame into another about the same ray: c = s.s', n = p.s'
const turnJ = (J, c, n) => [c * J[0] + n * J[2], c * J[1] + n * J[3], -n * J[0] + c * J[2], -n * J[1] + c * J[3]];
// from a surface's s (sLoc) and the ray's direction d with sign sig, into the ray's own frame
function fromSurfFrame(J, sLoc, d, sig, fx) {
  const l = Math.hypot(d[0], d[1], d[2]), u = [d[0] / l, d[1] / l, d[2] / l];
  const [S] = polFrame(u, sig, fx);
  const pl = [sig * (u[1] * sLoc[2] - u[2] * sLoc[1]), sig * (u[2] * sLoc[0] - u[0] * sLoc[2]), sig * (u[0] * sLoc[1] - u[1] * sLoc[0])];
  return turnJ(J, vdot3(sLoc, S), vdot3(pl, S));
}
function traceSceneOnce() {
  ensureBenches(project);
  rfNotes.clear();
  // each bench's surfaces on their own: a ray meets only those of the bench it is on
  const surfsBy = new Map(), segsBy = new Map(), NONE = [];
  for (const b of project.benches) { surfsBy.set(b.id, []); segsBy.set(b.id, []); }
  // link planes and their partners: the first two sharing a pair name
  const linkTo = new Map(), linkSurf = new Map();
  for (const el of project.elements) {
    const surfs = surfsBy.get(el.bench), segs = segsBy.get(el.bench);
    const f = frame(el);
    const ss = elementSurfaces(el);
    // a part tipped out of the plane: each surface met in its tipped frame (see intersectTip)
    for (const s of ss) { s.f = s.lf ? subFrame(f, s.lf) : f; if ((el.tip || el.roll) && !s.mesh) { s.tilt = true; s.tip = (el.tip || 0) * deg; s.roll = (el.roll || 0) * deg; s.ef = f; } surfs.push(s); }
    if (el.type === 'link') linkSurf.set(el.id, ss[0]);
    if (el.type === 'lens' && !el.tip && !el.roll) for (const sg of lensEdges(el, ss)) segs.push({ f, sg, el: el.id });
    // The whole plane of a stop, seen only by the beam-parameter ray. That ray is a
    // reference, not light: it passes the blades, and the stop becomes a mask on the field,
    // so a slit or knife edge anywhere across the beam still leaves a field behind it.
    if (el.type === 'stop') {
      const ir = makeSurf(el, 0, 0, 0, 0, [], el.outer / 2, { kind: 'iris' });
      ir.f = f; ir.maskMargin = stopMargin(el); if (el.tip || el.roll) { ir.tilt = true; ir.tip = (el.tip || 0) * deg; ir.roll = (el.roll || 0) * deg; ir.ef = f; } surfs.push(ir);
    }
  }
  for (const L of linkPairs().values()) if (L.length >= 2) {
    linkTo.set(L[0].id, { el: L[1], s: linkSurf.get(L[1].id) });
    linkTo.set(L[1].id, { el: L[0], s: linkSurf.get(L[0].id) });
  }

  statsCache.clear();
  diffCache.clear();
  binCache.clear();
  const rays = [], screens = {}, beams = [], probes = [], pulses = {};
  const probeSrc = project.elements.find(e => e.type === 'source');
  let probeLast = null;
  const maxB = project.maxBounces;
  const minW = project.minPower / 100;
  // Light shifted in frequency (a modulator's sideband, an AOM's order) beats with the rest of
  // its laser's light by its amplitude, not its power: a sideband of power p dropped leaves a
  // beat of about 2 sqrt(p) uncancelled. It is held to the floor by amplitude, so nothing it
  // would have beaten is left above the floor either.
  const floorOf = f => f ? minW * minW : minW;
  const ghosts = project.ghosts;
  const anyZ = anyHeights();
  let limited = 0, dropped = 0, emitted = 0, absorbed = 0, budget = TRACE_BUDGET, truncated = false;
  const emittedBy = {};       // source id -> its rays' launch power, a split source's by its share of its laser
  const blockedSrc = {};      // stop id -> the sources whose rays it stopped
  const blocked = {};
  for (const el of project.elements) if (el.type === 'screen' || el.type === 'fibre' || el.type === 'detector' || el.type === 'mirror') { screens[el.id] = []; pulses[el.id] = []; }
  const cellHits = [], nlcHits = [];
  // splits at element edges, at most this many a trace (each part keeps 1% of its beam or more,
  // which bounds them too; a pile of elements on one spot would otherwise split every branch again)
  let splitsLeft = 200;
  setCellPlanMemo(new Map());

  for (const src of project.elements) if (src.type === 'source') syncSplit(src);
  const runSources = list => {
  for (const src of list) {
    if (src.type !== 'source') continue;
    // a copy split from a laser launches as part of the laser's launch, with its own share
    // of power and its phase against it
    const root = splitRoot(src), launch = root.id;
    const sAmp = root === src || src.virtual ? 1 : Math.sqrt(Math.max(0, src.power) / Math.max(1e-12, root.power)), sPh = splitOffset(src).ph;
    const cA = sAmp * Math.cos(sPh), sA = sAmp * Math.sin(sPh);
    const PG = pulseGrid(src);
    const waves = sourceLines(src).map((nm, wi) => [wi, nm, -1]);
    if (PG) for (const q of PG.samples) waves.push(['P' + q.j, q.nm, q.j]);
    for (const [wi, nm, pj] of waves) {
    const colour = src.colourAuto ? wavelengthColour(nm) : src.colour;
    const idx = new Map();
    const nOf = (m, tag, th) => {
      if (m.bire) return birefIndex(m, tag, nm, th);      // a crystal: each polarisation its own index
      const k = m.glass + '|' + m.n + '|' + m.nd + '|' + m.vd; if (!idx.has(k)) idx.set(k, refIndex(m, nm)); return idx.get(k);
    };
    // the group index, n - lambda dn/dlambda: what sets how far apart two paths can be and still interfere
    const gIdx = new Map();
    const ngOf = (m, tag, th) => {
      const k = (m.bire ? 'b' + tag + (th === undefined ? '' : th) : '') + m.glass + '|' + m.n + '|' + m.nd + '|' + m.vd;
      if (gIdx.has(k)) return gIdx.get(k);
      const at = l => m.bire ? birefIndex(m, tag, l, th) : refIndex(m, l), d = 0.05;
      const v = at(nm) - nm * (at(nm + d) - at(nm - d)) / (2 * d);
      gIdx.set(k, v); return v;
    };
    const stack = [];
    // a fibre tip's source carries its amplitudes as they are, and its launch's own name
    const states = src.virtual ? [{ vs: src.vJ }] : sourcePol(src);
    // a source rolled about its beam turns its polarisation with it (s up, p = d × s; right-handed about d)
    const rc = Math.cos((src.roll || 0) * deg), rs = Math.sin((src.roll || 0) * deg);
    const amp = st => st.vs || (src.roll ? [(st.as * rc - st.ap * rs) * cA, (st.as * rc - st.ap * rs) * sA, (st.as * rs + st.ap * rc) * cA, (st.as * rs + st.ap * rc) * sA]
      : [st.as * cA, st.as * sA, st.ap * cA, st.ap * sA]);
    const famOf = (idx, q) => src.virtual ? (q ? src.vKey : src.vKey.replace(':q', ':')) : launch + ':' + wi + ':' + (q ? 'q' : '') + idx;
    // a source tipped out of the plane: the direction its light leaves in, as a 3D unit vector
    const e0 = (src.tip || 0) * deg, ce0 = Math.cos(e0), tipped = src.tip ? { zh: zOf(src), uz: Math.sin(e0) } : null;
    if (pj >= 0) {
      // a pulse's spectral sample: one reference ray down the axis per polarisation state,
      // not light (it carries no power) and no beam; screens keep where and how it arrives
      const a = src.angle * deg;
      states.forEach((st, si0) => stack.push({ px: src.x, py: src.y, dx: Math.cos(a) * ce0, dy: Math.sin(a) * ce0,
        sr: amp(st)[0], si: amp(st)[1], pr: amp(st)[2], pi: amp(st)[3], bounce: 0, last: null, opl: 0, nCur: 1, aCur: 0,
        id: src.id + '::pulse' + pj + ':' + si0, fam: 'pulse', k: 0, path: '', chief: true, qr: 0, qi: 1, bn: src.bench, fo: src.vFo || 0, ...tipped }));
    } else {
    // the fan is optional: the Gaussian beam and the diffracted field follow their own reference rays
    const n = src.traceRays === false ? 0 : src.rays;
    // across the beam as the source's pattern lays them out: a line in the bench plane, or
    // spread up and down it too (each then starting off the beam height, with its slope)
    const pat = rayPattern(src, n);
    emitted += pat.length;
    emittedBy[src.id] = (emittedBy[src.id] || 0) + pat.length * sAmp * sAmp;
    for (const [t0, u0, i] of pat) {
      // and its pattern across the beam with it
      const t = src.roll ? t0 * rc - u0 * rs : t0, u = src.roll ? t0 * rs + u0 * rc : u0;
      const a = (src.angle + t * src.divergence) * deg;
      const ca = Math.cos(src.angle * deg), sa = Math.sin(src.angle * deg);
      // a ray up the beam starts that far up it, its divergence (and the source's tip) turning it up
      const ev = e0 + u * src.divergence * deg, ce = Math.cos(ev);
      const off = u || src.tip ? { zh: zOf(src) + u * src.width, uz: Math.sin(ev) } : null;
      for (const st of states) {
        stack.push(Object.assign({ px: src.x - sa * t * src.width, py: src.y + ca * t * src.width,
          dx: Math.cos(a) * ce, dy: Math.sin(a) * ce,
          sr: amp(st)[0], si: amp(st)[1], pr: amp(st)[2], pi: amp(st)[3],
          bounce: 0, last: null, opl: 0, nCur: 1, aCur: 0, id: src.id + ':' + wi + ':' + i,
          fam: famAt(famOf(states.indexOf(st), false), src.vFo || 0), k: i, path: '', bn: src.bench, fo: src.vFo || 0 }, off));
      }
    }
    if (src === probeSrc) {
      // three thin rays parallel to the axis: the middle one defines the outgoing axis,
      // the outer two give the focal length and the working aperture
      const a0 = src.angle * deg, ca0 = Math.cos(a0), sa0 = Math.sin(a0);
      const hh = Math.max(1e-3, (src.width || 1) / 200);
      for (const hgt of [0, hh, -hh]) {
        stack.push({ px: src.x - sa0 * hgt, py: src.y + ca0 * hgt,
          dx: ca0, dy: sa0, sr: 1, si: 0, pr: 0, pi: 0,
          bounce: 0, last: null, opl: 0, nCur: 1, aCur: 0,
          id: src.id + ':probe' + hgt, fam: 'probe', k: 0, path: '',
          probe: true, chief: true, probeH: hgt, qr: 0, qi: 1e9, bn: src.bench });
      }
    }
    // One extra ray down the axis per polarisation state carries the beam parameter q; it is
    // not drawn. Its branches form the beam tree whose fields add coherently within a state.
    // A ray fan is a uniform pupil: its hidden axis ray carries the pilot the same way.
    const fanQ = src.gauss ? null : fanPilot(src, nm);
    // a beam of M^2 above 1 is traced as its embedded Gaussian, 1/M the width of the real one
    const q0 = src.gauss ? [-src.z0, Math.PI * src.w0 * src.w0 / (m2Of(src) * nm * 1e-6)] : fanQ;
    if (q0) states.forEach((st, si0) => {
      const a = src.angle * deg, fam = famAt(famOf(si0, true), src.vFo || 0);
      stack.push({ px: src.x, py: src.y, dx: Math.cos(a) * ce0, dy: Math.sin(a) * ce0,
        sr: amp(st)[0], si: amp(st)[1], pr: amp(st)[2], pi: amp(st)[3], bounce: 0, last: null, opl: 0, nCur: 1,
        id: src.id + ':' + wi + ':q' + si0, fam, k: 0, path: '', chief: true, aCur: 0, qr: q0[0], qi: q0[1],
        bid: -1, evt: null, fan: !src.gauss, pol: si0, bn: src.bench, fo: src.vFo || 0, ...tipped });
    });
    }
    while (stack.length) {
      if (budget <= 0) { truncated = true; break; }
      let { px, py, dx, dy, sr, si, pr, pi, bounce, last, opl, nCur, aCur, id, chief, qr, qi, fam, k, path, probe, probeH, bid, evt, fan, pol, par, tag, wk, wn, bn, fo, gpl, gCur, skipEl, forceEl, qShare, hole, zh, uz } = stack.pop();
      hole = hole || 0;                 // a branch that went round an element: the radius of the hole it has in its middle
      let nlcPend = null;               // out of the plane: a doubling crystal's reference ray, until it leaves the crystal (see nlcSources)
      qShare = qShare || 1;             // a split beam's share of what reached the split, for what its reference ray stands for
      fo = fo || 0;                     // its frequency offset from its laser, Hz
      wk = wk || 0;                     // inside a walk-off crystal: how far the energy leaves the wave normal
      const rayK = k;                   // the ray's number (k is reused for other things further in)
      par = par || 0;                   // how many reflections so far, mod 2: the sense of p
      const pls = chief && id.indexOf('::pulse') > 0;     // a pulse's spectral sample
      const isQ = chief && !probe && !pls;      // the beam-parameter ray: its segments form the beam tree
      aCur = aCur || 0;
      gpl = gpl || 0; gCur = gCur || 1;          // the group path, and the medium's group index
      let ws = sr * sr + si * si, wp = pr * pr + pi * pi;
      let w = ws + wp;
      const pts = [px, py];
      // heights (see zOf): where the ray is out of the plane, and its slope there
      if (zh === undefined) { zh = zOf(src); uz = 0; }
      if (anyZ) {
        const hid = (k2, v) => Object.defineProperty(pts, k2, { value: v, writable: true, enumerable: false });
        hid('zs', [zh]); hid('zNext', undefined);
        hid('push', function (x, y) { this.zs[this.length >> 1] = this.zNext !== undefined ? this.zNext : zh; this.zNext = undefined; return Array.prototype.push.call(this, x, y); });
      }
      const push = o => { if (anyZ && o.zh === undefined) { o.zh = zh; o.uz = uz; } stack.push(o); };
      // a beam segment of length L along the ray, as the beam's models take it: its direction in the
      // plane (a unit vector), its length there and its slope out of it; and, when it rises, its 3D
      // direction and length too (a leg straight up has none in the plane)
      const segDir = L => {
        if (!uz) return { dx, dy, len: L, uz: 0 };
        const l = Math.hypot(dx, dy), up = l < 1e-9;
        return { dx: up ? 1 : dx / l, dy: up ? 0 : dy / l, len: L * l, uz: up ? 0 : uz / l, len3: L, d3: [dx, dy, uz] };
      };
      // the surface met before the last one: a ray at two parts' faces in contact (a doublet of two
      // lenses touching) goes on through the second face at no distance at all, but never back to either
      let lastSeen = last, lastPrev = null;
      for (; bounce < maxB; bounce++) {
        if (--budget < 0) { truncated = true; break; }
        if (last !== lastSeen) { lastPrev = lastSeen; lastSeen = last; }
        const tMin = s => s === last || s === lastPrev ? 1e-4 : last && last.el && s.el !== last.el ? -EPS : EPS;
        let best = Infinity, hit = null, hitSeg = false;
        const surfs = surfsBy.get(bn) || NONE, segs = segsBy.get(bn) || NONE;
        // a Gaussian beam's reference ray also looks for elements its beam overlaps though it misses them
        const splits = isQ && src.gauss && !pls;
        let near = null, nearT = Infinity;
        for (const s of surfs) {
          if (s.kind === 'iris' && !isQ) continue;
          if (isQ && s.kind === 'absorb' && s.el.type === 'stop') continue;   // the iris stands in for them
          if (skipEl && s.el.id === skipEl) continue;                          // the part of a beam past an element
          if (s.mesh) {
            // an STL object: met against its triangles, in 3D
            const tm = meshRay(s.el, [px, py, zh], [dx, dy, uz || 0], tMin(s));
            if (tm !== null && tm < best) { best = tm; hit = s; hitSeg = false; }
            continue;
          }
          const [lx, ly] = toLocal(s.f, px, py);
          const [ldx, ldy] = toLocalDir(s.f, dx, dy);
          const forced = forceEl && s.el.id === forceEl && splittable(s);
          // a ray off a curved part's centre, or sloping, meets it where it reaches it in 3D
          const h3 = anyZ && !forced && zCurved(s) ? zh - zOf(s.el) : 0;
          let tt = s.tilt && !forced ? intersectTip(s, ...toLocal(s.ef, px, py), zh - zOf(s.el), ...toLocalDir(s.ef, dx, dy), uz, tMin(s))
            : h3 || (anyZ && uz && !forced && zCurved(s)) ? intersect3(s, lx, ly, h3, ldx, ldy, uz, tMin(s))
            : intersectSurf(forced ? extendedSurf(s) : s, lx, ly, ldx, ldy, tMin(s));
          // out of the plane: light passing above or below the part misses it (a tipped one has been checked)
          if (anyZ && tt !== null && !forced && s.kind !== 'iris' && !s.tilt) { const hz = zh + uz * tt - zOf(s.el); if (hz !== 0 && !zInside(s, ly + ldy * tt, hz)) tt = null; }
          if (tt !== null && tt < best) { best = tt; hit = s; hitSeg = false; }
          if (splits && tt === null && !forced && !s.tilt && splittable(s)) {
            let te = intersectSurf(extendedSurf(s), lx, ly, ldx, ldy, tMin(s));
            // a beam passing above or below a part does not reach round its edge either
            if (anyZ && te !== null) { const hz = zh + uz * te - zOf(s.el); if (hz !== 0 && !zInside(s, 0, hz)) te = null; }
            if (te !== null && te < nearT) { nearT = te; near = s; }
          }
        }
        for (const g of segs) {
          if (g.el && (g.el === skipEl || g.el === forceEl)) continue;       // its rim is no rim to these
          const [lx, ly] = toLocal(g.f, px, py);
          const [ldx, ldy] = toLocalDir(g.f, dx, dy);
          const tt = intersectSeg(g.sg, lx, ly, ldx, ldy, EPS);
          if (tt !== null && tt < best) { best = tt; hit = g; hitSeg = true; }
        }
        // the beam overlaps an element its reference ray misses: if enough of it lands on the
        // element, it splits there (the ray itself carries on past, a new one goes through)
        let nearShare = null;
        if (near && nearT < best - 1e-9) {
          const [lx, ly] = toLocal(near.f, px + dx * nearT, py + dy * nearT), [ldx, ldy] = toLocalDir(near.f, dx, dy);
          const bw = beamAt(qr + nearT, qi, nCur, nm, m2Env(src)).w, cth = Math.abs(ldx);     // the rim is seen along the element's axis
          const fin = apertureShare(near, ly, cth, bw, bw);
          if (fin * qShare > SPLIT_MIN && splitsLeft > 0) { best = nearT; hit = near; hitSeg = false; nearShare = fin; splitsLeft--; }
        }
        if (!hit) {
          if (probe) probes.push({ h: probeH, x: px, y: py, dx, dy, last: probeLast });
          if (isQ) beams.push(Object.assign({ x0: px, y0: py, qr, qi, n: nCur, nm, colour, src: src.id, parent: bid, ev: evt, w: w * qShare, fan: !!fan, endEl: null,
            J: [sr, si, pr, pi], coh: fam, pol: pol || 0, par, opl, gpl, ng: gCur, bench: bn, fo, z0: zh, ...(hole > 0 ? { hole } : {}) }, segDir(FAR / 20)));
          if (anyZ) pts.zNext = zh + uz * FAR;
          pts.push(px + dx * FAR, py + dy * FAR);
          break;
        }
        if (isQ) {
          beams.push(Object.defineProperty(Object.assign({ x0: px, y0: py, qr, qi, n: nCur, nm, colour, src: src.id, parent: bid, ev: evt, w: w * qShare,
            fan: !!fan, endEl: hitSeg ? null : hit.el.id, J: [sr, si, pr, pi], coh: fam, pol: pol || 0, par, opl, gpl, ng: gCur, bench: bn, fo, z0: zh, ...(hole > 0 ? { hole } : {}) }, segDir(best)),
            'endSurf', { value: hitSeg ? null : hit, enumerable: false }));
          bid = beams.length - 1; evt = null;
        }
        px += dx * best; py += dy * best;
        if (anyZ) zh += uz * best;
        if (probe && hit.kind !== 'screen') probeLast = { px, py, dx, dy };   // the last optic it met
        const L3 = best;                       // t is the length along the ray, in 3D
        opl += nCur * L3; gpl += gCur * L3;
        if (aCur > 0) {                       // Beer-Lambert over the path just travelled
          const a = Math.exp(-0.5 * aCur * L3);
          sr *= a; si *= a; pr *= a; pi *= a;
          ws = sr * sr + si * si; wp = pr * pr + pi * pi; w = ws + wp;
          absorbed += (1 - Math.exp(-aCur * L3)) * (ws + wp) / Math.max(1e-30, Math.exp(-aCur * L3));
        }
        if (chief) qr += best;         // free space just adds the distance to q
        pts.push(px, py);
        if (hitSeg) break;           // absorbed by a lens rim
        // leaving the element it was split at, a branch is an ordinary ray again
        if (skipEl && hit.el.id !== skipEl) skipEl = null;
        if (forceEl && hit.el.id !== forceEl) forceEl = null;
        // light that went round an element has a hole in its middle: an element that fits inside
        // the hole (a smaller lens than the one it went round) is missed by all of it, and it
        // passes by unchanged, hole and all, rather than being bent as if through the middle
        if (hole && isQ && !hitSeg && hit.el && hit.kind !== 'iris') {
          const [, lyP] = toLocal(hit.f, px, py);
          const rEl = hit.el.type === 'lens' ? Math.max(hit.semi, (hit.el.diameter || 0) / 2) : hit.semi;
          if (rEl > 0 && rEl + Math.abs(lyP) <= hole * (1 + 1e-9) + 1e-9) {
            evt = bypassEvent(hit, { el: hit.el.id, kind: 'split', semi: hit.semi, ly: lyP, cth: 1, A: 1, C: 0, D: 1, n1: nCur, n2: nCur, mode: 'P', hx: px, hy: py, dIn: [dx, dy], dOut: [dx, dy] });
            skipEl = hit.el.id; last = null; pts.length -= 2;
            continue;
          }
        }
        // (a branch's field keeps the power its cut leaves it, so its reference ray's amplitude
        // stays as it was; its share is noted for what counts power by the reference ray)
        const splitState = (share, extra) => Object.assign({ px, py, dx, dy, sr, si, pr, pi, qShare: qShare * share,
          bn, fo, bounce: bounce + 1, last: null, opl, nCur, aCur, gpl, gCur, id, chief, fan, pol, par, qr, qi, bid, fam, k: rayK, probe, probeH, tag, wk, wn }, extra);
        if (nearShare !== null) {
          // this ray goes on past the element, cut to what misses it; a new one goes through
          push(splitState(nearShare, { px: px - dx * 10 * EPS, py: py - dy * 10 * EPS, evt: null, forceEl: hit.el.id, path: path + 'f' + bounce }));
          qShare *= 1 - nearShare;
          const [, lyH] = toLocal(hit.f, px, py);
          evt = bypassEvent(hit, { el: hit.el.id, kind: 'split', semi: hit.semi, ly: lyH, cth: 1, A: 1, C: 0, D: 1, n1: nCur, n2: nCur, mode: 'P', hx: px, hy: py, dIn: [dx, dy], dOut: [dx, dy] });
          skipEl = hit.el.id; path += 'b' + bounce;
          pts.length -= 2; last = null;
          continue;
        }
        // the beam meets the element but part of it misses: that part carries on past it. A
        // lens's surface may be smaller than the lens (a mounted asphere's back face): light
        // between the two meets the ground edge, as a ray there does, and goes no further;
        // only what misses the whole lens goes on past it
        // (light already inside the lens, at its far face, cannot go round it, only meet the edge:
        // a stop or mount placed inside the lens's body comes between its faces, so the last
        // surface met is no guide to that)
        const fromGlass = () => {
          if (!hit.front || !hit.back) return false;
          const [, lyF] = toLocal(hit.f, px, py), [ldxF, ldyF] = toLocalDir(hit.f, dx, dy);
          const mF = (ldxF - ldyF * dsagFn(hit, lyF)) > 0 ? hit.front : hit.back;
          return !!mF && mF.glass !== 'AIR';
        };
        if (splits && !hitSeg && !hit.tilt && splittable(hit) && hit.el.id !== forceEl && !(last && last.el === hit.el)) {
          const [, lyH] = toLocal(hit.f, px, py), [ldxH] = toLocalDir(hit.f, dx, dy);
          const cth = Math.abs(ldxH), bw = beamAt(qr, qi, nCur, nm, m2Env(src)).w;       // the rim is seen along the element's axis
          const fin = apertureShare(hit, lyH, cth, bw, bw);
          const rOut = hit.el.type === 'lens' ? Math.max(hit.semi, (hit.el.diameter || 0) / 2) : hit.semi;
          const past = fromGlass() ? 0 : rOut > hit.semi ? 1 - apertureShare(Object.assign(Object.create(hit), { semi: rOut, maskMargin: null }), lyH, cth, bw, bw) : 1 - fin;
          if (past * qShare > SPLIT_MIN && fin * qShare > SPLIT_MIN && splitsLeft > 0) {
            splitsLeft--;
            push(splitState(past, { skipEl: hit.el.id, path: path + 'b' + bounce, hole: Math.max(0, rOut - Math.abs(lyH)),
              evt: bypassEvent(hit, { el: hit.el.id, kind: 'split', semi: hit.semi, ly: lyH, cth: 1, A: 1, C: 0, D: 1, n1: nCur, n2: nCur, mode: 'P', hx: px, hy: py, dIn: [dx, dy], dOut: [dx, dy] }) }));
            qShare *= fin;
          } else if (fin * qShare > SPLIT_MIN && (1 - past) - fin > SPLIT_MIN) qShare *= fin / (1 - past);   // only the edge took some
        }

        const s = hit;
        // the hole goes with the light that went round: a plane mirror or a stop keeps it, a surface that bends the light does not
        if (hole && s.kind !== 'iris' && s.kind !== 'mirror' && !(s.el && s.el.type === 'screen' && !s.el.absorb)) hole = 0;
        // leaving a walk-off crystal: its faces refract the wave normal, not the energy
        if (wk) { const c = Math.cos(-wk), sn = Math.sin(-wk); [dx, dy] = [dx * c - dy * sn, dx * sn + dy * c]; wk = 0; }
        if (wn) { [dx, dy, uz] = wn; wn = null; }        // (out of the plane, the wave normal kept on the way in)
        const [lx, ly] = toLocal(s.f, px, py);
        let [ldx, ldy] = toLocalDir(s.f, dx, dy), ldz = 0;
        // the beam's way in and its height here, for the beam's models out of the plane (see popScreen)
        const din3 = [dx, dy, uz || 0], hz3 = zh;
        const g3 = (ev, out3) => {
          if (!ev || !anyZ) return ev;
          ev.din3 = din3; ev.dout3 = out3; ev.hz = hz3;
          const unit = d => { const l = Math.hypot(d[0], d[1]); return l > 1e-9 ? [d[0] / l, d[1] / l] : null; };
          if (din3[2]) ev.dIn = unit(din3) || ev.dIn;
          if (out3[2]) ev.dOut = unit(out3) || ev.dOut;
          return ev;
        };
        // out of the plane: the ray's 3D direction, and where it is against the part's centre
        const hS = anyZ ? zh - zOf(s.el) : 0;
        ldz = uz || 0;                         // (dx, dy, uz) is the ray's direction, a unit vector in 3D
        // surface normal pointing towards local +x (in 3D where the ray is off a curved part's centre)
        let nx = 1, ny, nz = 0;
        if (s.tilt) [nx, ny, nz] = tipNormal(s, ...toLocal(s.ef, px, py), hS);       // a tipped part: its normal in 3D
        else if (hS && zCurved(s)) [nx, ny, nz] = normal3(s, ly, hS);
        else { ny = -dsagFn(s, ly); const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl; }
        const cosd = ldx * nx + ldy * ny + ldz * nz;
        if (s.kind === 'absorb') { if (!chief) { blocked[s.el.id] = (blocked[s.el.id] || 0) + w; (blockedSrc[s.el.id] || (blockedSrc[s.el.id] = new Set())).add(src.id); } break; }
        const withSurf = ev => Object.defineProperty(ev, 'surf', { value: s, enumerable: false, configurable: true });
        const passEv = () => g3(withSurf({ el: s.el.id, kind: s.kind, semi: s.semi, ly, cth: Math.abs(cosd) || 1, A: 1, C: 0, D: 1,
          n1: nCur, n2: nCur, mode: 'P', hx: px, hy: py, dIn: [dx, dy], dOut: [dx, dy] }), din3);
        if (s.kind === 'eom') {
          // each sideband carries on as a branch of its own, n f_m from where it came in
          // (light crossing it at an angle, in the plane or tipped, is modulated over a longer path: beta / cos)
          const secE = 1 / Math.max(0.05, Math.abs(cosd)), sb = probe || pls ? [[0, [1, 0]]] : eomSidebands(secE > 1 + 1e-12 ? Object.assign(Object.create(s.el), { beta: s.el.beta * secE }) : s.el);
          for (const [n, c] of sb) {
            const nsr = sr * c[0] - si * c[1], nsi = sr * c[1] + si * c[0], npr = pr * c[0] - pi * c[1], npi = pr * c[1] + pi * c[0];
            const f2 = fo + n * s.el.fm * 1e6;
            if (!probe && nsr * nsr + nsi * nsi + npr * npr + npi * npi < floorOf(f2)) { dropped++; continue; }
            push({ qShare, px, py, dx, dy, sr: nsr, si: nsi, pr: npr, pi: npi, bn, fo: f2, bounce: bounce + 1, last: s, opl, nCur, aCur, gpl, gCur, id, chief, fan, pol, par,
              qr, qi, bid, evt: isQ ? passEv() : null, fam: famAt(fam, f2), k, path: path + 'e' + n + '.' + bounce, probe, probeH, tag, wk: 0 });
          }
          break;                                                     // this ray ends here; its sidebands carry on
        }
        if (s.kind === 'link') {
          // A link plane and its partner are one plane seen from two benches: the light leaves
          // the partner where it met this one, in the same direction against it. To the beam
          // it is nothing at all, so its field carries on unchanged.
          const P = linkTo.get(s.el.id);
          if (!P || !P.s) { if (!chief) { blocked[s.el.id] = (blocked[s.el.id] || 0) + w; (blockedSrc[s.el.id] || (blockedSrc[s.el.id] = new Set())).add(src.id); } break; }
          if (!chief) rays.push({ pts: pts.slice(), zs: pts.zs && pts.zs.slice(0, pts.length >> 1), colour, w, src: src.id, bench: bn });
          [px, py] = toWorld(P.s.f, lx, ly);
          [dx, dy] = toWorldDir(P.s.f, ldx, ldy);
          bn = P.el.bench;
          if (anyZ) zh += zOf(P.el) - zOf(s.el);              // the same place against the partner, at its height
          pts.length = 0; pts.push(px, py);
          // the field crosses with nothing taken from it: a link plane's length is where it
          // catches the light, not an opening, so the event carries no rim (an event with the
          // plane's half-length cut the field to it, a 100 mm beam through a 25 mm plane to a
          // slit that spread it in a wide fan on the far bench)
          if (isQ) { evt = passEv(); evt.semi = 0; Object.defineProperty(evt, 'surf', { value: null, enumerable: false, configurable: true }); }
          last = P.s;
          continue;
        }
        if (s.kind === 'iris') {
          const m = s.el;
          // light that went round an element has a hole in its middle: a round stop whose opening
          // lies inside the hole lets none of it through; only what passes outside the stop's
          // outer edge goes on, and if that is next to nothing the branch ends here
          if (isQ && hole > 0 && m.shape === 'round' && !m.slits) {
            const d = Math.abs(ly - (m.offset || 0)), bwS = beamAt(qr, qi, nCur, nm, m2Env(src)).w;
            if (m.aperture / 2 + d <= hole) {
              const out = 1 - apertureShare({ semi: m.outer / 2 }, ly - (m.offset || 0), 1, bwS, bwS);
              if (out * qShare <= SPLIT_MIN) { pts.length -= 2; break; }
              qShare *= out;
            }
          }
          evt = Object.assign(passEv(), { mask: { shape: m.shape, a: m.aperture / 2, o: m.offset, h: m.height / 2, side: m.side, b: m.outer / 2,
            ext: stopExtent(m), slits: stopSlitLike(m) } });
          pts.length -= 2; last = s; continue;
        }
        if (s.kind === 'mask') {
          // An amplitude and phase mask. Rays take its amplitude and its delay, and bend by
          // the delay's slope in the plane, as a grating or a lens would bend them; the
          // beam's pilot takes the lens its curvature makes.
          const lam = nm * 1e-6, hh = 1e-4;
          // a mask rolled about its axis: its pattern turned with it (see maskOf)
          const mf = maskOf(s);
          const f0 = mf(ly, hS, lam), fp = mf(ly + hh, hS, lam), fm = mf(ly - hh, hS, lam);
          // a jump across the tiny step is an edge in the phase (a binary grating's step), a line
          // of no width that bends nothing: only a smooth delay has a slope and a curvature. A
          // jump of whole waves is no jump at all (a blazed grating's or a kinoform's reset, as an
          // SLM writes them), so the differences are taken modulo whole waves.
          const wrap = d => d - Math.round(d), dp = wrap(fp[1] - f0[1]), dm = wrap(f0[1] - fm[1]);
          // smooth where the slope does not jump across the step (a steep lens is smooth; a step is not)
          const smooth = Math.abs(dp) < 0.45 && Math.abs(dm) < 0.45 && Math.abs(dp - dm) < 0.05;
          const A = f0[0];
          let slope = smooth ? (dp + dm) / (2 * hh) * lam : 0;
          const curv = smooth ? (dp - dm) / (hh * hh) * lam : 0;
          // on a vortex's core (a fork hologram's, where the reference ray usually crosses it)
          // the slope is the mean of those just round it: the vortex's cancel, the carrier's stay
          if (!smooth) slope = maskMeanSlope(s.maskFn, ly, lam) * lam;
          // and up and down by its slope that way, off the plane (a smooth delay's only)
          let slopeV = 0;
          if (anyZ) {
            const fu = mf(ly, hS + hh, lam), fd = mf(ly, hS - hh, lam), du = wrap(fu[1] - f0[1]), dd = wrap(f0[1] - fd[1]);
            if (Math.abs(du) < 0.45 && Math.abs(dd) < 0.45 && Math.abs(du - dd) < 0.05) slopeV = (du + dd) / (2 * hh) * lam;
          }
          if (isQ) {
            // in a medium the delay's curvature bends the light by 1/n of it, as the rays' slope
            // does: a mask inside water or glass focuses at its focal length there
            const cN = curv / nCur;
            evt = Object.assign(passEv(), { C: cN, mode: 'M' });
            const dr = cN * qr + 1, di = cN * qi, den = dr * dr + di * di;
            const nr = (qr * dr + qi * di) / den, ni = (qi * dr - qr * di) / den;
            qr = nr; qi = ni;
          }
          // the reference ray is not light: the field takes the mask's amplitude sample by
          // sample, so a mask dark where the reference crosses it (an annulus) still passes a field
          if (!isQ) { sr *= A; si *= A; pr *= A; pi *= A; }
          ws = sr * sr + si * si; wp = pr * pr + pi * pi; w = ws + wp;
          opl += f0[1] * lam;
          if (w < floorOf(fo) && !chief) { dropped++; break; }
          if (ldz || slopeV) {
            const ty = ldy + slope / nCur, tz = ldz + slopeV / nCur, r = 1 - ty * ty - tz * tz;
            if (r <= 0) break;                             // bent past grazing: it does not propagate
            const tx = (ldx < 0 ? -1 : 1) * Math.sqrt(r);
            [dx, dy] = toWorldDir(s.f, tx, ty); uz = tz;
          } else if (slope !== 0) {
            const ty = ldy + slope / nCur;
            if (Math.abs(ty) >= 1) break;                  // bent past grazing: it does not propagate
            const tx = (ldx < 0 ? -1 : 1) * Math.sqrt(1 - ty * ty);
            [dx, dy] = toWorldDir(s.f, tx, ty);
          } else pts.length -= 2;
          if (isQ) evt.dOut = [dx, dy];
          last = s;
          continue;
        }
        if (s.kind === 'jones' && (s.el.type === 'faraday' || s.el.type === 'isolator' || s.el.mod)) {
          const M = rollJones(s.el.mod ? modJonesM(s.el, nm) : jonesAt(s.el, ldx > 0, par ? -1 : 1), jonesRoll(s.el, ldx, par));
          if (isQ) { evt = passEv(); evt.jm = M; }
          const np = [cmul(M[0][0], [pr, pi]), cmul(M[0][1], [sr, si])], ns = [cmul(M[1][0], [pr, pi]), cmul(M[1][1], [sr, si])];
          pr = np[0][0] + np[1][0]; pi = np[0][1] + np[1][1]; sr = ns[0][0] + ns[1][0]; si = ns[0][1] + ns[1][1];
          ws = sr * sr + si * si; wp = pr * pr + pi * pi; w = ws + wp;
          if (w < floorOf(fo) && !chief) { dropped++; break; }
          pts.length -= 2;
          last = s;
          continue;
        }
        if (s.kind === 'jones') {
          const phiR = jonesRoll(s.el, ldx, par);
          if (isQ) { evt = passEv(); evt.jm = rollJones(jonesOf(s.el), phiR); }
          const el = s.el;
          // a plate rolled about its axis turns its own axis with it
          const th = el.axis * deg + phiR, c = Math.cos(th), sn = Math.sin(th);
          let a11, a12r = 0, a12i = 0, a22r, a22i = 0, a11i = 0;
          if (el.type === 'polariser') {
            // project onto the transmission axis
            const er = pr * c + sr * sn, ei = pi * c + si * sn;
            pr = er * c; pi = ei * c; sr = er * sn; si = ei * sn;
          } else {
            const d = 2 * Math.PI * el.retard;
            const er = Math.cos(d), ei = Math.sin(d);
            const cc = c * c, ss = sn * sn, cs = c * sn;
            const j11r = cc + ss * er, j11i = ss * ei;
            const j22r = ss + cc * er, j22i = cc * ei;
            const j12r = cs * (1 - er), j12i = -cs * ei;
            const npr = j11r * pr - j11i * pi + j12r * sr - j12i * si;
            const npi = j11r * pi + j11i * pr + j12r * si + j12i * sr;
            const nsr = j12r * pr - j12i * pi + j22r * sr - j22i * si;
            const nsi = j12r * pi + j12i * pr + j22r * si + j22i * sr;
            pr = npr; pi = npi; sr = nsr; si = nsi;
          }
          ws = sr * sr + si * si; wp = pr * pr + pi * pi; w = ws + wp;
          if (w < floorOf(fo) && !chief) { dropped++; break; }
          pts.length -= 2;             // no kink in the drawn ray
          last = s;
          continue;
        }
        if (s.kind === 'nlc') {
          // a nonlinear crystal: the beam's reference ray notes the light along the crystal's
          // axis, its beam and where it crosses, for the harmonic launched after the trace; the
          // light along the axis leaves with what the harmonic took from it
          // (rolled about the beam, its axis turns with it: at th from p in the light's frame)
          const ax = s.el.axis === 'p', k = s.el.id + '|' + src.id + '|' + nm + '|' + (pol || 0);
          const phiR = jonesRoll(s.el, ldx, par), th = (ax ? 0 : Math.PI / 2) + phiR, ac = phiR ? Math.cos(th) : +ax, as = phiR ? Math.sin(th) : +!ax;
          const er = pr * ac + sr * as, ei = pi * ac + si * as;          // the field along the axis
          if (isQ && w > 0 && !src.shg) {
            const Pw = w * qShare * Math.max(0, splitRoot(src).power) * 1e-3, share = (er * er + ei * ei) / w;
            nlcHits.push({ id: s.el.id, k, src: src.id, nm, fo, P: Pw * share, q: [qr, qi], n: nCur, x: px, y: py, dir: [dx, dy], bench: bn, phiR, cth: Math.abs(cosd) });
            if (anyZ) { nlcHits[nlcHits.length - 1].z = zh; nlcPend = { H: nlcHits[nlcHits.length - 1], el: s.el.id }; }
          }
          const c = src.shg ? 0 : nlcConv.get(k) || 0, f = Math.sqrt(Math.max(0, 1 - c)), g = 1 - f;
          pr -= g * er * ac; pi -= g * ei * ac; sr -= g * er * as; si -= g * ei * as;
          if (isQ) { evt = passEv(); if (c > 0) evt.jm = rollJones(ax ? [[[f, 0], [0, 0]], [[0, 0], [1, 0]]] : [[[1, 0], [0, 0]], [[0, 0], [f, 0]]], phiR); }
          ws = sr * sr + si * si; wp = pr * pr + pi * pi; w = ws + wp;
          if (w < floorOf(fo) && !chief) { dropped++; break; }
          pts.length -= 2;
          last = s;
          continue;
        }
        if (s.kind === 'cell') {
          // an atomic vapour cell: its lines' absorption and index at this light's frequency,
          // slice by slice, saturated by its own beam and by the others crossing it (see
          // cellPlan). A beam's reference ray notes where it crosses, how wide, which way and
          // how intense, for the next pass; it takes the beam's mean transmission and the
          // phase on its axis, and hands the field the rest, point by point, as a mask would.
          const nu = C_SI * 1e9 / nm + (fo || 0), ldir = [ldx, ldy], sec = 1 / Math.max(0.05, Math.abs(cosd));
          let bw = 0, Iw = 0;
          if (isQ && w > 0) {
            // a higher-order mode: the Gaussian it is built on, and its Hermite-Gauss sum for the shape
            const hm = isHigherMode(src), comps = hm ? srcModes(src)[0].c : null;
            bw = beamAt(qr, qi, nCur, nm, hm ? 1 : m2Env(src)).w;
            const Pw = w * qShare * Math.max(0, splitRoot(src).power) * 1e-3;
            if (bw > 0 && Pw > 0) { Iw = 2 * Pw / (Math.PI * (bw * 1e-3) ** 2); cellHits.push({ id: s.el.id, dir: ldir, sec, nu, I: Iw, P: Pw, w: bw, ly, src: src.id, comps, circ: circShares(pr, pi, sr, si, (par ? -1 : 1) * Math.sign(ldx || 1)) }); }
          }
          if (cellPolar(s.el)) {
            // the two hands of circular light about the field, each through its own lines: the
            // cell turns and sorts polarisation (Faraday rotation, circular dichroism)
            const py = (par ? -1 : 1) * Math.sign(ldx || 1), plans = [1, -1].map(q => cellPlanFor(s.el, nu, ldir, src.id, q, sec));
            const hand = pl => {
              const c0 = evalPlan(pl, ly, 0);
              if (!isQ || !pl.varies) return { c0, T: c0.amp * c0.amp };
              const SR = pl.self || { w: bw, comps: null }, sw = SR.w;
              if (!(sw > 0)) return { c0, T: c0.amp * c0.amp };
              let num = 0, den = 0;
              const K = SR.comps ? 7 : 3, st = SR.comps ? 0.55 * sw * beamReach(SR) * 3 / 7 : 0.55 * sw;
              for (let a = -K; a <= K; a++) for (let b2 = -K; b2 <= K; b2++) { const g = beamShape(SR, a * st, b2 * st), r = evalPlan(pl, ly + a * st, b2 * st); num += g * r.amp * r.amp; den += g; }
              return { c0, T: num / den };
            };
            const [hp, hm] = plans.map(hand);
            const tq = h2 => [Math.sqrt(h2.T) * Math.cos(h2.c0.ph), Math.sqrt(h2.T) * Math.sin(h2.c0.ph)];
            const M = cellJones(tq(hp), tq(hm), py);
            if (isQ) {
              evt = passEv(); evt.jm = M;
              if (plans.some(pl => pl.varies)) {
                // across the beam, what the two hands share: their mean transmission and phase against the centre's
                const T0 = 0.5 * (hp.T + hm.T), ph0 = 0.5 * (hp.c0.ph + hm.c0.ph);
                const sp = Object.create(s);
                sp.maskFn = (u, v) => { const a = evalPlan(plans[0], u, v), b = evalPlan(plans[1], u, v);
                  return [Math.sqrt(0.5 * (a.amp * a.amp + b.amp * b.amp) / Math.max(1e-300, T0)), (0.5 * (a.ph + b.ph) - ph0) / (2 * Math.PI)]; };
                Object.defineProperty(evt, 'surf', { value: sp, enumerable: false, configurable: true });
              }
            }
            const np = [cmul(M[0][0], [pr, pi]), cmul(M[0][1], [sr, si])], ns = [cmul(M[1][0], [pr, pi]), cmul(M[1][1], [sr, si])];
            pr = np[0][0] + np[1][0]; pi = np[0][1] + np[1][1]; sr = ns[0][0] + ns[1][0]; si = ns[0][1] + ns[1][1];
            ws = sr * sr + si * si; wp = pr * pr + pi * pi; w = ws + wp;
            if (w < floorOf(fo) && !chief) { dropped++; break; }
            pts.length -= 2;
            last = s;
            continue;
          }
          const plan = cellPlanFor(s.el, nu, ldir, src.id, undefined, sec);
          let cr, ci;
          if (isQ) {
            const c0 = evalPlan(plan, ly, 0);
            const SR = plan.self || { w: bw, comps: null };
            let Tm = c0.amp * c0.amp, sw = SR.w;
            if (plan.varies && sw > 0) {
              // the power-weighted mean over the beam's profile: a Gaussian's on 7 x 7 points, a
              // higher-order mode's (wider, with nodes) on 15 x 15
              let num = 0, den = 0;
              const K = SR.comps ? 7 : 3, st = SR.comps ? 0.55 * sw * beamReach(SR) * 3 / 7 : 0.55 * sw;
              for (let a = -K; a <= K; a++) for (let b2 = -K; b2 <= K; b2++) {
                const du = a * st, dv = b2 * st, g = beamShape(SR, du, dv);
                const r = evalPlan(plan, ly + du, dv); num += g * r.amp * r.amp; den += g;
              }
              Tm = num / den;
              const sq = Math.sqrt(Tm), ph0 = c0.ph;
              evt = passEv();
              const sp = Object.create(s);
              sp.maskFn = (u, v) => { const r = evalPlan(plan, u, v); return [r.amp / sq, (r.ph - ph0) / (2 * Math.PI)]; };
              Object.defineProperty(evt, 'surf', { value: sp, enumerable: false, configurable: true });
            } else evt = passEv();
            cr = Math.sqrt(Tm) * Math.cos(c0.ph); ci = Math.sqrt(Tm) * Math.sin(c0.ph);
          } else {
            const r = evalPlan(plan, ly, 0);
            cr = r.amp * Math.cos(r.ph); ci = r.amp * Math.sin(r.ph);
          }
          [sr, si] = [sr * cr - si * ci, sr * ci + si * cr]; [pr, pi] = [pr * cr - pi * ci, pr * ci + pi * cr];
          ws = sr * sr + si * si; wp = pr * pr + pi * pi; w = ws + wp;
          if (w < floorOf(fo) && !chief) { dropped++; break; }
          pts.length -= 2;
          last = s;
          continue;
        }
        if (s.kind === 'gain' || (s.kind === 'filter' && !s.el.reflect)) {
          // a thin sheet that scales the power: the beam's reference ray carries it too, as its
          // Jones vector is the beam's amplitude
          const g = Math.sqrt(s.kind === 'gain' ? gainAt(s.el, nm) : filterT(s.el, nm));
          sr *= g; si *= g; pr *= g; pi *= g;
          ws = sr * sr + si * si; wp = pr * pr + pi * pi; w = ws + wp;
          if (isQ) evt = passEv();
          if (w < floorOf(fo) && !chief) { dropped++; break; }
          pts.length -= 2;
          last = s;
          continue;
        }
        if (s.kind === 'grating') {
          const el = s.el, refl = el.mode === 'reflect', lam = nm * 1e-6;
          if (refl && cosd >= 0) break;                              // the back of a reflection grating
          // a grating tipped or rolled: its grooves turned with it. The light keeps its part along the
          // grooves, takes m lambda G on its part across them, and the rest along the normal (3D)
          let T3 = null;
          if (s.tilt) {
            const T = faceToLocal(s, 0, 1, 0), N = [nx, ny, nz], Gv = [N[1] * T[2] - N[2] * T[1], N[2] * T[0] - N[0] * T[2], N[0] * T[1] - N[1] * T[0]];
            const d = [ldx, ldy, ldz], [, qz] = tipFrame(s, lx, hS);
            T3 = { T, N, Gv, dt: vdot3(d, T), dg: vdot3(d, Gv), dn: vdot3(d, N), at: rollFrame(s, ly, qz)[0] };
          }
          const dIn = T3 ? T3.dt : ldy;
          const ords = el.type === 'aom' ? aomOrders(el, nm, dIn, nCur) : gratingOrders(el, nm, dIn, nCur);
          const use = probe ? ords.slice().sort((a, b) => b.eff - a.eff).slice(0, 1) : ords;
          const sx0 = ldx < 0 ? -1 : 1, cIn = T3 ? Math.abs(T3.dn) : Math.abs(ldx);
          for (const o of use) {
            // an order too weak to matter is dropped, the beam's reference ray included, as a
            // weak reflection is: orders bouncing between a grating and a mirror multiply fast
            if (!probe && w * o.eff < floorOf(fo + (o.df || 0))) { dropped++; continue; }
            // each order leaves along the grating equation, n sin(out) = n sin(in) + m lambda G,
            // reflected back across the normal or carried on through it
            // off the plane the light keeps its rise across the grooves (conical diffraction)
            const r = T3 ? 1 - o.ty * o.ty - T3.dg * T3.dg : 1 - o.ty * o.ty - ldz * ldz;
            if (r <= 0) continue;
            let tx = (refl ? -sx0 : sx0) * Math.sqrt(r), lo = 1, oz = ldz;
            let [odx, ody] = toWorldDir(s.f, tx / lo, o.ty / lo);
            if (T3) {
              const dn = (refl ? -1 : 1) * Math.sign(T3.dn || 1) * Math.sqrt(r), { T, N, Gv } = T3;
              const e = [0, 1, 2].map(k => o.ty * T[k] + T3.dg * Gv[k] + dn * N[k]);
              [odx, ody] = toWorldDir(s.f, e[0], e[1]); oz = e[2]; tx = dn;
            }
            const a = (refl ? -1 : 1) * Math.sqrt(probe ? 1 : o.eff);
            // the beam is stretched across by cos(out)/cos(in) in the bench plane
            const A = Math.abs(tx) / (cIn || 1);
            const ev = isQ ? withSurf({ el: el.id, kind: 'grating', semi: s.semi, ly, cth: cIn || 1, A, C: 0, D: 1 / A,
              n1: nCur, n2: nCur, mode: refl ? 'R' : 'T', order: o.m, hx: px, hy: py, dIn: [dx, dy], dOut: [odx, ody] }) : null;
            g3(ev, [odx, ody, oz / lo]);
            const f2 = fo + (o.df || 0);
            // the phase across the grooves that makes the order: m waves a line, as a path
            const gph = (o.m || 0) * nm * 1e-6 * linesPerMm(el) * (T3 ? T3.at : ly);
            push({ qShare, px, py, dx: odx, dy: ody, sr: sr * a, si: si * a, pr: pr * a, pi: pi * a, bn, fo: f2,
              bounce: bounce + 1, last: s, opl: opl + gph, nCur, aCur, gpl, gCur, id, chief, fan, pol, par: refl ? par ^ 1 : par,
              qr: chief ? qr * A * A : qr, qi: chief ? qi * A * A : qi, bid, evt: ev, fam: famAt(fam, f2), k, path: path + 'g' + o.m + '.' + bounce,
              probe, probeH, tag, wk: 0, ...(anyZ ? { zh, uz: oz / lo } : {}) });
          }
          if (probe) probeLast = { px, py, dx, dy };
          break;                                                     // this ray ends here; its orders carry on
        }
        if (s.kind === 'screen') {
          // the detecting face points along +x: record rays arriving on it, let the rest pass
          if (cosd < 0) {
            if (pls) pulses[s.el.id].push({ y: ly, sr, si, pr, pi, opl, nm, src: id.slice(0, id.indexOf('::pulse')), j: +id.slice(id.indexOf('::pulse') + 7).split(':')[0], pol: +id.split(':').pop(), path, dly: ldy, n: nCur });
            else if (!probe && !fan) screens[s.el.id].push({ y: ly, ...(anyZ ? { z: zh - zOf(s.el), dz: uz / Math.max(1e-12, Math.hypot(dx, dy)) } : {}), w, sr, si, pr, pi, opl, gpl, nm, id, sid: src.id, fam, k, path, dly: ldy, n: nCur, chief, qr, qi, back: best });
            if (s.el.absorb && !probe) break;     // probe rays are not light; they measure the system
          }
          if (isQ) evt = passEv();
          pts.length -= 2;           // no kink in the drawn ray
          last = s;
          continue;
        }
        // a mirror notes the light arriving at its reflecting face, as a screen does, for its readouts
        if (s.kind === 'mirror' && cosd < 0 && screens[s.el.id]) {
          if (pls) pulses[s.el.id].push({ y: ly, sr, si, pr, pi, opl, nm, src: id.slice(0, id.indexOf('::pulse')), j: +id.slice(id.indexOf('::pulse') + 7).split(':')[0], pol: +id.split(':').pop(), path, dly: ldy, n: nCur });
          else if (!probe && !fan) screens[s.el.id].push({ y: ly, ...(anyZ ? { z: zh - zOf(s.el), dz: uz / Math.max(1e-12, Math.hypot(dx, dy)) } : {}), w, sr, si, pr, pi, opl, gpl, nm, id, sid: src.id, fam, k, path, dly: ldy, n: nCur, chief, qr, qi, back: best });
        }
        // Off the plane, a surface's plane of incidence is tilted from the ray's frame (see
        // polFrame): the amplitudes are turned into its s and p for what follows, and each ray
        // leaving is turned back into its own frame. A crystal's faces keep the ray's frame.
        let sLoc = null;
        const fxL = [s.f.c, -s.f.s, 0];        // the bench's x in this surface's frame
        if ((ldz || nz) && !probe && (s.kind === 'mirror' || s.kind === 'filter' || s.kind === 'grid' || s.kind === 'refract' || s.kind === 'split')
          && (s.tilt || !(s.front && s.front.bire) && !(s.back && s.back.bire))) {
          const d = [ldx, ldy, ldz], sig = par ? -1 : 1, [S, P] = polFrame(d, sig, fxL);
          let a = [ny * ldz - nz * ldy, nz * ldx - nx * ldz, nx * ldy - ny * ldx];
          const la = Math.hypot(a[0], a[1], a[2]);
          if (la > 1e-12) {
            a = a.map(v => v / la);
            if (vdot3(a, S) < 0) a = a.map(v => -v);
            // (even where the two agree on the way in, the light leaving needs turning into its own frame)
            const c = vdot3(S, a), n = vdot3(P, a);
            sLoc = a;
            [sr, si, pr, pi] = turnJ([sr, si, pr, pi], c, n);
            ws = sr * sr + si * si; wp = pr * pr + pi * pi; w = ws + wp;
          }
        }
        // part of the power leaves on a reflected branch, traced later from the stack
        // Split the field between a reflected branch and what carries on.
        // s is the component out of the plane, p the one in it; in 2D they never mix
        // at a surface, so each keeps its own complex reflection coefficient.
        // a chirped mirror adds its GDD to what it reflects (about its source's centre)
        const reflExtra = s.kind === 'mirror' && s.el.gdd && cosd < 0 ? gddPath(s.el.gdd, nm, (pulseOf(src) || src).wavelength) : 0;
        const branch = (rsr, rsi, rpr, rpi) => {
          const brs = sr * rsr - si * rsi, bsi = sr * rsi + si * rsr;
          const bpr = pr * rpr - pi * rpi, bpi = pr * rpi + pi * rpr;
          const wr = brs * brs + bsi * bsi + bpr * bpr + bpi * bpi;
          const Rs = rsr * rsr + rsi * rsi, Rp = rpr * rpr + rpi * rpi;
          if (chief) { /* the beam follows the reflected branch too */ }
          if (wr > 0 && !probe) {
            if (wr >= floorOf(fo) && (ghosts || s.kind !== 'refract' || Rs > 0.2 || Rp > 0.2)) {
              const rx = ldx - 2 * cosd * nx, ry = ldy - 2 * cosd * ny, rz = ldz - 2 * cosd * nz, rl = ldz || nz ? Math.hypot(rx, ry, rz) : 1;
              const [wdx, wdy] = toWorldDir(s.f, rx / rl, ry / rl);
              // off the plane: back out of the surface's polarisation frame into the reflected ray's
              let Jb = [brs, bsi, bpr, bpi];
              if (sLoc) Jb = fromSurfFrame(Jb, sLoc, [rx, ry, rz], par ? 1 : -1, fxL);
              push({ qShare, px, py, dx: wdx, dy: wdy, sr: Jb[0], si: Jb[1], pr: Jb[2], pi: Jb[3], bn, fo, ...(anyZ ? { zh, uz: rz / rl } : {}),
                bounce: bounce + 1, last: s, opl: opl + reflExtra, nCur, aCur, gpl, gCur, id, chief, fan, pol, par: par ^ 1,
                qr: qRf ? qRf[0] : qr, qi: qRf ? qRf[1] : qi, bid,
                // a weak reflection, followed only because ghosts are on: marked, for the field's cost
                evt: evR ? g3(Object.assign(evR, { dOut: [wdx, wdy] }, s.kind === 'refract' && Rs <= 0.2 && Rp <= 0.2 ? { ghost: true } : null), [wdx, wdy, ldz || nz ? rz / rl : 0]) : evR,
                fam, k, path: path + 'r' + bounce, tag, wk: 0,
                // light that went round an element keeps its hole off a plane mirror
                hole: s.kind === 'mirror' && !s.el.R ? hole : 0 });
            } else dropped++;
            if (!chief && wr > 0.005 * w) {   // brightness changes: start a new drawn segment
              rays.push({ pts: pts.slice(), zs: pts.zs && pts.zs.slice(0, pts.length >> 1), colour, w, src: src.id, bench: bn });
              pts.length = 0; pts.push(px, py);
            }
          }
          // what continues keeps the remaining energy, with no extra phase
          if (wr > 0) path += 't' + bounce;
          const ts = Math.sqrt(Math.max(0, 1 - Rs)), tp = Math.sqrt(Math.max(0, 1 - Rp));
          sr *= ts; si *= ts; pr *= tp; pi *= tp;
          ws = sr * sr + si * si; wp = pr * pr + pi * pi; w = ws + wp;
        };
        // tangential ABCD for this surface, q = (A q + B) / (C q + D): one for the light that
        // carries on through it and one for the light it reflects, so a partly reflecting
        // face sends each branch on with its own beam
        let qT = null, qRf = null, evT = null, evR = null, wentR = false;
        if (chief) {
          const abcd = (A, C, D, n2, mode, n1) => {
            const dr = C * qr + D, di = C * qi, nr = A * qr, ni = A * qi, den = dr * dr + di * di;
            const q = den > 0 ? [(nr * dr + ni * di) / den, (ni * dr - nr * di) / den] : [qr, qi];
            return { q, ev: Object.defineProperty({ el: s.el.id, kind: s.kind, semi: s.semi, ly, cth: Math.abs(cosd) || 1, A, C, D, back: (s.kind === 'mirror' || s.kind === 'filter' || s.kind === 'grid') && cosd >= 0,
              n1: n1 === undefined ? nCur : n1, n2, mode, hx: px, hy: py, dIn: [dx, dy] }, 'surf', { value: s, enumerable: false }) };
          };
          const kap = kapIn(s, ly);
          const cth = Math.abs(cosd) || 1;
          const rf = abcd(1, -2 * (cosd < 0 ? kap : -kap) / cth, 1, nCur, 'R');   // a concave face focuses what it reflects
          let tr = abcd(1, 0, 1, nCur, 'T');
          if (s.kind === 'refract') {
            const goingBack0 = cosd > 0;
            const n1 = nOf(goingBack0 ? s.front : s.back, tag);
            const n2 = nOf(goingBack0 ? s.back : s.front, tag);
            const ci0 = Math.abs(cosd);
            const k0 = 1 - (n1 / n2) * (n1 / n2) * (1 - ci0 * ci0);
            if (k0 > 0) {
              const ct0 = Math.sqrt(k0);
              const kp = kap * (goingBack0 ? 1 : -1);
              tr = abcd(ct0 / ci0, (n1 * ci0 - n2 * ct0) * kp / (n2 * ci0 * ct0), n1 * ci0 / (n2 * ct0), n2, 'T', n1);
            }
            // both media, so the field can work out each sample's own Fresnel coefficients
            rf.ev.nIn = tr.ev.nIn = n1; rf.ev.nOut = tr.ev.nOut = n2;
          }
          qT = tr.q; evT = tr.ev; qRf = rf.q; evR = rf.ev;
        }
        // what a reflecting sheet sends back, s and p: a mirror's reflectance (a metal one's by its
        // surface resistance), a filter's rejection, a film's two faces interfering, a wire grid's
        // pitch and wires (the field along its wires reflected, the other leaked a little)
        let Rms = 0, Rmp = 0, metalA = 1;
        if (s.kind === 'filter') Rms = Rmp = 1 - filterT(s.el, nm);
        else if (s.kind === 'grid') { const G = gridCoef(s.el.grid, nm, cosd, Math.abs(((s.el.axis % 180) + 180) % 180 - 90) < 45); if (G.grating) rfNotes.add(s.el.id); const up = Math.abs(((s.el.axis % 180) + 180) % 180 - 90) >= 45; Rms = up ? G.Rpar : G.Rperp; Rmp = up ? G.Rperp : G.Rpar; }
        else if (s.kind === 'mirror' && s.el.film) { const F = filmCoef(s.el.film, nm, cosd); Rms = F.Rs; Rmp = F.Rp; }
        else if (s.kind === 'mirror') { Rms = Rmp = s.el.reflect / 100; if (s.el.metal) metalA = Math.sqrt(metalR(s.el.metal, C_NM_GHZ / nm)); }
        const Rm = (Rms + Rmp) / 2;
        if ((s.kind === 'mirror' || s.kind === 'filter' || s.kind === 'grid') && probe) {
          // a probe is a measuring ray, not light: it follows whichever arm is stronger
          if (Rm >= 0.5) {
            if (cosd >= 0) break;
            ldx -= 2 * cosd * nx; ldy -= 2 * cosd * ny; ldz -= 2 * cosd * nz;
            wentR = true;
          }
        } else if (s.kind === 'mirror' || s.kind === 'filter' || s.kind === 'grid') {
          // a reflective filter (a dichroic) is a partial mirror whose reflectance is what it rejects
          // A mirror turns the field over from its coated face: half a wave. From behind, a
          // partial mirror reflects the other way up, as a lossless one must (Stokes: t t' - r r'
          // = 1). With the same sign both ways a cavity would not conserve energy, and its
          // reflected light would not cancel on resonance.
          const sg = cosd >= 0 ? 1 : -1, as = sg * Math.sqrt(Rms) * metalA, ap = sg * Math.sqrt(Rmp) * metalA;
          if (Rms >= 1 && Rmp >= 1) {
            if (cosd >= 0 && s.kind === 'mirror' && !s.el.film) break;           // back of a full mirror absorbs
            ldx -= 2 * cosd * nx; ldy -= 2 * cosd * ny; ldz -= 2 * cosd * nz;
            wentR = true;
            opl += reflExtra;
            sr = -sr * metalA; si = -si * metalA; pr = -pr * metalA; pi = -pi * metalA;
            if (metalA !== 1) { ws = sr * sr + si * si; wp = pr * pr + pi * pi; w = ws + wp; }
          } else if (Rms > 0 || Rmp > 0) branch(as, 0, ap, 0);
        } else {
          const goingBack = cosd > 0;
          // Entering a crystal: its two polarisations go their own ways from here, so the ray
          // splits. The p part starts again a hair before this face and meets it as p alone;
          // this one carries on as s alone. The beam tree splits the same way.
          const mInto = goingBack ? s.back : s.front, mFrom = goingBack ? s.front : s.back;
          // A crystal tipped or rolled out of the plane: its optic axis turned with it (in this
          // face's frame), and the light split along its own two polarisations, not s and p: the
          // ordinary one across the axis and the wave normal, the extraordinary one at right angles.
          const tc = s.tilt && (mInto.bire || mFrom.bire);
          const axisL = m => { const c = bireAxis(m), [a, b] = faceFrame(s, c[0], c[1], false); return faceToLocal(s, a, b, c[2]); };
          const angTo = (m, d) => { const c = axisL(m), l = Math.hypot(d[0], d[1], d[2]); return Math.acos(clamp(vdot3(c, d) / l, -1, 1)); };
          if (tc && mInto.bire && !tag && !probe) {
            const d = [ldx, ldy, ldz], sig = par ? -1 : 1, c = axisL(mInto);
            const [S, P] = sLoc ? [sLoc, [sig * (d[1] * sLoc[2] - d[2] * sLoc[1]), sig * (d[2] * sLoc[0] - d[0] * sLoc[2]), sig * (d[0] * sLoc[1] - d[1] * sLoc[0])]] : polFrame(d, sig, fxL);
            let o = [d[1] * c[2] - d[2] * c[1], d[2] * c[0] - d[0] * c[2], d[0] * c[1] - d[1] * c[0]];
            const lo = Math.hypot(...o);
            if (lo < 1e-9) tag = mInto.ePol === 's' ? 'p' : 's';          // along the axis: all of it ordinary
            else {
              o = o.map(v => v / lo);
              const e = [d[1] * o[2] - d[2] * o[1], d[2] * o[0] - d[0] * o[2], d[0] * o[1] - d[1] * o[0]];
              // each part's amplitude along its own polarisation, and that as s and p of the frame here
              const part = u => { const a = vdot3(S, u), b = vdot3(P, u), re = sr * a + pr * b, im = si * a + pi * b; return [re * a, im * a, re * b, im * b, re * re + im * im]; };
              const Jo = part(o), Je = part(e), oTag = mInto.ePol === 's' ? 'p' : 's';
              if (Jo[4] > 1e-12 * w && Je[4] > 1e-12 * w) {
                const back = 1e-5, Jb = sLoc ? fromSurfFrame(Je.slice(0, 4), sLoc, d, sig, fxL) : Je;
                push({ qShare, px: px - dx * back, py: py - dy * back, dx, dy, sr: Jb[0], si: Jb[1], pr: Jb[2], pi: Jb[3], bounce, last: null, bn, fo,
                  opl: opl - nCur * back, nCur, aCur, gpl: gpl - gCur * back, gCur, id, chief, fan, pol, par, qr: chief ? qr - back : qr, qi, bid,
                  evt: isQ ? passEv() : evt, fam, k: rayK, path: path + 'e', tag: mInto.ePol, wk: 0 });
                [sr, si, pr, pi] = Jo; tag = oTag;
              } else if (Je[4] > Jo[4]) { [sr, si, pr, pi] = Je; tag = mInto.ePol; }
              else { [sr, si, pr, pi] = Jo; tag = oTag; }
              ws = sr * sr + si * si; wp = pr * pr + pi * pi; w = ws + wp;
            }
          } else if (mInto.bire && !tag && !probe && ws > 1e-12 * w && wp > 1e-12 * w) {
            const back = 1e-5;
            push({ qShare, px: px - dx * back, py: py - dy * back, dx, dy, sr: 0, si: 0, pr, pi, bounce, last: null, bn, fo,
              opl: opl - nCur * back, nCur, aCur, gpl: gpl - gCur * back, gCur, id, chief, fan, pol, par, qr: chief ? qr - back : qr, qi, bid,
              evt: isQ ? passEv() : evt, fam, k: rayK, path: path + 'e', tag: 'p', wk: 0 });
            pr = 0; pi = 0; wp = 0; w = ws;
            tag = 's';
          } else if (mInto.bire && !tag) {
            tag = wp > ws ? 'p' : 's';          // already one polarisation: it goes that one's way
          }
          if (tag && chief && qT && mInto.bire && !(goingBack ? s.front : s.back).bire) {
            // the reference ray's matrices above were worked out before it knew its polarisation
            const n1t = nOf(goingBack ? s.front : s.back, tag), n2t = nOf(mInto, tag), ci0 = Math.abs(cosd);
            const k0 = 1 - (n1t / n2t) ** 2 * (1 - ci0 * ci0);
            if (k0 > 0) {
              const ct0 = Math.sqrt(k0), kp = kapIn(s, ly) * (goingBack ? 1 : -1);
              const A = ct0 / ci0, C = (n1t * ci0 - n2t * ct0) * kp / (n2t * ci0 * ct0), D = n1t * ci0 / (n2t * ct0);
              const dr = C * qr + D, di = C * qi, den = dr * dr + di * di;
              qT = [(A * qr * dr + A * qi * di) / den, (A * qi * dr - A * qr * di) / den];
              Object.assign(evT, { A, C, D, n2: n2t, nIn: n1t, nOut: n2t });
            }
          }
          const tnx = goingBack ? nx : -nx, tny = goingBack ? ny : -ny, tnz = goingBack ? nz : -nz;   // normal along the ray
          const ci = ldx * tnx + ldy * tny + ldz * tnz;
          // in a turned crystal, the extraordinary index at the wave normal's own angle to the axis:
          // on the way in, that of the light refracted (found by going round twice)
          const thFrom = tc && mFrom.bire && tag === mFrom.ePol ? angTo(mFrom, [ldx, ldy, ldz]) : undefined;
          const n1 = nOf(mFrom, tag, thFrom);
          let thInto;
          if (tc && mInto.bire && tag === mInto.ePol) for (let it = 0, nn = nOf(mInto, tag, Math.PI / 2); it < 3; it++) {
            const e = n1 / nn, kk = 1 - e * e * (1 - ci * ci); if (kk < 0) break;
            const q = e * ci - Math.sqrt(kk);
            thInto = angTo(mInto, [e * ldx - q * tnx, e * ldy - q * tny, e * ldz - q * tnz]); nn = nOf(mInto, tag, thInto);
          }
          const n2 = nOf(mInto, tag, thInto);
          const eta = n1 / n2;
          const k = 1 - eta * eta * (1 - ci * ci);
          let rsr = 0, rsi = 0, rpr = 0, rpi = 0, total = false;
          if (k < 0) {
            // total internal reflection: everything comes back, each component with its own phase
            const b = Math.sqrt(-k);
            const phs = -2 * Math.atan2(n2 * b, n1 * ci);
            const php = -2 * Math.atan2(n1 * b, n2 * ci) + Math.PI;   // p in the parity convention, see below
            rsr = Math.cos(phs); rsi = Math.sin(phs);
            rpr = Math.cos(php); rpi = Math.sin(php);
            total = true;
          } else if (s.kind === 'split') {
            // a coating: the reflected field leads the transmitted one by a quarter wave
            rsi = Math.sqrt(s.Rs); rpi = Math.sqrt(s.Rp);
            if (s.Rs >= 1 && s.Rp >= 1) total = true;
          } else if (s.coat && s.coat.mode === 'band' && nm >= s.coat.lo && nm <= s.coat.hi) {
            rsi = rpi = Math.sqrt(s.coat.R / 100);
          } else if (s.coat && s.coat.mode === 'band') {
            // out of band: no coating worth the name, so trace the bare surface
            const ct = Math.sqrt(k);
            rsr = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
            rpr = (n1 * ct - n2 * ci) / (n2 * ci + n1 * ct);
          } else if (s.coat && s.coat.mode === 'stack' && s.coat.layers.length) {
            // layers are listed from the outside in, so a ray arriving through the
            // substrate meets the same stack in reverse order
            const stack = n1 > n2 ? s.coat.layers.slice().reverse() : s.coat.layers;
            const rs = stackAmp(stack, n1, n2, ci, nm, 's');
            const rp = stackAmp(stack, n1, n2, ci, nm, 'p');
            rsr = rs[0]; rsi = rs[1]; rpr = -rp[0]; rpi = -rp[1];
          } else if (s.coat && s.coat.mode !== 'bare') {
            rsi = rpi = Math.sqrt(s.coat.R / 100);
          } else {
            // Bare glass: real Fresnel coefficients, so a sign change is half a wave. p is in
            // the parity convention used throughout: its direction is the in-plane normal to
            // the ray, reversed at each reflection, so a mirror turns s and p over alike and
            // at normal incidence r_p = r_s, as it must when s and p cannot be told apart.
            const ct = Math.sqrt(k);
            rsr = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
            rpr = (n1 * ct - n2 * ci) / (n2 * ci + n1 * ct);
          }
          if (probe && s.kind === 'split' && (s.Rs + s.Rp) / 2 >= 0.5) {
            ldx -= 2 * cosd * nx; ldy -= 2 * cosd * ny; ldz -= 2 * cosd * nz;      // the probe takes the stronger arm
            wentR = true;
          } else if (total) {
            ldx -= 2 * ci * tnx; ldy -= 2 * ci * tny; ldz -= 2 * ci * tnz;
            wentR = true;
            const nsr = sr * rsr - si * rsi, nsi = sr * rsi + si * rsr;
            const npr = pr * rpr - pi * rpi, npi = pr * rpi + pi * rpr;
            sr = nsr; si = nsi; pr = npr; pi = npi;
          } else {
            if (rsr || rsi || rpr || rpi) branch(rsr, rsi, rpr, rpi);
            const q = eta * ci - Math.sqrt(k);
            ldx = eta * ldx - q * tnx; ldy = eta * ldy - q * tny; ldz = eta * ldz - q * tnz;
            nCur = n2;               // the ray is now travelling in the second medium
            gCur = ngOf(goingBack ? s.back : s.front, tag, thInto);
            aCur = absorbAt(goingBack ? s.back : s.front, nm);
            const mNow = goingBack ? s.back : s.front;
            if (!mNow.bire) tag = undefined;                     // out of the crystal
            else if (tc && tag === mNow.ePol) {
              // the energy leaves the wave normal in the plane of it and the axis (see walkOff)
              const l0 = Math.hypot(ldx, ldy, ldz), kv = [ldx / l0, ldy / l0, ldz / l0], c = axisL(mNow), ck = vdot3(c, kv);
              let u = [c[0] - ck * kv[0], c[1] - ck * kv[1], c[2] - ck * kv[2]];
              const lu = Math.hypot(...u), rho = lu > 1e-9 ? walkOff(mNow, nm, Math.acos(clamp(ck, -1, 1))) : 0;
              if (Math.abs(rho) > 1e-15) {
                u = u.map(v => v / lu);
                const [wx, wy] = toWorldDir(s.f, kv[0], kv[1]);
                wn = [wx, wy, kv[2]];
                [ldx, ldy, ldz] = kv.map((v, i) => Math.cos(rho) * v + Math.sin(rho) * u[i]);
              }
            } else if (mNow.walk && tag === mNow.ePol) {
              // the extraordinary ray's energy leaves its wave normal by the walk-off angle
              wk = walkOff(mNow, nm);
              const l0 = ldz ? Math.hypot(ldx, ldy, ldz) : Math.hypot(ldx, ldy), c = Math.cos(wk), sn = Math.sin(wk);
              [ldx, ldy] = [(ldx * c - ldy * sn) / l0, (ldx * sn + ldy * c) / l0]; ldz /= l0;
            }
          }
        }
        if (chief) { [qr, qi] = wentR ? qRf : qT; evt = wentR ? evR : evT; }
        if (wentR) par ^= 1;
        if (w < floorOf(fo) && !chief) { dropped++; break; }
        if (sLoc) [sr, si, pr, pi] = fromSurfFrame([sr, si, pr, pi], sLoc, [ldx, ldy, ldz], par ? -1 : 1, fxL);
        if (ldz) { const l = Math.hypot(ldx, ldy, ldz); [dx, dy] = toWorldDir(s.f, ldx / l, ldy / l); uz = ldz / l; }
        else { const l = Math.hypot(ldx, ldy); [dx, dy] = toWorldDir(s.f, ldx / l, ldy / l); if (anyZ) uz = 0; }
        if (isQ && evt && evt.mode !== 'P') { evt.dOut = [dx, dy]; g3(evt, [dx, dy, uz || 0]); }
        // a doubling crystal's reference ray out into the air: where and which way, for its harmonic
        if (nlcPend && s.el && s.el.id === nlcPend.el && nCur < 1.01) { nlcPend.H.exit = { x: px, y: py, z: zh, d3: [dx, dy, uz || 0] }; nlcPend = null; }
        last = s;
      }
      if (bounce >= maxB) limited++;
      if (probe && bounce >= maxB) probes.push({ h: probeH, x: px, y: py, dx, dy, last: probeLast });
      if (!chief) rays.push({ pts, zs: pts.zs && pts.zs.slice(0, pts.length >> 1), colour, w, src: src.id, bench: bn });
    }
    }
  }
  };
  runSources(project.elements);
  // The fibre network, from what reached its tips, and the light it sends back out of them
  lastTrace = { rays, screens, beams, blocked, limited, truncated, dropped, emitted, emittedBy, blockedSrc, absorbed, system: null, pulses };
  let net = fibreNetCached();
  // on a second pass, what the tips sent out last pass, which already includes the light
  // that came back into them
  const vs = tipCarry || tipSources(net);
  setVSRC(new Map(vs.map(v => [v.id, v])));
  if (vs.length) runSources(vs);
  lastTrace = { rays, screens, beams, blocked, limited, truncated, dropped, emitted, emittedBy, blockedSrc, absorbed,
    system: firstOrder(probes, probeSrc), net, pulses };
  // Light the tips sent out may come back into a fibre (off a mirror into the same tip, or
  // across to another): the network again with it, so it reaches the photodiodes. If that
  // changes what the tips send out (light round a loop through free space), the bench is
  // traced again with the new launches, until they settle
  if (vs.length) {
    const net2 = fibreNetCached(), vs2 = tipSources(net2);
    const sig = L => L.map(v => v.id + ':' + v.power.toPrecision(6) + ':' + v.vJ.map(x => x.toFixed(6)).join(',')).join(';');
    if (sig(vs2) !== sig(vs) && tipPass < TIP_PASSES) {
      tipPass++; tipCarry = vs2;
      traceSceneRaw();
      return;
    }
    net = net2;
    lastTrace.net = net2;
  }
  // Lasers: a cavity with gain above threshold saturates it until the round trip is one. The
  // gain that holds is found from this trace; if it differs from what the trace used, the
  // bench is traced once more with it. Then each lasing cavity's output leaves as a beam.
  // Vapour cells likewise: the beams crossing each one, which burn holes for the beams going
  // the other way, are known after the trace; if they changed, trace once more with them.
  lastTrace.cells = cellHits;
  const hasGain = project.elements.some(e => e.type === 'gain'), hasCell = project.elements.some(e => e.type === 'cell');
  // Nonlinear crystals: each beam's harmonic from the light that reached it; what that takes
  // from the fundamental is only known now, so if it changed, trace again with it
  const nlcDone = nlcHits.map(H => Object.assign(H, { r: nlcConvert(getEl(H.id), H.P, H.nm, H.q, H.n, H.cth) }));
  lastTrace.nlc = nlcDone;
  if (!gainSatBusy && (hasGain || hasCell || gainSat.size || cellPumps.size || nlcHits.length || nlcConv.size)) {
    let again = false;
    const conv = new Map(nlcDone.map(H => [H.k, H.r.conv]));
    if (!(conv.size === nlcConv.size && [...conv].every(([k, v]) => nlcConv.has(k) && Math.abs(nlcConv.get(k) - v) <= 1e-9 + 1e-7 * v))) { setNlcConv(conv); again = true; }
    const next = new Map();
    if (hasGain) for (const c of findCavities()) { const L = laserState(c); if (L && L.clamp) for (const [id, s] of L.clamp) next.set(id, s); }
    if (!(next.size === gainSat.size && [...next].every(([k, v]) => gainSat.has(k) && Math.abs(gainSat.get(k) - v) < 1e-6 * Math.abs(v)))) { setGainSat(next); again = true; }
    const pumps = new Map();
    for (const hh of cellHits) { if (!pumps.has(hh.id)) pumps.set(hh.id, []); pumps.get(hh.id).push({ dir: hh.dir, nu: hh.nu, I: hh.I, w: hh.w, ly: hh.ly, src: hh.src, comps: hh.comps, circ: hh.circ }); }
    const sig = m => [...m].map(([k, v]) => k + ':' + v.map(P => P.dir.map(q => q.toFixed(6)) + '/' + P.nu.toPrecision(12) + '/' + P.I.toPrecision(4) + '/' + P.w.toPrecision(4) + '/' + P.ly.toFixed(4) + '/' + P.src + (P.comps ? '/' + JSON.stringify(P.comps) : '') + (P.circ ? '/' + P.circ[0].toFixed(4) : '')).join(',')).join(';');
    if (sig(pumps) !== sig(cellPumps)) { cellPumps = pumps; setCellPlanMemo(new Map()); again = true; }
    if (again) { gainSatBusy = true; try { traceSceneRaw(); } finally { gainSatBusy = false; } return; }
  }
  // the harmonics, launched from their crystals
  if (nlcDone.some(H => H.r.P2 > 0)) {
    const shg = nlcSources(nlcDone);
    for (const v of shg) VSRC.set(v.id, v);
    runSources(shg);
    lastTrace = { rays, screens, beams, blocked, limited, truncated, dropped, emitted, emittedBy, blockedSrc, absorbed, system: lastTrace.system, net: lastTrace.net, pulses, cells: cellHits, nlc: nlcDone };
  }
  if (hasGain) {
    const las = laserSources();
    if (las.length) {
      for (const v of las) VSRC.set(v.id, v);
      runSources(las);
      lastTrace = { rays, screens, beams, blocked, limited, truncated, dropped, emitted, emittedBy, blockedSrc, absorbed, system: lastTrace.system, net, pulses, cells: cellHits, nlc: lastTrace.nlc };
      setCavCache(null);
    }
  }
  afterTrace();
}
export function afterTrace() {
  // when the set of cavities changes, the panels that show them are rebuilt
  if (!TEST_MODE && !IN_WORKER && typeof findCavities === 'function') {
    const sig = findCavities().map(c => c.id).join('/');
    if (sig !== cavPanelSig) { cavPanelSig = sig; setTimeout(() => hooks.renderPanel(), 0); }
    // a bench with cavities keeps their steady states current
    if (sig) setTimeout(() => { if (findCavities().some(c => { const S = cavSolved.get(c.id); return !S || S.trace !== lastTrace; })) hooks.cavityLater(); }, 0);
  }
}
let cavPanelSig = '';
let gainSatBusy = false;
export let cellPumps = new Map();           // cell id -> the beams crossing it last trace: { dir, nu, I }

/* The system as a whole, from three probe rays sent in parallel to the first source */
function firstOrder(probes, src) {
  if (!src || probes.length < 3) return null;
  const axis = probes.find(p => p.h === 0);
  const up = probes.find(p => p.h > 0), dn = probes.find(p => p.h < 0);
  if (!axis || !up || !dn) return null;
  const cross = (ax, ay, bx, by) => ax * by - ay * bx;
  // angle each outer ray makes with the outgoing axis
  const ang = p => Math.asin(clamp(cross(axis.dx, axis.dy, p.dx, p.dy), -1, 1));
  const u = (ang(up) - ang(dn)) / 2;                 // slope per unit height, averaged
  const h = up.h;
  if (Math.abs(u) < 1e-9) return { efl: Infinity, bfd: Infinity, collimated: true };
  if (!axis.last) return null;                      // nothing optical happened to measure
  // measure from the last optic each ray met, not from wherever it happened to stop
  const org = p => (p.last ? [p.last.px, p.last.py] : [p.x, p.y]);
  const [ax0, ay0] = org(axis), [ux0, uy0] = org(up);
  // where the outer ray crosses the axis, measured from the last optic it touched
  const den = cross(up.dx, up.dy, axis.dx, axis.dy);
  let bfd = null, focus = null, ahead = true;
  if (Math.abs(den) > 1e-12) {
    const t = cross(ax0 - ux0, ay0 - uy0, axis.dx, axis.dy) / den;
    ahead = t > 0;                                   // a real focus in front, not a virtual one behind
    focus = [ux0 + up.dx * t, uy0 + up.dy * t];
    const lx = focus[0] - axis.last.px, ly = focus[1] - axis.last.py;
    bfd = lx * axis.dx + ly * axis.dy;
  }
  const efl = (ahead ? 1 : -1) * Math.abs(h / Math.tan(u));
  const D = src.width || 0;
  return {
    efl, bfd, focus,
    fnum: D > 0 ? Math.abs(efl) / D : null,
    na: D > 0 ? Math.abs(Math.sin(Math.atan(D / 2 / Math.abs(efl)))) : null,
    beam: D,
    collimated: false,
  };
}

/* Paraxial EFL / BFL of a lens at one wavelength */
export function paraxial(el, nm) {
  let y = 1, u = 0, n1 = 1;
  const N = el.surfaces.length;
  for (let i = 0; i < N; i++) {
    const sd = el.surfaces[i];
    const c = (sd.R === null ? 0 : 1 / sd.R) + 2 * sd.a2;
    const n2 = i === N - 1 ? 1 : refIndex(el.materials[i], nm);
    u = (n1 * u - (n2 - n1) * c * y) / n2;
    n1 = n2;
    if (i < N - 1) y += el.gaps[i] * u;
  }
  if (Math.abs(u) < 1e-14) return { efl: Infinity, bfl: Infinity };
  return { efl: -1 / u, bfl: -y / u };
}

/* A bench whose trace can be done wholly in the worker: one with nothing that carries state
   from trace to trace on this page (fibre networks, lasers, vapour cells, crystals) */
export const TW_FREE = new Set(['source', 'lens', 'mirror', 'screen', 'stop', 'mask', 'prism', 'cube', 'crystal', 'waveplate', 'polariser', 'grating',
  'filter', 'faraday', 'isolator', 'detector', 'aom', 'eom', 'link', 'draw']);
