"""Optical trapping of small spheres, and the phase singularities of an offset standing wave.

1. Y. Harada and T. Asakura, "Radiation forces on a dielectric sphere in the Rayleigh
   scattering regime", Opt. Commun. 124, 529-541 (1996). A sphere of radius a << lambda and
   relative index m = n_p / n_m in a beam of irradiance I feels a gradient force
       F_grad = (2 pi n_m a^3 / c) ((m^2 - 1)/(m^2 + 2)) grad I
   and a scattering force along the beam
       F_scat = (n_m / c) (128 pi^5 a^6 / 3 lambda^4) ((m^2 - 1)/(m^2 + 2))^2 n_m^4 I.
   In a focused Gaussian beam, I = I0 (w0/w)^2 exp(-2 r^2 / w^2), the sphere sits a little
   past the focus, where the two balance on the axis; about there it is held with stiffness
   k_z = -dF_z/dz along the beam and k_r = (2 pi n_m a^3 / c) CM 4 I / w^2 across. Here a
   30 nm fused-silica sphere (density 2200 kg/m^3, Malitson's index) in vacuum, 100 mW at
   1064 nm focused to w0 = 3 um (paraxial: NA about 0.11): the equilibrium offset and the
   trap frequencies sqrt(k / m) / 2 pi. (A 50 nm sphere is not held along the beam at this
   focus: its scattering force outweighs the gradient's pull back everywhere on the axis.)

2. Y. Hu et al., "Structured transverse orbital angular momentum probed by a levitated
   optomechanical sensor", Nat. Commun. 14, 2638 (2023), arXiv:2209.09759, eqs. (1)-(3): two
   counter-propagating Gaussian beams of one laser (waist w0 at z = 0, 1550 nm), their axes
   at y = -delta and +delta. On the plane y = 0 their field vanishes only on lines where
       k (x^2 + delta^2) z / (z^2 + z0^2) - atan(z / z0) + k z = n pi / 2,   n odd,
   which carry the transverse orbital angular momentum; for delta = 0 these are the nodal
   planes of an ordinary standing wave. Here w0 = 1 um (the paper's), delta = 0, 0.5 um (the
   paper's Fig. 2, 2 delta = 1 um) and 1.0 um, along the axis (x = 0).

Both beams here are tight enough that the paraxial Gaussian the formulas above rest on is
itself off by a per cent or two (the 1 um waists of Hu et al. diverge at half a radian), so
the reference is the same beams worked out exactly: each a Gaussian at its waist, carried by
its exact scalar angular spectrum, E(r, z) = C int exp(-q^2 w0^2 / 4) J0(q r) e^{i kz z} q dq,
kz = sqrt(k^2 - q^2). The paraxial answers are kept beside it. For the sphere: the axial force
is the gradient part A dI/dz plus the scattering part B I (dPhi/dz) / k (Phi the field's whole
phase: the plane wave's k less the Gouy phase's slope); the radial stiffness A (-d2I/dr2).
Eq. (3) as printed has k (x^2 + delta^2) z / (z^2 + z0^2) where the paper's own eqs. (1)-(2)
give half that (the Gaussian's exp(i k r^2 / 2q)); the corrected form is the one used, and the
field of eqs. (1)-(2) itself is checked to vanish there.

    python tweezers_hu.py
"""
import json, math, os
from scipy.optimize import brentq

out = {}
import numpy as np
from scipy.special import j0 as J0

def spectrum(k, w0, nq=200001):
    q = np.linspace(0, min(k * 0.999999, 14 / w0), nq); dq = q[1] - q[0]
    wq = q * dq; wq[0] *= 0.5; wq[-1] *= 0.5
    return q, np.exp(-q * q * w0 * w0 / 4) * wq, np.sqrt(k * k - q * q)

# 1. Harada and Asakura: the paraxial formulas, and the exact beam
c, lam, P, w0, a, rho = 299792458.0, 1064e-9, 0.1, 3e-6, 30e-9, 2200.0
um = lam * 1e6
np_ = math.sqrt(1 + 0.6961663 * um ** 2 / (um ** 2 - 0.0684043 ** 2) + 0.4079426 * um ** 2 / (um ** 2 - 0.1162414 ** 2) + 0.8974794 * um ** 2 / (um ** 2 - 9.896161 ** 2))
m = np_; CM = (m * m - 1) / (m * m + 2)
k = 2 * math.pi / lam
zR = math.pi * w0 ** 2 / lam
I0 = 2 * P / (math.pi * w0 ** 2)
A = 2 * math.pi * a ** 3 * CM / c
B = (1 / c) * (128 * math.pi ** 5 * a ** 6 / (3 * lam ** 4)) * CM ** 2
mass = rho * 4 / 3 * math.pi * a ** 3
f = lambda kk: math.sqrt(kk / mass) / (2 * math.pi)
# paraxial
Fz = lambda z: A * (-I0 * 2 * z / zR ** 2 / (1 + (z / zR) ** 2) ** 2) + B * I0 / (1 + (z / zR) ** 2)
zp = brentq(Fz, 0, zR); h = 1e-4 * zR
par = {'z_eq_um': 1e6 * zp, 'f_axial_Hz': f(-(Fz(zp + h) - Fz(zp - h)) / (2 * h)), 'f_radial_Hz': f(A * 4 * I0 / (1 + (zp / zR) ** 2) / (w0 ** 2 * (1 + (zp / zR) ** 2)))}
# exact scalar beam: C int G J0(qr) e^{i kz z} q dq, C = E0 w0^2 / 2 so the waist is E0 exp(-r^2/w0^2)
q, G, kz = spectrum(k, w0)
C = math.sqrt(I0) * w0 * w0 / 2
Eax = lambda z: C * np.sum(G * np.exp(1j * kz * z))
E2 = lambda z: C * np.sum(G * q * q * np.exp(1j * kz * z))        # E(r) = E0 - (r^2/4) E2 + ...
Iax = lambda z: abs(Eax(z)) ** 2
def phase_slope(z, d=1e-9):
    return (np.angle(Eax(z + d) * np.exp(-1j * k * (z + d))) - np.angle(Eax(z - d) * np.exp(-1j * k * (z - d)))) / (2 * d) + k
def Fx(z, d=2e-9):
    return A * (Iax(z + d) - Iax(z - d)) / (2 * d) + B * Iax(z) * phase_slope(z) / k
ze = brentq(Fx, 0, zR); hz = 2e-8
kz_ex = -(Fx(ze + hz) - Fx(ze - hz)) / (2 * hz)
kr_ex = A * np.real(np.conj(Eax(ze)) * E2(ze))                  # -d2I/dr2 = Re(E0* E2)
out['harada'] = {'lambda_nm': 1064, 'P_mW': 1e3 * P, 'w0_um': 1e6 * w0, 'radius_nm': 1e9 * a, 'density': rho, 'n_particle': np_,
                 'z_eq_um': 1e6 * ze, 'f_radial_Hz': f(kr_ex), 'f_axial_Hz': f(kz_ex), 'paraxial': par}
print('Harada & Asakura, exact beam:', {kk: out['harada'][kk] for kk in ('z_eq_um', 'f_radial_Hz', 'f_axial_Hz')}, 'paraxial:', par)

# 2. Hu et al.
lam2, W0 = 1550e-9, 1e-6
k2 = 2 * math.pi / lam2; z0 = math.pi * W0 ** 2 / lam2
q, G, kz = spectrum(k2, W0)
def Etot(z, d):          # beam A (axis at -d, running +z) and beam B (axis at +d, running -z), on the plane between them
    ga = G * J0(q * d)
    return np.sum(ga * np.exp(1j * kz * z)) + np.sum(ga * np.exp(-1j * kz * z))
def paraxial_field(z, d):
    u = lambda y, zz: (1 / np.sqrt(1 + (zz / z0) ** 2)) * np.exp(-1j * np.arctan(zz / z0)) * np.exp(1j * k2 * y * y / (2 * (zz - 1j * z0)))
    return u(d, z) * np.exp(1j * k2 * z) + u(-d, -z) * np.exp(-1j * k2 * z)
cases = []
for delta in (0.0, 0.5e-6, 1.0e-6):
    eq3 = lambda z, n: 0.5 * k2 * delta ** 2 * z / (z * z + z0 * z0) - math.atan(z / z0) + k2 * z - n * math.pi / 2
    par_z, ex_z = [], []
    for n in range(-11, 12, 2):
        zp = brentq(lambda z: eq3(z, n), -5e-6, 5e-6)
        if abs(zp) > 2.0e-6: continue
        assert abs(paraxial_field(zp, delta)) < 1e-6 * abs(paraxial_field(0.0, delta)) + 1e-9
        # the exact field's zero near it: the least of |E|^2, by golden section
        lo, hi = zp - 0.05e-6, zp + 0.05e-6
        for _ in range(60):
            m1, m2 = lo + 0.382 * (hi - lo), lo + 0.618 * (hi - lo)
            if abs(Etot(m1, delta)) < abs(Etot(m2, delta)): hi = m2
            else: lo = m1
        zx = 0.5 * (lo + hi)
        par_z.append(zp * 1e6); ex_z.append(zx * 1e6)
    cases.append({'delta_um': delta * 1e6, 'zeros_um': ex_z, 'paraxial_zeros_um': par_z})
    print('Hu et al., delta %.1f um: exact zeros' % (delta * 1e6), [round(v, 4) for v in ex_z], 'paraxial (eq. 3 corrected)', [round(v, 4) for v in par_z])
out['hu'] = {'lambda_nm': 1550, 'w0_um': 1.0, 'cases': cases}
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'tweezers-hu.json'), 'w'), indent=1)
