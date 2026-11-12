"""Concave mirrors of vertex radius R = 200 mm: a sphere's spherical aberration, and the conics' foci.

Sphere (k = 0): a ray parallel to the axis at height h meets the sphere at angle theta,
sin theta = h / R, from its normal, which runs through the centre of curvature; the law of
reflection sends it back across the axis R / (2 cos theta) from the centre, so
    z(h) = R - R / (2 cos theta)
from the vertex (Hecht, Optics, 4th ed., section 5.4.3), short of the paraxial focus R/2
by the longitudinal aberration R/2 - z(h). Solved again here by tracing the ray through
the exact geometry (the line meeting the circle, reflected about the radius), as a check.

The conics z = c r^2 / (1 + sqrt(1 - (1 + k) c^2 r^2)), c = 1/R, of eccentricity
e = sqrt(-k) have their foci on the axis at R/(1 + e) and R/(1 - e) from the vertex
(Apollonius's focal property: the ellipse images one focus on the other, the hyperbola
its real focus on its virtual one, the paraboloid a point at infinity on R/2). Those are
the reference for the paraboloid (k = -1, a collimated beam), an ellipsoid (k = -0.5, a
point source at its near focus) and a hyperboloid (k = -2, a point source at its real
focus); checked here by tracing exact rays off each surface.

    python conic_mirrors.py
"""
import json, math, os
import numpy as np

R = 200.0
HEIGHTS = [2.0, 5.0, 10.0, 15.0, 20.0, 25.0, 30.0, 35.0, 40.0, 45.0]


def sag(r, k):
    c = 1 / R
    return c * r * r / (1 + math.sqrt(1 - (1 + k) * c * c * r * r))


def reflect_from(p0, d, k):
    """A ray from p0 (z, r) along d meets the conic (sag measured towards +z) and reflects: its point and new direction."""
    f = lambda t: (p0[0] + t * d[0]) - sag(p0[1] + t * d[1], k)
    # the first crossing: stepped out from the start (the ray starts on the concave side), then bisected
    lo, hi, step, t = 0.0, None, 0.01, 0.0
    while True:
        t2 = t + step
        if f(t) * f(t2) <= 0: lo, hi = t, t2; break
        t = t2
    for _ in range(200):
        mid = (lo + hi) / 2
        if f(lo) * f(mid) <= 0: hi = mid
        else: lo = mid
    tt = (lo + hi) / 2
    z, r = p0[0] + tt * d[0], p0[1] + tt * d[1]
    # normal of F(z, r) = z - sag(r)
    c = 1 / R
    root = math.sqrt(1 - (1 + k) * c * c * r * r)
    dsag = c * r / root
    nrm = np.array([1.0, -dsag]); nrm /= np.linalg.norm(nrm)
    d = np.array(d, float); d = d - 2 * np.dot(d, nrm) * nrm
    return (z, r), d


def axis_cross(p, d):
    return p[0] - p[1] * d[0] / d[1]


out = {'R_mm': R}
# sphere
rows = []
for h in HEIGHTS:
    th = math.asin(h / R)
    z = R - R / (2 * math.cos(th))
    p, d = reflect_from((-50.0, h), (1.0, 0.0), 0.0)
    zt = axis_cross(p, d)
    assert abs(zt - z) < 1e-8, (h, z, zt)
    rows.append({'h': h, 'z_mm': z, 'lsa_mm': R / 2 - z})
out['sphere'] = rows
# paraboloid: every height to R/2
for h in HEIGHTS:
    p, d = reflect_from((-50.0, h), (1.0, 0.0), -1.0)
    assert abs(axis_cross(p, d) - R / 2) < 1e-8
out['paraboloid'] = {'k': -1.0, 'focus_mm': R / 2}
# ellipsoid and hyperboloid from their near focus
for name, k, angs in [('ellipsoid', -0.5, [2, 5, 10, 15, 20]), ('hyperboloid', -2.0, [2, 5, 10, 15, 20, 24])]:
    e = math.sqrt(-k)
    f1, f2 = R / (1 + e), R / (1 - e)
    for a in angs:
        for s in (1, -1):
            t = math.radians(a) * s
            p, d = reflect_from((f1, 0.0), (-math.cos(t), math.sin(t)), k)
            assert abs(axis_cross(p, d) - f2) < 1e-6, (name, a, axis_cross(p, d), f2)
    out[name] = {'k': k, 'e': e, 'source_mm': f1, 'image_mm': f2, 'half_angles_deg': angs}
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'conic-mirrors.json'), 'w'), indent=1)
print('sphere LSA:', ' '.join('%g: %.5f' % (r['h'], r['lsa_mm']) for r in rows))
print('ellipsoid', out['ellipsoid']['source_mm'], '->', out['ellipsoid']['image_mm'], '; hyperboloid', out['hyperboloid']['source_mm'], '->', out['hyperboloid']['image_mm'])
