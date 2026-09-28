"""Three classics of diffraction, from the Fresnel-Kirchhoff integral done independently.

1. Poisson's spot (predicted by Poisson from Fresnel's 1818 memoir as an absurdity, seen by
   Arago): a Gaussian beam (waist w0 at an opaque disc of radius a) keeps a bright spot on
   the axis behind the disc at every distance. In the Fresnel approximation the axial field
   behind the disc is the integral of exp(-r^2 (1/w0^2 - i k / 2z)) r dr from a outwards, the
   unobstructed one's from 0, so the axial intensity is exactly exp(-2 a^2 / w0^2) times the
   free beam's, 2P / (pi w(z)^2): here 6 mm beam, 1.5 mm disc, 633 nm (JEKray2D's example).

2. The Airy pattern (G. B. Airy, Trans. Camb. Phil. Soc. 5, 283 (1835)): a circular opening
   of radius a in a broad Gaussian beam (w0 = 20 mm, a = 2 mm), focused by an ideal lens of
   focal length f = 100 mm. In the focal plane
       U(r) = (k / f) int_0^a E0 exp(-rho^2 / w0^2) J0(k rho r / f) rho drho,
   E0^2 = 2P / (pi w0^2); integrated here by adaptive quadrature. The first dark ring is at
   1.22 lambda f / 2a for an evenly lit opening, a little further out for this one.

3. Young's double slit (T. Young, Phil. Trans. R. Soc. 94, 1 (1804)): slits 0.1 mm wide,
   0.5 mm apart centre to centre, lit by a 1.5 mm Gaussian beam, a screen 1 m away. The
   slits are long out of the plane, so across them the pattern is the one-dimensional
   Fresnel integral of the lit slits, done here by Gauss-Legendre quadrature over each.

    python diffraction_classics.py
"""
import json, math, os
import numpy as np
from scipy.integrate import quad
from scipy.special import j0

lam = 633e-6                                   # mm
k = 2 * math.pi / lam
out = {'lambda_nm': 633}

# 1. Poisson's spot
w0, a, P = 6.0, 1.5, 1.0
zR = math.pi * w0 ** 2 / lam
rows = []
for z in (250.0, 500.0, 1000.0, 2000.0, 5000.0):
    wz2 = w0 ** 2 * (1 + (z / zR) ** 2)
    Ifree = 2 * P / (math.pi * wz2)
    # the ratio from the integrals themselves, as a check of the closed form
    c = complex(1 / w0 ** 2, -k / (2 * z))
    ratio = abs(np.exp(-a * a * c)) ** 2
    assert abs(ratio - math.exp(-2 * a * a / w0 ** 2)) < 1e-12
    rows.append({'z_mm': z, 'I_free': Ifree, 'I_axis': Ifree * ratio, 'ratio': ratio, 'spot_radius_mm': 2.404825557695773 * z / (k * a)})
out['poisson'] = {'w0_mm': w0, 'a_mm': a, 'P_mW': P, 'rows': rows}

# 2. The Airy pattern
w0, a, f = 20.0, 2.0, 100.0
E0 = math.sqrt(2 * P / (math.pi * w0 ** 2))
U = lambda r: (k / f) * E0 * quad(lambda p: math.exp(-p * p / w0 ** 2) * j0(k * p * r / f) * p, 0, a, limit=400, epsabs=1e-14, epsrel=1e-12)[0]
rs = np.linspace(0, 0.08, 801)
I = np.array([U(r) ** 2 for r in rs])
# the first dark ring, refined
i0 = int(np.argmax(np.diff(np.sign([U(r) for r in rs])) != 0))
lo, hi = rs[i0], rs[i0 + 1]
for _ in range(80):
    m = 0.5 * (lo + hi)
    if np.sign(U(m)) == np.sign(U(lo)): lo = m
    else: hi = m
out['airy'] = {'w0_mm': w0, 'a_mm': a, 'f_mm': f, 'P_mW': P, 'I0': float(I[0]), 'first_zero_mm': 0.5 * (lo + hi),
               'uniform_first_zero_mm': 1.2196698912665045 * lam * f / (2 * a), 'r_mm': [round(float(r), 6) for r in rs], 'I': [float(v) for v in I]}

# 3. Young's double slit
w0, b, d, z = 1.5, 0.1, 0.5, 1000.0
xg, wg = np.polynomial.legendre.leggauss(400)
xs = np.linspace(-6, 6, 2401)
U = np.zeros_like(xs, dtype=complex)
for c in (-d / 2, d / 2):
    xi = c + xg * b / 2; wi = wg * b / 2
    E = np.exp(-xi ** 2 / w0 ** 2)
    U += (np.exp(1j * k * (xs[:, None] - xi[None, :]) ** 2 / (2 * z)) * (E * wi)[None, :]).sum(axis=1)
Iy = np.abs(U) ** 2
Iy /= Iy.max()
out['young'] = {'w0_mm': w0, 'slit_mm': b, 'sep_mm': d, 'z_mm': z, 'x_mm': [round(float(v), 6) for v in xs], 'I': [round(float(v), 7) for v in Iy],
                'fringe_mm': lam * z / d}
path = os.path.join(os.path.dirname(__file__), '..', 'ref', 'diffraction-classics.json')
json.dump(out, open(path, 'w'))
print('Poisson ratio %.4f; Airy I0 %.5g mW/mm^2, first zero %.5f mm (even lighting %.5f); Young fringe %.4f mm'
      % (rows[0]['ratio'], out['airy']['I0'], out['airy']['first_zero_mm'], out['airy']['uniform_first_zero_mm'], out['young']['fringe_mm']))
