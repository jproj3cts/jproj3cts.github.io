"""A prism's deviation and its minimum, against wavelength.

An equilateral prism (apex A = 60 deg) of N-BK7 and of N-SF11, each index from Schott's
published Sellmeier coefficients,
    n^2 = 1 + sum B_i l^2 / (l^2 - C_i),   l in micrometres.
A ray meeting the first face at incidence i leaves the second deviated by
    D(i) = i + arcsin(n sin(A - arcsin(sin i / n))) - A,
least when it passes symmetrically, where (e.g. Hecht, Optics, 4th ed., section 5.5.1)
    D_min = 2 arcsin(n sin(A / 2)) - A,   at incidence i_min = (D_min + A) / 2.
Checks: Schott's catalogue n_d (587.56 nm) of 1.51680 and 1.78472.

    python prism_dispersion.py
"""
import json, math, os

SELL = {
    'N-BK7': ((1.03961212, 0.231792344, 1.01046945), (0.00600069867, 0.0200179144, 103.560653), 1.51680),
    'N-SF11': ((1.73759695, 0.313747346, 1.89878101), (0.013188707, 0.0623068142, 155.23629), 1.78472),
}
A = 60.0
NMS = [404.656, 486.133, 587.5618, 656.2725, 852.11, 1013.98]
FIXED_I = [40.0, 50.0, 60.0, 70.0]


def index(glass, nm):
    B, C, _ = SELL[glass]
    um = nm / 1000
    return math.sqrt(1 + sum(b * um * um / (um * um - c) for b, c in zip(B, C)))


def dev(n, i_deg):
    a, i = math.radians(A), math.radians(i_deg)
    r1 = math.asin(math.sin(i) / n)
    s2 = n * math.sin(a - r1)
    if abs(s2) >= 1:
        return None
    return math.degrees(i + math.asin(s2) - a)


out = {'apex_deg': A, 'glasses': []}
for g, (B, C, nd) in SELL.items():
    assert abs(index(g, 587.5618) - nd) < 1e-5, (g, index(g, 587.5618))
    rows = []
    for nm in NMS:
        n = index(g, nm)
        dmin = math.degrees(2 * math.asin(n * math.sin(math.radians(A / 2)))) - A
        rows.append({'nm': nm, 'n': n, 'dmin_deg': dmin, 'imin_deg': (dmin + A) / 2,
                     'fixed': [{'i_deg': i, 'D_deg': dev(n, i)} for i in FIXED_I if dev(n, i) is not None]})
        # the minimum of D(i) is the closed form's
        assert abs(min(dev(n, (dmin + A) / 2 + k * 1e-4) for k in range(-50, 51)) - dmin) < 1e-9
    out['glasses'].append({'glass': g, 'nd_catalogue': nd, 'rows': rows})
    print(g, ' '.join('%.1f nm: n %.6f Dmin %.5f' % (r['nm'], r['n'], r['dmin_deg']) for r in rows))

json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'prism-dispersion.json'), 'w'), indent=1)
