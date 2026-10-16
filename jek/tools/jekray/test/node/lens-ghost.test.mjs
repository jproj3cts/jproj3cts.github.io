/* Ghosts in lens design: light reflected back by one surface and forward again by an earlier one. A
   singlet's one ghost against its paraxial matrices written out by hand (refraction, the gap, the back
   face as a mirror in the glass, the gap, the front face as a mirror met from behind, the gap,
   refraction out); its strength the two faces' Fresnel reflectances; a coating's reflectance in its
   place; and a triplet's ghosts all found, the brightest first. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const D = await import('../../src/engines/lens-design.js');
const AN = await import('../../src/engines/lens-analysis.js');
const GH = await import('../../src/engines/lens-ghost.js');
const { refIndex } = await import('../../src/core/glass.js');

const surf = (R, coat) => ({ R, k: 0, a2: 0, A: [], odd: null, semi: null, coat: coat || { mode: 'bare', R: 4 } });
const design = (els, cond) => {
  loadProject({ format: 'jekray', version: 1, elements: els,
    assemblies: [{ id: 'g', name: 'T', ref: els[0].id, cond: Object.assign({ aperture: { kind: 'epd', v: 8 }, fields: [{ deg: 0 }], waves: [{ nm: 587.56 }] }, cond), design: { solves: { 't:image': { kind: 'focus' } } } }] });
  const a = ST.project.assemblies[0], P = D.designPrescription(a); D.commitDesign(a, P);
  const P2 = D.designPrescription(a);
  return { A: AN.anaSystems(a, P2), coats: P2.surfaces.map(s => { const e = ST.project.elements.find(x => x.id === s.from.id); return e.surfaces ? e.surfaces[s.from.i].coat : null; }) };
};
const singlet = coat2 => ({ type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, diameter: 25, surfaces: [surf(50), surf(-50, coat2)], gaps: [5], materials: [{ glass: 'N-BK7' }], group: 'g' });

test('a singlet’s ghost focuses where its matrices say, as bright as its two faces reflect', () => {
  const { A, coats } = design([singlet()]);
  const G = GH.ghostAnalysis(A, coats, 0, 11);
  assert.ok(G.ok);
  assert.equal(G.ghosts.length, 1);
  const g = G.ghosts[0], n = refIndex({ glass: 'N-BK7' }, 587.56), S = A.Sp, imgD = S.imageZ - S.z[S.N - 1];
  // by hand: (height, angle)
  let y = 4, u = 0;
  const refr = (n1, n2, c) => { u = (n1 * u - (n2 - n1) * c * y) / n2; }, go = d => { y += d * u; }, mir = c => { u += 2 * c * y; };
  refr(1, n, 1 / 50); go(5); mir(-1 / 50); go(5); mir(-1 / 50); go(5); refr(n, 1, -1 / 50);
  const focus = -y / u - imgD, yImg = Math.abs(y + imgD * u);
  assert.ok(Math.abs(g.focus - focus) < 1e-9 * Math.abs(focus), 'focus ' + g.focus + ' against ' + focus);
  assert.ok(Math.abs(g.yImg - yImg) < 1e-9 * yImg, 'height ' + g.yImg + ' against ' + yImg);
  const Rf = ((n - 1) / (n + 1)) ** 2;
  assert.ok(Math.abs(g.R - Rf * Rf) < 1e-15);
  assert.equal(g.reach, 1);
  // the ghost is far wider on the image than the image's own spot, so far dimmer than R²
  assert.ok(g.rel < g.R && g.rel > 0);
  assert.ok(g.rms > 10 * G.main.rms);
});

test('a coating’s reflectance takes the place of Fresnel’s', () => {
  const { A, coats } = design([singlet({ mode: 'ar', R: 0.25 })]);
  const g = GH.ghostAnalysis(A, coats, 0, 7).ghosts[0], n = refIndex({ glass: 'N-BK7' }, 587.56);
  assert.ok(Math.abs(g.R - ((n - 1) / (n + 1)) ** 2 * 0.0025) < 1e-15);
});

test('a doublet of singlets has all six of its ghosts, the brightest against the image first', () => {
  const L2 = Object.assign(singlet(), { id: 'M', name: 'M', x: 20, surfaces: [surf(80), surf(null)] });
  const { A, coats } = design([singlet(), L2]);
  const G = GH.ghostAnalysis(A, coats, 0, 9);
  assert.equal(G.ghosts.length, 6);
  for (let k = 1; k < 6; k++) assert.ok(G.ghosts[k - 1].rel >= G.ghosts[k].rel);
  assert.deepEqual(G.ghosts.map(g => g.a + '' + g.b).sort(), ['10', '20', '21', '30', '31', '32']);
});
