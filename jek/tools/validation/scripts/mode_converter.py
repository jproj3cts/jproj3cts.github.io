"""The pi/2 cylindrical-lens mode converter.

M. W. Beijersbergen, L. Allen, H. E. L. O. van der Veen and J. P. Woerdman, "Astigmatic laser
mode converters and transfer of orbital angular momentum", Opt. Commun. 96, 123-132 (1993).
Two cylindrical lenses of focal length f, f sqrt(2) apart, with a mode-matched beam (its
waist midway, its Rayleigh range (1 + 1/sqrt 2) f) add a Gouy phase of pi/2 between the two
axes of the lenses, which turns a Laguerre-Gauss LG0,1 into a Hermite-Gauss HG1,0 lying at 45
degrees, with the beam's own size and waist unchanged. Here JEKray2D's example: 632.8 nm,
f = 50 mm, a 0.1311 mm waist, the screen 264.6 mm past it. There the mode is
    I(u, v) = (2P / pi w^2) (4 u^2 / w^2) exp(-2 (u^2 + v^2) / w^2),   u along a diagonal,
w = w0 sqrt(1 + (z/zR)^2). Its lobes peak at 4P/(e pi w^2), and across the screen x and y
correlate by +-1/2 (<xy> / sqrt(<x^2><y^2>)), where the ring the mode started as has none.

    python mode_converter.py
"""
import json, math, os

lam, f, P = 632.8e-6, 50.0, 1.0
zR = (1 + 1 / math.sqrt(2)) * f
w0 = math.sqrt(lam * zR / math.pi)
d = f * math.sqrt(2)
z = 300.0 - d / 2                       # the screen at 300 mm, the lenses at 0 and d, the waist midway
w = w0 * math.sqrt(1 + (z / zR) ** 2)
out = {'nm': 632.8, 'f_mm': f, 'lens_sep_mm': d, 'zR_mm': zR, 'w0_mm': w0, 'source_x_mm': -100.0, 'source_z0_mm': 100.0 + d / 2,
       'screen_x_mm': 300.0, 'z_mm': z, 'w_mm': w, 'lobe_peak': 4 * P / (math.e * math.pi * w * w), 'correlation': 0.5, 'P_mW': P}
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'mode-converter.json'), 'w'), indent=1)
print(out)
