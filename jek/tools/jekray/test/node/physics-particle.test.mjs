/* The Particle part and its scattered light on the bench (parts/particle.js, engines/scatter-light.js, the faces'
   reading of it in engines/fibre-face.js): the power sent into a cone against the far field's own integral, the field a
   cone has at a face against the exact Mie field (amplitude, phase, polarisation; in the bench plane and out of it), its
   coherence with the laser that drives the particle, the energy a detector reads with a particle in the beam (the
   optical theorem), a split detector's position signal, the power a lens collects, and that a screen's particle and a
   bench with no particle read as they did. The tolerances were written down before the first run (the report has them)
   and are the numbers below. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBench, engine } from '../../headless.mjs';
const E = await engine();
const { mieCoeffs, mieQ } = await import('../../src/core/mie.js');
const { Z0_OHM, coneGrid, mieFarExact } = await import('../../src/core/scatter.js');
const SC = await import('../../src/engines/scatter.js');
const SL = await import('../../src/engines/scatter-light.js');
const FF = await import('../../src/engines/fibre-face.js');
const TR = await import('../../src/engines/trace.js');
const { getEl } = await import('../../src/state/elements.js');

const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const near = (a, b, tol, msg) => assert.ok(rel(a, b) <= tol, (msg || '') + ': ' + a + ' against ' + b + ' (' + rel(a, b).toExponential(2) + ', allowed ' + tol + ')');
const NM = 1550, K0 = 2 * Math.PI / (NM * 1e-9);
const doc = els => ({ format: 'jekray', version: 1, name: 't', maxBounces: 20, minPower: 0.0001, light: { rays: true, envelope: true, field: true }, benches: [{ id: 'b1', name: 'B' }], tab: 'b1',
  elements: els.map(e => Object.assign({ bench: 'b1', angle: 0 }, e)) });
// (the laser stands 20 mm back with its waist at the bench's origin, where the particle is put: a laser's body beside the particle would shade it)
const laser = (o = {}) => Object.assign({ id: 'laser', type: 'source', name: 'Laser', x: -20, y: 0, wavelength: NM, gauss: true, w0: 0.05, z0: o.x === undefined ? 20 : 0, rays: 0, traceRays: false, power: 100, pol: 'p' }, o);
const particle = (o = {}) => Object.assign({ id: 'p', type: 'particle', name: 'Particle', x: 0.001, y: 0, angle: 90, trapMat: 'Fused silica', trapR: 150, trapMed: 'vacuum' }, o);
const det = (o = {}) => Object.assign({ id: 'det', type: 'detector', name: 'Detector', x: 100, y: 0, angle: 180, length: 10 }, o);
const ideal = (id, x, y, angle, f, dia) => ({ id, type: 'mask', name: id, x, y, angle, length: dia, amp: '1', delay: '-(sqrt(r^2+' + f * f + ')-' + f + ')/lambda', preset: 'custom' });
const open = async els => { const B = await openBench(doc(els)); B.trace(); return B; };
const S_of = id => SC.scatCache.get(id).S;
const reading = id => FF.detectorReading(getEl(id));
const rowOf = (id, part = 'p') => TR.lastTrace.scat.parts[part].rows.find(r => r.id === id);
/* the exact Mie far field of the sphere in the plane wave the answer took (its field at the particle, its way), at directions */
const exactFar = (S, dirs) => mieFarExact(mieCoeffs(S.x, S.m[0], S.m[1]), S.k, S.dir, S.far.refs[0].E, dirs);
const powerIn = (S, G, F) => { let s = 0; for (let i = 0; i < G.w.length; i++) { let a = 0; for (let q = 0; q < 6; q++) a += F[6 * i + q] ** 2; s += a * G.w[i]; } return s / (2 * Z0_OHM / S.nMed); };

test('a cone carries the power the far field puts into its solid angle', async () => {
  await open([laser(), particle()]);
  const S = S_of('p');
  assert.equal(S.model, 'mie'); assert.equal(S.plane, 1);
  const d0 = S.dir, side = [0, 1, 0], up = [0, 0, 1], diag = [Math.SQRT1_2, 0.5, 0.5];
  for (const axis of [d0, side, up, diag, d0.map(v => -v)]) for (const halfDeg of [10, 30, 60]) {
    const half = halfDeg * Math.PI / 180, G = SL.coneDirs(axis, half), A = SL.coneAmps(S.far, 0, S.nMed, G.dirs, G.w);
    const got = A.P.reduce((a, v) => a + v, 0), fine = coneGrid(axis, half, 40, 80), want = powerIn(S, fine, exactFar(S, fine.dirs));
    near(got, want, 5e-3, 'cone of ' + halfDeg + '° about ' + axis.map(v => +v.toFixed(2)));               // N1
    // each ray's amplitudes carry its power against the cone's strongest
    let s = 0; for (let i = 0; i < G.n; i++) s += (A.J[4 * i] ** 2 + A.J[4 * i + 1] ** 2 + A.J[4 * i + 2] ** 2 + A.J[4 * i + 3] ** 2) * A.top;
    near(s, got, 1e-12, 'the rays’ amplitudes');
  }
  // two half spheres hold all of it                                                                           N2
  const both = [d0, d0.map(v => -v)].reduce((a, ax) => { const G = SL.coneDirs(ax, Math.PI / 2); return a + SL.coneAmps(S.far, 0, S.nMed, G.dirs, G.w).P.reduce((x, y) => x + y, 0); }, 0);
  near(both, S.Psca, 5e-3, 'forward and back halves against the scattered power');
});

test('six screens closing a box round the particle catch all the scattered light', async () => {
  const wall = (id, x, y, angle, o) => Object.assign({ id, type: 'screen', name: id, x, y, angle, length: 10, absorb: false }, o);
  await open([laser(), particle({ x: 0, y: 0 }), wall('w1', 5, 0, 180), wall('w2', -5, 0, 0), wall('w3', 0, 5, 270), wall('w4', 0, -5, 90),
    wall('top', 0, 0, 0, { z: 80, tip: -90 }), wall('bottom', 0, 0, 0, { z: 70, tip: 90 })]);
  const R = TR.lastTrace.scat.parts.p;
  assert.equal(R.state, 'ok');
  assert.equal(R.rows.length, 6, 'each wall catches some: ' + R.rows.map(r => r.name));
  const sum = R.rows.reduce((a, r) => a + r.share, 0);
  assert.ok(Math.abs(sum - 1) <= 0.05, 'the shares add to ' + sum);                                           // N3
  assert.ok(Math.abs(R.lostShare - (1 - sum)) < 1e-9 || R.lostShare === 0);
});

/* a cone's rays on a face against the exact field there: gives the largest differences */
function fieldCheck(S, C, elId) {
  const el = getEl(elId), P = S.pos, lmw = C.lmw, Z = Z0_OHM / S.nMed, f = { c: Math.cos(el.angle * Math.PI / 180), s: Math.sin(el.angle * Math.PI / 180) };
  // the phase the launch was turned by: the trace's own beam at the particle against the answer's field there
  const BF = FF.beamFieldAt(S.far.refs[0].beam, P[0], P[1], P[2]), b = TR.lastTrace.beams[S.far.refs[0].beam];
  const [S3, P3] = TR.polFrame([b.dx, b.dy, 0], b.par ? -1 : 1), ref = S.far.refs[0].E;
  let re = 0, im = 0;
  for (let q = 0; q < 3; q++) { const vr = BF.E[0] * S3[q] + BF.E[2] * P3[q], vi = -(BF.E[1] * S3[q] + BF.E[3] * P3[q]); re += ref[2 * q] * vr + ref[2 * q + 1] * vi; im += ref[2 * q] * vi - ref[2 * q + 1] * vr; }
  const rot = Math.atan2(im, re);
  const rays = C.rays.filter(r => r.dA > 0);
  const dirs = new Float64Array(3 * rays.length), dist = [];
  rays.forEach((r, i) => { const h = r.h[0], v = [h.x - P[0], h.y - P[1], h.z - P[2]], l = Math.hypot(...v); dist.push(l); for (let q = 0; q < 3; q++) dirs[3 * i + q] = v[q] / l; });
  const F = exactFar(S, dirs);
  let peak = 0, dAmp = 0, dPol = 0, dPh = 0, dAbs = 0;
  const want = rays.map((r, i) => {
    // the exact field at the hit as the faces write it (conjugated), per root of face area, in the units the rays' amplitudes have:
    // F e^{i(kr + rot)} / r in V/m; its power through the face per mm^2 against the mW a unit ray carries
    const rm = dist[i] * 1e-3, nrm = [-f.c * Math.cos((el.tip || 0) * Math.PI / 180), -f.s * Math.cos((el.tip || 0) * Math.PI / 180), -Math.sin((el.tip || 0) * Math.PI / 180)];
    const cosg = Math.abs(dirs[3 * i] * nrm[0] + dirs[3 * i + 1] * nrm[1] + dirs[3 * i + 2] * nrm[2]);
    const g = Math.sqrt(cosg / (2 * Z) * 1e-3 / lmw) / rm, ph = K0 * rm + rot, c = Math.cos(ph), s = Math.sin(ph), o = [];
    for (let q = 0; q < 3; q++) { const fr = F[6 * i + 2 * q], fi = F[6 * i + 2 * q + 1]; o.push(g * (fr * c - fi * s), -g * (fr * s + fi * c)); }
    peak = Math.max(peak, Math.hypot(...o));
    return o;
  });
  const got = rays.map(r => r.E.map(v => v / Math.sqrt(r.dA)));
  const centre = rays.reduce((a, r, i) => (Math.hypot(r.u, r.v) < Math.hypot(rays[a].u, rays[a].v) ? i : a), 0);
  const phaseOf = (o, w) => { let pr = 0, pi = 0; for (let q = 0; q < 6; q += 2) { pr += w[q] * o[q] + w[q + 1] * o[q + 1]; pi += w[q] * o[q + 1] - w[q + 1] * o[q]; } return Math.atan2(pi, pr); };   // arg of conj(w) . o
  const off0 = phaseOf(got[centre], want[centre]);
  rays.forEach((r, i) => {
    dAmp = Math.max(dAmp, Math.abs(Math.hypot(...got[i]) - Math.hypot(...want[i])) / peak);
    // its phase against the centre ray's (across the aperture), where the field is not near nothing
    if (Math.hypot(...want[i]) > 0.05 * peak) { let d = phaseOf(got[i], want[i]) - off0; d = Math.atan2(Math.sin(d), Math.cos(d)); dPh = Math.max(dPh, Math.abs(d)); }
    // each component, with the centre ray's phase offset taken off: the polarisation
    const c = Math.cos(off0), s = Math.sin(off0);
    for (let q = 0; q < 6; q += 2) dPol = Math.max(dPol, Math.hypot(got[i][q] - (want[i][q] * c - want[i][q + 1] * s), got[i][q + 1] - (want[i][q] * s + want[i][q + 1] * c)) / peak);
  });
  dAbs = Math.abs(off0);
  return { n: rays.length, dAmp, dPh, dAbs, dPol };
}
test('a cone’s field at a face is the Mie far field: amplitude, phase and polarisation', async () => {
  // light polarised out of the plane, so the side detector sits in the pattern's bright belt
  await open([laser({ pol: 's' }), particle(), det({ id: 'side', x: 0.001, y: 20, angle: 270, length: 10 }), det({ id: 'fwdish', x: 20, y: 12, angle: 211, length: 8 })]);
  const S = S_of('p');
  for (const id of ['side', 'fwdish']) {
    const C = FF.scatFace(getEl(id)).find(c => !c.wave), R = fieldCheck(S, C, id);
    assert.ok(R.n >= 150, id + ': ' + R.n + ' rays with their tubes');
    assert.ok(R.dAmp <= 0.01, id + ': amplitude off by ' + R.dAmp + ' of the peak');                     // N4
    assert.ok(R.dPh <= 0.02, id + ': phase across the aperture off by ' + R.dPh + ' rad');               // N5
    assert.ok(R.dAbs <= 0.02, id + ': the centre ray’s phase against the driving beam off by ' + R.dAbs + ' rad');   // N6
    assert.ok(R.dPol <= 0.01, id + ': a component off by ' + R.dPol + ' of the peak');                   // N7
  }
});
test('a cone out of the bench plane: its power and its field', async () => {
  // a detector 12 mm above the beam height and 12 mm to the side, tipped down to face the particle
  await open([laser({ pol: 'linear', polAngle: 30 }), particle(), det({ id: 'high', x: 0.001, y: 12, z: 87, angle: 270, tip: -45, length: 6 })]);
  const S = S_of('p'), el = getEl('high'), C = FF.scatFace(el).find(c => !c.wave);
  assert.ok(C && C.rays.length >= 150, 'the raised detector catches the cone');
  const got = C.rays.reduce((a, r) => a + r.pw, 0) * C.lmw * 1e-3;
  // the far field over the detector's disc, straight: the disc 16.97 mm off, square to the line to the particle
  const axis = [0, Math.SQRT1_2, Math.SQRT1_2], half = Math.atan(3 / Math.hypot(12, 12)), fine = coneGrid(axis, half, 40, 80);
  near(got, powerIn(S, fine, exactFar(S, fine.dirs)), 0.01, 'power on the raised detector');             // N8
  near(rowOf('high').P, got, 1e-9, 'its row');
  const R = fieldCheck(S, C, 'high');                                                                  // N9
  assert.ok(R.dAmp <= 0.01 && R.dPh <= 0.02 && R.dAbs <= 0.02 && R.dPol <= 0.01, JSON.stringify(R));
  // and it is drawn off the plane: its rays rise
  assert.ok(TR.lastTrace.rays.some(r => r.sc && r.zs && r.zs[r.zs.length - 1] > 80));
});

test('scattered light is light of the driving laser: it interferes with a local oscillator split from it, and not with another laser', async () => {
  const f = 10, bench = (lo, ph) => [laser({ pol: 's' }), particle(), ideal('lens', 0.001, f, 90, f, 6.3),
    { id: 'bs', type: 'cube', name: 'Splitter', x: 0.001, y: 25, angle: 0, size: 12.7, reflect: 50 },
    Object.assign({ id: 'lo', type: 'source', name: 'LO', x: -30, y: 25, angle: 0, wavelength: NM, gauss: true, w0: 1, z0: 0, rays: 0, traceRays: false, power: 1, pol: 's' }, lo ? { splitFrom: 'laser', splitPhase: ph } : {}),
    det({ id: 'pd', x: 0.001, y: 45, angle: 270, length: 10 })];
  const read = async (lo, ph) => { await open(bench(lo, ph)); const r = reading('pd'); return { cross: r.scat.cross, own: r.scat.mw - r.scat.cross, mw: r.mw }; };
  const a = await read(true, 0), S = S_of('p'), Aarr = FF.faceArrivals(getEl('pd'))[0], b = await read(true, 90);
  const amp = Math.hypot(a.cross, b.cross), Plo = a.mw - a.cross - a.own;
  // the overlap of the LO's Gaussian with the collimated scattered field, from the exact Mie pattern and the lens's mapping:
  // eta = f^2 |Int g F_z cos^-3/2 dOmega|^2 / Int |F|^2 dOmega over the lens
  const w = FF.qW(Aarr.qx, Aarr.lam0), half = Math.atan(3.15 / f), G = coneGrid([0, 1, 0], half, 40, 80), F = exactFar(S, G.dirs);
  let or = 0, oi = 0, pp = 0;
  for (let i = 0; i < G.w.length; i++) {
    const ct = G.dirs[3 * i + 1], rho = f * Math.sqrt(1 - ct * ct) / ct, g = Math.sqrt(2 / Math.PI) / w * Math.exp(-rho * rho / (w * w)) * Math.pow(ct, -1.5) * G.w[i];
    or += g * F[6 * i + 4]; oi += g * F[6 * i + 5];
    let s = 0; for (let q = 0; q < 6; q++) s += F[6 * i + q] ** 2; pp += s * G.w[i];
  }
  const eta = f * f * (or * or + oi * oi) / pp;
  assert.ok(eta > 0.02 && eta < 1, 'the overlap ' + eta);
  near(amp, 2 * Math.sqrt(Plo * a.own * eta), 0.02, 'the interference term’s amplitude over the LO’s phase');    // N10
  assert.ok(Math.abs(a.cross) > 0.05 * amp || Math.abs(b.cross) > 0.05 * amp);
  // a quarter wave on: the term has moved from one quadrature to the other, and half a wave on it changes sign
  const c = await read(true, 180);
  near(c.cross, -a.cross, 1e-6, 'half a wave on the LO');
  // another laser: powers only
  const d = await read(false, 0);
  assert.ok(Math.abs(d.cross) <= 1e-9 * Plo, 'no interference with a separate laser: ' + d.cross);                        // N11
});

test('energy: a detector that takes in the beam reads the extinction (a wide beam)', async () => {
  for (const [mat, r] of [['Fused silica', 150], ['Au', 50]]) {
    const els = on => [laser(), particle({ trapMat: mat, trapR: r, scatLight: on }), det({ length: 10 })];
    await open(els(true));
    const S = S_of('p'), on = reading('det'), caught = rowOf('det').P * 1e3;
    await open(els(false));
    const off = reading('det');
    // Mie's own extinction for a plane wave of the beam's irradiance at its waist
    const Q = mieQ(mieCoeffs(S.x, S.m[0], S.m[1])), I0 = 2 * 0.1 / (Math.PI * 0.05e-3 ** 2), Pext = Q.Qext * Math.PI * (r * 1e-9) ** 2 * I0 * 1e3, Pabs = Q.Qabs * Math.PI * (r * 1e-9) ** 2 * I0 * 1e3;
    const want = -(Pext - caught);
    assert.ok(Math.abs((on.mw - off.mw) - want) <= 0.02 * Pext, mat + ': the reading changes by ' + (on.mw - off.mw) + ' mW, against ' + want + ' (extinction ' + Pext + ', caught ' + caught + ')');   // N12, N13
    near(on.scat.mw - on.scat.cross, caught, 1e-6, 'its own power on the detector');
    if (mat === 'Au') assert.ok(Pabs > Pext - Pabs, 'gold of this size absorbs more than it scatters');
    // what is lost is what the particle absorbs and what it scatters past the detector
    near(off.mw - on.mw, Pabs + (S.Psca * 1e3 - caught), 0.02 * Pext / (off.mw - on.mw) + 1e-12, mat + ': absorbed and scattered away');
  }
});
const tight = on => [laser({ x: -30, w0: 1.5, rays: 0 }), ideal('obj', 0, 0, 0, 2, 5.333), particle({ x: 2, y: 0, scatLight: on }), ideal('col', 4, 0, 0, 2, 5.333), det({ x: 10, length: 8 })];
test('energy: the tight focus, its forward scatter and its beam through one collection lens', async () => {
  await open(tight(true));
  const S = S_of('p'), on = reading('det'), caught = rowOf('col').P * 1e3;
  assert.equal(S.pupils, 1); assert.ok(S.waves > 500);
  await open(tight(false));
  const off = reading('det'), Pext = S.Pext * 1e3;
  // (in a focus the interference is the optical theorem wave by wave, each wave's share put where its ray lands: with every
  // wave on the detector the sum is the extinction itself, so this checks that they all arrive and are counted once)
  assert.ok(Math.abs((on.mw - off.mw) - -(Pext - caught)) <= 0.05 * Pext, 'the reading changes by ' + (on.mw - off.mw) + ' mW, against ' + -(Pext - caught));   // N14
  near(on.scat.cross, -Pext, 1e-6, 'the interference');
  assert.ok(Math.abs(on.X) < 1e-9 && Math.abs(on.Y) < 1e-9, 'a centred particle gives no split signal');
});

test('a split detector reads the particle’s place in a focus', async () => {
  // a gentle focus (waist 6.6 um), a 100 nm sphere moved across it in the bench plane, a collection lens, a split detector
  const w0 = 0.15, f = 2, wf = NM * 1e-6 * f / (Math.PI * w0), els = y => [laser({ x: -0.01, w0, pol: 's' }), ideal('obj', 0, 0, 0, f, 2.4), particle({ x: f, y, trapR: 50 }), ideal('col', 2 * f, 0, 0, f, 2.4), det({ x: 10, length: 4 })];
  const sig = async y => { await open(els(y)); const r = reading('det'); return r.X / r.mw; };
  const x = 0.05 * wf, sp = await sig(x), sm = await sig(-x), sh = await sig(x / 2);
  assert.ok(Math.abs(sp + sm) <= 0.01 * Math.abs(sp), 'odd in the displacement: ' + sp + ' and ' + sm);                    // N15
  near(sh, sp / 2, 0.02, 'linear near the middle');                                                                       // N16
  // the slope against jek/tools/validation/scripts/scatter_position.py (an independent integration of the two far fields)
  const slope = (sp - sm) / (2 * x * 1e3);                                                // per um
  near(Math.abs(slope), SLOPE_REF, 0.03, 'the slope at the middle, per µm');                                        // N17
  assert.ok(await sig(0) === 0 || Math.abs(await sig(0)) < 1e-3 * Math.abs(sp));
});
/* scatter_position.py: |d(S)/dx| at the middle for this bench (1550 nm, waist 6.5784 um, silica n = 1.44402, radius 50 nm), per um */
const SLOPE_REF = 4.31569e-6;

test('the power a lens collects is the pattern’s over its cone', async () => {
  // NA 0.5 lenses (f = 2, 2.309 across) ahead of the tight focus and at 90° to it
  const els = [laser({ x: -30, w0: 1.5 }), ideal('obj', 0, 0, 0, 2, 5.333), particle({ x: 2, y: 0, scatNA: 0.5, scatDir: 'fwd' }), ideal('fwd', 4, 0, 0, 2, 2.3094), det({ id: 'dF', x: 10, length: 6 }),
    ideal('side', 2, 2, 90, 2, 2.3094), det({ id: 'dS', x: 2, y: 8, angle: 270, length: 6 })];
  const B = await open(els), S = S_of('p');
  near(rowOf('fwd').P, S.collect.P, 5e-3, 'the forward lens’s share against the pattern’s cone');               // N18
  near(reading('dF').scat.mw - reading('dF').scat.cross, rowOf('fwd').P * 1e3, 0.01, 'the detector behind it');             // N19
  near(reading('dS').mw, rowOf('side').P * 1e3, 0.01, 'the side detector reads what the side lens collects');
  await open(els.map(e => (e.type === 'particle' ? Object.assign({}, e, { scatDir: 'side' }) : e)));
  assert.equal(S_of('p').collect.dir, 'side');
  near(rowOf('side').P, S_of('p').collect.P, 5e-3, 'the side lens: its share');                                          // N18
  // the script's call gives the rows
  const R = (await open(els)).scattered('Particle');
  assert.equal(R.state, 'ok');
  near(R.rows.reduce((a, r) => a + r.P, 0) + R.lost, R.Psca, 1e-5, 'the rows and what is lost are the scattered power');      // (the script's figures are rounded to six)
});

test('a screen’s particle reads as it did, and a particle changes nothing of the beam', async () => {
  // the example bench as it was before the Particle part: the figures it gave then (run on the code as it was, commit e54db8d4)
  const old = [laser({ id: 'laser', x: -30, w0: 1.5, rays: 7, traceRays: true, width: 3, pattern: 'hex' }), ideal('obj', 0, 0, 0, 2, 5.333),
    { id: 'particle', type: 'screen', name: 'Particle at the focus', x: 2, y: 0, angle: 180, length: 0.1, absorb: false, trap: 'sphere', trapMat: 'Fused silica', trapR: 150, trapMed: 'vacuum', scatNA: 0.5, scatDir: 'back' }];
  const B = await open(old), S = await B.scatter('Particle at the focus');
  near(S.Psca, 0.0001266553436244437, 1e-9, 'scattered power');                                                             // N20
  near(S.collect.P, 0.000010242409067043762, 1e-9, 'collected power');
  near(S.Csca, 1.8069657930882826e-15, 1e-9, 'scattering cross-section');
  assert.equal(TR.lastTrace.scat, undefined, 'a screen’s particle sends nothing onto the bench');
  // a Particle part with its light off, and no particle: the same reading to the last figure
  await open(tight(false));
  const off = reading('det').mw;
  await open(tight(false).filter(e => e.type !== 'particle'));
  assert.ok(Math.abs(reading('det').mw - off) <= 1e-12 * off, 'reading with the particle’s light off ' + off + ', with no particle ' + reading('det').mw);   // N21
  // and with its light on the beams are the same beams
  await open(tight(true));
  assert.equal(TR.lastTrace.beams.length, 3);
});

test('what is launched is bounded, and stale answers are held to the beam they were worked out for', async () => {
  await open(tight(true));
  const R = TR.lastTrace.scat.parts.p;
  assert.ok(R.probed <= 200 + 2 * SL.SC_RINGS * SL.SC_SPOKES * 3, 'probe rays: ' + R.probed);
  assert.ok(R.launched <= (SL.SC_MAX_CONES + 2) * SL.SC_RINGS * SL.SC_SPOKES * 3 + 4200, 'launched: ' + R.launched);
  // the fan is a picture: its rays are not in the trace's rays, and no face has them
  const fan = TR.lastTrace.scat.fans[0];
  assert.ok(fan.n > 100 && fan.nPlane === 48);
  assert.ok(TR.lastTrace.rays.every(r => !r.sc || r.src.startsWith('p~s')));
  // the fan off: the same readings
  const with1 = reading('det').mw;
  await open(tight(true).map(e => (e.type === 'particle' ? Object.assign({}, e, { scatFan: false }) : e)));
  assert.equal(reading('det').mw, with1);
  assert.equal(TR.lastTrace.scat.fans[0].on, false);
});
