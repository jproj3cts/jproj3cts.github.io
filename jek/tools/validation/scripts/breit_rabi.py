"""The ground-state hyperfine levels of 87Rb and 133Cs in a magnetic field: the Breit-Rabi formula.

G. Breit and I. I. Rabi, "Measurement of nuclear spin", Phys. Rev. 38, 2082-2083 (1931). For a
J = 1/2 ground state of nuclear spin I and hyperfine splitting dE = A (I + 1/2),
    E(F = I +- 1/2, m) = -dE / (2 (2I + 1)) + g_I mu_B m B +- (dE / 2) sqrt(1 + 4 m x / (2I + 1) + x^2),
    x = (g_J - g_I) mu_B B / dE,
from the hyperfine centroid; for m = -(I + 1/2) the root is taken as (1 - x), so the stretched
state's energy is linear in B on both sides of x = 1. The constants are D. A. Steck's, "Rubidium
87 D Line Data" and "Cesium D Line Data": A, g_J (measured), g_I; mu_B / h = 1.39962449361
MHz/G (CODATA 2018). The clock transition (m = 0 to m = 0) moves quadratically, by
(g_J - g_I)^2 mu_B^2 B^2 / (2 h dE), which Steck tabulates as 575.15 Hz/G^2 (Rb 87) and
427.45 Hz/G^2 (Cs); the script checks the formula gives those back.

    python breit_rabi.py
"""
import json, math, os

MUB = 1.39962449361                             # MHz per gauss
ATOMS = {
    'Rb87': {'I': 1.5, 'A': 3417.341305452145, 'gJ': 2.00233113, 'gI': -0.0009951414, 'clock_Hz_G2': 575.15},
    'Cs133': {'I': 3.5, 'A': 2298.1579425, 'gJ': 2.00254032, 'gI': -0.00039885395, 'clock_Hz_G2': 427.45},
}

def levels(a, B):
    I, A, gJ, gI = a['I'], a['A'], a['gJ'], a['gI']
    dE = A * (I + 0.5)
    x = (gJ - gI) * MUB * B / dE
    out = []
    for Fsign in (+1, -1):
        F = I + 0.5 * Fsign
        m = -F
        while m <= F + 1e-9:
            if abs(m) > I + 0.5 - 1e-9:               # the stretched states: linear in B
                root = 1 + x * (1 if m > 0 else -1) if Fsign > 0 else None
                if root is None:
                    m += 1; continue
                E = -dE / (2 * (2 * I + 1)) + gI * MUB * m * B + dE / 2 * root
            else:
                E = -dE / (2 * (2 * I + 1)) + gI * MUB * m * B + Fsign * dE / 2 * math.sqrt(1 + 4 * m * x / (2 * I + 1) + x * x)
            out.append({'F': F, 'mF': m, 'E_MHz': E})
            m += 1
    return out

FIELDS = [0, 1, 10, 100, 300, 1000, 2000, 3000]
res = {}
for name, a in ATOMS.items():
    I = a['I']
    rows = [{'B_G': B, 'levels': levels(a, B)} for B in FIELDS]
    assert all(len(r['levels']) == int(2 * (2 * I + 1)) for r in rows)
    # at no field, the two hyperfine levels a splitting A (I + 1/2) apart
    L0 = rows[0]['levels']
    dE = max(l['E_MHz'] for l in L0) - min(l['E_MHz'] for l in L0)
    assert abs(dE - a['A'] * (I + 0.5)) < 1e-9
    # the clock shift at 1 G against Steck's figure
    L1 = levels(a, 1.0)
    f = lambda F: next(l['E_MHz'] for l in L1 if l['F'] == F and l['mF'] == 0)
    clock = ((f(I + 0.5) - f(I - 0.5)) - dE) * 1e6
    print(name, 'clock shift at 1 G', clock, 'Hz; Steck', a['clock_Hz_G2'])
    assert abs(clock / a['clock_Hz_G2'] - 1) < 2e-4
    curve = []
    for k in range(121):
        B = 3000 * k / 120
        curve.append([B] + [l['E_MHz'] for l in sorted(levels(a, B), key=lambda l: (-l['F'], l['mF']))])
    res[name] = {**a, 'dE_MHz': dE, 'rows': rows, 'clock_at_1G_Hz': clock, 'curve': curve}

with open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'breit-rabi.json'), 'w') as f:
    json.dump({'source': 'Breit and Rabi, Phys. Rev. 38, 2082 (1931), with Steck\'s constants; energies in MHz from the hyperfine centroid',
               'muB_MHz_G': MUB, 'atoms': res}, f, indent=1)
