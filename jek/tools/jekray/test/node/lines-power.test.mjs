/* A source of several lines shares its power among them: each Gaussian beam launched on a line carries its
   share (as each ray of a fan does), so a detector, a dichroic's two sides and a screen's field all add up to
   the source's power, and a single line is as it was. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBench, engine } from '../../headless.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' against ' + b);
const src = o => ({ type: 'source', id: 's', name: 's', x: -50, y: 0, angle: 0, wavelength: 633, gauss: true, w0: 1, z0: 50, width: 2, rays: 1, pol: 's', power: 2, ...o });
const det = (id, x, y, angle) => ({ type: 'detector', id, name: id, x, y, angle, length: 10, gain: 1000, material: 'custom', resp: 1 });
const bench = elements => openBench({ format: 'jekray', version: 1, name: 'lines', maxBounces: 40, minPower: 0.001, elements });
const dichroic = { type: 'filter', id: 'F', name: 'F', x: 0, y: 0, angle: 45, length: 25.4, ftype: 'longpass', edge: 600, tmax: 100, reflect: true };

test('a detector reads the source’s power, however many lines it has', async () => {
  for (const lines of [[], [532], [532, 1064]]) {
    const B = await bench([src({ lines }), det('D', 50, 0, 180)]);
    near(B.detector('D').mw, 2, 1e-4, lines.length + 1 + ' lines:');
  }
});

test('a single line reads as before, and a ray fan is unchanged', async () => {
  const one = await bench([src({}), det('D', 50, 0, 180)]);
  assert.equal(one.detector('D').mw, 2);
  for (const lines of [[], [532], [532, 1064]]) {
    const B = await bench([src({ lines, gauss: false, rays: 5 }), det('D', 50, 0, 180)]);
    near(B.detector('D').mw, 2, 1e-3, 'rays, ' + (lines.length + 1) + ' lines:');
  }
});

test('a dichroic splitting two lines keeps the power: transmitted and reflected add to the source’s', async () => {
  for (const gauss of [true, false]) {
    const B = await bench([src({ lines: [532], gauss, rays: gauss ? 1 : 5 }), dichroic, det('T', 100, 0, 180), det('R', 0, -100, 90)]);
    const T = B.detector('T').mw, R = B.detector('R').mw;
    near(T, 1, 1e-3, (gauss ? 'beam' : 'rays') + ': T'); near(R, 1, 1e-3, (gauss ? 'beam' : 'rays') + ': R'); near(T + R, 2, 2e-3, 'T + R');
  }
});

test('a screen’s field holds the source’s power once, its lines’ shares summed', async () => {
  const E = await engine();
  const DF = await import('../../src/engines/diffraction.js'), BT = await import('../../src/engines/beam-tree.js');
  const field = (B, name) => {
    B.trace();
    const el = E.ST.project.elements.find(e => e.name === name), job = DF.popScreenPrep(el);
    return DF.popDiffraction(el, BT.popRun(E.TRACE.lastTrace.beams, job.srcs, { keep: job.keep }));
  };
  const scr = { type: 'screen', id: 'S', name: 'S', x: 60, y: 0, angle: 180, length: 25 };
  const one = field(await bench([src({}), scr]), 'S');
  for (const lines of [[532], [532, 1064]]) {
    const D = field(await bench([src({ lines }), scr]), 'S');
    near(D.power, one.power, 1e-6, lines.length + 1 + ' lines, per unit power:');
    near(D.laser.mW, 2, 1e-12, 'the laser’s power');
  }
  near(one.power, 1, 1e-3, 'one line');
});
