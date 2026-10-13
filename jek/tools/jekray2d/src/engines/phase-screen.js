import { linesPerMm } from '../core/modulators.js';
import { rawDsag, rawSag } from '../core/geometry.js';
import { faceFrame, rollFrame, tipFrame, zOf } from './trace.js';
import { wx, wy } from '../ui/render.js';
import { h } from '../ui/panel.js';
// Shared mutable state read or set here, not yet imported (see state/shared.md): H

/* ---------- A surface as a phase screen, by tracing rays in three dimensions ----------
   Every element on the bench is a figure of revolution about its own axis, and that axis
   lies in the bench plane, so a ray leaving the plane can be traced through the real
   surface without the tracer knowing about skew rays. Rays start on the plane through
   the beam's hit point square to the incoming beam, along the pilot wavefront normals,
   and end on the plane square to the outgoing beam. Their optical path between the two
   planes is the phase the surface adds; the aperture comes from where they land.
   x is in the bench plane (to the left of the beam), y is out of it. */
/* A beam's own axes square to its way d (a 3D unit vector): y as near straight up as it can
   be, x = y × d (to its left); straight up or down, y is taken along the bench's x */
export function beamAxes(d) {
  let w = [-d[2] * d[0], -d[2] * d[1], d[0] * d[0] + d[1] * d[1]];
  if (Math.hypot(d[0], d[1]) <= 1e-9) { const k = d[0]; w = [1 - k * d[0], -k * d[1], -k * d[2]]; }
  const l = Math.hypot(w[0], w[1], w[2]), ey = [w[0] / l, w[1] / l, w[2] / l];
  return [[ey[1] * d[2] - ey[2] * d[1], ey[2] * d[0] - ey[0] * d[2], ey[0] * d[1] - ey[1] * d[0]], ey];
}
/* A surface's own frame, for a point (or, with point false, a direction) in the world: x along
   its axis from its vertex, y across, z up; through its part's tip and roll and its face's frame */
function surfLocal(s, X, Y, Z, point) {
  if (!s.tilt) {
    const f = s.f, ox = point ? X - f.ox : X, oy = point ? Y - f.oy : Y;
    return [ox * f.c + oy * f.s - (point ? s.z : 0), -ox * f.s + oy * f.c, point ? Z - zOf(s.el) : Z];
  }
  const f = s.ef, ox = point ? X - f.ox : X, oy = point ? Y - f.oy : Y;
  const ex = ox * f.c + oy * f.s, ey = -ox * f.s + oy * f.c, h = point ? Z - zOf(s.el) : Z;
  const [qx, qz0] = tipFrame(s, ex, h), [qy, qz] = rollFrame(s, ey, qz0), [fx, fy] = faceFrame(s, qx, qy, point);
  return [fx - (point ? s.z : 0), fy, qz];
}
// and a direction in it back out to the world
function surfWorld(s, a, b, c) {
  if (!s.tilt) { const f = s.f; return [a * f.c - b * f.s, a * f.s + b * f.c, c]; }
  const L = s.lf, la = L ? L.a : 0, cl = Math.cos(la), sl = Math.sin(la);
  [a, b] = [a * cl - b * sl, a * sl + b * cl];
  if (s.roll) { const cr = Math.cos(s.roll), sr = Math.sin(s.roll); [b, c] = [b * cr - c * sr, b * sr + c * cr]; }
  const ct = Math.cos(s.tip), st = Math.sin(s.tip);
  [a, c] = [a * ct - c * st, a * st + c * ct];
  const f = s.ef; return [a * f.c - b * f.s, a * f.s + b * f.c, c];
}
function popScreen3(ev, invRx, invRy, lam0) {
  const s = ev.surf;
  const edge = s.maskMargin || ((u, v) => s.semi - Math.sqrt(u * u + v * v));
  const fn = s.maskFn || (s.kind === 'grating' ? (u, v) => [1, (ev.order || 0) * linesPerMm(s.el) * u] : null);
  const D0 = fn && isFinite(ev.ly) ? fn(ev.ly, 0, lam0)[1] : 0;
  const un = d => { const l = Math.hypot(d[0], d[1], d[2]); return [d[0] / l, d[1] / l, d[2] / l]; };
  const di = un(ev.din3 || [ev.dIn[0], ev.dIn[1], 0]), dO = un(ev.dout3 || [(ev.dOut || ev.dIn)[0], (ev.dOut || ev.dIn)[1], 0]);
  const [exi, eyi] = beamAxes(di), [exo, eyo] = beamAxes(dO);
  const H = [ev.hx, ev.hy, ev.hz !== undefined ? ev.hz : zOf(s.el)];
  const y0 = s.y0 || 0, sag0 = s.y0 ? s.sag0 : 0;
  const n1 = ev.n1, n2 = ev.mode === 'T' ? ev.n2 : ev.n1;
  const bend = s.kind === 'grating' ? 'grating' : ev.mode === 'R' ? 'reflect' : (ev.mode === 'T' && ev.kind === 'refract' && n1 !== n2) ? 'refract' : 'pass';
  const flat = s.flat, cyl = s.cyl, cs = s.cylS;
  let sS = 0, sY = 0, sZ = 0;
  const sagAt = (u, lz) => {
    if (cyl === 'out') { sS = rawSag(cs, lz); sY = 0; sZ = rawDsag(cs, lz); return; }
    if (cyl === 'plane') { if (flat) { sS = 0; sY = 0; sZ = 0; } else { sS = rawSag(s, u) - sag0; sY = rawDsag(s, u); sZ = 0; } return; }
    const rho = Math.sqrt(u * u + lz * lz);
    if (flat) { sS = 0; sY = 0; sZ = 0; return; }
    const Sp = rawDsag(s, rho);
    sS = rawSag(s, rho) - sag0; sY = rho > 0 ? Sp * u / rho : 0; sZ = rho > 0 ? Sp * lz / rho : 0;
  };
  return function trace(x, y) {
    const X = H[0] + x * exi[0] + y * eyi[0], Y = H[1] + x * exi[1] + y * eyi[1], Z = H[2] + x * exi[2] + y * eyi[2];
    let dx = di[0] + x * invRx * exi[0] + y * invRy * eyi[0], dy = di[1] + x * invRx * exi[1] + y * invRy * eyi[1], dz = di[2] + x * invRx * exi[2] + y * invRy * eyi[2];
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz); dx /= dl; dy /= dl; dz /= dl;
    const [px, py, pz] = surfLocal(s, X, Y, Z, true), [ldx, ldy, ldz] = surfLocal(s, dx, dy, dz, false);
    let t = 0, ly = py, lz = pz, ok = true;
    for (let it = 0; it < 40; it++) {
      ly = py + t * ldy; lz = pz + t * ldz;
      sagAt(ly + y0, lz);
      const g = px + t * ldx - sS, gp = ldx - (sY * ldy + sZ * ldz);
      if (!(Math.abs(gp) > 1e-12)) { ok = false; break; }
      const dt = -g / gp;
      t += dt;
      if (Math.abs(dt) < 1e-13 * (1 + Math.abs(t))) break;
      if (it === 39) ok = false;
    }
    if (!isFinite(t)) return [0, 0, 0, -1, false];
    ly = py + t * ldy; lz = pz + t * ldz;
    sagAt(ly + y0, lz);
    let ex = ldx, ey = ldy, ez = ldz, nx = 1, ny = -sY, nz = -sZ;
    { const nl = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= nl; ny /= nl; nz /= nl; }
    if (bend === 'grating') {
      ey = ldy + (ev.order || 0) * lam0 * linesPerMm(s.el) / n1; ez = ldz;
      const kk = 1 - ey * ey - ez * ez;
      if (kk < 0) ok = false;
      ex = (s.el.mode === 'reflect' ? -1 : 1) * (ldx < 0 ? -1 : 1) * Math.sqrt(Math.max(0, kk));
    } else if (bend !== 'pass') {
      let c = -(ldx * nx + ldy * ny + ldz * nz);
      if (c < 0) { nx = -nx; ny = -ny; nz = -nz; c = -c; }
      if (bend === 'reflect') { ex = ldx + 2 * c * nx; ey = ldy + 2 * c * ny; ez = ldz + 2 * c * nz; }
      else {
        const eta = n1 / n2, k = 1 - eta * eta * (1 - c * c);
        if (k < 0) ok = false;
        const m = eta * c - Math.sqrt(Math.max(0, k));
        ex = eta * ldx + m * nx; ey = eta * ldy + m * ny; ez = eta * ldz + m * nz;
      }
    }
    const [wx, wy, wz] = surfWorld(s, ex, ey, ez), [Nx, Ny, Nz] = surfWorld(s, nx, ny, nz);
    const Px = X + t * dx, Py = Y + t * dy, Pz = Z + t * dz;
    const den = wx * dO[0] + wy * dO[1] + wz * dO[2];
    const t2 = ((H[0] - Px) * dO[0] + (H[1] - Py) * dO[1] + (H[2] - Pz) * dO[2]) / (den || 1e-30);
    const Ex = Px + t2 * wx - H[0], Ey = Py + t2 * wy - H[1], Ez = Pz + t2 * wz - H[2];
    let opl = n1 * t + n2 * t2, amp = 1;
    if (fn) { const [A, D] = fn(ly, lz, lam0); amp = A; opl += (D - D0) * lam0; }
    return [opl, Ex * exo[0] + Ey * exo[1] + Ez * exo[2], Ex * eyo[0] + Ey * eyo[1] + Ez * eyo[2], edge(ly, lz), ok, amp, ly, lz,
      dx, dy, dz, Nx, Ny, Nz, wx, wy, wz];
  };
}
export function popScreen(ev, invRx, invRy, lam0) {
  const s = ev.surf;
  // off the plane (a part tipped or rolled, met above or below its centre, or a beam rising): in 3D
  if (s.tilt || (ev.hz !== undefined && Math.abs(ev.hz - zOf(s.el)) > 1e-12) || (ev.din3 && ev.din3[2]) || (ev.dout3 && ev.dout3[2])) return popScreen3(ev, invRx, invRy, lam0);
  const edge = s.maskMargin || ((u, v) => s.semi - Math.sqrt(u * u + v * v));
  // a grating is a phase ramp of m waves per line across it, which is what turns the
  // light into its order: the mask machinery carries it
  const fn = s.maskFn || (s.kind === 'grating' ? (u, v) => [1, (ev.order || 0) * linesPerMm(s.el) * u] : null);
  const D0 = fn && isFinite(ev.ly) ? fn(ev.ly, 0, lam0)[1] : 0;
  const Hx = ev.hx, Hy = ev.hy, di = ev.dIn, dO = ev.dOut || ev.dIn;
  const exix = -di[1], exiy = di[0], exox = -dO[1], exoy = dO[0];
  const f = s.f, y0 = s.y0 || 0, sag0 = s.y0 ? s.sag0 : 0;
  const n1 = ev.n1, n2 = ev.mode === 'T' ? ev.n2 : ev.n1;
  const bend = s.kind === 'grating' ? 'grating' : ev.mode === 'R' ? 'reflect' : (ev.mode === 'T' && ev.kind === 'refract' && n1 !== n2) ? 'refract' : 'pass';
  const flat = s.flat;
  // a cylinder is curved one way only: across the beam in the bench plane ('plane'), or out
  // of it ('out', flat to the bench's own rays; its profile is kept aside in cylS)
  const cyl = s.cyl, cs = s.cylS;
  // the sag and its slopes at (u, lz), into sS, sY, sZ (called at every Newton step of every sample)
  let sS = 0, sY = 0, sZ = 0;
  const sagAt = (u, lz) => {
    if (cyl === 'out') { sS = rawSag(cs, lz); sY = 0; sZ = rawDsag(cs, lz); return; }
    if (cyl === 'plane') { if (flat) { sS = 0; sY = 0; sZ = 0; } else { sS = rawSag(s, u) - sag0; sY = rawDsag(s, u); sZ = 0; } return; }
    const rho = Math.sqrt(u * u + lz * lz);
    if (flat) { sS = 0; sY = 0; sZ = 0; return; }
    const Sp = rawDsag(s, rho);
    sS = rawSag(s, rho) - sag0; sY = rho > 0 ? Sp * u / rho : 0; sZ = rho > 0 ? Sp * lz / rho : 0;
  };
  return function trace(x, y) {
    // start point and direction in the world, then into the surface's frame
    let X = Hx + x * exix, Y = Hy + x * exiy, Z = y;
    let dx = di[0] + x * invRx * exix, dy = di[1] + x * invRx * exiy, dz = y * invRy;
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz); dx /= dl; dy /= dl; dz /= dl;
    const ox = X - f.ox, oy = Y - f.oy;
    const px = ox * f.c + oy * f.s - s.z, py = -ox * f.s + oy * f.c, pz = Z;
    const ldx = dx * f.c + dy * f.s, ldy = -dx * f.s + dy * f.c, ldz = dz;
    // Newton on x(t) = sag(y(t), z(t)), starting on the entry plane, which touches the surface
    let t = 0, ly = py, lz = pz, ok = true;
    for (let it = 0; it < 40; it++) {
      ly = py + t * ldy; lz = pz + t * ldz;
      sagAt(ly + y0, lz);
      const S = sS, Sy = sY, Sz = sZ;
      const g = px + t * ldx - S;
      const gp = ldx - (Sy * ldy + Sz * ldz);
      if (!(Math.abs(gp) > 1e-12)) { ok = false; break; }
      const dt = -g / gp;
      t += dt;
      if (Math.abs(dt) < 1e-13 * (1 + Math.abs(t))) break;
      if (it === 39) ok = false;
    }
    if (!isFinite(t)) return [0, 0, 0, -1, false];
    ly = py + t * ldy; lz = pz + t * ldz;
    sagAt(ly + y0, lz);
    const Sy = sY, Sz = sZ;
    // bend in the local frame
    let ex = ldx, ey = ldy, ez = ldz;
    let nx = 1, ny = -Sy, nz = -Sz;
    { const nl = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= nl; ny /= nl; nz /= nl; }
    if (bend === 'grating') {
      // along the grooves' normal the grating equation, n sin(out) = n sin(in) + m lambda G;
      // along the grooves nothing changes; reflected back across, or carried on through
      ey = ldy + (ev.order || 0) * lam0 * linesPerMm(s.el) / n1; ez = ldz;
      const kk = 1 - ey * ey - ez * ez;
      if (kk < 0) ok = false;
      ex = (s.el.mode === 'reflect' ? -1 : 1) * (ldx < 0 ? -1 : 1) * Math.sqrt(Math.max(0, kk));
    } else if (bend !== 'pass') {
      let c = -(ldx * nx + ldy * ny + ldz * nz);
      if (c < 0) { nx = -nx; ny = -ny; nz = -nz; c = -c; }        // normal against the ray
      if (bend === 'reflect') { ex = ldx + 2 * c * nx; ey = ldy + 2 * c * ny; ez = ldz + 2 * c * nz; }
      else {
        const eta = n1 / n2, k = 1 - eta * eta * (1 - c * c);
        if (k < 0) ok = false;                                     // lost to total internal reflection
        const m = eta * c - Math.sqrt(Math.max(0, k));
        ex = eta * ldx + m * nx; ey = eta * ldy + m * ny; ez = eta * ldz + m * nz;
      }
    }
    const wx = ex * f.c - ey * f.s, wy = ex * f.s + ey * f.c, wz = ez;
    // hit point in the world, then on to the exit plane
    const Px = X + t * dx, Py = Y + t * dy, Pz = Z + t * dz;
    const den = wx * dO[0] + wy * dO[1];
    const t2 = ((Hx - Px) * dO[0] + (Hy - Py) * dO[1]) / (den || 1e-30);
    const Ex = Px + t2 * wx - Hx, Ey = Py + t2 * wy - Hy, Ez = Pz + t2 * wz;
    let opl = n1 * t + n2 * t2, amp = 1;
    // a mask: amplitude, and delay in waves, as a departure from its delay where the
    // reference ray crossed it, which the ray's own path already carries
    if (fn) { const [A, D] = fn(ly, lz, lam0); amp = A; opl += (D - D0) * lam0; }
    // for polarisation: the ray in, the surface normal and the ray out, in the world
    return [opl, Ex * exox + Ey * exoy, Ez, edge(ly, lz), ok, amp, ly, lz,
      dx, dy, dz, nx * f.c - ny * f.s, nx * f.s + ny * f.c, nz, wx, wy, wz];
  };
}

