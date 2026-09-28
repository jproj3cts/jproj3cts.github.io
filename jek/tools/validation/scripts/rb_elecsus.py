"""Reference transmission spectra of natural rubidium from ElecSus
(M. A. Zentile et al., Comput. Phys. Commun. 189, 162 (2015);
https://github.com/jameskeaveney/ElecSus), the Durham group's code, whose model was tested
against measured absolute absorption in P. Siddons et al., J. Phys. B 41, 155004 (2008).

Weak-probe transmission (no saturation, no field) of natural rubidium (72.17% 85Rb) in a
75 mm cell, as in Siddons et al., on the D2 line at 20 and 50 degC and the D1 line at 50 degC.
ElecSus gives detuning from its weighted line centre v0; the frequencies are written here
as absolute, so the comparison does not depend on either code's choice of zero.

Run with ElecSus on the path (see README.md in this folder).
"""
import json, os, sys, warnings
warnings.filterwarnings('ignore')
import numpy as np
ES = os.environ.get('ELECSUS', 'ElecSus')
sys.path.insert(0, os.path.join(ES, 'elecsus')); sys.path.insert(0, os.path.join(ES, 'elecsus', 'libs'))
import elecsus_methods as EM
import AtomConstants as AC

det = np.arange(-8000.0, 8000.0 + 1e-9, 20.0)          # MHz
cases = []
for line, T in (('D2', 20.0), ('D2', 50.0), ('D1', 50.0)):
    p = {'Elem': 'Rb', 'Dline': line, 'T': T, 'LCELL': 75e-3, 'Bfield': 0.0, 'rb85frac': 72.17}
    S0 = np.real(EM.calculate(det, [1, 0, 0], p, outputs=['S0'])[0])
    v0 = (AC.RbD2Transition if line == 'D2' else AC.RbD1Transition).v0
    cases.append({'line': line, 'T': T, 'L_mm': 75.0, 'rb85pct': 72.17, 'v0_Hz': v0,
                  'nu_Hz': [float(v0 + d * 1e6) for d in det], 'T_trans': [float(v) for v in S0]})
    print(line, T, float(S0.min()))
out = {'source': 'ElecSus (Zentile et al. 2015), weak-probe transmission of natural Rb, 75 mm cell', 'cases': cases}
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'rb-elecsus.json'), 'w'))
