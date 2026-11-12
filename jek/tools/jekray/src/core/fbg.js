/* A fibre Bragg grating by coupled-mode theory (T. Erdogan, "Fiber grating spectra", J. Lightwave Technol. 15,
   1277 (1997)). The core's index is modulated along z with period Lambda, n(z) = neff + v dn cos(2 pi z / Lambda),
   which couples the forward mode to the backward one. With the detuning and the coupling

     sigma = 2 pi neff (1/lambda - 1/lambda_B),   kappa = pi v dn / lambda,   lambda_B = 2 neff Lambda

   (neff the mean effective index in the grating, the index change's average included, so that lambda_B is where it
   reflects most), a uniform grating of length L has, with gamma^2 = kappa^2 - sigma^2,

     rho = -kappa sinh(gamma L) / (sigma sinh(gamma L) + i gamma cosh(gamma L))       (Erdogan's eq. 14)
     tau = i gamma / (sigma sinh(gamma L) + i gamma cosh(gamma L))

   between its two ends: |rho|^2 = tanh^2(kappa L) at lambda_B, zeros where gamma L = i m pi, |rho|^2 + |tau|^2 = 1.
   rho / tau is imaginary, so the same rho from either end with tau both ways is a lossless, reciprocal two-port.
   The phases are from one end to the other of a grating a whole even number of periods long and symmetric about its
   middle; off the band tau is exp(i sigma L), a length L of fibre.

   An apodised or chirped grating is M uniform sections, each with its own kappa (the profile at its middle) and its
   own Bragg wavelength (lambda_B + chirp z, z from the middle), their transfer matrices multiplied (Erdogan's eq. 39).
   The mean index is the same all along it.

   Erdogan writes a wave as exp(i (beta z - omega t)); the fibre network writes it exp(-i k n L) (see engines/fibre.js),
   so what is handed on is the conjugate. Lengths are in mm, wavelengths in nm. Checked against the closed forms and a
   numerical integration of the coupled-mode equations: test/node/physics-fbg.test.mjs, tools/validation. */
export const FBG_APODS = ['none', 'gauss', 'cos'];
const FBG_C_MM_FS = 2.99792458e-4;                 // light, mm per fs
/* the grating's numbers, clamped: Bragg wavelength (nm), length (mm), index modulation, fringe visibility, mean
   effective index, chirp (nm of Bragg wavelength per cm along it), apodisation */
const fbgOf = el => ({ lb: Math.min(20000, Math.max(100, +el.centre || 1550)), L: Math.min(1000, Math.max(0.01, +el.len || 0)), dn: Math.min(0.05, Math.max(0, +el.dn || 0)),
  vis: Math.min(1, Math.max(0, el.vis === undefined ? 1 : +el.vis || 0)), n: Math.min(4, Math.max(1, +el.neff || 1.468)), chirp: Math.min(100, Math.max(-100, +el.chirp || 0)) * 0.1,
  apod: FBG_APODS.includes(el.apod) ? el.apod : 'none' });
/* the coupling's profile along the grating, u = z / L from -1/2 to 1/2: uniform; a Gaussian whose full width at half
   maximum is half the length (1/16 at the ends); a raised cosine (nothing at the ends) */
export const fbgProfile = (apod, u) => apod === 'gauss' ? Math.exp(-16 * Math.LN2 * u * u) : apod === 'cos' ? 0.5 * (1 + Math.cos(2 * Math.PI * u)) : 1;
/* the sections an apodised or chirped grating is cut into: enough that the detuning steps by little from one to the next */
const fbgSections = g => Math.round(Math.min(1000, Math.max(100, g.L * Math.sqrt(2 * Math.PI * g.n * Math.abs(g.chirp) * 1e-6 / (g.lb * g.lb * 1e-12) / 0.02))));
/* one uniform section's matrix [[a, b], [b*, a*]] taking (forward, backward) at its far end to its near end, in
   Erdogan's convention: a = cosh(gamma dz) - i sigma sinh(gamma dz) / gamma, b = -i kappa sinh(gamma dz) / gamma.
   Returns [a re, a im, b im] (b is imaginary) */
function fbgSection(sig, kap, dz) {
  const g2 = kap * kap - sig * sig, g = Math.sqrt(Math.abs(g2)), x = g * dz;
  const C = g2 >= 0 ? Math.cosh(x) : Math.cos(x), S = x < 1e-6 ? dz : (g2 >= 0 ? Math.sinh(x) : Math.sin(x)) / g;
  return [C, -sig * S, -kap * S];
}
/* The grating's amplitude reflection from each end (r1, r2) and its transmission (t) at a wavelength, complex
   [re, im], in the network's convention. dk: a step in the wavenumber 2 pi / lambda (1/mm) past that wavelength,
   added to the detuning itself, so that a small step is not lost in the wavelength's rounding */
export function fbgRT(el, nm, dk = 0) {
  const g = fbgOf(el), lam = 1 / (1e6 / nm + dk / (2 * Math.PI)), kap = Math.PI * g.vis * g.dn / lam, off = g.n * dk, sig0 = 2 * Math.PI * g.n * (1e6 / nm - 1e6 / g.lb) + off;
  if (g.apod === 'none' && g.chirp === 0) {
    const g2 = kap * kap - sig0 * sig0, q = Math.sqrt(Math.abs(g2)), x = q * g.L;
    let T, sech;                                 // tanh(gamma L) / gamma and 1 / cosh(gamma L), finite however strong the grating
    if (g2 >= 0) { T = x < 1e-6 ? g.L : Math.tanh(x) / q; sech = 1 / Math.cosh(x); }
    else {
      const C = Math.cos(x), S = x < 1e-6 ? g.L : Math.sin(x) / q, d = C * C + sig0 * sig0 * S * S;
      // tau = 1 / (C - i sigma S), rho = i kappa S tau; conjugated
      return { r1: [-kap * S * sig0 * S / d, -kap * S * C / d], r2: [-kap * S * sig0 * S / d, -kap * S * C / d], t: [C / d, -sig0 * S / d] };
    }
    const d = 1 + sig0 * sig0 * T * T, r = [-kap * T * sig0 * T / d, -kap * T / d];
    return { r1: r, r2: r.slice(), t: [sech / d, -sech * sig0 * T / d] };
  }
  // piecewise uniform: F = F_M ... F_1 from the far end to the near, each [[a, b], [b*, a*]]
  const M = fbgSections(g), dz = g.L / M;
  let ar = 1, ai = 0, br = 0, bi = 0;
  for (let i = M - 1; i >= 0; i--) {
    const u = (i + 0.5) / M - 0.5, lbz = g.lb * 1e-6 + g.chirp * 1e-6 * u * g.L;
    const [c, s, k] = fbgSection(2 * Math.PI * g.n * (1e6 / nm - 1 / lbz) + off, kap * fbgProfile(g.apod, u), dz);
    // (a', b') = F_i (a, b): F_i = [[c + i s, i k], [-i k, c - i s]] on the left of what is behind it
    const nar = c * ar - s * ai + k * bi, nai = c * ai + s * ar + k * br, nbr = c * br - s * bi + k * ai, nbi = c * bi + s * br + k * ar;
    ar = nar; ai = nai; br = nbr; bi = nbi;
  }
  // F = [[a, b], [b*, a*]]: rho1 = F21 / F11 = b* / a, rho2 = -F12 / F11 = -b / a, tau = 1 / a; conjugated
  const d = ar * ar + ai * ai;
  return { r1: [(br * ar - bi * ai) / d, (br * ai + bi * ar) / d], r2: [-(br * ar + bi * ai) / d, (bi * ar - br * ai) / d], t: [ar / d, ai / d] };
}
/* The same with each one's group delay, as mm of path in vacuum (c tau, tau = -d(phase)/d(omega) in the network's
   convention), and its group delay dispersion (fs^2), from the phase at three wavelengths a little apart */
export function fbgAt(el, nm) {
  const g = fbgOf(el), dk = 1e-3 / (g.n * g.L);
  const A = fbgRT(el, nm), P = fbgRT(el, nm, dk), Q = fbgRT(el, nm, -dk);
  const out = {};
  for (const key of ['r1', 'r2', 't']) {
    const z = A[key], ph = w => Math.atan2(w[1] * z[0] - w[0] * z[1], w[0] * z[0] + w[1] * z[1]), p = ph(P[key]), q = ph(Q[key]);
    out[key] = { z, dl: -(p - q) / (2 * dk), gdd: -(p + q) / (dk * dk) / (FBG_C_MM_FS * FBG_C_MM_FS) };
  }
  return out;
}
/* What the panel shows of a grating: kappa L (the coupling summed along it, at the Bragg wavelength), its peak
   reflectance and where, the band between the first zeros either side (a uniform grating's:
   lambda_B^2 sqrt((kappa L)^2 + pi^2) / (pi neff L)), its full width at half the peak, the period, and the delay of
   the reflection at the peak (ps). An apodised or chirped grating's peak and width are read off its spectrum. */
let fbgBandMemo = { key: null, band: null };
export function fbgBand(el) {
  const g = fbgOf(el), key = JSON.stringify(g);
  if (fbgBandMemo.key === key) return fbgBandMemo.band;
  const plain = g.apod === 'none' && g.chirp === 0, M = plain ? 1 : fbgSections(g);
  let kL = 0;
  for (let i = 0; i < M; i++) kL += Math.PI * g.vis * g.dn / (g.lb * 1e-6) * fbgProfile(g.apod, (i + 0.5) / M - 0.5) * g.L / M;
  const zeros = g.lb * g.lb * 1e-6 * Math.sqrt(kL * kL + Math.PI * Math.PI) / (Math.PI * g.n * g.L);
  const R = nm => { const r = fbgRT(el, nm).r1; return r[0] * r[0] + r[1] * r[1]; };
  // the spectrum across the band (a chirp spreads it), then the peak
  const half = 1.5 * (zeros + Math.abs(g.chirp) * g.L), N = 1200, xs = [], ys = [];
  for (let i = 0; i <= 2 * N; i++) { xs.push(g.lb + (i - N) / N * half); ys.push(R(xs[i])); }
  let im = N; if (g.chirp !== 0) for (let i = 0; i <= 2 * N; i++) if (ys[i] > ys[im]) im = i;
  // out from the peak to where it first falls below half of it
  const peak = ys[im], cross = step => {
    for (let i = im + step; i >= 0 && i <= 2 * N; i += step) if (ys[i] < peak / 2) {
      let a = xs[i - step], b = xs[i];
      for (let k = 0; k < 40; k++) { const m = 0.5 * (a + b); if (R(m) >= peak / 2) a = m; else b = m; }
      return 0.5 * (a + b);
    }
    return xs[step > 0 ? 2 * N : 0];
  };
  const band = { kL, peak, at: xs[im], zeros: plain ? zeros : null, fwhm: peak > 0 ? cross(1) - cross(-1) : 0, period: g.lb / (2 * g.n),
    delay: peak > 0 ? fbgAt(el, xs[im]).r1.dl / FBG_C_MM_FS * 1e-3 : 0 };
  fbgBandMemo = { key, band };
  return band;
}
