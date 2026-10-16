import { DOVE_RATIO, deg } from '../state/project.js';
import { rollFrame } from '../engines/trace.js';
import { ffGrad, ffList, ffSag } from './freeform.js';
import { dpOn, normOrder } from './diffractive.js';

/* ==========================================================================
   Geometry
   Every element has a local frame: origin at (x, y), local +x along `angle`.
   Surfaces are sag curves x = z + sag(y) in that frame, |y| ≤ semi.
   ========================================================================== */

export function sagFn(s, y) {
  // a freeform's terms in the plane (x = 0), about the parent surface's vertex as the rest
  const f = s.FL ? ffSag(s.FL, 0, y + (s.y0 || 0)) - (s.y0 ? ffSag(s.FL, 0, s.y0) : 0) : 0;
  if (s.y0) return rawSag(s, y + s.y0) - s.sag0 + f;
  return rawSag(s, y) + f;
}
export function dsagFn(s, y) { return rawDsag(s, y + (s.y0 || 0)) + (s.FL ? ffGrad(s.FL, 0, y + (s.y0 || 0))[1] : 0); }

export function rawSag(s, y) {
  const y2 = y * y;
  let v = 0;
  if (s.c !== 0) {
    const arg = 1 - (1 + s.k) * s.c * s.c * y2;
    v = s.c * y2 / (1 + Math.sqrt(Math.max(0, arg)));
  }
  v += s.a2 * y2;
  let p = y2 * y2;
  for (let j = 0; j < s.A.length; j++) { v += s.A[j] * p; p *= y2; }
  if (s.odd) { const r = Math.abs(y); let q = r; for (let j = 0; j < s.odd.length; j++) { v += s.odd[j] * q; q *= r; } }
  return v;
}
export function rawDsag(s, y) {
  const y2 = y * y;
  let v = 0;
  if (s.c !== 0) {
    const arg = 1 - (1 + s.k) * s.c * s.c * y2;
    v = s.c * y / Math.sqrt(Math.max(1e-12, arg));
  }
  v += 2 * s.a2 * y;
  let p = y2 * y;
  for (let j = 0; j < s.A.length; j++) { v += (4 + 2*j) * s.A[j] * p; p *= y2; }
  if (s.odd) {
    // a ray on the tip itself sees the two sides of the cone equally, so no slope: it goes straight
    const r = Math.abs(y), sg = y < -1e-12 ? -1 : y > 1e-12 ? 1 : 0;
    let q = 1;
    for (let j = 0; j < s.odd.length; j++) { v += (j + 1) * s.odd[j] * q * sg; q *= r; }
  }
  return v;
}

/* Local curvature of a sag surface at height y: what a Gaussian beam sees there */
function curvAt(s, y) {
  // an axicon's cone (the odd r^1 term) has no curvature away from its tip; the tip's kink
  // is not a lens the beam's pilot should take
  if (s.odd && s.odd[0]) s = Object.assign({}, s, { odd: [0, ...s.odd.slice(1)] });
  const h = Math.max(1e-4, s.semi * 1e-3);
  const d1 = dsagFn(s, y);
  const d2 = (dsagFn(s, y + h) - dsagFn(s, y - h)) / (2 * h);
  return d2 / Math.pow(1 + d1 * d1, 1.5);
}

/* A mask's amplitude and delay at (u across, v up) in the bench's frame: a mask rolled about its
   axis has its pattern turned with it */
export function maskOf(s) {
  if (!s.maskFn || !(s.tilt && s.roll)) return s.maskFn;
  if (!s._mf) Object.defineProperty(s, '_mf', { value: (u, v, l) => s.maskFn(...rollFrame(s, u, v), l), enumerable: false });
  return s._mf;
}
/* A surface's curvature in the bench plane, for the beam's pilot in it: a cylinder rolled about
   its axis keeps cos^2 of its power there (one curved out of the plane, sin^2) */
export function kapIn(s, y) {
  let k = s.c ? curvAt(s, y) : 0;
  if (s.tilt && s.roll) {
    const c2 = Math.cos(s.roll) ** 2;
    if (s.cylS) k = (s.cylS.c || 0) * (1 - c2) + 2 * (s.cylS.a2 || 0) * (1 - c2);
    else if (s.cyl === 'plane') k *= c2;
  }
  return k;
}
/* Build a traced surface description in an element's local frame */
export function makeSurf(el, z, c, k, a2, A, semi, extra) {
  const s = Object.assign({ el, z, c, k, a2, A, semi, y0: 0 }, extra);
  if (c !== 0 && (1 + k) > 0) {
    const lim = 0.99999 / (Math.abs(c) * Math.sqrt(1 + k)) - Math.abs(s.y0);
    if (semi > lim) semi = Math.max(1e-6, lim);
  }
  s.semi = semi;
  s.sag0 = s.y0 ? rawSag(s, s.y0) : 0;
  const plain = A.every(v => v === 0) && !(s.odd && s.odd.some(v => v !== 0)) && !s.FL;
  s.flat = (c === 0 && a2 === 0 && plain && !s.y0);
  s.conicOnly = !s.flat && a2 === 0 && plain && !s.y0;
  let lo = 0, hi = 0;
  if (!s.flat) {
    for (let i = 0; i <= 64; i++) {
      const v = sagFn(s, semi * (i / 32 - 1));
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    // a freeform's sag up and down out of the plane too, over its round aperture
    if (s.FL) for (let i = -16; i <= 16; i++) for (let j = -16; j <= 16; j++) {
      const y = semi * i / 16, h = semi * j / 16;
      if (y * y + h * h > semi * semi) continue;
      const v = rawSag(s, Math.hypot(y + s.y0, h)) - s.sag0 + ffSag(s.FL, h, y + s.y0) - (s.y0 ? ffSag(s.FL, 0, s.y0) : 0);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  s.xmin = z + lo - 1e-9; s.xmax = z + hi + 1e-9;
  return s;
}

export function lensSurfaces(el) {
  const T = el.gaps.reduce((a, b) => a + b, 0);
  let z = -T / 2;
  const out = [];
  for (let i = 0; i < el.surfaces.length; i++) {
    const sd = el.surfaces[i];
    const c = sd.R === null ? 0 : 1 / sd.R;
    // a cylinder curved out of the bench plane is flat to the rays in it; its profile rides
    // along for the field and the cavity matrices, which trace out of the plane
    const out2 = el.cyl === 'out';
    const s = makeSurf(el, z, out2 ? 0 : c, out2 ? 0 : sd.k, out2 ? 0 : sd.a2, out2 ? [] : sd.A,
      sd.semi || el.diameter / 2, {
        odd: out2 ? undefined : sd.odd, FL: out2 ? null : ffList(sd.F),
        cyl: el.cyl, cylS: out2 ? { c, k: sd.k, a2: sd.a2, A: sd.A, odd: sd.odd } : undefined,
        kind: 'refract', coat: sd.coat,
        // a diffractive lens's phase on this face, in its order (core/diffractive.js)
        ph: el.diffractive && !el.cyl && dpOn(sd.ph) ? sd.ph : null, dm: normOrder(el.diffOrder),
        front: i === 0 ? { glass: 'AIR' } : el.materials[i - 1],
        back: i === el.surfaces.length - 1 ? { glass: 'AIR' } : el.materials[i],
      });
    out.push(s);
    z += el.gaps[i] || 0;
  }
  return out;
}

/* Outline of a glass block in the element's local frame, counter-clockwise */
export function polyVerts(el) {
  const a = el.size / 2;
  if (el.type === 'cube') return [[-a, -a], [a, -a], [a, a], [-a, a]];
  if (el.shape === 'window') { const t = el.thickness / 2; return [[-t, -a], [t, -a], [t, a], [-t, a]]; }
  if (el.shape === 'dove') {
    // a Dove prism: its long face (the base) below, its ends cut at 45°; light along it enters one
    // end, is turned back up by total reflection off the base and leaves the other, upside down
    const L = el.size * DOVE_RATIO / 2;
    return [[-L, -a], [L, -a], [L - el.size, a], [-L + el.size, a]];
  }
  if (el.shape === 'equilateral') {
    const hgt = el.size * Math.sqrt(3) / 2;
    return [[-hgt / 3, -a], [2 * hgt / 3, 0], [-hgt / 3, a]];     // apex points along +x
  }
  return [[-a, -a], [a, -a], [-a, a]];                              // right angle at (−a, −a)
}
export function polySurfaces(el) {
  const V = polyVerts(el), out = [];
  for (let i = 0; i < V.length; i++) {
    const [x1, y1] = V[i], [x2, y2] = V[(i + 1) % V.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const nx = (y2 - y1) / len, ny = -(x2 - x1) / len;           // outward normal
    // face frame: local +x along the outward normal, so glass is "front" and air "back"
    out.push(makeSurf(el, 0, 0, 0, 0, [], len / 2, {
      kind: 'refract', coat: el.coat, front: el.material, back: { glass: 'AIR' },
      lf: { x: (x1 + x2) / 2, y: (y1 + y2) / 2, a: Math.atan2(ny, nx) },
    }));
  }
  if (el.type === 'cube') {
    // coated hypotenuse from (−a, −a) to (a, a)
    out.push(makeSurf(el, 0, 0, 0, 0, [], el.size / Math.SQRT2 * 0.99999, {
      kind: 'split',
      Rs: (el.mode === 'pbs' ? el.reflectS : el.reflect) / 100,
      Rp: (el.mode === 'pbs' ? el.reflectP : el.reflect) / 100,
      front: el.material, back: el.material,
      lf: { x: 0, y: 0, a: 135 * deg },
    }));
  }
  return out;
}

/* One flat face between two regions of an element: (x1, y1) to (x2, y2) in its local frame,
   (nx, ny) the normal from the front region into the back one */
export function faceSurf(el, x1, y1, x2, y2, nx, ny, front, back) {
  return makeSurf(el, 0, 0, 0, 0, [], Math.hypot(x2 - x1, y2 - y1) / 2, {
    kind: 'refract', coat: { mode: 'bare' }, front, back,
    lf: { x: (x1 + x2) / 2, y: (y1 + y2) / 2, a: Math.atan2(ny, nx) } });
}
