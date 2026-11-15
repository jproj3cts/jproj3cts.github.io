/* A screen's particle (files before 1.1, trap 'sphere') opens as a Particle part of its own beside the screen. Five such
   benches; what the old screen path gave for each (the source at 99076c0b, run headless, recorded below; with one change made to it, the round field taken by its series in a steep focus's pupil, as JEKray does since, so both paths are under one model) against what the
   converted Particle gives now: the Scattering tab's numbers, where the particle is, and the Trap tab's figures. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBench, engine } from '../../headless.mjs';

const E = await engine();
const SC = await import('../../src/engines/scatter.js'), SS = await import('../../src/engines/screen-stats.js'), ST = await import('../../src/state/project.js');
const OPEN = await import('../../src/io/open.js');
const rel = (a, b) => (b === 0 ? Math.abs(a) : Math.abs(a / b - 1));
const say = (...a) => { if (process.env.SHOW) console.log('#', ...a); };
const ideal = (name, x, f, dia) => ({ type: 'mask', name, x, y: 0, angle: 0, length: dia, amp: '1', delay: '-(sqrt(r^2+' + f * f + ')-' + f + ')/lambda', preset: 'custom' });
const laser = o => Object.assign({ type: 'source', name: 'Laser', x: -30, y: 0, angle: 0, wavelength: 1550, gauss: true, w0: 1.5, z0: 0, rays: 0, traceRays: false, power: 100, pol: 'p' }, o);
const screen = o => Object.assign({ type: 'screen', name: 'S', y: 0, angle: 180, length: 0.02, absorb: false, trap: 'sphere', trapMat: 'Fused silica', trapR: 150, trapMed: 'vacuum' }, o);
const doc = (name, elements) => ({ format: 'jekray', version: 1, name, maxBounces: 40, minPower: 1e-4, ghosts: false, elements });
const CASES = {
  C1: doc('plane wave', [laser({ w0: 2, x: -20 }), screen({ x: 0, length: 0.2 })]),
  C2: doc('NA 0.8 focus', [laser({}), ideal('Objective', 0, 2, 5.333), screen({ x: 2 })]),
  C3: doc('rod', [laser({ pol: 's' }), ideal('Objective', 0, 4, 5.333), screen({ x: 4, trapShape: 'cylinder', trapR: 100, trapLen: 1000, trapAz: 90 })]),
  C4: doc('offset', [laser({}), ideal('Objective', 0, 2, 5.333), screen({ x: 2, scatDx: 0.2, scatDy: 0.1, scatDz: 0.3 })]),
  C5: doc('trap', [laser({}), ideal('Objective', 0, 2, 5.333), screen({ x: 2.0005, length: 0.01, trapR: 100, scatAt: 'trap' })]),
};

// the old screen path's answers (99076c0b)
const BEFORE = {"C1": {"I0": 15915.396295537334,"Csca": 1.8069657930882826e-15,"Cext": 1.8069657930882826e-15,"Cabs": -2.4524075376623196e-31,"Psca": 2.875857525661445e-11,"Pext": 2.8758576689479958e-11,"collect": 0.10949302082608435,"Fmax": 5.472428529174067e-05,"pos": [0,0,75],"model": "mie","trap": {"fx": 0.00023523886549725985,"fy": 0.00023523886549725985,"fz": 0.0002148907125913371,"k": [6.794585320026123e-23,6.794585320026123e-23,5.66996131847576e-23],"U": -5.1880277090755206e-27,"depthK": 0.0003757673173323213,"trap": false}},"C2": {"I0": 70052337115.34354,"Csca": 1.8069657930882826e-15,"Cext": 1.8069657930882826e-15,"Cabs": -2.4524075376623196e-31,"Psca": 0.00012655093745271483,"Pext": 0.0001265509379870213,"collect": 0.10791993082996065,"Fmax": 0.09933404624462128,"pos": [2,0,75],"model": "mie","trap": {"fx": 53351.63526542867,"fy": 59623.327689832615,"fz": 17139.074457324525,"k": [3.494944429979891e-06,4.364929426909045e-06,3.6067790216123027e-07],"U": -1.15485429505981e-18,"depthK": 83645.75609440269,"trap": true}},"C3": {"I0": 27327396475.27741,"Csca": 4.599517972509284e-15,"Cext": 4.599539718398968e-15,"Cabs": -3.8463885949225647e-34,"Psca": 0.00011962478912417291,"Pext": 0.00011962527994334637,"collect": 0.1519246534982741,"Fmax": 0.13712990283966064,"pos": [4,0,75],"model": "dda","trap": {"fx": 627.785657676497,"fy": 777.3525766515218,"fz": 236.65290925062374,"k": [1.0753629501397596e-09,1.6488015046755584e-09,1.528114813391243e-10],"U": -2.9886462883319254e-21,"depthK": 216.46676949260277,"trap": false}},"C4": {"I0": 63611897142.509476,"Csca": 1.8069657930882826e-15,"Cext": 1.8069657930882826e-15,"Cabs": -2.4524075376623196e-31,"Psca": 0.0001149137669836987,"Pext": 0.00011491376757792206,"collect": 0.10653843998985797,"Fmax": 0.09330040961503983,"pos": [2.0003,0.0002,75.0001],"model": "mie","trap": {"fx": 53351.63526542867,"fy": 59623.327689832615,"fz": 17139.074457324525,"k": [3.494944429979891e-06,4.364929426909045e-06,3.6067790216123027e-07],"U": -1.15485429505981e-18,"depthK": 83645.75609440269,"trap": true}},"C5": {"I0": 69271873700.43727,"Csca": 1.5982457621663135e-16,"Cext": 1.5982457621663135e-16,"Cabs": 0,"Psca": 1.1070786805276006e-05,"Pext": 1.1070786854408948e-05,"collect": 0.10016803181231178,"Fmax": 0.029647912830114365,"pos": [2.0002780735194943,-1.1358603881326979e-16,75],"model": "mie","trap": {"fx": 57803.390542091256,"fy": 64299.503696725056,"fz": 18054.66754435567,"k": [1.2155635072277103e-06,1.5041330998182449e-06,1.1859053231090466e-07],"U": -3.8469593587184586e-19,"depthK": 27863.413211601634,"trap": true}}};

for (const [k, d] of Object.entries(CASES)) {
  test('a screen\u2019s particle opens as a Particle part with the same physics: ' + d.name + ' (' + k + ')', async () => {
    const B = await openBench(d); B.trace();
    const parts = ST.project.elements.filter(e => e.type === 'particle'), sc = ST.project.elements.find(e => e.type === 'screen');
    assert.equal(parts.length, 1); assert.equal(sc.trap, 'none'); assert.equal(parts[0].name, 'S particle'); assert.equal(parts[0].fromScreen, undefined);
    const el = parts[0], S = SC.scatterPlain(SC.scatterNow(el)), T = S.trapRaw ? SS.trapReport(el, S.trapRaw) : null, O = BEFORE[k];
    const Fmax = Math.max(...S.far.F.map(F => Math.max(...F.map(Math.abs))));
    const tol = k === 'C3' ? 2e-3 : 1e-6;                                                       // S1 (C3: the iterative dipole array)
    for (const [q, v] of Object.entries({ I0: S.I0, Csca: S.Csca, Cext: S.Cext, Psca: S.Psca, Pext: S.Pext, collect: S.collect.frac, Fmax })) assert.ok(rel(v, O[q]) <= tol, q + ': ' + v + ' against ' + O[q]);
    assert.ok(Math.abs(S.Cabs - O.Cabs) <= 1e-6 * O.Cext, 'Cabs ' + S.Cabs + ' against ' + O.Cabs);
    assert.ok(Math.hypot(...S.pos.map((v, i) => v - O.pos[i])) <= 1e-6, 'where: ' + S.pos + ' against ' + O.pos);  // S2 (S4: 1e-6 mm is 1 nm)
    assert.equal(S.model, O.model);
    // S3: the Trap tab's figures where there is a trap; where there is none (C1 a plane wave, C3 the rod) the search stopped at
    // the edge of the region it looked in, which differs between the two, and no figures are given (the tab never showed them)
    assert.equal(T.trap, O.trap.trap);
    if (O.trap.trap) {
      for (const q of ['fx', 'fy', 'fz', 'U']) assert.ok(O.trap[q] === null ? T[q] === null : rel(T[q], O.trap[q]) <= 1e-4, q + ': ' + T[q] + ' against ' + O.trap[q]);
      T.k.forEach((v, i) => assert.ok(rel(v, O.trap.k[i]) <= 1e-4, 'k' + i + ': ' + v + ' against ' + O.trap.k[i]));
    } else assert.deepEqual([T.fx, T.fy, T.fz, T.k, T.U, T.depthK], [null, null, null, null, null, null], 'no trap: no figures');
    say(k, 'moved', Math.hypot(...S.pos.map((v, i) => v - O.pos[i])), 'I0', rel(S.I0, O.I0), 'Psca', rel(S.Psca, O.Psca), 'trap fx', T && T.fx, O.trap && O.trap.fx);
  });
}
test('opening a file with a screen\u2019s particle says so once', () => {
  for (const d of Object.values(CASES)) {
    OPEN.openProjectData(JSON.parse(JSON.stringify(d)), 'test');
    const notes = OPEN.lastImportNotes().filter(n => /particle/i.test(n));
    assert.equal(notes.length, 1, JSON.stringify(OPEN.lastImportNotes()));                     // S5
    assert.match(notes[0], /moved onto a Particle part of its own/);
  }
});
test('a screen name given to scatter() says the particle is its own part now', async () => {
  const B = await openBench(CASES.C2); B.trace();
  await assert.rejects(() => B.scatter('S'), /a Particle part of its own now .*"S particle"/);
});
