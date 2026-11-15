import { C_SI } from '../core/cells.js';
import { BEAM_Z, IN_WORKER } from '../core/constants.js';
import { EPS0, particleAz, particleIndex, particleOf } from '../core/traps.js';
import { beamAt } from '../core/beams-hom.js';
import { mieCoeffs, mieQ, mieTable } from '../core/mie.js';
import { ddaAlpha, ddaExtAbs, ddaFar, ddaPlan, ddaPlaneWave, ddaSolver } from '../core/dda.js';
import { Z0_OHM, coneGrid, dipoleFar, farPower, farPowerAlong, mieFarWaves, smallAlpha, sphereGrid, sphereTotals } from '../core/scatter.js';
import { deg, project } from '../state/project.js';
import { allSources, beamOn, getEl } from '../state/elements.js';
import { lastTrace, zOf } from './trace.js';
import { popKeyOf, popRun } from './beam-tree.js';
import { trapBeams, trapLegAt, trapMedium, trapSolve } from './diffraction.js';
import { beamFrame } from './phase-screen.js';
import { CAV_TAIL, CAV_TAIL_LONG, CAV_TAIL_REACH, cavUnchecked, cavitySolve, cavityModes, cavityPlan } from './scatter-cavity.js';
import { PUP_FRESNEL, pupApplyChains, pupChains, pupGmres, pupGrid, pupLock, pupMapAt, pupReturns, pupilPlan } from './scatter-pupil.js';

/* ---------- The light a particle scatters ----------
   A Particle part (of any of the shapes), in the light the bench
   puts on it, by one of three models: a sphere exactly (Lorenz-Mie, core/mie.js), any shape as
   an array of dipoles (core/dda.js), or a single dipole (Rayleigh), kept beside them to compare.
   The light: every beam through the particle's region, as the trap takes them (trapBeams). A
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
const WAVE_BINS = 12;                    // a focus's waves on the bench: bins across its pupil each way (waveInt)
const SCAT_TINY = 0.1;                    // |m| k (half the longest dimension) under which Auto takes the single dipole

const scatFields = el => [el.trapShape, el.trapLen, particleAz(el), el.trapTilt, el.scatModel, el.scatDip, el.scatAt, el.scatDx, el.scatDy, el.scatDz, el.scatNA, el.scatDir, el.scatAng];
/* A Particle part is a point of the bench, in whatever light reaches it: the beams of a trace that pass it, each
   with where along it the particle is nearest (t), how far the particle is off its axis in the bench plane (x, to
   the beam's left) and above it (dz), and the beam's irradiance there against the others'. A beam counts when the
   particle is within three of its radii of its axis there (20 um at least). A beam that rises or descends out of the
   plane counts as a level one does, in its own frame (beamFrame): t along it in 3D, x across it, dz up from it. */
export function particleBeams(el, B = lastTrace.beams || []) {
  const out = [], z = zOf(el);
  B.forEach((b, i) => {
    if (b.fan || b.bench !== el.bench) return;
    const F = beamFrame(b), r = [el.x - F.P0[0], el.y - F.P0[1], z - F.P0[2]];
    const t = r[0] * F.d[0] + r[1] * F.d[1] + r[2] * F.d[2], x = r[0] * F.ex[0] + r[1] * F.ex[1] + r[2] * F.ex[2];
    const dz = F.level ? r[2] : r[0] * F.ey[0] + r[1] * F.ey[1] + r[2] * F.ey[2];
    if (t < 0 || t > F.L) return;
    const bw = beamAt(b.qr + t, b.qi, b.n, b.nm, 1), w = bw ? bw.w : 0, r2 = x * x + dz * dz, reach = Math.max(0.02, 3 * w);
    if (!(w > 0) || r2 > reach * reach) return;
    out.push({ i, t, x, dz, w, I: Math.max(0, b.w === undefined ? 1 : b.w) * Math.max(0, b.lmw || 0) * Math.exp(-2 * r2 / (w * w)) / (w * w) });
  });
  return out;
}
function particlePrep(el) {
  const B = lastTrace.beams || [], near = particleBeams(el, B);
  if (!near.length) return null;
  const keep = new Set();
  for (let { i } of near) while (i >= 0 && !keep.has(i)) { keep.add(i); i = B[i].parent; }
  const ids = new Set([...keep].map(i => B[i].src));
  const srcs = allSources().filter(e => ids.has(e.id));
  const kept = [...keep].sort((x, y) => x - y).map(i => B[i]);
  const key = el.id + '|' + [el.x, el.y, el.z] + '|' + popKeyOf(kept, srcs) + JSON.stringify(srcs.map(e => [e.popModel, beamOn(e)])) + JSON.stringify(project.cavityLock || {})
    + '|trap' + JSON.stringify([el.trap, el.trapMat, el.trapR, el.trapRho, el.trapMed, el.trapP, el.trapT, el.trapShape, el.trapLen]);
  return { keep, srcs, key };
}
/* the strongest of them in a field run: { dom: { sg }, len, x, dz } */
export function particleDom(el, R) {
  const near = particleBeams(el).sort((a, b) => b.I - a.I);
  for (const q of near) { const sg = R.segs.find(s => s.i === q.i); if (sg) return { dom: { sg }, len: q.t, x: q.x, dz: q.dz, w: q.w }; }
  return null;
}
/* what a Particle part's scattering run depends on: the beams near it, with its own settings; null where there is no
   particle or no light */
export function scatterPrep(el) {
  if (!el || el.type !== 'particle') return null;
  const job = particlePrep(el);
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
/* The plane waves on a particle at world point C (bench mm; C[2] its height above zRef, the strongest beam's), one set a
   launch: { n, d, E } with d each wave's direction and E its field at C (V/m, exp(-i w t)),
   and what was made of each beam. nMed scales the fields as the trap does. */
export function scatterWaves(parts, C, nMed, size, zRef = BEAM_Z) {
  const byL = new Map(), notes = { varies: false, pupils: 0, plane: 0, parts: [] }, refs = new Map();
  for (const q of parts) {
    // where C is in this beam's own frame (beamFrame): across, up, along; a level beam's as it always was
    const b = q.b, F = beamFrame(b), r = [C[0] - F.P0[0], C[1] - F.P0[1], C[2] + (zRef - F.P0[2])];
    const pz = r[0] * F.d[0] + r[1] * F.d[1] + r[2] * F.d[2], px = r[0] * F.ex[0] + r[1] * F.ex[1] + r[2] * F.ex[2];
    const py = F.level ? r[2] : r[0] * F.ey[0] + r[1] * F.ey[1] + r[2] * F.ey[2];
    const s = Math.sqrt(2 * q.Pw * 1e6 / (nMed * EPS0 * C_SI)), ex = F.ex, ey = F.ey, dd = F.d;
    const d = [], E = [];
    // beam frame (x across, y up, z along) to the world, the field conjugated
    const push = (dv, e) => {
      d.push(dv[0] * ex[0] + dv[1] * ey[0] + dv[2] * dd[0], dv[0] * ex[1] + dv[1] * ey[1] + dv[2] * dd[1], dv[0] * ex[2] + dv[1] * ey[2] + dv[2] * dd[2]);
      E.push(s * (e[0] * ex[0] + e[2] * ey[0] + e[4] * dd[0]), -s * (e[1] * ex[0] + e[3] * ey[0] + e[5] * dd[0]), s * (e[0] * ex[1] + e[2] * ey[1] + e[4] * dd[1]), -s * (e[1] * ex[1] + e[3] * ey[1] + e[5] * dd[1]),
        s * (e[0] * ex[2] + e[2] * ey[2] + e[4] * dd[2]), -s * (e[1] * ex[2] + e[3] * ey[2] + e[5] * dd[2]));
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
    if (!byL.has(q.coh)) byL.set(q.coh, { d: [], E: [], pupils: 0 });
    const L = byL.get(q.coh);
    if (q.P) L.pupils++;
    // this beam's own field at the centre: the launch's strongest is what the scattered light's phase is held against
    { const e0 = [0, 0, 0, 0, 0, 0]; for (let o = 0; o < E.length; o++) e0[o % 6] += E[o];
      notes.parts.push({ q, e0, d: F.d });
      const I0 = e0.reduce((a, v) => a + v * v, 0), r0 = refs.get(q.coh);
      if (!r0 || I0 > r0.I) refs.set(q.coh, { I: I0, E: e0, beam: q.sg ? q.sg.i : -1, src: b.src, lmw: b.lmw, nm: b.nm, coh: q.coh }); }
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
    launches.push({ n: keep.length, d, E, pupils: L.pupils });
  }
  [...byL.keys()].forEach((c, i) => { launches[i].ref = refs.get(c); });
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
/* A particle's own scattered light that a retro-reflector brings back to it (the beam it scatters from comes back on itself:
   one beam of the launch going on, one coming back), scattered again, iterated until the light coming back changes by less
   than RETURN_TOL or RETURN_PASSES are done. The optics that bring the beam back bring the scattered light back the same
   way: they turn the light leaving the focus along d back along -d, its field the same vector times c, the ratio of the
   returning beam's field to the going one's at the focus (the two beams' own fields there). Light leaving the particle at r_s
   from the focus comes back to the image of it, -r_s: at the particle each returning wave is
      A(-d) = (i c / lambda) F(d) exp(-2 i k d . r_s),   d within the returning optic's cone,
   F the particle's far field (its whole field: the beams' scattering and the returned light's). The returned waves join the
   launch: the particle's far field, its scattered power and its extinction (the returned light's included) take them; the
   bench's cones carry the far field on. In a cavity (more than one beam of the launch going either way: the light would come
   back again and again) one pass only, and flagged: scattering inside a cavity is not modelled. Mie only. */
const RETURN_TOL = 1e-7, RETURN_PASSES = 12;
export const CAVITY_WARNING = 'Scattering inside a cavity is not modelled: the light comes back to the particle more than once, and the readings take its scattered light back to it once only.';
function returnPlan(L, g) {
  const { TB, nMed, zRef, C, d0, k, flags } = g;
  const coh = L.ref && L.ref.coh;
  if (!coh) return;
  const mine = TB.parts.filter(q => q.coh === coh), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const fw = mine.filter(q => dot(beamFrame(q.b).d, d0) > 0.5);
  if (!fw.length) return;
  const q0 = fw.reduce((a, q) => (q.Pw > a.Pw ? q : a));
  // light that comes back: a beam going the other way that the going beam itself became (its ancestors include the going beam's
  // leg through here), not a second arm of the same laser sent in from the other side
  const B = lastTrace.beams || [], from = (q, a) => { if (!q.sg || !a.sg) return false; for (let j = B[q.sg.i] ? B[q.sg.i].parent : -1; j >= 0; j = B[j].parent) if (j === a.sg.i) return true; return false; };
  const bk = mine.filter(q => dot(beamFrame(q.b).d, d0) < -0.5 && from(q, q0));
  if (!bk.length) return;
  // a cavity: more than one return, or the returned light going on past the particle again
  const cavity = bk.length > 1 || mine.some(q => q !== q0 && !bk.includes(q) && from(q, q0));
  if (cavity && !flags.includes('cavity')) flags.push('cavity');
  // the focus: of the going beam's pupil, or its waist
  const Fq = beamFrame(q0.b), tf = q0.P ? q0.P.Rf : -q0.b.qr;
  const Cf = [0, 1, 2].map(i => Fq.P0[i] + Fq.d[i] * tf);
  // the two beams' fields there, physicists' convention (scatterWaves)
  const Wf = scatterWaves([q0, bk[0]], [Cf[0], Cf[1], Cf[2] - zRef], nMed, 0, zRef).notes.parts;
  const ef = Wf.find(p => p.q === q0).e0, eb = Wf.find(p => p.q === bk[0]).e0;
  let nr = 0, ni = 0, den = 0;
  for (let m = 0; m < 3; m++) { nr += eb[2 * m] * ef[2 * m] + eb[2 * m + 1] * ef[2 * m + 1]; ni += eb[2 * m + 1] * ef[2 * m] - eb[2 * m] * ef[2 * m + 1]; den += ef[2 * m] ** 2 + ef[2 * m + 1] ** 2; }
  if (!(den > 0)) return;
  const cr = nr / den, ci = ni / den;
  // the returning optic's cone: the returning beam's pupil, or its element's aperture as seen from the focus
  // (the element's own rim: a pupil's last samples stop short of it where the beam has faded)
  let half = 0;
  const qb = bk[0], id = qb.b.ev && (qb.b.ev.el || qb.b.ev), el = typeof id === 'string' ? getEl(id) : null;
  if (el) { const a = 0.5 * (el.diameter || el.length || 0), r = Math.hypot(el.x - Cf[0], el.y - Cf[1], zOf(el) - Cf[2]); if (a > 0 && r > 0) half = Math.atan(a / r); }
  if (!(half > 0) && qb.P && qb.P.NA > 0) half = Math.asin(Math.min(1, qb.P.NA));
  if (!(half > 0)) return;
  const G = coneGrid(d0, half, 24, 48), m = G.w.length, dirs = G.dirs;
  const rs = [(C[0] - Cf[0]) * 1e-3, (C[1] - Cf[1]) * 1e-3, (zRef + C[2] - Cf[2]) * 1e-3], lam = 2 * Math.PI / k;
  const nd = new Float64Array(3 * m); for (let i = 0; i < 3 * m; i++) nd[i] = -dirs[i];
  const ph = new Float64Array(2 * m);
  for (let o = 0; o < m; o++) { const a = -2 * k * (dirs[3 * o] * rs[0] + dirs[3 * o + 1] * rs[1] + dirs[3 * o + 2] * rs[2]), w = G.w[o] / lam; ph[2 * o] = w * Math.cos(a); ph[2 * o + 1] = w * Math.sin(a); }
  // (i c) times the phase and the weight, applied to F's three components
  const waves = Fc => {
    const E = new Float64Array(6 * m);
    for (let o = 0; o < m; o++) {
      const gr = -ci * ph[2 * o] - cr * ph[2 * o + 1], gi = cr * ph[2 * o] - ci * ph[2 * o + 1];
      for (let q = 0; q < 6; q += 2) { const fr = Fc[6 * o + q], fi = Fc[6 * o + q + 1]; E[6 * o + q] = gr * fr - gi * fi; E[6 * o + q + 1] = gr * fi + gi * fr; }
    }
    return { n: m, d: nd, E };
  };
  return { dirs, m, waves, cavity, cap: cavity ? 1 : RETURN_PASSES, info: { c: [cr, ci], halfDeg: half / deg, waves: m, cavity } };
}
// how much a far field changed between passes (RMS, relative)
const farChange = (Fn, Fc) => { let num = 0, dn = 0; for (let i = 0; i < Fn.length; i++) { num += (Fn[i] - Fc[i]) ** 2; dn += Fn[i] ** 2; } return dn > 0 ? Math.sqrt(num / dn) : 0; };
// the returned waves, from the far field the particle settled on, joined to the launch
function returnJoin(L, R, Fc, out, extra) {
  const W = R.waves(Fc), n0 = L.n, m = R.m, d = new Float64Array(3 * (n0 + m)), E = new Float64Array(6 * (n0 + m));
  d.set(L.d); d.set(W.d, 3 * n0); E.set(L.E); E.set(W.E, 6 * n0);
  L.n0 = n0; L.d = d; L.E = E; L.n = n0 + m;
  out.ret = Object.assign({}, R.info, extra);
}
/* the Mie sphere: its far field is linear in the waves, so each pass adds the returned waves' own */
function particleReturn(L, g) {
  const { k, tab, out } = g, R = returnPlan(L, g);
  if (!R) return;
  const Finc = mieFarWaves(tab, k, L, R.dirs);
  let Fc = Finc, passes = 0, change = 0;
  for (; passes < R.cap; passes++) {
    const Fr = mieFarWaves(tab, k, R.waves(Fc), R.dirs), Fn = new Float64Array(Finc.length);
    for (let i = 0; i < Fn.length; i++) Fn[i] = Finc[i] + Fr[i];
    change = farChange(Fn, Fc); Fc = Fn;
    if (change < RETURN_TOL) { passes++; break; }
  }
  returnJoin(L, R, Fc, out, { passes, change });
}
/* The run, as a generator: it yields { stage, ... } as it goes (so a worker can report and be
   stopped) and returns the answer, or { error }. R is the field run of scatterPrep's beams. */
export function* scatterGen(el, R, opts) {
  if (!el || el.type !== 'particle') return { error: 'no particle' };
  const t0 = Date.now(), sd = particleDom(el, R);
  if (!sd) return { error: 'no beam' };
  const { dom, len } = sd, b0 = dom.sg.b, nm = b0.nm;
  // (a Particle part: the trap's and the beams' reach round it is three radii of its strongest beam, as particleBeams takes them)
  el = Object.assign(Object.create(el), { length: 2 * Math.max(0.02, 3 * sd.w) });
  const P = particleOf(el), nBench = b0.n, nMed = trapMedium(el, nBench, nm);
  const [npr, npi] = particleIndex(el.trapMat, nm), mr = npr / nMed, mi = npi / nMed, mAbs = Math.hypot(mr, mi);
  const k = 2 * Math.PI * nMed / (nm * 1e-9), Z = Z0_OHM / nMed, aEq = P.rEq * 1e-9, area = Math.PI * aEq * aEq;
  const pick = scatterModel(el, P, k, mAbs), model = pick.model;
  yield { stage: 'light' };
  // the beams, and where the particle is: the trap frame's x across the strongest beam in the plane, y out of it, z along it
  const TB = trapBeams(el, R, dom, len, { reach: 3.2, M: 64 });
  if (!TB.parts.length) return { error: 'no focused beam' };
  // the strongest beam's own frame: along it, across it (in the bench plane when it is level), up from it
  const F0 = beamFrame(b0), d0 = F0.d, a0 = F0.ex, up = F0.ey, zRef = F0.P0[2];
  // (a Particle part sits where it is put: off the beam's axis by what it is)
  let at = [sd.x, sd.dz, 0], atTrap = false, trapMiss = false, trapRaw = null;
  {
    let T = null;
    try { T = trapSolve(el, R, dom, len); } catch (err) { T = null; }
    if (T) trapRaw = T.error ? { error: T.error } : Object.assign({}, T, { nm });
    if (el.scatAt === 'trap') { if (T && T.trap) { at = [T.x, T.y, T.z]; atTrap = true; } else trapMiss = true; }
  }
  at = [at[0] + (el.scatDx || 0) * 1e-3, at[1] + (el.scatDy || 0) * 1e-3, at[2] + (el.scatDz || 0) * 1e-3];
  // the particle's centre: x and y the world's, its height above zRef
  const C = [0, 1, 2].map(i => (i < 2 ? TB.P0[i] : TB.P0[2] - zRef) + at[0] * a0[i] + at[1] * up[i] + at[2] * d0[i]);
  const W = scatterWaves(TB.parts, C, nMed, 0.5e3 * Math.max(P.D, P.L), zRef);
  const launches = W.launches.filter(L => L.n > 0);
  if (!launches.length) return { error: 'no light' };
  // the light at the centre, and the strongest launch's polarisation there (square to the beam)
  const E0s = launches.map(wavesAt0), E2 = E0s.reduce((a, e) => a + abs2(e), 0), I0 = 0.5 * E2 / Z;
  let iDom = 0; E0s.forEach((e, i) => { if (abs2(e) > abs2(E0s[iDom])) iDom = i; });
  let pol = E0s[iDom].slice();
  { const lr = pol[0] * d0[0] + pol[2] * d0[1] + pol[4] * d0[2], li = pol[1] * d0[0] + pol[3] * d0[1] + pol[5] * d0[2]; for (let m = 0; m < 3; m++) { pol[2 * m] -= lr * d0[m]; pol[2 * m + 1] -= li * d0[m]; } }
  { const l = Math.sqrt(abs2(pol)); pol = l > 0 ? pol.map(v => v / l) : [a0[0], 0, a0[1], 0, a0[2], 0]; }
  const single = launches.length === 1 && launches[0].n === 1;
  // the particle's axis and its frame
  const az = (particleAz(el) || 0) * deg, tl = (el.trapTilt || 0) * deg, axis = [Math.cos(tl) * Math.cos(az), Math.cos(tl) * Math.sin(az), Math.sin(tl)];
  const body = frameOn(axis);
  const flags = [];
  if (Math.abs(nMed - nBench) > 1e-3) flags.push('medium');
  if (W.notes.varies) flags.push('varies');
  if (TB.skipped.length) flags.push('skipped');
  if (trapMiss) flags.push('notrap');
  const out = { model, auto: pick.auto, shape: P.shape, D: P.D * 1e9, L: P.L * 1e9, rEq: P.rEq, mat: el.trapMat, np: [npr, npi], m: [mr, mi], nMed, nBench, nm, k,
    x: k * aEq, kL: k * Math.max(P.D, P.L) / 2, area, I0, E2, at: { x: at[0], y: at[1], z: at[2], trap: atTrap }, beams: TB.parts.length, launches: launches.length,
    waves: launches.reduce((a, L) => a + L.n, 0), pupils: W.notes.pupils, plane: W.notes.plane, routes: TB.parts.map(q => (q.P ? q.P.route : 'beam')), single, dir: d0, pol, axis, flags,
    // where the particle is on the bench (mm; z its height above the breadboard), and the trap there (a Particle part's Trap tab)
    pos: [C[0], C[1], zRef + C[2]], elPos: [el.x, el.y, zOf(el)], ...(trapRaw ? { trapRaw } : {}) };
  // A particle inside a cavity its light goes round: solved in the cavity's modes where it can be (engines/scatter-cavity.js),
  // the launch the cavity's legs are in taking the light that comes back along the axis. Where it cannot (a degenerate,
  // ring, clipped, turned or misaligned cavity) the light that comes back is taken once, flagged (returnPlan).
  const t0c = Date.now(), plan = cavityPlan(TB, [C[0], C[1], C[2] + zRef]);
  let cavK = null, cavL = -1;
  if (plan && !plan.why) {
    const field = (q, Pw) => { const W = scatterWaves([q], [Pw[0], Pw[1], Pw[2] - zRef], nMed, 0, zRef).launches[0]; return W && W.n ? W.E : [0, 0, 0, 0, 0, 0]; };
    cavK = cavityModes(plan, field, nm, nMed);
    cavL = launches.findIndex(L => L.ref && L.ref.coh === plan.legF.q.coh);
    if (cavK.why || cavL < 0) { plan.why = cavK.why || 'launch'; cavK = null; cavL = -1; }
  }
  // A degenerate cavity (or one near it) is solved in the pupil instead (engines/scatter-pupil.js): the particle's light as
  // directions over the mirrors' caps, each traced round to its return
  let pup = null, pupL = -1, pupWhy = null, tail = null;
  // (a cavity the mode solve takes, cavK, is gone through too where its mirrors bring the particle's light back re-imaged:
  // there the modes past the solve's list carry as much as those in it, and the returns are followed for them. See cavTail)
  // (only while the returns are few enough to have been checked, and to be worth the following: they fade as the round
  // trip does, a reflection each for a cavity near concentric; a finer cavity keeps its list, and its warning)
  const fadeIn = cavK ? Math.log(1e-9) / (0.5 * Math.log(Math.min(0.999999, Math.hypot(cavK.lam00[0], cavK.lam00[1])))) : Infinity;
  const forTail = !!(plan && !plan.why && cavK && CAV_TAIL.on && fadeIn <= CAV_TAIL_LONG);
  if (plan && (plan.why === 'degenerate' || plan.why === 'unstable' || forTail)) {
    const Cw = [C[0], C[1], C[2] + zRef], PP = pupilPlan(TB, Cw, nMed, nm, el, forTail);
    if (PP && !PP.why) {
      // the empty cavity's waves at the particle: forward (towards the far mirror: the light let in and the loop's leg) and back
      const at = q => { const W = scatterWaves([q], C, nMed, 0, zRef).launches[0]; return W && W.n ? Array.from(W.E.subarray(0, 6)) : [0, 0, 0, 0, 0, 0]; };
      const sum = qs => qs.map(at).reduce((a, e) => a.map((v, i) => v + e[i]), [0, 0, 0, 0, 0, 0]);
      const ef = sum([PP.legF.q, ...PP.entry]), eb = at(PP.legB.q);
      // along the light's own polarisation
      const pr = e => [pol[0] * e[0] + pol[1] * e[1] + pol[2] * e[2] + pol[3] * e[3] + pol[4] * e[4] + pol[5] * e[5], pol[0] * e[1] - pol[1] * e[0] + pol[2] * e[3] - pol[3] * e[2] + pol[4] * e[5] - pol[5] * e[4]];
      const f = pr(ef), b = pr(eb), d = f[0] * f[0] + f[1] * f[1], h2 = d > 0 ? [(b[0] * f[0] + b[1] * f[1]) / d, (b[1] * f[0] - b[0] * f[1]) / d] : null;
      // each leg's own light at the particle, as plane waves over the grid: its field there spread by its beam's angular
      // spectrum (referred to the particle: its waist z before it and its axis r off it)
      const legWaves = (q, sg) => {
        const b0 = q.b, Fb = beamFrame(b0), r = [0, 1, 2].map(i => Cw[i] - Fb.P0[i]), t = r[0] * Fb.d[0] + r[1] * Fb.d[1] + r[2] * Fb.d[2];
        const kmm = 2 * Math.PI * b0.n / (b0.nm * 1e-6), z = b0.qr + t, w0 = Math.sqrt(b0.nm * 1e-6 / b0.n * b0.qi / Math.PI), off = [0, 1, 2].map(i => r[i] - t * Fb.d[i]);
        return { q, e: at(q), kmm, z, w0, off, d: Fb.d, sg };
      };
      PP.legSpec = [legWaves(PP.legF.q, 1), legWaves(PP.legB.q, -1)];
      PP.entrySpec = PP.entry.map(q => legWaves(q, 1));         // the light let in, on its way past the particle the first time
      // the round trip, as the empty cavity's own light has it at the particle: the forward wave is the light let in and
      // the loop's forward leg, and the leg is the round trip of the whole (f = entry + lam f), so lam = leg / f. (The
      // steady state's Ritz value is no measure here: a concentric cavity's round trip is a shear, with no mode of its own)
      // In a stable cavity near degeneracy the steady state's TEM00 Ritz value is sound, and the ray's own round trip is it
      // without TEM00's Gouy phase: lam_ray = lam_00 e^{i (Gx + Gy)/2}, G the round trip's Gouy phases along the legs
      const fl = pr(at(PP.legF.q)), Rz = pupLock(PP), along = PP.c.mode && PP.c.mode.along;
      let lam = d > 0 ? [(fl[0] * f[0] + fl[1] * f[1]) / d, (fl[1] * f[0] - fl[0] * f[1]) / d] : null, how = 'field', h2ray = h2, gouyHalf = 0;
      if (Rz && along && along.length === PP.c.p) {
        let G2 = 0;
        for (const A of along) for (const key of ['qx', 'qy']) { const q0 = A[key], z1 = q0[0] + A.len / A.n; G2 += 0.5 * (Math.atan2(z1, q0[1]) - Math.atan2(q0[0], q0[1])); }
        lam = [Rz.lam[0] * Math.cos(G2) - Rz.lam[1] * Math.sin(G2), Rz.lam[0] * Math.sin(G2) + Rz.lam[1] * Math.cos(G2)]; how = 'mode';
      }
      const lock = Rz && lam ? { lam, delta: Rz.delta, ritz: Rz.lam, how } : null;
      pupL = launches.findIndex(L => L.ref && L.ref.coh === PP.legF.q.coh);
      if (!lock) pupWhy = 'steady';
      else if (pupL < 0) pupWhy = 'launch';
      else {
        const G = pupGrid(PP);
        // each leg's own light as plane waves: its field, as the field run has it, over a square across its way at the
        // particle (the steady state's every round trip, not one Gaussian: a concentric cavity's come back ever more
        // curved), Fourier summed onto the grid's directions of its own way; along the light's polarisation
        // (kept with the map while the bench's sources are as they were and the leg's field is the same at nine places
        // across it: the sampling is a few seconds, and a solve that only changes the particle finds the same light)
        const kmm = 2 * Math.PI * nMed / (nm * 1e-6), NS = 64;
        const srcSig = JSON.stringify(project.elements.filter(e => e.type === 'source' && e.bench === el.bench));
        const allSpec = [...PP.legSpec, ...PP.entrySpec];
        const kept = PP.map.spec && PP.map.spec.sig === srcSig && PP.map.spec.legs.length === allSpec.length ? PP.map.spec : null, store = { sig: srcSig, legs: [] };
        for (const [li, LS] of allSpec.entries()) {
          const half = 4 * Math.max(LS.w0, 0.004), h = 2 * half / NS, smp = [];
          const fieldAt = (u, v) => {
            const Pt = [0, 1, 2].map(q => C[q] + u * PP.ex[q] + v * PP.ey[q]), W = scatterWaves([LS.q], Pt, nMed, 0, zRef).launches[0], e = W && W.n ? W.E : null;
            return e ? pr(e) : null;
          };
          const probe = [];
          for (const [a, b] of [[0, 0], [0.11, 0], [0, 0.13], [-0.17, 0], [0, -0.19], [0.23, 0.29], [-0.31, 0.37], [0.41, -0.43], [-0.47, -0.53]]) { const e = fieldAt(a * half, b * half); probe.push(e ? e[0] : NaN, e ? e[1] : NaN); }
          const was = kept && kept.legs[li], scale = Math.hypot(probe[0], probe[1]) || 1;
          if (was && was.half === half && was.n === G.N && was.probe.every((v, x) => Math.abs(v - probe[x]) <= 1e-10 * scale)) { LS.spec = was.spec; store.legs.push(was); continue; }
          for (let a = 0; a < NS; a++) for (let b = 0; b < NS; b++) {
            const u = -half + (a + 0.5) * h, v = -half + (b + 0.5) * h, e = fieldAt(u, v);
            if (e) smp.push([u, v, ...e]);
          }
          const spec = new Float64Array(2 * G.N);
          for (let i = 0; i < G.N; i++) {
            const ux = G.dirs[3 * i] * PP.ex[0] + G.dirs[3 * i + 1] * PP.ex[1] + G.dirs[3 * i + 2] * PP.ex[2], uy = G.dirs[3 * i] * PP.ey[0] + G.dirs[3 * i + 1] * PP.ey[1] + G.dirs[3 * i + 2] * PP.ey[2];
            const c = G.dirs[3 * i] * LS.d[0] + G.dirs[3 * i + 1] * LS.d[1] + G.dirs[3 * i + 2] * LS.d[2];
            if (c <= 0) continue;
            let sr = 0, si = 0;
            for (const [u, v, er, ei] of smp) { const ph = -kmm * (ux * u + uy * v), cs = Math.cos(ph), sn = Math.sin(ph); sr += er * cs - ei * sn; si += er * sn + ei * cs; }
            spec[2 * i] = sr; spec[2 * i + 1] = si;
          }
          LS.spec = spec;
          store.legs.push({ half, n: G.N, probe, spec });
        }
        PP.map.spec = store;
        // The half trip by the far mirror. The standing wave's b / f at the particle is a field's: the forward light's
        // every plane wave brought back by the far mirror and summed, and a plane wave of a beam is not a ray from the
        // particle. Across the axis the half trip is a paraxial system (A: how a ray's crossing moves with where it
        // started, B: with its direction; the map's own, on the axis), which takes the plane wave along theta to
        // (1/A) e^{-ik B theta^2 / 2A} of the axial ray's factor at the particle: -1 for an exactly concentric cavity
        // (A = -1, B = 0), where the field's half trip is the ray's. So the ray's half trip is b / f over minus the
        // forward light's own spectrum's mean of that (the Gouy phase the light itself picks up: the mode's for a
        // matched beam, less for a beam the cavity is too near degeneracy to shape).
        if (h2 && PP.pattern === 1) {
          const R0 = pupMapAt(PP, G, PP.dir, [0, 0, 0], true), A = R0 && R0.J ? 0.5 * (R0.J.A[0] + R0.J.A[3]) : 0, B = R0 && R0.J ? 0.5 * (R0.J.B[0] + R0.J.B[3]) : 0;
          if (Math.abs(A) > 1e-6) {
            let nr = 0, ni = 0, dr = 0, di = 0;
            for (let i = 0; i < G.N; i++) {
              let gr = 0, gi = 0;
              for (const LS of [PP.legSpec[0], ...PP.entrySpec]) if (LS.spec) { gr += LS.spec[2 * i]; gi += LS.spec[2 * i + 1]; }
              if (gr === 0 && gi === 0) continue;
              const ua = G.dirs[3 * i] * PP.ex[0] + G.dirs[3 * i + 1] * PP.ex[1] + G.dirs[3 * i + 2] * PP.ex[2], ub = G.dirs[3 * i] * PP.ey[0] + G.dirs[3 * i + 1] * PP.ey[1] + G.dirs[3 * i + 2] * PP.ey[2];
              const ph = -kmm * B * (ua * ua + ub * ub) / (2 * A), kr = -Math.cos(ph) / A, ki = -Math.sin(ph) / A, w = G.w[i];
              nr += w * (gr * kr - gi * ki); ni += w * (gr * ki + gi * kr); dr += w * gr; di += w * gi;
            }
            const dd = dr * dr + di * di, gam = dd > 0 ? [(nr * dr + ni * di) / dd, (ni * dr - nr * di) / dd] : [1, 0], g2 = gam[0] * gam[0] + gam[1] * gam[1];
            if (g2 > 1e-6) { h2ray = [(h2[0] * gam[0] + h2[1] * gam[1]) / g2, (h2[1] * gam[0] - h2[0] * gam[1]) / g2]; gouyHalf = Math.atan2(gam[1], gam[0]); }
          }
        }
        const Rt = pupReturns(PP, G, 2 * Math.PI / (nm * 1e-6), nMed, nm * 1e-9 / nMed, h2ray, lock.lam);
        if (!Rt) pupWhy = 'noimage';
        else pup = { PP, G, Rt, f, b, h2, h2ray, gouyHalf, lock, lamM: nm * 1e-9 / nMed, nm, nMed };
      }
    } else if (PP) pupWhy = PP.why;
    if (forTail) {
      tail = pup; pup = null; pupL = -1; pupWhy = null;
      // how far from the particle the returns cross its plane, as the phase the map's carrying across leaves out
      // (k q^3 / R^2, q the mode's Rayleigh range times the cap's half angle, R the tighter mirror's radius): see CAV_TAIL_REACH
      if (tail) {
        const Rm = Math.min(...tail.PP.M.map(m => Math.abs(m.el.R || Infinity))), q = plan.qF[0][1] * tail.PP.map.caps[0].s / 1.1;
        tail.reach = isFinite(Rm) ? 2 * Math.PI / (nm * 1e-6) * q * q * q / (Rm * Rm) : Infinity;
      }
    }
    if (pup) plan.why = null;
  }
  /* The returns for the mode solve. Its list of modes stops at an order (CAV_NMAX); the particle's light goes into every
     order the mirrors' rims pass, and near degeneracy the orders past the list carry as much as those in it (their
     round trips differ little from one to the next, so they do not average away: the list's sum does not settle with
     the order, and paraxial frequencies are wrong for the high ones). The same light followed ray by ray through the
     tracer's map (pupChains: every return, to the rims) is all the orders at once. So where the map has the returns
     re-imaged, the four sums the mode solve needs (the field along the axis each way at the particle per unit far field
     ahead and back) are taken from the chains instead of from the list. Elsewhere the list stands. */
  const cavTail = () => {
    if (!tail) return null;
    if (tail.Gt) return tail.Gt;
    const { G, Rt, lamM } = tail, N = G.N, t0 = Date.now();
    const Sm = tail.S || (tail.S = pupChains(tail.PP, G, Rt, 2 * Math.PI / (tail.nm * 1e-6), tail.nMed, lamM));
    const e = [plan.ex, plan.ey], d = plan.dir, sums = [[0, 0], [0, 0], [0, 0], [0, 0]];        // ff, fb, bf, bb (to, from)
    const fwd = new Uint8Array(N);
    for (let i = 0; i < N; i++) fwd[i] = G.dirs[3 * i] * d[0] + G.dirs[3 * i + 1] * d[1] + G.dirs[3 * i + 2] * d[2] > 0 ? 1 : 0;
    for (let from = 0; from < 2; from++) for (let pl = 0; pl < 2; pl++) {
      // a unit far field along e[pl], square to each direction, into the cap ahead (from = 0) or back
      const F = new Float64Array(6 * N), ev = e[pl];
      for (let i = 0; i < N; i++) {
        if (fwd[i] !== (from === 0 ? 1 : 0)) continue;
        const u = [G.dirs[3 * i], G.dirs[3 * i + 1], G.dirs[3 * i + 2]], ue = u[0] * ev[0] + u[1] * ev[1] + u[2] * ev[2];
        for (let q = 0; q < 3; q++) F[6 * i + 2 * q] = ev[q] - u[q] * ue;
      }
      const A = pupApplyChains(G, Sm, F);
      for (let i = 0; i < N; i++) {
        const w = G.w[i], to = fwd[i] ? 0 : 1, acc = sums[2 * to + from];
        for (let q = 0; q < 3; q++) { acc[0] += 0.5 * w * ev[q] * A[6 * i + 2 * q]; acc[1] += 0.5 * w * ev[q] * A[6 * i + 2 * q + 1]; }
      }
    }
    tail.Gt = { ff: sums[0], fb: sums[1], bf: sums[2], bb: sums[3], returns: Sm.returns, longest: Sm.longest, ms: Date.now() - t0, kept: !!Sm.kept };
    return tail.Gt;
  };
  // (one the solve does not take keeps the warning, whether or not its light is seen to come back by returnPlan)
  if (plan && plan.why && !flags.includes('cavity')) flags.push('cavity');
  if (plan) out.cav = { canon: plan.c.id, name: plan.c.name, solved: !plan.why, why: plan.why || null, degen: plan.degen || null, finesse: plan.c.finesse, gouy: plan.c.gouy, ...(pupWhy ? { pupWhy } : {}) };
  // the pupil solve, for a launch: x = T(-i lambda x + F0 + P x), respond(A) the particle's far field over the grid for the
  // waves A (6 N, per steradian); the returned waves joined to the launch
  const pupSolve = function* (L, F0, respond) {
    const { G, Rt, lamM } = pup, N = G.N, t0p = Date.now();
    // x = S (F0 + P x), S every return of the particle's light by the empty cavity, followed ray by ray (pupChains): GMRES
    // has only the particle's own part to find
    const t0s = Date.now(), Sm = pup.S || (pup.S = pupChains(pup.PP, G, Rt, 2 * Math.PI / (pup.nm * 1e-6), pup.nMed, lamM));
    const tChains = Date.now() - t0s, terms = Sm.returns;
    const asked = [];
    const B = function* (x) { const r = yield* respond(x); asked.push(r); return pupApplyChains(G, Sm, r); };
    const rhs = pupApplyChains(G, Sm, F0), S = yield* pupGmres(B, rhs);
    const x = S.x, n0 = L.n, d = new Float64Array(3 * (n0 + N)), E = new Float64Array(6 * (n0 + N));
    d.set(L.d); E.set(L.E); d.set(G.dirs, 3 * n0);
    const e0 = wavesAt0(L), er = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) for (let q = 0; q < 6; q++) { const v = x[6 * i + q] * G.w[i]; E[6 * (n0 + i) + q] = v; er[q] += v; }
    L.n0 = n0; L.d = d; L.E = E; L.n = n0 + N;
    const et = e0.map((v, q) => v + er[q]);
    // what the cavity's light is taken by in the field run: each leg's wave against its own, coming in and going out
    // (the forward leg carries the whole forward change; the light let in, none), by projection on its spectrum
    // (the particle's answer to x: the solve's own sum of the answers it asked for, when it was found in one go)
    let Px;
    if (S.comb && S.comb.length === asked.length) {
      Px = new Float64Array(6 * N);
      S.comb.forEach((y, i) => { const r = asked[i]; for (let q = 0; q < 6 * N; q += 2) { Px[q] += y[0] * r[q] - y[1] * r[q + 1]; Px[q + 1] += y[0] * r[q + 1] + y[1] * r[q]; } });
    } else Px = yield* respond(x);
    const Fp = new Float64Array(6 * N), Fp0 = F0;
    for (let q = 0; q < 6 * N; q++) Fp[q] = F0[q] + Px[q];
    L.farGrid = Fp;            // the particle's far field in all this launch's light, along the grid's directions
    // A leg's light is A = e g / sum(w g) over the grid (e its field at the particle, g its spectrum's shape, the field
    // run's own); the change X of the waves going its way is taken as one factor on it, 1 + r. Backward, the leg is all
    // the light there is and r = <A, X> / <A, A>. Forward, the light let in goes the same way on its first pass and is
    // not the loop's (the field run leaves it as it is): the factor on the loop's leg is the one that changes the power
    // of all the forward light as X does, r = <A_all, X> / <A_all, A_leg>, A_all the leg's and the light let in. (Where
    // every pass has the same shape, a confocal cavity's, the two are one; in a concentric cavity each pass comes back
    // more curved, and the far detector reads the whole.)
    const tin = [], tout = [];
    const cm2 = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]], cj = a => [a[0], -a[1]];
    const cd2 = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
    // for a spectrum: sum(w g), sum(w |g|^2), and <e g, X> = sum w conj(e g) . X for the incoming change x and the
    // outgoing one, x + Fp / (-i lambda) = x + i Fp / lambda
    const against = LS => {
      const g = LS.spec, e = LS.e, S1 = [0, 0], nin = [0, 0], nout = [0, 0];
      let gg = 0;
      for (let i = 0; i < N; i++) {
        const gr = g[2 * i], gi = g[2 * i + 1];
        if (gr === 0 && gi === 0) continue;
        S1[0] += G.w[i] * gr; S1[1] += G.w[i] * gi; gg += G.w[i] * (gr * gr + gi * gi);
        for (let q = 0; q < 3; q++) {
          const er2 = e[2 * q] * gr - e[2 * q + 1] * gi, ei2 = e[2 * q] * gi + e[2 * q + 1] * gr;
          const xr = x[6 * i + 2 * q], xi = x[6 * i + 2 * q + 1];
          const orr = xr - Fp[6 * i + 2 * q + 1] / lamM, oi = xi + Fp[6 * i + 2 * q] / lamM;
          nin[0] += G.w[i] * (er2 * xr + ei2 * xi); nin[1] += G.w[i] * (er2 * xi - ei2 * xr);
          nout[0] += G.w[i] * (er2 * orr + ei2 * oi); nout[1] += G.w[i] * (er2 * oi - ei2 * orr);
        }
      }
      return { LS, S1, gg, nin, nout };
    };
    void Fp0;
    for (const [li, LS] of pup.PP.legSpec.entries()) {
      const R0 = against(LS), ee = abs2(LS.e), S2 = R0.S1[0] * R0.S1[0] + R0.S1[1] * R0.S1[1];
      // <A, X> = <e g, X> / conj(S1); <A, A> = |e|^2 gg / |S1|^2
      let numIn = cd2(R0.nin, cj(R0.S1)), numOut = cd2(R0.nout, cj(R0.S1)), den = [ee * R0.gg / S2, 0];
      if (li === 0) for (const ES of pup.PP.entrySpec || []) {
        if (!ES.spec) continue;
        const Re = against(ES), ce = cj(Re.S1);
        if (!(Re.gg > 0)) continue;
        const a = cd2(Re.nin, ce), b = cd2(Re.nout, ce);
        numIn = [numIn[0] + a[0], numIn[1] + a[1]]; numOut = [numOut[0] + b[0], numOut[1] + b[1]];
        // <A_e, A_leg> = (conj(e_e) . e_leg) sum(w conj(g_e) g_leg) / (conj(S_e) S_leg)
        const ed = [0, 0], go = [0, 0];
        for (let q = 0; q < 3; q++) { ed[0] += ES.e[2 * q] * LS.e[2 * q] + ES.e[2 * q + 1] * LS.e[2 * q + 1]; ed[1] += ES.e[2 * q] * LS.e[2 * q + 1] - ES.e[2 * q + 1] * LS.e[2 * q]; }
        for (let i = 0; i < N; i++) { const ar = ES.spec[2 * i], ai = ES.spec[2 * i + 1], br = LS.spec[2 * i], bi = LS.spec[2 * i + 1]; go[0] += G.w[i] * (ar * br + ai * bi); go[1] += G.w[i] * (ar * bi - ai * br); }
        const cross = cd2(cm2(ed, go), cm2(ce, R0.S1));
        den = [den[0] + cross[0], den[1] + cross[1]];
      }
      const ri = cd2(numIn, den), ro = cd2(numOut, den);
      tin[li] = [1 + ri[0], ri[1]]; tout[li] = [1 + ro[0], ro[1]];
    }
    const cdv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
    // by loop leg: [0] or [1] of the cavity's segments
    const jf = pup.PP.legF.j, jb = pup.PP.legB.j, Tin = [], Tout = [];
    Tin[jf] = tin[0]; Tout[jf] = tout[0]; Tin[jb] = tin[1]; Tout[jb] = tout[1];
    out.cav.load = { start: Tin[0], ends: [cdv(Tout[0], Tin[0]), cdv(Tout[1], Tout[0])] };
    out.cav.s = { fin: tin[0], fout: tout[0], bin: tin[1], bout: tout[1] };
    out.cav.mirrors = pup.PP.M.map(m => m.el.id);
    Object.assign(out.cav, { method: 'pupil', pattern: pup.PP.pattern, nodes: N, lost: Rt.lost, iters: S.iters, terms, longest: Sm.longest, msChains: tChains, chainsKept: !!Sm.kept, resid: S.resid, fresnel: pup.PP.fresnel, h2: pup.h2, h2ray: pup.h2ray, gouyHalf: pup.gouyHalf, lam00: pup.lock.lam, lamHow: pup.lock.how, ritz: pup.lock.ritz, dLock: pup.lock.delta,
      E2ratio: abs2(et) / abs2(e0), returnedField: er, back: (() => { let r = 0, i = 0; for (let q = 0; q < 6; q += 2) { r += e0[q] * er[q] + e0[q + 1] * er[q + 1]; i += e0[q] * er[q + 1] - e0[q + 1] * er[q]; } return [r / abs2(e0), i / abs2(e0)]; })(), f0: pup.f, b0: pup.b, dir: pup.PP.dir, ms: Date.now() - t0p });
    if (pup.PP.fresnel < PUP_FRESNEL && !flags.includes('fresnel')) flags.push('fresnel');
    if (plan.degen && cavUnchecked(plan.c, plan.degen) && !flags.includes('pupilFar')) flags.push('pupilFar');
    return { x, er };
  };
  const pupWaves = A => { const N = pup.G.N, E = new Float64Array(6 * N); for (let i = 0; i < N; i++) for (let q = 0; q < 6; q++) E[6 * i + q] = A[6 * i + q] * pup.G.w[i]; return { n: N, d: pup.G.dirs, E }; };
  const cavDirs = cavK ? Float64Array.of(...plan.dir, ...plan.dir.map(v => -v)) : null;
  const unitWave = i => ({ n: 1, d: Float64Array.from(i < 2 ? plan.dir : plan.dir.map(v => -v)), E: Float64Array.from((i % 2 ? plan.ey : plan.ex).flatMap(v => [v, 0])) });
  // the solve's answer kept on the answer, and the returned waves joined to the launch
  const cavDone = (L, sol) => {
    // the light at the particle with its returns against its own (as the pupil solve reports it)
    { const e0 = wavesAt0(L), et = e0.map((v, q) => v + sol.Ef[q] + sol.Eb[q]); out.cav.E2ratio = abs2(et) / abs2(e0); }
    const n0 = L.n, d = new Float64Array(3 * (n0 + 2)), E = new Float64Array(6 * (n0 + 2));
    d.set(L.d); E.set(L.E); d.set(plan.dir, 3 * n0); d.set(plan.dir.map(v => -v), 3 * n0 + 3); E.set(sol.Ef, 6 * n0); E.set(sol.Eb, 6 * n0 + 6);
    L.n0 = n0; L.d = d; L.E = E; L.n = n0 + 2;
    if (cavUnchecked(plan.c, null) && !(tail && tail.reach <= CAV_TAIL_REACH && tail.Gt && tail.Gt.longest <= CAV_TAIL_LONG) && !flags.includes('modeNear')) flags.push('modeNear');
    if (tail && tail.Gt) out.cav.tail = { returns: tail.Gt.returns, longest: tail.Gt.longest, ms: tail.Gt.ms, kept: tail.Gt.kept, pattern: tail.PP.pattern, fresnel: tail.PP.fresnel, reach: tail.reach };
    const lamM = plan.c.lam0 / plan.nLeg, zR = plan.qF[0][1];
    Object.assign(out.cav, { f00: cavK.modes[0].f0[cavK.sp], b00: cavK.modes[0].b0[cavK.sp], modes: cavK.kept.length, kept: cavK.kept.map(M => [M.m, M.n]), lam00: cavK.lam00, rho200: cavK.rho200, dLock: cavK.dLock,
      shiftK: sol.shiftK, widenK: sol.widenK, lwK: sol.lwK, shiftLw: sol.shiftLw, widenLw: sol.widenLw, shiftHz: sol.shiftK * C_SI / (2 * Math.PI), widenHz: sol.widenK * C_SI / (2 * Math.PI),
      returned: { f: sol.x.slice(0, 2), b: sol.x.slice(2) }, s: sol.s, load: sol.load, legs: { f: plan.legF.j, b: plan.legB.j }, p: plan.c.p, dir: plan.dir,
      th0: lamM / (Math.PI * Math.sqrt(lamM * zR / Math.PI)), Pf: cavK.Pf, Pb: cavK.Pb, ms: Date.now() - t0c });
  };
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
    const Fb = far(Float64Array.of(-d0[0], -d0[1], F0.level ? 0 : -d0[2]));
    return { Csca: T.total / e2, Cext: ext, Cabs: abs, g: T.g, Qback: 4 * Math.PI * abs2(Array.from(Fb)) / e2 / area };
  };
  if (model === 'mie') {
    if (P.shape !== 'sphere') flags.push('mieNotSphere');
    const tab = mieTable(CM);
    // the particle's own light that a retro-reflector brings back to it, scattered again (see particleReturn)
    for (let i = 0; i < launches.length; i++) {
      const L = launches[i];
      if (pup && i === pupL) { yield* pupSolve(L, mieFarWaves(tab, k, L, pup.G.dirs), function* (A) { return mieFarWaves(tab, k, pupWaves(A), pup.G.dirs); }); continue; }
      if (i !== cavL) { particleReturn(L, { TB, nMed, zRef, F0, C, d0, k, tab, flags, out }); continue; }
      cavDone(L, cavitySolve(plan, cavK, mieFarWaves(tab, k, L, cavDirs), j => mieFarWaves(tab, k, unitWave(j), cavDirs), k, nMed, cavTail()));
    }
    for (const L of launches) {
      fars.push(dirs => mieFarWaves(tab, k, L, dirs));
      yield { stage: 'sphere' };
      // the optical theorem, wave by wave: P_ext = (4 pi / k) / (2 Z) Im sum conj(E_o) . F(d_o)
      // (a pupil solve's returned waves: along them the far field is the solve's own)
      let F;
      if (L.farGrid && L.n0 !== undefined && L.farGrid.length === 6 * (L.n - L.n0)) { F = new Float64Array(6 * L.n); F.set(mieFarWaves(tab, k, L, L.d.subarray(0, 3 * L.n0))); F.set(L.farGrid, 6 * L.n0); }
      else F = mieFarWaves(tab, k, L, L.d);
      let s = 0; for (let q = 0; q < F.length; q += 2) s += L.E[q] * F[q + 1] - L.E[q + 1] * F[q];
      Pext.push(4 * Math.PI / k * s / (2 * Z)); Pabs.push(null);
    }
    ref = { Csca: out.mieEq.Csca, Cext: out.mieEq.Cext, Cabs: out.mieEq.Cabs, g: QM.g, Qback: QM.Qback };
    out.mie = { terms: CM.n };
  } else if (model === 'rayleigh') {
    if (mAbs * out.kL > 0.5) flags.push('rayleighBig');
    for (let i = 0; i < E0s.length; i++) {
      const e0 = E0s[i];
      // its own light a retro-reflector brings back: the field of the returned waves at its centre added, iterated
      let e = e0, p = smallP(e);
      if (pup && i === pupL) {
        const sol = yield* pupSolve(launches[i], dipoleFar(k, p, pup.G.dirs), function* (A) { const W = pupWaves(A); return dipoleFar(k, smallP(wavesAt0(W)), pup.G.dirs); });
        e = e0.map((v, q) => v + sol.er[q]); p = smallP(e);
      }
      if (i === cavL) {
        const sol = cavitySolve(plan, cavK, dipoleFar(k, p, cavDirs), j => dipoleFar(k, smallP(Array.from(unitWave(j).E)), cavDirs), k, nMed, cavTail());
        e = e0.map((v, q) => v + sol.Ef[q] + sol.Eb[q]); p = smallP(e);
        cavDone(launches[i], sol);
      }
      const R = i === cavL || (pup && i === pupL) ? null : returnPlan(launches[i], { TB, nMed, zRef, C, d0, k, flags });
      if (R) {
        let Fc = dipoleFar(k, p, R.dirs), passes = 0, change = 0;
        for (; passes < R.cap; passes++) {
          const er = wavesAt0(R.waves(Fc)); e = e0.map((v, q) => v + er[q]); p = smallP(e);
          const Fn = dipoleFar(k, p, R.dirs); change = farChange(Fn, Fc); Fc = Fn;
          if (change < RETURN_TOL) { passes++; break; }
        }
        returnJoin(launches[i], R, Fc, out, { passes, change });
      }
      fars.push(dirs => dipoleFar(k, p, dirs));
      let s = 0; for (let q = 0; q < 3; q++) s += e[2 * q] * p[2 * q + 1] - e[2 * q + 1] * p[2 * q];
      Pext.push(4 * Math.PI * k * s / (2 * Z)); Pabs.push(null);
    }
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
    const runSolve = function* (E, what, x0) {
      const g = S.solve(E, { tol: o.tol || 1e-5, maxIter: o.maxIter || 300, x0 });
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
      let E = wavesOnLattice(L, lat, k, body), p = yield* runSolve(E, launches.length > 1 ? 'light ' + (++n) : 'light');
      // in a cavity solved in its modes: the array's answer to a unit wave along the axis each way and each polarisation (four
      // solves), and the answer with the returned waves is the sum, the array being linear
      if (launches.indexOf(L) === cavL) {
        const Eu = [0, 1, 2, 3].map(j => wavesOnLattice(unitWave(j), lat, k, body)), pu = [];
        for (let j = 0; j < 4; j++) pu.push(yield* runSolve(Eu[j], 'the cavity\u2019s axis, wave ' + (j + 1)));
        const sol = cavitySolve(plan, cavK, farOf(p)(cavDirs), j => farOf(pu[j])(cavDirs), k, nMed, cavTail());
        const add = (A, U) => { const o = Float64Array.from(A); for (let j = 0; j < 4; j++) { const [xr, xi] = sol.x[j], u = U[j]; for (let q = 0; q < o.length; q += 2) { o[q] += xr * u[q] - xi * u[q + 1]; o[q + 1] += xr * u[q + 1] + xi * u[q]; } } return o; };
        E = add(E, Eu); p = add(p, pu);
        cavDone(L, sol);
      }
      // its own light a retro-reflector brings back: the returned field at every dipole added to the beams', and the array solved
      // again, each pass from the last answer
      // in a degenerate cavity: each pass of the pupil solve one more solve of the array (from the last answer), the array's
      // answer to all of it then the sum of the two, the array being linear
      if (pup && launches.indexOf(L) === pupL) {
        let last = null, pass = 0;
        const sol = yield* pupSolve(L, farOf(p)(pup.G.dirs), function* (A) {
          const Er = wavesOnLattice(pupWaves(A), lat, k, body);
          last = yield* runSolve(Er, 'the cavity\u2019s returns, pass ' + (++pass), last);
          return farOf(last)(pup.G.dirs);
        });
        const Er = wavesOnLattice(pupWaves(sol.x), lat, k, body), pr = yield* runSolve(Er, 'the cavity\u2019s returns', last);
        const E2 = new Float64Array(E.length), p2 = new Float64Array(p.length);
        for (let q = 0; q < E.length; q++) { E2[q] = E[q] + Er[q]; p2[q] = p[q] + pr[q]; }
        E = E2; p = p2;
      }
      const R = launches.indexOf(L) === cavL || (pup && launches.indexOf(L) === pupL) ? null : returnPlan(L, { TB, nMed, zRef, C, d0, k, flags });
      if (R) {
        const E1 = E, its = [];
        let Fc = farOf(p)(R.dirs), passes = 0, change = 0;
        for (; passes < R.cap; passes++) {
          const Er = wavesOnLattice(R.waves(Fc), lat, k, body);
          E = new Float64Array(E1.length); for (let q = 0; q < E.length; q++) E[q] = E1[q] + Er[q];
          const i0 = D.iters;
          p = yield* runSolve(E, 'returned light, pass ' + (passes + 1), p);
          its.push(D.iters - i0);
          const Fn = farOf(p)(R.dirs); change = farChange(Fn, Fc); Fc = Fn;
          if (change < RETURN_TOL) { passes++; break; }
        }
        returnJoin(L, R, Fc, out, { passes, change, iters: its });
      }
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
  // A focus's plane waves and the scattered light, direction by direction: where wave o goes on, the scattered field along
  // d_o meets it, and the two interfere there by -(4 pi / k) Im(conj(E_o) . F(d_o)) / 2Z watts (the optical theorem, one wave at
  // a time: their sum is -P_ext). Kept for a focus (more than one wave), so the bench can put each wave's share where its ray
  // lands (engines/scatter-light.js): a detector that takes in the beam reads the extinction, and one split in two the
  // particle's place. Only for a focus's waves: a gentle beam is one wave standing for the whole beam (two of them when it
  // comes back on itself), and its interference is read against the beam itself where it lands
  const waveInt = launches.map((L, i) => {
    // (the beams' own waves: the light a retro-reflector brings back meets the light scattered the other way on a detector as
    // two bundles of one family, not here)
    const n0 = L.n0 || L.n;
    if (n0 < 2 || !L.pupils) return null;
    const F = fars[i](L.d.subarray(0, 3 * n0)), p = new Float64Array(n0), e2 = new Float64Array(n0);
    let ext = 0;
    for (let o = 0; o < n0; o++) {
      let sm = 0;
      for (let q = 0; q < 6; q += 2) { sm += L.E[6 * o + q] * F[6 * o + q + 1] - L.E[6 * o + q + 1] * F[6 * o + q]; e2[o] += L.E[6 * o + q] ** 2 + L.E[6 * o + q + 1] ** 2; }
      p[o] = -4 * Math.PI / k * sm / (2 * Z);
      ext = Math.max(ext, Math.abs(L.d[3 * o] * a0[0] + L.d[3 * o + 1] * a0[1] + L.d[3 * o + 2] * a0[2]), Math.abs(F0.level ? L.d[3 * o + 2] : L.d[3 * o] * up[0] + L.d[3 * o + 1] * up[1] + L.d[3 * o + 2] * up[2]));
    }
    // The waves are a pupil's samples, a thousand or more: gathered WAVE_BINS across the pupil each way (about the beam's
    // axis, so no bin lies across it), each bin one ray along its waves' mean way (weighted by their power), polarised as
    // its strongest wave is, with the sum of their shares
    const dl = ext > 0 ? 2 * ext / WAVE_BINS : 1, bins = new Map();
    for (let o = 0; o < n0; o++) {
      const a = L.d[3 * o] * a0[0] + L.d[3 * o + 1] * a0[1] + L.d[3 * o + 2] * a0[2], c = F0.level ? L.d[3 * o + 2] : L.d[3 * o] * up[0] + L.d[3 * o + 1] * up[1] + L.d[3 * o + 2] * up[2], fw = L.d[3 * o] * d0[0] + L.d[3 * o + 1] * d0[1] + L.d[3 * o + 2] * d0[2] >= 0;
      const key = (Math.floor(a / dl) + 64) * 256 + (Math.floor(c / dl) + 64) + (fw ? 0 : 65536);
      let B = bins.get(key); if (!B) bins.set(key, B = { p: 0, w: 0, d: [0, 0, 0], top: -1, o: 0 });
      B.p += p[o]; B.w += e2[o]; for (let q = 0; q < 3; q++) B.d[q] += e2[o] * L.d[3 * o + q];
      if (e2[o] > B.top) { B.top = e2[o]; B.o = o; }
    }
    const n = bins.size, d = new Float32Array(3 * n), pb = new Float64Array(n), e = new Float32Array(6 * n);
    let j = 0;
    for (const B of bins.values()) {
      const l = Math.hypot(B.d[0], B.d[1], B.d[2]) || 1, le = Math.sqrt(B.top) || 1;
      for (let q = 0; q < 3; q++) d[3 * j + q] = B.d[q] / l;
      for (let q = 0; q < 6; q++) e[6 * j + q] = L.E[6 * B.o + q] / le;
      pb[j++] = B.p;
    }
    return { n, d, p: pb, e };
  });
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
  // refs: each launch's strongest beam (its number in the trace, its source and line, its coherence family) and that beam's own
  // field at the particle, which the scattered light's phase on the bench is held against (engines/scatter-light.js)
  out.far = { axes: [a0, up, d0], mu: Array.from(G.mu), phi: Array.from(G.phi), F: FG.map(F => Float32Array.from(F)), refs: launches.map(L => L.ref || null), waves: waveInt };
  out.ms = Date.now() - t0;
  return out;
}
/* The answers kept, a screen each, under the key they were worked out for: the page's worker fills it (ui/scatter.js),
   and scatterNow; the data export and the 3D view read it */
export const scatCache = new Map();
/* An answer taken into the cache. The bench's trace launches a Particle part's scattered light from the answer kept
   for it, so the trace's key counts the answers taken (scatRevNow): a new one is a new trace. */
let scatRev = 0;
export const scatRevNow = () => scatRev;
export function scatKeep(id, key, S) { scatCache.set(id, { key, S }); const el = getEl(id); if (el && el.type === 'particle') scatRev++; }
/* How a trace gets an answer it does not have: 'sync', worked out there and then (Node, the tests, a script's
   worker); 'async', the page's own worker is asked and the last answer stands meanwhile (ui/scatter.js); 'off',
   none (the other workers, which trace a bench for something else). */
let scatMode = null;
export const scatModeNow = () => scatMode || (IN_WORKER ? 'off' : 'sync');
export function setScatMode(m) { scatMode = m; }
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
  const S = scatterRun(el, popRun(lastTrace.beams, job.srcs, { keep: job.keep, bare: true }), opts);
  scatKeep(el.id, job.key, S);
  return S;
}
