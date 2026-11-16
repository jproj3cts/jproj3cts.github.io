// D4: the traced map (interpolated, expanded about the particle) against the retired mirror code (exact rays on the
// mirrors' surfaces), direction by direction, for the confocal bench with the particle 2 um off the axis
const R = '../../../../../jek/tools/jekray/';
const { openBench, engine } = await import(R + 'headless.mjs');
await engine();
const PM = await import(R + 'src/engines/scatter-pupil-map.js'), PP = await import(R + 'src/engines/scatter-pupil.js');
const add3 = (a, b, s = 1) => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];
const dotp = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unitp = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function pupMirror(el) { const th = (el.angle || 0) * Math.PI / 180; return { el, V: [el.x, el.y, 75], n: [Math.cos(th), Math.sin(th), 0], c: el.R ? 1 / el.R : 0, k: el.k || 0, A: [], a: 0.5 * el.length, Rp: el.reflect / 100 }; }
function pupSag(m, r2) { const q = 1 + m.k, c = m.c; return c * r2 / (1 + Math.sqrt(Math.max(0, 1 - q * c * c * r2))); }
function pupDsag(m, r2) { const q = 1 + m.k, c = m.c; return c / Math.sqrt(Math.max(1e-30, 1 - q * c * c * r2)); }
function pupHit(m, P, u) {
  const un = dotp(u, m.n); let t = dotp(add3(m.V, P, -1), m.n) / un;
  for (let it = 0; it < 50; it++) { const X = add3(P, u, t), D = add3(X, m.V, -1), h = dotp(D, m.n), Rr = add3(D, m.n, -h), r2 = dotp(Rr, Rr); const g = h - pupSag(m, r2), dg = un - pupDsag(m, r2) * dotp(Rr, u); const dt = g / dg; t -= dt; if (Math.abs(dt) < 1e-13) break; }
  if (!(t > 1e-9)) return null;
  const X = add3(P, u, t), D = add3(X, m.V, -1), h = dotp(D, m.n), Rr = add3(D, m.n, -h), r2 = dotp(Rr, Rr);
  if (r2 > m.a * m.a) return null;
  return { t, X, N: unitp(add3(m.n, Rr, -pupDsag(m, r2))) };
}
function pupTrace(M, P, u, refl) {
  let p = P, d = u, ell = 0, amp = 1, Mx = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], at = dotp(d, M[1].n) < 0 ? 1 : 0;
  for (let r = 0; r < refl; r++) { const H = pupHit(M[at], p, d); if (!H) return null; ell += H.t; p = H.X; const N = H.N, dn = dotp(d, N); d = unitp(add3(d, N, -2 * dn));
    const RN = [0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? -1 : 0) + 2 * N[i] * N[j])); Mx = RN.map(row => [0, 1, 2].map(j => row[0] * Mx[0][j] + row[1] * Mx[1][j] + row[2] * Mx[2][j])); amp *= Math.sqrt(M[at].Rp); at = 1 - at; }
  return { d, X: p, ell, amp, Mx };
}
const yp = +(process.argv[2] || 2e-3), kind = process.argv[3] || 'confocal';
const [Rm, kc] = kind === 'concentric' ? [10, 0] : [20, -1];
const m1 = { id: 'm1', type: 'mirror', name: 'M1', x: -10, y: 0, angle: 0, length: 5, reflect: 90, transmit: 10, R: Rm, k: kc }, m2 = { id: 'm2', type: 'mirror', name: 'M2', x: 10, y: 0, angle: 180, length: 5, reflect: 90, transmit: 10, R: Rm, k: kc };
const LASER = { id: 'laser', type: 'source', name: 'Laser', x: -40, y: 0, angle: 0, wavelength: 1550, gauss: true, w0: 0.02, z0: 40, rays: 0, traceRays: false, power: 1, pol: 's' };
const doc = els => ({ format: 'jekray', version: 1, name: 't', maxBounces: 60, minPower: 1e-6, benches: [{ id: 'b1', name: 'B' }], tab: 'b1', elements: els.map(e => Object.assign({ bench: 'b1' }, e)) });
(await openBench(doc([LASER, m1, m2, { id: 'p', type: 'particle', name: 'P', x: 0, y: yp, angle: 90, trapMat: 'Fused silica', trapR: 50, trapMed: 'vacuum', scatModel: 'rayleigh' }]))).trace();
const map = PM.PUP_MAPS.get('p'), P = { map, dir: map.axis, ex: map.ex, ey: map.ey }, G = PP.pupGrid(P), C = map.C, M = [pupMirror(m1), pupMirror(m2)], k = 2 * Math.PI / 1.55e-3;
console.log('pattern', map.pattern, 'axis', map.axis, 'ex', map.ex, 'ey', map.ey, 'nodes', G.N);
const worst = {}, where = {};
const note = (key, v, i) => { if (!(worst[key] >= v)) { worst[key] = v; where[key] = i; } };
const cross = T => { const t = dotp(add3(C, T.X, -1), map.axis) / dotp(T.d, map.axis); return { q: add3(add3(T.X, T.d, t), C, -1), ell: T.ell + t }; };
let n = 0; { const u0 = unitp([1, 0.05, 0]); const H = pupHit(M[1], C, u0); }
const inner = process.argv[4] ? +process.argv[4] : 9;     // only directions within this of the axis (sines)
for (let i = 0; i < G.N; i++) {
  const u = [G.dirs[3 * i], G.dirs[3 * i + 1], G.dirs[3 * i + 2]];
  if (Math.hypot(dotp(u, map.ex), dotp(u, map.ey)) > inner) continue;
  let d = u, q = [0, 0, 0], ell = 0;
  for (let ret = 1; ret <= 3; ret++) {
    const T = pupTrace(M, C, u, ret * map.pattern), A = PP.pupMapAt(P, G, d, q);
    if (!T || !A) { if (i % 500 === 0) console.log("null", i, !!T, !!A, u); break; }
    const X = cross(T); ell += A.ell; d = A.d; q = A.q;
    const tag = 'ret' + ret + ' ';
    note(tag + 'direction', Math.hypot(...add3(A.d, T.d, -1)), i);
    note(tag + 'crossing q (mm)', Math.hypot(...add3(A.q, X.q, -1)), i);
    note(tag + 'path (mm)', Math.abs(ell - X.ell), i);
    note(tag + 'phase k(ell - d.q) (rad)', Math.abs(k * ((ell - dotp(A.d, A.q)) - (X.ell - dotp(T.d, X.q)))), i);
    if (ret === 1) { let e = 0; for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) e = Math.max(e, Math.hypot(A.M[2 * (3 * x + y)] - T.amp * T.Mx[x][y], A.M[2 * (3 * x + y) + 1])); note(tag + "field matrix", e, i); if (e > 1e-6 && (globalThis.nbad = (globalThis.nbad || 0) + 1) < 4) console.log("M differs", u, Array.from(A.M).map(v => +v.toFixed(3)).join(" "), "law", T.Mx.flat().map(v => +(T.amp * v).toFixed(3)).join(" ")); }
    if (ret === 1) n++;
  }
}
console.log('directions compared', n);
for (const key of Object.keys(worst)) { const i = where[key], u = [G.dirs[3 * i], G.dirs[3 * i + 1], G.dirs[3 * i + 2]]; console.log(key.padEnd(34), worst[key].toExponential(3), ' at u.ex', dotp(u, map.ex).toFixed(4), 'u.ey', dotp(u, map.ey).toFixed(4)); }
