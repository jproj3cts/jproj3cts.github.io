"""A beam of M^2 > 1 and its embedded Gaussian (Siegman).

A real beam of beam quality M^2 = 4 at 1064 nm, its second-moment waist W0 = 0.5 mm (W the
second-moment radius, 2 sigma). A. E. Siegman (Lasers, 1986, ch. 17; Proc. SPIE 1224, 2
(1990)) showed that any such beam's width propagates as
    W(z)^2 = W0^2 + (M^2 lambda / (pi W0))^2 (z - z0)^2,
exactly, in free space and through any paraxial optics, and that it is M times the width of
an "embedded" Gaussian of waist W0 / M, which follows the ordinary ABCD law. Here: the
width in free space out to 800 mm, and through an ideal thin lens of focal length 150 mm
placed 300 mm past the waist. The width after the lens is worked out both ways, by the
embedded Gaussian's q and by the second-moment matrix law
    [<x^2>, <x theta>, <theta^2>] through [[A, B], [C, D]],
and the two must agree.

    python embedded_gaussian.py
"""
import json, math, os
import numpy as np

lam, M2, W0, f, zl = 1064e-6, 4.0, 0.5, 150.0, 300.0
we = W0 / math.sqrt(M2)
zR = math.pi * we ** 2 / lam                       # the embedded Gaussian's Rayleigh range = the real beam's
th = M2 * lam / (math.pi * W0)                     # the real beam's far-field half-angle

W_free = lambda z: W0 * math.sqrt(1 + (z / zR) ** 2)


def W_embedded(z):
    """through the lens at zl: the embedded Gaussian's q by ABCD, times M"""
    q = complex(zl, zR)                            # at the lens
    q = q / (-q / f + 1)                           # thin lens
    q = q + (z - zl)
    w = math.sqrt(-lam / (math.pi * (1 / q).imag))
    return math.sqrt(M2) * w


def W_moments(z, lens=True):
    """the same by the second moments: sigma = W/2 at the waist, theta spread th/2"""
    S = np.array([[(W0 / 2) ** 2, 0], [0, (th / 2) ** 2]])
    T = lambda L: np.array([[1, L], [0, 1]])
    Lf = np.array([[1, 0], [-1 / f, 1]])
    M = T(z - zl) @ Lf @ T(zl) if lens and z > zl else T(z)
    S2 = M @ S @ M.T
    return 2 * math.sqrt(S2[0, 0])


q = complex(zl, zR); q = q / (-q / f + 1)
waist_after = -q.real                              # the waist past the lens, mm
rows = []
for z in (0.0, 0.5 * zR, zR, 400.0, 800.0):
    assert abs(W_moments(z, False) - W_free(z)) < 1e-12
    rows.append({'z_mm': z, 'after_lens': False, 'W_mm': W_free(z)})
for t in (100.0, waist_after, 250.0, 400.0):
    z = zl + t
    a, b = W_embedded(z), W_moments(z)
    assert abs(a - b) < 1e-12 * a, (a, b)
    rows.append({'z_mm': z, 'after_lens': True, 'past_lens_mm': t, 'W_mm': a})
# what a TEM00 beam of the same 0.5 mm waist would do through the same lens, for the note
q0 = complex(zl, math.pi * W0 ** 2 / lam); q0 = q0 / (-q0 / f + 1)
out = {'lambda_nm': 1064, 'M2': M2, 'W0_mm': W0, 'embedded_w0_mm': we, 'zR_mm': zR, 'theta_mrad': 1e3 * th, 'f_mm': f, 'lens_at_mm': zl,
       'waist_after_lens_mm': waist_after, 'W_waist_after_mm': W_embedded(zl + waist_after), 'tem00_waist_after_mm': -q0.real, 'rows': rows}
with open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'embedded-gaussian.json'), 'w') as fh:
    json.dump(out, fh, indent=1)
print('zR %.3f mm, theta %.4f mrad; after the lens the waist is %.3f mm past it, W %.5f mm (a TEM00 beam: %.3f mm past it)' % (zR, 1e3 * th, waist_after, W_embedded(zl + waist_after), -q0.real))
for r in rows: print(r)
