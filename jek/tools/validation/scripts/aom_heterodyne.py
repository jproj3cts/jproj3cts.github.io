"""An acousto-optic modulator: its Bragg angle, its frequency shift and its efficiency against drive.

Sound of frequency f travelling at v writes a moving grating of period Lambda = v / f. Light
meeting it at the Bragg angle, sin theta_B = lambda / (2 Lambda), is diffracted into the first
order, which leaves at +theta_B on the other side of the normal (the grating equation,
sin theta_1 = sin theta_0 + lambda / Lambda), and is shifted in frequency by +f: it took up a
phonon (B. E. A. Saleh and M. C. Teich, Fundamentals of Photonics, Wiley, the chapter on
acousto-optics; A. Yariv, Optical Electronics). In the Bragg regime the share diffracted
rises with the sound's amplitude as sin^2: with a drive voltage V proportional to that
amplitude, eta = sin^2(pi V / (2 V_sat)), V_sat the drive that sends it all into the order.

Heterodyne detection: two beams of powers P1 and P2 on one photodiode, one shifted by f,
give P1 + P2 + 2 sqrt(P1 P2) cos(2 pi f t + phase) (the fields' overlap one, as in a single-mode
fibre). Through an AOM twice, the light is shifted by 2f.

    python aom_heterodyne.py
"""
import json, math, os

bragg = []
for nm in [532, 780, 1064, 1550]:
    for mhz in [40, 80, 110, 200]:
        for v in [4200, 650]:
            lam_over_L = nm * 1e-9 * mhz * 1e6 / v
            th = math.degrees(math.asin(lam_over_L / 2))
            if lam_over_L / 2 < 1:
                bragg.append({'nm': nm, 'mhz': mhz, 'v': v, 'theta_B_deg': th,
                              'out_deg': math.degrees(math.asin(math.sin(math.radians(-th)) + lam_over_L))})
for b in bragg: assert abs(b['out_deg'] - b['theta_B_deg']) < 1e-12

# the fibre heterodyne: 1 mW split 50/50; one arm through the AOM (no loss), the other through 3 dB; joined
# 50/50: each reaches the diode with a quarter of its arm's power
P0 = 1.0
P1 = P0 / 2 / 2
P2 = P0 / 2 * 10 ** (-3 / 10) / 2
het = {'P1_mW': P1, 'P2_mW': P2, 'dc_mW': P1 + P2, 'beat_mW': 2 * math.sqrt(P1 * P2)}

drive = [{'V': V, 'eta': math.sin(math.pi * V / 2) ** 2} for V in [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1.0, 1.2, 1.5, 2.0]]

out = {'source': 'Bragg condition and grating equation; heterodyne beat 2 sqrt(P1 P2); Bragg-regime efficiency sin^2 (Saleh & Teich, Yariv)',
       'bragg': bragg, 'het': het, 'mhz': 80, 'drive': drive, 'vsat': 1.0}
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, '..', 'ref', 'aom-heterodyne.json'), 'w') as f:
    json.dump(out, f, indent=1)
print(len(bragg), 'Bragg angles; heterodyne', het)
