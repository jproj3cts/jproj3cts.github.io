"""Lorenz-Mie reference values for JEKray's validation page.

An independent Mie calculation: the coefficients a_n and b_n from scipy's spherical Bessel
functions (scipy.special.spherical_jn and spherical_yn, the sphere's interior at a complex
argument), in Bohren & Huffman's form (Absorption and Scattering of Light by Small Particles,
1983, eq. 4.53) with the Riccati-Bessel functions written out, no recurrence of its own.
Fields go as exp(-i w t): an absorbing sphere has m = n + i kappa, kappa > 0.

The script checks itself against Bohren & Huffman's Appendix A test case (a sphere of radius
0.525 um, index 1.55, at 0.6328 um: Q_ext = Q_sca = 3.10543, Q_back = 2.92534) and, when the
miepython package is installed (an extra: pip install miepython), against it.

Writes ../ref/mie.json: for each case the efficiencies, the asymmetry and S1, S2 every 5 degrees.

    python mie_reference.py
"""
import json
import os

import numpy as np
from scipy.special import spherical_jn, spherical_yn


def terms(x):
    """Wiscombe's number of terms (Appl. Opt. 19, 1505 (1980)), and a few more: the series has converged well before."""
    return int(np.ceil(x + 4.05 * x ** (1 / 3) + 2)) + 8


def coefficients(x, m):
    n = np.arange(1, terms(x) + 1)
    mx = m * x
    # Riccati-Bessel: psi(z) = z j_n(z), xi(z) = z h1_n(z), and their derivatives
    jx, djx = spherical_jn(n, x), spherical_jn(n, x, derivative=True)
    yx, dyx = spherical_yn(n, x), spherical_yn(n, x, derivative=True)
    jm, djm = spherical_jn(n, mx), spherical_jn(n, mx, derivative=True)
    psi, dpsi = x * jx, jx + x * djx
    xi, dxi = x * (jx + 1j * yx), (jx + 1j * yx) + x * (djx + 1j * dyx)
    psim, dpsim = mx * jm, jm + mx * djm
    a = (m * psim * dpsi - psi * dpsim) / (m * psim * dxi - xi * dpsim)
    b = (psim * dpsi - m * psi * dpsim) / (psim * dxi - m * xi * dpsim)
    return n, a, b


def efficiencies(x, m):
    n, a, b = coefficients(x, m)
    qext = 2 / x ** 2 * np.sum((2 * n + 1) * (a + b).real)
    qsca = 2 / x ** 2 * np.sum((2 * n + 1) * (abs(a) ** 2 + abs(b) ** 2))
    qback = abs(np.sum((2 * n + 1) * (-1.0) ** n * (a - b))) ** 2 / x ** 2
    g = 4 / (x ** 2 * qsca) * (np.sum(n[:-1] * (n[:-1] + 2) / (n[:-1] + 1) * (a[:-1] * np.conj(a[1:]) + b[:-1] * np.conj(b[1:])).real)
                               + np.sum((2 * n + 1) / (n * (n + 1)) * (a * np.conj(b)).real))
    return dict(Qext=float(qext), Qsca=float(qsca), Qabs=float(qext - qsca), Qback=float(qback), g=float(g))


def amplitudes(x, m, theta):
    """S1 and S2 at the angles theta (radians): pi_n and tau_n from Legendre's recurrence."""
    n, a, b = coefficients(x, m)
    mu = np.cos(np.asarray(theta, dtype=float))
    S1 = np.zeros(mu.shape, dtype=complex)
    S2 = np.zeros(mu.shape, dtype=complex)
    pi0, pi1 = np.zeros_like(mu), np.ones_like(mu)
    for k in range(len(n)):
        j = k + 1
        tau = j * mu * pi1 - (j + 1) * pi0
        f = (2 * j + 1) / (j * (j + 1))
        S1 += f * (a[k] * pi1 + b[k] * tau)
        S2 += f * (a[k] * tau + b[k] * pi1)
        pi0, pi1 = pi1, ((2 * j + 1) * mu * pi1 - (j + 1) * pi0) / j
    return S1, S2


CASES = [
    ('300 nm silica sphere at 1550 nm', 2 * np.pi * 0.150 / 1.550, 1.444 + 0j, True),
    ('Bohren & Huffman, Appendix A', 2 * np.pi * 0.525 / 0.6328, 1.55 + 0j, True),
    ('x = 10, m = 1.5', 10.0, 1.5 + 0j, False),
    ('x = 1, m = 1.5 + 1i', 1.0, 1.5 + 1j, True),
    ('x = 50, m = 1.33 + 0.01i', 50.0, 1.33 + 0.01j, False),
    ('x = 2, m = 0.5 + 10i', 2.0, 0.5 + 10j, False),
]


def main():
    # the published test case
    bh = efficiencies(2 * np.pi * 0.525 / 0.6328, 1.55)
    assert abs(bh['Qext'] - 3.10543) < 6e-6 and abs(bh['Qsca'] - 3.10543) < 6e-6 and abs(bh['Qback'] - 2.92534) < 6e-6, bh
    # the optical theorem and the back direction, from the amplitudes
    for _, x, m, _ in CASES:
        q = efficiencies(x, m)
        s1, _ = amplitudes(x, m, [0.0, np.pi])
        assert abs(4 / x ** 2 * s1[0].real - q['Qext']) < 1e-9 * q['Qext']
        assert abs(4 / x ** 2 * abs(s1[1]) ** 2 - q['Qback']) < 1e-9 * max(q['Qback'], 1e-9)
    extra = None
    try:
        import miepython
        extra = miepython.__version__
        for _, x, m, _ in CASES:
            q = efficiencies(x, m)
            # miepython writes an absorber's index as n - i kappa
            qe, qs, qb, g = miepython.efficiencies_mx(np.conj(m), x)
            for mine, theirs in ((q['Qext'], qe), (q['Qsca'], qs), (q['Qback'], qb), (q['g'], g)):
                assert abs(mine - theirs) < 1e-8 * max(abs(theirs), 1e-3), (x, m, mine, theirs)
    except ImportError:
        pass
    deg = np.arange(0, 181, 5)
    out = dict(source='A Mie calculation on scipy\'s spherical Bessel functions (validation/scripts/mie_reference.py), checked against Bohren & Huffman\'s Appendix A test case'
               + (' and against miepython ' + extra if extra else ''), theta=deg.tolist(), cases=[])
    for name, x, m, with_s in CASES:
        c = dict(name=name, x=float(x), m=[m.real, m.imag], **efficiencies(x, m))
        if with_s:
            s1, s2 = amplitudes(x, m, np.radians(deg))
            c.update(S1re=s1.real.tolist(), S1im=s1.imag.tolist(), S2re=s2.real.tolist(), S2im=s2.imag.tolist())
        out['cases'].append(c)
        print(name, {k: '%.8g' % v for k, v in c.items() if k[0] in 'Qg'})
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ref', 'mie.json')
    with open(path, 'w') as f:
        json.dump(out, f, indent=1)
    print('wrote', os.path.normpath(path), '(miepython ' + extra + ' agreed)' if extra else '(miepython not installed: not compared)')


if __name__ == '__main__':
    main()
