"""Free spectral range, finesse, linewidth and build-up of three optical cavities.

Summing the field's round trips (the Airy function: M. Born and E. Wolf, Principles of Optics,
section 7.6): with r the product of the mirrors' amplitude reflectances over one round trip
(r^2 = R1 R2 for a linear cavity, R1 R2 R3 for a ring of three), the transmission peaks are
c / L_g apart (L_g the round trip's group path: the air plus n_g d in glass), the finesse is
pi sqrt(r) / (1 - r), the linewidth (FWHM) the free spectral range over the finesse, and the
power circulating on resonance, over the power put in, T_in / (1 - r)^2.

Three cavities at 1064 nm: a linear one of 100 mm (a flat 99% input mirror, a 99.8% end mirror
curved to 250 mm); the same with a 10 mm plate of fused silica inside, its faces anti-reflection
coated (index from Malitson, J. Opt. Soc. Am. 55, 1205 (1965); its group index
n - lambda dn/dlambda); and a triangular ring of a flat 98% input mirror, a flat 99.9% mirror
and a 99.9% mirror curved to 500 mm.

    python cavity_basics.py
"""
import json, math, os

C = 299792458.0
NM = 1064.0

def n_fs(um):                                    # Malitson
    l2 = um * um
    return math.sqrt(1 + 0.6961663 * l2 / (l2 - 0.0684043 ** 2) + 0.4079426 * l2 / (l2 - 0.1162414 ** 2) + 0.8974794 * l2 / (l2 - 9.896161 ** 2))

um = NM / 1000
h = 1e-5
ng = n_fs(um) - um * (n_fs(um + h) - n_fs(um - h)) / (2 * h)

def cavity(name, Rs, Lg_mm, Tin):
    r = math.sqrt(math.prod(Rs))
    fsr = C / (Lg_mm * 1e-3)
    F = math.pi * math.sqrt(r) / (1 - r)
    return {'name': name, 'R': Rs, 'Lg_mm': Lg_mm, 'fsr_Hz': fsr, 'finesse': F, 'linewidth_Hz': fsr / F, 'buildup': Tin / (1 - r) ** 2}

L, d = 100.0, 10.0
# the ring: mirrors at (0, 0), (a, 0) and (a/2, hgt), an isosceles triangle
a, hgt = 120.0, 40.0
side = math.hypot(a / 2, hgt)
ring_len = a + 2 * side
cases = [
    cavity('Linear, 100 mm, 99% and 99.8%', [0.99, 0.998], 2 * L, 0.01),
    cavity('Linear, 100 mm, with 10 mm of fused silica', [0.99, 0.998], 2 * (L - d + ng * d), 0.01),
    cavity('Ring of three mirrors, 98%, 99.9% and 99.9%', [0.98, 0.999, 0.999], ring_len, 0.02),
]
cases[1]['n'] = n_fs(um); cases[1]['ng'] = ng
cases[2]['corners_mm'] = [[0, 0], [a, 0], [a / 2, hgt]]
for c in cases:
    print(c)
with open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'cavity-basics.json'), 'w') as f:
    json.dump({'source': 'The Airy sum of round trips (Born and Wolf, section 7.6): free spectral range from the group path, finesse, linewidth, build-up',
               'nm': NM, 'L_mm': L, 'plate_mm': d, 'cases': cases}, f, indent=1)
