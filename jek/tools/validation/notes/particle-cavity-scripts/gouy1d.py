# E1: the focal-line count of the solid-angle weight, against a direct numerical Fresnel propagation in one transverse
# dimension. A narrow source (a Gaussian a few wavelengths wide, standing for a point) is carried through free space and
# thin lenses by the paraxial transfer function on a grid (FFT; nothing closed-form about the answer), and its field on
# the axis at the end is set against
#   (a) the point-source propagator with Gouy's quarter turn per focal line passed:  S e^{-i pi/4} (-i)^mu / sqrt(lambda |B|)
#   (b) the sum over directions with the weight:  -i X Int G(theta) e^{-ik B D theta^2/2} dtheta,
#       X = sqrt|D| (-i)^kappa, kappa = mu - [B D > 0]  =  (focal lines on the finished stretches) - (virtual ones of the last)
# (lengths in wavelengths; e^{ikL} left out of all three)
import numpy as np
lam = 1.0
k = 2 * np.pi / lam
N, dx = 2 ** 19, 0.25
x = (np.arange(N) - N // 2) * dx
fx = np.fft.fftfreq(N, dx)
w0 = 6.4                                  # the source: a Gaussian, half-angle lam / (pi w0) = 0.05
u0 = np.exp(-x ** 2 / w0 ** 2)
S = np.sum(u0) * dx
tha = lam / (np.pi * w0)
G0 = S / lam                              # its spectrum G(theta) = G0 exp(-theta^2 / tha^2): u0(x) = Int G e^{ik theta x} dtheta
def free(u, d):
    return np.fft.ifft(np.fft.fft(u) * np.exp(-1j * np.pi * lam * d * fx ** 2))
def lens(u, f):
    return u * np.exp(-1j * k * x ** 2 / (2 * f))
def run(name, parts):
    """parts: ('d', length) or ('f', focal length) in turn"""
    u = u0.astype(complex)
    M = np.eye(2)
    mu, stretch_start = 0, None            # the state (B, D) at the start of the present free stretch
    finished, last = 0, None
    for kind, v in parts:
        if kind == 'd':
            B0, D0 = M[0, 1], M[1, 1]
            # B along this stretch: B0 + s D0, s in (0, v): a focal line where it is nought
            s_star = -B0 / D0 if D0 != 0 else np.inf
            inside = 0 < s_star < v
            last = dict(B0=B0, D0=D0, s_star=s_star, v=v, inside=inside)
            mu += int(inside)
            u = free(u, v)
            M = np.array([[1, v], [0, 1.0]]) @ M
        else:
            if last is not None:
                finished = mu
            u = lens(u, v)
            M = np.array([[1, 0], [-1 / v, 1.0]]) @ M
    A, B, C, D = M.ravel()
    num = u[N // 2]
    prop = S * np.exp(-1j * np.pi / 4) * (-1j) ** mu / np.sqrt(lam * abs(B))
    kappa = mu - int(B * D > 0)
    # the same count the other way: focal lines on the finished stretches, less the last stretch's virtual one (at or behind its start)
    kappa2 = finished - int(last['s_star'] <= 0)
    th = np.linspace(-8 * tha, 8 * tha, 400001)
    X = np.sqrt(abs(D)) * (-1j) ** kappa
    Q = -1j * X * np.sum(G0 * np.exp(-th ** 2 / tha ** 2) * np.exp(-1j * k * B * D * th ** 2 / 2)) * (th[1] - th[0])
    d = lambda a, b: (abs(a) / abs(b) - 1, np.angle(a / b))
    print('%-46s B %+9.0f D %+6.3f  focal lines %d  kappa %+d (%+d the other way)  numeric against the propagator: size %+.4f phase %+.4f rad; against the weighted sum: size %+.4f phase %+.4f rad'
          % (name, B, D, mu, kappa, kappa2, *d(num, prop), *d(num, Q)))
    assert kappa == kappa2
    return max(abs(d(num, prop)[0]), abs(d(num, Q)[0])), max(abs(d(num, prop)[1]), abs(d(num, Q)[1]))
worst = [0, 0]
for name, parts in [
    ('one lens, before its focus', [('d', 1e5), ('f', 5e4), ('d', 0.8e5)]),
    ('one lens, after its focus', [('d', 1e5), ('f', 5e4), ('d', 1.3e5)]),
    ('a weak lens: still spreading (virtual focus)', [('d', 1e5), ('f', 3e5), ('d', 1e5)]),
    ('a diverging lens', [('d', 1e5), ('f', -2e5), ('d', 0.6e5)]),
    ('two lenses, before the second focus', [('d', 1e5), ('f', 5e4), ('d', 2e5), ('f', 5e4), ('d', 0.7e5)]),
    ('two lenses, after the second focus', [('d', 1e5), ('f', 5e4), ('d', 2e5), ('f', 5e4), ('d', 1.4e5)]),
    ('two lenses, the second before the first focus', [('d', 1e5), ('f', 5e4), ('d', 0.5e5), ('f', 1e5), ('d', 0.2e5)]),
    ('the same, past its focus', [('d', 1e5), ('f', 5e4), ('d', 0.5e5), ('f', 1e5), ('d', 0.6e5)]),
    ('three lenses, two focal lines passed, spreading', [('d', 1e5), ('f', 5e4), ('d', 2e5), ('f', 5e4), ('d', 1.5e5), ('f', 2e5), ('d', 0.5e5)]),
]:
    a, b = run(name, parts)
    worst = [max(worst[0], a), max(worst[1], b)]
print('worst: size %.4f, phase %.4f rad' % tuple(worst))
