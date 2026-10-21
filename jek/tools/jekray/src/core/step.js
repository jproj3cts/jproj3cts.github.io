import { STL_KEEP } from './stl.js';

/* ---------- STEP files, as STL objects ----------
   A .step (.stp) file is read by OpenCascade (occt-import-js, a WebAssembly build of it, vendored under
   jek/assets/vendor/occt-import-js/ and loaded only when a STEP file is first brought in: io/step.js on the
   page, headless.mjs in Node), which tessellates each solid into triangles. What is here is the part that
   needs no page: the file's length unit, how finely to tessellate, and the triangles of each body, in the
   same form parseSTL gives (a Float32Array of 9 numbers a triangle), so everything after is as for a .stl. */

/* a STEP file's length unit, read from its text (the LENGTH_UNIT it declares): as an STL object's units, and
   as occt-import-js names it (it hands back coordinates in the unit asked for, converting if need be). A file
   with none, or one in a unit an STL object has no name for, is read in millimetres. */
const STEP_PREFIX = { MILLI: 'mm', CENTI: 'cm', '': 'm' };
export const STEP_LINEAR = { mm: 'millimeter', cm: 'centimeter', m: 'meter', in: 'inch' };
export function stepText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new TextDecoder('latin1').decode(u8);
}
export function stepUnit(text) {
  const unitOf = s => {
    const si = s.match(/SI_UNIT\s*\(\s*(?:\.(\w+)\.|\$)\s*,\s*\.METRE\.\s*\)/), conv = s.match(/CONVERSION_BASED_UNIT\s*\(\s*'([^']*)'/);
    if (conv) return /^(INCH|IN|FOOT|FT)$/i.test(conv[1].trim()) ? 'in' : 'mm';   // (a foot read in inches)
    return si ? STEP_PREFIX[si[1] || ''] || 'mm' : null;
  };
  const entity = id => { const m = text.match(new RegExp('#' + id + '\\s*=\\s*([^;]*);')); return m ? m[1] : ''; };
  // the units each representation context assigns (GLOBAL_UNIT_ASSIGNED_CONTEXT): its length unit's; an inch is a
  // CONVERSION_BASED_UNIT, a millimetre times 25.4, so the millimetre is there too but only as what it is made from
  const units = new Set();
  for (const m of text.matchAll(/GLOBAL_UNIT_ASSIGNED_CONTEXT\s*\(\s*\(([^)]*)\)/g))
    for (const r of m[1].matchAll(/#(\d+)/g)) { const e = entity(r[1]); if (/\bLENGTH_UNIT\s*\(/.test(e)) { const u = unitOf(e); if (u) units.add(u); } }
  // one unit throughout: that one; none, or several (OpenCascade brings them all to one): millimetres
  const units1 = units.size === 1 ? [...units][0] : 'mm';
  return { units: units1, linearUnit: STEP_LINEAR[units1], declared: units.size === 1 };
}
export const isStep = text => /^\s*ISO-10303-21\s*;/.test(text.slice(0, 256));
/* the model's size, roughly, in its own unit: the widest spread of its vertices (the points its edges end at, which
   lie on it, where a placement's origin or a sphere's centre need not); an assembly's parts are placed in their own
   frames, so this is the size of its largest part, or of the whole where it is drawn as one */
export function stepExtent(text) {
  const pts = new Map(), re = /#(\d+)\s*=\s*CARTESIAN_POINT\s*\(\s*'[^']*'\s*,\s*\(\s*([^)]*)\)/g;
  let m;
  while ((m = re.exec(text))) { const c = m[2].split(',').map(parseFloat); if (c.length === 3 && c.every(isFinite)) pts.set(m[1], c); }
  const verts = [...text.matchAll(/VERTEX_POINT\s*\(\s*'[^']*'\s*,\s*#(\d+)/g)].map(v => pts.get(v[1])).filter(Boolean);
  const use = verts.length >= 2 ? verts : [...pts.values()];
  if (!use.length) return 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const c of use) for (let k = 0; k < 3; k++) { if (c[k] < lo[k]) lo[k] = c[k]; if (c[k] > hi[k]) hi[k] = c[k]; }
  return Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
}
/* How finely to tessellate, pass by pass: the chord (linear deflection, in the file's unit, a fraction of the
   model's size) and the largest angle a facet turns through (angular deflection, radians: 0.35 puts 18 facets
   round a hole). The first is fine enough for any mount's outline; if the whole comes to more triangles than
   STEP_TARGET, each next pass is coarser, and only after the last does meshEncode simplify as for a .stl. */
export const STEP_TARGET = 30000;
export const STEP_PASSES = [{ lin: 0.001, ang: 0.35 }, { lin: 0.003, ang: 0.5 }, { lin: 0.01, ang: 0.8 }, { lin: 0.03, ang: 1.2 }];
export function stepParams(text, pass) {
  const u = stepUnit(text), ext = stepExtent(text), P = STEP_PASSES[Math.min(pass, STEP_PASSES.length - 1)];
  // with no points to size it by, a fraction of each solid's own size (occt-import-js's bounding_box_ratio)
  return ext > 0 ? { linearUnit: u.linearUnit, linearDeflectionType: 'absolute_value', linearDeflection: ext * P.lin, angularDeflection: P.ang }
    : { linearUnit: u.linearUnit, linearDeflectionType: 'bounding_box_ratio', linearDeflection: P.lin, angularDeflection: P.ang };
}
/* the triangles of each body occt-import-js found (each of its meshes: a solid, or a shell), named from the
   file's parts (the mesh's own name, else its part's, numbered if a part has several), each { name, T, colour } */
export function stepBodies(result, fileName) {
  if (!result || !result.success) throw new Error('OpenCascade could not read ' + (fileName || 'this STEP file') + ': it may be damaged or cut short.');
  const base = String(fileName || 'model.step').replace(/\.(step|stp)$/i, '') || 'model';
  const nodeOf = new Map(), counts = new Map();
  const visit = (node, parent) => {
    const name = String(node.name || '').trim() || parent;
    for (const i of node.meshes || []) nodeOf.set(i, name);
    for (const c of node.children || []) visit(c, name);
  };
  if (result.root) visit(result.root, '');
  for (const name of nodeOf.values()) if (name) counts.set(name, (counts.get(name) || 0) + 1);
  const seen = new Map(), bodies = [];
  (result.meshes || []).forEach((M, i) => {
    const P = M.attributes && M.attributes.position ? M.attributes.position.array : M.P, I = M.index ? (M.index.array || M.index) : M.I;
    if (!P || !I || I.length < 3) return;
    const n = Math.floor(I.length / 3), T = new Float32Array(9 * n);
    for (let t = 0; t < 3 * n; t++) { const v = 3 * I[t]; T[3 * t] = P[v]; T[3 * t + 1] = P[v + 1]; T[3 * t + 2] = P[v + 2]; }
    let name = String(M.name || '').trim();
    if (!name) { const part = nodeOf.get(i) || ''; name = part || base + ' part ' + (bodies.length + 1); if (part && counts.get(part) > 1) { const k = (seen.get(part) || 0) + 1; seen.set(part, k); name = part + ' ' + k; } }
    const col = Array.isArray(M.color) && M.color.length === 3 ? '#' + M.color.map(c => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('') : null;
    bodies.push({ name: name.slice(0, 60), T, colour: col });
  });
  if (!bodies.length) throw new Error('The STEP file has no solids in it to bring in.');
  // the same name twice: numbered
  const used = new Map();
  for (const b of bodies) { const k = used.get(b.name) || 0; used.set(b.name, k + 1); if (k) b.name = b.name + ' (' + (k + 1) + ')'; }
  return bodies;
}
export const stepTris = bodies => bodies.reduce((a, b) => a + b.T.length / 9, 0);
/* a box round triangles: [lo, hi] */
export function trisBox(T) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < T.length; i++) { const k = i % 3; if (T[i] < lo[k]) lo[k] = T[i]; if (T[i] > hi[k]) hi[k] = T[i]; }
  return [lo, hi];
}
/* Read a STEP file, coarser pass by pass until its triangles fit: read(params) is occt-import-js's ReadStepFile
   (on the page, in its worker), synchronous or not. Resolves with { bodies, units, declared, pass, tris, ms } */
export async function stepRead(bytes, fileName, read, onPass) {
  const text = stepText(bytes);
  if (!isStep(text)) throw new Error(fileName + ' is not a STEP file (it does not start ISO-10303-21).');
  const u = stepUnit(text), t0 = Date.now();
  let bodies = null, pass = 0;
  for (; pass < STEP_PASSES.length; pass++) {
    if (onPass) onPass(pass);
    bodies = stepBodies(await read(stepParams(text, pass)), fileName);
    if (stepTris(bodies) <= STEP_TARGET) break;
  }
  return { bodies, units: u.units, declared: u.declared, pass: Math.min(pass, STEP_PASSES.length - 1), tris: stepTris(bodies), ms: Date.now() - t0 };
}
/* What goes on the bench, in the bench's millimetres: 'one' object of every body's triangles, or 'parts', one for
   each body, each at its own place (its box's centre from the whole's), so the whole stands as in the file,
   resting on the breadboard. Each { name, T, colour, dx, dy, z, budget }: the triangles each keeps share
   STL_KEEP between them by size, so the parts together keep what one object would. */
export function stepPlan(bodies, fileName, as, units, scale) {
  const sc = scale || 1, name = String(fileName || 'model.step').replace(/\.(step|stp)$/i, '').slice(0, 60) || 'STEP object';
  const all = new Float32Array(bodies.reduce((a, b) => a + b.T.length, 0));
  { let o = 0; for (const b of bodies) { all.set(b.T, o); o += b.T.length; } }
  const [lo, hi] = trisBox(all), c = [0, 1, 2].map(k => (lo[k] + hi[k]) / 2);
  if (as !== 'parts' || bodies.length < 2) return [{ name, T: all, colour: bodies.length === 1 ? bodies[0].colour : null, dx: 0, dy: 0, z: (hi[2] - lo[2]) * sc / 2, budget: STL_KEEP }];
  const N = all.length / 9;
  return bodies.map(b => {
    const [l, h] = trisBox(b.T);
    return { name: b.name, T: b.T, colour: b.colour, dx: ((l[0] + h[0]) / 2 - c[0]) * sc, dy: ((l[1] + h[1]) / 2 - c[1]) * sc, z: ((l[2] + h[2]) / 2 - lo[2]) * sc,
      budget: N > STL_KEEP ? Math.max(200, Math.floor(STL_KEEP * b.T.length / 9 / N)) : STL_KEEP };
  });
}
