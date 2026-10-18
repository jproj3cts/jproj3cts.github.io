/* The RF designer's gain against the bench's closed form for a lens antenna (core/antenna.js): the Gaussian beam
   the designer follows to the last lens (its radius and phase radius there, the lens's aperture) given to the
   closed form, the two agree on the aperture efficiency (taper, spillover and phase together) and, once the
   designer's own losses (the horn's Gaussian share, reflections, absorption, the faces' phase error) are put back,
   on the gain: for a made-to-order hyperbolic lens, and for the worked example. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const ST = await import('../../src/state/project.js');
const D = await import('../../src/engines/lens-design.js');
const RF = await import('../../src/engines/rf-design.js');
const { lensAntenna } = await import('../../src/core/antenna.js');

/* the designer's figures at ghz against the closed form on the same aperture field */
function compare(asm, P, ghz) {
  const r = RF.rfTrace(asm, P, ghz), lam = r.lam, { a, w, R } = r.apAt;
  const A = lensAntenna({ w, R, a, lam, gainOnly: true });
  // the closed form's aperture efficiency is of the power reaching the lens; the designer's counts the spillover past it too
  const apClosed = A.eta.ap * A.eta.spill;
  // the designer's gain less what the closed form does not count: the horn's Gaussian share, the faces' reflections,
  // the plastic's absorption and the phase error (the closed form has the beam exactly Gaussian, the lens perfect)
  const own = 10 * Math.log10(r.g * r.refl * r.absorb * r.phaseEff);
  return { apRf: r.apEff, apClosed, gainRf: r.gain, gainClosed: A.Gdbi + own };
}

test('a made-to-order hyperbolic lens: the designer’s aperture efficiency and gain are the closed form’s', () => {
  loadProject({ format: 'jekray', version: 1, elements: [{ type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, diameter: 120, asphere: true,
    surfaces: [{ R: 104, k: -2.7 }, { R: null }], gaps: [30], materials: [{ glass: 'PLA' }], mmw: { part: true }, group: 'g' }],
    assemblies: [{ id: 'g', name: 'RF', ref: 'L', kind: 'rf', rf: { ghz: 24, feed: { kind: 'corrugated', a: 15, L: 80, d: 150 }, goal: { kind: 'collimate', d: 300 } } }] });
  const asm = ST.project.assemblies[0], P = D.designPrescription(asm);
  RF.rfSyncCond(asm, P);
  const c = compare(asm, P, 24);
  assert.ok(Math.abs(c.apRf - c.apClosed) < 2e-3, `aperture efficiency ${c.apRf} against ${c.apClosed}`);
  assert.ok(Math.abs(c.gainRf - c.gainClosed) < 0.02, `gain ${c.gainRf} dBi against ${c.gainClosed}`);
});

test('the 24 GHz lens antenna example: the same, at its design frequency and the band’s edges', () => {
  const d = JSON.parse(fs.readFileSync(new URL('../../../demos/rf-24ghz-lens-antenna.jekray', import.meta.url), 'utf8'));
  loadProject(d);
  const asm = ST.project.assemblies.find(x => x.kind === 'rf'), P = D.designPrescription(asm);
  RF.rfSyncCond(asm, P);
  for (const ghz of [asm.rf.lo, asm.rf.ghz, asm.rf.hi]) {
    const c = compare(asm, P, ghz);
    assert.ok(Math.abs(c.apRf - c.apClosed) < 2e-3, `${ghz} GHz: aperture efficiency ${c.apRf} against ${c.apClosed}`);
    assert.ok(Math.abs(c.gainRf - c.gainClosed) < 0.02, `${ghz} GHz: gain ${c.gainRf} dBi against ${c.gainClosed}`);
  }
});
