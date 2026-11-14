"""A small sphere inside a Fabry-Perot cavity, solved directly: the steady state of the cavity's modes with the sphere
driving them and driven by them. Written here from the textbook; it shares no code with JEKray.

The cavity: two concave mirrors of radius Rm, a distance L apart, amplitude reflections r1, r2 and transmissions t1, t2
(power 90 / 10 here), the light coming in through the first. Its modes are the Hermite-Gauss beams HG_mn of its own q
(z_R = sqrt(L (2 Rm - L)) / 2, the waist in the middle), each with the Gouy phase (m + n + 1) psi(z). At the sphere's
plane z_p the light is a sum of forward waves (amplitudes f_n in sqrt(W), each HG_mn at unit power) and backward ones
(b_n). Out to a mirror and back, each keeps its mode and takes its own phase:
    rho2_n = r2 exp(2ik(L/2 - z_p)) exp(-2i(N+1)(psi(L/2) - psi(z_p))),
    rho1_n = r1 exp(2ik(z_p + L/2)) exp(-2i(N+1)(psi(z_p) - psi(-L/2))),
with N = m + n. The light let in, s_n (the input beam's overlap with HG_mn at the first mirror, times t1), reaches z_p
multiplied by tau_n = exp(ik(z_p + L/2)) exp(-i(N+1)(psi(z_p) - psi(-L/2))). The sphere sees the incoming waves, f_in and
b_in, and sends out
    f_out = f_in + i (omega/4) conj(phi_n(r_p)) p_f,   b_out = b_in + i (omega/4) conj(phibar_n(r_p)) p_b.
Here phi_n (phibar_n) is the forward (backward) wave's field per sqrt(W) at the sphere,
sqrt(2 Z0) HG_mn exp(+-ik r^2 / 2R(z_p)). This is the reciprocity theorem for a dipole radiating into a guided mode: for a
mode at unit power it gives the dipole's extinction, (omega/2) Im(alpha) |E|^2. For a dipole p_f = p_b = alpha E(r_p), with
E the incoming waves' sum. A larger sphere scatters differently ahead and back:
    p_f = alpha(0) E_f + alpha(pi) E_b,   p_b = alpha(0) E_b + alpha(pi) E_f,
with alpha(theta) = 4 pi eps0 i S1(theta) / k^3 from Mie's S1, which is the dipole's alpha in the Rayleigh limit. The
mode's far field spreads over a few milliradians, where S1 does not change. The cavity closes on b_in = rho2 f_out and
f_in = rho1 b_out + tau s. That is a linear system in (f_in, b_in), solved directly at each laser wavenumber, so the cost
does not depend on the finesse.

The readings:
- transmitted: the sum of |t2 f_n|^2 at the second mirror;
- reflected: the first mirror's prompt reflection, -r1 times the input with the mirror's sag, plus t1 times the backward
  waves there, added on a grid;
- scattered: the sphere's field in all directions, Larmor's formula for the dipole and the Mie far fields of the two
  waves added and integrated for the sphere.

Classical check (V0, V1): the dipole on the axis against the textbook perturbation of a resonator. The resonance moves by
delta omega / omega = -Re(alpha) |E_p|^2 / (2 Int eps0 |E|^2 dV), the Bethe-Schwinger energy shift. It widens by the
scattered power over the stored energy, Gamma = P_sca / U, which gives Im(delta k) = -P_sca / (2 c U). Both are computed
from the empty cavity's standing wave. The reference's own pole, found by a secant search on 1/f_00(k) in complex k, must
agree.

    python scatter_cavity.py          # writes ../ref/scatter-cavity.json; needs mie_reference.py, scatter_bench.py,
                                      # scatter_position_focus.py beside it
"""
import json
import os
import sys
from math import factorial

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mie_reference import amplitudes  # noqa: E402
from scatter_bench import silica_index  # noqa: E402
from scatter_position_focus import Sphere, directions  # noqa: E402

C0, EPS0 = 299792458.0, 8.8541878128e-12
Z0 = 1 / (EPS0 * C0)
LAM = 1.55e-6
K0 = 2 * np.pi / LAM


def hermite(n, x):
    h0, h1 = np.ones_like(x), 2 * x
    if n == 0:
        return h0
    for k in range(1, n):
        h0, h1 = h1, 2 * x * h1 - 2 * k * h0
    return h1


class FP:
    def __init__(self, L, Rm, R1, R2, Nmax):
        self.L, self.Rm = L, Rm
        self.zR = np.sqrt(L * (2 * Rm - L)) / 2
        self.w0 = np.sqrt(LAM * self.zR / np.pi)
        self.r1, self.r2, self.t1, self.t2 = np.sqrt(R1), np.sqrt(R2), np.sqrt(1 - R1), np.sqrt(1 - R2)
        self.modes = [(m, N - m) for N in range(Nmax + 1) for m in range(N + 1)]
        self.N1 = np.array([m + n + 1 for m, n in self.modes])

    def w(self, z):
        return self.w0 * np.sqrt(1 + (z / self.zR) ** 2)

    def psi(self, z):
        return np.arctan(z / self.zR)

    def invR(self, z):
        return z / (z * z + self.zR ** 2)

    def hg(self, m, n, x, y, z):
        """HG_mn at z at unit power (Int |hg|^2 dA = 1), without its Gouy and curvature phases"""
        w = self.w(z)
        cx = (2 / np.pi) ** 0.25 / np.sqrt(2 ** m * factorial(m) * w)
        cy = (2 / np.pi) ** 0.25 / np.sqrt(2 ** n * factorial(n) * w)
        return cx * hermite(m, np.sqrt(2) * x / w) * np.exp(-x * x / w ** 2) * cy * hermite(n, np.sqrt(2) * y / w) * np.exp(-y * y / w ** 2)

    def at(self, rp, k):
        x, y, z = rp
        L, N1 = self.L, self.N1
        rho2 = self.r2 * np.exp(2j * k * (L / 2 - z)) * np.exp(-2j * N1 * (self.psi(L / 2) - self.psi(z)))
        rho1 = self.r1 * np.exp(2j * k * (z + L / 2)) * np.exp(-2j * N1 * (self.psi(z) - self.psi(-L / 2)))
        tau = np.exp(1j * k * (z + L / 2)) * np.exp(-1j * N1 * (self.psi(z) - self.psi(-L / 2)))
        h = np.array([self.hg(m, n, x, y, z) for m, n in self.modes]) * np.sqrt(2 * Z0)
        cur = np.exp(1j * k * (x * x + y * y) / 2 * self.invR(z))
        return rho1, rho2, tau, h * cur, h * np.conj(cur)

    def solve(self, k, rp, s_in, a0, api):
        """the steady state with the sphere at rp (a0 = api = 0: the empty cavity) and the laser at wavenumber k (complex
        for the pole search)"""
        rho1, rho2, tau, phi, phib = self.at(rp, k)
        M = len(self.modes)
        g = 1j * k * C0 / 4
        A = np.eye(2 * M, dtype=complex)
        A[:M, M:] -= np.diag(rho1)
        A[M:, :M] -= np.diag(rho2)
        c1 = (rho1 * g * np.conj(phib))[:, None]
        c2 = (rho2 * g * np.conj(phi))[:, None]
        A[:M, M:] -= c1 * a0 * phib[None, :]
        A[:M, :M] -= c1 * api * phi[None, :]
        A[M:, :M] -= c2 * a0 * phi[None, :]
        A[M:, M:] -= c2 * api * phib[None, :]
        rhs = np.concatenate([tau * s_in, np.zeros(M)])
        u = np.linalg.solve(A, rhs)
        f, b = u[:M], u[M:]
        Ef, Eb = phi @ f, phib @ b
        pf, pb = a0 * Ef + api * Eb, a0 * Eb + api * Ef
        return dict(f=f, b=b, fout=f + g * np.conj(phi) * pf, bout=b + g * np.conj(phib) * pb, Ef=Ef, Eb=Eb, pf=pf, pb=pb, tau=tau)


class Input:
    """the laser's beam (waist win at the cavity's middle, power P) on a grid at the first mirror"""

    def __init__(self, cav, win, P, n=241):
        self.cav = cav
        self.xs = np.linspace(-6 * win, 6 * win, n)
        self.X, self.Y = np.meshgrid(self.xs, self.xs, indexing='ij')
        self.dA = (self.xs[1] - self.xs[0]) ** 2
        zm = -cav.L / 2
        r2 = self.X ** 2 + self.Y ** 2
        # its q at the first mirror, its waist in the middle (q = z - i z_R: exp(ik r^2 / 2q) for exp(ikz - i omega t))
        self.zRin = np.pi * win ** 2 / LAM
        qin = zm - 1j * self.zRin
        E = np.exp(1j * K0 * r2 / (2 * qin))
        self.E = E * np.sqrt(P / np.sum(abs(E) ** 2 * self.dA))
        self.fwd = [cav.hg(m, n, self.X, self.Y, zm) * np.exp(1j * K0 * r2 / 2 * cav.invR(zm)) for m, n in cav.modes]
        self.bwd = [u * np.exp(-1j * K0 * r2 * cav.invR(zm)) for u in self.fwd]      # hg exp(-ik r^2 invR / 2)
        self.s_raw = np.array([np.sum(np.conj(u) * self.E) * self.dA for u in self.fwd])
        self.prompt = -cav.r1 * self.E * np.exp(1j * K0 * r2 / cav.Rm)               # off the mirror's back, with its sag
        self.P = P

    def reflected(self, sol):
        bm1 = sol['bout'] * sol['tau']                   # the backward waves carried from z_p to the first mirror
        E = self.prompt + self.cav.t1 * sum(c * u for c, u in zip(bm1, self.bwd))
        return float(np.sum(abs(E) ** 2) * self.dA)

    def transmitted(self, sol):
        return float(np.sum(abs(self.cav.t2 * sol['fout']) ** 2))


class Scatterer:
    def __init__(self, kind, a, m):
        self.kind, self.a, self.m = kind, a, m
        x = K0 * a
        S1 = amplitudes(x, m, np.array([0.0, np.pi]))[0]
        if kind == 'dipole':
            av = a ** 3 * (m ** 2 - 1) / (m ** 2 + 2)
            al = 4 * np.pi * EPS0 * av / (1 - 1j * 2 / 3 * K0 ** 3 * av)        # with its radiation reaction
            self.a0 = self.api = al
        else:
            self.a0, self.api = 4 * np.pi * EPS0 * 1j * S1[0] / K0 ** 3, 4 * np.pi * EPS0 * 1j * S1[1] / K0 ** 3
            self.sph = Sphere(a, m)
            th, ph, W, d = directions(np.pi, 200, 64)
            self.W, self.d = W, d

    def scattered(self, sol):
        """the power the sphere sends into all directions (the cavity's modes take a negligible share of it)"""
        if self.kind == 'dipole':
            return float(C0 ** 2 * Z0 * K0 ** 4 / (12 * np.pi) * abs(sol['pf']) ** 2)
        pol = np.array([0.0, 1.0, 0.0])
        Ff = self.sph.far(np.array([1.0, 0, 0]), sol['Ef'] * pol, self.d)
        Fb = self.sph.far(np.array([-1.0, 0, 0]), sol['Eb'] * pol, self.d)
        return float(np.sum(np.sum(abs(Ff + Fb) ** 2, -1) * self.W) / (2 * Z0))


def pole(cav, rp, s_in, sc, k0, step):
    """the TEM00 resonance's pole in complex k, by a secant search on 1/f_00"""
    a0, api = (sc.a0, sc.api) if sc else (0, 0)
    g = lambda k: 1 / cav.solve(k, rp, s_in, a0, api)['f'][0]
    ka, kb = k0 - 0.5j * step, k0 + step - 0.5j * step
    ga, gb = g(ka), g(kb)
    for _ in range(60):
        kc = kb - gb * (kb - ka) / (gb - ga)
        ka, ga, kb, gb = kb, gb, kc, g(kc)
        if abs(kb - ka) < 1e-13:
            break
    return kb


def main():
    n_si = float(silica_index(1.55))
    L, Rm = 10e-3, 25e-3
    cav = FP(L, Rm, 0.9, 0.9, 12)
    dpsi = cav.psi(L / 2) - cav.psi(-L / 2)
    # lock: the TEM00 resonance nearest 1550 nm with an antinode in the middle (an even number of half waves there)
    q = 2 * np.round((2 * K0 * L - 2 * dpsi) / (4 * np.pi))
    kres = (2 * np.pi * q + 2 * dpsi) / (2 * L)
    fsr_k = np.pi / L
    finesse = np.pi * np.sqrt(cav.r1 * cav.r2) / (1 - cav.r1 * cav.r2)
    lw = fsr_k / finesse
    print('cavity: waist %.4g um, zR %.5g mm, round-trip Gouy %.5g rad, finesse %.4g, lock %.7g nm' % (cav.w0 * 1e6, cav.zR * 1e3, 2 * dpsi, finesse, 2 * np.pi / kres * 1e9))
    inp = Input(cav, 80e-6, 1e-3)
    s_in = cav.t1 * inp.s_raw
    # the closed form for two Gaussians with their waists together (Kogelnik): 4 zR1 zR2 / (zR1 + zR2)^2
    eta = 4 * inp.zRin * cav.zR / (inp.zRin + cav.zR) ** 2
    print('input: share in TEM00 %.6f (closed form %.6f), in the modes kept %.6f' % (abs(inp.s_raw[0]) ** 2 / inp.P, eta, np.sum(abs(inp.s_raw) ** 2) / inp.P))
    assert abs(abs(inp.s_raw[0]) ** 2 / inp.P - eta) < 1e-4
    kp0 = pole(cav, (0, 0, 0), s_in, None, kres, 0.01 * lw)
    print('empty pole: %.9g %+.6g i  (Airy: %.9g %+.6g i)' % (kp0.real, kp0.imag, kres, -np.log(1 / (cav.r1 * cav.r2)) / (2 * L)))
    s0 = cav.solve(kres, (0, 0, 0), s_in, 0, 0)
    print('empty at lock: T %.6g R %.6g T + R - P %.2e' % (inp.transmitted(s0), inp.reflected(s0), inp.transmitted(s0) + inp.reflected(s0) - inp.P))
    out = dict(wavelength_nm=1550, lock_nm=float(2 * np.pi / kres * 1e9), L_mm=L * 1e3, Rm_mm=Rm * 1e3, reflect=0.9, w0_um=cav.w0 * 1e6, zR_mm=cav.zR * 1e3,
               gouy_round_trip=float(2 * dpsi), finesse=float(finesse), linewidth_k=float(lw), input_waist_um=80, power_mW=1.0,
               input_tem00=float(abs(inp.s_raw[0]) ** 2 / inp.P), silica_index=n_si, cases={})
    lamp = 2 * np.pi / kres
    places = {'antinode': (0.0, 0.0, 0.0), 'node': (0.0, 0.0, lamp / 4), 'quarter': (0.0, 0.0, lamp / 8), 'off-axis': (0.3 * cav.w0, 0.0, 0.0)}
    detune = np.linspace(-1.5, 1.5, 41)                  # in linewidths
    checks = {}
    for kind, a in [('dipole', 50e-9), ('mie', 150e-9)]:
        sc = Scatterer(kind, a, complex(n_si, 0))
        res = {}
        for pname, rp in places.items():
            e0 = pole(cav, rp, s_in, None, kres, 0.01 * lw)
            e1 = pole(cav, rp, s_in, sc, kres, 0.01 * lw)
            dk = e1 - e0
            T, R, Ps, T0, R0 = [], [], [], [], []
            for d in detune:
                k = kres + d * lw
                s = cav.solve(k, rp, s_in, sc.a0, sc.api)
                e = cav.solve(k, rp, s_in, 0, 0)
                T.append(inp.transmitted(s)); R.append(inp.reflected(s)); Ps.append(sc.scattered(s))
                T0.append(inp.transmitted(e)); R0.append(inp.reflected(e))
            sl = cav.solve(kres, rp, s_in, sc.a0, sc.api)
            # the modes the sphere couples to at the lock, by the threshold fixed beforehand
            rho1, rho2, tau, phi, phib = cav.at(rp, kres)
            enh = abs(phi) ** 2 * abs(1 / (1 - rho1 * rho2)) ** 2
            kept = int(np.sum(enh >= 1e-6 * enh[0]))
            res[pname] = dict(z_nm=rp[2] * 1e9, x_um=rp[0] * 1e6, shift_k=float(dk.real), widen_k=float(-2 * dk.imag), shift_linewidths=float(dk.real / lw),
                              widen_linewidths=float(-2 * dk.imag / lw), detune_linewidths=detune.tolist(), T_mW=[v * 1e3 for v in T], R_mW=[v * 1e3 for v in R],
                              Psca_mW=[v * 1e3 for v in Ps], empty_T_mW=[v * 1e3 for v in T0], empty_R_mW=[v * 1e3 for v in R0],
                              lock=dict(T_mW=inp.transmitted(sl) * 1e3, R_mW=inp.reflected(sl) * 1e3, Psca_mW=sc.scattered(sl) * 1e3,
                                        E2=float(abs(sl['Ef'] + sl['Eb']) ** 2)), modes_kept=kept)
            print('%-6s %-9s shift %+.5e lw  widen %+.5e lw  lock T %.6f mW R %.6f mW Psca %.4e mW  kept %d  energy %.2e'
                  % (kind, pname, dk.real / lw, -2 * dk.imag / lw, T[20] * 1e3, R[20] * 1e3, Ps[20] * 1e3, kept, (T[20] + R[20] + Ps[20] - inp.P) / inp.P))
            if kind == 'dipole' and pname in ('antinode', 'node'):
                # the classical formulas from the empty cavity's TEM00 standing wave at the empty pole's real part (the
                # resonance is that mode's; the light the input puts in the other modes is off resonance)
                e = cav.solve(e0.real, rp, s_in, 0, 0)
                _, _, _, phi, phib = cav.at(rp, e0.real)
                Ep2 = abs(phi[0] * e['f'][0] + phib[0] * e['b'][0]) ** 2
                ints = EPS0 * 2 * Z0 * (abs(e['f'][0]) ** 2 + abs(e['b'][0]) ** 2) * L      # Int eps0 |E|^2 dV
                U = ints / 2
                dk_cl = -e0.real * sc.a0.real * Ep2 / (2 * ints)
                Psca = C0 ** 2 * Z0 * K0 ** 4 / (12 * np.pi) * abs(sc.a0) ** 2 * Ep2
                wid_cl = Psca / (C0 * U)                        # -2 Im(delta k)
                checks[pname] = dict(shift_ref=float(dk.real), shift_classical=float(dk_cl), widen_ref=float(-2 * dk.imag), widen_classical=float(wid_cl))
                print('   classical: shift %.6e (ref %.6e)  widen %.6e (ref %.6e)' % (dk_cl, dk.real, wid_cl, -2 * dk.imag))
        out['cases'][kind] = dict(radius_nm=a * 1e9, alpha0=[float(sc.a0.real), float(sc.a0.imag)], alphapi=[float(sc.api.real), float(sc.api.imag)], places=res)
    a = checks['antinode']
    out['classical'] = dict(checks, V0_shift=abs(a['shift_ref'] / a['shift_classical'] - 1), V0_widen=abs(a['widen_ref'] / a['widen_classical'] - 1),
                            V1_shift=abs(checks['node']['shift_ref'] / a['shift_ref']), V1_widen=abs(checks['node']['widen_ref'] / a['widen_ref']))
    print('V0: shift %.2e, widen %.2e (1e-2);  V1: node/antinode shift %.2e, widen %.2e (1e-3)' % (out['classical']['V0_shift'], out['classical']['V0_widen'], out['classical']['V1_shift'], out['classical']['V1_widen']))
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ref', 'scatter-cavity.json')
    with open(path, 'w') as fh:
        json.dump(out, fh, indent=1)


if __name__ == '__main__':
    main()
