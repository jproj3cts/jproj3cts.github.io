import { test } from 'node:test';
import assert from 'node:assert/strict';

/* One face's amplitudes (core/face-pol.js), the numbers the bench's rays, its field, the lens designer and the RF
   designer all take: against Fresnel, energy, the parity convention, total internal reflection and the closed forms */
const FP = await import('../../src/core/face-pol.js');
const C = await import('../../src/core/coatings.js');
const a2 = a => a[0] * a[0] + a[1] * a[1];
const near = (a, b, e) => Math.hypot(a[0] - b[0], a[1] - b[1]) < (e || 1e-12);
const stack = layers => ({ mode: 'stack', layers });

test('a bare face is Fresnel’s, its transmission normalised to power: |r|² + |t|² = 1', () => {
  for (const [n1, n2] of [[1, 1.5], [1.5, 1], [1, 2.4]]) for (const deg of [0, 15, 30, 40]) {
    const ci = Math.cos(deg * Math.PI / 180), F = FP.faceAmps({}, n1, n2, ci, 550);
    if (F.tir) continue;
    const ct = Math.sqrt(1 - (n1 / n2) ** 2 * (1 - ci * ci)), rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
    assert.ok(near(F.rs, [rs, 0]), 'rs');
    assert.ok(Math.abs(a2(F.rs) + a2(F.ts) - 1) < 1e-12 && Math.abs(a2(F.rp) + a2(F.tp) - 1) < 1e-12, n1 + '→' + n2 + ' ' + deg);
  }
});

test('the parity convention: r_p = r_s square on, bare or coated, and a layer of nothing is a bare face', () => {
  const L = C.coatPreset('vcoat', 550);
  for (const coat of [null, stack(L), stack(C.coatPreset('hr', 550))]) {
    const F = FP.faceAmps({ coat }, 1, 1.52, 1, 550);
    assert.ok(near(F.rs, F.rp) && near(F.ts, F.tp), JSON.stringify(F));
  }
  for (const deg of [0, 25, 50]) {
    const ci = Math.cos(deg * Math.PI / 180), B = FP.faceAmps({}, 1, 1.6, ci, 633), Z = FP.faceAmps({ coat: stack([{ n: 1.6, d: 0 }]) }, 1, 1.6, ci, 633);
    for (const k of ['rs', 'rp', 'ts', 'tp']) assert.ok(near(B[k], Z[k]), k + ' at ' + deg + '°');
  }
});

test('a coated face passes what it does not reflect, with its own phase, s and p apart at a slant', () => {
  const F = FP.faceAmps({ coat: stack(C.coatPreset('bs5050', 550)) }, 1, 1.52, Math.cos(45 * Math.PI / 180), 550);
  assert.ok(Math.abs(a2(F.rs) + a2(F.ts) - 1) < 1e-12 && Math.abs(a2(F.rp) + a2(F.tp) - 1) < 1e-12);
  const dph = Math.atan2(F.tp[1], F.tp[0]) - Math.atan2(F.ts[1], F.ts[0]);
  assert.ok(Math.abs(Math.sin(dph)) > 1e-3, 'the stack retards p against s on the way through: ' + dph);
});

test('total internal reflection returns everything, each polarisation with its own phase', () => {
  const F = FP.faceAmps({}, 1.5, 1, Math.cos(60 * Math.PI / 180), 550);
  assert.ok(F.tir && Math.abs(a2(F.rs) - 1) < 1e-12 && Math.abs(a2(F.rp) - 1) < 1e-12 && a2(F.ts) === 0 && a2(F.tp) === 0);
});

test('a film splitter, a band coating and a mirror as the tracer has always taken them', () => {
  const S = FP.faceAmps({ kind: 'split', Rs: 0.6, Rp: 0.4 }, 1, 1, 1, 550);
  assert.ok(near(S.rs, [0, Math.sqrt(0.6)]) && near(S.tp, [Math.sqrt(0.6), 0]));
  const band = { mode: 'band', lo: 500, hi: 600, R: 99 };
  assert.ok(near(FP.faceAmps({ coat: band }, 1, 1.5, 1, 550).rs, [0, Math.sqrt(0.99)]) && near(FP.faceAmps({ coat: band }, 1, 1.5, 1, 700).rs, [-0.2, 0]));
  const M = FP.mirrorAmps(0.9, false), B = FP.mirrorAmps(0.9, true);
  assert.ok(near(M.rs, [-Math.sqrt(0.9), 0]) && near(M.rp, M.rs) && near(B.rs, [Math.sqrt(0.9), 0]) && near(M.ts, [Math.sqrt(0.1), 0]));
});

test('square on, a quarter-wave matching layer of √n reflects nothing at its frequency and a little away from it', () => {
  const n = 1.643, nm = 12.5e6, L = [{ n: Math.sqrt(n), d: nm / (4 * Math.sqrt(n)) }];
  assert.ok(FP.faceRNormal(1, n, nm, stack(L)) < 1e-20);
  assert.ok(Math.abs(FP.faceRNormal(1, n, nm, null) - ((n - 1) / (n + 1)) ** 2) < 1e-15);
  // the single layer's closed form, away from its design
  const lam = nm * 1.3, r1 = (1 - L[0].n) / (1 + L[0].n), r2 = (L[0].n - n) / (L[0].n + n), c = Math.cos(4 * Math.PI * L[0].n * L[0].d / lam);
  const want = (r1 * r1 + r2 * r2 + 2 * r1 * r2 * c) / (1 + r1 * r1 * r2 * r2 + 2 * r1 * r2 * c);
  assert.ok(Math.abs(FP.faceRNormal(1, n, lam, stack(L)) - want) < 1e-14, FP.faceRNormal(1, n, lam, stack(L)) + ' against ' + want);
});
