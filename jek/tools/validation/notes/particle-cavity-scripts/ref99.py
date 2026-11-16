# The reference on the 99 % cavity, 50 um short of concentric: the change of |E|^2 at the dipole, and how it moves with the
# grid of directions, the returns followed, and the split of the lock between the mirrors (h2's phase)
# python3 ref99.py <bench json file> <what> ...   what: n=<grid>,trips=<returns>[,dh2=<rad added to h2's phase>]
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
    n, trips, dh2 = int(o.get('n', 301)), int(o.get('trips', 4500)), float(o.get('dh2', 0))
    cav = D.Cavity(B0['kind'], delta=B0['delta_m'], rp=B0['rp_m'], Rp=B0.get('Rp', 0.9))
    cav.trips = trips
    h2 = complex(*B0['h2']) * np.exp(1j * dh2)
    cav.lock(h2, complex(*B0['lam']))
    t0 = time.time()
    # the returns' sum, and how many were followed before they faded
    U, W = D.cap_grid(cav.theta, n, cav)
    Bt = np.zeros((3, 3), dtype=complex)
    Fm = D.K * D.K / (4 * np.pi * D.EPS0) * (np.eye(3)[None] - U[:, :, None] * U[:, None, :])
    used = 0
    for r, (d, phi, amp, Mx, alive) in enumerate(D.trace_returns(cav.m, cav.rp, U, cav.pattern, trips)):
        f = -(1j / D.LAM) * (-1) ** r * (amp * np.exp(1j * D.K * phi) * W * alive)[:, None, None] * np.einsum('nij,njk->nik', Mx, Fm)
        Bt += f.sum(0); used = r + 1
        if (np.max(np.abs(amp[alive])) < 1e-9) if alive.any() else True:
            break
    E0 = (complex(*B0['f']) + complex(*B0['b'])) * pol
    p = np.linalg.solve(np.eye(3) - alpha * Bt, alpha * E0)
    Et = E0 + Bt @ p
    print('n %d trips asked %d followed %d (alive at the end %d of %d, last amplitude %.1e) dh2 %+.3f : E2-1 %+.6e   alpha*B_xx %+.6e %+.6ej   %.0f s'
          % (n, trips, used, int(alive.sum()), len(alive), float(np.max(np.abs(amp[alive]))) if alive.any() else 0, dh2, np.sum(abs(Et) ** 2) / np.sum(abs(E0) ** 2) - 1, (alpha * Bt[0, 0]).real, (alpha * Bt[0, 0]).imag, time.time() - t0), flush=True)
