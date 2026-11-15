"""Temperature tuning of second-harmonic generation in a poled MgO:LiNbO3 crystal.

The harmonic of a Gaussian beam in a crystal of length L goes as Boyd and Kleinman's focusing
function h(sigma, xi, mu) (J. Appl. Phys. 39, 3597 (1968)),
    h = |integral from -xi(1 - mu) to xi(1 + mu) of exp(i sigma t) / (1 + i t) dt|^2 / (4 xi),
sigma = b dk / 2, dk = 2 k1 + K - k2 with K = 2 pi / Lambda the poling's grating vector,
b = 2 n1 zR the confocal parameter inside (zR the beam's Rayleigh range in air), xi = L / b and
mu = (L - 2 f) / L for a waist f from the entrance face. The indices are Gayer et al.'s
extraordinary index of 5% MgO-doped congruent LiNbO3 against wavelength and temperature
(O. Gayer, Z. Sacks, E. Galun and A. Arie, Appl. Phys. B 91, 343-348 (2008)). With the
period fixed, the temperature moves dk, and the harmonic traces out the crystal's tuning curve:
its peak and its full width at half maximum are worked out here. The grating's own thermal
expansion is left out (as in JEKray).

20 mm of crystal, 1064 nm focused loosely (waist 75 um in air, placed so the waist inside sits
at the crystal's centre at 70 C), poling period 6.90 um.

    python ppln_tuning.py
"""
import json, math, os
import numpy as np
from scipy.integrate import quad
from scipy.optimize import minimize_scalar, brentq

NM, L, W0_AIR, PERIOD, T0 = 1064.0, 20e-3, 75e-6, 6.90e-6, 70.0

def n_e(um, T):
    f = (T - 24.5) * (T + 570.82)
    l2 = um * um
    return math.sqrt(5.756 + 2.860e-6 * f + (0.0983 + 4.700e-8 * f) / (l2 - (0.2020 + 6.113e-8 * f) ** 2)
                     + (189.32 + 1.516e-4 * f) / (l2 - 12.52 ** 2) - 1.32e-2 * l2)

lam = NM * 1e-9
zR = math.pi * W0_AIR ** 2 / lam
s_air = L / 2 / n_e(NM / 1000, T0)             # the air waist this far past the entrance face

def h_of(sigma, xi, mu):
    a, b = -xi * (1 - mu), xi * (1 + mu)
    re = quad(lambda t: (math.cos(sigma * t) + t * math.sin(sigma * t)) / (1 + t * t), a, b, epsabs=1e-13, epsrel=1e-12, limit=200)[0]
    im = quad(lambda t: (math.sin(sigma * t) - t * math.cos(sigma * t)) / (1 + t * t), a, b, epsabs=1e-13, epsrel=1e-12, limit=200)[0]
    return (re * re + im * im) / (4 * xi)

def at(T):
    n1, n2 = n_e(NM / 1000, T), n_e(NM / 2000, T)
    k1, k2 = 2 * math.pi * n1 / lam, 2 * math.pi * n2 / (lam / 2)
    b = 2 * n1 * zR
    xi = L / b
    mu = (L - 2 * n1 * s_air) / L
    sigma = b * (2 * k1 + 2 * math.pi / PERIOD - k2) / 2
    return h_of(sigma, xi, mu), sigma, xi, mu

# the plane-wave phase-matching temperature, for orientation
Tpw = brentq(lambda T: 2 * n_e(NM / 1000, T) / lam + 1 / PERIOD - 2 * n_e(NM / 2000, T) / lam, 20, 200)
r = minimize_scalar(lambda T: -at(T)[0], bracket=(Tpw - 1, Tpw, Tpw + 1), tol=1e-10)
Tpk, hpk = r.x, at(r.x)[0]
lo = brentq(lambda T: at(T)[0] - hpk / 2, Tpk - 10, Tpk)
hi = brentq(lambda T: at(T)[0] - hpk / 2, Tpk, Tpk + 10)
fw = hi - lo
Ts = list(np.linspace(Tpk - 2.5 * fw, Tpk + 2.5 * fw, 101))
curve = [at(T)[0] / hpk for T in Ts]
_, s_pk, xi_pk, mu_pk = at(Tpk)
out = {'source': 'Boyd and Kleinman (1968), h by adaptive quadrature; Gayer et al., Appl. Phys. B 91, 343 (2008), the MgO:LiNbO3 index',
       'nm': NM, 'L_mm': L * 1e3, 'w0_air_mm': W0_AIR * 1e3, 'period_um': PERIOD * 1e6, 'T_focus_C': T0,
       'waist_in_air_from_face_mm': s_air * 1e3, 'T_planewave_C': Tpw, 'T_peak_C': Tpk, 'h_peak': hpk, 'sigma_peak': s_pk,
       'xi_peak': xi_pk, 'mu_peak': mu_pk, 'fwhm_C': fw, 'T_half_C': [lo, hi], 'T_C': Ts, 'rel': curve}
print({k: v for k, v in out.items() if k not in ('T_C', 'rel')})
with open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'ppln-tuning.json'), 'w') as f:
    json.dump(out, f, indent=1)
