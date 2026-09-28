"""Ground-state polarisabilities of the alkali atoms, and the wavelengths where they vanish.

1. Table I of M. S. Safronova, B. Arora and C. W. Clark, "Frequency-dependent
   polarizabilities of alkali-metal atoms from ultraviolet through infrared spectral regions",
   Phys. Rev. A 73, 022505 (2006), arXiv:physics/0508087: the scalar polarisability (atomic
   units) of Na, K, Rb and Cs at the wavelengths used for traps, from a sum over states with
   measured and all-order matrix elements and the ion core's. Read from the arXiv PDF. The
   table gives each wavelength in air and its frequency in atomic units (to four figures);
   the vacuum wavelength is the air one times the index of standard air (Edlen 1966), which
   gives back the table's frequencies, and is precise enough near the lines, where the
   polarisability changes by per cent in a tenth of a nanometre. Rows at 600 nm and
   below are left out: there the transitions beyond the D lines (4s-5p of K at 404 nm, and
   so on) matter, and a trap model built on the D lines does not claim them.

2. Measured tune-out wavelengths, where the scalar polarisability between the D1 and D2
   lines is zero:
   - 87Rb: 790.032388(32) nm, R. H. Leonard, A. J. Fallon, C. A. Sackett and M. S. Safronova,
     Phys. Rev. A 92, 052501 (2015), arXiv:1507.07898 (atoms in F = 2; the scalar zero,
     tensor part removed).
   - 133Cs: 880.21790(41) nm, A. Ratkata et al., Phys. Rev. A 104, 052813 (2021),
     arXiv:2110.00043 (F = 3, mF = 3, linear light: the scalar zero).

3. Grimm, Weidemueller and Ovchinnikov, "Optical dipole traps for neutral atoms", Adv. At.
   Mol. Opt. Phys. 42, 95 (2000), arXiv:physics/9902072: a focused Gaussian beam of power P
   and waist w0 has peak intensity 2P / (pi w0^2), depth U0 = alpha I0 / (2 eps0 c) and, for
   an atom of mass m, trap frequencies sqrt(4 U0 / m w0^2) across and sqrt(2 U0 / m zR^2)
   along (their eq. 29 and 30's harmonic approximation). Worked out here for 87Rb in 1 W at
   1064 nm (Safronova's row) focused to 50 um, with Safronova's polarisability.

    python dipole_traps.py safronova.pdf        (the arXiv PDF of physics/0508087)
"""
import json, math, os, re, sys
import pymupdf as fitz

doc = fitz.open(sys.argv[1] if len(sys.argv) > 1 else 'safronova.pdf')
text = ''.join(p.get_text() for p in doc)
tab = text[text.index('TABLE I:'):text.index('TABLE II:')]
tok = tab[tab.index('Fr') + 2:].split()
atoms = ['Li', 'Na', 'K', 'Rb', 'Cs', 'Fr']
num = lambda s: float(re.match(r'-?[\d.]+', s).group(0))
unc = lambda s: float(re.search(r'\(([\d.]+)\)', s).group(1))
rows = []
i = 0
while i + 8 <= len(tok) and re.match(r'^\d+(\.\d+)?$', tok[i]):
    lam_air, w = float(tok[i]), float(tok[i + 1])
    vals = tok[i + 2:i + 8]
    rows.append({'lam_air_nm': lam_air, 'omega_au': w, **{a: num(v) for a, v in zip(atoms, vals)}, 'unc': {a: unc(v) for a, v in zip(atoms, vals)}})
    i += 8
assert len(rows) == 24, len(rows)

EH_HBAR = 4.134137333518e16          # the atomic unit of angular frequency, 1/s
C = 299792458.0
use = [r for r in rows if r['lam_air_nm'] >= 700]
def n_air(nm):                        # Edlen (1966), standard air (15 C, 101325 Pa)
    s2 = (1e3 / nm) ** 2
    return 1 + 1e-8 * (8342.13 + 2406030 / (130 - s2) + 15997 / (38.9 - s2))
for r in use:
    r['lam_vac_nm'] = round(r['lam_air_nm'] * n_air(r['lam_air_nm']), 4)
    w = 2 * math.pi * C / (r['lam_vac_nm'] * 1e-9) / EH_HBAR
    assert abs(w - r['omega_au']) <= 0.6e-5, (r['lam_air_nm'], w, r['omega_au'])

# Grimm's formulas for a 1064 nm trap, with Safronova's polarisability
EPS0, A0, KB, AMU = 8.8541878128e-12, 5.29177210903e-11, 1.380649e-23, 1.66053906660e-27
row = next(r for r in use if r['lam_air_nm'] == 1064)
P, w0, lam = 1.0, 50e-6, row['lam_vac_nm'] * 1e-9
alpha_si = 4 * math.pi * EPS0 * A0 ** 3 * row['Rb']
I0 = 2 * P / (math.pi * w0 ** 2)
U0 = alpha_si * I0 / (2 * EPS0 * C)
zR = math.pi * w0 ** 2 / lam
m = 86.909180527 * AMU
grimm = {'atom': 'Rb87', 'P_W': P, 'w0_um': w0 * 1e6, 'lam_vac_nm': row['lam_vac_nm'], 'alpha_au': row['Rb'],
         'I0_W_m2': I0, 'depth_uK': U0 / KB * 1e6, 'f_radial_Hz': math.sqrt(4 * U0 / (m * w0 ** 2)) / (2 * math.pi),
         'f_axial_Hz': math.sqrt(2 * U0 / (m * zR ** 2)) / (2 * math.pi), 'zR_mm': zR * 1e3}

out = {
    'source': 'Safronova, Arora and Clark, PRA 73, 022505 (2006), Table I; tune-out wavelengths measured by Leonard et al. (2015) and Ratkata et al. (2021); Grimm et al. (2000) trap formulas',
    'rows': [{k: r[k] for k in ('lam_air_nm', 'lam_vac_nm', 'omega_au', 'Na', 'K', 'Rb', 'Cs')} | {'unc': {a: r['unc'][a] for a in ('Na', 'K', 'Rb', 'Cs')}} for r in use],
    'tuneout': [
        {'atom': 'Rb87', 'F': 'hi', 'state': 'F = 2', 'nm': 790.032388, 'unc_nm': 0.000032, 'ref': 'Leonard et al., PRA 92, 052501 (2015)'},
        {'atom': 'Cs133', 'F': 'lo', 'state': 'F = 3', 'nm': 880.21790, 'unc_nm': 0.00041, 'ref': 'Ratkata et al., PRA 104, 052813 (2021)'},
    ],
    'grimm': grimm,
}
path = os.path.join(os.path.dirname(__file__), '..', 'ref', 'dipole-traps.json')
with open(path, 'w') as f:
    json.dump(out, f, indent=1)
print(len(use), 'rows;', json.dumps(grimm))
