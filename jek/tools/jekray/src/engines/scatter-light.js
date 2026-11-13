import { Z0_OHM, gaussLegendre } from '../core/scatter.js';
import { wavelengthColour } from '../core/colour.js';
import { lagOf, splitRoot } from '../core/coherence.js';
import { toWorld } from '../core/mask.js';
import { sagFn } from '../core/geometry.js';
import { cross3, unit3 } from '../core/numeric.js';
import { deg, project } from '../state/project.js';
import { getEl } from '../state/elements.js';
import { PARTS } from '../parts/registry.js';
import { lastTrace, polFrame, zOf } from './trace.js';
import { scatCache, scatModeNow, scatterNow, scatterPrep } from './scatter.js';
import { beamFieldAt } from './fibre-face.js';

/* ---------- A particle's scattered light, put back on the bench ----------
   A Particle part's scattering answer (engines/scatter.js) holds the far field's complex amplitude over the sphere
   of directions, a launch each. The trace puts that light on the bench in two steps (see the end of traceSceneOnce).
   The probe: a fan of rays over the whole sphere, and with it a look at each part of the bench (a few rays over the
   cone it fills as seen from the particle), traced one step by the tracer itself, which says what each meets first;
   it is kept while the parts and the particle stay where they are. So a part hidden behind another catches nothing
   directly, and a part too small for the fan to find still has its own cone looked at. A part that was seen is sent
   its whole cone; a ray of it that meets another part first is stopped there by the trace and counted for neither.
   The cones: for each part that some ray met first, the rays of its cone that did are launched as light of the
   driving laser: each ray's amplitudes are the far field's along it (its two polarisations, with their phases),
   scaled so the ray carries the power scattered into the solid angle it stands for, and in the coherence family
   of the beam that drives the particle, with its phase held against that beam's own at the particle (beamFieldAt).
   A cone's rays are a grid (rings by spokes), and each keeps its place in it: where a ray's neighbours land on a
   face gives the area the ray's tube has there, so a face can turn the ray's power into a field (per root of area)
   and add it to the Gaussian beams it reads and to other cones (engines/fibre-face.js). The fan itself is kept as a picture
   (lastTrace.scat.fans), as bright as the pattern is along each ray, and is never part of a reading.
   Bounded: per particle one probe of SC_FAN directions and a cone of SC_RINGS x SC_SPOKES rays for each part looked
   at; of the cones that catch light the SC_MAX_CONES + 2 that catch most are followed (a part's cone, and its patch
   where the driving beam runs on into it), for each coherent launch that drives the particle. */
export const SC_MAX_CONES = 8;
export let SC_RINGS = 8, SC_SPOKES = 24;
/* (the tests: a finer cone, to tell what a figure owes to the cone's sampling) */
export function setScGrid(rings, spokes) { SC_RINGS = rings; SC_SPOKES = spokes; }
const SC_PLANE = 48;                        // the fan's rays in the bench plane, which the 2D view draws
const SC_UP = [[30, 24], [60, 12], [80, 6]];   // and its rings above and below the plane: elevation (degrees), rays round
const SC_LOOK = 17;                         // the rays that look at a part before its whole cone is probed: its axis and two rings of eight
const SC_PATCH = 3;                         // a patch about a driving beam's way: this many of the beam's far-field radii

/* The far field of launch L along any directions, from the answer's map: F as core/scatter.js writes it, 6 numbers a
   direction. The map's nodes are Gauss-Legendre in cos(theta) about far.axes[2] and even in phi from axes[0] towards
   axes[1]; between them a cubic through the four nearest each way (the Cartesian components, which are smooth over
   the poles), then the part along the direction itself taken off. */
export function farAt(far, L, dirs, out) {
  const [ex, ey, ez] = far.axes, nT = far.mu.length, nP = far.phi.length, F = far.F[L], n = dirs.length / 3, o = out || new Float64Array(6 * n);
  const th = Float64Array.from(far.mu, v => Math.acos(v));          // falling from near pi to near 0
  const wt = [0, 0, 0, 0], wp = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const rx = dirs[3 * i], ry = dirs[3 * i + 1], rz = dirs[3 * i + 2];
    const c = Math.max(-1, Math.min(1, rx * ez[0] + ry * ez[1] + rz * ez[2])), t = Math.acos(c);
    let ph = Math.atan2(rx * ey[0] + ry * ey[1] + rz * ey[2], rx * ex[0] + ry * ex[1] + rz * ex[2]);
    if (ph < 0) ph += 2 * Math.PI;
    // the theta nodes either side
    let lo = 0, hi = nT - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (th[m] >= t) lo = m; else hi = m; }
    const i0 = Math.max(0, Math.min(nT - 4, lo - 1));
    for (let a = 0; a < 4; a++) { let l = 1; for (let b = 0; b < 4; b++) if (b !== a) l *= (t - th[i0 + b]) / (th[i0 + a] - th[i0 + b]); wt[a] = l; }
    const p = ph / (2 * Math.PI) * nP, j = Math.floor(p), f = p - j;
    wp[0] = -f * (f - 1) * (f - 2) / 6; wp[1] = (f + 1) * (f - 1) * (f - 2) / 2; wp[2] = -(f + 1) * f * (f - 2) / 2; wp[3] = (f + 1) * f * (f - 1) / 6;
    let v0 = 0, v1 = 0, v2 = 0, v3 = 0, v4 = 0, v5 = 0;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      const q = 6 * ((i0 + a) * nP + ((j - 1 + b) % nP + nP) % nP), w = wt[a] * wp[b];
      v0 += w * F[q]; v1 += w * F[q + 1]; v2 += w * F[q + 2]; v3 += w * F[q + 3]; v4 += w * F[q + 4]; v5 += w * F[q + 5];
    }
    const lr = v0 * rx + v2 * ry + v4 * rz, li = v1 * rx + v3 * ry + v5 * rz;
    o[6 * i] = v0 - lr * rx; o[6 * i + 1] = v1 - li * rx; o[6 * i + 2] = v2 - lr * ry; o[6 * i + 3] = v3 - li * ry; o[6 * i + 4] = v4 - lr * rz; o[6 * i + 5] = v5 - li * rz;
  }
  return o;
}
/* The rays of a cone of half-angle `half` about a unit axis: their directions (SC_RINGS Gauss-Legendre rings in the
   angle from the axis, so the middle of the cone, where a beam going the same way is, has its share of them; SC_SPOKES
   round, phi from the level direction across the axis) and the solid angle each stands for. flat[i]: 1 for the rays of the two spokes nearest the level plane through the axis, one either side,
   which stand for the cone where a 2D view shows it. */
export function coneDirs(axis, half) {
  const g = gaussLegendre(SC_RINGS), n = SC_RINGS * SC_SPOKES, dirs = new Float64Array(3 * n), w = new Float64Array(n), flat = new Uint8Array(n);
  const t = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], ex = unit3(cross3(t, axis)), ey = cross3(axis, ex);
  for (let i = 0; i < SC_RINGS; i++) {
    const th = 0.5 * half * (g.x[i] + 1), s = Math.sin(th), mu = Math.cos(th);
    for (let j = 0; j < SC_SPOKES; j++) {
      const ph = 2 * Math.PI * (j + 0.5) / SC_SPOKES, c = Math.cos(ph) * s, sn = Math.sin(ph) * s, o = i * SC_SPOKES + j;
      for (let q = 0; q < 3; q++) dirs[3 * o + q] = c * ex[q] + sn * ey[q] + mu * axis[q];
      w[o] = g.w[i] * 0.5 * half * s * 2 * Math.PI / SC_SPOKES;
    }
    for (const j of [0, SC_SPOKES / 2]) flat[i * SC_SPOKES + j] = 1;
  }
  return { dirs, w, flat, n, th: Array.from(g.x, x => 0.5 * half * (x + 1)), nP: SC_SPOKES };
}
/* The power (W) of launch L into each ray of a set (dirs, with the solid angle w of each), and the rays'
   amplitudes on the tracer's own s and p (polFrame): the far field along the ray turned by the phase `rot`
   (radians), each scaled to carry its power against `Pref` W. */
export function coneAmps(far, L, nMed, dirs, w, rot = 0, Pref = 0) {
  const n = w.length, F = farAt(far, L, dirs), P = new Float64Array(n), J = new Float64Array(4 * n), Z = Z0_OHM / nMed, cr = Math.cos(rot), sr = Math.sin(rot);
  let top = 0;
  for (let i = 0; i < n; i++) { let s = 0; for (let q = 0; q < 6; q++) s += F[6 * i + q] ** 2; P[i] = s * w[i] / (2 * Z); if (P[i] > top) top = P[i]; }
  const ref = Pref > 0 ? Pref : top;
  if (ref > 0) for (let i = 0; i < n; i++) {
    const d = [dirs[3 * i], dirs[3 * i + 1], dirs[3 * i + 2]], [S, Pv] = polFrame(d, 1), g = Math.sqrt(w[i] / (2 * Z) / ref), o = 6 * i;
    const sR = F[o] * S[0] + F[o + 2] * S[1] + F[o + 4] * S[2], sI = F[o + 1] * S[0] + F[o + 3] * S[1] + F[o + 5] * S[2];
    const pR = F[o] * Pv[0] + F[o + 2] * Pv[1] + F[o + 4] * Pv[2], pI = F[o + 1] * Pv[0] + F[o + 3] * Pv[1] + F[o + 5] * Pv[2];
    J[4 * i] = g * (sR * cr - sI * sr); J[4 * i + 1] = g * (sR * sr + sI * cr); J[4 * i + 2] = g * (pR * cr - pI * sr); J[4 * i + 3] = g * (pR * sr + pI * cr);
  }
  return { P, J, top: ref };
}
/* the smallest cone that holds two: [axis, half] each */
function coneJoin(a, b) {
  const c = Math.max(-1, Math.min(1, a[0][0] * b[0][0] + a[0][1] * b[0][1] + a[0][2] * b[0][2])), dl = Math.acos(c);
  if (dl + b[1] <= a[1]) return a;
  if (dl + a[1] <= b[1]) return b;
  const half = Math.min(0.5 * (dl + a[1] + b[1]), 89 * deg), turn = (half - a[1]) / (dl || 1);
  // the axis: a's turned towards b's by half - a's half
  const s = Math.sin(dl) || 1, k0 = Math.sin((1 - turn) * dl) / s, k1 = Math.sin(turn * dl) / s;
  return [unit3([k0 * a[0][0] + k1 * b[0][0], k0 * a[0][1] + k1 * b[0][1], k0 * a[0][2] + k1 * b[0][2]]), half];
}
/* The cone a part fills as seen from a point P (mm; P[2] the height): about its faces' discs (a square part's
   corners too), each face where the trace has it. Null for a part with no face to aim at (an STL object is met
   by the probe's fan and stops light, but is not sent a cone). */
function partCone(P, el, ss) {
  let cone = null;
  const sq = PARTS[el.type] && PARTS[el.type].zSquare, zh = PARTS[el.type] && PARTS[el.type].zHalf;
  for (const s of ss) {
    if (s.kind === 'iris' || s.mesh || !(s.semi > 0)) continue;
    // (a curved face's disc is its rim's, where its sag has taken it: the cone to the rim is the face as the particle sees it)
    const [wx, wy] = toWorld(s.f, (s.z || 0) + (s.flat ? 0 : sagFn(s, s.semi)), 0), v = [wx - P[0], wy - P[1], zOf(el) - P[2]], dist = Math.hypot(v[0], v[1], v[2]);
    if (dist < 1e-6) continue;
    const r = zh ? Math.hypot(s.semi, zh(el)) : sq ? s.semi * Math.SQRT2 : s.semi, one = [[v[0] / dist, v[1] / dist, v[2] / dist], Math.min(Math.atan2(r, dist), 89 * deg)];
    cone = cone ? coneJoin(cone, one) : one;
  }
  return cone;
}
const vsrc = (el, pos, nm, root, extra) => Object.assign({ type: 'source', virtual: true, name: el.name, bench: el.bench, x: pos[0], y: pos[1], z: pos[2], angle: 0, wavelength: nm, lines: [],
  colourAuto: true, colour: wavelengthColour(nm), gauss: false, rays: 1, traceRays: true, width: 0, divergence: 0, pol: 's', polAngle: 0, coh: (root && root.coh) || 0,
  lineshape: (root && root.lineshape) || 'lorentz', power: 0, vLp: 0, tau: 0, vJ: [1, 0, 0, 0], vRoot: root, vLag: 0, vKey: 'scat:q0', vFo: 0, sweeps: {} }, extra);

const PROBES = new Map();                   // particle id -> { key, met }: its last probe, and what it was for
const SRC_LIGHT = new Set(['power', 'wavelength', 'lines', 'colour', 'colourAuto', 'pol', 'polAngle', 'coh', 'lineshape', 'cmode', 'bw', 'tau', 'pshape', 'rep', 'gdd0', 'splitPhase', 'splitPath', 'rays', 'traceRays', 'pattern', 'popN', 'popModel', 'm2', 'w0', 'z0', 'gauss']);
function probeCut(k, v) {
  if (k === 'sweeps' || k === 'name' || k === 'label' || k === 'lineColour' || k === 'fillColour' || k === 'hide3d') return undefined;
  if (this && this.type === 'source' && SRC_LIGHT.has(k)) return undefined;
  if (this && this.type === 'particle' && k !== 'id' && k !== 'type') return undefined;       // another particle is no surface
  return v;
}
/* The trace's two steps for every Particle part with its light on: { probes, cones(), report(hits) }, or null when
   there is none. surfsBy: the trace's own surfaces, a bench each. */
export function scatterLaunch(surfsBy) {
  const parts = project.elements.filter(e => e.type === 'particle' && e.scatLight !== false);
  if (!parts.length) return null;
  const B = lastTrace.beams || [], states = [];
  for (const el of parts) {
    const st = { el, state: 'none', S: null, key: null, cands: [], fan: null, caught: [], cones: [], waveSrc: [] };
    states.push(st);
    const job = scatterPrep(el);
    if (!job) { st.state = 'dark'; continue; }
    st.key = job.key;
    let c = scatCache.get(el.id);
    if (!(c && c.key === job.key) && scatModeNow() === 'sync') { scatterNow(el); c = scatCache.get(el.id); }
    if (!c || !c.S || c.S.error || !c.S.far) { st.state = c && c.key === job.key ? 'dark' : 'wait'; continue; }
    st.S = c.S; st.state = c.key === job.key ? 'ok' : 'stale';
    const S = st.S, e0 = S.elPos || [el.x, el.y, zOf(el)];
    // where it is: where the answer has it, moved with the part while a new answer is on its way
    st.pos = [S.pos[0] + el.x - e0[0], S.pos[1] + el.y - e0[1], S.pos[2] + zOf(el) - e0[2]];
    // each launch against the beam that drives it: the beam must still be the one the answer was worked out for
    st.launches = S.far.F.map((F, L) => {
      const ref = S.far.refs && S.far.refs[L], b = ref && B[ref.beam];
      if (!b || b.src !== ref.src || b.bench !== el.bench) return null;
      const src0 = getEl(b.src), root = src0 ? splitRoot(src0) : null;
      if (!root) return null;
      // the phase to turn the answer's far field by, so that it stands against the trace's own beam as it does against the answer's
      const BF = b.coh === ref.coh ? beamFieldAt(ref.beam, st.pos[0], st.pos[1], st.pos[2]) : null;
      let rot = null, gj0 = 0;
      if (BF) {
        gj0 = BF.A.gj || 0;
        const [S3, P3] = polFrame([b.dx, b.dy, 0], b.par ? -1 : 1), E = BF.E;
        let re = 0, im = 0;
        // the trace's field there as the physicists write it (the faces' convention conjugated), against the answer's: sum conj(E_ref) . E_trace
        for (let q = 0; q < 3; q++) { const vr = E[0] * S3[q] + E[2] * P3[q], vi = -(E[1] * S3[q] + E[3] * P3[q]); re += ref.E[2 * q] * vr + ref.E[2 * q + 1] * vi; im += ref.E[2 * q] * vi - ref.E[2 * q + 1] * vr; }
        if (re * re + im * im > 0) rot = Math.atan2(im, re);
      }
      const t = (st.pos[0] - b.x0) * b.dx + (st.pos[1] - b.y0) * b.dy;
      // the beam's own far-field half-angle (1/e^2), which its light fills about its way on from the particle
      const lamM = b.nm * 1e-6 / b.n, th0 = lamM / (Math.PI * Math.sqrt(lamM * b.qi / Math.PI));
      return { L, b, root, rot, gj0, th0, nm: b.nm, fo: b.fo || 0, coh: b.coh, gpl0: (b.gpl || 0) + (b.ng || b.n) * t, lag: lagOf(src0) };
    }).filter(Boolean);
    if (!st.launches.length) { st.state = 'wait'; continue; }
    // the probe's rays: the fan, and a look at every part of the particle's bench (its cone's axis and two rings of it: SC_LOOK
    // rays), which says which parts have a clear line to the particle; those then have every ray of their cones probed (probes2)
    const dirs = [];
    for (let i = 0; i < SC_PLANE; i++) { const a = 2 * Math.PI * (i + 0.5) / SC_PLANE; dirs.push([Math.cos(a), Math.sin(a), 0]); }
    for (const sg of [1, -1]) for (const [ev, n] of SC_UP) for (let i = 0; i < n; i++) { const a = 2 * Math.PI * (i + (sg > 0 ? 0.25 : 0.75)) / n, ce = Math.cos(ev * deg); dirs.push([Math.cos(a) * ce, Math.sin(a) * ce, sg * Math.sin(ev * deg)]); }
    st.nFan = dirs.length;
    const byEl = new Map();
    for (const s of surfsBy.get(el.bench) || []) { if (!byEl.has(s.el)) byEl.set(s.el, []); byEl.get(s.el).push(s); }
    for (const [e2, ss] of byEl) {
      if (e2 === el || e2.type === 'particle' || e2.type === 'source') continue;
      const cone = partCone(st.pos, e2, ss);
      if (!cone) continue;
      const cand = { el: e2, axis: cone[0], half: cone[1], look: dirs.length, cut: [] };
      st.cands.push(cand);
      const t = Math.abs(cone[0][2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], ex = unit3(cross3(t, cone[0])), ey = cross3(cone[0], ex);
      dirs.push(cone[0]);
      for (const fr of [0.55, 0.93]) for (let j = 0; j < 8; j++) { const th = fr * cone[1], ph = 2 * Math.PI * (j + (fr > 0.6 ? 0.5 : 0)) / 8, sn = Math.sin(th), c = Math.cos(th); dirs.push([0, 1, 2].map(q => sn * Math.cos(ph) * ex[q] + sn * Math.sin(ph) * ey[q] + c * cone[0][q])); }
    }
    st.dirs = dirs;
    st.probe = vsrc(el, st.pos, st.launches[0].nm, st.launches[0].root, { id: el.id + '~probe', vRays: dirs.map(d => ({ d, J: [1, 0, 0, 0] })), vProbe: [] });
    // what the probe met is kept while nothing it depends on has changed: where the particle is and the bench's parts as they
    // stand (a source's light left out: its power, wavelength and polarisation move no surface)
    st.probeKey = JSON.stringify(st.pos) + JSON.stringify(project.elements.filter(e => e.bench === el.bench && e !== el && e.type !== 'elec' && e.type !== 'draw'), probeCut);
    const kept = PROBES.get(el.id);
    if (kept && kept.key === st.probeKey && kept.met.length === dirs.length) { st.probe.vProbe = kept.met; st.probeKept = true; }
  }
  const live = states.filter(st => st.probe);
  return {
    probes: live.filter(st => !st.probeKept).map(st => st.probe),
    cones() {
      const out = [];
      for (const st of live) {
        const S = st.S, el = st.el, met0 = st.probe.vProbe, nMed = S.nMed || 1;
        if (st.probeKey) PROBES.set(el.id, { key: st.probeKey, met: met0 });
        // each part the look saw: its cone, and the power of every launch into it
        for (const c0 of st.cands) {
          let far = 0; for (let i = 0; i < SC_LOOK; i++) { const m = met0[c0.look + i]; if (m && m.el === c0.el.id) far = Math.max(far, m.t); }
          if (!(far > 0)) continue;
          c0.G = coneDirs(c0.axis, c0.half);
          const both = [c0];
          // Where a driving beam goes on into this cone and is narrow in it, the cone's rays are too far apart to add to it as a
          // field (the two interfere only over the beam's own footprint): a patch about the beam's way, SC_PATCH of its far-field
          // radii wide, has rays of its own, and the cone leaves that patch out
          for (const La of st.launches) {
            const d0 = [La.b.dx, La.b.dy, 0], hp = SC_PATCH * La.th0, off = Math.acos(Math.max(-1, Math.min(1, d0[0] * c0.axis[0] + d0[1] * c0.axis[1] + d0[2] * c0.axis[2])));
            if (!(hp < c0.half / 3) || off + hp > c0.half || c0.cut.some(q => q.axis[0] * d0[0] + q.axis[1] * d0[1] > Math.cos(q.half + hp))) continue;
            const patch = { el: c0.el, axis: d0, half: hp, G: coneDirs(d0, hp), cut: [], patch: true };
            c0.cut.push(patch); both.push(patch);
          }
          for (const c of both) {
            const keep = [];
            for (let i = 0; i < c.G.n; i++) {
              if (c.cut.some(q => c.G.dirs[3 * i] * q.axis[0] + c.G.dirs[3 * i + 1] * q.axis[1] + c.G.dirs[3 * i + 2] * q.axis[2] > Math.cos(q.half))) continue;   // in a patch: the patch's own rays stand for it
              keep.push(i);
            }
            if (!keep.length) continue;
            const dirs = new Float64Array(3 * keep.length), w = new Float64Array(keep.length);
            keep.forEach((i, q) => { for (let m = 0; m < 3; m++) dirs[3 * q + m] = c.G.dirs[3 * i + m]; w[q] = c.G.w[i]; });
            const amps = st.launches.map(La => coneAmps(S.far, La.L, nMed, dirs, w, La.rot || 0));
            const P = amps.reduce((a, A) => a + A.P.reduce((x, y) => x + y, 0), 0);
            st.caught.push({ c, keep, dirs, w, amps, P, far, srcs: [] });
          }
        }
        st.caught.sort((a, b) => b.P - a.P);
        st.caught.forEach((K, n) => {
          // (the cones past the SC_MAX_CONES + 2 that hold most power are not traced on: their rays go one step, to see which the part catches)
          K.followed = n < SC_MAX_CONES + 2;
          const c = K.c;
          st.launches.forEach((La, li) => {
            const A = K.amps[li], Pc = A.P.reduce((x, y) => x + y, 0);
            if (!(Pc > 0)) return;
            const vRays = [];
            K.keep.forEach((i, q) => {
              const d = [K.dirs[3 * q], K.dirs[3 * q + 1], K.dirs[3 * q + 2]], J = [A.J[4 * q], A.J[4 * q + 1], A.J[4 * q + 2], A.J[4 * q + 3]];
              vRays.push({ d, J, pw: A.P[q], draw: !K.followed ? 0 : c.G.flat[i] ? 1 : 2, sa: K.w[q], ri: Math.floor(i / c.G.nP), sj: i % c.G.nP });
            });
            // (a launch whose phase against its beam is not known, a beam of several modes, is light of its own: it adds as power)
            const v = vsrc(el, st.pos, La.nm, La.root, { id: el.id + '~s' + st.cones.length, angle: Math.atan2(c.axis[1], c.axis[0]) / deg, rays: K.keep.length,
              power: Pc * 1e3, vLp: A.top * 1e3, vLag: La.lag, vKey: La.rot === null ? La.coh + '#sc' : La.coh, vFo: La.fo, vRays, vAim: c.el.id, ...(K.followed ? {} : { vProbe: [] }),
              scat: { part: el.id, to: c.el.id, coh: La.rot === null ? null : La.coh, launch: La.L, grid: { th: c.G.th, nP: c.G.nP }, gpl0: La.gpl0, lag: La.lag, gj0: La.gj0, P: Pc, sr: K.w.reduce((x, y) => x + y, 0) } });
            st.cones.push(v); K.srcs.push(v); out.push(v);
          });
        });
        // a focus's own plane waves, each as a ray along its way from the particle: where it lands, the scattered light meets
        // the unscattered beam and takes (or gives) that wave's share of the extinction (scatter.js, waveInt). Unit rays,
        // polarised as the wave is: what reaches a face of each is the share of that power that does
        for (const La of st.launches) {
          const Wv = S.far.waves && S.far.waves[La.L];
          if (!Wv || La.rot === null) continue;
          const vRays = [];
          for (let o = 0; o < Wv.n; o++) {
            const d = unit3([Wv.d[3 * o], Wv.d[3 * o + 1], Wv.d[3 * o + 2]]), [S3, P3] = polFrame(d, 1), e = Wv.e, q = 6 * o;
            const J = [e[q] * S3[0] + e[q + 2] * S3[1] + e[q + 4] * S3[2], e[q + 1] * S3[0] + e[q + 3] * S3[1] + e[q + 5] * S3[2], e[q] * P3[0] + e[q + 2] * P3[1] + e[q + 4] * P3[2], e[q + 1] * P3[0] + e[q + 3] * P3[1] + e[q + 5] * P3[2]], l = Math.hypot(J[0], J[1], J[2], J[3]) || 1;
            vRays.push({ d, J: J.map(v => v / l), draw: 0 });
          }
          const v = vsrc(el, st.pos, La.nm, La.root, { id: el.id + '~w' + La.L, rays: Wv.n, power: 0, vLp: 0, vKey: La.coh + '#sw', vFo: La.fo, vRays,
            scat: { part: el.id, wave: true, coh: La.coh, launch: La.L, p: Wv.p } });
          st.waveSrc.push(v); out.push(v);
        }
        // the fan: each ray to what it meets, or as far as the farthest part that catches light, as bright as the pattern is along it
        const nF = st.nFan, fd = new Float64Array(3 * nF);
        for (let i = 0; i < nF; i++) for (let m = 0; m < 3; m++) fd[3 * i + m] = st.dirs[i][m];
        const I = new Float64Array(nF);
        for (const La of st.launches) { const F = farAt(S.far, La.L, fd); for (let i = 0; i < nF; i++) for (let q = 0; q < 6; q++) I[i] += F[6 * i + q] ** 2; }
        let top = 0; for (let i = 0; i < nF; i++) top = Math.max(top, I[i]);
        const reach = Math.max(5, Math.min(60, 1.15 * st.caught.reduce((a, K) => Math.max(a, K.far), 0)));
        const rays = new Float32Array(5 * nF);
        for (let i = 0; i < nF; i++) { const m = met0[i]; rays.set([st.dirs[i][0], st.dirs[i][1], st.dirs[i][2], m ? Math.min(m.t, 4 * reach) : reach, top > 0 ? I[i] / top : 0], 5 * i); }
        st.fan = { part: el.id, bench: el.bench, pos: st.pos, colour: wavelengthColour(st.launches[0].nm), nPlane: SC_PLANE, n: nF, rays, on: el.scatFan !== false };
      }
      return out;
    },
    report(hits) {
      const R = { parts: {}, fans: [], hits };
      for (const st of states) {
        const S = st.S, Psca = S && S.Psca > 0 ? S.Psca : 0;
        // a row a part: its cone, with any patch of it
        const rows = [];
        for (const K of st.caught) {
          // (a ray that met another part first was stopped there, by the trace: that part's own cone has its direction)
          K.P = 0; K.n = 0;
          for (const v of K.srcs) v.vRays.forEach((r, i) => { const off = v.vProbe ? !(v.vProbe[i] && v.vProbe[i].el === v.vAim) : r.off; if (!off) { K.P += r.pw; K.n++; } });
          if (!K.n) continue;
          const r0 = rows.find(r => r.id === K.c.el.id);
          if (r0) { r0.P += K.P; r0.share = Psca > 0 ? r0.P / Psca : 0; r0.rays += K.n; r0.followed = r0.followed && K.followed; if (!K.c.patch) { r0.axis = K.c.axis; r0.halfDeg = K.c.half / deg; } }
          else rows.push({ id: K.c.el.id, name: K.c.el.name, P: K.P, share: Psca > 0 ? K.P / Psca : 0, followed: K.followed, rays: K.n, axis: K.c.axis, halfDeg: K.c.half / deg });
        }
        rows.sort((a, b) => b.P - a.P);
        const got = rows.reduce((a, r) => a + r.P, 0);
        R.parts[st.el.id] = { state: st.state, key: st.key, pos: st.pos || null, Psca, rows, caught: got, lost: Math.max(0, Psca - got), lostShare: Psca > 0 ? Math.max(0, 1 - got / Psca) : 0,
          cones: st.cones.map(v => v.id), probed: st.probeKept ? 0 : st.dirs ? st.dirs.length : 0, launched: st.cones.concat(st.waveSrc).reduce((a, v) => a + v.vRays.length, 0) };
        for (const v of st.cones) v.scat.P = v.vRays.reduce((a, r) => a + (r.off ? 0 : r.pw), 0);
        if (st.fan) R.fans.push(st.fan);
      }
      return R;
    },
  };
}
