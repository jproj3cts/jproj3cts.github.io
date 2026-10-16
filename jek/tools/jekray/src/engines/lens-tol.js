import { surfaceParts } from './lens-design.js';
import { cloneP, meritTerms } from './lens-opt.js';

/* ==========================================================================
   Tolerancing a lens design: how much worse it gets as it is made
   The design as solved is the nominal lens; each tolerance is a change made to it as a maker
   might make it, with nothing re-solved but the compensator:
     a surface's radius, by N fringes at 632.8 nm over its clear aperture: its sag at its clear
       radius changes by N λ / 2 (more curved for N > 0);
     a surface's irregularity, by N fringes peak to valley: a fourth-order form error with no sag at
       its clear radius, a (r⁴ − h² r²) with a h⁴ / 4 = N λ / 2 (off unless turned on);
     a thickness or air gap, by ± mm;
     a lens decentred across the axis (x and y) by ± mm, or tilted about its first vertex (about x
       and about y) by ± arcminutes: its surfaces traced in their own moved frames;
     a lens surface's wedge: the surface alone tilted about its own vertex, about x and about y, by ±
       arcminutes (off unless turned on), so its lens's faces are no longer square to one axis;
     a glass's index by ± Δn, and its Abbe number by ± per cent (its dispersion about the d line
       divided by 1 + δ).
   The criterion is the merit function's image term (the RMS spot, or the RMS wavefront error, over
   every field and wavelength); the compensator, unless turned off, refocuses the image plane to the
   best criterion (the spot's square is exactly quadratic in the focus, so three trials find it).
   Sensitivity takes each tolerance alone at its two limits; Monte Carlo sets them all at random
   (uniform within the limits, or normal with the limit at two standard deviations, cut there),
   seeded, trial by trial, and gives the spread of the criterion over the builds.
   ========================================================================== */
const LAMBDA_TEST = 632.8e-6, ARCMIN = Math.PI / 180 / 60;

/* the tolerances the settings give for this prescription: each { kind, i (surface or gap or part), axis, lim, label } */
export function tolOps(P, T) {
  const sps = surfaceParts(P), ops = [], N = P.surfaces.length;
  if (T.rad.on && T.rad.v > 0) P.surfaces.forEach((s, i) => { if (sps[i].kind === 'lens' || sps[i].kind === 'mirror') ops.push({ kind: 'rad', i, lim: T.rad.v, label: 'Radius of surface ' + (i + 1) }); });
  if (T.irr && T.irr.on && T.irr.v > 0) P.surfaces.forEach((s, i) => { if (sps[i].kind === 'lens') ops.push({ kind: 'irr', i, lim: T.irr.v, label: 'Irregularity of surface ' + (i + 1) }); });
  if (T.wedge && T.wedge.on && T.wedge.v > 0) P.surfaces.forEach((s, i) => { if (sps[i].kind === 'lens') for (const axis of ['x', 'y']) ops.push({ kind: 'wedge', i, axis, lim: T.wedge.v, label: 'Wedge about ' + axis + ' of surface ' + (i + 1) }); });
  if (T.thk.on && T.thk.v > 0) for (let i = 0; i < N - 1; i++) ops.push({ kind: 'thk', i, lim: T.thk.v, label: (sps[i].pi === sps[i + 1].pi ? 'Thickness' : 'Air gap') + ' after surface ' + (i + 1) });
  P.parts.forEach((p, pi) => {
    if (p.kind === 'stop') return;
    const first = sps.findIndex(s => s.pi === pi), name = p.kind === 'mirror' ? 'mirror, surface ' + (first + 1) : 'lens on surfaces ' + (first + 1) + '–' + (first + p.n);
    if (T.dec.on && T.dec.v > 0) for (const axis of ['x', 'y']) ops.push({ kind: 'dec', i: pi, axis, lim: T.dec.v, label: 'Decentre in ' + axis + ' of the ' + name });
    if (T.tilt.on && T.tilt.v > 0) for (const axis of ['x', 'y']) ops.push({ kind: 'tilt', i: pi, axis, lim: T.tilt.v, label: 'Tilt about ' + axis + ' of the ' + name });
  });
  for (let i = 0; i < N - 1; i++) {
    if (sps[i].pi !== sps[i + 1].pi || sps[i].kind === 'stop') continue;
    if (T.ind.on && T.ind.v > 0) ops.push({ kind: 'ind', i, lim: T.ind.v, label: 'Index of the glass after surface ' + (i + 1) });
    if (T.abbe.on && T.abbe.v > 0) ops.push({ kind: 'abbe', i, lim: T.abbe.v, label: 'Abbe number of the glass after surface ' + (i + 1) });
  }
  return ops;
}

/* the prescription as built: each tolerance at its value (vals[k] for ops[k], 0 for none) */
export function perturb(P0, ops, vals) {
  const P = cloneP(P0), sps = surfaceParts(P0), moves = new Map();
  ops.forEach((o, k) => {
    const v = vals[k];
    if (!v) return;
    if (o.kind === 'rad') {
      // the sphere whose sag at the clear radius is N λ / 2 more: a sphere of sag s at h has c = 2s / (s² + h²)
      const s = P.surfaces[o.i], h = isFinite(s.semi) && s.semi > 0 ? s.semi : 10, c0 = s.R ? 1 / s.R : 0;
      const s0 = c0 ? c0 * h * h / (1 + Math.sqrt(Math.max(0, 1 - c0 * c0 * h * h))) : 0, s1 = s0 + Math.sign(c0 || 1) * v * LAMBDA_TEST / 2, c = 2 * s1 / (s1 * s1 + h * h);
      s.R = Math.abs(c) < 1e-14 ? null : 1 / c;
    } else if (o.kind === 'irr') {
      // a fourth-order form error with no sag at the clear radius: a (r⁴ − h² r²), its peak to valley a h⁴ / 4 = N λ / 2
      const s = P.surfaces[o.i], h = isFinite(s.semi) && s.semi > 0 ? s.semi : 10, a = 2 * v * LAMBDA_TEST / (h * h * h * h);
      const A = (s.A || []).slice(); if (!A.length) A.push(0);
      A[0] += a; s.A = A; s.a2 = (s.a2 || 0) - a * h * h;
    } else if (o.kind === 'thk') P.gaps[o.i] = Math.max(0, P.gaps[o.i] + v);
    else if (o.kind === 'ind') P.materials[o.i] = Object.assign({}, P.materials[o.i], { dn: (P.materials[o.i].dn || 0) + v });
    else if (o.kind === 'wedge') {
      // the surface turned about its own vertex (its place on the axis as it was): before any move of its whole lens, which carries it round
      const s = P.surfaces[o.i], t = (s.tilt || [0, 0]).slice();
      t[o.axis === 'x' ? 0 : 1] += v * ARCMIN;
      P.surfaces[o.i] = Object.assign({}, s, { tilt: t });
    } else if (o.kind === 'abbe') P.materials[o.i] = Object.assign({}, P.materials[o.i], { dv: (P.materials[o.i].dv || 0) + v / 100 });
    else {
      const m = moves.get(o.i) || { dx: 0, dy: 0, ax: 0, ay: 0 };
      if (o.kind === 'dec') m[o.axis === 'x' ? 'dx' : 'dy'] += v; else m[o.axis === 'x' ? 'ax' : 'ay'] += v * ARCMIN;
      moves.set(o.i, m);
    }
  });
  if (moves.size) {
    // each moved lens: tilted about its first vertex (its later surfaces carried round with it), then shifted across
    const z = [0]; for (const g of P.gaps) z.push(z[z.length - 1] + g);
    for (const [pi, m] of moves) {
      const idx = sps.map((s, i) => s.pi === pi ? i : -1).filter(i => i >= 0), z0 = z[idx[0]];
      const cx = Math.cos(m.ax), sx = Math.sin(m.ax), cy = Math.cos(m.ay), sy = Math.sin(m.ay);
      for (const i of idx) {
        const s = P.surfaces[i], dd = z[i] - z0, t = s.tilt || [0, 0], dc = s.dec || [0, 0, 0];
        // a mirror's face turned, its fold (and the parts after it) as designed
        const tl = s.mirror ? { dtilt: [(s.dtilt || [0, 0])[0] + m.ax, (s.dtilt || [0, 0])[1] + m.ay] } : { tilt: [t[0] + m.ax, t[1] + m.ay] };
        P.surfaces[i] = Object.assign({}, s, tl, { dec: [dc[0] + m.dx + dd * sy, dc[1] + m.dy + dd * sx * cy, (dc[2] || 0) + dd * (cx * cy - 1)] });
      }
    }
  }
  return P;
}

/* the criterion: the merit's image term, its square root (in the active configuration, the one on the bench) */
function criterion(prob, P) {
  const T = meritTerms(prob.design.mc ? Object.assign({}, prob, { design: Object.assign({}, prob.design, { mc: null }) }) : prob, P);
  let s = 0;
  for (let q = 0; q < T.nImage; q++) s += T.r[q] * T.r[q];
  return Math.sqrt(s);
}
/* the criterion's terms (the image term's residuals), as criterion() sums them */
function residuals(prob, P) {
  const T = meritTerms(prob.design.mc ? Object.assign({}, prob, { design: Object.assign({}, prob.design, { mc: null }) }) : prob, P);
  return T.r.slice(0, T.nImage);
}
/* the compensators this prescription has (settings naming a gap, lens or axis it lacks are passed over) */
export function compsFor(P, comps) {
  if (!comps || !comps.length) return [];
  const sps = surfaceParts(P);
  return comps.filter(c => c.kind === 'gap' ? c.i >= 0 && c.i < P.gaps.length && sps[c.i] && sps[c.i + 1] && sps[c.i].pi !== sps[c.i + 1].pi
    : P.parts[c.i] && P.parts[c.i].kind !== 'stop');
}
/* the prescription with the compensators moved by c (gaps in mm, decentres in mm, tilts in arcminutes) and the image by dz */
function withComps(P, comps, c, dz) {
  let Q = cloneP(P);
  const ops = [], vals = [];
  comps.forEach((m, j) => { if (m.kind === 'gap') Q.gaps[m.i] = Math.max(0, Q.gaps[m.i] + c[j]); else { ops.push({ kind: m.kind, i: m.i, axis: m.axis }); vals.push(c[j]); } });
  if (ops.length) Q = perturb(Q, ops, vals);
  Q.image = P.image + dz;
  return Q;
}
/* The criterion with the compensators set as well as they can be: the image refocused (if comp), and each
   compensator in comps moved within its range. With none but the focus, the focus alone (below); with others,
   damped least squares on the criterion's own terms, from where the build is, a few steps, each compensator held
   within its range: { crit, dz, cv (the compensators' settings) } */
export function compensated(prob, P, comp, comps) {
  const C = compsFor(P, comps);
  if (C.length) return compensatedMany(prob, P, comp, C);
  if (!comp) return { crit: criterion(prob, P), dz: 0 };
  const img = P.image, at = dz => { P.image = img + dz; return criterion(prob, P); };
  // the spot's square is a parabola in the focus: through three points, then once more about its bottom
  let c0 = at(0), best = { crit: c0, dz: 0 }, centre = 0, h = 0.05;
  for (let pass = 0; pass < 2; pass++) {
    const fm = at(centre - h) ** 2, f0 = (pass ? at(centre) : c0) ** 2, fp = at(centre + h) ** 2, den = fm - 2 * f0 + fp;
    if (!(den > 0)) break;
    const dz = centre + h * (fm - fp) / (2 * den), c = at(dz);
    if (isFinite(c) && c < best.crit) best = { crit: c, dz };
    centre = best.dz; h = Math.max(h / 10, 1e-4);
  }
  P.image = img + best.dz;
  return best;
}

const COMP_STEP = { gap: 1e-4, dec: 1e-4, tilt: 0.01 };
function compensatedMany(prob, P, comp, C) {
  const n = C.length + (comp ? 1 : 0), lo = [], hi = [], step = [];
  if (comp) { lo.push(-Infinity); hi.push(Infinity); step.push(1e-4); }
  for (const m of C) { lo.push(-m.range); hi.push(m.range); step.push(COMP_STEP[m.kind]); }
  const split = x => ({ dz: comp ? x[0] : 0, c: comp ? x.slice(1) : x });
  const res = x => { const { dz, c } = split(x); return residuals(prob, withComps(P, C, c, dz)); };
  const ss = r => r.reduce((a, v) => a + (isFinite(v) ? v * v : 1e6), 0);
  let x = new Array(n).fill(0), r = res(x), f = ss(r), lambda = 1e-3;
  for (let it = 0; it < 12; it++) {
    const J = [];
    for (let j = 0; j < n; j++) { const xh = x.slice(); xh[j] += step[j]; const rh = res(xh); J.push(rh.map((v, q) => (v - r[q]) / step[j])); }
    const A = new Float64Array(n * n), g = new Float64Array(n);
    for (let a = 0; a < n; a++) { for (let b = 0; b < n; b++) { let t = 0; for (let q = 0; q < r.length; q++) t += J[a][q] * J[b][q]; A[a * n + b] = t; } let t = 0; for (let q = 0; q < r.length; q++) t += J[a][q] * r[q]; g[a] = -t; }
    let took = false;
    for (let tries = 0; tries < 8 && !took; tries++) {
      const M = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => A[a * n + b] + (a === b ? lambda * (A[a * n + a] || 1e-12) + 1e-18 : 0)));
      const d = gaussSolve(M, Array.from(g));
      if (d) {
        const xn = x.map((v, j) => Math.min(hi[j], Math.max(lo[j], v + d[j]))), rn = res(xn), fn = ss(rn);
        if (fn < f) { took = (f - fn) > 1e-12 * f; x = xn; r = rn; f = fn; lambda = Math.max(1e-9, lambda / 3); break; }
      }
      lambda *= 4;
    }
    if (!took) break;
  }
  const { dz, c } = split(x);
  P.image = P.image + dz;
  return { crit: Math.sqrt(f), dz, cv: c };
}
function gaussSolve(M, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
    if (Math.abs(M[p][i]) < 1e-300) return null;
    [M[i], M[p]] = [M[p], M[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let k = i + 1; k < n; k++) { const f = M[k][i] / M[i][i]; for (let j = i; j < n; j++) M[k][j] -= f * M[i][j]; b[k] -= f * b[i]; }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) { let t = b[i]; for (let j = i + 1; j < n; j++) t -= M[i][j] * x[j]; x[i] = t / M[i][i]; }
  return x;
}

/* ---------- Sensitivity ---------- */
export function tolSensitivity(prob, T, from, to) {
  const ops = tolOps(prob.P, T), nom = compensated(prob, cloneP(prob.P), T.comp, T.comps), rows = [];
  for (let k = from || 0; k < Math.min(ops.length, to === undefined ? ops.length : to); k++) {
    const r = [];
    for (const s of [-1, 1]) { const vals = ops.map((_, j) => j === k ? s * ops[k].lim : 0); r.push(compensated(prob, perturb(prob.P, ops, vals), T.comp, T.comps)); }
    rows.push({ k, label: ops[k].label, kind: ops[k].kind, lim: ops[k].lim, minus: r[0].crit - nom.crit, plus: r[1].crit - nom.crit, dzMinus: r[0].dz, dzPlus: r[1].dz });
  }
  return Object.assign({ nominal: nom.crit, nominalDz: nom.dz, count: ops.length, rows }, nom.cv ? { nominalCv: nom.cv } : {});
}
/* the criterion expected over the builds from the sensitivities, each tolerance's effect on the
   criterion's square added (a uniform tolerance's mean square is a third of its limit's, a normal
   one cut at two deviations about a quarter) */
export function rssEstimate(nominal, rows, dist) {
  const f = dist === 'normal' ? 0.25 : 1 / 3;
  let add = 0;
  for (const r of rows) add += f * (((nominal + r.minus) ** 2 - nominal ** 2) + ((nominal + r.plus) ** 2 - nominal ** 2)) / 2;
  return Math.sqrt(Math.max(0, nominal * nominal + add));
}

/* ---------- Inverse sensitivity ----------
   For each tolerance alone, the limit at which the criterion (refocused, as set) is worse than nominal by the
   worsening allowed (T.inv: a share of the nominal, by: 'pct', or an amount in the criterion's units, by: 'abs'),
   the worse of its two signs counted. Found by doubling or halving from the limit set until the worsening is
   bracketed, then by halving the bracket in the logarithm of the limit to a part in a hundred. A tolerance that
   does not worsen the criterion that much within a thousand times its limit is reported as at least that. A thickness or
   gap past its own size has closed on its − side (marked): only its + side changes the criterion beyond that. */
export const INV_MAX = 1000;
export const invTarget = (T, nominal) => (T.inv && T.inv.by === 'abs' ? T.inv.v : nominal * ((T.inv ? T.inv.v : 10) / 100));
export function tolInverse(prob, T, from, to) {
  const ops = tolOps(prob.P, T), nom = compensated(prob, cloneP(prob.P), T.comp, T.comps), target = invTarget(T, nom.crit), rows = [];
  const worse = (k, v) => { let w = -Infinity; for (const s of [-1, 1]) { const vals = ops.map((_, j) => j === k ? s * v : 0), c = compensated(prob, perturb(prob.P, ops, vals), T.comp, T.comps).crit; w = Math.max(w, isFinite(c) ? c - nom.crit : Infinity); } return w; };
  for (let k = from || 0; k < Math.min(ops.length, to === undefined ? ops.length : to); k++) {
    const o = ops[k];
    // a thickness or gap can't go below nothing: past its own size its − side has closed and no longer changes (its + side still does)
    const top = INV_MAX * o.lim, gap = o.kind === 'thk' ? prob.P.gaps[o.i] : Infinity;
    let lo = 0, hi = null, v = o.lim, f = worse(k, v);
    // bracket: lo worsens less than allowed, hi at least as much
    if (f < target) { lo = v; while (v < top) { v = Math.min(2 * v, top); f = worse(k, v); if (f >= target) { hi = v; break; } lo = v; } }
    else { hi = v; while (v > 1e-6 * o.lim) { v /= 2; f = worse(k, v); if (f < target) { lo = v; break; } hi = v; } }
    if (hi === null) { rows.push(Object.assign({ k, label: o.label, kind: o.kind, lim: o.lim, inv: top, beyond: true }, top > gap ? { closes: true } : {})); continue; }
    if (!(lo > 0)) { rows.push({ k, label: o.label, kind: o.kind, lim: o.lim, inv: hi, below: true }); continue; }
    for (let it = 0; it < 12 && hi / lo > 1.01; it++) { const m = Math.sqrt(lo * hi); if (worse(k, m) >= target) hi = m; else lo = m; }
    rows.push(Object.assign({ k, label: o.label, kind: o.kind, lim: o.lim, inv: lo }, lo > gap ? { closes: true } : {}));
  }
  return { nominal: nom.crit, target, count: ops.length, rows };
}

/* ---------- Monte Carlo ---------- */
function tolRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* trials from..to-1: each its own seed, so the result does not depend on how the run is cut up */
export function tolMonteCarlo(prob, T, from, to) {
  const ops = tolOps(prob.P, T), out = [];
  for (let j = from; j < to; j++) {
    const R = tolRng(T.seed * 1000003 + j * 7919 + 1);
    const vals = ops.map(o => {
      if (T.dist === 'normal') { let g; do { g = Math.sqrt(-2 * Math.log(R() + 1e-15)) * Math.cos(2 * Math.PI * R()); } while (Math.abs(g) > 2); return g * o.lim / 2; }
      return (2 * R() - 1) * o.lim;
    });
    const c = compensated(prob, perturb(prob.P, ops, vals), T.comp, T.comps);
    out.push(Object.assign({ j, crit: c.crit, dz: c.dz }, c.cv ? { cv: c.cv } : {}));
  }
  return out;
}
/* the spread over the builds: mean, deviation, and the criterion this share of them are at least as good as */
export function mcStats(crits) {
  const s = crits.filter(isFinite).slice().sort((a, b) => a - b), n = s.length;
  if (!n) return null;
  const mean = s.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const at = p => s[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))];
  return { n, mean, sd, best: s[0], worst: s[n - 1], p50: at(0.5), p80: at(0.8), p90: at(0.9), p98: at(0.98) };
}

/* a batch, for the worker or the page */
export function tolRun(prob, args) {
  const T = prob.design.tol;
  if (args.mode === 'sens') return tolSensitivity(prob, T, args.from, args.to);
  if (args.mode === 'inv') return tolInverse(prob, T, args.from, args.to);
  return { trials: tolMonteCarlo(prob, T, args.from, args.to) };
}
