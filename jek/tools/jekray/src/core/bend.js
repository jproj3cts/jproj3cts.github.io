/* Bend loss in single-mode fibre: a fibre wound round a radius R loses light from its fundamental mode, the more the
   tighter the bend and the longer the wavelength. Marcuse's formula for a step-index fibre's LP01 mode (D. Marcuse,
   "Curvature loss formula for optical fibers", J. Opt. Soc. Am. 66, 216 (1976)), its power lost per metre of bend:

     alpha = sqrt(pi) kappa^2 exp(-2 gamma^3 R / (3 beta^2)) / (2 gamma^(3/2) V^2 sqrt(R) K1(gamma a)^2)

   with the core's radius a and numerical aperture NA, V = k a NA, the mode's normalised constant b from V (Rudolph and
   Neumann's fit, good for 1.5 < V < 2.5), beta^2 = k^2 (n2^2 + b NA^2), kappa^2 = n1^2 k^2 - beta^2 (in the core) and
   gamma^2 = beta^2 - n2^2 k^2 (in the cladding). Standard single-mode fibre (SMF-28: a 4.1 um, NA 0.13 effective) is taken for
   every kind but multimode, whose bend loss is not modelled. Checked against Corning's figures: test/node/physics-fibre.test.mjs. */
export const BEND_FIBRE = { a: 4.1e-6, na: 0.13, n2: 1.444 };      // SMF-28's core; its NA the effective one that matches Corning's bend figures (0.14 is the datasheet's)

// the modified Bessel function K1 (Abramowitz and Stegun 9.8.3, 9.8.7, 9.8.8: to about 1e-7)
export function besselK1(x) {
  if (!(x > 0)) return Infinity;
  if (x <= 2) {
    const t = x / 3.75, t2 = t * t;
    const I1 = x * (0.5 + t2 * (0.87890594 + t2 * (0.51498869 + t2 * (0.15084934 + t2 * (0.02658733 + t2 * (0.00301532 + t2 * 0.00032411))))));
    const y = (x / 2) * (x / 2);
    return (x * Math.log(x / 2) * I1 + 1 + y * (0.15443144 + y * (-0.67278579 + y * (-0.18156897 + y * (-0.01919402 + y * (-0.00110404 + y * -0.00004686)))))) / x;
  }
  const z = 2 / x;
  return Math.exp(-x) / Math.sqrt(x) * (1.25331414 + z * (0.23498619 + z * (-0.0365562 + z * (0.01504268 + z * (-0.00780353 + z * (0.00325614 + z * -0.00068245))))));
}

/* dB lost in one turn round a radius R (mm) at a wavelength (nm), for a fibre { a (m), na, n2 } */
export function bendDbPerTurn(Rmm, nm, fib = BEND_FIBRE) {
  if (!(Rmm > 0) || !(nm > 0)) return 0;
  const k = 2 * Math.PI / (nm * 1e-9), a = fib.a, NA = fib.na, n2 = fib.n2, n1 = Math.sqrt(n2 * n2 + NA * NA), V = k * a * NA;
  if (V < 0.8) return Infinity;                                    // the mode barely guided: all of it goes in a bend
  const b = Math.max(1e-6, Math.min(1, (1.1428 - 0.996 / V) ** 2));
  const beta2 = k * k * (n2 * n2 + b * NA * NA), kappa = Math.sqrt(Math.max(0, n1 * n1 * k * k - beta2)), gamma = Math.sqrt(Math.max(1e-30, beta2 - n2 * n2 * k * k));
  const R = Rmm * 1e-3, K = besselK1(gamma * a);
  const alpha = Math.sqrt(Math.PI) * kappa * kappa * Math.exp(-2 * gamma ** 3 * R / (3 * beta2)) / (2 * gamma ** 1.5 * V * V * Math.sqrt(R) * K * K);
  return 10 / Math.LN10 * alpha * 2 * Math.PI * R;
}
/* a fibre link's bend loss (dB) at a wavelength: its bendR (mm) wound turns times; none for multimode or no bend */
export function fibreBendDb(F, nm) {
  if (!F || !(F.bendR > 0) || F.ftype === 'mm') return 0;
  const n = F.turns > 0 ? F.turns : 1;
  return Math.min(300, n * bendDbPerTurn(F.bendR, nm));
}
