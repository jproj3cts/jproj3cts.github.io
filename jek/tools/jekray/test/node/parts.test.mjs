/* The parts registry: every part makes an element its own norm accepts and leaves alone, every
   picker key reaches a part, and the tables the page derives from the parts are whole. The
   stand-ins for the page are as in engines.test.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/core/constants.js';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { PARTS, PART_ORDER, TYPE_LABEL, FREE_PARTS, FREE_GROUPS, PART_BY_KEY, pickerRows } = await import('../../src/parts/registry.js');
const { RF } = await import('../../src/parts/rf.js');
const { PART_UI } = await import('../../src/ui/parts/registry.js');
const { makeElement, normElement, loadProject, demoProject } = await import('../../src/state/elements.js');
const { PALETTES, PART_GROUPS } = await import('../../src/ui/experimental.js');

const strip = el => { const o = JSON.parse(JSON.stringify(el)); delete o.id; delete o.name; delete o.sweeps; return o; };
test('every part has a type that matches its key, and the labelled ones are the guide\'s', () => {
  for (const [t, P] of Object.entries(PARTS)) { assert.equal(P.type, t); assert.equal(typeof P.norm, 'function', t + ' has norm'); }
  for (const t of PART_ORDER) { assert.ok(PARTS[t], t); assert.equal(typeof PARTS[t].label, 'string', t + ' has a label'); assert.ok(PARTS[t].guide && PARTS[t].guide.what, t + ' has its guide'); }
  assert.deepEqual(Object.keys(TYPE_LABEL), PART_ORDER);
});
test('every picker key makes an element, and making then normalising again changes nothing', () => {
  demoProject();
  const keys = [...pickerRows(FREE_PARTS).map(r => r[0]), ...PALETTES.fibre.map(r => r[0]), ...pickerRows([RF]).map(r => r[0])];
  assert.ok(keys.length > 50);
  for (const k of keys) {
    const el = makeElement(k, 10, 20);
    assert.ok(el && el.type, k + ' makes an element');
    assert.equal(el.x, 10); assert.equal(el.y, 20);
    const again = normElement(JSON.parse(JSON.stringify(el)));
    assert.deepEqual(strip(again), strip(el), k + ' is stable under norm');
  }
  assert.equal(makeElement('no-such-part', 0, 0), undefined);
});
test('the keys map: lens presets are lenses, the fibre palette is fibre components, the chopper is electronics', () => {
  for (const k of ['lens', 'asphere', 'diffractive', 'cylinder', 'axicon']) assert.equal(PART_BY_KEY[k], PARTS.lens);
  for (const k of ['laser', 'coupler', 'splitter', 'combiner', 'led', 'bpd', 'soa', 'pd', 'thru']) assert.equal(PART_BY_KEY[k], PARTS.fcomp);
  assert.equal(makeElement('elec:chopper', 0, 0).type, 'chopper');
  assert.equal(makeElement('splitter', 0, 0).kind, 'split'); assert.equal(makeElement('combiner', 0, 0).combine, true);
  assert.equal(makeElement('rf:horn', 0, 0).type, 'source'); assert.ok(makeElement('rf:horn', 0, 0).mmw);
});
test('the palette and rail tables come from the parts and cover each other', () => {
  const picked = new Set(PALETTES.free.map(r => r[0])), grouped = new Set(FREE_GROUPS.flatMap(([, ks]) => ks));
  assert.deepEqual([...picked].sort(), [...grouped].sort());
  assert.deepEqual(PART_GROUPS.free, FREE_GROUPS);
  assert.deepEqual(PALETTES.rf.map(r => r[0]).sort(), RF.groups.flatMap(([, ks]) => ks).sort());
  for (const k of picked) assert.ok(k === 'elec:chopper' || PART_BY_KEY[k], k + ' has a part');
});
test('an unknown type normalises to nothing, a known one to its defaults', () => {
  assert.equal(normElement({ type: 'no-such-type' }), null);
  const m = normElement({ type: 'mirror' });
  assert.equal(m.length, 25); assert.equal(m.reflect, 100); assert.equal(m.R, null);
  assert.equal(normElement({ type: 'mirror', reflect: 150 }).reflect, 100);
});
test('every part has its page side: drawn, picked and edited', () => {
  for (const t of Object.keys(PARTS)) {
    const U = PART_UI[t];
    assert.ok(U, t + ' has a ui/parts module');
    for (const k of ['draw', 'hit', 'panel']) assert.equal(typeof U[k], 'function', t + '.' + k);
    assert.ok(t === 'draw' || Number.isInteger(U.rank), t + ' has a pick rank');
  }
  assert.deepEqual(Object.keys(PART_UI).sort(), Object.keys(PARTS).sort());
});
