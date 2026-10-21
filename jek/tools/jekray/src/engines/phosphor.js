/* ==========================================================================
   A phosphor screen's glow: where the light lands now (the excitation), and what the face shows,
   which follows the light up at once and fades exponentially, with the decay time, once it moves
   on. Over the face's square, n by n cells: u across the face (its local y), v up (z), both
   -L..L. The excitation is from the diffracted field's irradiance map when it is worked out,
   else from the rays, so it keeps up with a sweep or a drag at any speed. The page keeps the glow
   (ui/phosphor.js); this is only its arithmetic.
   ========================================================================== */
export const PHOS_N = 96;

/* the excitation, 0..1 (its peak 1), from the rays on the face: each source's rays spread across
   the face as they land, and up and down as far as across (a round beam; the rays are traced in
   the bench's plane), each by the power it carries. hits: the trace's for this screen */
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
    let sw = 0, su = 0, suu = 0;
    for (const t of g) { sw += t.w; su += t.w * t.y; suu += t.w * t.y * t.y; }
    const mu = su / sw, rms = Math.sqrt(Math.max(0, suu / sw - mu * mu));
    const ys = g.map(t => t.y).sort((a, b) => a - b), gap = ys.length > 1 ? (ys[ys.length - 1] - ys[0]) / (ys.length - 1) : 0;
    // across: wide enough that a fan's rays join up; up and down: as wide as the spot is across
    const sigU = Math.max(0.7 * cell, 0.6 * gap), sigV = Math.max(0.7 * cell, rms);
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
