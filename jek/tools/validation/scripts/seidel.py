"""Seidel's aberration sums for a singlet and a Cooke triplet, and the Strehl ratio.

W. T. Welford, Aberrations of Optical Systems (Adam Hilger, 1986), chapter 8: from a paraxial
marginal ray (y, u) and chief ray (yb, ub) traced through surfaces of curvature c between
media n and n', with A = n (u + y c), Ab = n (ub + yb c) (the refraction invariants), the
Lagrange invariant H = n (ub y - u yb) and D(u/n) = u'/n' - u/n, each surface adds
    S_I   = -A^2 y D(u/n)          S_II = -A Ab y D(u/n)       S_III = -Ab^2 y D(u/n)
    S_IV  = -H^2 c D(1/n)          S_V  = (Ab / A) (S_III + S_IV),
and the wavefront at the edge of the field (H = 1) and of the pupil (rho = 1), the pupil and
the image height measured the same way, is
    W040 = S_I / 8,  W131 = S_II / 2,  W22T = (3 S_III + S_IV) / 4 (tangential),  W311 = S_V / 2.

Two systems, each with its stop a plane of its own and its entrance pupil filled:
  1. Thorlabs LA1509's prescription (R 51.5 mm, 3.6 mm of N-BK7, Optiland's index), curved side
     first, the stop 10 mm in front of it, a 10 mm pupil (f/10), fields to 4 degrees, 587.56 nm;
  2. Optiland's Cooke triplet sample (SK16, F2, SK16; the glasses as Optiland's indices at
     550 nm), its stop moved 1 mm ahead of the flint's first vertex (JEKray2D's stop is an
     element of its own and cannot sit on a curved surface), a 6 mm pupil (f/8.3), fields to 8
     degrees, at 550 nm.
The image plane is the paraxial one, where Seidel's terms are defined.

Seidel's terms are the third order alone; JEKray2D's Aberrations tab fits the real rays'
wavefront, which carries the higher orders too. How much, at these apertures and fields, is
found here by tracing real meridional rays exactly (Snell's law at each sphere) and fitting
their wavefront: a fan square to each field's direction, its middle ray through the stop's
centre, the optical path to a sphere about where the chief ray lands through the paraxial exit
pupil, a power series to rho^4 at each of seven fields and then across the field (spherical as
H^0 and H^2, coma as H and H^3, the rho^2 term as H^0, H^2 and H^4), and the distortion from
the chief rays' heights against f tan(theta). At a tenth of the aperture and field this gives
back the third-order sums to a few parts in 10^4, which checks both. (Optiland's own
third-order sums and wavefront fans were tried first and set aside: they agree with neither.)

The Strehl ratio on axis: Marechal's exp(-(2 pi sigma)^2), sigma the rms wavefront error about
the best focus, for the singlet at f/7.7 (a 13 mm pupil), where it is near 0.85. For
spherical aberration over a round pupil, W040 rho^4 balanced by defocus leaves
sigma = W040 / (6 sqrt 5). The exact Strehl, the pupil integral of the real wavefront at its
best focus, is given too.

    python seidel.py
"""
import json, math, os, warnings
import numpy as np
warnings.filterwarnings('ignore')
from optiland import optic
from optiland.samples.objectives import CookeTriplet
from scipy.optimize import brentq

def welford(surfs, stop_at, epd, field_deg):
    """surfs: list of (z, c, n_after) from the first surface, starting in air (n = 1); the stop
    a plane at z = stop_at (in air). Returns the sums, the paraxial focus past the last surface
    and the focal length."""
    # the stop as a plane surface in the list
    S = sorted(surfs + [(stop_at, 0.0, None)], key=lambda s: s[0])
    nlist = []
    n = 1.0
    for z, c, na in S:
        nlist.append((z, c, n, n if na is None else na)); n = n if na is None else na
    def trace(y0, u0, z0):
        rays = []; y, u, z = y0, u0, z0
        for zs, c, n1, n2 in nlist:
            y = y + u * (zs - z); z = zs
            u2 = (n1 * u - y * c * (n2 - n1)) / n2
            rays.append((y, u, u2)); u = u2
        return rays, y, u
    # the chief ray: through the stop's centre at the field angle; find where it starts
    ub0 = math.tan(math.radians(field_deg))
    def chief(yb0):
        r, _, _ = trace(yb0, ub0, nlist[0][0])
        k = [i for i, s in enumerate(nlist) if s[0] == stop_at and s[2] == s[3] and s[1] == 0][0]
        return r[k][0]
    a0 = chief(0.0); a1 = chief(1.0); yb0 = -a0 / (a1 - a0)
    # the marginal ray: its height at the stop is the stop's semi-diameter; the pupil is given
    # as the entrance pupil, so find the stop's size from it
    rm, _, _ = trace(epd / 2, 0.0, nlist[0][0])
    rc, _, _ = trace(yb0, ub0, nlist[0][0])
    Hl = 1.0 * (ub0 * rm[0][0] - 0.0 * rc[0][0])            # n (ub y - u yb) in object space
    sums = np.zeros(5); per = []
    for (zs, c, n1, n2), (y, u, u2), (yb, ub, ub2) in zip(nlist, rm, rc):
        A = n1 * (u + y * c); Ab = n1 * (ub + yb * c)
        d = u2 / n2 - u / n1
        s1 = -A * A * y * d; s2 = -A * Ab * y * d; s3 = -Ab * Ab * y * d
        s4 = -Hl * Hl * c * (1 / n2 - 1 / n1)
        s5 = (Ab / A) * (s3 + s4) if A != 0 else 0.0
        per.append([s1, s2, s3, s4, s5]); sums += [s1, s2, s3, s4, s5]
    # paraxial focus of the marginal ray past the last surface
    _, y, u = trace(epd / 2, 0.0, nlist[0][0])
    bfl = -y / u
    efl = (epd / 2) / -u
    return sums, np.array(per), bfl, efl, yb0


def trace_ray(surfs, z0, y0, th, zimg):
    """exact meridional ray from (z0, y0) at angle th (to +z); surfs (z, c, n_after), air first.
    Returns the list of points, direction, OPL up to the image plane z = zimg"""
    z, y = z0, y0; L, M = math.cos(th), math.sin(th); n = 1.0; opl = 0.0
    for zs, c, n2 in surfs:
        if c == 0:
            t = (zs - z) / L
            pz, py = z + t * L, y + t * M
            nz, ny = 1.0, 0.0
        else:
            R = 1 / c; cz = zs + R            # centre of curvature
            # |P - C|^2 = R^2, P = (z,y) + t (L,M)
            dz, dy = z - cz, y
            b = dz * L + dy * M; cc = dz * dz + dy * dy - R * R
            disc = b * b - cc
            if disc < 0: return None
            t = -b - math.copysign(math.sqrt(disc), R) * (-1)  # intersection nearer the vertex
            t1, t2 = -b - math.sqrt(disc), -b + math.sqrt(disc)
            pz1, pz2 = z + t1 * L, z + t2 * L
            t = t1 if abs(pz1 - zs) < abs(pz2 - zs) else t2
            pz, py = z + t * L, y + t * M
            nz, ny = (pz - cz) / R, py / R     # unit normal pointing to +z at the vertex... sign fixed below
            if nz < 0: nz, ny = -nz, -ny
        opl += n * t
        if n2 is not None and n2 != n:
            # Snell: k' = mu k + g nrm, with nrm pointing along +z
            mu = n / n2; ci = L * nz + M * ny
            k2 = 1 - mu * mu * (1 - ci * ci)
            if k2 < 0: return None
            g = math.sqrt(k2) - mu * ci
            L, M = mu * L + g * nz, mu * M + g * ny
            n = n2
        z, y = pz, py
    return z, y, L, M, opl, n

def real_fit(surfs, stop_at, epd, field_deg, bfl, efl, xp, nF=7, nR=61, lam=None):
    """xp: the paraxial exit pupil's z (the reference sphere passes through it on the chief ray)"""
    S = sorted(surfs + [(stop_at, 0.0, None)], key=lambda s: s[0])
    zlast = surfs[-1][0]; zimg = zlast + bfl; z0 = S[0][0] - 20.0
    def to_image(y0, th):
        r = trace_ray(S, z0, y0, th, zimg)
        z, y, L, M, opl, n = r
        t = (zimg - z) / L
        return y + t * M, opl + n * t, (z, y, L, M, n, opl)
    def at_stop(y0, th):
        r = trace_ray([s for s in S if s[0] <= stop_at], z0, y0, th, None)
        return r[1] + (stop_at - r[0]) * r[3] / r[2]
    Hs = np.linspace(-1, 1, nF); polys = []; dist = []; axis = None
    for H in Hs:
        th = math.radians(H * field_deg)
        yc0 = brentq(lambda y0: at_stop(y0, th), -8, 8)        # chief ray through the stop's centre
        yimg_c, opl_c, stc = to_image(yc0, th)
        P = np.array([zimg, yimg_c])
        # fan: across the direction, the tool's way: rays evenly across EPD, square to the direction
        s = np.linspace(-epd / 2, epd / 2, nR)
        rho, W = [], []
        # reference sphere: centred on the chief ray's image point, radius to the exit pupil along the chief ray
        zc, ycc, Lc, Mc, nc, oc = stc
        # chief ray point at the exit pupil plane
        tq = (xp - zc) / Lc; Q = np.array([xp, ycc + tq * Mc]); Rref = np.linalg.norm(P - Q)
        oplQ = oc + nc * tq
        for si in s:
            y0 = yc0 + si / math.cos(th)
            z, y, L, M, n, opl = to_image(y0, th)[2]
            # point on the sphere |X - P| = Rref, X = (z,y) + t (L,M), the one on the pupil side
            d = np.array([z, y]) - P; b = d[0] * L + d[1] * M; cc = d @ d - Rref ** 2
            t = -b - math.sqrt(b * b - cc)
            X = np.array([z + t * L, y + t * M])
            W.append((oplQ - (opl + n * t + (y0 - yc0) * math.sin(th))) / lam)             # ahead of the sphere: positive
            u = (X - P) / Rref; uc = (Q - P) / Rref
            rho.append(u[0] * uc[1] - u[1] * uc[0])        # across the chief ray, +y up
        rho = np.array(rho); rho /= np.abs(rho).max()
        polys.append(np.polyfit(rho, np.array(W), 4)[::-1])
        dist.append(yimg_c - efl * math.tan(th))
        if H == 0: axis = (rho, np.array(W))
    polys = np.array(polys)
    fitH = lambda col, pows: np.linalg.lstsq(np.array([[h ** p for p in pows] for h in Hs]), polys[:, col], rcond=None)[0]
    d3 = np.linalg.lstsq(np.array([[h ** p for p in (1, 3, 5)] for h in Hs]), np.array(dist), rcond=None)[0][1]
    W311 = -d3 * (epd / 2) / efl / lam                        # the chief ray off by -(1 / n'u') dW/drho
    return {'W040': fitH(4, [0, 2])[0], 'W131': fitH(3, [1, 3])[0], 'W22T': fitH(2, [0, 2, 4])[1], 'W311': W311, 'W020': fitH(2, [0, 2, 4])[0], 'axis': axis}

def exit_pupil(surfs, stop_at, yb0, field_deg):
    """the paraxial exit pupil: where the chief ray, after the last surface, crosses the axis"""
    S = sorted(surfs + [(stop_at, 0.0, None)], key=lambda s: s[0])
    y, u, z, n = yb0, math.tan(math.radians(field_deg)), S[0][0], 1.0
    for zs, c, n2 in S:
        y = y + u * (zs - z); z = zs; n2v = n if n2 is None else n2
        u = (n * u - y * c * (n2v - n)) / n2v; n = n2v
    return z - y / u

def main():
    out = {'systems': []}
    lam_s = 0.5875618
    probe = optic.Optic(); probe.surfaces.add(index=0, radius=np.inf, thickness=np.inf)
    probe.surfaces.add(index=1, radius=51.5, thickness=3.6, material='N-BK7'); probe.surfaces.add(index=2)
    nbk7 = float(np.ravel(probe.surfaces.surfaces[1].material_post.n(lam_s))[0])
    singlet = [(0.0, 1 / 51.5, nbk7), (3.6, 0.0, 1.0)]
    systems = [dict(name='Plano-convex singlet (LA1509), stop 10 mm ahead', surfs=singlet, stop=-10.0, epd=10.0, field=4.0, wl=lam_s,
                    glasses={'N-BK7': nbk7}, lens={'R': [51.5, None], 'gaps': [3.6], 'mat': ['N-BK7']})]
    ct = CookeTriplet()
    nSK16 = float(np.ravel(ct.surfaces.surfaces[1].material_post.n(0.55))[0]); nF2 = float(np.ravel(ct.surfaces.surfaces[3].material_post.n(0.55))[0])
    Rs = [22.01359, -435.76044, -22.21328, 20.29192, 79.68360, -18.39533]; gaps = [3.25896, 6.00755, 0.99997, 4.75041, 2.95208]
    zs = np.concatenate([[0.0], np.cumsum(gaps)])
    after = [nSK16, 1.0, nF2, 1.0, nSK16, 1.0]
    systems.append(dict(name='Cooke triplet (Optiland sample), stop 1 mm ahead of the flint', surfs=[(float(z), 1 / r, a) for z, r, a in zip(zs, Rs, after)],
                        stop=float(zs[2] - 1.0), epd=6.0, field=8.0, wl=0.55, glasses={'SK16': nSK16, 'F2': nF2},
                        lens={'R': Rs, 'gaps': gaps, 'mat': ['SK16', 'AIR', 'F2', 'AIR', 'SK16']}))
    for sy in systems:
        sums, per, bfl, efl, yb0 = welford(sy['surfs'], sy['stop'], sy['epd'], sy['field'])
        lam = sy['wl'] * 1e-3
        W = {'W040': sums[0] / 8 / lam, 'W131': sums[1] / 2 / lam, 'W22T': (3 * sums[2] + sums[3]) / 4 / lam, 'W311': sums[4] / 2 / lam}
        xp = exit_pupil(sy['surfs'], sy['stop'], yb0, sy['field'])
        r = real_fit(sy['surfs'], sy['stop'], sy['epd'], sy['field'], bfl, efl, xp, lam=lam)
        real = {k: float(r[k]) for k in W}
        # the same at a tenth of the aperture and field, where only the third order is left: the check on both
        rs = real_fit(sy['surfs'], sy['stop'], sy['epd'] / 10, sy['field'] / 10, *welford(sy['surfs'], sy['stop'], sy['epd'] / 10, sy['field'] / 10)[2:4],
                      exit_pupil(sy['surfs'], sy['stop'], welford(sy['surfs'], sy['stop'], sy['epd'] / 10, sy['field'] / 10)[4], sy['field'] / 10), lam=lam)
        small = {k: float(rs[k]) / W[k] / 1e-4 for k in W}         # every term goes as (aperture, field)^4
        print(sy['name'])
        print('  Welford S =', np.round(sums, 7), ' paraxial focus %.5f mm past the last vertex, f %.4f, exit pupil at z = %.3f' % (bfl, efl, xp))
        print('  third order, waves:', {k: round(v, 5) for k, v in W.items()})
        print('  real rays, fitted: ', {k: round(v, 5) for k, v in real.items()})
        print('  real rays at a tenth of the aperture and field, over the third order (should be 1):', {k: round(v, 5) for k, v in small.items()})
        sy.update({'sums': list(map(float, sums)), 'bfl': float(bfl), 'efl': float(efl), 'exit_pupil_z': float(xp), 'W': {k: float(v) for k, v in W.items()},
                   'real_fit': real, 'small_check': small, 'last_vertex': float(sy['surfs'][-1][0])})
        sy.pop('surfs')
        out['systems'].append(sy)
    # Marechal: the singlet at f/7.7 (a 13 mm pupil), on axis
    epd = 13.0
    sums, per, bfl, efl, yb0 = welford(singlet, -10.0, epd, 0.5)
    lam = lam_s * 1e-3; W040 = sums[0] / 8 / lam
    r = real_fit(singlet, -10.0, epd, 0.5, bfl, efl, exit_pupil(singlet, -10.0, yb0, 0.5), nF=3, nR=201, lam=lam)
    rho, Wm = r['axis']
    pr = np.polyfit(rho, Wm, 8)
    rr = np.linspace(0, 1, 4001); Wr = np.polyval(pr, rr); wts = rr * np.gradient(rr)
    def strehl(a2):
        return abs(np.sum(np.exp(2j * np.pi * (Wr - a2 * rr * rr)) * wts) / np.sum(wts)) ** 2
    from scipy.optimize import minimize_scalar
    best = minimize_scalar(lambda a: -strehl(a), bounds=(-5, 5), method='bounded')
    sig2d = W040 / (6 * math.sqrt(5)); sig1d = (8 / 35) * W040 / 3
    out['marechal'] = {'epd': epd, 'bfl': float(bfl), 'W040_seidel': float(W040), 'sigma_2d': float(sig2d), 'sigma_meridian': float(sig1d),
                       'strehl_marechal': math.exp(-(2 * math.pi * sig2d) ** 2), 'strehl_marechal_meridian': math.exp(-(2 * math.pi * sig1d) ** 2),
                       'strehl_exact_real': float(strehl(best.x))}
    print('Marechal, f/7.7 singlet:', out['marechal'])
    json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'seidel.json'), 'w'), indent=1)

main()
