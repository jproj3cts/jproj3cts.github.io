import { BEAM_Z, clamp } from '../core/constants.js';
import { C_NM_GHZ, responsivity, rfBeam } from '../core/rf.js';
import { HORN_FIELDS } from '../core/horns.js';
import { cohGamma, cohModes, lagOf, splitRoot } from '../core/coherence.js';
import { hermite, m2Of } from '../core/pulses.js';
import { fanFromGauss, srcModes } from '../core/beams-hom.js';
import { deg } from '../state/project.js';
import { beamOn, benchNms, getEl } from '../state/elements.js';
import { frame, toLocal, toLocalDir } from '../core/mask.js';
import { lastTrace, polFrame, raysLaunched, rollFrame, sourceLines, tipFrame, zOf } from './trace.js';
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
/* (Kept for the trace it was read from and the face as it stands: a network asks for a tip's arrivals to tell
   whether it must be solved again, then again to solve it, and each readout asks once more; with a spectrum in
   slices and a beam of modes that was the larger part of a trace.) */
const FACE_ARRIVALS = new WeakMap();
export function faceArrivals(el) {
  const B = lastTrace.beams;
  if (!B) return faceArrivalsOf(el);
  let M = FACE_ARRIVALS.get(B);
  if (!M) FACE_ARRIVALS.set(B, M = new Map());
  const k = el.id + '|' + B.length + '|' + JSON.stringify([el.x, el.y, el.z, el.angle, el.tip, el.roll, el.length, el.core, el.na, el.mm, el.coll, el.type]);
  if (!M.has(k)) M.set(k, faceArrivalsOf(el));
  return M.get(k);
}
function faceArrivalsOf(el) {
  const B = lastTrace.beams || [], out = [], f = frame(el);
  B.forEach((b, i) => {
    if (b.endEl !== el.id || b.fan || b.dx * f.c + b.dy * f.s >= 0) return;
    beamArrivals(el, B, i, b, out);
  });
  return out;
}
/* beam i of the trace as it lands on a face: b is the beam itself, or the beam cut short where a face that is not
   a part stands in it (beamFieldAt) */
function beamArrivals(el, B, i, b, out) {
  {
    const src = getEl(b.src);
    if (!src || !beamOn(src)) return;
    const lam0 = b.nm * 1e-6;
    const chain = [];
    for (let j = i; j >= 0; j = B[j].parent) chain.push(j);
    chain.reverse();
    const r0 = B[chain[0]];
    let qy = [r0.qr / r0.n, r0.qi / r0.n];
    // gj: what arg(q) jumps by at the parts the beam has passed, across and up, added up along its way. A beam's Gouy
    // phase builds up only as it travels; the field below writes it as arg(q) at the face, which holds these jumps too (a lens
    // changes q at once and the phase not at all). Two branches of one beam through the same parts share them, so nothing
    // else here needs them; light that leaves the beam part way (a particle's scattered light) is set against the beam
    // with them taken out (scatOnDisc)
    let gj = 0, qyOk = true;
    const arg = q => Math.atan2(q[1], q[0]);
    for (let c = 0; c < chain.length; c++) {
      const bb = c === chain.length - 1 ? b : B[chain[c]];
      if (c > 0) {
        const pb = B[chain[c - 1]], jx = arg([bb.qr / bb.n, bb.qi / bb.n]) - arg([(pb.qr + (pb.len3 || pb.len)) / pb.n, pb.qi / pb.n]);
        let jy = jx;
        if (qy) { const m = cavEventABCD(bb.ev, lam0), q2 = m ? qThrough(m.y, qy) : null; if (q2 && qyOk) jy = arg(q2) - arg(qy); qy = q2; }
        if (!qy) qyOk = false;
        gj += jx + jy;
      }
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
    const A = { b, src, lam0, qx, qy: qy || qx, ...(QG ? { Q: QG } : {}), u0, v0, vs, ldx, ldy, gj, J: split ? b.J.map(v => v * Math.sqrt(share)) : b.J, coh: split ? b.coh + '#split' + i : b.coh, opl: (b.opl || 0) + b.n * bL, gpl: (b.gpl || 0) + (b.ng || b.n) * bL, lag: lagOf(src), nm: b.nm, fo: b.fo || 0 };
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
  }
}
/* One Gaussian beam's field at a point of the bench it passes (Z the height above the breadboard), exactly as a
   face standing there square to the beam would read it: [s re, s im, p re, p im] in the faces' convention
   (arrivalField's), per root of area, with the arrival it was read from. Null for a beam that is several modes
   adding as powers (M^2 above 1): it has no one phase. A particle's scattered light takes its phase from this, so
   it adds to the same beam on a detector as a field (engines/scatter-light.js). */
export function beamFieldAt(i, X, Y, Z) {
  const B = lastTrace.beams || [], b = B[i];
  if (!b || b.fan || b.d3 || b.uz) return null;
  const t = (X - b.x0) * b.dx + (Y - b.y0) * b.dy, out = [];
  const el = { id: '~point', type: 'detector', x: X, y: Y, z: Z, angle: Math.atan2(-b.dy, -b.dx) / deg, length: 1 };
  beamArrivals(el, B, i, Object.assign({}, b, { len: t }), out);
  if (out.length !== 1) return null;
  return { A: out[0], E: arrivalField(out[0], 0, 0) };
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
const QM_FACE = new WeakMap();
export function arrivalField(A, u, v0) {
  // the face's point against the beam's own cross-section: across it level (x), and up it square
  // to that (y); a beam arriving sloped out of the plane has its footprint stretched up the face
  const k = 2 * Math.PI / A.lam0, hx = A.vs ? 1 / Math.sqrt(1 + A.vs * A.vs) : 1, ez = (A.vs || 0) * hx;
  const du = u - A.u0, dv = v0 - (A.v0 || 0), xb = du * A.ldx, v = A.vs ? hx * dv - ez * A.ldy * du : dv, cT = (Math.abs(A.ldx) || 1) * hx;
  if (A.QM) {
    // a higher-order beam in its own frame: x1, y1 along its axes, each with its q and gathered Gouy phase
    const M = A.QM, c0 = Math.cos(M.th), s0 = Math.sin(M.th), x1 = xb * c0 + v * s0, y1 = -xb * s0 + v * c0;
    // the beam's own q's, widths and mode norms: the same at every point of the face, worked out once an arrival
    let F = QM_FACE.get(M);
    if (!F) {
      const Qf = QRot(M.Q, M.th), qa = Qf[0], qb = Qf[3];
      F = { ia: [qa[0] / (qa[0] ** 2 + qa[1] ** 2), -qa[1] / (qa[0] ** 2 + qa[1] ** 2)], ib: [qb[0] / (qb[0] ** 2 + qb[1] ** 2), -qb[1] / (qb[0] ** 2 + qb[1] ** 2)], wa: qW(qa, A.lam0), wb: qW(qb, A.lam0),
        norm: M.comps.map(([mx, my]) => { let f = 1; for (let i = 2; i <= mx; i++) f *= i; for (let i = 2; i <= my; i++) f *= i; return 1 / Math.sqrt(Math.pow(2, mx + my) * f); }) };
      QM_FACE.set(M, F);
    }
    const { ia, ib, wa, wb } = F;
    const re = 0.5 * k * (ia[1] * x1 * x1 + ib[1] * y1 * y1);
    const ph = -0.5 * k * (ia[0] * x1 * x1 + ib[0] * y1 * y1) - k * (A.opl + du * A.ldy * hx + (A.vs ? dv * ez : 0)) - 0.5 * M.psi[0] - 0.5 * M.psi[1];
    const amp0 = Math.sqrt(2 / (Math.PI * wa * wb)) * Math.exp(re) * Math.sqrt(cT);
    let c = 0, sn = 0;
    for (let ci = 0; ci < M.comps.length; ci++) {
      const [mx, my, ar, ai] = M.comps[ci];
      const a = amp0 * hermite(mx, Math.SQRT2 * x1 / wa) * hermite(my, Math.SQRT2 * y1 / wb) * F.norm[ci];
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
/* ---------- A particle's scattered light on a face ----------
   The cones the trace launched from a Particle part (engines/scatter-light.js) arrive as rays, kept apart from the
   rays a face records (lastTrace.scat.hits). A cone's rays are a grid, rings by spokes about its axis, and each ray
   knows its place in it. How the landing points change from ring to ring and from spoke to spoke gives the area dA
   a ray's tube has on the face (coneDeriv), so the ray's power p is a field of amplitude sqrt(p / dA) there, with the
   ray's own polarisation and the phase of its optical path. An integral over the face of that field against
   anything smooth is then a sum over the rays, f(u_i, v_i) sqrt(p_i dA_i): so it adds to the Gaussian beams of its
   own coherence family as a field, on a photodiode (and each half of one) and in a fibre's mode. Between its rays
   the field is the nearest ray's, with the phase carried on to second order from the ray's own direction and how
   the directions change across the face (bundleAt): so two cones of one family that land on one face add as fields
   too. Geometric: right where the cone is wide on the face against a wavelength, as it is after a collimating lens
   or straight from the particle, and not at a focus (a fibre's mode is taken a little way back from the tip for
   that: scatModeAmp).
   Gives the bundles on a face, one for each cone and each way it came by: [{ src, coh, lmw (mW a ray of unit power
   carries), nm, gpl0, lag, rays: [{ u, v (on the face, mm), gu, gv (the ray's direction along the face: the slope of
   its optical path there), pw, dA (0 where its neighbours did not land), E (the field's vector on the bench's
   axes, 6 numbers, in the faces' convention, |E|^2 = pw), opl, d (its way), h (its hit, in a list), ri, sj (its ring and spoke) }] }] */
const facePoint = (el, f, x, y, z) => {
  let [lx, u] = toLocal(f, x, y), v = z - zOf(el);
  if (el.tip || el.roll) { const F = { tip: (el.tip || 0) * deg, roll: (el.roll || 0) * deg }, [, qz0] = tipFrame(F, lx, v); [u, v] = rollFrame(F, u, qz0); }
  return [u, v];
};
// a direction's parts along the face (u, v)
const faceDir = (el, f, d) => {
  let [lx, u] = toLocalDir(f, d[0], d[1]), v = d[2];
  if (el.tip || el.roll) { const F = { tip: (el.tip || 0) * deg, roll: (el.roll || 0) * deg }, [, qz0] = tipFrame(F, lx, v); [u, v] = rollFrame(F, u, qz0); }
  return [u, v];
};
// the weights that give a derivative at xs[i] from values at the points xs (Lagrange's polynomial through them all)
function lagrangeD(xs, i) {
  const n = xs.length, w = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    if (k === i) { for (let m = 0; m < n; m++) if (m !== i) w[i] += 1 / (xs[i] - xs[m]); continue; }
    let num = 1, den = 1;
    for (let m = 0; m < n; m++) { if (m !== i && m !== k) num *= xs[i] - xs[m]; if (m !== k) den *= xs[k] - xs[m]; }
    w[k] = num / den;
  }
  return w;
}
// the weights of a periodic function's derivative from its n even samples (its Fourier series differentiated): by offset
const FOURIER_D = new Map();
function fourierD(n) {
  let w = FOURIER_D.get(n);
  if (!w) { w = new Float64Array(n); for (let q = 0; q < n; q++) for (let m = 1; m < n / 2; m++) w[q] -= 2 * m / n * Math.sin(2 * Math.PI * m * q / n); FOURIER_D.set(n, w); }
  return w;
}
/* How a quantity of two numbers a ray (get(ray): where it lands, say) changes over a cone's grid: for each ray
   [d/dtheta of both, d/dphi of both], or null where too few neighbours landed. Along a spoke, the polynomial through
   every ray of it that landed (the rings are Gauss-Legendre nodes: with all eight it is as good as the map is
   smooth). Round a ring, its Fourier series when the whole ring landed, else the polynomial through the neighbours
   within two spokes. */
export function coneDeriv(B, get) {
  const G = B.grid, nT = G.th.length, nP = G.nP, at = new Array(nT * nP).fill(null), out = new Map();
  for (const r of B.rays) at[r.ri * nP + r.sj] = r;
  const val = new Map();
  for (const r of B.rays) val.set(r, get(r));
  const dT = new Map(), dP = new Map();
  for (let j = 0; j < nP; j++) {
    const idx = []; for (let i = 0; i < nT; i++) if (at[i * nP + j]) idx.push(i);
    if (idx.length < 2) continue;
    const xs = idx.map(i => G.th[i]);
    idx.forEach((i, q) => {
      const w = lagrangeD(xs, q); let a = 0, b = 0;
      idx.forEach((i2, k) => { const v = val.get(at[i2 * nP + j]); a += w[k] * v[0]; b += w[k] * v[1]; });
      dT.set(at[i * nP + j], [a, b]);
    });
  }
  for (let i = 0; i < nT; i++) {
    const row = []; let all = true;
    for (let j = 0; j < nP; j++) { const r = at[i * nP + j]; row.push(r); if (!r) all = false; }
    if (all) {
      // the ring's Fourier series, term by term (the Nyquist term has no derivative): as one sum over the ring a ray,
      // d v / d phi at spoke j = sum over spokes q of FD[(q - j) mod nP] v_q
      const FD = fourierD(nP);
      for (let j = 0; j < nP; j++) {
        let a = 0, b = 0;
        for (let q = 0; q < nP; q++) { const w = FD[((q - j) % nP + nP) % nP], v = val.get(row[q]); a += w * v[0]; b += w * v[1]; }
        dP.set(row[j], [a, b]);
      }
    } else for (let j = 0; j < nP; j++) {
      if (!row[j]) continue;
      const ks = []; for (let q = -2; q <= 2; q++) if (row[((j + q) % nP + nP) % nP]) ks.push(q);
      if (ks.length < 2) continue;
      const xs = ks.map(q => 2 * Math.PI * q / nP), w = lagrangeD(xs, ks.indexOf(0)); let a = 0, b = 0;
      ks.forEach((q, k) => { const v = val.get(row[((j + q) % nP + nP) % nP]); a += w[k] * v[0]; b += w[k] * v[1]; });
      dP.set(row[j], [a, b]);
    }
  }
  for (const r of B.rays) { const t = dT.get(r), p = dP.get(r); out.set(r, t && p ? [t[0], t[1], p[0], p[1]] : null); }
  return out;
}
/* each ray's tube area where get(ray) puts it: |d(x)/d(theta) x d(x)/d(phi)| / sin(theta) for each steradian it stands for */
function tubeAreas(B, get) {
  const D = coneDeriv(B, get), out = new Map();
  for (const r of B.rays) { const d = D.get(r), s = Math.sin(B.grid.th[r.ri]); out.set(r, d && s > 0 ? Math.abs(d[0] * d[3] - d[1] * d[2]) / s * r.sa : 0); }
  return out;
}
export function scatFace(el) {
  const SC = lastTrace.scat, H = SC && SC.hits && SC.hits[el.id];
  if (!H || !H.length) return [];
  return deviceMemo(el, () => {
    const f = frame(el), by = new Map();
    for (const h of H) { const k = h.sid + '|' + h.path; let L = by.get(k); if (!L) by.set(k, L = []); L.push(h); }
    const out = [];
    for (const L of by.values()) {
      const src = getEl(L[0].sid), sc = src && src.scat;
      if (!sc) continue;
      if (sc.wave) {
        // a focus's own waves: each ray's place on the face and the share of its power that reached it
        const rays = L.map(h => { const [u, v] = facePoint(el, f, h.x, h.y, h.z), J = h.J; return { u, v, k: h.k, T: J[0] * J[0] + J[1] * J[1] + J[2] * J[2] + J[3] * J[3] }; });
        out.push({ src, wave: true, coh: sc.coh, part: sc.part, launch: sc.launch, p: sc.p, nm: src.wavelength, rays });
        continue;
      }
      const k0 = 2 * Math.PI / (src.wavelength * 1e-6), rays = [];
      for (const h of L) {
        const V = src.vRays[h.k], [u, v] = facePoint(el, f, h.x, h.y, h.z), [gu, gv] = faceDir(el, f, h.d), J = h.J, pw = J[0] * J[0] + J[1] * J[1] + J[2] * J[2] + J[3] * J[3];
        // conj(J e^{i k opl}) on the ray's own s and p, as a vector
        const ph = k0 * h.opl, c = Math.cos(ph), sn = Math.sin(ph), [S, P] = polFrame(h.d, h.par ? -1 : 1);
        const sR = J[0] * c - J[1] * sn, sI = -(J[0] * sn + J[1] * c), pR = J[2] * c - J[3] * sn, pI = -(J[2] * sn + J[3] * c);
        rays.push({ u, v, gu, gv, pw, dA: 0, opl: h.opl, d: h.d, h: [h], ri: V.ri, sj: V.sj, sa: V.sa, E: [sR * S[0] + pR * P[0], sI * S[0] + pI * P[0], sR * S[1] + pR * P[1], sI * S[1] + pI * P[1], sR * S[2] + pR * P[2], sI * S[2] + pI * P[2]] });
      }
      if (!rays.length) continue;
      const B = { src, coh: sc.coh, lmw: src.vLp, nm: src.wavelength, k0, gpl0: sc.gpl0, lag: sc.lag, gj0: sc.gj0, part: sc.part, launch: sc.launch, grid: sc.grid, rays };
      const A = tubeAreas(B, r => [r.u, r.v]);
      for (const r of rays) r.dA = A.get(r);
      out.push(B);
    }
    return out;
  }, 'scat');
}
/* A bundle's field at a point of the face (6 numbers, as a ray's E, per root of area), or null where the bundle does
   not reach. The nearest ray's field, with its phase carried to the point: the ray's direction along the face is the
   slope of its optical path there, and how that direction changes from ray to ray (H, from the grid) its curvature. */
function bundleAt(B, u, v) {
  if (!B.near) {
    // each ray's H = d(gu, gv)/d(u, v), once
    const Dg = coneDeriv(B, r => [r.gu, r.gv]), Dx = coneDeriv(B, r => [r.u, r.v]);
    for (const r of B.rays) {
      const g = Dg.get(r), x = Dx.get(r); r.H = null;
      if (!g || !x) continue;
      const det = x[0] * x[3] - x[1] * x[2];
      if (!(Math.abs(det) > 0)) continue;
      // [g_theta g_phi] [x_theta x_phi]^-1
      r.H = [(g[0] * x[3] - g[2] * x[1]) / det, (g[2] * x[0] - g[0] * x[2]) / det, (g[1] * x[3] - g[3] * x[1]) / det, (g[3] * x[0] - g[1] * x[2]) / det];
    }
    B.near = B.rays.filter(r => r.dA > 0);
  }
  let best = null, bd = Infinity;
  for (const r of B.near) { const d = (r.u - u) * (r.u - u) + (r.v - v) * (r.v - v); if (d < bd) { bd = d; best = r; } }
  if (!best || bd > 4 * best.dA) return null;                     // beyond its neighbours' reach: outside the cone's footprint
  const du = u - best.u, dv = v - best.v, H = best.H;
  const ph = -B.k0 * (best.gu * du + best.gv * dv + (H ? 0.5 * (H[0] * du * du + (H[1] + H[2]) * du * dv + H[3] * dv * dv) : 0));
  const c = Math.cos(ph), s = Math.sin(ph), a = 1 / Math.sqrt(best.dA), E = best.E;
  return [a * (E[0] * c - E[1] * s), a * (E[0] * s + E[1] * c), a * (E[2] * c - E[3] * s), a * (E[2] * s + E[3] * c), a * (E[4] * c - E[5] * s), a * (E[4] * s + E[5] * c), best.opl];
}
/* a Gaussian arrival's field at a point of the face as a vector on the bench's axes (6 numbers, the faces' convention) */
export function arrivalVec(A, u, v) {
  const E = arrivalField(A, u, v), b = A.b, [S, P] = polFrame(b.d3 ? b.d3 : [b.dx, b.dy, b.uz || 0], b.par ? -1 : 1);
  return [E[0] * S[0] + E[2] * P[0], E[1] * S[0] + E[3] * P[0], E[0] * S[1] + E[2] * P[1], E[1] * S[1] + E[3] * P[1], E[0] * S[2] + E[2] * P[2], E[1] * S[2] + E[3] * P[2]];
}
/* A Gaussian arrival's phase at a point of the face, less what arrivalField gives it: arrivalField writes the wavefront as
   the parabola x^2/2R, and a beam far from its waist has a sphere's, R (sqrt(1 + x^2/R^2) - 1). The difference, x^4/8R^3,
   is nothing to the Gaussian beams themselves, which all carry it alike, but a ray from a particle has its exact path,
   so the beam it is added to is given its sphere (each way across by its own radius; a beam with its axes turned or of
   higher modes is left as it is). As the phase to turn conj(E_beam) E by: +k times the difference. */
function frontFix(A, u, v0) {
  if (A.Q || A.QM || A.comps) return 0;
  const k = 2 * Math.PI / A.lam0, hx = A.vs ? 1 / Math.sqrt(1 + A.vs * A.vs) : 1, ez = (A.vs || 0) * hx;
  const du = u - A.u0, dv = v0 - (A.v0 || 0), xb = du * A.ldx, v = A.vs ? hx * dv - ez * A.ldy * du : dv;
  const iR = q => q[0] / (q[0] * q[0] + q[1] * q[1]), cx = iR(A.qx), cy = iR(A.qy);
  const sag = (c, r2) => (Math.abs(c) < 1e-12 ? 0 : (Math.sqrt(1 + c * c * r2) - 1) / c - 0.5 * c * r2);
  // one sphere when the beam is round, else each way on its own
  return k * (Math.abs(cx - cy) <= 1e-6 * Math.max(Math.abs(cx), Math.abs(cy)) ? sag(cx, xb * xb + v * v) : sag(cx, xb * xb) + sag(cy, v * v));
}
/* Scattered light on a round face of radius a: its own power, what it adds by interfering with the Gaussian beams of
   its family that land there, and what two bundles of one family add by interfering with each other; each also as
   right less left (X, along the face in the bench plane) and top less bottom (Y). In mW:
   { mw, cross (with the beams), mutual (between bundles), X, Y, byNm: [[nm, mW]], cones }. */
export function scatOnDisc(el, a) {
  const cones = scatFace(el), out = { mw: 0, cross: 0, mutual: 0, X: 0, Y: 0, byNm: [], cones: cones.filter(C => !C.wave).length };
  if (!cones.length) return out;
  const arr = faceArrivals(el);
  // a launch whose light at the particle is a focus's plane waves: its interference with the unscattered beam is those waves'
  // (each where its ray landed), and is not taken from the Gaussian beam again
  const byWave = new Set();
  for (const C of cones) {
    if (!C.wave) continue;
    byWave.add(C.part + '|' + C.launch);
    let cross = 0, X = 0, Y = 0;
    for (const r of C.rays) { if (r.u * r.u + r.v * r.v > a * a) continue; const t = C.p[r.k] * r.T * 1e3; cross += t; X += Math.sign(r.u) * t; Y += Math.sign(r.v) * t; }
    out.mw += cross; out.cross += cross; out.X += X; out.Y += Y; out.byNm.push([C.nm, cross]);
  }
  const bundles = cones.filter(C => !C.wave);
  for (const C of bundles) {
    const inD = C.inD = C.rays.filter(r => r.u * r.u + r.v * r.v <= a * a);
    let p = 0, x = 0, y = 0;
    // (whole: every ray the cone was sent with landed on the face)
    const whole = inD.length === C.src.vRays.reduce((n, r) => n + (r.off ? 0 : 1), 0);
    if (whole || !C.rays.some(r => r.dA > 0)) for (const r of inD) { p += r.pw; x += Math.sign(r.u) * r.pw; y += Math.sign(r.v) * r.pw; }
    else {
      // a bundle wider than the face: counting the rays that land on it would cut the face along the bundle's rings, so its
      // power per area (the nearest ray's, p / dA) is added up over the face itself
      const nr = 20, np = 48;
      for (let i = 0; i < nr; i++) for (let j = 0; j < np; j++) {
        const rr = a * Math.sqrt((i + 0.5) / nr), ph = 2 * Math.PI * (j + 0.5) / np, u = rr * Math.cos(ph), v = rr * Math.sin(ph), E = bundleAt(C, u, v);
        if (!E) continue;
        const w = (E[0] * E[0] + E[1] * E[1] + E[2] * E[2] + E[3] * E[3] + E[4] * E[4] + E[5] * E[5]) * Math.PI * a * a / (nr * np);
        p += w; x += Math.sign(u) * w; y += Math.sign(v) * w;
      }
    }
    const mw = p * C.lmw;
    let X = x * C.lmw, Y = y * C.lmw, cross = 0;
    if (C.coh && !byWave.has(C.part + '|' + C.launch)) for (const A of arr) {
      if (A.b.coh !== C.coh || A.coh.indexOf('#m') >= 0) continue;
      const g = cohGamma(splitRoot(A.src)), sc = Math.sqrt(Math.max(0, A.b.lmw) * C.lmw);
      // (the beam's Gouy phase from the particle to here, as it builds up, not as arg(q) writes it: see gj)
      const dg = 0.5 * ((C.gj0 || 0) - (A.gj || 0));
      for (const r of inD) {
        if (!(r.dA > 0)) continue;
        const Eg = arrivalVec(A, r.u, r.v);
        // conj(E_beam) . E_scattered
        let re = 0, im = 0; for (let q = 0; q < 6; q += 2) { re += Eg[q] * r.E[q] + Eg[q + 1] * r.E[q + 1]; im += Eg[q] * r.E[q + 1] - Eg[q + 1] * r.E[q]; }
        // (the beam's wavefront as the sphere it is, where the field above writes its parabola: the rays' own paths are exact)
        const fx = frontFix(A, r.u, r.v), cf = Math.cos(dg + fx), sf = Math.sin(dg + fx);
        const t = 2 * (re * cf - im * sf) * Math.sqrt(r.dA) * (g ? g(A.gpl + A.lag - (C.gpl0 + r.opl + C.lag)) : 1) * sc;
        cross += t; X += Math.sign(r.u) * t; Y += Math.sign(r.v) * t;
      }
    }
    out.mw += mw + cross; out.cross += cross; out.X += X; out.Y += Y; out.byNm.push([C.nm, mw + cross]);
  }
  // Two bundles of one family (a cone that came two ways, two cones of one particle, cones of two particles in one laser's
  // light): 2 Re Int conj(E_Q) . E_P over the face, as the sum over P's rays of Q's field at each. P is the one with more rays
  // on the face: its tubes tile the face best
  for (let i = 0; i < bundles.length; i++) for (let j = i + 1; j < bundles.length; j++) {
    if (!bundles[i].coh || bundles[i].coh !== bundles[j].coh) continue;
    const n = B => B.inD.reduce((a, r) => a + (r.dA > 0 ? 1 : 0), 0);
    const [P, Q] = n(bundles[i]) >= n(bundles[j]) ? [bundles[i], bundles[j]] : [bundles[j], bundles[i]];
    const g = cohGamma(splitRoot(P.src)), sc = Math.sqrt(P.lmw * Q.lmw);
    // (each cone's phase is held against the beam's at its own particle: the beam's Gouy phase between two particles, as it builds up)
    const dg = 0.5 * ((P.gj0 || 0) - (Q.gj0 || 0)), cg = Math.cos(dg), sg = Math.sin(dg);
    let m = 0, X = 0, Y = 0;
    for (const r of P.inD) {
      if (!(r.dA > 0)) continue;
      const Eq = bundleAt(Q, r.u, r.v);
      if (!Eq) continue;
      let re = 0, im = 0; for (let q = 0; q < 6; q += 2) { re += Eq[q] * r.E[q] + Eq[q + 1] * r.E[q + 1]; im += Eq[q] * r.E[q + 1] - Eq[q + 1] * r.E[q]; }
      const t = 2 * (re * cg - im * sg) * Math.sqrt(r.dA) * (g ? g(Q.gpl0 + Eq[6] + Q.lag - P.gpl0 - r.opl - P.lag) : 1) * sc;
      m += t; X += Math.sign(r.u) * t; Y += Math.sign(r.v) * t;
    }
    out.mw += m; out.mutual += m; out.X += X; out.Y += Y; out.byNm.push([P.nm, m]);
  }
  return out;
}
/* A cone's overlap with a single-mode fibre's mode (1/e^2 radius wf at the tip), as amplitudes on s (up) and p
   (along the face): [s re, s im, p re, p im], whose squares add to the share of a unit ray's power taken in. Where
   the cone comes to a focus on the tip its rays' tubes have no area there, so the overlap is taken on a plane 30
   Rayleigh ranges of the mode back from the tip, where the mode is a wide converging beam and the rays are apart
   (free space is assumed that far back; a tip tipped out of the plane is taken level). */
function scatModeAmp(el, C, wf) {
  const f = frame(el), lam0 = C.nm * 1e-6, k = 2 * Math.PI / lam0, zR = Math.PI * wf * wf / lam0, n = C.rays.length;
  let ru = 0; for (const r of C.rays) ru += r.u * r.u + r.v * r.v;
  const back = Math.sqrt(ru / Math.max(1, n)) < 3 * wf ? 30 * zR : 0;
  const A = { lam0, qx: [-back, zR], qy: [-back, zR], u0: 0, v0: 0, vs: 0, ldx: 1, ldy: 0, J: [1, 0, 0, 0], opl: -back };
  const o = [0, 0, 0, 0], at = r => {
    const h = r.h[0], [u, v] = facePoint(el, f, h.x, h.y, h.z), [ldx, ldy] = toLocalDir(f, h.d[0], h.d[1]), s = back / Math.max(1e-9, Math.abs(ldx));
    return [u - ldy * s, v - h.d[2] * s, s];
  };
  const areas = tubeAreas(C, r => at(r));
  for (const r of C.rays) {
    const dA = areas.get(r);
    if (!(dA > 0)) continue;
    const [u, v, s] = at(r);
    // the mode there, real and positive at the tip itself: arrivalField's Gaussian turned by a quarter wave
    const m = arrivalField(A, u, v), Mr = -m[1], Mi = m[0];
    // the ray's field carried back that far: e^{+iks} on the faces' convention
    const c = Math.cos(k * s), sn = Math.sin(k * s), g = Math.sqrt(dA);
    const comp = (er, ei) => { const br = er * c - ei * sn, bi = er * sn + ei * c; return [g * (Mr * br + Mi * bi), g * (Mr * bi - Mi * br)]; };
    const es = comp(r.E[4], r.E[5]), ep = comp(-r.E[0] * f.s + r.E[2] * f.c, -r.E[1] * f.s + r.E[3] * f.c);
    o[0] += es[0]; o[1] += es[1]; o[2] += ep[0]; o[3] += ep[1];
  }
  return o;
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
/* A many-mode arrival's power at a point of the face, to a constant: arrivalField's own sum for a beam of modes
   (A.QM), with everything that is the same at every point taken out of the point's work. The modes' Gouy phases
   and amplitudes are one complex number a mode; the phase all the modes share drops out of the power; and the
   Hermite polynomials are run up once by their recurrence in place of once a mode. Many times faster where a
   multimode fibre's own light comes back to it in tens of modes, and the same number. */
function modePower(A) {
  const M = A.QM, c0 = Math.cos(M.th), s0 = Math.sin(M.th), k = 2 * Math.PI / A.lam0, hx = A.vs ? 1 / Math.sqrt(1 + A.vs * A.vs) : 1, ez = (A.vs || 0) * hx;
  const Qf = QRot(M.Q, M.th), qa = Qf[0], qb = Qf[3], iaI = -qa[1] / (qa[0] ** 2 + qa[1] ** 2), ibI = -qb[1] / (qb[0] ** 2 + qb[1] ** 2);
  const sa = Math.SQRT2 / qW(qa, A.lam0), sb = Math.SQRT2 / qW(qb, A.lam0), n = M.comps.length;
  const mxs = new Int32Array(n), mys = new Int32Array(n), Cr = new Float64Array(n), Ci = new Float64Array(n);
  let NX = 0, NY = 0;
  M.comps.forEach(([mx, my, ar, ai], c) => {
    let f = 1; for (let i = 2; i <= mx; i++) f *= i; for (let i = 2; i <= my; i++) f *= i;
    const nrm = 1 / Math.sqrt(Math.pow(2, mx + my) * f), g = -mx * M.psi[0] - my * M.psi[1], cg = Math.cos(g), sg = Math.sin(g);
    mxs[c] = mx; mys[c] = my; Cr[c] = nrm * (cg * ar - sg * ai); Ci[c] = nrm * (cg * ai + sg * ar);
    NX = Math.max(NX, mx); NY = Math.max(NY, my);
  });
  const HX = new Float64Array(NX + 1), HY = new Float64Array(NY + 1);
  const fill = (H, N, x) => { H[0] = 1; if (N > 0) H[1] = 2 * x; for (let i = 1; i < N; i++) H[i + 1] = 2 * x * H[i] - 2 * i * H[i - 1]; };
  const u0 = A.u0, v0 = A.v0 || 0, ldx = A.ldx, ldy = A.ldy, sloped = !!A.vs;
  const at = (u, v) => {
    const du = u - u0, dv = v - v0, xb = du * ldx, vv = sloped ? hx * dv - ez * ldy * du : dv, x1 = xb * c0 + vv * s0, y1 = -xb * s0 + vv * c0;
    fill(HX, NX, sa * x1); fill(HY, NY, sb * y1);
    let sr = 0, si = 0;
    for (let c = 0; c < n; c++) { const hh = HX[mxs[c]] * HY[mys[c]]; sr += hh * Cr[c]; si += hh * Ci[c]; }
    return Math.exp(k * (iaI * x1 * x1 + ibI * y1 * y1)) * (sr * sr + si * si);
  };
  // a single mode, level, its axes the face's own: x1 is the place along the face alone, y1 the height alone
  if (n === 1 && !sloped && Math.abs(s0) < 1e-12) {
    const mx = mxs[0], my = mys[0], cc = Cr[0] * Cr[0] + Ci[0] * Ci[0];
    at.split = [u => { const x1 = (u - u0) * ldx * c0; fill(HX, NX, sa * x1); return Math.exp(k * iaI * x1 * x1) * HX[mx] * HX[mx] * cc; },
      v => { const y1 = (v - v0) * c0; fill(HY, NY, sb * y1); return Math.exp(k * ibI * y1 * y1) * HY[my] * HY[my]; }];
  }
  return at;
}
/* (Kept by what it depends on: the core, the acceptance and the arrival's shape and place on the face, not its
   strength, polarisation or phase. A fibre network is solved in passes and a spectrum arrives slice by slice, so the
   same arrival is asked for many times in one trace, and again on every trace that leaves that beam where it was.) */
const MM_SHARES = new Map();
export function mmShare(el, A) {
  const M = A.QM, key = JSON.stringify([el.core, el.na, A.lam0, A.u0, A.v0 || 0, A.vs || 0, A.ldx, A.ldy, A.qx, A.qy, A.Q || 0, A.comps || 0, M ? [M.th, M.Q, M.psi, M.comps] : 0]);
  let sh = MM_SHARES.get(key);
  if (sh === undefined) { if (MM_SHARES.size > 30000) MM_SHARES.clear(); sh = mmShareOf(el, A); MM_SHARES.set(key, sh); }
  return sh;
}
function mmShareOf(el, A) {
  const a = el.core / 2 * 1e-3, NA = el.na;
  // a higher-order mode reaches sqrt(2N + 1) times as far, and spreads that much faster
  const fM = A.comps ? Math.sqrt(Math.max(...A.comps.map(c => 2 * (c[0] + c[1]) + 1))) : 1;
  const wx = qW(A.qx, A.lam0), wy = qW(A.qy, A.lam0), L = Math.max(a, 3 * fM * Math.max(wx, wy)), N = 64, d = 2 * L / N;
  let on = 0, all = 0;
  const pAt = A.QM ? modePower(A) : (u, v) => { const E = arrivalField(A, u, v); return E[0] ** 2 + E[1] ** 2 + E[2] ** 2 + E[3] ** 2; };
  if (pAt.split) {
    // one mode with its axes along the face's: its power is one factor along the face times one up it, a row of each
    const fu = new Float64Array(N), fv = new Float64Array(N), a2 = a * a;
    for (let i = 0; i < N; i++) { const t = -L + (i + 0.5) * d; fu[i] = pAt.split[0](t); fv[i] = pAt.split[1](t); }
    for (let i = 0; i < N; i++) { const u = -L + (i + 0.5) * d, lim = a2 - u * u; for (let j = 0; j < N; j++) { const v = -L + (j + 0.5) * d, p = fu[i] * fv[j]; all += p; if (v * v <= lim) on += p; } }
  } else for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const u = -L + (i + 0.5) * d, v = -L + (j + 0.5) * d, p = pAt(u, v);
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
    if (!arr.length && !scatFace(el).length) return null;
    let inMw = 0, coupledMw = 0, pinS = 0, gotS = 0;
    for (const A of arr) {
      const pin = A.J[0] ** 2 + A.J[1] ** 2 + A.J[2] ** 2 + A.J[3] ** 2, got = pin * mmShare(el, A), P = A.b.lmw;
      pinS += pin; gotS += got; inMw += pin * P; coupledMw += got * P;
    }
    // a particle's scattered light: its rays that land on the core within the acceptance angle
    const f = frame(el), aC = el.core / 2 * 1e-3, thA = Math.asin(Math.min(1, el.na));
    for (const C of scatFace(el)) if (!C.wave) for (const r of C.rays) {
      const [ldx] = toLocalDir(f, r.d[0], r.d[1]), ok = r.u * r.u + r.v * r.v <= aC * aC && Math.acos(Math.min(1, Math.abs(ldx))) <= thA;
      inMw += r.pw * C.lmw; if (ok) coupledMw += r.pw * C.lmw;
    }
    return { eff: inMw > 0 && pinS === 0 ? coupledMw / inMw : pinS > 0 ? gotS / pinS : 0, mw: coupledMw, inMw, mode: null, share: gotS, mm: true };
  });
  return deviceMemo(el, () => {
    const arr = faceArrivals(el), cones = scatFace(el).filter(C => !C.wave), used = new Set();
    if (!arr.length && !cones.length) return null;
    const N = 96;
    let inMw = 0, coupledMw = 0, arrivingShare = 0, coupledShare = 0, mode = null;
    // a particle's scattered light with no beam of its laser here: what its mode overlap takes in, a cone at a time
    const modeAt = nm => { let m = fibreMode(el.core, el.na, nm); if (el.coll > 0) m = Object.assign({}, m, { w: tipModeW(el, nm) }); return m; };
    for (const G of groupsOf(arr)) {
      const nm = G[0].nm;
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
      const P = G[0].b.lmw;           // amplitudes are against the laser's own source, this line's share of it
      // scattered light of the same laser adds to the overlap as a field (its amplitudes against this line's)
      for (const C of cones) {
        if (!C.coh || C.coh !== G[0].b.coh || G[0].coh.indexOf('#m') >= 0 || used.has(C) || !(P > 0)) continue;
        used.add(C);
        const o = scatModeAmp(el, C, wf), k = Math.sqrt(C.lmw / P) / (d * d), dg = 0.5 * ((C.gj0 || 0) - (G[0].gj || 0)), c = Math.cos(dg), sn = Math.sin(dg);
        cs[0] += k * (o[0] * c - o[1] * sn); cs[1] += k * (o[0] * sn + o[1] * c); cp[0] += k * (o[2] * c - o[3] * sn); cp[1] += k * (o[2] * sn + o[3] * c);
        for (const r of C.rays) pin += r.pw * C.lmw / P;
      }
      const got = (cs[0] ** 2 + cs[1] ** 2 + cp[0] ** 2 + cp[1] ** 2) * d * d * d * d;
      arrivingShare += pin; coupledShare += got;
      inMw += pin * P; coupledMw += got * P;
    }
    let scMw = 0;
    for (const C of cones) {
      if (used.has(C)) continue;
      mode = modeAt(C.nm);
      const o = scatModeAmp(el, C, mode.w), got = o[0] ** 2 + o[1] ** 2 + o[2] ** 2 + o[3] ** 2;
      let pin = 0; for (const r of C.rays) pin += r.pw;
      inMw += pin * C.lmw; coupledMw += got * C.lmw; scMw += got * C.lmw;
      if (arrivingShare === 0) { arrivingShare = pin; coupledShare = got; }
    }
    return { eff: inMw > 0 && cones.length ? coupledMw / inMw : arrivingShare > 0 ? coupledShare / arrivingShare : 0, mw: coupledMw, inMw, mode, share: coupledShare, ...(cones.length ? { scat: cones.length } : {}) };
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
      const root = splitRoot(G[0].src), P = G[0].b.lmw;
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
        // the noise in the IF band, referred to the input, mW: k Tsys over the IF filter's noise bandwidth, its single
        // pole's (pi/2) ifbw (as elec.js filters it); a DSB mixer (T_rx quoted DSB) takes it in from both sidebands, twice
        const g = Math.pow(10, -rf.cl / 10), Tsys = rf.tant + rf.trx, ns = rf.sideband === 'dsb' ? 2 : 1, Bn = Math.PI / 2 * rf.ifbw * 1e6, Pn = ns * kB * Tsys * Bn * 1e3;
        const V = Math.sqrt(2 * 50 * P * 1e-3 * g);                                       // the IF tone's peak volts
        return { mw: P, ifMw: P * g, V, sat: false, noiseV: Math.sqrt(50 * Pn * 1e-3 * g), pending: false, field: true, rf: C, mixer: true, tsys: Tsys, mds: Pn, bn: Bn,   // noiseV rms
          floor: 10 * Math.log10(ns * kB * Tsys * 1e3), snr: P > 0 ? 10 * Math.log10(P / Pn) : null, lines: C ? C.lines.map(ln => Object.assign({ fif: Math.abs(ln.ghz - rf.lo) * 1e9 }, ln)) : [] };
      }
      // the NEP over the video bandwidth's noise bandwidth: a single pole at vbw (as elec.js filters it), (pi/2) vbw
      const V = P * 1e-3 * rf.rv, Bn = Math.PI / 2 * rf.vbw * 1e6, noiseV = rf.rv * rf.nep * 1e-12 * Math.sqrt(Bn);
      return { mw: P, V: Math.min(V, el.vmax), sat: V > el.vmax, noiseV, pending: false, field: true, rf: C, mds: rf.nep * 1e-12 * Math.sqrt(Bn) * 1e3, bn: Bn,
        snr: V > 0 ? 20 * Math.log10(V / noiseV) : null };
    }
    const a = el.length / 2;
    let I = 0, P = 0, pending = false;
    const F = viaCavity(el) ? detectorFieldResult(el) : null;
    if (viaCavity(el) && !F) pending = true;       // being worked out: the tracer's figure meanwhile
    if (F) { P = F.mw; I = F.mw * responsivity(el, F.nm || benchNms()[0]); }
    // Gaussian launches: |E|^2 over the active disc, fields added within each launch
    // (X, Y: the light right of the face's middle less that left of it, and above less below, as a split or quadrant diode's
    // halves would read: a cell of the grid the middle runs through is shared between the sides)
    let X = 0, Y = 0, SCA = null;
    if (!F) for (const G of groupsOf(faceArrivals(el))) {
      const [u0, u1, v0, v1] = arrivalWindow(G, a);
      if (!(u1 > u0) || !(v1 > v0)) continue;
      // while the cavity's field is worked out in the worker, the figure meanwhile on a coarser grid
      const N = pending ? 48 : 128, du = (u1 - u0) / N, dv = (v1 - v0) / N;
      let pw = 0, px = 0, py = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const u = u0 + (i + 0.5) * du, v = v0 + (j + 0.5) * dv;
        if (u * u + v * v > a * a) continue;
        let e0 = 0, e1 = 0, e2 = 0, e3 = 0;
        for (const A of G) { const E = arrivalField(A, u, v); e0 += E[0]; e1 += E[1]; e2 += E[2]; e3 += E[3]; }
        const c = e0 * e0 + e1 * e1 + e2 * e2 + e3 * e3;
        pw += c; px += c * clamp(2 * u / du, -1, 1); py += c * clamp(2 * v / dv, -1, 1);
      }
      const mw = pw * du * dv * G[0].b.lmw;
      P += mw; I += mw * responsivity(el, G[0].nm);
      X += px * du * dv * G[0].b.lmw; Y += py * du * dv * G[0].b.lmw;
    }
    // a particle's scattered light: its own power, and its interference with the beams of its laser that land here
    if (!F) {
      SCA = scatOnDisc(el, a);
      P += SCA.mw; X += SCA.X; Y += SCA.Y;
      for (const [nm, mw] of SCA.byNm) I += mw * responsivity(el, nm);
    }
    // ray fans, ray by ray: each launched ray carries its share of its source's power
    const hits = (lastTrace.screens[el.id] || []).filter(t => !t.chief);
    for (const t of hits) {
      const src = getEl(t.id.split(':')[0]);
      if (!src || beamOn(src)) continue;
      const mw = t.w * splitRoot(src).power / (raysLaunched(src) * sourceLines(src).length);
      P += mw; I += mw * responsivity(el, t.nm);
    }
    // noise: shot noise on the photocurrent and dark current, the feedback resistor's
    // Johnson noise, and the amplifier's own input current noise, all over the noise bandwidth: the
    // bandwidth is a single pole's 3 dB corner (as elec.js filters it), so white noise through it counts (pi/2) B
    const q = 1.602176634e-19, kT = 1.380649e-23 * 295, B = Math.PI / 2 * el.bandwidth, Ia = I * 1e-3;
    const i2 = 2 * q * (Ia + el.dark * 1e-9) * B + (el.gain > 0 ? 4 * kT * B / el.gain : 0) + (el.ampNoise * 1e-12) ** 2 * B;
    const noiseI = Math.sqrt(i2), V = Ia * el.gain;
    return { mw: P, mA: I, V: Math.min(V, el.vmax), sat: V > el.vmax, noiseV: noiseI * el.gain, noiseI, pending, field: !!F, X, Y, ...(SCA && SCA.cones ? { scat: { mw: SCA.mw, cross: SCA.cross, mutual: SCA.mutual, cones: SCA.cones } } : {}),
      snr: Ia > 0 ? 20 * Math.log10(Ia / noiseI) : null };
  });
}

