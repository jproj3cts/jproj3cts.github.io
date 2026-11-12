"""A uniform fibre Bragg grating: its reflection, transmission and delay by coupled-mode theory.

T. Erdogan, "Fiber grating spectra", J. Lightwave Technol. 15, 1277-1294 (1997). An index change
    dn(z) = dn_dc (1 + v cos(2 pi z / Lambda))
along a length L of a single-mode fibre couples its forward mode R to its backward mode S
(Erdogan's eqs. 10-11):
    dR/dz =  i sh R + i kappa S,     dS/dz = -i sh S - i kappa R,
with sh = delta + sigma the "dc" self-coupling, delta = 2 pi n_eff (1/lambda - 1/lambda_D) the
detuning from the design wavelength lambda_D = 2 n_eff Lambda of the fibre before the grating was
written, sigma = 2 pi dn_dc / lambda, and kappa = pi v dn_dc / lambda. With no backward wave at
the far end, S(L/2) = 0, the amplitude reflection is rho = S(-L/2) / R(-L/2) and the amplitude
transmission R(L/2) / R(-L/2). The closed forms for a uniform grating (eqs. 14-15), with
gamma^2 = kappa^2 - sh^2:
    rho = -kappa sinh(gamma L) / (sh sinh(gamma L) + i gamma cosh(gamma L)),
    |rho|^2 = sinh^2(gamma L) / (cosh^2(gamma L) - sh^2 / kappa^2),
the most reflected tanh^2(kappa L) (eq. 16), at lambda_max = (1 + dn_dc / n_eff) lambda_D. The
delay of the reflected light is tau = d(arg rho)/d(omega) (eq. 17).

Here the two equations are integrated numerically from the far end to the near, with their
derivatives with respect to the optical frequency alongside (which give the delay without a
finite difference), and checked against the closed forms. Nothing of JEKray's is used.

JEKray's grating is given by the wavelength it reflects most, lambda_B, and the mean index in the
grating, n = n_eff + dn_dc. The two descriptions are one: sh = 2 pi n (1/lambda - 1/lambda_B)
with lambda_B = lambda_max. The gratings here: lambda_B = 1550 nm, n = 1.468, L = 10 mm, unit
fringe visibility, and dn_dc chosen for kappa L = 0.5, 2 and 8 at lambda_B. The index does not
change with wavelength (the group index is the index).

The delay is also worked out as a modulation phase-shift measurement would read it (the phase of
the beat between a carrier and sidebands 10 MHz either side), to say how far that reading is from
the delay at the carrier.

    python fbg_erdogan.py
"""
import json, math, os
import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq

C = 299792458.0                      # m/s
LB, NMEAN, L, VIS = 1550e-9, 1.468, 10e-3, 1.0
FM = 10e6                            # the modulation of the phase-shift reading, Hz


class Grating:
    def __init__(self, kL):
        self.kL = kL
        self.dn = kL * LB / (math.pi * VIS * L)          # dn_dc, for kappa L at lambda_B
        self.period = LB / (2 * NMEAN)
        self.n0 = NMEAN - self.dn                        # the fibre before the grating
        self.lD = 2 * self.n0 * self.period              # its design wavelength

    def sh(self, lam):
        return 2 * math.pi * self.n0 * (1 / lam - 1 / self.lD) + 2 * math.pi * self.dn / lam

    def kappa(self, lam):
        return math.pi * VIS * self.dn / lam

    def closed(self, lam):
        """Erdogan's eq. 14, and the transmission that goes with it"""
        s, k = self.sh(lam), self.kappa(lam)
        g = np.sqrt(complex(k * k - s * s))
        den = s * np.sinh(g * L) + 1j * g * np.cosh(g * L)
        return -k * np.sinh(g * L) / den, 1j * g / den

    def integrated(self, lam):
        """rho, tau and d(arg rho)/d(omega), from the coupled-mode equations and their
        derivatives with omega: d(sh)/d(omega) = (n0 + dn) / c, d(kappa)/d(omega) = v dn / (2 c)"""
        s, k = self.sh(lam), self.kappa(lam)
        sw, kw = (self.n0 + self.dn) / C, VIS * self.dn / (2 * C)

        def f(z, y):
            R, S, Rw, Sw = y
            return [1j * s * R + 1j * k * S, -1j * s * S - 1j * k * R,
                    1j * s * Rw + 1j * k * Sw + 1j * sw * R + 1j * kw * S, -1j * s * Sw - 1j * k * Rw - 1j * sw * S - 1j * kw * R]
        r = solve_ivp(f, [L / 2, -L / 2], np.array([1, 0, 0, 0], dtype=complex), method='DOP853', rtol=1e-12, atol=1e-15)
        R, S, Rw, Sw = r.y[:, -1]
        rho = S / R
        return rho, 1 / R, ((Sw * R - S * Rw) / (R * R) / rho).imag if abs(rho) > 0 else float('nan')

    def delay_closed(self, lam):
        """d(arg rho)/d(omega) of the closed form, by a central difference in omega"""
        w, dw = 2 * math.pi * C / lam, 2 * math.pi * C / lam * 2e-9
        a, b = self.closed(2 * math.pi * C / (w + dw))[0], self.closed(2 * math.pi * C / (w - dw))[0]
        return np.angle(a / b) / (2 * dw)

    def delay_modulated(self, lam):
        """what a phase-shift measurement at FM reads: the beat of the carrier with its two sidebands"""
        w, dw = 2 * math.pi * C / lam, 2 * math.pi * FM
        r0, rp, rm = self.closed(lam)[0], self.closed(2 * math.pi * C / (w + dw))[0], self.closed(2 * math.pi * C / (w - dw))[0]
        return np.angle(rp * np.conj(r0) + r0 * np.conj(rm)) / dw


out = {'lambda_B_nm': LB * 1e9, 'n': NMEAN, 'L_mm': L * 1e3, 'vis': VIS, 'fm_Hz': FM, 'cases': []}
worst = {'R': 0, 'T': 0, 'delay': 0, 'mod': 0, 'unit': 0}
for kL in [0.5, 2.0, 8.0]:
    G = Grating(kL)
    # the two descriptions agree: the detuning from the wavelength reflected most, with the mean index
    for lam in np.linspace(LB - 1e-9, LB + 1e-9, 9):
        assert abs(G.sh(lam) - 2 * math.pi * NMEAN * (1 / lam - 1 / LB)) < 1e-6, 'detuning'
    assert abs((1 + G.dn / G.n0) * G.lD - LB) < 1e-20
    # the first zeros either side: gamma L = i pi, so sh^2 = kappa^2 + (pi / L)^2
    zf = lambda lam: G.sh(lam) ** 2 - G.kappa(lam) ** 2 - (math.pi / L) ** 2
    est = LB ** 2 * math.sqrt(kL ** 2 + math.pi ** 2) / (math.pi * NMEAN * L)        # the band between them, to first order
    z_lo, z_hi = brentq(zf, LB - est, LB, xtol=1e-22, rtol=1e-15), brentq(zf, LB, LB + est, xtol=1e-22, rtol=1e-15)
    for z in (z_lo, z_hi):
        assert abs(G.integrated(z)[0]) ** 2 < 1e-18, 'a zero'
    assert abs((z_hi - z_lo) / est - 1) < 1e-3
    # the peak, and the width at half of it
    rho0, tau0, tw0 = G.integrated(LB)
    peak = abs(rho0) ** 2
    assert abs(peak - math.tanh(kL) ** 2) < 1e-10, 'the peak'
    Rc = lambda lam: abs(G.closed(lam)[0]) ** 2
    h_lo, h_hi = brentq(lambda x: Rc(x) - peak / 2, z_lo, LB, xtol=1e-22, rtol=1e-15), brentq(lambda x: Rc(x) - peak / 2, LB, z_hi, xtol=1e-22, rtol=1e-15)
    # the delay at the centre: n tanh(kappa L) / (kappa c)
    assert abs(tw0 / (NMEAN * math.tanh(kL) / (kL / L) / C) - 1) < 1e-9, 'the delay at the centre'
    # the spectra, across three times the band between the zeros
    nm, Rs, Ts = [], [], []
    for lam in np.linspace(LB - 1.5 * est, LB + 1.5 * est, 41):
        rho, tau, _ = G.integrated(lam)
        rc, tc = G.closed(lam)
        worst['R'] = max(worst['R'], abs(abs(rho) ** 2 - abs(rc) ** 2)); worst['T'] = max(worst['T'], abs(abs(tau) ** 2 - abs(tc) ** 2))
        worst['unit'] = max(worst['unit'], abs(abs(rho) ** 2 + abs(tau) ** 2 - 1))
        assert abs(rho - rc) < 1e-9 and abs(tau - tc) < 1e-9, 'the closed form'
        nm.append(lam * 1e9); Rs.append(abs(rho) ** 2); Ts.append(abs(tau) ** 2)
    # the delay across the main lobe
    dnm, dps = [], []
    for u in np.linspace(-0.8, 0.8, 9):
        lam = LB + u * (z_hi - LB if u >= 0 else LB - z_lo)
        _, _, tw = G.integrated(lam)
        worst['delay'] = max(worst['delay'], abs(tw / G.delay_closed(lam) - 1)); worst['mod'] = max(worst['mod'], abs(G.delay_modulated(lam) / tw - 1))
        dnm.append(lam * 1e9); dps.append(tw * 1e12)
    # a finer run of the closed form, for the plots
    fine = np.linspace(LB - 1.5 * est, LB + 1.5 * est, 601)
    out['cases'].append({'kL': kL, 'dn': G.dn, 'period_nm': G.period * 1e9, 'peak_R': peak, 'peak_T': abs(tau0) ** 2,
                         'zero_lo_nm': z_lo * 1e9, 'zero_hi_nm': z_hi * 1e9, 'zeros_nm': (z_hi - z_lo) * 1e9, 'fwhm_nm': (h_hi - h_lo) * 1e9,
                         'delay_centre_ps': tw0 * 1e12, 'nm': nm, 'R': Rs, 'T': Ts, 'delay_nm': dnm, 'delay_ps': dps,
                         'fine_nm': list(fine * 1e9), 'fine_R': [Rc(x) for x in fine]})
    print('kappa L %.1f: dn %.4e, peak R %.9f (tanh^2 %.9f), zeros %.6f nm apart, half width %.6f nm, delay at the centre %.4f ps'
          % (kL, G.dn, peak, math.tanh(kL) ** 2, (z_hi - z_lo) * 1e9, (h_hi - h_lo) * 1e9, tw0 * 1e12))
print('integrated against closed form: R within %.1e, T within %.1e, R + T - 1 within %.1e, delay within %.1e (relative)' % (worst['R'], worst['T'], worst['unit'], worst['delay']))
print('a phase-shift reading at %g MHz is within %.1e (relative) of the delay at the carrier' % (FM / 1e6, worst['mod']))
out['self_check'] = worst
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'fbg-erdogan.json'), 'w'), indent=1)
