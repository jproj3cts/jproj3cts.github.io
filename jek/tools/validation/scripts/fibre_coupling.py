"""Coupling a Gaussian beam into a single-mode fibre: offset, tilt, waist mismatch, axial offset.

The share of a Gaussian beam's power a single-mode fibre takes in is the squared overlap of
the beam's field with the fibre's mode, taken as a Gaussian of the 1/e^2 radius Marcuse's
formula gives (D. Marcuse, Bell Syst. Tech. J. 56, 703 (1977)):
    w = a (0.65 + 1.619 V^-1.5 + 2.879 V^-6),  V = 2 pi a NA / lambda.
For two Gaussians the overlap is a Gaussian integral, done here in closed form,
    int exp(-A x^2 + B x) dx = sqrt(pi / A) exp(B^2 / 4A),
separately across the bench plane and out of it; W. B. Joyce and B. C. DeLoach (Applied
Optics 23, 4187 (1984)) give the same closed forms for offset, tilt, waist mismatch and
axial separation. The beam meets the fibre's face at its waist (or a set distance past it);
a tilt of theta is taken on the face as it is: the beam's footprint x cos(theta) and its
phase k x sin(theta). The script checks the textbook limits (equal waists: offset
exp(-delta^2 / w^2), tilt exp(-(pi w theta / lambda)^2), axial 1 / (1 + (D / 2 zR)^2); a waist
mismatch alone (2 w1 w2 / (w1^2 + w2^2))^2).

The fibre: core 8.2 um, NA 0.14, at 1550 nm (V = 2.327).

    python fibre_coupling.py
"""
import json, math, os
import numpy as np

lam, core, NA = 1550e-6, 8.2e-3, 0.14            # mm
a = core / 2
V = 2 * math.pi * a * NA / lam
wf = a * (0.65 + 1.619 * V ** -1.5 + 2.879 * V ** -6)
k = 2 * math.pi / lam


def gint(A, B):
    return np.sqrt(math.pi / A) * np.exp(B * B / (4 * A))


def overlap1(wb, dz=0.0, off=0.0, tilt=0.0):
    """one axis: the fibre's mode exp(-x^2/wf^2) against the beam (waist wb, dz past its waist, centre off,
    tilted by tilt): |<beam, mode>|^2 over both norms"""
    c, s = math.cos(tilt), math.sin(tilt)
    qb = complex(dz, math.pi * wb * wb / lam)
    # the beam on the face: exp(-i k (c (x - off))^2 / (2 qb)) exp(-i k s (x - off)); as exp(-A x^2 + B x + C)
    Ab = 1j * k * c * c / (2 * qb)
    Bb = 2 * Ab * off - 1j * k * s
    Cb = -Ab * off * off + 1j * k * s * off
    Am = 1 / wf ** 2
    # <mode, beam> = int mode * beam (the mode is real)
    ov = gint(Ab + Am, Bb) * np.exp(Cb)
    nb = gint(2 * Ab.real, 2 * Bb.real) * np.exp(2 * Cb.real)
    nm = math.sqrt(math.pi / (2 * Am))
    return abs(ov) ** 2 / (nb * nm)


def eta(wb, dz=0.0, off=0.0, tilt=0.0):
    return overlap1(wb, dz, off, tilt) * overlap1(wb, dz)


# the textbook limits
zRf = math.pi * wf ** 2 / lam
for d in (0.5, 1.0, 2.0):
    assert abs(eta(wf, off=d * wf) - math.exp(-d * d)) < 1e-12
for th in (0.01, 0.03):
    assert abs(eta(wf, tilt=th) - math.exp(-(math.pi * wf * th / lam) ** 2)) < 1e-4      # small angles: equal to 2e-5 at 2 degrees
for D in (0.01, 0.05):
    assert abs(eta(wf, dz=D) - 1 / (1 + (D / (2 * zRf)) ** 2)) < 1e-12
for r in (0.5, 2.0):
    assert abs(eta(r * wf) - (2 * r / (1 + r * r)) ** 2) < 1e-12

rows = []
for d_um in (0, 1, 2, 3, 4, 6, 8):
    rows.append({'kind': 'offset', 'off_um': d_um, 'eta': float(eta(wf, off=d_um * 1e-3))})
for t in (0.5, 1.0, 1.5, 2.0):
    rows.append({'kind': 'tilt', 'tilt_deg': t, 'eta': float(eta(wf, tilt=math.radians(t))), 'small_angle': math.exp(-(math.pi * wf * math.radians(t) / lam) ** 2)})
for r in (0.5, 0.75, 1.5, 2.0):
    rows.append({'kind': 'waist', 'w0_um': 1e3 * r * wf, 'eta': float(eta(r * wf))})
for D_um in (20, 50, 100, 200):
    rows.append({'kind': 'axial', 'dz_um': D_um, 'eta': float(eta(wf, dz=D_um * 1e-3))})
# all four at once: the beam 2 um to one side of the fibre's axis and heading back towards it at 1 degree (as on the
# bench: the beam travels along +x at y = +2 um, the tip turned anticlockwise, so against the fibre's axis the beam runs
# towards -y); with a waist short of the face the sense of the tilt against the offset matters
rows.append({'kind': 'mixed', 'w0_um': 1e3 * 1.3 * wf, 'dz_um': 40, 'off_um': 2, 'tilt_deg': 1.0, 'eta': float(eta(1.3 * wf, dz=0.04, off=0.002, tilt=-math.radians(1.0))),
             'eta_tilted_away': float(eta(1.3 * wf, dz=0.04, off=0.002, tilt=math.radians(1.0)))})
out = {'lambda_nm': 1550, 'core_um': 8.2, 'na': NA, 'V': V, 'w_mode_um': 1e3 * wf, 'rows': rows}
with open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'fibre-coupling.json'), 'w') as fh:
    json.dump(out, fh, indent=1)
print('V = %.4f, mode 1/e^2 radius %.4f um' % (V, 1e3 * wf))
for r in rows: print(r)
