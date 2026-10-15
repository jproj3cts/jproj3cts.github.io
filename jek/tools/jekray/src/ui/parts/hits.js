import { polyVerts, sagFn } from '../../core/geometry.js';
import { elementSurfaces } from '../../core/stl.js';
import { inPolygon } from '../pointer.js';

/* Hit tests shared by several parts, in the part's own frame (lx, ly), tol the pointer's reach in mm */
/* a flat part across the beam: a grating, a rotator, a filter, a link plane, a modulator; back: how far behind its face */
export const hitPlate = (el, lx, ly, tol, back = 0.4) => lx <= tol + 0.4 && lx >= -back - tol && Math.abs(ly) <= el.length / 2 + tol;
/* a part met on its first surface: a mirror, a screen */
export function hitSurface(el, lx, ly, tol) {
  const s = elementSurfaces(el)[0];
  return Math.abs(ly) <= s.semi + tol && Math.abs(lx - sagFn(s, Math.min(s.semi, Math.abs(ly)))) <= tol;
}

/* a cube's or a prism's outline */
export const hitBlock = (el, lx, ly, tol) => inPolygon(polyVerts(el), lx, ly, tol);

/* a thin plate: a waveplate, a polariser, a mask */
export const hitThin = (el, lx, ly, tol) => Math.abs(lx) <= tol + 0.3 && Math.abs(ly) <= el.length / 2 + tol;
