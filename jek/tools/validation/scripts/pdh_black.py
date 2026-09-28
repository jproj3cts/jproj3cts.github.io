"""The Pound-Drever-Hall error signal of a two-mirror cavity.

E. D. Black, "An introduction to Pound-Drever-Hall laser frequency stabilization", Am. J.
Phys. 69, 79-87 (2001); R. W. P. Drever et al., Appl. Phys. B 31, 97-105 (1983).

In JEKray2D's convention the field goes as e^{i(w t - k z)}. A laser phase-modulated at Omega
(depth beta), e^{i beta sin(Omega t)}, is the carrier and sidebands J_n(beta) at n Omega. Each
reflects off the cavity with its own coefficient F, which for a lossless input mirror r1 and
end mirror r2 is, against psi, the round-trip phase k L_rt past resonance (psi > 0: the light
above the cavity's resonance),
    F(psi) = (-r1 + r2 e^{-i psi}) / (1 - r1 r2 e^{-i psi})
(up to an overall phase, which cancels below). Sideband n is n theta further round each
round trip, theta = 2 pi Omega L_rt / c. The reflected power is |sum_n a_n e^{i n Omega t}|^2,
a_n = J_n F(psi + n theta): its DC, and its beats at Omega and 2 Omega as complex amplitudes
A_k = 2 sum_n conj(a_n) a_{n+k}, the power holding |A_k| cos(k Omega t + arg A_k). Black's eq. (4.5) and what follows are
the first sidebands of this sum; all orders to |n| = 12 are kept here, so the reference is
exact for any beta.

Cavity: 250 mm, input mirror R = 99%, end mirror R = 99.9% (curved, 500 mm, and the laser
mode-matched to it), 1064 nm; 20 MHz, beta = 0.5 and 1.08; 1 mW.

    python pdh_black.py
"""
import json, math, os
import numpy as np
from scipy.special import jv

R1, R2, L_mm, fm, P0 = 0.99, 0.999, 250.0, 20e6, 1.0
r1, r2 = math.sqrt(R1), math.sqrt(R2)
theta = 2 * math.pi * fm * (2 * L_mm) / 299792458e3
F = lambda e: (-r1 + r2 * np.exp(-1j * e)) / (1 - r1 * r2 * np.exp(-1j * e))
# fine (1e-4 rad) within 0.03 rad of the carrier's and first sidebands' resonances, 2e-3 elsewhere
eps = np.unique(np.round(np.concatenate([np.arange(-175, 176) * 2e-3] + [c + np.arange(-300, 301) * 1e-4 for c in (-theta, 0.0, theta)]), 6))
eps = eps[np.abs(eps) <= 0.35]

out = {'R1': R1, 'R2': R2, 'L_mm': L_mm, 'fm_Hz': fm, 'P0_mW': P0, 'theta': theta, 'eps': eps.tolist(), 'cases': []}
for beta in (0.5, 1.08):
    ns = range(-12, 13)
    a = {n: jv(n, beta) * F(eps + n * theta) for n in ns}
    dc = sum(abs(a[n]) ** 2 for n in ns) * P0
    T1 = 2 * sum(np.conj(a[n]) * a[n + 1] for n in ns if n + 1 in a) * P0
    T2 = 2 * sum(np.conj(a[n]) * a[n + 2] for n in ns if n + 2 in a) * P0
    # Black's first-sideband formula, for comparison: 2 sqrt(Pc Ps) |F*(e) F(e+th) - F(e) F*(e-th)|
    Pc, Ps = jv(0, beta) ** 2 * P0, jv(1, beta) ** 2 * P0
    black = 2 * math.sqrt(Pc * Ps) * (np.conj(F(eps)) * F(eps + theta) - F(eps) * np.conj(F(eps - theta)))
    r = lambda z: [round(float(v), 6) for v in z]
    out['cases'].append({'beta': beta, 'dc': r(dc), 'T1re': r(T1.real), 'T1im': r(T1.imag), 'T2re': r(T2.real), 'T2im': r(T2.imag),
                         'black_first_order_max_diff': float(np.max(np.abs(np.abs(black) - np.abs(T1))))})
    print('beta', beta, 'peak |T1| %.4f mW' % np.max(np.abs(T1)), 'min DC %.4f' % dc.min(),
          'Black first-order formula differs from all orders by up to %.2g mW' % out['cases'][-1]['black_first_order_max_diff'])
path = os.path.join(os.path.dirname(__file__), '..', 'ref', 'pdh-black.json')
with open(path, 'w') as f:
    json.dump(out, f)
