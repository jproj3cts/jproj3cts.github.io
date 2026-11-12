"""A calcite Wollaston prism's two beams, against wavelength and wedge angle.

Calcite's ordinary and extraordinary indices from G. Ghosh, "Dispersion-equation
coefficients for the refractive index and birefringence of calcite and quartz crystals",
Optics Communications 163, 95-102 (1999):
    n^2 = A + B l^2 / (l^2 - C) + D l^2 / (l^2 - E),   l in micrometres.

The prism: two calcite wedges of angle theta cemented along a diagonal, the light square to
the first face. The first wedge has its optic axis across the beam in the plane of the
bench, the second out of it, so the light polarised in the plane (p) is extraordinary in
the first and ordinary in the second, and s the other way round; along these directions,
square to each axis, each sees n_e or n_o exactly. The diagonal's normal is theta from the
beam. Snell's law at the diagonal (n1 sin t1 = n2 sin t2, as vectors), then at the last
face into air, gives each beam's angle; the split is their difference, about
2 arcsin((n_o - n_e) tan theta) for a thin prism. Angles are counted anticlockwise from the beam, the diagonal running from
the lower corner of the entrance face to the upper corner of the exit face.

    python wollaston.py
"""
import json, math, os
import numpy as np

NO = (1.73358749, 0.96464345, 1.94325203e-2, 1.82831454, 120.0)
NE = (1.35859695, 0.82427830, 1.06689543e-2, 0.14429128, 120.0)


def ghosh(c, nm):
    l2 = (nm / 1000) ** 2
    return math.sqrt(c[0] + c[1] * l2 / (l2 - c[2]) + c[3] * l2 / (l2 - c[4]))


def snell(d, n, n1, n2):
    """d unit direction, n unit normal pointing along the light's way (from medium 1 into 2)."""
    d, n = np.asarray(d, float), np.asarray(n, float)
    ci = float(np.dot(d, n)); eta = n1 / n2
    k = 1 - eta * eta * (1 - ci * ci)
    assert k > 0
    return eta * d + (math.sqrt(k) - eta * ci) * n


rows = []
for wedge in (15.0, 30.0, 45.0):
    t = math.radians(wedge)
    cut = (math.cos(t), -math.sin(t))
    for nm in (400.0, 500.0, 632.8, 800.0, 1064.0, 1550.0):
        no, ne = ghosh(NO, nm), ghosh(NE, nm)
        out = {}
        for pol, (n1, n2) in (('p', (ne, no)), ('s', (no, ne))):
            d = snell((1.0, 0.0), cut, n1, n2)
            d = snell(d, (1.0, 0.0), n2, 1.0)
            out[pol] = math.degrees(math.atan2(d[1], d[0]))
        rows.append({'wedge_deg': wedge, 'nm': nm, 'no': no, 'ne': ne, 'p_deg': out['p'], 's_deg': out['s'],
                     'split_deg': out['s'] - out['p'], 'thin_deg': math.degrees(2 * math.asin((no - ne) * math.tan(t)))})

json.dump({'rows': rows}, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'wollaston.json'), 'w'), indent=1)
for r in rows: print('wedge %2.0f %6.1f nm: no %.5f ne %.5f  p %+8.4f s %+8.4f split %.4f (thin %.4f)' % (r['wedge_deg'], r['nm'], r['no'], r['ne'], r['p_deg'], r['s_deg'], r['split_deg'], r['thin_deg']))
