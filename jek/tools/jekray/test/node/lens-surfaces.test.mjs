/* Surfaces with holes, zero-gap stacks and mirror coatings: the bench's stacks (core/geometry.js lensStacks), the
   coatings' reflectance (core/coatings.js), the old "mirror" zones converted on load (parts/lens.js), and the Optical
   designer reading such a lens as the light meets its surfaces (core/assembly.js lensPath): a Mangin mirror, a solid
   telescope of two stacked faces, the write-back, and the designer's first order against a hand trace. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const E = await import('../../src/engines/lens-engine.js');
const A = await import('../../src/core/assembly.js');
const Gm = await import('../../src/core/geometry.js');
const C = await import('../../src/core/coatings.js');
const FP = await import('../../src/core/face-pol.js');
const { normElement } = await import('../../src/state/elements.js');

const cond = { aperture: { kind: 'epd', v: 20 }, fields: [{ deg: 0, w: 1 }], waves: [{ nm: 587.56, w: 1 }], primary: 0 };
const lensOf = o => normElement(Object.assign({ type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, bench: 'b', group: 'asm' }, o));
const asmOf = () => ({ id: 'asm', name: 'A', bench: 'b', ref: 'L', rev: false, cond });
const MIRROR = { mode: 'mirror' };
// the solid telescope: a flat front with a hole, a spot mirror (R −600) stacked in the hole; a back mirror (R −200) with a hole,
// a flat stacked in it: light in through the flat annulus, off the back, off the spot, out through the flat centre
const telescope = () => lensOf({ diameter: 50, surfaces: [{ R: null, hole: 16.5 }, { R: -600, semi: 16.5, coat: MIRROR }, { R: -200, hole: 6.5, coat: { mode: 'mirror', metal: 'Al' } }, { R: null, semi: 6.5 }],
  gaps: [0, 40, 0], materials: [{ glass: 'N-BK7' }, { glass: 'N-BK7' }, { glass: 'N-BK7' }] });

test('a surface keeps its hole, clear radius and coating; a mirror coating reflects wholly (a metal less), passing nothing', () => {
  const e = telescope();
  assert.deepEqual(e.surfaces.map(s => [s.hole, s.semi, s.coat.mode, s.coat.metal]), [[16.5, null, 'bare', undefined], [0, 16.5, 'mirror', 'ideal'], [6.5, null, 'mirror', 'Al'], [0, 6.5, 'bare', undefined]]);
  assert.ok(e.surfaces.every(s => s.mirror === undefined), 'nothing of the old zones');
  assert.equal(normElement({ type: 'lens', surfaces: [{ R: 10, hole: -3 }, { R: null }], gaps: [2] }).surfaces[0].hole, 0);
  assert.equal(C.mirrorR({ mode: 'mirror', metal: 'ideal' }, 633), 1);
  assert.ok(Math.abs(C.mirrorR({ mode: 'mirror', metal: 'Al' }, 633) - 0.9034) < 0.01, 'Al at 633: ' + C.mirrorR({ mode: 'mirror', metal: 'Al' }, 633));
  assert.ok(C.mirrorR({ mode: 'mirror', metal: 'Au' }, 1550) > 0.98 && C.mirrorR({ mode: 'mirror', metal: 'Au' }, 450) < 0.5);
  assert.equal(C.coatR({ mode: 'mirror', metal: 'Ag' }, 1, 1.5, 633), C.mirrorR({ mode: 'mirror', metal: 'Ag' }, 633));
  const amp = FP.faceAmps({ coat: { mode: 'mirror', metal: 'Al' } }, 1, 1.5168, 1, 633), R = C.mirrorR({ mode: 'mirror', metal: 'Al' }, 633);
  assert.ok(Math.abs(amp.rs[1] * amp.rs[1] - R) < 1e-12 && Math.abs(amp.rp[1] * amp.rp[1] - R) < 1e-12, JSON.stringify(amp));
  assert.ok(amp.ts[0] === 0 && amp.ts[1] === 0 && amp.tp[0] === 0 && amp.tp[1] === 0 && amp.tir, 'nothing passes a mirror');
});

test('on the bench a face is the stack of the surfaces at one vertex, each where it reaches: the front flat outside the spot, the spot’s sphere inside', () => {
  const ss = Gm.lensSurfaces(telescope()), st = Gm.lensStacks(ss);
  assert.equal(ss.length, 4);
  assert.deepEqual(ss.map(s => s.stack), [0, 0, 2, 2]);
  assert.deepEqual(ss.map(s => !!s.silver), [false, true, true, false]);
  assert.deepEqual(ss.map(s => s.hole), [16.5, 0, 6.5, 0]);
  assert.equal(st.length, 2);
  assert.deepEqual(st.map(s => s.members.length), [2, 2]);
  assert.ok(Math.abs(st[1].z - st[0].z - 40) < 1e-9);
  const F = st[0], B = st[1];
  assert.equal(F.at(20), ss[0]); assert.equal(F.at(10), ss[1]); assert.equal(F.at(16.5), ss[0]);
  assert.equal(F.sag(20), 0);
  assert.ok(Math.abs(F.sag(10) - (-600 + Math.sqrt(600 * 600 - 100))) < 1e-9, 'the spot’s sag ' + F.sag(10));
  assert.equal(B.at(5), ss[3]); assert.equal(B.at(10), ss[2]);
  assert.equal(B.sag(5), 0);
  assert.ok(Math.abs(B.sag(10) - (-200 + Math.sqrt(200 * 200 - 100))) < 1e-9, 'the annulus curves ' + B.sag(10));
  // a plain lens: one surface a stack
  const st2 = Gm.lensStacks(Gm.lensSurfaces(lensOf({ diameter: 25.4, surfaces: [{ R: 51.5 }, { R: -51.5 }], gaps: [3.6], materials: [{ glass: 'N-BK7' }] })));
  assert.equal(st2.length, 2); assert.deepEqual(st2.map(s => s.members.length), [1, 1]);
});

test('a lens saved with the old “mirror” zones is converted on load: a spot, an annulus, a whole face, a flat centre', () => {
  // the solid telescope as it was saved: the spot "in" 16.5, the back mirrored "out" 6.5
  const t = lensOf({ diameter: 50, surfaces: [{ R: null, mirror: { zone: 'in', r: 16.5 } }, { R: -200, mirror: { zone: 'out', r: 6.5 } }], gaps: [40], materials: [{ glass: 'N-BK7' }] });
  assert.equal(t.surfaces.length, 4);
  assert.deepEqual(t.gaps, [0, 40, 0]);
  assert.deepEqual(t.materials.map(m => m.glass), ['N-BK7', 'N-BK7', 'N-BK7']);
  assert.deepEqual(t.surfaces.map(s => [s.R, s.hole, s.semi, s.coat.mode]), [[null, 16.5, null, 'bare'], [null, 0, 16.5, 'mirror'], [-200, 6.5, null, 'mirror'], [-200, 0, 6.5, 'bare']]);
  assert.ok(t.surfaces.every(s => s.mirror === undefined));
  // a Mangin mirror: its back wholly mirrored is its back mirror coated
  const m = lensOf({ diameter: 30, surfaces: [{ R: -200 }, { R: -100, mirror: { zone: 'all' } }], gaps: [6], materials: [{ glass: 'N-BK7' }] });
  assert.equal(m.surfaces.length, 2); assert.equal(m.surfaces[1].coat.mode, 'mirror'); assert.deepEqual(m.gaps, [6]);
  // a spot with a shape of its own: a surface of its own, with that shape, mirror coated
  const s = lensOf({ diameter: 50, surfaces: [{ R: null, mirror: { zone: 'in', r: 16.5, R: 120, k: -1 } }, { R: -200 }], gaps: [40], materials: [{ glass: 'N-BK7' }] });
  assert.deepEqual(s.surfaces.map(q => [q.R, q.k, q.hole, q.semi, q.coat.mode]), [[null, 0, 16.5, null, 'bare'], [120, -1, 0, 16.5, 'mirror'], [-200, 0, 0, null, 'bare']]);
  // a flat ground into an unmirrored face's centre: a flat surface stacked in a hole, bare
  const f = lensOf({ diameter: 25.4, surfaces: [{ R: 51.5, mirror: { zone: 'none', r: 4, R: null, k: 0 } }, { R: -51.5 }], gaps: [3.6], materials: [{ glass: 'N-BK7' }] });
  assert.deepEqual(f.surfaces.map(q => [q.R, q.hole, q.semi, q.coat.mode]), [[51.5, 4, null, 'bare'], [null, 0, 4, 'bare'], [-51.5, 0, null, 'bare']]);
  assert.deepEqual(f.gaps, [0, 3.6]);
  const st = Gm.lensStacks(Gm.lensSurfaces(f));
  assert.equal(st[0].sag(3), 0); assert.ok(st[0].sag(6) > 0.3, 'the rim curves: ' + st[0].sag(6));
});

test('a Mangin mirror: front, back as a mirror, front again (linked, flipped); its focal length the hand trace’s', () => {
  const e = lensOf({ diameter: 30, surfaces: [{ R: -200 }, { R: -100, coat: MIRROR }], gaps: [6], materials: [{ glass: 'N-BK7' }] });
  assert.ok(A.lensPathed(e));
  const P = A.asmPrescription(asmOf(), [e]);
  assert.equal(P.surfaces.length, 3);
  assert.deepEqual(P.surfaces.map(s => !!s.mirror), [false, true, false]);
  assert.deepEqual(P.surfaces.map(s => s.from.v || 0), [0, 0, 1]);
  assert.deepEqual(P.surfaces[2].link, { i: 0, flip: true });
  assert.equal(P.surfaces[2].R, 200);                      // the front face met from inside: the other sign
  assert.equal(P.surfaces[1].glink, 0);                    // the glass crossed back is the glass crossed in
  assert.deepEqual(P.gaps, [6, 6]);
  assert.ok(P.folded && P.parts[0].n === 3);
  assert.equal(P.surfaces[1].mcoat, true);
  const S = E.lensSystem(P, 587.56, { epd: 20 });
  const n = S.n[1], R1 = -200, R2 = -100, t = 6;
  let y = 1, u = -(n - 1) * (1 / R1) / n;
  y += t * u; u += 2 * (1 / R2) * y; y += t * u;
  u = n * u - (1 - n) * (1 / -R1) * y;
  assert.ok(Math.abs(S.par.efl - (-1 / u)) < 1e-9 && Math.abs(S.par.bfl - (-y / u)) < 1e-9, S.par.efl + ' vs ' + (-1 / u));
  assert.ok(S.img && S.img.d[2] < 0 && S.img.p[2] < 0, JSON.stringify(S.img));
  P.surfaces[0].R = -150; E.lensSystem(P, 587.56, { epd: 20 });
  assert.equal(P.surfaces[2].R, 150);
  // the coating edited in the designer: written back as the surface's
  P.surfaces[1].coat = { mode: 'mirror', metal: 'Ag' };
  const e2 = JSON.parse(JSON.stringify(e)); A.asmApply(asmOf(), P, [e2]);
  assert.deepEqual([e2.surfaces[1].coat.mode, e2.surfaces[1].coat.metal, e2.surfaces[0].R], ['mirror', 'Ag', -150]);
});

test('the solid telescope in the designer: in through the annulus, off the back, off the spot, out through the centre; the hole’s rays land', () => {
  const e = telescope();
  const P = A.asmPrescription(asmOf(), [e]);
  assert.equal(P.surfaces.length, 4);
  assert.deepEqual(P.surfaces.map(s => s.from.i), [0, 2, 1, 3]);
  assert.deepEqual(P.surfaces.map(s => !!s.mirror), [false, true, true, false]);
  assert.deepEqual(P.surfaces.map(s => s.semi), [25, 25, 16.5, 6.5]);
  assert.deepEqual(P.surfaces.map(s => s.obs || 0), [16.5, 6.5, 0, 0]);
  assert.deepEqual(P.surfaces.map(s => s.R), [null, -200, 600, null]);          // the spot met from inside: the other sign
  assert.deepEqual(P.gaps, [40, 40, 40]);
  assert.ok(!P.surfaces.some(s => s.link), 'each surface met once');
  assert.deepEqual(P.surfaces.map(s => s.gidx), [1, undefined, undefined, undefined]);
  const LF = A.lensFoldOf(e, false);
  assert.ok(LF && !LF.folds && LF.inside === 120 && LF.exitAlong === 40, JSON.stringify(LF));
  const S = E.lensSystem(P, 587.56, { epd: 44 }), n = S.n[1], t = 40;
  let y = 1, u = 0; y += t * u; u += 2 * (1 / -200) * y; y += t * u; u += 2 * (1 / 600) * y; y += t * u; u = n * u;
  assert.ok(Math.abs(S.par.efl - (-1 / u)) < 1e-9 && Math.abs(S.par.bfl - (-y / u)) < 1e-9, S.par.efl + ' vs ' + (-1 / u));
  const edge = E.rayPath(S, 0, 0, 1), inner = E.rayPath(S, 0, 0, 0.85), axis = E.rayPath(S, 0, 0, 0.5);
  assert.equal(edge.lost, -1);
  assert.ok(Math.abs(edge.pts[3][0]) < 16.5 && Math.abs(edge.pts[4][0]) < 6.5, JSON.stringify(edge.pts.map(p => p[0])));
  assert.equal(inner.lost, -1);
  assert.ok(axis.lost !== -1 && axis.pts.length === 2, 'the ray inside the spot is blocked at the front: ' + axis.lost);
  // written back unchanged: four surfaces, stacked as they were, holes, clear radii and coatings kept
  const e2 = JSON.parse(JSON.stringify(e)); A.asmApply(asmOf(), P, [e2]);
  assert.equal(e2.surfaces.length, 4);
  assert.deepEqual(e2.gaps, [0, 40, 0]);
  assert.ok(Math.abs(e2.x - e.x) < 1e-9 && Math.abs(e2.y - e.y) < 1e-9, 'the part stays where it was: ' + e2.x);
  assert.deepEqual(e2.surfaces.map(s => [s.R, s.hole, s.semi, s.coat.mode, s.coat.metal]), [[null, 16.5, null, 'bare', undefined], [-600, 0, 16.5, 'mirror', 'ideal'], [-200, 6.5, null, 'mirror', 'Al'], [null, 0, 6.5, 'bare', undefined]]);
  // the spot's row edited (as met, R 600 → 500) and the back's hole widened: the bench's surfaces
  P.surfaces[2].R = 500; P.surfaces[1].obs = 8;
  const e3 = JSON.parse(JSON.stringify(e)); A.asmApply(asmOf(), P, [e3]);
  assert.equal(e3.surfaces[1].R, -500); assert.equal(e3.surfaces[2].hole, 8);
});

test('the light’s path through a stacked face: the member whose annulus holds the height, the centre when both ways go into the glass', () => {
  // a plain lens whose front is split: an annulus (R 51.5, hole 6.35) and a flat centre: the design follows the centre
  const e = lensOf({ diameter: 25.4, surfaces: [{ R: 51.5, hole: 6.35 }, { R: null, semi: 6.35 }, { R: -51.5 }], gaps: [0, 3.6], materials: [{ glass: 'N-BK7' }, { glass: 'N-BK7' }] });
  assert.ok(A.lensPathed(e));
  const P = A.asmPrescription(asmOf(), [e]);
  assert.deepEqual(P.surfaces.map(s => s.from.i), [1, 2]);
  assert.deepEqual(P.surfaces.map(s => s.R), [null, -51.5]);
  assert.deepEqual(P.gaps, [3.6]);
  // the path finder itself: through the annulus at 10 mm, through the centre at 3
  const S2 = e.surfaces.map(s => ({ semi: s.semi || 12.7, hole: s.hole || 0, mirror: s.coat.mode === 'mirror', c: s.R ? 1 / s.R : 0 }));
  const V = A.lensPath(S2, e.gaps, [1.5168, 1.5168], 0);
  assert.ok(V && V.visits.length === 2 && V.visits[0].j === 1, JSON.stringify(V.visits));
  // the centre mirror coated: the light goes in through the annulus and the centre is never met
  const e2 = lensOf({ diameter: 25.4, surfaces: [{ R: 51.5, hole: 6.35 }, { R: null, semi: 6.35, coat: { mode: 'mirror', metal: 'Au' } }, { R: -51.5 }], gaps: [0, 3.6], materials: [{ glass: 'N-BK7' }, { glass: 'N-BK7' }] });
  const P2 = A.asmPrescription(asmOf(), [e2]);
  assert.deepEqual(P2.surfaces.map(s => s.from.i), [0, 2]);
  assert.equal(P2.surfaces[0].obs, 6.35);
  // a part the design need not follow the light through: no path, its rows in order
  const e3 = lensOf({ diameter: 25.4, surfaces: [{ R: 51.5 }, { R: -51.5 }], gaps: [3.6], materials: [{ glass: 'N-BK7' }] });
  assert.ok(!A.lensPathed(e3));
});
