"""The dichroic atomic vapour laser lock (DAVLL) signal against the magnetic field, from ElecSus.

K. L. Corwin, Z.-T. Lu, C. F. Hand, R. J. Epstein and C. E. Wieman, "Frequency-stabilized
diode laser with the Zeeman shift in an atomic vapor", Appl. Opt. 37, 3295 (1998): linearly
polarised light through a vapour cell in a field along it; its two circular hands are absorbed
by Zeeman-shifted lines, a quarter-wave plate at 45 degrees and a polarising beam splitter
send each hand to a photodiode of its own, and their difference crosses zero steeply near
each line, over a capture range of the Doppler width.

The signal is the difference of the two hands' transmissions over the light put in, which
ElecSus (M. A. Zentile et al., Comput. Phys. Commun. 189, 162 (2015); github.com/jameskeaveney/
ElecSus) gives as the Stokes parameter S3 = I_r - I_l for light linearly polarised along x.
Natural rubidium, D2, a 75 mm cell at 25 C, fields of 50, 100 and 200 G. Where its peaks and troughs
are, and where it crosses zero between each neighbouring pair (the lock points), are what
the case compares; the signal itself is kept for
the plot.

    ELECSUS=/path/to/ElecSus python davll_elecsus.py
"""
import json, os, sys, warnings
warnings.filterwarnings('ignore')
import numpy as np
ES = os.environ.get('ELECSUS', 'ElecSus')
sys.path.insert(0, os.path.join(ES, 'elecsus')); sys.path.insert(0, os.path.join(ES, 'elecsus', 'libs'))
import elecsus_methods as EM
import AtomConstants as AC

step = 2.0
det = np.arange(-4500.0, 5500.0 + 1e-9, step)            # MHz from the D2 line's centre
cases = []
for B in (50.0, 100.0, 200.0):
    p = {'Elem': 'Rb', 'Dline': 'D2', 'T': 25.0, 'lcell': 75e-3, 'Bfield': B, 'Btheta': 0.0, 'rb85frac': 72.17}
    S0, S3 = EM.calculate(det, [1, 0, 0], p, outputs=['S0', 'S3'])
    S0, S3 = np.real(S0), np.real(S3)
    amp = np.max(np.abs(S3))
    # the peaks and troughs (above a fifth of the largest), and the zero crossing between each
    # neighbouring peak and trough: the lock points
    ex = []
    for i in range(1, len(det) - 1):
        if (S3[i] > S3[i - 1] and S3[i] >= S3[i + 1]) or (S3[i] < S3[i - 1] and S3[i] <= S3[i + 1]):
            if abs(S3[i]) > 0.2 * amp:
                a, b, c = S3[i - 1], S3[i], S3[i + 1]
                ex.append([float(det[i] + 0.5 * step * (a - c) / (a - 2 * b + c)), float(b)])
    zc = []
    for (d1, v1), (d2, v2) in zip(ex, ex[1:]):
        if v1 * v2 < 0:
            i0, i1 = np.searchsorted(det, d1), np.searchsorted(det, d2)
            for i in range(i0, i1):
                if S3[i] * S3[i + 1] <= 0 and S3[i] != S3[i + 1]:
                    zc.append(float(det[i] - S3[i] * (det[i + 1] - det[i]) / (S3[i + 1] - S3[i]))); break
    cases.append({'B_G': B, 'v0_Hz': float(AC.RbD2Transition.v0), 'det_MHz': [float(d) for d in det], 'S3': [round(float(v), 7) for v in S3],
                  'S0': [round(float(v), 6) for v in S0], 'zero_crossings_MHz': zc, 'extrema_MHz': ex, 'amp': float(amp)})
    print('%3.0f G: zero crossings' % B, [round(z, 1) for z in zc], 'extrema', [(round(e[0], 1), round(e[1], 4)) for e in ex])
out = {'source': 'ElecSus (Zentile et al. 2015): S3 = I_r - I_l, linear light, a field along the cell', 'lcell_mm': 75, 'T': 25, 'cases': cases}
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'davll-elecsus.json'), 'w'))
