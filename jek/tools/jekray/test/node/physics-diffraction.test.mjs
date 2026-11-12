/* Physics regressions: the diffracted field behind masks and hard edges, against closed forms worked here.
   A phase mask that cuts nothing still spreads the light: a sinusoidal phase grating's orders carry J_n(beta)^2 of
   the power each (Jacobi-Anger; Goodman, Introduction to Fourier Optics, ch. 4), about the axis the beam came in on. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { engine } from '../../headless.mjs';
const E = await engine();                                       // first: the page's stand-ins, then the modules in order
const { popRun } = await import('../../src/engines/beam-tree.js');
const { diffraction, popScreenCache } = await import('../../src/engines/pd-cavity.js');
const { maskBeamFit, maskFns } = await import('../../src/core/mask.js');

const NM = 633, LAM = NM * 1e-6;
const bench = (name, elements) => ({ format: 'jekray', version: 1, name, maxBounces: 40, minPower: 1e-6, ghosts: false, elements });
const laser = o => Object.assign({ type: 'source', name: 'Laser', x: -50, y: 0, angle: 0, wavelength: NM, width: 1, gauss: true, w0: 0.5, z0: 50, popN: 512, pol: 's', rays: 1, power: 1 }, o);
const mask = (delay, o) => Object.assign({ type: 'mask', name: 'Mask', x: 0, y: 0, angle: 0, length: 25.4, amp: '1', delay, preset: 'custom' }, o);
const screen = (x, o) => Object.assign({ type: 'screen', name: 'Screen', x, y: 0, angle: 180, length: 60 }, o);
function run(data) {
  E.EL.loadProject(JSON.parse(JSON.stringify(data)));
  E.TRACE.setLastTraceKey(null); E.TRACE.traceScene(); popScreenCache.clear();
  const R = popRun(E.TRACE.lastTrace.beams, E.EL.allSources());
  const seg = name => R.segs.find(s => s.b.ev && (E.EL.getEl(s.b.ev.el) || {}).name === name);
  return { R, seg, screen: name => diffraction(E.ST.project.elements.find(e => e.name === name)) };
}
// J_n by its integral, (1/pi) int_0^pi cos(n t - x sin t) dt
const besselJ = (n, x) => { let s = 0; const K = 400; for (let i = 0; i < K; i++) { const t = (i + 0.5) / K * Math.PI; s += Math.cos(n * t - x * Math.sin(t)); } return s / K; };
const waves = beta => (beta / (2 * Math.PI)).toFixed(10);

test('a sinusoidal phase grating: each order carries J_n(beta)^2, about the axis the beam came in on', () => {
  const d = 0.2, z = 1000, sep = LAM * z / d, w0 = 0.5, wz = w0 * Math.sqrt(1 + (z / (Math.PI * w0 * w0 / LAM)) ** 2);
  for (const beta of [1, 2.4048255577, 3.8317059702]) {
    const { R, seg } = run(bench('phase grating', [laser(), mask(waves(beta) + '*sin(2*pi*x/' + d + ')'), screen(z + 100)]));
    const S = seg('Mask');
    assert.ok(S, 'a field behind the grating');
    // the grating's slope under the beam's own ray, beta lambda / d, is no slope of the whole beam's
    assert.ok(Math.abs(S.b.dy) < 0.02 * LAM / d, 'beta ' + beta + ': the axis goes straight on, dy ' + S.b.dy);
    assert.equal(R.notes.steep.size, 0, 'no flag');
    const c = S.leg.cut(z), h = c.x[1] - c.x[0];
    let tot = 0; for (let i = 0; i < c.I.length; i++) tot += c.I[i] * h;
    assert.ok(Math.abs(tot / (Math.sqrt(2 / Math.PI) / wz) - 1) < 2e-3, 'beta ' + beta + ': all the light is still on the grid 1 m on, ' + tot * wz / Math.sqrt(2 / Math.PI));
    assert.ok(Math.abs(S.leg.stats(z).power - 1) < 1e-3, 'and its power');
    for (let n = -5; n <= 5; n++) {
      let s = 0; for (let i = 0; i < c.I.length; i++) if (c.x[i] >= (n - 0.5) * sep && c.x[i] < (n + 0.5) * sep) s += c.I[i] * h;
      const got = s / (Math.sqrt(2 / Math.PI) / wz), want = besselJ(n, beta) ** 2;
      assert.ok(Math.abs(got - want) < 0.003, 'beta ' + beta + ', order ' + n + ': ' + got + ' vs J_n^2 = ' + want);
    }
  }
});

test('a cosine phase grating neither bends nor focuses the beam, and the light it spreads is held', () => {
  // under the beam's ray this grating has no slope and the curvature of a 2.6 mm lens: neither is the whole beam's
  const d = 0.2, beta = 3.8317059702, z = 1000;
  const { R, seg } = run(bench('cos grating', [laser(), mask(waves(beta) + '*cos(2*pi*x/' + d + ')'), screen(z + 100)]));
  const S = seg('Mask'), st = S.leg.stats(z);
  assert.ok(Math.abs(S.b.dy) < 1e-9, 'straight on');
  assert.equal(R.notes.steep.size, 0, 'no flag');
  assert.ok(Math.abs(st.power - 1) < 1e-3, 'power ' + st.power);
  // orders n lambda z / d apart with <n^2> = beta^2 / 2, on top of the beam's own width
  const want = 2 * Math.hypot(LAM * z / d * beta / Math.SQRT2, 0.5 * 0.5 * Math.sqrt(1 + (z / (Math.PI * 0.25 / LAM)) ** 2));
  assert.ok(Math.abs(st.wx / want - 1) < 0.01, 'width across the orders ' + st.wx + ' vs ' + want);
  assert.ok(Math.abs(st.cx) < 0.01, 'centred, ' + st.cx);
});

test('rings of phase (a round mask, the round field): the light they spread is held too', () => {
  const d = 0.1, beta = 3.8317059702;
  const { R, seg } = run(bench('radial grating', [laser(), mask(waves(beta) + '*sin(2*pi*r/' + d + ')'), screen(5100)]));
  const S = seg('Mask');
  assert.equal(S.eng, 'round');
  assert.equal(R.notes.steep.size, 0, 'no flag');
  for (const z of [100, 1000, 3000]) {
    // cones at n lambda / d: <r^2> = (lambda z / d)^2 beta^2 / 2 and the beam's own
    const st = S.leg.stats(z), want = Math.hypot(LAM * z / d * beta, 0.5 * Math.sqrt(1 + (z / (Math.PI * 0.25 / LAM)) ** 2));
    assert.ok(Math.abs(st.power - 1) < 1e-3, 'power at ' + z + ': ' + st.power);
    assert.ok(Math.abs(st.w / want - 1) < 0.02, 'width at ' + z + ' mm: ' + st.w + ' vs ' + want);
  }
});

test('what a mask does to a whole beam: a lens is left to its own ray, a grating is not', () => {
  const lam = LAM, fit = (delay, u, w) => maskBeamFit(maskFns({ amp: '1', delay }).fn, u, 0, w, w, lam);
  assert.equal(fit('-(sqrt(r^2+250000)-500)/lambda', 0.3, 0.5), null, 'a lens');
  assert.equal(fit('x/0.1', 0, 0.5), null, 'a blazed grating: one slope everywhere');
  assert.equal(fit('x/0.1-floor(x/0.1)', 0.03, 0.5), null, 'and with its resets');
  assert.equal(fit('-5*r', 0, 0.5), null, 'an axicon');
  assert.equal(fit(waves(0.05) + '*sin(2*pi*x/0.2)', 0, 0.5), null, 'a grating too weak to spread the beam');
  const s = fit(waves(2.405) + '*sin(2*pi*x/0.2)', 0, 0.5);
  assert.ok(s && Math.abs(s.gu) < 1e-3 * 2.405 / 0.2 && Math.abs(s.cu) < 1e-6, 'a sinusoid: no mean slope, no trend, ' + JSON.stringify(s));
  assert.ok(Math.abs(s.su / (2.405 / 0.2) - 1) < 0.02 && Math.abs(s.ku / (2 * Math.PI / 0.2) - 1) < 0.02, 'its steepest slope beta / d and its rate 2 pi / d');
  const f = fit('atan2(y,x)/(2*pi)+x/0.1', 0, 0.5);
  assert.ok(f && Math.abs(f.gu - 10) < 1e-6 && Math.abs(f.gv) < 1e-9, 'a fork hologram on its core: the carrier’s slope, the vortex’s cancels, ' + JSON.stringify(f));
  const l = fit(waves(2.405) + '*sin(2*pi*x/0.2)-(sqrt(r^2+250000)-500)/lambda', 0.2, 0.5);
  assert.ok(l && Math.abs(l.cu * lam + 1 / 500) < 2e-5 && Math.abs(l.gu * lam + 0.2 / 500) < 2e-6, 'a grating on a lens: the lens’s slope and curvature, ' + JSON.stringify(l));
  assert.ok(l.sv === 0 && l.kv === 0, 'and nothing along the lines');
});

test('the SLM’s fork hologram keeps its beam with hexapolar rays (the vortex example)', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../../../demos/vortex-beams.jekray', import.meta.url), 'utf8'));
  const L = data.elements.find(e => e.type === 'source' && e.name === 'Laser');
  assert.equal(L.pattern, 'hex', 'the example has them');
  const { R, screen: scr } = run(data);
  // rays off the bench plane take the mask's slope up and down too: on the fork's core that was half a turn over
  // 0.2 um, bent past grazing, and the beam and every ray through the core ended on the SLM
  assert.ok(R.segs.some(s => s.b.ev && s.b.ev.kind === 'mask'), 'a field behind the SLM');
  const D = scr('Focus: a ring off the axis');
  assert.ok(D && D.power > 0.9, 'and at the focus, ' + (D && D.power));
});

/* A hard edge is carried as the samples can hold it: Fresnel's fringes behind a straight edge and the focal pattern
   of N slits (Born and Wolf, 8.6 and 8.7) have their true amplitude, and the power is still the open area's. */
// the Fresnel integral of a Gaussian beam (waist w on the edge) past a half-plane, by the midpoint rule:
// |int_0^inf exp(-xi^2/w^2) exp(-i pi (x - xi)^2 / (lam z)) dxi|^2 / (lam z), times the beam's own profile along the edge
function edgeRef(x, z, w) {
  const zR = Math.PI * w * w / LAM, wz = w * Math.sqrt(1 + (z / zR) ** 2), h = 5e-4;
  let re = 0, im = 0;
  for (let xi = h / 2; xi < 4 * w; xi += h) { const a = Math.exp(-xi * xi / (w * w)), ph = -Math.PI * (x - xi) ** 2 / (LAM * z); re += a * Math.cos(ph); im += a * Math.sin(ph); }
  // 1 mW: across the edge the field's square on it is sqrt(2/pi)/w per mm, along it the free beam's peak sqrt(2/pi)/w_z
  return (re * re + im * im) * h * h / (LAM * z) * (2 / Math.PI) / (w * wz);
}

test('a straight edge through a beam: Fresnel’s fringes, and half the power', () => {
  const w = 3;
  for (const z of [500, 2000]) {
    const { R, seg } = run(bench('edge', [laser({ w0: w, width: 6 }), { type: 'stop', name: 'Edge', x: 0, y: 0, angle: 0, aperture: 0, outer: 25.4, shape: 'knife', side: 1 }, screen(z + 1, { length: 20 })]));
    const S = seg('Edge'), c = S.leg.cut(z), I0 = 2 / (Math.PI * w * w * (1 + (z / (Math.PI * w * w / LAM)) ** 2));
    assert.ok(Math.abs(S.leg.stats(0).power - 0.5) < 5e-4, 'half the light passes: ' + S.leg.stats(0).power);
    assert.ok(Math.abs(S.leg.stats(z).power - 0.5) < 5e-4, 'and is all still on the grid ' + z + ' mm on: ' + S.leg.stats(z).power);
    assert.equal(R.notes.steep.size + R.notes.coarse.size, 0, 'no flag');
    // from 2.5 fringe scales into the shadow to 2.5 into the light (the blade covers +y: into the light is -x here)
    const sc = Math.sqrt(LAM * z); let worst = 0, n = 0;
    for (let i = 0; i < c.x.length; i++) { const x = -c.x[i]; if (Math.abs(x) > 2.5 * sc) continue; worst = Math.max(worst, Math.abs(c.I[i] - edgeRef(x, z, w)) / I0); n++; }
    assert.ok(n > 40, 'sampled across the fringes: ' + n);
    assert.ok(worst < 0.004, z + ' mm: the fringes against Fresnel’s integral, largest difference / the free peak: ' + worst);
  }
});

test('one slit, and five: the focal peak is the open area’s transform, the pattern the slits’, the power the area’s', () => {
  const w = 4, a = 0.05, pitch = 0.2, f = 200;
  const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x < 0 ? -y : y; };
  // |sum over the slits of int exp(-xi^2/w^2) exp(-2 pi i x xi / (lam f))|^2, by the midpoint rule
  const amp = (x, n) => { let re = 0, im = 0; const K = 200; for (let s = 0; s < n; s++) { const c = (s - (n - 1) / 2) * pitch; for (let k = 0; k < K; k++) { const xi = c + ((k + 0.5) / K - 0.5) * a, g = Math.exp(-xi * xi / (w * w)) * a / K, ph = -2 * Math.PI * x * xi / (LAM * f); re += g * Math.cos(ph); im += g * Math.sin(ph); } } return re * re + im * im; };
  for (const n of [1, 5]) {
    const { seg, screen: scr } = run(bench('slits', [laser({ w0: w, width: 8 }),
      n === 1 ? { type: 'stop', name: 'Slits', x: 0, y: 0, angle: 0, aperture: a, outer: 25.4, shape: 'slit', height: 0 } : { type: 'stop', name: 'Slits', x: 0, y: 0, angle: 0, aperture: a, outer: 25.4, shape: 'comb', pitch, count: n, height: 0 },
      mask('-(sqrt(r^2+' + f * f + ')-' + f + ')/lambda', { name: 'Lens', x: 1 }), screen(1 + f, { name: 'Focus', length: 10, vectorFocus: 'off' })]));
    // the open area's power: each slit's share of the Gaussian across it
    let open = 0; for (let s = 0; s < n; s++) { const c = (s - (n - 1) / 2) * pitch; open += 0.5 * (erf(Math.SQRT2 * (c + a / 2) / w) - erf(Math.SQRT2 * (c - a / 2) / w)); }
    const P0 = seg('Slits').leg.stats(0).power;
    assert.ok(Math.abs(P0 / open - 1) < 1e-3, n + ' slit(s): the power behind them is the open area’s, ' + P0 + ' vs ' + open);
    const D = scr('Focus'), I0 = 2 / (LAM * f) ** 2 * amp(0, n);
    assert.ok(Math.abs(D.peak / I0 - 1) < 0.005, n + ' slit(s): the focal peak ' + D.peak + ' vs ' + I0);
    // the pattern out to three quarters of the envelope's first zero, against the transform, each to its own peak
    const c = D.cutX, pk = Math.max(...c.I); let worst = 0;
    for (let i = 0; i < c.x.length; i++) if (Math.abs(c.x[i]) < 0.75 * LAM * f / a) worst = Math.max(worst, Math.abs(c.I[i] / pk - amp(c.x[i], n) / amp(0, n)));
    assert.ok(worst < 0.006, n + ' slit(s): the pattern against the transform, largest difference / peak: ' + worst);
  }
});
