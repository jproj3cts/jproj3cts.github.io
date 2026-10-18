"""Pulses in optical fibre: self-phase modulation and solitons, from exact solutions of the
nonlinear Schroedinger equation  dA/dz = -i beta2/2 d2A/dt2 + i gamma |A|^2 A.

1. Self-phase modulation without dispersion (R. H. Stolen and C. Lin, "Self-phase-modulation
   in silica optical fibers", Phys. Rev. A 17, 1448 (1978)): the pulse keeps its shape and
   takes the phase gamma P0 L |U(t)|^2, so its spectrum is the Fourier transform of a field
   known exactly. Worked out here on a fine grid for Gaussian and sech^2 pulses at peak phases
   0.5 pi to 4.5 pi, where Stolen and Lin's spectra have M = phi/pi + 1/2 peaks. The rms width
   of a Gaussian's spectrum grows as sqrt(1 + 4 phi^2 / (3 sqrt 3)) (M. J. Potasek, G. P.
   Agrawal and S. C. Pinault, J. Opt. Soc. Am. B 3, 205 (1986); Agrawal, Nonlinear Fiber
   Optics, eq. 4.1.14), which the numbers here reproduce.

2. The fundamental soliton (A. Hasegawa and F. Tappert, Appl. Phys. Lett. 23, 142 (1973);
   observed by L. F. Mollenauer, R. H. Stolen and J. P. Gordon, Phys. Rev. Lett. 45, 1095
   (1980)): a sech pulse of peak power |beta2| / (gamma T0^2) in anomalous dispersion keeps
   its shape and spectrum; here over five dispersion lengths.

3. The second-order soliton (J. Satsuma and N. Yajima, Prog. Theor. Phys. Suppl. 55, 284
   (1974)), launched at four times that power: in soliton units
     u(xi, tau) = 4 [cosh 3tau + 3 e^{4 i xi} cosh tau] e^{i xi/2} / [cosh 4tau + 4 cosh 2tau + 3 cos 4xi],
   xi = z / L_D; its spectrum splits and comes back each soliton period pi/2 L_D. Compared at
   half a period, where it is split furthest.

Fibre: gamma 1.3 /(W km), dispersion 0 (1) or 17 ps/(nm km) (2, 3) at 1550 nm, no loss.

    python spm_solitons.py
"""
import json, math, os
import numpy as np

C_FS = 299.792458                    # nm/fs
NM, GAMMA = 1550.0, 1.3e-3           # nm; 1/(W m)
REP = 80.0                           # MHz

def spectrum(field, dt):
    """power spectrum against angular frequency offset (rad/fs), peak 1"""
    n = len(field)
    S = np.abs(np.fft.fftshift(np.fft.fft(field))) ** 2
    w = np.fft.fftshift(np.fft.fftfreq(n, dt)) * 2 * math.pi
    return w, S / S.max()

def rms(w, S):
    s0 = S.sum(); m = (w * S).sum() / s0
    return math.sqrt((((w - m) ** 2) * S).sum() / s0)

def peaks(S, floor=0.05):
    return int(sum(1 for i in range(1, len(S) - 1) if S[i] > S[i - 1] and S[i] >= S[i + 1] and S[i] > floor))

def sample(w, S, half):
    """the transform's own points within +-half (rad/fs): no resampling"""
    k = np.abs(w) <= half
    return [round(float(v), 7) for v in w[k]], [round(float(v), 6) for v in S[k]]

out = {'nm': NM, 'gamma_W_km': GAMMA * 1e3, 'rep_MHz': REP, 'spm': [], 'solitons': []}

# 1. self-phase modulation, 1 ps pulses, 1 km of dispersion-free fibre
tau, L = 1000.0, 1000.0
t = np.linspace(-40 * tau, 40 * tau, 2 ** 18); dt = t[1] - t[0]
for shape in ('gauss', 'sech2'):
    if shape == 'gauss':
        T0 = tau / (2 * math.sqrt(math.log(2))); U = np.exp(-t ** 2 / (2 * T0 ** 2)); Ep_per_P0 = T0 * math.sqrt(math.pi)
    else:
        T0 = tau / (2 * math.acosh(math.sqrt(2))); U = 1 / np.cosh(t / T0); Ep_per_P0 = 2 * T0
    w, S0 = spectrum(U.astype(complex), dt)
    r0 = rms(w, S0)
    for k in (0.5, 1.5, 2.5, 3.5, 4.5):
        phi = k * math.pi
        P0 = phi / (GAMMA * L)
        w, S = spectrum(U * np.exp(1j * phi * U ** 2), dt)
        broad = rms(w, S) / r0
        row = {'shape': shape, 'tau_fs': tau, 'len_m': L, 'disp': 0, 'phi_max': phi, 'phi_over_pi': k, 'P0_W': P0,
               'Pavg_W': P0 * Ep_per_P0 * 1e-15 * REP * 1e6, 'broad_rms': broad, 'peaks': peaks(S), 'stolen_lin_peaks': k + 0.5}
        if shape == 'gauss':
            row['potasek_formula'] = math.sqrt(1 + 4 * phi ** 2 / (3 * math.sqrt(3)))
            assert abs(broad / row['potasek_formula'] - 1) < 1e-4, (broad, row['potasek_formula'])
        half = 1.25 * phi * 2 / T0 + 6 / T0                    # the spectrum's reach, rad/fs
        row['w'], row['S'] = sample(w, S, half)
        out['spm'].append(row)

# 2 and 3. solitons in anomalous dispersion: 17 ps/(nm km)
D = 17.0                                                       # ps/(nm km)
beta2 = -D * 1e-3 * NM ** 2 / (2 * math.pi * C_FS) * 1e3       # fs^2/m  (= ps^2/km * 1e3)
tau = 1000.0; T0 = tau / (2 * math.acosh(math.sqrt(2))); LD = T0 ** 2 / abs(beta2)
P1 = abs(beta2) / (GAMMA * T0 ** 2)                            # W, the fundamental soliton's peak power
t = np.linspace(-60 * T0, 60 * T0, 2 ** 16); dt = t[1] - t[0]; s = t / T0
for order, xi in ((1, 5.0), (2, math.pi / 4)):
    if order == 1:
        u = (1 / np.cosh(s)) * np.exp(1j * xi / 2)
    else:
        u = 4 * (np.cosh(3 * s) + 3 * np.exp(4j * xi) * np.cosh(s)) * np.exp(1j * xi / 2) / (np.cosh(4 * s) + 4 * np.cosh(2 * s) + 3 * np.cos(4 * xi))
    w, S = spectrum(u, dt)
    w0, S0 = spectrum((order / np.cosh(s)).astype(complex), dt)
    row = {'order': order, 'tau_fs': tau, 'T0_fs': T0, 'disp': D, 'beta2_fs2_m': beta2, 'LD_m': LD, 'xi': xi, 'len_m': xi * LD,
           'P0_W': order ** 2 * P1, 'Pavg_W': order ** 2 * P1 * 2 * T0 * 1e-15 * REP * 1e6, 'broad_rms': rms(w, S) / rms(w0, S0), 'peaks': peaks(S)}
    row['w'], row['S'] = sample(w, S, 30 / T0)
    out['solitons'].append(row)

path = os.path.join(os.path.dirname(__file__), '..', 'ref', 'spm-solitons.json')
with open(path, 'w') as f:
    json.dump(out, f)
for r in out['spm']:
    print(r['shape'], r['phi_over_pi'], 'broad %.4f' % r['broad_rms'], 'peaks', r['peaks'], 'Stolen-Lin', r['stolen_lin_peaks'])
for r in out['solitons']:
    print('N =', r['order'], 'z = %.2f m' % r['len_m'], 'P0 %.2f W' % r['P0_W'], 'broad %.4f' % r['broad_rms'], 'peaks', r['peaks'])
