import { clamp } from '../core/constants.js';
import { popInside, popRadii, popStats, qdht } from './field.js';
import { polCoeff, polMatrix } from './polarisation.js';
import { popScreen } from './phase-screen.js';
import { cdft, interp2, popStats2 } from './field2d.js';
import { popJ, segW } from './beam-tree.js';

/* ---------- Vector focusing at a steep focus ----------
   Near a focus reached at a high numerical aperture the paraxial step fails twice over: its
   quadratic is not the sphere the light converges on, and it has no field along the axis.
   So there the field is summed directly, by the Rayleigh-Sommerfeld integral, from the
   field leaving the last surface (the pupil) to each point on the screen:
     E(P) = (i / lam) sum U(Q) e^{-ik(r - rho)} (z / r) (1 / r) dA,
   with Q a pupil point, r its distance to P, rho its distance to the focus, and U the full
   3D field there with the exact converging sphere taken off, so what is left is smooth and
   a modest grid samples it. The full vector at Q is rebuilt from the stored transverse
   field by the field's being square to Q's own ray towards the focus. This is the integral
   Richards and Wolf simplify, without their approximations, so aberrated and tilted cases
   come out as well. */
export const VF_NA = 0.3;          // above this, automatically
/* The pupil of one arrival: samples of U in the beam's frame (x across in the bench plane,
   y out of it, z along), or null if it does not converge to a focus ahead.
   Where the arrival leaves a traced surface, the pupil comes straight from the trace, as a
   Huygens PSF does: the light arriving at that surface is sampled, a ray is traced through
   each sample to the exit plane, the phase is the incoming one less the ray's optical path,
   the amplitude follows the ray tube's area (energy along each ray is kept), and the
   polarisation turns by that sample's own matrix. The stored field is held against a
   paraxial reference, which after a steep focusing surface differs from the true sphere by
   far more than any grid could follow; the trace has no such limit. Otherwise (after a
   window, a waveplate, in free space) the stored field is used. */
export function vfPupil(sg, R, opts) {
  // how far out the pupil reaches, in beam radii (a gently focused beam's axial profile feels
  // an edge even where its light is a thousandth), and samples across it
  const reach = (opts && opts.reach) || 2.4, Mp = (opts && opts.M) || 64;
  const F = sg.F0, two = !!F.ax, k = 2 * Math.PI * F.n / F.lam0, lamM = F.lam0 / F.n, lam0 = F.lam0;
  const zx = two ? F.ax.z : F.z, zy = two ? F.ay.z : F.z;
  const Rf = -0.5 * (zx + zy);                          // distance from the segment's start to its focus
  if (!(Rf > 0)) return null;
  const ev = sg.b.ev, par = R && R.segs.find(s2 => s2.i === sg.b.parent);
  const traced = ev && ev.surf && (ev.mode === 'T' || ev.mode === 'R' || ev.mode === 'M') && par;
  const out = { k, lamM, Rf, route: traced ? 'traced' : 'field' };
  const X = [], Y = [], U = [[], [], [], [], [], []], W = [];
  const g = sg.b.par ? -1 : 1;
  const push = (x, y, S, P, dir, w) => {
    // square to the light's own ray: E_z = -(E_x d_x + E_y d_y) / d_z
    const dz = dir[2] || 1, Zr = -(P[0] * dir[0] + S[0] * dir[1]) / dz, Zi = -(P[1] * dir[0] + S[1] * dir[1]) / dz;
    const rho = Math.sqrt(x * x + y * y + Rf * Rf), ph = -k * (rho - Rf), c = Math.cos(ph), sn = Math.sin(ph);
    const rot = (a, b) => [a * c - b * sn, a * sn + b * c];
    const v = [rot(P[0], P[1]), rot(S[0], S[1]), rot(Zr, Zi)];
    X.push(x); Y.push(y); W.push(w);
    for (let m = 0; m < 3; m++) { U[2 * m].push(v[m][0]); U[2 * m + 1].push(v[m][1]); }
  };
  if (traced) {
    const Fin = par.leg.at(par.b.len), twoIn = !!Fin.ax, n1 = Fin.n, k1 = 2 * Math.PI * n1 / lam0;
    const qx = twoIn ? [Fin.ax.z, Fin.ax.zR] : [Fin.z, Fin.zR], qy = twoIn ? [Fin.ay.z, Fin.ay.zR] : qx;
    const inv = q => q[0] / (q[0] * q[0] + q[1] * q[1]);
    const tr = popScreen(ev, inv(qx), inv(qy), lam0);
    const stI = twoIn ? popStats2(Fin) : popStats(Fin);
    const wx = twoIn ? stI.wx : stI.w, wy = twoIn ? stI.wy : stI.w;
    const hx = Math.min(twoIn ? Fin.N / 2 * Fin.ax.d : Fin.R, reach * wx + Math.abs(stI.cx || 0)), hy = Math.min(twoIn ? Fin.N / 2 * Fin.ay.d : Fin.R, reach * wy + Math.abs(stI.cy || 0));
    const M = Mp, dA = (2 * hx / M) * (2 * hy / M), hs = 0.25 * Math.min(2 * hx, 2 * hy) / M;   // smooth once the sphere is off: 64 across is plenty
    const J = popJ(par.b), gi = par.b.par ? -1 : 1;
    const rR = twoIn ? null : popRadii(qdht(Fin.re.length), Fin.R);
    const refX = twoIn ? (popInside(Fin.ax.z, Fin.ax.zR) ? 0 : -k1 / (2 * Fin.ax.z)) : 0;
    const refY = twoIn ? (popInside(Fin.ay.z, Fin.ay.zR) ? 0 : -k1 / (2 * Fin.ay.z)) : 0;
    const refR = twoIn ? 0 : (Fin.sphere ? -k1 / (2 * Fin.z) : 0);
    const coef = polCoeff(ev, lam0 * 1e6);
    const dI = ev.dIn, dO = ev.dOut || ev.dIn;
    const eIn = { sg: gi, v: [-dI[1] * gi, dI[0] * gi, 0] }, eOut = { sg: g, v: [-dO[1] * g, dO[0] * g, 0] };
    const exo = [-dO[1], dO[0]];                        // the exit frame's across direction, unsigned
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = -hx + (i + 0.5) * 2 * hx / M, y = -hy + (j + 0.5) * 2 * hy / M;
      // the incoming transverse field here, [s, p] in the parity basis, and its whole phase
      let s, p;
      if (twoIn) {
        s = interp2(Fin, x, y);
        if (Fin.re2) p = interp2(Fin, x, y, Fin.re2, Fin.im2);
        else { const a = s; s = [a[0] * J[0] - a[1] * J[1], a[0] * J[1] + a[1] * J[0]]; p = [a[0] * J[2] - a[1] * J[3], a[0] * J[3] + a[1] * J[2]]; }
      } else {
        const q = Math.hypot(x, y);
        if (q >= rR[rR.length - 1]) continue;
        let lo = 0, hi = rR.length - 1;
        if (q <= rR[0]) { lo = 0; hi = 1; } else while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rR[mid] <= q) lo = mid; else hi = mid; }
        const t = clamp((q - rR[lo]) / (rR[hi] - rR[lo]), 0, 1), er = Fin.re[lo] + (Fin.re[hi] - Fin.re[lo]) * t, ei = Fin.im[lo] + (Fin.im[hi] - Fin.im[lo]) * t;
        s = [er * J[0] - ei * J[1], er * J[1] + ei * J[0]]; p = [er * J[2] - ei * J[3], er * J[3] + ei * J[2]];
        if (gi < 0) p = [-p[0], -p[1]];                  // the round field's Jones p is physical; back to the parity basis
      }
      if (s[0] === 0 && s[1] === 0 && p[0] === 0 && p[1] === 0) continue;
      const r = tr(x, y);
      if (!r[4] || r[3] < 0) continue;
      // the ray tube: how an input cell's area maps onto the exit plane
      const rx = tr(x + hs, y), ry = tr(x, y + hs);
      if (!rx[4] || !ry[4]) continue;
      const jac = Math.abs((rx[1] - r[1]) * (ry[2] - r[2]) - (rx[2] - r[2]) * (ry[1] - r[1])) / (hs * hs);
      if (!(jac > 0)) continue;
      // phase: what the light had, and the ray's own path to the exit plane
      const ph = (twoIn ? refX * x * x + refY * y * y : refR * (x * x + y * y)) - 2 * Math.PI / lam0 * r[0];
      const c = Math.cos(ph), sn = Math.sin(ph), amp = r[5] / Math.sqrt(jac);
      const rot = v => [(v[0] * c - v[1] * sn) * amp, (v[0] * sn + v[1] * c) * amp];
      const S0 = rot(s), P0 = rot(p);
      const PM = polMatrix(coef, [r[8], r[9], r[10]], [r[11], r[12], r[13]], [r[14], r[15], r[16]], eIn, eOut, [dI[0], dI[1], 0]);
      const cm = (m, v) => [m[0] * v[0] - m[1] * v[1], m[0] * v[1] + m[1] * v[0]];
      const Ss = cm(PM[0], S0), Sp = cm(PM[1], P0), Ps = cm(PM[2], S0), Pp = cm(PM[3], P0);
      const S = [Ss[0] + Sp[0], Ss[1] + Sp[1]], Pv = [g * (Ps[0] + Pp[0]), g * (Ps[1] + Pp[1])];
      // the full vector is square to the light's own direction there: the converging sphere's
      // normal, to first order in what aberration there is (a thin mask bends the light but
      // not the traced ray, so the trace's own direction is not always the light's)
      const rho0 = Math.sqrt(r[1] * r[1] + r[2] * r[2] + Rf * Rf);
      // the tube's power is per area of the exit plane; |E|^2 is per area square to the ray,
      // which the plane meets at the ray's angle: 1 / sqrt(cos) (not after a thin mask, which
      // holds the field in its plane)
      const ob = ev.mode === 'M' ? 1 : Math.sqrt(rho0 / Rf);
      push(r[1], r[2], [S[0] * ob, S[1] * ob], [Pv[0] * ob, Pv[1] * ob], [-r[1] / rho0, -r[2] / rho0, Rf / rho0], jac * dA);
    }
    out.M = M;
  } else {
    const st = two ? popStats2(F) : popStats(F);
    const wx = two ? st.wx : st.w, wy = two ? st.wy : st.w;
    const hx = Math.min(two ? F.N / 2 * F.ax.d : F.R, reach * wx + Math.abs(st.cx || 0)), hy = Math.min(two ? F.N / 2 * F.ay.d : F.R, reach * wy + Math.abs(st.cy || 0));
    const M = Mp, dA = (2 * hx / M) * (2 * hy / M), J = popJ(sg.b);
    const rR = two ? null : popRadii(qdht(F.re.length), F.R);
    const refX = two ? (popInside(F.ax.z, F.ax.zR) ? 0 : -k / (2 * F.ax.z)) : 0, refY = two ? (popInside(F.ay.z, F.ay.zR) ? 0 : -k / (2 * F.ay.z)) : 0;
    const refR = two ? 0 : (F.sphere ? -k / (2 * F.z) : 0);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = -hx + (i + 0.5) * 2 * hx / M, y = -hy + (j + 0.5) * 2 * hy / M;
      let s, p;
      if (two) {
        const a = interp2(F, x, y);
        if (F.re2) { s = a; const b = interp2(F, x, y, F.re2, F.im2); p = [g * b[0], g * b[1]]; }
        else { s = [a[0] * J[0] - a[1] * J[1], a[0] * J[1] + a[1] * J[0]]; p = [a[0] * J[2] - a[1] * J[3], a[0] * J[3] + a[1] * J[2]]; }
      } else {
        const q = Math.hypot(x, y);
        if (q >= rR[rR.length - 1]) continue;
        let lo = 0, hi = rR.length - 1;
        if (q <= rR[0]) { lo = 0; hi = 1; } else while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rR[mid] <= q) lo = mid; else hi = mid; }
        const t = clamp((q - rR[lo]) / (rR[hi] - rR[lo]), 0, 1), er = F.re[lo] + (F.re[hi] - F.re[lo]) * t, ei = F.im[lo] + (F.im[hi] - F.im[lo]) * t;
        s = [er * J[0] - ei * J[1], er * J[1] + ei * J[0]]; p = [er * J[2] - ei * J[3], er * J[3] + ei * J[2]];
      }
      if (s[0] === 0 && s[1] === 0 && p[0] === 0 && p[1] === 0) continue;
      // the field is held against the paraxial sphere, a quadratic; the light it stands for
      // converges on a true one. Taken as the quadratic, a beam spread wide at its start (a
      // small waist not far off) would carry a quartic error, a false spherical aberration of
      // many waves; so where the reference is one round sphere onto this focus, it is that sphere.
      const rho = Math.sqrt(x * x + y * y + Rf * Rf);
      const exact = two ? (refX && refX === refY && Math.abs(F.ax.z + Rf) < 1e-9 * Rf) : (refR && Math.abs(F.z + Rf) < 1e-9 * Rf);
      const ph = exact ? Math.sign(two ? refX : refR) * k * (rho - Rf) : two ? refX * x * x + refY * y * y : refR * (x * x + y * y), c = Math.cos(ph), sn = Math.sin(ph);
      const rot = v => [v[0] * c - v[1] * sn, v[0] * sn + v[1] * c];
      push(x, y, rot(s), rot(p), [-x / rho, -y / rho, Rf / rho], dA);
    }
    out.M = M;
  }
  const n = X.length;
  if (!n) return null;
  const arr = a => Float64Array.from(a);
  Object.assign(out, { X: arr(X), Y: arr(Y), W: arr(W), U: U.map(arr), n });
  out.RHO = new Float64Array(n);
  for (let o = 0; o < n; o++) out.RHO[o] = Math.sqrt(out.X[o] ** 2 + out.Y[o] ** 2 + Rf * Rf);
  // the numerical aperture: the cone holding all but 1% of the light
  const rad = []; let pT = 0;
  for (let o = 0; o < n; o++) { let I = 0; for (let m = 0; m < 6; m++) I += U[m][o] ** 2; I *= out.W[o]; rad.push([Math.hypot(out.X[o], out.Y[o]), I]); pT += I; }
  rad.sort((a, b) => a[0] - b[0]);
  let acc = 0, rEdge = 0; for (const [r, I] of rad) { acc += I; if (acc >= 0.99 * pT) { rEdge = r; break; } }
  out.NA = F.n * Math.sin(Math.atan(rEdge / Rf));
  return out;
}
/* The field at a point (px, py, pz) in the beam's frame, pz from the segment's start, as
   [x re, x im, y re, y im, z re, z im]: x across in the bench plane, y out of it, z along */
export function vfAt(P, px, py, pz) {
  const { X, Y, RHO, U, W, n, k, lamM, Rf } = P;
  const e = [0, 0, 0, 0, 0, 0];
  for (let o = 0; o < n; o++) {
    const dx = px - X[o], dy = py - Y[o], r = Math.sqrt(dx * dx + dy * dy + pz * pz);
    const ph = -k * (r - RHO[o]), w = pz / (r * r) * W[o], c = Math.cos(ph) * w, s = Math.sin(ph) * w;
    for (let m = 0; m < 3; m++) {
      const a = U[2 * m][o], b = U[2 * m + 1][o];
      e[2 * m] += a * c - b * s; e[2 * m + 1] += a * s + b * c;
    }
  }
  // (i / lam) and the phase of the sphere's own path, e^{-ik Rf}
  const ph0 = -k * Rf, c0 = Math.cos(ph0) / lamM, s0 = Math.sin(ph0) / lamM;
  for (let m = 0; m < 3; m++) {
    const a = e[2 * m], b = e[2 * m + 1], ar = a * c0 - b * s0, ai = a * s0 + b * c0;
    e[2 * m] = -ai; e[2 * m + 1] = ar;                 // times i
  }
  return e;
}
/* The best this pupil could do: the same light and polarisation with its wavefront made
   perfect, every part in step at the focus. The wavefront's phase at each sample is that of
   its transverse field along the pupil's mean polarisation. */
function vfIdeal(P) {
  const { U, W, n, RHO, Rf, lamM } = P;
  let mr = [0, 0, 0, 0];
  for (let o = 0; o < n; o++) for (let m = 0; m < 4; m++) mr[m] += U[m][o] * W[o];
  const L = Math.hypot(...mr) || 1; mr = mr.map(v => v / L);
  const s = [0, 0, 0, 0, 0, 0];
  for (let o = 0; o < n; o++) {
    // the phase along the mean polarisation: arg(E_t . conj(mean))
    const re = U[0][o] * mr[0] + U[1][o] * mr[1] + U[2][o] * mr[2] + U[3][o] * mr[3];
    const im = U[1][o] * mr[0] - U[0][o] * mr[1] + U[3][o] * mr[2] - U[2][o] * mr[3];
    const a = Math.atan2(im, re), c = Math.cos(-a), sn = Math.sin(-a), w = Rf / (RHO[o] * RHO[o]) * W[o];
    for (let m = 0; m < 3; m++) { const x = U[2 * m][o], y = U[2 * m + 1][o]; s[2 * m] += (x * c - y * sn) * w; s[2 * m + 1] += (x * sn + y * c) * w; }
  }
  return (s[0] ** 2 + s[1] ** 2 + s[2] ** 2 + s[3] ** 2 + s[4] ** 2 + s[5] ** 2) / (lamM * lamM);
}
/* Replace a screen's paraxial figures by the vector focus, where the light arrives steeply */
/* A screen map's polarisation and phase, pixel by pixel: the Stokes parameters S1, S2, S3
   (launches added as Stokes, as the light adds), and the phase of the strongest launch's field
   along its own polarisation at its brightest point, that point's phase taken as zero. add()
   takes each pixel's summed s and p field for one launch; done() writes them onto the map. */
export function polMaps(MN) {
  const n = MN * MN, s1 = new Float32Array(n), s2 = new Float32Array(n), s3 = new Float32Array(n);
  const E = new Float32Array(4 * n);                       // the strongest launch's s and p, re and im
  return {
    add(o, sr, si, pr, pi, dom) {
      s1[o] += pr * pr + pi * pi - sr * sr - si * si; s2[o] += 2 * (pr * sr + pi * si); s3[o] += -2 * (pi * sr - pr * si);
      if (dom) { E[4 * o] = sr; E[4 * o + 1] = si; E[4 * o + 2] = pr; E[4 * o + 3] = pi; }
    },
    done(map) {
      let k = 0, best = -1;
      for (let o = 0; o < n; o++) { const I = E[4 * o] ** 2 + E[4 * o + 1] ** 2 + E[4 * o + 2] ** 2 + E[4 * o + 3] ** 2; if (I > best) { best = I; k = o; } }
      const nm = Math.sqrt(best) || 1, js = [E[4 * k] / nm, E[4 * k + 1] / nm], jp = [E[4 * k + 2] / nm, E[4 * k + 3] / nm];
      const ph = new Float32Array(n), pa = new Float32Array(n);
      for (let o = 0; o < n; o++) {
        // conj(J) . E
        const re = js[0] * E[4 * o] + js[1] * E[4 * o + 1] + jp[0] * E[4 * o + 2] + jp[1] * E[4 * o + 3];
        const im = js[0] * E[4 * o + 1] - js[1] * E[4 * o] + jp[0] * E[4 * o + 3] - jp[1] * E[4 * o + 2];
        ph[o] = Math.atan2(im, re); pa[o] = re * re + im * im;
      }
      Object.assign(map, { s1, s2, s3, ph, pa });
    },
  };
}
export function vfApply(el, D, hits, launches, R, sYx, sYy, MNv) {
  const mode = el.vectorFocus || 'auto';
  if (mode === 'off') return;
  const pupils = new Map();
  for (const h2 of hits) {
    const P = vfPupil(h2.sg, R);
    if (!P) continue;
    const near = Math.abs(h2.sg.b.len - P.Rf) < 25 * P.lamM / Math.max(P.NA * P.NA, 1e-6);   // within a few depths of focus
    if (mode === 'on' || (P.NA > VF_NA && near)) pupils.set(h2, P);
  }
  if (!pupils.size) return;
  const MN = MNv || 48;
  // the map: a few spot sizes of the steepest arrival about the paraxial map's centre
  let NAmax = 0; for (const P of pupils.values()) NAmax = Math.max(NAmax, P.NA);
  const cU = 0.5 * (D.map.u0 + D.map.u1), cV = 0.5 * (D.map.v0 + D.map.v1);
  const lam0 = D.nm * 1e-6;
  const H = Math.max(2.5 * lam0 / NAmax, Math.min(0.5 * (D.map.u1 - D.map.u0), 5 * lam0 / NAmax));
  const map = new Float64Array(MN * MN), inc = new Float64Array(MN * MN), pm = polMaps(MN);
  const stokes = [0, 0, 0, 0];
  let axial = 0, total = 0;
  const domL = [...launches.values()].find(L2 => L2.some(h2 => pupils.has(h2)));
  for (const L2 of launches.values()) {
    const parts = L2.map((h2, i) => {
      const b = h2.sg.b, cz = sYx * b.dx + sYy * b.dy, P = pupils.get(h2);
      return { h2, P, cz, c: (L2.cs ? L2.cs[i] : 1) * (h2.lw || 1) };
    });
    for (let jv = 0; jv < MN; jv++) {
      const v = cV + ((jv + 0.5) / MN * 2 - 1) * H;
      for (let iu = 0; iu < MN; iu++) {
        const u = cU + ((iu + 0.5) / MN * 2 - 1) * H;
        let xr = 0, xi = 0, yr = 0, yi = 0, zr = 0, zi = 0, ii = 0;
        for (const q of parts) {
          if (!q.P) continue;
          const s = u - q.h2.ly, e = vfAt(q.P, s * q.h2.p, v - (q.h2.lz || 0), q.h2.sg.b.len + s * q.cz).map(x => x * q.c);
          xr += e[0]; xi += e[1]; yr += e[2]; yi += e[3]; zr += e[4]; zi += e[5];
          ii += e[0] ** 2 + e[1] ** 2 + e[2] ** 2 + e[3] ** 2 + e[4] ** 2 + e[5] ** 2;
        }
        const Ip = xr * xr + xi * xi, Is = yr * yr + yi * yi, Iz = zr * zr + zi * zi, o = jv * MN + iu;
        map[o] += Ip + Is + Iz; inc[o] += ii;
        // the share along the axis, over the circle the map holds
        if (Math.hypot(u - cU, v - cV) <= H) { axial += Iz; total += Ip + Is + Iz; }
        stokes[0] += Is + Ip; stokes[1] += Ip - Is; stokes[2] += 2 * (xr * yr + xi * yi); stokes[3] += -2 * (xi * yr - xr * yi);
        pm.add(o, yr, yi, xr, xi, L2 === domL);
      }
    }
  }
  // figures from the field itself, not the map's pixels: the peak found by a local search,
  // then fine cuts through it along and across the screen
  let ip = 0; for (let i = 1; i < MN * MN; i++) if (map[i] > map[ip]) ip = i;
  const iy = Math.floor(ip / MN), ix = ip % MN, du = 2 * H / MN;
  const Iat = (u, v) => {
    let I = 0;
    for (const L2 of launches.values()) {
      const e0 = [0, 0, 0, 0, 0, 0];
      L2.forEach((h2, i) => {
        const P = pupils.get(h2); if (!P) return;
        const b = h2.sg.b, cz = sYx * b.dx + sYy * b.dy, s = u - h2.ly, e = vfAt(P, s * h2.p, v - (h2.lz || 0), b.len + s * cz), c = (L2.cs ? L2.cs[i] : 1) * (h2.lw || 1);
        for (let m = 0; m < 6; m++) e0[m] += c * e[m];
      });
      I += e0.reduce((a, x) => a + x * x, 0);
    }
    return I;
  };
  let pu = cU + ((ix + 0.5) / MN * 2 - 1) * H, pv = cV + ((iy + 0.5) / MN * 2 - 1) * H, best = Iat(pu, pv);
  for (let step = du / 2; step > du / 64; step /= 2) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const [a, b] of [[step, 0], [-step, 0], [0, step], [0, -step]]) { const v2 = Iat(pu + a, pv + b); if (v2 > best) { best = v2; pu += a; pv += b; moved = true; } }
    }
  }
  const nc = 97, cutX = { x: [], I: [] }, cutY = { x: [], I: [] };
  for (let i = 0; i < nc; i++) { const t = (i / (nc - 1) * 2 - 1) * H; cutX.x.push(t); cutX.I.push(Iat(pu + t, pv)); cutY.x.push(t); cutY.I.push(Iat(pu, pv + t)); }
  const hw = (xs, ys) => {
    let k = 0; for (let i = 1; i < ys.length; i++) if (ys[i] > ys[k]) k = i;
    const h = 0.5 * ys[k], side = dir => { for (let i = k; i >= 0 && i < ys.length; i += dir) if (ys[i] <= h) { const j = i - dir, t = (ys[j] - h) / ((ys[j] - ys[i]) || 1); return Math.abs(xs[j] + t * (xs[i] - xs[j]) - xs[k]); } return null; };
    const l = side(-1), r = side(1); return l === null || r === null ? (l ?? r) : 0.5 * (l + r);
  };
  const fwhmX = 2 * (hw(cutX.x, cutX.I) || 0), fwhmY = 2 * (hw(cutY.x, cutY.I) || 0);
  const peakI = best;
  // second-moment radii of the vector spot, in and out of the plane
  let m0 = 0, mx = 0, my = 0, mxx = 0, myy = 0;
  for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) { const I = map[j * MN + i], x = (i + 0.5) * du, y = (j + 0.5) * du; m0 += I; mx += I * x; my += I * y; mxx += I * x * x; myy += I * y * y; }
  const wxV = 2 * Math.sqrt(Math.max(0, mxx / m0 - (mx / m0) ** 2)), wyV = 2 * Math.sqrt(Math.max(0, myy / m0 - (my / m0) ** 2));
  const nR = 256, rMax = H, rho = new Float64Array(nR), psf = new Float64Array(nR), ee = new Float64Array(nR), cnt = new Float64Array(nR);
  let sum = 0;
  for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) {
    const rr = Math.hypot((i - ix) * du, (j - iy) * du), b = Math.min(nR - 1, Math.round(rr / rMax * (nR - 1)));
    psf[b] += map[j * MN + i]; cnt[b]++; ee[b] += map[j * MN + i]; sum += map[j * MN + i];
  }
  let acc = 0;
  for (let b = 0; b < nR; b++) { rho[b] = rMax * b / (nR - 1); psf[b] = cnt[b] ? psf[b] / cnt[b] : (b ? psf[b - 1] : 0); acc += ee[b]; ee[b] = acc / (sum || 1); }
  // MTF from the line spread along each direction
  // (padded to a power of two for the transform, which also samples the MTF more finely)
  const NF = 128;
  const lsf = alongU => { const L = new Float64Array(NF); for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) L[alongU ? i : j] += map[j * MN + i]; return L; };
  // (the transform's spectrum is centred: zero frequency at index NF / 2)
  const mtfOf = L => { const re = Float64Array.from(L), im = new Float64Array(NF); cdft(re, im, -1); const c = NF / 2, m0 = Math.hypot(re[c], im[c]) || 1, out = new Float64Array(NF / 2); for (let q = 0; q < NF / 2; q++) out[q] = Math.hypot(re[c + q], im[c + q]) / m0; return out; };
  const freq = new Float64Array(NF / 2); for (let q = 0; q < NF / 2; q++) freq[q] = q / (NF * du);
  const mtf = mtfOf(lsf(true)), mtfY = mtfOf(lsf(false));
  const fall = ys => {
    for (let j = 1; j < ys.length; j++) if (ys[j] <= 0.5) { const t = (0.5 - ys[j - 1]) / ((ys[j] - ys[j - 1]) || 1); return freq[j - 1] + t * (freq[j] - freq[j - 1]); }
    return freq[freq.length - 1];
  };
  // the Strehl ratio: the strongest arrival's own peak against its perfect twin's
  const domH = [...pupils.keys()].reduce((a, b) => (a.st.power * segW(a.sg) >= b.st.power * segW(b.sg) ? a : b));
  let strehl = null;
  {
    const Pd = pupils.get(domH);
    if (Pd) {
      const Iid = vfIdeal(Pd), b = domH.sg.b, cz = sYx * b.dx + sYy * b.dy;
      const Id = (u, v) => { const s = u - domH.ly; return vfAt(Pd, s * domH.p, v - (domH.lz || 0), b.len + s * cz).reduce((a2, x2) => a2 + x2 * x2, 0); };
      let qu = pu, qv = pv, pk = Id(qu, qv);
      for (let step = du / 2; step > du / 64; step /= 2) {
        let moved = true;
        while (moved) { moved = false; for (const [a, c] of [[step, 0], [-step, 0], [0, step], [0, -step]]) { const v2 = Id(qu + a, qv + c); if (v2 > pk) { pk = v2; qu += a; qv += c; moved = true; } } }
      }
      if (Iid > 0) strehl = pk / Iid;
    }
  }
  const NA = Math.max(...[...pupils.values()].map(P => P.NA));
  Object.assign(D, {
    vector: { NA, axialShare: total > 0 ? axial / total : 0, pupils: pupils.size, arrivals: hits.length, samples: Math.max(...[...pupils.values()].map(P => P.M)),
      route: [...pupils.values()].map(P => P.route) },
    map: (() => { const m = { v: map, inc, n: MN, u0: cU - H, u1: cU + H, v0: cV - H, v1: cV + H }; pm.done(m); return m; })(),
    peak: peakI, strehl, fwhmX, fwhmY, fwhm: fwhmX && fwhmY ? Math.sqrt(fwhmX * fwhmY) : null, wx: wxV, wy: wyV,
    cutX, cutY, symmetric: false, rho, psf, ee, freq, mtf, mtfY,
    mtf50: fall(mtf), mtf50Y: fall(mtfY),
    stokes: stokes[0] > 0 ? stokes.map(v => v / stokes[0]) : D.stokes,
    dop: stokes[0] > 0 ? Math.hypot(stokes[1], stokes[2], stokes[3]) / stokes[0] : D.dop,
  });
  const radiusAt2 = f => { for (let b = 0; b < nR; b++) if (ee[b] >= f) return rho[b]; return null; };
  D.ee50 = radiusAt2(0.5); D.ee80 = radiusAt2(0.8);
}

