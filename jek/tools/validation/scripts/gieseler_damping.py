"""The measured gas damping of a levitated nanosphere, against pressure.

J. Gieseler, B. Deutsch, R. Quidant and L. Novotny, "Subkelvin parametric feedback cooling of a
laser-trapped nanoparticle", Phys. Rev. Lett. 109, 103603 (2012), arXiv:1202.6435, Figure 4: the
damping rate Gamma0 / 2 pi of a fused-silica sphere of radius R = 69 nm, in its x, y and z
motion, from 6e-6 to 2e2 mbar. Their eq. (3) (from kinetic theory, after Beresnev et al.) is
    Gamma0 = (6 pi eta R / m) 0.619 / (0.619 + Kn) (1 + cK),
    cK = 0.31 Kn / (0.785 + 1.152 Kn + Kn^2),   Kn = mean free path / R.
The figure in the arXiv version is vector graphics, so the markers are read exactly: each is a
filled path (blue x, green y, red z, as the legend's are), its centre taken, the axes placed from
the drawn major ticks (pressure 1e-5 mbar at x = 368.821 pt and 1e3 at 540.400 pt; Gamma0 / 2 pi
1e-2 Hz at y = 170.543 pt and 1e4 at 85.558 pt). The three legend markers are left out. The
dashed "fit according to Eq. (3)" is not used: it is a straight line on the log-log axes (slope
0.966), which eq. (3), linear in pressure wherever Kn >> 1, is not.

Beside the measurement, the free-molecular limit on its own: P. S. Epstein, "On the resistance
experienced by spheres in their motion through gases", Phys. Rev. 23, 710 (1924), for molecules
reflected diffusely: F = (4 pi / 3) delta R^2 rho_gas vbar v, delta = 1 + pi/8, so
    Gamma0 = (4 pi / 3) (1 + pi/8) R^2 P sqrt(8 m_air / (pi kB T)) / m,
for the same sphere (R = 69 nm, 2200 kg/m^3) in air (28.97 u) at 295 K.

    python gieseler_damping.py gieseler.pdf      (arXiv:1202.6435v1; needs PyMuPDF)
"""
import json, math, os, sys
import pymupdf as fitz

page = fitz.open(sys.argv[1] if len(sys.argv) > 1 else 'gieseler.pdf')[2]
X = lambda x: 10 ** (-5 + 8 * (x - 368.821) / (540.400 - 368.821))
Y = lambda y: 10 ** (-2 + 6 * (170.543 - y) / (170.543 - 85.558))
pts = {'x': [], 'y': [], 'z': []}
for d in page.get_drawings():
    r = d['rect']
    if d['type'] != 'f' or not (359.4 < r.x0 and r.x1 < 544.1 and 58.0 < r.y0 and r.y1 < 176.0) or r.width > 4:
        continue
    c = d['fill']
    ax = 'z' if c[0] > 0.8 else 'x' if c[2] > 0.6 else 'y'
    P, G = X((r.x0 + r.x1) / 2), Y((r.y0 + r.y1) / 2)
    if P < 1e-4 and G > 100:          # the legend's markers, at the top left
        continue
    pts[ax].append([P, G])
for ax in pts:
    pts[ax].sort()
    print(ax, len(pts[ax]), 'points, Gamma0/2pi / P from %.0f to %.0f Hz/mbar' % (min(g / p for p, g in pts[ax]), max(g / p for p, g in pts[ax])))
out = {'radius_nm': 69, 'material': 'Fused silica', 'points': pts,
       'bands': [{'name': 'ultrahigh vacuum', 'lo': 0, 'hi': 2e-4}, {'name': 'free-molecular', 'lo': 1e-3, 'hi': 12}, {'name': 'toward the viscous regime', 'lo': 40, 'hi': 1e9}],
       'quoted': {'mbar': 1e-5, 'Gamma0_Hz': 0.01, 'Q': 1e7}}
kB, T, u = 1.380649e-23, 295.0, 1.66053906660e-27
R, rho = 69e-9, 2200.0
m = rho * 4 / 3 * math.pi * R ** 3
G = (4 * math.pi / 3) * (1 + math.pi / 8) * R * R * 100.0 * math.sqrt(8 * 28.97 * u / (math.pi * kB * T)) / m
out['epstein'] = {'T_K': T, 'density': rho, 'Hz_per_mbar': G / (2 * math.pi)}
print('Epstein, diffuse: Gamma0/2pi = %.1f Hz/mbar' % out['epstein']['Hz_per_mbar'])
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'gieseler-2012.json'), 'w'), indent=1)
