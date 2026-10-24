/* Python in Tools › Scripts: Pyodide (the vendored copy) run in Node against a demo bench, through the same J the
   page gives a script (ui/scripts.js makeJ over the page's calls, made here from the engine). The four Python
   examples give what the four JavaScript ones give; NumPy loads from our own folder; an error comes back as a
   traceback of the script's own lines; and fifty runs leave nothing behind. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { engine, openFile } from '../../headless.mjs';

const DIR = fileURLToPath(new URL('../../../../assets/vendor/pyodide/314.0.7/', import.meta.url));
const E = await engine();
const S = await import('../../src/ui/scripts.js'), PY = await import('../../src/ui/python.js');
await openFile(fileURLToPath(new URL('../../../demos/split-laser.jekray', import.meta.url)));

// window.JEKray's calls a script reaches, as the page makes them (ui/boot.js), from the engine
const byName = name => E.ST.project.elements.find(e => e.name === name);
const P = {
  byName,
  trace() { E.TRACE.setLastTraceKey(null); E.TRACE.traceScene(); },
  stats: name => E.SS.screenStats(byName(name)),
  detector(name) { const r = E.FF.detectorReading(byName(name)); return { mw: r.mw, field: r.field, pending: r.pending, V: r.V, snr: r.snr, ifMw: r.ifMw, mds: r.mds }; },
  getParam: (name, path) => E.PRM.getPath(byName(name), path),
  setParam: (name, path, v) => E.PRM.setParam(byName(name), path, v),
  paraxial: (name, nm) => E.TRACE.paraxial(byName(name), nm),
};
P.trace();
const J = S.makeJ(P);
const said = [];
const run = async (code, lang) => { const R = await S.execScript(code, J, lang, t => said.push(t)); return R; };
await PY.pyReady(t => said.push(t), DIR);
const example = (name, lang) => S.EXAMPLE_SCRIPTS.find(e => e[0] === name && e[2] === lang)[1];
/* the same numbers: equal, but for the last bits a different sum of the same values can leave */
function same(a, b, at = '') {
  if (typeof a === 'number' && typeof b === 'number') { assert.ok(a === b || (isNaN(a) && isNaN(b)) || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a)), at + ': ' + a + ' against ' + b); return; }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), at + ': the same keys');
    for (const k of Object.keys(a)) same(a[k], b[k], at + '.' + k);
    return;
  }
  assert.equal(a, b, at);
}
// what a JavaScript result is once shown: its JSON (undefined fields dropped, typed arrays as lists)
const asShown = v => PY.pyParse(PY.pyJson(v));

test('Python starts from the vendored files, with nothing fetched from anywhere else', () => {
  assert.match(said[0], /^Fetching Python \(13\.5 MB, once\)…$/);
  assert.ok(said.includes('Starting Python…'));
});

for (const name of ['Read a screen', 'Sweep a part to a table', 'Check a figure', 'Every part']) {
  test('the Python example “' + name + '” gives what the JavaScript one does', async () => {
    const js = await run(example(name, 'js'), 'js'), py = await run(example(name, 'py'), 'py');
    assert.equal(js.error, null, 'the JavaScript example runs');
    assert.equal(py.error, null, 'the Python example runs: ' + py.traceback);
    same(py.result, asShown(js.result), name);
    assert.equal(py.logs.length, js.logs.length, 'as many lines logged');
    if (name === 'Sweep a part to a table') { assert.equal(py.result.length, 21); assert.ok(py.result.every(r => isFinite(r.rms) && isFinite(r.powerPct))); }
    if (name === 'Read a screen') { assert.ok(py.result.powerPct > 0); assert.equal(py.logs[0], js.logs[0]); }
    if (name === 'Check a figure') assert.equal(py.logs[0], js.logs[0]);
  });
}

test('NumPy loads from the folder beside Pyodide, and its arrays come back as lists', async () => {
  const R = await run('import numpy as np\nx = np.linspace(0, 1, 5)\nlog(np.__version__)\nresult = {"x": x, "y": x ** 2}', 'py');
  assert.equal(R.error, null, R.traceback);
  assert.equal(R.logs[0], '2.4.6');
  assert.ok(said.some(t => /^Fetching NumPy \(3\.0 MB, once\)…$/.test(t)));
  // a dict of equal-length lists is rows
  assert.deepEqual(R.result, [0, 0.25, 0.5, 0.75, 1].map(x => ({ x, y: x * x })));
});

test('the result: what result is set to, else the last line’s value; print() and log() both write below', async () => {
  let R = await run('result = 3\n4', 'py');
  assert.equal(R.result, 3);
  R = await run('x = 2\nx * 21', 'py');
  assert.equal(R.result, 42);
  R = await run('print("a", 1)\nlog("b", 1 / 3, True, None, [1, 2])\nNone', 'py');
  assert.deepEqual(R.logs, ['a 1', 'b 0.333333 True None [1, 2]']);
  assert.equal(R.result, undefined, 'None shows nothing');
  R = await run('result = float("nan"), float("inf")', 'py');
  assert.ok(isNaN(R.result[0]) && R.result[1] === Infinity);
  // a fresh namespace for each run
  await run('leftover = 1', 'py');
  R = await run('leftover', 'py');
  assert.match(R.error, /^NameError: name 'leftover' is not defined/);
  // J.csv, J.range and J.set's chaining, as JavaScript's
  R = await run('J.csv([{"a": 1, "b": "x,y"}])', 'py');
  assert.equal(R.result, 'a,b\n1,"x,y"\n');
  R = await run('J.range(0, 1, 2.5)', 'py');
  assert.deepEqual(R.result, J.range(0, 1, 2.5));
  const x0 = J.get('Collimator A', 'x');
  R = await run(`J.set('Collimator A', 'x', ${x0 + 1}).get('Collimator A', 'x')`, 'py');
  assert.equal(R.result, x0 + 1);
  J.set('Collimator A', 'x', x0);
});

test('an error comes back as a traceback of the script’s own lines', async () => {
  let R = await run("a = 1\nJ.get('No such part', 'x')", 'py');
  assert.match(R.error, /^BenchError: No part is called "No such part"/);
  assert.match(R.traceback, /^Traceback \(most recent call last\):\n {2}File "<script>", line 2, in <module>\n {4}J\.get\('No such part', 'x'\)/);
  assert.doesNotMatch(R.traceback, /_call|_answer|_jekray/, 'the glue’s own frames are left out');
  R = await run('def f(x):\n    return 1 / x\n\nf(0)', 'py');
  assert.match(R.error, /^ZeroDivisionError: division by zero/);
  assert.match(R.traceback, /line 4, in <module>[\s\S]*line 2, in f\n {4}return 1 \/ x/);
  R = await run('x = (1,\n', 'py');
  assert.match(R.error, /^SyntaxError/);
  R = await run('return 1', 'py');
  assert.match(R.error, /'return' outside function \(in Python, set result to what to show, or end with it\)/);
  R = await run('import scipy', 'py');
  assert.equal(R.error, "ModuleNotFoundError: No module named 'scipy': only the standard library and NumPy are available on the bench");
  // a sweep that fails puts the part back
  const x0 = J.get('Collimator A', 'x');
  R = await run("def bad(x):\n    raise ValueError('on purpose')\nJ.sweep('Collimator A', 'x', [1, 2], bad)", 'py');
  assert.match(R.error, /^ValueError: on purpose/);
  assert.equal(J.get('Collimator A', 'x'), x0);
});

test('fifty runs leave nothing behind: Python’s objects and memory stay as they were', async () => {
  const code = example('Sweep a part to a table', 'py');
  for (let i = 0; i < 5; i++) await run(code, 'py');
  const before = PY.pyHeld();
  for (let i = 0; i < 50; i++) await run(code, 'py');
  const after = PY.pyHeld();
  assert.ok(after.objects - before.objects < 200, 'objects: ' + before.objects + ' → ' + after.objects);
  assert.equal(after.bytes, before.bytes, 'the WebAssembly memory did not grow');
});
