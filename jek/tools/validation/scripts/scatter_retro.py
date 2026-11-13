"""A sphere in a retro-reflected focus: the beam focused onto it, recollimated, sent back by a flat partial mirror and
refocused onto it, so that it stands in a standing wave whose phase the mirror's place sets.

The bench: a laser through a 50/50 plate, an ideal lens (a thin mask, focal length f) focusing onto the sphere, a like lens
at 2f recollimating, a flat mirror (reflect 50 %, transmit 50 %) square to the beam a distance L from the focus. One
detector behind the mirror (forward), one on the plate's return port (backward).

The forward focus is the sum of plane waves of scatter_position_focus.py's 'mask' rule (the plane's own field, its
energy as Rayleigh-Sommerfeld gives it from a thin mask). The light that comes back is the forward focus turned
through the focus point: the second lens and the flat mirror send a ray that left the focus along d back along -d, and
a point beside the focus to the other side of it (ray matrix x -> -x). Wave by wave, with the plane's field the same
vector both ways,
    A_b(-d) = c A_f(d),   c = -r_M exp(2 i k L),
r_M the mirror's amplitude reflection, and the -1 the thin-mask relay's (the focus to the
second lens and back, Rayleigh-Sommerfeld out and in: the Gouy phase of the two half passes). r_M is that of JEKray's
mirror part, which turns the field over from its coated face (-sqrt(R) for each polarisation, its trace.js): it is a
property of the part, as a coating's phase would be, and taken from it. With it c = +sqrt(R) exp(2ikL).

The sphere's far field by Mie theory for every wave, both ways. A detector after a collimating lens reads the
interference over the directions it catches: forward, the forward beam and the light scattered ahead, times the
mirror's transmission; backward, the return beam and the light scattered behind plus the light scattered ahead that the
mirror sends back (c F(-d)), times the plate's reflection.

    python scatter_retro.py          # a few minutes; needs scatter_position_focus.py, mie_reference.py, scatter_bench.py

Writes ../ref/scatter-retro.json.
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scatter_position_focus import K, LAM, Z0, Sphere, directions, spectrum  # noqa: E402
from scatter_bench import silica_index  # noqa: E402

RM, TM, RP = 0.5, 0.5, 0.5            # the mirror's reflectance and transmittance, the plate's reflectance
P_IN = 0.1                            # W from the laser; the plate passes half of it


def far_of(sph, d, E, out):
    if hasattr(sph, 'far_waves'):
        return sph.far_waves(d, E, out)
    F = np.zeros((len(out), 3), dtype=complex)
    for o in range(len(d)):
        F += sph.far(d[o], E[o], out)
    return F


def case(f, w, theta_max, L0, e_in, a, m, nt, nphi, steps, h=10e-9, ret=False, sgrid=(48, 96), scat=None):
    th, ph, W, df = directions(theta_max, nt, nphi)
    Af = spectrum('mask', th, ph, df, f, w, e_in, P_IN * (1 - RP))
    db = -df                                           # the return's directions, index by index the forward ones turned back
    Ab1 = Af.copy()                                    # the return's waves for c = 1
    sph = scat or Sphere(a, m)
    tS, pS, WS, dS = directions(np.pi, *sgrid)
    ins = (tS <= theta_max) | (tS >= np.pi - theta_max)
    out = np.concatenate([df, db, dS])
    nf, nb = len(df), len(db)

    def fields(xs):
        """the far fields from the forward waves and from the return's (c = 1), referred to the focus, for the sphere at y = xs"""
        sh_in_f = np.exp(1j * K * df[:, 1] * xs)
        sh_in_b = np.exp(1j * K * db[:, 1] * xs)
        Ff = far_of(sph, df, Af * (W * sh_in_f)[:, None], out)
        Fb = far_of(sph, db, Ab1 * (W * sh_in_b)[:, None], out)
        back = np.exp(-1j * K * out[:, 1] * xs)[:, None]
        return Ff * back, Fb * back

    inter = lambda A, F, Wt: -(4 * np.pi / K) * np.imag(np.sum(np.conj(A) * F, 1)) / (2 * Z0) * Wt
    own = lambda F, Wt: np.sum(abs(F) ** 2, 1) / (2 * Z0) * Wt
    beam_f = P_IN * (1 - RP) * (1 - np.exp(-2 * (f * np.tan(theta_max) / w) ** 2))   # W in the forward beam, the lens's rim clipping it

    def returned(F0, c, xs):
        """the sphere driven also by its own light the mirror brings back: A_ret(-d) = (i c / lambda) F(d), F referred to the focus,
        iterated on the forward cone until it changes by less than 1e-7, then the whole far field"""
        F, passes = F0.copy(), 0
        sh_b, back_f = np.exp(1j * K * db[:, 1] * xs), np.exp(-1j * K * df[:, 1] * xs)[:, None]
        for passes in range(1, 41):
            Aret = (1j * c / LAM) * F[:nf]
            Fn = F0[:nf] + far_of(sph, db, Aret * (W * sh_b)[:, None], df) * back_f
            ch = np.sqrt(np.sum(abs(Fn - F[:nf]) ** 2) / np.sum(abs(Fn) ** 2))
            F[:nf] = Fn
            if ch < 1e-7:
                break
        Aret = (1j * c / LAM) * F[:nf]
        Fr = far_of(sph, db, Aret * (W * sh_b)[:, None], out) * np.exp(-1j * K * out[:, 1] * xs)[:, None]
        return F0 + Fr, Aret, passes

    def reading(Ff, Fb, c, xs=0.0):
        F = Ff + c * Fb
        Aret, passes = None, 0
        if ret:
            F, Aret, passes = returned(F, c, xs)
        Ab = c * Ab1
        Ffw, Fbw, Fsph = F[:nf], F[nf:nf + nb], F[nf + nb:]
        G = Fbw + c * Ffw                                                  # behind: scattered back, and ahead brought back
        i_f, o_f = inter(Af, Ffw, W), own(Ffw, W)
        i_b, o_b = inter(Ab, G, W), own(G, W)
        sgf, sgb = np.sign(df[:, 1]), np.sign(db[:, 1])
        r = dict(
            dF=TM * float(np.sum(i_f + o_f)), dB=RP * float(np.sum(i_b + o_b)),
            XF=TM * float(np.sum(sgf * (i_f + o_f))), XB=RP * float(np.sum(sgb * (i_b + o_b))),
            Psca=float(np.sum(own(Fsph, WS))),
            Pext=float(-np.sum(inter(Af, Ffw, W)) - np.sum(inter(Ab, Fbw, W)) - (np.sum(inter(Aret, Fbw, W)) if Aret is not None else 0)), passes=passes)
        # every exit: ahead through the mirror, behind through both ports of the plate, and what leaves outside both lenses
        outside = float(np.sum(own(Fsph, WS)[~ins]))
        r['all_exits'] = r['dF'] + float(np.sum(i_b + o_b)) + outside
        r['beam_F'], r['beam_B'] = TM * beam_f, RP * RM * beam_f
        return r

    Ff0, Fb0 = fields(0.0)
    res = dict(steps_nm=[], I0=[], Psca=[], Pext=[], dF_mW=[], dB_mW=[], all_exits_W=[], budget_W=[], passes=[])
    for s in steps:
        L = L0 + s
        c = np.sqrt(RM) * np.exp(2j * K * L)
        E0 = np.sum(Af * W[:, None], 0) + c * np.sum(Ab1 * W[:, None], 0)
        r = reading(Ff0, Fb0, c)
        res['steps_nm'].append(s * 1e9)
        res['I0'].append(float(np.sum(abs(E0) ** 2) / (2 * Z0)))
        res['Psca'].append(r['Psca'])
        res['Pext'].append(r['Pext'])
        res['dF_mW'].append(r['dF'] * 1e3)
        res['dB_mW'].append(r['dB'] * 1e3)
        res['all_exits_W'].append(r['all_exits'])
        res['budget_W'].append(r['Psca'] - r['Pext'])
        res['passes'].append(r['passes'])
    res['depth'] = float((max(res['I0']) - min(res['I0'])) / (max(res['I0']) + min(res['I0'])))
    res['beam_forward_mW'] = TM * beam_f * 1e3
    res['beam_backward_mW'] = RP * RM * beam_f * 1e3
    # the split detectors' slopes (signal right less left over the reading) at two of the steps
    if len(steps) < 5:
        return res
    Fp, Fm = fields(h), fields(-h)
    res['slope_steps'] = [0, 4]
    res['slope_F_per_um'], res['slope_B_per_um'] = [], []
    for i in res['slope_steps']:
        c = np.sqrt(RM) * np.exp(2j * K * (L0 + steps[i]))
        rp, rm = reading(*Fp, c, h), reading(*Fm, c, -h)
        sF = lambda r: r['XF'] / (r['beam_F'] + r['dF'])
        sB = lambda r: r['XB'] / (r['beam_B'] + r['dB'])
        res['slope_F_per_um'].append(abs(sF(rp) - sF(rm)) / (2 * h) * 1e-6)
        res['slope_B_per_um'].append(abs(sB(rp) - sB(rm)) / (2 * h) * 1e-6)
    return res


def main():
    n = float(silica_index(1.55))
    a, m = 150e-9, complex(n, 0)
    steps = [i * LAM / 16 for i in range(9)]
    ez, ey = np.array([0.0, 0.0, 1.0]), np.array([0.0, 1.0, 0.0])
    out = dict(wavelength_nm=1550, silica_index=n, sphere_radius_nm=150, laser_mW=100, plate_reflect=RP, mirror_reflect=RM, mirror_transmit=TM,
               mirror_phase='-sqrt(R) from its coated face, each polarisation (JEKray mirror part)', cases={})
    for name, f, w, D, half_dia, nt, nphi in [('tight', 2e-3, 1.5e-3, 3e-3, 5.333e-3 / 2, 28, 72), ('gentle', 15e-3, 1.5e-3, 3e-3, 6e-3, 40, 48)]:
        tmax = float(np.arctan(half_dia / f))
        L0 = f + D
        c = dict(f_mm=f * 1e3, beam_radius_mm=w * 1e3, lens_diameter_mm=2 * half_dia * 1e3, focus_to_mirror_mm=L0 * 1e3, theta_max_deg=float(np.degrees(tmax)))
        c['s'] = case(f, w, tmax, L0, ez, a, m, nt, nphi, steps)
        print(name, 's', json.dumps({k: c['s'][k] for k in ['I0', 'depth', 'slope_F_per_um', 'slope_B_per_um']}))
        # with the sphere driven also by its own light the mirror brings back (second scattering, iterated)
        c['s_ret'] = case(f, w, tmax, L0, ez, a, m, nt, nphi, steps, ret=True)
        gap = lambda r: max(abs(x - y) / e for x, y, e in zip(r['all_exits_W'], r['budget_W'], r['Pext']))
        print(name, 'energy: worst gap over P_ext', gap(c['s']), 'without the return,', gap(c['s_ret']), 'with it; passes', c['s_ret']['passes'])
        if name == 'tight':
            c['p'] = case(f, w, tmax, L0, ey, a, m, nt, nphi, steps)
            print(name, 'p', json.dumps({k: c['p'][k] for k in ['I0', 'depth']}))
        out['cases'][name] = c
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ref', 'scatter-retro.json')
    with open(path, 'w') as fh:
        json.dump(out, fh, indent=1)


class RodDDA:
    """A rod as an array of dipoles, written here from the published method and sharing no code with JEKray: a cubic lattice of
    spacing d filling a cylinder (its axis along `axis`), each dipole's polarisability by the lattice dispersion relation
    (Draine and Goodman, ApJ 405, 685, 1993: b1 = -1.891531, b2 = 0.1648469, b3 = -1.7700004, S for the given way and
    polarisation), the full interaction matrix solved once by LU, so each new field is a back-substitution. Gaussian units with
    the polarisability as a volume: p = alpha E, the far field F(r) = k^2 sum_j exp(-ik r.x_j) (p_j - r (r.p_j)), so that
    E = F exp(ikr)/r as the Mie sphere's here."""

    def __init__(self, m, radius, length, d, axis, k_dir, e_pol):
        import scipy.linalg as sla
        nr, nl = int(round(2 * radius / d)), int(round(length / d))
        g = (np.arange(nr) + 0.5 - nr / 2) * d
        u, v = np.meshgrid(g, g, indexing='ij')
        keep = u ** 2 + v ** 2 <= radius ** 2
        u, v = u[keep], v[keep]
        t = (np.arange(nl) + 0.5 - nl / 2) * d
        ax = np.asarray(axis, float); ax /= np.linalg.norm(ax)
        a1 = np.cross(ax, [0, 0, 1.0]) if abs(ax[2]) < 0.9 else np.cross(ax, [1.0, 0, 0]); a1 /= np.linalg.norm(a1)
        a2 = np.cross(ax, a1)
        X = (t[:, None, None] * ax[None, None, :] + u[None, :, None] * a1[None, None, :] + v[None, :, None] * a2[None, None, :]).reshape(-1, 3)
        # the spacing that gives the dipoles the rod's own volume, N d^3 = V (Draine and Flatau's convention), the lattice scaled to it
        d1 = (np.pi * radius ** 2 * length / len(X)) ** (1 / 3)
        X *= d1 / d
        d = d1
        self.x, self.N, self.d = X, len(X), d
        eps = m * m
        acm = 3 * d ** 3 / (4 * np.pi) * (eps - 1) / (eps + 2)
        kd = K * d
        S = float(np.sum((np.asarray(k_dir) * np.asarray(e_pol)) ** 2))
        b1, b2, b3 = -1.891531, 0.1648469, -1.7700004
        self.alpha = acm / (1 + (acm / d ** 3) * ((b1 + eps * b2 + eps * b3 * S) * kd ** 2 - 2j / 3 * kd ** 3))
        N = self.N
        A = np.zeros((3 * N, 3 * N), dtype=complex)
        I3 = np.eye(3)
        for i0 in range(0, N, 400):
            i1 = min(N, i0 + 400)
            r = X[i0:i1, None, :] - X[None, :, :]
            R = np.linalg.norm(r, axis=2)
            same = R == 0
            R[same] = 1
            rh = r / R[..., None]
            ph = np.exp(1j * K * R) / R
            rr = rh[..., :, None] * rh[..., None, :]
            G = ph[..., None, None] * (K * K * (I3 - rr) + ((1j * K * R - 1) / R ** 2)[..., None, None] * (I3 - 3 * rr))
            G[same] = 0
            A[3 * i0:3 * i1, :] = -G.transpose(0, 2, 1, 3).reshape(3 * (i1 - i0), 3 * N)
        A[np.arange(3 * N), np.arange(3 * N)] += 1 / self.alpha
        self.lu = sla.lu_factor(A, overwrite_a=True, check_finite=False)
        self.sla = sla

    def far_waves(self, d, E, out):
        """the far field toward `out` of the rod in the plane waves (d, E): E each wave's field at the centre"""
        Ein = np.zeros((self.N, 3), dtype=complex)
        for i0 in range(0, len(d), 256):
            ph = np.exp(1j * K * (self.x @ d[i0:i0 + 256].T))
            Ein += ph @ E[i0:i0 + 256]
        p = self.sla.lu_solve(self.lu, Ein.reshape(-1), check_finite=False).reshape(self.N, 3)
        F = np.zeros((len(out), 3), dtype=complex)
        for i0 in range(0, len(out), 512):
            o = out[i0:i0 + 512]
            P = np.exp(-1j * K * (o @ self.x.T)) @ p
            F[i0:i0 + 512] = K * K * (P - o * np.sum(o * P, 1)[:, None])
        return F


def main_rod():
    """the silica rod (200 nm across, 1 um long, its axis across the beam in the plane) in the retro trap, tight and gentle, with
    second scattering; ../ref/scatter-retro-rod.json"""
    n = float(silica_index(1.55))
    steps = [i * LAM / 16 for i in range(9)]
    ez = np.array([0.0, 0.0, 1.0])
    rod = RodDDA(complex(n, 0), 100e-9, 1000e-9, 20e-9, [0, 1.0, 0], [1.0, 0, 0], ez)
    out = dict(wavelength_nm=1550, silica_index=n, rod={'diameter_nm': 200, 'length_nm': 1000, 'axis': 'across the beam in the plane', 'dipoles': rod.N, 'spacing_nm': 20}, cases={})
    for name, f, w, D, half_dia, nt, nphi in [('tight', 2e-3, 1.5e-3, 3e-3, 5.333e-3 / 2, 28, 72), ('gentle', 15e-3, 1.5e-3, 3e-3, 6e-3, 40, 48)]:
        tmax = float(np.arctan(half_dia / f))
        c = dict(f_mm=f * 1e3, lens_diameter_mm=2 * half_dia * 1e3, focus_to_mirror_mm=(f + D) * 1e3)
        c['s_ret'] = case(f, w, tmax, f + D, ez, None, None, nt, nphi, steps, ret=True, scat=rod)
        print(name, json.dumps({k: c['s_ret'][k] for k in ['Psca', 'passes', 'slope_F_per_um', 'slope_B_per_um']}))
        out['cases'][name] = c
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ref', 'scatter-retro-rod.json')
    with open(path, 'w') as fh:
        json.dump(out, fh, indent=1)


def r8_grid():
    """the energy with the return on a finer sphere grid (the own power outside both cones), tight, three steps"""
    n = float(silica_index(1.55))
    for sg in [(48, 96), (96, 192), (192, 384)]:
        r = case(2e-3, 1.5e-3, float(np.arctan(5.333e-3 / 2 / 2e-3)), 5e-3, np.array([0.0, 0, 1]), 150e-9, complex(n, 0), 28, 72, [0, 3 * LAM / 16, 7 * LAM / 16], ret=True, sgrid=sg)
        print('sphere grid', sg, 'gap over P_ext', [(x - y) / e for x, y, e in zip(r['all_exits_W'], r['budget_W'], r['Pext'])])


if __name__ == '__main__':
    if '--r8' in sys.argv:
        r8_grid()
    elif '--rod' in sys.argv:
        main_rod()
    else:
        main()
