"""Three closed forms every optics course starts from.

1. Fresnel's equations (A. Fresnel, 1823; any text, e.g. Born and Wolf, section 1.5): the
   power reflectance of a bare surface of index n for s and p light at incidence theta,
       Rs = |(cos t - n cos t') / (cos t + n cos t')|^2,  Rp = |(cos t' - n cos t) / (cos t' + n cos t)|^2,
   and Brewster's angle arctan n, where Rp vanishes. N-BK7 at 587.6 nm, its index from
   Schott's published Sellmeier coefficients.

2. The Fabry-Perot's Airy function (C. Fabry and A. Perot, Ann. Chim. Phys. 16, 115 (1899)):
   a lossless two-mirror cavity passes
       T = (1 - R1)(1 - R2) / (1 - 2 sqrt(R1 R2) cos psi + R1 R2)
   of mode-matched light, psi the round-trip phase from resonance. Mirrors of 90% and 95%,
   so the finesse is about 41.

3. The thin-lens transform of a Gaussian beam (S. A. Self, "Focusing of spherical Gaussian
   beams", Appl. Opt. 22, 658-661 (1983)): a waist w0 (Rayleigh range zR) at distance s
   before a lens of focal length f is imaged to a waist w0' at s' after it,
       s'/f = 1 + (s/f - 1) / ((s/f - 1)^2 + (zR/f)^2),   w0' = w0 / sqrt((1 - s/f)^2 + (zR/f)^2).
   1064 nm, f = 100 mm, w0 = 0.5 mm and 0.2 mm, s from 0 to 2000 mm.

    python fresnel_fp_self.py
"""
import json, math, os

out = {}
# 1. Fresnel
um = 0.5875618
B, C = (1.03961212, 0.231792344, 1.01046945), (0.00600069867, 0.0200179144, 103.560653)
n = math.sqrt(1 + sum(b * um ** 2 / (um ** 2 - c) for b, c in zip(B, C)))
rows = []
for deg in range(0, 90, 5):
    t = math.radians(deg); ct = math.cos(t); st = math.sin(t) / n; ct2 = math.sqrt(1 - st * st)
    rows.append({'deg': deg, 'Rs': ((ct - n * ct2) / (ct + n * ct2)) ** 2, 'Rp': ((ct2 - n * ct) / (ct2 + n * ct)) ** 2})
out['fresnel'] = {'glass': 'N-BK7', 'nm': 587.5618, 'n': n, 'brewster_deg': math.degrees(math.atan(n)), 'rows': rows}

# 2. Fabry-Perot
R1, R2 = 0.90, 0.95
r = math.sqrt(R1 * R2)
psis = [-0.3, -0.1, -0.05, -0.02, -0.01, 0.0, 0.01, 0.02, 0.05, 0.1, 0.3, 1.0, math.pi]
out['fabry_perot'] = {'R1': R1, 'R2': R2, 'finesse': math.pi * math.sqrt(r) / (1 - r),
                      'rows': [{'psi': p, 'T': (1 - R1) * (1 - R2) / (1 - 2 * r * math.cos(p) + r * r)} for p in psis]}

# 3. Self's lens transform
lam, f = 1064e-6, 100.0
rows = []
for w0 in (0.5, 0.2):
    zR = math.pi * w0 ** 2 / lam
    for s in (0.0, 100.0, 200.0, 500.0, 2000.0):
        a = s / f - 1
        sp = f * (1 + a / (a * a + (zR / f) ** 2))
        wp = w0 / math.sqrt(a * a + (zR / f) ** 2)
        rows.append({'w0_mm': w0, 's_mm': s, 'zR_mm': zR, 's_out_mm': sp, 'w0_out_mm': wp})
out['self'] = {'nm': 1064, 'f_mm': f, 'rows': rows}

json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'fresnel-fp-self.json'), 'w'), indent=1)
print('N-BK7 n = %.6f, Brewster %.4f deg; FP finesse %.2f; Self:' % (n, out['fresnel']['brewster_deg'], out['fabry_perot']['finesse']))
for q in rows: print('  w0 %.1f s %6.0f -> s\' %.3f w0\' %.5f' % (q['w0_mm'], q['s_mm'], q['s_out_mm'], q['w0_out_mm']))
