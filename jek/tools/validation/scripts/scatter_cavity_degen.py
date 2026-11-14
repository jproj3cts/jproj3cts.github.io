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
lambda A, to come back again. The mirrors also carry the cavity's lock: a phase psi_m at each, set (from the bench's
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

    def beta(self, n=301, trips=400):
        """the field the returns bring back to the sphere per unit dipole, a 3 x 3 tensor, summed ray by ray"""
        U, W = cap_grid(self.theta, n, self)
        B = np.zeros((3, 3), dtype=complex)
        Fm = K * K / (4 * np.pi * EPS0) * (np.eye(3)[None] - U[:, :, None] * U[:, None, :])     # F per unit p, (n, 3, 3)
        for n, (d, phi, amp, Mx, alive) in enumerate(trace_returns(self.m, self.rp, U, self.pattern, trips)):
            f = -(1j / LAM) * (-1) ** n * (amp * np.exp(1j * K * phi) * W * alive)[:, None, None] * np.einsum('nij,njk->nik', Mx, Fm)
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


def dipole_case(cav, alpha, f, b, pol):
    E0 = (f + b) * pol
    Bt = cav.beta()
    p = np.linalg.solve(np.eye(3) - alpha * Bt, alpha * E0)
    Etot = E0 + Bt @ p
    Psca = C0 ** 2 * Z0 * K ** 4 / (12 * np.pi) * np.sum(abs(p) ** 2)
    Pext = OMEGA / 2 * np.imag(np.vdot(Etot, p))
    # the through beam: the returns that come back along the forward cap near the axis, and the dipole's own forward light
    U, Wg = cap_grid(cav.theta, 601)
    near = np.arccos(np.clip(np.abs(U[:, 2]), -1, 1)) < 0.15
    U, Wg = U[near], Wg[near]
    Fp = dipole_far(p, U)
    gU = beam_spectrum(U, cav.rp, cav)
    from scipy.spatial import cKDTree
    tree = cKDTree(U)
    X = (1j / LAM) * Fp * (U[:, 2] > 0)[:, None]
    # returns: emission along u comes back along d; add its plane wave where d is (onto the nearest grid direction)
    for n, (d, phi, amp, Mx, alive) in enumerate(trace_returns(cav.m, cav.rp, U, cav.pattern, 400)):
        A = -(1j / LAM) * (-1) ** n * (amp * np.exp(1j * K * phi) * alive)[:, None] * np.einsum('nij,nj->ni', Mx, Fp)
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
    """the exact degenerate cavity: each grid direction comes back onto its image on the grid"""
    U, W = cap_grid(cav.theta, n)
    N = U.shape[0]
    rets = list(trace_returns(cav.m, cav.rp, U, cav.pattern, 1))
    d, phi, amp, Mx, alive = rets[0]
    # where each direction comes back to on the grid
    tgt = np.array([np.argmin(np.sum((U - d[i]) ** 2, 1)) for i in range(N)])
    # (an off-axis point's image is not quite a mirror image: coma moves its rays by a thousandth of the grid's step or
    # less, and each is taken onto the nearest grid direction)
    miss = np.max(np.linalg.norm(U[tgt] - d, axis=1)[alive]) if alive.any() else 0
    step = np.sin(cav.theta) * 1.02 * 2 / (n - 1)
    assert miss < 2e-3 * step, (miss, step)
    fac = -(1j / LAM) * amp * np.exp(1j * K * phi) * alive
    drive_d = np.array([[0, 0, 1.0], [0, 0, -1.0]])
    drive_E = np.array([f * pol, b * pol])
    F0 = sph.far_many(drive_d, drive_E, U)            # the sphere's far field in the empty cavity's light

    def apply(x):
        A = x.reshape(N, 3)
        Fp = F0 + sph.far_many(U, A, U, W)
        Fout = -1j * LAM * A + Fp                         # outgoing along each grid direction
        new = np.zeros((N, 3), dtype=complex)
        # comes back along d (onto tgt), with the field matrix and factor; per unit solid angle: dOmega' = dOmega here
        np.add.at(new, tgt, fac[:, None] * np.einsum('nij,nj->ni', Mx, Fout))
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
        cav = Cavity(B0['kind'], delta=B0.get('delta_m', 0.0), rp=B0.get('rp_m', (0, 0, 0)))
        h2 = complex(*B0['h2']) if B0.get('h2') else None
        lam = complex(*B0['lam'])
        cav.lock(h2, lam)
        f, b = complex(*B0['f']), complex(*B0['b'])
        res = dict(kind=B0['kind'], theta=cav.theta)
        res['dipole'] = dipole_case(cav, alpha, f, b, pol)
        res['lock'] = dict(lam_phase=float(np.angle(lam)), power_lock_phase=float(getattr(cav, 'power_lock', np.nan)))
        if B0.get('mie'):
            res['mie'] = mie_case(cav, Sphere(150e-9, n_si), f, b, pol)
        print(name, json.dumps(res), flush=True)
        out['cases'][name] = res
    out['bench'] = bench          # (the validation page reads the benches from here)
    with open(path, 'w') as fh:
        json.dump(out, fh, indent=1)


if __name__ == '__main__':
    main()
