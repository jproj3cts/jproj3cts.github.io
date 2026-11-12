"""Polarisers and wave plates by Jones's calculus.

R. C. Jones, "A new calculus for the treatment of optical systems. I. Description and
discussion of the calculus", J. Opt. Soc. Am. 31, 488-493 (1941). Light is a vector
(E_p, E_s); an ideal linear polariser with its axis at theta (from p) is the projector
    P(theta) = [[c^2, c s], [c s, s^2]],
and a retarder of retardance Gamma (waves) with its fast axis at theta is
    W(theta) = R(-theta) diag(1, exp(2 pi i Gamma)) R(theta).
The power passed is |J E|^2 (unpolarised light: the mean over p and s, each half). This
gives Malus's law, cos^2 theta, the three-polariser sequence, and what a quarter- or
half-wave plate followed by a polariser passes. Every product is worked here as 2 x 2
complex matrices in numpy, and the closed forms beside them are checked.

    python jones_calculus.py
"""
import json, math, os
import numpy as np


def Rm(t):
    c, s = math.cos(t), math.sin(t)
    return np.array([[c, s], [-s, c]])


def pol(deg):
    t = math.radians(deg); c, s = math.cos(t), math.sin(t)
    return np.array([[c * c, c * s], [c * s, s * s]], complex)


def plate(deg, waves):
    t = math.radians(deg)
    return Rm(-t) @ np.diag([1, np.exp(2j * math.pi * waves)]) @ Rm(t)


def power(chain, inp):
    """chain: list of matrices in the order the light meets them; inp: 'p', 's', 'unpol' or an angle (deg) from p."""
    M = np.eye(2, dtype=complex)
    for J in chain: M = J @ M
    if inp == 'unpol':
        return 0.5 * (np.linalg.norm(M @ [1, 0]) ** 2 + np.linalg.norm(M @ [0, 1]) ** 2)
    a = math.radians({'p': 0, 's': 90}[inp] if isinstance(inp, str) else inp)
    return float(np.linalg.norm(M @ np.array([math.cos(a), math.sin(a)])) ** 2)


rows = []
def add(group, label, parts, inp, closed):
    chain = [pol(p['axis']) if p['type'] == 'polariser' else plate(p['axis'], p['retard']) for p in parts]
    T = power(chain, inp)
    assert abs(T - closed) < 1e-12, (label, T, closed)
    rows.append({'group': group, 'label': label, 'input': inp, 'parts': parts, 'T': T})

P = lambda a: {'type': 'polariser', 'axis': a}
W = lambda a, r: {'type': 'waveplate', 'axis': a, 'retard': r}
rad = math.radians
for th in range(0, 91, 15):
    add('malus', 'p light, polariser at %d°' % th, [P(th)], 'p', math.cos(rad(th)) ** 2)
for th in (0, 30, 45, 60, 90):
    add('malus2', 'unpolarised, polarisers at 0° and %d°' % th, [P(0), P(th)], 'unpol', 0.5 * math.cos(rad(th)) ** 2)
for th in (0, 22.5, 45, 67.5, 90):
    add('three', 'unpolarised, polarisers at 0°, %g° and 90°' % th, [P(0), P(th), P(90)], 'unpol', 0.125 * math.sin(rad(2 * th)) ** 2)
for th in (0, 15, 30, 45, 60, 75, 90):
    for ph in (0, 45, 90):
        c = math.cos(rad(th)) ** 2 * math.cos(rad(ph - th)) ** 2 + math.sin(rad(th)) ** 2 * math.sin(rad(ph - th)) ** 2
        add('qwp', 'p light, quarter-wave plate at %d°, polariser at %d°' % (th, ph), [W(th, 0.25), P(ph)], 'p', c)
for th in (0, 10, 22.5, 30, 45, 60):
    for ph in (0, 45, 90):
        add('hwp', 'p light, half-wave plate at %g°, polariser at %d°' % (th, ph), [W(th, 0.5), P(ph)], 'p', math.cos(rad(ph - 2 * th)) ** 2)
for ph in range(0, 180, 20):
    G, th = 0.3, 30
    c = math.cos(rad(th)) ** 2 * math.cos(rad(ph - th)) ** 2 + math.sin(rad(th)) ** 2 * math.sin(rad(ph - th)) ** 2 \
        - 2 * math.cos(2 * math.pi * G) * math.cos(rad(th)) * math.sin(rad(th)) * math.cos(rad(ph - th)) * math.sin(rad(ph - th))
    add('any', 'p light, 0.3-wave plate at 30°, polariser at %d°' % ph, [W(th, G), P(ph)], 'p', c)
# two quarter-wave plates: crossed they undo each other; parallel they make a half-wave plate
for ph in (0, 30, 90):
    add('pair', 'p light, quarter-wave plates at 45° and −45°, polariser at %d°' % ph, [W(45, 0.25), W(-45, 0.25), P(ph)], 'p', math.cos(rad(ph)) ** 2)
    add('pair', 'p light, quarter-wave plates both at 45°, polariser at %d°' % ph, [W(45, 0.25), W(45, 0.25), P(ph)], 'p', math.cos(rad(ph - 90)) ** 2)

json.dump({'rows': rows}, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'jones-calculus.json'), 'w'), indent=1)
print(len(rows), 'settings')
