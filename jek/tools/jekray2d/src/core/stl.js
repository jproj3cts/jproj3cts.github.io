import { CRYSTALS, bireMat } from './crystals.js';
import { deg, num } from '../state/project.js';
import { faceSurf, lensSurfaces, makeSurf, polySurfaces } from './geometry.js';
import { maskFns, stopBlades } from './mask.js';
import { zOf } from '../engines/trace.js';
import { ELEC } from '../engines/elec.js';

/* ---------- STL objects ----------
   A mesh brought in from a .stl file (a mount, a housing, a baffle, anything from CAD): an
   opaque object, a beam block of any shape. Its triangles are kept with the bench, centred on
   their bounding box, in the file's own units (scale: mm per unit); a ray is met against them
   exactly, in the object's own frame (its facing, tip and roll, as any part), through a
   bounding-volume tree, and stops where it lands. */
const STL_MAX_TRIS = 200000;
export const STL_UNITS = { mm: 1, cm: 10, m: 1000, in: 25.4 };
/* the triangles of a .stl file, binary or text, as one Float32Array of 9 numbers each */
export function parseSTL(src) {
  let bytes = null, text = null;
  if (typeof src === 'string') text = src;
  else { bytes = src instanceof Uint8Array ? src : new Uint8Array(src); }
  if (bytes) {
    const n = bytes.length >= 84 ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true) : -1;
    const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
    // a binary file is exactly as long as its count says; a text one starts "solid" and has facets
    if (!(n >= 0 && bytes.length === 84 + 50 * n) && /^\s*solid/.test(head) && /facet/.test(new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 65536))))) text = new TextDecoder().decode(bytes);
    else {
      if (!(n > 0 && bytes.length >= 84 + 50 * n)) throw new Error('This is not an STL file: its triangle count does not match its length.');
      if (n > STL_MAX_TRIS) throw new Error('The STL file has ' + n + ' triangles; up to ' + STL_MAX_TRIS + ' can be brought in. Export it more coarsely.');
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), T = new Float32Array(9 * n);
      for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) T[9 * i + k] = dv.getFloat32(84 + 50 * i + 12 + 4 * k, true);
      return T;
    }
  }
  const out = [], re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  let m;
  while ((m = re.exec(text))) { out.push(+m[1], +m[2], +m[3]); if (out.length > 9 * STL_MAX_TRIS) throw new Error('The STL file has more than ' + STL_MAX_TRIS + ' triangles. Export it more coarsely.'); }
  if (!out.length || out.length % 9) throw new Error('No triangles found in the STL file.');
  return new Float32Array(out);
}
const b64OfBytes = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const bytesOfB64 = b => { const s = atob(b), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; };
/* The mesh as kept with the bench: centred on its bounding box, its size, in file units. Kept
   compact, so a bench with a CAD part in it still fits the cloud's 2 MB and a part My parts'
   256 KB: corners shared by triangles are kept once (welded), each coordinate a 16-bit step
   across the object's size (a 65535th of it: 1.5 µm on a 100 mm part), and the triangles as
   indices into them ('q16'). A mesh of more than `budget` triangles is simplified first, by
   merging the corners in each cell of a grid made coarser until it fits; an STL object only
   stops light, so its outline is what matters, and the grid is as fine as the budget allows. */
export const STL_KEEP = 40000;                   // triangles kept with the bench
export function meshEncode(T, file, budget) {
  budget = budget || STL_KEEP;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < T.length; i++) { const k = i % 3; if (!isFinite(T[i])) throw new Error('The STL file has a vertex that is not a number.'); if (T[i] < lo[k]) lo[k] = T[i]; if (T[i] > hi[k]) hi[k] = T[i]; }
  const size = hi.map((v, k) => +(v - lo[k]).toPrecision(9)), S = size.map(v => v > 0 ? v : 1e-9), n0 = T.length / 9;
  const Q = new Uint16Array(T.length);
  for (let i = 0; i < T.length; i++) { const k = i % 3; Q[i] = Math.round((T[i] - lo[k]) / S[k] * 65535); }
  // weld, on a grid of g cells a side (65536: every distinct step), dropping triangles that collapse
  const weld = g => {
    const sh = 65536 / g, map = new Map(), sum = [], tris = [], seen = new Set();
    const vid = o => {
      const a = Math.floor(Q[o] / sh), b = Math.floor(Q[o + 1] / sh), c = Math.floor(Q[o + 2] / sh), key = (a * g + b) * g + c;
      let v = map.get(key);
      if (v === undefined) { v = sum.length / 4; map.set(key, v); sum.push(0, 0, 0, 0); }
      sum[4 * v] += Q[o]; sum[4 * v + 1] += Q[o + 1]; sum[4 * v + 2] += Q[o + 2]; sum[4 * v + 3]++;
      return v;
    };
    for (let t = 0; t < n0; t++) {
      const A = vid(9 * t), B = vid(9 * t + 3), C = vid(9 * t + 6);
      if (A === B || B === C || A === C) continue;
      const k = [A, B, C].sort((x, y) => x - y).join(',');
      if (seen.has(k)) continue;
      seen.add(k); tris.push(A, B, C);
    }
    const nv = sum.length / 4, V = new Uint16Array(3 * nv);
    for (let v = 0; v < nv; v++) for (let k = 0; k < 3; k++) V[3 * v + k] = Math.round(sum[4 * v + k] / sum[4 * v + 3]);
    return { V, I: tris, nv, n: tris.length / 3 };
  };
  let g = 65536, W = weld(g);
  // the triangles left go roughly as the square of the cells a side: aim for the budget, then close in
  if (W.n > budget) { const ext = Math.max(...S), mean = Math.sqrt(2 * (S[0] * S[1] + S[1] * S[2] + S[0] * S[2]) / Math.max(1, W.n)); g = Math.max(8, Math.min(4096, Math.floor(ext / mean * Math.sqrt(budget / W.n) * 1.4))); W = weld(g); }
  while (W.n > budget && g > 8) { g = Math.max(8, Math.floor(g * Math.min(0.9, Math.sqrt(budget / W.n)))); W = weld(g); }
  const ib = W.nv <= 65536 ? 2 : 4, vb = 6 * W.nv, off = vb + (vb % 4 ? 4 - vb % 4 : 0);
  const buf = new ArrayBuffer(off + ib * W.I.length);
  new Uint16Array(buf, 0, 3 * W.nv).set(W.V);
  (ib === 2 ? new Uint16Array(buf, off, W.I.length) : new Uint32Array(buf, off, W.I.length)).set(W.I);
  return Object.assign({ enc: 'q16', data: b64OfBytes(new Uint8Array(buf)), n: W.n, nv: W.nv, size, file: file || '' },
    W.n < n0 && g < 65536 ? { orig: n0, cell: +(Math.max(...S) / g).toPrecision(3) } : {});
}
/* a mesh as read from a file: the compact form kept as it is; one saved before it (plain
   float32 triangles) made compact as it comes in, so the bench is small when saved again */
export function stlMeshNorm(M) {
  const base = { data: M.data, n: Math.max(0, num(M.n, 0) | 0), size: Array.isArray(M.size) && M.size.length === 3 ? M.size.map(v => Math.max(0, num(v, 0))) : null, file: String(M.file || '').slice(0, 160) };
  if (M.enc === 'q16') return Object.assign(base, { enc: 'q16', nv: Math.max(0, num(M.nv, 0) | 0) },
    M.orig > 0 ? { orig: Math.max(0, num(M.orig, 0) | 0), cell: Math.max(0, num(M.cell, 0)) } : {});
  try { const T = meshTris(base); if (T.length >= 9) return meshEncode(T, base.file); } catch (err) { /* kept as it was */ }
  return base;
}
/* the triangles of a mesh as kept, 9 numbers each, centred */
export function meshTris(M) {
  const u8 = bytesOfB64(M.data);
  if (M.enc !== 'q16') return new Float32Array(u8.buffer, 0, Math.floor(u8.length / 4));
  const nv = M.nv | 0, n = M.n | 0, vb = 6 * nv, off = vb + (vb % 4 ? 4 - vb % 4 : 0), ib = nv <= 65536 ? 2 : 4;
  if (u8.length < off + ib * 3 * n) return new Float32Array(0);
  const V = new Uint16Array(u8.buffer, 0, 3 * nv), I = ib === 2 ? new Uint16Array(u8.buffer, off, 3 * n) : new Uint32Array(u8.buffer, off, 3 * n);
  const S = (M.size || [0, 0, 0]).map(v => v > 0 ? v : 1e-9), T = new Float32Array(9 * n);
  for (let j = 0; j < 3 * n; j++) { const v = I[j]; if (v >= nv) return new Float32Array(0); for (let k = 0; k < 3; k++) T[3 * j + k] = V[3 * v + k] / 65535 * S[k] - S[k] / 2; }
  return T;
}
/* its triangles and their bounding-volume tree, worked out once a mesh */
export const meshCache = new Map();
export function meshOf(el) {
  const M = el.mesh; if (!M || !M.data) return null;
  const hit = meshCache.get(el.id); if (hit && hit.data === M.data) return hit;
  const T = meshTris(M), n = Math.floor(T.length / 9);
  // the tree: nodes [lo xyz, hi xyz, first, count (leaf) or -1, left, right], triangles sorted into place
  const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i;
  const cen = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) cen[3 * i + k] = (T[9 * i + k] + T[9 * i + 3 + k] + T[9 * i + 6 + k]) / 3;
  const nodes = [];
  const build = (a, b) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let j = a; j < b; j++) { const t = idx[j]; for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) { const x = T[9 * t + 3 * v + k]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x; } }
    const me = nodes.length; nodes.push({ lo, hi, a, b, l: -1, r: -1 });
    if (b - a <= 6) return me;
    const ax = [0, 1, 2].reduce((p, k) => hi[k] - lo[k] > hi[p] - lo[p] ? k : p, 0);
    const part = Array.from(idx.subarray(a, b)).sort((u, v) => cen[3 * u + ax] - cen[3 * v + ax]);
    idx.set(part, a);
    const mid = (a + b) >> 1;
    nodes[me].l = build(a, mid); nodes[me].r = build(mid, b);
    return me;
  };
  if (n) build(0, n);
  const out = { data: M.data, T, n, idx, nodes };
  meshCache.set(el.id, out);
  return out;
}
/* where a ray (from o, along the unit d, in the bench: x, y, height) first meets the object, or
   null: taken into its own frame, as the 3D view draws it (yaw, then tip, then roll) */
export function meshRay(el, o, d, tmin) {
  const M = meshOf(el); if (!M || !M.n) return null;
  const a = el.angle * deg, ca = Math.cos(a), sa = Math.sin(a), t = (el.tip || 0) * deg, ct = Math.cos(t), st = Math.sin(t), r = (el.roll || 0) * deg, cr = Math.cos(r), sr = Math.sin(r);
  const sc = el.scale || 1;
  const into = (x, y, z) => {
    let u = x * ca + y * sa, v = -x * sa + y * ca;                  // un-yawed
    [u, z] = [u * ct + z * st, -u * st + z * ct];                   // un-tipped
    [v, z] = [v * cr + z * sr, -v * sr + z * cr];                   // un-rolled
    return [u / sc, v / sc, z / sc];
  };
  const O = into(o[0] - el.x, o[1] - el.y, o[2] - zOf(el)), D = into(d[0], d[1], d[2]);
  const inv = D.map(v => 1 / (v || 1e-30)), T = M.T, nodes = M.nodes;
  let best = Infinity;
  const stack = [0];
  while (stack.length) {
    const N = nodes[stack.pop()];
    // the slab test against the node's box
    let t0 = tmin / sc, t1 = best;
    for (let k = 0; k < 3; k++) { let ta = (N.lo[k] - O[k]) * inv[k], tb = (N.hi[k] - O[k]) * inv[k]; if (ta > tb) [ta, tb] = [tb, ta]; if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) break; }
    if (t0 > t1) continue;
    if (N.l >= 0) { stack.push(N.l, N.r); continue; }
    for (let j = N.a; j < N.b; j++) {
      // Moller and Trumbore
      const i = 9 * M.idx[j], e1 = [T[i + 3] - T[i], T[i + 4] - T[i + 1], T[i + 5] - T[i + 2]], e2 = [T[i + 6] - T[i], T[i + 7] - T[i + 1], T[i + 8] - T[i + 2]];
      const pv = [D[1] * e2[2] - D[2] * e2[1], D[2] * e2[0] - D[0] * e2[2], D[0] * e2[1] - D[1] * e2[0]], det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
      if (Math.abs(det) < 1e-20) continue;
      const id = 1 / det, tv = [O[0] - T[i], O[1] - T[i + 1], O[2] - T[i + 2]], u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) * id;
      if (u < 0 || u > 1) continue;
      const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], v = (D[0] * qv[0] + D[1] * qv[1] + D[2] * qv[2]) * id;
      if (v < 0 || u + v > 1) continue;
      const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * id;
      if (tt > tmin / sc && tt < best) best = tt;
    }
  }
  return best < Infinity ? best * sc : null;
}
/* its outline on the bench, seen from above, in its own frame before its facing: the convex
   hull of its vertices, tipped and rolled (for drawing, picking and its size) */
export const meshHullCache = new Map();
export function meshHull(el) {
  const M = meshOf(el); if (!M) return [[-5, -5], [5, -5], [5, 5], [-5, 5]];
  const key = M.data.length + '|' + M.data.slice(0, 64) + '|' + (el.tip || 0) + '|' + (el.roll || 0) + '|' + (el.scale || 1);
  const got = meshHullCache.get(el.id); if (got && got.key === key) return got.hull;
  const t = (el.tip || 0) * deg, r = (el.roll || 0) * deg, ct = Math.cos(t), st = Math.sin(t), cr = Math.cos(r), sr = Math.sin(r), sc = el.scale || 1, P = [];
  // (every vertex of a big mesh is more than an outline needs: a few thousand do)
  const step = Math.max(1, Math.floor(M.T.length / 3 / 6000));
  for (let i = 0; i < M.T.length; i += 3 * step) {
    const x = M.T[i] * sc, y0 = M.T[i + 1] * sc, z0 = M.T[i + 2] * sc;
    const y = y0 * cr - z0 * sr, z1 = y0 * sr + z0 * cr;       // rolled
    P.push([x * ct - z1 * st, y]);                               // tipped (its height dropped)
  }
  P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], hi = [];
  for (const q of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = P.length - 1; i >= 0; i--) { const q = P[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
  meshHullCache.set(el.id, { key, hull });
  return hull;
}
/* the object's own height, top and bottom about its centre, as placed (for the 3D view's table) */
export function meshSize(el) { const z = el.mesh && el.mesh.size; return z ? z.map(v => v * (el.scale || 1)) : [10, 10, 10]; }

/* A crystal's outline and the regions inside it, in its local frame, beam along +x */
export function crystalGeom(el) {
  const a = el.size / 2, air = { glass: 'AIR' };
  if (el.shape === 'wollaston') {
    // two wedges on the diagonal: the first with its axis across the beam in the bench plane
    // (p extraordinary), the second with it out of the plane (s extraordinary)
    const L = el.size * Math.tan(el.wedge * deg), l = L / 2;
    const A = bireMat(el.crystal, 'p'), B = bireMat(el.crystal, 's');
    const dl = Math.hypot(2 * l, 2 * a), nx = 2 * a / dl, ny = -2 * l / dl;     // from A (upper left) into B
    return { outline: [[-l, -a], [l, -a], [l, a], [-l, a]], cut: [[-l, -a], [l, a]], faces: [
      [-l, a, -l, -a, -1, 0, A, air], [-l, -a, l, -a, 0, -1, B, air], [l, -a, l, a, 1, 0, B, air], [l, a, -l, a, 0, 1, A, air],
      [-l, -a, l, a, nx, ny, A, B]] };
  }
  if (el.shape === 'glan') {
    // an air gap tilted between the two critical angles: the higher index reflects, the
    // lower one passes; both halves have the optic axis across the beam in the bench plane
    const C = CRYSTALS[el.crystal], um = 0.633, nHi = Math.max(C.o(um), C.e(um)), nLo = Math.min(C.o(um), C.e(um));
    const b = 0.5 * (Math.asin(1 / nHi) + Math.asin(1 / nLo)), g = 0.005;
    const l = a * Math.tan(b) + 0.15 * a, M = bireMat(el.crystal, 'p');
    const nx = Math.cos(b), ny = Math.sin(b), tx = -ny, ty = nx, h = a / Math.cos(b);
    const line = off => [off * nx - h * tx, off * ny - h * ty, off * nx + h * tx, off * ny + h * ty];
    return { outline: [[-l, -a], [l, -a], [l, a], [-l, a]], gap: [line(-g), line(g)], faces: [
      [-l, a, -l, -a, -1, 0, M, air], [-l, -a, l, -a, 0, -1, M, air], [l, -a, l, a, 1, 0, M, air], [l, a, -l, a, 0, 1, M, air],
      [...line(-g), nx, ny, M, air], [...line(g), nx, ny, air, M]] };
  }
  // a beam displacer: its optic axis tilted in the bench plane, so p walks off sideways
  const l = el.length / 2, M = bireMat(el.crystal, 'p', el.axisAngle);
  return { outline: [[-l, -a], [l, -a], [l, a], [-l, a]], faces: [
    [-l, a, -l, -a, -1, 0, M, air], [-l, -a, l, -a, 0, -1, M, air], [l, -a, l, a, 1, 0, M, air], [l, a, -l, a, 0, 1, M, air]] };
}
function crystalSurfaces(el) {
  return crystalGeom(el).faces.map(f => faceSurf(el, ...f));
}

export function elementSurfaces(el) {
  if (el.type === 'stl') return [makeSurf(el, 0, 0, 0, 0, [], 1, { kind: 'absorb', mesh: true })];
  // a source's own light leaves its aperture; light coming the other way (a return beam, another
  // laser's) goes in through it and is lost inside (a horn is open: it receives; a seed of no
  // width, a test's probe inside a cavity, takes nothing in)
  if (el.type === 'source') return el.mmw && !el.mmw.part || !(el.width > 0) ? [] : [makeSurf(el, -0.5, 0, 0, 0, [], el.width / 2 + 0.5, { kind: 'absorb' })];
  if (el.type === 'cube' || el.type === 'prism') return polySurfaces(el);
  if (el.type === 'crystal') return crystalSurfaces(el);
  if (el.type === 'grating' || el.type === 'aom') return [makeSurf(el, 0, 0, 0, 0, [], el.length / 2, { kind: 'grating' })];
  if (el.type === 'eom') return [makeSurf(el, 0, 0, 0, 0, [], el.length / 2, { kind: 'eom' })];
  if (el.type === 'fibre' || el.type === 'detector') return [makeSurf(el, 0, 0, 0, 0, [], el.length / 2, { kind: 'screen' })];
  if (el.type === 'faraday' || el.type === 'isolator') return [makeSurf(el, 0, 0, 0, 0, [], el.length / 2, { kind: 'jones' })];
  if (el.type === 'filter') return [makeSurf(el, 0, 0, 0, 0, [], el.length / 2, { kind: 'filter' })];
  if (el.type === 'gain') return [makeSurf(el, 0, 0, 0, 0, [], el.length / 2, { kind: 'gain' })];
  if (el.type === 'cell') return [makeSurf(el, 0, 0, 0, 0, [], el.length / 2, { kind: 'cell' })];
  if (el.type === 'nlc') {
    // a block of the crystal: its two faces, and the plane in its middle where the harmonic is
    // worked out. The crystal's index (along its z axis, which the converting light sees) sets
    // where a beam focuses inside and what its faces reflect; they are anti-reflection coated
    // unless set bare
    const L = el.nlLen / 2, a = el.length / 2, mat = { glass: 'nlc:' + el.material + ':' + el.temp, nlc: el.material, temp: el.temp }, air = { glass: 'AIR' };
    const coat = el.faces === 'bare' ? { mode: 'bare' } : { mode: 'custom', R: 0.1 };
    const face = x => makeSurf(el, 0, 0, 0, 0, [], a, { kind: 'refract', coat, front: mat, back: air, lf: { x, y: 0, a: x > 0 ? 0 : Math.PI } });
    return [face(-L), makeSurf(el, 0, 0, 0, 0, [], a, { kind: 'nlc' }), face(L)];
  }
  if (el.type === 'link') return [makeSurf(el, 0, 0, 0, 0, [], el.length / 2, { kind: 'link' })];
  if (el.type === 'chopper') return ELEC.chopSurfaces(el);                                    // ELEC hook: shut, a beam block
  if (el.type === 'stop') {
    return stopBlades(el).map(([lo, hi]) => makeSurf(el, 0, 0, 0, 0, [], (hi - lo) / 2,
      { kind: 'absorb', lf: { x: 0, y: (lo + hi) / 2, a: 0 } }));
  }
  if (el.type === 'lens') return lensSurfaces(el);
  if (el.type === 'mirror') {
    const c = el.R ? 1 / el.R : 0;
    if (el.k) return [makeSurf(el, 0, c, el.k, 0, [], el.length / 2, { kind: 'mirror', y0: el.offset || 0 })];
    return [makeSurf(el, 0, c, 0, 0, [], el.length / 2, { kind: 'mirror', y0: el.offset || 0 })];
  }
  if (el.type === 'screen') {
    const c = el.R ? 1 / el.R : 0;      // a curved screen: a retina, a film plane on a curve
    return [makeSurf(el, 0, c, 0, 0, [], el.length / 2, { kind: 'screen' })];
  }
  if (el.type === 'waveplate' || el.type === 'polariser') return [makeSurf(el, 0, 0, 0, 0, [], el.length / 2, { kind: 'jones' })];
  if (el.type === 'mask') {
    const s = makeSurf(el, 0, 0, 0, 0, [], el.length / 2, { kind: 'mask' });
    s.maskFn = maskFns(el).fn;
    return [s];
  }
  return [];
}


