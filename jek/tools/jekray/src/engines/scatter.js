import { C_SI } from '../core/cells.js';
import { EPS0, particleIndex, particleOf } from '../core/traps.js';
import { mieCoeffs, mieQ, mieTable } from '../core/mie.js';
import { ddaAlpha, ddaExtAbs, ddaFar, ddaPlan, ddaPlaneWave, ddaSolver } from '../core/dda.js';
import { Z0_OHM, coneGrid, dipoleFar, farPower, farPowerAlong, mieFarWaves, smallAlpha, sphereGrid, sphereTotals } from '../core/scatter.js';
import { deg } from '../state/project.js';
import { lastTrace } from './trace.js';
import { popRun } from './beam-tree.js';
import { popScreenPrep, screenDom, trapBeams, trapLegAt, trapMedium, trapSolve } from './diffraction.js';

/* ---------- The light a particle scatters ----------
   The particle a screen holds (trap: 'sphere', of any of the shapes), in the light the bench
   puts on it, by one of three models: a sphere exactly (Lorenz-Mie, core/mie.js), any shape as
   an array of dipoles (core/dda.js), or a single dipole (Rayleigh), kept beside them to compare.
   The light: every beam through the screen's region, as the trap takes them (trapBeams). A
   steep focus is its pupil, and each pupil sample is a plane wave onto the particle, with its
   own direction, polarisation and phase at the particle's centre: the focus's angular
   spectrum, the same one whose sum is the vector field there. A sphere's far field is then
   every wave's Mie field, each turned to its own direction, added as fields; a dipole array
   is driven by the waves' sum at each dipole. A beam with no pupil (collimated, or gently
   focused) is one plane wave, the field where the particle is. Beams of one laser add as
   fields (a standing wave), separate lasers as powers.
   The answer is plain data: the cross-sections (for a plane wave along the strongest beam,
   polarised as the light at the particle is), the powers in the light as it is, the pattern
   on cuts and over the sphere, and the far field's amplitude itself (far), from which the
   scattered light could be put back on the bench. */
export const SCAT_MODELS = ['auto', 'rayleigh', 'mie', 'dda'];
export const SCAT_DIRS = ['fwd', 'back', 'side', 'up', 'angle'];
export const SCAT_NMAX = 12000;           // dipoles in a run, unless more across are asked for
export const SCAT_NHARD = 24000;          // and never more than this
const SCAT_TINY = 0.1;                    // |m| k (half the longest dimension) under which Auto takes the single dipole

const scatFields = el => [el.trapShape, el.trapLen, el.trapAz, el.trapTilt, el.scatModel, el.scatDip, el.scatAt, el.scatDx, el.scatDy, el.scatDz, el.scatNA, el.scatDir, el.scatAng];
/* what a scattering run depends on, as popScreenPrep gives it for the screen's field, with
   the particle's own settings; null where there is no particle or no light */
export function scatterPrep(el) {
  if (!el || el.type !== 'screen' || el.trap !== 'sphere') return null;
  const job = popScreenPrep(el);
  return job ? { keep: job.keep, srcs: job.srcs, key: job.key + '|scat' + JSON.stringify(scatFields(el)) } : null;
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/* a frame with ez along a unit vector: [ex, ey, ez], ex in the bench plane where it can be */
function frameOn(ez) {
  const ex = Math.hypot(ez[0], ez[1]) > 1e-9 ? unit(cross([0, 0, 1], ez)) : [1, 0, 0];
  return [ex, cross(ez, ex), ez];
}
// world to a frame and back, for 3-vectors packed n to an array of `step` numbers each
function toFrame(fr, v, step, out) {
  const o = out || new Float64Array(v.length);
  for (let i = 0; i < v.length; i += 3 * step) for (let s = 0; s < step; s++) {
    const x = v[i + s], y = v[i + step + s], z = v[i + 2 * step + s];
    for (let q = 0; q < 3; q++) o[i + q * step + s] = fr[q][0] * x + fr[q][1] * y + fr[q][2] * z;
  }
  return o;
}
function fromFrame(fr, v, step, out) {
  const o = out || new Float64Array(v.length);
  for (let i = 0; i < v.length; i += 3 * step) for (let s = 0; s < step; s++) {
    const x = v[i + s], y = v[i + step + s], z = v[i + 2 * step + s];
    for (let q = 0; q < 3; q++) o[i + q * step + s] = fr[0][q] * x + fr[1][q] * y + fr[2][q] * z;
  }
  return o;
}
/* The plane waves on a particle at world point C (bench mm; C[2] out of the plane), one set a
   launch: { n, d, E } with d each wave's direction and E its field at C (V/m, exp(-i w t)),
   and what was made of each beam. nMed scales the fields as the trap does. */
export function scatterWaves(parts, C, nMed, size) {
  const byL = new Map(), notes = { varies: false, pupils: 0, plane: 0 };
  for (const q of parts) {
    const b = q.b, rx = C[0] - b.x0, ry = C[1] - b.y0, pz = rx * b.dx + ry * b.dy, px = -rx * b.dy + ry * b.dx, py = C[2];
    const s = Math.sqrt(2 * q.Pw * 1e6 / (nMed * EPS0 * C_SI)), ax = [-b.dy, b.dx];
    const d = [], E = [];
    // beam frame (x across in the plane, y out of it, z along) to the world, the field conjugated
    const push = (dv, e) => {
      d.push(dv[0] * ax[0] + dv[2] * b.dx, dv[0] * ax[1] + dv[2] * b.dy, dv[1]);
      E.push(s * (e[0] * ax[0] + e[4] * b.dx), -s * (e[1] * ax[0] + e[5] * b.dx), s * (e[0] * ax[1] + e[4] * b.dy), -s * (e[1] * ax[1] + e[5] * b.dy), s * e[2], -s * e[3]);
    };
    if (q.P) {
      const { X, Y, RHO, U, W, n, k, lamM, Rf } = q.P;
      notes.pupils++;
      for (let o = 0; o < n; o++) {
        const vx = px - X[o], vy = py - Y[o], r = Math.sqrt(vx * vx + vy * vy + pz * pz), dv = [vx / r, vy / r, pz / r];
        // this sample's term of the pupil sum (vfAt), i / lam and the sphere's own path with it
        const ph = -k * (r - RHO[o]) - k * Rf + Math.PI / 2, w = pz / (r * r) * W[o] / lamM, c = Math.cos(ph) * w, sn = Math.sin(ph) * w;
        const e = [0, 0, 0, 0, 0, 0];
        for (let m = 0; m < 3; m++) { e[2 * m] = U[2 * m][o] * c - U[2 * m + 1][o] * sn; e[2 * m + 1] = U[2 * m][o] * sn + U[2 * m + 1][o] * c; }
        // a plane wave is square to its direction (the pupil's field is square to the ray to the focus, a hair off it when the particle is off the focus)
        const lr = e[0] * dv[0] + e[2] * dv[1] + e[4] * dv[2], li = e[1] * dv[0] + e[3] * dv[1] + e[5] * dv[2];
        for (let m = 0; m < 3; m++) { e[2 * m] -= lr * dv[m]; e[2 * m + 1] -= li * dv[m]; }
        push(dv, e);
      }
    } else {
      const e = trapLegAt(q.leg, px, py, pz);
      notes.plane++;
      push([0, 0, 1], e);
      // one plane wave stands for it: does the beam change across the particle?
      if (size > 0) {
        const I0 = e[0] * e[0] + e[1] * e[1] + e[2] * e[2] + e[3] * e[3];
        for (const [ox, oy] of [[size, 0], [-size, 0], [0, size], [0, -size]]) {
          const e1 = trapLegAt(q.leg, px + ox, py + oy, pz), I1 = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2] + e1[3] * e1[3];
          if (Math.abs(I1 - I0) > 0.1 * I0) notes.varies = true;
        }
      }
    }
    if (!byL.has(q.coh)) byL.set(q.coh, { d: [], E: [] });
    const L = byL.get(q.coh);
    for (const v of d) L.d.push(v);
    for (const v of E) L.E.push(v);
  }
  const launches = [];
  for (const L of byL.values()) {
    // waves too weak to matter are left out (a pupil's far corners)
    let mx = 0;
    const n0 = L.d.length / 3, I = new Float64Array(n0);
    for (let o = 0; o < n0; o++) { for (let m = 0; m < 6; m++) I[o] += L.E[6 * o + m] ** 2; if (I[o] > mx) mx = I[o]; }
    const keep = []; for (let o = 0; o < n0; o++) if (I[o] > 1e-9 * mx) keep.push(o);
    const d = new Float64Array(3 * keep.length), E = new Float64Array(6 * keep.length);
    keep.forEach((o, i) => { for (let m = 0; m < 3; m++) d[3 * i + m] = L.d[3 * o + m]; for (let m = 0; m < 6; m++) E[6 * i + m] = L.E[6 * o + m]; });
    launches.push({ n: keep.length, d, E });
  }
  return { launches, notes };
}
// the waves' sum at the centre: [xr, xi, yr, yi, zr, zi]
const wavesAt0 = L => { const e = [0, 0, 0, 0, 0, 0]; for (let o = 0; o < L.n; o++) for (let m = 0; m < 6; m++) e[m] += L.E[6 * o + m]; return e; };
const abs2 = e => e.reduce((a, v) => a + v * v, 0);
/* the waves' field at each dipole of a lattice (body frame; fr the body's axes in the world): 6 N numbers */
function wavesOnLattice(L, lat, k, fr) {
  const N = lat.N, E = new Float64Array(6 * N), db = toFrame(fr, L.d, 1), Eb = toFrame(fr, L.E, 2);
  for (let o = 0; o < L.n; o++) {
    const dx = k * db[3 * o], dy = k * db[3 * o + 1], dz = k * db[3 * o + 2], b = 6 * o;
    const e0 = Eb[b], e1 = Eb[b + 1], e2 = Eb[b + 2], e3 = Eb[b + 3], e4 = Eb[b + 4], e5 = Eb[b + 5];
    for (let j = 0; j < N; j++) {
      const ph = dx * lat.x[j] + dy * lat.y[j] + dz * lat.z[j], c = Math.cos(ph), s = Math.sin(ph), q = 6 * j;
      E[q] += e0 * c - e1 * s; E[q + 1] += e0 * s + e1 * c; E[q + 2] += e2 * c - e3 * s; E[q + 3] += e2 * s + e3 * c; E[q + 4] += e4 * c - e5 * s; E[q + 5] += e4 * s + e5 * c;
    }
  }
  return E;
}
/* which model a particle gets, and why: { model, auto, note } */
export function scatterModel(el, P, k, mAbs) {
  const want = SCAT_MODELS.includes(el.scatModel) ? el.scatModel : 'auto', sphere = P.shape === 'sphere';
  const tiny = mAbs * k * Math.max(P.D, P.L) / 2 <= SCAT_TINY;
  if (want === 'auto') return { model: tiny ? 'rayleigh' : sphere ? 'mie' : 'dda', auto: true };
  return { model: want, auto: false };
}
/* The run, as a generator: it yields { stage, ... } as it goes (so a worker can report and be
   stopped) and returns the answer, or { error }. R is the field run of scatterPrep's beams. */
export function* scatterGen(el, R, opts) {
  const t0 = Date.now(), sd = screenDom(el, R);
  if (!sd) return { error: 'no beam' };
  const { dom, len } = sd, b0 = dom.sg.b, nm = b0.nm;
  const P = particleOf(el), nBench = b0.n, nMed = trapMedium(el, nBench, nm);
  const [npr, npi] = particleIndex(el.trapMat, nm), mr = npr / nMed, mi = npi / nMed, mAbs = Math.hypot(mr, mi);
  const k = 2 * Math.PI * nMed / (nm * 1e-9), Z = Z0_OHM / nMed, aEq = P.rEq * 1e-9, area = Math.PI * aEq * aEq;
  const pick = scatterModel(el, P, k, mAbs), model = pick.model;
  yield { stage: 'light' };
  // the beams, and where the particle is: the trap frame's x across the strongest beam in the plane, y out of it, z along it
  const TB = trapBeams(el, R, dom, len, { reach: 3.2, M: 64 });
  if (!TB.parts.length) return { error: 'no focused beam' };
  const d0 = [b0.dx, b0.dy, 0], a0 = [-b0.dy, b0.dx, 0], up = [0, 0, 1];
  let at = [0, 0, 0], atTrap = false, trapMiss = false;
  if (el.scatAt === 'trap') {
    let T = null;
    try { T = trapSolve(el, R, dom, len); } catch (err) { T = null; }
    if (T && T.trap) { at = [T.x, T.y, T.z]; atTrap = true; } else trapMiss = true;
  }
  at = [at[0] + (el.scatDx || 0) * 1e-3, at[1] + (el.scatDy || 0) * 1e-3, at[2] + (el.scatDz || 0) * 1e-3];
  const C = [TB.P0[0] + at[0] * a0[0] + at[2] * d0[0], TB.P0[1] + at[0] * a0[1] + at[2] * d0[1], at[1]];
  const W = scatterWaves(TB.parts, C, nMed, 0.5e3 * Math.max(P.D, P.L));
  const launches = W.launches.filter(L => L.n > 0);
  if (!launches.length) return { error: 'no light' };
  // the light at the centre, and the strongest launch's polarisation there (square to the beam)
  const E0s = launches.map(wavesAt0), E2 = E0s.reduce((a, e) => a + abs2(e), 0), I0 = 0.5 * E2 / Z;
  let iDom = 0; E0s.forEach((e, i) => { if (abs2(e) > abs2(E0s[iDom])) iDom = i; });
  let pol = E0s[iDom].slice();
  { const lr = pol[0] * d0[0] + pol[2] * d0[1], li = pol[1] * d0[0] + pol[3] * d0[1]; for (let m = 0; m < 3; m++) { pol[2 * m] -= lr * d0[m]; pol[2 * m + 1] -= li * d0[m]; } }
  { const l = Math.sqrt(abs2(pol)); pol = l > 0 ? pol.map(v => v / l) : [a0[0], 0, a0[1], 0, 0, 0]; }
  const single = launches.length === 1 && launches[0].n === 1;
  // the particle's axis and its frame
  const az = (el.trapAz || 0) * deg, tl = (el.trapTilt || 0) * deg, axis = [Math.cos(tl) * Math.cos(az), Math.cos(tl) * Math.sin(az), Math.sin(tl)];
  const body = frameOn(axis);
  const flags = [];
  if (Math.abs(nMed - nBench) > 1e-3) flags.push('medium');
  if (W.notes.varies) flags.push('varies');
  if (TB.skipped.length) flags.push('skipped');
  if (trapMiss) flags.push('notrap');
  const out = { model, auto: pick.auto, shape: P.shape, D: P.D * 1e9, L: P.L * 1e9, rEq: P.rEq, mat: el.trapMat, np: [npr, npi], m: [mr, mi], nMed, nBench, nm, k,
    x: k * aEq, kL: k * Math.max(P.D, P.L) / 2, area, I0, E2, at: { x: at[0], y: at[1], z: at[2], trap: atTrap }, beams: TB.parts.length, launches: launches.length,
    waves: launches.reduce((a, L) => a + L.n, 0), pupils: W.notes.pupils, plane: W.notes.plane, single, dir: d0, pol, axis, flags };
  // Rayleigh's answer beside whichever model runs, and Mie's for the sphere of the same volume
  const aSm = smallAlpha(P.V, P.shape === 'sphere' ? 1 : P.L / P.D, mr, mi, k);
  const smallP = e => {            // p = alpha E, alpha a tensor about the axis: [6]
    const eb = toFrame(body, Float64Array.from(e), 2), pb = new Float64Array(6);
    for (let q = 0; q < 3; q++) { const al = q === 2 ? aSm[0] : aSm[1]; pb[2 * q] = al[0] * eb[2 * q] - al[1] * eb[2 * q + 1]; pb[2 * q + 1] = al[0] * eb[2 * q + 1] + al[1] * eb[2 * q]; }
    return Array.from(fromFrame(body, pb, 2));
  };
  {
    const p = smallP(pol), sca = 8 * Math.PI / 3 * k ** 4 * abs2(p);
    let ext = 0; for (let q = 0; q < 3; q++) ext += pol[2 * q] * p[2 * q + 1] - pol[2 * q + 1] * p[2 * q];
    ext *= 4 * Math.PI * k;
    out.rayleigh = { Csca: sca, Cext: ext, Cabs: ext - sca };
  }
  const CM = mieCoeffs(k * aEq, mr, mi), QM = mieQ(CM);
  out.mieEq = { Csca: QM.Qsca * area, Cext: QM.Qext * area, Cabs: QM.Qabs * area, g: QM.g, Qback: QM.Qback, terms: CM.n };
  // each launch's far field as a function of directions (world), and what it takes from the light
  const fars = [], Pext = [], Pabs = [];
  let ref = null;                        // the plane wave's answer: { Csca, Cext, Cabs, g, Qback }
  const refGrid = sphereGrid(24, 48, a0, up, d0);
  const refFrom = (far, ext, abs, e2) => {
    const T = sphereTotals(refGrid, farPower([far(refGrid.dirs)], refGrid.dirs.length / 3));
    const Fb = far(Float64Array.of(-d0[0], -d0[1], 0));
    return { Csca: T.total / e2, Cext: ext, Cabs: abs, g: T.g, Qback: 4 * Math.PI * abs2(Array.from(Fb)) / e2 / area };
  };
  if (model === 'mie') {
    if (P.shape !== 'sphere') flags.push('mieNotSphere');
    const tab = mieTable(CM);
    for (const L of launches) {
      fars.push(dirs => mieFarWaves(tab, k, L, dirs));
      yield { stage: 'sphere' };
      // the optical theorem, wave by wave: P_ext = (4 pi / k) / (2 Z) Im sum conj(E_o) . F(d_o)
      const F = mieFarWaves(tab, k, L, L.d);
      let s = 0; for (let q = 0; q < F.length; q += 2) s += L.E[q] * F[q + 1] - L.E[q + 1] * F[q];
      Pext.push(4 * Math.PI / k * s / (2 * Z)); Pabs.push(null);
    }
    ref = { Csca: out.mieEq.Csca, Cext: out.mieEq.Cext, Cabs: out.mieEq.Cabs, g: QM.g, Qback: QM.Qback };
    out.mie = { terms: CM.n };
  } else if (model === 'rayleigh') {
    if (mAbs * out.kL > 0.5) flags.push('rayleighBig');
    E0s.forEach(e => {
      const p = smallP(e);
      fars.push(dirs => dipoleFar(k, p, dirs));
      let s = 0; for (let q = 0; q < 3; q++) s += e[2 * q] * p[2 * q + 1] - e[2 * q + 1] * p[2 * q];
      Pext.push(4 * Math.PI * k * s / (2 * Z)); Pabs.push(null);
    });
    const p1 = smallP(pol);
    ref = refFrom(dirs => dipoleFar(k, p1, dirs), out.rayleigh.Cext, out.rayleigh.Cabs, 1);
    ref.Csca = out.rayleigh.Csca;
  } else {
    const o = opts || {}, across = el.scatDip > 0 ? el.scatDip : 10;
    const lat = ddaPlan(P.shape, P.D, P.L, k, mAbs, { across, nMax: Math.min(SCAT_NHARD, o.nMax || (el.scatDip > 0 ? SCAT_NHARD : SCAT_NMAX)) });
    const dirB = Array.from(toFrame(body, Float64Array.from(d0), 1)), polB = Array.from(toFrame(body, Float64Array.from(pol), 2));
    const alpha = ddaAlpha(mr, mi, k, lat.d, 'ldr', dirB, polB), S = ddaSolver(lat, k, alpha);
    const D = { N: lat.N, d: lat.d * 1e9, mkd: lat.mkd, across: lat.across, capped: lat.capped, coarse: lat.coarse, iters: 0, resid: 0, converged: true, runs: 0 };
    out.dda = D;
    if (lat.coarse) flags.push('coarse');
    if (lat.capped) flags.push('capped');
    if (mAbs > 2.5) flags.push('highIndex');
    const runSolve = function* (E, what) {
      const g = S.solve(E, { tol: o.tol || 1e-5, maxIter: o.maxIter || 300 });
      let r = g.next();
      while (!r.done) { yield { stage: 'dipoles', what, iter: r.value.iter, resid: r.value.resid, N: lat.N }; r = g.next(); }
      D.iters += r.value.iters; D.resid = Math.max(D.resid, r.value.resid); D.runs++;
      if (!r.value.converged) D.converged = false;
      return r.value.p;
    };
    const farOf = p => dirs => fromFrame(body, ddaFar(lat, k, p, toFrame(body, dirs, 1)), 2);
    yield { stage: 'dipoles', what: 'wave', iter: 0, resid: 1, N: lat.N };
    let n = 0;
    for (const L of launches) {
      const E = wavesOnLattice(L, lat, k, body), p = yield* runSolve(E, launches.length > 1 ? 'light ' + (++n) : 'light');
      const X = ddaExtAbs(k, alpha, E, p);
      fars.push(farOf(p)); Pext.push(X.ext / (2 * Z)); Pabs.push(X.abs / (2 * Z));
      if (single) ref = refFrom(farOf(p), X.ext / E2, X.abs / E2, E2);
    }
    if (!ref) {
      // the cross-sections are a plane wave's: one more solve, along the strongest beam
      const E = ddaPlaneWave(lat, k, dirB, polB), p = yield* runSolve(E, 'wave');
      const X = ddaExtAbs(k, alpha, E, p);
      ref = refFrom(farOf(p), X.ext, X.abs, 1);
    }
    if (!D.converged) flags.push('noconv');
  }
  yield { stage: 'pattern' };
  // the pattern in the light as it is: over the sphere (the axis along the strongest beam), on two cuts, into the cone
  const nT = Math.max(36, Math.min(96, 2 * Math.ceil(out.kL + 8))), G = sphereGrid(nT, 2 * nT, a0, up, d0), nG = nT * 2 * nT;
  const FG = fars.map(f => f(G.dirs)), IG = farPower(FG, nG), tot = sphereTotals(G, IG);
  const nC = 361, cIn = new Float64Array(3 * nC), cOut = new Float64Array(3 * nC);
  for (let i = 0; i < nC; i++) {
    const a = i * deg; cIn[3 * i] = Math.cos(a); cIn[3 * i + 1] = Math.sin(a);
    for (let q = 0; q < 3; q++) cOut[3 * i + q] = Math.cos(a) * d0[q] + Math.sin(a) * up[q];
  }
  const cut = (dirs, normal) => { const F = fars.map(f => f(dirs)); return { I: Array.from(farPower(F, nC), v => v / (2 * Z)), Is: Array.from(farPowerAlong(F, nC, normal), v => v / (2 * Z)) }; };
  out.cutIn = cut(cIn, up);                 // by bench angle, 0 to 360 degrees; Is the part polarised out of the plane
  out.cutOut = cut(cOut, a0);               // by angle from the beam's direction towards up; Is the part polarised across the beam in the plane
  out.beamDeg = Math.atan2(d0[1], d0[0]) / deg;
  out.Psca = tot.total / (2 * Z);
  out.Pext = Pext.reduce((a, v) => a + v, 0);
  out.Pabs = Pabs.every(v => v !== null) ? Pabs.reduce((a, v) => a + v, 0) : out.Pext - out.Psca;
  out.fwd = tot.fwd; out.back = tot.back; out.gLight = tot.g;
  out.Csca = ref.Csca; out.Cext = ref.Cext; out.Cabs = ref.Cabs; out.g = ref.g; out.Qback = ref.Qback;
  out.Qsca = ref.Csca / area; out.Qext = ref.Cext / area; out.Qabs = ref.Cabs / area;
  // a detector's share: a cone of numerical aperture NA (in the medium) about a direction
  const ca = (el.scatAng || 0) * deg, cAxis = el.scatDir === 'back' ? d0.map(v => -v) : el.scatDir === 'side' ? a0 : el.scatDir === 'up' ? up : el.scatDir === 'angle' ? [Math.cos(ca), Math.sin(ca), 0] : d0;
  const half = Math.asin(Math.min(1, Math.max(0, el.scatNA) / nMed)), CG = coneGrid(cAxis, half);
  { const Ic = farPower(fars.map(f => f(CG.dirs)), CG.w.length); let s = 0; for (let i = 0; i < Ic.length; i++) s += Ic[i] * CG.w[i]; out.collect = { P: s / (2 * Z), frac: tot.total > 0 ? s / tot.total : 0, halfDeg: half / deg, na: el.scatNA, dir: el.scatDir, axis: cAxis }; }
  out.map = { nT, nP: 2 * nT, theta: Array.from(G.mu, v => Math.acos(v) / deg), phi: Array.from(G.phi, v => v / deg), I: Float32Array.from(IG, v => v / (2 * Z)) };
  // the far field itself: F (volts; E = F e^{ikr}/r in V/m) at the map's directions, a launch each, in the world's x, y (the bench) and z (up)
  out.far = { axes: [a0, up, d0], mu: Array.from(G.mu), phi: Array.from(G.phi), F: FG.map(F => Float32Array.from(F)) };
  out.ms = Date.now() - t0;
  return out;
}
/* The answers kept, a screen each, under the key they were worked out for: the page's worker fills it (ui/scatter.js),
   and scatterNow; the data export and the 3D view read it */
export const scatCache = new Map();
export function scatterCached(el) { const J = scatterPrep(el), c = J && scatCache.get(el.id); return c && c.key === J.key ? c.S : null; }
/* an answer as plain numbers and lists (a script's, a file's) */
export const scatterPlain = S => JSON.parse(JSON.stringify(S, (k, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v)));
/* the run in one go */
export function scatterRun(el, R, opts) {
  const g = scatterGen(el, R, opts);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}
/* a screen's scattering now, on this thread: the bench's field for it, then the run (scripts, Node, the tests) */
export function scatterNow(el, opts) {
  const job = scatterPrep(el);
  if (!job) return null;
  const S = scatterRun(el, popRun(lastTrace.beams, job.srcs, { keep: job.keep }), opts);
  scatCache.set(el.id, { key: job.key, S });
  return S;
}
