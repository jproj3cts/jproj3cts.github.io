/* ==========================================================================
   Freeform terms: an XY polynomial added to a surface's sag
   sag += Σ c_mn x^m y^n, x out of the plane of the fields (up on the bench), y across it in the
   plane. Only even powers of x: the surface is mirror-symmetric about the bench's plane, so light
   in the plane stays in it. Second to sixth order, fourteen terms, each kept by its key "mn"
   (x² is "20", x²y³ is "23").
   ========================================================================== */
export const FF_TERMS = [[2, 0], [0, 2], [2, 1], [0, 3], [4, 0], [2, 2], [0, 4], [4, 1], [2, 3], [0, 5], [6, 0], [4, 2], [2, 4], [0, 6]];
export const FF_KEYS = FF_TERMS.map(([m, n]) => '' + m + n);
const SUP = { 1: '', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶' };
export const ffLabel = k => { const m = +k[0], n = +k[1]; return (m ? 'x' + SUP[m] : '') + (n ? 'y' + SUP[n] : ''); };
/* the terms kept on a surface: an object of allowed keys to finite numbers (a term just added is 0), or none */
export function normF(F) {
  if (!F || typeof F !== 'object') return undefined;
  const out = {};
  for (const k of FF_KEYS) if (k in F && isFinite(+F[k]) && F[k] !== null && F[k] !== '') out[k] = +F[k];
  return Object.keys(out).length ? out : undefined;
}
/* as a list of [m, n, c] for the trace, the zero terms left out; null when it has none */
export function ffList(F) {
  if (!F) return null;
  const L = [];
  for (const k of FF_KEYS) if (F[k]) L.push([+k[0], +k[1], F[k]]);
  return L.length ? L : null;
}
const pw = (v, n) => { let r = 1; for (let i = 0; i < n; i++) r *= v; return r; };
export function ffSag(L, x, y) { let v = 0; for (const [m, n, c] of L) v += c * pw(x, m) * pw(y, n); return v; }
/* its slope: [d/dx, d/dy] */
export function ffGrad(L, x, y) {
  let gx = 0, gy = 0;
  for (const [m, n, c] of L) { if (m) gx += c * m * pw(x, m - 1) * pw(y, n); if (n) gy += c * n * pw(x, m) * pw(y, n - 1); }
  return [gx, gy];
}
/* the terms with y turned over (sy = -1) and the sag's sign turned (sz = -1): a surface read the other way round */
export function ffTurn(F, sy, sz) {
  if (!F) return F;
  const out = {};
  for (const k of Object.keys(F)) out[k] = sz * (+k[1] % 2 && sy < 0 ? -1 : 1) * F[k];
  return out;
}
