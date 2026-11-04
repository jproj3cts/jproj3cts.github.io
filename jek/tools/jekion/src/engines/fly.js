import { cross3, randn, seededRng, unit3 } from '../../../jekray/src/core/numeric.js';
import { AMU, KB, KCOUL, QE, C_MMUS, keOfProper, properSpeedOfKE, qmOf, gammaOfProper } from '../core/units.js';
import { gInside, gNode } from '../core/grid.js';
import { shapeBounds, shapeInside } from '../core/geom.js';
import { eFieldAt } from './fields.js';

/* ==========================================================================
   Flying the particles. Each is a point charge in the fields (engines/fields.js) and a uniform magnetic field,
   integrated with Dormand–Prince's embedded 5th/4th-order Runge–Kutta step, the step chosen by the error, kept
   under a fraction of a grid cell and a fraction of an RF period. The state is position (mm) and proper
   velocity u = γv (mm/µs), so the motion is relativistic without special cases: dx/dt = u/γ,
   du/dt = (q/m)(E + v × B). A particle ends when it enters an electrode (a splat: the shape's own test, a CAD
   body by its voxels), leaves the array, crosses a detector set to stop it, or runs out of time. Detectors in
   its way record each crossing. With a background gas, each step may be a hard-sphere collision with a gas
   molecule drawn from the Maxwell distribution; with space charge on, all particles fly together and each
   feels the Coulomb field of the others (each standing for `weight` real charges, softened within a cell).
   Everything is seeded, so a run is repeatable. Units: mm, µs, V, eV, u, e, gauss, Pa, K, Å².
   ========================================================================== */
const DP = {   // Dormand–Prince 5(4)
  c: [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1],
  a: [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729], [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]],
  b: [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0],
  bs: [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40],
};
export const FLY_DEFAULTS = { tMax: 100, quality: 0.5, maxPts: 3000, spaceCharge: false, seed: 1, tol: 1e-4 };
export const END_WORDS = { splat: 'hit an electrode', out: 'left the array', det: 'stopped at a detector', time: 'ran out of time', start: 'started inside an electrode' };

/* the particles of an ion group, as starting states: { m, q, qm, x, y, z, ux, uy, uz, t0, group, i, weight } */
export function makeParticles(ion, rng, gi) {
  const out = [], n = Math.max(1, Math.round(ion.n)), m = ion.mass, q = ion.charge, qm = qmOf(q, m);
  const az = ion.dirAz * Math.PI / 180, el = ion.dirEl * Math.PI / 180, d = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  // a frame about the direction, for the cone
  const up = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = unit3(cross3(up, d)), e2 = cross3(d, e1);
  const cone = ion.cone * Math.PI / 180, sig = ion.keSpread / 2.3548;
  for (let i = 0; i < n; i++) {
    let dx = 0, dy = 0, dz = 0;
    const s = ion.size;
    if (ion.dist === 'disc' && s > 0) { const r = s * Math.sqrt(rng()), th = 2 * Math.PI * rng(); const p = addScaled(addScaled([0, 0, 0], e1, r * Math.cos(th)), e2, r * Math.sin(th)); [dx, dy, dz] = p; }
    else if (ion.dist === 'sphere' && s > 0) { const r = s * Math.cbrt(rng()), u = 2 * rng() - 1, th = 2 * Math.PI * rng(), k = Math.sqrt(1 - u * u); dx = r * k * Math.cos(th); dy = r * k * Math.sin(th); dz = r * u; }
    else if (ion.dist === 'line' && s > 0) { const f = (2 * rng() - 1) * s; [dx, dy, dz] = e1.map(v => v * f); }
    else if (ion.dist === 'gauss' && s > 0) { dx = s * randn(rng); dy = s * randn(rng); dz = s * randn(rng); }
    else if (ion.dist === 'grid' && s > 0 && n > 1) { const f = (2 * i / (n - 1) - 1) * s; [dx, dy, dz] = e1.map(v => v * f); }
    // the direction within the cone, uniform over its solid angle
    let dir = d;
    if (cone > 0) {
      const ct = 1 - rng() * (1 - Math.cos(cone)), st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = 2 * Math.PI * rng();
      dir = unit3([d[0] * ct + (e1[0] * Math.cos(ph) + e2[0] * Math.sin(ph)) * st, d[1] * ct + (e1[1] * Math.cos(ph) + e2[1] * Math.sin(ph)) * st, d[2] * ct + (e1[2] * Math.cos(ph) + e2[2] * Math.sin(ph)) * st]);
    }
    const ke = Math.max(0, ion.ke + (sig > 0 ? sig * randn(rng) : 0)), u = properSpeedOfKE(ke, m);
    out.push({ m, q, qm, x: ion.x + dx, y: ion.y + dy, z: ion.z + dz, ux: u * dir[0], uy: u * dir[1], uz: u * dir[2], t0: ion.t0 + (ion.tSpread > 0 ? rng() * ion.tSpread : 0), ke0: ke, group: gi, i, weight: ion.weight || 1, colour: ion.colour });
  }
  return out;
}
const addScaled = (p, v, s) => [p[0] + v[0] * s, p[1] + v[1] * s, p[2] + v[2] * s];

/* which electrode (index) a point is inside, or -1: the shapes' own tests within their boxes, a CAD body's voxels */
export function electrodeAt(F, x, y, z) {
  const { els, boxes, g, mask } = F;
  for (let k = 0; k < els.length; k++) {
    const b = boxes[k];
    if (x < b[0][0] || x > b[1][0] || y < b[0][1] || y > b[1][1] || z < b[0][2] || z > b[1][2]) continue;
    const el = els[k];
    if (el.transparent) continue;                       // a grid: in the field, not in the way
    if (el.shape === 'mesh') { const o = gNode(g, x, y, z); if (o >= 0 && mask[o] === k) return k; continue; }
    if (g.sym === 'planar' ? shapeInside(el, x, y, 0) : g.sym === 'cyl' ? shapeInside(el, x, Math.hypot(y, z), 0) : shapeInside(el, x, y, z)) return k;
  }
  return -1;
}
/* the electrodes' boxes, grown by a cell (a planar array's reach along z, a cylindrical one's about the axis, unbounded) */
export function electrodeBoxes(g, els) {
  return els.map(el => {
    const [lo, hi] = shapeBounds(el), h = g.h;
    const b = [[lo[0] - h, lo[1] - h, lo[2] - h], [hi[0] + h, hi[1] + h, hi[2] + h]];
    if (g.sym === 'planar') { b[0][2] = -Infinity; b[1][2] = Infinity; }
    if (g.sym === 'cyl') { const rm = Math.max(Math.abs(lo[1]), Math.abs(hi[1]), Math.abs(lo[2]), Math.abs(hi[2])) + h; b[0][1] = -rm; b[1][1] = rm; b[0][2] = -rm; b[1][2] = rm; }
    return b;
  });
}

/* Fly every ion group through the field set F = { g, mask, els, boxes, G (voltage groups) } with the settings S (gas,
   bfield, fly, detectors, ions), as a job: step(budgetMs) flies for about that long, true when every particle has
   ended; progress is { done, n, t }; result() gives { particles, ms, n }, each particle { group, i, colour, m, q, ke0,
   t0, start: [x, y, z], end: { x, y, z, t, ke, why, el }, pts: Float32Array (x, y, z, t a point), hits: [{ det, x, y, z,
   t, ke, ux, uy, uz }], collisions }. With space charge on, all fly together on one clock; otherwise one after another.
   flyAll runs it straight through. */
export function flyStart(F, S) {
  const t0ms = Date.now(), fly = Object.assign({}, FLY_DEFAULTS, S.fly || {}), rng = seededRng(fly.seed || 1);
  const parts = [];
  (S.ions || []).forEach((ion, gi) => { if (ion.on !== false) parts.push(...makeParticles(ion, rng, gi)); });
  const together = !!fly.spaceCharge && parts.length > 1, results = [];
  let i = 0, batch = null, done = parts.length === 0;
  const begin = () => { if (i >= parts.length) { batch = null; done = true; } else if (together) { batch = batchStart(F, S, fly, parts, rng); i = parts.length; } else { batch = batchStart(F, S, fly, [parts[i]], rng); i++; } };
  begin();
  return {
    get progress() { return { done: together ? (done ? parts.length : 0) : Math.max(0, i - (batch ? 1 : 0)), n: parts.length, t: batch ? batch.t : 0 }; },
    step(budgetMs) {
      const until = Date.now() + (budgetMs || 1e9);
      while (batch) {
        if (!batch.advance(Math.max(1, until - Date.now()))) return false;
        results.push(...batch.finish());
        begin();
        if (Date.now() > until && batch) return false;
      }
      return true;
    },
    result() { return { particles: results, ms: Date.now() - t0ms, n: parts.length }; },
  };
}
export function flyAll(F, S) {
  const J = flyStart(F, S);
  while (!J.step(1e9)) { /* straight through */ }
  return J.result();
}
/* a batch of particles flown with one clock (one particle, or all of them together for space charge): advance(budgetMs)
   flies for about that long, true when all have ended; finish() gives their records */
function batchStart(F, S, fly, P, rng) {
  const g = F.g, h = g.h, n = P.length;
  const B = S.bfield || { bx: 0, by: 0, bz: 0 }, hasB = !!(B.bx || B.by || B.bz), bx = B.bx || 0, by = B.by || 0, bz = B.bz || 0;
  const gas = S.gas && S.gas.on && S.gas.pressure > 0 ? S.gas : null;
  const dets = (S.detectors || []).filter(d => d.on !== false), nd = dets.length, detAx = dets.map(d => d.axis === 'x' ? 0 : d.axis === 'y' ? 1 : 2), detAt = dets.map((d, k) => (Number.isFinite(d.at) ? d.at : d[['x', 'y', 'z'][detAx[k]]] || 0));
  const tMax = fly.tMax, step = Math.max(0.05, Math.min(2, fly.quality || 0.5)) * h, maxPts = Math.max(200, fly.maxPts || 3000), tol = fly.tol || 1e-4;
  const rfW = F.G.rf.length ? Math.max(...F.G.rf.map(R => R.w)) : 0, dtRf = rfW ? 2 * Math.PI / rfW / 40 : Infinity;
  const coul = manyOf(P) && fly.spaceCharge ? KCOUL * QE * 1e3 : 0, soft2 = (0.5 * h) ** 2;   // V/mm per e per mm², the Coulomb constant in these units
  // the state: 6 a particle, and the stages
  const Y = new Float64Array(6 * n), Yt = new Float64Array(6 * n), Y4 = new Float64Array(6 * n), K = Array.from({ length: 7 }, () => new Float64Array(6 * n));
  const alive = new Uint8Array(n), E = [0, 0, 0], EC = new Float64Array(3 * n);
  const R = P.map((p, i) => { Y[6 * i] = p.x; Y[6 * i + 1] = p.y; Y[6 * i + 2] = p.z; Y[6 * i + 3] = p.ux; Y[6 * i + 4] = p.uy; Y[6 * i + 5] = p.uz; alive[i] = 1;
    return { group: p.group, i: p.i, colour: p.colour, m: p.m, q: p.q, ke0: p.ke0, t0: p.t0, start: [p.x, p.y, p.z], end: null, pts: [], every: 1, k: 0, hits: [], t: p.t0 }; });
  // all start at the earliest t0; a particle whose time has not come waits where it is
  let t = Math.min(...P.map(p => p.t0)), dt = Math.min(step / Math.max(1e-9, ...P.map(p => Math.hypot(p.ux, p.uy, p.uz) / gammaOfProper(Math.hypot(p.ux, p.uy, p.uz)))), dtRf, 1e-3 * tMax);
  if (!(dt > 0) || !isFinite(dt)) dt = Math.min(dtRf, 1e-3 * tMax);
  const endOf = (i, why, el, tt) => { const o = 6 * i, u = Math.hypot(Y[o + 3], Y[o + 4], Y[o + 5]); R[i].end = { x: Y[o], y: Y[o + 1], z: Y[o + 2], t: tt, ke: keOfProper(u, P[i].m), why, el: el === undefined ? -1 : el }; alive[i] = 0; };
  // a particle starting inside an electrode, or outside the array
  for (let i = 0; i < n; i++) { const o = 6 * i; if (!gInside(g, Y[o], Y[o + 1], Y[o + 2])) endOf(i, 'out', -1, P[i].t0); else { const k = electrodeAt(F, Y[o], Y[o + 1], Y[o + 2]); if (k >= 0) endOf(i, 'start', k, P[i].t0); } R[i].pts.push(Y[o], Y[o + 1], Y[o + 2], P[i].t0); }
  // the derivatives of every live particle whose time has come, at time tt, from state S into out
  const deriv = (St, tt, out) => {
    // the Coulomb field of the others, once a stage
    if (coul) {
      EC.fill(0);
      for (let i = 0; i < n; i++) { if (!alive[i] || tt < P[i].t0) continue; const oi = 6 * i;
        for (let j = i + 1; j < n; j++) { if (!alive[j] || tt < P[j].t0) continue; const oj = 6 * j;
          const dx = St[oi] - St[oj], dy = St[oi + 1] - St[oj + 1], dz = St[oi + 2] - St[oj + 2], r2 = dx * dx + dy * dy + dz * dz + soft2, inv = coul / (r2 * Math.sqrt(r2));
          EC[3 * i] += P[j].q * P[j].weight * inv * dx; EC[3 * i + 1] += P[j].q * P[j].weight * inv * dy; EC[3 * i + 2] += P[j].q * P[j].weight * inv * dz;
          EC[3 * j] -= P[i].q * P[i].weight * inv * dx; EC[3 * j + 1] -= P[i].q * P[i].weight * inv * dy; EC[3 * j + 2] -= P[i].q * P[i].weight * inv * dz; } }
    }
    for (let i = 0; i < n; i++) {
      const o = 6 * i;
      if (!alive[i] || tt < P[i].t0) { for (let q = 0; q < 6; q++) out[o + q] = 0; continue; }
      const ux = St[o + 3], uy = St[o + 4], uz = St[o + 5], gm = Math.sqrt(1 + (ux * ux + uy * uy + uz * uz) / (C_MMUS * C_MMUS)), vx = ux / gm, vy = uy / gm, vz = uz / gm;
      out[o] = vx; out[o + 1] = vy; out[o + 2] = vz;
      if (!eFieldAt(F.G, g, St[o], St[o + 1], St[o + 2], tt, E)) { E[0] = 0; E[1] = 0; E[2] = 0; }
      if (coul) { E[0] += EC[3 * i]; E[1] += EC[3 * i + 1]; E[2] += EC[3 * i + 2]; }
      const qm = P[i].qm;
      // (q/m)(E + v × B): E in V/mm gives mm/µs² with 1e-6; v in mm/µs and B in gauss, 1e-10
      out[o + 3] = qm * (E[0] * 1e-6 + (hasB ? (vy * bz - vz * by) * 1e-10 : 0));
      out[o + 4] = qm * (E[1] * 1e-6 + (hasB ? (vz * bx - vx * bz) * 1e-10 : 0));
      out[o + 5] = qm * (E[2] * 1e-6 + (hasB ? (vx * by - vy * bx) * 1e-10 : 0));
    }
  };
  const gasN = gas ? gas.pressure / (KB * Math.max(1, gas.temp)) : 0, gasSig = gas ? Math.max(0, gas.sigma) * 1e-20 : 0, gasM = gas ? Math.max(1e-3, gas.mass) : 1, gasVth = gas ? Math.sqrt(KB * Math.max(1, gas.temp) / (gasM * AMU)) * 1e-3 : 0;   // mm/µs per component
  let live = 0; for (let i = 0; i < n; i++) live += alive[i];
  let steps = 0;
  function advance(budgetMs) {
  const until = Date.now() + budgetMs;
  while (live > 0 && t < tMax) {
    if (t + dt > tMax) dt = tMax - t;
    // the stages
    deriv(Y, t, K[0]);
    for (let s = 1; s < 7; s++) {
      const a = DP.a[s];
      for (let o = 0; o < 6 * n; o++) { let v = Y[o]; for (let r = 0; r < a.length; r++) if (a[r]) v += dt * a[r] * K[r][o]; Yt[o] = v; }
      deriv(Yt, t + DP.c[s] * dt, K[s]);
    }
    // the 5th-order step (Yt holds it after the last stage, whose weights are b) and the 4th, for the error on position
    let err = 0, maxMove = 0;
    for (let i = 0; i < n; i++) {
      if (!alive[i] || t < P[i].t0) continue;
      const o = 6 * i;
      for (let q = 0; q < 3; q++) { let v4 = Y[o + q]; for (let r = 0; r < 7; r++) v4 += dt * DP.bs[r] * K[r][o + q]; const e = Math.abs(Yt[o + q] - v4); if (e > err) err = e; }
      const mv = Math.hypot(Yt[o] - Y[o], Yt[o + 1] - Y[o + 1], Yt[o + 2] - Y[o + 2]); if (mv > maxMove) maxMove = mv;
    }
    const tolAbs = tol * h;
    if ((err > tolAbs || maxMove > 1.5 * step) && dt > 1e-9 * Math.max(1e-6, tMax)) {
      // rejected: smaller, by the error and by the overshoot of the cell (never larger)
      let f = err > tolAbs ? Math.max(0.2, 0.9 * Math.pow(tolAbs / err, 0.2)) : 0.9;
      if (maxMove > 1.5 * step) f = Math.min(f, step / maxMove);
      dt *= Math.min(0.9, f);
      continue;
    }
    // accepted
    const tNew = t + dt;
    for (let i = 0; i < n; i++) {
      if (!alive[i] || t < P[i].t0) { if (alive[i] && tNew >= P[i].t0 && t < P[i].t0) { /* starts next step */ } continue; }
      const o = 6 * i, Ri = R[i], xo = Y[o], yo = Y[o + 1], zo = Y[o + 2];
      for (let q = 0; q < 6; q++) Y4[o + q] = Y[o + q];
      for (let q = 0; q < 6; q++) Y[o + q] = Yt[o + q];
      const x = Y[o], y = Y[o + 1], z = Y[o + 2];
      // detectors crossed on the way
      for (let d = 0; d < nd; d++) {
        const D = dets[d], ax = detAx[d], s0 = Y4[o + ax] - detAt[d], s1 = Y[o + ax] - detAt[d];
        if ((s0 < 0 && s1 >= 0) || (s0 > 0 && s1 <= 0) || (s0 === 0 && s1 !== 0)) {
          const f = s0 / (s0 - s1), hx = xo + f * (x - xo), hy = yo + f * (y - yo), hz = zo + f * (z - zo);
          const u = [0, 1, 2].filter(q => q !== ax), du = [hx, hy, hz][u[0]] - [D.x, D.y, D.z][u[0]], dv = [hx, hy, hz][u[1]] - [D.x, D.y, D.z][u[1]];
          if (D.half > 0 && (Math.abs(du) > D.half || Math.abs(dv) > D.half)) continue;
          const uxh = Y4[o + 3] + f * (Y[o + 3] - Y4[o + 3]), uyh = Y4[o + 4] + f * (Y[o + 4] - Y4[o + 4]), uzh = Y4[o + 5] + f * (Y[o + 5] - Y4[o + 5]);
          Ri.hits.push({ det: d, x: hx, y: hy, z: hz, t: t + f * dt, ke: keOfProper(Math.hypot(uxh, uyh, uzh), P[i].m), ux: uxh, uy: uyh, uz: uzh });
          if (D.stop) { Y[o] = hx; Y[o + 1] = hy; Y[o + 2] = hz; Y[o + 3] = uxh; Y[o + 4] = uyh; Y[o + 5] = uzh; Ri.pts.push(hx, hy, hz, t + f * dt); endOf(i, 'det', d, t + f * dt); live--; break; }
        }
      }
      if (!alive[i]) continue;
      // out of the array, or into an electrode (the crossing placed between the two points)
      if (!gInside(g, x, y, z)) { Ri.pts.push(x, y, z, tNew); endOf(i, 'out', -1, tNew); live--; continue; }
      const k = electrodeAt(F, x, y, z);
      if (k >= 0) {
        let lo = 0, hi = 1;
        for (let b = 0; b < 12; b++) { const f = (lo + hi) / 2, px = xo + f * (x - xo), py = yo + f * (y - yo), pz = zo + f * (z - zo); if (electrodeAt(F, px, py, pz) >= 0) hi = f; else lo = f; }
        const f = hi; Y[o] = xo + f * (x - xo); Y[o + 1] = yo + f * (y - yo); Y[o + 2] = zo + f * (z - zo);
        Ri.pts.push(Y[o], Y[o + 1], Y[o + 2], t + f * dt); endOf(i, 'splat', k, t + f * dt); live--; continue;
      }
      // a gas collision, by chance
      if (gas) {
        const gm = gammaOfProper(Math.hypot(Y[o + 3], Y[o + 4], Y[o + 5])), vx = Y[o + 3] / gm, vy = Y[o + 4] / gm, vz = Y[o + 5] / gm;
        const gx = gasVth * randn(rng), gy = gasVth * randn(rng), gz = gasVth * randn(rng), vrel = Math.hypot(vx - gx, vy - gy, vz - gz);
        const pc = 1 - Math.exp(-gasN * gasSig * vrel * 1e3 * dt * 1e-6);
        if (rng() < pc) {
          const m = P[i].m, M = m + gasM, cx = (m * vx + gasM * gx) / M, cy = (m * vy + gasM * gy) / M, cz = (m * vz + gasM * gz) / M;
          const uu = 2 * rng() - 1, th = 2 * Math.PI * rng(), kk = Math.sqrt(1 - uu * uu), f = gasM / M * vrel;
          const nvx = cx + f * kk * Math.cos(th), nvy = cy + f * kk * Math.sin(th), nvz = cz + f * uu, nv = Math.hypot(nvx, nvy, nvz), ng = 1 / Math.sqrt(Math.max(1e-12, 1 - (nv / C_MMUS) ** 2));
          Y[o + 3] = nvx * ng; Y[o + 4] = nvy * ng; Y[o + 5] = nvz * ng;
          Ri.collisions = (Ri.collisions || 0) + 1;
        }
      }
      // the path, thinned when it grows long
      if (++Ri.k % Ri.every === 0) {
        Ri.pts.push(x, y, z, tNew);
        if (Ri.pts.length > 4 * maxPts) { const keep = []; for (let q = 0; q < Ri.pts.length; q += 8) keep.push(Ri.pts[q], Ri.pts[q + 1], Ri.pts[q + 2], Ri.pts[q + 3]); Ri.pts = keep; Ri.every *= 2; }
      }
    }
    t = tNew;
    steps++;
    // the next step: by the error, within a cell and a slice of the RF period
    let grow = err > 0 ? 0.9 * Math.pow(tolAbs / err, 0.2) : 2;
    dt *= Math.min(2, Math.max(0.5, grow));
    if (maxMove > 0) dt = Math.min(dt, dt * step / maxMove * 1.2);
    dt = Math.min(dt, dtRf);
    if ((steps & 63) === 0 && Date.now() > until) return false;
  }
  return true;
  }
  function finish() {
    for (let i = 0; i < n; i++) {
      if (alive[i]) { const o = 6 * i; R[i].pts.push(Y[o], Y[o + 1], Y[o + 2], t); endOf(i, 'time', -1, t); }
      R[i].pts = Float32Array.from(R[i].pts);
      delete R[i].every; delete R[i].k; delete R[i].t;
    }
    return R;
  }
  return { advance, finish, get t() { return t; } };
}
const manyOf = P => P.length > 1;
