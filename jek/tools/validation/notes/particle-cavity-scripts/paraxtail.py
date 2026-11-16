# Round 6: the dipole's returns summed in the paraxial ray picture with the mirrors' rims (a closed form each return), for a
# dipole on the axis: alpha B, against the exact-ray reference. Also the same sum mode by mode to a given order (HG/LG on
# the axis: only the radial orders count), to see what the orders past it carry.
# python3 paraxtail.py <bench line file>
import json, sys
import numpy as np
S_ = '../../../../../jek/tools/validation/scripts'
sys.path.insert(0, S_)
import scatter_cavity_degen as D
B0 = json.loads(open(sys.argv[1]).read().strip().splitlines()[-1])
alpha = D.dipole_alpha(50e-9, complex(float(D.silica_index(1.55)), 0))
cav = D.Cavity('concentric', delta=B0['delta_m'], rp=B0['rp_m'], Rp=B0.get('Rp', 0.9), a=B0.get('a_m', 2.5e-3))
h2, lam = cav.lock_mode(complex(*B0['h2']), complex(*B0['ritz']), bf_mode=bool(B0.get('bf_mode')))
h1 = lam / h2
zp = cav.rp[2]
d = [zp - cav.m[0].z0, cav.m[1].z0 - zp]           # to the near mirror, to the far one
a_rim = cav.m[0].a
P = lambda t: np.array([[1, t], [0, 1.0]])
Mi = lambda m: np.array([[1, 0], [-2 * m.c, 1.0]])
pre = alpha * D.K ** 2 / (4 * np.pi * D.EPS0)
def returns(rim=True, kmax=4000):
    tot = 0j
    for start in (1, 0):                           # 1: towards the far mirror first
        M = np.eye(2); a = 1 + 0j; j = start; thm2 = np.inf
        for k in range(1, kmax + 1):
            Mm = P(d[j]) @ M                        # at the mirror
            if rim and abs(Mm[0, 1]) > 0:
                thm2 = min(thm2, (a_rim / abs(Mm[0, 1])) ** 2)
            M = P(d[j]) @ Mi(cav.m[j]) @ Mm
            a *= (h2 if j == 1 else h1)
            Bk, Dk = M[0, 1], M[1, 1]
            beta = D.K * Bk * Dk
            tm = min(thm2, np.sin(cav.theta) ** 2) if rim else 1e9
            if abs(beta) * tm < 1e-9:
                I = np.pi * (tm - tm * tm / 4)
            else:
                c = -0.5j * beta
                # pi Int_0^tm (1 - t/2) e^{c t} dt
                I = np.pi * ((np.exp(c * tm) - 1) / c - 0.5 * ((tm * np.exp(c * tm)) / c - (np.exp(c * tm) - 1) / c ** 2))
            X = -Dk
            tot += -(1j / D.LAM) * X * (-1) ** k * a * I
            j = 1 - j
            if abs(a) < 1e-10:
                break
    return pre * tot
aB = returns()
print('paraxial rays with the rims: alpha B = %+.4e %+.4ej   E2-1 = %+.4e' % (aB.real, aB.imag, 2 * aB.real + abs(aB) ** 2))
# mode by mode on the axis (particle at the waist only): radial orders 0..P
L = cav.m[1].z0 - cav.m[0].z0
zR = np.sqrt((L / 2) * (1 / cav.m[0].c - L / 2))
th0sq = D.LAM / (np.pi * zR)
gam = 4 * np.arctan(zR / (L / 2))
g = lambda p: ((h1 + h2) * np.exp(1j * gam * (p + 0.5)) + 2 * h1 * h2 * np.exp(2j * gam * (p + 0.5))) / (1 - h1 * h2 * np.exp(2j * gam * (p + 0.5)))
pm = pre * (1j / D.LAM) * 2 * np.pi * th0sq
for Pn in (0, 3, 6, 10, 15, 20, 30):
    s = pm * sum(g(p) for p in range(Pn + 1))
    print('modes to order %3d: alpha B = %+.4e %+.4ej   E2-1 = %+.4e;  with the rest from the rays: E2-1 = %+.4e' % (2 * Pn, s.real, s.imag, 2 * s.real + abs(s) ** 2, 2 * aB.real + abs(aB) ** 2))
print('round-trip Gouy %.4f rad, zR %.4f mm, the rim at radial order %.1f' % (gam, zR * 1e3, np.sin(cav.theta) ** 2 / (2 * th0sq)))
