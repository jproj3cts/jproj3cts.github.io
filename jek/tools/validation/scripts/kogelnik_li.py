"""Reference values for two-mirror resonators from the closed forms in
H. Kogelnik and T. Li, "Laser beams and resonators", Appl. Opt. 5, 1550 (1966),
section on the stability and the Gaussian mode of a resonator with two mirrors.

With g1 = 1 - L/R1, g2 = 1 - L/R2 (R > 0 concave, None for flat):
  w1^2 = (lambda L / pi) sqrt(g2 / (g1 (1 - g1 g2)))        spot on mirror 1
  w2^2 = (lambda L / pi) sqrt(g1 / (g2 (1 - g1 g2)))        spot on mirror 2
  w0^2 = (lambda L / pi) sqrt(g1 g2 (1 - g1 g2) / (g1 + g2 - 2 g1 g2)^2)
  z1   = L g2 (1 - g1) / (g1 + g2 - 2 g1 g2)                 waist distance from mirror 1
  transverse mode spacing / FSR = arccos(+-sqrt(g1 g2)) / pi (minus when g1, g2 < 0)
"""
import json, math, os

LAM = 632.8e-6          # mm: the helium-neon line of the paper's era
CASES = [
    ('Plane-concave, g = (1, 0.5)', None, 1000.0, 500.0),
    ('Symmetric near-confocal, g = 0.1', 555.5555555555556, 555.5555555555556, 500.0),
    ('Asymmetric, g = (0.7, 0.2)', 2000.0, 750.0, 600.0),
    ('Symmetric near-concentric, g = -0.9', 263.1578947368421, 263.1578947368421, 500.0),
    ('Symmetric near-planar, g = 0.97', 10000.0, 10000.0, 300.0),
    ('Convex-concave, g = (1.6, 0.6)', -1000.0, 1500.0, 600.0),
]

def mode(R1, R2, L):
    g1 = 1 - (L / R1 if R1 else 0.0)
    g2 = 1 - (L / R2 if R2 else 0.0)
    p = g1 * g2
    k = LAM * L / math.pi
    out = {'g1': g1, 'g2': g2,
           'w1': math.sqrt(k * math.sqrt(g2 / (g1 * (1 - p)))),
           'w2': math.sqrt(k * math.sqrt(g1 / (g2 * (1 - p)))),
           'w0': math.sqrt(k * math.sqrt(p * (1 - p) / (g1 + g2 - 2 * p) ** 2)),
           'z1': L * g2 * (1 - g1) / (g1 + g2 - 2 * p),
           'tmsFrac': math.acos((1 if g1 > 0 else -1) * math.sqrt(p)) / math.pi}
    return out

cases = []
for name, R1, R2, L in CASES:
    cases.append({'name': name, 'R1': R1, 'R2': R2, 'L': L, **mode(R1, R2, L)})
out = {'source': 'Kogelnik and Li, Appl. Opt. 5, 1550 (1966): closed forms for the two-mirror resonator',
       'lambda_nm': LAM * 1e6, 'cases': cases}
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'kogelnik-li.json'), 'w'), indent=1)
print(json.dumps(out, indent=1))
