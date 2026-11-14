import { C_SI } from '../core/cells.js';
import { EPS0 } from '../core/traps.js';
import { Z0_OHM } from '../core/scatter.js';
import { hermite } from '../core/pulses.js';
import { getEl } from '../state/elements.js';
import { lastTrace } from './trace.js';
import { cavModes, cavSolved, findCavities } from './cavity.js';
import { beamFrame } from './phase-screen.js';

/* ---------- A particle inside a cavity, solved in the cavity's modes ----------
   The light a particle scatters along the cavity's axis is taken up by the cavity's modes, goes round, and comes back
   to it: again and again, built up by the cavity's finesse. Where the cavity is a stable, linear one (two legs through
   the particle, going opposite ways), unclipped, aligned and not degenerate (cavDegenerate), that is solved directly.
   The modes: Hermite-Gauss HG_mn written from the cavity's own q along its legs (cavAnalyse), each at unit power: at the
   particle the forward wave's field per root watt is phi_n = sqrt(2Z) HG_mn exp(ik r^2 / 2R), the backward one's
   phibar_n with the curvature turned round. Out to the far mirror and back each keeps its mode and takes
       rho2_n = rho2_00 exp(-i (m Psi2x + n Psi2y)),   round the whole loop  lambda_n = lambda_00 exp(-i (m Gx + n Gy)),
   Psi2 and G the Gouy phases along the way (from q), rho1_n = lambda_n / rho2_n. lambda_00 is the steady-state solve's own
   (its TEM00's Ritz value, with the lock's detuning), rho2_00 the empty cavity's backward wave against its forward one
   at the particle (both projected on HG_00 there). The particle emits into mode n, by reciprocity,
       delta f_n = (i omega / 4) conj(phi_n) . p_f,   delta b_n = (i omega / 4) conj(phibar_n) . p_b,
   p_f and p_b the dipoles that give its far field straight ahead and straight back (p = 4 pi eps F / k^2: the modes'
   far fields are milliradians across, where the particle's does not change). Carried round, that comes back as waves
   along the axis each way,
       E_f = sum_n phi_n (lambda_n delta f_n + rho1_n delta b_n) / (1 - lambda_n),
       E_b = sum_n phibar_n (rho2_n delta f_n + lambda_n delta b_n) / (1 - lambda_n),
   which drive the particle again. Its far field ahead and back is linear in what drives it: F = F0 + T x, F0 that of
   the bench's own light on it, T its response to a unit wave along the axis each way and each polarisation (four
   waves; four solves for a dipole array), x the returned waves. So x = M (F0 + T x), (I - M T) x = M F0: a 4 x 4 solve
   that holds every kept mode, round trips to all orders. The returned waves then join the bench's light on the particle
   (its far field, scattered power and extinction take them); light outside the kept modes leaves after one pass.
   Kept: HG_mn up to m + n = 12 while |HG_mn(r_p)|^2 |1 / (1 - lambda_n)|^2 is at least 1e-6 of TEM00's.
   What the cavity sends out changes with it: the forward wave leaving the particle is f0_n + (delta f_n + rho1_n
   delta b_n) / (1 - lambda_n), the backward one f... likewise. Against the empty cavity's (f0_n, b0_n, projected from
   the field run's own legs at the particle) that is a factor on each wave's power to first order; the field run
   (beam-tree.js) takes the loop's light by those factors, so a detector behind a mirror reads the loaded cavity. */
export const CAV_NMAX = 12;              // the highest mode order taken
export const CAV_KEEP = 1e-6;            // a mode kept while its coupling and build-up are this much of TEM00's
export const CAV_DEGEN_Q = 6, CAV_DEGEN_LW = 3;
const CAV_GRID = 40, CAV_SPAN = 4;       // the projection: points across, and mode radii each way

/* Degenerate: a round-trip Gouy phase (either axis) within CAV_DEGEN_LW linewidths (2 pi / finesse each) of 2 pi p / q
   for some q up to CAV_DEGEN_Q (confocal 1/2, concentric and planar 0 or 1, and the like): the cavity's transverse
   modes then share resonances, and the particle mixes them where they stand together. null if not; else why */
let cavDegenOn = true;
/* (the validation and the tests: the solve run on a cavity the test would flag, to compare it with a reference) */
export function setCavDegenCheck(on) { cavDegenOn = on !== false; }
export function cavDegenerate(c) {
  if (!c || !c.finesse) return { why: 'loss' };
  const g0 = cavDegenOn;
  const tol = CAV_DEGEN_LW * 2 * Math.PI / c.finesse;
  for (const [ax, g] of [['x', c.gouy.x], ['y', c.gouy.y]]) {
    if (g === null || g === undefined || !isFinite(g)) return { why: 'unstable', axis: ax };
    const t = ((g % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    for (let q = 1; q <= CAV_DEGEN_Q; q++) for (let p = 0; p <= q; p++) {
      const off = Math.abs(t - 2 * Math.PI * p / q);
      if (off < tol && g0) return { why: 'degenerate', axis: ax, p, q, off, tol };
    }
  }
  return null;
}
const scMul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const scDiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const scConj = a => [a[0], -a[1]];
const scExp = t => [Math.cos(t), Math.sin(t)];
const scAbs2 = a => a[0] * a[0] + a[1] * a[1];
const scDot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/* HG_m across one axis at unit power (1/sqrt(m)), w in metres */
function cavHg1(m, x, w) { let f = 1; for (let i = 2; i <= m; i++) f *= i; return Math.pow(2 / Math.PI, 0.25) / Math.sqrt(Math.pow(2, m) * f * w) * hermite(m, Math.SQRT2 * x / w) * Math.exp(-x * x / (w * w)); }
/* a reduced q ([z, zR], mm) a distance t (mm, in a medium of index n) on */
const cavQOn = (q, t, n) => [q[0] + t / n, q[1]];
const cavGouyOf = q => Math.atan2(q[0], q[1]);

/* Which cavity a particle at world point Cw (mm) is in, from the trace's beams through it (TB.parts): null if none;
   { c, why } where it is one the solve does not take (and the old one pass with its warning stands); else the plan */
export function cavityPlan(TB, Cw) {
  let cs;
  try { cs = findCavities(); } catch (err) { return null; }
  for (const c of cs) {
    const legs = [];
    c.segs.forEach((b, j) => { const q = TB.parts.find(p => p.b === b); if (q) legs.push({ j, q }); });
    if (!legs.length) continue;
    const no = why => ({ c, why });
    if (c.kind !== 'linear' || legs.length !== 2 || c.p !== 2) return no(c.kind !== 'linear' ? 'ring' : 'legs');
    if (c.M4 || c.mode.Q) return no('turned');
    if (c.axis && c.axis.miss > 1e-6) return no('misaligned');
    const dg = cavDegenerate(c);
    if (dg) return Object.assign(no(dg.why), { degen: dg });
    const along = c.mode.along;
    if (!along || along.length !== c.p) return no('unstable');
    // clipped: a mirror's edge within three of the mode's radii (its loss there under 1e-8) is a cut mode, not an HG one
    for (let j = 0; j < c.p; j++) {
      const A = along[j], ev = c.segs[(j + 1) % c.p].ev, el = ev && getEl(ev.el);
      const a = el ? 0.5 * (el.diameter || el.length || Infinity) : Infinity;
      const wE = q => Math.sqrt(c.lam0 * (q[0] * q[0] + q[1] * q[1]) / (Math.PI * q[1]));
      const w = Math.max(wE(cavQOn(A.qx, A.len, A.n)), wE(cavQOn(A.qy, A.len, A.n)));
      if (a < 3 * w) return no('clipped');
    }
    const d0 = beamFrame(legs[0].q.b).d;
    if (scDot3(beamFrame(legs[1].q.b).d, d0) > -0.999) return no('legs');
    // the light let in passes the particle first on a beam of its own (the tracer's first pass, before the loop repeats): its
    // way is the forward one (f), and the coupler it came through is on the far side of the round trip rho1
    const loopB = new Set(c.segs), entry = TB.parts.filter(q => !loopB.has(q.b) && q.coh === legs[0].q.coh && Math.abs(scDot3(beamFrame(q.b).d, d0)) > 0.999);
    if (!entry.length || entry.some(q => scDot3(beamFrame(q.b).d, beamFrame(entry[0].b).d) < 0)) return no('entry');
    const fd = beamFrame(entry[0].b).d, [lf, lb] = scDot3(beamFrame(legs[0].q.b).d, fd) > 0 ? legs : [legs[1], legs[0]];
    const F = beamFrame(lf.q.b), dir = F.d;
    // where the particle is along each leg (mm), and across: x along the forward leg's ex (in the bench plane), y along its ey
    const at = q => { const G = beamFrame(q.b), r = [Cw[0] - G.P0[0], Cw[1] - G.P0[1], Cw[2] - G.P0[2]]; return scDot3(r, G.d); };
    const r = [Cw[0] - F.P0[0], Cw[1] - F.P0[1], Cw[2] - F.P0[2]];
    const tf = at(lf.q), tb = at(lb.q), x = scDot3(r, F.ex), y = F.level ? r[2] : scDot3(r, F.ey);
    // the Gouy phases: along the loop from the particle on the forward leg to it on the backward one (Psi2), and all round (G);
    // the legs in the loop's order from the forward one on
    const ax = ['qx', 'qy'], psi2 = [0, 0], G = [0, 0], mid = [];
    for (let j = (lf.j + 1) % c.p; j !== lb.j; j = (j + 1) % c.p) mid.push(j);
    for (let a = 0; a < 2; a++) {
      for (let j = 0; j < c.p; j++) { const A = along[j], q0 = A[ax[a]]; G[a] += cavGouyOf(cavQOn(q0, A.len, A.n)) - cavGouyOf(q0); }
      const Af = along[lf.j], Ab = along[lb.j];
      psi2[a] += cavGouyOf(cavQOn(Af[ax[a]], Af.len, Af.n)) - cavGouyOf(cavQOn(Af[ax[a]], tf, Af.n));
      for (const j of mid) { const A = along[j], q0 = A[ax[a]]; psi2[a] += cavGouyOf(cavQOn(q0, A.len, A.n)) - cavGouyOf(q0); }
      psi2[a] += cavGouyOf(cavQOn(Ab[ax[a]], tb, Ab.n)) - cavGouyOf(Ab[ax[a]]);
    }
    // the optical paths: from the particle out and back the far way (rho2)
    let l2 = along[lf.j].n * (along[lf.j].len - tf) + along[lb.j].n * tb;
    for (const j of mid) l2 += along[j].n * along[j].len;
    return { c, C: Cw, legF: lf, legB: lb, entry, dir, ex: F.ex, ey: F.level ? [0, 0, 1] : F.ey, tf, tb, x, y, psi2, G, l2,
      qF: [cavQOn(along[lf.j].qx, tf, along[lf.j].n), cavQOn(along[lf.j].qy, tf, along[lf.j].n)], nLeg: along[lf.j].n };
  }
  return null;
}

/* The modes at the particle, and what the empty cavity holds in them there.
   field(q, Cw) gives a beam's own field at a world point (physicists' convention, V/m, world vector [6]).
   nm the laser's wavelength, nMed the medium's index at the particle. */
export function cavityModes(P, field, nm, nMed) {
  const { c } = P, lam0 = c.lam0, k0 = 2 * Math.PI / lam0;     // mm
  const Z = Z0_OHM / nMed, sZ = Math.sqrt(2 * Z);
  const [qx, qy] = P.qF, wOf = q => Math.sqrt(lam0 * (q[0] * q[0] + q[1] * q[1]) / (Math.PI * q[1]));
  const wx = wOf(qx), wy = wOf(qy);
  // the curvature's phase, forward: exp(i k0 r^2 z / 2 (z^2 + zR^2)) per axis (reduced q, vacuum k0)
  const cur = (x, y) => k0 * (x * x * qx[0] / (qx[0] * qx[0] + qx[1] * qx[1]) + y * y * qy[0] / (qy[0] * qy[0] + qy[1] * qy[1])) / 2;
  // the steady state: lambda_00 (the TEM00 Ritz value: the one the injected light is most in), with the lock's detuning
  const SV = cavSolved.get(c.id);
  if (!SV || !SV.res || SV.trace !== lastTrace) return { why: 'steady' };
  const md = cavModes(SV.res, c.fsr, 8);
  if (!md.length) return { why: 'steady' };
  const m0 = md.reduce((a, v) => (v.share > a.share ? v : a));
  // the field engine's fields are the physicists' conjugated: so is its round trip
  const lam00 = scConj(scMul(m0.lam, scExp(SV.delta)));
  // the empty cavity's waves at the particle, projected on the modes (lab axes: x along ex, y along ey; both legs alike)
  const e1 = P.ex, e2 = P.ey, d = P.dir, C0 = P.C;
  const N = CAV_GRID, hx = 2 * CAV_SPAN * wx / N, hy = 2 * CAV_SPAN * wy / N, dA = hx * hy * 1e-6;
  const modes = [];
  for (let s = 0; s <= CAV_NMAX; s++) for (let m = s; m >= 0; m--) modes.push({ m, n: s - m });
  // the forward wave is the forward leg's and the first pass's (the light let in, on a beam of its own); fl the leg's alone
  const nM = modes.length, f0 = modes.map(() => [[0, 0], [0, 0]]), b0 = modes.map(() => [[0, 0], [0, 0]]), fl = modes.map(() => [[0, 0], [0, 0]]);
  let Pf = 0, Pb = 0, Pl = 0;
  const two = E => [[E[0] * e1[0] + E[2] * e1[1] + E[4] * e1[2], E[1] * e1[0] + E[3] * e1[1] + E[5] * e1[2]], [E[0] * e2[0] + E[2] * e2[1] + E[4] * e2[2], E[1] * e2[0] + E[3] * e2[1] + E[5] * e2[2]]];
  const hxs = new Array(CAV_NMAX + 1), hys = new Array(CAV_NMAX + 1);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const u = -CAV_SPAN * wx + (i + 0.5) * hx, v = -CAV_SPAN * wy + (j + 0.5) * hy;
    const Cw = [0, 1, 2].map(q => C0[q] + u * e1[q] + v * e2[q]);
    const el = two(field(P.legF.q, Cw)), eb = two(field(P.legB.q, Cw)), ef = [[el[0][0], el[0][1]], [el[1][0], el[1][1]]];
    for (const q of P.entry) { const e = two(field(q, Cw)); for (let s = 0; s < 2; s++) { ef[s][0] += e[s][0]; ef[s][1] += e[s][1]; } }
    Pf += (scAbs2(ef[0]) + scAbs2(ef[1])) * dA / (2 * Z); Pb += (scAbs2(eb[0]) + scAbs2(eb[1])) * dA / (2 * Z); Pl += (scAbs2(el[0]) + scAbs2(el[1])) * dA / (2 * Z);
    const xu = (u + P.x) * 1e-3, yv = (v + P.y) * 1e-3;       // off the cavity's axis, metres
    for (let q = 0; q <= CAV_NMAX; q++) { hxs[q] = cavHg1(q, xu, wx * 1e-3); hys[q] = cavHg1(q, yv, wy * 1e-3); }
    const ph = cur(u + P.x, v + P.y), cf = scExp(-ph), cb = scExp(ph);       // conj of the forward mode's curvature, and of the backward's
    for (let k = 0; k < nM; k++) {
      const hh = hxs[modes[k].m] * hys[modes[k].n] * dA / sZ;
      for (let s = 0; s < 2; s++) {
        const a = scMul(cf, ef[s]), b = scMul(cb, eb[s]), l = scMul(cf, el[s]);
        f0[k][s][0] += hh * a[0]; f0[k][s][1] += hh * a[1]; b0[k][s][0] += hh * b[0]; b0[k][s][1] += hh * b[1]; fl[k][s][0] += hh * l[0]; fl[k][s][1] += hh * l[1];
      }
    }
  }
  // the light's own polarisation: the one TEM00 holds most of
  const sp = scAbs2(f0[0][0]) >= scAbs2(f0[0][1]) ? 0 : 1;
  if (!(scAbs2(f0[0][sp]) > 0)) return { why: 'dark' };
  const rho200 = scDiv(b0[0][sp], f0[0][sp]);
  // each mode at the particle, its round trips, and whether it is kept
  const xp = P.x * 1e-3, yp = P.y * 1e-3, cp = cur(P.x, P.y);
  const hx0 = cavHg1(0, 0, wx * 1e-3) * cavHg1(0, 0, wy * 1e-3);
  for (const M of modes) {
    const h = cavHg1(M.m, xp, wx * 1e-3) * cavHg1(M.n, yp, wy * 1e-3) * sZ;
    M.phiF = [h * Math.cos(cp), h * Math.sin(cp)]; M.phiB = [h * Math.cos(cp), -h * Math.sin(cp)];
    M.lam = scMul(lam00, scExp(-(M.m * P.G[0] + M.n * P.G[1])));
    M.rho2 = scMul(rho200, scExp(-(M.m * P.psi2[0] + M.n * P.psi2[1])));
    M.rho1 = scDiv(M.lam, M.rho2);
    const one = [1 - M.lam[0], -M.lam[1]];
    M.inv = scDiv([1, 0], one);
    M.weight = h * h / (hx0 * hx0 * 2 * Z) * scAbs2(M.inv);
  }
  const w0 = modes[0].weight;
  modes.forEach((M, k) => { M.f0 = f0[k]; M.b0 = b0[k]; M.fl = fl[k]; M.keep = M.weight >= CAV_KEEP * w0; });
  return { modes, kept: modes.filter(M => M.keep), lam00, rho200, sp, Pf, Pb, Pl, wx, wy, k0, Z, dLock: SV.delta, ritz: m0 };
}

/* The solve. K: cavityModes' answer; respond(i) the particle's far field straight ahead and straight back ([12]: +dir
   then -dir) for unit wave i (0, 1: along +dir polarised e1, e2; 2, 3: along -dir), F0 that of its own light ([12]).
   k the wavenumber in the medium (1/m), nMed. Returns the returned waves x and what the cavity sends out. */
export function cavitySolve(P, K, F0, respond, k, nMed) {
  const eps = EPS0 * nMed * nMed, pf = 4 * Math.PI * eps / (k * k), omega = k * C_SI / nMed, g = [0, omega / 4];
  const e = [P.ex, P.ey], d = P.dir;
  // the mode sums: E_f = Gff p_f + Gfb p_b, E_b = Gbf p_f + Gbb p_b (each polarisation alike)
  let Gff = [0, 0], Gfb = [0, 0], Gbf = [0, 0], Gbb = [0, 0];
  for (const M of K.kept) {
    const a = scMul(M.lam, M.inv), r1 = scMul(M.rho1, M.inv), r2 = scMul(M.rho2, M.inv);
    const ff = scMul(scMul(M.phiF, scConj(M.phiF)), a), bb = scMul(scMul(M.phiB, scConj(M.phiB)), a);
    const fb = scMul(scMul(M.phiF, scConj(M.phiB)), r1), bf = scMul(scMul(M.phiB, scConj(M.phiF)), r2);
    Gff = [Gff[0] + ff[0], Gff[1] + ff[1]]; Gbb = [Gbb[0] + bb[0], Gbb[1] + bb[1]]; Gfb = [Gfb[0] + fb[0], Gfb[1] + fb[1]]; Gbf = [Gbf[0] + bf[0], Gbf[1] + bf[1]];
  }
  [Gff, Gfb, Gbf, Gbb] = [Gff, Gfb, Gbf, Gbb].map(v => scMul(scMul(g, v), [pf, 0]));
  // F's four numbers: ahead along e1, e2, back along e1, e2
  const four = F => { const o = []; for (const [off] of [[0], [6]]) for (const ev of e) o.push([F[off] * ev[0] + F[off + 2] * ev[1] + F[off + 4] * ev[2], F[off + 1] * ev[0] + F[off + 3] * ev[1] + F[off + 5] * ev[2]]); return o; };
  const Mx = F => [0, 1].map(s => scMul(Gff, F[s])).map((v, s) => [v[0] + scMul(Gfb, F[2 + s])[0], v[1] + scMul(Gfb, F[2 + s])[1]])
    .concat([0, 1].map(s => { const a = scMul(Gbf, F[s]), b = scMul(Gbb, F[2 + s]); return [a[0] + b[0], a[1] + b[1]]; }));
  const T = [0, 1, 2, 3].map(i => four(respond(i)));             // T[i][o]: column i
  const f0 = four(F0), rhs = Mx(f0);
  // A = I - M T, column by column
  const A = [0, 1, 2, 3].map(() => [0, 1, 2, 3].map(() => [0, 0]));
  for (let i = 0; i < 4; i++) { const col = Mx(T[i]); for (let o = 0; o < 4; o++) A[o][i] = [(o === i ? 1 : 0) - col[o][0], -col[o][1]]; }
  const x = cavCsolve(A, rhs);
  // the far field ahead and back with them, its dipoles, and what each mode takes
  const F = f0.map((v, o) => { let s = [v[0], v[1]]; for (let i = 0; i < 4; i++) { const t = scMul(T[i][o], x[i]); s = [s[0] + t[0], s[1] + t[1]]; } return s; });
  const pF = [F[0], F[1]].map(v => scMul(v, [pf, 0])), pB = [F[2], F[3]].map(v => scMul(v, [pf, 0]));
  // each wave's change against the empty cavity's, as a factor on its amplitude (first order, by projection on the empty wave)
  const acc = { fin: [0, 0], fout: [0, 0], bin: [0, 0], bout: [0, 0], lin: [0, 0], lout: [0, 0] };
  for (const M of K.kept) for (let s = 0; s < 2; s++) {
    const df = scMul(scMul(g, scConj(M.phiF)), pF[s]), db = scMul(scMul(g, scConj(M.phiB)), pB[s]);
    const add = (key, w, v) => { const t = scMul(scConj(w), scMul(v, M.inv)); acc[key][0] += t[0]; acc[key][1] += t[1]; };
    const sum = (a, b) => [a[0] + b[0], a[1] + b[1]];
    add('fin', M.f0[s], sum(scMul(M.lam, df), scMul(M.rho1, db)));
    add('fout', M.f0[s], sum(df, scMul(M.rho1, db)));
    add('lin', M.fl[s], sum(scMul(M.lam, df), scMul(M.rho1, db)));
    add('lout', M.fl[s], sum(df, scMul(M.rho1, db)));
    add('bin', M.b0[s], sum(scMul(M.rho2, df), scMul(M.lam, db)));
    add('bout', M.b0[s], sum(scMul(M.rho2, df), db));
  }
  const fac = (a, P0) => [1 + a[0] / P0, a[1] / P0];
  const s = { fin: fac(acc.fin, K.Pf), fout: fac(acc.fout, K.Pf), bin: fac(acc.bin, K.Pb), bout: fac(acc.bout, K.Pb) };
  // what the field run takes each leg by (the forward leg carries all of the forward wave's change; the first pass, the light
  // let in, none): at leg 0's start, and at each leg's end against what it started with
  const tin = [], tout = [];
  tin[P.legF.j] = fac(acc.lin, K.Pl); tout[P.legF.j] = fac(acc.lout, K.Pl); tin[P.legB.j] = s.bin; tout[P.legB.j] = s.bout;
  const load = { start: tin[0], ends: [scDiv(tout[0], tin[0]), scDiv(tout[1], tout[0])] };
  // TEM00 in the light's own polarisation, one pass of the particle: [[1 + kff, kfb], [kbf, 1 + kbb]]; the resonance moves
  // to where det(1 - P(kappa) S) = 0, P the round trips with the light's wavenumber moved by kappa (vacuum, 1/mm)
  const M0 = K.modes[0], sp = K.sp;
  const kap = (a, b) => scMul(scMul(g, scConj(a === 0 ? M0.phiF : M0.phiB)), scMul([pf, 0], scMul(T[2 * b + sp][2 * a + sp], b === 0 ? M0.phiF : M0.phiB)));
  const Sm = [[cavAdd1(kap(0, 0)), kap(0, 1)], [kap(1, 0), cavAdd1(kap(1, 1))]];
  const Lrt = P.c.Lopt, l2 = P.l2, l1 = Lrt - l2;
  const det = (kp, S) => {
    const r1 = scMul(M0.rho1, scExp(kp[0] * l1)), r2 = scMul(M0.rho2, scExp(kp[0] * l2));
    const sc1 = Math.exp(-kp[1] * l1), sc2 = Math.exp(-kp[1] * l2), R1 = [r1[0] * sc1, r1[1] * sc1], R2 = [r2[0] * sc2, r2[1] * sc2];
    // 1 - P S, P = [[0, R1], [R2, 0]]
    const a = [1 - scMul(R1, S[1][0])[0], -scMul(R1, S[1][0])[1]], b = scMul([-1, 0], scMul(R1, S[1][1])), c = scMul([-1, 0], scMul(R2, S[0][0])), dd = [1 - scMul(R2, S[0][1])[0], -scMul(R2, S[0][1])[1]];
    return [scMul(a, dd)[0] - scMul(b, c)[0], scMul(a, dd)[1] - scMul(b, c)[1]];
  };
  const lnl = Math.log(Math.sqrt(scAbs2(M0.lam))), kp0 = [-Math.atan2(M0.lam[1], M0.lam[0]) / Lrt, lnl / Lrt];
  const pole = S => {
    let a = [kp0[0], kp0[1] - 1e-3 / Lrt], b = [kp0[0] + 1e-3 / Lrt, kp0[1]], ha = det(a, S), hb = det(b, S);
    for (let it = 0; it < 80; it++) {
      const dh = [hb[0] - ha[0], hb[1] - ha[1]];
      if (!(scAbs2(dh) > 0)) break;
      const st = scMul(hb, scDiv([b[0] - a[0], b[1] - a[1]], dh)), nb = [b[0] - st[0], b[1] - st[1]];
      a = b; ha = hb; b = nb; hb = det(b, S);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-15 * (Math.abs(kp0[0]) + Math.abs(kp0[1]) + 1e-3)) break;
    }
    return b;
  };
  const I2 = [[[1, 0], [0, 0]], [[0, 0], [1, 0]]];
  const p0 = pole(I2), p1 = pole(Sm), lwK = 2 * Math.PI / Lrt / P.c.finesse;      // 1/mm
  const shiftK = (p1[0] - p0[0]) * 1e3, widenK = -2 * (p1[1] - p0[1]) * 1e3;      // 1/m
  // the returned waves, as fields along the axis (world vectors)
  const wv = (a, b) => [0, 1, 2].flatMap(q => [a[0] * e[0][q] + b[0] * e[1][q], a[1] * e[0][q] + b[1] * e[1][q]]);
  return { x, Ef: wv(x[0], x[1]), Eb: wv(x[2], x[3]), F, s, load, shiftK, widenK, lwK: lwK * 1e3, shiftLw: shiftK / (lwK * 1e3), widenLw: widenK / (lwK * 1e3),
    G: { ff: Gff, fb: Gfb, bf: Gbf, bb: Gbb }, d };
}
const cavAdd1 = a => [1 + a[0], a[1]];
/* a small complex linear solve, Gaussian elimination with partial pivoting */
function cavCsolve(A0, b0) {
  const n = b0.length, A = A0.map(r => r.map(v => [v[0], v[1]])), b = b0.map(v => [v[0], v[1]]);
  for (let k = 0; k < n; k++) {
    let p = k; for (let i = k + 1; i < n; i++) if (scAbs2(A[i][k]) > scAbs2(A[p][k])) p = i;
    [A[k], A[p]] = [A[p], A[k]]; [b[k], b[p]] = [b[p], b[k]];
    if (!(scAbs2(A[k][k]) > 0)) continue;
    for (let i = k + 1; i < n; i++) {
      const f = scDiv(A[i][k], A[k][k]);
      for (let j = k; j < n; j++) { const t = scMul(f, A[k][j]); A[i][j] = [A[i][j][0] - t[0], A[i][j][1] - t[1]]; }
      const t = scMul(f, b[k]); b[i] = [b[i][0] - t[0], b[i][1] - t[1]];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let t = b[i];
    for (let j = i + 1; j < n; j++) { const u = scMul(A[i][j], x[j]); t = [t[0] - u[0], t[1] - u[1]]; }
    x[i] = scAbs2(A[i][i]) > 0 ? scDiv(t, A[i][i]) : [0, 0];
  }
  return x;
}
/* What the field run takes the loop's light by, for the particles solved in a cavity: canon -> { start, ends } (the
   physicists' factors on the waves' amplitudes: at the loop's first leg's start, and at each leg's end against its
   start). Set by the trace from the answers it launches (engines/scatter-light.js); a field worker is sent it with the
   bench (page/workers.js). */
export function cavLoadOf(S) {
  const K = S && S.cav;
  return K && K.solved && K.load ? K.load : null;
}
export const cavLoadKey = () => (lastTrace && lastTrace.cavLoad ? '|load' + JSON.stringify(lastTrace.cavLoad) : '');
