"""An empty two-mirror cavity at and near concentric, driven by a Gaussian beam focused at its middle. Written here; it
shares no code with JEKray.

An exactly concentric cavity images its centre onto itself, but not a beam: its round trip matrix is [[1, 0], [4/R, 1]]
(a shear), so a wavefront flat at the centre comes back curved by 4/R each round trip. The terms of the steady state
lose their overlap and the cavity transmits less than its mirrors allow.

(a) The paraxial series: the n-th round trip is the input Gaussian (waist w0 at the centre) with 1/q grown by 4n/R, the
    field's own amplitude unchanged (A + B/q = 1). Two such terms overlap by 1 / (1 + i k w0^2 (n - m) / R), and the
    transmitted power is t1^2 t2^2 sum_{n,m} rho^(n+m) e^{i phi (n - m)} <u_m, u_n>, at the lock phi that makes it most.
(b) Fox and Li: the field itself, radial, carried from the centre plane to each mirror and back by the Fresnel-Hankel
    integral, the mirror's exact sag as its phase (2k sag) and its rim, summed round trip by round trip. Exactly
    concentric (mirrors 2R apart) and 10 um short of it. The sag is the paraxial one, to match the paraxial propagator.

    python concentric_empty.py          # writes ../ref/concentric-empty.json
"""
import json
import os

import numpy as np
from scipy.optimize import minimize_scalar
from scipy.special import j0

LAM = 1.55e-3            # mm
K = 2 * np.pi / LAM
W0, R, A, RP = 0.02, 10.0, 2.5, 0.9      # input waist (mm), mirror radius, rim radius, reflectance


def series(rho=RP, nmax=600):
    n = np.arange(nmax)
    N, M = np.meshgrid(n, n)
    g = K * W0 ** 2 / R
    T = lambda phi: ((1 - rho) ** 2 * np.sum(rho ** (N + M) * np.exp(1j * phi * (N - M)) / (1 + 1j * g * (N - M)))).real
    r = minimize_scalar(lambda p: -T(p), bounds=(-0.5, 0.5), method='bounded')
    return float(T(r.x)), float(r.x)


class Radial:
    """a radial field on Gauss-Legendre nodes, and the Fresnel-Hankel step between two planes"""

    def __init__(self, rmax, n):
        x, w = np.polynomial.legendre.leggauss(n)
        self.r = 0.5 * rmax * (x + 1)
        self.w = 0.5 * rmax * w * 2 * np.pi * self.r        # area weights

    @staticmethod
    def step(a, b, z):
        """the kernel from plane a's nodes to plane b's over distance z (paraxial Fresnel, axially symmetric)"""
        ra, rb = a.r[None, :], b.r[:, None]
        return (K / (1j * z)) * np.exp(1j * K * z) * np.exp(1j * K * (ra ** 2 + rb ** 2) / (2 * z)) * j0(K * ra * rb / z) * (a.w[None, :] / (2 * np.pi))


def sag(r):
    """the mirror's sag as the Fresnel integral's own (paraxial) optics takes it: r^2 / 2R. (The sphere's exact sag with a
    paraxial propagator mixes two approximations: it gives 0.570 at concentric, where the series and the consistent
    pair give 0.633; the sphere's own aberration from its centre is nil, so the parabola is the right partner here.)"""
    return r ** 2 / (2 * R)


def fox_li(short=0.0, trips=1500):
    """the transmitted power at the lock: the field at the centre plane, round trip by round trip (mirror 2 at R - short)"""
    C = Radial(0.09, 1600)               # the centre plane: the beam (its waist stays; its curvature grows)
    Mp = Radial(A, 3200)                 # a mirror's plane (its vertex plane; the sag is a phase)
    z1, z2 = R, R - short
    to1, from1 = Radial.step(C, Mp, z1), Radial.step(Mp, C, z1)
    to2, from2 = Radial.step(C, Mp, z2), Radial.step(Mp, C, z2)
    ph = np.exp(-2j * K * sag(Mp.r)) * (Mp.r <= A)        # the mirror's sag, out and back to its vertex plane
    u0 = np.exp(-C.r ** 2 / W0 ** 2)
    u0 /= np.sqrt(np.sum(abs(u0) ** 2 * C.w))
    rt = lambda u: from1 @ (ph * (to1 @ (from2 @ (ph * (to2 @ u)))))    # by mirror 2, then mirror 1
    terms = [u0]
    for _ in range(trips):
        terms.append(rt(terms[-1]))
        if RP ** len(terms) < 1e-9:
            break
    # the light leaving through mirror 2: its power is the forward wave's at the centre plane (unitary propagation)
    G = np.array([[np.sum(np.conj(a) * b * C.w) for b in terms] for a in terms])
    n = np.arange(len(terms))
    def T(phi):
        c = RP ** n * np.exp(1j * phi * n)
        return float(((1 - RP) ** 2 * np.conj(c) @ G @ c).real)
    best = max((T(p), p) for p in np.linspace(-np.pi, np.pi, 721))
    r = minimize_scalar(lambda p: -T(p), bounds=(best[1] - 0.02, best[1] + 0.02), method='bounded')
    return T(r.x), float(r.x), len(terms), float(abs(np.sum(abs(u0) ** 2 * C.w)))


def main():
    out = {}
    Ts, ps = series()
    print('series (paraxial, exactly concentric): peak transmission %.5f at %.4f rad' % (Ts, ps))
    out['series'] = dict(T=Ts, phi=ps)
    for short in (0.0, 0.01):
        T, p, n, _ = fox_li(short)
        print('Fox-Li, %g um short of concentric: peak %.5f at %.4f rad (%d round trips)' % (short * 1e3, T, p, n))
        out['foxli_%gum' % (short * 1e3)] = dict(T=T, phi=p, trips=n)
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ref', 'concentric-empty.json'), 'w') as fh:
        json.dump(out, fh, indent=1)


if __name__ == '__main__':
    main()
