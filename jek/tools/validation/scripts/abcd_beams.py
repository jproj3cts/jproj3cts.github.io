"""A Gaussian beam through a thick lens and off a tilted concave mirror: the ABCD law.

H. Kogelnik and T. Li (Applied Optics 5, 1550 (1966)) carry a Gaussian beam's complex
parameter q through any paraxial system by its ray matrix, q' = (A q + B) / (C q + D).
Two systems, at 1064 nm, the beam's waist 1 mm in radius:
 1. a plano-convex N-BK7 lens (R = 51.5 mm, 3.6 mm thick, the prescription of LA1509), 500 mm
    past the waist, curved side first and then flat side first: the matrices of its two
    refracting surfaces and the glass between, N-BK7's index from Schott's Sellmeier
    coefficients;
 2. a concave mirror of radius 500 mm, 300 mm past the waist, the beam meeting it at 15
    degrees: in the plane of incidence it focuses as a mirror of focal length (R/2) cos(theta),
    across it as (R/2) / cos(theta) (A. E. Siegman, Lasers, chapter 15), so the beam leaves
    astigmatic, with two waists.
For each: where the new waist is past the last surface, and its radius.

    python abcd_beams.py
"""
import json, math, os
import numpy as np

nm = 1064.0
lam = nm * 1e-6
B, C = (1.03961212, 0.231792344, 1.01046945), (0.00600069867, 0.0200179144, 103.560653)
L2 = (nm / 1000) ** 2
n = math.sqrt(1 + sum(b * L2 / (L2 - c) for b, c in zip(B, C)))
w0 = 1.0
q0 = complex(0, math.pi * w0 ** 2 / lam)


def prop(d): return np.array([[1, d], [0, 1]], dtype=float)
def refr(R, n1, n2): return np.array([[1, 0], [0 if R is None else (n1 - n2) / (n2 * R), n1 / n2]], dtype=float)
def mirror(f): return np.array([[1, 0], [-1 / f, 1]], dtype=float)


def through(M, q):
    (A, Bm), (Cm, D) = M
    return (A * q + Bm) / (Cm * q + D)


def waist(q):
    """the waist's distance past the plane where q is taken, and its radius"""
    return -q.real, math.sqrt(lam * q.imag / math.pi)


rows = []
for name, R1, R2 in (('curved side first', 51.5, None), ('flat side first', None, -51.5)):
    M = refr(R2, n, 1) @ prop(3.6) @ refr(R1, 1, n) @ prop(500.0)
    # q after the lens, in air: the reduced form, since the beam ends in air the matrix's det is 1
    assert abs(np.linalg.det(M) - 1) < 1e-12
    z, w = waist(through(M, q0))
    rows.append({'system': 'lens', 'name': name, 'R1': R1, 'R2': R2, 'waist_past_mm': z, 'w0_mm': w})
th = math.radians(15.0)
for plane, f in (('in the plane', 250.0 * math.cos(th)), ('out of the plane', 250.0 / math.cos(th))):
    z, w = waist(through(mirror(f) @ prop(300.0), q0))
    rows.append({'system': 'mirror', 'name': plane, 'f_mm': f, 'waist_past_mm': z, 'w0_mm': w})
out = {'lambda_nm': nm, 'n_bk7': n, 'w0_mm': w0, 'lens_at_mm': 500.0, 'mirror_at_mm': 300.0, 'mirror_R_mm': 500.0, 'incidence_deg': 15.0, 'rows': rows}
with open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'abcd-beams.json'), 'w') as fh:
    json.dump(out, fh, indent=1)
print('N-BK7 at %g nm: %.6f' % (nm, n))
for r in rows: print(r)
