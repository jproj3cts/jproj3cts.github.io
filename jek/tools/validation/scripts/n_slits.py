"""The Fraunhofer pattern of N slits: principal maxima, the zeros between them and the envelope.

N = 2, 5 and 10 slits, each 0.05 mm wide, 0.2 mm apart centre to centre, long out of the
plane, lit by a Gaussian beam (633 nm, waist 4 mm on the slits, 1 mW) and focused by an ideal
lens of focal length f = 200 mm; the pattern in its focal plane. There the field is the
Fourier transform of the light leaving the slits (Born and Wolf, Principles of Optics,
section 8.6; Goodman, Introduction to Fourier Optics, ch. 4):
    I(x, 0) = (2 P / (lambda f)^2) |sum_n int_slit_n exp(-xi^2 / w0^2) exp(-2 pi i x xi / (lambda f)) dxi|^2,
the beam's own focus out of the plane giving the factor sqrt(pi) w0 once more. Each slit's
integral is done by Gauss-Legendre quadrature. For an evenly lit grating the textbook form
    I = I(0) [sin(pi a u) / (pi a u)]^2 [sin(N pi d u) / (N sin(pi d u))]^2,  u = x / (lambda f),
puts the principal maxima at x = m lambda f / d (0.633 mm), the zeros beside each at
lambda f / (N d) from it, and the envelope's first zero at lambda f / a (2.532 mm); the
script checks the quadrature against it with the beam made very wide.

    python n_slits.py
"""
import json, math, os
import numpy as np
from scipy.optimize import brentq, minimize_scalar

lam, w0, P, a, d, f = 633e-6, 4.0, 1.0, 0.05, 0.2, 200.0
xg, wg = np.polynomial.legendre.leggauss(64)


def amp(x, N, w=w0):
    """the 1D integral over the slits at focal-plane positions x (an array)"""
    x = np.atleast_1d(x)
    kap = 2 * math.pi * x / (lam * f)
    tot = np.zeros_like(x, dtype=complex)
    for n in range(N):
        c = (n - (N - 1) / 2) * d
        xi = c + 0.5 * a * xg
        g = np.exp(-xi ** 2 / w ** 2) * 0.5 * a * wg
        tot += np.exp(-1j * np.outer(kap, xi)) @ g
    return tot


def I(x, N, w=w0):
    return 2 * P / (lam * f) ** 2 * np.abs(amp(x, N, w)) ** 2


# the quadrature against the textbook form, the beam very wide
for N in (2, 5, 10):
    xs = np.linspace(-3, 3, 3001)
    u = xs / (lam * f)
    with np.errstate(invalid='ignore', divide='ignore'):
        env = np.where(u == 0, 1, np.sinc(a * u) ** 2)
        s = np.sin(math.pi * d * u)
        arr = np.where(np.abs(s) < 1e-12, 1.0, (np.sin(N * math.pi * d * u) / (N * np.where(np.abs(s) < 1e-12, 1, s))) ** 2)
    tb = env * arr
    q = np.abs(amp(xs, N, 1e9)) ** 2
    assert np.max(np.abs(q / q[1500] - tb)) < 1e-9, N

out = {'lambda_nm': 633, 'w0_mm': w0, 'P_mW': P, 'a_mm': a, 'd_mm': d, 'f_mm': f, 'env_zero_mm': lam * f / a, 'cases': []}
x = np.round(np.arange(0, 2.7 + 1e-9, 0.0005), 6)
for N in (2, 5, 10):
    Iz = I(x, N)
    I0 = float(I(0.0, N)[0])
    # the first principal maximum (m = 1) and the first zero beside the centre, on this beam's pattern
    g = lam * f / d
    m1 = minimize_scalar(lambda t: -I(t, N)[0], bounds=(0.9 * g, 1.1 * g), method='bounded', options={'xatol': 1e-10}).x
    z0 = lam * f / (N * d)
    zero = minimize_scalar(lambda t: I(t, N)[0], bounds=(0.7 * z0, 1.3 * z0), method='bounded', options={'xatol': 1e-10}).x
    out['cases'].append({'N': N, 'I0': I0, 'max1_mm': float(m1), 'I_max1': float(I(m1, N)[0]), 'zero1_mm': float(zero), 'I_zero1': float(I(zero, N)[0]),
                         'x_mm': x.tolist(), 'I': [float('%.7g' % v) for v in Iz]})
    print('N = %2d: peak %.5f mW/mm^2; m = 1 at %.6f mm (%.4f of the peak); first zero %.6f mm (%.2e of the peak)' % (N, I0, m1, I(m1, N)[0] / I0, zero, I(zero, N)[0] / I0))

with open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'n-slits.json'), 'w') as fh:
    json.dump(out, fh, separators=(',', ':'))
