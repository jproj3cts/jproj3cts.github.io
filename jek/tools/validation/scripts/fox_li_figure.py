"""Points read from Fox and Li's Figure 8: the power lost per transit by the dominant (TEM00)
mode of flat circular mirrors, against the Fresnel number N = a^2 / b lambda.

A. G. Fox and T. Li, "Resonant modes in a maser interferometer", Bell Syst. Tech. J. 40,
453-488 (1961), p. 466, from the scan at archive.org (identifier bstj40-2-453). The figure
is log-log; its axes are placed from the grid lines found in the scan itself (the decades of
N at x = 176.0, 409.5, 643.5, 878.5 px, of loss at y = 182.5, 416.5, 647.5, 880.5 px). Four
curves cross it: from the top, circular TEM10, infinite-strip odd, circular TEM00 and
infinite-strip even (in that order of loss: a strip's even mode loses least, a round mirror's
fundamental more, the strip's odd mode more still, the round TEM10 most). The third is read
where exactly four line-thick runs of dark pixels cross a column clear of grid lines and
labels, its centre taken; a line is about 8 px thick, some 4% in loss.

    python fox_li_figure.py fl13.png     (page 466 of the scan, the PDF's 14th page image)
"""
import json, math, os, sys
import numpy as np
from PIL import Image

im = np.array(Image.open(sys.argv[1] if len(sys.argv) > 1 else 'fl13.png').convert('L')).astype(float)
dark = im < 110
X = lambda N: 176.0 + (878.5 - 176.0) / 3 * math.log10(N / 0.1)
L = lambda y: 10 ** (2 - 3 * (y - 182.5) / (880.5 - 182.5))
hgrid = [182.5, 416.5, 647.5, 880.5]
vgrid = [176.0, 246.0, 409.5, 591.0, 643.5, 878.5]
def runs_at(x):
    col = dark[185:878, x - 1:x + 2].any(axis=1)
    rs, start = [], None
    for i, v in enumerate(col):
        if v and start is None: start = i + 185
        if (not v or i == len(col) - 1) and start is not None:
            rs.append((start, i + 184)); start = None
    return [(a + b) / 2 for a, b in rs if 5 <= b - a + 1 <= 14 and not any(abs((a + b) / 2 - g) < 4 for g in hgrid)]
# follow the curve column by column from a clean start (N = 1.2, where the four curves cross
# one column well apart and the third sits at y = 383.5), each step taking the run nearest
# where the line's own slope says it should be; columns on grid lines are stepped over
x0 = int(round(X(1.2))); track = {x0: 383.5}
for step in (1, -1):
    x, lastx, y, slope = x0, x0, 383.5, 1.0
    while 190 < x < 870:
        x += step
        if any(abs(x - g) < 3 for g in vgrid): continue
        pred = y + slope * (x - lastx)
        cand = [r for r in runs_at(x) if abs(r - pred) < 5]
        if not cand: continue
        y = min(cand, key=lambda r: abs(r - pred)); lastx = x; track[x] = y
        near = [k for k in track if abs(k - x) <= 40]
        if len(near) > 5:
            slope = np.polyfit(np.array(near, float), np.array([track[k] for k in near]), 1)[0]
xs = np.array(sorted(track), float); ys = np.array([track[k] for k in sorted(track)])
pts = []
for N in (0.4, 0.5, 0.6, 0.8, 1.0, 1.5, 2.0, 3.0, 5.0, 8.0, 12.0, 18.0):
    x = X(N)
    if x < xs[0] or x > xs[-1]: continue
    near = np.abs(xs - x) <= 6
    if near.sum() < 4: continue
    a, b = np.polyfit(xs[near], ys[near], 1)
    pts.append({'N': N, 'loss': round(L(a * x + b) / 100, 5)})
out = {'source': 'Fox and Li (1961), Fig. 8, circular plane mirrors, dominant (TEM00) mode, read from the archive.org scan', 'points': pts}
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'fox-li-figure.json'), 'w'), indent=1)
print(len(pts), 'points'); [print(p) for p in pts]
