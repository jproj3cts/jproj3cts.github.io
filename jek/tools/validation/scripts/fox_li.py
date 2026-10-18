"""Reference losses for A. G. Fox and T. Li, "Resonant modes in a maser interferometer",
Bell Syst. Tech. J. 40, 453 (1961): two identical flat circular mirrors of radius a,
L apart, Fresnel number N = a^2 / (lambda L).

Their integral equation for one transit, in the paraxial (Fresnel) form, for the modes
with no azimuthal variation, in r measured in units of a:
    gamma u(r) = -i 2 pi N  int_0^1  J0(2 pi N r r') exp(-i pi N (r^2 + r'^2)) u(r') r' dr'
The fundamental is the eigenvector of largest |gamma|; its power loss per transit is
1 - |gamma|^2. Solved here by Gauss-Legendre quadrature and a dense eigensolver, at two
resolutions to show the figures have converged.

This is an independent numerical solution of the paper's equation, not the paper's own
curve; the paper's points are added to the reference once they are read off its figure.
"""
import json, os
import numpy as np
from scipy.special import j0

def loss(N, n):
    x, w = np.polynomial.legendre.leggauss(n)
    r, w = 0.5 * (x + 1), 0.5 * w
    K = (-2j * np.pi * N) * j0(2 * np.pi * N * np.outer(r, r)) * np.exp(-1j * np.pi * N * (r[:, None] ** 2 + r[None, :] ** 2)) * (r * w)[None, :]
    g = np.linalg.eigvals(K)
    g = g[np.argmax(np.abs(g))]
    return 1 - abs(g) ** 2

NS = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0]
rows = []
for N in NS:
    a, b = loss(N, 300), loss(N, 600)
    rows.append({'N': N, 'loss': b, 'converged': abs(a - b)})
    print(N, b, abs(a - b))
out = {'source': 'Fox and Li, Bell Syst. Tech. J. 40, 453 (1961): flat circular mirrors, fundamental mode',
       'method': 'the paper\'s Fresnel integral equation, solved independently (Gauss-Legendre, 600 points, dense eigensolver)',
       'paperPoints': None, 'rows': rows}
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'fox-li.json'), 'w'), indent=1)
