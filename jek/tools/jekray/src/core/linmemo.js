/* ==========================================================================
   Answers of a linear problem kept and combined. A particle's scattering is linear in the light on it: the far field
   of a sphere (Mie) and the dipoles of an array (the dipole array's solve) are a linear map of the incident field, for
   a fixed set of wave directions and a fixed particle. So once the answers for a few incident fields are known, any
   field that is a combination of them (the same light in another polarisation, or at another power) has the same
   combination of their answers, with no new solve. Whether a field is such a combination is checked on the field
   itself, to a part in 1e10, never assumed.
   A vector is complex, interleaved: [re, im, re, im, ...] in a Float64Array (or Float32Array for answers kept small).
   ========================================================================== */

/* <a, b> = sum conj(a) b */
export function cdot(a, b) {
  let r = 0, i = 0;
  for (let q = 0; q < a.length; q += 2) { r += a[q] * b[q] + a[q + 1] * b[q + 1]; i += a[q] * b[q + 1] - a[q + 1] * b[q]; }
  return [r, i];
}
const nrm2 = a => { let s = 0; for (let q = 0; q < a.length; q++) s += a[q] * a[q]; return s; };
/* Least squares: the complex c with E ~ sum c_j V_j, by the normal equations (m is a handful, and the vectors kept are
   never nearly parallel: see linAdmit). { c, rel }: rel is |E - sum c V| / |E|, worked out from the vectors themselves. */
export function linFit(V, E) {
  const m = V.length, e2 = nrm2(E);
  if (!m || !(e2 > 0)) return { c: [], rel: e2 > 0 ? 1 : 0 };
  // the Gram matrix and the right side, complex, as an augmented m x (m + 1) system
  const A = [];
  for (let i = 0; i < m; i++) { const row = []; for (let j = 0; j < m; j++) row.push(cdot(V[i], V[j])); row.push(cdot(V[i], E)); A.push(row); }
  for (let col = 0; col < m; col++) {
    let piv = col, best = -1;
    for (let r = col; r < m; r++) { const v = Math.hypot(A[r][col][0], A[r][col][1]); if (v > best) { best = v; piv = r; } }
    if (!(best > 0)) return { c: [], rel: 1 };
    [A[col], A[piv]] = [A[piv], A[col]];
    const p = A[col][col], pd = p[0] * p[0] + p[1] * p[1];
    for (let r = 0; r < m; r++) {
      if (r === col) continue;
      const a = A[r][col], f = [(a[0] * p[0] + a[1] * p[1]) / pd, (a[1] * p[0] - a[0] * p[1]) / pd];
      for (let j = col; j <= m; j++) { const v = A[col][j]; A[r][j] = [A[r][j][0] - (f[0] * v[0] - f[1] * v[1]), A[r][j][1] - (f[0] * v[1] + f[1] * v[0])]; }
    }
  }
  const c = A.map((row, i) => { const p = row[i], b = row[m], pd = p[0] * p[0] + p[1] * p[1]; return [(b[0] * p[0] + b[1] * p[1]) / pd, (b[1] * p[0] - b[0] * p[1]) / pd]; });
  const R = Float64Array.from(E);
  for (let j = 0; j < m; j++) linAxpy(R, [-c[j][0], -c[j][1]], V[j]);
  return { c, rel: Math.sqrt(nrm2(R) / e2) };
}
/* y += a x (complex a) */
export function linAxpy(y, a, x) {
  const ar = a[0], ai = a[1];
  for (let q = 0; q < y.length; q += 2) { const xr = x[q], xi = x[q + 1]; y[q] += ar * xr - ai * xi; y[q + 1] += ar * xi + ai * xr; }
  return y;
}
/* sum c_j W_j, a new Float64Array */
export function linCombine(W, c) {
  const out = new Float64Array(W[0].length);
  for (let j = 0; j < W.length; j++) linAxpy(out, c[j], W[j]);
  return out;
}
export const LIN_TOL = 1e-10;           // a field this close to a combination of those kept takes their answers' combination
const LIN_NEW = 1e-3;                   // and one at least this far from it is kept as a new one (the rest are worked out, not kept)
/* A store of answers by what they are for: key -> { V: fields, W: answers }, the most recently used kept, LIN_KEYS
   of them and LIN_MAX answers each. get(key, E) the combined answer (or null) with the fit; put(key, E, A) keeps one. */
export function linStore(keys = 32, max = 4) {
  const M = new Map();
  return {
    fit(key, E) {
      const s = M.get(key);
      if (!s) return null;
      M.delete(key); M.set(key, s);
      const f = linFit(s.V, E);
      return Object.assign(f, { W: s.W, V: s.V });
    },
    get(key, E) {
      const f = this.fit(key, E);
      return f && f.c.length && f.rel <= LIN_TOL ? linCombine(f.W, f.c) : null;
    },
    put(key, E, A, fit) {
      let s = M.get(key);
      if (!s) { s = { V: [], W: [] }; M.set(key, s); while (M.size > keys) M.delete(M.keys().next().value); }
      const f = fit || linFit(s.V, E);
      if (s.V.length && !(f.rel >= LIN_NEW)) return false;
      s.V.push(Float64Array.from(E)); s.W.push(Float64Array.from(A));
      if (s.V.length > max) { s.V.shift(); s.W.shift(); }
      return true;
    },
    clear() { M.clear(); },
    get size() { return M.size; },
  };
}
/* a short fingerprint of a numeric array (for keys): its length and a hash of its exact bits */
export function arrSig(a) {
  const f = a instanceof Float64Array ? a : Float64Array.from(a), u = new Uint32Array(f.buffer, f.byteOffset, f.length * 2);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < u.length; i++) { h1 = Math.imul(h1 ^ u[i], 16777619); h2 = Math.imul(h2 + u[i], 2246822519) ^ (h2 >>> 13); }
  return a.length + ':' + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}
