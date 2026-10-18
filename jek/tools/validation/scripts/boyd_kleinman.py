"""Second-harmonic generation with focused Gaussian beams.

G. D. Boyd and D. A. Kleinman, "Parametric interaction of focused Gaussian light beams",
J. Appl. Phys. 39, 3597-3639 (1968). Without walk-off or absorption, the harmonic power
grows as P2 = eta P1^2 with
    eta = 16 pi^2 d^2 L h / (eps0 c lambda^3 n1 n2),
    h(sigma, xi, mu) = 1/(4 xi) | int_{-xi(1-mu)}^{xi(1+mu)} e^{i sigma t} / (1 + i t) dt |^2,
xi = L / b the crystal's length over the confocal parameter inside it, mu the focus's offset
from the centre (in half-lengths), sigma the phase mismatch in units of 2/b. Their optimum:
h = 1.068 at xi = 2.84, sigma = 0.57.

Here h is integrated independently (scipy's adaptive quadrature), maximised over sigma at a
range of focusings and focus offsets, and at fixed sigma; the global optimum is found; and
for a bench (0.01 W at 1064 nm focused to xi = 2.84 at the centre of 50 mm of MgO:PPLN at
40 C, d_eff 14 pm/V, the index from Gayer et al., Appl. Phys. B 91, 343 (2008)) the
efficiency and harmonic power are worked out. The beam in air is set so its waist inside the
crystal (where its Rayleigh range is n times longer, and its waist n times further from the
entrance face) sits at the centre.

    python boyd_kleinman.py
"""
import json, math, os
import numpy as np
from scipy.integrate import quad
from scipy.optimize import minimize_scalar

def H(sigma, xi, mu=0.0):
    a, b = -xi * (1 - mu), xi * (1 + mu)
    re = quad(lambda t: (math.cos(sigma * t) + t * math.sin(sigma * t)) / (1 + t * t), a, b, limit=400, epsabs=1e-13, epsrel=1e-12)[0]
    im = quad(lambda t: (math.sin(sigma * t) - t * math.cos(sigma * t)) / (1 + t * t), a, b, limit=400, epsabs=1e-13, epsrel=1e-12)[0]
    return (re * re + im * im) / (4 * xi)

def best(xi, mu=0.0):
    s = np.linspace(-1, 4, 501); v = [H(x, xi, mu) for x in s]; s0 = s[int(np.argmax(v))]
    r = minimize_scalar(lambda x: -H(x, xi, mu), bracket=(s0 - 0.02, s0, s0 + 0.02), tol=1e-10)
    return float(r.x), float(-r.fun)

rows = []
for xi in (0.1, 0.3, 1.0, 2.0, 2.84, 5.0, 10.0, 20.0):
    for mu in (0.0, 0.5):
        s, h = best(xi, mu)
        rows.append({'xi': xi, 'mu': mu, 'sigma_best': s, 'h_best': h, 'h_sigma0': H(0.0, xi, mu), 'h_sigma1': H(1.0, xi, mu)})
        print(rows[-1])
r = minimize_scalar(lambda x: -best(x)[1], bounds=(2, 4), method='bounded', options={'xatol': 1e-6})
opt = {'xi': float(r.x), 'sigma': best(r.x)[0], 'h': best(r.x)[1], 'paper': {'xi': 2.84, 'sigma': 0.57, 'h': 1.068}}
print(opt)

# a bench: MgO:PPLN (Gayer et al. 2008), extraordinary index
def n_ppln(um, T):
    f = (T - 24.5) * (T + 570.82); l2 = um * um
    return math.sqrt(5.756 + 2.860e-6 * f + (0.0983 + 4.700e-8 * f) / (l2 - (0.2020 + 6.113e-8 * f) ** 2) + (189.32 + 1.516e-4 * f) / (l2 - 12.52 ** 2) - 1.32e-2 * l2)
EPS0, C = 8.8541878128e-12, 299792458.0
nm, T, L, d, P1, xi = 1064.0, 40.0, 50e-3, 14e-12, 0.01, 2.84
n1, n2 = n_ppln(nm / 1e3, T), n_ppln(nm / 2e3, T)
b = L / xi                                  # confocal parameter inside, m
zR_air = b / 2 / n1                         # the Rayleigh range the beam has in air
w0 = math.sqrt(nm * 1e-9 * zR_air / math.pi)
s, h = best(xi)
eta = 16 * math.pi ** 2 * d ** 2 * L * h / (EPS0 * C * (nm * 1e-9) ** 3 * n1 * n2)
bench = {'nm': nm, 'T': T, 'L_mm': L * 1e3, 'd_pm': d * 1e12, 'P1_W': P1, 'xi': xi, 'n1': n1, 'n2': n2, 'w0_mm': w0 * 1e3,
         'waist_in_air_from_face_mm': L / 2 / n1 * 1e3, 'h': h, 'sigma': s, 'eta_per_W': eta, 'P2_W': P1 * math.tanh(math.sqrt(eta * P1)) ** 2}
print(bench)
path = os.path.join(os.path.dirname(__file__), '..', 'ref', 'boyd-kleinman.json')
with open(path, 'w') as f:
    json.dump({'source': 'Boyd and Kleinman, J. Appl. Phys. 39, 3597 (1968): h integrated independently', 'rows': rows, 'optimum': opt, 'bench': bench}, f, indent=1)
