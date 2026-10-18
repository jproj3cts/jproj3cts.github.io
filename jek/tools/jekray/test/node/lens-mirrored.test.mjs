/* Mirrored lens faces in the Optical designer: a Mangin mirror and a solid telescope read from the bench as the
   light meets their faces (core/assembly.js lensVisits), the later meetings linked to the first, each meeting's
   clear radius and central obscuration from the zone, and the engine's first order against a hand trace. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const E = await import('../../src/engines/lens-engine.js');
const A = await import('../../src/core/assembly.js');
const { normElement } = await import('../../src/state/elements.js');

const cond = { aperture: { kind: 'epd', v: 20 }, fields: [{ deg: 0, w: 1 }], waves: [{ nm: 587.56, w: 1 }], primary: 0 };
const lensOf = o => normElement(Object.assign({ type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, bench: 'b', group: 'asm' }, o));
const asmOf = () => ({ id: 'asm', name: 'A', bench: 'b', ref: 'L', rev: false, cond });

test('a Mangin mirror: front, back as a mirror, front again (linked, flipped); its focal length the hand trace’s', () => {
  const e = lensOf({ diameter: 30, surfaces: [{ R: -200 }, { R: -100, mirror: { zone: 'all' } }], gaps: [6], materials: [{ glass: 'N-BK7' }] });
  const P = A.asmPrescription(asmOf(), [e]);
  assert.equal(P.surfaces.length, 3);
  assert.deepEqual(P.surfaces.map(s => !!s.mirror), [false, true, false]);
  assert.deepEqual(P.surfaces.map(s => s.from.v || 0), [0, 0, 1]);
  assert.deepEqual(P.surfaces[2].link, { i: 0, flip: true });
  assert.equal(P.surfaces[2].R, 200);                      // the front face met from inside: the other sign
  assert.equal(P.surfaces[1].glink, 0);                    // the glass crossed back is the glass crossed in
  assert.deepEqual(P.gaps, [6, 6]);
  assert.ok(P.folded && P.parts[0].n === 3);
  const S = E.lensSystem(P, 587.56, { epd: 20 });
  // by hand: into the glass, the mirror (u += 2 c y), out through the front seen from behind
  const n = S.n[1], R1 = -200, R2 = -100, t = 6;
  let y = 1, u = -(n - 1) * (1 / R1) / n;
  y += t * u; u += 2 * (1 / R2) * y; y += t * u;
  u = n * u - (1 - n) * (1 / -R1) * y;
  assert.ok(Math.abs(S.par.efl - (-1 / u)) < 1e-9 && Math.abs(S.par.bfl - (-y / u)) < 1e-9, S.par.efl + ' vs ' + (-1 / u));
  // the light leaves back the way it came: the image before the lens, on the entrance side
  assert.ok(S.img && S.img.d[2] < 0 && S.img.p[2] < 0, JSON.stringify(S.img));
  // a change to the first meeting reaches the linked one when the engine runs
  P.surfaces[0].R = -150; E.lensSystem(P, 587.56, { epd: 20 });
  assert.equal(P.surfaces[2].R, 150);
});

test('a solid telescope: round the spot, the annulus as a mirror, the spot as a mirror, out through the hole; the hole’s rays are the ones that land', () => {
  const e = lensOf({ diameter: 50, surfaces: [{ R: null, mirror: { zone: 'in', r: 16.5 } }, { R: -200, mirror: { zone: 'out', r: 6.5 } }], gaps: [40], materials: [{ glass: 'N-BK7' }] });
  const P = A.asmPrescription(asmOf(), [e]);
  assert.equal(P.surfaces.length, 4);
  assert.deepEqual(P.surfaces.map(s => !!s.mirror), [false, true, true, false]);
  assert.deepEqual(P.surfaces.map(s => s.semi), [25, 25, 16.5, 6.5]);
  assert.deepEqual(P.surfaces.map(s => s.obs || 0), [16.5, 6.5, 0, 0]);
  assert.deepEqual(P.surfaces.map(s => s.from.i), [0, 1, 0, 1]);
  assert.deepEqual(P.gaps, [40, 40, 40]);
  assert.ok(!P.folded || P.surfaces.filter(s => s.mirror).length % 2 === 0);
  // an even number of reflections: the light leaves forward, and the lens does not fold the axis
  const LF = A.lensFoldOf(e, false);
  assert.ok(LF && !LF.folds && LF.inside === 120 && LF.exitAlong === 40, JSON.stringify(LF));
  const S = E.lensSystem(P, 587.56, { epd: 44 });
  // the primary's focus is R/2 = 100 mm; twice the thickness is 80; the last 20 mm are in glass, so the focus is 20/n behind the block
  assert.ok(Math.abs(S.par.bfl - 20 / S.n[1]) < 0.5, 'bfl ' + S.par.bfl);
  const edge = E.rayPath(S, 0, 0, 1), inner = E.rayPath(S, 0, 0, 0.85), axis = E.rayPath(S, 0, 0, 0.5);   // 22, 18.7 and 11 mm: round the spot twice, inside it once
  assert.equal(edge.lost, -1);                                  // the marginal ray: round the spot, off the annulus, off the spot, through the hole
  assert.ok(Math.abs(edge.pts[3][0]) < 16.5 && Math.abs(edge.pts[4][0]) < 6.5, JSON.stringify(edge.pts.map(p => p[0])));
  assert.equal(inner.lost, -1);
  assert.ok(axis.lost !== -1 && axis.pts.length === 2, 'the ray inside the spot is blocked at the front: ' + axis.lost);
  // written back to the bench part unchanged: two faces, their zones kept
  const e2 = JSON.parse(JSON.stringify(e));
  A.asmApply(asmOf(), P, [e2]);
  assert.equal(e2.surfaces.length, 2);
  assert.deepEqual(e2.surfaces.map(s => s.mirror), [{ zone: 'in', r: 16.5 }, { zone: 'out', r: 6.5 }]);
  assert.deepEqual(e2.gaps, [40]);
  assert.equal(e2.surfaces[1].R, -200);
});

test('a zone reaching the face’s edge degenerates, the face keeps its own clear radius on the bench, and the image distance is the design’s to edit', async () => {
  const LD = await import('../../src/engines/lens-design.js');
  // an asphere 12.7 mm wide whose back is "mirrored outside 20 mm": no annulus exists, so the light goes straight through
  const e = lensOf({ diameter: 12.7, surfaces: [{ R: 8.2, k: -0.9, mirror: { zone: 'in', r: 2.1 } }, { R: null, mirror: { zone: 'out', r: 20 } }], gaps: [10], materials: [{ glass: 'S-LAH64' }] });
  const P = A.asmPrescription(asmOf(), [e]);
  assert.equal(P.surfaces.length, 2);
  assert.deepEqual(P.surfaces.map(s => !!s.mirror), [false, false]);
  assert.deepEqual(P.surfaces.map(s => s.semi), [6.35, 6.35]);
  assert.equal(P.surfaces[0].obs, 2.1);
  // a spot as wide as the face is the whole face mirrored
  const e3 = lensOf({ diameter: 12.7, surfaces: [{ R: 8.2 }, { R: null, mirror: { zone: 'in', r: 9 } }], gaps: [10], materials: [{ glass: 'S-LAH64' }] });
  const P3 = A.asmPrescription(asmOf(), [e3]);
  assert.deepEqual(P3.surfaces.map(s => !!s.mirror), [false, true, false]);
  assert.deepEqual(P3.surfaces.map(s => s.semi), [6.35, 6.35, 6.35]);
  // written back, the faces are as wide as the lens, not as wide as a zone
  const e2 = JSON.parse(JSON.stringify(e3));
  A.asmApply(asmOf(), P3, [e2]);
  assert.deepEqual(e2.surfaces.map(s => s.semi || null), [null, null]);
  assert.equal(e2.diameter, 12.7);
  // the last row is a linked meeting, but its thickness is the image distance: editable
  assert.equal(LD.editable(P3, 't', 2), true);
  assert.equal(LD.editable(P3, 'R', 2), false);
  assert.equal(LD.editable(P3, 't', 0), true);
  assert.equal(LD.editable(P3, 't', 1), false);                 // the glass crossed back is the glass crossed in
});

test('a spot with a shape of its own: its own row in the designer, flipped as met from inside; written back as the zone’s; a stepped face on the bench', async () => {
  const Gm = await import('../../src/core/geometry.js');
  const e = lensOf({ diameter: 50, surfaces: [{ R: null, mirror: { zone: 'in', r: 16.5, R: 120, k: -1 } }, { R: -200, mirror: { zone: 'out', r: 6.5 } }], gaps: [40], materials: [{ glass: 'N-BK7' }] });
  const P = A.asmPrescription(asmOf(), [e]);
  assert.deepEqual(P.surfaces.map(s => (s.faceOwn ? 'F' : '') + (s.zown ? 'Z' : '') + (s.link ? 'L' : '')), ['F', 'Z', 'Z', 'F']);
  assert.deepEqual(P.surfaces.map(s => s.R), [null, -200, -120, -200]);     // the spot met from inside: the other sign
  assert.equal(P.surfaces[2].k, -1);
  // its focal length by hand, with the rows as listed: in through the flat, off the back (R −200), off the spot (R −120 as
  // met from inside: convex to the returning light), out through the hole, which has the face's own curve (R −200)
  const S = E.lensSystem(P, 587.56, { epd: 44 }), n = S.n[1], t = 40;
  let y = 1, u = 0; y += t * u; u += 2 * (1 / -200) * y; y += t * u; u += 2 * (1 / -120) * y; y += t * u; u = n * u - (1 - n) * (1 / -200) * y;
  assert.ok(Math.abs(S.par.efl - (-1 / u)) < 1e-9 && Math.abs(S.par.bfl - (-y / u)) < 1e-9, S.par.efl + ' vs ' + (-1 / u));
  // the spot row edited: the zone's own shape on the bench, the face's left alone
  P.surfaces[2].R = -150; P.surfaces[2].k = 0;
  const e2 = JSON.parse(JSON.stringify(e)); A.asmApply(asmOf(), P, [e2]);
  assert.deepEqual(e2.surfaces[0].mirror, { zone: 'in', r: 16.5, R: 150, k: 0 });
  assert.equal(e2.surfaces[0].R, null);
  assert.deepEqual(e2.surfaces[1].mirror, { zone: 'out', r: 6.5 });
  // a zone shaped as its face is follows the face
  const P3 = A.asmPrescription(asmOf(), [e2]); P3.surfaces[2].R = null; P3.surfaces[2].k = 0;
  const e3 = JSON.parse(JSON.stringify(e2)); A.asmApply(asmOf(), P3, [e3]);
  assert.deepEqual(e3.surfaces[0].mirror, { zone: 'in', r: 16.5 });
  // on the bench the front is flat outside the spot and the spot's own sphere inside it, a step between
  const F = Gm.lensSurfaces(e2)[0];
  assert.equal(Gm.sagFn(F, 20), 0);
  assert.ok(Math.abs(Gm.sagFn(F, 10) - (150 - Math.sqrt(150 * 150 - 100))) < 1e-9, 'the spot’s sag ' + Gm.sagFn(F, 10));
  assert.ok(Gm.dsagFn(F, 10) > 0 && Gm.dsagFn(F, 20) === 0);
});
