/* The optimisers pushed through many more cases than the suites run (a few minutes):
     node test/optimise-stress.mjs                  everything
     node test/optimise-stress.mjs --no-browser     the designers only (coating, Optical, RF), in Node
     node test/optimise-stress.mjs --only coat      cases whose name holds a text
   Each case prints ok or BAD, its time and what it found; it exits 1 if any is BAD. The checks are the ones every
   optimiser owes whatever it is given: an answer that is finite, never worse than the start (within the limits set),
   inside its bounds, the same each time, and a plain reason when it cannot run. The fast versions of the cases that
   once failed are in test/node/optimise-stress.test.mjs and the browser group 'Optimiser stress'. */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { workerShim } from '../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { loadProject } = await import('../src/state/elements.js');
const ST = await import('../src/state/project.js');
const D = await import('../src/engines/lens-design.js');
const O = await import('../src/engines/lens-opt.js');
const T = await import('../src/engines/lens-tol.js');
const RF = await import('../src/engines/rf-design.js');
const C = await import('../src/core/rf.js');
const CD = await import('../src/core/coatdesign.js');
const { qwot } = await import('../src/core/coatings.js');
const { seededRng } = await import('../src/core/numeric.js');

const args = process.argv.slice(2), only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const fin = v => typeof v === 'number' && isFinite(v), e3 = v => (fin(v) ? v.toExponential(3) : String(v));
let bad = 0, n = 0;
async function kase(name, fn) {
  if (only && !name.includes(only)) return;
  const t0 = Date.now();
  let ok, info;
  try { [ok, info] = await fn(); } catch (err) { ok = false; info = 'threw ' + err.message; }
  n++; if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'BAD  ') + name.padEnd(58) + String(Date.now() - t0).padStart(7) + ' ms  ' + info);
}

/* ---------- The coating designer ---------- */
console.log('\nCoating designer (Nelder-Mead on the thicknesses)');
{
  const R = seededRng(1), idx = [1.38, 1.46, 1.63, 2.1, 2.3];
  const specs = [['AR visible', { target: 'ar', ns: 1.5168, lo: 450, hi: 650 }], ['AR 0-30°', { target: 'ar', ns: 1.5168, lo: 420, hi: 700, theta: 30 }], ['AR on silicon', { target: 'ar', ns: 3.48, lo: 1300, hi: 1700 }],
    ['HR', { target: 'hr', ns: 1.5168, lo: 600, hi: 700 }], ['splitter 30%', { target: 'split', ns: 1.5168, lo: 500, hi: 600, R: 30 }], ['splitter s at 45°', { target: 'split', ns: 1.5168, lo: 500, hi: 600, R: 50, theta: 45, pol: 's' }],
    ['long-pass edge', { target: 'edge', ns: 1.5168, lo: 400, hi: 800, edge: 600, passBelow: false }], ['RF 24 GHz', { target: 'rf', ns: 1.643, lo: 299792458 / 26, hi: 299792458 / 22 }],
    ['a band of no width', { target: 'ar', ns: 1.5168, lo: 550, hi: 550 }], ['substrate the medium', { target: 'ar', ns: 1, lo: 450, hi: 650 }]];
  for (const [name, o] of specs) for (const nL of [1, 2, 4, 8, 16]) await kase('coating ' + name + ', ' + nL + ' layers', () => {
    const spec = CD.coatSpec(o), out = [];
    let ok = true;
    for (let trial = 0; trial < 3; trial++) {
      const L = []; for (let i = 0; i < nL; i++) { const nn = idx[(i + trial) % idx.length]; L.push({ n: nn, d: qwot(nn, spec.design) * (0.2 + 2 * R()) }); }
      const r = CD.coatOptimise(L, spec), m0 = CD.coatMerit(L, spec), m1 = CD.coatMerit(r.layers, spec);
      ok = ok && fin(m1) && m1 <= m0 * (1 + 1e-12) && r.layers.every(l => l.d >= 0.01 * qwot(l.n, spec.design) - 1e-3 && l.d <= 16 * qwot(l.n, spec.design) + 1e-3);
      out.push(e3(m0) + '→' + e3(m1));
    }
    return [ok, out.join('  ')];
  });
  await kase('coating MgF2 from 0.1–3.3 QW reaches an odd quarter wave', () => {
    const spec = CD.coatSpec({ target: 'ar', ns: 1.5168, lo: 549, hi: 551, design: 550 }), q = qwot(1.38, 550);
    const got = [0.1, 0.5, 1.7, 3.3].map(f => CD.coatOptimise([{ n: 1.38, d: f * q }], spec).layers[0].d / q);
    return [got.every(g => Math.abs(g - Math.round(g)) < 0.01 && Math.round(g) % 2 === 1), got.map(g => g.toFixed(4)).join(' ') + ' QW'];
  });
  await kase('coating a blank thickness, and no layers', () => {
    const spec = CD.coatSpec({ target: 'ar', ns: 1.5168, lo: 540, hi: 560 }), a = CD.coatOptimise([{ n: 1.38, d: NaN }], spec), b = CD.coatOptimise([], spec);
    return [fin(a.layers[0].d) && b.layers.length === 0 && fin(b.after), 'blank → ' + a.layers[0].d + ' nm'];
  });
}

/* ---------- The Optical designer ---------- */
console.log('\nOptical designer (damped least squares, global search, substitution, tolerancing)');
function load(elements, asm) { loadProject({ format: 'jekray', version: 1, elements, assemblies: [asm] }); const a = ST.project.assemblies[0]; D.commitDesign(a, D.designPrescription(a)); return a; }
const lens = (id, x, R1, R2, t, glass, d) => ({ type: 'lens', id, name: id, x, y: 0, angle: 0, diameter: d || 25, surfaces: [{ R: R1 }, { R: R2 }], gaps: [t], materials: [{ glass }], group: 'g' });
const stop = (x, ap) => ({ type: 'stop', id: 'S', name: 'S', x, y: 0, angle: 0, aperture: ap, group: 'g' });
const TT = [3.25896, 6.00755, 0.99997, 4.75041, 2.95208], PUB = [22.01359, -435.76044, -22.21328, 20.29192, 79.68360, -18.39533];
function triplet(Rs, extra) {
  const v2 = TT[0] + TT[1], v3 = v2 + TT[2] + TT[3];
  return load([lens('L1', TT[0] / 2, Rs[0], Rs[1], TT[0], 'N-SK16', 18), lens('L2', v2 + TT[2] / 2, Rs[2], Rs[3], TT[2], 'F2', 14), stop(v2 + TT[2], 10), lens('L3', v3 + TT[4] / 2, Rs[4], Rs[5], TT[4], 'N-SK16', 15)],
    { id: 'g', name: 'Triplet', ref: 'L1', cond: { aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0 }, { deg: 14 }, { deg: 20 }], waves: [{ nm: 486.13 }, { nm: 587.56 }, { nm: 656.27 }], primary: 1 },
      design: Object.assign({ solves: { 't:image': { kind: 'focus' }, 'R:L3.1': { kind: 'fno', v: 5 } }, vars: ['R:L1.0', 'R:L1.1', 'R:L2.0', 'R:L2.1', 'R:L3.0', 't:L1.1', 't:S.0'], merit: { bounds: { glassMin: 0.9, edgeMin: 0.3, airMin: 0.1 } } }, extra || {}) });
}
const singlet = extra => load([stop(-1, 10), lens('L', 1.5, 100, -100, 3, 'N-BK7', 14)], { id: 'g', name: 'A', ref: 'L', cond: { aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0 }, { deg: 5 }], waves: [{ nm: 587.56 }] },
  design: Object.assign({ solves: { 't:image': { kind: 'focus' } }, vars: ['R:L.0', 'R:L.1'], merit: { ops: [{ op: 'EFL', target: 100, weight: 10 }] } }, extra || {}) });
const probOf = a => O.optProblem(a, D.designPrescription(a));
// finite, inside its limits, and never worse than the start (unless the start broke the limits, when it is brought within them)
function lensRun(a, run) {
  const prob = probOf(a), V = O.optVars(prob), L = O.limitsX(prob, V), out = O.optRun(prob, run);
  const inLim = out.x.every((v, j) => v >= L.lo[j] - 1e-12 && v <= L.hi[j] + 1e-12);
  return [fin(out.merit) && out.x.every(fin) && inLim && (out.outside || out.merit <= out.start * (1 + 1e-12)), e3(out.start) + ' → ' + e3(out.merit) + (out.outside ? ' (brought within its limits)' : '') + (inLim ? '' : ' OUTSIDE ITS LIMITS') + (out.tried ? ', ' + out.tried + ' trials' : ', ' + out.iters + ' cycles')];
}
{
  const R = seededRng(3);
  for (let k = 0; k < 6; k++) { const f = PUB.map(() => 0.7 + 0.6 * R()); await kase('triplet spoilt #' + k + ', 30 cycles', () => lensRun(triplet(PUB.map((r, i) => r * f[i])), { mode: 'dls', iters: 30 })); }
  for (let k = 0; k < 2; k++) await kase('triplet spoilt, global search, 3 trials, seed ' + (k + 5), () => lensRun(triplet(PUB.map(r => r * 1.15)), { mode: 'global', trials: 3, seed: k + 5 }));
  await kase('triplet every radius turned over', () => lensRun(triplet(PUB.map(r => -r)), { mode: 'dls', iters: 30 }));
  await kase('triplet radii ×10', () => lensRun(triplet(PUB.map(r => r * 10)), { mode: 'dls', iters: 30 }));
  await kase('triplet radii ×0.3 (faces overlapping)', () => lensRun(triplet(PUB.map(r => r * 0.3)), { mode: 'dls', iters: 30 }));
  await kase('triplet flat faces', () => lensRun(triplet([null, null, null, null, null, -18]), { mode: 'dls', iters: 30 }));
  await kase('singlet front radius limited to 40–60', () => lensRun(singlet({ lims: { 'R:L.0': { lo: 40, hi: 60 } } }), { mode: 'dls', iters: 40 }));
  await kase('singlet limit at least 200, the start 100 outside', () => lensRun(singlet({ lims: { 'R:L.0': { lo: 200 } } }), { mode: 'dls', iters: 40 }));
  await kase('singlet limits given high to low', () => lensRun(singlet({ lims: { 'R:L.0': { lo: 60, hi: 40 } } }), { mode: 'dls', iters: 40 }));
  await kase('singlet global search, the start outside its limits', () => lensRun(singlet({ lims: { 'R:L.0': { lo: 40, hi: 60 }, 'R:L.1': { lo: -300, hi: -80 } } }), { mode: 'global', trials: 4, seed: 2 }));
  await kase('singlet no variables, dls and global', () => { const a = lensRun(singlet({ vars: [] }), { mode: 'dls', iters: 5 }), b = lensRun(singlet({ vars: [] }), { mode: 'global', trials: 2 }); return [a[0] && b[0], a[1]]; });
  await kase('singlet EFL a million (out of reach)', () => lensRun(singlet({ merit: { ops: [{ op: 'EFL', target: 1e6, weight: 1 }] } }), { mode: 'dls', iters: 30 }));
  await kase('singlet EFL -100 (a negative lens asked of a positive)', () => lensRun(singlet({ merit: { ops: [{ op: 'EFL', target: -100, weight: 1 }] } }), { mode: 'dls', iters: 30 }));
  await kase('singlet weight 1e9 and weight 0', () => { const a = lensRun(singlet({ merit: { ops: [{ op: 'EFL', target: 80, weight: 1e9 }] } }), { mode: 'dls', iters: 30 }), b = lensRun(singlet({ merit: { ops: [{ op: 'EFL', target: 80, weight: 0 }] } }), { mode: 'dls', iters: 30 }); return [a[0] && b[0], a[1] + '; ' + b[1]]; });
  await kase('dls and the global search repeat exactly', () => { const p = probOf(triplet(PUB.map(r => r * 1.1))); const s = r => JSON.stringify(O.optRun(p, r).x); return [s({ mode: 'dls', iters: 20 }) === s({ mode: 'dls', iters: 20 }) && s({ mode: 'global', trials: 2, seed: 9 }) === s({ mode: 'global', trials: 2, seed: 9 }), ''];
  });
  await kase('UI-style runs (4 cycles at a time) settle', () => { const p = probOf(singlet()); let b = O.optRun(p, { mode: 'dls', iters: 4 }), k = 1; while (!b.done && k < 40) { b = O.optRun(p, { mode: 'dls', iters: 4, x: b.x, lambda: b.lambda }); k++; } return [b.done, k + ' batches, merit ' + e3(b.merit)]; });
  await kase('substitution with no glass marked', () => { const p = probOf(triplet(PUB, { vars: ['R:L1.0', 'R:L1.1'] })), r = O.substituteRun(p, { makers: ['Schott'], n: 5, iters: 10, passes: 1 }); return [fin(r.merit) && r.log.length === 0, e3(r.merit)]; });
  const a = triplet(PUB), prob = probOf(a);
  for (const comp of ['none', 'focus']) {
    const Tt = Object.assign({}, prob.design.tol || {}, { seed: 1, dist: 'uniform', comp });
    await kase('tolerancing sensitivity, compensator ' + comp, () => { const S = T.tolSensitivity(prob, Tt); return [fin(S.nominal) && S.rows.every(r => fin(r.minus) && fin(r.plus)), S.rows.length + ' tolerances']; });
    await kase('tolerancing Monte Carlo 50, repeatable, compensator ' + comp, () => { const m = T.tolMonteCarlo(prob, Tt, 0, 50), m2 = T.tolMonteCarlo(prob, Tt, 0, 30).concat(T.tolMonteCarlo(prob, Tt, 30, 50)); return [m.every(t => fin(t.crit)) && JSON.stringify(m) === JSON.stringify(m2), 'mean ' + e3(m.reduce((s, t) => s + t.crit, 0) / m.length)]; });
    await kase('tolerancing inverse, 4 tolerances, compensator ' + comp, () => { const I = T.tolInverse(prob, Tt, 0, 4); return [I.rows.every(r => fin(r.inv)), I.rows.map(r => r.inv.toPrecision(3)).join(' ')]; });
  }
}

/* ---------- The RF designer ---------- */
console.log('\nRF designer (BFGS)');
function rfSystem(ghz, feed, R1, R2, t, goal, mat, dia) {
  loadProject({ format: 'jekray', version: 1, elements: [{ type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, diameter: dia || 120, asphere: true, surfaces: [{ R: R1, k: 0 }, { R: R2, k: 0 }], gaps: [t], materials: [{ glass: mat || 'HDPE' }], mmw: { part: true }, group: 'g' }],
    assemblies: [{ id: 'g', name: 'RF', ref: 'L', kind: 'rf', rf: { ghz, feed, goal } }] });
  const a = ST.project.assemblies[0], P = D.designPrescription(a); RF.rfSyncCond(a, P); return { a, P };
}
function rfRun(s, keys, extra) {
  const prob = RF.rfOptProblem(s.a, s.P, Object.assign({ keys, flat: 0, edgeMin: 1, tMax: 0 }, extra || {}));
  let st = RF.rfOptStart(prob), i = 0, rising = false;
  const m0 = st.m, e0 = st.mean;
  for (; i < 200 && !st.done; i++) { const was = st.m; st = RF.rfOptStep(prob, st); if (st.m > was * (1 + 1e-12)) rising = true; }
  return [fin(st.m) && st.x.every(fin) && !rising, 'merit ' + e3(m0) + ' → ' + e3(st.m) + ', efficiency ' + (+e0).toFixed(3) + ' → ' + (+st.mean).toFixed(3) + ', ' + i + ' steps' + (st.done ? '' : ' (stopped at 200)')];
}
{
  const all = ['c:0', 'k:0', 'c:1', 'k:1', 't:0', 'feed'];
  for (const ghz of [1, 5, 24, 100, 300, 1000]) {
    const lam = C.C_NM_GHZ / ghz * 1e-6, aH = Math.max(3, 2 * lam), feed = { kind: 'corrugated', a: aH, L: 5 * aH, d: 150 };
    await kase('RF ' + ghz + ' GHz collimate, front face', () => rfRun(rfSystem(ghz, feed, 120, null, 30, { kind: 'collimate', d: 300 }), ['c:0', 'k:0']));
    await kase('RF ' + ghz + ' GHz collimate, everything free', () => rfRun(rfSystem(ghz, feed, 120, -400, 30, { kind: 'collimate', d: 300 }), all));
    await kase('RF ' + ghz + ' GHz focus at 200 mm, everything free', () => rfRun(rfSystem(ghz, feed, 120, -400, 30, { kind: 'focus', d: 200, w: 10 }), all));
  }
  const feed = { kind: 'corrugated', a: 15, L: 80, d: 150 };
  await kase('RF a flat slab to start', () => rfRun(rfSystem(24, feed, null, null, 20, { kind: 'collimate', d: 300 }), ['c:0', 'c:1']));
  await kase('RF the feed alone, 2 mm away', () => rfRun(rfSystem(24, Object.assign({}, feed, { d: 2 }), 120, null, 30, { kind: 'collimate', d: 300 }), ['feed']));
  await kase('RF the feed alone, 5 m away (nothing to climb)', () => rfRun(rfSystem(24, Object.assign({}, feed, { d: 5000 }), 120, null, 30, { kind: 'collimate', d: 300 }), ['feed']));
  await kase('RF a 300 mm thick lens', () => rfRun(rfSystem(24, feed, 120, null, 300, { kind: 'collimate', d: 300 }), all));
  await kase('RF flat efficiency across the band', () => rfRun(rfSystem(24, feed, 120, null, 30, { kind: 'collimate', d: 300 }), all, { flat: 1 }));
  await kase('RF no variables', () => rfRun(rfSystem(24, feed, 120, null, 30, { kind: 'collimate', d: 300 }), []));
  await kase('RF a small PTFE lens', () => rfRun(rfSystem(24, feed, 50, null, 10, { kind: 'collimate', d: 300 }, 'PTFE', 20), all));
  await kase('RF horn to horn', () => rfRun(rfSystem(24, feed, 120, -120, 30, { kind: 'couple', d: 300, rx: feed }), all));
}

/* ---------- The bench optimiser and the exercises, in the page ---------- */
if (!args.includes('--no-browser')) {
  console.log('\nThe bench optimiser and the exercises (the built page, in Playwright)');
  const here = dirname(fileURLToPath(import.meta.url)), repo = join(here, '..', '..', '..', '..');
  let pw = null;
  try { pw = await import('playwright'); } catch { try { pw = await import(join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'playwright', 'index.mjs')); } catch { /* none */ } }
  if (!pw) { console.log('Playwright not found: the page cases were not run'); bad++; }
  else {
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png' };
    const server = createServer((req, rs) => {
      const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
      let f = join(repo, p); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
      if (!f.startsWith(repo) || !existsSync(f)) { rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); createReadStream(f).pipe(rs);
    });
    await new Promise(r => server.listen(0, r));
    const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.goto('http://localhost:' + server.address().port + '/jek/tools/jekray.html#test');
    await page.waitForFunction(() => window.JEKray && window.JEKray.load, null, { timeout: 60000 });
    await page.evaluate(() => {
      const sw = (min, max) => ({ min, max, f: 0.1, wave: 'sine', phase: 0 });
      window.SB = { sw,
        bench: (name, elements) => ({ format: 'jekray', version: 1, name, view: { cx: 0, cy: 0, scale: 6 }, snap: 0, maxBounces: 400, minPower: 0.1, ghosts: false, elements }),
        src: o => Object.assign({ type: 'source', name: 'Src', x: -60, y: 0, angle: 0, wavelength: 632.8, width: 10, divergence: 0, rays: 15, pol: 'p', colourAuto: true }, o),
        screen: o => Object.assign({ type: 'screen', name: 'Screen', x: 60, y: 0, angle: 180, length: 40 }, o),
        lens: o => Object.assign({ type: 'lens', name: 'Lens', x: 0, y: 0, angle: 0, diameter: 25.4, surfaces: [{ R: 51.5 }, { R: -51.5 }], gaps: [3.6], materials: [{ glass: 'N-BK7' }] }, o),
        focus: (x, s) => window.SB.bench('o', [window.SB.src({}), window.SB.lens({}), window.SB.screen({ x, sweeps: { x: s || sw(40, 60) } })]),
        walk: () => window.SB.bench('walk', [window.SB.src({ name: 'Beam', x: 0, y: 0.4, angle: 0.3, width: 0.5, rays: 3, pol: 's', wavelength: 633 }), { type: 'mirror', name: 'M1', x: 50, y: 0, angle: 135, length: 12.7, reflect: 100, sweeps: { angle: sw(133, 137) } },
          { type: 'mirror', name: 'M2', x: 50, y: 60, angle: 315, length: 12.7, reflect: 100, sweeps: { angle: sw(313, 317) } }, window.SB.screen({ name: 'S1', x: 100, y: 60, length: 20, absorb: false }), window.SB.screen({ name: 'S2', x: 200, y: 60, length: 20 })]) };
    });
    // each case: a function run in the page with J (window.JEKray) and SB (the benches above), returning [ok, info]
    const inPage = (name, fn) => kase(name, () => page.evaluate(`(async () => { const J = window.JEKray, SB = window.SB; return await (${fn.toString()})(J, SB); })()`));
    const F = 50.655;
    await inPage('bench: focus, one parameter, both searches', (J, SB) => { J.load(SB.focus(45)); const a = J.optimise('Screen', 'x', 'Screen', 'rms', 'min', 0).best; J.load(SB.focus(45)); const b = J.optimiseMany([['Screen', 'x']], [{ target: 'Screen', key: 'rms', goal: 'min' }]).best[0]; return [Math.abs(a - 50.655) < 0.05 && Math.abs(b - 50.655) < 0.05, a.toFixed(4) + ' and ' + b.toFixed(4) + ' mm']; });
    await inPage('bench: the start outside the range', (J, SB) => { J.load(SB.focus(80)); J.optimiseMany([['Screen', 'x']], [{ target: 'Screen', key: 'rms', goal: 'min' }]); const x = J.byName('Screen').x; return [Math.abs(x - 50.655) < 0.05, x.toFixed(4) + ' mm']; });
    await inPage('bench: a range of no width, and one given high to low', (J, SB) => { J.load(SB.focus(45, SB.sw(50, 50))); J.optimiseMany([['Screen', 'x']], [{ target: 'Screen', key: 'rms', goal: 'min' }]); const a = J.byName('Screen').x; J.load(SB.focus(45, SB.sw(60, 40))); J.optimiseMany([['Screen', 'x']], [{ target: 'Screen', key: 'rms', goal: 'min' }]); const b = J.byName('Screen').x; return [a === 50 && Math.abs(b - 50.655) < 0.05, a + ', ' + b.toFixed(4)]; });
    await inPage('bench: nothing to read anywhere: left as it was', (J, SB) => { J.load(SB.bench('o', [SB.src({ angle: 90 }), SB.screen({ x: 45, sweeps: { x: SB.sw(40, 60) } })])); const r = J.optimiseMany([['Screen', 'x']], [{ target: 'Screen', key: 'rms', goal: 'min' }]); return [!r.improved && J.byName('Screen').x === 45, 'improved ' + r.improved]; });
    await inPage('bench: nothing to read at the start, found in the range', (J, SB) => { J.load(SB.bench('o', [SB.src({ y: 30 }), SB.screen({ x: 45, length: 10, sweeps: { y: SB.sw(-5, 40) } })])); const r = J.optimiseMany([['Screen', 'y']], [{ target: 'Screen', key: 'centroid', goal: 'min' }]); return [r.improved && Math.abs(J.metric('Screen', 'centroid')) < 0.01, 'y ' + r.best[0].toFixed(3)]; });
    await inPage('bench: already at its best', (J, SB) => { J.load(SB.focus(50.655)); const m0 = J.metric('Screen', 'rms'); J.optimiseMany([['Screen', 'x']], [{ target: 'Screen', key: 'rms', goal: 'min' }]); const m1 = J.metric('Screen', 'rms'); return [m1 <= m0, m0.toExponential(4) + ' → ' + m1.toExponential(4)]; });
    await inPage('bench: a target no setting reaches (RMS of -1)', (J, SB) => { J.load(SB.focus(45)); const r = J.optimiseMany([['Screen', 'x']], [{ target: 'Screen', key: 'rms', goal: 'match', targetVal: -1 }]); return [Math.abs(r.best[0] - 50.655) < 0.05, 'the smallest it can: ' + r.best[0].toFixed(4)]; });
    await inPage('bench: a peak narrower than the scan’s step', (J, SB) => { const b = () => SB.bench('o', [SB.src({ y: 3, width: 0.01, rays: 1 }), SB.screen({ x: 45, y: -10, length: 0.2, sweeps: { y: SB.sw(-20, 20) } })]); J.load(b()); const r = J.optimise('Screen', 'y', 'Screen', 'power', 'max', 0); const one = J.metric('Screen', 'power'); J.load(b()); J.optimiseMany([['Screen', 'y']], [{ target: 'Screen', key: 'power', goal: 'max' }]); const many = J.metric('Screen', 'power'); return [one > 99 && many > 99, 'power ' + one + '% and ' + many + '%']; });
    await inPage('bench: two mirrors walking a beam, the same twice', (J, SB) => { const go = () => { J.load(SB.walk()); return J.optimiseMany([['M1', 'angle'], ['M2', 'angle']], [{ target: 'S1', key: 'centroid', goal: 'match', targetVal: 0.3, weight: 1 }, { target: 'S2', key: 'centroid', goal: 'match', targetVal: 0, weight: 1 }]).best; }; const a = go(), b = go(); return [a.every((v, i) => v === b[i]), a.map(v => v.toFixed(5)).join(', ')]; });
    await inPage('bench: three weighted goals on three parameters', (J, SB) => { J.load(SB.bench('o', [SB.src({ y: 0.5 }), SB.lens({ x: 3, y: 1, sweeps: { x: SB.sw(-10, 10), y: SB.sw(-2, 2) } }), SB.screen({ x: 60, sweeps: { x: SB.sw(45, 70) } })])); const r = J.optimiseMany([['Lens', 'x'], ['Lens', 'y'], ['Screen', 'x']], [{ target: 'Screen', key: 'rms', goal: 'min', weight: 1 }, { target: 'Screen', key: 'centroid', goal: 'match', targetVal: 0, weight: 3 }, { target: 'Screen', key: 'power', goal: 'max', weight: 0.5 }]); return [r.improved && r.bestMerit < r.startMerit && r.rawBest.every(v => isFinite(v)), r.evals + ' traces, RMS ' + r.raw0[0].toFixed(3) + ' → ' + r.rawBest[0].toFixed(4)]; });
    await inPage('bench: six parameters, two lenses and a screen', (J, SB) => { J.load(SB.bench('o', [SB.src({}), SB.lens({ name: 'L1', x: -20, sweeps: { x: SB.sw(-30, -10), y: SB.sw(-2, 2) } }), SB.lens({ name: 'L2', x: 20, sweeps: { x: SB.sw(10, 30), y: SB.sw(-2, 2) } }), SB.screen({ x: 80, sweeps: { x: SB.sw(50, 120), y: SB.sw(-3, 3) } })])); const t0 = performance.now(); const r = J.optimiseMany([['L1', 'x'], ['L1', 'y'], ['L2', 'x'], ['L2', 'y'], ['Screen', 'x'], ['Screen', 'y']], [{ target: 'Screen', key: 'rms', goal: 'min', weight: 1 }, { target: 'Screen', key: 'centroid', goal: 'min', weight: 1 }]); return [r.improved && performance.now() - t0 < 20000, r.evals + ' traces, RMS ' + r.raw0[0].toFixed(3) + ' → ' + r.rawBest[0].toFixed(3) + ' (its best within the ranges is about 0.77)']; });
    await inPage('bench: a mirror’s 3D tip for a square arrival', (J, SB) => { J.load(SB.bench('o', [SB.src({}), { type: 'mirror', name: 'M', x: 0, y: 0, angle: 135, length: 25, reflect: 100, tip: 2, sweeps: { tip: SB.sw(-5, 5) } }, SB.screen({ x: 0, y: 60, angle: 270 })])); const r = J.optimiseMany([['M', 'tip']], [{ target: 'Screen', key: 'tilt', goal: 'min' }]); return [r.improved && Math.abs(r.best[0]) < 1e-3, 'tip ' + r.best[0]]; });
    await inPage('bench: the Strehl ratio (the diffracted field each trace)', (J, SB) => { J.load(SB.bench('o', [SB.src({ width: 4 }), SB.lens({}), SB.screen({ x: 45, sweeps: { x: SB.sw(45, 56) } })])); const r = J.optimiseMany([['Screen', 'x']], [{ target: 'Screen', key: 'strehl', goal: 'max' }]); return [r.rawBest[0] > 0.9, 'Strehl ' + r.raw0[0].toFixed(4) + ' → ' + r.rawBest[0].toFixed(4)]; });
    await inPage('bench: stopped at once leaves the bench as it was', (J, SB) => { J.load(SB.bench('o', [SB.src({}), SB.lens({ sweeps: { x: SB.sw(-10, 10), y: SB.sw(-2, 2) } }), SB.screen({ x: 60 })])); const r = J.optimiseMany([['Lens', 'x'], ['Lens', 'y']], [{ target: 'Screen', key: 'rms', goal: 'min' }], { stop: () => true }); return [r.evals === 0 && !r.improved && J.byName('Lens').x === 0, r.evals + ' traces']; });
    await inPage('bench: a script’s mistakes said plainly', (J, SB) => { J.load(SB.focus(45)); const msgs = []; for (const [v, t] of [[[['Lens', 'x']], [{ target: 'Screen', key: 'rms', goal: 'min' }]], [[['Screen', 'x']], [{ target: 'Nope', key: 'rms', goal: 'min' }]], [[['Screen', 'x']], [{ target: 'Screen', key: 'nope', goal: 'min' }]], [[['Screen', 'x']], [{ target: 'Screen', key: 'efl', goal: 'min' }]]]) { try { J.optimiseMany(v, t); msgs.push('ran'); } catch (err) { msgs.push(err.message); } } return [msgs.every(m => m !== 'ran' && !/undefined|Cannot read/.test(m)), msgs.join(' | ')]; });
    await inPage('bench: the dialog’s run is one Undo step', async (J, SB) => { const wait = ms => new Promise(r => setTimeout(r, ms)); J.load(SB.focus(45)); await wait(100); const d = document, b = d.getElementById('btnOptimise'); b.disabled = false; b.click(); await wait(50); d.getElementById('optRun').click(); for (let i = 0; i < 100 && !/traces/.test(d.getElementById('optResult').textContent); i++) await wait(50); const x1 = J.byName('Screen').x; d.getElementById('optClose').click(); J.undo(); await wait(50); return [Math.abs(x1 - 50.655) < 0.05 && J.byName('Screen').x === 45, x1.toFixed(4) + ', then Undo: ' + J.byName('Screen').x]; });
    await inPage('exercises: the optimiser solves each it is offered for', async J => { const wait = ms => new Promise(r => setTimeout(r, ms)); const out = []; let ok = true; for (const id of J.exercises()) { J.exerciseStart(id); await wait(400); if (!J.exerciseOffersOptimiser(id)) continue; const t0 = performance.now(); J.exerciseOptimise(); let s = false; for (let i = 0; i < 80 && !(s = J.exerciseCheck() === true); i++) await wait(100); ok = ok && s; out.push(id + (s ? ' ' + Math.round(performance.now() - t0) + ' ms' : ' NOT SOLVED')); } J.exerciseLeave(); return [ok, out.join(', ')]; });
    await inPage('exercises: Undo after the optimiser puts the start back', async J => { const wait = ms => new Promise(r => setTimeout(r, ms)); J.exerciseStart('focus-a-camera'); await wait(400); const x0 = J.byName('Lens').x; J.exerciseOptimise(); for (let i = 0; i < 60 && !J.exerciseCheck(); i++) await wait(100); const x1 = J.byName('Lens').x; J.undo(); await wait(100); const x2 = J.byName('Lens').x, on = J.exerciseState() !== null; J.exerciseLeave(); return [x1 !== x0 && x2 === x0 && on, x0 + ' → ' + x1.toFixed(3) + ', Undo: ' + x2]; });
    await browser.close(); server.close();
  }
}
console.log(`\n${n - bad} of ${n} cases ok` + (bad ? `, ${bad} BAD` : ''));
process.exit(bad ? 1 : 0);
