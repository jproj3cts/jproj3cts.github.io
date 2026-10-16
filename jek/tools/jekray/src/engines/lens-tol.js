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
    else if (o.kind === 'abbe') P.materials[o.i] = Object.assign({}, P.materials[o.i], { dv: (P.materials[o.i].dv || 0) + v / 100 });
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
/* the criterion with the image refocused (or not): { crit, dz } */
export function compensated(prob, P, comp) {
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

/* ---------- Sensitivity ---------- */
export function tolSensitivity(prob, T, from, to) {
  const ops = tolOps(prob.P, T), nom = compensated(prob, cloneP(prob.P), T.comp), rows = [];
  for (let k = from || 0; k < Math.min(ops.length, to === undefined ? ops.length : to); k++) {
    const r = [];
    for (const s of [-1, 1]) { const vals = ops.map((_, j) => j === k ? s * ops[k].lim : 0); r.push(compensated(prob, perturb(prob.P, ops, vals), T.comp)); }
    rows.push({ k, label: ops[k].label, kind: ops[k].kind, lim: ops[k].lim, minus: r[0].crit - nom.crit, plus: r[1].crit - nom.crit, dzMinus: r[0].dz, dzPlus: r[1].dz });
  }
  return { nominal: nom.crit, nominalDz: nom.dz, count: ops.length, rows };
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
    const c = compensated(prob, perturb(prob.P, ops, vals), T.comp);
    out.push({ j, crit: c.crit, dz: c.dz });
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
  return { trials: tolMonteCarlo(prob, T, args.from, args.to) };
}
