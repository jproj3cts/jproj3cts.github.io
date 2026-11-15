"""Total internal reflection: the phase between s and p, and Fresnel's rhomb.

Born and Wolf, Principles of Optics, section 1.5.4 (total reflection): light inside glass of
index n meeting its face beyond the critical angle, sin theta > 1/n, is reflected whole,
s and p alike, but each with its own phase, and the relative phase delta between them is
    tan(delta / 2) = cos(theta) sqrt(sin^2 theta - n_r^2) / sin^2 theta,   n_r = 1/n.
Fresnel's rhomb puts two such reflections in a row at the angle where delta = 45 deg, so
light polarised at 45 deg to the plane of incidence leaves circularly polarised. The glass
is N-BK7 (Schott's Sellmeier coefficients); the rhomb is cut for 587.56 nm at the larger of
the two angles that give 45 deg (Fresnel's own was about 54.6 deg for crown glass). Leaving
it, light that went in at 45 deg has normalised Stokes parameters
    S1 = 0,  S2 = +-cos(2 delta),  |S3| = |sin(2 delta)|
(the sign of S2 and S3 depending on how p is counted after a reflection), against
wavelength as N-BK7's index changes. Also each solution's delta at angles from the
critical angle to 85 deg, worked out again here from the complex Fresnel coefficients.

    python tir_rhomb.py
"""
import cmath, json, math, os
from scipy.optimize import brentq

B, C = (1.03961212, 0.231792344, 1.01046945), (0.00600069867, 0.0200179144, 103.560653)


def n_bk7(nm):
    um = nm / 1000
    return math.sqrt(1 + sum(b * um * um / (um * um - c) for b, c in zip(B, C)))


def delta(theta_deg, n):
    t = math.radians(theta_deg); nr = 1 / n
    return math.degrees(2 * math.atan(math.cos(t) * math.sqrt(math.sin(t) ** 2 - nr * nr) / math.sin(t) ** 2))


def delta_fresnel(theta_deg, n):
    """From the complex amplitude coefficients: glass (n) into air (1)."""
    t = math.radians(theta_deg); ci = math.cos(t)
    ct = cmath.sqrt(1 - (n * math.sin(t)) ** 2)        # imaginary beyond the critical angle
    if ct.imag < 0: ct = -ct
    rs = (n * ci - ct) / (n * ci + ct)
    rp = (ci - n * ct) / (ci + n * ct)
    assert abs(abs(rs) - 1) < 1e-12 and abs(abs(rp) - 1) < 1e-12
    return abs(math.degrees(cmath.phase(rs / rp)))   # delta, or 180 - delta as p is counted the other way


nm0 = 587.5618
n0 = n_bk7(nm0)
crit = math.degrees(math.asin(1 / n0))
# delta peaks between the two angles that give 45 deg
tpk = math.degrees(math.asin(math.sqrt(2 / (1 + n0 * n0))))
th_lo = brentq(lambda t: delta(t, n0) - 45, crit + 1e-9, tpk)
th_hi = brentq(lambda t: delta(t, n0) - 45, tpk, 89.9)

single = []
for th in (42, 44, 46, 48, 50, 52, 55, 60, 65, 70, 75, 80, 85):
    d = delta(th, n0)
    assert abs(d - delta_fresnel(th, n0)) < 1e-9 or abs(180 - d - delta_fresnel(th, n0)) < 1e-9
    single.append({'theta_deg': th, 'delta_deg': d})

rhomb = []
for nm in (400.0, 486.133, 587.5618, 656.2725, 800.0, 1064.0):
    n = n_bk7(nm); d2 = 2 * delta(th_hi, n)
    rhomb.append({'nm': nm, 'n': n, 'delta_total_deg': d2, 'S1': 0.0, 'S2_abs': abs(math.cos(math.radians(d2))), 'S3_abs': abs(math.sin(math.radians(d2)))})

out = {'glass': 'N-BK7', 'nm': nm0, 'n': n0, 'critical_deg': crit, 'peak_deg': tpk, 'delta_peak_deg': delta(tpk, n0),
       'rhomb_angle_deg': th_hi, 'other_45_deg': th_lo, 'single': single, 'rhomb': rhomb}
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'tir-rhomb.json'), 'w'), indent=1)
print('n %.6f critical %.4f peak delta %.4f at %.4f; delta = 45 at %.4f and %.4f' % (n0, crit, delta(tpk, n0), tpk, th_lo, th_hi))
for r in rhomb: print('%.1f nm: total %.4f deg, |S2| %.5f' % (r['nm'], r['delta_total_deg'], r['S2_abs']))
