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
const LD = await import('../../src/engines/lens-design.js');

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
  // (at the spot's rim, where the flat's hole meets it, the spot: the piece set into the face holds its own edge)
  assert.equal(F.at(20), ss[0]); assert.equal(F.at(10), ss[1]); assert.equal(F.at(16.5), ss[1]);
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
  P.surfaces[2].R = 500; LD.setV(P, { q: 'h', i: 1 }, 8);
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

test('the image simulation of a solid telescope: its chief ray blocked by the secondary, it still forms the picture, on the axis and off it', async () => {
  const LA = await import('../../src/engines/lens-analysis.js'), IS = await import('../../src/engines/lens-imsim.js');
  const e = telescope();
  const run = (fields, o) => {
    const c = { aperture: { kind: 'epd', v: 44 }, fields, waves: [{ nm: 587.56, w: 1 }], primary: 0 };
    const P = A.asmPrescription({ id: 'asm', name: 'A', bench: 'b', ref: 'L', rev: false, cond: c }, [e]);
    P.image = E.lensSystem(P, 587.56).par.back;
    const An = LA.anaSystems({ cond: c }, P), W = 24, H = 18, ch = [0, 1, 2].map(() => Float32Array.from({ length: W * H }, () => 1));
    // the reference ray through the pupil's centre is blocked, and is traced past the secondary instead
    assert.equal(E.rayAt(An.Sp, 0, 0, 0)[7] !== 0, true);
    assert.equal(E.chiefRay(An.Sp, 0)[7], 0);
    const plan = IS.imsimPlan(An, { w: W, h: H, ch }, o); while (!plan.next()); const out = plan.result();
    let t = 0; for (const v of out.ch[1]) t += v;
    return t / (W * H);
  };
  // the whole field to 0.5°, and only the axis (a patch about it): a white picture comes out lit, not black
  assert.ok(run([{ deg: 0, w: 1 }, { deg: 0.5, w: 1 }]) > 0.3);
  assert.ok(run([{ deg: 0, w: 1 }], { mode: 'patch', at: [0, 0], pitch: 0.05 }) > 0.3);
});

test('the diffracted field through a solid telescope: each ring of a face takes its share, and the light comes to a focus behind it', async () => {
  // the user's design: a 5 mm Gaussian on a spot mirror stacked in a refracting ring (front), a primary round a window (back)
  const { openBench, engine } = await import('../../headless.mjs');
  const B = await openBench({ format: 'jekray', version: 1, minPower: 0.1, light: { rays: false, envelope: true, field: true, scale: 'lin' }, elements: [
    { type: 'lens', id: 'T', name: 'T', x: 136.5, y: -16, angle: 0, diameter: 12.7, asphere: true,
      surfaces: [{ R: -67.89, k: -0.9, semi: 3, coat: { mode: 'mirror', metal: 'ideal' } }, { R: -154.38, hole: 2 }, { R: -53.93, hole: 2, coat: { mode: 'mirror', metal: 'Al' } }, { R: null }],
      gaps: [0, 15, 0], materials: [{ glass: 'S-LAH64' }, { glass: 'S-LAH64' }, { glass: 'S-LAH64' }] },
    { type: 'source', id: 'S', name: 'S', x: 77, y: -16, angle: 0, wavelength: 633, gauss: true, w0: 5, z0: 0, popN: 256, traceRays: false, rays: 30, width: 10 }] });
  B.trace();
  const Eg = await engine(), BT = await import('../../src/engines/beam-tree.js'), F = await import('../../src/engines/field.js');
  const R = BT.popRun(Eg.TRACE.lastTrace.beams, Eg.ST.project.elements.filter(e => e.type === 'source'), {});
  const P = sg => F.popStats(sg.leg.at(Math.min(1, sg.b.len))).power;
  const ev = sg => sg.b.ev || {};
  // the spot sends back what lands inside its 3 mm, 1 - exp(-2 a^2 / w^2), the light that went round the rim what lands outside 6.35
  const back = R.segs.find(sg => sg.b.dx < 0 && ev(sg).mode === 'R' && ev(sg).semi === 3 && sg.b.x0 < 130);
  assert.ok(back && Math.abs(P(back) - (1 - Math.exp(-2 * 9 / 25))) < 0.005, back && P(back));
  const rim = R.segs.find(sg => ev(sg).kind === 'split');
  assert.ok(rim && Math.abs(P(rim) - Math.exp(-2 * 6.35 ** 2 / 25)) < 0.005, rim && P(rim));
  // the ring between goes in, off the primary and the spot, and out through the window: all of it (bar a little at the spot's edge)
  const out = R.segs.filter(sg => sg.b.dx > 0 && sg.b.x0 > 140 && ev(sg).mode === 'T').sort((a, b) => P(b) - P(a))[0];
  const ring = Math.exp(-2 * 9 / 25) - Math.exp(-2 * 6.35 ** 2 / 25);
  assert.ok(out && P(out) > 0.97 * ring && P(out) < ring + 1e-3, out && [P(out), ring]);
  // and it comes to a focus a few millimetres past the window
  const wAt = t => F.popStats(out.leg.at(t)).w;
  assert.ok(wAt(5) < 0.25 * wAt(0.01) && wAt(5) < 0.25 * wAt(20), [wAt(0.01), wAt(5), wAt(20)].join(' '));
});

test('a stacked surface reaches only as far as it is the surface met: a window in a primary\'s hole, a ring round a spot', () => {
  // the window (no clear radius of its own, so the lens's 25) is met only inside the primary's 6.5 hole; the front ring
  // (hole 2) only outside the 16.5 spot stacked on it; the part keeps its own figures when the design is written back
  const e = lensOf({ diameter: 50, surfaces: [{ R: -600, semi: 16.5, coat: MIRROR }, { R: null, hole: 2 }, { R: -200, hole: 6.5, coat: { mode: 'mirror', metal: 'Al' } }, { R: null }],
    gaps: [0, 40, 0], materials: [{ glass: 'N-BK7' }, { glass: 'N-BK7' }, { glass: 'N-BK7' }] });
  const P = A.asmPrescription(asmOf(), [e]);
  const win = P.surfaces.find(s => s.from.i === 3), ring = P.surfaces.find(s => s.from.i === 1);
  assert.ok(win && Math.abs(win.semi - 6.5) < 1e-9, win && win.semi);
  assert.ok(ring && Math.abs(ring.obs - 16.5) < 1e-9 && Math.abs(ring.semi - 25) < 1e-9, ring && [ring.obs, ring.semi]);
  assert.deepEqual(A.stackRing([{ semi: 25, hole: 6.5 }, { semi: 25, hole: 0 }], [0, 1], 1), [0, 6.5]);
  const e2 = JSON.parse(JSON.stringify(e)); A.asmApply(asmOf(), P, [e2]);
  assert.ok(!e2.surfaces[3].semi && e2.surfaces[1].hole === 2, JSON.stringify(e2.surfaces.map(s => [s.semi, s.hole])));
});

test('a spot stacked on a face reaches its own rim whatever the hole under it; a window in a primary\'s hole reaches only the hole', () => {
  // the front flat's hole (10) is smaller than the spot (16.5), its ring narrower than the spot: the spot is the surface out to 16.5 all the same, on the
  // bench (its stacks and the tracer), in the Optical designer and in the field's rings; the window behind, with no radius of
  // its own, gives way to the primary round its hole
  const e = lensOf({ diameter: 50, surfaces: [{ R: null, hole: 10 }, { R: -600, semi: 16.5, coat: MIRROR }, { R: -200, hole: 6.5, coat: { mode: 'mirror', metal: 'Al' } }, { R: null }],
    gaps: [0, 40, 0], materials: [{ glass: 'N-BK7' }, { glass: 'N-BK7' }, { glass: 'N-BK7' }] });
  const ss = Gm.lensSurfaces(e), st = Gm.lensStacks(ss);
  assert.equal(st[0].at(12), ss[1]); assert.equal(st[0].at(16), ss[1]); assert.equal(st[0].at(17), ss[0]);
  assert.equal(st[1].at(5), ss[3]); assert.equal(st[1].at(10), ss[2]);
  assert.deepEqual(A.stackRing([{ semi: 25, hole: 10 }, { semi: 16.5, hole: 0 }], [0, 1], 0), [16.5, 25]);
  const P = A.asmPrescription(asmOf(), [e]), ring = P.surfaces.find(s => s.from.i === 0);
  assert.ok(ring && Math.abs(ring.obs - 16.5) < 1e-9, ring && ring.obs);
});

test('a clear radius and a hole as variables, and the light reaching the image as a merit term', async () => {
  const O = await import('../../src/engines/lens-opt.js');
  // a singlet whose front is cut to a clear radius of 7 on a 20 mm pupil: (7/10)^2 of the pupil gets through
  const e = lensOf({ diameter: 40, surfaces: [{ R: 100, semi: 7 }, { R: -100 }], gaps: [4], materials: [{ glass: 'N-BK7' }] });
  const P = A.asmPrescription(asmOf(), [e]), thru = () => O.throughput(E.lensSystem(P, 587.56, { epd: 20 }), 0);
  assert.ok(Math.abs(thru() - 0.49) < 2e-3, thru());
  assert.equal(LD.getV(P, { q: 'c', i: 0 }), 7);
  LD.setV(P, { q: 'c', i: 0 }, 8); assert.ok(Math.abs(thru() - 0.64) < 2e-3, thru());
  // a hole of 3 in it: 0.64 - 0.09 of the pupil; smooth in the hole (a small change, a small change in the light)
  LD.setV(P, { q: 'h', i: 0 }, 3); assert.ok(Math.abs(thru() - 0.55) < 3e-3, thru());
  const t0 = thru(); LD.setV(P, { q: 'h', i: 0 }, 3.01); const t1 = thru();
  assert.ok(t1 < t0 && t0 - t1 < 1e-3, [t0, t1]);
  // a stacked spot made larger takes the ring round it out with it (stackRings), and the part keeps its own figures
  const tel = lensOf({ diameter: 50, surfaces: [{ R: null, hole: 2 }, { R: -600, semi: 16.5, coat: MIRROR }, { R: -200, hole: 6.5, coat: { mode: 'mirror', metal: 'Al' } }, { R: null }],
    gaps: [0, 40, 0], materials: [{ glass: 'N-BK7' }, { glass: 'N-BK7' }, { glass: 'N-BK7' }] });
  const Q = A.asmPrescription(asmOf(), [tel]), spot = Q.surfaces.findIndex(s => s.from.i === 1), ring = Q.surfaces.find(s => s.from.i === 0);
  assert.ok(Math.abs(ring.obs - 16.5) < 1e-9);
  LD.setV(Q, { q: 'c', i: spot }, 18);
  assert.ok(Math.abs(ring.obs - 18) < 1e-9 && ring.own.hole === 2, [ring.obs, ring.own.hole]);
  const t2 = JSON.parse(JSON.stringify(tel)); A.asmApply(asmOf(), Q, [t2]);
  assert.ok(t2.surfaces[1].semi === 18 && t2.surfaces[0].hole === 2, JSON.stringify(t2.surfaces.map(s => [s.semi, s.hole])));
  // the keys are design keys the optimiser takes
  assert.ok(A.DESIGN_KEY.test('c:L.1') && A.DESIGN_KEY.test('h:L.2') && A.MERIT_OPS.includes('THRU'));
});

// stacked surfaces over the same ring are layers: met one after the other, the way the light goes (core/sag.js sameRing)
async function layerTrace(surfaces, gaps, materials, from, extra = {}) {
  const { openBench, engine } = await import('../../headless.mjs');
  const B = await openBench({ format: 'jekray', version: 1, minPower: 0.01, ghosts: true, ...extra, elements: [
    { type: 'lens', id: 'L', name: 'L', x: 100, y: 0, angle: 0, diameter: 20, surfaces, gaps, materials },
    { type: 'source', id: 'S', name: 'S', x: from > 0 ? 150 : 50, y: 0, angle: from > 0 ? 180 : 0, wavelength: 633, rays: 1, width: 0, power: 1, ...(extra.src || {}) }] });
  B.trace();
  const T = (await engine()).TRACE.lastTrace, rays = T.rays.filter(r => !r.pol || r.pol === 's' || true);
  const end = r => r.pts[r.pts.length - 2];
  // power leaving each way, of one polarisation's rays (each ray is traced for s and p)
  const half = rays.slice(0, rays.length / 2);
  return { left: half.filter(r => end(r) < 60).reduce((a, r) => a + r.w, 0) * 2, right: half.filter(r => end(r) > 140).reduce((a, r) => a + r.w, 0) * 2, T };
}
const LAH = { glass: 'S-LAH64' }, rLAH = ((1.7849 - 1) / (2.7849)) ** 2;

test('layers on a face: a coating on the second layer works; an index-matched bare layer is as no layer at all', async () => {
  const half = await layerTrace([{ R: null, coat: { mode: 'ar', R: 0 } }, { R: null, coat: { mode: 'custom', R: 50 } }, { R: null, coat: { mode: 'ar', R: 0 } }], [0, 10], [LAH, LAH], -1);
  assert.ok(Math.abs(half.left - 0.5) < 1e-3 && Math.abs(half.right - 0.5) < 1e-3, JSON.stringify([half.left, half.right]));
  const matched = await layerTrace([{ R: null }, { R: null }, { R: null }], [0, 10], [LAH, LAH], -1), none = await layerTrace([{ R: null }, { R: null }], [10], [LAH], -1);
  assert.ok(Math.abs(matched.left - none.left) < 1e-9 && Math.abs(matched.right - none.right) < 1e-9, JSON.stringify([matched.left, none.left]));
});

test('a mirror with a bare layer over it: from the front the layer is never met; from behind it reflects its Fresnel share first', async () => {
  const S = [{ R: null, coat: { mode: 'ar', R: 0 } }, { R: null, coat: { mode: 'mirror', metal: 'ideal' } }, { R: null }];
  const front = await layerTrace(S, [10, 0], [LAH, LAH], -1);
  assert.ok(Math.abs(front.left - 1) < 1e-3 && front.right < 1e-9, JSON.stringify([front.left, front.right]));
  const back = await layerTrace(S, [10, 0], [LAH, LAH], 1);
  // all of it comes back (an ideal mirror), the bare face's first reflection among it, the rest after the mirror
  assert.ok(Math.abs(back.right - 1) < 2e-3 && back.left < 1e-9, JSON.stringify([back.left, back.right]));
  const first = back.T.rays.find(r => r.pts.length === 4 && r.pts[0] === 105 && r.pts[2] > 140);
  assert.ok(first, 'the bare face reflects straight back');
  const R0 = back.T.rays.filter(r => r.pts[0] === 105 && r.pts.length === 4 && r.pts[2] > 140).map(r => r.w).sort((a, b) => a - b);
  assert.ok(R0.some(w => Math.abs(w - rLAH / 2) < 0.004), JSON.stringify(R0) + ' ' + rLAH);
});

test('the designer meets layers in turn: an index-matched layer on the light\'s path, a bare face behind a mirror not', () => {
  const pathOf = e => A.lensPath(e.surfaces.map(s => ({ semi: s.semi || e.diameter / 2, hole: s.hole || 0, mirror: !!(s.coat && s.coat.mode === 'mirror'), c: s.R ? 1 / s.R : 0 })), e.gaps, e.materials.map(() => 1.7849), 0).visits.map(v => v.j + v.role[0] + (v.dir > 0 ? '' : '-')).join(' ');
  const t3 = lensOf({ diameter: 300, surfaces: [{ R: null }, { R: null }, { R: null }], gaps: [0, 300], materials: [LAH, LAH] });
  assert.equal(pathOf(t3), '0r 1r 2r');
  const t2 = lensOf({ diameter: 300, surfaces: [{ R: null, coat: { mode: 'ar' } }, { R: null, coat: MIRROR }, { R: null }], gaps: [150, 0], materials: [LAH, LAH] });
  assert.equal(pathOf(t2), '0r 1m 0r-');
  // a mirror between two layers, met from the glass between them: the light turns back through the first
  const sand = lensOf({ diameter: 30, surfaces: [{ R: null }, { R: null }, { R: null, coat: MIRROR }, { R: null }], gaps: [5, 0, 0], materials: [LAH, LAH, LAH] });
  assert.equal(pathOf(sand), '0r 1r 2m 1r- 0r-');
  // a window in a primary's hole is still a ring of its own, not a layer
  const P = A.asmPrescription(asmOf(), [telescope()]);
  assert.deepEqual(P.surfaces.map(s => s.from.i), [0, 2, 1, 3]);
});

test('the diffracted field through layers: on past a part-reflecting layer as past no layer, and back off it, with no cavity between layers', async () => {
  const { openBench, engine } = await import('../../headless.mjs');
  const BT = await import('../../src/engines/beam-tree.js'), F = await import('../../src/engines/field.js'), CV = await import('../../src/engines/cavity.js');
  const run = async (surfaces, gaps) => {
    const B = await openBench({ format: 'jekray', version: 1, minPower: 0.1, light: { rays: false, envelope: true, field: true, scale: 'lin' }, elements: [
      { type: 'lens', id: 'L', name: 'L', x: 100, y: 0, angle: 0, diameter: 25, surfaces, gaps, materials: gaps.map(() => ({ glass: 'N-BK7' })) },
      { type: 'source', id: 'S', name: 'S', x: 50, y: 0, angle: 0, wavelength: 633, gauss: true, w0: 2, z0: 0, popN: 128, traceRays: false, rays: 1, width: 4 }] });
    B.trace();
    const Eg = await engine(), beams = Eg.TRACE.lastTrace.beams;
    const R = BT.popRun(beams, Eg.ST.project.elements.filter(e => e.type === 'source'), {});
    const out = R.segs.find(sg => sg.b.x0 > 101 && sg.b.dx > 0), back = R.segs.find(sg => sg.b.dx < 0 && sg.b.len > 10);
    return { loops: CV.cavLoops(beams).length, out: out && F.popStats(out.leg.at(100)).w, back: !!back };
  };
  const AR = { mode: 'ar', R: 0 };
  const layer = await run([{ R: null, coat: AR }, { R: null, coat: { mode: 'custom', R: 50 } }, { R: 60, coat: AR }], [0, 5]);
  const none = await run([{ R: null, coat: AR }, { R: 60, coat: AR }], [5]);
  assert.equal(layer.loops, 0);
  assert.ok(layer.back && !none.back, 'the layer sends light back');
  assert.ok(layer.out && Math.abs(layer.out - none.out) < 1e-6, [layer.out, none.out].join(' '));
});

test('a lens the light is followed through takes a new surface after any row, and gives one up, on the part itself', async () => {
  const { openBench, engine } = await import('../../headless.mjs');
  const bench = (surfaces, gaps, design) => ({ format: 'jekray', version: 1, elements: [{ type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, diameter: 40, group: 'g', surfaces, gaps, materials: gaps.map(() => ({ glass: 'S-LAH64' })) }],
    assemblies: [{ id: 'g', name: 'A', bench: 'b1', ref: 'L', rev: false, cond, ...(design ? { design } : {}) }] });
  const open = async b => { await openBench(b); const Eg = await engine(); const asm = Eg.ST.project.assemblies[0]; return { Eg, asm, e: Eg.ST.project.elements[0], P: LD.designPrescription(asm) }; };
  const flat3 = () => bench([{ R: null }, { R: null }, { R: 80 }], [0, 30]);
  // after the stacked front: a third layer; inside the glass: the glass split; after the back: 2 mm more, the faces staying put
  let o = await open(flat3());
  assert.equal(LD.insertSurface(o.asm, o.P, 0, 'flat'), true);
  assert.deepEqual([o.e.surfaces.length, o.e.gaps], [4, [0, 0, 30]]);
  o = await open(flat3());
  assert.equal(LD.insertSurface(o.asm, o.P, 1, 'flat'), true);
  assert.deepEqual(o.e.gaps, [0, 15, 15]);
  assert.equal(LD.designPrescription(o.asm).surfaces.length, 4, 'the new surface is on the light\'s path');
  o = await open(flat3());
  assert.equal(LD.insertSurface(o.asm, o.P, 2, 'flat'), true);
  assert.deepEqual([o.e.gaps, o.e.x], [[0, 30, 2], 1]);
  // a variable on the back's radius follows it when a surface goes in before it, and goes when it does
  o = await open(bench([{ R: null }, { R: null }, { R: 80 }], [0, 30], { vars: ['R:L.2'] }));
  assert.equal(LD.insertSurface(o.asm, o.P, 1, 'flat'), true);
  assert.deepEqual(o.asm.design.vars, ['R:L.3']);
  assert.equal(o.e.surfaces[3].R, 80);
  o = await open(bench([{ R: null }, { R: null }, { R: 80 }], [0, 30], { vars: ['R:L.2'] }));
  assert.equal(LD.removeSurface(o.asm, o.P, 2), true);
  assert.deepEqual([o.e.surfaces.length, o.e.gaps, o.asm.design.vars], [2, [0], []]);
  // off a mirror, "after" is the way the light goes on: back into the glass, between the front and the mirror
  o = await open(bench([{ R: null }, { R: null, coat: MIRROR }, { R: null }], [40, 0]));
  assert.equal(LD.insertSurface(o.asm, o.P, 1, 'flat'), true);
  assert.deepEqual(o.e.gaps, [20, 20, 0]);
  assert.equal(LD.designPrescription(o.asm).surfaces.map(s => s.from.i).join(','), '0,1,2,1,0');
});
