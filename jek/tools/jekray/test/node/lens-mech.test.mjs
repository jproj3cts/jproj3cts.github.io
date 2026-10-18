/* A lens's mechanical reference and a cemented lens's tolerances. A ball lens tilted about its centre is the same
   ball (nothing changes); about its first vertex it is moved. A wedge at the cemented interface of a doublet with a
   flat back bends the light by (n₁ − n₂) α, the image moving by (n₁ − n₂) α (t₂/n₂ + BFL). A flat surface decentred
   changes nothing; a plano-convex lens's curved face decentred is the whole lens decentred. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const E = await import('../../src/engines/lens-engine.js');
const T = await import('../../src/engines/lens-tol.js');
const A = await import('../../src/core/assembly.js');
const { refIndex } = await import('../../src/core/glass.js');

const surf = (R, x) => ({ R, k: 0, a2: 0, A: [], odd: null, semi: 4.9, ...x });
const nm = 587.56, ARC = 1 / 60;
const chiefAt = (P, img) => E.rayAt(E.lensSystem(P, nm, { epd: 2, image: img }), 3 * Math.PI / 180, 0, 0);
const ops = (kind, i, axis, lim) => [{ kind, i, axis, lim }];

test('a ball lens tilted about its centre is the same ball; about its first vertex it is moved', () => {
  const ball = { surfaces: [surf(null, { stop: true, semi: 2 }), surf(5), surf(-5)], gaps: [8, 10], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }], stopIndex: 0,
    parts: [{ id: 'S', kind: 'stop', n: 1 }, { id: 'B', kind: 'lens', n: 2 }] };
  const img = E.lensSystem(ball, nm).par.bfl, C0 = chiefAt(ball, img), o = ops('tilt', 1, 'x', 60);
  const Cc = chiefAt(T.perturb(ball, o, [60], 'centre'), img), Cf = chiefAt(T.perturb(ball, o, [60], 'first'), img), Cl = chiefAt(T.perturb(ball, o, [60], 'last'), img);
  assert.ok(Math.abs(Cc[1] - C0[1]) < 1e-9 && Math.abs(Cc[0] - C0[0]) < 1e-9, 'about its centre: ' + (Cc[1] - C0[1]));
  assert.ok(Math.abs(Cf[1] - C0[1]) > 1e-3 && Math.abs(Cl[1] - C0[1]) > 1e-3);
  // about its first and its last vertex, moved the two ways
  assert.ok((Cf[1] - C0[1]) * (Cl[1] - C0[1]) < 0);
});

test('a wedge at a cemented interface bends the light by (n₁ − n₂) α', () => {
  // N-BK7 then F2, a flat interface and a flat back
  const d = { surfaces: [surf(40), surf(null), surf(null)], gaps: [4, 3], materials: [{ glass: 'N-BK7' }, { glass: 'F2' }], stopIndex: 0, parts: [{ id: 'D', kind: 'lens', n: 3 }] };
  const S0 = E.lensSystem(d, nm, { epd: 2 }), bfl = S0.par.bfl, n1 = refIndex({ glass: 'N-BK7' }, nm), n2 = refIndex({ glass: 'F2' }, nm), a = 2 * ARC * Math.PI / 180;
  const S = E.lensSystem(T.perturb(d, ops('wedge', 1, 'x', 2), [2]), nm, { epd: 2, image: bfl }), C = E.rayAt(S, 0, 0, 0);
  const want = Math.abs((n1 - n2) * a * (3 / n2 + bfl));
  assert.ok(Math.abs(Math.abs(C[1]) - want) < 0.01 * want, Math.abs(C[1]) + ' against ' + want);
});

test('a flat surface decentred changes nothing; a plano-convex lens’s curved face decentred is the whole lens decentred', () => {
  const pc = { surfaces: [surf(null, { stop: true, semi: 2 }), surf(30), surf(null)], gaps: [3, 4], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }], stopIndex: 0,
    parts: [{ id: 'S', kind: 'stop', n: 1 }, { id: 'L', kind: 'lens', n: 2 }] };
  const img = E.lensSystem(pc, nm).par.bfl, C0 = chiefAt(pc, img);
  const flat = chiefAt(T.perturb(pc, ops('sdec', 2, 'y', 0.1), [0.1]), img);
  assert.ok(Math.abs(flat[0] - C0[0]) < 1e-12 && Math.abs(flat[1] - C0[1]) < 1e-12);
  const face = chiefAt(T.perturb(pc, ops('sdec', 1, 'y', 0.1), [0.1]), img), whole = chiefAt(T.perturb(pc, ops('dec', 1, 'y', 0.1), [0.1]), img);
  assert.ok(Math.abs(face[1] - whole[1]) < 1e-12 && Math.abs(face[1] - C0[1]) > 1e-3, face[1] + ' against ' + whole[1]);
  assert.equal(A.normTol({}).pivot, 'first');
  assert.equal(A.normTol({}).sdec.on, false);
});
