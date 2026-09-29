"""Photonic circuits: a ring, a Mach-Zehnder and a directional coupler in closed form, and two
small circuits solved by SAX.

Closed forms, as in W. Bogaerts et al., "Silicon microring resonators", Laser & Photonics
Reviews 6, 47-73 (2012), and A. Yariv, "Universal relations for coupling of optical power
between microresonators and dielectric waveguides", Electronics Letters 36, 321-322 (2000).
A ring of length L = 2 pi R, round-trip field a = 10^(-alpha L / 20) (alpha in dB per unit
length), round-trip phase phi = 2 pi n(lam) L / lam, couplers of self-coupling t = sqrt(1 - kappa):
    all-pass through  |t - a e^{-i phi}|^2 / |1 - t a e^{-i phi}|^2
    add-drop through  (t2^2 a^2 - 2 a t1 t2 cos phi + t1^2) / (1 - 2 a t1 t2 cos phi + (a t1 t2)^2)
    add-drop drop     (1 - t1^2)(1 - t2^2) a / (1 - 2 a t1 t2 cos phi + (a t1 t2)^2)
with n(lam) = neff - (ng - neff)(lam - 1550)/1550, the first-order dispersion JEKray2D and
SAX both use. Its resonances (phi = 2 pi m), each line's full width at half its depth
(between the lowest point and the highest, off resonance) and the extinction are found here
from the closed form, by root finding. A Mach-Zehnder of two 50% couplers, arms differing by
dL, is the product of its three matrices; a directional coupler with a power coupling
kappa + dkappa (lam - 1550) and an excess loss crosses a^2 (kappa + dkappa (lam - 1550)).

SAX (github.com/flaport/sax, 0.18.2 with JAX 0.9.2, double precision) solves two small
circuits from its own waveguide model (sax.models.straight, which has the same neff, ng and
dB/cm loss as JEKray2D's) and its own circuit solver, which closes the rings' loops itself.
The couplers, the MMI and the phase shifter are written here to the same compact models
JEKray2D uses; SAX's field goes as e^{+ikz} and its couplers cross with -i, the complex
conjugate of JEKray2D's convention, so every power is the same. The circuits:
  A. a 1x2 MMI (0.2 dB) splitting into two arms: one 400 um of waveguide past an all-pass ring
     (R = 10 um, 10%), the other 100 um and a 100 um phase shifter set to 60 degrees; they meet
     in a directional coupler of 50% at 1550 nm, changing by 1%/nm. Both outputs.
  B. an add-drop ring (R = 20 um, 15% and 5%), its ring two half-circles of SAX's waveguide.
All waveguides silicon strip: neff 2.44, ng 4.2, 2 dB/cm.

    pip install sax
    python photonic_circuits.py
"""
import json, math, os
import numpy as np
from scipy.optimize import brentq

import jax
jax.config.update('jax_enable_x64', True)
import jax.numpy as jnp
import sax

NEFF, NG, LOSS = 2.44, 4.2, 2.0                 # silicon strip, TE, 1550 nm; dB/cm
nAt = lambda lam: NEFF - (NG - NEFF) * (lam - 1550.0) / 1550.0
lams = np.round(np.linspace(1545.0, 1555.0, 2001), 9)
LINES = [1535.0, 1565.0]                          # nm: where the rings' lines are measured
r12 = lambda v: [float('%.12g' % x) for x in np.asarray(v, dtype=float)]

def ring_numbers(R_um, k1, k2=None):
    L = 2 * math.pi * R_um
    a = 10 ** (-LOSS * L * 1e-4 / 20)
    t1, t2 = math.sqrt(1 - k1), (math.sqrt(1 - k2) if k2 is not None else 1.0)
    phi = lambda lam: 2 * math.pi * nAt(lam) * L * 1e3 / lam
    return L, a, t1, t2, phi

def allpass(lam, R_um, k):
    L, a, t, _, phi = ring_numbers(R_um, k)
    w = a * np.exp(-1j * phi(lam))
    return np.abs((t - w) / (1 - t * w)) ** 2

def adddrop(lam, R_um, k1, k2):
    L, a, t1, t2, phi = ring_numbers(R_um, k1, k2)
    c = np.cos(phi(lam)); den = 1 - 2 * a * t1 * t2 * c + (a * t1 * t2) ** 2
    return (t2 ** 2 * a ** 2 - 2 * a * t1 * t2 * c + t1 ** 2) / den, (1 - t1 ** 2) * (1 - t2 ** 2) * a / den

def lines_of(f, lo, hi, dips=True):
    """Resonances of a ring's response f between lo and hi: where it is, its depth (dB) against the
    highest point off resonance, and its full width at half that depth."""
    grid = np.linspace(lo, hi, 600001); y = f(grid); s = 1 if dips else -1
    out = []
    for i in range(1, len(grid) - 1):
        if s * y[i] < s * y[i - 1] and s * y[i] <= s * y[i + 1]:
            from scipy.optimize import minimize_scalar
            m = minimize_scalar(lambda x: s * float(f(np.array([x]))[0]), bracket=(grid[i - 1], grid[i], grid[i + 1]), tol=1e-14).x
            ext = float(f(np.array([m]))[0])
            base = float(np.max(y)) if dips else float(np.min(y))
            half = 0.5 * (ext + base)
            g = lambda x: float(f(np.array([x]))[0]) - half
            step = 1e-4
            xl = m - step
            while g(xl) * g(m) > 0: xl -= step
            xr = m + step
            while g(xr) * g(m) > 0: xr += step
            fw = brentq(g, m, xr, xtol=1e-14) - brentq(g, xl, m, xtol=1e-14)
            out.append({'at': m, 'T': ext, 'er_dB': 10 * math.log10(ext / base), 'fwhm': fw, 'Q': m / fw})
    return out

out = {'neff': NEFF, 'ng': NG, 'loss_dB_cm': LOSS, 'lams': lams.tolist()}

# ---------- closed forms ----------
# all-pass rings: 10% coupling, and near critical coupling (t = a)
L10 = 2 * math.pi * 10
a10 = 10 ** (-LOSS * L10 * 1e-4 / 20)
k_crit = round(1 - a10 ** 2 + 0.0003, 6)         # just over-coupled: a deep, finite dip
out['allpass'] = []
for k in (0.10, k_crit):
    T = allpass(lams, 10, k)
    L = lines_of(lambda x: allpass(x, 10, k), LINES[0], LINES[1])
    fsr = (L[-1]['at'] - L[0]['at']) / (len(L) - 1) if len(L) > 1 else None
    out['allpass'].append({'R_um': 10, 'kappa': k, 'span': LINES, 'T': r12(T), 'lines': L, 'fsr': fsr})
# add-drop: 10% and 10%, and 15% and 5%
out['adddrop'] = []
for k1, k2 in ((0.10, 0.10), (0.15, 0.05)):
    T, D = adddrop(lams, 10, k1, k2)
    out['adddrop'].append({'R_um': 10, 'kappa1': k1, 'kappa2': k2, 'through': r12(T), 'drop': r12(D)})

# Mach-Zehnder: two 50% couplers, arms of 100 and 300 um, lossy waveguide
def cpl(k):
    return np.array([[math.sqrt(1 - k), 1j * math.sqrt(k)], [1j * math.sqrt(k), math.sqrt(1 - k)]])
def arm(lam, L):
    return 10 ** (-LOSS * L * 1e-4 / 20) * np.exp(-1j * 2 * math.pi * nAt(lam) * L * 1e3 / lam)
def mzi(lam, L1, L2, extra=0.0):
    M = cpl(0.5) @ np.diag([arm(lam, L1) * np.exp(-1j * extra), arm(lam, L2)]) @ cpl(0.5)
    return abs(M[0, 0]) ** 2, abs(M[1, 0]) ** 2          # from input 1: bar (out 1), cross (out 2)
bar, cross = zip(*[mzi(l, 300, 100) for l in lams])
out['mzi'] = {'L1_um': 300, 'L2_um': 100, 'bar': r12(bar), 'cross': r12(cross)}
phases = list(range(0, 361, 15))
out['mzi_phase'] = {'L_um': 100, 'phases': phases, 'bar': r12([mzi(1550.0, 100, 100, p * math.pi / 180)[0] for p in phases]),
                    'cross': r12([mzi(1550.0, 100, 100, p * math.pi / 180)[1] for p in phases])}
# directional coupler: 30% at 1550 nm, 2%/nm, 0.5 dB
dl = np.round(np.linspace(1540, 1560, 41), 9)
aa = 10 ** (-0.5 / 10)
out['dc'] = {'kappa': 30, 'dkappa': 2, 'loss_dB': 0.5, 'lams': dl.tolist(), 'through': r12(aa * (1 - (0.30 + 0.02 * (dl - 1550)))), 'cross': r12(aa * (0.30 + 0.02 * (dl - 1550)))}

# ---------- SAX ----------
wl = jnp.asarray(lams / 1000.0)                    # um
def dc_model(wl=1.55, kappa=0.5, dkappa=0.0, loss_dB=0.0):
    k = kappa + dkappa * (wl * 1000 - 1550.0)
    a = 10 ** (-loss_dB / 20)
    t, x = a * jnp.sqrt(1 - k), -1j * a * jnp.sqrt(k)
    return sax.reciprocal({('in0', 'out0'): t + 0j, ('in1', 'out1'): t + 0j, ('in0', 'out1'): x, ('in1', 'out0'): x})
def mmi_model(wl=1.55, loss_dB=0.2):
    a = 10 ** (-loss_dB / 20) / math.sqrt(2) * jnp.ones_like(wl)
    return sax.reciprocal({('in0', 'out0'): a + 0j, ('in0', 'out1'): a + 0j})
def ps_model(wl=1.55, length=100.0, phase_deg=0.0):
    s = sax.models.straight(wl=wl, wl0=1.55, neff=NEFF, ng=NG, length=length, loss_dB_cm=LOSS)
    return {k: v * jnp.exp(1j * phase_deg * math.pi / 180) for k, v in s.items()}
def wg(length):
    return {'component': 'straight', 'settings': {'wl0': 1.55, 'neff': NEFF, 'ng': NG, 'length': length, 'loss_dB_cm': LOSS}}
models = {'straight': sax.models.straight, 'dc': dc_model, 'mmi': mmi_model, 'ps': ps_model}

ring_ap = {
    'instances': {'c': {'component': 'dc', 'settings': {'kappa': 0.10}}, 'loop': wg(2 * math.pi * 10)},
    'connections': {'c,out1': 'loop,in0', 'loop,out0': 'c,in1'},
    'ports': {'in0': 'c,in0', 'out0': 'c,out0'},
}
ring_ap_model, _ = sax.circuit(ring_ap, models=models)
models['ring'] = ring_ap_model
netA = {
    'instances': {'split': 'mmi', 'wA': wg(400.0), 'ring': 'ring', 'wB': wg(100.0),
                  'ps': {'component': 'ps', 'settings': {'length': 100.0, 'phase_deg': 60.0}},
                  'join': {'component': 'dc', 'settings': {'kappa': 0.5, 'dkappa': 0.01}}},
    'connections': {'split,out0': 'wA,in0', 'wA,out0': 'ring,in0', 'ring,out0': 'join,in0',
                    'split,out1': 'wB,in0', 'wB,out0': 'ps,in0', 'ps,out0': 'join,in1'},
    'ports': {'in': 'split,in0', 'o1': 'join,out0', 'o2': 'join,out1'},
}
fA, _ = sax.circuit(netA, models=models)
SA = fA(wl=wl)
out['saxA'] = {'o1': r12(np.abs(np.asarray(SA['in', 'o1'])) ** 2), 'o2': r12(np.abs(np.asarray(SA['in', 'o2'])) ** 2)}

R20 = 20.0
netB = {
    'instances': {'c1': {'component': 'dc', 'settings': {'kappa': 0.15}}, 'c2': {'component': 'dc', 'settings': {'kappa': 0.05}},
                  'h1': wg(math.pi * R20), 'h2': wg(math.pi * R20)},
    # the ring leaves the first coupler at out1, runs half round into the second at in1; leaves
    # that at out1 and runs back to the first's in1. add at c2 in0, drop at c2 out0
    'connections': {'c1,out1': 'h1,in0', 'h1,out0': 'c2,in1', 'c2,out1': 'h2,in0', 'h2,out0': 'c1,in1'},
    'ports': {'in': 'c1,in0', 'through': 'c1,out0', 'add': 'c2,in0', 'drop': 'c2,out0'},
}
fB, _ = sax.circuit(netB, models=models)
SB = fB(wl=wl)
out['saxB'] = {'R_um': R20, 'kappa1': 0.15, 'kappa2': 0.05, 'through': r12(np.abs(np.asarray(SB['in', 'through'])) ** 2), 'drop': r12(np.abs(np.asarray(SB['in', 'drop'])) ** 2)}
out['sax_version'] = sax.__version__

# check the closed form of B against SAX here too, as a sanity check of the netlist
Tb, Db = adddrop(lams, R20, 0.15, 0.05)
print('SAX B against closed form: through %.2e, drop %.2e' % (np.max(np.abs(Tb - out['saxB']['through'])), np.max(np.abs(Db - out['saxB']['drop']))))
for c in out['allpass']:
    print('all-pass kappa %.4f: %d lines, FSR %.6f nm' % (c['kappa'], len(c['lines']), c['fsr'] or 0), [('%.5f' % q['at'], '%.2f dB' % q['er_dB'], '%.5f nm' % q['fwhm'], '%.0f' % q['Q']) for q in c['lines']])

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ref', 'photonic-circuits.json')
with open(path, 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print('wrote', os.path.normpath(path), os.path.getsize(path), 'bytes')
