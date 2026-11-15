"""The coupling between two Gaussian beams: two horns facing each other.

Goldsmith, Quasioptical Systems (IEEE Press, 1998), ch. 4: the power one fundamental Gaussian
beam passes to another is the square of their overlap,

  K = |int E_t E_r dA|^2 / (int |E_t|^2 dA int |E_r|^2 dA),

E_t the transmitted beam where the receiving horn's aperture is, E_r the field the receiving
horn would itself send out from there (by reciprocity, what it takes in best is that field
travelling back). For two beams on one axis, waists w01 and w02 a distance dz apart, this is
Goldsmith's

  K = 4 / ((w01/w02 + w02/w01)^2 + (lambda dz / (pi w01 w02))^2),

and with the waists in one plane, an offset x0 gives K0 exp(-2 x0^2 / (w01^2 + w02^2)) and a
tilt theta K0 exp(-2 (pi theta)^2 w01^2 w02^2 / (lambda^2 (w01^2 + w02^2))). Here the overlap
is worked out in general, paraxially, as Gaussian integrals in closed form (each beam
exp(-p x^2), p = 1/w^2 + i k / 2R, an offset moving the receiver's, a tilt adding exp(-i k
theta x)), and checked against those three formulas where they hold.

The horns are ideal Gaussian horns: the beam at the aperture of radius a has w = 0.6435 a on a
phase front of radius L, the horn's slant length (Goldsmith ch. 7), and comes from a waist
w0 = w / sqrt(1 + (pi w^2 / lambda L)^2), z = L / (1 + (lambda L / pi w^2)^2) behind the aperture.
A flat aperture is L = 1e5 mm. The transmitter's aperture is at 0, the receiver's at D; the
receiver is offset across the axis or turned about its aperture's centre. 100 GHz throughout.

    python gaussian_coupling.py
"""
import json, math, os, cmath

C_MM_GHZ = 299792458e-6
lam = C_MM_GHZ / 100.0
k = 2 * math.pi / lam

def aperture(a, L):
    """a Gaussian horn's beam at its aperture (w, R) and its waist (w0, how far behind)"""
    w = 0.6435 * a
    x = math.pi * w * w / (lam * L)
    return w, L, w / math.sqrt(1 + x * x), L / (1 + 1 / (x * x))

def beam_at(w0, z):
    """a Gaussian beam's radius and phase radius z past its waist"""
    zR = math.pi * w0 * w0 / lam
    return w0 * math.sqrt(1 + (z / zR) ** 2), (z * (1 + (zR / z) ** 2) if z != 0 else math.inf)

def g1(A, B, C):
    """int exp(-A x^2 + B x + C) dx over the line"""
    return cmath.sqrt(math.pi / A) * cmath.exp(B * B / (4 * A) + C)

def coupling(at, Lt, ar, Lr, D, x0=0.0, theta=0.0):
    _, _, w01, z1 = aperture(at, Lt)
    w1, R1 = beam_at(w01, D + z1)
    w2, R2, _, _ = aperture(ar, Lr)
    p1 = 1 / w1 ** 2 + 1j * k / (2 * R1)
    p2 = 1 / w2 ** 2 + 1j * k / (2 * R2)
    t = theta * math.pi / 180
    # across the bench plane: the offset and the tilt; out of it: neither
    Ix = g1(p1 + p2, 2 * p2 * x0 - 1j * k * t, -p2 * x0 * x0 + 1j * k * t * x0)
    Iy = g1(p1 + p2, 0, 0)
    n1 = math.pi / (2 * p1.real); n2 = math.pi / (2 * p2.real)            # int |E|^2, each axis
    return abs(Ix) ** 2 * abs(Iy) ** 2 / (n1 * n2)

def goldsmith_axial(at, Lt, ar, Lr, D):
    _, _, w01, z1 = aperture(at, Lt)
    _, _, w02, z2 = aperture(ar, Lr)
    dz = D + z1 + z2                                            # the receiver's waist is behind its aperture too
    return 4 / ((w01 / w02 + w02 / w01) ** 2 + (lam * dz / (math.pi * w01 * w02)) ** 2)

sets = {}
sets['separation'] = [{'at': 7.5, 'Lt': 60.0, 'ar': 7.5, 'Lr': 60.0, 'D': D} for D in [20, 50, 100, 200, 400]]
sets['waist'] = [{'at': 7.5, 'Lt': 1e5, 'ar': ar, 'Lr': 1e5, 'D': 5.0} for ar in [3.75, 5, 6, 7.5, 9, 11, 15]]
sets['offset'] = [{'at': 7.5, 'Lt': 1e5, 'ar': 7.5, 'Lr': 1e5, 'D': 5.0, 'x0': x0} for x0 in [0, 1, 2, 3, 4, 6, 8]]
sets['tilt'] = [{'at': 30, 'Lt': 1e5, 'ar': 30, 'Lr': 1e5, 'D': 50.0, 'theta': th} for th in [0, 0.5, 1, 1.5, 2, 2.5, 3]]

for name, rows in sets.items():
    for r in rows:
        r['K'] = coupling(r['at'], r['Lt'], r['ar'], r['Lr'], r['D'], r.get('x0', 0.0), r.get('theta', 0.0))
        if name in ('separation', 'waist'):
            g = goldsmith_axial(r['at'], r['Lt'], r['ar'], r['Lr'], r['D'])
            assert abs(g - r['K']) < 1e-12, (name, g, r['K'])
            r['K_goldsmith'] = g

# the offset and tilt formulas, where the waists are in one plane (D = 0 and flat apertures, all but)
_, _, w0a, _ = aperture(7.5, 1e7)
for x0 in [1, 3, 8]:
    K = coupling(7.5, 1e7, 7.5, 1e7, 0.0, x0=x0)
    assert abs(K - math.exp(-2 * x0 * x0 / (2 * w0a * w0a))) < 1e-8, (K, x0)
_, _, w0b, _ = aperture(30, 1e7)
for th in [1, 3]:
    t = th * math.pi / 180
    K = coupling(30, 1e7, 30, 1e7, 0.0, theta=th)
    assert abs(K - math.exp(-2 * (math.pi * t) ** 2 * w0b ** 4 / (lam * lam * 2 * w0b * w0b))) < 1e-8, (K, th)

out = {'source': 'Goldsmith, Quasioptical Systems (IEEE Press, 1998), ch. 4 (Gaussian beam coupling) and ch. 7 (horns)', 'ghz': 100.0, 'lambda_mm': lam, 'sets': sets}
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, '..', 'ref', 'gaussian-coupling.json'), 'w') as f:
    json.dump(out, f, indent=1)
for name, rows in sets.items():
    print(name, [round(r['K'], 6) for r in rows])
