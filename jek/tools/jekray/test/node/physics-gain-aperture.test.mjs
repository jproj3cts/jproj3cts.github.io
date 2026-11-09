/* A gain sheet is a finite aperture like any part: of a wide beam, the light that lands inside its disc is amplified,
   the light that misses goes on unchanged, and both reach what is downstream. Above or below the sheet's centre as much
   as to its side, and on a sheet tipped out of the plane. A detector after it reads g × the share inside + the share
   outside, by the tracer's beams and by the diffracted field alike. The last case is a user's bench: a wide beam
   past a row of four small sheets at different heights, one tipped, whose light past their rims had gone missing. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBench, engine } from '../../headless.mjs';
const E = await engine();
const { popRun, segW } = await import('../../src/engines/beam-tree.js');
const { popStats } = await import('../../src/engines/field.js');
const { popStats2 } = await import('../../src/engines/field2d.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ': ' + a + ' vs ' + b);
const bench = elements => ({ format: 'jekray', version: 1, name: 'gain aperture', view: { cx: 0, cy: 0, scale: 4 }, snap: 0, maxBounces: 200, minPower: 2, ghosts: false,
  light: { rays: false, envelope: false, field: true, scale: 'lin', byPower: false }, elements });
// a Gaussian beam of 1/e² radius 2 mm (1 mW, unpolarised) along +x at the height 76, and a detector far wider than it
const SRC = nm => ({ id: 'src', type: 'source', name: 'Source', x: -33, y: -36, z: 76, angle: 0, wavelength: nm, width: 4, w0: 2, gauss: true, divergence: 0, pattern: 'hex', rays: 11, power: 1, pol: 'unpolarised', popN: 256 });
const DET = { id: 'det', type: 'detector', name: 'Det', x: 40, y: -36, z: 76, angle: 180, length: 40 };
const sheet = (name, o) => Object.assign({ id: name, type: 'gain', name, angle: 0, length: 6, g0: 2, isat: 1e9, centre: 1064, fwhm: 30 }, o);
// the share of the beam (w = 2) inside a disc of radius 3 whose centre is d from the beam's; and inside an ellipse (a, b)
function share(d, a = 3, b = a) {
  let tot = 0, inn = 0;
  for (let i = -300; i < 300; i++) for (let j = -300; j < 300; j++) {
    const x = (i + 0.5) * 0.03, y = (j + 0.5) * 0.03, g = Math.exp(-2 * (x * x + y * y) / 4);
    tot += g; if (((x - d) / a) ** 2 + (y / b) ** 2 <= 1) inn += g;
  }
  return inn / tot;
}
// what reaches the detector: by the tracer's beams (its reading) and by the diffracted field ending on it
async function reach(elements) {
  const B = await openBench(bench(elements));
  const t = B.trace(), T = E.TRACE.lastTrace;
  const srcs = E.ST.project.elements.filter(e => e.type === 'source');
  const R = popRun(T.beams, srcs, {});
  let field = 0;
  for (const sg of R.segs) if (sg.b.endEl === 'det') { const F = sg.leg.at(sg.b.len); field += (sg.eng === '2d' ? popStats2(F).power : popStats(F).power * segW(sg)) * sg.b.lmw; }
  return { det: B.detector('Det').mw, field, beams: t.beams, bypass: T.beams.filter(b => b.ev && b.ev.bypass).map(b => E.ST.project.elements.find(e => e.id === b.ev.el).name) };
}

test('a gain sheet off to the side, above, or tipped: the light inside amplified, the light past its rim carried on', async () => {
  const s3 = share(3), s0 = share(0);
  near(s3, 0.4323, 2e-3, 'the share inside a disc of radius 3 whose rim is at the beam centre');
  for (const [what, at] of [['to the side', { x: -10, y: -39, z: 76 }], ['above', { x: -10, y: -36, z: 79 }], ['below', { x: -10, y: -36, z: 73 }]]) {
    const r = await reach([SRC(1064), sheet('G', at), DET]);
    assert.ok(r.bypass.includes('G'), what + ': the light past the rim is a branch of its own');
    near(r.det, 2 * s3 + (1 - s3), 0.01, what + ': the detector reads g × inside + outside');
    near(r.field, 2 * s3 + (1 - s3), 0.01, what + ': and so does the field');
    // with no gain the sheet is nothing: all of the light arrives
    const r1 = await reach([SRC(1064), sheet('G', Object.assign({ g0: 1 }, at)), DET]);
    near(r1.det, 1, 1e-3, what + ', no gain: the detector reads all of it');
    near(r1.field, 1, 5e-3, what + ', no gain: so does the field');
  }
  // a sheet 4 mm up: its rim 1 mm under the beam's centre, its centre beyond the reference ray's reach; still split
  const r4 = await reach([SRC(1064), sheet('G', { x: -10, y: -36, z: 80 }), DET]);
  assert.ok(r4.bypass.includes('G'), 'a sheet the beam’s centre passes under still takes its share');
  near(r4.det, 1 + share(4), 0.01, 'and amplifies just that');
  near(r4.field, 1 + share(4), 0.01, 'by the field too');
  // tipped 50° out of the bench’s plane: seen along the beam, an ellipse cos 50° as tall
  const rt = await reach([SRC(1064), sheet('G', { x: -10, y: -36, z: 76, tip: 50 }), DET]);
  const st = share(0, 3, 3 * Math.cos(50 * Math.PI / 180));
  assert.ok(st < s0 - 0.03, 'the tipped sheet catches less of the beam');
  near(rt.det, 1 + st, 0.01, 'tipped: the detector reads the share inside the ellipse amplified');
  near(rt.field, 1 + st, 0.01, 'tipped: so does the field');
});

test('a user’s bench: a wide beam past four small sheets at different heights, one tipped; none of the light lost', async () => {
  const row = g0 => [
    sheet('Gain medium 1', { x: -14.122147477075266, y: -37, tip: 7, g0 }),         // (its height the bench's, 75)
    sheet('Gain medium 2', { x: -9.1221, y: -37, z: 76, g0 }),
    sheet('Gain medium 3', { x: -4.1221, y: -37, z: 78, g0 }),
    sheet('Gain medium 4', { x: 0.8779, y: -37, z: 79, g0 })];
  // at no gain every sheet is nothing: what misses each goes round it, and all of it reaches the detector
  const r = await reach([SRC(633), ...row(1.2), DET]);
  for (const n of ['Gain medium 1', 'Gain medium 3', 'Gain medium 4']) assert.ok(r.bypass.includes(n), n + ': the light past its rim goes on');
  near(r.det, 1, 0.01, 'the detector, by the beams');
  near(r.field, 1, 0.04, 'the detector, by the field');
  // with gain: the field and the beams agree, and the light that missed every sheet is still there
  const g = await reach([SRC(1064), ...row(2), DET]);
  near(g.field / g.det, 1, 0.03, 'the field and the beams agree');
  assert.ok(g.det > 2 && g.det < 16, 'more than one sheet amplifies the beam, less than all four all of it: ' + g.det);
});
