"""A one-dimensional optical lattice: a beam sent back on itself by a flat mirror at its waist.

R. Grimm, M. Weidemueller and Yu. B. Ovchinnikov, "Optical dipole traps for neutral atoms",
Adv. At. Mol. Opt. Phys. 42, 95-170 (2000), section 4.1 (the standing-wave trap). Two
counter-propagating beams of one laser, each of peak intensity I0 = 2P / (pi w^2), add as
fields to 4 I0 at an antinode, so the potential is
    U(r, z) = -U_lat cos^2(kz) exp(-2 r^2 / w^2),   U_lat = 4 alpha I0 / (2 eps0 c),
four times the single beam's depth, with trap frequencies
    across: sqrt(4 U_lat / (m w^2)),   along: k sqrt(2 U_lat / m).
alpha is Safronova, Arora and Clark's ground-state polarisability of rubidium at 1064 nm
(Phys. Rev. A 73, 022505 (2006), Table I: 686.9 atomic units, as in dipole_traps.py).

One watt at 1064.2915 nm (1064 nm in air), waist 100 um on a flat mirror; the atoms 2 mm in
front of it, where the beam's radius is w(z) = w0 sqrt(1 + (z/zR)^2).

    python lattice.py
"""
import json, math, os

H = 6.62607015e-34; KB = 1.380649e-23; EPS0 = 8.8541878128e-12; C = 299792458.0
AMU = 1.66053906660e-27
AU = 1.64877727436e-41                         # C^2 m^2 / J, the atomic unit of polarisability
M_RB87 = 86.909180527 * AMU
ALPHA_AU = 686.9                               # Safronova et al., Table I, Rb at 1064 nm
LAM = 1064.2915e-9                             # vacuum wavelength of 1064 nm in air
P, W0, D = 1.0, 100e-6, 2e-3

zR = math.pi * W0 ** 2 / LAM
w = W0 * math.sqrt(1 + (D / zR) ** 2)
I0 = 2 * P / (math.pi * w ** 2)
alpha = ALPHA_AU * AU
U1 = alpha * I0 / (2 * EPS0 * C)               # one beam's depth
U = 4 * U1
k = 2 * math.pi / LAM
f_r = math.sqrt(4 * U / (M_RB87 * w ** 2)) / (2 * math.pi)
f_z = k * math.sqrt(2 * U / M_RB87) / (2 * math.pi)
Erec = (H / LAM) ** 2 / (2 * M_RB87)
out = {'source': 'Grimm, Weidemueller and Ovchinnikov (2000), the standing-wave trap; alpha from Safronova, Arora and Clark (2006), Table I',
       'atom': 'Rb87', 'lam_vac_nm': LAM * 1e9, 'P_W': P, 'w0_um': W0 * 1e6, 'from_mirror_mm': D * 1e3, 'alpha_au': ALPHA_AU,
       'zR_mm': zR * 1e3, 'w_um': w * 1e6, 'single_depth_uK': U1 / KB * 1e6, 'depth_uK': U / KB * 1e6, 'depth_Erec': U / Erec,
       'f_radial_Hz': f_r, 'f_axial_Hz': f_z}
print(out)
with open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'lattice.json'), 'w') as f:
    json.dump(out, f, indent=1)
