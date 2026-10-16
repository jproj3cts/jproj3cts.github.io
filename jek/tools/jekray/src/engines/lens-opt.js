import { lensSystem, pupilRings, rayAt, seidel, traceField } from './lens-engine.js';
import { asphGet, asphSet, cfgApply, cfgCond, designEpd, designOf, objOpts, editable, getV, mcOf, posOf, setV, primaryNm, solveDesign, surfSag, surfaceParts } from './lens-design.js';
import { glassInfo, glassSearch } from '../core/glass.js';
import { mtfAt, paraxHeight } from './lens-analysis.js';

/* ==========================================================================
   Optimising a lens design: its merit function, damped least squares and a global search
   The merit function is a sum of squares, each term a residual:
     the image: for every field, wavelength and pupil point (rings at Gauss-Legendre radii, each
       with arms), weighted by the field's and the wavelength's weights and the point's quadrature
       weight, the ray's miss on the image plane, x and y, from the field's centroid over all the
       wavelengths (or from the primary wavelength's chief ray), or its wavefront error in waves less
       its mean; together these weigh 1, so their part of the merit is the RMS spot radius (mm), or
       the RMS wavefront error (waves);
     operands: a value (focal length, F-number, total track, distortion, a Seidel sum) less its
       target, times the square root of its weight;
     boundaries every design keeps to, each counted only when broken: glass at least (and at most)
       so thick at the centre and so thick at its edge, air gaps at least so wide, centre and edge.
   The merit is the square root of the sum of squares over the image's weight and the operands'.
   Rays are traced through the surfaces whatever their clear radii (the lenses are sized to the
   light afterwards); a ray that cannot be traced at all counts as a large miss.

   The variables are the values marked V: a radius (worked in its curvature, so it may pass through
   flat), a thickness, a conic, and a model glass's nd and Vd. Each step changes them, works the
   solves and pickups out again, and measures the merit; the Jacobian is by finite differences.
   Damped least squares (Levenberg-Marquardt) takes the step (JᵀJ + λ diag JᵀJ) δ = -Jᵀr, shortened if
   it would take any variable further than its reach (which shrinks while steps fail), λ cut when a step helps and raised when it does not. The global search starts it again and again from the best
   design yet, shaken, and keeps what is better.
   ========================================================================== */
export const isModel = m => !!(m && m.glass === 'Model' && isFinite(m.nd) && isFinite(m.vd));
const LOST = 1;                                     // a ray lost counts as this far off (mm), or this many waves
const BOUND_W = 10;                                 // a boundary broken counts as ten times its overshoot (mm)
const ND = [1.4, 2.05], VD = [17, 95];

/* what the optimiser needs, as plain data (it goes to the background worker) */
export function optProblem(asm, P) {
  designOf(asm);
  return JSON.parse(JSON.stringify({ P: { surfaces: P.surfaces, gaps: P.gaps, materials: P.materials, stopIndex: P.stopIndex, parts: P.parts, image: P.image, origin: P.origin, dir: P.dir },
    cond: asm.cond, design: asm.design }));
}
export const cloneP = P => ({ surfaces: P.surfaces.map(s => Object.assign({}, s)), gaps: P.gaps.slice(), materials: P.materials.map(m => Object.assign({}, m)),
  stopIndex: P.stopIndex, parts: P.parts, image: P.image, origin: P.origin, dir: P.dir });

/* the variables: each key marked V that is free (not solved, not picked up); a model glass is two;
   a key the configurations each have their own value of is one in each configuration (cfg, its index) */
export function optVars(prob) {
  const { P, design: D } = prob, out = [], M = mcOf(D);
  for (const k of D.vars) {
    if (D.solves[k] || D.pickups[k]) continue;
    const at = posOf(P, k);
    if (!at || !editable(P, at.q, at.i)) continue;
    if (at.q === 'g') { if (isModel(P.materials[at.i])) out.push({ k, at, part: 'nd' }, { k, at, part: 'vd' }); }
    else if (M && M.keys.includes(k)) M.configs.forEach((c, cfg) => out.push({ k, at, cfg }));
    else out.push({ k, at });
  }
  return out;
}
/* configuration ci's prescription before solving: the shared values with its own */
function cfgP(prob, ci) { const P = cloneP(prob.P); cfgApply(P, prob.design.mc, ci); return P; }
const xOf = (prob, v) => getX(v.cfg === undefined ? prob.P : cfgP(prob, v.cfg), v);
/* an aspheric coefficient is varied as the sag it adds at the surface's clear radius (mm), A h^n:
   the raw coefficients (1e-6, 1e-9, …) are far too unlike each other for the steps to be */
const asphH = (P, i) => { const h = P.surfaces[i].semi; return isFinite(h) && h > 0 ? h : 10; };
function getX(P, v) {
  if (v.at.q === 'R') { const R = P.surfaces[v.at.i].R; return R ? 1 / R : 0; }
  if (v.at.q[0] === 'a') { const n = +v.at.q.slice(1); return asphGet(P.surfaces[v.at.i], n) * Math.pow(asphH(P, v.at.i), n); }
  if (v.at.q === 'g') return P.materials[v.at.i][v.part];
  return getV(P, v.at);
}
function setX(P, v, x) {
  const i = v.at.i;
  if (v.at.q === 'R') P.surfaces[i].R = Math.abs(x) < 1e-12 ? null : 1 / x;
  else if (v.at.q === 'k') P.surfaces[i].k = x;
  else if (v.at.q[0] === 'a') { const n = +v.at.q.slice(1); asphSet(P.surfaces[i], n, x / Math.pow(asphH(P, i), n)); }
  else if (v.at.q === 'T' || v.at.q === 'D') setV(P, v.at, x);
  else if (v.at.q === 'g') P.materials[i] = Object.assign({}, P.materials[i], { [v.part]: v.part === 'nd' ? Math.min(ND[1], Math.max(ND[0], x)) : Math.min(VD[1], Math.max(VD[0], x)) });
  else if (v.at.image) P.image = x;
  else P.gaps[i] = Math.max(0, x);
}
const STEP = { R: 1e-7, t: 1e-5, k: 1e-5, nd: 1e-6, vd: 1e-4, a: 1e-6, T: 1e-4, D: 1e-5 };
const stepOf = v => STEP[v.part || (v.at.q[0] === 'a' ? 'a' : v.at.q)];
const reach = (v, x) => { const q = v.part || v.at.q; return q === 'R' ? Math.max(Math.abs(x) / 6, 2e-3) : q === 't' ? Math.max(0.3 * Math.abs(x), 0.2) : q === 'k' ? 0.5 : q[0] === 'a' ? Math.max(Math.abs(x) / 3, 0.01) : q === 'T' ? 1 : q === 'D' ? 0.2 : q === 'nd' ? 0.02 : 3; };

/* the design with values x: solved, then measured. With configurations, each one is solved with its own
   values and object; the active one is returned, the others with it (P.cfgs, every one in order) */
function designAt(prob, V, x) {
  const P = cloneP(prob.P), M = mcOf(prob.design);
  V.forEach((v, j) => { if (v.cfg === undefined) setX(P, v, x[j]); });
  if (!M) { solveDesign(prob, P); return P; }
  const img = prob.design.image;
  const Ps = M.configs.map((cfg, ci) => {
    const Pc = cloneP(P);
    cfgApply(Pc, M, ci);
    V.forEach((v, j) => { if (v.cfg === ci) setX(Pc, v, x[j]); });
    solveDesign({ cond: cfgCond(prob.cond, cfg), design: prob.design }, Pc);
    return Pc;
  });
  prob.design.image = img;
  const A = Ps[M.active];
  A.cfgs = Ps;
  return A;
}

/* ---------- The merit function ----------
   With configurations: each one's terms (its image, the operands set for it or for every
   configuration, its boundaries), each scaled by the square root of its share of the weights, so the
   merit is the weighted mean of theirs */
export function meritTerms(prob, P, detail) {
  const MC = mcOf(prob.design), Ms = prob.design.merit;
  if (!MC) return meritOne(prob.cond, Ms, Ms.ops, P, detail);
  const Ps = P.cfgs || MC.configs.map((cfg, ci) => { const Pc = cfgP(prob, ci); solveDesign({ cond: cfgCond(prob.cond, cfg), design: prob.design }, Pc); return Pc; });
  const Wc = MC.configs.reduce((a, c) => a + c.w, 0) || 1;
  const out = { r: [], ss: 0, Wt: 0, nImage: 0, fields: [], ops: [], bounds: 0, epd: 0 };
  MC.configs.forEach((cfg, ci) => {
    const ops = Ms.ops.map((o, j) => [o, j]).filter(([o]) => o.c === undefined || o.c === ci), sh = cfg.w / Wc, sq = Math.sqrt(sh);
    const dt = detail ? [] : null, T = meritOne(cfgCond(prob.cond, cfg), Ms, ops.map(([o]) => o), Ps[ci], dt);
    for (const v of T.r) out.r.push(sq * v);
    out.ss += sh * T.ss; out.Wt += sh * T.Wt; out.nImage += T.nImage; out.bounds += sh * T.bounds;
    if (ci === MC.active) out.epd = T.epd;
    T.fields.forEach(f => out.fields.push(Object.assign(f, { part: sh * f.part, cfg: ci })));
    T.ops.forEach((o, q) => out.ops.push(Object.assign(o, { part: sh * o.part, cfg: ci, j: ops[q][1] })));
    if (detail && dt) for (const b of dt) detail.push(Object.assign(b, { what: MC.configs[ci].name + ': ' + b.what }));
  });
  out.Wt = out.Wt || 1;
  if (!isFinite(out.ss)) out.ss = Infinity;
  out.merit = Math.sqrt(out.ss / out.Wt);
  return out;
}
function meritOne(c, M, mops, P, detail) {
  const nm0 = primaryNm(c);
  const S0 = lensSystem(P, nm0, objOpts(c)), epd = designEpd(c, S0), opts = objOpts(c, { epd, image: P.image });
  const Sw = c.waves.map(w => w.nm === nm0 ? lensSystem(P, nm0, opts) : lensSystem(P, w.nm, opts)), Sp = Sw[c.primary];
  const pts = pupilRings(M.rings, M.arms), Wf = c.fields.reduce((a, f) => a + f.w, 0) || 1, Ww = c.waves.reduce((a, w) => a + w.w, 0) || 1;
  const r = [], fields = [];
  const R = new Float64Array(8);
  for (const f of c.fields) {
    const th = f.deg * Math.PI / 180, wf = f.w / Wf;
    let sq = 0, wsum = 0;
    if (M.crit === 'wfe') {
      c.waves.forEach((w, wi) => {
        const ww = wf * w.w / Ww, F = traceField(Sw[wi], f.deg, pts, true);
        let m = 0, mw = 0;
        if (F) F.rays.forEach((ry, q) => { if (!ry.lost) { m += pts[q][2] * ry.opd; mw += pts[q][2]; } });
        m = mw ? m / mw : 0;
        pts.forEach((p, q) => {
          const ry = F && F.rays[q], e = ry && !ry.lost && isFinite(ry.opd) ? ry.opd - m : LOST, s = Math.sqrt(ww * p[2]);
          r.push(s * e); sq += ww * p[2] * e * e; wsum += ww * p[2];
        });
      });
    } else {
      // every wavelength's rays, then the reference: their weighted centroid, or the primary chief ray
      const hits = [];
      c.waves.forEach((w, wi) => {
        const ww = wf * w.w / Ww;
        for (const p of pts) {
          const ry = rayAt(Sw[wi], th, p[0], p[1], R, true), ok = ry && ry[7] === 0 && isFinite(ry[0]) && isFinite(ry[1]);
          hits.push({ w: ww * p[2], x: ok ? ry[0] : NaN, y: ok ? ry[1] : NaN });
        }
      });
      let cx = 0, cy = 0;
      if (M.crit === 'chief') { const C = rayAt(Sp, th, 0, 0, R, true); if (C && C[7] === 0) { cx = C[0]; cy = C[1]; } }
      else { let W = 0; for (const h of hits) if (isFinite(h.x)) { cx += h.w * h.x; cy += h.w * h.y; W += h.w; } if (W) { cx /= W; cy /= W; } }
      for (const h of hits) {
        const s = Math.sqrt(h.w), dx = isFinite(h.x) ? h.x - cx : LOST, dy = isFinite(h.y) ? h.y - cy : LOST;
        r.push(s * dx, s * dy); sq += h.w * (dx * dx + dy * dy); wsum += h.w;
      }
    }
    if (detail) fields.push({ deg: f.deg, rms: Math.sqrt(sq / (wsum || 1)), part: sq });
  }
  const nImage = r.length;
  // the operands
  const ops = [];
  let sd = null;
  for (const o of mops) {
    let v;
    if (o.op === 'EFL') v = S0.par.efl;
    else if (o.op === 'FNO') v = Math.abs(S0.par.uEp) > 0 ? 1 / (epd * Math.abs(S0.par.uEp)) : 1e3;
    else if (o.op === 'TTL') v = P.gaps.reduce((a, b) => a + b, 0) + P.image;
    else if (o.op === 'DIST') {
      const fm = Math.max(...c.fields.map(f => Math.abs(f.deg))), th = fm * Math.PI / 180, C = rayAt(Sp, th, 0, 0, R, true), yp = paraxHeight(Sp, fm);
      v = C && C[7] === 0 && yp ? 100 * (C[1] - yp) / yp : 0;
    } else if (o.op === 'BFL') v = S0.par.bfl;
    else if (o.op === 'IMD') v = S0.par.back;
    else if (o.op === 'MAG') v = S0.par.mag || 0;
    else if (o.op === 'NA') v = Math.abs(Sp.n[Sp.N] * Sp.epr * Sp.par.uEp);
    else if (o.op === 'XPD') v = Sp.imageZ - Sp.par.xpz;                       // the exit pupil before the image (positive)
    else if (o.op === 'IMH' || o.op === 'CRA' || o.op === 'RAYY') {
      // a real ray at one of the fields (the last one asked for beyond the list): the chief ray, or the ray through (0, p) of the pupil
      const f = c.fields[Math.min(o.f === undefined ? c.fields.length - 1 : o.f, c.fields.length - 1)], th = f.deg * Math.PI / 180;
      const Q = rayAt(Sp, th, 0, o.op === 'RAYY' ? o.p : 0, R, true);
      v = !Q || Q[7] !== 0 ? NaN : o.op === 'CRA' ? Math.atan2(Q[4], Q[5]) * 180 / Math.PI : Q[1];
    } else if (o.op === 'MTFT' || o.op === 'MTFS' || o.op === 'MTFA') {
      // the diffraction MTF at a frequency and field: tangential, sagittal, or their mean
      const f = c.fields[Math.min(o.f === undefined ? c.fields.length - 1 : o.f, c.fields.length - 1)];
      const ws = c.waves.map(w => w.w), na = Math.abs(Sp.n[Sp.N] * Sp.epr * Sp.par.uEp), fw = na > 0 ? 1 / (2 * na) : Infinity;
      const t = o.op !== 'MTFS' ? mtfAt(Sw, ws, fw, f.deg, o.v, 'T', 32) : 0, sg = o.op !== 'MTFT' ? mtfAt(Sw, ws, fw, f.deg, o.v, 'S', 32) : 0;
      v = o.op === 'MTFT' ? t : o.op === 'MTFS' ? sg : (t + sg) / 2;
    } else {
      if (!sd) { const nms = c.waves.map(w => w.nm), lo = nms.indexOf(Math.min(...nms)), hi = nms.indexOf(Math.max(...nms)); sd = seidel(Sp, Math.max(...c.fields.map(f => Math.abs(f.deg))), lo !== hi ? Sw[lo] : null, lo !== hi ? Sw[hi] : null).sum; }
      v = sd[o.op];
    }
    const e = isFinite(v) ? v - o.target : 1e3;
    r.push(Math.sqrt(o.weight) * e);
    ops.push({ op: o.op, value: v, target: o.target, weight: o.weight, part: o.weight * e * e, f: o.f, p: o.p, v: o.v });
  }
  // the boundaries, counted only where broken
  const B = M.bounds, sps = surfaceParts(P), N = P.surfaces.length;
  let bsq = 0;
  // always a term each (0 while kept), so the residuals keep their number from one step to the next
  const broke = (over, what) => { const e = over > 0 ? BOUND_W * over : 0; r.push(e); bsq += e * e; if (e && detail) detail.push({ what, over }); };
  for (let i = 0; i < N - 1; i++) {
    const a = P.surfaces[i], b = P.surfaces[i + 1], t = P.gaps[i], inside = sps[i].pi === sps[i + 1].pi;
    const hs = [a.semi, b.semi].filter(h => h > 0 && isFinite(h)), h = hs.length ? Math.min(...hs) : 0;
    const edge = t + surfSag(b, h) - surfSag(a, h);
    if (inside && sps[i].kind !== 'stop') {
      broke(B.glassMin - t, 'the glass after surface ' + (i + 1) + ' is thinner than ' + B.glassMin + ' mm');
      if (B.glassMax > 0) broke(t - B.glassMax, 'the glass after surface ' + (i + 1) + ' is thicker than ' + B.glassMax + ' mm');
      broke(B.edgeMin - (isFinite(edge) ? edge : -1), 'the glass after surface ' + (i + 1) + ' is thinner than ' + B.edgeMin + ' mm at its edge');
    } else if (!inside && sps[i].kind !== 'stop' && sps[i + 1].kind !== 'stop') {
      // air between two lenses (a stop may sit against a lens)
      broke(B.airMin - t, 'the air after surface ' + (i + 1) + ' is narrower than ' + B.airMin + ' mm');
      broke(B.airMin - (isFinite(edge) ? edge : -1), 'the air after surface ' + (i + 1) + ' is narrower than ' + B.airMin + ' mm at the edge');
    }
  }
  // each lens surface's aspheric terms: their sag from the conic (the departure) and its slope, over the clear radius
  if (B.aspMax > 0 || B.slopeMax > 0) {
    for (let i = 0; i < N; i++) {
      if (sps[i].kind !== 'lens') continue;
      const A = P.surfaces[i].A || [], h = P.surfaces[i].semi > 0 && isFinite(P.surfaces[i].semi) ? P.surfaces[i].semi : 10;
      let dep = 0, slope = 0;
      if (A.some(a => a)) for (let q = 1; q <= 24; q++) {
        const r = h * q / 24;
        let d = 0, ds = 0, p = r * r * r;
        A.forEach((a, j) => { d += a * p * r; ds += (4 + 2 * j) * a * p; p *= r * r; });
        dep = Math.max(dep, Math.abs(d)); slope = Math.max(slope, Math.atan(Math.abs(ds)) * 180 / Math.PI);
      }
      // counted against the limit itself, so a limit of a few micrometres holds as well as one of a millimetre
      if (B.aspMax > 0) broke((dep - B.aspMax) / Math.min(B.aspMax, 1), 'surface ' + (i + 1) + '’s aspheric departure is more than ' + B.aspMax + ' mm');
      if (B.slopeMax > 0) broke((slope - B.slopeMax) / 10, 'surface ' + (i + 1) + '’s aspheric departure is steeper than ' + B.slopeMax + '°');
    }
  }
  // a model glass kept on the glass map: within reach of a real glass
  for (const m of P.materials) if (isModel(m)) { const g = nearestGlass(m.nd, m.vd, true); broke(0.02 * (g.d - GLASS_REACH), 'a model glass (nd ' + (+m.nd.toFixed(4)) + ', Vd ' + (+m.vd.toFixed(2)) + ') is far from any real glass'); }
  const Wt = 1 + mops.reduce((a, o) => a + o.weight, 0);
  let ss = 0;
  for (const v of r) ss += v * v;
  if (!isFinite(ss)) ss = Infinity;
  return { r, ss, Wt, merit: Math.sqrt(ss / Wt), nImage, fields, ops, bounds: bsq, epd };
}

/* what the merit is made of, for the Merit tab: each term's value and its share */
export function meritReport(prob) {
  const P = designAt(prob, [], []);
  const broken = [], T = meritTerms(prob, P, broken), tot = T.ss || 1;
  return { merit: T.merit, crit: prob.design.merit.crit, fields: T.fields.map(f => ({ deg: f.deg, rms: f.rms, share: f.part / tot, cfg: f.cfg })),
    ops: T.ops.map(o => ({ op: o.op, value: o.value, target: o.target, weight: o.weight, share: o.part / tot, f: o.f, p: o.p, v: o.v, cfg: o.cfg, j: o.j })), bounds: { share: T.bounds / tot, broken },
    configs: mcOf(prob.design) ? prob.design.mc.configs.map(c => c.name) : null };
}

/* ---------- Damped least squares ---------- */
function solveSym(A, b, n) {
  // Cholesky; null if A is not positive definite
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i * n + j];
    for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
    if (i === j) { if (!(s > 0)) return null; L[i * n + i] = Math.sqrt(s); } else L[i * n + j] = s / L[j * n + j];
  }
  const y = new Float64Array(n), x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return x;
}
function evalAt(prob, V, x) { const P = designAt(prob, V, x), T = meritTerms(prob, P); return T; }
export function dls(prob, V, x0, iters, lambda0) {
  let x = Float64Array.from(x0), T = evalAt(prob, V, x), lambda = lambda0 || 1e-3, it = 0, done = false, still = 0, trust = 1;
  const n = V.length;
  if (!n) return { x, ss: T.ss, Wt: T.Wt, lambda, iters: 0, done: true };
  for (; it < iters && !done; it++) {
    const m = T.r.length, J = [];
    for (let j = 0; j < n; j++) {
      const xh = Float64Array.from(x), h = stepOf(V[j]);
      xh[j] += h;
      const Th = evalAt(prob, V, xh);
      const col = new Float64Array(m);
      for (let q = 0; q < m; q++) col[q] = (Th.r[q] - T.r[q]) / h;
      J.push(col);
    }
    const A = new Float64Array(n * n), g = new Float64Array(n);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b <= a; b++) { let s = 0; const ca = J[a], cb = J[b]; for (let q = 0; q < m; q++) s += ca[q] * cb[q]; A[a * n + b] = A[b * n + a] = s; }
      let s = 0; for (let q = 0; q < m; q++) s += J[a][q] * T.r[q]; g[a] = -s;
    }
    let took = false, capped = false;
    for (let tries = 0; tries < 10; tries++) {
      const Ad = Float64Array.from(A);
      // a variable that does nothing yet (an interface between two like glasses) still gets a little damping, so the step exists
      let dmax = 0; for (let a = 0; a < n; a++) dmax = Math.max(dmax, A[a * n + a]);
      for (let a = 0; a < n; a++) Ad[a * n + a] += lambda * Math.max(A[a * n + a], 1e-6 * dmax) + 1e-12 * dmax + 1e-300;
      const d = solveSym(Ad, g, n);
      if (d) {
        // no step longer than each variable's reach: a sixth of a radius's curvature, 30% of a thickness, a conic by 0.5, a glass by 0.02 in nd and 3 in Vd
        let sc = 1;
        for (let a = 0; a < n; a++) { const lim = trust * reach(V[a], x[a]); if (Math.abs(d[a]) * sc > lim) sc = lim / Math.abs(d[a]); }
        capped = sc < 1;
        if (capped) for (let a = 0; a < n; a++) d[a] *= sc;
        const xn = Float64Array.from(x);
        for (let a = 0; a < n; a++) xn[a] += d[a];
        const Tn = evalAt(prob, V, xn);
        if (Tn.ss < T.ss) {
          const gain = (T.ss - Tn.ss) / T.ss;
          x = xn; T = Tn; lambda = Math.max(1e-9, lambda / 3); took = true; trust = Math.min(1, trust * 2);
          still = gain < 1e-7 && !capped ? still + 1 : 0;
          if (still >= 2) done = true;
          break;
        }
      }
      lambda = Math.min(1e9, lambda * 4); trust *= 0.25;
    }
    if (!took) done = true;
  }
  return { x, ss: T.ss, Wt: T.Wt, lambda, iters: it, done };
}

/* ---------- Global search ----------
   From the best design yet, each trial shakes every variable (radii by about 30% of their
   curvature, thicknesses by about 30%, conics by 0.3, a model glass along both its nd and Vd), then
   damped least squares takes it to its own minimum; the best is kept. Seeded, so a run repeats. */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = R => Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R());
export function globalSearch(prob, V, best, trials, seed) {
  const R = rng(seed || 1);
  let out = { x: Float64Array.from(best.x), ss: best.ss, Wt: best.Wt, tried: 0, better: 0 };
  for (let t = 0; t < trials; t++) {
    const x = Float64Array.from(out.x);
    V.forEach((v, j) => {
      const q = v.part || v.at.q, z = gauss(R);
      if (q === 'R') x[j] += 0.3 * z * Math.max(Math.abs(x[j]), 0.01);
      else if (q === 't') x[j] = Math.max(0, x[j] * Math.exp(0.3 * z));
      else if (q === 'k') x[j] += 0.3 * z;
      else if (q[0] === 'a') x[j] += 0.3 * z * Math.max(Math.abs(x[j]), 0.02);
      else if (q === 'T') x[j] += 0.5 * z;
      else if (q === 'D') x[j] += 0.1 * z;
      else if (q === 'nd') x[j] = Math.min(ND[1], Math.max(ND[0], x[j] + 0.04 * z));
      else if (q === 'vd') x[j] = Math.min(VD[1], Math.max(VD[0], x[j] + 6 * z));
    });
    const D = dls(prob, V, x, 25);
    out.tried++;
    if (D.ss < out.ss) { out = Object.assign(out, { x: D.x, ss: D.ss, Wt: D.Wt }); out.better++; }
  }
  return out;
}

/* ---------- A run, in the worker or on the page ----------
   args: mode 'dls' (iters cycles from x) or 'global' (trials from the best, x); returns the variables'
   keys and the values reached, with the merit before and after */
export function optRun(prob, args) {
  const V = optVars(prob), x0 = args.x && args.x.length === V.length ? Float64Array.from(args.x) : Float64Array.from(V.map(v => xOf(prob, v)));
  const T0 = evalAt(prob, V, x0);
  let res;
  if (args.mode === 'global') res = globalSearch(prob, V, { x: x0, ss: T0.ss, Wt: T0.Wt }, args.trials || 4, args.seed);
  else res = dls(prob, V, x0, args.iters || 10, args.lambda);
  return { vars: V.map(v => ({ k: v.k, part: v.part || null, cfg: v.cfg === undefined ? null : v.cfg })), x: Array.from(res.x), start: T0.merit, merit: Math.sqrt(res.ss / res.Wt), lambda: res.lambda, done: !!res.done,
    iters: res.iters || 0, tried: res.tried || 0, better: res.better || 0 };
}
/* the values reached, written into a prescription (P, the active configuration's) and, for a value
   each configuration has its own of, into the configurations of the design D */
export function optApply(P, prob, out, D) {
  const V = optVars(Object.assign({}, prob, { P })), M = mcOf(prob.design);
  V.forEach(v => {
    const k = out.vars.findIndex(w => w.k === v.k && (w.part || null) === (v.part || null) && (w.cfg === null || w.cfg === undefined ? undefined : w.cfg) === v.cfg);
    if (k < 0) return;
    if (v.cfg === undefined || v.cfg === M.active) { setX(P, v, out.x[k]); return; }
    // another configuration's: its value worked out in its own prescription
    const Pc = cfgP(prob, v.cfg);
    setX(Pc, v, out.x[k]);
    const cm = D && mcOf(D);
    if (cm && cm.configs[v.cfg]) cm.configs[v.cfg].v[v.k] = getV(Pc, v.at);
  });
}

/* ---------- Model glass, and the nearest real one ----------
   A model glass is its nd and Vd alone (its index from a two-term Cauchy fit through them). Its
   nearest real glass is the catalogue glass closest in (nd, Vd), 0.01 in nd counting as much as
   1 in Vd, among the glass makers' optical glasses. While optimising, a model glass is kept within
   2 of those units of a real glass (a boundary), so it stays where glasses can be made. */
export function modelOf(mat) {
  if (isModel(mat)) return mat;
  const k = mat && mat.glass, I = k && glassInfo(k);
  return { glass: 'Model', nd: I && isFinite(I.nd) ? +I.nd.toFixed(5) : 1.5168, vd: I && isFinite(I.vd) ? +I.vd.toFixed(3) : 64.17 };
}
const MAKERS = /^(Schott|Ohara|Hoya|CDGM|Sumita)$/;
let realGlasses = null;
const GLASS_REACH = 2;                              // how far (in those units) a model glass may stray from the nearest real one
export function nearestGlass(nd, vd, withDistance) {
  if (!realGlasses) realGlasses = glassSearch('').filter(([, maker]) => MAKERS.test(maker)).map(([k]) => { const I = glassInfo(k); return I && isFinite(I.nd) && isFinite(I.vd) && I.vd > 0 ? [k, I.nd, I.vd] : null; }).filter(Boolean);
  let best = null, bd = Infinity;
  for (const [k, n, v] of realGlasses) { const d = ((n - nd) / 0.01) ** 2 + (v - vd) ** 2; if (d < bd) { bd = d; best = k; } }
  return withDistance ? { k: best, d: Math.sqrt(bd) } : best;
}
