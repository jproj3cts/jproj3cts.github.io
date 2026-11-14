/* A particle inside a degenerate cavity, solved in the pupil (engines/scatter-pupil.js), against an independent reference
   (validation/scripts/scatter_cavity_degen.py: exact rays on the mirrors, the dipole's returns summed ray by ray and
   checked against the closed form for the ideal concentric cavity, the Mie sphere on a grid of directions solved by GMRES;
   ref/scatter-cavity-degen.json). The tolerances were written before the first run (the report's "A particle inside a
   degenerate cavity"): D1 the field at the particle with its returns within 2 % of the reference's change from the empty
   cavity's, D2 the scattered power and extinction within 3 % (D5: 5 % for the cavity near degeneracy). The cases that
   met them are held here; the Mie sphere 2 um off a confocal cavity's axis did not (2.4 % against 2 %), and stays in the
   report. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openBench, engine } from '../../headless.mjs';
await engine();
const SC = await import('../../src/engines/scatter.js');
const { getEl } = await import('../../src/state/elements.js');
const REF = JSON.parse(readFileSync(new URL('../../../validation/ref/scatter-cavity-degen.json', import.meta.url), 'utf8')).cases;
const BENCH = JSON.parse(readFileSync(new URL('../../../validation/ref/scatter-cavity-degen-bench.json', import.meta.url), 'utf8')).cases;
const say = (...a) => { if (process.env.SHOW) console.log('#', ...a); };
const LASER = { id: 'laser', type: 'source', name: 'Laser', x: -40, y: 0, angle: 0, wavelength: 1550, gauss: true, w0: 0.02, z0: 40, rays: 0, traceRays: false, power: 1, pol: 's' };
const mirrors = (kind, d = 0) => { const [R, k] = kind === 'concentric' ? [10, 0] : [20, -1];
  return [{ id: 'm1', type: 'mirror', name: 'M1', x: -10, y: 0, angle: 0, length: 5, reflect: 90, transmit: 10, R, k }, { id: 'm2', type: 'mirror', name: 'M2', x: 10 - d, y: 0, angle: 180, length: 5, reflect: 90, transmit: 10, R, k }]; };
const doc = els => ({ format: 'jekray', version: 1, name: 't', maxBounces: 60, minPower: 1e-6, benches: [{ id: 'b1', name: 'B' }], tab: 'b1', elements: els.map(e => Object.assign({ bench: 'b1' }, e)) });

for (const [name, model, rn] of [['concentric', 'rayleigh', 'dipole'], ['concentric', 'mie', 'mie'], ['concentric', 'dda', 'mie'], ['concentric-along', 'rayleigh', 'dipole'], ['concentric-across', 'rayleigh', 'dipole'],
  ['concentric-2um', 'rayleigh', 'dipole'], ['concentric-10um', 'rayleigh', 'dipole'], ['concentric-50um', 'rayleigh', 'dipole'], ['confocal', 'rayleigh', 'dipole'], ['confocal', 'mie', 'mie'],
  ['confocal-across', 'rayleigh', 'dipole']]) {
  test(name + ', ' + model + ': solved in the pupil, against the reference', async () => {
    const B0 = BENCH[name], R = REF[name][rn];
    (await openBench(doc([LASER, ...mirrors(B0.kind, B0.delta_m * 1e3), { id: 'p', type: 'particle', name: 'P', x: B0.rp_m[2] * 1e3, y: B0.rp_m[1] * 1e3, angle: 90, trapMat: 'Fused silica', trapR: model === 'rayleigh' ? 50 : 150, trapMed: 'vacuum', scatModel: model }]))).trace();
    const S = SC.scatterNow(getEl('p')), C = S.cav;
    assert.ok(C && C.solved && C.method === 'pupil' && !S.flags.includes('cavity'), JSON.stringify(C));
    const tolD1 = /um$/.test(name) ? 0.05 : 0.02;                                                            // D5 for the near ones
    assert.ok(Math.abs((C.E2ratio - 1) - (R.E2_ratio - 1)) <= tolD1 * Math.abs(R.E2_ratio - 1), 'the field with the returns: ' + C.E2ratio + ' against ' + R.E2_ratio);   // D1, D4
    assert.ok(Math.abs(S.Psca / R.Psca_W - 1) <= 0.03 && Math.abs(S.Pext / R.Pext_W - 1) <= 0.03, 'scattered power ' + S.Psca + ' against ' + R.Psca_W);                      // D2
    say(name, model, 'change', ((C.E2ratio - 1) / (R.E2_ratio - 1) - 1).toExponential(2), 'Psca', (S.Psca / R.Psca_W - 1).toExponential(2), 'GMRES', C.iters, 'series terms', C.terms, 'grid', C.nodes, 'pupil', C.ms, 'ms');
  });
}

test('two flat mirrors bring no image back: the warning stays', async () => {
  (await openBench(doc([LASER, { id: 'm1', type: 'mirror', name: 'M1', x: -10, y: 0, angle: 0, length: 5, reflect: 90, transmit: 10 }, { id: 'm2', type: 'mirror', name: 'M2', x: 10, y: 0, angle: 180, length: 5, reflect: 90, transmit: 10 },
    { id: 'p', type: 'particle', name: 'P', x: 0, y: 0, angle: 90, trapMat: 'Fused silica', trapR: 150, trapMed: 'vacuum' }]))).trace();
  const S = SC.scatterNow(getEl('p'));
  assert.ok(S.flags.includes('cavity') && !S.cav.solved, JSON.stringify(S.cav));
});
