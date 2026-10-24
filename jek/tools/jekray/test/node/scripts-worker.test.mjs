/* Tools › Scripts in the background: the script worker's side (page/script-worker.js scriptWorkerMain) run here in Node
   over its own copy of a demo bench, as the page's worker runs it, against the page's J (ui/scripts.js makeJ over the
   calls window.JEKray gives, ui/script-calls.js). The four JavaScript and four Python examples give the same answers in
   the worker as on the page; log() lines are sent as they come; a bench the script changed comes back, and the page
   takes it up as one change that one Undo puts back; a sweep changes nothing; the page's own calls are kept for the
   page (select, showTab) or refused with a way round (sweepPlay). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { engine } from '../../headless.mjs';

const DIR = fileURLToPath(new URL('../../../../assets/vendor/pyodide/314.0.7/', import.meta.url));
const E = await engine();
const S = await import('../../src/ui/scripts.js'), SC = await import('../../src/ui/script-calls.js');
const SW = await import('../../src/page/script-worker.js'), TABS = await import('../../src/ui/tabs.js'), PR = await import('../../src/state/project.js');
const BENCH = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../../demos/split-laser.jekray', import.meta.url)), 'utf8'));
await (await import('../../src/ui/python.js')).pyReady(() => {}, DIR);      // Python on "the page" (here, from its folder)
const example = (name, lang) => S.EXAMPLE_SCRIPTS.find(e => e[0] === name && e[2] === lang)[1];

/* the page: the bench loaded and traced, J over window.JEKray's calls (the page-only ones as boot.js has them, less the drawing) */
function onPage(data = BENCH) {
  E.EL.loadProject(JSON.parse(JSON.stringify(data)));
  const P = SC.scriptCalls();
  P.trace();
  return S.makeJ(P);
}
/* the worker: its side as the page starts it, the bench sent as saved; every message it sends back, in order */
SW.scriptWorkerMain();
const handler = self.onmessage;
async function inWorker(code, lang = 'js', data = BENCH) {
  const sent = [];
  self.postMessage = m => sent.push(structuredClone(m));     // as a worker's postMessage copies what it is given
  await handler({ data: { t: 'run', id: 7, proj: JSON.stringify(data), code, lang, py: DIR } });
  const done = sent.filter(m => m.t === 'done');
  assert.equal(done.length, 1, 'one answer at the end');
  assert.ok(sent.every(m => m.id === 7), 'every message carries the run’s id');
  return { sent, done: done[0], R: done[0].R };
}
// the same numbers (a different order of the same sums can move the last bits)
function same(a, b, at = '') {
  if (typeof a === 'number' && typeof b === 'number') { assert.ok(a === b || (isNaN(a) && isNaN(b)) || Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a)), at + ': ' + a + ' against ' + b); return; }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), at + ': the same keys');
    for (const k of Object.keys(a)) same(a[k], b[k], at + '.' + k);
    return;
  }
  assert.equal(a, b, at);
}

for (const lang of ['js', 'py']) {
  for (const name of ['Read a screen', 'Sweep a part to a table', 'Check a figure', 'Every part']) {
    test('the ' + (lang === 'py' ? 'Python' : 'JavaScript') + ' example “' + name + '” gives in the worker what it gives on the page', async () => {
      const page = await S.execScript(example(name, lang), onPage(), lang, () => {}, undefined);
      const W = await inWorker(example(name, lang), lang);
      assert.equal(page.error, null, 'it runs on the page: ' + page.traceback);
      assert.equal(W.R.error, null, 'it runs in the worker: ' + W.R.traceback);
      same(W.R.result, page.result, name);
      assert.deepEqual(W.R.logs, page.logs, 'the same lines logged');
      assert.deepEqual(W.sent.filter(m => m.t === 'log').map(m => m.line), page.logs, 'each line sent as it was logged');
      assert.equal(W.done.bench, null, 'nothing on the bench changed (a sweep puts its part back)');
      assert.ok(W.R.ms >= 0);
    });
  }
}

test('lines are sent while the script runs, before it ends', async () => {
  const W = await inWorker("log('one'); await new Promise(r => setTimeout(r, 5)); log('two', 2 / 3); return 1;");
  assert.deepEqual(W.sent.map(m => m.t), ['log', 'log', 'done']);
  assert.equal(W.sent[1].line, 'two 0.666667');
  const P = await inWorker("print('a')\nlog('b', 1)\nprint('c', end='')\nprint()\nresult = 2", 'py');
  assert.deepEqual(P.sent.filter(m => m.t === 'log').map(m => m.line), ['a', 'b 1', 'c']);
  assert.deepEqual(P.R.logs, ['a', 'b 1', 'c']);
});

test('a bench the script changed comes back, and the page takes it up as one change that one Undo puts back', async () => {
  // the page's bench, sent as the page sends it (its parts' ids and all); the worker loads it into a project of its own,
  // which here (one process) is the same module's, so the page's is put back as it was before it is taken up
  onPage();
  const name = 'Collimator A', el = () => E.ST.project.elements.find(e => e.name === name), x0 = el().x, sent = JSON.stringify(E.EL.serialize());
  const W = await inWorker(`J.set(${JSON.stringify(name)}, 'x', ${x0 + 7}); J.set(${JSON.stringify(name)}, 'y', 3); return J.get(${JSON.stringify(name)}, 'x');`, 'js', JSON.parse(sent));
  assert.equal(W.R.result, x0 + 7);
  assert.ok(W.done.bench && !W.done.whole, 'the changed bench is sent back');
  E.EL.loadProject(JSON.parse(sent));
  assert.equal(el().x, x0, 'the page’s bench is untouched until it takes the change up');
  const view = JSON.stringify(E.ST.project.view), sel = el().id;
  PR.selectOne(sel);
  const before = PR.history.length;
  TABS.adoptBench(JSON.parse(W.done.bench), false);
  assert.equal(PR.history.length, before + 1, 'one checkpoint');
  assert.ok(el().x === x0 + 7 && el().y === 3, 'both changes applied');
  assert.equal(JSON.stringify(E.ST.project.view), view, 'the view kept');
  assert.equal(PR.selectedId, sel, 'the selection kept');
  TABS.undo();
  assert.ok(el().x === x0 && el().y !== 3, 'one Undo puts both back');
});

test('J.load in the worker sends back the bench it loaded, whole', async () => {
  const other = { format: 'jekray', version: 1, name: 'Other', elements: [{ type: 'lens', id: 'q', name: 'Q', x: 5, y: 0, angle: 0 }] };
  const W = await inWorker(`J.load(${JSON.stringify(other)}); return J.elements().map(e => e.name);`);
  assert.deepEqual(W.R.result, ['Q']);
  assert.ok(W.done.whole);
  assert.equal(JSON.parse(W.done.bench).name, 'Other');
});

test('the page’s own calls: select and showTab kept for the page, sweepPause too; sweepPlay refused with the way round', async () => {
  const two = JSON.parse(JSON.stringify(BENCH));
  two.benches = [{ id: 'b1', name: 'Bench 1' }, { id: 'b2', name: 'Second' }]; two.tab = 'b1';
  const first = two.elements.find(e => e.type === 'screen').name;
  let W = await inWorker(`const a = J.select(${JSON.stringify(first)}, 'plots'), b = J.select('No such part'); J.sweepPause(); const t = J.showTab('Second'); return [a, b, t, J.benches().find(x => x.on).name];`, 'js', two);
  assert.deepEqual(W.R.result, [true, false, 'b2', 'Second']);
  assert.deepEqual(W.done.ops, [['select', first, 'plots'], ['pause']]);
  assert.equal(W.done.tab, 'b2', 'the tab to show');
  assert.equal(W.done.bench, null, 'a tab shown is not a change to the bench');
  W = await inWorker("J.sweepPlay('Collimator A', 'x')");
  assert.match(W.R.error, /^sweepPlay runs on the page: .*Run on the page \(no Stop\)/);
  assert.equal(W.done.pageOnly, 'sweepPlay');
  W = await inWorker("J.sweepPlay('Collimator A', 'x')", 'py');
  assert.match(W.R.error, /^BenchError: sweepPlay runs on the page/);
});

test('the other calls a script is given answer in the worker as on the page', async () => {
  const code = `const out = {}, els = J.elements();
    const det = els.find(e => e.type === 'detector'), lens = els.find(e => e.type === 'lens'), scr = els.find(e => e.type === 'screen');
    out.paraxial = lens ? J.paraxial(lens.name, 1064) : null;
    out.typeLabel = J.typeLabel(els[0].name);
    out.benches = J.benches();
    out.metric = scr ? J.metric(scr.name, 'rms') : null;
    out.arrivals = det ? J.arrivals(det.name).length : null;
    out.detector = det ? J.detector(det.name).mw : null;
    out.diffraction = scr ? (J.diffraction(scr.name) || {}).peak ?? null : null;
    out.zmx = lens ? J.exportZmx([lens.name]).text.length : null;
    out.serialize = J.serialize().elements.length;
    return out;`;
  const page = await S.execScript(code, onPage(), 'js');
  const W = await inWorker(code);
  assert.equal(page.error, null, page.error);
  assert.equal(W.R.error, null, W.R.error);
  same(W.R.result, JSON.parse(JSON.stringify(page.result)), 'calls');
  assert.ok(W.R.result.serialize > 0 && W.R.result.typeLabel);
});

test('a result that cannot be posted as it is goes as JSON would show it, NaN kept', async () => {
  const W = await inWorker('return { f() {}, n: NaN, a: [1, () => 2], J };');
  assert.equal(W.R.error, null);
  assert.ok(isNaN(W.R.result.n) && !('f' in W.R.result));
  assert.deepEqual(W.R.result.a, [1, null]);
  assert.deepEqual(SW.scriptPlain({ x: 1n, d: [Symbol('s')] }), { x: '1', d: [null] });
});

test('a script that fails still sends back what it changed before failing, as on the page', async () => {
  const W = await inWorker("J.set('Collimator A', 'x', 1); throw new Error('on purpose');");
  assert.equal(W.R.error, 'on purpose');
  assert.ok(W.done.bench);
});

test('the RF and lens-design calls answer in the worker as on the page', async () => {
  const demo = f => JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../../demos/' + f, import.meta.url)), 'utf8'));
  for (const [file, code] of [
    ['rf-24ghz-lens-antenna.jekray', "const A = J.lensAntenna('Lens'); return { G: A.Gdbi, hpbw: A.hpbw, P: J.asmPrescription('24 GHz lens antenna').surfaces.length, efl: J.asmEfl('24 GHz lens antenna') };"],
    ['mm-wave-link.jekray', "const S = J.rfSweep('Receiver'), L = J.linkBudget('Receiver'); return { S: JSON.parse(JSON.stringify(S)), L: JSON.parse(JSON.stringify(L)) };"],
  ]) {
    onPage(demo(file));
    const data = JSON.parse(JSON.stringify(E.EL.serialize()));
    const page = await S.execScript(code, onPage(data), 'js'), W = await inWorker(code, 'js', data);
    assert.equal(page.error, null, file + ': ' + page.error);
    assert.equal(W.R.error, null, file + ': ' + W.R.error);
    same(W.R.result, page.result, file);
  }
});
