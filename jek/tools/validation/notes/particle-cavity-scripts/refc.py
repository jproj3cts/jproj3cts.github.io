# The reference as committed in the worktree (with the solid-angle weight), a dipole case at given grids:
# python3 refc.py <bench json file (last line a case)> n=<grid>[,trips=<returns>] ...
import json, sys, time
import numpy as np
S_ = '../../../../../jek/tools/validation/scripts'
sys.path.insert(0, S_)
import scatter_cavity_degen as D
B0 = json.loads(open(sys.argv[1]).read().strip().splitlines()[-1])
alpha = D.dipole_alpha(50e-9, complex(float(D.silica_index(1.55)), 0))
pol = np.array([1.0, 0, 0])
for what in sys.argv[2:]:
    o = dict(kv.split('=') for kv in what.split(','))
    n, trips = int(o.get('n', 101)), int(o.get('trips', 450))
    cav = D.Cavity(B0['kind'], delta=B0.get('delta_m', 0.0), rp=B0.get('rp_m', (0, 0, 0)), Rp=B0.get('Rp', 0.9), a=B0.get('a_m', 2.5e-3))
    if B0.get('lam_how') == 'mode' and 'old' not in o:
        a2, lr = cav.lock_mode(complex(*B0['h2']), complex(*B0['ritz']), bf_mode=bool(B0.get('bf_mode')))
        print("   lock: the ray half trip %.5f rad (the bench b/f %.5f), round trip %.5f rad (JEKray %.5f); Gouy: mode half %.5f, mode round %.5f, the light itself half %.5f" % (np.angle(a2), np.angle(complex(*B0["h2"])), np.angle(lr), np.angle(complex(*B0["lam"])), *cav.gouy))
    else:
        cav.lock(complex(*B0['h2']) if B0.get('h2') else None, complex(*B0['lam']))
    t0 = time.time()
    Bt = cav.beta(n=n, trips=trips)
    E0 = (complex(*B0['f']) + complex(*B0['b'])) * pol
    p = np.linalg.solve(np.eye(3) - alpha * Bt, alpha * E0)
    Et = E0 + Bt @ p
    print('%s n %d : E2-1 %+.6e   alpha*B_xx %+.6e %+.6ej   %.0f s' % (sys.argv[1].split('/')[-1], n, np.sum(abs(Et) ** 2) / np.sum(abs(E0) ** 2) - 1, (alpha * Bt[0, 0]).real, (alpha * Bt[0, 0]).imag, time.time() - t0), flush=True)
