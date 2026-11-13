"""A sphere's place in a steep focus, read by a split detector: a reference for JEKray's validation page.

What is worked out, with no ray, cone or detector model, from the focus's angular spectrum and Lorenz-Mie theory
(mie_reference.py beside this file):

1. The light on the sphere. A Gaussian beam (1/e^2 radius w at the lens, polarised along e_in) is brought to a focus
   at the origin by an ideal lens of focal length f. The focal field is a sum of plane waves, one for each direction
   d of the cone the lens fills:
       E(r) = Int A(d) exp(i k d.r) dOmega.
   Three ideal lenses are taken, which differ in A:
     (a) "mask": a thin mask that keeps the beam's transverse field on its own plane and changes only its phase (the
         bench's part, a Mask with the delay of an ideal lens). A ray at height rho leaves towards the focus,
         rho = f tan(theta). The plane's tangential field U e_in and Maxwell's equations fix the wave in each
         direction (the angular spectrum of a field given on a plane, by stationary phase):
             A(d) = (i / lambda) U(rho) (f / cos(theta)) [e_in - x^ (e_in . d_t) / d_x].
     (b) "thin lens": the same heights, the energy along each ray kept and the polarisation turned with the ray:
             A(d) = (i / lambda) U(rho) (f / cos(theta)^(3/2)) R(d) e_in.
     (c) "aplanatic": Richards and Wolf's lens, rho = f sin(theta):
             A(d) = (i / lambda) U(rho) f sqrt(cos(theta)) R(d) e_in.
   R(d) turns the part of e_in in the plane of the ray and the axis with the ray and leaves the part across it.
   U is the field of a beam of power P: Int |U|^2 / 2Z dA = P.

2. The scattered light. The sphere sits at x_s, a distance across the focus. Each plane wave scatters as Mie theory
   says (Bohren & Huffman eq. 4.74, the wave's phase at the sphere in its amplitude), and the fields add:
       F(d) = sum over waves of F_Mie(d; d_o, A(d_o) dOmega exp(i k d_o.x_s)),   E_s = F(d) exp(i k |r - x_s|) / |r - x_s|.
   This is exact for a sphere of any size. The single dipole p = alpha E(x_s) is worked out beside it, to show what
   it misses for a sphere this large.

3. The detector. Far from the focus the unscattered beam in the direction d is -(2 pi i / k) A(d) exp(ikr) / r, and
   the scattered light F(d) exp(-i k d.x_s) exp(ikr) / r. Per solid angle the two interfere by
       dP/dOmega = -(4 pi / k) Im(conj(A) . F exp(-i k d.x_s)) / 2Z.
   A lens that collects the cone and a detector behind it split along the line the sphere moves across read the
   light with d.y > 0 less the light with d.y < 0, over the beam's power P. (Which lens collects does not matter:
   it only moves each direction to a place on the detector, on the same side.)

Checks of the script itself, at a low numerical aperture (the gentle focus of scatter_bench.py): the slope against
Gittes and Schmidt's closed form for a Rayleigh sphere (Optics Letters 23, 7 (1998)) and against scatter_bench.py's
own integration; and that the interference over the whole cone is minus the sphere's extinction in this light.

Writes ../ref/scatter-position-focus.json.

    python scatter_position_focus.py
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mie_reference import amplitudes, efficiencies  # noqa: E402
from scatter_bench import silica_index  # noqa: E402

LAM = 1.55e-6
K = 2 * np.pi / LAM
Z0 = 376.730313668


def directions(theta_max, nt, nphi):
    x, w = np.polynomial.legendre.leggauss(nt)
    th = 0.5 * theta_max * (x + 1)
    wt = 0.5 * theta_max * w * np.sin(th)
    ph = (np.arange(nphi) + 0.5) * 2 * np.pi / nphi
    TH, PH = np.meshgrid(th, ph, indexing='ij')
    W = np.outer(wt, np.full(nphi, 2 * np.pi / nphi))
    d = np.stack([np.cos(TH), np.sin(TH) * np.cos(PH), np.sin(TH) * np.sin(PH)], -1)
    return TH.ravel(), PH.ravel(), W.ravel(), d.reshape(-1, 3)


def spectrum(lens, th, ph, d, f, w, e_in, power):
    """A(d) for each direction: complex vectors, V/m per steradian times m (so that A dOmega exp(ik d.r) is V/m)."""
    rho = f * (np.sin(th) if lens == 'aplanatic' else np.tan(th))
    u0 = np.sqrt(2 * Z0 * power * 2 / (np.pi * w * w))          # the beam's field on its axis: Int |U|^2 / 2Z dA = P
    U = u0 * np.exp(-rho * rho / (w * w))
    rad = np.stack([np.zeros_like(ph), np.cos(ph), np.sin(ph)], -1)           # across the axis, towards the ray
    azi = np.stack([np.zeros_like(ph), -np.sin(ph), np.cos(ph)], -1)
    if lens == 'mask':
        # the plane's own transverse field, and the part along the axis that makes it square to d
        v = e_in[None, :] - np.outer((d[:, 1] * e_in[1] + d[:, 2] * e_in[2]) / d[:, 0], [1.0, 0, 0])
        g = f / np.cos(th)
    else:
        mer = np.stack([-np.sin(th), np.cos(th) * np.cos(ph), np.cos(th) * np.sin(ph)], -1)     # rad turned with the ray
        v = (azi @ e_in)[:, None] * azi + (rad @ e_in)[:, None] * mer
        g = f / np.cos(th) ** 1.5 if lens == 'thin lens' else f * np.sqrt(np.cos(th))
    return (1j / LAM) * (U * g)[:, None] * v


class Sphere:
    def __init__(self, a, m):
        self.x = K * a
        self.m = m
        mu = np.linspace(-1, 1, 40001)
        s1, s2 = amplitudes(self.x, m, np.arccos(mu))
        self.mu, self.s1, self.s2 = mu, s1, s2

    def S(self, c):
        c = np.clip(c, -1, 1)
        return (np.interp(c, self.mu, self.s1.real) + 1j * np.interp(c, self.mu, self.s1.imag),
                np.interp(c, self.mu, self.s2.real) + 1j * np.interp(c, self.mu, self.s2.imag))

    def far(self, d0, E0, r):
        """Mie far field towards the directions r (n, 3) of one plane wave along d0 with the field E0 at the sphere."""
        c = r @ d0
        s1, s2 = self.S(c)
        ep = np.cross(r, d0)
        n = np.linalg.norm(ep, axis=1)
        ok = n > 1e-9
        ep = np.where(ok[:, None], ep / np.maximum(n, 1e-300)[:, None], 0)
        epi = np.cross(d0, ep)
        eps = np.cross(r, ep)
        F = (1j / K) * (s2[:, None] * (epi @ E0)[:, None] * eps + s1[:, None] * (ep @ E0)[:, None] * ep)
        # straight on (or back): any e_perp does, and both give S1 E
        F[~ok] = (1j / K) * s1[~ok, None] * E0[None, :] * np.where(c[~ok, None] > 0, 1, -1)
        return F


def signal(lens, f, w, theta_max, e_in, a, m, xs, power=0.1, nt=28, nphi=72, dipole=False):
    """(P+ - P-) / P for the sphere at each of the places xs (m, along y); and the interference over the whole cone."""
    th, ph, W, d = directions(theta_max, nt, nphi)
    A = spectrum(lens, th, ph, d, f, w, e_in, power)
    sph = Sphere(a, m)
    alpha = a ** 3 * (m * m - 1) / (m * m + 2)
    out, tot = [], []
    for xs_ in xs:
        Eo = A * (W * np.exp(1j * K * d[:, 1] * xs_))[:, None]           # each wave's field at the sphere
        if dipole:
            p = alpha * Eo.sum(0)                                           # Gaussian measure: F = k^2 (p - r (r.p))
            F = K * K * (p[None, :] - d * (d @ p)[:, None])
        else:
            F = np.zeros_like(A)
            for o in range(len(W)):
                F += sph.far(d[o], Eo[o], d)
        F0 = F * np.exp(-1j * K * d[:, 1] * xs_)[:, None]                   # referred to the focus
        inter = -(4 * np.pi / K) * np.imag(np.sum(np.conj(A) * F0, 1)) / (2 * Z0) * W
        own = np.sum(abs(F0) ** 2, 1) / (2 * Z0) * W
        sg = np.sign(d[:, 1])
        out.append(float(np.sum(sg * (inter + own)) / power))
        tot.append(float(np.sum(inter)))
    return np.array(out), np.array(tot), dict(A=A, W=W, d=d, sph=sph)


def slope(lens, f, w, theta_max, e_in, a, m, h, **kw):
    s, tot, _ = signal(lens, f, w, theta_max, e_in, a, m, [h, -h], **kw)
    return (s[0] - s[1]) / (2 * h), tot[0]


def main():
    n = float(silica_index(1.55))
    m = complex(n, 0)
    ez, ey = np.array([0.0, 0.0, 1.0]), np.array([0.0, 1.0, 0.0])
    out = {'wavelength_nm': 1550, 'silica_index': n}

    # ---- the script against known answers, at a low numerical aperture (scatter_bench.py's gentle focus) ----
    f, w, a = 2e-3, 0.15e-3, 50e-9
    wf = LAM * f / (np.pi * w)
    gs = 16 / np.sqrt(np.pi) * K * (a ** 3 * (m * m - 1) / (m * m + 2)).real / wf ** 3
    bench = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ref', 'scatter-bench.json')))['position']['slope_per_um'] * 1e6
    low, checks = {}, []
    for lens in ['mask', 'thin lens', 'aplanatic']:
        # (the beam fills the cone to four of its radii: nothing of it is cut)
        sl, tot = slope(lens, f, w, float(np.arctan(4 * w / f)), ez, a, m, 0.01 * wf, nt=36, nphi=64)
        low[lens] = sl
        ext = efficiencies(K * a, m)['Qext'] * np.pi * a * a * 2 * 0.1 / (np.pi * wf * wf)
        print('low NA, %-10s: slope %.6g per um; Gittes & Schmidt %.6g (ratio %.4f); scatter_bench.py %.6g (ratio %.4f); interference over the cone %.5g W against -C_ext I_0 = %.5g'
              % (lens, abs(sl) * 1e-6, gs * 1e-6, abs(sl) / gs, bench * 1e-6, abs(sl) / bench, tot, -ext))
        # the script's own checks, kept with their verdicts (a failure is written down, not hidden)
        for name, val, ref, tol in [('against Gittes and Schmidt', abs(sl), gs, 0.02), ('against scatter_bench.py', abs(sl), bench, 0.01), ('interference over the cone against -C_ext I_0 of the paraxial waist', tot, -ext, 0.01)]:
            ok = bool(abs(val / ref - 1) < tol)
            checks.append(dict(lens=lens, check=name, value=float(val), reference=float(ref), off=float(val / ref - 1), tolerance=tol, ok=ok))
            if not ok:
                print('   FAILED: %s, %s: off by %.2f%% (allowed %.0f%%)' % (lens, name, 100 * (val / ref - 1), 100 * tol))
    out['low_na'] = dict(waist_um=wf * 1e6, radius_nm=50, gittes_schmidt_per_um=gs * 1e-6, scatter_bench_per_um=bench * 1e-6,
                         slope_per_um={k: abs(v) * 1e-6 for k, v in low.items()}, checks=checks)

    # ---- the tight focus of the example bench: w = 1.5 mm, f = 2 mm, the lens 5.333 mm across; a 300 nm sphere ----
    f, w, a = 2e-3, 1.5e-3, 150e-9
    tmax = float(np.arctan(2.6665 / 2))
    cases = []
    for pol, e_in in [('out of the plane, the sphere moved in the plane (across the polarisation)', ez), ('in the plane, the sphere moved in the plane (along the polarisation)', ey)]:
        row = dict(polarised=pol)
        for lens in ['mask', 'thin lens', 'aplanatic']:
            th = tmax                 # the same cone for each lens (NA 0.8)
            sl, tot = slope(lens, f, w, th, e_in, a, m, 10e-9)
            # more directions: the answer to four figures
            sl2, _ = slope(lens, f, w, th, e_in, a, m, 10e-9, nt=40, nphi=96)
            sd, _ = slope(lens, f, w, th, e_in, a, m, 10e-9, dipole=True)
            row[lens] = dict(slope_per_um=abs(sl2) * 1e-6, slope_coarser_per_um=abs(sl) * 1e-6, dipole_per_um=abs(sd) * 1e-6, extinction_W=-tot)
            print('NA 0.8, %s, %-10s: slope %.6g per um (%.6g on the coarser grid); a single dipole would give %.6g (%.1f%% off); extinction %.5g W'
                  % (pol[:16], lens, abs(sl2) * 1e-6, abs(sl) * 1e-6, abs(sd) * 1e-6, 100 * (abs(sd) / abs(sl2) - 1), -tot))
        cases.append(row)
    # the signal across the focus, for the bench's lens and the first polarisation
    xs = np.linspace(-1.2e-6, 1.2e-6, 25)
    s, _, _ = signal('mask', f, w, tmax, ez, a, m, xs)
    out['tight'] = dict(beam_radius_mm=1.5, focal_length_mm=2, lens_diameter_mm=5.333, radius_nm=150, cases=cases, x_um=(xs * 1e6).tolist(), signal=s.tolist())
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ref', 'scatter-position-focus.json')
    with open(path, 'w') as fh:
        json.dump(out, fh, indent=1)


if __name__ == '__main__':
    main()
