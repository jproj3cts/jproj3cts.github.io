# A third, paraxial count for the 99 % cavity 50 um short of concentric: the dipole's returns summed mode by mode
# (the radial modes LG_p0, all alike on the axis at the waist), each with its own resonance factor, up to the order the
# rim lets through. alpha B = alpha (i/lambda) k^2/(4 pi eps0) 2 pi theta0^2 sum_p g_p,
# g_p = (H1 + H2 + 2 H1 H2) / (1 - H1 H2), H_j = h_j e^{i gamma (p + 1/2)}: h_j the axial ray's half trips (the lock's),
# gamma the Gouy phase a half trip adds per radial order (0.2 rad here).
import json, sys
import numpy as np
S_ = '../../../../../jek/tools/validation/scripts'
sys.path.insert(0, S_)
import scatter_cavity_degen as D
B0 = json.loads(open(sys.argv[1]).read().strip().splitlines()[-1])
alpha = D.dipole_alpha(50e-9, complex(float(D.silica_index(1.55)), 0))
Rm, L = 10e-3, 20e-3 - B0['delta_m']
zR = np.sqrt((L / 2) * (Rm - L / 2))
th0sq = D.LAM / (np.pi * zR)
cav = D.Cavity('concentric', delta=B0['delta_m'], rp=B0['rp_m'], Rp=B0.get('Rp', 0.9), a=B0.get('a_m', 2.5e-3))
# the axial ray's half trip and round trip, from the bench's field numbers (the reference's own lock)
h2, lam = cav.lock_mode(complex(*B0['h2']), complex(*B0['ritz']))
h1 = lam / h2
gamma = 4 * np.arctan(zR / (L / 2))
Pmax = np.sin(cav.theta) ** 2 / (2 * th0sq)
print('zR %.4f mm, theta0 %.5f, gamma %.5f rad, |h1| %.5f arg %.5f, |h2| %.5f arg %.5f, lam arg %.5f; the rim lets through radial orders up to about %.1f' % (zR * 1e3, np.sqrt(th0sq), gamma, abs(h1), np.angle(h1), abs(h2), np.angle(h2), np.angle(lam), Pmax))
pre = alpha * (1j / D.LAM) * D.K ** 2 / (4 * np.pi * D.EPS0) * 2 * np.pi * th0sq
def g(p):
    H1, H2 = h1 * np.exp(1j * gamma * (p + 0.5)), h2 * np.exp(1j * gamma * (p + 0.5))
    return (H1 + H2 + 2 * H1 * H2) / (1 - H1 * H2)
ps = np.arange(0, 200)
G = np.cumsum(g(ps))
print('TEM00 alone: alpha B = %+.4e %+.4ej' % ((pre * g(0)).real, (pre * g(0)).imag))
for P in sorted(set([0, 1, 2, 3, 6, 10, 20] + [int(Pmax) + k for k in (-4, -3, -2, -1, 0, 1, 2, 3, 4)] + [int(2 * Pmax)])):
    if P < 0: continue
    aB = pre * G[P]
    print('radial orders 0..%-3d (mode orders up to %3d): alpha B = %+.4e %+.4ej   E2-1 = 2 Re + |.|^2 = %+.4e' % (P, 2 * P, aB.real, aB.imag, 2 * aB.real + abs(aB) ** 2))
# a soft edge: the orders weighted down over a few orders about the rim's
for wdt in (1, 2, 4):
    wgt = 0.5 * (1 - np.tanh((ps - Pmax) / wdt))
    aB = pre * np.sum(wgt * g(ps))
    print('soft edge at %.1f, width %d orders: alpha B = %+.4e %+.4ej   E2-1 = %+.4e' % (Pmax, wdt, aB.real, aB.imag, 2 * aB.real + abs(aB) ** 2))
