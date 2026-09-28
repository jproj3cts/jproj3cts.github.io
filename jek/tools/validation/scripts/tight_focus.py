"""The vector field at a tight focus, from the exact vector angular spectrum.

B. Richards and E. Wolf, "Electromagnetic diffraction in optical systems II. Structure of
the image field in an aplanatic system", Proc. R. Soc. A 253, 358 (1959), showed that at high
numerical aperture the focus of linearly polarised light is not round: the field gains a
component along the axis, which widens the spot along the polarisation. Their integrals are
for an aplanatic lens. The lens here is a thin phase plate (an ideal flat lens: JEKray2D's
"perfect lens" mask), which leaves the light x-polarised across its plane,
    E_x(rho) = sqrt(2P / pi w^2) exp(-rho^2 / w^2) exp(-i k (sqrt(rho^2 + f^2) - f)),  E_y = 0,
so the exact answer is its vector angular spectrum (no Debye or paraxial approximation):
each Cartesian component travels as a scalar, and the axial one follows from div E = 0,
    E_x(r)      = (1/2pi) int A(q) e^{i k_z f} J0(q r) q dq,
    E_z(r, phi) = -(i cos phi / 2pi) int (q / k_z) A(q) e^{i k_z f} J1(q r) q dq,
    A(q)        = 2 pi int E_x(rho) J0(q rho) rho drho,     k_z = sqrt(k^2 - q^2),
in the focal plane z = f. Along the polarisation (phi = 0) the irradiance is |E_x|^2 + |E_z|^2,
across it |E_x|^2. The pupil integral is done by brute force on a grid finer than lambda/8
at the lens's steepest, the spectrum's by the trapezium rule to q = k (the evanescent part is
nothing 3 mm away).

633 nm, f = 3 mm, 1 mW, beams of w = 1.0, 2.5 and 4.0 mm at the plate (JEKray2D's
tight-focus example is 2.5 mm).

    python tight_focus.py
"""
import json, math, os
import numpy as np
from scipy.special import j0, j1

lam, f, P = 633e-6, 3.0, 1.0
k = 2 * math.pi / lam
out = {'nm': 633, 'f_mm': f, 'P_mW': P, 'cases': []}
for w in (1.0, 2.5, 4.0):
    rmax = min(12.7, 3.6 * w)                       # the plate is 25.4 mm across
    nr = int(rmax / (lam / 10)) + 1
    rho = np.linspace(0, rmax, nr); dr = rho[1] - rho[0]
    E = math.sqrt(2 * P / (math.pi * w * w)) * np.exp(-rho ** 2 / w ** 2) * np.exp(-1j * k * (np.sqrt(rho ** 2 + f * f) - f))
    wt = rho * dr; wt[0] *= 0.5; wt[-1] *= 0.5
    # the spectrum out to where the pupil's steepest ray points (plus margin), never past k
    qmax = min(k, k * rmax / math.hypot(rmax, f) * 1.02)
    q = np.linspace(0, qmax, 6001)
    A = np.empty(q.size, dtype=complex)
    EW = E * wt
    for i0 in range(0, q.size, 40):
        qq = q[i0:i0 + 40]
        A[i0:i0 + 40] = 2 * math.pi * (j0(np.outer(qq, rho)) @ EW)
    kz = np.sqrt(k * k - q * q + 0j)
    ph = np.exp(1j * kz * f)
    dq = q[1] - q[0]; wq = q * dq; wq[0] *= 0.5; wq[-1] *= 0.5
    r = np.linspace(0, 0.0015, 301)                  # mm, the focal plane out to 1.5 um
    Ex = (1 / (2 * math.pi)) * (j0(np.outer(r, q)) @ (A * ph * wq))
    Ez = -(1j / (2 * math.pi)) * (j1(np.outer(r, q)) @ ((q / kz) * A * ph * wq))
    Ix, Iy = np.abs(Ex) ** 2 + np.abs(Ez) ** 2, np.abs(Ex) ** 2
    half = lambda I: float(np.interp(0.5 * I[0], I[::-1], r[::-1]))    # I falls monotonically to its first zero
    # total power through the focal plane, as a check on the integrals: int |E|^2 over the plane
    Ptot = float(np.sum((np.abs(Ex) ** 2 + 0.5 * np.abs(Ez) ** 2) * 2 * math.pi * r) * (r[1] - r[0]))
    c = {'w0_mm': w, 'NA_1e2': w / math.hypot(w, f), 'r_mm': [float(v) for v in r], 'I_along': [float(v) for v in Ix], 'I_across': [float(v) for v in Iy],
         'peak': float(Ix[0]), 'fwhm_along_mm': 2 * half(Ix), 'fwhm_across_mm': 2 * half(Iy),
         'Ez_over_Ex_peak': float(np.max(np.abs(Ez)) ** 2 / np.abs(Ex[0]) ** 2)}
    out['cases'].append(c)
    print('w %.1f: peak %.4g mW/mm^2, FWHM along %.4f um, across %.4f um, |Ez|^2max/|Ex(0)|^2 %.4f, |E|^2 over the plane %.3f mW (Ex alone keeps 1 mW; the rest is Ez)'
          % (w, c['peak'], c['fwhm_along_mm'] * 1e3, c['fwhm_across_mm'] * 1e3, c['Ez_over_Ex_peak'], Ptot))
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'tight-focus.json'), 'w'))
