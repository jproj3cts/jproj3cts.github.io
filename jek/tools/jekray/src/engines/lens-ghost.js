import { ffTurn } from '../core/freeform.js';
import { coatR } from '../core/coatings.js';
import { aimRay, lensLaunch, lensParaStep, lensSystem, lensToImage, pupilGrid, rayAt, traceRay } from './lens-engine.js';
import { objOpts } from './lens-design.js';

/* ==========================================================================
   Ghosts: light reflected twice inside a design, off the paths it was designed for
   Every surface sends a little of the light back (bare glass about 4%, a coating less). Light sent back
   by surface a and sent forward again by an earlier surface b reaches the image as a ghost: R_a R_b of
   the light, focused somewhere else. Each pair (a after b) is traced as a design of its own, unfolded:
   forward through the surfaces to a, which is a mirror; back through those between, each met from
   behind (its sag the other way in the frame the light now runs in); b a mirror met from behind; then
   forward to the image as the design goes. The lens engine traces it exactly (folds and all), each ray
   launched where the design's own ray for that pupil point starts, so the stop, the vignetting and the
   aim are the design's.

   For each ghost: where it focuses (paraxially, from the image plane), how wide it is on the image
   (its paraxial marginal ray, and its real rays' RMS radius), how much of its light gets there, and
   how bright it is against the image itself: R_a R_b times the share arriving, over its area, against
   the image's spot (its RMS spot, or the Airy disc if smaller) — both as even discs, so an estimate.
   And where a ghost comes to a focus inside the design, near a surface or in glass: light the
   coatings, cements and glass take there concentrated.
   ========================================================================== */

/* a surface as light meets it running back: its sag the other way (x and y as they were) */
const backward = s => Object.assign({}, s, { R: s.R === null || s.R === undefined ? null : -s.R, a2: -(s.a2 || 0), A: (s.A || []).map(v => -v), odd: s.odd ? s.odd.map(v => -v) : null, F: ffTurn(s.F, 1, -1), stop: false });
/* the unfolded design of the ghost off surface a then b (b < a): its surfaces and where each came from */
export function ghostPrescription(P, a, b) {
  const S = P.surfaces, G = P.gaps, M = P.materials, N = S.length, out = [], gaps = [], mats = [], from = [];
  const put = (s, m, g, f) => { out.push(s); mats.push(m); gaps.push(g); from.push(f); };
  for (let i = 0; i < a; i++) put(S[i], M[i], G[i], i);
  put(Object.assign({}, S[a], { mirror: true, stop: false }), M[a - 1], G[a - 1], a);
  for (let j = a - 1; j > b; j--) put(backward(S[j]), M[j - 1], G[j - 1], j);
  put(Object.assign(backward(S[b]), { mirror: true }), M[b], G[b], b);
  for (let i = b + 1; i < N; i++) put(S[i], M[i], G[i], i);
  gaps.length = mats.length = out.length - 1;
  return { surfaces: out, gaps, materials: mats, stopIndex: -1, from };
}
/* a design the ghosts can be traced in: centred, no mirrors of its own (a fold's ghosts are not followed) */
export const ghostsTraceable = P => P.surfaces.length >= 2 && !P.surfaces.some(s => s.mirror || s.tilt || s.dtilt || s.dec);

/* The ghosts of a design (A, as lens-analysis's anaSystems gives it) at its primary wavelength and field deg:
   coats, each surface's coating (or null for bare); n, the pupil grid across. Brightest against the image first. */
export function ghostAnalysis(A, coats, deg, n) {
  const S = A.Sp, P = A.P, N = S.N, nm = S.nm, th = deg * Math.PI / 180;
  if (!ghostsTraceable(P)) return { ok: false, ghosts: [] };
  const Rs = [];
  for (let i = 0; i < N; i++) Rs.push(coatR(coats && coats[i], S.n[i], S.n[i + 1], nm));
  const imgD = S.imageZ - S.z[N - 1], opts = objOpts(A.c, { image: imgD });
  // the image's own spot: its RMS radius about its centroid, and the Airy disc's radius
  const pts = pupilGrid(n || 15), R = new Float64Array(8), main = [];
  for (const [px, py] of pts) { const r = rayAt(S, th, px, py, R); if (r && r[7] === 0) main.push([r[0], r[1]]); }
  const spread = L => {
    if (!L.length) return { c: [NaN, NaN], rms: NaN };
    const cx = L.reduce((u, p) => u + p[0], 0) / L.length, cy = L.reduce((u, p) => u + p[1], 0) / L.length;
    return { c: [cx, cy], rms: Math.sqrt(L.reduce((u, p) => u + (p[0] - cx) ** 2 + (p[1] - cy) ** 2, 0) / L.length) };
  };
  const ms = spread(main), airy = 1.22 * nm * 1e-6 * A.fw, rMain = Math.max(Math.SQRT2 * ms.rms, airy);
  // where each pupil point's ray starts, as the design aims it
  const starts = pts.map(([px, py]) => aimRay(S, th, px, py));
  // the paraxial marginal ray at the first surface: from the axial object point, or parallel at the pupil's edge
  const m0 = S.obj ? [S.epr * S.obj / (S.obj + S.par.epz), S.epr / (S.obj + S.par.epz)] : [S.epr, 0];
  const ghosts = [];
  for (let a = 1; a < N; a++) for (let b = 0; b < a; b++) {
    const Rab = Rs[a] * Rs[b];
    if (!(Rab > 0)) continue;
    const Pg = ghostPrescription(P, a, b), G = lensSystem(Pg, nm, opts);
    // paraxially: the marginal ray's height at each surface, and where it crosses the axis after the first reflection
    let y = m0[0], u = m0[1], yPrev = null, near = null, waist = Infinity;
    const first = a;                                  // the list index of the first mirror (surfaces before it are the design's own)
    for (let k = 0; k < G.N; k++) {
      [y, u] = lensParaStep(G, m0[0], m0[1], 0, k);    // its height at surface k and its angle after it
      if (k >= first) {
        waist = Math.min(waist, Math.abs(y));
        if (k > first && yPrev !== null && yPrev * y < 0) {
          const t = yPrev / (yPrev - y), gap = G.z[k] - G.z[k - 1], d = Math.min(t, 1 - t) * gap, at = t < 0.5 ? Pg.from[k - 1] : Pg.from[k];
          if (!near || d < near.d) near = { d, surf: at, glass: Math.abs(G.n[k] - 1) > 1e-6 };
        }
      }
      yPrev = y;
    }
    const yImg = y + imgD * u, focus = Math.abs(u) > 1e-14 ? -y / u - imgD : Infinity;
    // a focus after the last surface but before the image
    if (Math.abs(u) > 1e-14 && -y / u > 0 && -y / u < imgD) { const d = -y / u; if (!near || d < near.d) near = { d, surf: N - 1, glass: false, after: true }; }
    // its real rays on the image
    const hit = [];
    starts.forEach(ab => {
      if (!ab) return;
      const Rr = lensLaunch(S, th, ab[0], ab[1], new Float64Array(8));
      traceRay(G, Rr, 0, G.N - 1);
      if (Rr[7] !== 0) return;
      lensToImage(G, Rr);
      if (isFinite(Rr[0]) && isFinite(Rr[1])) hit.push([Rr[0], Rr[1]]);
    });
    const gs = spread(hit), reach = starts.filter(Boolean).length ? hit.length / starts.filter(Boolean).length : 0;
    const rG = Math.max(Math.SQRT2 * gs.rms, airy);
    ghosts.push({ a, b, Ra: Rs[a], Rb: Rs[b], R: Rab, focus, yImg: Math.abs(yImg), rms: gs.rms, centre: gs.c, reach, n: hit.length, waist,
      rel: hit.length ? Rab * reach * (rMain / rG) ** 2 : 0, near, pts: hit });
  }
  ghosts.sort((p, q) => q.rel - p.rel || q.R - p.R);
  return { ok: true, ghosts, main: { rms: ms.rms, airy, c: ms.c, n: main.length }, Rs, deg, nm };
}
/* a ghost's path for drawing, as rayPath draws the design's: [y, z] where it starts, at each surface, and on
   the image plane (in the unfolded design's frame: back along the axis between its two reflections) */
export function ghostPath(A, a, b, deg, px, py) {
  const S = A.Sp, th = deg * Math.PI / 180, ab = aimRay(S, th, px, py);
  if (!ab) return null;
  const G = lensSystem(ghostPrescription(A.P, a, b), S.nm, objOpts(A.c, { image: S.imageZ - S.z[S.N - 1] }));
  const R = lensLaunch(S, th, ab[0], ab[1], new Float64Array(8)), pts = [[R[1], R[2]]];
  for (let i = 0; i < G.N; i++) {
    traceRay(G, R, i, i);
    pts.push([R[1], R[2]]);
    if (R[7] !== 0) return { pts, lost: i };
  }
  const t = ((G.img.p[0] - R[0]) * G.img.d[0] + (G.img.p[1] - R[1]) * G.img.d[1] + (G.img.p[2] - R[2]) * G.img.d[2]) / (R[3] * G.img.d[0] + R[4] * G.img.d[1] + R[5] * G.img.d[2]);
  pts.push([R[1] + R[4] * t, R[2] + R[5] * t]);
  return { pts, lost: -1 };
}
