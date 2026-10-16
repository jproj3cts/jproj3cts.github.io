/* Stock lenses from the user's own lens files: a singlet of a design matched against lens files (written by the exporter
   and read back by the importer, as a user's would be). Lenses of another number of faces, of the other sign, too far
   in focal length or too small for the beam are left out; the same lens comes first, and swapped in it keeps the
   design's merit (the design's own lens, the same air optimised); a plano-convex lens does better with its curved face to the light from infinity than turned round,
   as third-order theory has it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const D = await import('../../src/engines/lens-design.js');
const O = await import('../../src/engines/lens-opt.js');
const K = await import('../../src/engines/lens-stock.js');
const ZE = await import('../../src/io/zmx-export.js');
const ZI = await import('../../src/io/zmx-import.js');

const lens = (id, surfaces, gaps, materials, dia) => ({ type: 'lens', id, name: id, x: 0, y: 0, angle: 0, diameter: dia || 25, surfaces, gaps, materials });
// the user's lens files: each part written as a lens file, then read back as an import reads it
function userFiles() {
  const parts = [
    lens('SAME-50', [{ R: 51.5 }, { R: -51.5 }], [4], [{ glass: 'N-BK7' }]),
    lens('PCX-50', [{ R: 25.84 }, { R: null }], [4], [{ glass: 'N-BK7' }]),
    lens('BCX-75', [{ R: 77 }, { R: -77 }], [4], [{ glass: 'N-BK7' }]),
    lens('SMALL-50', [{ R: 51.5 }, { R: -51.5 }], [3], [{ glass: 'N-BK7' }], 6),
    lens('ACH-50', [{ R: 33 }, { R: -27 }, { R: -140 }], [6, 2.5], [{ glass: 'N-BAF10' }, { glass: 'N-SF6' }]),
    lens('BCC-50', [{ R: -51.5 }, { R: 51.5 }], [2], [{ glass: 'N-BK7' }]),
  ];
  loadProject({ format: 'jekray', version: 1, elements: parts });
  return ST.project.elements.map(e => { const t = ZE.zmxExport([e], [587.56]).text, Z = ZI.parseZmx(t, e.name + '.zmx'); return ZE.zmxPart(Z, e.name + '.zmx', 'lens'); });
}
function design() {
  loadProject({ format: 'jekray', version: 1, elements: [
    { type: 'stop', id: 'S', name: 'S', x: -10, y: 0, angle: 0, aperture: 10, outer: 30, group: 'g' },
    Object.assign(lens('L', [{ R: 51.5 }, { R: -51.5 }], [4], [{ glass: 'N-BK7' }]), { group: 'g' })],
    assemblies: [{ id: 'g', name: 'Singlet', ref: 'S', cond: { aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0 }, { deg: 3 }], waves: [{ nm: 587.56 }] }, design: { solves: { 't:image': { kind: 'focus' } } } }] });
  const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a)); return a;
}

test('the user’s lens files: the wrong ones left out, the same lens first, and swapped in it keeps the merit', () => {
  const files = userFiles(), stock = files.map(e => K.stockOf(e, 587.56));
  const asm = design(), P = D.designPrescription(asm), [d] = K.designLenses(asm, P);
  assert.ok(Math.abs(d.f - stock[0].f) < 1e-9 && d.beam > 9 && d.beam < 11, 'the design lens: f ' + d.f + ', beam ' + d.beam);
  const C = K.stockCandidates(d, stock);
  assert.deepEqual(C.map(c => c.s.name), ['SAME-50', 'PCX-50'], C.map(c => c.s.name).join(', '));
  const prob = O.optProblem(asm, P), nominal = K.stockBaseline(prob, d).merit, T = K.stockTry(prob, d, C[0].s, C[0].flip);
  assert.ok(Math.abs(T.merit / nominal - 1) < 1e-6, T.merit + ' against ' + nominal);
});

test('a plano-convex lens: better with its curved face to the light from infinity than turned round', () => {
  const files = userFiles(), stock = files.map(e => K.stockOf(e, 587.56)), pcx = stock.find(s => s.name === 'PCX-50');
  const asm = design(), P = D.designPrescription(asm), [d] = K.designLenses(asm, P), prob = O.optProblem(asm, P);
  const fwd = K.stockTry(prob, d, pcx, false), back = K.stockTry(prob, d, pcx, true);
  assert.ok(fwd.merit < 0.5 * back.merit, 'curved side first ' + fwd.merit + ', flat side first ' + back.merit);
  // put in (before the air is optimised): the stock lens's thickness, its first vertex where the design's was, and the
  // air either side and the image distance the only variables
  const q = K.stockTrial(prob, d, pcx, false);
  assert.ok(Math.abs(q.P.gaps[d.i0] - 4) < 1e-9 && q.P.gaps[d.i0 - 1] === P.gaps[d.i0 - 1] && q.P.surfaces[d.i0 + 1].R === null);
  assert.deepEqual(q.design.vars, ['t:S.0']);
});
