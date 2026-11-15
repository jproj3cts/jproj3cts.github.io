/* A particle inside a degenerate cavity, solved in the pupil (engines/scatter-pupil.js), against an independent reference
   (validation/scripts/scatter_cavity_degen.py: exact rays on the mirrors, the dipole's returns summed ray by ray and
   checked against the closed form for the ideal concentric cavity, the Mie sphere on a grid of directions solved by GMRES;
   ref/scatter-cavity-degen.json). The tolerances were written before the first run (the report's "A particle inside a
   degenerate cavity"): D1 the field at the particle with its returns within 2 % of the reference's change from the empty
   cavity's, D2 the scattered power and extinction within 3 % (D5: 5 % for the cavity near degeneracy), D3 the detector
   behind the far mirror within 10 % of the reference's change.
   The cavity's one-pass map is the bench's own tracer's (engines/scatter-pupil-map.js). The mirror code the solve first
   had (exact rays on the two surfaces, written for it alone) is kept here only, as the thing the map is checked against,
   direction by direction, for a particle beside the axis. */
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
  ['confocal-across', 'rayleigh', 'dipole'], ['confocal-across', 'mie', 'mie']]) {
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

/* D3: the detector behind the far mirror, with the particle and without */
for (const [name, model, rn] of [['concentric', 'rayleigh', 'dipole'], ['concentric', 'mie', 'mie'], ['confocal', 'rayleigh', 'dipole'], ['confocal', 'mie', 'mie']]) {
  test(name + ', ' + model + ': the detector behind the far mirror changes as the reference\'s does', async () => {
    const E = await engine(), B0 = BENCH[name], R = REF[name][rn], det = { id: 'through', type: 'detector', name: 'Through', x: 30, y: 0, angle: 180, length: 30 };
    const read = () => E.FF.detectorReading(getEl('through')).mw;
    (await openBench(doc([LASER, ...mirrors(B0.kind), det]))).trace();
    const off = read();
    (await openBench(doc([LASER, ...mirrors(B0.kind), det, { id: 'p', type: 'particle', name: 'P', x: 0, y: 0, angle: 90, trapMat: 'Fused silica', trapR: model === 'rayleigh' ? 50 : 150, trapMed: 'vacuum', scatModel: model }]))).trace();
    const on = read(), ch = on / off - 1;
    say(name, model, 'detector change', ch.toExponential(4), 'reference', R.through_change.toExponential(4), 'off by', (ch / R.through_change - 1).toExponential(2));
    assert.ok(Math.abs(ch - R.through_change) <= 0.1 * Math.abs(R.through_change), 'the detector\'s change ' + ch + ' against ' + R.through_change);
  });
}

/* The traced map against exact rays on the mirrors (the solve's first mirror code, kept for this): a confocal cavity, the
   particle 2 um off its axis, each grid direction followed three returns. The map is interpolated between its cells and
   carried across the particle's plane by its own differences; the rays are traced whole. */
test('the tracer\'s map against exact rays on the mirrors, a particle beside a confocal cavity\'s axis', async () => {
  const PM = await import('../../src/engines/scatter-pupil-map.js'), PP = await import('../../src/engines/scatter-pupil.js');
  const add3 = (a, b, s = 1) => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = a => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
  const [m1, m2] = mirrors('confocal');
  (await openBench(doc([LASER, m1, m2, { id: 'p', type: 'particle', name: 'P', x: 0, y: 2e-3, angle: 90, trapMat: 'Fused silica', trapR: 50, trapMed: 'vacuum', scatModel: 'rayleigh' }]))).trace();
  const map = PM.PUP_MAPS.get('p'), P = { map, dir: map.axis, ex: map.ex, ey: map.ey }, G = PP.pupGrid(P), C = map.C, k = 2 * Math.PI / 1.55e-3;
  assert.equal(map.pattern, 2);
  // a mirror as its part has it: vertex V, facing n, vertex curvature c, conic k, rim a
  const mir = el => { const th = el.angle * Math.PI / 180; return { V: [el.x, el.y, C[2]], n: [Math.cos(th), Math.sin(th), 0], c: 1 / el.R, k: el.k || 0, a: 0.5 * el.length, Rp: el.reflect / 100 }; };
  const sag = (m, r2) => m.c * r2 / (1 + Math.sqrt(Math.max(0, 1 - (1 + m.k) * m.c * m.c * r2))), dsag = (m, r2) => m.c / Math.sqrt(Math.max(1e-30, 1 - (1 + m.k) * m.c * m.c * r2));
  const hit = (m, P0, u) => {
    const un = dot(u, m.n); let t = dot(add3(m.V, P0, -1), m.n) / un;
    for (let it = 0; it < 50; it++) { const D = add3(add3(P0, u, t), m.V, -1), h = dot(D, m.n), Rr = add3(D, m.n, -h), r2 = dot(Rr, Rr), dt = (h - sag(m, r2)) / (un - dsag(m, r2) * dot(Rr, u)); t -= dt; if (Math.abs(dt) < 1e-13) break; }
    const X = add3(P0, u, t), D = add3(X, m.V, -1), h = dot(D, m.n), Rr = add3(D, m.n, -h), r2 = dot(Rr, Rr);
    return t > 1e-9 && r2 <= m.a * m.a ? { t, X, N: unit(add3(m.n, Rr, -dsag(m, r2))) } : null;
  };
  const M = [mir(m1), mir(m2)];
  const rays = (u, refl) => { let p = C, d = u, ell = 0, at = dot(d, M[1].n) < 0 ? 1 : 0; for (let r = 0; r < refl; r++) { const H = hit(M[at], p, d); if (!H) return null; ell += H.t; p = H.X; d = unit(add3(d, H.N, -2 * dot(d, H.N))); at = 1 - at; } const t = dot(add3(C, p, -1), map.axis) / dot(d, map.axis); return { d, q: add3(add3(p, d, t), C, -1), ell: ell + t }; };
  const worst = { dir: 0, q: 0, phase: 0, dirIn: 0, phaseIn: 0 };
  let n = 0;
  for (let i = 0; i < G.N; i++) {
    const u = [G.dirs[3 * i], G.dirs[3 * i + 1], G.dirs[3 * i + 2]], inner = Math.hypot(dot(u, map.ex), dot(u, map.ey)) < 0.2;
    let d = u, q = [0, 0, 0], ell = 0;
    for (let ret = 1; ret <= 3; ret++) {
      const T = rays(u, 2 * ret), A = PP.pupMapAt(P, G, d, q);
      if (!T || !A) break;
      ell += A.ell; d = A.d; q = A.q; n++;
      const ed = Math.hypot(...add3(A.d, T.d, -1)), ep = Math.abs(k * ((ell - dot(A.d, A.q)) - (T.ell - dot(T.d, T.q))));
      worst.dir = Math.max(worst.dir, ed); worst.q = Math.max(worst.q, Math.hypot(...add3(A.q, T.q, -1))); worst.phase = Math.max(worst.phase, ep);
      if (inner) { worst.dirIn = Math.max(worst.dirIn, ed); worst.phaseIn = Math.max(worst.phaseIn, ep); }
    }
  }
  say('map against exact rays:', n, 'returns; direction', worst.dir.toExponential(2), 'crossing (mm)', worst.q.toExponential(2), 'phase (rad)', worst.phase.toExponential(2), '; away from the rim: direction', worst.dirIn.toExponential(2), 'phase', worst.phaseIn.toExponential(2));
  assert.ok(n > 15000, 'returns compared: ' + n);
  // away from the rim the map is the rays' to rounding; in the cells at the rim (the map carried out to it) to a thousandth of a radian
  assert.ok(worst.dirIn < 1e-8 && worst.phaseIn < 1e-6, JSON.stringify(worst));
  assert.ok(worst.dir < 2e-4 && worst.q < 1e-8 && worst.phase < 1e-3, JSON.stringify(worst));
});

/* the returns are followed once for a cavity and kept: a solve with only the particle changed takes them as they are */
test('the chains are kept while the cavity stays as it is, and give the same answer', async () => {
  const PM = await import('../../src/engines/scatter-pupil-map.js');
  const B0 = BENCH.confocal, part = r => ({ id: 'p', type: 'particle', name: 'P', x: 0, y: 0, angle: 90, trapMat: 'Fused silica', trapR: r, trapMed: 'vacuum', scatModel: 'rayleigh' });
  const B = await openBench(doc([LASER, ...mirrors(B0.kind), part(50)]));
  B.trace();
  const S1 = SC.scatterNow(getEl('p')), map1 = PM.PUP_MAPS.get('p'), chains1 = map1.chains.S;
  assert.ok(chains1 && chains1.returns > 1e6);
  getEl('p').trapR = 60; B.trace();
  const S2 = SC.scatterNow(getEl('p'));
  assert.ok(S2.cav.chainsKept && PM.PUP_MAPS.get('p') === map1 && map1.chains.S === chains1, 'the chains were followed again for a particle of another size');
  assert.ok(Math.abs((S2.cav.E2ratio - 1) / (S1.cav.E2ratio - 1) - 1) > 0.1, 'a bigger particle changes the light more');
  getEl('p').trapR = 50; B.trace();
  const S3 = SC.scatterNow(getEl('p'));
  assert.ok(map1.chains.S === chains1 && Math.abs(S3.cav.E2ratio - S1.cav.E2ratio) < 1e-13 && Math.abs(S3.Psca / S1.Psca - 1) < 1e-12, S3.cav.E2ratio + ' against ' + S1.cav.E2ratio);
  // a mirror moved: its map is traced again, and the returns followed again
  getEl('m2').x = 9.998; B.trace();
  const S4 = SC.scatterNow(getEl('p')), map4 = PM.PUP_MAPS.get('p');
  assert.ok(map4 !== map1 && (!map4.chains || map4.chains.S !== chains1), 'a moved mirror kept the old map or its chains');
  void S4;
});
