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
export function scatPlaneAt(G, dx, dy) {
  const r = Math.hypot(dx, dy), N = G.nRing;
  if (!(r > 0) || r > G.R) return 0;
  let p = Math.atan2(dy, dx) / (2 * Math.PI) * N;
  if (p < 0) p += N;
  const j = Math.floor(p), f = p - j, j0 = j % N, j1 = (j + 1) % N;
  if (r >= G.ringT[f < 0.5 ? j0 : j1]) return 0;
  return (G.ring[j0] * (1 - f) + G.ring[j1] * f) / (r * r);
}
/* the same anywhere about the particle (dz up), from the sphere's grid: its intensity between the four nearest nodes, its
   stop the nearest node's (what the 3D view's shader does) */
export function scatFieldAt(G, dx, dy, dz) {
  const r = Math.hypot(dx, dy, dz);
  if (!(r > 0) || r > G.R) return 0;
  const t = Math.acos(Math.max(-1, Math.min(1, dz / r))) / Math.PI * (G.nT - 1);
  let p = Math.atan2(dy, dx) / (2 * Math.PI) * G.nP;
  if (p < 0) p += G.nP;
  const i = Math.min(G.nT - 2, Math.floor(t)), ft = t - i, j = Math.floor(p), fp = p - j, j0 = j % G.nP, j1 = (j + 1) % G.nP;
  const near = (Math.round(t) * G.nP) + (fp < 0.5 ? j0 : j1);
  if (r >= G.gridT[near]) return 0;
  const a = G.grid[i * G.nP + j0] * (1 - fp) + G.grid[i * G.nP + j1] * fp, b = G.grid[(i + 1) * G.nP + j0] * (1 - fp) + G.grid[(i + 1) * G.nP + j1] * fp;
  return (a * (1 - ft) + b * ft) / (r * r);
}
/* an irradiance on the 2D scale: 0 (the floor) to 1 (the top and above) */
export const scatFieldLevel = (G, v) => v > 0 && G.top > 0 ? Math.max(0, Math.min(1, 1 + Math.log10(v / G.top) / G.dec)) : 0;
