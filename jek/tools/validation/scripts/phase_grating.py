"""A sinusoidal phase grating: the power in each diffracted order, J_n(beta)^2.

A grating that delays the light by a phase beta sin(2 pi x / d) and absorbs nothing sends
it into orders n at angles n lambda / d, each with the share J_n(beta)^2 of the power
(the Jacobi-Anger expansion, exp(i beta sin u) = sum_n J_n(beta) exp(i n u); J. W. Goodman,
Introduction to Fourier Optics, chapter 4, the sinusoidal phase grating). At beta = 2.405
the zeroth order vanishes, at beta = 3.832 the first orders do.

The bench: a Gaussian beam at 633 nm, waist 0.5 mm on the grating, 1 mW; d = 0.2 mm; the
light 1000 mm on, where neighbouring orders are 3.17 mm apart and each is 0.64 mm in radius.
Behind the grating each order is a Gaussian beam tilted by n lambda / d with amplitude
J_n(beta); the reference adds them (n from -20 to 20) as fields in closed form, as the
Talbot case does, and integrates the irradiance across the plane of the bench within each
order's stretch (half way to its neighbours), over the same integral for the beam with no
grating. That share is J_n(beta)^2 less the little that spills past the stretch's ends.

    python phase_grating.py
"""
import json, math, os
import numpy as np
from scipy.special import jv

lam, w0, d, z = 633e-6, 0.5, 0.2, 1000.0
k, zR = 2 * math.pi / lam, math.pi * w0 ** 2 / lam
sep = lam * z / d
x = np.linspace(-12.5 * sep, 12.5 * sep, 800001)
dx = x[1] - x[0]


def field(beta):
    q = z + 1j * zR
    u = np.zeros_like(x, dtype=complex)
    for n in range(-20, 21):
        a = n * lam / d
        xs = x - a * z
        u += jv(n, beta) * (1j * zR / q) * np.exp(-1j * k * xs * xs / (2 * q)) * np.exp(1j * k * (a * x - a * a * z / 2))
    return u


# the Jacobi-Anger shares sum to one
for beta in (1.0, 2.405, 3.832):
    assert abs(sum(jv(n, beta) ** 2 for n in range(-30, 31)) - 1) < 1e-12
free = np.abs(field(0.0)) ** 2
norm = free.sum() * dx
out = {'lambda_nm': 633, 'w0_mm': w0, 'd_mm': d, 'z_mm': z, 'sep_mm': sep, 'cases': []}
for beta, why in ((1.0, ''), (2.4048255577, 'the zeroth order vanishes'), (3.8317059702, 'the first orders vanish')):
    I = np.abs(field(beta)) ** 2
    assert abs(I.sum() * dx / norm - 1) < 1e-6           # all the light is on the plane
    orders = []
    for n in range(-5, 6):
        m = (x >= (n - 0.5) * sep) & (x < (n + 0.5) * sep)
        orders.append({'n': n, 'share': float(I[m].sum() * dx / norm), 'Jn2': float(jv(n, beta) ** 2)})
    out['cases'].append({'beta': beta, 'why': why, 'orders': orders})
    print('beta %.4f: ' % beta + ', '.join('%d: %.6f' % (o['n'], o['share']) for o in orders if o['n'] >= 0))

with open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'phase-grating.json'), 'w') as fh:
    json.dump(out, fh, indent=1)
