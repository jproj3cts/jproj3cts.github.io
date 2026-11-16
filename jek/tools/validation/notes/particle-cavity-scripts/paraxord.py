# Round 6: how the dipole's returned field (alpha B, 50 nm silica dipole at the waist of a symmetric cavity locked on TEM00)
# builds up with the transverse order kept, paraxial modes, and what the paraxial ray sum with the rims gives for all orders.
# python3 paraxord.py <R mm> <L mm> <mirror diameter mm> <reflectance> [phase of b/f]
import sys
import numpy as np
S_ = '../../../../../jek/tools/validation/scripts'
sys.path.insert(0, S_)
import scatter_cavity_degen as D
R, L, dia, Rp = (float(v) for v in sys.argv[1:5])
bfph = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0
R, L, a = R * 1e-3, L * 1e-3, dia * 0.5e-3
alpha = D.dipole_alpha(50e-9, complex(float(D.silica_index(1.55)), 0))
pre = alpha * D.K ** 2 / (4 * np.pi * D.EPS0)
zR = np.sqrt((L / 2) * (R - L / 2))
gam = 4 * np.arctan(zR / (L / 2))            # the round trip's Gouy phase per order... per radial order twice this
rho = np.sqrt(Rp)
# on resonance: TEM00's round trip real; the ray's is it with the Gouy phase taken off; the half trips split evenly, turned by bfph
lam = Rp * np.exp(-1j * gam)
h2 = rho * np.exp(-0.5j * gam + 1j * bfph); h1 = lam / h2
th0sq = D.LAM / (np.pi * zR)
thm = np.arctan2(a, L / 2 - (R - np.sqrt(R * R - a * a)))
Pm = np.sin(thm) ** 2 / (2 * th0sq)
print('R %.0f mm, L %.3f mm, mirrors %.1f mm, %.0f %%: zR %.3f mm, round-trip Gouy %.4f rad (mod 2 pi: %.4f), rim at %.4f rad = radial order %.1f (mode order %.0f); lambda L / zR^2 = %.2e'
      % (R * 1e3, L * 1e3, dia, Rp * 100, zR * 1e3, gam, (gam + np.pi) % (2 * np.pi) - np.pi, thm, Pm, 2 * Pm, D.LAM * L / zR ** 2))
g = lambda p: ((h1 + h2) * np.exp(1j * gam * (p + 0.5)) + 2 * h1 * h2 * np.exp(2j * gam * (p + 0.5))) / (1 - h1 * h2 * np.exp(2j * gam * (p + 0.5)))
pm = pre * (1j / D.LAM) * 2 * np.pi * th0sq
tot = 0j
shown = sorted(set([0, 3, 6, 10, 15, 20, 30, 50, int(Pm) - 1, int(Pm), int(Pm) + 1, int(2 * Pm)]))
for p in range(0, max(shown) + 1):
    tot += g(p)
    if p in shown:
        s = pm * tot
        print('  modes to order %4d: alpha B = %+.4e %+.4ej   E2-1 = %+.4e' % (2 * p, s.real, s.imag, 2 * s.real + abs(s) ** 2))
P = lambda t: np.array([[1, t], [0, 1.0]])
Mi = np.array([[1, 0], [-2 / R, 1.0]])
tot = 0j
for start in (1, 0):
    M = np.eye(2); amp = 1 + 0j; j = start; thm2 = np.sin(thm) ** 2
    for k in range(1, 200000):
        Mm = P(L / 2) @ M
        if abs(Mm[0, 1]) > 0:
            thm2 = min(thm2, (a / abs(Mm[0, 1])) ** 2)
        M = P(L / 2) @ Mi @ Mm
        amp *= (h2 if j == 1 else h1)
        beta = D.K * M[0, 1] * M[1, 1]
        c = -0.5j * beta
        I = np.pi * (thm2 - thm2 ** 2 / 4) if abs(beta) * thm2 < 1e-9 else np.pi * ((np.exp(c * thm2) - 1) / c - 0.5 * ((thm2 * np.exp(c * thm2)) / c - (np.exp(c * thm2) - 1) / c ** 2))
        tot += -(1j / D.LAM) * (-M[1, 1]) * (-1) ** k * amp * I
        j = 1 - j
        if abs(amp) < 1e-10:
            break
s = pre * tot
print('  paraxial rays, every order to the rims: alpha B = %+.4e %+.4ej   E2-1 = %+.4e' % (s.real, s.imag, 2 * s.real + abs(s) ** 2))
