"""Saturated-absorption (Lamb-dip) spectroscopy of rubidium 87: where the dips are, how wide.

Where: D. A. Steck, "Rubidium 87 D Line Data" (revision 2.3.3, 2024), Table 7 and Figure 2:
the 5P3/2 hyperfine levels F' = 3, 2, 1 lie +193.7407, -72.9112 and -229.8518 MHz from the
level's centre. A weak probe and a counter-propagating pump from one laser see a Lamb dip on
each F = 2 -> F' line, and a crossover halfway between each pair, where the pump and probe meet
one velocity class on two lines; six features in all, placed here relative to the F' = 3 dip.

How wide: W. Demtroeder, Laser Spectroscopy (Springer, 4th ed. 2008), vol. 1, section 7.2 and
vol. 2, section 2.2: a pump of saturation parameter s burns a Lorentzian hole of width
Gamma sqrt(1 + s) in the Doppler profile; the weak probe, itself of width Gamma, meets the hole
at twice the laser's detuning as both beams scan, so the dip in the laser's frequency is a
Lorentzian of full width at half maximum
    (Gamma + Gamma sqrt(1 + s)) / 2,
Gamma / 2 pi = 6.0666 MHz (Steck). For the closed F = 2 -> F' = 3 line, s = I / I_sat with
I_sat = 2.503 mW/cm^2, Steck's value for pi-polarised light on it (linearly polarised pump,
the axis along its polarisation). The pump in the case is 2 mm in radius and the probe 0.3 mm,
so the probe samples the pump's Gaussian at W^2 / (W^2 + w^2) = 0.978 of its peak on average;
that factor is in the s given.

    python sat_abs.py
"""
import json, math, os

lev = {3: 193.7407, 2: -72.9112, 1: -229.8518}          # MHz, 5P3/2 of Rb 87 (Steck)
D2 = 384230484.4685                                      # MHz, the D2 line's centre (Steck)
F2 = 2563.005979                                         # MHz, 5S1/2 F = 2 above the ground level's centre (Steck)
rel = {k: v - lev[3] for k, v in lev.items()}
features = [('F′ = 3', rel[3]), ('crossover 2/3', (rel[2] + rel[3]) / 2), ('crossover 1/3', (rel[1] + rel[3]) / 2),
            ('F′ = 2', rel[2]), ('crossover 1/2', (rel[1] + rel[2]) / 2), ('F′ = 1', rel[1])]
G = 6.0666                                               # MHz
Isat = 2.503                                             # mW/cm^2
W, w = 2.0, 0.3                                          # mm: the pump's and the probe's radius
ov = W * W / (W * W + w * w)
widths = []
for s in (0.2, 1.0, 5.0):
    I = s * Isat / ov                                    # the pump's peak intensity for s on the probe
    P = I * 1e-2 * math.pi * W * W / 2 / 0.5             # mW at the source, half of it reflected into the cell by the cube
    widths.append({'s': s, 'pump_peak_mW_cm2': I, 'pump_mW': P, 'fwhm_MHz': (G + G * math.sqrt(1 + s)) / 2})
out = {'Gamma_MHz': G, 'Isat_pi_mW_cm2': Isat, 'pump_w_mm': W, 'probe_w_mm': w, 'overlap': ov,
       'F2_F3_MHz': D2 + lev[3] - F2, 'features': [{'name': n, 'MHz': v} for n, v in features], 'widths': widths}
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'sat-abs.json'), 'w'), indent=1)
print('F = 2 -> F\' = 3 at %.4f MHz' % (D2 + lev[3] - F2))
for n, v in features: print('%-14s %9.3f MHz' % (n, v))
for r in widths: print('s = %.1f: pump %.3f mW, dip FWHM %.3f MHz' % (r['s'], r['pump_mW'], r['fwhm_MHz']))
