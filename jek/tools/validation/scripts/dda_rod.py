"""A dielectric rod in a plane wave: reference values for JEKray's dipole array.

The reference is an independent discrete-dipole calculation written here, not an established
code (ADDA could not be fetched or built where these files were made). It shares the method
with JEKray (Purcell & Pennypacker's coupled dipoles, the polarisability of Draine & Goodman's
lattice dispersion relation) and nothing else: numpy arrays on a padded grid, the dipoles'
fields summed by FFT convolution, scipy's BiCGStab, the far field summed directly, and nine
lattices from 12 to 32 dipoles across the rod against JEKray's 10. A lattice's outline of a
round rod is jagged, so a cross-section wanders by a few parts in a thousand from one lattice
to the next as well as drifting with the spacing d. The reference cross-sections are
therefore the straight line fitted through all nine against d, read at d = 0, and the scatter
about that line is given with them. The pattern is the finest lattice's, scaled to the
extrapolated cross-section.

The script checks its own calculation against Mie for a sphere (mie_reference.py, itself
checked against Bohren & Huffman's published case): C_ext within 1%.

The rod: fused silica (n = 1.444 at 1550 nm), a cylinder with flat ends 1 um long and 200 nm
across, in vacuum. Three settings: the wave square to the axis with its field along the axis;
square to the axis with its field across it; the wave along the axis.

Writes ../ref/dda-rod.json. About ten minutes.

    python dda_rod.py
"""
import json
import os

import numpy as np
from scipy.sparse.linalg import LinearOperator, bicgstab

import mie_reference as mie

LAM = 1.550e-6
M = 1.444 + 0j
DIAMETER, LENGTH = 200e-9, 1000e-9


def lattice(shape, D, L, across):
    """Sites of a cubic lattice inside the shape (axis z), then the spacing set to hold its volume."""
    d0 = min(D, L) / across
    nx, nz = int(np.ceil(D / d0 - 1e-9)), int(np.ceil(L / d0 - 1e-9))
    i = np.arange(nx)
    k = np.arange(nz)
    X, Y, Z = np.meshgrid((i + 0.5 - nx / 2) * d0, (i + 0.5 - nx / 2) * d0, (k + 0.5 - nz / 2) * d0, indexing='ij')
    if shape == 'sphere':
        inside = X ** 2 + Y ** 2 + Z ** 2 <= (D / 2) ** 2
        vol = np.pi / 6 * D ** 3
    else:
        inside = (X ** 2 + Y ** 2 <= (D / 2) ** 2) & (abs(Z) <= L / 2)
        vol = np.pi / 4 * D ** 2 * L
    n = int(inside.sum())
    d = (vol / n) ** (1 / 3)
    return inside, d, (X * d / d0, Y * d / d0, Z * d / d0)


def green(shape3, d, k):
    """The dipole field's tensor on the grid of offsets, wrapped for a circular convolution."""
    P = [2 * s for s in shape3]
    ax = [np.fft.fftfreq(p, 1.0 / p) * d for p in P]            # 0, d, 2d, ..., -2d, -d
    X, Y, Z = np.meshgrid(*ax, indexing='ij')
    R = np.sqrt(X ** 2 + Y ** 2 + Z ** 2)
    R[0, 0, 0] = 1.0
    u = [X / R, Y / R, Z / R]
    e = np.exp(1j * k * R) / R
    B = (1 - 1j * k * R) / R ** 2
    G = np.empty((3, 3) + R.shape, dtype=complex)
    for a in range(3):
        for b in range(3):
            delta = 1.0 if a == b else 0.0
            G[a, b] = e * (k ** 2 * (delta - u[a] * u[b]) + B * (3 * u[a] * u[b] - delta))
            G[a, b][0, 0, 0] = 0.0
    return np.fft.fftn(G, axes=(2, 3, 4)), P


def alpha_ldr(m, k, d, direction, pol):
    """Draine & Goodman (1993): the lattice dispersion relation's polarisability."""
    eps = m * m
    a_cm = 3 * d ** 3 / (4 * np.pi) * (eps - 1) / (eps + 2)
    S = float(np.sum((np.asarray(direction) * np.abs(pol)) ** 2))
    b1, b2, b3 = -1.8915316, 0.1648469, -1.7700004
    return a_cm / (1 + (a_cm / d ** 3) * ((b1 + eps * b2 + eps * b3 * S) * (k * d) ** 2 - (2 / 3) * 1j * (k * d) ** 3))


def solve(shape, D, L, across, direction, pol, m=M, lam=LAM, tol=1e-8):
    k = 2 * np.pi / lam
    inside, d, (X, Y, Z) = lattice(shape, D, L, across)
    GF, P = green(inside.shape, d, k)
    al = alpha_ldr(m, k, d, direction, pol)
    n = int(inside.sum())
    sl = tuple(slice(0, s) for s in inside.shape)

    def matvec(v):
        p = np.zeros((3,) + tuple(P), dtype=complex)
        for a in range(3):
            p[(a,) + sl][inside] = v[a * n:(a + 1) * n]
        pf = np.fft.fftn(p, axes=(1, 2, 3))
        out = np.empty(3 * n, dtype=complex)
        for a in range(3):
            f = np.fft.ifftn(GF[a, 0] * pf[0] + GF[a, 1] * pf[1] + GF[a, 2] * pf[2])
            out[a * n:(a + 1) * n] = v[a * n:(a + 1) * n] / al - f[sl][inside]
        return out

    r = np.stack([X[inside], Y[inside], Z[inside]])
    phase = np.exp(1j * k * (direction[0] * r[0] + direction[1] * r[1] + direction[2] * r[2]))
    E = np.concatenate([pol[a] * phase for a in range(3)])
    p, info = bicgstab(LinearOperator((3 * n, 3 * n), matvec=matvec, dtype=complex), E, x0=al * E, rtol=tol, maxiter=2000)
    assert info == 0, info
    cext = 4 * np.pi * k * float(np.sum((np.conj(E) * p).imag))
    cabs = 4 * np.pi * k * float(np.sum(abs(p) ** 2)) * (-(1 / al).imag - (2 / 3) * k ** 3)
    pv = p.reshape(3, n)

    def far(dirs):
        """F(r) = k^2 (p - r (r.p)) summed with exp(-i k r.r_j); dirs (n, 3)."""
        dirs = np.atleast_2d(dirs)
        ph = np.exp(-1j * k * (dirs @ r))                       # (ndir, n)
        s = ph @ pv.T                                            # (ndir, 3)
        return k ** 2 * (s - dirs * np.sum(dirs * s, axis=1, keepdims=True))

    # C_sca: |F|^2 over the sphere, Gauss-Legendre in cos(theta), even steps in phi
    mu, w = np.polynomial.legendre.leggauss(40)
    phi = 2 * np.pi * np.arange(80) / 80
    MU, PH = np.meshgrid(mu, phi, indexing='ij')
    st = np.sqrt(1 - MU ** 2)
    dirs = np.stack([st * np.cos(PH), st * np.sin(PH), MU], axis=-1).reshape(-1, 3)
    I = np.sum(abs(far(dirs)) ** 2, axis=1).reshape(MU.shape)
    csca = float(np.sum(I * w[:, None]) * 2 * np.pi / 80)
    return dict(N=n, d=d, mkd=abs(m) * k * d, Cext=cext, Cabs=cabs, Csca=csca, far=far)


SETTINGS = [
    ('the wave square to the axis, its field along the axis', (1.0, 0.0, 0.0), (0.0, 0.0, 1.0)),
    ('the wave square to the axis, its field across it', (1.0, 0.0, 0.0), (0.0, 1.0, 0.0)),
    ('the wave along the axis', (0.0, 0.0, 1.0), (1.0, 0.0, 0.0)),
]
ACROSS = (12, 14, 16, 18, 20, 22, 24, 28, 32)


def main():
    k = 2 * np.pi / LAM
    # this calculation against Mie, for the sphere of 300 nm and one of 1 um
    checks = []
    for D, across in ((300e-9, 16), (1000e-9, 24)):
        s = solve('sphere', D, D, across, (0.0, 0.0, 1.0), np.array([1.0, 0.0, 0.0]))
        q = mie.efficiencies(k * D / 2, M)
        ratio = s['Cext'] / (q['Qext'] * np.pi * D ** 2 / 4)
        print('sphere %4.0f nm: %d dipoles, C_ext over Mie %.5f, C_sca over C_ext %.6f' % (D * 1e9, s['N'], ratio, s['Csca'] / s['Cext']))
        assert abs(ratio - 1) < 0.01, ratio
        checks.append(dict(D=D, N=s['N'], CextOverMie=float(ratio)))
    deg = np.arange(0, 360, 5)
    out = dict(
        source='An independent discrete-dipole calculation (validation/scripts/dda_rod.py): numpy FFT convolution, scipy BiCGStab, the lattice dispersion relation, '
               'lattices of %d to %d dipoles across the rod extrapolated to zero spacing; checked in the script against Mie for a sphere. Not an established code: ADDA could not be built where this was made.' % (ACROSS[0], ACROSS[-1]),
        lam=LAM, m=[M.real, M.imag], D=DIAMETER, L=LENGTH, theta=deg.tolist(), sphereChecks=checks, settings=[])
    for name, direction, pol in SETTINGS:
        runs = [solve('cylinder', DIAMETER, LENGTH, a, direction, np.array(pol), tol=1e-6) for a in ACROSS]
        best = runs[-1]
        # each cross-section against the spacing: the straight line through the lattices, at d = 0
        ds = np.array([r['d'] for r in runs])
        fit = {}
        for key in ('Cext', 'Csca'):
            ys = np.array([r[key] for r in runs])
            slope, c0 = np.polyfit(ds, ys, 1)
            fit[key] = (float(c0), float(np.sqrt(np.mean((ys - (c0 + slope * ds)) ** 2)) / c0))
        # the cut: from the wave's direction round towards the axis (settings 1, 2) or towards the field (setting 3)
        d0 = np.array(direction)
        d1 = np.array([0.0, 0.0, 1.0]) if direction[2] == 0 else np.array(pol)
        dirs = np.cos(np.radians(deg))[:, None] * d0 + np.sin(np.radians(deg))[:, None] * d1
        cut = np.sum(abs(best['far'](dirs)) ** 2, axis=1)
        cut = cut * fit['Csca'][0] / best['Csca']
        print('%s: N = %s, C_ext = %s nm^2, at d = 0 %.2f nm^2 (scatter about the line %.2e), C_sca/C_ext = %.6f, forward/back = %.5f' %
              (name, [r['N'] for r in runs], ['%.2f' % (r['Cext'] * 1e18) for r in runs], fit['Cext'][0] * 1e18, fit['Cext'][1], best['Csca'] / best['Cext'], cut[0] / cut[36]))
        assert abs(best['Csca'] / best['Cext'] - 1) < 2e-3 and abs(best['Cabs']) < 1e-6 * best['Cext']
        out['settings'].append(dict(name=name, dir=list(direction), pol=list(pol), Cext=fit['Cext'][0], Csca=fit['Csca'][0], Cabs=0.0, scatter=fit['Cext'][1],
                                    cut=cut.tolist(), fwdBack=float(cut[0] / cut[36]),
                                    lattices=[dict(across=a, N=r['N'], d=r['d'], mkd=r['mkd'], Cext=r['Cext'], Csca=r['Csca']) for a, r in zip(ACROSS, runs)]))
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ref', 'dda-rod.json')
    with open(path, 'w') as f:
        json.dump(out, f, indent=1)
    print('wrote', os.path.normpath(path))


if __name__ == '__main__':
    main()
