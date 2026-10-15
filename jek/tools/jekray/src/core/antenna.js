import { besselJ01 } from '../engines/field.js';
import { lastTrace } from '../engines/trace.js';
import { beamAt } from './beams-hom.js';
import { absorbAt, refIndex } from './glass.js';
import { hornLam } from './rf.js';
import { hornPattern } from './horns.js';
import { grinDesign, normGrin } from './grin.js';
import { getEl } from '../state/elements.js';

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
export function lensAntenna({ w, R, a, lam, T }) {
  const N = 400, dr = a / N, k = 2 * Math.PI / lam, invR = isFinite(R) && R ? 1 / R : 0;
  const rs = [], er = [], ei = [], amp = [];
  let Pa = 0, Pa0 = 0, Sr = 0, Si = 0, S0 = 0;
  for (let i = 0; i < N; i++) {
    const r = (i + 0.5) * dr, g = Math.exp(-r * r / (w * w)), t = T ? Math.sqrt(Math.max(0, T(r))) : 1;
    const A = g * t, ph = -k * r * r * invR / 2, dA = 2 * Math.PI * r * dr;
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
  // the pattern, out to a few beamwidths
  const tMax = Math.min(60, Math.max(3, 8 * (lam / (2 * a)) * 180 / Math.PI)), M = 241;
  const th = [], P = [];
  for (let j = 0; j < M; j++) {
    const t = tMax * j / (M - 1), s = Math.sin(t * Math.PI / 180), ob = (1 + Math.cos(t * Math.PI / 180)) / 2;
    let re = 0, im = 0;
    for (let i = 0; i < N; i++) { const J = besselJ01(k * rs[i] * s)[0] * 2 * Math.PI * rs[i] * dr; re += er[i] * J; im += ei[i] * J; }
    th.push(t); P.push((re * re + im * im) * ob * ob);
  }
  const peak = P[0], db = P.map(v => 10 * Math.log10(Math.max(v, 1e-30) / peak));
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
/* The lens antenna an RF lens on the bench makes with the horn that feeds it: from the strongest
   traced beam leaving the lens (into air), the lens's own loss at each radius (a solid lens's
   faces and the glass its thickness there holds; a graded-index lens's design), and the horn's
   own directivity to compare. Null when no RF beam leaves the lens. */
const antMemo = new WeakMap();
export function lensAntennaOf(el) {
  const T0 = lastTrace;
  let byEl = antMemo.get(T0);
  if (!byEl) { byEl = new Map(); antMemo.set(T0, byEl); }
  const key = el.id + '|' + JSON.stringify([el.diameter, el.length, el.surfaces, el.gaps, el.materials, el.grin]);
  if (byEl.has(key)) return byEl.get(key);
  let best = null;
  for (const b of T0.beams || []) {
    const s = b.ev && b.ev.surf;
    if (!s || !s.el || s.el.id !== el.id || !(b.nm > 1e5) || !(b.qi > 0) || b.n > 1.0001) continue;
    if (!best || b.w > best.w) best = b;
  }
  let out = null;
  const B = best && beamAt(best.qr, best.qi, best.n, best.nm);
  if (B && B.w > 0) {
    const lam = best.nm * 1e-6, a = (el.grin ? el.length : el.diameter) / 2;
    let T = null;
    if (el.grin) {
      const D = grinDesign(normGrin(el.grin), el.length);
      if (D.usable) T = r => { const L = D.lossDb(r); return 10 ** (-(L.abs + L.refl) / 10); };
    } else if (el.surfaces && el.surfaces.length === 2 && el.materials && el.materials.length === 1) {
      const m = el.materials[0], n = refIndex(m, best.nm), alpha = absorbAt(m, best.nm), t0 = (el.gaps || [0])[0] || 0;
      const faceT = el.surfaces.map(s => { const c = s.coat || { mode: 'bare' }; return 1 - (c.mode === 'bare' || !c.mode ? ((n - 1) / (n + 1)) ** 2 : (c.R || 0) / 100); });
      T = r => faceT[0] * faceT[1] * Math.exp(-alpha * Math.max(0, t0 + faceSag(el.surfaces[1], r) - faceSag(el.surfaces[0], r)));
    }
    const A = lensAntenna({ w: B.w, R: B.R, a, lam, T });
    const src = getEl(best.src), horn = src && src.mmw && src.mmw.kind ? hornPattern(src.mmw.kind, src.mmw.a, src.mmw.L, hornLam(src)) : null;
    const ff = 2 * (2 * a) ** 2 / lam;                       // the far field begins about here
    const focus = B.waistDist > 0 && isFinite(B.waistDist) ? B.waistDist : null;
    out = Object.assign(A, { w: B.w, R: B.R, a, lam, hornDbi: horn ? horn.dir : null, horn, farField: ff, focus });
  }
  byEl.set(key, out);
  return out;
}
