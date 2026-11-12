"""The grating equation: where each order goes, in Littrow, and the angular dispersion.

A grating of G lines per mm (period d = 1/G) in air sends order m along beta, with
    m lambda / d = sin alpha + sin beta              (reflection)
    m lambda / d = sin beta - sin alpha              (transmission)
alpha the incidence and beta the diffracted angle, both from the grating normal, counted
positive on the side the light comes from for reflection (so the zeroth order is the
mirror's, beta = -alpha) and on the far side, straight on, for transmission (as in Born and
Wolf, Principles of Optics, section 8.6.1, or Palmer's Diffraction Grating Handbook). An
order propagates while |sin beta| < 1. In Littrow the order returns along the light,
beta = alpha, so sin alpha = m lambda / (2 d). The angular dispersion, the spread a
spectrometer's camera mirror turns into distance (a Czerny-Turner's), is the equation
differentiated at fixed alpha:
    d beta / d lambda = m / (d cos beta).

    python grating_equation.py
"""
import json, math, os

def orders(mode, G, nm, a_deg):
    lam_d = nm * 1e-6 * G
    sa = math.sin(math.radians(a_deg))
    out = []
    for m in range(-40, 41):
        sb = m * lam_d - sa if mode == 'reflect' else m * lam_d + sa
        if abs(sb) < 1 - 1e-9:
            out.append({'m': m, 'beta_deg': math.degrees(math.asin(sb))})
    return out


cases = []
for mode, G, nms, alphas in [('reflect', 600, [400, 632.8, 1064], [0, 10, 30]),
                             ('reflect', 1200, [532, 800], [-20, 45]),
                             ('transmit', 300, [532, 1550], [0, 15])]:
    for nm in nms:
        for a in alphas:
            cases.append({'mode': mode, 'lpmm': G, 'nm': nm, 'alpha_deg': a, 'orders': orders(mode, G, nm, a)})

littrow = []
for G, nm, m in [(1200, 632.8, 1), (1800, 780.24, 1), (600, 1064, 2), (300, 1550, 3)]:
    a = math.degrees(math.asin(m * nm * 1e-6 * G / 2))
    littrow.append({'lpmm': G, 'nm': nm, 'm': m, 'alpha_deg': a})

disp = []
for G, nm, a, m in [(1200, 500, 20, 1), (1200, 800, 20, 1), (600, 633, 10, 1), (600, 633, 10, 2), (1800, 400, 30, 1)]:
    b = math.asin(m * nm * 1e-6 * G - math.sin(math.radians(a)))
    disp.append({'lpmm': G, 'nm': nm, 'alpha_deg': a, 'm': m, 'beta_deg': math.degrees(b),
                 'dbeta_dlambda_deg_per_nm': math.degrees(m * G * 1e-6 / math.cos(b))})

json.dump({'cases': cases, 'littrow': littrow, 'dispersion': disp},
          open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'grating-equation.json'), 'w'), indent=1)
print(sum(len(c['orders']) for c in cases), 'orders in', len(cases), 'settings')
for L in littrow: print('Littrow %d l/mm %.2f nm m=%d: %.5f deg' % (L['lpmm'], L['nm'], L['m'], L['alpha_deg']))
for D in disp: print('%d l/mm %.0f nm alpha %g m=%d: beta %.4f, %.6f deg/nm' % (D['lpmm'], D['nm'], D['alpha_deg'], D['m'], D['beta_deg'], D['dbeta_dlambda_deg_per_nm']))
