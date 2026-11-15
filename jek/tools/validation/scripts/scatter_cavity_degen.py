"""A small sphere inside a degenerate cavity (concentric, confocal) and near one: the light it scatters onto the mirrors
comes back to it, re-imaged, again and again. Written here from the textbook; it shares no code with JEKray.

The light the sphere sends out is a far field F(u) over the directions u (E = F e^{ikr}/r). The part that falls on a
mirror is reflected and, after the reflections that bring it back to a focus on the sphere (one for a concentric
mirror, two for a confocal pair), arrives as a converging wave. As plane waves at the sphere, E(r) = Int A(u) e^{ik u.r}
dOmega, a converging spherical wave that left the sphere along u and comes back along u' is
    A(u') dOmega' = -(i/lambda) [prod of the mirrors' factors] M F(u) e^{ik phi} dOmega,
the -(i/lambda) the stationary phase of an incoming spherical wave (for an outgoing one A = (i/lambda) F), M the
mirrors' action on the field vector (a perfect mirror: E -> -E + 2(E.N)N, times sqrt(R)), and phi the optical path to
the last mirror less the plane wave's own path from there back to the sphere, phi = l(Q) - u'.(Q - r_p). Each ray is
traced exactly (spheres and paraboloids, their rims). A wave that came back passes the sphere and goes on, F = -i
lambda A, to come back again.

That form is for a wave that comes back into the solid angle it left in (dOmega' = dOmega), as an exactly concentric or
confocal cavity sends it. Short of that the n-th return's directions are spread or gathered, and the return is
    A dOmega' = -(i/lambda) X_n [mirrors] M F e^{ik phi} dOmega,   X_n = sqrt(dOmega'/dOmega) (-i)^kappa_n,
kappa_n the focal lines counted along the ray (trace_returns_w): energy asks |A|^2 dOmega' = |F|^2 dOmega, and a point
source through a paraxial system is e^{ikL} e^{-i pi/4} (-i)^mu / sqrt(lambda |B|) across each axis (Gouy's quarter
turn for each focal line passed), which the sum over directions gives only with this weight. For the exact cavities
X_n = (-1)^(n-1), each return a focus passed. (Until November 2026 every return was given (-1)^(n-1): the cases short
of concentric were out by it, 1.5 % at 2 um, 67 % at 10 um and a factor of 2 at 50 um, and the sphere 2 um off a
confocal cavity's axis by a fifth; JEKray's solve had the same form, so the two agreed. The weight's count was fixed
apart from both: a numerical Fresnel propagation through lenses either side of their foci, and the cavity's resonance,
which the sum over rays has only with it.) The mirrors also carry the cavity's lock: a phase psi_m at each, set (from the bench's
empty cavity, the only thing taken from it) by its two axial half-trip factors h2 (out by the far mirror and back) and
h1, or its round trip h1 h2, and the standing wave the laser makes at the sphere: forward and backward fields f and b.

The dipole (50 nm): p = alpha (E0 + beta p), beta the field the returns bring back per unit dipole, summed ray by ray
over the trips until they have died away; checked against the closed form for the ideal concentric cavity,
    beta = (i/lambda) (k^2 / 4 pi eps0) [S2 Phi + S1 Phi],   Phi = Int_cap (1 - u u) dOmega,
    S2 = h2 (1 + h1) / (1 - h1 h2),  S1 = h1 (1 + h2) / (1 - h1 h2).
The Mie sphere (150 nm): the plane waves coming back on a grid of directions over each cap, the sphere's answer to all
of them by Mie theory, and the closed loop solved by GMRES (exact degenerate cavities, where each direction comes back
onto a grid direction).

    python scatter_cavity_degen.py          # writes ../ref/scatter-cavity-degen.json; reads ../ref/scatter-cavity-degen-bench.json
"""
import json
import os
import sys

import numpy as np
from scipy.sparse.linalg import LinearOperator, gmres

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mie_reference import amplitudes  # noqa: E402
from scatter_bench import silica_index  # noqa: E402

C0, EPS0 = 299792458.0, 8.8541878128e-12
Z0 = 1 / (EPS0 * C0)
LAM = 1.55e-6
K = 2 * np.pi / LAM
OMEGA = K * C0


class Mirror:
    """vertex at z0 on the axis, facing s (+1: towards +z), vertex radius Rv, conic kc, rim radius a, power reflectance Rp"""

    def __init__(self, z0, s, Rv, kc, a, Rp, psi=0.0):
        self.z0, self.s, self.c, self.kc, self.a, self.Rp, self.psi = z0, s, 1 / Rv, kc, a, Rp, psi

    def sag(self, r2):
        c, q = self.c, 1 + self.kc
        return c * r2 / (1 + np.sqrt(1 - q * c * c * r2))

    def dsag(self, r2):          # d sag / d(r^2) * 2 : the slope over r
        c, q = self.c, 1 + self.kc
        return c / np.sqrt(1 - q * c * c * r2)

    def hit(self, P, u):
        """first meeting of rays P + t u with the face (t > 0): t, point, normal towards the light, inside the rim"""
        t = (self.z0 - P[..., 2]) / u[..., 2]
        for _ in range(60):
            X = P + t[..., None] * u
            r2 = X[..., 0] ** 2 + X[..., 1] ** 2
            g = self.s * (X[..., 2] - self.z0) - self.sag(r2)
            dg = self.s * u[..., 2] - self.dsag(r2) * (X[..., 0] * u[..., 0] + X[..., 1] * u[..., 1])
            t = t - g / dg
        X = P + t[..., None] * u
        r2 = X[..., 0] ** 2 + X[..., 1] ** 2
        m = self.dsag(r2)
        N = np.stack([-m * X[..., 0], -m * X[..., 1], np.full_like(r2, float(self.s))], -1)
        N /= np.linalg.norm(N, axis=-1, keepdims=True)
        return t, X, N, (r2 <= self.a ** 2) & (t > 0)


def reflect_vec(E, N):
    """a perfect mirror's action on a field vector, E -> -E + 2 (E.N) N (stacked, complex E)"""
    return -E + 2 * np.sum(E * N, -1, keepdims=True) * N


def trace_returns(mirrors, rp, u, pattern, trips):
    """the rays from rp along u, reflected in turn; at each counted reflection (pattern: reflections per return) the
    return: direction, phase (optical path less the plane wave's own back to rp, metres), amplitude, the field matrix
    (3 x 3 per ray), alive. Yields per return"""
    n = u.shape[0]
    P = np.repeat(rp[None, :], n, 0)
    d = u.copy()
    ell = np.zeros(n)
    amp = np.ones(n, dtype=complex)
    Mx = np.repeat(np.eye(3)[None], n, 0).astype(complex)
    alive = np.ones(n, bool)
    which = np.where(u[:, 2] > 0, 1, 0)          # the mirror towards +z is mirrors[1]
    count = 0
    for _ in range(trips * pattern):
        sels = [alive & (which == j) for j in (0, 1)]
        for j in (0, 1):
            sel = sels[j]
            if not sel.any():
                continue
            t, X, N, ok = mirrors[j].hit(P[sel], d[sel])
            idx = np.where(sel)[0]
            alive[idx[~ok]] = False
            idx, t, X, N = idx[ok], t[ok], X[ok], N[ok]
            ell[idx] += t
            P[idx] = X
            dn = d[idx] - 2 * np.sum(d[idx] * N, -1, keepdims=True) * N
            d[idx] = dn
            # the field matrix: M <- R_N M, with R_N E = -E + 2 (E.N) N
            RN = -np.eye(3)[None] + 2 * N[:, :, None] * N[:, None, :]
            Mx[idx] = np.einsum('nij,njk->nik', RN, Mx[idx])
            amp[idx] *= np.sqrt(mirrors[j].Rp) * np.exp(1j * mirrors[j].psi)
            which[idx] = 1 - j
        count += 1
        if count % pattern == 0:
            phi = ell - np.sum(d * (P - rp[None, :]), -1)
            yield d.copy(), phi.copy(), amp.copy(), Mx.copy(), alive.copy()


def _roots(c0, c1, c2, lo, hi):
    """how many roots of c0 + c1 s + c2 s^2 lie in (lo, hi] (both may be infinite), per ray"""
    scale = np.abs(c0) + np.abs(c1) + np.abs(c2) + 1e-300
    quad = np.abs(c2) > 1e-9 * scale
    lin = ~quad & (np.abs(c1) > 1e-9 * scale)
    disc = np.maximum(c1 * c1 - 4 * c0 * c2, 0.0)
    sq = np.sqrt(disc)
    c2s = np.where(quad, c2, 1.0)
    r1, r2 = (-c1 - sq) / (2 * c2s), (-c1 + sq) / (2 * c2s)
    rl = -c0 / np.where(lin, c1, 1.0)
    inside = lambda r: (r > lo) & (r <= hi)
    return np.where(quad, inside(r1).astype(int) + inside(r2).astype(int), np.where(lin, inside(rl).astype(int), 0))


def trace_returns_w(mirrors, rp, u, pattern, trips, eps=1e-6):
    """trace_returns, with each return's weight X = sqrt(dOmega'/dOmega) (-i)^kappa as its last item.
    Two neighbours of each ray (its direction cosines moved by eps along x and along y) are traced with it. Their
    distance from it across the ray, B(s) (2 x 2, per unit of direction), is linear in s on each free stretch; det B = 0
    is a focal line. kappa = (zeros of det B within the stretches already finished) - (zeros on the present stretch's
    line at or behind the mirror it left: it left the mirror already past them). The size is the returned directions'
    spread, |det d(d'x, d'y)/d(ux, uy)| |uz / d'z|. A ray whose neighbour a rim has taken keeps (-1)^(n-1)."""
    n = u.shape[0]
    U = [u]
    for ax in (0, 1):
        v = u.copy()
        v[:, ax] += eps
        v[:, 2] = np.sign(u[:, 2]) * np.sqrt(np.maximum(0, 1 - v[:, 0] ** 2 - v[:, 1] ** 2))
        U.append(v)
    P = [np.repeat(rp[None, :], n, 0) for _ in range(3)]
    d = [v.copy() for v in U]
    ell = np.zeros(n)
    amp = np.ones(n, dtype=complex)
    Mx = np.repeat(np.eye(3)[None], n, 0).astype(complex)
    alive = [np.ones(n, bool) for _ in range(3)]
    which = np.where(u[:, 2] > 0, 1, 0)
    mu = np.zeros(n, int)                       # focal lines on the finished stretches
    # the present stretch: the neighbours' offsets at its start (across the ray, per unit direction) and their directions' differences
    a = [np.zeros((n, 3)), np.zeros((n, 3))]
    bdir = [(d[1 + j] - d[0]) / eps for j in (0, 1)]
    det = lambda x, y, dd: np.einsum('ni,ni->n', np.cross(x, y), dd)
    coef = lambda: (det(a[0], a[1], d[0]), det(a[0], bdir[1], d[0]) + det(bdir[0], a[1], d[0]), det(bdir[0], bdir[1], d[0]))
    count = 0
    for _ in range(trips * pattern):
        sels = [alive[0] & (which == j) for j in (0, 1)]
        for j in (0, 1):
            sel = sels[j]
            if not sel.any():
                continue
            idx = np.where(sel)[0]
            res = [mirrors[j].hit(P[q][idx], d[q][idx]) for q in range(3)]
            t, X, N, ok = res[0]
            # the stretch that ends here: its focal lines
            c0, c1, c2 = (c[idx] for c in coef())
            mu[idx] += _roots(c0, c1, c2, 1e-9 * t, t * (1 - 1e-12))
            for q in range(3):
                tq, Xq, Nq, okq = res[q]
                alive[q][idx[~okq]] = False
                P[q][idx] = Xq
                d[q][idx] = d[q][idx] - 2 * np.sum(d[q][idx] * Nq, -1, keepdims=True) * Nq
            ell[idx] += t
            RN = -np.eye(3)[None] + 2 * N[:, :, None] * N[:, None, :]
            Mx[idx] = np.einsum('nij,njk->nik', RN, Mx[idx])
            amp[idx] *= np.sqrt(mirrors[j].Rp) * np.exp(1j * mirrors[j].psi)
            which[idx] = 1 - j
            # the new stretch's start: the neighbours' points on the mirror, taken across the new ray
            for q in (0, 1):
                off = (P[1 + q][idx] - P[0][idx]) / eps
                dd = d[0][idx]
                a[q][idx] = off - np.sum(off * dd, -1, keepdims=True) * dd
                bdir[q][idx] = (d[1 + q][idx] - dd) / eps
        count += 1
        if count % pattern == 0:
            r = count // pattern - 1
            phi = ell - np.sum(d[0] * (P[0] - rp[None, :]), -1)
            c0, c1, c2 = coef()
            kappa = mu - _roots(c0, c1, c2, -np.inf, 0.0)
            D = np.stack([bdir[0][:, :2], bdir[1][:, :2]], -1)            # d(d'x, d'y) / d(ux, uy)
            size = np.sqrt(np.abs(D[:, 0, 0] * D[:, 1, 1] - D[:, 0, 1] * D[:, 1, 0]) * np.abs(u[:, 2] / d[0][:, 2]))
            Xw = size * (-1j) ** kappa
            both = alive[1] & alive[2]
            Xw = np.where(both, Xw, (-1.0) ** r + 0j)
            yield d[0].copy(), phi.copy(), amp.copy(), Mx.copy(), alive[0].copy(), Xw


def cap_grid(theta, n, cav=None, sub=5):
    """a square grid of direction cosines over a cap of half-angle theta about +z (and its mirror about -z): directions,
    solid angles. With the cavity: the cells the rims cut are taken for what of them comes back (sub x sub directions
    across each traced round), their weight that share and their direction the mean of those that return"""
    s = np.sin(theta) * 1.02
    x = np.linspace(-s, s, n)
    h = x[1] - x[0]
    X, Y = np.meshgrid(x, x, indexing='ij')
    r2 = X ** 2 + Y ** 2
    keep = r2 < min(s * s, 0.999)
    ux, uy = X[keep], Y[keep]
    w = h * h / np.sqrt(1 - ux ** 2 - uy ** 2)
    if cav is None:
        uz = np.sqrt(1 - ux ** 2 - uy ** 2)
        return np.concatenate([np.stack([ux, uy, uz], -1), np.stack([ux, uy, -uz], -1)]), np.concatenate([w, w])
    outU, outW = [], []
    off = ((np.arange(sub) + 0.5) / sub - 0.5) * h
    OA, OB = np.meshgrid(off, off, indexing='ij')
    for sg in (1, -1):
        r = np.sqrt(ux ** 2 + uy ** 2)
        edge = np.abs(r - np.sin(theta)) <= 1.5 * h
        U = np.stack([ux, uy, sg * np.sqrt(1 - ux ** 2 - uy ** 2)], -1)
        # whole cells: their middle traced
        alive = next(trace_returns(cav.m, cav.rp, U, cav.pattern, 1))[4]
        keep_ = alive & ~edge
        outU.append(U[keep_]); outW.append(w[keep_])
        for a0, b0 in zip(ux[edge], uy[edge]):
            A = (a0 + OA).ravel(); Bv = (b0 + OB).ravel()
            ok = A ** 2 + Bv ** 2 < 0.999
            A, Bv = A[ok], Bv[ok]
            if not len(A):
                continue
            Uz = np.sqrt(1 - A ** 2 - Bv ** 2)
            Us = np.stack([A, Bv, sg * Uz], -1)
            al = next(trace_returns(cav.m, cav.rp, Us, cav.pattern, 1))[4]
            if not al.any():
                continue
            ww = 1 / Uz[al]
            ac, bc = np.sum(A[al] * ww) / np.sum(ww), np.sum(Bv[al] * ww) / np.sum(ww)
            outU.append(np.array([[ac, bc, sg * np.sqrt(1 - ac * ac - bc * bc)]]))
            outW.append(np.array([np.sum(ww) * h * h / sub ** 2]))
    return np.concatenate(outU), np.concatenate(outW)


class Sphere:
    """Mie far field of a set of plane waves: F (E_s = F e^{ikr}/r) at directions r. The amplitudes S1, S2 on a fine table
    in cos(theta), and the field vectors from Bohren and Huffman's (4.74), worked out in the incident wave's own frame"""

    def __init__(self, a, m):
        self.x = K * a
        mu = np.linspace(-1, 1, 20001)
        self.mu = mu
        self.s1, self.s2 = amplitudes(self.x, m, np.arccos(mu))

    def S(self, c):
        c = np.clip(c, -1, 1)
        i = lambda v: np.interp(c, self.mu, v.real) + 1j * np.interp(c, self.mu, v.imag)
        return i(self.s1), i(self.s2)

    def far(self, d0, E0, r):
        """one plane wave along d0 (unit), field E0 (complex 3-vector) at the sphere, at directions r (n, 3)"""
        c = r @ d0
        s1, s2 = self.S(c)
        ep = np.cross(r, d0)
        nrm = np.linalg.norm(ep, axis=1)
        # straight ahead or back: any perpendicular will do; the limits give S1 E both ways (S2 = -S1 straight back)
        t = np.array([1.0, 0, 0]) if abs(d0[0]) < 0.9 else np.array([0, 1.0, 0])
        alt = np.cross(t, d0)
        alt /= np.linalg.norm(alt)
        ep = np.where(nrm[:, None] > 1e-9, ep / np.maximum(nrm, 1e-300)[:, None], alt[None, :])
        epi = np.cross(d0, ep)
        eps = np.cross(r, ep)
        return (1j / K) * (s2[:, None] * (epi @ E0)[:, None] * eps + s1[:, None] * (ep @ E0)[:, None] * ep)

    def far_many(self, D, E, r, w=None):
        F = np.zeros((r.shape[0], 3), dtype=complex)
        for i in range(D.shape[0]):
            e = E[i] * (w[i] if w is not None else 1)
            if np.any(e != 0):
                F += self.far(D[i], e, r)
        return F


def dipole_alpha(a, m):
    av = a ** 3 * (m * m - 1) / (m * m + 2)
    return 4 * np.pi * EPS0 * av / (1 - 1j * 2 / 3 * K ** 3 * av)


def dipole_far(p, r):
    """E = F e^{ikr}/r: F = k^2 / (4 pi eps0) (p - r (r.p))"""
    return K * K / (4 * np.pi * EPS0) * (p[None, :] - r * (r @ p)[:, None])


class Cavity:
    def __init__(self, kind, delta=0.0, Rp=0.9, a=2.5e-3, rp=(0, 0, 0)):
        self.kind = kind
        if kind == 'concentric':
            Rv, kc, z = 10e-3, 0.0, 10e-3
            self.pattern = 1
        else:
            Rv, kc, z = 20e-3, -1.0, 10e-3
            self.pattern = 2
        self.m = [Mirror(-z, +1, Rv, kc, a, Rp), Mirror(z - delta, -1, Rv, kc, a, Rp)]
        self.rp = np.array(rp, float)
        self.trips = 400           # returns followed at most (they stop when they have faded to 1e-9): more for better mirrors
        # the cap each mirror fills as seen from the middle
        rim = np.array([[a, 0, (z - delta) - self.m[1].sag(a * a)]])
        self.theta = float(np.arctan2(a, rim[0, 2]))

    def lock(self, h2=None, lam=None):
        """the mirrors' phases from the bench's axial half-trip factor h2 (out by mirror 2 and back to the sphere, A to A)
        and its round trip lam = h1 h2 (A to A)"""
        u = np.array([[0, 0, 1.0]])
        for j in (0, 1):
            self.m[j].psi = 0.0
        # the bare axial factors, A to A: the n-th return of a ray is -(i/lambda) (-1)^(n-1) prod(sqrt(R) e^{i psi}) M
        # e^{ik phi} F (each earlier return was a focus it passed, Gouy's pi), and F = -i lambda A
        def axial(udir, n):
            for i, (d, phi, amp, Mx, alive) in enumerate(trace_returns(self.m, self.rp, udir, self.pattern, n)):
                pass
            return -(1j / LAM) * (-1) ** (n - 1) * amp[0] * Mx[0][0, 0] * np.exp(1j * K * phi[0]) * (-1j * LAM)
        if self.pattern == 1:
            a2 = axial(u, 1)                   # out along +z, back by mirror 2
            arnd = axial(u, 2)                 # a round trip: by mirror 2, through the sphere, by mirror 1
        else:
            a2, arnd = None, axial(u, 1)       # the confocal pair: one return is the round trip
        if h2 is not None and a2 is not None:
            self.m[1].psi = float(np.angle(h2 / a2))
            a2 *= np.exp(1j * self.m[1].psi)
        self.m[0].psi = float(np.angle(lam / (arnd * np.exp(1j * self.m[1].psi))))
        self.lam = lam
        return a2, arnd

    def lock_mode(self, bf, ritz):
        """the mirrors' phases for a stable cavity short of concentric, from the bench's two field numbers: ritz, the round
        trip of the cavity's TEM00 (its phase is the lock), and bf, the standing wave's b / f at the sphere.
        A beam is not a ray: carried once round, or out by the far mirror and back, a Gaussian beam's field on the axis is
        the axial ray's factor times s / (A + B/q) (q the beam's own, A and B the paraxial matrix's; s = -1 for the half
        trip, +1 for the round trip, so that the exactly concentric cavity gives 1): the Gouy phase. So: the cavity's own
        TEM00 (the q its R and L give) goes round with the bench's ritz phase, which fixes the two mirrors' phases
        together; and the laser's beam (its waist W0_LASER at the origin) and every round trip of it, summed, come back
        from the far mirror with the bench's b / f phase, which fixes the far mirror's. (Until November 2026 the bench's
        b / f was given to the ray's half trip as it was, and the round trip taken from JEKray already turned.)
        Returns the axial ray's half trip and round trip (A to A) so set"""
        for j in (0, 1):
            self.m[j].psi = 0.0
        u = np.array([[0, 0, 1.0]])

        def axial(nn):
            for i, (d, phi, amp, Mx, alive) in enumerate(trace_returns(self.m, self.rp, u, self.pattern, nn)):
                pass
            return complex(-(-1) ** (nn - 1) * amp[0] * Mx[0][0, 0] * np.exp(1j * K * phi[0]))
        P = lambda d: np.array([[1, d], [0, 1.0]])
        Mi = lambda m: np.array([[1, 0], [-2 * m.c, 1.0]])
        zp = self.rp[2]
        d2, d1 = self.m[1].z0 - zp, zp - self.m[0].z0
        Hf = P(d2) @ Mi(self.m[1]) @ P(d2)
        RT = P(d1) @ Mi(self.m[0]) @ P(d1) @ Hf
        L = self.m[1].z0 - self.m[0].z0
        zc, zR = 0.5 * (self.m[0].z0 + self.m[1].z0), np.sqrt(0.5 * L * (1 / self.m[0].c - 0.5 * L))
        qm = (zp - zc) - 1j * zR
        assert abs((RT[0, 0] * qm + RT[0, 1]) / (RT[1, 0] * qm + RT[1, 1]) - qm) < 1e-6 * zR
        a2, arnd = axial(1), axial(2)
        psi = float(np.angle(ritz) - np.angle(arnd / (RT[0, 0] + RT[0, 1] / qm)))
        arnd *= np.exp(1j * psi)
        # the laser's beam and its round trips at the sphere, and each brought back by the far mirror
        q, amp, sf, sb = zp - 1j * K * W0_LASER ** 2 / 2, 1.0 + 0j, 0j, 0j
        for _ in range(100000):
            sf += amp
            sb += amp * -1 / (Hf[0, 0] + Hf[0, 1] / q)
            amp *= arnd / (RT[0, 0] + RT[0, 1] / q)
            q = (RT[0, 0] * q + RT[0, 1]) / (RT[1, 0] * q + RT[1, 1])
            if abs(amp) < 1e-10:
                break
        self.m[1].psi = float(np.angle(bf) - np.angle(a2 * sb / sf))
        self.m[0].psi = psi - self.m[1].psi
        self.lam = arnd
        self.gouy = (float(np.angle(-1 / (Hf[0, 0] + Hf[0, 1] / qm))), float(np.angle(1 / (RT[0, 0] + RT[0, 1] / qm))), float(np.angle(sb / sf)))
        return a2 * np.exp(1j * self.m[1].psi), arnd

    def beta(self, n=301, trips=None):
        """the field the returns bring back to the sphere per unit dipole, a 3 x 3 tensor, summed ray by ray"""
        trips = trips or self.trips
        U, W = cap_grid(self.theta, n, self)
        B = np.zeros((3, 3), dtype=complex)
        Fm = K * K / (4 * np.pi * EPS0) * (np.eye(3)[None] - U[:, :, None] * U[:, None, :])     # F per unit p, (n, 3, 3)
        for n, (d, phi, amp, Mx, alive, Xw) in enumerate(trace_returns_w(self.m, self.rp, U, self.pattern, trips)):
            f = -(1j / LAM) * (Xw * amp * np.exp(1j * K * phi) * W * alive)[:, None, None] * np.einsum('nij,njk->nik', Mx, Fm)
            # the plane waves' field at the sphere: their transverse part (Mx keeps a field square to the ray)
            B += f.sum(0)
            if np.max(np.abs(amp[alive])) < 1e-9 if alive.any() else True:
                break
        return B


def closed_form_beta(cav, h1, h2):
    c = np.cos(cav.theta)
    phi_perp = np.pi * (1 - c) + np.pi * (1 - c ** 3) / 3
    phi_z = 2 * np.pi * (1 - c) - 2 * np.pi * (1 - c ** 3) / 3        # Int (1 - uz^2): Omega less Int uz^2
    S2 = h2 * (1 + h1) / (1 - h1 * h2)
    S1 = h1 * (1 + h2) / (1 - h1 * h2)
    return (1j / LAM) * K * K / (4 * np.pi * EPS0) * (S1 + S2) * np.diag([phi_perp, phi_perp, phi_z])


W0_LASER = 20e-6          # the laser's waist, at the cavity's middle


def beam_spectrum(U, rp, cav=None):
    """the empty cavity's forward wave at the sphere, as plane waves (shape only): the laser's Gaussian (waist W0_LASER at
    the origin) and every round trip of it, each carried by the paraxial round trip matrix from the sphere's plane (a
    concentric cavity's is a shear: each trip comes back with its wavefront curved by 4/R more), summed at the lock (the
    phase that makes the light through the cavity most); referred to the sphere at rp; zero off the forward cap"""
    th2 = np.maximum(0, 1 - U[:, 2] ** 2)
    zR = K * W0_LASER ** 2 / 2
    shift = np.exp(1j * K * ((U - np.array([0, 0, 1.0])) @ np.array([rp[0], rp[1], 0.0])))
    fw = U[:, 2] > 0
    if cav is None:
        q = rp[2] - 1j * zR
        return np.where(fw, q * np.exp(-1j * K * q * th2 / 2) * shift, 0)
    P = lambda d: np.array([[1, d], [0, 1.0]])
    Mi = lambda m: np.array([[1, 0], [-2 * m.c, 1.0]])
    zp = rp[2]
    d2, d1 = cav.m[1].z0 - zp, zp - cav.m[0].z0
    RT = P(d1) @ Mi(cav.m[0]) @ P(d1) @ P(d2) @ Mi(cav.m[1]) @ P(d2)      # out to mirror 2 and back, then mirror 1
    rho = np.sqrt(cav.m[0].Rp * cav.m[1].Rp)
    terms = beam_terms(U, cav, zp, zR, RT, rho)
    T = np.array(terms)                               # (n, directions)
    n = np.arange(len(terms))
    if getattr(cav, 'lock_phase', None) is None:
        # each round trip of the beam takes the cavity's own axial round trip, lam (the lock, the bench's): its phase is
        # the beam's per trip (a concentric round trip moves the beam's amplitude on the axis by nothing, A + B/q = 1).
        # Beside it, for the record, the phase that would make the forward wave's power most (the lock by power)
        cav.lock_phase = float(np.angle(cav.lam)) if getattr(cav, 'lam', None) is not None else 0.0
        Uf, Wf = cap_grid(0.3, 241)
        Uf, Wf = Uf[Uf[:, 2] > 0], Wf[Uf[:, 2] > 0]
        Tf = np.array([t for t in beam_terms(Uf, cav, zp, zR, RT, rho)])
        G = (np.conj(Tf) * Wf) @ Tf.T
        nf = np.arange(len(Tf))
        cav.power_lock = max(((np.conj(np.exp(1j * ph * nf)) @ G @ np.exp(1j * ph * nf)).real, ph) for ph in np.linspace(-np.pi, np.pi, 2881))[1]
    g = (np.ones(len(n)) if getattr(cav, 'lam', None) is not None else np.exp(1j * cav.lock_phase * n)) @ T
    return np.where(fw, g * shift, 0)


def beam_terms(U, cav, zp, zR, RT, rho):
    """the forward wave's round trips at the sphere's plane, as plane-wave spectra over U: amp q exp(-i k q theta^2 / 2)"""
    th2 = np.maximum(0, 1 - U[:, 2] ** 2)
    q, amp, terms = zp - 1j * zR, 1.0 + 0j, []
    A_, B_, C_, D_ = RT.ravel()
    lam = getattr(cav, 'lam', None)
    a0 = A_ + B_ / q
    for _ in range(800):
        terms.append(amp * q * np.exp(-1j * K * q * th2 / 2))
        # a round trip: the cavity's own axial factor lam (the lock, the bench's; on the axis it moves the beam by
        # 1 / (A + B/q) of its first term), the beam's own change of that factor as its q moves
        amp = amp * (lam * a0 / (A_ + B_ / q) if lam is not None else rho / (A_ + B_ / q))
        q = (A_ * q + B_) / (C_ * q + D_)
        if abs(amp) < 1e-9:
            break
    return terms


def through_change(U, W, Xout, f, pol, rp, cav=None):
    """the change of the forward beam leaving the sphere (the light through the far mirror), first order and to all
    orders: ratio = <A, X> / <A, A> with A = f pol g / sum(w g), X the change of the forward waves (A units)"""
    g = beam_spectrum(U, rp, cav)
    Sg, gg = np.sum(W * g), np.sum(W * abs(g) ** 2)
    num = np.sum(W * np.conj(g) * (Xout @ pol)) * np.conj(f) / abs(f) ** 2
    ratio = num * Sg / gg
    return complex(ratio), float(abs(1 + ratio) ** 2 - 1)


def dipole_case(cav, alpha, f, b, pol, through=True, n=301):
    E0 = (f + b) * pol
    Bt = cav.beta(n)
    p = np.linalg.solve(np.eye(3) - alpha * Bt, alpha * E0)
    Etot = E0 + Bt @ p
    Psca = C0 ** 2 * Z0 * K ** 4 / (12 * np.pi) * np.sum(abs(p) ** 2)
    Pext = OMEGA / 2 * np.imag(np.vdot(Etot, p))
    if not through:
        # (short of concentric the through beam's number is not kept: nothing has checked it there, and no check reads it)
        return dict(E2_ratio=float(np.sum(abs(Etot) ** 2) / np.sum(abs(E0) ** 2)), Psca_W=float(Psca), Pext_W=float(Pext), I0=float(np.sum(abs(E0) ** 2) / (2 * Z0)))
    # the through beam: the returns that come back along the forward cap, and the dipole's own forward light, against
    # the beam over the whole cap (a concentric cavity's beam fills it: each round trip comes back more curved. Until
    # November 2026 the overlap was taken within 0.15 rad of the axis, which left a sixth of it out there, and the
    # change read 2.27e-5 for 2.71e-5; a confocal cavity's beam is narrow and its number did not move)
    U, Wg = cap_grid(cav.theta, 301)
    Fp = dipole_far(p, U)
    gU = beam_spectrum(U, cav.rp, cav)
    from scipy.spatial import cKDTree
    tree = cKDTree(U)
    X = (1j / LAM) * Fp * (U[:, 2] > 0)[:, None]
    # returns: emission along u comes back along d; add its plane wave where d is (onto the nearest grid direction)
    for n, (d, phi, amp, Mx, alive, Xw) in enumerate(trace_returns_w(cav.m, cav.rp, U, cav.pattern, 400)):
        A = -(1j / LAM) * (Xw * amp * np.exp(1j * K * phi) * alive)[:, None] * np.einsum('nij,nj->ni', Mx, Fp)
        fw = (d[:, 2] > 0) & alive
        if fw.any():
            # an integral over the emission's own grid: <A_beam, dA> = sum_u w_u conj(A_beam(d(u))) . A(u)
            # (the beam's spectrum where each return lands: the grid direction nearest it, which for these cavities is
            # within a small fraction of the grid's step)
            g = gU[tree.query(d[fw])[1]]
            X_ = None
            Sg_dummy = None
            dipole_case.acc = getattr(dipole_case, 'acc', 0) + np.sum(Wg[fw] * np.conj(g) * (A[fw] @ pol))
        if not alive.any() or np.max(np.abs(amp[alive])) < 1e-9:
            break
    Sg, gg = np.sum(Wg * gU), np.sum(Wg * abs(gU) ** 2)
    num = (np.sum(Wg * np.conj(gU) * (X @ pol)) + dipole_case.acc) * np.conj(f) / abs(f) ** 2
    dipole_case.acc = 0
    ratio = num * Sg / gg
    return dict(E2_ratio=float(np.sum(abs(Etot) ** 2) / np.sum(abs(E0) ** 2)), Psca_W=float(Psca), Pext_W=float(Pext), I0=float(np.sum(abs(E0) ** 2) / (2 * Z0)),
                through_ratio=[float(ratio.real), float(ratio.imag)], through_change=float(abs(1 + ratio) ** 2 - 1))


def mie_case(cav, sph, f, b, pol, n=41):
    """the sphere in the degenerate cavity: x = S (F0 + P x), x the returned waves on the grid, S every return of the
    sphere's light, each traced as its own ray from the sphere (as the dipole's are) and put on the grid direction nearest
    where it comes back, P the sphere's answer to the returned waves. (Until November 2026 the first return's map was
    applied again and again instead. That is the same thing for a sphere on the axis; beside it the second return
    starts from the image, across the axis, and is not the first over again: the reference was 2.3% out there.)"""
    from scipy.spatial import cKDTree
    U, W = cap_grid(cav.theta, n)
    N = U.shape[0]
    tree = cKDTree(U)
    ops = []
    for r, (d, phi, amp, Mx, alive, Xw) in enumerate(trace_returns_w(cav.m, cav.rp, U, cav.pattern, 400)):
        if not alive.any() or np.max(np.abs(amp[alive])) < 1e-9:
            break
        # (on the grid: what lands on a direction is shared out over that direction's own solid angle)
        tgt = tree.query(d)[1]
        ops.append((tgt, (-(1j / LAM) * Xw * W / W[tgt] * amp * np.exp(1j * K * phi) * alive)[:, None, None] * Mx))
    drive_d = np.array([[0, 0, 1.0], [0, 0, -1.0]])
    drive_E = np.array([f * pol, b * pol])
    F0 = sph.far_many(drive_d, drive_E, U)            # the sphere's far field in the empty cavity's light

    def apply(x):
        A = x.reshape(N, 3)
        Fp = F0 + sph.far_many(U, A, U, W)                # the sphere's light along each grid direction
        new = np.zeros((N, 3), dtype=complex)
        for tgt, C in ops:
            np.add.at(new, tgt, np.einsum('nij,nj->ni', C, Fp))
        return new.reshape(-1)

    rhs = apply(np.zeros(3 * N, dtype=complex))
    op = LinearOperator((3 * N, 3 * N), matvec=lambda x: x - (apply(x) - rhs), dtype=complex)
    x, info = gmres(op, rhs, rtol=1e-10, restart=60, maxiter=400)
    A = x.reshape(N, 3)
    E0 = (f + b) * pol
    Etot = E0 + np.sum(A * W[:, None], 0)
    # the sphere's far field in all the light: its power over the sphere, and the optical theorem wave by wave
    D_all = np.concatenate([drive_d, U])
    E_all = np.concatenate([drive_E, A * W[:, None]])
    mu, wm = np.polynomial.legendre.leggauss(120)
    ph = (np.arange(240) + 0.5) * 2 * np.pi / 240
    MU, PH = np.meshgrid(mu, ph, indexing='ij')
    ST = np.sqrt(1 - MU ** 2)
    R = np.stack([ST * np.cos(PH), ST * np.sin(PH), MU], -1).reshape(-1, 3)
    WR = np.outer(wm, np.full(240, 2 * np.pi / 240)).reshape(-1)
    Fs = sph.far_many(D_all, E_all, R)
    Psca = float(np.sum(np.sum(abs(Fs) ** 2, -1) * WR) / (2 * Z0))
    Fd = sph.far_many(D_all, E_all, D_all)
    # the through beam's change: the forward waves' change x + (i/lambda) F (A units), F the sphere's whole far field
    Fg = Fd[2:]
    ratio, chg = through_change(U, W, A + (1j / LAM) * Fg, f, pol, cav.rp, cav)
    Pext = float(4 * np.pi / K * np.imag(np.sum(np.conj(E_all) * Fd)) / (2 * Z0))
    return dict(E2_ratio=float(np.sum(abs(Etot) ** 2) / np.sum(abs(E0) ** 2)), Psca_W=Psca, Pext_W=Pext, I0=float(np.sum(abs(E0) ** 2) / (2 * Z0)),
                gmres_info=int(info), nodes=int(N), through_ratio=[ratio.real, ratio.imag], through_change=chg)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    bench = json.load(open(os.path.join(here, '..', 'ref', 'scatter-cavity-degen-bench.json')))
    n_si = complex(float(silica_index(1.55)), 0)
    path = os.path.join(here, '..', 'ref', 'scatter-cavity-degen.json')
    only = sys.argv[1:]
    out = json.load(open(path)) if only and os.path.exists(path) else dict(wavelength_nm=1550, cases={}, checks={})
    # D0: the ray-traced series against the closed form, the ideal concentric cavity, the dipole at its centre
    cav = Cavity('concentric')
    h2 = np.sqrt(0.9) * np.exp(0.3j)
    lam = 0.9 * np.exp(0.0j)
    cav.lock(h2, lam)
    B = cav.beta()
    Bc = closed_form_beta(cav, lam / h2, h2)
    err = float(np.max(np.abs(B - Bc)) / np.max(np.abs(Bc)))
    print('D0: series against the closed form, max relative difference %.3e (theta %.4f rad)' % (err, cav.theta))
    alpha = dipole_alpha(50e-9, n_si)
    p = np.array([1.0, 0, 0])
    dP = OMEGA / 2 * np.imag(np.vdot(p, B @ p)) / (C0 ** 2 * Z0 * K ** 4 / (12 * np.pi))
    dPc = OMEGA / 2 * np.imag(np.vdot(p, Bc @ p)) / (C0 ** 2 * Z0 * K ** 4 / (12 * np.pi))
    print('    a fixed dipole\'s emission against a free one\'s: %.6f (series), %.6f (closed form)' % (1 + dP, 1 + dPc))
    out['checks']['D0'] = dict(beta_rel_diff=err, emission_series=float(1 + dP), emission_closed=float(1 + dPc))
    pol = np.array([1.0, 0, 0])
    for name, B0 in bench['cases'].items():
        if only and name not in only:
            continue
        cav = Cavity(B0['kind'], delta=B0.get('delta_m', 0.0), rp=B0.get('rp_m', (0, 0, 0)), Rp=B0.get('Rp', 0.9))
        cav.trips = B0.get('trips', 400)
        h2 = complex(*B0['h2']) if B0.get('h2') else None
        lam = complex(*B0['lam'])
        if B0.get('lam_how') == 'mode':
            a2, lam = cav.lock_mode(h2, complex(*B0['ritz']))
            print('%s: the ray\'s half trip by the far mirror %.5f rad (the bench\'s b/f %.5f), its round trip %.5f rad (JEKray\'s %.5f)'
                  % (name, np.angle(a2), np.angle(h2), np.angle(lam), np.angle(complex(*B0['lam']))), flush=True)
        else:
            cav.lock(h2, lam)
        f, b = complex(*B0['f']), complex(*B0['b'])
        res = dict(kind=B0['kind'], theta=cav.theta)
        # (the through beam's number is kept only for the sphere at the middle of an exact cavity, where a check reads it)
        res['dipole'] = dipole_case(cav, alpha, f, b, pol, through=not B0.get('delta_m') and not np.any(np.array(B0.get('rp_m', (0, 0, 0)), float)))
        res['lock'] = dict(lam_phase=float(np.angle(lam)), power_lock_phase=float(cav.power_lock) if hasattr(cav, 'power_lock') else None)
        if B0.get('lam_how') == 'mode':
            # the Gouy phase the mode takes in the half trip by the far mirror and in the round trip, and the light's own in the half trip
            res['lock'].update(ray_half_phase=float(np.angle(a2)), mode_half_gouy=cav.gouy[0], mode_round_gouy=cav.gouy[1], light_half_gouy=cav.gouy[2])
        if B0.get('mie'):
            res['mie'] = mie_case(cav, Sphere(150e-9, n_si), f, b, pol)
        print(name, json.dumps(res), flush=True)
        out['cases'][name] = res
    out['bench'] = bench          # (the validation page reads the benches from here)
    with open(path, 'w') as fh:
        json.dump(out, fh, indent=1)


if __name__ == '__main__':
    main()
