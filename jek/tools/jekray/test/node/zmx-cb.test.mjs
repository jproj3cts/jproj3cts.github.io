/* A folded, tilted and decentred assembly written as a lens file with coordinate breaks, and read back by a sequential
   tracer of its own (each coordinate break a decentre along x and y, then turns about x, the new y and the new z, each
   right-handed; each thickness along the current z; after a mirror the light running along -z): every ray lands on
   the image where the lens engine lands it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const D = await import('../../src/engines/lens-design.js');
const A = await import('../../src/core/assembly.js');
const E = await import('../../src/engines/lens-engine.js');
const ZE = await import('../../src/io/zmx-export.js');
const ZI = await import('../../src/io/zmx-import.js');
const G = await import('../../src/core/glass.js');

// the file's own surfaces in their frames, by its rules
function frames(Z) {
  let o = [0, 0, 0], X = [1, 0, 0], Y = [0, 1, 0], Zz = [0, 0, 1];
  const add = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k], lin = (a, ka, b, kb) => [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
  const out = [];
  Z.surfs.slice(1).forEach(s => {
    if (s.type === 'COORDBRK') {
      const p = k => (s.parm[k] || 0);
      o = add(add(o, X, p(1)), Y, p(2));
      const r = deg => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)];
      let [c, sn] = r(p(3)); [Y, Zz] = [lin(Y, c, Zz, sn), lin(Y, -sn, Zz, c)];
      [c, sn] = r(p(4)); [Zz, X] = [lin(Zz, c, X, sn), lin(Zz, -sn, X, c)];
      [c, sn] = r(p(5)); [X, Y] = [lin(X, c, Y, sn), lin(X, -sn, Y, c)];
    } else out.push(Object.assign({ o, X, Y, Z: Zz }, s));
    o = add(o, Zz, s.disz);
  });
  return out;
}
function sagOf(s, r2) {
  const c = s.curv, k = s.conic, base = c ? c * r2 / (1 + Math.sqrt(Math.max(0, 1 - (1 + k) * c * c * r2))) : 0;
  let z = base;
  if (s.type === 'EVENASPH') for (let q = 1; q <= 8; q++) z += (s.parm[q] || 0) * r2 ** q;
  return z;
}
function trace(Z, F, start, dir, nm) {
  let p = start.slice(), d = dir.slice(), n = 1;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (let i = 0; i < F.length; i++) {
    const s = F[i], loc = v => [dot(v, s.X), dot(v, s.Y), dot(v, s.Z)], rel = [p[0] - s.o[0], p[1] - s.o[1], p[2] - s.o[2]];
    let q = loc(rel), u = loc(d), t = -q[2] / u[2];
    for (let it = 0; it < 60; it++) {
      const x = q[0] + u[0] * t, y = q[1] + u[1] * t, z = q[2] + u[2] * t, r2 = x * x + y * y, h = 1e-7;
      const f = z - sagOf(s, r2), dsdr2 = (sagOf(s, r2 + h) - sagOf(s, Math.max(0, r2 - h))) / (2 * h);
      const df = u[2] - dsdr2 * 2 * (x * u[0] + y * u[1]);
      const dt = f / df; t -= dt; if (Math.abs(dt) < 1e-14) break;
    }
    const x = q[0] + u[0] * t, y = q[1] + u[1] * t, z = q[2] + u[2] * t;
    if (i === F.length - 1) return [x, y];
    const r2 = x * x + y * y, hh = 1e-7, ds = (sagOf(s, r2 + hh) - sagOf(s, Math.max(0, r2 - hh))) / (2 * hh);
    let N = [-ds * 2 * x, -ds * 2 * y, 1]; const ln = Math.hypot(...N); N = N.map(v => v / ln);
    let ci = dot(u, N);
    if (s.glass && /^MIRROR/.test(s.glass.name)) u = [u[0] - 2 * ci * N[0], u[1] - 2 * ci * N[1], u[2] - 2 * ci * N[2]];
    else {
      const n2 = s.glass ? G.refIndex({ glass: s.glass.name }, nm) : 1, mu = n / n2, kk = 1 - mu * mu * (1 - ci * ci), b = Math.sign(ci) * Math.sqrt(kk) - mu * ci;
      u = [mu * u[0] + b * N[0], mu * u[1] + b * N[1], mu * u[2] + b * N[2]]; n = n2;
    }
    const gl = v => [s.X[0] * v[0] + s.Y[0] * v[1] + s.Z[0] * v[2], s.X[1] * v[0] + s.Y[1] * v[1] + s.Z[1] * v[2], s.X[2] * v[0] + s.Y[2] * v[1] + s.Z[2] * v[2]];
    const P = gl([x, y, z]); p = [s.o[0] + P[0], s.o[1] + P[1], s.o[2] + P[2]]; d = gl(u);
  }
}

const lens = (id, x, y, ang, R1, R2, t) => ({ type: 'lens', id, name: id, x, y, angle: ang, diameter: 20, surfaces: [{ R: R1 }, { R: R2 }], gaps: [t], materials: [{ glass: 'N-BK7' }], group: 'g' });

test('a folded assembly with a tilted, decentred lens: written with coordinate breaks, every ray lands where the engine has it', () => {
  // a real image: the first lens weak enough that the second brings the light to a focus beyond it
  loadProject({ format: 'jekray', version: 1, elements: [lens('L1', 0, 0, 0, 120, -120, 4), { type: 'mirror', id: 'M', name: 'M', x: 30, y: 0, angle: 135, length: 30, group: 'g' }, lens('L2', 30, 25, 90, 30, -120, 3)],
    assemblies: [{ id: 'g', name: 'F', ref: 'L1', cond: { aperture: { kind: 'epd', v: 6 }, fields: [{ deg: 0 }, { deg: 2 }], waves: [{ nm: 587.56 }] }, design: { solves: { 't:image': { kind: 'focus' } } } }] });
  const asm = ST.project.assemblies[0], P = D.designPrescription(asm);
  // the second lens tilted 3° and moved 0.4 mm off the folded axis, and out of the plane too
  D.setV(P, D.posOf(P, 'T:L2.0'), 3); D.setV(P, D.posOf(P, 'D:L2.0'), 0.4); D.setV(P, D.posOf(P, 'U:L2.0'), 1.5); D.setV(P, D.posOf(P, 'X:L2.0'), -0.3);
  A.asmApply(asm, P); D.commitDesign(asm, D.designPrescription(asm));
  const out = ZE.zmxExport(ST.project.elements, [587.56]);
  assert.ok(/TYPE COORDBRK/.test(out.text) && /GLAS MIRROR/.test(out.text), 'coordinate breaks and a mirror written');
  const Z = ZI.parseZmx(out.text, 'x.zmx'), F = frames(Z);
  const DP = D.designPrescription(asm), S = E.lensSystem(DP, 587.56, { epd: 6, image: DP.image });
  let worst = 0, n = 0;
  for (const deg of [0, 2]) for (const [px, py] of [[0, 0], [0, 0.9], [0.9, 0], [-0.6, -0.6], [0.5, -0.7]]) {
    const th = deg * Math.PI / 180, ab = E.aimRay(S, th, px, py), R = E.lensLaunch(S, th, ab[0], ab[1], new Float64Array(8));
    const got = trace(Z, F, [R[0], R[1], R[2]], [R[3], R[4], R[5]], 587.56), want = E.rayAt(S, th, px, py);
    worst = Math.max(worst, Math.hypot(got[0] - want[0], got[1] - want[1])); n++;
  }
  assert.ok(n === 10 && worst < 1e-7, 'worst ' + worst + ' mm');
  // after the mirror the thicknesses are negative, as the light runs along -z (the image real, beyond the last lens)
  assert.ok(DP.image > 0, 'image ' + DP.image);
  const after = Z.surfs.slice(Z.surfs.findIndex(s => s.glass && /^MIRROR/.test(s.glass.name)) + 1).filter(s => s.type !== 'COORDBRK' && Math.abs(s.disz) > 1e-9);
  assert.ok(after.length && after.every(s => s.disz < 0), 'thicknesses after the mirror ' + after.map(s => s.disz).join(', '));
});
