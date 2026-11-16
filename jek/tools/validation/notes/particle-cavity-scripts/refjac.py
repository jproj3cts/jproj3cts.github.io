# The reference's returns with the weight a return's change of solid angle asks for.
# As written (and as JEKray's pupil solve has it) a return is put down as A dOmega' = -(i/lambda) (-1)^(n-1) M F e^{ik phi} dOmega:
# the same solid angle coming back as went out. That holds where the cavity re-images exactly (dOmega' = dOmega). Short of
# that the n-th return's directions are spread or gathered, d' = D_n u about the axis (D_n = (-1)^n cos(n psi) for the
# paraxial cavity), energy asks |A|^2 dOmega' = |F|^2 dOmega, and the field at the particle is the sum with the weight
# -sqrt(D_mer) sqrt(D_sag) in place of (-1)^(n-1) (each a signed magnification of the direction, meridional and
# sagittal; a negative one's root is i times its size: a caustic passed). For a point source in a paraxial system this
# gives the textbook e^{ikL} / (i lambda B_n); without the weight it gives that over D_n.
# python3 refjac.py <bench json file> n=<grid>,trips=<returns>[,jac=0|1]
import json, sys, time
import numpy as np
S_ = '../../../../../jek/tools/validation/scripts'
sys.path.insert(0, S_)
import scatter_cavity_degen as D
B0 = json.loads(open(sys.argv[1]).read().strip().splitlines()[-1])
alpha = D.dipole_alpha(50e-9, complex(float(D.silica_index(1.55)), 0))
pol = np.array([1.0, 0, 0])
csq = lambda v: np.where(v >= 0, np.sqrt(np.abs(v)), 1j * np.sqrt(np.abs(v)))
for what in sys.argv[2:]:
    o = dict(kv.split('=') for kv in what.split(','))
    n, trips, jac = int(o.get('n', 101)), int(o.get('trips', 4500)), int(o.get('jac', 1))
    cav = D.Cavity(B0['kind'], delta=B0['delta_m'], rp=B0['rp_m'], Rp=B0.get('Rp', 0.9))
    cav.lock(complex(*B0['h2']), complex(*B0['lam']))
    t0 = time.time()
    U, W = D.cap_grid(cav.theta, n, cav)
    # a neighbour of each direction, a little further from the axis the same way (the axis itself: a little off it)
    eps = 1e-4
    perp = U[:, :2].copy()
    rr = np.linalg.norm(perp, axis=1)
    on = rr < 1e-9
    perp[on] = [1e-6, 0]; rr[on] = 1e-6
    U0 = U.copy(); U0[on, :2] = perp[on]; U0[:, 2] = np.sign(U[:, 2]) * np.sqrt(1 - np.sum(U0[:, :2] ** 2, 1))
    U1 = U0.copy(); U1[:, :2] = U0[:, :2] * (1 + eps); U1[:, 2] = np.sign(U[:, 2]) * np.sqrt(1 - np.sum(U1[:, :2] ** 2, 1))
    eh = perp / rr[:, None]
    Bt = np.zeros((3, 3), dtype=complex)
    Fm = D.K * D.K / (4 * np.pi * D.EPS0) * (np.eye(3)[None] - U[:, :, None] * U[:, None, :])
    g0, g1 = D.trace_returns(cav.m, cav.rp, U0, cav.pattern, trips), D.trace_returns(cav.m, cav.rp, U1, cav.pattern, trips)
    used, dax = 0, []
    for r, ((d, phi, amp, Mx, alive), (d1, _, _, _, alive1)) in enumerate(zip(g0, g1)):
        if jac:
            s0, s1 = np.sum(d[:, :2] * eh, 1), np.sum(d1[:, :2] * eh, 1)
            Dsag, Dmer = s0 / rr, (s1 - s0) / (eps * rr)
            X = -csq(Dsag) * csq(Dmer)
            dax.append(Dsag[np.argmin(rr)])
        else:
            X = (-1.0) ** r * np.ones(len(U))
        f = -(1j / D.LAM) * (X * amp * np.exp(1j * D.K * phi) * W * alive)[:, None, None] * np.einsum('nij,njk->nik', Mx, Fm)
        Bt += f.sum(0); used = r + 1
        if (np.max(np.abs(amp[alive])) < 1e-9) if alive.any() else True:
            break
    E0 = (complex(*B0['f']) + complex(*B0['b'])) * pol
    p = np.linalg.solve(np.eye(3) - alpha * Bt, alpha * E0)
    Et = E0 + Bt @ p
    print('n %d returns %d weight %s : E2-1 %+.6e   alpha*B_xx %+.6e %+.6ej   %.0f s' % (n, used, 'by the solid angle' if jac else 'as written', np.sum(abs(Et) ** 2) / np.sum(abs(E0) ** 2) - 1, (alpha * Bt[0, 0]).real, (alpha * Bt[0, 0]).imag, time.time() - t0), flush=True)
    if jac:
        print('   the axial magnification of the first returns:', ' '.join('%+.3f' % v for v in dax[:16]))
