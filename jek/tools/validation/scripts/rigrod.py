"""A laser's output against its output coupling: Rigrod's saturated homogeneous gain.

W. W. Rigrod, "Saturation effects in high-gain lasers", J. Appl. Phys. 36, 2487-2490 (1965).
A homogeneously broadened medium of small-signal gain g0 L between mirrors R1 and R2 (no other
loss) saturates as dI/dz = g0 I / (1 + (I+ + I-) / Isat) for both waves; I+ I- is then constant
along it, and the output through mirror 2 is exactly
    I_out = Isat T2 sqrt(R1) / ((sqrt(R1) + sqrt(R2)) (1 - sqrt(R1 R2))) (g0 L + ln sqrt(R1 R2)),
whatever the gain's length or where it sits, so long as the gain fills the beam uniformly: a
plane wave over an area A, P = I A. Threshold is at R2 = 1 / (R1 exp(2 g0 L)); between it and
R2 = 1 the output has a maximum, the optimum coupling.

Here JEKray2D's gain sheet (single-pass small-signal power gain G0 = exp(g0 L) = 2, Nd:YAG's
Isat = 2.9 kW/cm^2) 10 mm from a flat mirror of 99.5%, a concave output coupler (R = 500 mm)
250 mm away, at 1064 nm. JEKray2D takes the beam's area at the gain as pi w^2 / 2 for the cavity
mode's radius w there (the area over which a Gaussian of peak intensity I carries P), and the
same is used here: w from the plano-concave resonator's mode, w0^2 = (lambda / pi) sqrt(L (R - L))
at the flat mirror. The closed form is checked against the two waves integrated through the
medium numerically.

    python rigrod.py
"""
import json, math, os
import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq, minimize_scalar

lam, L, Rc, zg, R1, G0, Isat = 1064e-6, 250.0, 500.0, 10.0, 0.995, 2.0, 2.9 * 10   # mm, W/mm^2
g0L = math.log(G0)
w0sq = lam / math.pi * math.sqrt(L * (Rc - L)); zR = math.pi * w0sq / lam
w = math.sqrt(w0sq * (1 + (zg / zR) ** 2))
Psat = Isat * math.pi * w * w / 2

def rigrod(T2):
    R2 = 1 - T2
    return max(0.0, Psat * T2 * math.sqrt(R1) / ((math.sqrt(R1) + math.sqrt(R2)) * (1 - math.sqrt(R1 * R2))) * (g0L + math.log(math.sqrt(R1 * R2))))

def numeric(T2):
    """shoot: the forward wave leaving mirror 1 with s (in Psat), through a medium of unit length"""
    R2 = 1 - T2
    def end(s):
        # y = [forward, backward]; the backward is set at z = 0 by mirror 1: b(0) = s / R1
        f = lambda z, y: [g0L * y[0] / (1 + y[0] + y[1]), -g0L * y[1] / (1 + y[0] + y[1])]
        r = solve_ivp(f, [0, 1], [s, s / R1], rtol=1e-11, atol=1e-14)
        return r.y[1, -1] - R2 * r.y[0, -1], r.y[0, -1]
    # the backward wave launched at z = 0 must be the one mirror 2 sends back: shoot on s
    # (for s the backward at 0 is s / R1; integrate it forward as a decaying wave and match at z = 1)
    s = brentq(lambda s: end(s)[0], 1e-9, 1e3)
    return end(s)[1] * T2 * Psat

Ts = [0.02, 0.05, 0.10, 0.20, 0.35, 0.50, 0.65]
rows = []
for T in Ts:
    a, b = rigrod(T), numeric(T)
    assert abs(a - b) < 1e-6 * a, (T, a, b)
    rows.append({'T': T, 'P_W': a})
    print('T %.2f: %.5f W (integrated %.5f)' % (T, a, b))
Tth = 1 - 1 / (R1 * G0 * G0)
opt = minimize_scalar(lambda T: -rigrod(T), bounds=(1e-4, Tth - 1e-6), method='bounded', options={'xatol': 1e-10})
out = {'nm': 1064, 'L_mm': L, 'Roc_mm': Rc, 'gain_at_mm': zg, 'R1': R1, 'G0': G0, 'isat_kW_cm2': 2.9, 'w_mm': w, 'Psat_W': Psat,
       'rows': rows, 'T_threshold': Tth, 'T_opt': opt.x, 'P_opt_W': rigrod(opt.x)}
print('w at the gain %.5f mm, Psat %.4f W, threshold T %.4f, optimum T %.5f giving %.5f W' % (w, Psat, Tth, opt.x, rigrod(opt.x)))
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'rigrod.json'), 'w'), indent=1)
