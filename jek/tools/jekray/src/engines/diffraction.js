import { fanEdge } from '../core/fan-edge.js';
import { clamp } from '../core/constants.js';
import { AMU, C_SI } from '../core/cells.js';
import { EPS0, TRAP_ATOMS, airIndex, sphereAlpha, trapAlpha } from '../core/traps.js';
import { cohModes, lagOf, splitRoot } from '../core/coherence.js';
import { deg, project } from '../state/project.js';
import { allSources, getEl } from '../state/elements.js';
import { frame, toLocal } from '../core/mask.js';
import { lastTrace } from './trace.js';
import { arrival3 } from './fibre-face.js';
import { field2LineAt, halfWidthOf, ihankel, interpL, popAxis, popFieldSeries, popGuard, popInside, popIntensityAt, popInvR, popPower, popRadii, popResidual, popStats, popW, qdht } from './field.js';
import { VF_NA, polMaps, vfApply, vfAt, vfPupil } from './vector-focus.js';
import { cdft, cmulPhase, field2I, fieldComps, interp2, popStats2 } from './field2d.js';
import { popJ, popKeyOf, popRun, segW } from './beam-tree.js';
import { besselJ01 } from '../core/special.js';

/* ---------- Diffraction ----------
   The rays arriving at a screen sample the converging wavefront: each one carries a
   numerical-aperture coordinate u, a wavefront error W against a reference sphere on
   the centroid, and a complex amplitude. Summing those with the right kernel gives the
   point spread function.

   If the wavefront is symmetric about the axis, the pupil is a figure of revolution and
   the proper 2D answer is the Hankel transform (the J0 kernel below), which is the true
   2D PSF and MTF. If it is not, the honest answer is the tangential line spread function
   and the tangential MTF, which is what the 1D kernel gives. */

/* Bessel J0, Abramowitz and Stegun 9.4.1 and 9.4.3 */

export const diffCache = new Map();          // kept for the trace to clear; the field answer is cached by key

/* ---------- A ray fan as a field ----------
   A fan with a width is a uniform top-hat of that diameter, curved to its divergence, its edge
   softened over the source's edge (a Gaussian blur, so the whole of it lies on the grid);
   a point source is a uniform cone of spatial frequencies, which at its waist is the
   jinc 2 J1(x)/x. Both are built from their exact spectra, cut at the grid's bandwidth:
   a hard edge sampled directly puts power the grid cannot hold into frequencies it
   folds back inside, which inflates the core. What lies past the grid is left out and
   remembered (repr, the fraction held), so enclosed energy is against the true total. */
export function fanShape(src, nm) {
  const a = src.width / 2, th = src.divergence / 2 * deg;
  // a soft edge: the top-hat blurred by a Gaussian whose 10-90% rise is the edge (sigma = edge / 2.563)
  if (a > 0) return { a, iR: Math.tan(th) / a, sig: fanEdge(src) / 2.563 };
  return { a: 0, nu: Math.sin(Math.abs(th)) / (nm * 1e-6) };
}
/* Spectrum at spatial frequency v (cycles/mm): of the disc, or of the cone, cell-weighted
   at its edge so it need not fall on a sample */
function fanSpectrum(shape, v, dv) {
  if (shape.a > 0) {
    const x = 2 * Math.PI * shape.a * v, soft = shape.sig > 0 ? Math.exp(-2 * Math.PI * Math.PI * shape.sig * shape.sig * v * v) : 1;
    return soft * (x < 1e-8 ? Math.PI * shape.a * shape.a : shape.a * besselJ01(x)[1] / v);
  }
  return Math.min(1, Math.max(0, 0.5 + (shape.nu - v) / dv));
}
export function popFanRound(N, q, n, lam0, power, shape) {
  const k = 2 * Math.PI * n / lam0, lam = lam0 / n;
  const R = popGuard(N) * popW(q[0], q[1], lam), Q = qdht(N), r = popRadii(Q, R);
  const nuStep = 1 / (2 * R);                                  // about one sample in frequency
  const Sr = new Float64Array(N), Si = new Float64Array(N);
  for (let m = 0; m < N; m++) Sr[m] = fanSpectrum(shape, Q.j[m] / (2 * Math.PI * R), nuStep);
  let [re, im] = ihankel(Q, R, Sr, Si);
  for (let i = 0; i < N; i++) {
    const ph = shape.a > 0 ? -0.5 * k * shape.iR * r[i] * r[i] : 0, c = Math.cos(ph), s = Math.sin(ph);
    const x = re[i] * c - im[i] * s; im[i] = re[i] * s + im[i] * c; re[i] = x;
  }
  const sphere = popResidual(re, im, r, q[0], q[1], k);
  const F = { R, re, im, z: q[0], zR: q[1], n, lam0, sphere };
  // scale to the true power: the disc's own for a top-hat (its amplitude is fixed), all of it for the cone
  const held = popPower(F), full = shape.sig > 0 ? held : shape.a > 0 ? Math.PI * shape.a * shape.a : Math.PI * shape.nu * shape.nu;
  const s = Math.sqrt(power / full);
  for (let i = 0; i < N; i++) { re[i] *= s; im[i] *= s; }
  F.repr = Math.min(1, held / full);
  return F;
}
export function popFan2(N, q, n, lam0, power, shape) {
  const k = 2 * Math.PI * n / lam0, lam = lam0 / n, d = Math.sqrt(Math.PI * N) * popW(q[0], q[1], lam) / N;
  const sph = !popInside(q[0], q[1]), df = 1 / (N * d);
  const re = new Float64Array(N * N), im = new Float64Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const fx = (i - N / 2) * df, fy = (j - N / 2) * df;
    re[j * N + i] = fanSpectrum(shape, Math.hypot(fx, fy), df) * df * df;
  }
  // inverse transform, rows then columns
  const lr = new Float64Array(N), li = new Float64Array(N);
  for (const axis of [0, 1]) for (let a = 0; a < N; a++) {
    for (let b = 0; b < N; b++) { const o = axis ? b * N + a : a * N + b; lr[b] = re[o]; li[b] = im[o]; }
    cdft(lr, li, 1);
    for (let b = 0; b < N; b++) { const o = axis ? b * N + a : a * N + b; re[o] = lr[b]; im[o] = li[b]; }
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i - N / 2) * d, y = (j - N / 2) * d, r2 = x * x + y * y, o = j * N + i;
    const ph = (shape.a > 0 ? -0.5 * k * shape.iR * r2 : 0) + (sph ? k * r2 / (2 * q[0]) : 0);
    cmulPhase(re, im, o, ph, 1);
  }
  const st = { d, z: q[0], zR: q[1] };
  const F = { N, re, im, ax: st, ay: Object.assign({}, st), n, lam0 };
  const held = popStats2(F).power, full = shape.sig > 0 ? held : shape.a > 0 ? Math.PI * shape.a * shape.a : Math.PI * shape.nu * shape.nu;
  const s = Math.sqrt(power / full);
  for (let i = 0; i < N * N; i++) { re[i] *= s; im[i] *= s; }
  F.repr = Math.min(1, held / full);
  return F;
}

/* ---------- What a screen sees ----------
   The field that arrives on the screen's front face, from every Gaussian source and every
   ray fan. The irradiance map adds the arrivals; the figures are for the strongest one.
   Strehl is the classic one: the peak against the peak a perfect wave from the same
   amplitude at the last surface would reach on the screen, (Int |E| dA / lam d)^2, so
   defocus against the screen counts, as it always has. */
const MAP_N = 128;
export function popScreenPrep(el) {
  const B = lastTrace.beams || [];
  const a = el.angle * deg, nX = Math.cos(a), nY = Math.sin(a);
  const arrive = [];
  B.forEach((b, i) => { if (b.endEl === el.id && b.dx * nX + b.dy * nY < 0) arrive.push(i); });
  if (!arrive.length) return null;
  const keep = new Set();
  // a trap takes every beam through the screen's region, whichever way it goes
  if (el.trap && el.trap !== 'none') {
    const H = Math.min(Math.max(el.length / 2, 0.005), 2);
    B.forEach((b, i) => {
      if (b.fan || b.bench !== el.bench) return;
      const rx = el.x - b.x0, ry = el.y - b.y0, t = rx * b.dx + ry * b.dy, x = -rx * b.dy + ry * b.dx;
      if (t >= -H && t <= b.len + H && Math.abs(x) <= H) arrive.push(i);
    });
  }
  for (let i of arrive) while (i >= 0 && !keep.has(i)) { keep.add(i); i = B[i].parent; }
  const ids = new Set([...keep].map(i => B[i].src));
  const srcs = allSources().filter(e => ids.has(e.id));
  const kept = [...keep].sort((x, y) => x - y).map(i => B[i]);
  const key = el.id + '|' + [el.z, el.tip, el.roll] + '|' + popKeyOf(kept, srcs) + JSON.stringify(srcs.map(e => [e.popModel, e.gauss])) + JSON.stringify(project.cavityLock || {}) + (el.trap && el.trap !== 'none' ? '|trap' + JSON.stringify([el.trap, el.trapF, el.trapMat, el.trapR, el.trapRho, el.trapMed, el.trapP, el.trapT]) : '');
  return { keep, srcs, key };
}

/* A trap's shape from the field itself: along the beam, where the light is brightest (a
   golden-section search within three Rayleigh ranges of the screen) and there, the curvature
   of the intensity across the beam each way and along it, as c = -I''/I (1/mm^2). From the
   field between its samples, so a tight or aberrated focus counts as it is. */
function trapShape(sg, len) {
  const two = sg.eng === '2d';
  const probe = G => {
    if (!two) {
      const Ir = popIntensityAt(G), st = popStats(G), I0 = Ir(0), h = Math.max(1e-7, st.w / 60);
      const c = -2 * (Ir(h) - I0) / (h * h) / I0;
      return { I: I0, cx: c, cy: c };
    }
    const N = G.N;
    let ip = 0; for (let i = 0; i < N * N; i++) if (field2I(G, i) > field2I(G, ip)) ip = i;
    const ix = ip % N, iy = Math.floor(ip / N), lx = field2LineAt(G, 'x', iy), ly = field2LineAt(G, 'y', ix);
    const top = (f, u0) => { let a = u0 - 1, b = u0 + 1; for (let it = 0; it < 30; it++) { const m1 = a + 0.382 * (b - a), m2 = a + 0.618 * (b - a); if (f(m1) > f(m2)) b = m2; else a = m1; } return 0.5 * (a + b); };
    const ux = top(lx, ix), uy = top(ly, iy), h = 0.05;
    const curv = (f, u, d) => -(f(u + h) - 2 * f(u) + f(u - h)) / ((h * d) ** 2) / f(u);
    return { I: Math.max(lx(ux), ly(uy)), cx: curv(lx, ux, G.ax.d), cy: curv(ly, uy, G.ay.d) };
  };
  const lam = sg.b.nm * 1e-6 / sg.b.n, P0 = probe(sg.leg.at(len));
  const wOf = c => c > 0 ? 2 / Math.sqrt(c) : Infinity;        // a Gaussian's radius with that curvature
  const zr = c => Math.PI * wOf(c) ** 2 / lam;
  const span = 3 * Math.max(zr(Math.min(P0.cx, P0.cy)), 1e-4);
  const Pt = t => probe(sg.leg.at(t)).I;
  let a = Math.max(1e-6, len - span), b = len + span;
  for (let it = 0; it < 32; it++) { const m1 = a + 0.382 * (b - a), m2 = a + 0.618 * (b - a); if (Pt(m1) > Pt(m2)) b = m2; else a = m1; }
  const t = 0.5 * (a + b), F = probe(sg.leg.at(t));
  const hz = 0.05 * zr(Math.min(F.cx, F.cy));
  const up = Pt(t + hz), dn = t - hz > 0 ? Pt(t - hz) : Pt(t);
  const cz = t - hz > 0 ? -(up - 2 * F.I + dn) / (hz * hz) / F.I : -2 * (up - F.I) / (hz * hz) / F.I;
  const edge = t < Math.max(1e-6, len - span) + 0.02 * span || t > len + 0.98 * span;
  return { dz: t - len, ratio: F.I / P0.I, cx: F.cx, cy: F.cy, cz, edge, src: sg.src.id };
}
/* The trap itself, from every beam of the field run that passes through the screen's region:
   each beam's vector field from its pupil (vfAt, exact at any numerical aperture), the beams
   of one launch added as fields (a standing wave, crossing-beam fringes) and separate launches
   as forces. From the brightest point, Newton's method on the force finds where it is zero;
   the stiffness there, -dF_i/dx_i, gives the trap frequencies. Frame: z along the arriving
   beam, x across it in the bench plane, y out of the plane; offsets from where that beam
   crosses the screen. */
/* A beam's field near a trap from its propagation rather than a pupil: cuts along it on a grid
   a twentieth of a Rayleigh range apart, made as they are needed, each cut's residual
   interpolated across (in the plane and out of it) with its reference sphere put back and
   its polarisation; the smooth envelope interpolated between the four nearest cuts, the fast
   phase exact, as the close-up does. Paraxial: no field along the beam. Returns the same
   [x, y, z] components, re and im, as vfAt. */
export function trapLegPart(sg, P0) {
  const b = sg.b, rx = P0[0] - b.x0, ry = P0[1] - b.y0, tc = clamp(rx * b.dx + ry * b.dy, 0, b.len);
  const G0 = sg.leg.at(tc), two = !!G0.ax, lam = G0.lam0 / G0.n, k = 2 * Math.PI / lam;
  const zR = two ? Math.min(G0.ax.zR, G0.ay.zR) : G0.zR;
  // cuts along the beam a fiftieth of its Rayleigh range apart (half a wavelength at least):
  // fine enough for the curvature of a tight focus, coarse enough for a collimated beam's search;
  // a beam clipped by a rim ripples along itself far faster than its Rayleigh range says, so its
  // cuts are no further apart than 20 µm
  const H = Math.max(0.5 * lam, sg.clipped ? Math.min(0.02 * zR, 0.02) : 0.02 * zR);
  return { sg, H, k, two, J: popJ(b), par: b.par, cuts: new Map() };
}
export function trapLegCut(L, i) {
  let c = L.cuts.get(i);
  // before the leg's start, its field carried back through free space: smooth, as the stencil needs
  if (!c) { c = L.sg.leg.at(i * L.H); L.cuts.set(i, c); }
  return c;
}
export function trapLegAt(L, px, py, pz) {
  const acc = [0, 0, 0, 0], u = pz / L.H, i0 = Math.floor(u) - 1;
  for (let j = 0; j < 4; j++) {
    const ij = i0 + j, tj = ij * L.H;
    let l = 1;
    for (let m = 0; m < 4; m++) if (m !== j) l *= (u - (i0 + m)) / (j - m);
    const G = trapLegCut(L, ij), k = L.k;
    let s, p;
    if (L.two) {
      const refX = popInside(G.ax.z, G.ax.zR) ? 0 : -k / (2 * G.ax.z), refY = popInside(G.ay.z, G.ay.zR) ? 0 : -k / (2 * G.ay.z);
      const ph = refX * px * px + refY * py * py, c = Math.cos(ph), sn = Math.sin(ph), rot = v => [v[0] * c - v[1] * sn, v[0] * sn + v[1] * c];
      const a = interpL(G, px, py);
      if (G.re2) { s = rot(a); const q = interpL(G, px, py, G.re2, G.im2); p = rot([(L.par ? -1 : 1) * q[0], (L.par ? -1 : 1) * q[1]]); }
      else { const v = rot(a), J = L.J; s = [v[0] * J[0] - v[1] * J[1], v[0] * J[1] + v[1] * J[0]]; p = [v[0] * J[2] - v[1] * J[3], v[0] * J[3] + v[1] * J[2]]; }
    } else {
      // the round field between its radii exactly, by its Hankel series, and its reference sphere
      const r2 = px * px + py * py, uv = popFieldSeries(G)(Math.sqrt(r2)), bph = (G.sphere ? -k / (2 * G.z) : 0) * r2, cb = Math.cos(bph), sb = Math.sin(bph);
      const v = [uv[0] * cb - uv[1] * sb, uv[0] * sb + uv[1] * cb], J = L.J;
      s = [v[0] * J[0] - v[1] * J[1], v[0] * J[1] + v[1] * J[0]]; p = [v[0] * J[2] - v[1] * J[3], v[0] * J[3] + v[1] * J[2]];
    }
    // the fast phase off at each cut, the envelope interpolated, then back on exactly
    const ph = k * tj, c = Math.cos(ph), sn = Math.sin(ph);
    acc[0] += l * (p[0] * c - p[1] * sn); acc[1] += l * (p[0] * sn + p[1] * c);
    acc[2] += l * (s[0] * c - s[1] * sn); acc[3] += l * (s[0] * sn + s[1] * c);
  }
  const ph = -L.k * pz, c = Math.cos(ph), sn = Math.sin(ph);
  return [acc[0] * c - acc[1] * sn, acc[0] * sn + acc[1] * c, acc[2] * c - acc[3] * sn, acc[2] * sn + acc[3] * c, 0, 0];
}
function trapSolve(el, R, dom, len) {
  const sg0 = dom.sg, b0 = sg0.b, lam0 = b0.nm * 1e-6;
  const d0 = [b0.dx, b0.dy], a0v = [-b0.dy, b0.dx];
  const P0 = [b0.x0 + b0.dx * len, b0.y0 + b0.dy * len];
  const H = Math.min(Math.max(el.length / 2, 0.005), 2);
  // the beams through the region; a beam passing through a screen that lets it by is one beam
  const near = [], passed = new Set();
  for (const sg of R.segs) {
    const b = sg.b;
    if (b.fan || b.bench !== b0.bench) continue;
    const rx = P0[0] - b.x0, ry = P0[1] - b.y0, t = rx * b.dx + ry * b.dy, x = -rx * b.dy + ry * b.dx;
    if (t < -H || t > b.len + H || Math.abs(x) > H) continue;
    near.push(sg);
  }
  const inSet = new Set(near.map(sg => sg.i));
  const beams = near.filter(sg => {
    const par = lastTrace.beams[sg.b.parent];
    const thru = par && inSet.has(sg.b.parent) && par.endEl && (() => { const e = getEl(par.endEl); return e && e.type === 'screen' && !e.absorb; })();
    if (thru) passed.add(sg.b.parent);
    return !thru;
  });
  const skipped = [];
  const parts = [];
  for (const sg of beams) {
    const force = self.__trapLeg && self.__trapLeg(sg);            // tests: take this beam by its propagated field
    // a steep focus by its vector pupil sum; a gentle one (NA up to VF_NA, as a screen judges it)
    // by the beam's own propagated field, which is the Gaussian beam the source defines there
    // (the pupil sum would take that beam's paraxial far field as exact and lose a few per cent
    // to obliquity at NA 0.1)
    let P = force ? null : vfPupil(sg, R, { reach: 4.2, M: 96 });
    if (P && P.NA <= VF_NA) P = null;
    // a beam not converging on a focus ahead (collimated, or past its focus) has no pupil to sum
    // from: its propagated field is taken instead, cut along the beam as the search needs
    const leg = P ? null : trapLegPart(sg, P0);
    if (!P && !leg) { skipped.push(sg); continue; }
    parts.push({ sg, P, leg, b: sg.b, coh: sg.coh, Pw: Math.max(0, sg.b.lmw) * 1e-3 });
  }
  if (!parts.length) return { error: 'no focused beam' };
  const isAtom = el.trap in TRAP_ATOMS;
  // the medium: where the light is, or as set
  const nBench = b0.n;
  const nMed = isAtom ? 1 : el.trapMed === 'vacuum' ? 1 : el.trapMed === 'air' ? airIndex(el.trapP, el.trapT) : nBench;
  // the particle: its polarisability (SI, complex) and mass
  let alpha, mass, sph = null;
  if (isAtom) { const [ar, ai] = trapAlpha(el.trap, b0.nm, el.trapF); alpha = [ar * EPS0, ai * EPS0]; mass = TRAP_ATOMS[el.trap].m * AMU; }
  else { sph = sphereAlpha(el.trapMat, el.trapR, b0.nm, nMed); alpha = [sph.re, sph.im]; mass = el.trapRho * 4 / 3 * Math.PI * (el.trapR * 1e-9) ** 3; }
  // the field in SI (V/m) at a point of the trap frame, per launch, as the physicists write it (conjugated)
  const byL = new Map();
  for (const q of parts) { if (!byL.has(q.coh)) byL.set(q.coh, []); byL.get(q.coh).push(q); }
  const launches = [...byL.values()];
  const world = (x, y, z) => [P0[0] + x * a0v[0] + z * d0[0], P0[1] + x * a0v[1] + z * d0[1], y];
  const fieldL = (L, x, y, z) => {
    const [X, Y, Zo] = world(x, y, z), E = [0, 0, 0, 0, 0, 0];         // world X, Y (bench), Z (out of plane)
    for (const q of L) {
      const b = q.b, rx = X - b.x0, ry = Y - b.y0, pz = rx * b.dx + ry * b.dy, px = -rx * b.dy + ry * b.dx;
      const e = q.P ? vfAt(q.P, px, Zo, pz) : trapLegAt(q.leg, px, Zo, pz), s = Math.sqrt(2 * q.Pw * 1e6 / (nMed * EPS0 * C_SI));
      const ax = [-b.dy, b.dx];
      // beam frame x (across, in the plane), y (out of it), z (along) to world X, Y, Z
      E[0] += s * (e[0] * ax[0] + e[4] * b.dx); E[1] -= s * (e[1] * ax[0] + e[5] * b.dx);
      E[2] += s * (e[0] * ax[1] + e[4] * b.dy); E[3] -= s * (e[1] * ax[1] + e[5] * b.dy);
      E[4] += s * e[2]; E[5] -= s * e[3];
    }
    return E;
  };
  const E2 = E => E[0] * E[0] + E[1] * E[1] + E[2] * E[2] + E[3] * E[3] + E[4] * E[4] + E[5] * E[5];
  const intensity = (x, y, z) => launches.reduce((sI, L) => sI + E2(fieldL(L, x, y, z)), 0);   // |E|^2, (V/m)^2
  // the same without interference, every beam on its own: the envelope a standing wave sits in
  const intensityInc = (x, y, z) => parts.reduce((sI, q) => sI + E2(fieldL([q], x, y, z)), 0);
  const hd = lam0 / nMed / 400;                                            // mm, for the phase gradient
  const dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  // each direction's own length scale where the particle is: how far until the light falls by
  // 0.2%. Derivatives are taken over a fraction of it, so a millimetre-long focus and a
  // standing wave's half-wavelength are both resolved without rounding swamping them.
  let scale = [1, 1, 1];
  const scales = p => dirs.map(dv => {
    const I0 = intensity(...p);
    // how much the light changes a step either way (it may rise: at a saddle, a fringe's dark line)
    const drop = st => Math.abs(1 - 0.5 * (intensity(p[0] + dv[0] * st, p[1] + dv[1] * st, p[2] + dv[2] * st) + intensity(p[0] - dv[0] * st, p[1] - dv[1] * st, p[2] - dv[2] * st)) / I0);
    let st = lam0 / nMed / 16;
    if (drop(st) > 0.002) { for (let n = 0; n < 30 && drop(st) > 0.002; n++) st /= 2; }
    else for (let n = 0; n < 40 && drop(2 * st) <= 0.002; n++) st *= 2;
    return st;
  });
  // the force (N): the gradient part from the intensity over each direction's scale, the
  // scattering part from the field's phase gradient, -(Im alpha / 2) Im(sum E dE*)
  const force = (x, y, z) => {
    const F = [0, 0, 0];
    dirs.forEach((dv, i) => {
      const g = scale[i] / 4;
      const dI = (intensity(x + dv[0] * g, y + dv[1] * g, z + dv[2] * g) - intensity(x - dv[0] * g, y - dv[1] * g, z - dv[2] * g)) / (2 * g * 1e-3);
      F[i] += 0.25 * alpha[0] * dI;
    });
    if (alpha[1]) for (const L of launches) {
      const E = fieldL(L, x, y, z);
      dirs.forEach((dv, i) => {
        const Ep = fieldL(L, x + dv[0] * hd, y + dv[1] * hd, z + dv[2] * hd), Em = fieldL(L, x - dv[0] * hd, y - dv[1] * hd, z - dv[2] * hd);
        let im = 0;
        for (let c = 0; c < 3; c++) {
          const er = E[2 * c], ei = E[2 * c + 1], gr = (Ep[2 * c] - Em[2 * c]) / (2 * hd * 1e-3), gi = -(Ep[2 * c + 1] - Em[2 * c + 1]) / (2 * hd * 1e-3);
          im += er * gi + ei * gr;
        }
        F[i] -= 0.5 * alpha[1] * im;
      });
    }
    return F;
  };
  const Uat = (x, y, z) => -0.25 * alpha[0] * intensity(x, y, z);      // J, the gradient part
  // start: the arriving beam's brightest point along it, then its brightest fringe within a wavelength
  let S0 = { dz: 0, cz: NaN };
  try { S0 = trapShape(sg0, len); } catch (err) { /* the scan below finds it */ }
  if (!isFinite(S0.dz)) S0 = { dz: 0, cz: NaN };
  const lamM = lam0 / nMed;
  // the scalar field's estimate can be well off at a steep or aberrated focus: scan the true
  // (vector) intensity along the beam over a couple of Rayleigh ranges, then refine
  // without a usable estimate, the scan reaches as far as the screen's region
  // a gentle beam (collimated, or its focus far off) is looked at near the screen, not wherever
  // its waist is: the start and the scan stay within the screen's region and a Rayleigh range
  const zr0 = S0.cz > 0 && isFinite(S0.cz) ? Math.sqrt(2 / S0.cz) : H / 2.5, reach = H + Math.min(zr0, H);
  const Z = Math.min(2.5 * zr0, reach) + 20 * lamM;
  S0.dz = clamp(S0.dz, -reach, reach);
  let zb = S0.dz, best = -1;
  for (let k = -60; k <= 60; k++) { const z = S0.dz + k * Z / 60, v = intensityInc(0, 0, z); if (v > best) { best = v; zb = z; } }
  { let a = zb - Z / 60, b = zb + Z / 60; for (let it = 0; it < 30; it++) { const m1 = a + 0.382 * (b - a), m2 = a + 0.618 * (b - a); if (intensityInc(0, 0, m1) > intensityInc(0, 0, m2)) b = m2; else a = m1; } zb = 0.5 * (a + b); }
  let r = [0, 0, zb];
  best = -1;
  for (let k = -16; k <= 16; k++) { const z = zb + k * lamM / 32, v = intensity(0, 0, z); if (v > best) { best = v; r = [0, 0, z]; } }
  const out = { nMed, nBench, alpha, mass, sphere: sph, launches: launches.length, beams: parts.length, skipped: skipped.length, isAtom };
  if (!(alpha[0] > 0)) {
    // repelled from the light: no trap at the focus, a barrier
    const I2 = intensity(...r);
    return Object.assign(out, { trap: false, x: r[0], y: r[1], z: r[2], E2: I2, U: -0.25 * alpha[0] * I2 });
  }
  // Newton's method on F = 0, the steps limited to a few of each direction's scale
  scale = scales(r);
  const stiff = p => dirs.map((dv, j) => { const hk = scale[j] / 2, Fp = force(p[0] + dv[0] * hk, p[1] + dv[1] * hk, p[2] + dv[2] * hk), Fm = force(p[0] - dv[0] * hk, p[1] - dv[1] * hk, p[2] - dv[2] * hk);
    return [0, 1, 2].map(i => -(Fp[i] - Fm[i]) / (2 * hk * 1e-3)); });            // K[j][i] = -dF_i/dx_j, N/m
  let K = null, ok = false, unstableSteps = 0;
  for (let it = 0; it < 60; it++) {
    const F = force(...r);
    K = stiff(r);
    // solve K dx = F (K symmetric enough); in mm
    const A = [[K[0][0], K[1][0], K[2][0]], [K[0][1], K[1][1], K[2][1]], [K[0][2], K[1][2], K[2][2]]];
    const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    if (!isFinite(det) || Math.abs(det) < 1e-300) break;
    const inv = [[(A[1][1] * A[2][2] - A[1][2] * A[2][1]) / det, (A[0][2] * A[2][1] - A[0][1] * A[2][2]) / det, (A[0][1] * A[1][2] - A[0][2] * A[1][1]) / det],
      [(A[1][2] * A[2][0] - A[1][0] * A[2][2]) / det, (A[0][0] * A[2][2] - A[0][2] * A[2][0]) / det, (A[0][2] * A[1][0] - A[0][0] * A[1][2]) / det],
      [(A[1][0] * A[2][1] - A[1][1] * A[2][0]) / det, (A[0][1] * A[2][0] - A[0][0] * A[2][1]) / det, (A[0][0] * A[1][1] - A[0][1] * A[1][0]) / det]];
    let dx = [0, 1, 2].map(i => (inv[i][0] * F[0] + inv[i][1] * F[1] + inv[i][2] * F[2]) * 1e3);   // m to mm
    // Newton heads for any zero of the force, a saddle as readily as a trap; where the light
    // does not hold the particle some way (a stiffness not above zero), step with the force
    // instead, downhill, and off a symmetric saddle to one side
    if (!(A[0][0] > 0 && A[1][1] > 0 && A[2][2] > 0 && det > 0 && A[0][0] * A[1][1] - A[0][1] * A[1][0] > 0)) {
      // along each direction that does not hold, jump to the brightest point within half a
      // wavelength (or a few of its scales), where the light's pull there has its minimum
      dx = [0, 1, 2].map(i => {
        if (A[i][i] > 0) return F[i] / A[i][i] * 1e3;
        const span = Math.max(lamM / 2, 2 * scale[i]), dv = dirs[i];
        let bi = 0, bv = -1;
        for (let q = -20; q <= 20; q++) { const t = q / 20 * span, v = intensity(r[0] + dv[0] * t, r[1] + dv[1] * t, r[2] + dv[2] * t); if (v > bv) { bv = v; bi = t; } }
        return bi || 0.5 * scale[i];
      });
      unstableSteps++;
    }
    const cap = scale.map((v, i) => unstableSteps && !(A[i][i] > 0) ? Infinity : 5 * v), stepMax = Math.max(...dx.map((v, i) => Math.abs(v) / cap[i]));
    const f = stepMax > 1 ? 1 / stepMax : 1;
    r = r.map((v, i) => v + dx[i] * f);
    if (unstableSteps) scale = scales(r);            // the scales where it now is
    if (f === 1 && dx.every((v, i) => Math.abs(v) < 1e-4 * scale[i])) { ok = true; scale = scales(r); K = stiff(r); break; }
  }
  const kd = K ? [K[0][0], K[1][1], K[2][2]] : [NaN, NaN, NaN];
  // an equilibrium well away from the screen (a gentle beam's pull back along itself) is not the trap here
  const away = Math.abs(r[2]) > 2 * reach || Math.hypot(r[0], r[1]) > H;
  const stable = ok && !away && kd.every(v => v > 0);
  const E2v = intensity(...r);
  const fr = k => k > 0 ? Math.sqrt(k / mass) / (2 * Math.PI) : null;
  return Object.assign(out, { trap: stable, converged: ok, x: r[0], y: r[1], z: r[2], E2: E2v, U: Uat(...r), k: kd, fx: fr(kd[0]), fy: fr(kd[1]), fz: fr(kd[2]),
    zStart: S0.dz, away });
}
export function popDiffraction(el, R) {
  const f = frame(el), a = el.angle * deg, sYx = -Math.sin(a), sYy = Math.cos(a), nX = Math.cos(a), nY = Math.sin(a);
  const arr = R.segs.filter(sg => sg.b.endEl === el.id && sg.b.dx * nX + sg.b.dy * nY < 0);
  if (!arr.length) return null;
  const hits = arr.map(sg => {
    const G = sg.leg.at(sg.b.len), st = sg.eng === '2d' ? popStats2(G) : popStats(G);
    const [, ly] = toLocal(f, sg.b.x0 + sg.b.dx * sg.b.len, sg.b.y0 + sg.b.dy * sg.b.len);
    const p = sYx * -sg.b.dy + sYy * sg.b.dx;           // cosine of the tilt, signed by the in-plane axis
    return Object.assign({ sg, G, st, ly, p }, arrival3(el, sg.b));
  });
  // each arrival's power (mW), its line's share of its laser's: separate lasers and lines weigh in by it, against the
  // strongest arrival's laser
  for (const h2 of hits) h2.Pl = Math.max(0, h2.sg.b.lmw || 0);
  const dom = hits.reduce((x, y) => y.st.power * segW(y.sg) * (y.Pl || 1) > x.st.power * segW(x.sg) * (x.Pl || 1) ? y : x);
  // so the map stays per unit of the strongest arrival's laser power (all its lines), the others scaled to it
  const PL = Math.max(0, splitRoot(dom.sg.src).power || 0);
  for (const h2 of hits) h2.lw = PL > 0 ? Math.sqrt(h2.Pl / PL) : 1;
  const { sg, G, st } = dom;
  const lam = G.lam0 / G.n, len = sg.b.len3 || sg.b.len;
  // the other modes of the dominant arrival's beam, when its M^2 is above 1
  const sibs = hits.filter(h2 => h2 !== dom && h2.sg.b === sg.b && h2.sg.eng === '2d' && sg.eng === '2d');

  // The ideal: the same path with every surface's aberration taken out, leaving the last
  // surface and brought to a perfect focus on the screen. Its on-axis sum is coherent, so
  // the ripples of a band-limited edge cancel as they should rather than adding up.
  const chain = new Set();
  for (let i = sg.i; i >= 0; i = lastTrace.beams[i].parent) chain.add(i);
  const twin = popRun(lastTrace.beams, [sg.src], { keep: chain, paraxial: true }).segs.find(s2 => s2.i === sg.i) || sg;
  const P0 = twin.F0;
  const kk = 2 * Math.PI * P0.n / P0.lam0;
  let Ar = 0, Ai = 0, Aw = 0;                  // Aw: the coherent sums of other components, as power
  const addPh = (re, im, ph, wgt) => { const c = Math.cos(ph), s = Math.sin(ph); Ar += (re * c - im * s) * wgt; Ai += (re * s + im * c) * wgt; };
  if (twin.eng === '2d') {
    // put the reference back and take the pilot's own curvature off, in each direction; each
    // polarisation component focuses on its own, so each is summed on its own
    const N = P0.N, ref = st2 => popInside(st2.z, st2.zR) ? 0 : -kk / (2 * st2.z), cur = st2 => 0.5 * kk * popInvR([st2.z, st2.zR]);
    const bx = ref(P0.ax) + cur(P0.ax), by = ref(P0.ay) + cur(P0.ay), wgt = P0.ax.d * P0.ay.d;
    for (const [kr, ki] of fieldComps(P0)) {
      Ar = 0; Ai = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = (i - N / 2) * P0.ax.d, y = (j - N / 2) * P0.ay.d, o = j * N + i;
        addPh(P0[kr][o], P0[ki][o], bx * x * x + by * y * y, wgt);
      }
      Aw += Ar * Ar + Ai * Ai;
    }
    Ar = Math.sqrt(Aw); Ai = 0;
  } else {
    const Q = qdht(P0.re.length), r = popRadii(Q, P0.R), V = Q.S / (2 * Math.PI * P0.R);
    const b = (P0.sphere ? -kk / (2 * P0.z) : 0) + 0.5 * kk * popInvR([P0.z, P0.zR]);
    for (let i = 0; i < Q.N; i++) addPh(P0.re[i], P0.im[i], b * r[i] * r[i], Q.inv[i] / (Math.PI * V * V));
  }
  const lamT = P0.lam0 / P0.n;
  let Iideal = (Ar * Ar + Ai * Ai) / (lamT * len) ** 2;
  // A field whose parts cancel on the axis (four lobes behind crossed polarisers, a vortex)
  // has no focus to compare against: when its best on-axis sum is nothing beside its total
  // amplitude, the Strehl ratio has no meaning
  {
    let absSum = 0;
    if (twin.eng === '2d') { for (const [kr, ki] of fieldComps(P0)) for (let i = 0; i < P0[kr].length; i++) absSum += Math.hypot(P0[kr][i], P0[ki][i]); absSum *= P0.ax.d * P0.ay.d; }
    else { const Q = qdht(P0.re.length), V = Q.S / (2 * Math.PI * P0.R); for (let i = 0; i < Q.N; i++) absSum += Math.hypot(P0.re[i], P0.im[i]) * Q.inv[i] / (Math.PI * V * V); }
    if (Ar * Ar + Ai * Ai < 1e-6 * absSum * absSum) Iideal = 0;
  }
  // The actual field's on-axis value by the same direct sum, against what the transforms
  // gave: the ratio calibrates the propagated peak, so both sides share one numerics
  let calib = 1;
  {
    const A0 = sg.F0;
    let Er = 0, Ei = 0, Ew = 0;
    const add = (re, im, ph, wgt) => { const c = Math.cos(ph), s = Math.sin(ph); Er += (re * c - im * s) * wgt; Ei += (re * s + im * c) * wgt; };
    if (sg.eng === '2d') {
      const N = A0.N, ref = st2 => popInside(st2.z, st2.zR) ? 0 : -kk / (2 * st2.z), q2 = -kk / (2 * len);
      const bx = ref(A0.ax) + q2, by = ref(A0.ay) + q2, wgt = A0.ax.d * A0.ay.d;
      for (const [kr, ki] of fieldComps(A0)) {
        Er = 0; Ei = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const x = (i - N / 2) * A0.ax.d, y = (j - N / 2) * A0.ay.d, o = j * N + i;
          add(A0[kr][o], A0[ki][o], bx * x * x + by * y * y, wgt);
        }
        Ew += Er * Er + Ei * Ei;
      }
      Er = Math.sqrt(Ew); Ei = 0;
    } else {
      const Q = qdht(A0.re.length), r = popRadii(Q, A0.R), V = Q.S / (2 * Math.PI * A0.R);
      const b = (A0.sphere ? -kk / (2 * A0.z) : 0) - kk / (2 * len);
      for (let i = 0; i < Q.N; i++) add(A0.re[i], A0.im[i], b * r[i] * r[i], Q.inv[i] / (Math.PI * V * V));
    }
    const direct = (Er * Er + Ei * Ei) / (lamT * len) ** 2;
    const viaT = st.axis;
    if (viaT > 1e-3 * (Math.max(...(sg.eng === '2d' ? [st.peak] : [st.peak])) || 1) && direct > 0) calib = direct / viaT;
  }

  // a uniform pupil has a numerical aperture, from its rays; a Gaussian beam has none
  let NA = null;
  if (sg.b.fan) {
    const rays = (lastTrace.screens[el.id] || []).filter(t => !t.chief && t.nm === sg.b.nm && t.id.startsWith(sg.b.src + ':'));
    if (rays.length >= 3) NA = Math.max(...rays.map(t => Math.abs(t.n * t.dly)));
    if (!(NA > 1e-9)) NA = null;
  }
  const lam0 = G.lam0, airy = NA ? 0.61 * lam0 / NA : null, cutoff = NA ? 2 * NA / lam0 : null;
  const nR = 512, rho = new Float64Array(nR), psf = new Float64Array(nR), ee = new Float64Array(nR);
  let peak, px = 0, py = 0, fwhmX, fwhmY, cutX = null, cutY = null, freq, mtf, mtfY, wx = st.wx || st.w, wy = st.wy || st.w;
  const half = (xs, ys) => {                                 // half width at half maximum of a curve from its peak
    let k = 0; for (let i = 1; i < ys.length; i++) if (ys[i] > ys[k]) k = i;
    const h = 0.5 * ys[k];
    const side = dir => {
      for (let i = k; i >= 0 && i < ys.length; i += dir) if (ys[i] <= h) {
        const j = i - dir, t = (ys[j] - h) / ((ys[j] - ys[i]) || 1);
        return Math.abs(xs[j] + t * (xs[i] - xs[j]) - xs[k]);
      }
      return null;
    };
    const l = side(-1), r = side(1);
    return l === null || r === null ? (l ?? r) : 0.5 * (l + r);
  };

  if (sg.eng !== '2d') {
    const Q = qdht(G.re.length), r = popRadii(Q, G.R), V = Q.S / (2 * Math.PI * G.R), ar = 1 / (Math.PI * V * V);
    const I = new Float64Array(Q.N);
    for (let i = 0; i < Q.N; i++) I[i] = G.re[i] ** 2 + G.im[i] ** 2;
    const I0 = popAxis(G)[0];
    peak = Math.max(I0, ...I);
    const rMax = Math.min(r[Q.N - 1], airy ? 16 * airy : 4 * st.w);
    let j = 0, acc = 0, ci = 0;
    const tot = (st.power || 1) / sg.repr;                  // what the grid cannot hold is still light
    for (let i = 0; i < nR; i++) {
      const x = rMax * i / (nR - 1);
      rho[i] = x;
      while (j < Q.N - 2 && r[j + 1] < x) j++;
      psf[i] = x <= r[0] ? I0 + (I[0] - I0) * (x / r[0]) ** 2 : I[j] + (I[j + 1] - I[j]) * Math.min(1, (x - r[j]) / (r[j + 1] - r[j]));
      while (ci < Q.N && r[ci] <= x) { acc += I[ci] * Q.inv[ci] * ar; ci++; }
      ee[i] = acc / tot;
    }
    // near the axis, the profile and its half width from the field between its samples
    {
      const Ir = popIntensityAt(G), rIn = Math.min(rMax, r[Math.min(Q.N - 1, 12)]);
      for (let i = 0; i < nR && rho[i] <= rIn; i++) psf[i] = Ir(rho[i]);
      const k0 = psf.indexOf(Math.max(...psf));
      if (k0 === 0) {
        // a peak on the axis: bisection on the exact profile (a ring's half width stays as sampled)
        const h = 0.5 * Ir(0);
        let lo = 0, hi = null;
        for (let i = 1; i < nR; i++) if (psf[i] <= h) { hi = rho[i]; lo = rho[i - 1]; break; }
        if (hi !== null) { for (let it = 0; it < 40; it++) { const m = 0.5 * (lo + hi); if (Ir(m) > h) lo = m; else hi = m; } fwhmX = fwhmY = lo + hi; }
        else fwhmX = fwhmY = 0;
        peak = Math.max(peak, Ir(0));
      } else fwhmX = fwhmY = 2 * (half(Array.from(rho), Array.from(psf)) || 0);
    }
    const fmax = cutoff || 1.2 / st.w, nF = 128;
    freq = new Float64Array(nF); mtf = new Float64Array(nF);
    let m0 = 0;
    for (let i = 0; i < Q.N; i++) m0 += I[i] * Q.inv[i];
    for (let q = 0; q < nF; q++) {
      const nu = fmax * q / (nF - 1);
      let s = 0;
      for (let i = 0; i < Q.N; i++) s += I[i] * Q.inv[i] * besselJ01(2 * Math.PI * nu * r[i])[0];
      freq[q] = nu; mtf[q] = q ? Math.abs(s / (m0 || 1)) * sg.repr : 1;
    }
    mtfY = mtf;
  } else {
    const N = G.N, dx = G.ax.d, dy = G.ay.d, I = new Float64Array(N * N);
    let ip = 0;
    for (let i = 0; i < N * N; i++) I[i] = field2I(G, i);
    // a beam of M^2 above 1: its other modes on the same segment, as intensities
    for (const h2 of sibs) {
      const F = h2.G;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = (i - N / 2) * dx, y = (j - N / 2) * dy, a = interp2(F, x, y);
        let v = a[0] * a[0] + a[1] * a[1];
        if (F.re2) { const b2 = interp2(F, x, y, F.re2, F.im2); v += b2[0] * b2[0] + b2[1] * b2[1]; }
        I[j * N + i] += v;
      }
    }
    for (let i = 0; i < N * N; i++) if (I[i] > I[ip]) ip = i;
    if (sibs.length) {                                     // the whole beam's widths, from its moments
      let s0 = 0, sx = 0, sy = 0, sxx = 0, syy = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const v = I[j * N + i], x = (i - N / 2) * dx, y = (j - N / 2) * dy;
        s0 += v; sx += v * x; sy += v * y; sxx += v * x * x; syy += v * y * y;
      }
      if (s0 > 0) { wx = 2 * Math.sqrt(Math.max(0, sxx / s0 - (sx / s0) ** 2)); wy = 2 * Math.sqrt(Math.max(0, syy / s0 - (sy / s0) ** 2)); }
    }
    peak = I[ip];
    // centred on the light's centroid: the same as the peak for a spot, and the middle of a
    // pattern of lobes (a Maltese cross, a donut) rather than one of them
    let sI = 0, sx = 0, sy = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const v = I[j * N + i]; sI += v; sx += v * (i - N / 2); sy += v * (j - N / 2); }
    px = sI > 0 ? sx / sI * dx : 0; py = sI > 0 ? sy / sI * dy : 0;
    const ix = ip % N, iy = Math.floor(ip / N);          // the profiles and cuts still run through the peak
    const rMax = Math.min(N / 2 * Math.min(dx, dy), airy ? 16 * airy : 4 * Math.max(wx, wy));
    const sum = new Float64Array(nR), cnt = new Float64Array(nR), pw = new Float64Array(nR);
    let tot = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = I[j * N + i]; tot += v;
      const r = Math.hypot((i - ix) * dx, (j - iy) * dy), b = Math.round(r / rMax * (nR - 1));
      if (b < nR) { sum[b] += v; cnt[b]++; pw[b] += v; }
    }
    let acc = 0, last = I[ip];
    tot /= sg.repr;
    for (let b = 0; b < nR; b++) {
      rho[b] = rMax * b / (nR - 1);
      if (cnt[b]) last = sum[b] / cnt[b];
      psf[b] = last;
      acc += pw[b]; ee[b] = acc / (tot || 1);
    }
    // cuts through the peak, in the bench plane and out of it
    // taken from the field between its samples (four points a sample near the peak), not by
    // joining the intensity samples with straight lines, which misplaces a sharp peak's half height
    cutX = { x: [], I: [] }; cutY = { x: [], I: [] };
    const exact = !sibs.length;                    // a sum of modes has no single field to interpolate
    const lineX = exact ? field2LineAt(G, 'x', iy) : null, lineY = exact ? field2LineAt(G, 'y', ix) : null;
    const cut = (C, line, i0, d, raw) => {
      for (let i = 0; i < N; i++) {
        const x = (i - i0) * d;
        if (Math.abs(x) > rMax) continue;
        const sub = line && Math.abs(i - i0) <= 8 ? 4 : 1;
        for (let q = 0; q < sub; q++) { const u = i + q / sub; if (u - i0 > rMax / d) break; C.x.push((u - i0) * d); C.I.push(q ? line(u) : raw(i)); }
      }
    };
    cut(cutX, lineX, ix, dx, i => I[iy * N + i]);
    cut(cutY, lineY, iy, dy, j => I[j * N + ix]);
    if (exact) {
      const hx = halfWidthOf(lineX, ix, 1, rMax / dx), hy = halfWidthOf(lineY, iy, 1, rMax / dy);
      fwhmX = hx.hw !== null ? 2 * hx.hw * dx : 0; fwhmY = hy.hw !== null ? 2 * hy.hw * dy : 0;
      peak = Math.max(peak, hx.peak, hy.peak);
    } else { fwhmX = 2 * (half(cutX.x, cutX.I) || 0); fwhmY = 2 * (half(cutY.x, cutY.I) || 0); }
    // MTF in each direction from its line spread
    const lx = new Float64Array(N), lyy = new Float64Array(N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { lx[i] += I[j * N + i]; lyy[j] += I[j * N + i]; }
    const fmax = cutoff || 1.2 / Math.max(1e-12, Math.min(wx, wy)), nF = 128;
    freq = new Float64Array(nF); mtf = new Float64Array(nF); mtfY = new Float64Array(nF);
    const tf = (L, d, nu) => {
      if (nu > 0.5 / d) return 0;                          // past this axis's Nyquist the samples say nothing
      let re = 0, im = 0, s = 0;
      for (let i = 0; i < N; i++) { const x = (i - N / 2) * d, ph = -2 * Math.PI * nu * x; re += L[i] * Math.cos(ph); im += L[i] * Math.sin(ph); s += L[i]; }
      return Math.hypot(re, im) / (s || 1);
    };
    for (let q = 0; q < nF; q++) {
      const nu = fmax * q / (nF - 1), g = q ? sg.repr : 1;
      freq[q] = nu; mtf[q] = tf(lx, dx, nu) * g; mtfY[q] = tf(lyy, dy, nu) * g;
    }
  }
  const fall = ys => {
    for (let j = 1; j < ys.length; j++) if (ys[j] <= 0.5) {
      const t = (0.5 - ys[j - 1]) / ((ys[j] - ys[j - 1]) || 1);
      return freq[j - 1] + t * (freq[j] - freq[j - 1]);
    }
    return freq[freq.length - 1];
  };
  const radiusAt = frac => {
    for (let i = 1; i < nR; i++) if (ee[i] >= frac) {
      const t = (frac - ee[i - 1]) / (ee[i] - ee[i - 1] || 1);
      return rho[i - 1] + t * (rho[i] - rho[i - 1]);
    }
    return rho[nR - 1];
  };

  // The irradiance map on the screen: every arrival where it lands, as a field. Arrivals
  // from one launch add as amplitudes (each with its exact reference phase, its path along
  // the screen past its own hit point, and its Jones vector); separate launches add as
  // intensities. Placed on a finer grid when anything interferes.
  const cU = dom.ly + (sg.eng === '2d' ? px : 0) / (dom.p || 1), cV = py + (dom.lz || 0);
  let H = 0;
  for (const h2 of hits) {
    // each direction reaches as far as its own light and its own grid, the map keeping one scale
    const two = h2.sg.eng === '2d';
    const gx = two ? h2.G.N / 2 * h2.G.ax.d : h2.G.R, gy = two ? h2.G.N / 2 * h2.G.ay.d : h2.G.R;
    const ex = Math.min(gx, Math.max(2 * (h2.st.wx || h2.st.w), airy ? 6 * airy : 0, 3 * (fwhmX || 0)));
    const ey = Math.min(gy, Math.max(2 * (h2.st.wy || h2.st.w), airy ? 6 * airy : 0, 3 * (fwhmY || 0)));
    const cu = h2.ly + (h2.st.cx || 0) / (h2.p || 1), cv = (h2.st.cy || 0) + (h2.lz || 0);
    H = Math.max(H, Math.abs(cu - cU) + ex / Math.abs(h2.p || 1), Math.abs(cv - cV) + ey);
  }
  const launches = new Map();
  for (const h2 of hits) { if (!launches.has(h2.sg.coh)) launches.set(h2.sg.coh, []); launches.get(h2.sg.coh).push(h2); }
  const coherent = [...launches.values()].some(L2 => L2.length > 1);
  // a laser with a line of its own: each launch split into its incoherent parts, each a
  // weighted coherent sum of the launch's arrivals (the weights ride on the array as cs)
  const vLaunches = new Map();
  for (const [key, L2] of launches) {
    const cm = cohModes(L2[0].sg.src, L2.map(h2 => (h2.sg.b.gpl || 0) + (h2.sg.b.ng || h2.sg.b.n) * h2.sg.b.len + lagOf(h2.sg.src)));
    if (!cm) { vLaunches.set(key, L2); continue; }
    cm.forEach((c, k) => { const a = L2.slice(); a.cs = c; vLaunches.set(key + '~' + k, a); });
  }
  // the finest fringes: the steepest angle between two beams of one launch. Where anything interferes the map takes three
  // pixels to its finest fringe, from 256 across up to 1024 (past that the fringes alias, and the panel says so)
  let pFine = Infinity;
  for (const L2 of launches.values()) for (let i = 0; i < L2.length; i++) for (let j = i + 1; j < L2.length; j++) {
    const a = L2[i].sg.b, b = L2[j].sg.b, ang = Math.acos(Math.min(1, a.dx * b.dx + a.dy * b.dy));
    if (ang > 0) pFine = Math.min(pFine, (a.nm * 1e-6 / L2[i].G.n) / ang);
  }
  const MN = coherent ? Math.max(256, Math.min(1024, Math.ceil(3 * 2 * H / pFine))) : MAP_N;
  const map = new Float32Array(MN * MN), inc = new Float32Array(MN * MN), pm = polMaps(MN);
  // each arrival's complex field at a point on the screen
  const fieldAt = h2 => segFieldAt(h2, sYx, sYy);
  // Stokes parameters over the whole spot, from the fields as they add at each point:
  // S1 = |Ep|^2 - |Es|^2 (in the bench plane against out of it), S2 at 45 degrees, S3 the
  // circular part, positive right-handed as the tracer counts it. Launches add as Stokes.
  const stokes = [0, 0, 0, 0];
  const domL = [...vLaunches.values()].find(L2 => L2.includes(dom));
  // the cross terms between the arrivals of one launch at each point, Σ_{i<j} E_j·E_i*, summed over its incoherent parts, so how
  // deep its fringes run there (2|X| over the powers' sum) whatever phase the map's pixels happen to fall on
  const xr = new Float32Array(MN * MN), xi = new Float32Array(MN * MN), cross = new Float32Array(MN * MN);
  let xKey = null;
  const flush = () => { for (let i = 0; i < MN * MN; i++) { if (xr[i] || xi[i]) cross[i] += Math.hypot(xr[i], xi[i]); xr[i] = 0; xi[i] = 0; } };
  for (const [vk, L2] of vLaunches) {
    const base = String(vk).split('~')[0];
    if (xKey !== null && base !== xKey) flush();
    xKey = base;
    const parts = L2.map((h2, i) => ({ f: fieldAt(h2), c: (L2.cs ? L2.cs[i] : 1) * h2.lw }));
    for (let jv = 0; jv < MN; jv++) {
      const v = cV + ((jv + 0.5) / MN * 2 - 1) * H;
      for (let iu = 0; iu < MN; iu++) {
        const u = cU + ((iu + 0.5) / MN * 2 - 1) * H;
        let sr = 0, si = 0, pr = 0, pi = 0, ii = 0, Xr = 0, Xi = 0;
        for (const P of parts) {
          const e = P.f(u, v);
          if (!e) continue;
          const c = P.c, e0 = c * e[0], e1 = c * e[1], e2 = c * e[2], e3 = c * e[3];
          Xr += e0 * sr + e1 * si + e2 * pr + e3 * pi; Xi += e1 * sr - e0 * si + e3 * pr - e2 * pi;
          sr += e0; si += e1; pr += e2; pi += e3;
          ii += e0 * e0 + e1 * e1 + e2 * e2 + e3 * e3;
        }
        const Is = sr * sr + si * si, Ip = pr * pr + pi * pi;
        map[jv * MN + iu] += Is + Ip;
        inc[jv * MN + iu] += ii;
        xr[jv * MN + iu] += Xr; xi[jv * MN + iu] += Xi;
        stokes[0] += Is + Ip; stokes[1] += Ip - Is; stokes[2] += 2 * (pr * sr + pi * si); stokes[3] += -2 * (pi * sr - pr * si);
        pm.add(jv * MN + iu, sr, si, pr, pi, L2 === domL);
      }
    }
  }
  flush();
  // how much the fields added up to, and how deep the fringes run where the beams are
  let sC = 0, sI = 0, iMax = 0;
  for (let i = 0; i < MN * MN; i++) { sC += map[i]; sI += inc[i]; iMax = Math.max(iMax, inc[i]); }
  // fringe contrast point by point, from the cross terms over the powers' sum: the beams' own profile is not a fringe
  let vMax = 0;
  for (let i = 0; i < MN * MN; i++) if (inc[i] >= 0.05 * iMax) vMax = Math.max(vMax, Math.min(1, 2 * cross[i] / inc[i]));
  const interference = coherent && sI > 0 ? sC / sI : null;
  const visibility = coherent && iMax > 0 ? vMax : null;
  // fringes finer than the map
  const fine = pFine < 3 * 2 * H / MN;

  const tilt = Math.acos(Math.min(1, Math.abs(dom.p))) / deg;
  // power arriving: each arrival's field power times its Jones power; where they
  // interfere, scaled by what the fields added up to on the map
  const powerInc = hits.reduce((s, h2) => s + h2.st.power * segW(h2.sg) * h2.lw * h2.lw / h2.sg.repr, 0);
  const power = interference === null ? powerInc : powerInc * interference;
  const Dout = {
    symmetric: sg.eng !== '2d', engine: sg.eng, NA, nm: sg.b.nm, airy, cutoff,
    strehl: Iideal > 0 && !sibs.length ? peak * calib / Iideal : null, peak: peak * segW(sg) * dom.lw * dom.lw, power, powerInc, interference, visibility, fine,
    coherent, wx, wy, arrivals: hits.length, launches: launches.size, tilt,
    laser: dom.sg.src ? { name: splitRoot(dom.sg.src).name, mW: PL } : null, lasers: new Set(hits.map(h2 => splitRoot(h2.sg.src).id)).size,
    stokes: stokes[0] > 0 ? stokes.map(v => v / stokes[0]) : null,
    dop: stokes[0] > 0 ? Math.hypot(stokes[1], stokes[2], stokes[3]) / stokes[0] : null,
    curved: !!el.R, steep: [...R.notes.steep], coarse: [...R.notes.coarse], clipped: [...R.notes.clipped], fan: !!sg.b.fan,
    rho, psf, ee, freq, mtf, mtfY, cutX, cutY,
    mtf50: fall(mtf), mtf50Y: fall(mtfY),
    fwhm: fwhmX && fwhmY ? Math.sqrt(fwhmX * fwhmY) : null, fwhmX, fwhmY,
    ee50: radiusAt(0.5), ee80: radiusAt(0.8),
    map: { v: map, inc, n: MN, u0: cU - H, u1: cU + H, v0: cV - H, v1: cV + H },
  };
  pm.done(Dout.map);
  if (el.trap && el.trap !== 'none') { try { Dout.trap = trapSolve(el, R, dom, len); } catch (err) { Dout.trap = { error: String(err && err.message || err) }; } }
  vfApply(el, Dout, hits, vLaunches, R, sYx, sYy);
  return diffFns(Dout);
}
/* A screen's MTF at any frequency, from its sampled curves: past the last sample, nothing
   where a pupil sets a cut-off, else the last value. Kept apart from the figures, so they
   can come back from the field worker as plain data and get these again. */
export function diffFns(D) {
  if (!D) return D;
  const at = (ys, nu) => {
    const freq = D.freq, fmax = freq[freq.length - 1];
    if (nu <= 0) return 1;
    if (nu >= fmax) return D.cutoff && !D.vector ? 0 : ys[ys.length - 1];
    const x = nu / fmax * (freq.length - 1), i = Math.min(freq.length - 2, Math.floor(x));
    return ys[i] + (ys[i + 1] - ys[i]) * (x - i);
  };
  D.mtfAt = nu => at(D.mtf, nu); D.mtfAtY = nu => at(D.mtfY, nu);
  return D;
}

/* One arrival's complex field at a point on a screen or diode (u along it, v out of the
   plane), as [s re, s im, p re, p im], p with its parity sign: from the field's own
   components on the 2D engine, from the profile and the Jones vector on the round one */
export function segFieldAt(h2, sYx, sYy) {
  const G2 = h2.G, two = h2.sg.eng === '2d', k = 2 * Math.PI * G2.n / G2.lam0, b = h2.sg.b;
  const cz = sYx * b.dx + sYy * b.dy;                    // how far along the beam a step along the screen goes
  const r = two ? null : popRadii(qdht(G2.re.length), G2.R);
  const bR = two ? 0 : (G2.sphere ? -k / (2 * G2.z) : 0);
  const bx = two ? (popInside(G2.ax.z, G2.ax.zR) ? 0 : -k / (2 * G2.ax.z)) : 0;
  const by = two ? (popInside(G2.ay.z, G2.ay.zR) ? 0 : -k / (2 * G2.ay.z)) : 0;
  // as [s re, s im, p re, p im], p with its parity sign: from the field's own components on
  // the 2D engine, from the profile and the Jones vector on the round one
  const J = popJ(b), g = b.par ? -1 : 1;
  return (u, v) => {
    // off the plane: from where it landed up the face, its footprint stretched up a face it meets sloped
    const s = u - h2.ly, dv = v - (h2.lz || 0), hx = h2.vs ? 1 / Math.sqrt(1 + h2.vs * h2.vs) : 1, ez = (h2.vs || 0) * hx;
    const x = s * h2.p, y = h2.vs ? hx * dv - ez * (h2.ldy3 || cz) * s : dv;
    let ur = 0, ui = 0, ph = h2.vs ? -k * (s * cz * hx + dv * ez) : -k * s * cz;
    if (two) {
      const fx = x / G2.ax.d + G2.N / 2, fy = y / G2.ay.d + G2.N / 2, i0 = Math.floor(fx), j0 = Math.floor(fy);
      if (i0 < 0 || j0 < 0 || i0 >= G2.N - 1 || j0 >= G2.N - 1) return null;
      const tx = fx - i0, ty = fy - j0, o = j0 * G2.N + i0, N2 = G2.N;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const bl = A => w00 * A[o] + w10 * A[o + 1] + w01 * A[o + N2] + w11 * A[o + N2 + 1];
      ph += bx * x * x + by * y * y;
      const c = Math.cos(ph), sn = Math.sin(ph), rot = (a, b2) => [a * c - b2 * sn, a * sn + b2 * c];
      const S = rot(bl(G2.re), bl(G2.im));
      if (!G2.re2) return [S[0] * J[0] - S[1] * J[1], S[0] * J[1] + S[1] * J[0], S[0] * J[2] - S[1] * J[3], S[0] * J[3] + S[1] * J[2]];
      const P = rot(bl(G2.re2), bl(G2.im2));
      return [S[0], S[1], g * P[0], g * P[1]];
    } else {
      const q = Math.hypot(x, y);
      if (q <= r[0]) { ur = G2.re[0]; ui = G2.im[0]; }
      else if (q < r[r.length - 1]) {
        let lo = 0, hi = r.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (r[mid] <= q) lo = mid; else hi = mid; }
        const t = (q - r[lo]) / (r[hi] - r[lo]);
        ur = G2.re[lo] + (G2.re[hi] - G2.re[lo]) * t; ui = G2.im[lo] + (G2.im[hi] - G2.im[lo]) * t;
      } else return null;
      ph += bR * q * q;
    }
    const c = Math.cos(ph), sn = Math.sin(ph), er = ur * c - ui * sn, ei = ur * sn + ui * c;
    return [er * J[0] - ei * J[1], er * J[1] + ei * J[0], er * J[2] - ei * J[3], er * J[3] + ei * J[2]];
  };
}

