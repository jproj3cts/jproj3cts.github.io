import { unit3 } from '../core/numeric.js';
import { project } from '../state/project.js';
import { getEl } from '../state/elements.js';
import { lastTrace, polFrame, zOf } from './trace.js';
import { findCavities } from './cavity.js';
import { beamFrame } from './phase-screen.js';
import { vsrc } from './scatter-light.js';

/* ---------- A degenerate cavity's one-pass map, from the bench's tracer ----------
   The pupil solve (engines/scatter-pupil.js) needs, for each direction u the particle sends light in, where the
   cavity brings that light back: after one, two or more reflections, as the real cavity does it (its mirrors' shapes,
   rims, coatings, where they stand, tipped or rolled). So during the trace, before the particles' light is launched,
   each such particle sends a probe: rays along every grid direction (and a few more), traced by the tracer itself,
   reflection by reflection, each state kept as it leaves a mirror back into the cavity (a ray that leaves the cavity
   ends there). Per ray and per reflection: its point, its direction, its optical path and its amplitudes (s and p,
   the trace's own, with every mirror's coefficient). Two rays each way (s and p) give the mirrors' action on the
   field; five more from beside the particle (PMAP_DX each way across the axis, and once both ways) give how the map moves
   with where a ray crosses the particle's plane (its path to second order: the mirrors' curvature is in it), so a return that comes back beside the particle is carried on exactly enough. Kept while
   the cavity, the particle and the light stay as they are (the key); nothing of it is light on the bench. */
export const PMAP_N = 64;              // the grid's points across each cap (as the solve's)
export const PMAP_REFL = 6;            // reflections followed, for the small fan that finds the pattern
const PMAP_DX = 1e-3;                  // mm: the offsets beside the particle
const PMAP_FAN = [2e-3, 5e-3];         // rad: the fan's angles
export const PUP_MAPS = new Map();      // particle id -> { key, ... }
const pmD3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const pmAd3 = (a, b, s = 1) => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];

/* the particle's two-mirror cavity, if it is in one its light comes back to: { c, near, far, dir, ex, ey } or null */
function pmapCavity(el) {
  const B = lastTrace.beams || [], at = [el.x, el.y, zOf(el)];
  let cs;
  try { cs = findCavities(); } catch (err) { return null; }
  for (const c of cs) {
    if (c.kind !== 'linear' || c.p !== 2) continue;
    // its legs pass the particle (within three of their radii)
    const near = c.segs.filter(b => {
      const F = beamFrame(b), r = pmAd3(at, F.P0, -1), t = pmD3(r, F.d);
      if (t < 0 || t > F.L) return false;
      const off = Math.hypot(...pmAd3(r, F.d, -t)), w = Math.sqrt(Math.max(1e-12, b.nm * 1e-6 / b.n * b.qi / Math.PI * (1 + ((b.qr + t) / b.qi) ** 2)));
      return off < Math.max(0.02, 3 * w);
    });
    if (near.length !== 2) continue;
    // the light let in passes the particle first, forward: towards the far mirror
    const entry = B.find(b => !c.segs.includes(b) && b.src === c.segs[0].src && Math.abs(pmD3(beamFrame(b).d, beamFrame(c.segs[0]).d)) > 0.999 && (() => {
      const F = beamFrame(b), r = pmAd3(at, F.P0, -1), t = pmD3(r, F.d); return t > 0 && t < F.L; })());
    if (!entry) continue;
    const fd = beamFrame(entry).d, lf = pmD3(beamFrame(near[0]).d, fd) > 0 ? near[0] : near[1];
    const j = c.segs.indexOf(lf), elOf = k => { const ev = c.segs[k].ev; return ev && getEl(ev.el); };
    const far = elOf((j + 1) % 2), nearM = elOf(j);
    if (!far || !nearM) continue;
    const F = beamFrame(lf);
    return { c, far, near: nearM, dir: F.d, ex: F.ex, ey: F.level ? [0, 0, 1] : F.ey, nm: lf.nm, root: getEl(lf.src) };
  }
  return null;
}
/* a mirror's cap as the particle sees it: the half-angle to its rim (its own size and distance; a probe ray outside it
   is simply lost at the rim) */
const pmapCap = (m, C) => Math.atan2(0.5 * (m.diameter || m.length || 0), Math.max(1e-6, Math.hypot(m.x - C[0], m.y - C[1], zOf(m) - C[2])));
/* the grid's directions over a cap of half-angle th about sg * dir, and its rim cells' sub-directions */
export function pmapGridOf(G0, sg, th, n = PMAP_N) {
  // (th is only an estimate of the rim from the part's size and distance: the grid reaches a tenth past it, and every
  // cell within four steps of it is sampled across, so the tracer's own rim decides)
  const s = Math.min(0.999, Math.sin(th) * 1.1), h = 2 * s / (n - 1), rim = Math.sin(th);
  const cells = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = -s + i * h, b = -s + j * h, r = Math.hypot(a, b);
    if (r >= s) continue;
    cells.push({ i, j, a, b, edge: Math.abs(r - rim) <= 4 * h });
  }
  return { s, h, n, sg, cells };
}
export const pmapDir = (G0, sg, a, b) => { const uz = Math.sqrt(Math.max(0, 1 - a * a - b * b)); return [0, 1, 2].map(q => sg * uz * G0.dir[q] + a * G0.ex[q] + b * G0.ey[q]); };
/* what the probe is for: everything a ray of it depends on (the cavity's parts as they stand, the particle's place, the light) */
function pmapKey(el, K, C) {
  const part = e => JSON.stringify(e, (k, v) => (k === 'name' || k === 'label' || k === 'sweeps' || k === 'lineColour' || k === 'fillColour' ? undefined : v));
  return JSON.stringify(C) + '|' + K.nm + '|' + part(K.far) + part(K.near) + '|' + project.elements.filter(e => e.bench === el.bench && e.type !== 'particle' && e.type !== 'source' && e !== K.far && e !== K.near).map(part).join('');
}
/* The trace's probes for every particle in a two-mirror cavity: { srcs, done() } or null. Each probe is a virtual source of
   rays the tracer follows reflection by reflection (src.vMap), recording into it and adding no light to the bench. */
export function pmapLaunch() {
  const parts = project.elements.filter(e => e.type === 'particle');
  if (!parts.length) return null;
  const srcs = [], todo = [];
  for (const el of parts) {
    const K = pmapCavity(el);
    if (!K) continue;
    const C = [el.x, el.y, zOf(el)], key = pmapKey(el, K, C), had = PUP_MAPS.get(el.id);
    if (had && had.key === key) continue;
    const G0 = { dir: K.dir, ex: K.ex, ey: K.ey };
    const caps = [pmapGridOf(G0, 1, pmapCap(K.far, C)), pmapGridOf(G0, -1, pmapCap(K.near, C))];
    // the rays: per grid cell its middle (s and p) and, beside the particle, its middle again from four offsets (s);
    // per rim cell 4 x 4 directions across it (s); and the fan
    const main = [], pol = [], sub = [], fan = [];
    caps.forEach((cap, ci) => cap.cells.forEach((cl, k) => {
      main.push({ d: pmapDir(G0, cap.sg, cl.a, cl.b), ci, k });
      if (cl.edge) for (let p = 0; p < 4; p++) for (let q = 0; q < 4; q++) {
        const aa = cl.a + ((p + 0.5) / 4 - 0.5) * cap.h, bb = cl.b + ((q + 0.5) / 4 - 0.5) * cap.h;
        if (aa * aa + bb * bb < 0.998) sub.push({ d: pmapDir(G0, cap.sg, aa, bb), ci, k, aa, bb });
      }
    }));
    for (const sg of [1, -1]) for (const th of PMAP_FAN) for (const [a, b] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) fan.push({ d: pmapDir(G0, sg, th * a, th * b), sg });
    const S = [1, 0, 0, 0], Pp = [0, 0, 1, 0];
    const mk = (id, pos, list, J, R) => {
      const rays = list.map(r => ({ d: r.d, J, draw: 0 }));
      const v = vsrc(el, pos, K.nm, K.root, { id: el.id + '~pmap' + id, vRays: rays, vMap: { C, axis: K.dir, R, rec: new Float64Array(rays.length * R * 12).fill(NaN) } });
      srcs.push(v);
      return v;
    };
    const run = {
      el, K, C, key, caps, main, sub, fan,
      vs: mk('s', C, main, S, 2), vp: mk('p', C, main, Pp, 2), vsub: mk('sub', C, sub, S, 2), vfan: mk('fan', C, fan, S, PMAP_REFL),
      off: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]].map(([a, b], q) => mk('o' + q, pmAd3(C, pmAd3(G0.ex.map(v => v * a * PMAP_DX), G0.ey.map(v => v * b * PMAP_DX))), main, S, 2)),
    };
    todo.push(run);
  }
  if (!srcs.length) return null;
  return { srcs, done() { for (const r of todo) PUP_MAPS.set(r.el.id, pmapStore(r)); } };
}
/* The tracer's hook (engines/trace.js): a probe ray at the start of each step after a surface. It ends when it leaves the
   cavity (it goes away from the particle: a mirror let it through) or has made all its reflections; else its state is
   kept. Returns true to stop the ray. */
export function pmapStep(VM, vK, bounce, px, py, zh, dx, dy, uz, opl, sr, si, pr, pi, par) {
  const d = unit3([dx, dy, uz || 0]), toC = [VM.C[0] - px, VM.C[1] - py, VM.C[2] - zh];
  // (leaving: going away from the particle along the axis, once past the mirror it met)
  if (pmD3(d, toC) < 0 && Math.abs(pmD3(toC, VM.axis)) > 1e-6) return true;
  const o = (vK * VM.R + bounce - 1) * 12;
  VM.rec.set([px, py, zh, d[0], d[1], d[2], opl, sr, si, pr, pi, par], o);
  return bounce >= VM.R;
}
// a probe ray's state after r reflections: { X, d, opl, J, par } or null
const recOf = (v, i, r) => { const VM = v.vMap, o = (i * VM.R + r - 1) * 12, R = VM.rec; if (!(R[o] === R[o])) return null; return { X: [R[o], R[o + 1], R[o + 2]], d: [R[o + 3], R[o + 4], R[o + 5]], opl: R[o + 6], J: [R[o + 7], R[o + 8], R[o + 9], R[o + 10]], par: R[o + 11] }; };
/* the probe's rays as the solve takes them */
function pmapStore(run) {
  const { el, K, C, key, caps, main, sub, fan } = run, axis = K.dir;
  // the pattern: the fewest reflections after which the fan meets again near the particle (within a twentieth of its
  // spread, at a twentieth of the cavity's length)
  const L = Math.hypot(K.far.x - K.near.x, K.far.y - K.near.y, zOf(K.far) - zOf(K.near));
  let pattern = 0;
  for (let r = 1; r <= PMAP_REFL && !pattern; r++) {
    let ok = true;
    for (const sg of [1, -1]) {
      const rays = [];
      fan.forEach((f, i) => { if (f.sg !== sg) return; const s0 = recOf(run.vfan, i, r); if (!s0) ok = false; else rays.push({ s0, spread: PMAP_FAN[(i % 8) >> 2] * Math.hypot(...pmAd3(s0.X, C, -1)) }); });
      if (!ok || rays.length < 4) { ok = false; break; }
      const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bv = [0, 0, 0];
      for (const { s0 } of rays) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const m = (i === j ? 1 : 0) - s0.d[i] * s0.d[j]; A[i][j] += m; bv[i] += m * s0.X[j]; }
      const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const D = det(A);
      if (!(Math.abs(D) > 1e-12)) { ok = false; break; }
      const P = [0, 1, 2].map(c => det(A.map((row, i) => row.map((v, j) => (j === c ? bv[i] : v)))) / D);
      for (const { s0, spread } of rays) { const w = pmAd3(P, s0.X, -1); if (!(Math.hypot(...pmAd3(w, s0.d, -pmD3(w, s0.d))) < 0.05 * spread)) ok = false; }
      if (Math.hypot(...pmAd3(P, C, -1)) > 0.05 * L) ok = false;
      if (!ok) break;
    }
    if (ok) pattern = r;
  }
  if (!pattern || pattern > 2) return { key, pattern: pattern || 0, why: pattern ? 'pattern' : 'noimage' };
  // per main ray: where it crosses the particle's plane after `pattern` reflections (q, 3D, from C), its way d, the path
  // to there, its field matrix (3 x 3 complex, the physicists' convention: the trace's amplitudes conjugated), and the
  // same from the four offsets; per rim cell the share of its sub-rays that come back and their mean direction
  const cross = s0 => { const t = pmD3(pmAd3(C, s0.X, -1), axis) / pmD3(s0.d, axis); const Q = pmAd3(s0.X, s0.d, t); return { q: pmAd3(Q, C, -1), d: s0.d, ell: s0.opl + t /* (vacuum between the mirrors) */ }; };
  const N = main.length, out = { key, pattern, caps, C, axis, ex: K.ex, ey: K.ey, L, nm: K.nm, far: K.far.id, near: K.near.id, cell: [] };
  for (let i = 0; i < N; i++) {
    const a = recOf(run.vs, i, pattern), b = recOf(run.vp, i, pattern);
    if (!a || !b) { out.cell.push(null); continue; }
    const u = main[i].d, [Si, Pi] = polFrame(u, 1), [So, Po] = polFrame(a.d, a.par ? -1 : 1);
    // M E = E_s (S_in . E) + E_p (P_in . E), E_s = conj(Js_s) So + conj(Js_p) Po
    const Es = [0, 1, 2].map(q => [a.J[0] * So[q] + a.J[2] * Po[q], -(a.J[1] * So[q] + a.J[3] * Po[q])]);
    const Ep = [0, 1, 2].map(q => [b.J[0] * So[q] + b.J[2] * Po[q], -(b.J[1] * So[q] + b.J[3] * Po[q])]);
    const M = new Float64Array(18);
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) { M[2 * (3 * x + y)] = Es[x][0] * Si[y] + Ep[x][0] * Pi[y]; M[2 * (3 * x + y) + 1] = Es[x][1] * Si[y] + Ep[x][1] * Pi[y]; }
    const c0 = cross(a), jac = [];
    for (let q = 0; q < 5; q++) { const o = recOf(run.off[q], i, pattern); jac.push(o ? cross(o) : null); }
    // for the focal lines along a chain (the solve's weight): how far along the axis the first and the last mirror
    // points are from the particle's plane, and, with two reflections a return, the stretch between the mirrors as a
    // line (where it would cross the particle's plane, and its way), with the same from the offsets
    const r1 = recOf(run.vs, i, 1), zOfX = X => pmD3(pmAd3(X, C, -1), axis);
    const cell = { u, ci: main[i].ci, k: main[i].k, q: c0.q, d: c0.d, ell: c0.ell, M, jac, zl: zOfX(a.X), z1: r1 ? zOfX(r1.X) : zOfX(a.X), mid: null, jacm: null };
    if (pattern === 2 && r1 && Math.abs(pmD3(r1.d, axis)) > 1e-6) {
      cell.mid = cross(r1);
      cell.jacm = [0, 1, 2, 3].map(q => { const o = recOf(run.off[q], i, 1); return o && Math.abs(pmD3(o.d, axis)) > 1e-6 ? cross(o) : null; });
    }
    out.cell.push(cell);
  }
  // the rim cells: their share and mean direction
  const rimAgg = new Map();
  sub.forEach((s, i) => {
    const key2 = s.ci + ':' + s.k, A = rimAgg.get(key2) || { n: 0, k: 0, sa: 0, sb: 0, sw: 0 };
    A.n++;
    if (recOf(run.vsub, i, pattern)) { const w = 1 / Math.sqrt(1 - s.aa * s.aa - s.bb * s.bb); A.k++; A.sa += s.aa * w; A.sb += s.bb * w; A.sw += w; }
    rimAgg.set(key2, A);
  });
  out.rim = rimAgg;
  out.dx = PMAP_DX;
  return out;
}
