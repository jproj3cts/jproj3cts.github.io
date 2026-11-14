/* A particle inside a two-mirror cavity, solved in the cavity's modes (engines/scatter-cavity.js), against an independent
   Fabry-Perot written in Python (validation/scripts/scatter_cavity.py: the cavity's Hermite-Gauss modes, the sphere's
   coupling by reciprocity, the closed system of forward and backward waves; ref/scatter-cavity.json). The bench: two
   concave mirrors R = 25 mm, 10 mm apart, 90 % each, a 1550 nm laser with its 80 um waist in the middle; a silica sphere
   at an antinode, a node, a quarter of the way between and off the axis by 0.3 of the mode's radius, 50 nm in radius as
   the single dipole and 150 nm by Mie and as a dipole array. The tolerances were written down before the first run (the
   report's "A particle inside a non-degenerate cavity") and are the numbers below: V2, V3 the resonance's shift and
   widening within 5 % of the antinode's; V4 the detectors over a detuning scan within 2 % of the peak transmitted power;
   V5 the scattered power within 3 % of the antinode's; V6 the modes kept, reported; V7 the degeneracy test.
   The degeneracy test as it was fixed (the round-trip Gouy phase within three linewidths of 2 pi p / q, q up to 6) flags
   this very cavity: its Gouy phase, 1.855 rad, is 0.240 rad from 2 pi / 3, under three linewidths' 0.633. The solve is
   run on it here with the test switched off (setCavDegenCheck), to compare it with the reference; on the bench it keeps
   the warning, as the test says. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openBench, engine } from '../../headless.mjs';
await engine();
const SC = await import('../../src/engines/scatter.js');
const SCV = await import('../../src/engines/scatter-cavity.js');
const CV = await import('../../src/engines/cavity.js');
const FF = await import('../../src/engines/fibre-face.js');
const TR = await import('../../src/engines/trace.js');
const { getEl } = await import('../../src/state/elements.js');

const REF = JSON.parse(readFileSync(new URL('../../../validation/ref/scatter-cavity.json', import.meta.url), 'utf8'));
const say = (...a) => { if (process.env.SHOW) console.log('#', ...a); };
const LAM = 1550e-6, K = 2 * Math.PI / LAM, W0 = REF.w0_um * 1e-3;
const doc = (els, lock) => ({ format: 'jekray', version: 1, name: 't', maxBounces: 60, minPower: 1e-6, benches: [{ id: 'b1', name: 'B' }], tab: 'b1', cavityLock: lock || {},
  elements: els.map(e => Object.assign({ bench: 'b1', angle: 0 }, e)) });
const laser = (nm = 1550) => ({ id: 'laser', type: 'source', name: 'Laser', x: -30, y: 0, wavelength: nm, gauss: true, w0: 0.08, z0: 30, rays: 0, traceRays: false, power: 1, pol: 's' });
const cavity = (R = 25, refl = 90) => [{ id: 'm1', type: 'mirror', name: 'M1', x: -5, y: 0, angle: 0, length: 5, reflect: refl, transmit: 100 - refl, ...(R ? { R } : {}) },
  { id: 'm2', type: 'mirror', name: 'M2', x: 5, y: 0, angle: 180, length: 5, reflect: refl, transmit: 100 - refl, ...(R ? { R } : {}) }];
// a 50/50 plate before the cavity sends the light it reflects to a detector; one behind it takes what it passes
const dets = [{ id: 'pl', type: 'mirror', name: 'Plate', x: -15, y: 0, angle: 135, length: 8, reflect: 50, transmit: 50 },
  { id: 'dT', type: 'detector', name: 'Through', x: 20, y: 0, angle: 180, length: 8 }, { id: 'dR', type: 'detector', name: 'Back', x: -15, y: -15, angle: 90, length: 8 }];
const particle = (x, y, model, o = {}) => Object.assign({ id: 'p', type: 'particle', name: 'P', x, y, angle: 90, trapMat: 'Fused silica', trapR: model === 'rayleigh' ? 50 : 150, trapMed: 'vacuum', scatModel: model }, o);
const open = async (els, lock) => { const B = await openBench(doc(els, lock)); B.trace(); return B; };
const solve = () => { const t0 = Date.now(), S = SC.scatterNow(getEl('p')); TR.traceScene(); return Object.assign(S, { wall: Date.now() - t0 }); };
const reading = id => FF.detectorReading(getEl(id)).mw;

test('the degeneracy test: a confocal and a flat cavity keep the warning; a finer cavity of the same mirrors is solved', async () => {
  // confocal (R = L): the round-trip Gouy phase is pi, 2 pi x 1/2                                                         V7
  await open([laser(), ...cavity(10), particle(0, 0, 'mie')]);
  let S = SC.scatterNow(getEl('p'));
  assert.ok(S.cav && !S.cav.solved && S.cav.why === 'degenerate' && S.flags.includes('cavity'), 'confocal: ' + JSON.stringify(S.cav));
  // two flat mirrors: no Gouy phase at all (marginal); the old one pass and its warning
  await open([laser(), ...cavity(0), particle(0, 0, 'mie')]);
  S = SC.scatterNow(getEl('p'));
  assert.ok(S.cav && !S.cav.solved && S.flags.includes('cavity'), 'flat: ' + JSON.stringify(S.cav));
  // the test cavity as fixed: flagged by the test as written, by q = 3 (reported in the head of this file)
  await open([laser(), ...cavity(25), particle(0, 0, 'mie')]);
  S = SC.scatterNow(getEl('p'));
  say('V7 the test cavity (finesse 29.8):', JSON.stringify(S.cav.degen));
  assert.ok(S.cav && S.cav.why === 'degenerate' && S.cav.degen.q === 3, JSON.stringify(S.cav));
  // the same mirrors at 99.9 %: three linewidths are 0.0063 rad, and 1.855 rad is clear of every p / q
  await open([laser(), ...cavity(25, 99.9), particle(0, 0, 'mie')]);
  S = SC.scatterNow(getEl('p'));
  assert.ok(S.cav && S.cav.solved && !S.flags.includes('cavity'), 'finesse 3000: ' + JSON.stringify([S.cav && S.cav.why, S.flags]));
  say('V7 at 99.9 %: solved in', S.cav.modes, 'modes; shift', S.cav.shiftLw.toExponential(3), 'linewidths, widening', S.cav.widenLw.toExponential(3));
});

/* V2, V3, V5, V6: the four places, each model, against the reference (the degeneracy test off) */
for (const [model, refName, places] of [['rayleigh', 'dipole', null], ['mie', 'mie', null], ['dda', 'mie', ['antinode', 'node']]]) {
  test('a ' + (model === 'rayleigh' ? 'single dipole' : model === 'mie' ? 'Mie sphere' : 'dipole-array sphere') + ' in the cavity against the reference: shift, widening, scattered power, modes', async () => {
    SCV.setCavDegenCheck(false);
    try {
      const Rc = REF.cases[refName].places, A = Rc.antinode;
      // JEKray's lock is a hair's change of the far mirror's place: its antinode is where the empty cavity's waves meet in phase
      await open([laser(), ...cavity(), particle(0, 0, model)]);
      const S0 = solve(), xa = Math.atan2(S0.cav.rho200[1], S0.cav.rho200[0]) / (2 * K);
      const at = { antinode: [0, 0], node: [LAM / 4, 0], quarter: [LAM / 8, 0], 'off-axis': [0, 0.3 * W0] };
      for (const name of places || Object.keys(at)) {
        await open([laser(), ...cavity(), particle(xa + at[name][0], at[name][1], model)]);
        const S = solve(), C = S.cav, R = Rc[name];
        assert.ok(C && C.solved, name + ': ' + JSON.stringify(C));
        const within = (got, ref, big, tol, what) => assert.ok(Math.abs(got - ref) <= tol * Math.abs(big), name + ', ' + what + ': ' + got + ' against ' + ref + ' (' + (Math.abs(got - ref) / Math.abs(big)).toExponential(2) + ' of the antinode’s, allowed ' + tol + ')');
        within(C.shiftK, R.shift_k, A.shift_k, 0.05, 'shift');                                                              // V2
        within(C.widenK, R.widen_k, A.widen_k, 0.05, 'widening');                                                         // V3
        within(S.Psca * 1e3, R.lock.Psca_mW, A.lock.Psca_mW, 0.03, 'scattered power');                                  // V5
        say(model, name, 'shift', (C.shiftK / R.shift_k - 1).toExponential(2), 'widen', (C.widenK / R.widen_k - 1).toExponential(2), 'Psca', (S.Psca * 1e3 / R.lock.Psca_mW - 1).toExponential(2),
          'modes', C.modes, '(reference', R.modes_kept + ')', 'run', S.ms, 'ms, of it the cavity', C.ms, 'ms');                // V6, V9
      }
    } finally { SCV.setCavDegenCheck(true); }
  });
}

/* V4: the detectors over a detuning scan, the cavity as built (no lock), the laser's wavelength moved; a Mie sphere at the
   antinode; five of the reference's 41 points (the validation page takes all of them) */
test('the detectors read the loaded cavity over a detuning scan, against the reference', async () => {
  SCV.setCavDegenCheck(false);
  try {
    const R = REF.cases.mie.places.antinode, peak = Math.max(...R.T_mW);
    await open([laser(), ...cavity(), ...dets]);
    reading('dT');
    const c = CV.findCavities()[0], lock = CV.cavSolved.get(c.id).delta, lwK = 2 * Math.PI / (c.Lopt * c.finesse);
    // the empty cavity as built is resonant where the lock's detuning is made up by the wavelength: k moved by -delta / Lopt
    const nmAt = d => 1550 - LAM * LAM * (-lock / c.Lopt + d * lwK) / (2 * Math.PI) * 1e6;
    for (const i of [0, 10, 20, 30, 40]) {
      const d = R.detune_linewidths[i], built = { [c.id]: 'built' };
      await open([laser(nmAt(d)), ...cavity(), ...dets], built); const e = [2 * reading('dT'), 4 * reading('dR')];
      await open([laser(nmAt(d)), ...cavity(), ...dets, particle(0, 0, 'mie')], built); solve(); const w = [2 * reading('dT'), 4 * reading('dR')];
      for (const [k, got, ref] of [['empty, through', e[0], R.empty_T_mW[i]], ['empty, back', e[1], R.empty_R_mW[i]], ['through', w[0], R.T_mW[i]], ['back', w[1], R.R_mW[i]]])
        assert.ok(Math.abs(got - ref) <= 0.02 * peak, 'detuned ' + d + ' linewidths, ' + k + ': ' + got + ' against ' + ref + ' mW');
      say('V4 detune', d.toFixed(3), 'through', w[0].toFixed(6), 'ref', R.T_mW[i].toFixed(6), ' change', (w[0] - e[0]).toExponential(3), 'ref', (R.T_mW[i] - R.empty_T_mW[i]).toExponential(3),
        ' back', w[1].toFixed(6), 'ref', R.R_mW[i].toFixed(6), ' change', (w[1] - e[1]).toExponential(3), 'ref', (R.R_mW[i] - R.empty_R_mW[i]).toExponential(3));
    }
  } finally { SCV.setCavDegenCheck(true); }
});

/* the particle's own run takes the empty cavity's light, whatever the loaded cavity's factors are; the detectors take them */
test('the particle is solved in the empty cavity’s light; the field run takes the loaded cavity’s', async () => {
  SCV.setCavDegenCheck(false);
  try {
    await open([laser(), ...cavity(), ...dets, particle(0, 0, 'mie')]);
    const S1 = solve(), load = TR.lastTrace.cavLoad;
    assert.ok(load && load[S1.cav.canon], 'the trace keeps the factors: ' + JSON.stringify(load));
    const S2 = solve();
    assert.equal(S2.Psca, S1.Psca, 'the particle’s run does not see its own factors');
    const on = reading('dT');
    delete TR.lastTrace.cavLoad; FF.deviceCache.delete(TR.lastTrace);
    const off = reading('dT');
    const want = 2 * (2 * (S1.cav.s.fout[0] - 1)) * off;        // the forward wave's factor on its power, behind the plate
    assert.ok(Math.abs((on - off) - want / 2) <= 0.05 * Math.abs(want / 2), 'through: ' + (on - off) + ' against ' + want / 2);
    say('loaded against empty, through:', (on - off).toExponential(4), 'mW; from the forward wave’s factor', (want / 2).toExponential(4));
  } finally { SCV.setCavDegenCheck(true); }
});
