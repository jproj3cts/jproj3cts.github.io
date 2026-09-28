"""Reference ray traces from Optiland (https://github.com/HarrisonKramer/optiland, v0.6),
an independent open-source lens design code, for three systems:

  1. a plano-convex singlet (R 51.5 mm, 3.6 mm of N-BK7: Thorlabs LA1509's prescription),
     curved side to the light, at 587.6 nm, with Optiland's own N-BK7 data;
  2. the same singlet flat side to the light;
  3. the Cooke triplet from Optiland's samples (SK16, F2, SK16; f 50 mm), at 550 nm, the
     glasses given to JEKray2D as the indices Optiland uses for them (JEKray2D's catalogue has
     no SK16), so the comparison is of the ray tracing alone.

For each: the effective and back focal lengths from a ray 1 um off the axis; where rays at
several heights cross the axis (longitudinal spherical aberration); and where a fan of rays
at a field angle meets a plane behind the lens. The fan starts exactly where JEKray2D's
collimated source puts its rays: evenly across its width, on the line through its centre
square to its direction, so both codes trace the same rays.
"""
import json, math, os, warnings
import numpy as np
warnings.filterwarnings('ignore')
from optiland import optic
from optiland.rays import RealRays
from optiland.samples.objectives import CookeTriplet

def singlet(flip):
    o = optic.Optic()
    o.surfaces.add(index=0, radius=np.inf, thickness=np.inf)
    if not flip:
        o.surfaces.add(index=1, radius=51.5, thickness=3.6, material='N-BK7')
        o.surfaces.add(index=2, radius=np.inf, thickness=100.0)
    else:
        o.surfaces.add(index=1, radius=np.inf, thickness=3.6, material='N-BK7')
        o.surfaces.add(index=2, radius=-51.5, thickness=100.0)
    o.surfaces.add(index=3)
    o.set_aperture(aperture_type='EPD', value=20)
    o.fields.set_type(field_type='angle'); o.fields.add(y=0)
    o.wavelengths.add(value=0.5875618, is_primary=True)
    return o

def trace(o, z0, y0, th_deg, wl):
    """rays from (z0, y0) at angle th to the axis; their position and direction after the
    last lens surface (Optiland's positions put the first vertex at z = 0)"""
    z0, y0 = np.asarray(z0, float), np.asarray(y0, float); n = len(z0); th = math.radians(th_deg)
    r = RealRays(x=np.zeros(n), y=y0, z=z0, L=np.zeros(n), M=np.full(n, math.sin(th)), N=np.full(n, math.cos(th)),
                 intensity=np.ones(n), wavelength=np.full(n, wl))
    sg = o.surfaces
    sg.trace(r, skip=1)
    k = sg.num_surfaces - 2                     # the last lens surface
    return np.ravel(sg.z[k]), np.ravel(sg.y[k]), np.ravel(sg.M[k]), np.ravel(sg.N[k])

def fan(src):
    """JEKray2D's collimated source: rays evenly across its width, square to its direction"""
    th = math.radians(src['angle']); n = src['rays']
    s = [-src['width'] / 2 + src['width'] * k / (n - 1) for k in range(n)]
    return [src['x'] - si * math.sin(th) for si in s], [src['y'] + si * math.cos(th) for si in s]

def system(name, o, wl, heights, fans, plane, glasses):
    pos = np.ravel(o.surfaces.positions)
    last = pos[-2]                              # z of the last lens surface's vertex
    first = pos[1]
    z, y, M, N = trace(o, [first - 10.0], [1e-3], 0.0, wl)
    efl = 1e-3 / (-M[0] / N[0])
    bfl = (z[0] + (-y[0]) * N[0] / M[0]) - last
    z, y, M, N = trace(o, [first - 10.0] * len(heights), heights, 0.0, wl)
    cross = [float(zz + (-yy) * nn / mm - last) for zz, yy, mm, nn in zip(z, y, M, N)]
    fans_out = []
    for src in fans:
        zs, ys = fan(src)
        z, y, M, N = trace(o, [first + v for v in zs], ys, src['angle'], wl)
        yp = [float(yy + (plane - (zz - last)) * mm / nn) for zz, yy, mm, nn in zip(z, y, M, N)]
        fans_out.append({'source': src, 'plane': plane, 'y': yp})
    return {'name': name, 'wavelength_nm': wl * 1e3, 'glasses': glasses, 'thickness': float(last - first),
            'efl': float(efl), 'eflParaxial': float(o.paraxial.f2()), 'bfl': float(bfl),
            'heights': heights, 'crossings': cross, 'fans': fans_out}

out = {'source': 'Optiland 0.6 (open-source lens design), real-ray traces', 'systems': []}
for flip in (False, True):
    o = singlet(flip)
    n = float(np.ravel(o.surfaces.surfaces[1].material_post.n(0.5875618))[0])
    out['systems'].append(system('Plano-convex singlet, ' + ('flat' if flip else 'curved') + ' side first', o, 0.5875618,
        [1.0, 3.0, 5.0, 7.0, 9.0, 11.0],
        [{'x': -10.0, 'y': -1.0, 'angle': 5.0, 'width': 16.0, 'rays': 9}], 96.0,
        {'N-BK7': n}))
o = CookeTriplet()
nSK16 = float(np.ravel(o.surfaces.surfaces[1].material_post.n(0.55))[0])
nF2 = float(np.ravel(o.surfaces.surfaces[3].material_post.n(0.55))[0])
out['systems'].append(system('Cooke triplet (Optiland sample), f 50 mm', o, 0.55,
    [0.5, 1.5, 2.5, 3.5, 4.5, 5.0],
    [{'x': -10.0, 'y': -5.1, 'angle': 14.0, 'width': 8.0, 'rays': 9}, {'x': -10.0, 'y': -7.4, 'angle': 20.0, 'width': 7.0, 'rays': 9}],
    42.20778, {'SK16': nSK16, 'F2': nF2}))
out['systems'][-1]['prescription'] = {'R': [22.01359, -435.76044, -22.21328, 20.29192, 79.68360, -18.39533],
    'gaps': [3.25896, 6.00755, 0.99997, 4.75041, 2.95208], 'materials': ['SK16', 'AIR', 'F2', 'AIR', 'SK16']}
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'ref', 'lenses-optiland.json'), 'w'), indent=1)
for s in out['systems']: print(s['name'], s['efl'], s['eflParaxial'], s['bfl'], [round(c, 4) for c in s['crossings']], s['glasses'])
