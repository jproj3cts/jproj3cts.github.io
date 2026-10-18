import { BEAM_Z, clamp, mkCanvas } from '../core/constants.js';
import { splitRoot } from '../core/coherence.js';
import { deg, project } from '../state/project.js';
import { allSources, fieldDec, lightOf } from '../state/elements.js';
import { lastTrace } from './trace.js';
import { interpL, popInside, popRadii, popStats, qdht } from './field.js';
import { field2I, field2Propagate, field2Slope, fieldComps, popStats2 } from './field2d.js';
import { POP_ROWS, POP_SLICES, popGroupCut, popKeyOf, popRun } from './beam-tree.js';
import { closeupAt, closeupImage, closeupPrep } from './closeup.js';
import { trapLegPart } from './diffraction.js';

/* ---------- The diffracted field in 3D ----------
   Each segment's field as a volume for the 3D view: cuts across the beam along it, close
   together near a waist (evenly in asinh of the distance from it over the Rayleigh range) and
   no further apart than 10 mm, or a twelfth of the segment (20 mm for a 2D field). A round beam's cut is its radial profile; a
   2D one's a square map across it (in the bench plane, then up out of it). In W/mm², from the
   field's irradiance per unit power and its laser's power. Each cut reaches out to where the
   light has fallen 60 dB below its peak there (50 dB for a map), a profile sampled on a square
   root of the radius so a focus's core keeps its detail. Beams add as intensities here; the screens and
   the close-up add those of one launch as fields. */
const VOL_M = 96, VOL_M2 = 41, VOL_CUTS = 40, VOL_CUTS2 = 24;
/* a 2D field on a coarser grid for the 3D view's maps, which are 41 samples across (one on the axis): every k-th
   sample, k a power of two leaving at least 64, so long as the field's phase (its pilot taken off)
   turns less than 0.8 rad between the new samples; a field with finer detail keeps its grid */
function volDecimate(F) {
  const N = F.N, g = Math.max(field2Slope(F, 'x') * F.ax.d, field2Slope(F, 'y') * F.ay.d);
  let k = 1;
  while (N / (2 * k) >= 64 && g * 2 * k <= 0.8) k *= 2;
  if (k === 1) return F;
  const n = N / k, out = Object.assign({}, F, { N: n, ax: Object.assign({}, F.ax, { d: F.ax.d * k }), ay: Object.assign({}, F.ay, { d: F.ay.d * k }) });
  for (const [kr, ki] of fieldComps(F)) {
    const R = new Float64Array(n * n), I = new Float64Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const o = j * k * N + i * k; R[j * n + i] = F[kr][o]; I[j * n + i] = F[ki][o]; }
    out[kr] = R; out[ki] = I;
  }
  return out;
}
function volLegBase(leg) { const p = Object.getPrototypeOf(leg); return p && Object.prototype.hasOwnProperty.call(p, 'cutC') ? p : leg; }
/* A segment's field at a point (px across in the bench plane, py up out of it) of one exact cut
   G of it, its leg's field at that distance, as [p re, p im, s re, s im]: a 2D map interpolated, a
   round field read between its radial samples, each with its reference sphere and the launch's
   polarisation. (Cuts a fiftieth of a Rayleigh range apart, interpolated between, would miss the
   near field of a beam clipped by a rim, which ripples along the beam on a far finer scale.) */
const volRadii = new WeakMap();
function volCutAt(L, G, px, py, J) {
  const k = L.k;
  let s, p;
  if (L.two) {
    const refX = popInside(G.ax.z, G.ax.zR) ? 0 : -k / (2 * G.ax.z), refY = popInside(G.ay.z, G.ay.zR) ? 0 : -k / (2 * G.ay.z);
    const ph = refX * px * px + refY * py * py, c = Math.cos(ph), sn = Math.sin(ph), rot = v => [v[0] * c - v[1] * sn, v[0] * sn + v[1] * c];
    const a = interpL(G, px, py);
    if (G.re2) { s = rot(a); const q = interpL(G, px, py, G.re2, G.im2); p = rot([(L.par ? -1 : 1) * q[0], (L.par ? -1 : 1) * q[1]]); }
    else { const v = rot(a); s = [v[0] * J[0] - v[1] * J[1], v[0] * J[1] + v[1] * J[0]]; p = [v[0] * J[2] - v[1] * J[3], v[0] * J[3] + v[1] * J[2]]; }
  } else {
    let x = volRadii.get(G); if (!x) { x = popRadii(qdht(G.re.length), G.R); volRadii.set(G, x); }
    const n = x.length, r = Math.hypot(px, py);
    let vr = 0, vi = 0;
    if (r <= x[0]) { vr = G.re[0]; vi = G.im[0]; }
    else if (r < x[n - 1]) {
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (x[m] <= r) lo = m; else hi = m; }
      const f = (r - x[lo]) / (x[hi] - x[lo]);
      vr = G.re[lo] + (G.re[hi] - G.re[lo]) * f; vi = G.im[lo] + (G.im[hi] - G.im[lo]) * f;
    }
    const bph = (G.sphere ? -k / (2 * G.z) : 0) * r * r, cb = Math.cos(bph), sb = Math.sin(bph), v0 = vr * cb - vi * sb, v1 = vr * sb + vi * cb;
    s = [v0 * J[0] - v1 * J[1], v0 * J[1] + v1 * J[0]]; p = [v0 * J[2] - v1 * J[3], v0 * J[3] + v1 * J[2]];
  }
  return [p[0], p[1], s[0], s[1]];
}
/* the share of its laser's power a segment's field is per unit of, in W: the field has unit power
   (a cavity's build-up aside), and the segment's Jones vector carries its launch's share and every
   reflection, transmission and loss on its way, so a 5 % leak through a mirror is 5 % here too */
const volPw = sg => Math.max(0, splitRoot(sg.src).power || 0) * 1e-3 * (sg.boost || 1) * (sg.b && sg.b.J ? sg.b.J.reduce((a, v) => a + v * v, 0) : (sg.root || 1));
/* Beams of one launch that run the same way through the same space interfere, and fringes
   across them are on a scale the 3D view can show: each such segment's mates, the others of its
   launch on the bench plane running within 6 degrees of it, side by side within a few beam
   widths, over a stretch of its length. (Beams crossing at an angle or running opposite ways
   make fringes far finer than the view; they add as intensities.) */
/* a segment's power as it starts: its launch's share of its laser times the power its field carries */
const volSegPower = sg => {
  if (sg._pw === undefined) { let f = 1; try { f = (sg.eng === '2d' ? popStats2(sg.F0) : popStats(sg.F0)).power; } catch (err) { /* unknown: as launched */ } sg._pw = volPw(sg) * (f > 0 ? f : 0); }
  return sg._pw;
};
export function volPartners(segs, tab) {
  const flat = sg => { const b = sg.b; return b && (!tab || b.bench === tab) && b.len > 0 && !(b.len3 > 0 && Math.abs(b.len3 - b.len) > 1e-9) && !(b.d3 && Math.abs(b.d3[2]) > 1e-9); };
  const byL = new Map();
  for (const sg of segs) if (flat(sg)) { if (!byL.has(sg.coh)) byL.set(sg.coh, []); byL.get(sg.coh).push(sg); }
  const out = new Map(), wAt = (sg, t) => { try { return volLegBase(sg.leg).cutC(clamp(t, 0, sg.b.len)).w || 0; } catch (err) { return 0; } };
  for (const L of byL.values()) for (const a of L) for (const c of L) {
    if (a === c) continue;
    const A = a.b, C = c.b;
    if (A.dx * C.dx + A.dy * C.dy < Math.cos(6 * deg) || Math.abs((A.z0 ?? BEAM_Z) - (C.z0 ?? BEAM_Z)) > 1e-6) continue;
    // a ghost of a ten-thousandth the power makes fringes of 2% at most: not worth a map, whose
    // coarse grid (as wide as the wider beam) would blur a tight focus of the stronger one
    const wa = volSegPower(a), wc = volSegPower(c);
    if (Math.min(wa, wc) < 1e-4 * Math.max(wa, wc)) continue;
    // where c runs alongside a: its ends on a's axis
    const t0 = (C.x0 - A.x0) * A.dx + (C.y0 - A.y0) * A.dy, t1 = t0 + C.len * (C.dx * A.dx + C.dy * A.dy), lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(A.len, Math.max(t0, t1));
    if (!(hi > lo)) continue;
    const tm = 0.5 * (lo + hi), xm = (C.x0 + C.dx * (tm - t0) - (A.x0 + A.dx * tm)) * -A.dy + (C.y0 + C.dy * (tm - t0) - (A.y0 + A.dy * tm)) * A.dx;
    if (Math.abs(xm) > 3 * (wAt(a, tm) + wAt(c, tm - t0)) + 1e-9) continue;
    if (!out.has(a)) out.set(a, []);
    out.get(a).push(c);
  }
  return out;
}
/* where a segment's volume is cut across it: its direction, height, and the distances along it,
   or null for none (no length, or off the board) */
function volCuts(sg, bb, two, coh) {
  const b = sg.b, L3 = b.len3 || b.len;
  if (!(L3 > 0)) return null;
  const d = b.d3 || [b.dx, b.dy, b.uz || 0], dl = Math.hypot(d[0], d[1], d[2]), e = d.map(v => v / dl);
  const z0 = b.z0 !== undefined ? b.z0 : BEAM_Z;
  // cut to the board (light off the table goes on, on the 2D bench), and to 2 m at most
  let ta = 0, tb = Math.min(L3, 2000);
  if (bb) for (const [p, q] of [[-e[0], b.x0 - bb[0]], [e[0], bb[2] - b.x0], [-e[1], b.y0 - bb[1]], [e[1], bb[3] - b.y0]]) {
    if (Math.abs(p) < 1e-12) { if (q < 0) tb = -1; continue; }
    const r = q / p;
    if (p < 0) ta = Math.max(ta, r); else tb = Math.min(tb, r);
  }
  if (!(tb > ta)) return null;
  const leg = volLegBase(sg.leg), F0 = sg.F0 || leg.field || {};
  const A = two ? (F0.ax && F0.ay && F0.ax.zR <= F0.ay.zR ? F0.ax : F0.ay) : F0;
  const zR = A && A.zR > 0 ? A.zR : (tb - ta), tw = A && isFinite(A.z) ? -A.z : (ta + tb) / 2;
  // where to cut: dense through the waist (three to each unit of asinh), and every 10 mm along
  // (20 mm for a 2D map, each of which is a whole propagation; 5 mm for beams that interfere, whose
  // fringes change along the way as their wavefronts' curvatures part, in blocks between cuts far apart)
  const ua = Math.asinh((ta - tw) / zR), ub = Math.asinh((tb - tw) / zR), set = new Set();
  const nw = clamp(Math.ceil(3 * (ub - ua)) + 1, 2, (two ? VOL_CUTS2 : VOL_CUTS) - 12), nu = clamp(Math.ceil((tb - ta) / (coh ? 5 : two ? 20 : 10)), 1, 12);
  for (let k = 0; k < nw; k++) set.add(+(tw + zR * Math.sinh(ua + (ub - ua) * k / (nw - 1))).toFixed(6));
  for (let k = 0; k <= nu; k++) set.add(+(ta + (tb - ta) * k / nu).toFixed(6));
  return { e, z0, ts: Float32Array.from([...set].filter(t => t >= ta - 1e-9 && t <= tb + 1e-9).sort((x, y) => x - y)) };
}
/* Each segment's volume, of those on the tab (only: the segments, by index, to work out, or a
   Map of them to the ranges of their cuts, [[j0, j1], ...], a share of a pooled job: the rest of
   their cuts are left empty, for volStitch to fill from the other shares) */
export function volData(segs, tab, bb, only) {
  const out = [], mates = volPartners(segs, tab);
  for (const sg of segs) {
    const b = sg.b;
    if (!b || (tab && b.bench !== tab) || (only && !only.has(sg.i))) continue;
    const leg = volLegBase(sg.leg), F0 = sg.F0 || leg.field || {}, cohs = mates.get(sg) || [], coh = cohs.length > 0;
    // a segment whose light interferes with its mates' is a map of their fields added, whatever its engine
    const two = sg.eng === '2d' || coh, Fd = sg.eng === '2d' && !coh ? volDecimate(leg.field || F0) : null;
    const C = volCuts(sg, bb, two, coh);
    if (!C) continue;
    const { e, z0, ts } = C, ranges = only instanceof Map ? only.get(sg.i) : null;
    // the launch's share of its laser (half each for an unpolarised one's two halves)
    const Pw = volPw(sg), M = two ? VOL_M2 : VOL_M;
    const I = new Float32Array(ts.length * (two ? M * M : M)), rmax = new Float32Array(ts.length);
    let pk = 0;
    // the fields of a segment and its mates at a point on the bench (x, y) at height z0 + v
    // (each with its launch's polarisation as a direction only: its amplitude is in the field, and its power in Pw)
    const members = coh ? [sg, ...cohs].map(m => { const L = trapLegPart(m, [m.b.x0, m.b.y0]), Jn = Math.hypot(...L.J) || 1; return { m, L, a: Math.sqrt(volPw(m)), J: L.J.map(v => v / Jn) }; }) : null;
    const nX = -b.dy, nY = b.dx;
    ts.forEach((t, j) => {
      if (ranges && !ranges.some(([j0, j1]) => j >= j0 && j < j1)) return;
      if (coh) {
        // reach: each member's few widths about its axis, as seen from this one's
        // (sized to the beams that matter: a ghost of a few percent adds fringes within the strong
        // beam, and its own faint spread beyond it is left out, rather than a grid as wide as it
        // blurring a tight focus of the strong one)
        let R = 0;
        const top = Math.max(...members.map(({ m }) => volSegPower(m)));
        for (const { m } of members) {
          if (volSegPower(m) < 0.05 * top) continue;
          // (a cut at an end, its place rounded to single precision, still counts as on the segment)
          const tm0 = (b.x0 + b.dx * t - m.b.x0) * m.b.dx + (b.y0 + b.dy * t - m.b.y0) * m.b.dy;
          if (tm0 < -1e-3 || tm0 > m.b.len + 1e-3) continue;
          const tm = clamp(tm0, 0, m.b.len);
          const off = (m.b.x0 + m.b.dx * tm - b.x0 - b.dx * t) * nX + (m.b.y0 + m.b.dy * tm - b.y0 - b.dy * t) * nY;
          let w = 0; try { w = volLegBase(m.leg).cutC(tm).w || 0; } catch (err) { /* none */ }
          R = Math.max(R, Math.abs(off) + 3.2 * w);
        }
        R = Math.max(R, 1e-6); rmax[j] = R;
        const X = b.x0 + b.dx * t, Y = b.y0 + b.dy * t;
        // each member's field cut exactly where this cut crosses its axis; across the cut, the
        // fast phase of the small way along it a point is from there (a mate at an angle's tilt fringes)
        const here = members.map(mb => { const m = mb.m, pzc = clamp((X - m.b.x0) * m.b.dx + (Y - m.b.y0) * m.b.dy, 0, m.b.len); return Object.assign({ pzc, G: m.leg.at(pzc) }, mb); });
        // Fringes the grid can show: between beams running the same way, no finer than a few of its cells
        // across. Beams crossing at an angle, or running against each other, make fringes of a fraction
        // of a micron (across the beam, or along it, between the cuts): no grid resolves them, sampled
        // they alias into blocks, and the eye sees their mean. Each such group's fields add; the groups'
        // irradiances add.
        const cell = 2 * R / (M - 1), grp = [], lead = [];
        for (const h of here) {
          const d = [h.m.b.dx, h.m.b.dy], lam = 2 * Math.PI / (h.L.k || 1e4);
          let g = lead.findIndex(D => { const c = D[0] * d[0] + D[1] * d[1], sn = Math.abs(D[0] * d[1] - D[1] * d[0]); return c > 0 && lam > 4 * cell * sn; });
          if (g < 0) { g = lead.length; lead.push(d); }
          grp.push(g);
        }
        const accs = lead.map(() => [0, 0, 0, 0]);
        for (let q = 0; q < M; q++) for (let p2 = 0; p2 < M; p2++) {
          const u = -R + 2 * R * p2 / (M - 1), v = -R + 2 * R * q / (M - 1), wx = X + nX * u, wy = Y + nY * u;
          for (const A of accs) A.fill(0);
          for (let hi = 0; hi < here.length; hi++) {
            const { m, L, a, G, pzc, J } = here[hi], acc = accs[grp[hi]];
            const rx = wx - m.b.x0, ry = wy - m.b.y0, pz0 = rx * m.b.dx + ry * m.b.dy;
            // a mate from its start (a micron back, for rounding) to its end; but where it ends and this one runs on,
            // or starts where this one ends, the light has passed from one to the other (and would be counted
            // twice). A segment's own, all of it
            if (m !== sg && (pz0 < -1e-3 || pz0 > m.b.len + 1e-3 || (pz0 > m.b.len - 1e-3 && t < b.len - 1e-3) || (pz0 < 1e-3 && t > 1e-3))) continue;
            const f = volCutAt(L, G, -rx * m.b.dy + ry * m.b.dx, v, J), ph = -L.k * (clamp(pz0, 0, m.b.len) - pzc), c = Math.cos(ph), sn = Math.sin(ph);
            acc[0] += a * (f[0] * c - f[1] * sn); acc[1] += a * (f[0] * sn + f[1] * c);
            acc[2] += a * (f[2] * c - f[3] * sn); acc[3] += a * (f[2] * sn + f[3] * c);
          }
          let val = 0; for (const acc of accs) val += acc[0] * acc[0] + acc[1] * acc[1] + acc[2] * acc[2] + acc[3] * acc[3];
          I[(j * M + q) * M + p2] = val; if (val > pk) pk = val;
        }
        return;
      }
      if (!two) {
        const c = leg.cutC(t), x = c.x, n = x.length;
        let top = 0; for (let i = 0; i < n; i++) top = Math.max(top, c.re[i] ** 2 + c.im[i] ** 2);
        let edge = 0; for (let i = 0; i < n; i++) if (c.re[i] ** 2 + c.im[i] ** 2 > 1e-6 * top) edge = i;
        const R = Math.min(c.half, Math.max(x[Math.min(n - 1, edge + 1)], 1e-6) * 1.05);
        rmax[j] = R;
        let i0 = 0;
        for (let m = 0; m < M; m++) {
          const r = R * (m / (M - 1)) ** 2;
          while (i0 < n - 2 && x[i0 + 1] < r) i0++;
          let v;
          if (r <= x[0]) v = c.re[0] ** 2 + c.im[0] ** 2;
          else if (r >= x[n - 1]) v = 0;
          else { const f = (r - x[i0]) / (x[i0 + 1] - x[i0]), a = c.re[i0] ** 2 + c.im[i0] ** 2, bq = c.re[i0 + 1] ** 2 + c.im[i0 + 1] ** 2; v = a + (bq - a) * f; }
          v *= Pw; I[j * M + m] = v; if (v > pk) pk = v;
        }
        return;
      }
      const F = field2Propagate(Fd, t), N = F.N, dx = F.ax.d, dy = F.ay.d, G = new Float64Array(N * N);
      let top = 0; for (let o = 0; o < N * N; o++) { G[o] = field2I(F, o); if (G[o] > top) top = G[o]; }
      let ex = 0;
      for (let jj = 0; jj < N; jj++) for (let i = 0; i < N; i++) if (G[jj * N + i] > 1e-5 * top) ex = Math.max(ex, Math.abs(i - N / 2) * dx, Math.abs(jj - N / 2) * dy);
      const R = Math.max(1e-6, Math.min((N / 2 - 1) * Math.min(dx, dy) * 2, ex * 1.05 + Math.max(dx, dy)));
      rmax[j] = R;
      for (let q = 0; q < M; q++) for (let p = 0; p < M; p++) {
        const u = -R + 2 * R * p / (M - 1), v = -R + 2 * R * q / (M - 1), fx = u / dx + N / 2, fy = v / dy + N / 2, ix = Math.floor(fx), iy = Math.floor(fy);
        let val = 0;
        if (ix >= 0 && iy >= 0 && ix < N - 1 && iy < N - 1) {
          const ax = fx - ix, ay = fy - iy, o = iy * N + ix;
          val = (G[o] * (1 - ax) + G[o + 1] * ax) * (1 - ay) + (G[o + N] * (1 - ax) + G[o + N + 1] * ax) * ay;
        }
        val *= Pw; I[(j * M + q) * M + p] = val; if (val > pk) pk = val;
      }
    });
    if (!(pk > 0) && !ranges) continue;          // (a share's dark cuts still go back, to be stitched)
    const hl = Math.hypot(e[0], e[1]), n = hl > 1e-9 ? [-e[1] / hl, e[0] / hl] : [-b.dy, b.dx];
    out.push({ i: sg.i, two, coh, launch: sg.coh, M, ts, rmax, I, peak: pk, ta: ts[0], tb: ts[ts.length - 1], o: [b.x0, b.y0, z0], e, n, ...(ranges ? { ranges } : {}) });
  }
  return ranges0(only) ? { segs: out, peak: 0 } : volMerge(out);
}
const ranges0 = only => only instanceof Map;
/* a pooled job's shares put back together: each segment's cuts from whichever share worked them out */
export function volStitch(list) {
  const by = new Map(), out = [];
  for (const v of list) {
    if (!v.ranges) { out.push(v); continue; }
    const w = by.get(v.i);
    if (!w) { by.set(v.i, v); out.push(v); continue; }
    const per = v.two ? v.M * v.M : v.M;
    for (const [j0, j1] of v.ranges) {
      for (let j = j0; j < j1; j++) w.rmax[j] = v.rmax[j];
      w.I.set(v.I.subarray(j0 * per, j1 * per), j0 * per);
    }
    w.peak = Math.max(w.peak, v.peak);
  }
  for (const v of out) delete v.ranges;
  return out;
}
/* Volumes of light running the same way along the same line, cut the same: an unpolarised beam's
   halves (two launches), added as the separate light they are; mates of one launch, each holding
   the same summed field of them all, kept once */
/* the irradiance the 3D colours run up to: the brightest but for the brightest 3% of the light's
   length, so a fibre's face or a tight focus (micrometres long, and orders of magnitude brighter)
   shows in the top colour rather than leaving the rest of the beam at the bottom of the scale */
export function volDisp(V) {
  if (V.disp) return V.disp;
  const pts = [];
  for (const s of V.segs) {
    const per = s.two ? s.M * s.M : s.M, n = s.ts.length;
    for (let j = 0; j < n; j++) {
      let m = 0; for (let q = j * per; q < (j + 1) * per; q++) if (s.I[q] > m) m = s.I[q];
      const w = 0.5 * ((s.ts[Math.min(n - 1, j + 1)] - s.ts[j]) + (s.ts[j] - s.ts[Math.max(0, j - 1)]));
      if (m > 0 && w > 0) pts.push([m, w]);
    }
  }
  pts.sort((a, b) => b[0] - a[0]);
  const tot = pts.reduce((a, p) => a + p[1], 0);
  let acc = 0, d = V.peak;
  for (const [m, w] of pts) { acc += w; if (acc >= 0.03 * tot) { d = m; break; } }
  return (V.disp = Math.min(V.peak, Math.max(d, V.peak * 1e-9)));
}
export function volMerge(list) {
  const out = [], byK = new Map();
  let peak = 0;
  for (const v of list) {
    if (!(v.peak > 0)) continue;
    const k = [v.two, v.M, ...v.o, ...v.e, ...v.ts, ...v.rmax].map(q => typeof q === 'number' ? q.toPrecision(7) : q).join(), same = byK.get(k);
    if (same && v.coh && same.coh && same.launch === v.launch) continue;
    if (same) { let m = 0; for (let q = 0; q < v.I.length; q++) { same.I[q] += v.I[q]; if (same.I[q] > m) m = same.I[q]; } same.peak = m; peak = Math.max(peak, m); continue; }
    byK.set(k, v); out.push(v); peak = Math.max(peak, v.peak);
  }
  return { segs: out, peak };
}
/* the segments of a tab shared among n workers, the heaviest first to whichever has least so far:
   a map (a 2D field, or light that interferes) counts twenty round profiles */
export function volShare(segs, tab, n, bb) {
  const mates = volPartners(segs, tab), load = new Array(n).fill(0), parts = Array.from({ length: n }, () => new Map());
  // a segment's cuts, in runs: a heavy one (its cuts maps) split so no share waits on it alone
  const chunks = [];
  for (const sg of segs) {
    if (!sg.b || (tab && sg.b.bench !== tab)) continue;
    const two = sg.eng === '2d' || mates.has(sg), C = volCuts(sg, bb, two, mates.has(sg));
    if (!C) continue;
    const nc = C.ts.length, per = two ? 20 : 1, k = two ? Math.min(n, nc) : 1, step = Math.ceil(nc / k);
    for (let j0 = 0; j0 < nc; j0 += step) chunks.push({ i: sg.i, r: [j0, Math.min(nc, j0 + step)], c: per * (Math.min(nc, j0 + step) - j0) });
  }
  chunks.sort((a, b) => b.c - a.c || a.i - b.i || a.r[0] - b.r[0]);
  for (const q of chunks) {
    let k = 0; for (let j = 1; j < n; j++) if (load[j] < load[k]) k = j;
    load[k] += q.c;
    if (!parts[k].has(q.i)) parts[k].set(q.i, []);
    parts[k].get(q.i).push(q.r);
  }
  return parts;
}
/* Along a line of sight through a volume segment (origin ro, unit direction rd, in its frame: x across, y
   up, z along), as the 3D view's shader marches it: the irradiance added up along it (W/mm²·mm = W/mm,
   what its colour shows: side-on through a round beam's middle, its power per mm across it), and the
   brightest irradiance it meets (W/mm²) and how far along. Each step's irradiance is taken at its
   middle. lim, if given, is the box and the two surfaces the segment runs between, as the shader has
   them: { za, zb, pl: [[nx, ny, nz, w], …] } (a point is in where n·p + w ≥ 0) */
export function volRay(s, ro, rd, lim) {
  const nc = s.ts.length, M = s.M, Rm = Math.max(...s.rmax), za = lim ? lim.za : s.ta, zb = lim ? lim.zb : s.tb;
  let sN = 0, sF = Infinity;
  for (const [o, d, lo, hi] of [[ro[0], rd[0], -Rm, Rm], [ro[1], rd[1], -Rm, Rm], [ro[2], rd[2], za, zb]]) {
    if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return null; continue; }
    const a = (lo - o) / d, b = (hi - o) / d;
    sN = Math.max(sN, Math.min(a, b)); sF = Math.min(sF, Math.max(a, b));
  }
  for (const P of (lim && lim.pl) || []) {
    const dn = P[0] * rd[0] + P[1] * rd[1] + P[2] * rd[2];
    if (Math.abs(dn) < 1e-12) continue;
    const tc = -(P[0] * ro[0] + P[1] * ro[1] + P[2] * ro[2] + P[3]) / dn;
    if (dn > 0) sN = Math.max(sN, tc); else sF = Math.min(sF, tc);
  }
  if (!(sF > sN)) return null;
  const side = Math.sqrt(Math.max(1 - rd[2] * rd[2], 1e-6)), along = Math.max(Math.abs(rd[2]), 1e-6), minStep = (sF - sN) / 4000;
  // the cuts either side of t, how far between them, the larger reach and their gap
  const cut = t => {
    t = clamp(t, s.ta, s.tb);
    let lo = 0, hi = nc - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s.ts[m] <= t) lo = m; else hi = m; }
    return { lo, hi, f: s.ts[hi] > s.ts[lo] ? clamp((t - s.ts[lo]) / (s.ts[hi] - s.ts[lo]), 0, 1) : 0, rm: Math.max(s.rmax[lo], s.rmax[hi]), gap: Math.max(s.ts[hi] - s.ts[lo], 1e-6) };
  };
  const at1 = (j, x, y) => {
    const rj = s.rmax[j], qj = s.two ? Math.max(Math.abs(x), Math.abs(y)) / rj : Math.hypot(x, y) / rj;
    if (qj > 1) return 0;
    if (!s.two) { const g = Math.sqrt(qj) * (M - 1), i = Math.min(M - 2, Math.floor(g)), a = g - i; return s.I[j * M + i] * (1 - a) + s.I[j * M + i + 1] * a; }
    const gx = (x / rj * 0.5 + 0.5) * (M - 1), gy = (y / rj * 0.5 + 0.5) * (M - 1), i = Math.min(M - 2, Math.floor(gx)), k = Math.min(M - 2, Math.floor(gy)), a = gx - i, b = gy - k, o = (j * M + k) * M + i;
    return (s.I[o] * (1 - a) + s.I[o + 1] * a) * (1 - b) + (s.I[o + M] * (1 - a) + s.I[o + M + 1] * a) * b;
  };
  const Iat = p => { const c = cut(p[2]); return at1(c.lo, p[0], p[1]) * (1 - c.f) + at1(c.hi, p[0], p[1]) * c.f; };
  let best = 0, at = null, L = 0;
  for (let sp = sN, it = 0; sp < sF && it < 4000; it++) {
    const x = ro[0] + rd[0] * sp, y = ro[1] + rd[1] * sp, c = cut(ro[2] + rd[2] * sp);
    const q = s.two ? Math.max(Math.abs(x), Math.abs(y)) / c.rm : Math.hypot(x, y) / c.rm;
    if (q > 1) { sp += Math.max(Math.min((q - 1) * c.rm * 0.6 / side, c.gap / along), minStep); continue; }
    const ds = Math.min(Math.max(Math.max(Math.min(s.rmax[c.lo], s.rmax[c.hi]), 0.25 * c.rm) * 0.06 / side, minStep), c.gap * 0.25 / along, sF - sp);
    const m = sp + ds / 2, v = Iat([ro[0] + rd[0] * m, ro[1] + rd[1] * m, ro[2] + rd[2] * m]);
    L += v * ds;
    if (v > best) { best = v; at = m; }
    sp += ds;
  }
  return best > 0 ? { I: best, s: at, L } : null;
}
/* the light added up along a line of sight that the 3D colours run up to (W/mm): each cut's, seen
   side-on through the beam's axis (the most that comes of one beam but along it), the brightest but for
   the brightest 3% of the light's length, as volDisp does for irradiance */
export function volDispLine(V) {
  if (V.dispL) return V.dispL;
  const pts = [];
  for (const s of V.segs) {
    const M = s.M, n = s.ts.length;
    for (let j = 0; j < n; j++) {
      const rm = s.rmax[j];
      let m = 0;
      if (!s.two) {
        // the profile at r = (i/(M − 1))² rm, both sides of the axis
        for (let i = 0; i < M - 1; i++) { const r0 = (i / (M - 1)) ** 2 * rm, r1 = ((i + 1) / (M - 1)) ** 2 * rm; m += (s.I[j * M + i] + s.I[j * M + i + 1]) * (r1 - r0); }
      } else {
        // across the map's middle, row and column, the larger
        const c = (M - 1) / 2, k0 = Math.floor(c), k1 = Math.ceil(c), h = 2 * rm / (M - 1);
        let a = 0, b = 0;
        for (let i = 0; i < M; i++) {
          const w = i === 0 || i === M - 1 ? 0.5 : 1;
          a += w * h * 0.5 * (s.I[(j * M + k0) * M + i] + s.I[(j * M + k1) * M + i]);
          b += w * h * 0.5 * (s.I[(j * M + i) * M + k0] + s.I[(j * M + i) * M + k1]);
        }
        m = Math.max(a, b);
      }
      const w = 0.5 * ((s.ts[Math.min(n - 1, j + 1)] - s.ts[j]) + (s.ts[j] - s.ts[Math.max(0, j - 1)]));
      if (m > 0 && w > 0) pts.push([m, w]);
    }
  }
  if (!pts.length) return (V.dispL = 0);
  pts.sort((a, b) => b[0] - a[0]);
  const tot = pts.reduce((a, p) => a + p[1], 0);
  let acc = 0, d = pts[0][0];
  for (const [m, w] of pts) { acc += w; if (acc >= 0.03 * tot) { d = m; break; } }
  return (V.dispL = Math.max(d, pts[0][0] * 1e-9));
}

/* The field at one world point, for the checks: every Gaussian source's tree, as the
   close-up would show it */
const fieldPointCache = { key: '', R: null };
export function fieldAtPoint(X, Y) {
  const srcs = allSources().filter(e => e.gauss);
  const key = popKeyOf(lastTrace.beams, srcs);
  if (fieldPointCache.key !== key) { fieldPointCache.key = key; fieldPointCache.R = popRun(lastTrace.beams, srcs); }
  const parts = closeupPrep(fieldPointCache.R.segs, X, Y, 1e-3);
  return closeupAt(parts, X, Y);
}
/* The close-up's caption numbers for a square view span mm across, centred on (X, Y) */
export function closeupInfoAt(X, Y, span) {
  const srcs = allSources().filter(e => e.gauss);
  const key = popKeyOf(lastTrace.beams, srcs);
  if (fieldPointCache.key !== key) { fieldPointCache.key = key; fieldPointCache.R = popRun(lastTrace.beams, srcs); }
  return closeupImage(fieldPointCache.R.segs, { cx: X, cy: Y, s: 240 / span, W: 240, H: 240, tab: project.tab }, 2, false).info;
}
/* Intensities along a line, prepared once for the whole of it */
export function fieldAlongLine(x0, y0, x1, y1, n) {
  const srcs = allSources().filter(e => e.gauss);
  const key = popKeyOf(lastTrace.beams, srcs);
  if (fieldPointCache.key !== key) { fieldPointCache.key = key; fieldPointCache.R = popRun(lastTrace.beams, srcs); }
  const parts = closeupPrep(fieldPointCache.R.segs, 0.5 * (x0 + x1), 0.5 * (y0 + y1), 0.5 * Math.hypot(x1 - x0, y1 - y0) + 1e-4);
  const out = [];
  for (let i = 0; i <= n; i++) out.push(closeupAt(parts, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n).I);
  return out;
}

/* Where to cut a segment into slices: evenly along it, and evenly in Gouy phase so a
   focus gets as many slices as the long legs either side of it */
function popTimes(F0, len, n) {
  const ts = [];
  const nu = Math.max(2, Math.round(n / 2)), ng = Math.max(2, n - nu);
  for (let k = 0; k <= nu; k++) ts.push(len * k / nu);
  const a0 = Math.atan(F0.z / F0.zR), a1 = Math.atan((F0.z + len) / F0.zR);
  for (let k = 1; k < ng; k++) ts.push(F0.zR * Math.tan(a0 + (a1 - a0) * k / ng) - F0.z);
  // the waist itself, where the width turns round
  if (-F0.z > 0 && -F0.z < len) ts.push(-F0.z);
  ts.sort((a, b) => a - b);
  // samples closer than this are one: a part of the length, or of the Rayleigh range when that is
  // shorter (a long leg from a tight focus keeps the samples that show its first few microns)
  const gap = Math.min(len * 1e-4, 0.05 * Math.max(1e-12, F0.zR));
  const base = ts.filter((t, i) => t >= 0 && t <= len && (i === 0 || t - ts[i - 1] > gap));
  // Between those, the width may still change a long way: past a tight focus the Gouy samples
  // all fall within a few Rayleigh ranges and the even ones are far apart, so the cone just
  // before and after the waist was drawn as one thin slice then a sudden full one. Extra
  // samples go in wherever the width would change by more than WSTEP, spaced evenly in its
  // logarithm on the same side of the waist, as a spreading beam's width grows.
  const WSTEP = 1.15, EXTRA = 96, zR = Math.max(1e-12, F0.zR);
  const wOf = t => Math.sqrt(1 + ((F0.z + t) / zR) ** 2);
  const out = [base[0]];
  let extra = 0;
  for (let i = 1; i < base.length; i++) {
    const a = base[i - 1], b = base[i], ua = (F0.z + a) / zR, ub = (F0.z + b) / zR;
    const r = wOf(b) / wOf(a), ratio = r > 1 ? r : 1 / r;
    if (ratio > WSTEP && ua * ub > 0 && extra < EXTRA) {
      const m = Math.min(EXTRA - extra, Math.ceil(Math.log(ratio) / Math.log(WSTEP)) - 1);
      // evenly in log width: w = sqrt(1 + u^2), so u steps geometrically in sqrt(w^2 - 1)
      const la = Math.log(wOf(a)), lb = Math.log(wOf(b)), sg = Math.sign(ua);
      for (let k = 1; k <= m; k++) {
        const w = Math.exp(la + (lb - la) * k / (m + 1)), u = sg * Math.sqrt(Math.max(0, w * w - 1));
        const t = u * zR - F0.z;
        if (t > out[out.length - 1] && t < b) out.push(t);
      }
      extra += m;
    }
    out.push(b);
  }
  return out;
}

export function popSlices(items, perIn) {
  const per = perIn || clamp(Math.floor(POP_SLICES / Math.max(1, items.length)), 6, 48);
  const per2 = Math.min(per, 32);
  const SUB = 4;                                   // drawn columns per slice gap
  const probe = mkCanvas(1, 1).getContext('2d');
  for (const item of items) {
    const sg = item.lead, grouped = item.members.length > 1;
    const Fp = sg.eng === '2d' ? { z: sg.F0.ax.z, zR: sg.F0.ax.zR } : sg.F0;
    const ts = popTimes(Fp, sg.b.len, sg.eng === '2d' ? per2 : per);
    probe.fillStyle = sg.b.colour;
    const hex = probe.fillStyle;                    // the browser hands back #rrggbb
    const cr = parseInt(hex.slice(1, 3), 16), cg = parseInt(hex.slice(3, 5), 16), cb = parseInt(hex.slice(5, 7), 16);
    const log = fieldDec(lightOf().scale);
    // each slice as a column of normalised values over y / Y, where Y is its drawn half-width;
    // a round field is a radial profile, a 2D one the cut through the bench plane
    const cols = [], Ys = [], gains = [], cuts = [];
    for (const t of ts) {
      const { x, I, sym, w, half, gain } = grouped ? popGroupCut(item, t) : sg.leg.cut(t);
      gains.push(grouped ? gain : 1);
      const n = x.length;
      let Imax = 0, tot = 0;
      const wt = i => sym ? I[i] * x[i] : I[i];          // area of a ring, or length of a sample
      for (let i = 0; i < n; i++) { if (I[i] > Imax) Imax = I[i]; tot += wt(i); }
      // half-width to draw: out to where 99.5% of the power is, with a margin, found
      // between samples so the drawn outline moves smoothly along the beam
      let X99 = half;
      if (sym) {
        let acc = 0;
        for (let i = 0; i < n; i++) {
          const a = acc + wt(i);
          if (a >= 0.995 * tot) { const f = (0.995 * tot - acc) / (wt(i) || 1); X99 = (i ? x[i - 1] : 0) + f * (x[i] - (i ? x[i - 1] : 0)); break; }
          acc = a;
        }
      } else {
        const c = n / 2;
        let acc = I[c];
        for (let m = 1; m < c; m++) {
          const add = I[c - m] + I[c + m];
          if (acc + add >= 0.995 * tot) { X99 = (m - 1 + (0.995 * tot - acc) / (add || 1)) * (x[1] - x[0]); break; }
          acc += add;
        }
      }
      Ys.push(Math.min(half, 1.3 * Math.max(X99, w)));
      cuts.push({ x, I, sym, n, Imax });
    }
    // The drawn width, steadied along the beam: each slice as wide as the widest of its near
    // neighbours. Light that fills its own grid (what went round a lens) is drawn to the grid's
    // edge, and the grid's size steps along the beam: the outline stepped with it.
    const Yraw = Ys.slice();
    for (let c = 0; c < Ys.length; c++) for (let d = -2; d <= 2; d++) { const k = c + d; if (k >= 0 && k < Yraw.length) Ys[c] = Math.max(Ys[c], Yraw[k]); }
    for (let c = 0; c < cuts.length; c++) {
      const { x, I, sym, n, Imax } = cuts[c], Y = Ys[c];
      const col = new Float32Array(POP_ROWS);
      for (let row = 0; row < POP_ROWS; row++) {
        // rows run from -Y (the right of the beam) to +Y (its left)
        const u = (row + 0.5) / POP_ROWS * 2 - 1, yy = u * Y, y = sym ? Math.abs(yy) : yy, hw = Y / POP_ROWS;
        let v = 0;
        if (y <= x[0]) v = sym ? I[0] : 0;
        else if (y < x[n - 1]) {
          let lo = 0, hi = n - 1;
          while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (x[mid] <= y) lo = mid; else hi = mid; }
          // several samples to the row (fringes finer than it): their mean, as the eye would see them;
          // else the field between the two nearest
          let i0 = lo, i1 = hi;
          while (i0 > 0 && x[i0 - 1] >= y - hw) i0--;
          while (i1 < n - 1 && x[i1 + 1] <= y + hw) i1++;
          if (i1 - i0 >= 3) { let a = 0; for (let i = i0; i <= i1; i++) a += I[i]; v = a / (i1 - i0 + 1); }
          else v = I[lo] + (I[hi] - I[lo]) * (y - x[lo]) / (x[hi] - x[lo]);
        }
        v = Imax > 0 ? v / Imax : 0;
        // the outer fifth fades to nothing, so light that reaches the edge of what is drawn ends softly
        const au = Math.abs(u);
        if (au > 0.8) v *= 0.5 * (1 + Math.cos(Math.PI * (au - 0.8) / 0.2));
        col[row] = log ? (v > 0 ? Math.max(0, 1 + Math.log10(Math.max(v, 1e-12)) / log) : 0) : v;
      }
      cols.push(col);
    }
    // blend between slices in normalised radius, so the drawn width changes smoothly
    const dts = [], dYs = [], dcols = [], dgs = [];
    for (let c = 0; c < ts.length; c++) {
      const k = c < ts.length - 1 ? SUB : 1;
      for (let s = 0; s < k; s++) {
        const u = s / SUB, c2 = Math.min(c + 1, ts.length - 1);
        dts.push(ts[c] + (ts[c2] - ts[c]) * u);
        dYs.push(Ys[c] + (Ys[c2] - Ys[c]) * u);
        dgs.push(gains[c] + (gains[c2] - gains[c]) * u);
        const col = new Float32Array(POP_ROWS);
        for (let row = 0; row < POP_ROWS; row++) col[row] = cols[c][row] * (1 - u) + cols[c2][row] * u;
        dcols.push(col);
      }
    }
    // each column three pixels wide, drawn from its middle one, so smoothing never
    // reaches into the next column and the seams between them do not show
    const img = new ImageData(3 * dts.length, POP_ROWS);
    dcols.forEach((col, c) => {
      for (let row = 0; row < POP_ROWS; row++) {
        for (let k = 0; k < 3; k++) {
          const o = (row * 3 * dts.length + 3 * c + k) * 4;
          img.data[o] = cr; img.data[o + 1] = cg; img.data[o + 2] = cb;
          img.data[o + 3] = Math.round(255 * col[row] * clamp(dgs[c], 0.03, 1));
        }
      }
    });
    const cv = mkCanvas(3 * dts.length, POP_ROWS);
    cv.getContext('2d').putImageData(img, 0, 0);
    // each branch as bright as the power it carries, so round trips fade as they leak
    // a lone branch as bright as the power it carries; a group column by column, from
    // the power its fields add up to, so a dark port is dark
    // as bright as the light it carries: one pass's share, times what a cavity built it up by
    sg.draw = { ts: dts, Ys: dYs, cv, alpha: grouped ? 1 : clamp((sg.b.w || 1) * (sg.boost || 1), 0.04, 1), members: item.members.length };
  }
}

