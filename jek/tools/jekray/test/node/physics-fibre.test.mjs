/* Physics regressions: a PM fibre's Jones matrix keeps power, a fibre amplifier's saturated
   output stays near its rating, Boyd-Kleinman's best period agrees with the given-period
   figure and is shorter than the plane-wave one, and a cell's field-free lines saturate as the
   Zeeman lines do as the field goes to nothing. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../../src/core/constants.js';                              // first, before any stand-in: Node is not a page
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const STATE = await import('../../src/state/project.js');
const { loadProject } = await import('../../src/state/elements.js');
await import('../../src/engines/trace.js');
const FIBRE = await import('../../src/engines/fibre.js');
const { nlcConvert } = await import('../../src/core/nlc.js');
const { atomLines } = await import('../../src/core/traps.js');
const { zeemanLines } = await import('../../src/core/zeeman.js');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' vs ' + b);

// fibreJones is the module's own: taken from its source with the matrix helpers it uses
const src = fs.readFileSync(new URL('../../src/engines/fibre.js', import.meta.url), 'utf8');
const grab = re => { const m = src.match(re); assert.ok(m, 'found ' + re); return m[0]; };
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const { fibreJones, J2 } = new Function('cmul', 'deg', [grab(/const ci = \{[^\n]*\n/), grab(/const J2 = \{[\s\S]*?\n\};\n/),
  grab(/function fibreJones[\s\S]*?\n\}\n/), 'return { fibreJones, J2 };'].join('\n'))(cmul, Math.PI / 180);

test('PM fibre: unitary at any length, wavelength and input, cross-coupling c^2', () => {
  let lo = Infinity, hi = 0;
  for (let len = 0.5; len < 3; len += 0.0137) for (const nm of [1530, 1550, 1570]) for (const key of [0, 30]) {
    const M = fibreJones({ ftype: 'pm', len, beat: 3, per: 25, key }, nm);
    for (const E of [[1, 0, 0, 0], [Math.SQRT1_2, 0, Math.SQRT1_2, 0], [Math.SQRT1_2, 0, 0, Math.SQRT1_2]]) {
      const o = J2.app(M, E), P = o.reduce((s, v) => s + v * v, 0);
      lo = Math.min(lo, P); hi = Math.max(hi, P);
    }
  }
  near(lo, 1, 1e-12, 'min power'); near(hi, 1, 1e-12, 'max power');
  const o = J2.app(fibreJones({ ftype: 'pm', len: 1, beat: 3, per: 25, key: 0 }, 1550), [1, 0, 0, 0]);
  near(o[2] ** 2 + o[3] ** 2, Math.pow(10, -2.5), 1e-12, 'cross-coupled power');
});

test('fibre amplifier: a hard drive adds no more than its rated saturated output', () => {
  const demo = JSON.parse(fs.readFileSync(new URL('../../../demos/fibre-amplifier.jekray', import.meta.url), 'utf8'));
  const run = (inDbm, g0, psat) => {
    const d = structuredClone(demo);
    Object.assign(d.elements.find(e => e.kind === 'amp'), { g0, psat });
    d.elements.find(e => e.kind === 'laser').power = Math.pow(10, inDbm / 10);                  // mW
    loadProject(d);
    const net = FIBRE.fibreNetCached(), A = STATE.project.elements.find(e => e.kind === 'amp');
    const Pin = FIBRE.netPower(net.inn.get(FIBRE.pkey(A.id, 0)), net.keys) * 1e-3;    // W
    return { Pin, G: FIBRE.ampGain(A, A.centre) };
  };
  // the laser's power, dBm (the demo loses 4 dB on the way to the amplifier)
  for (const [inDbm, g0, psat] of [[21, 20, 17], [10, 25, 17], [0, 30, 10], [25, 20, 17]]) {
    const { Pin, G } = run(inDbm, g0, psat), Ps = Math.pow(10, psat / 10) * 1e-3;
    assert.ok(G >= 1 && G <= Math.pow(10, g0 / 10), 'gain in range ' + G);
    assert.ok(G * Pin - Pin <= Ps * (1 + 1e-6), 'added ' + (G * Pin - Pin) + ' W, rated ' + Ps);
    // the homogeneous form itself, Ps = Psat / ln G0
    const G0 = Math.pow(10, g0 / 10);
    near(Math.log(G), Math.log(G0) - (G - 1) * Pin / (Ps / Math.log(G0)), 1e-6, 'implicit gain');
  }
  // 20 dB, 17 dBm rated, 17 dBm in: the old G = G0 / (1 + G Pin / Psat) gave 26.8 dBm out
  const { Pin, G } = run(21, 20, 17);
  near(10 * Math.log10(Pin * 1e3), 17, 0.1, 'input');
  assert.ok(10 * Math.log10(G * Pin * 1e3) < 20.5, 'output ' + 10 * Math.log10(G * Pin * 1e3) + ' dBm');
  const small = run(-40, 20, 17);
  near(10 * Math.log10(small.G), 20, 0.01, 'small signal');
});

test('SHG: best period shorter than the plane-wave one, and the same h when given', () => {
  const b = nlcConvert({ material: 'ppln', temp: 25, nlLen: 20, period: 0 }, 1, 1064, [0, 1.6], 1);
  assert.ok(b.period < b.periodPW, b.period + ' < ' + b.periodPW);
  assert.ok(b.sigma > 0.4 && b.sigma < 0.7, 'sigma ' + b.sigma);
  const g = nlcConvert({ material: 'ppln', temp: 25, nlLen: 20, period: b.period }, 1, 1064, [0, 1.6], 1);
  near(g.h, b.h, 1e-4, 'h at the best period');
  near(g.sigma, b.sigma, 1e-6, 'sigma at the best period');
  const m = nlcConvert({ material: 'ppln', temp: 25, nlLen: 20, period: 2 * b.periodPW - b.period }, 1, 1064, [0, 1.6], 1);
  assert.ok(m.h < 0.5 * b.h, 'mirrored period is far off ' + m.h);
  // optimal focusing, xi = 2.84: h = 1.068
  const o = nlcConvert({ material: 'ppln', temp: 25, nlLen: 20, period: 0 }, 1, 1064, [0, 10 / 2.84 / b.n1], 1);
  near(o.xi, 2.84, 1e-6); near(o.h, 1.068, 2e-3, 'BK optimum');
});

test('cell lines: field-free saturation is the Zeeman model at B -> 0, line by line', () => {
  for (const atom of ['Rb', 'Cs', 'K']) for (const line of ['D1', 'D2']) {
    const z = zeemanLines(atom, line, 1e-4).filter(l => l.q === 1);
    const all = atomLines(atom, line);
    // 41K's D2 F' = 0 and 1, 0.01 MHz apart, are held against their components together in physics-k41-asph
    for (const l of all.filter(l => !all.some(o => o !== l && o.iso === l.iso && Math.abs(o.nu - l.nu) < 0.5e6))) {
      const c = z.filter(m => m.iso === l.iso && Math.abs(m.nu - l.nu) < 2e6);
      const kz = c.reduce((s, m) => s + m.S * m.S / m.Isat, 0) / c.reduce((s, m) => s + m.S, 0);
      near(l.S / l.Isat / kz, 1, 2e-3, atom + ' ' + line + ' ' + l.iso + ' ' + l.Fg + '->' + l.Fe);
    }
  }
  // Rb87 D1, strength-weighted: was 0.039 m^2/W against the Zeeman model's 0.021
  const a = atomLines('Rb87', 'D1'), w = a.reduce((s, l) => s + l.share * l.S * l.S / l.Isat, 0) / a.reduce((s, l) => s + l.share * l.S, 0);
  near(w, 0.0209, 3e-4, 'Rb87 D1');
  near(a[0].Isat0 / 10, 1.496, 0.01, 'cycling Isat0, mW/cm^2');
});
