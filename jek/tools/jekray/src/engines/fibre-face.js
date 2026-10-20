import { BEAM_Z, clamp } from '../core/constants.js';
import { C_NM_GHZ, responsivity, rfBeam } from '../core/rf.js';
import { HORN_FIELDS } from '../core/horns.js';
import { cohModes, lagOf, splitRoot } from '../core/coherence.js';
import { hermite, m2Of } from '../core/pulses.js';
import { fanFromGauss, srcModes } from '../core/beams-hom.js';
import { deg } from '../state/project.js';
import { benchNms, getEl } from '../state/elements.js';
import { frame, toLocal, toLocalDir } from '../core/mask.js';
import { lastTrace, rollFrame, sourceLines, tipFrame, zOf } from './trace.js';
import { QEig, QRot, beamQ, beamQM, cavEventABCD, ccInv, mfree, qThrough } from './cavity.js';
import { detectorFieldResult, viaCavity } from './pd-cavity.js';

/* ---------- Fibres and photodetectors: the field that reaches their face ----------
   A fibre takes in the overlap of the arriving field with its own mode; a photodiode takes
   all of |E|^2 over its active area. Both are worked out from the Gaussian beams that arrive,
   rebuilt on the face: each branch's q in the bench plane (from the tracer) and out of it
   (carried along its branch by the same matrices the cavities use), where it lands, its
   tilt and its optical path. Branches of one launch add as fields, so a Michelson's output
   diode sees its fringe; separate launches add as powers. Ray fans reaching a detector count
   ray by ray instead. */
/* Marcuse's fit for a step-index fibre's fundamental mode: its 1/e^2 radius from the core
   radius a and V = 2 pi a NA / lambda */
export function fibreMode(coreUm, na, nm) {
  const a = coreUm / 2, V = 2 * Math.PI * a * na / (nm / 1000);
  return { w: 1e-3 * a * (0.65 + 1.619 * Math.pow(V, -1.5) + 2.879 * Math.pow(V, -6)), V };
}
/* the mode a single-mode tip sends out and takes in by, its 1/e^2 radius at the face, mm: the fibre's own, or with a collimating
   lens of focal length f, the collimated beam it makes, lambda f / (pi w), its waist taken on the lens (its Rayleigh range is
   metres against the lens's millimetres) */
export const tipModeW = (tip, nm) => { const w = fibreMode(tip.core, tip.na, nm).w; return tip.coll > 0 ? nm * 1e-6 * tip.coll / (Math.PI * w) : w; };
/* a source launched from a fibre: its beam is the fibre's mode, waist on the tip */
export function applyFibre(src) {
  if (!src.fibre) return;
  src.gauss = true; src.w0 = fibreMode(src.fibre.core, src.fibre.na, src.wavelength).w; src.z0 = 0; src.m2 = 1; src.tem = 'gauss';
  fanFromGauss(src); fanFromFibre(src);
}
/* Light leaving a fibre's end starts at the mode's waist, a few microns across, so its rays are
   drawn as they spread in the far field: from the core, out to the beam's 1/e^2 angle,
   lambda/(pi w0) for one mode (times M^2), the NA for a filled multimode core */
export function fanFromFibre(src, na) {
  const th = na ? Math.asin(Math.min(na, 0.99)) : Math.atan(src.wavelength * 1e-6 * m2Of(src) / (Math.PI * src.w0));
  src.divergence = clamp(2 * th / deg, -179, 179);
}
/* the same for the field's readouts: where above or below the centre it lands (lz), its slope up the
   face and its way along it; a tipped or rolled face takes its place and its tilt across from it too */
export function arrival3(el, b) {
  if (!(el.z !== undefined || el.tip || el.roll || b.z0 !== undefined && b.z0 !== BEAM_Z || b.uz || b.d3)) return {};
  const H = faceHit(el, b);
  return Object.assign({ lz: H.v0, vs: H.vs, ldy3: H.ldy }, el.tip || el.roll ? { ly: H.u0, p: H.ldx } : {});
}
/* Where a beam segment lands on a part's face and how it meets it: u0 across the face, v0 up
   it, from its centre; (ldx, ldy) its way in the plane against the face's normal and along it,
   and vs its slope up the face. A face tipped or rolled out of the plane is taken in its own
   frame (see intersectTip) */
function faceHit(el, b) {
  const f = frame(el);
  let [lx, u0] = toLocal(f, b.x0 + b.dx * b.len, b.y0 + b.dy * b.len);
  let v0 = b.z0 !== undefined ? b.z0 + (b.d3 ? b.d3[2] * b.len3 : (b.uz || 0) * b.len) - zOf(el) : 0, vs = b.uz || 0;
  let [ldx, ldy] = toLocalDir(f, b.dx, b.dy);
  if (el.tip || el.roll) {
    const F = { tip: (el.tip || 0) * deg, roll: (el.roll || 0) * deg };
    const D = b.d3 ? [...toLocalDir(f, b.d3[0], b.d3[1]), b.d3[2]] : [ldx, ldy, vs], dl = Math.hypot(D[0], D[1], D[2]);
    const [, qz0] = tipFrame(F, lx, v0), [ex, ez0] = tipFrame(F, D[0] / dl, D[2] / dl);
    [u0, v0] = rollFrame(F, u0, qz0);
    const [ey, ez] = rollFrame(F, D[1] / dl, ez0), hx = Math.hypot(ex, ey);
    ldx = ex / hx; ldy = ey / hx; vs = ez / hx;
  }
  return { u0, v0, ldx, ldy, vs };
}
export function faceArrivals(el) {
  const B = lastTrace.beams || [], out = [], f = frame(el);
  B.forEach((b, i) => {
    if (b.endEl !== el.id || b.fan || b.dx * f.c + b.dy * f.s >= 0) return;
    const src = getEl(b.src);
    if (!src || !src.gauss) return;
    const lam0 = b.nm * 1e-6;
    const chain = [];
    for (let j = i; j >= 0; j = B[j].parent) chain.push(j);
    chain.reverse();
    const r0 = B[chain[0]];
    let qy = [r0.qr / r0.n, r0.qi / r0.n];
    for (let c = 0; c < chain.length && qy; c++) {
      const bb = B[chain[c]];
      if (c > 0) { const m = cavEventABCD(bb.ev, lam0); qy = m ? qThrough(m.y, qy) : null; }
      if (qy) qy = qThrough(mfree(bb.len3 || bb.len, bb.n), qy);
    }
    const bL = b.len3 || b.len;                    // along the beam: in 3D, for a leg that rises
    const qx = [(b.qr + bL) / b.n, b.qi / b.n];
    const { u0, v0, ldx, ldy, vs } = faceHit(el, b);
    // a branch of a beam split at an element's edge: a Gaussian here can only stand for its share
    // of the power, and the parts do not add as whole Gaussians (the diffracted field has their shapes)
    const jj = b.J.reduce((a2, v) => a2 + v * v, 0), share = jj > 0 ? b.w / jj : 1;
    const split = share < 0.999;
    // a beam whose axes were turned on its way: its whole Q (see beamQ)
    const QG = beamQ(B, i, lam0);
    const A = { b, src, lam0, qx, qy: qy || qx, ...(QG ? { Q: QG } : {}), u0, v0, vs, ldx, ldy, J: split ? b.J.map(v => v * Math.sqrt(share)) : b.J, coh: split ? b.coh + '#split' + i : b.coh, opl: (b.opl || 0) + b.n * bL, gpl: (b.gpl || 0) + (b.ng || b.n) * bL, lag: lagOf(src), nm: b.nm, fo: b.fo || 0 };
    // a beam of M^2 above 1: its Hermite-Gauss modes, each a launch of its own; a higher-order
    // mode, its coherent sum of them
    const modes = srcModes(src);
    // the modes' amplitudes are given on the launch plane (as the field engine takes them); here
    // each mode's Gouy phase is counted from the waist, so the launch plane's is put in first
    const g0 = Math.atan2(r0.qi, r0.qr), launch = c => c.map(([m, n, a2, b2]) => { const p = (m + n) * g0, cs = Math.cos(p), sn = Math.sin(p); return [m, n, a2 * cs - b2 * sn, a2 * sn + b2 * cs]; });
    // a higher-order beam through parts that turn or treat its axes apart: its modes along its way (see beamQM)
    const withModes = (A2, c0) => { const c = launch(c0), QM = beamQM(B, i, lam0, c, (src.roll || 0) * deg); return QM ? Object.assign(A2, { comps: QM.comps, QM }) : Object.assign(A2, { comps: c }); };
    if (modes.length === 1) out.push(modes[0].c.length === 1 && !modes[0].c[0][0] && !modes[0].c[0][1] && !src.roll ? A : withModes(A, modes[0].c));
    else modes.forEach(({ w, c }, k) => out.push(withModes(Object.assign({}, A, { J: b.J.map(v => v * Math.sqrt(w)), coh: b.coh + '#m' + k }), c)));
  });
  return out;
}
export const qW = (q, lam0) => Math.sqrt(-lam0 / (Math.PI * (-q[1] / (q[0] * q[0] + q[1] * q[1]))));
/* Where a face's arrivals are worth sampling: four beam radii round each, across (u) and up (v),
   cut to a disc of radius a. A beam may land above or below the centre (see faceArrivals) */
export function arrivalWindow(arr, a) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const A of arr) {
    let wx = qW(A.qx, A.lam0) / (Math.abs(A.ldx) || 1), wy = qW(A.qy, A.lam0), c = A.v0 || 0;
    if (A.Q) { const P = ccInv(A.Q), m = Math.min(-P[0][1], -P[3][1]) - Math.abs(P[1][1]), w = Math.sqrt(A.lam0 / Math.PI / Math.max(1e-30, m)); wx = w / (Math.abs(A.ldx) || 1); wy = w; }
    u0 = Math.min(u0, A.u0 - 4 * wx); u1 = Math.max(u1, A.u0 + 4 * wx); v0 = Math.min(v0, c - 4 * wy); v1 = Math.max(v1, c + 4 * wy);
  }
  return [Math.max(u0, -a), Math.min(u1, a), Math.max(v0, -a), Math.min(v1, a)];
}
/* One arrival's s and p field at a point (u along the face, v out of the plane), in power
   per unit face area, in the field's e^{-ikz} convention */
export function arrivalField(A, u, v0) {
  // the face's point against the beam's own cross-section: across it level (x), and up it square
  // to that (y); a beam arriving sloped out of the plane has its footprint stretched up the face
  const k = 2 * Math.PI / A.lam0, hx = A.vs ? 1 / Math.sqrt(1 + A.vs * A.vs) : 1, ez = (A.vs || 0) * hx;
  const du = u - A.u0, dv = v0 - (A.v0 || 0), xb = du * A.ldx, v = A.vs ? hx * dv - ez * A.ldy * du : dv, cT = (Math.abs(A.ldx) || 1) * hx;
  if (A.QM) {
    // a higher-order beam in its own frame: x1, y1 along its axes, each with its q and gathered Gouy phase
    const M = A.QM, c0 = Math.cos(M.th), s0 = Math.sin(M.th), x1 = xb * c0 + v * s0, y1 = -xb * s0 + v * c0;
    const Qf = QRot(M.Q, M.th), qa = Qf[0], qb = Qf[3];
    const ia = [qa[0] / (qa[0] ** 2 + qa[1] ** 2), -qa[1] / (qa[0] ** 2 + qa[1] ** 2)], ib = [qb[0] / (qb[0] ** 2 + qb[1] ** 2), -qb[1] / (qb[0] ** 2 + qb[1] ** 2)];
    const wa = qW(qa, A.lam0), wb = qW(qb, A.lam0);
    const re = 0.5 * k * (ia[1] * x1 * x1 + ib[1] * y1 * y1);
    const ph = -0.5 * k * (ia[0] * x1 * x1 + ib[0] * y1 * y1) - k * (A.opl + du * A.ldy * hx + (A.vs ? dv * ez : 0)) - 0.5 * M.psi[0] - 0.5 * M.psi[1];
    const amp0 = Math.sqrt(2 / (Math.PI * wa * wb)) * Math.exp(re) * Math.sqrt(cT);
    let c = 0, sn = 0;
    for (const [mx, my, ar, ai] of M.comps) {
      let f = 1; for (let i = 2; i <= mx; i++) f *= i; for (let i = 2; i <= my; i++) f *= i;
      const a = amp0 * hermite(mx, Math.SQRT2 * x1 / wa) * hermite(my, Math.SQRT2 * y1 / wb) / Math.sqrt(Math.pow(2, mx + my) * f);
      const p2 = ph - mx * M.psi[0] - my * M.psi[1], er = a * Math.cos(p2), ei = a * Math.sin(p2);
      c += er * ar - ei * ai; sn += er * ai + ei * ar;
    }
    const J = A.J;
    return [c * J[0] + sn * J[1], sn * J[0] - c * J[1], c * J[2] + sn * J[3], sn * J[2] - c * J[3]];
  }
  if (A.Q && !A.comps) {
    // a beam with its axes turned (see beamQ): exp(-i k r.P.r / 2), P = Q^-1, normalised over the face
    const P = ccInv(A.Q), a = P[0][0] * xb * xb + 2 * P[1][0] * xb * v + P[3][0] * v * v, bI = P[0][1] * xb * xb + 2 * P[1][1] * xb * v + P[3][1] * v * v;
    const dI = P[0][1] * P[3][1] - P[1][1] * P[1][1], [l1, l2] = QEig(A.Q);
    const ph = -0.5 * k * a - k * (A.opl + du * A.ldy * hx + (A.vs ? dv * ez : 0)) - 0.5 * (Math.atan2(l1[1], l1[0]) + Math.atan2(l2[1], l2[0]));
    const amp0 = Math.sqrt(k / Math.PI) * Math.pow(Math.max(0, dI), 0.25) * Math.exp(0.5 * k * bI) * Math.sqrt(cT);
    const c = amp0 * Math.cos(ph), sn = amp0 * Math.sin(ph), J = A.J;
    return [c * J[0] + sn * J[1], sn * J[0] - c * J[1], c * J[2] + sn * J[3], sn * J[2] - c * J[3]];
  }
  const iq = q => { const d = q[0] * q[0] + q[1] * q[1]; return [q[0] / d, -q[1] / d]; };
  const ix = iq(A.qx), iy = iq(A.qy);
  const wx = qW(A.qx, A.lam0), wy = qW(A.qy, A.lam0);
  // exp(-i k x^2 / 2q): the real part of 1/q curves it, the imaginary part is the envelope
  const re = -0.5 * k * (-ix[1] * xb * xb - iy[1] * v * v);
  const gx = Math.atan2(A.qx[1], A.qx[0]), gy = Math.atan2(A.qy[1], A.qy[0]);
  // and its phase, by how far along the beam the point is (a tilted arrival's fringes)
  const ph = -0.5 * k * (ix[0] * xb * xb + iy[0] * v * v) - k * (A.opl + du * A.ldy * hx + (A.vs ? dv * ez : 0)) - 0.5 * gx - 0.5 * gy;
  const amp0 = Math.sqrt(2 / (Math.PI * wx * wy)) * Math.exp(re) * Math.sqrt(cT);
  let c, sn;
  if (!A.comps) { c = amp0 * Math.cos(ph); sn = amp0 * Math.sin(ph); }
  else {
    // the Hermite-Gauss modes, each with its own Gouy phase, added with their amplitudes
    c = 0; sn = 0;
    for (const [mx, my, ar, ai] of A.comps) {
      let f = 1; for (let i = 2; i <= mx; i++) f *= i; for (let i = 2; i <= my; i++) f *= i;
      const a = amp0 * hermite(mx, Math.SQRT2 * xb / wx) * hermite(my, Math.SQRT2 * v / wy) / Math.sqrt(Math.pow(2, mx + my) * f);
      const p2 = ph - mx * gx - my * gy, er = a * Math.cos(p2), ei = a * Math.sin(p2);
      c += er * ar - ei * ai; sn += er * ai + ei * ar;
    }
  }
  const J = A.J;
  // the tracer's Jones vector, conjugated into this convention
  return [c * J[0] + sn * J[1], sn * J[0] - c * J[1], c * J[2] + sn * J[3], sn * J[2] - c * J[3]];
}
export function groupsOf(arr) {
  const g = new Map(), out = [];
  for (const A of arr) { if (!g.has(A.coh)) g.set(A.coh, []); g.get(A.coh).push(A); }
  // a laser with a line of its own: each launch as its incoherent parts, the weights on J
  for (const G of g.values()) {
    const cm = cohModes(G[0].src, G.map(A => A.gpl + A.lag));
    if (!cm) { out.push(G); continue; }
    for (const c of cm) out.push(G.map((A, i) => Object.assign({}, A, { J: A.J.map(v => v * c[i]) })));
  }
  return out;
}
export const deviceCache = new WeakMap();
export function deviceMemo(el, fn, tag = '') {
  let M = deviceCache.get(lastTrace);
  if (!M) { M = new Map(); deviceCache.set(lastTrace, M); }
  const key = tag + el.id + JSON.stringify(el);
  if (!M.has(key)) M.set(key, fn());
  return M.get(key);
}
/* What a fibre takes in: per launch, |<E, mode>|^2 for each polarisation */
/* The error function (Abramowitz and Stegun 7.1.26, to 1.5e-7) */
export function erfA(x) {
  const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
}
/* A multimode fibre takes in what lands on its core (radius a) inside its acceptance cone:
   the share of each beam's power on the core, times the share of its angular spectrum
   (Gaussian, the beam's far-field half-angle, tilted by its angle to the axis) inside +-NA
   in each plane. A product of the two, where the real acceptance is a phase-space overlap:
   good for a fibre the light fills or under-fills, rougher near its edges. */
export function mmShare(el, A) {
  const a = el.core / 2 * 1e-3, NA = el.na;
  // a higher-order mode reaches sqrt(2N + 1) times as far, and spreads that much faster
  const fM = A.comps ? Math.sqrt(Math.max(...A.comps.map(c => 2 * (c[0] + c[1]) + 1))) : 1;
  const wx = qW(A.qx, A.lam0), wy = qW(A.qy, A.lam0), L = Math.max(a, 3 * fM * Math.max(wx, wy)), N = 64, d = 2 * L / N;
  let on = 0, all = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const u = -L + (i + 0.5) * d, v = -L + (j + 0.5) * d, E = arrivalField(A, u, v), p = E[0] ** 2 + E[1] ** 2 + E[2] ** 2 + E[3] ** 2;
    all += p; if (u * u + v * v <= a * a) on += p;
  }
  const th = q => fM * A.lam0 / (Math.PI * Math.sqrt(A.lam0 * q[1] / Math.PI));     // far-field half-angle from q's waist
  // its tilt to the fibre's axis across, and up (a beam arriving sloped, or a tip tipped)
  const tilt = Math.atan2(Math.abs(A.ldy), Math.abs(A.ldx)), tiltV = Math.atan(Math.abs(A.vs || 0));
  const ang = (t0, t) => 0.5 * (erfA(Math.SQRT2 * (NA - t) / t0) + erfA(Math.SQRT2 * (NA + t) / t0));
  return (all > 0 ? on / all : 0) * ang(th(A.qx), tilt) * ang(th(A.qy), tiltV);
}
export function fibreCoupling(el) {
  if (el.mm) return deviceMemo(el, () => {
    const arr = faceArrivals(el);
    if (!arr.length) return null;
    let inMw = 0, coupledMw = 0, pinS = 0, gotS = 0;
    for (const A of arr) {
      const pin = A.J[0] ** 2 + A.J[1] ** 2 + A.J[2] ** 2 + A.J[3] ** 2, got = pin * mmShare(el, A), P = splitRoot(A.src).power;
      pinS += pin; gotS += got; inMw += pin * P; coupledMw += got * P;
    }
    return { eff: pinS > 0 ? gotS / pinS : 0, mw: coupledMw, inMw, mode: null, share: gotS, mm: true };
  });
  return deviceMemo(el, () => {
    const arr = faceArrivals(el);
    if (!arr.length) return null;
    const N = 96;
    let inMw = 0, coupledMw = 0, arrivingShare = 0, coupledShare = 0, mode = null;
    for (const G of groupsOf(arr)) {
      const src = G[0].src, nm = G[0].nm;
      mode = fibreMode(el.core, el.na, nm); if (el.coll > 0) mode = Object.assign({}, mode, { w: tipModeW(el, nm) });
      const wf = mode.w, L = 3.5 * wf, d = 2 * L / N;
      let cs = [0, 0], cp = [0, 0], pin = 0;
      for (const A of G) pin += A.J[0] ** 2 + A.J[1] ** 2 + A.J[2] ** 2 + A.J[3] ** 2;
      const mAmp = Math.sqrt(2 / (Math.PI * wf * wf));
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const u = -L + (i + 0.5) * d, v = -L + (j + 0.5) * d;
        const M = mAmp * Math.exp(-(u * u + v * v) / (wf * wf));
        for (const A of G) {
          const E = arrivalField(A, u, v);
          cs[0] += E[0] * M; cs[1] += E[1] * M; cp[0] += E[2] * M; cp[1] += E[3] * M;
        }
      }
      const got = (cs[0] ** 2 + cs[1] ** 2 + cp[0] ** 2 + cp[1] ** 2) * d * d * d * d;
      arrivingShare += pin; coupledShare += got;
      const P = splitRoot(src).power;           // amplitudes are against the laser's own source
      inMw += pin * P; coupledMw += got * P;
    }
    return { eff: arrivingShare > 0 ? coupledShare / arrivingShare : 0, mw: coupledMw, inMw, mode, share: coupledShare };
  });
}
/* A receiving horn takes in the overlap of the arriving field with its own aperture mode: the
   field its horn would launch (horns.js), on a phase front converging on the horn's apex, the
   slant length L behind the aperture. The mode is of one polarisation (pol: s, out of the bench
   plane, or p), with its cross-polar part across it; a horn set to take both polarisations
   (a dual-polarisation horn, or one feeding a bolometer) takes each by the co-polar field.
   Fields of one launch add; separate launches add as powers. In mW, and the share; and by
   source (lines), for a mixer behind it. */
export function rfCoupling(el) {
  return deviceMemo(el, () => {
    const arr = faceArrivals(el);
    if (!arr.length) return null;
    // the grid over the whole aperture (a diagonal horn's reaches sqrt2 a out), at about the same spacing
    const rf = el.mmw, H = HORN_FIELDS[rf.kind] || HORN_FIELDS.corrugated, a = rf.a, ext = H.field ? H.ext || 1 : 1, N = Math.ceil(96 * ext);
    let inMw = 0, coupledMw = 0, inS = 0, gotS = 0, beam = null;
    const lines = new Map();
    for (const G of groupsOf(arr)) {
      const nm = G[0].nm, B = rfBeam(rf, C_NM_GHZ / nm), wa = B.wa, k = 2 * Math.PI / B.lam, L = H.field ? 1.02 * ext * a : 3.5 * wa, d = 2 * L / N;
      beam = B;
      // the mode on the grid, [co, cross] at each point, of unit power
      const mc = new Float64Array(N * N), mx = new Float64Array(N * N), rr = new Float64Array(N * N);
      let pm = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const u = -L + (i + 0.5) * d, v = -L + (j + 0.5) * d, o = i * N + j;
        const F = H.field ? H.field(u / a, v / a) : [Math.exp(-(u * u + v * v) / (wa * wa)), 0];
        mc[o] = F[0]; mx[o] = F[1]; rr[o] = u * u + v * v; pm += F[0] * F[0] + F[1] * F[1];
      }
      const mAmp = 1 / Math.sqrt(pm * d * d);
      let cr = 0, ci = 0, pin = 0;
      let c2r = 0, c2i = 0;                                 // the other polarisation, when the horn takes both
      for (const A of G) pin += A.J[0] ** 2 + A.J[1] ** 2 + A.J[2] ** 2 + A.J[3] ** 2;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const o = i * N + j;
        if (!mc[o] && !mx[o]) continue;
        const u = -L + (i + 0.5) * d, v = -L + (j + 0.5) * d;
        // the mode, M = |M| e^{+i k r^2 / 2L} (the field going as e^{-ikz}): conj(M) multiplies the field
        const ph = k * rr[o] / (2 * B.R), cs = Math.cos(ph), sn = Math.sin(ph);
        const co = mAmp * mc[o], cx = mAmp * mx[o];
        // the mode's two components: along s and p
        const Ms = rf.pol === 'p' ? cx : co, Mp = rf.pol === 's' ? cx : co;
        for (const A of G) {
          const E = arrivalField(A, u, v);
          if (rf.pol === 'both') {
            cr += (E[0] * cs + E[1] * sn) * co; ci += (E[1] * cs - E[0] * sn) * co;
            c2r += (E[2] * cs + E[3] * sn) * co; c2i += (E[3] * cs - E[2] * sn) * co;
          } else {
            cr += (E[0] * cs + E[1] * sn) * Ms + (E[2] * cs + E[3] * sn) * Mp;
            ci += (E[1] * cs - E[0] * sn) * Ms + (E[3] * cs - E[2] * sn) * Mp;
          }
        }
      }
      const got = (cr * cr + ci * ci + c2r * c2r + c2i * c2i) * d * d * d * d;
      const root = splitRoot(G[0].src), P = root.power;
      inS += pin; gotS += got; inMw += pin * P; coupledMw += got * P;
      const key = root.id, ln = lines.get(key) || { id: key, ghz: C_NM_GHZ / nm, mw: 0, inMw: 0, got: 0, ph: 0, top: -1 };
      ln.mw += got * P; ln.inMw += pin * P; ln.got += got;
      const [pr, pi] = cr * cr + ci * ci >= c2r * c2r + c2i * c2i ? [cr, ci] : [c2r, c2i];   // the phase of the stronger polarisation
      if (got > ln.top) { ln.top = got; ln.ph = Math.atan2(pi, pr); }
      lines.set(key, ln);
    }
    return { eff: inS > 0 ? gotS / inS : 0, mw: coupledMw, inMw, beam, lines: [...lines.values()] };
  }, 'rf');
}
/* What a photodiode sees, and what its amplifier makes of it */
export function detectorReading(el) {
  return deviceMemo(el, () => {
    if (el.mmw) {
      // a receiving horn: what its mode takes in, read by its front end (see elec.js for the two)
      const C = rfCoupling(el), P = C ? C.mw : 0, rf = el.mmw, kB = 1.380649e-23;
      if (rf.rx === 'mixer') {
        const g = Math.pow(10, -rf.cl / 10), Tsys = rf.tant + rf.trx, B = rf.ifbw * 1e6, Pn = kB * Tsys * B * 1e3;   // the noise in the IF band, referred to the input, mW
        const V = Math.sqrt(2 * 50 * P * 1e-3 * g);
        return { mw: P, ifMw: P * g, V, sat: false, noiseV: Math.sqrt(2 * 50 * Pn * 1e-3 * g), pending: false, field: true, rf: C, mixer: true, tsys: Tsys, mds: Pn,
          floor: 10 * Math.log10(kB * Tsys * 1e3), snr: P > 0 ? 10 * Math.log10(P / Pn) : null, lines: C ? C.lines.map(ln => Object.assign({ fif: Math.abs(ln.ghz - rf.lo) * 1e9 }, ln)) : [] };
      }
      const V = P * 1e-3 * rf.rv, noiseV = rf.rv * rf.nep * 1e-12 * Math.sqrt(rf.vbw * 1e6);
      return { mw: P, V: Math.min(V, el.vmax), sat: V > el.vmax, noiseV, pending: false, field: true, rf: C, mds: rf.nep * 1e-12 * Math.sqrt(rf.vbw * 1e6) * 1e3,
        snr: V > 0 ? 20 * Math.log10(V / noiseV) : null };
    }
    const a = el.length / 2;
    let I = 0, P = 0, pending = false;
    const F = viaCavity(el) ? detectorFieldResult(el) : null;
    if (viaCavity(el) && !F) pending = true;       // being worked out: the tracer's figure meanwhile
    if (F) { P = F.mw; I = F.mw * responsivity(el, F.nm || benchNms()[0]); }
    // Gaussian launches: |E|^2 over the active disc, fields added within each launch
    if (!F) for (const G of groupsOf(faceArrivals(el))) {
      const [u0, u1, v0, v1] = arrivalWindow(G, a);
      if (!(u1 > u0) || !(v1 > v0)) continue;
      // while the cavity's field is worked out in the worker, the figure meanwhile on a coarser grid
      const N = pending ? 48 : 128, du = (u1 - u0) / N, dv = (v1 - v0) / N;
      let pw = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const u = u0 + (i + 0.5) * du, v = v0 + (j + 0.5) * dv;
        if (u * u + v * v > a * a) continue;
        let e0 = 0, e1 = 0, e2 = 0, e3 = 0;
        for (const A of G) { const E = arrivalField(A, u, v); e0 += E[0]; e1 += E[1]; e2 += E[2]; e3 += E[3]; }
        pw += e0 * e0 + e1 * e1 + e2 * e2 + e3 * e3;
      }
      const mw = pw * du * dv * splitRoot(G[0].src).power;
      P += mw; I += mw * responsivity(el, G[0].nm);
    }
    // ray fans, ray by ray: each launched ray carries its share of its source's power
    const hits = (lastTrace.screens[el.id] || []).filter(t => !t.chief);
    for (const t of hits) {
      const src = getEl(t.id.split(':')[0]);
      if (!src || src.gauss) continue;
      const mw = t.w * splitRoot(src).power / (Math.max(1, src.rays) * sourceLines(src).length);
      P += mw; I += mw * responsivity(el, t.nm);
    }
    // noise: shot noise on the photocurrent and dark current, the feedback resistor's
    // Johnson noise, and the amplifier's own input current noise, all over the bandwidth
    const q = 1.602176634e-19, kT = 1.380649e-23 * 295, B = el.bandwidth, Ia = I * 1e-3;
    const i2 = 2 * q * (Ia + el.dark * 1e-9) * B + (el.gain > 0 ? 4 * kT * B / el.gain : 0) + (el.ampNoise * 1e-12) ** 2 * B;
    const noiseI = Math.sqrt(i2), V = Ia * el.gain;
    return { mw: P, mA: I, V: Math.min(V, el.vmax), sat: V > el.vmax, noiseV: noiseI * el.gain, noiseI, pending, field: !!F,
      snr: Ia > 0 ? 20 * Math.log10(Ia / noiseI) : null };
  });
}

