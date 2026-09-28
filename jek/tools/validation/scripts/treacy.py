"""The group-delay dispersion and third-order dispersion of a pair of parallel gratings.

E. B. Treacy, "Optical pulse compression with diffraction gratings", IEEE J. Quantum
Electron. 5, 454-458 (1969). Light meets the first grating at incidence gamma and leaves in
the -1 order at theta, sin(theta) = lambda/d - sin(gamma); the second grating, parallel at
perpendicular distance G, sends each colour on parallel to the input. Treacy's phase for one
pass, measured on a plane across the outgoing beam:
    phi(w) = (w/c) b (1 + cos(gamma - theta)) - 2 pi G tan(theta) / d,    b = G / cos(theta),
whose second derivative is his closed form
    GDD = -lambda^3 G / (2 pi c^2 d^2 cos^3 theta).
The phase is differentiated here numerically (to the third order for the TOD), and the GDD
checked against the closed form.

    python treacy.py
"""
import json, math, os
from mpmath import mp, mpf, diff, asin, cos, sin, tan, pi

mp.dps = 40
C = mpf(299.792458)                  # nm/fs

def phase(w, d, gamma, G):           # w rad/fs, d and G in nm; rad
    lam = 2 * pi * C / w
    th = asin(lam / d - sin(gamma))
    b = G / cos(th)
    return w / C * b * (1 + cos(gamma - th)) - 2 * pi * G * tan(th) / d

cases = []
for lpmm, nm, gdeg, G_mm in ((600, 800, 30, 50), (1200, 800, 45, 20), (1200, 1030, 55, 40), (940, 1550, 60, 30)):
    d, gamma, G = mpf(1e6) / lpmm, mp.radians(gdeg), mpf(G_mm) * 1e6
    w0 = 2 * pi * C / nm
    th = asin(nm / d - sin(gamma))
    gdd = diff(lambda w: phase(w, d, gamma, G), w0, 2)
    tod = diff(lambda w: phase(w, d, gamma, G), w0, 3)
    closed = -mpf(nm) ** 3 * G / (2 * pi * C ** 2 * d ** 2 * cos(th) ** 3)
    assert abs(gdd / closed - 1) < 1e-12, (gdd, closed)
    cases.append({'lpmm': lpmm, 'nm': nm, 'gamma_deg': gdeg, 'G_mm': G_mm, 'theta_deg': float(mp.degrees(th)),
                  'b_mm': float(G / cos(th) / 1e6), 'GDD_fs2': float(gdd), 'TOD_fs3': float(tod)})
    print(cases[-1])

path = os.path.join(os.path.dirname(__file__), '..', 'ref', 'treacy.json')
with open(path, 'w') as f:
    json.dump({'source': 'Treacy, IEEE J. Quantum Electron. 5, 454 (1969): one pass through a parallel grating pair, -1 order', 'cases': cases}, f, indent=1)
