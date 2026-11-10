/* What the Node tests share: the kernel loaded from the vendored build, and documents made the way the sketcher
   makes them (a rectangle of four constrained lines, dimensioned; points; circles). */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeKernel } from '../../src/engines/kernel.js';
import { newDoc, newFeature } from '../../src/core/doc.js';
import { rectEnts } from '../../src/core/sketch-tools.js';
import { sketchId, solveSketch } from '../../src/core/sketch.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VENDOR = path.resolve(HERE, '../../../../assets/vendor/replicad-opencascadejs/1.2.1/replicad_single.js');
let K = null;
export async function kernel() {
  if (K) return K;
  const init = (await import(pathToFileURL(VENDOR).href)).default;
  const oc = await init({ print() {}, printErr() {} });
  K = makeKernel(oc);
  return K;
}
/* a sketch of a w × h rectangle from the origin, its sides dimensioned (expressions allowed) */
export function rectSketch(doc, w, h, plane, at) {
  const r = rectEnts(at || [0, 0], [(at ? at[0] : 0) + 10, (at ? at[1] : 0) + 10]);
  const [l0, l1] = r.ents;
  const sk = newFeature(doc, 'sketch', { plane: plane || { std: 'top' }, ents: r.ents, cons: r.cons });
  if (!at) sk.cons.push({ id: sketchId('c'), t: 'coincident', r: [{ e: l0.id, k: 'a' }, { e: 'origin' }] });
  sk.dims = [{ id: sketchId('d'), t: 'len', r: [{ e: l0.id }], v: 10, x: String(w) }, { id: sketchId('d'), t: 'len', r: [{ e: l1.id }], v: 10, x: String(h) }];
  return sk;
}
export function circleSketch(doc, c, r, plane) {
  const ent = { id: sketchId('c'), t: 'circle', c, r };
  return newFeature(doc, 'sketch', { plane: plane || { std: 'top' }, ents: [ent], cons: [], dims: [{ id: sketchId('d'), t: 'dia', r: [{ e: ent.id }], v: 2 * r, x: String(2 * r) }] });
}
export function pointsSketch(doc, pts, plane) {
  return newFeature(doc, 'sketch', { plane: plane || { std: 'top' }, ents: pts.map(c => ({ id: sketchId('p'), t: 'point', c })), cons: [], dims: [] });
}
export { newDoc, newFeature, solveSketch };
/* the part's mesh volume and the feature's outcome, from a regeneration */
export const okAll = out => out.features.every(f => f.ok || f.suppressed || f.rolledBack);
export const errorsOf = out => out.features.filter(f => f.ok === false).map(f => f.id + ': ' + f.error);
