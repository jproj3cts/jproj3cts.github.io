"""Fresnel diffraction at a straight edge, from Fresnel's integrals.

A Gaussian beam (633 nm, waist 3 mm on the edge, 1 mW) half covered by a straight opaque
edge through its centre; the irradiance across the edge at 500 mm and 2000 mm behind it.

In the Fresnel approximation the edge only changes the field across it (x), so the
irradiance is the free beam's times |R(x)|^2, where R is the half-plane's integral over the
free one's. With the Gaussian amplitude exp(-xi^2 / w0^2) both are Gaussian integrals, and
    R(x) = erfc(s) / 2,   s = -i pi x / (lambda z) / sqrt(1 / w0^2 + i pi / (lambda z)),
with x measured into the lit side. For a plane wave (w0 -> infinity) R becomes Fresnel's
integrals, I / I0 = ((C(v) + 1/2)^2 + (S(v) + 1/2)^2) / 2 with v = x sqrt(2 / (lambda z))
(Born and Wolf, Principles of Optics, section 8.7), which the script checks. The positions
of the first maxima and minima are found on the Gaussian beam's own pattern, and given for
the plane wave too.

    python fresnel_edge.py
"""
import json, math, os
import numpy as np
from scipy.special import erfc, fresnel
from scipy.optimize import minimize_scalar

lam, w0, P = 633e-6, 3.0, 1.0
zR = math.pi * w0 ** 2 / lam


def ratio(x, z, w=w0):
    a = (1 / w ** 2 if w else 0) + 1j * math.pi / (lam * z)
    s = -1j * math.pi * x / (lam * z) / np.sqrt(a)
    return 0.5 * erfc(s)


def I(x, z):
    wz2 = w0 ** 2 * (1 + (z / zR) ** 2)
    free = 2 * P / (math.pi * wz2) * np.exp(-2 * x * x / wz2)
    r = ratio(x, z)
    return free * (r * np.conj(r)).real


# check: the plane-wave limit is Fresnel's integrals
for z in (500.0, 2000.0):
    xs = np.linspace(-2, 4, 601)
    v = xs * math.sqrt(2 / (lam * z))
    S, C = fresnel(v)
    fr = 0.5 * ((C + 0.5) ** 2 + (S + 0.5) ** 2)
    r = ratio(xs, z, w=None)
    assert np.max(np.abs((r * np.conj(r)).real - fr)) < 1e-9

# Born and Wolf's numbers for the plane wave: the first maximum and minimum in v
pw = lambda v: 0.5 * ((fresnel(v)[1] + 0.5) ** 2 + (fresnel(v)[0] + 0.5) ** 2)
v1 = minimize_scalar(lambda v: -pw(v), bracket=(1.0, 1.2, 1.5)).x
v2 = minimize_scalar(pw, bracket=(1.6, 1.9, 2.2)).x
out = {'lambda_nm': 633, 'w0_mm': w0, 'P_mW': P, 'plane_wave': {'v_max1': v1, 'I_max1': float(pw(v1)), 'v_min1': v2, 'I_min1': float(pw(v2))}, 'planes': []}

for z, lo, hi in ((500.0, -1.6, 2.1), (2000.0, -3.1, 4.1)):
    x = np.round(np.arange(lo, hi + 1e-9, 0.001), 6)
    Iz = I(x, z)
    scale = math.sqrt(lam * z / 2)
    turns = []
    # the first maximum, the first minimum and the second maximum, refined on the closed form
    for sign, guess in ((-1, v1), (1, v2), (-1, 2.34)):
        g = guess * scale
        r = minimize_scalar(lambda t: sign * I(t, z), bounds=(g - 0.3 * scale, g + 0.3 * scale), method='bounded', options={'xatol': 1e-9})
        turns.append({'x_mm': float(r.x), 'I': float(I(r.x, z)), 'v': float(r.x / scale)})
    wz2 = w0 ** 2 * (1 + (z / zR) ** 2)
    out['planes'].append({'z_mm': z, 'I_free0': 2 * P / (math.pi * wz2), 'fringe_scale_mm': scale, 'from_mm': lo + 0.1, 'to_mm': hi - 0.1,
                          'max1': turns[0], 'min1': turns[1], 'max2': turns[2], 'plane_wave_max1_mm': v1 * scale, 'plane_wave_min1_mm': v2 * scale,
                          'x_mm': x.tolist(), 'I': [float('%.7g' % v) for v in Iz]})

with open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'fresnel-edge.json'), 'w') as fh:
    json.dump(out, fh, separators=(',', ':'))
print('plane wave: first maximum v = %.4f, I/I0 = %.4f; first minimum v = %.4f, I/I0 = %.4f' % (v1, pw(v1), v2, pw(v2)))
for p in out['planes']:
    print('z = %g: max %.5f mm (%.5f), min %.5f mm (%.5f), max %.5f mm (%.5f); free %.5f' % (p['z_mm'], p['max1']['x_mm'], p['max1']['I'], p['min1']['x_mm'], p['min1']['I'], p['max2']['x_mm'], p['max2']['I'], p['I_free0']))
