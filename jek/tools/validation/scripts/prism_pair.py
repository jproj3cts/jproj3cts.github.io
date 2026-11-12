"""The group-delay dispersion of a Brewster prism pair against the prisms' separation.

R. L. Fork, O. E. Martinez and J. P. Gordon, "Negative dispersion using pairs of prisms",
Opt. Lett. 9, 150-152 (1984). Two identical prisms of Schott N-SF10, each cut so that light at
800 nm passes it at minimum deviation and meets both faces at Brewster's angle (apex angle
2 atan(1/n)); the second is the first turned through 180 degrees about the middle of the path
between them, so every colour leaves parallel to the light that came in. One pass.

The reference is an exact ray trace in two dimensions written here: Snell's law at each face,
N-SF10's index from Schott's Sellmeier coefficients, the optical path of each colour from a
fixed point before the first prism to a plane across the beam after the second. The spectral
phase is phi(w) = w P(w) / c, and its second and third derivatives at the centre (by finite
differences, two step sizes compared) are the GDD and TOD.

Fork et al.'s result for the separation: moving the second prism along the light between the
prisms changes d2P/dlambda2 by -(dtheta/dlambda)^2 per unit length, and at Brewster's angle and
minimum deviation dtheta/dn = 2, so the GDD changes by -(lambda^3 / 2 pi c^2) 4 (dn/dlambda)^2
per millimetre of separation. The script checks the trace against that.

    python prism_pair.py
"""
import json, math, os
import numpy as np

C = 299.792458                                   # nm/fs
C_MM = 2.99792458e-4                             # mm per fs
NM0 = 800.0
# Schott N-SF10: B1 B2 B3 C1 C2 C3 (um, um^2)
SF10 = (1.62153902, 0.256287842, 1.64447552, 0.0122241457, 0.0595736775, 147.468793)

def n_glass(um):
    B1, B2, B3, C1, C2, C3 = SF10
    l2 = um * um
    return math.sqrt(1 + B1 * l2 / (l2 - C1) + B2 * l2 / (l2 - C2) + B3 * l2 / (l2 - C3))

n0 = n_glass(NM0 / 1000)
thB = math.atan(n0)                               # Brewster's angle at 800 nm
APEX = 2 * math.atan(1 / n0)                      # apex angle: the inside ray at Brewster's angle too
SIDE = 25.0                                       # mm, each prism's equal sides
INS = 8.0                                         # mm along the entrance face from the apex to where the 800 nm ray meets it

def rot(p, a):
    c, s = math.cos(a), math.sin(a)
    return (c * p[0] - s * p[1], s * p[0] + c * p[1])

def prism1():
    """Prism 1's corners (apex, then the base's two ends), placed so the 800 nm ray along +x
    at y = 0 meets its entrance face INS mm from the apex at Brewster's angle."""
    # in its own frame: apex at the origin, pointing +y; the entrance face down to the left
    h = SIDE * math.cos(APEX / 2)
    A, L, R = (0.0, 0.0), (-SIDE * math.sin(APEX / 2), -h), (SIDE * math.sin(APEX / 2), -h)
    # turn it so the light (horizontal inside it at minimum deviation) comes in along +x: the
    # outside ray is tilted up by eps = thB - APEX/2 in the prism's frame
    eps = thB - APEX / 2
    A, L, R = (rot(p, -eps) for p in (A, L, R))
    # the point on the entrance face INS from the apex, put on y = 0 at x = 0
    f = (A[0] + (L[0] - A[0]) * INS / SIDE, A[1] + (L[1] - A[1]) * INS / SIDE)
    return [(p[0] - f[0], p[1] - f[1]) for p in (A, L, R)]

def refract(d, nrm, n1, n2):
    """direction d (unit) through a face with unit normal nrm (pointing against d), n1 -> n2"""
    cosi = -(d[0] * nrm[0] + d[1] * nrm[1])
    r = n1 / n2
    k = 1 - r * r * (1 - cosi * cosi)
    if k < 0:
        raise ValueError('total internal reflection')
    ct = math.sqrt(k)
    return (r * d[0] + (r * cosi - ct) * nrm[0], r * d[1] + (r * cosi - ct) * nrm[1])

def hit(p, d, a, b):
    """where the ray p + t d meets the segment a-b: (t, point), or None"""
    ex, ey = b[0] - a[0], b[1] - a[1]
    den = d[0] * ey - d[1] * ex
    if abs(den) < 1e-15:
        return None
    t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den
    u = ((a[0] - p[0]) * d[1] - (a[1] - p[1]) * d[0]) / den
    if t <= 1e-12 or u < 0 or u > 1:
        return None
    return t, (p[0] + t * d[0], p[1] + t * d[1])

def through(poly, p, d, n):
    """a ray through a convex prism (corners counter-clockwise or not): in by the nearest face,
    out by the face it next meets; returns (optical path inside and to it, exit point, direction)"""
    faces = [(poly[i], poly[(i + 1) % 3]) for i in range(3)]
    cen = (sum(q[0] for q in poly) / 3, sum(q[1] for q in poly) / 3)
    def normal_out(a, b):
        nx, ny = b[1] - a[1], -(b[0] - a[0]); L = math.hypot(nx, ny); nx, ny = nx / L, ny / L
        mx, my = (a[0] + b[0]) / 2 - cen[0], (a[1] + b[1]) / 2 - cen[1]
        return (nx, ny) if nx * mx + ny * my > 0 else (-nx, -ny)
    hits = [(hit(p, d, a, b), i) for i, (a, b) in enumerate(faces)]
    hits = [(h, i) for h, i in hits if h]
    (t1, q1), i1 = min(hits, key=lambda z: z[0][0])
    no = normal_out(*faces[i1])
    d1 = refract(d, no, 1.0, n)
    hits2 = [(hit(q1, d1, a, b), i) for i, (a, b) in enumerate(faces) if i != i1]
    hits2 = [(h, i) for h, i in hits2 if h]
    (t2, q2), i2 = min(hits2, key=lambda z: z[0][0])
    no2 = normal_out(*faces[i2])
    d2 = refract(d1, (-no2[0], -no2[1]), n, 1.0)
    return t1 + n * t2, q2, d2, (q1, q2)

X0 = -50.0                                       # the light starts here, on y = 0, along +x

def layout(sep):
    """both prisms for a separation sep (mm, along the 800 nm ray between them) and the screen"""
    P1 = prism1()
    _, q, d, _ = through(P1, (X0, 0.0), (1.0, 0.0), n0)
    e2 = (q[0] + sep * d[0], q[1] + sep * d[1])
    M = ((q[0] + e2[0]) / 2, (q[1] + e2[1]) / 2)
    P2 = [(2 * M[0] - p[0], 2 * M[1] - p[1]) for p in P1]
    screen_x = max(p[0] for p in P2) + 30.0
    return P1, P2, screen_x

def opl(nm, sep, lay=None):
    P1, P2, sx = lay or layout(sep)
    n = n_glass(nm / 1000)
    o1, q, d, _ = through(P1, (X0, 0.0), (1.0, 0.0), n)
    o2, q2, d2, _ = through(P2, q, d, n)
    # the air between the prisms is in o2 (the path to its entrance face); then on to the screen plane x = sx
    t = (sx - q2[0]) / d2[0]
    return o1 + o2 + t, (q2[1] + t * d2[1]), d2

def phase_derivs(sep):
    lay = layout(sep)
    w0 = 2 * math.pi * C / NM0                    # rad/fs
    phi = lambda w: w * opl(2 * math.pi * C / w, sep, lay)[0] / C_MM   # rad (OPL in mm)
    out = []
    for h in (0.004, 0.008):
        f = [phi(w0 + k * h) for k in (-3, -2, -1, 0, 1, 2, 3)]
        # sixth-order-accurate stencils for the second and third derivatives
        d2 = (2 * f[0] - 27 * f[1] + 270 * f[2] - 490 * f[3] + 270 * f[4] - 27 * f[5] + 2 * f[6]) / (180 * h * h)
        d3 = (f[0] - 8 * f[1] + 13 * f[2] - 13 * f[4] + 8 * f[5] - f[6]) / (8 * h ** 3)
        out.append((d2, d3))
    (a2, a3), (b2, b3) = out
    assert abs(a2 / b2 - 1) < 1e-5 and abs(a3 / b3 - 1) < 1e-3, out
    return a2, a3, lay

def dn_dlambda(um, h=1e-4):
    return (n_glass(um + h) - n_glass(um - h)) / (2 * h)       # per um

rows = []
for sep in (400, 500, 600, 700, 800):
    gdd, tod, lay = phase_derivs(sep)
    P1, P2, sx = lay
    # every colour leaves parallel to the input
    for nm in (760, 800, 840):
        d = opl(nm, sep, lay)[2]
        assert abs(d[1]) < 1e-9, d
    rows.append({'sep_mm': sep, 'GDD_fs2': gdd, 'TOD_fs3': tod,
                 'prism2': [list(p) for p in P2], 'screen_x_mm': sx, 'exit_y_mm': opl(NM0, sep, lay)[1]})
    print(sep, round(gdd, 3), round(tod, 3))

P1 = layout(400)[0]
lam_um = NM0 / 1000
slope_trace = (rows[-1]['GDD_fs2'] - rows[0]['GDD_fs2']) / (rows[-1]['sep_mm'] - rows[0]['sep_mm'])
# Fork et al.: -(lambda^3 / 2 pi c^2) (dtheta/dlambda)^2, dtheta/dlambda = 2 dn/dlambda; lambda in um, c in um/fs
slope_fork = -(lam_um ** 3 / (2 * math.pi * (C * 1e-3) ** 2)) * 4 * dn_dlambda(lam_um) ** 2 * 1e3   # fs^2 per mm
print('slope: trace', slope_trace, 'Fork', slope_fork)
assert abs(slope_trace / slope_fork - 1) < 2e-3

path = os.path.join(os.path.dirname(__file__), '..', 'ref', 'prism-pair.json')
with open(path, 'w') as f:
    json.dump({'source': 'Fork, Martinez and Gordon, Opt. Lett. 9, 150 (1984): a Brewster prism pair of N-SF10 at 800 nm, one pass; '
               'GDD and TOD from an exact ray trace (Snell\'s law, Schott\'s Sellmeier), the slope against separation from their closed form',
               'nm': NM0, 'glass': 'N-SF10', 'n0': n0, 'brewster_deg': math.degrees(thB), 'apex_deg': math.degrees(APEX),
               'side_mm': SIDE, 'insertion_mm': INS, 'start_x_mm': X0, 'prism1': [list(p) for p in P1],
               'dn_dlambda_per_um': dn_dlambda(lam_um), 'slope_fork_fs2_per_mm': slope_fork, 'slope_trace_fs2_per_mm': slope_trace,
               'rows': rows}, f, indent=1)
