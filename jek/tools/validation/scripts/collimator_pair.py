"""Fibre to fibre through a pair of collimators: the coupling against the gap, the lenses and an offset.

Light leaves a single-mode fibre (core 8.2 um, NA 0.14, 1550 nm) through a collimating lens
of focal length f1 and is taken into a second such fibre through a lens of focal length f2,
a gap D away. Each fibre's mode is the Gaussian of Marcuse's formula (D. Marcuse, Bell Syst.
Tech. J. 56, 703 (1977)), w = 4.610 um here; a thin lens of focal length f, the fibre at its
focus, makes of it a beam whose waist is on the lens, of radius W = lambda f / (pi w) (the
ABCD law: H. Kogelnik and T. Li, Applied Optics 5, 1550 (1966)). The second collimator takes
in by the same rule, so the coupling is the overlap of the first beam, D past its waist, with
the second's mode on its lens: in closed form, as in the coupling case (W. B. Joyce and
B. C. DeLoach, Applied Optics 23, 4187 (1984)), across the bench plane and out of it, with the
second collimator moved across by an offset in the plane where one is given.

    python collimator_pair.py
"""
import json, math, os
import numpy as np

lam, core, NA = 1550e-6, 8.2e-3, 0.14
a = core / 2
V = 2 * math.pi * a * NA / lam
w = a * (0.65 + 1.619 * V ** -1.5 + 2.879 * V ** -6)
k = 2 * math.pi / lam


def gint(A, B):
    return np.sqrt(math.pi / A) * np.exp(B * B / (4 * A))


def overlap1(W1, W2, D, off=0.0):
    """one axis: a beam of waist W1, D past it, centred at off, against a mode of waist W2 (flat) at 0"""
    qb = complex(D, math.pi * W1 * W1 / lam)
    Ab = 1j * k / (2 * qb)
    ov = gint(Ab + 1 / W2 ** 2, 2 * Ab * off) * np.exp(-Ab * off * off)
    nb = gint(2 * Ab.real, 2 * (2 * Ab * off).real) * np.exp(2 * (-Ab * off * off).real)
    return abs(ov) ** 2 / (nb * math.sqrt(math.pi / (2 / W2 ** 2)))


def eta(f1, f2, D, off=0.0):
    W1, W2 = lam * f1 / (math.pi * w), lam * f2 / (math.pi * w)
    return float(overlap1(W1, W2, D, off) * overlap1(W1, W2, D))


# checks: equal beams, no gap, no offset: everything; a gap alone: 1 / (1 + (D / 2 zR)^2); an offset alone: exp(-off^2 / W^2)
W = lam * 11 / (math.pi * w); zR = math.pi * W * W / lam
assert abs(eta(11, 11, 0) - 1) < 1e-12
assert abs(eta(11, 11, 700) - 1 / (1 + (700 / (2 * zR)) ** 2)) < 1e-12
assert abs(eta(11, 11, 0, 0.5) - math.exp(-0.25 / W ** 2)) < 1e-12

rows = []
for f1, f2, D, off in ((11, 11, 50, 0), (11, 11, 500, 0), (11, 11, 2000, 0), (11, 11, 5000, 0), (11, 8, 100, 0), (11, 18.4, 100, 0), (4.5, 11, 100, 0),
                       (11, 11, 100, 0.5), (11, 11, 100, 1.0), (11, 15, 300, 0.4)):
    rows.append({'f1_mm': f1, 'f2_mm': f2, 'gap_mm': D, 'off_mm': off, 'W1_mm': lam * f1 / (math.pi * w), 'W2_mm': lam * f2 / (math.pi * w), 'eta': eta(f1, f2, D, off)})
out = {'lambda_nm': 1550, 'core_um': 8.2, 'na': NA, 'w_mode_um': 1e3 * w, 'rows': rows}
with open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'collimator-pair.json'), 'w') as fh:
    json.dump(out, fh, indent=1)
print('mode %.4f um; a collimator of 11 mm makes a beam of %.4f mm, Rayleigh range %.0f mm' % (1e3 * w, W, zR))
for r in rows: print(r)
