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

A real lens (the last part of the file). In place of an ideal lens's rule, the pupil of a glass asphere is traced here,
exactly, from its prescription: a ray of the collimated beam at height h through the flat first face and the conic second
face (Snell's law at the face's own normal), its angle to the axis as it leaves, its optical path to the focus, and, where
a face is bare, Fresnel's transmission of each polarisation. The energy between two heights is the energy between their
two angles, which gives the wave in each direction:
    A(d) = (i / lambda) U(h) sqrt(T_s,p) sqrt(h dh / (sin(theta) dtheta)) [the s part across the ray's plane, the p part turned with the ray].
From it: the focal field (its widths, its peak, its part along the axis), the sphere's scattered power and the share of
it inside the collection lens's cone, and the split detector's slope. Written to ../ref/scatter-real-lens.json.

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


def bk7_index(um):
    """N-BK7, Schott's Sellmeier coefficients."""
    l2 = um * um
    return np.sqrt(1 + 1.03961212 * l2 / (l2 - 0.00600069867) + 0.231792344 * l2 / (l2 - 0.0200179144) + 1.01046945 * l2 / (l2 - 103.560653))


def trace_lens(P, bare, nh=20001):
    """The asphere P (n, R, k of its second face, centre thickness T, vertex to focus L, semi-aperture, all metres), a collimated
    beam along its axis in at the flat face: for heights h, the angle theta each ray leaves at, its optical path to the focus
    less the axis ray's, and the power each polarisation keeps through both faces."""
    n, c, k = P['n'], 1 / abs(P['R']), P['k']
    h = np.linspace(0, P['semi'], nh)
    root = np.sqrt(1 - (1 + k) * c * c * h * h)
    z = c * h * h / (1 + root)                  # the sag, back into the glass from the vertex
    dz = c * h / root
    # the face's normal towards the air, the ray inside along the axis: Snell in vector form
    N = np.stack([1 / np.sqrt(1 + dz * dz), dz / np.sqrt(1 + dz * dz)], -1)
    ci = N[:, 0]
    ct = np.sqrt(1 - n * n * (1 - ci * ci))
    t = n * np.array([1.0, 0.0])[None, :] + (ct - n * ci)[:, None] * N
    theta = np.arctan2(np.abs(t[:, 1]), t[:, 0])
    # the ray must go to the focus: where it meets the axis
    xf = h / np.maximum(np.tan(theta), 1e-300) - z
    opl = n * (P['T'] - z) + np.hypot(P['L'] + z, h) - (n * P['T'] + P['L'])
    if bare:
        rs = (n * ci - ct) / (n * ci + ct)
        rp = (ci - n * ct) / (ci + n * ct)
        t1 = 1 - ((n - 1) / (n + 1)) ** 2
        Ts, Tp = t1 * (1 - rs * rs), t1 * (1 - rp * rp)
    else:
        Ts = Tp = np.ones_like(h)
    return dict(h=h, theta=theta, opl=opl, Ts=Ts, Tp=Tp, focus_spread=float(np.max(np.abs(xf[1:] - P['L']))))


def spectrum(lens, th, ph, d, f, w, e_in, power):
    """A(d) for each direction: complex vectors, V/m per steradian times m (so that A dOmega exp(ik d.r) is V/m)."""
    if isinstance(lens, dict):
        # a traced lens: the height each direction came from, and the energy between heights as the energy between angles
        Tr = lens
        h = np.interp(th, Tr['theta'], Tr['h'])
        dh = np.gradient(Tr['h'], Tr['theta'])
        jac = h * np.interp(th, Tr['theta'], dh) / np.sin(th)
        u0 = np.sqrt(2 * Z0 * power * 2 / (np.pi * w * w))
        U = u0 * np.exp(-h * h / (w * w)) * np.sqrt(jac) * np.exp(1j * K * np.interp(th, Tr['theta'], Tr['opl']))
        azi = np.stack([np.zeros_like(ph), -np.sin(ph), np.cos(ph)], -1)
        rad = np.stack([np.zeros_like(ph), np.cos(ph), np.sin(ph)], -1)
        mer = np.stack([-np.sin(th), np.cos(th) * np.cos(ph), np.cos(th) * np.sin(ph)], -1)
        v = (np.sqrt(np.interp(th, Tr['theta'], Tr['Ts'])) * (azi @ e_in))[:, None] * azi + (np.sqrt(np.interp(th, Tr['theta'], Tr['Tp'])) * (rad @ e_in))[:, None] * mer
        return (1j / LAM) * U[:, None] * v
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


def signal(lens, f, w, theta_max, e_in, a, m, xs, power=0.1, nt=28, nphi=72, dipole=False, after=None):
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
        if after is None:
            inter = -(4 * np.pi / K) * np.imag(np.sum(np.conj(A) * F0, 1)) / (2 * Z0) * W
            own = np.sum(abs(F0) ** 2, 1) / (2 * Z0) * W
            norm = power
        else:
            # a collection lens with bare faces between the cone and the detector: the part of each field across its ray's
            # plane and the part in it pass by their own transmissions (after: those two, by angle, and the beam's power behind it)
            azi = np.stack([np.zeros_like(ph), -np.sin(ph), np.cos(ph)], -1)
            mer = np.stack([-np.sin(th), np.cos(th) * np.cos(ph), np.cos(th) * np.sin(ph)], -1)
            inter, own = 0, 0
            for e, T in [(azi, after[0](th)), (mer, after[1](th))]:
                ac, fc = np.sum(A * e, 1), np.sum(F0 * e, 1)
                inter = inter - (4 * np.pi / K) * np.imag(np.conj(ac) * fc) / (2 * Z0) * W * T
                own = own + abs(fc) ** 2 / (2 * Z0) * W * T
            norm = after[2]
        sg = np.sign(d[:, 1])
        out.append(float(np.sum(sg * (inter + own)) / norm))
        tot.append(float(np.sum(inter)))
    return np.array(out), np.array(tot), dict(A=A, W=W, d=d, sph=sph)


def slope(lens, f, w, theta_max, e_in, a, m, h, **kw):
    """d/dx of the signal at the middle (per metre), and the interference over the whole cone (W)."""
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


def focal_field(A, W, d, pts):
    """E at the points (n, 3), metres from the focus."""
    return (np.exp(1j * K * (pts @ d.T)) * W[None, :]) @ A


def fwhm(x, I):
    half = I.max() / 2
    i = np.argmax(I)
    lo = np.interp(half, I[:i + 1], x[:i + 1])
    hi = np.interp(half, I[i:][::-1], x[i:][::-1])
    return float(hi - lo)


def real_lens():
    n = float(bk7_index(1.55))
    P = dict(n=n, R=-(n - 1) * 4e-3, k=-n * n, T=2.5e-3, L=4e-3)
    # its clear aperture to NA 0.5: tan(theta) = h / (L + z) with the hyperbola h^2 = 2 (n - 1) L z + (n^2 - 1) z^2
    tt = np.tan(np.arcsin(0.5)) ** 2
    a, b, c = n * n - 1 - tt, 2 * (n - 1) * P['L'] - 2 * tt * P['L'], -tt * P['L'] ** 2
    zr = (-b + np.sqrt(b * b - 4 * a * c)) / (2 * a)
    P['semi'] = float(np.sqrt(tt) * (P['L'] + zr))
    w, a_s, m, power = 1.7e-3, 150e-9, complex(float(silica_index(1.55)), 0), 0.1
    ez, ey = np.array([0.0, 0.0, 1.0]), np.array([0.0, 1.0, 0.0])
    out = dict(prescription=dict(glass='N-BK7', n=n, R_mm=P['R'] * 1e3, k=P['k'], thickness_mm=2.5, vertex_to_focus_mm=4, semi_aperture_mm=P['semi'] * 1e3, sag_at_edge_mm=float(zr) * 1e3),
               beam_radius_mm=1.7, power_mW=100, sphere_radius_nm=150, cases={})
    line = np.linspace(-3e-6, 3e-6, 1201)
    for name, bare in [('coated', False), ('bare', True)]:
        Tr = trace_lens(P, bare)
        tmax = float(Tr['theta'][-1])
        th, ph, W, d = directions(tmax, 40, 96)
        A = spectrum(Tr, th, ph, d, None, w, ez, power)
        E0 = focal_field(A, W, d, np.zeros((1, 3)))[0]
        Ey = focal_field(A, W, d, np.stack([0 * line, line, 0 * line], -1))       # across the polarisation
        Ezl = focal_field(A, W, d, np.stack([0 * line, 0 * line, line], -1))      # along it
        I = lambda E: np.sum(abs(E) ** 2, -1)
        c = dict(opl_spread_waves=float(np.max(np.abs(Tr['opl'])) / LAM), focus_spread_um=Tr['focus_spread'] * 1e6, marginal_angle_deg=float(np.degrees(tmax)),
                 peak_irradiance=float(np.sum(abs(E0) ** 2) / (2 * Z0)), fwhm_across_um=fwhm(line, I(Ey)) * 1e6, fwhm_along_um=fwhm(line, I(Ezl)) * 1e6,
                 axial_ratio=float(np.max(abs(Ezl[:, 0]) ** 2) / np.sum(abs(E0) ** 2)),
                 # the beam through both lenses (the second the first turned round: each ray meets its faces at the same angles), half its light s and half p round the pupil
                 both_lenses=float(np.sum(np.exp(-2 * Tr['h'] ** 2 / w ** 2) * Tr['h'] * 0.5 * (Tr['Ts'] ** 2 + Tr['Tp'] ** 2)) / np.sum(np.exp(-2 * Tr['h'] ** 2 / w ** 2) * Tr['h'])))
        # the sphere at the focus: its scattered power, and the share inside the collection lens's cone
        sph = Sphere(a_s, m)
        tS, pS, WS, dS = directions(np.pi, 48, 96)
        F = np.zeros((len(WS), 3), dtype=complex)
        for o in range(len(W)):
            F += sph.far(d[o], A[o] * W[o], dS)
        psr = np.sum(abs(F) ** 2, 1) / (2 * Z0) * WS
        c['Psca_W'] = float(np.sum(psr))
        # (the cone on a grid of its own: cutting the sphere's grid at the cone's edge would be a ring out either way)
        tC, pC, WC, dC = directions(tmax, 32, 96)
        Fc = np.zeros((len(WC), 3), dtype=complex)
        for o in range(len(W)):
            Fc += sph.far(d[o], A[o] * W[o], dC)
        c['share_collected'] = float(np.sum(np.sum(abs(Fc) ** 2, 1) / (2 * Z0) * WC) / np.sum(psr))
        for pol, e_in in [('s', ez), ('p', ey)]:
            sl, tot = slope(Tr, None, w, tmax, e_in, a_s, m, 10e-9, power=power)
            c['slope_' + pol + '_per_um'] = abs(sl) * 1e-6
            # and as a detector behind the collection lens reads it (the same lens turned round: each ray meets its faces at the
            # angles it met the objective's), over the beam's power there
            after = (lambda t: np.interp(t, Tr['theta'], Tr['Ts']), lambda t: np.interp(t, Tr['theta'], Tr['Tp']), power * c['both_lenses'])
            sl2, _ = slope(Tr, None, w, tmax, e_in, a_s, m, 10e-9, power=power, after=after)
            c['slope_' + pol + '_behind_lens_per_um'] = abs(sl2) * 1e-6
            if pol == 's':
                c['Pext_W'] = float(-tot)
        out['cases'][name] = c
        print(name, json.dumps(c))
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ref', 'scatter-real-lens.json')
    with open(path, 'w') as fh:
        json.dump(out, fh, indent=1)


if __name__ == '__main__':
    if '--lens-only' not in sys.argv:
        main()
    real_lens()
