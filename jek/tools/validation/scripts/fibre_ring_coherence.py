"""A fibre ring resonator, and a fibre Mach-Zehnder lit by a laser of finite linewidth.

The ring: a lossless 2x2 coupler that crosses a share kappa of the power, one output joined
back to an input by a loop that passes a share a^2 of it (an attenuator in the loop) with a
round-trip phase phi. The power through it (Yariv, Electron. Lett. 36, 321 (2000)):

  T(phi) = (a^2 - 2 a t cos phi + t^2) / (1 - 2 a t cos phi + a^2 t^2),   t = sqrt(1 - kappa)

The Mach-Zehnder: two 50% couplers, arms differing in length by dL, so the two fields reach
the photodiode a delay tau = n_g dL / c apart. With a laser whose line has a full width dnu,
the fringes' visibility is the modulus of its complex degree of coherence at tau (the
Wiener-Khinchin theorem: J. W. Goodman, Statistical Optics, Wiley 1985, ch. 5):

  Lorentzian line:  |gamma(tau)| = exp(-pi dnu tau)
  Gaussian line:    |gamma(tau)| = exp(-(pi dnu tau)^2 / (4 ln 2))

and the power at one output is P0/2 (1 + V cos phase). dnu is given as the coherence length
Lc = c / dnu, so pi dnu tau = pi n_g dL / Lc. n_g = 1.468, the group index JEKray gives fibre
(an assumption: the reference needs only tau).

    python fibre_ring_coherence.py
"""
import json, math, os
import numpy as np

def ring_T(kappa, a, phi):
    t = math.sqrt(1 - kappa)
    return (a * a - 2 * a * t * math.cos(phi) + t * t) / (1 - 2 * a * t * math.cos(phi) + a * a * t * t)

def ring_T_sum(kappa, a, phi, n=20000):
    """the same by following the light round: t + sum over turns of the cross-coupled field"""
    t, x = math.sqrt(1 - kappa), 1j * math.sqrt(kappa)
    e = a * np.exp(-1j * phi)
    return abs(t + x * x * e * sum((t * e) ** m for m in range(n))) ** 2

phis = [-math.pi, -1.0, -0.5, -0.2, -0.1, -0.05, -0.02, -0.01, 0.0, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0]
rings = []
for kappa, att_dB in [(0.10, 1.0), (0.20, 0.97)]:
    a = 10 ** (-att_dB / 20)
    rows = [{'phi': p, 'T': ring_T(kappa, a, p)} for p in phis]
    for r in rows: assert abs(ring_T_sum(kappa, a, r['phi']) - r['T']) < 1e-12
    rings.append({'kappa': kappa, 'att_dB': att_dB, 'a': a, 'rows': rows})

NG, Lc = 1.468, 1000.0
mz = []
for shape in ['lorentz', 'gauss']:
    rows = []
    for dL in [0, 25, 50, 100, 200, 400, 800]:
        x = math.pi * NG * dL / Lc
        V = math.exp(-x) if shape == 'lorentz' else math.exp(-x * x / (4 * math.log(2)))
        rows.append({'dL_mm': dL, 'V': V})
    mz.append({'lineshape': shape, 'Lc_mm': Lc, 'n_g': NG, 'P0_mW': 1.0, 'rows': rows})

out = {'source': 'Yariv, Electron. Lett. 36, 321 (2000) (the ring); Goodman, Statistical Optics (1985), ch. 5 (visibility and linewidth)',
       'rings': rings, 'mz': mz}
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, '..', 'ref', 'fibre-ring-coherence.json'), 'w') as f:
    json.dump(out, f, indent=1)
for R in rings: print(R['kappa'], R['a'], [round(r['T'], 6) for r in R['rows']])
for M in mz: print(M['lineshape'], [round(r['V'], 6) for r in M['rows']])
