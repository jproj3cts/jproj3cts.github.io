/* File › Export data's numbers (engines/data-export.js) gathered from the demo benches, as the page and Node gather them:
   readouts, screens' ray hits and field maps, beams, sweeps and studies, the bench; each column with its unit, the parts'
   settings with them. And a script's save(), in JavaScript and Python, in the script worker and on the page: what it
   asks for goes back with the run's end and nowhere else, and becomes the file asked for (core/datafiles.js), read back
   by numpy.load where Python has it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { engine, openFile } from '../../headless.mjs';

const DEMO = n => fileURLToPath(new URL('../../../demos/' + n + '.jekray', import.meta.url));
const DIR = fileURLToPath(new URL('../../../../assets/vendor/pyodide/314.0.7/', import.meta.url));
const E = await engine();
const DX = E.DX, DF = E.DF;
const S = await import('../../src/ui/scripts.js'), SC = await import('../../src/ui/script-calls.js'), SW = await import('../../src/page/script-worker.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jekray-dx-'));
const PY = (() => { try { execFileSync('python3', ['-I', '-c', 'import numpy, scipy.io, openpyxl'], { stdio: 'ignore' }); return true; } catch (err) { return false; } })();
const py = (code, ...files) => JSON.parse(execFileSync('python3', ['-I', '-c', code, ...files], { encoding: 'utf8', maxBuffer: 1 << 28 }));
const byName = (items, n) => items.find(i => i.name === n);
const colOf = (T, n) => T.cols.find(c => c.name === n);
const rowsOf = T => T.cols[0].values.map((_, i) => Object.fromEntries(T.cols.map(c => [c.name, c.values[i]])));

test('a Michelson: its two screens’ readouts, ray hits and field maps, its beams, its sweep, its parts', async () => {
  const B = await openFile(DEMO('michelson'));
  const items = B.data();
  assert.deepEqual(items.map(i => i.name), ['readouts', 'Output port hits', 'Output port field', 'Output port field along', 'Output port field up',
    'Input port hits', 'Input port field', 'Input port field along', 'Input port field up', 'beams', 'sweeps', 'parts', 'bench']);
  const R = rowsOf(byName(items, 'readouts'));
  const read = (part, what) => R.find(r => r.part === part && r.reading === what);
  assert.deepEqual([read('Output port', 'Rays hitting').value, read('Output port', 'RMS spot').unit, read('Output port', 'Power received').unit], [6, 'mm', '%']);
  // the same figures the panel and J.stats give
  const st = B.screen('Output port');
  assert.ok(Math.abs(read('Output port', 'RMS spot').value - st.rms) <= 1e-5 * st.rms && Math.abs(read('Output port', 'Power received').value - st.powerPct) < 1e-3);
  assert.ok(read('Output port', 'Beam radius (1/e²)').value > 0.9 && read('Output port', 'Strehl ratio').unit === '');
  assert.ok(R.every(r => typeof r.unit === 'string' && r.type === 'Screen' && r.tab === 'Bench 1'));
  // the hits: a row for each ray, every column with its unit
  const H = byName(items, 'Output port hits');
  assert.equal(H.cols[0].values.length, 6);
  for (const [n, u] of [['across', 'mm'], ['up', 'mm'], ['angle from the normal', '°'], ['power', '% of its source'], ['wavelength', 'nm'], ['optical path', 'mm']]) assert.equal(colOf(H, n).unit, u, n);
  assert.ok(colOf(H, 'wavelength').values.every(v => v === 633) && colOf(H, 'source').values.every(v => v === 'Laser'));
  const pw = colOf(H, 'power').values.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(pw - st.powerPct) < 1e-6, 'the hits’ shares add up to the screen’s');
  // the field map: square, its axes in mm, as the plot draws it
  const F = byName(items, 'Output port field'), U = byName(items, 'Output port field along');
  assert.deepEqual(F.shape, [256, 256]); assert.equal(U.unit, 'mm'); assert.equal(U.shape[0], 256);
  assert.ok(Math.max(...F.data) > 0 && U.data[0] < 0 && U.data[255] > 0);
  // beams: q and the radius at both ends, the waist and divergence in the medium
  const Bm = rowsOf(byName(items, 'beams'));
  assert.ok(Bm.length > 3 && Bm.every(b => b.wavelength === 633 && b['radius at the start'] > 0.9 && b['waist radius'] > 0.99 && b['waist radius'] < 1.01));
  const b0 = Bm.find(b => b.parent === -1);
  assert.ok(b0 && b0.source === 'Laser' && Math.abs(b0['divergence (half angle)'] - 1000 * 633e-6 / (Math.PI * 1)) < 1e-6, 'θ = λ / (π w0), in mrad');
  assert.ok(byName(items, 'beams').cols.every(c => c.unit !== undefined) && colOf(byName(items, 'beams'), 'q real').unit === 'mm');
  // the sweep on the moving mirror, and the parts with all their settings
  const Sw = rowsOf(byName(items, 'sweeps'));
  assert.deepEqual([Sw.length, Sw[0].part, Sw[0].parameter], [1, 'Moving mirror', 'x']);
  const P = rowsOf(byName(items, 'parts'));
  assert.equal(P.length, 6); assert.equal(JSON.parse(P.find(p => p.name === 'Laser').settings).wavelength, B.element('Laser').wavelength);
  assert.equal(byName(items, 'bench').value.elements.length, 6);
  // the counts the dialog shows
  assert.deepEqual(DX.dataCounts(), { readouts: 2, screens: 2, beams: Bm.length, sweeps: 1, bench: 6 });
});

test('RF: an antenna’s and a receiving horn’s readouts, its link budget, and its frequency sweep', async () => {
  const B = await openFile(DEMO('mm-wave-link'));
  const items = B.data(['readouts', 'sweeps']);
  const R = rowsOf(byName(items, 'readouts'));
  const G = R.find(r => r.part === 'Lens 1' && r.reading === 'Gain, horn and lens');
  assert.ok(G && G.unit === 'dBi' && Math.abs(G.value - B.antenna('Lens 1').Gdbi) < 1e-4, JSON.stringify(G));
  const P = R.find(r => r.part === 'Receiver' && r.reading === 'Power into its mode');
  assert.ok(P.unit === 'mW' && Math.abs(P.value - B.detector('Receiver').mw) < 1e-6 * P.value);
  assert.equal(R.find(r => r.part === 'Receiver' && r.reading === 'Saturated').note, 'no');
  assert.ok(R.find(r => r.reading === 'Link budget, horn to receiver').unit === 'dB');
  const F = byName(items, 'Receiver frequency sweep');
  assert.deepEqual(F.cols.map(c => c.name + ' ' + c.unit), ['frequency GHz', 'S21 dB', 'coupling ']);
  assert.equal(F.cols[0].values.length, B.rfSweep('Receiver').ghz.length);
});

test('a spectrometer’s readout; a bench with nothing to read gives no readouts table', async () => {
  const B = await openFile(DEMO('czerny-turner'));
  const R = rowsOf(byName(B.data(['readouts']), 'readouts')), sp = B.elements().find(e => e.type === 'spectrometer');
  const pk = R.find(r => r.part === sp.name && r.reading === 'Peak');
  assert.ok(pk && pk.unit === 'nm' && Math.abs(pk.value - B.spectrometer(sp.name).peak) < 1e-5 * pk.value, JSON.stringify(pk));   // (headless rounds to six figures)
  const E2 = await (await import('../../headless.mjs')).openBench({ format: 'jekray', version: 1, elements: [{ type: 'source', id: 's', name: 'S', x: 0, y: 0, angle: 0 }] });
  assert.deepEqual(E2.data(['readouts']), []);
});

test('the bench’s studies are kept for the export as they are run: sensitivity, Monte Carlo and the optimiser', async () => {
  await openFile(DEMO('michelson'));
  DX.keepStudy('tolerance', { target: 'Output port', metric: 'RMS spot', nominal: 0.8, dist: 'uniform', samples: [0.7, 0.8, 0.9] });
  DX.keepStudy('optimiser', { evals: 10, stopped: false, improved: true, startMerit: 1, bestMerit: 0.5, vars: [{ part: 'Moving mirror', path: 'x', start: 1, best: 2 }],
    terms: [{ target: 'Output port', metric: 'RMS spot', goal: 'min', start: 0.8, best: 0.4 }], history: [1, 0.7, 0.5], scan: [] });
  try {
    const items = DX.sweepsData().items;
    assert.deepEqual(items.map(i => i.name), ['sweeps', 'monte carlo', 'optimiser', 'optimiser merit']);
    assert.deepEqual(byName(items, 'monte carlo').cols[1].values, [0.7, 0.8, 0.9]);
    assert.deepEqual(rowsOf(byName(items, 'optimiser'))[1], { what: 'Output port: RMS spot (min)', 'at the start': 0.8, best: 0.4 });
    assert.equal(DX.dataCounts().sweeps, 3);
  } finally { DX.keepStudy('tolerance', null); DX.keepStudy('optimiser', null); }
});

test('Node’s exportData: every format, the context with the parts the numbers come from', async () => {
  const B = await openFile(DEMO('michelson'));
  for (const fmt of ['csv', 'json', 'xlsx', 'npz', 'mat']) {
    const bytes = await B.exportData(['readouts', 'beams'], fmt);
    fs.writeFileSync(path.join(TMP, 'm.' + fmt), bytes);
    if (fmt === 'mat') assert.match(Buffer.from(bytes.subarray(0, 60)).toString('latin1'), /^MATLAB 5\.0 MAT-file, Platform: JEKray, Created on: /);
    else if (fmt === 'json') { const J = JSON.parse(Buffer.from(bytes)); assert.deepEqual(Object.keys(J.tables), ['readouts', 'beams']); assert.ok(J.meta.parts['Output port'] && J.meta.parts.Laser); assert.match(J.meta.version, /^\d+\.\d+/); }
    else assert.equal(Buffer.from(bytes.subarray(0, 2)).toString(), 'PK');
  }
  if (PY) {
    const r = py(`import sys, json, zipfile, numpy as np, scipy.io as sio, openpyxl, pandas as pd
d = sys.argv[1]
n = np.load(d + '/m.npz')
m = sio.loadmat(d + '/m.mat', simplify_cells=True)
w = openpyxl.load_workbook(d + '/m.xlsx', read_only=True)
c = pd.read_csv(zipfile.ZipFile(d + '/m.csv').open('readouts.csv'))
print(json.dumps({'npz': sorted(set(k.split('/')[0] for k in n.files)), 'units': json.loads(str(n['meta']))['items']['beams']['columns'][4], 'mat': sorted(k for k in m if not k.startswith('__')),
  'w': m['beams']['units']['radius_at_the_start_mm'], 'sheets': w.sheetnames, 'csv': list(c.columns), 'n': len(c)}))`, TMP);
    assert.deepEqual(r.npz, ['beams', 'meta', 'readouts']); assert.deepEqual(r.units, { name: 'wavelength', unit: 'nm', key: 'wavelength_nm', type: 'num' });
    assert.deepEqual(r.mat, ['beams', 'meta', 'readouts']); assert.equal(r.w, 'mm');
    assert.deepEqual(r.sheets, ['About', 'readouts', 'beams']); assert.deepEqual(r.csv, ['part', 'type', 'tab', 'reading', 'value', 'unit', 'note']); assert.ok(r.n > 20);
  }
});

/* ---- a script's save(): collected as it runs, sent back with the run's end, made into files on the page ---- */
const BENCH = JSON.parse(fs.readFileSync(DEMO('michelson'), 'utf8'));
SW.scriptWorkerMain();
const handler = self.onmessage;
async function inWorker(code, lang = 'js') {
  const sent = [];
  self.postMessage = m => sent.push(structuredClone(m));
  await handler({ data: { t: 'run', id: 3, proj: JSON.stringify(BENCH), code, lang, py: DIR } });
  return { sent, done: sent.find(m => m.t === 'done') };
}
function onPage() { E.EL.loadProject(JSON.parse(JSON.stringify(BENCH))); const P = SC.scriptCalls(); P.trace(); const saves = []; return { J: S.makeJ(P, saves), saves }; }
const JS_SAVE = `const s = J.stats('Output port');
const rows = J.sweep('Moving mirror', 'x', J.range(0, 1, 4), () => ({ rms: J.stats('Output port').rms }));
save('spot', rows);
J.save('map', { sweep: rows, grid: [[1, 2, 3], [4, 5, 6]], ints: new Int32Array([7, -8]) }, 'npz', { run: 'first', operator: 'me' });
log('saved');
return s.rms;`;
const PY_SAVE = `import numpy as np
rows = J.sweep('Moving mirror', 'x', np.linspace(0, 1, 4), lambda x: {'rms': J.stats('Output port')['rms']})
save('spot', rows)
J.save('map', {'grid': np.arange(6, dtype=np.int64).reshape(2, 3), 'f': np.array([0.1, np.nan, 1/3]), 'ok': np.array([True, False])}, format='mat', meta={'run': 'first'})
save('table', {'x': np.array([1.0, 2.0]), 'y': [3, 4]}, 'xlsx')
result = len(rows)`;

test('save() in the script worker, JavaScript and Python: the calls come back with the run’s end, and only there', async () => {
  const W = await inWorker(JS_SAVE);
  assert.equal(W.done.R.error, null, W.done.R.error);
  assert.deepEqual(W.sent.map(m => m.t), ['log', 'done']);
  assert.ok(!W.sent.some(m => m.t !== 'done' && m.saves), 'nothing saved before the end');
  assert.deepEqual(W.done.saves.map(s => [s.name, s.format]), [['spot', 'csv'], ['map', 'npz']]);
  assert.deepEqual(W.done.saves[1].meta, { run: 'first', operator: 'me' });
  assert.ok(W.done.saves[1].data.ints instanceof Int32Array, 'a typed array comes back as one');
  assert.equal(W.done.saves[0].data.length, 4);
  const P = await inWorker(PY_SAVE, 'py');
  assert.equal(P.done.R.error, null, P.done.R.traceback);
  assert.deepEqual(P.done.saves.map(s => [s.name, s.format]), [['spot', 'csv'], ['map', 'mat'], ['table', 'xlsx']]);
  assert.deepEqual(P.done.saves[1].data.grid, { __ndarray__: [0, 1, 2, 3, 4, 5], shape: [2, 3], dtype: 'int64' }, 'NumPy’s array with its shape and type');
  assert.ok(Number.isNaN(P.done.saves[1].data.f.__ndarray__[1]), 'NaN kept');
  // a format it does not know, or nothing to save, stops the script with the reason
  const bad = await inWorker("save('x', [1], 'pdf')");
  assert.match(bad.done.R.error, /^save: the format is one of csv, json, xlsx, npz, mat, not "pdf"/);
  assert.deepEqual(bad.done.saves, []);
  const badPy = await inWorker("save('x', [1], format='docx')", 'py');
  assert.match(badPy.done.R.error, /BenchError: save: the format is one of/);
});

test('save() on the page collects the same; each call becomes the file asked for, read back by numpy.load', async () => {
  const { J, saves } = onPage();
  const R = await S.execScript(JS_SAVE, J, 'js', () => {});
  assert.equal(R.error, null);
  assert.deepEqual(saves.map(s => s.name), ['spot', 'map']);
  // what the script changed after save() is not in the file: it is kept as it was then
  const { J: J2, saves: s2 } = onPage();
  await S.execScript("const r = [{ a: 1 }]; save('t', r); r[0].a = 2;", J2, 'js', () => {});
  assert.equal(s2[0].data[0].a, 1);
  // rows as CSV: a plain .csv; several named things as NumPy: one .npz with an entry each, the context with them
  const csv = await S.scriptDataFile(saves[0], 'My script');
  assert.equal(csv.name, 'spot.csv');
  const text = Buffer.from(await csv.blob.arrayBuffer()).toString();
  assert.match(text, /^﻿x,rms\r\n0,/);
  const npz = await S.scriptDataFile(saves[1], 'My script');
  assert.equal(npz.name, 'map.npz');
  const f = path.join(TMP, 'map.npz');
  fs.writeFileSync(f, Buffer.from(await npz.blob.arrayBuffer()));
  // Python's save(): NumPy's arrays as they were, in a .mat
  const { J: J3, saves: s3 } = onPage();
  await (await import('../../src/ui/python.js')).pyReady(() => {}, DIR);
  const P = await S.execScript(PY_SAVE, J3, 'py', () => {});
  assert.equal(P.error, null, P.traceback);
  const mat = await S.scriptDataFile(s3[1], 'Py script');
  const fm = path.join(TMP, 'map.mat');
  fs.writeFileSync(fm, Buffer.from(await mat.blob.arrayBuffer()));
  const xl = await S.scriptDataFile(s3[2], 'Py script');
  assert.equal(xl.name, 'table.xlsx');
  if (!PY) return;
  const r = py(`import sys, json, numpy as np, scipy.io as sio
d = np.load(sys.argv[1])
m = sio.loadmat(sys.argv[2], simplify_cells=True)
meta = json.loads(str(d['meta']))
print(json.dumps({'files': d.files, 'grid': d['grid'].tolist(), 'ints': [str(d['ints'].dtype), d['ints'].tolist()], 'rms': d['sweep/rms'].tolist(), 'meta': [meta['script'], meta['run'], meta['operator'], meta['bench']],
  'mgrid': [str(m['grid'].dtype), m['grid'].tolist()], 'mf': [None if np.isnan(v) else v for v in m['f'].tolist()], 'mok': [bool(v) for v in m['ok']], 'mmeta': [m['meta']['script'], m['meta']['run']]}))`, f, fm);
  assert.deepEqual(r.files, ['meta', 'sweep/x', 'sweep/rms', 'grid', 'ints']);
  assert.deepEqual(r.grid, [[1, 2, 3], [4, 5, 6]]); assert.deepEqual(r.ints, ['int32', [7, -8]]); assert.equal(r.rms.length, 4);
  assert.deepEqual(r.meta, ['My script', 'first', 'me', 'Michelson interferometer']);
  assert.deepEqual(r.mgrid, ['int64', [[0, 1, 2], [3, 4, 5]]]); assert.deepEqual(r.mf.slice(0, 1), [0.1]); assert.equal(r.mf[1], null); assert.deepEqual(r.mok, [true, false]);
  assert.deepEqual(r.mmeta, ['Py script', 'first']);
});
