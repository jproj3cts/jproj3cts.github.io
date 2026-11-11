"""Makes src/core/font-data.js: the outlines JEKcad's sketch text is drawn with.

    pip install fonttools brotli skia-pathops
    python3 scripts/fonts.py [path to LiberationSerif-Regular.ttf]

Each font's Latin letters, their overlapping parts joined into one outline, as paths in the font's own units.
Source Sans 3 and IBM Plex Mono are the site's own files (jek/assets/fonts, SIL OFL 1.1); Liberation Serif is
Red Hat's (SIL OFL 1.1, jek/assets/fonts/LICENSE-liberation.txt), read from the system's copy."""
import json, os, sys
from fontTools.ttLib import TTFont
import pathops

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, '..', '..', '..', 'assets', 'fonts')
SERIF = sys.argv[1] if len(sys.argv) > 1 else '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'
FONTS = [
    ('sans', 'Sans semibold', os.path.join(SITE, 'source-sans-3-latin-600-normal.woff2')),
    ('regular', 'Sans', os.path.join(SITE, 'source-sans-3-latin-400-normal.woff2')),
    ('bold', 'Sans bold', os.path.join(SITE, 'source-sans-3-latin-700-normal.woff2')),
    ('italic', 'Sans italic', os.path.join(SITE, 'source-sans-3-latin-400-italic.woff2')),
    ('serif', 'Serif', SERIF),
    ('mono', 'Mono', os.path.join(SITE, 'ibm-plex-mono-latin-400-normal.woff2')),
]

def outlines(path):
    f = TTFont(path)
    cmap = f.getBestCmap()
    chars = [c for c in list(range(32, 127)) + list(range(161, 256)) if c in cmap]
    gs = f.getGlyphSet()
    out = {}
    for c in chars:
        # the letter as one outline: its parts joined, and a stroke that crosses itself (the 4's) made a ring and its hole
        path = pathops.Path()
        gs[cmap[c]].draw(pathops.PathPen(path, glyphSet=gs))
        segs = list(pathops.simplify(path, fix_winding=True, keep_starting_points=False).segments)
        d = []
        for op, args in segs:
            if op == 'moveTo':
                d += ['M'] + [round(v) for v in args[0]]
            elif op == 'lineTo':
                d += ['L'] + [round(v) for v in args[0]]
            elif op == 'qCurveTo':
                pts = list(args)
                if pts[-1] is None:
                    # a closed outline of steering points only: it goes through the middle of each pair of them
                    offs = pts[:-1]
                    mid = lambda p, q: ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
                    st = mid(offs[-1], offs[0])
                    d += ['M', round(st[0]), round(st[1])]
                    for i, c1 in enumerate(offs):
                        on = mid(c1, offs[(i + 1) % len(offs)])
                        d += ['Q', round(c1[0]), round(c1[1]), round(on[0]), round(on[1])]
                    d.append('Z')
                    continue
                for i in range(len(pts) - 1):
                    c1 = pts[i]
                    on = ((c1[0] + pts[i + 1][0]) / 2, (c1[1] + pts[i + 1][1]) / 2) if i < len(pts) - 2 else pts[-1]
                    d += ['Q', round(c1[0]), round(c1[1]), round(on[0]), round(on[1])]
            elif op == 'curveTo':
                d += ['C'] + [round(v) for p in args for v in p]
            elif op in ('closePath', 'endPath'):
                d.append('Z')
        out[chr(c)] = [round(gs[cmap[c]].width), ' '.join(str(x) for x in d)]
    cap = getattr(f['OS/2'], 'sCapHeight', 0) or round(f['head'].unitsPerEm * 0.7)
    return {'em': f['head'].unitsPerEm, 'cap': cap, 'glyphs': out}

parts = []
for key, name, path in FONTS:
    o = outlines(path)
    parts.append('  %s: { name: %s, em: %d, cap: %d, glyphs: %s },' % (key, json.dumps(name), o['em'], o['cap'], json.dumps(o['glyphs'], ensure_ascii=False, separators=(',', ':'))))
js = ("/* The outlines a sketch's text is drawn with (made by scripts/fonts.py; not edited by hand): each font's\n"
      "   characters, each its advance and its path (M, L, Q, C, Z in the font's units, em to the em; cap: the height of\n"
      "   a capital). Source Sans 3 (semibold, regular, bold, italic) and IBM Plex Mono are the site's own fonts, and\n"
      "   Liberation Serif is Red Hat's: all under the SIL Open Font License 1.1 (jek/assets/fonts/LICENSE-*.txt). */\n"
      "export const TEXT_FONTS = {\n" + '\n'.join(parts) + "\n};\n")
open(os.path.join(HERE, '..', 'src', 'core', 'font-data.js'), 'w').write(js)
print(len(js), 'bytes;', ', '.join(k for k, _, _ in FONTS))
