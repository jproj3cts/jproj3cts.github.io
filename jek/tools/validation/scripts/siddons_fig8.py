"""Measured transmission of natural rubidium on the D2 line, read from the vector drawing of
Figure 8 of P. Siddons, C. S. Adams, C. Ge and I. G. Hughes, "Absolute absorption on
rubidium D lines: comparison between theory and experiment", J. Phys. B 41, 155004 (2008),
arXiv:0805.1139: a 75 mm cell at 16.5, 25.0 and 36.6 degC, probe at I/Isat = 0.002 (the
weak-probe limit), detuning from the D2 line's weighted centre.

The measured curves are the figure's red paths; the axes are fixed from the plot's own tick
marks (transmission 0 to 1, detuning -4 to 5 GHz). The points are averaged in 20 MHz bins.

    python siddons_fig8.py siddons.pdf        (the arXiv PDF of 0805.1139)
"""
import json, os, sys
import pymupdf as fitz

page = fitz.open(sys.argv[1] if len(sys.argv) > 1 else 'siddons.pdf')[15]     # Figure 8
# the tick marks give the axes: transmission 0 and 1, detuning -4 and 5 GHz
Y0, Y1, X0, X1 = 292.21, 102.01, 127.96, 484.43
X = lambda x: -4 + 9 * (x - X0) / (X1 - X0)
Y = lambda y: (Y0 - y) / (Y0 - Y1)
runs, prev = [], None
for dr in page.get_drawings():
    col = tuple(round(c, 2) for c in dr['color']) if dr.get('color') else None
    pts = [p for it in dr['items'] if it[0] == 'l' for p in (it[1], it[2])]
    if col != (1.0, 0.0, 0.0) or len(pts) < 10:
        continue                      # the measured curves only (not the legend's swatch)
    x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
    if prev is None or x1 > prev + 50:
        runs.append([])               # each curve is drawn from right to left in pieces
    runs[-1].extend((X(p.x), Y(p.y)) for p in pts)
    prev = x0
# top to bottom in the figure: 16.5, 25.0, 36.6 degC; drawn 16.5, 36.6, 25.0
temps = [16.5, 36.6, 25.0]
out = {'source': 'Siddons et al., J. Phys. B 41, 155004 (2008), arXiv:0805.1139, Figure 8: measured D2 transmission, natural Rb, 75 mm cell, I/Isat = 0.002',
       'detuning_zero': "the D2 line's weighted centre, as ElecSus's (384230426.6 MHz; the data line up with ElecSus to within 5 MHz)",
       'v0_Hz': 384230426.6e6, 'cases': []}
for T, r in sorted(zip(temps, runs)):
    bins = {}
    for x, y in r:
        bins.setdefault(round(x / 0.02), []).append(y)
    ks = sorted(bins)
    out['cases'].append({'T': T, 'L_mm': 75.0, 'det_GHz': [round(k * 0.02, 4) for k in ks],
                         'T_trans': [round(sum(bins[k]) / len(bins[k]), 5) for k in ks]})
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'rb-siddons-2008.json'), 'w'))
for c in out['cases']: print(c['T'], len(c['det_GHz']), min(c['T_trans']))
