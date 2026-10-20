/* Physics regressions: the vector focus of light traced through a real lens. A plano-hyperbolic lens (n = 4, its
   back face the hyperboloid k = -n², stigmatic on axis) brings a wide, nearly uniform x-polarised beam to NA 0.9; its
   traced pupil summed by vfAt is held against the Debye (generalised Richards–Wolf) integrals worked here, the
   amplitude on the sphere from energy along each ray. A thin mask holds its field in its own plane, and keeps it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBench, engine } from '../../headless.mjs';
const E = await engine();                                       // first: the page's stand-ins, then the modules in order
const { popScreenPrep } = await import('../../src/engines/diffraction.js');
const { popRun } = await import('../../src/engines/beam-tree.js');
const { popStats } = await import('../../src/engines/field.js');
const { vfAt, vfPupil } = await import('../../src/engines/vector-focus.js');

const NM = 633, LAM = NM * 1e-6, k = 2 * Math.PI / LAM;
const bench = (name, elements) => ({ format: 'jekray', version: 1, name, view: { cx: 0, cy: 0, scale: 6 }, snap: 0, maxBounces: 400, minPower: 1e-6, ghosts: false, elements });
const src = o => Object.assign({ type: 'source', name: 'Beam', x: -20, y: 0, angle: 0, wavelength: NM, divergence: 0, rays: 3, pol: 'p', gauss: true, z0: 20, popN: 256, power: 1 }, o);
// the pupil of the light reaching the screen through a part met in the given mode
async function pupil(B, mode, opts) {
  B.trace();
  const el = E.ST.project.elements.find(e => e.name === 'Focus'), job = popScreenPrep(el);
  const R = popRun(E.TRACE.lastTrace.beams, job.srcs, { keep: job.keep });
  const sg = R.segs.find(s => s.b.endEl === el.id && s.b.ev && s.b.ev.mode === mode), par = R.segs.find(s => s.i === sg.b.parent);
  return { R, sg, Fin: par.leg.at(par.b.len) };
}
// J_m by its integral, (1/pi) int_0^pi cos(m t - x sin t) dt
const besselJ = (m, x) => { let s = 0; const N = 48; for (let i = 0; i < N; i++) { const t = (i + 0.5) / N * Math.PI; s += Math.cos(m * t - x * Math.sin(t)); } return s / N; };
// a half-maximum width along a cut through the peak at 0
function fwhm(I) {
  const h = 0.5 * I(0); let lo = 0, hi = LAM;
  for (let it = 0; it < 40; it++) { const m = 0.5 * (lo + hi); if (I(m) > h) lo = m; else hi = m; }
  return lo + hi;
}

test('a real lens at NA 0.9: the traced vector focus is the Debye integral’s, its power kept', async () => {
  const n = 4, R2 = -3, fb = -R2 / (n - 1), NA = 0.9;
  const sag = h => (h * h / R2) / (1 + Math.sqrt(1 - (1 - n * n) * h * h / (R2 * R2)));
  const th = h => Math.atan2(h, fb - sag(h));                                   // stigmatic: each ray on to the focus
  let lo = 0, hi = 10; for (let i = 0; i < 80; i++) { const m = 0.5 * (lo + hi); if (Math.sin(th(m)) < NA) lo = m; else hi = m; }
  const a = lo, w0 = 10 * a;                                                    // the lens's rim at NA 0.9; nearly uniform across it
  const B = await openBench(bench('hyperbolic', [
    src({ width: 2 * a, w0 }),
    { type: 'lens', name: 'L', x: 0, y: 0, angle: 0, diameter: 2 * a, gaps: [2], materials: [{ glass: 'custom', n }],
      surfaces: [{ R: null, coat: { mode: 'custom', R: 0 } }, { R: R2, k: -n * n, coat: { mode: 'custom', R: 0 } }] },
    { type: 'screen', name: 'Focus', x: 1 + fb, y: 0, angle: 180, length: 10, vectorFocus: 'on' }]));
  const { R, sg, Fin } = await pupil(B, 'T');
  const P = vfPupil(sg, R, { reach: 1.02 * a / popStats(Fin).w, M: 96 });
  assert.equal(P.route, 'traced');
  assert.ok(Math.abs(P.Rf - fb) < 1e-3 && Math.abs(P.NA - NA) < 0.01, P.Rf + ' ' + P.NA);
  // Debye: power per solid angle I(h) h dh / (sin t dt) on the sphere, a = its root; with I0, I1, I2 as Richards and
  // Wolf write them, E_x = -(ik/2)(I0 + I2 cos 2phi), E_y = -(ik/2) I2 sin 2phi, |E_z| = k I1 |cos phi|
  const Ih = h => 2 / (Math.PI * w0 * w0) * Math.exp(-2 * h * h / (w0 * w0)), Nq = 1500, T = [], A = [];
  let parseval = 0;
  for (let i = 0; i < Nq; i++) {
    const h = (i + 0.5) / Nq * a, dh = a / Nq, t = th(h), dt = th(h + dh / 2) - th(h - dh / 2);
    T.push(t); A.push(Math.sqrt(Ih(h) * h * dh / (Math.sin(t) * dt)) * dt);
    parseval += 2 * Math.PI * Ih(h) * h * dh / Math.cos(t);                    // int |E|^2 over any plane: each plane wave's I / cos t
  }
  const rw = r => {
    let I0 = 0, I1 = 0, I2 = 0;
    for (let i = 0; i < Nq; i++) { const s = Math.sin(T[i]), c = Math.cos(T[i]), x = k * r * s; I0 += A[i] * s * (1 + c) * besselJ(0, x); I1 += A[i] * s * s * besselJ(1, x); I2 += A[i] * s * (1 - c) * besselJ(2, x); }
    return [I0, I1, I2];
  };
  const along = r => { const [i0, i1, i2] = rw(r); return k * k / 4 * ((i0 + i2) ** 2 + 4 * i1 * i1); };
  const across = r => { const [i0, , i2] = rw(r); return k * k / 4 * (i0 - i2) ** 2; };
  const I = (x, y) => vfAt(P, x, y, P.Rf).reduce((s, v) => s + v * v, 0);
  const fA = fwhm(t => I(t, 0)), fC = fwhm(t => I(0, t)), rA = fwhm(along), rC = fwhm(across);
  assert.ok(Math.abs(fA / rA - 1) < 0.01, 'FWHM along the polarisation ' + fA / LAM + ' λ against ' + rA / LAM);
  assert.ok(Math.abs(fC / rC - 1) < 0.01, 'FWHM across it ' + fC / LAM + ' λ against ' + rC / LAM);
  assert.ok(Math.abs(I(0, 0) / along(0) - 1) < 0.01, 'peak ' + I(0, 0) + ' against ' + along(0));
  // the share in E_z and |E|^2 over a disc 3 λ across the focal plane
  const Rd = 3 * LAM; let z = 0, all = 0, zR = 0, allR = 0;
  for (let i = 0; i < 30; i++) {
    const r = (i + 0.5) / 30 * Rd, dA = r * Rd / 30 * 2 * Math.PI;
    for (let j = 0; j < 12; j++) { const ph = (j + 0.5) / 12 * 2 * Math.PI, e = vfAt(P, r * Math.cos(ph), r * Math.sin(ph), P.Rf); z += (e[4] ** 2 + e[5] ** 2) * dA / 12; all += e.reduce((s, v) => s + v * v, 0) * dA / 12; }
  }
  for (let i = 0; i < 120; i++) { const r = (i + 0.5) / 120 * Rd, dA = r * Rd / 120 * 2 * Math.PI, [i0, i1, i2] = rw(r); zR += k * k / 4 * 2 * i1 * i1 * dA; allR += k * k / 4 * (i0 * i0 + i2 * i2 + 2 * i1 * i1) * dA; }
  assert.ok(Math.abs(z / all - zR / allR) < 0.005, 'E_z share ' + z / all + ' against ' + zR / allR);
  assert.ok(Math.abs(all / allR - 1) < 0.01, '|E|² over the disc ' + all + ' against ' + allR);
  // the pupil's own |E|^2 over the exit plane, against the light's (power per area square to each ray)
  let pw = 0; for (let o = 0; o < P.n; o++) { let e2 = 0; for (let m = 0; m < 6; m++) e2 += P.U[m][o] ** 2; pw += e2 * P.W[o]; }
  assert.ok(Math.abs(pw / parseval - 1) < 0.01, 'pupil ' + pw + ' against ' + parseval);
});

test('a thin mask holds its field in its plane: its pupil keeps the transverse power it was given', async () => {
  const f = 3, w = 2.5;
  const B = await openBench(bench('mask', [
    src({ width: 2 * w, w0: w, popModel: '2d' }),
    { type: 'mask', name: 'Lens', x: 0, y: 0, angle: 0, length: 25.4, amp: '1', delay: '-(sqrt(r^2+' + f * f + ')-' + f + ')/lambda', preset: 'custom' },
    { type: 'screen', name: 'Focus', x: f, y: 0, angle: 180, length: 10, vectorFocus: 'on' }]));
  const { R, sg } = await pupil(B, 'M');
  const P = vfPupil(sg, R);
  let pt = 0; for (let o = 0; o < P.n; o++) pt += (P.U[0][o] ** 2 + P.U[1][o] ** 2 + P.U[2][o] ** 2 + P.U[3][o] ** 2) * P.W[o];
  assert.ok(P.NA > 0.7 && Math.abs(pt - 1) < 0.01, P.NA + ' ' + pt);
});
