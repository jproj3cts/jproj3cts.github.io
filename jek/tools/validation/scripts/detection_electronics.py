"""A photodiode's noise, analogue filters and a lock-in amplifier, against closed forms.

Photodiode: a current I = R P (responsivity R, power P) carries shot noise of one-sided density
2 q I (W. Schottky, Annalen der Physik 57, 541 (1918)); the feedback resistor R_f of its
transimpedance amplifier adds Johnson noise 4 k T / R_f (J. B. Johnson, Phys. Rev. 32, 97
(1928); H. Nyquist, Phys. Rev. 32, 110 (1928)); the dark current adds 2 q I_d, and the amplifier
its input current noise i_n^2. A single-pole bandwidth B passes white noise as a flat band of
width int_0^inf df / (1 + (f/B)^2) = (pi/2) B, the noise-equivalent bandwidth, found here by
quadrature. T = 295 K, as JEKray takes it.

Filters: Butterworth low-, high- and band-pass filters (P. Horowitz and W. Hill, The Art of
Electronics, 3rd ed., Cambridge 2015, ch. 6), their gain and phase from scipy.signal's analogue
designs; the band-pass is the low-pass prototype under s -> (s^2 + w0^2) / (s bw).

Lock-in: the signal multiplied by sqrt2 cos(w t + theta) and filtered by n RC poles of time
constant tau. A sine of amplitude A, phase phi against the reference, reads X + iY = A e^{i phi} /
sqrt2. White noise of density e_n reads sigma = e_n sqrt(ENBW), ENBW = int_0^inf |H|^2 df =
1/(4 tau), 1/(8 tau), 3/(32 tau), 5/(64 tau) for n = 1..4, by quadrature here.

    python detection_electronics.py
"""
import json, math, os
import numpy as np
from scipy.integrate import quad
from scipy import signal

q, kB, T = 1.602176634e-19, 1.380649e-23, 295.0

# the noise bandwidth of one pole, by quadrature
B = 1e6
Bn = B * quad(lambda x: 1 / (1 + x * x), 0, np.inf, epsabs=1e-13, epsrel=1e-13)[0]
assert abs(Bn / B - math.pi / 2) < 1e-9
pd = {'resp': 0.8, 'gain': 1e4, 'bandwidth': B, 'dark_nA': 1.0, 'ampNoise_pA': 2.0, 'Bn': Bn, 'rows': []}
for P in [0.001, 0.01, 0.1, 1.0, 10.0]:
    I = pd['resp'] * P * 1e-3
    shot = 2 * q * (I + 1e-9) * Bn
    thermal = 4 * kB * T / pd['gain'] * Bn
    amp = (2e-12) ** 2 * Bn
    i2 = shot + thermal + amp
    pd['rows'].append({'P_mW': P, 'I_A': I, 'shot_A2': shot, 'thermal_A2': thermal, 'amp_A2': amp, 'i2_A2': i2,
                       'snr_dB': 20 * math.log10(I / math.sqrt(i2))})

fc = 1000.0
freqs = [10, 100, 300, 1000, 2000, 3000, 10000, 100000]
filters = []
def resp(b, a, f):
    _, h = signal.freqs(b, a, worN=[2 * math.pi * f])
    return abs(h[0]), math.degrees(np.angle(h[0]))
for kind, order in [('lpf', 1), ('lpf', 2), ('lpf', 4), ('hpf', 1), ('hpf', 3)]:
    b, a = signal.butter(order, 2 * math.pi * fc, 'low' if kind == 'lpf' else 'high', analog=True)
    filters.append({'kind': kind, 'order': order, 'fc': fc, 'rows': [dict(zip(['f', 'mag', 'phase_deg'], [f, *resp(b, a, f)])) for f in freqs]})
# a band-pass: centre 1 kHz, 200 Hz wide (edges f1 f2 = f0^2, f2 - f1 = bw)
f0, bw = 1000.0, 200.0
f1 = (-bw + math.sqrt(bw * bw + 4 * f0 * f0)) / 2; f2 = f1 + bw
for order in [1, 2]:
    b, a = signal.butter(order, [2 * math.pi * f1, 2 * math.pi * f2], 'bandpass', analog=True)
    filters.append({'kind': 'bpf', 'order': order, 'f0': f0, 'bw': bw, 'rows': [dict(zip(['f', 'mag', 'phase_deg'], [f, *resp(b, a, f)])) for f in [300, 800, 900, 950, 1000, 1050, 1100, 1300, 3000]]})
# the first-order low-pass in closed form, as a check on scipy
for r in filters[0]['rows']:
    x = r['f'] / fc
    assert abs(r['mag'] - 1 / math.sqrt(1 + x * x)) < 1e-12 and abs(r['phase_deg'] + math.degrees(math.atan(x))) < 1e-9

tau, en = 0.1, 100e-9
lockin = {'tau': tau, 'en': en, 'rows': []}
for n in [1, 2, 3, 4]:
    enbw = quad(lambda f: 1 / (1 + (2 * math.pi * f * tau) ** 2) ** n, 0, np.inf, epsabs=1e-12, epsrel=1e-12)[0]
    assert abs(enbw - [1 / 4, 1 / 8, 3 / 32, 5 / 64][n - 1] / tau) < 1e-9
    lockin['rows'].append({'n': n, 'enbw': enbw, 'sigma': en * math.sqrt(enbw)})
# a 1 V sine at 1 kHz through the first-order low-pass at 2 kHz, read by the lock-in
H = 1 / (1 + 1j * 1000 / 2000)
lockin['through_lpf'] = {'f': 1000, 'fc': 2000, 'R': abs(H) / math.sqrt(2), 'theta_deg': math.degrees(np.angle(H))}

out = {'source': 'Schottky (1918), Johnson and Nyquist (1928), Horowitz & Hill (2015) ch. 6; scipy.signal Butterworth designs',
       'pd': pd, 'filters': filters, 'lockin': lockin}
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, '..', 'ref', 'detection-electronics.json'), 'w') as f:
    json.dump(out, f, indent=1)
for r in pd['rows']: print(r['P_mW'], 'mW: snr', round(r['snr_dB'], 4), 'dB')
for L in lockin['rows']: print('n', L['n'], 'enbw', L['enbw'], 'sigma', L['sigma'])
