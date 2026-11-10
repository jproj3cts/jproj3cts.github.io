import { COAT_MATERIALS } from '../../../jekray/src/core/coatings.js';
import { coatMerit, coatOptimise } from '../../../jekray/src/core/coatdesign.js';

/* ==========================================================================
   Beyond the thicknesses: the optimiser that adds layers (needle optimisation) and the one that chooses each layer's
   material. Both work on the dielectric layers only (a metal stays as it is), on the merit core/coatdesign.js judges
   by, and end with the thicknesses settled by its Nelder–Mead. Each yields between steps (onStep), so the page stays
   drawn while they run, and stops when told (stop()).
   ========================================================================== */
const sameLayers = L => L.map(x => ({ n: x.n, d: x.d, ...(x.metal ? { metal: x.metal } : {}) }));
const tick = () => new Promise(r => setTimeout(r, 0));
/* the dielectric indices a needle may be made of: those in the stack, or a low and a high pair if it has fewer than two */
export function needleMaterials(layers) {
  const ns = [...new Set(layers.filter(L => !L.metal).map(L => +L.n))];
  return ns.length >= 2 ? ns : [...new Set(ns.concat([1.46, 2.10]))];
}
/* Needle optimisation: at each round, a thin layer (2 nm) of each material is tried at every place in the stack (at
   each layer's boundary and inside each dielectric layer, splitting it in three), the one that lowers the merit most is
   put in, the thicknesses are optimised, and layers thinner than 1 nm are taken out (their neighbours joined where they
   are the same material). It ends when no needle helps, at maxLayers, or after rounds. */
export async function filmNeedle(layers, spec, opts = {}) {
  const mats = opts.materials || needleMaterials(layers), maxLayers = opts.maxLayers || Math.max(layers.length + 10, 12), rounds = opts.rounds || 8;
  const merit = L => coatMerit(L, spec, 25, spec.theta > (spec.theta0 || 0) ? 3 : 1);
  let cur = sameLayers(layers), fCur = merit(cur);
  const before = fCur;
  let added = 0;
  for (let r = 0; r < rounds && cur.length + 1 <= maxLayers; r++) {
    if (opts.stop && opts.stop()) break;
    let best = null;
    for (let i = 0; i <= cur.length; i++) {
      // at the boundary before layer i (i = cur.length: next to the substrate), and in the middle of layer i
      const places = [{ at: i, split: false }];
      if (i < cur.length && !cur[i].metal && cur[i].d > 6 && cur.length + 2 <= maxLayers) places.push({ at: i, split: true });
      for (const pl of places) for (const n of mats) {
        if (!pl.split && ((cur[pl.at - 1] && !cur[pl.at - 1].metal && cur[pl.at - 1].n === n) || (cur[pl.at] && !cur[pl.at].metal && cur[pl.at].n === n))) continue;
        if (pl.split && cur[pl.at].n === n) continue;
        const L = cur.slice(), needle = { n, d: 2 };
        if (pl.split) { const h = cur[pl.at]; L.splice(pl.at, 1, { n: h.n, d: h.d / 2 }, needle, { n: h.n, d: h.d / 2 }); }
        else L.splice(pl.at, 0, needle);
        const f = merit(L);
        if (f < fCur && (!best || f < best.f)) best = { f, L };
      }
    }
    if (!best) break;
    const o = coatOptimise(best.L, spec, { rounds: 2 });
    let L = o.layers;
    // the layers grown too thin to make are taken out, and same-material neighbours joined
    L = L.filter(x => x.metal || x.d >= 1);
    for (let k = L.length - 1; k > 0; k--) if (!L[k].metal && !L[k - 1].metal && L[k].n === L[k - 1].n) { L[k - 1] = { n: L[k].n, d: L[k - 1].d + L[k].d }; L.splice(k, 1); }
    const f = merit(L);
    if (!(f < fCur * 0.999)) break;
    added += L.length - cur.length; cur = L; fCur = f;
    if (opts.onStep) opts.onStep({ round: r + 1, merit: fCur, layers: cur.length });
    await tick();
  }
  return { layers: cur, before, after: fCur, added };
}
/* The materials chosen: each dielectric layer tried as each material of the list, keeping its optical thickness (so a
   quarter wave stays a quarter wave), the change that lowers the merit most kept, layer by layer, for a few passes;
   then the thicknesses optimised. */
export async function filmMaterials(layers, spec, opts = {}) {
  const mats = opts.materials || COAT_MATERIALS.map(m => +m[0]), passes = opts.passes || 3;
  const merit = L => coatMerit(L, spec, 25, spec.theta > (spec.theta0 || 0) ? 3 : 1);
  let cur = sameLayers(layers), fCur = merit(cur);
  const before = fCur;
  let changed = 0;
  for (let pass = 0; pass < passes; pass++) {
    let any = false;
    for (let i = 0; i < cur.length; i++) {
      if (opts.stop && opts.stop()) break;
      if (cur[i].metal) continue;
      let best = null;
      for (const n of mats) {
        if (n === cur[i].n) continue;
        const L = cur.slice(); L[i] = { n, d: cur[i].d * cur[i].n / n };
        const o = coatOptimise(L, spec, { rounds: 1, maxIt: 40 * L.length, nW: 15 });
        const f = merit(o.layers);
        if (f < fCur * 0.995 && (!best || f < best.f)) best = { f, L: o.layers };
      }
      if (best) { cur = best.L; fCur = best.f; changed++; any = true; if (opts.onStep) opts.onStep({ pass: pass + 1, layer: i + 1, merit: fCur }); }
      await tick();
    }
    if (!any) break;
  }
  const o = coatOptimise(cur, spec);
  if (o.after < fCur) { cur = o.layers; fCur = o.after; }
  return { layers: cur, before, after: fCur, changed };
}
