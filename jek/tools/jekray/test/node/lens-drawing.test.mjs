/* What a lens's drawing says: its edge thickness from the sags at its full diameter, each face
   convex or concave as the glass sees it, its glass's nd and νd, and the tolerances in ISO 10110's
   terms: the radius's own tolerance from the fringes agreeing with the tolerancing's own change of
   radius, the centring the lens's tilt plus its decentre over the radius. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { drawingData } = await import('../../src/engines/lens-drawing.js');
const { perturb } = await import('../../src/engines/lens-tol.js');
const { normTol } = await import('../../src/core/assembly.js');

const surf = (R, semi) => ({ R, k: 0, a2: 0, A: [], odd: null, semi });
const lensP = (R1, R2, t, glass, semi) => ({ surfaces: [surf(R1, semi), surf(R2, semi)], gaps: [t], materials: [{ glass }], stopIndex: -1, parts: [{ id: 'L', kind: 'lens', flip: false, n: 2 }] });

test('a biconvex lens: its edge thickness from its sags, both faces convex, its glass N-BK7', () => {
  const D = drawingData(lensP(51.5, -51.5, 3.6, 'N-BK7', 12.7), 0, { name: 'LB', dia: 25.4 });
  const sag = 51.5 - Math.sqrt(51.5 ** 2 - 12.7 ** 2);
  assert.ok(Math.abs(D.elements[0].et - (3.6 - 2 * sag)) < 1e-12, 'ET ' + D.elements[0].et);
  assert.deepEqual(D.surfaces.map(s => s.face), ['CX', 'CX']);
  assert.ok(Math.abs(D.elements[0].nd - 1.5168) < 1e-4 && Math.abs(D.elements[0].vd - 64.17) < 0.05, D.elements[0].nd + ' ' + D.elements[0].vd);
  // 0.42 mm at its edge: thin enough to be said
  assert.ok(!D.toleranced && D.notes.length === 1 && /only 0.419 mm thick at its edge/.test(D.notes[0]), D.notes.join());
});

test('a plano-concave lens: one face flat, the other concave; a lens too thin at its edge says so', () => {
  const D = drawingData(lensP(null, 30, 2, 'N-BK7', 10), 0, { dia: 20 });
  assert.deepEqual(D.surfaces.map(s => s.face), ['flat', 'CC']);
  assert.ok(D.elements[0].et > 2);
  const T = drawingData(lensP(20, -20, 2, 'N-BK7', 10), 0, { dia: 20 });
  assert.ok(T.elements[0].et < 0.5 && /thick at its edge/.test(T.notes.join(' ')));
});

test('the tolerances: the radius’s ± from the fringes is the tolerancing’s own change of radius; centring is tilt plus decentre over radius', () => {
  const P = lensP(51.5, -51.5, 3.6, 'N-BK7', 10), T = normTol({});
  const D = drawingData(P, 0, { dia: 25.4, T });
  // tolerancing's change of radius for the same fringes, at the same clear radius
  const dR = Math.max(...[3, -3].map(v => Math.abs(perturb(P, [{ kind: 'rad', i: 0, lim: 3 }], [v]).surfaces[0].R - 51.5)));
  assert.ok(Math.abs(D.surfaces[0].dR - dR) < 1e-12, D.surfaces[0].dR + ' against ' + dR);
  assert.equal(D.surfaces[0].form, 3);
  const want = 1 + 0.025 / 51.5 * 180 * 60 / Math.PI;
  assert.ok(Math.abs(D.surfaces[0].centring - want) < 1e-12, D.surfaces[0].centring + ' ' + want);
  assert.equal(D.elements[0].ctTol, 0.05);
  assert.equal(D.elements[0].ndTol, 0.001);
  assert.ok(Math.abs(D.elements[0].vdTol - D.elements[0].vd * 0.005) < 1e-12);
  assert.ok(D.toleranced);
});

test('a cemented doublet: two glasses, the inner face neither convex nor concave to one glass', () => {
  const P = { surfaces: [surf(61.5, 12.7), surf(-44.2, 12.7), surf(-129, 12.7)], gaps: [6, 2.5], materials: [{ glass: 'N-BAF10' }, { glass: 'N-SF10' }], stopIndex: -1, parts: [{ id: 'D', kind: 'lens', flip: false, n: 3 }] };
  const D = drawingData(P, 0, { dia: 25.4 });
  assert.equal(D.elements.length, 2);
  // the back face's centre is in front of it: it bulges out of the flint, convex
  assert.deepEqual(D.surfaces.map(s => s.face), ['CX', '', 'CX']);
  assert.ok(Math.abs(D.length - 8.5) < 1e-12);
});
