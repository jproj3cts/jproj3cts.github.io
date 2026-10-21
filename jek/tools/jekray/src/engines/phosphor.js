/* ==========================================================================
   A phosphor screen's glow: where the light lands now (the excitation), and what the face shows,
   which follows the light up at once and fades exponentially, with the decay time, once it moves
   on. Over the face's square, n by n cells: u across the face (its local y), v up (z), both
   -L..L. The excitation is from the diffracted field's irradiance map when it is worked out,
   else from the rays, so it keeps up with a sweep or a drag at any speed. The page keeps the glow
   (ui/phosphor.js); this is only its arithmetic.
   ========================================================================== */
export const PHOS_N = 96;

/* the excitation, 0..1 (its peak 1), from the rays on the face: each source's rays, each by the power it
   carries, blurred just enough that they join up, each way by how far apart they land that way. Rays
   that sample the beam up and down (z: a grid or rings, or tipped out of the plane) show its own shape,
   so a line spread by a cylinder stays a line, across or up; a fan all in the bench's plane says
   nothing of the beam's height, so it is taken as round, as tall as it is wide. hits: the trace's for
   this screen */
export function phosphorFromRays(hits, L, n = PHOS_N) {
  const S = new Float32Array(n * n), cell = 2 * L / n;
  const groups = new Map();
  for (const t of hits || []) {
    if (t.chief || !(t.w > 0) || !isFinite(t.y)) continue;
    const k = t.sid || '';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const wu = new Float32Array(n), wv = new Float32Array(n);
  for (const g of groups.values()) {
    const [sigU, sigV] = phosphorBlur(g, cell);
    for (const t of g) {
      const v0 = isFinite(t.z) ? t.z : 0;
      const iu0 = Math.max(0, Math.floor((t.y - 3 * sigU + L) / cell)), iu1 = Math.min(n - 1, Math.ceil((t.y + 3 * sigU + L) / cell));
      const iv0 = Math.max(0, Math.floor((v0 - 3 * sigV + L) / cell)), iv1 = Math.min(n - 1, Math.ceil((v0 + 3 * sigV + L) / cell));
      if (iu0 > iu1 || iv0 > iv1) continue;
      for (let i = iu0; i <= iu1; i++) { const d = (-L + (i + 0.5) * cell - t.y) / sigU; wu[i] = Math.exp(-0.5 * d * d) / sigU; }
      for (let j = iv0; j <= iv1; j++) { const d = (-L + (j + 0.5) * cell - v0) / sigV; wv[j] = Math.exp(-0.5 * d * d) / sigV; }
      for (let j = iv0; j <= iv1; j++) { const a = t.w * wv[j], row = j * n; for (let i = iu0; i <= iu1; i++) S[row + i] += a * wu[i]; }
    }
  }
  return peakOne(S);
}

/* one source's blur on the face, [across, up], mm: at least 0.7 of a cell each way. Its rays where they land
   (each place once: a ray's polarisations land together), u across, v up. A fan in the bench's plane (no
   heights, or all at one height going level): joined up across, as tall as the spot is wide (a round beam).
   Rays along a line (straight, at any slant): joined up along it, the line kept thin. Rays over an area (a
   grid or rings): joined up each way by the spacing across the pattern, about the square root of the count */
function phosphorBlur(g, cell) {
  const lo = 0.7 * cell, pts = new Map();
  let sw = 0, su = 0, suu = 0, flat = true;
  const z0 = isFinite(g[0].z) ? g[0].z : 0, dz0 = g[0].dz || 0;
  for (const t of g) {
    const v = isFinite(t.z) ? t.z : 0;
    sw += t.w; su += t.w * t.y; suu += t.w * t.y * t.y;
    if (Math.abs(v - z0) > 1e-9 || Math.abs((t.dz || 0) - dz0) > 1e-12) flat = false;
    pts.set(Math.round(t.y * 1e4) + ',' + Math.round(v * 1e4), [t.y, v]);
  }
  const P = [...pts.values()], m = P.length;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, cu = 0, cv = 0;
  for (const [u, v] of P) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); cu += u; cv += v; }
  if (flat) { const mu = su / sw; return [Math.max(lo, m > 1 ? 0.6 * (u1 - u0) / (m - 1) : 0), Math.max(lo, Math.sqrt(Math.max(0, suu / sw - mu * mu)))]; }
  // the spread of the places: its long way (at th to across) and how thick it is across that (sqrt l2)
  cu /= m; cv /= m;
  let a = 0, b = 0, c = 0;
  for (const [u, v] of P) { a += (u - cu) ** 2; b += (u - cu) * (v - cv); c += (v - cv) ** 2; }
  a /= m; b /= m; c /= m;
  const h = Math.hypot((a - c) / 2, b), l1 = (a + c) / 2 + h, l2 = Math.max(0, (a + c) / 2 - h), th = Math.atan2(2 * b, a - c) / 2;
  if (Math.sqrt(l2) < cell) {
    let s0 = Infinity, s1 = -Infinity;
    for (const [u, v] of P) { const s = u * Math.cos(th) + v * Math.sin(th); s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
    const gap = m > 1 && l1 > 0 ? (s1 - s0) / (m - 1) : 0;
    return [Math.max(lo, 0.6 * gap * Math.abs(Math.cos(th))), Math.max(lo, 0.6 * gap * Math.abs(Math.sin(th)))];
  }
  const across = Math.max(2, Math.sqrt(4 * m / Math.PI));
  return [Math.max(lo, 0.6 * (u1 - u0) / (across - 1)), Math.max(lo, 0.6 * (v1 - v0) / (across - 1))];
}

/* the excitation from the diffracted field's irradiance map ({n, u0, u1, v0, v1, v}: row j up, column i across),
   sampled at each cell's centre */
export function phosphorFromMap(M, L, n = PHOS_N) {
  const S = new Float32Array(n * n), cell = 2 * L / n, m = M.n;
  for (let j = 0; j < n; j++) {
    const fv = ((-L + (j + 0.5) * cell) - M.v0) / (M.v1 - M.v0) * m - 0.5;
    if (fv < -0.5 || fv > m - 0.5) continue;
    const j0 = Math.max(0, Math.min(m - 1, Math.floor(fv))), j1 = Math.min(m - 1, j0 + 1), b = Math.max(0, Math.min(1, fv - j0));
    for (let i = 0; i < n; i++) {
      const fu = ((-L + (i + 0.5) * cell) - M.u0) / (M.u1 - M.u0) * m - 0.5;
      if (fu < -0.5 || fu > m - 0.5) continue;
      const i0 = Math.max(0, Math.min(m - 1, Math.floor(fu))), i1 = Math.min(m - 1, i0 + 1), a = Math.max(0, Math.min(1, fu - i0));
      S[j * n + i] = (1 - b) * ((1 - a) * M.v[j0 * m + i0] + a * M.v[j0 * m + i1]) + b * ((1 - a) * M.v[j1 * m + i0] + a * M.v[j1 * m + i1]);
    }
  }
  return peakOne(S);
}
function peakOne(S) {
  let pk = 0;
  for (let i = 0; i < S.length; i++) if (S[i] > pk) pk = S[i];
  if (pk > 0) for (let i = 0; i < S.length; i++) S[i] /= pk;
  return S;
}

/* dt seconds on: the glow B fades by e^(-dt/tau) and is lit at once to wherever the light is now (S; null for
   none). True while it is still changing, so the page knows to keep going */
export function phosphorStep(B, S, dt, tau) {
  const k = Math.exp(-Math.max(0, dt) / Math.max(1e-3, tau));
  let moving = false;
  for (let i = 0; i < B.length; i++) {
    const s = S ? S[i] : 0;
    let b = B[i] * k;
    if (b < 2e-3) b = 0;
    B[i] = b > s ? b : s;
    if (B[i] !== s) moving = true;
  }
  return moving;
}

/* how bright a cell looks for its glow: a phosphor's faint tail still shows */
export const phosphorLook = b => (b > 0 ? Math.min(1, Math.pow(b, 0.6)) : 0);
