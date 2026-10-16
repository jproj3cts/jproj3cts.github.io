import { besselJ01 } from '../engines/field.js';
import { lastTrace } from '../engines/trace.js';
import { beamAt } from './beams-hom.js';
import { absorbAt, refIndex } from './glass.js';
import { hornLam, mixEps } from './rf.js';
import { hornPattern } from './horns.js';
import { grinDesign, normGrin } from './grin.js';
import { getEl } from '../state/elements.js';
import { frame, toLocal, toLocalDir } from './mask.js';

/* ---------- A lens antenna: a feed horn's beam through an RF lens, seen from far away ----------
   The field just past the lens is the traced Gaussian beam there (1/e^2 radius w, wavefront
   radius R, infinite when collimated), cut off at the lens's rim a and weakened by what the lens
   takes from it at each radius (T(r), the power it passes). From that aperture field E(r):

     directivity  D = (4 pi / lambda^2) |int E dA|^2 / int |E|^2 dA          (the aperture's own)
     gain         G = (4 pi / lambda^2) |int E dA|^2 / P_feed                (all the horn sends)

   so G = D x spillover x loss, and D against a uniform aperture's 4 pi A / lambda^2 is the
   aperture efficiency: the taper (how unevenly the aperture is lit) times the phase efficiency (a
   wavefront left curved, a lens focusing or not quite collimating). The pattern is the aperture
   field's Hankel transform with the obliquity factor (1 + cos theta) / 2, which is round: one cut
   serves every plane. The feed's own pattern beyond the lens (its spillover past the rim) is left
   out of the pattern, which holds while that is a few percent. */
export function lensAntenna({ w, R, a, lam, T, P, gainOnly }) {
  const N = 400, dr = a / N, k = 2 * Math.PI / lam, invR = isFinite(R) && R ? 1 / R : 0;
  const rs = [], er = [], ei = [], amp = [];
  let Pa = 0, Pa0 = 0, Sr = 0, Si = 0, S0 = 0;
  for (let i = 0; i < N; i++) {
    const r = (i + 0.5) * dr, g = Math.exp(-r * r / (w * w)), t = T ? Math.sqrt(Math.max(0, T(r))) : 1;
    const A = g * t, ph = -k * (r * r * invR / 2 + (P ? P(r) : 0)), dA = 2 * Math.PI * r * dr;   // P: any further path, mm
    rs.push(r); amp.push(A); er.push(A * Math.cos(ph)); ei.push(A * Math.sin(ph));
    Pa += A * A * dA; Pa0 += g * g * dA; Sr += A * Math.cos(ph) * dA; Si += A * Math.sin(ph) * dA; S0 += A * dA;
  }
  const Pfeed = Math.PI * w * w / 2;                       // all the Gaussian beam's power, to infinity
  const Dmax = 4 * Math.PI * Math.PI * a * a / (lam * lam);
  const D = 4 * Math.PI / (lam * lam) * (Sr * Sr + Si * Si) / Pa;
  const G = 4 * Math.PI / (lam * lam) * (Sr * Sr + Si * Si) / Pfeed;
  const eta = {
    spill: Pa0 / Pfeed,                                    // the share of the beam that meets the lens
    loss: Pa / Pa0,                                        // what the lens passes of that
    taper: S0 * S0 / (Math.PI * a * a * Pa),               // how evenly the aperture is lit
    phase: (Sr * Sr + Si * Si) / (S0 * S0),                // how flat the wavefront leaves
  };
  eta.ap = D / Dmax;
  if (gainOnly) return { D, G, Ddbi: 10 * Math.log10(D), Gdbi: 10 * Math.log10(G), Dmax, eta };
  // the pattern, out to a few beamwidths
  const tMax = Math.min(60, Math.max(3, 8 * (lam / (2 * a)) * 180 / Math.PI)), M = 241;
  const th = [], pat = [];
  for (let j = 0; j < M; j++) {
    const t = tMax * j / (M - 1), s = Math.sin(t * Math.PI / 180), ob = (1 + Math.cos(t * Math.PI / 180)) / 2;
    let re = 0, im = 0;
    for (let i = 0; i < N; i++) { const J = besselJ01(k * rs[i] * s)[0] * 2 * Math.PI * rs[i] * dr; re += er[i] * J; im += ei[i] * J; }
    th.push(t); pat.push((re * re + im * im) * ob * ob);
  }
  const peak = pat[0], db = pat.map(v => 10 * Math.log10(Math.max(v, 1e-30) / peak));
  // the half-power width, between samples; the first sidelobe, the first peak past the first null
  let hpbw = null, sll = null;
  for (let j = 1; j < M; j++) if (db[j] <= -3.0103) { const f = (db[j - 1] + 3.0103) / (db[j - 1] - db[j]); hpbw = 2 * (th[j - 1] + f * (th[j] - th[j - 1])); break; }
  for (let j = 1; j < M - 1; j++) if (db[j] < -3.0103 && db[j] > db[j - 1] && db[j] >= db[j + 1]) { sll = db[j]; break; }
  return { D, G, Ddbi: 10 * Math.log10(D), Gdbi: 10 * Math.log10(G), Dmax, eta, hpbw, sll, th, db };
}

/* a surface's sag at radius r: a conic with even aspheric terms (as the lens readout takes it) */
const faceSag = (s, r) => {
  const poly = (s && s.a2 ? s.a2 * r * r : 0) + (s && s.A ? s.A.reduce((a, c, j) => a + c * r ** (4 + 2 * j), 0) : 0);
  if (!s || s.R === null || s.R === undefined || !isFinite(s.R) || !s.R) return poly;
  const c = 1 / s.R, k = s.k || 0, q = 1 - (1 + k) * c * c * r * r;
  return (q > 0 ? c * r * r / (1 + Math.sqrt(q)) : Math.sign(c) * Math.abs(s.R)) + poly;
};
/* An RF lens as the antenna models take it: its radius a, the power it passes at each radius T(r),
   and the path through it at each radius (mm, to an additive constant), path(r, d), with the
   plastic's permittivity d (a fraction) off what it was designed with: a graded-index lens's core
   and matching layers at the densities its design prints, or a solid lens's thickness at its index.
   For a solid lens, too, what a thin plate standing for it must be told of its thickness: the
   distance from its front face to its front focus (ffd) against its thin form's focal length
   (fThin). Null for a lens these do not cover. */
function lensModel(el, nm) {
  if (el.grin) {
    const g = normGrin(el.grin), D = grinDesign(g, el.length);
    if (!D.usable) return null;
    const K = 400, fc = [], fl = [];
    for (let i = 0; i <= K; i++) { const r = D.a * i / K; fc.push(D.fillAt(r) / 100); fl.push(D.match ? D.layerFillAt(r) / 100 : 0); }
    const at = (arr, r) => { const x = Math.min(K, Math.max(0, r / D.a * K)), i = Math.min(K - 1, Math.floor(x)); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); };
    const path = (r, d) => {
      const M = d ? Object.assign({}, D.M, { n: D.M.n * Math.sqrt(1 + d) }) : D.M, n = F => Math.sqrt(mixEps(M, F).eps);
      return D.t * n(at(fc, r)) + (D.match ? 2 * D.tm * n(at(fl, r)) : 0);
    };
    return { a: D.a, path, f: g.f, fThin: g.f, ffd: g.f, T: r => { const L = D.lossDb(r); return 10 ** (-(L.abs + L.refl) / 10); }, flat: true };
  }
  if (!(el.surfaces && el.surfaces.length === 2 && el.materials && el.materials.length === 1)) return null;
  const m = el.materials[0], n = refIndex(m, nm), alpha = absorbAt(m, nm), t0 = (el.gaps || [0])[0] || 0, S = el.surfaces;
  const thick = r => Math.max(0, t0 + faceSag(S[1], r) - faceSag(S[0], r));
  const faceT = S.map(s => { const c = s.coat || { mode: 'bare' }; return 1 - (c.mode === 'bare' || !c.mode ? ((n - 1) / (n + 1)) ** 2 : (c.R || 0) / 100); });
  const cOf = s => (s.R !== null && s.R !== undefined && isFinite(s.R) && s.R ? 1 / s.R : 0) + 2 * (s.a2 || 0);
  const c1 = cOf(S[0]), c2 = cOf(S[1]), Pw = (n - 1) * (c1 - c2) + (n - 1) ** 2 * t0 * c1 * c2 / n;
  return {
    a: el.diameter / 2, n, thick, T: r => faceT[0] * faceT[1] * Math.exp(-alpha * thick(r)),
    path: (r, d) => (n * Math.sqrt(1 + (d || 0)) - 1) * thick(r),
    f: Pw ? 1 / Pw : Infinity, fThin: (c1 - c2) ? 1 / ((n - 1) * (c1 - c2)) : Infinity,
    // the front focal distance, from whichever face the beam meets first
    ffdFor: back => { const a1 = back ? -c2 : c1, a2 = back ? -c1 : c2, P = (n - 1) * (a1 - a2) + (n - 1) ** 2 * t0 * a1 * a2 / n; return P ? (1 + (n - 1) * t0 * a2 / n) / P : Infinity; },
  };
}
/* The lens antenna an RF lens on the bench makes with the horn that feeds it: from the strongest
   traced beam leaving the lens (into air), the lens's own loss at each radius (a solid lens's
   faces and the glass its thickness there holds; a graded-index lens's design), and the horn's
   own directivity to compare. Null when no RF beam leaves the lens. */
const antMemo = new WeakMap();
const memoOf = (el, what) => {
  const T0 = lastTrace;
  let byEl = antMemo.get(T0);
  if (!byEl) { byEl = new Map(); antMemo.set(T0, byEl); }
  const key = what + '|' + el.id + '|' + JSON.stringify([el.diameter, el.length, el.surfaces, el.gaps, el.materials, el.grin]);
  return { has: () => byEl.has(key), get: () => byEl.get(key), set: v => { byEl.set(key, v); return v; } };
};
function exitBeam(el) {
  let best = null;
  for (const b of lastTrace.beams || []) {
    const s = b.ev && b.ev.surf;
    if (!s || !s.el || s.el.id !== el.id || !(b.nm > 1e5) || !(b.qi > 0) || b.n > 1.0001) continue;
    if (!best || b.w > best.w) best = b;
  }
  return best;
}
export function lensAntennaOf(el) {
  const memo = memoOf(el, 'ant');
  if (memo.has()) return memo.get();
  let out = null;
  const best = exitBeam(el), B = best && beamAt(best.qr, best.qi, best.n, best.nm);
  if (B && B.w > 0) {
    const lam = best.nm * 1e-6, L = lensModel(el, best.nm), a = L ? L.a : (el.grin ? el.length : el.diameter) / 2;
    const A = lensAntenna({ w: B.w, R: B.R, a, lam, T: L ? L.T : null });
    const src = getEl(best.src), horn = src && src.mmw && src.mmw.kind ? hornPattern(src.mmw.kind, src.mmw.a, src.mmw.L, hornLam(src)) : null;
    const ff = 2 * (2 * a) ** 2 / lam;                       // the far field begins about here
    const focus = B.waistDist > 0 && isFinite(B.waistDist) ? B.waistDist : null;
    out = Object.assign(A, { w: B.w, R: B.R, a, lam, hornDbi: horn ? horn.dir : null, horn, farField: ff, focus });
  }
  return memo.set(out);
}

/* ---------- How closely it must be made ----------
   The plastic's permittivity as printed is known to a few percent until tiles of it are measured
   (and the printer's flow moves it the same way: more plastic in each line is a denser part). A
   permittivity d off adds a path through the lens growing from its centre, which is a little extra
   lens: the focus moves, and with the horn left where it was the aperture's phase is no longer
   flat. Its gain at d = +-5%, and how far d may go before the gain falls 1 dB. */
export const TOL_EPS = 0.05;
export function lensToleranceOf(el) {
  const memo = memoOf(el, 'tol');
  if (memo.has()) return memo.get();
  const best = exitBeam(el), B = best && beamAt(best.qr, best.qi, best.n, best.nm), L = best && lensModel(el, best.nm);
  if (!(B && B.w > 0 && L)) return memo.set(null);
  const lam = best.nm * 1e-6, base = { w: B.w, R: B.R, a: L.a, lam, T: L.T, gainOnly: true };
  const G0 = lensAntenna(base).G;
  const extra = d => { const p0 = L.path(0, d) - L.path(0, 0); return r => L.path(r, d) - L.path(r, 0) - p0; };
  const dB = d => 10 * Math.log10(lensAntenna(Object.assign({ P: extra(d) }, base)).G / G0);
  // the focus it moves to: the extra path near the axis as a thin lens of its own
  const focusAt = d => { const r1 = 0.4 * L.a, x = extra(d)(r1), inv = -2 * x / (r1 * r1); return isFinite(L.f) ? 1 / (1 / L.f + inv) - L.f : null; };
  const budget = sgn => {
    if (dB(sgn * 0.5) > -1) return 0.5;
    let lo = 0, hi = 0.5;
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (dB(sgn * m) > -1) lo = m; else hi = m; }
    return lo;
  };
  const up = dB(TOL_EPS), down = dB(-TOL_EPS);
  return memo.set({ eps: TOL_EPS, gainDb: Math.min(up, down), up, down, focusUp: focusAt(TOL_EPS), focusDown: focusAt(-TOL_EPS), budget: Math.min(budget(1), budget(-1)), f: L.f });
}

/* ---------- A feed off the axis: steering the beam ----------
   A horn moved off the lens's axis tilts the wave arriving at the lens, and the beam leaves the
   other way. How far, and what it costs, comes from the aperture field across the whole disc
   (not round now): the arriving Gaussian beam (its width w, the radius R of its wavefront, where
   its axis crosses the lens yh, its direction there sin b; its wavefront a sphere about the point R
   back along its axis, whole, as coma needs, not only its curvature), times what the lens passes and the
   path through it. The lens is taken as a thin plate: a graded-index lens is one on the bench too;
   a solid lens's plate is told its focal length, and the horn placed against that as it is against
   the solid lens's front focus. Its far field is cut in the bench plane, where the feed moves:
     F(theta) = int dy exp(i k y sin theta) int dz E(y, z),    gain = (4 pi / lambda^2) |F|^2 / P_feed
   giving the beam's direction (its peak), the gain there, and its highest lobe: off the axis the
   lens's coma raises the lobe on the side towards the axis. */
export function steerField({ w, R, yh, sb, a, lam, T, path }) {
  const N = 96, d = 2 * a / N, k = 2 * Math.PI / lam, cb = Math.sqrt(Math.max(0, 1 - sb * sb)), sph = isFinite(R) && R;
  const yP = sph ? yh - R * sb : 0, zP = sph ? R * cb : 0;             // the wavefront's centre (the horn), behind the lens
  const cb0 = Math.sqrt(cb);                                            // a slanting beam's power spread over more of the lens
  const ys = [], gr = [], gi = [];
  for (let i = 0; i < N; i++) {
    const y = -a + (i + 0.5) * d;
    let re = 0, im = 0;
    for (let j = 0; j < N; j++) {
      const z = -a + (j + 0.5) * d, r = Math.hypot(y, z);
      if (r > a) continue;
      const u = (y - yh) * cb, rho2 = u * u + z * z, amp = cb0 * Math.exp(-rho2 / (w * w)) * (T ? Math.sqrt(Math.max(0, T(r))) : 1);
      const ph = -k * ((sph ? Math.sign(R) * Math.sqrt((y - yP) ** 2 + z * z + zP * zP) : (y - yh) * sb) + path(r));
      re += amp * Math.cos(ph) * d; im += amp * Math.sin(ph) * d;
    }
    ys.push(y); gr.push(re); gi.push(im);
  }
  const Pfeed = Math.PI * w * w / 2, bw = lam / (2 * a) * 180 / Math.PI;
  const step = Math.max(0.02, bw / 8), M = Math.min(1600, Math.ceil(140 / step)), th = [], g = [];
  for (let m = 0; m <= M; m++) {
    const t = -70 + 140 * m / M, s = Math.sin(t * Math.PI / 180), ob = (1 + Math.cos(t * Math.PI / 180)) / 2;
    let re = 0, im = 0;
    for (let i = 0; i < N; i++) { const p = k * ys[i] * s, c = Math.cos(p), sn = Math.sin(p); re += (gr[i] * c - gi[i] * sn) * d; im += (gr[i] * sn + gi[i] * c) * d; }
    th.push(t); g.push(4 * Math.PI / (lam * lam) * (re * re + im * im) * ob * ob / Pfeed);
  }
  let pk = 0;
  for (let m = 1; m <= M; m++) if (g[m] > g[pk]) pk = m;
  // the peak between samples: a parabola through the three about it, its place and its height
  let t0 = th[pk], G0 = g[pk];
  if (pk > 0 && pk < M) { const y0 = g[pk - 1], y1 = g[pk], y2 = g[pk + 1], den = y0 - 2 * y1 + y2; if (den < 0) { t0 += 0.5 * (y0 - y2) / den * (th[1] - th[0]); G0 = y1 - (y0 - y2) ** 2 / (8 * den); } }
  // the main lobe runs out to the first minimum each side; the highest of the rest is the lobe to watch
  let lo = pk, hi = pk;
  while (lo > 0 && g[lo - 1] < g[lo]) lo--;
  while (hi < M && g[hi + 1] < g[hi]) hi++;
  let side = 0;
  for (let m = 0; m <= M; m++) if ((m < lo || m > hi) && g[m] > side) side = g[m];
  return { beam: t0, G: G0, lobe: side > 0 ? 10 * Math.log10(side / G0) : null, th, g };
}
export function lensSteerOf(el) {
  const memo = memoOf(el, 'steer');
  if (memo.has()) return memo.get();
  // the beam arriving at the lens, in its own frame (x along its axis)
  let inb = null;
  for (const b of lastTrace.beams || []) {
    if (b.endEl !== el.id || !(b.nm > 1e5) || !(b.qi > 0) || b.n > 1.0001) continue;
    if (!inb || b.w > inb.w) inb = b;
  }
  const L = inb && lensModel(el, inb.nm), B = inb && beamAt(inb.qr + inb.len, inb.qi, inb.n, inb.nm);
  if (!(L && B && B.w > 0)) return memo.set(null);
  const f = frame(el), [, ly] = toLocal(f, inb.x0 + inb.dx * inb.len, inb.y0 + inb.dy * inb.len);
  let [ldx, ldy] = toLocalDir(f, inb.dx, inb.dy);
  const back = ldx < 0, l = Math.hypot(ldx, ldy), sb = ldy / l, lam = inb.nm * 1e-6;
  // the thin plate's wavefront from the horn: a solid lens's horn as far from the plate's focus as it is from the lens's front focus
  const shift = L.flat ? 0 : L.fThin - L.ffdFor(back);
  const Rm = isFinite(B.R) ? B.R + shift : Infinity;
  const base = { w: B.w, a: L.a, lam, T: L.T, path: r => L.path(r, 0) };
  const ref = steerField(Object.assign({ R: Rm, yh: 0, sb: 0 }, base));
  const act = steerField(Object.assign({ R: Rm, yh: ly, sb }, base));
  // the feed's direction seen from the lens: its wavefront's centre (the horn), or the way a plane wave comes
  const cb = Math.sqrt(1 - sb * sb), feed = isFinite(Rm) ? Math.atan2(ly - Rm * sb, Rm * cb) * 180 / Math.PI : -Math.asin(sb) * 180 / Math.PI;
  // the scan: the horn moved across, kept as far from the lens and aimed at its centre
  const span = Math.min(45, Math.max(20, 1.5 * Math.abs(feed))), curve = [];
  if (isFinite(Rm)) for (let i = 0; i <= 15; i++) {
    const fa = span * i / 15, S = steerField(Object.assign({ R: Rm, yh: 0, sb: -Math.sin(fa * Math.PI / 180) }, base));
    curve.push({ feed: fa, beam: -S.beam, loss: 10 * Math.log10(S.G / ref.G), lobe: S.lobe });
  }
  return memo.set({ feed, beam: act.beam, loss: 10 * Math.log10(act.G / ref.G), lobe: act.lobe, refLobe: ref.lobe, curve, back, th: act.th, g: act.g, Gref: ref.G });
}
