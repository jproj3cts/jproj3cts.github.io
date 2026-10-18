import { besselJ01 } from '../core/special.js';

/* ---------- Closed forms for a lens antenna, to check the bench's against ----------
   The panels' figures come from the bench's own diffracted field (engines/antenna-field.js). These
   take a Gaussian beam and a lens given as a path and a loss at each radius, and give the same
   figures from first principles; the tests hold the two together.

   A lens antenna: a feed horn's beam through an RF lens, seen from far away.
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
