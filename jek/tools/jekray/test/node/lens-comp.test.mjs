/* Compensators beyond the focus: an air gap, a lens's decentre or tilt, each moved within its range for each build.
   A lens decentred, with its own decentre as the compensator, is set back exactly (to the nominal with that compensator); held to a smaller
   range it is set back only so far, and stops at it; a lens's thickness error is better taken up by the air gap
   after it, with the focus, than by the focus alone; settings naming a gap or lens the design lacks are passed over. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const E = await import('../../src/engines/lens-engine.js');
const T = await import('../../src/engines/lens-tol.js');
const A = await import('../../src/core/assembly.js');

const surf = (R, x) => ({ R, k: 0, a2: 0, A: [], odd: null, semi: 12, ...x });
// a stop, then two singlets 6 mm apart
const doublet = () => ({ surfaces: [surf(null, { stop: true, semi: 5 }), surf(25), surf(-25), surf(-60), surf(200)], gaps: [2, 5, 3, 2.5], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }, { glass: 'AIR' }, { glass: 'F2' }], stopIndex: 0,
  parts: [{ id: 'S', kind: 'stop', n: 1 }, { id: 'L', kind: 'lens', n: 2 }, { id: 'M', kind: 'lens', n: 2 }] });
const prob = () => { const P = doublet(); P.image = E.lensSystem(P, 587.56).par.bfl; return { P, cond: A.normCond({ aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0 }, { deg: 3 }], waves: [{ nm: 587.56 }] }), design: A.normDesign({}) }; };

test('a lens decentred is set back exactly by its own decentre, and only so far within a smaller range', () => {
  const pr = prob(), nom = T.compensated(pr, JSON.parse(JSON.stringify(pr.P)), true).crit;
  const ops = [{ kind: 'dec', i: 1, axis: 'y', lim: 0.2 }], built = () => T.perturb(pr.P, ops, [0.2]);
  const bare = T.compensated(pr, built(), true).crit;
  const comp = [{ kind: 'dec', i: 1, axis: 'y', range: 0.4 }], full = T.compensated(pr, built(), true, comp);
  // (its fields on one side, the nominal itself is a little better with the lens moved a little: the same compensator on it)
  const nomC = T.compensated(pr, JSON.parse(JSON.stringify(pr.P)), true, comp);
  assert.ok(bare > 1.05 * nom && nomC.crit <= nom);
  assert.ok(Math.abs(full.crit - nomC.crit) < 1e-6 * nom, full.crit + ' against ' + nomC.crit);
  assert.ok(Math.abs(full.cv[0] - (nomC.cv[0] - 0.2)) < 1e-5, 'moved by ' + full.cv[0] + ', the nominal by ' + nomC.cv[0]);
  const part = T.compensated(pr, built(), true, [{ kind: 'dec', i: 1, axis: 'y', range: 0.08 }]);
  assert.ok(Math.abs(part.cv[0] + 0.08) < 1e-12 && part.crit < bare && part.crit > full.crit, JSON.stringify(part));
});

test('a lens’s thickness error is better taken up by the air gap after it than by the focus alone', () => {
  const pr = prob(), ops = [{ kind: 'thk', i: 1, lim: 0.2 }], built = () => T.perturb(pr.P, ops, [0.2]);
  const focus = T.compensated(pr, built(), true).crit, gap = T.compensated(pr, built(), true, [{ kind: 'gap', i: 2, range: 0.5 }]);
  assert.ok(gap.crit < focus, gap.crit + ' against ' + focus);
  assert.ok(Math.abs(gap.cv[0]) <= 0.5);
  // settings naming a gap inside a lens, or a part the design lacks, are passed over
  assert.deepEqual(T.compsFor(pr.P, [{ kind: 'gap', i: 1, range: 1 }, { kind: 'dec', i: 9, axis: 'x', range: 1 }, { kind: 'dec', i: 0, axis: 'x', range: 1 }, { kind: 'gap', i: 2, range: 1 }]), [{ kind: 'gap', i: 2, range: 1 }]);
  assert.deepEqual(A.normTol({ comps: [{ kind: 'tilt', i: 2, axis: 'x', range: 5 }, { kind: 'tilt', i: 2, axis: 'x', range: 7 }, { kind: 'dec', i: 1 }, { kind: 'gap', i: 3 }] }).comps,
    [{ kind: 'tilt', i: 2, axis: 'x', range: 5 }, { kind: 'gap', i: 3, range: 0.5 }]);
});
