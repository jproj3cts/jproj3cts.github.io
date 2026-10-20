/* Cavity physics against closed forms: a loop's transverse mode spacing when a part is tipped
   (its 4x4 round trip) as when it is not (its 2x2 planes); its free spectral range from the
   group index, not the phase index; J_n at large argument; an EOM's sidebands at a deep drive. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../../src/state/elements.js');
const TRACE = await import('../../src/engines/trace.js');
const { findCavities } = await import('../../src/engines/cavity.js');
const { refIndex } = await import('../../src/core/glass.js');
const { besselJn } = await import('../../src/core/special.js');
const { eomSidebands } = await import('../../src/core/modulators.js');

const bench = elements => ({
  format: 'jekray', version: 1, name: 't', tab: 'b1', fibres: [], minPower: 0.001, maxBounces: 40,
  benches: [{ id: 'b1', name: 'Bench 1', view: { cx: 0, cy: 0, scale: 4 } }], elements,
});
const cavities = elements => { loadProject(bench(elements)); TRACE.setLastTraceKey(null); TRACE.traceScene(); return findCavities(); };
const laser = (nm, w0) => ({ id: 's', type: 'source', name: 'Laser', x: -60, y: 0, angle: 0, bench: 'b1', wavelength: nm, gauss: true, w0, z0: 0, rays: 1, power: 1, width: 1, divergence: 0, sweeps: {} });
// two mirrors R apart by 150 mm, the first tipped out of the plane by tip degrees
const twoMirror = (R, tip) => cavities([
  laser(1064, 0.3),
  { id: 'm1', type: 'mirror', name: 'M1', x: 0, y: 0, angle: 0, length: 25, R, reflect: 95, ...(tip ? { tip } : {}) },
  { id: 'm2', type: 'mirror', name: 'M2', x: 150, y: 0, angle: 180, length: 25, R, reflect: 99 },
]);

test('a tipped two-mirror cavity keeps its untipped transverse mode spacing', () => {
  for (const R of [100, 200]) {
    // g = 1 - L / R: the round trip's Gouy phase 2 acos(g), the spacing that share of an FSR
    const g = 1 - 150 / R, flat = twoMirror(R, 0)[0];
    assert.ok(flat && !flat.M4, 'untipped: the 2x2 planes');
    const want = 2 * Math.acos(g) / (2 * Math.PI);
    assert.ok(Math.abs(flat.tms.x / flat.fsr - want) < 1e-6, 'untipped R ' + R + ': ' + flat.tms.x / flat.fsr + ' for ' + want);
    for (const tip of [0.001, 0.01]) {
      const c = twoMirror(R, tip)[0];
      assert.ok(c && c.M4, 'tipped: the 4x4 round trip');
      for (const ax of ['x', 'y']) {
        assert.ok(Math.abs(c.gouy[ax] - flat.gouy[ax]) < 1e-5, `R ${R} tip ${tip} ${ax}: Gouy ${c.gouy[ax]} for ${flat.gouy[ax]}`);
        assert.ok(Math.abs(c.tms[ax] / c.fsr - want) < 1e-5, `R ${R} tip ${tip} ${ax}: ${c.tms[ax] / c.fsr} FSR for ${want}`);
      }
    }
  }
  // the symmetric g = -0.5 cavity: 2/3 of a free spectral range, not 1/3
  const c = twoMirror(100, 0.001)[0];
  assert.ok(Math.abs(c.tms.x / c.fsr - 2 / 3) < 1e-6);
});

test('a solid etalon’s free spectral range is set by its group index', () => {
  const t = 3, nm = 800, glass = 'N-SF66';
  const [c] = cavities([
    laser(nm, 0.5),
    { id: 'l', type: 'lens', name: 'Etalon', x: 0, y: 0, angle: 0, bench: 'b1', diameter: 25, gaps: [t], materials: [{ glass, abs: 0 }], sweeps: {},
      surfaces: [{ R: 200, k: 0, a2: 0, A: [], semi: null, coat: { mode: 'band', R: 95, lo: 700, hi: 900 } }, { R: -200, k: 0, a2: 0, A: [], semi: null, coat: { mode: 'band', R: 95, lo: 700, hi: 900 } }] },
    { id: 'sc', type: 'screen', name: 'Screen', x: 120, y: 0, angle: 0, bench: 'b1', length: 25, sweeps: {} },
  ]);
  assert.ok(c, 'the coated window is a cavity');
  const at = l => refIndex({ glass }, l), n = at(nm), ng = n - nm * (at(nm + 0.05) - at(nm - 0.05)) / 0.1;
  assert.ok(ng > n * 1.03, 'a dispersive glass');
  assert.ok(Math.abs(c.Lopt / c.Lg - n / ng) < 1e-6, 'Lg is the group path: ' + c.Lg / c.Lopt + ' for ' + ng / n);
  assert.ok(Math.abs(c.fsr * c.Lg * 1e-3 / 299792458 - 1) < 1e-12, 'FSR = c / Lg');
  assert.ok(Math.abs(c.fsr / (299792458 / (c.Lopt * 1e-3)) - n / ng) < 1e-6, 'below c / Lopt by n / ng');
});

// J_n(x) = (1/2pi) sum over a period of cos(n t - x sin t): the trapezoid rule is exact to
// rounding here, its integrand periodic and band-limited well inside 4096 points
const Jref = (n, x) => { const N = 4096; let s = 0; for (let i = 0; i < N; i++) { const t = 2 * Math.PI * i / N; s += Math.cos(n * t - x * Math.sin(t)); } return s / N; };

test('J_n holds at large argument and high order', () => {
  assert.ok(Math.abs(besselJn(10, 40) - 0.1193833627822610) < 1e-12, 'J10(40) ' + besselJn(10, 40));
  assert.ok(Math.abs(besselJn(0, 50) - 0.05581232766925182) < 1e-12, 'J0(50) ' + besselJn(0, 50));
  let worst = 0;
  for (let n = 0; n <= 60; n += 3) for (let x = -120; x <= 120; x += 1.37) worst = Math.max(worst, Math.abs(besselJn(n, x) - Jref(n, x)));
  assert.ok(worst < 1e-10, 'worst ' + worst);
  // deep in the tail, relative to the leading term (x/2)^n / n!
  let lead = 1; for (let k = 1; k <= 30; k++) lead *= 0.5 / k;
  assert.ok(Math.abs(besselJn(30, 1) / lead - 1) < 1 / 31 + 1e-3);
});

test('an EOM driven deep keeps its sidebands’ power', () => {
  for (const beta of [1, 40, 100]) {
    const sb = eomSidebands({ beta, emode: 'phase', loss: 0, bias: 0 });
    const P = sb.reduce((a, [, c]) => a + c[0] * c[0] + c[1] * c[1], 0);
    assert.ok(Math.abs(P - 1) < 1e-9, 'beta ' + beta + ': power ' + P);
  }
});
