"""The Bessel beam behind an axicon, from the Fresnel diffraction integral.

J. Durnin, J. J. Miceli and J. H. Eberly, "Diffraction-free beams", Phys. Rev. Lett. 58,
1499 (1987); J. H. McLeod, J. Opt. Soc. Am. 44, 592 (1954) (the axicon). A cone of glass of
index n and base angle alpha bends light toward the axis by beta, sin(alpha + beta) =
n sin(alpha); the crossing waves make a core J0^2(k r sin beta), first dark at
r0 = 2.405 / (k sin beta), over a zone as long as w / tan(beta), its axial intensity growing
along it as the lit ring feeding it widens.

Here JEKray2D's example: a Gaussian beam of 1 mm at 632.8 nm, waist 21.5 mm before the cone's
apex (18.5 mm of air and 3 mm of UV fused silica, index from Malitson's Sellmeier formula),
a 1 degree cone. The field at the apex plane is the Gaussian's (its curvature and width
after 20.6 mm of equivalent air) times exp(-i k rho sin beta); the Fresnel integral
    E(r, z) = (-i k / z) e^{i k r^2 / 2z} int E(rho) e^{i k rho^2 / 2z} J0(k rho r / z) rho drho
is done by quadrature on a grid far finer than its phase needs. Profiles at 30, 60 and 90 mm
past the apex and the axial intensity from 10 to 130 mm.

    python bessel_axicon.py
"""
import json, math, os
import numpy as np
from scipy.special import j0

lam, w0, P = 632.8e-6, 1.0, 1.0
um = lam * 1e3
n = math.sqrt(1 + 0.6961663 * um ** 2 / (um ** 2 - 0.0684043 ** 2) + 0.4079426 * um ** 2 / (um ** 2 - 0.1162414 ** 2) + 0.8974794 * um ** 2 / (um ** 2 - 9.896161 ** 2))
alpha = math.radians(1.0)
beta = math.asin(n * math.sin(alpha)) - alpha
k = 2 * math.pi / lam
zR = math.pi * w0 ** 2 / lam
zin = 18.5 + 3.0 / n                          # the Gaussian's distance from its waist, as air
rho = np.linspace(0, 4.5, 90001)
wt = rho * (rho[1] - rho[0]); wt[0] *= 0.5; wt[-1] *= 0.5
E0 = math.sqrt(2 * P / (math.pi * w0 ** 2))
# the Gaussian at the apex plane (fields as e^{+ikz}, like the Fresnel kernel below: a beam
# spreading from its waist carries e^{+ik rho^2 / 2R}), then the cone's tilt toward the axis
wz = w0 * math.sqrt(1 + (zin / zR) ** 2); Rz = zin * (1 + (zR / zin) ** 2)
G = E0 * (w0 / wz) * np.exp(-rho ** 2 / wz ** 2 + 1j * k * rho ** 2 / (2 * Rz)) / (1 + 1j * zin / zR) * math.sqrt(1 + (zin / zR) ** 2)
Ea = G * np.exp(-1j * k * rho * math.sin(beta))

def field(r, z):
    ker = Ea * np.exp(1j * k * rho ** 2 / (2 * z)) * wt
    return (-1j * k / z) * np.exp(1j * k * np.asarray(r) ** 2 / (2 * z)) * (j0(np.outer(np.atleast_1d(r), rho) * k / z) @ ker)

r0 = 2.404825557695773 / (k * math.sin(beta))
out = {'nm': 632.8, 'n_UVFS': n, 'beta_deg': math.degrees(beta), 'first_zero_ideal_mm': r0, 'zone_mm': w0 / math.tan(beta), 'profiles': [], 'axis': []}
rs = np.linspace(0, 0.12, 481)
for z in (30.0, 60.0, 90.0):
    I = np.abs(field(rs, z)) ** 2
    i = int(np.argmax(np.diff(I) > 0))       # the first minimum
    a, b, c = I[i - 1], I[i], I[i + 1]; h = rs[1] - rs[0]
    zmin = rs[i] + 0.5 * h * (a - c) / (a - 2 * b + c)
    out['profiles'].append({'z_mm': z, 'r_mm': [float(v) for v in rs], 'I': [float(v) for v in I], 'first_zero_mm': float(zmin), 'I0': float(I[0])})
    print('z %3.0f mm: I(0) %.4g mW/mm^2, first dark ring %.5f mm (ideal J0: %.5f)' % (z, I[0], zmin, r0))
for z in range(10, 131, 10):
    out['axis'].append({'z_mm': float(z), 'I0': float(abs(field(0.0, float(z))[0]) ** 2)})
print('beta %.4f deg, zone %.1f mm' % (out['beta_deg'], out['zone_mm']))
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'bessel-axicon.json'), 'w'))
