import { Z0_OHM } from '../core/scatter.js';

/* ---------- A particle's scattered field, as a picture ----------
   An estimate of the light a Particle part scatters, for the bench to draw as it draws the diffracted field (in 2D on
   the bench plane, in 3D as glowing light), turned on by its scatField. It is the particle's own far-field pattern
   falling off as 1/r²: the irradiance at a distance r (mm) along a direction is the radiant intensity there (W/sr, the
   far field's |E|² r² / 2Z summed over the beams that drive it, as powers) over r², and nothing past the first part that
   direction meets, which the trace's own probe rays find (engines/scatter-light.js, the probe). Intensity only: its
   fringes with the driving beam are a wavelength apart, too fine for any view of the bench; and the far field only,
   which is good from a few wavelengths out, a few micrometres. A picture: nothing reads it.
   Its brightness has a scale of its own (the scattered light is a millionth of the beam's or less): logarithmic, SF_DEC
   decades, the top where the strongest direction is SF_REACH_DB/20 decades of distance in from the field's reach R, so
   that direction fades to the floor at R. In 3D the light is added up along each line of sight, which falls as 1/b with
   the distance b of the line from the particle where the irradiance falls as 1/b²: its scale has half the decades, so
   the light reaches as far in both views. Bounded: per particle SF_RING directions in the plane and an SF_NT x SF_NP grid
   over the sphere, probed once while the parts stay where they are. */
export const SF_RING = 720;                  // directions round the particle in the bench plane (half a degree apart)
export const SF_NT = 37, SF_NP = 72;         // and over the sphere: theta from straight up, 5 degrees apart; phi round, 5 degrees
export const SF_DEC = 4;                     // the 2D scale's decades (40 dB); the 3D one's half that
export const SF_NONE = 1e9;                  // a direction that meets nothing: no stop

/* the directions to probe, [x, y, z] each: the ring in the bench plane, then the sphere's grid row by row (theta) */
export function scatFieldDirs() {
  const out = [];
  for (let j = 0; j < SF_RING; j++) { const a = 2 * Math.PI * j / SF_RING; out.push([Math.cos(a), Math.sin(a), 0]); }
  for (let i = 0; i < SF_NT; i++) {
    const t = Math.PI * i / (SF_NT - 1), s = Math.sin(t), c = Math.cos(t);
    for (let j = 0; j < SF_NP; j++) { const a = 2 * Math.PI * j / SF_NP; out.push([s * Math.cos(a), s * Math.sin(a), c]); }
  }
  return out;
}
/* The field's picture from the far fields along those directions. F: one array of 6 numbers a direction per launch (as
   farAt gives them), nMed the medium's index; met: what each direction's probe ray met first ({ t } in mm, or null);
   reach: the farthest part that catches light, mm. */
export function scatFieldBuild(Fs, nMed, met, reach) {
  const n = SF_RING + SF_NT * SF_NP, I = new Float32Array(n), T = new Float32Array(n), Z = Z0_OHM / (nMed || 1);
  let Imax = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const F of Fs) for (let q = 0; q < 6; q++) s += F[6 * i + q] ** 2;
    I[i] = s / (2 * Z);
    if (I[i] > Imax) Imax = I[i];
    const m = met && met[i];
    T[i] = m && m.t > 0 ? m.t : SF_NONE;
  }
  // the reach: twice as far as the farthest part that catches light, within 25 to 250 mm
  const R = Math.max(25, Math.min(250, 2 * (reach || 0))), rTop = R / 10 ** (SF_DEC / 2);
  return { R, dec: SF_DEC, dec3: SF_DEC / 2, rTop, Imax, top: Imax / (rTop * rTop), line: Math.PI * Imax / rTop, nRing: SF_RING, nT: SF_NT, nP: SF_NP,
    ring: I.slice(0, SF_RING), ringT: T.slice(0, SF_RING), grid: I.slice(SF_RING), gridT: T.slice(SF_RING) };
}
/* the irradiance (W/mm²) at (dx, dy) mm from the particle in the bench plane: the ring's intensity between its two
   nearest directions over r², nothing past the stop of the nearest one or the reach */
export function scatPlaneAt(G, dx, dy, R = G.R) {
  const r = Math.hypot(dx, dy), N = G.nRing;
  if (!(r > 0) || r > R) return 0;
  let p = Math.atan2(dy, dx) / (2 * Math.PI) * N;
  if (p < 0) p += N;
  const j = Math.floor(p), f = p - j, j0 = j % N, j1 = (j + 1) % N;
  if (r >= G.ringT[f < 0.5 ? j0 : j1]) return 0;
  return (G.ring[j0] * (1 - f) + G.ring[j1] * f) / (r * r);
}
/* the same anywhere about the particle (dz up), from the sphere's grid: its intensity between the four nearest nodes, its
   stop the nearest node's (what the 3D view's shader does) */
export function scatFieldAt(G, dx, dy, dz, R = G.R) {
  const r = Math.hypot(dx, dy, dz);
  if (!(r > 0) || r > R) return 0;
  const t = Math.acos(Math.max(-1, Math.min(1, dz / r))) / Math.PI * (G.nT - 1);
  let p = Math.atan2(dy, dx) / (2 * Math.PI) * G.nP;
  if (p < 0) p += G.nP;
  const i = Math.min(G.nT - 2, Math.floor(t)), ft = t - i, j = Math.floor(p), fp = p - j, j0 = j % G.nP, j1 = (j + 1) % G.nP;
  const near = (Math.round(t) * G.nP) + (fp < 0.5 ? j0 : j1);
  if (r >= G.gridT[near]) return 0;
  const a = G.grid[i * G.nP + j0] * (1 - fp) + G.grid[i * G.nP + j1] * fp, b = G.grid[(i + 1) * G.nP + j0] * (1 - fp) + G.grid[(i + 1) * G.nP + j1] * fp;
  return (a * (1 - ft) + b * ft) / (r * r);
}
/* The Scale a particle's figure and pictures are drawn on (its scatScale, the Scattering tab's Scale): dB below the top for a
   log scale, 0 for linear. 'log' is what benches before the choice of depth saved: 40 dB, still drawn so, no longer offered. */
export const SCAT_SCALES = [['lin', 'Linear', 0], ['log30', 'Logarithmic, 30 dB', 30], ['log60', 'Logarithmic, 60 dB', 60], ['log90', 'Logarithmic, 90 dB', 90]];
export const scatDbOf = sc => sc === 'log' ? 40 : (SCAT_SCALES.find(q => q[0] === sc) || [0, 0, 40])[2];
/* an irradiance on the 2D scale: 0 (the floor) to 1 (the top and above); logarithmic over db dB (the field's own 40 when
   not given), or linear from nought to the top with db 0 */
export const scatFieldLevel = (G, v, db = 10 * G.dec) => !(v > 0 && G.top > 0) ? 0 : !db ? Math.min(1, v / G.top) : Math.max(0, Math.min(1, 1 + 10 * Math.log10(v / G.top) / db));
/* how far out the picture is drawn on a scale: on a log one, where the strongest direction meets the floor (the field's
   reach R at 40 dB, further on a deeper scale, nearer on a shallower one); linear, the reach */
export const scatReach = (G, db) => db > 0 ? G.rTop * 10 ** (db / 20) : G.R;

/* ---------- Past the first part: the light the cones carry on ----------
   The 1/r² picture ends at the first part each direction meets. A part that passes the light on (a lens, a window, a
   splitter) does so in the cones' rays, which the trace follows on to whatever stops them (engines/scatter-light.js).
   Past the first part the picture is made from those rays, as tubes: each ray of a cone stands for the solid angle sa it
   was launched into, and its neighbours in the cone's grid (the next ring out, the next spoke round) bound its tube. Where
   the ray is, the tube's cross-section is rho |a x b|, a and b the steps square to the ray to the two neighbours (each
   on its own path between the same two faces) (the same face crossed, the same share of the way between two), rho = sa / |da x db| from the launch
   directions (da, db the same steps a unit from the particle), so that by the particle the tube is sa r², and the irradiance, the ray's power over its tube, is what the
   1/r² picture has: the two join where the light enters the part. The ray's power is its weight against its cone's
   strongest (the trace's own, Fresnel losses and all). An estimate of where the light goes and how bright it is, from the
   rays' geometry: no diffraction, so at a focus it is as narrow as the rays make it (held to SF_DMIN across).
   For each cone: its rays that go on past their first part, each as samples along its way from there, SF_SUB to a stretch
   between two faces, [x, y, z, E (W/mm²), d (the tube's diameter, mm)] each, and the ray's place in the grid. */
export const SF_SUB = 8;
export const SF_DMIN = 0.02;                 // mm: the narrowest a tube is taken to be
export const SF_GROW = 20;                   // and the most it may widen past the first face before it is taken to have lost its neighbours
/* the step from p to where the stretch k of a neighbour (Q, points by threes) crosses the plane through p square to (ux,
   uy, uz), into out; false where the stretch runs along that plane */
function sfAcross(Q, k, p, ux, uy, uz, out) {
  const ex = Q[3 * k + 3] - Q[3 * k], ey = Q[3 * k + 4] - Q[3 * k + 1], ez = Q[3 * k + 5] - Q[3 * k + 2], den = ex * ux + ey * uy + ez * uz;
  if (!(Math.abs(den) > 1e-12 * Math.hypot(ex, ey, ez) * Math.hypot(ux, uy, uz))) return false;
  const tau = -((Q[3 * k] - p[0]) * ux + (Q[3 * k + 1] - p[1]) * uy + (Q[3 * k + 2] - p[2]) * uz) / den;
  out[0] = Q[3 * k] + tau * ex - p[0]; out[1] = Q[3 * k + 1] + tau * ey - p[1]; out[2] = Q[3 * k + 2] + tau * ez - p[2];
  return true;
}
const sfCross = (a, b) => Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
/* v: a cone's virtual source (its vRays, each with ri, sj, sa, d; vLp its strongest ray's power, mW; scat.grid); rays: the
   trace's rays of that source ({ pts, zs, w, rid }) */
export function scatThrough(v, rays) {
  const g = v.scat && v.scat.grid;
  if (!g || !v.vRays || !(v.vLp > 0)) return null;
  const nP = g.nP, top = v.vLp * 1e-3;
  // each ray of the cone by its place in the grid: its main branch (the one that carries most) as a list of points
  const at = new Map();
  for (const r of rays) {
    const id = String(r.rid), V = v.vRays[+id.slice(id.lastIndexOf(':') + 1)];
    if (!V || V.off || !r.pts || r.pts.length < 6) continue;
    const key = V.ri * 4096 + V.sj, o = at.get(key);
    if (o && o.r.w >= r.w) continue;
    const n = r.pts.length >> 1, P = new Float64Array(3 * n);
    for (let i = 0; i < n; i++) { P[3 * i] = r.pts[2 * i]; P[3 * i + 1] = r.pts[2 * i + 1]; P[3 * i + 2] = r.zs ? r.zs[i] : 0; }
    at.set(key, { r, V, P, n });
  }
  const out = [];
  for (const R0 of at.values()) {
    const { V, P, n } = R0;
    const ring = at.get((V.ri + 1) * 4096 + V.sj) || at.get((V.ri - 1) * 4096 + V.sj);
    const spoke = at.get(V.ri * 4096 + (V.sj + 1) % nP) || at.get(V.ri * 4096 + (V.sj - 1 + nP) % nP);
    if (!ring || !spoke || !(V.sa > 0)) continue;
    // (at the launch: the neighbours' directions where they cross the plane square to this ray a unit from the particle)
    const at1 = W => { const c = W[0] * V.d[0] + W[1] * V.d[1] + W[2] * V.d[2]; return [0, 1, 2].map(q => W[q] / c - V.d[q]); };
    const c0 = sfCross(at1(ring.V.d), at1(spoke.V.d));
    const m = Math.min(n, ring.n, spoke.n);
    if (!(c0 > 0) || m < 3) continue;
    const rho = V.sa / c0, Pw = R0.r.w * top, S = new Float32Array(5 * (m - 2) * (SF_SUB + 1)), p = [0, 0, 0], a = [0, 0, 0], b = [0, 0, 0];
    let o = 0, d1 = 0;
    // from the first face on: the stretches between faces 1 .. m-1 (a ray whose neighbours went another way, meeting
    // other faces, shows as a tube grown past SF_GROW times what it was at the first face: it ends there)
    stretch: for (let k = 1; k < m - 1; k++) for (let s = 0; s <= SF_SUB; s++) {
      const t = s / SF_SUB;
      for (let q = 0; q < 3; q++) p[q] = P[3 * k + q] + t * (P[3 * k + 3 + q] - P[3 * k + q]);
      // the steps to the neighbours square to the ray: where each neighbour's own stretch (as a line) crosses the plane
      // through this point square to the ray (a neighbour meets a face nearer or further on, and is followed to that plane)
      const ux = P[3 * k + 3] - P[3 * k], uy = P[3 * k + 4] - P[3 * k + 1], uz = P[3 * k + 5] - P[3 * k + 2];
      if (!sfAcross(ring.P, k, p, ux, uy, uz, a) || !sfAcross(spoke.P, k, p, ux, uy, uz, b)) break stretch;
      const A = Math.max(rho * sfCross(a, b), Math.PI * SF_DMIN * SF_DMIN / 4), dd = Math.sqrt(4 * A / Math.PI);
      if (!d1) d1 = dd;
      else if (dd > SF_GROW * d1) break stretch;
      S[o] = p[0]; S[o + 1] = p[1]; S[o + 2] = p[2]; S[o + 3] = Pw / A; S[o + 4] = dd; o += 5;
    }
    if (o > 5) out.push({ ri: V.ri, sj: V.sj, s: o < S.length ? S.slice(0, o) : S });
  }
  return out.length ? { nP, nR: g.th.length, rays: out } : null;
}
