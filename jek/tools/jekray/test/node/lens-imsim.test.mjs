/* Image simulation: a picture as the design forms it. An even white picture comes out as the relative illumination
   across the field; a point lands where the real chief ray does, moved by the distortion, and in each colour where
   that colour's chief ray does (lateral colour); on the axis a point spreads as the PSF does and keeps its light;
   and off the axis the blur turns with the point's azimuth, the design being round. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const N = await import('../../src/engines/lens-analysis.js');
const E = await import('../../src/engines/lens-engine.js');
const IM = await import('../../src/engines/lens-imsim.js');

const surf = (R, x) => ({ R, k: 0, a2: 0, A: [], odd: null, semi: 20, ...x });
function systems(P, fields, nms, epd, primary) {
  const c = { aperture: { kind: 'epd', v: epd }, fields: fields.map(deg => ({ deg, w: 1 })), waves: nms.map(nm => ({ nm, w: 1 })), primary: primary || 0 };
  const S = nms.map(nm => E.lensSystem(P, nm, { epd, image: P.image }));
  const Sp = S[c.primary], na = Math.abs(Sp.n[Sp.N] * Sp.epr * Sp.par.uMarg);
  return { c, S, Sp, P, epd, na, fw: 1 / (2 * na), nm0: nms[c.primary], W: nms.length, finite: false };
}
// a singlet with its stop well before it: distortion and lateral colour to see
const singlet = () => {
  const P = { surfaces: [surf(null, { stop: true, semi: 3 }), surf(60, { semi: 20 }), surf(-200, { semi: 20 })], gaps: [25, 5], materials: [{ glass: 'AIR' }, { glass: 'N-BK7' }], stopIndex: 0 };
  P.image = E.lensSystem(P, 587.56).par.bfl;
  return P;
};
const pic = (w, h, f) => { const ch = [0, 1, 2].map(() => new Float32Array(w * h)); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const v = f(i, j); for (let c = 0; c < 3; c++) ch[c][j * w + i] = Array.isArray(v) ? v[c] : v; } return { w, h, ch }; };
const centroid = (img, W, H) => { let t = 0, x = 0, y = 0; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const v = img[j * W + i]; t += v; x += v * i; y += v * j; } return [x / t, y / t, t]; };

test('an even white picture comes out as the relative illumination', () => {
  const A = systems(singlet(), [0, 15], [587.56], 6), W = 65, H = 65;
  const R = IM.imsimRun(A, pic(W, H, () => 1), { grid: 3 }), ri = N.relIllum(A, 41, 64);
  // along the middle row, away from the picture's edge (where the blur spills out of it)
  for (const i of [32, 40, 48]) {
    const x = (i - 32) * R.pitch, f = Math.atan(Math.abs(x) / Math.abs(N.paraxHeight(A.Sp, 45))) * 180 / Math.PI, want = ri.ri[Math.round(f / 15 * 40)];
    // the real image of the point at the paraxial x is moved a little; the RI changes slowly enough not to matter
    assert.ok(Math.abs(R.ch[1][32 * W + i] - want) < 0.01, `x ${x.toFixed(2)} mm: ${R.ch[1][32 * W + i]} against ${want}`);
  }
});

test('a point lands where the real chief ray does, each colour where its own does', () => {
  const nms = [486.13, 587.56, 656.27], A = systems(singlet(), [0, 15], nms, 6, 1), W = 81, H = 81;
  const half = 0.5 * Math.hypot(W - 1, H - 1), par = f => N.paraxHeight(A.Sp, f), p = Math.abs(par(15)) / half, sg = Math.sign(par(15));
  // a point 25 rows above the middle: its paraxial image there, its field from that
  const jq = 15, yq = ((H - 1) / 2 - jq) * p, fq = Math.atan(yq / Math.abs(par(45))) * 180 / Math.PI;
  const R = IM.imsimRun(A, pic(W, H, (i, j) => i === 40 && j === jq ? 1 : 0), { grid: 4 });
  const rows = R.nm.map((nm, c) => {
    const wi = nms.indexOf(nm), sp = N.spotDiagram(A, fq, 31), C = E.rayAt(A.S[wi], fq * Math.PI / 180, 0, 0), w = sp.waves[wi];
    // where that colour's light gathers: its chief ray against the paraxial height (the distortion), then its spot's own centroid about it
    const own = w.pts.reduce((a, q) => a + q[1], 0) / w.pts.length - (C[1] - sp.chief[1]);
    const want = (H - 1) / 2 - (yq * C[1] / par(fq) + sg * own) / p, [, jy] = centroid(R.ch[c], W, H);
    assert.ok(Math.abs(jy - want) < 0.1, `${nm} nm: row ${jy} against ${want}`);
    return jy;
  });
  // a patch about that point at 4 µm a pixel: the colours apart as their chief rays and spots have them, several pixels (to a
  // quarter of a pixel: the PSF's own centroid is the spot's to half a micron, and a comatic tail leaving the frame pulls it)
  const pp = 0.004, Q = IM.imsimRun(A, pic(W, H, (i, j) => i === 40 && j === 40 ? 1 : 0), { mode: 'patch', at: [0, sg * yq], pitch: pp, grid: 1 });
  const sp = N.spotDiagram(A, fq, 31), land = wi => { const C = E.rayAt(A.S[wi], fq * Math.PI / 180, 0, 0), w = sp.waves[wi]; return yq * C[1] / par(fq) + sg * (w.pts.reduce((a, q) => a + q[1], 0) / w.pts.length - (C[1] - sp.chief[1])); };
  const gotB = centroid(Q.ch[2], W, H)[1], gotR = centroid(Q.ch[0], W, H)[1], want = (land(2) - land(0)) / pp;
  assert.ok(Math.abs(want) > 3 && Math.abs((gotB - gotR) - want) < 0.25, `blue against red ${gotB - gotR} px, ${want} wanted`);
});

test('on the axis a point spreads as the PSF does, and keeps its light', () => {
  const n = 1.6, P = { surfaces: [surf(25, { k: -1 / (n * n), semi: 12 })], gaps: [], materials: [], stopIndex: 0, image: n * 25 / (n - 1) };
  const S = [E.lensSystem(P, 587.56, { epd: 4, image: P.image, imageMaterial: { glass: 'custom', n } })], na = Math.abs(S[0].n[S[0].N] * S[0].epr * S[0].par.uMarg);
  const A = { c: { fields: [{ deg: 0 }, { deg: 0.5 }], waves: [{ nm: 587.56, w: 1 }], primary: 0 }, S, Sp: S[0], fw: 1 / (2 * na), W: 1, nm0: 587.56, finite: false };
  const W = 33, lamF = 587.56e-6 * A.fw, pitch = lamF / 2;
  const R = IM.imsimRun(A, pic(W, W, (i, j) => i === 16 && j === 16 ? 1 : 0), { mode: 'patch', at: [0, 0], pitch, grid: 1 });
  const [cx, cy, tot] = centroid(R.ch[1], W, W);
  assert.ok(Math.abs(cx - 16) < 1e-3 && Math.abs(cy - 16) < 1e-3, `at ${cx}, ${cy}`);
  // the light kept is the Airy pattern's within the picture (its far rings fall outside); the middle pixel's share as the Airy
  // pattern's over that pixel; both from the pattern integrated finely, its whole light 4 (λF)²/π
  const J1 = x => { let s = 0; for (let k = 0; k < 200; k++) { const th = Math.PI * (k + 0.5) / 200; s += Math.cos(th - x * Math.sin(th)); } return s / 200; };
  const air = r => { const v = Math.PI * r / lamF; return v ? (2 * J1(v) / v) ** 2 : 1; };
  const sub = 4, d = pitch / sub, total = 4 * lamF * lamF / Math.PI;
  let inside = 0, mid = 0;
  for (let y = -16.5 * sub; y < 16.5 * sub; y++) for (let x = -16.5 * sub; x < 16.5 * sub; x++) {
    const v = air(Math.hypot((x + 0.5) * d, (y + 0.5) * d)) * d * d; inside += v;
    if (Math.abs(x + 0.5) < sub / 2 && Math.abs(y + 0.5) < sub / 2) mid += v;
  }
  assert.ok(Math.abs(tot - inside / total) < 0.005, `light kept ${tot} against ${inside / total}`);
  assert.ok(Math.abs(R.ch[1][16 * W + 16] - mid / total) < 0.01, `middle ${R.ch[1][16 * W + 16]} against ${mid / total}`);
});

test('off the axis the blur turns with the point’s azimuth', () => {
  const P = singlet(); P.image -= 0.3;
  const A = systems(P, [0, 15], [587.56], 6), W = 81, f = 10;
  const yq = Math.abs(N.paraxHeight(A.Sp, f)), pitch = 0.004;
  const run = at => IM.imsimRun(A, pic(W, W, (i, j) => i === 40 && j === 40 ? 1 : 0), { mode: 'patch', at, pitch, grid: 1 }).ch[1];
  const mom = img => { const [cx, cy, t] = centroid(img, W, W); let xx = 0, yy = 0; for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) { const v = img[j * W + i]; xx += v * (i - cx) ** 2; yy += v * (j - cy) ** 2; } return [xx / t, yy / t]; };
  const [ax, ay] = mom(run([0, yq])), [bx, by] = mom(run([yq, 0]));
  assert.ok(Math.abs(ax - ay) > 0.2 * Math.max(ax, ay), `not round: ${ax}, ${ay}`);
  assert.ok(Math.abs(ax - by) < 0.03 * ax && Math.abs(ay - bx) < 0.03 * ay, `turned: ${ax}, ${ay} against ${by}, ${bx}`);
});

test('a design with one wavelength keeps the picture\'s colours, each channel blurred alike', () => {
  const A = systems(singlet(), [0, 10], [587.56], 6), W = 33, H = 33;
  // a red left half and a blue right half
  const R = IM.imsimRun(A, pic(W, H, i => (i < 16 ? [1, 0, 0] : [0, 0, 1])), { grid: 2 });
  const at = (c, i) => R.ch[c][16 * W + i];
  assert.ok(R.mono);
  assert.ok(at(0, 6) > 0.5 && at(2, 6) < 0.05 && at(1, 6) < 0.05, `left: ${at(0, 6)}, ${at(1, 6)}, ${at(2, 6)}`);
  assert.ok(at(2, 26) > 0.5 && at(0, 26) < 0.05 && at(1, 26) < 0.05, `right: ${at(0, 26)}, ${at(1, 26)}, ${at(2, 26)}`);
});
