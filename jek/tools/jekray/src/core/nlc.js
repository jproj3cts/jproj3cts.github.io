import { clamp } from './constants.js';
import { ATOMS, C_SI, KB, VAPOUR } from './cells.js';
import { EPS0, FACT, atomLines } from './traps.js';
import { zeemanLines } from './zeeman.js';
import { hermite } from './pulses.js';
import { fanFromGauss } from './beams-hom.js';
import { wavelengthColour } from './colour.js';
import { deg } from '../state/project.js';
import { getEl } from '../state/elements.js';
import { frame, toLocal, toLocalDir, toWorld, toWorldDir } from './mask.js';
import { cellPumps, zOf } from '../engines/trace.js';

/* ---------- Nonlinear crystals: second-harmonic generation ----------
   A periodically poled crystal (quasi-phase-matched, type 0: fundamental and harmonic both
   polarised along the crystal's z axis, which here lies out of the bench plane (s) or in it
   (p)). Its extraordinary index against wavelength and temperature: MgO:LiNbO3 by Gayer et al.
   (Appl. Phys. B 91, 343, 2008), KTiOPO4 n_z by Kato and Takaoka (Appl. Opt. 41, 5040, 2002)
   with Emanueli and Arie's temperature terms (Appl. Opt. 42, 6661, 2003). A Gaussian beam's
   harmonic is Boyd and Kleinman's (J. Appl. Phys. 39, 3597, 1968):
     P2 = 16 pi^2 d_eff^2 L h / (eps0 c lambda^3 n1 n2) * P1^2,
   h(sigma, xi, mu) = |int e^{i sigma t} / (1 + i t) dt|^2 / 4 xi over the crystal, xi = L / b the
   focusing (b the confocal parameter inside), sigma = b dk / 2 the phase mismatch left by the
   poling period, mu where the waist sits; at best (xi = 2.84) h = 1.068. The fundamental is used
   up as P2 = P1 tanh^2(sqrt(eta P1)). The crystal is thin to the rays (its index does not move
   the focus) and the light's own absorption, walk-off and heating are left out. */
export const NLC = {
  ppln: { name: 'MgO:PPLN', d: 14e-12, n: (um, T) => {
    const f = (T - 24.5) * (T + 570.82), l2 = um * um;
    return Math.sqrt(5.756 + 2.860e-6 * f + (0.0983 + 4.700e-8 * f) / (l2 - (0.2020 + 6.113e-8 * f) ** 2) + (189.32 + 1.516e-4 * f) / (l2 - 12.52 * 12.52) - 1.32e-2 * l2); } },
  ppktp: { name: 'PPKTP', d: 9.5e-12, n: (um, T) => {
    const l2 = um * um, n0 = Math.sqrt(4.59423 + 0.06206 / (l2 - 0.04763) + 110.80672 / (l2 - 86.12171)), dT = T - 25;
    const n1 = [9.9587, 9.9228, -8.9603, 4.1010].reduce((a, c, m) => a + c * 1e-6 / um ** m, 0), n2 = [-1.1882, 10.459, -9.8136, 3.1481].reduce((a, c, m) => a + c * 1e-8 / um ** m, 0);
    return n0 + n1 * dT + n2 * dT * dT; } },
};
/* the poling period (um) that phase-matches the plane-wave harmonic of nm at T degrees C */
export function nlcPeriod(mat, nm, T) {
  const M = NLC[mat], um = nm * 1e-3, n1 = M.n(um, T), n2 = M.n(um / 2, T);
  return um / (2 * (n2 - n1));
}
/* Boyd and Kleinman's focusing function */
export function bkH(sigma, xi, mu) {
  const a = -xi * (1 - (mu || 0)), b = xi * (1 + (mu || 0)), N = Math.max(200, Math.min(4000, Math.ceil((b - a) * (1 + Math.abs(sigma)) * 40))) & ~1, h = (b - a) / N;
  let re = 0, im = 0;
  for (let i = 0; i <= N; i++) {
    const t = a + i * h, w = i === 0 || i === N ? 1 : i % 2 ? 4 : 2, d = 1 + t * t;
    const c = Math.cos(sigma * t), sn = Math.sin(sigma * t);
    // e^{i s t} (1 - i t) / (1 + t^2)
    re += w * (c + sn * t) / d; im += w * (sn - c * t) / d;
  }
  re *= h / 3; im *= h / 3;
  return (re * re + im * im) / (4 * xi);
}
/* the best sigma for a focusing, by a scan and golden-section refinement */
export function bkBest(xi, mu) {
  let best = 0, bh = -1;
  for (let s = -1; s <= 4; s += 0.05) { const v = bkH(s, xi, mu); if (v > bh) { bh = v; best = s; } }
  let lo = best - 0.05, hi = best + 0.05;
  for (let i = 0; i < 40; i++) { const m1 = lo + 0.382 * (hi - lo), m2 = lo + 0.618 * (hi - lo); if (bkH(m1, xi, mu) > bkH(m2, xi, mu)) hi = m2; else lo = m1; }
  const s = 0.5 * (lo + hi);
  return { sigma: s, h: bkH(s, xi, mu) };
}
/* One beam's harmonic in a crystal: P (W, along the crystal's axis), its wavelength (nm, vacuum)
   and beam parameter q = [z past the waist, zR] (mm, in air) where it crosses the crystal's
   centre. The crystal's period (0: the best for this beam) and temperature. */
export function nlcConvert(el, P, nm, q, nq, cth) {
  // light crossing the poled grating at an angle (cth the cosine inside, in the plane or tipped
  // out of it) goes L / cth through it, and sees its grating vector shortened to K cth
  cth = cth > 0 && cth < 1 - 1e-12 ? cth : 1;
  const M = NLC[el.material], T = el.temp, um = nm * 1e-3, L = el.nlLen * 1e-3 / cth;
  const n1 = M.n(um, T), n2 = M.n(um / 2, T), k1 = 2 * Math.PI * n1 / (nm * 1e-9), k2 = 2 * Math.PI * n2 / (nm * 0.5e-9);
  // q where the beam crosses the crystal's middle: inside the crystal already (its faces refract
  // it), or, taken in air, its Rayleigh range and distance to the waist grown by n
  const g = nq > 1.01 ? 1 : n1;
  const b = 2 * g * q[1] * 1e-3, xi = L / b, mu = -2 * g * q[0] * 1e-3 / L;
  let period = el.period, sigma, h;
  if (!(period > 0)) { const B = bkBest(xi, mu); sigma = B.sigma; h = B.h; period = 2 * Math.PI * cth / (k2 - 2 * k1 + 2 * sigma / b) * 1e6; }
  else { sigma = b * (2 * k1 + 2 * Math.PI * cth / (period * 1e-6) - k2) / 2; h = bkH(sigma, xi, mu); }   // sigma = b dk / 2, dk = 2 k1 + K - k2
  const eta = 16 * Math.PI ** 2 * M.d ** 2 * L * h / (EPS0 * C_SI * (nm * 1e-9) ** 3 * n1 * n2);      // 1/W
  const P2 = P > 0 ? P * Math.tanh(Math.sqrt(eta * P)) ** 2 : 0;
  return { P2, conv: P > 0 ? P2 / P : 0, eta, h, xi, sigma, mu, period, periodPW: nlcPeriod(el.material, nm, T), n1, n2, b };
}
/* the harmonics the crystals make, as sources launched from each crystal after the trace */
export function nlcSources(hits) {
  const out = [];
  hits.forEach((H, k) => {
    const el = getEl(H.id);
    if (!el || !(H.r.P2 > 0)) return;
    // from the middle of the crystal, where it is made, to its exit face, and out into the air:
    // the harmonic has the fundamental's confocal parameter, its own index at the face
    const f = frame(el), [lx, ly] = toLocal(f, H.x, H.y), [ldx, ldy] = toLocalDir(f, H.dir[0], H.dir[1]);
    const sg = ldx >= 0 ? 1 : -1, t = (sg * el.nlLen / 2 - lx) / (ldx || 1e-12), n2 = H.n > 1.01 ? NLC[el.material].n(H.nm / 2e3, el.temp) : 1;
    const oy = clamp(n2 * ldy, -0.999999, 0.999999), [ex, ey] = toWorld(f, sg * el.nlLen / 2, ly + t * ldy), [odx, ody] = toWorldDir(f, sg * Math.sqrt(1 - oy * oy), oy);
    // out of the plane (a crystal tipped, or met by a beam that rises): from where the fundamental
    // leaves it, along it, in 3D; its harmonic leaves with it, as a source tipped and raised
    const E = H.exit, up = E && (el.tip || Math.abs(E.d3[2]) > 1e-12 || Math.abs(E.z - zOf(el)) > 1e-9);
    const t3 = up ? Math.hypot(E.x - H.x, E.y - H.y, E.z - (H.z === undefined ? E.z : H.z)) : t;
    const qz = (H.q[0] + (H.n > 1.01 ? t3 : 0)) / (H.n > 1.01 ? n2 : 1), zR = H.q[1] / (H.n > 1.01 ? n2 : 1);
    const off = 1e-3, nm2 = H.nm / 2, w0 = Math.sqrt(nm2 * 1e-6 * zR / Math.PI);
    const lh = up ? Math.hypot(E.d3[0], E.d3[1]) : 1;
    const v = {
      type: 'source', virtual: true, shg: true, id: 'shg~' + el.id + '~' + k, name: el.name + ' (second harmonic)', bench: H.bench,
      ...(up ? { z: E.z + E.d3[2] * off, tip: Math.atan2(E.d3[2], lh) / deg } : {}),
      x: up ? E.x + E.d3[0] * off : ex + odx * off, y: up ? E.y + E.d3[1] * off : ey + ody * off, angle: up ? Math.atan2(E.d3[1], E.d3[0]) / deg : Math.atan2(ody, odx) / deg, wavelength: nm2, lines: [], colourAuto: true, colour: wavelengthColour(nm2),
      gauss: true, w0, z0: -qz - off, m2: 1, rays: 3, traceRays: true, popN: 256, popModel: 'auto',
      pol: el.axis, polAngle: 0, coh: 0, lineshape: 'lorentz', power: H.r.P2 * 1000, tau: 0, pshape: 'sech2', rep: 80, gdd0: 0,
      // polarised along the crystal's axis, turned with its roll as the light saw it
      vJ: H.phiR ? (th => [Math.sin(th), 0, Math.cos(th), 0])((el.axis === 'p' ? 0 : Math.PI / 2) + H.phiR) : el.axis === 'p' ? [0, 0, 1, 0] : [1, 0, 0, 0], vLag: 0, vKey: 'shg~' + el.id + '~' + k + ':q', vFo: 2 * (H.fo || 0), sweeps: {},
    };
    v.vRoot = v;
    fanFromGauss(v);
    out.push(v);
  });
  return out;
}
export let nlcConv = new Map();               // crystal|source|nm|state -> the share of the light along its axis it converts
export function setNlcConv(v) { return (nlcConv = v); }
/* atoms per m^3 in the vapour at the cell's temperature */
export function cellDensity(el) {
  const T = el.temp + 273.15;
  return Math.pow(10, VAPOUR[ATOMS[el.atom].el](T)) * 133.322368 / (KB * T);
}
/* The Faddeeva function w(z) = exp(-z^2) erfc(-iz) for Im z >= 0, by Humlicek's W4 (1982),
   good to about 1e-4: its real part is the Voigt profile, its imaginary part the dispersion */
export function faddeeva(x, y) {
  // complex helpers on [re, im]
  const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sc = (a, s) => [a[0] * s, a[1] * s], cn = v => [v, 0];
  const t = [y, -x], s = Math.abs(x) + y;
  const poly = (u, cs) => { let r = cn(cs[cs.length - 1]); for (let i = cs.length - 2; i >= 0; i--) r = add(mul(r, u), cn(cs[i])); return r; };
  if (s >= 15) return div(sc(t, 0.5641896), add(cn(0.5), mul(t, t)));
  if (s >= 5.5) { const u = mul(t, t); return div(mul(t, add(cn(1.410474), sc(u, 0.5641896))), add(cn(0.75), mul(u, add(cn(3), u)))); }
  if (y >= 0.195 * Math.abs(x) - 0.176)
    return div(poly(t, [16.4955, 20.20933, 11.96482, 3.778987, 0.5642236]), poly(t, [16.4955, 38.82363, 39.27121, 21.69274, 6.699398, 1]));
  const u = mul(t, t);
  const num = mul(t, poly(u, [36183.31, -3321.9905, 1540.787, -219.0313, 35.76683, -1.320522, 0.56419]));
  const den = poly(u, [32066.6, -24322.84, 9022.228, -2186.181, 364.2191, -61.57037, 1.841439, -1]);
  const eu = Math.exp(u[0]);
  return add([eu * Math.cos(u[1]), eu * Math.sin(u[1])], sc(div(num, den), -1));
}
/* What a cell does to light, slice by slice along its length. A plan fixes what does not
   change across the beam (each line's Voigt absorption and dispersion at the light's frequency,
   and the holes each other beam burns); evalPlan then walks one line through the cell at
   (u, v) across it (u in the bench plane, v out of it, mm, on the cell's centre plane), each
   slice absorbing by the intensity there:
   - the light's own beam saturates the lines it is on (a Doppler-broadened line: alpha falls
     as 1 / sqrt(1 + s)), less as it is absorbed on the way through;
   - every other beam crossing the cell burns a hole in the velocity class it talks to. With
     an angle theta between the two, the hole is at nu - nu_a = cos(theta) (nu_p - nu_b),
     power broadened (a Lorentzian), and smeared by the atoms moving across the pump by
     u sin(theta) (a Gaussian; together a Voigt). Head on, that is the Lamb dip and the
     crossovers; side by side, a broad dip with no sub-Doppler feature. Its depth follows the
     other beam's intensity where this light is in that slice: its Gaussian profile, where it
     sits and which way it goes (so beams crossing at an angle meet over part of the cell
     only), and how much of it the cell has absorbed by then.
   Rate equations for each transition alone, no optical pumping between levels: where the
   dips are and how wide is right; how deep, crossovers above all, only roughly. */
const CELL_SLICES = 12;
/* A beam's intensity across itself, relative to the peak I of the Gaussian of width w it is
   described by, at (du, dv) from its centre (mm): that Gaussian's own profile, or, for a
   higher-order mode, |sum c_k h_m(sqrt2 x / w) h_n(sqrt2 y / w)|^2 e^{-2 r^2 / w^2} over its
   Hermite-Gauss modes (so a vortex has its dark core and HG its lobes) */
export function beamShape(R, du, dv) {
  const x = du / R.w, y = dv / R.w, g = Math.exp(-2 * (x * x + y * y));
  if (!R.comps) return g;
  let ar = 0, ai = 0;
  for (const [m, n, cr, ci] of R.comps) {
    const v = hermite(m, Math.SQRT2 * x) * hermite(n, Math.SQRT2 * y) / Math.sqrt(Math.pow(2, m + n) * FACT[m] * FACT[n]);
    ar += v * cr; ai += v * ci;
  }
  return (ar * ar + ai * ai) * g;
}
/* how far out, in widths w, a beam's light reaches: 1 for a Gaussian, sqrt(2N + 1) for a mode of order N */
export const beamReach = R => R.comps ? Math.sqrt(Math.max(...R.comps.map(c => 2 * (c[0] + c[1]) + 1))) : 1;
/* its brightest point, relative to I (1 for a Gaussian) */
const shapePeakMemo = new Map();
function beamShapePeak(R) {
  if (!R.comps) return 1;
  const k = JSON.stringify(R.comps);
  if (!shapePeakMemo.has(k)) {
    const U = { w: 1, comps: R.comps }, e = 1.5 * beamReach(U);
    let pk = 0;
    for (let i = -60; i <= 60; i++) for (let j = -60; j <= 60; j++) pk = Math.max(pk, beamShape(U, i / 60 * e, j / 60 * e));
    shapePeakMemo.set(k, pk);
  }
  return shapePeakMemo.get(k);
}
export function cellPlan(el, nu, dir, self, others, qLab) {
  // one hand of circular light about the cell's axis (qLab +1 or -1), or both alike (null)
  const hand = qLab === 1 || qLab === -1, sB = el.bField < 0 ? -1 : 1;
  const all = hand ? zeemanLines(el.atom, el.line, Math.abs(el.bField)) : null;
  const frac = (R, q) => R && R.circ ? R.circ[q * sB > 0 ? 0 : 1] : 0.5;     // a beam's share of the hand that drives q about the field
  const lines = hand ? all.filter(a => a.q === qLab * sB) : atomLines(el.atom, el.line), T = el.temp + 273.15, n = cellDensity(el), L = el.cellLen;
  if (hand && self) self = Object.assign({}, self, { I: self.I * 2 * frac(self, qLab * sB) });
  const tr = lines.map(a => {
    const u = a.nu / C_SI * Math.sqrt(2 * KB * T / a.m), gam = a.A / (4 * Math.PI), w = faddeeva((nu - a.nu) / u, gam / u);
    const pref = n * a.share * a.S * a.sInt / (u * Math.sqrt(Math.PI));
    return { a, u, gam, al: pref * w[0], dp: pref * w[1], k: a.S / a.Isat, holes: [] };
  });
  const tanOf = d => d[1] / (Math.abs(d[0]) > 1e-12 ? d[0] : 1e-12);
  const plan = { tr, L, dirSign: dir[0] < 0 ? -1 : 1, tan: tanOf(dir), self: null, pumps: [], varies: false };
  if (self && self.I > 0 && self.w > 0 && isFinite(self.w)) {
    plan.self = self;
    if (tr.some(q => self.I * beamShapePeak(self) * q.k > 1e-4)) plan.varies = true;
  }
  (others || []).forEach((P, pi) => {
    if (!(P.I > 0)) return;
    const cos = clamp(dir[0] * P.dir[0] + dir[1] * P.dir[1], -1, 1), sin = Math.sqrt(Math.max(0, 1 - cos * cos));
    const pp = { I: P.I, w: P.w > 0 ? P.w : Infinity, ly: P.ly || 0, tan: tanOf(P.dir), prof: P.prof || null, comps: P.comps || null, holes: 0 };
    const pumpLines = hand ? all.map(a => ({ a, f: 2 * frac(P, a.q) })) : tr.map(qb => ({ a: qb.a, f: 1 }));
    for (const q of tr) for (const { a: b, f } of pumpLines) {
      const a = q.a;
      if (b.iso !== a.iso || b.Fg !== a.Fg || !(f > 0)) continue;
      const sPk = P.I * f * beamShapePeak(P) * b.S / b.Isat;
      if (!(sPk > 1e-6)) continue;
      const D = nu - a.nu - cos * (P.nu - b.nu), G = q.gam * (1 + Math.abs(cos) * Math.sqrt(1 + sPk)), sg = q.u * sin;
      // the hole's shape at this light's frequency, 1 at its centre for a Lorentzian of the same area
      // and its dispersive companion (Kramers and Kronig: the atoms taken out delay the light too)
      let H, Hd;
      if (sg < 1e-3 * G) { H = 1 / (1 + (D / G) ** 2); Hd = (D / G) * H; }
      else { const wv = faddeeva(D / sg, G / sg); H = Math.sqrt(Math.PI) * (G / sg) * wv[0]; Hd = Math.sqrt(Math.PI) * (G / sg) * wv[1]; }
      // between Zeeman sublevels, by the populations: the pump on the probe's own transition
      // empties its lower level and fills its upper (the full hole); on another from the same
      // lower level it only empties that (half)
      const w0 = b === a ? 1 : hand ? 0.5 : 2 * b.S / (a.S + b.S), wgt = w0 * H;
      if (wgt > 1e-7 || Math.abs(w0 * Hd) > 1e-7) { q.holes.push({ p: pi, wgt, wd: w0 * Hd, k: f * b.S / b.Isat }); pp.holes++; }
    }
    plan.pumps[pi] = pp;
    if (pp.holes) plan.varies = true;
  });
  return plan;
}
/* the light's field factor through the cell at (u, v) on its centre plane: { amp, ph, od } */
export function evalPlan(plan, u, v) {
  // (each slice's path: longer by 1 / cos for light crossing the cell at an angle, in the plane or tipped out of it)
  const N = CELL_SLICES, dx = plan.L / N, dm = dx * 1e-3 * (plan.sec || 1), S = plan.self;
  let od = 0, dsp = 0, Trun = 1;
  const IP = new Float64Array(plan.pumps.length);
  for (let k = 0; k < N; k++) {
    const x = plan.dirSign * (-plan.L / 2 + (k + 0.5) * dx);            // mm along the cell, from its centre
    const Is = S ? S.I * Trun * beamShape(S, u - S.ly, v) : 0;
    plan.pumps.forEach((P, i) => {
      if (!P) return;
      const d = isFinite(P.w) ? (u + x * plan.tan) - (P.ly + x * P.tan) : 0;
      IP[i] = P.I * (P.prof ? P.prof(x) : 1) * (isFinite(P.w) ? beamShape(P, d, v) : 1);
    });
    // absorption at a given own intensity: a midpoint step, as the beam saturates less as it fades
    const at = I0 => {
      let al = 0, dp = 0;
      for (const q of plan.tr) {
        const sat = I0 > 0 ? 1 / Math.sqrt(1 + I0 * q.k) : 1;
        let keep = 1, kd = 0;
        for (const hl of q.holes) { const s = IP[hl.p] * hl.k; if (s > 1e-9) { const h2 = 0.5 * (1 - 1 / Math.sqrt(1 + s)); keep -= hl.wgt * h2; kd += hl.wd * h2; } }
        al += q.al * sat * Math.max(0, keep); dp += q.dp * sat - q.al * sat * kd;
      }
      return [al, dp];
    };
    let [al, dp] = at(Is);
    if (Is > 0) [al, dp] = at(Is * Math.exp(-al * dm / 2));
    od += al * dm; dsp += dp * dm; Trun *= Math.exp(-al * dm);
  }
  return { amp: Math.exp(-od / 2), ph: -dsp / 2, od };
}
/* a beam's own intensity along the cell's axis, relative to where it enters: its absorption,
   saturating itself, slice by slice; as a function of x (mm from the centre) */
export function cellProfile(el, rec) {
  const plan = cellPlan(el, rec.nu, rec.dir, { I: rec.I, w: rec.w, ly: rec.ly }, []);
  const N = CELL_SLICES, dx = plan.L / N, xs = [], Is = [], I0 = rec.I * beamShapePeak(rec);
  let Trun = 1;
  for (let k = 0; k < N; k++) {
    const x = plan.dirSign * (-plan.L / 2 + (k + 0.5) * dx);
    xs.push(x); Is.push(Trun);
    const at = I0 => plan.tr.reduce((s, q) => s + q.al / Math.sqrt(1 + I0 * q.k), 0);
    let al = at(I0 * Trun);
    al = at(I0 * Trun * Math.exp(-al * dx * 1e-3 / 2));
    Trun *= Math.exp(-al * dx * 1e-3);
  }
  return x => { let best = 0; for (let k = 1; k < N; k++) if (Math.abs(xs[k] - x) < Math.abs(xs[best] - x)) best = k; return Is[best]; };
}
/* The plan for light of one beam (a record of the last trace, or none) through a cell, with
   the others there as they were: memoised for the trace */
export let cellPlanMemo = new Map();
export function setCellPlanMemo(v) { return (cellPlanMemo = v); }
export function cellPlanFor(el, nu, dir, srcId, qLab, sec) {
  sec = sec > 1 + 1e-12 ? sec : 1;            // the light's path through the cell against its length: 1 / cos of its angle to the cell's axis
  const recs = cellPumps.get(el.id) || [];
  const sameDir = r => r.dir[0] * dir[0] + r.dir[1] * dir[1] > 0.9999;
  const self = srcId === undefined ? null : recs.filter(r => r.src === srcId && sameDir(r) && Math.abs(r.nu - nu) < 1).sort((a, b) => b.I - a.I)[0] || null;
  const key = el.id + '|' + nu + '|' + dir[0].toFixed(9) + ',' + dir[1].toFixed(9) + '|' + (self ? recs.indexOf(self) : -1) + '|' + (qLab || 0) + (sec !== 1 ? '|s' + sec.toFixed(12) : '');
  if (cellPlanMemo.has(key)) return cellPlanMemo.get(key);
  const others = recs.filter(r => r !== self).map(r => Object.assign({}, r, { prof: isFinite(r.w) ? cellProfileMemo(el, r) : null }));
  const plan = cellPlan(el, nu, dir, self, others, qLab);
  if (sec !== 1) plan.sec = sec;
  cellPlanMemo.set(key, plan);
  return plan;
}
const cellProfileMemo = (el, r) => { const k = 'prof|' + el.id + '|' + r.nu + '|' + r.I + '|' + r.w + '|' + r.dir + '|' + (r.comps ? JSON.stringify(r.comps) : ''); if (!cellPlanMemo.has(k)) cellPlanMemo.set(k, cellProfile(el, r)); return cellPlanMemo.get(k); };
/* At its simplest: light at nu on the cell's axis, with beams { nu, I (W/m^2) } crossing it
   head on and wide (the readouts, the tests) */
export function cellResponse(el, nu, pumps, qLab) {
  const plan = cellPlan(el, nu, [1, 0], null, (pumps || []).map(P => ({ nu: P.nu, I: P.I, w: P.w || Infinity, ly: P.ly || 0, dir: P.dir || [-1, 0], circ: P.circ || null })), qLab);
  return evalPlan(plan, 0, 0);
}

/* The orders a grating sends out for one ray: direction cosine along the grating (local y),
   and the share of power in each. A thin sawtooth blazed for blaze nm in order +1 puts
   sinc^2(m - blaze/lambda) into order m; the orders that cannot propagate carry theirs away,
   and eff scales the rest for what the real surface absorbs and scatters. */
export function gratingOrders(el, nm, ldy, n) {
  const G = el.lpmm, lam = nm * 1e-6, out = [], x0 = el.blaze / nm;
  const sinc = x => Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
  const mMax = Math.ceil(2 * n / (lam * G)) + 1;
  for (let m = -mMax; m <= mMax; m++) {
    const ty = ldy + m * lam * G / n;
    if (Math.abs(ty) >= 1) continue;
    const eff = (el.eff / 100) * sinc(m - x0) ** 2;
    if (eff >= 1e-4) out.push({ m, ty, eff });
  }
  return out;
}

