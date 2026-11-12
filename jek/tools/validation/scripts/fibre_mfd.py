"""A step-index fibre's mode-field radius against V: Marcuse's formula and the exact mode.

D. Marcuse (Bell Syst. Tech. J. 56, 703 (1977)) fitted the Gaussian that best matches a
weakly guiding step-index fibre's fundamental mode (LP01), its 1/e^2 radius
    w / a = 0.65 + 1.619 V^-1.5 + 2.879 V^-6,   V = 2 pi a NA / lambda.
Here the exact LP01 mode is found independently: U and W from the eigenvalue equation
    U J1(U) / J0(U) = W K1(W) / K0(W),   U^2 + W^2 = V^2,
the field J0(U r / a) / J0(U) in the core and K0(W r / a) / K0(W) outside it; then the
Gaussian exp(-r^2 / w^2) whose overlap with it is greatest, by quadrature and a bounded
search. That is the width Marcuse's formula approximates; how far the formula is from it,
and what coupling the formula's Gaussian loses against the best one, are both given.

The fibre: core 8.2 um, NA 0.14; V from 1.2 to 2.4 by the wavelength.

    python fibre_mfd.py
"""
import json, math, os
import numpy as np
from scipy.optimize import brentq, minimize_scalar
from scipy.integrate import quad
from scipy.special import j0, j1, k0, k1

core, NA = 8.2, 0.14                     # um
a = core / 2


def lp01(V):
    f = lambda U: U * j1(U) / j0(U) - math.sqrt(V * V - U * U) * k1(math.sqrt(V * V - U * U)) / k0(math.sqrt(V * V - U * U))
    U = brentq(f, 1e-6, min(V, 2.404825557695773) - 1e-9)
    W = math.sqrt(V * V - U * U)
    psi = lambda r: j0(U * r / a) / j0(U) if r <= a else k0(W * r / a) / k0(W)
    return U, W, psi


def overlap(psi, w):
    g = lambda r: math.exp(-r * r / w ** 2)
    num = quad(lambda r: psi(r) * g(r) * r, 0, a, epsabs=0, epsrel=1e-13)[0] + quad(lambda r: psi(r) * g(r) * r, a, np.inf, epsabs=0, epsrel=1e-13)[0]
    nps = quad(lambda r: psi(r) ** 2 * r, 0, a, epsabs=0, epsrel=1e-13)[0] + quad(lambda r: psi(r) ** 2 * r, a, np.inf, epsabs=0, epsrel=1e-13)[0]
    ng = w * w / 4
    return num * num / (nps * ng)


marcuse = lambda V: a * (0.65 + 1.619 * V ** -1.5 + 2.879 * V ** -6)
rows = []
for V in (1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4):
    U, W, psi = lp01(V)
    best = minimize_scalar(lambda w: -overlap(psi, w), bounds=(0.5 * a, 4 * a), method='bounded', options={'xatol': 1e-10})
    wopt, wm = best.x, marcuse(V)
    eta_opt, eta_m = overlap(psi, wopt), overlap(psi, wm)
    nm = 2 * math.pi * a * NA / V * 1e3
    rows.append({'V': V, 'nm': nm, 'U': U, 'W': W, 'w_marcuse_um': wm, 'w_exact_um': wopt, 'fit_err': wm / wopt - 1,
                 'eta_best': eta_opt, 'eta_marcuse': eta_m, 'eta_tip': (2 * wm * wopt / (wm * wm + wopt * wopt)) ** 2})
    print('V %.1f (%.1f nm): U %.5f; w Marcuse %.5f um, exact best %.5f um (%+.3f%%); coupling to the exact mode %.6f, best %.6f' % (V, nm, U, wm, wopt, 100 * (wm / wopt - 1), eta_m, eta_opt))
out = {'core_um': core, 'na': NA, 'rows': rows}
with open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'fibre-mfd.json'), 'w') as fh:
    json.dump(out, fh, indent=1)
