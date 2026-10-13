import { JONES_TYPES, linesPerMm } from '../core/modulators.js';
import { hermite } from '../core/pulses.js';
import { MASK_EDGE_SHARE, maskFootprint, maskJumps, maskResets } from '../core/mask.js';
import { paraxial } from './trace.js';
import { W, sx, wx, wy } from '../ui/render.js';
import { ci } from './fibre.js';
import { h } from '../ui/panel.js';
import { popInside, popInvR, popPhiExact, popPhiPar, popW } from './field.js';
import { cx } from './cavity.js';
import { jonesOf, polCoeff, polMatrixTo } from './polarisation.js';
import { beamAxes, popScreen } from './phase-screen.js';
import { popClear } from './beam-tree.js';

/* ---------- The separable two-dimensional field ----------
   The Fresnel kernel is a product of an x part and a y part, so each axis keeps its own
   pilot (and so its own waist, grid spacing and choice of near- or far-field step): an
   astigmatic beam focuses in x and y at different places without the grid blowing up.
   Free space is paraxial here; the round engine keeps the exact angular spectrum. */
const fftTables = new Map();
function fftTable(n) {
  if (fftTables.has(n)) return fftTables.get(n);
  const c = new Float64Array(n / 2), s = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { c[i] = Math.cos(2 * Math.PI * i / n); s[i] = Math.sin(2 * Math.PI * i / n); }
  const rev = new Uint32Array(n);
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; rev[i] = j; }
  const T = { c, s, rev };
  fftTables.set(n, T);
  return T;
}
/* In place, unnormalised; sign +1 is the e^{+2 pi i mn/N} direction */
export function fft(re, im, sign) {
  const n = re.length, { c, s, rev } = fftTable(n);
  for (let i = 1; i < n; i++) { const j = rev[i]; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, step = n / len;
    // each twiddle once a stage, then every butterfly that uses it
    for (let k = 0; k < half; k++) {
      const wr = c[k * step], wi = sign * s[k * step];
      for (let a = k; a < n; a += len) {
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  }
}
/* Centred DFT, X_m = sum_n x_n e^{sign 2 pi i (m - N/2)(n - N/2)/N}, for N a multiple of 4 */
export function cdft(re, im, sign) {
  const n = re.length;
  for (let i = 1; i < n; i += 2) { re[i] = -re[i]; im[i] = -im[i]; }
  fft(re, im, sign);
  for (let i = 1; i < n; i += 2) { re[i] = -re[i]; im[i] = -im[i]; }
}
export const cmulPhase = (re, im, i, ph, a) => {
  const c = Math.cos(ph) * a, s = Math.sin(ph) * a, x = re[i] * c - im[i] * s;
  im[i] = re[i] * s + im[i] * c; re[i] = x;
};
/* sqrt(i / (lam d)), the one-axis share of the Fresnel prefactor */
const fresnelPre = (lam, d) => [d > 0 ? Math.PI / 4 : -Math.PI / 4, 1 / Math.sqrt(lam * Math.abs(d))];

/* One axis of a line, as a plan: what is done to every line alike (transforms, reversals, and
   phase factors, each sample's cos and sin times its amplitude, worked out once), and the new
   state. A field's step moves all N of its lines the same way, so the factors are worked out
   once a step rather than once a line. st = { d: spacing, z: past the waist, zR }. */
function planMul(n, phAt, ampAt) {
  const c = new Float64Array(n), s = new Float64Array(n);
  for (let m = 0; m < n; m++) { const ph = phAt(m), a = ampAt; c[m] = Math.cos(ph) * a; s[m] = Math.sin(ph) * a; }
  return { op: 'mul', c, s };
}
function axisASPlan(ops, n, st, dist, lam) {
  ops.push({ op: 'dft', sign: -1 });
  const df = 1 / (n * st.d);
  ops.push(planMul(n, m => { const fm = (m - n / 2) * df; return Math.PI * lam * dist * fm * fm; }, 1 / n));
  ops.push({ op: 'dft', sign: 1 });
  return { d: st.d, z: st.z + dist, zR: st.zR };
}
function axisToWaistPlan(ops, n, st, lam, k) {          // sphere at z, to the waist plane
  const d = -st.z;
  ops.push({ op: 'dft', sign: 1 });
  if (d < 0) ops.push({ op: 'rev' });
  const dW = lam * Math.abs(d) / (n * st.d);
  const [p0, a0] = fresnelPre(lam, d);
  ops.push(planMul(n, m => { const r = (m - n / 2) * dW; return p0 - k * r * r / (2 * d); }, a0 * st.d));
  return { d: dW, z: 0, zR: st.zR };
}
function axisFromWaistPlan(ops, n, st, z2, lam, k) {    // waist plane, to a sphere at z2
  ops.push(planMul(n, i => { const x = (i - n / 2) * st.d; return -k * x * x / (2 * z2); }, 1));
  ops.push({ op: 'dft', sign: 1 });
  if (z2 < 0) ops.push({ op: 'rev' });
  const [p0, a0] = fresnelPre(lam, z2);
  ops.push(planMul(n, () => p0, a0 * st.d));
  return { d: lam * Math.abs(z2) / (n * st.d), z: z2, zR: st.zR };
}
function reverseLine(re, im) {
  const n = re.length;
  for (let m = 1; m < n / 2; m++) {
    const a = m, b = n - m;
    let t = re[a]; re[a] = re[b]; re[b] = t; t = im[a]; im[a] = im[b]; im[b] = t;
  }
}
/* Moving a line a distance t along the beam, steps chosen from its own pilot: { ops, st } */
function axisPlan(n, st, t, lam, k) {
  const ops = [], z2 = st.z + t;
  const in1 = popInside(st.z, st.zR), in2 = popInside(z2, st.zR);
  if (in1 && in2) return { ops, st: axisASPlan(ops, n, st, t, lam) };
  const W = in1 ? axisASPlan(ops, n, st, -st.z, lam) : axisToWaistPlan(ops, n, st, lam, k);
  return { ops, st: in2 ? axisASPlan(ops, n, W, z2, lam) : axisFromWaistPlan(ops, n, W, z2, lam, k) };
}
function axisApply(ops, re, im) {
  const n = re.length;
  for (const P of ops) {
    if (P.op === 'dft') cdft(re, im, P.sign);
    else if (P.op === 'rev') reverseLine(re, im);
    else { const c = P.c, s = P.s; for (let i = 0; i < n; i++) { const x = re[i] * c[i] - im[i] * s[i]; im[i] = re[i] * s[i] + im[i] * c[i]; re[i] = x; } }
  }
}
/* Move one line a distance t along the beam. Returns the new state. */
function axisRoute(re, im, st, t, lam, k) {
  const P = axisPlan(re.length, st, t, lam, k);
  axisApply(P.ops, re, im);
  return P.st;
}
/* An N x N array turned about its diagonal, into a new one, in 32 x 32 blocks */
function transposeSq(A, N) {
  const B = new Float64Array(N * N), T = 32;
  for (let j0 = 0; j0 < N; j0 += T) for (let i0 = 0; i0 < N; i0 += T) {
    const j1 = Math.min(N, j0 + T), i1 = Math.min(N, i0 + T);
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) B[i * N + j] = A[j * N + i];
  }
  return B;
}
/* The same along every row (x) or every column (y) of a field */
/* A 2D field is a vector: re, im hold its s component (out of the bench plane), re2, im2 its
   p component (in the plane, along the beam's own normal, in the parity convention, the
   same basis as the tracer's Jones vectors). Paraxial free space moves each alike. */
export const fieldComps = F => F.re2 ? [['re', 'im'], ['re2', 'im2']] : [['re', 'im']];
function field2Axis(F, axis, t) {
  const N = F.N, lam = F.lam0 / F.n, k = 2 * Math.PI * F.n / F.lam0;
  const out = Object.assign({}, F);
  // the same steps for every line: planned once
  const P = axisPlan(N, axis === 'x' ? F.ax : F.ay, t, lam, k), st = P.st;
  for (const [kr, ki] of fieldComps(F)) {
    // rows lie in one piece and are moved where they are; columns are first turned into rows
    // (and back after), a block at a time, rather than gathered one by one across the field
    const re = axis === 'x' ? new Float64Array(F[kr]) : transposeSq(F[kr], N), im = axis === 'x' ? new Float64Array(F[ki]) : transposeSq(F[ki], N);
    for (let j = 0; j < N; j++) axisApply(P.ops, re.subarray(j * N, j * N + N), im.subarray(j * N, j * N + N));
    out[kr] = axis === 'x' ? re : transposeSq(re, N); out[ki] = axis === 'x' ? im : transposeSq(im, N);
  }
  out.ax = axis === 'x' ? st : F.ax; out.ay = axis === 'y' ? st : F.ay;
  return out;
}
export function field2Propagate(F, t) {
  if (t === 0) return F;
  const G = field2Axis(field2Axis(F, 'x', t), 'y', t);
  // e^{-ikt}, shared by both axes and both components
  const ph = -2 * Math.PI * F.n / F.lam0 * t, c = Math.cos(ph), s = Math.sin(ph);
  for (const [kr, ki] of fieldComps(G)) {
    const R = G[kr], I = G[ki];
    for (let i = 0; i < R.length; i++) { const x = R[i] * c - I[i] * s; I[i] = R[i] * s + I[i] * c; R[i] = x; }
  }
  return G;
}
/* The steepest phase slope (rad/mm) a 2D field already carries along one axis, where it has
   light: a new grid must sample it as well as whatever the next surface adds */
export function field2Slope(F, axis) {
  const N = F.N, d = axis === 'x' ? F.ax.d : F.ay.d;
  let pk = 0; for (let i = 0; i < N * N; i++) pk = Math.max(pk, field2I(F, i));
  const floor = 1e-8 * pk;
  // A slope the grid must follow runs on over neighbouring steps; one lone big step is a
  // vortex's core, where the light is nothing, so each counts only as much as the step after it
  let g = 0;
  for (const [kr, ki] of fieldComps(F)) {
    const R = F[kr], I = F[ki];
    for (let j = 0; j < N - 1; j++) {
      let last = -1;
      for (let i = 0; i < N - 1; i++) {
        // along x, step i of row j; along y, step j of column i (so neighbours run along the axis)
        const o = axis === 'x' ? j * N + i : i * N + j, o2 = axis === 'x' ? o + 1 : o + N;
        const a = R[o] * R[o] + I[o] * I[o], b = R[o2] * R[o2] + I[o2] * I[o2];
        if (a < floor || b < floor) { last = -1; continue; }
        // the phase step between neighbours, arg(u2 conj u1)
        const dph = Math.abs(Math.atan2(I[o2] * R[o] - R[o2] * I[o], R[o2] * R[o] + I[o2] * I[o]));
        if (last >= 0) g = Math.max(g, Math.min(dph, last) / d);
        last = dph;
      }
    }
  }
  return g;
}
/* Intensity of a 2D field at a grid index, both components */
export const field2I = (F, o) => F.re[o] ** 2 + F.im[o] ** 2 + (F.re2 ? F.re2[o] ** 2 + F.im2[o] ** 2 : 0);
/* A scalar field made a vector: its profile times a Jones vector [sr, si, pr, pi] from the
   tracer, conjugated into the field's e^{-ikz} convention */
export function field2Vector(F, J) {
  const n = F.re.length, re = new Float64Array(n), im = new Float64Array(n), re2 = new Float64Array(n), im2 = new Float64Array(n);
  const [sr, si, pr, pi] = [J[0], -J[1], J[2], -J[3]];
  for (let i = 0; i < n; i++) {
    const a = F.re[i], b = F.im[i];
    re[i] = a * sr - b * si; im[i] = a * si + b * sr; re2[i] = a * pr - b * pi; im2[i] = a * pi + b * pr;
  }
  return Object.assign({}, F, { re, im, re2, im2 });
}

/* Power and moments on the grid */
export function popStats2(F) {
  const N = F.N, dx = F.ax.d, dy = F.ay.d;
  let p = 0, mx = 0, my = 0, mxx = 0, myy = 0, peak = 0;
  for (let j = 0; j < N; j++) {
    const y = (j - N / 2) * dy;
    for (let i = 0; i < N; i++) {
      const o = j * N + i, I = field2I(F, o), x = (i - N / 2) * dx;
      p += I; mx += I * x; my += I * y; mxx += I * x * x; myy += I * y * y;
      if (I > peak) peak = I;
    }
  }
  const cx = mx / (p || 1), cy = my / (p || 1);
  const wx = 2 * Math.sqrt(Math.max(0, mxx / (p || 1) - cx * cx)), wy = 2 * Math.sqrt(Math.max(0, myy / (p || 1) - cy * cy));
  const c = (N / 2) * N + N / 2;
  let ps = 0;
  if (F.re2) for (let i = 0; i < N * N; i++) ps += F.re[i] ** 2 + F.im[i] ** 2;
  return { power: p * dx * dy, w: wx, wx, wy, cx, cy, peak, axis: field2I(F, c), R: N / 2 * dx,
    powerS: F.re2 ? ps * dx * dy : null, powerP: F.re2 ? (p - ps) * dx * dy : null };
}

/* A Gaussian beam: qx and qy are the complex beam parameters in the two planes */
export function popGaussian2(N, qx, qy, n, lam0, power, comps) {
  const k = 2 * Math.PI * n / lam0, lam = lam0 / n, G = Math.sqrt(Math.PI * N);
  const ax = { d: G * popW(qx[0], qx[1], lam) / N, z: qx[0], zR: qx[1] };
  const ay = { d: G * popW(qy[0], qy[1], lam) / N, z: qy[0], zR: qy[1] };
  const re = new Float64Array(N * N), im = new Float64Array(N * N);
  // the Hermite-Gauss modes to add, [m, n, re, im] (a plain Gaussian when none are given);
  // modes of one order share a Gouy phase where qx = qy, as at a launch, so none is needed
  const cs = comps && comps.length ? comps : [[0, 0, 1, 0]];
  const part = (q, st, ord) => {      // one axis of exp(-ik x^2 / 2q), with its reference taken out
    const den = q[0] * q[0] + q[1] * q[1], ir = q[0] / den, ii = -q[1] / den;
    const sph = !popInside(q[0], q[1]);
    const ph = new Float64Array(N), a = new Map();
    // a Hermite-Gauss mode of order m along this axis, each of one norm
    const wq = popW(q[0], q[1], lam);
    for (const m of ord) {
      let f = 1; for (let i = 2; i <= m; i++) f *= i;
      const nm = Math.sqrt(Math.pow(2, m) * f), am = new Float64Array(N);
      for (let i = 0; i < N; i++) { const x = (i - N / 2) * st.d; am[i] = Math.exp(0.5 * k * x * x * ii) * (m ? hermite(m, Math.SQRT2 * x / wq) / nm : 1); }
      a.set(m, am);
    }
    for (let i = 0; i < N; i++) { const x = (i - N / 2) * st.d, x2 = x * x; ph[i] = -0.5 * k * x2 * ir + (sph ? k * x2 / (2 * q[0]) : 0); }
    return [a, ph];
  };
  const [axA, axP] = part(qx, ax, new Set(cs.map(c => c[0]))), [ayA, ayP] = part(qy, ay, new Set(cs.map(c => c[1])));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let ar = 0, ai = 0;
    for (const [m, n2, cr, ci] of cs) { const v = axA.get(m)[i] * ayA.get(n2)[j]; ar += v * cr; ai += v * ci; }
    const o = j * N + i, ph = axP[i] + ayP[j], c = Math.cos(ph), sn = Math.sin(ph);
    re[o] = ar * c - ai * sn; im[o] = ar * sn + ai * c;
  }
  const F = { N, re, im, ax, ay, n, lam0 };
  const s = Math.sqrt((power === undefined ? 1 : power) / popStats2(F).power);
  for (let i = 0; i < N * N; i++) { re[i] *= s; im[i] *= s; }
  return F;
}

/* One segment of free space: whole fields for the next surface, and fast in-plane cuts
   for the bench. A cut needs only the y = 0 row, so the y step collapses to one weighted
   sum over each column and then only a single line goes through the x step. */
export function popLeg2(F0) {
  const N = F0.N, lam = F0.lam0 / F0.n, k = 2 * Math.PI * F0.n / F0.lam0;
  let Wy = null;
  const yWaist = () => Wy || (Wy = field2Axis(F0, 'y', -F0.ay.z));
  const rowAS = (st, dist) => {
    const hr = new Float64Array(N), hi = new Float64Array(N), df = 1 / (N * st.d);
    for (let m = 0; m < N; m++) { const fm = (m - N / 2) * df, ph = Math.PI * lam * dist * fm * fm; hr[m] = Math.cos(ph) / N; hi[m] = Math.sin(ph) / N; }
    cdft(hr, hi, -1);
    return [hr, hi];
  };
  const rowWTS = (st, z2) => {
    const hr = new Float64Array(N), hi = new Float64Array(N), [p0, a0] = fresnelPre(lam, z2);
    for (let n = 0; n < N; n++) { const y = (n - N / 2) * st.d, ph = p0 - k * y * y / (2 * z2); hr[n] = a0 * st.d * Math.cos(ph); hi[n] = a0 * st.d * Math.sin(ph); }
    return [hr, hi];
  };
  return {
    field: F0,
    at: t => field2Propagate(F0, t),
    stats: t => popStats2(field2Propagate(F0, t)),
    cut(t) {
      const c = this.cutC(t), I = new Float64Array(N);
      for (let i = 0; i < N; i++) I[i] = c.re[i] ** 2 + c.im[i] ** 2 + (c.re2 ? c.re2[i] ** 2 + c.im2[i] ** 2 : 0);
      return { x: c.x, I, sym: false, w: c.w, half: c.half };
    },
    cutC(t) {
      const z1 = F0.ay.z, z2 = z1 + t;
      let base = F0, h;
      if (popInside(z1, F0.ay.zR) && popInside(z2, F0.ay.zR)) h = rowAS(F0.ay, t);
      else { base = yWaist(); h = popInside(z2, F0.ay.zR) ? rowAS(base.ay, z2) : rowWTS(base.ay, z2); }
      const line = (RE, IM) => {
        const gr = new Float64Array(N), gi = new Float64Array(N);
        for (let j = 0; j < N; j++) {
          const a = h[0][j], b = h[1][j];
          if (a === 0 && b === 0) continue;
          const row = j * N;
          for (let i = 0; i < N; i++) {
            const ur = RE[row + i], ui = IM[row + i];
            gr[i] += a * ur - b * ui; gi[i] += a * ui + b * ur;
          }
        }
        const st = axisRoute(gr, gi, F0.ax, t, lam, k);
        // the phase this far along that the full 2D step would add: e^{-ikt}
        const ph = -k * t, c0 = Math.cos(ph), s0 = Math.sin(ph);
        for (let i = 0; i < N; i++) { const a = gr[i] * c0 - gi[i] * s0; gi[i] = gr[i] * s0 + gi[i] * c0; gr[i] = a; }
        return [gr, gi, st];
      };
      const [gr, gi, st] = line(base.re, base.im);
      const x = new Float64Array(N);
      for (let i = 0; i < N; i++) x[i] = (i - N / 2) * st.d;
      const out = { x, re: gr, im: gi, sym: false, b: popInside(st.z, st.zR) ? 0 : -k / (2 * st.z),
        w: popW(st.z, st.zR, lam), half: N / 2 * st.d, k };
      if (base.re2) { const [p2r, p2i] = line(base.re2, base.im2); out.re2 = p2r; out.im2 = p2i; }
      return out;
    },
  };
}

/* Catmull-Rom in both directions; zero off the grid */
export function interp2(F, x, y, RE, IM) {
  interp2s(F, x, y, RE, IM);
  return [I2R, I2I];
}
/* The same, leaving its result in I2R, I2I rather than a new array: the 2D surface step calls
   it for every sample (several times over where it follows the light's direction), and the
   small arrays were a good part of its time */
let I2R = 0, I2I = 0;
function interp2s(F, x, y, RE, IM) {
  RE = RE || F.re; IM = IM || F.im;
  const N = F.N, fx = x / F.ax.d + N / 2, fy = y / F.ay.d + N / 2;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  if (ix < 1 || iy < 1 || ix > N - 3 || iy > N - 3) { I2R = 0; I2I = 0; return; }
  const tx = fx - ix, ty = fy - iy;
  const x0 = ((-tx + 2) * tx - 1) * tx / 2, x1 = (((3 * tx - 5) * tx) * tx + 2) / 2, x2 = ((-3 * tx + 4) * tx + 1) * tx / 2, x3 = ((tx - 1) * tx * tx) / 2;
  const y0 = ((-ty + 2) * ty - 1) * ty / 2, y1 = (((3 * ty - 5) * ty) * ty + 2) / 2, y2 = ((-3 * ty + 4) * ty + 1) * ty / 2, y3 = ((ty - 1) * ty * ty) / 2;
  let r = 0, i = 0, o = (iy - 1) * N + ix - 1;
  for (let b = 0; b < 4; b++, o += N) {
    let rr = 0, ri = 0;
    rr += x0 * RE[o]; ri += x0 * IM[o];
    rr += x1 * RE[o + 1]; ri += x1 * IM[o + 1];
    rr += x2 * RE[o + 2]; ri += x2 * IM[o + 2];
    rr += x3 * RE[o + 3]; ri += x3 * IM[o + 3];
    const wb = b === 0 ? y0 : b === 1 ? y1 : b === 2 ? y2 : y3;
    r += wb * rr; i += wb * ri;
  }
  I2R = r; I2I = i;
}

/* Through one surface. The pilot in each plane goes through the ABCD the traced
   quadratic implies (in the bench plane this is the tracer's own; out of it, it is
   the only way to know); the traced phase less that quadratic is the aberration,
   sampled on the new grid. */
export function popSurface2(F, ev, gain, paraxial, tNext, pol) {
  const N = F.N, lam0 = F.lam0, G = Math.sqrt(Math.PI * N);
  // the incoming field's statistics, wanted several times over: it is only read here
  let statsF = null;
  const statsIn = () => statsF || (statsF = popStats2(F));
  const n1 = F.n, n2 = ev.n2, k0 = 2 * Math.PI / lam0, k1 = k0 * n1, k2 = k0 * n2;
  const lam1 = lam0 / n1, lam2 = lam0 / n2;
  let qx = [F.ax.z, F.ax.zR], qy = [F.ay.z, F.ay.zR];
  const inv = q => q[0] / (q[0] * q[0] + q[1] * q[1]);
  let wix = popW(qx[0], qx[1], lam1), wiy = popW(qy[0], qy[1], lam1);
  let tr = ev.surf ? popScreen(ev, inv(qx), inv(qy), lam0) : null;
  // A surface that turns the image a quarter (a periscope that turns the beam): the beam's
  // across goes up and its up across. The field is turned with it first, its grid transposed and
  // its pilots swapped, so that what is left maps across to across and up to up
  let swapped = false;
  if (tr && (ev.din3 || ev.dout3 || (ev.surf && ev.surf.tilt))) {
    const h0 = 1e-3 * Math.min(wix, wiy, Math.max(popClear(ev), 1e-6)), px = tr(h0, 0), mx = tr(-h0, 0), py = tr(0, h0), my = tr(0, -h0);
    if (px[4] && mx[4] && py[4] && my[4]) {
      const a = Math.abs(px[1] - mx[1]) + Math.abs(py[2] - my[2]), b = Math.abs(py[1] - my[1]) + Math.abs(px[2] - mx[2]);
      if (b > a) {
        const T = A => { if (!A) return A; const o = new Float64Array(N * N); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) o[i * N + j] = A[j * N + i]; return o; };
        F = Object.assign(Object.create(Object.getPrototypeOf(F)), F, { re: T(F.re), im: T(F.im), re2: T(F.re2), im2: T(F.im2), ax: F.ay, ay: F.ax });
        [qx, qy] = [qy, qx]; [wix, wiy] = [wiy, wix];
        const t0 = tr; tr = (x, y) => t0(y, x); swapped = true;
      }
    }
  }
  const edgeFn = ev.surf ? (ev.surf.maskMargin || ((u, v) => ev.surf.semi - Math.hypot(u, v))) : null;
  const maskFn = ev.surf && ev.surf.maskFn;
  // the local quadratic and magnification, from four rays close in
  const hh = 1e-3 * Math.min(wix, wiy, Math.max(popClear(ev), 1e-6));
  let bx = 0, by = 0, Ax = 1, Ay = 1, Ai = null;
  if (tr) {
    const px = tr(hh, 0), mx = tr(-hh, 0), py = tr(0, hh), my = tr(0, -hh);
    Ax = (px[1] - mx[1]) / (2 * hh); Ay = (py[2] - my[2]) / (2 * hh);
    // what is left of a turn of the image (a Dove prism rolled): where each output sample comes
    // from, by the whole 2x2 map, not each axis on its own
    const Axy = (py[1] - my[1]) / (2 * hh), Ayx = (px[2] - mx[2]) / (2 * hh);
    if (Math.abs(Axy) + Math.abs(Ayx) > 1e-9 * (Math.abs(Ax) + Math.abs(Ay))) { const det = Ax * Ay - Axy * Ayx; Ai = [Ay / det, -Axy / det, -Ayx / det, Ax / det]; }
    if (ev.surf && ev.mode !== 'P' && !(ev.surf.odd && ev.surf.odd[0])) {
      // a jump in path across the tiny step is an edge in the phase (a mask's step, a
      // vortex's cut), not a curvature: only a smooth path gives the pilot a lens. Nor is
      // an axicon's tip: its cone goes in whole as the aberration.
      const jump = u => Math.abs(u) > 0.05 * lam0;
      if (!jump(px[0] + mx[0]) && !jump(px[0] - mx[0])) bx = -k0 * (px[0] + mx[0]) / (2 * hh * hh);
      if (!jump(py[0] + my[0]) && !jump(py[0] - my[0])) by = -k0 * (py[0] + my[0]) / (2 * hh * hh);
    }
  }
  const aAx = Math.abs(Ax) || 1, aAy = Math.abs(Ay) || 1;
  // a thin element: q' = A q / (C q + D), D = (n1/n2)/A, C from the phase -k2 C A x^2 / 2
  const through = (q, A, b) => {
    const C = -2 * b / (k2 * A), D = n1 / (n2 * A);
    const dr = C * q[0] + D, di = C * q[1], nr = A * q[0], ni = A * q[1], den = dr * dr + di * di;
    return [(nr * dr + ni * di) / den, (ni * dr - nr * di) / den];
  };
  let qxo = through(qx, aAx, bx), qyo = through(qy, aAy, by);
  const iRxi = popInvR(qx), iRyi = popInvR(qy), iRxo = popInvR(qxo), iRyo = popInvR(qyo);
  const traced = ev.surf && ev.mode !== 'P' && !paraxial;
  // a grid for what comes out: the pilot's width, or less if the aperture will cut it
  const a = popClear(ev);
  let wxo = Math.max(1e-9, Math.min(popW(qxo[0], qxo[1], lam2), aAx * a));
  const wyo = Math.max(1e-9, Math.min(popW(qyo[0], qyo[1], lam2), aAy * a));
  // An opening off to one side must still fit on the grid, which stays on the reference ray;
  // so must light that arrives off to one side, where it lands after this surface
  if (ev.mask && ev.mask.shape !== 'knife' && ev.mask.shape !== 'disc')
    wxo = Math.max(wxo, 2.4 * (Math.abs(ev.ly - ev.mask.o) + (ev.mask.ext || ev.mask.a)) * ev.cth * aAx / Math.sqrt(Math.PI * N));
  let wyo2 = wyo;
  {
    const Sin = pol && pol.fixed ? { power: 0 } : statsIn(), G2 = Math.sqrt(Math.PI * N);   // a replayed grid needs none of this
    if (Sin.power > 0) {
      wxo = Math.max(wxo, 2.4 * (Math.abs(Sin.cx) * aAx + 1.5 * Sin.wx * aAx) / G2);
      wyo2 = Math.max(wyo, 2.4 * (Math.abs(Sin.cy) * aAy + 1.5 * Sin.wy * aAy) / G2);
    }
  }
  // the aberration at an input point: traced phase plus the incoming wave, less the
  // outgoing reference at the ray's true landing point; smooth wherever it is sampled
  const abAt = (x, y, r) => -k0 * r[0] - bx * x * x - by * y * y
    + popPhiExact(k1, iRxi, iRyi, x, y) - popPhiPar(k1, iRxi, iRyi, x, y)
    - popPhiExact(k2, iRxo, iRyo, r[1], r[2]) + popPhiPar(k2, iRxo, iRyo, Ax * x, Ay * y);
  // A grid fine enough for the aberration's steepest slope g needs L < N pi / 2g; the
  // same limit makes the far-field grid wide enough for the blur it causes
  const slope = (w, alongX) => {
    if (!traced) return 0;
    let g = 0, prev = null;
    for (let i = 0; i <= 40; i++) {
      const u = (i / 20 - 1) * 2.5 * w, r = alongX ? tr(u, 0) : tr(0, u);
      if (!r[4] || r[3] < 0) { prev = null; continue; }
      let v = alongX ? abAt(u, 0, r) : abAt(0, u, r);
      // a mask's whole-wave resets are no slope (its delay, d waves, is a phase of -2 pi d)
      if (prev !== null && maskFn) v = prev[1] + (v - prev[1]) + 2 * Math.PI * maskResets(maskFn, prev[2], prev[3], r[6], r[7], lam0);
      if (prev !== null) g = Math.max(g, Math.abs(v - prev[1]) / Math.abs(u - prev[0]));
      prev = [u, v, r[6], r[7]];
    }
    return g;
  };
  // what the surface adds, and what the light already carries (a field leaving an aberrating
  // lens arrives at the next surface with its phase already steep, whatever that surface adds)
  const replay = !!(pol && pol.fixed);
  const gx = replay ? 0 : (slope(wix, true) + field2Slope(F, 'x')) / aAx, gy = replay ? 0 : (slope(wiy, false) + field2Slope(F, 'y')) / aAy;
  let steep = 0;
  const span = (w, g) => {
    let L = G * w;
    if (g > 0) L = Math.min(L, N * Math.PI / (2 * g));
    if (L < 5 * w) { steep = 1; L = 5 * w; }
    return L;
  };
  const ax = { d: span(wxo, gx) / N, z: qxo[0], zR: qxo[1] }, ay = { d: span(wyo2, gy) / N, z: qyo[0], zR: qyo[1] };
  // An edge that cuts the beam sends out fringes: the first is sqrt(lam t) wide at the next
  // surface, t on, and the later ones finer. The guard band that keeps a clean beam well
  // sampled near and far leaves too few samples inside the beam for them, so here the
  // sampling is chosen for that distance instead: eight across the first fringe, as far as a
  // grid that still holds the beam and the light the edge sends out over t allows.
  if (!replay && tNext > 0 && isFinite(tNext)) {
    const Sin = statsIn(), lam2 = lam0 / n2;
    let ex = false, ey = false;
    if (ev.mask) {
      const M = ev.mask, off = Math.abs(ev.ly - M.o);
      const near = M.shape === 'knife' ? off < 3 * wix : M.shape === 'disc' ? off - M.a < 3 * wix : true;
      if (near) { ex = true; ey = M.shape !== 'knife' && (!M.slits || M.h > 0); }
    } else if (maskFn) {
      ex = maskJumps(maskFn, ev.ly, 0, 3 * wix / ev.cth, 0, lam0);
      ey = maskJumps(maskFn, ev.ly, 0, 0, 3 * wiy, lam0);
    } else if (isFinite(a) && a < 2.5 * Math.min(wix, wiy)) ex = ey = true;     // a rim that clips
    const fine = (st, w, c, has) => {
      if (!has) return;
      const C = Math.abs(c) + 3.5 * w;
      // N d / 2 >= C + lam t / (4 d): the smallest d that still holds it all
      const dHold = (C + Math.sqrt(C * C + N * lam2 * tNext / 2)) / N;
      const d = Math.max(Math.sqrt(lam2 * tNext) / 8, dHold);
      if (d < st.d) st.d = d;
    };
    fine(ax, Sin.wx * aAx, Sin.cx * aAx, ex);
    fine(ay, Sin.wy * aAy, Sin.cy * aAy, ey);
  }
  // A mask's smallest feature must be resolved: a disc, which leaves the beam its full size,
  // pulls the sampling in to a quarter of its diameter, as far as a grid that still spans the
  // beam allows. Whatever is still finer than three samples is flagged, not quietly smeared.
  let coarse = 0;
  if (!replay && ev.mask && ev.mask.shape !== 'knife') {
    const M = ev.mask, feat = 2 * M.a;
    if (M.shape === 'disc') {
      const Sin = statsIn();
      const spanX = 6 * Sin.wx * aAx + 2 * Math.abs(Sin.cx) * aAx, spanY = 6 * Sin.wy * aAy + 2 * Math.abs(Sin.cy) * aAy;
      ax.d = Math.min(ax.d, Math.max(feat * ev.cth * aAx / 4, spanX / N));
      ay.d = Math.min(ay.d, Math.max(feat * aAy / 4, spanY / N));
    }
    if (feat * ev.cth * aAx < 3 * ax.d || (!M.slits || M.h > 0) && feat * aAy < 3 * ay.d) coarse = 1;
    // behind a disc, Poisson's spot at the next surface, 0.38 lambda t / a in radius: narrower
    // than three samples and its height is wrong (the round field carries the disc's light on
    // a grid of its own and gets it right; this one does not)
    if (M.shape === 'disc' && tNext > 0 && isFinite(tNext) && 0.38 * (F.lam0 / ev.n2) * tNext / (M.a * Math.min(aAx, aAy)) < 3 * Math.max(ax.d, ay.d)) coarse = 1;
  }
  const sphXi = !popInside(qx[0], qx[1]), sphYi = !popInside(qy[0], qy[1]);
  const sphXo = !popInside(qxo[0], qxo[1]), sphYo = !popInside(qyo[0], qyo[1]);
  const cx = bx + (sphXi ? -k1 / (2 * qx[0]) : 0) - (sphXo ? -k2 * Ax * Ax / (2 * qxo[0]) : 0);
  const cy = by + (sphYi ? -k1 / (2 * qy[0]) : 0) - (sphYo ? -k2 * Ay * Ay / (2 * qyo[0]) : 0);
  // a round trip of a cavity replays the first pass's grid, so every pass lands on one grid
  // and the round trip stays one linear operator
  const fixed = pol && pol.fixed;
  if (fixed) { ax.d = fixed.axd; ay.d = fixed.ayd; }
  const re = new Float64Array(N * N), im = new Float64Array(N * N);
  const vec = !!F.re2, re2 = vec ? new Float64Array(N * N) : null, im2 = vec ? new Float64Array(N * N) : null;
  const pix = Math.max(ax.d / aAx, ay.d / aAy);
  const g = Math.sqrt(1 / (aAx * aAy));
  // Polarisation, sample by sample: the beam's frame either side (p along its in-plane
  // normal, with the parity sign), the surface's coefficients, or an element's Jones matrix
  let coef = null, jonesM = null, eIn = null, eOut = null;
  const pmS = new Float64Array(8);
  if (vec) {
    const dI = ev.dIn, dO = ev.dOut || ev.dIn, si = pol && pol.parIn ? -1 : 1, so = pol && pol.parOut ? -1 : 1;
    eIn = { sg: si, v: [-dI[1] * si, dI[0] * si, 0] }; eOut = { sg: so, v: [-dO[1] * so, dO[0] * so, 0] };
    // out of the plane: the beam's own axes either side (see beamAxes), p across it, s up it
    const ax3 = (d, sg) => { const l = Math.hypot(d[0], d[1], d[2]), u = [d[0] / l, d[1] / l, d[2] / l], [x, y] = beamAxes(u); return { sg, v: x.map(c => c * sg), u: y, d: u }; };
    if (ev.din3 && ev.din3[2]) eIn = ax3(ev.din3, si);
    if (ev.dout3 && ev.dout3[2]) eOut = ax3(ev.dout3, so);
    const el = ev.surf && ev.surf.el;
    if (ev.mode === 'P' && el && (JONES_TYPES.has(el.type) || ev.jm)) {
      const Jm = ev.jm || jonesOf(el), cj = v => [v[0], -v[1]];
      jonesM = Float64Array.from([cj(Jm[1][1]), cj(Jm[1][0]), cj(Jm[0][1]), cj(Jm[0][0])].flat());   // [ss, sp, ps, pp], each re, im
    } else coef = polCoeff(ev, lam0 * 1e6);
  }
  // the beam's axes in 3D where it rises (see beamAxes), for each sample's own way in
  const G3 = ev.din3 && (ev.din3[2] || swapped) ? (() => { const d = ev.din3, l = Math.hypot(d[0], d[1], d[2]), c = [d[0] / l, d[1] / l, d[2] / l], [ex, ey] = beamAxes(c); return { c, ex, ey }; })() : null;
  // phase that turns too fast only matters where there is light
  let peakIn = 0;
  if (!(pol && pol.fixed && pol.fixed.cache)) for (let i = 0; i < N * N; i++) peakIn = Math.max(peakIn, field2I(F, i));
  // an edge that cuts a sample passes the sample's share of the area; with its amplitude at
  // that share its power would fall short, so the whole is rescaled to the area's power
  let pArea = 0, pAmp = 0, pU = 0, pF = 0, pFe = 0;
  // A cavity's later round trips reuse what the first fixed pass worked out for each sample
  // (where it reads the incoming field, its phase and amplitude, its polarisation matrix),
  // so they cost an interpolation and a multiply, not a ray trace, per sample
  const cache = fixed ? fixed.cache : null, record = fixed && !cache ? { ok: new Uint8Array(N * N), c: new Float64Array(2 * N * N), pm: vec ? new Float64Array(8 * N * N) : null, has: new Uint8Array(N * N) } : null;
  if (cache) {
    for (let j = 0; j < N; j++) {
      let y = (j - N / 2) * ay.d / Ay;
      for (let i = 0; i < N; i++) {
        const o = j * N + i; if (!cache.ok[o]) continue;
        let x = (i - N / 2) * ax.d / Ax;
        if (Ai) { const xo = (i - N / 2) * ax.d, yo = (j - N / 2) * ay.d; x = Ai[0] * xo + Ai[1] * yo; y = Ai[2] * xo + Ai[3] * yo; }
        interp2s(F, x, y);
        const ur = I2R, ui = I2I, c = cache.c[2 * o], s = cache.c[2 * o + 1];
        const sR = ur * c - ui * s, sI = ur * s + ui * c;
        if (!vec) { re[o] = sR; im[o] = sI; continue; }
        interp2s(F, x, y, F.re2, F.im2);
        const vr = I2R, vi = I2I, pR = vr * c - vi * s, pI = vr * s + vi * c;
        if (!cache.has[o]) { re[o] = sR; im[o] = sI; re2[o] = pR; im2[o] = pI; continue; }
        const q = cache.pm, b = 8 * o;
        re[o] = q[b] * sR - q[b + 1] * sI + q[b + 2] * pR - q[b + 3] * pI; im[o] = q[b] * sI + q[b + 1] * sR + q[b + 2] * pI + q[b + 3] * pR;
        re2[o] = q[b + 4] * sR - q[b + 5] * sI + q[b + 6] * pR - q[b + 7] * pI; im2[o] = q[b + 4] * sI + q[b + 5] * sR + q[b + 6] * pI + q[b + 7] * pR;
      }
    }
  } else
  for (let j = 0; j < N; j++) {
    const y0j = (j - N / 2) * ay.d / Ay;
    let prev = null, prevEdge = false, prevUV = null, prevBig = false;
    for (let i = 0; i < N; i++) {
      let x = (i - N / 2) * ax.d / Ax, y = y0j;
      if (Ai) { const xo = (i - N / 2) * ax.d, yo = (j - N / 2) * ay.d; x = Ai[0] * xo + Ai[1] * yo; y = Ai[2] * xo + Ai[3] * yo; }
      let edgeHere = false, curUV = null;
      interp2s(F, x, y);
      const ur = I2R, ui = I2I;
      let vr = 0, vi = 0;
      if (vec) { interp2s(F, x, y, F.re2, F.im2); vr = I2R; vi = I2I; }
      if (!record && ur === 0 && ui === 0 && vr === 0 && vi === 0) { prev = null; continue; }
      pU += ur * ur + ui * ui + vr * vr + vi * vi;
      let m = 1, ab = 0, fr = 1, fi = 0, PM = jonesM;
      if (tr) {
        const r = tr(x, y);
        if (vec && coef && r[4]) {
          // The light's own direction here, from the slope of its phase (the reference and what
          // the field adds to it), rather than the pilot's normal along which the trace was
          // launched: they part where the beam is aberrated, and polarisation turns with the ray.
          let d0 = r[8], d1 = r[9], d2 = r[10], e0 = r[14], e1 = r[15], e2 = r[16];
          const U0 = ur * ur + ui * ui + vr * vr + vi * vi;
          if (U0 > 1e-12 * peakIn) {
            // Im(conj(u) du) / |u|^2 over both components, du from the samples either side
            const hx = 0.5 * ax.d / aAx, hy = 0.5 * ay.d / aAy;
            const slope = (dx0, dy0, hh) => {
              interp2s(F, x + dx0, y + dy0); const a0 = I2R, a1 = I2I;
              interp2s(F, x + dx0, y + dy0, F.re2, F.im2); const a2 = I2R, a3 = I2I;
              interp2s(F, x - dx0, y - dy0); const b0 = I2R, b1 = I2I;
              interp2s(F, x - dx0, y - dy0, F.re2, F.im2); const b2 = I2R, b3 = I2I;
              const t2 = 2 * hh, q0 = (a0 - b0) / t2, q1 = (a1 - b1) / t2, q2 = (a2 - b2) / t2, q3 = (a3 - b3) / t2;
              return (ur * q1 - ui * q0 + vr * q3 - vi * q2) / U0;
            };
            const gx = slope(hx, 0, hx) + (sphXi ? -k1 * x / qx[0] : 0), gy = slope(0, hy, hy) + (sphYi ? -k1 * y / qy[0] : 0);
            const tx = -gx / k1, ty = -gy / k1;
            if (G3) {
              // the grid's axes in 3D: the beam's own (turned a quarter if the field was)
              const [gX, gY] = swapped ? [G3.ey, G3.ex] : [G3.ex, G3.ey];
              d0 = G3.c[0] + tx * gX[0] + ty * gY[0]; d1 = G3.c[1] + tx * gX[1] + ty * gY[1]; d2 = G3.c[2] + tx * gX[2] + ty * gY[2];
            } else { const c00 = ev.dIn[0], c01 = ev.dIn[1], ex00 = -ev.dIn[1], ex01 = ev.dIn[0]; d0 = c00 + tx * ex00; d1 = c01 + tx * ex01; d2 = ty; }
            const L = Math.hypot(d0, d1, d2); d0 = d0 / L; d1 = d1 / L; d2 = d2 / L;
            let N0 = r[11], N1 = r[12], N2 = r[13];
            let c = -(d0 * N0 + d1 * N1 + d2 * N2);
            if (c < 0) { N0 = -N0; N1 = -N1; N2 = -N2; c = -c; }
            if (ev.surf && ev.surf.kind === 'grating') {
              // the grating equation along the surface in the bench plane, as the tracer does
              const f = ev.surf.f, tY00 = -f.s, tY01 = f.c, nn0 = f.c, nn1 = f.s;
              const dn = d0 * nn0 + d1 * nn1;
              const tY = d0 * tY00 + d1 * tY01 + (ev.order || 0) * lam0 * linesPerMm(ev.surf.el) / n1, tZ = d2;
              const dN = (ev.mode === 'R' ? -1 : 1) * (dn < 0 ? -1 : 1) * Math.sqrt(Math.max(0, 1 - tY * tY - tZ * tZ));
              e0 = dN * nn0 + tY * tY00; e1 = dN * nn1 + tY * tY01; e2 = tZ;
            } else if (ev.mode === 'R') { e0 = d0 + 2 * c * N0; e1 = d1 + 2 * c * N1; e2 = d2 + 2 * c * N2; }
            else if (ev.mode === 'T' && ev.surf && ev.surf.kind === 'refract' && n1 !== n2) {
              const eta = n1 / n2, kk = 1 - eta * eta * (1 - c * c), m2 = eta * c - Math.sqrt(Math.max(0, kk));
              e0 = eta * d0 + m2 * N0; e1 = eta * d1 + m2 * N1; e2 = eta * d2 + m2 * N2;
            } else { e0 = d0; e1 = d1; e2 = d2; }
          }
          if (ev.surf && ev.surf.kind === 'grating') {
            // the grooves run out of the plane and this grating treats s and p alike, so each
            // keeps its own axis; a ray's plane of incidence is no guide once the grating has
            // turned it in the bench plane
            const cc = coef(1);
            pmS[0] = cc[0]; pmS[1] = -cc[1]; pmS[2] = 0; pmS[3] = 0; pmS[4] = 0; pmS[5] = 0; pmS[6] = cc[2]; pmS[7] = -cc[3];
          } else polMatrixTo(pmS, coef, d0, d1, d2, r[11], r[12], r[13], e0, e1, e2, eIn, eOut, ...(eIn.d || [ev.dIn[0], ev.dIn[1], 0]));
          PM = pmS;
        }
        if (!r[4]) { prev = null; continue; }
        // A sample the edge crosses passes the share of it on the open side. For a straight
        // edge that share ramps across the pixel's own size in the direction the edge cuts,
        // |dm/du| du + |dm/dv| dv, not across the coarser of the two spacings.
        let ramp = pix;
        if (edgeFn && Math.abs(r[3]) < 2 * pix) {
          const e = 1e-4, pu = ax.d / (aAx * ev.cth), pv = ay.d / aAy;
          const gu = (edgeFn(r[6] + e, r[7]) - edgeFn(r[6] - e, r[7])) / (2 * e), gv = (edgeFn(r[6], r[7] + e) - edgeFn(r[6], r[7] - e)) / (2 * e);
          ramp = Math.max(1e-12, Math.abs(gu) * pu + Math.abs(gv) * pv);
        }
        const cov = Math.min(1, Math.max(0, 0.5 + r[3] / ramp));
        // the transmission here: a mask's amplitude (its delay is already in the traced
        // path), or, where its formula jumps inside the sample, the mean over the sample
        fr = r[5]; fi = 0;
        let T2 = r[5] * r[5];
        if (maskFn) {
          const fp = maskFootprint(maskFn, r[6], r[7], ax.d / (aAx * ev.cth), ay.d / aAy, lam0, false);
          if (fp) {
            const ph0 = 2 * Math.PI * maskFn(r[6], r[7], lam0)[1], c0 = Math.cos(ph0), s0 = Math.sin(ph0);
            fr = fp[0] * c0 - fp[1] * s0; fi = fp[0] * s0 + fp[1] * c0; T2 = fp[2];
            if (!traced) { fr = Math.hypot(fr, fi); fi = 0; }
          }
          const U0 = (ur * ur + ui * ui + vr * vr + vi * vi) * cov * T2;
          pF += U0; if (fp) pFe += U0;
          edgeHere = !!fp;
        }
        m = cov;
        if (m === 0 || (fr === 0 && fi === 0)) { prev = null; continue; }
        const U = ur * ur + ui * ui + vr * vr + vi * vi;
        pArea += U * T2 * cov; pAmp += U * (fr * fr + fi * fi) * cov * cov;
        if (traced) { ab = abAt(x, y, r); curUV = [r[6], r[7]]; }
      }
      // how fast the sampled phase turns from one sample to the next (a mask's step, which
      // its footprint average already handles, is not a slope; nor is a whole-wave reset, nor
      // one lone jump, which is a vortex's core: a slope the grid cannot follow runs on)
      const big = prev !== null && !edgeHere && !prevEdge && Math.abs(ab - prev) > 2 && !(maskFn && prevUV && curUV && Math.abs(ab - prev + 2 * Math.PI * maskResets(maskFn, prevUV[0], prevUV[1], curUV[0], curUV[1], lam0)) <= 2) && ur * ur + ui * ui + vr * vr + vi * vi > 1e-6 * peakIn && m > 0.01;
      if (big && prevBig) steep = 1;
      prevBig = big;
      prev = ab; prevEdge = edgeHere; prevUV = curUV;
      const ph = ab + cx * x * x + cy * y * y, amp = m * g, o = j * N + i;
      const c0 = Math.cos(ph) * amp, s0 = Math.sin(ph) * amp;
      const c = c0 * fr - s0 * fi, s = c0 * fi + s0 * fr;
      if (record) {
        record.ok[o] = 1; record.c[2 * o] = c; record.c[2 * o + 1] = s;
        if (vec && PM) { record.has[o] = 1; record.pm.set(PM, 8 * o); }
      }
      const sR = ur * c - ui * s, sI = ur * s + ui * c;
      if (!vec) { re[o] = sR; im[o] = sI; continue; }
      const pR = vr * c - vi * s, pI = vr * s + vi * c;
      if (!PM) { re[o] = sR; im[o] = sI; re2[o] = pR; im2[o] = pI; continue; }
      const q = PM;                                    // [ss, sp, ps, pp], each re, im
      re[o] = q[0] * sR - q[1] * sI + q[2] * pR - q[3] * pI; im[o] = q[0] * sI + q[1] * sR + q[2] * pI + q[3] * pR;
      re2[o] = q[4] * sR - q[5] * sI + q[6] * pR - q[7] * pI; im2[o] = q[4] * sI + q[5] * sR + q[6] * pI + q[7] * pR;
    }
  }
  const out = { N, re, im, ax, ay, n: n2, lam0 };
  if (vec) { out.re2 = re2; out.im2 = im2; }
  const scaleAll = f => { for (const [kr, ki] of fieldComps(out)) { const R = out[kr], I = out[ki]; for (let i = 0; i < N * N; i++) { R[i] *= f; I[i] *= f; } } };
  const areaScale = fixed ? fixed.areaScale : (pAmp > 0 && pArea > pAmp ? Math.sqrt(pArea / pAmp) : 1);
  if (areaScale !== 1) scaleAll(areaScale);
  // cut or not by what the edges and masks let through, not by how much a partial reflector
  // sends this way: the area-weighted power of the light that got past, against what came in
  const pIn = statsIn().power, S = popStats2(out);
  const clipped = fixed ? fixed.clipped : pArea * g * g * ax.d * ay.d < pIn * (1 - 1e-4);
  let nxD = null, nyD = null;
  // A surface that cuts nothing loses nothing to its grid: what resampling the input onto
  // the new grid gains or loses is interpolation, and comes back out (see the round step)
  const isPol = ev.surf && ev.surf.el && (ev.surf.el.type === 'polariser' || ev.surf.el.type === 'isolator');
  const resScale = fixed ? fixed.resScale || 1 : (!clipped && ev.mode !== 'M' && !isPol && pU > 0 ? Math.sqrt(pIn / (pU * g * g * ax.d * ay.d)) : 1);
  if (resScale !== 1) scaleAll(resScale);
  if (clipped) {
    // refit each pilot to what got through: curvature kept, width from the second moment
    const refit = (q, w) => {
      const den = q[0] * q[0] + q[1] * q[1], ir = q[0] / den, ii = -lam2 / (Math.PI * w * w), d2 = ir * ir + ii * ii;
      return [ir / d2, -ii / d2];
    };
    // Widths about the light's own centre: the pilot decides how fast the light spreads,
    // and so when to switch to the far-field step. (Measured about the axis instead, a narrow
    // slit off to one side looks like a wide slow beam, the near-field grid never grows, and
    // its light wraps round the grid's edges.) Reaching light off to one side is the grid's
    // job, below and at the next surface, not the pilot's.
    // The pilot must also spread as fast as the light does. A width alone cannot tell a
    // clean beam from light with fine structure inside it (two narrow slits far apart, a
    // comb): their width is set by the whole pattern, their spread by its finest part. So
    // each axis also gets the light's angular width, from its spectrum with the pilot's own
    // curvature taken off, and the pilot becomes an embedded Gaussian with that M^2: its
    // Rayleigh range is divided by M^2, and the switch to the far-field step comes as soon
    // as the light really spreads.
    const M2 = axis => {
      const q = axis === 'x' ? qxo : qyo, st = axis === 'x' ? ax : ay, sph = !popInside(q[0], q[1]);
      const b = 0.5 * k2 * (popInvR(q) - (sph ? 1 / q[0] : 0));
      const lr = new Float64Array(N), li = new Float64Array(N), P = new Float64Array(N);
      for (const [kr, ki] of fieldComps(out)) {
        const R = out[kr], I = out[ki];
        for (let j = 0; j < N; j++) {
          for (let i = 0; i < N; i++) {
            const o = axis === 'x' ? j * N + i : i * N + j, x = (i - N / 2) * st.d, ph = b * x * x, c = Math.cos(ph), s = Math.sin(ph);
            lr[i] = R[o] * c - I[o] * s; li[i] = R[o] * s + I[o] * c;
          }
          cdft(lr, li, -1);
          for (let m = 0; m < N; m++) P[m] += lr[m] * lr[m] + li[m] * li[m];
        }
      }
      let s0 = 0, s1 = 0, s2 = 0;
      for (let m = 0; m < N; m++) { const f = (m - N / 2) / (N * st.d); s0 += P[m]; s1 += P[m] * f; s2 += P[m] * f * f; }
      const sf = Math.sqrt(Math.max(0, s2 / s0 - (s1 / s0) ** 2)), sx = 0.5 * (axis === 'x' ? S.wx : S.wy);
      return Math.max(1, 4 * Math.PI * sx * sf);
    };
    const mx2 = fixed ? 1 : M2('x'), my2 = fixed ? 1 : M2('y');
    const refitM = (q, w, m2) => {
      const den = q[0] * q[0] + q[1] * q[1], ir = q[0] / den, ii = -m2 * lam2 / (Math.PI * w * w), d2 = ir * ir + ii * ii;
      return [ir / d2, -ii / d2];
    };
    const nx = fixed ? fixed.nx : refitM(qxo, S.wx, mx2), ny = fixed ? fixed.ny : refitM(qyo, S.wy, my2);
    nxD = nx; nyD = ny;
    // the residual is held against the old references; swap them for the new ones
    const ref = (q, x) => popInside(q[0], q[1]) ? 0 : -k2 * x * x / (2 * q[0]);
    for (const [kr, ki] of fieldComps(out)) {
      const R = out[kr], I = out[ki];
      for (let j = 0; j < N; j++) {
        const yy = (j - N / 2) * ay.d, py0 = ref(qyo, yy) - ref(ny, yy);
        for (let i = 0; i < N; i++) {
          const o = j * N + i;
          if (R[o] === 0 && I[o] === 0) continue;
          const xx = (i - N / 2) * ax.d;
          cmulPhase(R, I, o, ref(qxo, xx) - ref(nx, xx) + py0, 1);
        }
      }
    }
    qxo = nx; qyo = ny;
    ax.z = nx[0]; ax.zR = nx[1]; ay.z = ny[0]; ay.zR = ny[1];
  }
  const gs = Math.sqrt(gain === undefined ? 1 : gain);
  if (gs !== 1) scaleAll(gs);
  // The field's centre against the tracer's Jones vector for this branch: the same
  // coefficients give the same direction (polErr checks it), and what the tracer adds on top,
  // absorption in the glass since the last surface, comes in as a scale
  let polErr = 0;
  if (vec && pol && pol.Jin && pol.Jout) {
    const J = pol.Jin, cm = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
    let ps, pp;
    if (jonesM) {
      const Jm = ev.jm || jonesOf(ev.surf.el);
      pp = [cm(Jm[0][0], [J[2], J[3]])[0] + cm(Jm[0][1], [J[0], J[1]])[0], cm(Jm[0][0], [J[2], J[3]])[1] + cm(Jm[0][1], [J[0], J[1]])[1]];
      ps = [cm(Jm[1][0], [J[2], J[3]])[0] + cm(Jm[1][1], [J[0], J[1]])[0], cm(Jm[1][0], [J[2], J[3]])[1] + cm(Jm[1][1], [J[0], J[1]])[1]];
    } else if (coef) {
      const c = coef(ev.cth);
      ps = cm([c[0], c[1]], [J[0], J[1]]); pp = cm([c[2], c[3]], [J[2], J[3]]);
    } else { ps = [J[0], J[1]]; pp = [J[2], J[3]]; }
    const nP = Math.hypot(ps[0], ps[1], pp[0], pp[1]), Jo = pol.Jout, nO = Math.hypot(...Jo), nI = Math.hypot(...J);
    // only where the centre carries light: where both are nothing (p light at a polariser set
    // for s) their ratio is rounding, and the field's light is all off the centre anyway
    if (nP > 1e-6 * nI && nO > 1e-6 * nI) {
      scaleAll(nO / nP);
      polErr = Math.hypot(ps[0] / nP - Jo[0] / nO, ps[1] / nP - Jo[1] / nO, pp[0] / nP - Jo[2] / nO, pp[1] / nP - Jo[3] / nO);
    }
  }
  if (record) fixed.cache = record;
  if (!replay && pF > 0 && pFe > MASK_EDGE_SHARE * pF) coarse = 1;
  return { field: out, clipped, steep, coarse, polErr, decision: { axd: ax.d, ayd: ay.d, clipped, nx: nxD, ny: nyD, areaScale, resScale } };
}

