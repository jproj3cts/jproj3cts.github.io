"""Thin-film coatings: their reflectance, by the characteristic matrix and by Macleod's closed forms.

H. A. Macleod, Thin-Film Optical Filters (4th ed., CRC Press, 2010), chapters 2-5; the
matrix method of F. Abeles, Ann. Phys. (Paris) 5, 596 (1950). A stack of layers of index n_j
and thickness d_j on a substrate n_s, light from n_0 at angle theta_0:
    [B, C] = prod_j [[cos d_j, i sin d_j / eta_j], [i eta_j sin d_j, cos d_j]] [1, eta_s],
    d_j = 2 pi n_j d_j cos theta_j / lambda,   eta = n cos theta (s) or n / cos theta (p),
    r = (eta_0 B - C) / (eta_0 B + C),   R = |r|^2.
At the design wavelength and normal incidence quarter-wave layers give closed forms: a
single layer n_1 reflects ((n_0 n_s - n_1^2)/(n_0 n_s + n_1^2))^2; any quarter-wave stack has
the admittance Y built up layer by layer as Y -> n_j^2 / Y from Y = n_s, and R = ((n_0 - Y)/(n_0 + Y))^2;
a high-reflector's stop band is (4/pi) arcsin((n_H - n_L)/(n_H + n_L)) wide in wavenumber over
the design's.

Three coatings on N-BK7 (its index from Schott's Sellmeier coefficients), layers listed from
the air side: a MgF2 quarter wave designed for 550 nm; a V-coat (1.38 on 1.70) for 1064 nm;
a high reflector H(LH)^6, 2.10 and 1.46, for 1064 nm. Spectra from 400 to 1200 nm at 5 degrees
(near normal) and at 45 degrees for s and p.

    python coatings.py
"""
import json, math, os
import numpy as np

B_, C_ = (1.03961212, 0.231792344, 1.01046945), (0.00600069867, 0.0200179144, 103.560653)
nbk7 = lambda nm: math.sqrt(1 + sum(b * (nm / 1e3) ** 2 / ((nm / 1e3) ** 2 - c) for b, c in zip(B_, C_)))

def refl(layers, ns, nm, deg, pol, n0=1.0):
    s0 = n0 * math.sin(math.radians(deg))
    def eta(n):
        ct = np.sqrt(1 - (s0 / n) ** 2 + 0j)
        return n * ct if pol == 's' else n / ct
    M = np.eye(2, dtype=complex)
    for n, d in layers:
        ct = np.sqrt(1 - (s0 / n) ** 2 + 0j)
        ph = 2 * math.pi * n * d * ct / nm
        e = eta(n)
        M = M @ np.array([[np.cos(ph), 1j * np.sin(ph) / e], [1j * e * np.sin(ph), np.cos(ph)]])
    B, C = M @ np.array([1, eta(ns)])
    r = (eta(n0) * B - C) / (eta(n0) * B + C)
    return float(abs(r) ** 2)

qw = lambda n, design: (n, design / (4 * n))
coats = [
    ('MgF2 quarter wave, 550 nm', 550.0, [qw(1.38, 550.0)]),
    ('V-coat, 1064 nm', 1064.0, [qw(1.38, 1064.0), qw(1.70, 1064.0)]),
    ('High reflector H(LH)^6, 1064 nm', 1064.0, [qw(2.10, 1064.0)] + [qw(1.46, 1064.0), qw(2.10, 1064.0)] * 6),
]
wl = list(range(400, 1201, 10))
out = {'substrate': 'N-BK7', 'coatings': []}
for name, design, L in coats:
    ns = nbk7(design)
    # closed form at the design wavelength, normal incidence: admittance from the substrate out
    Y = ns
    for n, _ in reversed(L): Y = n * n / Y
    Rq = ((1 - Y) / (1 + Y)) ** 2
    assert abs(Rq - refl(L, ns, design, 0.0, 's')) < 1e-12
    c = {'name': name, 'design_nm': design, 'layers': [{'n': n, 'd': d} for n, d in L], 'R_design_normal': Rq, 'wl': wl, 'spectra': {}}
    for deg, pol in ((5, 's'), (5, 'p'), (45, 's'), (45, 'p')):
        c['spectra'][f'{deg}{pol}'] = [refl(L, nbk7(w), w, deg, pol) for w in wl]
    if 'reflector' in name:
        dg = (4 / math.pi) * math.asin((2.10 - 1.46) / (2.10 + 1.46))
        c['stopband_nm'] = [design / (1 + dg / 2), design / (1 - dg / 2)]
    out['coatings'].append(c)
    print(name, 'R at design %.6g' % Rq, c.get('stopband_nm', ''))
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'coatings.json'), 'w'))
