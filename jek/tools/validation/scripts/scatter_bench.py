"""Reference values for a particle's scattered light on the bench, for JEKray's validation page.

Three things a bench with a Particle part reads, each worked out here from Lorenz-Mie theory alone
(mie_reference.py beside this file: scipy's spherical Bessel functions, Bohren & Huffman's eq. 4.53 and 4.74),
with no ray, cone or detector model:

1. Energy. A sphere at the waist of a wide Gaussian beam (a plane wave at the sphere) and a detector that takes in
   the whole beam. With the particle there the detector reads less by the extinction, C_ext I_0, and more by the
   scattered light that lands on it: the change is -(C_ext I_0 - P_sca f), f the share of the scattered power inside
   the cone the detector fills. For a sphere that does not absorb, C_ext = C_sca. I_0 = 2 P / (pi w0^2).

2. Position signal. A small sphere moved a distance x across a Gaussian focus (waist w0), and all the forward light
   on a detector split in two along the line the sphere moves across. In the far field the unscattered beam is
       E_b = -i E_0 (z_R / r) exp(-(k w0 sin(theta) / 2)^2) e^{ikr},   z_R = k w0^2 / 2,
   polarised as the beam is, and the scattered field is the sphere's Mie field in the plane wave E_0 exp(-x^2/w0^2)
   it sits in, with the phase exp(-i k x r^.y^) of its place. The two interfere, per solid angle, by
   2 Re(conj(E_b) . E_s) r^2 / 2Z; the signal is that over the half y > 0 less that over y < 0, over the beam's power.
   Integrated here on a Gauss-Legendre grid in cos(theta) and an even one round the beam. The closed form for a
   Rayleigh sphere (F. Gittes and C. F. Schmidt, Optics Letters 23, 7 (1998)), (16 / sqrt(pi)) k alpha / w0^3 per
   unit length at the middle with alpha = a^3 (m^2 - 1) / (m^2 + 2), is printed beside it.

3. Collected power. The share of the scattered power inside a cone of numerical aperture 0.5, ahead of the sphere and
   at 90 degrees to the beam in the plane of the polarisation, for a plane wave.

Writes ../ref/scatter-bench.json.

    python scatter_bench.py
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mie_reference import amplitudes, efficiencies  # noqa: E402

LAM = 1.55e-6
K = 2 * np.pi / LAM


def silica_index(um):
    """Fused silica, Malitson's Sellmeier fit (J. Opt. Soc. Am. 55, 1205 (1965))."""
    l2 = um * um
    return np.sqrt(1 + 0.6961663 * l2 / (l2 - 0.0684043 ** 2) + 0.4079426 * l2 / (l2 - 0.1162414 ** 2) + 0.8974794 * l2 / (l2 - 9.896161 ** 2))


def grid(theta_max, nt=400, nphi=720):
    """Directions inside a cone about +x: cos(theta) nodes, phi even; weights are solid angles."""
    x, w = np.polynomial.legendre.leggauss(nt)
    c0 = np.cos(theta_max)
    mu = c0 + (1 - c0) * 0.5 * (x + 1)
    wm = w * 0.5 * (1 - c0)
    phi = (np.arange(nphi) + 0.5) * 2 * np.pi / nphi
    MU, PHI = np.meshgrid(mu, phi, indexing='ij')
    W = np.outer(wm, np.full(nphi, 2 * np.pi / nphi))
    return MU, PHI, W


def far_field(x, m, mu, phi, pol):
    """The Mie far field F (E_s = F e^{ikr}/r, unit incident field) for a wave along +x polarised along the unit
    vector pol (in the y-z plane), at directions (cos(theta) from +x, phi round it from +y towards +z): Bohren &
    Huffman eq. 4.74, F = (i/k)[S2 (E . e_par,i) e_par,s + S1 (E . e_perp) e_perp]."""
    st = np.sqrt(np.maximum(0.0, 1 - mu * mu))
    r = np.stack([mu, st * np.cos(phi), st * np.sin(phi)], -1)
    s1, s2 = amplitudes(x, m, np.arccos(np.clip(mu, -1, 1)))
    d = np.array([1.0, 0.0, 0.0])
    eperp = np.cross(r, d)                     # r x d
    n = np.linalg.norm(eperp, axis=-1, keepdims=True)
    eperp = np.where(n > 1e-12, eperp / np.maximum(n, 1e-300), np.array([0.0, 0.0, 1.0]))
    epar_i = np.cross(d, eperp)
    epar_s = np.cross(r, eperp)
    return (1j / K) * (s2[..., None] * (epar_i @ pol)[..., None] * epar_s + s1[..., None] * (eperp @ pol)[..., None] * eperp), r


def cone_share(x, m, axis, half, pol, nt=200, nphi=400):
    """The share of the scattered power inside a cone of half-angle `half` about the unit vector `axis`."""
    xg, wg = np.polynomial.legendre.leggauss(nt)
    c0 = np.cos(half)
    mu_c = c0 + (1 - c0) * 0.5 * (xg + 1)
    wm = wg * 0.5 * (1 - c0)
    ph = (np.arange(nphi) + 0.5) * 2 * np.pi / nphi
    t = np.array([0.0, 0.0, 1.0]) if abs(axis[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    ex = np.cross(t, axis)
    ex /= np.linalg.norm(ex)
    ey = np.cross(axis, ex)
    MU, PH = np.meshgrid(mu_c, ph, indexing='ij')
    S = np.sqrt(1 - MU * MU)
    r = S[..., None] * np.cos(PH)[..., None] * ex + S[..., None] * np.sin(PH)[..., None] * ey + MU[..., None] * axis
    mu = r[..., 0]
    phi = np.arctan2(r[..., 2], r[..., 1])
    F, _ = far_field(x, m, mu, phi, pol)
    inside = np.sum(np.sum(abs(F) ** 2, -1) * np.outer(wm, np.full(nphi, 2 * np.pi / nphi)))
    total = efficiencies(x, m)['Qsca'] * np.pi * (x / K) ** 2      # C_sca for a unit field: Int |F|^2 dOmega
    return float(inside / total)


def position_slope(a, m, w0, theta_max, pol):
    """d/dx at x = 0 of (P+ - P-)/P for a sphere of radius a moved across a focus of waist w0 along y; per metre."""
    x = K * a
    MU, PHI, W = grid(theta_max)
    F, r = far_field(x, m, MU, PHI, pol)
    st = np.sqrt(1 - MU * MU)
    # the beam's far field per unit E_0, times r e^{-ikr}; polarised as pol, square to r
    pb = pol - r * (r @ pol)[..., None]
    pb /= np.linalg.norm(pb, axis=-1, keepdims=True)
    zr = K * w0 * w0 / 2
    Eb = (-1j * zr * np.exp(-(K * w0 * st / 2) ** 2))[..., None] * pb

    def signal(xd):
        Es = F * np.exp(-xd * xd / (w0 * w0)) * np.exp(-1j * K * xd * r[..., 1])[..., None]
        cross = 2 * np.real(np.sum(np.conj(Eb) * Es, -1)) * W
        return float(np.sum(cross * np.sign(r[..., 1])) / np.sum(np.sum(abs(Eb) ** 2, -1) * W))
    h = 0.01 * w0
    return (signal(h) - signal(-h)) / (2 * h), signal


def main():
    n_sio2 = float(silica_index(1.55))
    out = {'wavelength_nm': 1550, 'silica_index': n_sio2}
    # 1. energy: beam waist 50 um, 100 mW, detector 10 mm across 100 mm on
    w0, P, half = 50e-6, 0.1, float(np.arctan(5 / 100))
    I0 = 2 * P / (np.pi * w0 * w0)
    pol_p = np.array([0.0, 1.0, 0.0])              # in the bench plane
    energy = []
    # gold's index at 1550 nm as JEKray's table has it (Johnson & Christy's data, as its thin films use): an input here
    for name, a, m in [('silica, 300 nm across', 150e-9, complex(n_sio2, 0)), ('gold, 100 nm across', 50e-9, complex(0.524055, 10.742442))]:
        q = efficiencies(K * a, m)
        f = cone_share(K * a, m, np.array([1.0, 0.0, 0.0]), half, pol_p)
        area = np.pi * a * a
        energy.append(dict(name=name, radius_nm=a * 1e9, m=[m.real, m.imag], Qext=q['Qext'], Qsca=q['Qsca'], Qabs=q['Qabs'], I0=I0,
                           Pext_mW=q['Qext'] * area * I0 * 1e3, Psca_mW=q['Qsca'] * area * I0 * 1e3, Pabs_mW=q['Qabs'] * area * I0 * 1e3, share_on_detector=f,
                           change_mW=-(q['Qext'] - q['Qsca'] * f) * area * I0 * 1e3))
    out['energy'] = dict(waist_um=50, power_mW=100, detector_half_angle=half, cases=energy)
    # 2. position: 1550 nm focused by f = 2 mm from a 0.15 mm beam: waist lam f / (pi w)
    wf = LAM * 2e-3 / (np.pi * 0.15e-3)
    a, m = 50e-9, complex(n_sio2, 0)
    slope, signal = position_slope(a, m, wf, float(np.arctan(1.2 / 2)), np.array([0.0, 0.0, 1.0]))
    alpha = a ** 3 * (m * m - 1) / (m * m + 2)
    gs = 16 / np.sqrt(np.pi) * K * alpha.real / wf ** 3
    xs = np.linspace(-2, 2, 41) * wf
    out['position'] = dict(waist_um=wf * 1e6, radius_nm=50, m=[m.real, 0.0], slope_per_um=slope * 1e-6, gittes_schmidt_per_um=float(gs) * 1e-6,
                           x_um=(xs * 1e6).tolist(), signal=[signal(v) for v in xs])
    print('position slope per um: integration %.6g, Gittes & Schmidt (Rayleigh) %.6g, ratio %.4f' % (slope * 1e-6, gs * 1e-6, slope / gs))
    # 3. collected: NA 0.5 ahead and at 90 degrees, light polarised in the plane (along y) and out of it (along z)
    xs_, m_ = K * 150e-9, complex(n_sio2, 0)
    hc = float(np.arcsin(0.5))
    out['collect'] = dict(na=0.5, radius_nm=150, m=[m_.real, 0.0], cases=[
        dict(name='ahead, polarised in the plane', share=cone_share(xs_, m_, np.array([1.0, 0, 0]), hc, pol_p)),
        dict(name='at 90 degrees in the plane, polarised in the plane', share=cone_share(xs_, m_, np.array([0, 1.0, 0]), hc, pol_p)),
        dict(name='at 90 degrees in the plane, polarised out of it', share=cone_share(xs_, m_, np.array([0, 1.0, 0]), hc, np.array([0, 0, 1.0]))),
        dict(name='behind, polarised in the plane', share=cone_share(xs_, m_, np.array([-1.0, 0, 0]), hc, pol_p))])
    # the whole sphere holds all of it
    assert abs(cone_share(xs_, m_, np.array([1.0, 0, 0]), np.pi, pol_p, 400, 400) - 1) < 1e-6
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ref', 'scatter-bench.json')
    with open(path, 'w') as fh:
        json.dump(out, fh, indent=1)
    print(json.dumps({k: v for k, v in out.items() if k != 'position'}, indent=1))


if __name__ == '__main__':
    main()
