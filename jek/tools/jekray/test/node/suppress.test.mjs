/* A part suppressed (right-click › Suppress, as a CAD feature is): out of the bench and every engine until it is
   unsuppressed. A mirror suppressed lets the beam go straight on; a fibre component suppressed leaves the network as
   it would be with the component and its fibres taken away; a circuit part the same for the circuit; the trace's key
   changes with it. The file keeps the part where it stood, its field and the fibres plugged into it exactly, so that
   opening it again, or unsuppressing it, gives the bench back as it was. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { engine, openBench } from '../../headless.mjs';

const E = await engine();
const ST = E.ST, EL = E.EL, TR = E.TRACE;
const FIBRE = await import('../../src/engines/fibre.js'), ELEC = await import('../../src/engines/elec.js');
// (its fibres given ids, which a file without them gets afresh each time it is opened)
const demo = name => { const d = JSON.parse(fs.readFileSync(new URL('../../../demos/' + name, import.meta.url), 'utf8')); (d.fibres || []).forEach((F, i) => { F.id = F.id || 'f' + i; }); return d; };
const file = () => { const d = EL.serialize(); delete d.saved; return JSON.parse(JSON.stringify(d)); };
const byName = name => ST.allParts().find(e => e.name === name);
const traced = () => { TR.setLastTraceKey(null); TR.traceScene(); return TR.lastTrace; };

// a beam along +x onto a fold mirror at 45 degrees, up to a screen above it; a screen straight on past the mirror
const FOLD = { format: 'jekray', version: 1, name: 'Fold', elements: [
  { type: 'source', id: 'src', name: 'Laser', x: -60, y: 0, angle: 0, wavelength: 633, width: 2, rays: 5 },
  { type: 'mirror', id: 'm', name: 'Fold mirror', x: 0, y: 0, angle: 135, length: 25 },
  { type: 'screen', id: 'up', name: 'Above', x: 0, y: 40, angle: -90, length: 20 },
  { type: 'screen', id: 'on', name: 'Straight on', x: 50, y: 0, angle: 180, length: 20 }] };

test('a mirror suppressed: the beam goes straight on; the trace key changes, and unsuppressed all is as it was', async () => {
  const B = await openBench(FOLD);
  const hits = (b, n) => (b.screen(n) || { count: 0 }).count;
  B.trace();
  const up0 = hits(B, 'Above'), on0 = hits(B, 'Straight on'), key0 = TR.traceKeyNow();
  assert.ok(up0 > 0 && !on0, 'folded up first: ' + up0 + ', ' + on0);
  B.suppress('Fold mirror');
  assert.ok(!ST.project.elements.some(e => e.name === 'Fold mirror') && byName('Fold mirror').suppressed === true, 'kept apart, flagged');
  assert.notEqual(TR.traceKeyNow(), key0, 'suppressing is no cosmetic change: the trace is done again');
  B.trace();
  assert.ok(!hits(B, 'Above') && hits(B, 'Straight on') === up0, 'straight on: ' + hits(B, 'Above') + ', ' + hits(B, 'Straight on'));
  // as if it were not there at all
  const rays = () => JSON.stringify(TR.lastTrace.rays.map(r => Array.from(r.pts)));
  const gone = await openBench(Object.assign({}, FOLD, { elements: FOLD.elements.filter(e => e.id !== 'm') }));
  gone.trace();
  const rays0 = rays();
  const Bs = await openBench(FOLD); Bs.suppress('Fold mirror'); Bs.trace();
  assert.equal(rays(), rays0, 'the rays are those of a bench without it');
  Bs.suppress('Fold mirror', false); Bs.trace();
  assert.equal(hits(Bs, 'Above'), up0, 'unsuppressed, it folds the beam again');
  assert.equal(TR.traceKeyNow(), key0.replace(/^\d+/, String(TR.loadGen)), 'and the key is as it was');
});

test('a fibre component suppressed: the network is as it would be without it and its fibres; the file keeps them as they were', () => {
  const D = demo('fibre-amplifier.jekray');
  const pdIn = () => Object.fromEntries(['Filtered', 'Unfiltered'].map(n => { const net = FIBRE.fibreNetCached(), P = ST.project.elements.find(e => e.name === n); return [n, FIBRE.netPower(net.inn.get(FIBRE.pkey(P.id, 0)), net.keys)]; }));
  EL.loadProject(structuredClone(D)); traced();
  const on = pdIn();
  assert.ok(on.Filtered > 0 && on.Unfiltered > 0, JSON.stringify(on));
  const before = file();
  ST.setSuppressed([byName('Tap, 50:50')], true); traced();
  assert.equal(ST.project.fibres.length, D.fibres.length - 3, 'the three fibres plugged into it wait');
  assert.equal(ST.project.parked.length, 3);
  const sup = pdIn();
  // the same bench with the tap and its fibres taken away
  const cut = structuredClone(D);
  cut.elements = cut.elements.filter(e => e.name !== 'Tap, 50:50');
  cut.fibres = cut.fibres.filter(F => F.a[0] !== 'Tap, 50:50' && F.b[0] !== 'Tap, 50:50');
  EL.loadProject(cut); traced();
  assert.deepEqual(sup, pdIn(), 'suppressed is as taken away');
  assert.ok(!sup.Filtered && !sup.Unfiltered, 'nothing reaches the detectors past it: ' + JSON.stringify(sup));
  // saved, opened again, unsuppressed: as it was, fibres and all
  EL.loadProject(structuredClone(D)); ST.setSuppressed([byName('Tap, 50:50')], true);
  const saved = file();
  assert.equal(saved.elements.length, D.elements.length, 'the file has every part');
  assert.deepEqual(saved.elements.map(e => e.id), before.elements.map(e => e.id), 'in its place among them');
  assert.equal(saved.elements.find(e => e.name === 'Tap, 50:50').suppressed, true);
  assert.deepEqual(saved.fibres, before.fibres, 'and its fibres exactly as they were');
  EL.loadProject(JSON.parse(JSON.stringify(saved))); traced();
  assert.deepEqual(pdIn(), sup, 'opened again, still suppressed');
  assert.deepEqual(file(), saved, 'and saved again, the same file');
  ST.setSuppressed([byName('Tap, 50:50')], false); traced();
  assert.deepEqual(file(), before, 'unsuppressed: the bench as it was');
  assert.deepEqual(pdIn(), on, 'and the light as it was');
});

test('a fibre plugged into the port a suppressed part left open keeps it; the one that waited goes when it comes back', () => {
  const D = demo('fibre-amplifier.jekray');
  EL.loadProject(structuredClone(D));
  ST.setSuppressed([byName('EDFA')], true);
  // the laser's port is free now: plugged straight into the tap
  ST.project.fibres.push({ id: 'new', a: ['Laser, 1545 nm', 0], b: ['Tap, 50:50', 0], len: 1, loss: 0.2 });
  ST.setSuppressed([byName('EDFA')], false);
  assert.ok(ST.project.fibres.some(F => F.id === 'new'), 'the new fibre stays');
  assert.ok(!ST.project.fibres.some(F => F.a[0] === 'Laser, 1545 nm' && F.b[0] === 'EDFA'), 'the laser-to-amplifier fibre, its port taken, goes');
  assert.ok(ST.project.fibres.some(F => F.a[0] === 'EDFA' && F.b[0] === 'Tap, 50:50') === false, 'the amplifier-to-tap one too: the tap’s port is taken');
  assert.equal(ST.project.parked.length, 0);
  // a part deleted while a fibre waits on it: the fibre goes with it
  EL.loadProject(structuredClone(D));
  ST.setSuppressed([byName('EDFA')], true);
  ST.dropParts(new Set(['Laser, 1545 nm']));
  ST.setSuppressed([byName('EDFA')], false);
  assert.ok(!ST.project.fibres.some(F => F.a[0] === 'Laser, 1545 nm' || F.b[0] === 'Laser, 1545 nm'));
  assert.ok(ST.project.fibres.some(F => F.a[0] === 'EDFA'), 'the other came back');
});

test('a circuit part suppressed: the circuit is as it would be without it and its wires', () => {
  const D = demo('lockin-absorption.jekray');
  const scope = () => { const S = ST.project.elements.find(e => e.name === 'Scope'); return [0, 1].map(i => { const s = ELEC.inputOf(S, i); return s ? JSON.stringify(s, (k, v) => typeof v === 'number' ? +v.toPrecision(10) : v) : null; }); };
  EL.loadProject(structuredClone(D)); traced();
  const on = scope();
  assert.ok(on[0] && on[1], 'the scope reads the sample and the sync');
  ST.setSuppressed([byName('Sync')], true); traced();
  const sup = scope();
  assert.notDeepEqual(sup, on);
  const cut = structuredClone(D);
  cut.elements = cut.elements.filter(e => e.id !== 'node');
  cut.fibres = cut.fibres.filter(F => F.a[0] !== 'node' && F.b[0] !== 'node');
  EL.loadProject(cut); traced();
  assert.deepEqual(sup, scope(), 'suppressed is as taken away');
  // a detector suppressed: neither the light it caught nor its signal is there; the light goes on past it
  EL.loadProject(structuredClone(D)); ST.setSuppressed([byName('Sample detector')], true); traced();
  assert.equal(scope()[0], null, 'nothing on the scope’s first input');
  assert.ok(!TR.lastTrace.screens.pds, 'the trace has no screen for it');
});

test('a part suppressed in the file: its field kept, an old file loads with none, the guide and the trace worker see the same', () => {
  const D = structuredClone(FOLD);
  D.elements[1].suppressed = true;
  EL.loadProject(structuredClone(D));
  assert.deepEqual(ST.project.elements.map(e => e.id), ['src', 'up', 'on']);
  assert.deepEqual(ST.project.suppressed.map(e => e.id), ['m']);
  assert.ok(!('_at' in JSON.parse(JSON.stringify(ST.project.suppressed[0]))), 'where it stood is never saved');
  const key = TR.traceKeyNow().replace(/^\d+\|/, ''), T1 = JSON.stringify(traced().rays.map(r => Array.from(r.pts)));
  // what the workers are sent (page/workers.js fwProject, the script worker) is the file: loaded there, the same bench
  EL.loadProject(JSON.parse(JSON.stringify(EL.serialize())));
  assert.equal(TR.traceKeyNow().replace(/^\d+\|/, ''), key);
  assert.equal(JSON.stringify(traced().rays.map(r => Array.from(r.pts))), T1);
  // normalised: kept only when true
  assert.equal(EL.normElement({ type: 'mirror', name: 'M', suppressed: true }).suppressed, true);
  assert.ok(!('suppressed' in EL.normElement({ type: 'mirror', name: 'M', suppressed: 'yes' })));
  assert.ok(!('suppressed' in EL.normElement({ type: 'mirror', name: 'M' })));
});

test('a script suppresses with J.set or J.suppress, in the script worker as on the page; the page takes it up as one step that Undo puts back', async () => {
  const S = await import('../../src/ui/scripts.js'), SC = await import('../../src/ui/script-calls.js');
  const SW = await import('../../src/page/script-worker.js'), TABS = await import('../../src/ui/tabs.js');
  const BENCH = demo('split-laser.jekray');
  // on the page
  EL.loadProject(structuredClone(BENCH));
  const J = S.makeJ(SC.scriptCalls());
  J.set('Collimator A', { suppressed: true });
  assert.ok(!ST.project.elements.some(e => e.name === 'Collimator A') && byName('Collimator A').suppressed, 'J.set suppresses');
  assert.equal(J.element('Collimator A').suppressed, true, 'J.element still finds it');
  assert.equal(J.suppress('Launch B'), true);
  assert.ok(ST.project.parked.length > 0, 'the fibre into the launch waits');
  J.set('Collimator A', { suppressed: false }); J.suppress('Launch B', false);
  assert.equal(ST.project.suppressed.length, 0);
  // in the worker
  SW.scriptWorkerMain();
  const sent = [];
  self.postMessage = m => sent.push(structuredClone(m));
  EL.loadProject(structuredClone(BENCH));
  const page = JSON.stringify(EL.serialize());
  await self.onmessage({ data: { t: 'run', id: 1, proj: page, code: "J.suppress('Launch B'); J.set('Collimator A', { suppressed: true }); return J.elements().length;", lang: 'js' } });
  const done = sent.find(m => m.t === 'done');
  assert.equal(done.R.result, BENCH.elements.length - 2, 'J.elements lists the parts in play');
  assert.ok(done.bench, 'the bench comes back');
  EL.loadProject(JSON.parse(page));
  const det = () => JSON.stringify(TR.lastTrace.screens[ST.project.elements.find(e => e.type === 'detector').id] || []);
  const before = JSON.stringify(EL.serialize().elements);
  traced();
  const det0 = det();
  TABS.adoptBench(JSON.parse(done.bench), false);
  assert.deepEqual(ST.project.suppressed.map(e => e.name).sort(), ['Collimator A', 'Launch B']);
  assert.equal(ST.allFibres().length, BENCH.fibres.length, 'every fibre kept');
  traced();
  assert.notEqual(det(), det0, 'the light changed');
  assert.match(TABS.undoWords(), /^suppress 2 parts$/);
  TABS.undo();
  assert.equal(ST.project.suppressed.length, 0, 'one Undo brings both back');
  assert.equal(JSON.stringify(EL.serialize().elements), before, 'as they were');
});
