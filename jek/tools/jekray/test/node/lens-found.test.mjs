/* The designs a global search keeps: the best distinct ones it reaches, best first, saved with the design
   (and read back from a file), each put back with its own merit; two the same design kept once. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject, serialize } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const D = await import('../../src/engines/lens-design.js');
const O = await import('../../src/engines/lens-opt.js');
const { normFound } = await import('../../src/core/assembly.js');

const triplet = () => {
  const L = (id, x, R1, R2, t, glass) => ({ type: 'lens', id, name: id, x, y: 0, angle: 0, diameter: 20, surfaces: [{ R: R1 }, { R: R2 }], gaps: [t], materials: [{ glass }], group: 'g' });
  loadProject({ format: 'jekray', version: 1, elements: [L('F', 0, 25, -300, 3.3, 'N-SK16'), L('M', 8, -25, 22, 1, 'F2'), L('B', 15, 70, -20, 3, 'N-SK16')],
    assemblies: [{ id: 'g', name: 'T', ref: 'F', cond: { aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0 }, { deg: 14 }, { deg: 20 }], waves: [{ nm: 486.13 }, { nm: 587.56 }, { nm: 656.27 }], primary: 1 },
      design: { solves: { 't:image': { kind: 'focus' } }, vars: ['R:F.0', 'R:F.1', 'R:M.0', 'R:M.1', 'R:B.0', 'R:B.1'], merit: { ops: [{ op: 'EFL', target: 50, weight: 1 }] } } }] });
  const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a)); return a;
};

test('two designs within a part in 10³ are one, the better kept; the list best first, ten at most', () => {
  const L = [];
  O.keepFound(L, { x: [1, 2], merit: 3 });
  O.keepFound(L, { x: [1 + 1e-6, 2], merit: 2 });
  assert.equal(L.length, 1); assert.equal(L[0].merit, 2);
  O.keepFound(L, { x: [1 + 1e-6, 2], merit: 5 });
  assert.equal(L[0].merit, 2);
  for (let k = 0; k < 20; k++) O.keepFound(L, { x: [k, 0], merit: 10 - k / 4 });
  assert.equal(L.length, O.FOUND_MAX);
  for (let k = 1; k < L.length; k++) assert.ok(L[k].merit >= L[k - 1].merit);
});

test('a global search keeps its distinct designs, the best its result, each put back with its own merit, and saved with the design', () => {
  const a = triplet(), P = D.designPrescription(a), prob = O.optProblem(a, P);
  const out = O.optRun(prob, { mode: 'global', trials: 6, seed: 3 });
  assert.ok(out.found.length >= 2);
  for (let i = 0; i < out.found.length; i++) for (let j = 0; j < i; j++) assert.ok(!O.sameDesign(out.found[i].x, out.found[j].x));
  assert.ok(Math.abs(out.found[0].merit - out.merit) <= 1e-12 * Math.max(1, out.merit) || out.merit <= out.found[0].merit);
  // each, put back into the design, has the merit it was kept with
  for (const f of out.found) {
    const P2 = D.designPrescription(a);
    O.optApply(P2, prob, { vars: out.vars, x: f.x });
    const m = O.meritReport(O.optProblem(a, P2)).merit;
    assert.ok(Math.abs(m - f.merit) < 1e-9 * Math.max(1, f.merit), m + ' against ' + f.merit);
  }
  // saved with the design, and read back
  const D0 = D.designOf(a);
  D0.found = out.found.map(f => ({ vars: out.vars, x: f.x, merit: f.merit, t: 1 }));
  const back = normFound(JSON.parse(JSON.stringify(serialize().assemblies[0].design.found)));
  assert.equal(back.length, out.found.length);
  assert.deepEqual(back[0].x, out.found[0].x);
  assert.deepEqual(normFound([{ vars: [{ k: 'R:F.0' }], x: [1, 2], merit: 1 }, { vars: [{ k: '<bad>' }], x: [1], merit: 1 }]), []);
});
