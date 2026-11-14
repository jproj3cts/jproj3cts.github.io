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


def cap_grid(theta, n):
    """a square grid of direction cosines over a cap of half-angle theta about +z (and its mirror about -z): directions,
    solid angles"""
    s = np.sin(theta) * 1.02
    x = np.linspace(-s, s, n)
    X, Y = np.meshgrid(x, x, indexing='ij')
    r2 = X ** 2 + Y ** 2
    keep = r2 < min(s * s, 0.999)
    ux, uy = X[keep], Y[keep]
    uz = np.sqrt(1 - ux ** 2 - uy ** 2)
    h = x[1] - x[0]
    w = h * h / uz
    up = np.stack([ux, uy, uz], -1)
    dn = np.stack([ux, uy, -uz], -1)
    return np.concatenate([up, dn]), np.concatenate([w, w])


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
        return a2, arnd

    def beta(self, n=301, trips=400):
        """the field the returns bring back to the sphere per unit dipole, a 3 x 3 tensor, summed ray by ray"""
        U, W = cap_grid(self.theta, n)
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


def dipole_case(cav, alpha, f, b, pol):
    E0 = (f + b) * pol
    Bt = cav.beta()
    p = np.linalg.solve(np.eye(3) - alpha * Bt, alpha * E0)
    Etot = E0 + Bt @ p
    Psca = C0 ** 2 * Z0 * K ** 4 / (12 * np.pi) * np.sum(abs(p) ** 2)
    Pext = OMEGA / 2 * np.imag(np.vdot(Etot, p))
    return dict(E2_ratio=float(np.sum(abs(Etot) ** 2) / np.sum(abs(E0) ** 2)), Psca_W=float(Psca), Pext_W=float(Pext), I0=float(np.sum(abs(E0) ** 2) / (2 * Z0)))


def mie_case(cav, sph, f, b, pol, n=41):
    """the exact degenerate cavity: each grid direction comes back onto its image on the grid"""
    U, W = cap_grid(cav.theta, n)
    N = U.shape[0]
    rets = list(trace_returns(cav.m, cav.rp, U, cav.pattern, 1))
    d, phi, amp, Mx, alive = rets[0]
    # where each direction comes back to on the grid
    tgt = np.array([np.argmin(np.sum((U - d[i]) ** 2, 1)) for i in range(N)])
    miss = np.max(np.linalg.norm(U[tgt] - d, axis=1)[alive]) if alive.any() else 0
    assert miss < 1e-9, miss
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
    Pext = float(4 * np.pi / K * np.imag(np.sum(np.conj(E_all) * Fd)) / (2 * Z0))
    return dict(E2_ratio=float(np.sum(abs(Etot) ** 2) / np.sum(abs(E0) ** 2)), Psca_W=Psca, Pext_W=Pext, I0=float(np.sum(abs(E0) ** 2) / (2 * Z0)),
                gmres_info=int(info), nodes=int(N))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    bench = json.load(open(os.path.join(here, '..', 'ref', 'scatter-cavity-degen-bench.json')))
    n_si = complex(float(silica_index(1.55)), 0)
    out = dict(wavelength_nm=1550, cases={}, checks={})
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
        cav = Cavity(B0['kind'], delta=B0.get('delta_m', 0.0), rp=B0.get('rp_m', (0, 0, 0)))
        h2 = complex(*B0['h2']) if B0.get('h2') else None
        lam = complex(*B0['lam'])
        cav.lock(h2, lam)
        f, b = complex(*B0['f']), complex(*B0['b'])
        res = dict(kind=B0['kind'], theta=cav.theta)
        res['dipole'] = dipole_case(cav, alpha, f, b, pol)
        if B0.get('mie'):
            res['mie'] = mie_case(cav, Sphere(150e-9, n_si), f, b, pol)
        print(name, json.dumps(res))
        out['cases'][name] = res
    with open(os.path.join(here, '..', 'ref', 'scatter-cavity-degen.json'), 'w') as fh:
        json.dump(out, fh, indent=1)


if __name__ == '__main__':
    main()
