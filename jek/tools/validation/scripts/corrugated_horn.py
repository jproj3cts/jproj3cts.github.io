"""A corrugated horn's fundamental Gaussian, and its far field.

The aperture field of a corrugated conical horn is the balanced hybrid HE11 mode,
E(r) = J0(2.405 r / a) out to the wall at r = a and nothing beyond (Goldsmith, Quasioptical
Systems, IEEE Press 1998, ch. 7). Wylde (IEE Proceedings H 131, 258 (1984)) fitted it with a
Gaussian exp(-r^2 / w^2): the overlap is greatest at w = 0.6435 a, where the fundamental
Gaussian carries 98% of the horn's power. Both numbers are found here by quadrature:

  eta(w) = [int_0^a J0(2.405 r/a) exp(-r^2/w^2) r dr]^2 / ( int_0^a J0^2 r dr * w^2 / 4 )

The same overlap with a phase gives what a corrugated receiving horn (flat aperture: a slant
length L of 1e5 mm, as long as JEKray allows) takes in from a Gaussian beam that arrives at its
aperture with radius w and curvature R: the beam from an ideal Gaussian horn of aperture
radius a_t (its beam w = 0.6435 a_t at its own flat aperture) 1 mm away, its radius and
curvature there from the Gaussian beam's propagation. The receiver's mode, as it would send it
out, has its phase front on a sphere of radius L about its apex; what it receives best
converges on that apex, so the phases of a diverging beam (R) and of the horn (L) add:
exp(-i k r^2 (1/R + 1/L) / 2).

The far field of the aperture, with the spherical phase front of a horn of slant length L
across it and the Huygens obliquity factor (1 + cos theta) / 2 (Goldsmith ch. 6 and 7):

  E(theta) = (1 + cos theta)/2 * int_0^a J0(2.405 r/a) exp(-i k r^2 / 2L) J0(k r sin theta) r dr

its directivity 4 pi |2 pi E(0)|^2 / (lambda^2 int |E_ap|^2 dA) and its full width at half power.
The field is round, so the E- and H-plane cuts are the same.

    python corrugated_horn.py
"""
import json, math, os
import numpy as np
from scipy.integrate import quad
from scipy.optimize import minimize_scalar, brentq
from scipy.special import j0, jn_zeros

X01 = jn_zeros(0, 1)[0]                        # 2.40483
C_MM_GHZ = 299792458e-6                        # c in mm GHz

def eta(wa):
    """the fundamental Gaussian's share of the HE11 field, a = 1, w = wa"""
    num = quad(lambda r: j0(X01 * r) * math.exp(-r * r / (wa * wa)) * r, 0, 1, epsabs=1e-15, epsrel=1e-13)[0]
    den = quad(lambda r: j0(X01 * r) ** 2 * r, 0, 1, epsabs=1e-15, epsrel=1e-13)[0] * wa * wa / 4
    return num * num / den

opt = minimize_scalar(lambda x: -eta(x), bounds=(0.5, 0.8), method='bounded', options={'xatol': 1e-10})
w_opt, eta_opt = opt.x, eta(opt.x)
eta_6435 = eta(0.6435)
assert abs(w_opt - 0.6435) < 5e-4, w_opt                # Wylde's figure
assert abs(eta_6435 - 0.98) < 0.005, eta_6435           # and his 98%

def gauss_beam(w_ap, R_ap, lam, d):
    """a Gaussian beam with radius w_ap and phase radius R_ap (inf: flat) at its start, d further on: (w, R)"""
    x = math.pi * w_ap ** 2 / (lam * R_ap) if math.isfinite(R_ap) else 0.0
    w0 = w_ap / math.sqrt(1 + x * x)
    zw = R_ap / (1 + 1 / (x * x)) if x > 0 else 0.0           # the waist, this far behind the start
    zR = math.pi * w0 * w0 / lam
    z = d + zw
    w = w0 * math.sqrt(1 + (z / zR) ** 2)
    R = z * (1 + (zR / z) ** 2) if z != 0 else math.inf
    return w, R

def couple(a, L, w, R, lam):
    """power a corrugated receiver (radius a, slant length L) takes in from a Gaussian beam of radius w and phase radius R at its aperture"""
    k = 2 * math.pi / lam
    c = k / 2 * (1 / R + 1 / L)
    re = quad(lambda r: j0(X01 * r / a) * math.exp(-r * r / (w * w)) * math.cos(c * r * r) * r, 0, a, epsabs=1e-14, epsrel=1e-12, limit=200)[0]
    im = quad(lambda r: j0(X01 * r / a) * math.exp(-r * r / (w * w)) * math.sin(c * r * r) * r, 0, a, epsabs=1e-14, epsrel=1e-12, limit=200)[0]
    pm = quad(lambda r: j0(X01 * r / a) ** 2 * r, 0, a, epsabs=1e-14, epsrel=1e-12)[0]
    return (re * re + im * im) / (pm * w * w / 4)

ghz, a_r, L_r, D = 100.0, 7.5, 1e5, 1.0
lam = C_MM_GHZ / ghz
rx = []
for ratio in [0.45, 0.5, 0.55, 0.6, 0.6435, 0.7, 0.75, 0.8, 0.85]:
    a_t = ratio * a_r / 0.6435
    # the transmitter's beam at its own aperture: w = 0.6435 a_t on a phase front of radius L = 1e5 mm
    w, R = gauss_beam(0.6435 * a_t, 1e5, lam, D)
    rx.append({'ratio': ratio, 'a_t': a_t, 'w_at_rx': w, 'R_at_rx': R, 'coupling': couple(a_r, L_r, w, R, lam)})
# with no phase at all, the coupling is eta(w / a): the check that both are one overlap
assert abs(couple(1.0, math.inf, 0.6435, math.inf, 1.0) - eta_6435) < 1e-10

def far_field(a, L, ghz):
    lam = C_MM_GHZ / ghz; k = 2 * math.pi / lam
    def E(th):
        s = math.sin(th)
        re = quad(lambda r: j0(X01 * r / a) * math.cos(k * r * r / (2 * L)) * j0(k * r * s) * r, 0, a, epsabs=1e-11, epsrel=1e-10, limit=400)[0]
        im = quad(lambda r: -j0(X01 * r / a) * math.sin(k * r * r / (2 * L)) * j0(k * r * s) * r, 0, a, epsabs=1e-11, epsrel=1e-10, limit=400)[0]
        ob = (1 + math.cos(th)) / 2
        return (re * re + im * im) * ob * ob
    P0 = E(0.0)
    pap = quad(lambda r: j0(X01 * r / a) ** 2 * r, 0, a)[0] * 2 * math.pi
    D = 4 * math.pi * (2 * math.pi) ** 2 * P0 / (lam * lam * pap)
    th_half = brentq(lambda t: E(t) - P0 / 2, 1e-6, math.pi / 2 * 0.99, xtol=1e-12)
    th = np.radians(np.linspace(0, 40, 81))
    return {'a_mm': a, 'L_mm': L, 'ghz': ghz, 'directivity_dBi': 10 * math.log10(D), 'hpbw_deg': 2 * math.degrees(th_half),
            'theta_deg': list(np.degrees(th)), 'pattern_dB': [10 * math.log10(max(E(t) / P0, 1e-30)) for t in th]}

ff = [far_field(7.5, 60.0, 100.0), far_field(10.0, 200.0, 150.0)]

out = {'source': 'Wylde, IEE Proc. H 131, 258 (1984); Goldsmith, Quasioptical Systems (1998), ch. 6-7: HE11 aperture field J0(2.405 r/a)',
       'w_opt_over_a': w_opt, 'eta_opt': eta_opt, 'eta_at_0p6435': eta_6435,
       'receiver': {'ghz': ghz, 'a_mm': a_r, 'L_mm': L_r, 'D_mm': D, 'rows': rx},
       'far_field': ff}
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, '..', 'ref', 'corrugated-horn.json'), 'w') as f:
    json.dump(out, f, indent=1)
print('w/a', w_opt, 'eta', eta_opt, 'eta(0.6435)', eta_6435)
for r in rx: print('ratio', r['ratio'], 'coupling', r['coupling'])
for q in ff: print(q['a_mm'], q['L_mm'], q['ghz'], 'D', q['directivity_dBi'], 'HPBW', q['hpbw_deg'])
