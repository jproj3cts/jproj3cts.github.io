"""A Gaussian pulse through a block of glass: its GDD, TOD and duration after it.

The phase a block of length L adds at angular frequency w is w n(w) L / c, n from the glass's
Sellmeier equation: fused silica by I. H. Malitson, J. Opt. Soc. Am. 55, 1205 (1965), N-SF10
by Schott's coefficients. Its second and third derivatives at the centre are the GDD and TOD
(G. P. Agrawal, Nonlinear Fiber Optics, sections 3.2-3.3, as beta2 L and beta3 L). For a pulse
with only the GDD, an unchirped Gaussian of FWHM tau0 leaves with
tau0 sqrt(1 + (4 ln2 GDD / tau0^2)^2); the duration here is worked out with the whole phase
(the TOD and every higher order included), by Fourier transform of the Gaussian spectrum,
and that closed form is checked where the TOD does not matter.

    python glass_pulse.py
"""
import json, math, os
import numpy as np

C_MM = 2.99792458e-4                           # mm per fs
C_NM = 299.792458                              # nm per fs
GLASS = {
    'Fused silica': (0.6961663, 0.4079426, 0.8974794, 0.0684043 ** 2, 0.1162414 ** 2, 9.896161 ** 2),   # Malitson 1965
    'N-SF10': (1.62153902, 0.256287842, 1.64447552, 0.0122241457, 0.0595736775, 147.468793),            # Schott
}

def n_of(glass, um):
    B1, B2, B3, C1, C2, C3 = GLASS[glass]
    l2 = um * um
    return np.sqrt(1 + B1 * l2 / (l2 - C1) + B2 * l2 / (l2 - C2) + B3 * l2 / (l2 - C3))

def phase(glass, L_mm, w):                      # rad, w in rad/fs
    um = 2 * np.pi * C_NM / w / 1000
    return w * n_of(glass, um) * L_mm / C_MM

def derivs(glass, L, w0):
    out = []
    for h in (0.002, 0.004):
        f = [phase(glass, L, w0 + k * h) for k in (-3, -2, -1, 0, 1, 2, 3)]
        d2 = (2 * f[0] - 27 * f[1] + 270 * f[2] - 490 * f[3] + 270 * f[4] - 27 * f[5] + 2 * f[6]) / (180 * h * h)
        d3 = (f[0] - 8 * f[1] + 13 * f[2] - 13 * f[4] + 8 * f[5] - f[6]) / (8 * h ** 3)
        out.append((d2, d3))
    (a2, a3), (b2, b3) = out
    assert abs(a2 / b2 - 1) < 1e-6 and abs(a3 / b3 - 1) < 1e-4, out
    return a2, a3

def fwhm(t, I):
    k = int(np.argmax(I)); half = I[k] / 2
    a = k
    while I[a] > half: a -= 1
    b = k
    while I[b] > half: b += 1
    ta = t[a] + (half - I[a]) / (I[a + 1] - I[a]) * (t[a + 1] - t[a])
    tb = t[b - 1] + (half - I[b - 1]) / (I[b] - I[b - 1]) * (t[b] - t[b - 1])
    return tb - ta

def duration(glass, L, nm, tau0, keep_only_gdd=False):
    w0 = 2 * np.pi * C_NM / nm
    dnu = 0.4413 / tau0                          # the Gaussian's spectral FWHM, 1/fs
    dw = 2 * np.pi * dnu
    N = 1 << 18
    T = 40000.0                                  # fs, the time window
    dt = T / N
    w = 2 * np.pi * np.fft.fftfreq(N, dt)        # offset from w0, rad/fs
    A = np.exp(-2 * np.log(2) * (w / dw) ** 2)   # field: intensity spectrum exp(-4 ln2 (w/dw)^2)
    m = np.abs(w) < 4 * dw                       # the field beyond is under 1e-9 of its peak
    ph = np.zeros(N)
    if keep_only_gdd:
        gdd, _ = derivs(glass, L, w0)
        ph[m] = 0.5 * gdd * w[m] ** 2
    else:
        p = phase(glass, L, w0 + w[m])
        p0 = phase(glass, L, w0)
        p1 = (phase(glass, L, w0 + 1e-4) - phase(glass, L, w0 - 1e-4)) / 2e-4
        ph[m] = p - p0 - p1 * w[m]                 # the group delay taken off: the pulse stays in the window
    E = np.fft.fftshift(np.fft.ifft(A * np.exp(1j * ph)))
    t = (np.arange(N) - N // 2) * dt
    I = np.abs(E) ** 2
    return fwhm(t, I)

cases = []
for glass, L, nm, tau0 in (('N-SF10', 10.0, 800.0, 20.0), ('N-SF10', 25.0, 800.0, 50.0), ('Fused silica', 25.0, 800.0, 30.0),
                           ('Fused silica', 50.0, 1030.0, 40.0), ('Fused silica', 5.0, 800.0, 10.0)):
    w0 = 2 * np.pi * C_NM / nm
    gdd, tod = derivs(glass, L, w0)
    tau = duration(glass, L, nm, tau0)
    tau_gdd = duration(glass, L, nm, tau0, keep_only_gdd=True)
    closed = tau0 * math.sqrt(1 + (4 * math.log(2) * gdd / tau0 ** 2) ** 2)
    assert abs(tau_gdd / closed - 1) < 2e-4, (tau_gdd, closed)
    # at 0 mm, the transform limit comes back
    assert abs(duration(glass, 1e-9, nm, tau0) / tau0 - 1) < 2e-4
    cases.append({'glass': glass, 'L_mm': L, 'nm': nm, 'tau0_fs': tau0, 'n': float(n_of(glass, nm / 1000)),
                  'GDD_fs2': gdd, 'TOD_fs3': tod, 'tau_fs': tau, 'tau_gdd_only_fs': closed})
    print(cases[-1])

path = os.path.join(os.path.dirname(__file__), '..', 'ref', 'glass-pulse.json')
with open(path, 'w') as f:
    json.dump({'source': 'Sellmeier GDD and TOD (fused silica: Malitson 1965; N-SF10: Schott) and the duration of a Gaussian pulse '
               'after the glass, by Fourier transform with the whole spectral phase', 'cases': cases}, f, indent=1)
