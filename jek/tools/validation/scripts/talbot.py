"""The Talbot effect: a grating's self-image, from the three beams a sinusoidal grating makes.

Lord Rayleigh (Phil. Mag. 11, 196 (1881)) explained Talbot's 1836 observation: light through a
grating of period d repeats the grating's image at the distance z_T = 2 d^2 / lambda, and half
way there shows it again shifted by half a period. A sinusoidal amplitude grating,
t(x) = 1/2 + 1/2 cos(2 pi x / d), passes exactly three orders (J. W. Goodman, Introduction to
Fourier Optics, ch. 4, works this case), so behind it the field is three Gaussian beams:
the zeroth order with amplitude 1/2 and the first orders with 1/4 each, tilted by
+-lambda/d. Each is propagated here in closed form (the paraxial Gaussian beam, its waist on
the grating), and the three are added as fields. The beam: 633 nm, waist 3 mm on the
grating, 1 mW; the grating d = 0.2 mm, so z_T = 126.38 mm. The orders walk apart by
lambda z / d (0.4 mm at z_T), which is why the image there is a little short of perfect.

    python talbot.py
"""
import json, math, os
import numpy as np

lam, w0, P, d = 633e-6, 3.0, 1.0, 0.2           # mm, mm, mW, mm
k, zR = 2 * math.pi / lam, math.pi * w0 ** 2 / lam
zT = 2 * d * d / lam                              # Rayleigh's formula
I0 = 2 * P / (math.pi * w0 ** 2)                  # the free beam's peak irradiance, mW/mm^2


def field(x, z):
    """the grating's field at x (mm) a distance z behind it, in units of the free beam's peak amplitude"""
    q = z + 1j * zR
    u = 0j
    for c, m in ((0.5, 0), (0.25, 1), (0.25, -1)):
        a = m * lam / d                            # the order's angle (paraxial)
        xs = x - a * z                             # its centre has walked across by a z
        u = u + c * (1j * zR / q) * np.exp(-1j * k * xs * xs / (2 * q)) * np.exp(1j * k * (a * x - a * a * z / 2))
    return u


def I(x, z):
    u = field(x, z)
    return I0 * (u * np.conj(u)).real


# checks of the closed form: at z = 0 it is the grating times the beam; with the beam made very
# wide, the plane-wave result 1/2 + 1/2 cos(2 pi x/d) exp(-i pi lambda z/d^2) (Goodman's)
xs = np.linspace(-1, 1, 2001)
assert np.max(np.abs(I(xs, 0) - I0 * np.exp(-2 * xs ** 2 / w0 ** 2) * (0.5 + 0.5 * np.cos(2 * np.pi * xs / d)) ** 2)) < 1e-12
zR_save = zR
zR = 1e12
for z in (zT / 4, zT / 2, zT):
    pw = 0.5 + 0.5 * np.cos(2 * np.pi * xs / d) * np.exp(-1j * math.pi * lam * z / d ** 2)
    assert np.max(np.abs(field(xs, z) - pw)) < 1e-6
zR = zR_save

out = {'lambda_nm': 633, 'w0_mm': w0, 'P_mW': P, 'd_mm': d, 'zT_mm': zT, 'I0': I0, 'planes': []}
x = np.round(np.arange(-1.2, 1.2 + 1e-9, 0.001), 6)
for frac in (0.25, 0.5, 0.75, 1.0):
    z = frac * zT
    Iz = I(x, z)
    # the bright line nearest the axis on its + side (0 itself where it is bright), by golden section on the closed form
    f = lambda v: -I(v, z)
    cands = [0.0, d / 2]
    best = max(cands, key=lambda c: I(c, z))
    lo, hi = best - d / 4, best + d / 4
    for _ in range(200):
        m1, m2 = lo + 0.382 * (hi - lo), lo + 0.618 * (hi - lo)
        if f(m1) < f(m2): hi = m2
        else: lo = m1
    out['planes'].append({'frac': frac, 'z_mm': z, 'bright_mm': 0.5 * (lo + hi), 'I_bright': float(I(0.5 * (lo + hi), z)),
                          'I_axis': float(I(0.0, z)), 'x_mm': x.tolist(), 'I': [float('%.7g' % v) for v in Iz]})

with open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'talbot.json'), 'w') as fh:
    json.dump(out, fh, separators=(',', ':'))
print('z_T = %.4f mm' % zT)
for p in out['planes']:
    print('%.2f z_T: bright line at %.5f mm, I there %.5f, on the axis %.5f (I0 %.5f)' % (p['frac'], p['bright_mm'], p['I_bright'], p['I_axis'], I0))
