"""Faraday filters and vapour in strong magnetic fields, from ElecSus.

ElecSus (M. A. Zentile et al., Comput. Phys. Commun. 189, 162 (2015);
https://github.com/jameskeaveney/ElecSus) finds each atomic state's energy and make-up in a
magnetic field by diagonalising the fine, hyperfine and Zeeman Hamiltonian, and from them the
susceptibility for each circular hand. Its Faraday-filter spectra were compared with
experiment in M. A. Zentile et al., J. Phys. B 48, 185001 (2015) and Opt. Lett. 40, 2000
(2015), and its strong-field (hyperfine Paschen-Back) spectra in L. Weller et al.,
J. Phys. B 45, 215005 (2012).

Light linearly polarised along x, a field along the light: the cell's own transmission S0,
and Iy, what a polariser crossed with the input passes (the Faraday filter). Three cases:
  - natural Rb, D2, 50 mm, 80 C, 100 G (a Faraday filter; JEKray2D's example);
  - natural Rb, D2, 2 mm, 120 C, 6000 G (the hyperfine Paschen-Back regime, as Weller et al.);
  - Cs, D2, 50 mm, 60 C, 200 G (a caesium Faraday filter at 852 nm).
Detuning from ElecSus's line centre v0; written as absolute frequencies.

    ELECSUS=/path/to/ElecSus python faraday_elecsus.py
"""
import json, os, sys, warnings
warnings.filterwarnings('ignore')
import numpy as np
ES = os.environ.get('ELECSUS', 'ElecSus')
sys.path.insert(0, os.path.join(ES, 'elecsus')); sys.path.insert(0, os.path.join(ES, 'elecsus', 'libs'))
import elecsus_methods as EM
import AtomConstants as AC

cases = []
for name, elem, line, L, T, B, span, step in (
        ('Rb Faraday filter', 'Rb', 'D2', 50e-3, 80.0, 100.0, 10000.0, 10.0),
        ('Rb, hyperfine Paschen-Back', 'Rb', 'D2', 2e-3, 120.0, 6000.0, 25000.0, 20.0),
        ('Cs Faraday filter', 'Cs', 'D2', 50e-3, 60.0, 200.0, 10000.0, 10.0)):
    det = np.arange(-span, span + 1e-9, step)
    p = {'Elem': elem, 'Dline': line, 'T': T, 'lcell': L, 'Bfield': B, 'Btheta': 0.0}
    if elem == 'Rb': p['rb85frac'] = 72.17
    S0, Iy = EM.calculate(det, [1, 0, 0], p, outputs=['S0', 'Iy'])
    tr = AC.RbD2Transition if elem == 'Rb' else AC.CsD2Transition
    v0 = tr.v0
    cases.append({'name': name, 'atom': elem, 'line': line, 'L_mm': L * 1e3, 'T': T, 'B_G': B, 'v0_Hz': v0,
                  'nu_Hz': [float(v0 + d * 1e6) for d in det], 'S0': [round(float(v), 6) for v in np.real(S0)], 'Iy': [round(float(v), 6) for v in np.real(Iy)]})
    enbw = float(np.sum(np.real(Iy)) * step / np.max(np.real(Iy)))
    cases[-1]['enbw_MHz'] = enbw
    print(name, 'peak Iy %.3f' % np.max(np.real(Iy)), 'ENBW %.0f MHz' % enbw, 'min S0 %.3f' % np.min(np.real(S0)))
out = {'source': 'ElecSus (Zentile et al. 2015): S0 and crossed-polariser Iy in a longitudinal field', 'cases': cases}
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'faraday-elecsus.json'), 'w'))
