/* Physics regressions: natural potassium is 39K and 41K (Tiecke's abundances), so its D lines'
   optical depth carries 41K's share 236 MHz up; 41K's field-free lines are the Zeeman model's
   as the field goes to nothing, and its ground state splits as Breit and Rabi have it; and a
   general asphere's root search finds a grazing ray's double crossing of a bump that lies
   within one of its 24 sample steps, at the first crossing along the ray. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/core/constants.js';                              // first, before any stand-in: Node is not a page
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
await import('../../src/state/project.js');
const TRACE = await import('../../src/engines/trace.js');
const { atomLines, trapAlpha } = await import('../../src/core/traps.js');
const { zeemanLines, zeemanStates, MU_B } = await import('../../src/core/zeeman.js');
const { ATOMS, ATOM_ISO } = await import('../../src/core/cells.js');
const { makeSurf, sagFn } = await import('../../src/core/geometry.js');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' vs ' + b);

test('natural potassium: 39K and 41K, the D2 absorption strength-weighted carrying 41K’s share 236 MHz up', () => {
  assert.deepEqual(ATOMS.K.iso.map(i => i[0]), ['K39', 'K41']);
  near(ATOMS.K.iso[1][1], 0.067302, 1e-9, '41K abundance');
  for (const line of ['D2', 'D1']) {
    const a = atomLines('K', line), w = l => l.share * l.S * l.sInt;
    const all = a.reduce((s, l) => s + w(l), 0), k41 = a.filter(l => l.iso === 'K41');
    assert.ok(k41.length === (line === 'D2' ? 6 : 4), line + ': 41K lines ' + k41.length);
    // its share of the line's integrated optical depth is its abundance among the two (40K left out)
    near(k41.reduce((s, l) => s + w(l), 0) / all, 0.067302 / (0.932581 + 0.067302), 1e-6, line + ' 41K share');
    // 3.4% more absorption over the whole line than 39K alone gave (the omitted 41K's 6.73 / 93.26)
    near(all / a.filter(l => l.iso === 'K39').reduce((s, l) => s + w(l), 0), 1.072168, 1e-5, line + ' natural over 39K alone');
    // the strength-weighted centroid of 41K's hyperfine lines sits the isotope shift above 39K's
    const c = iso => { const L = a.filter(l => l.iso === iso); return L.reduce((s, l) => s + w(l) * l.nu, 0) / L.reduce((s, l) => s + w(l), 0); };
    near((c('K41') - c('K39')) / 1e6, line === 'D2' ? 236.18 : 235.489, 0.01, line + ' isotope shift, MHz');
  }
  // enriched cells of either isotope
  assert.deepEqual(ATOMS.K41.iso, [['K41', 1]]);
  assert.ok(atomLines('K41', 'D2').every(l => l.iso === 'K41'));
});

test('41K: field-free saturation is the Zeeman model at B -> 0, line by line', () => {
  // 41K's 4P3/2 F' = 0 and 1 lie 0.01 MHz apart (A 3.363, B 3.351 MHz), too close for their Zeeman
  // components to be told apart by frequency: lines that close are held against them together, at a
  // field (1 uG) weak enough that it hardly mixes the two
  for (const atom of ['K41', 'K']) for (const line of ['D1', 'D2']) {
    const z = zeemanLines(atom, line, 1e-6).filter(l => l.q === 1), a = atomLines(atom, line), seen = new Set();
    for (const l of a) {
      if (seen.has(l)) continue;
      const grp = a.filter(o => o.iso === l.iso && Math.abs(o.nu - l.nu) < 0.5e6);
      grp.forEach(o => seen.add(o));
      const c = z.filter(m => m.iso === l.iso && grp.some(o => Math.abs(m.nu - o.nu) < 2e6));
      assert.ok(c.length, atom + ' ' + line + ' ' + l.Fg + '->' + l.Fe + ': Zeeman components');
      const kz = c.reduce((s, m) => s + m.S * m.S / m.Isat, 0) / c.reduce((s, m) => s + m.S, 0);
      const kf = grp.reduce((s, o) => s + o.S * o.S / o.Isat, 0) / grp.reduce((s, o) => s + o.S, 0);
      near(kf / kz, 1, 2e-3, atom + ' ' + line + ' ' + l.iso + ' ' + l.Fg + '->' + grp.map(o => o.Fe).join(','));
      // and the components carry the lines' strength, each ground state's averaging theirs
      near(c.reduce((s, m) => s + m.S, 0) / (2 * l.Fg + 1), grp.reduce((s, o) => s + o.S, 0), 2e-3, atom + ' ' + line + ' strength');
    }
  }
});

test('41K ground state: Breit-Rabi in a field, and a dipole trap’s polarisability like 39K’s', () => {
  // the model's ground-state g_J is the free electron's (it takes g_L, g_S as they are)
  const dE = 2 * ATOM_ISO.K41.Ag, gJ = 2.00231930436, gI = -0.00007790600, I = 1.5;
  near(dE, 254.0138704, 1e-6, 'hyperfine splitting, MHz');
  for (const B of [0, 30, 300, 3000]) {
    const x = (gJ - gI) * MU_B * B / dE;
    for (const st of zeemanStates('K41', 'S', B)) {
      const m = st.mF, base = -dE / (2 * (2 * I + 1)) + gI * MU_B * m * B;
      // the stretched states, one of each mF = +-2, and the two of each other mF
      const want = Math.abs(Math.abs(m) - (I + 0.5)) < 1e-9 ? [base + dE / 2 * (1 + Math.sign(m) * x)]
        : [-1, 1].map(pm => base + pm * dE / 2 * Math.sqrt(1 + 4 * m * x / (2 * I + 1) + x * x));
      assert.ok(want.some(v => Math.abs(v - st.E) < 1e-6 * (1 + Math.abs(v))), 'B ' + B + ' mF ' + m + ': ' + st.E + ' vs ' + want);
    }
  }
  const [r41] = trapAlpha('K41', 1064, 'avg'), [r39] = trapAlpha('K39', 1064, 'avg');
  near(r41 / r39, 1, 1e-4, '1064 nm polarisability, 41K over 39K');
});

/* a gull-wing face: sag = a4 y^4 + a6 y^6 rising to a crest of 0.08 mm at |y| = 7 and falling
   away, a ray along it 1 um under the crest crossing it twice 0.45 mm apart on each side */
test('asphere: a grazing ray’s double crossing of a bump within one sample step is hit, at the first crossing', () => {
  const a4 = 1e-4, a6 = -2 * a4 / (3 * 49), semi = 10;
  const s = makeSurf({ id: 'L', type: 'lens' }, 0, 0, 0, 0, [a4, a6], semi, {});
  assert.ok(!s.flat && !s.conicOnly, 'a general asphere');
  const crest = a4 * 7 ** 4 + a6 * 7 ** 6, px = crest - 1e-3, py = -12;
  // where it truly first meets the face: a fine scan along the ray
  const f = y => px - sagFn(s, y);
  let y1 = null;
  for (let y = -semi; y < semi; y += 1e-4) if (f(y) * f(y + 1e-4) <= 0) { y1 = y; break; }
  near(y1, -7 - Math.sqrt(2e-3 / 0.0392), 0.01, 'the crossing the scan finds');
  // the 24 samples alone step over it (each crossing pair inside one step), as the search did
  const t0 = -semi - py, t1 = semi - py;
  assert.equal(TRACE.firstRoot(t => px - sagFn(s, py + t), t0, t1, 0), null, 'no sign change at the 24 samples');
  // the search now finds it, in the plane and in 3D (a ray just above the plane)
  const t = TRACE.intersectSurf(s, px, py, 0, 1, 1e-6);
  assert.ok(t !== null, 'hit in the plane');
  near(py + t, y1, 1e-3, 'at the first crossing (y)');
  near(px - sagFn(s, py + t), 0, 1e-9, 'on the face');
  const t3 = TRACE.intersect3(s, px, py, 0.05, 0, 1, 0, 1e-6);
  assert.ok(t3 !== null, 'hit in 3D');
  const y3 = py + t3;
  near(px - (a4 * (y3 * y3 + 0.0025) ** 2 + a6 * (y3 * y3 + 0.0025) ** 3), 0, 1e-9, '3D on the face');
  assert.ok(y3 < -6.9 && y3 > -7.4, '3D first crossing on the near side: ' + y3);
  // a ray over the crest (1 um clear) still misses
  assert.equal(TRACE.intersectSurf(s, crest + 1e-3, py, 0, 1, 1e-6), null, 'over the crest');
  // and a plain crossing is where it was
  const tp = TRACE.intersectSurf(s, -1, 0.5, 1, 0.02, 1e-6);
  near(-1 + tp - sagFn(s, 0.5 + 0.02 * tp), 0, 1e-9, 'an ordinary ray on the face');
});
