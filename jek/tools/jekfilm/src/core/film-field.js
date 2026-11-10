import { filmAdmit, filmLayer, filmLayerC } from '../../../jekray/src/core/coatings.js';
import { metalNK } from '../../../jekray/src/core/metals.js';

/* ==========================================================================
   The field inside the stack: |E|² against depth, from the outer surface through each layer to the substrate,
   relative to the incoming wave's (1 is the incident field's strength). The tangential field, as the characteristic
   matrices carry it: E itself for s; for p its component along the surface. Each layer's matrix over a part of its
   thickness carries [E, H] from the layer's inner side outwards; the substrate side starts at [1, η_s], and the
   incident wave is (η₀ B + C) / 2η₀. Laser damage starts where it peaks, so this is for reading where the peaks sit.
   ========================================================================== */
const cm = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const ca = (a, b) => [a[0] + b[0], a[1] + b[1]];
/* a layer's matrix over thickness d, as four complex numbers, at nm: a dielectric's real form, or a metal's */
function layerM(L, d, sin0, nm, pol) {
  if (L.metal) { const nk = metalNK(L.metal, nm); return filmLayerC([nk[0], -nk[1]], d, sin0, nm, pol); }
  const [c, x, y] = filmLayer(L.n, d, sin0, nm, pol);
  return [[c, 0], [0, x], [0, y], [c, 0]];
}
const apply = (M, v) => [ca(cm(M[0], v[0]), cm(M[1], v[1])), ca(cm(M[2], v[0]), cm(M[3], v[1]))];
/* the field through the stack: { z (nm from the outer surface), E2, bounds (each interface's depth) }; steps a layer */
export function stackField(layers, n0, ns, ci, nm, pol, steps = 40) {
  const sin0 = Math.sqrt(Math.max(0, 1 - ci * ci)) * n0, es = filmAdmit(ns, sin0, pol), e0 = filmAdmit(n0, sin0, pol)[0];
  // from the substrate outwards: the field at each layer's inner side, then across it
  const per = [];
  let v = [[1, 0], [es[0], es[1]]];
  for (let j = layers.length - 1; j >= 0; j--) {
    const L = layers[j], pts = [];
    for (let k = steps; k >= 0; k--) { const u = L.d * k / steps; pts.push(apply(layerM(L, u, sin0, nm, pol), v)[0]); }   // u from the inner side
    per[j] = pts; v = apply(layerM(L, L.d, sin0, nm, pol), v);
  }
  // the incident wave, from the field and its H at the outer surface
  const Ep = [(e0 * v[0][0] + v[1][0]) / (2 * e0), (e0 * v[0][1] + v[1][1]) / (2 * e0)], inc = Ep[0] * Ep[0] + Ep[1] * Ep[1] || 1e-300;
  const z = [], E2 = [], bounds = [0];
  let top = 0;
  layers.forEach((L, j) => {
    per[j].forEach((E, k) => { z.push(top + L.d * k / steps); E2.push((E[0] * E[0] + E[1] * E[1]) / inc); });
    top += L.d; bounds.push(top);
  });
  if (!layers.length) { z.push(0); E2.push(1 / inc); }
  // into the substrate a little: the field there runs on at the inner side's strength (a transmitted wave)
  const last = 1 / inc; z.push(top, top + Math.max(20, top * 0.08)); E2.push(last, last);
  return { z, E2, bounds };
}
